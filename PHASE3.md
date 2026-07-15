
# EPC Pro V2 â€” Phase 3 Completion Report

Date: 10 July 2026  
Phase: Booking App integration  
Status: Complete as an inactive V2 bridge; not activated for live customers

## Outcome

Phase 3 has been implemented as a disconnected future integration between the Booking App and the V2 data model. The bridge is on a separate Booking App branch and is disabled unless `V2_BOOKING_BRIDGE_ENABLED=true` is deliberately configured. The production Booking App remains on `main`; no production deployment, domain, form submission, customer booking, payment or email was redirected to V2.

## Implemented

- Separate Booking App branch: `v2-phase3-integration`.
- Disconnected browser adapter for the future approved cutover; it is not loaded by the production page.
- Disabled `/api/v2/prepare-checkout` route.
- Server-side payload validation and normalisation for one to twenty-five properties.
- Database-authoritative pricing and deposits; browser-submitted price fields are discarded.
- One transaction creates or matches the contact, creates or matches each property, creates one booking group, one booking item and one V2 job per property, and reserves capacity for every item.
- Transactional failure: if any property, price or capacity reservation fails, the whole booking draft is rolled back.
- Required idempotency keys for booking preparation and Stripe Checkout creation.
- Thirty-minute capacity holds with atomic AM/PM/day validation.
- Same-building grouping recorded without allowing a public customer to approve excess capacity.
- Stripe Checkout uses only the authoritative total deposit returned by the database.
- Separate signed V2 Stripe webhook using its own `V2_STRIPE_WEBHOOK_SECRET`.
- Durable unique Stripe event ledger.
- Paid amount must exactly equal the authoritative group deposit before confirmation.
- Successful payment atomically confirms the group, items, individual jobs and capacity reservations.
- Confirmation email outbox with one unique grouped confirmation per booking group.
- Protected email worker with conditional claiming, retries and safe error storage.
- One grouped confirmation lists every property, total fee, deposit paid and remaining balance.
- Owner-authenticated V2 Dashboard endpoint for grouped booking jobs.
- Phase 3 migration and rollback scripts committed to the V2 Dashboard branch.

## Verification completed

- Pricing is per property/job, never a generic single-booking fee and never automatically discounted.
- Single-property test: a property below Â£1 million correctly produced its own Â£60 fee / Â£30 deposit / one property / one item / one job.
- Same-band multi-property test: two properties below Â£1 million produced Â£60 + Â£60 = Â£120, with Â£30 + Â£30 = Â£60 deposit.
- Boundary multi-property test: Â£999,999 and Â£1,000,000 properties produced Â£60 + Â£80 = Â£140, with Â£30 + Â£40 = Â£70 deposit.
- Mixed-band multi-property test: below-Â£1-million and Â£2â€“3-million properties produced Â£60 + Â£110 = Â£170, with Â£30 + Â£55 = Â£85 deposit.
- No automatic multi-property or same-building discount exists. A different price requires an explicitly authorised custom price and recorded reason.
- Same-building booking: group flag and individual property/job records verified.
- Arbitrary same-building overflow: rejected without an approved capacity override.
- Capacity: unapproved sixth AM unit rejected.
- Pricing tampering: submitted browser price/deposit values are not passed into the V2 database request; database rules overwrite ordinary item amounts.
- Draft replay: repeated idempotency key returned the existing booking group.
- Stripe amount mismatch: rejected and recorded as a critical V2 security event.
- Stripe event replay: processed once.
- Payment confirmation: group, jobs and reservations moved to confirmed.
- Email idempotency: exactly one grouped confirmation outbox entry created.
- Email template: all properties, grouped totals and EPC Pro identity verified by automated tests.
- JavaScript syntax: all new API files and adapter passed Node syntax checks.
- Unit tests: four passed, zero failed.
- Supabase advisor: only informational V2 notices remain; no new V2 warning/error finding.
- Rollback: rehearsed transactionally and restored successfully.
- Preview deployment: READY with no build errors.
- Test isolation: all test records rolled back; V2 booking groups/items/jobs/reservations/payment events/email outbox all contain zero test rows.

## Safety boundary

- `V2_BOOKING_BRIDGE_ENABLED` is absent/false by default.
- The preview is additionally protected by Vercel authentication.
- Production Booking App `main` remains the live source.
- The public page does not load `v2-booking-bridge.js`.
- No live Stripe webhook was changed or activated.
- No confirmation worker schedule was activated.
- No live customer data was copied to V2.

## Branches and files

Booking App:

- Branch: `v2-phase3-integration`
- `api/v2/prepare-checkout.js`
- `api/v2/stripe-webhook.js`
- `api/v2/process-email-outbox.js`
- `api/_lib/v2-bridge.js`
- `v2-booking-bridge.js` â€” deliberately not loaded
- `tests/v2-bridge.test.js`

V2 Dashboard:

- Branch: `v2-phase1-security`
- `api/dashboard/v2-booking-groups.js`
- Phase 3 Supabase migrations and rollback scripts

## Deferred activation

The eventual release phase must configure the four V2 bridge variables, register the separate V2 Stripe webhook, connect the public submit action to the adapter, schedule the confirmation worker, run controlled Stripe test-mode/email tests and then perform the separately approved production cutover. Those activation actions were intentionally not performed in Phase 3.

