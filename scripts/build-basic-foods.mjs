// Builds public/data/basic-foods.json, the app's built-in food list, from USDA FoodData Central
// "SR Legacy" (public domain): https://fdc.nal.usda.gov/download-datasets
// The JSON has the foods; the CSV download adds the portion amounts the JSON leaves out ("1/3 cup", "3 oz").
//   curl -O https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_json_2021-10-28.zip
//   curl -O https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip
//   unzip both, then:
//   node scripts/build-basic-foods.mjs FoodData_Central_sr_legacy_food_json_2021-10-28.json \
//     FoodData_Central_sr_legacy_food_csv_2018-04/food_portion.csv
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

// Nutrients in the order src/basicfoods.ts reads them. Each: USDA nutrient numbers in order of preference, with a
// factor to the app's unit (vitamin D in IU: 1 IU = 0.025 mcg).
const KEYS = [
  ['kcal', [['208', 1]]], ['protein', [['203', 1]]], ['carbs', [['205', 1]]], ['fat', [['204', 1]]], ['sugar', [['269', 1]]],
  ['fiber', [['291', 1]]], ['sodium', [['307', 1]]],
  ['satFat', [['606', 1]]], ['transFat', [['605', 1]]], ['cholesterol', [['601', 1]]], ['potassium', [['306', 1]]], ['calcium', [['301', 1]]],
  ['iron', [['303', 1]]], ['vitA', [['320', 1]]], ['vitC', [['401', 1]]], ['vitD', [['328', 1], ['324', 0.025]]], ['vitB1', [['404', 1]]],
  ['vitB2', [['405', 1]]], ['vitB3', [['406', 1]]], ['vitB6', [['415', 1]]], ['vitB9', [['435', 1], ['417', 1]]], ['vitB12', [['418', 1]]],
];
// Not useful in an adult diary.
const SKIP_CATEGORIES = new Set(['Baby Foods']);
// USDA adds this to some names; it means nothing to the user.
const NOTE = " (Includes foods for USDA's Food Distribution Program)";

