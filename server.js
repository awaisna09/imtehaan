const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

// Load environment variables first
dotenv.config();


const chaptersRouter = require('./api/chapters')
const topicsRouter = require('./api/topics')

// Load environment variables
dotenv.config()

console.log('Environment variables loaded:')
console.log('SUPABASE_URL:', process.env.SUPABASE_URL)
console.log('SUPABASE_ANON_KEY:', process.env.SUPABASE_ANON_KEY ? 'Set (hidden for security)' : 'Not set')
console.log('PORT:', process.env.PORT || 3000)

const app = express()

// Temporary test route for profile insertion
app.post('/test-profile', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .insert([
        {
          id: 'test_' + Date.now(),
          email: 'test@example.com',
          full_name: 'Test User',
          avatar_url: 'https://example.com/avatar.png'
        }
      ])
      .select();

    if (error) throw error;
    
    res.json({
      success: true,
      message: 'Test profile created',
      data: data[0]
    });

  } catch (error) {
    console.error('Test insertion error:', error);
    res.status(500).json({
      error: 'Insertion failed',
      details: error.message
    });
  }
});

// Middleware
app.use(cors({
    origin: '*', // Allow all origins for development
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    credentials: true
}));

// Parse JSON bodies
app.use(express.json());

// Initialize Supabase client
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    console.error('Error: Supabase URL or Anon Key is not set in environment variables')
    process.exit(1)
}

console.log('Initializing Supabase client with URL:', process.env.SUPABASE_URL)
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
    {
        auth: {
            persistSession: false
        }
    }
)
console.log('Supabase client initialized successfully')

// Test Supabase connection
async function testSupabaseConnection() {
    console.log('Testing Supabase connection...');
    try {
        // Test simple query first
        const startTime = Date.now();
        const { data, error } = await supabase.from('profiles').select('*').limit(1);
        const duration = Date.now() - startTime;
        
        if (error) {
            console.error('Supabase connection test failed:', error);
            console.error('Error details:', {
                message: error.message,
                code: error.code,
                details: error.details
            });
            return false;
        }
        
        console.log(`Supabase connection test successful (${duration}ms)`);
        console.log(`Retrieved ${data ? data.length : 0} profiles`);
        
        // Also test auth
        try {
            const { data: authData, error: authError } = await supabase.auth.getSession();
            if (authError) {
                console.warn('Auth service warning:', authError);
            } else {
                console.log('Auth service connected successfully');
            }
        } catch (authTestError) {
            console.warn('Auth service test error:', authTestError);
            // Don't fail the whole test for auth issues
        }
        
        return true;
    } catch (error) {
        console.error('Exception testing Supabase connection:', error);
        console.error('Stack trace:', error.stack);
        return false;
    }
}

// Test Supabase connection
(async () => {
    await testSupabaseConnection();
})();

async function insertTestProfile() {
    try {
        const testProfile = {
            id: 'test-id-123',
            full_name: 'Test User',
            email: 'test@example.com'
        };
        const { data, error } = await supabase.from('profiles').insert([testProfile]);
        if (error) {
            console.error('Error inserting test profile:', error);
            return false;
        }
        console.log('Test profile inserted successfully:', data);
        return true;
    } catch (error) {
        console.error('Exception inserting test profile:', error);
        return false;
    }
}



// API Routes
app.use('/api/chapters', chaptersRouter);
app.use('/api/topics', topicsRouter);

// Serve static files
app.use(express.static('.', {
    setHeaders: (res, path) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
}));

// Test endpoint
app.get('/api/test', async (req, res) => {
    console.log('Test endpoint called')
    
    const startTime = Date.now();
    const connectionTest = await testSupabaseConnection()
    const duration = Date.now() - startTime;
    
    // Check environment variables
    const envStatus = {
        SUPABASE_URL: process.env.SUPABASE_URL ? 'Set' : 'Not set',
        SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ? 'Set' : 'Not set',
        PORT: process.env.PORT || 3000
    };
    
    res.status(200).json({ 
        message: 'Server is working correctly',
        timestamp: new Date().toISOString(),
        serverInfo: {
            platform: process.platform,
            nodeVersion: process.version,
            uptime: Math.floor(process.uptime()) + ' seconds'
        },
        supabaseConnection: connectionTest ? 'Connected' : 'Failed',
        databaseResponseTime: `${duration}ms`,
        environment: envStatus
    })
})

