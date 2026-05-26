// @ts-nocheck
import { BadgeCheck, Heart, MapPin, UserPlus, Users } from "lucide-react";
import { Link } from "react-router-dom";

import LiveAvatar from "./LiveAvatar.jsx";
import { useLiveStreamStore } from "../store/livestreamStore";

const ProfileCard = ({ user }) => {
  const premiumActive = Boolean(user?.isPremium || user?.premiumBadge);
  const verified = Boolean(user?.isVerified || user?.verified);
  const frame = user?.equippedFrame || user?.marketplace?.equippedFrame || "";
  const frameTone = {
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
    frame_neon_glow: "from-emerald-300 to-cyan-400",
    frame_gold_elite: "from-yellow-200 to-amber-500",
    frame_fire_aura: "from-orange-400 to-rose-600",
    frame_diamond_ring: "from-cyan-200 to-violet-500",
    frame_rwanda_pride: "from-sky-500 via-yellow-300 to-emerald-500",
    frame_creator_legend: "from-fuchsia-400 via-amber-300 to-cyan-300",
    frame_cyber_pulse: "from-blue-500 to-teal-300",
  }[frame];
  const badges = Array.isArray(user?.equippedBadges) ? user.equippedBadges : Array.isArray(user?.creatorBadges) ? user.creatorBadges : [];
  const skills = Array.isArray(user?.skills) ? user.skills.filter(Boolean).slice(0, 4) : [];
  const displayLocation = user.location || user.district || user.province || "Rwanda";
  const handle = user?.username ? `@${user.username}` : "@creator";
  const liveStreamId = useLiveStreamStore((state) => state.liveCreatorIds[String(user?._id || user?.id || "")] || user?.liveStreamId || "");
  const primaryPath = liveStreamId ? `/live/${liveStreamId}` : `/profile/${user._id}`;

  return (
    <article className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-soft transition hover:-translate-y-1 hover:shadow-lg">
      <div className={`aspect-[4/3] bg-slate-100 ${frameTone ? `bg-gradient-to-br ${frameTone} p-1` : ""}`}>
        <LiveAvatar user={user} alt={user.name} wrapperClassName="h-full w-full rounded-md" className="h-full w-full rounded-md object-cover" />
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
                {badges.slice(0, 2).map((badge) => (
                  <span key={badge} className="rounded-full bg-slate-950 px-2.5 py-1 text-[11px] font-bold capitalize text-brand">
                    {String(badge).replace(/^badge_/, "").replace(/_/g, " ")}
                  </span>
                ))}
              </div>
              <p className="text-sm text-slate-500">{handle}</p>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-navy">
              <Users className="h-3.5 w-3.5" />
              {Number(user.followerCount || 0).toLocaleString()}
            </span>
          </div>
          <p className="mt-3 text-sm text-slate-600">{user.bio || user.category || "Creator on VibeBook"}</p>
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
          <span>{user.country || "Global"}</span>
        </div>

        <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1 font-bold">
            <Heart className="h-4 w-4 text-red-500" />
            {Number(user.likes || user.likeCount || 0)} likes
          </span>
          <span className="font-bold text-navy">{Number(user.viewsCount || user.totalViews || 0).toLocaleString()} views</span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Link to={primaryPath} className="btn-secondary py-2.5">
            {liveStreamId ? "Join Live" : "View"}
          </Link>
          <Link to={`/profile/${user._id}`} className="btn-primary gap-2 py-2.5">
            <UserPlus className="h-4 w-4" />
            Follow
          </Link>
        </div>
      </div>
    </article>
  );
};

export default ProfileCard;
