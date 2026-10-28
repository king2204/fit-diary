// Food photo: take or choose a photo, let the AI name the foods and guess amounts, check them, add them to the diary.
import { basicFoods } from '../basicfoods';
import { go, render, state, store, type Handlers, type PhotoScreen, type Screen } from '../core';
import { esc } from '../html';
import { scale } from '../nutrition';
import { matchPhotoFoods, recognizeFood, shrinkPhoto, type PhotoItem } from '../photo';
import { MEALS, addFood, type Meal } from '../store';
import { header, icon, kcal, mealName, option } from '../ui';
import { openSearch } from './food';

export function photoScreen(meal: Meal, back: Screen): PhotoScreen {
  return { name: 'photo', meal, step: 'pick', preview: '', message: '', items: [], note: '', used: 0, limit: 0, back };
}

const itemKcal = (it: PhotoItem) => (it.food ? scale(it.food.per100, it.grams).kcal : 0);
const totalKcal = (s: PhotoScreen) => s.items.filter((it) => it.on).reduce((sum, it) => sum + itemKcal(it), 0);

const CONFIDENCE = { high: '', medium: ', not sure', low: ', just a guess' };

function itemHtml(it: PhotoItem, i: number): string {
  const title = it.ai.thai_name ? `${it.ai.name} (${it.ai.thai_name})` : it.ai.name;
  return `<li class="photo-item">
    <label class="check-row"><input type="checkbox" data-act="photo-on" data-i="${i}" ${it.on ? 'checked' : ''}>
      <span><b>${esc(title)}</b><small>AI: ${esc(it.ai.portion)}, about ${Math.round(it.ai.grams)} g${CONFIDENCE[it.ai.confidence]}</small></span></label>
    <div class="photo-match">
      <span class="name">${it.food ? esc(it.food.name) : 'No match: tap Change to pick a food'}<small id="photo-kcal-${i}">${it.food ? `${kcal(itemKcal(it))} kcal` : ''}</small></span>
      <label class="grams"><input type="number" inputmode="decimal" min="0" step="1" data-i="${i}" value="${it.grams}" aria-label="Grams of ${esc(it.ai.name)}">g</label>
      <button type="button" class="link small" data-act="photo-change" data-i="${i}">Change</button>
    </div>
  </li>`;
}

export function photoView(s: PhotoScreen): string {
  const pick = (label: string, primary: boolean) => `
    <label class="button wide ${primary ? 'primary' : ''}">${icon('camera')} ${label}<input type="file" accept="image/*" capture="environment" data-act="photo-file" hidden></label>
    <label class="button wide">Choose from your photos<input type="file" accept="image/*" data-act="photo-file" hidden></label>`;
  let body: string;
  if (s.step === 'pick') {
    body = `<section class="card stack center-card">
        <span class="tile-ic big">${icon('camera')}</span>
        <p>Take a photo of your food. The AI names each food and guesses how much there is. You check everything before it is added.</p>
        ${s.message ? `<p class="notice" role="status">${esc(s.message)}</p>` : ''}
        ${pick('Take a photo', true)}
      </section>
      <p class="muted center">Your photo is sent to Anthropic's AI (Claude) to be checked. The app doesn't save it.</p>`;
  } else if (s.step === 'working') {
    body = `<section class="card stack center-card"><img class="photo-preview" src="${s.preview}" alt="Your food photo">
      <p role="status">Looking at your food…</p></section>`;
  } else {
    body = `<section class="card photo-top"><img class="photo-thumb" src="${s.preview}" alt="Your food photo">
        <label>Add to<select data-act="photo-meal">${MEALS.map((m) => option(m, mealName(m), s.meal)).join('')}</select></label></section>
      ${s.note ? `<p class="notice">${esc(s.note)}</p>` : ''}
      ${s.items.length ? `<form data-form="photo" class="stack">
          <section class="card flush"><ul class="list">${s.items.map(itemHtml).join('')}</ul></section>
          <p class="photo-total">Total <b id="photo-total">${kcal(totalKcal(s))}</b> kcal</p>
          <button class="primary wide" ${s.items.some((it) => it.on && it.food) ? '' : 'disabled'}>Add to diary</button>
        </form>` : '<p class="empty">No food found in this photo.</p>'}
      <p class="muted center">The AI guesses amounts from the photo, so check the grams.${s.limit ? ` Photos today: ${s.used} of ${s.limit}.` : ''}</p>
      ${pick('Take another photo', false)}`;
  }
  return `${header('Food photo', { back: true })}<main>${body}</main>`;
}

async function analyze(s: PhotoScreen, file: File): Promise<void> {
  Object.assign(s, { message: '', items: [], note: '' });
  try {
    s.preview = await shrinkPhoto(file);
  } catch {
    s.message = 'That file could not be opened as a photo.';
    return render();
  }
  s.step = 'working';
  render();
  try {
    const [result, list] = await Promise.all([recognizeFood(s.preview), basicFoods()]);
    Object.assign(s, { items: matchPhotoFoods(result, list), note: result.note, used: result.used, limit: result.limit, step: 'done' });
  } catch (e) {
    Object.assign(s, { step: 'pick', message: e instanceof Error ? e.message : 'Photo AI failed. Try again.' });
  }
  if (state.screen === s) render();
}

export const handlers: Handlers = {
  actions: {
    photo: () => {
      const s = state.screen;
      if (s.name === 'add' && s.target.kind === 'diary') go(photoScreen(s.target.meal, s));
    },
    'photo-change': (el) => {
      const s = state.screen;
      if (s.name !== 'photo') return;
      const i = Number(el.dataset.i);
      openSearch({ kind: 'photo', screen: s, index: i }, s, s.items[i].ai.name);
    },
  },
  changes: {
    'photo-file': (el) => {
      const s = state.screen;
      const file = el.files?.[0];
      if (s.name === 'photo' && file) analyze(s, file);
    },
    'photo-on': (el) => {
      const s = state.screen;
      if (s.name !== 'photo') return;
      s.items[Number(el.dataset.i)].on = el.checked;
      render();
    },
    'photo-meal': (el) => {
      if (state.screen.name === 'photo') state.screen.meal = el.value as Meal;
    },
  },
  inputs: {
    // Grams typed for one food: update its calories and the total without redrawing the screen.
    photo: (_form, input) => {
      const s = state.screen;
      if (s.name !== 'photo' || input.dataset.i === undefined) return;
      const it = s.items[Number(input.dataset.i)];
      it.grams = Number(input.value) || 0;
      document.getElementById(`photo-kcal-${input.dataset.i}`)!.textContent = it.food ? `${kcal(itemKcal(it))} kcal` : '';
      document.getElementById('photo-total')!.textContent = kcal(totalKcal(s));
    },
  },
  forms: {
    photo: () => {
      const s = state.screen;
      if (s.name !== 'photo') return;
      const items = s.items.filter((it) => it.on && it.food && it.grams > 0);
      for (const it of items) addFood(state.data, state.date, s.meal, it.food!, it.grams, { label: 'g', grams: 1 });
      state.notice = `Added ${items.length} ${items.length === 1 ? 'food' : 'foods'} from your photo to ${mealName(s.meal)}.`;
      store();
      go({ name: 'diary' });
    },
  },
};
