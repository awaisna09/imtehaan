import { createClient } from '@supabase/supabase-js';
const supabaseUrl = 'https://mwhtclxabiraowerfmkz.supabase.co',
  supabaseKey =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im13aHRjbHhhYmlyYW93ZXJmbWt6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDA3MDY2MjksImV4cCI6MjA1NjI4MjYyOX0.jwnn4sR78xx08p-8V8d-gSU9EHCjPPnT376Vt9KDO3Q',
  supabase = createClient(supabaseUrl, supabaseKey);
async function fetchUserProfile() {
  const e = document.getElementById('username');
  if (e)
    try {
      const t = localStorage.getItem('user');
      if (!t) return;
      const a = JSON.parse(t);
      if (a.full_name) return void (e.textContent = a.full_name);
      const s = a.email,
        { data: n, error: r } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('email', s)
          .single();
      if (r) return;
      n && n.full_name && (e.textContent = n.full_name);
    } catch (e) {}
}
export { fetchUserProfile };
