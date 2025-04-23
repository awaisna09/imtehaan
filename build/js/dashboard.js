import { initializeMenu } from './menu.js';
const supabaseUrl = 'https://mwhtclxabiraowerfmkz.supabase.co',
  supabaseAnonKey =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im13aHRjbHhhYmlyYW93ZXJmbWt6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDA3MDY2MjksImV4cCI6MjA1NjI4MjYyOX0.jwnn4sR78xx08p-8V8d-gSU9EHCjPPnT376Vt9KDO3Q',
  supabase = window.supabase.createClient(supabaseUrl, supabaseAnonKey);
document.addEventListener('DOMContentLoaded', () => {
  initializeMenu();
});
