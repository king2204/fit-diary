// The diary as a spreadsheet (CSV): one row per food, exercise, water, steps and weigh-in.
import { scale } from './nutrition';
import { MEALS, type Data } from './store';

const HEAD = ['Date', 'Type', 'Meal', 'Name', 'Amount', 'Calories', 'Carbs (g)', 'Fat (g)', 'Protein (g)', 'Sugar (g)', 'Fiber (g)', 'Sodium (mg)'];

// Quotes a cell when needed. Text that starts like a formula gets a ' so spreadsheet apps show it as text.
function cell(v: string | number): string {
  if (typeof v === 'number') return String(Math.round(v * 10) / 10);
  const s = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const round = (n: number) => Math.round(n * 10) / 10;

export function diaryCsv(d: Data): string {
  const rows: (string | number)[][] = [];
  const dates = [...new Set([...Object.keys(d.days), ...d.weights.map((w) => w.date)])].sort();
  for (const date of dates) {
    const log = d.days[date];
    for (const meal of MEALS) {
      for (const e of log?.foods.filter((f) => f.meal === meal) ?? []) {
        const n = scale(e.food.per100, e.grams);
        const amount = e.unit && e.amount !== undefined && e.unit !== 'g' ? `${round(e.amount)} ${e.unit} (${Math.round(e.grams)} g)` : `${Math.round(e.grams)} g`;
        const name = e.food.brand ? `${e.food.name} (${e.food.brand})` : e.food.name;
        rows.push([date, 'Food', d.mealNames[meal], name, amount, n.kcal, n.carbs, n.fat, n.protein, n.sugar, n.fiber, n.sodium]);
      }
    }
    for (const x of log?.exercises ?? []) {
      rows.push([date, 'Exercise', '', x.name, x.sets ? `${x.sets} sets x ${x.reps ?? 0} reps x ${x.kg ?? 0} kg` : `${x.minutes} min`, x.kcal]);
    }
    if (log?.waterMl) rows.push([date, 'Water', '', 'Water', `${log.waterMl} ml`]);
    if (log?.steps) rows.push([date, 'Steps', '', 'Steps', String(log.steps)]);
    const w = d.weights.find((x) => x.date === date);
    if (w) rows.push([date, 'Weight', '', 'Weight', `${w.kg} kg`]);
  }
  return [HEAD, ...rows].map((r) => HEAD.map((_, i) => cell(r[i] ?? '')).join(',')).join('\r\n') + '\r\n';
}
