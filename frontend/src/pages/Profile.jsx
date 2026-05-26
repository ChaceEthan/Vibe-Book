// @ts-nocheck
import {
  BadgeCheck,
  Bookmark,
  Coins,
  CreditCard,
  Eye,
  Gift,
  Grid3X3,
  Heart,
  Image as ImageIcon,
  Link as LinkIcon,
  Lock,
  LogOut,
  Mail,
  Menu,
  MessageCircle,
  Pencil,
  Phone,
  Play,
  QrCode,
  Rocket,
  Search,
  Send,
  Settings,
  Share2,
  Sparkles,
  Star,
  Tag,
  Trash2,
  UserMinus,
  UserPlus,
  Video,
  X,
} from "lucide-react";
import { motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import PostMedia from "../components/PostMedia.jsx";
import EditVideoModal from "../components/EditVideoModal.jsx";
import SafeAvatar from "../components/SafeAvatar.jsx";
import SafeCoverImage from "../components/SafeCoverImage.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useToast } from "../context/ToastContext.jsx";
import { bookingApi, feedApi, mediaUrl, paymentApi, userApi } from "../services/api";
import { usePostStore } from "../store/postStore";
import { useWalletStore } from "../store/walletStore";
import { getSafeProfileImage, handleAvatarError, handleCoverError } from "../utils/profileImage";

const cleanPhone = (value = "") => value.replace(/[^\d]/g, "");

const initialBookingForm = (currentUser) => ({
  userName: currentUser?.name || "",
  businessName: "",
  location: "",
  eventDate: "",
  eventType: "",
  durationValue: "",
  durationUnit: "days",
  offeredPrice: "",
  finalAgreedPrice: "",
  message: "",
});

const formatPrice = (price) => {
  const amount = Number(price || 0);

  if (!amount) {
    return "Not set";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "RWF",
    maximumFractionDigits: 0,
  }).format(amount);
};

const PAYMENT_OPTIONS = [
  { value: "USDT", label: "USDT" },
  { value: "USDC", label: "USDC" },
  { value: "USD", label: "USD" },
  { value: "MTN_MOMO", label: "MTN MoMo" },
  { value: "AIRTEL_MONEY", label: "Airtel Money" },
];

const toEmbedUrl = (url) => {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");

    if (host === "youtube.com" || host === "m.youtube.com") {
      const videoId = parsed.searchParams.get("v");
      return videoId ? `https://www.youtube.com/embed/${videoId}` : url;
    }

    if (host === "youtu.be") {
      const videoId = parsed.pathname.split("/").filter(Boolean)[0];
      return videoId ? `https://www.youtube.com/embed/${videoId}` : url;
    }

    if (host === "vimeo.com") {
      const videoId = parsed.pathname.split("/").filter(Boolean).find((part) => /^\d+$/.test(part));
      return videoId ? `https://player.vimeo.com/video/${videoId}` : url;
    }

    return url;
  } catch {
    return url;
  }
};

