#!/usr/bin/env bash
# MFE Static Scanner — no AI required
# Usage: ./scan.sh [path-to-mfe-repo]
# Output: mfe-map.md in the current directory

set -euo pipefail

REPO="${1:-.}"
OUT="mfe-map.md"
TS=$(date '+%Y-%m-%d %H:%M')

echo "# MFE Code Map — generated $TS" > "$OUT"
echo "Repo: $REPO" >> "$OUT"
echo "" >> "$OUT"

# ── 1. Folder structure ──────────────────────────────────────────────────────
echo "## 1. Top-Level Structure" >> "$OUT"
echo '```' >> "$OUT"
find "$REPO" -maxdepth 2 -type d \
  ! -path "*/node_modules*" ! -path "*/.git*" ! -path "*/.next*" \
  ! -path "*/dist*" ! -path "*/build*" ! -path "*/.cache*" \
  | sort | sed "s|$REPO/||" >> "$OUT"
echo '```' >> "$OUT"
echo "" >> "$OUT"

# ── 2. Module federation configs ────────────────────────────────────────────
echo "## 2. Module Federation Configs" >> "$OUT"
MF_FILES=$(find "$REPO" -type f \( -name "webpack.config.*" -o -name "vite.config.*" -o -name "rspack.config.*" \) \
  ! -path "*/node_modules*" 2>/dev/null || true)

if [ -z "$MF_FILES" ]; then
  echo "(none found)" >> "$OUT"
else
  for f in $MF_FILES; do
    rel="${f#$REPO/}"
    echo "### $rel" >> "$OUT"
    echo '```' >> "$OUT"
    # Extract lines mentioning federation, exposes, remotes, shared
    grep -i -A2 "ModuleFederation\|exposes\|remotes\|shared" "$f" 2>/dev/null | head -60 >> "$OUT" || echo "(no federation config detected)" >> "$OUT"
    echo '```' >> "$OUT"
    echo "" >> "$OUT"
  done
fi

# ── 3. Pages / Route files ───────────────────────────────────────────────────
echo "## 3. Pages & Route Files" >> "$OUT"

echo "### Page components (src/pages/ or src/views/)" >> "$OUT"
echo '```' >> "$OUT"
find "$REPO" -type f \( -name "*.tsx" -o -name "*.jsx" \) \
  ! -path "*/node_modules*" ! -path "*/dist*" ! -path "*/build*" \
  | grep -i -E "/pages/|/views/|/screens/" 2>/dev/null \
  | sed "s|$REPO/||" | sort >> "$OUT" || echo "(none found)" >> "$OUT"
echo '```' >> "$OUT"
echo "" >> "$OUT"

echo "### Router definitions" >> "$OUT"
echo '```' >> "$OUT"
find "$REPO" -type f \( -name "*.tsx" -o -name "*.ts" -o -name "*.jsx" -o -name "*.js" \) \
  ! -path "*/node_modules*" ! -path "*/dist*" \
  | xargs grep -l "createBrowserRouter\|BrowserRouter\|Routes\|Route path\|createRouter\|RouterProvider" 2>/dev/null \
  | sed "s|$REPO/||" | sort >> "$OUT" || echo "(none found)" >> "$OUT"
echo '```' >> "$OUT"
echo "" >> "$OUT"

echo "### Route paths defined in code" >> "$OUT"
echo '```' >> "$OUT"
find "$REPO" -type f \( -name "*.tsx" -o -name "*.ts" -o -name "*.jsx" -o -name "*.js" \) \
  ! -path "*/node_modules*" ! -path "*/dist*" \
  | xargs grep -h "path=['\"]\/[^'\"]*['\"]" 2>/dev/null \
  | grep -oE "path=['\"][^'\"]+['\"]" \
  | sort -u >> "$OUT" || echo "(none found)" >> "$OUT"
echo '```' >> "$OUT"
echo "" >> "$OUT"

# ── 4. Components ────────────────────────────────────────────────────────────
echo "## 4. Components" >> "$OUT"
echo '```' >> "$OUT"
find "$REPO" -type f \( -name "*.tsx" -o -name "*.jsx" \) \
  ! -path "*/node_modules*" ! -path "*/dist*" ! -path "*/build*" \
  ! -path "*/__tests__*" ! -path "*/*.test.*" ! -path "*/*.spec.*" \
  | grep -i -E "/components?/|/features?/|/modules?/|/ui/" 2>/dev/null \
  | sed "s|$REPO/||" | sort >> "$OUT" || echo "(none found)" >> "$OUT"
echo '```' >> "$OUT"
echo "" >> "$OUT"

# ── 5. Custom hooks ──────────────────────────────────────────────────────────
echo "## 5. Custom Hooks" >> "$OUT"
echo '```' >> "$OUT"
find "$REPO" -type f \( -name "use*.ts" -o -name "use*.tsx" \) \
  ! -path "*/node_modules*" ! -path "*/dist*" ! -path "*/build*" \
  ! -name "*.test.*" ! -name "*.spec.*" \
  | sed "s|$REPO/||" | sort >> "$OUT" || echo "(none found)" >> "$OUT"
echo '```' >> "$OUT"
echo "" >> "$OUT"

# Show each hook's exported name + first-line return
echo "### Hook exports" >> "$OUT"
echo '```' >> "$OUT"
find "$REPO" -type f \( -name "use*.ts" -o -name "use*.tsx" \) \
  ! -path "*/node_modules*" ! -path "*/dist*" \
  ! -name "*.test.*" ! -name "*.spec.*" \
  | while read -r f; do
    rel="${f#$REPO/}"
    exports=$(grep -oE "export (default )?function use[A-Za-z0-9_]+" "$f" 2>/dev/null | head -3 | tr '\n' ', ')
    [ -n "$exports" ] && echo "$rel  →  $exports"
  done | sort >> "$OUT" || true
