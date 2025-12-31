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
│   ├── server.ts                      # Main entry point + JWT auth setup
│   ├── config/
│   │   └── index.ts                   # Environment config & validation
│   ├── middleware/
│   │   └── jwtAuth.ts                 # JWT authentication middleware
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
- WebSocket server initialization with JWT authentication
- Manual upgrade handling for token validation before connection
- Health check endpoint (`GET /health`)
- Application entry point

### `src/middleware/jwtAuth.ts`
- JWT token extraction from query parameters
- Token signature verification using HS256
- Expiration, issuer, and audience validation
- Security audit logging for auth events
- Immediate connection rejection for invalid tokens

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
- Handles authenticated WebSocket client connections
- Validates JWT claims match request parameters
- Processes client messages (`start`, `stop`, `complete` actions)
- Enforces authorization (roomName and participantIdentity must match JWT)
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
- `JwtPayload` - JWT token structure with claims
- `AuthenticatedWebSocket` - Extended WebSocket with user context
- `ClientMessage` - WebSocket messages from client
- `ServerMessage` - WebSocket messages to client
- `SpeechAnalysis` - Analysis result structure
- `Config` - Application configuration (including JWT config)
- `TranscriptWord`, `FillerWord`, `Pause` - Speech analysis types

## Environment Variables

Required variables (validated on startup):
```env
# LiveKit Configuration
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your_api_key
LIVEKIT_API_SECRET=your_api_secret

# Deepgram Configuration
DEEPGRAM_API_KEY=your_deepgram_key

# Server Configuration
PORT=3001  # Optional, defaults to 3000

# Backend API
BACKEND_URL=http://localhost:8080  # Optional

# JWT Authentication (REQUIRED)
JWT_SECRET=your-secret-min-32-chars  # MUST match backend secret
JWT_ISSUER=interview-backend  # Optional, validates token issuer
JWT_AUDIENCE=transcription-service  # Optional, validates token audience
```

**Security Requirements:**
- `JWT_SECRET` must be at least 32 characters
- Must be the **same value** on both transcription service and backend
- Never commit secrets to version control

## WebSocket Protocol

### Authentication

**Connection URL:**
```
ws://localhost:3001?token=YOUR_JWT_TOKEN
```

The JWT token must:
- Be provided as a query parameter
- Be signed with `JWT_SECRET` (HS256 algorithm)
- Include required claims: `userId`, `roomName`, `participantIdentity`, `exp`
- Not be expired

