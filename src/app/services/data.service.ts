import { Injectable, effect, signal, untracked } from '@angular/core';
import {
  Unsubscribe,
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  DocumentData
} from 'firebase/firestore';

import { AuthService } from './auth.service';
import { db } from './firebase';
import {
  Order,
  Reservation,
  ReservationStatusCode,
  STATUS_LABELS,
  StatusCode,
  to12Hour
} from './models';

const FIRST_ORDER_NUMBER = 1001;
const DEFAULT_PRICE_PER_KILO = 60;

function toDate(value: unknown): Date | null {
  const candidate = value as { toDate?: () => Date } | null | undefined;
  return candidate && typeof candidate.toDate === 'function'
    ? candidate.toDate()
    : null;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** "Maria Santos" -> "Maria S."  (the only name customers can ever see) */
function publicName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return parts[0] ?? '';
  return `${parts[0]} ${parts[parts.length - 1].charAt(0).toUpperCase()}.`;
}

/** "0917 123 4567" -> "•••• 4567" */
function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  return digits.length >= 4 ? `•••• ${digits.slice(-4)}` : '••••';
}

function randomReference(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let text = '';
  for (let i = 0; i < 6; i++) {
    text += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }
  return `REQ-${text}`;
}

/**
 * Live Firestore data for the whole dashboard.
 *
 * Every page reads these signals, so an order or reservation created in the
 * mobile app shows up here by itself, and every change made here reaches the
 * app's tracking screen through the `tracking/{orderId}` document.
 */
@Injectable({ providedIn: 'root' })
export class DataService {
  readonly orders = signal<Order[]>([]);
  readonly reservations = signal<Reservation[]>([]);
  readonly pricePerKilo = signal<number>(DEFAULT_PRICE_PER_KILO);
  readonly nextOrderNumber = signal<number>(FIRST_ORDER_NUMBER);
  readonly loaded = signal(false);
  readonly connectionError = signal('');

  private unsubscribes: Unsubscribe[] = [];
  private started = false;

  constructor(private readonly auth: AuthService) {
    effect(() => {
      const signedIn = this.auth.isStaff();
      untracked(() => (signedIn ? this.start() : this.stop()));
    });
  }

  // -------------------------------------------------------------------------
  // Live subscriptions
  // -------------------------------------------------------------------------

  private start(): void {
    if (this.started) return;
    this.started = true;
    this.connectionError.set('');

    const onError = (error: Error) => {
      console.error('FoldFlow Firestore listener error', error);
      this.connectionError.set(
        'Live data connection problem. Check your internet and refresh.'
      );
    };

    this.unsubscribes.push(
      onSnapshot(
        query(collection(db, 'orders'), orderBy('receivedAt', 'desc'), limit(1000)),
        { includeMetadataChanges: false },
        snapshot => {
          this.orders.set(
            snapshot.docs.map(item =>
              this.toOrder(item.id, item.data({ serverTimestamps: 'estimate' }))
            )
          );
          this.loaded.set(true);
          this.connectionError.set('');
        },
        onError
      ),

      onSnapshot(
        query(collection(db, 'reservations'), orderBy('createdAt', 'desc'), limit(300)),
        snapshot => {
          this.reservations.set(
            snapshot.docs.map(item =>
              this.toReservation(item.id, item.data({ serverTimestamps: 'estimate' }))
            )
          );
        },
        onError
      ),

      onSnapshot(
        doc(db, 'settings', 'pricing'),
        snapshot => {
          const rate = Number(snapshot.data()?.['pricePerKg']);
          this.pricePerKilo.set(
            Number.isFinite(rate) && rate > 0 ? rate : DEFAULT_PRICE_PER_KILO
          );
        },
        onError
      ),

      onSnapshot(
        doc(db, 'counters', 'orders'),
        snapshot => {
          const next = Number(snapshot.data()?.['next']);
          this.nextOrderNumber.set(
            Number.isFinite(next) && next >= FIRST_ORDER_NUMBER
              ? next
              : FIRST_ORDER_NUMBER
          );
        },
        onError
      )
    );
  }

  private stop(): void {
    this.unsubscribes.forEach(unsubscribe => unsubscribe());
    this.unsubscribes = [];
    this.started = false;
    this.orders.set([]);
    this.reservations.set([]);
    this.loaded.set(false);
  }

