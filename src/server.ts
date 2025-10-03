// server.ts - Main application entry point
import express from 'express';
import http from 'http';
import WebSocket from 'ws';
import config from './config';
import handleWebSocketConnection from './handlers/websocket';

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// WebSocket endpoint for clients
wss.on('connection', handleWebSocketConnection);

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

const PORT = config.server.port;
server.listen(PORT, () => {
  console.log(`Transcription service running on port ${PORT}`);
});
