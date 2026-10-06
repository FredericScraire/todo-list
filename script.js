const form = document.getElementById('task-form');
const input = document.getElementById('task-input');
const categoryInput = document.getElementById('category-input');
const categoryOptions = document.getElementById('category-options');
const categoryFilterSelect = document.getElementById('category-filter');
const dueInput = document.getElementById('due-input');
const prioritySelect = document.getElementById('priority-select');
const listSort = document.getElementById('list-sort');
const statsPeriod = document.getElementById('stats-period');
const statsTotal = document.getElementById('stats-total');
const statsChart = document.getElementById('stats-chart');
const statsTopCategory = document.getElementById('stats-top-category');
const statsCategories = document.getElementById('stats-categories');
const list = document.getElementById('task-list');
const undoButton = document.getElementById('undo-button');

const tabs = document.querySelectorAll('.nav-tab');
const views = {
  list: document.getElementById('view-list'),
  history: document.getElementById('view-history'),
  stats: document.getElementById('view-stats'),
};
const historySummary = document.getElementById('history-summary');
const historyList = document.getElementById('history-list');
const historySort = document.getElementById('history-sort');

const NO_CATEGORY = 'Sans catégorie';
const FILTER_ALL = '__all__';   // special filter values, so they can't be
const FILTER_NONE = '__none__'; // confused with a real category name
let categoryFilter = FILTER_ALL; // current filter of the List view
const PREVIEW_COUNT = 3; // tasks shown per category when collapsed
const expandedCategories = []; // names of the categories currently expanded

const tasks = [];
let editingTask = null; // the task currently being edited (or null)
let draggedIndex = null; // index of the task being dragged (or null)
const reorderHint = document.getElementById('reorder-hint');

// --- Saving (localStorage) ---
// localStorage keeps text in the browser, even after closing the tab.
// It only stores strings, so we convert the tasks to/from JSON text.

const STORAGE_KEY = 'todo-list-tasks';

function saveTasks() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  } catch (error) {
    console.warn('Impossible de sauvegarder les tâches :', error);
  }
}

function loadTasks() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      return; // nothing saved yet (first visit)
    }
    const parsed = JSON.parse(saved);
    for (let i = 0; i < parsed.length; i++) {
      tasks.push(parsed[i]);
    }
  } catch (error) {
    console.warn('Impossible de charger les tâches :', error);
  }
}

// --- Categories ---

function categoryLabel(task) {
  return task.category || NO_CATEGORY;
}

function matchesFilter(task) {
  if (categoryFilter === FILTER_ALL) {
    return true;
  }
  if (categoryFilter === FILTER_NONE) {
    return !task.category;
  }
  return task.category === categoryFilter;
}

function addOption(select, value, text) {
  const option = document.createElement('option');
  option.value = value;
  if (text !== undefined) {
    option.textContent = text;
  }
  select.appendChild(option);
}

// Refreshes (1) the suggestions while typing a category (<datalist>)
// and (2) the choices of the filter dropdown.
function updateCategoryOptions() {
  const seen = [];
  let hasUncategorized = false;

  for (let i = 0; i < tasks.length; i++) {
    const category = tasks[i].category;
    if (!category) {
      hasUncategorized = true;
    } else if (!seen.includes(category)) {
      seen.push(category);
    }
  }
  seen.sort((a, b) => a.localeCompare(b));

  categoryOptions.innerHTML = '';
  for (let i = 0; i < seen.length; i++) {
    addOption(categoryOptions, seen[i]);
  }

  categoryFilterSelect.innerHTML = '';
  addOption(categoryFilterSelect, FILTER_ALL, 'Toutes les catégories');
  for (let i = 0; i < seen.length; i++) {
    addOption(categoryFilterSelect, seen[i], seen[i]);
  }
  if (hasUncategorized) {
    addOption(categoryFilterSelect, FILTER_NONE, NO_CATEGORY);
  }

  // If the selected category no longer exists (renamed, deleted...), reset
  const stillExists =
    categoryFilter === FILTER_ALL ||
    (categoryFilter === FILTER_NONE && hasUncategorized) ||
    seen.includes(categoryFilter);
  if (!stillExists) {
    categoryFilter = FILTER_ALL;
  }
  categoryFilterSelect.value = categoryFilter;
}

// --- Due dates & priority ---

