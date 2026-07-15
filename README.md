<div align="center">

# 🧩 DWCode

### _Where DataWeave developers come to level up._

**The first LeetCode-style arena built exclusively for MuleSoft DataWeave.**

Stop practicing transformations in a scratch Anypoint project you'll never open again.
Solve real problems. Race the clock. Climb the leaderboard. Let AI throw new challenges at you until `%dw 2.0` feels like a second language.

_All in a browser-based Monaco editor wired straight into a live DataWeave 2.0 compiler._

<br/>

### 🎬 [**▶ Watch the 2-minute Demo**](https://drive.google.com/file/d/1fK-xpvf82gxItmtEjhcHu2E9O9FS8vcX/view?usp=drive_link)

_See a problem go from blank editor → green checkmarks in real time._

<br/>

[![Next.js](https://img.shields.io/badge/Next.js-16.2.9-black?logo=next.js)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript)](https://www.typescriptlang.org)
[![MongoDB](https://img.shields.io/badge/MongoDB-Mongoose-47A248?logo=mongodb)](https://www.mongodb.com)
[![Clerk](https://img.shields.io/badge/Auth-Clerk-6C47FF?logo=clerk)](https://clerk.com)
[![Gemini](https://img.shields.io/badge/AI-Gemini_2.5_Flash-4285F4?logo=google)](https://ai.google.dev)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker)](https://www.docker.com)

</div>

---

## 🌍 Why DWCode Exists

Every MuleSoft developer knows the feeling: you can wire up an API in your sleep, but hand you a gnarly `groupBy` → `pluck` → `reduce` chain under interview pressure and suddenly the docs are open in three tabs.

DataWeave is a language. Languages get sharp with **reps**, not tutorials.

DWCode is the dojo. It gives you an endless supply of curated and AI-generated transformation puzzles, a real compiler to check your work against hidden test cases, and a scoreboard that turns "I should practice more" into "I'm rank #3 and I'm not stopping."

> **Built by the community, for the community.** 💙

---

## ✨ Features

### 🏋️ Problem Workspace — _your training ground_
The main event. A clean split-pane battle station:

- **Problem description** | **Monaco editor** | **Console** — everything in one view, zero context-switching
- Hit **Run** against your own custom JSON input, or smash **Submit** to face every test case at once
- Real-time **pass/fail feedback** with per-test-case diff output — see exactly where your output drifted
- A built-in **countdown timer** that recreates interview pressure (or just keeps you honest)
- **Bookmark** any problem to revisit when it stops haunting you
- **Reveal Solution** toggle with optional hints — for when you've earned it, or when you're stuck enough to peek
- **My Notes** tab — auto-saved, per-problem markdown notes so future-you remembers the trick
- **Discussion** tab — a comment thread per problem to argue about the "right" way to do it

### 🤖 AI Problem Generator — _the endless boss fight_
Never run out of problems again.

- One-click generation via **Google Gemini 2.5 Flash**
- Dial in **difficulty** (Easy / Medium / Hard), **category**, and an optional **topic**
- Get back a *complete* problem: description, examples, constraints, starter code, visible test cases, hidden test cases, hints, and a reference solution
- Saved to the database instantly and live in your problem list before you can say _"lazy evaluation"_

### 🏆 Contests — _prove it under pressure_
- Spin up time-boxed contests from any subset of problems
- **Public** for the whole arena, or **invite-code-only** for your team's private showdown
- Status computes itself: `upcoming` → `active` → `ended`
- Weighted scoring rewards ambition — **Hard ×5, Medium ×3, Easy ×1**

### 📊 Leaderboard — _the wall of legends_
- Global ranking by weighted score across every accepted submission
- Per-user breakdown: Easy / Medium / Hard solved, acceptance rate, total submissions
- **Live aggregation** — no cron jobs, no manual sync, always current

### 🛝 Free Playground — _no rules, just DataWeave_
- A standalone editor with zero problem constraints — bring your own chaos
- Three panels: **Input payload** | **DataWeave script** | **Output**
- Instant execution, copy-to-clipboard, one-click reset, and execution time so you can flex your optimizations

### ✍️ Blog — _the community's brain_
- Full CRUD community blog
- Write with a rich text editor; published posts go public for everyone to learn from

### 👤 User Profiles — _your story so far_
- Progress overview: total solved, breakdown by difficulty, your bookmarks
- Full submission history and personal stats

### 🪙 Coins System — _because winning should feel good_
- A gamification layer: earn coins for accepted solutions
- Full transaction history right in your profile

### 🔐 Admin Panel — _mission control_
- Role management and user administration via dedicated `/admin` routes
- Locked down with Clerk authentication and custom role checks

---

## 🏗 Tech Stack

Every piece was chosen to keep the loop tight: **write DataWeave → run against a real compiler → get instant truth.**

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

> From `git clone` to green checkmarks in five steps.

### Prerequisites

- **Node.js** ≥ 18
- **Docker** (for MongoDB and the optional DataWeave compiler backend)
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

The app starts on **[http://localhost:8000](http://localhost:8000)** — open it, pick a problem, and start transforming. 🎉

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

## 🗺 Roadmap Ideas

_Want to help shape where DWCode goes next? These are open for the taking:_

- 📅 Daily challenge streaks (keep the muscle warm)
- 🏢 Company-tagged problem sets for interview prep
- 🧵 DataWeave "pattern of the week" community writeups
- 🥇 Team leagues and seasonal contests

_Have an idea? Open an issue and let's talk._

---

## 🤝 Contributing

DWCode gets better every time a MuleSoft dev throws in a problem, fixes a bug, or writes a blog post. Jump in:

1. Fork the repo and create a feature branch: `git checkout -b feat/your-feature`
2. Make your changes and ensure the app builds: `npm run build`
3. Run lint: `npm run lint`
4. Open a pull request with a clear description

Every contribution — a single test case or a whole new feature — makes the whole community sharper. 🙌

---

## 📄 License

MIT — feel free to use, fork, and extend. Go build something great.

---

<div align="center">

### 🧩 DWCode

**Practice like it's an interview. Compete like it's a sport. Master DataWeave.**

🎬 [**Watch the Demo**](https://drive.google.com/file/d/1fK-xpvf82gxItmtEjhcHu2E9O9FS8vcX/view?usp=drive_link)

<br/>

_Built with ❤️ for the MuleSoft community._

</div>
