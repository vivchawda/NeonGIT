#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::Command;

#[tauri::command]
fn get_current_branch(repo_path: String) -> Result<String, String> {
    let output = Command::new("git")
        .current_dir(&repo_path)
        .args(["rev-parse", "--abbrev-ref", "HEAD"])
        .output()
        .map_err(|e| format!("Failed to execute process: {}", e))?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

#[tauri::command]
fn view_history(repo_path: String) -> Result<String, String> {
    let output = Command::new("git")
        .current_dir(&repo_path)
        .args(["log", "-n", "5", "--oneline", "--decorate"])
        .output()
        .map_err(|e| format!("Failed to execute process: {}", e))?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

// NEW: GATEKEEPER - Checks if git has modified files
#[tauri::command]
fn check_git_status(repo_path: String) -> Result<String, String> {
    let output = Command::new("git")
        .current_dir(&repo_path)
        .args(["status", "--porcelain"])
        .output()
        .map_err(|e| format!("Failed to execute git status: {}", e))?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

// NEW: THE ENGINE - Add, Commit, Push, (fallback: Pull Rebase)
#[tauri::command]
fn perform_quick_commit(repo_path: String, message: String) -> Result<String, String> {
    // 1. git add .
    let add_output = Command::new("git")
        .current_dir(&repo_path)
        .args(["add", "."])
        .output()
        .map_err(|e| format!("Failed to run git add: {}", e))?;
    if !add_output.status.success() {
        return Err(String::from_utf8_lossy(&add_output.stderr).to_string());
    }

    // 2. git commit -m "..."
    let commit_output = Command::new("git")
        .current_dir(&repo_path)
        .args(["commit", "-m", &message])
        .output()
        .map_err(|e| format!("Failed to run git commit: {}", e))?;
    let mut log = String::from_utf8_lossy(&commit_output.stdout).into_owned();

    // 3. git push
    let push_output = Command::new("git")
        .current_dir(&repo_path)
        .args(["push"])
        .output()
        .map_err(|e| format!("Failed to run git push: {}", e))?;

    if push_output.status.success() {
        log.push_str("\n\n-- Push Successful --\n");
        log.push_str(&String::from_utf8_lossy(&push_output.stderr)); // git push outputs to stderr even on success
        Ok(log)
    } else {
        // Push failed! Replicate python fallback logic: Attempt pull --rebase
        log.push_str("\n\n-- Push Rejected! Attempting 'pull --rebase'... --\n");
        let pull_output = Command::new("git")
            .current_dir(&repo_path)
            .args(["pull", "--rebase"])
            .output()
            .map_err(|e| format!("Failed to run git pull: {}", e))?;

        if !pull_output.status.success() {
            log.push_str("\n\n[ CRITICAL ERROR ]: Pull Rebase Failed! Please resolve conflicts manually in VS Code.\n");
            log.push_str(&String::from_utf8_lossy(&pull_output.stderr));
            return Err(log);
        }

        log.push_str("\n-- Pull Rebase Successful. Retrying Push... --\n");

        // Retry push
        let push2_output = Command::new("git")
            .current_dir(&repo_path)
            .args(["push"])
            .output()
            .map_err(|e| format!("Failed to retry git push: {}", e))?;

        if push2_output.status.success() {
            log.push_str("\n-- Retry Push Successful! --\n");
            log.push_str(&String::from_utf8_lossy(&push2_output.stderr));
            Ok(log)
        } else {
            log.push_str("\n[ CRITICAL ERROR ]: Second Push Failed:\n");
            log.push_str(&String::from_utf8_lossy(&push2_output.stderr));
            Err(log)
        }
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            get_current_branch,
            view_history,
            check_git_status,
            perform_quick_commit
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
