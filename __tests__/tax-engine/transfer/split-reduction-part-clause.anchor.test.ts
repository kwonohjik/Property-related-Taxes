/**
 * anchor: 토지·건물 분리취득(split) 자산에 「조세특례제한법」 §77 감면이 붙고 **한 파트만** 「소급 2년 이전 취득」 요건을
 * 채우면(5B), 「소득세법」 §90①의 A·D를 그 파트가 속한 §104 호로 잡는다 (Q-F2a·Q-F2c, 2026-10-16).
 *
 * [결함] 파트가 서로 다른 호(토지 단기 2·3호 · 건물 장기 1호)에 걸치면 다건 감면 단계가 호별 산정을 포기하고
 *   신고 전체 산출세액·과세표준으로 계산했다(`spansClauses` → 합산 + 안내). 짝 자산의 8호 세율과 토지 단기세율이
 *   건물 감면으로 번져 과대 감면이었다(대표 셀 29,675,998 vs 분리 신고 25,806,000). 단건도 자산 전체 산출세액으로 계산했다.
 *
 * [수정] 감면소득의 소속 파트가 5B 판정으로 확정돼 있으므로(안분 없음) 그 파트의 호 버킷으로 귀속한다 —
 *   다건 `reductionClauseKeysOf` · 단건 `PublicExpropriationParts.clauseBasis`. 두 파트 모두 감면대상이면(Q-F2b) 종전대로.
 *   계획서 `docs/02-design/features/transfer-104-5-split-nonhouse-followups.plan.md` §2.
 *
 * 대조 기준은 토지 자산 + 건물 자산으로 따로 신고한 값(각자 §77 — 건물만 요건 충족)이다.
 * 모의 세율표: 누진 8구간 · 비사업용 토지 +10%p · 단기 1년 미만 50%·1~2년 40% · §77 현금 10%(2023 양도).
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import type { TransferTaxItemInput } from "@/lib/tax-engine/types/transfer-aggregate.types";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";

const rates = makeMockRates();
const D = (s: string) => new Date(s);
const T = "2023-03-20";
/** 사업인정고시일 2013-01-01 — 소급 2년 이전(2011-01-01 이전) 취득만 충족. 현금보상 = 양도가 전액. */
const E77 = (cash: number) => ({ type: "public_expropriation", cashCompensation: cash, bondCompensation: 0, businessApprovalDate: D("2013-01-01") });

/** 비주택 split — 건물 2008-03-20(15년, 요건 충족) · 토지 `landOn`(요건 미충족). */
const split = (landOn: string, landSale: number, bldSale: number) =>
  baseTransferInput({
    propertyType: "building", transferPrice: landSale + bldSale, transferDate: D(T),
    acquisitionPrice: 500_000_000, acquisitionDate: D("2008-03-20"), landAcquisitionDate: D(landOn),
    isOneHousehold: false, householdHousingCount: 1, isSeparateAcquisition: true, landAcqMode: "actual", buildingAcqMode: "actual",
    landTransferPrice: landSale, buildingTransferPrice: bldSale, landStandardPriceAtTransfer: landSale, buildingStandardPriceAtTransfer: bldSale,
    landAcquisitionPrice: 200_000_000, buildingAcquisitionPrice: 300_000_000, expenses: 0, annualBasicDeductionUsed: 0,
    reductions: [E77(landSale + bldSale)],
  } as Partial<TransferTaxInput>);
/** 같은 자산을 토지 자산 + 건물 자산으로 — 각자 §77. */
const separated = (landOn: string, landSale: number, bldSale: number) => [
  baseTransferInput({
    propertyType: "land", transferPrice: landSale, acquisitionPrice: 200_000_000, acquisitionDate: D(landOn), transferDate: D(T),
    isOneHousehold: false, householdHousingCount: 0, isNonBusinessLand: false, expenses: 0, annualBasicDeductionUsed: 0, reductions: [E77(landSale)],
  } as Partial<TransferTaxInput>),
  baseTransferInput({
    propertyType: "building", transferPrice: bldSale, acquisitionPrice: 300_000_000, acquisitionDate: D("2008-03-20"), transferDate: D(T),
    isOneHousehold: false, householdHousingCount: 1, expenses: 0, annualBasicDeductionUsed: 0, reductions: [E77(bldSale)],
  } as Partial<TransferTaxInput>),
];
/** 짝 — 비사업용 토지 12억/3억(6년 1개월). */
const nbl = () =>
  baseTransferInput({
    propertyType: "land", transferPrice: 1_200_000_000, acquisitionPrice: 300_000_000, acquisitionDate: D("2017-02-20"), transferDate: D(T),
    isOneHousehold: false, householdHousingCount: 0, isNonBusinessLand: true, expenses: 0, annualBasicDeductionUsed: 0,
  } as Partial<TransferTaxInput>);

