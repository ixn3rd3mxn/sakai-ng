# Angular Table Component

Table displays data in tabular format.

## Accessibility

Screen Reader Default role of the table is table . Header, body and footer elements use rowgroup , rows use row role, header cells have columnheader and body cells use cell roles. Sortable headers utilizer aria-sort attribute either set to "ascending" or "descending". Table rows and table cells should be specified by users using the aria-posinset , aria-setsize , aria-label , and aria-describedby attributes, as they are determined through templating. Built-in checkbox and radiobutton components for row selection use checkbox and radiobutton . The label to describe them is retrieved from the aria.selectRow and aria.unselectRow properties of the locale API. Similarly header checkbox uses selectAll and unselectAll keys. When a row is selected, aria-selected is set to true on a row. The element to expand or collapse a row is a button with aria-expanded and aria-controls properties. Value to describe the buttons is derived from aria.expandRow and aria.collapseRow properties of the locale API. The filter menu button use aria.showFilterMenu and aria.hideFilterMenu properties as aria-label in addition to the aria-haspopup , aria-expanded and aria-controls to define the relation between the button and the overlay. Popop menu has dialog role with aria-modal as focus is kept within the overlay. The operator dropdown use aria.filterOperator and filter constraints dropdown use aria.filterConstraint properties. Buttons to add rules on the other hand utilize aria.addRule and aria.removeRule properties. The footer buttons similarly use aria.clear and aria.apply properties. filterInputProps of the Column component can be used to define aria labels for the built-in filter components, if a custom component is used with templating you also may define your own aria labels as well. Editable cells use custom templating so you need to manage aria roles and attributes manually if required. The row editor controls are button elements with aria.editRow , aria.cancelEdit and aria.saveEdit used for the aria-label . Paginator is a standalone component used inside the Table, refer to the paginator for more information about the accessibility features. Keyboard Support Any button element inside the Table used for cases like filter, row expansion, edit are tabbable and can be used with space and enter keys. Sortable Headers Keyboard Support Key Function tab Moves through the headers. enter Sorts the column. space Sorts the column. Filter Menu Keyboard Support Key Function tab Moves through the elements inside the popup. escape Hides the popup. enter Opens the popup. Selection Keyboard Support Key Function tab Moves focus to the first selected row, if there is none then first row receives the focus. up arrow Moves focus to the previous row. down arrow Moves focus to the next row. enter Toggles the selected state of the focused row depending on the metaKeySelection setting. space Toggles the selected state of the focused row depending on the metaKeySelection setting. home Moves focus to the first row. end Moves focus to the last row. shift + down arrow Moves focus to the next row and toggles the selection state. shift + up arrow Moves focus to the previous row and toggles the selection state. shift + space Selects the rows between the most recently selected row and the focused row. control + shift + home Selects the focused rows and all the options up to the first one. control + shift + end Selects the focused rows and all the options down to the last one. control + a Selects all rows.

## Advanced

Sorting, per-column and global filtering, and cell editing composed in a single table.

```typescript
import { Component, OnInit, inject, viewChild, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputNumberModule } from 'primeng/inputnumber';
import { Table, TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { InputTextModule } from 'primeng/inputtext';
import { ProductService } from '@/service/productservice';
import { SortEvent } from 'primeng/api';
import { Product } from '@/domain/product';
import { Search } from '@primeicons/angular/search';
import { Database } from '@primeicons/angular/database';

@Component({
    template: `
        <div>
            <div class="mb-3 flex justify-end">
                <p-iconfield>
                    <p-inputicon>
                        <svg data-p-icon="search" />
                    </p-inputicon>
                    <input pInputText pSize="small" type="text" (input)="dt.filterGlobal($event.target.value, 'contains')" placeholder="Keyword search" />
                </p-iconfield>
            </div>
            <p-table #dt [value]="products" dataKey="id" (sortFunction)="customSort($event)" [customSort]="true" [globalFilterFields]="['name', 'category', 'code']" [tableStyle]="{ 'min-width': '60rem' }">
                <ng-template #header>
                    <tr>
                        <th pSortableColumn="name" style="min-width: 14rem">
                            <div class="flex items-center gap-2">
                                Name
                                <p-sort-icon field="name" />
                            </div>
                        </th>
                        <th pSortableColumn="category" style="min-width: 12rem">
                            <div class="flex items-center gap-2">
                                Category
                                <p-sort-icon field="category" />
                            </div>
                        </th>
                        <th pSortableColumn="price" style="min-width: 10rem">
                            <div class="flex items-center gap-2">
                                Price
                                <p-sort-icon field="price" />
                            </div>
                        </th>
                        <th pSortableColumn="quantity" style="min-width: 8rem">
                            <div class="flex items-center gap-2">
                                Qty
                                <p-sort-icon field="quantity" />
                            </div>
                        </th>
                        <th pSortableColumn="inventoryStatus" style="min-width: 10rem">
                            <div class="flex items-center gap-2">
                                Status
                                <p-sort-icon field="inventoryStatus" />
                            </div>
                        </th>
                    </tr>
                    <tr>
                        <th>
                            <p-column-filter type="text" field="name" [showMenu]="false" filterOn="input">
                                <ng-template #filter let-value let-filter="filterCallback">
                                    <input pInputText pSize="small" type="text" [value]="value || ''" (input)="filter($event.target.value)" placeholder="Search" class="w-full" />
                                </ng-template>
                            </p-column-filter>
                        </th>
                        <th>
                            <p-column-filter type="text" field="category" [showMenu]="false" filterOn="input">
                                <ng-template #filter let-value let-filter="filterCallback">
                                    <input pInputText pSize="small" type="text" [value]="value || ''" (input)="filter($event.target.value)" placeholder="Search" class="w-full" />
                                </ng-template>
                            </p-column-filter>
                        </th>
                        <th></th>
                        <th></th>
                        <th></th>
                    </tr>
                </ng-template>
                <ng-template #body let-product>
                    <tr>
                        <td [pEditableColumn]="product.name" pEditableColumnField="name">
                            <p-cell-editor>
                                <ng-template #input>
                                    <input pInputText type="text" [(ngModel)]="product.name" fluid pSize="small" />
                                </ng-template>
                                <ng-template #output>
                                    <span class="font-medium">{{ product.name }}</span>
                                </ng-template>
                            </p-cell-editor>
                        </td>
                        <td [pEditableColumn]="product.category" pEditableColumnField="category">
                            <p-cell-editor>
                                <ng-template #input>
                                    <input pInputText type="text" [(ngModel)]="product.category" fluid pSize="small" />
                                </ng-template>
                                <ng-template #output>
                                    <p-tag [value]="product.category" severity="secondary" />
                                </ng-template>
                            </p-cell-editor>
                        </td>
                        <td [pEditableColumn]="product.price" pEditableColumnField="price">
                            <p-cell-editor>
                                <ng-template #input>
                                    <p-inputnumber [(ngModel)]="product.price" mode="currency" currency="USD" locale="en-US" fluid size="small" />
                                </ng-template>
                                <ng-template #output>
                                    <span class="font-semibold">{{ '$' + product.price }}</span>
                                </ng-template>
                            </p-cell-editor>
                        </td>
                        <td>{{ product.quantity }}</td>
                        <td>
                            <p-tag [value]="getSeverityLabel(product.inventoryStatus)" [severity]="getSeverity(product.inventoryStatus)" />
                        </td>
                    </tr>
                </ng-template>
                <ng-template #emptymessage>
                    <tr>
                        <td colspan="5">
                            <div class="flex flex-col items-center justify-center gap-3 py-16 text-center">
                                <div class="w-14 h-14 rounded-full bg-surface-100 dark:bg-surface-800 flex items-center justify-center">
                                    <svg data-p-icon="database" class="text-xl text-surface-400 dark:text-surface-500" />
                                </div>
                                <div>
                                    <p class="m-0 font-semibold text-surface-900 dark:text-surface-0">No products found</p>
                                    <p class="mt-1 text-sm text-surface-500 dark:text-surface-400">Try adjusting your search or filters.</p>
                                </div>
                            </div>
                        </td>
                    </tr>
                </ng-template>
            </p-table>
        </div>
    `,
    standalone: true,
    imports: [IconFieldModule, InputIconModule, InputNumberModule, TableModule, TagModule, InputTextModule, FormsModule, Search, Database],
    providers: [ProductService],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TableAdvancedDemo implements OnInit {
    private productService = inject(ProductService);

    private cd = inject(ChangeDetectorRef);

    dt = viewChild<Table>('dt');

    products!: Product[];

    initialValue!: Product[];

    sortedField: string | null = null;

    isSorted: boolean | null = null;

    ngOnInit() {
        this.productService.getProductsSmall().then((data) => {
            this.products = data.slice(0, 10);
            this.initialValue = [...this.products];
        });
    }

    customSort(event: SortEvent) {
        if (this.sortedField !== event.field) {
            this.sortedField = event.field ?? null;
            this.isSorted = true;
            this.sortTableData(event);
        } else if (this.isSorted) {
            this.isSorted = false;
            this.sortTableData(event);
        } else {
            // Third consecutive click removes the sort and restores the original
            // order without touching the active filters.
            this.sortedField = null;
            this.isSorted = null;
            this.products = [...this.initialValue];

            const table = this.dt()!;

            table.sortField = null;
            table.sortOrder = table.defaultSortOrder();
            table.tableService.onSort(null);
        }
    }

    sortTableData(event: SortEvent) {
        event.data!.sort((data1: any, data2: any) => {
            let value1 = data1[event.field!];
            let value2 = data2[event.field!];
            let result: number;

            if (value1 == null && value2 != null) result = -1;
            else if (value1 != null && value2 == null) result = 1;
            else if (value1 == null && value2 == null) result = 0;
            else if (typeof value1 === 'string' && typeof value2 === 'string') result = value1.localeCompare(value2);
            else result = value1 < value2 ? -1 : value1 > value2 ? 1 : 0;

            return event.order! * result;
        });
    }

    getSeverity(status: string) {
        switch (status) {
            case 'INSTOCK':
                return 'success';
            case 'LOWSTOCK':
                return 'warn';
            case 'OUTOFSTOCK':
                return 'danger';
            default:
                return 'secondary';
        }
    }

    getSeverityLabel(status: string) {
        switch (status) {
            case 'INSTOCK':
                return 'In Stock';
            case 'LOWSTOCK':
                return 'Low Stock';
            case 'OUTOFSTOCK':
                return 'Out of Stock';
            default:
                return status;
        }
    }
}
```

## Basic

DataTable requires a collection to display along with column components for the representation of the data.

```typescript
import { Component, OnInit, inject, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { TableModule } from 'primeng/table';
import { ProductService } from '@/service/productservice';
import { Product } from '@/domain/product';

@Component({
    template: `
        <p-table [value]="products" [tableStyle]="{ 'min-width': '50rem' }">
            <ng-template #header>
                <tr>
                    <th>Code</th>
                    <th>Name</th>
                    <th>Category</th>
                    <th>Quantity</th>
                </tr>
            </ng-template>
            <ng-template #body let-product>
                <tr>
                    <td>{{ product.code }}</td>
                    <td>{{ product.name }}</td>
                    <td>{{ product.category }}</td>
                    <td>{{ product.quantity }}</td>
                </tr>
            </ng-template>
        </p-table>
    `,
    standalone: true,
    imports: [TableModule],
    providers: [ProductService],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TableBasicDemo implements OnInit {
    private productService = inject(ProductService);

    private cd = inject(ChangeDetectorRef);

    products!: Product[];

    ngOnInit() {
        this.productService.getProductsMini().then((data) => {
            this.products = data.slice(0, 5);
        });
    }
}
```

## celledit-doc

Inline cell editing with pEditableColumn directive and p-cell-editor component that provides input and output templates for edit and view modes.

```typescript
import { Component, OnInit, inject, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SelectModule } from 'primeng/select';
import { InputNumberModule } from 'primeng/inputnumber';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { InputTextModule } from 'primeng/inputtext';
import { ProductService } from '@/service/productservice';
import { Product } from '@/domain/product';

@Component({
    template: `
        <p-table [value]="products" dataKey="id" [tableStyle]="{ 'min-width': '50rem' }">
            <ng-template #header>
                <tr>
                    <th style="width: 4rem">Image</th>
                    <th style="width: 30%">Name</th>
                    <th style="width: 20%">Category</th>
                    <th style="width: 10%">Qty</th>
                    <th style="width: 15%">Price</th>
                    <th style="width: 20%">Status</th>
                </tr>
            </ng-template>
            <ng-template #body let-product>
                <tr>
                    <td>
                        <img [src]="'https://primefaces.org/cdn/primeng/images/demo/product/' + product.image" [alt]="product.name" width="40" height="40" class="rounded-md shadow" />
                    </td>
                    <td [pEditableColumn]="product.name" pEditableColumnField="name">
                        <p-cell-editor>
                            <ng-template #input>
                                <input pInputText type="text" [(ngModel)]="product.name" fluid pSize="small" />
                            </ng-template>
                            <ng-template #output>
                                <span class="font-medium">{{ product.name }}</span>
                            </ng-template>
                        </p-cell-editor>
                    </td>
                    <td [pEditableColumn]="product.category" pEditableColumnField="category">
                        <p-cell-editor>
                            <ng-template #input>
                                <input pInputText type="text" [(ngModel)]="product.category" fluid pSize="small" />
                            </ng-template>
                            <ng-template #output>
                                <p-tag [value]="product.category" severity="secondary" />
                            </ng-template>
                        </p-cell-editor>
                    </td>
                    <td [pEditableColumn]="product.quantity" pEditableColumnField="quantity">
                        <p-cell-editor>
                            <ng-template #input>
                                <p-inputnumber [(ngModel)]="product.quantity" fluid size="small" />
                            </ng-template>
                            <ng-template #output>
                                {{ product.quantity }}
                            </ng-template>
                        </p-cell-editor>
                    </td>
                    <td [pEditableColumn]="product.price" pEditableColumnField="price">
                        <p-cell-editor>
                            <ng-template #input>
                                <p-inputnumber [(ngModel)]="product.price" mode="currency" currency="USD" fluid size="small" />
                            </ng-template>
                            <ng-template #output>
                                <span class="font-semibold">{{ '$' + product.price }}</span>
                            </ng-template>
                        </p-cell-editor>
                    </td>
                    <td [pEditableColumn]="product.inventoryStatus" pEditableColumnField="inventoryStatus">
                        <p-cell-editor>
                            <ng-template #input>
                                <p-select [options]="statuses" [(ngModel)]="product.inventoryStatus" appendTo="body" optionLabel="label" optionValue="value" size="small" fluid />
                            </ng-template>
                            <ng-template #output>
                                <p-tag [value]="getSeverityLabel(product.inventoryStatus)" [severity]="getSeverity(product.inventoryStatus)" />
                            </ng-template>
                        </p-cell-editor>
                    </td>
                </tr>
            </ng-template>
        </p-table>
    `,
    standalone: true,
    imports: [SelectModule, InputNumberModule, TableModule, TagModule, InputTextModule, FormsModule],
    providers: [ProductService],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TableCellEditDemo implements OnInit {
    private productService = inject(ProductService);

    private cd = inject(ChangeDetectorRef);

    products!: Product[];

    statuses = [
        { label: 'In Stock', value: 'INSTOCK' },
        { label: 'Low Stock', value: 'LOWSTOCK' },
        { label: 'Out of Stock', value: 'OUTOFSTOCK' }
    ];

    ngOnInit() {
        this.productService.getProductsSmall().then((data) => {
            this.products = data.slice(0, 6);
        });
    }

    getSeverity(status: string) {
        switch (status) {
            case 'INSTOCK':
                return 'success';
            case 'LOWSTOCK':
                return 'warn';
            case 'OUTOFSTOCK':
                return 'danger';
        }
    }

    getSeverityLabel(status: string) {
        switch (status) {
            case 'INSTOCK':
                return 'In Stock';
            case 'LOWSTOCK':
                return 'Low Stock';
            case 'OUTOFSTOCK':
                return 'Out of Stock';
            default:
                return status;
        }
    }
}
```

## celleditselection-doc

Cell editing composes with row selection. Clicks inside an editable cell start editing, while the checkbox column drives selection independently.

```typescript
import { Component, OnInit, inject, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BadgeModule } from 'primeng/badge';
import { SelectModule } from 'primeng/select';
import { InputNumberModule } from 'primeng/inputnumber';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { InputTextModule } from 'primeng/inputtext';
import { ProductService } from '@/service/productservice';
import { Product } from '@/domain/product';

@Component({
    template: `
        <div>
            <div class="flex items-center gap-2 mb-3">
                <span class="text-sm font-medium">Selected</span>
                <p-badge [value]="selectedProducts?.length || 0" [severity]="selectedProducts?.length ? 'info' : 'secondary'" />
            </div>
            <p-table [value]="products" [(selection)]="selectedProducts" dataKey="id" [tableStyle]="{ 'min-width': '50rem' }">
                <ng-template #header>
                    <tr>
                        <th style="width: 3rem">
                            <p-table-header-checkbox />
                        </th>
                        <th style="width: 4rem">Image</th>
                        <th style="width: 30%">Name</th>
                        <th style="width: 20%">Category</th>
                        <th style="width: 10%">Qty</th>
                        <th style="width: 15%">Price</th>
                        <th style="width: 20%">Status</th>
                    </tr>
                </ng-template>
                <ng-template #body let-product>
                    <tr>
                        <td>
                            <p-table-checkbox [value]="product" />
                        </td>
                        <td>
                            <img [src]="'https://primefaces.org/cdn/primeng/images/demo/product/' + product.image" [alt]="product.name" width="40" height="40" class="rounded-md shadow" />
                        </td>
                        <td [pEditableColumn]="product.name" pEditableColumnField="name">
                            <p-cell-editor>
                                <ng-template #input>
                                    <input pInputText type="text" [(ngModel)]="product.name" fluid pSize="small" />
                                </ng-template>
                                <ng-template #output>
                                    <span class="font-medium">{{ product.name }}</span>
                                </ng-template>
                            </p-cell-editor>
                        </td>
                        <td [pEditableColumn]="product.category" pEditableColumnField="category">
                            <p-cell-editor>
                                <ng-template #input>
                                    <input pInputText type="text" [(ngModel)]="product.category" fluid pSize="small" />
                                </ng-template>
                                <ng-template #output>
                                    <p-tag [value]="product.category" severity="secondary" />
                                </ng-template>
                            </p-cell-editor>
                        </td>
                        <td [pEditableColumn]="product.quantity" pEditableColumnField="quantity">
                            <p-cell-editor>
                                <ng-template #input>
                                    <p-inputnumber [(ngModel)]="product.quantity" fluid size="small" />
                                </ng-template>
                                <ng-template #output>
                                    {{ product.quantity }}
                                </ng-template>
                            </p-cell-editor>
                        </td>
                        <td [pEditableColumn]="product.price" pEditableColumnField="price">
                            <p-cell-editor>
                                <ng-template #input>
                                    <p-inputnumber [(ngModel)]="product.price" mode="currency" currency="USD" locale="en-US" fluid size="small" />
                                </ng-template>
                                <ng-template #output>
                                    <span class="font-semibold">{{ '$' + product.price }}</span>
                                </ng-template>
                            </p-cell-editor>
                        </td>
                        <td [pEditableColumn]="product.inventoryStatus" pEditableColumnField="inventoryStatus">
                            <p-cell-editor>
                                <ng-template #input>
                                    <p-select [options]="statuses" [(ngModel)]="product.inventoryStatus" appendTo="body" optionLabel="label" optionValue="value" size="small" fluid />
                                </ng-template>
                                <ng-template #output>
                                    <p-tag [value]="getSeverityLabel(product.inventoryStatus)" [severity]="getSeverity(product.inventoryStatus)" />
                                </ng-template>
                            </p-cell-editor>
                        </td>
                    </tr>
                </ng-template>
            </p-table>
        </div>
    `,
    standalone: true,
    imports: [BadgeModule, SelectModule, InputNumberModule, TableModule, TagModule, InputTextModule, FormsModule],
    providers: [ProductService],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TableCellEditSelectionDemo implements OnInit {
    private productService = inject(ProductService);

    private cd = inject(ChangeDetectorRef);

    products!: Product[];

    selectedProducts: Product[] | null = null;

    statuses = [
        { label: 'In Stock', value: 'INSTOCK' },
        { label: 'Low Stock', value: 'LOWSTOCK' },
        { label: 'Out of Stock', value: 'OUTOFSTOCK' }
    ];

    ngOnInit() {
        this.productService.getProductsSmall().then((data) => {
            this.products = data.slice(0, 6);
        });
    }

    getSeverity(status: string) {
        switch (status) {
            case 'INSTOCK':
                return 'success';
            case 'LOWSTOCK':
                return 'warn';
            case 'OUTOFSTOCK':
                return 'danger';
            default:
                return 'secondary';
        }
    }

    getSeverityLabel(status: string) {
        switch (status) {
            case 'INSTOCK':
                return 'In Stock';
            case 'LOWSTOCK':
                return 'Low Stock';
            case 'OUTOFSTOCK':
                return 'Out of Stock';
            default:
                return status;
        }
    }
}
```

## checkboxselection-doc

Checkbox-based multiple selection with a header select-all checkbox. Use p-table-header-checkbox for the header and p-table-checkbox for each row.

```typescript
import { Component, OnInit, inject, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { AvatarModule } from 'primeng/avatar';
import { BadgeModule } from 'primeng/badge';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ButtonModule } from 'primeng/button';
import { CustomerService } from '@/service/customerservice';
import { Customer, Representative, Country } from '@/domain/customer';
import { Envelope } from '@primeicons/angular/envelope';

@Component({
    template: `
        <div class="flex flex-wrap items-center justify-between gap-3 mb-3 p-3 rounded-md border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900">
            <div class="flex flex-wrap items-center gap-2">
                <span class="font-medium text-sm">Selected customers</span>
                <p-badge [value]="selectedCustomers.length.toString()" [severity]="selectedCustomers.length ? 'info' : 'secondary'" />
            </div>
            <button pButton size="small" [disabled]="!selectedCustomers.length">
                <svg data-p-icon="envelope" />
                Email selected
            </button>
        </div>
        <p-table [value]="customers" [(selection)]="selectedCustomers" dataKey="id" [tableStyle]="{ 'min-width': '50rem' }">
            <ng-template #header>
                <tr>
                    <th style="width: 3rem">
                        <p-table-header-checkbox />
                    </th>
                    <th>Name</th>
                    <th>Country</th>
                    <th>Representative</th>
                    <th>Status</th>
                    <th>Balance</th>
                </tr>
            </ng-template>
            <ng-template #body let-customer>
                <tr>
                    <td>
                        <p-table-checkbox [value]="customer" />
                    </td>
                    <td>
                        <span class="font-medium">{{ customer.name }}</span>
                    </td>
                    <td>
                        <div class="flex items-center gap-2">
                            <img src="https://primefaces.org/cdn/primeng/images/demo/flag/flag_placeholder.png" [class]="'flag flag-' + customer.country.code" style="width: 20px" />
                            <span>{{ customer.country.name }}</span>
                        </div>
                    </td>
                    <td>
                        <div class="flex items-center gap-2">
                            <p-avatar [image]="'https://primefaces.org/cdn/primevue/images/avatar/' + customer.representative.image" shape="circle" />
                            <span class="text-sm">{{ customer.representative.name }}</span>
                        </div>
                    </td>
                    <td>
                        <p-tag [value]="customer.status" [severity]="getSeverity(customer.status)" />
                    </td>
                    <td>
                        <span class="font-semibold">{{ '$' + customer.balance.toLocaleString() }}</span>
                    </td>
                </tr>
            </ng-template>
        </p-table>
    `,
    standalone: true,
    imports: [AvatarModule, BadgeModule, TableModule, TagModule, ButtonModule, Envelope],
    providers: [CustomerService],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TableCheckboxSelectionDemo implements OnInit {
    private customerService = inject(CustomerService);

    private cd = inject(ChangeDetectorRef);

    customers!: Customer[];

    selectedCustomers: Customer[] = [];

    ngOnInit() {
        this.customerService.getCustomersSmall().then((data) => {
            this.customers = data.slice(0, 8);
        });
    }

    getSeverity(status: string) {
        switch (status) {
            case 'qualified':
                return 'success';
            case 'unqualified':
                return 'danger';
            case 'negotiation':
                return 'warn';
            case 'new':
                return 'info';
            case 'renewal':
                return 'secondary';
            case 'proposal':
                return 'info';
            default:
                return 'secondary';
        }
    }
}
```

## columngroup-doc

Multi-level headers with rowspan and colspan.

