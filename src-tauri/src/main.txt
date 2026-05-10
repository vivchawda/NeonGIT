#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::Path;
use std::process::{Command, Stdio};
use tauri::Emitter;

fn delete_bak_files(dir: &Path) -> u32 {
    let mut count = 0;
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                let name = entry.file_name();
                if name != ".git" && name != "node_modules" && name != "src-tauri" {
                    count += delete_bak_files(&path);
                }
            } else if let Some(ext) = path.extension() {
                if ext.to_string_lossy().starts_with("bak") {
                    if fs::remove_file(&path).is_ok() {
                        count += 1;
                    }
                }
            }
        }
    }
    count
}

fn has_remote_origin(repo_path: &str) -> bool {
    if let Ok(output) = Command::new("git")
        .current_dir(repo_path)
        .args(["remote"])
        .output()
    {
        let stdout = String::from_utf8_lossy(&output.stdout);
        stdout.contains("origin")
    } else {
        false
    }
}

// UPGRADE 1: Get Remote URL for prefill
#[tauri::command]
fn get_remote_url(repo_path: String) -> Result<String, String> {
    let output = Command::new("git")
        .current_dir(&repo_path)
        .args(["config", "--get", "remote.origin.url"])
        .output()
        .map_err(|e| e.to_string())?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        Ok("".to_string())
    }
}

#[tauri::command]
fn init_repository(repo_path: String) -> Result<String, String> {
    let git_dir = Path::new(&repo_path).join(".git");
    if git_dir.exists() {
        return Err("This folder is already a Git repository.".to_string());
    }
    let output = Command::new("git")
        .current_dir(&repo_path)
        .args(["init"])
        .output()
        .map_err(|e| format!("Failed to init: {}", e))?;
    if output.status.success() {
        Command::new("git")
            .current_dir(&repo_path)
            .args(["commit", "--allow-empty", "-m", "Initial commit"])
            .output()
            .ok();
        Ok(String::from_utf8_lossy(&output.stdout).into_owned())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).into_owned())
    }
}
#[tauri::command]
fn link_remote(repo_path: String, url: String) -> Result<String, String> {
    let output = Command::new("git")
        .current_dir(&repo_path)
        .args(["remote", "add", "origin", &url])
        .output()
        .map_err(|e| format!("Failed: {}", e))?;
    if output.status.success() {
        Ok(format!("Successfully linked origin to {}", url))
    } else {
        Err(String::from_utf8_lossy(&output.stderr).into_owned())
    }
}
#[tauri::command]
fn get_current_branch(repo_path: String) -> Result<String, String> {
    let output = Command::new("git")
        .current_dir(&repo_path)
        .args(["rev-parse", "--abbrev-ref", "HEAD"])
        .output()
        .map_err(|e| format!("Failed: {}", e))?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}
#[tauri::command]
fn get_branches(repo_path: String) -> Result<Vec<String>, String> {
    let output = Command::new("git")
        .current_dir(&repo_path)
        .args(["branch", "--format=%(refname:short)"])
        .output()
        .map_err(|e| e.to_string())?;
    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        let branches = stdout
            .lines()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();
        Ok(branches)
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}
#[tauri::command]
fn switch_branch(repo_path: String, branch_name: String) -> Result<String, String> {
    let output = Command::new("git")
        .current_dir(&repo_path)
        .args(["checkout", &branch_name])
        .output()
        .map_err(|e| format!("Failed: {}", e))?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stderr).trim().to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}
#[tauri::command]
fn start_feature(repo_path: String, branch_name: String) -> Result<String, String> {
    let mut log = String::new();
    let checkout = Command::new("git")
        .current_dir(&repo_path)
        .args(["checkout", "-b", &branch_name])
        .output()
        .map_err(|e| format!("Failed checkout: {}", e))?;
    if !checkout.status.success() {
        return Err(String::from_utf8_lossy(&checkout.stderr).into_owned());
    }
    log.push_str(&String::from_utf8_lossy(&checkout.stderr));
    if has_remote_origin(&repo_path) {
        let push = Command::new("git")
            .current_dir(&repo_path)
            .args(["push", "-u", "origin", &branch_name])
            .output()
            .map_err(|e| format!("Failed push: {}", e))?;
        if push.status.success() {
            log.push_str("\nBranch pushed to origin.");
        } else {
            log.push_str("\n(Branch created locally. Could not push to origin.)");
        }
    } else {
        log.push_str("\n(Local mode: Branch created locally. Link to GitHub to sync).");
    }
    Ok(log)
}
#[tauri::command]
fn view_history(repo_path: String) -> Result<String, String> {
    let format_str = "--pretty=format:[==COMMIT==]%H|--|%h|--|%an|--|%ad|--|%ar|--|%s|--|%b";
    let output = Command::new("git")
        .current_dir(&repo_path)
        .args(["log", format_str])
        .output()
        .map_err(|e| format!("Failed: {}", e))?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}
