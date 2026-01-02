// driveUploader.js
// This script authenticates with the Google Drive API using a service account
// and uploads a JSON object to a specific folder within a Shared Drive.

import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { google } from 'googleapis';
// import { Readable } from 'stream';
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import pLimit from 'p-limit';

// ID of the Google Shared Drive (or a folder within it) you want to upload files to.
// Find this in the URL: .../drive/folders/THIS_IS_THE_ID
const IS_PRODUCTION = !!process.env.AWS_LAMBDA_FUNCTION_NAME;

const PROD_FOLDER_ID = process.env.PROD_FOLDER_ID; // Set in AWS Lambda Console
const TEST_FOLDER_ID = process.env.TEST_FOLDER_ID; // Set in local .env
const FOLDER_ID = IS_PRODUCTION ? PROD_FOLDER_ID : TEST_FOLDER_ID;

// The scope determines the level of access. 'drive' allows full access.
const SCOPES = ['https://www.googleapis.com/auth/drive'];

const S3_BUCKET = process.env.S3_BUCKET_NAME;
const S3_KEY = 'survey-responses-master.json';
const s3 = new S3Client({ region: process.env.AWS_REGION || "us-east-2" });

const authClient = await authorize();
const limit = pLimit(5);
let drive = null;

export const handler = async () => {
    console.log('Fetching existing master file from S3...');
    let masterData = [];
    const response = await s3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: S3_KEY }));
    const bodyContents = await response.Body.transformToString();
    masterData = JSON.parse(bodyContents);
    // try {

    // } catch (e) {
    //     if (e.name !== 'NoSuchKey') {
    //         console.error('Error fetching S3 data:', e);
    //     }
    // }

    const entriesToUpload = masterData.filter(item => !item.uploadedToDrive);
    console.log(`Found ${entriesToUpload.length} new entries to upload.`);
    const promises = entriesToUpload.map((entry) => {
        return limit(async () => {
            try {
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const fileName = `survey_response_${entry.userId || 'unknown'}_${timestamp}.json`;
                const fileId = await uploadJsonToDrive(authClient, fileName, {
                    timestamp: entry.timestamp,
                    data: entry.data
                });

                if (fileId) {
                    entry.uploadedToDrive = true;
                }
            } catch (e) {
                console.log('Error uploading entry to Drive:', entry.id);
            }
        });
    });

    await Promise.all(promises);

    // Update the master file in S3 with the new upload statuses
    await s3.send(new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: S3_KEY,
        Body: JSON.stringify(masterData, null, 4),
        ContentType: 'application/json'
    }));

    return {
        message: 'Synced S3 bucket contents to Google Drive',
        processed: entriesToUpload.length,
        successful: entriesToUpload.filter(item => item.uploadedToDrive).length
    };
};

async function getCredentials() {
    // Check if running in Lambda or Local
    if (!process.env.AWS_LAMBDA_FUNCTION_NAME) {
        console.log("🛠️ Running locally: Loading JSON from disk");
        const filePath = join(process.cwd(), 'private/service_account.json');
        const fileContent = await readFile(filePath, 'utf8');
        return JSON.parse(fileContent);
    }

    console.log("☁️ Running in Lambda: Fetching from Secrets Manager");
    const client = new SecretsManagerClient({ region: "us-east-2" });
    const command = new GetSecretValueCommand({ SecretId: "GoogleServiceAccount" });

    const response = await client.send(command);
    return JSON.parse(response.SecretString);
}

/**
 * Authorizes the service account to access Google Drive APIs.
 * @returns {Promise<object>} An authorized Google Auth client.
 */
async function authorize() {
    try {
        const auth = new google.auth.GoogleAuth({
            credentials: await getCredentials(),
            scopes: SCOPES,
        });
        const authClient = await auth.getClient();
        console.log("Service account authenticated successfully.");
        return authClient;
    } catch (err) {
        console.error("Authentication failed. Please check that 'service_account.json' exists and is valid.");
        throw err;
    }
}

/**
 * Uploads a JavaScript object as a JSON file to a specific Google Drive location.
 * @param {object} authClient An authorized auth client.
 * @param {string} fileName The name for the new file.
 * @param {object} data The JavaScript object to upload as JSON.
 * @returns {Promise<string> | null} The ID of the uploaded file or null if an error occurred.
 */
async function uploadJsonToDrive(authClient, fileName, data) {
    if (drive == null) {
        drive = google.drive({ version: 'v3', auth: authClient });
    }

    const jsonString = JSON.stringify(data, null, 4);

    const fileMetadata = {
        name: fileName,
    };

    if (FOLDER_ID !== '') {
        fileMetadata.parents = [FOLDER_ID];
    }

    const media = {
        mimeType: 'application/json',
        body: jsonString,
    };

    try {
        console.log(`Uploading '${fileName}' to Google Drive...`);
        const file = await drive.files.create({
            requestBody: fileMetadata,
            media: media,
            // This flag is essential for uploading to Shared Drives.
            supportsAllDrives: true,
        });
        console.log(`📁 Successfully uploaded file to ${IS_PRODUCTION ? 'production' : 'test'} folder.`);
        console.log(`File Name: ${file.data.name}`);
        console.log(`File ID: ${file.data.id}`);
        return file.data.id;
    } catch (err) {
        console.error(`An error occurred during upload: ${err}`);
        return null;
    }
}