```typescript
import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { Product } from '@/domain/product';
import { ArrowUp } from '@primeicons/angular/arrow-up';
import { ArrowDown } from '@primeicons/angular/arrow-down';

@Component({
    template: `
        <p-table [value]="sales" [tableStyle]="{ 'min-width': '50rem' }" [showGridlines]="true">
            <ng-template #header>
                <tr>
                    <th rowspan="2">Product</th>
                    <th colspan="2">Sale Rate</th>
                    <th colspan="2">Profits</th>
                </tr>
                <tr>
                    <th>Last Year</th>
                    <th>This Year</th>
                    <th>Last Year</th>
                    <th>This Year</th>
                </tr>
            </ng-template>
            <ng-template #body let-sale>
                <tr>
                    <td>
                        <span class="font-medium">{{ sale.product }}</span>
                    </td>
                    <td>{{ sale.lastYearSale }}%</td>
                    <td>
                        <div class="inline-flex items-center gap-1">
                            <span>{{ sale.thisYearSale }}%</span>
                            @if (sale.thisYearSale >= sale.lastYearSale) {
                                <svg data-p-icon="arrow-up" [size]="12" class="text-green-500" />
                            } @else {
                                <svg data-p-icon="arrow-down" [size]="12" class="text-red-500" />
                            }
                        </div>
                    </td>
                    <td>{{ formatCurrency(sale.lastYearProfit) }}</td>
                    <td>
                        <p-tag [value]="formatCurrency(sale.thisYearProfit)" [severity]="sale.thisYearProfit >= sale.lastYearProfit ? 'success' : 'danger'" />
                    </td>
                </tr>
            </ng-template>
            <ng-template #footer>
                <tr>
                    <td colspan="3" style="text-align: right"><span class="font-semibold">Totals</span></td>
                    <td>
                        <span class="font-semibold">{{ formatCurrency(lastYearTotal) }}</span>
                    </td>
                    <td>
                        <span class="font-semibold">{{ formatCurrency(thisYearTotal) }}</span>
                    </td>
                </tr>
            </ng-template>
        </p-table>
    `,
    standalone: true,
    imports: [TableModule, TagModule, ArrowUp, ArrowDown],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TableColumnGroupDemo implements OnInit {
    sales!: any[];

    lastYearTotal!: number;

    thisYearTotal!: number;

    ngOnInit() {
        this.sales = [
            { product: 'Bamboo Watch', lastYearSale: 51, thisYearSale: 40, lastYearProfit: 54406, thisYearProfit: 43342 },
            { product: 'Black Watch', lastYearSale: 83, thisYearSale: 9, lastYearProfit: 423132, thisYearProfit: 312122 },
            { product: 'Blue Band', lastYearSale: 38, thisYearSale: 5, lastYearProfit: 12321, thisYearProfit: 8500 },
            { product: 'Blue T-Shirt', lastYearSale: 49, thisYearSale: 22, lastYearProfit: 745232, thisYearProfit: 650323 },
            { product: 'Bracelet', lastYearSale: 17, thisYearSale: 79, lastYearProfit: 643242, thisYearProfit: 500332 }
        ];
        this.lastYearTotal = this.sales.reduce((total, sale) => total + sale.lastYearProfit, 0);
        this.thisYearTotal = this.sales.reduce((total, sale) => total + sale.thisYearProfit, 0);
    }

    formatCurrency(value: number): string {
        return value != null ? '$' + value.toLocaleString() : '';
    }
}
```

## columngroupfiltersort-doc

Sort and filter work on any leaf header cell in a grouped layout. Add pSortableColumn with a field to the leaf header columns and a filter row below them with the p-column-filter templates.

```typescript
import { Component, viewChild, ChangeDetectionStrategy } from '@angular/core';
import { Table, TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { InputTextModule } from 'primeng/inputtext';
import { SortEvent } from 'primeng/api';
import { Product } from '@/domain/product';
import { ArrowUp } from '@primeicons/angular/arrow-up';
import { ArrowDown } from '@primeicons/angular/arrow-down';

@Component({
    template: `
        <p-table #dt [value]="sales" (sortFunction)="customSort($event)" [customSort]="true" [showGridlines]="true" [tableStyle]="{ 'min-width': '50rem' }">
            <ng-template #header>
                <tr>
                    <th pSortableColumn="product" rowspan="2">
                        <div class="flex items-center gap-2">
                            Product
                            <p-sort-icon field="product" />
                        </div>
                    </th>
                    <th colspan="2">Sale Rate</th>
                    <th colspan="2">Profits</th>
                </tr>
                <tr>
                    <th pSortableColumn="lastYearSale">
                        <div class="flex items-center gap-2">
                            Last Year
                            <p-sort-icon field="lastYearSale" />
                        </div>
                    </th>
                    <th pSortableColumn="thisYearSale">
                        <div class="flex items-center gap-2">
                            This Year
                            <p-sort-icon field="thisYearSale" />
                        </div>
                    </th>
                    <th pSortableColumn="lastYearProfit">
                        <div class="flex items-center gap-2">
                            Last Year
                            <p-sort-icon field="lastYearProfit" />
                        </div>
                    </th>
                    <th pSortableColumn="thisYearProfit">
                        <div class="flex items-center gap-2">
                            This Year
                            <p-sort-icon field="thisYearProfit" />
                        </div>
                    </th>
                </tr>
                <tr>
                    <th>
                        <p-column-filter type="text" field="product" filterOn="input">
                            <ng-template #filter let-value let-filter="filterCallback">
                                <input pInputText pSize="small" type="text" [value]="value || ''" (input)="filter($event.target.value)" placeholder="Search" class="w-full" />
                            </ng-template>
                        </p-column-filter>
                    </th>
                    <th></th>
                    <th>
                        <p-column-filter type="numeric" field="thisYearSale" matchMode="gte">
                            <ng-template #filter let-value let-filter="filterCallback">
                                <input pInputText pSize="small" type="number" [value]="value ?? ''" (input)="filter($event.target.value === '' ? null : +$event.target.value)" placeholder="&ge;" class="w-full" />
                            </ng-template>
                        </p-column-filter>
                    </th>
                    <th></th>
                    <th></th>
                </tr>
            </ng-template>
            <ng-template #body let-sale>
                <tr>
                    <td>
                        <span class="font-medium">{{ sale.product }}</span>
                    </td>
                    <td>{{ sale.lastYearSale }}%</td>
                    <td>
                        <div class="inline-flex items-center gap-1">
                            <span>{{ sale.thisYearSale }}%</span>
                            @if (sale.thisYearSale >= sale.lastYearSale) {
                                <svg data-p-icon="arrow-up" [size]="12" class="text-green-500" />
                            } @else {
                                <svg data-p-icon="arrow-down" [size]="12" class="text-red-500" />
                            }
                        </div>
                    </td>
                    <td>{{ formatCurrency(sale.lastYearProfit) }}</td>
                    <td>
                        <p-tag [value]="formatCurrency(sale.thisYearProfit)" [severity]="sale.thisYearProfit >= sale.lastYearProfit ? 'success' : 'danger'" />
                    </td>
                </tr>
            </ng-template>
        </p-table>
    `,
    standalone: true,
    imports: [TableModule, TagModule, InputTextModule, ArrowUp, ArrowDown],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TableColumnGroupFilterSortDemo {
    dt = viewChild<Table>('dt');

    sales = [
        { product: 'Bamboo Watch', lastYearSale: 51, thisYearSale: 40, lastYearProfit: 54406, thisYearProfit: 43342 },
        { product: 'Black Watch', lastYearSale: 83, thisYearSale: 9, lastYearProfit: 423132, thisYearProfit: 312122 },
        { product: 'Blue Band', lastYearSale: 38, thisYearSale: 5, lastYearProfit: 12321, thisYearProfit: 8500 },
        { product: 'Blue T-Shirt', lastYearSale: 49, thisYearSale: 22, lastYearProfit: 745232, thisYearProfit: 650323 },
        { product: 'Bracelet', lastYearSale: 17, thisYearSale: 79, lastYearProfit: 643242, thisYearProfit: 500332 }
    ];

    initialValue = [...this.sales];

    sortedField: string | null = null;

    isSorted: boolean | null = null;

    customSort(event: SortEvent) {
        if (this.sortedField !== event.field) {
            this.sortedField = event.field ?? null;
            this.isSorted = true;
            this.sortTableData(event);
        } else if (this.isSorted) {
            this.isSorted = false;
            this.sortTableData(event);
        } else {
            // Third consecutive click removes the sort and restores the original
            // order without touching the active filters.
            this.sortedField = null;
            this.isSorted = null;
            this.sales = [...this.initialValue];

            const table = this.dt()!;

            table.sortField = null;
            table.sortOrder = table.defaultSortOrder();
            table.tableService.onSort(null);
        }
    }

    sortTableData(event: SortEvent) {
        event.data!.sort((data1: any, data2: any) => {
            let value1 = data1[event.field!];
            let value2 = data2[event.field!];
            let result: number;

            if (value1 == null && value2 != null) result = -1;
            else if (value1 != null && value2 == null) result = 1;
            else if (value1 == null && value2 == null) result = 0;
            else if (typeof value1 === 'string' && typeof value2 === 'string') result = value1.localeCompare(value2);
            else result = value1 < value2 ? -1 : value1 > value2 ? 1 : 0;

            return event.order! * result;
        });
    }

    formatCurrency(value: number): string {
        return value != null ? '$' + value.toLocaleString() : '';
    }
}
```

## columnresizeexpandmode-doc

Dragging grows or shrinks the whole table; adjacent columns keep their widths. Usually paired with scrollable so the table can exceed its viewport.

```typescript
import { Component, OnInit, inject, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ProductService } from '@/service/productservice';
import { Product } from '@/domain/product';

@Component({
    template: `
        <p-table [value]="products" showGridlines [resizableColumns]="true" columnResizeMode="expand" [scrollable]="true" scrollHeight="400px" [tableStyle]="{ 'min-width': '50rem' }">
            <ng-template #header>
                <tr>
                    <th pResizableColumn>Product</th>
                    <th pResizableColumn>Category</th>
                    <th pResizableColumn>Qty</th>
                    <th pResizableColumn>Price</th>
                    <th>Status</th>
                </tr>
            </ng-template>
            <ng-template #body let-product>
                <tr>
                    <td>
                        <div class="flex items-center gap-3">
                            <img [src]="'https://primefaces.org/cdn/primeng/images/demo/product/' + product.image" [alt]="product.name" width="36" height="36" class="rounded-md shadow" />
                            <span class="font-medium truncate">{{ product.name }}</span>
                        </div>
                    </td>
                    <td>
                        <p-tag [value]="product.category" severity="secondary" />
                    </td>
                    <td>{{ product.quantity }}</td>
                    <td>
                        <span class="font-semibold">{{ '$' + product.price }}</span>
                    </td>
                    <td>
                        <p-tag [value]="getSeverityLabel(product.inventoryStatus)" [severity]="getSeverity(product.inventoryStatus)" />
                    </td>
                </tr>
            </ng-template>
        </p-table>
    `,
    standalone: true,
    imports: [TableModule, TagModule],
    providers: [ProductService],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TableColumnResizeExpandModeDemo implements OnInit {
    private productService = inject(ProductService);

    private cd = inject(ChangeDetectorRef);

    products!: Product[];

    ngOnInit() {
        this.productService.getProductsSmall().then((data) => {
            this.products = data.slice(0, 6);
        });
    }

    getSeverity(status: string) {
        switch (status) {
            case 'INSTOCK':
                return 'success';
            case 'LOWSTOCK':
                return 'warn';
            case 'OUTOFSTOCK':
                return 'danger';
        }
    }

    getSeverityLabel(status: string) {
        switch (status) {
            case 'INSTOCK':
                return 'In Stock';
            case 'LOWSTOCK':
                return 'Low Stock';
            case 'OUTOFSTOCK':
                return 'Out of Stock';
            default:
                return status;
        }
    }
}
```

## columnresizefitmode-doc

Dragging a column takes width from the adjacent column so the total table width stays the same. Both demos enable showGridlines to make the effect visible.

```typescript
import { Component, OnInit, inject, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ProductService } from '@/service/productservice';
import { Product } from '@/domain/product';

@Component({
    template: `
        <p-table [value]="products" showGridlines [resizableColumns]="true" [tableStyle]="{ 'min-width': '50rem' }">
            <ng-template #header>
                <tr>
                    <th pResizableColumn style="width: 25%">Product</th>
                    <th pResizableColumn style="width: 25%">Category</th>
                    <th pResizableColumn style="width: 25%">Qty</th>
                    <th pResizableColumn style="width: 25%">Price</th>
                </tr>
            </ng-template>
            <ng-template #body let-product>
                <tr>
                    <td>
                        <div class="flex items-center gap-3">
                            <img [src]="'https://primefaces.org/cdn/primeng/images/demo/product/' + product.image" [alt]="product.name" width="36" height="36" class="rounded-md shadow" />
                            <span class="font-medium truncate">{{ product.name }}</span>
                        </div>
                    </td>
                    <td>
                        <p-tag [value]="product.category" severity="secondary" />
                    </td>
                    <td>{{ product.quantity }}</td>
                    <td>
                        <span class="font-semibold">{{ '$' + product.price }}</span>
                    </td>
                </tr>
            </ng-template>
        </p-table>
    `,
    standalone: true,
    imports: [TableModule, TagModule],
    providers: [ProductService],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TableColumnResizeFitModeDemo implements OnInit {
    private productService = inject(ProductService);

    private cd = inject(ChangeDetectorRef);

    products!: Product[];

    ngOnInit() {
        this.productService.getProductsSmall().then((data) => {
            this.products = data.slice(0, 6);
        });
    }
}
```

## columnresizescrollablemode-doc

```typescript
import { Component, OnInit, inject, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { TableModule } from 'primeng/table';
import { CustomerService } from '@/service/customerservice';
import { Customer, Representative, Country } from '@/domain/customer';

@Component({
    template: `
        <p-table [value]="customers" showGridlines [scrollable]="true" scrollHeight="400px" [resizableColumns]="true" [tableStyle]="{ 'min-width': '50rem' }">
            <ng-template #header>
                <tr>
                    <th pResizableColumn>Name</th>
                    <th pResizableColumn>Country</th>
                    <th pResizableColumn>Company</th>
                    <th pResizableColumn>Representative</th>
                </tr>
            </ng-template>
            <ng-template #body let-customer>
                <tr>
                    <td>{{ customer.name }}</td>
                    <td>{{ customer.country.name }}</td>
                    <td>{{ customer.company }}</td>
                    <td>{{ customer.representative.name }}</td>
                </tr>
            </ng-template>
        </p-table>
    `,
    standalone: true,
    imports: [TableModule],
    providers: [CustomerService],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TableColumnResizeScrollableModeDemo implements OnInit {
    private customerService = inject(CustomerService);

    private cd = inject(ChangeDetectorRef);

    customers!: Customer[];

    ngOnInit() {
        this.customerService.getCustomersLarge().then((customers) => {
            this.customers = customers;
        });
    }
}
```

## columnselection-doc

Row selection with an element inside a column is implemented with templating.

```typescript
import { Component, OnInit, inject, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { ProductService } from '@/service/productservice';
import { MessageService } from 'primeng/api';
import { Product } from '@/domain/product';
import { Search } from '@primeicons/angular/search';

@Component({
    template: `
        <p-table [value]="products" [tableStyle]="{ 'min-width': '50rem' }">
            <ng-template #header>
                <tr>
                    <th>Code</th>
                    <th>Name</th>
                    <th>Category</th>
                    <th>Quantity</th>
                    <th style="width: 5rem"></th>
                </tr>
            </ng-template>
            <ng-template #body let-product>
                <tr>
                    <td>{{ product.code }}</td>
                    <td>{{ product.name }}</td>
                    <td>{{ product.category }}</td>
                    <td>{{ product.quantity }}</td>
                    <td>
                        <button type="button" pButton iconOnly (click)="selectProduct(product)" severity="secondary" rounded><svg data-p-icon="search" /></button>
                    </td>
                </tr>
            </ng-template>
        </p-table>
    `,
    standalone: true,
    imports: [TableModule, ButtonModule, Search],
    providers: [ProductService, MessageService],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TableColumnSelectionDemo implements OnInit {
    products!: Product[];

    selectedProduct!: Product;

    private productService = inject(ProductService);

    private messageService = inject(MessageService);

    private cd = inject(ChangeDetectorRef);

    ngOnInit() {
        this.productService.getProductsMini().then((data) => {
            this.products = data;
        });
    }

    selectProduct(product: Product) {
        this.messageService.add({ severity: 'info', summary: 'Product Selected', detail: product.name });
    }
}
```

## columntoggle-doc

Show/hide columns dynamically.

```typescript
import { Component, OnInit, inject, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CheckboxModule } from 'primeng/checkbox';
import { PopoverModule } from 'primeng/popover';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ButtonModule } from 'primeng/button';
import { ProductService } from '@/service/productservice';
import { Product } from '@/domain/product';
import { Cog } from '@primeicons/angular/cog';
import { Refresh } from '@primeicons/angular/refresh';
import { Bars } from '@primeicons/angular/bars';

interface Column {
    field: string;
    header: string;
}

@Component({
    template: `
        <div class="mb-3 flex items-center justify-end">
            <button type="button" pButton variant="outlined" severity="secondary" size="small" (click)="op.toggle($event)">
                <svg data-p-icon="cog" />
                Columns
            </button>
            <p-popover #op styleClass="w-72" [pt]="{ content: 'p-0!' }">
                <ng-template #content>
                    <div class="flex items-center justify-between gap-2 px-4 py-3 border-b border-surface-200 dark:border-surface-700">
                        <span class="text-sm font-semibold">Columns</span>
                        <button type="button" pButton variant="text" size="small" severity="secondary" (click)="reset()">
                            <svg data-p-icon="refresh" />
                            Reset
                        </button>
                    </div>
                    <div class="column-toggle-drag-list py-2 max-h-80 overflow-auto" cdkDropList (cdkDropListDropped)="drop($event)">
                        @for (col of cols; track col.field) {
                            <div class="flex items-center gap-2 px-3 py-1.5 mx-1 rounded-md cursor-move select-none hover:bg-surface-100 dark:hover:bg-surface-800" cdkDrag cdkDragPreviewClass="column-toggle-drag-preview">
                                <svg data-p-icon="bars" [size]="14" class="text-surface-400 dark:text-surface-500" />
                                <p-checkbox [(ngModel)]="visibleFields" [value]="col.field" [inputId]="col.field" (click)="$event.stopPropagation()" />
                                <label [for]="col.field" class="text-sm cursor-pointer" (click)="$event.stopPropagation()">{{ col.header }}</label>
                            </div>
                        }
                    </div>
                </ng-template>
            </p-popover>
        </div>
        <p-table [columns]="visibleColumns" [value]="products" [tableStyle]="{ 'min-width': '50rem' }">
            <ng-template #header let-columns>
                <tr>
                    @for (col of columns; track col.field) {
                        <th>{{ col.header }}</th>
                    }
                </tr>
            </ng-template>
            <ng-template #body let-product let-columns="columns">
                <tr>
                    @for (col of columns; track col.field) {
                        <td>
                            @switch (col.field) {
                                @case ('name') {
                                    <div class="flex items-center gap-3">
                                        <img [src]="'https://primefaces.org/cdn/primeng/images/demo/product/' + product.image" [alt]="product.name" width="36" height="36" class="rounded-md shadow" />
                                        <div class="flex flex-col">
                                            <span class="font-medium">{{ product.name }}</span>
                                            <span class="text-xs text-surface-500 dark:text-surface-400">{{ product.code }}</span>
                                        </div>
                                    </div>
                                }
                                @case ('category') {
                                    <p-tag [value]="product.category" severity="secondary" />
                                }
                                @case ('quantity') {
                                    {{ product.quantity }}
                                }
                                @case ('price') {
                                    <span class="font-semibold">{{ '$' + product.price }}</span>
                                }
                                @case ('rating') {
                                    {{ product.rating }}/5
                                }
                                @case ('inventoryStatus') {
                                    <p-tag [value]="getSeverityLabel(product.inventoryStatus)" [severity]="getSeverity(product.inventoryStatus)" />
                                }
                            }
                        </td>
                    }
                </tr>
            </ng-template>
        </p-table>
    `,
    styles: [
        `
            .column-toggle-drag-preview {
                background: var(--p-content-background);
                border-radius: var(--p-content-border-radius);
                box-shadow: var(--p-overlay-popover-shadow);
            }
            .column-toggle-drag-list .cdk-drag-placeholder {
                opacity: 0.4;
            }
        `
    ],
    standalone: true,
    imports: [CheckboxModule, PopoverModule, TableModule, TagModule, ButtonModule, FormsModule, Cog, Refresh, Bars],
    providers: [ProductService],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TableColumnToggleDemo implements OnInit {
    private productService = inject(ProductService);

    private cd = inject(ChangeDetectorRef);

    products!: Product[];

    cols = [...initialColumns];

    visibleFields = [...defaultVisibleFields];

    ngOnInit() {
        this.productService.getProductsSmall().then((data) => {
            this.products = data.slice(0, 6);
        });
    }

    get visibleColumns(): Column[] {
        return this.cols.filter((col) => this.visibleFields.includes(col.field));
    }

    drop(event: CdkDragDrop<Column[]>) {
        moveItemInArray(this.cols, event.previousIndex, event.currentIndex);
    }

    reset() {
        this.cols = [...initialColumns];
        this.visibleFields = [...defaultVisibleFields];
    }

    getSeverity(status: string) {
        switch (status) {
            case 'INSTOCK':
                return 'success';
            case 'LOWSTOCK':
                return 'warn';
            case 'OUTOFSTOCK':
                return 'danger';
        }
    }

    getSeverityLabel(status: string) {
        switch (status) {
            case 'INSTOCK':
                return 'In Stock';
            case 'LOWSTOCK':
                return 'Low Stock';
            case 'OUTOFSTOCK':
                return 'Out of Stock';
            default:
                return status;
        }
    }
}
```

## contextmenu-doc

Table has exclusive integration with contextmenu component. In order to attach a menu to a table, add pContextMenuRow directive to the rows that can be selected with context menu, define a local template variable for the menu and bind it to the contextMenu property of the table. This enables displaying the menu whenever a row is right clicked. Optional pContextMenuRowIndex property is available to access the row index. A separate contextMenuSelection property is used to get a hold of the right clicked row. For dynamic columns, setting pContextMenuRowDisabled property as true disables context menu for that particular row.

```typescript
import { Component, OnInit, inject, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { ContextMenuModule } from 'primeng/contextmenu';
import { Table, TableModule } from 'primeng/table';
import { ProductService } from '@/service/productservice';
import { MenuItem, MessageService } from 'primeng/api';
import { Product } from '@/domain/product';

@Component({
    template: `
        <p-contextmenu #cm [model]="items" (onHide)="selectedProduct = null" />
        <p-table [value]="products" [(contextMenuSelection)]="selectedProduct" [contextMenu]="cm" dataKey="code" [tableStyle]="{ 'min-width': '50rem' }">
            <ng-template #header>
                <tr>
                    <th>Code</th>
                    <th>Name</th>
                    <th>Category</th>
                    <th>Price</th>
                </tr>
            </ng-template>
            <ng-template #body let-product>
                <tr [pContextMenuRow]="product">
                    <td>{{ product.code }}</td>
                    <td>{{ product.name }}</td>
                    <td>{{ product.category }}</td>
                    <td>{{ '$' + product.price }}</td>
                </tr>
            </ng-template>
        </p-table>
    `,
    standalone: true,
    imports: [ContextMenuModule, TableModule],
    providers: [ProductService, MessageService],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TableContextMenuDemo implements OnInit {
    products!: Product[];

    selectedProduct!: Product;

    items!: MenuItem[];

    private productService = inject(ProductService);

    private messageService = inject(MessageService);

    private cd = inject(ChangeDetectorRef);

    ngOnInit() {
        this.productService.getProductsMini().then((data) => {
            this.products = data;
        });
        this.items = [
            { label: 'View', icon: 'pi pi-fw pi-search', command: () => this.viewProduct(this.selectedProduct) },
            { label: 'Delete', icon: 'pi pi-fw pi-times', command: () => this.deleteProduct(this.selectedProduct) }
        ];
    }

    viewProduct(product: Product) {
        this.messageService.add({ severity: 'info', summary: 'Product Selected', detail: product.name });
    }

    deleteProduct(product: Product) {
        this.products = this.products.filter((p) => p.id !== product.id);
        this.messageService.add({ severity: 'error', summary: 'Product Deleted', detail: product.name });
        this.selectedProduct = null;
    }
}
```

## databaseeditor-doc

A spreadsheet-style table editor composed from Table , Menu , Checkbox , Drawer and Select : typed column headers with a per-column menu (sort, copy, edit, freeze, delete), select-all and per-row checkboxes, a global filter, in-place cell editing, frozen columns, an empty-table state, plus working insert-row and add/edit-column flows that open a side drawer.

