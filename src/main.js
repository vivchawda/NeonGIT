const { invoke } = window.__TAURI__.core;
const { open } = window.__TAURI__.dialog;
const { getCurrentWindow } = window.__TAURI__.window;
const { listen } = window.__TAURI__.event;
const { getVersion } = window.__TAURI__.app;

let repoList = JSON.parse(localStorage.getItem("neon-git-repos") || "[]");
let activeRepo = localStorage.getItem("neon-git-active") || "";

let activePane = null;
let cmdHistory = []; let cmdIndex = -1;
let branchToDelete = "";
let isTimeMachineMode = false;
let timeMachineOriginalBranch = "";

//-- NEW VARIABLE --//
let mainTopbar, defaultControls, tmControls, tmReturnBtn, tmRevertBtn, removeRepoBtn;
let branchDropdownEl, repoDropdownEl, outputConsole, historyBtn, commitBtn, featureBtn, revertBtn, mergeBtn, actionsToggleBtn, actionsMenu, actionViewRepo, actionRunBuild, actionCleanStage, actionLinkRemote, actionCutRelease;
let commandPane, paneInner, paneProgressFooter, paneProgressText, paneProgressBar, paneDoneBtn;
let aboutModal, openAboutBtn, closeAboutBtn, viewerModal, closeViewerBtn, viewerList, historyModal, closeHistoryBtn, historyList;
let footerText, footerDot, loadingSpinner, terminalInputForm, customCmdInput;

function saveRepoData() { localStorage.setItem("neon-git-repos", JSON.stringify(repoList)); localStorage.setItem("neon-git-active", activeRepo); }
function printToConsole(text) { outputConsole.textContent += `\n${text}`; outputConsole.scrollTop = outputConsole.scrollHeight; }

