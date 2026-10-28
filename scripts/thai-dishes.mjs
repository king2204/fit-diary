// Thai dishes that the USDA lists don't have, estimated from USDA ingredients with typical Thai street-food
// portions. These are estimates, not lab values: real plates vary with the cook and the portion.
// Each ingredient: [short label shown to the user, exact USDA name, grams in one portion].

const RICE = 'Rice, white, long-grain, regular, enriched, cooked';
const OIL = 'Oil, soybean, salad or cooking';
const FISH_SAUCE = 'Sauce, fish, ready-to-serve';
const SOY = 'Soy sauce made from soy and wheat (shoyu)';
const OYSTER = 'Sauce, oyster, ready-to-serve';
const SUGAR = 'Sugars, granulated';
const PALM_SUGAR = 'Sugars, brown';
const GARLIC = 'Garlic, raw';
const CHILI = 'Peppers, hot chili, red, raw';
const LIME = 'Lime juice, raw';
const COCONUT = 'Nuts, coconut milk, canned (liquid expressed from grated meat and water)';
const PORK_MINCE = 'Pork, fresh, ground, cooked';
const PORK_GRILLED = 'Pork, fresh, shoulder, whole, separable lean and fat, cooked, roasted';
const CHICKEN_THIGH = 'Chicken, broilers or fryers, thigh, meat only, cooked, roasted';
const CHICKEN_BREAST = 'Chicken, broilers or fryers, breast, meat only, cooked, roasted';
const SHRIMP = 'Crustaceans, shrimp, cooked';
const EGG = 'Egg, whole, raw, fresh';
const WATER = 'Beverages, water, tap, drinking';
const SHALLOT = 'Shallots, raw';
const LEMONGRASS = 'Lemon grass (citronella), raw';
const GALANGAL = 'Ginger root, raw';
const STRAW_MUSHROOM = 'Mushrooms, straw, canned, drained solids';
const RICE_NOODLES = 'Rice noodles, cooked';
const KALE = 'Broccoli, chinese, cooked';
const CONDENSED = 'Milk, canned, condensed, sweetened';
const EVAPORATED = 'Milk, canned, evaporated, with added vitamin A';

