#!/bin/bash
# deploy.sh - Deploy an asset presentation to GitHub Pages
# Usage: ./deploy.sh [asset-name]
# Example: ./deploy.sh The_Dewpoint

ASSET_NAME="$1"

if [ -z "$ASSET_NAME" ]; then
    echo "Usage: ./deploy.sh [asset-name]"
    echo "Example: ./deploy.sh The_Dewpoint"
    exit 1
fi

SOURCE_DIR="/home/oris/.openclaw/workspace/ombra_output/${ASSET_NAME}"
PRESENTATION_SOURCE="${SOURCE_DIR}/presentation.html"
PRESENTATION_DEST="index.html"

# Check if source exists
if [ ! -d "$SOURCE_DIR" ]; then
    echo "Error: Asset directory not found: $SOURCE_DIR"
    exit 1
fi

# Check if presentation exists
if [ ! -f "$PRESENTATION_SOURCE" ]; then
    echo "Error: presentation.html not found in $SOURCE_DIR"
    exit 1
fi

echo "Deploying ${ASSET_NAME}..."

# Copy presentation
cp "$PRESENTATION_SOURCE" "$PRESENTATION_DEST"

# Also copy supporting files if they exist
if [ -f "${SOURCE_DIR}/backstory.txt" ]; then
    cp "${SOURCE_DIR}/backstory.txt" .
fi

if [ -f "${SOURCE_DIR}/SPEC.txt" ]; then
    cp "${SOURCE_DIR}/SPEC.txt" .
fi

if [ -f "${SOURCE_DIR}/asset_image.png" ]; then
    cp "${SOURCE_DIR}/asset_image.png" .
fi

if [ -f "${SOURCE_DIR}/photorealistic.png" ]; then
    cp "${SOURCE_DIR}/photorealistic.png" .
fi

# Git add, commit, push
git add .

COMMIT_MSG="Deploy ${ASSET_NAME} - $(date '+%Y-%m-%d %H:%M')"
git commit -m "$COMMIT_MSG"
git push

echo ""
echo "✅ Deployed! Check https://steffost.github.io/assets/"
