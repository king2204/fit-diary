// Finding foods (search, history, my meals/recipes/foods, barcode) and choosing an amount.
import { donut } from '../charts';
import { go, onLeave, persist, render, state, store, type FoodTab, type Handlers, type Screen, type Target } from '../core';
import { findBasicFood } from '../basicfoods';
import { lookupBarcode, searchFoods, usdaPortions } from '../foods';
import { esc } from '../html';
import { MICROS, MICRO_KEYS, NUTRIENT_KEYS, macroPct, scale, scaleMicros, type Micro, type Micros, type Nutrients } from '../nutrition';
import type { Scan } from '../scanner';
import {
  MEALS, addFood, day, goalsFor, itemsTotals, logItems, newId, peekDay, recipeFood, unitsFor, type Food, type MealItem, type Meal, type Unit,
} from '../store';
import { localMatches, suggestSearches } from '../suggest';
import { amount, grams, header, icon, kcal, mealName, meter, numField, option, type IconName } from '../ui';

type AddScreen = Extract<Screen, { name: 'add' }>;
type FoodScreen = Extract<Screen, { name: 'food' }>;
type ScanScreen = Extract<Screen, { name: 'scan' }>;

export function addScreen(target: Target, back: Screen): AddScreen {
  return { name: 'add', target, tab: 'all', back, live: '', query: '', results: [], problems: [], loading: false, page: 1, more: false, loadingMore: false };
}

// ---------- Add food: search and lists ----------

const recipeFoods = () => state.data.recipes.map(recipeFood).filter((f): f is Food => f !== null);

// The foods behind each list on the Add food screen, so a tapped row can be found again.
// "-q" lists are the user's own foods matching what is typed (or was last searched).
function listFoods(s: AddScreen, list: string): Food[] {
  const q = s.live.trim() || s.query;
  if (list === 'results') return s.results;
  if (list === 'recent') return state.data.recent;
  if (list === 'mine') return state.data.myFoods;
  if (list === 'recent-q') return localMatches(q, state.data.recent);
  if (list === 'mine-q') return localMatches(q, [...state.data.myFoods, ...(s.target.kind === 'diary' ? recipeFoods() : [])]);
  return recipeFoods();
}

// The amount + adds and the row describes: "1 cup (156 g)", "1/2 cup", or "100 g".
function rowPortion(f: Food): { label: string; grams: number } {
  const { amount: n, unit } = startingAmount(f);
  if (unit.label === 'g') return { label: `${n} g`, grams: n };
  if (f.servingGrams && unit.grams === f.servingGrams && f.servingLabel) return { label: f.servingLabel, grams: unit.grams };
  return { label: `${/^\d/.test(unit.label) ? '' : '1 '}${unit.label} (${grams(unit.grams)} g)`, grams: unit.grams };
}

function foodRow(f: Food, list: string, i: number): string {
  const p = rowPortion(f);
  return `<li class="row-add"><button data-act="pick" data-list="${list}" data-i="${i}">
      <span class="name">${esc(f.name)}<small>${kcal(scale(f.per100, p.grams).kcal)} kcal, ${esc(p.label)}${f.brand ? `, ${esc(f.brand)}` : ''}${f.note ? ', estimate' : ''}</small></span></button>
    <button class="add-circle" data-act="quick-log" data-list="${list}" data-i="${i}" aria-label="Add ${esc(f.name)}">${icon('plus')}</button></li>`;
}

const listHtml = (foods: Food[], list: string, from = 0) =>
  `<section class="card flush"><ul class="list">${foods.map((f, i) => foodRow(f, list, from + i)).join('')}</ul></section>`;

