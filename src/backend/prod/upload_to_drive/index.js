// Uploads existing survey responses from S3 to Google Drive folder

import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import pLimit from 'p-limit';
import { authorize, uploadJsonToDrive } from './driveManager.js';

// Step 1: Set up
// env vars
const IS_PROD = !!process.env.AWS_LAMBDA_FUNCTION_NAME; // AWS_LAMBDA_FUNCTION_NAME is pre-defined by AWS

const PROD_FOLDER_ID = process.env.PROD_FOLDER_ID;      // Set in AWS Lambda env vars
const TEST_FOLDER_ID = process.env.TEST_FOLDER_ID;      // Set in local .env
const FOLDER_ID = IS_PROD ? PROD_FOLDER_ID : TEST_FOLDER_ID;

// S3 configuration
const S3_BUCKET = process.env.S3_BUCKET_NAME;
const S3_KEY = 'survey-responses-master.json';
const s3 = new S3Client({ region: process.env.AWS_REGION });    // AWS_REGION is pre-defined by AWS

// Drive authorization
const authClient = await authorize(['https://www.googleapis.com/auth/drive']);

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
        }
    }

    // Step 3: Filter out already uploaded entries
    const entriesToUpload = masterData.filter(item => !item.uploaded_to_drive);
    console.log(`Found ${entriesToUpload.length} new entries to upload.`);

    if (entriesToUpload.length === 0) {
        console.log('No new entries to upload.');
        return {
            message: 'No new entries to upload',
            processed: 0,
            successful: 0
        };
    }

    // Step 4: Upload the entries to Google Drive
    const promises = entriesToUpload.map((entry) => {
        return limit(async () => {
            try {
                const timestamp = new Date().toISOString();
                const fileName = `survey_response_${entry.id || 'unknown'}_${entry.data?.timestamp?.replace(/[:.]/g, '-') || 'unknown'}_${timestamp.replace(/[:.]/g, '-')}.json`;
                const dataToUpload = JSON.parse(JSON.stringify(entry));
                dataToUpload.drive_timestamp = timestamp;
                delete dataToUpload.uploaded_to_drive;
                const fileId = await uploadJsonToDrive(authClient, FOLDER_ID, fileName, dataToUpload);

                if (fileId) {
                    entry.uploaded_to_drive = true;
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
        successful: entriesToUpload.filter(item => item.uploaded_to_drive).length
    };
};
