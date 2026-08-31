/**
 * anchor — §99의3 재개발·재건축 신축주택 안분 변형 (D3-02)
 *
 * 조특령 제99조의3 ② (법제처 원문, 사용자 제공 화면 실측):
 *
 *  「② 법 제99조의3제1항에 따른 양도소득세 과세대상소득금액에서 빼는 양도소득금액(이하 이 조에서
 *    "감면대상 양도소득금액")은 다음 각 호의 구분에 따라 계산한다.
 *    이 경우 새로운 기준시가가 고시되기 전인 경우에는 직전의 기준시가를 적용한다.
 *
 *    1. 취득일부터 5년 이내에 양도하는 경우 감면대상 양도소득금액은 「소득세법」 제95조제1항에 따라
 *       계산한다. **다만**, 재개발·재건축되기 이전의 주택(이하 "종전주택")을 재개발·재건축하여 취득한
 *       **법 제98조의3제2항 각 호에 따른 신축주택**인 경우 감면대상 양도소득금액은 다음 계산식에 따른다.
 *
 *         §95① 양도소득금액 × (양도 당시 기준시가 − 신축주택 취득 당시 기준시가)
 *                            ÷ (양도 당시 기준시가 − **종전주택** 취득 당시 기준시가)
 *
 *    2. 취득일부터 5년 후에 양도하는 경우
 *
 *         §95① 양도소득금액 × (신축주택 취득일부터 5년이 되는 날의 기준시가 − 신축주택 취득 당시 기준시가)
 *                            ÷ (양도 당시 기준시가 − 신축주택 취득 당시 기준시가
 *                               (종전주택을 재개발·재건축하여 취득한 법 제98조의3제2항 각 호에 따른
 *                                신축주택의 경우 **종전주택 취득 당시 기준시가**))」
 *
 * 대상 범위 — 법 §98의3② 각 호:
 *   1호 정비사업조합(재개발·재건축·소규모재건축)의 조합원이 **관리처분계획에 따라 취득**하는 주택
 *   2호 거주·보유 중 **소실·붕괴·노후 등으로 멸실되어 재건축**한 주택
 *
 * 결함: `New993Input`에 종전주택 기준시가·재개발 여부 필드가 없어 5년 이내면 무조건 전액 차감하고,
 * 분모를 항상 `양도시 − 신축취득시`로 고정했다. 형제 조문 §99(`new-99.ts:264-265`)는 동일 변형을
 * ⑤UI·④변환·⑧validate·⑫Zod까지 전 계층 배선해 두었고 **§99의3만 통째로 빠진 비대칭**이었다.
 */
import { describe, it, expect } from "vitest";
import { evaluateNew993 } from "@/lib/tax-engine/transfer-reductions/new-99-3";

const D = (s: string) => new Date(`${s}T00:00:00`);

/** 5년 **후** 양도 — 2호 */
const OVER5 = {
  transferDate: D("2012-06-30"),
  acquisitionDate: D("2003-03-01"),
  contractDate: D("2002-01-10"),
  transferIncome: 300_000_000,
  standardPriceAtAcquisition: 200_000_000,
  standardPriceAt5Years: 300_000_000,
  standardPriceAtTransfer: 500_000_000,
  wholePropertyTransferPrice: 550_000_000,
  exclusiveAreaSqm: 84,
  region: "outside_speculation" as const,
  isResident: true,
  isHousingConstructionBusiness: false,
  acquisitionType: "from_builder" as const,
  calculatedTaxBeforeReduction: 100_000_000,
  calculatedTaxAfterReduction: 0,
};

describe("2호 — 5년 후 양도", () => {
  it("일반: 분모 = 양도시 − 신축취득시 → 비율 1/3", () => {
    const r = evaluateNew993(OVER5);
    expect(r.isEligible).toBe(true);
    // (300,000,000 − 200,000,000) / (500,000,000 − 200,000,000) = 1/3
    expect(r.reducibleTransferIncome).toBe(100_000_000);
  });

  it("🔴 재개발 변형: 분모의 차감항이 종전주택 취득시로 바뀐다 → 비율 1/4", () => {
    const r = evaluateNew993({
      ...OVER5,
      isRedevelopedNewHouse: true,
      previousHouseStdPriceAtAcquisition: 100_000_000,
    });
    expect(r.isEligible).toBe(true);
    // 분자 (300,000,000 − 200,000,000) / 분모 (500,000,000 − 100,000,000) = 0.25
    expect(r.fiveYearRatio).toBe(0.25);
    expect(r.reducibleTransferIncome).toBe(75_000_000);
  });

  it("종전주택 기준시가 미입력이면 차단한다 — 자동 안분 fallback 금지", () => {
    const r = evaluateNew993({ ...OVER5, isRedevelopedNewHouse: true });
    expect(r.isEligible).toBe(false);
    expect(r.ineligibleReasons?.map((x) => x.code)).toContain("MISSING_PREVIOUS_STD_PRICE");
  });
});

/** 5년 **이내** 양도 — 1호 */
const WITHIN5 = {
  ...OVER5,
  transferDate: D("2007-06-30"), // 취득 2003-03-01 + 5년 이내
};

describe("1호 — 5년 이내 양도", () => {
  it("본문(일반): 양도소득금액 전액 차감 — 기준시가를 보지 않는다", () => {
    const r = evaluateNew993({ ...WITHIN5, standardPriceAt5Years: 0 });
    expect(r.isEligible).toBe(true);
    expect(r.reducibleTransferIncome).toBe(300_000_000);
    expect(r.signCase).toBe("within_5_years");
  });

  it("🔴 단서(재개발 변형): 전액이 아니라 안분한다 — 분자 = 양도시 − 신축취득시", () => {
    const r = evaluateNew993({
      ...WITHIN5,
      isRedevelopedNewHouse: true,
      previousHouseStdPriceAtAcquisition: 100_000_000,
      standardPriceAt5Years: 0, // 5년 이내 변형은 5년시점 기준시가가 불요하다
    });
    expect(r.isEligible).toBe(true);
    // 분자 (500,000,000 − 200,000,000) / 분모 (500,000,000 − 100,000,000) = 0.75
    expect(r.fiveYearRatio).toBe(0.75);
    expect(r.reducibleTransferIncome).toBe(225_000_000);
    expect(r.signCase).not.toBe("within_5_years");
  });
});

describe("표시 산식이 실제 사용값과 일치한다 (dual truth 방지)", () => {
  it("재개발 변형이면 분모 라벨·값이 종전주택 기준으로 표시된다", () => {
    const r = evaluateNew993({
      ...OVER5,
      isRedevelopedNewHouse: true,
      previousHouseStdPriceAtAcquisition: 100_000_000,
    });
    const denom = r.formulaSteps?.find((s) => s.label.startsWith("분모"));
    expect(denom?.label).toContain("종전주택");
    expect(denom?.value).toBe(400_000_000);
    expect(r.formulaSteps?.some((s) => s.label.includes("재개발·재건축 신축주택 변형"))).toBe(true);
  });
});
