import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * 입력 화면 안내문 길이 정책 — 정적 가드.
 *
 * hint 삭제 캠페인이 세 라운드째 싸운 것은 «지우기»가 아니라 **재성장**이다. 지운 자리에
 * 다음 기능이 또 긴 문장을 넣으면 원점이다. placeholder 축을 `placeholder-policy.test.ts`가
 * 막듯, 안내문 길이는 여기서 막는다.
 *
 * 🔑 길이 자체가 죄는 아니다 — 조문 열거처럼 **길 수밖에 없는 설명**은 있다. 다만 그것이
 *    입력칸 밑에 평문으로 깔리면 검증 오류·차단 메시지를 밀어낸다. 그런 설명의 자리는
 *    `<CollapsibleHintCard>`다(접힘 + **인쇄 시 자동 노출** — 법적 설명이 PDF에서 사라지지
 *    않는다). 이 가드는 「길면 접어라」를 강제하는 것이지 설명을 지우라는 것이 아니다.
 *
 * ⚠️ 순수 정적 분석이라 렌더가 필요 없다 ⇒ pre-push와 CI 전체 테스트 양쪽에서 자동으로 잡힌다.
 */

const ROOTS = ["components/calc", "app/calc"];

/** 2026-09-07 실측 = 0. 4라운드가 150자 이상 3건을 전부 접힘 카드로 강등했다. 늘리지 않는다. */
const LONG_HINT_MAX = 0;
const LIMIT = 150;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

function collect(): { file: string; kind: string; len: number; text: string }[] {
  const hits: { file: string; kind: string; len: number; text: string }[] = [];
  for (const root of ROOTS) {
    for (const f of walk(root)) {
      const src = readFileSync(f, "utf-8");
      // hint="…" · description="…" · hint={"…"}
      for (const m of src.matchAll(/\b(hint|description)\s*=\s*\{?\s*"([^"]+)"\s*\}?/g)) {
        const text = m[2];
        if (text.length >= LIMIT) {
          hits.push({ file: f, kind: m[1], len: text.length, text });
        }
      }
    }
  }
  return hits;
}

describe("입력 화면 안내문 길이 정책 — 정적 가드", () => {
  it("스캐너가 안내문을 실제로 보고 있다 (구별력 바닥)", () => {
    // 임계를 0으로 낮추면 수백 건이 잡혀야 한다 — 0건이면 정규식이 아무것도 못 본 것이다.
    let seen = 0;
    for (const root of ROOTS) {
      for (const f of walk(root)) {
        const src = readFileSync(f, "utf-8");
        seen += [...src.matchAll(/\b(hint|description)\s*=\s*\{?\s*"([^"]+)"\s*\}?/g)].length;
      }
    }
    expect(seen).toBeGreaterThan(200);
  });

  it(`🔑 ${LIMIT}자 이상 안내문이 늘지 않는다 (길면 CollapsibleHintCard로)`, () => {
    const hits = collect();
    const detail = hits.map((h) => `${h.file} [${h.kind}] ${h.len}자: ${h.text.slice(0, 60)}…`);
    expect(detail.length, detail.join("\n")).toBeLessThanOrEqual(LONG_HINT_MAX);
  });
});
