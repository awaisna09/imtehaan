-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;

-- Create new policies
-- Allow anyone to insert a profile (needed for signup)
CREATE POLICY "Anyone can insert a profile" ON profiles
FOR INSERT TO public
WITH CHECK (true);

-- Allow users to view their own profile
CREATE POLICY "Users can view their own profile" ON profiles
FOR SELECT TO public
USING (auth.uid() = id);

-- Allow users to update their own profile
CREATE POLICY "Users can update their own profile" ON profiles
FOR UPDATE TO public
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Enable RLS on the profiles table
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY; 