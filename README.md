# 💑 SeMaCalendar — Seval & Mateo

A private couples app with a shared calendar, to-do list, wishlist, memories, and more.

---

## 🚀 Starting the app after a reboot

> **Every time you restart your computer, you need to start the dev server again.**
> This is normal — the server is a process that runs in memory, not a permanent service.

### Option A — Double-click (easiest)

Double-click **`start-dev.bat`** in the project folder.
It opens a terminal, starts the server, and keeps it running.

Then open your browser at: **http://localhost:3000**

---

### Option B — Terminal

```bash
cd C:\Users\mateo\SeMaCalendar
npm run dev
```

Then open: **http://localhost:3000**

---

## 🛑 Why does it stop working after restart?

`npm run dev` starts a **Node.js process** that lives in memory.
When Windows shuts down, it kills all running processes — including this one.
On restart, nothing re-launches it automatically, so the port is empty.

**There is no bug.** Just run `npm run dev` (or double-click `start-dev.bat`) again.

---

## 📦 First-time setup (only needed once)

If you clone the project on a new machine:

```bash
cd C:\Users\mateo\SeMaCalendar
npm install
npm run dev
```

---

## 🧱 Tech stack

| Layer     | Technology                        |
|-----------|-----------------------------------|
| Framework | Next.js 14 (App Router)           |
| Styling   | Tailwind CSS                      |
| State     | Zustand (persisted in localStorage) |
| Animation | Framer Motion                     |
| Icons     | Lucide React                      |

---

## 👤 Users

| Name  | Theme    | Emoji |
|-------|----------|-------|
| Seval | Purple   | 🌸    |
| Mateo | Turquoise | 🌊   |
