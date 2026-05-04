// @ts-nocheck
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import ProfileCard from "../components/ProfileCard.jsx";
import bannerImage from "../assets/banner.jpg";
import { useLanguage } from "../context/LanguageContext.jsx";
import { userApi } from "../services/api";

const Home = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [profiles, setProfiles] = useState([]);
  const [loadingProfiles, setLoadingProfiles] = useState(true);
  const [profileError, setProfileError] = useState("");
  const { t } = useLanguage();
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;

    const loadProfiles = async () => {
      setLoadingProfiles(true);
      setProfileError("");

      try {
        const { data } = await userApi.search({});
        const users = Array.isArray(data?.users) ? data.users : [];

        if (active) {
          setProfiles(users.slice(0, 6));
        }
      } catch (error) {
        if (active) {
          setProfileError(error.response?.data?.message || "Unable to load latest profiles.");
          setProfiles([]);
        }
      } finally {
        if (active) {
          setLoadingProfiles(false);
        }
      }
    };

    loadProfiles();

    return () => {
      active = false;
    };
  }, []);

  const handleSearch = (event) => {
    event.preventDefault();
    const query = searchTerm.trim();
    navigate(query ? `/search?category=${encodeURIComponent(query)}` : "/search");
  };

  return (
    <>
      <section className="relative min-h-[78vh] overflow-hidden bg-navy">
        <img src={bannerImage} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-br from-navy via-navy/80 to-slate-950/50" />

        <div className="container-page relative flex min-h-[78vh] items-center py-16">
          <div className="max-w-3xl text-white">
            <p className="mb-4 inline-flex rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold backdrop-blur">
              {t("entertainmentMarketplace")}
            </p>
            <h1 className="text-4xl font-black leading-tight sm:text-5xl lg:text-6xl">
              {t("findTalent")}
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-8 text-slate-200 sm:text-lg">
              {t("homeCopy")}
            </p>

            <form onSubmit={handleSearch} className="mt-8 flex flex-col gap-3 rounded-lg bg-white p-2 shadow-soft sm:flex-row">
              <input
                className="min-h-12 flex-1 rounded-lg border border-transparent px-4 text-sm text-slate-900 outline-none focus:border-brand"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search modern dance, traditional crew, DJ, MC"
              />
              <button type="submit" className="btn-primary min-h-12">
                {t("searchTalent")}
              </button>
            </form>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Link to="/search" className="btn-primary">
                {t("exploreProfiles")}
              </Link>
              <Link to="/register" className="btn-secondary border-white/20 bg-white/10 text-white hover:bg-white hover:text-navy">
                {t("joinAsTalent")}
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="container-page py-14">
        <div className="mb-8 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase text-brand">Featured users</p>
            <h2 className="mt-2 text-3xl font-black text-navy">Latest VibeBook profiles</h2>
          </div>
          <Link to="/search" className="btn-secondary">
            View all
          </Link>
        </div>

        {profileError && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{profileError}</div>}

        {loadingProfiles ? (
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((item) => (
              <div key={item} className="h-80 animate-pulse rounded-lg bg-slate-200" />
            ))}
          </div>
        ) : profiles.length ? (
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {profiles.map((profile) => (
              <ProfileCard key={profile._id} user={profile} />
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-slate-200 bg-white p-8 text-center shadow-soft">
            <h2 className="text-lg font-bold text-navy">No profiles yet</h2>
            <p className="mt-2 text-sm text-slate-600">Create a profile to appear on the homepage.</p>
          </div>
        )}
      </section>
    </>
  );
};

export default Home;
