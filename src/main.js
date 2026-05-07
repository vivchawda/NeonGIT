const { invoke } = window.__TAURI__.core;
const { open } = window.__TAURI__.dialog;
const { getCurrentWindow } = window.__TAURI__.window;
const { listen } = window.__TAURI__.event;

let repoList = JSON.parse(localStorage.getItem("neon-git-repos") || "[]");
let activeRepo = localStorage.getItem("neon-git-active") || "";

// === STATE MANAGEMENT ===
let activePane = null;
let cmdHistory = [];
let cmdIndex = -1;

let branchDropdownEl, repoDropdownEl, outputConsole, historyBtn, commitBtn, featureBtn, revertBtn, mergeBtn, actionsToggleBtn, actionsMenu, actionViewRepo, actionRunBuild, actionCleanStage, commandPane, aboutModal, openAboutBtn, closeAboutBtn, viewerModal, closeViewerBtn, viewerList, historyModal, closeHistoryBtn, historyList, resetModal, closeResetBtn, cancelResetBtn, confirmResetBtn, resetInput, mergeModal, closeMergeBtn, cancelMergeBtn, confirmMergeBtn, mergeScreen1, mergeScreenProgress, mergeScreen3, mergeSourceBranch, mergeProgressText, mergeProgressBar, mergeErrorCloseBtn, mergeDeleteBranchName, keepBranchBtn, deleteBranchBtn, footerText, footerDot, loadingSpinner;
let terminalInputForm, customCmdInput;

function saveRepoData() { localStorage.setItem("neon-git-repos", JSON.stringify(repoList)); localStorage.setItem("neon-git-active", activeRepo); }
function printToConsole(text) { outputConsole.textContent += `\n${text}`; outputConsole.scrollTop = outputConsole.scrollHeight; }

function setUILocked(isLocked, statusMessage = "System Idle") {
  document.querySelectorAll('.main .btn, .topbar button, .topbar select').forEach(btn => {
    if (btn.classList.contains('active') || btn.tagName === 'SELECT' || btn.id === 'btn-select-repo' || btn.id === 'btn-open-about') {
      btn.disabled = isLocked;
    }
  });
  if (customCmdInput) customCmdInput.disabled = isLocked;
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
    const repoName = activeRepo.split('/').pop(); const newTitle = `Neon GIT Manager - [${repoName}]`;
    try { await appWindow.setTitle(newTitle); } catch (err) { }
    [historyBtn, commitBtn, featureBtn, actionsToggleBtn, revertBtn, mergeBtn].forEach(b => b.disabled = false);
    outputConsole.textContent = `System anchored to: ${activeRepo}\nReady for commands.`; fetchBranches();
  } else {
    try { await appWindow.setTitle("Neon GIT Manager"); } catch (err) { }
    branchDropdownEl.innerHTML = '<option value="">--</option>';
    [historyBtn, commitBtn, featureBtn, actionsToggleBtn, revertBtn, mergeBtn].forEach(b => b.disabled = true);
    outputConsole.textContent = "Please select or add a Git repository using the + button top right.";
  }
}

async function selectRepository() { try { const selectedPath = await open({ directory: true, multiple: false }); if (selectedPath) { if (!repoList.includes(selectedPath)) repoList.push(selectedPath); activeRepo = selectedPath; saveRepoData(); updateUIState(); } } catch (err) { printToConsole(`Failed to open dialog: ${err}`); } }
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

function appConfirm(title, message, confirmText, confirmClass) {
  return new Promise((resolve) => {
    const modal = document.getElementById('confirm-modal');
    document.getElementById('confirm-title').innerHTML = title; document.getElementById('confirm-message').innerHTML = message;
    const btnConfirm = document.getElementById('btn-confirm-action'); btnConfirm.innerHTML = confirmText; btnConfirm.className = `btn ${confirmClass}`;
    const cleanup = (result) => { modal.classList.remove('active'); document.getElementById('btn-cancel-confirm').onclick = null; document.getElementById('btn-close-confirm').onclick = null; btnConfirm.onclick = null; resolve(result); };
    document.getElementById('btn-cancel-confirm').onclick = () => cleanup(false); document.getElementById('btn-close-confirm').onclick = () => cleanup(false); btnConfirm.onclick = () => cleanup(true);
    modal.classList.add('active');
  });
}

