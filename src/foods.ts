// Food search and barcode lookup using Open Food Facts and USDA FoodData Central.
import { zero, type Micro, type Micros, type Nutrients } from './nutrition';
import { searchBasicFoods } from './basicfoods';
import type { Food, Unit } from './store';
import { rankFoods } from './suggest';

const OFF = 'https://world.openfoodfacts.org';
const OFF_FIELDS = 'code,product_name,product_name_en,brands,serving_size,serving_quantity,nutriments';
const USDA = 'https://api.nal.usda.gov/fdc/v1/foods/search';
const USDA_FOOD = 'https://api.nal.usda.gov/fdc/v1/food';

export class RateLimitError extends Error {}

type OffProduct = {
  code?: string;
  product_name?: string;
  product_name_en?: string;
  brands?: string | string[];
  serving_size?: string;
  serving_quantity?: number | string;
  nutriments?: Record<string, number | string | undefined>;
};

const num = (v: unknown): number | undefined => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
};

// Open Food Facts gives these in grams per 100 g; the factor converts to the unit the app shows (mg or mcg).
const OFF_MICROS: [Micro, string, number][] = [
  ['satFat', 'saturated-fat', 1], ['transFat', 'trans-fat', 1], ['cholesterol', 'cholesterol', 1e3], ['potassium', 'potassium', 1e3],
  ['calcium', 'calcium', 1e3], ['iron', 'iron', 1e3], ['vitA', 'vitamin-a', 1e6], ['vitC', 'vitamin-c', 1e3], ['vitD', 'vitamin-d', 1e6],
  ['vitB1', 'vitamin-b1', 1e3], ['vitB2', 'vitamin-b2', 1e3], ['vitB3', 'vitamin-pp', 1e3], ['vitB6', 'vitamin-b6', 1e3],
  ['vitB9', 'vitamin-b9', 1e6], ['vitB12', 'vitamin-b12', 1e6],
];

export function parseOffProduct(p: OffProduct, code = p.code): Food | null {
  const name = (p.product_name || p.product_name_en || '').trim();
  const n = p.nutriments ?? {};
  const kcal = num(n['energy-kcal_100g']) ?? (num(n['energy_100g']) !== undefined ? num(n['energy_100g'])! / 4.184 : undefined);
  if (!name || !code || kcal === undefined) return null;
  const sodiumG = num(n['sodium_100g']) ?? (num(n['salt_100g']) !== undefined ? num(n['salt_100g'])! / 2.5 : 0);
  const per100: Nutrients = {
    kcal,
    protein: num(n['proteins_100g']) ?? 0,
    carbs: num(n['carbohydrates_100g']) ?? 0,
    fat: num(n['fat_100g']) ?? 0,
    sugar: num(n['sugars_100g']) ?? 0,
    fiber: num(n['fiber_100g']) ?? 0,
    sodium: sodiumG * 1000,
  };
  const micros: Micros = {};
  for (const [key, field, factor] of OFF_MICROS) {
    const v = num(n[`${field}_100g`]);
    if (v !== undefined) micros[key] = v * factor;
  }
  const brand = Array.isArray(p.brands) ? p.brands.join(', ') : p.brands;
  const servingGrams = num(p.serving_quantity);
  return {
    id: `off:${code}`, name, brand: brand || undefined, per100, micros: Object.keys(micros).length ? micros : undefined,
    servingGrams: servingGrams && servingGrams > 0 ? servingGrams : undefined,
    servingLabel: p.serving_size || undefined,
  };
}

type UsdaFood = {
  fdcId: number;
  description: string;
  brandOwner?: string;
  brandName?: string;
  gtinUpc?: string;
  servingSize?: number;
  servingSizeUnit?: string;
  householdServingFullText?: string;
  foodNutrients: { nutrientNumber?: string; value?: number }[];
};

