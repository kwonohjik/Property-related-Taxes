/**
 * anchor: 구주택 멸실·신축 통산 — 파트별 세율 판정을 거치지 않고 자산 단위 세율로 후퇴한 경우(`partRateBasisApplied !== true`)의 고지
 *
 * 결함(2026-10-19 실측): 통산 고지(`landRebuildRateNotice`)가 `partRateBasisApplied`와 무관하게 «세율 보유기간을 통산한 N개월로 판정했습니다»를 냈다.
 * (종전에는 건물 파트 양도차손도 후퇴 사유였다 — 2026-10-19 「소득세법 시행령」 §167의2① 파트 통산으로 바뀌어 B는 적용 사례가 됐다.)
 * §155⑳ 특례 적용 자산은 파트별 세율 판정을 거치지 않는 모델이라(`resolveRentalHousingSplitTax`) 같은 어긋남이 있었다(이 경로는 고지 자체가 없었다).
 *
 * 수정: 고지·표시가 같은 플래그를 읽는다 — 적용 고지는 `partRateBasisApplied === true`일 때만, 아니면 숫자 구간을 주장하지 않는 대체 고지 1건. 세액은 불변.
 * 시드는 anchor `appurtenant-land-rebuild-rate-basis.anchor.test.ts`와 같다(토지 매수 2022-01-01 · 건물 신축 취득 2025-01-01 · 양도 2025-09-01 · 구주택 17개월 + 신축 8개월 = 25개월).
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import { LAND_REBUILD_NOT_APPLIED_NOTICE } from "@/lib/tax-engine/transfer-land-rebuild-rate";
import type { TransferTaxItemInput } from "@/lib/tax-engine/types/transfer-aggregate.types";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";

const D = (s: string) => new Date(s);
const rates = makeMockRates();
const REBUILD = { startMode: "since_land" as const, footprintUnchanged: true, demolitionDate: D("2023-05-31") };

/** 건물 환산취득가 — 건물 파트 양도차익이 −9,000,000(결손)이라 파트별 세율 판정을 거치지 않는다(`partRateBasisApplied=false`) */
const LOSS: Partial<TransferTaxInput> = {
  buildingAcqMode: "estimated",
  standardPricePerSqmAtAcquisition: 1_000_000,
  acquisitionArea: 200,
  standardPriceAtAcquisition: 500_000_000,
  buildingStandardPriceAtAcquisition: 300_000_000,
};

const NORMAL = (o: Partial<TransferTaxInput> = {}): TransferTaxInput =>
  baseTransferInput({
    propertyType: "housing",
    transferPrice: 1_000_000_000,
    transferDate: D("2025-09-01"),
    acquisitionPrice: 450_000_000,
    acquisitionCause: "purchase",
    acquisitionDate: D("2025-01-01"),
    isOneHousehold: false,
    householdHousingCount: 2,
    isSeparateAcquisition: true,
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    landTransferPrice: 700_000_000,
    buildingTransferPrice: 300_000_000,
    landStandardPriceAtTransfer: 700_000_000,
    buildingStandardPriceAtTransfer: 300_000_000,
    landAcquisitionPrice: 200_000_000,
    buildingAcquisitionPrice: 250_000_000,
    landAcquisitionDate: D("2022-01-01"),
    ...o,
  });

// §155⑳ 장기임대 거주주택 특례 적용 자산(앵커 `aggregate-rental-housing-split-part-income`의 시드 형태) — 건물 5년 · 토지 20년 · 구주택 멸실 = 건물 취득 1년 2개월 전
const rentalA: NonNullable<TransferTaxInput["rentalHousingException"]> = {
  applyException: true,
  scenario: "A",
  rentalUnits: [
    {
      businessRegistrationDate: D("2018-06-01"), rentalRegistrationDate: D("2018-06-01"), rentalCategory: "long_general" as const,
      rentalAcquisitionType: "purchase" as const, isApartment: false, region: "non-metro" as const, isExcluded918Rule: false,
      standardPriceAtRentalStart: 250_000_000, hasMinimum2Units: false, rentalMonths: 96, rentalAutoTermination: false, requirementsConfirmed: true,
    },
  ],
};
const yearsBefore = (t: string, y: number, m = 2): string => {
  const x = new Date(t);
  x.setUTCFullYear(x.getUTCFullYear() - y);
  x.setUTCMonth(x.getUTCMonth() - m);
  return x.toISOString().slice(0, 10);
};
const T155 = "2022-06-01";
const RHE = (area: number): Partial<TransferTaxInput> => ({
  transferPrice: 1_300_000_000,
  transferDate: D(T155),
  acquisitionPrice: 300_000_000,
  landTransferPrice: 1_040_000_000,
  buildingTransferPrice: 260_000_000,
  landStandardPriceAtTransfer: 1_040_000_000,
  buildingStandardPriceAtTransfer: 260_000_000,
  landAcquisitionPrice: 200_000_000,
  buildingAcquisitionPrice: 100_000_000,
  acquisitionDate: D(yearsBefore(T155, 5)),
  landAcquisitionDate: D(yearsBefore(T155, 20)),
  buildingFootprintArea: 60,
  acquisitionArea: area,
  appurtenantLandZone: "non_urban",
  residencePeriodMonths: 24,
  isOneHousehold: true,
  householdHousingCount: 1,
  rentalHousingException: rentalA,
});
const rhe = (area: number, withRebuild: boolean): TransferTaxInput =>
  NORMAL({ ...RHE(area), ...(withRebuild ? { landRebuildPriorHouse: { ...REBUILD, demolitionDate: D(yearsBefore(T155, 6)) } } : {}) });

