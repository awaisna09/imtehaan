-- Create a function to handle new user creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Log the incoming data
  RAISE LOG 'Trigger function called for user: %', NEW.id;
  RAISE LOG 'User metadata: %', NEW.raw_user_meta_data;
  
  -- Extract full_name from metadata
  DECLARE
    full_name TEXT;
  BEGIN
    full_name := NEW.raw_user_meta_data->>'full_name';
    
    -- Log the extracted values
    RAISE LOG 'Extracted full_name: %', full_name;
    RAISE LOG 'User email: %', NEW.email;
    
    -- Insert into profiles table
    INSERT INTO profiles (id, full_name, email)
    VALUES (
      NEW.id,
      full_name,
      NEW.email
    );
    
    RAISE LOG 'Profile created successfully for user: %', NEW.id;
  EXCEPTION
    WHEN OTHERS THEN
      -- Log any errors
      RAISE LOG 'Error creating profile: %', SQLERRM;
      RAISE;
  END;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a trigger to call the function when a new user is created
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user(); 