import './style.css';
import { barChart, lineChart, wireCharts } from './charts';
import { fetchDiary, pushDiary, supabase } from './cloud';
import { lookupBarcode, searchFoods, usdaPortions } from './foods';
import { esc } from './html';
import { ACTIVITY_LABELS, EXERCISES, calorieGoal, exerciseKcal, scale, type Activity, type Nutrients } from './nutrition';
import type { Scan } from './scanner';
import {
  DEVICE_KEY, MEALS, addFood, day, defaultData, exerciseTotal, foodTotals, goalsFor, isoDate, load, newId, parseData, peekDay,
  save, setWeight, shiftDate, unitsFor, userKey, weightOn, type Data, type Food, type FoodEntry, type Meal, type Unit,
} from './store';

type FoodList = 'results' | 'recent' | 'mine';

type AuthMode = 'signin' | 'signup' | 'reset';

type Screen =
  | { name: 'loading' }
  | { name: 'auth'; mode: AuthMode; message: string; busy: boolean }
  | { name: 'newpass'; message: string }
  | { name: 'diary' }
  | { name: 'progress' }
  | { name: 'settings' }
  | { name: 'add'; meal: Meal; tab: FoodList; query: string; results: Food[]; loading: boolean; problems: string[] }
  | { name: 'food'; meal: Meal; food: Food; entryId?: string; back: Screen }
  | { name: 'custom'; meal: Meal; barcode?: string; back: Screen }
  | { name: 'quick'; meal: Meal; back: Screen }
  | { name: 'scan'; meal: Meal; status: string; back: Screen }
  | { name: 'exercise' };

const app = document.getElementById('app')!;
let data: Data = defaultData();
let user: { id: string; email: string } | null = null;
let sync: 'synced' | 'saving' | 'offline' = 'synced';
let pushTimer: ReturnType<typeof setTimeout> | undefined;
const today = () => isoDate(new Date());
let date = today();
let screen: Screen = { name: 'loading' };
let notice = '';
let weightRange = 30;
let calorieRange = 7;
let scan: Scan | null = null;

const MEAL_NAMES: Record<Meal, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snacks: 'Snacks' };
const WEEKLY_CHANGES: [number, string][] = [
  [-1, 'Lose 1 kg per week'], [-0.75, 'Lose 0.75 kg per week'], [-0.5, 'Lose 0.5 kg per week'], [-0.25, 'Lose 0.25 kg per week'],
  [0, 'Maintain weight'], [0.25, 'Gain 0.25 kg per week'], [0.5, 'Gain 0.5 kg per week'],
];

const kcal = (n: number) => Math.round(n).toLocaleString();
const grams = (n: number) => (n < 10 ? String(Math.round(n * 10) / 10) : String(Math.round(n)));

// ---------- Saving and sync ----------

// Set while this phone has changes the server hasn't received yet.
const dirtyKey = (userId: string) => `fit-diary-dirty:${userId}`;
const SYNC_TEXT = { synced: 'All changes saved to your account.', saving: 'Saving…', offline: 'Not synced yet. Changes are kept on this phone and sync when you are online.' };

// Saves to this phone right away and to the account shortly after.
function store(): void {
  if (!user) return;
  try {
    save(data, userKey(user.id));
    localStorage.setItem(dirtyKey(user.id), '1');
  } catch (e) {
    notice = 'Could not save on this device. Is storage full or blocked?';
    console.error(e);
  }
  clearTimeout(pushTimer);
  sync = 'saving';
  pushTimer = setTimeout(pushNow, 800);
}

function persist(): void {
  store();
  render();
}

async function pushNow(): Promise<void> {
  const u = user;
  if (!u) return;
  try {
    await pushDiary(u.id, data);
    if (user !== u) return;
    localStorage.removeItem(dirtyKey(u.id));
    sync = 'synced';
  } catch (e) {
    console.warn('Sync failed', e);
    if (user === u) sync = 'offline';
  }
  const badge = app.querySelector('#sync');
  if (badge) badge.textContent = SYNC_TEXT[sync];
}

window.addEventListener('online', () => {
  if (user && localStorage.getItem(dirtyKey(user.id))) pushNow();
});

// Loads a user's diary: unsynced changes on this phone win, otherwise the account's copy.
async function startSession(u: { id: string; email: string }): Promise<void> {
  user = u;
  sync = 'synced';
  screen = { name: 'loading' };
  render();
  const local = load(userKey(u.id));
  try {
    if (local && localStorage.getItem(dirtyKey(u.id))) {
      data = local;
      await pushNow();
    } else {
      const cloud = await fetchDiary(u.id);
      if (cloud) {
        data = parseData(JSON.stringify(cloud));
        save(data, userKey(u.id));
      } else {
        // First sign-in: bring along a diary kept on this phone before accounts existed.
        const device = load(DEVICE_KEY);
        data = local ?? device ?? defaultData();
        store();
        if (device) localStorage.removeItem(DEVICE_KEY);
      }
    }
  } catch (e) {
    console.warn('Could not load the diary from the account', e);
    data = local ?? defaultData();
    sync = 'offline';
    notice = 'Could not reach your account. Showing the copy on this phone.';
  }
  if (user !== u) return;
  date = today();
  screen = { name: 'diary' };
  render();
}

function signedOut(): void {
  user = null;
  data = defaultData();
  go({ name: 'auth', mode: 'signin', message: '', busy: false });
}

supabase.auth.onAuthStateChange((event, session) => {
  const u = session?.user;
  // Supabase asks not to await its own calls inside this callback, so work is deferred.
  setTimeout(async () => {
    if (u && u.id !== user?.id) await startSession({ id: u.id, email: u.email ?? '' });
    if (event === 'PASSWORD_RECOVERY') go({ name: 'newpass', message: '' });
    else if (!u && (user || screen.name === 'loading')) signedOut();
  });
});