const isDirectVideoUrl = (url = "") => {
  const value = String(url || "").trim();

  if (value.startsWith("/uploads") || value.startsWith("uploads/")) {
    return true;
  }

  if (/\.(mp4|mov|webm)(?:$|[?#])/i.test(value)) {
    return true;
  }

  try {
    const parsed = new URL(value);
    return parsed.hostname === "res.cloudinary.com";
  } catch {
    return false;
  }
};

const formatCompactNumber = (value = 0) =>
  new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(Number(value || 0));

const safeCount = (value = 0) => {
  const count = Number(value || 0);
  return Number.isFinite(count) ? count : 0;
};

const frameClassFor = (frame = "") => ({
  frame_starter_neon: "from-cyan-300 via-lime-300 to-emerald-500",
  frame_gold_aura: "from-yellow-200 via-amber-400 to-orange-600",
  frame_anime_energy: "from-pink-400 via-violet-500 to-sky-400",
  frame_cyber_matrix: "from-slate-950 via-blue-600 to-teal-300",
  frame_kigali_night: "from-indigo-950 via-fuchsia-600 to-yellow-300",
  frame_diamond_elite: "from-cyan-200 via-white to-violet-500",
  frame_flame_aura: "from-orange-300 via-red-500 to-rose-700",
  frame_vip_prestige: "from-zinc-950 via-amber-500 to-white",
  frame_minimal_luxury: "from-slate-100 via-zinc-300 to-slate-800",
  frame_nex_genesis_founder: "from-black via-lime-300 to-cyan-200",
  frame_neon_glow: "from-emerald-300 via-cyan-300 to-lime-300",
  frame_gold_elite: "from-yellow-200 via-amber-400 to-orange-500",
  frame_fire_aura: "from-orange-400 via-red-500 to-rose-600",
  frame_diamond_ring: "from-cyan-200 via-sky-400 to-violet-500",
  frame_rwanda_pride: "from-sky-500 via-yellow-300 to-emerald-500",
  frame_creator_legend: "from-fuchsia-400 via-amber-300 to-cyan-300",
  frame_cyber_pulse: "from-blue-500 via-indigo-500 to-teal-300",
}[frame] || "");

const badgeLabel = (badge = "") =>
  ({
    badge_verified_creator: "Verified Creator",
    badge_rising_star: "Rising Star",
    badge_top_streamer: "Top Streamer",
    badge_elite_creator: "Elite Creator",
    badge_trend_king: "Trend King",
    badge_og_creator: "OG Creator",
    badge_founder: "Founder",
  }[badge] || String(badge || "").replace(/^badge_/, "").replace(/_/g, " "));

const creatorRoleLabel = (role = "") => {
  const value = String(role || "").trim();
  return value && value.toLowerCase() !== "dancer" ? value : "";
};

const normalizeExternalHref = (value = "") => {
  const trimmed = String(value || "").trim();

  if (!trimmed) {
    return "";
  }

  if (/^(https?:|mailto:|tel:)/i.test(trimmed)) {
    return trimmed;
  }

  return `https://${trimmed.replace(/^@/, "")}`;
};

const getPostUrl = (post = {}) => post.url || post.mediaUrl || post.videoUrl || post.imageUrl || post.image || post.video || "";

const isVideoPost = (post = {}) => {
  const type = String(post.type || post.mediaType || "").toLowerCase();
  const url = getPostUrl(post);

  return type.includes("video") || /\.(mp4|mov|webm)(?:$|[?#])/i.test(url);
};

const formatDuration = (value = 0) => {
  const seconds = Math.round(Number(value || 0));

  if (!seconds) {
    return "";
  }

  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
};

const formatRelativeTime = (value) => {
  const timestamp = value ? new Date(value).getTime() : 0;

  if (!timestamp) {
    return "now";
  }

  const seconds = Math.max(1, Math.round((Date.now() - timestamp) / 1000));

  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
  if (seconds < 604800) return `${Math.round(seconds / 86400)}d`;

  return new Date(value).toLocaleDateString();
};

const commentAuthor = (comment = {}) => comment.userId || comment.user || comment.author || {};

const commentKeyFor = (comment = {}, index = 0) => comment._id || comment.id || `${comment.message || comment.text || "comment"}-${index}`;

const ViewerActionButton = ({ active = false, count = "", disabled = false, label, onClick, children }) => (
  <button
    type="button"
    className={`flex min-w-14 flex-col items-center gap-1 rounded-full px-2 py-1 text-white transition active:scale-95 ${
      disabled ? "cursor-not-allowed opacity-45" : "hover:bg-white/10"
    }`}
    onClick={onClick}
    disabled={disabled}
    aria-label={label}
  >
    <span className={`flex h-12 w-12 items-center justify-center rounded-full bg-slate-950/55 shadow-lg backdrop-blur ${active ? "text-brand" : ""}`}>
      {children}
    </span>
    {count !== "" && <span className="max-w-16 truncate text-[11px] font-black drop-shadow">{count}</span>}
  </button>
);

const ProfileMediaViewer = ({
  viewer,
  user,
  profilePicture,
  currentUser,
  canEdit,
  onClose,
  onLike,
  onDoubleTapLike,
  onSave,
  onShare,
  onViewed,
  onComment,
  onEdit,
  onDelete,
  onBoost,
}) => {
  const scrollerRef = useRef(null);
  const scrollFrameRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(viewer?.index || 0);
  const [commentsOpen, setCommentsOpen] = useState(Boolean(viewer?.commentsOpen));
  const [commentText, setCommentText] = useState("");
  const [commentSending, setCommentSending] = useState(false);
  const [likedComments, setLikedComments] = useState(new Set());
  const items = viewer?.items || [];
  const activeItem = items[activeIndex] || items[0];
  const activeIsPost = Boolean(activeItem?._id && !String(activeItem._id).startsWith("loose-"));
  const activeIsVideo = isVideoPost(activeItem);
  const activeComments = Array.isArray(activeItem?.comments) ? activeItem.comments : [];
  const activeTags = Array.isArray(activeItem?.tags) ? activeItem.tags : [];

  useEffect(() => {
    if (!viewer) {
      return undefined;
    }

    const nextIndex = Math.min(Math.max(Number(viewer.index || 0), 0), Math.max(items.length - 1, 0));
    setActiveIndex(nextIndex);
    setCommentsOpen(Boolean(viewer.commentsOpen));
    setCommentText("");

    window.requestAnimationFrame(() => {
      const node = scrollerRef.current;
      if (node) {
        node.scrollTop = node.clientHeight * nextIndex;
      }
    });

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKey = (event) => {
      if (event.key === "Escape") {
        onClose();
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        const node = scrollerRef.current;
        const currentIndex = node?.clientHeight ? Math.round(node.scrollTop / node.clientHeight) : nextIndex;
        scrollToIndex(currentIndex + 1);
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        const node = scrollerRef.current;
        const currentIndex = node?.clientHeight ? Math.round(node.scrollTop / node.clientHeight) : nextIndex;
        scrollToIndex(currentIndex - 1);
      }
    };

    window.addEventListener("keydown", handleKey);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKey);
      if (scrollFrameRef.current) {
        window.cancelAnimationFrame(scrollFrameRef.current);
        scrollFrameRef.current = null;
      }
    };
  }, [viewer]);

  if (!viewer || !items.length) {
    return null;
  }

  const scrollToIndex = (nextIndex) => {
    const bounded = Math.min(Math.max(nextIndex, 0), items.length - 1);
    const node = scrollerRef.current;

    setActiveIndex(bounded);
    node?.scrollTo({ top: node.clientHeight * bounded, behavior: "smooth" });
  };

  const handleScroll = () => {
    if (scrollFrameRef.current) {
      window.cancelAnimationFrame(scrollFrameRef.current);
    }

    scrollFrameRef.current = window.requestAnimationFrame(() => {
      const node = scrollerRef.current;

      if (!node?.clientHeight) {
        return;
      }

      const nextIndex = Math.min(items.length - 1, Math.max(0, Math.round(node.scrollTop / node.clientHeight)));
      setActiveIndex(nextIndex);
    });
  };

  const submitComment = async (event) => {
    event.preventDefault();

    if (!activeIsPost || !commentText.trim()) {
      return;
    }

    setCommentSending(true);

    try {
      await onComment(activeItem, commentText.trim());
      setCommentText("");
    } finally {
      setCommentSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[95] bg-slate-950 text-white">
      <div
        ref={scrollerRef}
        className="h-[100dvh] snap-y snap-mandatory overflow-y-auto scroll-smooth"
        onScroll={handleScroll}
        style={{ touchAction: "pan-y" }}
      >
        {items.map((item, index) => {
          const itemUrl = getPostUrl(item);
          const itemIsVideo = isVideoPost(item);
          const itemIsPost = Boolean(item._id && !String(item._id).startsWith("loose-"));
          const mediaPost = { ...item, url: itemUrl, type: itemIsVideo ? "video" : "image" };
          const isActive = index === activeIndex;
          const shouldPreload = Math.abs(index - activeIndex) <= 1;

          return (
            <section key={item._id || `${itemUrl}-${index}`} className="relative flex h-[100dvh] snap-start snap-always items-center justify-center overflow-hidden bg-slate-950 px-0 sm:px-12">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(34,197,94,0.14),rgba(2,6,23,0.72)_55%,#020617_100%)]" />
              {!item.external && itemUrl && (
                itemIsVideo ? (
                  <video
                    src={mediaUrl(itemUrl)}
                    className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover opacity-20 blur-2xl"
                    muted
                    playsInline
                    preload={shouldPreload ? "metadata" : "none"}
                    aria-hidden="true"
                  />
                ) : (
                  <img
                    src={mediaUrl(itemUrl)}
                    alt=""
                    className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover opacity-25 blur-2xl"
                    loading={shouldPreload ? "eager" : "lazy"}
                    aria-hidden="true"
                  />
                )
              )}
              <div className={`relative h-full w-full ${itemIsVideo ? "max-w-[min(100vw,34rem)]" : "max-w-5xl"}`}>
                {item.external ? (
                  <iframe
                    src={toEmbedUrl(itemUrl)}
                    title={`${user?.name || "VibeBook"} video ${index + 1}`}
                    className="h-full w-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    loading={shouldPreload ? "eager" : "lazy"}
                  />
                ) : (
                  <PostMedia
                    post={mediaPost}
                    alt={`${user?.name || "VibeBook"} post`}
                    className="h-full w-full bg-slate-950"
                    imageClassName="h-full w-full object-contain"
                    videoClassName="h-full w-full object-contain"
                    placeholderClassName="h-full w-full"
                    autoPlay={itemIsVideo && isActive}
                    controls={false}
                    loop={itemIsVideo}
                    muted
                    interactive={itemIsVideo && isActive}
                    managedPlayback
                    preload={shouldPreload ? "auto" : "metadata"}
                    onDoubleTap={itemIsPost ? () => onDoubleTapLike(item) : undefined}
                    onViewed={itemIsPost ? (metrics) => onViewed(item, metrics) : undefined}
                  />
                )}
              </div>
            </section>
          );
        })}
      </div>

      <button
        type="button"
        className="fixed left-3 top-3 z-[105] flex h-11 w-11 items-center justify-center rounded-full bg-slate-950/65 text-white shadow-lg backdrop-blur transition hover:bg-white/15"
        onClick={onClose}
        aria-label="Close media viewer"
      >
        <X className="h-5 w-5" />
      </button>

      <div className="fixed left-1/2 top-4 z-[104] -translate-x-1/2 rounded-full bg-slate-950/55 px-3 py-1 text-xs font-black text-white/80 backdrop-blur">
        {activeIndex + 1} / {items.length}
      </div>

      <div className="fixed bottom-24 right-2 z-[104] flex flex-col items-center gap-2 sm:right-5">
        <ViewerActionButton
          active={Boolean(activeItem?.likedByViewer)}
          count={formatCompactNumber(activeItem?.likes || activeItem?.likeCount || 0)}
          label="Like post"
          disabled={!activeIsPost}
          onClick={() => activeIsPost && onLike(activeItem)}
        >
          <Heart className={`h-6 w-6 ${activeItem?.likedByViewer ? "fill-red-500 text-red-500" : ""}`} />
        </ViewerActionButton>
        <ViewerActionButton
          count={formatCompactNumber(activeItem?.commentCount || activeComments.length || 0)}
          label="Open comments"
          disabled={!activeIsPost || activeItem?.commentsEnabled === false}
          onClick={() => setCommentsOpen(true)}
        >
          <MessageCircle className="h-6 w-6" />
        </ViewerActionButton>
        <ViewerActionButton
          count={formatCompactNumber(activeItem?.shareCount || 0)}
          label="Share post"
          disabled={!activeIsPost}
          onClick={() => activeIsPost && onShare(activeItem)}
        >
          <Share2 className="h-6 w-6" />
        </ViewerActionButton>
        <ViewerActionButton
          active={Boolean(activeItem?.savedByViewer)}
          count={formatCompactNumber(activeItem?.saveCount || activeItem?.saves || 0)}
          label="Save post"
          disabled={!activeIsPost}
          onClick={() => activeIsPost && onSave(activeItem)}
        >
          <Bookmark className={`h-6 w-6 ${activeItem?.savedByViewer ? "fill-brand text-brand" : ""}`} />
        </ViewerActionButton>
        {canEdit && activeIsPost && (
          <ViewerActionButton label="Edit post" onClick={() => onEdit(activeItem)}>
            <Pencil className="h-5 w-5" />
          </ViewerActionButton>
        )}
        {canEdit && activeIsPost && (
          <ViewerActionButton label="Delete post" onClick={() => onDelete(activeItem)}>
            <Trash2 className="h-5 w-5 text-red-200" />
          </ViewerActionButton>
        )}
        {canEdit && activeIsPost && (
          <ViewerActionButton label="Boost post" onClick={() => onBoost(activeItem)}>
            <Rocket className="h-5 w-5 text-brand" />
          </ViewerActionButton>
        )}
      </div>

      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[103] bg-gradient-to-t from-slate-950 via-slate-950/65 to-transparent px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-20 sm:px-8">
        <div className="max-w-[min(84vw,42rem)]">
          <div className="flex items-center gap-3">
            <SafeAvatar user={{ ...user, profilePicture }} className="h-10 w-10 rounded-full border border-white/30 object-cover" />
            <div className="min-w-0">
              <p className="truncate text-sm font-black">@{user?.username || "creator"}</p>
              <p className="text-xs font-semibold text-white/60">{activeIsVideo ? "Original video" : "Photo"} {activeItem?.duration ? `- ${formatDuration(activeItem.duration)}` : ""}</p>
            </div>
          </div>
          {activeItem?.caption && <p className="mt-3 line-clamp-3 text-sm font-semibold leading-6 text-white">{activeItem.caption}</p>}
          {activeTags.length > 0 && (
            <p className="mt-2 line-clamp-1 text-xs font-black text-brand">
              {activeTags.slice(0, 8).map((tag) => `#${tag}`).join(" ")}
            </p>
          )}
        </div>
      </div>

      {commentsOpen && (
        <div className="fixed inset-x-0 bottom-0 z-[110] mx-auto max-h-[72dvh] max-w-2xl overflow-hidden rounded-t-lg bg-white text-slate-900 shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <div>
              <p className="text-sm font-black text-navy">Comments</p>
              <p className="text-xs font-semibold text-slate-500">{formatCompactNumber(activeComments.length)} replies</p>
            </div>
            <button type="button" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" onClick={() => setCommentsOpen(false)} aria-label="Close comments">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="max-h-[42dvh] overflow-y-auto px-4 py-3">
            {activeComments.length > 0 ? (
              <div className="space-y-4">
                {activeComments.map((comment, index) => {
                  const author = commentAuthor(comment);
                  const key = commentKeyFor(comment, index);
                  const liked = likedComments.has(key);
                  const likeCount = Number(comment.likes || comment.likeCount || 0) + (liked ? 1 : 0);

                  return (
                    <article key={key} className="flex gap-3">
                      <SafeAvatar user={author} className="h-9 w-9 rounded-full bg-slate-100 object-cover" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-black text-navy">@{author.username || author.name || "creator"}</p>
                          <span className="text-[11px] font-bold text-slate-400">{formatRelativeTime(comment.createdAt || comment.updatedAt)}</span>
                        </div>
                        <p className="mt-1 text-sm font-semibold leading-5 text-slate-700">{comment.message || comment.text || comment.body || ""}</p>
                      </div>
                      <button
                        type="button"
                        className={`flex flex-col items-center text-[10px] font-black ${liked ? "text-red-500" : "text-slate-400"}`}
                        onClick={() =>
                          setLikedComments((current) => {
                            const next = new Set(current);
                            if (next.has(key)) {
                              next.delete(key);
                            } else {
                              next.add(key);
                            }
                            return next;
                          })
                        }
                        aria-label="Like comment"
                      >
                        <Heart className={`h-4 w-4 ${liked ? "fill-red-500" : ""}`} />
                        {likeCount || ""}
                      </button>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="flex min-h-32 items-center justify-center rounded-lg bg-slate-50 text-center text-sm font-bold text-slate-500">
                Be the first to comment.
              </div>
            )}
          </div>
          <form className="flex gap-2 border-t border-slate-200 bg-white p-3" onSubmit={submitComment}>
            <SafeAvatar user={currentUser} className="h-10 w-10 rounded-full bg-slate-100 object-cover" />
            <input
              className="field min-w-0 flex-1"
              value={commentText}
              onChange={(event) => setCommentText(event.target.value)}
              placeholder={activeIsPost ? "Add a comment..." : "Comments are available for posts"}
              disabled={!activeIsPost || commentSending}
            />
            <button
              type="submit"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand text-navy disabled:opacity-50"
              disabled={!activeIsPost || !commentText.trim() || commentSending}
              aria-label="Send comment"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

const Profile = () => {
  const { id } = useParams();
  const { logout, refreshProfile, updateProfile, uploadProfileCover, uploadProfilePicture, user: currentUser } = useAuth();
  const { addToast } = useToast();
  const { wallet: profileWallet, loadWallet: loadProfileWallet } = useWalletStore();
  const storePosts = usePostStore((state) => state.posts);
  const mergePosts = usePostStore((state) => state.mergePosts);
  const replacePost = usePostStore((state) => state.replacePost);
  const applyPostLike = usePostStore((state) => state.applyPostLike);
  const removePost = usePostStore((state) => state.removePost);
  const [user, setUser] = useState(null);
  const [activeImage, setActiveImage] = useState(0);
  const [previewImage, setPreviewImage] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookingForm, setBookingForm] = useState(initialBookingForm(currentUser));
  const [bookingStatus, setBookingStatus] = useState("");
  const [bookingError, setBookingError] = useState("");
  const [bookingSending, setBookingSending] = useState(false);
  const [unlockingContact, setUnlockingContact] = useState(false);
  const [contactError, setContactError] = useState("");
  const [offerOpen, setOfferOpen] = useState(false);
  const [offerForm, setOfferForm] = useState({ eventDate: "", offerPrice: "", message: "" });
  const [offerStatus, setOfferStatus] = useState("");
  const [offerError, setOfferError] = useState("");
  const [offerSending, setOfferSending] = useState(false);
  const [paymentAction, setPaymentAction] = useState(null);
  const [paymentStatus, setPaymentStatus] = useState("");
  const [paymentError, setPaymentError] = useState("");
  const [processingPayment, setProcessingPayment] = useState("");
  const [likeStatus, setLikeStatus] = useState("");
  const [followStatus, setFollowStatus] = useState("");
  const [followUpdating, setFollowUpdating] = useState(false);
  const [viewedPosts, setViewedPosts] = useState(new Set());
  const [profileCommentOpen, setProfileCommentOpen] = useState("");
  const [profileCommentText, setProfileCommentText] = useState("");
  const [editingPost, setEditingPost] = useState(null);
  const [postActionMenu, setPostActionMenu] = useState(null);
  const [deletePostTarget, setDeletePostTarget] = useState(null);
  const [deletingPostId, setDeletingPostId] = useState("");
  const [activeProfileTab, setActiveProfileTab] = useState("Videos");
  const [mediaViewer, setMediaViewer] = useState(null);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [profileShareStatus, setProfileShareStatus] = useState("");
  const [qrProfileOpen, setQrProfileOpen] = useState(false);
  const [profileRetry, setProfileRetry] = useState(0);
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState("");
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [coverFile, setCoverFile] = useState(null);
  const [coverPreview, setCoverPreview] = useState("");
  const [coverSaving, setCoverSaving] = useState(false);
  const avatarInputRef = useRef(null);
  const coverInputRef = useRef(null);
  const profileActionsRef = useRef(null);
  const likeRequestsRef = useRef(new Map());
  const navigate = useNavigate();

  useEffect(() => {
    const fetchProfile = async () => {
      setLoading(true);
      setError("");

      try {
        const { data } = await userApi.getById(id);
        setUser(data.user);
        if (Array.isArray(data.user?.posts)) {
          mergePosts(data.user.posts);
        }
      } catch (requestError) {
        const status = requestError.response?.status;
        setUser(null);
        setError(status === 404 ? "We could not find that VibeBook profile." : requestError.response?.data?.message || "Profile could not load. Please retry.");
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [id, mergePosts, profileRetry]);

  useEffect(() => {
    return () => {
      likeRequestsRef.current.clear();
      if (avatarPreview) {
        URL.revokeObjectURL(avatarPreview);
      }
      if (coverPreview) {
        URL.revokeObjectURL(coverPreview);
      }
    };
  }, [avatarPreview, coverPreview]);

  useEffect(() => {
    setActiveImage(0);
    setBookingOpen(false);
    setBookingStatus("");
    setBookingError("");
    setBookingForm(initialBookingForm(currentUser));
    setContactError("");
    setOfferOpen(false);
    setOfferStatus("");
    setOfferError("");
    setOfferForm({ eventDate: "", offerPrice: "", message: "" });
    setPaymentAction(null);
    setPaymentStatus("");
    setPaymentError("");
    setFollowStatus("");
    setFollowUpdating(false);
    setViewedPosts(new Set());
    setProfileCommentOpen("");
    setProfileCommentText("");
    setEditingPost(null);
    setActiveProfileTab("Videos");
    setMediaViewer(null);
    setProfileMenuOpen(false);
    setProfileShareStatus("");
    setQrProfileOpen(false);
  }, [id, currentUser]);

  useEffect(() => {
    const handlePostLikeUpdated = (event) => {
      const { postId, likedByViewer, likes, likeCount, feedItem } = event.detail || {};

      if (!postId) {
        return;
      }

      const nextCount = Math.max(0, safeCount(likeCount ?? likes ?? feedItem?.likeCount ?? feedItem?.likes));
      const patchPost = (post) => {
        if (post?._id !== postId) {
          return post;
        }

        return {
          ...post,
          ...(feedItem || {}),
          likedByViewer: Boolean(likedByViewer),
          likes: nextCount,
          likeCount: nextCount,
        };
      };

      setMediaViewer((current) =>
        current
          ? {
              ...current,
              items: current.items.map(patchPost),
            }
          : current
      );
      setUser((current) =>
        current
          ? {
              ...current,
              posts: (current.posts || []).map(patchPost),
            }
          : current
      );
    };

    window.addEventListener("vibebook:post-like-updated", handlePostLikeUpdated);
    return () => window.removeEventListener("vibebook:post-like-updated", handlePostLikeUpdated);
  }, []);

  useEffect(() => {
    if (!profileMenuOpen) {
      return undefined;
    }

    const closeMenu = (event) => {
      if (!profileActionsRef.current?.contains(event.target)) {
        setProfileMenuOpen(false);
      }
    };

    const closeOnEscape = (event) => {
      if (event.key === "Escape") {
        setProfileMenuOpen(false);
      }
    };

    document.addEventListener("pointerdown", closeMenu, true);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeMenu, true);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [profileMenuOpen]);

  useEffect(() => {
    if (currentUser?._id && id === currentUser._id) {
      loadProfileWallet();
    }
  }, [currentUser?._id, id, loadProfileWallet]);

  useEffect(() => {
    setBookingForm((current) => ({
      ...current,
      userName: current.userName || currentUser?.name || "",
    }));
  }, [currentUser?.name]);

  const profilePicture = user?.profilePicture || user?.profileImage || "";
  const allImages = useMemo(
    () => (user?.images?.length ? user.images : [profilePicture || getSafeProfileImage(user)]),
    [profilePicture, user]
  );
  const premiumActive = Boolean(user?.isPremium || user?.premiumBadge);
  const verified = Boolean(user?.isVerified || user?.verified);
  const equippedFrame = user?.equippedFrame || user?.marketplace?.equippedFrame || "";
  const equippedBadges = Array.isArray(user?.equippedBadges) ? user.equippedBadges : Array.isArray(user?.creatorBadges) ? user.creatorBadges : [];
  const frameGradient = frameClassFor(equippedFrame);
  const skills = Array.isArray(user?.skills) ? user.skills.filter(Boolean) : [];
  const isOwnProfile = currentUser?._id && user?._id && currentUser._id === user._id;
  const isFollowing = Boolean(user?.isFollowing);
  const followsViewer = Boolean(user?.followsViewer || user?.followedYou);
  const isMutualFollow = Boolean(user?.isMutualFollow || user?.mutualFollow || (isFollowing && followsViewer));
  const contentUnlocked = Boolean(isOwnProfile || user?.isUnlocked || user?.contentUnlocked);
  const contentLocked = Boolean(!isOwnProfile && !contentUnlocked);
  const images = allImages;
  const lockedImageCount = contentLocked ? Math.max(Number(user?.galleryImageCount || allImages.length) - images.length, 0) : 0;
  const activeImageUrl = images[activeImage] || images[0] || getSafeProfileImage(user);
  const videoUrls = useMemo(() => {
    const videos = Array.isArray(user?.videos) && user.videos.length ? user.videos : user?.videoUrls || [];
    return Array.isArray(videos) ? videos.filter(Boolean) : [];
  }, [user]);
  const whatsapp = cleanPhone(user?.whatsappNumber || user?.socialLinks?.whatsapp || user?.phone || "");
  const phone = cleanPhone(user?.phone || "");
  const contactUnlocked = Boolean(isOwnProfile || user?.contactUnlocked || contentUnlocked);
  const contactLocked = Boolean(!isOwnProfile && user?.contactLocked);
  const profilePosts = useMemo(() => {
    const byId = new Map();
    const userId = user?._id || id;
    const userPosts = Array.isArray(user?.posts) ? user.posts : [];
    const syncedPosts = storePosts.filter((post) => (post.userId?._id || post.userId) === userId);

    [...syncedPosts, ...userPosts].forEach((post) => {
      if (post?._id) {
        byId.set(post._id, { ...(byId.get(post._id) || {}), ...post });
      }
    });

    return Array.from(byId.values()).sort((left, right) => new Date(right.createdAt || 0) - new Date(left.createdAt || 0));
  }, [id, storePosts, user]);

  const postUrls = useMemo(() => new Set(profilePosts.map(getPostUrl).filter(Boolean)), [profilePosts]);
  const followButtonLabel = isMutualFollow ? "Following each other" : isFollowing ? "Following" : followsViewer ? "Follow Back" : "Follow";
  const FollowButtonIcon = isMutualFollow ? BadgeCheck : isFollowing ? UserMinus : UserPlus;
  const followButtonClass = isFollowing ? "btn-secondary" : "btn-primary";
  const coverImage = user?.coverImage || user?.coverPicture || user?.bannerImage || user?.coverPhoto || "";
  const hasCustomCoverImage = Boolean(coverImage && !String(coverImage).includes("/default-cover"));
  const hasCustomProfilePicture = Boolean(profilePicture && !String(profilePicture).includes("/logo"));
  const verifiedBadgePosition = isOwnProfile && hasCustomProfilePicture ? "left-1 top-1" : isOwnProfile ? "bottom-2 left-1" : "bottom-2 right-1";
  const profileLikes = profilePosts.reduce((total, post) => total + Number(post.likes || post.likeCount || 0), 0);
  const profileViews = profilePosts.reduce((total, post) => total + Number(post.views || post.viewCount || 0), 0);
  const totalLikes = Number(user?.likes || user?.likeCount || profileLikes || 0);
  const totalViews = Number(user?.viewsCount || user?.profileViews || profileViews || 0);
  const socialSource = user?.socialLinks || user?.socials || {};
  const socialEntries = Object.entries(socialSource)
    .filter(([, value]) => Boolean(value))
    .filter(([key]) => !["whatsapp", "phone", "email", "website"].includes(String(key).toLowerCase()))
    .slice(0, 4);
  const website = user?.website || user?.socialLinks?.website || user?.socials?.website || "";
  const videoItems = useMemo(() => {
    const postVideos = profilePosts.filter(isVideoPost);
    const looseVideos = videoUrls
      .filter((videoUrl) => videoUrl && !postUrls.has(videoUrl))
      .map((videoUrl, index) => ({
        _id: `loose-video-${index}-${videoUrl}`,
        url: videoUrl,
        type: "video",
        caption: "Video",
        duration: 0,
        external: !isDirectVideoUrl(videoUrl),
      }));

    return [...postVideos, ...looseVideos];
  }, [postUrls, profilePosts, videoUrls]);
  const photoItems = useMemo(() => {
    const postPhotos = profilePosts.filter((post) => !isVideoPost(post));
    const loosePhotos = images
      .filter((image) => image && !postUrls.has(image))
      .map((image, index) => ({
        _id: `loose-photo-${index}-${image}`,
        url: image,
        type: "image",
        caption: index === 0 ? "Profile photo" : "Photo",
      }));

    return [...postPhotos, ...loosePhotos];
  }, [images, postUrls, profilePosts]);
  const savedItems = Array.isArray(user?.savedPosts) ? user.savedPosts : [];
  const taggedItems = Array.isArray(user?.taggedPosts) ? user.taggedPosts : [];
  const profileTabs = [
    { label: "Videos", icon: Video, count: videoItems.length },
    { label: "Photos", icon: ImageIcon, count: photoItems.length },
    { label: "Saved", icon: Bookmark, count: savedItems.length },
    { label: "Tagged", icon: Tag, count: taggedItems.length },
  ];
  const activeGridItems =
    activeProfileTab === "Videos" ? videoItems : activeProfileTab === "Photos" ? photoItems : activeProfileTab === "Saved" ? savedItems : taggedItems;
  const activeCommentPost = profilePosts.find((post) => post._id === profileCommentOpen);
  const profileShareUrl = typeof window !== "undefined" ? `${window.location.origin}/profile/${user?._id || id}` : `/profile/${user?._id || id}`;

  const openProfileMedia = (item, fallbackIndex = 0, commentsOpen = false) => {
    const sourceItems = activeProfileTab === "Videos" ? videoItems : activeProfileTab === "Photos" ? photoItems : activeGridItems;
    const itemKey = item?._id || getPostUrl(item);
    const sourceIndex = sourceItems.findIndex((sourceItem) => (sourceItem?._id || getPostUrl(sourceItem)) === itemKey);

    setMediaViewer({
      items: sourceItems.length ? sourceItems : [item],
      index: sourceIndex >= 0 ? sourceIndex : fallbackIndex,
      commentsOpen,
    });
  };

  const goToImage = (direction) => {
    setActiveImage((current) => {
      if (!images.length) {
        return 0;
      }

      return (current + direction + images.length) % images.length;
    });
  };

  const handleBookingChange = (event) => {
    setBookingForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  };

  const buildBookingPayload = () => ({
    talentId: user._id,
    userName: bookingForm.userName.trim() || currentUser?.name || "",
    businessName: bookingForm.businessName.trim(),
    location: bookingForm.location.trim(),
    eventDate: bookingForm.eventDate || undefined,
    eventType: bookingForm.eventType.trim(),
    durationValue: bookingForm.durationValue ? Number(bookingForm.durationValue) : undefined,
    durationUnit: bookingForm.durationUnit,
    offeredPrice: Number(bookingForm.offeredPrice),
    finalAgreedPrice: bookingForm.finalAgreedPrice ? Number(bookingForm.finalAgreedPrice) : undefined,
    message: bookingForm.message.trim(),
  });

  const getAccessPayment = (requestError) => ({
    amount: requestError.response?.data?.data?.access?.unlockAmount || 1000,
    currency: requestError.response?.data?.data?.access?.unlockCurrency || "RWF",
  });

  const handleBookingSubmit = async (event) => {
    event.preventDefault();
    setBookingSending(true);
    setBookingStatus("");
    setBookingError("");
    setPaymentStatus("");
    setPaymentError("");
    setPaymentAction(null);

    try {
      await bookingApi.create(buildBookingPayload());
      const { data } = await userApi.getById(id);
      setUser(data.user);
      setBookingStatus("Request sent.");
      setBookingForm(initialBookingForm(currentUser));
    } catch (requestError) {
      if (requestError.response?.status === 402) {
        setPaymentAction({ type: "booking", payload: buildBookingPayload(), ...getAccessPayment(requestError) });
        setBookingError("Payment or free trial access is required before this request is sent.");
      } else {
        setBookingError(requestError.response?.data?.message || "Request failed.");
      }
    } finally {
      setBookingSending(false);
    }
  };

  const handleLikeToggle = async () => {
    setLikeStatus("");

    try {
      const { data } = user.likedByViewer ? await userApi.unlikeProfile(user._id) : await userApi.likeProfile(user._id);
      setUser(data.user);
      setLikeStatus(data.message || "Updated.");
    } catch (requestError) {
      setLikeStatus(requestError.response?.data?.message || "Unable to update like.");
    }
  };

  const handleFollowToggle = async () => {
    if (!currentUser) {
      navigate("/login");
      return;
    }

    setFollowUpdating(true);
    setFollowStatus("");
    setContactError("");

    const previousUser = user;
    const nextFollowing = !isFollowing;
    const delta = isFollowing ? -1 : 1;
    const nextMutual = Boolean(nextFollowing && followsViewer);
    setUser((current) => ({
      ...current,
      isFollowing: nextFollowing,
      isMutualFollow: nextMutual,
      mutualFollow: nextMutual,
      followerCount: Math.max(0, Number(current?.followerCount ?? current?.followers?.length ?? 0) + delta),
    }));

    try {
      const { data } = isFollowing
        ? await userApi.unfollow(user._id)
        : followsViewer
          ? await userApi.followBack(user._id)
          : await userApi.follow(user._id);
      setUser(data.user);
      await refreshProfile();
      setFollowStatus(data.message || (isFollowing ? "Profile unfollowed." : followsViewer ? "Following each other." : "Profile followed."));
    } catch (requestError) {
      setUser(previousUser);
      setFollowStatus(requestError.response?.data?.message || "Unable to update follow.");
    } finally {
      setFollowUpdating(false);
    }
  };

  const broadcastPostLike = (postId, likedByViewer, likeCount, feedItem = null) => {
    window.dispatchEvent(
      new CustomEvent("vibebook:post-like-updated", {
        detail: { postId, likedByViewer, likes: likeCount, likeCount, feedItem },
      })
    );
  };

  const replaceProfilePost = (nextPost, options = {}) => {
    if (!nextPost?._id) {
      return;
    }

    const mergeLocalPost = (item) => {
      if (item?._id !== nextPost._id) {
        return item;
      }

      const merged = { ...item, ...nextPost };

      if (options.preserveLikeState && typeof item.likedByViewer === "boolean" && typeof nextPost.likedByViewer !== "boolean") {
        const likes = Math.max(0, safeCount(item.likes ?? item.likeCount));
        merged.likedByViewer = item.likedByViewer;
        merged.likes = likes;
        merged.likeCount = likes;
      }

      if (options.preserveSaveState && typeof item.savedByViewer === "boolean") {
        const saves = Math.max(0, safeCount(item.saveCount ?? item.saves));
        merged.savedByViewer = item.savedByViewer;
        merged.saves = saves;
        merged.saveCount = saves;
      }

      return merged;
    };

    replacePost(nextPost, options);
    setMediaViewer((current) =>
      current
        ? {
            ...current,
            items: current.items.map(mergeLocalPost),
          }
        : current
    );
    setUser((current) => ({
      ...current,
      posts: (current?.posts || []).map(mergeLocalPost),
    }));
  };

  const removeProfilePost = (postId) => {
    removePost(postId);
    setMediaViewer((current) => {
      if (!current) {
        return current;
      }

      const nextItems = current.items.filter((item) => item?._id !== postId);

      if (!nextItems.length) {
        return null;
      }

      return {
        ...current,
        items: nextItems,
        index: Math.min(current.index || 0, nextItems.length - 1),
      };
    });
    setUser((current) => ({
      ...current,
      posts: (current?.posts || []).filter((post) => post._id !== postId),
    }));
  };

  const handlePostDelete = async (post) => {
    if (!currentUser) {
      navigate("/login");
      return;
    }

    if (!post?._id) {
      return;
    }

    const previousUser = user;
    const previousViewer = mediaViewer;
    setDeletingPostId(post._id);
    removeProfilePost(post._id);
    setLikeStatus("");

    try {
      await feedApi.delete(post._id);
      setLikeStatus("Post deleted.");
      window.dispatchEvent(new CustomEvent("vibebook:post-deleted", { detail: { postId: post._id } }));
    } catch (requestError) {
      setUser(previousUser);
      setMediaViewer(previousViewer);
      replacePost(post);
      setLikeStatus(requestError.response?.data?.message || "Unable to delete post.");
    } finally {
      setDeletingPostId("");
      setDeletePostTarget(null);
      setPostActionMenu(null);
    }
  };

  const handlePostLike = async (post, options = {}) => {
    if (!currentUser) {
      navigate("/login");
      return;
    }

    if (!post?._id || likeRequestsRef.current.has(post._id)) {
      return;
    }

    const forceLike = Boolean(options.forceLike);
    const wasLiked = Boolean(post.likedByViewer);

    if (forceLike && wasLiked) {
      return;
    }

    const previousCount = Math.max(0, safeCount(post.likes ?? post.likeCount));
    const nextLiked = forceLike ? true : !wasLiked;
    const nextCount = Math.max(0, previousCount + (nextLiked ? 1 : -1));

    likeRequestsRef.current.set(post._id, { likedByViewer: wasLiked, likes: previousCount });
    applyPostLike(post._id, nextLiked, nextCount);
    broadcastPostLike(post._id, nextLiked, nextCount);

    try {
      const { data } = await feedApi.toggleLike(post._id, { action: nextLiked ? "like" : "unlike" });
      if (data.feedItem) {
        replaceProfilePost(data.feedItem);
        broadcastPostLike(data.feedItem._id, Boolean(data.feedItem.likedByViewer), Math.max(0, safeCount(data.feedItem.likes ?? data.feedItem.likeCount)), data.feedItem);
      }
    } catch (requestError) {
      applyPostLike(post._id, wasLiked, previousCount);
      broadcastPostLike(post._id, wasLiked, previousCount);
      setLikeStatus(requestError.response?.data?.message || "Unable to update post like.");
    } finally {
      likeRequestsRef.current.delete(post._id);
    }
  };

  const handlePostSave = async (post) => {
    if (!currentUser) {
      navigate("/login");
      return;
    }

    if (!post?._id) {
      return;
    }

    try {
      const { data } = await feedApi.save(post._id);
      replaceProfilePost(data.feedItem, { preserveLikeState: true });
    } catch (requestError) {
      setLikeStatus(requestError.response?.data?.message || "Unable to save this post.");
    }
  };

  const handlePostViewed = async (post, metrics = {}) => {
    if (!post?._id || viewedPosts.has(post._id)) {
      return;
    }

    setViewedPosts((current) => {
      const next = new Set(current);
      next.add(post._id);
      return next;
    });

    try {
      const { data } = await feedApi.recordView(post._id, metrics);
      replaceProfilePost(data.feedItem, { preserveLikeState: true, preserveSaveState: true });
    } catch {
      // View tracking is best-effort and should not interrupt media playback.
    }
  };

  const handlePostShare = async (post) => {
    const shareUrl = `${window.location.origin}/profile/${user?._id || id}`;
    const shareData = {
      title: user?.name || "VibeBook post",
      text: post.caption || "Check out this VibeBook post",
      url: shareUrl,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareUrl);
      }

      const { data } = await feedApi.share(post._id);
      replaceProfilePost(data.feedItem, { preserveLikeState: true, preserveSaveState: true });
    } catch (requestError) {
      if (requestError.name !== "AbortError") {
        setLikeStatus("Unable to share post.");
      }
    }
  };

  const shareProfile = async () => {
    const shareData = {
      title: `${user?.name || "VibeBook"} on VibeBook`,
      text: `Check out @${user?.username || "creator"} on VibeBook`,
      url: profileShareUrl,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
        setProfileShareStatus("Profile shared.");
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(profileShareUrl);
        setProfileShareStatus("Profile link copied.");
      } else {
        setProfileShareStatus(profileShareUrl);
      }
    } catch (shareError) {
      if (shareError?.name !== "AbortError") {
        setProfileShareStatus("Unable to share profile right now.");
      }
    } finally {
      window.setTimeout(() => setProfileShareStatus(""), 2500);
    }
  };

  const openProfileTab = (tab, message = "") => {
    setActiveProfileTab(tab);
    setProfileMenuOpen(false);
    if (message) {
      setProfileShareStatus(message);
      window.setTimeout(() => setProfileShareStatus(""), 2500);
    }
    window.requestAnimationFrame(() => {
      document.getElementById("profile-grid")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const handleQuickLogout = () => {
    setProfileMenuOpen(false);
    logout();
    navigate("/");
  };

  const handlePostCommentMessage = async (post, message) => {
    if (!currentUser) {
      navigate("/login");
      return;
    }

    if (!post?._id || !message.trim()) {
      return;
    }

    try {
      const { data } = await feedApi.addComment(post._id, { message: message.trim() });
      replaceProfilePost(data.feedItem, { preserveLikeState: true, preserveSaveState: true });
      setProfileCommentText("");
      return data.feedItem;
    } catch {
      setLikeStatus("Unable to add post comment.");
    }
  };

  const handlePostComment = async (event, post) => {
    event.preventDefault();
    await handlePostCommentMessage(post, profileCommentText);
  };

  const handleUnlockContact = async () => {
    setUnlockingContact(true);
    setContactError("");
    setPaymentStatus("");
    setPaymentError("");

    setPaymentAction({
      type: "contact",
      purpose: "contact_unlock",
      profileId: id,
      amount: 1000,
      currency: "RWF",
    });
    setContactError("Choose a payment option to unlock contact.");
    setUnlockingContact(false);
  };

  const handleStartTip = () => {
    if (!currentUser) {
      navigate("/login");
      return;
    }

    setPaymentStatus("");
    setPaymentError("");
    setPaymentAction({
      type: "tip",
      purpose: "tip",
      profileId: user._id,
      amount: 1000,
      currency: "RWF",
    });
  };

  const handleUpgradePremium = () => {
    if (!currentUser) {
      navigate("/login");
      return;
    }

    setPaymentStatus("");
    setPaymentError("");
    setPaymentAction({
      type: "premium",
      purpose: "premium",
      amount: 5000,
      currency: "RWF",
    });
  };

  const handleBoostPost = (post) => {
    if (!currentUser) {
      navigate("/login");
      return;
    }

    if (!post?._id) {
      setPaymentError("Choose a saved post to boost.");
      return;
    }

    setPaymentStatus("");
    setPaymentError("");
    setPaymentAction({
      type: "boost",
      purpose: "post_boost",
      postId: post._id,
      amount: 3000,
      currency: "RWF",
    });
  };

  const handleOfferChange = (event) => {
    setOfferForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  };

  const handleOfferSubmit = async (event) => {
    event.preventDefault();
    setOfferSending(true);
    setOfferStatus("");
    setOfferError("");
    setPaymentStatus("");
    setPaymentError("");
    setPaymentAction(null);

    try {
      const payload = {
        talentId: user._id,
        eventDate: offerForm.eventDate || undefined,
        offerPrice: Number(offerForm.offerPrice),
        message: offerForm.message.trim(),
      };
      await bookingApi.sendOffer(payload);
      const { data } = await userApi.getById(id);
      setUser(data.user);
      setOfferStatus("Offer sent.");
      setOfferForm({ eventDate: "", offerPrice: "", message: "" });
    } catch (requestError) {
      if (requestError.response?.status === 402) {
        setPaymentAction({
          type: "offer",
          payload: {
            talentId: user._id,
            eventDate: offerForm.eventDate || undefined,
            offerPrice: Number(offerForm.offerPrice),
            message: offerForm.message.trim(),
          },
          ...getAccessPayment(requestError),
        });
        setOfferError("Payment or free trial access is required before this offer is sent.");
      } else {
        setOfferError(requestError.response?.data?.message || "Offer failed.");
      }
    } finally {
      setOfferSending(false);
    }
  };

  const handlePayment = async (method) => {
    if (!paymentAction) {
      return;
    }

    setProcessingPayment(method);
    setPaymentStatus("");
    setPaymentError("");

    try {
      const { data: created } = await paymentApi.create({
        method,
        purpose: paymentAction.purpose || "platform_access",
        amount: paymentAction.amount,
        currency: paymentAction.currency,
        profileId: paymentAction.profileId || undefined,
        postId: paymentAction.postId || undefined,
      });
      await paymentApi.verify({
        paymentId: created.payment?._id,
        reference: created.payment?.reference,
      });
      await refreshProfile();

      if (paymentAction.type === "booking") {
        await bookingApi.create(paymentAction.payload);
        const { data } = await userApi.getById(id);
        setUser(data.user);
        setBookingStatus("Payment verified. Request sent.");
        setBookingForm(initialBookingForm(currentUser));
      }

      if (paymentAction.type === "offer") {
        await bookingApi.sendOffer(paymentAction.payload);
        const { data } = await userApi.getById(id);
        setUser(data.user);
        setOfferStatus("Payment verified. Offer sent.");
        setOfferForm({ eventDate: "", offerPrice: "", message: "" });
      }

      if (paymentAction.type === "contact") {
        const { data } = await userApi.getById(id);
        setUser(data.user);
        setContactError("");
      }

      if (paymentAction.type === "tip") {
        setPaymentStatus("Tip sent to creator.");
      }

      if (paymentAction.type === "premium") {
        await refreshProfile();
        setPaymentStatus("Premium visibility activated.");
      }

      if (paymentAction.type === "boost") {
        const { data } = await userApi.getById(id);
        setUser(data.user);
        setPaymentStatus("Post boosted for 7 days.");
      }

      setPaymentAction(null);
      setPaymentStatus((current) => current || "Sandbox payment verified.");
    } catch (requestError) {
      setPaymentError(requestError.response?.data?.message || "Payment failed.");
    } finally {
      setProcessingPayment("");
    }
  };

  const openAvatarPicker = () => {
    if (!isOwnProfile || avatarSaving) {
      return;
    }

    avatarInputRef.current?.click();
  };

  const handleAvatarSelect = (event) => {
    const selectedFile = event.target.files?.[0];
    event.target.value = "";

    if (!selectedFile) {
      return;
    }

    if (!selectedFile.type?.startsWith("image/")) {
      addToast("Choose an image file for your profile photo.", "error");
      return;
    }

    if (selectedFile.size > 5 * 1024 * 1024) {
      addToast("Choose a profile photo under 5MB.", "error");
      return;
    }

    const nextPreview = URL.createObjectURL(selectedFile);
    setAvatarPreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return nextPreview;
    });
    setAvatarFile(selectedFile);
  };

  const closeAvatarPreview = () => {
    if (avatarSaving) {
      return;
    }

    setAvatarFile(null);
    setAvatarPreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return "";
    });
  };

  const saveAvatar = async () => {
    if (!avatarFile || avatarSaving) {
      return;
    }

    setAvatarSaving(true);

    try {
      const formData = new FormData();
      formData.append("image", avatarFile, avatarFile.name || `vibebook-avatar-${Date.now()}.jpg`);
      const data = await uploadProfilePicture(formData);
      const nextUser = data?.user;

      if (!nextUser?.profilePicture && !nextUser?.profileImage) {
        throw new Error("Profile image update did not return an image URL.");
      }

      setUser((current) => ({ ...(current || {}), ...nextUser }));
      await refreshProfile().catch(() => null);
      setAvatarFile(null);
      setAvatarPreview((current) => {
        if (current) URL.revokeObjectURL(current);
        return "";
      });
      addToast("Profile photo updated.", "success");
    } catch (requestError) {
      addToast(requestError.response?.data?.message || requestError.message || "Unable to update profile photo.", "error");
    } finally {
      setAvatarSaving(false);
    }
  };

  const resetAvatarToDefault = async () => {
    if (!isOwnProfile || avatarSaving || !hasCustomProfilePicture) {
      return;
    }

    setAvatarSaving(true);

    try {
      const nextUser = await updateProfile({ profilePicture: "", profileImage: "" });
      setUser((current) => ({ ...(current || {}), ...nextUser }));
      addToast("Profile photo reset to VibeBook default.", "success");
    } catch (requestError) {
      addToast(requestError.response?.data?.message || "Unable to reset profile photo.", "error");
    } finally {
      setAvatarSaving(false);
    }
  };

  const openCoverPicker = () => {
    if (!isOwnProfile || coverSaving) {
      return;
    }

    coverInputRef.current?.click();
  };

  const handleCoverSelect = (event) => {
    const selectedFile = event.target.files?.[0];
    event.target.value = "";

    if (!selectedFile) {
      return;
    }

    if (!selectedFile.type?.startsWith("image/")) {
      addToast("Choose an image file for your cover.", "error");
      return;
    }

    if (selectedFile.size > 5 * 1024 * 1024) {
      addToast("Choose a cover image under 5MB.", "error");
      return;
    }

    const nextPreview = URL.createObjectURL(selectedFile);
    setCoverPreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return nextPreview;
    });
    setCoverFile(selectedFile);
  };

  const closeCoverPreview = () => {
    if (coverSaving) {
      return;
    }

    setCoverFile(null);
    setCoverPreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return "";
    });
  };

  const saveCover = async () => {
    if (!coverFile || coverSaving) {
      return;
    }

    setCoverSaving(true);

    try {
      const formData = new FormData();
      formData.append("image", coverFile, coverFile.name || `vibebook-cover-${Date.now()}.jpg`);
      const data = await uploadProfileCover(formData);
      const nextUser = data?.user;

      if (!nextUser?.coverImage) {
        throw new Error("Cover image update did not return an image URL.");
      }

      setUser((current) => ({ ...(current || {}), ...nextUser }));
      await refreshProfile().catch(() => null);
      setCoverFile(null);
      setCoverPreview((current) => {
        if (current) URL.revokeObjectURL(current);
        return "";
      });
      addToast("Cover image updated.", "success");
    } catch (requestError) {
      addToast(requestError.response?.data?.message || requestError.message || "Unable to update cover image.", "error");
    } finally {
      setCoverSaving(false);
    }
  };

  const resetCoverToDefault = async () => {
    if (!isOwnProfile || coverSaving || !hasCustomCoverImage) {
      return;
    }

    setCoverSaving(true);

    try {
      const nextUser = await updateProfile({ coverImage: "" });
      setUser((current) => ({ ...(current || {}), ...nextUser }));
      addToast("Cover reset to VibeBook default.", "success");
    } catch (requestError) {
      addToast(requestError.response?.data?.message || "Unable to reset cover image.", "error");
    } finally {
      setCoverSaving(false);
    }
  };

  if (loading) {
    return (
      <section className="container-page py-10">
        <div className="h-[520px] animate-pulse rounded-lg bg-slate-200" />
      </section>
    );
  }

  if (error) {
    return (
      <section className="container-page py-10">
        <div className="mx-auto max-w-lg rounded-lg border border-slate-200 bg-white p-8 text-center shadow-soft">
          <img src="/logo.png" alt="" className="mx-auto h-16 w-16 rounded-2xl object-cover" onError={handleAvatarError} />
          <h1 className="mt-4 text-xl font-black text-navy">{error}</h1>
          <p className="mt-2 text-sm font-semibold text-slate-500">The profile may have moved, or the network may have dropped the request.</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <button type="button" className="btn-secondary" onClick={() => setProfileRetry((current) => current + 1)}>
              Retry
            </button>
            <Link to="/search" className="btn-primary">
              Back to Search
            </Link>
          </div>
        </div>
      </section>
    );
  }

  if (!user) {
    return (
      <section className="container-page py-10">
        <div className="mx-auto max-w-lg rounded-lg border border-slate-200 bg-white p-8 text-center shadow-soft">
          <img src="/logo.png" alt="" className="mx-auto h-16 w-16 rounded-2xl object-cover" onError={handleAvatarError} />
          <h1 className="mt-4 text-xl font-black text-navy">Profile not found.</h1>
          <Link to="/search" className="btn-primary mt-5">
            Back to Search
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="container-page pb-28 pt-4 sm:py-8">
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-soft">
        <div className="relative h-40 overflow-hidden bg-slate-950 sm:h-56">
          <SafeCoverImage user={user} src={coverImage} alt="" className="h-full w-full object-cover opacity-80 transition duration-500" loading="eager" />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/20 to-transparent" />
          {isOwnProfile && (
            <>
              <input ref={coverInputRef} className="hidden" type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/*" onChange={handleCoverSelect} />
              <div className="absolute bottom-3 right-3 z-30 flex items-center gap-2 sm:bottom-4 sm:right-4">
                {hasCustomCoverImage && (
                  <button
                    type="button"
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-slate-950/65 text-white shadow-lg backdrop-blur transition hover:bg-red-500 active:scale-95 disabled:opacity-60"
                    onClick={resetCoverToDefault}
                    disabled={coverSaving}
                    aria-label="Reset cover image"
                    title="Reset cover image"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
                <button
                  type="button"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/95 text-navy shadow-lg backdrop-blur transition hover:bg-brand active:scale-95 disabled:opacity-60"
                  onClick={openCoverPicker}
                  disabled={coverSaving}
                  aria-label="Change cover image"
                  title="Change cover image"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              </div>
            </>
          )}
          <div className="absolute left-4 right-40 top-4 flex flex-wrap gap-2 sm:right-48">
            {verified && (
              <span className="inline-flex items-center gap-1 rounded-full bg-sky-500 px-3 py-1 text-xs font-black uppercase text-white shadow">
                <BadgeCheck className="h-4 w-4 fill-white text-sky-500" />
                Verified
              </span>
            )}
            {premiumActive && (
              <span className="inline-flex items-center gap-1 rounded-full bg-brand px-3 py-1 text-xs font-black uppercase text-navy shadow">
                <Sparkles className="h-4 w-4" />
                Premium
              </span>
            )}
          </div>
          <div ref={profileActionsRef} className="absolute right-3 top-3 z-30 flex items-center gap-2 sm:right-4 sm:top-4">
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/95 text-slate-800 shadow-lg backdrop-blur transition hover:bg-brand hover:text-navy active:scale-95"
              onClick={() => navigate("/search")}
              aria-label="Find friends"
              title="Find friends"
            >
              <Search className="h-5 w-5" />
            </button>
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/95 text-slate-800 shadow-lg backdrop-blur transition hover:bg-brand hover:text-navy active:scale-95"
              onClick={shareProfile}
              aria-label="Share profile"
              title="Share profile"
            >
              <Share2 className="h-5 w-5" />
            </button>
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/95 text-slate-800 shadow-lg backdrop-blur transition hover:bg-brand hover:text-navy active:scale-95"
              onClick={(event) => {
                event.stopPropagation();
                setProfileMenuOpen((current) => !current);
              }}
              aria-label="Open profile menu"
              aria-expanded={profileMenuOpen}
              title="Profile menu"
            >
              <Menu className="h-5 w-5" />
            </button>

            {profileMenuOpen && (
              <div className="fixed right-3 top-16 z-[100] w-[min(18rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 text-left shadow-2xl sm:right-6 sm:top-20">
                {[
                  { label: "Settings & Privacy", icon: Settings, action: () => navigate("/settings") },
                  { label: "Creator Studio", icon: Rocket, action: () => navigate("/creator-studio") },
                  { label: "Saved", icon: Bookmark, action: () => openProfileTab("Saved") },
                  { label: "Favorites", icon: Star, action: () => openProfileTab("Saved", "Favorites are grouped with saved posts right now.") },
                  {
                    label: "QR Profile",
                    icon: QrCode,
                    action: () => {
                      setProfileMenuOpen(false);
                      setQrProfileOpen(true);
                    },
                  },
                ].map(({ label, icon: Icon, action }) => (
                  <button
                    key={label}
                    type="button"
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50 hover:text-navy"
                    onClick={action}
                  >
                    <Icon className="h-4 w-4 text-slate-500" />
                    <span className="min-w-0 flex-1 truncate">{label}</span>
                  </button>
                ))}
                <div className="my-1 h-px bg-slate-100" />
                <button
                  type="button"
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-bold text-red-600 transition hover:bg-red-50"
                  onClick={handleQuickLogout}
                >
                  <LogOut className="h-4 w-4" />
                  <span className="min-w-0 flex-1 truncate">Logout</span>
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="px-4 pb-6 text-center sm:px-6">
          <div className={`relative mx-auto -mt-16 h-32 w-32 rounded-full ${frameGradient ? `bg-gradient-to-br ${frameGradient} p-1 shadow-[0_0_32px_rgba(34,197,94,0.45)]` : "border-4 border-white bg-slate-100 shadow-xl"}`}>
            {frameGradient && <motion.span className="absolute inset-[-7px] rounded-full bg-inherit opacity-40 blur-md" animate={{ rotate: 360 }} transition={{ duration: 8, repeat: Infinity, ease: "linear" }} />}
            <SafeAvatar user={{ ...user, profilePicture: profilePicture || activeImageUrl }} alt={user.name} className="relative h-full w-full rounded-full border-4 border-white object-cover" loading="eager" />
            {isOwnProfile && (
              <>
                <input ref={avatarInputRef} className="hidden" type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/*" onChange={handleAvatarSelect} />
                <button
                  type="button"
                  className="absolute bottom-2 right-1 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-white text-navy shadow-lg ring-2 ring-white transition hover:bg-brand active:scale-95"
                  onClick={openAvatarPicker}
                  disabled={avatarSaving}
                  aria-label="Change profile photo"
                  title="Change profile photo"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                {hasCustomProfilePicture && (
                  <button
                    type="button"
                    className="absolute bottom-2 left-1 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-white text-red-600 shadow-lg ring-2 ring-white transition hover:bg-red-50 active:scale-95 disabled:opacity-60"
                    onClick={resetAvatarToDefault}
                    disabled={avatarSaving}
                    aria-label="Reset profile photo"
                    title="Reset profile photo"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </>
            )}
            {verified && <BadgeCheck className={`absolute h-8 w-8 rounded-full fill-sky-500 text-white shadow ${verifiedBadgePosition}`} aria-label="Verified creator" />}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <h1 className="text-3xl font-black text-navy sm:text-4xl">{user.name}</h1>
            {creatorRoleLabel(user.role) && (
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black uppercase text-slate-500">{creatorRoleLabel(user.role)}</span>
            )}
          </div>
          {equippedBadges.length > 0 && (
            <div className="mx-auto mt-3 flex max-w-2xl flex-wrap items-center justify-center gap-2">
              {equippedBadges.slice(0, 5).map((badge) => (
                <span key={badge} className="inline-flex items-center gap-1 rounded-full bg-slate-950 px-3 py-1.5 text-xs font-black capitalize text-brand shadow">
                  <Sparkles className="h-3.5 w-3.5" />
                  {badgeLabel(badge)}
                </span>
              ))}
            </div>
          )}
          <p className="mt-1 text-sm font-bold text-slate-500">@{user.username || "creator"}</p>

          <div className="mx-auto mt-5 grid max-w-2xl grid-cols-4 gap-2 rounded-lg bg-slate-50 p-2">
            {[
              { label: "Followers", value: user.followerCount || user.followers?.length || 0 },
              { label: "Following", value: user.followingCount || user.following?.length || 0 },
              { label: "Likes", value: totalLikes },
              { label: "Views", value: totalViews },
            ].map((stat) => (
              <div key={stat.label} className="rounded-lg bg-white px-2 py-3 shadow-sm">
                <p className="text-base font-black text-navy sm:text-xl">{formatCompactNumber(stat.value)}</p>
                <p className="mt-1 truncate text-[10px] font-black uppercase text-slate-400 sm:text-xs">{stat.label}</p>
              </div>
            ))}
          </div>

          {isOwnProfile && profileWallet && (
            <Link
              to="/wallet"
              className="mx-auto mt-4 grid max-w-2xl grid-cols-3 gap-2 rounded-lg border border-brand/30 bg-brand/10 p-2 text-left transition hover:border-brand hover:bg-brand/15"
            >
              <div className="col-span-3 flex items-center gap-2 px-2 pt-1 text-xs font-black uppercase text-green-700 sm:col-span-1 sm:pt-0">
                <Coins className="h-4 w-4" />
                NEX Wallet
              </div>
              <div className="rounded-lg bg-white px-3 py-2 shadow-sm">
                <p className="text-base font-black text-navy">{formatCompactNumber(profileWallet.balance)}</p>
                <p className="text-[10px] font-black uppercase text-slate-400">Balance</p>
              </div>
              <div className="rounded-lg bg-white px-3 py-2 shadow-sm">
                <p className="text-base font-black text-navy">{profileWallet.levelName || "Starter"}</p>
                <p className="text-[10px] font-black uppercase text-slate-400">Creator level</p>
              </div>
            </Link>
          )}

          <p className="mx-auto mt-5 max-w-2xl whitespace-pre-line text-sm font-semibold leading-6 text-slate-600">
            {contentLocked ? "Follow to unlock this creator's content." : user.bio || "This creator has not added a bio yet."}
          </p>

          {(website || socialEntries.length > 0 || skills.length > 0) && (
            <div className="mx-auto mt-4 flex max-w-3xl flex-wrap items-center justify-center gap-2">
              {website && (
                <a className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-600 hover:bg-brand/10 hover:text-navy" href={normalizeExternalHref(website)} target="_blank" rel="noreferrer">
                  <LinkIcon className="h-3.5 w-3.5" />
                  Website
                </a>
              )}
              {socialEntries.map(([key, value]) => (
                <a
                  key={key}
                  className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-600 hover:bg-brand/10 hover:text-navy"
                  href={normalizeExternalHref(value)}
                  target="_blank"
                  rel="noreferrer"
                >
                  <LinkIcon className="h-3.5 w-3.5" />
                  {key}
                </a>
              ))}
              {skills.slice(0, 8).map((skill) => (
                <span key={skill} className="rounded-full bg-brand/10 px-3 py-1.5 text-xs font-black text-green-700">
                  #{skill}
                </span>
              ))}
            </div>
          )}

          <div className="mx-auto mt-5 flex max-w-3xl flex-wrap items-center justify-center gap-2">
            {isOwnProfile ? (
              <Link to="/settings" className="btn-primary gap-2">
                <Pencil className="h-4 w-4" />
                Edit Profile
              </Link>
            ) : (
              <>
                <button
                  type="button"
                  className={`${followButtonClass} gap-2`}
                  onClick={handleFollowToggle}
                  disabled={followUpdating}
                >
                  <FollowButtonIcon className="h-4 w-4" />
                  {followUpdating ? "Updating..." : followButtonLabel}
                </button>
                {followsViewer && !isFollowing && (
                  <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-2 text-xs font-black text-slate-600">
                    Follow Back available
                  </span>
                )}
                <Link className="btn-secondary gap-2" to={`/chat/${user._id}`}>
                  <MessageCircle className="h-4 w-4" />
                  Chat
                </Link>
                <button type="button" className="btn-secondary gap-2" onClick={handleLikeToggle}>
                  <Heart className={`h-4 w-4 ${user.likedByViewer ? "fill-red-500 text-red-500" : ""}`} />
                  {user.likedByViewer ? "Unlike" : "Like"}
                </button>
                <button type="button" className="btn-secondary gap-2" onClick={handleStartTip}>
                  <Gift className="h-4 w-4" />
                  Tip
                </button>
              </>
            )}
            {isOwnProfile && !premiumActive && (
              <button type="button" className="btn-secondary gap-2" onClick={handleUpgradePremium}>
                <Sparkles className="h-4 w-4" />
                Upgrade
              </button>
            )}
          </div>

          {(contactUnlocked || contactLocked) && (
            <div className="mx-auto mt-4 flex max-w-3xl flex-wrap items-center justify-center gap-2">
              {contactLocked && (
                <button type="button" className="btn-secondary gap-2" onClick={handleUnlockContact} disabled={unlockingContact}>
                  <Lock className="h-4 w-4" />
                  {unlockingContact ? "Unlocking..." : "Unlock contact"}
                </button>
              )}
              {contactUnlocked && whatsapp && (
                <a className="btn-secondary gap-2" href={`https://wa.me/${whatsapp}`} target="_blank" rel="noreferrer">
                  <MessageCircle className="h-4 w-4" />
                  WhatsApp
                </a>
              )}
              {contactUnlocked && phone && (
                <a className="btn-secondary gap-2" href={`tel:${phone}`}>
                  <Phone className="h-4 w-4" />
                  Call
                </a>
              )}
              {contactUnlocked && user.email && (
                <a className="btn-secondary gap-2" href={`mailto:${user.email}`}>
                  <Mail className="h-4 w-4" />
                  Email
                </a>
              )}
            </div>
          )}

          {(followStatus || likeStatus || profileShareStatus || contactError || paymentStatus || paymentError || lockedImageCount > 0) && (
            <div className="mx-auto mt-4 grid max-w-3xl gap-2 text-left">
              {followStatus && <div className="rounded-lg border border-slate-200 bg-surface p-3 text-sm text-slate-700">{followStatus}</div>}
              {likeStatus && <div className="rounded-lg border border-slate-200 bg-surface p-3 text-sm text-slate-700">{likeStatus}</div>}
              {profileShareStatus && <div className="rounded-lg border border-slate-200 bg-surface p-3 text-sm text-slate-700">{profileShareStatus}</div>}
              {contactError && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{contactError}</div>}
              {paymentStatus && <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">{paymentStatus}</div>}
              {paymentError && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{paymentError}</div>}
              {lockedImageCount > 0 && (
                <div className="rounded-lg border border-slate-200 bg-surface p-3 text-sm font-semibold text-slate-600">
                  {lockedImageCount} gallery {lockedImageCount === 1 ? "item is" : "items are"} locked. Follow to unlock content.
                </div>
              )}
            </div>
          )}

          {paymentAction && (
            <div className="mx-auto mt-4 max-w-3xl rounded-lg border border-amber-200 bg-amber-50 p-4 text-left">
              <div className="flex items-center gap-3 text-sm font-bold text-amber-900">
                <CreditCard className="h-5 w-5" />
                {paymentAction.type === "tip"
                  ? "Send creator tip"
                  : paymentAction.type === "boost"
                    ? "Boost this post"
                    : paymentAction.type === "premium"
                      ? "Activate premium"
                      : "Unlock action"}
              </div>
              <p className="mt-2 text-xs font-semibold text-amber-800">
                Sandbox charge: {Number(paymentAction.amount || 0).toLocaleString()} {paymentAction.currency || "RWF"}
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {PAYMENT_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className="btn-secondary justify-start"
                    onClick={() => handlePayment(option.value)}
                    disabled={Boolean(processingPayment)}
                  >
                    {processingPayment === option.value ? "Verifying..." : option.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div id="profile-grid" className="mt-6 scroll-mt-24 rounded-lg border border-slate-200 bg-white p-3 shadow-soft sm:p-5">
        <div className="grid grid-cols-4 gap-1 rounded-lg bg-slate-50 p-1">
          {profileTabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.label}
                type="button"
                className={`flex min-w-0 items-center justify-center gap-2 rounded-lg px-2 py-3 text-xs font-black transition sm:text-sm ${
                  activeProfileTab === tab.label ? "bg-white text-navy shadow-sm" : "text-slate-500 hover:text-navy"
                }`}
                onClick={() => setActiveProfileTab(tab.label)}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{tab.label}</span>
                <span className="hidden rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500 sm:inline">{tab.count}</span>
              </button>
            );
          })}
        </div>

        {activeCommentPost && activeCommentPost.commentsEnabled !== false && (
          <form className="mt-4 flex gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2" onSubmit={(event) => handlePostComment(event, activeCommentPost)}>
            <input
              className="field min-w-0 flex-1 bg-white"
              value={profileCommentText}
              onChange={(event) => setProfileCommentText(event.target.value)}
              placeholder={`Comment on ${activeCommentPost.caption ? `"${activeCommentPost.caption.slice(0, 28)}"` : "this post"}`}
            />
            <button type="submit" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand text-navy" aria-label="Send comment">
              <Send className="h-4 w-4" />
            </button>
          </form>
        )}

        {activeGridItems.length > 0 ? (
          <div className="mt-4 grid grid-cols-3 gap-1.5 sm:gap-3 md:grid-cols-4 xl:grid-cols-5">
            {activeGridItems.map((item, index) => {
              const itemUrl = getPostUrl(item);
              const itemIsVideo = isVideoPost(item);
              const itemIsPost = Boolean(item._id && !String(item._id).startsWith("loose-"));
              const durationLabel = itemIsVideo ? formatDuration(item.duration) : "";
              const mediaPost = { ...item, url: itemUrl, type: itemIsVideo ? "video" : "image" };

              return (
                <article
                  key={item._id || `${itemUrl}-${index}`}
                  className="group relative aspect-[3/4] overflow-hidden rounded-lg bg-slate-950 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-lg active:scale-[0.98]"
                >
                  <div className="absolute inset-0 animate-pulse bg-slate-800" />
                  {item.external ? (
                    <iframe
                      src={toEmbedUrl(itemUrl)}
                      title={`${user.name} video ${index + 1}`}
                      className="h-full w-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      loading="lazy"
                    />
                  ) : (
                    <PostMedia
                      post={mediaPost}
                      alt={`${user.name} post`}
                      className="h-full w-full"
                      imageClassName="h-full w-full object-cover"
                      videoClassName="h-full w-full object-cover"
                      placeholderClassName="h-full w-full"
                      controls={false}
                      muted
                      minimal
                      onViewed={itemIsPost ? (metrics) => handlePostViewed(item, metrics) : undefined}
                    />
                  )}

                  <button
                    type="button"
                    className="absolute inset-0 z-20 cursor-pointer touch-manipulation"
                    onClick={() => openProfileMedia(item, index)}
                    aria-label={`Open ${itemIsVideo ? "video" : "photo"}`}
                  />

                  <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between bg-gradient-to-b from-slate-950/60 to-transparent p-2 text-white">
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-950/35 px-2 py-1 text-[10px] font-black backdrop-blur">
                      {itemIsVideo ? <Play className="h-3 w-3 fill-white" /> : <ImageIcon className="h-3 w-3" />}
                      {formatCompactNumber(item.views || item.viewCount || 0)}
                    </span>
                    {durationLabel && <span className="rounded-full bg-slate-950/45 px-2 py-1 text-[10px] font-black backdrop-blur">{durationLabel}</span>}
                  </div>

                  <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-slate-950/85 via-slate-950/35 to-transparent p-2 text-white">
                    {item.caption && <p className="line-clamp-2 text-xs font-bold leading-4">{item.caption}</p>}
                    <div className="mt-2 flex items-center justify-between gap-1 text-[10px] font-black">
                      <span className="inline-flex items-center gap-1">
                        <Heart className={`h-3.5 w-3.5 ${item.likedByViewer ? "fill-red-500 text-red-500" : ""}`} />
                        {formatCompactNumber(item.likes || item.likeCount || 0)}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <MessageCircle className="h-3.5 w-3.5" />
                        {formatCompactNumber(item.commentCount || 0)}
                      </span>
                    </div>
                    {itemIsPost && (
                      <div className="pointer-events-auto relative z-40 mt-2 grid grid-cols-4 gap-1 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100">
                        <button type="button" className="rounded-md bg-white/15 p-1.5 backdrop-blur" onClick={(event) => { event.stopPropagation(); handlePostLike(item); }} aria-label="Like post">
                          <Heart className={`mx-auto h-3.5 w-3.5 ${item.likedByViewer ? "fill-red-500 text-red-500" : ""}`} />
                        </button>
                        <button
                          type="button"
                          className="rounded-md bg-white/15 p-1.5 backdrop-blur"
                          onClick={(event) => {
                            event.stopPropagation();
                            openProfileMedia(item, index, true);
                          }}
                          aria-label="Comment on post"
                        >
                          <MessageCircle className="mx-auto h-3.5 w-3.5" />
                        </button>
                        <button type="button" className="rounded-md bg-white/15 p-1.5 backdrop-blur" onClick={(event) => { event.stopPropagation(); handlePostShare(item); }} aria-label="Share post">
                          <Share2 className="mx-auto h-3.5 w-3.5" />
                        </button>
                        {isOwnProfile ? (
                          <button type="button" className="rounded-md bg-white/15 p-1.5 backdrop-blur" onClick={(event) => { event.stopPropagation(); setPostActionMenu(postActionMenu === item._id ? null : item._id); }} aria-label="Post actions">
                            <Menu className="mx-auto h-3.5 w-3.5" />
                          </button>
                        ) : (
                          <span className="rounded-md bg-white/15 p-1.5 backdrop-blur">
                            <Eye className="mx-auto h-3.5 w-3.5" />
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {isOwnProfile && itemIsPost && (
                    <>
                      <button
                        type="button"
                        className="absolute right-2 top-10 z-40 rounded-full bg-slate-950/45 p-2 text-brand opacity-0 shadow backdrop-blur transition group-hover:opacity-100"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleBoostPost(item);
                        }}
                        aria-label="Boost post"
                      >
                        <Rocket className="h-4 w-4" />
                      </button>
                      {postActionMenu === item._id && (
                        <div className="absolute right-2 top-20 z-50 w-40 overflow-hidden rounded-lg bg-white text-sm font-black text-navy shadow-2xl">
                          <button type="button" className="flex w-full items-center gap-2 px-3 py-2 hover:bg-slate-50" onClick={(event) => { event.stopPropagation(); setEditingPost(item); setPostActionMenu(null); }}>
                            <Pencil className="h-4 w-4" />
                            Edit
                          </button>
                          <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-red-600 hover:bg-red-50" disabled={deletingPostId === item._id} onClick={(event) => { event.stopPropagation(); setDeletePostTarget(item); setPostActionMenu(null); }}>
                            <Trash2 className="h-4 w-4" />
                            {deletingPostId === item._id ? "Deleting..." : "Delete"}
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </article>
              );
            })}
          </div>
        ) : (
          <div className="mt-4 flex min-h-56 items-center justify-center rounded-lg bg-slate-50 p-6 text-center text-sm font-bold text-slate-500">
            <span className="inline-flex flex-col items-center gap-3">
              {contentLocked ? <Lock className="h-8 w-8 text-slate-400" /> : <Grid3X3 className="h-8 w-8 text-slate-400" />}
              {contentLocked ? "Follow to unlock content." : `No ${activeProfileTab.toLowerCase()} yet.`}
            </span>
          </div>
        )}
      </div>

      {qrProfileOpen && (
        <div
          className="fixed inset-0 z-[95] flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={() => setQrProfileOpen(false)}
          role="presentation"
        >
          <div
            className="w-full max-w-sm rounded-t-3xl border border-slate-200 bg-white p-5 shadow-2xl sm:rounded-3xl"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="QR profile"
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-black text-navy">QR Profile</h2>
                <p className="mt-1 truncate text-xs font-bold text-slate-500">@{user?.username || "creator"}</p>
              </div>
              <button
                type="button"
                className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-navy"
                onClick={() => setQrProfileOpen(false)}
                aria-label="Close QR profile"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mx-auto flex h-52 w-52 items-center justify-center rounded-3xl border border-slate-200 bg-white p-5 shadow-inner">
              <div className="grid grid-cols-9 gap-1" aria-hidden="true">
                {Array.from({ length: 81 }).map((_, index) => {
                  const row = Math.floor(index / 9);
                  const col = index % 9;
                  const finder =
                    (row < 3 && col < 3) ||
                    (row < 3 && col > 5) ||
                    (row > 5 && col < 3);
                  const filled = finder || (index + String(user?.username || "").length) % 3 === 0 || (row * col) % 5 === 0;
                  return <span key={index} className={`h-3 w-3 rounded-[2px] ${filled ? "bg-navy" : "bg-slate-100"}`} />;
                })}
              </div>
            </div>

            <p className="mt-4 break-all rounded-xl bg-slate-50 p-3 text-center text-xs font-bold text-slate-500">{profileShareUrl}</p>
            <button type="button" className="btn-primary mt-4 w-full gap-2" onClick={shareProfile}>
              <Share2 className="h-4 w-4" />
              Share profile
            </button>
          </div>
        </div>
      )}

      <ProfileMediaViewer
        viewer={mediaViewer}
        user={user}
        profilePicture={profilePicture || activeImageUrl}
        currentUser={currentUser}
        canEdit={isOwnProfile}
        onClose={() => setMediaViewer(null)}
        onLike={handlePostLike}
        onDoubleTapLike={(post) => handlePostLike(post, { forceLike: true })}
        onSave={handlePostSave}
        onShare={handlePostShare}
        onViewed={handlePostViewed}
        onComment={handlePostCommentMessage}
        onEdit={(post) => {
          setMediaViewer(null);
          setEditingPost(post);
        }}
        onDelete={handlePostDelete}
        onBoost={(post) => {
          setMediaViewer(null);
          handleBoostPost(post);
        }}
      />

      {editingPost && (
        <EditVideoModal
          post={editingPost}
          onClose={() => setEditingPost(null)}
          onSave={(nextPost) => {
            if (nextPost) {
              replaceProfilePost(nextPost);
            }
          }}
        />
      )}

      {deletePostTarget && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/60 p-4 backdrop-blur-sm sm:items-center">
          <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-2xl">
            <h2 className="text-lg font-black text-navy">Delete this post?</h2>
            <p className="mt-2 text-sm font-semibold text-slate-500">It will disappear from your profile and the feed immediately.</p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button type="button" className="btn-secondary" onClick={() => setDeletePostTarget(null)} disabled={Boolean(deletingPostId)}>Cancel</button>
              <button type="button" className="btn-primary bg-red-500 text-white hover:bg-red-600" onClick={() => handlePostDelete(deletePostTarget)} disabled={Boolean(deletingPostId)}>
                {deletingPostId ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {coverPreview && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/65 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="w-full max-w-2xl overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-lg">
            <div className="flex items-center justify-between border-b border-slate-100 p-4">
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-brand">Cover image</p>
                <h2 className="text-lg font-black text-navy">Preview</h2>
              </div>
              <button type="button" className="rounded-full p-2 text-slate-500 hover:bg-slate-100" onClick={closeCoverPreview} disabled={coverSaving} aria-label="Close cover image preview">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4">
              <img src={coverPreview} alt="" className="h-48 w-full rounded-lg bg-slate-100 object-cover ring-1 ring-slate-200 sm:h-64" onError={handleCoverError} />
              <p className="mt-3 truncate text-center text-sm font-semibold text-slate-500">{coverFile?.name || "Selected image"}</p>
            </div>
            <div className="grid grid-cols-2 gap-2 border-t border-slate-100 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
              <button type="button" className="btn-secondary" onClick={closeCoverPreview} disabled={coverSaving}>
                Cancel
              </button>
              <button type="button" className="btn-primary" onClick={saveCover} disabled={coverSaving}>
                {coverSaving ? "Saving..." : "Save cover"}
              </button>
            </div>
          </div>
        </div>
      )}

      {avatarPreview && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/65 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="w-full max-w-sm overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-lg">
            <div className="flex items-center justify-between border-b border-slate-100 p-4">
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-brand">Profile photo</p>
                <h2 className="text-lg font-black text-navy">Preview</h2>
              </div>
              <button type="button" className="rounded-full p-2 text-slate-500 hover:bg-slate-100" onClick={closeAvatarPreview} disabled={avatarSaving} aria-label="Close profile photo preview">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-5 text-center">
              <img src={avatarPreview} alt="" className="mx-auto h-48 w-48 rounded-full bg-slate-100 object-cover ring-4 ring-slate-100" onError={handleAvatarError} />
              <p className="mt-4 truncate text-sm font-semibold text-slate-500">{avatarFile?.name || "Selected image"}</p>
            </div>
            <div className="grid grid-cols-2 gap-2 border-t border-slate-100 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
              <button type="button" className="btn-secondary" onClick={closeAvatarPreview} disabled={avatarSaving}>
                Cancel
              </button>
              <button type="button" className="btn-primary" onClick={saveAvatar} disabled={avatarSaving}>
                {avatarSaving ? "Saving..." : "Save photo"}
              </button>
            </div>
          </div>
        </div>
      )}

      {previewImage && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="relative max-h-full w-full max-w-4xl">
            <button
              type="button"
              className="absolute right-3 top-3 z-10 rounded-lg bg-white/90 p-2 text-navy shadow"
              onClick={() => setPreviewImage("")}
              aria-label="Close image preview"
            >
              <X className="h-5 w-5" />
            </button>
            <img src={mediaUrl(previewImage)} alt="" className="max-h-[86vh] w-full rounded-lg object-contain" onError={handleAvatarError} />
          </div>
        </div>
      )}
    </section>
  );
};

export default Profile;
