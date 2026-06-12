import { Component, inject, signal } from '@angular/core';
import { RippleModule } from 'primeng/ripple';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { CommonModule } from '@angular/common';
import { Product, ProductService } from '@/app/pages/service/product.service';

@Component({
    standalone: true,
    selector: 'app-recent-sales-widget',
    imports: [CommonModule, TableModule, ButtonModule, RippleModule, TagModule],
    template: `<div class="card" style="margin-bottom: 0.25rem">
        <div class="font-semibold text-xl mb-4">บันทึกล่าสุด</div>
        <p-table [value]="products()" [paginator]="true" [rows]="5" responsiveLayout="scroll">
            <ng-template #header>
                <tr>
                    <th>เวลา</th>
                    <th>ประเภท</th>
                    <th>CBD</th>
                    <th>ระดับ</th>
                </tr>
            </ng-template>
            <ng-template #body let-product>
                <tr>
                    <td>23:59:59</td>
                    <td style="min-width: 7.76rem;">แจ้งซ้ำเหตุเดิม</td>
                    <td>CBD23</td>
                    <td><p-tag severity="warn" value="เหลือง" /></td>
                </tr>
            </ng-template>
        </p-table>
    </div>`,
    providers: [ProductService]
})
export class RecentSalesWidget {
    products = signal<Product[]>([]);

    productService = inject(ProductService);

    ngOnInit() {
        this.productService.getProductsSmall().then((data) => (this.products.set(data)));
    }
}