const asItem = (i: TransferTaxInput, id: string) => ({ ...i, propertyId: id, propertyLabel: id }) as unknown as TransferTaxItemInput;
const agg = (items: TransferTaxInput[]) =>
  calculateTransferTaxAggregate(
    { taxYear: 2023, properties: items.map((x, i) => asItem(x, `A${i}`)), annualBasicDeductionUsed: 0 },
    rates,
  );

describe("F2-1 다건 — 토지 1년 6개월(2호) + 건물 15년(1호) split + 비사업용 토지 짝", () => {
  const P = () => split("2021-09-20", 250_000_000, 1_300_000_000);

  it("감면 25,806,000 = 건물 1호 버킷 258,060,000 × 70,000,000 / 700,000,000 (종전 신고 전체 기준 29,675,998)", () => {
    // 건물 소득 1,000,000,000 − 장특 30% = 700,000,000 → 1호 버킷 prog(700,000,000) = 0.42 × 700,000,000 − 35,940,000
    // 감면소득 (B − C) × E = (700,000,000 − 0) × 10% — 기본공제는 감면 없는 토지분이 먼저 흡수(§103②)
    const r = agg([P(), nbl()]);
    expect(r.reductionAmount).toBe(25_806_000);
    expect(Math.floor((258_060_000 * 70_000_000) / 700_000_000)).toBe(25_806_000);
    const rows = r.reductionBreakdown?.flatMap((b) => (b as { clauseRows?: { clauseLabel: string; calculatedTax: number; taxBase: number }[] }).clauseRows ?? []);
    expect(rows).toEqual([expect.objectContaining({ clauseLabel: "§104①1호", calculatedTax: 258_060_000, taxBase: 700_000_000 })]);
    expect(r.warnings.some((w) => w.includes("서로 다른 세율의 호에 걸쳐"))).toBe(false);
  });

  it("총세액 694,700,600 — 두 입력 순서 모두, 토지 자산 + 건물 자산 분리 신고와 같다", () => {
    expect(agg([P(), nbl()]).totalTax).toBe(694_700_600);
    expect(agg([nbl(), P()]).totalTax).toBe(694_700_600);
    expect(agg([...separated("2021-09-20", 250_000_000, 1_300_000_000), nbl()]).totalTax).toBe(694_700_600);
  });
});

describe("F2-2 단건 — 토지 8개월(3호 50%) + 건물 15년(1호) split, 파트별 세율 합계가 이긴다", () => {
  const P = () => split("2022-07-20", 250_000_000, 1_300_000_000);

  it("감면 25,806,000 · 총세액 286,765,600 = 다건(자산 1건) = 분리 신고 (종전 감면 26,390,234)", () => {
    // 토지 (50,000,000 − 기본공제 2,500,000) × 50% = 23,750,000 + 건물 prog(700,000,000) 258,060,000 = 281,810,000
    //   > 합산 누진 prog(747,500,000) 278,010,000 → §104⑤2호. 감면은 건물 1호 버킷으로 25,806,000.
    // 결정세액 281,810,000 − 25,806,000 = 256,004,000 + 지방소득세 25,600,400 + 농특세(감면 × 20%) 5,161,200
    const s = calculateTransferTax(P(), rates);
    expect(s.calculatedTax).toBe(281_810_000);
    expect(s.publicExpropriationDetail?.partWise?.clauseBasis).toEqual({ calculatedTax: 258_060_000, taxBase: 700_000_000, basicDeduction: 0 });
    expect(s.reductionAmount).toBe(25_806_000);
    expect(s.totalTax).toBe(286_765_600);
    expect(agg([P()]).totalTax).toBe(286_765_600);
    expect(agg(separated("2022-07-20", 250_000_000, 1_300_000_000)).totalTax).toBe(286_765_600);
  });
});