function setUILocked(isLocked, statusMessage = "System Idle") {
  const shouldLockGrid = isTimeMachineMode ? true : isLocked;
  document.querySelectorAll('.main .btn').forEach(btn => btn.disabled = shouldLockGrid);
  document.querySelectorAll('.topbar button, .topbar select').forEach(btn => {
    if (btn.id !== 'btn-tm-return' && btn.id !== 'btn-tm-revert') { btn.disabled = isLocked; }
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
  //-- NEW LOGIC --//
  // Disable the remove button if no repo is selected or the list is empty
  if (removeRepoBtn) {
    removeRepoBtn.disabled = !activeRepo;
  }
}

async function updateUIState() {
  renderRepoDropdown(); const appWindow = getCurrentWindow();
  try { const appVersion = await getVersion(); const versionDisplay = document.getElementById('app-version-display'); if (versionDisplay) versionDisplay.textContent = appVersion; } catch (err) { }

  if (activeRepo) {
    const repoName = activeRepo.split('/').pop(); const newTitle = `Neon GIT Manager - [${repoName}]`;
    try { await appWindow.setTitle(newTitle); } catch (err) { }
    printToConsole(`System anchored to: ${activeRepo}\nReady for commands.`);
    await fetchBranches();

    if (branchDropdownEl.value === "neon-time-machine") {
      printToConsole("⚠️ WARNING: Repository is currently in Time Machine Preview Mode.");
      timeMachineOriginalBranch = "main";
      enableTimeMachineMode();
    } else {
      [historyBtn, commitBtn, featureBtn, actionsToggleBtn, revertBtn, mergeBtn].forEach(b => b.disabled = false);
    }
  } else {
    try { await appWindow.setTitle("Neon GIT Manager"); } catch (err) { }
    //-- MODIFIED BLOCK --//
    outputConsole.textContent = ''; // Clear console when no repo is active
    branchDropdownEl.innerHTML = '<option value="">--</option>';[historyBtn, commitBtn, featureBtn, actionsToggleBtn, revertBtn, mergeBtn].forEach(b => b.disabled = true);
    printToConsole("Please select or add a Git repository using the + button top right.");
    //-- END MODIFIED BLOCK --//
  }
}

async function sanitizeSavedRepos() {
  const validRepos = [];
  for (const repoPath of repoList) {
    try {
      const isGitRepo = await invoke("is_git_repository", { repoPath });
      if (isGitRepo) validRepos.push(repoPath);
    } catch (_) { }
  }
  repoList = validRepos;
  if (activeRepo && !repoList.includes(activeRepo)) activeRepo = "";
  saveRepoData();
}

async function selectRepository() {
  try {
    const selectedPath = await open({ directory: true, multiple: false });
    if (!selectedPath) return;

    const isGitRepo = await invoke("is_git_repository", { repoPath: selectedPath });
    if (!isGitRepo) {
      printToConsole("❌ Selected folder is not a Git repository. Use ✨ to initialize it first.");
      return;
    }

    if (!repoList.includes(selectedPath)) repoList.push(selectedPath);
    activeRepo = selectedPath;
    saveRepoData();
    updateUIState();
  } catch (err) { printToConsole(`Failed to open dialog: ${err}`); }
}

//-- NEW FUNCTION START --//
async function removeRepository() {
  // Guard against no repository being selected.
  if (!activeRepo) return;

  const repoName = activeRepo.split('/').pop();
  const title = `🗑️ Remove Repository?`;
  // Important: Reassure the user their files are safe.
  const message = `Are you sure you want to remove <strong>${repoName}</strong> from this list?<br><br>This action will <strong>not</strong> delete the actual repository folder from your computer.`;

  const confirmed = await appConfirm(title, message, "Remove From List", "btn-d");
  if (!confirmed) return;

  // Filter the list to exclude the active repository.
  repoList = repoList.filter(repo => repo !== activeRepo);
  // Clear the active repository state.
  activeRepo = "";

  // Save the new state to localStorage.
  saveRepoData();
  // Trigger a full UI refresh.
  updateUIState();

  printToConsole(`✅ Successfully removed '${repoName}' from the list.`);
}
//-- NEW FUNCTION END --//

async function initRepository() {
  try {
    const selectedPath = await open({ directory: true, multiple: false });
    if (!selectedPath) return;
    setUILocked(true, "Initializing Repository..."); printToConsole(`✨ Initializing new Git repository at:\n${selectedPath}`);
    const result = await invoke("init_repository", { repoPath: selectedPath });
    printToConsole(`✅ Success:\n${result}`);
    if (!repoList.includes(selectedPath)) repoList.push(selectedPath);
    activeRepo = selectedPath; saveRepoData(); updateUIState();
  } catch (err) { printToConsole(`❌ Failed to initialize repository:\n${err}`); }
  setUILocked(false);
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
  if (activePane === 'remote') { const el = document.getElementById('remote-url'); return el && el.value.trim() !== ''; }
  if (activePane === 'reset') { const el = document.getElementById('pane-reset-input'); return el && el.value.trim() !== ''; }
  return false;
}

function showPaneProgress(message) {
  if (paneProgressFooter) paneProgressFooter.style.display = 'flex';
  if (paneProgressText) { paneProgressText.textContent = message; paneProgressText.style.color = 'var(--a2)'; }
  if (paneProgressBar) { paneProgressBar.classList.add('dbf-anim'); paneProgressBar.style.width = '50%'; paneProgressBar.style.background = 'var(--a2)'; }
  if (paneDoneBtn) paneDoneBtn.style.display = 'none';
}

function setPaneProgressComplete(message, isError = false) {
  if (paneProgressText) { paneProgressText.textContent = message; paneProgressText.style.color = isError ? 'var(--a3)' : '#4ade80'; }
  if (paneProgressBar) { paneProgressBar.classList.remove('dbf-anim'); paneProgressBar.style.width = '100%'; paneProgressBar.style.background = isError ? 'var(--a3)' : '#4ade80'; }
  if (paneDoneBtn) { paneDoneBtn.style.display = 'block'; paneDoneBtn.onclick = closeCommandPane; }
}

async function requestPaneSwitch(targetPane, focusId, prefill = {}) {
  if (!activeRepo) return;
  if (activePane === targetPane) {
    if (isPaneDirty()) { const confirmed = await appConfirm("⚠️ Discard Changes?", "You have unsaved text in this pane. Are you sure you want to close it?", "Discard", "btn-d"); if (!confirmed) return; }
    closeCommandPane(); return;
  }
  if (activePane !== null && isPaneDirty()) {
    const confirmed = await appConfirm("⚠️ Discard Changes?", "You have unsaved text in the current pane. Are you sure you want to switch?", "Discard", "btn-d"); if (!confirmed) return;
  }
  openCommandPane(`template-${targetPane}`, focusId, prefill);
  activePane = targetPane;
}

function openCommandPane(templateId, focusId, prefill = {}) {
  const template = document.getElementById(templateId);
  if (!template || !paneInner || !commandPane) return;

  paneInner.innerHTML = template.innerHTML;
  if (paneProgressFooter) paneProgressFooter.style.display = 'none';
  commandPane.classList.add('open');

  if (prefill.summary) { const sum = paneInner.querySelector('#commit-summary'); if (sum) sum.value = prefill.summary; }
  if (prefill.type) { const rad = paneInner.querySelector(`input[name="commit-type"][value="${prefill.type}"]`); if (rad) rad.checked = true; }
  if (prefill.remoteUrl) { const ru = paneInner.querySelector('#remote-url'); if (ru) ru.value = prefill.remoteUrl; }

  if (templateId === 'template-merge') {
    const currentBranch = branchDropdownEl.value;
    if (currentBranch === "main" || currentBranch === "master") { printToConsole("❌ Already on primary branch."); closeCommandPane(); return; }
    branchToDelete = currentBranch;
    const brEl = paneInner.querySelector('#pane-merge-branch'); if (brEl) brEl.textContent = currentBranch;
  }

  if (focusId) { setTimeout(() => { const el = paneInner.querySelector(`#${focusId}`); if (el) el.focus(); }, 300); }
  wireUpCommandPaneListeners();
}

function closeCommandPane() {
  if (commandPane) commandPane.classList.remove('open');
  setTimeout(() => { if (paneInner) paneInner.innerHTML = ''; if (paneProgressFooter) paneProgressFooter.style.display = 'none'; activePane = null; setUILocked(false); }, 300);
}

async function pasteFromClipboard(e, targetId) {
  e.preventDefault(); e.stopPropagation();
  try {
    // Prefer Tauri clipboard plugin to avoid browser/WebView paste permission prompts.
    const text = await invoke("plugin:clipboard-manager|read_text");
    const el = paneInner.querySelector(`#${targetId}`);
    if (el) el.value = text || "";
  } catch (_) {
    try {
      const text = await navigator.clipboard.readText();
      const el = paneInner.querySelector(`#${targetId}`);
      if (el) el.value = text || "";
    } catch (err) {
      printToConsole('Clipboard read failed.');
    }
  }
}

function wireUpCommandPaneListeners() {
  if (!paneInner) return;
  const featureForm = paneInner.querySelector('#feature-form');
  const commitForm = paneInner.querySelector('#quick-commit-form');
  const remoteForm = paneInner.querySelector('#remote-form');
  const releaseForm = paneInner.querySelector('#release-form');
  const resetBtn = paneInner.querySelector('#btn-pane-confirm-reset');
  const resetInput = paneInner.querySelector('#pane-reset-input');
  const confirmMergeBtn = paneInner.querySelector('#btn-pane-confirm-merge');
  const keepBranchBtn = paneInner.querySelector('#btn-pane-keep-branch');
  const deleteBranchBtn = paneInner.querySelector('#btn-pane-delete-branch');

  if (featureForm) featureForm.addEventListener('submit', handleStartFeature);
  if (commitForm) commitForm.addEventListener('submit', handleQuickCommit);
  if (remoteForm) remoteForm.addEventListener('submit', handleLinkRemote);
  if (releaseForm) releaseForm.addEventListener('submit', executeRelease);

  if (releaseForm) {
    paneInner.querySelectorAll('button[data-bump]').forEach(btn => {
      btn.addEventListener('click', (e) => calculateVersionBump(e.target.dataset.bump));
    });
  }

  if (resetBtn && resetInput) {
    resetInput.addEventListener('input', (e) => resetBtn.disabled = e.target.value !== "nuke");
    resetBtn.addEventListener('click', handleHardReset);
  }

  if (confirmMergeBtn) confirmMergeBtn.addEventListener('click', handleMerge);
  if (keepBranchBtn) keepBranchBtn.addEventListener('click', closeCommandPane);
  if (deleteBranchBtn) deleteBranchBtn.addEventListener('click', handleDeleteBranch);

  paneInner.querySelectorAll('.btn-cancel-pane').forEach(btn => btn.addEventListener('click', closeCommandPane));

  paneInner.querySelectorAll('.paste-icon').forEach(icon => {
    icon.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); });
    icon.addEventListener('click', (e) => pasteFromClipboard(e, icon.dataset.target));
  });
}

