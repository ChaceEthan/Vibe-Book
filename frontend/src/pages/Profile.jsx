// @ts-nocheck
import { CreditCard, Heart, Lock, Mail, MessageCircle, Phone, Star, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { useAuth } from "../context/AuthContext.jsx";
import { bookingApi, mediaUrl, paymentApi, ratingApi, userApi } from "../services/api";

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

const Profile = () => {
  const { id } = useParams();
  const { refreshProfile, user: currentUser } = useAuth();
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

  useEffect(() => {
    const fetchProfile = async () => {
      setLoading(true);
      setError("");

      try {
        const { data } = await userApi.getById(id);
        setUser(data.user);
      } catch (requestError) {
        setError(requestError.response?.data?.message || "Profile not found.");
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [id]);

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
  const images = useMemo(() => (premiumActive ? allImages : allImages.slice(0, 3)), [allImages, premiumActive]);
  const lockedImageCount = premiumActive ? 0 : Math.max(Number(user?.galleryImageCount || allImages.length) - images.length, 0);
  const activeImageUrl = images[activeImage] || images[0] || "/logo.png";
  const videoUrls = useMemo(() => {
    const videos = Array.isArray(user?.videos) && user.videos.length ? user.videos : user?.videoUrls || [];
    return Array.isArray(videos) ? videos.filter(Boolean) : [];
  }, [user]);
  const whatsapp = cleanPhone(user?.whatsappNumber || user?.socialLinks?.whatsapp || user?.phone || "");
  const phone = cleanPhone(user?.phone || "");
  const isOwnProfile = currentUser?._id && user?._id && currentUser._id === user._id;
  const contactUnlocked = Boolean(isOwnProfile || user?.contactUnlocked);
  const contactLocked = Boolean(!isOwnProfile && user?.contactLocked);

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

  const handleUnlockContact = async () => {
    setUnlockingContact(true);
    setContactError("");
    setPaymentStatus("");
    setPaymentError("");

    setPaymentAction({
      type: "contact",
      profileId: id,
      amount: 1000,
      currency: "RWF",
    });
    setContactError("Choose a payment option to unlock contact.");
    setUnlockingContact(false);
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
        purpose: "platform_access",
        amount: paymentAction.amount,
        currency: paymentAction.currency,
        profileId: user._id,
      });
      await paymentApi.verify({
        paymentId: created.payment?._id,
        reference: created.payment?.reference,
      });
      await refreshProfile();

      if (paymentAction.type === "booking") {
        await bookingApi.create(paymentAction.payload);
        setBookingStatus("Payment verified. Booking request sent.");
        setBookingForm(initialBookingForm(currentUser));
      }

      if (paymentAction.type === "offer") {
        await bookingApi.sendOffer(paymentAction.payload);
        setOfferStatus("Payment verified. Offer sent.");
        setOfferForm({ eventDate: "", offerPrice: "", message: "" });
      }

      if (paymentAction.type === "contact") {
        const { data } = await userApi.getById(id);
        setUser(data.user);
        setContactError("");
      }

      setPaymentAction(null);
      setPaymentStatus("Sandbox payment verified.");
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
              <img src={mediaUrl(activeImageUrl)} alt={user.name} className="h-full w-full object-cover" />
            </button>
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
              {lockedImageCount} premium gallery images locked
            </div>
          )}

          {videoUrls.length > 0 && (
            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-soft">
              <h2 className="text-lg font-black text-navy">Videos</h2>
              <div className="mt-4 grid gap-4">
                {videoUrls.map((videoUrl, index) => (
                  <div key={videoUrl} className="aspect-video overflow-hidden rounded-lg bg-slate-100">
                    {videoUrl.startsWith("/uploads") ? (
                      <video src={mediaUrl(videoUrl)} className="h-full w-full" controls preload="metadata" />
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
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-5">
          <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-soft">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <img src={mediaUrl(profilePicture || activeImageUrl)} alt="" className="mb-4 h-20 w-20 rounded-full object-cover shadow-soft" />
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold uppercase text-brand">{user.role}</p>
                  {premiumActive && (
                    <span className="rounded-full bg-brand/10 px-3 py-1 text-xs font-bold uppercase text-green-700">
                      Premium
                    </span>
                  )}
                </div>
                <h1 className="mt-2 text-3xl font-black text-navy">{user.name}</h1>
                <p className="mt-2 text-sm text-slate-500">{user.category || "Entertainment professional"}</p>
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

            <div className="mt-6">
              <h2 className="text-lg font-bold text-navy">Bio</h2>
              <p className="mt-2 whitespace-pre-line text-sm leading-7 text-slate-600">
                {user.bio || "This performer has not added a bio yet."}
              </p>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
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
                    Unlock contact to view
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
            </div>
            {likeStatus && <div className="mt-4 rounded-lg border border-slate-200 bg-surface p-3 text-sm text-slate-700">{likeStatus}</div>}
            {contactError && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{contactError}</div>}
            {paymentStatus && <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">{paymentStatus}</div>}
            {paymentError && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{paymentError}</div>}

            {paymentAction && (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
                <div className="flex items-center gap-3 text-sm font-bold text-amber-900">
                  <CreditCard className="h-5 w-5" />
                  Unlock action
                </div>
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
