// Nutrition for the diary's day or the week up to it: calories by meal, nutrients against goals, macro split.
import { barChart, donut } from '../charts';
import { render, state, type Handlers, type NutritionTab, type Screen } from '../core';
import { esc } from '../html';
import {
  MICROS, MICRO_KEYS, NUTRIENT_KEYS, add, addMicros, macroPct, scale, zero, type Micro, type Micros, type Nutrients,
} from '../nutrition';
import { MEALS, exerciseTotal, foodTotals, goalsFor, microTotals, peekDay, shiftDate, type DayLog } from '../store';
import { amount, dateLabel, grams, header, icon, kcal, mealName, meter, shortDay } from '../ui';

type NutritionScreen = Extract<Screen, { name: 'nutrition' }>;

function divide(n: Nutrients, by: number): Nutrients {
  const out = zero();
  for (const k of NUTRIENT_KEYS) out[k] = by ? n[k] / by : 0;
  return out;
}

function divideMicros(m: Micros, by: number): Micros {
  const out: Micros = {};
  for (const k of MICRO_KEYS) if (m[k] !== undefined) out[k] = m[k]! / by;
  return out;
}

const VITAMINS: Micro[] = ['vitA', 'vitC', 'vitD', 'vitB1', 'vitB2', 'vitB3', 'vitB6', 'vitB9', 'vitB12', 'calcium', 'iron'];

// One row: value and goal in `unit`. Over a `limit` goal shows in red; a missing value shows as –.
type Row = [label: string, value: number | undefined, unit: string, goal: number | null | undefined, limit: boolean];

