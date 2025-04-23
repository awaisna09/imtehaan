-- Create recommendations table if it doesn't exist
CREATE TABLE IF NOT EXISTS recommendations (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT NOT NULL,
    contact TEXT,
    remarks TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Enable Row Level Security
ALTER TABLE recommendations ENABLE ROW LEVEL SECURITY;

-- Create policy to allow public inserts
CREATE POLICY "Enable public inserts" ON recommendations
FOR INSERT TO public
WITH CHECK (true);

-- Grant necessary permissions
GRANT INSERT ON recommendations TO anon;
GRANT INSERT ON recommendations TO authenticated;
GRANT ALL ON recommendations TO service_role;