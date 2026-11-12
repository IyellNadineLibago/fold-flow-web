import { Component } from '@angular/core';
import {
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet
} from '@angular/router';

import { AuthService } from './services/auth.service';
import { DataService } from './services/data.service';
import { initialsOf } from './services/models';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  readonly navigation = [
    { label: 'Dashboard', path: '/dashboard', icon: '▦' },
    { label: 'New Order', path: '/new-order', icon: '+' },
    { label: 'Active Orders', path: '/active-orders', icon: '♧' },
    { label: 'Reservations', path: '/reservations', icon: '▣' },
    { label: 'Claim Order', path: '/claim-order', icon: '✓' },
    { label: 'Daily Reports', path: '/daily-reports', icon: '▥' },
    { label: 'Settings', path: '/settings', icon: '⚙' }
  ];

  constructor(
    private router: Router,
    readonly auth: AuthService,
    readonly data: DataService
  ) {}

  get isLoginPage(): boolean {
    return this.router.url.split('?')[0].split('#')[0] === '/login';
  }

  get badge(): string {
    const email = this.auth.email();
    return email ? initialsOf(email.split('@')[0].replace(/[._-]+/g, ' ')) : '?';
  }

  get roleLabel(): string {
    return this.auth.isOwner() ? 'Owner account' : 'Staff account';
  }

  get pendingReservations(): number {
    return this.data
      .reservations()
      .filter(item => item.statusCode === 'pending').length;
  }

  async signOut(): Promise<void> {
    await this.auth.signOut();
    await this.router.navigateByUrl('/login');
  }
}
