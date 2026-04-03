// Uploads existing survey responses from S3 to Google Drive folder

import { S3Client, GetObjectCommand, PutObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import pLimit from 'p-limit';
import { authorize, createFolders, uploadJsonToDrive } from './driveManager.js';

// Step 1: Set up
// env vars
const FOLDER_ID = process.env.FOLDER_ID;

// S3 configuration
const S3_BUCKET = process.env.S3_BUCKET_NAME;
const S3_PREFIX = 'data/';
const s3 = new S3Client({ region: process.env.AWS_REGION });

// Drive authorization
const authClient = await authorize(['https://www.googleapis.com/auth/drive']);

// limit the number of concurrent uploads
const limit = pLimit(5);

export const handler = async () => {
    let message;
    console.log('1. Listing all data files from S3...');
    let files = [];

    try {
        const response = await s3.send(new ListObjectsV2Command({ Bucket: S3_BUCKET, Prefix: S3_PREFIX }));
        let objects = response.Contents;
        let nextToken = response.NextContinuationToken;

        // handle pagination
        while (response.IsTruncated) {
            response = await s3.send(new ListObjectsV2Command({ Bucket: S3_BUCKET, Prefix: S3_PREFIX, ContinuationToken: nextToken }));
            objects = objects.concat(response.Contents);
            nextToken = response.NextContinuationToken;
        }

        // Key is the path to the file
        files = objects.map(item => item.Key).filter(key => !key.endsWith('/'));
    } catch (e) {
        message = 'Error listing S3 data files';
        console.error(message, e);
        return { message };
    }

    console.log('2. Fetching files with unuploaded entries...');
    // { 'path/to/file.json': [entry1, entry2, ...], ... }
    let unuploadedS3Data = {};

    for (const fileName of files) {
        try {
            const response = await s3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: fileName }));
            const jsonStr = await response.Body.transformToString();
            const data = JSON.parse(jsonStr);
            // include even partially unuploaded files (certain entries uploaded, others not)
            const uploaded = data.every(item => item.uploaded_to_drive);

            if (!uploaded) {
                unuploadedS3Data[fileName] = data;
            }
        } catch (e) {
            message = `Error fetching file ${fileName} from S3`;
            console.error(message, e);
            return { message };
        }
    }

    if (Object.keys(unuploadedS3Data).length === 0) {
        message = 'No new entries to upload';
        console.log(message);
        return { message };
    }

    console.log('3. Uploading files to Google Drive...');
    const promises1 = Object.entries(unuploadedS3Data).map(async ([s3FileName, data]) => {
        // set up folder
        const fileNameOnly = s3FileName.split('/').pop();
        let folderId = FOLDER_ID;
        // based on phase: TEST5.json (file) -> Test 5 (folder)
        const folderName = fileNameOnly
            .toLowerCase()
            .replace(/\.\w+$/, '')
            .replace(/_/g, ' ')
            .replace(/\b\w/g, l => l.toUpperCase());

        // if the file name contains a path, create / retrieve the folders first
        folderId = await createFolders(authClient, FOLDER_ID, folderName);

        const promises2 = data.filter(item => !item.uploaded_to_drive).map((entry) => {
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
    for (const [s3FileName, data] of Object.entries(unuploadedS3Data)) {
        try {
            await s3.send(new PutObjectCommand({
                Bucket: S3_BUCKET,
                Prefix: S3_PREFIX,
                Key: s3FileName,
                ContentType: 'application/json',
                Body: JSON.stringify(data),
            }));
        } catch (e) {
            message = `Error updating file ${s3FileName} in S3`;
            console.error(message, e);
            return { message };
        }
    }

    message = 'Synced S3 bucket contents to Google Drive';
    console.log(message);
    return { message };
};
