// Logging exercise: cardio from a list (calories from MET and weight), strength sets, and saved exercises.
import { go, persist, render, state, store, type CardioDef, type ExerciseTab, type Handlers, type Screen } from '../core';
import { esc } from '../html';
import { EXERCISES, STRENGTH, exerciseKcal } from '../nutrition';
import { day, newId, weightOn } from '../store';
import { dateLabel, header, icon, kcal, numField } from '../ui';

type CardioScreen = Extract<Screen, { name: 'cardio' }>;

// Calories for `minutes` of an activity, or null when it needs a weight that isn't logged yet.
function estimate(ex: CardioDef, minutes: number): number | null {
  if (ex.kcalPerMin !== undefined) return Math.round(ex.kcalPerMin * minutes);
  const w = weightOn(state.data, state.date);
  return w === null || ex.met === undefined ? null : exerciseKcal(ex.met, w, minutes);
}

function cardioRows(query: string): string {
  const q = query.trim().toLowerCase();
  const rows = EXERCISES.map((x, i) => ({ x, i })).filter(({ x }) => x.name.toLowerCase().includes(q));
  if (!rows.length) return '<li><p class="empty">No match. Add it under “My exercises”.</p></li>';
  return rows.map(({ x, i }) => {
    const k = estimate(x, 30);
    return `<li><button data-act="pick-cardio" data-i="${i}"><span class="name">${esc(x.name)}<small>${k !== null ? `About ${kcal(k)} kcal in 30 min` : `MET ${x.met}`}</small></span>${icon('forward')}</button></li>`;
  }).join('');
}

export function exerciseView(s: Extract<Screen, { name: 'exercise' }>): string {
  const d = state.data;
  const tab = (t: ExerciseTab, label: string) => `<button data-act="ex-tab" data-tab="${t}" class="${s.tab === t ? 'on' : ''}">${label}</button>`;
  let body: string;
  if (s.tab === 'cardio') {
    body = `${weightOn(d, state.date) === null ? '<p class="notice">Log your weight so calories burned can be estimated.</p>' : ''}
      <form class="search" data-form="ex-search" role="search">
        <span class="search-box">${icon('search')}<input name="q" type="search" placeholder="Search cardio" value="${esc(s.query)}" autocomplete="off" aria-label="Search cardio"></span>
      </form>
      <section class="card flush"><ul class="list" id="ex-list">${cardioRows(s.query)}</ul></section>`;
  } else if (s.tab === 'strength') {
    body = `<section class="card"><form data-form="strength" class="stack">
        <label>Exercise<input name="name" list="strength-names" required autocomplete="off" placeholder="e.g. Bench press"></label>
        <datalist id="strength-names">${STRENGTH.map((x) => `<option value="${esc(x)}">`).join('')}</datalist>
        <div class="row3">${numField('sets', 'Sets', true, '3', 'step="1" min="1"')}${numField('reps', 'Reps per set', true, '10', 'step="1" min="1"')}${numField('kg', 'Weight (kg)')}</div>
        ${numField('kcal', 'Calories burned (optional)')}
        <button class="primary">Add to ${esc(dateLabel(state.date))}</button>
      </form></section>
      <p class="muted center">Strength sets don't add calories unless you enter them. To count calories, add “Weight training” under Cardio.</p>`;
  } else {
    body = `<section class="card"><h2>Create exercise</h2><form data-form="my-exercise" class="stack">
        <label>Name<input name="name" required autocomplete="off" placeholder="e.g. Morning bike ride"></label>
        <div class="row2">${numField('minutes', 'Minutes', true, '30', 'step="1" min="1"')}${numField('kcal', 'Calories burned', true)}</div>
        <button class="primary">Save and add</button>
      </form></section>
      ${d.myExercises.length ? `<section class="card flush"><ul class="list">${d.myExercises.map((x) => `<li><div class="static">
        <button class="name plain" data-act="pick-my-exercise" data-id="${esc(x.id)}">${esc(x.name)}<small>${kcal(x.kcalPerMin * 60)} kcal per hour</small></button>
        <button class="icon small" data-act="del-my-exercise" data-id="${esc(x.id)}" aria-label="Delete ${esc(x.name)}">${icon('close')}</button></div></li>`).join('')}</ul></section>`
        : '<p class="empty">Exercises you create will show up here.</p>'}`;
  }
  return `${header('Add exercise', { back: true })}<main>
    <div class="seg">${tab('cardio', 'Cardio')}${tab('strength', 'Strength')}${tab('mine', 'My exercises')}</div>
    ${body}</main>`;
}