const PRIORITY_RANK = { high: 0, normal: 1, low: 2 }; // lower = more urgent
const PRIORITY_LABELS = {
  high: 'Priorité haute',
  normal: 'Priorité normale',
  low: 'Priorité basse',
};

// Tasks saved before priorities existed have no priority: treat as "normal"
function priorityOf(task) {
  return task.priority || 'normal';
}

function pad(number) {
  return String(number).padStart(2, '0');
}

// A date as 'YYYY-MM-DD' (same format as <input type="date">)
function dateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function todayString() {
  return dateKey(new Date());
}

// new Date('2026-10-12') would be read as UTC and can show the previous day
// in your timezone, so we build the date from its parts (local time).
function parseLocalDate(dateString) {
  const parts = dateString.split('-');
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
}

function formatDueDate(dateString) {
  const date = parseLocalDate(dateString);
  const options = { day: 'numeric', month: 'short' };
  if (date.getFullYear() !== new Date().getFullYear()) {
    options.year = 'numeric';
  }
  return date.toLocaleDateString('fr-CA', options);
}

function createDueBadge(task) {
  const badge = document.createElement('small');
  badge.className = 'due-badge';

  const today = todayString();
  const formatted = formatDueDate(task.dueDate);

  // ISO dates ('YYYY-MM-DD') can be compared as plain text
  if (!task.done && task.dueDate < today) {
    badge.classList.add('overdue');
    badge.textContent = `En retard · ${formatted}`;
  } else if (!task.done && task.dueDate === today) {
    badge.classList.add('today');
    badge.textContent = 'Aujourd\'hui';
  } else {
    badge.textContent = `📅 ${formatted}`;
  }
  return badge;
}

function createPriorityBadge(task) {
  const badge = document.createElement('small');
  const priority = priorityOf(task);
  badge.className = `priority-badge priority-${priority}`;
  badge.textContent = PRIORITY_LABELS[priority];
  return badge;
}

// Tasks without a due date go last
function compareDueDates(a, b) {
  if (a.dueDate && b.dueDate) {
    return a.dueDate.localeCompare(b.dueDate);
  }
  if (a.dueDate) return -1;
  if (b.dueDate) return 1;
  return 0;
}

function comparePriorities(a, b) {
  return PRIORITY_RANK[priorityOf(a)] - PRIORITY_RANK[priorityOf(b)];
}

// Returns the task indexes in the order they should appear on screen.
// We sort the *indexes*, not the tasks array itself, so every task keeps its
// real position in `tasks` (needed for delete, timers, undo...).
function getDisplayOrder() {
  const order = [];
  for (let i = 0; i < tasks.length; i++) {
    order.push(i);
  }

  const mode = listSort.value;
  if (mode === 'manual') {
    return order;
  }

  order.sort((x, y) => {
    const a = tasks[x];
    const b = tasks[y];
    if (a.done !== b.done) {
      return a.done ? 1 : -1; // finished tasks sink to the bottom
    }
    if (mode === 'due') {
      return compareDueDates(a, b) || comparePriorities(a, b);
    }
    return comparePriorities(a, b) || compareDueDates(a, b);
  });
  return order;
}

// --- Undo logic ---
// Before every action, we save a copy ("snapshot") of the whole task list.
// Undo = restore the most recent snapshot.

const undoStack = [];
const MAX_UNDO = 50;

function saveSnapshot() {
  undoStack.push(JSON.parse(JSON.stringify(tasks)));
  if (undoStack.length > MAX_UNDO) {
    undoStack.shift();
  }
  updateUndoButton();
}

function undo() {
  if (undoStack.length === 0) {
    return;
  }
  const previous = undoStack.pop();

  tasks.length = 0;
  for (let i = 0; i < previous.length; i++) {
    tasks.push(previous[i]);
  }

  editingTask = null; // the old task objects no longer exist
  renderTasks();
  updateUndoButton();
}

function updateUndoButton() {
  undoButton.disabled = undoStack.length === 0;
}

// --- Timer logic ---

function getElapsed(task) {
  if (task.startedAt) {
    return task.elapsed + (Date.now() - task.startedAt);
  }
  return task.elapsed;
}

