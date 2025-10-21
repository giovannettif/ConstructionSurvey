// driveUploader.js
// This script authenticates with the Google Drive API using OAuth 2.0
// and uploads a JSON object as a file to the user's Google Drive.

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { authenticate } from '@google-cloud/local-auth';
import { google } from 'googleapis';
import { Readable } from 'stream';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Configuration ---
// The scope determines the level of access the application has.
// 'drive.file' scope allows access to only the files created by this app.
const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

// The file token.json stores the user's access and refresh tokens.
// It is created automatically when the authorization flow completes for the first time.
const TOKEN_PATH = path.join(__dirname, 'token.json');
const CREDENTIALS_PATH = path.join(__dirname, 'client_secret.json');

/**
 * Reads previously authorized credentials from the save file.
 * @return {Promise<OAuth2Client|null>}
 */
async function loadSavedCredentialsIfExist() {
    try {
        const content = await fs.readFile(TOKEN_PATH);
        const credentials = JSON.parse(content);
        return google.auth.fromJSON(credentials);
    } catch (err) {
        // If the file does not exist or is invalid, return null.
        return null;
    }
}

/**
 * Serializes credentials to a file compatible with GoogleAUth.fromJSON.
 * @param {OAuth2Client} client
 * @return {Promise<void>}
 */
async function saveCredentials(client) {
    try {
        const content = await fs.readFile(CREDENTIALS_PATH);
        const keys = JSON.parse(content);
        const key = keys.installed || keys.web;
        const payload = JSON.stringify({
            type: 'authorized_user',
            client_id: key.client_id,
            client_secret: key.client_secret,
            refresh_token: client.credentials.refresh_token,
        });
        await fs.writeFile(TOKEN_PATH, payload);
    } catch (err) {
        console.error("Error saving credentials:", err);
        throw new Error("Could not find client_secret.json. Please follow the README instructions.");
    }
}


/**
 * Load or request or authorization to call APIs.
 */
async function authorize() {
    let client = await loadSavedCredentialsIfExist();
    if (client) {
        return client;
    }
    client = await authenticate({
        scopes: SCOPES,
        keyfilePath: CREDENTIALS_PATH,
    });
    if (client.credentials) {
        await saveCredentials(client);
    }
    return client;
}

/**
 * Uploads a Python dictionary as a JSON file to Google Drive.
 * @param {OAuth2Client} authClient An authorized OAuth2 client.
 * @param {string} fileName The name of the file to create.
 * @param {object} data The JSON data to upload.
 */
async function uploadJsonToDrive(authClient, fileName, data) {
    const drive = google.drive({ version: 'v3', auth: authClient });

    // Convert the JavaScript object to a JSON string.
    const jsonString = JSON.stringify(data, null, 4);

    // Create a readable stream from the JSON string.
    const jsonStream = Readable.from([jsonString]);

    const fileMetadata = {
        name: fileName,
        fields: 'id, name',
    };

    const media = {
        mimeType: 'application/json',
        body: jsonStream,
    };

    try {
        console.log(`Uploading '${fileName}' to Google Drive...`);
        const file = await drive.files.create({
            resource: fileMetadata,
            media: media,
        });
        console.log(`Successfully uploaded file!`);
        console.log(`File Name: ${file.data.name}`);
        console.log(`File ID: ${file.data.id}`);
        return file.data.id;
    } catch (err) {
        console.error(`An error occurred: ${err}`);
        return null;
    }
}

/**
 * Main execution function.
 */
async function main() {
    console.log("Starting Google Drive authentication...");
    try {
        const authClient = await authorize();
        console.log("Authentication successful.");

        // --- Sample Survey Data ---
        // This is the data that will be saved in the JSON file.
        const surveyResponse = {
            "surveyId": "survey-101",
            "userId": "user-xyz-789",
            "timestamp": "2025-10-21T21:30:00Z",
            "answers": [{
                "questionId": "q1",
                "answer": "Strongly Disagree"
            }, {
                "questionId": "q2",
                "answer": "A lot"
            }, {
                "questionId": "q3",
                "answer": ["Option A"]
            }, {
                "questionId": "q4",
                "answer": "The interface could be more intuitive."
            }]
        };

        // Define the name for the uploaded file
        const jsonFileName = `survey_response_${surveyResponse.userId}_${surveyResponse.timestamp}.json`;

        // Call the upload function
        await uploadJsonToDrive(authClient, jsonFileName, surveyResponse);

    } catch (err) {
        console.error("Could not complete the process:", err.message);
    }
}

// Run the main function and catch any top-level errors.
main().catch(console.error);
