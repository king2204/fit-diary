// Search help that runs on the phone: suggestions while typing, matches from the user's own foods,
// and the order of search results. No network until the user actually searches.
import type { Food } from './store';

// Common foods to suggest as search words. Generic names; the food databases find the details.
export const COMMON_FOODS = [
  // Fruit
  'apple', 'apple juice', 'apricot', 'avocado', 'banana', 'blackberries', 'blueberries', 'cantaloupe', 'cherries', 'coconut',
  'coconut water', 'cranberries', 'dates', 'dragon fruit', 'durian', 'figs', 'grapefruit', 'grapes', 'guava', 'honeydew melon',
  'jackfruit', 'kiwi', 'lemon', 'lime', 'longan', 'lychee', 'mango', 'mangosteen', 'nectarine', 'orange', 'orange juice', 'papaya',
  'passion fruit', 'peach', 'pear', 'pineapple', 'plum', 'pomegranate', 'rambutan', 'raspberries', 'strawberries', 'tangerine',
  'watermelon',
  // Vegetables
  'asparagus', 'bean sprouts', 'beets', 'bell pepper', 'bok choy', 'broccoli', 'brussels sprouts', 'cabbage', 'carrot', 'cauliflower',
  'celery', 'chinese kale', 'corn', 'cucumber', 'eggplant', 'garlic', 'green beans', 'kale', 'lettuce', 'morning glory', 'mushrooms',
  'okra', 'onion', 'peas', 'potato', 'pumpkin', 'radish', 'spinach', 'sweet potato', 'tomato', 'zucchini',
  // Grains and bread
  'bagel', 'baguette', 'basmati rice', 'bread', 'brown rice', 'buckwheat', 'bulgur', 'cereal', 'corn flakes', 'couscous', 'crackers',
  'croissant', 'egg noodles', 'glass noodles', 'granola', 'jasmine rice', 'muesli', 'noodles', 'oat bran', 'oat milk', 'oatmeal',
  'oats', 'overnight oats', 'pasta', 'pita bread', 'popcorn', 'quinoa', 'rice', 'rice cakes', 'rice noodles', 'rolled oats',
  'spaghetti', 'sticky rice', 'tortilla', 'udon', 'white bread', 'white rice', 'whole wheat bread',
  // Meat, fish, eggs, beans, nuts
  'bacon', 'beef', 'beef steak', 'boiled egg', 'chicken breast', 'chicken thigh', 'chicken wings', 'cod', 'crab', 'duck', 'egg',
  'egg white', 'fried egg', 'ground beef', 'ham', 'lamb', 'mackerel', 'pork', 'pork belly', 'pork chop', 'salmon', 'sardines',
  'sausage', 'shrimp', 'squid', 'tilapia', 'tuna', 'turkey', 'tofu', 'tempeh', 'edamame', 'lentils', 'chickpeas', 'black beans',
  'kidney beans', 'peanut butter', 'almonds', 'cashews', 'peanuts', 'walnuts', 'pistachios', 'sunflower seeds', 'chia seeds',
  'flax seeds', 'protein powder', 'whey protein', 'protein bar',
  // Dairy
  'butter', 'cheddar cheese', 'cheese', 'cottage cheese', 'cream cheese', 'greek yogurt', 'ice cream', 'milk', 'mozzarella', 'parmesan',
  'skim milk', 'soy milk', 'almond milk', 'whipped cream', 'yogurt', 'condensed milk',
  // Drinks
  'americano', 'beer', 'black coffee', 'bubble tea', 'cappuccino', 'coca cola', 'coffee', 'energy drink', 'green tea', 'hot chocolate',
  'iced coffee', 'kombucha', 'latte', 'milk tea', 'red wine', 'smoothie', 'soda', 'sprite', 'tea', 'thai iced tea', 'water',
  'whiskey', 'white wine',
  // Snacks and sweets
  'brownie', 'cake', 'candy', 'chips', 'chocolate', 'chocolate chip cookie', 'cookies', 'dark chocolate', 'donut', 'french fries',
  'granola bar', 'gummy bears', 'honey', 'jam', 'muffin', 'nutella', 'pancakes', 'pie', 'potato chips', 'pretzels', 'pudding',
  'sugar', 'waffles',
  // Meals
  'avocado toast', 'burger', 'burrito', 'caesar salad', 'cheeseburger', 'chicken nuggets', 'chicken soup', 'curry', 'dumplings',
  'fried chicken', 'fried noodles', 'fried rice', 'hot dog', 'lasagna', 'mac and cheese', 'noodle soup', 'omelette', 'pizza', 'ramen',
  'salad', 'sandwich', 'scrambled eggs', 'soup', 'spring rolls', 'sushi', 'taco', 'toast',
  // Thai and Asian dishes
  'pad thai', 'pad kra pao', 'basil chicken', 'green curry', 'red curry', 'massaman curry', 'panang curry', 'tom yum', 'tom kha gai',
  'som tam', 'papaya salad', 'khao man gai', 'khao pad', 'khao soi', 'moo ping', 'larb', 'satay', 'mango sticky rice', 'pad see ew',
  'boat noodles', 'congee', 'bbq pork', 'dim sum', 'bibimbap', 'kimchi', 'miso soup', 'pho', 'banh mi', 'laksa', 'nasi lemak',
  // Oils and sauces
  'coconut oil', 'olive oil', 'vegetable oil', 'mayonnaise', 'ketchup', 'soy sauce', 'fish sauce', 'oyster sauce', 'sriracha',
  'hummus', 'salsa', 'ranch dressing', 'mustard',
];