function pauseTask(task) {
  const now = Date.now();

  // Remember *when* the work happened (needed for the daily/weekly stats)
  if (!task.sessions) {
    task.sessions = [];
  }
  task.sessions.push({ start: task.startedAt, end: now });

  task.elapsed += now - task.startedAt;
  task.startedAt = null;
}

function startTask(task) {
  // Only one task can run at a time: pause any other running task first
  for (let i = 0; i < tasks.length; i++) {
    if (tasks[i] !== task && tasks[i].startedAt) {
      pauseTask(tasks[i]);
    }
  }
  task.startedAt = Date.now();
}

function formatTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');

  if (hours > 0) {
    return `${hours}:${mm}:${ss}`;
  }
  return `${mm}:${ss}`;
}

function updateTimers() {
  const timerElements = list.querySelectorAll('.timer');
  for (let i = 0; i < timerElements.length; i++) {
    // A task being edited has no timer on screen, so we can't rely on position:
    // each timer carries the index of its task (data-index).
    const task = tasks[Number(timerElements[i].dataset.index)];
    timerElements[i].textContent = formatTime(getElapsed(task));
  }
}

// --- Rendering: List view ---

function renderTasks() {
  list.innerHTML = '';
  updateCategoryOptions();
  saveTasks(); // every change goes through here, so we save here

  let shown = 0; // how many tasks are visible with the current filter

  // Dragging only makes sense in the manual order ("Ordre d'ajout")
  const canReorder = listSort.value === 'manual';
  reorderHint.hidden = canReorder;

  const order = getDisplayOrder();
  for (let k = 0; k < order.length; k++) {
    const i = order[k]; // real index of the task in `tasks`
    const task = tasks[i];

    // Skip tasks hidden by the category filter (i stays the real index)
    if (task !== editingTask && !matchesFilter(task)) {
      continue;
    }
    shown++;

    // Edit mode: show a small form instead of the normal row
    if (task === editingTask) {
      const editRow = createEditRow(task);
      list.appendChild(editRow);
      editRow.querySelector('.edit-text').focus();
      continue;
    }

    const li = document.createElement('li');
    if (task.done) {
      li.classList.add('done');
    }
    if (task.startedAt) {
      li.classList.add('running');
    }

    const playButton = document.createElement('button');
    playButton.className = 'play-button';
    playButton.textContent = task.startedAt ? '⏸' : '▶';
    playButton.disabled = task.done;
    playButton.setAttribute('aria-label', task.startedAt ? 'Mettre en pause' : 'Démarrer le timer');
    playButton.addEventListener('click', () => {
      saveSnapshot();
      if (task.startedAt) {
        pauseTask(task);
      } else {
        startTask(task);
      }
      renderTasks();
    });

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = task.done;
    checkbox.addEventListener('change', () => {
      saveSnapshot();
      task.done = checkbox.checked;
      task.completedAt = task.done ? Date.now() : null;
      if (task.done && task.startedAt) {
        pauseTask(task);
      }
      renderTasks();
    });

    const label = document.createElement('span');
    label.textContent = task.text;

    const timer = document.createElement('span');
    timer.className = 'timer';
    timer.dataset.index = i;
    timer.textContent = formatTime(getElapsed(task));

    const editButton = document.createElement('button');
    editButton.textContent = '✏️';
    editButton.className = 'edit-button';
    editButton.setAttribute('aria-label', 'Modifier la tâche');
    editButton.addEventListener('click', () => {
      editingTask = task;
      renderTasks();
    });

    const deleteButton = document.createElement('button');
    deleteButton.textContent = '🗑️';
    deleteButton.className = 'delete-button';
    deleteButton.setAttribute('aria-label', 'Supprimer la tâche');
    deleteButton.addEventListener('click', () => {
      saveSnapshot();
      tasks.splice(i, 1);
      renderTasks();
    });

    // Task name on top, small badges (priority, due date, category) below
    const main = document.createElement('div');
    main.className = 'task-main';
    main.appendChild(label);

    const meta = document.createElement('div');
    meta.className = 'task-meta';
    if (priorityOf(task) !== 'normal') {
      meta.appendChild(createPriorityBadge(task));
    }
    if (task.dueDate) {
      meta.appendChild(createDueBadge(task));
    }
    if (task.category) {
      meta.appendChild(createCategoryBadge(task.category));
    }
    if (meta.children.length > 0) {
      main.appendChild(meta);
    }

    if (canReorder) {
      const handle = document.createElement('span');
      handle.className = 'drag-handle';
      handle.textContent = '⋮⋮';
      handle.title = 'Glisser pour réordonner';
      handle.setAttribute('aria-hidden', 'true');
      li.appendChild(handle);
      enableDragAndDrop(li, i);
    }

    li.append(playButton, checkbox, main, timer, editButton, deleteButton);
    list.appendChild(li);
  }

  if (shown === 0 && tasks.length > 0) {
    const empty = document.createElement('li');
    empty.className = 'empty-message';
    empty.textContent = 'Aucune tâche dans cette catégorie.';
    list.appendChild(empty);
  }
}

