// @ts-nocheck
const mongoose = require("mongoose");

const ChatGroup = require("../models/ChatGroup");
const GroupMessage = require("../models/GroupMessage");
const User = require("../models/User");
const { getIo, isUserOnline } = require("../socket");
const { sanitizeChatMessage, validateChatMessage } = require("../utils/chatModeration");

const memberSelect = "name role profileImage profilePicture images gallery";
const groupRoomFor = (groupId) => `group:${groupId?.toString?.() || groupId}`;
const isProduction = process.env.NODE_ENV === "production";

const logServerError = (scope, error) => {
  const message = error?.message || "Unexpected error";

  if (isProduction) {
    console.error(`[${scope}] ${message}`);
    return;
  }

  console.error(`[${scope}]`, error);
};

const saveDocument = async (document, scope) => {
  try {
    return await document.save();
  } catch (error) {
    logServerError(`${scope}:mongoose-save`, error);
    error.vibeBookLogged = true;
    throw error;
  }
};

const normalizeId = (value) => {
  const id = value?._id?.toString?.() || value?.id?.toString?.() || value?.toString?.() || "";
  return mongoose.isValidObjectId(id) ? id : "";
};

const uniqueIds = (values = []) => Array.from(new Set(values.map(normalizeId).filter(Boolean)));

const normalizeMembers = (value) => {
  if (Array.isArray(value)) {
    return value;
  }

  return value ? [value] : [];
};

const isValidGroupId = (value) => Boolean(normalizeId(value));

const sendGroupError = (res, scope, error, fallback = "Group request failed") => {
  const isClientError = error?.name === "CastError" || error?.name === "ValidationError";
  const status = error?.statusCode || error?.status || (isClientError ? 400 : 500);
  const message = status >= 500 ? fallback : error?.message || fallback;

  if (status >= 500 && !error?.vibeBookLogged) {
    logServerError(scope, error);
  }

  return res.status(status).json({
    success: false,
    message,
  });
};

const ensureMember = (group, userId) => {
  const members = Array.isArray(group?.members) ? group.members : [];
  const targetId = normalizeId(userId);

  return members.some((member) => normalizeId(member) === targetId);
};

const serializeGroup = (group) => {
  const members = Array.isArray(group.members) ? group.members : [];
  const activeUsers = members.filter((member) => isUserOnline(member?._id || member));

  return {
    _id: group._id,
    groupName: group.groupName || group.name,
    name: group.name || group.groupName,
    createdBy: group.createdBy,
    adminId: group.adminId || group.createdBy,
    members,
    activeUsers,
    onlineUsersCount: activeUsers.length,
    createdAt: group.createdAt,
    updatedAt: group.updatedAt,
  };
};

const serializeGroupMessage = (message) => ({
  _id: message._id,
  group: message.group,
  groupId: message.group?._id?.toString?.() || message.group?.toString?.() || "",
  sender: message.sender,
  senderId: message.sender?._id?.toString?.() || message.sender?.toString?.() || "",
  message: message.message,
  text: message.message,
  type: message.type || "message",
  createdAt: message.createdAt,
  timestamp: message.createdAt,
});

const listGroups = async (req, res) => {
  try {
    const groups = await ChatGroup.find({
      members: req.user._id,
      isActive: true,
    })
      .populate("members", memberSelect)
      .sort({ updatedAt: -1 });

    return res.json({ groups: groups.map(serializeGroup) });
  } catch (error) {
    return sendGroupError(res, "group:list", error, "Unable to load groups");
  }
};

