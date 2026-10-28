// More: menu, settings and data export, and the user's saved meals, recipes and foods.
import { supabase } from '../cloud';
import { diaryCsv } from '../csv';
import { SYNC_TEXT, back, dirtyKey, go, persist, render, signedOut, state, store, today, type Handlers, type Screen } from '../core';
import { esc } from '../html';
import { scale } from '../nutrition';
import { MEALS, itemsTotals, logItems, mealForHour, newId, parseData, recipeFood, userKey, type Meal, type Recipe } from '../store';
import { grams, header, icon, kcal, mealName, menuItem, option, tabs } from '../ui';
import { entryAmount } from './diary';
import { addScreen, nutritionHtml } from './food';
import { showReports } from './progress';

const open = (to: string) => `data-act="open" data-to="${to}"`;

export function moreView(): string {
  const d = state.data;
  return `${header('More')}<main>
    <section class="card flush"><ul class="list menu">
      ${menuItem('target', 'Goals', open('goals'), 'Weight, calories, macros, fitness')}
      ${menuItem('pie', 'Nutrition', open('nutrition'), 'Calories by meal, nutrients, macros')}
      ${menuItem('chart', 'Reports', 'data-act="reports"', 'Calories, macros, water and steps over time')}
    </ul></section>
    <section class="card flush"><ul class="list menu">
      ${menuItem('list', 'My meals', open('meals'), `${d.myMeals.length} saved`)}
      ${menuItem('pot', 'My recipes', open('recipes'), `${d.recipes.length} saved`)}
      ${menuItem('apple', 'My foods', open('myfoods'), `${d.myFoods.length} saved`)}
      ${menuItem('dumbbell', 'My exercises', 'data-act="my-exercises"', `${d.myExercises.length} saved`)}
    </ul></section>
    <section class="card flush"><ul class="list menu">
      ${menuItem('timer', 'Intermittent fasting', open('fasting'))}
      ${menuItem('sliders', 'Settings', open('settings'), 'Meal names, account, backup, export')}
    </ul></section>
    <p class="muted center">Signed in as ${esc(state.user?.email ?? '')}</p>
  </main>${tabs()}`;
}

export function settingsView(_s: Extract<Screen, { name: 'settings' }>): string {
  const d = state.data;
  return `${header('Settings', { back: true })}<main>
    <form data-form="settings" class="stack">
      <section class="card stack"><h2>Meal names</h2>
        <div class="row2">${MEALS.map((m) => `<label>${esc(m[0].toUpperCase() + m.slice(1))}<input name="meal-${m}" value="${esc(d.mealNames[m])}" required maxlength="30"></label>`).join('')}</div>
      </section>
      <section class="card stack"><h2>Food search</h2>
        <label>USDA API key<input name="usdaKey" value="${esc(d.usdaKey)}" autocomplete="off" placeholder="Optional, free"></label>
        <p class="muted">About 7,400 basic foods are built in and work without a key, with no limit. Brand products come from
          USDA online: without a key it allows only a few searches per hour. Get a free key at
          <a href="https://fdc.nal.usda.gov/api-key-signup" target="_blank" rel="noopener">fdc.nal.usda.gov</a> and paste it here.</p>
      </section>
      <button class="primary wide">Save settings</button>
    </form>
    <section class="card stack"><h2>Account</h2>
      <p>Signed in as <b>${esc(state.user?.email ?? '')}</b></p>
      <p class="muted" id="sync" role="status">${SYNC_TEXT[state.sync]}</p>
      <button data-act="sign-out">Sign out</button>
    </section>
    <section class="card stack"><h2>Your data</h2>
      <p class="muted">Your diary is saved to your account. You can also download it.</p>
      <button data-act="export-csv">${icon('download')} Download spreadsheet (CSV)</button>
      <div class="buttons"><button data-act="export">Download backup</button>
        <label class="button">Import backup<input type="file" accept="application/json,.json" data-act="import" hidden></label></div>
    </section>
  </main>`;
}

// ---------- My meals ----------