```typescript
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DrawerModule } from 'primeng/drawer';
import { SelectModule } from 'primeng/select';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { Menu, MenuModule } from 'primeng/menu';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MenuItem } from 'primeng/api';
import { Search } from '@primeicons/angular/search';
import { Trash } from '@primeicons/angular/trash';
import { Plus } from '@primeicons/angular/plus';
import { Key } from '@primeicons/angular/key';
import { Lock } from '@primeicons/angular/lock';
import { ArrowUp } from '@primeicons/angular/arrow-up';
import { ArrowDown } from '@primeicons/angular/arrow-down';
import { ChevronDown } from '@primeicons/angular/chevron-down';

interface DbColumn {
    field: string;
    type: string;
    pk?: boolean;
    frozen?: boolean;
}

interface DbRow {
    __rid: number;
    [key: string]: any;
}

@Component({
    template: `
        <div #dbContainer class="relative w-full overflow-hidden rounded-lg border border-surface-200 dark:border-surface-700">
            <div class="flex items-center gap-2 border-b border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900 px-3 py-2">
                <p-iconfield class="flex-1 max-w-md">
                    <p-inputicon>
                        <svg data-p-icon="search" />
                    </p-inputicon>
                    <input pInputText type="text" (input)="dt.filterGlobal($event.target.value, 'contains')" placeholder="Filter by id, created_at or email" pSize="small" class="w-full" />
                </p-iconfield>
                <div class="flex-1"></div>
                @if (selectedRows.length) {
                    <button type="button" pButton size="small" severity="danger" variant="outlined" (click)="deleteSelected()">
                        <svg data-p-icon="trash" class="mr-1" />
                        Delete {{ selectedRows.length }}
                    </button>
                }
                <button type="button" pButton size="small" (click)="rowDrawer = true">
                    <svg data-p-icon="plus" class="mr-1" />
                    Insert
                </button>
            </div>
            <p-table
                #dt
                [value]="viewRows"
                [(selection)]="selectedRows"
                dataKey="__rid"
                [columns]="columns"
                [globalFilterFields]="globalFilterFields"
                [scrollable]="true"
                [paginator]="true"
                [rows]="10"
                [totalRecords]="viewRows.length"
                paginatorDropdownAppendTo="body"
                [rowsPerPageOptions]="[10, 20, 50, 100]"
                [showCurrentPageReport]="true"
                currentPageReportTemplate="Page {currentPage} of {totalPages} • {totalRecords} records"
                [reorderableColumns]="true"
            >
                <ng-template #header let-cols>
                    <tr>
                        <th pFrozenColumn style="width: 3rem">
                            <p-table-header-checkbox />
                        </th>
                        @for (col of cols; track col.field) {
                            <th pReorderableColumn pFrozenColumn [frozen]="col.frozen ?? false" style="min-width: 12rem" (dragstart)="colMenu.hide()">
                                <div class="flex items-center justify-between gap-2 w-full">
                                    <span class="inline-flex items-center gap-1.5 whitespace-nowrap text-xs">
                                        @if (col.pk) {
                                            <svg data-p-icon="key" class="text-emerald-500" style="width: 13px" />
                                        }
                                        @if (col.frozen) {
                                            <svg data-p-icon="lock" class="text-surface-400" style="width: 11px" />
                                        }
                                        <span class="font-semibold">{{ col.field }}</span>
                                        <span class="font-mono font-normal text-surface-400 dark:text-surface-500">{{ col.type }}</span>
                                        @if (sortField === col.field && sortOrder === 1) {
                                            <svg data-p-icon="arrow-up" style="width: 11px" />
                                        }
                                        @if (sortField === col.field && sortOrder === -1) {
                                            <svg data-p-icon="arrow-down" style="width: 11px" />
                                        }
                                    </span>
                                    <button type="button" pButton iconOnly variant="text" severity="secondary" size="small" [attr.aria-label]="col.field + ' options'" (click)="toggleColMenu($event, col)">
                                        <svg data-p-icon="chevron-down" />
                                    </button>
                                </div>
                            </th>
                        }
                        <th style="width: 3rem">
                            <button type="button" pButton iconOnly variant="text" severity="secondary" size="small" aria-label="Add column" (click)="openAddColumn()">
                                <svg data-p-icon="plus" />
                            </button>
                        </th>
                    </tr>
                </ng-template>
                <ng-template #body let-row let-cols="columns">
                    <tr>
                        <td pFrozenColumn>
                            <p-table-checkbox [value]="row" />
                        </td>
                        @for (col of cols; track col.field) {
                            <td [pEditableColumn]="row[col.field]" [pEditableColumnField]="col.field" pFrozenColumn [frozen]="col.frozen ?? false" style="min-width: 12rem">
                                <p-cell-editor>
                                    <ng-template #input>
                                        @if (col.field === 'plan') {
                                            <p-select [options]="planOptions" [(ngModel)]="row[col.field]" optionLabel="label" optionValue="value" size="small" appendTo="body" fluid />
                                        } @else {
                                            <input pInputText [(ngModel)]="row[col.field]" pSize="small" class="w-full" />
                                        }
                                    </ng-template>
                                    <ng-template #output>
                                        <span class="flex h-7 items-center whitespace-nowrap text-xs" [class.font-mono]="col.type !== 'text' || col.field === 'plan'">
                                            @if (row[col.field] != null) {
                                                {{ row[col.field] }}
                                            } @else {
                                                <span class="text-surface-400 dark:text-surface-600">NULL</span>
                                            }
                                        </span>
                                    </ng-template>
                                </p-cell-editor>
                            </td>
                        }
                        <td></td>
                    </tr>
                </ng-template>
                <ng-template #emptymessage>
                    <tr>
                        <td [attr.colspan]="columns.length + 2">
                            <div class="py-24 text-center text-sm text-surface-500 dark:text-surface-400">This table is empty</div>
                        </td>
                    </tr>
                </ng-template>
            </p-table>
            <p-menu #colMenu [model]="colMenuModel" [popup]="true" appendTo="body" />
            <p-drawer [(visible)]="rowDrawer" position="right" header="Insert row" [appendTo]="dbContainer" styleClass="w-full! md:w-96!">
                <div class="flex flex-col gap-4">
                    <div class="flex flex-col gap-2">
                        <label for="draft-email" class="font-medium">email <span class="font-mono text-xs text-surface-400">text</span></label>
                        <input pInputText id="draft-email" [(ngModel)]="draftEmail" placeholder="name@example.com" class="w-full" />
                    </div>
                    <div class="flex flex-col gap-2">
                        <label class="font-medium">plan <span class="font-mono text-xs text-surface-400">text</span></label>
                        <p-select [options]="planOptions" [(ngModel)]="draftPlan" optionLabel="label" optionValue="value" fluid />
                    </div>
                    <p class="text-xs text-surface-500 dark:text-surface-400"><span class="font-mono">id</span> and <span class="font-mono">created_at</span> are filled automatically.</p>
                    <div class="flex justify-end gap-2 pt-2">
                        <button type="button" pButton variant="text" severity="secondary" (click)="rowDrawer = false">Cancel</button>
                        <button type="button" pButton [disabled]="!draftEmail.trim()" (click)="insertRow()">Save</button>
                    </div>
                </div>
            </p-drawer>
            <p-drawer [(visible)]="colDrawer" position="right" [header]="editingField ? 'Edit column' : 'Add column'" [appendTo]="dbContainer" styleClass="w-full! md:w-96!">
                <div class="flex flex-col gap-4">
                    <div class="flex flex-col gap-2">
                        <label for="draft-col" class="font-medium">Name</label>
                        <input pInputText id="draft-col" [(ngModel)]="draftColName" placeholder="column_name" class="w-full" />
                    </div>
                    <div class="flex flex-col gap-2">
                        <label class="font-medium">Type</label>
                        <p-select [options]="typeOptions" [(ngModel)]="draftColType" optionLabel="label" optionValue="value" size="small" fluid />
                    </div>
                    <div class="flex justify-end gap-2 pt-2">
                        <button type="button" pButton variant="text" severity="secondary" (click)="colDrawer = false">Cancel</button>
                        <button type="button" pButton [disabled]="!canSaveColumn()" (click)="saveColumn()">{{ editingField ? 'Save' : 'Add' }}</button>
                    </div>
                </div>
            </p-drawer>
        </div>
    `,
    standalone: true,
    imports: [DrawerModule, SelectModule, IconFieldModule, InputIconModule, MenuModule, TableModule, ButtonModule, InputTextModule, FormsModule, Search, Trash, Plus, Key, Lock, ArrowUp, ArrowDown, ChevronDown]
})
export class TableDatabaseEditorDemo {
    rows: DbRow[] = createSeed();

    columns: DbColumn[] = [
        { field: 'id', type: 'int8', pk: true },
        { field: 'created_at', type: 'timestamptz' },
        { field: 'email', type: 'text' },
        { field: 'plan', type: 'text' }
    ];

    viewRows: DbRow[] = this.rows;

    globalFilterFields: string[] = this.columns.map((c) => c.field);

    selectedRows: DbRow[] = [];

    sortField: string | null = null;

    sortOrder: number = 0;

    colMenuModel: MenuItem[] = [];

    rowDrawer: boolean = false;

    draftEmail: string = '';

    draftPlan: string = 'free';

    colDrawer: boolean = false;

    editingField: string | null = null;

    draftColName: string = '';

    draftColType: string = 'text';

    planOptions = [
        { label: 'free', value: 'free' },
        { label: 'pro', value: 'pro' },
        { label: 'team', value: 'team' }
    ];

    typeOptions = [
        { label: 'text', value: 'text' },
        { label: 'int8', value: 'int8' },
        { label: 'bool', value: 'bool' },
        { label: 'timestamptz', value: 'timestamptz' }
    ];

    updateView() {
        if (!this.sortField || !this.sortOrder) {
            this.viewRows = this.rows;

            return;
        }

        const f = this.sortField;
        const o = this.sortOrder;

        this.viewRows = [...this.rows].sort((a, b) => {
            const av = a[f];
            const bv = b[f];

            if (av == null) return 1;

            if (bv == null) return -1;

            const r = av < bv ? -1 : av > bv ? 1 : 0;

            return o * r;
        });
    }

    sortBy(field: string, order: number) {
        this.sortField = field;
        this.sortOrder = order;
        this.updateView();
    }

    copyName(field: string) {
        if (typeof navigator !== 'undefined' && navigator.clipboard) navigator.clipboard.writeText(field);
    }

    freezeColumn(field: string) {
        this.columns = this.columns.map((c) => (c.field === field ? { ...c, frozen: !c.frozen } : c));
    }

    deleteColumn(field: string) {
        this.columns = this.columns.filter((c) => c.field !== field);
        this.globalFilterFields = this.columns.map((c) => c.field);
    }

    openAddColumn() {
        this.editingField = null;
        this.draftColName = '';
        this.draftColType = 'text';
        this.colDrawer = true;
    }

    openEditColumn(col: DbColumn) {
        this.editingField = col.field;
        this.draftColName = col.field;
        this.draftColType = col.type;
        this.colDrawer = true;
    }

    canSaveColumn() {
        const name = this.draftColName.trim();

        return !!name && !this.columns.some((c) => c.field === name && c.field !== this.editingField);
    }

    saveColumn() {
        const name = this.draftColName.trim();

        if (!name) return;

        if (this.editingField) {
            const oldField = this.editingField;

            this.columns = this.columns.map((c) => (c.field === oldField ? { ...c, field: name, type: this.draftColType } : c));

            if (name !== oldField) {
                this.rows = this.rows.map((r) => {
                    const { [oldField]: oldValue, ...rest } = r;

                    return { ...rest, [name]: oldValue } as DbRow;
                });
            }
        } else {
            if (this.columns.some((c) => c.field === name)) return;

            this.columns = [...this.columns, { field: name, type: this.draftColType }];
        }

        this.globalFilterFields = this.columns.map((c) => c.field);
        this.colDrawer = false;
        this.editingField = null;
        this.updateView();
    }

    insertRow() {
        if (!this.draftEmail.trim()) return;

        const nextRid = this.rows.reduce((max, r) => Math.max(max, r.__rid), 0) + 1;
        const nextId = this.rows.reduce((max, r) => Math.max(max, Number(r['id']) || 0), 0) + 1;

        this.rows = [...this.rows, { __rid: nextRid, id: nextId, created_at: '2026-06-04 12:00:00+00', email: this.draftEmail.trim(), plan: this.draftPlan }];
        this.draftEmail = '';
        this.draftPlan = 'free';
        this.rowDrawer = false;
        this.updateView();
    }

    deleteSelected() {
        const selectedIds = new Set(this.selectedRows.map((r) => r.__rid));

        this.rows = this.rows.filter((r) => !selectedIds.has(r.__rid));
        this.selectedRows = [];
        this.updateView();
    }

    toggleColMenu(event: Event, col: DbColumn) {
        this.colMenuModel = [
            { label: 'Sort Ascending', icon: 'pi pi-arrow-up', command: () => this.sortBy(col.field, 1) },
            { label: 'Sort Descending', icon: 'pi pi-arrow-down', command: () => this.sortBy(col.field, -1) },
            { separator: true },
            { label: 'Copy name', icon: 'pi pi-copy', command: () => this.copyName(col.field) },
            { label: 'Edit column', icon: 'pi pi-pencil', command: () => this.openEditColumn(col) },
            { label: col.frozen ? 'Unfreeze column' : 'Freeze column', icon: 'pi pi-lock', command: () => this.freezeColumn(col.field) },
            { separator: true },
            { label: 'Delete column', icon: 'pi pi-trash', styleClass: 'text-red-600', command: () => this.deleteColumn(col.field) }
        ];
        this.colMenu.toggle(event);
    }
}
```

## Dynamic Columns

Columns can be defined dynamically using the &#64;for block.

```typescript
import { Component, OnInit, inject, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { TableModule } from 'primeng/table';
import { ProductService } from '@/service/productservice';
import { Product } from '@/domain/product';

interface Column {
    field: string;
    header: string;
}

@Component({
    template: `
        <p-table [columns]="cols" [value]="products" [tableStyle]="{ 'min-width': '50rem' }">
            <ng-template #header let-columns>
                <tr>
                    @for (col of columns; track col) {
                        <th>
                            {{ col.header }}
                        </th>
                    }
                </tr>
            </ng-template>
            <ng-template #body let-rowData let-columns="columns">
                <tr>
                    @for (col of columns; track col) {
                        <td>
                            {{ rowData[col.field] }}
                        </td>
                    }
                </tr>
            </ng-template>
        </p-table>
    `,
    standalone: true,
    imports: [TableModule],
    providers: [ProductService],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TableDynamicDemo implements OnInit {
    products!: Product[];

    cols!: Column[];

    private productService = inject(ProductService);

    private cd = inject(ChangeDetectorRef);

    ngOnInit() {
        this.productService.getProductsMini().then((data) => {
            this.products = data;
        });
        this.cols = [
            { field: 'code', header: 'Code' },
            { field: 'name', header: 'Name' },
            { field: 'category', header: 'Category' },
            { field: 'quantity', header: 'Quantity' }
        ];
    }
}
```

## emptystate-doc

Custom empty state when no data is available, using the emptymessage template.

```typescript
import { Component, ChangeDetectionStrategy } from '@angular/core';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { Product } from '@/domain/product';
import { Inbox } from '@primeicons/angular/inbox';
import { Plus } from '@primeicons/angular/plus';

@Component({
    template: `
        <p-table [value]="[]" [tableStyle]="{ 'min-width': '50rem' }">
            <ng-template #header>
                <tr>
                    <th>Product</th>
                    <th>Category</th>
                    <th>Price</th>
                    <th>Status</th>
                </tr>
            </ng-template>
            <ng-template #emptymessage>
                <tr>
                    <td colspan="4">
                        <div class="flex flex-col items-center justify-center gap-3 py-10 text-center">
                            <div class="w-14 h-14 rounded-full bg-surface-100 dark:bg-surface-800 flex items-center justify-center">
                                <svg data-p-icon="inbox" [size]="28" class="text-surface-400 dark:text-surface-500" />
                            </div>
                            <div>
                                <p class="m-0 font-semibold text-surface-900 dark:text-surface-0">No products yet</p>
                                <p class="mt-1 text-sm text-surface-500 dark:text-surface-400">Add your first product to see it listed here.</p>
                            </div>
                            <button type="button" pButton size="small">
                                <svg data-p-icon="plus" />
                                Add product
                            </button>
                        </div>
                    </td>
                </tr>
            </ng-template>
        </p-table>
    `,
    standalone: true,
    imports: [TableModule, ButtonModule, Inbox, Plus],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TableEmptyStateDemo {}
```

## expandablerowgroup-doc

When expandableRowGroups is present in subheader based row grouping, groups can be expanded and collapsed. State of the expansions are controlled using the expandedRows and onRowToggle properties.

```typescript
import { Component, OnInit, inject, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ButtonModule } from 'primeng/button';
import { RippleModule } from 'primeng/ripple';
import { CustomerService } from '@/service/customerservice';
import { Customer, Country } from '@/domain/customer';
import { ChevronDown } from '@primeicons/angular/chevron-down';
import { ChevronRight } from '@primeicons/angular/chevron-right';

@Component({
    template: `
        <p-table [value]="customers" sortField="representative.name" sortMode="single" dataKey="representative.name" rowGroupMode="subheader" groupRowsBy="representative.name" [tableStyle]="{ 'min-width': '70rem' }">
            <ng-template #header>
                <tr>
                    <th style="width:20%">Name</th>
                    <th style="width:20%">Country</th>
                    <th style="width:20%">Company</th>
                    <th style="width:20%">Status</th>
                    <th style="width:20%">Date</th>
                </tr>
            </ng-template>
            <ng-template #groupheader let-customer let-rowIndex="rowIndex" let-expanded="expanded">
                <tr>
                    <td colspan="5">
                        <button type="button" pButton iconOnly pRipple [pRowToggler]="customer" text rounded plain class="align-middle">
                            @if (expanded) {
                                <svg data-p-icon="chevron-down" />
                            } @else {
                                <svg data-p-icon="chevron-right" />
                            }
                        </button>
                        <img [alt]="customer.representative.name" src="https://primefaces.org/cdn/primeng/images/demo/avatar/{{ customer.representative.image }}" width="32" style="vertical-align: middle; display: inline-block" class="ml-2" />
                        <span class="align-middle ml-2 font-bold leading-normal">{{ customer.representative.name }}</span>
                    </td>
                </tr>
            </ng-template>
            <ng-template #groupfooter let-customer>
                <tr class="p-rowgroup-footer">
                    <td colspan="4" style="text-align: right">Total Customers</td>
                    <td>{{ calculateCustomerTotal(customer.representative.name) }}</td>
                </tr>
            </ng-template>
            <ng-template #expandedrow let-customer>
                <tr>
                    <td>
                        {{ customer.name }}
                    </td>
                    <td>
                        <div class="flex items-center gap-2">
                            <img src="https://primefaces.org/cdn/primeng/images/demo/flag/flag_placeholder.png" [class]="'flag flag-' + customer.country.code" style="width: 20px" />
                            <span>{{ customer.country.name }}</span>
                        </div>
                    </td>
                    <td>
                        {{ customer.company }}
                    </td>
                    <td>
                        <p-tag [value]="customer.status" [severity]="getSeverity(customer.status)" />
                    </td>
                    <td>
                        {{ customer.date }}
                    </td>
                </tr>
            </ng-template>
        </p-table>
    `,
    standalone: true,
    imports: [TableModule, TagModule, ButtonModule, RippleModule, ChevronDown, ChevronRight],
    providers: [CustomerService],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TableExpandableRowGroupDemo implements OnInit {
    private customerService = inject(CustomerService);

    private cd = inject(ChangeDetectorRef);

    customers!: Customer[];

    ngOnInit() {
        this.customerService.getCustomersMedium().then((data) => {
            this.customers = data;
        });
    }

    calculateCustomerTotal(name: string) {
        let total = 0;

        if (this.customers) {
            for (let customer of this.customers) {
                if (customer.representative?.name === name) {
                    total++;
                }
            }
        }

        return total;
    }

    getSeverity(status: string) {
        switch (status) {
            case 'unqualified':
                return 'danger';

            case 'qualified':
                return 'success';

            case 'new':
                return 'info';

            case 'negotiation':
                return 'warn';

            case 'renewal':
                return null;
        }
    }
}
```

## Export

Export table data to CSV with customizable fields and headers.

```typescript
import { Component, OnInit, inject, ChangeDetectionStrategy } from '@angular/core';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ButtonModule } from 'primeng/button';
import { ProductService } from '@/service/productservice';
import { Product } from '@/domain/product';
import { FileExport } from '@primeicons/angular/file-export';

interface Column {
    field: string;
    header: string;
    customExportHeader?: string;
}

@Component({
    template: `
        <div class="flex items-center justify-between gap-3 mb-3">
            <span class="text-sm text-surface-500 dark:text-surface-400">Export visible rows to CSV with custom column headers.</span>
            <button type="button" pButton size="small" (click)="dt.exportCSV()"><svg data-p-icon="file-export" /> Export CSV</button>
        </div>
        <p-table #dt [columns]="cols" [value]="products" [exportHeader]="'customExportHeader'" [tableStyle]="{ 'min-width': '50rem' }">
            <ng-template #header>
                <tr>
                    <th>Product</th>
                    <th>Category</th>
                    <th>Qty</th>
                    <th>Price</th>
                    <th>Status</th>
                </tr>
            </ng-template>
            <ng-template #body let-product>
                <tr>
                    <td>
                        <div class="flex items-center gap-3">
                            <img [src]="'https://primefaces.org/cdn/primevue/images/product/' + product.image" [alt]="product.name" width="36" height="36" class="rounded-md shadow" />
                            <div class="flex flex-col">
                                <span class="font-medium">{{ product.name }}</span>
                                <span class="text-xs text-surface-500 dark:text-surface-400">{{ product.code }}</span>
                            </div>
                        </div>
                    </td>
                    <td>
                        <p-tag [value]="product.category" severity="secondary" />
                    </td>
                    <td>{{ product.quantity }}</td>
                    <td>
                        <span class="font-semibold">{{ '$' + product.price }}</span>
                    </td>
                    <td>
                        <p-tag [value]="getSeverityLabel(product.inventoryStatus)" [severity]="getSeverity(product.inventoryStatus)" />
                    </td>
                </tr>
            </ng-template>
        </p-table>
    `,
    standalone: true,
    imports: [TableModule, TagModule, ButtonModule, FileExport],
    providers: [ProductService],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TableExportDemo implements OnInit {
    private productService = inject(ProductService);

    products!: Product[];

    cols!: Column[];

    ngOnInit() {
        this.productService.getProductsSmall().then((data) => {
            this.products = data.slice(0, 8);
        });
        this.cols = [
            { field: 'code', header: 'Code', customExportHeader: 'Product Code' },
            { field: 'name', header: 'Name' },
            { field: 'category', header: 'Category' },
            { field: 'price', header: 'Price' },
            { field: 'quantity', header: 'Quantity' },
            { field: 'inventoryStatus', header: 'Status' }
        ];
    }

    getSeverity(status: string) {
        switch (status) {
            case 'INSTOCK':
                return 'success';
            case 'LOWSTOCK':
                return 'warn';
            case 'OUTOFSTOCK':
                return 'danger';
            default:
                return 'secondary';
        }
    }

    getSeverityLabel(status: string) {
        switch (status) {
            case 'INSTOCK':
                return 'In Stock';
            case 'LOWSTOCK':
                return 'Low Stock';
            case 'OUTOFSTOCK':
                return 'Out of Stock';
            default:
                return status;
        }
    }
}
```

## Advanced

display="menu" swaps the inline input for a trigger icon that opens a popover. Each field supports multiple constraints joined by an AND/OR operator, a match mode per constraint, and Apply/Clear actions.

```typescript
import { Component, OnInit, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SelectModule } from 'primeng/select';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { MultiSelectModule } from 'primeng/multiselect';
import { SliderModule } from 'primeng/slider';
import { Table, TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { CustomerService } from '@/service/customerservice';
import { Customer, Representative, Country } from '@/domain/customer';
import { FilterSlash } from '@primeicons/angular/filter-slash';
import { Search } from '@primeicons/angular/search';

@Component({
    template: `
        <div class="mb-3 flex items-center justify-between gap-3">
            <button type="button" pButton variant="outlined" size="small" (click)="clear(dt1)">
                <svg data-p-icon="filter-slash" />
                Clear Filters
            </button>
            <p-iconfield iconPosition="left">
                <p-inputicon>
                    <svg data-p-icon="search" />
                </p-inputicon>
                <input pInputText type="text" [(ngModel)]="searchValue" (input)="dt1.filterGlobal($event.target.value, 'contains')" placeholder="Keyword Search" />
            </p-iconfield>
        </div>
        <p-table #dt1 [value]="customers()" dataKey="id" [rows]="10" [rowsPerPageOptions]="[10, 25, 50]" [loading]="loading()" [paginator]="true" [globalFilterFields]="['name', 'country.name', 'representative.name', 'status']">
            <ng-template #header>
                <tr>
                    <th style="min-width: 14rem">
                        <div class="flex items-center justify-between gap-2">
                            Name
                            <p-column-filter type="text" field="name" display="menu" />
                        </div>
                    </th>
                    <th style="min-width: 12rem">
                        <div class="flex items-center justify-between gap-2">
                            Country
                            <p-column-filter type="text" field="country.name" display="menu" />
                        </div>
                    </th>
                    <th style="min-width: 14rem">
                        <div class="flex items-center justify-between gap-2">
                            Agent
                            <p-column-filter field="representative" matchMode="in" display="menu" [showMatchModes]="false" [showOperator]="false" [showAddButton]="false">
                                <ng-template #filter let-value let-filter="filterCallback">
                                    <p-multiselect [ngModel]="value" [options]="representatives()" placeholder="Any" (onChange)="filter($event.value)" optionLabel="name" style="min-width: 14rem" [panelStyle]="{ minWidth: '16rem' }">
                                        <ng-template let-option #item>
                                            <div class="flex items-center gap-2">
                                                <img [alt]="option.name" src="https://primefaces.org/cdn/primeng/images/demo/avatar/{{ option.image }}" style="width: 32px" />
                                                <span>{{ option.name }}</span>
                                            </div>
                                        </ng-template>
                                    </p-multiselect>
                                </ng-template>
                            </p-column-filter>
                        </div>
                    </th>
                    <th style="min-width: 12rem">
                        <div class="flex items-center justify-between gap-2">
                            Date
                            <p-column-filter type="date" field="date" display="menu" />
                        </div>
                    </th>
                    <th style="min-width: 12rem">
                        <div class="flex items-center justify-between gap-2">
                            Balance
                            <p-column-filter type="numeric" field="balance" display="menu" currency="USD" />
                        </div>
                    </th>
                    <th style="min-width: 12rem">
                        <div class="flex items-center justify-between gap-2">
                            Status
                            <p-column-filter field="status" matchMode="equals" display="menu">
                                <ng-template #filter let-value let-filter="filterCallback">
                                    <p-select [ngModel]="value" [options]="statuses()" (onChange)="filter($event.value)" placeholder="Select One" class="w-full">
                                        <ng-template let-option #item>
                                            <p-tag [value]="option.value" [severity]="getSeverity(option.value)" />
                                        </ng-template>
                                    </p-select>
                                </ng-template>
                            </p-column-filter>
                        </div>
                    </th>
                    <th style="min-width: 14rem">
                        <div class="flex items-center justify-between gap-2">
                            Activity
                            <p-column-filter field="activity" matchMode="between" display="menu" [showMatchModes]="false" [showOperator]="false" [showAddButton]="false">
                                <ng-template #filter let-value let-filter="filterCallback">
                                    <p-slider [ngModel]="value" [range]="true" class="m-4" (onSlideEnd)="filter($event.values)" />
                                    <div class="flex items-center justify-between px-2">
                                        @if (!value) {
                                            <span>0%</span>
                                            <span>100%</span>
                                        } @else {
                                            <span>{{ value[0] }}%</span>
                                            <span>{{ value[1] }}%</span>
                                        }
                                    </div>
                                </ng-template>
                            </p-column-filter>
                        </div>
                    </th>
                    <th style="min-width: 10rem">
                        <div class="flex items-center justify-between gap-2">
                            Verified
                            <p-column-filter type="boolean" field="verified" display="menu" />
                        </div>
                    </th>
                </tr>
            </ng-template>
            <ng-template #body let-customer>
                <tr>
                    <td>
                        <span class="font-medium">{{ customer.name }}</span>
                    </td>
                    <td>
                        <div class="flex items-center gap-2">
                            <img src="https://primefaces.org/cdn/primeng/images/demo/flag/flag_placeholder.png" [class]="'flag flag-' + customer.country.code" style="width: 20px" />
                            <span>{{ customer.country.name }}</span>
                        </div>
                    </td>
                    <td>
                        <div class="flex items-center gap-2">
                            <img [alt]="customer.representative.name" src="https://primefaces.org/cdn/primeng/images/demo/avatar/{{ customer.representative.image }}" width="32" class="rounded-full" />
                            <span class="text-sm">{{ customer.representative.name }}</span>
                        </div>
                    </td>
                    <td>
                        {{ formatDate(customer.date) }}
                    </td>
                    <td>
                        <span class="font-semibold">{{ '$' + customer.balance.toLocaleString() }}</span>
                    </td>
                    <td>
                        <p-tag [value]="customer.status" [severity]="getSeverity(customer.status)" />
                    </td>
                    <td>
                        <div class="flex items-center gap-2">
                            <div class="flex-1 h-1.5 rounded-full bg-surface-200 dark:bg-surface-700 overflow-hidden">
                                <div class="h-full bg-primary-500 rounded-full" [style.width.%]="customer.activity"></div>
                            </div>
                            <span class="text-xs text-surface-500 dark:text-surface-400 tabular-nums">{{ customer.activity }}%</span>
                        </div>
                    </td>
                    <td>
                        @if (customer.verified) {
                            <p-tag value="Verified" severity="success" />
                        } @else {
                            <p-tag value="—" severity="secondary" />
                        }
                    </td>
                </tr>
            </ng-template>
            <ng-template #emptymessage>
                <tr>
                    <td colspan="8">No customers found.</td>
                </tr>
            </ng-template>
        </p-table>
    `,
    standalone: true,
    imports: [SelectModule, IconFieldModule, InputIconModule, MultiSelectModule, SliderModule, TableModule, TagModule, ButtonModule, InputTextModule, FormsModule, FilterSlash, Search],
    providers: [CustomerService],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TableFilterAdvancedDemo implements OnInit {
    customerService = inject(CustomerService);

    customers = signal<Customer[]>([]);

    representatives = signal<Representative[]>([]);

    statuses = signal<any[]>([]);

    loading = signal(true);

    searchValue: string = '';

    ngOnInit() {
        this.customerService.getCustomersLarge().then((customers) => {
            customers.forEach((customer: Customer) => (customer.date = new Date(customer.date as string)));
            this.customers.set(customers);
            this.loading.set(false);
        });
        this.representatives.set([
            { name: 'Amy Elsner', image: 'amyelsner.png' },
            { name: 'Anna Fali', image: 'annafali.png' },
            { name: 'Asiya Javayant', image: 'asiyajavayant.png' },
            { name: 'Bernardo Dominic', image: 'bernardodominic.png' },
            { name: 'Elwin Sharvill', image: 'elwinsharvill.png' },
            { name: 'Ioni Bowcher', image: 'ionibowcher.png' },
            { name: 'Ivan Magalhaes', image: 'ivanmagalhaes.png' },
            { name: 'Onyama Limba', image: 'onyamalimba.png' },
            { name: 'Stephen Shaw', image: 'stephenshaw.png' },
            { name: 'Xuxue Feng', image: 'xuxuefeng.png' }
        ]);
        this.statuses.set([
            { label: 'Unqualified', value: 'unqualified' },
            { label: 'Qualified', value: 'qualified' },
            { label: 'New', value: 'new' },
            { label: 'Negotiation', value: 'negotiation' },
            { label: 'Renewal', value: 'renewal' },
            { label: 'Proposal', value: 'proposal' }
        ]);
    }

    clear(table: Table) {
        table.clear();
        this.searchValue = '';
    }

    formatDate(date: Date) {
        if (!date) return '';

        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const year = date.getFullYear();

        return `${month}/${day}/${year}`;
    }

    getSeverity(status: string) {
        switch (status) {
            case 'unqualified':
                return 'danger';
            case 'qualified':
                return 'success';
            case 'new':
                return 'info';
            case 'negotiation':
                return 'warn';
            case 'renewal':
                return 'secondary';
            case 'proposal':
                return 'info';
        }
    }
}
```

