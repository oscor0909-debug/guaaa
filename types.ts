export interface Member {
  id: string;
  name: string;
  avatar: string;
}

export interface TripInfo {
  title: string;
  location: string;
  startDate: string; // YYYY-MM-DD
  durationDays: number;
}

export interface DayConfig {
  date: string; // ID will be the date string YYYY-MM-DD
  location: string;
  note: string;
}

export enum ExpenseCategory {
  FOOD = 'Food',
  TRANSPORT = 'Transport',
  SHOPPING = 'Shopping',
  ACCOMMODATION = 'Hotel',
  TICKET = 'Ticket',
  OTHER = 'Other'
}

export interface ExpenseItem {
  id: string;
  amount: number; // In foreign currency
  currency: string;
  category: ExpenseCategory;
  description: string;
  payerId: string;
  splitWith: string[]; // List of member IDs
  date: string; // ISO date
  exchangeRate: number; // Rate to home currency
}

export interface ScheduleEvent {
  id: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  title: string;
  location: string;
  type: 'sightseeing' | 'food' | 'transport' | 'hotel' | 'shopping';
  notes?: string;
  photoUrl?: string;
}

export interface Booking {
  id: string;
  type: 'flight' | 'hotel' | 'car' | 'ticket';
  title: string; // e.g., "Flight JL123" or "Hilton Tokyo"
  referenceNo: string;
  dateStart: string;
  dateEnd?: string;
  location?: string;
  origin?: string;      // New: Departure Airport/City
  destination?: string; // New: Arrival Airport/City
  files?: string[]; // URLs to PDF/Images
  isSecure?: boolean; // Requires PIN
}

export interface TodoItem {
  id: string;
  text: string;
  completed: boolean;
  assignedTo?: string; // Member ID
  type: 'general' | 'shopping' | 'packing';
}