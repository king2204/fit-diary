// Progress: weight and body measurements over time, and nutrition/fitness reports.
import { barChart, lineChart, type BarPoint } from '../charts';
import { back, persist, render, state, store, today, type Handlers, type Screen } from '../core';
import { esc } from '../html';
import {
  MEASURES, exerciseTotal, foodTotals, goalsFor, peekDay, setReading, setWeight, shiftDate, weightProgress, type DailyGoals, type DayLog,
  type Measure, type Reading,
} from '../store';
import { dec1, grams, header, icon, kcal, numField, option, shortDay, tabs } from '../ui';

type Tab = 'body' | 'reports';
let tab: Tab = 'body';
let measure: 'weight' | Measure = 'weight';
let range = 90; // days; 0 = all
let metric: keyof typeof METRICS = 'kcal';
let reportDays = 7;

export function showReports(): void {
  tab = 'reports';
}

interface Metric {
  label: string;
  unit: string;
  value: (log: DayLog) => number;
  logged: (log: DayLog) => boolean; // whether the day counts toward the average
  goal?: (g: DailyGoals) => number;
}

const ate = (log: DayLog) => log.foods.length > 0;
const METRICS: Record<string, Metric> = {
  kcal: { label: 'Calories eaten', unit: 'kcal', value: (l) => foodTotals(l).kcal, logged: ate, goal: (g) => g.kcal },
  net: { label: 'Net calories (food − exercise)', unit: 'kcal', value: (l) => foodTotals(l).kcal - exerciseTotal(l), logged: ate, goal: (g) => g.kcal },
  carbs: { label: 'Carbs', unit: 'g', value: (l) => foodTotals(l).carbs, logged: ate, goal: (g) => g.carbs },
  protein: { label: 'Protein', unit: 'g', value: (l) => foodTotals(l).protein, logged: ate, goal: (g) => g.protein },
  fat: { label: 'Fat', unit: 'g', value: (l) => foodTotals(l).fat, logged: ate, goal: (g) => g.fat },
  sugar: { label: 'Sugar', unit: 'g', value: (l) => foodTotals(l).sugar, logged: ate, goal: (g) => g.sugar },
  fiber: { label: 'Fiber', unit: 'g', value: (l) => foodTotals(l).fiber, logged: ate, goal: (g) => g.fiber },
  sodium: { label: 'Sodium', unit: 'mg', value: (l) => foodTotals(l).sodium, logged: ate, goal: (g) => g.sodium },
  exercise: { label: 'Exercise calories', unit: 'kcal', value: exerciseTotal, logged: (l) => l.exercises.length > 0 },
  water: { label: 'Water', unit: 'ml', value: (l) => l.waterMl, logged: (l) => l.waterMl > 0, goal: (g) => g.waterMl },
  steps: { label: 'Steps', unit: 'steps', value: (l) => l.steps ?? 0, logged: (l) => (l.steps ?? 0) > 0, goal: () => state.data.goals.steps },
};

const seg = (act: string, cur: string | number, opts: [string | number, string][]) =>
  `<div class="seg small">${opts.map(([v, l]) => `<button data-act="${act}" data-v="${v}" class="${String(cur) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div>`;

function readings(): Reading[] {
  return measure === 'weight' ? state.data.weights.map((w) => ({ date: w.date, value: w.kg })) : state.data.measurements[measure] ?? [];
}

const measureLabel = () => (measure === 'weight' ? 'Weight (kg)' : MEASURES[measure]);
const measureUnit = () => (measure === 'weight' ? 'kg' : measure === 'bodyfat' ? '%' : 'cm');

function bodyHtml(): string {
  const all = readings();
  const from = range ? shiftDate(today(), -range) : '';
  const shown = all.filter((r) => r.date >= from);
  const p = measure === 'weight' ? weightProgress(state.data) : null;
  const unit = measureUnit();
  const stats = p
    ? `<div class="stats">
        <div><b>${dec1(p.start)}</b><small>Start kg</small></div>
        <div><b>${dec1(p.current)}</b><small>Current kg</small></div>
        <div><b>${p.current - p.start > 0 ? '+' : ''}${dec1(p.current - p.start)}</b><small>Change kg</small></div>
        ${p.goal !== null ? `<div><b>${dec1(p.goal)}</b><small>Goal kg</small></div>` : ''}
      </div>`
    : '';
  return `<section class="card">
      <label class="field-row"><span>Show</span><select data-act="measure" aria-label="Measurement">
        ${option('weight', 'Weight (kg)', measure)}${(Object.keys(MEASURES) as Measure[]).map((k) => option(k, MEASURES[k], measure)).join('')}
      </select></label>
      ${stats}
      ${seg('range', range, [[30, '1M'], [90, '3M'], [180, '6M'], [365, '1Y'], [0, 'All']])}
      ${shown.length ? lineChart(shown.map((r) => ({ date: r.date, value: r.value })), unit, p?.goal) : `<p class="empty">No ${esc(measureLabel().toLowerCase())} entries in this range.</p>`}
    </section>
    <section class="card"><h2>Log ${esc(measureLabel().toLowerCase())}</h2>
      <form data-form="reading" class="row2 align-end">
        <label>Date<input name="date" type="date" value="${today()}" max="${today()}" required></label>
        ${numField('value', measureLabel(), true, '', 'step="0.1"')}
        <button class="primary span2">Save</button>
      </form>
    </section>
    ${all.length ? `<section class="card flush"><h2 class="pad">History</h2><ul class="list">${[...all].reverse().map((r) => `<li><div class="static">
      <span class="name">${esc(shortDay(r.date))}</span><span class="kcal">${dec1(r.value)} ${unit}</span>
      <button class="icon small" data-act="del-reading" data-date="${r.date}" aria-label="Delete ${esc(shortDay(r.date))}">${icon('close')}</button></div></li>`).join('')}</ul></section>` : ''}`;
}

