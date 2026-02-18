export interface GongCall {
  id: string;
  gongId: string;
  title: string | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  started: string | null;
  duration: number | null;
  direction: string | null;
  scope: string | null;
  media: string | null;
  language: string | null;
  url: string | null;
  accountId: string | null;
  opportunityId: string | null;
  participants: GongParticipant[];
  createdAt: string;
  updatedAt: string;
}

export interface GongParticipant {
  name: string;
  email: string | null;
  role: 'internal' | 'external';
}

export interface GongTranscript {
  id: string;
  callId: string;
  fullText: string;
  segments: GongTranscriptSegment[];
  createdAt: string;
}

export interface GongTranscriptSegment {
  speakerName: string;
  speakerRole: 'internal' | 'external';
  startTime: number;
  endTime: number;
  text: string;
}

export interface TranscriptSearchResult {
  callId: string;
  call: GongCall;
  snippet: string;
  rank: number;
}