const rebuildWarnings = (w?: string[]) => (w ?? []).filter((x) => x.includes("통산"));
const applyNotice = (w?: string[]) => (w ?? []).filter((x) => x.includes("통산한"));
const item = (i: TransferTaxInput, id: string) => ({ ...i, propertyId: id, propertyLabel: id }) as unknown as TransferTaxItemInput;
const multi = (year: number, items: TransferTaxItemInput[]) => calculateTransferTaxAggregate({ taxYear: year, properties: items, annualBasicDeductionUsed: 0 }, rates);
const second = (): TransferTaxInput =>
  baseTransferInput({
    propertyType: "housing", transferPrice: 900_000_000, acquisitionPrice: 700_000_000, acquisitionDate: D("2020-01-10"), transferDate: D("2025-09-01"),
    isOneHousehold: false, householdHousingCount: 2, expenses: 0, annualBasicDeductionUsed: 0,
  } as Partial<TransferTaxInput>);

describe("A) 정상 적용(파트별 세율 판정) — 적용 고지 그대로, 대체 고지 없음 (회귀 가드)", () => {
  it("FB-A1 단건: partRateBasisApplied=true · 적용 고지 1건 · 대체 고지 없음 · 세액 195,310,000", () => {
    const r = calculateTransferTax(NORMAL({ landRebuildPriorHouse: REBUILD }), rates);
    expect(r.splitDetail?.partRateBasisApplied).toBe(true);
    expect(r.calculatedTax).toBe(195_310_000);
    expect(applyNotice(r.warnings)).toHaveLength(1);
    expect(rebuildWarnings(r.warnings).filter((w) => w.includes("반영되지 않았습니다"))).toEqual([]);
  });
  it("FB-A2 다건: 최종 플래그 true · 적용 고지 `[a]` 1건 · 대체 고지 없음", () => {
    const a = multi(2025, [item(NORMAL({ landRebuildPriorHouse: REBUILD }), "a"), item(second(), "b")]);
    expect((a.properties[0] as unknown as { splitDetail: { partRateBasisApplied?: boolean } }).splitDetail.partRateBasisApplied).toBe(true);
    expect(applyNotice(a.warnings)).toHaveLength(1);
    expect(applyNotice(a.warnings)[0].startsWith("[a] ")).toBe(true);
    expect(a.warnings.some((w) => w.includes(LAND_REBUILD_NOT_APPLIED_NOTICE))).toBe(false);
  });
});

