import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { DataService } from '../../services/data.service';
import { Order, localDateKey } from '../../services/models';

interface ActivityItem {
  label: string;
  count: number;
  height: number;
}

@Component({
  selector: 'app-daily-reports',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './daily-reports.html',
  styleUrl: './daily-reports.scss'
})
export class DailyReports {
  fromDate = localDateKey(new Date());
  toDate = localDateKey(new Date());

  appliedFrom = this.fromDate;
  appliedTo = this.toDate;
  errorMessage = '';

  readonly activityHours = [
    { label: '8 AM', hour: 8 },
    { label: '10 AM', hour: 10 },
    { label: '12 PM', hour: 12 },
    { label: '2 PM', hour: 14 },
    { label: '4 PM', hour: 16 },
    { label: '6 PM', hour: 18 }
  ];

  private readonly inventoryRows = [
    { label: 'Pending wash', code: 'received', color: 'amber' },
    { label: 'Washing', code: 'washing', color: 'blue' },
    { label: 'Drying / Folding', code: 'drying', color: 'purple' },
    { label: 'Ready for pickup', code: 'ready_for_pickup', color: 'teal' }
  ];

  constructor(private readonly data: DataService) {}

  applyDates(): void {
    this.errorMessage = '';

    if (!this.fromDate || !this.toDate) {
      this.errorMessage = 'Please select both dates.';
      return;
    }

    if (this.fromDate > this.toDate) {
      this.errorMessage = 'The From date must not be after the To date.';
      return;
    }

    this.appliedFrom = this.fromDate;
    this.appliedTo = this.toDate;
  }

  // ---- data ----------------------------------------------------------------

  get orders(): Order[] {
    return this.data.orders();
  }

  private inRange(date: Date | null): boolean {
    if (!date) return false;
    const key = localDateKey(date);
    return key >= this.appliedFrom && key <= this.appliedTo;
  }

  /** Orders paid inside the selected dates. */
  private get paidInRange(): Order[] {
    return this.orders.filter(order => this.inRange(order.paidAt));
  }

  /** Orders handed over to customers inside the selected dates. */
  private get completedInRange(): Order[] {
    return this.orders.filter(order => this.inRange(order.claimedAt));
  }

  /** Orders received inside the selected dates that are still unpaid. */
  private get unpaidInRange(): Order[] {
    return this.orders.filter(
      order => order.paymentStatus === 'Unpaid' && this.inRange(order.receivedAt)
    );
  }

  /** Everything physically in the shop right now (not date-filtered). */
  get activeOrders(): Order[] {
    return this.orders.filter(order => order.statusCode !== 'claimed');
  }

  get collectedIncome(): number {
    return this.sum(this.paidInRange.map(order => order.totalFee));
  }

  get paidTransactions(): number {
    return this.paidInRange.length;
  }

  get completedTransactions(): number {
    return this.completedInRange.length;
  }

  get processedWeight(): number {
    return this.sum(this.completedInRange.map(order => order.weight));
  }

  get unpaidOrders(): number {
    return this.unpaidInRange.length;
  }

  get outstandingBalance(): number {
    return this.sum(this.unpaidInRange.map(order => order.totalFee));
  }

  get laundryInShop(): number {
    return this.activeOrders.length;
  }

  get totalShopWeight(): number {
    return this.sum(this.activeOrders.map(order => order.weight));
  }

  get inventory() {
    return this.inventoryRows.map(row => ({
      ...row,
      count: this.activeOrders.filter(order => order.statusCode === row.code).length
    }));
  }

  get maxChartValue(): number {
    return Math.max(...this.counts, 1);
  }

  get activity(): ActivityItem[] {
    const max = this.maxChartValue;
    const counts = this.counts;

    return this.activityHours.map((item, index) => ({
      label: item.label,
      count: counts[index],
      height: counts[index] === 0 ? 0 : Math.max(5, (counts[index] / max) * 100)
    }));
  }

  /** Completed orders per two-hour slot, by the time they were claimed. */
  private get counts(): number[] {
    const completed = this.completedInRange;
    return this.activityHours.map(({ hour }) =>
      completed.filter(order => {
        const claimed = order.claimedAt;
        return !!claimed && claimed.getHours() >= hour && claimed.getHours() < hour + 2;
      }).length
    );
  }

  private sum(values: number[]): number {
    return Math.round(values.reduce((total, value) => total + value, 0) * 100) / 100;
  }
}