describe("F2-3 대조 — 합산 누진(§104⑤1호)이 이기면 호가 하나라 종전 그대로", () => {
  it("토지 1년 6개월(40%) + 건물 15년 단건: 278,010,000이 이겨 감면은 자산 전체 기준 26,034,381", () => {
    // 토지 47,500,000 × 40% = 19,000,000 + 258,060,000 = 277,060,000 < prog(747,500,000) 278,010,000
    const s = calculateTransferTax(split("2021-09-20", 250_000_000, 1_300_000_000), rates);
    expect(s.calculatedTax).toBe(278_010_000);
    expect(s.publicExpropriationDetail?.partWise?.clauseBasis).toBeUndefined();
    expect(s.reductionAmount).toBe(Math.floor((278_010_000 * 70_000_000) / 747_500_000));
    expect(s.reductionAmount).toBe(26_034_381);
  });
});

describe("F2-4 §103② — 감면 제외 파트에 기본공제를 먼저 준다 (리뷰 #4)", () => {
  // 사업인정고시일 2022-06-01 → 소급 2년 이전(2020-06-01 이전) 취득인 토지만 충족. 토지 2010(13년, 장특 26%) · 건물 1년 6개월(40%).
  const E77b = (cash: number) => ({ type: "public_expropriation", cashCompensation: cash, bondCompensation: 0, businessApprovalDate: D("2022-06-01") });
  const P = () =>
    baseTransferInput({
      propertyType: "building", transferPrice: 1_000_000_000, transferDate: D(T),
      acquisitionPrice: 500_000_000, acquisitionDate: D("2021-09-20"), landAcquisitionDate: D("2010-03-20"),
      isOneHousehold: false, householdHousingCount: 1, isSeparateAcquisition: true, landAcqMode: "actual", buildingAcqMode: "actual",
      landTransferPrice: 650_000_000, buildingTransferPrice: 350_000_000, landStandardPriceAtTransfer: 650_000_000, buildingStandardPriceAtTransfer: 350_000_000,
      landAcquisitionPrice: 200_000_000, buildingAcquisitionPrice: 300_000_000, expenses: 0, annualBasicDeductionUsed: 0,
      reductions: [E77b(1_000_000_000)],
    } as Partial<TransferTaxInput>);
  const L = () =>
    baseTransferInput({
      propertyType: "land", transferPrice: 650_000_000, acquisitionPrice: 200_000_000, acquisitionDate: D("2010-03-20"), transferDate: D(T),
      isOneHousehold: false, householdHousingCount: 0, isNonBusinessLand: false, expenses: 0, annualBasicDeductionUsed: 0, reductions: [E77b(650_000_000)],
    } as Partial<TransferTaxInput>);
  const B = () =>
    baseTransferInput({
      propertyType: "building", transferPrice: 350_000_000, acquisitionPrice: 300_000_000, acquisitionDate: D("2021-09-20"), transferDate: D(T),
      isOneHousehold: false, householdHousingCount: 1, expenses: 0, annualBasicDeductionUsed: 0, reductions: [E77b(350_000_000)],
    } as Partial<TransferTaxInput>);

  it("단건: 토지 333,000,000 · 건물 50,000,000 세율이 같아도 기본공제는 건물에 — 감면 10,726,000 · 총세액 129,232,600 = 분리 신고", () => {
    // 토지 1호 prog(333,000,000) = 107,260,000 · 감면 = 107,260,000 × 33,300,000 / 333,000,000 (C = 0 — 분수가 1을 넘지 않는다)
    // 종전: 기본공제가 토지(감면 파트)로 가 D = 330,500,000인데 C = 0이라 분자 > 분모(감면 10,706,378)
    const s = calculateTransferTax(P(), rates);
    expect(s.publicExpropriationDetail?.partWise?.clauseBasis).toEqual({ calculatedTax: 107_260_000, taxBase: 333_000_000, basicDeduction: 0 });
    expect(s.publicExpropriationDetail?.partWise?.basicDeductionOnExcluded).toBe(2_500_000);
    expect(s.reductionAmount).toBe(10_726_000);
    expect(s.totalTax).toBe(129_232_600);
    expect(agg([P()]).totalTax).toBe(129_232_600);
    expect(agg([L(), B()]).totalTax).toBe(129_232_600);
  });
});