// Helper function to create a profile manually
async function createProfileManually(userId, fullName, email) {
    console.log('Creating profile manually for user:', userId)
    
    const { data, error } = await supabase
        .from('profiles')
        .insert([
            {
                id: userId,
                full_name: fullName,
                email: email
            }
        ])
        .select()
        .single()
        
    if (error) {
        console.error('Error creating profile manually:', error)
        return { error }
    }
    
    console.log('Profile created manually:', data)
    return { data }
}

// Authentication routes
app.post('/api/auth/signup', async (req, res) => {
    console.log('=== START SIGNUP REQUEST ===');
    // Safety timeout to ensure the request doesn't hang
    const timeoutId = setTimeout(() => {
        console.error('REQUEST TIMEOUT: Signup request took too long');
        if (!res.headersSent) {
            res.status(504).json({
                error: 'Request timeout',
                details: 'The request took too long to process. Please try again.'
            });
        }
    }, 20000); // 20 second safety timeout
    
    try {
        // Test Supabase connection before proceeding
        console.log('0. Testing Supabase connection...');
        const connectionTest = await testSupabaseConnection();
        if (!connectionTest) {
            console.error('Supabase connection test failed');
            clearTimeout(timeoutId);
            return res.status(503).json({ 
                error: 'Service unavailable',
                details: 'Unable to connect to the database. Please try again later.'
            });
        }
        console.log('Supabase connection test successful');
        
        console.log('1. Received signup request');
        console.log('2. Request headers:', req.headers);
        
        // Parse request body
        const { email, password, fullName } = req.body;
        console.log('3. Request body:', { email, fullName });
        
        // Validate input
        if (!email || !password || !fullName) {
            console.log('4. Missing required fields');
            clearTimeout(timeoutId);
            return res.status(400).json({ 
                error: 'Missing required fields',
                details: 'Email, password, and full name are required'
            });
        }

        // Sign up the user
        console.log('5. Creating auth user...');
        const authResponse = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    full_name: fullName
                },
                emailRedirectTo: `${req.protocol}://${req.get('host')}/dashboard.html`
            }
        });
        
        const { data: authData, error: authError } = authResponse;

        console.log('6. Auth response:', authData ? 'Received auth data' : 'No auth data', 
                                      authError ? `Error: ${authError.message}` : 'No error');

        if (authError) {
            console.error('7. Auth error during signup:', authError);
            clearTimeout(timeoutId);
            
            if (authError.message && authError.message.includes('rate limit exceeded')) {
                return res.status(429).json({ 
                    error: 'Rate limit exceeded',
                    details: 'Too many signup attempts. Please wait 15-30 minutes before trying again.',
                    code: 'RATE_LIMIT_EXCEEDED'
                });
            }
            
            if (authError.message && authError.message.includes('User already registered')) {
                return res.status(400).json({ 
                    error: 'User already exists',
                    details: 'An account with this email already exists. Please try logging in instead.'
                });
            }
            
            return res.status(400).json({ 
                error: 'Signup failed',
                details: authError.message || 'Authentication failed'
            });
        }

        if (!authData || !authData.user) {
            console.error('8. No user data returned from signup');
            clearTimeout(timeoutId);
            return res.status(500).json({
                error: 'Signup failed',
                details: 'No user data returned from authentication service'
            });
        }

        console.log('9. Auth user created:', authData.user.id);

        // Create user profile
        console.log('10. Creating user profile...');
        const profileResponse = await supabase
            .from('profiles')
            .upsert({
                id: authData.user.id,
                email: email,
                full_name: fullName,
                created_at: new Date().toISOString()
            });

        const { error: profileError } = profileResponse;
        console.log('11. Profile creation response:', profileError ? `Error: ${profileError.message}` : 'Profile created');

        if (profileError) {
            console.error('12. Profile creation error:', profileError);
            // Continue anyway, the auth user is created
        } else {
            console.log('13. Profile created successfully');
        }

        // Return success response
        const successResponse = {
            success: true,
            message: 'Signup successful',
            requiresEmailConfirmation: false,
            user: {
                email: authData.user.email,
                id: authData.user.id
            }
        };

        console.log('14. Sending response:', successResponse);
        clearTimeout(timeoutId);
        
        // Ensure the response is sent with proper headers
        return res.status(200)
                 .header('Content-Type', 'application/json')
                 .send(JSON.stringify(successResponse));

    } catch (error) {
        console.error('15. Unexpected error during signup:', error);
        console.error('Error stack:', error.stack);
        clearTimeout(timeoutId);
        
        // Ensure an error response is always sent
        return res.status(500)
                 .header('Content-Type', 'application/json')
                 .send(JSON.stringify({ 
                     error: 'Unexpected error',
                     details: error.message || 'An unexpected error occurred during signup. Please try again.'
                 }));
    } finally {
        console.log('=== END SIGNUP REQUEST ===');
    }
});

