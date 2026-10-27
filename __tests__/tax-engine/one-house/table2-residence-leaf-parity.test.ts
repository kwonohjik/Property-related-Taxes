/**
 * 표2 **대상 판정**(거주 2년)이 읽는 거주 개월은 한 leaf다 — `resolveExemptionRequirementResidenceMonths` (결정 #38-9).
 *
 * 증여 전 동일세대 거주 개월을 표2 대상 판정에 통산하므로(사전-2025-법규재산-0506), 대상 판정 호출부가 하나라도 옛 값
 * (`resolveExemptionResidenceMonths` · `residencePeriodMonths`)을 읽으면 같은 입력에 경로별로 표2 여부가 갈린다 —
 * 부수토지 카드 · §98의2 특칙 · 직전거주주택보유주택 고지가 그 경로다. 호출부 전수를 정적으로 고정한다(술어 사본 금지).
 *
 * 공제율 거주분(`residenceYears`)은 본인 거주(`residencePeriodMonths`)여야 하므로 이 가드의 대상이 아니다 — 아래 짝이 그 분리를 고정한다.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const SITES: { file: string; count: number }[] = [
  { file: "lib/tax-engine/transfer-tax-lthd.ts", count: 2 }, // 부수토지 카드 · 일반 경로(L-2·L-3·용도변경 공유)
  { file: "lib/tax-engine/transfer-tax-lthd-982-step.ts", count: 1 },
  { file: "lib/tax-engine/transfer-tax-rental-housing-judge.ts", count: 1 },
];

/** 주석을 뺀 코드 줄에서 `table2ResidenceYears…= Math.floor(…)` 대입을 찾는다. */
function table2Assignments(file: string): string[] {
  return readFileSync(file, "utf-8")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
    .filter((l) => /table2ResidenceYears\w*\s*=\s*Math\.floor\(/.test(l));
}

describe("표2 대상 판정 거주 개월 — 호출부 전수가 같은 leaf를 읽는다 (#38-9)", () => {
  it.each(SITES)("$file — 대입 $count곳 모두 resolveExemptionRequirementResidenceMonths", ({ file, count }) => {
    const lines = table2Assignments(file);
    expect(lines, `${file} 의 표2 대상 판정 대입 수`).toHaveLength(count);
    for (const l of lines) {
      expect(l, `${file}: ${l.trim()}`).toContain("resolveExemptionRequirementResidenceMonths(");
    }
  });

  it("[짝] 공제율 거주분은 본인 거주 개월이다 — 통산 leaf를 읽지 않는다", () => {
    const src = readFileSync("lib/tax-engine/transfer-tax-lthd.ts", "utf-8");
    const rateLines = src
      .split("\n")
      .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
      .filter((l) => /const residenceYears\s*=\s*Math\.floor\(/.test(l));
    expect(rateLines.length).toBeGreaterThanOrEqual(2);
    for (const l of rateLines) expect(l).toContain("input.residencePeriodMonths");
    for (const l of rateLines) expect(l).not.toContain("resolveExemption");
  });
});
