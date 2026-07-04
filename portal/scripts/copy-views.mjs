import fs from "node:fs";

fs.cpSync("src/views", "dist/views", { recursive: true });
