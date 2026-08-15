-- 🚨 FIXING AUTH USER CREATION 500 ERROR
-- The issue is a conflict between existing data/types in public.profiles and new user creation.

BEGIN;

-- 1. DROP ALL TRIGGERS from auth.users (Very important to stop the cycle)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS tr_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS create_profile_on_signup ON auth.users;
DROP TRIGGER IF EXISTS handle_new_user_trigger ON auth.users;

-- 2. CREATE A COMPLETELY ISOLATED FUNCTION
CREATE OR REPLACE FUNCTION public.handle_new_user_v2()
RETURNS trigger AS $$
BEGIN
  -- Insert into public.profiles using as little logic as possible to avoid 500 errors
  -- We cast everything to text first then to target type
  INSERT INTO public.profiles (id, email, name, type)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'name', 'User'),
    'STUDENT'::text::public.type_of_user
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. LINK IT
CREATE TRIGGER on_auth_user_created_v2
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user_v2();

-- 4. ENSURE Profiles table is actually ready for new ID
-- Sometimes if RLS is on but no policy for service_role/owner, trigger fails.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

COMMIT;
