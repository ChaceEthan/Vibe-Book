// @ts-nocheck
const mongoose = require("mongoose");

const chatGroupSchema = new mongoose.Schema(
  {
    groupName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    name: {
      type: String,
      trim: true,
      maxlength: 80,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    members: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

chatGroupSchema.pre("validate", function syncGroupAliases(next) {
  if (!this.groupName && this.name) {
    this.groupName = this.name;
  }

  if (!this.name && this.groupName) {
    this.name = this.groupName;
  }

  if (!this.createdBy && this.adminId) {
    this.createdBy = this.adminId;
  }

  if (!this.adminId && this.createdBy) {
    this.adminId = this.createdBy;
  }

  next();
});

module.exports = mongoose.model("ChatGroup", chatGroupSchema);