echo '```' >> "$OUT"
echo "" >> "$OUT"

# ── 6. State management ───────────────────────────────────────────────────────
echo "## 6. State Management" >> "$OUT"

echo "### Redux slices" >> "$OUT"
echo '```' >> "$OUT"
find "$REPO" -type f \( -name "*.ts" -o -name "*.tsx" \) \
  ! -path "*/node_modules*" ! -path "*/dist*" \
  | xargs grep -l "createSlice\|createReducer" 2>/dev/null \
  | sed "s|$REPO/||" | sort >> "$OUT" || echo "(none)" >> "$OUT"
echo '```' >> "$OUT"

echo "### Zustand stores" >> "$OUT"
echo '```' >> "$OUT"
find "$REPO" -type f \( -name "*.ts" -o -name "*.tsx" \) \
  ! -path "*/node_modules*" ! -path "*/dist*" \
  | xargs grep -l "create(" 2>/dev/null \
  | xargs grep -l "zustand\|from 'zustand'" 2>/dev/null \
  | sed "s|$REPO/||" | sort >> "$OUT" || echo "(none)" >> "$OUT"
echo '```' >> "$OUT"

echo "### React Contexts" >> "$OUT"
echo '```' >> "$OUT"
find "$REPO" -type f \( -name "*.ts" -o -name "*.tsx" \) \
  ! -path "*/node_modules*" ! -path "*/dist*" \
  | xargs grep -l "createContext" 2>/dev/null \
  | sed "s|$REPO/||" | sort >> "$OUT" || echo "(none)" >> "$OUT"
echo '```' >> "$OUT"
echo "" >> "$OUT"

# ── 7. API / service files ───────────────────────────────────────────────────
echo "## 7. API & Service Layer" >> "$OUT"

echo "### Service / API files" >> "$OUT"
echo '```' >> "$OUT"
find "$REPO" -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" \) \
  ! -path "*/node_modules*" ! -path "*/dist*" \
  | grep -i -E "/services?/|/api/|/queries?/|/mutations?/" 2>/dev/null \
  | sed "s|$REPO/||" | sort >> "$OUT" || echo "(none found)" >> "$OUT"
echo '```' >> "$OUT"
echo "" >> "$OUT"

echo "### Endpoint patterns" >> "$OUT"
echo '```' >> "$OUT"
find "$REPO" -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" \) \
  ! -path "*/node_modules*" ! -path "*/dist*" \
  | xargs grep -h "axios\.\|fetch(\|\.get(\|\.post(\|\.put(\|\.patch(\|\.delete(" 2>/dev/null \
  | grep -oE "(get|post|put|patch|delete|fetch)\(['\"][^'\"]+['\"]" \
  | sort -u | head -50 >> "$OUT" || echo "(none found)" >> "$OUT"
echo '```' >> "$OUT"
echo "" >> "$OUT"

# ── 8. Cross-MFE events ───────────────────────────────────────────────────────
echo "## 8. Cross-MFE Communication" >> "$OUT"

echo "### CustomEvent dispatches" >> "$OUT"
echo '```' >> "$OUT"
find "$REPO" -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" \) \
  ! -path "*/node_modules*" ! -path "*/dist*" \
  | xargs grep -h "dispatchEvent\|CustomEvent\|window\.addEventListener" 2>/dev/null \
  | sort -u | head -30 >> "$OUT" || echo "(none found)" >> "$OUT"
echo '```' >> "$OUT"
echo "" >> "$OUT"

# ── 9. Shared packages ────────────────────────────────────────────────────────
echo "## 9. Shared Packages / Libs" >> "$OUT"
echo '```' >> "$OUT"
find "$REPO" -maxdepth 3 -name "package.json" \
  ! -path "*/node_modules*" ! -path "*/dist*" \
  | while read -r f; do
    rel="${f#$REPO/}"
    name=$(grep '"name"' "$f" 2>/dev/null | head -1 | grep -oE '"[^"]*"' | tail -1 | tr -d '"')
    [ -n "$name" ] && echo "$rel  →  $name"
  done | sort >> "$OUT" || echo "(none found)" >> "$OUT"
echo '```' >> "$OUT"
echo "" >> "$OUT"

# ── 10. Quick index ───────────────────────────────────────────────────────────
echo "## 10. File Count Summary" >> "$OUT"
echo '```' >> "$OUT"
echo "Total .tsx files:"
find "$REPO" -name "*.tsx" ! -path "*/node_modules*" ! -path "*/dist*" | wc -l >> "$OUT"
find "$REPO" -name "*.tsx" ! -path "*/node_modules*" ! -path "*/dist*" | wc -l | xargs -I{} echo "  .tsx: {}" >> "$OUT"
find "$REPO" -name "*.ts"  ! -name "*.d.ts" ! -path "*/node_modules*" ! -path "*/dist*" | wc -l | xargs -I{} echo "  .ts:  {}" >> "$OUT"
find "$REPO" -name "*.test.*" ! -path "*/node_modules*" | wc -l | xargs -I{} echo "  test files: {}" >> "$OUT"
find "$REPO" -name "use*.ts" -o -name "use*.tsx" | grep -v node_modules | grep -v dist | wc -l | xargs -I{} echo "  custom hooks: {}" >> "$OUT"
echo '```' >> "$OUT"

echo ""
echo "✓ Map written to $OUT"
echo "  Open it in any markdown viewer or paste into a model with the prompt:"
echo "  'Here is a static code map of my React MFE repo. Analyse it and explain: ...'"
