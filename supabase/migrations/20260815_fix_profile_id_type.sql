-- 🚨 CRITICAL FIX: Profile Table ID Type
-- The 500 error is likely because 'profiles.id' is not a UUID or has a mismatch with 'auth.users.id'.

BEGIN;

-- 1. Ensure profiles.id is UUID and correctly linked
DO $$
BEGIN
    -- This assumes profiles table already exists
    -- We force a re-link to auth.users with the correct cascade
    ALTER TABLE public.profiles
    DROP CONSTRAINT IF EXISTS profiles_id_fkey;

    ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_id_fkey
    FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
END $$;

-- 2. RESET THE TRIGGER TO THE FINAL STABLE VERSION
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
    INSERT INTO public.profiles (id, email, name, type)
    VALUES (
        new.id,
        new.email,
        COALESCE(new.raw_user_meta_data->>'name', 'User'),
        COALESCE(new.raw_user_meta_data->>'type', 'STUDENT')::text::public.type_of_user
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

COMMIT;