function isPaneDirty() {
  if (activePane === 'feature') { const el = document.getElementById('feature-name'); return el && el.value.trim() !== ''; }
  if (activePane === 'commit') { const sum = document.getElementById('commit-summary'); const det = document.getElementById('commit-details'); return (sum && sum.value.trim() !== '') || (det && det.value.trim() !== ''); }
  return false;
}

async function requestPaneSwitch(targetPane, focusId, prefill = {}) {
  if (!activeRepo) return;

  if (activePane === targetPane) {
    if (isPaneDirty()) {
      const confirmed = await appConfirm("⚠️ Discard Changes?", "You have unsaved text in this pane. Are you sure you want to close it?", "Discard", "btn-d");
      if (!confirmed) return;
    }
    closeCommandPane();
    return;
  }

  if (activePane !== null && isPaneDirty()) {
    const confirmed = await appConfirm("⚠️ Discard Changes?", "You have unsaved text in the current pane. Are you sure you want to switch?", "Discard", "btn-d");
    if (!confirmed) return;
  }

  openCommandPane(`template-${targetPane}`, focusId, prefill);
  activePane = targetPane;
}

function openCommandPane(templateId, focusId, prefill = {}) {
  const template = document.getElementById(templateId);
  commandPane.innerHTML = template.innerHTML;
  commandPane.classList.add('open');
  if (prefill.summary) commandPane.querySelector('#commit-summary').value = prefill.summary;
  if (prefill.type) commandPane.querySelector(`input[name="commit-type"][value="${prefill.type}"]`).checked = true;
  if (focusId) { setTimeout(() => commandPane.querySelector(`#${focusId}`).focus(), 300); }
  wireUpCommandPaneListeners();
}

function closeCommandPane() {
  commandPane.classList.remove('open');
  setTimeout(() => { commandPane.innerHTML = ''; activePane = null; }, 300);
}

async function pasteFromClipboard(targetId) {
  try { const text = await navigator.clipboard.readText(); commandPane.querySelector(`#${targetId}`).value = text; }
  catch (err) { printToConsole('Clipboard permission denied.'); }
}

function wireUpCommandPaneListeners() {
  const featureForm = commandPane.querySelector('#feature-form'); const commitForm = commandPane.querySelector('#quick-commit-form');
  if (featureForm) featureForm.addEventListener('submit', handleStartFeature); if (commitForm) commitForm.addEventListener('submit', handleQuickCommit);
  commandPane.querySelectorAll('.btn-cancel-pane').forEach(btn => btn.addEventListener('click', closeCommandPane));
  commandPane.querySelectorAll('.paste-icon').forEach(icon => { icon.addEventListener('click', () => pasteFromClipboard(icon.dataset.target)); });
}

function openFeaturePane() { requestPaneSwitch('feature', 'feature-name'); }

async function openCommitPane(prefill = {}) {
  if (!activeRepo) return;
  if (activePane === 'commit' && !prefill.summary) { requestPaneSwitch('commit', null); return; }
  setUILocked(true, "Verifying Git tree...");
  try {
    const status = await invoke("check_git_status", { repoPath: activeRepo });
    if (!status) { printToConsole("Working tree clean. Nothing to commit!"); setUILocked(false); return; }
    printToConsole(`Changes detected:\n${status}\n\nAwaiting commit details...`);
    setUILocked(false);
    requestPaneSwitch('commit', 'commit-summary', prefill);
  } catch (error) { printToConsole(`ERROR checking status:\n${error}`); setUILocked(false); }
}

async function handleStartFeature(e) {
  e.preventDefault();
  let rawName = commandPane.querySelector('#feature-name').value.trim().toLowerCase().replace(/\s+/g, '-');
  if (!rawName.startsWith('feat/') && !rawName.startsWith('fix/') && !rawName.startsWith('chore/')) { rawName = `feat/${rawName}`; }
  closeCommandPane(); setUILocked(true, `Creating branch: ${rawName}...`); printToConsole(`🚀 Creating and switching to branch: ${rawName}`);
  try { const result = await invoke("start_feature", { repoPath: activeRepo, branchName: rawName }); printToConsole(`✅ Success:\n${result}\n\nYou are now on branch: [${rawName}]`); fetchBranches(); }
  catch (error) { printToConsole(`❌ FAILED to create branch:\n${error}`); }
  setUILocked(false);
}

