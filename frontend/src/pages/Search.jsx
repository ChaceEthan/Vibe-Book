// @ts-nocheck
import {
  BadgeCheck,
  Clock3,
  Flame,
  Hash,
  Heart,
  Music2,
  Play,
  Search as SearchIcon,
  Sparkles,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import PostMedia from "../components/PostMedia.jsx";
import SafeAvatar from "../components/SafeAvatar.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { feedApi, mediaUrl, userApi } from "../services/api";

const RECENT_KEY = "vibebook:recent-searches";
const tabs = ["Top", "Users", "Videos", "Hashtags", "Sounds"];
const popularSearches = ["dance", "music", "acting", "comedy", "fashion", "kigali"];

const formatCount = (value = 0) => {
  const number = Number(value || 0);
  if (number >= 1000000) return `${(number / 1000000).toFixed(number >= 10000000 ? 0 : 1)}M`;
  if (number >= 1000) return `${(number / 1000).toFixed(number >= 10000 ? 0 : 1)}K`;
  return number.toLocaleString();
};

const normalize = (value = "") => String(value || "").trim().toLowerCase();

const readRecentSearches = () => {
  try {
    const value = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    return Array.isArray(value) ? value.filter(Boolean).slice(0, 8) : [];
  } catch {
    return [];
  }
};

const saveRecentSearch = (value = "") => {
  const term = value.trim();
  if (!term) return [];

  const next = [term, ...readRecentSearches().filter((item) => normalize(item) !== normalize(term))].slice(0, 8);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Recent searches are a local enhancement.
  }
  return next;
};

const userMatches = (user, query) => {
  const needle = normalize(query);
  if (!needle) return true;

  return [
    user.name,
    user.username,
    user.bio,
    user.category,
    user.role,
    user.location,
    user.province,
    user.district,
    ...(Array.isArray(user.skills) ? user.skills : []),
  ].some((value) => normalize(value).includes(needle));
};

const postMatches = (post, query) => {
  const needle = normalize(query);
  if (!needle) return true;

  const creator = post.userId || {};
  return [
    post.caption,
    post.category,
    creator.name,
    creator.username,
    creator.category,
    ...(Array.isArray(post.tags) ? post.tags : []),
  ].some((value) => normalize(value).includes(needle));
};

