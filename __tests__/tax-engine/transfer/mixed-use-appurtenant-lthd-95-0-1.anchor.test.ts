/**
 * anchor — 겸용주택 **주택분 토지** 장기보유특별공제에 소득세법 기본통칙 95-0…1을 적용한다.
 *
 * 계획서: docs/02-design/features/transfer-mixed-use-lthd-circular-95-0-1.plan.md
 *
 * 통칙(국세법령정보시스템 열람 — `lib/tax-engine/appurtenant-land-lthd-rate.ts:4-7`): 1세대1주택에 딸린 토지로서 주택보다
 * 보유기간이 오래된 부수토지의 장특은 표1(토지 전체 보유기간)과 표2(주택 부수토지로서의 보유기간) 중 큰 공제율이다.
 * 종전 겸용 경로는 토지 자신의 보유연수로 표2를 매겼다 — 단건(`buildHousingPart`)과 다건 파트 카드(주택 토지 카드 → 단건 엔진) 둘 다.
 *
 * 픽스처: CASE14(토지 1992-01-01 취득 · 30억) · 양도 2026-06-01 · mock 세율. 토지 34년.
 *   토지분 과세 양도차익(12억 초과 안분 후)은 48,307,382이다 — 장특 차이 = 그 값 × 공제율 차이(아래 각 케이스 주석).
 * 기대값은 수정 전 엔진(현행 값)과 수정안을 각각 돌려 잰 실측이다(계획서 §3).
 */
import { describe, it, expect } from "vitest";
import { calcMixedUseTransferTaxIdN as calc, withIdentityHousingBuildingStd } from "../_helpers/mixed-use-identity-std";
import { makeMockRates, makeMockRatesWithHouseEngine } from "../_helpers/mock-rates";
import { mixedUseCase14 } from "../_helpers/mixed-use-fixture";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import { buildMixedUsePartCards } from "@/app/api/calc/transfer/mixed-use-part-cards";
import type { MixedUseAssetInput } from "@/lib/tax-engine/types/transfer-mixed-use.types";
import type { TransferTaxItemInput } from "@/lib/tax-engine/types/transfer-aggregate.types";

const D = (s: string) => new Date(s);
const TD = D("2026-06-01");
const PRICE = 3_000_000_000;
const NOTICE = "기본통칙 95-0…1에 따라";

const asset = (over: Partial<MixedUseAssetInput> = {}): MixedUseAssetInput => ({ ...mixedUseCase14(), ...over });
const run = (over: Partial<MixedUseAssetInput>, price = PRICE) => calc(price, TD, asset(over), makeMockRates());

/** 건물 2019-06-01(7년) · 거주 7년 — 토지분 표2 승(56%). 종전 68%(토지 34년 표2 40% + 거주 28%). */
const P1 = { buildingAcquisitionDate: D("2019-06-01"), residencePeriodYears: 7 };
/** 건물 2023-06-01(3년) · 거주 3년 — 토지분 표1 승(30%). 종전 52%(40% + 거주 12%). */
const P2 = { buildingAcquisitionDate: D("2023-06-01"), residencePeriodYears: 3 };

describe("단건 겸용 — 주택분 토지 통칙 95-0…1", () => {
  it("P1 표2 승: 토지분 68% → 56% · 장특 164,343,992 → 158,547,106 (= −48,307,382 × 12%p) · 세액 273,041,510 → 275,476,202", () => {
    const r = run(P1);
    const h = r.housingPart;
    expect(h.longTermDeductionTable).toBe(2);
    expect(h.longTermDeductionAmount).toBe(158_547_106);
    expect(r.total.transferTax).toBe(275_476_202);
    expect(h.appurtenantLthd).toEqual({
      houseHoldingYears: 7,
      table1Rate: 0.3,
      table2Rate: 0.56,
      table1Applied: false,
      changedFromOwnYears: true,
      basis: { source: "circular", twoAxis: true },
    });
    // 보유분·거주분 echo — 표2가 이겼으니 토지분 보유분은 건물 7년(28%) 기준. 거주분은 종전과 같다.
    expect(h.holdingDeductionAmount).toBe(79_273_554);
    expect(h.residenceDeductionAmount).toBe(79_273_552);
    expect(r.warnings.some((w) => w.includes(NOTICE) && w.includes("표2(주택 부수토지로서의 보유기간 7년 → 56%)"))).toBe(true);
  });

  it("P2 표1 승: 토지분 52% → 30% · 장특 81,474,826 → 70,847,202 (= −48,307,382 × 22%p) · 세액 308,983,774 → 313,447,376", () => {
    const r = run(P2);
    const h = r.housingPart;
    expect(h.longTermDeductionAmount).toBe(70_847_202);
    expect(r.total.transferTax).toBe(313_447_376);
    expect(h.appurtenantLthd?.table1Applied).toBe(true);
    expect(h.appurtenantLthd?.table1Rate).toBe(0.3);
    expect(h.appurtenantLthd?.table2Rate).toBe(0.24);
    // 표1이 이기면 토지분 거주분은 0 — 거주분 echo는 건물분만 남는다(종전 33,974,379).
    expect(h.residenceDeductionAmount).toBe(28_177_494);
    expect(h.holdingDeductionAmount).toBe(42_669_708);
    expect(r.warnings.some((w) => w.includes(NOTICE) && w.includes("30%(표1)"))).toBe(true);
  });

  it("동률(표1 24% = 표2 24%)은 표1로 기록 — 토지 12년 · 건물 3년 · 거주 3년", () => {
    const r = run({ landAcquisitionDate: D("2014-06-01"), buildingAcquisitionDate: D("2023-06-01"), residencePeriodYears: 3 });
    expect(r.housingPart.appurtenantLthd).toMatchObject({ table1Rate: 0.24, table2Rate: 0.24, table1Applied: true, changedFromOwnYears: true });
  });

  it("토지가 건물보다 늦게 취득 — 게이트 밖(echo·고지 없음, 값 불변 220,698,980)", () => {
    const r = run({ landAcquisitionDate: D("2019-06-01"), buildingAcquisitionDate: D("2015-06-01"), residencePeriodYears: 10 });
    expect(r.housingPart.appurtenantLthd).toBeUndefined();
    expect(r.housingPart.longTermDeductionAmount).toBe(220_698_980);
    expect(r.warnings.some((w) => w.includes(NOTICE))).toBe(false);
  });

  it("토지·건물 보유연수가 같다(둘 다 7년) — 「주택보다 오래된」이 아니므로 게이트 밖(echo 없음)", () => {
    const r = run({ landAcquisitionDate: D("2019-01-01"), buildingAcquisitionDate: D("2019-05-01"), residencePeriodYears: 7 });
    expect(r.housingPart.appurtenantLthd).toBeUndefined();
  });

  it("표1(거주 0년) — 게이트 밖(값 불변 47,365,957)", () => {
    const r = run({ ...P1, residencePeriodYears: 0 });
    expect(r.housingPart.longTermDeductionTable).toBe(1);
    expect(r.housingPart.appurtenantLthd).toBeUndefined();
    expect(r.housingPart.longTermDeductionAmount).toBe(47_365_957);
  });

  it("양쪽 표2 상한(건물 1997 · 거주 10년) — echo는 있지만 값이 같아 고지 없음(226,495,866)", () => {
    const r = run({ residencePeriodYears: 10 });
    expect(r.housingPart.longTermDeductionAmount).toBe(226_495_866);
    expect(r.housingPart.appurtenantLthd?.changedFromOwnYears).toBe(false);
    expect(r.warnings.some((w) => w.includes(NOTICE))).toBe(false);
  });

  it("12억 이하 비과세 — 장특 0 · 고지 없음", () => {
    const r = run(P1, 1_100_000_000);
    expect(r.housingPart.isExempt).toBe(true);
    expect(r.housingPart.longTermDeductionAmount).toBe(0);
    expect(r.warnings.some((w) => w.includes(NOTICE))).toBe(false);
  });

  it("미등기 — 장특 배제가 먼저(0 · echo 없음)", () => {
    const r = run({ ...P1, isUnregistered: true } as Partial<MixedUseAssetInput>);
    expect(r.housingPart.longTermDeductionAmount).toBe(0);
    expect(r.housingPart.appurtenantLthd).toBeUndefined();
  });
});

