-- Create a function to create the profiles table if it doesn't exist
CREATE OR REPLACE FUNCTION create_profiles_table()
RETURNS void AS $$
BEGIN
    -- Check if the profiles table exists
    IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'profiles') THEN
        -- Create profiles table
        CREATE TABLE public.profiles (
            id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
            full_name TEXT,
            email TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        -- Enable Row Level Security
        ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

        -- Create policies
        CREATE POLICY "Public profiles are viewable by everyone"
            ON public.profiles FOR SELECT
            USING (true);

        CREATE POLICY "Users can insert their own profile"
            ON public.profiles FOR INSERT
            WITH CHECK (auth.uid() = id);

        CREATE POLICY "Users can update their own profile"
            ON public.profiles FOR UPDATE
            USING (auth.uid() = id);

        -- Grant necessary permissions
        GRANT USAGE ON SCHEMA public TO anon, authenticated;
        GRANT ALL ON public.profiles TO anon, authenticated;
        GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER; 