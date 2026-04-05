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

ASSETS_DIR="/home/oris/assets/assets"
SOURCE_DIR="/home/oris/.openclaw/workspace/ombra_output/${ASSET_NAME}"

# Check if source exists
if [ ! -d "$SOURCE_DIR" ]; then
    echo "Error: Asset directory not found: $SOURCE_DIR"
    exit 1
fi

echo "Deploying ${ASSET_NAME}..."

# Create assets directory if it doesn't exist
mkdir -p "$ASSETS_DIR"

# Sanitize asset name for filenames
SAFE_NAME=$(echo "$ASSET_NAME" | sed 's/[^a-zA-Z0-9_-]/_/g')

# Copy presentation as asset-specific page
if [ -f "${SOURCE_DIR}/presentation.html" ]; then
    cp "${SOURCE_DIR}/presentation.html" "${ASSETS_DIR}/${SAFE_NAME}.html"
    echo "  ✓ Copied presentation.html"
fi

# Copy supporting files
if [ -f "${SOURCE_DIR}/backstory.txt" ]; then
    cp "${SOURCE_DIR}/backstory.txt" "${ASSETS_DIR}/${SAFE_NAME}_backstory.txt"
fi

if [ -f "${SOURCE_DIR}/SPEC.txt" ]; then
    cp "${SOURCE_DIR}/SPEC.txt" "${ASSETS_DIR}/${SAFE_NAME}_SPEC.txt"
fi

if [ -f "${SOURCE_DIR}/asset_image.png" ]; then
    cp "${SOURCE_DIR}/asset_image.png" "${ASSETS_DIR}/${SAFE_NAME}_wireframe.png"
fi

if [ -f "${SOURCE_DIR}/photorealistic.png" ]; then
    cp "${SOURCE_DIR}/photorealistic.png" "${ASSETS_DIR}/${SAFE_NAME}_photo.png"
fi

if [ -f "${SOURCE_DIR}/backstory.mp3" ]; then
    cp "${SOURCE_DIR}/backstory.mp3" "${ASSETS_DIR}/${SAFE_NAME}_audio.mp3"
fi

if [ -f "${SOURCE_DIR}/hint.txt" ]; then
    cp "${SOURCE_DIR}/hint.txt" "${ASSETS_DIR}/${SAFE_NAME}_hint.txt"
fi

# Generate updated gallery index
echo "Generating gallery..."

INDEX_HTML='<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Ombra Prime Assets</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: "Courier New", monospace; 
            background: #0a0a0f; 
            color: #00f7ff; 
            min-height: 100vh;
        }
        .header {
            background: linear-gradient(180deg, #1a1a2e 0%, #0a0a0f 100%);
            padding: 40px 20px;
            text-align: center;
            border-bottom: 1px solid #00f7ff33;
        }
        .header h1 { 
            font-size: 2.5em; 
            color: #ff9d00;
            text-shadow: 0 0 20px #ff9d0066;
            margin-bottom: 10px;
        }
        .header p { color: #00f7ff88; }
        .grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
            gap: 20px;
            padding: 40px;
        }
        .card {
            background: #151520;
            border: 1px solid #00f7ff33;
            border-radius: 8px;
            overflow: hidden;
            transition: all 0.3s ease;
        }
        .card:hover {
            border-color: #00f7ff;
            box-shadow: 0 0 20px #00f7ff33;
            transform: translateY(-4px);
        }
        .card-image {
            width: 100%;
            height: 200px;
            object-fit: cover;
            background: #000;
        }
        .card-content { padding: 20px; }
        .card-title { 
            color: #ff9d00; 
            font-size: 1.2em; 
            margin-bottom: 10px;
        }
        .card-meta { 
            font-size: 0.8em; 
            color: #00f7ff66;
            margin-bottom: 15px;
        }
        .card-link {
            display: inline-block;
            background: #00f7ff22;
            color: #00f7ff;
            padding: 8px 16px;
            text-decoration: none;
            border: 1px solid #00f7ff;
            border-radius: 4px;
            font-size: 0.9em;
        }
        .card-link:hover {
            background: #00f7ff;
            color: #0a0a0f;
        }
        .no-assets {
            text-align: center;
            padding: 80px;
            color: #00f7ff66;
        }
        .footer {
            text-align: center;
            padding: 40px;
            color: #00f7ff44;
            font-size: 0.8em;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>Ombra Prime Assets</h1>
        <p>Generated assets from the Ombra Prime universe</p>
    </div>
    <div class="grid">
'

# Find all deployed assets
DEPLOYED_ASSETS=()
for f in /home/oris/assets/assets/*_backstory.txt; do
    if [ -f "$f" ]; then
        NAME=$(basename "$f" | sed 's/_backstory.txt$//')
        # Get asset title from backstory (first line, remove # and ASSET: prefix)
        TITLE=$(head -1 "$f" 2>/dev/null | sed 's/^#*\s*ASSET:\s*//' | sed 's/^#\s*//')
        if [ -z "$TITLE" ]; then
            TITLE="$NAME"
        fi
        
        # Check for images
        WIREFRAME="/home/oris/assets/assets/${NAME}_wireframe.png"
        PHOTO="/home/oris/assets/assets/${NAME}_photo.png"
        IMG=""
        if [ -f "$PHOTO" ]; then
            IMG="$PHOTO"
        elif [ -f "$WIREFRAME" ]; then
            IMG="$WIREFRAME"
        fi
        
        # Check for audio
        AUDIO="/home/oris/assets/assets/${NAME}_audio.mp3"
        HAS_AUDIO=""
        if [ -f "$AUDIO" ]; then
            HAS_AUDIO=" 🎙️"
        fi
        
        # Build card
        INDEX_HTML="${INDEX_HTML}        <div class=\"card\">
            <img class=\"card-image\" src=\"assets/${NAME}_photo.png\" onerror=\"this.src='assets/${NAME}_wireframe.png'\" alt=\"${TITLE}\">
            <div class=\"card-content\">
                <div class=\"card-title\">${TITLE}${HAS_AUDIO}</div>
                <div class=\"card-meta\">${NAME}</div>
                <a class=\"card-link\" href=\"assets/${NAME}.html\">View Presentation</a>
            </div>
        </div>\n"
    fi
done

INDEX_HTML="${INDEX_HTML}    </div>
    <div class=\"footer\">
        Generated with Ombra Prime Asset Pipeline
    </div>
</body>
</html>"

# Write index
echo "$INDEX_HTML" > /home/oris/assets/index.html

echo "  ✓ Generated gallery index"

# Git add, commit, push
cd /home/oris/assets
git add .

# Check if there are changes
if git diff --staged --quiet; then
    echo "No changes to deploy."
    exit 0
fi

COMMIT_MSG="Deploy ${ASSET_NAME} - $(date '+%Y-%m-%d %H:%M')"
git commit -m "$COMMIT_MSG"
git push

echo ""
echo "✅ Deployed! Check https://steffost.github.io/assets/"
