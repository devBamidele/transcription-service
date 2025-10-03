# CLAUDE.md - Developer Reference

## Project Overview

Real-time speech transcription and analysis service that integrates LiveKit (for audio streaming) and Deepgram (for speech-to-text) to provide live transcription with speech pattern analysis.

**Built with TypeScript for type safety and better developer experience.**

**Key Features:**
- Real-time audio transcription with word-level timestamps
- Filler word detection (um, uh, like, etc.)
- Speaking pace analysis (words per minute)
- Pause detection (gaps > 1.2s)
- WebSocket-based client communication
- Full TypeScript support with strict type checking

## Architecture

```
transcription-service/
├── src/
│   ├── server.ts                      # Main entry point
│   ├── config/
│   │   └── index.ts                   # Environment config & validation
│   ├── services/
│   │   └── TranscriptionSession.ts    # Core transcription logic
│   ├── handlers/
│   │   └── websocket.ts               # WebSocket connection handler
│   ├── constants/
│   │   └── speech.ts                  # Speech analysis constants
│   └── types/
│       └── index.ts                   # TypeScript type definitions
├── dist/                              # Compiled JavaScript (generated)
├── tsconfig.json                      # TypeScript configuration
├── package.json
├── .env                               # Environment variables (not in git)
└── README.md                          # User documentation
```

## File Structure

### `src/server.ts`
- Express HTTP server setup
- WebSocket server initialization
- Health check endpoint (`GET /health`)
- Application entry point

### `src/config/index.ts`
- Loads environment variables via dotenv
- Validates required configuration
- Exports typed config object
- **Throws error if required vars are missing**

### `src/services/TranscriptionSession.ts`
- Manages individual transcription sessions
- Connects to LiveKit rooms and subscribes to participant audio
- Streams audio to Deepgram for transcription
- Performs real-time speech analysis
- Sends results back to client via WebSocket

**Key Methods:**
- `start()` - Initializes Deepgram + LiveKit connections
- `handleTranscript()` - Processes incoming transcripts
- `analyzeTranscript()` - Analyzes speech patterns
- `cleanup()` - Tears down connections

### `src/handlers/websocket.ts`
- Handles WebSocket client connections
- Processes client messages (`start`, `stop` actions)
- Creates and manages `TranscriptionSession` instances
- Error handling and cleanup
- Fully typed message handling

### `src/constants/speech.ts`
- `FILLER_WORDS` - Array of filler words to detect
- `PACE_THRESHOLDS` - Speaking pace categories (WPM thresholds)
- `PAUSE_THRESHOLD` - Minimum gap duration to count as pause (1.2s)
- `PaceDescription` - Type for pace descriptions

### `src/types/index.ts`
- **Type Definitions** - All TypeScript interfaces and types
- `ClientMessage` - WebSocket messages from client
- `ServerMessage` - WebSocket messages to client
- `SpeechAnalysis` - Analysis result structure
- `Config` - Application configuration
- `TranscriptWord`, `FillerWord`, `Pause` - Speech analysis types

## Environment Variables

Required variables (validated on startup):
```env
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your_api_key
LIVEKIT_API_SECRET=your_api_secret
DEEPGRAM_API_KEY=your_deepgram_key
PORT=3001  # Optional, defaults to 3000
```

## WebSocket Protocol

### Client → Server Messages

**Start transcription:**
```json
{
  "action": "start",
  "roomName": "my-livekit-room",
  "participantIdentity": "user-id-to-transcribe"
}
```

**Stop transcription:**
```json
{
  "action": "stop"
}
```

### Server → Client Messages

**Session started:**
```json
{
  "type": "started",
  "message": "Transcription session started"
}
```

**Live transcript (continuous):**
```json
{
  "type": "transcript",
  "text": "um I think this is working",
  "isFinal": true,
  "words": [
    {"word": "um", "start": 0.5, "end": 0.7, "confidence": 0.95},
    {"word": "I", "start": 0.8, "end": 1.0, "confidence": 0.99}
  ]
}
```

**Analysis (after utterance ends):**
```json
{
  "type": "analysis",
  "data": {
    "pace": "145 words/min (normal)",
    "fillers": [
      {"word": "um", "timestamp": 0.5}
    ],
    "pauses": [
      {"duration": 1.5, "at": 3.2}
    ],
    "totalWords": 23,
    "duration": 9.5
  }
}
```

**Error:**
```json
{
  "type": "error",
  "message": "Error description"
}
```

## Speech Analysis Logic

### Pace Detection
- **Very fast:** > 180 WPM
- **A bit fast:** 150-180 WPM
- **Normal:** 120-150 WPM
- **A bit slow:** 100-120 WPM
- **Slow:** < 100 WPM

### Filler Words
Detects: um, uh, like, you know, so, actually, basically, literally
- Case-insensitive matching
- Strips punctuation before matching

### Pause Detection
- Detects gaps > 1.2 seconds between consecutive words
- Reports pause duration and timestamp

## Running the Service

### Development Mode
```bash
# Install dependencies first
npm install

# Run with hot reload (using ts-node)
npm run dev
```

