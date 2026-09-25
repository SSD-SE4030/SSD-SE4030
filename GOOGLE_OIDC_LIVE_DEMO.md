# ICare Google sign-in live demo

The backend implements Google OpenID Connect authorization code sign-in with PKCE, state, nonce, and ID-token signature validation. The dedicated Google Cloud project **ICare SE4030 OAuth Demo** has a Web application client named **ICare Local Web Client**. Its consent screen is External in Testing mode, with the owner's Google account added as a test user. Keep the client secret only in the ignored `ICare/backend/.env` file.

## Google Cloud setup

1. In [Google Auth Platform](https://console.cloud.google.com/auth/clients?project=icare-se4030-oauth-demo), select **ICare SE4030 OAuth Demo**. The app uses only `openid email profile` scopes.
2. Under **Audience**, keep the app in Testing mode and add each demo Google account as a test user.
3. Under **Clients**, the **ICare Local Web Client** uses authorized JavaScript origin `http://localhost:3000` and authorized redirect URI **exactly** `http://localhost:4000/api/auth/google/callback` (no trailing slash). The callback must reach the backend directly: the React development server serves HTML for browser navigations and does not proxy this OAuth navigation to Express.
4. Add these values to `ICare/backend/.env` without committing them:

   ```text
   GOOGLE_CLIENT_ID=<client ID from Google Cloud>
   GOOGLE_CLIENT_SECRET=<client secret from Google Cloud>
   GOOGLE_REDIRECT_URI=http://localhost:4000/api/auth/google/callback
   FRONTEND_ORIGIN=http://localhost:3000
   ```

5. Restart the backend after changing `.env`. Keep MongoDB available. Run `npm run check:google` from `ICare/backend`; it checks required settings and the generated authorization redirect without printing credentials. The frontend button navigates to `http://localhost:4000/api/auth/google/start` in development. The backend returns to `http://localhost:3000/oauth/google/callback` after verifying the Google ID token.
6. Open `http://localhost:3000/signin` in a browser session that is signed out of ICare. Click **Sign in with Google**, choose a Google account, and complete consent. Use a Google address that is not already registered as an ICare password account; automatic email-based account linking is intentionally disabled.
7. Verify the browser returns to ICare with the Google account name. A new Google user must have `isAdmin: false`. Sign out and sign in again to show that the same Google account is reused. For the viva, show the request to Google's consent page, the callback, and the resulting ICare session without displaying the client secret or full bearer token.

## Expected failures

| Symptom | Check |
| --- | --- |
| `/api/auth/google/start` returns 503 | Set all three `GOOGLE_*` values and restart the backend. |
| Google shows `redirect_uri_mismatch` | Copy the redirect URI above exactly into the Web OAuth client; check scheme, host, port, path, and trailing slash. |
| Google account cannot access a test app | Check Google Auth Platform **Audience** and its test-user settings. |
| Callback fails after Google consent | Check MongoDB connectivity, the Google client secret, backend logs, and the browser's callback response. |
| Existing ICare email returns 409 | Use a new Google address for the demo or sign in with the existing password account. |

The automated tests simulate the full authorization redirect and callback, including state, PKCE, ID-token verification, and return to the frontend origin. On **25 September 2026**, the preflight generated Google's authorization redirect and a live browser test completed the account chooser and consent screen. The account owner clicked **Continue** personally. The browser returned to ICare home, displayed the Google account name, and showed no administrator menu. This verifies a working local Google sign-in with the configured test client. A separate repeat sign-in and a full database integration suite remain to be recorded.

Sources: [Google OAuth web server flow](https://developers.google.com/identity/protocols/oauth2/web-server), [Google Cloud client setup](https://support.google.com/cloud/answer/15549257), [Google audience settings](https://support.google.com/cloud/answer/15549945).
