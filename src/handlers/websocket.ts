/**
 * WebSocket Handler for Client Connections
 *
 * Manages WebSocket connections from Flutter clients and handles three actions:
 * - 'start': Begin a new transcription session for a LiveKit room participant
 * - 'stop': End the current session without analysis
 * - 'complete': End session and send full analysis to backend
 *
 * Flow:
 * 1. Client connects via WebSocket
 * 2. Client sends 'start' with roomName + participantIdentity
 * 3. Service connects to LiveKit, streams audio to Deepgram, sends live transcripts back
 * 4. Client sends 'complete' when interview ends
 * 5. Service generates summary, POSTs to backend, notifies client
 */
import WebSocket from 'ws';
import TranscriptionSession from '../services/TranscriptionSession';
import { ClientMessage } from '../types';

function handleWebSocketConnection(ws: WebSocket): void {
  console.log('Client connected');
  let session: TranscriptionSession | null = null;

  ws.on('message', async (message: WebSocket.Data) => {
    try {
      const data = JSON.parse(message.toString()) as ClientMessage;

      // START: Create new transcription session
      if (data.action === 'start') {
        const { roomName, participantIdentity } = data;

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
    console.log('Client disconnected');
    if (session) {
      await session.cleanup();
    }
  });
}

export default handleWebSocketConnection;
