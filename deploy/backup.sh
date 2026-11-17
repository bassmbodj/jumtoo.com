#!/bin/sh
# Sauvegarde quotidienne (cron sur l'hôte) : 0 2 * * * /opt/jumtoo/deploy/backup.sh
# Copie cohérente de la base, conservée 30 jours. Copiez aussi le dossier ailleurs (stockage objet, autre serveur).
set -e
cd "$(dirname "$0")/.."
docker compose exec -T jumtoo node --no-warnings=ExperimentalWarning src/cli.js backup
docker compose exec -T jumtoo sh -c 'find /data/backups -name "*.sqlite" -mtime +30 -delete'
