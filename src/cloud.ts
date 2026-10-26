// Accounts and diary sync through Supabase. Each user has one row holding their whole diary;
// row-level security in the database lets a signed-in user read and write only their own row.
import { createClient } from '@supabase/supabase-js';
import type { Data } from './store';

// Public by design: the database rules, not these values, keep diaries private.
const SUPABASE_URL = 'https://hwexhptcjalomrpwlwhy.supabase.co';
const SUPABASE_KEY = 'sb_publishable_WDf3bVAmBt4gEVVzi78_cw_vpvMWU6_';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export async function fetchDiary(userId: string): Promise<Data | null> {
  const { data, error } = await supabase.from('diaries').select('data').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return (data?.data as Data | undefined) ?? null;
}

export async function pushDiary(userId: string, diary: Data): Promise<void> {
  const { error } = await supabase.from('diaries').upsert({ user_id: userId, data: diary, updated_at: new Date().toISOString() });
  if (error) throw error;
}
