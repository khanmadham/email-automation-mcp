import express from 'express';
import { logger } from './utils/logger.js';

const app = express();
const PORT = process.env.PORT || 3000;

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
      resolve(app);
    });
  });
}

export default app;
