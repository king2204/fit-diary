// Food search and barcode lookup using Open Food Facts and USDA FoodData Central.
import { zero, type Nutrients } from './nutrition';
import type { Food, Unit } from './store';

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
  const brand = Array.isArray(p.brands) ? p.brands.join(', ') : p.brands;
  const servingGrams = num(p.serving_quantity);
  return {
    id: `off:${code}`, name, brand: brand || undefined, per100,
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

// USDA nutrient numbers. Energy is 208, or 957/958 (Atwater factors) for some Foundation foods.
const USDA_NUTRIENTS: Record<string, keyof Nutrients> = {
  '208': 'kcal', '203': 'protein', '205': 'carbs', '204': 'fat', '269': 'sugar', '291': 'fiber', '307': 'sodium',
};

// Branded USDA names are ALL CAPS; make them readable.
function tidy(name: string): string {
  if (name !== name.toUpperCase()) return name;
  return name.toLowerCase().replace(/(^|[\s,(/-])\p{L}/gu, (m) => m.toUpperCase());
}

export function parseUsdaFood(f: UsdaFood): Food | null {
  const per100 = zero();
  let hasEnergy = false;
  let atwater: number | undefined;
  for (const n of f.foodNutrients) {
    const key = n.nutrientNumber && USDA_NUTRIENTS[n.nutrientNumber];
    if (key && n.value !== undefined) {
      per100[key] = n.value;
      if (key === 'kcal') hasEnergy = true;
    } else if ((n.nutrientNumber === '958' || n.nutrientNumber === '957') && n.value !== undefined) {
      atwater ??= n.value;
    }
  }
  if (!hasEnergy) {
    if (atwater === undefined) return null;
    per100.kcal = atwater;
  }
  const unit = f.servingSizeUnit?.toLowerCase();
  const servingGrams = f.servingSize && (unit === 'g' || unit === 'grm' || unit === 'ml' || unit === 'mlt') ? f.servingSize : undefined;
  return {
    id: `usda:${f.fdcId}`,
    name: tidy(f.description),
    brand: f.brandName || f.brandOwner ? tidy(f.brandName || f.brandOwner!) : undefined,
    per100,
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

async function searchOff(query: string): Promise<Food[]> {
  const url = `${OFF}/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=20&fields=${OFF_FIELDS}`;
  const data = (await getJson(url)) as { products?: OffProduct[] };
  return (data.products ?? []).map((p) => parseOffProduct(p)).filter((f): f is Food => f !== null);
}

async function searchUsda(query: string, key: string, dataTypes = 'Foundation,SR Legacy,Branded'): Promise<UsdaFood[]> {
  const url = `${USDA}?api_key=${encodeURIComponent(key || 'DEMO_KEY')}&query=${encodeURIComponent(query)}&dataType=${encodeURIComponent(dataTypes)}&pageSize=25`;
  const data = (await getJson(url)) as { foods?: UsdaFood[] };
  return data.foods ?? [];
}

export interface SearchResult {
  foods: Food[];
  problems: string[]; // shown to the user when a source fails
}

export async function searchFoods(query: string, usdaKey: string): Promise<SearchResult> {
  const [usda, off] = await Promise.allSettled([searchUsda(query, usdaKey), searchOff(query)]);
  const foods: Food[] = [];
  const problems: string[] = [];
  if (usda.status === 'fulfilled') foods.push(...usda.value.map(parseUsdaFood).filter((f): f is Food => f !== null));
  else problems.push(usda.reason instanceof RateLimitError
    ? 'USDA search limit reached. Add your free USDA key in Settings for more searches.'
    : 'USDA search is not available right now.');
  if (off.status === 'fulfilled') foods.push(...off.value);
  // Plain foods ("Bananas, raw") before brand products; the order within each group is kept.
  foods.sort((a, b) => Number(!!a.brand) - Number(!!b.brand));
  return { foods, problems };
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
  const matches = (await searchUsda(code, usdaKey, 'Branded')).filter((f) => f.gtinUpc?.replace(/^0+/, '') === digits);
  return matches.length ? parseUsdaFood(matches[0]) : null;
}
