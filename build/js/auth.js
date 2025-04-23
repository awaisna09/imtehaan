import { createClient } from '@supabase/supabase-js';
const supabaseUrl = 'https://mwhtclxabiraowerfmkz.supabase.co',
  supabaseKey =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im13aHRjbHhhYmlyYW93ZXJmbWt6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDA3MDY2MjksImV4cCI6MjA1NjI4MjYyOX0.jwnn4sR78xx08p-8V8d-gSU9EHCjPPnT376Vt9KDO3Q',
  supabase = createClient(supabaseUrl, supabaseKey);
async function signUp(r, a, t) {
  try {
    const { data: s, error: e } = await supabase.auth.signUp({
      email: r,
      password: a,
      options: { data: { full_name: t } },
    });
    if (e) throw e;
    return { data: s, error: null };
  } catch (r) {
    return { data: null, error: r };
  }
}
async function signIn(r, a) {
  try {
    const { data: t, error: s } = await supabase.auth.signInWithPassword({
      email: r,
      password: a,
    });
    if (s) throw s;
    return { data: t, error: null };
  } catch (r) {
    return { data: null, error: r };
  }
}
async function signOut() {
  try {
    const { error: r } = await supabase.auth.signOut();
    if (r) throw r;
    return { error: null };
  } catch (r) {
    return { error: r };
  }
}
async function getCurrentUser() {
  try {
    const {
      data: { user: r },
      error: a,
    } = await supabase.auth.getUser();
    if (a) throw a;
    return { user: r, error: null };
  } catch (r) {
    return { user: null, error: r };
  }
}
export { signUp, signIn, signOut, getCurrentUser };