#[tauri::command]
fn get_repo_files(repo_path: String) -> Result<Vec<String>, String> {
    let output = Command::new("git")
        .current_dir(&repo_path)
        .args(["ls-files"])
        .output()
        .map_err(|e| e.to_string())?;
    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        let files = stdout
            .lines()
            .map(|s| s.to_string())
            .filter(|s| !s.is_empty())
            .collect();
        Ok(files)
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}
#[tauri::command]
fn check_git_status(repo_path: String) -> Result<String, String> {
    let output = Command::new("git")
        .current_dir(&repo_path)
        .args(["status", "--porcelain"])
        .output()
        .map_err(|e| format!("Failed: {}", e))?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}
#[tauri::command]
fn clean_and_stage(repo_path: String) -> Result<u32, String> {
    let deleted_count = delete_bak_files(Path::new(&repo_path));
    let add_output = Command::new("git")
        .current_dir(&repo_path)
        .args(["add", "."])
        .output()
        .map_err(|e| format!("Failed to run git add: {}", e))?;
    if !add_output.status.success() {
        return Err(String::from_utf8_lossy(&add_output.stderr).to_string());
    }
    Ok(deleted_count)
}
#[tauri::command]
fn run_raw_command(repo_path: String, cmd_string: String) -> Result<String, String> {
    let parts: Vec<&str> = cmd_string.split_whitespace().collect();
    if parts.is_empty() {
        return Err("Empty command".to_string());
    }
    let output = Command::new(parts[0])
        .current_dir(&repo_path)
        .args(&parts[1..])
        .output()
        .map_err(|e| e.to_string())?;
    let mut result = String::from_utf8_lossy(&output.stdout).into_owned();
    if !output.status.success() {
        result.push_str(&String::from_utf8_lossy(&output.stderr));
        return Err(result);
    }
    Ok(result)
}
#[tauri::command]
fn run_build(repo_path: String) -> Result<String, String> {
    let pkg_path = Path::new(&repo_path).join("package.json");
    if !pkg_path.exists() {
        return Err("No package.json found in this repository.".to_string());
    }
    let output = Command::new("npm")
        .current_dir(&repo_path)
        .args(["run", "build"])
        .output()
        .map_err(|e| format!("Failed to spawn npm: {}", e))?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).into_owned())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).into_owned())
    }
}
#[tauri::command]
fn perform_quick_commit(
    window: tauri::Window,
    repo_path: String,
    message: String,
) -> Result<String, String> {
    let mut log = String::new();
    let _ = window.emit("commit-progress", "🧹 Scanning for .bak* files...");
    let deleted_count = delete_bak_files(Path::new(&repo_path));
    if deleted_count > 0 {
        log.push_str(&format!(
            "🧹 System recursively purged {} .bak* file(s).\n",
            deleted_count
        ));
    }
    let _ = window.emit("commit-progress", "📦 Staging files (git add .)...");
    let add_output = Command::new("git")
        .current_dir(&repo_path)
        .args(["add", "."])
        .output()
        .map_err(|e| format!("Failed add: {}", e))?;
    if !add_output.status.success() {
        return Err(String::from_utf8_lossy(&add_output.stderr).to_string());
    }
    let _ = window.emit("commit-progress", "📝 Writing commit message...");
    let commit_output = Command::new("git")
        .current_dir(&repo_path)
        .args(["commit", "-m", &message])
        .output()
        .map_err(|e| format!("Failed commit: {}", e))?;
    log.push_str(&String::from_utf8_lossy(&commit_output.stdout).into_owned());
    if !has_remote_origin(&repo_path) {
        let _ = window.emit(
            "commit-progress",
            "✅ Committed Locally (No Remote Origin detected).",
        );
        log.push_str("\n\n-- Local Mode: Commit Successful. Link to GitHub to sync. --\n");
        return Ok(log);
    }
    let _ = window.emit("commit-progress", "🚀 Pushing to remote origin...");
    let mut push_cmd = Command::new("git")
        .current_dir(&repo_path)
        .args(["push"])
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn git push: {}", e))?;
    if let Some(stderr) = push_cmd.stderr.take() {
        let reader = BufReader::new(stderr);
        for line in reader.lines().flatten() {
            let _ = window.emit("commit-progress", format!("Pushing: {}", line));
            log.push_str(&format!("{}\n", line));
        }
    }
    let push_status = push_cmd.wait().map_err(|e| e.to_string())?;
    if push_status.success() {
        Ok(log)
    } else {
        let _ = window.emit(
            "commit-progress",
            "⚠️ Push Rejected! Attempting 'pull --rebase'...",
        );
        log.push_str("\n\n-- Push Rejected! Attempting 'pull --rebase'... --\n");
        let pull_output = Command::new("git")
            .current_dir(&repo_path)
            .args(["pull", "--rebase"])
            .output()
            .map_err(|e| format!("Failed pull: {}", e))?;
        if !pull_output.status.success() {
            let _ = window.emit(
                "commit-progress",
                "❌ Pull Rebase Failed! Resolve in VS Code.",
            );
            log.push_str("\n\n[ CRITICAL ERROR ]: Pull Rebase Failed! Please resolve conflicts manually in VS Code.\n");
            log.push_str(&String::from_utf8_lossy(&pull_output.stderr));
            return Err(log);
        }
        let _ = window.emit("commit-progress", "🔄 Rebase Successful. Retrying Push...");
        log.push_str("\n-- Pull Rebase Successful. Retrying Push... --\n");
        let mut push2_cmd = Command::new("git")
            .current_dir(&repo_path)
            .args(["push"])
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| e.to_string())?;
        if let Some(stderr2) = push2_cmd.stderr.take() {
            let reader2 = BufReader::new(stderr2);
            for line in reader2.lines().flatten() {
                let _ = window.emit("commit-progress", format!("Retry Push: {}", line));
                log.push_str(&format!("{}\n", line));
            }
        }
        let push2_status = push2_cmd.wait().map_err(|e| e.to_string())?;
        if push2_status.success() {
            Ok(log)
        } else {
            Err(log)
        }
    }
}

