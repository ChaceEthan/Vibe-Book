// @ts-nocheck
import { Link } from "react-router-dom";

import { mediaUrl } from "../services/api";

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

const ProfileCard = ({ user }) => {
  const image = user?.images?.[0] || "/logo.png";
  const premiumActive = Boolean(user?.isPremium || user?.premiumBadge);

  return (
    <article className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-soft transition hover:-translate-y-1 hover:shadow-lg">
      <div className="aspect-[4/3] bg-slate-100">
        <img src={mediaUrl(image)} alt={user.name} className="h-full w-full object-cover" />
      </div>
      <div className="space-y-4 p-5">
        <div>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-bold text-navy">{user.name}</h3>
                {premiumActive && (
                  <span className="rounded-full bg-brand/10 px-2.5 py-1 text-[11px] font-bold uppercase text-green-700">
                    Premium
                  </span>
                )}
              </div>
              <p className="text-sm capitalize text-slate-500">{user.role}</p>
            </div>
            <span className="rounded-full bg-brand/10 px-3 py-1 text-xs font-bold text-green-700">
              {Number(user.averageRating || user.rating || 0).toFixed(1)}
            </span>
          </div>
          <p className="mt-3 text-sm text-slate-600">{user.category || "Entertainment professional"}</p>
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-bold text-navy">{formatPrice(user.price)}</p>
          <p className="text-xs capitalize text-slate-500">{user.availability || "available"}</p>
        </div>

        <Link to={`/profile/${user._id}`} className="btn-primary w-full py-2.5">
          View Profile
        </Link>
      </div>
    </article>
  );
};

export default ProfileCard;
