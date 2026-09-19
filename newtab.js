const board = document.querySelector('#board');
const status = document.querySelector('#status');
const searchInput = document.querySelector('#search-input');
const columnsSelect = document.querySelector('#columns-select');
const themeSelect = document.querySelector('#theme-select');
const bookmarkTemplate = document.querySelector('#bookmark-template');

let folders = [];
let query = '';
let folderOrder = [];
let draggedFolderId = null;
const MAX_VISIBLE_BOOKMARKS = 10;

function domainFor(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

function faviconFor(url) {
  // Chromium supplies cached site icons through this internal URL; a CSS fallback
  // makes a failed icon unobtrusive.
  return `chrome://favicon2/?size=32&scale_factor=1x&page_url=${encodeURIComponent(url)}`;
}

function bookmarkMatches(bookmark) {
  const haystack = `${bookmark.title || ''} ${bookmark.url || ''}`.toLowerCase();
  return haystack.includes(query);
}

function matchingChildren(children) {
  return children.reduce((matches, item) => {
    if (item.url && bookmarkMatches(item)) matches.push(item);
    if (item.children) {
      const nested = matchingChildren(item.children);
      if (nested.length) matches.push({ ...item, children: nested });
    }
    return matches;
  }, []);
}

function bookmarkElement(bookmark) {
  const item = bookmarkTemplate.content.firstElementChild.cloneNode(true);
  const icon = item.querySelector('.favicon');
  item.href = bookmark.url;
  item.querySelector('.bookmark-title').textContent = bookmark.title || domainFor(bookmark.url);
  item.querySelector('.bookmark-domain').textContent = domainFor(bookmark.url);
  icon.src = faviconFor(bookmark.url);
  icon.addEventListener('error', () => { icon.style.visibility = 'hidden'; }, { once: true });
  return item;
}

function appendItems(container, children) {
  for (const item of children) {
    if (item.url) {
      container.append(bookmarkElement(item));
    } else if (item.children?.length) {
      const title = document.createElement('div');
      title.className = 'section-title';
      title.textContent = item.title || 'Untitled folder';
      container.append(title);
      appendItems(container, item.children);
    }
  }
}

function countBookmarks(children) {
  return children.reduce((total, item) => total + (item.url ? 1 : countBookmarks(item.children || [])), 0);
}

function orderedFolders(source) {
  const byId = new Map(source.map(folder => [folder.id, folder]));
  const saved = folderOrder.map(id => byId.get(id)).filter(Boolean);
  const unsaved = source.filter(folder => !folderOrder.includes(folder.id));
  return [...saved, ...unsaved];
}

function moveFolderTo(id, targetId, placeAfter) {
  const nextOrder = orderedFolders(folders).map(folder => folder.id);
  const currentIndex = nextOrder.indexOf(id);
  const targetIndex = nextOrder.indexOf(targetId);
  if (currentIndex < 0 || targetIndex < 0 || id === targetId) return;
  nextOrder.splice(currentIndex, 1);
  const destinationIndex = nextOrder.indexOf(targetId) + (placeAfter ? 1 : 0);
  nextOrder.splice(destinationIndex, 0, id);
  folderOrder = nextOrder;
  chrome.storage.sync.set({ folderOrder });
  render();
}

function limitLongColumns() {
  for (const content of board.querySelectorAll('.column-content.is-scrollable')) {
    const tenthBookmark = content.querySelectorAll('.bookmark')[MAX_VISIBLE_BOOKMARKS - 1];
    if (tenthBookmark) content.style.maxHeight = `${tenthBookmark.offsetTop + tenthBookmark.offsetHeight + 5}px`;
  }
}

function clearInsertionMarkers() {
  board.querySelectorAll('.is-insert-before, .is-insert-after').forEach(item =>
    item.classList.remove('is-insert-before', 'is-insert-after'));
}

function render() {
  board.replaceChildren();
  const allFolders = orderedFolders(folders);
  const visibleFolders = allFolders.map(folder => ({ ...folder, children: matchingChildren(folder.children || []) }))
    .filter(folder => folder.children.length);
  status.textContent = query
    ? `${countBookmarks(visibleFolders)} matching bookmark${countBookmarks(visibleFolders) === 1 ? '' : 's'}`
    : `${allFolders.length} folder${allFolders.length === 1 ? '' : 's'}`;

  if (!visibleFolders.length) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = query ? 'No bookmarks match your search.' : 'No bookmark folders found.';
    board.append(empty);
    return;
  }

  for (const folder of visibleFolders) {
    const column = document.createElement('article');
    column.className = 'column';
    column.dataset.folderId = folder.id;
    const heading = document.createElement('header');
    heading.className = 'column-heading';
    heading.draggable = true;
    heading.title = 'Drag to reorder this folder';
    heading.setAttribute('aria-label', `Drag ${folder.title || 'Others'} to reorder folders`);
    const title = document.createElement('span');
    title.className = 'folder-name';
    title.textContent = folder.title || 'Other bookmarks';
    title.title = title.textContent;
    const count = document.createElement('span');
    count.className = 'count';
    const bookmarkCount = countBookmarks(folder.children);
    count.textContent = bookmarkCount;
    heading.append(title, count);
    const content = document.createElement('div');
    content.className = 'column-content';
    if (bookmarkCount > MAX_VISIBLE_BOOKMARKS) content.classList.add('is-scrollable');
    appendItems(content, folder.children);
    column.append(heading, content);
    heading.addEventListener('dragstart', event => {
      draggedFolderId = folder.id;
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', folder.id);
      column.classList.add('is-dragging');
    });
    heading.addEventListener('dragend', () => {
      draggedFolderId = null;
      board.querySelectorAll('.is-dragging').forEach(item => item.classList.remove('is-dragging'));
      clearInsertionMarkers();
    });
    column.addEventListener('dragover', event => {
      if (!draggedFolderId || draggedFolderId === folder.id) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      const sourceIndex = allFolders.findIndex(item => item.id === draggedFolderId);
      const targetIndex = allFolders.findIndex(item => item.id === folder.id);
      clearInsertionMarkers();
      column.classList.add(sourceIndex < targetIndex ? 'is-insert-after' : 'is-insert-before');
    });
    column.addEventListener('dragleave', event => {
      if (!column.contains(event.relatedTarget)) {
        column.classList.remove('is-insert-before', 'is-insert-after');
      }
    });
    column.addEventListener('drop', event => {
      event.preventDefault();
      const id = draggedFolderId || event.dataTransfer.getData('text/plain');
      const sourceIndex = allFolders.findIndex(item => item.id === id);
      const targetIndex = allFolders.findIndex(item => item.id === folder.id);
      // The source and target positions express the intended insertion side
      // consistently, including when the grid has wrapped onto another row.
      const placeAfter = sourceIndex < targetIndex;
      clearInsertionMarkers();
      moveFolderTo(id, folder.id, placeAfter);
    });
    board.append(column);
  }
  requestAnimationFrame(limitLongColumns);
}

