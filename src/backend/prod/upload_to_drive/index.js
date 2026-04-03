// Uploads existing survey responses from S3 to Google Drive folder

import { S3Client, GetObjectCommand, PutObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import pLimit from 'p-limit';
import { authorize, createFolders, uploadJsonToDrive } from './driveManager.js';

// env vars
const FOLDER_ID = process.env.FOLDER_ID;

// S3 configuration
const S3_BUCKET = process.env.S3_BUCKET_NAME;
const s3 = new S3Client({ region: process.env.AWS_REGION });

// Drive authorization
const authClient = await authorize(['https://www.googleapis.com/auth/drive']);

// limit the number of concurrent uploads
const limit = pLimit(5);

export const handler = async () => {
    console.log('1. Listing all data files from S3...');
    // ['path/to/file.json', ...]
    let files = [];

    try {
        for (const prefix of ['data/', 'test/']) {
            const response = await s3.send(new ListObjectsV2Command({ Bucket: S3_BUCKET, Prefix: prefix }));
            let objects = response.Contents;
            let nextToken = response.NextContinuationToken;

            // handle pagination
            while (response.IsTruncated) {
                response = await s3.send(new ListObjectsV2Command({ Bucket: S3_BUCKET, Prefix: prefix, ContinuationToken: nextToken }));
                objects = objects.concat(response.Contents);
                nextToken = response.NextContinuationToken;
            }

            // Key is the path to the file
            files = files.concat(objects.map(item => item.Key).filter(key => !key.endsWith('/')));
        }
    } catch (e) {
        console.error('Error listing S3 data files:', e);
        return { message: 'Error listing S3 data files' };
    }

    console.log('2. Fetching files with unuploaded entries...');
    // { 'path/to/file.json': [entry1, entry2, ...], ... }
    let unuploadedS3Data = {};

    for (const filePath of files) {
        try {
            const response = await s3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: filePath }));
            const jsonStr = await response.Body.transformToString();
            const data = JSON.parse(jsonStr);
            // include even partially unuploaded files (certain entries uploaded, others not)
            const uploaded = data.every(item => item.uploaded_to_drive);

            if (!uploaded) {
                unuploadedS3Data[filePath] = data;
            }
        } catch (e) {
            console.error(`Error fetching file ${filePath} from S3:`, e);
            return { message: `Error fetching file ${filePath} from S3` };
        }
    }

    if (Object.keys(unuploadedS3Data).length === 0) {
        console.log('No new entries to upload');
        return { message: 'No new entries to upload' };
    }

    console.log('3. Uploading files to Google Drive...');
    const promises1 = Object.entries(unuploadedS3Data).map(async ([filePath, data]) => {
        // if the file name contains a path, create / retrieve the folders first
        // test/2026-04.json (file) -> test/2026-04 (folder)
        const folderId = await createFolders(authClient, FOLDER_ID, filePath.replace(/\.json$/, ''));

        const promises2 = data.filter(entry => !entry.uploaded_to_drive).map((entry) => {
            return limit(async () => {
                try {
                    const timestamp = new Date().toISOString();
                    const surveyTsConv = entry.data?.timestamp?.replace(/[:.]/g, '-') || 'unknown';
                    const s3TsConv = entry.s3_timestamp.replace(/[:.]/g, '-') || 'unknown';
                    const currTsConv = timestamp.replace(/[:.]/g, '-');

                    const fileName = `${surveyTsConv}_${s3TsConv}_${currTsConv}_${entry.id || 'unknown'}.json`;
                    // copy to avoid modifying the original entry
                    const dataToUpload = JSON.parse(JSON.stringify(entry));
                    dataToUpload.drive_timestamp = timestamp;
                    delete dataToUpload.uploaded_to_drive;

                    const fileId = await uploadJsonToDrive(authClient, folderId, fileName, dataToUpload);

                    if (fileId) {
                        entry.uploaded_to_drive = true;
                        entry.drive_timestamp = timestamp;
                    }
                } catch (e) {
                    message = `Error uploading entry ${entry.id} to Drive`;
                    console.error(message, e);
                    return { message };
                }
            });
        });

        // resolve the promises concurrently since they're independent of each other
        return Promise.all(promises2);
    });

    await Promise.all(promises1);

    console.log('4. Updating the files in S3 with the new upload statuses...');
    for (const [filePath, data] of Object.entries(unuploadedS3Data)) {
        try {
            await s3.send(new PutObjectCommand({
                Bucket: S3_BUCKET,
                Key: filePath,
                ContentType: 'application/json',
                Body: JSON.stringify(data),
            }));
        } catch (e) {
            console.error(`Error updating file ${filePath} in S3:`, e);
            return { message: `Error updating file ${filePath} in S3` };
        }
    }

    console.log('Synced S3 bucket contents to Google Drive');
    return { message: 'Synced S3 bucket contents to Google Drive' };
};
