import { FeedHealth } from './feed-health.types';

/** The one line a widget shows when the backend reports its upstream feed is
 *  not behaving, or `''` when there is nothing to say.
 *
 *  Deliberately short and Thai, and deliberately *not* the issue's own
 *  `detail`. That string is written for a log drain: English, technical, and
 *  carrying the numbers that tripped the check. On a wall display read from
 *  four metres away the only thing that can land is whether the panel below
 *  can be believed, so the two audiences get two different sentences rather
 *  than one compromise that serves neither.
 */
export function feedHealthMessage(health: FeedHealth | null | undefined): string {
    // Absent rather than false: an older backend that predates this field must
    // leave the board exactly as it was, not blank it on a missing property.
    if (!health || health.ok) return '';
    return health.trusted ? 'ข้อมูลต้นทางอาจไม่เป็นปัจจุบัน' : 'ข้อมูลต้นทางเชื่อถือไม่ได้';
}

/** Seconds -> a full `HH:MM:SS` clock reading, e.g. 12554 -> "03:29:14".
 *
 *  Every field is padded and no component is ever dropped, so durations stay
 *  the same width and can be compared down a column at a glance - a
 *  variable-width "2:21" next to "03:29:14" reads as a different kind of
 *  quantity rather than a shorter one.
 *
 *  Hours are padded to two digits but not truncated to two: `total_service` is
 *  the sum across every agent, so a busy branch can exceed 24h in a day and
 *  must render as "31:07:02" rather than wrapping to "07:07:02".
 */
export function formatDuration(totalSeconds: number): string {
    const seconds = Math.max(0, Math.floor(totalSeconds));
    const pad = (n: number) => `${n}`.padStart(2, '0');
    return `${pad(Math.floor(seconds / 3600))}:${pad(Math.floor((seconds % 3600) / 60))}:${pad(seconds % 60)}`;
}
