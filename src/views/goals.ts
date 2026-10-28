// Goals: about you, weight goal, calorie and macro goals, fitness and water goals — all in one form.
import { back, state, store, today, type Handlers, type Screen } from '../core';
import {
  ACTIVITY_LABELS, AUTO_SODIUM, MICROS, MICRO_KEYS, autoFiber, autoSugar, calorieGoal, goalFromMaintenance, macroGrams, microGoals, type Activity,
  type Profile, type Sex,
} from '../nutrition';
import { estimateExpenditure, setWeight, weightOn, weightProgress, type Expenditure } from '../store';
import { amount, dec1, header, kcal, numField, option, shortDay } from '../ui';

const WEEKLY_CHANGES: [number, string][] = [
  [-1, 'Lose 1 kg per week'], [-0.75, 'Lose 0.75 kg per week'], [-0.5, 'Lose 0.5 kg per week'], [-0.25, 'Lose 0.25 kg per week'],
  [0, 'Maintain weight'], [0.25, 'Gain 0.25 kg per week'], [0.5, 'Gain 0.5 kg per week'],
];

const n = (fd: FormData, k: string) => Number(fd.get(k)) || 0;
// An optional number: empty means "calculate it for me".
const optional = (fd: FormData, k: string) => (String(fd.get(k) ?? '').trim() ? n(fd, k) : null);

function profileFrom(fd: FormData): Profile {
  return {
    sex: fd.get('sex') as Sex, birthYear: n(fd, 'birthYear'), heightCm: n(fd, 'heightCm'),
    activity: fd.get('activity') as Activity, weeklyChangeKg: n(fd, 'weeklyChangeKg'),
  };
}

// What the smart calorie goal knows so far, in words.
export function smartText(e: Expenditure | null): string {
  if (!e) return 'Log your weight to start.';
  if (!e.ready) {
    return `Learning how much you really burn: ${Math.min(e.foodDays, 10)} of 10 days of food logged, ${Math.min(e.span, 14)} of 14 days of `
      + `weigh-ins (at least 3) in the last 4 weeks. Until then your goal comes from the formula.`;
  }
  const diff = Math.round(((e.kcal - e.formula) / e.formula) * 100);
  const vs = Math.abs(diff) < 3 ? 'about what the formula expected' : `${Math.abs(diff)}% ${diff > 0 ? 'more' : 'less'} than the formula expected (${kcal(e.formula)})`;
  return `Your body burns about <b>${kcal(e.kcal)} kcal</b> a day, not counting exercise you log: ${vs}. From ${e.foodDays} days of food and `
    + `your weight trend (${e.kgPerWeek > 0 ? '+' : ''}${dec1(e.kgPerWeek)} kg a week)${e.trust < 1 ? `; it trusts your data more each week (now ${Math.round(e.trust * 100)}%)` : ''}.`
    + (diff <= -10 ? ' If you sometimes forget to log food, this number comes out too low, so log everything you eat.' : '');
}

// The live summary under the form: calculated calories, macro grams, and time to the goal weight.
interface Summary {
  smart: string;
  calc: string;
  macros: string;
  eta: string;
  sugar: string; // what an empty sugar/fiber field will use, shown as its placeholder
  fiber: string;
  micros: string;
}

function summary(fd: FormData, smartOn: boolean): Summary {
  const p = profileFrom(fd);
  const kg = n(fd, 'weightKg');
  const goalKg = n(fd, 'goalWeightKg');
  const override = n(fd, 'kcalOverride');
  const formula = kg > 0 && p.heightCm > 0 && p.birthYear > 1900 ? calorieGoal(p, kg, new Date().getFullYear()) : null;
  const burn = smartOn && formula !== null ? estimateExpenditure({ ...state.data, profile: p }, today()) : null;
  const calc = burn?.ready ? goalFromMaintenance(p, burn.kcal) : formula;
  const kcalGoal = override || calc;
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
  const age = new Date().getFullYear() - n(fd, 'birthYear');
  const micros = kcalGoal ? microGoals(p.sex, age, kcalGoal) : null;
  return {
    smart: !smartOn ? 'Off: your goal comes from the formula (your size, age and activity level).'
      : override ? 'Not used while you have your own calorie goal below.' : smartText(burn),
    calc: calc !== null ? `${burn?.ready ? 'Smart goal' : 'Calculated'} for you: <b>${kcal(calc)} kcal</b> a day.`
      : 'Enter your weight, height and birth year to calculate it.',
    macros, eta,
    sugar: kcalGoal ? String(autoSugar(kcalGoal)) : '',
    fiber: kcalGoal ? String(autoFiber(kcalGoal)) : '',
    micros: micros ? MICRO_KEYS.filter((k) => micros[k] !== null).map((k) =>
      `<li><span>${MICROS[k].label}</span><b>${MICROS[k].limit ? 'under ' : ''}${amount(micros[k]!)} ${MICROS[k].unit}</b></li>`).join('') : '',
  };
}

