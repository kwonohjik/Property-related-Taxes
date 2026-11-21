import fs from "node:fs";
const base = fs.readFileSync(process.argv[2], "utf8");
const ei = fs.readFileSync(process.argv[3], "utf8");
const keys = [...base.matchAll(/^  ([a-zA-Z0-9_]+):/gm)].map((m) => m[1]);
const missing = keys.filter((k) => !new RegExp(`data\\.${k}\\b`).test(ei) && !ei.includes(`"${k}"`));
console.log("total", keys.length, "missing in engine-input:", missing.join(", "));
