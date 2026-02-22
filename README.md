# Email Automation System

A Node.js application that automatically analyzes and replies to emails with personalized messages using Gmail API and OpenAI.

## Features

- **Automated Email Monitoring**: Continuously monitors Gmail inbox for new unread emails
- **Intelligent Filtering**: Custom rule-based filtering to determine which emails to reply to
- **AI-Powered Responses**: Generates personalized responses using OpenAI's language models
- **Personalization**: Addresses senders by name and includes company information
- **Configurable Rules**: JSON-based rule system supporting keyword matching and custom conditions
- **Scheduled Processing**: Cron-based scheduling with configurable intervals
- **Comprehensive Logging**: Winston-based logging for debugging and monitoring
- **Secure Authentication**: OAuth 2.0 for Gmail with token management

## Prerequisites

- Node.js (v16 or higher)
- Gmail account with API access
- OpenAI API key
- Google Cloud Project with Gmail API enabled

## Setup Instructions

### 1. Clone and Install Dependencies

```bash
cd email-automation
npm install
```

### 2. Set Up Gmail API Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project
3. Enable the Gmail API
4. Create OAuth 2.0 credentials (Desktop application):
   - Click "Create Credentials" → "OAuth 2.0 Client ID"
   - Select "Desktop application"
   - Download the credentials JSON
5. Copy the Client ID and Client Secret

### 3. Configure Environment Variables

Create a `.env` file based on `.env.example`:

```bash
cp .env.example .env
```

Edit `.env` and add your credentials:

```env
# Gmail OAuth
GMAIL_CLIENT_ID=your_client_id_here
GMAIL_CLIENT_SECRET=your_client_secret_here
GMAIL_REDIRECT_URI=http://localhost:3000/oauth/callback

# OpenAI API
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-4o-mini

# Processing Settings
PROCESSING_INTERVAL_MINUTES=5
MARK_AS_READ_AFTER_REPLY=true
LOG_LEVEL=info
```

### 4. Authenticate with Gmail

Run the setup script to authenticate:

```bash
npm run setup
```

This will:
1. Generate an authentication URL
2. Open your browser (or display the URL)
3. Ask you to authorize the application
4. Save the OAuth tokens locally

### 5. Configure Filtering Rules

Edit `config/rules.json` to customize which emails get auto-replies:

```json
{
  "rules": [
    {
      "id": "support_inquiries",
      "name": "Support Inquiry Auto-Reply",
      "enabled": true,
      "conditions": {
        "keywords": ["help", "support", "issue"],
        "mustMatch": "any"
      },
      "context": "This is a customer support inquiry"
    }
  ]
}
```

**Rule Configuration**:
- `id`: Unique identifier
- `name`: Human-readable name
- `enabled`: Toggle rule on/off
- `conditions.keywords`: Array of keywords to match
- `conditions.mustMatch`: "any" (match at least one) or "all" (match all)
- `context`: Description passed to AI for personalization

## Running the Application

### Start the Email Automation

```bash
npm start
```

### Development Mode (with auto-reload)

```bash
npm run dev
```

The application will:
1. Initialize the Gmail service
2. Start the scheduler
3. Process unread emails based on configured rules
4. Generate AI-powered responses
5. Send replies and mark emails as read (if configured)

## Project Structure

```
email-automation/
├── config/
│   ├── rules.json           # Email filtering rules
│   └── settings.json        # Application settings
├── src/
│   ├── gmail/
│   │   ├── auth.js          # OAuth 2.0 setup
│   │   ├── emailService.js  # Gmail API operations
│   │   └── setup.js         # Authentication flow
│   ├── filters/
│   │   └── engine.js        # Rule evaluation engine
│   ├── ai/
│   │   └── openai.js        # OpenAI integration
│   ├── processor/
│   │   └── emailProcessor.js # Email processing pipeline
│   ├── scheduler/
│   │   └── cronScheduler.js # Cron scheduling
│   ├── utils/
│   │   └── logger.js        # Winston logging setup
│   └── index.js             # Application entry point
├── logs/                    # Application logs
├── credentials.json         # OAuth tokens (auto-generated)
├── package.json
├── .env.example
└── README.md
```

## How It Works

```
1. Scheduler triggers every N minutes
                    ↓
2. Fetch unread emails from Gmail
                    ↓
3. For each email, apply filtering rules
                    ↓
4. If email matches rules:
   - Extract sender name, company domain
   - Send email content to OpenAI
   - Generate personalized response
                    ↓
5. Send reply to original sender
                    ↓
6. Mark as read (if configured)
                    ↓
7. Add "AutoReplied" label for tracking
```