// While typing: search for exactly this, suggested searches, and the user's own foods that match. No network.
function liveHtml(s: AddScreen): string {
  const q = s.live.trim();
  const row = (text: string, ic: IconName) => {
    const label = text.toLowerCase().startsWith(q.toLowerCase()) ? `${esc(text.slice(0, q.length))}<b>${esc(text.slice(q.length))}</b>` : esc(text);
    return `<li><button data-act="run-search" data-q="${esc(text)}">${icon(ic)}<span class="name">${label}</span></button></li>`;
  };
  const recent = listFoods(s, 'recent-q');
  const mine = listFoods(s, 'mine-q');
  return `<section class="card flush"><ul class="list suggest">
      <li><button data-act="run-search" data-q="${esc(q)}">${icon('search')}<span class="name">Search for “<b>${esc(q)}</b>”</span></button></li>
      ${suggestSearches(q, state.data.searches).map((x) => row(x.text, x.past ? 'clock' : 'search')).join('')}
    </ul></section>
    ${recent.length ? `<h3 class="list-title">Recently logged</h3>${listHtml(recent, 'recent-q')}` : ''}
    ${mine.length ? `<h3 class="list-title">My foods</h3>${listHtml(mine, 'mine-q')}` : ''}`;
}

// After a search: the user's own matches, then the best three results, then the rest.
function resultsHtml(s: AddScreen): string {
  if (s.loading) return '<p class="empty">Searching…</p>';
  const recent = listFoods(s, 'recent-q').slice(0, 3);
  const mine = listFoods(s, 'mine-q').slice(0, 3);
  return `${s.problems.map((p) => `<p class="notice">${esc(p)}</p>`).join('')}
    ${recent.length ? `<h3 class="list-title">Recently logged</h3>${listHtml(recent, 'recent-q')}` : ''}
    ${mine.length ? `<h3 class="list-title">My foods</h3>${listHtml(mine, 'mine-q')}` : ''}
    ${s.results.length
      ? `<h3 class="list-title">Best match</h3>${listHtml(s.results.slice(0, 3), 'results')}
        ${s.results.length > 3 ? `<h3 class="list-title">More results</h3>${listHtml(s.results.slice(3), 'results', 3)}` : ''}`
      : `<p class="empty">No foods found for “${esc(s.query)}”. Try other words.</p>`}
    ${s.more ? `<button class="wide" data-act="more-results" ${s.loadingMore ? 'disabled' : ''}>${s.loadingMore ? 'Loading…' : 'Show more results'}</button>` : ''}
    <p class="muted center">Can’t find it? <button class="link inline" data-act="custom">Create food</button> or
      <button class="link inline" data-act="scan">scan the barcode</button>.</p>`;
}

