# Complete System Architecture

**Interview Coaching App - Full System Overview**

---

## High-Level Architecture

```
┌─────────────────┐
│  Flutter App    │ ← User Interface
│   (Mobile)      │
└────────┬────────┘
         │
         ├──────────────────────────────────────┐
         │                                      │
         │ HTTP                                 │ WebSocket
         │                                      │
         ▼                                      ▼
┌─────────────────┐                   ┌──────────────────┐
│  Nest.js        │◄─────HTTP─────────│  Transcription   │
│  Backend        │                   │  Service         │
│  (Port 3000)    │                   │  (Port 3001)     │
└────────┬────────┘                   └────────┬─────────┘
         │                                     │
         │                                     │
         ├──────────┐                         │
         │          │                         │
         ▼          ▼                         ▼
    ┌────────┐  ┌────────┐             ┌──────────┐
    │MongoDB │  │OpenAI  │             │Deepgram  │
    │        │  │API     │             │STT       │
    └────────┘  └────────┘             └──────────┘
         ▲
         │
    ┌────┴─────┐
    │ LiveKit  │
    │ Egress   │ ← Records sessions
    │(Optional)│
    └──────────┘

    ┌──────────┐
    │ LiveKit  │ ← Audio streaming
    │  Cloud   │
    └──────────┘
         ▲
         │
         │ Audio Stream
         │
    ┌────┴─────────┐
    │ Voice Agent  │ ← AI Interviewer
    │ (LiveKit AI) │
    └──────────────┘
```

---

## Complete Data Flow

### Phase 1: Setup (Before Interview)

```
1. Flutter → Backend: POST /api/livekit/token
   ├─ Body: {roomName, participantName}
   └─ Response: {token, url}

2. Flutter → LiveKit Cloud: Connect with token
   └─ Joins room, ready to receive audio

3. Flutter → Transcription Service: WebSocket connect
   └─ Send: {"action": "start", "roomName": "...", "participantIdentity": "..."}

4. Transcription Service → LiveKit: Connect as bot
   └─ Subscribe to user's audio track

5. Voice Agent → LiveKit: Joins room
   └─ Ready to conduct interview
```

---

### Phase 2: During Interview (5-10 minutes)

```
User speaks
    ↓
LiveKit Cloud (audio stream)
    ↓
    ├──→ Voice Agent (responds to user)
    │
    └──→ Transcription Service
         ├─ Streams to Deepgram
         │      ↓
         │  Returns text + timestamps
         │
         ├─ Accumulates data:
         │  • All words with timestamps
         │  • Transcript segments
         │  • Detects fillers/pauses
         │
         └─ Sends live transcript → Flutter (WebSocket)
                                       ↓
                                   Display to user
```

**What happens:**
- User has conversation with AI Voice Agent
- Transcription Service listens and converts speech → text
- Flutter displays live transcript (optional, can be hidden)
- All data accumulated in memory

---

### Phase 3: End Interview

```
1. User clicks "End Interview" in Flutter
   ↓
2. Flutter → Transcription Service: {"action": "complete"}
   ↓
3. Transcription Service:
   ├─ Generates SessionSummary:
   │  • Full transcript
   │  • Duration, word count
   │  • Pace timeline (30s segments)
   │  • Filler words with context (5 words before/after)
   │  • Pauses > 1.2 seconds
   │  • All words with timestamps
   │
   ├─ POST to Backend: /api/interviews/analyze
   │  Body: {roomName, participantIdentity, sessionData: SessionSummary}
   │
   └─ Sends to Flutter: {"type": "session_complete", "message": "Analysis in progress..."}

4. Flutter:
   ├─ Shows loading: "Analyzing your interview..."
   └─ Starts polling backend for results
```

---

### Phase 4: AI Analysis (Backend Processing)

```
Backend receives POST /api/interviews/analyze
    ↓
1. Create Interview record in MongoDB (status: 'processing')
    ↓
2. Format data for OpenAI:
   • Transcript
   • Pace data
   • Filler words with context
   • Pauses
    ↓
3. Send to OpenAI API with prompt:
   "Analyze this interview practice session..."
    ↓
4. OpenAI returns analysis:
   • Overall score
   • Pace analysis
   • Filler patterns
   • Confidence score
   • Specific improvements with timestamps
   • Highlights
    ↓
5. Update MongoDB (status: 'completed')
    ↓
6. (Optional) Get recording URL from LiveKit Egress
    ↓
7. Store everything in Interview record
```

