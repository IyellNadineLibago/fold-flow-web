import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

import { DataService } from '../../services/data.service';
import {
  Order,
  Reservation,
  initialsOf,
  localDateKey,
  timeToMinutes
} from '../../services/models';

/** Orders still in the shop after this many days are flagged for attention. */
const OVERDUE_AFTER_DAYS = 3;

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss'
})
export class Dashboard {
  readonly overdueAfterDays = OVERDUE_AFTER_DAYS;

  constructor(readonly data: DataService) {}

  private get allOrders(): Order[] {
    return this.data.orders();
  }

  private get activeList(): Order[] {
    return this.allOrders.filter(order => order.statusCode !== 'claimed');
  }

  private isToday(date: Date | null): boolean {
    return !!date && localDateKey(date) === localDateKey(new Date());
  }

  get recentOrders(): Order[] {
    return this.allOrders.slice(0, 6);
  }

  get upcomingReservations(): Reservation[] {
    const today = localDateKey(new Date());
    return this.data
      .reservations()
      .filter(
        item =>
          (item.statusCode === 'pending' || item.statusCode === 'confirmed') &&
          item.date >= today
      )
      .sort(
        (a, b) =>
          a.date.localeCompare(b.date) ||
          timeToMinutes(a.time) - timeToMinutes(b.time)
      )
      .slice(0, 5);
  }

  get collectedIncome(): number {
    return this.allOrders
      .filter(order => this.isToday(order.paidAt))
      .reduce((total, order) => total + order.totalFee, 0);
  }

  get completedTransactions(): number {
    return this.allOrders.filter(order => this.isToday(order.claimedAt)).length;
  }

  get activeOrders(): number {
    return this.activeList.length;
  }

  get unclaimedLaundry(): number {
    return this.allOrders.filter(
      order => order.statusCode === 'ready_for_pickup'
    ).length;
  }

  get overdueOrders(): number {
    const cutoff = Date.now() - OVERDUE_AFTER_DAYS * 24 * 60 * 60 * 1000;
    return this.activeList.filter(
      order => order.receivedAt.getTime() < cutoff
    ).length;
  }

  get unpaidOrders(): number {
    return this.activeList.filter(order => order.paymentStatus === 'Unpaid')
      .length;
  }

  initials(name: string): string {
    return initialsOf(name);
  }

  dayOf(date: string): string {
    return date.slice(8, 10);
  }

  monthOf(date: string): string {
    const parsed = new Date(`${date}T00:00:00`);
    return Number.isNaN(parsed.getTime())
      ? ''
      : parsed.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
  }

  formatPeso(amount: number): string {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      maximumFractionDigits: 2
    }).format(amount);
  }
}
