const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const winston = require('winston');
const NodeCache = require('node-cache');
const path = require('path');

// Configure logger
const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'development' ? 'debug' : 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
    new winston.transports.Console({
      format: winston.format.simple(),
    }),
  ],
});

// Load environment variables
dotenv.config();

// Validate required environment variables
const requiredEnvVars = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'PORT',
  'ALLOWED_ORIGINS',
  'NODE_ENV',
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    logger.error(`Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

// Initialize cache with shorter TTL for development
const cache = new NodeCache({
  stdTTL: process.env.NODE_ENV === 'development' ? 300 : 3600, // 5 minutes for dev, 1 hour for prod
  checkperiod: 120, // Check for expired keys every 2 minutes
});

const chaptersRouter = require('./api/chapters');
const topicsRouter = require('./api/topics');

const app = express();

// Security middleware
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'", process.env.SUPABASE_URL],
      },
    },
  })
);
app.use(compression());

// Rate limiting with different limits for development and production
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'development' ? 1000 : 100, // More requests allowed in development
  message: 'Too many requests from this IP, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// CORS configuration
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGINS.split(','),
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    credentials: true,
    preflightContinue: false,
    optionsSuccessStatus: 204,
  })
);

// Parse JSON bodies with increased size limit and proper error handling
app.use(
  express.json({
    limit: '10mb',
    strict: false,
    verify: (req, res, buf, encoding) => {
      try {
        JSON.parse(buf);
      } catch (e) {
        logger.error('Invalid JSON received:', e.message);
        res.status(400).send({
          error: 'Invalid JSON',
          details: 'The request contains invalid JSON',
        });
        throw new Error('Invalid JSON');
      }
    },
  })
);

// Initialize Supabase client
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
  logger.error(
    'Error: Supabase URL or Anon Key is not set in environment variables'
  );
  process.exit(1);
}

logger.info('Initializing Supabase client with URL:', process.env.SUPABASE_URL);
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
    global: {
      fetch: (...args) => fetch(...args),
    },
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
  }
);

// Cache middleware with error handling
const cacheMiddleware = (duration) => {
  return (req, res, next) => {
    if (req.method !== 'GET') {
      return next();
    }

    try {
      const key = req.originalUrl;
      const cachedResponse = cache.get(key);

      if (cachedResponse) {
        logger.info('Cache hit for:', key);
        return res.json(cachedResponse);
      }

      res.originalJson = res.json;
      res.json = (body) => {
        try {
          cache.set(key, body, duration);
          res.originalJson(body);
        } catch (error) {
          logger.error('Cache set error:', error);
          res.originalJson(body);
        }
      };
      next();
    } catch (error) {
      logger.error('Cache middleware error:', error);
      next();
    }
  };
};

// Test Supabase connection with retry logic
async function testSupabaseConnection(retries = 3) {
  logger.info('Testing Supabase connection...');
  for (let i = 0; i < retries; i++) {
    try {
      const startTime = Date.now();
      const { data, error } = await supabase.auth.getSession();
      const duration = Date.now() - startTime;

      if (error) {
        logger.error(
          `Supabase connection test failed (attempt ${i + 1}/${retries}):`,
          error
        );
        if (i === retries - 1) return false;
        await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)));
        continue;
      }

      logger.info(`Supabase connection test successful (${duration}ms)`);
      return true;
    } catch (error) {
      logger.error(
        `Exception testing Supabase connection (attempt ${i + 1}/${retries}):`,
        error
      );
      if (i === retries - 1) return false;
      await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
  return false;
}

// API Routes with caching and error handling
app.use('/api/chapters', cacheMiddleware(3600), chaptersRouter);
app.use('/api/topics', cacheMiddleware(3600), topicsRouter);

// Serve static files from the src/public directory
app.use(
  express.static(path.join(__dirname, 'src', 'public'), {
    index: false,
    setHeaders: (res, path) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
    },
  })
);

// Serve views from the src/views directory
app.set('views', path.join(__dirname, 'src', 'views'));
app.set('view engine', 'html');

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Main interface route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Error:', {
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    path: req.path,
    method: req.method,
    ip: req.ip,
  });

  res.status(err.status || 500).json({
    error: 'Internal Server Error',
    message:
      process.env.NODE_ENV === 'development'
        ? err.message
        : 'An error occurred',
  });
});

// Start the server
const PORT = process.env.PORT || 5500;
const server = app
  .listen(PORT, () => {
    logger.info(`Server is running on port ${PORT}`);
    logger.info(`Access the application at http://localhost:${PORT}`);
  })
  .on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      logger.error(
        `Port ${PORT} is already in use. Please choose a different port.`
      );
    } else {
      logger.error('Server error:', err);
    }
    process.exit(1);
  });

