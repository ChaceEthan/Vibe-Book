// @ts-nocheck
/**
 * WALLET INTEGRATION EXAMPLES
 * Copy these patterns to integrate wallet rewards into existing controllers
 */

// ============================================================
// EXAMPLE 1: VIDEO UPLOAD CONTROLLER
// ============================================================

// In backend/src/controllers/videoController.js

const { triggerVideoUploadReward } = require("../modules/wallet/walletHooks");

exports.uploadVideo = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const videoFile = req.file;

    // ... existing video upload logic ...

    // Create video in database
    const video = await Video.create({
      userId,
      title: req.body.title,
      description: req.body.description,
      fileUrl: videoUrl,
      // ... other fields
    });

    // Trigger wallet reward (NEW)
    try {
      await triggerVideoUploadReward(userId, video._id);
    } catch (error) {
      console.error("[wallet] video upload reward failed:", error.message);
      // Don't fail the entire upload if reward fails
    }

    return res.json({
      success: true,
      video,
      message: "Video uploaded successfully and reward claimed!",
    });
  } catch (error) {
    next(error);
  }
};

// ============================================================
// EXAMPLE 2: LIVE STREAM CONTROLLER
// ============================================================

// In backend/src/controllers/liveController.js (new or existing)

const { triggerLiveStreamReward } = require("../modules/wallet/walletHooks");

exports.startLiveStream = async (req, res, next) => {
  try {
    const userId = req.user._id;

    // ... existing live stream creation logic ...

    const liveStream = await LiveStream.create({
      userId,
      title: req.body.title,
      // ... other fields
    });

    // Trigger wallet reward (NEW)
    try {
      await triggerLiveStreamReward(userId, liveStream._id);
    } catch (error) {
      console.error("[wallet] live stream reward failed:", error.message);
    }

    return res.json({
      success: true,
      stream: liveStream,
      message: "Live stream started! 50 NEX Points awarded.",
    });
  } catch (error) {
    next(error);
  }
};

// ============================================================
// EXAMPLE 3: REFERRAL SYSTEM
// ============================================================

// In backend/src/controllers/authController.js (modify register)

const { triggerReferralReward } = require("../modules/wallet/walletHooks");

exports.register = async (req, res, next) => {
  try {
    // ... existing registration logic ...

    const newUser = await User.create({
      name: req.body.name,
      email: req.body.email,
      // ... other fields
    });

    // Check for referral code
    const referralCode = req.body.referralCode;
    if (referralCode) {
      try {
        const referrer = await User.findOne({ referralCode });
        if (referrer) {
          // Reward the referrer (NEW)
          await triggerReferralReward(referrer._id, newUser._id);
        }
      } catch (error) {
        console.error("[wallet] referral reward failed:", error.message);
      }
    }

    return res.json({
      success: true,
      user: newUser,
      token: generateToken(newUser),
    });
  } catch (error) {
    next(error);
  }
};

// ============================================================
// EXAMPLE 4: GIFT SENDING (LIVE STREAM)
// ============================================================

// In socket.js or a gift controller

const { triggerGiftSend } = require("../modules/wallet/walletHooks");

io.on("connection", (socket) => {
  socket.on("send_gift", async (payload, callback) => {
    try {
      const senderId = socket.user._id;
      const { receiverId, giftId } = payload;

      // Validate gift exists
      const giftDef = GIFT_DEFINITIONS[giftId];
      if (!giftDef) {
        return callback({ success: false, message: "Invalid gift" });
      }

      // Send gift and update wallets (NEW)
      const result = await triggerGiftSend(
        senderId,
        receiverId,
        giftId,
        giftDef.pointsCost
      );

      // Emit gift animation to stream viewers
      io.to(receiverId.toString()).emit("receive_gift", {
        giftId,
        giftName: giftDef.name,
        senderId,
        senderName: socket.user.name,
        animation: giftDef.animation,
      });

      callback({
        success: true,
        message: `Gift sent! ${giftDef.pointsCost} NEX Points spent`,
      });
    } catch (error) {
      if (error.code === "INSUFFICIENT_BALANCE") {
        return callback({ success: false, message: "Insufficient balance" });
      }
      console.error("[gift] send failed:", error.message);
      callback({ success: false, message: "Gift send failed" });
    }
  });
});

// ============================================================
// EXAMPLE 5: TRENDING CONTENT DETECTION
// ============================================================

// In a cron job or monitoring service

const { triggerTrendingReward } = require("../modules/wallet/walletHooks");

const checkTrendingContent = async () => {
  try {
    // Find trending videos (e.g., high view count in last 24 hours)
    const trendingVideos = await Video.find({
      viewCount: { $gt: 1000 },
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      trendingRewardClaimed: { $ne: true },
    }).limit(10);

    for (const video of trendingVideos) {
      try {
        // Reward creator for trending content
        await triggerTrendingReward(video.userId, video._id);

        // Mark as claimed
        video.trendingRewardClaimed = true;
        await video.save();

        console.log(`[trending] Rewarded user ${video.userId} for video ${video._id}`);
      } catch (error) {
        console.error(`[trending] reward failed for video ${video._id}:`, error.message);
      }
    }
  } catch (error) {
    console.error("[trending check] failed:", error.message);
  }
};

// Run every hour
setInterval(checkTrendingContent, 60 * 60 * 1000);

// ============================================================
// EXAMPLE 6: FRONTEND - WALLET REACT COMPONENT
// ============================================================

