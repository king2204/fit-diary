// The diary for one day: calories remaining, meals, exercise, water, notes and "Complete diary".
import { go, openSheet, persist, render, state, store, type Handlers } from '../core';
import { esc } from '../html';
import { MIN_KCAL, scale } from '../nutrition';
import {
  MEALS, day, exerciseTotal, foodTotals, goalsFor, peekDay, projection, shiftDate, type ExerciseEntry, type FoodEntry, type Meal,
} from '../store';
import { dateLabel, dec1, grams, icon, kcal, mealName, meter, tabs } from '../ui';
import { addScreen } from './food';

// "1 medium (118 g)", "1.5 cup, sliced (225 g)", or just "150 g".
export function entryAmount(e: { grams: number; amount?: number; unit?: string }): string {
  if (!e.unit || e.amount === undefined || e.unit === 'g') return `${grams(e.grams)} g`;
  return `${grams(e.amount)} ${e.unit} (${grams(e.grams)} g)`;
}

export function exerciseDetail(x: ExerciseEntry): string {
  if (x.sets) return `${x.sets} sets × ${x.reps ?? 0} reps${x.kg ? ` × ${dec1(x.kg)} kg` : ''}`;
  return x.minutes ? `${x.minutes} min` : '';
}

function entryRow(e: FoodEntry): string {
  return `<li><button data-act="edit-entry" data-id="${esc(e.id)}">
    <span class="name">${esc(e.food.name)}<small>${e.food.brand ? `${esc(e.food.brand)}, ` : ''}${esc(entryAmount(e))}</small></span>
    <span class="kcal">${kcal(scale(e.food.per100, e.grams).kcal)}</span></button></li>`;
}

export function diaryView(): string {
  const d = state.data;
  const date = state.date;
  const log = peekDay(d, date);
  const goals = goalsFor(d, date);
  const food = foodTotals(log);
  const burned = exerciseTotal(log);
  const remaining = goals ? goals.kcal - food.kcal + burned : 0;

  const strip = goals
    ? `<section class="strip">
        <h2>Calories remaining</h2>
        <div class="equation">
          <div><b>${kcal(goals.kcal)}</b><small>Goal</small></div><span aria-hidden="true">−</span>
          <div><b>${kcal(food.kcal)}</b><small>Food</small></div><span aria-hidden="true">+</span>
          <div><b>${kcal(burned)}</b><small>Exercise</small></div><span aria-hidden="true">=</span>
          <div class="hero ${remaining < 0 ? 'over' : ''}"><b>${kcal(remaining)}</b><small>${remaining < 0 ? 'Over' : 'Remaining'}</small></div>
        </div>
      </section>`
    : `<section class="strip"><h2>Food: ${kcal(food.kcal)} kcal</h2>
        <p>Set your goals to see how many calories you have left.</p>
        <button class="primary" data-act="open" data-to="goals">Set goals</button></section>`;

  const meals = MEALS.map((meal) => {
    const entries = (log?.foods ?? []).filter((e) => e.meal === meal);
    const t = foodTotals(log, meal);
    return `<section class="sec">
      <h2>${esc(mealName(meal))}<span>${kcal(t.kcal)}</span></h2>
      ${entries.length ? `<p class="sec-sub">Carbs ${grams(t.carbs)} g · Protein ${grams(t.protein)} g · Fat ${grams(t.fat)} g</p>` : ''}
      <ul class="list">${entries.map(entryRow).join('')}</ul>
      <div class="sec-foot"><button class="add-link" data-act="add-food" data-meal="${meal}">Add food</button>
        <button class="icon small" data-act="meal-menu" data-meal="${meal}" aria-label="More for ${esc(mealName(meal))}">${icon('dots')}</button></div>
    </section>`;
  }).join('');

  const exercise = `<section class="sec">
    <h2>Exercise<span>${kcal(burned)}</span></h2>
    <ul class="list">${(log?.exercises ?? []).map((x) => `<li><div class="static">
      <span class="name">${esc(x.name)}<small>${esc(exerciseDetail(x))}</small></span>
      <span class="kcal">${kcal(x.kcal)}</span>
      <button class="icon small" data-act="del-exercise" data-id="${esc(x.id)}" aria-label="Delete ${esc(x.name)}">${icon('close')}</button></div></li>`).join('')}</ul>
    <div class="sec-foot"><button class="add-link" data-act="add-exercise">Add exercise</button></div>
  </section>`;

  const waterMl = log?.waterMl ?? 0;
  const water = `<section class="sec">
    <h2>Water<span>${waterMl.toLocaleString()} / ${d.goals.waterMl.toLocaleString()} ml</span></h2>
    <div class="sec-body">${meter(waterMl, d.goals.waterMl, 'm-water', 'Water')}
      <div class="buttons"><button data-act="water" data-ml="-250">− 250 ml</button><button data-act="water" data-ml="250">+ 250 ml</button><button data-act="water" data-ml="500">+ 500 ml</button></div>
    </div>
  </section>`;

  const notes = `<section class="sec"><h2>Notes</h2>
    <div class="sec-body"><textarea data-act="notes" rows="3" placeholder="How was today? (Only you can see this.)" aria-label="Notes for ${esc(dateLabel(date))}">${esc(log?.notes ?? '')}</textarea></div>
  </section>`;

  return `<header class="bar date-bar">
      <button class="icon" data-act="day" data-delta="-1" aria-label="Previous day">${icon('back')}</button>
      <label class="date-pick"><span>${esc(dateLabel(date))}</span>${icon('calendar')}
        <input type="date" value="${date}" data-act="pick-date" aria-label="Choose a day"></label>
      <button class="icon" data-act="day" data-delta="1" aria-label="Next day">${icon('forward')}</button>
    </header>
    <main class="flat">${strip}${meals}${exercise}${water}${notes}${completeHtml(date)}</main>${tabs()}`;
}

