// Uploads existing survey responses from S3 to Google Drive folder

import { S3Client, GetObjectCommand, PutObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
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
const S3_PREFIX = 'data/';
const s3 = new S3Client({ region: process.env.AWS_REGION });    // AWS_REGION is pre-defined by AWS

// Drive authorization
const authClient = await authorize(['https://www.googleapis.com/auth/drive']);

// limit the number of concurrent uploads
const limit = pLimit(5);

export const handler = async () => {
    // Step 2: Fetch the existing master file from S3
    console.log('Fetching existing data from S3...');

    let files = [];

    try {
        const response = await s3.send(new ListObjectsV2Command({ Bucket: S3_BUCKET, Prefix: S3_PREFIX }));
        let objects = response.Contents;
        let nextToken = response.NextContinuationToken;

        while (response.IsTruncated) {
            response = await s3.send(new ListObjectsV2Command({ Bucket: S3_BUCKET, Prefix: S3_PREFIX, ContinuationToken: nextToken }));
            objects = objects.concat(response.Contents);
            nextToken = response.NextContinuationToken;
        }

        files = objects.map(item => item.Key);
    } catch (e) {
        console.error('Error fetching S3 data:', e);
        return { message: 'Error fetching S3 data' };
    }

    let unuploadedS3Data = {};

    for (const fileName of files) {
        try {
            const response = await s3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: fileName }));
            const jsonStr = await response.Body.transformToString();
            const data = JSON.parse(jsonStr);
            const uploaded = data.every(item => item.uploaded_to_drive);

            // include even partially unuploaded files (certain responses uploaded, others not)
            if (!uploaded) {
                unuploadedS3Data[fileName] = data;
            }
        } catch (e) {
            console.error(`Error fetching file ${fileName} from S3:`, e);
            return { message: 'Error fetching file from S3' };
        }
    }

    // Step 3: Filter out already uploaded entries
    if (Object.keys(unuploadedS3Data).length === 0) {
        console.log('No new entries to upload.');
        return { message: 'No new entries to upload' };
    }

    // Step 4: Upload the entries to Google Drive
    const promises1 = Object.entries(unuploadedS3Data).map(([s3FileName, data]) => {
        const promises2 = data.filter(item => !item.uploaded_to_drive).map((entry) => {
            return limit(async () => {
                try {
                    // folderName in Title Case
                    const timestamp = new Date().toISOString();
                    const surveyTsConv = entry.data?.timestamp?.replace(/[:.]/g, '-') || 'unknown';
                    const s3TsConv = entry.s3_timestamp.replace(/[:.]/g, '-') || 'unknown';
                    const currTsConv = timestamp.replace(/[:.]/g, '-');

                    const folderName = s3FileName
                        .split('/')
                        .pop()
                        .toLowerCase()
                        .replace(/\.\w+$/, '')
                        .replace(/_/g, ' ')
                        .replace(/\b\w/g, l => l.toUpperCase());
                    const fileName = `${folderName}/${surveyTsConv}_${s3TsConv}_${currTsConv}_${entry.id || 'unknown'}.json`;
                    const dataToUpload = JSON.parse(JSON.stringify(entry));
                    dataToUpload.drive_timestamp = timestamp;
                    delete dataToUpload.uploaded_to_drive;

                    console.log(fileName)
                    const fileId = await uploadJsonToDrive(authClient, FOLDER_ID, fileName, dataToUpload);

                    if (fileId) {
                        entry.uploaded_to_drive = true;
                        entry.drive_timestamp = timestamp;
                    }
                } catch (e) {
                    console.error(`Error uploading entry ${entry.id} to Drive:`, e);
                }
            });
        });
        return promises2;
    });

    // resolve the promises concurrently since they're independent of each other
    await Promise.all(promises1.flat());

    // Step 5: Update the files in S3 with the new upload statuses
    for (const [s3FileName, data] of Object.entries(unuploadedS3Data)) {
        await s3.send(new PutObjectCommand({
            Bucket: S3_BUCKET,
            Prefix: S3_PREFIX,
            Key: s3FileName,
            ContentType: 'application/json',
            Body: JSON.stringify(data),
        }));
    }

    return { message: 'Synced S3 bucket contents to Google Drive' };
};