#[tauri::command]
fn start_time_machine(repo_path: String, hash: String) -> Result<String, String> {
    Command::new("git")
        .current_dir(&repo_path)
        .args(["branch", "-D", "neon-time-machine"])
        .output()
        .ok();
    let output = Command::new("git")
        .current_dir(&repo_path)
        .args(["checkout", "-b", "neon-time-machine", &hash])
        .output()
        .map_err(|e| e.to_string())?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stderr).into_owned())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).into_owned())
    }
}
#[tauri::command]
fn return_to_present(repo_path: String, original_branch: String) -> Result<String, String> {
    let mut log = String::new();
    let checkout = Command::new("git")
        .current_dir(&repo_path)
        .args(["checkout", &original_branch])
        .output()
        .map_err(|e| e.to_string())?;
    if !checkout.status.success() {
        return Err(String::from_utf8_lossy(&checkout.stderr).into_owned());
    }
    log.push_str(&String::from_utf8_lossy(&checkout.stderr));
    Command::new("git")
        .current_dir(&repo_path)
        .args(["branch", "-D", "neon-time-machine"])
        .output()
        .ok();
    Ok(log)
}

#[tauri::command]
fn safe_rollback(repo_path: String, original_branch: String) -> Result<String, String> {
    let mut log = String::new();
    let hash_output = Command::new("git")
        .current_dir(&repo_path)
        .args(["rev-parse", "HEAD"])
        .output()
        .map_err(|e| e.to_string())?;
    let target_hash = String::from_utf8_lossy(&hash_output.stdout)
        .trim()
        .to_string();
    let checkout = Command::new("git")
        .current_dir(&repo_path)
        .args(["checkout", &original_branch])
        .output()
        .map_err(|e| e.to_string())?;
    if !checkout.status.success() {
        return Err(String::from_utf8_lossy(&checkout.stderr).into_owned());
    }
    let head_output = Command::new("git")
        .current_dir(&repo_path)
        .args(["rev-parse", "HEAD"])
        .output()
        .map_err(|e| e.to_string())?;
    let original_head = String::from_utf8_lossy(&head_output.stdout)
        .trim()
        .to_string();
    let hard_reset = Command::new("git")
        .current_dir(&repo_path)
        .args(["reset", "--hard", &target_hash])
        .output()
        .map_err(|e| e.to_string())?;
    if !hard_reset.status.success() {
        return Err(String::from_utf8_lossy(&hard_reset.stderr).into_owned());
    }
    let soft_reset = Command::new("git")
        .current_dir(&repo_path)
        .args(["reset", "--soft", &original_head])
        .output()
        .map_err(|e| e.to_string())?;
    if !soft_reset.status.success() {
        return Err(String::from_utf8_lossy(&soft_reset.stderr).into_owned());
    }
    let msg = format!("chore: safe rollback to {}", &target_hash[0..7]);
    let commit = Command::new("git")
        .current_dir(&repo_path)
        .args(["commit", "-m", &msg])
        .output()
        .map_err(|e| e.to_string())?;
    if !commit.status.success() {
        log.push_str("Working tree is identical to target state. Nothing to commit.\n");
    } else {
        log.push_str(&String::from_utf8_lossy(&commit.stdout));
    }
    if has_remote_origin(&repo_path) {
        let push = Command::new("git")
            .current_dir(&repo_path)
            .args(["push"])
            .output()
            .map_err(|e| e.to_string())?;
        if !push.status.success() {
            return Err(String::from_utf8_lossy(&push.stderr).into_owned());
        }
        log.push_str("\nRollback pushed to cloud successfully.");
    } else {
        log.push_str("\nRollback committed locally.");
    }
    Command::new("git")
        .current_dir(&repo_path)
        .args(["branch", "-D", "neon-time-machine"])
        .output()
        .ok();
    Ok(log)
}