export function goalsView(_s: Extract<Screen, { name: 'goals' }>): string {
  const d = state.data;
  const p = d.profile;
  const g = d.goals;
  const w = weightOn(d, today());
  const start = d.weights[0];
  const fd = new FormData();
  for (const [k, v] of Object.entries({ ...p, ...g, weightKg: w ?? '', goalWeightKg: g.goalWeightKg ?? '', kcalOverride: g.kcalOverride ?? '' })) fd.set(k, String(v));
  const sum = summary(fd, g.smartGoal);
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
        <label class="check-row"><input type="checkbox" name="smartGoal" ${g.smartGoal ? 'checked' : ''}>
          <span><b>Smart calorie goal</b><small>Learns how much you really burn from your weigh-ins and food log, then sets your goal from that.</small></span></label>
        <p class="muted" id="goal-smart">${sum.smart}</p>
        <p id="goal-calc">${sum.calc}</p>
        ${numField('kcalOverride', 'My own calorie goal (leave empty to use the calculated one)', false, g.kcalOverride !== null ? String(g.kcalOverride) : '')}
        <p class="muted">Macros, % of calories (must add up to 100):</p>
        <div class="row3">${numField('carbsPct', 'Carbs %', true, String(g.carbsPct))}${numField('proteinPct', 'Protein %', true, String(g.proteinPct))}${numField('fatPct', 'Fat %', true, String(g.fatPct))}</div>
        <p class="muted" id="goal-macros">${sum.macros}</p>
        <div class="row3">${numField('sugarG', 'Sugar (g)', false, g.sugarG !== null ? String(g.sugarG) : '', `placeholder="${sum.sugar}"`)}${
          numField('fiberG', 'Fiber (g)', false, g.fiberG !== null ? String(g.fiberG) : '', `placeholder="${sum.fiber}"`)}${
          numField('sodiumMg', 'Sodium (mg)', false, g.sodiumMg !== null ? String(g.sodiumMg) : '', `placeholder="${AUTO_SODIUM}"`)}</div>
        <p class="muted">Leave these empty and the app works them out (the gray numbers): sugar under 10% of your calories, fiber 14 g per 1,000 kcal, sodium under 2,300 mg.</p>
        <details class="more-nutrients"><summary>Vitamin, mineral and fat goals</summary>
          <ul class="goal-list" id="goal-micros">${sum.micros}</ul>
          <p class="muted">Set for your sex and age (adult amounts from the US National Institutes of Health). Pregnancy and breastfeeding need more — ask a doctor.</p>
        </details>
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
      const fd = new FormData(form);
      const sum = summary(fd, fd.get('smartGoal') === 'on');
      document.getElementById('goal-smart')!.innerHTML = sum.smart;
      document.getElementById('goal-calc')!.innerHTML = sum.calc;
      document.getElementById('goal-macros')!.textContent = sum.macros;
      document.getElementById('goal-micros')!.innerHTML = sum.micros;
      form.querySelector<HTMLInputElement>('input[name=sugarG]')!.placeholder = sum.sugar;
      form.querySelector<HTMLInputElement>('input[name=fiberG]')!.placeholder = sum.fiber;
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
        smartGoal: fd.get('smartGoal') === 'on',
        goalWeightKg: n(fd, 'goalWeightKg') || null,
        carbsPct: n(fd, 'carbsPct'), proteinPct: n(fd, 'proteinPct'), fatPct: n(fd, 'fatPct'),
        sugarG: optional(fd, 'sugarG'), fiberG: optional(fd, 'fiberG'), sodiumMg: optional(fd, 'sodiumMg'), waterMl: n(fd, 'waterMl'),
        steps: n(fd, 'steps'), workoutsPerWeek: n(fd, 'workoutsPerWeek'), minutesPerWorkout: n(fd, 'minutesPerWorkout'),
      };
      state.notice = 'Goals saved.';
      store();
      back();
    },
  },
};
