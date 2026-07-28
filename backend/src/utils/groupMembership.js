// @ts-nocheck
const mongoose = require("mongoose");

const normalizeMemberId = (value) => {
  const candidate =
    value?.userId?._id ||
    value?.userId?.id ||
    value?.userId ||
    value?.user?._id ||
    value?.user?.id ||
    value?.user ||
    value?._id ||
    value?.id ||
    value ||
    "";
  const id = candidate?.toString?.() || String(candidate || "");

  return mongoose.isValidObjectId(id) ? id : "";
};

const isGroupMember = (group, userId) => {
  const targetId = normalizeMemberId(userId);

  return Boolean(
    targetId &&
      Array.isArray(group?.members) &&
      group.members.some((member) => normalizeMemberId(member) === targetId)
  );
};

module.exports = {
  isGroupMember,
  normalizeMemberId,
};
