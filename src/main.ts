import './style.css';
import { wireCharts } from './charts';
import { fetchDiary, supabase } from './cloud';
import { back, dirtyKey, go, onRender, pushNow, render, signedOut, state, store, today, type Handlers, type Screen } from './core';
import { esc } from './html';
import { DEVICE_KEY, activeFast, defaultData, load, parseData, save, userKey } from './store';
import { header } from './ui';
import * as auth from './views/auth';
import * as diary from './views/diary';
import * as exercise from './views/exercise';
import * as fasting from './views/fasting';
import * as food from './views/food';
import * as goals from './views/goals';
import * as home from './views/home';
import * as more from './views/more';
import * as nutrition from './views/nutrition-view';
import * as progress from './views/progress';
import * as sheets from './views/sheets';

const app = document.getElementById('app')!;

function view(s: Screen): string {
  switch (s.name) {
    case 'loading': return `${header('Fit Diary')}<main><p class="empty">Loading…</p></main>`;
    case 'auth': return auth.authView(s);
    case 'newpass': return auth.newPassView(s);
    case 'home': return home.homeView();
    case 'diary': return diary.diaryView();
    case 'progress': return progress.progressView();
    case 'more': return more.moreView();
    case 'add': return food.addView(s);
    case 'food': return food.foodView(s);
    case 'custom': return food.customView(s);
    case 'quick': return food.quickView(s);
    case 'scan': return food.scanView(s);
    case 'exercise': return exercise.exerciseView(s);
    case 'cardio': return exercise.cardioView(s);
    case 'weighin': return progress.weighinView(s);
    case 'nutrition': return nutrition.nutritionView(s);
    case 'goals': return goals.goalsView(s);
    case 'settings': return more.settingsView(s);
    case 'meals': return more.mealsView(s);
    case 'meal': return more.mealView(s);
    case 'recipes': return more.recipesView(s);
    case 'recipe': return more.recipeView(s);
    case 'myfoods': return more.myFoodsView(s);
    case 'fasting': return fasting.fastingView(s);
  }
}

onRender(() => {
  let html = view(state.screen);
  if (state.sheet) html += sheets.sheetHtml(state.sheet);
  if (state.notice) html += `<div class="toast" role="status">${esc(state.notice)}</div>`;
  state.notice = '';
  app.innerHTML = html;
  document.body.classList.toggle('locked', !!state.sheet);
  wireCharts(app);
  if (state.screen.name === 'food') food.loadPortions(state.screen);
});

// ---------- Sessions ----------

// Loads a user's diary: unsynced changes on this phone win, otherwise the account's copy.
async function startSession(u: { id: string; email: string }): Promise<void> {
  state.user = u;
  state.sync = 'synced';
  go({ name: 'loading' });
  const local = load(userKey(u.id));
  try {
    if (local && localStorage.getItem(dirtyKey(u.id))) {
      state.data = local;
      await pushNow();
    } else {
      const cloud = await fetchDiary(u.id);
      if (cloud) {
        state.data = parseData(JSON.stringify(cloud));
        save(state.data, userKey(u.id));
      } else {
        // First sign-in: bring along a diary kept on this phone before accounts existed.
        const device = load(DEVICE_KEY);
        state.data = local ?? device ?? defaultData();
        store();
        if (device) localStorage.removeItem(DEVICE_KEY);
      }
    }
  } catch (e) {
    console.warn('Could not load the diary from the account', e);
    state.data = local ?? defaultData();
    state.sync = 'offline';
    state.notice = 'Could not reach your account. Showing the copy on this phone.';
  }
  if (state.user !== u) return;
  state.date = today();
  go({ name: 'home' });
}

supabase.auth.onAuthStateChange((event, session) => {
  const u = session?.user;
  // Supabase asks not to await its own calls inside this callback, so work is deferred.
  setTimeout(async () => {
    if (u && u.id !== state.user?.id) await startSession({ id: u.id, email: u.email ?? '' });
    if (event === 'PASSWORD_RECOVERY') go({ name: 'newpass', message: '' });
    else if (!u && (state.user || state.screen.name === 'loading')) signedOut();
  });
});

window.addEventListener('online', () => {
  if (state.user && localStorage.getItem(dirtyKey(state.user.id))) pushNow();
});

// A running fast's clock on the dashboard and fasting screens.
setInterval(() => {
  const busy = state.sheet || document.activeElement?.matches('input, select, textarea');
  if (!busy && activeFast(state.data) && (state.screen.name === 'home' || state.screen.name === 'fasting')) render();
}, 30000);

// ---------- Events ----------

const TABS = ['home', 'diary', 'progress', 'more'] as const;

const core: Handlers = {
  actions: {
    tab: (el) => {
      const t = el.dataset.tab as (typeof TABS)[number];
      if (TABS.includes(t)) go({ name: t });
    },
    back,
    // Screens that only need a way back. The dashboard always shows today, so what it opens is for today too.
    open: (el) => {
      if (state.screen.name === 'home') state.date = today();
      const from = state.screen;
      switch (el.dataset.to) {
        case 'nutrition': return go({ name: 'nutrition', tab: 'calories', week: false, back: from });
        case 'exercise': return go({ name: 'exercise', tab: 'cardio', query: '', back: from });
        case 'goals': case 'settings': case 'meals': case 'recipes': case 'myfoods': case 'fasting': case 'weighin':
          return go({ name: el.dataset.to, back: from });
      }
    },
  },
};

// Every module's handlers in one table per event type. A name used twice is a bug, so it fails loudly.
const all = [core, auth.handlers, home.handlers, diary.handlers, food.handlers, exercise.handlers, progress.handlers,
  nutrition.handlers, goals.handlers, more.handlers, fasting.handlers, sheets.handlers];
function merge<K extends keyof Handlers>(kind: K): NonNullable<Handlers[K]> {
  const out: Record<string, unknown> = {};
  for (const h of all) {
    for (const [name, fn] of Object.entries(h[kind] ?? {})) {
      if (name in out) throw new Error(`Two handlers for ${kind} "${name}"`);
      out[name] = fn;
    }
  }
  return out as NonNullable<Handlers[K]>;
}
const actions = merge('actions');
const changes = merge('changes');
const forms = merge('forms');
const inputs = merge('inputs');

app.addEventListener('click', (e) => {
  const el = (e.target as Element).closest<HTMLElement>('[data-act]');
  // The diary's date title is a hidden date field. Phones open its calendar on tap; computers need a nudge.
  if (el instanceof HTMLInputElement && el.type === 'date' && matchMedia('(hover: hover)').matches) {
    try {
      el.showPicker();
    } catch {
      // Not supported; the browser opens its own picker on tap.
    }
  }
  if (!el || el.matches('input, select, textarea')) return;
  actions[el.dataset.act!]?.(el);
});

app.addEventListener('change', (e) => {
  const el = e.target as HTMLInputElement;
  if (el.dataset.act) changes[el.dataset.act]?.(el);
});

app.addEventListener('input', (e) => {
  const form = (e.target as Element).closest('form');
  if (form?.dataset.form) inputs[form.dataset.form]?.(form, e.target as HTMLInputElement);
});

app.addEventListener('submit', (e) => {
  e.preventDefault();
  const form = e.target as HTMLFormElement;
  forms[form.dataset.form!]?.(new FormData(form), form);
});

go({ name: 'loading' });
