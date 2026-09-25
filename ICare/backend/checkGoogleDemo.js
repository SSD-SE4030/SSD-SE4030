import 'dotenv/config';

const required = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI', 'FRONTEND_ORIGIN', 'JWT_SECRET', 'MONGODB_URI'];
const missing = required.filter((name) => !process.env[name] || process.env[name].startsWith('replace-'));
if (missing.length) {
  console.error(`Missing backend .env values: ${missing.join(', ')}`);
  process.exitCode = 1;
} else {
  const redirect = new URL(process.env.GOOGLE_REDIRECT_URI);
  const backend = `http://localhost:${process.env.PORT || 4000}`;
  if (redirect.origin !== backend || redirect.pathname !== '/api/auth/google/callback') {
    console.error(`GOOGLE_REDIRECT_URI must be ${backend}/api/auth/google/callback for this local demo`);
    process.exitCode = 1;
  } else {
    try {
      const response = await fetch(`${backend}/api/auth/google/start`, { redirect: 'manual' });
      const location = response.headers.get('location');
      const authorization = location && new URL(location);
      if (response.status !== 302 || authorization?.hostname !== 'accounts.google.com' || authorization.searchParams.get('redirect_uri') !== process.env.GOOGLE_REDIRECT_URI || !authorization.searchParams.get('state') || !authorization.searchParams.get('nonce') || !authorization.searchParams.get('code_challenge')) {
        throw new Error('Backend did not generate a valid Google authorization redirect');
      }
      console.log('Google authorization redirect ready. Open http://localhost:3000/signin and complete the browser sign-in.');
    } catch (error) {
      console.error(`Google demo preflight failed: ${error.message}`);
      process.exitCode = 1;
    }
  }
}
