// @ts-nocheck
const crypto = require("crypto");
const mongoose = require("mongoose");

const User = require("../../models/User");
const { nexCoinEstimate } = require("../../utils/pointsCalculator");

const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const idOf = (value) => value?._id?.toString?.() || value?.id?.toString?.() || value?.toString?.() || "";

const cleanUsername = (value = "creator") => {
  const base = String(value || "creator")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "")
    .slice(0, 18);
  return base || "creator";
};

const shortCode = (size = 6) => {
  const bytes = crypto.randomBytes(size);
  return Array.from(bytes)
    .map((byte) => alphabet[byte % alphabet.length])
    .join("");
};

const walletPrefixFor = (user = {}) => {
  const name = cleanUsername(user.username || user.name || "creator").toUpperCase().replace(/_/g, "").slice(0, 8);
  return name || "CREATOR";
};

const generateWalletId = (user = {}) => `VBX-${walletPrefixFor(user)}-${shortCode(4)}`;
const generateNexHandle = (user = {}) => `@${cleanUsername(user.username || user.name)}.pay`;
const generateFallbackNexHandle = (user = {}) => `@${cleanUsername(user.username || user.name)}${shortCode(3).toLowerCase()}.pay`;

const serializeWalletIdentity = (user = {}, wallet = null) => {
  const estimate = nexCoinEstimate(wallet?.balance || 0);
  const walletId = user.walletId || "";
  const nexHandle = user.nexHandle || "";
  return {
    walletId,
    nexHandle,
    walletVerified: Boolean(user.walletVerified || user.isVerified),
    walletPinEnabled: Boolean(user.walletPinEnabled),
    walletSecurityLevel: user.walletSecurityLevel || "basic",
    walletReceiveEnabled: user.walletReceiveEnabled !== false,
    receiveLink: walletId ? `/wallet/receive?to=${encodeURIComponent(walletId)}` : "",
    qrPayload: walletId ? {
      walletId,
      username: user.username || user.name || "creator",
      userId: idOf(user),
      chain: "NEX",
    } : null,
    payoutProfile: {
      payoutReady: Boolean(user.payoutEligible),
      mobileMoneyReady: Boolean(user.walletSettings?.linkedAccounts?.mobileMoneyReady),
      cryptoWalletReady: Boolean(user.walletSettings?.linkedAccounts?.cryptoWalletReady),
      bankAccountReady: Boolean(user.walletSettings?.linkedAccounts?.bankAccountReady),
      stablecoinReady: Boolean(user.walletSettings?.linkedAccounts?.stablecoinReady),
      nexCoinReady: true,
    },
    tokenMigration: {
      pointsPerCoin: estimate.pointsPerCoin,
      estimatedCoins: estimate.estimatedCoins,
      exportable: true,
      stage: wallet?.tokenMigration?.stage || "points",
      futureTokenName: "NEX COIN",
      launchReady: false,
    },
  };
};

const ensureWalletIdentity = async (userOrId, options = {}) => {
  const query = mongoose.isValidObjectId(idOf(userOrId)) ? { _id: idOf(userOrId) } : userOrId;
  let user = userOrId && userOrId.walletId !== undefined ? userOrId : await User.findOne(query);

  if (!user) {
    const error = new Error("User not found");
    error.code = "USER_NOT_FOUND";
    throw error;
  }

  if (user.walletId && user.nexHandle) {
    return user;
  }

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const walletId = user.walletId || generateWalletId(user);
    const nexHandle = user.nexHandle || (attempt === 0 ? generateNexHandle(user) : generateFallbackNexHandle(user));
    try {
      const updated = await User.findOneAndUpdate(
        {
          _id: user._id,
          ...(user.walletId ? {} : { walletId: { $exists: false } }),
          ...(user.nexHandle ? {} : { nexHandle: { $exists: false } }),
        },
        {
          $set: {
            ...(user.walletId ? {} : { walletId }),
            ...(user.nexHandle ? {} : { nexHandle }),
            walletReceiveEnabled: user.walletReceiveEnabled !== false,
            walletSecurityLevel: user.walletSecurityLevel || "basic",
          },
          $setOnInsert: {},
        },
        { new: true, runValidators: true }
      );

      if (updated?.walletId && updated?.nexHandle) {
        return updated;
      }

      user = await User.findById(user._id);
      if (user?.walletId && user?.nexHandle) return user;
    } catch (error) {
      if (error?.code !== 11000) throw error;
    }
  }

  const error = new Error("Unable to generate unique wallet identity");
  error.code = "WALLET_IDENTITY_GENERATION_FAILED";
  throw error;
};

const findUserByWalletIdentifier = async (identifier = "") => {
  const value = String(identifier || "").trim();
  if (!value) return null;

  if (mongoose.isValidObjectId(value)) {
    const user = await User.findById(value);
    return user ? ensureWalletIdentity(user) : null;
  }

  const normalizedHandle = value.startsWith("@") ? value.toLowerCase() : `@${value.toLowerCase()}`;
  const username = value.replace(/^@/, "").replace(/\.pay$/i, "").toLowerCase();
  const walletId = value.toUpperCase();

  const user = await User.findOne({
    $or: [
      { walletId },
      { nexHandle: normalizedHandle },
      { username },
      { name: new RegExp(`^${username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
    ],
  });

  return user ? ensureWalletIdentity(user) : null;
};

const walletSettingsFor = (user = {}) => ({
  walletProfile: {
    walletId: user.walletId || "",
    nexHandle: user.nexHandle || "",
    walletVerified: Boolean(user.walletVerified || user.isVerified),
    walletSecurityLevel: user.walletSecurityLevel || "basic",
    walletReceiveEnabled: user.walletReceiveEnabled !== false,
  },
  identity: {
    immutable: true,
    username: user.username || "",
    displayName: user.name || "",
  },
  receive: {
    receiveQrEnabled: user.walletSettings?.receiveQrEnabled !== false,
    walletReceiveEnabled: user.walletReceiveEnabled !== false,
  },
  security: {
    walletPinEnabled: Boolean(user.walletPinEnabled),
    transferConfirmation: user.walletSettings?.transferConfirmation !== false,
    suspiciousActivityDetection: true,
    deviceSessionAwareness: true,
    antiFraudValidation: true,
  },
  notifications: {
    transferNotifications: user.walletSettings?.transferNotifications !== false,
  },
  linkedAccounts: {
    mobileMoneyReady: Boolean(user.walletSettings?.linkedAccounts?.mobileMoneyReady),
    cryptoWalletReady: Boolean(user.walletSettings?.linkedAccounts?.cryptoWalletReady),
    bankAccountReady: Boolean(user.walletSettings?.linkedAccounts?.bankAccountReady),
    stablecoinReady: Boolean(user.walletSettings?.linkedAccounts?.stablecoinReady),
    nexCoinReady: true,
  },
  futureCashoutMethods: {
    mobileMoney: Boolean(user.walletSettings?.futureCashoutMethods?.mobileMoney),
    bank: Boolean(user.walletSettings?.futureCashoutMethods?.bank),
    crypto: Boolean(user.walletSettings?.futureCashoutMethods?.crypto),
    stablecoin: Boolean(user.walletSettings?.futureCashoutMethods?.stablecoin),
    nexCoin: true,
  },
  privacy: {
    privacyMode: user.walletSettings?.privacyMode || "public",
  },
});

module.exports = {
  ensureWalletIdentity,
  findUserByWalletIdentifier,
  serializeWalletIdentity,
  walletSettingsFor,
};