describe("B) 건물 파트 결손 — 영 §167의2①로 토지에서 공제한 뒤 파트별 세율 판정: 통산이 세율에 닿는다 · 적용 고지 · 대체 고지 없음", () => {
  const withRb = NORMAL({ ...LOSS, landRebuildPriorHouse: REBUILD });
  const withoutRb = NORMAL(LOSS);

  it("FB-B1 단건: 플래그 true · 건물 차손 9,000,000을 토지에서 공제 · 토지 기본세율 → 157,460,000 (통산 없으면 두 파트 70%라 접혀 320,950,000)", () => {
    const r = calculateTransferTax(withRb, rates);
    const off = calculateTransferTax(withoutRb, rates);
    expect(r.splitDetail?.partRateBasisApplied).toBe(true);
    expect(r.splitDetail?.land.rateHoldingAggregation?.totalMonths).toBe(25);
    expect(r.calculatedTax).toBe(157_460_000);
    expect(off.calculatedTax).toBe(320_950_000);
    expect(applyNotice(r.warnings)).toHaveLength(1);
    expect((r.warnings ?? []).some((w) => w === LAND_REBUILD_NOT_APPLIED_NOTICE)).toBe(false);
    const step = r.steps.find((x) => x.formula.includes("파트별 세율"))?.formula ?? "";
    expect(step).toContain("건물 양도차손 9,000,000을 토지 양도소득금액에서 공제");
    // 과세표준이 0인 건물 파트의 70%는 쓰이지 않았다 — 산식 머리 세율은 토지 파트 세율
    expect(step.startsWith("과세표준 458,500,000 × 세율 70%")).toBe(false);
    expect((off.warnings ?? []).some((w) => w.includes("통산"))).toBe(false);
  });

  it("대체 고지 문구 — 차손은 후퇴 사유로 적지 않는다 · 숫자 구간 주장 없음 · 확인 필요로 끝난다", () => {
    expect(LAND_REBUILD_NOT_APPLIED_NOTICE).not.toContain("양도차손");
    expect(LAND_REBUILD_NOT_APPLIED_NOTICE).toContain("파트별 세율 판정을 하지 않고 자산 단위 세율을 적용해 통산이 세율에 반영되지 않았습니다");
    expect(LAND_REBUILD_NOT_APPLIED_NOTICE.endsWith("확인 필요")).toBe(true);
    expect(LAND_REBUILD_NOT_APPLIED_NOTICE).not.toMatch(/\d+개월/);
  });

  it("FB-B2 다건: 최종 플래그 true · 적용 고지 `[a]` 1건 · 대체 고지 없음 · 자산 1건이면 단건과 같은 산출세액", () => {
    const single = calculateTransferTax(withRb, rates);
    for (const others of [[], [item(second(), "b")]]) {
      const a = multi(2025, [item(withRb, "a"), ...others]);
      const off = multi(2025, [item(withoutRb, "a"), ...others]);
      expect((a.properties[0] as unknown as { splitDetail: { partRateBasisApplied?: boolean } }).splitDetail.partRateBasisApplied).toBe(true);
      expect(applyNotice(a.warnings)).toHaveLength(1);
      expect(a.warnings.some((w) => w === `[a] ${LAND_REBUILD_NOT_APPLIED_NOTICE}`)).toBe(false);
      expect(a.calculatedTax).toBeLessThan(off.calculatedTax);
      if (others.length === 0) expect(a.calculatedTax).toBe(single.calculatedTax);
    }
  });
});

describe("C) §155⑳ 장기임대 거주주택 특례 — 파트별 세율 판정을 거치지 않는 모델: 대체 고지 · 세액 불변", () => {
  it.each([300, 660])("FB-C1 단건(토지 %i㎡ — 660이면 배율 초과분 분리): 플래그 !== true · echo는 남음 · 대체 고지 1건 · 적용 고지 없음 · 세액 불변", (area) => {
    const r = calculateTransferTax(rhe(area, true), rates);
    const off = calculateTransferTax(rhe(area, false), rates);
    expect(r.rentalHousingExceptionDetail).toBeDefined();
    expect(r.splitDetail?.partRateBasisApplied).not.toBe(true);
    expect(r.splitDetail?.land.rateHoldingAggregation).toBeDefined();
    expect(applyNotice(r.warnings)).toEqual([]);
    expect(r.warnings?.filter((w) => w === LAND_REBUILD_NOT_APPLIED_NOTICE)).toHaveLength(1);
    expect(r.calculatedTax).toBe(off.calculatedTax);
    expect(r.totalTax).toBe(off.totalTax);
    expect((off.warnings ?? []).some((w) => w.includes("통산"))).toBe(false);
  });

  it.each([300, 660])("FB-C2 다건(토지 %i㎡): 최종 플래그 !== true · 대체 고지 `[a]` 1건 · 적용 고지 없음 · 총세액 불변", (area) => {
    const a = multi(2022, [item(rhe(area, true), "a")]);
    const off = multi(2022, [item(rhe(area, false), "a")]);
    expect((a.properties[0] as unknown as { splitDetail: { partRateBasisApplied?: boolean } }).splitDetail.partRateBasisApplied).not.toBe(true);
    expect(applyNotice(a.warnings)).toEqual([]);
    expect(a.warnings.filter((w) => w === `[a] ${LAND_REBUILD_NOT_APPLIED_NOTICE}`)).toHaveLength(1);
    expect(a.totalTax).toBe(off.totalTax);
  });

  it("FB-C3 단건: 다른 특례 고지가 없는 시료(건물 12년·토지 25년 — 기본통칙 95-0…1로 공제율이 달라지지 않음)에서도 대체 고지는 단독으로 실린다 · 세액 불변", () => {
    const seed = (withRebuild: boolean) =>
      NORMAL({
        ...RHE(300),
        acquisitionDate: D(yearsBefore(T155, 12)),
        landAcquisitionDate: D(yearsBefore(T155, 25)),
        ...(withRebuild ? { landRebuildPriorHouse: { ...REBUILD, demolitionDate: D(yearsBefore(T155, 13)) } } : {}),
      });
    const r = calculateTransferTax(seed(true), rates);
    const off = calculateTransferTax(seed(false), rates);
    expect(r.rentalHousingExceptionDetail).toBeDefined();
    expect(r.warnings).toEqual([LAND_REBUILD_NOT_APPLIED_NOTICE]);
    expect(off.warnings ?? []).toEqual([]);
    expect(r.calculatedTax).toBe(off.calculatedTax);
    expect(r.totalTax).toBe(off.totalTax);
  });
});