## Configuration Options

### Email Processing Interval

Set in `.env`:
```env
PROCESSING_INTERVAL_MINUTES=5  # Process emails every 5 minutes
```

### OpenAI Model Selection

```env
OPENAI_MODEL=gpt-4o-mini      # Fast, cost-effective
OPENAI_MODEL=gpt-4-turbo       # More capable
```

### Logging Level

```env
LOG_LEVEL=info                 # Options: error, warn, info, debug
```

## Personalizing Email Responses

The system personalizes responses by:

1. **Extracting Sender Information**:
   - Full name from email "From" field
   - Company domain from email address
   - Email subject for context

2. **Passing Context to OpenAI**:
   - Includes the rule's context description
   - Provides email subject and body
   - Generates professional yet personalized responses

3. **Using System Prompt**:
   - Instructs the model to address sender by name
   - Maintains professional tone
   - Keeps responses concise (2-3 sentences)

### Example: Custom Rule for Inquiry

```json
{
  "id": "pricing_inquiry",
  "name": "Pricing Request Auto-Reply",
  "enabled": true,
  "conditions": {
    "keywords": ["pricing", "cost", "plans"],
    "mustMatch": "any"
  },
  "context": "Customer is asking about pricing and subscription options"
}
```

When an email matches, the system generates a personalized response that:
- Addresses the customer by first name
- Acknowledges their interest in pricing
- Provides helpful context about your plans

## Monitoring and Logging

Logs are saved to the `logs/` directory:

- `logs/combined.log` - All log messages
- `logs/error.log` - Error messages only

Monitor in real-time:

```bash
tail -f logs/combined.log
```

## Troubleshooting

### Authentication Issues

If you get "No credentials found" error:
```bash
npm run setup
```

### OpenAI API Errors

Check your API key:
```bash
echo $OPENAI_API_KEY
```

### Email Processing Not Working

1. Check logs: `tail -f logs/combined.log`
2. Verify rules in `config/rules.json` are enabled
3. Test with an email containing keywords from your rules

### Rate Limiting

If you hit OpenAI rate limits:
- Reduce `PROCESSING_INTERVAL_MINUTES` or email batch size
- Use a lower-cost model like `gpt-3.5-turbo`
- Monitor API usage in OpenAI dashboard

## Security Considerations

- **Token Storage**: OAuth tokens stored in `credentials.json` (add to `.gitignore`)
- **API Keys**: Keep OPENAI_API_KEY in `.env` (never commit)
- **Email Data**: Sanitized before sending to OpenAI
- **Rate Limiting**: Implemented between email processing to avoid abuse

## Cost Management

- **OpenAI**: ~$0.15 per 1000 emails using gpt-4o-mini
- **Gmail API**: Free (within quota limits)
- **Estimate**: Processing 100 emails/day costs ~$0.45/month

### Reducing Costs

1. Use `gpt-3.5-turbo` instead of `gpt-4-turbo`
2. Increase `PROCESSING_INTERVAL_MINUTES` to process less frequently
3. Add more specific rules to filter fewer emails

## Advanced Configuration

### Caching Rules

Rules are cached in memory and auto-reloaded. To hot-reload:
```javascript
import { reloadRules } from './filters/engine.js';
reloadRules(); // Reloads rules.json
```

### Custom Response Logic

Modify `src/processor/emailProcessor.js` to customize:
- Response generation logic
- Email filtering criteria
- Post-processing steps

### Database Integration

For future email history tracking, add SQLite to `package.json`:
```bash
npm install better-sqlite3
```

## Support and Debugging

### Enable Debug Logging

```env
LOG_LEVEL=debug
```

### Test Email Processing Manually

Create `test.js`:
```javascript
import { processUnreadEmails } from './src/processor/emailProcessor.js';
import dotenv from 'dotenv';

dotenv.config();
await import('./src/gmail/emailService.js').then(m => m.initializeGmailService());
const results = await processUnreadEmails(5);
console.log(results);
```

## Contributing

To extend the system:

1. **Add new filters**: Edit `config/rules.json`
2. **New AI features**: Modify `src/ai/openai.js`
3. **Custom email operations**: Extend `src/gmail/emailService.js`

## License

MIT

## Disclaimer

- Always test with a limited set of emails first
- Review generated responses before enabling auto-replies to customers
- Monitor the system regularly to ensure quality of responses
- Comply with relevant email regulations (CAN-SPAM, GDPR, etc.)
