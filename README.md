# Imtehaan AI - Backend API

Backend API for Imtehaan AI EdTech Platform deployed on Railway.

## 🚀 Quick Start

This repository contains the backend API for the Imtehaan AI platform. It's designed to be deployed on Railway.

## 📋 Features

- **AI Tutor Service** - LangGraph-based AI tutoring system
- **Answer Grading** - Automated grading with detailed feedback
- **Mock Exam Grading** - Complete exam evaluation system
- **Supabase Integration** - Database and analytics
- **LangSmith Monitoring** - Performance tracking

## 🛠️ Tech Stack

- Python 3.11
- FastAPI
- LangChain & LangGraph
- OpenAI GPT-4o-mini
- Supabase

## 📦 Installation

```bash
pip install -r requirements.txt
```

## ⚙️ Configuration

Set environment variables in Railway dashboard. See `ENV_VARIABLES.md` for complete list.

**Required:**
- `OPENAI_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## 🚂 Railway Deployment

1. Connect this repository to Railway
2. Railway will auto-detect Python and install dependencies
3. Set environment variables in Railway dashboard
4. Deploy!

## 📚 API Documentation

Once deployed, visit:
- Health Check: `https://your-app.railway.app/health`
- API Docs: `https://your-app.railway.app/docs`

## 🔗 Related Repositories

- Frontend: Deployed on Netlify
- Database: Supabase

## 📝 License

Private - All rights reserved
