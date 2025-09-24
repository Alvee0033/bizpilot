# 🚀 How to Start BizPilot (Fix CORS Issues)

## ❌ DON'T USE Live Server
**Stop using Live Server** (`http://127.0.0.1:5500`) - it causes CORS errors with Firebase Storage.

## ✅ USE CORS-Enabled Server Instead

### Option 1: Quick Start (Recommended)
```bash
# Install dependencies
npm install

# Start CORS-enabled server
npm start
```
Then visit: **http://localhost:3000**

### Option 2: Use the Development Script
```bash
# Make script executable
chmod +x dev.sh

# Start full development environment
./dev.sh
```
This starts:
- Python backend on port 8000
- CORS-enabled frontend on port 3000

### Option 3: Manual CORS Server
```bash
# Start custom CORS server
node cors-server.js
```
Then visit: **http://localhost:3000**

## 🎯 What This Fixes

✅ **No more CORS errors** in browser console  
✅ **Firebase Storage works** properly  
✅ **Logo loads** correctly  
✅ **AI analysis works** with all features  
✅ **File uploads work** without errors  

## 🔧 If You Still See CORS Errors

1. **Stop Live Server** completely
2. **Clear browser cache** (Ctrl+Shift+R)
3. **Use the correct URL**: `http://localhost:3000` (not 5500)
4. **Check console** - should see "🚀 CORS-enabled server running"

## 📱 Test the Models Page

1. Start the CORS server: `npm start`
2. Visit: `http://localhost:3000/models.html`
3. You should see:
   - ✅ No white screen
   - ✅ Sample data loaded
   - ✅ "Analyze with AI" button ready
   - ✅ No CORS errors in console

## 🆘 Still Having Issues?

Check the `CORS-FIX.md` file for detailed troubleshooting steps.

