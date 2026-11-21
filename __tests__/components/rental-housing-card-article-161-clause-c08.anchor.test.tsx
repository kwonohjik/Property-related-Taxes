/**
 * 결과뷰 리뷰 2026-11-21 c08 MINOR — 장기임대주택 거주주택 특례 결과 카드(`RentalHousingExceptionDetailCard`) 표시 anchor. 세액 불변(표시 전용).
 *
 * R-c08-09 호별 판정 기준이 `{derivedArticle}목`이라 구 임대주택법 매입(엔진 `구법`)이 「구법목」으로 찍혔다
 *   → 미충족 문구(`fail-messages.ts`)와 같은 「구 임대주택법 매입임대 — 가목」(`rentalArticleLabel` 단일 소스).
 * R-c08-10 B(직전거주주택보유주택) 비과세 칸 라벨이 「시행령 §161①」 고정이라 고가주택(RH-B2)도 §161①로 찍혔다
 *   → 소득세법 시행령 §161②(「제1항에도 불구하고 … 고가주택인 경우 … 합산한 금액」, MST 290841 원문 확인 2026-11-22).
 *   같은 라벨 helper(`nontaxableIncomeLabel` — 명세서·신고서·PDF)도 B2면 §161②.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { calculateRentalHousingException, type RentalHousingExceptionInput } from "@/lib/tax-engine/transfer-tax/rental-housing-exception";
import { nontaxableIncomeLabel } from "@/lib/tax-engine/transfer-tax/rental-housing-exception/display-labels";
import { RentalHousingExceptionDetailCard } from "@/components/calc/results/transfer/RentalHousingExceptionDetailCard";

afterEach(cleanup);

/** 2012.3. 구 임대주택법 매입(비아파트) 1호 · 직전거주주택 2019.6. 양도 — rh-b2-prhp-high-value 시료의 임대주택만 바꿨다 */
const input = (rentalCategory: "pre_2018" | "long_general"): RentalHousingExceptionInput => ({
  applyException: true,
  scenario: "B",
  rentalUnits: [
    {
      businessRegistrationDate: new Date("2012-03-01"),
      rentalRegistrationDate: new Date("2012-03-01"),
      rentalCategory,
      rentalAcquisitionType: "purchase",
      isApartment: false,
      region: "non-metro",
      isExcluded918Rule: false,
      standardPriceAtRentalStart: 200_000_000,
      hasMinimum2Units: false,
      rentalMonths: 120,
      rentalAutoTermination: false,
      requirementsConfirmed: true,
    },
  ],
  priorResidenceTransferDate: new Date("2019-06-01"),
  standardPriceAtAcquisition: 400_000_000,
  standardPriceAtPriorTransfer: 700_000_000,
  standardPriceAtTransfer: 1_000_000_000,
});

const run = (price: number, category: "pre_2018" | "long_general" = "pre_2018") =>
  calculateRentalHousingException(input(category), 600_000_000, price, 12, 6, 10, 5, 1_200_000_000);
const text = (r: ReturnType<typeof run>) => render(<RentalHousingExceptionDetailCard detail={r} />).container.textContent ?? "";

describe("R-c08-09 호별 판정 기준 — 「구법목」 대신 「구 임대주택법 매입임대 — 가목」", () => {
  it("구 임대주택법 매입 → 「1호: 구 임대주택법 매입임대 — 가목」", () => {
    const r = run(1_500_000_000);
    expect(r.applied).toBe(true);
    expect(r.eligibility.perUnitVerdict?.[0].derivedArticle).toBe("구법");
    const t = text(r);
    expect(t).toContain("1호: 구 임대주택법 매입임대 — 가목 · 의무임대기간 5년");
    expect(t).not.toContain("구법목");
  });
  it("(짝) 장기일반 매입 → 종전대로 「가목」", () => {
    const t = text(run(1_500_000_000, "long_general"));
    expect(t).toContain("1호: 가목 · ");
  });
});

describe("R-c08-10 B 비과세 칸 근거 항 — 고가주택(RH-B2)은 §161②", () => {
  it("RH-B2(15억) → 「비과세 양도소득금액 (시행령 §161②)」 · 같은 카드 안 산식 머리 「제161조 제2항」과 일치", () => {
    const r = run(1_500_000_000);
    expect(r.scenarioId).toBe("RH-B2");
    const t = text(r);
    expect(t).toContain("비과세 양도소득금액 (시행령 §161②)");
    expect(t).not.toContain("시행령 §161①)");
    expect(t).toContain("소득세법 시행령 제161조 제2항");
    expect(nontaxableIncomeLabel("RH-B2")).toBe("비과세 양도소득금액 (소령 §161②)");
  });
  it("(짝) RH-B1(10억) → 「(시행령 §161①)」 유지 · A는 접미 없음", () => {
    const r = run(1_000_000_000);
    expect(r.scenarioId).toBe("RH-B1");
    expect(text(r)).toContain("비과세 양도소득금액 (시행령 §161①)");
    expect(nontaxableIncomeLabel("RH-B1")).toBe("비과세 양도소득금액 (소령 §161①)");
    expect(nontaxableIncomeLabel("RH-A2")).toBe("비과세 양도소득금액");
  });
});
