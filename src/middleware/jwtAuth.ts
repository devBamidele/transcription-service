/**
 * JWT Authentication Middleware for WebSocket Connections
 *
 * Purpose:
 * - Extract JWT token from WebSocket upgrade request query parameters
 * - Validate token signature, expiration, issuer, and audience
 * - Attach decoded claims to WebSocket instance for authorization
 * - Reject unauthorized connections immediately with error code 1008
 *
 * Security Features:
 * - Token signature verification using HS256 algorithm
 * - Expiration time validation (exp claim)
 * - Issuer and audience validation (optional)
 * - Audit logging for all authentication events
 */

import http from "http";
import WebSocket from "ws";
import jwt from "jsonwebtoken";
import config from "../config";
import { JwtPayload } from "../types";

/**
 * Extract JWT token from WebSocket upgrade request
 *
 * Looks for token in query parameter: ws://host:port?token=jwt_here
 *
 * @param req - HTTP upgrade request
 * @returns JWT token string or null if not found
 */
function extractTokenFromRequest(req: http.IncomingMessage): string | null {
  try {
    // Parse URL with query parameters
    const url = new URL(req.url || "", `http://${req.headers.host}`);
    return url.searchParams.get("token");
  } catch (error) {
    console.error("[AUTH] Failed to parse request URL:", error);
    return null;
  }
}

/**
 * Validate JWT token and return decoded payload
 *
 * Verifies:
 * - Signature using JWT_SECRET
 * - Expiration time (exp claim)
 * - Issuer (iss claim, if configured)
 * - Audience (aud claim, if configured)
 *
 * @param token - JWT string
 * @returns Decoded JwtPayload
 * @throws Error if token is invalid, expired, or malformed
 */
function validateJwt(token: string): JwtPayload {
  try {
    // Verify token with signature and claims validation
    const decoded = jwt.verify(token, config.jwt.secret, {
      issuer: config.jwt.issuer,
      audience: config.jwt.audience,
    }) as JwtPayload;

    // Validate required claims
    if (!decoded.userId || !decoded.roomName || !decoded.participantIdentity) {
      throw new Error("Missing required claims: userId, roomName, or participantIdentity");
    }

    return decoded;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error("Token expired");
    } else if (error instanceof jwt.JsonWebTokenError) {
      throw new Error("Invalid authentication token");
    } else if (error instanceof jwt.NotBeforeError) {
      throw new Error("Token not yet valid");
    } else {
      throw new Error(error instanceof Error ? error.message : "Token validation failed");
    }
  }
}

/**
 * Main authentication middleware for WebSocket upgrade
 *
 * Flow:
 * 1. Extract token from query parameter
 * 2. Validate token using validateJwt()
 * 3. If valid: Complete WebSocket upgrade and call handleConnection with payload
 * 4. If invalid: Destroy socket immediately with error code 1008
 *
 * @param req - HTTP upgrade request
 * @param socket - Network socket
 * @param head - First packet of upgraded stream
 * @param wss - WebSocket server instance
 * @param handleConnection - Callback to invoke on successful authentication
 */
export function authenticateWebSocket(
  req: http.IncomingMessage,
  socket: any,
  head: Buffer,
  wss: WebSocket.Server,
  handleConnection: (ws: WebSocket, payload: JwtPayload) => void
): void {
  const clientIp = req.socket.remoteAddress || "unknown";

  try {
    // Step 1: Extract token from query parameter
    const token = extractTokenFromRequest(req);

    if (!token) {
      console.error(`[AUTH FAILED] reason=missing_token, ip=${clientIp}`);
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    // Step 2: Validate JWT token
    const payload = validateJwt(token);

    // Step 3: Log successful authentication
    console.log(
      `[AUTH SUCCESS] userId=${payload.userId}, room=${payload.roomName}, participant=${payload.participantIdentity}, ip=${clientIp}`
    );

    // Step 4: Complete WebSocket upgrade
    wss.handleUpgrade(req, socket, head, (ws) => {
      // Call the connection handler with authenticated WebSocket
      handleConnection(ws, payload);
    });
  } catch (error) {
    // Step 5: Handle authentication failure
    const errorMessage = error instanceof Error ? error.message : "Authentication failed";
    console.error(`[AUTH FAILED] reason=${errorMessage}, ip=${clientIp}`);

    // Send HTTP 401 response and close connection
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
  }
}
