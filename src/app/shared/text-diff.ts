// A small inline diff for showing what an edit changed in a piece of text:
// the unchanged parts plain, only what was removed and what was added
// marked. Used by the flood intake drawer's history dialog, where an
// operator who appended "ซ.8" to a sentence should see "ซ.8", not the whole
// sentence struck through and typed out again.
//
// Character-level, not word-level: Thai is written without spaces, so there
// are no words to split on. The characters are grapheme clusters (a
// consonant with its vowel and tone marks as one unit) so a change never
// splits a syllable in a way that cannot be displayed.

export interface DiffSegment {
    kind: 'same' | 'del' | 'ins';
    text: string;
}

// Below this share of unchanged text the two values are simply different
// things - a status flipped, another crew named - and a character diff of
// them is noise. The caller shows old and new whole instead.
const MIN_SIMILARITY = 0.5;

// Values longer than this are compared by whole words instead of clusters,
// to keep the table small: the dialog's texts are a sentence or two, but a
// remarks field can run long.
const MAX_CLUSTER_DIFF = 400;

let segmenter: Intl.Segmenter | null | undefined;

function clusters(text: string): string[] {
    if (segmenter === undefined) {
        // Missing on older browsers; code points are an acceptable fallback,
        // just less careful about combining marks.
        segmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
    }
    return segmenter ? Array.from(segmenter.segment(text), (s) => s.segment) : Array.from(text);
}

/**
 * The segments of `to` relative to `from`, or null when the two share too
 * little to be worth aligning (or either is empty), in which case the caller
 * should show them whole.
 */
export function diffText(from: string, to: string): DiffSegment[] | null {
    if (!from || !to || from === to) return null;
    const long = from.length > MAX_CLUSTER_DIFF || to.length > MAX_CLUSTER_DIFF;
    const a = long ? from.split(/(\s+)/).filter(Boolean) : clusters(from);
    const b = long ? to.split(/(\s+)/).filter(Boolean) : clusters(to);

    // Longest common subsequence, then walk it back into segments.
    const rows = a.length + 1;
    const cols = b.length + 1;
    const lcs = new Uint16Array(rows * cols);
    for (let i = a.length - 1; i >= 0; i--) {
        for (let j = b.length - 1; j >= 0; j--) {
            lcs[i * cols + j] = a[i] === b[j] ? lcs[(i + 1) * cols + j + 1] + 1 : Math.max(lcs[(i + 1) * cols + j], lcs[i * cols + j + 1]);
        }
    }
    const shared = lcs[0];
    if (shared / Math.max(a.length, b.length) < MIN_SIMILARITY) return null;

    const segments: DiffSegment[] = [];
    const push = (kind: DiffSegment['kind'], text: string) => {
        const last = segments[segments.length - 1];
        if (last && last.kind === kind) last.text += text;
        else segments.push({ kind, text });
    };
    let i = 0;
    let j = 0;
    while (i < a.length && j < b.length) {
        if (a[i] === b[j]) {
            push('same', a[i]);
            i++;
            j++;
        } else if (lcs[(i + 1) * cols + j] >= lcs[i * cols + j + 1]) {
            push('del', a[i]);
            i++;
        } else {
            push('ins', b[j]);
            j++;
        }
    }
    while (i < a.length) push('del', a[i++]);
    while (j < b.length) push('ins', b[j++]);

    return absorbSlivers(segments);
}

// A single unchanged cluster caught between two changes ("บ้าน" -> "บ้าง"
// aligning on the vowel) reads worse than marking the whole syllable, so
// such slivers are folded into the change on either side.
function absorbSlivers(segments: DiffSegment[]): DiffSegment[] {
    const out: DiffSegment[] = [];
    for (let k = 0; k < segments.length; k++) {
        const seg = segments[k];
        const between = k > 0 && k < segments.length - 1 && seg.kind === 'same' && clusters(seg.text).length <= 1;
        if (!between) {
            merge(out, seg);
            continue;
        }
        merge(out, { kind: 'del', text: seg.text });
        merge(out, { kind: 'ins', text: seg.text });
    }
    // Folding can leave del/ins out of order (del, ins, del, ins); regroup
    // each run of changes into one del followed by one ins.
    const grouped: DiffSegment[] = [];
    let del = '';
    let ins = '';
    const flush = () => {
        if (del) grouped.push({ kind: 'del', text: del });
        if (ins) grouped.push({ kind: 'ins', text: ins });
        del = '';
        ins = '';
    };
    for (const seg of out) {
        if (seg.kind === 'same') {
            flush();
            grouped.push(seg);
        } else if (seg.kind === 'del') del += seg.text;
        else ins += seg.text;
    }
    flush();
    return grouped;
}

function merge(list: DiffSegment[], seg: DiffSegment): void {
    const last = list[list.length - 1];
    if (last && last.kind === seg.kind) last.text += seg.text;
    else list.push({ ...seg });
}