## filterbasic-doc

Data filtering is enabled by defining the filters property referring to a DataTableFilterMeta instance. Each column to filter also requires filter to be enabled. Built-in filter element is a input field and using filterElement , it is possible to customize the filtering with your own UI. The optional global filtering searches the data against a single value that is bound to the global key of the filters object. The fields to search against is defined with the globalFilterFields .

```typescript
import { Component, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SelectModule } from 'primeng/select';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { InputTextModule } from 'primeng/inputtext';
import { Customer, Country } from '@/domain/customer';
import { Search } from '@primeicons/angular/search';

interface Customer {
    id: number;
    name: string;
    country: string;
    status: string;
    verified: boolean;
    balance: number;
}

@Component({
    template: `
        <div class="mb-3 flex justify-end">
            <p-iconfield iconPosition="left">
                <p-inputicon>
                    <svg data-p-icon="search" />
                </p-inputicon>
                <input pInputText pSize="small" type="text" (input)="dt.filterGlobal($event.target.value, 'contains')" placeholder="Keyword Search" />
            </p-iconfield>
        </div>
        <p-table #dt [value]="customers" dataKey="id" [globalFilterFields]="['name', 'country', 'status']" [tableStyle]="{ 'min-width': '50rem' }">
            <ng-template #header>
                <tr>
                    <th style="width: 25%">Name</th>
                    <th style="width: 20%">Country</th>
                    <th style="width: 20%">Status</th>
                    <th style="width: 20%">Balance</th>
                    <th style="width: 15%">Verified</th>
                </tr>
                <tr>
                    <th>
                        <p-column-filter type="text" field="name" [showMenu]="false" filterOn="input" [pt]="{ columnFilterFormElement: { class: 'p-fluid' } }">
                            <ng-template #filter let-value let-filter="filterCallback">
                                <input pInputText pSize="small" type="text" [value]="value || ''" (input)="filter($event.target.value)" placeholder="Search name..." />
                            </ng-template>
                        </p-column-filter>
                    </th>
                    <th>
                        <p-column-filter type="text" field="country" [showMenu]="false" filterOn="input" [pt]="{ columnFilterFormElement: { class: 'p-fluid' } }">
                            <ng-template #filter let-value let-filter="filterCallback">
                                <input pInputText pSize="small" type="text" [value]="value || ''" (input)="filter($event.target.value)" placeholder="Search country..." />
                            </ng-template>
                        </p-column-filter>
                    </th>
                    <th>
                        <p-column-filter field="status" matchMode="equals" [showMenu]="false">
                            <ng-template #filter let-value let-filter="filterCallback">
                                <p-select [ngModel]="value" [options]="statusOptions" (onChange)="filter($event.value || null)" placeholder="Any" optionLabel="label" optionValue="value" size="small" style="min-width: 12rem" appendTo="body">
                                </p-select>
                            </ng-template>
                        </p-column-filter>
                    </th>
                    <th></th>
                    <th></th>
                </tr>
            </ng-template>
            <ng-template #body let-customer>
                <tr>
                    <td>
                        <span class="font-medium">{{ customer.name }}</span>
                    </td>
                    <td>
                        {{ customer.country }}
                    </td>
                    <td>
                        <p-tag [value]="customer.status" [severity]="getSeverity(customer.status)" />
                    </td>
                    <td>
                        <span class="font-semibold">{{ '$' + customer.balance.toLocaleString() }}</span>
                    </td>
                    <td>
                        @if (customer.verified) {
                            <p-tag value="Verified" severity="success" />
                        } @else {
                            <p-tag value="—" severity="secondary" />
                        }
                    </td>
                </tr>
            </ng-template>
            <ng-template #emptymessage>
                <tr>
                    <td colspan="5">No customers found.</td>
                </tr>
            </ng-template>
        </p-table>
    `,
    standalone: true,
    imports: [SelectModule, IconFieldModule, InputIconModule, TableModule, TagModule, InputTextModule, FormsModule, Search],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TableFilterBasicDemo {
    customers = customers;

    statusOptions = statusOptions;

    getSeverity(status: string) {
        switch (status) {
            case 'unqualified':
                return 'danger';
            case 'qualified':
                return 'success';
            case 'new':
                return 'info';
            case 'negotiation':
                return 'warn';
            case 'renewal':
                return 'secondary';
        }
    }
}
```

## flexiblescroll-doc

scrollHeight="flex" lets the viewport grow and shrink with its flex parent — handy inside resizable dialogs or split layouts.

```typescript
import { Component, OnInit, inject, ChangeDetectionStrategy } from '@angular/core';
import { DialogModule } from 'primeng/dialog';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ButtonModule } from 'primeng/button';
import { CustomerService } from '@/service/customerservice';
import { Customer, Country } from '@/domain/customer';

@Component({
    template: `
        <div class="flex justify-center">
            <button type="button" (click)="showDialog()" pButton>Show Flex Scroll</button>
        </div>
        <p-dialog header="Flex Scroll" [resizable]="false" [modal]="true" [maximizable]="true" appendTo="body" [(visible)]="dialogVisible" [style]="{ width: '75vw' }" [contentStyle]="{ height: '300px' }">
            <p-table [value]="customers" [scrollable]="true" scrollHeight="flex" [tableStyle]="{ 'min-width': '50rem' }">
                <ng-template #header>
                    <tr>
                        <th>Name</th>
                        <th>Country</th>
                        <th>Status</th>
                        <th>Balance</th>
                    </tr>
                </ng-template>
                <ng-template #body let-customer>
                    <tr>
                        <td>
                            <span class="font-medium">{{ customer.name }}</span>
                        </td>
                        <td>{{ customer.country.name }}</td>
                        <td>
                            <p-tag [value]="customer.status" [severity]="getSeverity(customer.status)" />
                        </td>
                        <td>
                            <span class="font-semibold">{{ '$' + customer.balance.toLocaleString() }}</span>
                        </td>
                    </tr>
                </ng-template>
            </p-table>
        </p-dialog>
    `,
    standalone: true,
    imports: [DialogModule, TableModule, TagModule, ButtonModule],
    providers: [CustomerService],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TableFlexibleScrollDemo implements OnInit {
    private customerService = inject(CustomerService);

    customers!: Customer[];

    dialogVisible: boolean = false;

    ngOnInit() {
        this.customerService.getCustomersMedium().then((data) => {
            this.customers = data;
        });
    }

    showDialog() {
        this.dialogVisible = true;
    }

    getSeverity(status: string) {
        switch (status) {
            case 'qualified':
                return 'success';
            case 'unqualified':
                return 'danger';
            case 'negotiation':
                return 'warn';
            case 'new':
                return 'info';
            case 'renewal':
                return 'secondary';
            case 'proposal':
                return 'info';
            default:
                return 'secondary';
        }
    }
}
```

## frozencolumns-doc

Certain columns can be frozen by using the pFrozenColumn directive. In addition, alignFrozen is available to define whether the column should be fixed on the left or right.

```typescript
import { Component, OnInit, inject, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToggleButtonModule } from 'primeng/togglebutton';
import { CustomerService } from '@/service/customerservice';
import { Customer, Representative, Country } from '@/domain/customer';

@Component({
    template: `
        <div class="mb-3">
            <p-togglebutton [(ngModel)]="balanceFrozen" [onIcon]="'pi pi-lock-open'" offIcon="pi pi-lock" [onLabel]="'Balance'" offLabel="Balance" />
        </div>
        <p-table [value]="customers" [scrollable]="true" scrollHeight="400px">
            <ng-template #header>
                <tr>
                    <th style="min-width: 200px" pFrozenColumn>Name</th>
                    <th style="min-width: 100px">Id</th>
                    <th style="min-width: 200px">Company</th>
                    <th style="min-width: 200px">Country</th>
                    <th style="min-width: 200px">Date</th>
                    <th style="min-width: 200px">Status</th>
                    <th style="min-width: 200px">Activity</th>
                    <th style="min-width: 200px">Representative</th>
                    <th style="min-width: 200px" alignFrozen="right" pFrozenColumn [frozen]="balanceFrozen">Balance</th>
                </tr>
            </ng-template>
            <ng-template #body let-customer>
                <tr>
                    <td pFrozenColumn>
                        <span class="font-semibold">{{ customer.name }}</span>
                    </td>
                    <td>{{ customer.id }}</td>
                    <td>{{ customer.company }}</td>
                    <td>
                        <div class="flex items-center gap-2">
                            <img src="https://primefaces.org/cdn/primeng/images/demo/flag/flag_placeholder.png" [class]="'flag flag-' + customer.country.code" style="width: 20px" />
                            <span>{{ customer.country.name }}</span>
                        </div>
                    </td>
                    <td>{{ customer.date }}</td>
                    <td>
                        <p-tag [value]="customer.status" [severity]="getSeverity(customer.status)" />
                    </td>
                    <td>{{ customer.activity }}%</td>
                    <td>{{ customer.representative.name }}</td>
                    <td alignFrozen="right" pFrozenColumn [frozen]="balanceFrozen">
                        <span class="font-semibold">{{ '$' + customer.balance.toLocaleString() }}</span>
                    </td>
                </tr>
            </ng-template>
        </p-table>
    `,
    standalone: true,
    imports: [TableModule, TagModule, ToggleButtonModule, FormsModule],
    providers: [CustomerService],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TableFrozenColumnsDemo implements OnInit {
    private customerService = inject(CustomerService);

    private cd = inject(ChangeDetectorRef);

    balanceFrozen: boolean = false;

    customers!: Customer[];

    ngOnInit() {
        this.customerService.getCustomersMedium().then((data) => {
            this.customers = data;
        });
    }

    getSeverity(status: string) {
        switch (status) {
            case 'qualified':
                return 'success';
            case 'unqualified':
                return 'danger';
            case 'negotiation':
                return 'warn';
            case 'new':
                return 'info';
            case 'renewal':
                return 'secondary';
            case 'proposal':
                return 'info';
            default:
                return 'secondary';
        }
    }
}
```

## frozencolumnsmultiple-doc

Multiple columns can be frozen on either side of the table. Enable the pFrozenColumn directive on each column to pin it during horizontal scroll and use alignFrozen to fix a column to the left (default) or the right edge.

```typescript
import { Component, OnInit, inject, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { CustomerService } from '@/service/customerservice';
import { Customer, Representative, Country } from '@/domain/customer';

@Component({
    template: `
        <p-table [value]="customers" [scrollable]="true" scrollHeight="400px">
            <ng-template #header>
                <tr>
                    <th style="min-width: 80px" pFrozenColumn>Id</th>
                    <th style="min-width: 200px" pFrozenColumn>Name</th>
                    <th style="min-width: 200px" pFrozenColumn>Country</th>
                    <th style="min-width: 220px">Company</th>
                    <th style="min-width: 200px">Representative</th>
                    <th style="min-width: 200px">Date</th>
                    <th style="min-width: 200px">Activity</th>
                    <th style="min-width: 200px">Status</th>
                    <th style="min-width: 180px" alignFrozen="right" pFrozenColumn>Balance</th>
                </tr>
            </ng-template>
            <ng-template #body let-customer>
                <tr>
                    <td pFrozenColumn>
                        <span class="text-xs text-surface-500 dark:text-surface-400 tabular-nums">#{{ customer.id }}</span>
                    </td>
                    <td pFrozenColumn>
                        <span class="font-semibold">{{ customer.name }}</span>
                    </td>
                    <td pFrozenColumn>
                        <div class="flex items-center gap-2">
                            <img src="https://primefaces.org/cdn/primeng/images/demo/flag/flag_placeholder.png" [class]="'flag flag-' + customer.country.code" style="width: 20px" />
                            <span>{{ customer.country.name }}</span>
                        </div>
                    </td>
                    <td>{{ customer.company }}</td>
                    <td>{{ customer.representative.name }}</td>
                    <td>{{ customer.date }}</td>
                    <td>{{ customer.activity }}%</td>
                    <td>
                        <p-tag [value]="customer.status" [severity]="getSeverity(customer.status)" />
                    </td>
                    <td alignFrozen="right" pFrozenColumn>
                        <span class="font-semibold">{{ formatCurrency(customer.balance) }}</span>
                    </td>
                </tr>
            </ng-template>
        </p-table>
    `,
    standalone: true,
    imports: [TableModule, TagModule],
    providers: [CustomerService],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TableFrozenColumnsMultipleDemo implements OnInit {
    private customerService = inject(CustomerService);

    private cd = inject(ChangeDetectorRef);

    customers!: Customer[];

    ngOnInit() {
        this.customerService.getCustomersMedium().then((data) => {
            this.customers = data;
        });
    }

    formatCurrency(value: number) {
        return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
    }

    getSeverity(status: string) {
        switch (status) {
            case 'qualified':
                return 'success';
            case 'unqualified':
                return 'danger';
            case 'negotiation':
                return 'warn';
            case 'new':
                return 'info';
            case 'renewal':
                return 'secondary';
            case 'proposal':
                return 'info';
            default:
                return 'secondary';
        }
    }
}
```

## frozenrows-doc

Frozen rows are used to fix certain rows while scrolling, this data is defined with the frozenValue property.

```typescript
import { Component, OnInit, inject, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ButtonModule } from 'primeng/button';
import { CustomerService } from '@/service/customerservice';
import { Customer, Representative, Country } from '@/domain/customer';
import { LockOpen } from '@primeicons/angular/lock-open';
import { Lock } from '@primeicons/angular/lock';

@Component({
    template: `
        <p-table [value]="unlockedCustomers" [frozenValue]="lockedCustomers" [scrollable]="true" scrollHeight="400px" [tableStyle]="{ 'min-width': '50rem' }">
            <ng-template #header>
                <tr>
                    <th>Name</th>
                    <th>Country</th>
                    <th>Representative</th>
                    <th>Status</th>
                    <th style="width: 4rem"></th>
                </tr>
            </ng-template>
            <ng-template #frozenbody let-customer let-index="rowIndex">
                <tr>
                    <td>
                        <span class="font-semibold">{{ customer.name }}</span>
                    </td>
                    <td>
                        <div class="flex items-center gap-2">
                            <img src="https://primefaces.org/cdn/primeng/images/demo/flag/flag_placeholder.png" [class]="'flag flag-' + customer.country.code" style="width: 20px" />
                            <span>{{ customer.country.name }}</span>
                        </div>
                    </td>
                    <td>{{ customer.representative.name }}</td>
                    <td>
                        <p-tag [value]="customer.status" [severity]="getSeverity(customer.status)" />
                    </td>
                    <td>
                        <button pButton type="button" (click)="toggleLock(customer, true, index)" variant="text" severity="secondary" iconOnly aria-label="Unlock row">
                            <svg data-p-icon="lock-open" />
                        </button>
                    </td>
                </tr>
            </ng-template>
            <ng-template #body let-customer let-index="rowIndex">
                <tr>
                    <td>
                        <span class="font-medium">{{ customer.name }}</span>
                    </td>
                    <td>
                        <div class="flex items-center gap-2">
                            <img src="https://primefaces.org/cdn/primeng/images/demo/flag/flag_placeholder.png" [class]="'flag flag-' + customer.country.code" style="width: 20px" />
                            <span>{{ customer.country.name }}</span>
                        </div>
                    </td>
                    <td>{{ customer.representative.name }}</td>
                    <td>
                        <p-tag [value]="customer.status" [severity]="getSeverity(customer.status)" />
                    </td>
                    <td>
                        <button pButton iconOnly type="button" [disabled]="lockedCustomers.length >= 2" (click)="toggleLock(customer, false, index)" variant="text" severity="secondary" iconOnly aria-label="Lock row">
                            <svg data-p-icon="lock" />
                        </button>
                    </td>
                </tr>
            </ng-template>
        </p-table>
    `,
    standalone: true,
    imports: [TableModule, TagModule, ButtonModule, LockOpen, Lock],
    providers: [CustomerService],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TableFrozenRowsDemo implements OnInit {
    private customerService = inject(CustomerService);

    private cd = inject(ChangeDetectorRef);

    unlockedCustomers!: Customer[];

    lockedCustomers!: Customer[];

    ngOnInit() {
        this.customerService.getCustomersMedium().then((data) => {
            this.lockedCustomers = [data[0]];
            this.unlockedCustomers = data.slice(1);
        });
    }

    toggleLock(data: Customer, frozen: boolean, index: number) {
        if (frozen) {
            this.lockedCustomers = this.lockedCustomers.filter((c, i) => i !== index);
            this.unlockedCustomers.push(data);
        } else {
            this.unlockedCustomers = this.unlockedCustomers.filter((c, i) => i !== index);
            this.lockedCustomers.push(data);
        }

        this.unlockedCustomers.sort((val1, val2) => (val1.id! < val2.id! ? -1 : 1));
    }

    getSeverity(status: string) {
        switch (status) {
            case 'qualified':
                return 'success';
            case 'unqualified':
                return 'danger';
            case 'negotiation':
                return 'warn';
            case 'new':
                return 'info';
            case 'renewal':
                return 'secondary';
            case 'proposal':
                return 'info';
            default:
                return 'secondary';
        }
    }
}
```

## Grid Lines

Enabling showGridlines displays borders between cells.

```typescript
import { Component, OnInit, inject, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { AvatarModule } from 'primeng/avatar';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { CustomerService } from '@/service/customerservice';
import { Customer, Representative, Country } from '@/domain/customer';

@Component({
    template: `
        <p-table [value]="customers" showGridlines [tableStyle]="{ 'min-width': '50rem' }">
            <ng-template #header>
                <tr>
                    <th>Name</th>
                    <th>Country</th>
                    <th>Representative</th>
                    <th>Status</th>
                    <th>Balance</th>
                </tr>
            </ng-template>
            <ng-template #body let-customer>
                <tr>
                    <td>
                        <span class="font-medium">{{ customer.name }}</span>
                    </td>
                    <td>
                        <div class="flex items-center gap-2">
                            <img src="https://primefaces.org/cdn/primeng/images/demo/flag/flag_placeholder.png" [class]="'flag flag-' + customer.country.code" style="width: 20px" />
                            <span>{{ customer.country.name }}</span>
                        </div>
                    </td>
                    <td>
                        <div class="flex items-center gap-2">
                            <p-avatar [image]="'https://primefaces.org/cdn/primevue/images/avatar/' + customer.representative.image" shape="circle" />
                            <span class="text-sm">{{ customer.representative.name }}</span>
                        </div>
                    </td>
                    <td>
                        <p-tag [value]="customer.status" [severity]="getSeverity(customer.status)" />
                    </td>
                    <td>
                        <span class="font-semibold">{{ '$' + customer.balance.toLocaleString() }}</span>
                    </td>
                </tr>
            </ng-template>
        </p-table>
    `,
    standalone: true,
    imports: [AvatarModule, TableModule, TagModule],
    providers: [CustomerService],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TableGridLinesDemo implements OnInit {
    private customerService = inject(CustomerService);

    private cd = inject(ChangeDetectorRef);

    customers!: Customer[];

    ngOnInit() {
        this.customerService.getCustomersSmall().then((data) => {
            this.customers = data.slice(0, 6);
        });
    }

    getSeverity(status: string) {
        switch (status) {
            case 'qualified':
                return 'success';
            case 'unqualified':
                return 'danger';
            case 'negotiation':
                return 'warn';
            case 'new':
                return 'info';
            case 'renewal':
                return 'secondary';
            case 'proposal':
                return 'info';
            default:
                return 'secondary';
        }
    }
}
```

## horizontalscroll-doc

When the combined column widths exceed the container, the table scrolls horizontally. Give each column a minWidth so the columns don't squeeze.

```typescript
import { Component, OnInit, inject, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { CustomerService } from '@/service/customerservice';
import { Customer, Representative, Country } from '@/domain/customer';

@Component({
    template: `
        <p-table [value]="customers" [scrollable]="true" scrollHeight="400px">
            <ng-template #header>
                <tr>
                    <th style="min-width: 6rem">Id</th>
                    <th style="min-width: 14rem">Name</th>
                    <th style="min-width: 14rem">Country</th>
                    <th style="min-width: 12rem">Date</th>
                    <th style="min-width: 10rem">Balance</th>
                    <th style="min-width: 14rem">Company</th>
                    <th style="min-width: 10rem">Status</th>
                    <th style="min-width: 8rem">Activity</th>
                    <th style="min-width: 14rem">Representative</th>
                </tr>
            </ng-template>
            <ng-template #body let-customer>
                <tr>
                    <td>{{ customer.id }}</td>
                    <td>
                        <span class="font-medium">{{ customer.name }}</span>
                    </td>
                    <td>{{ customer.country.name }}</td>
                    <td>{{ customer.date }}</td>
                    <td>
                        <span class="font-semibold">{{ '$' + customer.balance.toLocaleString() }}</span>
                    </td>
                    <td>{{ customer.company }}</td>
                    <td>
                        <p-tag [value]="customer.status" [severity]="getSeverity(customer.status)" />
                    </td>
                    <td>{{ customer.activity }}%</td>
                    <td>{{ customer.representative.name }}</td>
                </tr>
            </ng-template>
        </p-table>
    `,
    standalone: true,
    imports: [TableModule, TagModule],
    providers: [CustomerService],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TableHorizontalScrollDemo implements OnInit {
    private customerService = inject(CustomerService);

    private cd = inject(ChangeDetectorRef);

    customers!: Customer[];

    ngOnInit() {
        this.customerService.getCustomersMedium().then((data) => {
            this.customers = data;
        });
    }

    getSeverity(status: string) {
        switch (status) {
            case 'qualified':
                return 'success';
            case 'unqualified':
                return 'danger';
            case 'negotiation':
                return 'warn';
            case 'new':
                return 'info';
            case 'renewal':
                return 'secondary';
            case 'proposal':
                return 'info';
            default:
                return 'secondary';
        }
    }
}
```

## keyboard-doc

Arrow Up/Down moves focus between rows, Space or Enter toggles the focused row, and Shift + Arrow extends a range. Paired with selectionMode multiple and metaKeySelection , the whole flow is keyboard-driven.

