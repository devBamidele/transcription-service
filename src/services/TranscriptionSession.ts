/**
 * TranscriptionSession - Core service for real-time speech transcription
 *
 * Responsibilities:
 * 1. Connect to LiveKit room and subscribe to participant's audio
 * 2. Stream audio to Deepgram for real-time speech-to-text
 * 3. Send live transcripts back to Flutter client via WebSocket
 * 4. Accumulate all transcription data during session
 * 5. Generate comprehensive analysis (pace, fillers, pauses)
 * 6. Send final summary to Nest.js backend for AI analysis
 *
 * Architecture:
 * LiveKit (audio source) → This Service → Deepgram (STT) → Flutter (live transcript)
 *                                                         → Backend (final analysis)
 */
import * as rtc from "@livekit/rtc-node";
import { AccessToken } from "livekit-server-sdk";
import { createClient, LiveTranscriptionEvents, LiveClient } from "@deepgram/sdk";
import WebSocket from "ws";
import axios from "axios";
import config from "../config";
import { PAUSE_THRESHOLD, PACE_SEGMENT_INTERVAL, CONTEXT_WORDS_COUNT, isFillerWord } from "../constants/speech";
import { TranscriptWord, Pause, ServerMessage, SessionSummary, PaceTimelinePoint, FillerWithContext, TranscriptSegment } from "../types";

class TranscriptionSession {
  // Session identifiers
  private roomName: string;
  private participantIdentity: string;

  // WebSocket connection to Flutter client
  private clientWs: WebSocket;

  // LiveKit and Deepgram connections
  private room: rtc.Room | null = null;
  private dgConnection: LiveClient | null = null;
  private sessionActive: boolean = false;

  // Accumulated session data for final analysis
  private allWords: TranscriptWord[] = [];
  private segments: TranscriptSegment[] = [];
  private startTime: number | null = null;
  private endTime: number | null = null;

  constructor(roomName: string, participantIdentity: string, clientWs: WebSocket) {
    this.roomName = roomName;
    this.participantIdentity = participantIdentity;
    this.clientWs = clientWs;
  }

  async start(): Promise<void> {
    try {
      await this.connectToLiveKit();

      const deepgram = createClient(config.deepgram.apiKey);
      this.dgConnection = deepgram.listen.live({
        model: "nova-2",
        language: "en",
        smart_format: true,
        encoding: "linear16",
        sample_rate: 16000,
        channels: 1,
        interim_results: true,
        utterance_end_ms: 1500,
        endpointing: 500,
      });

      this.dgConnection.on(LiveTranscriptionEvents.Open, () => {
        console.log("Deepgram connection opened");

        this.dgConnection!.on(LiveTranscriptionEvents.Transcript, (data: any) => {
          this.handleTranscript(data);
        });

        this.dgConnection!.on(LiveTranscriptionEvents.Error, (error: any) => {
          console.error("Deepgram error:", error);
        });
      });

      this.sessionActive = true;
      console.log(`Session started for ${this.participantIdentity} in room ${this.roomName}`);
    } catch (error) {
      console.error("Failed to start session:", error);
      this.sendToClient({
        type: "error",
        message: error instanceof Error ? error.message : "Unknown error",
      });
      await this.cleanup();
    }
  }

  private handleTranscript(data: any): void {
    const transcript = data.channel?.alternatives?.[0];
    if (!transcript?.transcript) return;

    const words: TranscriptWord[] = transcript.words || [];
    const isFinal: boolean = data.is_final;

    // Send live transcript to client
    this.sendToClient({
      type: "transcript",
      text: transcript.transcript,
      isFinal,
      words,
    });

    // Accumulate final transcripts
    if (isFinal && words.length > 0) {
      if (this.startTime === null) this.startTime = words[0].start;

      this.allWords.push(...words);
      this.segments.push({
        text: transcript.transcript,
        startTime: words[0].start,
        endTime: words[words.length - 1].end,
        words,
      });

      this.endTime = words[words.length - 1].end;
    }
  }

  /**
   * Complete Session - Generate summary and send to backend
   *
   * Called when user clicks "End Interview" in Flutter app.
   * This method:
   * 1. Generates comprehensive session summary (transcript, pace, fillers, pauses)
   * 2. POSTs summary to Nest.js backend for OpenAI analysis
   * 3. Sends confirmation message back to Flutter client
   */
  public async completeSession(): Promise<void> {
    if (this.allWords.length === 0) {
      this.sendToClient({ type: "error", message: "No session data to complete" });
      return;
    }

    try {
      // Generate summary from accumulated data
      const summary = this.generateSummary();

      // Send to backend for AI processing
      await this.sendToBackend(summary);

      // Notify Flutter client (doesn't send full summary anymore)
      this.sendToClient({
        type: "session_complete",
        message: "Session completed. Analysis in progress...",
      });
    } catch (error) {
      console.error("Error completing session:", error);
      this.sendToClient({
        type: "error",
        message: "Failed to complete session",
      });
    }
  }

  private generateSummary(): SessionSummary {
    const duration = this.endTime! - this.startTime!;
    const fullTranscript = this.segments.map((s) => s.text).join(" ");
    const averagePace = duration > 0 ? (this.allWords.length / duration) * 60 : 0;

    return {
      transcript: fullTranscript,
      duration: parseFloat(duration.toFixed(2)),
      totalWords: this.allWords.length,
      words: this.allWords,
      paceTimeline: this.calculatePaceTimeline(),
      averagePace: Math.round(averagePace),
      fillers: this.detectFillers(),
      pauses: this.detectPauses(),
      transcriptSegments: this.segments,
    };
  }