export function mealsView(_s: Extract<Screen, { name: 'meals' }>): string {
  const d = state.data;
  return `${header('My meals', { back: true })}<main>
    <p class="muted">To save a meal: in the diary, tap ⋯ under a meal and choose “Save as meal”.</p>
    ${d.myMeals.length ? `<section class="card flush"><ul class="list">${d.myMeals.map((m) => `<li><button data-act="open-saved-meal" data-id="${esc(m.id)}">
      <span class="name">${esc(m.name)}<small>${kcal(itemsTotals(m.items).kcal)} kcal, ${m.items.length} ${m.items.length === 1 ? 'item' : 'items'}</small></span>${icon('forward')}</button></li>`).join('')}</ul></section>`
      : '<p class="empty">No saved meals yet.</p>'}
  </main>`;
}

export function mealView(s: Extract<Screen, { name: 'meal' }>): string {
  const m = state.data.myMeals.find((x) => x.id === s.id);
  if (!m) return `${header('Meal', { back: true })}<main><p class="empty">This meal was deleted.</p></main>`;
  const t = itemsTotals(m.items);
  const from = s.back.name === 'add' && s.back.target.kind === 'diary' ? s.back.target.meal : null;
  return `${header(m.name, { back: true })}<main>
    <section class="card flush"><ul class="list">${m.items.map((it) => `<li><div class="static">
      <span class="name">${esc(it.food.name)}<small>${esc(entryAmount(it))}</small></span><span class="kcal">${kcal(scale(it.food.per100, it.grams).kcal)}</span>
      <button class="icon small" data-act="del-saved-item" data-id="${esc(it.id)}" aria-label="Remove ${esc(it.food.name)}">${icon('close')}</button></div></li>`).join('')}</ul>
      <p class="pad muted">Total ${kcal(t.kcal)} kcal · Carbs ${grams(t.carbs)} g · Protein ${grams(t.protein)} g · Fat ${grams(t.fat)} g</p>
    </section>
    <section class="card"><form data-form="log-saved-meal" class="stack">
      <label>Name<input name="name" value="${esc(m.name)}" required maxlength="60"></label>
      <div class="row2">
        <label>Meal<select name="meal">${MEALS.map((x) => option(x, mealName(x), from ?? mealForHour(new Date().getHours()))).join('')}</select></label>
        <label>Day<input name="date" type="date" value="${state.date}" required></label>
      </div>
      <button class="primary" ${m.items.length ? '' : 'disabled'}>Add to diary</button>
    </form></section>
    <button class="danger wide" data-act="del-saved-meal">Delete meal</button>
  </main>`;
}

// ---------- My recipes ----------

export function recipesView(_s: Extract<Screen, { name: 'recipes' }>): string {
  const d = state.data;
  return `${header('My recipes', { back: true })}<main>
    <button class="wide" data-act="new-recipe">${icon('plus')} Create recipe</button>
    ${d.recipes.length ? `<section class="card flush"><ul class="list">${d.recipes.map((r) => {
      const f = recipeFood(r);
      return `<li><button data-act="edit-recipe" data-id="${esc(r.id)}"><span class="name">${esc(r.name)}<small>${f ? `${kcal(scale(f.per100, f.servingGrams!).kcal)} kcal per serving, ` : ''}${r.servings} ${r.servings === 1 ? 'serving' : 'servings'}</small></span>${icon('forward')}</button></li>`;
    }).join('')}</ul></section>` : '<p class="empty">Recipes you create will show up here. A recipe adds up its ingredients and splits them into servings.</p>'}
  </main>`;
}

function recipePreview(r: Recipe): string {
  const f = recipeFood(r);
  if (!f) return '<p class="empty">Add ingredients to see the nutrition per serving.</p>';
  return `<h3 class="list-title">One serving (${grams(f.servingGrams!)} g)</h3>${nutritionHtml(f, f.servingGrams!, false)}`;
}

