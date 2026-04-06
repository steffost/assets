#!/bin/bash
# backup.sh - Nightly backup for Ombra Prime system
# Creates a dated backup of world_bible, skills, config and recent assets

BACKUP_DIR="/home/oris/.openclaw/workspace/backups"
DATE=$(date +%Y-%m-%d)
BACKUP_PATH="${BACKUP_DIR}/backup_${DATE}"

echo "🗄️ Starting Ombra Prime Backup..."
echo "📁 Target: ${BACKUP_PATH}"

# Create backup directory
mkdir -p "${BACKUP_PATH}"

# Backup world_bible (all XML files - the lore universe)
echo "  📚 Backing up world_bible..."
cp -r /home/oris/.openclaw/workspace/ombra_world/world_bible "${BACKUP_PATH}/" 2>/dev/null

# Backup custom skills
echo "  ⚙️ Backing up skills..."
cp -r /home/oris/.openclaw/workspace/skills "${BACKUP_PATH}/" 2>/dev/null

# Backup OpenClaw config
echo "  🔧 Backing up openclaw.json..."
cp /home/oris/.openclaw/openclaw.json "${BACKUP_PATH}/" 2>/dev/null

# Backup bridge.js and deploy.sh
echo "  🌐 Backing up GitHub Pages bridge..."
mkdir -p "${BACKUP_PATH}/github_assets"
cp /home/oris/assets/bridge.js "${BACKUP_PATH}/github_assets/" 2>/dev/null
cp /home/oris/assets/deploy.sh "${BACKUP_PATH}/github_assets/" 2>/dev/null

# Backup recent ombra_output (last 10 assets)
echo "  🎨 Backing up recent assets..."
mkdir -p "${BACKUP_PATH}/ombra_output_recent"
cd /home/oris/.openclaw/workspace/ombra_output
ls -td */ 2>/dev/null | head -10 | while read dir; do
    cp -r "${dir}" "${BACKUP_PATH}/ombra_output_recent/" 2>/dev/null
done

# Create backup info
cat > "${BACKUP_PATH}/backup_info.txt" << EOF
Ombra Prime Backup
Date: ${DATE}
Time: $(date +%H:%M:%S)

Contents:
- world_bible/    (universe lore files)
- skills/         (custom skills)
- openclaw.json   (configuration)
- github_assets/  (bridge.js, deploy.sh)
- ombra_output_recent/ (10 most recent assets)

Total size: $(du -sh "${BACKUP_PATH}" | cut -f1)
EOF

# Clean up old backups (keep last 7 days)
echo "  🧹 Cleaning up old backups (keeping last 7 days)..."
find "${BACKUP_DIR}" -type d -name "backup_*" -mtime +7 -exec rm -rf {} \; 2>/dev/null

# Create symlink to latest
ln -sfn "${BACKUP_PATH}" "${BACKUP_DIR}/latest"

echo ""
echo "✅ Backup complete!"
echo "📦 Location: ${BACKUP_PATH}"
echo "📊 Size: $(du -sh "${BACKUP_PATH}" | cut -f1)"
echo "🔗 Latest: ${BACKUP_DIR}/latest"

# Optionally push to GitHub as extra backup
if [ "$1" = "--push" ]; then
    echo ""
    echo "📤 Pushing to GitHub backup repo..."
    cd "${BACKUP_PATH}" || exit
    git init -q 2>/dev/null
    git add -A 2>/dev/null
    git commit -q -m "Backup ${DATE}" 2>/dev/null
    # Note: Would need a backup repo configured
fi