const buildHashtags = (posts = [], users = []) => {
  const byTag = new Map();
  const addTag = (tag, count = 1) => {
    const clean = normalize(tag).replace(/^#/, "");
    if (!clean) return;
    const current = byTag.get(clean) || { tag: clean, posts: 0 };
    byTag.set(clean, { ...current, posts: current.posts + count });
  };

  posts.forEach((post) => (post.tags || []).forEach((tag) => addTag(tag, Math.max(1, Number(post.views || 0) ? 2 : 1))));
  users.forEach((user) => (user.skills || []).forEach((skill) => addTag(skill)));

  return Array.from(byTag.values()).sort((left, right) => right.posts - left.posts).slice(0, 18);
};

const SearchSkeleton = () => (
  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
    {[0, 1, 2, 3, 4, 5].map((item) => (
      <div key={item} className="h-48 animate-pulse rounded-lg bg-white shadow-soft" />
    ))}
  </div>
);

const EmptyState = ({ query }) => (
  <div className="flex min-h-72 flex-col items-center justify-center rounded-lg border border-slate-200 bg-white p-8 text-center shadow-soft">
    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-slate-400">
      <SearchIcon className="h-8 w-8" />
    </div>
    <h2 className="mt-5 text-xl font-black text-navy">No results found</h2>
    <p className="mt-2 max-w-sm text-sm font-semibold leading-6 text-slate-500">
      {query ? `Nothing matched "${query}".` : "Fresh results will show up here as creators post."}
    </p>
  </div>
);

const UserResultCard = ({ currentUser, onFollow, user }) => {
  const verified = Boolean(user.isVerified || user.verified);
  const isSelf = currentUser?._id === user._id;
  const image = user.profilePicture || user.profileImage || user.images?.[0] || user.gallery?.[0] || "";

  return (
    <article className="flex min-w-0 gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-soft transition hover:-translate-y-0.5 hover:shadow-lg">
      <Link to={`/profile/${user._id}`} className="shrink-0">
        <SafeAvatar user={user} src={image ? mediaUrl(image) : ""} className="h-16 w-16 rounded-full object-cover ring-2 ring-white" />
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <Link to={`/profile/${user._id}`} className="truncate text-sm font-black text-navy">
            {user.name || "VibeBook creator"}
          </Link>
          {verified && <BadgeCheck className="h-4 w-4 shrink-0 fill-sky-500 text-white" />}
        </div>
        <p className="truncate text-xs font-bold text-slate-500">@{user.username || user.name || "creator"}</p>
        <p className="mt-1 line-clamp-2 text-sm leading-5 text-slate-600">{user.bio || user.category || "Creator on VibeBook"}</p>
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="inline-flex min-w-0 items-center gap-1 text-xs font-black text-slate-500">
            <Users className="h-3.5 w-3.5" />
            {formatCount(user.followerCount || user.followers?.length || 0)}
          </span>
          {!isSelf && (
            <button
              type="button"
              className={`inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-3 text-xs font-black transition active:scale-95 ${
                user.isFollowing ? "bg-slate-100 text-slate-600" : "bg-brand text-navy shadow-sm"
              }`}
              onClick={() => onFollow(user)}
            >
              <UserPlus className="h-3.5 w-3.5" />
              {user.isFollowing ? "Following" : "Follow"}
            </button>
          )}
        </div>
      </div>
    </article>
  );
};

const VideoCard = ({ post }) => {
  const creator = post.userId || {};
  const profileImage = creator.profilePicture || creator.profileImage || creator.images?.[0] || "";
  const duration = Number(post.duration || 0);
  const minutes = Math.floor(duration / 60);
  const seconds = Math.floor(duration % 60).toString().padStart(2, "0");

  return (
    <Link to={`/profile/${creator._id || ""}`} className="group block overflow-hidden rounded-lg bg-slate-950 shadow-soft transition hover:-translate-y-1 hover:shadow-xl">
      <div className="relative aspect-[9/14] overflow-hidden">
        <PostMedia post={post} className="h-full w-full" imageClassName="h-full w-full object-cover" videoClassName="h-full w-full object-cover" controls={false} muted minimal />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-slate-950/10" />
        <div className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-slate-950/55 px-2 py-1 text-[11px] font-black text-white backdrop-blur">
          <Play className="h-3 w-3 fill-white" />
          {formatCount(post.views || 0)}
        </div>
        {duration > 0 && <span className="absolute right-2 top-2 rounded-full bg-slate-950/55 px-2 py-1 text-[11px] font-black text-white backdrop-blur">{minutes}:{seconds}</span>}
        <div className="absolute inset-x-0 bottom-0 p-3 text-white">
          <p className="line-clamp-2 text-xs font-bold leading-4">{post.caption || "VibeBook video"}</p>
          <div className="mt-2 flex min-w-0 items-center gap-2">
            <SafeAvatar user={creator} src={profileImage ? mediaUrl(profileImage) : ""} className="h-7 w-7 rounded-full object-cover ring-1 ring-white/70" />
            <span className="min-w-0 truncate text-xs font-black">@{creator.username || creator.name || "creator"}</span>
          </div>
        </div>
      </div>
    </Link>
  );
};

const HashtagCard = ({ item, onSelect }) => (
  <button type="button" className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-4 text-left shadow-soft transition hover:-translate-y-0.5 hover:shadow-lg" onClick={() => onSelect(`#${item.tag}`)}>
    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-slate-950 text-brand">
      <Hash className="h-6 w-6" />
    </span>
    <span className="min-w-0 flex-1">
      <span className="block truncate text-base font-black text-navy">#{item.tag}</span>
      <span className="mt-1 flex items-center gap-1 text-xs font-bold text-slate-500">
        <Flame className="h-3.5 w-3.5 text-red-500" />
        {formatCount(item.posts)} posts
      </span>
    </span>
  </button>
);

const Search = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { isAuthenticated, user: currentUser } = useAuth();
  const initialQuery = searchParams.get("q") || searchParams.get("skill") || searchParams.get("location") || "";
  const [query, setQuery] = useState(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);
  const [activeTab, setActiveTab] = useState("Top");
  const [users, setUsers] = useState([]);
  const [posts, setPosts] = useState([]);
  const [baselineUsers, setBaselineUsers] = useState([]);
  const [baselinePosts, setBaselinePosts] = useState([]);
  const [recentSearches, setRecentSearches] = useState(readRecentSearches);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const requestRef = useRef(0);
  const baselineUsersRef = useRef([]);
  const baselinePostsRef = useRef([]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 260);
    return () => window.clearTimeout(timer);
  }, [query]);

  const runSearch = useCallback(async (term = "") => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setLoading(true);
    setError("");

    try {
      const clean = term.trim().replace(/^#/, "");
      const [userResponse, feedResponse] = await Promise.all([
        userApi.search(clean ? { skill: clean } : {}),
        feedApi.get({ page: 1, limit: 24 }),
      ]);

      if (requestId !== requestRef.current) return;

      const nextUsers = Array.isArray(userResponse.data?.users) ? userResponse.data.users : [];
      const rawPosts = Array.isArray(feedResponse.data?.posts) ? feedResponse.data.posts : Array.isArray(feedResponse.data?.feed) ? feedResponse.data.feed : [];
      const nextPosts = rawPosts.filter((post) => post?.url || post?.mediaUrl);

      if (!term) {
        baselineUsersRef.current = nextUsers;
        baselinePostsRef.current = nextPosts;
        setBaselineUsers(nextUsers);
        setBaselinePosts(nextPosts);
      }

      const mergedUsers = term
        ? [...nextUsers, ...baselineUsersRef.current.filter((item) => !nextUsers.some((user) => user._id === item._id))]
        : nextUsers;
      const sourcePosts = term ? [...nextPosts, ...baselinePostsRef.current.filter((item) => !nextPosts.some((post) => post._id === item._id))] : nextPosts;

      setUsers(mergedUsers.filter((item) => userMatches(item, term)));
      setPosts(sourcePosts.filter((item) => postMatches(item, term)));
    } catch (requestError) {
      if (requestId === requestRef.current) {
        setError(requestError.response?.data?.message || "Search is temporarily unavailable.");
        setUsers([]);
        setPosts([]);
      }
    } finally {
      if (requestId === requestRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    runSearch(debouncedQuery);
  }, [debouncedQuery, runSearch]);

  useEffect(() => {
    if (debouncedQuery.length > 1) {
      setRecentSearches(saveRecentSearch(debouncedQuery));
    }
  }, [debouncedQuery]);

  const hashtags = useMemo(() => {
    const items = buildHashtags(posts.length ? posts : baselinePosts, users.length ? users : baselineUsers);
    return debouncedQuery ? items.filter((item) => item.tag.includes(normalize(debouncedQuery).replace(/^#/, ""))) : items;
  }, [baselinePosts, baselineUsers, debouncedQuery, posts, users]);

  const hasAnyResults = users.length || posts.length || hashtags.length;

  const handleFollow = async (targetUser) => {
    if (!isAuthenticated) {
      navigate("/login");
      return;
    }

    const wasFollowing = Boolean(targetUser.isFollowing);
    const updateUser = (item) =>
      item._id === targetUser._id
        ? {
            ...item,
            isFollowing: !wasFollowing,
            followerCount: Math.max(0, Number(item.followerCount || item.followers?.length || 0) + (wasFollowing ? -1 : 1)),
          }
        : item;

    setUsers((current) => current.map(updateUser));
    setBaselineUsers((current) => current.map(updateUser));

    try {
      const { data } = wasFollowing ? await userApi.unfollow(targetUser._id) : await userApi.follow(targetUser._id);
      if (data?.user) {
        setUsers((current) => current.map((item) => (item._id === targetUser._id ? { ...item, ...data.user } : item)));
        setBaselineUsers((current) => current.map((item) => (item._id === targetUser._id ? { ...item, ...data.user } : item)));
      }
    } catch {
      setUsers((current) => current.map((item) => (item._id === targetUser._id ? targetUser : item)));
      setBaselineUsers((current) => current.map((item) => (item._id === targetUser._id ? targetUser : item)));
    }
  };

  const chooseSearch = (value) => {
    const next = value.replace(/^#/, "");
    setQuery(next);
    setActiveTab(value.startsWith("#") ? "Hashtags" : "Top");
  };

  const renderUsers = (limit) => (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {users.slice(0, limit).map((item) => <UserResultCard key={item._id} currentUser={currentUser} user={item} onFollow={handleFollow} />)}
    </div>
  );

  const renderVideos = (limit) => (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {posts.slice(0, limit).map((post, index) => <VideoCard key={post._id || `${post.url}-${index}`} post={post} />)}
    </div>
  );

  const renderHashtags = (limit) => (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {hashtags.slice(0, limit).map((item) => <HashtagCard key={item.tag} item={item} onSelect={chooseSearch} />)}
    </div>
  );

  return (
    <section className="min-h-[calc(100dvh-7rem)] bg-slate-50 pb-24">
      <div className="sticky top-14 z-30 border-b border-slate-200 bg-white/95 backdrop-blur sm:top-16">
        <div className="container-page py-3">
          <label className="group relative block">
            <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400 transition group-focus-within:text-navy" />
            <input
              className="h-12 w-full rounded-full border border-slate-200 bg-slate-100 pl-12 pr-12 text-base font-bold text-navy outline-none transition placeholder:text-slate-400 focus:border-brand focus:bg-white focus:ring-4 focus:ring-brand/20"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search creators, videos, hashtags"
            />
            {query && (
              <button type="button" className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white text-slate-500 shadow-sm" onClick={() => setQuery("")} aria-label="Clear search">
                <X className="h-4 w-4" />
              </button>
            )}
          </label>

          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {tabs.map((tab) => (
              <button
                key={tab}
                type="button"
                className={`relative shrink-0 rounded-full px-4 py-2 text-sm font-black transition ${
                  activeTab === tab ? "bg-slate-950 text-white shadow-md" : "bg-slate-100 text-slate-600 hover:bg-white hover:text-navy"
                }`}
                onClick={() => setActiveTab(tab)}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="container-page py-5">
        {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">{error}</div>}

        {!debouncedQuery ? (
          <div className="space-y-7">
            <section>
              <div className="mb-3 flex items-center justify-between gap-3">
                <h1 className="text-xl font-black text-navy">Trending now</h1>
                <Sparkles className="h-5 w-5 text-brand" />
              </div>
              {loading ? <SearchSkeleton /> : renderHashtags(6)}
            </section>

            {recentSearches.length > 0 && (
              <section>
                <h2 className="mb-3 text-sm font-black uppercase tracking-wide text-slate-500">Recent searches</h2>
                <div className="flex flex-wrap gap-2">
                  {recentSearches.map((item) => (
                    <button key={item} type="button" className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-2 text-sm font-bold text-slate-600 shadow-sm transition hover:text-navy" onClick={() => chooseSearch(item)}>
                      <Clock3 className="h-4 w-4 text-slate-400" />
                      {item}
                    </button>
                  ))}
                </div>
              </section>
            )}

            <section>
              <h2 className="mb-3 text-sm font-black uppercase tracking-wide text-slate-500">Suggested creators</h2>
              {loading ? <SearchSkeleton /> : renderUsers(6)}
            </section>

            <section>
              <h2 className="mb-3 text-sm font-black uppercase tracking-wide text-slate-500">Popular searches</h2>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {popularSearches.map((item) => (
                  <button key={item} type="button" className="flex items-center justify-between rounded-lg bg-white px-4 py-3 text-left text-sm font-black text-navy shadow-soft transition hover:-translate-y-0.5 hover:shadow-lg" onClick={() => chooseSearch(item)}>
                    <span>#{item}</span>
                    <Flame className="h-4 w-4 text-red-500" />
                  </button>
                ))}
              </div>
            </section>
          </div>
        ) : loading ? (
          <SearchSkeleton />
        ) : !hasAnyResults ? (
          <EmptyState query={debouncedQuery} />
        ) : (
          <div className="space-y-7">
            {(activeTab === "Top" || activeTab === "Users") && users.length > 0 && (
              <section>
                <h2 className="mb-3 text-sm font-black uppercase tracking-wide text-slate-500">Users</h2>
                {renderUsers(activeTab === "Users" ? users.length : 6)}
              </section>
            )}

            {(activeTab === "Top" || activeTab === "Videos") && posts.length > 0 && (
              <section>
                <h2 className="mb-3 text-sm font-black uppercase tracking-wide text-slate-500">Videos</h2>
                {renderVideos(activeTab === "Videos" ? posts.length : 10)}
              </section>
            )}

            {(activeTab === "Top" || activeTab === "Hashtags") && hashtags.length > 0 && (
              <section>
                <h2 className="mb-3 text-sm font-black uppercase tracking-wide text-slate-500">Hashtags</h2>
                {renderHashtags(activeTab === "Hashtags" ? hashtags.length : 9)}
              </section>
            )}

            {activeTab === "Sounds" && (
              <section className="grid gap-3 md:grid-cols-2">
                {[debouncedQuery, ...popularSearches.slice(0, 3)].filter(Boolean).map((item) => (
                  <button key={item} type="button" className="flex items-center gap-3 rounded-lg bg-white p-4 text-left shadow-soft transition hover:-translate-y-0.5 hover:shadow-lg" onClick={() => chooseSearch(item)}>
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand text-navy"><Music2 className="h-6 w-6" /></span>
                    <span className="min-w-0">
                      <span className="block truncate font-black text-navy">{item}</span>
                      <span className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-slate-500"><Heart className="h-3.5 w-3.5 text-red-500" /> Trending sound</span>
                    </span>
                  </button>
                ))}
              </section>
            )}
          </div>
        )}
      </div>
    </section>
  );
};

export default Search;
