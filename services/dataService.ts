import { ScheduleEvent, ExpenseItem, ExpenseCategory, Booking, TodoItem } from '../types.ts';

// Mock Members removed - fetched from Firestore now

// Mock Schedule
export const MOCK_SCHEDULE: ScheduleEvent[] = [
  { id: '1', date: '2023-11-15', time: '09:00', title: '出發前往東京', location: '桃園機場 (TPE)', type: 'transport' },
  { id: '2', date: '2023-11-15', time: '14:00', title: '飯店 Check-in', location: '新宿格蘭貝爾飯店', type: 'hotel' },
  { 
    id: '3', 
    date: '2023-11-15', 
    time: '18:00', 
    title: '一蘭拉麵晚餐', 
    location: '新宿東口', 
    type: 'food',
    photoUrl: 'https://images.unsplash.com/photo-1591814468924-caf88d1232e1?q=80&w=1000&auto=format&fit=crop'
  },
  { id: '4', date: '2023-11-16', time: '10:00', title: '淺草寺參拜', location: '淺草', type: 'sightseeing' },
  { id: '5', date: '2023-11-16', time: '13:00', title: '晴空塔購物趣', location: '晴空街道', type: 'shopping' },
];

// Mock Expenses
export const MOCK_EXPENSES: ExpenseItem[] = [
  { id: '1', amount: 35000, currency: 'JPY', category: ExpenseCategory.ACCOMMODATION, description: '飯店押金', payerId: '1', splitWith: ['1', '2', '3'], date: '2023-10-01', exchangeRate: 0.22 },
  { id: '2', amount: 12000, currency: 'TWD', category: ExpenseCategory.TICKET, description: '來回機票', payerId: '1', splitWith: ['1'], date: '2023-09-15', exchangeRate: 1 },
];

// Mock Bookings
export const MOCK_BOOKINGS: Booking[] = [
  { id: '1', type: 'flight', title: 'JL 098 - 台北 往 東京', referenceNo: 'R5X9Y2', dateStart: '2023-11-15 08:45', location: '第二航廈' },
  { id: '2', type: 'hotel', title: '新宿格蘭貝爾飯店', referenceNo: 'B-112233', dateStart: '2023-11-15', dateEnd: '2023-11-20', location: '新宿區' },
  { id: '3', type: 'car', title: 'Toyota Yaris 租車', referenceNo: 'C-998877', dateStart: '2023-11-17 10:00', dateEnd: '2023-11-19 18:00', location: '新宿站前店' },
  { id: '4', type: 'ticket', title: '東京迪士尼陸地一日券', referenceNo: 'T-DISNEY-01', dateStart: '2023-11-18', location: '舞濱' },
  { id: '5', type: 'ticket', title: 'Shibuya Sky 展望台', referenceNo: 'T-SHIBUYA-02', dateStart: '2023-11-16 16:00', location: '澀谷 Scramble Square' },
];

// Mock Todos
export const MOCK_TODOS: TodoItem[] = [
  { id: '1', text: '買網卡/漫遊', completed: true, type: 'general' },
  { id: '2', text: '換日幣', completed: false, type: 'general' },
  { id: '3', text: '帶牙刷牙膏', completed: false, type: 'packing' },
];