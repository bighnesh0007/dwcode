<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:061A3A,50:00A0DF,100:00C9D6&height=220&section=header&text=DWCode&fontSize=80&fontColor=ffffff&fontAlignY=38&desc=The%20DataWeave%20Practice%20Arena%20for%20MuleSoft&descAlignY=60&descSize=20" width="100%" alt="DWCode banner"/>

<a href="https://readme-typing-svg.demolab.com">
  <img src="https://readme-typing-svg.demolab.com?font=Fira+Code&weight=600&size=24&pause=1000&color=00A0DF&center=true&vCenter=true&width=700&lines=Where+DataWeave+developers+level+up.;Solve.+Compete.+Climb+the+leaderboard.;Live+%25dw+2.0+compiler+in+your+browser.;Open+source+%E2%80%94+our+gift+to+the+Muleys." alt="Typing SVG"/>
</a>

<br/><br/>

**A LeetCode-style coding platform built exclusively for MuleSoft DataWeave developers.**

Practice data transformations, compete in timed contests, and sharpen your skills with AI-generated problems — all in a browser-based Monaco editor connected to a live DataWeave 2.0 compiler.

Stop practicing transformations in a scratch Anypoint project you'll never open again.
Solve real problems. Race the clock. Climb the leaderboard. Let AI throw new challenges at you until `%dw 2.0` feels like a second language.

<br/>

### 🎬 [**▶ Watch the 2-minute Demo**](https://drive.google.com/file/d/1fK-xpvf82gxItmtEjhcHu2E9O9FS8vcX/view?usp=drive_link)

<br/>