export function nutritionView(s: NutritionScreen): string {
  const d = state.data;
  const end = state.date;
  const dates = s.week ? Array.from({ length: 7 }, (_, i) => shiftDate(end, i - 6)) : [end];
  const logs = dates.map((x) => peekDay(d, x)).filter((l): l is DayLog => !!l?.foods.length);
  const n = divide(logs.reduce((t, l) => add(t, foodTotals(l)), zero()), logs.length);
  const goals = goalsFor(d, end);
  const word = s.week ? 'Average' : 'Total';
  const tab = (t: NutritionTab, label: string) => `<button data-act="nut-tab" data-v="${t}" class="${s.tab === t ? 'on' : ''}">${label}</button>`;

  let body: string;
  if (!logs.length) body = `<p class="empty">No food logged ${s.week ? 'in this week' : 'on this day'}.</p>`;
  else if (s.tab === 'calories') {
    const perMeal = MEALS.map((m) => ({ m, v: logs.reduce((sum, l) => sum + foodTotals(l, m).kcal, 0) / logs.length }));
    const burned = logs.reduce((sum, l) => sum + exerciseTotal(l), 0) / logs.length;
    const week = s.week ? barChart(dates.map((x) => ({
      label: new Date(`${x}T12:00:00`).toLocaleDateString(undefined, { weekday: 'narrow' }),
      title: shortDay(x), value: foodTotals(peekDay(d, x)).kcal,
    })), 'kcal', goals?.kcal) : '';
    body = `${week ? `<section class="card"><h2>Calories by day</h2>${week}</section>` : ''}
      <section class="card"><h2>${s.week ? 'Average by meal' : 'By meal'}</h2>
        ${perMeal.map(({ m, v }) => `<div class="hbar"><div class="row"><span>${esc(mealName(m))}</span>
          <span>${kcal(v)} kcal · ${n.kcal ? Math.round((v / n.kcal) * 100) : 0}%</span></div>${meter(v, n.kcal, 'm-kcal', mealName(m))}</div>`).join('')}
      </section>
      <section class="card"><table class="facts"><tbody>
        <tr><td>${word} calories</td><td>${kcal(n.kcal)}</td></tr>
        <tr><td>Net calories (food − exercise)</td><td>${kcal(n.kcal - burned)}</td></tr>
        ${goals ? `<tr><td>Goal</td><td>${kcal(goals.kcal)}</td></tr>` : ''}
      </tbody></table></section>`;
  } else if (s.tab === 'nutrients') {
    const m = divideMicros(logs.reduce((t, l) => addMicros(t, microTotals(l.foods)), {} as Micros), logs.length);
    const g = goals?.micros;
    const main: Row[] = [
      ['Calories', n.kcal, 'kcal', goals?.kcal, true], ['Carbs', n.carbs, 'g', goals?.carbs, false], ['Fiber', n.fiber, 'g', goals?.fiber, false],
      ['Sugar', n.sugar, 'g', goals?.sugar, true], ['Fat', n.fat, 'g', goals?.fat, false], ['Saturated fat', m.satFat, 'g', g?.satFat, true],
      ['Trans fat', m.transFat, 'g', null, true], ['Cholesterol', m.cholesterol, 'mg', g?.cholesterol, true],
      ['Protein', n.protein, 'g', goals?.protein, false], ['Sodium', n.sodium, 'mg', goals?.sodium, true],
      ['Potassium', m.potassium, 'mg', g?.potassium, false],
    ];
    const show = (v: number | undefined, unit: string) => (v === undefined ? '–' : `${amount(v)} ${unit}`);
    body = `<section class="card"><table class="nutrients"><thead><tr><th></th><th>${word}</th><th>Goal</th><th>Left</th></tr></thead><tbody>
      ${main.map(([label, v, unit, goal, limit]) => {
        const left = goal != null && v !== undefined ? goal - v : undefined;
        return `<tr><td>${label}</td><td>${show(v, unit)}</td><td>${goal != null ? show(goal, unit) : '–'}</td>
          <td class="${limit && left !== undefined && left < 0 ? 'over' : ''}">${left !== undefined ? amount(left) : '–'}</td></tr>`;
      }).join('')}</tbody></table>
      <h3 class="table-title">Vitamins and minerals</h3>
      <table class="nutrients"><thead><tr><th></th><th>${word}</th><th>Goal</th><th>%</th></tr></thead><tbody>
      ${VITAMINS.map((k) => {
        const v = m[k];
        const goal = g?.[k];
        return `<tr><td>${MICROS[k].label}</td><td>${show(v, MICROS[k].unit)}</td><td>${goal != null ? show(goal, MICROS[k].unit) : '–'}</td>
          <td>${goal && v !== undefined ? `${Math.round((v / goal) * 100)}%` : '–'}</td></tr>`;
      }).join('')}</tbody></table>
      <p class="muted">Only foods that list a nutrient count toward it, and many brand products list just a few. Goals are for adults, by your sex and age.</p>
    </section>`;
  } else {
    const pct = macroPct(n);
    const row = (k: 'carbs' | 'protein' | 'fat', label: string, goalPct: number) =>
      `<tr><td><i class="dot d-${k}"></i>${label}</td><td>${grams(n[k])} g</td><td>${pct ? Math.round(pct[k]) : 0}%</td><td>${goalPct}%</td></tr>`;
    const entries = s.week ? [] : logs[0].foods;
    const highest = (k: 'carbs' | 'protein' | 'fat', label: string) => {
      const top = [...entries].map((e) => ({ e, v: scale(e.food.per100, e.grams)[k] })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v).slice(0, 3);
      return top.length ? `<section class="card flush"><h2 class="pad">Highest in ${label.toLowerCase()}</h2><ul class="list">${top.map(({ e, v }) =>
        `<li><div class="static"><span class="name">${esc(e.food.name)}</span><span class="kcal">${grams(v)} g</span></div></li>`).join('')}</ul></section>` : '';
    };
    body = `<section class="card macro-card big">
        ${donut([{ value: n.carbs * 4, cls: 'carbs' }, { value: n.protein * 4, cls: 'protein' }, { value: n.fat * 9, cls: 'fat' }], 150, 16,
          `<b>${kcal(n.kcal)}</b><small>kcal</small>`)}
        <table class="nutrients"><thead><tr><th></th><th>${word}</th><th>Share</th><th>Goal</th></tr></thead><tbody>
          ${row('carbs', 'Carbs', d.goals.carbsPct)}${row('protein', 'Protein', d.goals.proteinPct)}${row('fat', 'Fat', d.goals.fatPct)}
        </tbody></table>
      </section>
      ${highest('carbs', 'Carbs')}${highest('protein', 'Protein')}${highest('fat', 'Fat')}`;
  }

  return `${header('Nutrition', { back: true })}<main>
    <div class="seg">${tab('calories', 'Calories')}${tab('nutrients', 'Nutrients')}${tab('macros', 'Macros')}</div>
    <div class="day-row">
      <button class="icon small" data-act="day" data-delta="${s.week ? -7 : -1}" aria-label="Earlier">${icon('back')}</button>
      <span>${s.week ? `${esc(shortDay(dates[0]))} – ${esc(shortDay(end))}` : esc(dateLabel(end))}</span>
      <button class="icon small" data-act="day" data-delta="${s.week ? 7 : 1}" aria-label="Later">${icon('forward')}</button>
    </div>
    <div class="seg small"><button data-act="nut-week" data-v="0" class="${s.week ? '' : 'on'}">Day</button><button data-act="nut-week" data-v="1" class="${s.week ? 'on' : ''}">Week</button></div>
    ${s.week && logs.length ? `<p class="muted center">Average of ${logs.length} logged ${logs.length === 1 ? 'day' : 'days'}</p>` : ''}
    ${body}
  </main>`;
}

export const handlers: Handlers = {
  actions: {
    'nut-tab': (el) => {
      if (state.screen.name !== 'nutrition') return;
      state.screen.tab = el.dataset.v as NutritionTab;
      render();
    },
    'nut-week': (el) => {
      if (state.screen.name !== 'nutrition') return;
      state.screen.week = el.dataset.v === '1';
      render();
    },
  },
};
