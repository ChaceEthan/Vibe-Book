// @ts-nocheck
const mongoose = require("mongoose");
const { normalizeMemberId } = require("../utils/groupMembership");

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
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    moderators: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    members: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    pendingInvites: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    description: {
      type: String,
      trim: true,
      maxlength: 240,
      default: "",
    },
    avatar: {
      type: String,
      trim: true,
      default: "",
    },
    visibility: {
      type: String,
      enum: ["public", "private"],
      default: "public",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

const idOf = normalizeMemberId;

chatGroupSchema.methods.syncGroupAliases = function () {
  if (this.groupName && !this.name) {
    this.name = this.groupName;
  }

  if (this.name && !this.groupName) {
    this.groupName = this.name;
  }

  if (!this.createdBy && this.adminId) {
    this.createdBy = this.adminId;
  }

  if (!this.adminId && this.createdBy) {
    this.adminId = this.createdBy;
  }

  if (!this.owner && (this.createdBy || this.adminId)) {
    this.owner = this.createdBy || this.adminId;
  }

  if (!this.createdBy && this.owner) {
    this.createdBy = this.owner;
  }

  if (!Array.isArray(this.members)) {
    this.members = [];
  }

  this.members = Array.from(new Set(this.members.map(idOf).filter(Boolean)));
  if (this.owner && !this.members.some((memberId) => memberId === idOf(this.owner))) {
    this.members.unshift(idOf(this.owner));
  }
  this.moderators = Array.from(new Set((this.moderators || []).map(idOf).filter(Boolean))).filter(
    (memberId) => memberId !== idOf(this.owner) && this.members.includes(memberId)
  );
  this.pendingInvites = Array.from(new Set((this.pendingInvites || []).map(idOf).filter(Boolean)));
};

chatGroupSchema.pre("validate", function () {
  this.syncGroupAliases();
});

chatGroupSchema.pre("save", function () {
  this.syncGroupAliases();
});

module.exports = mongoose.model("ChatGroup", chatGroupSchema);