export function addView(s: AddScreen): string {
  const d = state.data;
  const diary = s.target.kind === 'diary' ? s.target : null;
  const title = diary
    ? `<select class="title-select" data-act="target-meal" aria-label="Meal">${MEALS.map((m) => option(m, mealName(m), diary.meal)).join('')}</select>`
    : '<h1>Add ingredient</h1>';
  const tab = (t: FoodTab, label: string) => `<button data-act="add-tab" data-tab="${t}" class="${s.tab === t ? 'on' : ''}">${label}</button>`;
  const tile = (ic: IconName, label: string, act: string) => `<button class="tile-btn" data-act="${act}">${icon(ic)}<span>${label}</span></button>`;
  // Suggestions replace the lists while the box holds something new.
  const typing = s.live.trim() !== '' && s.live.trim() !== s.query;

  let body = '';
  if (s.tab === 'all') {
    body = s.query
      ? resultsHtml(s)
      : `<div class="tiles">${tile('scan', 'Scan barcode', 'scan')}${diary ? tile('bolt', 'Quick add', 'quick') : ''}${tile('apple', 'Create food', 'custom')}</div>
        <h3 class="list-title">History</h3>${d.recent.length ? listHtml(d.recent, 'recent') : '<p class="empty">Foods you log will show up here.</p>'}`;
  } else if (s.tab === 'meals') {
    body = d.myMeals.length
      ? `<section class="card flush"><ul class="list">${d.myMeals.map((m) => {
        const t = itemsTotals(m.items);
        return `<li class="row-add"><button data-act="open-saved-meal" data-id="${esc(m.id)}">
            <span class="name">${esc(m.name)}<small>${kcal(t.kcal)} kcal, ${m.items.length} ${m.items.length === 1 ? 'item' : 'items'}</small></span></button>
          <button class="add-circle" data-act="log-saved-meal" data-id="${esc(m.id)}" aria-label="Add ${esc(m.name)}">${icon('plus')}</button></li>`;
      }).join('')}</ul></section>`
      : '<p class="empty">No saved meals yet. In the diary, tap ⋯ under a meal and choose “Save as meal”.</p>';
  } else if (s.tab === 'recipes') {
    const foods = listFoods(s, 'recipes');
    body = `<button class="wide" data-act="new-recipe">${icon('plus')} Create recipe</button>`
      + (foods.length ? listHtml(foods, 'recipes') : '<p class="empty">Recipes you create will show up here.</p>');
  } else {
    body = `<button class="wide" data-act="custom">${icon('plus')} Create food</button>`
      + (d.myFoods.length ? listHtml(d.myFoods, 'mine') : '<p class="empty">Foods you create will show up here.</p>');
  }

  return `<header class="bar"><button class="icon" data-act="back" aria-label="Back">${icon('back')}</button>${title}<span class="bar-gap"></span></header>
    <main>
      <form class="search" data-form="search" role="search">
        <span class="search-box">${icon('search')}<input name="q" type="search" placeholder="Search for a food" value="${esc(s.live)}" enterkeyhint="search" autocomplete="off" aria-label="Search for a food"></span>
        <button class="primary">Search</button>
      </form>
      <div id="search-live" class="stack" ${typing ? '' : 'hidden'}>${typing ? liveHtml(s) : ''}</div>
      <div id="add-body" class="stack" ${typing ? 'hidden' : ''}>
        <div class="seg">${tab('all', 'All')}${diary ? `${tab('meals', 'My meals')}${tab('recipes', 'Recipes')}` : ''}${tab('mine', 'My foods')}</div>
        ${body}
      </div>
    </main>`;
}

// ---------- One food: amount, meal, nutrition ----------

const WEIGHT_LABELS = new Set(['g', 'oz', 'lb', 'kg']);

function unitOptions(f: Food, selected: string): string {
  return unitsFor(f).map((u, i) => `<option value="${i}" ${u.label === selected ? 'selected' : ''}>${
    esc(WEIGHT_LABELS.has(u.label) ? u.label : `${u.label} (${grams(u.grams)} g)`)}</option>`).join('');
}

// What the amount starts at: the entry being edited, else 1 portion/serving, else 100 g.
export function startingAmount(f: Food, entry?: MealItem): { amount: number; unit: Unit } {
  const units = unitsFor(f);
  if (entry) {
    const unit = units.find((u) => u.label === entry.unit);
    return unit && entry.amount !== undefined ? { amount: entry.amount, unit } : { amount: entry.grams, unit: units.find((u) => u.label === 'g')! };
  }
  return units[0].label === 'g' ? { amount: 100, unit: units[0] } : { amount: 1, unit: units[0] };
}

const VITAMINS: Micro[] = ['vitA', 'vitC', 'vitD', 'vitB1', 'vitB2', 'vitB3', 'vitB6', 'vitB9', 'vitB12', 'calcium', 'iron'];