### Production Mode
```bash
# Build TypeScript to JavaScript
npm run build

# Run compiled JavaScript
npm start
```

### Clean Build
```bash
# Remove compiled files
npm run clean
```

**Default port:** 3000 (change via `PORT` env var)

**Note:** The compiled JavaScript files are in the `dist/` directory.

## Common Tasks

### Adding New Filler Words
Edit `src/constants/speech.ts`:
```typescript
export const FILLER_WORDS = [
  'um', 'uh', 'like',
  'your-new-word'  // Add here
] as const;
```

### Adjusting Pace Thresholds
Edit `src/constants/speech.ts`:
```typescript
export const PACE_THRESHOLDS = {
  VERY_FAST: 180,  // Modify these
  FAST: 150,
  SLOW: 100,
  VERY_SLOW: 120
} as const;
```

### Changing Pause Detection Threshold
Edit `src/constants/speech.ts`:
```typescript
export const PAUSE_THRESHOLD = 1.5; // Change from 1.2 to 1.5 seconds
```

### Adding New Deepgram Model Options
Edit `src/services/TranscriptionSession.ts` in the `start()` method:
```typescript
this.dgConnection = this.deepgram.listen.live({
  model: 'nova-2',        // Change model
  language: 'en',         // Change language
  // Add more options...
});
```

### Adding New Types
Edit `src/types/index.ts`:
```typescript
export interface YourNewType {
  field1: string;
  field2: number;
}
```

## Testing

### Health Check
```bash
curl http://localhost:3000/health
# Expected: {"status":"ok"}
```

### WebSocket Test (TypeScript)
```typescript
import WebSocket from 'ws';

const ws = new WebSocket('ws://localhost:3000');

ws.on('open', () => {
  ws.send(JSON.stringify({
    action: 'start',
    roomName: 'test-room',
    participantIdentity: 'test-user'
  }));
});

ws.on('message', (data: WebSocket.Data) => {
  console.log('Received:', JSON.parse(data.toString()));
});
```

## Known Limitations

1. **Audio resampling:** Current implementation assumes audio is already 16kHz mono. Production use may require proper resampling logic in `convertAudioFrame()`.

2. **No authentication:** WebSocket connections are unauthenticated. Add token-based auth for production.

3. **No rate limiting:** Consider adding rate limiting for production deployments.

4. **Single participant tracking:** Each session tracks one participant at a time.

## Troubleshooting

### "Missing required environment variables" error
- Ensure all required env vars are set in `.env`
- Check `.env` is in the same directory as `server.js`

### No transcripts received
- Verify Deepgram API key is valid
- Check LiveKit participant identity matches exactly
- Ensure audio track is published in LiveKit room
- Check audio format (should be 16kHz, mono, linear16)

### WebSocket connection fails
- Check if port is already in use (change `PORT` env var)
- Verify firewall settings
- Check client can reach server URL

### LiveKit connection errors
- Verify LiveKit URL format (must start with `wss://`)
- Check API key and secret are correct
- Ensure room exists or can be created

## Future Enhancements

- [ ] Add authentication/authorization for WebSocket connections
- [ ] Implement proper audio resampling for non-16kHz sources
- [ ] Add support for multiple participants per session
- [ ] Add retry logic for Deepgram disconnections
- [ ] Implement session recording/playback
- [ ] Add metrics and monitoring (Prometheus, etc.)
- [ ] Add unit tests and integration tests
- [ ] Support additional languages
- [ ] Add sentiment analysis
- [ ] Export transcripts to various formats (SRT, VTT, etc.)

## Dependencies

### Core
- **express** - HTTP server
- **ws** - WebSocket server
- **livekit-server-sdk** - LiveKit integration
- **@deepgram/sdk** - Deepgram speech-to-text
- **dotenv** - Environment variable management

### TypeScript & Dev Tools
- **typescript** - TypeScript compiler
- **ts-node** - Run TypeScript directly in dev mode
- **@types/express** - Express type definitions
- **@types/node** - Node.js type definitions
- **@types/ws** - WebSocket type definitions
- **nodemon** - Auto-reload during development

## TypeScript Benefits

This project uses TypeScript with strict mode enabled for:
- **Type safety** - Catch errors at compile time
- **Better IDE support** - Autocomplete and inline documentation
- **Easier refactoring** - Rename symbols safely across files
- **Self-documenting code** - Types serve as inline documentation
- **Reduced runtime errors** - Null checks and type guards

## Support

For questions or issues:
1. Check [README.md](README.md) for usage documentation
2. Review this file for architecture details
3. Check environment variables and configuration
4. Test with health check endpoint first
5. Use WebSocket test script to debug connectivity

## Contributing

When adding new features:
1. Keep the modular structure (config, services, handlers, constants, types)
2. **Define types first** in `src/types/index.ts`
3. Use strict TypeScript - no `any` types without good reason
4. Update this CLAUDE.md file with architectural changes
5. Update README.md with user-facing changes
6. Validate all required environment variables in `src/config/index.ts`
7. Follow existing error handling patterns
8. Add cleanup logic for any new resources (connections, streams, etc.)
9. Run `npm run build` to ensure TypeScript compiles without errors
