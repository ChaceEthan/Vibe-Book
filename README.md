# VibeBook

VibeBook is a short-video social platform for discovering creators, sharing media, building communities, and interacting in real time.

## Features

- Short-form vertical video feed
- User profiles, following, likes, and post comments
- Direct messaging and group messaging with separate realtime events
- WebRTC livestreaming with host video/audio, live comments, viewer presence, gifts, and a 10-seat TikTok-style panel
- Host panel controls for approving/rejecting requests, muting/removing guests, swapping seats, locking/unlocking seats, and closing seats
- NEX wallet, rewards, referrals, and creator support
- Image and video uploads through Cloudinary

## Architecture

- Frontend: React and Vite, deployed on Vercel
- Backend: Node.js, Express, MongoDB, and Socket.IO, deployed on Render
- Realtime media: WebRTC peer connections signaled through Socket.IO live events
- Media storage and delivery: Cloudinary HTTPS assets
- Livestream room state: backend Socket.IO room memory, destroyed when a host ends or leaves a live

Production services:

- Frontend: https://vibe-book-kappa.vercel.app
- Backend: https://vibe-book-fri1.onrender.com

## Realtime Channels

Direct messages, group messages, and livestream comments are intentionally separate.

- Direct chat uses `send_message`, `receive_message`, direct message controllers, and direct message collections.
- Group chat uses `send_group_message`, `receive_group_message`, group chat controllers, and group message collections.
- Livestream comments use `live:message` inside livestream sockets only. Live comments are not emitted as chat messages and do not create direct chat, group chat, or notification records.
- Live gifts can create wallet and monetization notifications, but live comments do not appear in the notification center.

## Livestreaming

- Hosts publish camera and microphone tracks with WebRTC.
- Camera switching uses device enumeration/facing-mode fallback and replaces only the video sender so the audio sender remains alive.
- Viewers attach remote video/audio streams in the livestream viewer and can mute local playback without muting the host sender.
- Host exit broadcasts `live:ended`, closes peers, removes discovery state, and clears the in-memory live room.
- Panel seat 1 is reserved for the host; seats 2-10 are guest seats.

## Project Structure

- `frontend` - React/Vite client
- `backend` - Express/MongoDB/Socket.IO API and realtime server
- `backend/src/modules/livestream` - livestream REST controller, service, routes, and Socket.IO live room handling
- `frontend/src/components/LiveStreamViewer.jsx` - livestream viewer, host controls, WebRTC peer handling, live comments, gifts, and panel UI
- `frontend/src/pages/Chat.jsx` - direct and group chat UI

## Local Development

Install dependencies and create local environment files from the provided examples:

```text
backend/.env.example -> backend/.env
frontend/.env.example -> frontend/.env
```

Run the backend from `backend` with `npm start` and the frontend from `frontend` with `npm run dev`.

Required environment values depend on the enabled features. Use placeholders or deployment secrets for values such as:

- `MONGODB_URI`
- `JWT_SECRET`
- `FRONTEND_URL`
- `VITE_API_URL`
- `VITE_SOCKET_URL`
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`
- Optional TURN server URLs and credentials for restrictive networks

Never commit real credentials or `.env` files.