async function loadBookmarks() {
  status.textContent = 'Loading bookmarks…';
  const tree = await chrome.bookmarks.getTree();
  const roots = tree[0]?.children || [];
  const groupedFolders = roots.flatMap(root =>
    (root.children || []).filter(item => item.children?.length)
  );
  const looseBookmarks = roots.flatMap(root =>
    (root.children || []).filter(item => item.url)
  );
  // Loose bookmarks do not belong to a user-created folder, so group them in
  // one predictable board column rather than leaving them off the board.
  folders = looseBookmarks.length
    ? [...groupedFolders, { id: '__bookmark_board_others__', title: 'Others', children: looseBookmarks }]
    : groupedFolders;
  render();
}

function applyPreferences({ columns = '4', theme = 'system', folderOrder: savedFolderOrder = [] }) {
  columnsSelect.value = columns;
  themeSelect.value = theme;
  folderOrder = savedFolderOrder;
  board.style.setProperty('--columns', columns);
  document.documentElement.dataset.theme = theme === 'system' ? '' : theme;
}

searchInput.addEventListener('input', event => { query = event.target.value.trim().toLowerCase(); render(); });
document.addEventListener('keydown', event => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault(); searchInput.focus();
  }
});
columnsSelect.addEventListener('change', () => {
  const columns = columnsSelect.value;
  board.style.setProperty('--columns', columns);
  chrome.storage.sync.set({ columns });
});
themeSelect.addEventListener('change', () => {
  const theme = themeSelect.value;
  document.documentElement.dataset.theme = theme === 'system' ? '' : theme;
  chrome.storage.sync.set({ theme });
});
chrome.bookmarks.onCreated.addListener(loadBookmarks);
chrome.bookmarks.onRemoved.addListener(loadBookmarks);
chrome.bookmarks.onChanged.addListener(loadBookmarks);
chrome.bookmarks.onMoved.addListener(loadBookmarks);

chrome.storage.sync.get({ columns: '4', theme: 'system', folderOrder: [] }).then(async preferences => {
  applyPreferences(preferences);
  await loadBookmarks();
});
