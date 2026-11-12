/**
 * The data contract shared with the FoldFlow mobile app.
 *
 * Firestore stores status CODES (same strings the app uses). The dashboard
 * shows friendlier LABELS. Keep both lists in this one file.
 */
export type StatusCode =
  | 'received'
  | 'washing'
  | 'drying'
  | 'ready_for_pickup'
  | 'claimed';

export const STATUS_LABELS: Record<StatusCode, string> = {
  received: 'Pending',
  washing: 'Washing',
  drying: 'Drying / Folding',
  ready_for_pickup: 'Ready for Pickup',
  claimed: 'Claimed / Complete'
};

export const STATUS_CODES = Object.keys(STATUS_LABELS) as StatusCode[];

export const STATUS_OPTIONS: string[] = STATUS_CODES.map(
  code => STATUS_LABELS[code]
);

export function labelToCode(label: string): StatusCode {
  const found = STATUS_CODES.find(code => STATUS_LABELS[code] === label);
  return found ?? 'received';
}

export type ReservationStatusCode =
  | 'pending'
  | 'confirmed'
  | 'checked_in'
  | 'cancelled';

export interface Order {
  id: string;
  customerName: string;
  contactNumber: string;
  weight: number;
  pricePerKilo: number;
  totalFee: number;
  paymentStatus: 'Paid' | 'Unpaid';
  paymentMethod: string;
  /** Display label, e.g. "Ready for Pickup". */
  status: string;
  statusCode: StatusCode;
  /** ISO string of when the laundry was received. */
  date: string;
  receivedAt: Date;
  paidAt: Date | null;
  claimedAt: Date | null;
  reservationId: string | null;
}

export interface Reservation {
  id: string;
  customerName: string;
  contactNumber: string;
  /** YYYY-MM-DD */
  date: string;
  /** e.g. "9:30 AM" (same text the app sends) */
  time: string;
  status: 'Pending' | 'Confirmed';
  statusCode: ReservationStatusCode;
  orderId: string | null;
  source: string;
}

/** "09:30" -> "9:30 AM". Text that is already in 12h form is returned as is. */
export function to12Hour(value: string): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return value.trim();
  const hours = Number(match[1]);
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const display = hours % 12 === 0 ? 12 : hours % 12;
  return `${display}:${match[2]} ${suffix}`;
}

/** "9:30 AM" or "09:30" -> minutes after midnight (for sorting). */
export function timeToMinutes(value: string): number {
  const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i.exec(value.trim());
  if (!match) return 0;
  let hours = Number(match[1]);
  const suffix = match[3]?.toUpperCase();
  if (suffix === 'PM' && hours < 12) hours += 12;
  if (suffix === 'AM' && hours === 12) hours = 0;
  return hours * 60 + Number(match[2]);
}

export function localDateKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
}

export function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part.charAt(0))
    .join('')
    .toUpperCase();
}