---

### Phase 5: Display Results

```
Flutter polls: GET /api/interviews/:id
    ↓
Backend responds when status === 'completed':
    {
      id, transcript, duration, recordingUrl,
      metrics: {averagePace, fillerCount, paceTimeline, ...},
      aiAnalysis: {score, summary, improvements, highlights, ...}
    }
    ↓
Flutter displays:
    ├─ Score card
    ├─ Audio player (if recording available)
    ├─ Transcript with timeline
    ├─ Pace chart
    ├─ Filler words (clickable → jump to timestamp)
    ├─ AI insights
    └─ Improvement suggestions
```

---

## Components & Responsibilities

### 1. Flutter App (Frontend)
**Port:** N/A
**Tech:** Flutter, Dart

**Responsibilities:**
- User authentication
- Interview setup UI
- WebSocket client for live transcripts
- LiveKit client for audio
- Display live transcript (optional)
- Poll backend for analysis
- Display results with charts/timeline
- Audio playback with timestamp navigation

**Dependencies:**
- `livekit_client` - Audio streaming
- `web_socket_channel` - WebSocket connection
- `http` - REST API calls
- `just_audio` - Audio playback
- `fl_chart` - Charts/graphs

---

### 2. Nest.js Backend
**Port:** 3000
**Tech:** NestJS, TypeScript, Prisma, MongoDB

**Responsibilities:**
- User authentication & management
- Generate LiveKit tokens
- Receive transcription summaries
- Call OpenAI API for analysis
- Store interviews in MongoDB
- Return analysis results to Flutter
- (Optional) Manage LiveKit Egress recordings

**Endpoints:**
- `POST /api/livekit/token` - Generate token
- `POST /api/interviews/analyze` - Receive & process session
- `GET /api/interviews/:id` - Get analysis results
- `GET /api/interviews` - List user's interviews

**Environment Variables:**
```env
MONGODB_URI=mongodb://...
OPENAI_API_KEY=sk-...
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
LIVEKIT_URL=wss://...
```

---

### 3. Transcription Service (This Service)
**Port:** 3001
**Tech:** Node.js, TypeScript, Express, WebSocket

**Responsibilities:**
- WebSocket server for Flutter clients
- Connect to LiveKit rooms as bot
- Subscribe to participant audio
- Stream audio to Deepgram
- Send live transcripts to Flutter
- Accumulate session data
- Analyze speech patterns (pace, fillers, pauses)
- Send summary to Backend

**Endpoints:**
- `WebSocket /` - Client connections
- `GET /health` - Health check

**Environment Variables:**
```env
LIVEKIT_URL=wss://...
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
DEEPGRAM_API_KEY=...
BACKEND_URL=http://localhost:3000
PORT=3001
```

---

### 4. LiveKit Cloud
**Type:** Third-party service
**Purpose:** Real-time audio streaming

**Features:**
- WebRTC audio rooms
- Voice Agent SDK integration
- Egress (recording)
- Low latency

**Cost:** Pay per usage

---

### 5. LiveKit Voice Agent
**Type:** AI Service
**Tech:** LiveKit Agents SDK + OpenAI

**Responsibilities:**
- Join LiveKit room
- Conduct interview conversation
- Ask questions, respond to answers
- Natural conversation flow

**Deployment:** Cloud (separate service)

---

### 6. Deepgram
**Type:** Third-party API
**Purpose:** Speech-to-Text

**Features:**
- Real-time transcription
- Word-level timestamps
- High accuracy
- Low latency

**Cost:** Pay per audio minute

---

### 7. OpenAI
**Type:** Third-party API
**Purpose:** AI analysis

**Features:**
- GPT-4 for insights
- Analyze patterns
- Generate recommendations

**Cost:** Pay per token

---

### 8. MongoDB
**Type:** Database
**Purpose:** Data persistence

**Collections:**
- `users` - User accounts
- `interviews` - Interview sessions & analysis

---

