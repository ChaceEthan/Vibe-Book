import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "deepsec/config";

const infoPath = path.join(process.cwd(), ".deepsec", "data", "vibebook", "INFO.md");

export default defineConfig({
  dataDir: ".deepsec/data",
  projects: [
    {
      id: "vibebook",
      root: ".",
      githubUrl: "https://github.com/ChaceEthan/Vibe-Book/blob/main",
      infoMarkdown: fs.existsSync(infoPath) ? fs.readFileSync(infoPath, "utf-8") : "",
      priorityPaths: ["backend/src/", "frontend/src/"],
    },
  ],
});