function openFeaturePane() { requestPaneSwitch('feature', 'feature-name'); }
function openResetPane() { requestPaneSwitch('reset', 'pane-reset-input'); }

function openMergePane() {
  if (!activeRepo) return;
  const currentBranch = branchDropdownEl.value;
  if (currentBranch === "main" || currentBranch === "master") {
    printToConsole("❌ Already on the primary branch. Nothing to merge.");
    return;
  }

  const modal = document.getElementById('merge-modal');
  if (!modal) return;

  modal.querySelector('#merge-screen-1').style.display = 'block';
  modal.querySelector('#merge-screen-progress').style.display = 'none';
  modal.querySelector('#merge-screen-3').style.display = 'none';

  branchToDelete = currentBranch;
  const sourceBranchEl = modal.querySelector('#merge-source-branch');
  if (sourceBranchEl) sourceBranchEl.textContent = currentBranch;

  const cleanup = () => {
    modal.classList.remove('active');
    modal.querySelector('#btn-cancel-merge').onclick = null;
    modal.querySelector('#btn-close-merge').onclick = null;
    modal.querySelector('#btn-confirm-merge').onclick = null;
    modal.querySelector('#btn-keep-branch').onclick = null;
    modal.querySelector('#btn-delete-branch').onclick = null;
  };

  modal.querySelector('#btn-cancel-merge').onclick = cleanup;
  modal.querySelector('#btn-close-merge').onclick = cleanup;
  modal.querySelector('#btn-confirm-merge').onclick = handleMerge;
  modal.querySelector('#btn-keep-branch').onclick = cleanup;
  modal.querySelector('#btn-delete-branch').onclick = handleDeleteBranch;

  modal.classList.add('active');
}

async function openCommitPane(prefill = {}) {
  if (!activeRepo) return;
  if (activePane === 'commit' && !prefill.summary) { requestPaneSwitch('commit', null); return; }
  setUILocked(true, "Verifying Git tree...");
  try {
    const status = await invoke("check_git_status", { repoPath: activeRepo });
    if (!status) { printToConsole("Working tree clean. Nothing to commit!"); setUILocked(false); return; }
    printToConsole(`Changes detected:\n${status}\n\nAwaiting commit details...`);
    setUILocked(false); requestPaneSwitch('commit', 'commit-summary', prefill);
  } catch (error) { printToConsole(`ERROR checking status:\n${error}`); setUILocked(false); }
}

