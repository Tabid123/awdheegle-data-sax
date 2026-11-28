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

## Delivered-order preview
Customer Profile and expanded Admin Customers now show provisional points from the existing orders read path. Only completed/delivered online or offline orders with explicit reward_account_phone, positive snapshot, and nonblank transaction ID are included. The production orders table already has a unique tx_id index. The preview is not a verified balance, is not spendable, and uses the legacy account identifier; it grants no new database privileges. No confirmed ledger writer is enabled. Public package points are fetched with a narrow column selection and included in the existing offline package cache. No build/deploy or live delivery test performed.

## Redemption catalog
Admin can set a separate redemption_points price per package (0 = unavailable). Existing packages are disabled by default. The customer profile shows active configured rewards only, excludes discovery roots, and does not submit or execute redemptions. Earned-point preview is not a spendable balance. Real redemption requires trusted earned credits and an atomic debit/delivery workflow. No package prices or existing order paths changed.