// Graceful shutdown function
function shutdown(signal) {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);
  // Close database connections, stop accepting new requests, etc.
  process.exit(0);
}

// Handle process signals
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Temporary test route for profile insertion
app.post('/test-profile', async (req, res) => {
  res.status(400).json({
    error: 'This endpoint is deprecated',
    message: 'Profile management has been removed from this application',
  });
});

// Remove unnecessary test function
async function insertTestProfile() {
  console.warn('insertTestProfile function is deprecated and will be removed');
  return false;
}

// Remove unnecessary profile creation function
async function createProfileManually(userId, fullName, email) {
  console.warn(
    'createProfileManually function is deprecated and will be removed'
  );
  return { error: { message: 'This function is deprecated' } };
}

// Remove the verify-profile endpoint as it's no longer needed
app.get('/api/auth/verify-profile', async (req, res) => {
  return res.status(400).json({
    error: 'Deprecated endpoint',
    details:
      'This endpoint is no longer supported as we use direct Supabase authentication',
  });
});

// Test endpoint
app.get('/api/test', async (req, res) => {
  console.log('Test endpoint called');

  const startTime = Date.now();
  const connectionTest = await testSupabaseConnection();
  const duration = Date.now() - startTime;

  // Check environment variables
  const envStatus = {
    SUPABASE_URL: process.env.SUPABASE_URL ? 'Set' : 'Not set',
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ? 'Set' : 'Not set',
    PORT: process.env.PORT || 5500,
  };

  res.status(200).json({
    message: 'Server is working correctly',
    timestamp: new Date().toISOString(),
    serverInfo: {
      platform: process.platform,
      nodeVersion: process.version,
      uptime: Math.floor(process.uptime()) + ' seconds',
    },
    supabaseConnection: connectionTest ? 'Connected' : 'Failed',
    databaseResponseTime: `${duration}ms`,
    environment: envStatus,
  });
});

