/**
 * 표2 **대상 판정**(거주 2년)이 읽는 거주 개월은 한 leaf다 — `resolveTable2SubjectResidenceMonths`(겸용은 최소입력 코어 `table2SubjectResidenceMonths`).
 *
 * 대법원 2026.1.15. 선고 2025두34935: 표2의 거주기간은 양도자가 취득일부터 양도일까지 보유하는 동안 거주한 기간이다(상속도 같다).
 * 비과세 거주요건 leaf(`resolveExemptionRequirementResidenceMonths` — 상속 전 동거·증여 전 동일세대 거주 통산)를 표2 대상 판정이 읽으면
 * 판례와 다른 표2가 열린다. 부수토지 카드 · §98의2 특칙 · 직전거주주택보유주택 고지 · 겸용주택 · 재개발 승계가 같은 leaf를 읽는지
 * 호출부 전수를 정적으로 고정한다(술어 사본 금지). 지점 수도 고정한다 — 다른 leaf로 새 대입이 생기면 수가 어긋나 드러난다.
 *
 * 공제율 거주분(`residenceYears`)은 본인 거주(`residencePeriodMonths`)여야 하므로 이 가드의 대상이 아니다 — 아래 짝이 그 분리를 고정한다.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const SITES: { file: string; count: number; leaf: string }[] = [
  { file: "lib/tax-engine/transfer-tax-lthd.ts", count: 2, leaf: "resolveTable2SubjectResidenceMonths(" }, // 부수토지 카드 · 일반 경로(L-2·L-3·용도변경 공유)
  { file: "lib/tax-engine/transfer-tax-lthd-982-step.ts", count: 1, leaf: "resolveTable2SubjectResidenceMonths(" },
  { file: "lib/tax-engine/transfer-tax-rental-housing-judge.ts", count: 1, leaf: "resolveTable2SubjectResidenceMonths(" },
  { file: "lib/tax-engine/transfer-tax-mixed-use.ts", count: 1, leaf: "table2SubjectResidenceMonths(asset.residencePeriodYears * 12" },
];

/** 주석을 뺀 코드 줄. */
const codeLines = (file: string) =>
  readFileSync(file, "utf-8")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"));

describe("표2 대상 판정 거주 개월 — 호출부 전수가 같은 leaf를 읽는다 (대법원 2025두34935)", () => {
  it.each(SITES)("$file — 대입 $count곳 모두 표2 대상 판정 leaf", ({ file, count, leaf }) => {
    const lines = codeLines(file).filter((l) => /table2ResidenceYears\w*\s*=\s*Math\.floor\(/.test(l));
    expect(lines, `${file} 의 표2 대상 판정 대입 수`).toHaveLength(count);
    for (const l of lines) {
      expect(l, `${file}: ${l.trim()}`).toContain(leaf);
      expect(l, `${file}: 비과세 거주요건 leaf를 읽으면 안 된다`).not.toContain("resolveExemptionRequirementResidenceMonths");
      expect(l, `${file}: 겸용 통산값(table2ResidencePeriodYears)을 읽으면 안 된다`).not.toContain("table2ResidencePeriodYears");
    }
  });

  it("[짝] 공제율 거주분은 본인 거주 개월이다 — 통산 leaf를 읽지 않는다", () => {
    const rateLines = codeLines("lib/tax-engine/transfer-tax-lthd.ts").filter((l) => /const residenceYears\s*=\s*Math\.floor\(/.test(l));
    expect(rateLines.length).toBeGreaterThanOrEqual(2);
    for (const l of rateLines) expect(l).toContain("input.residencePeriodMonths");
    for (const l of rateLines) expect(l).not.toContain("resolveExemption");
  });

  it("[재개발 승계] 표2 대상 판정은 본인 신축 거주다 — 증여 승계 종전주택 거주(successorGiftSameHousehold)를 읽지 않는다", () => {
    const successor = codeLines("lib/tax-engine/redevelopment-successor.ts").join("\n");
    expect(successor).not.toContain("successorGiftSameHousehold");
    expect(successor).toMatch(/computeLthdRateSplit\([\s\S]*?successorResidenceYears,\s*successorResidenceYears,/);
    const lthd = codeLines("lib/tax-engine/redevelopment-lthd.ts").join("\n");
    const usesTable2 = lthd.slice(lthd.indexOf("export function redevUsesTable2"));
    expect(usesTable2).toContain("resolveSuccessorOwnResidenceMonths(months)");
    expect(usesTable2).not.toContain("successorGiftSameHousehold");
  });
});
