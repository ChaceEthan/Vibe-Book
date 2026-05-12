# Wallet Module - NEX Points Economy

Complete internal wallet + points reward system for VibeBook with future NEX COIN token migration support.

## Overview

The wallet module provides a scalable, modular, and secure internal economy system based on NEX Points. It's designed with future blockchain token migration in mind but currently operates as a pure points economy.

### Key Features

- **NEX Points Currency**: Internal points-based economy
- **Transaction History**: Immutable audit trail of all wallet activities
- **Reward System**: Automated rewards for user activities
- **Real-time Updates**: Socket.IO integration for live wallet updates
- **Admin Controls**: Secure admin adjustment capabilities
- **Leaderboards**: Top earners/spenders tracking
- **Future Token Ready**: Architecture prepared for NEX COIN migration

## System Architecture

```
backend/src/modules/wallet/
├── walletModel.js              # Wallet data schema
├── walletTransactionModel.js   # Transaction history (immutable)
├── walletService.js            # Core business logic
├── walletController.js         # API endpoint handlers
├── walletRoutes.js             # Express routes
├── walletSocket.js             # Socket.IO real-time events
├── walletHooks.js              # Integration hooks for other modules
├── walletConstants.js          # System constants & config
├── walletUtils.js              # Utility functions
└── index.js                    # Module exports
```

## Database Models

### Wallet Model
Stores user wallet state and statistics.

**Fields:**
- `userId` - Reference to User document (unique, indexed)
- `balance` - Current NEX Points balance
- `lifetimeEarned` - Total points ever earned
- `lifetimeSpent` - Total points ever spent
- `totalReceived` - Total points received from transfers/gifts
- `totalSent` - Total points sent via transfers/gifts
- `streakCount` - Consecutive day login streak
- `level` - User level (1-5) based on lifetime earned
- `levelName` - User level name (Starter, Climber, Influencer, Superstar, Legend)
- `lastLoginDate` - Last daily reward claim date
- `createdAt`, `updatedAt` - Timestamps

**Indexes:**
- userId (unique)
- balance (for leaderboards)
- lifetimeEarned (for leaderboards)
- createdAt (for pagination)

### WalletTransaction Model
Immutable transaction history for audit trail.

**Fields:**
- `userId` - User who owns the transaction
- `type` - Transaction type (earn, spend, gift, reward, bonus, referral, admin_adjustment, transfer)
- `amount` - Transaction amount
- `balanceBefore` - Balance before transaction
- `balanceAfter` - Balance after transaction
- `source` - Source of transaction (daily_login, video_upload, live_stream, gift_received, etc)
- `description` - Human-readable description
- `metadata` - Additional context (giftId, videoId, referrerId, etc)
- `status` - Transaction status (completed, pending, failed, reversed)
- `relatedUserId` - Related user (for transfers/gifts)
- `createdAt` - Timestamp

**Indexes:**
- userId, createdAt (for history retrieval)
- userId, type (for transaction filtering)
- userId, source (for transaction source filtering)
- source (for analytics)
- createdAt (for pagination)

**Immutability:**
- Transactions cannot be updated after creation
- Only new transactions can be created
- Ensures audit trail integrity

## API Endpoints

### Public Routes

#### Get Wallet
```
GET /api/wallet
Authentication: Required
Response:
{
  "success": true,
  "wallet": {
    "balance": 150,
    "lifetimeEarned": 370,
    "level": 2,
    "levelName": "Climber",
    "streakCount": 5,
    ...
  }
}
```

#### Get Transaction History
```
GET /api/wallet/history?limit=50&offset=0
Authentication: Required
Response:
{
  "success": true,
  "transactions": [...],
  "pagination": {
    "limit": 50,
    "offset": 0,
    "total": 150,
    "hasMore": true
  }
}
```

#### Get Top Earners
```
GET /api/wallet/leaderboard/earners?limit=100
Response:
{
  "success": true,
  "earners": [...]
}
```

#### Get Top Spenders
```
GET /api/wallet/leaderboard/spenders?limit=100
Response:
{
  "success": true,
  "spenders": [...]
}
```

### Protected Routes (Authenticated Users)

#### Transfer Points
```
POST /api/wallet/transfer
Body: {
  "receiverId": "user_id",
  "amount": 50
}
Response:
{
  "success": true,
  "sender": {...},
  "receiver": {...},
  "transaction": {...}
}
```

#### Claim Daily Reward
```
POST /api/wallet/reward/daily
Response:
{
  "success": true,
  "wallet": {...},
  "transaction": {...},
  "message": "Daily reward claimed successfully"
}
Rate Limit: Once per 24 hours
```

