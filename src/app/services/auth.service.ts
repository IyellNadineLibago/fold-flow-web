import { isPlatformBrowser } from '@angular/common';
import { Inject, Injectable, PLATFORM_ID, computed, signal } from '@angular/core';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

import { auth, db } from './firebase';

export type StaffRole = 'staff' | 'owner';

/** Thrown when the account signs in fine but has no staff/{uid} document. */
export class NotStaffError extends Error {}

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly uid = signal<string | null>(null);
  readonly email = signal<string>('');
  readonly role = signal<StaffRole | null>(null);
  readonly isStaff = computed(() => this.role() !== null);
  readonly isOwner = computed(() => this.role() === 'owner');

  /** Resolves once the first sign-in state (and role) is known. */
  readonly ready: Promise<void>;

  constructor(@Inject(PLATFORM_ID) platformId: object) {
    if (!isPlatformBrowser(platformId)) {
      this.ready = Promise.resolve();
      return;
    }

    this.ready = new Promise<void>(resolve => {
      onAuthStateChanged(auth, async user => {
        if (!user) {
          this.clear();
          resolve();
          return;
        }

        const role = await this.loadRole(user.uid);
        if (role) {
          this.uid.set(user.uid);
          this.email.set(user.email ?? '');
          this.role.set(role);
        } else {
          this.clear();
        }
        resolve();
      });
    });
  }

  async signIn(email: string, password: string): Promise<void> {
    const credential = await signInWithEmailAndPassword(
      auth,
      email.trim(),
      password
    );
    const role = await this.loadRole(credential.user.uid);

    if (!role) {
      await signOut(auth);
      this.clear();
      throw new NotStaffError('This account is not authorized for staff access.');
    }

    this.uid.set(credential.user.uid);
    this.email.set(credential.user.email ?? '');
    this.role.set(role);
  }

  async signOut(): Promise<void> {
    await signOut(auth);
    this.clear();
  }

  private clear(): void {
    this.uid.set(null);
    this.email.set('');
    this.role.set(null);
  }

  private async loadRole(uid: string): Promise<StaffRole | null> {
    try {
      const snapshot = await getDoc(doc(db, 'staff', uid));
      if (!snapshot.exists()) return null;
      return snapshot.data()['role'] === 'owner' ? 'owner' : 'staff';
    } catch {
      return null;
    }
  }
}
