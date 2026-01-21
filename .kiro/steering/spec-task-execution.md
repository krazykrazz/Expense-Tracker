---
inclusion: fileMatch
fileMatchPattern: ".kiro/specs/**/tasks.md"
---

# Spec Task Execution - Feature Branch Check

## ⚠️ MANDATORY FIRST STEP ⚠️

**BEFORE implementing ANY task from a spec, you MUST:**

1. Check the current git branch: `git branch --show-current`
2. If on `main` branch, STOP and ask the user:

> "You're on the main branch. Would you like me to create a feature branch for this spec before starting implementation? Suggested branch name: `feature/<spec-name>`"

3. Wait for user confirmation before:
   - Creating the feature branch, OR
   - Proceeding on main if they explicitly prefer

## Why This Matters

- Feature branches isolate work and allow clean `--no-ff` merges
- Working directly on main risks polluting the main branch with incomplete work
- This is a project requirement, not a suggestion

## DO NOT SKIP THIS CHECK

Even if the user says "implement task X" or "run all tasks", the branch check comes FIRST.
