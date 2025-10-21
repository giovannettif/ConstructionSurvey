// driveUploader.js
// This script authenticates with the Google Drive API using a service account
// and uploads a JSON object to a specific folder in Google Drive.

import { google } from 'googleapis';
import { Readable } from 'stream';

// --- Configuration ---

// ID of the Google Drive folder you want to upload files to.
// Find this in the URL of your folder: .../folders/THIS_IS_THE_ID
const FOLDER_ID = 'YOUR_FOLDER_ID_HERE'; // <-- IMPORTANT: Replace with your actual folder ID

// The path to your service account key file.
const SERVICE_ACCOUNT_KEY_FILE = './service_account.json';

// The scope determines the level of access. 'drive' allows full access.
const SCOPES = ['https://www.googleapis.com/auth/drive'];

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
 * Uploads a JavaScript object as a JSON file to a specific Google Drive folder.
 * @param {object} authClient An authorized auth client.
 * @param {string} fileName The name for the new file.
 * @param {object} data The JavaScript object to upload as JSON.
 */
async function uploadJsonToDrive(authClient, fileName, data) {
    if (FOLDER_ID === 'YOUR_FOLDER_ID_HERE') {
        console.error("ERROR: Please replace 'YOUR_FOLDER_ID_HERE' in the script with your actual Google Drive Folder ID.");
        return null;
    }

    const drive = google.drive({ version: 'v3', auth: authClient });

    // Convert the JavaScript object to a JSON string.
    const jsonString = JSON.stringify(data, null, 4);

    // Create a readable stream from the JSON string.
    const jsonStream = Readable.from([jsonString]);

    // Metadata for the file.
    const fileMetadata = {
        name: fileName,
        parents: [FOLDER_ID], // Specify the folder to upload into.
        fields: 'id, name',
    };

    // Media properties for the upload.
    const media = {
        mimeType: 'application/json',
        body: jsonStream,
    };

    try {
        console.log(`Uploading '${fileName}' to Google Drive folder...`);
        const file = await drive.files.create({
            resource: fileMetadata,
            media: media,
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


/**
 * Main execution function.
 */
async function main() {
    try {
        const authClient = await authorize();

        // --- Sample Survey Data ---
        // This is the data that will be saved in the JSON file.
        const surveyResponse = {
            "surveyId": "survey-202",
            "userId": "user-abc-123",
            "timestamp": new Date().toISOString(),
            "answers": [{
                "questionId": "q1",
                "answer": "Strongly Agree"
            }, {
                "questionId": "q2",
                "answer": "Very little"
            }, {
                "questionId": "q4",
                "answer": "The new feature is fantastic."
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

// Run the main function.
main().catch(console.error);