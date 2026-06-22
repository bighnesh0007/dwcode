 \<div align="center">

# 🧩 DWCode — DataWeave Practice Platform

**A LeetCode-style coding platform built exclusively for MuleSoft DataWeave developers.**

Practice data transformations, compete in timed contests, and sharpen your skills with AI-generated problems — all in a browser-based Monaco editor connected to a live DataWeave 2.0 compiler.

[![Next.js](https://img.shields.io/badge/Next.js-16.2.9-black?logo=next.js)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript)](https://www.typescriptlang.org)
[![MongoDB](https://img.shields.io/badge/MongoDB-Mongoose-47A248?logo=mongodb)](https://www.mongodb.com)
[![Clerk](https://img.shields.io/badge/Auth-Clerk-6C47FF?logo=clerk)](https://clerk.com)
[![Gemini](https://img.shields.io/badge/AI-Gemini_2.5_Flash-4285F4?logo=google)](https://ai.google.dev)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker)](https://www.docker.com)

</div>

---

## ✨ Features

### 🏋️ Problem Workspace
- Split-pane layout: **Problem description** | **Monaco editor** | **Console**
- Run code against custom JSON input or click **Submit** to evaluate all test cases
- Real-time pass/fail feedback with per-test-case diff output
- Built-in **countdown timer** to simulate interview pressure
- **Bookmark** any problem for later revision
- **Reveal Solution** toggle with optional hints
- **My Notes** tab — auto-saved, per-problem markdown notes
- **Discussion** tab — comment thread per problem

### 🤖 AI Problem Generator
- One-click generation via **Google Gemini 2.5 Flash**
- Configure difficulty (Easy / Medium / Hard), category, and optional topic
- Returns full problem: description, examples, constraints, starter code, test cases, hidden test cases, hints, and a reference solution
- Problems are saved immediately to the database and appear in the problem list

### 🏆 Contests
- Create time-boxed contests with any subset of problems
- Public or invite-code-only visibility
- Auto-computed status: `upcoming` → `active` → `ended`
- Participant scoring: Hard ×5, Medium ×3, Easy ×1

### 📊 Leaderboard
- Global ranking based on weighted score across all accepted submissions
- Per-user breakdown: Easy / Medium / Hard solved, acceptance rate, total submissions
- Live aggregation — no manual sync required

### 🛝 Free Playground
- Standalone editor with no problem constraints
- Three-panel layout: **Input payload** | **DataWeave script** | **Output**
- Instant execution, copy-to-clipboard, reset, and execution time display

### ✍️ Blog
- Community blog with full CRUD
- Write posts using a rich text editor; published posts are publicly visible

### 👤 User Profiles
- Progress overview: total solved, by difficulty, bookmarks
- Submission history and personal stats

### 🪙 Coins System
- Gamification layer: earn coins for accepted solutions
- Transaction history visible in user profile

### 🔐 Admin Panel
- Role management and user administration via dedicated `/admin` routes
- Protected by Clerk authentication and custom role checks

---

## 🏗 Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript 5 |
| UI | Tailwind CSS v4, shadcn/ui, Lucide Icons |
| Editor | Monaco Editor (`@monaco-editor/react`) |
| Auth | Clerk (`@clerk/nextjs`) |
| Database | MongoDB via Mongoose |
| AI | Google Gemini 2.5 Flash (`@google/genai`) |
| State | Zustand |
| Compiler Backend | DataWeave runtime (Docker / external service) |
| Containerisation | Docker Compose |
| Font | Geist (via `next/font`) |

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** ≥ 18
- **Docker** (for MongoDB and optional DataWeave compiler backend)
- A **Clerk** account — [clerk.com](https://clerk.com)
- A **Google Gemini** API key — [ai.google.dev](https://ai.google.dev)

### 1. Clone & Install

```bash
git clone https://github.com/your-username/dwcode.git
cd dwcode
npm install
```

### 2. Environment Variables

Copy the example env file and fill in your values:

```bash
cp .env.example .env.local
```

```env
# .env.local

# MongoDB connection string
MONGODB_URI=mongodb://localhost:27017/dwcode

# Google Gemini API key (for AI problem generation)
GEMINI_API_KEY=your_gemini_api_key_here

# Clerk authentication keys (from your Clerk dashboard)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...

# Clerk redirect paths
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
```

### 3. Start MongoDB

```bash
docker-compose up -d
```

This spins up a MongoDB instance at `localhost:27017` with a persistent volume.

### 4. Start the DataWeave Compiler Backend

The code execution engine is a separate DataWeave runtime service. By default the app points to `https://dwlbackend.onrender.com`. To run it locally, start the companion Docker container and update `DATAWEAVE_BACKEND_URL` in your env file accordingly.

### 5. Run the Development Server

```bash
npm run dev
```

The app starts on **[http://localhost:8000](http://localhost:8000)**.

---

## 📂 Project Structure

```
dwcode/
├── app/                        # Next.js App Router pages & API routes
│   ├── api/                    # REST API handlers
│   │   ├── execute/            # DataWeave code execution proxy
│   │   ├── generate/           # AI problem generation (Gemini)
│   │   ├── problems/           # Problem CRUD
│   │   ├── submissions/        # Submission tracking
│   │   ├── contests/           # Contest management
│   │   ├── leaderboard/        # Score aggregation
│   │   ├── bookmarks/          # Bookmark toggle
│   │   ├── notes/              # Per-problem notes
│   │   ├── coins/              # Gamification coins
│   │   ├── blog/               # Blog posts
│   │   ├── comments/           # Problem discussion threads
│   │   └── admin/              # Admin: users & roles
│   ├── problems/[slug]/        # Problem workspace (split-pane editor)
│   ├── playground/             # Free DataWeave playground
│   ├── contests/               # Contest list & detail
│   ├── leaderboard/            # Global leaderboard
│   ├── blog/                   # Blog list, detail & editor
│   ├── profile/                # User profile page
│   ├── create/                 # Manual problem creation form
│   └── admin/                  # Admin dashboard
├── components/                 # Shared UI components (Navbar, Comments, etc.)
├── models/                     # Mongoose schemas (Problem, Submission, Contest…)
├── lib/                        # Database connection, utilities
├── scripts/                    # Seed scripts
├── public/                     # Static assets
├── docker-compose.yml          # MongoDB container
└── Dockerfile                  # App Dockerfile
```

---

## 🔑 Key API Routes

| Method | Route | Description |
|--------|-------|-------------|
| `GET/POST` | `/api/problems` | List or create problems |
| `POST` | `/api/execute` | Run DataWeave code |
| `POST` | `/api/generate` | Generate problem with AI |
| `GET/POST` | `/api/contests` | List or create contests |
| `GET` | `/api/leaderboard` | Fetch ranked leaderboard |
| `POST` | `/api/submissions` | Submit a solution |
| `GET/POST` | `/api/bookmarks` | Toggle bookmark |
| `GET/PUT` | `/api/notes` | Read/write problem notes |
| `GET` | `/api/coins` | User coin balance |
| `GET/POST` | `/api/blog` | Blog post management |
| `GET/POST` | `/api/comments` | Problem discussion |

---

## 🐳 Docker

Start only MongoDB:

```bash
docker-compose up -d
```

Build and run the full app in Docker:

```bash
docker build -t dwcode .
docker run -p 8000:8000 --env-file .env.local dwcode
```

---

## 🤝 Contributing

1. Fork the repo and create a feature branch: `git checkout -b feat/your-feature`
2. Make your changes and ensure the app builds: `npm run build`
3. Run lint: `npm run lint`
4. Open a pull request with a clear description

---

## 📄 License

MIT — feel free to use, fork, and extend.

---

<div align="center">
Built with ❤️ for the MuleSoft community
</div>
