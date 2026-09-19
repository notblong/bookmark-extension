const board = document.querySelector('#board');
const status = document.querySelector('#status');
const searchInput = document.querySelector('#search-input');
const columnsSelect = document.querySelector('#columns-select');
const themeSelect = document.querySelector('#theme-select');
const bookmarkTemplate = document.querySelector('#bookmark-template');

let folders = [];
let query = '';

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

function appendItems(container, children, nested = false) {
  for (const item of children) {
    if (item.url) {
      container.append(bookmarkElement(item));
    } else if (item.children?.length) {
      const title = document.createElement('div');
      title.className = 'section-title';
      title.textContent = item.title || 'Untitled folder';
      container.append(title);
      appendItems(container, item.children, true);
    }
  }
}

function countBookmarks(children) {
  return children.reduce((total, item) => total + (item.url ? 1 : countBookmarks(item.children || [])), 0);
}

function render() {
  board.replaceChildren();
  const visibleFolders = folders.map(folder => ({ ...folder, children: matchingChildren(folder.children || []) }))
    .filter(folder => folder.children.length);
  status.textContent = query
    ? `${countBookmarks(visibleFolders)} matching bookmark${countBookmarks(visibleFolders) === 1 ? '' : 's'}`
    : `${folders.length} folder${folders.length === 1 ? '' : 's'}`;

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
    const heading = document.createElement('header');
    heading.className = 'column-heading';
    const title = document.createElement('span');
    title.className = 'folder-name';
    title.textContent = folder.title || 'Other bookmarks';
    title.title = title.textContent;
    const count = document.createElement('span');
    count.className = 'count';
    count.textContent = countBookmarks(folder.children);
    heading.append(title, count);
    const content = document.createElement('div');
    content.className = 'column-content';
    appendItems(content, folder.children);
    column.append(heading, content);
    board.append(column);
  }
}

async function loadBookmarks() {
  status.textContent = 'Loading bookmarks…';
  const tree = await chrome.bookmarks.getTree();
  // The first root child is the bookmarks bar in Chromium. Include every root
  // category that contains folders, while avoiding loose URLs at the root.
  folders = (tree[0]?.children || []).flatMap(root =>
    (root.children || []).filter(item => item.children?.length)
  );
  render();
}

function applyPreferences({ columns = '4', theme = 'system' }) {
  columnsSelect.value = columns;
  themeSelect.value = theme;
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

chrome.storage.sync.get({ columns: '4', theme: 'system' }).then(async preferences => {
  applyPreferences(preferences);
  await loadBookmarks();
});
