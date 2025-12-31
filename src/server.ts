// server.ts - Main application entry point
import express from 'express';
import http from 'http';
import WebSocket from 'ws';
import config, { loadSecrets } from './config';
import handleWebSocketConnection from './handlers/websocket';
import { authenticateWebSocket } from './middleware/jwtAuth';
import { AuthenticatedWebSocket } from './types';
import healthRoutes from './routes/health';
import { corsMiddleware } from './middleware/cors';
import { securityHeaders, additionalSecurityHeaders } from './middleware/security';

const app = express();
const server = http.createServer(app);

// Apply security middleware
app.use(securityHeaders);
app.use(additionalSecurityHeaders);
app.use(corsMiddleware);

// Create WebSocket server with noServer option (manual upgrade handling)
const wss = new WebSocket.Server({ noServer: true });

// Health check endpoints (mounted BEFORE any other routes)
app.use('/health', healthRoutes);

// Handle WebSocket upgrade with JWT authentication
server.on('upgrade', (req, socket, head) => {
  authenticateWebSocket(req, socket, head, wss, (ws, jwtPayload) => {
    // Attach JWT claims to WebSocket instance
    (ws as AuthenticatedWebSocket).userId = jwtPayload.userId;
    (ws as AuthenticatedWebSocket).roomName = jwtPayload.roomName;
    (ws as AuthenticatedWebSocket).participantIdentity = jwtPayload.participantIdentity;
    (ws as AuthenticatedWebSocket).isAuthenticated = true;

    // Emit connection event with authenticated WebSocket
    wss.emit('connection', ws, req);
  });
});

// WebSocket endpoint for authenticated clients
wss.on('connection', handleWebSocketConnection);

// Graceful shutdown handler
function gracefulShutdown(signal: string): void {
  console.log(`${signal} received, closing server gracefully...`);

  server.close(() => {
    console.log('HTTP server closed');

    // Close all WebSocket connections
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.close(1000, 'Server shutting down');
      }
    });

    console.log('All WebSocket connections closed');
    console.log('Graceful shutdown complete');
    process.exit(0);
  });

  // Force shutdown after 30 seconds
  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 30000);
}

// Listen for termination signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Start server
async function startServer(): Promise<void> {
  try {
    // Load secrets from GCP Secret Manager (if in staging/production)
    await loadSecrets();

    const PORT = config.server.port;
    server.listen(PORT, () => {
      console.log(`Transcription service running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'local'}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
