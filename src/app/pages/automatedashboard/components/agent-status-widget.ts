import { Component, computed, inject } from '@angular/core';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { SkeletonModule } from 'primeng/skeleton';
import { Agent, AgentStatus } from '../agents.types';
import { AgentsDataService } from '../services/agents-data.service';

interface StatusStyle {
    label: string;
    color: string;
    dot: string;
}

// Status is carried by a coloured dot *and* a word, never colour alone. The
// official board uses only a border colour, which cannot say whether someone
// is on a call, on a break or gone - and is invisible to a colour-blind
// supervisor. Amber rather than red for a break: it reduces capacity, but it
// is normal, and red on a dispatch board should mean something is wrong.
//
// Nothing here animates except สายเรียกเข้า, and no dot animates at all.
// Tailwind's animate-pulse fades opacity to .5, so a 10px status indicator
// half-vanished twice a shift-second - the opposite of what an indicator is
// for. The card tint swell (see .pulse-card) is the signal instead: it is
// large enough to catch from across the room and keeps text at full contrast.
const STATUS: Record<AgentStatus, StatusStyle> = {
    // Amber and still. An agent talking to a caller is the system working, and
    // on a busy shift it is the most common state on the board - animating it
    // meant most of the board moved most of the time, which is motion carrying
    // no information. Colour still separates it from "available".
    on_call: { label: 'กำลังสนทนา', color: 'amber', dot: 'bg-amber-400' },
    // The only state with a deadline: it becomes an abandoned call if nobody
    // picks up. It shares amber with "on a call" - the two are the same kind
    // of busy - but it is the only status that moves, so motion on this board
    // means exactly one thing: somebody needs to answer a phone.
    ringing: { label: 'สายเรียกเข้า', color: 'amber', dot: 'bg-amber-400' },
    break: { label: 'พักสาย', color: 'red', dot: 'bg-red-400' },
    available: { label: 'พร้อมรับสาย', color: 'emerald', dot: 'bg-emerald-400' },
    // Deliberately visible and drab: an unmapped upstream state should look
    // like something to ask about, not like a normal status.
    unknown: { label: 'ไม่ทราบสถานะ', color: 'slate', dot: 'bg-slate-400' }
};

