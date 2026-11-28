# Loyalty points: package configuration

This phase only configures reward values per package. It does not award, show a redeemable balance, or redeem points. Existing packages default to zero.

## Release gate
- Current production policies allow public inserts and updates on orders, delivery_queue, and payment_receipts; a delivered status alone is not trusted evidence. Do not award redeemable points based on it.
- Customer verification currently uses localStorage, not a server-authenticated customer identity. Do not expose a points balance RPC keyed only by a phone number.
- Secure delivery/payment confirmation and customer identity without breaking current APKs. Then implement an append-only server-side ledger with a unique order ID, immutable points snapshot, normalized payer identity, reversal handling, and server-side atomic redemption. Test online and offline, failed delivery, retries, forged requests and repeated claims before enabling.

## Verification
Production migration applied and checked: 108 existing package records had zero reward points. Admin UI build and integration tests still required.
