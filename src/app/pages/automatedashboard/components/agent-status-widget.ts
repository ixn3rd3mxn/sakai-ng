import { Component, computed, inject } from '@angular/core';
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
const STATUS: Record<AgentStatus, StatusStyle> = {
    on_call: { label: 'กำลังสนทนา', color: 'indigo', dot: 'bg-indigo-400' },
    // A ringing phone is the one state a supervisor may need to act on - it
    // becomes an abandoned call if nobody picks up - so it gets its own
    // colour rather than being folded into "available" or "on a call".
    ringing: { label: 'สายเรียกเข้า', color: 'sky', dot: 'bg-sky-400 animate-pulse' },
    break: { label: 'พักสาย', color: 'amber', dot: 'bg-amber-400' },
    available: { label: 'พร้อมรับสาย', color: 'emerald', dot: 'bg-emerald-400' },
    // Deliberately visible and drab: an unmapped upstream state should look
    // like something to ask about, not like a normal status.
    unknown: { label: 'ไม่ทราบสถานะ', color: 'slate', dot: 'bg-slate-400' }
};

@Component({
    standalone: true,
    selector: 'app-agent-status-widget',
    template: `
        <div class="col-span-12 mt-2">
            <div class="flex flex-wrap items-baseline justify-between gap-2 mb-4">
                <div class="font-semibold text-xl">สถานะเจ้าหน้าที่ปฏิบัติงาน</div>
                <div class="text-sm text-surface-500 dark:text-surface-400">{{ status() }}</div>
            </div>
        </div>

        @if (data.hasRoster() && agents().length === 0) {
            <!-- A readable feed with nobody signed in is a real state and says
                 something worth saying, so it gets a message rather than an
                 empty space that looks like a rendering fault. -->
            <div class="col-span-12">
                <div class="card mb-0 text-surface-500 dark:text-surface-400">ไม่มีเจ้าหน้าที่ลงเวลาปฏิบัติงาน</div>
            </div>
        }

        @for (agent of agents(); track agent.extension) {
            <div class="col-span-6 md:col-span-4 xl:col-span-2">
                <div class="card mb-0 h-full" [style.background]="'color-mix(in srgb, var(--p-' + style(agent).color + '-500) 40%, var(--surface-card))'">
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
                    <div class="text-sm mt-1 opacity-90">{{ agent.role }} · {{ agent.extension }}</div>
                </div>
            </div>
        }
    `
})
export class AgentStatusWidget {
    protected readonly data = inject(AgentsDataService);

    readonly agents = computed(() => (this.data.hasRoster() ? this.data.agents() : []));

    style(agent: Agent): StatusStyle {
        return STATUS[agent.status];
    }

    readonly status = computed(() => {
        if (this.data.loading()) return 'กำลังเชื่อมต่อ...';
        if (!this.data.hasRoster()) return 'ไม่สามารถเชื่อมต่อแหล่งข้อมูลได้';

        const counts = this.data.counts();
        // Counts first because a supervisor glancing at the board wants the
        // capacity picture before they want individual names.
        const parts = [`พร้อมรับสาย ${counts.available ?? 0}`, `กำลังสนทนา ${counts.on_call ?? 0}`, `พักสาย ${counts.break ?? 0}`];
        // Only surfaced when non-zero: these two are exceptional, and a
        // permanent "ไม่ทราบสถานะ 0" would be noise.
        if (counts.ringing) parts.splice(1, 0, `สายเรียกเข้า ${counts.ringing}`);
        if (counts.unknown) parts.push(`ไม่ทราบสถานะ ${counts.unknown}`);
        return parts.join(' · ');
    });
}
