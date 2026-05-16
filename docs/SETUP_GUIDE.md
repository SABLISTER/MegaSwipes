# 🛠️ Setup Guide 🐱

Welcome to the **MegaSwipes** setup guide! Follow these instructions to get your environment purr-fectly ready. 🐾

## 📋 Prerequisites

Before we start, ensure you have the following installed:
- **Node.js**: v20.11.0 (Strictly required!)
- **Git**: To clone the repository.

### 🐈 Installing Node.js (v20.11.0)

We recommend using `nvm` (Node Version Manager) to manage your Node versions without any cat-astrophes.

1.  **Install nvm** (if you haven't):
    ```bash
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
    ```
2.  **Install & Use Node v20.11.0**:
    ```bash
    nvm install 20.11.0
    nvm use 20.11.0
    ```
3.  **Verify**:
    ```bash
    node -v
    # Should output: v20.11.0
    ```

---

## Installation Steps

### 1. Clone the Repository
Clone the project to your local machine:
```bash
git clone <repository-url>
cd MegaSwipes
```

### 2. Install Project Dependencies
Install the backend and root dependencies. This might take a moment, so maybe pet your cat while you wait 🐈.
```bash
npm install
```
> **Note:** This command automatically rebuilds native modules (like `better-sqlite3`) for your system.

### 3. Install Frontend Dependencies
Navigate to the frontend folder and install its dependencies:
```bash
cd frontend
npm install
cd ..
```

### 4. Initialize the Database 
Set up the SQLite database with the initial schema:
```bash
npm run init-db
```
*You should see a "Database initialized" message if everything went well!*

---

## ▶️ Running the Application

### Development Mode (Recommended) 🛠️
Run both backend and frontend in development mode with hot-reloading:
```bash
npm run dev
```
- **Backend**: `http://localhost:3000`
- **Frontend**: `http://localhost:5173`

### Production Mode 
To simulate a production environment:
```bash
npm run build
npm start
```
- **App**: `http://localhost:3000`

---

## 😿 Troubleshooting

**"Module not found: better-sqlite3"**
- This usually means native modules weren't compiled for your current Node version.
- **Fix**: Run `npm run rebuild-native`.

**"Address already in use"**
- Something is hogging port 3000.
- **Fix**: Kill the process using the port `npx kill-port 3000` or check your running tasks.

**"Node version mismatch"**
- The app refuses to start?
- **Fix**: Double-check `node -v` is `20.11.0`. Seriously, it's picky! 😼
