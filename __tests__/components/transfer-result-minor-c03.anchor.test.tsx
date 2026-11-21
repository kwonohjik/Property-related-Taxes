/**
 * anchor — 양도세 결과뷰 리뷰(2026-11-21) c03 MINOR 묶음: 공용 톤·법령 상수·금액 칸 정렬.
 *
 *  - R-c03-03 부분 비과세 근거 카드가 `ToneCard`(tones.ts 단일 소스) emerald 톤이다(종전 인라인 emerald 하드코딩).
 *  - R-c03-04 공매·경락(§164⑨2호)·공익수용(§164⑨1호) 특례 카드가 `ToneCard` amber 톤이고, 제목 조문이 법령 상수다
 *    (종전 리터럴 「소득령 §164⑨ N호」 — verify:legal 추적에서 빠졌다).
 *  - R-c03-05 §100③ 판정 표(취득·양도) 금액 칸이 `font-mono tabular-nums whitespace-nowrap text-right`이고 ko-KR 콤마다.
 *  (R-c03-02·R-c03-06은 `__tests__/calc/bg-redevelopment-sec166-conversion.anchor.test.tsx` W-5·W-7)
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { PartialExemptBasisCard } from "@/components/calc/results/shared/PartialExemptBasisCard";
import { AuctionValuationCard } from "@/components/calc/results/transfer/AuctionValuationCard";
import { ExpropriationValuationCard } from "@/components/calc/results/transfer/ExpropriationValuationCard";
import { AcqSplitJudgmentBlock } from "@/components/calc/results/transfer/AcqSplitJudgmentBlock";
import { SaleSplitJudgmentBlock } from "@/components/calc/results/transfer/SaleSplitJudgmentBlock";
import { TONE } from "@/components/calc/shared/tones";
import { TRANSFER } from "@/lib/tax-engine/legal-codes";
import type { AcqSplitJudgmentDetail, SaleSplitJudgmentDetail } from "@/lib/tax-engine/types/transfer-split-gain.types";

afterEach(cleanup);

const rootOf = (c: HTMLElement) => c.firstElementChild as HTMLElement;
const hasAll = (el: HTMLElement, classes: string) => classes.split(" ").every((k) => el.classList.contains(k));

describe("R-c03-03 부분 비과세 근거 카드 — ToneCard emerald", () => {
  it("껍데기 톤이 TONE.emerald.card이고 문구는 그대로다", () => {
    const c = render(
      <PartialExemptBasisCard
        result={{ isExempt: false, isPartialExempt: true, exemptReason: "1세대1주택 고가주택", steps: [] }}
        fallbackThresholdLabel="12억"
      />,
    ).container;
    expect(hasAll(rootOf(c), TONE.emerald.card)).toBe(true);
    expect(c.textContent).toContain("1세대1주택 특례 적용 — 1세대1주택 고가주택");
    expect(c.textContent).toContain("양도가액 12억원 초과분에 대해서만 과세됩니다 (소득세법 §89①3호·시행령 §160).");
  });
});

describe("R-c03-04 §164⑨ 특례 카드 — ToneCard amber · 조문 상수", () => {
  it("공매·경락(2호) — 제목이 TRANSFER.EXPROPRIATION_VALUATION_CLAUSE_2", () => {
    const c = render(
      <AuctionValuationCard detail={{ standardTotal: 500_000_000, auctionPrice: 420_000_000, chosen: 420_000_000, denominator: 420_000_000 }} />,
    ).container;
    expect(hasAll(rootOf(c), TONE.amber.card)).toBe(true);
    expect(c.textContent).toContain(`공매·경락 양도당시 기준시가 특례 (${TRANSFER.EXPROPRIATION_VALUATION_CLAUSE_2})`);
    expect(c.textContent).toContain("(소득세법 시행령 §164⑨ 2호)");
    expect(c.textContent).not.toContain("소득령");
  });

  it("공익수용(1호) — 제목이 TRANSFER.EXPROPRIATION_VALUATION_CLAUSE_1", () => {
    const c = render(
      <ExpropriationValuationCard
        detail={{ perSqmCandidates: { standard: 1_000_000, compensation: 900_000, basis: 950_000 }, chosenPerSqm: 900_000, area: 100, denominator: 90_000_000 }}
      />,
    ).container;
    expect(hasAll(rootOf(c), TONE.amber.card)).toBe(true);
    expect(c.textContent).toContain(`공익수용 양도당시 기준시가 특례 (${TRANSFER.EXPROPRIATION_VALUATION_CLAUSE_1})`);
    expect(c.textContent).not.toContain("소득령");
  });
});

describe("R-c03-05 §100③ 판정 표 금액 칸 — 정렬 클래스 · ko-KR 콤마", () => {
  const pair = (land: number, building: number) => ({ land, building });
  const AMOUNT = "font-mono tabular-nums whitespace-nowrap text-right";
  const amountCell = (c: HTMLElement, text: string) => [...c.querySelectorAll("span")].find((s) => s.textContent === text)!;

  it("취득 쪽(AcqSplitJudgmentBlock)", () => {
    const j: AcqSplitJudgmentDetail = {
      outcome: "deemed_unclear", declared: pair(100_000_000, 400_000_000), apportioned: pair(300_000_000, 200_000_000),
      applied: pair(300_000_000, 200_000_000), landDeviationBp: 6667, buildingDeviationBp: 10000, landOver: true, buildingOver: true,
    };
    const c = render(<AcqSplitJudgmentBlock j={j} />).container;
    for (const t of ["100,000,000", "400,000,000"]) expect(hasAll(amountCell(c, t), AMOUNT), t).toBe(true);
    expect(c.querySelectorAll("span.tabular-nums").length).toBeGreaterThanOrEqual(8);
  });

  it("양도 쪽(SaleSplitJudgmentBlock)", () => {
    const j: SaleSplitJudgmentDetail = {
      deemedUnclear: true, declared: pair(100_000_000, 400_000_000), apportioned: pair(300_000_000, 200_000_000),
      applied: pair(300_000_000, 200_000_000), basisKind: "std_price", landDeviationBp: 6667, buildingDeviationBp: 10000,
      landOver: true, buildingOver: true, era: "body_and_proviso",
    };
    const c = render(<SaleSplitJudgmentBlock j={j} />).container;
    for (const t of ["100,000,000", "400,000,000"]) expect(hasAll(amountCell(c, t), AMOUNT), t).toBe(true);
    expect(c.textContent).toContain("토지 300,000,000 · 건물 200,000,000");
  });
});
