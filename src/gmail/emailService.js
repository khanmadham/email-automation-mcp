import { google } from 'googleapis';
import { getAuthenticatedClient } from './auth.js';

let gmail;

/**
 * Initialize the Gmail service
 */
export async function initializeGmailService() {
  const auth = await getAuthenticatedClient();
  gmail = google.gmail({ version: 'v1', auth });
  return gmail;
}

/**
 * Fetch unread emails from inbox
 */
export async function getUnreadEmails(maxResults = 10) {
  try {
    const response = await gmail.users.messages.list({
      userId: 'me',
      q: 'is:unread',
      maxResults,
    });

    if (!response.data.messages) {
      return [];
    }

    const messages = await Promise.all(
      response.data.messages.map((message) => getEmailDetails(message.id))
    );

    return messages;
  } catch (error) {
    console.error('Error fetching unread emails:', error.message);
    throw error;
  }
}

/**
 * Get full email details including headers and body
 */
export async function getEmailDetails(messageId) {
  try {
    const response = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full',
    });

    const message = response.data;
    const headers = message.payload.headers;
    const from = headers.find((h) => h.name === 'From')?.value || 'Unknown';
    const subject = headers.find((h) => h.name === 'Subject')?.value || '(No Subject)';
    const to = headers.find((h) => h.name === 'To')?.value || '';

    let body = '';
    if (message.payload.parts) {
      const textPart = message.payload.parts.find(
        (part) => part.mimeType === 'text/plain'
      );
      if (textPart && textPart.body.data) {
        body = Buffer.from(textPart.body.data, 'base64').toString('utf-8');
      }
    } else if (message.payload.body.data) {
      body = Buffer.from(message.payload.body.data, 'base64').toString('utf-8');
    }

    return {
      id: messageId,
      from,
      subject,
      to,
      body,
      timestamp: message.internalDate,
    };
  } catch (error) {
    console.error(`Error getting email details for ${messageId}:`, error.message);
    throw error;
  }
}

/**
 * Send a reply to an email
 */
export async function sendReply(messageId, replyText) {
  try {
    const originalMessage = await getEmailDetails(messageId);
    const headers = originalMessage;

    const email = [
      `From: me`,
      `To: ${headers.from}`,
      `Subject: Re: ${headers.subject}`,
      `In-Reply-To: <${messageId}@mail.gmail.com>`,
      `References: <${messageId}@mail.gmail.com>`,
      '',
      replyText,
    ].join('\n');

    const encodedMessage = Buffer.from(email)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const response = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage,
        threadId: messageId,
      },
    });

    console.log(`Reply sent to ${headers.from}`);
    return response.data;
  } catch (error) {
    console.error(`Error sending reply for ${messageId}:`, error.message);
    throw error;
  }
}

/**
 * Mark an email as read
 */
export async function markAsRead(messageId) {
  try {
    await gmail.users.messages.modify({
      userId: 'me',
      id: messageId,
      requestBody: {
        removeLabelIds: ['UNREAD'],
      },
    });
  } catch (error) {
    console.error(`Error marking ${messageId} as read:`, error.message);
  }
}

/**
 * Add a label to an email
 */
export async function addLabel(messageId, labelName) {
  try {
    // Get or create label
    const labelsResponse = await gmail.users.labels.list({
      userId: 'me',
    });

    let label = labelsResponse.data.labels.find((l) => l.name === labelName);

    if (!label) {
      const newLabelResponse = await gmail.users.labels.create({
        userId: 'me',
        requestBody: {
          name: labelName,
          labelListVisibility: 'labelShow',
          messageListVisibility: 'show',
        },
      });
      label = newLabelResponse.data;
    }

    // Add label to message
    await gmail.users.messages.modify({
      userId: 'me',
      id: messageId,
      requestBody: {
        addLabelIds: [label.id],
      },
    });
  } catch (error) {
    console.error(`Error adding label to ${messageId}:`, error.message);
  }
}
