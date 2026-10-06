/**
 * anchor (L-10) — 겸용주택(주택 연면적 > 주택 외 연면적) · 1세대1주택 · 전체 12억 **초과**:
 * 고가주택 **판정**은 건물 전체, 12억 초과분 **산식**은 주택 부분.
 *
 * 법령(소득세법 시행령 MST 286211 실독 2026-09-28 · 2022-01-01 시행본(제30395호) DRF eflaw 실독 — 같은 취지):
 *   · §154③ 「법 제89조제1항제3호를 적용할 때 하나의 건물이 주택과 주택외의 부분으로 복합되어 있는 경우 …
 *     그 전부를 주택으로 본다. 다만, 주택의 연면적이 주택 외의 부분의 연면적보다 적거나 같을 때에는
 *     주택외의 부분은 주택으로 보지 아니한다.」
 *   · §156② 「법 제89조제1항제3호 각 목 외의 부분에 따른 고가주택의 실지거래가액을 계산하는 경우에는
 *     제154조제3항 본문에 따라 주택으로 보는 부분(이에 부수되는 토지를 포함한다)에 해당하는 실지거래가액을
 *     포함한다.」 ⇒ 주택 > 상가면 **판정은 건물 전체**(단서면 주택 부분만 — 포함할 「본문」 부분이 없다).
 *   · §160① 「법 제95조제3항에 따른 고가주택(하나의 건물이 주택과 주택 외의 부분으로 복합되어 있는 경우 …
 *     주택 외의 부분은 주택으로 보지 않는다)에 해당하는 자산의 양도차익 … 양도차익 × (양도가액 − 12억원)
 *     / 양도가액」 ⇒ **산식은 주택 부분**의 양도가액.
 *
 * 해석(taxlaw.nts.go.kr 원문 실독 2026-09-28):
 *   · 서면-2023-법규재산-2584(법규과-3154, 2023.12.19.) — 전체 13.2억(주택 378.69㎡·상가 51.55㎡),
 *     「주택의 양도가액이 12억원 이하로 1세대 1주택 비과세 요건을 충족」한 사안을 「비과세대상에서 제외되는
 *     고가주택」으로 보고 §114의2 가산세를 「전체 양도가액에 대한 … 환산취득가액」 기준으로 계산 ⇒ 판정은 전체.
 *   · 사전-2024-법규재산-0855(법규과-3156, 2024.12.18.) — 12억 초과분 비율의 합계액을 「그 겸용주택의
 *     주택부분 전체와 부수토지의 양도가액의 합계액」으로 계산 ⇒ 산식은 주택 부분(간접 — 산식 분모 자체를
 *     물은 질의는 아니다).
 *   · 주택분 ≤ 12억 < 전체일 때 산식 (주택분 − 12억)/주택분 ≤ 0 을 0으로 보는 직접 선례는 **미확보**다.
 *     음수 양도차익은 산식상 의미가 없어 0으로 둔다(법규과-3154 사실관계의 전제 「주택의 양도가액이 12억원
 *     이하로 … 비과세」와 같은 결과).
 *
 * 결함: 겸용 엔진이 `highValueBase`(주택분) 하나로 판정과 산식을 겸해, 주택분 ≤ 12억 < 전체 구간을
 * 「12억 이하 비과세」로 판정했다. **과세 양도차익은 어느 쪽이든 0**이라 세액은 불변 — 판정 라벨·echo만 바뀐다.
 */
import { describe, it, expect } from "vitest";
import { calcMixedUseTransferTaxIdN as calcMixedUseTransferTax, withIdentityHousingBuildingStd } from "../_helpers/mixed-use-identity-std";
import { makeMockRates } from "../_helpers/mock-rates";
import type { MixedUseAssetInput } from "@/lib/tax-engine/types/transfer-mixed-use.types";
import { buildMixedUsePartCards } from "@/app/api/calc/transfer/mixed-use-part-cards";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import type { TransferTaxItemInput } from "@/lib/tax-engine/types/transfer-aggregate.types";

const rates = makeMockRates();
const TD = new Date("2024-06-01");
const T = 1_200_000_000;

/** 주택 150㎡ · 상가 100㎡(본문) · 정착 100㎡ · 토지 200㎡ · 2021-06-01 취득 · 거주 3년 */
function asset(over: Partial<MixedUseAssetInput> = {}): MixedUseAssetInput {
  return {
    isMixedUseHouse: true,
    residentialFloorArea: 150,
    nonResidentialFloorArea: 100,
    buildingFootprintArea: 100,
    totalLandArea: 200,
    landAcquisitionDate: new Date("2021-06-01"),
    buildingAcquisitionDate: new Date("2021-06-01"),
    transferStandardPrice: { housingPrice: 500_000_000, commercialBuildingPrice: 100_000_000, landPricePerSqm: 2_000_000 },
    acquisitionStandardPrice: { housingPrice: 350_000_000, commercialBuildingPrice: 80_000_000, landPricePerSqm: 1_500_000 },
    residencePeriodYears: 3,
    isMetropolitanArea: true,
    zoneType: "residential",
    isOneHouseExempt: true,
    ...over,
  };
}
const PROVISO = { residentialFloorArea: 100, nonResidentialFloorArea: 150 } as const;

