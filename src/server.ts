// server.ts - Main application entry point
import express from "express";
import http from "http";
import WebSocket from "ws";
import config from "./config";
import handleWebSocketConnection from "./handlers/websocket";
import { authenticateWebSocket } from "./middleware/jwtAuth";
import { AuthenticatedWebSocket } from "./types";

const app = express();
const server = http.createServer(app);

// Create WebSocket server with noServer option (manual upgrade handling)
const wss = new WebSocket.Server({ noServer: true });

// Handle WebSocket upgrade with JWT authentication
server.on("upgrade", (req, socket, head) => {
  authenticateWebSocket(req, socket, head, wss, (ws, jwtPayload) => {
    // Attach JWT claims to WebSocket instance
    (ws as AuthenticatedWebSocket).userId = jwtPayload.userId;
    (ws as AuthenticatedWebSocket).roomName = jwtPayload.roomName;
    (ws as AuthenticatedWebSocket).participantIdentity = jwtPayload.participantIdentity;
    (ws as AuthenticatedWebSocket).isAuthenticated = true;

    // Emit connection event with authenticated WebSocket
    wss.emit("connection", ws, req);
  });
});

// WebSocket endpoint for authenticated clients
wss.on("connection", handleWebSocketConnection);

// Health check endpoint
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

const PORT = config.server.port;
server.listen(PORT, () => {
  console.log(`Transcription service running on port ${PORT}`);
}); 
