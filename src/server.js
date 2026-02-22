import express from 'express';
import { logger } from './utils/logger.js';
import { getMCPServer } from './mcp/handler.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Track SSE clients for broadcasting
let sseClients = [];

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
        http: '/mcp',
        sse: '/mcp/sse',
        stdio: 'stdin/stdout',
      },
    },
  });
});

// MCP HTTP endpoint - handles incoming MCP protocol messages
app.post('/mcp', async (req, res) => {
  try {
    const mcp_server = getMCPServer();
    if (!mcp_server) {
      return res.status(503).json({ error: 'MCP Server not initialized' });
    }

    const request = req.body;
    logger.debug(`MCP Request received: ${request.method}`);

    // Handle different MCP methods
    if (request.method === 'tools/list') {
      // This is handled by the MCP SDK internally, but we can provide a wrapper
      res.json({
        jsonrpc: '2.0',
        id: request.id,
        result: {
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
        },
      });
    } else if (request.method === 'resources/list') {
      res.json({
        jsonrpc: '2.0',
        id: request.id,
        result: {
          resources: [
            {
              uri: 'emails/unread',
              name: 'Unread Emails',
              description: 'List of unread emails',
            },
            {
              uri: 'emails/{messageId}',
              name: 'Email Details',
              description: 'Full details of a specific email',
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
        },
      });
    } else {
      // For other methods, respond with standard MCP format
      res.json({
        jsonrpc: '2.0',
        id: request.id,
        result: {
          message: 'MCP method handled by stdio transport',
        },
      });

      // Broadcast to SSE clients
      sseClients.forEach((client) => {
        client.write(`data: ${JSON.stringify(request)}\n\n`);
      });
    }
  } catch (error) {
    logger.error(`MCP endpoint error: ${error.message}`);
    res.status(500).json({
      jsonrpc: '2.0',
      id: req.body.id,
      error: {
        code: -32603,
        message: 'Internal error',
        data: error.message,
      },
    });
  }
});

// MCP SSE endpoint - for Server-Sent Events streaming
app.get('/mcp/sse', (req, res) => {
  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Send initial connection message
  res.write('data: {"type":"connected","message":"Connected to MCP SSE stream"}\n\n');

  // Add client to list
  sseClients.push(res);
  logger.info(`SSE client connected. Total clients: ${sseClients.length}`);

  // Handle client disconnect
  req.on('close', () => {
    sseClients = sseClients.filter((client) => client !== res);
    logger.info(`SSE client disconnected. Total clients: ${sseClients.length}`);
  });

  // Keep connection alive
  const keepAlive = setInterval(() => {
    res.write(': keep-alive\n\n');
  }, 30000);

  req.on('close', () => {
    clearInterval(keepAlive);
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
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
      logger.info(`MCP HTTP endpoint available at http://localhost:${PORT}/mcp`);
      logger.info(`MCP SSE endpoint available at http://localhost:${PORT}/mcp/sse`);
      resolve(app);
    });
  });
}

export function broadcastToSSE(message) {
  sseClients.forEach((client) => {
    client.write(`data: ${JSON.stringify(message)}\n\n`);
  });
}

export default app;
