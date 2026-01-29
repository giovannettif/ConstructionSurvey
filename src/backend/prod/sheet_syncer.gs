// Syncs the JSON files in a Google Drive folder to a Google Sheet
// This script is connected to a Google Sheet via Apps Script
// TODO: make this code efficient using AI
// leave here or put inside function?
const FOLDER_ID = PropertiesService.getScriptProperties().getProperty("FolderID");
const SHEET = SpreadsheetApp.getActiveSpreadsheet().getSheetById(0);

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

                // flatten data 
                // bring out survey data from under 'data' field
                const surveyData = JSON.parse(JSON.stringify(data.data[0]));
                delete data.data;
                // bring out answers from under 'answers' field
                const answerData = JSON.parse(JSON.stringify(surveyData.answers));
                delete surveyData.answers;

                masterData.push(Object.assign(surveyData, data, answerData, {
                    phase: currFolder.getName()
                }));
            }
        }

        // get unique keys
        const uniqueKeys = new Set();
        for (const entry of masterData) {
            for (const key in entry) {
                uniqueKeys.add(key);
            }
        }
        const headers = [...uniqueKeys];
        const rangeData = [headers];

        for (const entry of masterData) {
            const row = [];
            for (const key of headers) {
                row.push(entry[key]);
            }
            rangeData.push(row);
        }

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
