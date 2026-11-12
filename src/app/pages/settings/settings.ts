import { CommonModule } from '@angular/common';
import { Component, effect, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { AuthService } from '../../services/auth.service';
import { DataService } from '../../services/data.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './settings.html',
  styleUrl: './settings.scss'
})
export class Settings {
  rate = 0;

  readonly message = signal('');
  readonly messageType = signal<'success' | 'error'>('success');
  readonly saving = signal(false);

  constructor(
    readonly auth: AuthService,
    readonly data: DataService
  ) {
    // Show the saved rate, and follow it if the owner changes it elsewhere.
    effect(() => {
      const saved = this.data.pricePerKilo();
      untracked(() => (this.rate = saved));
    });
  }

  async save(): Promise<void> {
    if (this.saving()) return;
    this.message.set('');

    const rate = Number(this.rate);
    if (!Number.isFinite(rate) || rate <= 0 || rate > 100000) {
      this.message.set('Enter a price per kilo greater than zero.');
      this.messageType.set('error');
      return;
    }

    this.saving.set(true);
    try {
      await this.data.savePricePerKilo(rate);
      this.message.set('Price per kilo saved. New orders will use it.');
      this.messageType.set('success');
    } catch (error) {
      console.error('Could not save rate', error);
      this.message.set('Unable to save. Only the owner account can change the rate.');
      this.messageType.set('error');
    } finally {
      this.saving.set(false);
    }
  }
}
