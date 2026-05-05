import { defineConfig } from "deepsec/config";

export default defineConfig({
  projects: [
    { id: "vibebook", root: ".." },
    // <deepsec:projects-insert-above>
  ],
});
