import { describe, expect, it } from 'vitest';
import { barChart, donut, lineChart, ring } from './charts';
import { parseOffProduct, parseUsdaFood, parseUsdaPortions } from './foods';
import { diaryCsv } from './csv';
import { esc } from './html';
import { bmr, calorieGoal, exerciseKcal, fiveWeekWeight, macroGrams, macroPct, scale } from './nutrition';
import {
  addFood, copyMeal, day, defaultData, foodTotals, goalsFor, itemsTotals, logItems, mealForHour, parseData, projection, recipeFood,
  saveMeal, setWeight, shiftDate, streak, unitsFor, weekExercise, weightOn, weightProgress, type Food, type Unit,
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

describe('goals and projections', () => {
  const profile = { sex: 'male' as const, birthYear: 1996, heightCm: 180, activity: 'moderate' as const, weeklyChangeKg: -0.5 };

  it('tracks kg to go, weeks left and when the goal weight is reached', () => {
    const d = { ...defaultData(), profile };
    setWeight(d, '2026-09-01', 80);
    setWeight(d, '2026-10-01', 78);
    expect(weightProgress(d)).toMatchObject({ start: 80, current: 78, goal: null, toGo: null, reached: false });
    d.goals.goalWeightKg = 75;
    expect(weightProgress(d)).toMatchObject({ toGo: 3, reached: false, weeksLeft: 6 });
    d.profile = { ...profile, weeklyChangeKg: 0.25 }; // gaining while the goal is lower: no finish date
    expect(weightProgress(d)!.weeksLeft).toBeNull();
    setWeight(d, '2026-10-20', 74.8);
    expect(weightProgress(d)).toMatchObject({ reached: true, weeksLeft: null });
    d.goals.goalWeightKg = 85; // a goal to gain weight
    const gain = weightProgress(d)!;
    expect(gain.reached).toBe(false);
    expect(gain.toGo).toBeCloseTo(-10.2);
    expect(gain.weeksLeft).toBeCloseTo(40.8);
  });

  it('projects the weight in five weeks from one day of eating', () => {
    const d = { ...defaultData(), profile };
    expect(projection(d, '2026-10-26')).toBeNull();
    setWeight(d, '2026-10-26', 80);
    // Maintenance 1780 * 1.55 = 2759 kcal. Eating 1000 kcal of apples and burning 200: net 800 kcal.
    addFood(d, '2026-10-26', 'lunch', apple, 1000 / 0.52, g);
    day(d, '2026-10-26').exercises.push({ id: 'x', name: 'Run', minutes: 20, kcal: 200 });
    expect(projection(d, '2026-10-26')).toBeCloseTo(80 + ((800 - 2759) * 35) / 7700);
    expect(fiveWeekWeight(70, 2000, 2000)).toBe(70);
  });

  it('counts the logging streak, starting yesterday while today is empty', () => {
    const d = defaultData();
    for (const date of ['2026-10-24', '2026-10-25', '2026-10-26']) addFood(d, date, 'lunch', apple, 100, g);
    addFood(d, '2026-10-22', 'lunch', apple, 100, g);
    expect(streak(d, '2026-10-26')).toBe(3);
    expect(streak(d, '2026-10-27')).toBe(3);
    expect(streak(d, '2026-10-28')).toBe(0);
  });

  it('counts this week’s workouts from Monday', () => {
    const d = defaultData();
    day(d, '2026-10-25').exercises.push({ id: 'a', name: 'Sunday run', minutes: 40, kcal: 300 }); // last week
    day(d, '2026-10-26').exercises.push({ id: 'b', name: 'Run', minutes: 30, kcal: 250 }); // Monday
    day(d, '2026-10-28').exercises.push({ id: 'c', name: 'Bench press', minutes: 0, kcal: 0, sets: 3, reps: 10, kg: 40 });
    expect(weekExercise(d, '2026-10-28')).toEqual({ workouts: 2, minutes: 30 });
  });

  it('splits calories between macros and suggests a meal by the clock', () => {
    const pct = macroPct({ ...apple.per100, carbs: 50, protein: 25, fat: 0 })!;
    expect([pct.carbs, pct.protein, pct.fat].map(Math.round)).toEqual([67, 33, 0]);
    expect(macroPct(scale(apple.per100, 0))).toBeNull();
    expect([7, 12, 16, 19, 23].map(mealForHour)).toEqual(['breakfast', 'lunch', 'snacks', 'dinner', 'snacks']);
  });
});

describe('meals and recipes', () => {
  it('copies a meal to another day and saves it for later', () => {
    const d = defaultData();
    addFood(d, '2026-10-26', 'breakfast', apple, 1, { label: 'medium', grams: 182 });
    addFood(d, '2026-10-26', 'lunch', apple, 50, g);
    expect(copyMeal(d, '2026-10-26', '2026-10-27', 'breakfast')).toBe(1);
    const copied = d.days['2026-10-27'].foods[0];
    expect(copied).toMatchObject({ meal: 'breakfast', grams: 182, amount: 1, unit: 'medium' });
    expect(copied.id).not.toBe(d.days['2026-10-26'].foods[0].id);
    const saved = saveMeal(d, 'Usual breakfast', d.days['2026-10-26'].foods.filter((e) => e.meal === 'breakfast'));
    logItems(d, '2026-10-28', 'snacks', saved.items);
    logItems(d, '2026-10-28', 'snacks', saved.items);
    expect(d.days['2026-10-28'].foods.map((e) => e.meal)).toEqual(['snacks', 'snacks']);
    expect(new Set(d.days['2026-10-28'].foods.map((e) => e.id)).size).toBe(2);
    expect(itemsTotals(saved.items).kcal).toBeCloseTo(94.64);
  });

  it('turns a recipe into a food with per-serving portions', () => {
    const rice: Food = { id: 'usda:2', name: 'Rice', per100: { kcal: 130, protein: 2.7, carbs: 28, fat: 0.3, sugar: 0, fiber: 0.4, sodium: 1 } };
    const r = { id: 'r1', name: 'Fruit rice', servings: 4, items: [
      { id: 'a', food: apple, grams: 200 }, { id: 'b', food: rice, grams: 600 },
    ] };
    const f = recipeFood(r)!;
    expect(f).toMatchObject({ id: 'recipe:r1', name: 'Fruit rice', servingGrams: 200 });
    expect(scale(f.per100, 800).kcal).toBeCloseTo(104 + 780); // the whole dish
    expect(recipeFood({ ...r, items: [] })).toBeNull();
  });

  it('keeps old backups loadable and fills in new settings', () => {
    const old = { version: 1, profile: { sex: 'male' }, goals: { carbsPct: 40 }, days: {}, weights: [], myFoods: [], recent: [], usdaKey: '', mealNames: { snacks: 'Snack' } };
    const d = parseData(JSON.stringify(old));
    expect(d.goals).toMatchObject({ carbsPct: 40, goalWeightKg: null, steps: 10000 });
    expect(d.mealNames).toEqual({ breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snacks: 'Snack' });
    expect(d).toMatchObject({ myMeals: [], recipes: [], fasts: [], measurements: {} });
  });

  it('exports the diary as CSV, quoting text and defusing formulas', () => {
    const d = defaultData();
    addFood(d, '2026-10-26', 'breakfast', { ...apple, name: '=HYPERLINK("x")', brand: 'A, B' }, 1, { label: 'medium', grams: 182 });
    day(d, '2026-10-26').waterMl = 500;
    setWeight(d, '2026-10-27', 70.5);
    const lines = diaryCsv(d).trim().split('\r\n');
    expect(lines[0]).toBe('Date,Type,Meal,Name,Amount,Calories,Carbs (g),Fat (g),Protein (g),Sugar (g),Fiber (g),Sodium (mg)');
    expect(lines[1]).toBe(`2026-10-26,Food,Breakfast,"'=HYPERLINK(""x"") (A, B)",1 medium (182 g),94.6,25.5,0.4,0.5,18.2,4.4,1.8`);
    expect(lines.slice(2)).toEqual(['2026-10-26,Water,,Water,500 ml,,,,,,,', '2026-10-27,Weight,,Weight,70.5 kg,,,,,,,']);
  });
});

describe('safety and charts', () => {
  it('escapes text from food databases', () => {
    expect(esc('<img src=x onerror="a">')).toBe('&lt;img src=x onerror=&quot;a&quot;&gt;');
  });

  it('draws rings and donuts, with gaps only between segments', () => {
    expect(ring(0, 100, 80, 8, '', '0')).not.toContain('class="fill"');
    expect(ring(150, 100, 80, 8, 'over', '150')).toContain('class="fill"');
    const one = donut([{ value: 10, cls: 'carbs' }, { value: 0, cls: 'fat' }], 100, 10, '');
    expect(one.match(/class="arc /g)).toHaveLength(1);
    expect(one).toContain(`stroke-dasharray="${2 * Math.PI * 45} `);
    expect(donut([{ value: 1, cls: 'carbs' }, { value: 1, cls: 'fat' }], 100, 10, '').match(/class="arc /g)).toHaveLength(2);
    expect(lineChart([{ date: '2026-10-01', value: 80 }, { date: '2026-10-08', value: 79 }], 'kg', 75)).toContain('Goal 75');
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