// --- Drag and drop (reorder tasks) ---

function clearDropIndicators() {
  const marked = list.querySelectorAll('.drop-before, .drop-after, .dragging');
  for (let i = 0; i < marked.length; i++) {
    marked[i].classList.remove('drop-before', 'drop-after', 'dragging');
  }
}

// Moves the task at index `from` next to the task at index `target`
function moveTask(from, target, placeAfter) {
  // Once the task is removed, every index after it shifts down by one
  let insertAt = target > from ? target - 1 : target;
  if (placeAfter) {
    insertAt += 1;
  }
  if (insertAt === from) {
    return; // it would end up where it already is
  }

  saveSnapshot(); // so the move can be undone
  const moved = tasks.splice(from, 1)[0];
  tasks.splice(insertAt, 0, moved);
  renderTasks();
}

function enableDragAndDrop(li, index) {
  li.draggable = true;

  li.addEventListener('dragstart', (event) => {
    draggedIndex = index;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(index)); // Firefox needs this
    li.classList.add('dragging');
  });

  // Fires continuously while the dragged task is above this row
  li.addEventListener('dragover', (event) => {
    if (draggedIndex === null) {
      return; // something else is being dragged (a file, some text...)
    }
    event.preventDefault(); // without this, the browser refuses the drop

    // Top half of the row = insert before it, bottom half = insert after it
    const box = li.getBoundingClientRect();
    const inBottomHalf = event.clientY > box.top + box.height / 2;
    li.classList.toggle('drop-after', inBottomHalf);
    li.classList.toggle('drop-before', !inBottomHalf);
  });

  li.addEventListener('dragleave', () => {
    li.classList.remove('drop-before', 'drop-after');
  });

  li.addEventListener('drop', (event) => {
    event.preventDefault();
    const from = draggedIndex;
    const placeAfter = li.classList.contains('drop-after');
    draggedIndex = null;
    if (from !== null) {
      moveTask(from, index, placeAfter);
    }
  });

  // Fires at the end of any drag (dropped or cancelled)
  li.addEventListener('dragend', () => {
    draggedIndex = null;
    clearDropIndicators();
  });
}

function cancelEdit() {
  editingTask = null;
  renderTasks();
}

function createEditRow(task) {
  const li = document.createElement('li');
  li.className = 'editing';

  const editForm = document.createElement('form');
  editForm.className = 'edit-form';

  const textField = document.createElement('input');
  textField.type = 'text';
  textField.className = 'edit-text';
  textField.value = task.text;
  textField.required = true;

  const categoryField = document.createElement('input');
  categoryField.type = 'text';
  categoryField.className = 'edit-category';
  categoryField.value = task.category || '';
  categoryField.placeholder = 'Catégorie (optionnel)';
  categoryField.setAttribute('list', 'category-options');

  const dueField = document.createElement('input');
  dueField.type = 'date';
  dueField.className = 'edit-due';
  dueField.value = task.dueDate || '';
  dueField.setAttribute('aria-label', 'Date d\'échéance');

  const priorityField = document.createElement('select');
  priorityField.className = 'edit-priority';
  priorityField.setAttribute('aria-label', 'Priorité');
  const priorities = ['high', 'normal', 'low'];
  for (let i = 0; i < priorities.length; i++) {
    addOption(priorityField, priorities[i], PRIORITY_LABELS[priorities[i]]);
  }
  priorityField.value = priorityOf(task);

  const saveButton = document.createElement('button');
  saveButton.type = 'submit';
  saveButton.className = 'edit-save';
  saveButton.textContent = '✓';
  saveButton.setAttribute('aria-label', 'Enregistrer');

  const cancelButton = document.createElement('button');
  cancelButton.type = 'button';
  cancelButton.className = 'edit-cancel';
  cancelButton.textContent = '✕';
  cancelButton.setAttribute('aria-label', 'Annuler la modification');
  cancelButton.addEventListener('click', cancelEdit);

  editForm.addEventListener('submit', (event) => {
    event.preventDefault();
    saveSnapshot(); // so the edit can be undone too
    task.text = textField.value.trim();
    task.category = categoryField.value.trim();
    task.dueDate = dueField.value;
    task.priority = priorityField.value;
    editingTask = null;
    renderTasks();
  });

  // Escape key = cancel
  editForm.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      cancelEdit();
    }
  });

  editForm.append(textField, categoryField, dueField, priorityField, saveButton, cancelButton);
  li.appendChild(editForm);
  return li;
}