const appUrl = () => location.origin + location.pathname;

function go(next: Screen): void {
  scan?.stop();
  scan = null;
  screen = next;
  render();
  window.scrollTo(0, 0);
}

function dateLabel(d: string): string {
  if (d === today()) return 'Today';
  if (d === shiftDate(today(), -1)) return 'Yesterday';
  if (d === shiftDate(today(), 1)) return 'Tomorrow';
  const [y, m, dd] = d.split('-').map(Number);
  return new Date(y, m - 1, dd).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function meter(value: number, goal: number, cls: string, label: string): string {
  const pct = goal > 0 ? Math.min(100, (value / goal) * 100) : 0;
  return `<div class="meter ${cls}" role="meter" aria-label="${esc(label)}" aria-valuenow="${Math.round(value)}" aria-valuemin="0" aria-valuemax="${Math.round(goal)}"><span style="width:${pct}%"></span></div>`;
}

function header(title: string, back?: boolean): string {
  return `<header class="bar">${back ? '<button class="icon" data-act="back" aria-label="Back">‹</button>' : ''}<h1>${esc(title)}</h1></header>`;
}

function tabs(): string {
  const t = (name: string, label: string, icon: string) =>
    `<button data-act="tab" data-tab="${name}" class="${screen.name === name ? 'on' : ''}"><span aria-hidden="true">${icon}</span>${label}</button>`;
  return `<nav class="tabs">${t('diary', 'Diary', '📒')}${t('progress', 'Progress', '📈')}${t('settings', 'Settings', '⚙️')}</nav>`;
}

function noticeHtml(): string {
  const n = notice;
  notice = '';
  return n ? `<p class="notice" role="status">${esc(n)}</p>` : '';
}

// ---------- Diary ----------

// "1 medium (118 g)", "1.5 cup, sliced (225 g)", or just "150 g".
function entryAmount(e: FoodEntry): string {
  if (!e.unit || e.amount === undefined || e.unit === 'g') return `${grams(e.grams)} g`;
  return `${grams(e.amount)} ${e.unit} (${grams(e.grams)} g)`;
}

function diaryView(): string {
  const log = peekDay(data, date);
  const goals = goalsFor(data, date);
  const food = foodTotals(log);
  const burned = exerciseTotal(log);

  const summary = goals
    ? `<section class="card summary">
        <h2>Calories remaining</h2>
        <div class="equation">
          <div><b>${kcal(goals.kcal)}</b><small>Goal</small></div><span>−</span>
          <div><b>${kcal(food.kcal)}</b><small>Food</small></div><span>+</span>
          <div><b>${kcal(burned)}</b><small>Exercise</small></div><span>=</span>
          <div class="hero"><b>${kcal(goals.kcal - food.kcal + burned)}</b><small>Remaining</small></div>
        </div>
        ${meter(food.kcal, goals.kcal + burned, 'm-kcal', 'Calories eaten')}
      </section>
      <section class="card macros">
        ${(['carbs', 'protein', 'fat'] as const).map((k) => `
          <div class="macro">
            <div class="row"><span><i class="dot d-${k}"></i>${k[0].toUpperCase() + k.slice(1)}</span>
              <span>${grams(food[k])} / ${goals[k]} g</span></div>
            ${meter(food[k], goals[k], `m-${k}`, k)}
          </div>`).join('')}
      </section>`
    : `<section class="card summary"><h2>Food today: ${kcal(food.kcal)} kcal</h2>
        <p>Set your profile to get a daily calorie goal.</p>
        <button class="primary" data-act="tab" data-tab="settings">Set up profile</button></section>`;

  const meals = MEALS.map((meal) => {
    const entries = (log?.foods ?? []).filter((e) => e.meal === meal);
    return `<section class="card meal">
      <h2>${MEAL_NAMES[meal]}<span>${kcal(foodTotals(log, meal).kcal)}</span></h2>
      <ul class="list">${entries.map((e) => `<li><button data-act="edit-entry" data-id="${e.id}">
        <span class="name">${esc(e.food.name)}<small>${e.food.brand ? `${esc(e.food.brand)} · ` : ''}${esc(entryAmount(e))}</small></span>
        <span class="kcal">${kcal(scale(e.food.per100, e.grams).kcal)}</span></button></li>`).join('')}</ul>
      <button class="link" data-act="add-food" data-meal="${meal}">+ Add food</button>
    </section>`;
  }).join('');

  const exercise = `<section class="card meal">
    <h2>Exercise<span>${kcal(burned)}</span></h2>
    <ul class="list">${(log?.exercises ?? []).map((x) => `<li><div class="static">
      <span class="name">${esc(x.name)}<small>${x.minutes ? `${x.minutes} min` : ''}</small></span>
      <span class="kcal">${kcal(x.kcal)}</span>
      <button class="icon small" data-act="del-exercise" data-id="${x.id}" aria-label="Delete ${esc(x.name)}">×</button></div></li>`).join('')}</ul>
    <button class="link" data-act="add-exercise">+ Add exercise</button>
  </section>`;

  const waterGoal = data.goals.waterMl;
  const water = `<section class="card">
    <h2>Water<span>${(log?.waterMl ?? 0).toLocaleString()} / ${waterGoal.toLocaleString()} ml</span></h2>
    ${meter(log?.waterMl ?? 0, waterGoal, 'm-kcal', 'Water')}
    <div class="buttons"><button data-act="water" data-ml="-250">− 250 ml</button><button data-act="water" data-ml="250">+ 250 ml</button></div>
  </section>`;

  const nutrientRows: [keyof Nutrients, string, string][] = [
    ['kcal', 'Calories', 'kcal'], ['carbs', 'Carbs', 'g'], ['fat', 'Fat', 'g'], ['protein', 'Protein', 'g'],
    ['sugar', 'Sugar', 'g'], ['fiber', 'Fiber', 'g'], ['sodium', 'Sodium', 'mg'],
  ];
  const nutrients = `<section class="card"><details><summary><h2>Nutrients</h2></summary>
    <table class="nutrients"><thead><tr><th></th><th>Total</th><th>Goal</th><th>Left</th></tr></thead><tbody>
    ${nutrientRows.map(([k, label, unit]) => {
      const g = goals?.[k];
      return `<tr><td>${label}</td><td>${grams(food[k])} ${unit}</td><td>${g !== undefined ? `${grams(g)} ${unit}` : '–'}</td>
        <td>${g !== undefined ? grams(g - food[k]) : '–'}</td></tr>`;
    }).join('')}</tbody></table></details></section>`;

  return `<header class="bar date-bar">
      <button class="icon" data-act="day" data-delta="-1" aria-label="Previous day">‹</button>
      <h1>${esc(dateLabel(date))}</h1>
      <button class="icon" data-act="day" data-delta="1" aria-label="Next day">›</button>
    </header>
    <main>${noticeHtml()}${summary}${meals}${exercise}${water}${nutrients}</main>${tabs()}`;
}

// ---------- Add food ----------

function foodRow(f: Food, list: FoodList, i: number): string {
  const serving = f.servingGrams ? (f.servingLabel ? `${esc(f.servingLabel)}` : `${grams(f.servingGrams)} g`) : '100 g';
  const k = f.servingGrams ? scale(f.per100, f.servingGrams).kcal : f.per100.kcal;
  return `<li><button data-act="pick" data-list="${list}" data-i="${i}">
    <span class="name">${esc(f.name)}<small>${f.brand ? `${esc(f.brand)} · ` : ''}${serving}</small></span>
    <span class="kcal">${kcal(k)}</span></button></li>`;
}

function addView(s: Extract<Screen, { name: 'add' }>): string {
  const lists: Record<FoodList, Food[]> = { results: s.results, recent: data.recent, mine: data.myFoods };
  const tab = (t: FoodList, label: string) => `<button data-act="add-tab" data-tab="${t}" class="${s.tab === t ? 'on' : ''}">${label}</button>`;
  const items = lists[s.tab];
  let body: string;
  if (s.tab === 'results' && s.loading) body = '<p class="empty">Searching…</p>';
  else if (!items.length) {
    body = `<p class="empty">${{
      results: s.query ? 'No foods found. Try other words, scan the barcode, or create the food.' : 'Search for a food above.',
      recent: 'Foods you log will show up here.',
      mine: 'Foods you create will show up here.',
    }[s.tab]}</p>`;
  } else body = `<ul class="list">${items.map((f, i) => foodRow(f, s.tab, i)).join('')}</ul>`;

  return `${header(`Add to ${MEAL_NAMES[s.meal]}`, true)}<main>
    ${noticeHtml()}
    <form class="search" data-form="search">
      <input name="q" type="search" placeholder="Search foods" value="${esc(s.query)}" enterkeyhint="search" autocomplete="off">
      <button class="primary">Search</button>
    </form>
    <div class="buttons">
      <button data-act="scan">📷 Scan barcode</button>
      <button data-act="quick">Quick add</button>
      <button data-act="custom">Create food</button>
    </div>
    ${s.problems.map((p) => `<p class="notice">${esc(p)}</p>`).join('')}
    <div class="seg">${tab('results', 'Search')}${tab('recent', 'Recent')}${tab('mine', 'My foods')}</div>
    <section class="card flush">${body}</section>
  </main>`;
}

// ---------- One food: amount, meal, nutrients ----------

const WEIGHT_LABELS = new Set(['g', 'oz', 'lb', 'kg']);

function unitOptions(f: Food, selected: string): string {
  return unitsFor(f).map((u, i) => `<option value="${i}" ${u.label === selected ? 'selected' : ''}>${
    esc(WEIGHT_LABELS.has(u.label) ? u.label : `${u.label} (${grams(u.grams)} g)`)}</option>`).join('');
}

// What the amount editor starts with: the entry being edited, else 1 portion/serving, else 100 g.
function startingAmount(f: Food, entry?: FoodEntry): { amount: number; unit: Unit } {
  const units = unitsFor(f);
  if (entry) {
    const unit = units.find((u) => u.label === entry.unit);
    return unit && entry.amount !== undefined ? { amount: entry.amount, unit } : { amount: entry.grams, unit: units.find((u) => u.label === 'g')! };
  }
  return units[0].label === 'g' ? { amount: 100, unit: units[0] } : { amount: 1, unit: units[0] };
}

function previewHtml(n: Nutrients): string {
  return `<div class="hero-num"><b>${kcal(n.kcal)}</b><small>kcal</small></div>
    <div class="macro-line">
      <span><i class="dot d-carbs"></i>Carbs ${grams(n.carbs)} g</span>
      <span><i class="dot d-protein"></i>Protein ${grams(n.protein)} g</span>
      <span><i class="dot d-fat"></i>Fat ${grams(n.fat)} g</span>
    </div>
    <p class="muted">Sugar ${grams(n.sugar)} g · Fiber ${grams(n.fiber)} g · Sodium ${kcal(n.sodium)} mg</p>`;
}

function foodView(s: Extract<Screen, { name: 'food' }>): string {
  const f = s.food;
  const entry = s.entryId ? peekDay(data, date)?.foods.find((e) => e.id === s.entryId) : undefined;
  const start = startingAmount(f, entry);
  return `${header(entry ? 'Edit entry' : 'Add food', true)}<main>
    <section class="card">
      <h2 class="food-name">${esc(f.name)}</h2>
      ${f.brand ? `<p class="muted">${esc(f.brand)}</p>` : ''}
      <form data-form="food" class="stack">
        <div class="amount-row">
          <label>Amount<input name="amount" type="number" inputmode="decimal" step="any" min="0" value="${start.amount}" required></label>
          <label>Unit<select name="unit">${unitOptions(f, start.unit.label)}</select></label>
        </div>
        <label>Meal<select name="meal">${MEALS.map((m) => `<option value="${m}" ${m === (entry?.meal ?? s.meal) ? 'selected' : ''}>${MEAL_NAMES[m]}</option>`).join('')}</select></label>
        <div class="preview" id="preview">${previewHtml(scale(f.per100, start.amount * start.unit.grams))}</div>
        <button class="primary">${entry ? 'Save' : 'Add to diary'}</button>
        ${entry ? '<button type="button" class="danger" data-act="del-entry">Delete entry</button>' : ''}
      </form>
    </section>
    <p class="muted center">Per 100 g: ${kcal(f.per100.kcal)} kcal · ${grams(f.per100.carbs)} g carbs · ${grams(f.per100.protein)} g protein · ${grams(f.per100.fat)} g fat</p>
  </main>`;
}

function formAmount(form: HTMLFormElement, f: Food): { amount: number; unit: Unit } {
  const fd = new FormData(form);
  return { amount: Number(fd.get('amount')) || 0, unit: unitsFor(f)[Number(fd.get('unit'))] };
}

// Basic USDA foods list household portions in a separate lookup; fetch them once and keep them on the food.
async function loadPortions(s: Extract<Screen, { name: 'food' }>): Promise<void> {
  if (!s.food.id.startsWith('usda:') || s.food.portions !== undefined || s.food.servingGrams) return;
  let portions: Unit[] = [];
  try {
    portions = await usdaPortions(s.food, data.usdaKey);
  } catch (e) {
    console.warn('Could not load portions', e);
    return;
  }
  s.food = { ...s.food, portions };
  const select = app.querySelector<HTMLSelectElement>('form[data-form="food"] select[name="unit"]');
  if (screen !== s || !select || !portions.length) return;
  const current = unitsFor({ ...s.food, portions: [] })[Number(select.value)];
  const amount = app.querySelector<HTMLInputElement>('form[data-form="food"] input[name="amount"]')!;
  const untouched = current.label === 'g' && amount.value === '100' && !s.entryId;
  select.innerHTML = unitOptions(s.food, untouched ? portions[0].label : current.label);
  if (untouched) {
    amount.value = '1';
    app.querySelector('#preview')!.innerHTML = previewHtml(scale(s.food.per100, portions[0].grams));
  }
}

// ---------- Create food / quick add / scan / exercise ----------

const numField = (name: string, label: string, required = false, value = '') =>
  `<label>${label}<input name="${name}" type="number" inputmode="decimal" step="any" min="0" value="${value}" ${required ? 'required' : ''}></label>`;

function customView(s: Extract<Screen, { name: 'custom' }>): string {
  return `${header('Create food', true)}<main><section class="card">
    <form data-form="custom" class="stack">
      <label>Name<input name="name" required autocomplete="off"></label>
      <label>Brand (optional)<input name="brand" autocomplete="off"></label>
      ${s.barcode ? `<p class="muted">Barcode ${esc(s.barcode)}</p>` : ''}
      <div class="row2">
        <label>Serving name<input name="servingName" placeholder="e.g. 1 piece, 1 bowl" autocomplete="off"></label>
        ${numField('serving', 'Serving size (g or ml)', true, '100')}
      </div>
      <p class="muted">Nutrition per serving, as on the label:</p>
      <div class="row2">${numField('kcal', 'Calories (kcal)', true)}${numField('protein', 'Protein (g)')}</div>
      <div class="row2">${numField('carbs', 'Carbs (g)')}${numField('fat', 'Fat (g)')}</div>
      <div class="row2">${numField('sugar', 'Sugar (g)')}${numField('fiber', 'Fiber (g)')}</div>
      ${numField('sodium', 'Sodium (mg)')}
      <button class="primary">Save and continue</button>
    </form></section></main>`;
}

function quickView(s: Extract<Screen, { name: 'quick' }>): string {
  return `${header(`Quick add to ${MEAL_NAMES[s.meal]}`, true)}<main><section class="card">
    <form data-form="quick" class="stack">
      ${numField('kcal', 'Calories (kcal)', true)}
      <div class="row2">${numField('carbs', 'Carbs (g)')}${numField('protein', 'Protein (g)')}</div>
      ${numField('fat', 'Fat (g)')}
      <button class="primary">Add</button>
    </form></section></main>`;
}

function scanView(s: Extract<Screen, { name: 'scan' }>): string {
  return `${header('Scan barcode', true)}<main>
    <div class="camera"><video id="camera" muted playsinline></video><div class="aim"></div></div>
    <p class="center" role="status">${esc(s.status)}</p>
  </main>`;
}

function exerciseView(): string {
  const w = weightOn(data, date);
  return `${header('Add exercise', true)}<main>
    <section class="card"><h2>Activity</h2>
      ${w === null ? '<p class="notice">Log your weight in Settings so calories burned can be estimated.</p>' : ''}
      <form data-form="exercise" class="stack">
        <label>Activity<select name="met">${EXERCISES.map((x, i) => `<option value="${i}">${esc(x.name)}</option>`).join('')}</select></label>
        ${numField('minutes', 'Minutes', true, '30')}
        <p class="muted" id="burn"></p>
        <button class="primary" ${w === null ? 'disabled' : ''}>Add</button>
      </form>
    </section>
    <section class="card"><h2>Other exercise</h2>
      <form data-form="exercise-custom" class="stack">
        <label>Name<input name="name" required autocomplete="off"></label>
        <div class="row2">${numField('minutes', 'Minutes')}${numField('kcal', 'Calories burned', true)}</div>
        <button class="primary">Add</button>
      </form>
    </section></main>`;
}

// ---------- Progress ----------

function progressView(): string {
  const now = today();
  const from = weightRange ? shiftDate(now, -weightRange) : '';
  const weights = data.weights.filter((w) => w.date >= from);
  const latest = data.weights[data.weights.length - 1];
  const change = latest && data.weights.length > 1 ? latest.kg - data.weights[0].kg : null;
  const range = (act: string, cur: number, opts: [number, string][]) =>
    `<div class="seg small">${opts.map(([v, l]) => `<button data-act="${act}" data-v="${v}" class="${cur === v ? 'on' : ''}">${l}</button>`).join('')}</div>`;

  const days = Array.from({ length: calorieRange }, (_, i) => shiftDate(now, i - calorieRange + 1));
  const logged = days.filter((d) => peekDay(data, d)?.foods.length);
  const bars = days.map((d) => {
    const [y, m, dd] = d.split('-').map(Number);
    const dt = new Date(y, m - 1, dd);
    return {
      label: calorieRange <= 7 ? dt.toLocaleDateString(undefined, { weekday: 'narrow' }) : (dd % 5 === 0 ? String(dd) : ''),
      title: dt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
      value: foodTotals(peekDay(data, d)).kcal,
    };
  });
  const avg = logged.length ? logged.reduce((s, d) => s + foodTotals(peekDay(data, d)).kcal, 0) / logged.length : 0;
  const goal = goalsFor(data, now)?.kcal;

  return `${header('Progress')}<main>${noticeHtml()}
    <section class="card">
      <h2>Weight</h2>
      <form data-form="weight" class="search">
        <input name="kg" type="number" inputmode="decimal" step="0.1" min="20" max="400" placeholder="Today's weight (kg)" required>
        <button class="primary">Log</button>
      </form>
      ${latest ? `<div class="stats">
          <div><b>${grams(latest.kg)}</b><small>Current kg</small></div>
          ${change !== null ? `<div><b>${change > 0 ? '+' : ''}${grams(change)}</b><small>Since start</small></div>` : ''}
        </div>
        ${range('weight-range', weightRange, [[30, '30 days'], [90, '90 days'], [0, 'All']])}
        ${weights.length ? lineChart(weights.map((w) => ({ date: w.date, value: w.kg })), 'kg') : '<p class="empty">No weigh-ins in this range.</p>'}`
      : '<p class="empty">Log your weight to see your progress.</p>'}
    </section>
    <section class="card">
      <h2>Calories eaten</h2>
      <div class="stats"><div><b>${kcal(avg)}</b><small>Daily average (${logged.length} logged days)</small></div></div>
      ${range('cal-range', calorieRange, [[7, '7 days'], [30, '30 days']])}
      ${barChart(bars, 'kcal', goal)}
    </section>
  </main>${tabs()}`;
}

// ---------- Settings ----------

function settingsView(): string {
  const p = data.profile;
  const g = data.goals;
  const w = weightOn(data, today());
  const auto = w !== null ? calorieGoal(p, w, new Date().getFullYear()) : null;
  const opt = (v: string | number, label: string, cur: string | number) => `<option value="${v}" ${String(v) === String(cur) ? 'selected' : ''}>${esc(label)}</option>`;
  return `${header('Settings')}<main>${noticeHtml()}
    <section class="card stack"><h2>Account</h2>
      <p>Signed in as <b>${esc(user?.email ?? '')}</b></p>
      <p class="muted" id="sync" role="status">${SYNC_TEXT[sync]}</p>
      <button data-act="sign-out">Sign out</button>
    </section>
    <form data-form="settings" class="stack">
      <section class="card stack"><h2>Profile</h2>
        <div class="row2">
          <label>Sex<select name="sex">${opt('female', 'Female', p.sex)}${opt('male', 'Male', p.sex)}</select></label>
          ${numField('birthYear', 'Birth year', true, String(p.birthYear))}
        </div>
        <div class="row2">
          ${numField('heightCm', 'Height (cm)', true, String(p.heightCm))}
          ${numField('weightKg', 'Weight (kg)', true, w !== null ? String(w) : '')}
        </div>
        <label>Activity level<select name="activity">${(Object.keys(ACTIVITY_LABELS) as Activity[]).map((a) => opt(a, ACTIVITY_LABELS[a], p.activity)).join('')}</select></label>
        <label>Goal<select name="weeklyChangeKg">${WEEKLY_CHANGES.map(([v, l]) => opt(v, l, p.weeklyChangeKg)).join('')}</select></label>
      </section>
      <section class="card stack"><h2>Daily goals</h2>
        <p>${auto !== null ? `Calculated calorie goal: <b>${kcal(auto)} kcal</b>` : 'Enter your weight to calculate a calorie goal.'}</p>
        ${numField('kcalOverride', 'Use my own calorie goal (leave empty for calculated)', false, g.kcalOverride !== null ? String(g.kcalOverride) : '')}
        <p class="muted">Macros, % of calories (must add up to 100):</p>
        <div class="row3">${numField('carbsPct', 'Carbs %', true, String(g.carbsPct))}${numField('proteinPct', 'Protein %', true, String(g.proteinPct))}${numField('fatPct', 'Fat %', true, String(g.fatPct))}</div>
        <div class="row3">${numField('sugarG', 'Sugar (g)', true, String(g.sugarG))}${numField('fiberG', 'Fiber (g)', true, String(g.fiberG))}${numField('sodiumMg', 'Sodium (mg)', true, String(g.sodiumMg))}</div>
        ${numField('waterMl', 'Water (ml)', true, String(g.waterMl))}
      </section>
      <section class="card stack"><h2>Food search</h2>
        <label>USDA API key<input name="usdaKey" value="${esc(data.usdaKey)}" autocomplete="off" placeholder="Optional, free"></label>
        <p class="muted">Without a key, USDA allows only a few searches per hour. Get a free key at
          <a href="https://fdc.nal.usda.gov/api-key-signup" target="_blank" rel="noopener">fdc.nal.usda.gov</a> and paste it here.</p>
      </section>
      <button class="primary">Save settings</button>
    </form>
    <section class="card stack"><h2>Backup</h2>
      <p class="muted">Your diary is saved to your account. You can also keep a backup file.</p>
      <div class="buttons"><button data-act="export">Export backup</button>
        <label class="button">Import backup<input type="file" accept="application/json,.json" data-act="import" hidden></label></div>
    </section>
  </main>${tabs()}`;
}

// ---------- Accounts ----------

function authView(s: Extract<Screen, { name: 'auth' }>): string {
  const tab = (m: AuthMode, label: string) => `<button data-act="auth-mode" data-mode="${m}" class="${s.mode === m ? 'on' : ''}">${label}</button>`;
  const reset = s.mode === 'reset';
  return `${header('Fit Diary')}<main>
    ${reset ? '' : `<div class="seg">${tab('signin', 'Sign in')}${tab('signup', 'Create account')}</div>`}
    <section class="card">
      ${reset ? '<h2>Reset password</h2><p class="muted">We will email you a link to choose a new password.</p>' : ''}
      <form data-form="auth" class="stack">
        <label>Email<input name="email" type="email" autocomplete="email" required></label>
        ${reset ? '' : `<label>Password<input name="password" type="password" minlength="6" required
          autocomplete="${s.mode === 'signup' ? 'new-password' : 'current-password'}"></label>`}
        <button class="primary" ${s.busy ? 'disabled' : ''}>${{ signin: 'Sign in', signup: 'Create account', reset: 'Send reset email' }[s.mode]}</button>
      </form>
      ${s.message ? `<p class="notice" role="status">${esc(s.message)}</p>` : ''}
      ${reset
        ? '<button class="link" data-act="auth-mode" data-mode="signin">Back to sign in</button>'
        : '<button class="link" data-act="auth-mode" data-mode="reset">Forgot password?</button>'}
    </section>
    <p class="muted center">Your diary is private to your account.</p>
  </main>`;
}

function newPassView(s: Extract<Screen, { name: 'newpass' }>): string {
  return `${header('Choose a new password')}<main><section class="card">
    <form data-form="newpass" class="stack">
      <label>New password<input name="password" type="password" minlength="6" autocomplete="new-password" required></label>
      <label>Repeat it<input name="again" type="password" minlength="6" autocomplete="new-password" required></label>
      <button class="primary">Save password</button>
    </form>
    ${s.message ? `<p class="notice" role="status">${esc(s.message)}</p>` : ''}
  </section></main>`;
}

async function submitAuth(s: Extract<Screen, { name: 'auth' }>, email: string, password: string): Promise<void> {
  s.busy = true;
  render();
  let message = '';
  if (s.mode === 'signin') {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) message = error.message;
  } else if (s.mode === 'signup') {
    const { data: r, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: appUrl() } });
    if (error) message = error.message;
    else if (!r.session) {
      s.mode = 'signin';
      message = `We sent a confirmation link to ${email}. Tap it, then sign in here.`;
    }
  } else {
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: appUrl() });
    message = error ? error.message : 'If that email has an account, a reset link is on its way.';
  }
  s.busy = false;
  s.message = message;
  if (screen === s) render();
}