async function handleQuickCommit(e) {
  e.preventDefault();
  const form = commandPane.querySelector('#quick-commit-form');
  const progressFooter = commandPane.querySelector('#commit-progress-footer');
  const type = form.querySelector('input[name="commit-type"]:checked').value;
  const summary = form.querySelector('#commit-summary').value;
  const details = form.querySelector('#commit-details').value;
  const fullMessage = details ? `${type}: ${summary}\n\n${details}` : `${type}: ${summary}`;

  form.style.display = "none"; progressFooter.style.display = "flex";
  const progressText = commandPane.querySelector('#commit-progress-text');
  const progressBar = commandPane.querySelector('#commit-progress-bar');
  const progressDoneBtn = commandPane.querySelector('#btn-commit-done');

  progressText.textContent = "Starting engine..."; setUILocked(true, "Running Quick Commit workflow...");

  const unlisten = await listen('commit-progress', (event) => { progressText.textContent = event.payload; printToConsole(`> ${event.payload}`); });

  try {
    const result = await invoke("perform_quick_commit", { repoPath: activeRepo, message: fullMessage });
    progressText.textContent = "✅ Commit and Push Successful!"; progressText.style.color = "#4ade80"; progressBar.classList.remove("dbf-anim"); progressBar.style.width = "100%"; progressBar.style.background = "#4ade80"; progressDoneBtn.style.display = "block";
    printToConsole(`\n-- OPERATION COMPLETE --\n${result}`); fetchBranches();
  } catch (error) {
    progressText.textContent = "❌ Error. See console."; progressText.style.color = "var(--a3)"; progressBar.classList.remove("dbf-anim"); progressBar.style.width = "100%"; progressBar.style.background = "var(--a3)"; progressDoneBtn.style.display = "block";
    printToConsole(`\n[ CRITICAL FAILURE ]\n${error}`);
  }
  progressDoneBtn.onclick = closeCommandPane; unlisten(); setUILocked(false);
}

async function runCleanAndStage() {
  if (!activeRepo) return; actionsMenu.classList.remove("open");
  const confirmed = await appConfirm("⚠️ Clean & Stage", "This will permanently delete all temporary .bak* files in your repository and stage all changes. Proceed?", "🧹 Clean Workspace", "btn-d"); if (!confirmed) return;

  setUILocked(true, "Cleaning workspace..."); printToConsole("🧹 Running atomic clean & stage...");
  try {
    const deletedCount = await invoke("clean_and_stage", { repoPath: activeRepo });
    printToConsole(`✅ Purged ${deletedCount} .bak* file(s) and staged all changes.`);
    setUILocked(false);
    openCommitPane({ type: 'chore', summary: 'clean workspace and purge build artifacts' });
  } catch (error) { printToConsole(`❌ Clean & Stage Failed:\n${error}`); setUILocked(false); }
}

async function handleTerminalInput(e) {
  e.preventDefault();
  if (!activeRepo) return;
  const cmd = customCmdInput.value.trim();
  if (!cmd) return;

  if (cmdHistory[cmdHistory.length - 1] !== cmd) { cmdHistory.push(cmd); }
  cmdIndex = cmdHistory.length;
  customCmdInput.value = "";
  printToConsole(`\n$ ${cmd}`);
  setUILocked(true, "Executing raw command...");
  try {
    const result = await invoke("run_raw_command", { repoPath: activeRepo, cmdString: cmd });
    printToConsole(result || "(Command returned no output)");
  } catch (err) { printToConsole(`❌ Error:\n${err}`); }
  setUILocked(false); customCmdInput.focus();
}