#### Redeem Reward
```
POST /api/wallet/reward/redeem
Body: {
  "itemId": "vision-frame-neon",
  "amount": 250,
  "category": "vision-frame"
}
```

#### Referral Reward
```
POST /api/wallet/reward/referral
Body: {
  "referredUserId": "new_user_id"
}
```

#### Spend Points
```
POST /api/wallet/spend
Body: {
  "amount": 100,
  "source": "purchase"
}
```

#### QR Wallet Flow
```
POST /api/wallet/qr/generate
POST /api/wallet/qr/scan
```

### Admin Routes (Admin Only)

#### Admin Add Points
```
POST /api/wallet/admin/add
Authentication: Admin middleware required
Body: {
  "userId": "target_user_id",
  "amount": 100,
  "reason": "Adjustment reason"
}
Response:
{
  "success": true,
  "wallet": {...},
  "transaction": {...},
  "message": "Wallet adjusted successfully"
}
```

## Reward System

### Automatic Rewards

| Activity | Points | Source | Notes |
|----------|--------|--------|-------|
| Daily Login | +10 / +25 / +75 / +500 | daily_login | 24h cooldown with Day 1, 3, 7, and 30 streak bonuses |
| Video Upload | +20 | video_upload | Per upload |
| Live Stream Start | +50 | live_stream | Per stream |
| Referral Signup | +50 | referral | Per new user |
| Trending Content | +200 | trending_content | Manual trigger |
| First Time Bonus | +500 | first_time_bonus | Auto on wallet creation |

### User Levels

| Level | Name | Min Points | Description |
|-------|------|-----------|-------------|
| 1 | Starter | 0 | New users |
| 2 | Climber | 500 | Active participants |
| 3 | Influencer | 2000 | Growing creators |
| 4 | Superstar | 5000 | Major creators |
| 5 | Legend | 10000 | Top earners |

## Socket.IO Real-Time Events

### Client to Server

```javascript
// Get current wallet
socket.emit('wallet:get');

// Get transaction history
socket.emit('wallet:history', { limit: 50, offset: 0 });

// Claim daily reward
socket.emit('wallet:claim-daily');
```

### Server to Client

```javascript
// Wallet data received
socket.on('wallet:data', (wallet) => { ... });

// Transaction history received
socket.on('wallet:history', (data) => { ... });

// Reward earned
socket.on('wallet:reward', (reward) => { ... });

// Wallet balance updated
socket.on('wallet:update', (data) => { ... });

// Gift received
socket.on('wallet:gift', (gift) => { ... });

// Balance change notification
socket.on('wallet:balance-change', (data) => { ... });

// Error occurred
socket.on('wallet:error', (error) => { ... });
```

## Integration Hooks

Use wallet hooks to trigger rewards from other modules.

```javascript
// In video upload controller
const { triggerVideoUploadReward } = require("../../modules/wallet/walletHooks");
await triggerVideoUploadReward(userId, videoId);

// In live stream controller
const { triggerLiveStreamReward } = require("../../modules/wallet/walletHooks");
await triggerLiveStreamReward(userId, streamId);

// In trending detection system
const { triggerTrendingReward } = require("../../modules/wallet/walletHooks");
await triggerTrendingReward(userId, contentId);

// In referral system
const { triggerReferralReward } = require("../../modules/wallet/walletHooks");
await triggerReferralReward(referrerId, newUserId);
```

## Service API

The wallet service provides core business logic methods:

```javascript
const walletService = require('./modules/wallet/walletService');

// Get or create wallet
const wallet = await walletService.getWallet(userId);

// Add points
const result = await walletService.addPoints(userId, 50, 'video_upload', { videoId });

// Spend points
const result = await walletService.spendPoints(userId, 30, 'gift_sent', { giftId });

// Transfer between users
const result = await walletService.transferPoints(senderId, receiverId, 100);

// Send gift
const result = await walletService.sendGift(senderId, receiverId, 'rose', 10);

// Reward operations
await walletService.rewardDailyLogin(userId);
await walletService.rewardVideoUpload(userId, videoId);
await walletService.rewardLiveStream(userId, streamId);
await walletService.rewardReferral(referrerId, newUserId);
await walletService.rewardTrendingContent(userId, contentId);

// Admin operations
const result = await walletService.adminAdjustment(userId, 100, 'Manual adjustment', adminId);

// Get history
const history = await walletService.getTransactionHistory(userId, limit, offset);

// Leaderboards
const earners = await walletService.getTopEarners(100);
const spenders = await walletService.getTopSpenders(100);
```

## Gift System (Foundation)

Prepared for future live gift implementation.

### Gift Definitions

