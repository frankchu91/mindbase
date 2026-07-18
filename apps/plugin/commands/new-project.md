---
description: "Create a new project with template choice — interactive flow. Usage: /mb:new-project [template]"
---

Interactive project creation flow.

**Arguments**: `$ARGUMENTS`

Parse: first positional = template (optional).

**If template not specified**, list the 6 options:
1. `empty` — minimal blank
2. `investigation` — for tracking an open question / mystery
3. `literature-review` — academic-style paper review
4. `market-research` — product / market analysis
5. `reading-companion` — book / paper notes
6. `topic-tracker` — long-term topic monitoring

Ask the user to choose by number.

Then ask:
- Project name (will be slugified to projectId)
- One-line mission

Call `mindbase_init_project({ name, template, mission })`. If template != `empty`, then call `mindbase_apply_template({ projectId, templateId })` to overlay the chosen scaffold on top of the basic structure.

After success, write `currentProjectId` into `config.json` and report:
```
✓ Created project '<id>' with template '<template>'
Next: /mb:contribute to add your first source
```