async function handleStartFeature(e) {
  e.preventDefault();
  const input = paneInner.querySelector('#feature-name'); if (!input) return;
  let rawName = input.value.trim().toLowerCase().replace(/\s+/g, '-');
  if (!rawName.startsWith('feat/') && !rawName.startsWith('fix/') && !rawName.startsWith('chore/')) { rawName = `feat/${rawName}`; }
  closeCommandPane(); setUILocked(true, `Creating branch: ${rawName}...`); printToConsole(`🚀 Creating branch: ${rawName}...`);
  try {
    const result = await invoke("start_feature", { repoPath: activeRepo, branchName: rawName });
    printToConsole(`✅ Success:\n${result}\n\nYou are now on branch: [${rawName}]`);
    fetchBranches();
  } catch (error) { printToConsole(`❌ FAILED to create branch:\n${error}`); }
  setUILocked(false);
}

async function handleQuickCommit(e) {
  e.preventDefault();
  const form = paneInner.querySelector('form');
  const typeEl = form.querySelector('input[name="commit-type"]:checked');
  const sumEl = form.querySelector('#commit-summary');
  const detEl = form.querySelector('#commit-details');
  if (!typeEl || !sumEl) return;

  const type = typeEl.value;
  const summary = sumEl.value;
  const details = detEl ? detEl.value : "";
  const fullMessage = details ? `${type}: ${summary}\n\n${details}` : `${type}: ${summary}`;

  form.style.display = "none"; showPaneProgress("Starting engine...");
  setUILocked(true, "Running Quick Commit workflow...");
  const unlisten = await listen('commit-progress', (event) => {
    if (paneProgressText) paneProgressText.textContent = event.payload;
    printToConsole(`> ${event.payload}`);
  });

  try {
    const result = await invoke("perform_quick_commit", { repoPath: activeRepo, message: fullMessage });
    setPaneProgressComplete("✅ Commit Successful!"); printToConsole(`\n-- OPERATION COMPLETE --\n${result}`); fetchBranches();
  } catch (error) {
    setPaneProgressComplete("❌ Error. See console.", true); printToConsole(`\n[ CRITICAL FAILURE ]\n${error}`);
  }
  unlisten();
}

async function runCleanAndStage() {
  if (!activeRepo) return; if (actionsMenu) actionsMenu.classList.remove("open");
  const confirmed = await appConfirm("⚠️ Clean & Stage", "This will permanently delete all temporary .bak* files in your repository and stage all changes. Proceed?", "🧹 Clean Workspace", "btn-d"); if (!confirmed) return;
  setUILocked(true, "Cleaning workspace..."); printToConsole("🧹 Running atomic clean & stage...");
  try {
    const deletedCount = await invoke("clean_and_stage", { repoPath: activeRepo });
    printToConsole(`✅ Purged ${deletedCount} .bak* file(s) and staged all changes.`);
    setUILocked(false); openCommitPane({ type: 'chore', summary: 'clean workspace and purge build artifacts' });
  } catch (error) { printToConsole(`❌ Clean & Stage Failed:\n${error}`); setUILocked(false); }
}

async function handleHardReset() {
  const inner = document.querySelector('.pane-content > div'); if (inner) inner.style.display = "none";
  showPaneProgress("Executing Hard Reset...");
  setUILocked(true, "Nuking workspace..."); printToConsole("💥 Executing Hard Reset...");
  try {
    const result = await invoke("hard_reset", { repoPath: activeRepo });
    setPaneProgressComplete("✅ Workspace Reset Successful!"); printToConsole(`✅ Workspace Reset:\n${result}`);
  } catch (error) {
    setPaneProgressComplete("❌ Reset Failed.", true); printToConsole(`❌ Reset Failed:\n${error}`);
  }
}

async function handleMerge() {
  const modal = document.getElementById('merge-modal');
  if (!modal) return;

  const screen1 = modal.querySelector('#merge-screen-1');
  const progressScreen = modal.querySelector('#merge-screen-progress');
  const successScreen = modal.querySelector('#merge-screen-3');
  const progressText = modal.querySelector('#merge-progress-text');
  const errorCloseBtn = modal.querySelector('#btn-merge-error-close');

  if (screen1) screen1.style.display = "none";
  if (progressScreen) progressScreen.style.display = 'flex';
  if (progressText) progressText.textContent = "Starting merge engine...";
  if (errorCloseBtn) errorCloseBtn.style.display = 'none';

  setUILocked(true, "Executing Merge Workflow...");
  const unlisten = await listen('merge-progress', (event) => {
    if (progressText) progressText.textContent = event.payload;
    printToConsole(`> ${event.payload}`);
  });

  try {
    const result = await invoke("perform_merge", { repoPath: activeRepo, featureBranch: branchToDelete });
    printToConsole(`✅ MERGE COMPLETE\n\n${result}`);
    if (progressScreen) progressScreen.style.display = "none";
    if (successScreen) successScreen.style.display = "block";
    const delBranchNameEl = modal.querySelector('#merge-delete-branch-name');
    if (delBranchNameEl) delBranchNameEl.textContent = branchToDelete;
    fetchBranches();
    setUILocked(false);
  } catch (error) {
    if (progressText) progressText.textContent = "❌ Merge Failed. See terminal output.";
    if (errorCloseBtn) {
      errorCloseBtn.style.display = 'block';
      errorCloseBtn.onclick = () => modal.classList.remove('active');
    }
    printToConsole(`\n[ CRITICAL MERGE FAILURE ]\n${error}`);
    setUILocked(false);
  }
  unlisten();
}

