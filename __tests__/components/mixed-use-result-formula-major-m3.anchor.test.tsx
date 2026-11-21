/**
 * anchor — 양도세 결과뷰 리뷰(2026-11-21) c02 MAJOR 묶음 m3: 겸용주택 결과 산식이 엔진이 실제로 쓴 규칙과 값을 그린다.
 *
 *  - R-c02-02 미등기: 장기보유공제(주택·상가·배율 초과분)·기본공제·비과세 배너가 «미등기 배제»를 말한다
 *    (종전 「표1, 0.00% / 보유연수×2%」「연 250만원」「전액 과세 + 표1 공제」 — 보유기간 부족·공제 적용처럼 읽혔다).
 *  - R-c02-03 12억 초과 + 나중에 취득한 부수토지: 「12억 초과 안분」 산식이 «토지분 전액 + 건물분만 안분»을 그린다
 *    (종전 일반 산식 「(주택 양도차익) × (기준 − 12억)/기준」은 검산하면 표시값과 달랐다).
 *  - R-c02-04 §104⑤2호 + §104⑦: 자산별 산출세액 산식이 파트마다 실제로 적용된 세율(단기세율·누진·누진+가산)을 적는다
 *    (종전 「상가분 과세표준 × 누진세율」 고정 — 엔진은 상가분에 단기세율 40%/50%, 1년 미만 주택분에 70%를 썼다).
 *  - R-c02-05 증여 취득 겸용: 취득가액 산식의 평가 기준일이 «증여일»이다(종전 «상속개시일» 고정) · gift_phd_max도 §164⑦ 비교 꼬리말.
 *
 * 단언은 하드코딩 대신 엔진 값과의 일치·자기일관으로 둔다(시료 전제를 먼저 확인 — 픽스처가 바뀌어도 결함이 가려지지 않게).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { calcMixedUseTransferTaxIdN as calc } from "../tax-engine/_helpers/mixed-use-identity-std";
import { makeMockRates, makeMockRatesWithHouseEngine } from "../tax-engine/_helpers/mock-rates";
import { mixedUseCase14, mixedUseExcessLand, CASE14_TRANSFER_PRICE, CASE14_TRANSFER_DATE } from "../tax-engine/_helpers/mixed-use-fixture";
import { MixedUseCalculationSections } from "@/components/calc/results/mixed-use/MixedUseCalculationSections";
import { LTHD_EXCLUSION_LABEL } from "@/lib/tax-engine/legal-codes/transfer-house";
import type { MixedUseAssetInput, MixedUseGainBreakdown } from "@/lib/tax-engine/types/transfer-mixed-use.types";

afterEach(cleanup);

const OPEN = { apportion: true, housing: true, commercial: true, nbl: true, total: true };
const draw = (b: MixedUseGainBreakdown) =>
  render(
    <MixedUseCalculationSections
      breakdown={b} selectedPrintIds={new Set()} openSections={OPEN}
      toggleSection={() => {}} allSectionsOpen setAllSections={() => {}}
    />,
  ).container;

/** 같은 라벨의 Row 전부 — { value, formula } */
function rowsOf(container: HTMLElement, label: string): { value: string; formula: string }[] {
  return [...container.querySelectorAll("span")]
    .filter((e) => e.textContent === label)
    .map((span) => {
      const wrap = span.closest("div.space-y-0\\.5") as HTMLElement;
      const spans = wrap.querySelectorAll("span");
      const value = spans[1]?.textContent ?? "";
      return { value, formula: (wrap.textContent ?? "").replace(label, "").replace(value, "") };
    });
}
const n = (v: number) => v.toLocaleString();

