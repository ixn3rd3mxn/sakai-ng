import { Injectable, computed, signal } from '@angular/core';

// The case table's optional columns and which of them this browser shows.
//
// A pair shares a column only when the second value qualifies the first and
// the two are read as one thing - a time and its date, a tambon and its
// amphoe, a number and its caller. Anything scanned, hidden or long on its
// own gets its own column: อาการสำคัญ and หน่วยปฏิบัติ used to share one,
// but they are filled in at different moments and each was cut short to fit.
// No cell has more than two lines; the fixed row height depends on it.
//
// The checkbox, ลำดับ, สถานะ and จัดการ are not listed: bulk actions and the
// status toggle need them, so they are always there.

export type FloodColumnKey =
    | 'time'
    | 'area'
    | 'location'
    | 'reporter'
    | 'complaint'
    | 'unit'
    | 'shift'
    | 'agent'
    | 'patient'
    | 'ddpm'
    | 'assistance'
    | 'remarks';

export interface FloodColumn {
    key: FloodColumnKey;
    label: string;
    // Shown until this browser says otherwise. The defaults are the table
    // as it was, with หน่วยปฏิบัติ split out and พิกัด added: the tambon
    // alone cannot tell two houses apart, and the location is the other
    // half of what the duplicate check matches on.
    visibleByDefault: boolean;
    minWidth: string;
    skeletonWidth: string;
}

// In default table order. Each browser can drag them into its own order in
// the settings list; the table follows that list.
export const FLOOD_COLUMNS: readonly FloodColumn[] = [
    { key: 'time', label: 'เวลา / วันที่', visibleByDefault: true, minWidth: '8rem', skeletonWidth: 'min(5rem, 80%)' },
    { key: 'shift', label: 'เวร', visibleByDefault: false, minWidth: '5rem', skeletonWidth: 'min(2.5rem, 80%)' },
    { key: 'agent', label: 'เจ้าหน้าที่ / ช่องทาง', visibleByDefault: false, minWidth: '10rem', skeletonWidth: 'min(7rem, 80%)' },
    { key: 'reporter', label: 'เบอร์โทร / ผู้แจ้ง', visibleByDefault: true, minWidth: '10rem', skeletonWidth: 'min(7rem, 80%)' },
    { key: 'location', label: 'พิกัด & จุดสังเกต', visibleByDefault: true, minWidth: '12rem', skeletonWidth: 'min(9rem, 90%)' },
    { key: 'area', label: 'ตำบล / อำเภอ', visibleByDefault: true, minWidth: '10rem', skeletonWidth: 'min(7rem, 80%)' },
    { key: 'patient', label: 'อายุ / เพศ', visibleByDefault: false, minWidth: '7rem', skeletonWidth: 'min(4rem, 80%)' },
    { key: 'complaint', label: 'อาการสำคัญ', visibleByDefault: true, minWidth: '16rem', skeletonWidth: 'min(14rem, 90%)' },
    { key: 'ddpm', label: 'ประสานงานทีม ปภ.', visibleByDefault: false, minWidth: '12rem', skeletonWidth: 'min(9rem, 90%)' },
    { key: 'assistance', label: 'การช่วยเหลือ', visibleByDefault: false, minWidth: '14rem', skeletonWidth: 'min(10rem, 90%)' },
    { key: 'unit', label: 'หน่วยปฏิบัติ', visibleByDefault: true, minWidth: '10rem', skeletonWidth: 'min(7rem, 80%)' },
    { key: 'remarks', label: 'เพิ่มเติม', visibleByDefault: false, minWidth: '12rem', skeletonWidth: 'min(9rem, 90%)' }
];

// Versioned so a later change of meaning can start clean instead of
// misreading old choices. The order has its own key, so the visibility
// choices saved before columns could be moved still read as they were.
const STORAGE_KEY = 'flood-intake.columns.v1';
const ORDER_STORAGE_KEY = 'flood-intake.columns.order.v1';

type Choices = Partial<Record<FloodColumnKey, boolean>>;

const DEFAULT_ORDER: readonly FloodColumnKey[] = FLOOD_COLUMNS.map((c) => c.key);
const COLUMN_BY_KEY = new Map(FLOOD_COLUMNS.map((c) => [c.key, c]));

