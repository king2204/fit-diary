// Finding foods (search, history, my meals/recipes/foods, barcode) and choosing an amount.
import { donut } from '../charts';
import { go, onLeave, persist, render, state, store, type FoodTab, type Handlers, type Screen, type Target } from '../core';
import { lookupBarcode, searchFoods, usdaPortions } from '../foods';
import { esc } from '../html';
import { NUTRIENT_KEYS, macroPct, scale, type Nutrients } from '../nutrition';
import type { Scan } from '../scanner';
import {
  MEALS, addFood, day, goalsFor, itemsTotals, logItems, newId, peekDay, recipeFood, unitsFor, type Food, type MealItem, type Meal, type Unit,
} from '../store';
import { grams, header, icon, kcal, mealName, meter, numField, option } from '../ui';

type AddScreen = Extract<Screen, { name: 'add' }>;
type FoodScreen = Extract<Screen, { name: 'food' }>;
type ScanScreen = Extract<Screen, { name: 'scan' }>;

export function addScreen(target: Target, back: Screen): AddScreen {
  return { name: 'add', target, tab: 'all', query: '', results: [], loading: false, problems: [], back };
}

// ---------- Add food: search and lists ----------

// The foods behind each list on the Add food screen, so a tapped row can be found again.
function listFoods(s: AddScreen, list: string): Food[] {
  if (list === 'results') return s.results;
  if (list === 'recent') return state.data.recent;
  if (list === 'mine') return state.data.myFoods;
  return state.data.recipes.map(recipeFood).filter((f): f is Food => f !== null);
}

function servingText(f: Food): string {
  if (!f.servingGrams) return '100 g';
  return f.servingLabel || `1 serving (${grams(f.servingGrams)} g)`;
}

function foodRow(f: Food, list: string, i: number): string {
  const k = f.servingGrams ? scale(f.per100, f.servingGrams).kcal : f.per100.kcal;
  return `<li class="row-add"><button data-act="pick" data-list="${list}" data-i="${i}">
      <span class="name">${esc(f.name)}<small>${kcal(k)} kcal, ${esc(servingText(f))}${f.brand ? `, ${esc(f.brand)}` : ''}</small></span></button>
    <button class="add-circle" data-act="quick-log" data-list="${list}" data-i="${i}" aria-label="Add ${esc(f.name)}">${icon('plus')}</button></li>`;
}

const listHtml = (foods: Food[], list: string) => `<section class="card flush"><ul class="list">${foods.map((f, i) => foodRow(f, list, i)).join('')}</ul></section>`;

