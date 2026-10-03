#!/bin/zsh
# Ставит задание launchd: каждые 3 часа запускать scripts/collect_and_push.sh
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLIST="$HOME/Library/LaunchAgents/ru.rioradar.google-flights.plist"
mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>ru.rioradar.google-flights</string>
  <key>ProgramArguments</key><array><string>/bin/zsh</string><string>$ROOT/scripts/collect_and_push.sh</string></array>
  <key>StartInterval</key><integer>10800</integer>
  <key>RunAtLoad</key><false/>
  <key>StandardOutPath</key><string>$HOME/Library/Logs/rio-radar.log</string>
  <key>StandardErrorPath</key><string>$HOME/Library/Logs/rio-radar.log</string>
</dict></plist>
PL
launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"
echo "Задание установлено: $PLIST (каждые 3 часа). Лог: ~/Library/Logs/rio-radar.log"
echo "Удалить: launchctl unload $PLIST && rm $PLIST"
