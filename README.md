# 🤖 Neon GIT Manager

**Neon GIT Manager** is a blazing-fast, lightweight desktop application built for macOS (Apple Silicon M1+). Powered by a Rust backend and a custom UI frontend, it serves as a hyper-efficient alternative to bulky electron-based Git GUIs.

It is specifically designed for modern web developers who need to move incredibly fast: creating branches, purging build cache files (`.bak*`), committing, pushing, and merging in a single click.

## ✨ Features

* **🚀 Stateless Architecture:** Manage multiple Git repositories from a single unified interface. Instantly switch between local repositories using the native folder picker.
* **⚡ Native Speed:** Built on Tauri v2. Uses the native macOS WebKit renderer and a Pure Rust execution engine for zero-latency operations.
* **📝 The "Quick Commit" Engine:** A highly opinionated, single-click workflow that:
  1. Recursively hunts down and purges all temporary build files (`*.bak*`) across the entire repository.
  2. Stages all changes (`git add .`).
  3. Formats your commit message (`feat:`, `fix:`, `chore:`, etc.).
  4. Commits and pushes.
  5. *Fallback:* If the push is rejected, it automatically executes a `git pull --rebase` and retries the push without crashing.
* **🔀 Automated Merging:** Dynamically detects `main` or `master`, pulls the latest, merges your feature branch, pushes to origin, and offers to forcefully delete the local feature branch to keep your workspace clean.
* **📜 Rich History Viewer:** Parses raw Git logs into a beautiful, expandable UI with one-click hash copying.
* **📂 Native Repo Viewer:** A hierarchical, virtual file tree that instantly maps tracked files using `git ls-files`.
* **🌿 Automated Branching:** Type "camera fixes", and the engine automatically generates and checks out `feat/camera-fixes`.
* **💥 Hard Reset:** A secure, locked "Nuke" protocol to instantly wipe uncommitted workspace changes.

## 🛠️ Tech Stack
* **Engine:** Rust (`std::process::Command`, `std::fs`)
* **Bridge:** Tauri v2 IPC Architecture (Event Streaming)
* **Canvas:** Pure Vanilla HTML / CSS / JS (No Frameworks, No Bundlers)

## 📦 Installation & Build

Because this app utilizes pure Vanilla JavaScript, there is no heavy Node bundler required. 

1. **Clone the repository:**
   ```bash
   git clone https://github.com/YOUR_USERNAME/neon-git.git
   cd neon-git

# 🤝 Contact
Developed by Viv Chawda @ MoodCompute
🌐 www.moodcompute.com
✉️ contact@moodcompute.com