# Real-Time Interview Transcription Service

A TypeScript service that provides real-time speech transcription and analysis for interview coaching applications. Streams audio from LiveKit, transcribes with Deepgram, and sends comprehensive speech analysis to your backend.

## Architecture

```
Flutter App ←──WebSocket──→ [This Service] ←──→ LiveKit (audio)
                                   ↓
                               Deepgram (STT)
                                   ↓
                           Backend API (AI analysis)
```

**During Interview:**
- Real-time transcription streamed to Flutter app
- Accumulates speech data (words, timestamps, patterns)

**After Interview:**
- Generates comprehensive summary (pace timeline, fillers, pauses)
- POSTs to backend for OpenAI-powered insights
- Backend stores in MongoDB and returns analysis

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Create `.env` file:

```env
# LiveKit (https://cloud.livekit.io)
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your_api_key
LIVEKIT_API_SECRET=your_secret

# Deepgram (https://console.deepgram.com)
DEEPGRAM_API_KEY=your_deepgram_key

# Service config
PORT=3001

# Backend API
BACKEND_URL=http://localhost:3000
```

### 3. Run

**Development (with auto-reload):**
```bash
npm run dev
```

**Production:**
```bash
npm run build
npm start
```

**Health check:**
```bash
curl http://localhost:3001/health
# Response: {"status":"ok"}
```

## WebSocket API

Connect to `ws://localhost:3001`

### Client → Server

**Start transcription:**
```json
{
  "action": "start",
  "roomName": "interview-room-123",
  "participantIdentity": "user-456"
}
```

**Stop (cancel without analysis):**
```json
{
  "action": "stop"
}
```

**Complete (end interview, trigger analysis):**
```json
{
  "action": "complete"
}
```

### Server → Client

**Session started:**
```json
{
  "type": "started",
  "message": "Transcription session started"
}
```

**Live transcript (continuous during interview):**
```json
{
  "type": "transcript",
  "text": "I think consulting is a great career path",
  "isFinal": true,
  "words": [
    {"word": "I", "start": 0.5, "end": 0.7, "confidence": 0.99},
    {"word": "think", "start": 0.8, "end": 1.1, "confidence": 0.98}
  ]
}
```

**Session complete (after interview ends):**
```json
{
  "type": "session_complete",
  "message": "Session completed. Analysis in progress...",
  "interviewId": "abc123"
}
```

**Error:**
```json
{
  "type": "error",
  "message": "Error description"
}
```

## Backend Integration

When client sends `"action": "complete"`, the service POSTs to:

```
POST {BACKEND_URL}/api/interviews/analyze
```

**Request body:**
```json
{
  "roomName": "interview-room-123",
  "participantIdentity": "user-456",
  "sessionData": {
    "transcript": "Full transcript text...",
    "duration": 245.6,
    "totalWords": 612,
    "averagePace": 149,
    "paceTimeline": [
      {"timestamp": 0, "wpm": 145, "segmentStart": 0, "segmentEnd": 30}
    ],
    "fillers": [
      {
        "word": "um",
        "timestamp": 12.5,
        "contextBefore": "I want to work",
        "contextAfter": "in consulting because"
      }
    ],
    "pauses": [
      {"duration": 1.8, "timestamp": 45.2}
    ],
    "words": [...],
    "transcriptSegments": [...]
  }
}
```

**Expected response:**
```json
{
  "interviewId": "abc123"
}
```

## Speech Analysis Features

### Pace Timeline
- 30-second segments with words-per-minute
- Tracks speaking pace changes over time

### Filler Word Detection
Detects: `um`, `uh`, `like`, `you know`, `so`, `actually`, `basically`, `literally`
- Includes 5 words of context before/after
- Case-insensitive matching

### Pause Detection
- Identifies gaps > 1.2 seconds between words
- Records duration and timestamp

### Pace Categories
- Very fast: > 180 WPM
- A bit fast: 150-180 WPM
- Normal: 120-150 WPM
- A bit slow: 100-120 WPM
- Slow: < 100 WPM

## Deepgram Configuration

Service uses **nova-3-general** model with optimized settings:

```typescript
{
  model: "nova-3-general",        // Best for everyday audio
  smart_format: true,             // Auto-formats numbers, dates, emails
  punctuate: true,                // Adds punctuation
  paragraphs: true,               // Text segmentation
  diarize: true,                  // Speaker change detection
  filler_words: true,             // Detects um, uh, like
  numerals: true,                 // "twenty one" → "21"
  vad_events: true,               // Voice activity detection
  interim_results: true,          // Preliminary results
  utterance_end_ms: 1000,         // Finalize after 1s silence
  endpointing: 300                // End detection after 300ms
}
```

**Alternative models:**
- `nova-3-meeting` - Multiple speakers/conference rooms
- `nova-3-phonecall` - Low-bandwidth phone calls
- `nova-3-medical` - Medical vocabulary
- `nova-3-finance` - Financial/earnings calls

## Project Structure

```
src/
├── server.ts                      # Express + WebSocket server
├── config/
│   └── index.ts                   # Environment config validation
├── services/
│   └── TranscriptionSession.ts    # Core transcription logic
├── handlers/
│   └── websocket.ts               # WebSocket message handling
├── constants/
│   └── speech.ts                  # Speech analysis constants
└── types/
    └── index.ts                   # TypeScript type definitions
```

## Troubleshooting

**No transcripts received:**
- Verify Deepgram API key is valid
- Check participant identity matches exactly
- Ensure audio track is published in LiveKit room
- Verify audio format: 16kHz, mono, linear16

**Poor transcription accuracy:**
- Most common: Poor audio quality from client
- Check for background noise or echo
- Consider switching Deepgram model (meeting/phonecall)
- Monitor console for Deepgram errors

**WebSocket connection fails:**
- Check if port is already in use
- Verify firewall settings
- Test with health check endpoint first

**LiveKit connection errors:**
- Verify LiveKit URL format (`wss://...`)
- Check API key and secret are correct
- Ensure room exists or can be created

## Development

**Available scripts:**
```bash
npm run dev      # Development with auto-reload
npm run build    # Compile TypeScript to dist/
npm start        # Run compiled JavaScript
npm run clean    # Remove dist/ directory
```

**TypeScript benefits:**
- Strict type checking enabled
- Compile-time error detection
- Better IDE autocomplete
- Self-documenting code

## Deployment

**Docker:**
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3001
CMD ["npm", "start"]
```

**Run:**
```bash
docker build -t transcription-service .
docker run -p 3001:3001 --env-file .env transcription-service
```

**Production checklist:**
- Use WSS (WebSocket Secure) in production
- Add authentication for WebSocket connections
- Implement rate limiting
- Set up monitoring and logging
- Use production URLs in `.env`

## Documentation

- [CLAUDE.md](./CLAUDE.md) - Detailed architecture and developer guide
- [SYSTEM_ARCHITECTURE.md](./SYSTEM_ARCHITECTURE.md) - System design documentation

## Dependencies

**Core:**
- `express` - HTTP server
- `ws` - WebSocket server
- `@livekit/rtc-node` - LiveKit audio streaming
- `livekit-server-sdk` - LiveKit authentication
- `@deepgram/sdk` - Speech-to-text
- `axios` - HTTP client for backend API
- `dotenv` - Environment variables

**Dev:**
- `typescript` - Type safety
- `ts-node` - Run TypeScript directly
- `nodemon` - Auto-reload during development

## License

MIT
