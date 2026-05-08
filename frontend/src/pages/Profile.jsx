// @ts-nocheck
import { BadgeCheck, CreditCard, Eye, Gift, Heart, Lock, Mail, MessageCircle, Pencil, Phone, Rocket, Send, Share2, Sparkles, Star, UserMinus, UserPlus, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import PostMedia from "../components/PostMedia.jsx";
import EditProfileModal from "../components/EditProfileModal.jsx";
import EditVideoModal from "../components/EditVideoModal.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { bookingApi, feedApi, mediaUrl, paymentApi, ratingApi, userApi } from "../services/api";
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
    return "Price on request";
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
  const [ratingValue, setRatingValue] = useState(0);
  const [ratingStatus, setRatingStatus] = useState("");
  const [ratingError, setRatingError] = useState("");
  const [likeStatus, setLikeStatus] = useState("");
  const [followStatus, setFollowStatus] = useState("");
  const [followUpdating, setFollowUpdating] = useState(false);
  const [viewedPosts, setViewedPosts] = useState(new Set());
  const [profileCommentOpen, setProfileCommentOpen] = useState("");
  const [profileCommentText, setProfileCommentText] = useState("");
  const [profileEditOpen, setProfileEditOpen] = useState(false);
  const [editingPost, setEditingPost] = useState(null);
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
    setProfileEditOpen(false);
    setEditingPost(null);
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
      setBookingStatus("Booking request sent.");
      setBookingForm(initialBookingForm(currentUser));
    } catch (requestError) {
      if (requestError.response?.status === 402) {
        setPaymentAction({ type: "booking", payload: buildBookingPayload(), ...getAccessPayment(requestError) });
        setBookingError("Payment or free trial access is required before this booking is sent.");
      } else {
        setBookingError(requestError.response?.data?.message || "Booking request failed.");
      }
    } finally {
      setBookingSending(false);
    }
  };

  const handleRatingSubmit = async (value) => {
    setRatingValue(value);
    setRatingStatus("");
    setRatingError("");

    try {
      const { data } = await ratingApi.add(user._id, { value });
      setUser((current) => ({
        ...current,
        averageRating: data.averageRating,
        rating: data.averageRating,
        ratings: data.ratings,
      }));
      setRatingStatus("Rating saved.");
    } catch (requestError) {
      setRatingError(requestError.response?.data?.message || "Unable to save rating.");
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
    setUser((current) => ({
      ...current,
      posts: (current?.posts || []).map((post) => (post._id === nextPost._id ? { ...post, ...nextPost } : post)),
    }));
  };

  const handleProfileSaved = async (nextUser) => {
    if (nextUser) {
      setUser((current) => ({ ...current, ...nextUser }));
    }

    await refreshProfile();
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

  const handlePostComment = async (event, post) => {
    event.preventDefault();

    if (!currentUser) {
      navigate("/login");
      return;
    }

    if (!profileCommentText.trim()) {
      return;
    }

    try {
      const { data } = await feedApi.addComment(post._id, { message: profileCommentText.trim() });
      replaceProfilePost(data.feedItem);
      setProfileCommentText("");
    } catch {
      setLikeStatus("Unable to add post comment.");
    }
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
        setBookingStatus("Payment verified. Booking request sent.");
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
    <section className="container-page py-10">
      <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-4">
          <div className="relative overflow-hidden rounded-lg bg-slate-100 shadow-soft">
            <button type="button" className="block h-[420px] w-full" onClick={() => setPreviewImage(activeImageUrl)}>
              <img
                src={mediaUrl(activeImageUrl)}
                alt={user.name}
                className={`h-full w-full object-cover ${contentLocked ? "scale-[1.02] blur-sm" : ""}`}
              />
            </button>
            {contentLocked && (
              <div className="absolute inset-x-6 bottom-6 rounded-lg bg-slate-950/75 p-4 text-center text-white backdrop-blur">
                <div className="flex items-center justify-center gap-2 text-sm font-black">
                  <Lock className="h-4 w-4" />
                  Follow to unlock content
                </div>
              </div>
            )}
            {images.length > 1 && (
              <div className="absolute inset-x-4 top-1/2 flex -translate-y-1/2 justify-between">
                <button type="button" className="rounded-full bg-white/90 px-4 py-3 text-sm font-black text-navy shadow" onClick={() => goToImage(-1)} aria-label="Previous image">
                  {"<"}
                </button>
                <button type="button" className="rounded-full bg-white/90 px-4 py-3 text-sm font-black text-navy shadow" onClick={() => goToImage(1)} aria-label="Next image">
                  {">"}
                </button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
            {images.map((image, index) => (
              <button
                key={`${image}-${index}`}
                type="button"
                className={`h-24 overflow-hidden rounded-lg border bg-slate-100 shadow-sm ${
                  index === activeImage ? "border-brand ring-2 ring-brand/30" : "border-transparent"
                }`}
                onClick={() => {
                  setActiveImage(index);
                  setPreviewImage(image);
                }}
              >
                <img src={mediaUrl(image)} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>

          {lockedImageCount > 0 && (
            <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-600 shadow-soft">
              {lockedImageCount} gallery {lockedImageCount === 1 ? "item is" : "items are"} locked. Follow to unlock content.
            </div>
          )}

          {(videoUrls.length > 0 || (contentLocked && Number(user?.videoCount || 0) > 0)) && (
            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-soft">
              <h2 className="text-lg font-black text-navy">Videos</h2>
              <div className="mt-4 grid gap-4">
                {contentLocked && !videoUrls.length ? (
                  <div className="flex aspect-video items-center justify-center rounded-lg bg-slate-100 p-5 text-center text-sm font-bold text-slate-600">
                    <span className="inline-flex items-center gap-2">
                      <Lock className="h-4 w-4" />
                      Follow to unlock content
                    </span>
                  </div>
                ) : (
                  videoUrls.map((videoUrl, index) => (
                    <div key={videoUrl} className="aspect-video overflow-hidden rounded-lg bg-slate-100">
                      {isDirectVideoUrl(videoUrl) ? (
                        <video
                          src={mediaUrl(videoUrl)}
                          className="h-full bg-slate-900"
                          controls
                          playsInline
                          preload="metadata"
                          style={{ width: "100%", borderRadius: "12px" }}
                        />
                      ) : (
                        <iframe
                          src={toEmbedUrl(videoUrl)}
                          title={`${user.name} video ${index + 1}`}
                          className="h-full w-full"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                          loading="lazy"
                        />
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {profilePosts.length > 0 || (!isOwnProfile && Number(user?.postCount || 0) > 0) ? (
            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-soft">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-black text-navy">Posts</h2>
                <span className="text-xs font-bold uppercase text-slate-500">{Number(user?.postCount || profilePosts.length || 0)} posts</span>
              </div>
              {profilePosts.length > 0 ? (
                <div className="mt-4 grid gap-4">
                  {profilePosts.map((post) => (
                    <article key={post._id} className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                      <PostMedia
                        post={post}
                        alt={`${user.name} post`}
                        imageClassName="max-h-[300px] w-full rounded-lg object-cover"
                        videoClassName="max-h-[350px] w-full bg-slate-950 object-cover"
                        placeholderClassName="rounded-lg"
                        controls
                        onViewed={(metrics) => handlePostViewed(post, metrics)}
                      />
                      <div className="p-3">
                        {post.caption && <p className="line-clamp-2 text-sm font-semibold text-slate-700">{post.caption}</p>}
                        {Array.isArray(post.tags) && post.tags.length > 0 && (
                          <p className="mt-2 line-clamp-1 text-xs font-bold text-brand">
                            {post.tags.slice(0, 5).map((tag) => `#${tag}`).join(" ")}
                          </p>
                        )}
                        <div className={`mt-3 grid gap-2 text-xs font-bold text-slate-600 ${isOwnProfile ? "grid-cols-6" : "grid-cols-4"}`}>
                          <button type="button" className="flex items-center gap-1 rounded-lg bg-white px-2 py-2" onClick={() => handlePostLike(post)}>
                            <Heart className={`h-4 w-4 ${post.likedByViewer ? "fill-red-500 text-red-500" : ""}`} />
                            {Number(post.likes || post.likeCount || 0)}
                          </button>
                          <button
                            type="button"
                            className="flex items-center gap-1 rounded-lg bg-white px-2 py-2"
                            onClick={() => setProfileCommentOpen((current) => (current === post._id ? "" : post._id))}
                          >
                            <MessageCircle className="h-4 w-4" />
                            {Number(post.commentCount || 0)}
                          </button>
                          <span className="flex items-center gap-1 rounded-lg bg-white px-2 py-2">
                            <Eye className="h-4 w-4" />
                            {Number(post.views || 0)}
                          </span>
                          <button type="button" className="flex items-center gap-1 rounded-lg bg-white px-2 py-2" onClick={() => handlePostShare(post)}>
                            <Share2 className="h-4 w-4" />
                            {Number(post.shareCount || 0)}
                          </button>
                          {isOwnProfile && (
                            <button type="button" className="flex items-center gap-1 rounded-lg bg-white px-2 py-2 text-brand" onClick={() => handleBoostPost(post)}>
                              <Rocket className="h-4 w-4" />
                              Boost
                            </button>
                          )}
                          {isOwnProfile && (
                            <button type="button" className="flex items-center gap-1 rounded-lg bg-white px-2 py-2 text-navy" onClick={() => setEditingPost(post)}>
                              <Pencil className="h-4 w-4" />
                              Edit
                            </button>
                          )}
                        </div>
                        {profileCommentOpen === post._id && post.commentsEnabled !== false && (
                          <form className="mt-3 flex gap-2" onSubmit={(event) => handlePostComment(event, post)}>
                            <input
                              className="field min-w-0 flex-1"
                              value={profileCommentText}
                              onChange={(event) => setProfileCommentText(event.target.value)}
                              placeholder="Add comment"
                            />
                            <button type="submit" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand text-navy" aria-label="Send comment">
                              <Send className="h-4 w-4" />
                            </button>
                          </form>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="mt-4 flex min-h-28 items-center justify-center rounded-lg bg-slate-100 p-5 text-center text-sm font-bold text-slate-600">
                  <span className="inline-flex items-center gap-2">
                    <Lock className="h-4 w-4" />
                    Follow to unlock posts
                  </span>
                </div>
              )}
            </div>
          ) : null}
        </div>

        <div className="space-y-5">
          <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-soft">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <img src={mediaUrl(profilePicture || activeImageUrl)} alt="" className="mb-4 h-20 w-20 rounded-full object-cover shadow-soft" />
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold uppercase text-brand">{user.role}</p>
                  {verified && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-3 py-1 text-xs font-bold uppercase text-sky-700">
                      <BadgeCheck className="h-4 w-4" />
                      Verified
                    </span>
                  )}
                  {premiumActive && (
                    <span className="rounded-full bg-brand/10 px-3 py-1 text-xs font-bold uppercase text-green-700">
                      Premium
                    </span>
                  )}
                </div>
                <h1 className="mt-2 text-3xl font-black text-navy">{user.name}</h1>
                <p className="mt-2 text-sm text-slate-500">{user.category || "Entertainment professional"}</p>
                <p className="mt-2 text-xs font-bold uppercase text-slate-400">
                  {Number(user.followerCount || 0)} followers
                </p>
              </div>
              <div className="rounded-lg bg-slate-100 px-4 py-3 text-center">
                <p className="text-xs font-semibold uppercase text-slate-500">Rating</p>
                <p className="text-xl font-black text-navy">{Number(user.averageRating || user.rating || 0).toFixed(1)}</p>
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg bg-surface p-4">
                <p className="text-xs font-semibold uppercase text-slate-500">Starting Price (Negotiable)</p>
                <p className="mt-1 text-lg font-bold text-navy">{formatPrice(user.price)}</p>
                <p className="mt-1 text-xs text-slate-500">Final price is agreed between client and talent after negotiation.</p>
              </div>
              <div className="rounded-lg bg-surface p-4">
                <p className="text-xs font-semibold uppercase text-slate-500">Availability</p>
                <p className="mt-1 text-lg font-bold capitalize text-navy">{user.availability || "available"}</p>
              </div>
            </div>

            {skills.length > 0 && (
              <div className="mt-6">
                <h2 className="text-lg font-bold text-navy">Skills</h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  {skills.map((skill) => (
                    <span key={skill} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">
                      #{skill}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-6">
              <h2 className="text-lg font-bold text-navy">Bio</h2>
              <p className="mt-2 whitespace-pre-line text-sm leading-7 text-slate-600">
                {contentLocked ? "Follow to unlock content" : user.bio || "This performer has not added a bio yet."}
              </p>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {isOwnProfile && (
                <button type="button" className="btn-primary gap-2" onClick={() => setProfileEditOpen(true)}>
                  <Pencil className="h-4 w-4" />
                  Edit Profile
                </button>
              )}
              {!isOwnProfile && (
                <button
                  type="button"
                  className={`${isFollowing ? "btn-secondary" : "btn-primary"} gap-2`}
                  onClick={handleFollowToggle}
                  disabled={followUpdating}
                >
                  {isFollowing ? <UserMinus className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
                  {followUpdating ? "Updating..." : isFollowing ? "Unfollow" : "Follow"}
                </button>
              )}
              {!isOwnProfile && (
                <button type="button" className="btn-secondary gap-2" onClick={handleLikeToggle}>
                  <Heart className={`h-4 w-4 ${user.likedByViewer ? "fill-red-500 text-red-500" : ""}`} />
                  {user.likedByViewer ? "Unlike" : "Like"} ({Number(user.likes || user.likeCount || 0)})
                </button>
              )}
              {!isOwnProfile && (
                <Link className="btn-secondary gap-2" to={`/chat/${user._id}`}>
                  <MessageCircle className="h-4 w-4" />
                  Open Chat
                </Link>
              )}
              {contactLocked && (
                <div className="rounded-lg border border-slate-200 bg-surface p-4 sm:col-span-2">
                  <div className="flex items-center gap-3 text-sm font-bold text-slate-700">
                    <Lock className="h-5 w-5 text-slate-500" />
                    Follow or unlock contact to view
                  </div>
                  <button type="button" className="btn-primary mt-3 w-full" onClick={handleUnlockContact} disabled={unlockingContact}>
                    {unlockingContact ? "Unlocking..." : "Unlock contact"}
                  </button>
                </div>
              )}
              {contactUnlocked && whatsapp && (
                <a className="btn-primary gap-2" href={`https://wa.me/${whatsapp}`} target="_blank" rel="noreferrer">
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
              {!isOwnProfile && (
                <button type="button" className="btn-primary" onClick={() => setBookingOpen((value) => !value)}>
                  Book Now
                </button>
              )}
              {!isOwnProfile && (
                <button type="button" className="btn-secondary" onClick={() => setOfferOpen((value) => !value)}>
                  Send Offer
                </button>
              )}
              {!isOwnProfile && (
                <button type="button" className="btn-secondary gap-2" onClick={handleStartTip}>
                  <Gift className="h-4 w-4" />
                  Tip 1,000 RWF
                </button>
              )}
              {isOwnProfile && !premiumActive && (
                <button type="button" className="btn-primary gap-2" onClick={handleUpgradePremium}>
                  <Sparkles className="h-4 w-4" />
                  Upgrade Premium
                </button>
              )}
            </div>
            {followStatus && <div className="mt-4 rounded-lg border border-slate-200 bg-surface p-3 text-sm text-slate-700">{followStatus}</div>}
            {likeStatus && <div className="mt-4 rounded-lg border border-slate-200 bg-surface p-3 text-sm text-slate-700">{likeStatus}</div>}
            {contactError && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{contactError}</div>}
            {paymentStatus && <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">{paymentStatus}</div>}
            {paymentError && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{paymentError}</div>}

            {paymentAction && (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
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

            {!isOwnProfile && (
              <div className="mt-6 rounded-lg bg-surface p-4">
                <p className="text-xs font-semibold uppercase text-slate-500">Rate this profile</p>
                <div className="mt-3 flex gap-2">
                  {[1, 2, 3, 4, 5].map((value) => (
                    <button
                      key={value}
                      type="button"
                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-amber-500"
                      onClick={() => handleRatingSubmit(value)}
                      aria-label={`Rate ${value} stars`}
                    >
                      <Star className={`h-5 w-5 ${value <= ratingValue ? "fill-amber-400 text-amber-400" : "text-slate-300"}`} />
                    </button>
                  ))}
                </div>
                {ratingStatus && <p className="mt-2 text-sm text-green-700">{ratingStatus}</p>}
                {ratingError && <p className="mt-2 text-sm text-red-700">{ratingError}</p>}
              </div>
            )}
          </div>

          {bookingOpen && !isOwnProfile && (
            <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-soft">
              <h2 className="text-lg font-black text-navy">Book Now</h2>
              {bookingStatus && <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">{bookingStatus}</div>}
              {bookingError && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{bookingError}</div>}
              <form className="mt-4 space-y-4" onSubmit={handleBookingSubmit}>
                <label className="space-y-2">
                  <span className="label">Your name</span>
                  <input className="field" name="userName" value={bookingForm.userName} onChange={handleBookingChange} required />
                </label>
                <label className="space-y-2">
                  <span className="label">Event place (bar/hotel/etc)</span>
                  <input className="field" name="businessName" value={bookingForm.businessName} onChange={handleBookingChange} required />
                </label>
                <label className="space-y-2">
                  <span className="label">Event location</span>
                  <input className="field" name="location" value={bookingForm.location} onChange={handleBookingChange} required />
                </label>
                <label className="space-y-2">
                  <span className="label">Event date</span>
                  <input className="field" type="date" name="eventDate" value={bookingForm.eventDate} onChange={handleBookingChange} />
                </label>
                <label className="space-y-2">
                  <span className="label">Event type</span>
                  <input className="field" name="eventType" value={bookingForm.eventType} onChange={handleBookingChange} required />
                </label>
                <div className="grid gap-3 sm:grid-cols-[1fr_0.8fr]">
                  <label className="space-y-2">
                    <span className="label">Event duration</span>
                    <input
                      className="field"
                      type="number"
                      min="1"
                      name="durationValue"
                      value={bookingForm.durationValue}
                      onChange={handleBookingChange}
                      required
                    />
                  </label>
                  <label className="space-y-2">
                    <span className="label">Unit</span>
                    <select className="field" name="durationUnit" value={bookingForm.durationUnit} onChange={handleBookingChange}>
                      <option value="days">Days</option>
                      <option value="hours">Hours</option>
                    </select>
                  </label>
                </div>
                <label className="space-y-2">
                  <span className="label">Starting offer (Negotiable)</span>
                  <input
                    className="field"
                    type="number"
                    min="1"
                    name="offeredPrice"
                    value={bookingForm.offeredPrice}
                    onChange={handleBookingChange}
                    required
                  />
                </label>
                <label className="space-y-2">
                  <span className="label">Final agreed price</span>
                  <input
                    className="field"
                    type="number"
                    min="1"
                    name="finalAgreedPrice"
                    value={bookingForm.finalAgreedPrice}
                    onChange={handleBookingChange}
                    placeholder="Set after negotiation"
                  />
                  <span className="text-xs text-slate-500">Final price is agreed between client and talent after negotiation.</span>
                </label>
                <label className="space-y-2">
                  <span className="label">Message</span>
                  <textarea
                    className="field min-h-28 resize-y"
                    name="message"
                    value={bookingForm.message}
                    onChange={handleBookingChange}
                    required
                  />
                </label>
                <button type="submit" className="btn-primary w-full" disabled={bookingSending}>
                  {bookingSending ? "Sending..." : "Book Now"}
                </button>
              </form>
            </div>
          )}

          {offerOpen && !isOwnProfile && (
            <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-soft">
              <h2 className="text-lg font-black text-navy">Send Offer</h2>
              {offerStatus && <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">{offerStatus}</div>}
              {offerError && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{offerError}</div>}
              <form className="mt-4 space-y-4" onSubmit={handleOfferSubmit}>
                <label className="space-y-2">
                  <span className="label">Event date</span>
                  <input className="field" type="date" name="eventDate" value={offerForm.eventDate} onChange={handleOfferChange} />
                </label>
                <label className="space-y-2">
                  <span className="label">Starting offer (Negotiable)</span>
                  <input
                    className="field"
                    type="number"
                    min="1"
                    name="offerPrice"
                    value={offerForm.offerPrice}
                    onChange={handleOfferChange}
                    required
                  />
                </label>
                <label className="space-y-2">
                  <span className="label">Message</span>
                  <textarea className="field min-h-28 resize-y" name="message" value={offerForm.message} onChange={handleOfferChange} />
                </label>
                <button type="submit" className="btn-primary w-full" disabled={offerSending}>
                  {offerSending ? "Sending..." : "Send Offer"}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>

      {profileEditOpen && (
        <EditProfileModal
          user={user}
          onClose={() => setProfileEditOpen(false)}
          onSave={handleProfileSaved}
        />
      )}

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
