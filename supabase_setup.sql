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
