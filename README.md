# 🧠 MegaSwipes: NeuroQC Platform 🐱

**MegaSwipes** is an offline-first quality control platform for neuroimaging data. It simplifies the process of reviewing and voting on brain scan images through a swiper-style interface.

![Cat Scientist](https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExM3ZkeXF6bmF6eXJ6eXJ6eXJ6eXJ6eXJ6eXJ6eXJ6eXJ6eSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmbT1n/3o7TKSjRrfIPjeiVyM/giphy.gif)

---

## ✨ Key Features

- **Swiper Interface**: Quickly vote 'Pass' or 'Fail' on images. 🤏
- **Admin Dashboard**: Manage users, import datasets, and view database stats. 📊
- **Secure**: Image access requires authentication and secure tokens. 🔒
- **Offline Capable**: Designed to run locally or on an intranet. 🏠
- **Duplicate Prevention**: Smart import logic prevents double entries! 🛡️

## 🚀 Quick Start

1.  **Ensure Node.js v20.11.0** is installed.
2.  **Setup**:
    ```bash
    npm install
    npm run init-db
    ```
3.  **Run**:
    ```bash
    npm run dev
    ```
    
👉 **[Read the Full Setup Guide](docs/SETUP_GUIDE.md)** for detailed instructions.

---

## 📚 Documentation

We have purr-pared robust documentation for you:

- **[🛠️ Setup Guide](docs/SETUP_GUIDE.md)**: Installation, database init, and troubleshooting.
- **[📡 API Reference](docs/API_REFERENCE.md)**: Explore the backend endpoints.
- **[💻 Development Guide](docs/DEVELOPMENT.md)**: Project structure and how to contribute.

---

## 🛠️ Technology Stack

- **Backend**: Node.js, Express, Better-SQLite3
- **Frontend**: Vue.js, Vite, TailwindCSS (for some styles)
- **Database**: SQLite (Local file-based)

---

## 🤝 Contributing

Found a bug? Want to add a feature? Check out the [Development Guide](docs/DEVELOPMENT.md) first!

*Made with ❤️ and 🐱 by the Child Mind Institute contributors. Meow*
