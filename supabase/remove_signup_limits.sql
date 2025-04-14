-- Disable signup rate limits
UPDATE auth.config
SET 
    signup_rate_limit = 0,
    signup_rate_limit_period = 0,
    signup_rate_limit_max = 0,
    email_rate_limit = 0,
    email_rate_limit_period = 0,
    email_rate_limit_max = 0,
    password_reset_rate_limit = 0,
    password_reset_rate_limit_period = 0,
    password_reset_rate_limit_max = 0;

-- Disable email confirmation requirement
UPDATE auth.config
SET 
    enable_signup_email_confirm = false,
    enable_email_change_confirm = false;

-- Disable other rate limits
UPDATE auth.config
SET 
    max_attempts = 0,
    max_attempts_period = 0; 