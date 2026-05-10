// @ts-nocheck
import { useEffect } from "react";
import { Link } from "react-router-dom";

const contactEmail = "gebmelody@gmail.com";

const pages = {
  "privacy-policy": {
    title: "Privacy Policy",
    description: "How VibeBook handles account, content, safety, analytics, and support information.",
    updated: "May 10, 2026",
    sections: [
      ["Information We Collect", "We collect the account details you provide, such as username, email or phone number, birthday, profile details, uploaded videos or images, comments, messages, group activity, device information, and safety reports."],
      ["How We Use Information", "We use information to operate VibeBook, personalize the short-video feed, support uploads, protect accounts, deliver notifications, improve creator tools, prevent abuse, and respond to support requests."],
      ["Media And Uploads", "Uploaded videos, photos, captions, and thumbnails may be processed by trusted media infrastructure so creators can publish and viewers can stream content reliably."],
      ["Your Choices", "You can update profile details, privacy preferences, notification settings, and account visibility from Settings & Privacy. You can also contact us for access, correction, or removal requests."],
      ["Contact", `Questions about privacy can be sent to ${contactEmail}.`],
    ],
  },
  terms: {
    title: "Terms of Service",
    description: "The basic rules for using VibeBook as a social-video platform.",
    updated: "May 10, 2026",
    sections: [
      ["Using VibeBook", "You are responsible for your account, your uploads, and your interactions. Do not use VibeBook to harm others, impersonate people, attack the platform, or violate applicable law."],
      ["Creator Content", "You keep ownership of your content. By posting, you give VibeBook permission to host, process, display, distribute, and promote that content within the platform experience."],
      ["Accounts And Safety", "We may limit, remove, or restrict accounts and content that violate these terms, community guidelines, safety rules, intellectual property rights, or platform integrity requirements."],
      ["Service Changes", "VibeBook may add, change, pause, or remove features to improve reliability, safety, monetization readiness, or user experience."],
      ["Contact", `Support and terms questions can be sent to ${contactEmail}.`],
    ],
  },
  "community-guidelines": {
    title: "Community Guidelines",
    description: "Standards for a safe Rwanda and global creator community.",
    updated: "May 10, 2026",
    sections: [
      ["Respect People", "Do not harass, threaten, exploit, or target people based on identity, background, nationality, religion, gender, disability, or personal status."],
      ["Post Original And Safe Content", "Share content you have rights to use. Avoid scams, graphic harm, sexual exploitation, dangerous instructions, spam, and misleading impersonation."],
      ["Protect Minors", "Content involving minors must be safe, age-appropriate, and respectful. Exploitation, grooming, or sexualized minor content is not allowed."],
      ["Groups And Messages", "Community chats should remain respectful. Group owners and members should report abuse and avoid unwanted spam or repeated invitations."],
      ["Reports", `Report concerns through the app or email ${contactEmail}.`],
    ],
  },
  about: {
    title: "About Us",
    description: "VibeBook is a short-video social platform for creators, fans, and communities.",
    updated: "May 10, 2026",
    sections: [
      ["Our Platform", "VibeBook helps people discover short videos, follow creators, upload media, chat, build groups, and grow a creative audience."],
      ["Rwanda And Global Positioning", "VibeBook is built with a Rwanda-aware and global mindset: accessible mobile creation, community conversation, creator discovery, and practical tools for growing digital audiences."],
      ["Creators First", "Creator Studio, profile tools, notifications, uploads, and future monetization features are designed to help creators understand and serve their audience."],
      ["Contact", `You can reach VibeBook at ${contactEmail}.`],
    ],
  },
  contact: {
    title: "Contact Us",
    description: "Reach VibeBook for support, safety, privacy, and business questions.",
    updated: "May 10, 2026",
    sections: [
      ["Email", `For support, safety reports, privacy questions, and platform inquiries, contact ${contactEmail}.`],
      ["What To Include", "Include your username, the issue type, links or screenshots when available, and a concise description so we can review faster."],
      ["Response Priority", "Safety, account access, privacy, and upload issues are prioritized before general product feedback."],
    ],
  },
  "creator-monetization-policy": {
    title: "Creator Monetization Policy",
    description: "High-level creator monetization standards for VibeBook.",
    updated: "May 10, 2026",
    sections: [
      ["Eligibility", "Creator monetization may require account good standing, original content, consistent activity, audience authenticity, and compliance with all platform policies."],
      ["Content Standards", "Monetized content must be advertiser-safe, rights-cleared, and aligned with community guidelines. Spam, stolen content, engagement manipulation, or unsafe content may be ineligible."],
      ["Review Status", "Monetization features may show as pending, review, or unavailable while the platform verifies eligibility and payment readiness."],
      ["Questions", `Creator monetization questions can be sent to ${contactEmail}.`],
    ],
  },
};

const LegalPage = ({ page = "privacy-policy" }) => {
  const content = pages[page] || pages["privacy-policy"];

  useEffect(() => {
    document.title = `${content.title} | VibeBook`;
    const description = document.querySelector('meta[name="description"]');
    if (description) {
      description.setAttribute("content", content.description);
    }
  }, [content.description, content.title]);

  return (
    <section className="container-page py-10">
      <div className="mx-auto max-w-4xl">
        <p className="text-sm font-black uppercase tracking-wide text-brand">VibeBook</p>
        <h1 className="mt-2 text-3xl font-black text-navy sm:text-5xl">{content.title}</h1>
        <p className="mt-4 max-w-2xl text-base font-semibold leading-7 text-slate-600">{content.description}</p>
        <p className="mt-3 text-sm font-bold text-slate-500">Last updated: {content.updated}</p>

        <div className="mt-8 space-y-4">
          {content.sections.map(([title, body]) => (
            <article key={title} className="rounded-lg border border-slate-200 bg-white p-5 shadow-soft">
              <h2 className="text-xl font-black text-navy">{title}</h2>
              <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">{body}</p>
            </article>
          ))}
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link className="btn-secondary" to="/privacy-policy">
            Privacy Policy
          </Link>
          <Link className="btn-secondary" to="/terms">
            Terms
          </Link>
          <Link className="btn-secondary" to="/community-guidelines">
            Guidelines
          </Link>
          <a className="btn-primary" href={`mailto:${contactEmail}`}>
            Contact Support
          </a>
        </div>
      </div>
    </section>
  );
};

export default LegalPage;