/** §160① 산식 — (차익 − 비사토) × (분모 − 12억)/분모, 0 미만은 0. 파트별 floor(엔진 규약). */
function prorate(h: ReturnType<typeof calcMixedUseTransferTax>["housingPart"], base: number) {
  const ratio = Math.max(0, (base - T) / base);
  return (
    Math.floor(Math.max(h.landTransferGain - h.nonBusinessTransferredGain, 0) * ratio) +
    Math.floor(Math.max(h.buildingTransferGain, 0) * ratio)
  );
}

describe("L-10 ① 판별 케이스 — 주택분 ≤ 12억 < 전체(13억) · 본문", () => {
  const r = calcMixedUseTransferTax(1_300_000_000, TD, asset(), rates);

  it("전제 — 주택분 855,263,157 ≤ 12억 < 전체 13억", () => {
    expect(r.apportionment.housingTransferPrice).toBe(855_263_157);
  });

  it("🔴 판정은 건물 전체(§156②) — 고가주택 → above_threshold_prorated", () => {
    expect(r.housingPart.highValueJudgmentBase).toBe(1_300_000_000);
    expect(r.housingPart.isExempt).toBe(false);
    expect(r.calculationRoute.highValueRule).toBe("above_threshold_prorated");
  });

  it("산식 분모는 주택 부분(§160① 괄호) — (855,263,157 − 12억) < 0 → 과세대상 0", () => {
    expect(r.housingPart.highValueBase).toBe(855_263_157);
    expect(r.housingPart.proratedTaxableGain).toBe(0);
    expect(r.housingPart.proratedTaxableGain).toBe(prorate(r.housingPart, 855_263_157));
    expect(r.housingPart.incomeAmount).toBe(0);
  });

  it("세액 불변 — 상가분 과세(§160① 괄호) · 과세표준 88,333,686 · 납부 17,024,469 (수정 전과 동일)", () => {
    expect(r.commercialPart.incomeAmount).toBe(90_833_686);
    expect(r.total.taxBase).toBe(88_333_686);
    expect(r.total.totalPayable).toBe(17_024_469);
  });
});

describe("L-10 ② 주택분도 12억 초과(20억) — 판정·산식 모두 고가, 산식 분모는 주택분(전체 아님)", () => {
  const r = calcMixedUseTransferTax(2_000_000_000, TD, asset(), rates);

  it("판정 분모 = 전체 20억 · 산식 분모 = 주택분 1,315,789,473", () => {
    expect(r.housingPart.highValueJudgmentBase).toBe(2_000_000_000);
    expect(r.housingPart.highValueBase).toBe(1_315_789_473);
    expect(r.calculationRoute.highValueRule).toBe("above_threshold_prorated");
  });

  it("과세대상 = 차익 × (주택분 − 12억)/주택분 = 33,812,841 — 전체 20억을 분모로 쓰면 다른 값", () => {
    expect(r.housingPart.proratedTaxableGain).toBe(33_812_841);
    expect(r.housingPart.proratedTaxableGain).toBe(prorate(r.housingPart, 1_315_789_473));
    expect(prorate(r.housingPart, 2_000_000_000)).not.toBe(33_812_841);
  });

  it("세액 불변 — 납부 47,445,143", () => {
    expect(r.total.totalPayable).toBe(47_445_143);
  });
});

describe("L-10 ③ 경계 — 전체 12억 / 12억+1", () => {
  it("정확히 12억 → 고가 아님 → OH-17 전부 비과세(납부 0)", () => {
    const r = calcMixedUseTransferTax(T, TD, asset(), rates);
    expect(r.housingPart.highValueJudgmentBase).toBe(T);
    expect(r.housingPart.isExempt).toBe(true);
    expect(r.calculationRoute.highValueRule).toBe("below_threshold_exempt");
    expect(r.total.totalPayable).toBe(0);
  });

  it("🔴 12억+1 → 고가(전체 기준) · 주택분 789,473,684라 산식 0 · 상가 과세 → 납부 15,024,935(불변)", () => {
    const r = calcMixedUseTransferTax(T + 1, TD, asset(), rates);
    expect(r.housingPart.highValueJudgmentBase).toBe(T + 1);
    expect(r.housingPart.isExempt).toBe(false);
    expect(r.calculationRoute.highValueRule).toBe("above_threshold_prorated");
    expect(r.housingPart.highValueBase).toBe(789_473_684);
    expect(r.housingPart.proratedTaxableGain).toBe(0);
    expect(r.total.totalPayable).toBe(15_024_935);
  });
});

