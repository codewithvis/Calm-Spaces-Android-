-- 🚨 EMERGENCY TRIGGER DISABLE
-- This script completely removes the trigger to prove if the issue is in the function or something deeper in Supabase.

BEGIN;

-- 1. KILL ALL TRIGGERS
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS tr_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS create_profile_on_signup ON auth.users;
DROP TRIGGER IF EXISTS handle_new_user_trigger ON auth.users;

-- 2. DROP THE FUNCTION
DROP FUNCTION IF EXISTS public.handle_new_user();

COMMIT;
