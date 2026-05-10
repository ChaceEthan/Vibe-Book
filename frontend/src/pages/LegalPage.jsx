// @ts-nocheck
import { useEffect } from "react";
import { Link } from "react-router-dom";

const founder = "Isaacson";
const location = "Kigali, Rwanda";
const contactEmail = "gebmelody@gmail.com";
const contactPhone = "+250786161109";

const platformSummary =
  "VibeBook is a Rwanda-based short-video social platform for creators and communities around the world.";

const pages = {
  "privacy-policy": {
    title: "Privacy Policy",
    description: "How VibeBook collects, uses, protects, and explains account, media, safety, analytics, and support information.",
    path: "/privacy-policy",
    updated: "May 10, 2026",
    highlights: ["Rwanda-based platform", "Creator and community safety", "Transparent data controls"],
    sections: [
      {
        title: "Information We Collect",
        body:
          "We collect information you provide directly, including username, email or phone number, birthday, password credentials, profile details, uploaded photos or videos, captions, hashtags, comments, messages, group activity, settings choices, support requests, and safety reports.",
      },
      {
        title: "Media, Uploads, And Cloud Processing",
        body:
          "When you upload videos or images, VibeBook may process media through trusted infrastructure so the platform can store, optimize, stream, preview, and display content reliably. We keep creator media paths intact and use this data only to operate platform features.",
      },
      {
        title: "How We Use Data",
        body:
          "We use data to run accounts, authenticate users, deliver the feed, process uploads, show notifications, support comments and chats, improve creator tools, prevent spam or abuse, maintain security, respond to support requests, and understand product performance.",
      },
      {
        title: "Advertising And Analytics",
        body:
          "VibeBook may use privacy-respecting analytics and advertising tools to understand traffic, improve content quality, support creator monetization readiness, and keep the platform sustainable. We do not sell private messages or account passwords.",
      },
      {
        title: "Your Choices",
        body:
          "You can update profile details, privacy preferences, notification settings, content preferences, account visibility, and phone or email details from Settings & Privacy. You may contact us to request access, correction, deletion, or account assistance.",
      },
      {
        title: "Contact For Privacy Requests",
        body: `Privacy questions can be sent to ${contactEmail}. You may also contact VibeBook by phone at ${contactPhone}.`,
      },
    ],
  },
  terms: {
    title: "Terms of Service",
    description: "The rules for using VibeBook as a creator-friendly social-video platform.",
    path: "/terms-of-service",
    updated: "May 10, 2026",
    highlights: ["Use VibeBook lawfully", "Respect creator rights", "Keep communities safe"],
    sections: [
      {
        title: "Using VibeBook",
        body:
          "You are responsible for your account, your uploads, and your interactions. Do not use VibeBook to harm others, impersonate people, attack the platform, scrape private data, spread scams, or violate applicable law.",
      },
      {
        title: "Creator Rights",
        body:
          "You keep ownership of your original content. By posting, you give VibeBook permission to host, process, display, distribute, promote, and make your content available within platform experiences such as feeds, profiles, search, notifications, and creator tools.",
      },
      {
        title: "Copyright And Intellectual Property",
        body:
          "Only upload content you own or are allowed to use. Copyright owners can report suspected infringement with the content link, ownership details, contact information, and a clear explanation of the concern.",
      },
      {
        title: "Moderation And Enforcement",
        body:
          "VibeBook may limit, remove, hide, demonetize, or restrict content and accounts that violate these terms, community guidelines, safety rules, intellectual property rights, or platform integrity requirements.",
      },
      {
        title: "Platform Changes",
        body:
          "We may add, change, pause, or remove features to improve reliability, security, safety, monetization readiness, creator tools, and user experience.",
      },
      {
        title: "Support",
        body: `Questions about these terms can be sent to ${contactEmail} or ${contactPhone}.`,
      },
    ],
  },
  "community-guidelines": {
    title: "Community Guidelines",
    description: "Safety and content standards for a Rwanda-based global creator community.",
    path: "/community-guidelines",
    updated: "May 10, 2026",
    highlights: ["Respect people", "Post original content", "Report harmful behavior"],
    sections: [
      {
        title: "Respect People",
        body:
          "Do not harass, threaten, exploit, shame, or target people based on identity, nationality, ethnicity, religion, gender, disability, personal status, or protected characteristics.",
      },
      {
        title: "Post Original And Safe Content",
        body:
          "Share content you own or have rights to use. Avoid scams, spam, dangerous instructions, graphic harm, sexual exploitation, misleading impersonation, and content designed to manipulate engagement.",
      },
      {
        title: "Protect Minors",
        body:
          "Content involving minors must be safe, age-appropriate, and respectful. Exploitation, grooming, sexualized minor content, or attempts to contact minors in unsafe ways are not allowed.",
      },
      {
        title: "Groups, Messages, And Comments",
        body:
          "Community chats and comments should remain respectful. Group owners and members should avoid unwanted spam, repeated invitations, abuse, threats, and sharing private information without permission.",
      },
      {
        title: "Moderation",
        body:
          "We may use reports, automated signals, human review, and platform rules to reduce harmful content. Enforcement may include content removal, limited distribution, warnings, account restrictions, or suspension.",
      },
      {
        title: "Reports",
        body: `Report safety, copyright, or community concerns through the app or by emailing ${contactEmail}.`,
      },
    ],
  },
  about: {
    title: "About Us",
    description: platformSummary,
    path: "/about",
    updated: "May 10, 2026",
    highlights: [`Founder: ${founder}`, location, "Built for creators and communities"],
    sections: [
      {
        title: "Our Platform",
        body:
          "VibeBook helps people discover short videos, follow creators, upload media, chat, build groups, and grow creative audiences with mobile-first tools.",
      },
      {
        title: "Rwanda And Global Vision",
        body:
          "VibeBook is built from Kigali with a global mindset: accessible mobile creation, community conversation, creator discovery, and practical tools for growing digital audiences.",
      },
      {
        title: "Creators First",
        body:
          "Creator Studio, profile tools, upload workflows, notifications, comments, and future monetization features are designed to help creators understand, serve, and grow their audience.",
      },
      {
        title: "Founder",
        body: `VibeBook was founded by ${founder}. The platform is operated with support centered in ${location}.`,
      },
      {
        title: "Contact",
        body: `You can reach VibeBook at ${contactEmail} or ${contactPhone}.`,
      },
    ],
  },
  contact: {
    title: "Contact Us",
    description: "Reach VibeBook for support, safety, privacy, copyright, creator, and business questions.",
    path: "/contact",
    updated: "May 10, 2026",
    highlights: [contactEmail, contactPhone, location],
    sections: [
      {
        title: "Support Channels",
        body: `Email ${contactEmail} or call ${contactPhone}. VibeBook support is based in ${location}.`,
      },
      {
        title: "What To Include",
        body:
          "Include your username, the issue type, content links or screenshots when available, your device or browser if relevant, and a concise description so we can review faster.",
      },
      {
        title: "Safety And Copyright Reports",
        body:
          "For safety or copyright concerns, include the affected profile, post, comment, group, or message link, a clear explanation, and your preferred contact method.",
      },
      {
        title: "Response Priority",
        body:
          "Safety, account access, privacy, copyright, payment, and upload issues are prioritized before general product feedback.",
      },
    ],
  },
  "creator-monetization-policy": {
    title: "Creator Monetization Policy",
    description: "High-level monetization standards and disclaimers for VibeBook creators.",
    path: "/creator-monetization-policy",
    updated: "May 10, 2026",
    highlights: ["Monetization is not guaranteed", "Original content matters", "Safety affects eligibility"],
    sections: [
      {
        title: "Eligibility",
        body:
          "Creator monetization may require account good standing, original content, consistent activity, authentic audience growth, accurate account information, and compliance with VibeBook policies.",
      },
      {
        title: "Content Standards",
        body:
          "Monetized content must be advertiser-friendly, rights-cleared, and aligned with community guidelines. Spam, stolen content, engagement manipulation, unsafe content, or policy violations may reduce or remove eligibility.",
      },
      {
        title: "No Earnings Guarantee",
        body:
          "Monetization features, rates, eligibility, review timelines, and availability may change. VibeBook does not guarantee earnings, payouts, verification, promotion, or advertiser demand.",
      },
      {
        title: "Review And Enforcement",
        body:
          "Accounts may show pending, review, active, or unavailable monetization states while VibeBook verifies eligibility, platform readiness, payment compliance, and content quality.",
      },
      {
        title: "Creator Support",
        body: `Creator monetization questions can be sent to ${contactEmail}.`,
      },
    ],
  },
  "cookie-policy": {
    title: "Cookie Policy",
    description: "How VibeBook may use cookies, local storage, and similar technologies for account security, preferences, analytics, and platform reliability.",
    path: "/cookie-policy",
    updated: "May 10, 2026",
    highlights: ["Preference storage", "Security and analytics", "User controls"],
    sections: [
      {
        title: "How We Use Cookies",
        body:
          "VibeBook may use cookies, local storage, session storage, and similar browser technologies to keep users signed in, remember settings, protect accounts, reduce spam, understand site performance, and support reliable creator and community features.",
      },
      {
        title: "Essential Technologies",
        body:
          "Some storage is necessary for authentication, security, language choices, playback preferences, notification settings, and basic platform operations. Disabling essential storage may cause login, upload, feed, or settings features to work incorrectly.",
      },
      {
        title: "Analytics And Advertising Readiness",
        body:
          "VibeBook may use limited analytics or advertising-related technologies to understand traffic, improve content quality, support creator monetization readiness, and maintain a safe platform. We aim to keep these uses transparent and privacy-conscious.",
      },
      {
        title: "Your Choices",
        body:
          "You can adjust browser cookie settings and VibeBook settings such as notifications, content preferences, playback, language, and privacy. Clearing browser storage may reset local preferences on that device.",
      },
      {
        title: "Contact",
        body: `Cookie and privacy questions can be sent to ${contactEmail}.`,
      },
    ],
  },
  "copyright-policy": {
    title: "Copyright Policy",
    description: "How creators and rights holders can report copyright concerns and how VibeBook reviews intellectual property issues.",
    path: "/copyright-policy",
    updated: "May 10, 2026",
    highlights: ["Respect creator rights", "Report suspected infringement", "Review and response"],
    sections: [
      {
        title: "Creator Ownership",
        body:
          "Creators should upload only videos, images, music, captions, thumbnails, and other materials they own or have permission to use. VibeBook respects creator rights and expects users to respect intellectual property rights.",
      },
      {
        title: "Submitting A Copyright Report",
        body:
          "A copyright report should include the content URL or identifying details, a description of the copyrighted work, ownership or authorization information, your contact information, and a good-faith explanation of why the content may be infringing.",
      },
      {
        title: "Review Process",
        body:
          "VibeBook may review reports, request more information, remove or restrict content, limit repeat offenders, restore content when appropriate, or take other reasonable action under platform rules and applicable law.",
      },
      {
        title: "Counter Requests",
        body:
          "If you believe your content was removed or restricted by mistake, contact support with the affected content details, your account information, and a clear explanation of your rights to use the material.",
      },
      {
        title: "Contact For Copyright",
        body: `Copyright reports can be sent to ${contactEmail}. Include enough detail for VibeBook to identify and review the content.`,
      },
    ],
  },
};