// Calories in the middle, the macro split around it, then % of daily goals and the full label, for `grams` of a food.
export function nutritionHtml(f: Food, portion: number, showGoals = true): string {
  const n = scale(f.per100, portion);
  const m = scaleMicros(f.micros, portion);
  const pct = macroPct(n);
  const goals = showGoals ? goalsFor(state.data, state.date) : null;
  const col = (k: 'carbs' | 'protein' | 'fat', label: string) =>
    `<div><small>${pct ? Math.round(pct[k]) : 0}%</small><b>${grams(n[k])} g</b><span><i class="dot d-${k}"></i>${label}</span></div>`;
  const goalRow = (label: string, value: number, goal: number, cls: string) => {
    const share = goal > 0 ? Math.round((value / goal) * 100) : 0;
    return `<div class="goal-row"><span>${label}</span>${meter(value, goal, cls, `${label}, % of daily goal`)}<b>${share}%</b></div>`;
  };
  // Label order: fats, sodium and potassium, carbs, protein, then vitamins and minerals. Missing values are left out.
  const facts: [label: string, value: number | undefined, unit: string, goal: number | null | undefined, sub?: boolean][] = [
    ['Calories', n.kcal, '', goals?.kcal], ['Total fat', n.fat, 'g', goals?.fat],
    ['Saturated fat', m.satFat, 'g', goals?.micros.satFat, true], ['Trans fat', m.transFat, 'g', null, true],
    ['Cholesterol', m.cholesterol, 'mg', goals?.micros.cholesterol], ['Sodium', n.sodium, 'mg', goals?.sodium],
    ['Potassium', m.potassium, 'mg', goals?.micros.potassium], ['Total carbohydrates', n.carbs, 'g', goals?.carbs],
    ['Dietary fiber', n.fiber, 'g', goals?.fiber, true], ['Sugars', n.sugar, 'g', goals?.sugar, true], ['Protein', n.protein, 'g', goals?.protein],
    ...VITAMINS.map((k): [string, number | undefined, string, number | null | undefined] => [MICROS[k].label, m[k], MICROS[k].unit, goals?.micros[k]]),
  ];
  return `<section class="card macro-card">
      ${donut([{ value: n.carbs * 4, cls: 'carbs' }, { value: n.protein * 4, cls: 'protein' }, { value: n.fat * 9, cls: 'fat' }], 104, 10,
        `<b>${kcal(n.kcal)}</b><small>kcal</small>`)}
      <div class="macro-cols">${col('carbs', 'Carbs')}${col('protein', 'Protein')}${col('fat', 'Fat')}</div>
    </section>
    ${goals ? `<section class="card"><h2>Percent of your daily goals</h2>
      ${goalRow('Calories', n.kcal, goals.kcal, 'm-kcal')}${goalRow('Carbs', n.carbs, goals.carbs, 'm-carbs')}
      ${goalRow('Protein', n.protein, goals.protein, 'm-protein')}${goalRow('Fat', n.fat, goals.fat, 'm-fat')}</section>` : ''}
    <section class="card"><h2>Nutrition facts</h2><table class="facts">
      ${goals ? '<thead><tr><th></th><th>Amount</th><th>Daily goal</th></tr></thead>' : ''}<tbody>
      ${facts.filter(([, v]) => v !== undefined).map(([label, v, unit, goal, sub]) => `<tr class="${sub ? 'indent' : ''}"><td>${label}</td>
        <td>${amount(v!)}${unit ? ` ${unit}` : ''}</td>${goals ? `<td>${goal ? `${Math.round((v! / goal) * 100)}%` : ''}</td>` : ''}</tr>`).join('')}
    </tbody></table>
    ${Object.keys(m).length ? '' : '<p class="muted">The database doesn’t list vitamins or minerals for this food.</p>'}</section>`;
}

// The entry being edited: a diary entry, or an ingredient of the recipe.
function editedItem(s: FoodScreen): MealItem | undefined {
  if (!s.entryId) return undefined;
  const items = s.target.kind === 'diary' ? peekDay(state.data, state.date)?.foods : s.target.screen.recipe.items;
  return items?.find((e) => e.id === s.entryId);
}

