// @ts-nocheck
import {
  BadgeCheck,
  Bookmark,
  CreditCard,
  Eye,
  Gift,
  Grid3X3,
  Heart,
  Image as ImageIcon,
  Link as LinkIcon,
  Lock,
  Mail,
  MessageCircle,
  Pencil,
  Phone,
  Play,
  Rocket,
  Send,
  Share2,
  Sparkles,
  Tag,
  UserMinus,
  UserPlus,
  Video,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import PostMedia from "../components/PostMedia.jsx";
import EditVideoModal from "../components/EditVideoModal.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { bookingApi, feedApi, mediaUrl, paymentApi, userApi } from "../services/api";
import { usePostStore } from "../store/postStore";

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
  onSave,
  onShare,
  onViewed,
  onComment,
  onEdit,
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
                    preload={shouldPreload ? "auto" : "metadata"}
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
          <ViewerActionButton label="Boost post" onClick={() => onBoost(activeItem)}>
            <Rocket className="h-5 w-5 text-brand" />
          </ViewerActionButton>
        )}
      </div>

      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[103] bg-gradient-to-t from-slate-950 via-slate-950/65 to-transparent px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-20 sm:px-8">
        <div className="max-w-[min(84vw,42rem)]">
          <div className="flex items-center gap-3">
            <img src={mediaUrl(profilePicture || user?.profilePicture || "/logo.png")} alt="" className="h-10 w-10 rounded-full border border-white/30 object-cover" />
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
                      <img
                        src={mediaUrl(author.profilePicture || author.profileImage || author.images?.[0] || "/logo.png")}
                        alt=""
                        className="h-9 w-9 rounded-full bg-slate-100 object-cover"
                        loading="lazy"
                      />
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
            <img src={mediaUrl(currentUser?.profilePicture || currentUser?.profileImage || "/logo.png")} alt="" className="h-10 w-10 rounded-full bg-slate-100 object-cover" />
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
  const { refreshProfile, user: currentUser } = useAuth();
  const storePosts = usePostStore((state) => state.posts);
  const mergePosts = usePostStore((state) => state.mergePosts);
  const replacePost = usePostStore((state) => state.replacePost);
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
  const [activeProfileTab, setActiveProfileTab] = useState("Videos");
  const [mediaViewer, setMediaViewer] = useState(null);
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
          console.log("[VibeBook profile] fetched profile posts", {
            userId: data.user?._id,
            count: data.user.posts.length,
            posts: data.user.posts,
          });
        }
      } catch (requestError) {
        setError(requestError.response?.data?.message || "Profile not found.");
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [id, mergePosts]);

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
  }, [id, currentUser]);

  useEffect(() => {
    setBookingForm((current) => ({
      ...current,
      userName: current.userName || currentUser?.name || "",
    }));
  }, [currentUser?.name]);

  const profilePicture = user?.profilePicture || user?.profileImage || "";
  const allImages = useMemo(
    () => (user?.images?.length ? user.images : [profilePicture || "/logo.png"]),
    [profilePicture, user]
  );
  const premiumActive = Boolean(user?.isPremium || user?.premiumBadge);
  const verified = Boolean(user?.isVerified || user?.verified);
  const skills = Array.isArray(user?.skills) ? user.skills.filter(Boolean) : [];
  const isOwnProfile = currentUser?._id && user?._id && currentUser._id === user._id;
  const isFollowing = Boolean(user?.isFollowing);
  const contentUnlocked = Boolean(isOwnProfile || user?.isUnlocked || user?.contentUnlocked);
  const contentLocked = Boolean(!isOwnProfile && !contentUnlocked);
  const images = allImages;
  const lockedImageCount = contentLocked ? Math.max(Number(user?.galleryImageCount || allImages.length) - images.length, 0) : 0;
  const activeImageUrl = images[activeImage] || images[0] || "/logo.png";
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

    [...userPosts, ...syncedPosts].forEach((post) => {
      if (post?._id) {
        byId.set(post._id, { ...(byId.get(post._id) || {}), ...post });
      }
    });

    return Array.from(byId.values()).sort((left, right) => new Date(right.createdAt || 0) - new Date(left.createdAt || 0));
  }, [id, storePosts, user]);

  const postUrls = useMemo(() => new Set(profilePosts.map(getPostUrl).filter(Boolean)), [profilePosts]);
  const coverImage = user?.coverImage || user?.coverPicture || user?.bannerImage || user?.coverPhoto || images.find((image) => image && image !== profilePicture) || profilePicture || "/logo.png";
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

    try {
      const { data } = isFollowing ? await userApi.unfollow(user._id) : await userApi.follow(user._id);
      setUser(data.user);
      await refreshProfile();
      setFollowStatus(data.message || (isFollowing ? "Profile unfollowed." : "Profile followed."));
    } catch (requestError) {
      setFollowStatus(requestError.response?.data?.message || "Unable to update follow.");
    } finally {
      setFollowUpdating(false);
    }
  };

  const replaceProfilePost = (nextPost) => {
    if (!nextPost?._id) {
      return;
    }

    replacePost(nextPost);
    setMediaViewer((current) =>
      current
        ? {
            ...current,
            items: current.items.map((item) => (item?._id === nextPost._id ? { ...item, ...nextPost } : item)),
          }
        : current
    );
    setUser((current) => ({
      ...current,
      posts: (current?.posts || []).map((post) => (post._id === nextPost._id ? { ...post, ...nextPost } : post)),
    }));
  };

  const handlePostLike = async (post) => {
    if (!currentUser) {
      navigate("/login");
      return;
    }

    try {
      const { data } = await feedApi.toggleLike(post._id);
      replaceProfilePost(data.feedItem);
    } catch {
      setLikeStatus("Unable to update post like.");
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
      replaceProfilePost(data.feedItem);
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
      replaceProfilePost(data.feedItem);
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
      replaceProfilePost(data.feedItem);
    } catch (requestError) {
      if (requestError.name !== "AbortError") {
        setLikeStatus("Unable to share post.");
      }
    }
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
      replaceProfilePost(data.feedItem);
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
        <div className="rounded-lg border border-red-200 bg-red-50 p-8 text-center">
          <h1 className="text-xl font-bold text-red-800">{error}</h1>
          <Link to="/search" className="btn-primary mt-5">
            Back to Search
          </Link>
        </div>
      </section>
    );
  }

  if (!user) {
    return (
      <section className="container-page py-10">
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center shadow-soft">
          <h1 className="text-xl font-bold text-navy">Profile not found.</h1>
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
          <img src={mediaUrl(coverImage)} alt="" className="h-full w-full object-cover opacity-75" />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/20 to-transparent" />
          <div className="absolute left-4 top-4 flex flex-wrap gap-2">
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
        </div>

        <div className="px-4 pb-6 text-center sm:px-6">
          <div className="relative mx-auto -mt-16 h-32 w-32 rounded-full border-4 border-white bg-slate-100 shadow-xl">
            <img src={mediaUrl(profilePicture || activeImageUrl)} alt={user.name} className="h-full w-full rounded-full object-cover" />
            {verified && <BadgeCheck className="absolute bottom-2 right-1 h-8 w-8 rounded-full fill-sky-500 text-white shadow" aria-label="Verified creator" />}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <h1 className="text-3xl font-black text-navy sm:text-4xl">{user.name}</h1>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black uppercase text-slate-500">{user.role || "Creator"}</span>
          </div>
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
                  className={`${isFollowing ? "btn-secondary" : "btn-primary"} gap-2`}
                  onClick={handleFollowToggle}
                  disabled={followUpdating}
                >
                  {isFollowing ? <UserMinus className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
                  {followUpdating ? "Updating..." : isFollowing ? "Unfollow" : "Follow"}
                </button>
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

          {(followStatus || likeStatus || contactError || paymentStatus || paymentError || lockedImageCount > 0) && (
            <div className="mx-auto mt-4 grid max-w-3xl gap-2 text-left">
              {followStatus && <div className="rounded-lg border border-slate-200 bg-surface p-3 text-sm text-slate-700">{followStatus}</div>}
              {likeStatus && <div className="rounded-lg border border-slate-200 bg-surface p-3 text-sm text-slate-700">{likeStatus}</div>}
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

      <div className="mt-6 rounded-lg border border-slate-200 bg-white p-3 shadow-soft sm:p-5">
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
                          <button type="button" className="rounded-md bg-white/15 p-1.5 backdrop-blur" onClick={(event) => { event.stopPropagation(); setEditingPost(item); }} aria-label="Edit post">
                            <Pencil className="mx-auto h-3.5 w-3.5" />
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

      <ProfileMediaViewer
        viewer={mediaViewer}
        user={user}
        profilePicture={profilePicture || activeImageUrl}
        currentUser={currentUser}
        canEdit={isOwnProfile}
        onClose={() => setMediaViewer(null)}
        onLike={handlePostLike}
        onSave={handlePostSave}
        onShare={handlePostShare}
        onViewed={handlePostViewed}
        onComment={handlePostCommentMessage}
        onEdit={(post) => {
          setMediaViewer(null);
          setEditingPost(post);
        }}
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
            <img src={mediaUrl(previewImage)} alt="" className="max-h-[86vh] w-full rounded-lg object-contain" />
          </div>
        </div>
      )}
    </section>
  );
};

export default Profile;
