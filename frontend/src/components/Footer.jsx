import { Link } from "react-router-dom";

const Footer = () => {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="container-page flex flex-col gap-4 pb-28 pt-8 text-sm text-slate-500 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="font-semibold text-slate-600">VibeBook is a short-video social space for creators and fans.</p>
          <p>Watch, post, follow, and grow your audience.</p>
        </div>
        <nav className="flex flex-wrap gap-x-4 gap-y-2 font-bold text-slate-600" aria-label="Footer">
          <Link to="/about" className="hover:text-navy">About</Link>
          <Link to="/privacy-policy" className="hover:text-navy">Privacy</Link>
          <Link to="/terms" className="hover:text-navy">Terms</Link>
          <Link to="/community-guidelines" className="hover:text-navy">Guidelines</Link>
          <Link to="/creator-monetization-policy" className="hover:text-navy">Monetization</Link>
          <Link to="/contact" className="hover:text-navy">Contact</Link>
        </nav>
      </div>
    </footer>
  );
};

export default Footer;
