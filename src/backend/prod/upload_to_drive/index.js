// Uploads existing survey responses from S3 to Google Drive folder

import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { google } from 'googleapis';
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import pLimit from 'p-limit';

// Step 1: Set up
// env vars
// AWS_LAMBDA_FUNCTION_NAME is pre-defined by AWS
const IS_PROD = !!process.env.AWS_LAMBDA_FUNCTION_NAME;

const PROD_FOLDER_ID = process.env.PROD_FOLDER_ID;      // Set in AWS Lambda env vars
const TEST_FOLDER_ID = process.env.TEST_FOLDER_ID;      // Set in local .env
const FOLDER_ID = IS_PROD ? PROD_FOLDER_ID : TEST_FOLDER_ID;

// S3 configuration
const S3_BUCKET = process.env.S3_BUCKET_NAME;
const S3_KEY = 'survey-responses-master.json';
// AWS_REGION is pre-defined by AWS
const s3 = new S3Client({ region: process.env.AWS_REGION });

// Drive authorization
const authClient = await authorize(['https://www.googleapis.com/auth/drive']);
let drive = null;

// limit the number of concurrent uploads
const limit = pLimit(5);

export const handler = async () => {
    // Step 2: Fetch the existing master file from S3
    console.log('Fetching existing master file from S3...');
    let masterData = [];

    try {
        const response = await s3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: S3_KEY }));
        const bodyContents = await response.Body.transformToString();
        masterData = JSON.parse(bodyContents);
    } catch (e) {
        if (e.name !== 'NoSuchKey') {
            console.error('Error fetching S3 data:', e);
            return {
                message: 'Error fetching survey responses from S3',
                processed: 0,
                successful: 0
            };
        } else {
            console.log('No survey responses found in S3');
            return {
                message: 'No survey responses found in S3',
                processed: 0,
                successful: 0
            }
        }
    }

    // Step 3: Filter out already uploaded entries
    const entriesToUpload = masterData.filter(item => !item.uploadedToDrive);
    console.log(`Found ${entriesToUpload.length} new entries to upload.`);

    // Step 4: Upload the entries to Google Drive
    const promises = entriesToUpload.map((entry) => {
        return limit(async () => {
            try {
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const fileName = `survey_response_${entry.userId || 'unknown'}_${timestamp}.json`;
                const fileId = await uploadJsonToDrive(authClient, FOLDER_ID, fileName, {
                    timestamp: entry.timestamp,
                    data: entry.data
                });

                if (fileId) {
                    entry.uploadedToDrive = true;
                }
            } catch (e) {
                console.error(`Error uploading entry ${entry.id} to Drive:`, e);
            }
        });
    });

    // resolve the promises concurrently since they're independent of each other
    await Promise.all(promises);

    // Step 5: Update the master file in S3 with the new upload statuses
    await s3.send(new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: S3_KEY,
        ContentType: 'application/json',
        Body: JSON.stringify(masterData),
    }));

    return {
        message: 'Synced S3 bucket contents to Google Drive',
        processed: entriesToUpload.length,
        successful: entriesToUpload.filter(item => item.uploadedToDrive).length
    };
};

/**
 * Retrieves the service account credentials for Google Drive API.
 * @returns {Promise<object>} The credentials object.
 */
async function getCredentials() {
    if (!process.env.AWS_LAMBDA_FUNCTION_NAME) {
        console.log("🛠️ Running locally: Loading JSON from disk");
        const filePath = join(process.cwd(), 'private/service_account.json');
        const fileContent = await readFile(filePath, 'utf8');
        return JSON.parse(fileContent);
    }

    console.log("☁️ Running in Lambda: Fetching from Secrets Manager");
    const client = new SecretsManagerClient({ region: process.env.AWS_REGION });
    const command = new GetSecretValueCommand({ SecretId: "GoogleServiceAccount" });

    const response = await client.send(command);
    return JSON.parse(response.SecretString);
}

/**
 * Authorizes the service account to access Google Drive APIs.
 * @param {string[]} scopes - The scopes to request access to.
 * @returns {Promise<object>} An authorized Google Auth client.
 */
async function authorize(scopes) {
    try {
        const auth = new google.auth.GoogleAuth({
            credentials: await getCredentials(),
            scopes,
        });

        const authClient = await auth.getClient();
        console.log("Service account authenticated successfully.");
        return authClient;
    } catch (e) {
        console.error("Authentication failed. Please check that 'service_account.json' exists and is valid.");
        throw e;
    }
}

/**
 * Uploads a JavaScript object as a JSON file to a specific Google Drive location.
 * @param {object} authClient An authorized auth client.
 * @param {string} folderId The ID of the folder to upload the file to.
 * @param {string} fileName The name for the new file.
 * @param {object} data The JavaScript object to upload as JSON.
 * @returns {Promise<string> | null} The ID of the uploaded file or null if an error occurred.
 */
async function uploadJsonToDrive(authClient, folderId, fileName, data) {
    if (drive == null) {
        drive = google.drive({ version: 'v3', auth: authClient });
    }

    // pretty print the JSON data
    const jsonString = JSON.stringify(data, null, 4);

    try {
        console.log(`Uploading '${fileName}' to Google Drive...`);
        const file = await drive.files.create({
            requestBody: {
                name: fileName,
                parents: [folderId]
            },
            media: {
                mimeType: 'application/json',
                body: jsonString,
            },
            // Essential for uploading to shared Drives
            supportsAllDrives: true,
        });

        console.log(`📁 Successfully uploaded file to ${IS_PROD ? 'production' : 'test'} folder.`);
        console.log(`File Name: ${file.data.name}`);
        console.log(`File ID: ${file.data.id}`);
        return file.data.id;
    } catch (e) {
        console.error(`An error occurred during upload: ${e}`);
        return null;
    }
}
