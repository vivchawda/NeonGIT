const { invoke } = window.__TAURI__.core;
const { open } = window.__TAURI__.dialog;
const { getCurrentWindow } = window.__TAURI__.window;
const { listen } = window.__TAURI__.event; // UPGRADE: Event Listener for real-time logs

let repoList = JSON.parse(localStorage.getItem("neon-git-repos") || "[]");
let activeRepo = localStorage.getItem("neon-git-active") || "";

let branchDropdownEl, repoDropdownEl, outputConsole, historyBtn, commitBtn, viewerBtn, featureBtn;
let commitModal, closeModalBtn, cancelModalBtn, commitForm, commitFormButtons;
let progressFooter, progressText, progressBar, progressDoneBtn;
let featureModal, closeFeatureBtn, cancelFeatureBtn, featureForm, featureInput;
let viewerModal, closeViewerBtn, viewerList, aboutModal, openAboutBtn, closeAboutBtn;
let footerText, footerDot, loadingSpinner;

function saveRepoData() { localStorage.setItem("neon-git-repos", JSON.stringify(repoList)); localStorage.setItem("neon-git-active", activeRepo); }
function printToConsole(text) { outputConsole.textContent = text; outputConsole.scrollTop = outputConsole.scrollHeight; }

function setUILocked(isLocked, statusMessage = "System Idle") {
  document.querySelectorAll('.main .btn, .topbar button, .topbar select').forEach(btn => {
    if (btn.classList.contains('active') || btn.tagName === 'SELECT' || btn.id === 'btn-select-repo' || btn.id === 'btn-open-about') {
      btn.disabled = isLocked;
    }
  });
  loadingSpinner.style.display = isLocked ? 'block' : 'none';
  footerText.textContent = statusMessage;
  footerDot.style.background = isLocked ? 'var(--a4)' : 'var(--td)';
  footerDot.style.boxShadow = isLocked ? '0 0 8px var(--a4)' : 'none';
}

function renderRepoDropdown() {
  repoDropdownEl.innerHTML = '<option value="">-- None Selected --</option>';
  repoList.forEach(repoPath => {
    const opt = document.createElement("option"); opt.value = repoPath; opt.textContent = repoPath.split('/').pop();
    if (repoPath === activeRepo) opt.selected = true; repoDropdownEl.appendChild(opt);
  });
}

async function updateUIState() {
  renderRepoDropdown(); const appWindow = getCurrentWindow();
  if (activeRepo) {
    const repoName = activeRepo.split('/').pop(); const newTitle = `Neon GIT Manager - [${repoName}]`; document.title = newTitle;
    try { await appWindow.setTitle(newTitle); } catch (err) { }
    historyBtn.disabled = false; commitBtn.disabled = false; viewerBtn.disabled = false; featureBtn.disabled = false;
    printToConsole(`System anchored to: ${activeRepo}\nReady for commands.`); fetchBranches();
  } else {
    document.title = "Neon GIT Manager"; try { await appWindow.setTitle("Neon GIT Manager"); } catch (err) { }
    branchDropdownEl.innerHTML = '<option value="">--</option>';
    historyBtn.disabled = true; commitBtn.disabled = true; viewerBtn.disabled = true; featureBtn.disabled = true;
    printToConsole("Please select or add a Git repository using the + button top right.");
  }
}

async function selectRepository() {
  try { const selectedPath = await open({ directory: true, multiple: false }); if (selectedPath) { if (!repoList.includes(selectedPath)) repoList.push(selectedPath); activeRepo = selectedPath; saveRepoData(); updateUIState(); } }
  catch (err) { printToConsole(`Failed to open dialog: ${err}`); }
}
function handleRepoSwitch(event) { activeRepo = event.target.value; saveRepoData(); updateUIState(); }

async function fetchBranches() {
  if (!activeRepo) return; setUILocked(true, "Fetching branches...");
  try {
    const currentBranch = await invoke("get_current_branch", { repoPath: activeRepo });
    const allBranches = await invoke("get_branches", { repoPath: activeRepo });
    branchDropdownEl.innerHTML = '';
    allBranches.forEach(b => {
      const opt = document.createElement("option"); opt.value = b; opt.textContent = b;
      if (b === currentBranch) opt.selected = true; branchDropdownEl.appendChild(opt);
    });
  } catch (error) { printToConsole(`Error fetching branches: ${error}`); }
  setUILocked(false);
}

