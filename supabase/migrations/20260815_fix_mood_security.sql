-- FIX: Mood Entries Security
-- This migration ensures that users can both read and insert their own mood entries.

-- 1. Enable RLS
ALTER TABLE public.mood_entries ENABLE ROW LEVEL SECURITY;

-- 2. Clear old policies
DROP POLICY IF EXISTS "Users can manage own mood entries" ON public.mood_entries;
DROP POLICY IF EXISTS "Users can read own mood entries" ON public.mood_entries;
DROP POLICY IF EXISTS "Users can insert own mood entries" ON public.mood_entries;

-- 3. Create comprehensive policy for ALL operations
CREATE POLICY "Users can manage own mood entries"
ON public.mood_entries
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 4. Ensure table has correct defaults if needed
ALTER TABLE public.mood_entries ALTER COLUMN created_at SET DEFAULT now();
