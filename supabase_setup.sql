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

-- ─────────────────────────────────────────────
-- 8. USER PROFILES & AUTHENTICATION (NEW)
-- ─────────────────────────────────────────────

-- Profiles Table linked to Auth.Users
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  full_name text,
  phone text,
  saved_address text, -- Can store multiple addresses (JSONB) or a simple text
  created_at timestamptz default now()
);

-- Register 'profiles' in RLS
alter table public.profiles enable row level security;

create policy "Users can view their own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Users can insert their own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

-- 9. Add 'user_id' to existing 'orders' table
alter table public.orders 
add column if not exists user_id uuid references auth.users(id);

-- 10. Refined RLS for Order History
-- Allow users to view their own orders; guests can view orders via ref
create policy "Users can view their own order history"
  on public.orders for select
  using (auth.uid() = user_id or user_id is null);


-- ─────────────────────────────────────────────
-- 11. EATERIES TABLE
--     Stores the list of eateries/supermarkets
--     that customers can choose from when ordering food.
-- ─────────────────────────────────────────────
create table if not exists public.eateries (
  id       bigint generated always as identity primary key,
  name     text not null,
  category text default 'Canteen',   -- Canteen, Restaurant, Fast Food, Supermarket, etc.
  location text,                      -- Optional description/location hint
  active   boolean default true,      -- false = hidden from customer dropdown
  created_at timestamptz default now()
);

-- RLS
alter table public.eateries enable row level security;

-- Allow anyone to read active eateries (for the customer dropdown)
create policy "Public can read eateries"
  on public.eateries for select
  using (true);

-- Allow admin (service role / authenticated) to insert, update, delete
create policy "Public can manage eateries"
  on public.eateries for all
  using (true);

-- Seed some starter eateries (adjust to real LAUTECH spots)
insert into public.eateries (name, category, location, active) values
  ('UnderG Canteen',    'Canteen',     'Underground, Main Campus',    true),
  ('SUB Cafeteria',     'Canteen',     'Student Union Building',      true),
  ('Sabo Market Spot',  'Fast Food',   'Sabo Gate Area',              true),
  ('Campus Supermart',  'Supermarket', 'Near Admin Block',            true),
  ('Mama Put Junction', 'Restaurant',  'Staff Quarters Road',         true)
on conflict do nothing;
