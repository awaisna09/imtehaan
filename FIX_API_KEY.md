# 🔑 Fix OpenAI API Key Error (401 Unauthorized)

## ❌ Error
```
HTTP/1.1 401 Unauthorized
Incorrect API key provided
```

## 🔍 Problem
The `OPENAI_API_KEY` environment variable in Railway is either:
1. ❌ Not set correctly
2. ❌ Has extra spaces or quotes
3. ❌ Is expired/revoked
4. ❌ Is incorrect/invalid

## ✅ Solution

### Step 1: Verify Your API Key

1. Go to: https://platform.openai.com/api-keys
2. Check if your API key is active
3. If expired/revoked, create a new one
4. Copy the **full key** (starts with `sk-proj-` or `sk-`)

### Step 2: Update Railway Environment Variable

1. **Go to Railway Dashboard**
   - Your Project → Your Service → Variables

2. **Find `OPENAI_API_KEY`**
   - Check current value
   - Delete it if incorrect

3. **Add/Update the Variable**
   - Click "New Variable" or edit existing
   - **Key**: `OPENAI_API_KEY`
   - **Value**: Your actual API key (paste the full key)
   - ⚠️ **Important**: 
     - No quotes around the value
     - No spaces before/after
     - Copy the entire key (it's long!)

4. **Save**
   - Railway will auto-redeploy

### Step 3: Verify the Key Format

Your API key should:
- Start with `sk-proj-` (new format) or `sk-` (old format)
- Be very long (100+ characters)
- Have no spaces or line breaks
- Be the exact key from OpenAI dashboard

### Step 4: Test

After updating:
1. Wait for Railway to redeploy
2. Test the AI Tutor again
3. Check Railway logs - should see 200 OK instead of 401

## 🔐 Security Notes

- ✅ Never commit API keys to GitHub
- ✅ Always use Railway environment variables
- ✅ Rotate keys if exposed
- ✅ Use different keys for dev/prod if needed

## ⚠️ Important Notes

- Your API key might be expired or revoked
- Check OpenAI dashboard to verify it's still active: https://platform.openai.com/api-keys
- If not active, create a new key and update Railway
- Never commit API keys to GitHub (use Railway environment variables only)

## 🆘 If Still Not Working

1. **Check Railway Logs**:
   - Look for the exact error message
   - Verify the key is being read (check logs for key length)

2. **Verify Key in OpenAI Dashboard**:
   - Go to https://platform.openai.com/api-keys
   - Check if key is active
   - Check usage limits/quota

3. **Create New Key**:
   - If old key is expired, create new one
   - Update Railway with new key
   - Redeploy

4. **Check for Typos**:
   - Ensure no extra spaces
   - Ensure no quotes around value
   - Ensure full key is copied

## ✅ Quick Fix Checklist

- [ ] Go to Railway → Variables
- [ ] Find `OPENAI_API_KEY`
- [ ] Verify/update the value
- [ ] Ensure no quotes or spaces
- [ ] Save (auto-redeploys)
- [ ] Test AI Tutor again
- [ ] Check logs for 200 OK response
