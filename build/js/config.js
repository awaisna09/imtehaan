// Configuration file for the application
const config = {
  supabase: {
    url: 'https://mwhtclxabiraowerfmkz.supabase.co',
    key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im13aHRjbHhhYmlyYW93ZXJmbWt6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDA3MDY2MjksImV4cCI6MjA1NjI4MjYyOX0.jwnn4sR78xx08p-8V8d-gSU9EHCjPPnT376Vt9KDO3Q',
  },
  cache: {
    ttl: 3600000, // 1 hour in milliseconds
    maxSize: 100, // Maximum number of items to cache
  },
  notes: {
    autoSaveDelay: 2000, // 2 seconds
    maxLength: {
      quick: 500,
      detailed: 5000,
    },
  },
};

export default config;
