import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TOKEN_PATH = path.join(__dirname, '../../credentials.json');

// Try to load from downloaded JSON file, fallback to environment variables
let clientId, clientSecret, redirectUri;

// Look for the downloaded credentials file
const credentialsPath = path.join(__dirname, '../../client_secret_*.json');
const credentialsDir = path.join(__dirname, '../../');
const files = fs.readdirSync(credentialsDir).filter(f => f.startsWith('client_secret_') && f.endsWith('.json'));

if (files.length > 0) {
  const credFile = JSON.parse(fs.readFileSync(path.join(credentialsDir, files[0]), 'utf-8'));
  clientId = credFile.web.client_id;
  clientSecret = credFile.web.client_secret;
  redirectUri = credFile.web.redirect_uris[0];
} else {
  clientId = process.env.GMAIL_CLIENT_ID;
  clientSecret = process.env.GMAIL_CLIENT_SECRET;
  redirectUri = process.env.GMAIL_REDIRECT_URI || 'http://localhost:3000/oauth/callback';
}

const oauth2Client = new google.auth.OAuth2(
  clientId,
  clientSecret,
  redirectUri
);

/**
 * Load and validate credentials, refreshing if needed
 */
export async function getAuthenticatedClient() {
  let credentials;

  if (fs.existsSync(TOKEN_PATH)) {
    const savedCredentials = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'));
    oauth2Client.setCredentials(savedCredentials);

    // Refresh token if expired
    if (oauth2Client.isTokenExpiring()) {
      const { credentials: refreshedCredentials } = await oauth2Client.refreshAccessToken();
      oauth2Client.setCredentials(refreshedCredentials);
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(refreshedCredentials));
    }

    return oauth2Client;
  }

  throw new Error(
    `No credentials found. Please run 'npm run setup' to authenticate with Gmail first.`
  );
}

/**
 * Initialize OAuth flow and save credentials
 */
export async function initializeOAuth() {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/gmail.modify'],
  });

  console.log('Authorize this app by visiting this url:', authUrl);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question('Enter the code from that page here: ', async (code) => {
      rl.close();

      const { tokens } = await oauth2Client.getToken(code);
      oauth2Client.setCredentials(tokens);
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));

      console.log('Credentials saved to', TOKEN_PATH);
      resolve(oauth2Client);
    });
  });
}