// ───────────────────────────────── R-c02-02 ─────────────────────────────────
describe("R-c02-02 미등기 겸용 — 장기보유공제·기본공제·비과세 배너가 미등기 배제를 말한다", () => {
  const b = calc(CASE14_TRANSFER_PRICE, CASE14_TRANSFER_DATE, { ...mixedUseCase14(), isUnregistered: true } as MixedUseAssetInput, makeMockRates());

  it("시료 전제 — 엔진은 미등기로 계산했고 장특·기본공제가 0이다", () => {
    expect(b.total.rateBasis).toBe("unregistered");
    expect(b.calculationRoute.highValueRule).toBe("non_one_house_full_taxation");
    expect(b.housingPart.longTermDeductionAmount).toBe(0);
    expect(b.commercialPart.longTermDeductionAmount).toBe(0);
    expect(b.total.basicDeduction).toBe(0);
    expect(b.surchargeLthdExclusion).toBeUndefined();
  });

  it("주택·상가 장기보유공제 행 — 「(배제)」 라벨 + 미등기 배제 산식, 보유연수 산식 없음", () => {
    const c = draw(b);
    const rows = rowsOf(c, "장기보유공제 (배제)");
    expect(rows).toHaveLength(2);
    for (const r of rows) expect(r.formula).toBe(LTHD_EXCLUSION_LABEL.unregistered);
    expect(c.textContent).not.toContain("장기보유공제 (표1, 0.00%)");
    expect(c.textContent).not.toContain("보유연수×2%");
  });

  it("기본공제 행 — 미등기 배제(소득세법 §103①1호 단서), 「연 250만원」 없음", () => {
    const c = draw(b);
    const [row] = rowsOf(c, "기본공제 (배제)");
    expect(row, "기본공제 (배제) 행 없음").toBeDefined();
    expect(row.formula).toContain("미등기");
    expect(row.formula).toContain("소득세법 §103①1호 단서");
    expect(c.textContent).not.toContain("연 250만원 (소득세법 §103)");
  });

  it("비과세 배너 — 미등기 배제를 적고 「표1 공제」를 적지 않는다", () => {
    const t = draw(b).textContent ?? "";
    expect(t).toContain("1세대 1주택 비과세: 미적용 (미등기 양도자산 — 비과세 배제(소득세법 §91①) · 장기보유특별공제·기본공제 배제)");
    expect(t).not.toContain("표1 공제");
  });

  it("형제 — 배율 초과분(④ 비사업용토지) 장기보유공제 행도 미등기 배제", () => {
    const bx = calc(CASE14_TRANSFER_PRICE, CASE14_TRANSFER_DATE, mixedUseExcessLand({ isUnregistered: true }), makeMockRates());
    expect(bx.nonBusinessLandPart, "시료 전제 — 배율 초과분 있음").toBeDefined();
    expect(bx.nonBusinessLandPart!.longTermDeductionAmount).toBe(0);
    const c = draw(bx);
    expect(rowsOf(c, "장기보유공제 (배제)")).toHaveLength(3);
    expect(c.textContent).not.toContain("토지 보유연수×2%");
  });

  it("대조 — 등기 · 비과세 미적용이면 종전 문구 그대로", () => {
    const br = calc(CASE14_TRANSFER_PRICE, CASE14_TRANSFER_DATE, { ...mixedUseCase14(), isOneHouseExempt: false } as MixedUseAssetInput, makeMockRates());
    expect(br.total.rateBasis).not.toBe("unregistered");
    const c = draw(br);
    const t = c.textContent ?? "";
    expect(t).toContain("1세대 1주택 비과세: 미적용 (전액 과세 + 표1 공제)");
    expect(rowsOf(c, "기본공제")[0].formula).toBe("연 250만원 (소득세법 §103)");
    expect(rowsOf(c, "장기보유공제 (배제)")).toHaveLength(0);
  });
});

