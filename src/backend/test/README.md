# Google Drive API Uploader Setup (Node.js)

This guide will walk you through the process of setting up a Google Cloud Platform (GCP) project, enabling the Google Drive API, and generating the client_secret.json file required to run the Node.js script.

## ⚠️ Important Security Note

The client_secret.json and token.json files contain sensitive credentials. Do not commit them to version control (e.g., Git). A .gitignore file is included to help prevent this.

## Setup Steps

### 1. Create a Google Cloud Platform Project

If you don't already have one, you'll need to create a project in the GCP Console.

Go to the Google Cloud Console.

Click the project selector dropdown in the top bar and click "NEW PROJECT".

Give your project a name (e.g., "Survey Response Uploader") and click "CREATE".

### 2. Enable the Google Drive API

You must enable the Google Drive API for your new project.

Make sure your new project is selected in the GCP Console.

In the navigation menu (☰), go to APIs & Services > Library.

Search for "Google Drive API" and click on it.

Click the "ENABLE" button.

### 3. Configure the OAuth Consent Screen

This screen is what users will see when they grant your application access to their Google Drive.

In the navigation menu, go to APIs & Services > OAuth consent screen.

Choose an "User Type":

Internal: Only for users within your Google Workspace organization.

External: For any user with a Google Account. Choose this if you are not using Google Workspace or if you want external users to authenticate.

Click "CREATE".

Fill in the required fields:

App name: A user-friendly name for your app (e.g., "Survey Uploader").

User support email: Your email address.

Developer contact information: Your email address.

Click "SAVE AND CONTINUE" through the "Scopes" and "Test users" sections. You don't need to add scopes here, as the script defines them. If you chose "External", you may need to add your own Google account as a test user.

Finally, review the summary and click "BACK TO DASHBOARD".

### 4. Create OAuth 2.0 Credentials

This is the final step to generate your client_secret.json file.

In the navigation menu, go to APIs & Services > Credentials.

Click "+ CREATE CREDENTIALS" at the top of the page and select "OAuth client ID".

For "Application type", select "Desktop app".

Give the client ID a name (e.g., "Desktop Client 1").

Click "CREATE".

A window will appear showing your Client ID and Client Secret. Click the "DOWNLOAD JSON" button.

Rename the downloaded file to client_secret.json.

Place this client_secret.json file in the same directory as your driveUploader.js script.

### 5. Install Node.js Dependencies

You need to install the required Google API client libraries using npm. Open your terminal or command prompt in the project directory (where package.json is located).

npm install


### 6. Run the Script

You are now ready to run the application.

Open your terminal or command prompt.

Navigate to the directory containing your project files.

Run the script:

node driveUploader.js


The first time you run it, a browser window will open asking you to authorize the application. Log in with your Google account and grant the requested permissions.

After successful authorization, the script will create a token.json file to store your credentials for future runs. It will then proceed to upload the sample JSON file to your Google Drive.

You should see a success message in your terminal and find the new JSON file in your "My Drive" folder on Google Drive.