```typescript
import { Component, OnInit, inject, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { BadgeModule } from 'primeng/badge';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ProductService } from '@/service/productservice';
import { Product } from '@/domain/product';

@Component({
    template: `
        <div class="flex items-center justify-between gap-3 mb-3 p-3 rounded-md border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900">
            <span class="text-sm text-surface-500 dark:text-surface-400">
                <kbd class="px-1.5 py-0.5 text-xs rounded bg-surface-200 dark:bg-surface-700">&uarr;</kbd>&nbsp;<kbd class="px-1.5 py-0.5 text-xs rounded bg-surface-200 dark:bg-surface-700">&darr;</kbd> navigate,
                <kbd class="px-1.5 py-0.5 text-xs rounded bg-surface-200 dark:bg-surface-700">Space</kbd> /&nbsp;<kbd class="px-1.5 py-0.5 text-xs rounded bg-surface-200 dark:bg-surface-700">Enter</kbd> select,
                <kbd class="px-1.5 py-0.5 text-xs rounded bg-surface-200 dark:bg-surface-700">Shift + &uarr;&darr;</kbd> range
            </span>
            <div class="flex items-center gap-2">
                <span class="text-sm font-medium">Selected</span>
                <p-badge [value]="selectedProducts.length.toString()" [severity]="selectedProducts.length ? 'info' : 'secondary'" />
            </div>
        </div>
        <p-table [value]="products" selectionMode="multiple" [(selection)]="selectedProducts" [metaKeySelection]="true" dataKey="id" [tableStyle]="{ 'min-width': '50rem' }">
            <ng-template #header>
                <tr>
                    <th>Product</th>
                    <th>Category</th>
                    <th>Qty</th>
                    <th>Price</th>
                    <th>Status</th>
                </tr>
            </ng-template>
            <ng-template #body let-product let-rowIndex="rowIndex">
                <tr [pSelectableRow]="product" [pSelectableRowIndex]="rowIndex">
                    <td>
                        <div class="flex items-center gap-3">
                            <img [src]="'https://primefaces.org/cdn/primevue/images/product/' + product.image" [alt]="product.name" width="36" height="36" class="rounded-md shadow" />
                            <span class="font-medium">{{ product.name }}</span>
                        </div>
                    </td>
                    <td>
                        <p-tag [value]="product.category" severity="secondary" />
                    </td>
                    <td>{{ product.quantity }}</td>
                    <td>
                        <span class="font-semibold">{{ '$' + product.price }}</span>
                    </td>
                    <td>
                        <p-tag [value]="getSeverityLabel(product.inventoryStatus)" [severity]="getSeverity(product.inventoryStatus)" />
                    </td>
                </tr>
            </ng-template>
        </p-table>
    `,
    standalone: true,
    imports: [BadgeModule, TableModule, TagModule],
    providers: [ProductService],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TableKeyboardDemo implements OnInit {
    private productService = inject(ProductService);

    private cd = inject(ChangeDetectorRef);

    products!: Product[];

    selectedProducts: Product[] = [];

    ngOnInit() {
        this.productService.getProductsSmall().then((data) => {
            this.products = data.slice(0, 8);
        });
    }

    getSeverity(status: string) {
        switch (status) {
            case 'INSTOCK':
                return 'success';
            case 'LOWSTOCK':
                return 'warn';
            case 'OUTOFSTOCK':
                return 'danger';
            default:
                return 'secondary';
        }
    }

    getSeverityLabel(status: string) {
        switch (status) {
            case 'INSTOCK':
                return 'In Stock';
            case 'LOWSTOCK':
                return 'Low Stock';
            case 'OUTOFSTOCK':
                return 'Out of Stock';
            default:
                return status;
        }
    }
}
```

## loadingmask-doc

Set the loading prop to display a mask layer over the table while data is being fetched.

```typescript
import { Component, OnInit, inject, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ButtonModule } from 'primeng/button';
import { ProductService } from '@/service/productservice';
import { Product } from '@/domain/product';
import { Refresh } from '@primeicons/angular/refresh';
import { Spinner } from '@primeicons/angular/spinner';

@Component({
    template: `
        <div class="mb-3 flex items-center justify-between gap-3">
            <span class="text-sm text-surface-500 dark:text-surface-400">Click refresh to simulate a network fetch.</span>
            <button type="button" pButton size="small" (click)="refresh()" [disabled]="loading">
                <svg data-p-icon="refresh" />
                Refresh
            </button>
        </div>
        <p-table [value]="products" [loading]="loading" [pt]="{ loadingIcon: { class: 'w-auto! h-auto!' } }" [tableStyle]="{ 'min-width': '50rem' }">
            <ng-template #loadingicon>
                <div class="flex flex-col items-center gap-2">
                    <svg data-p-icon="spinner" [size]="40" class="animate-spin text-primary" />
                    <span class="text-sm text-surface-600 dark:text-surface-300">Loading products…</span>
                </div>
            </ng-template>
            <ng-template #header>
                <tr>
                    <th>Product</th>
                    <th>Category</th>
                    <th>Price</th>
                    <th>Status</th>
                </tr>
            </ng-template>
            <ng-template #body let-product>
                <tr>
                    <td>
                        <div class="flex items-center gap-3">
                            <img [src]="'https://primefaces.org/cdn/primeng/images/demo/product/' + product.image" [alt]="product.name" width="40" height="40" class="rounded-md shadow" />
                            <div class="flex flex-col">
                                <span class="font-medium">{{ product.name }}</span>
                                <span class="text-xs text-surface-500 dark:text-surface-400">{{ product.code }}</span>
                            </div>
                        </div>
                    </td>
                    <td>
                        <p-tag [value]="product.category" severity="secondary" />
                    </td>
                    <td>
                        <span class="font-semibold">{{ '$' + product.price }}</span>
                    </td>
                    <td>
                        <p-tag [value]="getSeverityLabel(product.inventoryStatus)" [severity]="getSeverity(product.inventoryStatus)" />
                    </td>
                </tr>
            </ng-template>
        </p-table>
    `,
    standalone: true,
    imports: [TableModule, TagModule, ButtonModule, Refresh, Spinner],
    providers: [ProductService],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TableLoadingMaskDemo implements OnInit {
    private productService = inject(ProductService);

    private cd = inject(ChangeDetectorRef);

    products!: Product[];

    loading: boolean = false;

    ngOnInit() {
        this.refresh();
    }

    refresh() {
        this.loading = true;
        this.cd.markForCheck();
        setTimeout(() => {
            this.productService.getProductsSmall().then((data) => {
                this.products = data.slice(0, 6);
                this.loading = false;
                this.cd.markForCheck();
            });
        }, 1500);
    }

    getSeverity(status: string) {
        switch (status) {
            case 'INSTOCK':
                return 'success';
            case 'LOWSTOCK':
                return 'warn';
            case 'OUTOFSTOCK':
                return 'danger';
        }
    }

    getSeverityLabel(status: string) {
        switch (status) {
            case 'INSTOCK':
                return 'In Stock';
            case 'LOWSTOCK':
                return 'Low Stock';
            case 'OUTOFSTOCK':
                return 'Out of Stock';
            default:
                return status;
        }
    }
}
```

## loadingskeleton-doc

Render placeholder rows filled with Skeleton elements while the request is in flight.

```typescript
import { Component, OnInit, inject, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { SkeletonModule } from 'primeng/skeleton';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ButtonModule } from 'primeng/button';
import { ProductService } from '@/service/productservice';
import { Product } from '@/domain/product';
import { Refresh } from '@primeicons/angular/refresh';

@Component({
    template: `
        <div class="mb-3 flex items-center justify-between gap-3">
            <span class="text-sm text-surface-500 dark:text-surface-400">Click refresh to simulate a network fetch.</span>
            <button type="button" pButton size="small" (click)="refresh()" [disabled]="loading">
                <svg data-p-icon="refresh" />
                Refresh
            </button>
        </div>
        <p-table [value]="rows" [tableStyle]="{ 'min-width': '50rem' }">
            <ng-template #header>
                <tr>
                    <th style="width: 40%">Product</th>
                    <th style="width: 20%">Category</th>
                    <th style="width: 15%">Price</th>
                    <th style="width: 25%">Status</th>
                </tr>
            </ng-template>
            <ng-template #body let-item>
                <tr>
                    @if (loading) {
                        <td>
                            <div class="flex items-center gap-3">
                                <p-skeleton width="40px" height="40px" borderRadius="6px" />
                                <div class="flex flex-col gap-1">
                                    <p-skeleton width="8rem" height="0.6rem" borderRadius="4px" />
                                    <p-skeleton width="5rem" height="0.55rem" borderRadius="4px" />
                                </div>
                            </div>
                        </td>
                        <td><p-skeleton width="5rem" height="1rem" borderRadius="16px" /></td>
                        <td><p-skeleton width="3rem" height="0.6rem" borderRadius="4px" /></td>
                        <td><p-skeleton width="6rem" height="1rem" borderRadius="16px" /></td>
                    } @else {
                        <td>
                            <div class="flex items-center gap-3">
                                <img [src]="'https://primefaces.org/cdn/primeng/images/demo/product/' + item.image" [alt]="item.name" width="40" height="40" class="rounded-md shadow" />
                                <div class="flex flex-col">
                                    <span class="font-medium">{{ item.name }}</span>
                                    <span class="text-xs text-surface-500 dark:text-surface-400">{{ item.code }}</span>
                                </div>
                            </div>
                        </td>
                        <td>
                            <p-tag [value]="item.category" severity="secondary" />
                        </td>
                        <td>
                            <span class="font-semibold">{{ '$' + item.price }}</span>
                        </td>
                        <td>
                            <p-tag [value]="getSeverityLabel(item.inventoryStatus)" [severity]="getSeverity(item.inventoryStatus)" />
                        </td>
                    }
                </tr>
            </ng-template>
        </p-table>
    `,
    standalone: true,
    imports: [SkeletonModule, TableModule, TagModule, ButtonModule, Refresh],
    providers: [ProductService],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TableLoadingSkeletonDemo implements OnInit {
    private productService = inject(ProductService);

    private cd = inject(ChangeDetectorRef);

    products!: Product[];

    placeholders = Array.from({ length: 6 }, (_, i) => ({ id: i.toString() }));

    loading: boolean = false;

    ngOnInit() {
        this.refresh();
    }

    get rows(): any[] {
        return this.loading ? this.placeholders : this.products;
    }

    refresh() {
        this.loading = true;
        this.products = [];
        this.cd.markForCheck();
        setTimeout(() => {
            this.productService.getProductsSmall().then((data) => {
                this.products = data.slice(0, 6);
                this.loading = false;
                this.cd.markForCheck();
            });
        }, 1500);
    }

    getSeverity(status: string) {
        switch (status) {
            case 'INSTOCK':
                return 'success';
            case 'LOWSTOCK':
                return 'warn';
            case 'OUTOFSTOCK':
                return 'danger';
        }
    }

    getSeverityLabel(status: string) {
        switch (status) {
            case 'INSTOCK':
                return 'In Stock';
            case 'LOWSTOCK':
                return 'Low Stock';
            case 'OUTOFSTOCK':
                return 'Out of Stock';
            default:
                return status;
        }
    }
}
```

## multiplecolumnssort-doc

Hold Ctrl/Cmd and click multiple column headers to sort by several fields at once. Set sortMode to multiple to enable.

```typescript
import { Component, OnInit, inject, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ProductService } from '@/service/productservice';
import { Product } from '@/domain/product';

@Component({
    template: `
        <p-table [value]="products" sortMode="multiple" removableSort [tableStyle]="{ 'min-width': '50rem' }">
            <ng-template #header>
                <tr>
                    <th pSortableColumn="name">
                        <div class="flex items-center gap-2">
                            Product
                            <p-sort-icon field="name" />
                        </div>
                    </th>
                    <th pSortableColumn="category">
                        <div class="flex items-center gap-2">
                            Category
                            <p-sort-icon field="category" />
                        </div>
                    </th>
                    <th pSortableColumn="quantity">
                        <div class="flex items-center gap-2">
                            Quantity
                            <p-sort-icon field="quantity" />
                        </div>
                    </th>
                    <th pSortableColumn="price">
                        <div class="flex items-center gap-2">
                            Price
                            <p-sort-icon field="price" />
                        </div>
                    </th>
                    <th pSortableColumn="inventoryStatus">
                        <div class="flex items-center gap-2">
                            Status
                            <p-sort-icon field="inventoryStatus" />
                        </div>
                    </th>
                </tr>
            </ng-template>
            <ng-template #body let-product>
                <tr>
                    <td>
                        <div class="flex items-center gap-3">
                            <img [src]="'https://primefaces.org/cdn/primevue/images/product/' + product.image" [alt]="product.name" class="w-10 rounded-md shadow" />
                            <div class="flex flex-col">
                                <span class="font-medium">{{ product.name }}</span>
                                <span class="text-xs text-surface-500 dark:text-surface-400">{{ product.code }}</span>
                            </div>
                        </div>
                    </td>
                    <td>
                        <p-tag [value]="product.category" severity="secondary" />
                    </td>
                    <td>{{ product.quantity }}</td>
                    <td>
                        <span class="font-semibold">{{ '$' + product.price }}</span>
                    </td>
                    <td>
                        <p-tag [value]="getSeverityLabel(product.inventoryStatus)" [severity]="getSeverity(product.inventoryStatus)" />
                    </td>
                </tr>
            </ng-template>
        </p-table>
    `,
    standalone: true,
    imports: [TableModule, TagModule],
    providers: [ProductService],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TableMultipleColumnsSortDemo implements OnInit {
    private productService = inject(ProductService);

    private cd = inject(ChangeDetectorRef);

    products!: Product[];

    ngOnInit() {
        this.productService.getProductsSmall().then((data) => {
            this.products = data.slice(0, 10);
        });
    }

    getSeverity(status: string) {
        switch (status) {
            case 'INSTOCK':
                return 'success';
            case 'LOWSTOCK':
                return 'warn';
            case 'OUTOFSTOCK':
                return 'danger';
            default:
                return 'secondary';
        }
    }

    getSeverityLabel(status: string) {
        switch (status) {
            case 'INSTOCK':
                return 'In Stock';
            case 'LOWSTOCK':
                return 'Low Stock';
            case 'OUTOFSTOCK':
                return 'Out of Stock';
            default:
                return status;
        }
    }
}
```

## multipleselection-doc

Multiple rows without a dedicated column. Pair with metaKeySelection so Ctrl/Cmd + Click toggles rows and Shift + Click selects a range; a plain click still replaces the selection.

```typescript
import { Component, OnInit, inject, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { BadgeModule } from 'primeng/badge';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ButtonModule } from 'primeng/button';
import { ProductService } from '@/service/productservice';
import { Product } from '@/domain/product';
import { Trash } from '@primeicons/angular/trash';
import { ShoppingCart } from '@primeicons/angular/shopping-cart';

@Component({
    template: `
        <div class="flex flex-wrap items-center justify-between gap-3 mb-3 p-3 rounded-md border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900">
            <div class="flex flex-wrap items-center gap-2">
                <span class="font-medium text-sm">Selected</span>
                <p-badge [value]="selectedProducts.length.toString()" [severity]="selectedProducts.length ? 'info' : 'secondary'" />
                @if (selectedProducts.length > 0) {
                    <span class="text-xs text-surface-500 dark:text-surface-400">
                        Total <span class="font-semibold text-surface-900 dark:text-surface-0">{{ '$' + totalValue }}</span>
                    </span>
                }
            </div>
            <div class="flex flex-wrap items-center gap-2">
                <button pButton severity="danger" size="small" variant="outlined" [disabled]="!selectedProducts.length">
                    <svg data-p-icon="trash" />
                    Delete
                </button>
                <button pButton size="small" [disabled]="!selectedProducts.length">
                    <svg data-p-icon="shopping-cart" />
                    Add to cart
                </button>
            </div>
        </div>
        <p class="mb-2 text-xs text-surface-500 dark:text-surface-400">Click to replace the selection. Ctrl/Cmd + Click to toggle a row, Shift + Click to select a range.</p>
        <p-table [value]="products" selectionMode="multiple" [(selection)]="selectedProducts" [metaKeySelection]="true" dataKey="id" [tableStyle]="{ 'min-width': '50rem' }">
            <ng-template #header>
                <tr>
                    <th>Product</th>
                    <th>Category</th>
                    <th>Qty</th>
                    <th>Price</th>
                    <th>Status</th>
                </tr>
            </ng-template>
            <ng-template #body let-product let-rowIndex="rowIndex">
                <tr [pSelectableRow]="product" [pSelectableRowIndex]="rowIndex">
                    <td>
                        <div class="flex items-center gap-3">
                            <img [src]="'https://primefaces.org/cdn/primevue/images/product/' + product.image" [alt]="product.name" class="w-10 rounded-md shadow" />
                            <div class="flex flex-col">
                                <span class="font-medium">{{ product.name }}</span>
                                <span class="text-xs text-surface-500 dark:text-surface-400">{{ product.code }}</span>
                            </div>
                        </div>
                    </td>
                    <td>
                        <p-tag [value]="product.category" severity="secondary" />
                    </td>
                    <td>{{ product.quantity }}</td>
                    <td>
                        <span class="font-semibold">{{ '$' + product.price }}</span>
                    </td>
                    <td>
                        <p-tag [value]="getSeverityLabel(product.inventoryStatus)" [severity]="getSeverity(product.inventoryStatus)" />
                    </td>
                </tr>
            </ng-template>
        </p-table>
    `,
    standalone: true,
    imports: [BadgeModule, TableModule, TagModule, ButtonModule, Trash, ShoppingCart],
    providers: [ProductService],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TableMultipleSelectionDemo implements OnInit {
    private productService = inject(ProductService);

    private cd = inject(ChangeDetectorRef);

    products!: Product[];

    selectedProducts: Product[] = [];

    ngOnInit() {
        this.productService.getProductsSmall().then((data) => {
            this.products = data.slice(0, 8);
        });
    }

    get totalValue(): number {
        return this.selectedProducts.reduce((sum, p) => sum + p.price, 0);
    }

    getSeverity(status: string) {
        switch (status) {
            case 'INSTOCK':
                return 'success';
            case 'LOWSTOCK':
                return 'warn';
            case 'OUTOFSTOCK':
                return 'danger';
            default:
                return 'secondary';
        }
    }

    getSeverityLabel(status: string) {
        switch (status) {
            case 'INSTOCK':
                return 'In Stock';
            case 'LOWSTOCK':
                return 'Low Stock';
            case 'OUTOFSTOCK':
                return 'Out of Stock';
            default:
                return status;
        }
    }
}
```

## paginatorbasic-doc

Pagination is enabled by setting paginator property to true and defining a rows property to specify the number of rows per page.

```typescript
import { Component, OnInit, inject, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ProductService } from '@/service/productservice';
import { Product } from '@/domain/product';

@Component({
    template: `
        <p-table [value]="products" [paginator]="true" [rows]="5" [rowsPerPageOptions]="[5, 10, 20]" [tableStyle]="{ 'min-width': '50rem' }">
            <ng-template #header>
                <tr>
                    <th style="width: 30%">Product</th>
                    <th style="width: 20%">Category</th>
                    <th style="width: 10%">Qty</th>
                    <th style="width: 10%">Price</th>
                    <th style="width: 20%">Status</th>
                </tr>
            </ng-template>
            <ng-template #body let-product>
                <tr>
                    <td>
                        <div class="flex items-center gap-3">
                            <img [src]="'https://primefaces.org/cdn/primevue/images/product/' + product.image" [alt]="product.name" class="w-10 rounded-md shadow" />
                            <div class="flex flex-col">
                                <span class="font-medium">{{ product.name }}</span>
                                <span class="text-xs text-surface-500 dark:text-surface-400">{{ product.code }}</span>
                            </div>
                        </div>
                    </td>
                    <td>
                        <p-tag [value]="product.category" severity="secondary" />
                    </td>
                    <td>{{ product.quantity }}</td>
                    <td>
                        <span class="font-semibold">{{ '$' + product.price }}</span>
                    </td>
                    <td>
                        <p-tag [value]="getSeverityLabel(product.inventoryStatus)" [severity]="getSeverity(product.inventoryStatus)" />
                    </td>
                </tr>
            </ng-template>
        </p-table>
    `,
    standalone: true,
    imports: [TableModule, TagModule],
    providers: [ProductService],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TablePaginatorBasicDemo implements OnInit {
    private productService = inject(ProductService);

    private cd = inject(ChangeDetectorRef);

    products!: Product[];

    ngOnInit() {
        this.productService.getProducts().then((data) => {
            this.products = data;
        });
    }

    getSeverity(status: string) {
        switch (status) {
            case 'INSTOCK':
                return 'success';
            case 'LOWSTOCK':
                return 'warn';
            case 'OUTOFSTOCK':
                return 'danger';
            default:
                return 'secondary';
        }
    }

    getSeverityLabel(status: string) {
        switch (status) {
            case 'INSTOCK':
                return 'In Stock';
            case 'LOWSTOCK':
                return 'Low Stock';
            case 'OUTOFSTOCK':
                return 'Out of Stock';
            default:
                return status;
        }
    }
}
```

## paginatorprogrammatic-doc

Paginator can also be controlled via model using a binding to the first property where changes trigger a pagination.

```typescript
import { Component, OnInit, inject, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ButtonModule } from 'primeng/button';
import { ProductService } from '@/service/productservice';
import { Product } from '@/domain/product';
import { ChevronLeft } from '@primeicons/angular/chevron-left';
import { Refresh } from '@primeicons/angular/refresh';
import { ChevronRight } from '@primeicons/angular/chevron-right';

@Component({
    template: `
        <div class="mb-4 flex gap-1">
            <button type="button" pButton iconOnly (click)="prev()" [disabled]="isFirstPage()" variant="text"><svg data-p-icon="chevron-left" /></button>
            <button type="button" pButton iconOnly (click)="reset()" variant="text"><svg data-p-icon="refresh" /></button>
            <button type="button" pButton iconOnly (click)="next()" [disabled]="isLastPage()" variant="text"><svg data-p-icon="chevron-right" /></button>
        </div>
        <p-table
            [value]="products"
            [paginator]="true"
            [rows]="rows"
            [showCurrentPageReport]="true"
            [first]="first"
            [tableStyle]="{ 'min-width': '50rem' }"
            currentPageReportTemplate="Showing {first} to {last} of {totalRecords} entries"
            (onPage)="pageChange($event)"
            [rowsPerPageOptions]="[10, 25, 50]"
        >
            <ng-template #header>
                <tr>
                    <th style="width: 30%">Product</th>
                    <th style="width: 20%">Category</th>
                    <th style="width: 10%">Qty</th>
                    <th style="width: 10%">Price</th>
                    <th style="width: 20%">Status</th>
                </tr>
            </ng-template>
            <ng-template #body let-product>
                <tr>
                    <td>
                        <div class="flex items-center gap-3">
                            <img [src]="'https://primefaces.org/cdn/primevue/images/product/' + product.image" [alt]="product.name" class="w-10 rounded-md shadow" />
                            <div class="flex flex-col">
                                <span class="font-medium">{{ product.name }}</span>
                                <span class="text-xs text-surface-500 dark:text-surface-400">{{ product.code }}</span>
                            </div>
                        </div>
                    </td>
                    <td>
                        <p-tag [value]="product.category" severity="secondary" />
                    </td>
                    <td>{{ product.quantity }}</td>
                    <td>
                        <span class="font-semibold">{{ '$' + product.price }}</span>
                    </td>
                    <td>
                        <p-tag [value]="getSeverityLabel(product.inventoryStatus)" [severity]="getSeverity(product.inventoryStatus)" />
                    </td>
                </tr>
            </ng-template>
        </p-table>
    `,
    standalone: true,
    imports: [TableModule, TagModule, ButtonModule, ChevronLeft, Refresh, ChevronRight],
    providers: [ProductService],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TablePaginatorProgrammaticDemo implements OnInit {
    private productService = inject(ProductService);

    private cd = inject(ChangeDetectorRef);

    products!: Product[];

    first: number = 0;

    rows: number = 10;

    ngOnInit() {
        this.productService.getProducts().then((data) => {
            this.products = data;
        });
    }

    next() {
        this.first = this.first + this.rows;
    }

    prev() {
        this.first = this.first - this.rows;
    }

    reset() {
        this.first = 0;
    }

    pageChange(event: any) {
        this.first = event.first;
        this.rows = event.rows;
    }

    isLastPage(): boolean {
        return this.products ? this.first + this.rows >= this.products.length : true;
    }

    isFirstPage(): boolean {
        return this.products ? this.first === 0 : true;
    }

    getSeverity(status: string) {
        switch (status) {
            case 'INSTOCK':
                return 'success';
            case 'LOWSTOCK':
                return 'warn';
            case 'OUTOFSTOCK':
                return 'danger';
            default:
                return 'secondary';
        }
    }

    getSeverityLabel(status: string) {
        switch (status) {
            case 'INSTOCK':
                return 'In Stock';
            case 'LOWSTOCK':
                return 'Low Stock';
            case 'OUTOFSTOCK':
                return 'Out of Stock';
            default:
                return status;
        }
    }
}
```

## presort-doc

Apply an initial sort on mount using sortField and sortOrder . Headers stay interactive afterwards.

```typescript
import { Component, OnInit, inject, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ProductService } from '@/service/productservice';
import { Product } from '@/domain/product';

@Component({
    template: `
        <p-table [value]="products" sortField="price" [sortOrder]="-1" removableSort [tableStyle]="{ 'min-width': '50rem' }">
            <ng-template #header>
                <tr>
                    <th pSortableColumn="name">
                        <div class="flex items-center gap-2">
                            Product
                            <p-sort-icon field="name" />
                        </div>
                    </th>
                    <th pSortableColumn="category">
                        <div class="flex items-center gap-2">
                            Category
                            <p-sort-icon field="category" />
                        </div>
                    </th>
                    <th pSortableColumn="quantity">
                        <div class="flex items-center gap-2">
                            Quantity
                            <p-sort-icon field="quantity" />
                        </div>
                    </th>
                    <th pSortableColumn="price">
                        <div class="flex items-center gap-2">
                            Price
                            <p-sort-icon field="price" />
                        </div>
                    </th>
                    <th pSortableColumn="inventoryStatus">
                        <div class="flex items-center gap-2">
                            Status
                            <p-sort-icon field="inventoryStatus" />
                        </div>
                    </th>
                </tr>
            </ng-template>
            <ng-template #body let-product>
                <tr>
                    <td>
                        <div class="flex items-center gap-3">
                            <img [src]="'https://primefaces.org/cdn/primevue/images/product/' + product.image" [alt]="product.name" class="w-10 rounded-md shadow" />
                            <div class="flex flex-col">
                                <span class="font-medium">{{ product.name }}</span>
                                <span class="text-xs text-surface-500 dark:text-surface-400">{{ product.code }}</span>
                            </div>
                        </div>
                    </td>
                    <td>
                        <p-tag [value]="product.category" severity="secondary" />
                    </td>
                    <td>{{ product.quantity }}</td>
                    <td>
                        <span class="font-semibold">{{ '$' + product.price }}</span>
                    </td>
                    <td>
                        <p-tag [value]="getSeverityLabel(product.inventoryStatus)" [severity]="getSeverity(product.inventoryStatus)" />
                    </td>
                </tr>
            </ng-template>
        </p-table>
    `,
    standalone: true,
    imports: [TableModule, TagModule],
    providers: [ProductService],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TablePreSortDemo implements OnInit {
    private productService = inject(ProductService);

    private cd = inject(ChangeDetectorRef);

    products!: Product[];

    ngOnInit() {
        this.productService.getProductsSmall().then((data) => {
            this.products = data.slice(0, 10);
        });
    }

    getSeverity(status: string) {
        switch (status) {
            case 'INSTOCK':
                return 'success';
            case 'LOWSTOCK':
                return 'warn';
            case 'OUTOFSTOCK':
                return 'danger';
            default:
                return 'secondary';
        }
    }

    getSeverityLabel(status: string) {
        switch (status) {
            case 'INSTOCK':
                return 'In Stock';
            case 'LOWSTOCK':
                return 'Low Stock';
            case 'OUTOFSTOCK':
                return 'Out of Stock';
            default:
                return status;
        }
    }
}
```

