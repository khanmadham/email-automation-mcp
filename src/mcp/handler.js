import { Server, Tool, Resource, Prompt, TextContent, ErrorCode } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { getUnreadEmails, getEmailDetails, sendReply, markAsRead, addLabel } from '../gmail/emailService.js';
import { processBatch } from '../processor/emailProcessor.js';
import { getSchedulerStatus, stopScheduler, startScheduler } from '../scheduler/cronScheduler.js';
import { logger } from '../utils/logger.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load configuration files
const rulesPath = path.resolve(__dirname, '../../config/rules.json');
const settingsPath = path.resolve(__dirname, '../../config/settings.json');

let mcp_server = null;
let stdio_transport = null;
let processing_stats = {
  total_processed: 0,
  total_skipped: 0,
  total_failed: 0,
  last_run: null,
  runs_today: 0,
};

/**
 * Initialize MCP Server with tools, resources, and prompts
 */
export async function initializeMCPServer() {
  try {
    mcp_server = new Server({
      name: 'email-automation-mcp',
      version: '1.0.0',
    });

    // Register tools
    registerTools();

    // Register resources
    registerResources();

    // Register prompts
    registerPrompts();

    logger.info('MCP Server initialized successfully');
    return mcp_server;
  } catch (error) {
    logger.error(`Failed to initialize MCP Server: ${error.message}`);
    throw error;
  }
}

/**
 * Register all MCP tools
 */
