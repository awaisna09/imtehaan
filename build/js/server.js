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
const jwt = require('jsonwebtoken');

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
  'JWT_SECRET',
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
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'", process.env.SUPABASE_URL],
        fontSrc: ["'self'", 'data:', 'https:'],
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
const allowedOrigins = process.env.ALLOWED_ORIGINS.split(',');
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
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

// Serve static files from the React app's build directory
app.use(express.static(path.join(__dirname, 'my-react-app', 'build')));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// All other routes should serve the React app
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'my-react-app', 'build', 'index.html'));
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
    error: {
      message: err.message || 'Internal Server Error',
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    },
  });
});

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Authentication token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// Authentication routes
app.post('/api/v1/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const { data: { user }, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      logger.error('Login error:', error);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({ token, user: { id: user.id, email: user.email } });
  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/v1/auth/signup', async (req, res) => {
  try {
    const { email, password, name } = req.body;

    const { data: { user }, error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      logger.error('Signup error:', error);
      return res.status(400).json({ error: error.message });
    }

    // Create user profile
    const { error: profileError } = await supabase
      .from('profiles')
      .insert([{ id: user.id, full_name: name, email }]);

    if (profileError) {
      logger.error('Profile creation error:', profileError);
      return res.status(500).json({ error: 'Failed to create profile' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(201).json({ token, user: { id: user.id, email: user.email } });
  } catch (error) {
    logger.error('Signup error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/v1/auth/verify', authenticateToken, async (req, res) => {
  try {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', req.user.id)
      .single();

    if (error) {
      logger.error('Profile fetch error:', error);
      return res.status(404).json({ error: 'User profile not found' });
    }

    res.json({ user: profile });
  } catch (error) {
    logger.error('Verification error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Start the server
const PORT = process.env.PORT || 3000;
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

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    logger.info('Server closed');
  process.exit(0);
  });
});

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
