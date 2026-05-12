// @ts-nocheck
/**
 * Wallet Module Index
 * Exports all wallet-related modules and utilities
 */

module.exports = {
  // Models
  Wallet: require("./walletModel"),
  WalletTransaction: require("./walletTransactionModel"),

  // Service
  walletService: require("./walletService"),

  // Controller
  walletController: require("./walletController"),

  // Routes
  walletRoutes: require("./walletRoutes"),

  // Socket
  walletSocket: require("./walletSocket"),

  // Constants
  ...require("./walletConstants"),

  // Utils
  ...require("./walletUtils"),
};
