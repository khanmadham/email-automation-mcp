import { google } from 'googleapis';
import readline from 'readline';

// Load credentials from environment variables
const clientId = process.env.GMAIL_CLIENT_ID;
const clientSecret = process.env.GMAIL_CLIENT_SECRET;
const redirectUri = process.env.GMAIL_REDIRECT_URI || 'http://localhost:3000/oauth/callback';

// Initialize oauth2Client only if credentials are available
let oauth2Client = null;
if (clientId && clientSecret) {
  oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    redirectUri
  );
}

/**
 * Load and validate credentials, refreshing if needed
 */
export async function getAuthenticatedClient() {
  if (!oauth2Client) {
    throw new Error(
      'Gmail credentials not configured. Please run "npm run setup" first.'
    );
  }

  if (process.env.GOOGLE_TOKEN_JSON) {
    const savedCredentials = JSON.parse(process.env.GOOGLE_TOKEN_JSON);
    oauth2Client.setCredentials(savedCredentials);

    // Refresh token if expired
    if (oauth2Client.isTokenExpiring()) {
      const { credentials: refreshedCredentials } = await oauth2Client.refreshAccessToken();
      oauth2Client.setCredentials(refreshedCredentials);

      // Update the environment variable with new token
      // Note: In production, store this securely (database, secure keystore, etc.)
      process.env.GOOGLE_TOKEN_JSON = JSON.stringify(refreshedCredentials);
    }

    return oauth2Client;
  }

  throw new Error(
    `No tokens found. Please run 'npm run setup' to authenticate with Gmail first.`
  );
}

/**
 * Initialize OAuth flow and save credentials
 */
export async function initializeOAuth() {
  if (!oauth2Client) {
    throw new Error(
      'Gmail client credentials not configured. Please set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET.'
    );
  }

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

      // Display the token JSON for the user to add to .env
      const tokenJson = JSON.stringify(tokens);
      console.log('\n✅ Authentication successful!');
      console.log('Add this to your .env file:');
      console.log(`GOOGLE_TOKEN_JSON='${tokenJson}'`);
      console.log('\nOr set it as an environment variable:');
      console.log(`export GOOGLE_TOKEN_JSON='${tokenJson}'`);

      resolve(oauth2Client);
    });
  });
}
