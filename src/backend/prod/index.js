// app.js
const express = require('express');
const serverless = require('serverless-http');
const AWS = require('aws-sdk');

// S3 Configuration (set your bucket name)
const S3_BUCKET = process.env.S3_BUCKET_NAME; // Set this via Lambda environment variable
const S3_KEY = 'survey-responses-master.json'; // The file name in S3
const s3 = new AWS.S3();

const app = express();
app.use(express.json()); // Middleware to parse incoming JSON

// POST route to handle new survey responses
app.post('/survey', async (req, res) => {
    const newResponse = req.body;
    
    // 1. Fetch the existing master file from S3
    let masterData = [];
    try {
        const params = { Bucket: S3_BUCKET, Key: S3_KEY };
        const data = await s3.getObject(params).promise();
        // Parse the existing JSON content
        masterData = JSON.parse(data.Body.toString('utf-8'));
    } catch (e) {
        // If the file doesn't exist (first response), start with an empty array
        if (e.code !== 'NoSuchKey') {
            console.error('Error fetching S3 data:', e);
            return res.status(500).json({ message: 'Error accessing master data' });
        }
    }

    // 2. Append the new response
    masterData.push({ 
        timestamp: new Date().toISOString(), 
        data: newResponse 
    });

    // 3. Write the updated master file back to S3
    try {
        const uploadParams = {
            Bucket: S3_BUCKET,
            Key: S3_KEY,
            Body: JSON.stringify(masterData, null, 2), // Pretty print for readability
            ContentType: 'application/json'
        };
        await s3.putObject(uploadParams).promise();
        
        return res.status(200).json({ 
            message: 'Survey response saved successfully!', 
            responseId: masterData.length 
        });
    } catch (e) {
        console.error('Error saving to S3:', e);
        return res.status(500).json({ message: 'Error saving survey response' });
    }
});

// The handler function required by AWS Lambda
module.exports.handler = serverless(app);