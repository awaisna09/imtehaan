# Railway Backend Deployment Checklist

## Pre-Deployment

- [ ] Railway account created
- [ ] OpenAI API key ready
- [ ] Supabase credentials ready (URL, anon key, service role key)
- [ ] LangSmith API key ready (optional)

## Deployment Steps

### 1. Create Railway Project
- [ ] Go to https://railway.app
- [ ] Create new project
- [ ] Choose "Deploy from GitHub" or "Empty Project"

### 2. Configure Environment Variables
Add all required variables in Railway dashboard:

**Required:**
- [ ] `OPENAI_API_KEY` = your OpenAI API key
- [ ] `SUPABASE_URL` = your Supabase project URL
- [ ] `SUPABASE_ANON_KEY` = your Supabase anonymous key
- [ ] `SUPABASE_SERVICE_ROLE_KEY` = your Supabase service role key (recommended)

**Optional (but recommended):**
- [ ] `LANGSMITH_API_KEY` = your LangSmith API key
- [ ] `LANGSMITH_PROJECT` = imtehaan-ai-tutor
- [ ] `LANGSMITH_ENDPOINT` = https://api.smith.langchain.com
- [ ] `LANGSMITH_TRACING` = true

**Server Configuration:**
- [ ] `HOST` = 0.0.0.0
- [ ] `PORT` = 8000 (Railway sets this automatically, but good to specify)

**Model Configuration:**
- [ ] `TUTOR_MODEL` = gpt-4o-mini
- [ ] `TUTOR_TEMPERATURE` = 1
- [ ] `TUTOR_MAX_TOKENS` = 2000
- [ ] `GRADING_MODEL` = gpt-4o-mini
- [ ] `GRADING_TEMPERATURE` = 0.1
- [ ] `GRADING_MAX_TOKENS` = 2000

**CORS Configuration (update after Netlify deployment):**
- [ ] `ALLOWED_ORIGINS` = https://your-netlify-site.netlify.app
- [ ] `ALLOW_CREDENTIALS` = true
- [ ] `ENVIRONMENT` = production

**Logging:**
- [ ] `LOG_LEVEL` = INFO
- [ ] `ENABLE_DEBUG` = false

### 3. Deploy
- [ ] Upload `railway-deployment` folder or connect GitHub repo
- [ ] Railway will auto-detect Python and install dependencies
- [ ] Wait for deployment to complete
- [ ] Check deployment logs for errors

### 4. Get Railway URL
- [ ] Copy Railway URL (e.g., `https://your-app.railway.app`)
- [ ] Test health endpoint: `https://your-app.railway.app/health`
- [ ] Test API docs: `https://your-app.railway.app/docs`

### 5. Update CORS (After Netlify Deployment)
- [ ] Get Netlify frontend URL
- [ ] Update `ALLOWED_ORIGINS` in Railway to include Netlify URL
- [ ] Redeploy Railway service

## Testing

- [ ] Health check: `GET /health`
- [ ] AI Tutor: `POST /tutor/chat`
- [ ] Grading: `POST /grade-answer`
- [ ] Mock Exam: `POST /grade-mock-exam`

## Troubleshooting

### Deployment fails
- Check Railway logs
- Verify all environment variables are set
- Check Python version (should be 3.11)

### Service not starting
- Check `Procfile` is correct
- Verify `unified_backend.py` exists
- Check for import errors in logs

### API errors
- Verify OpenAI API key is valid
- Check Supabase credentials
- Review Railway logs for detailed errors

### CORS errors
- Verify `ALLOWED_ORIGINS` includes frontend URL
- Check `ENVIRONMENT` is set to `production`
- Ensure no localhost references in production