### 9. LiveKit Egress (Optional)
**Type:** Recording service
**Purpose:** Save interview audio

**Features:**
- Server-side recording
- Upload to S3/R2/GCS
- On-demand or automatic

---

## Data Models

### SessionSummary (Transcription → Backend)
```typescript
{
  transcript: string,
  duration: number,
  totalWords: number,
  averagePace: number,
  paceTimeline: [{timestamp, wpm, segmentStart, segmentEnd}],
  fillers: [{word, timestamp, contextBefore, contextAfter}],
  pauses: [{duration, timestamp}],
  words: [{word, start, end, confidence}],
  transcriptSegments: [{text, startTime, endTime, words}]
}
```

### Interview (MongoDB)
```typescript
{
  _id: ObjectId,
  userId: ObjectId,
  roomName: string,
  createdAt: Date,
  duration: number,
  transcript: string,
  recordingUrl?: string,

  // Metrics
  totalWords: number,
  averagePace: number,
  paceTimeline: [...],
  fillers: [...],
  pauses: [...],
  words: [...],

  // AI Analysis
  aiAnalysis: {
    overallScore: number,
    summary: string,
    paceAnalysis: string,
    fillerAnalysis: string,
    confidenceScore: number,
    improvements: [{title, timestamp, description}],
    highlights: [string]
  },

  status: 'processing' | 'completed' | 'failed'
}
```

---

## Cost Estimates (Rough)

**Per 5-minute interview:**
- LiveKit: ~$0.02 (audio streaming)
- Deepgram: ~$0.04 (5 min × $0.0043/min)
- OpenAI GPT-4: ~$0.10-0.30 (depends on transcript length)
- LiveKit Recording: ~$0.01 (optional)
- **Total: ~$0.17-0.37 per interview**

**Monthly (100 interviews):**
- ~$17-37/month

---

## Deployment Checklist

### Transcription Service
- [x] Code complete
- [ ] Deploy to cloud (Render, Railway, AWS, etc.)
- [ ] Set environment variables
- [ ] Update `BACKEND_URL` to production
- [ ] Test WebSocket connection

### Backend
- [ ] Implement `/api/livekit/token`
- [ ] Implement `/api/interviews/analyze`
- [ ] Implement `/api/interviews/:id`
- [ ] Connect to MongoDB
- [ ] Integrate OpenAI
- [ ] Deploy to cloud

### Frontend
- [ ] WebSocket client implementation
- [ ] LiveKit integration
- [ ] Analysis results UI
- [ ] Audio player with timestamps
- [ ] Charts for pace timeline
- [ ] Deploy to stores

---

## Security Considerations

1. **Authentication:**
   - Implement JWT auth for Backend APIs
   - Validate LiveKit tokens
   - Secure WebSocket connections (consider token-based auth)

2. **Secrets:**
   - Never commit `.env` files
   - Use environment variables in production
   - Rotate API keys regularly

3. **Rate Limiting:**
   - Backend: Implement rate limits
   - Transcription Service: Limit concurrent sessions

4. **Data Privacy:**
   - Encrypt transcripts at rest
   - Delete recordings after X days (GDPR compliance)
   - Allow users to delete their data

---

## Monitoring & Logging

**What to monitor:**
- WebSocket connection failures
- Deepgram API errors
- OpenAI API failures
- Backend response times
- Database query performance

**Recommended tools:**
- Sentry (error tracking)
- LogTail / Papertrail (log aggregation)
- Prometheus + Grafana (metrics)

---

## Next Steps

1. **Backend:** Implement analysis endpoint
2. **Frontend:** Build WebSocket client
3. **Testing:** End-to-end test with all services
4. **Deployment:** Deploy to staging environment
5. **Recording:** Integrate LiveKit Egress (optional)
6. **Polish:** Add error handling, retry logic

---

## File Locations

- **This service:** `/Users/mac/Nestjs/transcription-service`
- **Backend:** (Your Nest.js project directory)
- **Frontend:** (Your Flutter project directory)

**Copy integration guides to:**
- `INTEGRATION_BACKEND.md` → Backend project root
- `INTEGRATION_FRONTEND.md` → Flutter project root
- `SYSTEM_ARCHITECTURE.md` → All three projects (for reference)
