# Runs the MindBase MCP server (stdio) — used by Glama's automated
# evaluation and anyone who prefers a containerized MCP server.
# The web UI is not included; see `npx mindbase-app` for that.
FROM node:20-slim
RUN npm install -g mindbase-mcp
ENTRYPOINT ["mindbase-mcp"]
