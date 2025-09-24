# Fixing CORS Issues with Firebase Storage

## Problem
You're experiencing CORS (Cross-Origin Resource Sharing) errors when trying to access Firebase Storage from your local development server. This happens because:

1. You're running the app from `http://127.0.0.1:5500` (Live Server)
2. Firebase Storage has strict CORS policies
3. The browser blocks requests due to security restrictions

## Solutions

### Option 1: Use the CORS-enabled Development Server (Recommended)

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start the CORS-enabled server:**
   ```bash
   npm start
   # or
   node cors-server.js
   ```

3. **Access your app at:**
   ```
   http://localhost:3000
   ```

### Option 2: Use http-server with CORS

1. **Install http-server globally:**
   ```bash
   npm install -g http-server
   ```

2. **Start with CORS enabled:**
   ```bash
   npx http-server . -p 3000 -c-1 --cors
   ```

3. **Access your app at:**
   ```
   http://localhost:3000
   ```

### Option 3: Update Firebase Storage Rules

1. **Go to Firebase Console:**
   - Visit [Firebase Console](https://console.firebase.google.com)
   - Select your project (`blzpilot`)

2. **Update Storage Rules:**
   - Go to Storage → Rules
   - Replace the rules with the content from `storage.rules` file
   - Publish the changes

3. **Add your localhost to authorized domains:**
   - Go to Authentication → Settings → Authorized domains
   - Add `localhost` and `127.0.0.1`

### Option 4: Use the Updated Development Script

1. **Make the script executable:**
   ```bash
   chmod +x dev.sh
   ```

2. **Run the development environment:**
   ```bash
   ./dev.sh
   ```

   This will:
   - Start the Python backend on port 8000
   - Start a CORS-enabled frontend server on port 3000
   - Handle all the setup automatically

## Why This Happens

- **CORS Policy**: Browsers block requests from one origin to another unless explicitly allowed
- **Firebase Security**: Firebase Storage has strict security rules
- **Development vs Production**: Different environments have different security requirements

## Testing the Fix

1. Start the CORS-enabled server
2. Open `http://localhost:3000/models.html`
3. Select an idea and click "Analyze with AI"
4. Check the browser console - CORS errors should be gone

## Additional Notes

- The app will work with or without Firebase Storage data
- Error handling has been added to gracefully handle missing Firebase data
- The AI analysis will still work using the wizard data from localStorage
- Photos and PDFs will be processed if available, but the app won't crash if they're not

## Troubleshooting

If you still see CORS errors:

1. **Clear browser cache** and reload
2. **Check the console** for specific error messages
3. **Verify Firebase project settings** in the console
4. **Make sure you're using the correct port** (3000, not 5500)

## Production Deployment

For production deployment, you'll need to:
1. Configure proper CORS headers on your hosting platform
2. Update Firebase Storage rules for production domains
3. Set up proper authentication and authorization

