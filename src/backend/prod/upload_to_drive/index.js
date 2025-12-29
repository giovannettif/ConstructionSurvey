// driveUploader.js
// This script authenticates with the Google Drive API using a service account
// and uploads a JSON object to a specific folder within a Shared Drive.

import express from 'express';
import serverless from 'serverless-http';
import AWS from 'aws-sdk';
import { google } from 'googleapis';
import { Readable } from 'stream';
import dotenv from 'dotenv';
dotenv.config({ path: './private/.env' });

// --- Configuration ---

// ID of the Google Shared Drive (or a folder within it) you want to upload files to.
// Find this in the URL: .../drive/folders/THIS_IS_THE_ID
const FOLDER_ID = process.env.FOLDER_ID; // <-- IMPORTANT: Replace with your actual ID

// The path to your service account key file.
const SERVICE_ACCOUNT_KEY_FILE = './private/service_account.json';

// The scope determines the level of access. 'drive' allows full access.
const SCOPES = ['https://www.googleapis.com/auth/drive'];

const app = express();
const authClient = await authorize();

app.get('/upload-to-drive', async (req, res) => {
    const s3 = new AWS.S3();
    const S3_BUCKET = process.env.S3_BUCKET;
    const S3_KEY = process.env.S3_KEY;

    console.log('Fetching existing master file from S3...');
    let masterData = [];
    try {
        const data = await s3.getObject({ Bucket: S3_BUCKET, Key: S3_KEY }).promise();
        masterData = JSON.parse(data.Body.toString('utf-8'));
    } catch (e) {
        if (e.code !== 'NoSuchKey') {
            console.error('Error fetching S3 data:', e);
            return res.status(500).json({ message: 'Error accessing master data' });
        }
    }

    const entriesToUpload = masterData.filter(item => !item.uploadedToDrive);
    let numEntriesUploaded = 0;
    console.log(`Found ${entriesToUpload.length} new entries to upload.`);

    for (const entry of entriesToUpload) {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const fileName = `survey_response_${entry.userId || 'unknown'}_${timestamp}.json`;
            const fileId = await uploadJsonToDrive(authClient, fileName, entry);

            if (fileId) {
                entry.uploadedToDrive = true;
                numEntriesUploaded++;
            }
        } catch (err) {
            console.error(`Failed to upload entry for user ${entry.userId}:`, err);
        }
    }

    // Update the master file in S3 with the new upload statuses
    await s3.putObject({
        Bucket: S3_BUCKET,
        Key: S3_KEY,
        Body: JSON.stringify(masterData, null, 4),
        ContentType: 'application/json'
    }).promise();

    res.status(200).json({
        message: 'Sync completed',
        processed: entriesToUpload.length,
        successful: numEntriesUploaded
    });
});

/**
 * Authorizes the service account to access Google Drive APIs.
 * @returns {Promise<object>} An authorized Google Auth client.
 */
async function authorize() {
    try {
        const auth = new google.auth.GoogleAuth({
            keyFile: SERVICE_ACCOUNT_KEY_FILE,
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
    if (FOLDER_ID === 'YOUR_SHARED_DRIVE_OR_FOLDER_ID_HERE') {
        console.error("ERROR: Please replace 'YOUR_SHARED_DRIVE_OR_FOLDER_ID_HERE' in the script with your actual Shared Drive or Folder ID.");
        return null;
    }

    const drive = google.drive({ version: 'v3', auth: authClient });

    const jsonString = JSON.stringify(data, null, 4);
    const jsonStream = Readable.from([jsonString]);

    const fileMetadata = {
        name: fileName,
        fields: 'id, name',
    };

    if (FOLDER_ID !== '') {
        fileMetadata.parents = [FOLDER_ID];
    }

    const media = {
        mimeType: 'application/json',
        body: jsonStream,
    };

    try {
        console.log(`Uploading '${fileName}' to Google Drive...`);
        const file = await drive.files.create({
            requestBody: fileMetadata,
            media: media,
            // This flag is essential for uploading to Shared Drives.
            supportsAllDrives: true,
        });
        console.log(`Successfully uploaded file!`);
        console.log(`File Name: ${file.data.name}`);
        console.log(`File ID: ${file.data.id}`);
        return file.data.id;
    } catch (err) {
        console.error(`An error occurred during upload: ${err}`);
        return null;
    }
}

module.exports.handler = serverless(app);