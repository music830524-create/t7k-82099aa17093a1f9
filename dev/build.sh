#!/bin/sh
# Rebuild ../app.js and ../sw.js from src/. Run: npm ci && ./build.sh
set -e
cd "$(dirname "$0")"
node_modules/.bin/esbuild src/main.tsx --bundle --minify --format=iife --charset=utf8 --target=es2017,safari13 --define:process.env.NODE_ENV='"production"' --outfile=../app.js
V=$(cat ../app.js ../style.css ../index.html ../ex/*.json sw.template.js | sha1sum | cut -c1-10)
sed "s/__VERSION__/$V/" sw.template.js > ../sw.js
echo "built $V"
