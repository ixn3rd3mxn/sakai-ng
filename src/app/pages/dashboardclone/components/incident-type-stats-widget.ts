import { Component } from '@angular/core';

@Component({
    standalone: true,
    selector: 'app-incident-type-stats',
    imports: [],
    template: `<div class="col-span-6 lg:col-span-4 xl:col-span-2">
            <div class="card mb-0">
                <div class="flex justify-between mb-4">
                    <div>
                        <span class="block text-muted-color font-medium mb-4">ผลรวมทั้งหมด</span>
                        <div class="text-surface-900 dark:text-surface-0 font-medium text-7xl">999</div>
                    </div>
                </div>
                <span class="text-green-500 font-medium">+24</span>
                <span class="text-muted-color"> เทียบกับเมื่อวาน</span>
            </div>
        </div>
        <div class="col-span-6 lg:col-span-4 xl:col-span-2">
            <div class="card mb-0">
                <div class="flex justify-between mb-4">
                    <div>
                        <span class="block text-muted-color font-medium mb-4">แจ้งเหตุ</span>
                        <div class="text-surface-900 dark:text-surface-0 font-medium text-7xl">888</div>
                    </div>
                </div>
                <span class="text-red-500 font-medium">-24</span>
                <span class="text-muted-color"> เทียบกับเมื่อวาน</span>
            </div>
        </div>
        <div class="col-span-6 lg:col-span-4 xl:col-span-2">
            <div class="card mb-0">
                <div class="flex justify-between mb-4">
                    <div>
                        <span class="block text-muted-color font-medium mb-4">แจ้งซ้ำเหตุเดิม</span>
                        <div class="text-surface-900 dark:text-surface-0 font-medium text-7xl">777</div>
                    </div>
                </div>
                <span class="text-gray-500 font-medium">0</span>
                <span class="text-muted-color"> เทียบกับเมื่อวาน</span>
            </div>
        </div>
        <div class="col-span-6 lg:col-span-4 xl:col-span-2">
            <div class="card mb-0">
                <div class="flex justify-between mb-4">
                    <div>
                        <span class="block text-muted-color font-medium mb-4">ปรึกษา</span>
                        <div class="text-surface-900 dark:text-surface-0 font-medium text-7xl">666</div>
                    </div>
                </div>
                <span class="text-gray-500 font-medium">0</span>
                <span class="text-muted-color"> เทียบกับเมื่อวาน</span>
            </div>
        </div>
        <div class="col-span-6 lg:col-span-4 xl:col-span-2">
            <div class="card mb-0">
                <div class="flex justify-between mb-4">
                    <div>
                        <span class="block text-muted-color font-medium mb-4">สายหลุด</span>
                        <div class="text-surface-900 dark:text-surface-0 font-medium text-7xl">555</div>
                    </div>
                </div>
                <span class="text-green-500 font-medium">+24</span>
                <span class="text-muted-color"> เทียบกับเมื่อวาน</span>
            </div>
        </div>
        <div class="col-span-6 lg:col-span-4 xl:col-span-2">
            <div class="card mb-0">
                <div class="flex justify-between mb-4">
                    <div>
                        <span class="block text-muted-color font-medium mb-4">ก่อกวน</span>
                        <div class="text-surface-900 dark:text-surface-0 font-medium text-7xl">444</div>
                    </div>
                </div>
                <span class="text-red-500 font-medium">-24</span>
                <span class="text-muted-color"> เทียบกับเมื่อวาน</span>
            </div>
        </div>`
})
export class IncidentTypeStatsWidget {}