// ---------- Render & events ----------

function render(): void {
  switch (screen.name) {
    case 'loading': app.innerHTML = `${header('Fit Diary')}<main><p class="empty">Loading…</p></main>`; break;
    case 'auth': app.innerHTML = authView(screen); break;
    case 'newpass': app.innerHTML = newPassView(screen); break;
    case 'diary': app.innerHTML = diaryView(); break;
    case 'progress': app.innerHTML = progressView(); wireCharts(app); break;
    case 'settings': app.innerHTML = settingsView(); break;
    case 'add': app.innerHTML = addView(screen); break;
    case 'food': app.innerHTML = foodView(screen); loadPortions(screen); break;
    case 'custom': app.innerHTML = customView(screen); break;
    case 'quick': app.innerHTML = quickView(screen); break;
    case 'scan': app.innerHTML = scanView(screen); break;
    case 'exercise': app.innerHTML = exerciseView(); updateBurn(); break;
  }
}

function addScreen(meal: Meal): Screen {
  return { name: 'add', meal, tab: data.recent.length ? 'recent' : 'results', query: '', results: [], loading: false, problems: [] };
}

function backTarget(): Screen {
  if ('back' in screen) return screen.back;
  return { name: 'diary' };
}

async function runSearch(s: Extract<Screen, { name: 'add' }>, query: string): Promise<void> {
  Object.assign(s, { query, tab: 'results', loading: true, results: [], problems: [] });
  render();
  try {
    const r = await searchFoods(query, data.usdaKey);
    Object.assign(s, { results: r.foods, problems: r.problems });
  } catch (e) {
    s.problems = ['Search failed. Check your internet connection.'];
    console.error(e);
  }
  s.loading = false;
  if (screen === s) render();
}

