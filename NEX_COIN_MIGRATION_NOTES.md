# NEX Coin Migration Notes

VibeBook currently runs Stage 1 as database-backed NEX Points. The wallet ledger is already structured for Stage 2 token migration without changing the user-facing wallet flow.

## Stage 1: NEX Points

- Balances live in `Wallet.balance`.
- Every earn, spend, transfer, gift, referral, QR payment, and reward creates an immutable `WalletTransaction`.
- Daily rewards are cooldown protected for 24 hours and use streak rewards: Day 1 = 10, Day 3 = 25, Day 7 = 75, Day 30 = 500.
- Engagement rewards are handled by `backend/src/services/rewardEngine.js` with self-reward, duplicate, and cooldown protections.

## Stage 2: NEX Coin Ready

- Conversion rate is configurable with `NEX_POINTS_PER_COIN`.
- Default conversion is `1000 NEX Points = 1 NEX Coin`.
- Wallet responses include `tokenMigration` and `tokenBalance` estimates for export and future conversion screens.
- Transaction metadata marks token-ready activity with `futureTokenReady`.
- Ledger exports can be built from `WalletTransaction` filtered by user, status, source, and creation date.

## Future Payout Rails

Creator payouts can use the same wallet qualification layer before enabling:

- Mobile Money
- Crypto payouts
- NEX Coin
- Stablecoins

Recommended qualification checks: verified account, minimum followers, minimum watch hours, authentic engagement, anti-spam score, and active days.
