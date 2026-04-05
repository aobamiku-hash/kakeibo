import { Timestamp } from 'firebase/firestore';

/* ── メンバー ── */
export interface Member {
  uid: string;
  displayName: string;
  email: string;
  photoURL?: string;
}

/* ── カテゴリ ── */
export interface Category {
  id: string;
  name: string;
  emoji: string;
  defaultSplit: [number, number]; // [member1%, member2%]
  order: number;
}

/* ── 支出 ── */
export interface Expense {
  id: string;
  yearMonth: string;       // "2026-04"
  categoryId: string;
  amount: number;
  paidBy: string;          // uid
  split: [number, number]; // [member1%, member2%]
  note: string;
  createdAt: Timestamp;
  createdBy: string;       // uid
  subcategory?: string;        // クレカ内訳: "grocery" | "dining" | ...
  subcategoryName?: string;    // クレカ内訳名: "食費" | "外食" | ...
}

/* ── クレカサブカテゴリ定義 ── */
export const CREDIT_SUBCATEGORIES: Record<string, { name: string; emoji: string }> = {
  grocery:   { name: '食費',     emoji: '🛒' },
  dining:    { name: '外食',     emoji: '🍽️' },
  daily:     { name: '日用品',   emoji: '🏪' },
  shopping:  { name: '買い物',   emoji: '🛍️' },
  transport: { name: '交通・車', emoji: '🚗' },
  leisure:   { name: 'レジャー', emoji: '🎯' },
  other:     { name: 'その他',   emoji: '❓' },
};

/* ── 世帯 ── */
export interface Household {
  id: string;
  members: string[];                  // [uid1, uid2]
  memberNames: Record<string, string>;
  memberOrder: string[];              // ordered: [0]=member1, [1]=member2
  inviteCode: string;
  categories: Category[];
  createdAt: Timestamp;
}

/* ── 月次精算 ── */
export interface Settlement {
  yearMonth: string;
  confirmed: boolean;          // しんぺいが確定
  confirmedAt?: Timestamp;
  confirmedBy: string[];
  scheduledPayDate?: string;   // 振込予定日 "YYYY-MM-DD"
  paidAt?: Timestamp;          // ゆかが振込完了した日時
  paidBy?: string;             // 振込したUID
}

/* ── デフォルトカテゴリ ── */
export const DEFAULT_CATEGORIES: Omit<Category, 'id'>[] = [
  { name: '家賃',       emoji: '🏠', defaultSplit: [50, 50], order: 0 },
  { name: '電気ガス',   emoji: '⚡', defaultSplit: [50, 50], order: 1 },
  { name: '水道',       emoji: '💧', defaultSplit: [50, 50], order: 2 },
  { name: 'ネット',     emoji: '📡', defaultSplit: [50, 50], order: 3 },
  { name: 'クレジット', emoji: '💳', defaultSplit: [60, 40], order: 4 },
  { name: '立て替え',   emoji: '🔄', defaultSplit: [0, 100], order: 5 },
  { name: '割り勘',     emoji: '🤝', defaultSplit: [50, 50], order: 6 },
];

/* ── 伝言板メッセージ ── */
export interface Message {
  id: string;
  text: string;
  createdBy: string;       // uid
  createdAt: Timestamp;
}

/* ── 旅行カウントダウン ── */
export interface Trip {
  id: string;
  name: string;
  targetDate: string;      // "2026-08-15"
  emoji: string;
  createdBy: string;
  createdAt: Timestamp;
}
