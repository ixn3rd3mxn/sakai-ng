import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { RouterModule } from '@angular/router';

interface Destination {
    label: string;
    group: string;
    detail: string;
    icon: string;
    color: string;
    link: string;
    /** Routed but not built - the card says so instead of looking clickable
     *  and then landing on a placeholder without warning. */
    pending?: boolean;
}

// Everything the menu offers, in the order the menu offers it. Duplicating the
// list is deliberate: the sidebar is a control, this is an orientation page,
// and each destination gets a sentence here explaining what it is for - which
// is the thing a menu label cannot do.
const DESTINATIONS: Destination[] = [
    {
        label: 'แดชบอร์ด',
        group: 'Auto EMS CALL Report',
        detail: 'สถิติการรับสายและสถานะเจ้าหน้าที่แบบเรียลไทม์',
        icon: 'pi-objects-column',
        color: 'emerald',
        link: '/report/manual-dashboard'
    },
    {
        label: 'แดชบอร์ด',
        group: 'Manual EMS CALL Report',
        detail: 'สรุปเหตุการณ์ตามผลัดและประเภทการรับแจ้ง',
        icon: 'pi-objects-column',
        color: 'blue',
        link: '/report/dashboard'
    },
    {
        label: 'สรุปผล',
        group: 'Manual EMS CALL Report',
        detail: 'ย้อนดูประวัติการบันทึกเหตุการณ์',
        icon: 'pi-slack',
        color: 'blue',
        link: '/report/summary'
    },
    { label: 'แผนที่', group: 'Map', detail: 'แผนที่การให้บริการ', icon: 'pi-map', color: 'slate', link: '/map/view', pending: true },
    { label: 'สรุปผล', group: 'Map', detail: 'สรุปผลเชิงพื้นที่', icon: 'pi-slack', color: 'slate', link: '/map/summary', pending: true },
    { label: 'จัดการข้อมูล', group: 'Map', detail: 'จัดการข้อมูลพื้นที่และจุดให้บริการ', icon: 'pi-wrench', color: 'slate', link: '/map/manage', pending: true }
];

// Bangkok explicitly, not the viewer's zone. A board opened from anywhere must
// read in the dispatch centre's time - the same rule the rest of this app
// follows for every timestamp it shows.
const BANGKOK = 'Asia/Bangkok';
const THAI_DATE = new Intl.DateTimeFormat('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: BANGKOK });
const THAI_TIME = new Intl.DateTimeFormat('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: BANGKOK });

@Component({
    selector: 'app-home',
    standalone: true,
    imports: [RouterModule],
    template: `
        <div class="grid grid-cols-12 gap-1">
            <!-- Identity first: this runs on a shared screen, and the first
                 thing it should answer is which centre it belongs to. -->
            <div class="col-span-12">
                <div class="card mb-0 flex flex-col sm:flex-row sm:items-center gap-6">
                    <img src="demo/images/place/logo-512.png" alt="" class="w-20 h-20 object-contain shrink-0" />
                    <div class="min-w-0">
                        <div class="text-surface-900 dark:text-surface-0 font-semibold text-2xl">ศูนย์รับแจ้งเหตุและสั่งการการแพทย์ฉุกเฉิน</div>
                        <div class="text-lg text-surface-600 dark:text-surface-300 mt-1">องค์การบริหารส่วนจังหวัดปัตตานี</div>
                        <div class="text-sm text-muted-color mt-3 tabular-nums">{{ today() }} · {{ clock() }}</div>
                    </div>
                </div>
            </div>

            <div class="col-span-12 mt-4">
                <div class="font-semibold text-xl mb-4">เมนูหลัก</div>
            </div>

            @for (destination of destinations; track destination.link) {
                <div class="col-span-12 md:col-span-6 xl:col-span-4">
                    <!-- The whole card is the target, not a link buried inside
                         it - a 40px word is a poor thing to aim at on a shared
                         screen someone is using in a hurry. -->
                    <a
                        [routerLink]="destination.link"
                        class="card mb-0 h-full block no-underline text-inherit transition-all duration-150 hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2"
                    >
                        <div class="flex items-start gap-4">
                            <div class="flex items-center justify-center rounded-border shrink-0" style="width: 2.75rem; height: 2.75rem"
                                 [style.background]="'color-mix(in srgb, var(--p-' + destination.color + '-500) 18%, var(--surface-card))'">
                                <i class="pi {{ destination.icon }} text-xl!" [style.color]="'var(--p-' + destination.color + '-500)'"></i>
                            </div>
                            <div class="min-w-0">
                                <div class="flex items-center gap-2 flex-wrap">
                                    <span class="text-surface-900 dark:text-surface-0 font-medium text-lg">{{ destination.label }}</span>
                                    @if (destination.pending) {
                                        <span class="text-xs px-2 py-0.5 rounded-border bg-surface-200 dark:bg-surface-700 text-muted-color">กำลังทำ</span>
                                    }
                                </div>
                                <div class="text-xs text-muted-color mt-1">{{ destination.group }}</div>
                                <div class="text-sm text-surface-600 dark:text-surface-300 mt-2">{{ destination.detail }}</div>
                            </div>
                        </div>
                    </a>
                </div>
            }
        </div>
    `
})
export class HomeComponent {
    private readonly destroyRef = inject(DestroyRef);

    protected readonly destinations = DESTINATIONS;

    private readonly now = signal(new Date());
    protected readonly today = computed(() => THAI_DATE.format(this.now()));
    protected readonly clock = computed(() => THAI_TIME.format(this.now()));

    constructor() {
        const ticking = setInterval(() => this.now.set(new Date()), 1000);
        this.destroyRef.onDestroy(() => clearInterval(ticking));
    }
}
