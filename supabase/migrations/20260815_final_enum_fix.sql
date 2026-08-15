-- 🛠️ THE "FOR REAL" SIGN-UP FIX
-- This script fixes the 500 error by handling the 'type' ENUM correctly and ignoring missing metadata.

BEGIN;

-- 1. DROP ALL OLD TRIGGERS
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS tr_auth_user_created ON auth.users;

-- 2. CREATE THE RESILIENT FUNCTION
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
    user_type_val TEXT;
    raw_reg_no TEXT;
    final_reg_no NUMERIC;
BEGIN
    -- Determine the user type safely
    user_type_val := COALESCE(new.raw_user_meta_data->>'type', 'STUDENT');

    -- Extract and validate registration number
    raw_reg_no := new.raw_user_meta_data->>'registration_number';
    IF raw_reg_no ~ '^[0-9]+$' THEN
        final_reg_no := raw_reg_no::numeric;
    ELSE
        final_reg_no := NULL;
    END IF;

    -- INSERT WITH DYNAMIC ENUM CASTING
    -- We use '::text::public.type_of_user' to ensure it matches the database type
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
        COALESCE(new.raw_user_meta_data->>'username', 'u_' || substr(new.id::text, 1, 8)),
        user_type_val::text::public.type_of_user, -- 🔥 CRITICAL: ENUM CASTING
        final_reg_no,
        CASE WHEN (new.raw_user_meta_data->>'phone_number') ~ '^[0-9]+$' THEN (new.raw_user_meta_data->>'phone_number')::numeric ELSE NULL END,
        new.raw_user_meta_data->>'course',
        new.raw_user_meta_data->>'date_of_birth'
    );

    RETURN new;

EXCEPTION WHEN OTHERS THEN
    -- THE "GIVE UP AND SAVE MINIMAL" FALLBACK
    -- If the above fails (e.g. invalid enum value or unique constraint), we save just the basics
    INSERT INTO public.profiles (id, email, name, type)
    VALUES (
        new.id,
        new.email,
        COALESCE(new.raw_user_meta_data->>'name', 'New User'),
        'STUDENT'::text::public.type_of_user
    )
    ON CONFLICT (id) DO NOTHING;

    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. RE-ENABLE TRIGGER
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

COMMIT;