const LegalPage = ({ page = "privacy-policy" }) => {
  const content = pages[page] || pages["privacy-policy"];
  const canonicalOrigin = typeof window !== "undefined" ? window.location.origin : "https://vibebook.com";
  const canonicalHref = `${canonicalOrigin}${content.path}`;

  useEffect(() => {
    document.title = `${content.title} | VibeBook`;
    let description = document.querySelector('meta[name="description"]');
    if (!description) {
      description = document.createElement("meta");
      description.setAttribute("name", "description");
      document.head.appendChild(description);
    }
    description.setAttribute("content", content.description);

    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.setAttribute("rel", "canonical");
      document.head.appendChild(canonical);
    }
    canonical.setAttribute("href", canonicalHref);
  }, [canonicalHref, content.description, content.title]);

  return (
    <section className="container-page py-8 sm:py-12">
      <div className="mx-auto max-w-5xl">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-soft sm:p-8">
          <p className="text-sm font-black uppercase tracking-wide text-brand">VibeBook Trust Center</p>
          <h1 className="mt-2 text-3xl font-black text-navy sm:text-5xl">{content.title}</h1>
          <p className="mt-4 max-w-3xl text-base font-semibold leading-7 text-slate-600">{content.description}</p>
          <p className="mt-3 text-sm font-bold text-slate-500">Last updated: {content.updated}</p>

          <div className="mt-6 grid gap-2 sm:grid-cols-3">
            {content.highlights.map((item) => (
              <div key={item} className="rounded-lg bg-surface px-4 py-3 text-sm font-black text-navy">
                {item}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-5 grid gap-4">
          {content.sections.map((section) => (
            <article key={section.title} className="rounded-lg border border-slate-200 bg-white p-5 shadow-soft sm:p-6">
              <h2 className="text-xl font-black text-navy">{section.title}</h2>
              <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">{section.body}</p>
            </article>
          ))}
        </div>

        <div className="mt-6 rounded-lg border border-slate-200 bg-white p-5 shadow-soft">
          <h2 className="text-lg font-black text-navy">Need Help?</h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
            VibeBook support is available for account access, privacy, safety, copyright, upload, creator, and community questions.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <a className="btn-primary" href={`mailto:${contactEmail}`}>
              Email Support
            </a>
            <a className="btn-secondary" href={`tel:${contactPhone.replace(/\s+/g, "")}`}>
              Call Support
            </a>
            <Link className="btn-secondary" to="/community-guidelines">
              Community Guidelines
            </Link>
          </div>
        </div>

        <nav className="mt-6 flex flex-wrap gap-3" aria-label="Legal pages">
          <Link className="btn-secondary" to="/privacy-policy">
            Privacy Policy
          </Link>
          <Link className="btn-secondary" to="/terms-of-service">
            Terms of Service
          </Link>
          <Link className="btn-secondary" to="/community-guidelines">
            Community Guidelines
          </Link>
          <Link className="btn-secondary" to="/cookie-policy">
            Cookie Policy
          </Link>
          <Link className="btn-secondary" to="/copyright-policy">
            Copyright Policy
          </Link>
          <Link className="btn-secondary" to="/creator-monetization-policy">
            Creator Monetization
          </Link>
          <Link className="btn-secondary" to="/about">
            About
          </Link>
          <Link className="btn-secondary" to="/contact">
            Contact
          </Link>
        </nav>
      </div>
    </section>
  );
};

export default LegalPage;