async function handleDeleteBranch() {
  setUILocked(true, "Deleting branch...");
  printToConsole(`🗑️ Force deleting local branch '${branchToDelete}'...`);
  const modal = document.getElementById('merge-modal');
  try {
    const result = await invoke("delete_branch", { repoPath: activeRepo, branchName: branchToDelete });
    printToConsole(`✅ Branch Deleted:\n${result}`);
    fetchBranches();
    if (modal) modal.classList.remove('active');
    setUILocked(false);
  }
  catch (error) {
    printToConsole(`❌ Failed to delete branch:\n${error}`);
    if (modal) modal.classList.remove('active');
    setUILocked(false);
  }
}

async function openRemotePane() {
  if (actionsMenu) actionsMenu.classList.remove("open");
  let currentUrl = "";
  try {
    currentUrl = await invoke("get_remote_url", { repoPath: activeRepo });
  } catch (err) { } // Ignore error if no remote exists
  requestPaneSwitch('remote', 'remote-url', { remoteUrl: currentUrl });
}

async function handleLinkRemote(e) {
  e.preventDefault();
  const urlEl = paneInner.querySelector('#remote-url'); if (!urlEl) return;
  const url = urlEl.value.trim();
  closeCommandPane(); setUILocked(true, `Linking GitHub Remote...`); printToConsole(`🔗 Linking origin to: ${url}`);
  try { const result = await invoke("link_remote", { repoPath: activeRepo, url: url }); printToConsole(`✅ Success:\n${result}`); }
  catch (error) { printToConsole(`❌ FAILED to link remote:\n${error}`); }
  setUILocked(false);
}

async function handleTerminalInput(e) {
  e.preventDefault(); if (!activeRepo) return;
  const cmd = customCmdInput.value.trim(); if (!cmd) return;
  if (cmdHistory[cmdHistory.length - 1] !== cmd) { cmdHistory.push(cmd); }
  cmdIndex = cmdHistory.length; customCmdInput.value = ""; printToConsole(`\n$ ${cmd}`); setUILocked(true, "Executing raw command...");
  try { const result = await invoke("run_raw_command", { repoPath: activeRepo, cmdString: cmd }); printToConsole(result || "(Command returned no output)"); }
  catch (err) { printToConsole(`❌ Error:\n${err}`); }
  setUILocked(false); customCmdInput.focus();
}

function handleTerminalKeydown(e) {
  if (cmdHistory.length === 0) return;
  if (e.key === 'ArrowUp') { e.preventDefault(); if (cmdIndex > 0) cmdIndex--; customCmdInput.value = cmdHistory[cmdIndex] || ""; }
  else if (e.key === 'ArrowDown') { e.preventDefault(); if (cmdIndex < cmdHistory.length - 1) { cmdIndex++; customCmdInput.value = cmdHistory[cmdIndex]; } else { cmdIndex = cmdHistory.length; customCmdInput.value = ""; } }
}

function enableTimeMachineMode() { isTimeMachineMode = true; if (mainTopbar) mainTopbar.classList.add("time-machine-mode"); if (defaultControls) defaultControls.style.display = "none"; if (tmControls) tmControls.style.display = "flex"; setUILocked(true, "Time Machine Active. Workspace is strictly Read-Only."); }
function disableTimeMachineMode() { isTimeMachineMode = false; if (mainTopbar) mainTopbar.classList.remove("time-machine-mode"); if (defaultControls) defaultControls.style.display = "flex"; if (tmControls) tmControls.style.display = "none"; setUILocked(false); timeMachineOriginalBranch = ""; }

async function initiateTimeMachine(hash) {
  if (!activeRepo) return;
  const confirmed = await appConfirm("🕰️ Initiate Time Machine?", `Your workspace will temporarily revert to commit <strong>${hash}</strong>. You can safely return to the present at any time.<br><br>Warning: Ensure you have no uncommitted changes before proceeding!`, "Rewind", "btn-ac"); if (!confirmed) return;
  const hm = document.getElementById("history-modal"); if (hm) hm.classList.remove("active"); timeMachineOriginalBranch = (branchDropdownEl && branchDropdownEl.value) ? branchDropdownEl.value : "main";
  setUILocked(true, "Initiating temporal jump..."); printToConsole(`🕰️ Rewinding workspace to commit[${hash}]...`);
  try { const result = await invoke("start_time_machine", { repoPath: activeRepo, hash: hash }); printToConsole(`✅ Jump Successful.\n${result}`); enableTimeMachineMode(); }
  catch (error) { printToConsole(`❌ Jump Failed. You likely have uncommitted changes.\n${error}`); setUILocked(false); }
}

async function returnToPresent() {
  setUILocked(true, "Returning to present..."); printToConsole(`🔙 Snapping back to branch[${timeMachineOriginalBranch}]...`);
  try { const result = await invoke("return_to_present", { repoPath: activeRepo, originalBranch: timeMachineOriginalBranch }); printToConsole(`✅ Safely returned to present.\n${result}`); disableTimeMachineMode(); fetchBranches(); }
  catch (error) { printToConsole(`❌ Return Failed:\n${error}`); setUILocked(true, "CRITICAL: Trapped in Time Machine!"); }
}

