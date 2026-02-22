import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { initializeOAuth } from './auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Check for credentials in .env or downloaded JSON
const credentialsDir = path.resolve(__dirname, '../../');
const files = fs.readdirSync(credentialsDir).filter(f => f.startsWith('client_secret_') && f.endsWith('.json'));

if (!files.length && (!process.env.GMAIL_CLIENT_ID || !process.env.GMAIL_CLIENT_SECRET)) {
  console.error(
    'Error: GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET must be set in .env file, or client_secret_*.json must be present'
  );
  console.error('1. Go to https://console.cloud.google.com/');
  console.error('2. Create a new project and enable Gmail API');
  console.error('3. Create OAuth 2.0 credentials (Web application)');
  console.error('4. Download the JSON file and place it in the project root, OR');
  console.error('5. Add the credentials to your .env file');
  process.exit(1);
}

console.log('Starting Gmail OAuth 2.0 setup...');
if (files.length > 0) {
  console.log(`Using credentials from: ${files[0]}`);
} else {
  console.log('Using credentials from .env file');
}

initializeOAuth().then(() => {
  console.log('Gmail authentication successful!');
  process.exit(0);
});