## preview-doc

```typescript
import { Component, OnInit, inject, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RatingModule } from 'primeng/rating';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ProductService } from '@/service/productservice';
import { Product } from '@/domain/product';

@Component({
    template: `
        <p-table [value]="products" [tableStyle]="{ 'min-width': '50rem' }">
            <ng-template #header>
                <tr>
                    <th>Product</th>
                    <th>Category</th>
                    <th>Price</th>
                    <th>Rating</th>
                    <th>Status</th>
                </tr>
            </ng-template>
            <ng-template #body let-product>
                <tr>
                    <td>
                        <div class="flex items-center gap-3">
                            <img [src]="'https://primefaces.org/cdn/primevue/images/product/' + product.image" [alt]="product.name" class="w-12 rounded-md shadow" />
                            <div class="flex flex-col">
                                <span class="font-medium">{{ product.name }}</span>
                                <span class="text-xs text-surface-500 dark:text-surface-400">{{ product.code }}</span>
                            </div>
                        </div>
                    </td>
                    <td>
                        <p-tag [value]="product.category" severity="secondary" />
                    </td>
                    <td>
                        <span class="font-semibold">{{ '$' + product.price }}</span>
                    </td>
                    <td>
                        <p-rating [(ngModel)]="product.rating" [readonly]="true" />
                    </td>
                    <td>
                        <p-tag [value]="getSeverityLabel(product.inventoryStatus)" [severity]="getSeverity(product.inventoryStatus)" />
                    </td>
                </tr>
            </ng-template>
        </p-table>
    `,
    standalone: true,
    imports: [RatingModule, TableModule, TagModule, FormsModule],
    providers: [ProductService],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TablePreviewDemo implements OnInit {
    private productService = inject(ProductService);

    private cd = inject(ChangeDetectorRef);

    products!: Product[];

    ngOnInit() {
        this.productService.getProductsSmall().then((data) => {
            this.products = data.slice(0, 8);
        });
    }

    getSeverity(status: string) {
        switch (status) {
            case 'INSTOCK':
                return 'success';
            case 'LOWSTOCK':
                return 'warn';
            case 'OUTOFSTOCK':
                return 'danger';
        }
    }

    getSeverityLabel(status: string) {
        switch (status) {
            case 'INSTOCK':
                return 'In Stock';
            case 'LOWSTOCK':
                return 'Low Stock';
            case 'OUTOFSTOCK':
                return 'Out of Stock';
            default:
                return status;
        }
    }
}
```

## radiobuttonselection-doc

Radio-based single selection. Combine selectionMode with a radio button column using p-table-radio-button .

```typescript
import { Component, OnInit, inject, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { AvatarModule } from 'primeng/avatar';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ButtonModule } from 'primeng/button';
import { CustomerService } from '@/service/customerservice';
import { Customer, Representative, Country } from '@/domain/customer';
import { UserPlus } from '@primeicons/angular/user-plus';

@Component({
    template: `
        <div class="flex flex-wrap items-center justify-between gap-3 mb-3 p-3 rounded-md border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900">
            <div class="flex flex-wrap items-center gap-2 text-sm">
                <span class="font-medium">Invoice recipient:</span>
                @if (selectedCustomer) {
                    <span class="text-surface-900 dark:text-surface-0">
                        <strong>{{ selectedCustomer.name }}</strong> — {{ selectedCustomer.company }}
                    </span>
                } @else {
                    <span class="text-surface-500 dark:text-surface-400">Pick a customer to assign</span>
                }
            </div>
            <button pButton size="small" [disabled]="!selectedCustomer">
                <svg data-p-icon="user-plus" />
                Assign
            </button>
        </div>
        <p-table [value]="customers" [(selection)]="selectedCustomer" dataKey="id" [tableStyle]="{ 'min-width': '50rem' }">
            <ng-template #header>
                <tr>
                    <th style="width: 3rem"></th>
                    <th>Name</th>
                    <th>Country</th>
                    <th>Representative</th>
                    <th>Status</th>
                    <th>Balance</th>
                </tr>
            </ng-template>
            <ng-template #body let-customer>
                <tr>
                    <td>
                        <p-table-radio-button [value]="customer" />
                    </td>
                    <td>
                        <span class="font-medium">{{ customer.name }}</span>
                    </td>
                    <td>
                        <div class="flex items-center gap-2">
                            <img src="https://primefaces.org/cdn/primeng/images/demo/flag/flag_placeholder.png" [class]="'flag flag-' + customer.country.code" style="width: 20px" />
                            <span>{{ customer.country.name }}</span>
                        </div>
                    </td>
                    <td>
                        <div class="flex items-center gap-2">
                            <p-avatar [image]="'https://primefaces.org/cdn/primevue/images/avatar/' + customer.representative.image" shape="circle" />
                            <span class="text-sm">{{ customer.representative.name }}</span>
                        </div>
                    </td>
                    <td>
                        <p-tag [value]="customer.status" [severity]="getSeverity(customer.status)" />
                    </td>
                    <td>
                        <span class="font-semibold">{{ '$' + customer.balance.toLocaleString() }}</span>
                    </td>
                </tr>
            </ng-template>
        </p-table>
    `,
    standalone: true,
    imports: [AvatarModule, TableModule, TagModule, ButtonModule, UserPlus],
    providers: [CustomerService],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TableRadioButtonSelectionDemo implements OnInit {
    private customerService = inject(CustomerService);

    private cd = inject(ChangeDetectorRef);

    customers!: Customer[];

    selectedCustomer!: Customer;

    ngOnInit() {
        this.customerService.getCustomersSmall().then((data) => {
            this.customers = data.slice(0, 8);
        });
    }

    getSeverity(status: string) {
        switch (status) {
            case 'qualified':
                return 'success';
            case 'unqualified':
                return 'danger';
            case 'negotiation':
                return 'warn';
            case 'new':
                return 'info';
            case 'renewal':
                return 'secondary';
            case 'proposal':
                return 'info';
            default:
                return 'secondary';
        }
    }
}
```

## removablesort-doc

The removable sort can be implemented using the customSort property.

```typescript
import { Component, OnInit, inject, viewChild, ChangeDetectionStrategy } from '@angular/core';
import { Table, TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ProductService } from '@/service/productservice';
import { SortEvent } from 'primeng/api';
import { Product } from '@/domain/product';

@Component({
    template: `
        <p-table #dt [value]="products" (sortFunction)="customSort($event)" [customSort]="true" [tableStyle]="{ 'min-width': '50rem' }">
            <ng-template #header>
                <tr>
                    <th pSortableColumn="name">
                        <div class="flex items-center gap-2">
                            Product
                            <p-sort-icon field="name" />
                        </div>
                    </th>
                    <th pSortableColumn="category">
                        <div class="flex items-center gap-2">
                            Category
                            <p-sort-icon field="category" />
                        </div>
                    </th>
                    <th pSortableColumn="quantity">
                        <div class="flex items-center gap-2">
                            Quantity
                            <p-sort-icon field="quantity" />
                        </div>
                    </th>
                    <th pSortableColumn="price">
                        <div class="flex items-center gap-2">
                            Price
                            <p-sort-icon field="price" />
                        </div>
                    </th>
                    <th pSortableColumn="inventoryStatus">
                        <div class="flex items-center gap-2">
                            Status
                            <p-sort-icon field="inventoryStatus" />
                        </div>
                    </th>
                </tr>
            </ng-template>
            <ng-template #body let-product>
                <tr>
                    <td>
                        <div class="flex items-center gap-3">
                            <img [src]="'https://primefaces.org/cdn/primevue/images/product/' + product.image" [alt]="product.name" class="w-10 rounded-md shadow" />
                            <div class="flex flex-col">
                                <span class="font-medium">{{ product.name }}</span>
                                <span class="text-xs text-surface-500 dark:text-surface-400">{{ product.code }}</span>
                            </div>
                        </div>
                    </td>
                    <td>
                        <p-tag [value]="product.category" severity="secondary" />
                    </td>
                    <td>{{ product.quantity }}</td>
                    <td>
                        <span class="font-semibold">{{ '$' + product.price }}</span>
                    </td>
                    <td>
                        <p-tag [value]="getSeverityLabel(product.inventoryStatus)" [severity]="getSeverity(product.inventoryStatus)" />
                    </td>
                </tr>
            </ng-template>
        </p-table>
    `,
    standalone: true,
    imports: [TableModule, TagModule],
    providers: [ProductService],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TableRemovableSortDemo implements OnInit {
    private productService = inject(ProductService);

    dt = viewChild<Table>('dt');

    products!: Product[];

    initialValue!: Product[];

    isSorted: boolean | null = null;

    ngOnInit() {
        this.productService.getProductsSmall().then((data) => {
            this.products = data.slice(0, 10);
            this.initialValue = [...this.products];
        });
    }

    customSort(event: SortEvent) {
        if (this.isSorted == null || this.isSorted === undefined) {
            this.isSorted = true;
            this.sortTableData(event);
        } else if (this.isSorted == true) {
            this.isSorted = false;
            this.sortTableData(event);
        } else if (this.isSorted == false) {
            this.isSorted = null;
            this.products = [...this.initialValue];
            this.dt()?.reset();
        }
    }

    sortTableData(event: SortEvent) {
        event.data!.sort((data1: any, data2: any) => {
            let value1 = data1[event.field!];
            let value2 = data2[event.field!];
            let result: number;

            if (value1 == null && value2 != null) result = -1;
            else if (value1 != null && value2 == null) result = 1;
            else if (value1 == null && value2 == null) result = 0;
            else if (typeof value1 === 'string' && typeof value2 === 'string') result = value1.localeCompare(value2);
            else result = value1 < value2 ? -1 : value1 > value2 ? 1 : 0;

            return event.order! * result;
        });
    }

    getSeverity(status: string) {
        switch (status) {
            case 'INSTOCK':
                return 'success';
            case 'LOWSTOCK':
                return 'warn';
            case 'OUTOFSTOCK':
                return 'danger';
            default:
                return 'secondary';
        }
    }

    getSeverityLabel(status: string) {
        switch (status) {
            case 'INSTOCK':
                return 'In Stock';
            case 'LOWSTOCK':
                return 'Low Stock';
            case 'OUTOFSTOCK':
                return 'Out of Stock';
            default:
                return status;
        }
    }
}
```

## Reorder

Drag and drop column headers to reorder columns.

```typescript
import { Component, OnInit, inject, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ProductService } from '@/service/productservice';
import { Product } from '@/domain/product';

interface Column {
    field: string;
    header: string;
}

@Component({
    template: `
        <p-table [value]="products" [columns]="cols" [reorderableColumns]="true" [tableStyle]="{ 'min-width': '50rem' }">
            <ng-template #header let-columns>
                <tr>
                    @for (col of columns; track col.field) {
                        <th pReorderableColumn>
                            {{ col.header }}
                        </th>
                    }
                </tr>
            </ng-template>
            <ng-template #body let-product let-columns="columns">
                <tr>
                    @for (col of columns; track col.field) {
                        <td>
                            @switch (col.field) {
                                @case ('name') {
                                    <div class="flex items-center gap-3">
                                        <img [src]="'https://primefaces.org/cdn/primeng/images/demo/product/' + product.image" [alt]="product.name" width="36" height="36" class="rounded-md shadow" />
                                        <span class="font-medium">{{ product.name }}</span>
                                    </div>
                                }
                                @case ('category') {
                                    <p-tag [value]="product.category" severity="secondary" />
                                }
                                @case ('quantity') {
                                    {{ product.quantity }}
                                }
                                @case ('price') {
                                    <span class="font-semibold">{{ '$' + product.price }}</span>
                                }
                                @case ('inventoryStatus') {
                                    <p-tag [value]="getSeverityLabel(product.inventoryStatus)" [severity]="getSeverity(product.inventoryStatus)" />
                                }
                            }
                        </td>
                    }
                </tr>
            </ng-template>
        </p-table>
    `,
    standalone: true,
    imports: [TableModule, TagModule],
    providers: [ProductService],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TableReorderDemo implements OnInit {
    private productService = inject(ProductService);

    private cd = inject(ChangeDetectorRef);

    products!: Product[];

    cols: Column[] = [
        { field: 'name', header: 'Product' },
        { field: 'category', header: 'Category' },
        { field: 'quantity', header: 'Quantity' },
        { field: 'price', header: 'Price' },
        { field: 'inventoryStatus', header: 'Status' }
    ];

    ngOnInit() {
        this.productService.getProductsSmall().then((data) => {
            this.products = data.slice(0, 6);
        });
    }

    getSeverity(status: string) {
        switch (status) {
            case 'INSTOCK':
                return 'success';
            case 'LOWSTOCK':
                return 'warn';
            case 'OUTOFSTOCK':
                return 'danger';
        }
    }

    getSeverityLabel(status: string) {
        switch (status) {
            case 'INSTOCK':
                return 'In Stock';
            case 'LOWSTOCK':
                return 'Low Stock';
            case 'OUTOFSTOCK':
                return 'Out of Stock';
            default:
                return status;
        }
    }
}
```

## rowedit-doc

Row-level editing with pEditableRow , pInitEditableRow , pSaveEditableRow and pCancelEditableRow directives. Use editMode="row" on the table with a dataKey to uniquely identify each row.

```typescript
import { Component, OnInit, inject, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SelectModule } from 'primeng/select';
import { InputNumberModule } from 'primeng/inputnumber';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { ProductService } from '@/service/productservice';
import { Product } from '@/domain/product';
import { Pencil } from '@primeicons/angular/pencil';
import { Check } from '@primeicons/angular/check';
import { Times } from '@primeicons/angular/times';

@Component({
    template: `
        <p-table [value]="products" dataKey="id" editMode="row" [tableStyle]="{ 'min-width': '50rem' }">
            <ng-template #header>
                <tr>
                    <th style="width: 30%">Product</th>
                    <th style="width: 20%">Category</th>
                    <th style="width: 10%">Qty</th>
                    <th style="width: 15%">Price</th>
                    <th style="width: 25%">Status</th>
                    <th style="width: 9rem">Actions</th>
                </tr>
            </ng-template>
            <ng-template #body let-product let-editing="editing" let-ri="rowIndex">
                <tr [pEditableRow]="product">
                    <td>
                        <p-cell-editor>
                            <ng-template #input>
                                <input pInputText type="text" [(ngModel)]="product.name" fluid />
                            </ng-template>
                            <ng-template #output>
                                <div class="flex items-center gap-3">
                                    <img [src]="'https://primefaces.org/cdn/primeng/images/demo/product/' + product.image" [alt]="product.name" width="40" height="40" class="rounded-md shadow" />
                                    <div class="flex flex-col">
                                        <span class="font-medium">{{ product.name }}</span>
                                        <span class="text-xs text-surface-500 dark:text-surface-400">{{ product.code }}</span>
                                    </div>
                                </div>
                            </ng-template>
                        </p-cell-editor>
                    </td>
                    <td>
                        <p-cell-editor>
                            <ng-template #input>
                                <input pInputText type="text" [(ngModel)]="product.category" fluid />
                            </ng-template>
                            <ng-template #output>
                                <p-tag [value]="product.category" severity="secondary" />
                            </ng-template>
                        </p-cell-editor>
                    </td>
                    <td>
                        <p-cell-editor>
                            <ng-template #input>
                                <p-inputnumber [(ngModel)]="product.quantity" fluid />
                            </ng-template>
                            <ng-template #output>
                                {{ product.quantity }}
                            </ng-template>
                        </p-cell-editor>
                    </td>
                    <td>
                        <p-cell-editor>
                            <ng-template #input>
                                <p-inputnumber [(ngModel)]="product.price" mode="currency" currency="USD" fluid />
                            </ng-template>
                            <ng-template #output>
                                <span class="font-semibold">{{ '$' + product.price }}</span>
                            </ng-template>
                        </p-cell-editor>
                    </td>
                    <td>
                        <p-cell-editor>
                            <ng-template #input>
                                <p-select [options]="statuses" [(ngModel)]="product.inventoryStatus" appendTo="body" optionLabel="label" optionValue="value" fluid />
                            </ng-template>
                            <ng-template #output>
                                <p-tag [value]="getSeverityLabel(product.inventoryStatus)" [severity]="getSeverity(product.inventoryStatus)" />
                            </ng-template>
                        </p-cell-editor>
                    </td>
                    <td>
                        <div class="flex gap-1">
                            @if (!editing) {
                                <button pButton type="button" pInitEditableRow (click)="onRowEditInit(product)" variant="text" severity="secondary" iconOnly>
                                    <svg data-p-icon="pencil" />
                                </button>
                            }
                            @if (editing) {
                                <button pButton type="button" pSaveEditableRow (click)="onRowEditSave(product)" variant="text" severity="success" iconOnly>
                                    <svg data-p-icon="check" />
                                </button>
                                <button pButton type="button" pCancelEditableRow (click)="onRowEditCancel(product, ri)" variant="text" severity="danger" iconOnly>
                                    <svg data-p-icon="times" />
                                </button>
                            }
                        </div>
                    </td>
                </tr>
            </ng-template>
        </p-table>
    `,
    standalone: true,
    imports: [SelectModule, InputNumberModule, TableModule, TagModule, ButtonModule, InputTextModule, FormsModule, Pencil, Check, Times],
    providers: [ProductService],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TableRowEditDemo implements OnInit {
    private productService = inject(ProductService);

    private cd = inject(ChangeDetectorRef);

    products!: Product[];

    statuses = [
        { label: 'In Stock', value: 'INSTOCK' },
        { label: 'Low Stock', value: 'LOWSTOCK' },
        { label: 'Out of Stock', value: 'OUTOFSTOCK' }
    ];

    clonedProducts: { [s: string]: Product } = {};

    ngOnInit() {
        this.productService.getProductsSmall().then((data) => {
            this.products = data.slice(0, 6);
        });
    }

    onRowEditInit(product: Product) {
        this.clonedProducts[product.id as string] = { ...product };
    }

    onRowEditSave(product: Product) {
        delete this.clonedProducts[product.id as string];
    }

    onRowEditCancel(product: Product, index: number) {
        this.products[index] = this.clonedProducts[product.id as string];
        delete this.clonedProducts[product.id as string];
    }

    getSeverity(status: string) {
        switch (status) {
            case 'INSTOCK':
                return 'success';
            case 'LOWSTOCK':
                return 'warn';
            case 'OUTOFSTOCK':
                return 'danger';
        }
    }

    getSeverityLabel(status: string) {
        switch (status) {
            case 'INSTOCK':
                return 'In Stock';
            case 'LOWSTOCK':
                return 'Low Stock';
            case 'OUTOFSTOCK':
                return 'Out of Stock';
            default:
                return status;
        }
    }
}
```

## rowexpansion-doc

Expand rows to show additional detail content. Use pRowToggler directive to toggle expansion with expand/collapse icons.

```typescript
import { Component, OnInit, inject, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RatingModule } from 'primeng/rating';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ButtonModule } from 'primeng/button';
import { ProductService } from '@/service/productservice';
import { Product } from '@/domain/product';
import { ChevronDown } from '@primeicons/angular/chevron-down';
import { ChevronRight } from '@primeicons/angular/chevron-right';

@Component({
    template: `
        <p-table [value]="products" dataKey="id" [tableStyle]="{ 'min-width': '50rem' }">
            <ng-template #header>
                <tr>
                    <th style="width: 3rem"></th>
                    <th>Product</th>
                    <th>Category</th>
                    <th>Price</th>
                    <th>Status</th>
                </tr>
            </ng-template>
            <ng-template #body let-product let-expanded="expanded">
                <tr>
                    <td>
                        <button type="button" pButton [pRowToggler]="product" variant="text" severity="secondary" iconOnly rounded>
                            @if (expanded) {
                                <svg data-p-icon="chevron-down" />
                            } @else {
                                <svg data-p-icon="chevron-right" />
                            }
                        </button>
                    </td>
                    <td>
                        <span class="font-medium">{{ product.name }}</span>
                    </td>
                    <td>
                        <p-tag [value]="product.category" severity="secondary" />
                    </td>
                    <td>
                        <span class="font-semibold">{{ '$' + product.price }}</span>
                    </td>
                    <td>
                        <p-tag [value]="getSeverityLabel(product.inventoryStatus)" [severity]="getSeverity(product.inventoryStatus)" />
                    </td>
                </tr>
            </ng-template>
            <ng-template #expandedrow let-product>
                <tr>
                    <td colspan="5">
                        <div class="flex gap-4 p-4 bg-surface-50 dark:bg-surface-900">
                            <img [src]="'https://primefaces.org/cdn/primeng/images/demo/product/' + product.image" [alt]="product.name" width="120" height="120" style="object-fit: cover; flex-shrink: 0" class="rounded-md shadow-md" />
                            <div class="flex flex-col gap-2 flex-1">
                                <h4 class="m-0 text-base font-semibold">{{ product.name }}</h4>
                                <div class="text-xs text-surface-500 dark:text-surface-400">SKU: {{ product.code }}</div>
                                <div class="flex items-center gap-2">
                                    <p-rating [(ngModel)]="product.rating" [readonly]="true" class="gap-0!" />
                                    <span class="text-xs text-surface-500 dark:text-surface-400">({{ product.rating }}/5)</span>
                                </div>
                                <div class="flex items-center gap-6 text-sm">
                                    <div>
                                        <div class="text-xs text-surface-500 dark:text-surface-400">Category</div>
                                        <div class="font-medium">{{ product.category }}</div>
                                    </div>
                                    <div>
                                        <div class="text-xs text-surface-500 dark:text-surface-400">In stock</div>
                                        <div class="font-medium">{{ product.quantity }} units</div>
                                    </div>
                                    <div>
                                        <div class="text-xs text-surface-500 dark:text-surface-400">Price</div>
                                        <div class="font-semibold">{{ '$' + product.price }}</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </td>
                </tr>
            </ng-template>
        </p-table>
    `,
    standalone: true,
    imports: [RatingModule, TableModule, TagModule, ButtonModule, FormsModule, ChevronDown, ChevronRight],
    providers: [ProductService],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TableRowExpansionDemo implements OnInit {
    private productService = inject(ProductService);

    private cd = inject(ChangeDetectorRef);

    products!: Product[];

    ngOnInit() {
        this.productService.getProductsSmall().then((data) => {
            this.products = data.slice(0, 6);
        });
    }

    getSeverity(status: string) {
        switch (status) {
            case 'INSTOCK':
                return 'success';
            case 'LOWSTOCK':
                return 'warn';
            case 'OUTOFSTOCK':
                return 'danger';
        }
    }

    getSeverityLabel(status: string) {
        switch (status) {
            case 'INSTOCK':
                return 'In Stock';
            case 'LOWSTOCK':
                return 'Low Stock';
            case 'OUTOFSTOCK':
                return 'Out of Stock';
            default:
                return status;
        }
    }
}
```

## rowreorder-doc

Drag and drop rows to reorder data.

```typescript
import { Component, OnInit, inject, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ProductService } from '@/service/productservice';
import { Product } from '@/domain/product';
import { Bars } from '@primeicons/angular/bars';

@Component({
    template: `
        <p-table [value]="products" [tableStyle]="{ 'min-width': '50rem' }">
            <ng-template #header>
                <tr>
                    <th style="width: 3rem"></th>
                    <th>Product</th>
                    <th>Category</th>
                    <th>Price</th>
                    <th>Status</th>
                </tr>
            </ng-template>
            <ng-template #body let-product let-index="rowIndex">
                <tr [pReorderableRow]="index">
                    <td>
                        <svg data-p-icon="bars" pReorderableRowHandle class="cursor-grab text-surface-400" />
                    </td>
                    <td>
                        <div class="flex items-center gap-3">
                            <img [src]="'https://primefaces.org/cdn/primeng/images/demo/product/' + product.image" [alt]="product.name" width="36" height="36" class="rounded-md shadow" />
                            <div class="flex flex-col">
                                <span class="font-medium">{{ product.name }}</span>
                                <span class="text-xs text-surface-500 dark:text-surface-400">{{ product.code }}</span>
                            </div>
                        </div>
                    </td>
                    <td>
                        <p-tag [value]="product.category" severity="secondary" />
                    </td>
                    <td>
                        <span class="font-semibold">{{ '$' + product.price }}</span>
                    </td>
                    <td>
                        <p-tag [value]="getSeverityLabel(product.inventoryStatus)" [severity]="getSeverity(product.inventoryStatus)" />
                    </td>
                </tr>
            </ng-template>
        </p-table>
    `,
    standalone: true,
    imports: [TableModule, TagModule, Bars],
    providers: [ProductService],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TableRowReorderDemo implements OnInit {
    private productService = inject(ProductService);

    private cd = inject(ChangeDetectorRef);

    products!: Product[];

    ngOnInit() {
        this.productService.getProductsSmall().then((data) => {
            this.products = data.slice(0, 6);
        });
    }

    getSeverity(status: string) {
        switch (status) {
            case 'INSTOCK':
                return 'success';
            case 'LOWSTOCK':
                return 'warn';
            case 'OUTOFSTOCK':
                return 'danger';
        }
    }

    getSeverityLabel(status: string) {
        switch (status) {
            case 'INSTOCK':
                return 'In Stock';
            case 'LOWSTOCK':
                return 'Low Stock';
            case 'OUTOFSTOCK':
                return 'Out of Stock';
            default:
                return status;
        }
    }
}
```

