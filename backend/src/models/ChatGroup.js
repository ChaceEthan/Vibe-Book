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

const idOf = (value) => value?._id?.toString?.() || value?.toString?.() || "";

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

  if (!Array.isArray(this.members)) {
    this.members = [];
  }

  this.members = Array.from(new Set(this.members.map(idOf).filter(Boolean)));
};

chatGroupSchema.pre("validate", function () {
  this.syncGroupAliases();
});

chatGroupSchema.pre("save", function () {
  this.syncGroupAliases();
});

module.exports = mongoose.model("ChatGroup", chatGroupSchema);