async function startScanning(s: Extract<Screen, { name: 'scan' }>): Promise<void> {
  const video = document.getElementById('camera') as HTMLVideoElement;
  try {
    const { startScan } = await import('./scanner');
    if (screen !== s) return;
    scan = await startScan(video, async (code) => {
      scan = null;
      s.status = `Found ${code}. Looking it up…`;
      render();
      try {
        const food = await lookupBarcode(code, data.usdaKey);
        if (screen !== s) return;
        if (food) go({ name: 'food', meal: s.meal, food, back: s.back });
        else {
          notice = `Barcode ${code} is not in the food databases yet. You can create it.`;
          go({ name: 'custom', meal: s.meal, barcode: code, back: s.back });
        }
      } catch (e) {
        console.error(e);
        s.status = 'Lookup failed. Check your internet connection and try again.';
        if (screen === s) render();
      }
    });
    s.status = 'Point the camera at the barcode.';
    if (screen === s) app.querySelector('[role=status]')!.textContent = s.status;
    else scan.stop();
  } catch (e) {
    console.error(e);
    s.status = !window.isSecureContext
      ? 'The camera only works when the app is opened over https.'
      : 'Could not open the camera. Allow camera access for this app and try again.';
    if (screen === s) render();
  }
}

function updateBurn(): void {
  const form = app.querySelector<HTMLFormElement>('form[data-form="exercise"]');
  const out = app.querySelector('#burn');
  const w = weightOn(data, date);
  if (!form || !out || w === null) return;
  const fd = new FormData(form);
  out.textContent = `About ${kcal(exerciseKcal(EXERCISES[Number(fd.get('met'))].met, w, Number(fd.get('minutes')) || 0))} kcal burned`;
}

