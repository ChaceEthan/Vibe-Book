// @ts-nocheck
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { useAuth } from "../context/AuthContext.jsx";
import { bookingApi, mediaUrl, userApi } from "../services/api";

const cleanPhone = (value = "") => value.replace(/[^\d]/g, "");

const initialBookingForm = (currentUser) => ({
  userName: currentUser?.name || "",
  businessName: "",
  location: "",
  offeredPrice: "",
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
  const { user: currentUser, payAccess } = useAuth();
  const [user, setUser] = useState(null);
  const [activeImage, setActiveImage] = useState(0);
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
  }, [id, currentUser]);

  useEffect(() => {
    setBookingForm((current) => ({
      ...current,
      userName: current.userName || currentUser?.name || "",
    }));
  }, [currentUser?.name]);

  const allImages = useMemo(() => (user?.images?.length ? user.images : ["/logo.png"]), [user]);
  const premiumActive = Boolean(user?.isPremium || user?.premiumBadge);
  const images = useMemo(() => (premiumActive ? allImages : allImages.slice(0, 3)), [allImages, premiumActive]);
  const lockedImageCount = premiumActive ? 0 : Math.max(Number(user?.galleryImageCount || allImages.length) - images.length, 0);
  const activeImageUrl = images[activeImage] || images[0] || "/logo.png";
  const videoUrls = useMemo(() => (Array.isArray(user?.videoUrls) ? user.videoUrls.filter(Boolean) : []), [user]);
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

  const handleBookingSubmit = async (event) => {
    event.preventDefault();
    setBookingSending(true);
    setBookingStatus("");
    setBookingError("");

    try {
      await bookingApi.create({
        talentId: user._id,
        userName: bookingForm.userName.trim() || currentUser?.name || "",
        businessName: bookingForm.businessName.trim(),
        location: bookingForm.location.trim(),
        offeredPrice: Number(bookingForm.offeredPrice),
        message: bookingForm.message.trim(),
      });
      setBookingStatus("Booking request sent.");
      setBookingForm(initialBookingForm(currentUser));
    } catch (requestError) {
      setBookingError(requestError.response?.data?.message || "Booking request failed.");
    } finally {
      setBookingSending(false);
    }
  };

  const handleUnlockContact = async () => {
    setUnlockingContact(true);
    setContactError("");

    try {
      await payAccess({
        amount: 1000,
        currency: "RWF",
      });
      const { data } = await userApi.getById(id);
      setUser(data.user);
    } catch (requestError) {
      setContactError(requestError.response?.data?.message || "Unable to unlock contact.");
    } finally {
      setUnlockingContact(false);
    }
  };

  const handleOfferChange = (event) => {
    setOfferForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  };

  const handleOfferSubmit = async (event) => {
    event.preventDefault();
    setOfferSending(true);
    setOfferStatus("");
    setOfferError("");

    try {
      await bookingApi.sendOffer({
        talentId: user._id,
        eventDate: offerForm.eventDate || undefined,
        offerPrice: Number(offerForm.offerPrice),
        message: offerForm.message.trim(),
      });
      setOfferStatus("Offer sent.");
      setOfferForm({ eventDate: "", offerPrice: "", message: "" });
    } catch (requestError) {
      setOfferError(requestError.response?.data?.message || "Offer failed.");
    } finally {
      setOfferSending(false);
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
            <img src={mediaUrl(activeImageUrl)} alt={user.name} className="h-[420px] w-full object-cover" />
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
                onClick={() => setActiveImage(index)}
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
                <p className="text-xs font-semibold uppercase text-slate-500">Price</p>
                <p className="mt-1 text-lg font-bold text-navy">{formatPrice(user.price)}</p>
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
              {contactLocked && (
                <button type="button" className="btn-primary" onClick={handleUnlockContact} disabled={unlockingContact}>
                  {unlockingContact ? "Unlocking..." : "Pay to unlock contact"}
                </button>
              )}
              {contactUnlocked && whatsapp && (
                <a className="btn-primary" href={`https://wa.me/${whatsapp}`} target="_blank" rel="noreferrer">
                  WhatsApp
                </a>
              )}
              {contactUnlocked && phone && (
                <a className="btn-secondary" href={`tel:${phone}`}>
                  Call
                </a>
              )}
              {user.email && (
                <a className="btn-secondary" href={`mailto:${user.email}`}>
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
            {contactError && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{contactError}</div>}
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
                  <span className="label">Business name</span>
                  <input className="field" name="businessName" value={bookingForm.businessName} onChange={handleBookingChange} required />
                </label>
                <label className="space-y-2">
                  <span className="label">Event location</span>
                  <input className="field" name="location" value={bookingForm.location} onChange={handleBookingChange} required />
                </label>
                <label className="space-y-2">
                  <span className="label">Offered price</span>
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
                  <span className="label">Offer price</span>
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
    </section>
  );
};

export default Profile;
