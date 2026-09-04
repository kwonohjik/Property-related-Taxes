/**
 * anchor — **겸용 파트 카드 ≡ 단건 겸용**.
 *
 * 컴패니언 겸용은 겸용 엔진의 결과를 통째로 쓰지 않고 **파트 카드로 되먹여** aggregate가
 * 다시 계산한다(§103② 기본공제 1회 · §104⑤ 비교과세를 신고 단위로 하기 위해).
 * 그 되먹임이 **드리프트 없이 성립하는가**가 이 축의 유일한 구조적 위험이고, 이 파일이 그것을 고정한다.
 *
 * ## 🔴 이 anchor가 지키는 세 가지 설계 결정
 *
 * | 결정 | 지우면 무슨 일이 나는가 (실측) |
 * |---|---|
 * | 주택을 **토지·건물 2카드**로 나눈다 | 주택분 장특은 토지·건물 **각각의 보유기간**으로 계산해 더한다. 1카드로 합치면 취득일이 하나뿐이라 재현 불가 — 토지 11년·건물 6년에서 219,750,439 vs 181,477,799(**38,272,640 차이**) |
 * | 그 2카드에 **`totalPropertyTransferPrice`**(주택분 합계)를 싣는다 | §89① 12억 판정이 **카드 단위**라, 없으면 두 장이 각각 12억 이하가 되어 주택분이 통째로 비과세 — MUT-1이 그것을 잰다 |
 * | 상가·비사토 카드에 **세대 축을 싣지 않는다** | 상가가 1세대1주택 표2 80% 장특을 받는다 — MUT-2가 그것을 잰다 |
 *
 * 설계문서: `docs/02-design/features/transfer-bundled-subengine-hosting.design.md` §10
 */
import { describe, it, expect } from "vitest";
import { calcMixedUseTransferTax } from "@/lib/tax-engine/transfer-tax-mixed-use";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import { buildMixedUsePartCards } from "@/app/api/calc/transfer/mixed-use-part-cards";
import { makeMockRatesWithHouseEngine, makeHouseInfo } from "../tax-engine/_helpers/mock-rates";
import { mixedUseCase14, mixedUseExcessLand } from "../tax-engine/_helpers/mixed-use-fixture";
import type { MixedUseAssetInput } from "@/lib/tax-engine/types/transfer-mixed-use.types";
import type { TransferTaxItemInput } from "@/lib/tax-engine/types/transfer-aggregate.types";

const rates = makeMockRatesWithHouseEngine();
const TD = new Date("2026-06-01");
const PRICE = 3_000_000_000;

/** 컴패니언 item의 세대 축·감면 — 실제 경로에서 `buildCompanionEngineInputs`가 만드는 모양. */
function companionBase(over: Partial<TransferTaxItemInput> = {}): TransferTaxItemInput {
  return {
    propertyId: "c1",
    propertyLabel: "자산 2",
    propertyType: "housing",
    transferPrice: PRICE,
    acquisitionPrice: 0,
    expenses: 0,
    transferDate: TD,
    acquisitionDate: new Date("1997-09-12"),
    isOneHousehold: false,
    householdHousingCount: 1,
    residencePeriodMonths: 0,
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    isUnregistered: false,
    useEstimatedAcquisition: false,
    isNonBusinessLand: false,
    reductions: [],
    ...over,
  } as TransferTaxItemInput;
}

function aggregateOf(items: TransferTaxItemInput[]) {
  return calculateTransferTaxAggregate(
    { taxYear: 2026, properties: items, annualBasicDeductionUsed: 0 },
    rates,
  );
}

/**
 * 단건 겸용과 「파트 카드 → aggregate」를 같은 입력으로 돌려 비교한다.
 * aggregate의 `totalTax`는 산출세액 + 지방소득세(10%)라 단건과는 그 관계로 대응한다.
 */
function compare(asset: MixedUseAssetInput, companion: TransferTaxItemInput) {
  const single = calcMixedUseTransferTax(PRICE, TD, asset, rates);
  const cards = buildMixedUsePartCards(companion, asset, PRICE, TD, rates, "c1", "자산 2");
  const agg = aggregateOf(cards);
  return { single, cards, agg };
}