function registerTools() {
  mcp_server.tool(
    'get_unread_emails',
    'Fetch unread emails from the inbox',
    {
      type: 'object',
      properties: {
        max_results: {
          type: 'number',
          description: 'Maximum number of emails to fetch (default: 10)',
        },
      },
    },
    async (params) => {
      try {
        const maxResults = params.max_results || 10;
        const emails = await getUnreadEmails(maxResults);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  count: emails.length,
                  emails: emails.map((e) => ({
                    id: e.id,
                    from: e.from,
                    subject: e.subject,
                    timestamp: e.timestamp,
                  })),
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        logger.error(`Error in get_unread_emails: ${error.message}`);
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  mcp_server.tool(
    'get_email',
    'Get full details of a specific email',
    {
      type: 'object',
      properties: {
        message_id: {
          type: 'string',
          description: 'The Gmail message ID',
        },
      },
      required: ['message_id'],
    },
    async (params) => {
      try {
        const email = await getEmailDetails(params.message_id);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(email, null, 2),
            },
          ],
        };
      } catch (error) {
        logger.error(`Error in get_email: ${error.message}`);
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  mcp_server.tool(
    'send_reply',
    'Send a reply to an email',
    {
      type: 'object',
      properties: {
        message_id: {
          type: 'string',
          description: 'The Gmail message ID to reply to',
        },
        reply_text: {
          type: 'string',
          description: 'The reply message text',
        },
      },
      required: ['message_id', 'reply_text'],
    },
    async (params) => {
      try {
        await sendReply(params.message_id, params.reply_text);
        return {
          content: [
            {
              type: 'text',
              text: 'Reply sent successfully',
            },
          ],
        };
      } catch (error) {
        logger.error(`Error in send_reply: ${error.message}`);
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  mcp_server.tool(
    'mark_as_read',
    'Mark an email as read',
    {
      type: 'object',
      properties: {
        message_id: {
          type: 'string',
          description: 'The Gmail message ID',
        },
      },
      required: ['message_id'],
    },
    async (params) => {
      try {
        await markAsRead(params.message_id);
        return {
          content: [
            {
              type: 'text',
              text: 'Email marked as read',
            },
          ],
        };
      } catch (error) {
        logger.error(`Error in mark_as_read: ${error.message}`);
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  mcp_server.tool(
    'add_label',
    'Add a label to an email',
    {
      type: 'object',
      properties: {
        message_id: {
          type: 'string',
          description: 'The Gmail message ID',
        },
        label_name: {
          type: 'string',
          description: 'The label name to add',
        },
      },
      required: ['message_id', 'label_name'],
    },
    async (params) => {
      try {
        await addLabel(params.message_id, params.label_name);
        return {
          content: [
            {
              type: 'text',
              text: `Label "${params.label_name}" added successfully`,
            },
          ],
        };
      } catch (error) {
        logger.error(`Error in add_label: ${error.message}`);
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  mcp_server.tool(
    'process_emails_now',
    'Trigger immediate batch processing of unread emails',
    {},
    async () => {
      try {
        const emails = await getUnreadEmails();
        if (emails.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: 'No unread emails to process',
              },
            ],
          };
        }

        const results = await processBatch(emails);
        processing_stats.total_processed += results.processed;
        processing_stats.total_skipped += results.skipped;
        processing_stats.total_failed += results.failed;
        processing_stats.last_run = new Date().toISOString();
        processing_stats.runs_today += 1;

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(results, null, 2),
            },
          ],
        };
      } catch (error) {
        logger.error(`Error in process_emails_now: ${error.message}`);
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  mcp_server.tool(
    'toggle_rule',
    'Enable or disable an email processing rule',
    {
      type: 'object',
      properties: {
        rule_id: {
          type: 'string',
          description: 'The rule ID to toggle',
        },
        enabled: {
          type: 'boolean',
          description: 'Whether to enable or disable the rule',
        },
      },
      required: ['rule_id', 'enabled'],
    },
    async (params) => {
      try {
        const rules = JSON.parse(fs.readFileSync(rulesPath, 'utf-8'));
        const rule = rules.rules.find((r) => r.id === params.rule_id);

        if (!rule) {
          return {
            content: [
              {
                type: 'text',
                text: `Rule "${params.rule_id}" not found`,
              },
            ],
            isError: true,
          };
        }

        rule.enabled = params.enabled;
        fs.writeFileSync(rulesPath, JSON.stringify(rules, null, 2));

        logger.info(`Rule "${params.rule_id}" set to ${params.enabled ? 'enabled' : 'disabled'}`);

        return {
          content: [
            {
              type: 'text',
              text: `Rule "${params.rule_id}" is now ${params.enabled ? 'enabled' : 'disabled'}`,
            },
          ],
        };
      } catch (error) {
        logger.error(`Error in toggle_rule: ${error.message}`);
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  mcp_server.tool(
    'update_rule',
    'Update a rule\'s keywords or context',
    {
      type: 'object',
      properties: {
        rule_id: {
          type: 'string',
          description: 'The rule ID to update',
        },
        keywords: {
          type: 'array',
          items: { type: 'string' },
          description: 'New keywords for the rule',
        },
        context: {
          type: 'string',
          description: 'New context description for the rule',
        },
      },
      required: ['rule_id'],
    },
    async (params) => {
      try {
        const rules = JSON.parse(fs.readFileSync(rulesPath, 'utf-8'));
        const rule = rules.rules.find((r) => r.id === params.rule_id);

        if (!rule) {
          return {
            content: [
              {
                type: 'text',
                text: `Rule "${params.rule_id}" not found`,
              },
            ],
            isError: true,
          };
        }

        if (params.keywords) {
          rule.conditions.keywords = params.keywords;
        }
        if (params.context) {
          rule.context = params.context;
        }

        fs.writeFileSync(rulesPath, JSON.stringify(rules, null, 2));

        logger.info(`Rule "${params.rule_id}" updated`);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(rule, null, 2),
            },
          ],
        };
      } catch (error) {
        logger.error(`Error in update_rule: ${error.message}`);
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  mcp_server.tool(
    'get_system_status',
    'Get the current system and scheduler status',
    {},
    async () => {
      try {
        const status = getSchedulerStatus();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  scheduler_running: status.running,
                  current_interval_minutes: status.interval_minutes,
                  uptime_seconds: process.uptime(),
                  timestamp: new Date().toISOString(),
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        logger.error(`Error in get_system_status: ${error.message}`);
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  mcp_server.tool(
    'get_statistics',
    'Get email processing statistics',
    {},
    async () => {
      try {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(processing_stats, null, 2),
            },
          ],
        };
      } catch (error) {
        logger.error(`Error in get_statistics: ${error.message}`);
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}

/**
 * Register all MCP resources
 */
function registerResources() {
  mcp_server.resource(
    'emails/unread',
    'List of unread emails',
    async () => {
      try {
        const emails = await getUnreadEmails(100);
        return {
          contents: [
            {
              uri: 'emails/unread',
              mimeType: 'application/json',
              text: JSON.stringify(
                {
                  count: emails.length,
                  emails: emails.map((e) => ({
                    id: e.id,
                    from: e.from,
                    subject: e.subject,
                    timestamp: e.timestamp,
                  })),
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        logger.error(`Error reading emails/unread resource: ${error.message}`);
        throw error;
      }
    }
  );

  mcp_server.resource(
    'emails/{messageId}',
    'Full details of a specific email',
    async (uri) => {
      try {
        const messageId = uri.split('/')[1];
        const email = await getEmailDetails(messageId);
        return {
          contents: [
            {
              uri: uri,
              mimeType: 'application/json',
              text: JSON.stringify(email, null, 2),
            },
          ],
        };
      } catch (error) {
        logger.error(`Error reading email resource: ${error.message}`);
        throw error;
      }
    }
  );

  mcp_server.resource(
    'rules',
    'Email processing rules configuration',
    async () => {
      try {
        const rules = JSON.parse(fs.readFileSync(rulesPath, 'utf-8'));
        return {
          contents: [
            {
              uri: 'rules',
              mimeType: 'application/json',
              text: JSON.stringify(rules, null, 2),
            },
          ],
        };
      } catch (error) {
        logger.error(`Error reading rules resource: ${error.message}`);
        throw error;
      }
    }
  );

  mcp_server.resource(
    'settings',
    'System settings and configuration',
    async () => {
      try {
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
        return {
          contents: [
            {
              uri: 'settings',
              mimeType: 'application/json',
              text: JSON.stringify(settings, null, 2),
            },
          ],
        };
      } catch (error) {
        logger.error(`Error reading settings resource: ${error.message}`);
        throw error;
      }
    }
  );

  mcp_server.resource(
    'status',
    'Real-time system health and scheduler status',
    async () => {
      try {
        const schedulerStatus = getSchedulerStatus();
        return {
          contents: [
            {
              uri: 'status',
              mimeType: 'application/json',
              text: JSON.stringify(
                {
                  scheduler_running: schedulerStatus.running,
                  current_interval_minutes: schedulerStatus.interval_minutes,
                  uptime_seconds: process.uptime(),
                  processing_stats: processing_stats,
                  timestamp: new Date().toISOString(),
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        logger.error(`Error reading status resource: ${error.message}`);
        throw error;
      }
    }
  );
}

/**
 * Register all MCP prompts
 */
function registerPrompts() {
  mcp_server.prompt(
    'email_analysis_workflow',
    'How to analyze and respond to emails using this email automation system',
    async () => {
      return {
        messages: [
          {
            role: 'user',
            content:
              'You are an email automation assistant. Here is your workflow:\n\n' +
              '1. **Check Unread Emails**: Use get_unread_emails to see what needs attention\n' +
              '2. **Analyze Content**: Use get_email to read full email details\n' +
              '3. **Match Rules**: Check the rules resource to understand which rules apply\n' +
              '4. **Generate Response**: Create a personalized response based on the email content and applicable rules\n' +
              '5. **Send Reply**: Use send_reply to send your response\n' +
              '6. **Update Status**: Use mark_as_read and add_label to track processing\n\n' +
              'Example workflow: Get unread emails → Find a sales inquiry matching the sales_inquiries rule → Generate a response about pricing → Send the reply → Mark as read',
          },
        ],
      };
    }
  );

  mcp_server.prompt(
    'rule_management',
    'How to configure and manage email processing rules',
    async () => {
      return {
        messages: [
          {
            role: 'user',
            content:
              'To manage email processing rules:\n\n' +
              '1. **View Rules**: Use the rules resource to see current configuration\n' +
              '2. **Enable/Disable**: Use toggle_rule to turn rules on or off\n' +
              '3. **Update Keywords**: Use update_rule to change keywords that trigger a rule\n' +
              '4. **Update Context**: Use update_rule to change the context description\n\n' +
              'Current available rules:\n' +
              '- support_inquiries: Triggered by keywords like help, support, issue, problem\n' +
              '- meeting_requests: Triggered by keywords like meeting, call, schedule, available\n' +
              '- sales_inquiries: Triggered by keywords like pricing, cost, plans, subscribe, features\n' +
              '- feedback: Triggered by keywords like feedback, suggestion, improvement',
          },
        ],
      };
    }
  );

  mcp_server.prompt(
    'automation_best_practices',
    'Best practices for email automation using OpenAI and Gmail',
    async () => {
      return {
        messages: [
          {
            role: 'user',
            content:
              'Best practices for email automation:\n\n' +
              '1. **Be Specific**: Use clear keywords that accurately reflect email intent\n' +
              '2. **Personalize**: Always include sender name and relevant context in responses\n' +
              '3. **Review First**: Check emails before activating auto-reply for new rule types\n' +
              '4. **Monitor**: Use get_statistics to track automation effectiveness\n' +
              '5. **Avoid Loops**: The system ignores no-reply addresses to prevent loops\n' +
              '6. **User Privacy**: Never share sensitive information in auto-replies\n' +
              '7. **Test Rules**: Use toggle_rule to test new rules before enabling permanently\n' +
              '8. **Keep Context Short**: Brief rules context helps AI generate better responses',
          },
        ],
      };
    }
  );
}

/**
 * Start stdio transport for Claude Desktop / Claude Code CLI
 */
export async function startStdioTransport() {
  try {
    stdio_transport = new StdioServerTransport();
    await mcp_server.connect(stdio_transport);
    logger.info('MCP Stdio transport started (Claude Desktop / CLI compatible)');
  } catch (error) {
    logger.error(`Failed to start MCP stdio transport: ${error.message}`);
    throw error;
  }
}

/**
 * Get the MCP server instance
 */
export function getMCPServer() {
  return mcp_server;
}

/**
 * Update processing statistics (called by scheduler)
 */
export function updateProcessingStats(stats) {
  processing_stats.total_processed += stats.processed || 0;
  processing_stats.total_skipped += stats.skipped || 0;
  processing_stats.total_failed += stats.failed || 0;
  processing_stats.last_run = new Date().toISOString();
  processing_stats.runs_today += 1;
}