// Daily values for up to 30 days; for longer ranges, weekly averages of the logged days.
function reportBars(m: Metric, days: number): { bars: BarPoint[]; avg: number; logged: number } {
  const dates = Array.from({ length: days }, (_, i) => shiftDate(today(), i - days + 1));
  const logs = dates.map((d) => peekDay(state.data, d));
  const counted = logs.filter((l): l is DayLog => !!l && m.logged(l));
  const avg = counted.length ? counted.reduce((s, l) => s + m.value(l), 0) / counted.length : 0;
  let bars: BarPoint[];
  if (days <= 31) {
    bars = dates.map((d, i) => {
      const dd = Number(d.slice(8));
      const l = logs[i];
      return {
        label: days <= 7 ? new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: 'narrow' }) : (dd % 5 === 0 ? String(dd) : ''),
        title: shortDay(d), value: l && m.logged(l) ? m.value(l) : 0,
      };
    });
  } else {
    bars = [];
    for (let w = 0; w < days / 7; w++) {
      const week = logs.slice(w * 7, w * 7 + 7).filter((l): l is DayLog => !!l && m.logged(l));
      const start = dates[w * 7];
      bars.push({
        label: w % 3 === 0 ? new Date(`${start}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '',
        title: `Week of ${shortDay(start)} (average)`,
        value: week.length ? week.reduce((s, l) => s + m.value(l), 0) / week.length : 0,
      });
    }
  }
  return { bars, avg, logged: counted.length };
}

function reportsHtml(): string {
  const m = METRICS[metric];
  const { bars, avg, logged } = reportBars(m, reportDays);
  const goals = goalsFor(state.data, today());
  const goal = goals && m.goal ? m.goal(goals) : undefined;
  return `<section class="card">
    <label class="field-row"><span>Report</span><select data-act="metric" aria-label="Report">
      ${Object.entries(METRICS).map(([k, x]) => option(k, x.label, metric)).join('')}</select></label>
    ${seg('report-days', reportDays, [[7, '7 days'], [30, '30 days'], [91, '3 months']])}
    <div class="stats"><div><b>${m.unit === 'kcal' || m.unit === 'steps' || m.unit === 'ml' || m.unit === 'mg' ? kcal(avg) : grams(avg)}</b>
      <small>Daily average, ${m.unit} (${logged} ${logged === 1 ? 'day' : 'days'})</small></div>
      ${goal !== undefined ? `<div><b>${kcal(goal)}</b><small>Goal, ${m.unit}</small></div>` : ''}</div>
    ${barChart(bars, m.unit, goal)}
  </section>`;
}

export function progressView(): string {
  return `${header('Progress')}<main>
    <div class="seg">${(['body', 'reports'] as Tab[]).map((t) => `<button data-act="prog-tab" data-v="${t}" class="${tab === t ? 'on' : ''}">${t === 'body' ? 'Weight & body' : 'Reports'}</button>`).join('')}</div>
    ${tab === 'body' ? bodyHtml() : reportsHtml()}
  </main>${tabs()}`;
}

export function weighinView(_s: Extract<Screen, { name: 'weighin' }>): string {
  const latest = state.data.weights[state.data.weights.length - 1];
  return `${header('Log weight', { back: true })}<main><section class="card">
    <form data-form="weighin" class="stack">
      <label>Date<input name="date" type="date" value="${today()}" max="${today()}" required></label>
      ${numField('kg', 'Weight (kg)', true, latest ? String(latest.kg) : '', 'step="0.1" min="20" max="400"')}
      ${numField('bodyfat', 'Body fat % (optional)', false, '', 'step="0.1" max="80"')}
      <button class="primary">Save</button>
    </form></section>
    <p class="muted center">Weigh yourself at the same time each day, for example in the morning before breakfast.</p></main>`;
}

const n = (fd: FormData, k: string) => Number(fd.get(k)) || 0;

export const handlers: Handlers = {
  actions: {
    'prog-tab': (el) => {
      tab = el.dataset.v as Tab;
      render();
    },
    range: (el) => {
      range = Number(el.dataset.v);
      render();
    },
    'report-days': (el) => {
      reportDays = Number(el.dataset.v);
      render();
    },
    'del-reading': (el) => {
      const date = el.dataset.date!;
      if (!confirm(`Delete the entry for ${shortDay(date)}?`)) return;
      if (measure === 'weight') state.data.weights = state.data.weights.filter((w) => w.date !== date);
      else state.data.measurements[measure] = (state.data.measurements[measure] ?? []).filter((r) => r.date !== date);
      persist();
    },
  },
  changes: {
    measure: (el) => {
      measure = el.value as typeof measure;
      render();
    },
    metric: (el) => {
      metric = el.value as typeof metric;
      render();
    },
  },
  forms: {
    reading: (fd) => {
      const date = String(fd.get('date'));
      const value = n(fd, 'value');
      if (!date || value <= 0) return;
      if (measure === 'weight') setWeight(state.data, date, value);
      else setReading(state.data, measure, date, value);
      state.notice = 'Saved.';
      persist();
    },
    weighin: (fd) => {
      const date = String(fd.get('date'));
      const kg = n(fd, 'kg');
      if (!date || kg <= 0) return;
      setWeight(state.data, date, kg);
      if (n(fd, 'bodyfat') > 0) setReading(state.data, 'bodyfat', date, n(fd, 'bodyfat'));
      const p = weightProgress(state.data);
      state.notice = p?.goal != null && !p.reached ? `Weight saved. ${dec1(Math.abs(p.toGo!))} kg to go!` : 'Weight saved.';
      store();
      back();
    },
  },
};