export function cardioView(s: CardioScreen): string {
  const k = estimate(s.ex, 30);
  return `${header(s.ex.name, { back: true })}<main><section class="card">
    <form data-form="cardio" class="stack">
      ${numField('minutes', 'How long (minutes)', true, '30', 'step="1" min="1"')}
      ${numField('kcal', 'Calories burned', true, k !== null ? String(k) : '')}
      <p class="muted">${k !== null ? (s.ex.met !== undefined ? 'Estimated from your weight. You can change it, for example to the number from your watch.' : 'From your saved exercise. You can change it.')
        : 'Log your weight to get an estimate, or type the calories.'}</p>
      <button class="primary">Add to ${esc(dateLabel(state.date))}</button>
    </form></section></main>`;
}

const n = (fd: FormData, k: string) => Number(fd.get(k)) || 0;

function addExercise(entry: { name: string; minutes: number; kcal: number; sets?: number; reps?: number; kg?: number }): void {
  day(state.data, state.date).exercises.push({ id: newId(), ...entry });
  state.notice = `Added ${entry.name}.`;
  store();
  go({ name: 'diary' });
}

export const handlers: Handlers = {
  actions: {
    'ex-tab': (el) => {
      if (state.screen.name !== 'exercise') return;
      state.screen.tab = el.dataset.tab as ExerciseTab;
      render();
    },
    'pick-cardio': (el) => {
      const ex = EXERCISES[Number(el.dataset.i)];
      if (ex) go({ name: 'cardio', ex, back: state.screen });
    },
    'pick-my-exercise': (el) => {
      const ex = state.data.myExercises.find((x) => x.id === el.dataset.id);
      if (ex) go({ name: 'cardio', ex: { name: ex.name, kcalPerMin: ex.kcalPerMin }, back: state.screen });
    },
    'del-my-exercise': (el) => {
      state.data.myExercises = state.data.myExercises.filter((x) => x.id !== el.dataset.id);
      persist();
    },
  },
  inputs: {
    'ex-search': (_form, input) => {
      if (state.screen.name !== 'exercise') return;
      state.screen.query = input.value;
      document.getElementById('ex-list')!.innerHTML = cardioRows(input.value);
    },
    // Keep the calorie estimate in step with the minutes, until the user types their own number.
    cardio: (form, input) => {
      const s = state.screen;
      if (s.name !== 'cardio') return;
      if (input.name === 'kcal') form.dataset.kcalEdited = '1';
      else if (!form.dataset.kcalEdited) {
        const k = estimate(s.ex, Number(new FormData(form).get('minutes')) || 0);
        if (k !== null) form.querySelector<HTMLInputElement>('input[name=kcal]')!.value = String(k);
      }
    },
  },
  forms: {
    'ex-search': () => {},
    cardio: (fd) => {
      if (state.screen.name !== 'cardio') return;
      addExercise({ name: state.screen.ex.name, minutes: n(fd, 'minutes'), kcal: Math.round(n(fd, 'kcal')) });
    },
    strength: (fd) => {
      addExercise({
        name: String(fd.get('name')).trim(), minutes: 0, kcal: Math.round(n(fd, 'kcal')),
        sets: Math.round(n(fd, 'sets')), reps: Math.round(n(fd, 'reps')), kg: n(fd, 'kg') || undefined,
      });
    },
    'my-exercise': (fd) => {
      const name = String(fd.get('name')).trim();
      const minutes = n(fd, 'minutes');
      const kcalBurned = Math.round(n(fd, 'kcal'));
      if (!name || minutes <= 0) return;
      state.data.myExercises = [{ id: newId(), name, kcalPerMin: kcalBurned / minutes }, ...state.data.myExercises.filter((x) => x.name !== name)];
      addExercise({ name, minutes, kcal: kcalBurned });
    },
  },
};
