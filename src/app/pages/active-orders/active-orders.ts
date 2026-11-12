import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { DataService } from '../../services/data.service';
import {
  Order,
  STATUS_OPTIONS,
  initialsOf,
  labelToCode
} from '../../services/models';

const ACTIVE_ONLY = 'Active orders';
const ALL_STATUSES = 'All statuses';

@Component({
  selector: 'app-active-orders',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './active-orders.html',
  styleUrl: './active-orders.scss'
})
export class ActiveOrders {
  searchText = '';
  selectedStatus = ACTIVE_ONLY;

  readonly activeOnly = ACTIVE_ONLY;
  readonly allStatuses = ALL_STATUSES;
  readonly statuses = STATUS_OPTIONS;

  constructor(readonly data: DataService) {}

  get orders(): Order[] {
    return this.data.orders();
  }

  get filteredOrders(): Order[] {
    const query = this.searchText.trim().toLowerCase();

    return this.orders.filter(order => {
      const matchesSearch =
        !query ||
        order.id.toLowerCase().includes(query) ||
        order.customerName.toLowerCase().includes(query) ||
        order.contactNumber.toLowerCase().includes(query);

      const matchesStatus =
        this.selectedStatus === ALL_STATUSES ||
        (this.selectedStatus === ACTIVE_ONLY &&
          order.statusCode !== 'claimed') ||
        order.status === this.selectedStatus;

      return matchesSearch && matchesStatus;
    });
  }

  /** Claiming needs payment first, so it is not offered until the order is paid. */
  canPick(order: Order, status: string): boolean {
    return status !== 'Claimed / Complete' || order.paymentStatus === 'Paid';
  }

  async updateStatus(order: Order, newStatus: string): Promise<void> {
    try {
      await this.data.updateStatus(order, labelToCode(newStatus));
    } catch (error) {
      console.error('Could not update status', error);
      window.alert('Unable to update the status. Please try again.');
    }
  }

  formatDate(dateValue: string): string {
    if (!dateValue) return '—';

    const date = new Date(dateValue);

    if (Number.isNaN(date.getTime())) return '—';

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: '2-digit',
      year: 'numeric'
    });
  }

  getInitials(name: string): string {
    return initialsOf(name);
  }

  trackByOrderId(_index: number, order: Order): string {
    return order.id;
  }
}
