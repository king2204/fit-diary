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
const MIN_KCAL: Record<Sex, number> = { female: 1200, male: 1500 };

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

export function calorieGoal(p: Profile, weightKg: number, year: number): number {
  const maintain = bmr(p.sex, weightKg, p.heightCm, year - p.birthYear) * ACTIVITY_FACTOR[p.activity];
  const goal = maintain + (p.weeklyChangeKg * KCAL_PER_KG) / 7;
  return Math.max(MIN_KCAL[p.sex], Math.round(goal / 10) * 10);
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

// MET values from the Compendium of Physical Activities.
export const EXERCISES: { name: string; met: number }[] = [
  { name: 'Walking, 5 km/h', met: 3.5 },
  { name: 'Walking, brisk 5.6 km/h', met: 4.3 },
  { name: 'Running, 8 km/h', met: 8.3 },
  { name: 'Running, 9.7 km/h', met: 9.8 },
  { name: 'Cycling, 16-19 km/h', met: 6.8 },
  { name: 'Cycling, 19-22 km/h', met: 8.0 },
  { name: 'Swimming laps, moderate', met: 5.8 },
  { name: 'Weight training', met: 3.5 },
  { name: 'Circuit training / HIIT', met: 8.0 },
  { name: 'Elliptical, moderate', met: 5.0 },
  { name: 'Jump rope, moderate', met: 11.8 },
  { name: 'Aerobic dance', met: 7.3 },
  { name: 'Yoga', met: 2.5 },
  { name: 'Basketball', met: 6.5 },
  { name: 'Football (soccer), casual', met: 7.0 },
  { name: 'Badminton', met: 5.5 },
  { name: 'Martial arts / Muay Thai, moderate', met: 10.3 },
];

export function exerciseKcal(met: number, weightKg: number, minutes: number): number {
  return Math.round((met * weightKg * minutes) / 60);
}
