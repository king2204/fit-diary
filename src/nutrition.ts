// Pure calculations: calorie goals, macro targets, food and exercise maths.

export interface Nutrients {
  kcal: number;
  protein: number; // g
  carbs: number; // g
  fat: number; // g
  sugar: number; // g
  fiber: number; // g
  sodium: number; // mg
}

export const NUTRIENT_KEYS = ['kcal', 'protein', 'carbs', 'fat', 'sugar', 'fiber', 'sodium'] as const;

export function zero(): Nutrients {
  return { kcal: 0, protein: 0, carbs: 0, fat: 0, sugar: 0, fiber: 0, sodium: 0 };
}

export function add(a: Nutrients, b: Nutrients): Nutrients {
  const out = zero();
  for (const k of NUTRIENT_KEYS) out[k] = a[k] + b[k];
  return out;
}

// Nutrients for `grams` of a food whose values are given per 100 g.
export function scale(per100: Nutrients, grams: number): Nutrients {
  const out = zero();
  for (const k of NUTRIENT_KEYS) out[k] = (per100[k] * grams) / 100;
  return out;
}

// Fats, vitamins and minerals beyond the main seven. Databases often leave some out, so each is optional.
export const MICRO_KEYS = [
  'satFat', 'transFat', 'cholesterol', 'potassium', 'calcium', 'iron',
  'vitA', 'vitC', 'vitD', 'vitB1', 'vitB2', 'vitB3', 'vitB6', 'vitB9', 'vitB12',
] as const;
export type Micro = (typeof MICRO_KEYS)[number];
export type Micros = Partial<Record<Micro, number>>;

// `limit`: a most-per-day goal (less is better). The rest are amounts to reach.
export const MICROS: Record<Micro, { label: string; unit: string; limit?: boolean }> = {
  satFat: { label: 'Saturated fat', unit: 'g', limit: true },
  transFat: { label: 'Trans fat', unit: 'g', limit: true },
  cholesterol: { label: 'Cholesterol', unit: 'mg', limit: true },
  potassium: { label: 'Potassium', unit: 'mg' },
  calcium: { label: 'Calcium', unit: 'mg' },
  iron: { label: 'Iron', unit: 'mg' },
  vitA: { label: 'Vitamin A', unit: 'mcg' },
  vitC: { label: 'Vitamin C', unit: 'mg' },
  vitD: { label: 'Vitamin D', unit: 'mcg' },
  vitB1: { label: 'Vitamin B1 (thiamin)', unit: 'mg' },
  vitB2: { label: 'Vitamin B2 (riboflavin)', unit: 'mg' },
  vitB3: { label: 'Vitamin B3 (niacin)', unit: 'mg' },
  vitB6: { label: 'Vitamin B6', unit: 'mg' },
  vitB9: { label: 'Folate (B9)', unit: 'mcg' },
  vitB12: { label: 'Vitamin B12', unit: 'mcg' },
};

export function scaleMicros(per100: Micros | undefined, grams: number): Micros {
  const out: Micros = {};
  for (const k of MICRO_KEYS) if (per100?.[k] !== undefined) out[k] = (per100[k]! * grams) / 100;
  return out;
}

export function addMicros(a: Micros, b: Micros): Micros {
  const out: Micros = { ...a };
  for (const k of MICRO_KEYS) if (b[k] !== undefined) out[k] = (out[k] ?? 0) + b[k]!;
  return out;
}

export type Sex = 'male' | 'female';
export type Activity = 'sedentary' | 'light' | 'moderate' | 'very';

export const ACTIVITY_LABELS: Record<Activity, string> = {
  sedentary: 'Not very active (desk job, little exercise)',
  light: 'Lightly active (on your feet part of the day)',
  moderate: 'Active (on your feet most of the day)',
  very: 'Very active (physical job or hard daily training)',
};

const ACTIVITY_FACTOR: Record<Activity, number> = { sedentary: 1.2, light: 1.375, moderate: 1.55, very: 1.725 };

