import { describe, expect, it } from 'vitest';
import { barChart, lineChart } from './charts';
import { parseOffProduct, parseUsdaFood, parseUsdaPortions } from './foods';
import { esc } from './html';
import { bmr, calorieGoal, exerciseKcal, macroGrams, scale } from './nutrition';
import {
  addFood, defaultData, foodTotals, goalsFor, parseData, setWeight, shiftDate, unitsFor, weightOn, type Food, type Unit,
} from './store';

const apple: Food = {
  id: 'usda:1', name: 'Apple', servingGrams: 182,
  per100: { kcal: 52, protein: 0.3, carbs: 14, fat: 0.2, sugar: 10, fiber: 2.4, sodium: 1 },
};

const g: Unit = { label: 'g', grams: 1 };

describe('nutrition', () => {
  it('uses Mifflin-St Jeor for resting energy', () => {
    expect(bmr('male', 80, 180, 30)).toBe(1780); // 800 + 1125 - 150 + 5
    expect(bmr('female', 60, 165, 30)).toBeCloseTo(1320.25); // 600 + 1031.25 - 150 - 161
  });

  it('turns weekly weight change into a daily calorie goal, with a floor', () => {
    const p = { sex: 'male' as const, birthYear: 1996, heightCm: 180, activity: 'moderate' as const, weeklyChangeKg: -0.5 };
    // 1780 * 1.55 = 2759 maintenance, minus 0.5 * 7700 / 7 = 550, rounded to 10
    expect(calorieGoal(p, 80, 2026)).toBe(2210);
    expect(calorieGoal({ ...p, sex: 'female', activity: 'sedentary', weeklyChangeKg: -1 }, 45, 2026)).toBe(1200);
  });

  it('splits calories into macro grams', () => {
    expect(macroGrams(2000, { carbsPct: 50, proteinPct: 20, fatPct: 30 })).toEqual({ carbs: 250, protein: 100, fat: 67 });
  });

  it('scales per-100 g values and estimates exercise burn from MET', () => {
    expect(scale(apple.per100, 182).kcal).toBeCloseTo(94.64);
    expect(exerciseKcal(8.3, 70, 30)).toBe(291);
  });
});

describe('food databases', () => {
  it('reads an Open Food Facts product, converting sodium to mg', () => {
    const f = parseOffProduct({
      code: '0894700010137', product_name: 'Nonfat Greek Yogurt', brands: ['Chobani'], serving_quantity: '170', serving_size: '1 cup',
      nutriments: { 'energy-kcal_100g': 52.9, proteins_100g: 9.41, carbohydrates_100g: 3.53, fat_100g: 0, sugars_100g: 3.53, sodium_100g: 0.0382 },
    });
    expect(f).toMatchObject({ id: 'off:0894700010137', name: 'Nonfat Greek Yogurt', brand: 'Chobani', servingGrams: 170, servingLabel: '1 cup' });
    expect(f!.per100.sodium).toBeCloseTo(38.2);
    expect(f!.per100.fiber).toBe(0);
  });

  it('falls back to kJ and salt, and skips products without a name or energy', () => {
    const f = parseOffProduct({ code: '1', product_name: 'X', nutriments: { energy_100g: 418.4, salt_100g: 1 } });
    expect(f!.per100.kcal).toBeCloseTo(100);
    expect(f!.per100.sodium).toBeCloseTo(400);
    expect(parseOffProduct({ code: '2', product_name: '', nutriments: { 'energy-kcal_100g': 10 } })).toBeNull();
    expect(parseOffProduct({ code: '3', product_name: 'Y', nutriments: {} })).toBeNull();
  });

  it('reads USDA foods, tidying ALL CAPS brand names', () => {
    const f = parseUsdaFood({
      fdcId: 42, description: 'CHOCOLATE SANDWICH COOKIES, CHOCOLATE', brandName: 'OREO', servingSize: 34, servingSizeUnit: 'GRM',
      householdServingFullText: '3 cookies',
      foodNutrients: [
        { nutrientNumber: '203', value: 2.94 }, { nutrientNumber: '204', value: 20.6 }, { nutrientNumber: '205', value: 73.5 },
        { nutrientNumber: '208', value: 471 }, { nutrientNumber: '269', value: 41.2 }, { nutrientNumber: '291', value: 2.9 },
        { nutrientNumber: '307', value: 382 },
      ],
    });
    expect(f).toMatchObject({ id: 'usda:42', name: 'Chocolate Sandwich Cookies, Chocolate', brand: 'Oreo', servingGrams: 34, servingLabel: '3 cookies' });
    expect(f!.per100).toEqual({ kcal: 471, protein: 2.94, carbs: 73.5, fat: 20.6, sugar: 41.2, fiber: 2.9, sodium: 382 });
  });

  it('uses Atwater energy when a USDA food has no plain energy value', () => {
    const f = parseUsdaFood({ fdcId: 7, description: 'Bananas, overripe, raw', foodNutrients: [{ nutrientNumber: '958', value: 85 }] });
    expect(f!.per100.kcal).toBe(85);
    expect(f!.name).toBe('Bananas, overripe, raw');
  });
});

