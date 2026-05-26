// @ts-nocheck
import { useEffect } from "react";

import SafeAvatar from "./SafeAvatar.jsx";
import { useLiveStreamStore } from "../store/livestreamStore";

const idOf = (value) => value?._id?.toString?.() || value?.id?.toString?.() || value?.toString?.() || "";

const userIdFor = (user = {}) => idOf(user._id || user.id || user.userId || user.creatorId);

const LiveAvatar = ({ user, src = "", alt = "", className = "", wrapperClassName = "", loading = "lazy", forceLive = false, ...props }) => {
  const userId = userIdFor(user || {});
  const streamId = useLiveStreamStore((state) => (userId ? state.liveCreatorIds[userId] : ""));
  const ensureLivePresence = useLiveStreamStore((state) => state.ensureLivePresence);
  const isLive = forceLive || Boolean(streamId);

  useEffect(() => {
    if (userId && !isLive) {
      ensureLivePresence?.();
    }
  }, [ensureLivePresence, isLive, userId]);

  if (!isLive) {
    return <SafeAvatar user={user} src={src} alt={alt} className={className} loading={loading} {...props} />;
  }

  return (
    <span className={`relative inline-flex shrink-0 rounded-full bg-gradient-to-tr from-red-500 via-pink-500 to-fuchsia-500 p-[2px] shadow-[0_0_22px_rgba(244,63,94,0.38)] ${wrapperClassName}`.trim()}>
      <span className="absolute inset-[-4px] animate-pulse rounded-full border border-red-400/55" />
      <SafeAvatar
        user={user}
        src={src}
        alt={alt}
        className={`${className} relative ring-2 ring-white/80`}
        loading={loading}
        {...props}
      />
      <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-red-600 px-1.5 py-0.5 text-[0.55rem] font-black leading-none text-white shadow-lg">
        LIVE
      </span>
    </span>
  );
};

export default LiveAvatar;
