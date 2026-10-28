// The built-in food list, built by scripts/build-basic-foods.mjs: about 12,300 foods from USDA (public domain;
// SR Legacy basics plus FNDDS dishes, fast food and drinks) and Thai dishes estimated from USDA ingredients.
// Loaded on the first search, then searched on the phone with no limits.
import { MICRO_KEYS, zero, type Micro, type Micros, type Nutrients } from './nutrition';
import type { Food } from './store';
import { matches, normalize, rankFoods } from './suggest';

export interface BasicFoodsFile {
  keys: string[]; // nutrient names, in the order of each food's values
  best: Record<string, (number | string)[]>; // common search -> ids of what most people mean, best first
  // USDA foods have their FoodData Central id; Thai dish estimates have ids like "th:khao-man-gai" and a note.
  foods: [id: number | string, name: string, values: (number | null)[], portions: [label: string, grams: number][], note?: string][];
}

export interface BasicFoods {
  foods: Food[];
  best: Map<string, Food[]>;
}

const isMicro = (k: string): k is Micro => (MICRO_KEYS as readonly string[]).includes(k);

export function parseBasicFoods(file: BasicFoodsFile): BasicFoods {
  const foods = file.foods.map(([id, name, values, portions, note]): Food => {
    const per100 = zero();
    const micros: Micros = {};
    file.keys.forEach((k, i) => {
      const v = values[i];
      if (v === null || v === undefined) return;
      if (k in per100) per100[k as keyof Nutrients] = v;
      else if (isMicro(k)) micros[k] = v;
    });
    return {
      id: typeof id === 'number' ? `usda:${id}` : id, name, per100, micros: Object.keys(micros).length ? micros : undefined,
      portions: portions.map(([label, grams]) => ({ label, grams })), ...(note ? { note } : {}),
    };
  });
  const byId = new Map(foods.map((f) => [f.id, f]));
  const best = new Map(Object.entries(file.best ?? {}).map(([q, ids]) => [q, ids
    .map((id) => byId.get(typeof id === 'number' ? `usda:${id}` : id)).filter((f): f is Food => !!f)]));
  return { foods, best };
}

// Pinned best matches for common searches, then the rest by rank. When a search of several words finds
// almost nothing, foods matching some of the words are added after.
export function searchBasicList(list: BasicFoods, query: string): { best: Food[]; rest: Food[] } {
  const best = list.best.get(normalize(query)) ?? [];
  let found = list.foods.filter((f) => matches(f.name, query) && !best.includes(f));
  const typed = normalize(query).split(' ');
  if (found.length + best.length < 5 && typed.length > 1) {
    const some = list.foods.filter((f) => !best.includes(f) && !found.includes(f) && typed.some((t) => matches(f.name, t)));
    found = [...rankFoods(query, found), ...rankFoods(query, some)];
    return { best, rest: found };
  }
  return { best, rest: rankFoods(query, found) };
}

let loading: Promise<BasicFoods> | null = null;

export function basicFoods(): Promise<BasicFoods> {
  loading ??= fetch('data/basic-foods.json')
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<BasicFoodsFile>;
    })
    .then(parseBasicFoods)
    .catch((e) => {
      loading = null; // try again next time
      throw e;
    });
  return loading;
}

export async function searchBasicFoods(query: string): Promise<{ best: Food[]; rest: Food[] }> {
  return searchBasicList(await basicFoods(), query);
}

export async function findBasicFood(id: string): Promise<Food | undefined> {
  return (await basicFoods()).foods.find((f) => f.id === id);
}