export const THAI_DISHES = [
  {
    id: 'khao-man-gai', name: 'Khao man gai (ข้าวมันไก่), Thai chicken rice', portion: '1 plate',
    items: [['rice', RICE, 220], ['chicken fat', 'Fat, chicken', 10], ['boiled chicken with skin', 'Chicken, broilers or fryers, meat and skin, cooked, stewed', 100],
      ['soy sauce', SOY, 10], ['sugar', SUGAR, 5], ['ginger', GALANGAL, 5], ['garlic', GARLIC, 3], ['chili', CHILI, 3],
      ['cucumber', 'Cucumber, with peel, raw', 30]],
  },
  {
    id: 'pad-kra-pao-moo', name: 'Pad kra pao moo with rice (ข้าวผัดกะเพราหมูสับ), basil pork', portion: '1 plate',
    items: [['rice', RICE, 200], ['minced pork', PORK_MINCE, 100], ['oil', OIL, 10], ['holy basil', 'Basil, fresh', 10], ['garlic', GARLIC, 8],
      ['chili', CHILI, 5], ['oyster sauce', OYSTER, 10], ['fish sauce', FISH_SAUCE, 8], ['soy sauce', SOY, 5], ['sugar', SUGAR, 5]],
  },
  {
    id: 'pad-kra-pao-gai', name: 'Pad kra pao gai with rice (ข้าวผัดกะเพราไก่), basil chicken', portion: '1 plate',
    items: [['rice', RICE, 200], ['chicken', CHICKEN_THIGH, 100], ['oil', OIL, 10], ['holy basil', 'Basil, fresh', 10], ['garlic', GARLIC, 8],
      ['chili', CHILI, 5], ['oyster sauce', OYSTER, 10], ['fish sauce', FISH_SAUCE, 8], ['soy sauce', SOY, 5], ['sugar', SUGAR, 5]],
  },
  {
    id: 'som-tam-thai', name: 'Som tam Thai (ส้มตำไทย), green papaya salad', portion: '1 plate',
    items: [['papaya', 'Papayas, raw', 150], ['tomato', 'Tomatoes, red, ripe, raw, year round average', 30], ['long beans', 'Yardlong bean, raw', 20],
      ['peanuts', 'Peanuts, all types, dry-roasted, without salt', 10], ['shrimp', SHRIMP, 5], ['lime juice', LIME, 15], ['fish sauce', FISH_SAUCE, 15],
      ['palm sugar', PALM_SUGAR, 10], ['garlic', GARLIC, 5], ['chili', CHILI, 5]],
  },
  {
    id: 'tom-yum-goong', name: 'Tom yum goong (ต้มยำกุ้ง), creamy', portion: '1 bowl',
    items: [['shrimp', SHRIMP, 100], ['straw mushrooms', STRAW_MUSHROOM, 50], ['lemongrass', LEMONGRASS, 10], ['galangal (as ginger)', GALANGAL, 5],
      ['chili', CHILI, 5], ['lime juice', LIME, 15], ['fish sauce', FISH_SAUCE, 15], ['sugar', SUGAR, 3], ['chili paste oil', OIL, 5],
      ['evaporated milk', EVAPORATED, 30], ['water', WATER, 300]],
  },
  {
    id: 'tom-kha-gai', name: 'Tom kha gai (ต้มข่าไก่), chicken coconut soup', portion: '1 bowl',
    items: [['chicken', CHICKEN_BREAST, 80], ['coconut milk', COCONUT, 120], ['straw mushrooms', STRAW_MUSHROOM, 40], ['lemongrass', LEMONGRASS, 10],
      ['galangal (as ginger)', GALANGAL, 10], ['chili', CHILI, 3], ['lime juice', LIME, 15], ['fish sauce', FISH_SAUCE, 15], ['sugar', SUGAR, 5],
      ['water', WATER, 150]],
  },
  {
    id: 'green-curry-gai', name: 'Green curry with chicken (แกงเขียวหวานไก่)', portion: '1 bowl',
    items: [['chicken', CHICKEN_THIGH, 80], ['coconut milk', COCONUT, 100], ['eggplant', 'Eggplant, raw', 60], ['basil', 'Basil, fresh', 5],
      ['curry paste: chili', CHILI, 10], ['curry paste: garlic', GARLIC, 5], ['curry paste: shallot', SHALLOT, 10], ['curry paste: lemongrass', LEMONGRASS, 5],
      ['fish sauce', FISH_SAUCE, 10], ['sugar', SUGAR, 8], ['oil', OIL, 5], ['water', WATER, 100]],
  },
  {
    id: 'massaman-gai', name: 'Massaman curry with chicken (แกงมัสมั่นไก่)', portion: '1 bowl',
    items: [['chicken', CHICKEN_THIGH, 100], ['coconut milk', COCONUT, 120], ['potato', 'Potatoes, boiled, cooked without skin, flesh, without salt', 80],
      ['onion', 'Onions, raw', 30], ['peanuts', 'Peanuts, all types, dry-roasted, without salt', 10], ['palm sugar', PALM_SUGAR, 12],
      ['fish sauce', FISH_SAUCE, 10], ['curry spices', 'Spices, curry powder', 3], ['shallot', SHALLOT, 10], ['garlic', GARLIC, 5], ['chili', CHILI, 5],
      ['oil', OIL, 5], ['water', WATER, 80]],
  },
  {
    id: 'khao-soi-gai', name: 'Khao soi gai (ข้าวซอยไก่), curry noodle soup', portion: '1 bowl',
    items: [['egg noodles', 'Noodles, egg, cooked, enriched, with added salt', 150], ['chicken drumstick', 'Chicken, broilers or fryers, drumstick, meat and skin, cooked, stewed', 90],
      ['coconut milk', COCONUT, 100], ['curry spices', 'Spices, curry powder', 3], ['shallot', SHALLOT, 15], ['chili', CHILI, 5], ['fish sauce', FISH_SAUCE, 10],
      ['sugar', SUGAR, 8], ['oil (crispy noodles)', OIL, 10], ['lime juice', LIME, 5], ['water', WATER, 150]],
  },
  {
    id: 'boat-noodles', name: 'Boat noodles (ก๋วยเตี๋ยวเรือ), beef', portion: '1 small bowl',
    items: [['rice noodles', RICE_NOODLES, 80], ['beef', 'Beef, chuck, arm pot roast, separable lean and fat, trimmed to 1/8" fat, all grades, cooked, braised', 40],
      ['bean sprouts', 'Mung beans, mature seeds, sprouted, raw', 20], ['basil', 'Basil, fresh', 3], ['soy sauce', SOY, 10], ['sugar', SUGAR, 5], ['broth', WATER, 200]],
  },
  {
    id: 'jok-moo', name: 'Jok moo with egg (โจ๊กหมูใส่ไข่), rice porridge', portion: '1 bowl',
    items: [['rice', RICE, 120], ['pork balls', PORK_MINCE, 50], ['egg', EGG, 50], ['ginger', GALANGAL, 5], ['soy sauce', SOY, 5], ['water', WATER, 200]],
  },
  {
    id: 'mango-sticky-rice', name: 'Mango sticky rice (ข้าวเหนียวมะม่วง)', portion: '1 plate',
    items: [['sticky rice', 'Rice, white, glutinous, unenriched, cooked', 120], ['coconut milk', COCONUT, 50], ['sugar', SUGAR, 20], ['mango', 'Mangos, raw', 150]],
  },
  {
    id: 'khao-kha-moo', name: 'Khao kha moo (ข้าวขาหมู), stewed pork leg rice', portion: '1 plate',
    items: [['rice', RICE, 200], ['pork leg', 'Pork, fresh, leg (ham), whole, separable lean and fat, cooked, roasted', 120], ['egg', 'Egg, whole, cooked, hard-boiled', 50],
      ['soy sauce', SOY, 15], ['sugar', SUGAR, 10], ['Chinese kale', KALE, 40]],
  },
  {
    id: 'pad-see-ew', name: 'Pad see ew with pork (ผัดซีอิ๊วหมู)', portion: '1 plate',
    items: [['wide rice noodles', RICE_NOODLES, 200], ['pork', PORK_MINCE, 60], ['egg', EGG, 50], ['Chinese kale', KALE, 60], ['oil', OIL, 15],
      ['soy sauce', SOY, 15], ['oyster sauce', OYSTER, 5], ['sugar', SUGAR, 5]],
  },
  {
    id: 'moo-satay', name: 'Moo satay (หมูสะเต๊ะ) with peanut sauce', portion: '5 sticks',
    items: [['grilled pork', PORK_GRILLED, 100], ['coconut milk', COCONUT, 35], ['curry spices', 'Spices, curry powder', 2], ['sugar', SUGAR, 10],
      ['peanut butter', 'Peanut butter, smooth style, with salt', 15], ['cucumber', 'Cucumber, with peel, raw', 30]],
  },
  {
    id: 'moo-ping', name: 'Moo ping (หมูปิ้ง), grilled pork stick', portion: '1 stick',
    items: [['grilled pork', PORK_GRILLED, 30], ['sugar', SUGAR, 3], ['coconut milk', COCONUT, 3], ['soy sauce', SOY, 3], ['garlic', GARLIC, 2], ['oil', OIL, 1]],
  },
  {
    id: 'larb-moo', name: 'Larb moo (ลาบหมู), spicy minced pork salad', portion: '1 plate',
    items: [['minced pork', PORK_MINCE, 100], ['toasted rice powder', 'Rice flour, white, unenriched', 10], ['shallot', SHALLOT, 15],
      ['cilantro', 'Coriander (cilantro) leaves, raw', 5], ['chili', CHILI, 3], ['lime juice', LIME, 15], ['fish sauce', FISH_SAUCE, 10], ['sugar', SUGAR, 2]],
  },
  {
    id: 'kai-jeow', name: 'Kai jeow (ไข่เจียว), Thai omelette', portion: '1 omelette (2 eggs)',
    items: [['eggs', EGG, 100], ['frying oil', OIL, 15], ['fish sauce', FISH_SAUCE, 5]],
  },
  {
    id: 'yam-woon-sen', name: 'Yam woon sen (ยำวุ้นเส้น), glass noodle salad', portion: '1 plate',
    items: [['glass noodles (dry)', 'Noodles, chinese, cellophane or long rice (mung beans), dehydrated', 25], ['water soaked in', WATER, 75],
      ['shrimp', SHRIMP, 40], ['minced pork', PORK_MINCE, 30], ['onion', 'Onions, raw', 20], ['tomato', 'Tomatoes, red, ripe, raw, year round average', 20],
      ['celery', 'Celery, raw', 10], ['lime juice', LIME, 15], ['fish sauce', FISH_SAUCE, 10], ['sugar', SUGAR, 5], ['chili', CHILI, 3]],
  },
  {
    id: 'pad-pak-boong', name: 'Pad pak boong (ผัดผักบุ้งไฟแดง), stir-fried morning glory', portion: '1 plate',
    items: [['morning glory (as spinach)', 'Spinach, raw', 150], ['oil', OIL, 15], ['oyster sauce', OYSTER, 10], ['soy sauce', SOY, 5], ['garlic', GARLIC, 8],
      ['chili', CHILI, 3], ['sugar', SUGAR, 3]],
  },
  {
    id: 'cha-yen', name: 'Thai iced tea (ชาเย็น)', portion: '1 glass',
    items: [['black tea', 'Beverages, tea, black, brewed, prepared with tap water', 200], ['condensed milk', CONDENSED, 30], ['evaporated milk', EVAPORATED, 30],
      ['sugar', SUGAR, 15]],
  },
  {
    id: 'kafae-yen', name: 'Thai iced coffee (กาแฟเย็น)', portion: '1 glass',
    items: [['coffee', 'Beverages, coffee, brewed, prepared with tap water', 150], ['condensed milk', CONDENSED, 30], ['evaporated milk', EVAPORATED, 30],
      ['sugar', SUGAR, 10]],
  },
];
