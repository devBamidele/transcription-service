/**
 * WebSocket Handler for Client Connections
 *
 * Manages WebSocket connections from Flutter clients and handles three actions:
 * - 'start': Begin a new transcription session for a LiveKit room participant
 * - 'stop': End the current session without analysis
 * - 'complete': End session and send full analysis to backend
 *
 * Flow:
 * 1. Client connects via WebSocket with valid JWT token
 * 2. JWT is validated and claims attached to WebSocket instance
 * 3. Client sends 'start' with roomName + participantIdentity
 * 4. Service validates roomName and participantIdentity match JWT claims
 * 5. Service connects to LiveKit, streams audio to Deepgram, sends live transcripts back
 * 6. Client sends 'complete' when interview ends
 * 7. Service generates summary, POSTs to backend, notifies client
 */
import WebSocket from 'ws';
import TranscriptionSession from '../services/TranscriptionSession';
import { ClientMessage, AuthenticatedWebSocket } from '../types';

function handleWebSocketConnection(ws: AuthenticatedWebSocket): void {
  // Safety check: Ensure WebSocket is authenticated
  if (!ws.isAuthenticated || !ws.userId) {
    console.error('Unauthenticated WebSocket connection attempted');
    ws.close(1008, 'Authentication required');
    return;
  }

  console.log(`Client connected: userId=${ws.userId}, room=${ws.roomName}, participant=${ws.participantIdentity}`);
  let session: TranscriptionSession | null = null;

  ws.on('message', async (message: WebSocket.Data) => {
    try {
      const data = JSON.parse(message.toString()) as ClientMessage;

      // START: Create new transcription session
      if (data.action === 'start') {
        const { roomName, participantIdentity } = data;

        // Validate roomName matches JWT claim
        if (roomName !== ws.roomName) {
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Unauthorized: roomName does not match token'
          }));
          ws.close(1008, 'Authorization failed');
          return;
        }

        // Validate participantIdentity matches JWT claim
        if (participantIdentity !== ws.participantIdentity) {
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Unauthorized: participantIdentity does not match token'
          }));
          ws.close(1008, 'Authorization failed');
          return;
        }

        // Additional validation (now redundant but kept for backwards compatibility)
        if (!roomName || !participantIdentity) {
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Missing roomName or participantIdentity'
          }));
          return;
        }

        session = new TranscriptionSession(roomName, participantIdentity, ws);
        await session.start();

        ws.send(JSON.stringify({
          type: 'started',
          message: 'Transcription session started'
        }));
      // STOP: End session without analysis (user cancelled)
      } else if (data.action === 'stop') {
        console.log(`⚠️  INTERVIEW STOPPED (no data saved) - userId=${ws.userId}, room=${ws.roomName}`);
        if (session) {
          await session.cleanup();
          session = null;
        }
        ws.send(JSON.stringify({
          type: 'stopped',
          message: 'Transcription session stopped'
        }));

      // COMPLETE: End session, generate summary, send to backend
      } else if (data.action === 'complete') {
        console.log(`✅ INTERVIEW COMPLETED (saving data to backend) - userId=${ws.userId}, room=${ws.roomName}`);
        if (session) {
          // 1. Generate summary and POST to backend
          await session.completeSession();

          // 2. Clean up LiveKit/Deepgram connections
          await session.cleanup();
          session = null;
        } else {
          ws.send(JSON.stringify({
            type: 'error',
            message: 'No active session to complete'
          }));
        }
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: error instanceof Error ? error.message : 'Unknown error'
      }));
    }
  });

  ws.on('close', async () => {
    if (session) {
      console.log(`🔌 INTERVIEW DISCONNECTED (automatic cleanup) - userId=${ws.userId}, room=${ws.roomName}`);
      await session.cleanup();
    } else {
      console.log(`Client disconnected - userId=${ws.userId}`);
    }
  });
}

export default handleWebSocketConnection;