export function foodView(s: FoodScreen): string {
  const f = s.food;
  const entry = editedItem(s);
  const start = startingAmount(f, entry);
  const diary = s.target.kind === 'diary' ? s.target : null;
  const title = entry ? (diary ? 'Edit entry' : 'Edit ingredient') : diary ? 'Add food' : 'Add ingredient';
  const meal = diary ? ((entry as { meal?: Meal } | undefined)?.meal ?? diary.meal) : null;
  return `${header(title, { back: true, right: `<button class="icon" form="food-form" aria-label="Save">${icon('check')}</button>` })}<main>
    <section class="card">
      <h2 class="food-name">${esc(f.name)}</h2>
      ${f.brand ? `<p class="muted">${esc(f.brand)}</p>` : ''}
      ${f.note ? `<p class="muted">${esc(f.note)}. Real plates vary; change the amount if yours is bigger or smaller.</p>` : ''}
      <form id="food-form" data-form="food" class="rows">
        ${meal ? `<label class="field-row"><span>Meal</span><select name="meal">${MEALS.map((m) => option(m, mealName(m), meal)).join('')}</select></label>` : ''}
        <label class="field-row"><span>Amount</span><input name="amount" type="number" inputmode="decimal" step="any" min="0" value="${start.amount}" required></label>
        <label class="field-row"><span>Serving size</span><select name="unit">${unitOptions(f, start.unit.label)}</select></label>
      </form>
    </section>
    <div id="preview" class="stack">${nutritionHtml(f, start.amount * start.unit.grams, !!diary)}</div>
    <button class="primary wide" form="food-form">${entry ? 'Save' : diary ? 'Add to diary' : 'Add to recipe'}</button>
    ${entry ? `<button class="danger wide" data-act="del-entry">${diary ? 'Delete entry' : 'Remove ingredient'}</button>` : ''}
  </main>`;
}

function formAmount(form: HTMLFormElement, f: Food): { amount: number; unit: Unit } {
  const fd = new FormData(form);
  return { amount: Number(fd.get('amount')) || 0, unit: unitsFor(f)[Number(fd.get('unit'))] };
}

// Basic USDA foods list household portions separately. They come from the built-in list when it has the food (which
// also fills in vitamins for foods saved before the list existed), else from USDA online. Kept on the food once found.
export async function loadPortions(s: FoodScreen): Promise<void> {
  if (!s.food.id.startsWith('usda:') || s.food.portions !== undefined || s.food.servingGrams) return;
  let portions: Unit[] = [];
  try {
    const known = await findBasicFood(s.food.id).catch(() => undefined);
    if (known) {
      portions = known.portions ?? [];
      if (!s.food.micros && known.micros) s.food = { ...s.food, micros: known.micros };
    } else portions = await usdaPortions(s.food, state.data.usdaKey);
  } catch (e) {
    console.warn('Could not load portions', e);
    return;
  }
  s.food = { ...s.food, portions };
  const form = document.querySelector<HTMLFormElement>('form[data-form="food"]');
  if (state.screen !== s || !form) return;
  const select = form.querySelector<HTMLSelectElement>('select[name="unit"]')!;
  const amountInput = form.querySelector<HTMLInputElement>('input[name="amount"]')!;
  const current = unitsFor({ ...s.food, portions: [] })[Number(select.value)];
  // "100 g" becomes "1 medium" (the first portion) unless the user already changed it.
  const untouched = portions.length > 0 && current.label === 'g' && amountInput.value === '100' && !s.entryId;
  select.innerHTML = unitOptions(s.food, untouched ? portions[0].label : current.label);
  if (untouched) amountInput.value = '1';
  const { amount: n, unit } = formAmount(form, s.food);
  document.getElementById('preview')!.innerHTML = nutritionHtml(s.food, n * unit.grams, s.target.kind === 'diary');
}

// Adds an amount of a food to where it is going: a diary meal on the shown day, or the recipe.
function putFood(target: Target, food: Food, amount: number, unit: Unit): void {
  if (target.kind === 'diary') addFood(state.data, state.date, target.meal, food, amount, unit);
  else target.screen.recipe.items.push({ id: newId(), food, grams: amount * unit.grams, amount, unit: unit.label });
}

// ---------- Create food / quick add / scan ----------