// Every column exactly once. Unknown and repeated keys a stale tab or a hand
// edit left behind are dropped; a column the saved order has never seen goes
// in right after the one it follows by default, not to the far end.
function completeOrder(saved: readonly unknown[]): FloodColumnKey[] {
    const order: FloodColumnKey[] = [];
    for (const key of saved) {
        const known = key as FloodColumnKey;
        if (COLUMN_BY_KEY.has(known) && !order.includes(known)) order.push(known);
    }
    DEFAULT_ORDER.forEach((key, i) => {
        if (order.includes(key)) return;
        order.splice(i === 0 ? 0 : order.indexOf(DEFAULT_ORDER[i - 1]) + 1, 0, key);
    });
    return order;
}

function isDefaultOrder(order: readonly FloodColumnKey[]): boolean {
    return order.every((key, i) => key === DEFAULT_ORDER[i]);
}

@Injectable()
export class FloodColumnsService {
    // Only what this browser changed from the defaults' point of view, kept
    // per column: a column added later has no entry and so shows or hides by
    // its own default, rather than every saved setting going stale.
    private readonly choices = signal<Choices>(this.read());

    private readonly order = signal<FloodColumnKey[]>(this.readOrder());

    // Every optional column, shown or not, in this browser's order: the
    // settings list. The table shows the visible ones in the same order.
    readonly columns = computed(() => this.order().map((key) => COLUMN_BY_KEY.get(key)!));

    readonly visible = computed(() => {
        const choices = this.choices();
        return this.columns().filter((c) => choices[c.key] ?? c.visibleByDefault);
    });

    isVisible(key: FloodColumnKey): boolean {
        const column = FLOOD_COLUMNS.find((c) => c.key === key);
        return this.choices()[key] ?? column?.visibleByDefault ?? false;
    }

    setVisible(key: FloodColumnKey, visible: boolean): void {
        this.save({ ...this.choices(), [key]: visible });
    }

    // Indexes into columns(), as the drag list reports them.
    move(from: number, to: number): void {
        if (from === to) return;
        const order = [...this.order()];
        const [key] = order.splice(from, 1);
        order.splice(to, 0, key);
        this.saveOrder(order);
    }

    // Indexes into visible(), as the table's header drag reports them. The
    // column lands just past the one it was dropped on, and hidden columns
    // keep their places in the settings list.
    moveVisible(from: number, to: number): void {
        const visible = this.visible();
        if (from === to || !visible[from] || !visible[to]) return;
        const key = visible[from].key;
        const order = this.order().filter((k) => k !== key);
        order.splice(order.indexOf(visible[to].key) + (to > from ? 1 : 0), 0, key);
        this.saveOrder(order);
    }

    // Every column on, in the order this browser already has - only the
    // ticks change, unlike reset().
    showAll(): void {
        this.save(Object.fromEntries(FLOOD_COLUMNS.map((c) => [c.key, true])) as Choices);
    }

    reset(): void {
        this.save({});
        this.saveOrder([...DEFAULT_ORDER]);
    }

    private save(choices: Choices): void {
        this.choices.set(choices);
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(choices));
        } catch {
            // Blocked or full storage: the choice still holds for this visit.
        }
    }

    private saveOrder(order: FloodColumnKey[]): void {
        this.order.set(order);
        try {
            // Nothing kept for the default order, so a later change to the
            // default reaches everyone who never moved a column.
            if (isDefaultOrder(order)) localStorage.removeItem(ORDER_STORAGE_KEY);
            else localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(order));
        } catch {
            // Blocked or full storage: the order still holds for this visit.
        }
    }

    private readOrder(): FloodColumnKey[] {
        try {
            const parsed = JSON.parse(localStorage.getItem(ORDER_STORAGE_KEY) ?? '[]') as unknown;
            return completeOrder(Array.isArray(parsed) ? parsed : []);
        } catch {
            // Private mode throws on access; bad JSON throws on parse.
            return [...DEFAULT_ORDER];
        }
    }

    private read(): Choices {
        try {
            const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, unknown>;
            const choices: Choices = {};
            // Only known columns with a real boolean survive; anything else a
            // stale tab or a hand edit left behind costs that one entry.
            for (const column of FLOOD_COLUMNS) {
                if (typeof parsed?.[column.key] === 'boolean') choices[column.key] = parsed[column.key] as boolean;
            }
            return choices;
        } catch {
            // Private mode throws on access; bad JSON throws on parse.
            return {};
        }
    }
}
