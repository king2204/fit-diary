// Dashboard: today's calories and macros, steps, exercise, water, fasting and weight at a glance.
import { lineChart, ring } from '../charts';
import { openSheet, persist, state, today, type Handlers } from '../core';
import { activeFast, day, exerciseTotal, foodTotals, goalsFor, peekDay, shiftDate, streak, weekExercise, weightProgress } from '../store';
import { dec1, grams, header, icon, kcal, meter, shortDay, tabs } from '../ui';
import { elapsedText } from './fasting';

// Goal reached and not yet dismissed for the latest weigh-in.
function goalBanner(): string {
  const d = state.data;
  const p = weightProgress(d);
  const latest = d.weights[d.weights.length - 1]?.date;
  if (!p?.reached || d.profile.weeklyChangeKg === 0 || d.goalNoticeDismissed === latest) return '';
  return `<section class="card banner" role="status">
    <h2>${icon('flag')} You reached your goal weight!</h2>
    <p>Great work. Switch to “Maintain weight” so your calorie goal stops ${d.profile.weeklyChangeKg < 0 ? 'cutting' : 'adding'} calories.</p>
    <div class="buttons"><button class="primary" data-act="goal-maintain">Switch to maintain</button><button data-act="goal-dismiss">Not now</button></div>
  </section>`;
}

function weightCard(): string {
  const d = state.data;
  const p = weightProgress(d);
  const logBtn = '<button class="link small" data-act="open" data-to="weighin">+ Log weight</button>';
  if (!p) return `<section class="card"><h2>Weight${logBtn}</h2><p class="muted">Log your weight to see your progress here.</p></section>`;
  const rate = d.profile.weeklyChangeKg;
  let eta = '';
  if (p.goal !== null && !p.reached) {
    eta = p.weeksLeft !== null
      ? `About ${Math.ceil(p.weeksLeft)} weeks to go at ${dec1(Math.abs(rate))} kg a week (around ${shortDay(shiftDate(today(), Math.ceil(p.weeksLeft * 7)))}).`
      : rate === 0 ? 'Your weekly goal is “maintain”. Choose a weekly goal in Goals to reach your goal weight.'
        : 'Your weekly goal goes the other way from your goal weight. Check it in Goals.';
  }
  const recent = d.weights.filter((w) => w.date >= shiftDate(today(), -90));
  return `<section class="card"><h2>Weight${logBtn}</h2>
    <div class="stats">
      <div><b>${dec1(p.current)}</b><small>Current kg</small></div>
      ${p.goal !== null ? `<div><b>${dec1(p.goal)}</b><small>Goal kg</small></div>
        <div><b>${p.reached ? '✓' : dec1(Math.abs(p.toGo!))}</b><small>${p.reached ? 'Reached' : 'kg to go'}</small></div>`
        : '<div><button class="link" data-act="open" data-to="goals">Set a goal weight</button></div>'}
    </div>
    ${eta ? `<p class="muted">${eta}</p>` : ''}
    ${recent.length > 1 ? lineChart(recent.map((w) => ({ date: w.date, value: w.kg })), 'kg', p.goal) : ''}
  </section>`;
}

export function homeView(): string {
  const d = state.data;
  const now = today();
  const log = peekDay(d, now);
  const goals = goalsFor(d, now);
  const food = foodTotals(log);
  const burned = exerciseTotal(log);
  const days = streak(d, now);
  const badge = `<span class="streak" title="Days in a row with food logged" aria-label="${days} day streak">${icon('flame')}${days}</span>`;

  let calories: string;
  if (goals) {
    const remaining = goals.kcal - food.kcal + burned;
    const over = remaining < 0;
    calories = `<section class="card">
      <h2>Calories</h2><p class="sub">Remaining = Goal − Food + Exercise</p>
      <div class="cal-card">
        ${ring(food.kcal, goals.kcal + burned, 136, 12, over ? 'over' : '', `<b>${kcal(Math.abs(remaining))}</b><small>${over ? 'Over' : 'Remaining'}</small>`)}
        <ul class="legend">
          <li>${icon('flag')}<span>Base goal<b>${kcal(goals.kcal)}</b></span></li>
          <li>${icon('food')}<span>Food<b>${kcal(food.kcal)}</b></span></li>
          <li>${icon('flame')}<span>Exercise<b>${kcal(burned)}</b></span></li>
        </ul>
      </div>
    </section>
    <section class="card">
      <h2>Macros</h2>
      <div class="macro-rings">${(['carbs', 'protein', 'fat'] as const).map((k) => {
        const left = goals[k] - food[k];
        return `<div>${ring(food[k], goals[k], 88, 8, `r-${k}`, `<b>${grams(food[k])}</b><small>/${goals[k]} g</small>`)}
          <span><i class="dot d-${k}"></i>${k[0].toUpperCase() + k.slice(1)}</span>
          <small>${left >= 0 ? `${grams(left)} g left` : `${grams(-left)} g over`}</small></div>`;
      }).join('')}</div>
    </section>`;
  } else {
    calories = `<section class="card"><h2>Welcome!</h2>
      <p>Tell us about you and your goal weight to get a daily calorie goal.</p>
      <button class="primary" data-act="open" data-to="goals">Set up goals</button></section>`;
  }

  const steps = log?.steps ?? 0;
  const week = weekExercise(d, now);
  const water = log?.waterMl ?? 0;
  const fast = activeFast(d);
  const tiles = `<div class="grid2">
    <button class="card tile" data-act="steps">
      <span class="tile-head">${icon('steps')}Steps</span><b>${steps.toLocaleString()}</b>
      <small>Goal ${d.goals.steps.toLocaleString()}</small>${meter(steps, d.goals.steps, 'm-kcal', 'Steps')}</button>
    <button class="card tile" data-act="open" data-to="exercise">
      <span class="tile-head">${icon('dumbbell')}Exercise</span><b>${kcal(burned)} kcal</b>
      <small>This week ${week.workouts}/${d.goals.workoutsPerWeek} workouts, ${week.minutes}/${d.goals.workoutsPerWeek * d.goals.minutesPerWorkout} min</small>${meter(week.workouts, d.goals.workoutsPerWeek, 'm-kcal', 'Workouts this week')}</button>
    <div class="card tile">
      <span class="tile-head">${icon('drop')}Water</span><b>${water.toLocaleString()} ml</b>
      <small>Goal ${d.goals.waterMl.toLocaleString()} ml</small><button class="mini" data-act="water-today">+ 250 ml</button></div>
    <button class="card tile" data-act="open" data-to="fasting">
      <span class="tile-head">${icon('timer')}Fasting</span>
      ${fast ? `<b>${elapsedText(fast)}</b><small>of ${fast.hours} h fast</small>` : '<b>Not fasting</b><small>Tap to start</small>'}</button>
  </div>`;

  return `${header('Today', { right: badge })}<main>${goalBanner()}${calories}${tiles}${weightCard()}</main>${tabs()}`;
}

export const handlers: Handlers = {
  actions: {
    'goal-maintain': () => {
      state.data.profile.weeklyChangeKg = 0;
      state.notice = 'Weekly goal set to “Maintain weight”.';
      persist();
    },
    'goal-dismiss': () => {
      state.data.goalNoticeDismissed = state.data.weights[state.data.weights.length - 1]?.date ?? null;
      persist();
    },
    'water-today': () => {
      day(state.data, today()).waterMl += 250;
      persist();
    },
    steps: () => {
      state.date = today();
      openSheet({ kind: 'steps' });
    },
  },
};