/** 거주 25년 · 토지 1992 · 건물 1997 — 표1 상한 포화(장특 0.3). */
const BASE = (): MixedUseAssetInput => ({ ...mixedUseCase14(), isOneHouseExempt: false });

/** 표1 **미포화** — 토지 11년(0.22) · 건물 6년(0.12)이 갈린다. 여기서만 블렌딩이 드러난다. */
const UNSATURATED = (): MixedUseAssetInput => ({
  ...mixedUseCase14(),
  landAcquisitionDate: new Date("2015-03-01"),
  buildingAcquisitionDate: new Date("2020-03-01"),
  isOneHouseExempt: false,
  residencePeriodYears: 0,
});

describe("겸용 파트 카드 ≡ 단건 겸용", () => {
  it("EQ-1 기본 — 과세표준·세액이 완전히 일치한다", () => {
    const { single, agg } = compare(BASE(), companionBase());
    expect(agg.taxBase).toBe(single.total.taxBase);
    expect(agg.totalTax).toBe(Math.floor(single.total.transferTax * 1.1));
    // 값이 0이면 위 두 단언이 공허해진다 — 실제로 세금이 나오는 구간인지 고정한다.
    expect(single.total.taxBase).toBe(1_670_099_614);
  });

  it("EQ-2 🔑 보유기간 상이·표1 미포화 — 주택분 장특 블렌딩이 재현된다", () => {
    const asset = UNSATURATED();
    const { single, agg } = compare(asset, companionBase());
    // 🔴 구별력의 근거: 주택분 장특은 **단일 율 × 차익이 아니다**.
    //    이 부등호가 성립하지 않으면 이 케이스는 카드 1장으로도 통과해 버린다.
    expect(single.housingPart.longTermDeductionAmount).not.toBe(
      Math.floor(single.housingPart.transferGain * single.housingPart.longTermDeductionRate),
    );
    expect(single.housingPart.longTermDeductionAmount).toBe(219_750_439);
    expect(agg.taxBase).toBe(single.total.taxBase);
    expect(agg.totalTax).toBe(Math.floor(single.total.transferTax * 1.1));
  });

  it("EQ-3 1세대1주택 표2 + §89① 12억", () => {
    const asset: MixedUseAssetInput = { ...mixedUseCase14(), isOneHouseExempt: true };
    const { single, agg } = compare(
      asset,
      companionBase({ isOneHousehold: true, residencePeriodMonths: 25 * 12 }),
    );
    expect(single.housingPart.longTermDeductionTable).toBe(2);
    expect(agg.taxBase).toBe(single.total.taxBase);
    expect(agg.totalTax).toBe(Math.floor(single.total.transferTax * 1.1));
  });

  it("EQ-4 배율초과 비사업용토지 — §104⑤ 후단 별개 자산", () => {
    const asset: MixedUseAssetInput = { ...mixedUseExcessLand(), isOneHouseExempt: false };
    const { single, cards, agg } = compare(asset, companionBase());
    expect(single.nonBusinessLandPart).not.toBeNull();
    expect(cards).toHaveLength(5);
    const nbl = agg.properties.find((p) => p.propertyId === "mu-nbl#c1");
    expect(nbl?.rateGroup).toBe("non_business_land");
    expect(agg.taxBase).toBe(single.total.taxBase);
    expect(agg.totalTax).toBe(Math.floor(single.total.transferTax * 1.1));
  });

  it("EQ-5 §104⑦ 다주택 중과 — §95② 장특 배제까지 재현된다", () => {
    const multiHouse = {
      houses: [
        makeHouseInfo("selling"),
        makeHouseInfo("h2", { acquisitionDate: new Date("2015-03-01") }),
      ],
      sellingHouseId: "selling",
      presaleRights: [],
      isOneHousehold: true,
      isRegulatedArea: true,
    } as NonNullable<MixedUseAssetInput["multiHouse"]>;
    const asset: MixedUseAssetInput = { ...mixedUseCase14(), isOneHouseExempt: false, multiHouse };
    const { single, agg } = compare(
      asset,
      /**
       * ⚠️ `multiHouse`는 **item 입력이 아니다**(`TransferTaxItemInput`에 없다). 컴패니언 item의
       *    §104⑦ 판정은 `isRegulatedArea` + `householdHousingCount`로 선다 — 그 두 축만 싣는다.
       */
      companionBase({ isRegulatedArea: true, householdHousingCount: 2 }),
    );
    expect(single.housingPart.longTermDeductionAmount).toBe(0); // §95② 배제
    expect(agg.taxBase).toBe(single.total.taxBase);
    expect(agg.totalTax).toBe(Math.floor(single.total.transferTax * 1.1));
  });

  it("EQ-6 🔑 배율초과 비사토 + 1세대1주택 — 12억 분모가 carve-out **전** 값이어야 한다", () => {
    const base = mixedUseExcessLand();
    /** 주택 기준시가를 올려 **주택분이 12억을 넘도록** — 그래야 12억 축이 켜져 분모가 갈린다. */
    const asset: MixedUseAssetInput = {
      ...base,
      isOneHouseExempt: true,
      transferStandardPrice: { ...base.transferStandardPrice, housingPrice: 5_000_000_000 },
    };
    const { single, agg } = compare(
      asset,
      companionBase({ isOneHousehold: true, residencePeriodMonths: 25 * 12 }),
    );
    // 판별력 근거 — 비사토가 실제로 떼어져야 두 분모(carve-out 전/후)가 갈린다.
    // 판별력 근거 — 비사토가 실제로 떼어지고(carve-out 전/후 분모가 갈린다) 12억 축이 켜져야 한다.
    expect(single.housingPart.nonBusinessTransferRatio).toBeGreaterThan(0);
    expect(single.housingPart.isExempt).toBe(false);
    expect(agg.taxBase).toBe(single.total.taxBase);
    expect(agg.totalTax).toBe(Math.floor(single.total.transferTax * 1.1));
  });

  it("MUT-1 🔴 주택 2카드에서 `totalPropertyTransferPrice`를 지우면 12억 판정이 무너진다", () => {
    const asset: MixedUseAssetInput = { ...mixedUseCase14(), isOneHouseExempt: true };
    const companion = companionBase({ isOneHousehold: true, residencePeriodMonths: 25 * 12 });
    const cards = buildMixedUsePartCards(companion, asset, PRICE, TD, rates, "c1", "자산 2");
    const stripped = cards.map((c) =>
      c.propertyId.startsWith("mu-house")
        ? ({ ...c, totalPropertyTransferPrice: undefined } as TransferTaxItemInput)
        : c,
    );
    expect(aggregateOf(stripped).taxBase).not.toBe(aggregateOf(cards).taxBase);
  });

  it("MUT-2 🔴 상가 카드에 세대 축을 실으면 상가가 1세대1주택 표2 장특을 받는다", () => {
    const asset: MixedUseAssetInput = { ...mixedUseCase14(), isOneHouseExempt: true };
    const companion = companionBase({ isOneHousehold: true, residencePeriodMonths: 25 * 12 });
    const cards = buildMixedUsePartCards(companion, asset, PRICE, TD, rates, "c1", "자산 2");
    /**
     * 뮤테이션은 **실제로 저지를 수 있는 실수**를 그대로 재현해야 한다 — `nonHousing` 중화를
     * 빼먹어 `companionEngine`의 세대 축이 상가 카드로 흘러드는 상태다.
     *
     * ⚠️ 처음에는 `isOneHousehold`·`residencePeriodMonths`만 되돌렸다가 **구별력 0**이 나왔다.
     *    `householdHousingCount`가 0으로 남아 표2 판정이 서지 않았기 때문이다 — 중화 필드를
     *    **전부** 되돌려야 실수가 재현된다.
     */
    const leaked = cards.map((c) =>
      c.propertyId.startsWith("mu-comm")
        ? ({
            ...c,
            isOneHousehold: companion.isOneHousehold,
            householdHousingCount: companion.householdHousingCount,
            residencePeriodMonths: companion.residencePeriodMonths,
            isRegulatedArea: companion.isRegulatedArea,
            wasRegulatedAtAcquisition: companion.wasRegulatedAtAcquisition,
          } as TransferTaxItemInput)
        : c,
    );
    expect(aggregateOf(leaked).taxBase).not.toBe(aggregateOf(cards).taxBase);
  });
});