// Body fat stores about 7700 kcal per kg.
const KCAL_PER_KG = 7700;
// Common safety floors for self-set calorie goals.
export const MIN_KCAL: Record<Sex, number> = { female: 1200, male: 1500 };

export interface Profile {
  sex: Sex;
  birthYear: number;
  heightCm: number;
  activity: Activity;
  weeklyChangeKg: number; // negative to lose weight
}

// Mifflin-St Jeor resting energy.
export function bmr(sex: Sex, weightKg: number, heightCm: number, age: number): number {
  return 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === 'male' ? 5 : -161);
}

// Calories a day that keep the weight steady.
export function maintenanceKcal(p: Profile, weightKg: number, year: number): number {
  return bmr(p.sex, weightKg, p.heightCm, year - p.birthYear) * ACTIVITY_FACTOR[p.activity];
}

export function calorieGoal(p: Profile, weightKg: number, year: number): number {
  const goal = maintenanceKcal(p, weightKg, year) + (p.weeklyChangeKg * KCAL_PER_KG) / 7;
  return Math.max(MIN_KCAL[p.sex], Math.round(goal / 10) * 10);
}

// "If every day were like today": the weight after five weeks of this day's net calories.
export function fiveWeekWeight(weightKg: number, maintenance: number, netKcal: number): number {
  return weightKg + ((netKcal - maintenance) * 35) / KCAL_PER_KG;
}

// Sugar: under 10% of calories (WHO). Food labels give total sugar, including fruit and milk sugar, so this is a guide.
export const autoSugar = (kcal: number) => Math.round((kcal * 0.1) / 4);
// Fiber: 14 g per 1,000 kcal (Dietary Guidelines for Americans).
export const autoFiber = (kcal: number) => Math.round((kcal / 1000) * 14);
// Sodium: under 2,300 mg a day.
export const AUTO_SODIUM = 2300;

// Daily goals for adults: saturated fat under 10% of calories; vitamins and minerals from the
// US National Institutes of Health recommended amounts by sex and age. Pregnancy and breastfeeding need more.
export function microGoals(sex: Sex, age: number, kcal: number): Record<Micro, number | null> {
  const male = sex === 'male';
  const over50 = age >= 51;
  return {
    satFat: Math.round((kcal * 0.1) / 9),
    transFat: null, // as little as possible
    cholesterol: 300,
    potassium: male ? 3400 : 2600,
    calcium: age >= 71 || (!male && over50) ? 1200 : 1000,
    iron: male || over50 ? 8 : 18,
    vitA: male ? 900 : 700,
    vitC: male ? 90 : 75,
    vitD: age > 70 ? 20 : 15,
    vitB1: male ? 1.2 : 1.1,
    vitB2: male ? 1.3 : 1.1,
    vitB3: male ? 16 : 14,
    vitB6: over50 ? (male ? 1.7 : 1.5) : 1.3,
    vitB9: 400,
    vitB12: 2.4,
  };
}

export interface MacroSplit {
  carbsPct: number;
  proteinPct: number;
  fatPct: number;
}

// Grams per macro: carbs and protein have 4 kcal/g, fat 9 kcal/g.
export function macroGrams(kcal: number, split: MacroSplit): { carbs: number; protein: number; fat: number } {
  return {
    carbs: Math.round((kcal * split.carbsPct) / 100 / 4),
    protein: Math.round((kcal * split.proteinPct) / 100 / 4),
    fat: Math.round((kcal * split.fatPct) / 100 / 9),
  };
}

// Share of calories from each macro, in %.
export function macroPct(n: Nutrients): { carbs: number; protein: number; fat: number } | null {
  const carbs = n.carbs * 4;
  const protein = n.protein * 4;
  const fat = n.fat * 9;
  const total = carbs + protein + fat;
  if (!total) return null;
  return { carbs: (carbs / total) * 100, protein: (protein / total) * 100, fat: (fat / total) * 100 };
}

