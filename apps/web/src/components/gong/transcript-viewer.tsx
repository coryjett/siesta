import clsx from 'clsx';
import type { GongTranscriptSegment } from '@siesta/shared';

interface TranscriptViewerProps {
  segments: GongTranscriptSegment[];
  className?: string;
}

/**
 * Format a time in seconds to mm:ss display format.
 */
function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * Full transcript viewer component.
 * Displays each segment with speaker name (color-coded by role),
 * timestamp, and text content in a scrollable container.
 */
export default function TranscriptViewer({ segments, className }: TranscriptViewerProps) {
  if (segments.length === 0) {
    return (
      <div className={clsx('text-sm text-gray-500 italic py-8 text-center', className)}>
        No transcript available for this call.
      </div>
    );
  }

  // Group consecutive segments by the same speaker for a cleaner view
  const grouped = groupBySpeaker(segments);

  return (
    <div
      className={clsx(
        'max-h-[600px] overflow-y-auto rounded-lg border border-gray-200 bg-white',
        className,
      )}
    >
      <div className="divide-y divide-gray-100">
        {grouped.map((group, groupIndex) => (
          <div key={groupIndex} className="px-4 py-3">
            <div className="flex items-center gap-2 mb-1.5">
              <span
                className={clsx(
                  'text-sm font-semibold',
                  group.speakerRole === 'internal'
                    ? 'text-blue-700'
                    : 'text-gray-600',
                )}
              >
                {group.speakerName}
              </span>
              <span
                className={clsx(
                  'inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide',
                  group.speakerRole === 'internal'
                    ? 'bg-blue-50 text-blue-600'
                    : 'bg-gray-100 text-gray-500',
                )}
              >
                {group.speakerRole}
              </span>
              <span className="text-xs text-gray-400">
                {formatTimestamp(group.startTime)}
                {' - '}
                {formatTimestamp(group.endTime)}
              </span>
            </div>
            <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
              {group.text}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- helpers ----------

interface GroupedSegment {
  speakerName: string;
  speakerRole: 'internal' | 'external';
  startTime: number;
  endTime: number;
  text: string;
}

/**
 * Group consecutive segments by the same speaker into single blocks.
 */
function groupBySpeaker(segments: GongTranscriptSegment[]): GroupedSegment[] {
  const grouped: GroupedSegment[] = [];

  for (const segment of segments) {
    const last = grouped[grouped.length - 1];

    if (last && last.speakerName === segment.speakerName) {
      // Extend the existing group
      last.endTime = segment.endTime;
      last.text += ' ' + segment.text;
    } else {
      // Start a new group
      grouped.push({
        speakerName: segment.speakerName,
        speakerRole: segment.speakerRole,
        startTime: segment.startTime,
        endTime: segment.endTime,
        text: segment.text,
      });
    }
  }

  return grouped;
}
