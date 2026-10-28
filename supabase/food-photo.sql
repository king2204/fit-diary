-- Daily photo counter for the food-photo function: one row per person per day.
-- Run once in the Supabase SQL editor.
create table if not exists public.food_photo_usage (
  user_id uuid not null references auth.users on delete cascade,
  day date not null default current_date,
  count int not null default 0,
  primary key (user_id, day)
);
-- No policies: nobody reads or writes the table directly, only the function below.
alter table public.food_photo_usage enable row level security;

-- Adds one photo for the signed-in user and returns today's total.
create or replace function public.bump_food_photo_count() returns int
language sql
security definer
set search_path = public
as $$
  insert into public.food_photo_usage (user_id, day, count) values (auth.uid(), current_date, 1)
  on conflict (user_id, day) do update set count = food_photo_usage.count + 1
  returning count;
$$;
revoke all on function public.bump_food_photo_count() from public, anon;
grant execute on function public.bump_food_photo_count() to authenticated;
