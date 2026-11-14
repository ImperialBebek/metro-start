# Tests

`regression.py` opens `newtab.html` in Chromium with [Playwright](https://playwright.dev/python/) and checks the main features end to end:

- default tiles and the Games folder, drag and drop, nested folders, the tile editor
- bookmark import (folders kept, duplicates and bookmarklets skipped, sharp icons, erase-and-import, undo)
- weather, News and Markets widgets
- search, backup round-trip, flip-on-open
- the games (saved progress, Solitaire auto-finish, Minesweeper first click, Five Letters, Snake, Sudoku)
- parallax and the wallpaper gallery

Every network request is answered with simulated data (weather, headlines, prices, Wikimedia, websites), and the Chrome extension APIs are stubbed, so the suite runs offline and gives the same results every time.

## Run

```bash
pip install -r tests/requirements.txt
python -m playwright install chromium
python tests/regression.py
```

Each check prints `PASS` or `FAIL`, followed by a total. The script exits with code 1 if anything fails, so it can run in CI.

To use a particular browser binary, set `CHROME_PATH`:

```bash
CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" python tests/regression.py
```

`fixtures/` holds the stand-in images the simulated services return.
