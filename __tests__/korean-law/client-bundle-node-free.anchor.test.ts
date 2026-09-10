/**
 * 클라이언트 번들에 **Node 전용 모듈**이 딸려 들어가지 않는지 정적으로 지킨다.
 *
 * 🔴 2026-09-11 실측 사고: 「오늘(KST)」 헬퍼를 client-core.ts 에 두었는데, 그 파일은
 *    파일 캐시 때문에 `fs/promises` 를 import 한다. date-parser 가 그것을 참조하고
 *    date-parser 는 DecisionSearchTab(클라이언트 컴포넌트)이 쓰므로,
 *    `/law` 페이지가 통째로 컴파일 실패했다:
 *      Module not found: Can't resolve 'fs/promises'
 *
 *    ⚠ **typecheck 도 vitest 도 이걸 못 잡는다** — 둘 다 번들링을 하지 않는다.
 *      CI 에서는 E2E 가 24분을 헛돌다 timeout-minutes 에 걸려 "cancelled" 로 표시됐고,
 *      원인이 로그 깊숙이 묻혀 «CI 인프라 문제»로 오독하기 쉬웠다.
 *    ⇒ 이 anchor 가 그 층을 대신 지킨다. `npm run build` 없이도 pre-push 에서 걸린다.
 */
import fs from "fs";
import path from "path";
import { describe, it, expect } from "vitest";

const ROOT = process.cwd();

/** 브라우저 번들에 들어가면 즉시 빌드가 깨지는 Node 전용 모듈 */
const NODE_ONLY = new Set([
  "fs", "fs/promises", "node:fs", "node:fs/promises",
  "child_process", "node:child_process",
  "net", "node:net", "tls", "node:tls", "dns", "node:dns",
]);

/** 진입점 — "use client" 가 붙은 법령 리서치 UI */
function clientEntrypoints(): string[] {
  const dirs = [path.join(ROOT, "app/law/_components"), path.join(ROOT, "components/ui")];
  const out: string[] = [];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!/\.tsx?$/.test(f)) continue;
      const p = path.join(dir, f);
      const src = fs.readFileSync(p, "utf8");
      if (/^\s*["']use client["']/m.test(src)) out.push(p);
    }
  }
  return out;
}

function resolveSpecifier(spec: string, from: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = path.join(ROOT, spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(from), spec);
  else return null; // npm 패키지 — 번들러 소관
  for (const cand of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")]) {
    if (fs.existsSync(cand) && fs.statSync(cand).isFile()) return cand;
  }
  return null;
}

/** 정적 import/export-from 만 본다(동적 import 는 번들러가 분리한다). */
function staticSpecifiers(src: string): string[] {
  const out: string[] = [];
  const re = /(?:^|\n)\s*(?:import|export)\b[^;\n]*?from\s*["']([^"']+)["']/g;
  const bare = /(?:^|\n)\s*import\s*["']([^"']+)["']/g;
  for (const m of src.matchAll(re)) out.push(m[1]);
  for (const m of src.matchAll(bare)) out.push(m[1]);
  return out;
}

describe("BUNDLE — 클라이언트 진입점에서 Node 전용 모듈에 도달하지 않는다", () => {
  it("BUNDLE-1: /law 클라이언트 컴포넌트의 정적 import 그래프가 fs 계열을 건드리지 않는다", () => {
    const entries = clientEntrypoints();
    expect(entries.length).toBeGreaterThan(0); // 진입점을 못 찾으면 이 테스트는 무의미하다

    const seen = new Set<string>();
    const violations: string[] = [];
    const walk = (file: string, chain: string[]) => {
      if (seen.has(file)) return;
      seen.add(file);
      const src = fs.readFileSync(file, "utf8");
      for (const spec of staticSpecifiers(src)) {
        if (NODE_ONLY.has(spec)) {
          violations.push(`${[...chain, path.relative(ROOT, file)].join(" → ")}  ⟶  ${spec}`);
          continue;
        }
        const next = resolveSpecifier(spec, file);
        if (next) walk(next, [...chain, path.relative(ROOT, file)]);
      }
    };
    for (const e of entries) walk(e, []);

    expect(violations).toEqual([]);
  });
});
