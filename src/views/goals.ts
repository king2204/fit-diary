// Goals: about you, weight goal, calorie and macro goals, fitness and water goals — all in one form.
import { back, state, store, today, type Handlers, type Screen } from '../core';
import { ACTIVITY_LABELS, calorieGoal, macroGrams, type Activity, type Profile, type Sex } from '../nutrition';
import { setWeight, weightOn, weightProgress } from '../store';
import { dec1, header, kcal, numField, option, shortDay } from '../ui';

const WEEKLY_CHANGES: [number, string][] = [
  [-1, 'Lose 1 kg per week'], [-0.75, 'Lose 0.75 kg per week'], [-0.5, 'Lose 0.5 kg per week'], [-0.25, 'Lose 0.25 kg per week'],
  [0, 'Maintain weight'], [0.25, 'Gain 0.25 kg per week'], [0.5, 'Gain 0.5 kg per week'],
];

const n = (fd: FormData, k: string) => Number(fd.get(k)) || 0;

function profileFrom(fd: FormData): Profile {
  return {
    sex: fd.get('sex') as Sex, birthYear: n(fd, 'birthYear'), heightCm: n(fd, 'heightCm'),
    activity: fd.get('activity') as Activity, weeklyChangeKg: n(fd, 'weeklyChangeKg'),
  };
}

// The live summary under the form: calculated calories, macro grams, and time to the goal weight.
function summary(fd: FormData): { calc: string; macros: string; eta: string } {
  const p = profileFrom(fd);
  const kg = n(fd, 'weightKg');
  const goalKg = n(fd, 'goalWeightKg');
  const calc = kg > 0 && p.heightCm > 0 && p.birthYear > 1900 ? calorieGoal(p, kg, new Date().getFullYear()) : null;
  const kcalGoal = n(fd, 'kcalOverride') || calc;
  const pct = n(fd, 'carbsPct') + n(fd, 'proteinPct') + n(fd, 'fatPct');
  let macros = '';
  if (Math.round(pct) !== 100) macros = `Carbs, protein and fat add up to ${pct}%. They must add up to 100%.`;
  else if (kcalGoal) {
    const g = macroGrams(kcalGoal, { carbsPct: n(fd, 'carbsPct'), proteinPct: n(fd, 'proteinPct'), fatPct: n(fd, 'fatPct') });
    macros = `That is ${g.carbs} g carbs, ${g.protein} g protein and ${g.fat} g fat a day.`;
  }
  let eta = '';
  if (kg > 0 && goalKg > 0) {
    const toGo = kg - goalKg;
    const rate = p.weeklyChangeKg;
    if (Math.abs(toGo) < 0.05) eta = 'You are at your goal weight. “Maintain weight” keeps you there.';
    else if (rate === 0) eta = `${dec1(Math.abs(toGo))} kg to ${toGo > 0 ? 'lose' : 'gain'}. Choose a weekly goal to get there.`;
    else if (Math.sign(rate) !== Math.sign(-toGo)) eta = `Your weekly goal is to ${rate < 0 ? 'lose' : 'gain'} weight, but your goal weight is ${toGo > 0 ? 'lower' : 'higher'}.`;
    else {
      const weeks = Math.abs(toGo / rate);
      const end = new Date();
      end.setDate(end.getDate() + Math.ceil(weeks * 7));
      eta = `${dec1(Math.abs(toGo))} kg to go: about ${Math.ceil(weeks)} weeks, around ${end.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}.`;
    }
  }
  return { calc: calc !== null ? `Calculated for you: <b>${kcal(calc)} kcal</b> a day.` : 'Enter your weight, height and birth year to calculate it.', macros, eta };
}

