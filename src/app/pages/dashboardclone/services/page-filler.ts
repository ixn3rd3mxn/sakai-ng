// Filler rows for the paginated incident tables.
//
// A paginator keeps its place below the table, so a last page (or a new
// day's first page) with fewer rows than `[rows]` pulls the page controls
// up by the missing rows and they jump back down on the next page. The
// tables are fed rows padded to a whole page instead, and render a `-` in
// every cell of a filler. Padding only ever completes the last page, so the
// page count the paginator derives from the row total is unchanged.

export interface PageFillerRow {
    _filler: true;
    // Unique per filler for tables that set a dataKey.
    incident_id: string;
}

export function isPageFiller(row: unknown): row is PageFillerRow {
    return (row as PageFillerRow)?._filler === true;
}

// The fillers that bring `count` rows up to a whole number of pages. Zero
// rows get a full page: a day that has nothing yet is the case the table
// most needs to hold its height for, since the first record is on its way.
export function pageFillers(count: number, pageSize: number): PageFillerRow[] {
    const total = Math.max(pageSize, Math.ceil(count / pageSize) * pageSize);
    return Array.from({ length: total - count }, (_, i) => ({ _filler: true, incident_id: `filler-${count + i}` }));
}

export function padToPage<T>(rows: T[], pageSize: number): (T | PageFillerRow)[] {
    return [...rows, ...pageFillers(rows.length, pageSize)];
}

// Where a page of blank fillers puts its empty state (.table-empty-overlay,
// _utils.scss). Every filler is the same height, so the middle of the page is
// the middle row's centre on an odd page, and on an even one the edge between
// the two middle rows - the top of the lower one.
export function emptyStateAnchor(pageSize: number): { row: number; top: string } {
    return { row: Math.floor(pageSize / 2), top: pageSize % 2 ? '50%' : '0' };
}