function createCategoryBadge(category) {
  const badge = document.createElement('small');
  badge.className = 'category-badge';
  badge.textContent = category;
  return badge;
}

// --- Statistics (History view) ---

// 90 s -> "90 s", 25 min -> "25 min", 1h05 -> "1h05"
function formatShortDuration(ms) {
  if (ms <= 0) {
    return '0';
  }
  if (ms < 60000) {
    return `${Math.floor(ms / 1000)} s`;
  }
  const totalMinutes = Math.round(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) {
    return `${hours}h${pad(minutes)}`;
  }
  return `${minutes} min`;
}

// All work periods of a task, including the one currently running
function getSessions(task) {
  const sessions = (task.sessions || []).slice();
  if (task.startedAt) {
    sessions.push({ start: task.startedAt, end: Date.now() });
  }
  return sessions;
}

// Adds a work period to the per-day totals. A period that crosses midnight
// is cut in pieces, so each day only gets its own share.
function addSessionByDay(totals, start, end) {
  let cursor = start;
  while (cursor < end) {
    const day = new Date(cursor);
    const nextMidnight = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1).getTime();
    const pieceEnd = Math.min(end, nextMidnight);

    const key = dateKey(day);
    totals[key] = (totals[key] || 0) + (pieceEnd - cursor);

    cursor = pieceEnd;
  }
}

// { '2026-10-12': milliseconds worked that day, ... }
function computeDayTotals() {
  const totals = Object.create(null);

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    const sessions = getSessions(task);

    let tracked = 0;
    for (let j = 0; j < sessions.length; j++) {
      addSessionByDay(totals, sessions[j].start, sessions[j].end);
      tracked += sessions[j].end - sessions[j].start;
    }

    // Time recorded before work periods were tracked: count it on the day
    // the task was completed (best information we have)
    const untracked = getElapsed(task) - tracked;
    if (untracked > 1000 && task.completedAt) {
      const key = dateKey(new Date(task.completedAt));
      totals[key] = (totals[key] || 0) + untracked;
    }
  }
  return totals;
}

// Monday of the week containing `date`, as 'YYYY-MM-DD'
function weekStartKey(date) {
  const offset = (date.getDay() + 6) % 7; // Monday = 0 ... Sunday = 6
  return dateKey(new Date(date.getFullYear(), date.getMonth(), date.getDate() - offset));
}

// { 'Monday of the week': milliseconds worked that week, ... }
function computeWeekTotals(dayTotals) {
  const weekTotals = Object.create(null);
  const dayKeys = Object.keys(dayTotals);
  for (let i = 0; i < dayKeys.length; i++) {
    const weekKey = weekStartKey(parseLocalDate(dayKeys[i]));
    weekTotals[weekKey] = (weekTotals[weekKey] || 0) + dayTotals[dayKeys[i]];
  }
  return weekTotals;
}

// The bars of the chart: last 7 days, or last 6 weeks
function buildBuckets(period, dayTotals) {
  const buckets = [];
  const today = new Date();

  if (period === 'day') {
    for (let n = 6; n >= 0; n--) {
      const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() - n);
      buckets.push({
        label: day.toLocaleDateString('fr-CA', { weekday: 'short', day: 'numeric' }),
        ms: dayTotals[dateKey(day)] || 0,
        isCurrent: n === 0,
      });
    }
    return buckets;
  }

  // Weekly: add up the days of each week
  const weekTotals = computeWeekTotals(dayTotals);

  const thisMonday = parseLocalDate(weekStartKey(today));
  for (let n = 5; n >= 0; n--) {
    const monday = new Date(thisMonday.getFullYear(), thisMonday.getMonth(), thisMonday.getDate() - 7 * n);
    buckets.push({
      label: monday.toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' }),
      ms: weekTotals[dateKey(monday)] || 0,
      isCurrent: n === 0,
    });
  }
  return buckets;
}

