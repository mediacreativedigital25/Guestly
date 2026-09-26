-- ============================================================
-- GUESTLY FULL COMPATIBILITY MIGRATION SCRIPT FOR SUPABASE
-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard/project/ryixdkgfunuhwxwiivyh/sql)
-- ============================================================

-- 1. Enable UUID Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Ensure Users Table has all required columns
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  role TEXT DEFAULT 'client' CHECK (role IN ('superadmin', 'partner', 'client', 'reseller', 'staff', 'admin')),
  partner_id UUID REFERENCES public.users(id),
  client_id TEXT,
  business_name TEXT,
  brand_name TEXT,
  brand_logo TEXT,
  phone TEXT,
  fonnte_token TEXT,
  event_quota INTEGER DEFAULT 5,
  guest_quota INTEGER DEFAULT 500,
  client_quota INTEGER DEFAULT 10,
  event_credit INTEGER DEFAULT 0,
  client_credit INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Alter existing users table if columns are missing
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS business_name TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS brand_name TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS brand_logo TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS fonnte_token TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS event_quota INTEGER DEFAULT 5;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS guest_quota INTEGER DEFAULT 500;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS client_quota INTEGER DEFAULT 10;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS event_credit INTEGER DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS client_credit INTEGER DEFAULT 0;

-- 3. Ensure Events Table has all Guestly features
CREATE TABLE IF NOT EXISTS public.events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  couple_name TEXT,
  slug TEXT,
  partner_id UUID,
  client_id UUID,
  date TEXT,
  time TEXT,
  location TEXT,
  theme TEXT,
  rsvp_theme TEXT DEFAULT 'default',
  cover_image TEXT,
  thumbnail_url TEXT,
  frame_overlay_url TEXT,
  digital_invite_link TEXT,
  invitation_url TEXT,
  status TEXT DEFAULT 'published',
  sessions JSONB DEFAULT '[]'::jsonb,
  guest_categories JSONB DEFAULT '["VIP", "Keluarga", "Reguler"]'::jsonb,
  souvenir_types JSONB DEFAULT '[]'::jsonb,
  settings JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Alter existing events table if columns are missing
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS couple_name TEXT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS rsvp_theme TEXT DEFAULT 'default';
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS frame_overlay_url TEXT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS digital_invite_link TEXT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS invitation_url TEXT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS sessions JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS guest_categories JSONB DEFAULT '["VIP", "Keluarga", "Reguler"]'::jsonb;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS souvenir_types JSONB DEFAULT '[]'::jsonb;

-- 4. Ensure Guests Table has all Scanner, RSVP & Souvenir columns
CREATE TABLE IF NOT EXISTS public.guests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL,
  ticket_code TEXT,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  category TEXT DEFAULT 'Reguler',
  seat TEXT,
  pax INTEGER DEFAULT 1,
  session TEXT,
  status TEXT DEFAULT 'pending',
  rsvp_status TEXT DEFAULT 'pending',
  attended BOOLEAN DEFAULT false,
  check_in_time TIMESTAMPTZ,
  check_in_staff TEXT,
  souvenir_taken BOOLEAN DEFAULT false,
  souvenir_type TEXT,
  souvenir_time TIMESTAMPTZ,
  wishes TEXT,
  sticker_url TEXT,
  qr_code TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Alter existing guests table if columns are missing
ALTER TABLE public.guests ADD COLUMN IF NOT EXISTS ticket_code TEXT;
ALTER TABLE public.guests ADD COLUMN IF NOT EXISTS session TEXT;
ALTER TABLE public.guests ADD COLUMN IF NOT EXISTS rsvp_status TEXT DEFAULT 'pending';
ALTER TABLE public.guests ADD COLUMN IF NOT EXISTS attended BOOLEAN DEFAULT false;
ALTER TABLE public.guests ADD COLUMN IF NOT EXISTS check_in_staff TEXT;
ALTER TABLE public.guests ADD COLUMN IF NOT EXISTS souvenir_taken BOOLEAN DEFAULT false;
ALTER TABLE public.guests ADD COLUMN IF NOT EXISTS souvenir_type TEXT;
ALTER TABLE public.guests ADD COLUMN IF NOT EXISTS souvenir_time TIMESTAMPTZ;
ALTER TABLE public.guests ADD COLUMN IF NOT EXISTS wishes TEXT;
ALTER TABLE public.guests ADD COLUMN IF NOT EXISTS sticker_url TEXT;

-- Index for ultra-fast check-in scan by ticket_code
CREATE INDEX IF NOT EXISTS idx_guests_event_ticket ON public.guests (event_id, ticket_code);

-- 5. Enable Realtime on tables for live Scanner & Greeting Screen
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'guests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.guests;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.events;
  END IF;
END $$;

-- 6. Open RLS for Client & Public RSVP queries
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow All Guests" ON public.guests;
CREATE POLICY "Allow All Guests" ON public.guests FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow All Events" ON public.events;
CREATE POLICY "Allow All Events" ON public.events FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow All Users" ON public.users;
CREATE POLICY "Allow All Users" ON public.users FOR ALL USING (true) WITH CHECK (true);

-- Reload Schema Cache
NOTIFY pgrst, 'reload schema';
