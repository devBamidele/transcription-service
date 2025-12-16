// Type definitions for the transcription service
import WebSocket from "ws";

// Client message types
export interface StartMessage {
  action: "start";
  roomName: string;
  participantIdentity: string;
}

export interface StopMessage {
  action: "stop";
}

export interface CompleteMessage {
  action: "complete";
}

export type ClientMessage = StartMessage | StopMessage | CompleteMessage;

// Server message types
export interface TranscriptMessage {
  type: "transcript";
  text: string;
  isFinal: boolean;
  words: TranscriptWord[];
}

export interface ErrorMessage {
  type: "error";
  message: string;
}

export interface StatusMessage {
  type: "started" | "stopped";
  message: string;
}

export interface SessionCompleteMessage {
  type: "session_complete";
  message: string;
  interviewId: string;
}

export interface SpeechEventMessage {
  type: "speech_event";
  event: "started" | "utterance_end";
}

export type ServerMessage =
  | TranscriptMessage
  | ErrorMessage
  | StatusMessage
  | SessionCompleteMessage
  | SpeechEventMessage;

// Deepgram types
export interface TranscriptWord {
  word: string;
  start: number;
  end: number;
  confidence: number;
}

// Session summary types
export interface PaceTimelinePoint {
  timestamp: number;
  wpm: number;
  segmentStart: number;
  segmentEnd: number;
}

export interface FillerWithContext {
  word: string;
  timestamp: number;
  contextBefore: string;
  contextAfter: string;
}

export interface Pause {
  duration: number;
  timestamp: number;
}

export interface TranscriptSegment {
  text: string;
  startTime: number;
  endTime: number;
  words: TranscriptWord[];
}

export interface SessionSummary {
  transcript: string;
  duration: number;
  totalWords: number;
  words: TranscriptWord[];
  paceTimeline: PaceTimelinePoint[];
  averagePace: number;
  fillers: FillerWithContext[];
  pauses: Pause[];
  transcriptSegments: TranscriptSegment[];
}

// Configuration types
export interface Config {
  livekit: {
    url: string;
    apiKey: string;
    apiSecret: string;
  };
  deepgram: {
    apiKey: string;
  };
  server: {
    port: number;
  };
  backend: {
    url: string;
    analyzeEndpoint: string;
  };
}

// WebSocket with session
export interface WebSocketWithSession extends WebSocket {
  session?: any;
}