// MET values from the Compendium of Physical Activities.
export const EXERCISES: { name: string; met: number }[] = [
  { name: 'Walking, slow 3.2 km/h', met: 2.8 },
  { name: 'Walking, 4 km/h', met: 3.0 },
  { name: 'Walking, 5 km/h', met: 3.5 },
  { name: 'Walking, brisk 5.6 km/h', met: 4.3 },
  { name: 'Walking, very brisk 6.4 km/h', met: 5.0 },
  { name: 'Hiking', met: 6.0 },
  { name: 'Running, 6.4 km/h', met: 6.0 },
  { name: 'Running, 8 km/h', met: 8.3 },
  { name: 'Running, 9.7 km/h', met: 9.8 },
  { name: 'Running, 11.3 km/h', met: 11.0 },
  { name: 'Running, 12.9 km/h', met: 11.8 },
  { name: 'Running, 14.5 km/h', met: 12.8 },
  { name: 'Running, 16.1 km/h', met: 14.5 },
  { name: 'Cycling, leisure under 16 km/h', met: 4.0 },
  { name: 'Cycling, 16-19 km/h', met: 6.8 },
  { name: 'Cycling, 19-22 km/h', met: 8.0 },
  { name: 'Cycling, 22-26 km/h', met: 10.0 },
  { name: 'Stationary bike, moderate', met: 6.8 },
  { name: 'Stationary bike, vigorous', met: 8.8 },
  { name: 'Swimming, leisure', met: 6.0 },
  { name: 'Swimming laps, moderate', met: 5.8 },
  { name: 'Swimming laps, fast', met: 9.8 },
  { name: 'Elliptical, moderate', met: 5.0 },
  { name: 'Rowing machine, moderate', met: 7.0 },
  { name: 'Stair climber machine', met: 9.0 },
  { name: 'Jump rope, slow', met: 8.8 },
  { name: 'Jump rope, moderate', met: 11.8 },
  { name: 'Aerobics, low impact', met: 5.0 },
  { name: 'Aerobics, high impact', met: 7.3 },
  { name: 'Aerobic dance', met: 7.3 },
  { name: 'Dancing, general', met: 7.8 },
  { name: 'Yoga', met: 2.5 },
  { name: 'Power yoga', met: 4.0 },
  { name: 'Pilates', met: 3.0 },
  { name: 'Stretching', met: 2.3 },
  { name: 'Weight training, moderate', met: 3.5 },
  { name: 'Weight training, vigorous', met: 6.0 },
  { name: 'Circuit training / HIIT', met: 8.0 },
  { name: 'Basketball, general', met: 6.5 },
  { name: 'Basketball, game', met: 8.0 },
  { name: 'Football (soccer), casual', met: 7.0 },
  { name: 'Football (soccer), competitive', met: 10.0 },
  { name: 'Badminton, social', met: 5.5 },
  { name: 'Badminton, competitive', met: 7.0 },
  { name: 'Tennis, singles', met: 8.0 },
  { name: 'Tennis, doubles', met: 6.0 },
  { name: 'Table tennis', met: 4.0 },
  { name: 'Volleyball, casual', met: 3.0 },
  { name: 'Volleyball, beach', met: 8.0 },
  { name: 'Golf, walking with clubs', met: 4.8 },
  { name: 'Boxing, punching bag', met: 5.5 },
  { name: 'Boxing, sparring', met: 7.8 },
  { name: 'Martial arts / Muay Thai, moderate', met: 10.3 },
  { name: 'Martial arts, slower pace', met: 5.3 },
];

// Suggestions for strength training; any name can be typed.
export const STRENGTH = [
  'Bench press', 'Squat', 'Deadlift', 'Overhead press', 'Barbell row', 'Pull-up', 'Chin-up', 'Push-up', 'Dip',
  'Lat pulldown', 'Seated cable row', 'Leg press', 'Lunge', 'Romanian deadlift', 'Hip thrust', 'Leg curl', 'Leg extension',
  'Calf raise', 'Biceps curl', 'Hammer curl', 'Triceps pushdown', 'Skull crusher', 'Lateral raise', 'Chest fly', 'Plank', 'Crunch',
];

export function exerciseKcal(met: number, weightKg: number, minutes: number): number {
  return Math.round((met * weightKg * minutes) / 60);
}