const n = (fd: FormData, k: string) => Number(fd.get(k)) || 0;

app.addEventListener('click', (e) => {
  const el = (e.target as Element).closest<HTMLElement>('[data-act]');
  if (!el || el.tagName === 'INPUT') return;
  const act = el.dataset.act!;
  switch (act) {
    case 'tab': return go({ name: el.dataset.tab as 'diary' | 'progress' | 'settings' });
    case 'back': return go(backTarget());
    case 'day': date = shiftDate(date, Number(el.dataset.delta)); return render();
    case 'add-food': return go(addScreen(el.dataset.meal as Meal));
    case 'add-tab': if (screen.name === 'add') { screen.tab = el.dataset.tab as FoodList; render(); } return;
    case 'pick': {
      if (screen.name !== 'add') return;
      const lists: Record<FoodList, Food[]> = { results: screen.results, recent: data.recent, mine: data.myFoods };
      const food = lists[el.dataset.list as FoodList][Number(el.dataset.i)];
      return go({ name: 'food', meal: screen.meal, food, back: screen });
    }
    case 'edit-entry': {
      const entry = peekDay(data, date)?.foods.find((x) => x.id === el.dataset.id);
      if (entry) go({ name: 'food', meal: entry.meal, food: entry.food, entryId: entry.id, back: { name: 'diary' } });
      return;
    }
    case 'del-entry': {
      if (screen.name !== 'food' || !screen.entryId) return;
      const log = day(data, date);
      log.foods = log.foods.filter((x) => x.id !== (screen as { entryId: string }).entryId);
      screen = { name: 'diary' };
      return persist();
    }
    case 'scan': if (screen.name === 'add') { const s: Screen = { name: 'scan', meal: screen.meal, status: 'Starting camera…', back: screen }; go(s); startScanning(s); } return;
    case 'quick': if (screen.name === 'add') go({ name: 'quick', meal: screen.meal, back: screen }); return;
    case 'custom': if (screen.name === 'add') go({ name: 'custom', meal: screen.meal, back: screen }); return;
    case 'add-exercise': return go({ name: 'exercise' });
    case 'del-exercise': {
      const log = day(data, date);
      log.exercises = log.exercises.filter((x) => x.id !== el.dataset.id);
      return persist();
    }
    case 'water': {
      const log = day(data, date);
      log.waterMl = Math.max(0, log.waterMl + Number(el.dataset.ml));
      return persist();
    }
    case 'weight-range': weightRange = Number(el.dataset.v); return render();
    case 'cal-range': calorieRange = Number(el.dataset.v); return render();
    case 'auth-mode':
      if (screen.name === 'auth') Object.assign(screen, { mode: el.dataset.mode as AuthMode, message: '' });
      return render();
    case 'sign-out': {
      if (!user) return;
      if (localStorage.getItem(dirtyKey(user.id)) && !confirm('Some changes have not reached your account yet and will be lost. Sign out anyway?')) return;
      localStorage.removeItem(userKey(user.id));
      localStorage.removeItem(dirtyKey(user.id));
      supabase.auth.signOut().then(({ error }) => error && console.warn(error));
      return signedOut();
    }
    case 'export': {
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }));
      const a = Object.assign(document.createElement('a'), { href: url, download: `fit-diary-${today()}.json` });
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return;
    }
  }
});

