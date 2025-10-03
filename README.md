# LiveKit-Deepgram Transcription Service

Real-time speech transcription and analysis service for interview coaching applications. Integrates **LiveKit** (audio streaming), **Deepgram** (speech-to-text), and your **Nest.js backend** (AI analysis).

## 🏗️ Architecture

```
Flutter App ←→ [This Service] ←→ LiveKit (audio)
                      ↓
                  Deepgram (STT)
                      ↓
              Nest.js Backend (OpenAI analysis)
```

**During Interview:**
- Streams live transcripts to Flutter app via WebSocket
- Accumulates all speech data (words, timestamps)

**After Interview:**
- Generates comprehensive summary (pace, fillers, pauses)
- Sends to backend for AI-powered insights
- Backend stores in MongoDB and returns analysis

---

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env` and add your credentials:

```bash
cp .env.example .env
```

**Required variables:**
```env
# Get from https://cloud.livekit.io
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your_api_key
LIVEKIT_API_SECRET=your_secret

# Get from https://console.deepgram.com/
DEEPGRAM_API_KEY=your_deepgram_key

# Server config
PORT=3001

# Your Nest.js backend URL
BACKEND_URL=http://localhost:3000
```

> ⚠️ **Security:** Never commit `.env` to git. It's already in `.gitignore`.

### 3. Run the Service

**Development (auto-reload):**
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

---

## 📡 WebSocket Protocol

### Client → Server Messages

**Start Session:**
```json
{
  "action": "start",
  "roomName": "interview-room-123",
  "participantIdentity": "user-456"
}
```

**Stop Session (cancel):**
```json
{
  "action": "stop"
}
```

**Complete Session (end interview):**
```json
{
  "action": "complete"
}
```

### Server → Client Messages

**Live Transcript:**
```json
{
  "type": "transcript",
  "text": "I think this is working",
  "isFinal": true,
  "words": [
    {"word": "I", "start": 0.5, "end": 0.7, "confidence": 0.99}
  ]
}
```

**Session Complete:**
```json
{
  "type": "session_complete",
  "message": "Session completed. Analysis in progress..."
}
```

**Error:**
```json
{
  "type": "error",
  "message": "Error description"
}
```

---

## 🔄 Data Flow

### During Interview
1. Flutter connects via WebSocket
2. Sends `"action": "start"` with room + participant info
3. Service connects to LiveKit room
4. Audio → Deepgram → Live transcripts → Flutter (real-time display)

### After Interview
1. Flutter sends `"action": "complete"`
2. Service generates **SessionSummary**:
   - Full transcript
   - Pace timeline (30-second segments)
   - Filler words with context (5 words before/after)
   - Pauses > 1.2 seconds
3. Service POSTs to `http://localhost:3000/api/interviews/analyze`
4. Backend processes with OpenAI
5. Flutter shows "Analysis in progress..." message

## Client Integration

### Connect from Flutter/Client

```javascript
// JavaScript example (adapt for Flutter WebSocket)
const ws = new WebSocket('ws://localhost:3000');

ws.onopen = () => {
  // Start transcription session
  ws.send(JSON.stringify({
    action: 'start',
    roomName: 'your-room-name',
    participantIdentity: 'user-to-transcribe'
  }));
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  switch(data.type) {
    case 'started':
      console.log('Session started');
      break;
      
    case 'transcript':
      // Live transcript with word timestamps
      console.log('Transcript:', data.text);
      console.log('Words:', data.words);
      console.log('Is Final:', data.isFinal);
      break;
      
    case 'analysis':
      // Speech analysis results
      console.log('Analysis:', data.data);
      // {
      //   pace: "165 words/min (a bit fast)",
      //   fillers: [{word: "um", timestamp: 0.5}],
      //   pauses: [{duration: 1.4, at: 5.6}],
      //   totalWords: 45,
      //   duration: 16.3
      // }
      break;
      
    case 'error':
      console.error('Error:', data.message);
      break;
  }
};

// Stop transcription
ws.send(JSON.stringify({ action: 'stop' }));
```

## Data Formats

### Transcript Event
```json
{
  "type": "transcript",
  "text": "um I want to work in consulting",
  "isFinal": true,
  "words": [
    {"word": "um", "start": 0.5, "end": 0.7, "confidence": 0.95},
    {"word": "I", "start": 0.8, "end": 1.0, "confidence": 0.99},
    {"word": "want", "start": 1.1, "end": 1.3, "confidence": 0.98}
  ]
}
```

### Analysis Event
```json
{
  "type": "analysis",
  "data": {
    "pace": "165 words/min (a bit fast)",
    "fillers": [
      {"word": "um", "timestamp": 0.5},
      {"word": "like", "timestamp": 4.2}
    ],
    "pauses": [
      {"duration": 1.4, "at": 5.6}
    ],
    "totalWords": 45,
    "duration": 16.3
  }
}
```

## Analysis Parameters

- **Pace Categories:**
  - Very fast: > 180 words/min
  - A bit fast: 150-180 words/min
  - Normal: 120-150 words/min
  - A bit slow: 100-120 words/min
  - Slow: < 100 words/min

- **Filler Words Detected:**
  - um, uh, like, you know, so, actually, basically, literally

- **Pause Threshold:** 
  - Gaps > 1.2 seconds between words

## Health Check

```bash
curl http://localhost:3000/health
```

Returns: `{"status": "ok"}`

## Troubleshooting

**Audio not streaming:**
- Verify LiveKit credentials are correct
- Ensure participant identity matches exactly
- Check that audio track is published in the room

**No transcripts received:**
- Verify Deepgram API key is valid
- Check audio format (should be 16kHz, mono, linear16)
- Review Deepgram console for API errors

**WebSocket connection fails:**
- Ensure PORT is not in use
- Check firewall settings
- Verify client can reach server URL

## 🚢 Deployment

### Environment Variables for Production

Update your `.env` with production URLs:

```env
LIVEKIT_URL=wss://your-production.livekit.cloud
LIVEKIT_API_KEY=your_production_key
LIVEKIT_API_SECRET=your_production_secret
DEEPGRAM_API_KEY=your_production_key
PORT=3001
BACKEND_URL=https://your-backend.com  # Production backend URL
```

### Deploy to Cloud

**Docker (recommended):**
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

**Build & Deploy:**
```bash
docker build -t transcription-service .
docker run -p 3001:3001 --env-file .env transcription-service
```

### Security Checklist

- ✅ `.env` is in `.gitignore`
- ✅ No secrets in `.env.example`
- ✅ All secrets loaded from environment variables
- ⚠️ Add authentication for WebSocket connections (TODO)
- ⚠️ Use HTTPS/WSS in production
- ⚠️ Implement rate limiting

---

## 📚 Additional Documentation

For detailed architecture and implementation notes, see [CLAUDE.md](./CLAUDE.md).

---

## 🤝 Contributing

1. Never commit `.env` file
2. Keep `.env.example` updated (without real secrets)
3. Add comments to complex logic
4. Run `npm run build` to verify TypeScript compiles
5. Follow existing code style

---

## Production Considerations

1. **Audio Resampling:** Implement proper audio resampling if LiveKit audio isn't 16kHz
2. **Error Handling:** Add retry logic for Deepgram disconnections
3. **Rate Limiting:** Implement request rate limiting
4. **Authentication:** Add token-based auth for WebSocket connections
5. **Monitoring:** Add logging and metrics collection
6. **Scaling:** Use a message queue for multiple concurrent sessions