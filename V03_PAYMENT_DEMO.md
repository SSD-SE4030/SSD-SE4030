# V03 COD payment confirmation

## Source investigation

The current repository, its Git history, and the source of the other local running
copy contain no generator with `Demo - Cash on Delivery`, `DEMO_PENDING`, or the
affected order's demo identifier. The original writer cannot be attributed from
the available source. Do not describe it as fixed or rerun an unknown generator.

Current checkout already sends `Cash On Delivery`; POST `/api/orders` rejects
other methods and stores that exact value. Its authorization and payment guards
have not been changed.

For future isolated fixtures, import `makeDemoOrder` from
`ICare/backend/testFixtures/demoOrder.js`. It returns a plain object, never connects
to a database, and never saves. It forces canonical unpaid COD even when overrides
contain a Demo label. Demo identification remains in `paymentResult.id/status`.
It is not a production checkout or seed endpoint. Replace its placeholder user and
product IDs with accounts/products belonging only to your isolated test database.

## Safe verification

Automated checks use in-memory models and mocked Axios; no MongoDB connection is
opened and no live payment request is sent.

The frontend pins a compatible Babel core because the previously installed
7.20.7 core cannot run the existing import-attributes syntax plugin in Jest.

From `ICare/backend`:

```powershell
npm.cmd test
```

From `ICare/frontend`:

```powershell
$env:CI='true'
npm.cmd test -- --watchAll=false --runInBand --runTestsByPath src/screens/PaymentListScreen.test.js
npm.cmd run build
```

For a manual integration demo, run a separate backend using a disposable test
MongoDB database and point a separate frontend at it. Verify that both test
customer and admin accounts, products, and fixture orders are in that database.
Use canonical unpaid COD test data, collect/acknowledge simulated test cash, and
confirm payment as admin. Verify the returned paid timestamp after reload.
Customer pay/deliver requests must return 403; already-paid and non-COD admin
payment requests must return 400. Cancel must send no request. Do not perform
these updates against the existing configured database.

## Proposed data correction — review only, not executed

Scope: only order `6ad1b95aaef8e32fb8a95b2a`, and only after the owner confirms it
is an isolated COD demo record in the intended database.

1. Capture an exact restricted before-image of `_id`, `paymentMethod`, `isPaid`,
   `paidAt`, `paymentResult`, and `updatedAt`, preserving missing versus null fields.
2. Require `_id` match, exact old method `Demo - Cash on Delivery`, `isPaid: false`,
   demo marker `paymentResult.id: icare-viva-demo-20261016-order-5`,
   `paymentResult.status: DEMO_PENDING`, and unchanged before-image values.
3. Use a compare-and-set update of **only** `paymentMethod` to `Cash On Delivery`.
   Require exactly one match. Never set `isPaid`, `paidAt`, or `paymentResult`.
4. Verify the method and unchanged payment fields using read-only projection.
5. Rollback can restore the exact old method only while the record remains unpaid
   and its payment fields and other captured values remain unchanged. Abort rollback
   if payment or another operation has intervened; investigate rather than overwrite.

No executable migration is included. Preparation/execution of this correction
requires separate explicit approval. Until then the existing Demo record remains
ineligible and its confirmation button is disabled.