export function goalsView(_s: Extract<Screen, { name: 'goals' }>): string {
  const d = state.data;
  const p = d.profile;
  const g = d.goals;
  const w = weightOn(d, today());
  const start = d.weights[0];
  const fd = new FormData();
  for (const [k, v] of Object.entries({ ...p, ...g, weightKg: w ?? '', goalWeightKg: g.goalWeightKg ?? '', kcalOverride: g.kcalOverride ?? '' })) fd.set(k, String(v));
  const sum = summary(fd);
  const progress = weightProgress(d);
  return `${header('Goals', { back: true })}<main>
    <form data-form="goals" class="stack">
      <section class="card stack"><h2>About you</h2>
        <div class="row2">
          <label>Sex<select name="sex">${option('female', 'Female', p.sex)}${option('male', 'Male', p.sex)}</select></label>
          ${numField('birthYear', 'Birth year', true, String(p.birthYear), 'step="1" min="1900"')}
        </div>
        ${numField('heightCm', 'Height (cm)', true, String(p.heightCm), 'step="0.1"')}
        <label>Activity level<select name="activity">${(Object.keys(ACTIVITY_LABELS) as Activity[]).map((a) => option(a, ACTIVITY_LABELS[a], p.activity)).join('')}</select></label>
      </section>
      <section class="card stack"><h2>Weight goal</h2>
        ${start ? `<p class="kv"><span>Starting weight</span><b>${dec1(start.kg)} kg on ${shortDay(start.date)}</b></p>` : ''}
        <div class="row2">
          ${numField('weightKg', 'Current weight (kg)', true, w !== null ? String(w) : '', 'step="0.1" min="20" max="400"')}
          ${numField('goalWeightKg', 'Goal weight (kg)', false, g.goalWeightKg !== null ? String(g.goalWeightKg) : '', 'step="0.1" min="20" max="400"')}
        </div>
        <label>Weekly goal<select name="weeklyChangeKg">${WEEKLY_CHANGES.map(([v, l]) => option(v, l, p.weeklyChangeKg)).join('')}</select></label>
        <p class="muted" id="goal-eta">${progress?.reached ? 'You reached your goal weight! ' : ''}${sum.eta}</p>
        <p class="muted">Losing 0.5 kg a week means eating about 550 kcal a day less than you burn. 0.25–0.5 kg a week is easier to keep up.</p>
      </section>
      <section class="card stack"><h2>Calories and macros</h2>
        <p id="goal-calc">${sum.calc}</p>
        ${numField('kcalOverride', 'My own calorie goal (leave empty to use the calculated one)', false, g.kcalOverride !== null ? String(g.kcalOverride) : '')}
        <p class="muted">Macros, % of calories (must add up to 100):</p>
        <div class="row3">${numField('carbsPct', 'Carbs %', true, String(g.carbsPct))}${numField('proteinPct', 'Protein %', true, String(g.proteinPct))}${numField('fatPct', 'Fat %', true, String(g.fatPct))}</div>
        <p class="muted" id="goal-macros">${sum.macros}</p>
        <div class="row3">${numField('sugarG', 'Sugar (g)', true, String(g.sugarG))}${numField('fiberG', 'Fiber (g)', true, String(g.fiberG))}${numField('sodiumMg', 'Sodium (mg)', true, String(g.sodiumMg))}</div>
      </section>
      <section class="card stack"><h2>Fitness and water</h2>
        <div class="row2">${numField('workoutsPerWeek', 'Workouts per week', true, String(g.workoutsPerWeek), 'step="1"')}${numField('minutesPerWorkout', 'Minutes per workout', true, String(g.minutesPerWorkout), 'step="1"')}</div>
        <div class="row2">${numField('steps', 'Steps per day', true, String(g.steps), 'step="100"')}${numField('waterMl', 'Water per day (ml)', true, String(g.waterMl), 'step="50"')}</div>
      </section>
      <button class="primary wide">Save goals</button>
    </form>
  </main>`;
}

export const handlers: Handlers = {
  inputs: {
    goals: (form) => {
      const sum = summary(new FormData(form));
      document.getElementById('goal-calc')!.innerHTML = sum.calc;
      document.getElementById('goal-macros')!.textContent = sum.macros;
      document.getElementById('goal-eta')!.textContent = sum.eta;
    },
  },
  forms: {
    goals: (fd) => {
      const pct = n(fd, 'carbsPct') + n(fd, 'proteinPct') + n(fd, 'fatPct');
      if (Math.round(pct) !== 100) {
        document.getElementById('goal-macros')?.scrollIntoView({ block: 'center' });
        return;
      }
      const d = state.data;
      d.profile = profileFrom(fd);
      const kg = n(fd, 'weightKg');
      if (kg > 0 && kg !== weightOn(d, today())) setWeight(d, today(), kg);
      const override = String(fd.get('kcalOverride') ?? '').trim();
      d.goals = {
        ...d.goals,
        kcalOverride: override ? Number(override) : null,
        goalWeightKg: n(fd, 'goalWeightKg') || null,
        carbsPct: n(fd, 'carbsPct'), proteinPct: n(fd, 'proteinPct'), fatPct: n(fd, 'fatPct'),
        sugarG: n(fd, 'sugarG'), fiberG: n(fd, 'fiberG'), sodiumMg: n(fd, 'sodiumMg'), waterMl: n(fd, 'waterMl'),
        steps: n(fd, 'steps'), workoutsPerWeek: n(fd, 'workoutsPerWeek'), minutesPerWorkout: n(fd, 'minutesPerWorkout'),
      };
      state.notice = 'Goals saved.';
      store();
      back();
    },
  },
};