![Next.js](https://img.shields.io/badge/Next.js_16-061A3A?style=for-the-badge&logo=next.js&logoColor=white)
![React](https://img.shields.io/badge/React_19-00A0DF?style=for-the-badge&logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript_5-00A0DF?style=for-the-badge&logo=typescript&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-00C9D6?style=for-the-badge&logo=mongodb&logoColor=white)
![Clerk](https://img.shields.io/badge/Clerk_Auth-8B5CF6?style=for-the-badge&logo=clerk&logoColor=white)
![Gemini](https://img.shields.io/badge/Gemini_2.5_Flash-00A0DF?style=for-the-badge&logo=google&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-00C9D6?style=for-the-badge&logo=docker&logoColor=white)

![Open Source](https://img.shields.io/badge/OPEN_SOURCE-💜_our_gift_to_the_community-8B5CF6?style=for-the-badge)
![PRs Welcome](https://img.shields.io/badge/PRs-welcome-00A0DF?style=for-the-badge)
![Made for Muleys](https://img.shields.io/badge/🐴_Made_for-Muleys-061A3A?style=for-the-badge)

</div>

<img src="https://capsule-render.vercel.app/api?type=rect&color=0:00A0DF,100:00C9D6&height=3&section=header" width="100%"/>

## 🌍 Why DWCode Exists

Every MuleSoft developer knows the feeling: you can wire up an API in your sleep, but hand you a gnarly `groupBy` → `pluck` → `reduce` chain under interview pressure and suddenly the docs are open in three tabs.

DataWeave is a language. Languages get sharp with **reps**, not tutorials.

DWCode is the dojo. It gives you an endless supply of curated and AI-generated transformation puzzles, a real compiler to check your work against hidden test cases, and a scoreboard that turns "I should practice more" into "I'm rank #3 and I'm not stopping."

> **Built by the community, for the community.** 💜

<img src="https://capsule-render.vercel.app/api?type=rect&color=0:00A0DF,100:00C9D6&height=3&section=header" width="100%"/>

## ✨ Features

### 🏋️ Problem Workspace — _your training ground_
The main event. A clean split-pane battle station:

- **Split-pane layout**: Problem description | Monaco editor | Console — everything in one view, zero context-switching
- **Run** code against custom JSON input, or click **Submit** to evaluate all test cases at once
- Real-time **pass/fail feedback** with per-test-case diff output — see exactly where your output drifted
- Built-in **countdown timer** to simulate interview pressure (or just keep you honest)
- **Bookmark** any problem for later revision
- **Reveal Solution** toggle with optional hints
- **My Notes** tab — auto-saved, per-problem markdown notes so future-you remembers the trick
- **Discussion** tab — comment thread per problem

### 🤖 AI Problem Generator — _the endless boss fight_
Never run out of problems again.

- **One-click generation** via Google Gemini 2.5 Flash
- Configure **difficulty** (Easy / Medium / Hard), **category**, and an optional **topic**
- Returns a *full* problem: description, examples, constraints, starter code, test cases, hidden test cases, hints, and a reference solution
- Problems are saved immediately to the database and appear in the problem list

### 🏆 Contests — _prove it under pressure_
- Create time-boxed contests with any subset of problems
- **Public** or **invite-code-only** visibility
- Auto-computed status: `upcoming` → `active` → `ended`
- Participant scoring: **Hard ×5, Medium ×3, Easy ×1**

### 📊 Leaderboard — _the wall of legends_
- Global ranking based on weighted score across all accepted submissions
- Per-user breakdown: Easy / Medium / Hard solved, acceptance rate, total submissions
- **Live aggregation** — no manual sync required

### 🛝 Free Playground — _no rules, just DataWeave_
- Standalone editor with no problem constraints — bring your own chaos
- Three-panel layout: **Input payload** | **DataWeave script** | **Output**
- Instant execution, copy-to-clipboard, reset, and execution time display

### ✍️ Blog — _the community's brain_
- Community blog with full CRUD
- Write posts using a rich text editor; published posts are publicly visible

### 👤 User Profiles — _your story so far_
- Progress overview: total solved, by difficulty, bookmarks
- Submission history and personal stats

### 🪙 Coins System — _because winning should feel good_
- Gamification layer: earn coins for accepted solutions
- Transaction history visible in user profile

### 🔐 Admin Panel — _mission control_
- Role management and user administration via dedicated `/admin` routes
- Protected by Clerk authentication and custom role checks

<img src="https://capsule-render.vercel.app/api?type=rect&color=0:00A0DF,100:00C9D6&height=3&section=header" width="100%"/>

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

<img src="https://capsule-render.vercel.app/api?type=rect&color=0:00A0DF,100:00C9D6&height=3&section=header" width="100%"/>

## 🚀 Getting Started

> From `git clone` to green checkmarks in five steps.

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

The app starts on **[http://localhost:8000](http://localhost:8000)** — open it, pick a problem, and start transforming. 🎉

<img src="https://capsule-render.vercel.app/api?type=rect&color=0:00A0DF,100:00C9D6&height=3&section=header" width="100%"/>

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

<img src="https://capsule-render.vercel.app/api?type=rect&color=0:00A0DF,100:00C9D6&height=3&section=header" width="100%"/>

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

<img src="https://capsule-render.vercel.app/api?type=rect&color=0:00A0DF,100:00C9D6&height=3&section=header" width="100%"/>

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

<img src="https://capsule-render.vercel.app/api?type=rect&color=0:00A0DF,100:00C9D6&height=3&section=header" width="100%"/>

## 🗺 Roadmap Ideas

_Want to help shape where DWCode goes next? These are open for the taking:_

- 📅 Daily challenge streaks (keep the muscle warm)
- 🏢 Company-tagged problem sets for interview prep
- 🧵 DataWeave "pattern of the week" community writeups
- 🥇 Team leagues and seasonal contests

_Have an idea? Open an issue and let's talk._

<img src="https://capsule-render.vercel.app/api?type=rect&color=0:00A0DF,100:00C9D6&height=3&section=header" width="100%"/>

## 🎁 Our Gift to the MuleSoft Community

> **DWCode is open source — because the best integrations are the ones we build together.** 🐴💜

We didn't build DWCode to lock it away behind a paywall. We built it because we *are* the MuleSoft community — and every Muley deserves a place to sharpen their DataWeave without spinning up yet another throwaway Mule app.

So here it is. **Free. Open. Yours.** Fork it, self-host it, remix it, ship it. This is our contribution to the flow — now add yours.

**Every Muley makes the mule stronger.** Here's how you can plug in:

- 🧩 **Add a problem** — dreamt up a devious transformation? Drop it in and stump the leaderboard.
- 🐛 **Squash a bug** — see something misbehaving? A PR is worth a thousand issues.
- 📖 **Write a blog post** — teach a DataWeave pattern that took *you* three hours to crack.
- ✨ **Build a feature** — the roadmap above is a menu, not a limit.
- ⭐ **Star the repo** — the cheapest, kindest way to say "keep going."

```dataweave
%dw 2.0
output application/json
var community = payload.developers
---
{
  status: "open source, forever",
  gift: "DWCode",
  from: "us",
  to: "the MuleSoft community",
  yourMove: community map (dev) -> dev ++ { contributed: true }
}
```

> _An API is only as good as the community that connects to it. Same goes for a practice platform._ 🔌

<img src="https://capsule-render.vercel.app/api?type=rect&color=0:00A0DF,100:00C9D6&height=3&section=header" width="100%"/>

## 🤝 Contributing

DWCode gets better every time a MuleSoft dev throws in a problem, fixes a bug, or writes a blog post. Jump in:

1. Fork the repo and create a feature branch: `git checkout -b feat/your-feature`
2. Make your changes and ensure the app builds: `npm run build`
3. Run lint: `npm run lint`
4. Open a pull request with a clear description

Every contribution — a single test case or a whole new feature — makes the whole community sharper. 🙌

<img src="https://capsule-render.vercel.app/api?type=rect&color=0:00A0DF,100:00C9D6&height=3&section=header" width="100%"/>

## 📄 License

MIT — feel free to use, fork, and extend. Go build something great.

<br/>

<div align="center">

```dataweave
%dw 2.0
output application/json
---
{
  project: "DWCode",
  builtWith: "💜",
  gift: "open source, to the MuleSoft community",
  from: "one Muley to every Muley",
  message: "Keep weaving. Keep shipping. Keep leveling up.",
  yourTurn: "fork it → improve it → give it back"
}
```

<br/>

⭐ **If DWCode helped you level up, drop a star — it fuels the mission.** ⭐

</div>

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:00C9D6,50:00A0DF,100:061A3A&height=160&section=footer&text=Made%20with%20💜%20for%20the%20MuleSoft%20Community&fontSize=22&fontColor=ffffff&fontAlignY=70&desc=Our%20open-source%20gift%20—%20now%20go%20weave%20something%20legendary%20🕸️&descAlignY=88&descSize=14" width="100%" alt="DWCode footer"/>
