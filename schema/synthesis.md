# Active Wiki Engine Preamble

This file is prepended to the prompts used by MindBase's three Active Wiki engines:

- **Synthesis** — "what does my wiki collectively know about TOPIC"
- **Network** — semantic neighbors + missing-link suggestions
- **Curation** — daily pulse contradictions

The file ships empty so the engines use their built-in templates as-is. Add
instructions here to customize how the LLM frames synthesis output for your
wiki. Examples:

- "Always use Chinese for synthesis output, even if some source notes are in English."
- "Emphasize contradictions over agreements — I value disagreement detection."
- "For research notes, cite paper authors when known."

Leave blank to use built-in defaults.
