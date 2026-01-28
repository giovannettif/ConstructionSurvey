// Syncs the JSON files in a Google Drive folder to a Google Sheet
// This script is connected to a Google Sheet via Apps Script
// leave here or put inside function?
const FOLDER_ID = PropertiesService.getScriptProperties().getProperty("FolderID");
const SHEET = SpreadsheetApp.getActiveSpreadsheet().getSheetById(0);

function updateSheet() {
    try {
        const root = DriveApp.getFolderById(FOLDER_ID);
        const masterData = [];

        // bfs
        const queue = [root];

        while (queue.length() > 0) {
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
                const content = file.getBlob().getDataAsString();
                const data = JSON.parse(content);

                masterData.push({
                    ...data,
                    phase: currFolder.getName()
                });
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

        // TODO: test this!
        SHEET.getRange(1, 1, rangeData.length, headers.length).setValues(rangeData);

    } catch (e) {
        console.error('Error: ' + e.message);
    }
}
