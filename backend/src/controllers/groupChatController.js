const ChatGroup = require("../models/ChatGroup");
const GroupMessage = require("../models/GroupMessage");
const User = require("../models/User");
const { getIo, isUserOnline } = require("../socket");
const { sanitizeChatMessage, validateChatMessage } = require("../utils/chatModeration");

const memberSelect = "name role profileImage profilePicture images gallery";

const uniqueIds = (values = []) => {
  return Array.from(new Set(values.map((value) => value?.toString?.() || String(value)).filter(Boolean)));
};

const ensureMember = (group, userId) => {
  return group.members.some((member) => {
    const id = member?._id?.toString?.() || member?.toString?.();
    return id === userId.toString();
  });
};

const serializeGroup = (group) => {
  const members = Array.isArray(group.members) ? group.members : [];

  return {
    _id: group._id,
    groupName: group.groupName,
    createdBy: group.createdBy,
    members,
    onlineUsersCount: members.filter((member) => isUserOnline(member?._id || member)).length,
    createdAt: group.createdAt,
    updatedAt: group.updatedAt,
  };
};

const listGroups = async (req, res, next) => {
  try {
    const groups = await ChatGroup.find({
      members: req.user._id,
      isActive: true,
    })
      .populate("members", memberSelect)
      .sort({ updatedAt: -1 });

    return res.json({ groups: groups.map(serializeGroup) });
  } catch (error) {
    return next(error);
  }
};

const createGroup = async (req, res, next) => {
  try {
    const groupName = sanitizeChatMessage(req.body.groupName).slice(0, 80);
    const memberIds = uniqueIds([req.user._id, ...(Array.isArray(req.body.members) ? req.body.members : [])]);

    if (!groupName) {
      return res.status(400).json({ message: "Group name is required" });
    }

    if (memberIds.length < 2) {
      return res.status(400).json({ message: "Add at least one member" });
    }

    const members = await User.find({
      _id: { $in: memberIds },
      isBlocked: false,
    }).select("_id");

    if (members.length !== memberIds.length) {
      return res.status(400).json({ message: "One or more members are invalid" });
    }

    const group = await ChatGroup.create({
      groupName,
      createdBy: req.user._id,
      members: memberIds,
    });

    await group.populate("members", memberSelect);

    return res.status(201).json({ group: serializeGroup(group), message: "Group created" });
  } catch (error) {
    return next(error);
  }
};

const getGroupMessages = async (req, res, next) => {
  try {
    const group = await ChatGroup.findOne({
      _id: req.params.groupId,
      isActive: true,
    }).populate("members", memberSelect);

    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    if (!ensureMember(group, req.user._id)) {
      return res.status(403).json({ message: "You are not a member of this group" });
    }

    const messages = await GroupMessage.find({ group: group._id })
      .populate("sender", memberSelect)
      .sort({ createdAt: 1 })
      .limit(300);

    return res.json({ group: serializeGroup(group), messages });
  } catch (error) {
    return next(error);
  }
};

const sendGroupMessage = async (req, res, next) => {
  try {
    const validation = validateChatMessage(req.body.message);

    if (validation.error) {
      return res.status(400).json({ message: validation.error });
    }

    const group = await ChatGroup.findOne({
      _id: req.params.groupId,
      isActive: true,
    });

    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    if (!ensureMember(group, req.user._id)) {
      return res.status(403).json({ message: "You are not a member of this group" });
    }

    const groupMessage = await GroupMessage.create({
      group: group._id,
      sender: req.user._id,
      message: validation.message,
    });

    group.updatedAt = new Date();
    await group.save();
    await groupMessage.populate("sender", memberSelect);

    group.members.forEach((memberId) => {
      getIo()?.to(memberId.toString()).emit("group:message", {
        groupId: group._id,
        message: groupMessage,
      });
    });

    return res.status(201).json({ groupMessage, message: "Message sent" });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  createGroup,
  getGroupMessages,
  listGroups,
  sendGroupMessage,
};