**Authentication Flow:**
1. Client requests JWT from backend (includes user's authorized room and identity)
2. Backend generates JWT with claims and returns to client
3. Client connects to WebSocket with token in query parameter
4. Transcription service validates token before accepting connection
5. If invalid/expired: Connection immediately rejected with HTTP 401
6. If valid: Connection accepted and claims attached to WebSocket instance

### Client → Server Messages

**Start transcription:**
```json
{
  "action": "start",
  "roomName": "my-livekit-room",
  "participantIdentity": "user-id-to-transcribe"
}
```

**Authorization Check:** `roomName` and `participantIdentity` **must match** the JWT claims, otherwise request is rejected.

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

### Configuring Deepgram for Better Accuracy
Edit `src/services/TranscriptionSession.ts` in the `start()` method. The service uses optimized settings for accuracy:

**Current Configuration:**
```typescript
this.dgConnection = this.deepgram.listen.live({
  model: "nova-2-general",    // General-purpose model (best for everyday audio)
  language: "en",

  // Accuracy-improving features
  smart_format: true,         // Auto-formats numbers, dates, currencies, emails
  punctuate: true,            // Adds punctuation
  paragraphs: true,           // Segments into paragraphs
  diarize: true,              // Detects speaker changes
  filler_words: true,         // Detects filler words (um, uh, like)
  numerals: true,             // Converts "twenty one" → "21"
  vad_events: true,           // Voice Activity Detection events

  // Utterance control
  interim_results: true,      // Send preliminary results
  utterance_end_ms: 1500,     // Finalize after 1.5s silence
  endpointing: 500,           // Detect end after 500ms silence
});
```

**Available Nova-2 Model Variants:**
- `nova-2-general` - Everyday audio (default)
- `nova-2-meeting` - Conference rooms with multiple speakers
- `nova-2-phonecall` - Low-bandwidth phone calls
- `nova-2-medical` - Medical vocabulary
- `nova-2-finance` - Financial/earnings calls

**Additional Options for Specific Use Cases:**
```typescript
profanity_filter: true,     // Filter profanity with asterisks
redact: ["pci", "ssn"],     // Redact sensitive info (PII)
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
import jwt from 'jsonwebtoken';

// 1. Generate test JWT (in production, this comes from backend)
const token = jwt.sign(
  {
    userId: 'test-user-123',
    roomName: 'test-room',
    participantIdentity: 'test-user'
  },
  process.env.JWT_SECRET || 'your-secret-key',
  { expiresIn: '2h', issuer: 'interview-backend', audience: 'transcription-service' }
);

// 2. Connect with token as query parameter
const ws = new WebSocket(`ws://localhost:3001?token=${token}`);

ws.on('open', () => {
  console.log('Connected successfully');
  ws.send(JSON.stringify({
    action: 'start',
    roomName: 'test-room',
    participantIdentity: 'test-user'
  }));
});

ws.on('message', (data: WebSocket.Data) => {
  console.log('Received:', JSON.parse(data.toString()));
});

ws.on('close', (code, reason) => {
  console.log(`Connection closed: ${code} - ${reason}`);
});
```

## Known Limitations

1. **Audio resampling:** Current implementation assumes audio is already 16kHz mono. Production use may require proper resampling logic in `convertAudioFrame()`.

2. **No rate limiting:** Consider adding rate limiting for production deployments (connections per user per time period).

3. **Single participant tracking:** Each session tracks one participant at a time.

4. **Token expiration:** Long interview sessions (> 2 hours) will require token refresh implementation.

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

**Without JWT token:**
- Error: Connection closes immediately with HTTP 401
- Solution: Ensure JWT token is included in connection URL: `ws://host:port?token=...`

**Invalid/Expired JWT:**
- Error: "Invalid authentication token" or "Token expired"
- Solution: Request new JWT from backend
- Check JWT_SECRET matches between backend and transcription service
- Verify token is not expired (check `exp` claim)

**Authorization mismatch:**
- Error: "Unauthorized: roomName does not match token"
- Solution: Ensure `roomName` and `participantIdentity` in start message match JWT claims

**Other connection issues:**
- Check if port is already in use (change `PORT` env var)
- Verify firewall settings
- Check client can reach server URL

### LiveKit connection errors
- Verify LiveKit URL format (must start with `wss://`)
- Check API key and secret are correct
- Ensure room exists or can be created

### Poor transcription accuracy
**Common causes and solutions:**

1. **Poor audio quality from client**
   - Most common issue - client microphone quality affects accuracy
   - Background noise, echo, or compression artifacts reduce accuracy
   - Solution: Use good quality microphone, minimize background noise
   - Consider using noise cancellation on client side

2. **Network issues**
   - Packet loss between Client → LiveKit → Service → Deepgram
   - Solution: Monitor network quality, check for dropped packets
   - Interim results may be less accurate during unstable connections

3. **Wrong Deepgram model for use case**
   - Current: `nova-2-general` (everyday audio)
   - For phone calls: Switch to `nova-2-phonecall`
   - For meetings: Switch to `nova-2-meeting`
   - See "Configuring Deepgram for Better Accuracy" section

4. **Audio format mismatch**
   - Service expects 16kHz, mono, linear16
   - Verify LiveKit is sending audio in correct format
   - Check console logs for Deepgram errors

**Current accuracy-improving features enabled:**
- ✅ Smart formatting (numbers, dates, emails)
- ✅ Punctuation and paragraphs
- ✅ Speaker diarization
- ✅ Filler word detection
- ✅ Numeral conversion
- ✅ Voice Activity Detection (VAD)

**To test if issue is Deepgram vs network:**
- Check Deepgram error logs in console
- Test with known good audio source
- Compare interim vs final transcript accuracy
- Monitor `speech_event` messages for VAD detection

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
