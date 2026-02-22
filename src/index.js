import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeGmailService } from './gmail/emailService.js';
import { startScheduler, stopScheduler } from './scheduler/cronScheduler.js';
import { logger } from './utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Validate environment variables - only enforce in production
function validateEnvironment() {
  const requiredVars = [
    'GMAIL_CLIENT_ID',
    'GMAIL_CLIENT_SECRET',
  ];

  const missing = requiredVars.filter((v) => !process.env[v]);

  if (missing.length > 0) {
    logger.warn(
      `Warning: Missing Gmail credentials: ${missing.join(', ')}`
    );
    logger.info('The system will start but email processing will be unavailable until credentials are configured.');
    logger.info('To set up credentials, run: npm run setup');
    return false;
  }

  // Check for OpenAI API key
  if (!process.env.OPENAI_API_KEY) {
    logger.error('Missing required environment variable: OPENAI_API_KEY');
    logger.error('Please add OPENAI_API_KEY to your .env file');
    return false;
  }

  return true;
}

/**
 * Initialize and start the email automation system
 */
async function start() {
  try {
    logger.info('=== Email Automation System Starting ===');

    // Validate environment
    const credentialsConfigured = validateEnvironment();

    if (credentialsConfigured) {
      // Initialize Gmail service
      logger.info('Initializing Gmail service...');
      await initializeGmailService();
      logger.info('Gmail service initialized successfully');

      // Get processing interval from env
      const intervalMinutes = parseInt(
        process.env.PROCESSING_INTERVAL_MINUTES || '5',
        10
      );

      // Start the scheduler
      startScheduler(intervalMinutes);

      logger.info(
        `Email automation system started successfully. Processing emails every ${intervalMinutes} minute(s)`
      );
    } else {
      logger.warn('Starting in degraded mode - waiting for credential configuration');
      logger.info('Once credentials are configured, restart the application to begin processing emails');
    }
  } catch (error) {
    logger.error(`Failed to start email automation: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Graceful shutdown
 */
function setupGracefulShutdown() {
  const signals = ['SIGINT', 'SIGTERM'];

  signals.forEach((signal) => {
    process.on(signal, () => {
      logger.info(`Received ${signal}, shutting down gracefully...`);
      stopScheduler();
      logger.info('Email automation system stopped');
      process.exit(0);
    });
  });
}

// Setup error handlers
process.on('uncaughtException', (error) => {
  logger.error(`Uncaught Exception: ${error.message}`);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error(`Unhandled Rejection: ${reason}`);
  process.exit(1);
});

// Start the application
setupGracefulShutdown();
start();
