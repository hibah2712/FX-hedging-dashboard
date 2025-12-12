@echo off
echo Starting FX Dashboard...
echo Local Server: http://localhost:8000
start http://localhost:8000
python -m http.server 8000
pause
