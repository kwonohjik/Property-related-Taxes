import fs from "node:fs";
const src = fs.readFileSync(process.argv[2], "utf8").split("\n");
// import block 1..82
const importText = src.slice(0, 83).join("\n");
const ids = new Map();
for (const m of importText.matchAll(/import\s*(type\s*)?\{([^}]*)\}\s*from\s*"([^"]+)"/g)) {
  for (const raw of m[2].split(",")) {
    const id = raw.trim().replace(/^type\s+/, "").split(/\s+as\s+/).pop().trim();
    if (id) ids.set(id, m[3]);
  }
}
const ranges = { step1: [103, 143], step2: [144, 525], step3: [526, 729], tail: [730, 775] };
const use = {};
for (const [k, [a, b]] of Object.entries(ranges)) {
  const body = src.slice(a - 1, b).join("\n");
  use[k] = [...ids.keys()].filter((id) => new RegExp(`\\b${id}\\b`).test(body));
}
const total = ids.size;
const only = (k) => use[k].filter((id) => Object.entries(use).every(([kk, v]) => kk === k || !v.includes(id)));
const shared23 = use.step2.filter((id) => use.step3.includes(id));
console.log(JSON.stringify({ totalImportedIds: total, importLines: 82,
  step1Ids: use.step1.length, step2Ids: use.step2.length, step3Ids: use.step3.length,
  step2Only: only("step2").length, step3Only: only("step3").length, shared23: shared23.length, shared23List: shared23,
  rangeLines: Object.fromEntries(Object.entries(ranges).map(([k,[a,b]])=>[k,b-a+1])) }, null, 1));
