const { invoke } = window.__TAURI__.core;
const { open } = window.__TAURI__.dialog;

let repoList = JSON.parse(localStorage.getItem("neon-git-repos") || "[]");
let activeRepo = localStorage.getItem("neon-git-active") || "";

const legacyRepo = localStorage.getItem("neon-git-repo");
if (legacyRepo && !activeRepo) {
  activeRepo = legacyRepo; repoList = [legacyRepo]; localStorage.removeItem("neon-git-repo"); saveRepoData();
}

let branchEl, repoDropdownEl, outputConsole, historyBtn, commitBtn;
let commitModal, closeModalBtn, cancelModalBtn, commitForm;

function saveRepoData() {
  localStorage.setItem("neon-git-repos", JSON.stringify(repoList));
  localStorage.setItem("neon-git-active", activeRepo);
}

function printToConsole(text) { outputConsole.textContent = text; }

function renderDropdown() {
  repoDropdownEl.innerHTML = '<option value="">-- None Selected --</option>';
  repoList.forEach(repoPath => {
    const opt = document.createElement("option"); opt.value = repoPath; opt.textContent = repoPath.split('/').pop();
    if (repoPath === activeRepo) opt.selected = true;
    repoDropdownEl.appendChild(opt);
  });
}

function updateUIState() {
  renderDropdown();
  if (activeRepo) {
    historyBtn.disabled = false; commitBtn.disabled = false;
    printToConsole(`System anchored to: ${activeRepo}\nReady for commands.`); fetchBranch();
  } else {
    branchEl.textContent = "--"; historyBtn.disabled = true; commitBtn.disabled = true;
    printToConsole("Please select or add a Git repository.");
  }
}

async function selectRepository() {
  try {
    const selectedPath = await open({ directory: true, multiple: false });
    if (selectedPath) {
      if (!repoList.includes(selectedPath)) repoList.push(selectedPath);
      activeRepo = selectedPath; saveRepoData(); updateUIState();
    }
  } catch (err) { console.error(err); printToConsole(`Failed to open dialog: ${err}`); }
}

function handleRepoSwitch(event) {
  activeRepo = event.target.value; saveRepoData(); updateUIState();
}

async function fetchBranch() {
  if (!activeRepo) return;
  try {
    const branchName = await invoke("get_current_branch", { repoPath: activeRepo });
    branchEl.textContent = branchName;
  } catch (error) {
    console.error("Failed to get branch:", error); branchEl.textContent = "Not a Repo"; printToConsole(`Error: Folder is not a valid Git repository.\n${error}`);
  }
}

async function viewHistory() {
  if (!activeRepo) return; printToConsole("Fetching history...");
  try { const history = await invoke("view_history", { repoPath: activeRepo }); printToConsole(history || "No history found."); }
  catch (error) { printToConsole(`ERROR:\n${error}`); }
}

// === NEW: QUICK COMMIT MODAL LOGIC ===

async function openQuickCommitModal() {
  if (!activeRepo) return;
  printToConsole("Verifying Git working tree...");
  try {
    // Rust Gatekeeper: Check for modified files
    const status = await invoke("check_git_status", { repoPath: activeRepo });
    if (!status) {
      printToConsole("Working tree clean. Nothing to commit!");
      return;
    }
    // Files changed! Open the modal.
    printToConsole(`Changes detected:\n${status}\n\nAwaiting commit details...`);
    commitModal.classList.add("active");
    document.querySelector('#commit-summary').focus();
  } catch (error) {
    printToConsole(`ERROR checking status:\n${error}`);
  }
}

function closeCommitModal() {
  commitModal.classList.remove("active");
  commitForm.reset();
}

async function handleQuickCommit(e) {
  e.preventDefault();
  const type = document.querySelector('input[name="commit-type"]:checked').value;
  const summary = document.querySelector('#commit-summary').value;
  const details = document.querySelector('#commit-details').value;

  // Format the commit message exactly like your python script
  const fullMessage = details ? `${type}: ${summary}\n\n${details}` : `${type}: ${summary}`;

  closeCommitModal();
  printToConsole(`Initiating Quick Commit & Push...\nMessage: [${type}: ${summary}]\n\nProcessing on engine... please wait...`);

  try {
    const result = await invoke("perform_quick_commit", { repoPath: activeRepo, message: fullMessage });
    printToConsole(`✅ COMPLETED\n\n${result}`);
    fetchBranch(); // refresh branch just in case
  } catch (error) {
    printToConsole(`❌ FAILED\n\n${error}`);
  }
}

// =====================================

window.addEventListener("DOMContentLoaded", () => {
  branchEl = document.querySelector("#current-branch"); repoDropdownEl = document.querySelector("#repo-dropdown"); outputConsole = document.querySelector("#output-console"); historyBtn = document.querySelector("#btn-history");
  commitBtn = document.querySelector("#btn-commit");
  commitModal = document.querySelector("#quick-commit-modal"); closeModalBtn = document.querySelector("#btn-close-modal"); cancelModalBtn = document.querySelector("#btn-cancel-modal"); commitForm = document.querySelector("#quick-commit-form");

  document.querySelector("#btn-select-repo").addEventListener("click", selectRepository); repoDropdownEl.addEventListener("change", handleRepoSwitch);
  historyBtn.addEventListener("click", viewHistory);

  // Wire up the new Modal buttons
  commitBtn.addEventListener("click", openQuickCommitModal);
  closeModalBtn.addEventListener("click", closeCommitModal);
  cancelModalBtn.addEventListener("click", closeCommitModal);
  commitForm.addEventListener("submit", handleQuickCommit);

  updateUIState();
});