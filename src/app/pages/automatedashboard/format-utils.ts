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
