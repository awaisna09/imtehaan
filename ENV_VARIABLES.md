# Railway Backend Environment Variables

Copy these to Railway Dashboard > Variables

## Required Variables

```bash
# OpenAI API Key
OPENAI_API_KEY=sk-proj-your_openai_api_key_here

# Supabase Configuration
SUPABASE_URL=https://bgenvwieabtxwzapgeee.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnZW52d2llYWJ0eHd6YXBnZWVlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM2NjUzOTUsImV4cCI6MjA2OTI0MTM5NX0.jAkplpFSAAKqEMtFSZBFgluF_Obe6_upZA9W8uPtUIE
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# Environment
ENVIRONMENT=production
```

## Server Configuration

```bash
HOST=0.0.0.0
PORT=8000
```

## AI Tutor Configuration

```bash
TUTOR_MODEL=gpt-4o-mini
TUTOR_TEMPERATURE=1
TUTOR_MAX_TOKENS=2000
```

## Grading Configuration

```bash
GRADING_MODEL=gpt-4o-mini
GRADING_TEMPERATURE=0.1
GRADING_MAX_TOKENS=2000
GRADING_DEBUG=false
```

## CORS Configuration (Update After Netlify Deployment)

```bash
# Set this AFTER deploying frontend to Netlify
ALLOWED_ORIGINS=https://your-site.netlify.app
ALLOW_CREDENTIALS=true
```

## Optional: LangSmith Monitoring

```bash
LANGSMITH_API_KEY=your_langsmith_api_key_here
LANGSMITH_PROJECT=imtehaan-ai-tutor
LANGSMITH_ENDPOINT=https://api.smith.langchain.com
LANGSMITH_TRACING=true
```

## Logging Configuration

```bash
LOG_LEVEL=INFO
ENABLE_DEBUG=false
```

## Performance Configuration

```bash
REQUEST_TIMEOUT=30
MAX_CONCURRENT_REQUESTS=10
```
