#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use std::fs;
use std::path::Path;
use std::process::Command;

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

// NEW: Start Feature (git checkout -b <name>)
#[tauri::command]
fn start_feature(repo_path: String, branch_name: String) -> Result<String, String> {
    let output = Command::new("git")
        .current_dir(&repo_path)
        .args(["checkout", "-b", &branch_name])
        .output()
        .map_err(|e| format!("Failed: {}", e))?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stderr).trim().to_string())
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
fn perform_quick_commit(repo_path: String, message: String) -> Result<String, String> {
    let mut log = String::new();
    let deleted_count = delete_bak_files(Path::new(&repo_path));
    if deleted_count > 0 {
        log.push_str(&format!(
            "🧹 System recursively purged {} .bak* file(s).\n",
            deleted_count
        ));
    } else {
        log.push_str("🧹 No .bak files found to purge.\n");
    }
    let add_output = Command::new("git")
        .current_dir(&repo_path)
        .args(["add", "."])
        .output()
        .map_err(|e| format!("Failed add: {}", e))?;
    if !add_output.status.success() {
        return Err(String::from_utf8_lossy(&add_output.stderr).to_string());
    }
    let commit_output = Command::new("git")
        .current_dir(&repo_path)
        .args(["commit", "-m", &message])
        .output()
        .map_err(|e| format!("Failed commit: {}", e))?;
    log.push_str(&String::from_utf8_lossy(&commit_output.stdout).into_owned());
    let push_output = Command::new("git")
        .current_dir(&repo_path)
        .args(["push"])
        .output()
        .map_err(|e| format!("Failed push: {}", e))?;
    if push_output.status.success() {
        log.push_str("\n\n-- Push Successful --\n");
        log.push_str(&String::from_utf8_lossy(&push_output.stderr));
        Ok(log)
    } else {
        log.push_str("\n\n-- Push Rejected! Attempting 'pull --rebase'... --\n");
        let pull_output = Command::new("git")
            .current_dir(&repo_path)
            .args(["pull", "--rebase"])
            .output()
            .map_err(|e| format!("Failed pull: {}", e))?;
        if !pull_output.status.success() {
            log.push_str("\n\n[ CRITICAL ERROR ]: Pull Rebase Failed! Please resolve conflicts manually in VS Code.\n");
            log.push_str(&String::from_utf8_lossy(&pull_output.stderr));
            return Err(log);
        }
        log.push_str("\n-- Pull Rebase Successful. Retrying Push... --\n");
        let push2_output = Command::new("git")
            .current_dir(&repo_path)
            .args(["push"])
            .output()
            .map_err(|e| format!("Failed retry push: {}", e))?;
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
            get_branches,
            switch_branch,
            start_feature,
            view_history,
            get_repo_files,
            check_git_status,
            perform_quick_commit
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
