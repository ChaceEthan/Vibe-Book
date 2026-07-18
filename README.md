# VibeBook

VibeBook is a short-video social platform for discovering creators, sharing media, building communities, and interacting in real time.

## Features

- Short-form vertical video feed
- User profiles, following, likes, and comments
- Direct and group messaging
- WebRTC livestreaming with live comments, viewer presence, and gifts
- NEX wallet, rewards, referrals, and creator support
- Image and video uploads through Cloudinary

## Architecture

- Frontend: React and Vite, deployed on Vercel
- Backend: Node.js, Express, MongoDB, and Socket.IO, deployed on Render
- Realtime media: WebRTC signaling over Socket.IO
- Media storage and delivery: Cloudinary HTTPS assets

Production services:

- Frontend: https://vibe-book-kappa.vercel.app
- Backend: https://vibe-book-fri1.onrender.com

## Project Structure

- `frontend` — React/Vite client
- `backend` — Express/MongoDB/Socket.IO API and realtime server

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