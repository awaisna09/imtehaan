-- Disable all rate limits
UPDATE auth.config
SET 
  email_rate_limit = 0,
  email_rate_limit_period = 0,
  email_rate_limit_max = 0,
  password_reset_rate_limit = 0,
  password_reset_rate_limit_period = 0,
  password_reset_rate_limit_max = 0,
  signup_rate_limit = 0,
  signup_rate_limit_period = 0,
  signup_rate_limit_max = 0;

-- Disable email confirmation requirements
UPDATE auth.config
SET 
  enable_signup_email_confirm = false,
  enable_email_change_confirm = false;

-- Disable other restrictions
UPDATE auth.config
SET 
  enable_signup = true,
  enable_signup_email_confirm = false,
  enable_email_change_confirm = false,
  enable_password_reset = true; 