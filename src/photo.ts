// Food photos: shrink the photo, ask the food-photo function (Claude) what is in it, and match each answer
// to a food in the built-in list for its nutrition.
import { FunctionsHttpError } from '@supabase/supabase-js';
import { searchBasicList, type BasicFoods } from './basicfoods';
import { supabase } from './cloud';
import type { Food } from './store';

export interface PhotoFood {
  name: string; // English or romanized Thai, for searching
  thai_name: string;
  grams: number;
  portion: string; // "1 plate"
  confidence: 'high' | 'medium' | 'low';
}

export interface PhotoResult {
  foods: PhotoFood[];
  note: string;
  used: number; // photos used today
  limit: number;
}

// One food found in the photo, as the user can change it before adding it to the diary.
export interface PhotoItem {
  ai: PhotoFood;
  food: Food | null; // the matched food; null when nothing matched
  grams: number;
  on: boolean;
}

// Long edge in pixels: enough to see the food, and about 1,400 image tokens at most.
const MAX_EDGE = 1024;

// The photo as a JPEG data URL, at most 1,024 px on the long edge. Browsers apply the camera's rotation when
// they draw an <img>, so the photo stays the right way up.
export async function shrinkPhoto(file: Blob): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function recognizeFood(jpegDataUrl: string): Promise<PhotoResult> {
  const { data, error } = await supabase.functions.invoke('food-photo', {
    body: { image: jpegDataUrl.slice(jpegDataUrl.indexOf(',') + 1), media_type: 'image/jpeg' },
  });
  if (error instanceof FunctionsHttpError) {
    // The function says what went wrong (daily limit, not set up, ...); a missing function has no message.
    const body = (await error.context.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? (error.context.status === 404 ? 'Photo AI is not set up yet.' : 'Photo AI failed. Try again.'));
  }
  if (error) throw new Error('Could not reach the photo AI. Check your internet connection.');
  return data as PhotoResult;
}

// Each food the AI saw, matched by name (or its Thai name) to the best food in the built-in list.
export function matchPhotoFoods(result: PhotoResult, list: BasicFoods): PhotoItem[] {
  const best = (query: string) => {
    if (!query.trim()) return null;
    const found = searchBasicList(list, query);
    return found.best[0] ?? found.rest[0] ?? null;
  };
  return result.foods.map((ai) => ({ ai, food: best(ai.name) ?? best(ai.thai_name), grams: Math.max(1, Math.round(ai.grams)), on: true }));
}
