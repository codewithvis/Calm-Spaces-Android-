-- FIX: Registration Flow & Profile Trigger (Hardened)
-- This migration ensures that profiles are created automatically without casting errors.

-- 1. Create or Update handle_new_user function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
    INSERT INTO public.profiles (
        id,
        email,
        name,
        username,
        type,
        registration_number,
        phone_number,
        course,
        date_of_birth
    )
    VALUES (
        new.id,
        new.email,
        COALESCE(new.raw_user_meta_data->>'name', 'User'),
        COALESCE(new.raw_user_meta_data->>'username', new.id::text),
        COALESCE(new.raw_user_meta_data->>'type', 'STUDENT'),
        CASE
            WHEN (new.raw_user_meta_data->>'registration_number') ~ '^[0-9]+$'
            THEN (new.raw_user_meta_data->>'registration_number')::numeric
            ELSE NULL
        END,
        CASE
            WHEN (new.raw_user_meta_data->>'phone_number') ~ '^[0-9]+$'
            THEN (new.raw_user_meta_data->>'phone_number')::numeric
            ELSE NULL
        END,
        new.raw_user_meta_data->>'course',
        new.raw_user_meta_data->>'date_of_birth'
    );
    RETURN new;
EXCEPTION WHEN OTHERS THEN
    -- Fallback: Create minimal profile if full creation fails
    -- This prevents sign-up from blocking due to metadata issues
    INSERT INTO public.profiles (id, email, name, type)
    VALUES (new.id, new.email, COALESCE(new.raw_user_meta_data->>'name', 'User'), 'STUDENT')
    ON CONFLICT (id) DO NOTHING;

    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Ensure trigger exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 3. Update RPCs for uniqueness checks with SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.check_username_exists(username_to_check TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE username = username_to_check
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.check_registration_exists(reg_to_check NUMERIC)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE registration_number = reg_to_check
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
