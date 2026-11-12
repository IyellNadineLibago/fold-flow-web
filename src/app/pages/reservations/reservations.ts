import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { DataService } from '../../services/data.service';
import {
  Reservation,
  initialsOf,
  localDateKey,
  timeToMinutes,
  to12Hour
} from '../../services/models';

interface ReservationForm {
  customerName: string;
  contactNumber: string;
  date: string;
  time: string;
}

@Component({
  selector: 'app-reservations',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './reservations.html',
  styleUrl: './reservations.scss'
})
export class Reservations {
  showForm = false;
  form: ReservationForm = this.emptyForm();
  readonly busyId = signal<string | null>(null);

  constructor(
    private readonly data: DataService,
    private readonly router: Router
  ) {}

  private emptyForm(): ReservationForm {
    return { customerName: '', contactNumber: '', date: '', time: '' };
  }

  /** Pending and confirmed bookings, soonest first. */
  get reservations(): Reservation[] {
    return this.data
      .reservations()
      .filter(item => item.statusCode === 'pending' || item.statusCode === 'confirmed')
      .sort(
        (a, b) =>
          a.date.localeCompare(b.date) ||
          timeToMinutes(a.time) - timeToMinutes(b.time)
      );
  }

  get upcomingCount(): number {
    return this.reservations.length;
  }

  get pendingCount(): number {
    return this.reservations.filter(item => item.statusCode === 'pending').length;
  }

  openAddForm(): void {
    this.form = this.emptyForm();
    this.showForm = true;
  }

  cancelForm(): void {
    this.showForm = false;
  }

  async addReservation(): Promise<void> {
    if (
      this.form.customerName.trim().length < 2 ||
      this.form.contactNumber.trim().length < 7 ||
      !this.form.date ||
      !this.form.time
    ) {
      window.alert('Please complete all fields.');
      return;
    }

    if (this.form.date < this.today()) {
      window.alert('Drop-off date cannot be in the past.');
      return;
    }

    try {
      await this.data.createReservation(this.form);
      this.showForm = false;
    } catch (error) {
      console.error('Could not add reservation', error);
      window.alert('Unable to save the reservation. Please try again.');
    }
  }

  async confirm(reservation: Reservation): Promise<void> {
    await this.guard(reservation, () => this.data.confirmReservation(reservation));
  }

  async reschedule(reservation: Reservation): Promise<void> {
    const newDate = window.prompt(
      'Enter new drop-off date (YYYY-MM-DD):',
      reservation.date
    );
    if (newDate === null) return;

    const newTime = window.prompt(
      'Enter new time (e.g. 9:30 AM):',
      reservation.time
    );
    if (newTime === null) return;

    const date = newDate.trim();
    const time = to12Hour(newTime);

    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !/^\d{1,2}:\d{2}\s?(AM|PM)$/i.test(time) ||
      date < this.today()
    ) {
      window.alert('Please enter a valid future date and a time like 9:30 AM.');
      return;
    }

    await this.guard(reservation, () =>
      this.data.rescheduleReservation(reservation, date, time)
    );
  }

  async cancelBooking(reservation: Reservation): Promise<void> {
    if (!window.confirm(`Cancel the booking for ${reservation.customerName}?`)) {
      return;
    }
    await this.guard(reservation, () => this.data.cancelReservation(reservation));
  }

  /** Opens New Order pre-filled; saving it closes the reservation. */
  checkIn(reservation: Reservation): void {
    void this.router.navigate(['/new-order'], {
      queryParams: { reservation: reservation.id }
    });
  }

  private async guard(
    reservation: Reservation,
    action: () => Promise<void>
  ): Promise<void> {
    this.busyId.set(reservation.id);
    try {
      await action();
    } catch (error) {
      console.error('Reservation update failed', error);
      window.alert('Unable to update the reservation. Please try again.');
    } finally {
      this.busyId.set(null);
    }
  }

  today(): string {
    return localDateKey(new Date());
  }

  formatDate(value: string): string {
    if (!value) return '—';

    const date = new Date(`${value}T00:00:00`);

    if (Number.isNaN(date.getTime())) return value;

    return date.toLocaleDateString('en-US', {
      month: 'long',
      day: '2-digit',
      year: 'numeric'
    });
  }

  initials(name: string): string {
    return initialsOf(name);
  }

  trackById(_index: number, reservation: Reservation): string {
    return reservation.id;
  }
}
