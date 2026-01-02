import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { google } from 'googleapis';
import { readFile } from "node:fs/promises";
import { join } from "node:path";

let drive = null;

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

        console.log(`📁 Successfully uploaded file to folder.`);
        console.log(`File Name: ${file.data.name}`);
        console.log(`File ID: ${file.data.id}`);
        return file.data.id;
    } catch (e) {
        console.error(`An error occurred during upload: ${e}`);
        return null;
    }
}

export { authorize, uploadJsonToDrive };