// What most people mean by common searches, shown first as "Best match" (USDA names as they appear in the app).
const COOKED_BREAST = 'Chicken, broilers or fryers, breast, meat only, cooked, roasted';
const RAW_BREAST = 'Chicken, broiler or fryers, breast, skinless, boneless, meat only, raw';
const WHITE_RICE = 'Rice, white, long-grain, regular, enriched, cooked';
const EGGS = ['Egg, whole, raw, fresh', 'Egg, whole, cooked, hard-boiled', 'Egg, whole, cooked, fried'];
const DRY_OATS = 'Cereals, oats, regular and quick, not fortified, dry';
const SKIM = 'Milk, nonfat, fluid, with added vitamin A and vitamin D (fat free or skim)';
const BEEF = ['Beef, ground, 85% lean meat / 15% fat, patty, cooked, broiled', 'Beef, ground, 85% lean meat / 15% fat, raw'];
const STEAK = 'Beef, rib eye steak, bone-in, lip-on, separable lean and fat, trimmed to 1/8" fat, all grades, cooked, grilled';
const PASTA = 'Pasta, cooked, enriched, without added salt';
const COFFEE = 'Beverages, coffee, brewed, prepared with tap water';
const COLA = 'Beverages, carbonated, cola, regular';
const STICKY = 'Rice, white, glutinous, unenriched, cooked';
const NOODLES = 'Noodles, egg, cooked, enriched, with added salt';
const BEST = {
  'chicken breast': [COOKED_BREAST, RAW_BREAST],
  chicken: [COOKED_BREAST, RAW_BREAST, 'Chicken, broilers or fryers, thigh, meat only, cooked, roasted'],
  'chicken thigh': ['Chicken, broilers or fryers, thigh, meat only, cooked, roasted', 'Chicken, broilers or fryers, dark meat, thigh, meat only, raw'],
  rice: [WHITE_RICE, 'Rice, brown, long-grain, cooked', STICKY],
  'white rice': [WHITE_RICE, 'Rice, white, long-grain, regular, raw, enriched'],
  'brown rice': ['Rice, brown, long-grain, cooked', 'Rice, brown, long-grain, raw'],
  'sticky rice': [STICKY],
  'glutinous rice': [STICKY],
  egg: EGGS,
  eggs: EGGS,
  'boiled egg': ['Egg, whole, cooked, hard-boiled'],
  'fried egg': ['Egg, whole, cooked, fried'],
  'scrambled eggs': ['Egg, whole, cooked, scrambled'],
  omelette: ['Egg, whole, cooked, omelet'],
  'egg white': ['Egg, white, raw, fresh'],
  oats: ['Oats', DRY_OATS],
  'rolled oats': [DRY_OATS],
  oatmeal: ['Cereals, oats, regular and quick, unenriched, cooked with water (includes boiling and microwaving), without salt', DRY_OATS],
  milk: ['Milk, whole, 3.25% milkfat, with added vitamin D', 'Milk, reduced fat, fluid, 2% milkfat, with added vitamin A and vitamin D', SKIM],
  'skim milk': [SKIM],
  bread: ['Bread, white, commercially prepared (includes soft bread crumbs)', 'Bread, whole-wheat, commercially prepared'],
  'white bread': ['Bread, white, commercially prepared (includes soft bread crumbs)'],
  'whole wheat bread': ['Bread, whole-wheat, commercially prepared'],
  toast: ['Bread, white, commercially prepared, toasted', 'Bread, whole-wheat, commercially prepared, toasted'],
  cheese: ['Cheese, cheddar', 'Cheese, mozzarella, whole milk'],
  'cheddar cheese': ['Cheese, cheddar'],
  sugar: ['Sugars, granulated'],
  'peanut butter': ['Peanut butter, smooth style, with salt', 'Peanut butter, smooth style, without salt'],
  beef: BEEF,
  'ground beef': BEEF,
  steak: [STEAK],
  'beef steak': [STEAK],
  'pork chop': ['Pork, fresh, loin, center loin (chops), boneless, separable lean only, cooked, pan-broiled'],
  salmon: ['Fish, salmon, Atlantic, farmed, cooked, dry heat', 'Fish, salmon, Atlantic, farmed, raw'],
  tuna: ['Fish, tuna, light, canned in water, drained solids'],
  shrimp: ['Crustaceans, shrimp, cooked', 'Crustaceans, shrimp, raw'],
  bacon: ['Pork, cured, bacon, cooked, baked'],
  potato: ['Potatoes, baked, flesh and skin, without salt'],
  'sweet potato': ['Sweet potato, cooked, baked in skin, flesh, without salt'],
  pasta: [PASTA],
  spaghetti: [PASTA],
  yogurt: ['Yogurt, plain, whole milk', 'Yogurt, plain, low fat'],
  'greek yogurt': ['Yogurt, Greek, plain, nonfat', 'Yogurt, Greek, plain, whole milk'],
  apple: ['Apples, raw, with skin'],
  orange: ['Oranges, raw, all commercial varieties'],
  'orange juice': ['Orange juice, raw'],
  coffee: [COFFEE],
  'black coffee': [COFFEE],
  tea: ['Beverages, tea, black, brewed, prepared with tap water'],
  butter: ['Butter, salted', 'Butter, without salt'],
  'olive oil': ['Oil, olive, salad or cooking'],
  avocado: ['Avocados, raw, all commercial varieties'],
  almonds: ['Nuts, almonds'],
  peanuts: ['Peanuts, all types, dry-roasted, without salt', 'Peanuts, all types, raw'],
  honey: ['Honey'],
  water: ['Beverages, water, tap, drinking'],
  'coca cola': [COLA],
  coke: [COLA],
  cola: [COLA],
  soda: [COLA],
  beer: ['Alcoholic beverage, beer, regular, all'],
  'ice cream': ['Ice creams, vanilla', 'Ice creams, chocolate'],
  chocolate: ['Candies, milk chocolate', 'Chocolate, dark, 70-85% cacao solids'],
  'dark chocolate': ['Chocolate, dark, 70-85% cacao solids'],
  broccoli: ['Broccoli, raw', 'Broccoli, cooked, boiled, drained, without salt'],
  tofu: ['Tofu, raw, firm, prepared with calcium sulfate'],
  lentils: ['Lentils, mature seeds, cooked, boiled, without salt'],
  chickpeas: ['Chickpeas (garbanzo beans, bengal gram), mature seeds, cooked, boiled, without salt'],
  pizza: ['Pizza, cheese topping, regular crust, frozen, cooked'],
  'french fries': ['Potatoes, french fried, all types, salt not added in processing, frozen, oven-heated'],
  popcorn: ['Snacks, popcorn, air-popped'],
  noodles: [NOODLES],
  'egg noodles': [NOODLES],
};
const FRACTIONS = { 0.25: '1/4', 0.33: '1/3', 0.5: '1/2', 0.67: '2/3', 0.75: '3/4', 1.5: '1 1/2' };
const round = (v) => Number(v.toPrecision(3));