```javascript
const gifts = {
  ROSE: { pointsCost: 10, creatorRewardPercent: 50 },
  FIRE: { pointsCost: 50, creatorRewardPercent: 60 },
  CROWN: { pointsCost: 100, creatorRewardPercent: 70 },
  DIAMOND: { pointsCost: 500, creatorRewardPercent: 80 },
};
```

**Creator Reward Percent**: Percentage of gift value awarded to creator

## Security Features

- **No Direct Balance Editing**: Only through transactions
- **Atomic Operations**: MongoDB sessions prevent race conditions
- **Immutable History**: Transactions cannot be updated
- **Amount Validation**: All amounts validated and sanitized
- **Admin Audit Trail**: All admin actions logged with admin ID
- **Metadata Sanitization**: Metadata objects restricted to safe properties
- **Rate Limiting**: API endpoints protected with rate limits
- **Negative Balance Prevention**: Cannot spend more than balance
- **Duplicate Prevention**: Cooldown periods prevent activity spam

## Rate Limits

- **General Wallet Operations**: 100 requests per 15 minutes
- **Transfer Operations**: 10 transfers per 1 minute
- **Daily Reward**: Once per 24 hours per user
- **Admin Operations**: 50 requests per 1 minute

## Future Token Migration Preparation

### Design for NEX COIN Conversion

The system is designed to support future migration to NEX COIN blockchain token:

1. **Conversion Ready Structure**
   - Points tracked separately from tokens
   - Metadata supports conversion records
   - Transaction history immutable for proof

2. **Admin Controls**
   - Admin can create conversion transactions
   - Snapshot current points for migration
   - Track conversion rates

3. **Future Steps** (not implemented yet)
   - Blockchain integration module
   - Smart contract calls
   - Token transfer APIs
   - Conversion transaction creation

## Performance Optimization

- **Lean Queries**: Minimal field selection in reads
- **Indexed Queries**: All common queries indexed
- **Pagination**: History support pagination
- **Atomic Transactions**: MongoDB sessions prevent blocking
- **Socket Efficiency**: Targeted room emissions

## Error Handling

All endpoints return consistent error responses:

```json
{
  "success": false,
  "message": "Error description",
  "code": "ERROR_CODE"
}
```

Common error codes:
- `INSUFFICIENT_BALANCE` - Not enough points
- `DAILY_REWARD_ALREADY_CLAIMED` - Daily reward cooldown active
- `IMMUTABLE_TRANSACTION` - Cannot update transaction
- `INVALID_AMOUNT` - Invalid amount value
- `INVALID_USER_ID` - Invalid user ID

## Monitoring & Analytics

Transaction types and sources are indexed for analytics queries:

```javascript
// Example: Get all referral bonuses for a user
const referralTxns = await WalletTransaction.find({
  userId: someUserId,
  source: 'referral'
});

// Example: Get all trending content rewards
const trendingRewards = await WalletTransaction.find({
  source: 'trending_content'
});

// Example: Get admin adjustments
const adminTxns = await WalletTransaction.find({
  type: 'admin_adjustment'
});
```

## Testing

Key operations to test:

1. **Wallet Creation**: Verify wallet auto-creates on first access
2. **Add Points**: Verify balance updates correctly
3. **Spend Points**: Verify negative balance prevention
4. **Transfers**: Test transfer between users
5. **Gifts**: Test gift sending and receiving
6. **Daily Rewards**: Test 24-hour cooldown
7. **Level Calculation**: Test level updates on earned points
8. **Transaction History**: Verify immutability
9. **Admin Operations**: Test admin adjustments
10. **Socket Events**: Test real-time updates

## Future Enhancements

1. **Streaming Analytics**: Real-time gift analytics dashboard
2. **Creator Payouts**: System for creator earnings payouts
3. **Economy Management**: Admin controls for activity rewards
4. **Seasonal Events**: Time-limited reward bonuses
5. **Achievement System**: Milestone-based rewards
6. **Marketplace**: In-app shop for rewards/perks
7. **Blockchain Integration**: NEX COIN smart contracts
8. **Multi-Chain Support**: Support multiple blockchain networks

## Contributing

When integrating wallet features:

1. Use wallet hooks for triggering rewards
2. Always validate amounts before operations
3. Log integration errors with context
4. Test with real wallet operations
5. Keep socket integrations isolated
6. Document new transaction sources
7. Update constants for new rewards

## Support & Debugging

Enable detailed logging by checking socket initialization in socket.js.

Common issues:

- **Wallet not created**: Verify User exists with valid _id
- **Transaction fails**: Check MongoDB connection and session support
- **Socket not updating**: Verify user is in correct room (userId.toString())
- **Rate limit exceeded**: Check rate limit windows and adjust if needed
