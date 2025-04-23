-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Enable anonymous inserts" ON recommendations;

-- Create policy to allow anonymous inserts with proper permissions
CREATE POLICY "Enable anonymous inserts" ON recommendations
FOR INSERT TO public
WITH CHECK (true);

-- Enable RLS on the recommendations table
ALTER TABLE recommendations ENABLE ROW LEVEL SECURITY;

-- Grant necessary permissions
GRANT INSERT ON recommendations TO anon;
GRANT INSERT ON recommendations TO authenticated;
GRANT ALL ON recommendations TO service_role;