// ───────────────────────────────── R-c02-03 ─────────────────────────────────
describe("R-c02-03 12억 초과 + 나중에 취득한 부수토지 — 토지분 전액 + 건물분만 안분", () => {
  const D = (s: string) => new Date(s);
  const asset = (over: Partial<MixedUseAssetInput> = {}): MixedUseAssetInput => ({
    isMixedUseHouse: true,
    residentialFloorArea: 150,
    nonResidentialFloorArea: 100,
    buildingFootprintArea: 100,
    totalLandArea: 200,
    landAcquisitionDate: D("2023-10-01"),
    buildingAcquisitionDate: D("2021-06-01"),
    transferStandardPrice: { housingPrice: 500_000_000, commercialBuildingPrice: 100_000_000, landPricePerSqm: 2_000_000 },
    acquisitionStandardPrice: {
      housingPrice: 350_000_000, commercialBuildingPrice: 80_000_000, landPricePerSqm: 1_500_000, landPricePerSqmAtBuildingAcq: 1_400_000,
    },
    residencePeriodYears: 3,
    isMetropolitanArea: true,
    zoneType: "residential",
    isOneHouseExempt: true,
    ...over,
  });
  const b = calc(2_500_000_000, D("2024-06-01"), asset(), makeMockRates());
  const h = b.housingPart;
  const LABEL = "12억 초과 안분 후 과세대상 양도차익";

  it("시료 전제 — 나중 토지 제외 · 12억 초과 안분 · 리뷰 실측 값", () => {
    expect(h.laterLandExemptExcluded).toBe(true);
    expect(h.isExempt).toBe(false);
    expect(h.highValueBase).toBeGreaterThan(1_200_000_000);
    expect(h.proratedTaxableGain).toBe(259_870_985);
  });

  it("산식 — 「부수토지 양도차익 X 전액 + 건물분 Y × (기준 − 12억)/기준」, 산식대로 계산하면 표시값", () => {
    const [row] = rowsOf(draw(b), LABEL);
    expect(row.value.replace(/[^\d]/g, "")).toBe(String(h.proratedTaxableGain));
    const base = h.highValueBase!;
    const land = h.landTransferGain - h.nonBusinessTransferredGain;
    expect(row.formula).toContain(`부수토지 양도차익 ${n(land)} 전액`);
    expect(row.formula).toContain(`건물분 ${n(h.buildingTransferGain)} ×`);
    expect(row.formula).not.toContain(`(주택 양도차익 ${n(h.transferGain)}`);
    // 자기일관 — 표시된 산식으로 검산
    expect(land + Math.floor((h.buildingTransferGain * (base - 1_200_000_000)) / base)).toBe(h.proratedTaxableGain);
  });

  // 리뷰 후속 — L-10(건물 전체로 고가 판정 · 주택분 ≤ 12억)에서도 나중 토지분은 전액 과세(엔진 landProratio = 1), 건물분은 0.
  for (const [title, price, over] of [
    ["L-10 15억", 1_500_000_000, {}],
    ["L-10 18억", 1_800_000_000, {}],
    ["L-10 + 배율 초과 25억", 2_500_000_000, { totalLandArea: 1000 }],
  ] as const) {
    it(`형제 ${title} — 주택분 ≤ 12억 분기도 「부수토지 양도차익 X 전액 + 건물분 Y × 0」, 산식대로 계산하면 표시값`, () => {
      const bl = calc(price, D("2024-06-01"), asset(over), makeMockRates());
      const hl = bl.housingPart;
      expect(hl.laterLandExemptExcluded).toBe(true);
      expect(hl.isExempt).toBe(false);
      expect(hl.highValueBase!).toBeLessThanOrEqual(1_200_000_000);
      expect(hl.highValueJudgmentBase!).toBeGreaterThan(1_200_000_000);
      expect(hl.proratedTaxableGain).toBeGreaterThan(0);
      const [row] = rowsOf(draw(bl), LABEL);
      expect(row.value.replace(/[^\d]/g, "")).toBe(String(hl.proratedTaxableGain));
      const land = hl.landTransferGain - hl.nonBusinessTransferredGain;
      expect(row.formula).toContain(`부수토지 양도차익 ${n(land)} 전액`);
      expect(row.formula).toContain(`건물분 ${n(hl.buildingTransferGain)} × 0`);
      expect(row.formula).not.toContain("산식은 주택 부분만");
      if (hl.nonBusinessTransferredGain > 0) expect(row.formula).toContain(`비사업용 이전분 ${n(hl.nonBusinessTransferredGain)} 제외`);
      // 자기일관 — 표시된 산식으로 검산(건물분 × 0)
      expect(land).toBe(hl.proratedTaxableGain);
    });
  }

  it("대조 — 토지·건물 같은 날이면 종전 일반 산식 그대로", () => {
    const bs = calc(2_500_000_000, D("2024-06-01"), asset({ landAcquisitionDate: D("2021-06-01") }), makeMockRates());
    expect(bs.housingPart.laterLandExemptExcluded).toBeFalsy();
    const [row] = rowsOf(draw(bs), LABEL);
    expect(row.formula).toContain(`(주택 양도차익 ${n(bs.housingPart.transferGain)}`);
  });
});

