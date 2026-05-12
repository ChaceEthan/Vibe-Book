// @ts-nocheck
/**
 * Wallet Hooks
 * Integration points for wallet rewards in other modules
 * Call these functions from controllers to trigger wallet rewards
 *
 * Example usage in videoController.js:
 * const { triggerVideoUploadReward } = require("../../modules/wallet/walletHooks");
 * await triggerVideoUploadReward(userId, videoId);
 */

const walletService = require("./walletService");
const { emitRewardNotification, emitWalletUpdate } = require("./walletSocket");
const io = require("../../socket");

/**
 * Trigger reward when user uploads video
 */
const triggerVideoUploadReward = async (userId, videoId) => {
  try {
    const result = await walletService.rewardVideoUpload(userId, videoId);

    if (result && io?.getIo?.()) {
      emitRewardNotification(io.getIo(), userId, {
        type: "video_upload",
        amount: 20,
        source: "video_upload",
        message: "You earned 20 NEX Points for uploading a video!",
      });
      emitWalletUpdate(io.getIo(), userId, result.wallet);
    }

    return result;
  } catch (error) {
    console.error("[wallet hook] triggerVideoUploadReward failed:", error.message);
    throw error;
  }
};

/**
 * Trigger reward when user starts live stream
 */
const triggerLiveStreamReward = async (userId, streamId) => {
  try {
    const result = await walletService.rewardLiveStream(userId, streamId);

    if (result && io?.getIo?.()) {
      emitRewardNotification(io.getIo(), userId, {
        type: "live_stream",
        amount: 50,
        source: "live_stream",
        message: "You earned 50 NEX Points for starting a live stream!",
      });
      emitWalletUpdate(io.getIo(), userId, result.wallet);
    }

    return result;
  } catch (error) {
    console.error("[wallet hook] triggerLiveStreamReward failed:", error.message);
    throw error;
  }
};

/**
 * Trigger reward when trending content detected
 */
const triggerTrendingReward = async (userId, contentId) => {
  try {
    const result = await walletService.rewardTrendingContent(userId, contentId);

    if (result && io?.getIo?.()) {
      emitRewardNotification(io.getIo(), userId, {
        type: "trending_content",
        amount: 200,
        source: "trending_content",
        message: "Your content is trending! You earned 200 NEX Points!",
      });
      emitWalletUpdate(io.getIo(), userId, result.wallet);
    }

    return result;
  } catch (error) {
    console.error("[wallet hook] triggerTrendingReward failed:", error.message);
    throw error;
  }
};

/**
 * Trigger reward for referral signup
 */
const triggerReferralReward = async (referrerId, newUserId) => {
  try {
    const result = await walletService.rewardReferral(referrerId, newUserId);

    if (result && io?.getIo?.()) {
      emitRewardNotification(io.getIo(), referrerId, {
        type: "referral",
        amount: 100,
        source: "referral",
        message: "You earned 100 NEX Points for referring a new user!",
      });
      emitWalletUpdate(io.getIo(), referrerId, result.wallet);
    }

    return result;
  } catch (error) {
    console.error("[wallet hook] triggerReferralReward failed:", error.message);
    throw error;
  }
};

/**
 * Trigger gift send
 */
const triggerGiftSend = async (senderId, receiverId, giftId, pointsValue) => {
  try {
    const result = await walletService.sendGift(senderId, receiverId, giftId, pointsValue, {
      giftId,
      timestamp: new Date().toISOString(),
    });

    if (result && io?.getIo?.()) {
      emitWalletUpdate(io.getIo(), senderId, result.sender);
      emitWalletUpdate(io.getIo(), receiverId, result.receiver);

      // Notify gift recipient
      emitRewardNotification(io.getIo(), receiverId, {
        type: "gift_received",
        amount: pointsValue,
        source: "gift_received",
        message: `You received a ${giftId} gift worth ${pointsValue} NEX Points!`,
      });
    }

    return result;
  } catch (error) {
    console.error("[wallet hook] triggerGiftSend failed:", error.message);
    throw error;
  }
};

module.exports = {
  triggerVideoUploadReward,
  triggerLiveStreamReward,
  triggerTrendingReward,
  triggerReferralReward,
  triggerGiftSend,
};
