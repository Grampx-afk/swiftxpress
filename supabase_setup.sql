-- SwiftXpress — Supabase Table Setup
-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard/project/_/sql)

-- 1. Create the 'orders' table
create table public.orders (
  id bigint generated always as identity primary key, -- Auto-incrementing sequential ID (001, 002...)
  created_at timestamptz default now(),  -- Automatic timestamp
  name text not null,                    -- Customer name
  phone text not null,                   -- Customer phone
  item text not null,                    -- Order description
  pickup text not null,                  -- Pickup location
  dropoff text not null,                 -- Delivery location
  type text not null,                    -- 'inside' or 'outside'
  fee text not null,                     -- Price string (e.g. '₦700')
  time text not null,                    -- Display time string from frontend
  status text default 'pending',          -- 'pending', 'paid', 'assigned', 'delivered'
  order_number text,                      -- Randomly generated order number (e.g. '829341')
  paystack_ref text                       -- Paystack transaction reference (set on verified payment)
);

-- 2. Enable Row Level Security (RLS)
alter table public.orders enable row level security;

-- 3. Create Policy: Allow anyone to place an order (Insert)
create policy "Allow public insert"
  on public.orders for insert
  with check (true);

-- 4. Create Policy: Allow anyone to read and update orders (for Admin Panel)
-- In a production environment, you should link this to Supabase Auth
-- and check for 'authenticated' role.
create policy "Allow public read and update"
  on public.orders for all
  using (true);

-- 5. Enable Real-time (Optional, but recommended for live tracking)
-- alter publication supabase_realtime add table public.orders;

-- 6. If your orders table already exists, just add the paystack_ref column:
-- alter table public.orders add column if not exists paystack_ref text;

-- ─────────────────────────────────────────────
-- 7. Create the 'settings' table
--    Stores admin-configurable values (delivery fee, WA number, etc.)
--    so ALL browsers read the same live values.
-- ─────────────────────────────────────────────
create table if not exists public.settings (
  key text primary key,   -- e.g. 'delivery_fee', 'wa_number'
  value text not null     -- e.g. '500', '2349023413227'
);

-- Seed default values
insert into public.settings (key, value)
values
  ('delivery_fee', '700'),
  ('wa_number',    '2349023413227')
on conflict (key) do nothing;

-- RLS: allow public read; only service role (admin) can write
alter table public.settings enable row level security;

create policy "Allow public read settings"
  on public.settings for select
  using (true);

create policy "Allow public update settings"
  on public.settings for update
  using (true);

create policy "Allow public insert settings"
  on public.settings for insert
  with check (true);
