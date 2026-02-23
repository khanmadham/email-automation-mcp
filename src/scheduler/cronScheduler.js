import cron from 'node-cron';
import { processUnreadEmails } from '../processor/emailProcessor.js';
import { logger } from '../utils/logger.js';

let scheduledTask = null;
let currentIntervalMinutes = 5;

/**
 * Start the email processing scheduler
 */
export function startScheduler(intervalMinutes = 5) {
  try {
    currentIntervalMinutes = intervalMinutes;
    // Convert minutes to cron format (every N minutes)
    const cronExpression = `*/${intervalMinutes} * * * *`;

    logger.info(`Starting scheduler with interval: ${intervalMinutes} minute(s)`);
    logger.info(`Cron expression: ${cronExpression}`);

    scheduledTask = cron.schedule(cronExpression, async () => {
      logger.info('--- Email processing cycle started ---');

      try {
        const results = await processUnreadEmails(10);
        logger.info(
          `Email cycle completed - Processed: ${results.processed}, Skipped: ${results.skipped}, Failed: ${results.failed}`
        );
      } catch (error) {
        logger.error(`Email processing cycle failed: ${error.message}`);
      }

      logger.info('--- Email processing cycle ended ---');
    });

    // Run immediately on startup
    logger.info('Running initial email processing...');
    processUnreadEmails(10)
      .then((results) => {
        logger.info(
          `Initial processing completed - Processed: ${results.processed}, Skipped: ${results.skipped}, Failed: ${results.failed}`
        );
      })
      .catch((error) => {
        logger.error(`Initial processing failed: ${error.message}`);
      });

    return scheduledTask;
  } catch (error) {
    logger.error(`Failed to start scheduler: ${error.message}`);
    throw error;
  }
}

/**
 * Stop the scheduler
 */
export function stopScheduler() {
  if (scheduledTask) {
    logger.info('Stopping scheduler...');
    scheduledTask.stop();
    scheduledTask = null;
    logger.info('Scheduler stopped');
  }
}

/**
 * Check if scheduler is running
 */
export function isSchedulerRunning() {
  return scheduledTask !== null;
}

/**
 * Get scheduler status
 */
export function getSchedulerStatus() {
  return {
    running: scheduledTask !== null,
    interval_minutes: currentIntervalMinutes,
  };
}