// USDA nutrient numbers. Energy is 208, or 958/957 (Atwater factors) for some Foundation foods.
const USDA_NUTRIENTS: Record<string, keyof Nutrients> = {
  '203': 'protein', '205': 'carbs', '204': 'fat', '269': 'sugar', '291': 'fiber', '307': 'sodium',
};
// Each nutrient's numbers in order of preference, with a factor to the app's unit.
// Vitamin D can come in IU (1 IU = 0.025 mcg). Vitamin A in IU is skipped: converting it depends on the source.
const USDA_MICROS: [Micro, [string, number][]][] = [
  ['satFat', [['606', 1]]], ['transFat', [['605', 1]]], ['cholesterol', [['601', 1]]], ['potassium', [['306', 1]]], ['calcium', [['301', 1]]],
  ['iron', [['303', 1]]], ['vitA', [['320', 1]]], ['vitC', [['401', 1]]], ['vitD', [['328', 1], ['324', 0.025]]], ['vitB1', [['404', 1]]],
  ['vitB2', [['405', 1]]], ['vitB3', [['406', 1]]], ['vitB6', [['415', 1]]], ['vitB9', [['435', 1], ['417', 1]]], ['vitB12', [['418', 1]]],
];

// Branded USDA names are ALL CAPS; make them readable.
function tidy(name: string): string {
  if (name !== name.toUpperCase()) return name;
  return name.toLowerCase().replace(/(^|[\s,(/-])\p{L}/gu, (m) => m.toUpperCase());
}

export function parseUsdaFood(f: UsdaFood): Food | null {
  // Brand products can list a nutrient several times (older label versions, values per serving);
  // the first one is the current value per 100 g.
  const values = new Map<string, number>();
  for (const n of f.foodNutrients) {
    if (n.nutrientNumber && n.value !== undefined && !values.has(n.nutrientNumber)) values.set(n.nutrientNumber, n.value);
  }
  const kcal = values.get('208') ?? values.get('958') ?? values.get('957');
  if (kcal === undefined) return null;
  const per100 = zero();
  per100.kcal = kcal;
  for (const [number, key] of Object.entries(USDA_NUTRIENTS)) per100[key] = values.get(number) ?? 0;
  const micros: Micros = {};
  for (const [key, sources] of USDA_MICROS) {
    const found = sources.find(([number]) => values.has(number));
    if (found) micros[key] = values.get(found[0])! * found[1];
  }
  const unit = f.servingSizeUnit?.toLowerCase();
  const servingGrams = f.servingSize && (unit === 'g' || unit === 'grm' || unit === 'ml' || unit === 'mlt') ? f.servingSize : undefined;
  return {
    id: `usda:${f.fdcId}`,
    name: tidy(f.description),
    brand: f.brandName || f.brandOwner ? tidy(f.brandName || f.brandOwner!) : undefined,
    per100,
    micros: Object.keys(micros).length ? micros : undefined,
    servingGrams,
    servingLabel: f.householdServingFullText || undefined,
  };
}

type UsdaPortion = {
  amount?: number;
  gramWeight?: number;
  modifier?: string;
  portionDescription?: string;
  measureUnit?: { name?: string };
};

// "1 undetermined | medium (7" to 7-7/8" long)" -> "medium (7" to 7-7/8" long)"; Foundation foods use "1 cup".
export function parseUsdaPortions(portions: UsdaPortion[]): Unit[] {
  const out: Unit[] = [];
  for (const p of portions) {
    if (!p.gramWeight || !p.amount) continue;
    const unit = p.measureUnit?.name && p.measureUnit.name !== 'undetermined' ? p.measureUnit.name : '';
    const desc = (p.modifier || (p.portionDescription !== 'Quantity not specified' ? p.portionDescription : '') || '').trim();
    // Skip the unit when the description already names it ("cup" + "1 cup").
    const words = (desc.toLowerCase().includes(unit.toLowerCase()) ? desc : `${unit} ${desc}`).trim();
    if (!words) continue;
    out.push({ label: p.amount === 1 ? words : `${p.amount} ${words}`, grams: p.gramWeight });
  }
  return out;
}

// Household portions for a USDA food (only basic foods have these; brand products have a serving instead).
export async function usdaPortions(food: Food, key: string): Promise<Unit[]> {
  const id = food.id.slice('usda:'.length);
  const data = (await getJson(`${USDA_FOOD}/${encodeURIComponent(id)}?api_key=${encodeURIComponent(key || 'DEMO_KEY')}&nutrients=208`)) as { foodPortions?: UsdaPortion[] };
  return parseUsdaPortions(data.foodPortions ?? []);
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (res.status === 429) throw new RateLimitError('Too many searches');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function searchOff(query: string, page: number): Promise<Food[]> {
  const url = `${OFF}/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=20&page=${page}&fields=${OFF_FIELDS}`;
  const data = (await getJson(url)) as { products?: OffProduct[] };
  return (data.products ?? []).map((p) => parseOffProduct(p)).filter((f): f is Food => f !== null);
}

async function searchUsda(query: string, key: string, dataTypes = 'Foundation,SR Legacy,Branded', page = 1): Promise<{ foods?: UsdaFood[]; totalPages?: number }> {
  const url = `${USDA}?api_key=${encodeURIComponent(key || 'DEMO_KEY')}&query=${encodeURIComponent(query)}&dataType=${encodeURIComponent(dataTypes)}&pageSize=25&pageNumber=${page}`;
  return (await getJson(url)) as { foods?: UsdaFood[]; totalPages?: number };
}

export interface SearchResult {
  foods: Food[]; // best match first
  problems: string[]; // shown to the user when a source fails
  more: boolean; // another page of results exists
}

const PAGE = 25;

// Built-in basic foods (no limits) plus brand products online. The built-in list is USDA's SR Legacy,
// so the online search asks USDA only for its other foods.
export async function searchFoods(query: string, usdaKey: string, page = 1): Promise<SearchResult> {
  const [basic, usda, off] = await Promise.allSettled([
    searchBasicFoods(query), searchUsda(query, usdaKey, 'Foundation,Branded', page), searchOff(query, page),
  ]);
  const foods: Food[] = [];
  const problems: string[] = [];
  let best: Food[] = []; // pinned best matches stay on top of the first page
  let more = false;
  if (basic.status === 'fulfilled') {
    if (page === 1) best = basic.value.best;
    foods.push(...basic.value.rest.slice((page - 1) * PAGE, page * PAGE));
    more = basic.value.rest.length > page * PAGE;
  } else problems.push('The built-in food list could not load. Check your internet connection.');
  if (usda.status === 'fulfilled') {
    foods.push(...(usda.value.foods ?? []).map(parseUsdaFood).filter((f): f is Food => f !== null));
    more ||= (usda.value.totalPages ?? 1) > page;
  } else problems.push(usda.reason instanceof RateLimitError
    ? 'Brand products are missing: the free USDA search limit is used up for now. Add your free USDA key in Settings.'
    : 'Brand products are missing: USDA online search is not available right now.');
  if (off.status === 'fulfilled') foods.push(...off.value);
  return { foods: [...best, ...rankFoods(query, foods)], problems, more };
}

// Open Food Facts first (worldwide products), then USDA branded foods by UPC.
export async function lookupBarcode(code: string, usdaKey: string): Promise<Food | null> {
  try {
    const data = (await getJson(`${OFF}/api/v2/product/${encodeURIComponent(code)}.json?fields=${OFF_FIELDS}`)) as { status?: number; product?: OffProduct };
    if (data.status === 1 && data.product) {
      const food = parseOffProduct(data.product, code);
      if (food) return food;
    }
  } catch (e) {
    if (!(e instanceof Error) || !e.message.startsWith('HTTP 404')) console.warn('Open Food Facts lookup failed', e);
  }
  const digits = code.replace(/^0+/, '');
  const matches = ((await searchUsda(code, usdaKey, 'Branded')).foods ?? []).filter((f) => f.gtinUpc?.replace(/^0+/, '') === digits);
  return matches.length ? parseUsdaFood(matches[0]) : null;
}
