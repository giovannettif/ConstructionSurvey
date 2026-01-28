// Accepts a new survey response and stores it to S3 bucket

import express from 'express';
import serverless from 'serverless-http';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { validateResponse } from './validateResponse.js';
// S3 Configuration
const S3_BUCKET = process.env.S3_BUCKET_NAME;
const s3 = new S3Client({ region: process.env.AWS_REGION });

// Express.js Setup
const app = express();
app.use(express.json());

// handle new survey responses
app.post('/survey', async (req, res) => {
    let message;
    const { data: newResponse } = req.body;

    console.log('1. Reading phases file...');
    let phasesData = [];

    try {
        const phases = await s3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: 'metadata/phases.json' }));
        const bodyContents = await phases.Body.transformToString();
        phasesData = JSON.parse(bodyContents);
    } catch (e) {
        message = 'Error fetching phases file';
        console.error(message, e);
        return res.status(500).json({ message });
    }

    // find current phase
    const currDate = new Date();
    // default to current month and year
    let currPhase = currDate.getMonth() + 1 + "-" + currDate.getFullYear();

    for (const phase of phasesData) {
        if (currDate >= new Date(phase.start) && currDate <= new Date(phase.end)) {
            currPhase = phase.name;
            break;
        }
    }

    console.log('2. Fetching current phase file from S3...');
    let currPhaseData = [];
    try {
        const response = await s3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: `data/${currPhase}.json` }));
        const bodyContents = await response.Body.transformToString();
        currPhaseData = JSON.parse(bodyContents);
    } catch (e) {
        // Suppress no file found since we can just start with an empty array
        if (e.name !== 'NoSuchKey') {
            message = 'Error fetching current phase file';
            console.error(message, e);
            return res.status(500).json({ message });
        } else {
            console.log('No existing phase file found, creating new one...');
        }
    }

    console.log('3. Validating response...');
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
        message = 'Validation failed';
        console.error(message, e);
        console.log('Storing invalid response...');
        newEntry.valid = false;
    }

    currPhaseData.push(newEntry);

    console.log('4. Writing updated data back to S3...');
    try {
        await s3.send(new PutObjectCommand({
            Bucket: S3_BUCKET,
            Key: `data/${currPhase}.json`,
            ContentType: 'application/json',
            Body: JSON.stringify(currPhaseData),
        }));
    } catch (e) {
        message = 'Error writing updated data back to S3';
        console.error(message, e);
        return res.status(500).json({ message });
    }

    message = 'Survey response saved successfully!';
    console.log(message);
    return res.status(200).json({ message });
});

export const handler = serverless(app);