function completeHtml(date: string): string {
  const log = peekDay(state.data, date);
  const buttons = `<div class="buttons pad"><button data-act="open" data-to="nutrition">${icon('pie')} Nutrition</button>
    ${log?.complete ? '' : `<button class="primary" data-act="complete" ${log?.foods.length ? '' : 'disabled'}>${icon('check')} Complete diary</button>`}</div>`;
  if (!log?.complete) return buttons;
  const kg = projection(state.data, date);
  const net = foodTotals(log).kcal - exerciseTotal(log);
  const floor = MIN_KCAL[state.data.profile.sex];
  return `${buttons}<section class="card projection" role="status">
    <h2>Diary complete</h2>
    ${kg !== null
      ? `<p>If every day were like this one, in 5 weeks you would weigh</p><p class="big">${dec1(kg)} kg</p>`
      : '<p>Log your weight to see where you would be in 5 weeks.</p>'}
    ${net < floor ? `<p class="warn">Your net calories were ${kcal(net)}, under ${kcal(floor)}. Eating this little is not recommended without a doctor's advice.</p>` : ''}
    <button class="link" data-act="uncomplete">Make more entries</button>
  </section>`;
}

export const handlers: Handlers = {
  actions: {
    day: (el) => {
      state.date = shiftDate(state.date, Number(el.dataset.delta));
      render();
    },
    'add-food': (el) => go(addScreen({ kind: 'diary', meal: el.dataset.meal as Meal }, state.screen)),
    'edit-entry': (el) => {
      const entry = peekDay(state.data, state.date)?.foods.find((x) => x.id === el.dataset.id);
      if (entry) go({ name: 'food', target: { kind: 'diary', meal: entry.meal }, food: entry.food, entryId: entry.id, back: state.screen });
    },
    'meal-menu': (el) => openSheet({ kind: 'meal', meal: el.dataset.meal as Meal }),
    'add-exercise': () => go({ name: 'exercise', tab: 'cardio', query: '', back: state.screen }),
    'del-exercise': (el) => {
      const log = day(state.data, state.date);
      log.exercises = log.exercises.filter((x) => x.id !== el.dataset.id);
      persist();
    },
    water: (el) => {
      const log = day(state.data, state.date);
      log.waterMl = Math.max(0, log.waterMl + Number(el.dataset.ml));
      persist();
    },
    complete: () => {
      day(state.data, state.date).complete = true;
      persist();
    },
    uncomplete: () => {
      day(state.data, state.date).complete = false;
      persist();
    },
  },
  changes: {
    'pick-date': (el) => {
      if (!el.value) return;
      state.date = el.value;
      render();
    },
    notes: (el) => {
      day(state.data, state.date).notes = el.value;
      store();
    },
  },
};