function handleTerminalKeydown(e) {
  if (cmdHistory.length === 0) return;
  if (e.key === 'ArrowUp') {
    e.preventDefault(); if (cmdIndex > 0) cmdIndex--; customCmdInput.value = cmdHistory[cmdIndex] || "";
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (cmdIndex < cmdHistory.length - 1) { cmdIndex++; customCmdInput.value = cmdHistory[cmdIndex]; }
    else { cmdIndex = cmdHistory.length; customCmdInput.value = ""; }
  }
}

async function openHistoryModal() { if (!activeRepo) return; setUILocked(true, "Fetching full history..."); try { const rawData = await invoke("view_history", { repoPath: activeRepo }); if (!rawData) { document.getElementById('history-list').innerHTML = `<div style="padding: 20px; text-align: center; color: var(--td); font-size: 12px;">No commits found.</div>`; } else { const commits = rawData.split('[==COMMIT==]').filter(c => c.trim() !== ''); let html = ''; commits.forEach(commitStr => { const parts = commitStr.split('|--|'); if (parts.length >= 6) { const [hash, shortHash, author, dateExact, dateRel, subject, ...bodyParts] = parts; const body = bodyParts.join('|--|').trim(); html += `<div class="commit-card" onclick="this.classList.toggle('expanded')"><div class="commit-meta"><span class="commit-hash" title="Click to copy full hash" onclick="event.stopPropagation(); navigator.clipboard.writeText('${hash}'); this.textContent='Copied!'; setTimeout(()=>this.textContent='${shortHash}', 1500)">${shortHash}</span><span>👤 ${author} &nbsp;•&nbsp; 🕒 ${dateRel}</span></div><div class="commit-msg">${subject}</div><div class="commit-details-panel"><div style="font-size: 9px; color: var(--td); margin-bottom: 6px;">📅 ${dateExact}</div><div style="font-family: var(--font-mono); white-space: pre-wrap; font-size: 10px; color: var(--tm); background: var(--hd); padding: 8px; border-radius: 4px; border: 1px solid var(--bd);">${body || 'No additional body provided.'}</div></div></div>`; } }); document.getElementById('history-list').innerHTML = html; } historyModal.classList.add("active"); printToConsole("📜 History UI rendered successfully."); } catch (error) { printToConsole(`ERROR fetching history:\n${error}`); } setUILocked(false); }
function buildTree(paths) { const root = {}; paths.forEach(path => { const parts = path.split('/'); let current = root; parts.forEach((part, i) => { if (!current[part]) { current[part] = (i === parts.length - 1) ? null : {}; } current = current[part]; }); }); return root; }
function renderTreeHTML(node) { let html = ''; const entries = Object.entries(node).sort((a, b) => { if (a[1] !== null && b[1] === null) return -1; if (a[1] === null && b[1] !== null) return 1; return a[0].localeCompare(b[0]); }); for (const [name, children] of entries) { if (children === null) { html += `<div class="file-item tree-file"><span>${name}</span></div>`; } else { html += `<div><div class="file-item tree-folder" onclick="this.classList.toggle('open'); this.nextElementSibling.classList.toggle('open')"><span>${name}</span></div><div class="tree-children">${renderTreeHTML(children)}</div></div>`; } } return html; }
async function openRepoViewer() { if (!activeRepo) return; actionsMenu.classList.remove("open"); setUILocked(true, "Building Folder Tree..."); try { const filesArray = await invoke("get_repo_files", { repoPath: activeRepo }); const fileTree = buildTree(filesArray); document.getElementById('viewer-list').innerHTML = renderTreeHTML(fileTree); viewerModal.classList.add("active"); printToConsole(`📂 Rendered tree for ${filesArray.length} tracked files.`); } catch (error) { printToConsole(`ERROR reading files:\n${error}`); } setUILocked(false); }

// UPGRADE 3: Run Universal Build Script
async function runBuildScript() {
  if (!activeRepo) return; actionsMenu.classList.remove("open"); setUILocked(true, "Running NPM Build..."); printToConsole(`📦 Running "npm run build"...\nProcessing on engine...`);
  try { const result = await invoke("run_build", { repoPath: activeRepo }); printToConsole(`✅ Build Complete:\n\n${result}`); }
  catch (error) { printToConsole(`❌ Build Failed:\n\n${error}`); }
  setUILocked(false);
}

