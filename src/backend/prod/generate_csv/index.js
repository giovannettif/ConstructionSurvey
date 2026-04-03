// Generates a CSV from all survey response JSON files in S3 and stores it in the csv/ folder

import { S3Client, GetObjectCommand, PutObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';

const S3_BUCKET = process.env.S3_BUCKET_NAME;
const s3 = new S3Client({ region: process.env.AWS_REGION });

// Recursively flattens a nested object using dot-notation keys.
// Arrays are serialized to JSON strings since CSV cells hold scalar values.
function flattenObj(obj, prefix) {
    const result = {};
    for (const key in obj) {
        const val = obj[key];
        const fullKey = prefix ? prefix + '.' + key : key;
        if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
            Object.assign(result, flattenObj(val, fullKey));
        } else {
            result[fullKey] = Array.isArray(val) ? JSON.stringify(val) : val;
        }
    }
    return result;
}

// Escapes a value for CSV output per RFC 4180.
function csvEscape(val) {
    if (val == null) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
}

export const handler = async () => {
    // 1. List all JSON files from S3
    console.log('1. Listing all data files from S3...');
    let files = [];

    try {
        for (const prefix of ['data/', 'test/']) {
            let response = await s3.send(new ListObjectsV2Command({ Bucket: S3_BUCKET, Prefix: prefix }));
            let objects = response.Contents ?? [];

            while (response.IsTruncated) {
                response = await s3.send(new ListObjectsV2Command({
                    Bucket: S3_BUCKET,
                    Prefix: prefix,
                    ContinuationToken: response.NextContinuationToken,
                }));
                objects = objects.concat(response.Contents ?? []);
            }

            files = files.concat(objects.map(item => item.Key).filter(key => !key.endsWith('/')));
        }
    } catch (e) {
        console.error('Error listing S3 files:', e);
        return { message: 'Error listing S3 files' };
    }

    // 2. Fetch, flatten, and collect all entries
    console.log('2. Fetching and flattening entries...');
    const masterData = [];

    for (const filePath of files) {
        try {
            const response = await s3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: filePath }));
            const jsonStr = await response.Body.transformToString();
            const entries = JSON.parse(jsonStr);

            for (const entry of entries) {
                // exclude internal upload tracking field
                const { uploaded_to_drive, ...rest } = entry;
                // normalize malformed data field: [{...}] -> {...}
                if (Array.isArray(rest.data) && rest.data.length === 1) {
                    rest.data = rest.data[0];
                }
                masterData.push(flattenObj(rest, ''));
            }
        } catch (e) {
            console.error(`Error fetching file ${filePath}:`, e);
            return { message: `Error fetching file ${filePath}` };
        }
    }

    // 3. Resolve sessionId pairs: drop completed:false if a completed:true partner exists,
    // but carry over its timestamps onto the completed entry
    console.log('3. Resolving sessionId pairs...');
    const bySession = {};
    const noSession = [];
    for (const entry of masterData) {
        const sid = entry['data.sessionId'];
        if (!sid) {
            noSession.push(entry);
        } else {
            (bySession[sid] = bySession[sid] || []).push(entry);
        }
    }

    const resolvedData = [...noSession];
    for (const sid in bySession) {
        const group = bySession[sid];
        const complete = group.find(e => e['data.completed'] === true);
        const incomplete = group.find(e => e['data.completed'] === false);
        if (complete && incomplete) {
            const STARTED_KEYS = ['data.timestamp', 's3_timestamp', 'drive_timestamp'];
            for (const key of STARTED_KEYS) {
                complete[key + '_started'] = incomplete[key];
            }
            resolvedData.push(complete);
        } else {
            resolvedData.push(...group);
        }
    }

    // 4. Sort descending by data.timestamp
    resolvedData.sort((a, b) => {
        const ta = a['data.timestamp'] ?? '';
        const tb = b['data.timestamp'] ?? '';
        return tb < ta ? -1 : tb > ta ? 1 : 0;
    });

    // 5. Build headers with data.timestamp pinned first
    const uniqueKeys = new Set();
    for (const entry of resolvedData) {
        for (const key in entry) {
            uniqueKeys.add(key);
        }
    }
    uniqueKeys.delete('data.timestamp');
    const headers = ['data.timestamp', ...uniqueKeys];

    // 6. Build CSV
    console.log('4. Building CSV...');
    const rows = [headers.map(csvEscape).join(',')];
    for (const entry of resolvedData) {
        rows.push(headers.map(h => csvEscape(entry[h])).join(','));
    }
    const csv = rows.join('\n');

    // 7. Upload CSV to S3
    console.log('5. Uploading CSV to S3...');
    const csvKey = `csv/${new Date().toISOString()}.csv`;
    try {
        await s3.send(new PutObjectCommand({
            Bucket: S3_BUCKET,
            Key: csvKey,
            ContentType: 'text/csv',
            Body: csv,
        }));
    } catch (e) {
        console.error('Error uploading CSV to S3:', e);
        return { message: 'Error uploading CSV to S3' };
    }

    console.log(`CSV uploaded to s3://${S3_BUCKET}/${csvKey}`);
    return { message: `CSV uploaded to s3://${S3_BUCKET}/${csvKey}` };
};
