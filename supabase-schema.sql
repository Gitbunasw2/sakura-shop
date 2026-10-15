create table if not exists public.shop_state (
  id text primary key check (id = 'main'),
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.shop_state enable row level security;

grant select, insert, update on public.shop_state to authenticated;

create policy "Authenticated users can read shop state"
on public.shop_state
for select
to authenticated
using (true);

create policy "Authenticated users can create shop state"
on public.shop_state
for insert
to authenticated
with check (true);

create policy "Authenticated users can update shop state"
on public.shop_state
for update
to authenticated
using (true)
with check (true);
