// @ts-nocheck
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../context/AuthContext.jsx";
import { bookingApi, mediaUrl, paymentApi } from "../services/api";

const PAYMENT_OPTIONS = [
  { value: "USDT", label: "USDT" },
  { value: "USDC", label: "USDC" },
  { value: "USD", label: "USD" },
  { value: "MTN_MOMO", label: "MTN MoMo" },
  { value: "AIRTEL_MONEY", label: "Airtel Money" },
];

const formatPrice = (value) => {
  const amount = Number(value || 0);
  if (!amount) {
    return "Not set";
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
  const [paying, setPaying] = useState("");

  const loadBookings = async () => {
    setLoading(true);
    setError("");

    try {
      const { data } = await bookingApi.getMine();
      setBookings(Array.isArray(data?.bookings) ? data.bookings : []);
    } catch (requestError) {
      setBookings([]);
      setError(requestError.response?.data?.message || "Unable to load collaborations.");
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
      setStatus(`Request ${nextStatus}.`);
      await loadBookings();
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to update request.");
    }
  };

  const payBooking = async (booking, method) => {
    setPaying(`${booking._id}-${method}`);
    setStatus("");
    setError("");

    try {
      const { data: created } = await paymentApi.create({
        method,
        purpose: "booking_access",
        bookingId: booking._id,
        profileId: booking.talent?._id,
        amount: booking.amount || 1000,
        currency: booking.currency || "RWF",
      });
      await paymentApi.verify({
        paymentId: created.payment?._id,
        reference: created.payment?.reference,
      });
      setStatus("Sandbox payment verified.");
      await loadBookings();
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to verify payment.");
    } finally {
      setPaying("");
    }
  };

  return (
    <section className="container-page py-10">
      <div className="mb-8">
        <p className="text-sm font-semibold uppercase text-brand">Collaborations</p>
        <h1 className="mt-2 text-3xl font-black text-navy">Creator Requests</h1>
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
            const isRequester = requester._id === user?._id;
            const otherUser = isTalent ? requester : talent;
            const image = otherUser.profilePicture || otherUser.profileImage || otherUser.images?.[0];

            return (
              <article key={booking._id} className="rounded-lg border border-slate-200 bg-white p-5 shadow-soft">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="flex gap-4">
                    <img src={mediaUrl(image)} alt="" className="h-16 w-16 rounded-lg object-cover" />
                    <div>
                      <h2 className="text-lg font-black text-navy">{otherUser.name || booking.businessName || "Creator request"}</h2>
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
                    <p className="text-xs font-semibold uppercase text-slate-500">Budget</p>
                    <p className="mt-1 font-bold text-navy">{formatPrice(booking.offeredPrice || booking.offerPrice)}</p>
                  </div>
                  <div className="rounded-lg bg-surface p-4">
                    <p className="text-xs font-semibold uppercase text-slate-500">Confirmed budget</p>
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

                {isRequester && booking.paymentStatus !== "paid" && (
                  <div className="mt-5 rounded-lg border border-slate-200 bg-surface p-4">
                    <p className="text-xs font-semibold uppercase text-slate-500">Payment</p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-3">
                      {PAYMENT_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          className="btn-secondary justify-start"
                          onClick={() => payBooking(booking, option.value)}
                          disabled={Boolean(paying)}
                        >
                          {paying === `${booking._id}-${option.value}` ? "Verifying..." : option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center shadow-soft">
          <h2 className="text-lg font-bold text-navy">No requests yet</h2>
          <p className="mt-2 text-sm text-slate-600">Collaboration requests appear here after someone sends a request.</p>
        </div>
      )}
    </section>
  );
};

export default Bookings;
