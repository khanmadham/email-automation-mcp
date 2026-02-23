import express from 'express';
import { randomUUID } from 'crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { logger } from './utils/logger.js';
import { getMCPServer, createFreshMCPServer } from './mcp/handler.js';
import { getUnreadEmails, getEmailDetails, sendReply, markAsRead, addLabel } from './gmail/emailService.js';
import { processBatch } from './processor/emailProcessor.js';
import { getSchedulerStatus } from './scheduler/cronScheduler.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rulesPath = path.resolve(__dirname, '../config/rules.json');
const settingsPath = path.resolve(__dirname, '../config/settings.json');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// ============================================
// MCP Protocol Endpoints (Streamable HTTP)
// Claude Desktop connects here via URL
// ============================================

// Session store: sessionId -> { transport }
const mcpSessions = new Map();

// POST /mcp — new session or message to existing session
app.post('/mcp', async (req, res) => {
  try {
    const sessionId = req.headers['mcp-session-id'];

    if (sessionId && mcpSessions.has(sessionId)) {
      // Route message to existing session
      const { transport } = mcpSessions.get(sessionId);
      await transport.handleRequest(req, res, req.body);
    } else {
      // New session: create a fresh server + transport pair
      let newSessionId;
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => {
          newSessionId = randomUUID();
          return newSessionId;
        },
        onsessioninitialized: (id) => {
          mcpSessions.set(id, { transport });
          logger.info(`MCP HTTP session started: ${id}`);
        },
        onsessionclosed: (id) => {
          mcpSessions.delete(id);
          logger.info(`MCP HTTP session closed: ${id}`);
        },
      });

      const server = await createFreshMCPServer();
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    }
  } catch (error) {
    logger.error(`MCP POST error: ${error.message}`);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

// GET /mcp — SSE stream for server-initiated messages (existing sessions only)
app.get('/mcp', async (req, res) => {
  try {
    const sessionId = req.headers['mcp-session-id'];
    if (sessionId && mcpSessions.has(sessionId)) {
      const { transport } = mcpSessions.get(sessionId);
      await transport.handleRequest(req, res);
    } else {
      res.status(404).json({ error: 'MCP session not found' });
    }
  } catch (error) {
    logger.error(`MCP GET error: ${error.message}`);
    if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /mcp — terminate session
app.delete('/mcp', async (req, res) => {
  try {
    const sessionId = req.headers['mcp-session-id'];
    if (sessionId && mcpSessions.has(sessionId)) {
      const { transport } = mcpSessions.get(sessionId);
      await transport.handleRequest(req, res);
      mcpSessions.delete(sessionId);
    } else {
      res.status(404).json({ error: 'MCP session not found' });
    }
  } catch (error) {
    logger.error(`MCP DELETE error: ${error.message}`);
    if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check endpoint - required by Railway
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'Email Automation System',
    version: '1.0.0',
    status: 'running',
    mcp: {
      enabled: true,
      endpoints: {
        stdio: 'stdin/stdout (Claude Desktop / Claude Code CLI)',
        info: 'Use Claude Desktop or Claude Code CLI to access MCP tools and resources',
      },
    },
  });
});

// Simple MCP info endpoint for HTTP clients
app.get('/mcp/info', (req, res) => {
  res.json({
    name: 'email-automation-mcp',
    version: '1.0.0',
    description: 'Email automation system with MCP support',
    tools: [
      {
        name: 'get_unread_emails',
        description: 'Fetch unread emails from the inbox',
        route: 'POST /api/tools/get_unread_emails',
      },
      {
        name: 'get_email',
        description: 'Get full details of a specific email',
        route: 'POST /api/tools/get_email',
      },
      {
        name: 'send_reply',
        description: 'Send a reply to an email',
        route: 'POST /api/tools/send_reply',
      },
      {
        name: 'mark_as_read',
        description: 'Mark an email as read',
        route: 'POST /api/tools/mark_as_read',
      },
      {
        name: 'add_label',
        description: 'Add a label to an email',
        route: 'POST /api/tools/add_label',
      },
      {
        name: 'process_emails_now',
        description: 'Trigger immediate batch processing of unread emails',
        route: 'POST /api/tools/process_emails_now',
      },
      {
        name: 'toggle_rule',
        description: 'Enable or disable an email processing rule',
        route: 'POST /api/tools/toggle_rule',
      },
      {
        name: 'update_rule',
        description: "Update a rule's keywords or context",
        route: 'POST /api/tools/update_rule',
      },
      {
        name: 'get_system_status',
        description: 'Get the current system and scheduler status',
        route: 'GET /api/tools/get_system_status',
      },
      {
        name: 'get_statistics',
        description: 'Get email processing statistics',
        route: 'GET /api/tools/get_statistics',
      },
    ],
    resources: [
      {
        uri: 'emails/unread',
        name: 'Unread Emails',
        description: 'List of unread emails',
        route: 'GET /api/resources/emails/unread',
      },
      {
        uri: 'rules',
        name: 'Processing Rules',
        description: 'Email processing rules configuration',
        route: 'GET /api/resources/rules',
      },
      {
        uri: 'settings',
        name: 'System Settings',
        description: 'System settings and configuration',
        route: 'GET /api/resources/settings',
      },
      {
        uri: 'status',
        name: 'System Status',
        description: 'Real-time system health and scheduler status',
        route: 'GET /api/resources/status',
      },
    ],
    prompts: [
      {
        name: 'email_analysis_workflow',
        description: 'How to analyze and respond to emails using this email automation system',
        route: 'GET /api/prompts/email_analysis_workflow',
      },
      {
        name: 'rule_management',
        description: 'How to configure and manage email processing rules',
        route: 'GET /api/prompts/rule_management',
      },
      {
        name: 'automation_best_practices',
        description: 'Best practices for email automation using OpenAI and Gmail',
        route: 'GET /api/prompts/automation_best_practices',
      },
    ],
    transports: {
      primary: 'HTTP REST API and stdio (via Claude Desktop or Claude Code CLI)',
      notes: 'This server supports both HTTP REST API and stdio transport for MCP protocol. Use HTTP endpoints for standard HTTP clients, and stdio for Claude Desktop/CLI.',
    },
  });
});

// ============================================
// HTTP API Endpoints for Tools
// ============================================

// GET /api/tools/get_system_status
app.get('/api/tools/get_system_status', async (req, res) => {
  try {
    const status = getSchedulerStatus();
    res.json({
      success: true,
      data: {
        scheduler_running: status.running,
        current_interval_minutes: status.interval_minutes,
        uptime_seconds: process.uptime(),
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error(`Error in get_system_status: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/tools/get_statistics
app.get('/api/tools/get_statistics', async (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        total_processed: 0,
        total_skipped: 0,
        total_failed: 0,
        last_run: null,
        runs_today: 0,
      },
    });
  } catch (error) {
    logger.error(`Error in get_statistics: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/tools/get_unread_emails
app.post('/api/tools/get_unread_emails', async (req, res) => {
  try {
    const { max_results = 10 } = req.body;
    const emails = await getUnreadEmails(max_results);
    res.json({
      success: true,
      data: {
        count: emails.length,
        emails: emails.map((e) => ({
          id: e.id,
          from: e.from,
          subject: e.subject,
          timestamp: e.timestamp,
        })),
      },
    });
  } catch (error) {
    logger.error(`Error in get_unread_emails: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/tools/get_email
app.post('/api/tools/get_email', async (req, res) => {
  try {
    const { message_id } = req.body;
    if (!message_id) {
      return res.status(400).json({ success: false, error: 'message_id is required' });
    }
    const email = await getEmailDetails(message_id);
    res.json({
      success: true,
      data: email,
    });
  } catch (error) {
    logger.error(`Error in get_email: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/tools/send_reply
app.post('/api/tools/send_reply', async (req, res) => {
  try {
    const { message_id, reply_text } = req.body;
    if (!message_id || !reply_text) {
      return res.status(400).json({ success: false, error: 'message_id and reply_text are required' });
    }
    await sendReply(message_id, reply_text);
    res.json({
      success: true,
      data: { message: 'Reply sent successfully' },
    });
  } catch (error) {
    logger.error(`Error in send_reply: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/tools/mark_as_read
app.post('/api/tools/mark_as_read', async (req, res) => {
  try {
    const { message_id } = req.body;
    if (!message_id) {
      return res.status(400).json({ success: false, error: 'message_id is required' });
    }
    await markAsRead(message_id);
    res.json({
      success: true,
      data: { message: 'Email marked as read' },
    });
  } catch (error) {
    logger.error(`Error in mark_as_read: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/tools/add_label
app.post('/api/tools/add_label', async (req, res) => {
  try {
    const { message_id, label_name } = req.body;
    if (!message_id || !label_name) {
      return res.status(400).json({ success: false, error: 'message_id and label_name are required' });
    }
    await addLabel(message_id, label_name);
    res.json({
      success: true,
      data: { message: `Label "${label_name}" added successfully` },
    });
  } catch (error) {
    logger.error(`Error in add_label: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/tools/process_emails_now
app.post('/api/tools/process_emails_now', async (req, res) => {
  try {
    const emails = await getUnreadEmails();
    if (emails.length === 0) {
      return res.json({
        success: true,
        data: { message: 'No unread emails to process' },
      });
    }

    const results = await processBatch(emails);
    res.json({
      success: true,
      data: results,
    });
  } catch (error) {
    logger.error(`Error in process_emails_now: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/tools/toggle_rule
app.post('/api/tools/toggle_rule', async (req, res) => {
  try {
    const { rule_id, enabled } = req.body;
    if (!rule_id || enabled === undefined) {
      return res.status(400).json({ success: false, error: 'rule_id and enabled are required' });
    }

    const rules = JSON.parse(fs.readFileSync(rulesPath, 'utf-8'));
    const rule = rules.rules.find((r) => r.id === rule_id);

    if (!rule) {
      return res.status(404).json({ success: false, error: `Rule "${rule_id}" not found` });
    }

    rule.enabled = enabled;
    fs.writeFileSync(rulesPath, JSON.stringify(rules, null, 2));

    logger.info(`Rule "${rule_id}" set to ${enabled ? 'enabled' : 'disabled'}`);

    res.json({
      success: true,
      data: { message: `Rule "${rule_id}" is now ${enabled ? 'enabled' : 'disabled'}` },
    });
  } catch (error) {
    logger.error(`Error in toggle_rule: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/tools/update_rule
app.post('/api/tools/update_rule', async (req, res) => {
  try {
    const { rule_id, keywords, context } = req.body;
    if (!rule_id) {
      return res.status(400).json({ success: false, error: 'rule_id is required' });
    }

    const rules = JSON.parse(fs.readFileSync(rulesPath, 'utf-8'));
    const rule = rules.rules.find((r) => r.id === rule_id);

    if (!rule) {
      return res.status(404).json({ success: false, error: `Rule "${rule_id}" not found` });
    }

    if (keywords) {
      rule.conditions.keywords = keywords;
    }
    if (context) {
      rule.context = context;
    }

    fs.writeFileSync(rulesPath, JSON.stringify(rules, null, 2));
    logger.info(`Rule "${rule_id}" updated`);

    res.json({
      success: true,
      data: rule,
    });
  } catch (error) {
    logger.error(`Error in update_rule: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// HTTP API Endpoints for Resources
// ============================================

// GET /api/resources/emails/unread
app.get('/api/resources/emails/unread', async (req, res) => {
  try {
    const emails = await getUnreadEmails(100);
    res.json({
      success: true,
      data: {
        count: emails.length,
        emails: emails.map((e) => ({
          id: e.id,
          from: e.from,
          subject: e.subject,
          timestamp: e.timestamp,
        })),
      },
    });
  } catch (error) {
    logger.error(`Error reading emails/unread resource: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/resources/rules
app.get('/api/resources/rules', async (req, res) => {
  try {
    const rules = JSON.parse(fs.readFileSync(rulesPath, 'utf-8'));
    res.json({
      success: true,
      data: rules,
    });
  } catch (error) {
    logger.error(`Error reading rules resource: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/resources/settings
app.get('/api/resources/settings', async (req, res) => {
  try {
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    res.json({
      success: true,
      data: settings,
    });
  } catch (error) {
    logger.error(`Error reading settings resource: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/resources/status
app.get('/api/resources/status', async (req, res) => {
  try {
    const schedulerStatus = getSchedulerStatus();
    res.json({
      success: true,
      data: {
        scheduler_running: schedulerStatus.running,
        current_interval_minutes: schedulerStatus.interval_minutes,
        uptime_seconds: process.uptime(),
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error(`Error reading status resource: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// HTTP API Endpoints for Prompts
// ============================================

// GET /api/prompts/email_analysis_workflow
app.get('/api/prompts/email_analysis_workflow', (req, res) => {
  res.json({
    success: true,
    data: {
      name: 'email_analysis_workflow',
      description: 'How to analyze and respond to emails using this email automation system',
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
  });
});

// GET /api/prompts/rule_management
app.get('/api/prompts/rule_management', (req, res) => {
  res.json({
    success: true,
    data: {
      name: 'rule_management',
      description: 'How to configure and manage email processing rules',
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
  });
});

// GET /api/prompts/automation_best_practices
app.get('/api/prompts/automation_best_practices', (req, res) => {
  res.json({
    success: true,
    data: {
      name: 'automation_best_practices',
      description: 'Best practices for email automation using OpenAI and Gmail',
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
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found. See /mcp/info for available endpoints.' });
});

// Error handler
app.use((err, req, res, next) => {
  logger.error(`Express error: ${err.message}`);
  res.status(500).json({ error: 'Internal server error' });
});

export function startServer() {
  return new Promise((resolve) => {
    app.listen(PORT, '0.0.0.0', () => {
      logger.info(`Web server listening on port ${PORT}`);
      logger.info(`MCP info endpoint available at http://localhost:${PORT}/mcp/info`);
      resolve(app);
    });
  });
}

export default app;