async function commitTimeMachineRevert() {
  const confirmed = await appConfirm("⚠️ Revert Timeline?", `This will safely generate new forward-moving commits that undo all work done after this point. Your history will remain intact, but your codebase will look exactly like this past state.<br><br>Proceed with Revert Sequence?`, "Revert Main", "btn-d"); if (!confirmed) return;
  setUILocked(true, "Executing Revert Sequence..."); printToConsole("⏪ Calculating mathematical inverse of timeline...");
  try { const result = await invoke("safe_rollback", { repoPath: activeRepo, originalBranch: timeMachineOriginalBranch }); printToConsole(`✅ REVERT SEQUENCE COMPLETE\n${result}`); disableTimeMachineMode(); fetchBranches(); }
  catch (error) { printToConsole(`❌ REVERT FAILED:\n${error}`); }
}

async function openHistoryModal() {
  if (!activeRepo) return; setUILocked(true, "Fetching full history...");
  try {
    const rawData = await invoke("view_history", { repoPath: activeRepo });
    const histList = document.getElementById('history-list');
    if (!histList) return;
    histList.innerHTML = '';
    if (!rawData) {
      histList.innerHTML = `<div style="padding: 20px; text-align: center; color: var(--td); font-size: 12px;">No commits found.</div>`;
    } else {
      const commits = rawData.split('[==COMMIT==]').filter(c => c.trim() !== '');
      commits.forEach(commitStr => {
        const parts = commitStr.split('|--|');
        if (parts.length >= 6) {
          const [hash, shortHash, author, dateExact, dateRel, subject, ...bodyParts] = parts; const body = bodyParts.join('|--|').trim();
          const card = document.createElement('div'); card.className = 'commit-card';
          const meta = document.createElement('div'); meta.className = 'commit-meta';
          const actionsDiv = document.createElement('div'); actionsDiv.style.display = 'flex'; actionsDiv.style.gap = '6px';
          const hashSpan = document.createElement('span'); hashSpan.className = 'commit-hash'; hashSpan.title = 'Click to copy full hash'; hashSpan.textContent = shortHash;
          const rewindBtn = document.createElement('button'); rewindBtn.className = 'btn btn-g'; rewindBtn.style.padding = '2px 6px'; rewindBtn.style.fontSize = '9px'; rewindBtn.style.lineHeight = '1'; rewindBtn.title = 'Preview repository at this commit'; rewindBtn.textContent = '🕰️ Rewind';
          const infoSpan = document.createElement('span'); infoSpan.innerHTML = `👤 ${author} &nbsp;•&nbsp; 🕒 ${dateRel}`;
          actionsDiv.appendChild(hashSpan); actionsDiv.appendChild(rewindBtn); meta.appendChild(actionsDiv); meta.appendChild(infoSpan);
          const msgDiv = document.createElement('div'); msgDiv.className = 'commit-msg'; msgDiv.textContent = subject;
          const detailsPanel = document.createElement('div'); detailsPanel.className = 'commit-details-panel'; detailsPanel.innerHTML = `<div style="font-size: 9px; color: var(--td); margin-bottom: 6px;">📅 ${dateExact}</div><div style="font-family: var(--font-mono); white-space: pre-wrap; font-size: 10px; color: var(--tm); background: var(--hd); padding: 8px; border-radius: 4px; border: 1px solid var(--bd);">${body || 'No additional body provided.'}</div>`;
          card.appendChild(meta); card.appendChild(msgDiv); card.appendChild(detailsPanel);
          card.addEventListener('click', () => card.classList.toggle('expanded'));
          hashSpan.addEventListener('click', (e) => { e.stopPropagation(); navigator.clipboard.writeText(hash); hashSpan.textContent = 'Copied!'; setTimeout(() => hashSpan.textContent = shortHash, 1500); });
          rewindBtn.addEventListener('click', (e) => { e.stopPropagation(); initiateTimeMachine(hash); });
          histList.appendChild(card);
        }
      });
    }
    const hm = document.getElementById("history-modal"); if (hm) hm.classList.add("active");
    printToConsole("📜 History UI rendered successfully.");
  } catch (error) { printToConsole(`ERROR fetching history:\n${error}`); }
  setUILocked(false);
}

