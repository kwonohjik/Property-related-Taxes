/**
 * anchor — 소득세법 시행령 §164⑦(·⑥) 산식으로 구한 취득 당시 주택 가격의 사용자 노출 명칭 (계획서 phd-appraisal-dead-end §9.3)
 *
 * «추정»·«추정값»·«법정 값»은 법령에 없는 조어다(memory `feedback_no_coined_legal_terms`). 이름은
 *   · 개별주택가격 산식 결과            → «환산 개별주택가격»
 *   · 공동주택가격 산식 결과(§164⑦)    → «§164⑦ 산식으로 계산한 취득 당시 공동주택가격» / 라벨 «취득 당시 공동주택가격 (소득세법 시행령 §164⑦ 산식)»
 *   · 국세청 고시 공동주택 기준시가(§164⑥) → «§164⑥ 산식으로 계산한 취득 당시 공동주택 기준시가»
 *
 *   T1 상속주택 환산 상세 카드(배지·소제목) — 개별 / 공동(국토교통부) / 공동(국세청) 3갈래
 *   T2 개별주택가격 미공시 취득 환산 상세 섹션(양도세 결과) — 5개 산식 자리가 모두 «환산 개별주택가격»
 *   T3 감면 PHD 입력 위젯 — 환산 결과 박스
 *   T4 상속주택 3시점 입력 — 최초 공시 가격 칸 hint
 *   T5 엔진이 만드는 산식 문자열(상속주택 산식 첫 줄 · 감면 PHD 산식 6단계 라벨)
 * 모든 곳에서 «추정» 불포함을 단언한다(긍정 짝: 새 이름이 실제로 있다).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { InheritedHouseValuationDetailCard } from "@/components/calc/results/transfer/InheritedHouseValuationDetailCard";
import { PreHousingDisclosureDetailSection } from "@/components/calc/results/transfer/PreHousingDisclosureDetailSection";
import { ReductionPhdInput } from "@/components/calc/transfer/ReductionPhdInput";
import { HouseValuationSection } from "@/components/calc/transfer/inheritance/HouseValuationSection";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { calcPreHousingDisclosureGain } from "@/lib/tax-engine/transfer-tax-pre-housing-disclosure";
import { calcReductionAcquisitionStdPrice } from "@/lib/tax-engine/transfer-reductions";
import { calculateInheritanceHouseValuation, convertedHousePriceNames } from "@/lib/tax-engine/inheritance-house-valuation";
import type { InheritanceHouseValuationResult } from "@/lib/tax-engine/types/inheritance-house-valuation.types";
import { PHD_INPUT, PHD_TRANSFER_PRICE } from "../tax-engine/transfer-tax/_helpers/pre-housing-disclosure-fixture";

afterEach(cleanup);

const text = () => (document.body.textContent ?? "").replace(/\s+/g, " ");

const DETAIL: InheritanceHouseValuationResult = {
  sumAtInheritance: 148_382_411,
  sumAtFirstDisclosure: 329_982_000,
  landStdAtInheritance: 110_246_831,
  landStdAtTransfer: 1_243_350_000,
  landStdAtFirstDisclosure: 287_352_000,
  buildingStdAtInheritance: 38_135_580,
  buildingStdAtFirstDisclosure: 42_630_000,
  housePriceAtFirstDisclosure: 341_000_000,
  housePriceAtInheritanceUsed: 153_336_855,
  housePriceAtTransfer: 1_287_000_000,
  estimationMethod: "estimated_phd",
  formula: "",
  legalBasis: "소득세법 시행령 §164⑦",
  warnings: [],
};

describe("T1 상속주택 환산 상세 카드", () => {
  it.each([
    [undefined, "환산 개별주택가격", "환산 개별주택가격 (소득세법 시행령 §164⑦ 산식)"],
    ["molit", "§164⑦ 산식으로 계산한 취득 당시 공동주택가격", "취득 당시 공동주택가격 (소득세법 시행령 §164⑦ 산식)"],
    ["nts", "§164⑥ 산식으로 계산한 취득 당시 공동주택 기준시가", "취득 당시 공동주택 기준시가 (소득세법 시행령 §164⑥ 산식)"],
  ] as const)("공동주택 기관=%s → 배지·소제목이 법령상 이름", (agency, badge, label) => {
    render(<InheritedHouseValuationDetailCard detail={{ ...DETAIL, apartFirstPriceAgency: agency }} />);
    expect(screen.getByText(badge)).toBeInTheDocument();
    expect(text()).toContain(`${label} · 합계기준시가 = 토지 + 건물`);
    expect(text()).not.toContain("추정");
    expect(convertedHousePriceNames(agency)).toEqual({ sentence: badge, label });
  });
});

describe("T2 개별주택가격 미공시 취득 환산 상세 섹션", () => {
  it("환산 개별주택가격 — 라벨 1 + 산식 4곳, «추정» 없음", () => {
    const detail = calcPreHousingDisclosureGain(PHD_TRANSFER_PRICE, PHD_INPUT as never)!;
    expect(detail).toBeTruthy();
    render(<PreHousingDisclosureDetailSection result={{ preHousingDisclosureDetail: detail } as never} />);
    expect(text().split("환산 개별주택가격").length - 1).toBe(5);
    expect(text()).toContain("환산 개별주택가격 (취득시)");
    expect(text()).toContain("환산취득가 분리 (취득시 토지·건물 기준시가 비율 적용)");
    expect(text()).not.toContain("추정");
    expect(text()).not.toContain("환산 주택공시가격");
  });
});

describe("T3 감면 PHD 입력 위젯", () => {
  it("환산 결과 박스 — «취득 당시 공동주택가격 (소득세법 시행령 §164⑦ 산식)»", () => {
    render(
      <ReductionPhdInput
        acquisitionDate="2003-09-23"
        value={{
          phdMode: true,
          firstDisclosureDate: "2004-04-30",
          firstDisclosurePrice: "540000000",
          landAreaSqm: "16.36",
          landPricePerSqmAtAcq: "1640000",
          landPricePerSqmAtFirst: "1810000",
          buildingStdAtAcq: "100000000",
          buildingStdAtFirst: "105000000",
        }}
        onChange={() => {}}
      />,
    );
    expect(text()).toMatch(/→ 취득 당시 공동주택가격 \(소득세법 시행령 §164⑦ 산식\) = [\d,]+원/);
    expect(text()).not.toContain("추정");
  });
});

describe("T4 상속주택 3시점 입력", () => {
  it.each(["house_individual", "house_apart"] as const)("%s: 최초 공시 가격 칸 hint 는 «산식»이다", (kind) => {
    render(
      <HouseValuationSection
        asset={{ ...makeDefaultAsset(1), inheritanceStartDate: "2003-05-01", inheritanceAssetKind: kind }}
        transferDate="2025-09-01"
        onChange={() => {}}
      />,
    );
    expect(text()).toMatch(/§164⑦ 산식의 분자 승수/);
    expect(text()).not.toContain("추정");
  });
});

describe("T5 엔진이 만드는 산식 문자열", () => {
  it("감면 PHD 산식 6단계 마지막 라벨", () => {
    const r = calcReductionAcquisitionStdPrice({
      firstDisclosurePrice: 540_000_000,
      landAreaSqm: 16.36,
      landPricePerSqmAtAcquisition: 1_640_000,
      landPricePerSqmAtFirstDisclosure: 1_810_000,
    });
    expect(r.formulaSteps.map((s) => s.label).join("|")).not.toContain("추정");
    expect(r.formulaSteps[5].label).toBe("취득 당시 공동주택가격 (소득세법 시행령 §164⑦ 산식)");
  });

  it.each([undefined, "molit", "nts"] as const)("상속주택 산식 첫 줄(공동주택 기관=%s) — 라벨 그대로, «추정» 없음", (agency) => {
    const r = calculateInheritanceHouseValuation({
      inheritanceDate: new Date("2003-05-01"),
      transferDate: new Date("2025-09-01"),
      landArea: 100,
      landPricePerSqmAtInheritance: 1_100_000,
      landPricePerSqmAtFirstDisclosure: 1_300_000,
      landPricePerSqmAtTransfer: 1_500_000,
      housePriceAtFirstDisclosure: 341_000_000,
      housePriceAtTransfer: 400_000_000,
      buildingStdPriceAtInheritance: 38_000_000,
      buildingStdPriceAtFirstDisclosure: 42_000_000,
      firstDisclosureDate: new Date("2005-04-30"),
      apartFirstPriceAgency: agency,
    } as never);
    expect(r.formula).toContain(convertedHousePriceNames(agency).label);
    expect(r.formula).not.toContain("추정");
  });
});