export function recipeView(s: Extract<Screen, { name: 'recipe' }>): string {
  const r = s.recipe;
  return `${header(s.isNew ? 'New recipe' : 'Edit recipe', { back: true })}<main>
    <form data-form="recipe" id="recipe-form" class="card stack">
      <label>Name<input name="name" value="${esc(r.name)}" required maxlength="60" placeholder="e.g. Chicken fried rice"></label>
      <label>Number of servings<input name="servings" type="number" inputmode="decimal" step="any" min="0.1" value="${r.servings}" required></label>
    </form>
    <section class="card flush"><h2 class="pad">Ingredients</h2>
      <ul class="list">${r.items.map((it) => `<li><button data-act="edit-ingredient" data-id="${esc(it.id)}">
        <span class="name">${esc(it.food.name)}<small>${esc(entryAmount(it))}</small></span><span class="kcal">${kcal(scale(it.food.per100, it.grams).kcal)}</span></button></li>`).join('')}</ul>
      <div class="sec-foot"><button class="add-link" data-act="add-ingredient">Add ingredient</button></div>
    </section>
    <div id="recipe-preview" class="stack">${recipePreview(r)}</div>
    <button class="primary wide" form="recipe-form">Save recipe</button>
    ${s.isNew ? '' : '<button class="danger wide" data-act="del-recipe">Delete recipe</button>'}
  </main>`;
}

// ---------- My foods ----------

export function myFoodsView(_s: Extract<Screen, { name: 'myfoods' }>): string {
  const d = state.data;
  return `${header('My foods', { back: true })}<main>
    <button class="wide" data-act="new-food">${icon('plus')} Create food</button>
    ${d.myFoods.length ? `<section class="card flush"><ul class="list">${d.myFoods.map((f) => {
      const k = f.servingGrams ? scale(f.per100, f.servingGrams).kcal : f.per100.kcal;
      return `<li><div class="static"><button class="name plain" data-act="edit-food" data-id="${esc(f.id)}">${esc(f.name)}<small>${kcal(k)} kcal, ${esc(f.servingLabel ?? '100 g')}${f.brand ? `, ${esc(f.brand)}` : ''}</small></button>
        <button class="icon small" data-act="del-food" data-id="${esc(f.id)}" aria-label="Delete ${esc(f.name)}">${icon('close')}</button></div></li>`;
    }).join('')}</ul></section>` : '<p class="empty">Foods you create will show up here.</p>'}
  </main>`;
}

