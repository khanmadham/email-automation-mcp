import express from 'express';
import { logger } from './utils/logger.js';
import { getMCPServer } from './mcp/handler.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

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
      },
      {
        name: 'get_email',
        description: 'Get full details of a specific email',
      },
      {
        name: 'send_reply',
        description: 'Send a reply to an email',
      },
      {
        name: 'mark_as_read',
        description: 'Mark an email as read',
      },
      {
        name: 'add_label',
        description: 'Add a label to an email',
      },
      {
        name: 'process_emails_now',
        description: 'Trigger immediate batch processing of unread emails',
      },
      {
        name: 'toggle_rule',
        description: 'Enable or disable an email processing rule',
      },
      {
        name: 'update_rule',
        description: "Update a rule's keywords or context",
      },
      {
        name: 'get_system_status',
        description: 'Get the current system and scheduler status',
      },
      {
        name: 'get_statistics',
        description: 'Get email processing statistics',
      },
    ],
    resources: [
      {
        uri: 'emails/unread',
        name: 'Unread Emails',
        description: 'List of unread emails',
      },
      {
        uri: 'rules',
        name: 'Processing Rules',
        description: 'Email processing rules configuration',
      },
      {
        uri: 'settings',
        name: 'System Settings',
        description: 'System settings and configuration',
      },
      {
        uri: 'status',
        name: 'System Status',
        description: 'Real-time system health and scheduler status',
      },
    ],
    transports: {
      primary: 'stdio (via Claude Desktop or Claude Code CLI)',
      notes: 'This server is primarily designed for use with Claude Desktop or Claude Code CLI via the stdio transport for native MCP protocol support.',
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

