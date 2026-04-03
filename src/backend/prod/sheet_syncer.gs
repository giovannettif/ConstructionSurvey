// Syncs the JSON files in a Google Drive folder to a Google Sheet
// This script is connected to a Google Sheet via Apps Script
const FOLDER_ID = PropertiesService.getScriptProperties().getProperty("FolderID");
const SHEET = SpreadsheetApp.getActiveSpreadsheet().getSheetById(0);

// Recursively flattens a nested object using dot-notation keys.
// Arrays are serialized to JSON strings since cells hold scalar values.
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

function updateSheet() {
    try {
        const root = DriveApp.getFolderById(FOLDER_ID);
        const masterData = [];

        // bfs
        const queue = [root];

        while (queue.length > 0) {
            const currFolder = queue.shift();
            const foldersIt = currFolder.getFolders();
            const filesIt = currFolder.getFiles();

            // push folders onto queue
            while (foldersIt.hasNext()) {
                queue.push(foldersIt.next());
            }

            // process files
            while (filesIt.hasNext()) {
                const file = filesIt.next();
                if (!file.getName().endsWith(".json")) continue;
                const content = file.getBlob().getDataAsString();
                const data = JSON.parse(content);

                masterData.push(Object.assign(flattenObj(data, ''), { phase: currFolder.getName() }));
            }
        }

        // resolve sessionId pairs: drop completed:false if a completed:true partner exists,
        // but carry over its timestamps onto the completed entry
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

        // sort descending by data.timestamp
        resolvedData.sort((a, b) => {
            const ta = a['data.timestamp'] ?? '';
            const tb = b['data.timestamp'] ?? '';
            return tb < ta ? -1 : tb > ta ? 1 : 0;
        });

        // get unique keys, with data.timestamp pinned first
        const uniqueKeys = new Set();
        for (const entry of resolvedData) {
            for (const key in entry) {
                uniqueKeys.add(key);
            }
        }
        uniqueKeys.delete('data.timestamp');
        const headers = ['data.timestamp', ...uniqueKeys];
        const rangeData = [headers];

        for (const entry of resolvedData) {
            const row = [];
            for (const key of headers) {
                row.push(entry[key]);
            }
            rangeData.push(row);
        }

        // back up the current sheet before overwriting
        const ss = SpreadsheetApp.getActiveSpreadsheet();
        const backupName = new Date().toISOString().replace(/[:.]/g, '-') + '_backup';
        SHEET.copyTo(ss).setName(backupName);

        SHEET.clearContents();

        // add metadata
        const metadata = [
            ["DO NOT EDIT THIS SHEET. IT IS AUTOMATICALLY UPDATED."],
            ["Last updated: " + new Date().toISOString()],
        ];
        SHEET.getRange(1, 1, metadata.length, metadata[0].length).setValues(metadata);

        // add data
        SHEET.getRange(metadata.length + 1, 1, rangeData.length, headers.length).setValues(rangeData);

    } catch (e) {
        console.error('Error: ' + e);
    }
}