// ───────────────────────────────── R-c02-04 ─────────────────────────────────
describe("R-c02-04 §104⑤2호 + §104⑦ — 자산별 산식이 파트별 적용세율을 적는다", () => {
  const run = (acq: string) =>
    calc(3_000_000_000, new Date("2026-06-01"), {
      ...mixedUseCase14(), isOneHouseExempt: false,
      landAcquisitionDate: new Date(acq), buildingAcquisitionDate: new Date(acq),
      surchargeFallback: { isRegulatedArea: true, householdHousingCount: 2 },
    } as MixedUseAssetInput, makeMockRatesWithHouseEngine());
  const calcRow = (b: MixedUseGainBreakdown) => rowsOf(draw(b), "산출세액 (자산별 합계)")[0];

  it("보유 1년 이상 2년 미만 — 주택분 누진 + 20%p · 상가분 단기세율 40%(§104①2호), 항별 세액 합 = 산출세액", () => {
    const b = run("2025-01-01");
    const t = b.total;
    expect(t.rateBasis).toBe("clause2");
    expect(t.surchargeAddon).toBe(0.2);
    expect(t.transferTax).toBe(1_168_564_641);
    const terms = t.clause2Terms!;
    expect(terms.reduce((a, x) => a + x.tax, 0)).toBe(t.transferTax);
    const row = calcRow(b);
    expect(row.formula).toContain(`주택부분 과세표준 ${n(terms.find((x) => x.kinds.includes("housing"))!.taxBase)} × (누진세율 + 20%p)`);
    expect(row.formula).toContain("× 단기세율 40%[소득세법 §104 ①2호 — 누진세율보다 큼]");
    expect(row.formula).not.toContain("상가분 과세표준 × 누진세율");
  });

  it("보유 1년 미만 — 주택분 70%(누진 + 20%p보다 큼, §104⑦ 후단) · 상가분 50%(§104①3호)", () => {
    const b = run("2025-09-01");
    const t = b.total;
    expect(t.rateBasis).toBe("clause2");
    expect(t.transferTax).toBe(1_390_189_746);
    expect(t.clause2Terms!.reduce((a, x) => a + x.tax, 0)).toBe(t.transferTax);
    const row = calcRow(b);
    expect(row.formula).toMatch(/주택부분 과세표준 [\d,]+ × 단기세율 70%\[소득세법 §104 ①3호 — 누진세율 \+ 20%p보다 큼\]/);
    expect(row.formula).toContain("× 단기세율 50%[소득세법 §104 ①3호 — 누진세율보다 큼]");
    expect(row.formula).not.toContain("주택분 과세표준 × (누진세율 + 20.00%)");
  });
});