const createGroup = async (req, res) => {
  try {
    const body = req.body || {};
    const rawName = body.groupName || body.name || "";
    const groupName = sanitizeChatMessage(rawName).slice(0, 80);
    const requestedMembers = normalizeMembers(body.members);
    const creator = await User.findById(req.user._id).select("followers following");
    const memberIds = uniqueIds([
      req.user._id,
      ...requestedMembers,
      ...(creator?.followers || []),
      ...(creator?.following || []),
    ]);

    if (!groupName) {
      return res.status(400).json({ success: false, message: "Group name is required" });
    }

    const members = await User.find({
      _id: { $in: memberIds },
      isBlocked: false,
    }).select("_id");

    const activeMemberIds = uniqueIds(members.map((member) => member._id));

    if (!activeMemberIds.length) {
      return res.status(400).json({ success: false, message: "Unable to add group members" });
    }

    const group = new ChatGroup({
      groupName,
      name: groupName,
      createdBy: req.user._id,
      adminId: req.user._id,
      members: activeMemberIds,
      isActive: true,
    });

    await saveDocument(group, "group:create");
    await group.populate("members", memberSelect);

    const serializedGroup = serializeGroup(group);
    const io = getIo();

    if (io) {
      activeMemberIds.forEach((memberId) => {
        io.to(memberId.toString()).emit("group:created", { group: serializedGroup });
      });
    }

    return res.status(201).json({ success: true, group: serializedGroup, message: "Group created" });
  } catch (error) {
    return sendGroupError(res, "group:create", error, "Unable to create group");
  }
};

const listMembers = async (req, res) => {
  try {
    if (!isValidGroupId(req.params.groupId)) {
      return res.status(400).json({ success: false, message: "Valid groupId is required" });
    }

    const group = await ChatGroup.findOne({
      _id: req.params.groupId,
      isActive: true,
    }).populate("members", memberSelect);

    if (!group) {
      return res.status(404).json({ success: false, message: "Group not found" });
    }

    if (!ensureMember(group, req.user._id)) {
      return res.status(403).json({ success: false, message: "You are not a member of this group" });
    }

    return res.json({ group: serializeGroup(group), members: group.members || [] });
  } catch (error) {
    return sendGroupError(res, "group:members", error, "Unable to load group members");
  }
};

const joinGroup = async (req, res) => {
  try {
    if (!isValidGroupId(req.params.groupId)) {
      return res.status(400).json({ success: false, message: "Valid groupId is required" });
    }

    const group = await ChatGroup.findOne({
      _id: req.params.groupId,
      isActive: true,
    });

    if (!group) {
      return res.status(404).json({ success: false, message: "Group not found" });
    }

    const wasMember = ensureMember(group, req.user._id);

    if (!wasMember) {
      group.members = uniqueIds([...(group.members || []), req.user._id]);
      group.updatedAt = new Date();
      await saveDocument(group, "group:join");
    }

    const groupMessage = wasMember
      ? null
      : await GroupMessage.create({
          group: group._id,
          sender: req.user._id,
          message: `${req.user.name || "A member"} joined the group`,
          type: "system",
        });

    await Promise.all([group.populate("members", memberSelect), groupMessage?.populate("sender", memberSelect)]);

    if (groupMessage) {
      group.members.forEach((memberId) => {
        getIo()?.to((memberId?._id || memberId).toString()).emit("group:member-joined", {
          groupId: group._id,
          userId: req.user._id,
          message: serializeGroupMessage(groupMessage),
        });
      });
    }

    return res.json({ group: serializeGroup(group), groupMessage, message: "Joined group" });
  } catch (error) {
    return sendGroupError(res, "group:join", error, "Unable to join group");
  }
};

