# Bookmark Board

A Manifest V3 Chromium extension that replaces the New Tab page with a simple bookmark board. Top-level bookmark folders render as wrapping columns; nested folders render as sections within a column.

## Load locally

1. Visit `chrome://extensions` in Chrome or another Chromium browser.
2. Enable **Developer mode**.
3. Choose **Load unpacked** and select this folder.
4. Open a new tab.

The board reads from the browser's native bookmarks. Loose bookmarks appear in an **Others** column. Columns with more than ten bookmarks scroll. Drag a column header to save a board-only folder order with Chrome Sync; this does not change Chrome's native bookmark-folder order. Theme and column-width preferences are also saved with Chrome Sync.
