import {
  AUTO_SODIUM, MICRO_KEYS, NUTRIENT_KEYS, add, addMicros, autoFiber, autoSugar, calorieGoal, fiveWeekWeight, macroGrams, maintenanceKcal,
  microGoals, scale, scaleMicros, zero, type MacroSplit, type Micro, type Micros, type Nutrients, type Profile,
} from './nutrition';

export interface Food {
  id: string; // 'off:<barcode>', 'usda:<fdcId>' or 'my:<id>'
  name: string;
  brand?: string;
  per100: Nutrients; // per 100 g (or ml)
  micros?: Micros; // per 100 g; only what the database lists
  note?: string; // e.g. how an estimate was made
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

export const DEFAULT_MEAL_NAMES: Record<Meal, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snacks: 'Snacks' };

// One food in an amount: a diary entry, an item of a saved meal, or a recipe ingredient.
export interface MealItem {
  id: string;
  food: Food; // a copy, so the diary never changes if the database does
  grams: number;
  amount?: number; // as entered, e.g. 1.5 ...
  unit?: string; // ... of this unit label, e.g. "cup, sliced"
}

export interface FoodEntry extends MealItem {
  meal: Meal;
}

export interface ExerciseEntry {
  id: string;
  name: string;
  minutes: number;
  kcal: number;
  sets?: number; // strength training
  reps?: number;
  kg?: number;
}

export interface DayLog {
  foods: FoodEntry[];
  exercises: ExerciseEntry[];
  waterMl: number;
  steps?: number;
  notes?: string;
  complete?: boolean;
}

export interface Goals extends MacroSplit {
  kcalOverride: number | null; // null = use the calculated goal
  sugarG: number | null; // null = calculated from the calorie goal
  fiberG: number | null;
  sodiumMg: number | null;
  waterMl: number;
  goalWeightKg: number | null;
  steps: number;
  workoutsPerWeek: number;
  minutesPerWorkout: number;
}

// Foods logged together, like "My usual breakfast".
export interface SavedMeal {
  id: string;
  name: string;
  items: MealItem[];
}

// A dish made from ingredients and split into servings.
export interface Recipe {
  id: string;
  name: string;
  servings: number;
  items: MealItem[];
}

export interface MyExercise {
  id: string;
  name: string;
  kcalPerMin: number;
}

export interface Fast {
  id: string;
  start: string; // ISO date-time
  end?: string; // missing while the fast is running
  hours: number; // the plan, e.g. 16 for 16:8
}

export const MEASURES = {
  bodyfat: 'Body fat (%)', waist: 'Waist (cm)', hips: 'Hips (cm)', chest: 'Chest (cm)', neck: 'Neck (cm)', arm: 'Arm (cm)', thigh: 'Thigh (cm)',
} as const;
export type Measure = keyof typeof MEASURES;

export interface Reading {
  date: string;
  value: number;
}

