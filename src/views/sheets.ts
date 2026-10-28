// Panels that slide up over a screen: the + menu, a meal's ⋯ menu, saving a meal, and steps.
import { go, openSheet, persist, state, today, type Handlers, type Sheet } from '../core';
import { esc } from '../html';
import { copyMeal, day, mealForHour, peekDay, saveMeal, shiftDate, type Meal } from '../store';
import { dateLabel, icon, mealName, shortDay, type IconName } from '../ui';
import { addScreen, openScan } from './food';
import { photoScreen } from './photo';

function tile(ic: IconName, label: string, act: string): string {
  return `<button class="sheet-tile" data-act="${act}"><span class="tile-ic">${icon(ic)}</span>${label}</button>`;
}

export function sheetHtml(sheet: Sheet): string {
  let body = '';
  const d = state.data;
  if (sheet.kind === 'plus') {
    body = `<div class="sheet-grid">
      ${tile('search', 'Log food', 'plus-food')}${tile('camera', 'Food photo', 'plus-photo')}${tile('scan', 'Barcode scan', 'plus-scan')}${tile('bolt', 'Quick add', 'plus-quick')}
      ${tile('drop', 'Water', 'plus-water')}${tile('scale', 'Weight', 'plus-weight')}${tile('dumbbell', 'Exercise', 'plus-exercise')}${tile('steps', 'Steps', 'plus-steps')}
      ${tile('timer', 'Fasting', 'plus-fasting')}
    </div>`;
  } else if (sheet.kind === 'meal') {
    const empty = !(peekDay(d, state.date)?.foods.some((e) => e.meal === sheet.meal));
    body = `<h2>${esc(mealName(sheet.meal))}</h2><ul class="list menu">
      <li><button data-act="sheet-quick">${icon('bolt')}<span class="name">Quick add calories</span></button></li>
      <li><button data-act="sheet-save" ${empty ? 'disabled' : ''}>${icon('list')}<span class="name">Save as meal</span></button></li>
      <li><button data-act="sheet-copy-yesterday">${icon('calendar')}<span class="name">Copy from yesterday</span></button></li>
      <li><form data-form="copy-to" class="copy-to">${icon('forward')}<span class="name">Copy to</span>
        <input type="date" name="to" value="${shiftDate(state.date, 1)}" required aria-label="Day to copy to"><button ${empty ? 'disabled' : ''}>Copy</button></form></li>
      <li><button class="danger" data-act="sheet-clear" ${empty ? 'disabled' : ''}>${icon('close')}<span class="name">Remove all foods</span></button></li>
    </ul>`;
  } else if (sheet.kind === 'save-meal') {
    body = `<h2>Save as meal</h2><form data-form="save-meal" class="stack">
      <label>Name<input name="name" required autocomplete="off" value="${esc(`${mealName(sheet.meal)} ${shortDay(state.date)}`)}"></label>
      <button class="primary">Save meal</button></form>`;
  } else {
    const steps = peekDay(d, state.date)?.steps ?? 0;
    body = `<h2>Steps on ${esc(dateLabel(state.date))}</h2><form data-form="steps" class="stack">
      <label>Steps<input name="steps" type="number" inputmode="numeric" min="0" step="1" value="${steps || ''}" required></label>
      <button class="primary">Save</button></form>`;
  }
  return `<div class="sheet-backdrop" data-act="close-sheet"></div>
    <div class="sheet" role="dialog" aria-modal="true" aria-label="${sheet.kind === 'plus' ? 'Log' : 'Options'}">
      <button class="icon sheet-close" data-act="close-sheet" aria-label="Close">${icon('close')}</button>${body}</div>`;
}

// The + menu logs to the day open in the diary, or today when started elsewhere.
function plusDay(): Meal {
  if (state.screen.name !== 'diary') state.date = today();
  return mealForHour(new Date().getHours());
}

const sheetMeal = (): Meal | null => (state.sheet && 'meal' in state.sheet ? state.sheet.meal : null);

export const handlers: Handlers = {
  actions: {
    plus: () => openSheet({ kind: 'plus' }),
    'close-sheet': () => openSheet(null),
    'plus-food': () => go(addScreen({ kind: 'diary', meal: plusDay() }, state.screen)),
    'plus-scan': () => openScan({ kind: 'diary', meal: plusDay() }, state.screen),
    'plus-photo': () => go(photoScreen(plusDay(), state.screen)),
    'plus-quick': () => go({ name: 'quick', meal: plusDay(), back: state.screen }),
    'plus-water': () => {
      plusDay();
      day(state.data, state.date).waterMl += 250;
      state.notice = `Added 250 ml of water (${day(state.data, state.date).waterMl.toLocaleString()} ml ${dateLabel(state.date).toLowerCase()}).`;
      state.sheet = null;
      persist();
    },
    'plus-weight': () => go({ name: 'weighin', back: state.screen }),
    'plus-exercise': () => {
      plusDay();
      go({ name: 'exercise', tab: 'cardio', query: '', back: state.screen });
    },
    'plus-steps': () => {
      plusDay();
      openSheet({ kind: 'steps' });
    },
    'plus-fasting': () => go({ name: 'fasting', back: state.screen }),
    'sheet-quick': () => {
      const meal = sheetMeal();
      if (meal) go({ name: 'quick', meal, back: state.screen });
    },
    'sheet-save': () => {
      const meal = sheetMeal();
      if (meal) openSheet({ kind: 'save-meal', meal });
    },
    'sheet-copy-yesterday': () => {
      const meal = sheetMeal();
      if (!meal) return;
      const count = copyMeal(state.data, shiftDate(state.date, -1), state.date, meal);
      state.notice = count ? `Copied ${count} ${count === 1 ? 'food' : 'foods'} from yesterday.` : `Nothing in ${mealName(meal)} yesterday.`;
      state.sheet = null;
      persist();
    },
    'sheet-clear': () => {
      const meal = sheetMeal();
      if (!meal || !confirm(`Remove all foods from ${mealName(meal)}?`)) return;
      const log = day(state.data, state.date);
      log.foods = log.foods.filter((e) => e.meal !== meal);
      state.sheet = null;
      persist();
    },
  },
  forms: {
    'copy-to': (fd) => {
      const meal = sheetMeal();
      const to = String(fd.get('to') ?? '');
      if (!meal || !to) return;
      const count = copyMeal(state.data, state.date, to, meal);
      state.notice = `Copied ${count} ${count === 1 ? 'food' : 'foods'} to ${dateLabel(to)}.`;
      state.sheet = null;
      persist();
    },
    'save-meal': (fd) => {
      const meal = sheetMeal();
      const name = String(fd.get('name') ?? '').trim();
      if (!meal || !name) return;
      saveMeal(state.data, name, (peekDay(state.data, state.date)?.foods ?? []).filter((e) => e.meal === meal));
      state.notice = `Saved “${name}”. Find it in Add food → My meals.`;
      state.sheet = null;
      persist();
    },
    steps: (fd) => {
      day(state.data, state.date).steps = Math.max(0, Math.round(Number(fd.get('steps')) || 0));
      state.sheet = null;
      persist();
    },
  },
};
