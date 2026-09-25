# SE4030 Secure Software Development - ICare

This repository hardens the existing ICare optical store application and adds Google OpenID Connect sign-in. The local [original baseline commit](https://github.com/kojithan-y/Optical-Store-Management-System/tree/5b5b25869d92a662b1e5180eb1b4f22bcf3a7830) is dated **11 February 2025**. The original remote's current last commit and the semester start date must both be verified before submission.

## Submission details to complete

| Item | Value |
| --- | --- |
| Member 1 - name / index / contribution | TODO |
| Member 2 - name / index / contribution | TODO |
| Member 3 - name / index / contribution | TODO |
| Member 4 - name / index / contribution | TODO |
| Original GitHub repository | https://github.com/kojithan-y/Optical-Store-Management-System/tree/5b5b25869d92a662b1e5180eb1b4f22bcf3a7830 |
| Modified GitHub repository | TODO - publish this hardened version to a separate repository |
| YouTube demonstration (20 minutes maximum) | TODO - record and upload |
| Semester start date | TODO - verify original last commit eligibility |

The original repository already contains the baseline commit history. The local working repository has detailed security and report commits, but a separate modified GitHub repository has not yet been supplied or published. Do not push this branch to the original remote: its original commit date is needed as assignment evidence. Do not claim a video, deployment, external scan, or live Google sign-in test until completed.

## Run locally

1. Use Node.js 20 or later and MongoDB. Copy `ICare/backend/.env.example` to `ICare/backend/.env` and fill in private values. Never commit `.env`.
2. In `ICare/backend`, run `npm install`, then `npm test`, then `npm start`.
3. In `ICare/frontend`, run `npm install`, then `npm start`. The React dev server uses the backend proxy at `localhost:4000`.
4. For Google sign-in, create a Google Cloud **Web application** OAuth client and register `http://localhost:3000/api/auth/google/callback` as an authorized redirect URI. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URI` in the backend environment. Use HTTPS and the actual origin in production. The callback uses authorization code, PKCE S256, state, nonce, and a verified ID-token signature.

The old `/api/seed` endpoint is removed. The old card input and card API are removed: checkout supports Cash on Delivery only until a real payment gateway is integrated. Staff can mark a Cash on Delivery order paid after collecting payment. Existing database `orders.cardDetails` and `cards` records, if any, must be securely purged by the operator; removing the code does not erase historical data.

## Findings and fixes

| ID | Original issue | Fix |
| --- | --- | --- |
| V01 | Public GET `/api/seed` deleted all products and users and recreated predictable accounts. | Removed route from the server. |
| V02 | Any signed-in user could read another customer's order by ID. | Order detail checks owner or current administrator. |
| V03 | Any signed-in user could mark orders delivered or paid; card payments were marked paid from an unverified request. | Delivery and payment updates require current administrator; no client-supplied payment proof is accepted. |
| V04 | Order price and totals came from client JSON and could be reduced. | Server looks up products, checks quantity and stock, and recalculates totals. |
| V05 | Card number and CVV were stored in browser local storage and MongoDB. | Removed card form, card API, and order card fields; Cash on Delivery only. |
| V06 | Any signed-in user could read, create, or edit prescriptions. | Prescription management now requires current administrator. |
| V07 | JWT administrator claim remained authoritative after demotion or deletion. | Authentication loads the current user and role from the database for each request. |
| V08 | User list/detail and admin update responses exposed password hashes and reset tokens. | Explicitly excludes sensitive fields and returns a safe update DTO. |
| V09 | Password reset tokens were logged, long lived, reusable, and existence was disclosed. | Random hashed 15-minute token, single use, generic response, no token logging. |
| V10 | Upload accepted unlimited arbitrary files into memory. | 5 MB cap, one file, image MIME and file signature checks. |
| V11 | Ticket responses could be posted to another user's ticket. | Restricts response to owner or administrator. |
| V12 | Raw server error messages were returned to clients. | Generic 500 response; validation errors return 400. |

The report in `output/pdf/` documents the original evidence, impact, remediation, tests, OAuth design, and remaining limitations. Security tests use Node's built-in test runner. No live Google or MongoDB integration test is claimed in this repository.

## Security operations before a public demo

The original Git history included `ICare/backend/.env`. The file is now removed from Git tracking and ignored, but it **still exists in old commits**. Rotate the MongoDB password, JWT secret, and Cloudinary credentials before using a public modified repository. Replace any exposed demo credentials. Purge old card data, verify backups, and use an actual payment provider before enabling card payments. Document the rotation and purge as team evidence without publishing secrets.

## Suggested 20-minute demo

1. App scope, original commit date, and team contributions (2 min).
2. Reproduce original flaws using the baseline commit in an isolated test database (5 min).
3. Show ownership, role, pricing, reset, and card-flow fixes with test results (6 min).
4. Demonstrate Google sign-in with a configured test OAuth client, including rejected state/nonce (4 min).
5. Explain residual risks, credential rotation, and individual contributions (3 min).
