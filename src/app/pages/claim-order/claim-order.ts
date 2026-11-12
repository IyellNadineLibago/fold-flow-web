import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { DataService } from '../../services/data.service';
import { Order } from '../../services/models';

@Component({
  selector: 'app-claim-order',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './claim-order.html',
  styleUrl: './claim-order.scss'
})
export class ClaimOrder {
  searchId = '';
  paymentMethod = 'Cash';

  readonly foundId = signal<string | null>(null);
  readonly message = signal('');
  readonly messageType = signal<'success' | 'error' | ''>('');
  readonly saving = signal(false);

  constructor(private readonly data: DataService) {}

  /** Looked up live, so a status change made elsewhere shows up here too. */
  get foundOrder(): Order | null {
    const id = this.foundId();
    return id ? (this.data.orders().find(item => item.id === id) ?? null) : null;
  }

  searchOrder(): void {
    this.message.set('');
    this.messageType.set('');
    this.foundId.set(null);

    const id = this.searchId.trim().toUpperCase();

    if (!id) {
      this.showMessage('Please enter an order ID.', 'error');
      return;
    }

    const order = this.data.orders().find(item => item.id.toUpperCase() === id);

    if (!order) {
      this.showMessage('Order not found. Please check the order ID.', 'error');
      return;
    }

    this.foundId.set(order.id);
  }

  async recordPayment(): Promise<void> {
    const order = this.foundOrder;
    if (!order || this.saving()) return;

    if (order.statusCode !== 'ready_for_pickup') {
      this.showMessage(
        'Only orders marked Ready for Pickup can be claimed.',
        'error'
      );
      return;
    }

    if (order.paymentStatus === 'Paid') {
      this.showMessage('This order is already paid.', 'success');
      return;
    }

    const confirmed = window.confirm(
      `Record ₱${order.totalFee.toFixed(2)} payment via ${this.paymentMethod}?`
    );
    if (!confirmed) return;

    await this.run(
      () => this.data.recordPayment(order, this.paymentMethod),
      'Payment recorded.'
    );
  }

  async completeClaim(): Promise<void> {
    const order = this.foundOrder;
    if (!order || this.saving()) return;

    if (order.statusCode !== 'ready_for_pickup') {
      this.showMessage('This order is not ready for pickup yet.', 'error');
      return;
    }

    if (order.paymentStatus !== 'Paid') {
      this.showMessage(
        'Please record payment before completing the claim.',
        'error'
      );
      return;
    }

    const confirmed = window.confirm(
      `Confirm that ${order.customerName} has collected the laundry?`
    );
    if (!confirmed) return;

    await this.run(
      () => this.data.updateStatus(order, 'claimed'),
      'Order claimed and completed.'
    );
  }

  clearSearch(): void {
    this.searchId = '';
    this.foundId.set(null);
    this.message.set('');
    this.messageType.set('');
  }

  private async run(action: () => Promise<void>, success: string): Promise<void> {
    this.saving.set(true);
    try {
      await action();
      this.showMessage(success, 'success');
    } catch (error) {
      console.error('Claim action failed', error);
      this.showMessage('Unable to save changes. Please try again.', 'error');
    } finally {
      this.saving.set(false);
    }
  }

  private showMessage(text: string, type: 'success' | 'error'): void {
    this.message.set(text);
    this.messageType.set(type);
  }
}