app.addEventListener('change', async (e) => {
  const input = e.target as HTMLInputElement;
  if (input.dataset.act === 'import' && input.files?.[0]) {
    try {
      const imported = parseData(await input.files[0].text());
      if (!confirm('Replace everything in this app with the backup?')) return;
      data = imported;
      notice = 'Backup imported.';
    } catch (err) {
      notice = err instanceof Error ? err.message : 'Could not read that file.';
    }
    persist();
  }
});

app.addEventListener('input', (e) => {
  const form = (e.target as Element).closest('form');
  if (form?.dataset.form === 'food' && screen.name === 'food') {
    const { amount, unit } = formAmount(form, screen.food);
    app.querySelector('#preview')!.innerHTML = previewHtml(scale(screen.food.per100, amount * unit.grams));
  } else if (form?.dataset.form === 'exercise') updateBurn();
});

app.addEventListener('submit', (e) => {
  e.preventDefault();
  const form = e.target as HTMLFormElement;
  const fd = new FormData(form);
  switch (form.dataset.form) {
    case 'auth': {
      if (screen.name !== 'auth' || screen.busy) return;
      submitAuth(screen, String(fd.get('email')).trim(), String(fd.get('password') ?? ''));
      return;
    }
    case 'newpass': {
      if (screen.name !== 'newpass') return;
      const s = screen;
      if (fd.get('password') !== fd.get('again')) {
        s.message = 'The two passwords are different.';
        return render();
      }
      supabase.auth.updateUser({ password: String(fd.get('password')) }).then(({ error }) => {
        if (error) {
          s.message = error.message;
          if (screen === s) render();
        } else {
          notice = 'Password changed.';
          go({ name: 'diary' });
        }
      });
      return;
    }
    case 'search': {
      const q = String(fd.get('q') ?? '').trim();
      if (q && screen.name === 'add') runSearch(screen, q);
      return;
    }
    case 'food': {
      if (screen.name !== 'food') return;
      const { amount, unit } = formAmount(form, screen.food);
      const meal = fd.get('meal') as Meal;
      if (amount <= 0) return;
      if (screen.entryId) {
        const entry = day(data, date).foods.find((x) => x.id === (screen as { entryId: string }).entryId);
        if (entry) Object.assign(entry, { food: screen.food, grams: amount * unit.grams, amount, unit: unit.label, meal });
      } else addFood(data, date, meal, screen.food, amount, unit);
      screen = { name: 'diary' };
      return persist();
    }
    case 'custom': {
      if (screen.name !== 'custom') return;
      const serving = n(fd, 'serving') || 100;
      const per100 = Object.fromEntries((['kcal', 'protein', 'carbs', 'fat', 'sugar', 'fiber', 'sodium'] as const)
        .map((k) => [k, (n(fd, k) / serving) * 100])) as unknown as Nutrients;
      const food: Food = {
        id: screen.barcode ? `my:${screen.barcode}` : `my:${newId()}`,
        name: String(fd.get('name')).trim(), brand: String(fd.get('brand') ?? '').trim() || undefined,
        per100, servingGrams: serving, servingLabel: String(fd.get('servingName') ?? '').trim() || `${grams(serving)} g`,
      };
      data.myFoods = [food, ...data.myFoods.filter((f) => f.id !== food.id)];
      store();
      return go({ name: 'food', meal: screen.meal, food, back: screen.back });
    }
    case 'quick': {
      if (screen.name !== 'quick') return;
      const food: Food = {
        id: `quick:${newId()}`, name: 'Quick add', servingGrams: 100,
        per100: { kcal: n(fd, 'kcal'), carbs: n(fd, 'carbs'), protein: n(fd, 'protein'), fat: n(fd, 'fat'), sugar: 0, fiber: 0, sodium: 0 },
      };
      day(data, date).foods.push({ id: newId(), meal: screen.meal, food, grams: 100 });
      screen = { name: 'diary' };
      return persist();
    }
    case 'exercise': {
      const w = weightOn(data, date);
      if (w === null) return;
      const x = EXERCISES[n(fd, 'met')];
      const minutes = n(fd, 'minutes');
      day(data, date).exercises.push({ id: newId(), name: x.name, minutes, kcal: exerciseKcal(x.met, w, minutes) });
      screen = { name: 'diary' };
      return persist();
    }
    case 'exercise-custom': {
      day(data, date).exercises.push({ id: newId(), name: String(fd.get('name')).trim(), minutes: n(fd, 'minutes'), kcal: Math.round(n(fd, 'kcal')) });
      screen = { name: 'diary' };
      return persist();
    }
    case 'weight': {
      setWeight(data, today(), n(fd, 'kg'));
      notice = 'Weight logged.';
      return persist();
    }
    case 'settings': {
      const pct = n(fd, 'carbsPct') + n(fd, 'proteinPct') + n(fd, 'fatPct');
      if (Math.round(pct) !== 100) {
        notice = `Macro percentages add up to ${pct}%. They must add up to 100%.`;
        return render();
      }
      data.profile = {
        sex: fd.get('sex') as 'male' | 'female', birthYear: n(fd, 'birthYear'), heightCm: n(fd, 'heightCm'),
        activity: fd.get('activity') as Activity, weeklyChangeKg: n(fd, 'weeklyChangeKg'),
      };
      const kg = n(fd, 'weightKg');
      if (kg > 0 && kg !== weightOn(data, today())) setWeight(data, today(), kg);
      const override = String(fd.get('kcalOverride') ?? '').trim();
      data.goals = {
        kcalOverride: override ? Number(override) : null,
        carbsPct: n(fd, 'carbsPct'), proteinPct: n(fd, 'proteinPct'), fatPct: n(fd, 'fatPct'),
        sugarG: n(fd, 'sugarG'), fiberG: n(fd, 'fiberG'), sodiumMg: n(fd, 'sodiumMg'), waterMl: n(fd, 'waterMl'),
      };
      data.usdaKey = String(fd.get('usdaKey') ?? '').trim();
      notice = 'Settings saved.';
      return persist();
    }
  }
});

render();