function buildTree(paths) { const root = {}; paths.forEach(path => { const parts = path.split('/'); let current = root; parts.forEach((part, i) => { if (!current[part]) { current[part] = (i === parts.length - 1) ? null : {}; } current = current[part]; }); }); return root; }
function renderTreeHTML(node) { let html = ''; const entries = Object.entries(node).sort((a, b) => { if (a[1] !== null && b[1] === null) return -1; if (a[1] === null && b[1] !== null) return 1; return a[0].localeCompare(b[0]); }); for (const [name, children] of entries) { if (children === null) { html += `<div class="file-item tree-file"><span>${name}</span></div>`; } else { html += `<div><div class="file-item tree-folder" onclick="this.classList.toggle('open'); this.nextElementSibling.classList.toggle('open')"><span>${name}</span></div><div class="tree-children">${renderTreeHTML(children)}</div></div>`; } } return html; }
async function openRepoViewer() { if (!activeRepo) return; if (actionsMenu) actionsMenu.classList.remove("open"); setUILocked(true, "Building Folder Tree..."); try { const filesArray = await invoke("get_repo_files", { repoPath: activeRepo }); const fileTree = buildTree(filesArray); const vl = document.getElementById('viewer-list'); if (vl) vl.innerHTML = renderTreeHTML(fileTree); const vm = document.getElementById('viewer-modal'); if (vm) vm.classList.add("active"); printToConsole(`📂 Rendered tree for ${filesArray.length} tracked files.`); } catch (error) { printToConsole(`ERROR reading files:\n${error}`); } setUILocked(false); }
async function runBuildScript() { if (!activeRepo) return; if (actionsMenu) actionsMenu.classList.remove("open"); setUILocked(true, "Running NPM Build..."); printToConsole(`📦 Running "npm run build"...\nProcessing on engine...`); try { const result = await invoke("run_build", { repoPath: activeRepo }); printToConsole(`✅ Build Complete:\n\n${result}`); } catch (error) { printToConsole(`❌ Build Failed:\n\n${error}`); } setUILocked(false); }

