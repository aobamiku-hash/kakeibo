import type { Expense, Category, Household } from '../types';

export interface MonthSummary {
  yearMonth: string;
  totalAmount: number;
  byCategory: { category: Category; total: number }[];
  member1Should: number;
  member2Should: number;
  member1Paid: number;
  member2Paid: number;
  /** 正 = member2 → member1 に振込、負 = member1 → member2 に振込 */
  settlement: number;
}

export function filterLegacyCreditAggregates(expenses: Expense[]): Expense[] {
  const detailMonths = new Set(
    expenses
      .filter((expense) => expense.categoryId === 'cat_4' && !!expense.subcategory)
      .map((expense) => expense.yearMonth),
  );

  if (detailMonths.size === 0) {
    return expenses;
  }

  return expenses.filter(
    (expense) => !(expense.categoryId === 'cat_4' && !expense.subcategory && detailMonths.has(expense.yearMonth)),
  );
}

export function calculateMonthSummary(
  expenses: Expense[],
  household: Household,
): MonthSummary {
  const normalizedExpenses = filterLegacyCreditAggregates(expenses);
  const [member1] = household.memberOrder;

  let totalAmount = 0;
  let member1Should = 0;
  let member2Should = 0;
  let member1Paid = 0;
  let member2Paid = 0;
  const catTotals = new Map<string, number>();

  for (const exp of normalizedExpenses) {
    totalAmount += exp.amount;

    member1Should += exp.amount * (exp.split[0] / 100);
    member2Should += exp.amount * (exp.split[1] / 100);

    if (exp.paidBy === member1) {
      member1Paid += exp.amount;
    } else {
      member2Paid += exp.amount;
    }

    catTotals.set(exp.categoryId, (catTotals.get(exp.categoryId) ?? 0) + exp.amount);
  }

  const byCategory = household.categories
    .filter((c) => catTotals.has(c.id))
    .map((c) => ({ category: c, total: catTotals.get(c.id)! }));

  const roundedTotal = Math.round(totalAmount);
  const roundedM1Should = Math.round(member1Should);

  return {
    yearMonth: normalizedExpenses[0]?.yearMonth ?? expenses[0]?.yearMonth ?? '',
    totalAmount: roundedTotal,
    byCategory,
    member1Should: roundedM1Should,
    member2Should: roundedTotal - roundedM1Should,
    member1Paid: Math.round(member1Paid),
    member2Paid: Math.round(member2Paid),
    settlement: Math.round(member1Paid - member1Should),
  };
}

/** "2026-04" → "2026年4月" */
export function formatYearMonth(ym: string): string {
  const [y, m] = ym.split('-');
  return `${y}年${parseInt(m, 10)}月`;
}

/** 現在の年月を "2026-04" 形式で返す */
export function currentYearMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** 前月 / 翌月の yearMonth を返す */
export function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** 金額フォーマット ¥123,456 */
export function formatCurrency(n: number): string {
  return `¥${Math.abs(n).toLocaleString('ja-JP')}`;
}

/** 今日の日付を "YYYY-MM-DD" 形式で返す（JST基準） */
export function todayDateString(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });
}
