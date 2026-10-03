#!/bin/zsh
# Собирает порцию цен Google Flights с этого Mac и отправляет файл в GitHub.
# Запускается по расписанию (launchd), см. scripts/install_launchd.sh
set -e
cd "$(dirname "$0")/.."
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
echo "=== $(date '+%Y-%m-%d %H:%M:%S') старт"
git pull --rebase -q origin master || true
LIMIT="${LIMIT:-20}" PAUSE_SEC="${PAUSE_SEC:-20}" .venv/bin/python scripts/google_flights.py
git add public/data/google.json
if ! git diff --cached --quiet; then
  git commit -q -m "data: Google Flights $(date '+%Y-%m-%d %H:%M') (mac)"
  git push -q origin master && echo "отправлено в GitHub"
else
  echo "изменений нет"
fi
echo "=== $(date '+%Y-%m-%d %H:%M:%S') конец"