function renderTimeChart() {
  const period = statsPeriod.value;
  const buckets = buildBuckets(period, computeDayTotals());

  let total = 0;
  let max = 0;
  for (let i = 0; i < buckets.length; i++) {
    total += buckets[i].ms;
    if (buckets[i].ms > max) {
      max = buckets[i].ms;
    }
  }

  statsTotal.textContent = period === 'day'
    ? `Total des 7 derniers jours : ${formatShortDuration(total)}`
    : `Total des 6 dernières semaines (début le lundi) : ${formatShortDuration(total)}`;

  statsChart.innerHTML = '';
  for (let i = 0; i < buckets.length; i++) {
    const bucket = buckets[i];

    const column = document.createElement('div');
    column.className = 'chart-col';
    if (bucket.isCurrent) {
      column.classList.add('current');
    }
    column.title = `${bucket.label} : ${formatShortDuration(bucket.ms)}`;

    const value = document.createElement('span');
    value.className = 'chart-value';
    value.textContent = bucket.ms > 0 ? formatShortDuration(bucket.ms) : '';

    const area = document.createElement('div');
    area.className = 'chart-bar-area';

    const bar = document.createElement('div');
    bar.className = 'chart-bar';
    // Bar height = share of the biggest bar (at least 3% so it stays visible)
    const percent = max > 0 ? Math.max(3, Math.round((bucket.ms / max) * 100)) : 0;
    bar.style.height = bucket.ms > 0 ? `${percent}%` : '0';
    area.appendChild(bar);

    const label = document.createElement('span');
    label.className = 'chart-label';
    label.textContent = bucket.label;

    column.append(value, area, label);
    statsChart.appendChild(column);
  }
}

// Total time per category (all tasks, finished or not)
function computeCategoryTotals() {
  const totals = Object.create(null);
  let allTime = 0;
  for (let i = 0; i < tasks.length; i++) {
    const key = categoryLabel(tasks[i]);
    const ms = getElapsed(tasks[i]);
    totals[key] = (totals[key] || 0) + ms;
    allTime += ms;
  }

  // Category names, most time first
  const names = Object.keys(totals).sort((a, b) => totals[b] - totals[a]);
  return { totals: totals, names: names, allTime: allTime };
}

function renderCategoryStats() {
  const stats = computeCategoryTotals();
  const totals = stats.totals;
  const names = stats.names;
  const allTime = stats.allTime;

  statsCategories.innerHTML = '';

  if (allTime === 0) {
    statsTopCategory.textContent = 'Aucun temps enregistré pour l\'instant.';
    return;
  }

  const topPercent = Math.round((totals[names[0]] / allTime) * 100);
  statsTopCategory.textContent =
    `Tu passes le plus de temps sur « ${names[0]} » : ${formatShortDuration(totals[names[0]])} (${topPercent} % du temps suivi).`;

  for (let i = 0; i < names.length; i++) {
    const ms = totals[names[i]];
    const percent = Math.round((ms / allTime) * 100);

    const li = document.createElement('li');

    const head = document.createElement('div');
    head.className = 'cat-head';

    const name = document.createElement('span');
    name.textContent = names[i];

    const time = document.createElement('span');
    time.className = 'cat-time';
    time.textContent = `${formatShortDuration(ms)} · ${percent} %`;

    head.append(name, time);

    const track = document.createElement('div');
    track.className = 'bar-track';
    const fill = document.createElement('div');
    fill.className = 'bar-fill';
    fill.style.width = `${(ms / totals[names[0]]) * 100}%`;
    track.appendChild(fill);

    li.append(head, track);
    statsCategories.appendChild(li);
  }
}

function renderStats() {
  renderTimeChart();
  renderCategoryStats();
}

statsPeriod.addEventListener('change', renderStats);

// --- CSV export ---