function download(name: string, type: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const handlers: Handlers = {
  actions: {
    'sign-out': () => {
      const u = state.user;
      if (!u) return;
      if (localStorage.getItem(dirtyKey(u.id)) && !confirm('Some changes have not reached your account yet and will be lost. Sign out anyway?')) return;
      localStorage.removeItem(userKey(u.id));
      localStorage.removeItem(dirtyKey(u.id));
      supabase.auth.signOut().then(({ error }) => error && console.warn(error));
      signedOut();
    },
    reports: () => {
      showReports();
      go({ name: 'progress' });
    },
    'my-exercises': () => go({ name: 'exercise', tab: 'mine', query: '', back: state.screen }),
    export: () => download(`fit-diary-${today()}.json`, 'application/json', JSON.stringify(state.data, null, 1)),
    // The byte-order mark lets spreadsheet apps read Thai and other non-English text correctly.
    'export-csv': () => download(`fit-diary-${today()}.csv`, 'text/csv', `﻿${diaryCsv(state.data)}`),
    'open-saved-meal': (el) => go({ name: 'meal', id: el.dataset.id!, back: state.screen }),
    'del-saved-item': (el) => {
      const s = state.screen;
      const m = s.name === 'meal' ? state.data.myMeals.find((x) => x.id === s.id) : undefined;
      if (!m) return;
      m.items = m.items.filter((it) => it.id !== el.dataset.id);
      persist();
    },
    'del-saved-meal': () => {
      const s = state.screen;
      if (s.name !== 'meal' || !confirm('Delete this saved meal? Foods already in your diary stay.')) return;
      state.data.myMeals = state.data.myMeals.filter((x) => x.id !== s.id);
      store();
      back();
    },
    'new-recipe': () => go({ name: 'recipe', recipe: { id: newId(), name: '', servings: 1, items: [] }, isNew: true, back: state.screen }),
    'edit-recipe': (el) => {
      const r = state.data.recipes.find((x) => x.id === el.dataset.id);
      if (r) go({ name: 'recipe', recipe: structuredClone(r), isNew: false, back: state.screen });
    },
    'add-ingredient': () => {
      const s = state.screen;
      if (s.name === 'recipe') go(addScreen({ kind: 'recipe', screen: s }, s));
    },
    'edit-ingredient': (el) => {
      const s = state.screen;
      if (s.name !== 'recipe') return;
      const it = s.recipe.items.find((x) => x.id === el.dataset.id);
      if (it) go({ name: 'food', target: { kind: 'recipe', screen: s }, food: it.food, entryId: it.id, back: s });
    },
    'del-recipe': () => {
      const s = state.screen;
      if (s.name !== 'recipe' || !confirm('Delete this recipe? Servings already in your diary stay.')) return;
      state.data.recipes = state.data.recipes.filter((x) => x.id !== s.recipe.id);
      store();
      back();
    },
    'new-food': () => go({ name: 'custom', back: state.screen }),
    'edit-food': (el) => {
      const f = state.data.myFoods.find((x) => x.id === el.dataset.id);
      if (f) go({ name: 'custom', edit: f, back: state.screen });
    },
    'del-food': (el) => {
      const f = state.data.myFoods.find((x) => x.id === el.dataset.id);
      if (!f || !confirm(`Delete ${f.name}? Entries already in your diary stay.`)) return;
      state.data.myFoods = state.data.myFoods.filter((x) => x.id !== f.id);
      persist();
    },
  },
  changes: {
    import: async (el) => {
      const file = el.files?.[0];
      if (!file) return;
      try {
        const imported = parseData(await file.text());
        if (!confirm('Replace everything in this app with the backup?')) return;
        state.data = imported;
        state.notice = 'Backup imported.';
      } catch (err) {
        state.notice = err instanceof Error ? err.message : 'Could not read that file.';
      }
      persist();
    },
  },
  inputs: {
    recipe: (form) => {
      const s = state.screen;
      if (s.name !== 'recipe') return;
      const fd = new FormData(form);
      s.recipe.name = String(fd.get('name') ?? '');
      s.recipe.servings = Number(fd.get('servings')) || 0;
      document.getElementById('recipe-preview')!.innerHTML = recipePreview(s.recipe);
    },
  },
  forms: {
    settings: (fd) => {
      const d = state.data;
      d.mealNames = Object.fromEntries(MEALS.map((m) => [m, String(fd.get(`meal-${m}`) ?? '').trim() || d.mealNames[m]])) as Record<Meal, string>;
      d.usdaKey = String(fd.get('usdaKey') ?? '').trim();
      state.notice = 'Settings saved.';
      persist();
    },
    'log-saved-meal': (fd) => {
      const s = state.screen;
      const m = s.name === 'meal' ? state.data.myMeals.find((x) => x.id === s.id) : undefined;
      if (!m) return;
      m.name = String(fd.get('name') ?? '').trim() || m.name;
      const meal = fd.get('meal') as Meal;
      state.date = String(fd.get('date') || state.date);
      logItems(state.data, state.date, meal, m.items);
      state.notice = `Added ${m.name} to ${mealName(meal)}.`;
      store();
      go({ name: 'diary' });
    },
    recipe: () => {
      const s = state.screen;
      if (s.name !== 'recipe') return;
      const r = s.recipe;
      r.name = r.name.trim();
      if (!r.name || r.servings <= 0) return;
      if (!r.items.length) {
        state.notice = 'Add at least one ingredient.';
        return render();
      }
      state.data.recipes = s.isNew ? [r, ...state.data.recipes] : state.data.recipes.map((x) => (x.id === r.id ? r : x));
      const f = recipeFood(r)!;
      state.notice = `Saved ${r.name}: ${kcal(scale(f.per100, f.servingGrams!).kcal)} kcal per serving.`;
      store();
      back();
    },
  },
};
