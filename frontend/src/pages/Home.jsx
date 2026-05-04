// @ts-nocheck
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import bannerImage from "../assets/banner.jpg";
import { useLanguage } from "../context/LanguageContext.jsx";

const Home = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const { t } = useLanguage();
  const navigate = useNavigate();

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
        <div className="grid gap-4 md:grid-cols-3">
          {[
            [t("fastDiscovery"), t("fastDiscoveryCopy")],
            [t("clearProfiles"), t("clearProfilesCopy")],
            [t("bookingReady"), t("bookingReadyCopy")],
          ].map(([title, copy]) => (
            <div key={title} className="rounded-lg border border-slate-200 bg-white p-6 shadow-soft">
              <h2 className="text-lg font-bold text-navy">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{copy}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
};

export default Home;