// ───────────────────────────────── R-c02-05 ─────────────────────────────────
describe("R-c02-05 증여 취득 겸용 — 취득가액 산식의 평가 기준일은 증여일", () => {
  const GIFT = new Date("2020-06-01");
  const giftBase = (over: Partial<MixedUseAssetInput> = {}): MixedUseAssetInput => ({
    isMixedUseHouse: true,
    residentialFloorArea: 100,
    nonResidentialFloorArea: 100,
    buildingFootprintArea: 100,
    totalLandArea: 200,
    landAcquisitionDate: GIFT,
    buildingAcquisitionDate: GIFT,
    transferStandardPrice: { housingPrice: 800_000_000, commercialBuildingPrice: 500_000_000, landPricePerSqm: 3_000_000 },
    acquisitionStandardPrice: { housingPrice: 500_000_000, commercialBuildingPrice: 300_000_000, landPricePerSqm: 2_000_000 },
    residencePeriodYears: 6,
    isMetropolitanArea: true,
    zoneType: "residential",
    isOneHouseExempt: true,
    acquisitionByGift: true,
    ...over,
  });
  const run = (a: MixedUseAssetInput) => calc(3_300_000_000, new Date("2026-06-01"), a, makeMockRates());
  const LABEL = "증여일 평가액(취득가액)";

  it("gift_direct — 주택분·상가분 산식 모두 「증여일 보충적평가액」, 「상속개시일」 없음", () => {
    const b = run(giftBase());
    expect(b.calculationRoute.acquisitionConversionRoute).toBe("gift_direct");
    const c = draw(b);
    const rows = rowsOf(c, LABEL);
    expect(rows).toHaveLength(2);
    expect(rows[0].formula).toContain(`증여일 보충적평가액(상증법 §60~66) ${n(b.housingPart.inheritedAcquisitionDetail!.standardPriceCandidate)}`);
    expect(rows[1].formula).toContain(`증여일 보충적평가액(상증법 §60~66) ${n(b.commercialPart.inheritedAcquisitionDetail!.standardPriceCandidate)}`);
    expect(c.textContent).not.toContain("상속개시일");
  });

  it("gift_direct 신고가액 — 「증여일 신고가액」", () => {
    const b = run(giftBase({ housingInheritedValue: 550_000_000, commercialInheritedValue: 520_000_000 }));
    const rows = rowsOf(draw(b), LABEL);
    expect(rows[0].formula).toContain(`증여일 신고가액 ${n(550_000_000)}`);
    expect(rows[1].formula).toContain(`증여일 신고가액 ${n(520_000_000)}`);
  });

  it("gift_phd_max — 신고가액과 §164⑦ 환산가액 비교 꼬리말이 붙는다(엔진이 같은 max를 쓴다)", () => {
    const b = run(giftBase({
      landAcquisitionDate: new Date("2000-06-01"),
      buildingAcquisitionDate: new Date("2000-06-01"),
      acquisitionStandardPrice: { housingPrice: undefined, commercialBuildingPrice: 300_000_000, landPricePerSqm: 2_000_000 },
      usePreHousingDisclosure: true,
      preHousingDisclosure: {
        firstDisclosureDate: new Date("2005-01-01"),
        firstDisclosureHousingPrice: 150_000_000,
        landPricePerSqmAtAcquisition: 800_000,
        buildingStdPriceAtAcquisition: 5_000_000,
        landPricePerSqmAtFirstDisclosure: 1_200_000,
        buildingStdPriceAtFirstDisclosure: 8_000_000,
        transferHousingPrice: 800_000_000,
        landPricePerSqmAtTransfer: 3_000_000,
        buildingStdPriceAtTransfer: 20_000_000,
      },
      housingInheritedValue: 90_000_000,
    }));
    expect(b.calculationRoute.acquisitionConversionRoute).toBe("gift_phd_max");
    const d = b.housingPart.inheritedAcquisitionDetail!;
    expect(d.selected).toBe("standard_price");
    const [row] = rowsOf(draw(b), LABEL);
    expect(row.formula).toContain(`증여일 보충적평가액(상증법 §60~66) ${n(d.standardPriceCandidate)}`);
    expect(row.formula).toContain(`(신고가액 ${n(90_000_000)}과 §164⑦ 환산가액 중 큰 값 — 소령 §163⑨2호)`);
  });
});