// Excel in French settings expects ";" between columns; most other tools
// (Google Sheets, Numbers, Python...) are happy with either. Use "," if your
// spreadsheet shows everything in a single column the other way around.
const CSV_SEPARATOR = ';';

// 3725000 ms -> "1:02:05" (always hours:minutes:seconds)
function formatHMS(ms) {
  const totalSeconds = Math.round(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}:${pad(minutes)}:${pad(seconds)}`;
}

// Makes one value safe to put in a CSV cell
function csvEscape(value) {
  let text = String(value);

  // A cell starting with = + - @ could be run as a formula by Excel
  if (text.length > 0 && '=+-@'.includes(text.charAt(0))) {
    text = `'${text}`;
  }

  // Wrap in quotes if it contains the separator, a quote or a line break
  if (text.includes(CSV_SEPARATOR) || text.includes('"') || text.includes('\n')) {
    text = `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

// rows = array of arrays: [['Date', 'Secondes'], ['2026-10-12', 3600], ...]
function downloadCsv(filename, rows) {
  const lines = [];
  for (let i = 0; i < rows.length; i++) {
    const cells = [];
    for (let j = 0; j < rows[i].length; j++) {
      cells.push(csvEscape(rows[i][j]));
    }
    lines.push(cells.join(CSV_SEPARATOR));
  }

  // "﻿" at the start tells Excel the file is UTF-8 (so "é" displays right)
  const content = '﻿' + lines.join('\r\n');
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });

  // Trick: create a temporary invisible link and click it to start the download
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function exportTimeCsv() {
  const period = statsPeriod.value;
  const dayTotals = computeDayTotals();
  const totals = period === 'day' ? dayTotals : computeWeekTotals(dayTotals);

  // Every day (or week) with tracked time, oldest first
  const keys = Object.keys(totals).sort();
  if (keys.length === 0) {
    alert('Aucun temps enregistré à exporter pour l\'instant.');
    return;
  }

  const rows = [[period === 'day' ? 'Date' : 'Semaine (début le lundi)', 'Secondes', 'Durée (h:mm:ss)']];
  for (let i = 0; i < keys.length; i++) {
    rows.push([keys[i], Math.round(totals[keys[i]] / 1000), formatHMS(totals[keys[i]])]);
  }

  const name = period === 'day' ? 'jour' : 'semaine';
  downloadCsv(`temps-par-${name}-${todayString()}.csv`, rows);
}

function exportCategoriesCsv() {
  const stats = computeCategoryTotals();
  if (stats.allTime === 0) {
    alert('Aucun temps enregistré à exporter pour l\'instant.');
    return;
  }

  const rows = [['Catégorie', 'Secondes', 'Durée (h:mm:ss)', 'Part du temps (%)']];
  for (let i = 0; i < stats.names.length; i++) {
    const ms = stats.totals[stats.names[i]];
    rows.push([
      stats.names[i],
      Math.round(ms / 1000),
      formatHMS(ms),
      Math.round((ms / stats.allTime) * 100),
    ]);
  }

  downloadCsv(`temps-par-categorie-${todayString()}.csv`, rows);
}

document.getElementById('export-time-csv').addEventListener('click', exportTimeCsv);
document.getElementById('export-categories-csv').addEventListener('click', exportCategoriesCsv);

// --- Rendering: History view (completed tasks) ---

function createHistoryItem(task, showCategory) {
  const li = document.createElement('li');

  const info = document.createElement('div');
  info.className = 'history-info';

  const name = document.createElement('span');
  name.className = 'history-name';
  name.textContent = task.text;

  const date = document.createElement('small');
  date.className = 'history-date';
  date.textContent = new Date(task.completedAt).toLocaleString('fr-CA', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  info.append(name, date);
  li.appendChild(info);

  if (showCategory && task.category) {
    li.appendChild(createCategoryBadge(task.category));
  }

  const time = document.createElement('span');
  time.className = 'timer';
  time.textContent = formatTime(getElapsed(task));
  li.appendChild(time);

  return li;
}

function renderHistoryView() {
  const completed = [];
  let totalTime = 0;

  for (let i = 0; i < tasks.length; i++) {
    if (tasks[i].done) {
      completed.push(tasks[i]);
      totalTime += getElapsed(tasks[i]);
    }
  }

  // Most recently completed first
  completed.sort((a, b) => b.completedAt - a.completedAt);

  if (completed.length === 0) {
    historySummary.textContent = 'Aucune tâche terminée pour l\'instant.';
  } else {
    historySummary.textContent =
      `${completed.length} tâche(s) terminée(s) · ${formatTime(totalTime)} au total`;
  }

  historyList.innerHTML = '';

  if (historySort.value === 'category') {
    // Group tasks by category
    const groups = Object.create(null);
    for (let i = 0; i < completed.length; i++) {
      const key = categoryLabel(completed[i]);
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(completed[i]);
    }

    // Alphabetical order, "Sans catégorie" last
    const names = Object.keys(groups).sort((a, b) => {
      if (a === NO_CATEGORY) return 1;
      if (b === NO_CATEGORY) return -1;
      return a.localeCompare(b);
    });

    for (let i = 0; i < names.length; i++) {
      const name = names[i];
      const group = groups[name];
      const isExpanded = expandedCategories.includes(name);

      let groupTime = 0;
      for (let j = 0; j < group.length; j++) {
        groupTime += getElapsed(group[j]);
      }

      // One "card" per category
      const card = document.createElement('li');
      card.className = 'history-group';

      const header = document.createElement('div');
      header.className = 'history-group-header';

      const headerName = document.createElement('span');
      headerName.textContent = `${name} (${group.length})`;

      const headerTime = document.createElement('span');
      headerTime.className = 'history-group-time';
      headerTime.textContent = formatTime(groupTime);

      header.append(headerName, headerTime);

      // Collapsed: only the first few tasks. Expanded: all of them.
      const visibleCount = isExpanded ? group.length : Math.min(PREVIEW_COUNT, group.length);
      const items = document.createElement('ul');
      items.className = 'history-group-items';
      for (let j = 0; j < visibleCount; j++) {
        items.appendChild(createHistoryItem(group[j], false));
      }

      card.append(header, items);

      // Expand / collapse button, only needed if some tasks are hidden
      if (group.length > PREVIEW_COUNT) {
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'history-toggle';
        toggle.setAttribute('aria-expanded', String(isExpanded));
        toggle.textContent = isExpanded
          ? 'Réduire ▲'
          : `Voir les ${group.length - PREVIEW_COUNT} autres ▼`;
        toggle.addEventListener('click', () => {
          if (isExpanded) {
            expandedCategories.splice(expandedCategories.indexOf(name), 1);
          } else {
            expandedCategories.push(name);
          }
          renderHistoryView();
        });
        card.appendChild(toggle);
      }

      historyList.appendChild(card);
    }
  } else {
    for (let i = 0; i < completed.length; i++) {
      historyList.appendChild(createHistoryItem(completed[i], true));
    }
  }
}

historySort.addEventListener('change', renderHistoryView);

// --- Navigation between views ---

function showView(name) {
  for (let i = 0; i < tabs.length; i++) {
    tabs[i].classList.toggle('active', tabs[i].dataset.view === name);
  }

  // Show only the chosen view, hide the others
  const viewNames = Object.keys(views);
  for (let i = 0; i < viewNames.length; i++) {
    views[viewNames[i]].hidden = viewNames[i] !== name;
  }

  if (name === 'history') {
    renderHistoryView();
  }
  if (name === 'stats') {
    renderStats();
  }
}

for (let i = 0; i < tabs.length; i++) {
  tabs[i].addEventListener('click', () => {
    showView(tabs[i].dataset.view);
  });
}

// --- Events ---

form.addEventListener('submit', (event) => {
  event.preventDefault();

  saveSnapshot();
  tasks.push({
    text: input.value,
    category: categoryInput.value.trim(),
    dueDate: dueInput.value,
    priority: prioritySelect.value,
    done: false,
    completedAt: null,
    elapsed: 0,
    startedAt: null,
  });
  input.value = '';
  categoryInput.value = '';
  dueInput.value = '';
  prioritySelect.value = 'normal';
  renderTasks();
});

undoButton.addEventListener('click', undo);

categoryFilterSelect.addEventListener('change', () => {
  categoryFilter = categoryFilterSelect.value;
  renderTasks();
});

listSort.addEventListener('change', renderTasks);

// Refresh the displayed timers every second
setInterval(updateTimers, 1000);

// --- Startup ---

loadTasks();
renderTasks();
updateUndoButton();
