# ICare Google sign-in live demo

The backend implements Google OpenID Connect authorization code sign-in with PKCE, state, nonce, and ID-token signature validation. A real Google Cloud Web OAuth client is required to complete the live demo. Keep its client secret only in the untracked `ICare/backend/.env` file.

## Google Cloud setup

1. In [Google Auth Platform](https://console.cloud.google.com/auth/clients), select the project intended for ICare. A dedicated demo project keeps it separate from existing applications.
2. If the Auth Platform is unconfigured, select **Get started**. Set an app name such as **ICare SE4030 OAuth Demo**, choose the account's support email, select **External** audience for a personal Google account, and provide the requested contact email. Complete Google's setup screens. Keep the requested scopes limited to `openid email profile`.
3. Under **Clients**, create an OAuth client with application type **Web application**. Set the authorized JavaScript origin to `http://localhost:3000` and authorized redirect URI to **exactly** `http://localhost:3000/api/auth/google/callback` (no trailing slash). Google requires an exact redirect URI match.
4. Add these values to `ICare/backend/.env` without committing them:

   ```text
   GOOGLE_CLIENT_ID=<client ID from Google Cloud>
   GOOGLE_CLIENT_SECRET=<client secret from Google Cloud>
   GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback
   ```

5. Restart the backend after changing `.env`. Keep MongoDB available. Run `npm run check:google` from `ICare/backend`; it checks required settings and the generated authorization redirect without printing credentials.
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

The automated tests simulate the full authorization redirect and callback, including state, PKCE, and ID-token verification. Record a separate real-provider test result only after the steps above succeed.

Sources: [Google OAuth web server flow](https://developers.google.com/identity/protocols/oauth2/web-server), [Google Cloud client setup](https://support.google.com/cloud/answer/15549257), [Google audience settings](https://support.google.com/cloud/answer/15549945).
