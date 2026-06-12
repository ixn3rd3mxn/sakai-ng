import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
    standalone: true,
    selector: 'app-stats-widget',
    imports: [CommonModule],
    template: `<div class="col-span-6 lg:col-span-4 xl:col-span-2">
            <div class="card mb-0">
                <div class="flex justify-between mb-4">
                    <div>
                        <span class="block text-muted-color font-medium mb-4">ผลรวมทั้งหมด</span>
                        <div class="text-surface-900 dark:text-surface-0 font-medium text-7xl">999</div>
                    </div>
                    <!-- <div class="flex items-center justify-center bg-blue-100 dark:bg-blue-400/10 rounded-border" style="width: 2.5rem; height: 2.5rem">
                        <i class="pi pi-shopping-cart text-blue-500 text-xl!"></i>
                    </div> -->
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
                    <!-- <div class="flex items-center justify-center bg-orange-100 dark:bg-orange-400/10 rounded-border" style="width: 2.5rem; height: 2.5rem">
                        <i class="pi pi-dollar text-orange-500 text-xl!"></i>
                    </div> -->
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
                    <!-- <div class="flex items-center justify-center bg-cyan-100 dark:bg-cyan-400/10 rounded-border" style="width: 2.5rem; height: 2.5rem">
                        <i class="pi pi-users text-cyan-500 text-xl!"></i>
                    </div> -->
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
                    <!-- <div class="flex items-center justify-center bg-purple-100 dark:bg-purple-400/10 rounded-border" style="width: 2.5rem; height: 2.5rem">
                        <i class="pi pi-comment text-purple-500 text-xl!"></i>
                    </div> -->
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
                    <!-- <div class="flex items-center justify-center bg-purple-100 dark:bg-purple-400/10 rounded-border" style="width: 2.5rem; height: 2.5rem">
                        <i class="pi pi-comment text-purple-500 text-xl!"></i>
                    </div> -->
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
                    <!-- <div class="flex items-center justify-center bg-purple-100 dark:bg-purple-400/10 rounded-border" style="width: 2.5rem; height: 2.5rem">
                        <i class="pi pi-comment text-purple-500 text-xl!"></i>
                    </div> -->
                </div>
                <span class="text-red-500 font-medium">-24</span>
                <span class="text-muted-color"> เทียบกับเมื่อวาน</span>
            </div>
        </div>`
})
export class StatsWidget {}
