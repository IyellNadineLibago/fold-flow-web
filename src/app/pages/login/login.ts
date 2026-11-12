import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { AuthService, NotStaffError } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.html',
  styleUrl: './login.scss'
})
export class Login {
  email = '';
  password = '';
  showPassword = false;

  readonly loading = signal(false);
  readonly errorMessage = signal('');

  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  async submitLogin(): Promise<void> {
    this.errorMessage.set('');

    if (!this.email.trim() || !this.password) {
      this.errorMessage.set('Please enter your email and password.');
      return;
    }

    this.loading.set(true);

    try {
      await this.authService.signIn(this.email, this.password);
      await this.router.navigateByUrl('/dashboard');
    } catch (error) {
      if (error instanceof NotStaffError) {
        this.errorMessage.set(error.message);
        return;
      }

      const code = (error as { code?: string }).code ?? '';
      this.errorMessage.set(
        code === 'auth/network-request-failed'
          ? 'Unable to connect. Please check your internet connection.'
          : 'Invalid email or password.'
      );
    } finally {
      this.loading.set(false);
    }
  }
}
