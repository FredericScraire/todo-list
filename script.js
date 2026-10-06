const form = document.getElementById('task-form');
const input = document.getElementById('task-input');
const categoryInput = document.getElementById('category-input');
const categoryOptions = document.getElementById('category-options');
const list = document.getElementById('task-list');
const undoButton = document.getElementById('undo-button');

const tabs = document.querySelectorAll('.nav-tab');
const views = {
  list: document.getElementById('view-list'),
  history: document.getElementById('view-history'),
};
const historySummary = document.getElementById('history-summary');
const historyList = document.getElementById('history-list');
const historySort = document.getElementById('history-sort');

const NO_CATEGORY = 'Sans catégorie';
const PREVIEW_COUNT = 3; // tasks shown per category when collapsed
const expandedCategories = []; // names of the categories currently expanded

const tasks = [];

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

// Suggest categories that already exist while typing (<datalist>)
function updateCategoryOptions() {
  const seen = [];
  for (let i = 0; i < tasks.length; i++) {
    const category = tasks[i].category;
    if (category && !seen.includes(category)) {
      seen.push(category);
    }
  }

  categoryOptions.innerHTML = '';
  for (let i = 0; i < seen.length; i++) {
    const option = document.createElement('option');
    option.value = seen[i];
    categoryOptions.appendChild(option);
  }
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
  task.elapsed = getElapsed(task);
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
    timerElements[i].textContent = formatTime(getElapsed(tasks[i]));
  }
}

// --- Rendering: List view ---

function renderTasks() {
  list.innerHTML = '';
  updateCategoryOptions();
  saveTasks(); // every change goes through here, so we save here

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];

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
    timer.textContent = formatTime(getElapsed(task));

    const deleteButton = document.createElement('button');
    deleteButton.textContent = '🗑️';
    deleteButton.className = 'delete-button';
    deleteButton.setAttribute('aria-label', 'Supprimer la tâche');
    deleteButton.addEventListener('click', () => {
      saveSnapshot();
      tasks.splice(i, 1);
      renderTasks();
    });

    li.append(playButton, checkbox, label);
    if (task.category) {
      li.appendChild(createCategoryBadge(task.category));
    }
    li.append(timer, deleteButton);
    list.appendChild(li);
  }
}

function createCategoryBadge(category) {
  const badge = document.createElement('small');
  badge.className = 'category-badge';
  badge.textContent = category;
  return badge;
}

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
    const groups = {};
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

  views.list.hidden = name !== 'list';
  views.history.hidden = name !== 'history';

  if (name === 'history') {
    renderHistoryView();
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
    done: false,
    completedAt: null,
    elapsed: 0,
    startedAt: null,
  });
  input.value = '';
  categoryInput.value = '';
  renderTasks();
});

undoButton.addEventListener('click', undo);

// Refresh the displayed timers every second
setInterval(updateTimers, 1000);

// --- Startup ---

loadTasks();
renderTasks();
updateUndoButton();