function openResetModal() { if (!activeRepo) return; resetModal.classList.add("active"); const resetInput = document.getElementById('reset-input'); const confirmResetBtn = document.getElementById('btn-confirm-reset'); resetInput.value = ""; confirmResetBtn.disabled = true; resetInput.focus(); resetInput.oninput = (e) => { confirmResetBtn.disabled = e.target.value !== "nuke"; }; document.getElementById('btn-close-reset').onclick = closeResetModal; document.getElementById('btn-cancel-reset').onclick = closeResetModal; confirmResetBtn.onclick = handleHardReset; }
function closeResetModal() { resetModal.classList.remove("active"); }
async function handleHardReset() { closeResetModal(); setUILocked(true, "Nuking workspace..."); printToConsole("💥 Executing Hard Reset..."); try { const result = await invoke("hard_reset", { repoPath: activeRepo }); printToConsole(`✅ Workspace Reset:\n${result}`); } catch (error) { printToConsole(`❌ Reset Failed:\n${error}`); } setUILocked(false); }
let branchToDelete = "";
function openMergeModal() { if (!activeRepo) return; const currentBranch = branchDropdownEl.value; if (currentBranch === "main" || currentBranch === "master") { printToConsole("❌ Already on primary branch."); return; } branchToDelete = currentBranch; document.getElementById('merge-source-branch').textContent = currentBranch; document.getElementById('merge-screen-1').style.display = "block"; document.getElementById('merge-screen-progress').style.display = "none"; document.getElementById('merge-screen-3').style.display = "none"; mergeModal.classList.add("active"); document.getElementById('btn-close-merge').onclick = closeMergeModal; document.getElementById('btn-cancel-merge').onclick = closeMergeModal; document.getElementById('btn-confirm-merge').onclick = handleMerge; document.getElementById('btn-keep-branch').onclick = closeMergeModal; document.getElementById('btn-delete-branch').onclick = handleDeleteBranch; }
function closeMergeModal() { mergeModal.classList.remove("active"); setUILocked(false); }
async function handleMerge() { document.getElementById('merge-screen-1').style.display = "none"; const progressScreen = document.getElementById('merge-screen-progress'); progressScreen.style.display = "flex"; document.getElementById('btn-close-merge').style.display = "none"; const progressText = document.getElementById('merge-progress-text'); progressText.textContent = "Starting..."; progressText.style.color = "var(--a2)"; const progressBar = document.getElementById('merge-progress-bar'); progressBar.classList.add("dbf-anim"); progressBar.style.width = "50%"; progressBar.style.background = "var(--a2)"; const errorCloseBtn = document.getElementById('btn-merge-error-close'); errorCloseBtn.style.display = "none"; errorCloseBtn.onclick = closeMergeModal; setUILocked(true, "Executing Merge..."); const unlisten = await listen('merge-progress', (event) => { progressText.textContent = event.payload; printToConsole(`> ${event.payload}`); }); try { const result = await invoke("perform_merge", { repoPath: activeRepo, featureBranch: branchToDelete }); printToConsole(`✅ MERGE COMPLETE\n\n${result}`); progressScreen.style.display = "none"; document.getElementById('merge-screen-3').style.display = "block"; document.getElementById('btn-close-merge').style.display = "block"; document.getElementById('merge-delete-branch-name').textContent = branchToDelete; fetchBranches(); } catch (error) { progressText.textContent = "❌ Merge Failed. See console."; progressText.style.color = "var(--a3)"; progressBar.classList.remove("dbf-anim"); progressBar.style.width = "100%"; progressBar.style.background = "var(--a3)"; errorCloseBtn.style.display = "block"; document.getElementById('btn-close-merge').style.display = "block"; printToConsole(`\n[ CRITICAL MERGE FAILURE ]\n${error}`); } unlisten(); }
async function handleDeleteBranch() { mergeModal.classList.remove("active"); setUILocked(true, "Deleting branch..."); printToConsole(`🗑️ Force deleting local branch '${branchToDelete}'...`); try { const result = await invoke("delete_branch", { repoPath: activeRepo, branchName: branchToDelete }); printToConsole(`✅ Branch Deleted:\n${result}`); fetchBranches(); } catch (error) { printToConsole(`❌ Failed to delete branch:\n${error}`); } setUILocked(false); }

