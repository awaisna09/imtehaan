-- Disable signup rate limits
UPDATE auth.config
SET 
  signup_rate_limit = 0,
  signup_rate_limit_period = 0,
  signup_rate_limit_max = 0;

-- Disable email rate limits
UPDATE auth.config
SET 
  email_rate_limit = 0,
  email_rate_limit_period = 0,
  email_rate_limit_max = 0;

-- Disable email confirmation requirement
UPDATE auth.config
SET 
  enable_signup_email_confirm = false;

-- Disable email change confirmation
UPDATE auth.config
SET 
  enable_email_change_confirm = false;

-- Disable password reset rate limits
UPDATE auth.config
SET 
  password_reset_rate_limit = 0,
  password_reset_rate_limit_period = 0,
  password_reset_rate_limit_max = 0; 