  // -------------------------------------------------------------------------
  // Mapping
  // -------------------------------------------------------------------------

  private toOrder(id: string, data: DocumentData): Order {
    const statusCode = (data['status'] as StatusCode) ?? 'received';
    const receivedAt = toDate(data['receivedAt']) ?? new Date();
    const paid = data['paymentStatus'] === 'paid';

    return {
      id,
      customerName: String(data['customerName'] ?? ''),
      contactNumber: String(data['contactNumber'] ?? ''),
      weight: Number(data['weightKg'] ?? 0),
      pricePerKilo: Number(data['pricePerKg'] ?? 0),
      totalFee: Number(data['totalAmount'] ?? 0),
      paymentStatus: paid ? 'Paid' : 'Unpaid',
      paymentMethod: String(data['paymentMethod'] ?? ''),
      status: STATUS_LABELS[statusCode] ?? STATUS_LABELS.received,
      statusCode,
      date: receivedAt.toISOString(),
      receivedAt,
      paidAt: toDate(data['paidAt']),
      claimedAt: toDate(data['claimedAt']),
      reservationId: (data['reservationId'] as string | null) ?? null
    };
  }

  private toReservation(id: string, data: DocumentData): Reservation {
    const statusCode = (data['status'] as ReservationStatusCode) ?? 'pending';
    return {
      id,
      customerName: String(data['customerName'] ?? ''),
      contactNumber: String(data['contactNumber'] ?? ''),
      date: String(data['dropOffDate'] ?? ''),
      time: String(data['dropOffTime'] ?? ''),
      status: statusCode === 'pending' ? 'Pending' : 'Confirmed',
      statusCode,
      orderId: (data['orderId'] as string | null) ?? null,
      source: String(data['source'] ?? 'app')
    };
  }

  // -------------------------------------------------------------------------
  // Orders
  // -------------------------------------------------------------------------