/*
// In frontend/src/components/WalletDisplay.jsx

import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

export default function WalletDisplay() {
  const { user } = useAuth();
  const [wallet, setWallet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);

  useEffect(() => {
    fetchWallet();
  }, []);

  const fetchWallet = async () => {
    try {
      const response = await api.get('/wallet');
      setWallet(response.data.wallet);
    } catch (error) {
      console.error('Failed to fetch wallet:', error);
    } finally {
      setLoading(false);
    }
  };

  const claimDailyReward = async () => {
    try {
      setClaiming(true);
      const response = await api.post('/wallet/reward/daily');
      setWallet(response.data.wallet);
      alert(`🎉 Claimed 5 NEX Points! Total: ${response.data.wallet.balance}`);
    } catch (error) {
      if (error.response?.data?.code === 'DAILY_REWARD_ALREADY_CLAIMED') {
        alert('Daily reward already claimed. Try again tomorrow!');
      } else {
        alert('Failed to claim daily reward');
      }
    } finally {
      setClaiming(false);
    }
  };

  if (loading) return <div>Loading wallet...</div>;
  if (!wallet) return <div>Failed to load wallet</div>;

  return (
    <div className="wallet-container">
      <div className="wallet-balance">
        <h2>💰 NEX Points</h2>
        <div className="balance-display">{wallet.balance}</div>
        <div className="level-badge">
          Level {wallet.level} - {wallet.levelName}
        </div>
      </div>

      <div className="wallet-stats">
        <div>
          <label>Lifetime Earned</label>
          <span>{wallet.lifetimeEarned}</span>
        </div>
        <div>
          <label>Lifetime Spent</label>
          <span>{wallet.lifetimeSpent}</span>
        </div>
      </div>

      <button
        onClick={claimDailyReward}
        disabled={claiming}
        className="claim-button"
      >
        {claiming ? 'Claiming...' : '📅 Claim Daily Bonus'}
      </button>
    </div>
  );
}
*/

// ============================================================
// EXAMPLE 7: FRONTEND - WALLET SOCKET INTEGRATION
// ============================================================

/*
// In frontend/src/hooks/useWalletSocket.js

import { useEffect, useCallback } from 'react';
import { socket } from '../services/socket';

export function useWalletSocket(onUpdate, onReward) {
  useEffect(() => {
    // Listen for wallet updates
    socket.on('wallet:update', (data) => {
      console.log('Wallet updated:', data);
      onUpdate?.(data);
    });

    // Listen for rewards
    socket.on('wallet:reward', (reward) => {
      console.log('Reward earned:', reward);
      onReward?.(reward);

      // Show toast notification
      showToast({
        type: 'success',
        title: 'Reward Earned!',
        message: reward.message,
      });
    });

    // Listen for errors
    socket.on('wallet:error', (error) => {
      console.error('Wallet error:', error);
    });

    return () => {
      socket.off('wallet:update');
      socket.off('wallet:reward');
      socket.off('wallet:error');
    };
  }, [onUpdate, onReward]);
}
*/

// ============================================================
// EXAMPLE 8: ADMIN WALLET ADJUSTMENT
// ============================================================

// Using the API directly with curl

/*
curl -X POST http://localhost:5000/api/wallet/admin/add \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "6543210987654321098765432",
    "amount": 1000,
    "reason": "Welcome bonus for new creator"
  }'

Response:
{
  "success": true,
  "wallet": {
    "balance": 1000,
    "lifetimeEarned": 1000,
    ...
  },
  "transaction": {
    "_id": "...",
    "type": "admin_adjustment",
    "amount": 1000,
    "source": "admin_manual",
    "description": "Admin adjustment: Welcome bonus for new creator",
    ...
  },
  "message": "Wallet adjusted successfully"
}
*/

// ============================================================
// EXAMPLE 9: ERROR HANDLING
// ============================================================

const { triggerVideoUploadReward } = require("../modules/wallet/walletHooks");

exports.uploadVideo = async (req, res, next) => {
  try {
    const userId = req.user._id;

    // ... upload logic ...

    const video = await Video.create({ userId, /* ... */ });

    // Try to reward, but don't fail upload if it fails
    try {
      await triggerVideoUploadReward(userId, video._id);
    } catch (error) {
      // Log error but continue - wallet is non-critical
      console.error("[wallet] reward failed for video upload:", {
        userId,
        videoId: video._id,
        error: error.message,
      });

      // Could queue for retry:
      // await queueWalletRetry(userId, 'video_upload', video._id);
    }

    return res.json({
      success: true,
      video,
      message: "Video uploaded successfully!",
    });
  } catch (error) {
    next(error);
  }
};

// ============================================================
// EXAMPLE 10: TRANSACTION HISTORY FETCH
// ============================================================

/*
// Frontend code
const fetchWalletHistory = async () => {
  try {
    const response = await api.get('/wallet/history', {
      params: {
        limit: 50,
        offset: 0,
      }
    });

    console.log('Transactions:', response.data.transactions);
    // [
    //   {
    //     _id: '...',
    //     type: 'earn',
    //     amount: 20,
    //     source: 'video_upload',
    //     description: 'Video upload reward',
    //     balanceBefore: 130,
    //     balanceAfter: 150,
    //     status: 'completed',
    //     createdAt: '2026-05-11T...',
    //   },
    //   ...
    // ]

    console.log('Pagination:', response.data.pagination);
    // {
    //   limit: 50,
    //   offset: 0,
    //   total: 150,
    //   hasMore: true
    // }
  } catch (error) {
    console.error('Failed to fetch history:', error);
  }
};
*/

module.exports = {
  example: "See comments above for usage patterns",
};
