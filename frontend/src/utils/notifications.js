// @ts-nocheck
import { getSafeProfileImage } from "./profileImage";

export const NOTIFICATION_SYNC_EVENT = "vibebook:notifications-unread";

export const idOf = (value) => value?._id?.toString?.() || value?.toString?.() || "";

export const actorFor = (notification = {}) => (notification.actorId && typeof notification.actorId === "object" ? notification.actorId : null);

export const notificationDataFor = (notification = {}) => (notification.data && typeof notification.data === "object" ? notification.data : {});

export const avatarFor = (notification = {}) => {
  const actor = actorFor(notification);
  return actor ? getSafeProfileImage(actor) : "";
};

export const actorVerified = (actor = {}) => Boolean(actor?.isVerified || actor?.verified || actor?.premiumBadge);

export const notificationCategoryFor = (notification = {}) => {
  const type = String(notification.type || "").toLowerCase();
  const text = `${notification.title || ""} ${notification.message || ""}`.toLowerCase();

  if (type === "follow" || text.includes("followed you") || text.includes("liked your profile")) {
    return "followers";
  }

  if (type === "message") {
    return "messages";
  }

  if (type === "group_message" || type === "group_invite" || text.includes("group")) {
    return "groups";
  }

  if (["like", "comment", "mention", "share"].includes(type)) {
    return "posts";
  }

  return "posts";
};

export const NOTIFICATION_SECTIONS = [
  { id: "followers", label: "Followers", empty: "No follower updates." },
  { id: "messages", label: "Messages / Inbox", empty: "No message updates." },
  { id: "groups", label: "Group Chats", empty: "No group updates." },
  { id: "posts", label: "Posts / Engagement", empty: "No post updates." },
];

export const groupNotificationsBySection = (items = []) => {
  const groups = NOTIFICATION_SECTIONS.map((section) => ({ ...section, items: [] }));
  const byId = new Map(groups.map((section) => [section.id, section]));

  items.forEach((notification) => {
    const section = byId.get(notificationCategoryFor(notification)) || byId.get("posts");
    section.items.push(notification);
  });

  return groups.filter((section) => section.items.length);
};

export const getNotificationTarget = (notification = {}, currentUser = {}) => {
  const data = notificationDataFor(notification);
  const actor = actorFor(notification);
  const actorId = idOf(actor) || idOf(notification.actorId) || idOf(data.actorId) || idOf(data.senderId) || idOf(data.userId);
  const senderId = idOf(data.senderId) || actorId;
  const postId = idOf(notification.postId) || idOf(data.postId) || idOf(data.feedItemId) || idOf(data.post?._id);
  const postOwnerId = idOf(notification.postId?.userId) || idOf(data.postOwnerId) || idOf(data.ownerId) || idOf(currentUser?._id);
  const groupId = idOf(notification.groupId) || idOf(data.groupId) || idOf(data.group?._id);
  const type = String(notification.type || "").toLowerCase();

  if (type === "account_verification") return "/settings";
  if (type === "follow" && actorId) return `/profile/${actorId}`;
  if (type === "message" && senderId) return `/chat/${senderId}`;
  if (type === "group_message" || type === "group_invite") return groupId ? `/groups?group=${encodeURIComponent(groupId)}` : "/groups";

  if (["like", "comment", "mention", "share"].includes(type)) {
    const profileId = postOwnerId || actorId;
    if (profileId) return `/profile/${profileId}${postId ? `?post=${encodeURIComponent(postId)}` : ""}`;
    return postId ? `/?post=${encodeURIComponent(postId)}` : "/notifications";
  }

  return actorId ? `/profile/${actorId}` : "/notifications";
};

export const safeNavigateToNotification = (navigate, notification = {}, currentUser = {}) => {
  const target = getNotificationTarget(notification, currentUser);
  navigate(target || "/notifications");
};

export const broadcastNotificationSync = (detail = {}) => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(NOTIFICATION_SYNC_EVENT, { detail }));
  }
};

export const relativeNotificationTime = (value) => {
  const timestamp = value ? new Date(value).getTime() : 0;

  if (!timestamp || Number.isNaN(timestamp)) return "now";

  const seconds = Math.max(1, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;

  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
};
