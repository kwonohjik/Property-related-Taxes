/**
 * AI 사실 추출 서버 경로가 `"use client"` 모듈에 닿지 않는다.
 *
 * 닿으면 Next가 그 모듈의 함수를 클라이언트 참조로 바꿔 서버에서 부르는 순간 500이 난다
 * (2026-10-19 실측 — 「Attempted to call parseAmount() from the server」). vitest는 그 변환을 하지 않아
 * 함수 단위 테스트로는 드러나지 않으므로, import 그래프를 정적으로 따라가 막는다.
 * 타입 전용 import(`import type`)는 런타임에 사라지므로 따라가지 않는다.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const EXTS = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"];
const IMPORT = /^(?:import|export)\s+(?!type\b)[^;]*?from\s+["']([^"']+)["']|^import\s+["']([^"']+)["']/gms;

function resolve(from: string, spec: string): string | null {
  const base = spec.startsWith("@/")
    ? path.join(ROOT, spec.slice(2))
    : spec.startsWith(".")
      ? path.resolve(path.dirname(from), spec)
      : null;
  if (!base) return null;
  for (const e of EXTS) {
    const p = base + e;
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
  }
  return null;
}

/** 진입 파일에서 닿는 `"use client"` 모듈 → 그것을 가져온 파일 */
function clientModulesReachedFrom(entry: string): string[] {
  const parent = new Map<string, string | null>();
  const queue: [string, string | null][] = [[path.join(ROOT, entry), null]];
  while (queue.length) {
    const [file, from] = queue.shift()!;
    if (parent.has(file)) continue;
    parent.set(file, from);
    for (const m of fs.readFileSync(file, "utf8").matchAll(IMPORT)) {
      const r = resolve(file, m[1] ?? m[2]);
      if (r) queue.push([r, file]);
    }
  }
  return [...parent]
    .filter(([f]) => /^["']use client["']/.test(fs.readFileSync(f, "utf8").trimStart()))
    .map(([f, from]) => `${path.relative(ROOT, f)} ← ${from ? path.relative(ROOT, from) : "(진입)"}`);
}

describe("서버 경로 ↛ 클라이언트 모듈", () => {
  it("/api/one-house-ai/extract", () => {
    expect(clientModulesReachedFrom("app/api/one-house-ai/extract/route.ts")).toEqual([]);
  });
});