## rowspangrouping-doc

When rowGroupMode is configured to be rowspan , the grouping column spans multiple rows.

```typescript
import { Component, OnInit, inject, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { CustomerService } from '@/service/customerservice';
import { Customer, Representative, Country } from '@/domain/customer';

@Component({
    template: `
        <p-table [value]="customers" rowGroupMode="rowspan" groupRowsBy="representative.name" sortField="representative.name" sortMode="single" [tableStyle]="{ 'min-width': '75rem' }">
            <ng-template #header>
                <tr>
                    <th style="width:3rem">#</th>
                    <th>Representative</th>
                    <th>Name</th>
                    <th>Country</th>
                    <th>Company</th>
                    <th>Status</th>
                </tr>
            </ng-template>
            <ng-template #body let-customer let-rowIndex="rowIndex" let-rowgroup="rowgroup" let-rowspan="rowspan">
                <tr>
                    <td>{{ rowIndex }}</td>
                    @if (rowgroup) {
                        <td [attr.rowspan]="rowspan">
                            <div class="flex items-center gap-2">
                                <img [alt]="customer.representative.name" src="https://primefaces.org/cdn/primeng/images/demo/avatar/{{ customer.representative.image }}" width="32" />
                                <span>{{ customer.representative.name }}</span>
                            </div>
                        </td>
                    }
                    <td>
                        {{ customer.name }}
                    </td>
                    <td>
                        <div class="flex items-center gap-2">
                            <img src="https://primefaces.org/cdn/primeng/images/demo/flag/flag_placeholder.png" [class]="'flag flag-' + customer.country.code" style="width: 20px" />
                            <span>{{ customer.country.name }}</span>
                        </div>
                    </td>
                    <td>
                        {{ customer.company }}
                    </td>
                    <td>
                        <p-tag [value]="customer.status" [severity]="getSeverity(customer.status)" />
                    </td>
                </tr>
            </ng-template>
        </p-table>
    `,
    standalone: true,
    imports: [TableModule, TagModule],
    providers: [CustomerService],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TableRowSpanGroupingDemo implements OnInit {
    private customerService = inject(CustomerService);

    private cd = inject(ChangeDetectorRef);

    customers!: Customer[];

    ngOnInit() {
        this.customerService.getCustomersMedium().then((data) => {
            this.customers = data;
        });
    }

    calculateCustomerTotal(name: string) {
        let total = 0;

        if (this.customers) {
            for (let customer of this.customers) {
                if (customer.representative?.name === name) {
                    total++;
                }
            }
        }

        return total;
    }

    getSeverity(status: string) {
        switch (status) {
            case 'unqualified':
                return 'danger';

            case 'qualified':
                return 'success';

            case 'new':
                return 'info';

            case 'negotiation':
                return 'warn';

            case 'renewal':
                return null;
        }
    }
}
```

## selectionevents-doc

Table provides onRowSelect and onRowUnselect events to listen selection events.

```typescript
import { Component, OnInit, inject, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { TableModule } from 'primeng/table';
import { ProductService } from '@/service/productservice';
import { MessageService } from 'primeng/api';
import { Product } from '@/domain/product';

@Component({
    template: `
        <p-table [value]="products" selectionMode="single" [(selection)]="selectedProduct" dataKey="code" (onRowSelect)="onRowSelect($event)" (onRowUnselect)="onRowUnselect($event)" [tableStyle]="{ 'min-width': '50rem' }">
            <ng-template #header>
                <tr>
                    <th>Code</th>
                    <th>Name</th>
                    <th>Category</th>
                    <th>Quantity</th>
                </tr>
            </ng-template>
            <ng-template #body let-product>
                <tr [pSelectableRow]="product">
                    <td>{{ product.code }}</td>
                    <td>{{ product.name }}</td>
                    <td>{{ product.category }}</td>
                    <td>{{ product.quantity }}</td>
                </tr>
            </ng-template>
        </p-table>
    `,
    standalone: true,
    imports: [TableModule],
    providers: [ProductService, MessageService],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TableSelectionEventsDemo implements OnInit {
    products!: Product[];

    selectedProduct!: Product;

    private productService = inject(ProductService);

    private messageService = inject(MessageService);

    private cd = inject(ChangeDetectorRef);

    ngOnInit() {
        this.productService.getProductsMini().then((data) => {
            this.products = data;
        });
    }

    onRowSelect(event: any) {
        this.messageService.add({ severity: 'info', summary: 'Product Selected', detail: event.data.name });
    }

    onRowUnselect(event: any) {
        this.messageService.add({ severity: 'info', summary: 'Product Unselected', detail: event.data.name });
    }
}
```

## singlecolumnsort-doc

Clicking a column header cycles through ascending, descending, and unsorted. Add pSortableColumn directive and p-sort-icon to enable sorting on a column.

```typescript
import { Component, OnInit, inject, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ProductService } from '@/service/productservice';
import { Product } from '@/domain/product';

@Component({
    template: `
        <p-table [value]="products" removableSort [tableStyle]="{ 'min-width': '50rem' }">
            <ng-template #header>
                <tr>
                    <th pSortableColumn="name">
                        <div class="flex items-center gap-2">
                            Product
                            <p-sort-icon field="name" />
                        </div>
                    </th>
                    <th pSortableColumn="category">
                        <div class="flex items-center gap-2">
                            Category
                            <p-sort-icon field="category" />
                        </div>
                    </th>
                    <th pSortableColumn="quantity">
                        <div class="flex items-center gap-2">
                            Quantity
                            <p-sort-icon field="quantity" />
                        </div>
                    </th>
                    <th pSortableColumn="price">
                        <div class="flex items-center gap-2">
                            Price
                            <p-sort-icon field="price" />
                        </div>
                    </th>
                    <th pSortableColumn="inventoryStatus">
                        <div class="flex items-center gap-2">
                            Status
                            <p-sort-icon field="inventoryStatus" />
                        </div>
                    </th>
                </tr>
            </ng-template>
            <ng-template #body let-product>
                <tr>
                    <td>
                        <div class="flex items-center gap-3">
                            <img [src]="'https://primefaces.org/cdn/primevue/images/product/' + product.image" [alt]="product.name" class="w-10 rounded-md shadow" />
                            <div class="flex flex-col">
                                <span class="font-medium">{{ product.name }}</span>
                                <span class="text-xs text-surface-500 dark:text-surface-400">{{ product.code }}</span>
                            </div>
                        </div>
                    </td>
                    <td>
                        <p-tag [value]="product.category" severity="secondary" />
                    </td>
                    <td>{{ product.quantity }}</td>
                    <td>
                        <span class="font-semibold">{{ '$' + product.price }}</span>
                    </td>
                    <td>
                        <p-tag [value]="getSeverityLabel(product.inventoryStatus)" [severity]="getSeverity(product.inventoryStatus)" />
                    </td>
                </tr>
            </ng-template>
        </p-table>
    `,
    standalone: true,
    imports: [TableModule, TagModule],
    providers: [ProductService],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TableSingleColumnSortDemo implements OnInit {
    private productService = inject(ProductService);

    private cd = inject(ChangeDetectorRef);

    products!: Product[];

    ngOnInit() {
        this.productService.getProductsSmall().then((data) => {
            this.products = data.slice(0, 10);
        });
    }

    getSeverity(status: string) {
        switch (status) {
            case 'INSTOCK':
                return 'success';
            case 'LOWSTOCK':
                return 'warn';
            case 'OUTOFSTOCK':
                return 'danger';
            default:
                return 'secondary';
        }
    }

    getSeverityLabel(status: string) {
        switch (status) {
            case 'INSTOCK':
                return 'In Stock';
            case 'LOWSTOCK':
                return 'Low Stock';
            case 'OUTOFSTOCK':
                return 'Out of Stock';
            default:
                return status;
        }
    }
}
```

## singleselection-doc

One row at a time. Clicking a different row replaces the previous selection.

```typescript
import { Component, OnInit, inject, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ProductService } from '@/service/productservice';
import { Product } from '@/domain/product';

@Component({
    template: `
        <p-table [value]="products" selectionMode="single" [(selection)]="selectedProduct" dataKey="id" [tableStyle]="{ 'min-width': '50rem' }">
            <ng-template #header>
                <tr>
                    <th>Product</th>
                    <th>Category</th>
                    <th>Qty</th>
                    <th>Price</th>
                    <th>Status</th>
                </tr>
            </ng-template>
            <ng-template #body let-product>
                <tr [pSelectableRow]="product">
                    <td>
                        <div class="flex items-center gap-3">
                            <img [src]="'https://primefaces.org/cdn/primevue/images/product/' + product.image" [alt]="product.name" class="w-10 rounded-md shadow" />
                            <div class="flex flex-col">
                                <span class="font-medium">{{ product.name }}</span>
                                <span class="text-xs text-surface-500 dark:text-surface-400">{{ product.code }}</span>
                            </div>
                        </div>
                    </td>
                    <td>
                        <p-tag [value]="product.category" severity="secondary" />
                    </td>
                    <td>{{ product.quantity }}</td>
                    <td>
                        <span class="font-semibold">{{ '$' + product.price }}</span>
                    </td>
                    <td>
                        <p-tag [value]="getSeverityLabel(product.inventoryStatus)" [severity]="getSeverity(product.inventoryStatus)" />
                    </td>
                </tr>
            </ng-template>
        </p-table>
    `,
    standalone: true,
    imports: [TableModule, TagModule],
    providers: [ProductService],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TableSingleSelectionDemo implements OnInit {
    private productService = inject(ProductService);

    private cd = inject(ChangeDetectorRef);

    products!: Product[];

    selectedProduct!: Product;

    ngOnInit() {
        this.productService.getProductsSmall().then((data) => {
            this.products = data.slice(0, 8);
        });
    }

    getSeverity(status: string) {
        switch (status) {
            case 'INSTOCK':
                return 'success';
            case 'LOWSTOCK':
                return 'warn';
            case 'OUTOFSTOCK':
                return 'danger';
            default:
                return 'secondary';
        }
    }

    getSeverityLabel(status: string) {
        switch (status) {
            case 'INSTOCK':
                return 'In Stock';
            case 'LOWSTOCK':
                return 'Low Stock';
            case 'OUTOFSTOCK':
                return 'Out of Stock';
            default:
                return status;
        }
    }
}
```

## Size

Use the size property with small or large to adjust cell padding. Omit for the default size.

```typescript
import { Component, OnInit, inject, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AvatarModule } from 'primeng/avatar';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { CustomerService } from '@/service/customerservice';
import { Customer, Representative, Country } from '@/domain/customer';

@Component({
    template: `
        <div class="mb-4">
            <p-selectbutton [options]="sizes" [(ngModel)]="selectedSize" [multiple]="false" optionLabel="name" optionValue="value" />
        </div>
        <p-table [value]="customers" [tableStyle]="{ 'min-width': '50rem' }" [size]="selectedSize">
            <ng-template #header>
                <tr>
                    <th>Name</th>
                    <th>Country</th>
                    <th>Representative</th>
                    <th>Status</th>
                    <th>Balance</th>
                </tr>
            </ng-template>
            <ng-template #body let-customer>
                <tr>
                    <td>
                        <span class="font-medium">{{ customer.name }}</span>
                    </td>
                    <td>
                        <div class="flex items-center gap-2">
                            <img src="https://primefaces.org/cdn/primeng/images/demo/flag/flag_placeholder.png" [class]="'flag flag-' + customer.country.code" style="width: 20px" />
                            <span>{{ customer.country.name }}</span>
                        </div>
                    </td>
                    <td>
                        <div class="flex items-center gap-2">
                            <p-avatar [image]="'https://primefaces.org/cdn/primevue/images/avatar/' + customer.representative.image" shape="circle" />
                            <span class="text-sm">{{ customer.representative.name }}</span>
                        </div>
                    </td>
                    <td>
                        <p-tag [value]="customer.status" [severity]="getSeverity(customer.status)" />
                    </td>
                    <td>
                        <span class="font-semibold">{{ '$' + customer.balance.toLocaleString() }}</span>
                    </td>
                </tr>
            </ng-template>
        </p-table>
    `,
    standalone: true,
    imports: [AvatarModule, SelectButtonModule, TableModule, TagModule, FormsModule],
    providers: [CustomerService],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TableSizeDemo implements OnInit {
    private customerService = inject(CustomerService);

    private cd = inject(ChangeDetectorRef);

    customers!: Customer[];

    sizes = [
        { name: 'Small', value: 'small' },
        { name: 'Normal', value: undefined },
        { name: 'Large', value: 'large' }
    ];

    selectedSize: TableSize | undefined = undefined;

    ngOnInit() {
        this.customerService.getCustomersSmall().then((data) => {
            this.customers = data.slice(0, 6);
        });
    }

    getSeverity(status: string) {
        switch (status) {
            case 'qualified':
                return 'success';
            case 'unqualified':
                return 'danger';
            case 'negotiation':
                return 'warn';
            case 'new':
                return 'info';
            case 'renewal':
                return 'secondary';
            case 'proposal':
                return 'info';
            default:
                return 'secondary';
        }
    }
}
```

## Stateful

Stateful table allows keeping the state such as page, sort and filtering either at local storage or session storage so that when the page is visited again, table would render the data using the last settings. Change the state of the table e.g paginate, navigate away and then return to this table again to test this feature, the setting is set as session with the stateStorage property so that Table retains the state until the browser is closed. Other alternative is local referring to localStorage for an extended lifetime.

```typescript
import { Component, OnInit, inject, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { Table, TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { InputTextModule } from 'primeng/inputtext';
import { CustomerService } from '@/service/customerservice';
import { FilterMetadata } from 'primeng/api';
import { Customer, Representative, Country } from '@/domain/customer';
import { Search } from '@primeicons/angular/search';

@Component({
    template: `
        <p-table
            #dt1
            [value]="customers"
            [globalFilterFields]="['name', 'country.name', 'representative.name', 'status']"
            selectionMode="single"
            [(selection)]="selectedCustomers"
            dataKey="id"
            [tableStyle]="{ 'min-width': '50rem' }"
            [rows]="5"
            [paginator]="true"
            stateStorage="session"
            stateKey="statedemo-session"
        >
            <ng-template #caption>
                <p-iconfield iconPosition="left">
                    <p-inputicon>
                        <svg data-p-icon="search" />
                    </p-inputicon>
                    <input pInputText type="text" [value]="globalFilterValue(dt1)" (input)="dt1.filterGlobal($event.target.value, 'contains')" placeholder="Global Search" />
                </p-iconfield>
            </ng-template>
            <ng-template #header>
                <tr>
                    <th pSortableColumn="name" style="width:25%">
                        <div class="flex items-center gap-2">
                            Name
                            <p-sort-icon field="name" />
                        </div>
                    </th>
                    <th pSortableColumn="country.name" style="width:25%">
                        <div class="flex items-center gap-2">
                            Country
                            <p-sort-icon field="country.name" />
                        </div>
                    </th>
                    <th pSortableColumn="representative.name" style="width:25%">
                        <div class="flex items-center gap-2">
                            Representative
                            <p-sort-icon field="representative.name" />
                        </div>
                    </th>
                    <th pSortableColumn="status" style="width:25%">
                        <div class="flex items-center gap-2">
                            Status
                            <p-sort-icon field="status" />
                        </div>
                    </th>
                </tr>
            </ng-template>
            <ng-template #body let-customer>
                <tr [pSelectableRow]="customer">
                    <td>
                        {{ customer.name }}
                    </td>
                    <td>
                        <div class="flex items-center gap-2">
                            <img src="https://primefaces.org/cdn/primeng/images/demo/flag/flag_placeholder.png" [class]="'flag flag-' + customer.country.code" style="width: 20px" />
                            <span class="ml-1 align-middle">{{ customer.country.name }}</span>
                        </div>
                    </td>
                    <td>
                        <div class="flex items-center gap-2">
                            <img [alt]="customer.representative.name" src="https://primefaces.org/cdn/primeng/images/demo/avatar/{{ customer.representative.image }}" width="32" style="vertical-align: middle" />
                            <span class="ml-1 align-middle">{{ customer.representative.name }}</span>
                        </div>
                    </td>
                    <td>
                        <p-tag [value]="customer.status" [severity]="getSeverity(customer.status)" />
                    </td>
                </tr>
            </ng-template>
            <ng-template #emptymessage>
                <tr>
                    <td colspan="4">No customers found.</td>
                </tr>
            </ng-template>
        </p-table>
    `,
    standalone: true,
    imports: [IconFieldModule, InputIconModule, TableModule, TagModule, InputTextModule, Search],
    providers: [CustomerService],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TableStatefulDemo implements OnInit {
    customers!: Customer[];

    selectedCustomers!: Customer;

    private customerService = inject(CustomerService);

    private cd = inject(ChangeDetectorRef);

    ngOnInit() {
        this.customerService.getCustomersSmall().then((data) => {
            this.customers = data;
        });
    }

    globalFilterValue(table: Table): string {
        return (table.filters['global'] as FilterMetadata)?.value ?? '';
    }

    getSeverity(status: string) {
        switch (status) {
            case 'unqualified':
                return 'danger';

            case 'qualified':
                return 'success';

            case 'new':
                return 'info';

            case 'negotiation':
                return 'warn';

            case 'renewal':
                return null;
        }
    }
}
```

## Striped Rows

Alternating rows are displayed when stripedRows property is present.

```typescript
import { Component, OnInit, inject, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { AvatarModule } from 'primeng/avatar';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { CustomerService } from '@/service/customerservice';
import { Customer, Representative, Country } from '@/domain/customer';

@Component({
    template: `
        <p-table [value]="customers" stripedRows [tableStyle]="{ 'min-width': '50rem' }">
            <ng-template #header>
                <tr>
                    <th>Name</th>
                    <th>Country</th>
                    <th>Representative</th>
                    <th>Status</th>
                    <th>Balance</th>
                </tr>
            </ng-template>
            <ng-template #body let-customer>
                <tr>
                    <td>
                        <span class="font-medium">{{ customer.name }}</span>
                    </td>
                    <td>
                        <div class="flex items-center gap-2">
                            <img src="https://primefaces.org/cdn/primeng/images/demo/flag/flag_placeholder.png" [class]="'flag flag-' + customer.country.code" style="width: 20px" />
                            <span>{{ customer.country.name }}</span>
                        </div>
                    </td>
                    <td>
                        <div class="flex items-center gap-2">
                            <p-avatar [image]="'https://primefaces.org/cdn/primevue/images/avatar/' + customer.representative.image" shape="circle" />
                            <span class="text-sm">{{ customer.representative.name }}</span>
                        </div>
                    </td>
                    <td>
                        <p-tag [value]="customer.status" [severity]="getSeverity(customer.status)" />
                    </td>
                    <td>
                        <span class="font-semibold">{{ '$' + customer.balance.toLocaleString() }}</span>
                    </td>
                </tr>
            </ng-template>
        </p-table>
    `,
    standalone: true,
    imports: [AvatarModule, TableModule, TagModule],
    providers: [CustomerService],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TableStripedDemo implements OnInit {
    private customerService = inject(CustomerService);

    private cd = inject(ChangeDetectorRef);

    customers!: Customer[];

    ngOnInit() {
        this.customerService.getCustomersSmall().then((data) => {
            this.customers = data.slice(0, 8);
        });
    }

    getSeverity(status: string) {
        switch (status) {
            case 'qualified':
                return 'success';
            case 'unqualified':
                return 'danger';
            case 'negotiation':
                return 'warn';
            case 'new':
                return 'info';
            case 'renewal':
                return 'secondary';
            case 'proposal':
                return 'info';
            default:
                return 'secondary';
        }
    }
}
```

## style-doc

Certain rows or cells can easily be styled based on conditions.

## styling-doc

```typescript
import { Component } from '@angular/core';

@Component({
    template: `
        <div class="doc-tablewrapper">
            <table class="doc-table">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Element</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>p-datatable</td>
                        <td>Container element.</td>
                    </tr>
                    <tr>
                        <td>p-datatable-header</td>
                        <td>Header section.</td>
                    </tr>
                    <tr>
                        <td>p-datatable-footer</td>
                        <td>Footer section.</td>
                    </tr>
                    <tr>
                        <td>p-sortable-column</td>
                        <td>Sortable column header.</td>
                    </tr>
                    <tr>
                        <td>p-editable-column</td>
                        <td>Editable column cell.</td>
                    </tr>
                    <tr>
                        <td>p-datatable-thead</td>
                        <td>Thead element of header columns.</td>
                    </tr>
                    <tr>
                        <td>p-datatable-tbody</td>
                        <td>Tbody element of body rows.</td>
                    </tr>
                    <tr>
                        <td>p-datatable-tfoot</td>
                        <td>Tfoot element of footer columns.</td>
                    </tr>
                    <tr>
                        <td>p-datatable-scrollable</td>
                        <td>Container element when scrolling is enabled.</td>
                    </tr>
                    <tr>
                        <td>p-datatable-resizable</td>
                        <td>Container element when column resizing is enabled.</td>
                    </tr>
                    <tr>
                        <td>p-datatable-resizable-fit</td>
                        <td>Container element when column resizing is enabled and set to fit mode.</td>
                    </tr>
                    <tr>
                        <td>p-column-resizer-helper</td>
                        <td>Vertical resizer indicator bar.</td>
                    </tr>
                    <tr>
                        <td>p-datatable-reorderablerow-handle</td>
                        <td>Handle element of a reorderable row.</td>
                    </tr>
                    <tr>
                        <td>p-datatable-reorder-indicator-up</td>
                        <td>Up indicator to display during column reordering.</td>
                    </tr>
                    <tr>
                        <td>p-datatable-reorder-indicator-up</td>
                        <td>Down indicator to display during column reordering.</td>
                    </tr>
                    <tr>
                        <td>p-datatable-loading-overlay</td>
                        <td>Overlay to display when table is loading.</td>
                    </tr>
                    <tr>
                        <td>p-datatable-loading-icon</td>
                        <td>Icon to display when table is loading.</td>
                    </tr>
                </tbody>
            </table>
        </div>
    `,
    standalone: true,
    imports: []
})
export class TableStylingDemo {}
```

## subheadergrouping-doc

Rows are grouped with the groupRowsBy property. When rowGroupMode is set as subheader , a header and footer can be displayed for each group. The content of a group header is provided with groupheader and footer with groupfooter templates.

```typescript
import { Component, OnInit, inject, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { CustomerService } from '@/service/customerservice';
import { Customer, Country } from '@/domain/customer';

@Component({
    template: `
        <p-table [value]="customers" sortField="representative.name" sortMode="single" [scrollable]="true" scrollHeight="400px" rowGroupMode="subheader" groupRowsBy="representative.name" [tableStyle]="{ 'min-width': '60rem' }">
            <ng-template #header>
                <tr>
                    <th>Name</th>
                    <th>Country</th>
                    <th>Company</th>
                    <th>Status</th>
                    <th>Date</th>
                </tr>
            </ng-template>
            <ng-template #groupheader let-customer>
                <tr pRowGroupHeader>
                    <td colspan="5">
                        <div class="flex items-center gap-2">
                            <img [alt]="customer.representative.name" src="https://primefaces.org/cdn/primeng/images/demo/avatar/{{ customer.representative.image }}" width="32" style="vertical-align: middle" />
                            <span class="font-bold">{{ customer.representative.name }}</span>
                        </div>
                    </td>
                </tr>
            </ng-template>
            <ng-template #groupfooter let-customer>
                <tr>
                    <td colspan="5">
                        <div class="text-right font-bold pe-12">Total Customers: {{ calculateCustomerTotal(customer.representative.name) }}</div>
                    </td>
                </tr>
            </ng-template>
            <ng-template #body let-customer let-rowIndex="rowIndex">
                <tr>
                    <td>
                        {{ customer.name }}
                    </td>
                    <td>
                        <div class="flex items-center gap-2">
                            <img src="https://primefaces.org/cdn/primeng/images/demo/flag/flag_placeholder.png" [class]="'flag flag-' + customer.country.code" style="width: 20px" />
                            <span>{{ customer.country.name }}</span>
                        </div>
                    </td>
                    <td>
                        {{ customer.company }}
                    </td>
                    <td>
                        <p-tag [value]="customer.status" [severity]="getSeverity(customer.status)" />
                    </td>
                    <td>
                        {{ customer.date }}
                    </td>
                </tr>
            </ng-template>
        </p-table>
    `,
    standalone: true,
    imports: [TableModule, TagModule],
    providers: [CustomerService],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TableSubHeaderGroupingDemo implements OnInit {
    private customerService = inject(CustomerService);

    private cd = inject(ChangeDetectorRef);

    customers!: Customer[];

    ngOnInit() {
        this.customerService.getCustomersMedium().then((data) => {
            this.customers = data;
        });
    }

    calculateCustomerTotal(name: string) {
        let total = 0;

        if (this.customers) {
            for (let customer of this.customers) {
                if (customer.representative?.name === name) {
                    total++;
                }
            }
        }

        return total;
    }

    getSeverity(status: string) {
        switch (status) {
            case 'unqualified':
                return 'danger';

            case 'qualified':
                return 'success';

            case 'new':
                return 'info';

            case 'negotiation':
                return 'warn';

            case 'renewal':
                return null;
        }
    }
}
```

## Template

Custom content at header , body and footer sections are supported via templating.

