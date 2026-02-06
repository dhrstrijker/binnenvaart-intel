#!/bin/bash
# Pre-commit hook for Claude Code: runs pytest + frontend build before git commit

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

# Only intercept git commit commands
if ! echo "$COMMAND" | grep -q 'git commit'; then
  exit 0
fi

echo "Running pre-commit checks..." >&2

# Run Python tests
echo "  Running pytest..." >&2
cd "$CLAUDE_PROJECT_DIR/scraper" && source venv/bin/activate && python -m pytest tests/ -q 2>&1
PYTEST_EXIT=$?
deactivate 2>/dev/null

if [ $PYTEST_EXIT -ne 0 ]; then
  jq -n '{
    "hookSpecificOutput": {
      "hookEventName": "PreToolUse",
      "permissionDecision": "deny",
      "permissionDecisionReason": "pytest failed — fix the test failures before committing."
    }
  }'
  exit 0
fi

# Run frontend build
echo "  Running frontend build..." >&2
cd "$CLAUDE_PROJECT_DIR/frontend" && npm run build --silent 2>&1
BUILD_EXIT=$?

if [ $BUILD_EXIT -ne 0 ]; then
  jq -n '{
    "hookSpecificOutput": {
      "hookEventName": "PreToolUse",
      "permissionDecision": "deny",
      "permissionDecisionReason": "Frontend build failed — fix the build errors before committing."
    }
  }'
  exit 0
fi

echo "  All checks passed!" >&2
exit 0
