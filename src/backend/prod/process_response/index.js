// Accepts a new survey response and stores it to S3 bucket

import express from 'express';
import serverless from 'serverless-http';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { validateResponse } from './validateResponse.js';

// Step 1: S3 Configuration
const S3_BUCKET = process.env.S3_BUCKET_NAME;
const S3_KEY = 'survey-responses-master.json';
const s3 = new S3Client({ region: process.env.AWS_REGION }); // AWS_REGION is pre-defined by AWS

// Step 2: Express.js Setup
const app = express();
app.use(express.json());

// Step 3: Handle new survey responses
app.post('/survey', async (req, res) => {
    try {
        const { data: newResponse } = req.body;

        // Step 3.1 Fetch the existing master file from S3
        console.log('Fetching and parsing existing master file from S3...');
        let masterData = [];
        try {
            const response = await s3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: S3_KEY }));
            const bodyContents = await response.Body.transformToString();
            masterData = JSON.parse(bodyContents);
        } catch (e) {
            // Suppress no file found since we can just start with an empty array
            if (e.name !== 'NoSuchKey') {
                console.error('Error fetching S3 data:', e);
                return res.status(500).json({ message: 'Error accessing master data' });
            }
        }
        console.log('Successfully fetched and parsed existing master file from S3');

        // Step 3.2 Validate response
        console.log('Validating response...');
        const newEntry = {
            id: new Date().getTime(),
            s3_timestamp: new Date().toISOString(),
            uploaded_to_drive: false,
            valid: true,
            data: newResponse,
        };

        try {
            const { version } = validateResponse(newResponse);
            console.log(`Response validated successfully using format version ${version}`);
        } catch (e) {
            console.error('Validation failed:', e);
            console.log('Storing invalid response...');
            newEntry.valid = false;
        }

        // Step 3.3 Append the new response
        console.log('Appending new response...');
        masterData.push(newEntry);

        // Step 3.4 Write the updated data back to S3
        console.log('Writing updated data back to S3...');
        await s3.send(new PutObjectCommand({
            Bucket: S3_BUCKET,
            Key: S3_KEY,
            ContentType: 'application/json',
            Body: JSON.stringify(masterData),
        }));

        console.log('Successfully saved updated data to S3');
        return res.status(200).json({ message: 'Survey response saved successfully!' });
    } catch (e) {
        console.error('Error saving to S3:', e);
        return res.status(500).json({ message: 'Error saving survey response' });
    }
});

// The handler function required by AWS Lambda
export const handler = serverless(app);