  /**
   * Receives laundry at the counter: issues the next Order ID, saves the
   * order, publishes the customer's tracking card and (when the laundry came
   * from a booking) links and closes the reservation. All in one transaction,
   * so two staff members can never get the same Order ID.
   */
  async createOrder(input: {
    customerName: string;
    contactNumber: string;
    weightKg: number;
    reservationId?: string | null;
  }): Promise<Order> {
    const pricePerKg = this.pricePerKilo();
    const weightKg = round2(input.weightKg);
    const totalAmount = round2(weightKg * pricePerKg);
    const customerName = input.customerName.trim();
    const contactNumber = input.contactNumber.trim();
    const actor = this.auth.uid();
    const counterRef = doc(db, 'counters', 'orders');
    const reservationRef = input.reservationId
      ? doc(db, 'reservations', input.reservationId)
      : null;

    const orderId = await runTransaction(db, async transaction => {
      // All reads first.
      const counter = await transaction.get(counterRef);
      const stored = Number(counter.data()?.['next']);
      const number =
        Number.isFinite(stored) && stored >= FIRST_ORDER_NUMBER
          ? stored
          : FIRST_ORDER_NUMBER;
      const id = `ORD-${number}`;

      const orderRef = doc(db, 'orders', id);
      const trackingRef = doc(db, 'tracking', id);

      let reservationReference: string | null = null;
      if (reservationRef) {
        const reservation = await transaction.get(reservationRef);
        if (reservation.exists()) reservationReference = reservationRef.id;
      }

      // Then writes.
      transaction.set(counterRef, { next: number + 1 });

      transaction.set(orderRef, {
        orderId: id,
        customerName,
        contactNumber,
        weightKg,
        pricePerKg,
        totalAmount,
        status: 'received',
        paymentStatus: 'unpaid',
        paymentMethod: null,
        paidAt: null,
        claimedAt: null,
        reservationId: reservationReference,
        receivedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: actor
      });

      transaction.set(trackingRef, {
        orderId: id,
        customerName: publicName(customerName),
        contactNumber: maskPhone(contactNumber),
        weightKg,
        totalAmount,
        status: 'received',
        paymentStatus: 'unpaid',
        paymentMethod: null,
        paidAmount: null,
        reservationReference,
        receivedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      transaction.set(doc(collection(orderRef, 'history')), {
        type: 'order_received',
        message: `Laundry received from ${customerName} · ${weightKg.toFixed(1)} kg`,
        actorUid: actor,
        createdAt: serverTimestamp()
      });

      if (reservationReference && reservationRef) {
        transaction.update(reservationRef, {
          status: 'checked_in',
          orderId: id
        });
      }

      return id;
    });

    return {
      id: orderId,
      customerName,
      contactNumber,
      weight: weightKg,
      pricePerKilo: pricePerKg,
      totalFee: totalAmount,
      paymentStatus: 'Unpaid',
      paymentMethod: '',
      status: STATUS_LABELS.received,
      statusCode: 'received',
      date: new Date().toISOString(),
      receivedAt: new Date(),
      paidAt: null,
      claimedAt: null,
      reservationId: input.reservationId ?? null
    };
  }

  /** Changes the laundry status; the customer's tracking card follows. */
  async updateStatus(order: Order, status: StatusCode): Promise<void> {
    if (order.statusCode === status) return;

    const orderRef = doc(db, 'orders', order.id);
    const batch = writeBatch(db);

    batch.update(orderRef, {
      status,
      updatedAt: serverTimestamp(),
      ...(status === 'claimed' ? { claimedAt: serverTimestamp() } : {})
    });
    batch.update(doc(db, 'tracking', order.id), {
      status,
      updatedAt: serverTimestamp()
    });
    batch.set(doc(collection(orderRef, 'history')), {
      type: status === 'claimed' ? 'order_released' : 'status_changed',
      message:
        status === 'claimed'
          ? `Laundry released to ${order.customerName}`
          : `Status changed to ${STATUS_LABELS[status]}`,
      actorUid: this.auth.uid(),
      createdAt: serverTimestamp()
    });

    await batch.commit();
  }

  async recordPayment(order: Order, method: string): Promise<void> {
    const orderRef = doc(db, 'orders', order.id);
    const batch = writeBatch(db);

    batch.update(orderRef, {
      paymentStatus: 'paid',
      paymentMethod: method,
      paidAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    batch.update(doc(db, 'tracking', order.id), {
      paymentStatus: 'paid',
      paymentMethod: method,
      paidAmount: order.totalFee,
      updatedAt: serverTimestamp()
    });
    batch.set(doc(collection(orderRef, 'history')), {
      type: 'payment_recorded',
      message: `Payment of ${order.totalFee.toFixed(2)} recorded via ${method}`,
      actorUid: this.auth.uid(),
      createdAt: serverTimestamp()
    });

    await batch.commit();
  }

  // -------------------------------------------------------------------------
  // Reservations
  // -------------------------------------------------------------------------

  async confirmReservation(reservation: Reservation): Promise<void> {
    await updateDoc(doc(db, 'reservations', reservation.id), {
      status: 'confirmed'
    });
  }

  async rescheduleReservation(
    reservation: Reservation,
    date: string,
    time: string
  ): Promise<void> {
    await updateDoc(doc(db, 'reservations', reservation.id), {
      dropOffDate: date,
      dropOffTime: to12Hour(time)
    });
  }

  async cancelReservation(reservation: Reservation): Promise<void> {
    await updateDoc(doc(db, 'reservations', reservation.id), {
      status: 'cancelled'
    });
  }

  /** A booking taken by staff (phone call, walk-in). Starts as confirmed. */
  async createReservation(input: {
    customerName: string;
    contactNumber: string;
    date: string;
    time: string;
  }): Promise<void> {
    const reference = randomReference();
    await setDoc(doc(db, 'reservations', reference), {
      reference,
      customerUid: this.auth.uid(),
      customerName: input.customerName.trim(),
      contactNumber: input.contactNumber.trim(),
      dropOffDate: input.date,
      dropOffTime: to12Hour(input.time),
      status: 'confirmed',
      orderId: null,
      source: 'web',
      createdAt: serverTimestamp()
    });
  }

  // -------------------------------------------------------------------------
  // Settings
  // -------------------------------------------------------------------------

  async savePricePerKilo(rate: number): Promise<void> {
    await setDoc(doc(db, 'settings', 'pricing'), {
      pricePerKg: round2(rate),
      updatedAt: serverTimestamp(),
      updatedBy: this.auth.uid()
    });
  }
}
