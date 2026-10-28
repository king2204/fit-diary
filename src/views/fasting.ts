// Intermittent fasting: start and end a fast on a plan like 16:8, and see past fasts.
import { ring } from '../charts';
import { persist, render, state, today, type Handlers, type Screen } from '../core';
import { esc } from '../html';
import { activeFast, newId, type Fast } from '../store';
import { header, icon, shortDay } from '../ui';

const PLANS = [12, 14, 16, 18, 20];
let chosen: number | null = null; // plan picked on this visit; otherwise the last one used
const plan = () => chosen ?? state.data.fasts[0]?.hours ?? 16;

const hoursSince = (iso: string, now = Date.now()) => Math.max(0, (now - Date.parse(iso)) / 3600000);

// "13:05" (hours:minutes) since the fast began, or for a finished fast, its length.
export function elapsedText(f: Fast): string {
  const h = f.end ? hoursSince(f.start, Date.parse(f.end)) : hoursSince(f.start);
  const mins = Math.floor(h * 60);
  return `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}`;
}

const time = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
const localDay = (iso: string) => {
  const t = new Date(iso);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
};
// Value for <input type="datetime-local">, in local time.
const localInput = (iso: string) => {
  const t = new Date(iso);
  return `${localDay(iso)}T${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
};

export function fastingView(_s: Extract<Screen, { name: 'fasting' }>): string {
  const d = state.data;
  const fast = activeFast(d);
  let top: string;
  if (fast) {
    const h = hoursSince(fast.start);
    const end = new Date(Date.parse(fast.start) + fast.hours * 3600000).toISOString();
    top = `<section class="card center-card">
      ${ring(h, fast.hours, 200, 14, h >= fast.hours ? 'r-done' : '', `<b>${elapsedText(fast)}</b><small>of ${fast.hours} hours</small>`)}
      <p>${h >= fast.hours ? 'Goal reached! End your fast when you are ready.' : `Your fast ends at <b>${time(end)}</b>${localDay(end) !== today() ? ` (${shortDay(localDay(end))})` : ''}.`}</p>
      <label>Started at<input type="datetime-local" value="${localInput(fast.start)}" data-act="fast-start-time"></label>
      <button class="primary wide" data-act="fast-end">End fast</button>
    </section>`;
  } else {
    const p = plan();
    top = `<section class="card stack"><h2>Choose your plan</h2>
      <div class="seg">${PLANS.map((h) => `<button data-act="fast-plan" data-v="${h}" class="${p === h ? 'on' : ''}">${h}:${24 - h}</button>`).join('')}</div>
      <p class="muted">${p} hours without food, then eat within ${24 - p} hours.</p>
      <button class="primary wide" data-act="fast-start">${icon('timer')} Start fast</button>
    </section>`;
  }
  const done = d.fasts.filter((f) => f.end).slice(0, 14);
  return `${header('Fasting', { back: true })}<main>${top}
    <section class="card flush"><h2 class="pad">Recent fasts</h2>
      ${done.length ? `<ul class="list">${done.map((f) => `<li><div class="static">
        <span class="name">${esc(shortDay(localDay(f.start)))}, ${time(f.start)}<small>${f.hours}:${24 - f.hours} plan</small></span>
        <span class="kcal">${hoursSince(f.start, Date.parse(f.end!)) >= f.hours ? '✓ ' : ''}${elapsedText(f)}</span>
        <button class="icon small" data-act="del-fast" data-id="${esc(f.id)}" aria-label="Delete this fast">${icon('close')}</button></div></li>`).join('')}</ul>`
      : '<p class="empty">Fasts you finish will show up here.</p>'}
    </section>
    <p class="muted center">Fasting is not right for everyone. Ask a doctor first if you are pregnant, have diabetes or have had an eating disorder.</p>
  </main>`;
}

export const handlers: Handlers = {
  actions: {
    'fast-plan': (el) => {
      chosen = Number(el.dataset.v);
      render();
    },
    'fast-start': () => {
      if (activeFast(state.data)) return;
      state.data.fasts = [{ id: newId(), start: new Date().toISOString(), hours: plan() }, ...state.data.fasts];
      persist();
    },
    'fast-end': () => {
      const f = activeFast(state.data);
      if (!f) return;
      f.end = new Date().toISOString();
      state.notice = `Fast ended after ${elapsedText(f)} hours.`;
      persist();
    },
    'del-fast': (el) => {
      if (!confirm('Delete this fast?')) return;
      state.data.fasts = state.data.fasts.filter((f) => f.id !== el.dataset.id);
      persist();
    },
  },
  changes: {
    'fast-start-time': (el) => {
      const f = activeFast(state.data);
      const t = new Date(el.value);
      if (!f || Number.isNaN(t.getTime()) || t.getTime() > Date.now()) return;
      f.start = t.toISOString();
      persist();
    },
  },
};