describe("L-10 ④ 대조군 — 단서(주택 100 ≤ 상가 150)는 판정도 주택 부분(§156②는 「본문」 부분만 포함)", () => {
  const r = calcMixedUseTransferTax(1_300_000_000, TD, asset(PROVISO), rates);

  it("판정 echo 없음 · 주택분 773,809,523 ≤ 12억 → 12억 이하 비과세 · 납부 24,037,346(불변)", () => {
    expect(r.housingPart.highValueJudgmentBase).toBeUndefined();
    expect(r.housingPart.highValueBase).toBe(773_809_523);
    expect(r.housingPart.isExempt).toBe(true);
    expect(r.calculationRoute.highValueRule).toBe("below_threshold_exempt");
    expect(r.total.totalPayable).toBe(24_037_346);
  });

  it("연면적 같음(150=150)도 단서 — 판정 echo 없음", () => {
    const s = calcMixedUseTransferTax(1_300_000_000, TD, asset({ nonResidentialFloorArea: 150 }), rates);
    expect(s.housingPart.highValueJudgmentBase).toBeUndefined();
    expect(s.calculationRoute.highValueRule).toBe("below_threshold_exempt");
  });
});

describe("L-10 ⑤ 공유지분 50% — 판정은 물건 전체 건물(15억, §156①·②) · 산식은 물건 전체 주택분", () => {
  const r = calcMixedUseTransferTax(750_000_000, TD, asset({ totalPropertyTransferPrice: 1_500_000_000 }), rates);

  it("🔴 물건 전체 주택분 986,842,105 ≤ 12억 < 물건 전체 15억 → 고가 · 과세대상 0 · 납부 6,454,452(불변)", () => {
    expect(r.apportionment.wholeHousingTransferPrice).toBe(986_842_105);
    expect(r.housingPart.highValueJudgmentBase).toBe(1_500_000_000);
    expect(r.housingPart.highValueBase).toBe(986_842_105);
    expect(r.calculationRoute.highValueRule).toBe("above_threshold_prorated");
    expect(r.housingPart.proratedTaxableGain).toBe(0);
    expect(r.total.totalPayable).toBe(6_454_452);
  });
});

describe("L-10 ⑥ 비과세 요건 미충족이면 판정 분모와 무관하게 전액 과세(불변)", () => {
  it("isOneHouseExempt=false · 13억 → non_one_house_full_taxation", () => {
    const r = calcMixedUseTransferTax(1_300_000_000, TD, asset({ isOneHouseExempt: false }), rates);
    expect(r.calculationRoute.highValueRule).toBe("non_one_house_full_taxation");
    expect(r.housingPart.proratedTaxableGain).toBe(
      r.housingPart.transferGain - r.housingPart.nonBusinessTransferredGain,
    );
  });
});

// ─── 컴패니언 파트 카드 — 주택 카드는 산식 분모(주택분)를 싣고, 세액은 단건 겸용과 같다 ───

function companion(price: number): TransferTaxItemInput {
  return {
    propertyId: "c1",
    propertyLabel: "자산 2",
    propertyType: "housing",
    transferPrice: price,
    acquisitionPrice: 0,
    expenses: 0,
    transferDate: TD,
    acquisitionDate: new Date("2021-06-01"),
    isOneHousehold: true,
    householdHousingCount: 1,
    residencePeriodMonths: 36,
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    isUnregistered: false,
    useEstimatedAcquisition: false,
    isNonBusinessLand: false,
    reductions: [],
  } as TransferTaxItemInput;
}

describe("L-10 ⑦ 파트 카드 — 단건 겸용과 과세표준·산출세액 일치", () => {
  it.each([
    ["13억 본문(판별)", 1_300_000_000, {}],
    ["20억 본문", 2_000_000_000, {}],
    ["13억 단서", 1_300_000_000, PROVISO],
  ] as const)("%s", (_n, price, over) => {
    const a = asset(over as Partial<MixedUseAssetInput>);
    const single = calcMixedUseTransferTax(price, TD, a, rates);
    const cards = buildMixedUsePartCards(companion(price), withIdentityHousingBuildingStd(a), price, TD, rates, "c1", "자산 2");
    const agg = calculateTransferTaxAggregate({ taxYear: 2024, properties: cards, annualBasicDeductionUsed: 0 }, rates);
    expect(agg.taxBase).toBe(single.total.taxBase);
    // 주택 카드 12억 분모 = 엔진 산식 분모(주택분) — 전체로 바꾸면 일반 엔진이 그 값으로 **안분**까지 해 과다과세.
    const houseCard = cards.find((c) => c.propertyId.startsWith("mu-house-bld"));
    expect(houseCard?.totalPropertyTransferPrice).toBe(single.housingPart.highValueBase);
  });
});
