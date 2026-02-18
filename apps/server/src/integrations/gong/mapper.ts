/**
 * Mappers that convert Gong API responses into the shape
 * expected by Drizzle insert/upsert for the gong_calls and gong_transcripts tables.
 */

import type { GongApiCall, GongApiCallTranscript, GongApiParty } from './client.js';

// ---------- helpers ----------

function toDateOrNull(value: unknown): Date | null {
  if (value == null) return null;
  const d = new Date(value as string);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toStringOrNull(value: unknown): string | null {
  if (value == null) return null;
  return String(value);
}

function toIntOrNull(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : Math.round(n);
}

// ---------- call mapper ----------

export interface MappedGongCall {
  gongId: string;
  title: string | null;
  scheduledStart: Date | null;
  scheduledEnd: Date | null;
  started: Date | null;
  duration: number | null;
  direction: string | null;
  scope: string | null;
  media: string | null;
  language: string | null;
  url: string | null;
  accountSfId: string | null;
  opportunitySfId: string | null;
  participants: Array<{ name: string; email: string | null; role: 'internal' | 'external' }>;
}

/**
 * Map a Gong API call response to the DB insert format for gong_calls.
 * Extracts CRM context to link to Salesforce opportunity/account if available.
 */
export function mapCall(gongCall: GongApiCall): MappedGongCall {
  // Extract participant info from the parties array
  const participants = (gongCall.parties ?? []).map((party: GongApiParty) => ({
    name: party.name ?? 'Unknown',
    email: party.emailAddress ?? null,
    role: mapAffiliation(party.affiliation),
  }));

  // Extract CRM context to link to Salesforce objects
  let accountSfId: string | null = null;
  let opportunitySfId: string | null = null;

  if (gongCall.context && gongCall.context.length > 0) {
    for (const ctx of gongCall.context) {
      // Look for Salesforce CRM objects
      if (ctx.system?.toLowerCase() === 'salesforce' && ctx.objects) {
        for (const obj of ctx.objects) {
          if (obj.objectType === 'Opportunity' && obj.objectId) {
            opportunitySfId = obj.objectId;
          }
          if (obj.objectType === 'Account' && obj.objectId) {
            accountSfId = obj.objectId;
          }
        }
      }
    }
  }

  return {
    gongId: gongCall.id,
    title: toStringOrNull(gongCall.title),
    scheduledStart: toDateOrNull(gongCall.scheduled),
    scheduledEnd: null, // Gong API doesn't provide a separate scheduled end
    started: toDateOrNull(gongCall.started),
    duration: toIntOrNull(gongCall.duration),
    direction: toStringOrNull(gongCall.direction),
    scope: toStringOrNull(gongCall.scope),
    media: toStringOrNull(gongCall.media),
    language: toStringOrNull(gongCall.language),
    url: toStringOrNull(gongCall.url),
    accountSfId,
    opportunitySfId,
    participants,
  };
}

// ---------- transcript mapper ----------

export interface MappedGongTranscript {
  callId: string;
  fullText: string;
  segments: Array<{
    speakerName: string;
    speakerRole: 'internal' | 'external';
    startTime: number;
    endTime: number;
    text: string;
  }>;
}

/**
 * Map a Gong API transcript response to the DB insert format for gong_transcripts.
 * Builds the fullText from all segments concatenated.
 * Builds a segments JSON array with speaker, timing, and text information.
 *
 * @param callId - The internal DB UUID of the gong_calls row.
 * @param transcript - The Gong API transcript response for this call.
 * @param speakerMap - Map from Gong speakerId to party info, built from the call's parties.
 */
export function mapTranscript(
  callId: string,
  transcript: GongApiCallTranscript,
  speakerMap: Map<string, { name: string; role: 'internal' | 'external' }>,
): MappedGongTranscript {
  const segments: MappedGongTranscript['segments'] = [];
  const textParts: string[] = [];

  for (const entry of transcript.transcript ?? []) {
    const speaker = entry.speakerId
      ? speakerMap.get(entry.speakerId) ?? { name: 'Unknown', role: 'external' as const }
      : { name: 'Unknown', role: 'external' as const };

    for (const sentence of entry.sentences) {
      segments.push({
        speakerName: speaker.name,
        speakerRole: speaker.role,
        startTime: sentence.start,
        endTime: sentence.end,
        text: sentence.text,
      });

      textParts.push(sentence.text);
    }
  }

  return {
    callId,
    fullText: textParts.join(' '),
    segments,
  };
}

// ---------- helpers ----------

/**
 * Map Gong API affiliation to our internal role type.
 */
function mapAffiliation(affiliation?: string): 'internal' | 'external' {
  if (affiliation === 'Internal') return 'internal';
  return 'external';
}

/**
 * Build a speaker map from a Gong API call's parties array.
 * Maps speakerId -> { name, role }.
 */
export function buildSpeakerMap(
  parties: GongApiParty[] | undefined,
): Map<string, { name: string; role: 'internal' | 'external' }> {
  const map = new Map<string, { name: string; role: 'internal' | 'external' }>();

  if (!parties) return map;

  for (const party of parties) {
    if (party.speakerId) {
      map.set(party.speakerId, {
        name: party.name ?? 'Unknown',
        role: mapAffiliation(party.affiliation),
      });
    }
    // Also map by party ID in case speakerId in transcript entries refers to the party id
    if (party.id) {
      map.set(party.id, {
        name: party.name ?? 'Unknown',
        role: mapAffiliation(party.affiliation),
      });
    }
  }

  return map;
}
