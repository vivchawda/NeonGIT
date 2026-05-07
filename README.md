# 🤖 Neon GIT Manager

**Neon GIT Manager** is a blazing-fast, lightweight desktop application built for macOS (Apple Silicon M1+) and Windows. Powered by a Rust backend and a custom UI frontend, it serves as a hyper-efficient alternative to bulky electron-based Git GUIs.

It is specifically designed for modern web developers who need to move incredibly fast: creating branches, purging build cache files (`.bak*`), committing, pushing, and merging in a single click.

---

## ✨ Core Architecture

* **🚀 Stateless Design:** Manage multiple Git repositories from a single unified interface. Instantly switch between local repositories using the native folder picker. The app remembers your active repositories across restarts.
* **⚡ Native Speed:** Built on Tauri v2. Uses the native macOS WebKit renderer and a Pure Rust execution engine for zero-latency operations.
* **📡 Real-Time Event Streaming:** Long-running Git operations (like pushing and merging) stream their terminal output directly to the UI in real-time, so you never wonder if the app is frozen.

---

## 🎛️ The 6-Button Workflow Guide

Neon GIT Manager is built around a highly opinionated, 6-button grid designed to handle 99% of daily Git operations.

### 1. 🚀 Start Feature
Automates the tedious process of creating and checking out new branches.
* **How to use:** Click the button and type a human-readable name (e.g., `camera fixes`). 
* **What it does:** The engine automatically formats your input (lowercases it, replaces spaces with hyphens), prepends `feat/` if a standard prefix isn't provided, and executes `git checkout -b feat/camera-fixes`.

### 2. 📝 Quick Commit
The crown jewel of Neon GIT Manager. A single-click workflow that handles cleanup, staging, formatting, and remote synchronization.
* **How to use:** Click the button. Select a commit type (`feat`, `fix`, `ui`, etc.), enter a short summary, and optionally add details. Click "Ensure & Push".
* **What it does:**
  1. **The Purge:** Recursively hunts down and permanently deletes all temporary build files (`*.bak*`) across the entire repository using a custom Rust directory walker.
  2. **The Stage:** Executes `git add .`.
  3. **The Commit:** Formats your input into a standard conventional commit message and executes `git commit -m`.
  4. **The Push:** Streams the `git push` command to origin.
  5. **The Fallback:** If GitHub rejects the push (e.g., someone else pushed to the branch), the engine intercepts the failure, automatically runs `git pull --rebase`, and retries the push without crashing.

### 3. ⏪ Hard Reset
A secure, locked "Nuke" protocol to instantly wipe uncommitted workspace changes.
* **How to use:** Click the button. You will be presented with a red warning modal. You must physically type the word `nuke` to unlock the submit button.
* **What it does:** Executes `git reset --hard HEAD` to permanently destroy all uncommitted file modifications and restore the repository to its last known good state.

### 4. 🔀 Merge to Main
Automates the entire lifecycle of merging a completed feature branch into production.
* **How to use:** While on your feature branch, click the button. Confirm the source branch in the modal.
* **What it does:**
  1. Dynamically detects your repository's primary branch (`main` or `master`).
  2. Checks out the primary branch.
  3. Pulls the absolute latest code from origin.
  4. Merges your feature branch into the primary branch.
  5. Pushes the merged code back to origin.
  6. **Cleanup:** Prompts you to forcefully delete (`git branch -D`) the local feature branch to keep your workspace clean.

### 5. 📜 View History
A rich, interactive Git log viewer.
* **How to use:** Click the button to open the History Modal.
* **What it does:** Parses raw Git logs into a beautiful, scrollable UI. Click any commit card to expand it and read the full multi-line commit body. Click the yellow Hash pill to instantly copy the Git Hash to your clipboard.

### 6. ⚡ Actions Menu
A dropdown containing secondary utility commands.
* **📂 View Repository:** Uses `git ls-files` to instantly generate a hierarchical, virtual file tree of every tracked file in your repository.
* **📱 Sync Android:** Executes `npx cap sync android` to bridge web code to native mobile environments (specifically designed for Capacitor/Ionic workflows).

---

## 🛠️ Tech Stack
* **Engine:** Rust (`std::process::Command`, `std::fs`)
* **Bridge:** Tauri v2 IPC Architecture (Event Streaming)
* **Canvas:** Pure Vanilla HTML / CSS / JS (No Frameworks, No Bundlers)

---

## 📦 Installation & Build

Because this app utilizes pure Vanilla JavaScript, there is no heavy Node bundler required. 

**Clone the repository:**
```bash
git clone https://github.com/vivchawda/NeonGIT.git
cd neon-git
```

**Run in Development Mode:**

```Bash
npm run tauri dev
```

**Compile for Release (macOS .dmg / Windows .exe):**
```Bash
npm run tauri build
(The compiled binaries will be located in src-tauri/target/release/bundle/)
```


## 🤝 Contact
Developed by **Viv Chawda @ MoodCompute**

🌐 www.moodcompute.com

✉️ contact@moodcompute.com