export interface Data {
  version: 1;
  profile: Profile;
  goals: Goals;
  days: Record<string, DayLog>; // keyed by YYYY-MM-DD
  weights: { date: string; kg: number }[]; // sorted by date
  measurements: Partial<Record<Measure, Reading[]>>; // each sorted by date
  myFoods: Food[];
  myMeals: SavedMeal[];
  recipes: Recipe[];
  myExercises: MyExercise[];
  recent: Food[];
  mealNames: Record<Meal, string>;
  fasts: Fast[]; // newest first
  goalNoticeDismissed: string | null; // date of the weigh-in when "goal reached" was dismissed
  searches: string[]; // past food searches, newest first
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
    goals: {
      kcalOverride: null, carbsPct: 50, proteinPct: 20, fatPct: 30, sugarG: null, fiberG: null, sodiumMg: null, waterMl: 2000,
      goalWeightKg: null, steps: 10000, workoutsPerWeek: 3, minutesPerWorkout: 30,
    },
    days: {},
    weights: [],
    measurements: {},
    myFoods: [],
    myMeals: [],
    recipes: [],
    myExercises: [],
    recent: [],
    mealNames: { ...DEFAULT_MEAL_NAMES },
    fasts: [],
    goalNoticeDismissed: null,
    searches: [],
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
  const goals = { ...base.goals, ...d.goals };
  // These used to be fixed at 50 g, 30 g and 2,300 mg. Unchanged ones become calculated.
  if (goals.sugarG === 50) goals.sugarG = null;
  if (goals.fiberG === 30) goals.fiberG = null;
  if (goals.sodiumMg === 2300) goals.sodiumMg = null;
  return { ...base, ...d, profile: { ...base.profile, ...d.profile }, goals, mealNames: { ...base.mealNames, ...d.mealNames } } as Data;
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

// Copies of items with fresh ids, so the same food can sit in the diary more than once.
function copyItems(items: MealItem[]): MealItem[] {
  return items.map((it) => ({ id: newId(), food: it.food, grams: it.grams, amount: it.amount, unit: it.unit }));
}

export function logItems(d: Data, date: string, meal: Meal, items: MealItem[]): void {
  day(d, date).foods.push(...copyItems(items).map((it) => ({ ...it, meal })));
}

// Copies one meal's foods from one day to another; returns how many were copied.
export function copyMeal(d: Data, from: string, to: string, meal: Meal): number {
  const items = (d.days[from]?.foods ?? []).filter((e) => e.meal === meal);
  logItems(d, to, meal, items);
  return items.length;
}

export function saveMeal(d: Data, name: string, items: MealItem[]): SavedMeal {
  const meal = { id: newId(), name, items: copyItems(items) };
  d.myMeals = [meal, ...d.myMeals];
  return meal;
}

export function itemsTotals(items: MealItem[]): Nutrients {
  return items.reduce((t, it) => add(t, scale(it.food.per100, it.grams)), zero());
}

// Vitamins, minerals and extra fats in these foods; foods that don't list a nutrient add nothing to it.
export function microTotals(items: { food: Food; grams: number }[] | undefined): Micros {
  return (items ?? []).reduce((t, it) => addMicros(t, scaleMicros(it.food.micros, it.grams)), {} as Micros);
}

// A recipe as one food: values per 100 g of the whole dish, and one serving = total weight / servings.
export function recipeFood(r: Recipe): Food | null {
  const totalGrams = r.items.reduce((sum, it) => sum + it.grams, 0);
  if (totalGrams <= 0 || r.servings <= 0) return null;
  const total = itemsTotals(r.items);
  const per100 = zero();
  for (const k of NUTRIENT_KEYS) per100[k] = (total[k] * 100) / totalGrams;
  const microSum = microTotals(r.items);
  const micros: Micros = {};
  for (const k of MICRO_KEYS) if (microSum[k] !== undefined) micros[k] = (microSum[k]! * 100) / totalGrams;
  return {
    id: `recipe:${r.id}`, name: r.name, per100, micros: Object.keys(micros).length ? micros : undefined, servingGrams: totalGrams / r.servings,
  };
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

export function setReading(d: Data, measure: Measure, date: string, value: number): void {
  d.measurements[measure] = [...(d.measurements[measure] ?? []).filter((r) => r.date !== date), { date, value }]
    .sort((a, b) => a.date.localeCompare(b.date));
}

export interface WeightProgress {
  start: number; // first weigh-in
  current: number; // latest weigh-in
  goal: number | null;
  toGo: number | null; // kg still to lose (positive) or gain (negative)
  reached: boolean;
  weeksLeft: number | null; // at the weekly goal; null when it points away from the goal weight
}

export function weightProgress(d: Data): WeightProgress | null {
  if (!d.weights.length) return null;
  const start = d.weights[0].kg;
  const current = d.weights[d.weights.length - 1].kg;
  const goal = d.goals.goalWeightKg;
  if (goal === null) return { start, current, goal, toGo: null, reached: false, weeksLeft: null };
  const toGo = current - goal;
  const reached = start >= goal ? current <= goal : current >= goal;
  const rate = d.profile.weeklyChangeKg;
  const weeksLeft = !reached && rate !== 0 && Math.sign(rate) === Math.sign(-toGo) ? Math.abs(toGo / rate) : null;
  return { start, current, goal, toGo, reached, weeksLeft };
}

// "If every day were like this one, you'd weigh ... in 5 weeks."
export function projection(d: Data, date: string): number | null {
  const log = d.days[date];
  const weight = weightOn(d, date);
  if (!log?.foods.length || weight === null) return null;
  const net = foodTotals(log).kcal - exerciseTotal(log);
  return fiveWeekWeight(weight, maintenanceKcal(d.profile, weight, Number(date.slice(0, 4))), net);
}

// Days in a row with food logged, up to today (or yesterday while today is still empty).
export function streak(d: Data, today: string): number {
  let date = d.days[today]?.foods.length ? today : shiftDate(today, -1);
  let n = 0;
  while (d.days[date]?.foods.length) {
    n++;
    date = shiftDate(date, -1);
  }
  return n;
}

// Exercise entries and minutes from Monday of `date`'s week up to `date`.
export function weekExercise(d: Data, date: string): { workouts: number; minutes: number } {
  const [y, m, dd] = date.split('-').map(Number);
  const sinceMonday = (new Date(y, m - 1, dd).getDay() + 6) % 7;
  let workouts = 0;
  let minutes = 0;
  for (let i = 0; i <= sinceMonday; i++) {
    for (const x of d.days[shiftDate(date, -i)]?.exercises ?? []) {
      workouts++;
      minutes += x.minutes;
    }
  }
  return { workouts, minutes };
}

export function activeFast(d: Data): Fast | undefined {
  return d.fasts[0] && !d.fasts[0].end ? d.fasts[0] : undefined;
}

// Meal to suggest by time of day.
export function mealForHour(hour: number): Meal {
  if (hour < 10) return 'breakfast';
  if (hour < 15) return 'lunch';
  if (hour >= 17 && hour < 22) return 'dinner';
  return 'snacks';
}

export interface DailyGoals extends Nutrients {
  waterMl: number;
  micros: Record<Micro, number | null>;
}

export function goalsFor(d: Data, date: string): DailyGoals | null {
  const weight = weightOn(d, date);
  if (weight === null && d.goals.kcalOverride === null) return null;
  const kcal = d.goals.kcalOverride ?? calorieGoal(d.profile, weight!, Number(date.slice(0, 4)));
  return {
    kcal,
    ...macroGrams(kcal, d.goals),
    sugar: d.goals.sugarG ?? autoSugar(kcal),
    fiber: d.goals.fiberG ?? autoFiber(kcal),
    sodium: d.goals.sodiumMg ?? AUTO_SODIUM,
    micros: microGoals(d.profile.sex, Number(date.slice(0, 4)) - d.profile.birthYear, kcal),
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