// Rows of a CSV file with quoted fields; "" inside quotes is one quote mark.
function csvRows(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') field += text[++i];
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c !== '\r') field += c;
  }
  if (field || row.length) rows.push([...row, field]);
  return rows;
}

// Portion id -> amount, e.g. 0.33 for "1/3 cup".
const [head, ...portionRows] = csvRows(readFileSync(process.argv[3], 'utf8'));
const amounts = new Map(portionRows.map((r) => [Number(r[head.indexOf('id')]), Number(r[head.indexOf('amount')])]));

const { SRLegacyFoods } = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const foods = [];
for (const f of SRLegacyFoods) {
  if (SKIP_CATEGORIES.has(f.foodCategory?.description)) continue;
  const values = new Map();
  for (const n of f.foodNutrients) if (n.amount !== undefined && !values.has(n.nutrient.number)) values.set(n.nutrient.number, n.amount);
  const row = KEYS.map(([, sources]) => {
    const found = sources.find(([number]) => values.has(number));
    return found ? round(values.get(found[0]) * found[1]) : null;
  });
  if (row[0] === null) continue;
  // "cup", "1/3 cup", "3 oz", "medium (7" to 7-7/8" long)". Portions without an amount are left out.
  const portions = (f.foodPortions ?? [])
    .filter((p) => p.gramWeight > 0 && p.modifier?.trim() && amounts.get(p.id) > 0)
    .sort((a, b) => a.sequenceNumber - b.sequenceNumber)
    .map((p) => {
      const amount = amounts.get(p.id);
      return [amount === 1 ? p.modifier.trim() : `${FRACTIONS[amount] ?? amount} ${p.modifier.trim()}`, round(p.gramWeight)];
    });
  foods.push([f.fdcId, f.description.replace(NOTE, ''), row, portions]);
}
foods.sort((a, b) => a[1].localeCompare(b[1]));

// Best matches as food ids. A name that is missing or not unique stops the build.
const ids = new Map();
for (const [id, name] of foods) ids.set(name, ids.has(name) ? null : id);
const best = Object.fromEntries(Object.entries(BEST).map(([query, names]) => [query, names.map((name) => {
  const id = ids.get(name);
  if (!id) throw new Error(`Best match "${name}" for "${query}" is ${id === null ? 'not unique' : 'not in the data'}`);
  return id;
})]));

mkdirSync('public/data', { recursive: true });
writeFileSync('public/data/basic-foods.json', JSON.stringify({
  source: 'USDA FoodData Central, SR Legacy (2021-10-28). Public domain.', keys: KEYS.map(([k]) => k), best, foods,
}));
console.log(`${foods.length} foods written to public/data/basic-foods.json`);
