// Accepts a new survey response and stores it to S3 bucket

import express from 'express';
import serverless from 'serverless-http';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { validateResponse } from './validateResponse.js';
// Step 1: S3 Configuration
const S3_BUCKET = process.env.S3_BUCKET_NAME;
const s3 = new S3Client({ region: process.env.AWS_REGION }); // AWS_REGION is pre-defined by AWS

// Step 2: Express.js Setup
const app = express();
app.use(express.json());

// Step 3: Handle new survey responses
app.post('/survey', async (req, res) => {
    try {
        const { data: newResponse } = req.body;

        console.log('Reading phases file...');
        let phasesData = [];

        try {
            const phases = await s3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: 'metadata/phases.json' }));
            const phasesBodyContents = await phases.Body.transformToString();
            phasesData = JSON.parse(phasesBodyContents);
        } catch (e) {
            console.error('Error fetching current phase:', e);
            return res.status(500).json({ message: 'Error accessing phases file' });
        }

        const currDate = new Date();
        let currPhase = currDate.getMonth() + 1 + "-" + currDate.getFullYear();
        for (const phase of phasesData) {
            if (currDate >= new Date(phase.start) && currDate <= new Date(phase.end)) {
                currPhase = phase.name;
                break;
            }
        }

        // Step 3.1 Fetch the existing phase file in S3
        console.log('Fetching and parsing existing phase file from S3...');
        let currPhaseData = [];
        try {
            const response = await s3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: `data/${currPhase}.json` }));
            const bodyContents = await response.Body.transformToString();
            currPhaseData = JSON.parse(bodyContents);
        } catch (e) {
            // Suppress no file found since we can just start with an empty array
            if (e.name !== 'NoSuchKey') {
                console.error('Error fetching S3 data:', e);
                return res.status(500).json({ message: 'Error accessing master data' });
            } else {
                console.log('No existing phase file found, creating new one...');
            }
        }
        console.log('Successfully fetched and parsed existing phase file from S3');

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
            const surveyVersion = validateResponse(newResponse);
            console.log(`Response validated successfully using survey version ${surveyVersion}`);
        } catch (e) {
            console.error('Validation failed:', e);
            console.log('Storing invalid response...');
            newEntry.valid = false;
        }

        // Step 3.3 Append the new response
        console.log('Appending new response...');
        currPhaseData.push(newEntry);

        // Step 3.4 Write the updated data back to S3
        console.log('Writing updated data back to S3...');
        await s3.send(new PutObjectCommand({
            Bucket: S3_BUCKET,
            Key: `data/${currPhase}.json`,
            ContentType: 'application/json',
            Body: JSON.stringify(currPhaseData),
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
