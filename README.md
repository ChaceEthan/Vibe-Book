# 🎭 VibeBook

VibeBook is a modern entertainment booking platform that connects event organizers ("bosses") with performers such as dancers, DJs, MCs, traditional dance crews, and artists.

The platform allows users to discover talent, view profiles, and request bookings directly through the system.

---

## 🚀 Project Vision

To build a digital marketplace for entertainment professionals where:

- Performers can showcase their profiles
- Clients can search and book talent easily
- Communication happens fast and directly
- Trust and visibility are improved in the entertainment industry

---

## 🌟 Core Features

### 👤 User System
- Registration for:
  - Dancers (single & crew)
  - DJs
  - MCs / Hosts
  - Artists
- Profile management
- Role-based access

---

### 🔎 Search & Discovery
- Search performers by:
  - Role (Dancer, DJ, MC, Artist)
  - Gender
  - Category (Modern / Traditional)
  - Availability
  - Price range

---

### 📸 Profiles
Each performer profile includes:
- Name & bio
- Profile images
- Category & type
- Pricing
- Contact information (WhatsApp / phone)
- Availability status
- Rating system

---

### 📅 Booking System
- Clients can send booking requests
- Performers can accept or reject bookings
- Booking status tracking:
  - Pending
  - Accepted
  - Rejected

---

### ⭐ Rating System
- Clients can rate performers
- Average rating displayed on profiles

---

### 🛡️ Admin Dashboard
Admins can:
- Manage users
- Verify performers
- Delete or block users
- Monitor platform activity

---

## 🧱 Tech Stack

### Backend
- Node.js
- Express.js
- MongoDB Atlas
- Mongoose
- JWT Authentication
- bcryptjs

### Frontend (Planned / Future)
- React.js
- Tailwind CSS
- Mobile responsive UI

---

## 🗄️ Database Structure

Main collections:

### Users
- name
- role (dancer, DJ, MC, artist)
- type (single / crew)
- gender
- category (modern / traditional)
- price
- images
- availability
- rating
- contact info

### Bookings
- user (client)
- performer
- message
- status (pending / accepted / rejected)
- timestamps

---

## 🔐 Authentication

- JWT-based authentication
- Password hashing using bcrypt
- Protected routes for users and admin

---

## 💳 Payments (Future Feature)

Planned payment methods:
- MTN Mobile Money
- Airtel Money
- USDT / Crypto
- USD payments

---

## 📲 Notifications (Future Feature)

- Email notifications
- WhatsApp integration
- Real-time booking alerts

---

## ⚙️ Installation

```bash
# Clone repository
git clone https://github.com/ChaceEthan/Vibe-Book.git

# Install dependencies
npm install

# Setup environment variables
MONGO_URI=your_mongodb_uri
JWT_SECRET=your_secret
PORT=5000

# Run server
npm start
