// @ts-nocheck
import { BadgeCheck, CalendarCheck, Heart, MapPin, Star } from "lucide-react";
import { Link } from "react-router-dom";

import { mediaUrl } from "../services/api";

const renderStars = (rating) => {
  const value = Math.round(Number(rating || 0));

  return [1, 2, 3, 4, 5].map((item) => (
    <Star key={item} className={`h-4 w-4 ${item <= value ? "fill-amber-400 text-amber-400" : "text-slate-300"}`} />
  ));
};

const ProfileCard = ({ user }) => {
  const image = user?.profilePicture || user?.profileImage || user?.images?.[0] || user?.gallery?.[0] || "/logo.png";
  const premiumActive = Boolean(user?.isPremium || user?.premiumBadge);
  const verified = Boolean(user?.isVerified || user?.verified);
  const rating = Number(user.averageRating || user.rating || 0);
  const skills = Array.isArray(user?.skills) ? user.skills.filter(Boolean).slice(0, 4) : [];
  const price = Number(user?.price || 0);
  const displayLocation = user.location || user.district || user.province || "Rwanda";

  return (
    <article className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-soft transition hover:-translate-y-1 hover:shadow-lg">
      <div className="aspect-[4/3] bg-slate-100">
        <img src={mediaUrl(image)} alt={user.name} className="h-full w-full object-cover" loading="lazy" />
      </div>
      <div className="space-y-4 p-5">
        <div>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate text-lg font-bold text-navy">{user.name}</h3>
                {verified && <BadgeCheck className="h-5 w-5 shrink-0 fill-sky-500 text-white" aria-label="Verified creator" />}
                {premiumActive && (
                  <span className="rounded-full bg-brand/10 px-2.5 py-1 text-[11px] font-bold uppercase text-green-700">
                    Premium
                  </span>
                )}
              </div>
              <p className="text-sm capitalize text-slate-500">{user.role}</p>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-navy">
              <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
              {rating.toFixed(1)}
            </span>
          </div>
          <div className="mt-2 flex text-amber-500">{renderStars(rating)}</div>
          <p className="mt-3 text-sm text-slate-600">{user.category || "Entertainment professional"}</p>
          {skills.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {skills.map((skill) => (
                <span key={skill} className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">
                  #{skill}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 text-xs font-semibold text-slate-500">
          <span className="inline-flex min-w-0 items-center gap-1">
            <MapPin className="h-4 w-4 shrink-0" />
            <span className="truncate">{displayLocation}</span>
          </span>
          <span className="capitalize">{user.availability || "available"}</span>
        </div>

        <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1 font-bold">
            <Heart className="h-4 w-4 text-red-500" />
            {Number(user.likes || user.likeCount || 0)} likes
          </span>
          <span className="font-bold text-navy">{price ? `${price.toLocaleString()} RWF+` : "Price on request"}</span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Link to={`/profile/${user._id}`} className="btn-secondary py-2.5">
            View
          </Link>
          <Link to={`/profile/${user._id}`} className="btn-primary gap-2 py-2.5">
            <CalendarCheck className="h-4 w-4" />
            Book Now
          </Link>
        </div>
      </div>
    </article>
  );
};

export default ProfileCard;
