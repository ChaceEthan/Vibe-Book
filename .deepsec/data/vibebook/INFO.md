# VibeBook

## What This Codebase Does

VibeBook is a TikTok-like full-stack media and booking app for entertainment professionals. The backend is Node.js/Express with MongoDB/Mongoose, JWT auth, multer uploads, profile privacy, bookings, chat, ratings, payments, and a central posts/feed collection. The frontend is a Vite React app using React Router, Axios, Zustand post state, and Tailwind CSS.

## Auth Shape

- `authMiddleware` verifies `Authorization: Bearer <token>` and loads `req.user`.
- `optionalAuthMiddleware` allows public feed/search/profile reads while attaching a viewer when a token is valid.
- Protected routes include profile update, upload, follow/unfollow, messages, bookings, payments, feed likes/comments, and admin routes.
- Login/register return `{ token, user }`; the frontend stores the token in `localStorage` and Axios attaches it to requests.

## Threat Model

Attackers would most likely try to access locked profile/contact data, upload unsafe media paths, impersonate another user in bookings/chat, or abuse public feed/search endpoints. Highest-impact issues are auth bypasses, unsafe file handling, IDOR across user-owned data, payment/access unlock bypasses, and leaked secrets in logs or responses.

## Project-Specific Patterns To Flag

- Any upload route must use multer storage under `/uploads/images` or `/uploads/videos`; never trust client-supplied file paths.
- Media deletion must stay scoped to the authenticated owner and must not remove another user's upload.
- Profile privacy must hide full gallery, videos, bio, email, phone, and WhatsApp unless owner/follower/paid/booking access applies.
- Follow, like, comment, booking, message, and rating writes must use `req.user` as the actor, not a client-supplied sender/user id.
- Feed posts are stored in the `posts` collection through the `Feed` model and should include safe public URLs plus relative `mediaUrl` paths.

## Known False Positives

- `/api/feed` and `/api/search` intentionally support public reads through `optionalAuthMiddleware`.
- `/uploads/*` is intentionally served as static public media.
- Frontend console logs for upload/feed/video diagnostics are temporary debugging aids and should not include secrets.
- Environment reads such as `process.env.JWT_SECRET`, `CLIENT_URL`, and `VITE_API_URL` are expected configuration access.