  /**
   * Send Session Summary to Backend
   *
   * POSTs the complete session data to Nest.js backend at:
   * POST /api/interviews/analyze
   *
   * Backend will:
   * - Store transcript and analysis data in MongoDB
   * - Send to OpenAI for AI-powered insights
   * - Return comprehensive analysis to Flutter app
   */
  private async sendToBackend(summary: SessionSummary): Promise<void> {
    const backendUrl = `${config.backend.url}${config.backend.analyzeEndpoint}`;

    try {
      const response = await axios.post(backendUrl, {
        roomName: this.roomName,
        participantIdentity: this.participantIdentity,
        sessionData: summary,
      });

      console.log("Successfully sent summary to backend:", response.status);
    } catch (error) {
      console.error("Failed to send summary to backend:", error);
      throw error;
    }
  }

  private calculatePaceTimeline(): PaceTimelinePoint[] {
    const timeline: PaceTimelinePoint[] = [];
    const duration = this.endTime! - this.startTime!;

    for (let t = 0; t < duration; t += PACE_SEGMENT_INTERVAL) {
      const segStart = this.startTime! + t;
      const segEnd = segStart + PACE_SEGMENT_INTERVAL;

      const segWords = this.allWords.filter((w) => w.start >= segStart && w.end <= segEnd);

      if (segWords.length > 0) {
        const segDuration = segWords[segWords.length - 1].end - segWords[0].start;
        const wpm = segDuration > 0 ? (segWords.length / segDuration) * 60 : 0;
        timeline.push({ timestamp: segStart, wpm: Math.round(wpm), segmentStart: segStart, segmentEnd: segEnd });
      }
    }

    return timeline;
  }

  private detectFillers(): FillerWithContext[] {
    return this.allWords
      .map((word, i) => {
        if (!isFillerWord(word.word)) return null;

        const start = Math.max(0, i - CONTEXT_WORDS_COUNT);
        const end = Math.min(this.allWords.length - 1, i + CONTEXT_WORDS_COUNT);

        return {
          word: word.word,
          timestamp: word.start,
          contextBefore: this.allWords.slice(start, i).map((w) => w.word).join(" "),
          contextAfter: this.allWords.slice(i + 1, end + 1).map((w) => w.word).join(" "),
        };
      })
      .filter((f): f is FillerWithContext => f !== null);
  }

  private detectPauses(): Pause[] {
    const pauses: Pause[] = [];
    for (let i = 1; i < this.allWords.length; i++) {
      const gap = this.allWords[i].start - this.allWords[i - 1].end;
      if (gap > PAUSE_THRESHOLD) {
        pauses.push({
          duration: parseFloat(gap.toFixed(2)),
          timestamp: parseFloat(this.allWords[i - 1].end.toFixed(2)),
        });
      }
    }
    return pauses;
  }

  private async connectToLiveKit(): Promise<void> {
    this.room = new rtc.Room();

    this.room.on(rtc.RoomEvent.TrackSubscribed, (track: rtc.RemoteTrack, _pub: rtc.RemoteTrackPublication, participant: rtc.RemoteParticipant) => {
      if (participant.identity === this.participantIdentity && track.kind === rtc.TrackKind.KIND_AUDIO) {
        console.log(`Subscribed to audio from ${participant.identity}`);
        this.handleAudioTrack(track);
      }
    });

    this.room.on(rtc.RoomEvent.Disconnected, async () => {
      console.log("Disconnected from LiveKit");
      await this.cleanup();
    });

    const token = new AccessToken(config.livekit.apiKey, config.livekit.apiSecret, {
      identity: "transcription-service",
      name: "Transcription Bot",
    });
    token.addGrant({ roomJoin: true, room: this.roomName });

    await this.room.connect(config.livekit.url, await token.toJwt(), {
      autoSubscribe: true,
      dynacast: true,
    });
  }

  private async handleAudioTrack(track: rtc.RemoteTrack): Promise<void> {
    try {
      const audioStream = new rtc.AudioStream(track, { sampleRate: 16000, numChannels: 1 });

      for await (const event of audioStream) {
        if (this.dgConnection && this.sessionActive) {
          this.dgConnection.send(event.data.buffer as ArrayBuffer);
        } else {
          break;
        }
      }
    } catch (error) {
      console.error("Error handling audio track:", error);
    }
  }

  private sendToClient(data: ServerMessage): void {
    if (this.clientWs?.readyState === WebSocket.OPEN) {
      this.clientWs.send(JSON.stringify(data));
    }
  }

  async cleanup(): Promise<void> {
    this.sessionActive = false;

    if (this.dgConnection) {
      try {
        this.dgConnection.requestClose();
      } catch (error) {
        console.error("Error closing Deepgram:", error);
      }
      this.dgConnection = null;
    }

    if (this.room) {
      try {
        await this.room.disconnect();
      } catch (error) {
        console.error("Error disconnecting from LiveKit:", error);
      }
      this.room = null;
    }
  }
}

export default TranscriptionSession;