export function customView(s: Extract<Screen, { name: 'custom' }>): string {
  const f = s.edit;
  const serving = f?.servingGrams ?? 100;
  const per = (k: keyof Nutrients) => (f ? String(Math.round(((f.per100[k] * serving) / 100) * 10) / 10) : '');
  const perMicro = (k: Micro) => (f?.micros?.[k] !== undefined ? String(Math.round(((f.micros[k]! * serving) / 100) * 100) / 100) : '');
  return `${header(f ? 'Edit food' : 'Create food', { back: true })}<main><section class="card">
    <form data-form="custom" class="stack">
      <label>Name<input name="name" required autocomplete="off" value="${esc(f?.name ?? '')}"></label>
      <label>Brand (optional)<input name="brand" autocomplete="off" value="${esc(f?.brand ?? '')}"></label>
      ${s.barcode ? `<p class="muted">Barcode ${esc(s.barcode)}</p>` : ''}
      <div class="row2">
        <label>Serving name<input name="servingName" placeholder="e.g. 1 piece, 1 bowl" autocomplete="off" value="${esc(f?.servingLabel ?? '')}"></label>
        ${numField('serving', 'Serving size (g or ml)', true, String(serving))}
      </div>
      <p class="muted">Nutrition per serving, as on the label:</p>
      <div class="row2">${numField('kcal', 'Calories (kcal)', true, per('kcal'))}${numField('protein', 'Protein (g)', false, per('protein'))}</div>
      <div class="row2">${numField('carbs', 'Carbs (g)', false, per('carbs'))}${numField('fat', 'Fat (g)', false, per('fat'))}</div>
      <div class="row2">${numField('sugar', 'Sugar (g)', false, per('sugar'))}${numField('fiber', 'Fiber (g)', false, per('fiber'))}</div>
      ${numField('sodium', 'Sodium (mg)', false, per('sodium'))}
      <details class="more-nutrients" ${f?.micros ? 'open' : ''}><summary>Vitamins, minerals and more (optional)</summary>
        <div class="row2">${MICRO_KEYS.map((k) => numField(`m-${k}`, `${MICROS[k].label} (${MICROS[k].unit})`, false, perMicro(k))).join('')}</div>
      </details>
      <button class="primary">${f ? 'Save food' : s.target ? 'Save and continue' : 'Save food'}</button>
    </form></section></main>`;
}

export function quickView(s: Extract<Screen, { name: 'quick' }>): string {
  return `${header(`Quick add to ${mealName(s.meal)}`, { back: true })}<main><section class="card">
    <form data-form="quick" class="stack">
      ${numField('kcal', 'Calories (kcal)', true)}
      <div class="row2">${numField('carbs', 'Carbs (g)')}${numField('protein', 'Protein (g)')}</div>
      ${numField('fat', 'Fat (g)')}
      <button class="primary">Add</button>
    </form></section></main>`;
}

export function scanView(s: ScanScreen): string {
  return `${header('Scan barcode', { back: true })}<main>
    <div class="camera"><video id="camera" muted playsinline></video><div class="aim"></div></div>
    <p class="center" role="status">${esc(s.status)}</p>
  </main>`;
}

export function openScan(target: Target, back: Screen): void {
  const s: ScanScreen = { name: 'scan', target, status: 'Starting camera…', back };
  go(s);
  startScanning(s);
}

async function startScanning(s: ScanScreen): Promise<void> {
  const video = document.getElementById('camera') as HTMLVideoElement;
  let scan: Scan | null = null;
  try {
    const { startScan } = await import('../scanner');
    if (state.screen !== s) return;
    scan = await startScan(video, async (code) => {
      s.status = `Found ${code}. Looking it up…`;
      render();
      try {
        // A food the user created from this barcode's label comes first, then the databases.
        const food = state.data.myFoods.find((f) => f.id === `my:${code}`) ?? await lookupBarcode(code, state.data.usdaKey);
        if (state.screen !== s) return;
        if (food) go({ name: 'food', target: s.target, food, back: s.back });
        else {
          state.notice = `Barcode ${code} is not in the food databases yet. You can create it.`;
          go({ name: 'custom', target: s.target, barcode: code, back: s.back });
        }
      } catch (e) {
        console.error(e);
        s.status = 'Lookup failed. Check your internet connection and try again.';
        if (state.screen === s) render();
      }
    });
    if (state.screen !== s) return scan.stop();
    const running = scan;
    onLeave(() => running.stop());
    s.status = 'Point the camera at the barcode.';
    document.querySelector('[role=status]')!.textContent = s.status;
  } catch (e) {
    console.error(e);
    s.status = !window.isSecureContext
      ? 'The camera only works when the app is opened over https.'
      : 'Could not open the camera. Allow camera access for this app and try again.';
    if (state.screen === s) render();
  }
}

