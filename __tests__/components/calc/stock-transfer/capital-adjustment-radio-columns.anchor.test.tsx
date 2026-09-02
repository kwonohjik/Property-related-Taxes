/**
 * @vitest-environment jsdom
 *
 * 자본조정 유형 라디오 — **2열 2행 + 개발자 말 제거**.
 *
 * 진단(2026-09-02): 선택지 4개가 세로로 쌓여 자본조정 «행 하나»가 4행을 먹었다.
 * 자본조정은 「+ 행 추가」로 여러 건이 되므로 낭비가 곱해진다.
 *
 * ⚠️ `layout="inline"`이 아니라 `columns={2}`다 — 이 그룹의 description은
 *    **조문과 과세 구분**을 담는다:
 *      무상증자 자본준비금   §17②2호 가목 단서 (1)  → 양도세 (단가 환산)
 *      무상증자 이익잉여금   §17②2호 가목 본문      → 의제배당 (배당소득)
 *      무상감자 비례·결손보전 형식감자              → 양도세
 *      무상감자 자본환급     §17②1호               → 의제배당 (배당소득)
 *    지우면 **무상증자 두 종류를 가를 근거가 사라진다**. inline은 쓸 수 없다.
 *
 * 🔴 「본 엔진 skip」은 개발자 말이었다. 엔진 실측(`stock-capital-adjustments.ts:101~110`,
 *    `lot-capital-adjustments.ts:102~113`)으로 두 유형은 `skipped = true` —
 *    **주식수도 단가도 조정하지 않는다**. 화면 문구를 그 사실대로 바꾼다.
 */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const FILE = "components/calc/stock-transfer/CapitalAdjustmentsBlock.tsx";
const src = () => fs.readFileSync(path.join(process.cwd(), FILE), "utf-8");

/** 자본조정 유형 라디오 블록만 잘라낸다 */
function typeRadio() {
  const s = src();
  const i = s.indexOf("<RadioCardGroup", s.indexOf("capitalAdjustment-${idx}-type") - 200);
  expect(i).toBeGreaterThan(-1);
  const j = s.indexOf("/>", s.indexOf("]}", i));
  return s.slice(i, j);
}

describe("CA — 자본조정 유형 라디오", () => {
  it("CA-1 columns={2} — 4행 세로 쌓기 회귀 차단", () => {
    expect(typeRadio()).toContain("columns={2}");
  });

  it("CA-2 stack 유지 — inline이면 조문 description이 통째로 사라진다", () => {
    const b = typeRadio();
    expect(b).toContain('layout="stack"');
    expect(b).not.toContain('layout="inline"');
  });

  it("CA-3 네 유형의 description이 살아 있다 (조문·과세 구분 근거)", () => {
    const b = typeRadio();
    expect(b).toContain("§17②2호 가목 단서 (1)");
    expect(b).toContain("§17②2호 가목 본문");
    expect(b).toContain("§17②1호");
    expect(b).toContain("형식감자");
  });

  it("CA-4 「본 엔진 skip」 같은 개발자 말이 화면에 남아 있지 않다", () => {
    const s = src();
    expect(s).not.toContain("본 엔진 skip");
    expect(s).not.toContain("엔진 skip");
  });

  it("CA-5 그 자리를 엔진 실제 동작 서술이 대신한다", () => {
    const s = src();
    // skipped=true — 주식수·단가 어느 쪽도 건드리지 않는다
    const hits = s.match(/주식수·단가를 조정하지 않습니다/g) ?? [];
    expect(hits.length).toBe(2); // 이익잉여금 무상증자 · 자본환급 무상감자
    expect(s).toContain("이 계산기에서 계산하지 않음");
  });

  it("CA-6 값(type enum)은 그대로다 — 엔진 계약", () => {
    const b = typeRadio();
    for (const v of ["bonus_capital_reserve", "bonus_retained_earnings",
                     "reduction_proportional", "reduction_capital_return"]) {
      expect(b).toContain(`value: "${v}"`);
    }
  });
});
