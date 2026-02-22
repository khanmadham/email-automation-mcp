import { getUnreadEmails, sendReply, markAsRead, addLabel } from '../gmail/emailService.js';
import { shouldProcessEmail, buildContextFromRules } from '../filters/engine.js';
import { generatePersonalizedResponse } from '../ai/openai.js';
import { logger } from '../utils/logger.js';

/**
 * Process a single email: filter, analyze, and reply
 */
export async function processEmail(email) {
  try {
    logger.info(`Processing email from ${email.from}: ${email.subject}`);

    // Check if email matches any filtering rules
    if (!shouldProcessEmail(email)) {
      logger.debug(`Email skipped - does not match any rules: ${email.subject}`);
      return { status: 'skipped', reason: 'no_matching_rules' };
    }

    // Build context from matching rules
    const context = buildContextFromRules(email);
    logger.debug(`Generated context: ${context}`);

    // Generate personalized response
    const response = await generatePersonalizedResponse(email, context);
    if (!response) {
      logger.warn(`Failed to generate response for ${email.subject}`);
      return { status: 'failed', reason: 'response_generation_failed' };
    }

    logger.debug(`Generated response: ${response.substring(0, 100)}...`);

    // Send reply
    await sendReply(email.id, response);
    logger.info(`Reply sent to ${email.from}`);

    // Mark as read if configured
    if (process.env.MARK_AS_READ_AFTER_REPLY === 'true') {
      await markAsRead(email.id);
      logger.debug(`Marked ${email.id} as read`);
    }

    // Add label for tracking
    await addLabel(email.id, 'AutoReplied');
    logger.debug(`Added AutoReplied label to ${email.id}`);

    return {
      status: 'success',
      from: email.from,
      subject: email.subject,
      responseLength: response.length,
    };
  } catch (error) {
    logger.error(`Error processing email from ${email.from}: ${error.message}`);
    return { status: 'error', reason: error.message };
  }
}

/**
 * Process batch of emails
 */
export async function processBatch(emails) {
  const results = {
    total: emails.length,
    processed: 0,
    skipped: 0,
    failed: 0,
  };

  for (const email of emails) {
    const result = await processEmail(email);

    if (result.status === 'success') {
      results.processed++;
    } else if (result.status === 'skipped') {
      results.skipped++;
    } else {
      results.failed++;
    }

    // Small delay between processing emails to avoid rate limits
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  logger.info(`Batch processing complete: ${JSON.stringify(results)}`);
  return results;
}

/**
 * Main processing loop - fetch and process unread emails
 */
export async function processUnreadEmails(maxEmails = 10) {
  try {
    logger.info(`Starting email processing cycle...`);

    const emails = await getUnreadEmails(maxEmails);

    if (emails.length === 0) {
      logger.info('No unread emails to process');
      return { total: 0, processed: 0, skipped: 0, failed: 0 };
    }

    logger.info(`Found ${emails.length} unread email(s)`);

    const results = await processBatch(emails);
    return results;
  } catch (error) {
    logger.error(`Error in processing cycle: ${error.message}`);
    throw error;
  }
}
