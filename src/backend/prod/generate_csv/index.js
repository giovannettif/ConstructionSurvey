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

async function processDirectory(sourcePrefix, destPrefix) {
    // 1. List all JSON files from S3
    console.log(`[${sourcePrefix}] 1. Listing all data files from S3...`);
    let files = [];

    try {
        let response = await s3.send(new ListObjectsV2Command({ Bucket: S3_BUCKET, Prefix: sourcePrefix }));
        let objects = response.Contents ?? [];

        while (response.IsTruncated) {
            response = await s3.send(new ListObjectsV2Command({
                Bucket: S3_BUCKET,
                Prefix: sourcePrefix,
                ContinuationToken: response.NextContinuationToken,
            }));
            objects = objects.concat(response.Contents ?? []);
        }

        files = objects.map(item => item.Key).filter(key => key.endsWith('.json'));
    } catch (e) {
        console.error(`[${sourcePrefix}] Error listing S3 files:`, e);
        return { message: `[${sourcePrefix}] Error listing S3 files` };
    }

    // 2. Fetch, flatten, and collect all entries
    console.log(`[${sourcePrefix}] 2. Fetching and flattening entries...`);
    const masterData = [];
    let hasNewData = false;
    const filesToUpdate = {}; // files containing un-flagged entries, written back after upload

    for (const filePath of files) {
        try {
            const response = await s3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: filePath }));
            const jsonStr = await response.Body.transformToString();
            const entries = JSON.parse(jsonStr);

            let fileHasNewData = false;
            for (const entry of entries) {
                if (!entry.generated_as_csv) {
                    hasNewData = true;
                    fileHasNewData = true;
                }
                // exclude internal tracking fields
                const { uploaded_to_drive, generated_as_csv, ...rest } = entry;
                // normalize malformed data field: [{...}] -> {...}
                if (Array.isArray(rest.data) && rest.data.length === 1) {
                    rest.data = rest.data[0];
                }
                masterData.push(flattenObj(rest, ''));
            }

            if (fileHasNewData) {
                filesToUpdate[filePath] = entries;
            }
        } catch (e) {
            console.error(`[${sourcePrefix}] Error fetching file ${filePath}:`, e);
            return { message: `[${sourcePrefix}] Error fetching file ${filePath}` };
        }
    }

    if (!hasNewData) {
        console.log(`[${sourcePrefix}] No new data since last CSV generation, skipping.`);
        return { message: `[${sourcePrefix}] No new data since last CSV generation` };
    }

    // 3. Resolve sessionId/deviceID pairs: drop completed:false if a completed:true partner exists,
    // but carry over its timestamps and clientInfo onto the completed entry.
    // sessionId takes priority for backward compatibility; deviceID is the current identifier.
    // Keys are namespaced to prevent accidental collisions between the two ID spaces.
    console.log(`[${sourcePrefix}] 3. Resolving sessionId/deviceID pairs...`);
    const bySession = {};
    const noSession = [];
    for (const entry of masterData) {
        const sid = entry['data.sessionId'];
        const did = entry['data.deviceID'];
        const groupKey = sid ? `session:${sid}` : did ? `device:${did}` : null;
        if (!groupKey) {
            noSession.push(entry);
        } else {
            (bySession[groupKey] = bySession[groupKey] || []).push(entry);
        }
    }

    const STARTED_KEYS = [
        'data.timestamp', 's3_timestamp', 'drive_timestamp',
        'clientInfo.ip', 'clientInfo.city', 'clientInfo.region',
        'clientInfo.country', 'clientInfo.lat', 'clientInfo.lon', 'clientInfo.timezone',
    ];

    const resolvedData = [...noSession];
    for (const sid in bySession) {
        const group = bySession[sid];
        const completes = group.filter(e => e['data.completed'] === true);
        const incompletes = group.filter(e => e['data.completed'] === false);
        if (completes.length === 1 && incompletes.length === 1) {
            // unambiguous pair: merge started fields from incomplete onto complete
            for (const key of STARTED_KEYS) {
                completes[0][key + '_started'] = incompletes[0][key];
            }
            resolvedData.push(completes[0]);
        } else {
            // multiple submissions from the same device, or lone entry: keep all rows as-is
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
    console.log(`[${sourcePrefix}] 4. Building CSV...`);
    const rows = [headers.map(csvEscape).join(',')];
    for (const entry of resolvedData) {
        rows.push(headers.map(h => csvEscape(entry[h])).join(','));
    }
    const csv = rows.join('\n');

    // 7. Upload CSV to S3
    console.log(`[${sourcePrefix}] 5. Uploading CSV to S3...`);
    const csvKey = `${destPrefix}${new Date().toISOString()}.csv`;
    try {
        await s3.send(new PutObjectCommand({
            Bucket: S3_BUCKET,
            Key: csvKey,
            ContentType: 'text/csv',
            Body: csv,
        }));
    } catch (e) {
        console.error(`[${sourcePrefix}] Error uploading CSV to S3:`, e);
        return { message: `[${sourcePrefix}] Error uploading CSV to S3` };
    }

    // 8. Mark all entries in affected files as generated_as_csv
    console.log(`[${sourcePrefix}] 6. Marking entries as generated_as_csv...`);
    for (const [filePath, entries] of Object.entries(filesToUpdate)) {
        try {
            for (const entry of entries) {
                entry.generated_as_csv = true;
            }
            await s3.send(new PutObjectCommand({
                Bucket: S3_BUCKET,
                Key: filePath,
                ContentType: 'application/json',
                Body: JSON.stringify(entries),
            }));
        } catch (e) {
            console.error(`[${sourcePrefix}] Error marking entries in ${filePath}:`, e);
            return { message: `[${sourcePrefix}] Error marking entries in ${filePath}` };
        }
    }

    console.log(`[${sourcePrefix}] CSV uploaded to s3://${S3_BUCKET}/${csvKey}`);
    return { message: `CSV uploaded to s3://${S3_BUCKET}/${csvKey}` };
}

export const handler = async () => {
    const [prodResult, testResult] = await Promise.all([
        processDirectory('data/', 'csv/'),
        processDirectory('test/', 'test_csv/'),
    ]);
    return { prod: prodResult, test: testResult };
};
