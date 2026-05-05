// @ts-nocheck
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../context/AuthContext.jsx";
import { bookingApi, mediaUrl } from "../services/api";

const formatPrice = (value) => {
  const amount = Number(value || 0);
  if (!amount) {
    return "Pending negotiation";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "RWF",
    maximumFractionDigits: 0,
  }).format(amount);
};

const Bookings = () => {
  const { user } = useAuth();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const loadBookings = async () => {
    setLoading(true);
    setError("");

    try {
      const { data } = await bookingApi.getMine();
      setBookings(Array.isArray(data?.bookings) ? data.bookings : []);
    } catch (requestError) {
      setBookings([]);
      setError(requestError.response?.data?.message || "Unable to load bookings.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBookings();
  }, []);

  const updateStatus = async (bookingId, nextStatus) => {
    setStatus("");
    setError("");

    try {
      await bookingApi.updateStatus(bookingId, { status: nextStatus });
      setStatus(`Booking ${nextStatus}.`);
      await loadBookings();
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to update booking.");
    }
  };

  return (
    <section className="container-page py-10">
      <div className="mb-8">
        <p className="text-sm font-semibold uppercase text-brand">Bookings</p>
        <h1 className="mt-2 text-3xl font-black text-navy">Booking Requests</h1>
      </div>

      {status && <div className="mb-5 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">{status}</div>}
      {error && <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {loading ? (
        <div className="h-40 animate-pulse rounded-lg bg-slate-200" />
      ) : bookings.length ? (
        <div className="grid gap-4">
          {bookings.map((booking) => {
            const talent = booking.talent || {};
            const requester = booking.requester || {};
            const isTalent = talent._id === user?._id;
            const otherUser = isTalent ? requester : talent;
            const image = otherUser.profilePicture || otherUser.profileImage || otherUser.images?.[0];

            return (
              <article key={booking._id} className="rounded-lg border border-slate-200 bg-white p-5 shadow-soft">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="flex gap-4">
                    <img src={mediaUrl(image)} alt="" className="h-16 w-16 rounded-lg object-cover" />
                    <div>
                      <h2 className="text-lg font-black text-navy">{otherUser.name || booking.businessName || "Booking"}</h2>
                      <p className="mt-1 text-sm text-slate-600">{booking.location || "Location pending"}</p>
                      <p className="mt-1 text-sm text-slate-600">
                        Duration: {booking.durationValue || booking.numberOfDays || 1} {booking.durationUnit || "days"}
                      </p>
                      <p className="mt-1 text-sm text-slate-600">Event type: {booking.eventType || "Not set"}</p>
                    </div>
                  </div>
                  <span className="w-fit rounded-full bg-brand/10 px-3 py-1 text-xs font-bold uppercase text-green-700">
                    {booking.status}
                  </span>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg bg-surface p-4">
                    <p className="text-xs font-semibold uppercase text-slate-500">Starting offer</p>
                    <p className="mt-1 font-bold text-navy">{formatPrice(booking.offeredPrice || booking.offerPrice)}</p>
                  </div>
                  <div className="rounded-lg bg-surface p-4">
                    <p className="text-xs font-semibold uppercase text-slate-500">Final agreed price</p>
                    <p className="mt-1 font-bold text-navy">{formatPrice(booking.finalAgreedPrice)}</p>
                  </div>
                </div>

                {booking.message && <p className="mt-4 whitespace-pre-line text-sm leading-6 text-slate-600">{booking.message}</p>}

                <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                  {isTalent && booking.status === "pending" && (
                    <>
                      <button type="button" className="btn-primary" onClick={() => updateStatus(booking._id, "accepted")}>
                        Accept
                      </button>
                      <button type="button" className="btn-secondary" onClick={() => updateStatus(booking._id, "rejected")}>
                        Reject
                      </button>
                    </>
                  )}
                  <Link className="btn-secondary" to={`/chat/${otherUser._id}`}>
                    Open Chat
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center shadow-soft">
          <h2 className="text-lg font-bold text-navy">No bookings yet</h2>
          <p className="mt-2 text-sm text-slate-600">Booking requests appear here after a client clicks Book Now.</p>
        </div>
      )}
    </section>
  );
};

export default Bookings;