// Authentication routes
app.post('/api/auth/signup', async (req, res) => {
  console.log('=== START SIGNUP REQUEST ===');
  // Safety timeout to ensure the request doesn't hang
  const timeoutId = setTimeout(() => {
    console.error('REQUEST TIMEOUT: Signup request took too long');
    if (!res.headersSent) {
      res.setHeader('Content-Type', 'application/json');
      res.status(504).send({
        error: 'Request timeout',
        details: 'The request took too long to process. Please try again.',
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
      res.setHeader('Content-Type', 'application/json');
      return res.status(503).send({
        error: 'Service unavailable',
        details: 'Unable to connect to the database. Please try again later.',
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
      res.setHeader('Content-Type', 'application/json');
      return res.status(400).send({
        error: 'Missing required fields',
        details: 'Email, password, and full name are required',
      });
    }

    // Workaround for Supabase email validation issues
    // First check if the email format is reasonable
    if (!validateEmailFormat(email)) {
      console.error('Email format validation failed:', email);
      clearTimeout(timeoutId);
      res.setHeader('Content-Type', 'application/json');
      return res.status(400).send({
        error: 'Invalid email format',
        details:
          'Please provide a valid email address with a known domain (like gmail.com, outlook.com, etc.)',
      });
    }

    console.log('Email validation passed');

    // Sign up the user
    console.log('5. Creating auth user...');
    const authResponse = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
        emailRedirectTo: `${req.protocol}://${req.get('host')}/dashboard.html`,
      },
    });

    const { data: authData, error: authError } = authResponse;

    console.log(
      '6. Auth response:',
      authData ? 'Received auth data' : 'No auth data'
    );
    if (authError) {
      console.error('DETAILED AUTH ERROR:', JSON.stringify(authError, null, 2));
    }
    console.log('Auth data:', JSON.stringify(authData, null, 2));

    console.log(
      '6. Auth response:',
      authData ? 'Received auth data' : 'No auth data',
      authError ? `Error: ${authError.message}` : 'No error'
    );

    if (authError) {
      console.error('7. Auth error during signup:', authError);
      clearTimeout(timeoutId);
      res.setHeader('Content-Type', 'application/json');

      // Check for rate limit error messages with various phrasings
      if (
        authError.message &&
        (authError.message.includes('rate limit exceeded') ||
          authError.message.includes('email rate limit') ||
          (authError.message.toLowerCase().includes('rate') &&
            authError.message.toLowerCase().includes('limit')))
      ) {
        return res.status(429).send({
          error: 'Rate limit exceeded',
          details:
            'Too many signup attempts. Please wait 15-30 minutes before trying again or try with a different email address.',
          code: 'RATE_LIMIT_EXCEEDED',
        });
      }

      if (
        authError.message &&
        authError.message.includes('User already registered')
      ) {
        return res.status(400).send({
          error: 'User already exists',
          details:
            'An account with this email already exists. Please try logging in instead.',
        });
      }

      return res.status(400).send({
        error: 'Signup failed',
        details: authError.message || 'Authentication failed',
      });
    }

    if (!authData || !authData.user) {
      console.error('8. No user data returned from signup');
      clearTimeout(timeoutId);
      res.setHeader('Content-Type', 'application/json');
      return res.status(500).send({
        error: 'Signup failed',
        details: 'No user data returned from authentication service',
      });
    }

    console.log('9. Auth user created:', authData.user.id);

    // Skip creating profile - simplify signup process to avoid potential issues
    console.log('10. Skipping profile creation - using auth metadata only');

    // Return success response
    const successResponse = {
      success: true,
      message: 'Signup successful',
      requiresEmailConfirmation: false,
      user: {
        email: authData.user.email,
        id: authData.user.id,
        fullName: fullName, // Include this directly from the request
      },
    };

    console.log('11. Sending response:', successResponse);
    clearTimeout(timeoutId);

    // Send response with explicit content type and CORS headers
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization'
    );
    res.setHeader('Access-Control-Expose-Headers', 'Content-Type');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    return res.status(200).send(successResponse);
  } catch (error) {
    console.error('12. Unexpected error during signup:', error);
    console.error('Error stack:', error.stack);
    clearTimeout(timeoutId);

    // Send error response with explicit content type
    res.setHeader('Content-Type', 'application/json');
    return res.status(500).send({
      error: 'Unexpected error',
      details:
        error.message ||
        'An unexpected error occurred during signup. Please try again.',
    });
  } finally {
    console.log('=== END SIGNUP REQUEST ===');
  }
});

app.post('/api/auth/signin', async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log('\n=== Starting Login Process ===');
    console.log('Attempting signin for:', email);

    // Skip profiles table check and go directly to auth
    console.log('1. Attempting direct auth signin...');
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      console.error('❌ Auth signin error:', {
        message: error.message,
        status: error.status,
        name: error.name,
      });

      // Simplified error handling
      return res.status(401).json({
        error: 'Login failed',
        details:
          error.message || 'Invalid email or password. Please try again.',
      });
    }

    if (!data || !data.user) {
      return res.status(401).json({
        error: 'Login failed',
        details: 'Authentication succeeded but no user data returned.',
      });
    }

    console.log('✅ Login successful for user:', data.user.id);

    // Get user metadata from auth user object
    const fullName = data.user.user_metadata?.full_name || '';

    res.status(200).json({
      message: 'Login successful',
      user: {
        id: data.user.id,
        email: data.user.email,
        full_name: fullName,
      },
      redirectTo: '/dashboard.html',
    });
  } catch (error) {
    console.error('❌ Unexpected error during signin:', error);
    res.status(500).json({
      error: 'Login failed',
      details: 'An unexpected error occurred. Please try again.',
    });
  }
});

