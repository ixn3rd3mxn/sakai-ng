import { Component, computed, input } from '@angular/core';
import { SkeletonModule } from 'primeng/skeleton';
import { IncidentTypeStats } from '../dispatch.types';

interface StatCard {
    label: string;
    count: number;
    diff: number;
}

@Component({
    standalone: true,
    selector: 'app-incident-type-stats',
    imports: [SkeletonModule],
    styles: `
        .summary-card {
            background: var(--primary-color);
            color: var(--primary-contrast-color);

            /* This card is filled with --primary-color, where the default
               skeleton - a 6% white wash tuned for neutral surfaces - is
               all but invisible. Tint it with the card's own contrast
               colour instead, which is what its text already uses, so it
               stays legible and follows the theme in both light and dark.
               Custom properties inherit, so setting them here reaches the
               skeletons without needing a descendant selector. */
            --p-skeleton-background: color-mix(in srgb, var(--primary-contrast-color) 22%, transparent);
            --p-skeleton-animation-background: color-mix(in srgb, var(--primary-contrast-color) 40%, transparent);
        }
    `,
    template: `<div class="col-span-6 lg:col-span-4 xl:col-span-2">
            <div class="card summary-card mb-0">
                <div class="flex justify-between mb-4">
                    <div>
                        <span class="block opacity-80 font-medium mb-4">ผลรวมทั้งหมด</span>
                        @if (loading()) {
                            <p-skeleton width="min(7rem, 100%)" height="4.5rem" />
                        } @else {
                            <div class="font-medium text-7xl">{{ totalCount() }}</div>
                        }
                    </div>
                </div>
                @if (loading()) {
                    <p-skeleton width="min(11rem, 100%)" height="1.25rem" />
                } @else {
                    <span [class]="diffClass(totalDiff())">{{ diffText(totalDiff()) }}</span>
                    <span class="opacity-80"> เทียบกับเมื่อวาน</span>
                }
            </div>
        </div>
        @for (card of cards(); track card.label) {
            <div class="col-span-6 lg:col-span-4 xl:col-span-2">
                <div class="card mb-0">
                    <div class="flex justify-between mb-4">
                        <div>
                            <span class="block text-muted-color font-medium mb-4">{{ card.label }}</span>
                            @if (loading()) {
                                <p-skeleton width="min(7rem, 100%)" height="4.5rem" />
                            } @else {
                                <div class="text-surface-900 dark:text-surface-0 font-medium text-7xl">{{ card.count }}</div>
                            }
                        </div>
                    </div>
                    @if (loading()) {
                        <p-skeleton width="min(11rem, 100%)" height="1.25rem" />
                    } @else {
                        <span [class]="diffClass(card.diff)">{{ diffText(card.diff) }}</span>
                        <span class="text-muted-color"> เทียบกับเมื่อวาน</span>
                    }
                </div>
            </div>
        }`
})
export class IncidentTypeStatsWidget {
    stats = input<IncidentTypeStats | null>(null);

    // Without this the cards render `?? 0`, which is indistinguishable
    // from a shift that genuinely had no incidents.
    loading = input<boolean>(false);

    private byName = computed(() => {
        const map = new Map<string, { count: number; diff: number }>();
        for (const item of this.stats()?.items ?? []) {
            map.set(item.call_name, { count: item.count, diff: item.diff });
        }
        return map;
    });

    totalCount = computed(() => this.stats()?.total.count ?? 0);
    totalDiff = computed(() => this.stats()?.total.diff ?? 0);

    cards = computed<StatCard[]>(() => {
        const map = this.byName();
        const pick = (label: string) => map.get(label) ?? { count: 0, diff: 0 };
        return [
            { label: 'แจ้งเหตุ', ...pick('แจ้งเหตุ') },
            { label: 'แจ้งซ้ำเหตุเดิม', ...pick('แจ้งซ้ำเหตุเดิม') },
            { label: 'ปรึกษา', ...pick('ปรึกษา') },
            { label: 'สายหลุด', ...pick('สายหลุด') },
            { label: 'ก่อกวน', ...pick('ก่อกวน') }
        ];
    });

    diffClass(diff: number): string {
        if (diff > 0) return 'text-green-500 font-medium';
        if (diff < 0) return 'text-red-500 font-medium';
        return 'text-gray-500 font-medium';
    }

    diffText(diff: number): string {
        return diff > 0 ? `+${diff}` : `${diff}`;
    }
}
