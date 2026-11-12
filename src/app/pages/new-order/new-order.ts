import { CommonModule } from '@angular/common';
import { Component, effect, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { DataService } from '../../services/data.service';
import { Order } from '../../services/models';

@Component({
  selector: 'app-new-order',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './new-order.html',
  styleUrl: './new-order.scss'
})
export class NewOrder {
  customerName = '';
  contactNumber = '';
  weight = 0;

  readonly message = signal('');
  readonly messageType = signal<'success' | 'error'>('success');
  readonly saving = signal(false);
  /** The ticket shown after a successful save. */
  readonly ticket = signal<Order | null>(null);

  /** Set when staff arrive here from "Check in" on a reservation. */
  reservationId: string | null;
  private prefilled = false;

  constructor(
    readonly data: DataService,
    route: ActivatedRoute,
    private router: Router
  ) {
    this.reservationId = route.snapshot.queryParamMap.get('reservation');

    effect(() => {
      const reservations = this.data.reservations();
      if (!this.reservationId || this.prefilled) return;

      const match = reservations.find(item => item.id === this.reservationId);
      if (!match) return;

      untracked(() => {
        this.customerName = match.customerName;
        this.contactNumber = match.contactNumber;
        this.prefilled = true;
      });
    });
  }

  /** Shop-wide rate, set by the owner under Settings. */
  get pricePerKilo(): number {
    return this.data.pricePerKilo();
  }

  get totalFee(): number {
    return (
      Math.round(Math.max(0, Number(this.weight) || 0) * this.pricePerKilo * 100) /
      100
    );
  }

  get nextOrderId(): string {
    return `ORD-${this.data.nextOrderNumber()}`;
  }

  async saveOrder(): Promise<void> {
    if (this.saving()) return;
    this.message.set('');

    const name = this.customerName.trim();
    const phone = this.contactNumber.trim();
    const weight = Number(this.weight);

    if (name.length < 2 || phone.length < 7) {
      this.showMessage(
        'Please enter the customer name and a valid contact number.',
        'error'
      );
      return;
    }

    if (!Number.isFinite(weight) || weight <= 0) {
      this.showMessage('Laundry weight must be greater than zero.', 'error');
      return;
    }

    this.saving.set(true);

    try {
      const order = await this.data.createOrder({
        customerName: name,
        contactNumber: phone,
        weightKg: weight,
        reservationId: this.reservationId
      });

      this.ticket.set(order);
      this.customerName = '';
      this.contactNumber = '';
      this.weight = 0;
    } catch (error) {
      console.error('Could not save order', error);
      this.showMessage('Unable to save the order. Please try again.', 'error');
    } finally {
      this.saving.set(false);
    }
  }

  printTicket(): void {
    window.print();
  }

  newOrder(): void {
    this.ticket.set(null);
    this.message.set('');
    // Leave the reservation link behind so the next order starts blank.
    this.reservationId = null;
    void this.router.navigate(['/new-order']);
  }

  private showMessage(text: string, type: 'success' | 'error'): void {
    this.message.set(text);
    this.messageType.set(type);
  }
}