// UPGRADE 2: Strict Exact Match Array Check for Merge target branch
#[tauri::command]
fn perform_merge(
    window: tauri::Window,
    repo_path: String,
    feature_branch: String,
) -> Result<String, String> {
    let mut log = String::new();
    let _ = window.emit("merge-progress", "🔍 Detecting primary branch...");

    let branch_output = Command::new("git")
        .current_dir(&repo_path)
        .args(["branch", "--format=%(refname:short)"])
        .output()
        .map_err(|e| e.to_string())?;
    let branches_str = String::from_utf8_lossy(&branch_output.stdout);
    let branch_lines: Vec<&str> = branches_str.lines().map(|s| s.trim()).collect();

    let target_branch = if branch_lines.contains(&"main") {
        "main"
    } else if branch_lines.contains(&"master") {
        "master"
    } else {
        "main" // Final fallback, though highly unlikely to hit
    };

    let _ = window.emit(
        "merge-progress",
        format!("🔄 Switching to {}...", target_branch),
    );
    let checkout_res = Command::new("git")
        .current_dir(&repo_path)
        .args(["checkout", target_branch])
        .output()
        .map_err(|e| e.to_string())?;
    if !checkout_res.status.success() {
        return Err(String::from_utf8_lossy(&checkout_res.stderr).to_string());
    }
    log.push_str(&format!("Switched to {}\n", target_branch));

    if has_remote_origin(&repo_path) {
        let _ = window.emit(
            "merge-progress",
            format!("⬇️ Pulling latest {} from origin...", target_branch),
        );
        let pull_res = Command::new("git")
            .current_dir(&repo_path)
            .args(["pull", "origin", target_branch])
            .output()
            .map_err(|e| e.to_string())?;
        if !pull_res.status.success() {
            return Err(String::from_utf8_lossy(&pull_res.stderr).to_string());
        }
        log.push_str("Pulled latest changes.\n");
    } else {
        log.push_str("(Local mode: Skipping pull).\n");
    }

    let _ = window.emit(
        "merge-progress",
        format!("🔀 Merging {}...", feature_branch),
    );
    let merge_res = Command::new("git")
        .current_dir(&repo_path)
        .args(["merge", &feature_branch])
        .output()
        .map_err(|e| e.to_string())?;
    if !merge_res.status.success() {
        return Err(format!(
            "MERGE CONFLICT!\n{}",
            String::from_utf8_lossy(&merge_res.stdout)
        ));
    }
    log.push_str(&String::from_utf8_lossy(&merge_res.stdout));

    if has_remote_origin(&repo_path) {
        let _ = window.emit("merge-progress", "🚀 Pushing merge to origin...");
        let mut push_cmd = Command::new("git")
            .current_dir(&repo_path)
            .args(["push", "origin", target_branch])
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| e.to_string())?;
        if let Some(stderr) = push_cmd.stderr.take() {
            let reader = BufReader::new(stderr);
            for line in reader.lines().flatten() {
                let _ = window.emit("merge-progress", format!("Pushing: {}", line));
                log.push_str(&format!("{}\n", line));
            }
        }
        let push_status = push_cmd.wait().map_err(|e| e.to_string())?;
        if push_status.success() {
            Ok(log)
        } else {
            Err("Push failed after merge.".into())
        }
    } else {
        log.push_str("\n(Local mode: Merge Successful. Link to GitHub to sync).");
        Ok(log)
    }
}

#[tauri::command]
fn hard_reset(repo_path: String) -> Result<String, String> {
    let output = Command::new("git")
        .current_dir(&repo_path)
        .args(["reset", "--hard", "HEAD"])
        .output()
        .map_err(|e| format!("Failed: {}", e))?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}
#[tauri::command]
fn delete_branch(repo_path: String, branch_name: String) -> Result<String, String> {
    let output = Command::new("git")
        .current_dir(&repo_path)
        .args(["branch", "-D", &branch_name])
        .output()
        .map_err(|e| format!("Failed: {}", e))?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            init_repository,
            link_remote,
            get_remote_url,
            get_current_branch,
            get_branches,
            switch_branch,
            start_feature,
            view_history,
            get_repo_files,
            run_build,
            check_git_status,
            perform_quick_commit,
            clean_and_stage,
            run_raw_command,
            start_time_machine,
            return_to_present,
            safe_rollback,
            hard_reset,
            delete_branch,
            perform_merge
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
