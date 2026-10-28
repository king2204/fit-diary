// Food photo -> the foods in it and about how much of each, using Claude's vision.
// Called by the app for a signed-in user. The Anthropic API key stays here as the secret ANTHROPIC_API_KEY.
// Optional secrets: FOOD_PHOTO_MODEL (default claude-opus-5-5), FOOD_PHOTO_DAILY_LIMIT (default 30 photos per person).
import Anthropic from 'npm:@anthropic-ai/sdk@1.3.0';
import { betaJSONSchemaOutputFormat } from 'npm:@anthropic-ai/sdk@1.3.0/helpers/beta/json-schema';
import { createClient } from 'npm:@supabase/supabase-js@2.117.3';
import { corsHeaders } from 'npm:@supabase/supabase-js@2.117.3/cors';

const MODEL = Deno.env.get('FOOD_PHOTO_MODEL') || 'claude-opus-5-5';
const DAILY_LIMIT = Number(Deno.env.get('FOOD_PHOTO_DAILY_LIMIT') || 30);
const MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
// The app sends a JPEG of at most 1,024 px; this leaves room without letting huge uploads through.
const MAX_BASE64 = 3_000_000;

const SCHEMA = {
  type: 'object',
  properties: {
    foods: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Short, plain name to look up in a nutrition database. Thai dishes use the usual romanized name '
              + '(e.g. "khao man gai", "pad kra pao moo", "som tam"); other foods a generic English name (e.g. "fried egg", '
              + '"white rice", "banana").',
          },
          thai_name: { type: 'string', description: 'The name in Thai script for Thai dishes and drinks; otherwise "".' },
          grams: { type: 'number', description: 'Estimated weight of the edible part in grams.' },
          portion: { type: 'string', description: 'The amount in plain words, e.g. "1 plate", "2 pieces", "1 glass".' },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
        required: ['name', 'thai_name', 'grams', 'portion', 'confidence'],
        additionalProperties: false,
      },
    },
    note: { type: 'string', description: 'One short sentence if the photo is unclear or shows no food; otherwise "".' },
  },
  required: ['foods', 'note'],
  additionalProperties: false,
} as const;

const SYSTEM = `You look at photos for a calorie diary used mostly in Thailand.
List each food and drink in the photo that someone is about to eat. A dish served as one plate counts as one item
(khao man gai is one item, not rice plus chicken), but separate dishes, sides and drinks are separate items.
Estimate grams from what you can see: a dinner plate is about 25 cm across, a rice bowl holds about 200 g of cooked
rice, a glass holds about 250 ml. Count only what is on the plate, not the bones or packaging. If the photo has no food,
return no items and say so in the note.`;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);

  // Only signed-in users of this app; their own login is used for everything below.
  const authorization = req.headers.get('Authorization') ?? '';
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user } } = await supabase.auth.getUser(authorization.replace(/^Bearer /, ''));
  if (!user) return json({ error: 'Please sign in again.' }, 401);

  const { image, media_type } = await req.json().catch(() => ({}));
  if (typeof image !== 'string' || !image || image.length > MAX_BASE64 || !MEDIA_TYPES.includes(media_type)) {
    return json({ error: 'That photo could not be read. Try another one.' }, 400);
  }

  // Count this photo first, so a stuck or repeated request still counts toward the daily limit.
  const { data: used, error: countError } = await supabase.rpc('bump_food_photo_count');
  if (countError) {
    console.error('Usage counter failed', countError);
    return json({ error: 'Photo AI is not set up yet (the usage counter is missing).' }, 500);
  }
  if (used > DAILY_LIMIT) return json({ error: `You used all ${DAILY_LIMIT} photos for today. Try again tomorrow.` }, 429);

  const anthropic = new Anthropic();
  try {
    const response = await anthropic.beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      // Identifying food is a quick task: low effort keeps it fast and cheap.
      output_config: { effort: 'low', format: betaJSONSchemaOutputFormat(SCHEMA) },
      // If a safety check declines the request, Anthropic retries it on its recommended fallback model.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type, data: image } },
          { type: 'text', text: 'What food and drinks are in this photo, and about how much of each?' },
        ],
      }],
    });
    if (response.stop_reason === 'refusal' || !response.parsed_output) {
      return json({ error: 'The AI could not read this photo. Try another one, or search instead.' }, 422);
    }
    return json({ ...response.parsed_output, used, limit: DAILY_LIMIT });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) {
      console.error('Bad ANTHROPIC_API_KEY', e.message);
      return json({ error: 'Photo AI is not set up yet (the AI key is missing or wrong).' }, 500);
    }
    if (e instanceof Anthropic.RateLimitError) return json({ error: 'The AI is busy. Try again in a minute.' }, 503);
    if (e instanceof Anthropic.APIError) {
      console.error(`Claude API error ${e.status}`, e.message);
      return json({ error: 'The AI could not answer just now. Try again later.' }, 502);
    }
    throw e;
  }
});
