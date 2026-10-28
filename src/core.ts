// App state shared by every screen, plus navigation and saving.
import { pushDiary } from './cloud';
import { defaultData, isoDate, save, userKey, type Data, type Food, type Meal, type Recipe } from './store';

export type AuthMode = 'signin' | 'signup' | 'reset';
export type FoodTab = 'all' | 'meals' | 'recipes' | 'mine';
export type ExerciseTab = 'cardio' | 'strength' | 'mine';
export type NutritionTab = 'calories' | 'nutrients' | 'macros';

// A cardio activity to log: from the built-in list (MET) or one the user saved (kcal per minute).
export interface CardioDef {
  name: string;
  met?: number;
  kcalPerMin?: number;
}

export type RecipeScreen = { name: 'recipe'; recipe: Recipe; isNew: boolean; back: Screen };

// Where a chosen food goes: into the diary, or into a recipe being edited.
export type Target = { kind: 'diary'; meal: Meal } | { kind: 'recipe'; screen: RecipeScreen };

export type Screen =
  | { name: 'loading' }
  | { name: 'auth'; mode: AuthMode; message: string; busy: boolean }
  | { name: 'newpass'; message: string }
  | { name: 'home' }
  | { name: 'diary' }
  | { name: 'progress' }
  | { name: 'more' }
  | {
    name: 'add'; target: Target; tab: FoodTab; back: Screen;
    live: string; // what is typed in the search box right now
    query: string; // what was last searched
    results: Food[]; problems: string[]; loading: boolean;
    page: number; more: boolean; loadingMore: boolean;
  }
  | { name: 'food'; target: Target; food: Food; entryId?: string; back: Screen }
  | { name: 'custom'; target?: Target; barcode?: string; edit?: Food; back: Screen }
  | { name: 'quick'; meal: Meal; back: Screen }
  | { name: 'scan'; target: Target; status: string; back: Screen }
  | { name: 'exercise'; tab: ExerciseTab; query: string; back: Screen }
  | { name: 'cardio'; ex: CardioDef; back: Screen }
  | { name: 'weighin'; back: Screen }
  | { name: 'nutrition'; tab: NutritionTab; week: boolean; back: Screen }
  | { name: 'goals'; back: Screen }
  | { name: 'settings'; back: Screen }
  | { name: 'meals'; back: Screen }
  | { name: 'meal'; id: string; back: Screen }
  | { name: 'recipes'; back: Screen }
  | RecipeScreen
  | { name: 'myfoods'; back: Screen }
  | { name: 'fasting'; back: Screen };

// Panels that slide up over the current screen.
export type Sheet = { kind: 'plus' } | { kind: 'meal'; meal: Meal } | { kind: 'save-meal'; meal: Meal } | { kind: 'steps' };

export type Sync = 'synced' | 'saving' | 'offline';

export const today = () => isoDate(new Date());

export const state = {
  data: defaultData() as Data,
  user: null as { id: string; email: string } | null,
  sync: 'synced' as Sync,
  date: today(), // the day shown in the diary
  screen: { name: 'loading' } as Screen,
  sheet: null as Sheet | null,
  notice: '', // shown once, as a toast
};

// Event handlers a screen module adds, keyed by data-act (clicks, changes), data-form (submit, input).
export interface Handlers {
  actions?: Record<string, (el: HTMLElement) => void>;
  changes?: Record<string, (el: HTMLInputElement) => void>;
  forms?: Record<string, (fd: FormData, form: HTMLFormElement) => void>;
  inputs?: Record<string, (form: HTMLFormElement, target: HTMLInputElement) => void>;
}

let renderFn = () => {};
export function onRender(fn: () => void): void {
  renderFn = fn;
}
export function render(): void {
  renderFn();
}

let leave: (() => void) | null = null;
// Runs once when the current screen is left (to stop the camera, for example).
export function onLeave(fn: () => void): void {
  leave = fn;
}

export function go(next: Screen): void {
  leave?.();
  leave = null;
  state.screen = next;
  state.sheet = null;
  render();
  window.scrollTo(0, 0);
}

export function back(): void {
  const s = state.screen;
  go('back' in s ? s.back : { name: 'home' });
}

export function openSheet(sheet: Sheet | null): void {
  state.sheet = sheet;
  render();
}

// ---------- Saving and sync ----------

// Set while this phone has changes the server hasn't received yet.
export const dirtyKey = (userId: string) => `fit-diary-dirty:${userId}`;
export const SYNC_TEXT: Record<Sync, string> = {
  synced: 'All changes saved to your account.',
  saving: 'Saving…',
  offline: 'Not synced yet. Changes are kept on this phone and sync when you are online.',
};

let pushTimer: ReturnType<typeof setTimeout> | undefined;

// Saves to this phone right away and to the account shortly after.
export function store(): void {
  const u = state.user;
  if (!u) return;
  try {
    save(state.data, userKey(u.id));
    localStorage.setItem(dirtyKey(u.id), '1');
  } catch (e) {
    state.notice = 'Could not save on this device. Is storage full or blocked?';
    console.error(e);
  }
  clearTimeout(pushTimer);
  state.sync = 'saving';
  pushTimer = setTimeout(pushNow, 800);
}

export function persist(): void {
  store();
  render();
}

export async function pushNow(): Promise<void> {
  const u = state.user;
  if (!u) return;
  try {
    await pushDiary(u.id, state.data);
    if (state.user !== u) return;
    localStorage.removeItem(dirtyKey(u.id));
    state.sync = 'synced';
  } catch (e) {
    console.warn('Sync failed', e);
    if (state.user === u) state.sync = 'offline';
  }
  const badge = document.getElementById('sync');
  if (badge) badge.textContent = SYNC_TEXT[state.sync];
}

export function signedOut(): void {
  state.user = null;
  state.data = defaultData();
  go({ name: 'auth', mode: 'signin', message: '', busy: false });
}