// Thai marks (vowel signs, tone marks) are part of words, so \p{M} stays in.
const words = (text: string) => text.toLowerCase().split(/[^\p{L}\p{M}\p{N}]+/u).filter(Boolean);

// Every typed word starts a word of the text: "oat mi" matches "Oat milk" but "oat" doesn't match "Goat cheese".
// Thai and other languages written without spaces match anywhere in the text instead.
export function matches(text: string, query: string): boolean {
  const ws = words(text);
  const lower = text.toLowerCase();
  const typed = words(query);
  return typed.length > 0 && typed.every((t) => ws.some((w) => w.startsWith(t)) || (/[^\u0000-ɏ]/.test(t) && lower.includes(t)));
}

export interface Suggestion {
  text: string;
  past: boolean; // searched before by this user
}

// Up to `limit` searches to suggest: the user's own past searches first, then common foods.
// Within each, names that start with the typed text come first, then shorter names.
export function suggestSearches(query: string, past: string[], limit = 6): Suggestion[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const pick = (list: string[]) => list
    .filter((x) => x.toLowerCase() !== q && matches(x, q))
    .map((x, i) => ({ x, i, starts: x.toLowerCase().startsWith(q) }))
    .sort((a, b) => Number(b.starts) - Number(a.starts) || a.x.length - b.x.length || a.i - b.i)
    .map((m) => m.x);
  const out: Suggestion[] = pick(past).slice(0, 3).map((text) => ({ text, past: true }));
  for (const text of pick(COMMON_FOODS)) {
    if (out.length >= limit) break;
    if (!out.some((o) => o.text.toLowerCase() === text)) out.push({ text, past: false });
  }
  return out;
}

// The user's own foods that match, in list order, without repeats.
export function localMatches(query: string, foods: Food[], limit = 5): Food[] {
  if (!query.trim()) return [];
  const seen = new Set<string>();
  return foods.filter((f) => {
    if (seen.has(f.id) || !matches(`${f.name} ${f.brand ?? ''}`, query)) return false;
    seen.add(f.id);
    return true;
  }).slice(0, limit);
}

// Best match first: the name starts with the search, every word matches, plain foods before brand products,
// shorter names first. Equal scores keep the databases' own order.
export function rankFoods(query: string, foods: Food[]): Food[] {
  const q = query.trim().toLowerCase();
  const typed = words(q);
  const score = (f: Food) => {
    const name = f.name.toLowerCase();
    const nameWords = words(name);
    const hit = typed.filter((t) => nameWords.some((w) => w.startsWith(t))).length / Math.max(typed.length, 1);
    return (name.startsWith(q) ? 3 : 0) + hit * 3 + (f.brand ? 0 : 2) - name.length / 50;
  };
  return foods.map((f, i) => ({ f, i, s: score(f) })).sort((a, b) => b.s - a.s || a.i - b.i).map((x) => x.f);
}