async function handleBranchSwitch(event) {
  const targetBranch = event.target.value; if (!activeRepo || !targetBranch) return;
  setUILocked(true, `Switching to branch: ${targetBranch}...`); printToConsole(`Checking out branch: ${targetBranch}...`);
  try { const result = await invoke("switch_branch", { repoPath: activeRepo, branchName: targetBranch }); printToConsole(`✅ Success:\n${result}`); }
  catch (error) { printToConsole(`❌ Failed to switch branch:\n${error}`); fetchBranches(); }
  setUILocked(false);
}

function openFeatureModal() { if (!activeRepo) return; featureModal.classList.add("active"); featureInput.focus(); }
function closeFeatureModal() { featureModal.classList.remove("active"); featureForm.reset(); }
async function handleStartFeature(e) {
  e.preventDefault(); let rawName = featureInput.value.trim().toLowerCase(); rawName = rawName.replace(/\s+/g, '-');
  if (!rawName.startsWith('feat/') && !rawName.startsWith('fix/') && !rawName.startsWith('chore/')) { rawName = `feat/${rawName}`; }
  closeFeatureModal(); setUILocked(true, `Creating branch: ${rawName}...`); printToConsole(`🚀 Creating and switching to branch: ${rawName}`);
  try { const result = await invoke("start_feature", { repoPath: activeRepo, branchName: rawName }); printToConsole(`✅ Success:\n${result}\n\nYou are now on branch: [${rawName}]`); fetchBranches(); }
  catch (error) { printToConsole(`❌ FAILED to create branch:\n${error}`); }
  setUILocked(false);
}

function buildTree(paths) { const root = {}; paths.forEach(path => { const parts = path.split('/'); let current = root; parts.forEach((part, i) => { if (!current[part]) { current[part] = (i === parts.length - 1) ? null : {}; } current = current[part]; }); }); return root; }
function renderTreeHTML(node) { let html = ''; const entries = Object.entries(node).sort((a, b) => { if (a[1] !== null && b[1] === null) return -1; if (a[1] === null && b[1] !== null) return 1; return a[0].localeCompare(b[0]); }); for (const [name, children] of entries) { if (children === null) { html += `<div class="file-item tree-file"><span>${name}</span></div>`; } else { html += `<div><div class="file-item tree-folder" onclick="this.classList.toggle('open'); this.nextElementSibling.classList.toggle('open')"><span>${name}</span></div><div class="tree-children">${renderTreeHTML(children)}</div></div>`; } } return html; }
async function openRepoViewer() { if (!activeRepo) return; setUILocked(true, "Building Folder Tree..."); try { const filesArray = await invoke("get_repo_files", { repoPath: activeRepo }); const fileTree = buildTree(filesArray); viewerList.innerHTML = renderTreeHTML(fileTree); viewerModal.classList.add("active"); printToConsole(`📂 Rendered tree for ${filesArray.length} tracked files.`); } catch (error) { printToConsole(`ERROR reading files:\n${error}`); } setUILocked(false); }
async function viewHistory() { if (!activeRepo) return; setUILocked(true, "Fetching history..."); try { const history = await invoke("view_history", { repoPath: activeRepo }); printToConsole(history || "No history found."); } catch (error) { printToConsole(`ERROR:\n${error}`); } setUILocked(false); }

// === UPGRADED: QUICK COMMIT WITH PROGRESS STREAMING ===
async function openQuickCommitModal() {
  if (!activeRepo) return; setUILocked(true, "Verifying Git tree...");
  try {
    const status = await invoke("check_git_status", { repoPath: activeRepo });
    if (!status) { printToConsole("Working tree clean. Nothing to commit!"); setUILocked(false); return; }
    printToConsole(`Changes detected:\n${status}\n\nAwaiting commit details...`);
    commitModal.classList.add("active");

    // Reset Modal UI to pristine state
    commitFormButtons.style.display = "flex";
    progressFooter.style.display = "none";
    progressBar.classList.add("dbf-anim");
    progressBar.style.width = "50%";
    progressDoneBtn.style.display = "none";
    progressText.style.color = "var(--a2)";

    document.querySelector('#commit-summary').focus();
    footerText.textContent = "Awaiting Quick Commit input...";
  } catch (error) { printToConsole(`ERROR checking status:\n${error}`); setUILocked(false); }
}

function closeCommitModal() { commitModal.classList.remove("active"); commitForm.reset(); setUILocked(false); }

