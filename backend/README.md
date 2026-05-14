# VibeBook

VibeBook is an entertainment booking platform that connects event organizers with performers, including dancers, DJs, MCs, artists, and crews.

The backend provides authentication, profile management, search and filtering, booking requests, ratings, admin controls, and health checks for production deployment.

## Features

- Authentication with JWT
- User registration and login
- Performer profiles with images, pricing, contact details, availability, and ratings
- Search and filter by role, type, gender, category, availability, and price range
- Booking system for requesting and managing talent bookings
- Rating system for performer feedback
- Admin dashboard support for user management, verification, blocking, deletion, stats, and rules
- Public website rules endpoint
- Production health check endpoint

## Tech Stack

- Node.js
- Express
- MongoDB
- Mongoose
- JWT
- bcryptjs
- Resend

## Setup

Clone the repository:

```bash
git clone https://github.com/ChaceEthan/Vibe-Book.git
cd Vibe-Book
```

Install dependencies:

```bash
npm install
```
Create a `.env` file in the project root:

```env
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret
PORT=5000
```

Start the server:

```bash
npm start
```

For local development:

```bash
npm run dev
```

## Environment Variables

| Variable | Required | Description |
| --- | --- | --- |
| `MONGO_URI` | Yes | MongoDB connection string |
| `JWT_SECRET` | Yes | Secret key used to sign JWT tokens |
| `PORT` | No | Server port. Defaults to `5000` when not provided |
| `CLIENT_URL` | Recommended | Frontend URL used in verification emails |
| `RESEND_API_KEY` | Email OTP | Resend API key used to send verification codes |
| `FROM_EMAIL` | Email OTP | Verified sender label, for example `VibeBook <verify@your-domain.com>` |
| `OTP_EXPIRES_MINUTES` | No | OTP lifetime in minutes. Defaults to `5` |
| `PHONE_AUTH_STATUS` | No | Phone login status marker. Keep as `COMING_SOON` |
| `SMS_PROVIDER` | Phone OTP | Optional phone provider: `twilio`, `vonage`, or `africastalking` |

### Resend Email OTP

VibeBook sends verification codes through the Resend API. Configure a verified sender in Resend, then set:

```env
RESEND_API_KEY=re_your_api_key
FROM_EMAIL="VibeBook <verify@your-domain.com>"
CLIENT_URL=https://your-frontend-domain.com
OTP_EXPIRES_MINUTES=5
PHONE_AUTH_STATUS=COMING_SOON
```

If Resend credentials are missing or invalid, the API returns a clean temporary-unavailable message and does not crash the server.

### Phone OTP

Phone verification is provider-ready but disabled in production until `SMS_PROVIDER` and the selected provider credentials are configured. Supported provider keys are documented in `backend/.env.example`.

## API Endpoints Overview

### Health

- `GET /api/health` - Check API and MongoDB connection status

### Auth

- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Log in and receive a JWT

### Users

- `GET /api/users/search` - Search and filter performers
- `GET /api/users/profile` - Get logged-in user profile
- `GET /api/users/:id` - Get a public user profile
- `PUT /api/users/update` - Update logged-in user profile
- `PATCH /api/users/update` - Partially update logged-in user profile
- `POST /api/users/:id/contact` - Send a contact request to a performer

### Bookings

- `POST /api/bookings` - Create a booking request
- `GET /api/bookings/me` - Get bookings for the logged-in user
- `PATCH /api/bookings/:id/status` - Update booking status

### Ratings

- `POST /api/ratings/:userId` - Add or update a rating for a user
- `GET /api/ratings/:userId` - Get ratings for a user

### Admin

- `GET /api/admin/stats` - Get admin dashboard stats
- `GET /api/admin/users` - Get all users
- `DELETE /api/admin/delete/:id` - Delete a user
- `PATCH /api/admin/block/:id` - Block a user
- `PATCH /api/admin/unblock/:id` - Unblock a user
- `PATCH /api/admin/verify/:id` - Verify a user
- `POST /api/admin/rules` - Create a website rule

### Rules

- `GET /api/rules` - Fetch public website rules

## Project Status

The backend is production-ready for Render deployment. It includes environment validation, MongoDB startup flow, protected routes, admin controls, booking management, ratings, and a health check endpoint.

## Future Improvements

- Payment integration
- Real-time notifications
- File storage for uploaded profile images
- Advanced admin analytics
- Email templates
- Frontend client application
