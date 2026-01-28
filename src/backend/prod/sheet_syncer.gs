// Syncs the JSON files in a Google Drive folder to a Google Sheet
// This script is connected to a Google Sheet via Apps Script
const FOLDER_ID = PropertiesService.getScriptProperties().getProperty("FolderID");

function updateSheet() {
    try {
        const root = DriveApp.getFolderById(FOLDER_ID);
        const filesIterator = root.getFiles();

        console.log('Files in folder:', root.getName());

        while (filesIterator.hasNext()) {
            const file = filesIterator.next();
            console.log('Name: ' + file.getName() + ' | ID: ' + file.getId());
        }

        const subfolders = root.getFolders();
        console.log('Subfolders in folder:', root.getName());
        while (subfolders.hasNext()) {
            const subfolder = subfolders.next();
            console.log('- Folder Name: ' + subfolder.getName() + ' | ID: ' + subfolder.getId());
        }
    } catch (e) {
        console.error('Error: ' + e.message);
    }
}