async function openReleasePane() {
  if (!activeRepo) return;
  if (actionsMenu) actionsMenu.classList.remove("open");

  setUILocked(true, "Fetching live repo version...");
  let currentVersion = "0.0.0";
  try {
    // Read the exact version directly from the active repo's package.json
    const rawOutput = await invoke("run_raw_command", { repoPath: activeRepo, cmdString: "npm pkg get version" });
    if (rawOutput) currentVersion = rawOutput.replace(/"/g, '').trim();
  } catch (err) {
    printToConsole(`Warning: Could not fetch version from package.json - ${err}`);
  }

  requestPaneSwitch('release', 'release-version-input');

  // Wait for pane animation, then inject version dynamically into the visible pane
  setTimeout(() => {
    const display = paneInner.querySelector('#current-version-display');
    const input = paneInner.querySelector('#release-version-input');
    if (display) display.innerText = currentVersion;
    if (input) input.value = currentVersion;
    setUILocked(false);
  }, 350);
}

function calculateVersionBump(type) {
  // Query strictly within the active pane to avoid grabbing hidden template elements
  const display = paneInner.querySelector('#current-version-display');
  if (!display) return;

  const currentVersion = display.innerText;
  let parts = currentVersion.replace('v', '').split('.').map(Number);

  if (parts.length !== 3 || isNaN(parts[0])) return;

  if (type === 'patch') parts[2] += 1;
  if (type === 'minor') { parts[1] += 1; parts[2] = 0; }
  if (type === 'major') { parts[0] += 1; parts[1] = 0; parts[2] = 0; }

  const input = paneInner.querySelector('#release-version-input');
  if (input) input.value = parts.join('.');
}

async function executeRelease(e) {
  e.preventDefault();
  const input = paneInner.querySelector('#release-version-input');
  if (!input) return;

  const targetVersion = input.value.replace('v', '').trim();
  if (!targetVersion) return;

  const currentVersionDisplay = document.getElementById('current-version-display');
  const currentVersion = currentVersionDisplay ? currentVersionDisplay.innerText.replace('v', '').trim() : "";

  if (targetVersion === currentVersion) {
    printToConsole(`❌ Release Cancelled: Target version (v${targetVersion}) is identical to the current version. Please bump the version using the buttons above.`);
    return;
  }

  setUILocked(true, "Verifying workspace is clean...");
  try {
    const status = await invoke("check_git_status", { repoPath: activeRepo });
    if (status) {
      printToConsole(`❌ Release Cancelled: You have uncommitted changes.\nPlease use 'Quick Commit' first before cutting a release!\n\nUncommitted files:\n${status}`);
      setUILocked(false);
      return;
    }
  } catch (err) {
    printToConsole(`❌ Error checking git status: ${err}`);
    setUILocked(false);
    return;
  }

  const confirmed = await appConfirm("🚀 Cut Production Release?", `Are you sure you want to release version <strong>v${targetVersion}</strong>?<br><br>This will tag the repository and trigger the GitHub Action build pipeline.`, "Push & Build", "btn-d");
  if (!confirmed) { setUILocked(false); return; }

  closeCommandPane();
  setUILocked(true, `Tagging & Pushing v${targetVersion}...`);
  printToConsole(`$ npm version ${targetVersion} && git push origin HEAD --follow-tags...`);

  try {
    // FIX: Inject activeRepo so Rust executes in the correct directory
    const output = await invoke('cut_release', { repoPath: activeRepo, targetVersion: targetVersion });
    printToConsole(output);
    printToConsole(`✅ Release v${targetVersion} successfully tagged and pushed!`);
    printToConsole(`⏳ GitHub Action is now building your app in the background.`);
  } catch (err) {
    printToConsole(`❌ Release Error: ${err}\n(Make sure all your changes are committed before cutting a release!)`);
  }
  setUILocked(false);
}

window.addEventListener("DOMContentLoaded", () => {
  mainTopbar = document.getElementById("main-topbar"); defaultControls = document.getElementById("topbar-default-controls"); tmControls = document.getElementById("topbar-time-machine-controls"); tmReturnBtn = document.getElementById("btn-tm-return"); tmRevertBtn = document.getElementById("btn-tm-revert");
  branchDropdownEl = document.querySelector("#branch-dropdown"); repoDropdownEl = document.querySelector("#repo-dropdown"); outputConsole = document.querySelector("#output-console");
  historyBtn = document.querySelector("#btn-history"); commitBtn = document.querySelector("#btn-commit"); featureBtn = document.querySelector("#btn-feature"); revertBtn = document.querySelector("#btn-revert"); mergeBtn = document.querySelector("#btn-merge");
  actionsToggleBtn = document.querySelector("#btn-actions-toggle"); actionsMenu = document.querySelector("#actions-menu"); actionViewRepo = document.querySelector("#action-view-repo"); actionRunBuild = document.querySelector("#action-run-build"); actionCleanStage = document.querySelector("#action-clean-stage"); actionLinkRemote = document.querySelector("#action-link-remote"); actionCutRelease = document.querySelector("#action-cut-release");
  commandPane = document.querySelector("#command-pane"); paneInner = document.querySelector("#command-pane-inner"); paneProgressFooter = document.querySelector("#pane-progress-footer"); paneProgressText = document.querySelector("#pane-progress-text"); paneProgressBar = document.querySelector("#pane-progress-bar"); paneDoneBtn = document.querySelector("#btn-pane-done");
  terminalInputForm = document.querySelector("#terminal-input-form"); customCmdInput = document.querySelector("#custom-cmd-input");
  //-- NEW SELECTOR --//
  removeRepoBtn = document.querySelector("#btn-remove-repo");

  viewerModal = document.querySelector("#viewer-modal"); closeViewerBtn = document.querySelector("#btn-close-viewer"); viewerList = document.querySelector("#viewer-list");
  historyModal = document.querySelector("#history-modal"); closeHistoryBtn = document.querySelector("#btn-close-history"); historyList = document.querySelector("#history-list");
  aboutModal = document.querySelector("#about-modal"); openAboutBtn = document.querySelector("#btn-open-about"); closeAboutBtn = document.querySelector("#btn-close-about");

  footerText = document.querySelector("#footer-status-text"); footerDot = document.querySelector("#footer-status-dot"); loadingSpinner = document.querySelector("#loading-spinner");

  const btnInitRepo = document.querySelector("#btn-init-repo"); if (btnInitRepo) btnInitRepo.addEventListener("click", initRepository);
  const btnSelRepo = document.querySelector("#btn-select-repo"); if (btnSelRepo) btnSelRepo.addEventListener("click", selectRepository);
  //-- NEW LISTENER --//
  if (removeRepoBtn) removeRepoBtn.addEventListener("click", removeRepository);

  if (repoDropdownEl) repoDropdownEl.addEventListener("change", handleRepoSwitch);
  if (branchDropdownEl) branchDropdownEl.addEventListener("change", handleBranchSwitch);
  if (historyBtn) historyBtn.addEventListener("click", openHistoryModal);
  if (closeHistoryBtn) closeHistoryBtn.onclick = () => { if (historyModal) historyModal.classList.remove('active'); };

  if (featureBtn) featureBtn.addEventListener("click", openFeaturePane);
  if (commitBtn) commitBtn.addEventListener("click", () => openCommitPane());
  if (revertBtn) revertBtn.addEventListener("click", openResetPane);
  if (mergeBtn) mergeBtn.addEventListener("click", openMergePane);

  if (actionsToggleBtn) actionsToggleBtn.addEventListener("click", () => { if (actionsMenu) actionsMenu.classList.toggle("open"); });
  document.addEventListener("click", (e) => { if (!e.target.closest('.dmw') && actionsMenu) actionsMenu.classList.remove("open"); });

  if (actionCleanStage) actionCleanStage.addEventListener("click", runCleanAndStage);
  if (actionViewRepo) actionViewRepo.addEventListener("click", openRepoViewer);
  if (actionRunBuild) actionRunBuild.addEventListener("click", runBuildScript);
  if (actionLinkRemote) actionLinkRemote.addEventListener("click", openRemotePane);
  if (actionCutRelease) actionCutRelease.addEventListener("click", openReleasePane);

  if (terminalInputForm) terminalInputForm.addEventListener("submit", handleTerminalInput);
  if (customCmdInput) customCmdInput.addEventListener("keydown", handleTerminalKeydown);

  if (tmReturnBtn) tmReturnBtn.addEventListener("click", returnToPresent);
  if (tmRevertBtn) tmRevertBtn.addEventListener("click", commitTimeMachineRevert);

  if (closeViewerBtn) closeViewerBtn.onclick = () => { if (viewerModal) viewerModal.classList.remove('active'); };
  if (openAboutBtn) openAboutBtn.onclick = () => { if (aboutModal) aboutModal.classList.add('active'); };
  if (closeAboutBtn) closeAboutBtn.onclick = () => { if (aboutModal) aboutModal.classList.remove('active'); };

  document.querySelectorAll('#about-modal a').forEach(a => { a.addEventListener('click', (e) => { e.preventDefault(); invoke('plugin:opener|open', { path: a.href }); }); });
  sanitizeSavedRepos().then(() => updateUIState());
});