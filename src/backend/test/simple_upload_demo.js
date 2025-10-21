// code from https://developers.google.com/workspace/drive/api/guides/manage-uploads
const fs = require("node:fs");
const process = require("process");
const path = require("path");
const { GoogleAuth } = require('google-auth-library');
const { google } = require('googleapis');

const CREDENTIALS_PATH = path.join(process.cwd(), './src/backend/test/credentials.json');
console.log(CREDENTIALS_PATH);

/**
 * Uploads a file to Google Drive.
 * @return {Promise<string|null|undefined>} The ID of the uploaded file.
 */
async function uploadBasic() {
    // Authenticate with Google and get an authorized client.
    // TODO (developer): Use an appropriate auth mechanism for your app.
    const auth = new GoogleAuth({
        scopes: 'https://www.googleapis.com/auth/drive',
        keyFile: CREDENTIALS_PATH,
    });

    // Create a new Drive API client (v3).
    const service = google.drive({ version: 'v3', auth });

    // The request body for the file to be uploaded.
    const requestBody = {
        name: 'photo.jpg',
        fields: 'id',
    };

    // The media content to be uploaded.
    const filePath = path.join(process.cwd(), "./src/backend/test/image.jpg");
    console.log(filePath);
    const media = {
        mimeType: 'image/jpeg',
        body: fs.createReadStream(filePath),
    };

    // Upload the file.
    const file = await service.files.create({
        requestBody,
        media,
    });

    // Print the ID of the uploaded file.
    console.log('File Id:', file.data.id);
    return file.data.id;
}

uploadBasic();