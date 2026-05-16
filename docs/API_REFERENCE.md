# 📡 API Reference 📡

Here is a high-level overview of the API endpoints available in MegaSwipes. 🐱

## 🔐 Authentication (`/api/auth`)
- `POST /login`: Authenticate as a user or admin.
- `POST /logout`: End the session.
- `GET /me`: Get current user details.

## 🗳️ Voting (`/api/votes`)
- `POST /`: Submit a vote for an image.
    - **Body**: `{ sample_id, vote, rating, comment }`
- `GET /my`: Retrieve the current user's voting history.

## 🖼️ Images & Assignments
- `GET /api/assignments/next`: Get the next batch of images for the user to review.
- `GET /api/samples/:id/image`: Fetch the raw image file.

## 👑 Learderboard (`/api/leaderboard`)
- `GET /`: Get the top voters and stats. 🏆

## 🛡️ Admin API (Requires Admin Privileges) 🦁

### Database Management (`/api/admin/database`)
- `POST /backup`: Create a backup of `neuroqc.db`.
- `POST /import`: Import new images from the filesystem.
    - **Note**: Now includes duplicate prevention! 🛡️
- `GET /tables`: List all database tables.
- `POST /query`: Execute raw SQL (Handle with care! 🙀).

### User Management (`/api/admin/users`)
- `GET /`: List all users.
- `POST /`: Create a new user.
- `POST /reset-password`: Reset a user's password.

### Resources (`/api/admin/resources`)
- `GET /system-stats`: Server health, disk usage, etc.

---

*> This is a summary. For exact payload structures, please refer to the route files in `backend/routes/`.*
