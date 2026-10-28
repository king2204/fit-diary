// Building blocks shared by screens: number formats, icons, the top bar, tabs and form fields.
import { state, today } from './core';
import { esc } from './html';
import { shiftDate, type Meal } from './store';

export const kcal = (n: number) => Math.round(n).toLocaleString();
export const grams = (n: number) => (n < 10 ? String(Math.round(n * 10) / 10) : String(Math.round(n)));
// Nutrient amounts from 1,050 down to 0.12: more decimals for small vitamin amounts.
export function amount(n: number): string {
  const a = Math.abs(n);
  const s = a >= 100 ? kcal(a) : a >= 10 ? String(Math.round(a)) : a >= 1 ? String(Math.round(a * 10) / 10) : String(Math.round(a * 100) / 100);
  return n < 0 && s !== '0' ? `-${s}` : s;
}
// Body weight and measurements keep one decimal: 76.4 kg.
export const dec1 = (n: number) => String(Math.round(n * 10) / 10);
export const mealName = (m: Meal) => state.data.mealNames[m];

export function dateLabel(d: string): string {
  if (d === today()) return 'Today';
  if (d === shiftDate(today(), -1)) return 'Yesterday';
  if (d === shiftDate(today(), 1)) return 'Tomorrow';
  return shortDay(d);
}

export function shortDay(d: string): string {
  const [y, m, dd] = d.split('-').map(Number);
  return new Date(y, m - 1, dd).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

// 24 px line icons, drawn with the current text color.
const ICONS = {
  home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  diary: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  chart: '<path d="M4 4v16h16"/><path d="M8 15l4-4 3 3 5-6"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  forward: '<path d="M9 5l7 7-7 7"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  dots: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
  calendar: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  camera: '<path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2.2l1.6-2.2h5.4L16.3 7h2.2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z"/><circle cx="12" cy="12.5" r="3.5"/>',
  flame: '<path d="M12 3c1 3.5 5.5 5.5 5.5 10.5a5.5 5.5 0 0 1-11 0c0-2.3 1-3.8 2.2-5 .2 2 1.2 3.2 2.3 3.2 0-3.2-.7-5.6 1-8.7z"/>',
  flag: '<path d="M6 21V4"/><path d="M6 4h11l-2.5 4.5L17 13H6"/>',
  food: '<path d="M7 3v7M5 3v5a2 2 0 0 0 4 0V3M7 10v11"/><path d="M17 21V3c-2.2 1.2-3.5 4-3.5 7.5H17"/>',
  scan: '<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><path d="M8 8v8M11 8v8M14 8v8M16.5 8v8"/>',
  bolt: '<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>',
  drop: '<path d="M12 3.5s6 6.4 6 10.9a6 6 0 0 1-12 0c0-4.5 6-10.9 6-10.9z"/>',
  scale: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M8.5 10a4.5 4.5 0 0 1 7 0"/><path d="M12 12l1.5-2.5"/>',
  dumbbell: '<path d="M6.5 7v10M17.5 7v10M3.5 9.5v5M20.5 9.5v5M6.5 12h11"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9.5 2.5h5"/>',
  steps: '<path d="M8 3.5c1.9 0 3 2 3 4.8S9.9 13 8 13s-3-1.9-3-4.7 1.1-4.8 3-4.8zM6 16h4M16 9.5c1.9 0 3 2 3 4.8s-1.1 4.7-3 4.7-3-1.9-3-4.7 1.1-4.8 3-4.8zM14 21.5h4"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>',
  pie: '<path d="M20.5 13.5A8.5 8.5 0 1 1 10.5 3.5v10z"/><path d="M14 3.2a8.5 8.5 0 0 1 6.8 6.8H14z"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>',
  pot: '<path d="M4 10h16v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M2 10h20M9 6.5C9 5 10.3 4 12 4s3 1 3 2.5"/>',
  apple: '<path d="M12 7.5c-2-1.4-7-1-7 4.8 0 4 2.8 8.2 5 8.2 1 0 1.3-.5 2-.5s1 .5 2 .5c2.2 0 5-4.2 5-8.2 0-5.8-5-6.2-7-4.8z"/><path d="M12 7.5c0-2 1-3.7 3-4"/>',
  sliders: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  note: '<path d="M5 4h14v11l-5 5H5z"/><path d="M14 20v-5h5"/>',
};
export type IconName = keyof typeof ICONS;

export function icon(name: IconName): string {
  return `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;
}

// Top bar. `left`/`right` replace the default back button / empty space.
export function header(title: string, opts: { back?: boolean; right?: string } = {}): string {
  const left = opts.back ? `<button class="icon" data-act="back" aria-label="Back">${icon('back')}</button>` : '<span class="bar-gap"></span>';
  return `<header class="bar">${left}<h1>${esc(title)}</h1>${opts.right ?? '<span class="bar-gap"></span>'}</header>`;
}

export function tabs(): string {
  const on = state.screen.name;
  const t = (name: string, label: string, ic: IconName) =>
    `<button data-act="tab" data-tab="${name}" class="${on === name ? 'on' : ''}" ${on === name ? 'aria-current="page"' : ''}>${icon(ic)}<span>${label}</span></button>`;
  return `<nav class="tabs">${t('home', 'Dashboard', 'home')}${t('diary', 'Diary', 'diary')}
    <button class="plus" data-act="plus" aria-label="Log food, water, weight or exercise">${icon('plus')}</button>
    ${t('progress', 'Progress', 'chart')}${t('more', 'More', 'menu')}</nav>`;
}

export function meter(value: number, goal: number, cls: string, label: string): string {
  const pct = goal > 0 ? Math.min(100, (value / goal) * 100) : 0;
  return `<div class="meter ${cls}" role="meter" aria-label="${esc(label)}" aria-valuenow="${Math.round(value)}" aria-valuemin="0" aria-valuemax="${Math.round(goal)}"><span style="width:${pct}%"></span></div>`;
}

export const numField = (name: string, label: string, required = false, value = '', attrs = '') =>
  `<label>${label}<input name="${name}" type="number" inputmode="decimal" step="any" min="0" value="${esc(value)}" ${required ? 'required' : ''} ${attrs}></label>`;

export const option = (v: string | number, label: string, cur: string | number | null | undefined) =>
  `<option value="${esc(v)}" ${String(v) === String(cur) ? 'selected' : ''}>${esc(label)}</option>`;

// A row in a menu list that opens another screen.
export function menuItem(ic: IconName, label: string, attrs: string, sub = ''): string {
  return `<li><button ${attrs}>${icon(ic)}<span class="name">${esc(label)}${sub ? `<small>${esc(sub)}</small>` : ''}</span>${icon('forward')}</button></li>`;
}