window.addEventListener("DOMContentLoaded", () => {
  branchDropdownEl = document.querySelector("#branch-dropdown"); repoDropdownEl = document.querySelector("#repo-dropdown"); outputConsole = document.querySelector("#output-console");
  historyBtn = document.querySelector("#btn-history"); commitBtn = document.querySelector("#btn-commit"); featureBtn = document.querySelector("#btn-feature"); revertBtn = document.querySelector("#btn-revert"); mergeBtn = document.querySelector("#btn-merge");
  actionsToggleBtn = document.querySelector("#btn-actions-toggle"); actionsMenu = document.querySelector("#actions-menu"); actionViewRepo = document.querySelector("#action-view-repo"); actionRunBuild = document.querySelector("#action-run-build"); actionCleanStage = document.querySelector("#action-clean-stage");
  commandPane = document.querySelector("#command-pane");
  terminalInputForm = document.querySelector("#terminal-input-form"); customCmdInput = document.querySelector("#custom-cmd-input");

  viewerModal = document.querySelector("#viewer-modal"); closeViewerBtn = document.querySelector("#btn-close-viewer"); viewerList = document.querySelector("#viewer-list");
  historyModal = document.querySelector("#history-modal"); closeHistoryBtn = document.querySelector("#btn-close-history"); historyList = document.querySelector("#history-list");
  aboutModal = document.querySelector("#about-modal"); openAboutBtn = document.querySelector("#btn-open-about"); closeAboutBtn = document.querySelector("#btn-close-about");
  resetModal = document.querySelector("#reset-modal"); closeResetBtn = document.querySelector("#btn-close-reset"); cancelResetBtn = document.querySelector("#btn-cancel-reset"); confirmResetBtn = document.querySelector("#btn-confirm-reset");
  mergeModal = document.querySelector("#merge-modal"); closeMergeBtn = document.querySelector("#btn-close-merge"); cancelMergeBtn = document.querySelector("#btn-cancel-merge"); confirmMergeBtn = document.querySelector("#btn-confirm-merge"); keepBranchBtn = document.getElementById('btn-keep-branch'); deleteBranchBtn = document.getElementById('btn-delete-branch');

  footerText = document.querySelector("#footer-status-text"); footerDot = document.querySelector("#footer-status-dot"); loadingSpinner = document.querySelector("#loading-spinner");

  document.querySelector("#btn-select-repo").addEventListener("click", selectRepository); repoDropdownEl.addEventListener("change", handleRepoSwitch); branchDropdownEl.addEventListener("change", handleBranchSwitch);
  historyBtn.addEventListener("click", openHistoryModal); document.querySelector("#btn-close-history").onclick = () => historyModal.classList.remove('active');
  featureBtn.addEventListener("click", openFeaturePane);
  commitBtn.addEventListener("click", () => openCommitPane());
  revertBtn.addEventListener("click", openResetModal);
  mergeBtn.addEventListener("click", openMergeModal);

  actionsToggleBtn.addEventListener("click", () => actionsMenu.classList.toggle("open")); document.addEventListener("click", (e) => { if (!e.target.closest('.dmw')) actionsMenu.classList.remove("open"); });
  actionCleanStage.addEventListener("click", runCleanAndStage);
  actionViewRepo.addEventListener("click", openRepoViewer);
  actionRunBuild.addEventListener("click", runBuildScript);

  terminalInputForm.addEventListener("submit", handleTerminalInput);
  customCmdInput.addEventListener("keydown", handleTerminalKeydown);

  document.querySelector("#btn-close-viewer").onclick = () => viewerModal.classList.remove('active');
  document.querySelector("#btn-open-about").onclick = () => aboutModal.classList.add('active');
  document.querySelector("#btn-close-about").onclick = () => aboutModal.classList.remove('active');

  document.querySelectorAll('#about-modal a').forEach(a => { a.addEventListener('click', (e) => { e.preventDefault(); invoke('plugin:opener|open', { path: a.href }); }); });
  updateUIState();
});