describe("다건 파트 카드 ≡ 단건 — 주택 토지 카드에도 통칙", () => {
  const rates = makeMockRatesWithHouseEngine();
  const companion = (over: Partial<MixedUseAssetInput>, residenceYears: number): TransferTaxItemInput =>
    ({
      propertyId: "c1",
      propertyLabel: "자산 2",
      propertyType: "housing",
      transferPrice: PRICE,
      acquisitionPrice: 0,
      expenses: 0,
      transferDate: TD,
      acquisitionDate: over.buildingAcquisitionDate ?? D("1997-09-12"),
      isOneHousehold: true,
      householdHousingCount: 1,
      residencePeriodMonths: residenceYears * 12,
      isRegulatedArea: false,
      wasRegulatedAtAcquisition: false,
      isUnregistered: false,
      useEstimatedAcquisition: false,
      isNonBusinessLand: false,
      reductions: [],
    }) as TransferTaxItemInput;
  const both = (over: Partial<MixedUseAssetInput> & { residencePeriodYears: number }) => {
    const a = asset({ ...over, isOneHouseExempt: true });
    const single = calc(PRICE, TD, a, rates);
    const cards = buildMixedUsePartCards(companion(over, over.residencePeriodYears), withIdentityHousingBuildingStd(a), PRICE, TD, rates, "c1", "자산 2");
    const agg = calculateTransferTaxAggregate({ taxYear: 2026, properties: cards, annualBasicDeductionUsed: 0 }, rates);
    const land = agg.properties.find((p) => p.propertyId.startsWith("mu-house-land"))!;
    return { single, cards, agg, land };
  };

  it.each([
    ["P1 표2 승", P1, 0.56],
    ["P2 표1 승", P2, 0.3],
  ] as const)("%s — 과세표준이 단건과 같고 토지 카드 공제율이 통칙 값", (_n, over, landRate) => {
    const { single, agg, land, cards } = both(over);
    expect(cards.find((c) => c.propertyId.startsWith("mu-house-land"))?.appurtenantHouseAcquisitionDate).toEqual(over.buildingAcquisitionDate);
    expect(agg.taxBase).toBe(single.total.taxBase);
    // 토지 카드 장특 = 토지분 과세 양도차익 48,307,382 × 통칙 공제율(종전 32,849,019 · 25,119,838)
    expect(land.longTermHoldingDeduction).toBe(Math.floor(48_307_382 * landRate));
  });

  it("토지·건물 보유연수가 같다(7년 5개월 · 7년 1개월) — 카드도 게이트 밖이라 보유기간 표시는 토지 자신의 것", () => {
    const { land } = both({ landAcquisitionDate: D("2019-01-01"), buildingAcquisitionDate: D("2019-05-01"), residencePeriodYears: 7 });
    expect(land.steps.some((s) => (s.formula ?? "").includes("보유기간 7년 5개월"))).toBe(true);
  });

  it("카드 결과에 같은 고지가 실린다(P1)", () => {
    const { agg } = both(P1);
    // 단건 엔진이 카드 결과에 실은 고지가 합산 결과 경고로 올라온다.
    expect(agg.warnings.some((w) => w.includes(NOTICE))).toBe(true);
  });
});