async function handleQuickCommit(e) {
  e.preventDefault();
  const type = document.querySelector('input[name="commit-type"]:checked').value;
  const summary = document.querySelector('#commit-summary').value;
  const details = document.querySelector('#commit-details').value;
  const fullMessage = details ? `${type}: ${summary}\n\n${details}` : `${type}: ${summary}`;

  // Switch Modal UI to "Processing" state
  commitFormButtons.style.display = "none";
  progressFooter.style.display = "flex";
  progressText.textContent = "Starting engine...";
  closeModalBtn.style.display = "none"; // Hide X button while processing

  setUILocked(true, "Running Quick Commit workflow...");

  // Setup Listener to catch real-time strings from Rust!
  const unlisten = await listen('commit-progress', (event) => {
    progressText.textContent = event.payload;
    printToConsole(`> ${event.payload}`); // Also stream to main console
  });

  try {
    const result = await invoke("perform_quick_commit", { repoPath: activeRepo, message: fullMessage });
    // Success State
    progressText.textContent = "✅ Commit and Push Successful!";
    progressText.style.color = "#4ade80";
    progressBar.classList.remove("dbf-anim");
    progressBar.style.width = "100%";
    progressDoneBtn.style.display = "block";
    printToConsole(`\n-- OPERATION COMPLETE --\n${result}`);
  } catch (error) {
    // Error State
    progressText.textContent = "❌ Error. See console.";
    progressText.style.color = "var(--a3)";
    progressBar.classList.remove("dbf-anim");
    progressBar.style.width = "100%";
    progressBar.style.background = "var(--a3)";
    progressDoneBtn.style.display = "block";
    printToConsole(`\n[ CRITICAL FAILURE ]\n${error}`);
  }

  // Cleanup
  unlisten();
  setUILocked(false);
  closeModalBtn.style.display = "block";
}

window.addEventListener("DOMContentLoaded", () => {
  branchDropdownEl = document.querySelector("#branch-dropdown"); repoDropdownEl = document.querySelector("#repo-dropdown"); outputConsole = document.querySelector("#output-console");
  historyBtn = document.querySelector("#btn-history"); commitBtn = document.querySelector("#btn-commit"); viewerBtn = document.querySelector("#btn-viewer"); featureBtn = document.querySelector("#btn-feature");

  commitModal = document.querySelector("#quick-commit-modal"); closeModalBtn = document.querySelector("#btn-close-modal"); cancelModalBtn = document.querySelector("#btn-cancel-modal");
  commitForm = document.querySelector("#quick-commit-form"); commitFormButtons = document.querySelector("#commit-form-buttons");
  progressFooter = document.querySelector("#commit-progress-footer"); progressText = document.querySelector("#commit-progress-text"); progressBar = document.querySelector("#commit-progress-bar"); progressDoneBtn = document.querySelector("#btn-commit-done");

  featureModal = document.querySelector("#feature-modal"); closeFeatureBtn = document.querySelector("#btn-close-feature"); cancelFeatureBtn = document.querySelector("#btn-cancel-feature"); featureForm = document.querySelector("#feature-form"); featureInput = document.querySelector("#feature-name");
  viewerModal = document.querySelector("#viewer-modal"); closeViewerBtn = document.querySelector("#btn-close-viewer"); viewerList = document.querySelector("#viewer-list");
  aboutModal = document.querySelector("#about-modal"); openAboutBtn = document.querySelector("#btn-open-about"); closeAboutBtn = document.querySelector("#btn-close-about");
  footerText = document.querySelector("#footer-status-text"); footerDot = document.querySelector("#footer-status-dot"); loadingSpinner = document.querySelector("#loading-spinner");

  document.querySelector("#btn-select-repo").addEventListener("click", selectRepository); repoDropdownEl.addEventListener("change", handleRepoSwitch); branchDropdownEl.addEventListener("change", handleBranchSwitch);
  historyBtn.addEventListener("click", viewHistory); viewerBtn.addEventListener("click", openRepoViewer);
  commitBtn.addEventListener("click", openQuickCommitModal); closeModalBtn.addEventListener("click", closeCommitModal); cancelModalBtn.addEventListener("click", closeCommitModal); commitForm.addEventListener("submit", handleQuickCommit);
  progressDoneBtn.addEventListener("click", closeCommitModal); // New Done button listener

  featureBtn.addEventListener("click", openFeatureModal); closeFeatureBtn.addEventListener("click", closeFeatureModal); cancelFeatureBtn.addEventListener("click", closeFeatureModal); featureForm.addEventListener("submit", handleStartFeature);
  closeViewerBtn.addEventListener("click", () => viewerModal.classList.remove("active"));
  openAboutBtn.addEventListener("click", () => aboutModal.classList.add("active")); closeAboutBtn.addEventListener("click", () => aboutModal.classList.remove("active"));

  document.querySelectorAll('#about-modal a').forEach(a => { a.addEventListener('click', (e) => { e.preventDefault(); invoke('plugin:opener|open', { url: e.target.href }); }); });

  updateUIState();
});