app.post('/api/auth/signout', async (req, res) => {
  try {
    const { error } = await supabase.auth.signOut();

    if (error) throw error;

    res.status(200).json({ message: 'Signout successful' });
  } catch (error) {
    console.error('Error during signout:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/auth/user', async (req, res) => {
  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error) throw error;

    if (!user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    res.status(200).json({ user });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: error.message });
  }
});

// Helper function to validate email format before sending to Supabase
function validateEmailFormat(email) {
  // Basic email format validation
  const basicEmailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!basicEmailRegex.test(email)) {
    console.log(`Email failed basic regex check: ${email}`);
    return false;
  }

  // Extract domain
  const domain = email.split('@')[1].toLowerCase();

  // List of common email domains
  const commonDomains = [
    'gmail.com',
    'yahoo.com',
    'outlook.com',
    'hotmail.com',
    'aol.com',
    'icloud.com',
    'mail.com',
    'protonmail.com',
    'me.com',
    'live.com',
    'msn.com',
    'yandex.com',
    'gmx.com',
    'zoho.com',
    'mail.ru',
  ];

  // Check if domain is in common list
  if (commonDomains.includes(domain)) {
    console.log(`Email domain is in common list: ${domain}`);
    return true;
  }

  // Check for valid TLDs
  const validTLDs = [
    '.com',
    '.edu',
    '.org',
    '.gov',
    '.net',
    '.io',
    '.co',
    '.app',
  ];

  for (const tld of validTLDs) {
    if (domain.endsWith(tld)) {
      console.log(`Email domain has valid TLD: ${domain} (${tld})`);
      return true;
    }
  }

  console.log(`Email domain failed all checks: ${domain}`);
  return false;
}

// Add a dedicated test endpoint for Supabase auth
app.get('/api/test-auth', async (req, res) => {
  console.log('Testing Supabase Auth connection...');

  // Set CORS headers explicitly for this endpoint
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, Accept'
  );

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(204).send();
  }

  try {
    // Test basic connection
    const connectionStart = Date.now();
    const { data: sessionData, error: sessionError } =
      await supabase.auth.getSession();
    const connectionTime = Date.now() - connectionStart;

    if (sessionError) {
      console.error('Auth session check failed:', sessionError);
      return res.status(500).json({
        success: false,
        error: 'Auth session check failed',
        details: sessionError.message,
        connectionTime: `${connectionTime}ms`,
      });
    }

    // Test signup capabilities with a random email (will fail but tests the API)
    const testEmail = `test.${Date.now()}@example.com`;
    const testPassword = 'Password123!';

    const signupStart = Date.now();
    const { data: signupData, error: signupError } = await supabase.auth.signUp(
      {
        email: testEmail,
        password: testPassword,
        options: {
          data: { test: true },
        },
      }
    );
    const signupTime = Date.now() - signupStart;

    // Return comprehensive test results
    return res.status(200).json({
      success: true,
      connection: {
        status: 'Connected to Supabase Auth',
        time: `${connectionTime}ms`,
      },
      signup: {
        status: signupError
          ? 'Error (expected for test email)'
          : 'Success (unexpected)',
        time: `${signupTime}ms`,
        error: signupError ? signupError.message : null,
        // If we include sensitive data in signupData, we would need to filter it
        data: signupData ? 'Data received' : 'No data',
      },
      supabaseUrl: process.env.SUPABASE_URL,
      authEnabled: true,
    });
  } catch (error) {
    console.error('Unexpected error during auth test:', error);
    // Ensure we always return JSON, never HTML
    return res.status(500).json({
      success: false,
      error: 'Test failed',
      details: error.message || 'Unknown error',
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
});
