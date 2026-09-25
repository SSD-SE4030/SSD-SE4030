import crypto from 'node:crypto';
import express from 'express';
import expressAsyncHandler from 'express-async-handler';
import User from './models/userModel.js';
import { generateToken } from './utils.js';

const router = express.Router();
const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth';
const tokenUrl = 'https://oauth2.googleapis.com/token';
const jwksUrl = 'https://www.googleapis.com/oauth2/v3/certs';
const random = () => crypto.randomBytes(32).toString('base64url');
const cookie = (name, value, maxAge = 600) => `${name}=${value}; HttpOnly; SameSite=Lax; Path=/api/auth/google; Max-Age=${maxAge}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
const parseCookies = (header = '') => Object.fromEntries(header.split(';').map((part) => part.trim().split('=')));

export function verifyGoogleIdToken(token, keys, clientId, nonce) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid ID token');
  const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
  const key = keys.find((item) => item.kid === header.kid && item.kty === 'RSA' && item.use === 'sig');
  if (header.alg !== 'RS256' || !key || !crypto.verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), crypto.createPublicKey({ key, format: 'jwk' }), Buffer.from(parts[2], 'base64url'))) {
    throw new Error('Invalid ID token signature');
  }
  const now = Math.floor(Date.now() / 1000);
  if (!['https://accounts.google.com', 'accounts.google.com'].includes(payload.iss) || payload.aud !== clientId || payload.exp <= now || payload.iat > now + 60 || payload.nonce !== nonce || !payload.sub || payload.email_verified !== true) {
    throw new Error('Invalid ID token claims');
  }
  return payload;
}

router.get('/start', (req, res) => {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI, FRONTEND_ORIGIN } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI || !FRONTEND_ORIGIN) return res.status(503).send({ message: 'Google sign-in is not configured' });
  const state = random();
  const nonce = random();
  const verifier = random();
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  res.setHeader('Set-Cookie', [cookie('oidc_state', state), cookie('oidc_nonce', nonce), cookie('oidc_verifier', verifier)]);
  const url = new URL(authUrl);
  for (const [name, value] of Object.entries({ client_id: GOOGLE_CLIENT_ID, redirect_uri: GOOGLE_REDIRECT_URI, response_type: 'code', scope: 'openid email profile', state, nonce, code_challenge: challenge, code_challenge_method: 'S256' })) url.searchParams.set(name, value);
  res.redirect(url.toString());
});

router.get('/callback', expressAsyncHandler(async (req, res) => {
  const cookies = parseCookies(req.headers.cookie);
  res.setHeader('Set-Cookie', ['oidc_state', 'oidc_nonce', 'oidc_verifier'].map((name) => cookie(name, '', 0)));
  if (!req.query.code || !cookies.oidc_state || req.query.state !== cookies.oidc_state || !cookies.oidc_nonce || !cookies.oidc_verifier) {
    return res.status(400).send({ message: 'Invalid sign-in response' });
  }
  const response = await fetch(tokenUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code: req.query.code, client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, redirect_uri: process.env.GOOGLE_REDIRECT_URI, grant_type: 'authorization_code', code_verifier: cookies.oidc_verifier }) });
  if (!response.ok) return res.status(401).send({ message: 'Google sign-in failed' });
  const { id_token: idToken } = await response.json();
  const keysResponse = await fetch(jwksUrl);
  if (!keysResponse.ok) throw new Error('Google keys unavailable');
  const { keys } = await keysResponse.json();
  let identity;
  try { identity = verifyGoogleIdToken(idToken, keys, process.env.GOOGLE_CLIENT_ID, cookies.oidc_nonce); }
  catch { return res.status(401).send({ message: 'Google identity verification failed' }); }
  let user = await User.findOne({ googleSub: identity.sub });
  if (!user) {
    if (await User.exists({ email: identity.email })) return res.status(409).send({ message: 'An account with this email already exists. Sign in with your password.' });
    user = await User.create({ name: identity.name || identity.email, email: identity.email, googleSub: identity.sub, isAdmin: false });
  }
  const profile = { _id: user._id, name: user.name, email: user.email, isAdmin: user.isAdmin, token: generateToken(user) };
  const frontendCallback = new URL('/oauth/google/callback', process.env.FRONTEND_ORIGIN);
  frontendCallback.hash = `user=${encodeURIComponent(JSON.stringify(profile))}`;
  res.redirect(frontendCallback.toString());
}));

export default router;
