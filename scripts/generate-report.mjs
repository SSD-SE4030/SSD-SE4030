import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../ICare/frontend/package.json', import.meta.url));
const { jsPDF } = require('jspdf');
const doc = new jsPDF({ unit: 'mm', format: 'a4' });
const left = 20;
const right = 190;
const width = right - left;
let y = 24;
let page = 1;

function newPage() { doc.addPage(); page += 1; y = 24; }
function ensure(height) { if (y + height > 271) newPage(); }
function title(value) { ensure(18); doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(24, 49, 79); doc.text(value, left, y); y += 12; }
function heading(value) { ensure(15); doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(20, 85, 118); doc.text(value, left, y); y += 7; }
function para(value) {
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(35, 42, 51);
  const lines = doc.splitTextToSize(value, width);
  ensure(lines.length * 4.9 + 3);
  doc.text(lines, left, y);
  y += lines.length * 4.9 + 3;
}
function issue(id, name, original, impact, fix, evidence) {
  heading(`${id}  ${name}`);
  para(`Original: ${original}`);
  para(`Risk: ${impact}`);
  para(`Fix: ${fix}`);
  para(`Evidence: ${evidence}`);
  y += 2;
}

title('ICare Security Assessment');
para('SE4030 - Secure Software Development | Group assignment | Prepared 25 September 2026');
heading('Submission metadata');
para('Team: TODO - four member names, index numbers, and individual contributions. Modified GitHub repository: TODO. YouTube demonstration (maximum 20 minutes): TODO. Semester start date: TODO. These details were not supplied and must be completed before submission.');
para('Original project: https://github.com/kojithan-y/Optical-Store-Management-System . Baseline commit: 5b5b25869d92a662b1e5180eb1b4f22bcf3a7830, dated 11 February 2025. Confirm that this predates the semester start. ICare is an optical store application with React, Express, MongoDB, appointments, prescriptions, tickets, inventory, orders, and administrator workflows.');
heading('Method and scope');
para('White-box review of the checked-in baseline source and targeted regression tests of the hardened code. Findings below are supported by identifiable original routes and data flow. No external scanner result, live database exploit, penetration test, live Google sign-in, or dependency audit is claimed. Use an isolated copy of the baseline and test data for demonstrations.');
heading('Executive summary');
para('Twelve distinct weaknesses were identified across destructive setup endpoints, authorization, payment integrity, privacy, reset tokens, file upload, and error handling. The highest impact issues allowed public deletion of users/products, cross-user order access, arbitrary paid status, and storage of payment card data. Code fixes are implemented. Operational work remains for historical secrets and card records.');

title('Findings and remediation');
issue('V01', 'Public database reset', 'GET /api/seed in seedRoutes.js deletes all Product and User documents and repopulates default accounts without authentication.', 'Unauthenticated database destruction and known demo credentials.', 'Removed /api/seed from server.js. Seed data is no longer reachable through HTTP.', 'Baseline: ICare/backend/routes/seedRoutes.js and server.js; modified: server.js.');
issue('V02', 'Order IDOR', 'GET /api/orders/:id checked only for a valid bearer token and returned any order by its ID.', 'A customer could obtain another customer\'s address, items, and payment state.', 'Require matching order.user or a current administrator before returning an order.', 'Baseline and modified: ICare/backend/routes/orderRoutes.js.');
issue('V03', 'Unauthorized payment and delivery changes', 'PUT /api/orders/:id/deliver and /pay required only sign-in. The card branch marked an order paid without processor confirmation.', 'Any user could alter fulfilment or forge a paid order.', 'Both routes now require administrator. The pay route records only collected Cash on Delivery payment and rejects repeated/non-COD updates. The customer Pay Now control was removed.', 'Baseline and modified: orderRoutes.js; frontend OrderScreen.js and PaymentListScreen.js.');
issue('V04', 'Client-controlled order totals', 'POST /api/orders copied client order item prices and totals into MongoDB.', 'A customer could submit a lower item price or total.', 'Lookup catalog products by ID, validate quantity and stock, copy server-side prices and recalculate shipping, tax and total.', 'Modified: orderPricing.js and security.test.js. Test submits price 0.01 and confirms catalog price 200.');
issue('V05', 'Stored card data and CVV', 'CardDetailsScreen saved PAN and CVV in localStorage; cardRoutes.js and orderModel.js stored them in MongoDB.', 'Sensitive payment credentials could be exposed through XSS, browser access, database breach, or API response.', 'Removed card form, saved-card API, card schema/model and order card fields. Checkout now supports Cash on Delivery only.', 'Baseline: CardDetailsScreen.js, cardRoutes.js, cardModel.js, orderModel.js. Modified: PaymentMethodScreen.js and orderRoutes.js.');
issue('V06', 'Prescription access control', 'Prescription list, detail, create and update routes accepted any authenticated user.', 'Medical prescription data could be read or modified by unrelated customers.', 'Applied administrator checks to prescription management routes.', 'Baseline and modified: ICare/backend/routes/prescriptionRoutes.js.');
issue('V07', 'Stale role in JWT', 'isAuth trusted isAdmin from a 30-day token even after a user was demoted or deleted.', 'Former administrators retained privileges until their token expired.', 'isAuth now loads the current account and role from MongoDB on every request.', 'Baseline and modified: ICare/backend/utils.js.');

