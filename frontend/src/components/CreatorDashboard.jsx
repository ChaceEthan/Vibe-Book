// @ts-nocheck
import { BarChart3, Bell, Clock, DollarSign, Eye, Heart, Loader, PlaySquare, TrendingUp, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { creatorApi, mediaUrl } from "../services/api";

const formatNumber = (value) => Number(value || 0).toLocaleString();
const formatMoney = (value) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "RWF",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

const statCardsFor = (stats = {}) => [
  { label: "Total views", value: formatNumber(stats.totalViews), icon: Eye },
  { label: "Watch time", value: `${formatNumber(Math.round(Number(stats.totalWatchTime || 0) / 60))} min`, icon: Clock },
  { label: "Followers", value: formatNumber(stats.followers), icon: Users },
  { label: "Following", value: formatNumber(stats.following), icon: Heart },
  { label: "Engagement", value: `${Number(stats.averageEngagementRate || 0).toFixed(1)}%`, icon: TrendingUp },
  { label: "Completion", value: `${Number(stats.averageCompletionRate || 0).toFixed(1)}%`, icon: PlaySquare },
  { label: "Replay rate", value: `${Number(stats.replayRate || stats.averageReplayRate || 0).toFixed(1)}%`, icon: BarChart3 },
  { label: "Estimated earnings", value: formatMoney(stats.estimatedEarnings), icon: DollarSign },
];

const MiniChart = ({ title, data = [], tone = "bg-brand" }) => {
  const max = Math.max(...data.map((item) => Number(item.value || 0)), 1);

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
      <h3 className="text-sm font-black text-navy">{title}</h3>
      <div className="mt-4 flex h-36 items-end gap-2">
        {data.map((item) => {
          const height = Math.max(8, (Number(item.value || 0) / max) * 100);
          return (
            <div key={item.date} className="flex min-w-0 flex-1 flex-col items-center gap-2">
              <div className="flex h-28 w-full items-end rounded-lg bg-slate-100 px-1">
                <span className={`block w-full rounded-md ${tone}`} style={{ height: `${height}%` }} />
              </div>
              <span className="w-full truncate text-center text-[10px] font-bold text-slate-400">
                {String(item.date || "").slice(5)}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
};

const VideoList = ({ title, videos = [], empty = "No videos yet." }) => (
  <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-soft">
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="text-lg font-black text-navy">{title}</h2>
      <span className="text-xs font-bold uppercase text-slate-400">{videos.length}</span>
    </div>
    {videos.length ? (
      <div className="space-y-3">
        {videos.slice(0, 6).map((video) => (
          <article key={video._id} className="flex min-w-0 items-center gap-3 rounded-lg bg-surface p-3">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-900">
              {video.mediaUrl ? (
                <video src={mediaUrl(video.mediaUrl)} className="h-full w-full object-cover" muted preload="metadata" />
              ) : (
                <PlaySquare className="h-5 w-5 text-white" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-black text-navy">{video.caption || "Untitled video"}</p>
              <p className="mt-1 truncate text-xs font-semibold text-slate-500">
                {formatNumber(video.views)} views - {formatNumber(video.likes)} likes - {formatNumber(video.comments)} comments
              </p>
            </div>
            <span className="rounded-lg bg-white px-2 py-1 text-xs font-bold text-slate-500">{video.visibility || "public"}</span>
          </article>
        ))}
      </div>
    ) : (
      <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm font-bold text-slate-500">{empty}</div>
    )}
  </section>
);

export function CreatorDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    const fetchDashboard = async () => {
      setLoading(true);
      setError("");

      try {
        const { data: dashboardData } = await creatorApi.dashboard();

        if (active) {
          setData(dashboardData);
        }
      } catch (requestError) {
        if (active) {
          setError(requestError.response?.data?.message || "Unable to load creator studio.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    fetchDashboard();
    return () => {
      active = false;
    };
  }, []);

  const stats = data?.stats || {};
  const monetization = data?.monetization || {};
  const cards = useMemo(() => statCardsFor(stats), [stats]);
  const charts = data?.charts || {};
  const recentNotifications = Array.isArray(data?.notifications) ? data.notifications : [];

  if (loading) {
    return (
      <section className="container-page flex min-h-[60vh] items-center justify-center py-10">
        <Loader className="h-8 w-8 animate-spin text-brand" />
      </section>
    );
  }

  if (error) {
    return (
      <section className="container-page py-10">
        <div className="rounded-lg border border-red-200 bg-red-50 p-5 text-sm font-bold text-red-700">{error}</div>
      </section>
    );
  }

  return (
    <section className="container-page py-6 sm:py-10">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase text-brand">Beta Creator Monetization</p>
          <h1 className="mt-1 text-3xl font-black text-navy">Creator Studio</h1>
        </div>
        <span className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-black uppercase text-slate-600">
          {stats.creatorTier || "none"} tier
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <article key={card.label} className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-black uppercase text-slate-500">{card.label}</p>
                <Icon className="h-5 w-5 text-brand" />
              </div>
              <p className="mt-3 truncate text-2xl font-black text-navy">{card.value}</p>
            </article>
          );
        })}
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <MiniChart title="Views over time" data={charts.viewsOverTime || []} tone="bg-brand" />
        <MiniChart title="Watch time over time" data={charts.watchTimeOverTime || []} tone="bg-sky-500" />
        <MiniChart title="Engagement trend" data={charts.engagementTrend || []} tone="bg-fuchsia-500" />
        <MiniChart title="Followers growth" data={charts.followersGrowth || []} tone="bg-amber-500" />
      </div>

      <section className="mt-5 rounded-lg border border-slate-200 bg-white p-5 shadow-soft">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase text-brand">Beta Creator Monetization</p>
            <h2 className="mt-1 text-xl font-black text-navy">Wallet and Eligibility</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[520px]">
            <div className="rounded-lg bg-surface p-3">
              <p className="text-xs font-bold uppercase text-slate-500">Wallet</p>
              <p className="mt-1 text-lg font-black text-navy">{formatMoney(monetization.walletBalance)}</p>
            </div>
            <div className="rounded-lg bg-surface p-3">
              <p className="text-xs font-bold uppercase text-slate-500">Estimated</p>
              <p className="mt-1 text-lg font-black text-navy">{formatMoney(monetization.estimatedEarnings)}</p>
            </div>
            <div className="rounded-lg bg-surface p-3">
              <p className="text-xs font-bold uppercase text-slate-500">Status</p>
              <p className="mt-1 text-lg font-black capitalize text-navy">{monetization.eligibilityStatus || "building"}</p>
            </div>
          </div>
        </div>
        <div className="mt-5 h-3 overflow-hidden rounded-full bg-slate-100">
          <span className="block h-full rounded-full bg-brand" style={{ width: `${Math.min(100, Number(monetization.progress || 0))}%` }} />
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-lg bg-surface p-4">
            <p className="text-sm font-black text-navy">Payout Request History</p>
            <p className="mt-2 text-sm text-slate-500">No payout requests yet.</p>
          </div>
          <div className="rounded-lg bg-surface p-4">
            <p className="text-sm font-black text-navy">Revenue Analytics</p>
            <p className="mt-2 text-sm text-slate-500">{formatMoney(monetization.revenueAnalytics?.viewsRevenue)} estimated video revenue</p>
          </div>
        </div>
      </section>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <VideoList title="Top performing videos" videos={data?.topVideos || []} />
        <VideoList title="Trending videos" videos={data?.trendingVideos || []} />
        <VideoList title="Recent uploads" videos={data?.recentUploads || data?.recentVideos || []} />
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-soft">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-lg font-black text-navy">Recent notifications</h2>
            <Bell className="h-5 w-5 text-brand" />
          </div>
          {recentNotifications.length ? (
            <div className="space-y-3">
              {recentNotifications.map((item) => (
                <article key={item._id} className="rounded-lg bg-surface p-3">
                  <p className="text-sm font-black text-navy">{item.title}</p>
                  <p className="mt-1 text-sm text-slate-500">{item.message}</p>
                </article>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm font-bold text-slate-500">
              No recent notifications.
            </div>
          )}
        </section>
      </div>
    </section>
  );
}

export default CreatorDashboard;