async function runSearch(s: AddScreen, query: string): Promise<void> {
  const q = query.trim();
  if (!q) return;
  Object.assign(s, { live: q, query: q, tab: 'all', loading: true, results: [], problems: [], page: 1, more: false });
  // Remembered for suggestions next time.
  state.data.searches = [q, ...state.data.searches.filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, 20);
  store();
  render();
  try {
    const r = await searchFoods(q, state.data.usdaKey);
    if (s.query !== q) return; // a newer search started
    Object.assign(s, { results: r.foods, problems: r.problems, more: r.more });
  } catch (e) {
    s.problems = ['Search failed. Check your internet connection.'];
    console.error(e);
  }
  s.loading = false;
  if (state.screen === s) render();
}

async function loadMore(s: AddScreen): Promise<void> {
  const q = s.query;
  s.loadingMore = true;
  render();
  try {
    const r = await searchFoods(q, state.data.usdaKey, s.page + 1);
    if (s.query !== q) return;
    const have = new Set(s.results.map((f) => f.id));
    Object.assign(s, { results: [...s.results, ...r.foods.filter((f) => !have.has(f.id))], problems: r.problems, more: r.more, page: s.page + 1 });
  } catch (e) {
    s.problems = ['Could not load more results. Check your internet connection.'];
    console.error(e);
  }
  s.loadingMore = false;
  if (state.screen === s) render();
}

const n = (fd: FormData, k: string) => Number(fd.get(k)) || 0;