const leaveGroup = async (req, res) => {
  try {
    if (!isValidGroupId(req.params.groupId)) {
      return res.status(400).json({ success: false, message: "Valid groupId is required" });
    }

    const group = await ChatGroup.findOne({
      _id: req.params.groupId,
      isActive: true,
    });

    if (!group) {
      return res.status(404).json({ success: false, message: "Group not found" });
    }

    if (!ensureMember(group, req.user._id)) {
      return res.status(403).json({ success: false, message: "You are not a member of this group" });
    }

    const leavingUserId = req.user._id.toString();
    const remainingMembers = (Array.isArray(group.members) ? group.members : []).filter((memberId) => memberId.toString() !== leavingUserId);
    group.members = remainingMembers;

    if (!remainingMembers.length) {
      group.isActive = false;
    }

    if ((group.adminId || group.createdBy)?.toString() === leavingUserId && remainingMembers.length) {
      group.adminId = remainingMembers[0];
      group.createdBy = remainingMembers[0];
    }

    group.updatedAt = new Date();
    await saveDocument(group, "group:leave");
    getIo()?.in(leavingUserId).socketsLeave(groupRoomFor(group._id));

    const groupMessage = await GroupMessage.create({
      group: group._id,
      sender: req.user._id,
      message: `${req.user.name || "A member"} left the group`,
      type: "system",
    });

    await Promise.all([group.populate("members", memberSelect), groupMessage.populate("sender", memberSelect)]);

    remainingMembers.forEach((memberId) => {
      getIo()?.to(memberId.toString()).emit("group:member-left", {
        groupId: group._id,
        userId: req.user._id,
        message: serializeGroupMessage(groupMessage),
      });
    });

    return res.json({ group: serializeGroup(group), groupMessage, message: "Left group" });
  } catch (error) {
    return sendGroupError(res, "group:leave", error, "Unable to leave group");
  }
};

const getGroupMessages = async (req, res) => {
  try {
    if (!isValidGroupId(req.params.groupId)) {
      return res.status(400).json({ success: false, message: "Valid groupId is required" });
    }

    const group = await ChatGroup.findOne({
      _id: req.params.groupId,
      isActive: true,
    }).populate("members", memberSelect);

    if (!group) {
      return res.status(404).json({ success: false, message: "Group not found" });
    }

    if (!ensureMember(group, req.user._id)) {
      return res.status(403).json({ success: false, message: "You are not a member of this group" });
    }

    const messages = await GroupMessage.find({ group: group._id })
      .populate("sender", memberSelect)
      .sort({ createdAt: 1 })
      .limit(300);

    return res.json({ group: serializeGroup(group), messages: messages.map(serializeGroupMessage) });
  } catch (error) {
    return sendGroupError(res, "group:messages", error, "Unable to load group messages");
  }
};

const sendGroupMessage = async (req, res) => {
  try {
    if (!isValidGroupId(req.params.groupId)) {
      return res.status(400).json({ success: false, message: "Valid groupId is required" });
    }

    const body = req.body || {};
    const validation = validateChatMessage(body.message || body.text);

    if (validation.error) {
      return res.status(400).json({ success: false, message: validation.error });
    }

    const group = await ChatGroup.findOne({
      _id: req.params.groupId,
      isActive: true,
    });

    if (!group) {
      return res.status(404).json({ success: false, message: "Group not found" });
    }

    if (!ensureMember(group, req.user._id)) {
      return res.status(403).json({ success: false, message: "You are not a member of this group" });
    }

    const groupMessage = await GroupMessage.create({
      group: group._id,
      sender: req.user._id,
      message: validation.message,
    });

    group.updatedAt = new Date();
    await saveDocument(group, "group:message");
    await groupMessage.populate("sender", memberSelect);

    const messagePayload = serializeGroupMessage(groupMessage);
    const io = getIo();

    io?.to(groupRoomFor(group._id)).emit("receive_group_message", messagePayload);
    io?.to(groupRoomFor(group._id)).emit("group:message", {
      groupId: group._id,
      message: messagePayload,
    });

    return res.status(201).json({ groupMessage: messagePayload, message: "Message sent" });
  } catch (error) {
    return sendGroupError(res, "group:message", error, "Unable to send group message");
  }
};

module.exports = {
  createGroup,
  getGroupMessages,
  joinGroup,
  leaveGroup,
  listMembers,
  listGroups,
  sendGroupMessage,
};
