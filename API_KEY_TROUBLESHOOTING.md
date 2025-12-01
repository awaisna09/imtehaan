# OpenAI API Key Troubleshooting Guide

## 🔴 Current Error
```
401 Unauthorized - Incorrect API key provided
```

## ✅ Step-by-Step Fix

### 1. Check OpenAI Dashboard

Go to: https://platform.openai.com/api-keys

**Check:**
- [ ] Is your API key still active?
- [ ] Has it been revoked or expired?
- [ ] Do you have usage quota remaining?
- [ ] Is billing set up correctly?

### 2. Get Your API Key

**If key is active:**
- Copy the full key (starts with `sk-proj-` or `sk-`)
- It's very long (100+ characters)
- Copy the entire key

**If key is expired/revoked:**
- Click "Create new secret key"
- Copy the new key immediately (you won't see it again!)
- Save it securely

### 3. Update Railway Environment Variable

**In Railway Dashboard:**

1. Go to: Your Project → Your Service → Variables tab

2. **Find `OPENAI_API_KEY`**:
   - If it exists: Click to edit
   - If it doesn't exist: Click "New Variable"

3. **Set the Value**:
   ```
   Key: OPENAI_API_KEY
   Value: sk-proj-your_full_api_key_here
   ```
   
   **⚠️ CRITICAL:**
   - ❌ NO quotes: Don't use `"sk-proj-..."`
   - ❌ NO spaces: Don't add spaces before/after
   - ✅ Full key: Copy the entire key
   - ✅ Exact match: Must match OpenAI dashboard exactly

4. **Save**:
   - Railway will automatically redeploy
   - Wait for deployment to complete

### 4. Verify in Railway Logs

After redeployment, check logs:
- ✅ Should see: `[OK] OpenAI API key configured`
- ✅ Should see: `[OK] AI Tutor Agent initialized`
- ❌ Should NOT see: `401 Unauthorized`

### 5. Test

1. Try using AI Tutor again
2. Check Railway logs
3. Should see `200 OK` instead of `401`

## 🔍 Common Issues

### Issue 1: Key Has Quotes
**Wrong:**
```
OPENAI_API_KEY="sk-proj-..."
```

**Correct:**
```
OPENAI_API_KEY=sk-proj-...
```

### Issue 2: Key Has Spaces
**Wrong:**
```
OPENAI_API_KEY= sk-proj-... 
```

**Correct:**
```
OPENAI_API_KEY=sk-proj-...
```

### Issue 3: Key is Truncated or Expired
**Wrong:**
- Key is incomplete (missing characters)
- Key is expired/revoked

**Solution:**
- Get fresh key from OpenAI dashboard
- Ensure you copy the entire key (it's very long)
- Update Railway with the complete key

### Issue 4: Key Expired/Revoked
**Symptoms:**
- 401 Unauthorized error
- Key was working before

**Solution:**
- Create new key in OpenAI dashboard
- Update Railway with new key
- Redeploy

## 📝 Your Current Key Status

**⚠️ Your API key might be:**
- Expired
- Revoked
- Invalid
- Not set correctly in Railway

**Check OpenAI dashboard to verify:**
- Go to: https://platform.openai.com/api-keys
- Verify your key is active
- If expired/revoked, create a new key
- Update Railway environment variables with the new key

## ✅ Verification Steps

1. **Railway Variables**:
   - [ ] `OPENAI_API_KEY` exists
   - [ ] Value is set (not empty)
   - [ ] No quotes around value
   - [ ] No spaces

2. **OpenAI Dashboard**:
   - [ ] Key is active
   - [ ] Key matches Railway value
   - [ ] Usage quota available
   - [ ] Billing is set up

3. **Railway Logs**:
   - [ ] No 401 errors
   - [ ] Agent initializes successfully
   - [ ] API calls return 200 OK

## 🆘 Still Not Working?

1. **Create Fresh API Key**:
   - Go to OpenAI dashboard
   - Delete old key (if expired)
   - Create new key
   - Update Railway

2. **Check Billing**:
   - Ensure OpenAI account has billing set up
   - Check for payment issues
   - Verify usage limits

3. **Check Railway Logs**:
   - Look for exact error message
   - Check if key is being read correctly
   - Verify environment variable is set

4. **Test Key Manually**:
   ```bash
   curl https://api.openai.com/v1/models \
     -H "Authorization: Bearer YOUR_API_KEY"
   ```
   Should return list of models, not 401 error

## 📞 Support

If still having issues:
- Check OpenAI status: https://status.openai.com
- Check Railway status: https://status.railway.app
- Review Railway deployment logs
- Verify key format matches OpenAI dashboard exactly