export const handlers: Handlers = {
  actions: {
    'add-tab': (el) => {
      if (state.screen.name !== 'add') return;
      state.screen.tab = el.dataset.tab as FoodTab;
      render();
    },
    'run-search': (el) => {
      const s = state.screen;
      if (s.name === 'add' && el.dataset.q) runSearch(s, el.dataset.q);
    },
    'more-results': () => {
      const s = state.screen;
      if (s.name === 'add' && s.more && !s.loadingMore) loadMore(s);
    },
    pick: (el) => {
      const s = state.screen;
      if (s.name !== 'add') return;
      const food = listFoods(s, el.dataset.list!)[Number(el.dataset.i)];
      if (food) go({ name: 'food', target: s.target, food, back: s });
    },
    'quick-log': (el) => {
      const s = state.screen;
      if (s.name !== 'add') return;
      const food = listFoods(s, el.dataset.list!)[Number(el.dataset.i)];
      if (!food) return;
      const { amount, unit } = startingAmount(food);
      putFood(s.target, food, amount, unit);
      state.notice = `Added ${food.name}${s.target.kind === 'diary' ? ` to ${mealName(s.target.meal)}` : ''}.`;
      persist();
    },
    'log-saved-meal': (el) => {
      const s = state.screen;
      const meal = state.data.myMeals.find((m) => m.id === el.dataset.id);
      if (s.name !== 'add' || s.target.kind !== 'diary' || !meal) return;
      logItems(state.data, state.date, s.target.meal, meal.items);
      state.notice = `Added ${meal.name} to ${mealName(s.target.meal)}.`;
      persist();
    },
    'del-entry': () => {
      const s = state.screen;
      if (s.name !== 'food' || !s.entryId) return;
      if (s.target.kind === 'recipe') {
        const r = s.target.screen.recipe;
        r.items = r.items.filter((x) => x.id !== s.entryId);
        return go(s.target.screen);
      }
      const log = day(state.data, state.date);
      log.foods = log.foods.filter((x) => x.id !== s.entryId);
      store();
      go({ name: 'diary' });
    },
    scan: () => {
      const s = state.screen;
      if (s.name === 'add') openScan(s.target, s);
    },
    quick: () => {
      const s = state.screen;
      if (s.name === 'add' && s.target.kind === 'diary') go({ name: 'quick', meal: s.target.meal, back: s });
    },
    custom: () => {
      const s = state.screen;
      if (s.name === 'add') go({ name: 'custom', target: s.target, back: s });
    },
  },
  changes: {
    'target-meal': (el) => {
      const s = state.screen;
      if (s.name === 'add' && s.target.kind === 'diary') s.target = { kind: 'diary', meal: el.value as Meal };
    },
  },
  inputs: {
    // Suggestions as the user types; the lists come back when the box is cleared.
    search: (_form, input) => {
      const s = state.screen;
      if (s.name !== 'add' || input.name !== 'q') return;
      s.live = input.value;
      const q = s.live.trim();
      if (!q && s.query) {
        Object.assign(s, { query: '', results: [], problems: [], more: false });
        render();
        document.querySelector<HTMLInputElement>('input[name=q]')?.focus();
        return;
      }
      const typing = q !== '' && q !== s.query;
      const live = document.getElementById('search-live')!;
      live.hidden = !typing;
      document.getElementById('add-body')!.hidden = typing;
      live.innerHTML = typing ? liveHtml(s) : '';
    },
    food: (form) => {
      const s = state.screen;
      if (s.name !== 'food') return;
      const { amount, unit } = formAmount(form, s.food);
      document.getElementById('preview')!.innerHTML = nutritionHtml(s.food, amount * unit.grams, s.target.kind === 'diary');
    },
  },
  forms: {
    search: (fd) => {
      const q = String(fd.get('q') ?? '').trim();
      if (q && state.screen.name === 'add') runSearch(state.screen, q);
    },
    food: (fd, form) => {
      const s = state.screen;
      if (s.name !== 'food') return;
      const { amount, unit } = formAmount(form, s.food);
      if (amount <= 0) return;
      const entry = editedItem(s);
      if (entry) Object.assign(entry, { food: s.food, grams: amount * unit.grams, amount, unit: unit.label });
      if (s.target.kind === 'recipe') {
        if (!entry) putFood(s.target, s.food, amount, unit);
        return go(s.target.screen);
      }
      const meal = fd.get('meal') as Meal;
      if (entry) Object.assign(entry, { meal });
      else putFood({ kind: 'diary', meal }, s.food, amount, unit);
      store();
      go({ name: 'diary' });
    },
    custom: (fd) => {
      const s = state.screen;
      if (s.name !== 'custom') return;
      const serving = n(fd, 'serving') || 100;
      const per100 = Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, (n(fd, k) / serving) * 100])) as unknown as Nutrients;
      const micros: Micros = {};
      for (const k of MICRO_KEYS) {
        const typed = String(fd.get(`m-${k}`) ?? '').trim();
        if (typed) micros[k] = (Number(typed) / serving) * 100;
      }
      const food: Food = {
        id: s.edit?.id ?? (s.barcode ? `my:${s.barcode}` : `my:${newId()}`),
        name: String(fd.get('name')).trim(), brand: String(fd.get('brand') ?? '').trim() || undefined,
        per100, micros: Object.keys(micros).length ? micros : undefined,
        servingGrams: serving, servingLabel: String(fd.get('servingName') ?? '').trim() || `${grams(serving)} g`,
      };
      state.data.myFoods = s.edit
        ? state.data.myFoods.map((f) => (f.id === food.id ? food : f))
        : [food, ...state.data.myFoods.filter((f) => f.id !== food.id)];
      store();
      if (s.target && !s.edit) return go({ name: 'food', target: s.target, food, back: s.back });
      state.notice = 'Food saved.';
      go(s.back);
    },
    quick: (fd) => {
      const s = state.screen;
      if (s.name !== 'quick') return;
      const food: Food = {
        id: `quick:${newId()}`, name: 'Quick add', servingGrams: 100,
        per100: { kcal: n(fd, 'kcal'), carbs: n(fd, 'carbs'), protein: n(fd, 'protein'), fat: n(fd, 'fat'), sugar: 0, fiber: 0, sodium: 0 },
      };
      day(state.data, state.date).foods.push({ id: newId(), meal: s.meal, food, grams: 100 });
      store();
      go({ name: 'diary' });
    },
  },
};