describe('units', () => {
  it('reads USDA household portions', () => {
    expect(parseUsdaPortions([
      { amount: 1, gramWeight: 118, modifier: 'medium (7" to 7-7/8" long)', measureUnit: { name: 'undetermined' } },
      { amount: 1, gramWeight: 150, modifier: 'cup, sliced', measureUnit: { name: 'undetermined' } },
      { amount: 2, gramWeight: 30, measureUnit: { name: 'tbsp' } },
      { amount: 1, gramWeight: 240, measureUnit: { name: 'cup' }, portionDescription: '1 cup' },
      { amount: 1, gramWeight: 50, measureUnit: { name: 'undetermined' }, portionDescription: 'Quantity not specified' },
    ])).toEqual([
      { label: 'medium (7" to 7-7/8" long)', grams: 118 },
      { label: 'cup, sliced', grams: 150 },
      { label: '2 tbsp', grams: 30 },
      { label: '1 cup', grams: 240 },
    ]);
  });

  it('offers portions, then the serving, then weights', () => {
    const labels = unitsFor({ ...apple, servingLabel: '1 apple', portions: [{ label: 'cup, sliced', grams: 110 }] }).map((u) => u.label);
    expect(labels).toEqual(['cup, sliced', 'serving (1 apple)', 'g', 'oz', 'lb', 'kg']);
    expect(unitsFor({ ...apple, servingGrams: undefined }).map((u) => u.label)).toEqual(['g', 'oz', 'lb', 'kg']);
  });
});

describe('diary storage', () => {
  it('adds foods, totals meals and keeps a recent list without duplicates', () => {
    const d = defaultData();
    addFood(d, '2026-10-26', 'breakfast', apple, 1, { label: 'medium', grams: 182 });
    addFood(d, '2026-10-26', 'snacks', apple, 100, g);
    expect(d.days['2026-10-26'].foods[0]).toMatchObject({ grams: 182, amount: 1, unit: 'medium' });
    expect(foodTotals(d.days['2026-10-26']).kcal).toBeCloseTo(146.64);
    expect(foodTotals(d.days['2026-10-26'], 'snacks').kcal).toBeCloseTo(52);
    expect(d.recent).toHaveLength(1);
  });

  it('uses the latest weight on or before a date for goals', () => {
    const d = defaultData();
    expect(goalsFor(d, '2026-10-26')).toBeNull();
    setWeight(d, '2026-10-20', 70);
    setWeight(d, '2026-10-25', 69);
    setWeight(d, '2026-10-25', 68.5);
    expect(d.weights).toHaveLength(2);
    expect(weightOn(d, '2026-10-22')).toBe(70);
    expect(weightOn(d, '2026-10-26')).toBe(68.5);
    expect(weightOn(d, '2026-10-01')).toBe(70);
    d.goals.kcalOverride = 1800;
    expect(goalsFor(d, '2026-10-26')).toMatchObject({ kcal: 1800, carbs: 225, protein: 90, fat: 60, waterMl: 2000 });
  });

  it('round-trips a backup and rejects other files', () => {
    const d = defaultData();
    addFood(d, '2026-10-26', 'lunch', apple, 50, g);
    expect(parseData(JSON.stringify(d))).toEqual(d);
    expect(() => parseData('{"hello":1}')).toThrow();
  });

  it('shifts dates across month and year ends', () => {
    expect(shiftDate('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftDate('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('safety and charts', () => {
  it('escapes text from food databases', () => {
    expect(esc('<img src=x onerror="a">')).toBe('&lt;img src=x onerror=&quot;a&quot;&gt;');
  });

  it('draws charts with escaped labels and a table view', () => {
    const bars = barChart([{ label: 'M', title: '<b>Mon</b>', value: 1800 }, { label: 'T', title: 'Tue', value: 0 }], 'kcal', 2000);
    expect(bars).toContain('Goal 2,000');
    expect(bars).toContain('&lt;b&gt;Mon&lt;/b&gt;');
    expect(bars).not.toContain('<b>Mon');
    const line = lineChart([{ date: '2026-10-01', value: 70 }], 'kg');
    expect(line).toContain('<circle class="marker"');
    expect(line).toContain('Show as table');
  });
});
