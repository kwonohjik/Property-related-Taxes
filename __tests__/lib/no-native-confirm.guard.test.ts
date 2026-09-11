/**
 * 가드: 제품 코드에 `window.confirm` / 맨 `confirm(...)` 이 없다.
 *
 * ## 왜 스캔 가드인가
 *
 * 규약(`components/calc/CLAUDE.md:14`)과 메모리 `feedback_dialog_data_discard_confirm` 은
 * **데이터 손실 위험 액션**에 native `confirm()` 을 금지한다. 문언은 전역인데 **가드가
 * 없었다** — 그래서 2026-09-05 에 결과 화면 축만 고쳐지고 `ResetButton`(호출부 8곳)·
 * `HomeButton`(11곳)·주식 Step1(1곳)은 그대로 남았다. 가드가 좁은 것은 **없는 것과 증상이
 * 같다** ([[feedback_rule_wider_than_its_guard]]).
 *
 * ⚠️ 「몇 건인지 모른 채」 하드게이트를 걸면 CI 가 상시 빨간불이 되어 또 무력화된다.
 *    착수 전 전수를 세어 **0건으로 만든 뒤** 이 가드를 건다 — 지금이 그 상태다.
 *
 * 대상 밖(의도적):
 *  · `ConfirmDialog` 자체와 그 prop 이름(`confirmLabel`·`onConfirm`·`confirmMessage`)
 *  · 주석·문서에서 금지 사실을 **서술**하는 문장
 *  · 테스트·E2E (브라우저 native 다이얼로그를 다루는 헬퍼가 정당하게 있을 수 있다)
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const ROOTS = ["components", "app", "lib"];
const EXTS = new Set([".ts", ".tsx"]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (EXTS.has(extname(p))) out.push(p);
  }
  return out;
}

/** 주석 줄은 제외한다 — 금지 사실을 «서술»하는 문장이 스스로 걸리면 안 된다. */
function isComment(line: string): boolean {
  const t = line.trim();
  return t.startsWith("//") || t.startsWith("*") || t.startsWith("/*");
}

describe("[GUARD] native confirm 금지", () => {
  const files = ROOTS.flatMap((r) => walk(r));

  it("G-0: 스캔 모집단이 비어 있지 않다 (경로가 바뀌면 가드가 조용히 0건을 본다)", () => {
    expect(files.length).toBeGreaterThan(500);
  });

  it("G-1: `window.confirm` 호출이 없다", () => {
    const hits: string[] = [];
    for (const f of files) {
      readFileSync(f, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (isComment(line)) return;
          if (/window\.confirm\s*\(/.test(line)) hits.push(`${f}:${i + 1}`);
        });
    }
    expect(hits, `window.confirm 사용:\n${hits.join("\n")}`).toEqual([]);
  });

  it("G-2: 전역 `confirm(...)` 호출도 없다 (window. 접두 없이 부를 수 있다)", () => {
    const hits: string[] = [];
    for (const f of files) {
      readFileSync(f, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (isComment(line)) return;
          // `onConfirm(`·`setConfirm(`·`.confirm(` 같은 식별자 일부는 제외
          if (/(^|[^.\w])confirm\s*\(/.test(line)) hits.push(`${f}:${i + 1}\t${line.trim()}`);
        });
    }
    expect(hits, `전역 confirm() 사용:\n${hits.join("\n")}`).toEqual([]);
  });
});
