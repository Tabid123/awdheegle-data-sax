# Loyalty points: package configuration

This phase only configures reward values per package. It does not award, show a redeemable balance, or redeem points. Existing packages default to zero.

## Release gate
- Current production policies allow public inserts and updates on orders, delivery_queue, and payment_receipts; a delivered status alone is not trusted evidence. Do not award redeemable points based on it.
- Customer verification currently uses localStorage, not a server-authenticated customer identity. Do not expose a points balance RPC keyed only by a phone number.
- Secure delivery/payment confirmation and customer identity without breaking current APKs. Then implement an append-only server-side ledger with a unique order ID, immutable points snapshot, normalized payer identity, reversal handling, and server-side atomic redemption. Test online and offline, failed delivery, retries, forged requests and repeated claims before enabling.

## Verification
Production migration applied and checked: 108 existing package records had zero reward points. Admin UI build and integration tests still required.

## Phase 2: isolated ledger
Production migration 20261128103333 applied. RLS enabled; anonymous read and authenticated insert denied; service role insert allowed; primary key and payment-source/reference unique constraint verified. Ledger starts empty. No award writers have been enabled. The current SMS receipt function accepts request body data without device authentication, and the Android delivery client uses the anonymous key. Existing customer verification cannot establish server-trusted identity. Do not hook the ledger to these legacy flows; migrate device authentication and server-issued customer sessions before enabling earnings or redemption. Keep existing purchase flows untouched until compatibility tests pass.

## Account attribution
Rewards belong exclusively to the app login phone, never to the payer or receiver by fallback. Online receipts use pending_online_payments.verified_phone; offline purchases capture the login phone in the queued order and offline registration. Legacy registrations without an explicit login phone and automatic topups without an app account receive no reward attribution. A new order trigger captures package points once, preserving account and snapshot across updates. Existing orders are not backfilled. Attribution remains untrusted and does not award redeemable points; no changes to OTP or purchase flow. Existing online payment deduplication and offline registration ownership require further testing before enabling awards.
