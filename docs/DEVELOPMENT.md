# 💻 Development Guide 🐈‍⬛

So you want to contribute to MegaSwipes? That's paw-some! 🐾 
This guide covers the project structure and how things work under the hood.

## 📂 Project Structure

It's a hybrid monolith structure (Frontend + Backend in one repo).

- **`/backend`**: The brains of the operation 🧠
    - `server.js`: Main entry point (Express app).
    - `database.js`: SQLite connection setup.
    - `routes/`: API route handlers.
    - `utils/`: Helper functions.
- **`/frontend`**: The pretty face 💅
    - Based on **Vue.js** + **Vite**.
    - `src/components`: UI components.
    - `src/views`: Main pages (Admin, Swiper, etc.).
- **`/data`**: Where the treasure lies 💎
    - `neuroqc.db`: The SQLite database file.
    - `images/`: Directory where raw images are stored.

## 🗄️ Database Schema

We use **SQLite** with `better-sqlite3`.

### Key Tables
- **`users`**: Stores user info and hashed passwords.
- **`samples`**: Represents an image file.
    - `id`: Unique ID.
    - `dataset_id`: Belongs to a dataset.
    - `filename`: Name of the image files (must be unique with dataset_id!).
    - `secure_token`: Used for serving images securely.
- **`votes`**: Stores user decisions.
    - Has a UNIQUE constraint on `(user_id, sample_id)`.
- **`datasets`**: Groups of samples.

## 🛠️ Common Tasks

### Adding a New Route
1.  Create a file in `backend/routes/`.
2.  Export a function `registerMyRoutes(app)`.
3.  Import and call it in `backend/server.js`.

### Running Scripts
Scripts are located in `backend/` or `scripts/`.
Always ensure you are using Node **20.11.0**.

Example: Fixing duplicates (if needed)
```bash
node backend/fix_duplicates.js
```

---

*Happy Hacking!* 🐱
