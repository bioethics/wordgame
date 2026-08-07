@echo off
REM ── Folio launcher ─────────────────────────────────────────────────────────
REM Double-click this file to play. It starts a tiny local web server in its own
REM window and opens the game in your default browser. To stop playing, close
REM the black server window that appears (or press Ctrl+C in it).

cd /d "%~dp0"

REM Start the server in a separate window so this one can open the browser.
start "Folio server (close to stop)" cmd /k python -m http.server 8431

REM Give the server a moment to wake up, then open the game.
timeout /t 1 /nobreak >nul
start "" http://localhost:8431