export function addView(s: AddScreen): string {
  const d = state.data;
  const diary = s.target.kind === 'diary' ? s.target : null;
  const title = diary
    ? `<select class="title-select" data-act="target-meal" aria-label="Meal">${MEALS.map((m) => option(m, mealName(m), diary.meal)).join('')}</select>`
    : '<h1>Add ingredient</h1>';
  const tab = (t: FoodTab, label: string) => `<button data-act="add-tab" data-tab="${t}" class="${s.tab === t ? 'on' : ''}">${label}</button>`;
  const tile = (ic: Parameters<typeof icon>[0], label: string, act: string) => `<button class="tile-btn" data-act="${act}">${icon(ic)}<span>${label}</span></button>`;

  let body = '';
  if (s.tab === 'all') {
    body = `<div class="tiles">${tile('scan', 'Scan barcode', 'scan')}${diary ? tile('bolt', 'Quick add', 'quick') : ''}${tile('apple', 'Create food', 'custom')}</div>
      ${s.problems.map((p) => `<p class="notice">${esc(p)}</p>`).join('')}`;
    if (s.loading) body += '<p class="empty">Searching…</p>';
    else if (s.query) {
      body += `<h3 class="list-title">Results for “${esc(s.query)}”</h3>`
        + (s.results.length ? listHtml(s.results, 'results') : '<p class="empty">No foods found. Try other words, scan the barcode, or create the food.</p>');
    } else {
      body += '<h3 class="list-title">History</h3>'
        + (d.recent.length ? listHtml(d.recent, 'recent') : '<p class="empty">Foods you log will show up here.</p>');
    }
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
        <span class="search-box">${icon('search')}<input name="q" type="search" placeholder="Search for a food" value="${esc(s.query)}" enterkeyhint="search" autocomplete="off" aria-label="Search for a food"></span>
        <button class="primary">Search</button>
      </form>
      <div class="seg">${tab('all', 'All')}${diary ? `${tab('meals', 'My meals')}${tab('recipes', 'Recipes')}` : ''}${tab('mine', 'My foods')}</div>
      ${body}
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

// Calories in the middle, the macro split around it, then % of daily goals and the full label.
export function nutritionHtml(n: Nutrients, showGoals = true): string {
  const pct = macroPct(n);
  const goals = showGoals ? goalsFor(state.data, state.date) : null;
  const col = (k: 'carbs' | 'protein' | 'fat', label: string) =>
    `<div><small>${pct ? Math.round(pct[k]) : 0}%</small><b>${grams(n[k])} g</b><span><i class="dot d-${k}"></i>${label}</span></div>`;
  const goalRow = (label: string, value: number, goal: number, cls: string) => {
    const share = goal > 0 ? Math.round((value / goal) * 100) : 0;
    return `<div class="goal-row"><span>${label}</span>${meter(value, goal, cls, `${label}, % of daily goal`)}<b>${share}%</b></div>`;
  };
  const facts: [keyof Nutrients, string, string][] = [
    ['kcal', 'Calories', ''], ['fat', 'Total fat', 'g'], ['carbs', 'Total carbohydrates', 'g'], ['fiber', 'Dietary fiber', 'g'],
    ['sugar', 'Sugars', 'g'], ['protein', 'Protein', 'g'], ['sodium', 'Sodium', 'mg'],
  ];
  return `<section class="card macro-card">
      ${donut([{ value: n.carbs * 4, cls: 'carbs' }, { value: n.protein * 4, cls: 'protein' }, { value: n.fat * 9, cls: 'fat' }], 104, 10,
        `<b>${kcal(n.kcal)}</b><small>kcal</small>`)}
      <div class="macro-cols">${col('carbs', 'Carbs')}${col('protein', 'Protein')}${col('fat', 'Fat')}</div>
    </section>
    ${goals ? `<section class="card"><h2>Percent of your daily goals</h2>
      ${goalRow('Calories', n.kcal, goals.kcal, 'm-kcal')}${goalRow('Carbs', n.carbs, goals.carbs, 'm-carbs')}
      ${goalRow('Protein', n.protein, goals.protein, 'm-protein')}${goalRow('Fat', n.fat, goals.fat, 'm-fat')}</section>` : ''}
    <section class="card"><h2>Nutrition facts</h2><table class="facts"><tbody>
      ${facts.map(([k, label, unit]) => `<tr><td>${label}</td><td>${k === 'kcal' || k === 'sodium' ? kcal(n[k]) : grams(n[k])}${unit ? ` ${unit}` : ''}</td></tr>`).join('')}
    </tbody></table></section>`;
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
      <form id="food-form" data-form="food" class="rows">
        ${meal ? `<label class="field-row"><span>Meal</span><select name="meal">${MEALS.map((m) => option(m, mealName(m), meal)).join('')}</select></label>` : ''}
        <label class="field-row"><span>Amount</span><input name="amount" type="number" inputmode="decimal" step="any" min="0" value="${start.amount}" required></label>
        <label class="field-row"><span>Serving size</span><select name="unit">${unitOptions(f, start.unit.label)}</select></label>
      </form>
    </section>
    <div id="preview" class="stack">${nutritionHtml(scale(f.per100, start.amount * start.unit.grams), !!diary)}</div>
    <button class="primary wide" form="food-form">${entry ? 'Save' : diary ? 'Add to diary' : 'Add to recipe'}</button>
    ${entry ? `<button class="danger wide" data-act="del-entry">${diary ? 'Delete entry' : 'Remove ingredient'}</button>` : ''}
  </main>`;
}

function formAmount(form: HTMLFormElement, f: Food): { amount: number; unit: Unit } {
  const fd = new FormData(form);
  return { amount: Number(fd.get('amount')) || 0, unit: unitsFor(f)[Number(fd.get('unit'))] };
}

// Basic USDA foods list household portions in a separate lookup; fetch them once and keep them on the food.
export async function loadPortions(s: FoodScreen): Promise<void> {
  if (!s.food.id.startsWith('usda:') || s.food.portions !== undefined || s.food.servingGrams) return;
  let portions: Unit[] = [];
  try {
    portions = await usdaPortions(s.food, state.data.usdaKey);
  } catch (e) {
    console.warn('Could not load portions', e);
    return;
  }
  s.food = { ...s.food, portions };
  const select = document.querySelector<HTMLSelectElement>('form[data-form="food"] select[name="unit"]');
  if (state.screen !== s || !select || !portions.length) return;
  const current = unitsFor({ ...s.food, portions: [] })[Number(select.value)];
  const amount = document.querySelector<HTMLInputElement>('form[data-form="food"] input[name="amount"]')!;
  const untouched = current.label === 'g' && amount.value === '100' && !s.entryId;
  select.innerHTML = unitOptions(s.food, untouched ? portions[0].label : current.label);
  if (untouched) {
    amount.value = '1';
    document.getElementById('preview')!.innerHTML = nutritionHtml(scale(s.food.per100, portions[0].grams), s.target.kind === 'diary');
  }
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
        const food = await lookupBarcode(code, state.data.usdaKey);
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
  Object.assign(s, { query, tab: 'all', loading: true, results: [], problems: [] });
  render();
  try {
    const r = await searchFoods(query, state.data.usdaKey);
    Object.assign(s, { results: r.foods, problems: r.problems });
  } catch (e) {
    s.problems = ['Search failed. Check your internet connection.'];
    console.error(e);
  }
  s.loading = false;
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
    food: (form) => {
      const s = state.screen;
      if (s.name !== 'food') return;
      const { amount, unit } = formAmount(form, s.food);
      document.getElementById('preview')!.innerHTML = nutritionHtml(scale(s.food.per100, amount * unit.grams), s.target.kind === 'diary');
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
      const food: Food = {
        id: s.edit?.id ?? (s.barcode ? `my:${s.barcode}` : `my:${newId()}`),
        name: String(fd.get('name')).trim(), brand: String(fd.get('brand') ?? '').trim() || undefined,
        per100, servingGrams: serving, servingLabel: String(fd.get('servingName') ?? '').trim() || `${grams(serving)} g`,
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
