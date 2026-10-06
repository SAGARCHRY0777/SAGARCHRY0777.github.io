@echo off
REM Local preview. ES modules need a server - file:// will not work.
cd /d "%~dp0"
start "" http://localhost:5173
python -m http.server 5173