@Component({
    standalone: true,
    selector: 'app-agent-status-widget',
    imports: [SkeletonModule, ProgressSpinnerModule],
    styles: `
        /* The placeholder cards are untinted, but the real ones are not, so
           the skeletons are tinted with the text colour for the same reason
           the stat cards do it - and so both rows look alike while loading. */
        .card {
            --p-skeleton-background: color-mix(in srgb, var(--text-color) 12%, transparent);
            --p-skeleton-animation-background: color-mix(in srgb, var(--text-color) 28%, transparent);
        }

        /* Kills .card's margin-bottom: 2rem.
           
           The Tailwind mb-0 on these elements never applied: .card is
           unlayered while utilities live in @layer utilities, and unlayered
           author styles outrank layered ones no matter the source order. So
           every card except the grid's :last-child - which .card:last-child
           exempts - carried a 2rem bottom margin, making every row but the
           final one taller than its contents. Component styles are unlayered
           too and Angular's scoping attribute adds specificity, so this wins
           cleanly without !important. Spacing here comes from the grid gap. */
        .card {
            margin-bottom: 0;
        }

        /* Applied to สายเรียกเข้า alone - see STATUS above.

           Pulses the tint only, not opacity.

           Tailwind's animate-pulse is 50% { opacity: .5 }, which fades the
           whole card - name and extension included - and makes it hard to
           read. This animates just how much of the status colour is mixed
           into the surface, so the text stays at full contrast throughout.

           A CSS animation outranks an inline style in the cascade, so it
           overrides [style.background] rather than fighting it; the colour
           itself arrives as --card-tint so one keyframe serves every status. */
        .pulse-card {
            animation: card-tint-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }

        @keyframes card-tint-pulse {
            0%,
            100% {
                background: color-mix(in srgb, var(--card-tint) 40%, var(--surface-card));
            }
            50% {
                background: color-mix(in srgb, var(--card-tint) 70%, var(--surface-card));
            }
        }

        /* Respect an operator who has asked their OS for less motion - a wall
           display running this all shift is exactly the case that setting is
           for. The card keeps its colour, it simply stops moving. */
        @media (prefers-reduced-motion: reduce) {
            .pulse-card {
                animation: none;
            }
        }
    `,
    template: `
        <!-- mt-8 matches the 2rem rhythm .card uses between blocks, so this
             section reads as separate from the stat cards above rather than
             running on from them. -->
        <div class="flex flex-wrap items-baseline justify-between gap-2 mt-8 mb-4">
            <div class="font-semibold text-xl">สถานะเจ้าหน้าที่ปฏิบัติงาน</div>
            @if (status()) {
                <div class="flex items-center gap-2 text-sm text-surface-500 dark:text-surface-400">
                    @if (data.loading()) {
                        <p-progress-spinner [style]="{ width: '1rem', height: '1rem' }" strokeWidth="8" ariaLabel="กำลังโหลด" />
                    }
                    <span>{{ status() }}</span>
                </div>
            }
        </div>

        <!-- This widget owns its own grid rather than flowing into the page's
             12 columns, so it sits inside whatever column the page gives it -
             the same shape as the panels on /report/dashboard.

             Tuned for the full page width, where it now sits. A normal shift is
             4-6 on duty, so 6 across puts the whole roster on one row at 2xl and
             4 across keeps it to one or two rows at xl. It stops at 6 rather
             than filling the row: past that the cards get too narrow for a long
             Thai name at text-2xl, which would truncate the one field the
             section exists to show.

             These are viewport breakpoints, not container ones, so they assume
             full width. Move this widget back into a half-width column and the
             cards will be half the size these numbers intend. -->
        @if (data.hasRoster() && agents().length === 0) {
            <!-- A readable feed with nobody signed in is a real state and says
                 something worth saying, so it gets a message rather than an
                 empty space that looks like a rendering fault. -->
            <div class="card mb-0 text-surface-500 dark:text-surface-400">ไม่มีเจ้าหน้าที่ลงเวลาปฏิบัติงาน</div>
        }

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6 gap-1">
            @if (data.loading()) {
                <!-- Four, because a normal shift is 4-6 on duty and four fills
                     the row exactly at xl. The section then holds its height
                     while connecting, instead of the whole page jumping down
                     when the roster lands. -->
                @for (placeholder of PLACEHOLDERS; track placeholder) {
                    <div class="card mb-0 h-full">
                        <div class="flex items-center gap-2 mb-3">
                            <p-skeleton shape="circle" size="0.625rem" />
                            <p-skeleton width="5rem" height="0.875rem" />
                        </div>
                        <p-skeleton width="min(8rem, 100%)" height="2rem" />
                        <div class="mt-2">
                            <p-skeleton width="6rem" height="0.875rem" />
                        </div>
                    </div>
                }
            }
                @for (agent of agents(); track agent.extension) {
                    <div
                        class="card mb-0 h-full"
                        [class.pulse-card]="agent.status === 'ringing'"
                        [style.--card-tint]="'var(--p-' + style(agent).color + '-500)'"
                        [style.background]="'color-mix(in srgb, var(--p-' + style(agent).color + '-500) 40%, var(--surface-card))'"
                    >
                        <div class="flex items-center gap-2 mb-3">
                            <span class="inline-block w-2.5 h-2.5 rounded-full" [class]="style(agent).dot"></span>
                            <span class="text-sm font-medium">{{ style(agent).label }}</span>
                            @if (agent.action) {
                                <span class="text-xs opacity-70">({{ agent.action }})</span>
                            }
                        </div>
                        <!-- The name is the answer to "who is on duty", so it leads.
                             When it is missing the extension takes its place rather
                             than leaving a blank line. -->
                        <div class="text-surface-900 dark:text-surface-0 font-medium text-2xl truncate" [title]="agent.name ?? agent.extension">
                            {{ agent.name ?? agent.extension }}
                        </div>
                        <div class="text-sm mt-1 opacity-90">{{ agent.role }}</div>
                </div>
            }
        </div>
    `
})
export class AgentStatusWidget {
    protected readonly data = inject(AgentsDataService);

    /** Placeholder cards shown while connecting - the value is never read, only
     *  the count matters. */
    protected readonly PLACEHOLDERS = [0, 1, 2, 3];

    readonly agents = computed(() => (this.data.hasRoster() ? this.data.agents() : []));

    style(agent: Agent): StatusStyle {
        return STATUS[agent.status];
    }

    // Empty while everything is healthy - the cards already say who is on
    // duty and in what state, so a per-status tally alongside them was
    // duplication. Kept for the three cases the cards cannot express: nothing
    // has arrived yet, the feed could not be read at all, and the rows being
    // shown are held over from before a failure.
    readonly status = computed(() => {
        if (this.data.loading()) return 'กำลังเชื่อมต่อ...';
        if (!this.data.hasRoster()) return 'ไม่สามารถเชื่อมต่อแหล่งข้อมูลได้';
        // Holding the last good roster over is right - an empty board answers
        // nothing - but it must not be passed off as current, so the age is
        // stated the way the stat cards state theirs.
        if (this.data.isStale()) return `ล่าสุด ${this.fetchedTime()} กำลังลองใหม่`;
        return '';
    });

    // `fetched_at` is a naive Bangkok wall-clock string from the backend, so
    // the HH:MM is sliced straight out of it. Parsing it into a Date would
    // re-interpret it in the viewer's timezone and shift the time shown.
    private fetchedTime(): string {
        return this.data.summary()?.fetched_at?.slice(11, 16) ?? '';
    }
}