app.post('/api/auth/signin', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        console.log('\n=== Starting Login Process ===');
        console.log('Attempting signin for:', email);

        // First check if user exists in profiles table
        console.log('1. Checking profiles table...');
        const { data: profileData, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('email', email)
            .single();

        if (profileError || !profileData) {
            console.log('❌ Profile not found in profiles table');
            return res.status(400).json({
                error: 'Account not found',
                details: 'No account found with this email. Please sign up first.'
            });
        }

        console.log('✅ Profile found:', {
            email: profileData.email,
            full_name: profileData.full_name
        });

        // Then attempt to sign in with Supabase Auth
        console.log('2. Attempting auth signin...');
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
        });

        if (error) {
            console.error('❌ Auth signin error:', {
                message: error.message,
                status: error.status,
                name: error.name
            });

            // If the error is invalid credentials but profile exists
            if (error.message === 'Invalid login credentials') {
                // Create auth user with the provided password
                console.log('3. Creating auth user for existing profile...');
                const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
                    email,
                    password,
                    options: {
                        data: {
                            full_name: profileData.full_name
                        }
                    }
                });

                if (signUpError) {
                    console.error('❌ Failed to create auth user:', signUpError);
                    return res.status(400).json({
                        error: 'Login failed',
                        details: 'Unable to set up authentication for your account. Please try again.'
                    });
                }

                console.log('✅ Auth user created successfully');
                return res.status(200).json({
                    message: 'Account setup complete',
                    user: {
                        ...profileData,
                        id: signUpData.user.id
                    },
                    redirectTo: '/dashboard.html'
                });
            }

            return res.status(401).json({
                error: 'Invalid credentials',
                details: 'Invalid email or password. Please try again.'
            });
        }

        console.log('✅ Login successful');
        res.status(200).json({
            message: 'Login successful',
            user: {
                ...data.user,
                full_name: profileData.full_name
            },
            redirectTo: '/dashboard.html'
        });
    } catch (error) {
        console.error('❌ Unexpected error during signin:', error);
        res.status(500).json({ 
            error: 'Login failed',
            details: 'An unexpected error occurred. Please try again.'
        });
    }
});

app.post('/api/auth/signout', async (req, res) => {
    try {
        const { error } = await supabase.auth.signOut()
        
        if (error) throw error

        res.status(200).json({ message: 'Signout successful' })
    } catch (error) {
        console.error('Error during signout:', error)
        res.status(500).json({ error: error.message })
    }
})

app.get('/api/auth/user', async (req, res) => {
    try {
        const { data: { user }, error } = await supabase.auth.getUser()
        
        if (error) throw error

        if (!user) {
            return res.status(401).json({ error: 'Not authenticated' })
        }

        res.status(200).json({ user })
    } catch (error) {
        console.error('Error fetching user:', error)
        res.status(500).json({ error: error.message })
    }
})

// Verify if a user exists in the profiles table
app.get('/api/auth/verify-profile', async (req, res) => {
    try {
        const { email } = req.query;

        if (!email) {
            return res.status(400).json({ 
                error: 'Email is required',
                details: 'Please provide an email address'
            });
        }

        // Check if the user exists in the profiles table
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('id, email, full_name')
            .eq('email', email)
            .single();

        if (profileError) {
            console.error('Error checking profile:', profileError);
            return res.status(404).json({ 
                error: 'User not found',
                details: 'No account found with this email address'
            });
        }

        if (!profile) {
            return res.status(404).json({ 
                error: 'User not found',
                details: 'No account found with this email address'
            });
        }

        res.json({ 
            message: 'User found',
            profile: {
                id: profile.id,
                email: profile.email,
                full_name: profile.full_name
            }
        });

    } catch (error) {
        console.error('Unexpected error during profile verification:', error);
        res.status(500).json({ 
            error: 'Unexpected error',
            details: 'An error occurred while verifying the user. Please try again.'
        });
    }
});

// Start server
const PORT = process.env.PORT || 3000
const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`)
}).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use. Please try a different port.`)
    } else {
        console.error('Error starting server:', err)
    }
    process.exit(1)
})

// Handle graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM signal received. Closing HTTP server...')
    server.close(() => {
        console.log('HTTP server closed')
        process.exit(0)
    })
})