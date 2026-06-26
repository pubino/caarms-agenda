#!/bin/zsh

echo "===================================================="
echo " Starting CAARMS 2026 Kiosk Dashboard local server  "
echo "===================================================="
echo "Open your browser or monitor display and load:"
echo "👉 http://localhost:8080"
echo "===================================================="

# Start python built-in simple HTTP server on port 8080
python3 -m http.server 8080