```typescript
import { Component, OnInit, inject, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RatingModule } from 'primeng/rating';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ButtonModule } from 'primeng/button';
import { ProductService } from '@/service/productservice';
import { Product } from '@/domain/product';
import { Refresh } from '@primeicons/angular/refresh';

interface Column {
    field: string;
    header: string;
}

@Component({
    template: `
        <p-table [value]="products" [tableStyle]="{ 'min-width': '60rem' }">
            <ng-template #caption>
                <div class="flex items-center justify-between">
                    <span class="text-lg font-bold">Products</span>
                    <button type="button" pButton iconOnly rounded raised><svg data-p-icon="refresh" /></button>
                </div>
            </ng-template>
            <ng-template #header>
                <tr>
                    <th>Name</th>
                    <th>Image</th>
                    <th>Price</th>
                    <th>Category</th>
                    <th>Reviews</th>
                    <th>Status</th>
                </tr>
            </ng-template>
            <ng-template #body let-product>
                <tr>
                    <td>{{ product.name }}</td>
                    <td>
                        <img [src]="'https://primefaces.org/cdn/primeng/images/demo/product/' + product.image" [alt]="product.name" class="w-24 rounded-sm" />
                    </td>
                    <td>{{ '$' + product.price }}</td>
                    <td>{{ product.category }}</td>
                    <td><p-rating [(ngModel)]="product.rating" [readonly]="true" /></td>
                    <td>
                        <p-tag [value]="product.inventoryStatus" [severity]="getSeverity(product.inventoryStatus)" />
                    </td>
                </tr>
            </ng-template>
            <ng-template #footer>
                <tr>
                    <td colspan="6" class="text-sm">In total there are {{ products ? products.length : 0 }} products.</td>
                </tr>
            </ng-template>
        </p-table>
    `,
    standalone: true,
    imports: [RatingModule, TableModule, TagModule, ButtonModule, FormsModule, Refresh],
    providers: [ProductService],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TableTemplateDemo implements OnInit {
    products!: Product[];

    cols!: Column[];

    private productService = inject(ProductService);

    private cd = inject(ChangeDetectorRef);

    ngOnInit() {
        this.productService.getProductsMini().then((data) => {
            this.products = data;
        });
        this.cols = [
            { field: 'code', header: 'Code' },
            { field: 'name', header: 'Name' },
            { field: 'category', header: 'Category' },
            { field: 'quantity', header: 'Quantity' }
        ];
    }

    getSeverity(status: string) {
        switch (status) {
            case 'INSTOCK':
                return 'success';
            case 'LOWSTOCK':
                return 'warn';
            case 'OUTOFSTOCK':
                return 'danger';
        }
    }
}
```

## verticalscroll-doc

A fixed scrollHeight enables vertical scrolling with a sticky header.

```typescript
import { Component, OnInit, inject, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { AvatarModule } from 'primeng/avatar';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { CustomerService } from '@/service/customerservice';
import { Customer, Representative, Country } from '@/domain/customer';

@Component({
    template: `
        <p-table [value]="customers" [scrollable]="true" scrollHeight="400px" [tableStyle]="{ 'min-width': '50rem' }">
            <ng-template #header>
                <tr>
                    <th>Name</th>
                    <th>Country</th>
                    <th>Representative</th>
                    <th>Status</th>
                    <th>Balance</th>
                </tr>
            </ng-template>
            <ng-template #body let-customer>
                <tr>
                    <td>
                        <span class="font-medium">{{ customer.name }}</span>
                    </td>
                    <td>
                        <div class="flex items-center gap-2">
                            <img src="https://primefaces.org/cdn/primeng/images/demo/flag/flag_placeholder.png" [class]="'flag flag-' + customer.country.code" style="width: 20px" />
                            <span>{{ customer.country.name }}</span>
                        </div>
                    </td>
                    <td>
                        <div class="flex items-center gap-2">
                            <p-avatar [image]="'https://primefaces.org/cdn/primevue/images/avatar/' + customer.representative.image" shape="circle" />
                            <span class="text-sm">{{ customer.representative.name }}</span>
                        </div>
                    </td>
                    <td>
                        <p-tag [value]="customer.status" [severity]="getSeverity(customer.status)" />
                    </td>
                    <td>
                        <span class="font-semibold">{{ '$' + customer.balance.toLocaleString() }}</span>
                    </td>
                </tr>
            </ng-template>
        </p-table>
    `,
    standalone: true,
    imports: [AvatarModule, TableModule, TagModule],
    providers: [CustomerService],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TableVerticalScrollDemo implements OnInit {
    private customerService = inject(CustomerService);

    private cd = inject(ChangeDetectorRef);

    customers!: Customer[];

    ngOnInit() {
        this.customerService.getCustomersMedium().then((data) => {
            this.customers = data;
        });
    }

    getSeverity(status: string) {
        switch (status) {
            case 'qualified':
                return 'success';
            case 'unqualified':
                return 'danger';
            case 'negotiation':
                return 'warn';
            case 'new':
                return 'info';
            case 'renewal':
                return 'secondary';
            case 'proposal':
                return 'info';
            default:
                return 'secondary';
        }
    }
}
```

## virtualscroll-doc

Virtual Scrolling is an efficient way to render large amount data. Usage is similar to regular scrolling with the addition of virtualScrollerOptions property to define a fixed itemSize . Internally, VirtualScroller component is utilized so refer to the API of VirtualScroller for more information about the available options. In this example, 10000 preloaded records are rendered by the Table.

```typescript
import { Component, OnInit, inject, ChangeDetectionStrategy } from '@angular/core';
import { Table, TableModule } from 'primeng/table';
import { CarService } from '@/service/carservice';
import { Car } from '@/domain/car';

interface Column {
    field: string;
    header: string;
}

@Component({
    template: `
        <p-table [columns]="cols" [value]="cars" [scrollable]="true" scrollHeight="400px" [virtualScroll]="true" [virtualScrollItemSize]="46">
            <ng-template #header let-columns>
                <tr>
                    @for (col of columns; track col) {
                        <th style="width: 20%;">
                            {{ col.header }}
                        </th>
                    }
                </tr>
            </ng-template>
            <ng-template #body let-rowData let-rowIndex="rowIndex" let-columns="columns">
                <tr style="height:46px">
                    @for (col of columns; track col) {
                        <td>
                            {{ rowData[col.field] }}
                        </td>
                    }
                </tr>
            </ng-template>
        </p-table>
    `,
    standalone: true,
    imports: [TableModule],
    providers: [CarService],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TableVirtualScrollDemo implements OnInit {
    cars!: Car[];

    virtualCars!: Car[];

    cols!: Column[];

    private carService = inject(CarService);

    ngOnInit() {
        this.cols = [
            { field: 'id', header: 'Id' },
            { field: 'vin', header: 'Vin' },
            { field: 'year', header: 'Year' },
            { field: 'brand', header: 'Brand' },
            { field: 'color', header: 'Color' }
        ];
        this.cars = Array.from({ length: 10000 }).map((_, i) => this.carService.generateCar(i + 1));
        this.virtualCars = Array.from({ length: 10000 });
    }
}
```

## virtualscrolllazy-doc

VirtualScroller is a performance-approach to handle huge data efficiently. Setting virtualScroll property as true and providing a virtualScrollItemSize in pixels would be enough to enable this functionality. It is also suggested to use the same virtualScrollItemSize value on the tr element inside the body template.

```typescript
import { Component, OnInit, inject, ChangeDetectionStrategy } from '@angular/core';
import { SkeletonModule } from 'primeng/skeleton';
import { TableModule } from 'primeng/table';
import { CarService } from '@/service/carservice';
import { TableLazyLoadEvent } from 'primeng/api';
import { Car } from '@/domain/car';

interface Column {
    field: string;
    header: string;
}

@Component({
    template: `
        <p-table [columns]="cols" [value]="virtualCars" [scrollable]="true" scrollHeight="400px" [rows]="100" [virtualScroll]="true" [virtualScrollItemSize]="46" [lazy]="true" (onLazyLoad)="loadCarsLazy($event)">
            <ng-template #header let-columns>
                <tr>
                    @for (col of columns; track col) {
                        <th style="width: 20%;">
                            {{ col.header }}
                        </th>
                    }
                </tr>
            </ng-template>
            <ng-template #body let-rowData let-columns="columns">
                <tr style="height:46px">
                    @for (col of columns; track col) {
                        <td>
                            {{ rowData[col.field] }}
                        </td>
                    }
                </tr>
            </ng-template>
            <ng-template #loadingbody let-columns="columns">
                <tr style="height:46px">
                    @for (col of columns; track col; let even = $even) {
                        <td>
                            <p-skeleton [style]="{ width: even ? (col.field === 'year' ? '30%' : '40%') : '60%' }" />
                        </td>
                    }
                </tr>
            </ng-template>
        </p-table>
    `,
    standalone: true,
    imports: [SkeletonModule, TableModule],
    providers: [CarService],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TableVirtualScrollLazyDemo implements OnInit {
    cars!: Car[];

    virtualCars!: Car[];

    cols!: Column[];

    private carService = inject(CarService);

    ngOnInit() {
        this.cols = [
            { field: 'id', header: 'Id' },
            { field: 'vin', header: 'Vin' },
            { field: 'year', header: 'Year' },
            { field: 'brand', header: 'Brand' },
            { field: 'color', header: 'Color' }
        ];
        this.cars = Array.from({ length: 10000 }).map((_, i) => this.carService.generateCar(i + 1));
        this.virtualCars = Array.from({ length: 10000 });
    }

    loadCarsLazy(event: TableLazyLoadEvent) {
        //simulate remote connection with a timeout
        setTimeout(
            () => {
                //load data of required page
                let loadedCars = this.cars.slice(event.first, event.first + event.rows);

                //populate page of virtual cars
                Array.prototype.splice.apply(this.virtualCars, [...[event.first, event.rows], ...loadedCars]);

                //trigger change detection
                event.forceUpdate();
            },
            Math.random() * 1000 + 250
        );
    }
}
```

## Table

Table displays data in tabular format.

### Props

| Name | Type | Default | Description |
|------|------|---------|-------------|
| dt | object \| undefined | undefined | Defines scoped design tokens of the component. |
| unstyled | boolean \| undefined | undefined | Indicates whether the component should be rendered without styles. |
| pt | PassThrough<I, TablePassThroughOptions<I>> | undefined | Used to pass attributes to DOM elements inside the component. |
| ptOptions | PassThroughOptions \| undefined | undefined | Used to configure passthrough(pt) options of the component. |
| frozenColumns | any[] \| undefined | - | An array of objects to represent dynamic columns that are frozen. |
| frozenValue | any[] \| undefined | - | An array of objects to display as frozen. |
| tableStyle | { [klass: string]: any } \| null \| undefined | - | Inline style of the table. |
| tableStyleClass | string \| undefined | - | Style class of the table. |
| paginator | boolean \| undefined | - | When specified as true, enables the pagination. |
| pageLinks | number | - | Number of page links to display in paginator. |
| rowsPerPageOptions | any[] \| undefined | - | Array of integer/object values to display inside rows per page dropdown of paginator |
| alwaysShowPaginator | boolean | - | Whether to show it even there is only one page. |
| paginatorPosition | "top" \| "bottom" \| "both" | - | Position of the paginator, options are "top", "bottom" or "both". |
| paginatorStyleClass | string \| undefined | - | Custom style class for paginator |
| paginatorDropdownAppendTo | any | - | Target element to attach the paginator dropdown overlay, valid values are "body" or a local ng-template variable of another element (note: use binding with brackets for template variables, e.g. [appendTo]="mydiv" for a div element having #mydiv as variable name). |
| paginatorDropdownScrollHeight | string | - | Paginator dropdown height of the viewport in pixels, a scrollbar is defined if height of list exceeds this value. |
| currentPageReportTemplate | string | - | Template of the current page report element. Available placeholders are {currentPage},{totalPages},{rows},{first},{last} and {totalRecords} |
| showCurrentPageReport | boolean \| undefined | - | Whether to display current page report. |
| showJumpToPageDropdown | boolean \| undefined | - | Whether to display a dropdown to navigate to any page. |
| showJumpToPageInput | boolean \| undefined | - | Whether to display a input to navigate to any page. |
| showFirstLastIcon | boolean | - | When enabled, icons are displayed on paginator to go first and last page. |
| showPageLinks | boolean | - | Whether to show page links. |
| defaultSortOrder | number | - | Sort order to use when an unsorted column gets sorted by user interaction. |
| sortMode | "single" \| "multiple" | - | Defines whether sorting works on single column or on multiple columns. |
| resetPageOnSort | boolean | - | When true, resets paginator to first page after sorting. Available only when sortMode is set to single. |
| selectionMode | TableSelectionMode \| null \| undefined | - | Specifies the selection mode, valid values are "single" and "multiple". |
| selectionPageOnly | boolean \| undefined | - | When enabled with paginator and checkbox selection mode, the select all checkbox in the header will select all rows on the current page. |
| contextMenuSelectionInput | any | - | Selected row with a context menu. |
| dataKey | string \| undefined | - | A property to uniquely identify a record in data. |
| metaKeySelection | boolean | - | Defines whether metaKey should be considered for the selection. On touch enabled devices, metaKeySelection is turned off automatically. |
| rowSelectable | ((row: { data: any; index: number }) => boolean) \| undefined | - | Defines if the row is selectable. |
| rowTrackBy | Function | - | Function to optimize the dom operations by delegating to ngForTrackBy, default algorithm checks for object identity. |
| lazy | boolean | - | Defines if data is loaded and interacted with in lazy manner. |
| lazyLoadOnInit | boolean | - | Whether to call lazy loading on initialization. |
| compareSelectionBy | "equals" \| "deepEquals" | - | Algorithm to define if a row is selected, valid values are "equals" that compares by reference and "deepEquals" that compares all fields. |
| csvSeparator | string | - | Character to use as the csv separator. |
| exportFilename | string | - | Name of the exported file. |
| filtersInput | { [s: string]: FilterMetadata \| FilterMetadata[] } | - | An array of FilterMetadata objects to provide external filters. |
| globalFilterFields | string[] \| undefined | - | An array of fields as string to use in global filtering. |
| filterDelay | number | - | Delay in milliseconds before filtering the data. |
| filterLocale | string \| undefined | - | Locale to use in filtering. The default locale is the host environment's current locale. |
| expandedRowKeysInput | { [s: string]: boolean } | - | Map instance to keep the expanded rows where key of the map is the data key of the row. |
| editingRowKeysInput | { [s: string]: boolean } | - | Map instance to keep the rows being edited where key of the map is the data key of the row. |
| rowExpandMode | "multiple" \| "single" | - | Whether multiple rows can be expanded at any time. Valid values are "multiple" and "single". |
| scrollable | boolean \| undefined | - | Enables scrollable tables. |
| rowGroupMode | TableRowGroupMode \| undefined | - | Type of the row grouping, valid values are "subheader" and "rowspan". |
| scrollHeight | string \| undefined | - | Height of the scroll viewport in fixed pixels or the "flex" keyword for a dynamic size. |
| virtualScroll | boolean \| undefined | - | Whether the data should be loaded on demand during scroll. |
| virtualScrollItemSize | number \| undefined | - | Height of a row to use in calculations of virtual scrolling. |
| virtualScrollOptions | ScrollerOptions \| undefined | - | Whether to use the scroller feature. The properties of scroller component can be used like an object in it. |
| virtualScrollDelay | number | - | Threshold in milliseconds to delay lazy loading during scrolling. |
| frozenWidth | string \| undefined | - | Width of the frozen columns container. |
| contextMenu | any | - | Local ng-template varilable of a ContextMenu. |
| resizableColumns | boolean \| undefined | - | When enabled, columns can be resized using drag and drop. |
| columnResizeMode | "fit" \| "expand" | - | Defines whether the overall table width should change on column resize, valid values are "fit" and "expand". |
| reorderableColumns | boolean \| undefined | - | When enabled, columns can be reordered using drag and drop. |
| loading | boolean \| undefined | - | Displays a loader to indicate data load is in progress. |
| loadingIcon | string \| undefined | - | The icon to show while indicating data load is in progress. |
| showLoader | boolean | - | Whether to show the loading mask when loading property is true. |
| rowHover | boolean \| undefined | - | Adds hover effect to rows without the need for selectionMode. Note that tr elements that can be hovered need to have "p-selectable-row" class for rowHover to work. |
| customSort | boolean \| undefined | - | Whether to use the default sorting or a custom one using sortFunction. |
| showInitialSortBadge | boolean | - | Whether to use the initial sort badge or not. |
| exportFunction | Function \| undefined | - | Export function. |
| exportHeader | string \| undefined | - | Custom export header of the column to be exported as CSV. |
| stateKey | string \| undefined | - | Unique identifier of a stateful table to use in state storage. |
| stateStorage | "session" \| "local" | - | Defines where a stateful table keeps its state, valid values are "session" for sessionStorage and "local" for localStorage. |
| editMode | "cell" \| "row" | - | Defines the editing mode, valid values are "cell" and "row". |
| groupRowsBy | any | - | Field name to use in row grouping. |
| size | TableSize \| undefined | - | Defines the size of the table. |
| showGridlines | boolean \| undefined | - | Whether to show grid lines between cells. |
| stripedRows | boolean \| undefined | - | Whether to display rows with alternating colors. |
| groupRowsByOrder | number | - | Order to sort when default row grouping is enabled. |
| paginatorLocale | string \| undefined | - | Locale to be used in paginator formatting. |
| valueInput | RowData[] \| undefined | - | An array of objects to display. |
| columnsInput | any[] \| undefined | - | An array of objects to represent dynamic columns. |
| first | number \| null \| undefined | - | Index of the first row to be displayed. |
| rows | number \| undefined | - | Number of rows to display per page. |
| totalRecords | number | - | Number of total records, defaults to length of value when not defined. |
| sortFieldInput | string \| null \| undefined | - | Name of the field to sort data by default. |
| sortOrderInput | number | - | Order to sort when default sorting is enabled. |
| multiSortMetaInput | SortMeta[] \| null \| undefined | - | An array of SortMeta objects to sort the data by default in multiple sort mode. |
| selection | any | - | Selected row in single mode or an array of values in multiple mode. |
| selectAllInput | boolean \| null | - | Whether all data is selected. |

### Emits

| Name | Parameters | Description |
|------|------------|-------------|
| contextMenuSelectionChange | value: any | Callback to invoke on context menu selection change. |
| selectAllChange | event: TableSelectAllChangeEvent | Emits when the all of the items selected or unselected. |
| onRowSelect | event: TableRowSelectEvent<RowData | Callback to invoke when a row is selected. |
| onRowUnselect | event: TableRowUnSelectEvent<RowData | Callback to invoke when a row is unselected. |
| onPage | event: TablePageEvent | Callback to invoke when pagination occurs. |
| onSort | value: any | Callback to invoke when a column gets sorted. |
| onFilter | event: TableFilterEvent | Callback to invoke when data is filtered. |
| onLazyLoad | event: TableLazyLoadEvent | Callback to invoke when paging, sorting or filtering happens in lazy mode. |
| onRowExpand | event: TableRowExpandEvent<RowData | Callback to invoke when a row is expanded. |
| onRowCollapse | event: TableRowCollapseEvent | Callback to invoke when a row is collapsed. |
| onContextMenuSelect | event: TableContextMenuSelectEvent<RowData | Callback to invoke when a row is selected with right click. |
| onColResize | event: TableColResizeEvent | Callback to invoke when a column is resized. |
| onColReorder | event: TableColumnReorderEvent | Callback to invoke when a column is reordered. |
| onRowReorder | event: TableRowReorderEvent | Callback to invoke when a row is reordered. |
| onEditInit | event: TableEditInitEvent | Callback to invoke when a cell switches to edit mode. |
| onEditComplete | event: TableEditCompleteEvent | Callback to invoke when cell edit is completed. |
| onEditCancel | event: TableEditCancelEvent | Callback to invoke when cell edit is cancelled with escape key. |
| onHeaderCheckboxToggle | event: TableHeaderCheckboxToggleEvent | Callback to invoke when state of header checkbox changes. |
| sortFunction | value: any | A function to implement custom sorting, refer to sorting section for details. |
| onStateSave | value: TableState | Callback to invoke table state is saved. |
| onStateRestore | value: TableState | Callback to invoke table state is restored. |

### Methods

| Name | Parameters | Return Type | Description |
|------|------------|-------------|-------------|
| exportCSV | options: ExportCSVOptions | void | Data export method. |
| resetScrollTop |  | void | Resets scroll to top. |
| scrollToVirtualIndex | index: number | void | Scrolls to given index when using virtual scroll. |
| scrollTo | options: any | void | Scrolls to given index. |

## Pass Through Options

| Name | Type | Description |
|------|------|-------------|
| filter | PassThroughOption<HTMLDivElement, I> | Used to pass attributes to the filter container element. |
| pcColumnFilterButton | ButtonPassThrough | Used to pass attributes to the column filter button component. |
| filterOverlay | PassThroughOption<HTMLDivElement, I> | Used to pass attributes to the filter overlay element. |
| filterConstraintList | PassThroughOption<HTMLUListElement, I> | Used to pass attributes to the filter constraint list element. |
| filterConstraint | PassThroughOption<HTMLLIElement, I> | Used to pass attributes to the filter constraint element. |
| filterConstraintSeparator | PassThroughOption<HTMLLIElement, I> | Used to pass attributes to the filter constraint separator element. |
| emtpyFilterLabel | PassThroughOption<HTMLLIElement, I> | Used to pass attributes to the empty filter label element. |
| filterOperator | PassThroughOption<HTMLDivElement, I> | Used to pass attributes to the filter operator element. |
| pcFilterOperatorDropdown | SelectPassThrough | Used to pass attributes to the filter operator dropdown component. |
| filterRuleList | PassThroughOption<HTMLDivElement, I> | Used to pass attributes to the filter rule list element. |
| filterRule | PassThroughOption<HTMLDivElement, I> | Used to pass attributes to the filter rule element. |
| pcFilterConstraintDropdown | SelectPassThrough | Used to pass attributes to the filter constraint dropdown component. |
| pcFilterRemoveRuleButton | ButtonPassThrough | Used to pass attributes to the filter remove rule button component. |
| pcAddRuleButtonLabel | ButtonPassThrough | Used to pass attributes to the add rule button label. |
| filterButtonBar | PassThroughOption<HTMLDivElement, I> | Used to pass attributes to the filter button bar element. |
| pcFilterClearButton | ButtonPassThrough | Used to pass attributes to the filter clear button component. |
| pcFilterApplyButton | ButtonPassThrough | Used to pass attributes to the filter apply button component. |
| pcFilterInputText | InputTextPassThrough | Used to pass attributes to the filter input text component. |
| pcFilterInputNumber | InputNumberPassThrough | Used to pass attributes to the filter input number component. |
| pcFilterCheckbox | CheckboxPassThrough | Used to pass attributes to the filter checkbox component. |
| pcFilterDatePicker | DatePickerPassThrough | Used to pass attributes to the filter datepicker component. |
| motion | MotionOptions | Used to pass options to the motion component/directive. |

## Theming

### CSS Classes

| Class | Description |
|-------|-------------|
| p-datatable | Class name of the root element |
| p-datatable-mask | Class name of the mask element |
| p-datatable-loading-icon | Class name of the loading icon element |
| p-datatable-header | Class name of the header element |
| p-datatable-paginator-[position] | Class name of the paginator element |
| p-datatable-table-container | Class name of the table container element |
| p-datatable-table | Class name of the table element |
| p-datatable-thead | Class name of the thead element |
| p-datatable-column-resizer | Class name of the column resizer element |
| p-datatable-column-header-content | Class name of the column header content element |
| p-datatable-column-title | Class name of the column title element |
| p-datatable-sort-icon | Class name of the sort icon element |
| p-datatable-sort-badge | Class name of the sort badge element |
| p-datatable-filter | Class name of the filter element |
| p-datatable-filter-element-container | Class name of the filter element container element |
| p-datatable-column-filter-button | Class name of the column filter button element |
| p-datatable-column-filter-clear-button | Class name of the column filter clear button element |
| p-datatable-filter-overlay | Class name of the filter overlay element |
| p-datatable-filter-constraint-list | Class name of the filter constraint list element |
| p-datatable-filter-constraint | Class name of the filter constraint element |
| p-datatable-filter-constraint-separator | Class name of the filter constraint separator element |
| p-datatable-filter-operator | Class name of the filter operator element |
| p-datatable-filter-operator-dropdown | Class name of the filter operator dropdown element |
| p-datatable-filter-rule-list | Class name of the filter rule list element |
| p-datatable-filter-rule | Class name of the filter rule element |
| p-datatable-filter-constraint-dropdown | Class name of the filter constraint dropdown element |
| p-datatable-filter-remove-rule-button | Class name of the filter remove rule button element |
| p-datatable-filter-add-rule-button | Class name of the filter add rule button element |
| p-datatable-filter-buttonbar | Class name of the filter buttonbar element |
| p-datatable-filter-clear-button | Class name of the filter clear button element |
| p-datatable-filter-apply-button | Class name of the filter apply button element |
| p-datatable-tbody | Class name of the tbody element |
| p-datatable-row-group-header | Class name of the row group header element |
| p-datatable-row-toggle-button | Class name of the row toggle button element |
| p-datatable-row-toggle-icon | Class name of the row toggle icon element |
| p-datatable-row-expansion | Class name of the row expansion element |
| p-datatable-row-group-footer | Class name of the row group footer element |
| p-datatable-empty-message | Class name of the empty message element |
| p-datatable-reorderable-row-handle | Class name of the reorderable row handle element |
| p-datatable-row-editor-init | Class name of the row editor init element |
| p-datatable-row-editor-save | Class name of the row editor save element |
| p-datatable-row-editor-cancel | Class name of the row editor cancel element |
| p-datatable-tfoot | Class name of the tfoot element |
| p-datatable-virtualscroller-spacer | Class name of the virtual scroller spacer element |
| p-datatable-footer | Class name of the footer element |
| p-datatable-column-resize-indicator | Class name of the column resize indicator element |
| p-datatable-row-reorder-indicator-up | Class name of the row reorder indicator up element |
| p-datatable-row-reorder-indicator-down | Class name of the row reorder indicator down element |
| p-datatable-sortable-column | Class name of the sortable column element |
| p-sortable-column-icon | Class name of the sortable column icon element |
| p-sortable-column-badge | Class name of the sortable column badge element |
| p-datatable-selectable-row | Class name of the selectable row element |
| p-datatable-resizable-column | Class name of the resizable column element |
| p-datatable-row-editor-cancel | Class name of the row editor cancel element |
| p-datatable-frozen-column | Class name of the frozen column element |
| p-datatable-contextmenu-row-selected | Class name of the contextmenu row selected element |
