// Initialize Supabase client
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mwhtclxabiraowerfmkz.supabase.co';
const supabaseKey =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im13aHRjbHhhYmlyYW93ZXJmbWt6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDA3MDY2MjksImV4cCI6MjA1NjI4MjYyOX0.jwnn4sR78xx08p-8V8d-gSU9EHCjPPnT376Vt9KDO3Q';
const supabase = createClient(supabaseUrl, supabaseKey);

// Function to fetch user profile
async function fetchUserProfile() {
  console.log('\n=== Starting Profile Fetch Process ===');

  // Get the username element
  const usernameElement = document.getElementById('username');
  if (!usernameElement) {
    console.error('❌ Username element not found in DOM');
    return;
  }
  console.log('✅ Found username element in DOM');

  try {
    // Get email from localStorage (set during login)
    console.log('\nStep 1: Checking localStorage for user data...');
    const userData = localStorage.getItem('user');
    if (!userData) {
      console.error('❌ No user data found in localStorage');
      return;
    }

    const user = JSON.parse(userData);
    console.log('User data from localStorage:', user);

    // Check if full_name is already in localStorage
    if (user.full_name) {
      console.log('✅ Found full_name in localStorage:', user.full_name);
      console.log('Updating username display...');
      usernameElement.textContent = user.full_name;
      console.log('✅ Username updated successfully to:', user.full_name);
      return;
    }

    const userEmail = user.email;
    console.log('✅ Found user email in localStorage:', userEmail);

    // Query Supabase profiles table
    console.log('\nStep 2: Querying Supabase profiles table...');
    console.log('Looking for profile with email:', userEmail);

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('email', userEmail)
      .single();

    if (error) {
      console.error('❌ Error fetching profile:', error);
      return;
    }

    if (profile && profile.full_name) {
      console.log('✅ Found profile with full_name:', profile.full_name);
      console.log('Updating username display...');
      usernameElement.textContent = profile.full_name;
      console.log('✅ Username updated successfully to:', profile.full_name);
    } else {
      console.log('⚠️ No full_name found for email:', userEmail);
    }
  } catch (error) {
    console.error('❌ Error in fetchUserProfile:', error);
  }

  console.log('=== Profile Fetch Process Complete ===\n');
}

// Export the function
export { fetchUserProfile };