title('Further findings');
issue('V08', 'Sensitive user fields in API responses', 'Admin user list/detail returned full Mongoose documents, including password hashes and resetToken. Update returned the full saved user.', 'Extra credential material could leak through a compromised admin browser or logs.', 'Exclude sensitive fields in list/detail queries; use a small update response object.', 'Baseline and modified: ICare/backend/routes/userRoutes.js.');
issue('V09', 'Unsafe password reset', 'Reset JWT appeared in server logs, lasted three hours, was not cleared after use, and unknown emails returned 404.', 'Reset links could be reused or exposed; account enumeration was possible.', 'Generate random token, store only SHA-256 hash for 15 minutes, clear after reset, avoid logging it and return generic request response.', 'Baseline and modified: userRoutes.js and userModel.js.');
issue('V10', 'Unbounded file upload', 'multer() used memory storage without a size or type limit.', 'An administrator upload could consume excessive memory or send unwanted file types to Cloudinary.', 'Limit to one 5 MB JPEG, PNG or WebP upload and reject missing files.', 'Baseline and modified: ICare/backend/routes/uploadRoutes.js.');
issue('V11', 'Ticket response IDOR', 'POST /api/tickets/:id/responses allowed any authenticated user to reply to any ticket.', 'Private support conversations could be modified by other customers.', 'Allow ticket owner or current administrator only.', 'Baseline and modified: ICare/backend/routes/ticketRoutes.js.');
issue('V12', 'Internal error disclosure', 'Global error handler returned err.message as a 500 response.', 'Database and implementation details could be disclosed.', 'Return generic 500 messages and structured 400 validation errors; log server-side.', 'Baseline and modified: ICare/backend/server.js.');

title('Google OpenID Connect feature');
heading('User journey');
para('Sign In now offers Sign in with Google. A successful first sign-in creates a non-admin ICare account bound to the Google subject (sub); later sign-ins resolve the account by sub. An existing password account with the same email is not auto-linked, preventing email-based account takeover. The app then issues its existing ICare bearer token.');
heading('Protocol and trust boundaries');
para('The backend starts an authorization-code flow with openid email profile scopes. It sets short-lived HttpOnly SameSite=Lax state, nonce and PKCE verifier cookies. The callback compares state, exchanges the code with Google over HTTPS using the configured client secret and verifier, retrieves Google public keys, validates the RS256 ID-token signature and issuer, audience, expiry, nonce, subject and verified email, then clears flow cookies. The ICare token is delivered to the React callback via URL fragment and removed from browser history immediately.');
heading('Configuration and verification');
para('Create a Google Cloud Web application OAuth client. Register http://localhost:3000/api/auth/google/callback for the React dev server, or the equivalent HTTPS production URI. Populate GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REDIRECT_URI in an untracked backend .env. Automated tests cover accepted identity and rejected signature, audience, nonce and expiration. A live Google end-to-end test requires real credentials and has not yet been performed.');

title('Verification and remaining work');
heading('Completed checks');
para('Backend: npm test - 4 tests passed (catalog price tampering, stock/duplicate rejection, ID-token verification, stale administrator claim). Frontend: npm run build completed with existing ESLint warnings. Node syntax checks passed for changed backend files. The checks do not replace authorization integration tests against MongoDB or a live provider test.');
heading('Unresolved and operational risks');
para('1. Original Git history contains backend .env. The modified working tree removes it from tracking, but old commits still contain it. Rotate MongoDB, JWT and Cloudinary credentials and consider history rewrite before publication. 2. Historical card records remain in any deployed MongoDB and backups; purge them securely under an approved retention procedure. 3. Card payments remain unavailable until a real PCI-compliant hosted gateway with server-side verification is integrated. 4. Existing bearer tokens live in localStorage and may be stolen by future XSS; migrate to a short-lived secure HttpOnly session architecture after a full frontend review. 5. A full dependency update, external scan, rate limiting and integration test suite remain future work.');
heading('Process improvements');
para('Add threat modelling for customer/staff data, an authorization matrix for every route, code review for payment and reset flows, secret scanning and .env ignore rules, regression tests for role/owner boundaries, dependency scanning, and a deployment checklist for data migrations and credential rotation.');
heading('References');
para('OWASP Top 10: https://owasp.org/www-project-top-ten/');
para('Google OpenID Connect: https://developers.google.com/identity/openid-connect/openid-connect');
para('Google OAuth 2.0 web server flow: https://developers.google.com/identity/protocols/oauth2/web-server');
para('Google ID-token verification: https://developers.google.com/identity/gsi/web/guides/verify-google-id-token');

for (let index = 1; index <= doc.getNumberOfPages(); index += 1) {
  doc.setPage(index);
  doc.setDrawColor(209, 216, 222);
  doc.line(left, 281, right, 281);
  doc.setFontSize(8); doc.setTextColor(90, 102, 114);
  doc.text('SE4030 | ICare security assessment', left, 287);
  doc.text(`${index} / ${doc.getNumberOfPages()}`, right, 287, { align: 'right' });
}

const outputDir = path.resolve('output/pdf');
fs.mkdirSync(outputDir, { recursive: true });
const output = path.join(outputDir, 'SE4030_ICare_Security_Report.pdf');
fs.writeFileSync(output, Buffer.from(doc.output('arraybuffer')));
console.log(`${output} (${doc.getNumberOfPages()} pages)`);
