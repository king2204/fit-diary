import { add, calorieGoal, macroGrams, scale, zero, type MacroSplit, type Nutrients, type Profile } from './nutrition';

export interface Food {
  id: string; // 'off:<barcode>', 'usda:<fdcId>' or 'my:<id>'
  name: string;
  brand?: string;
  per100: Nutrients; // per 100 g (or ml)
  servingGrams?: number;
  servingLabel?: string;
  portions?: Unit[]; // household measures (1 medium, 1 cup...); [] once looked up and none exist
}

export interface Unit {
  label: string;
  grams: number;
}

const WEIGHT_UNITS: Unit[] = [
  { label: 'g', grams: 1 }, { label: 'oz', grams: 28.3495 }, { label: 'lb', grams: 453.592 }, { label: 'kg', grams: 1000 },
];

// Every way to measure a food: its own portions and serving first, then plain weights.
export function unitsFor(f: Food): Unit[] {
  const units = [...(f.portions ?? [])];
  if (f.servingGrams) units.push({ label: f.servingLabel ? `serving (${f.servingLabel})` : 'serving', grams: f.servingGrams });
  return [...units, ...WEIGHT_UNITS];
}

export const MEALS = ['breakfast', 'lunch', 'dinner', 'snacks'] as const;
export type Meal = (typeof MEALS)[number];

export interface FoodEntry {
  id: string;
  meal: Meal;
  food: Food; // a copy, so the diary never changes if the database does
  grams: number;
  amount?: number; // as entered, e.g. 1.5 ...
  unit?: string; // ... of this unit label, e.g. "cup, sliced"
}

export interface ExerciseEntry {
  id: string;
  name: string;
  minutes: number;
  kcal: number;
}

export interface DayLog {
  foods: FoodEntry[];
  exercises: ExerciseEntry[];
  waterMl: number;
}

export interface Goals extends MacroSplit {
  kcalOverride: number | null; // null = use the calculated goal
  sugarG: number;
  fiberG: number;
  sodiumMg: number;
  waterMl: number;
}

export interface Data {
  version: 1;
  profile: Profile;
  goals: Goals;
  days: Record<string, DayLog>; // keyed by YYYY-MM-DD
  weights: { date: string; kg: number }[]; // sorted by date
  myFoods: Food[];
  recent: Food[];
  usdaKey: string;
}

// Diary from before accounts existed, stored without a user.
export const DEVICE_KEY = 'fit-diary-v1';
// Each account's local copy.
export const userKey = (userId: string) => `${DEVICE_KEY}:${userId}`;
const MAX_RECENT = 40;

export function defaultData(): Data {
  return {
    version: 1,
    profile: { sex: 'female', birthYear: 1995, heightCm: 165, activity: 'light', weeklyChangeKg: -0.5 },
    goals: { kcalOverride: null, carbsPct: 50, proteinPct: 20, fatPct: 30, sugarG: 50, fiberG: 30, sodiumMg: 2300, waterMl: 2000 },
    days: {},
    weights: [],
    myFoods: [],
    recent: [],
    usdaKey: '',
  };
}

export function load(key: string): Data | null {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return parseData(raw);
  } catch (e) {
    console.warn('Could not read saved data.', e);
  }
  return null;
}

export function save(d: Data, key: string): void {
  localStorage.setItem(key, JSON.stringify(d));
}

// Used for loading and for importing a backup file.
export function parseData(json: string): Data {
  const d = JSON.parse(json) as Partial<Data>;
  if (d.version !== 1) throw new Error('This is not a Fit Diary backup.');
  const base = defaultData();
  return { ...base, ...d, profile: { ...base.profile, ...d.profile }, goals: { ...base.goals, ...d.goals } } as Data;
}

export function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function day(d: Data, date: string): DayLog {
  return (d.days[date] ??= { foods: [], exercises: [], waterMl: 0 });
}

export function peekDay(d: Data, date: string): DayLog | undefined {
  return d.days[date];
}

export function addFood(d: Data, date: string, meal: Meal, food: Food, amount: number, unit: Unit): void {
  day(d, date).foods.push({ id: newId(), meal, food, grams: amount * unit.grams, amount, unit: unit.label });
  d.recent = [food, ...d.recent.filter((f) => f.id !== food.id)].slice(0, MAX_RECENT);
}

export function foodTotals(log: DayLog | undefined, meal?: Meal): Nutrients {
  let t = zero();
  for (const e of log?.foods ?? []) if (!meal || e.meal === meal) t = add(t, scale(e.food.per100, e.grams));
  return t;
}

export function exerciseTotal(log: DayLog | undefined): number {
  return (log?.exercises ?? []).reduce((sum, e) => sum + e.kcal, 0);
}

// Latest weight on or before `date`, else the earliest one logged.
export function weightOn(d: Data, date: string): number | null {
  let w: number | null = d.weights[0]?.kg ?? null;
  for (const e of d.weights) if (e.date <= date) w = e.kg;
  return w;
}

export function setWeight(d: Data, date: string, kg: number): void {
  d.weights = [...d.weights.filter((w) => w.date !== date), { date, kg }].sort((a, b) => a.date.localeCompare(b.date));
}

export interface DailyGoals extends Nutrients {
  waterMl: number;
}

export function goalsFor(d: Data, date: string): DailyGoals | null {
  const weight = weightOn(d, date);
  if (weight === null && d.goals.kcalOverride === null) return null;
  const kcal = d.goals.kcalOverride ?? calorieGoal(d.profile, weight!, Number(date.slice(0, 4)));
  return {
    kcal,
    ...macroGrams(kcal, d.goals),
    sugar: d.goals.sugarG,
    fiber: d.goals.fiberG,
    sodium: d.goals.sodiumMg,
    waterMl: d.goals.waterMl,
  };
}

// Local calendar dates as YYYY-MM-DD.
export function isoDate(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

export function shiftDate(date: string, days: number): string {
  const [y, m, dd] = date.split('-').map(Number);
  return isoDate(new Date(y, m - 1, dd + days));
}
