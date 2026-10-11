/**
 * anchor — 주택 부수토지 축 (재검증 S02-5 · S08-8 · G5-6, PR5b).
 *
 * S02-5  「소득세법 시행령」 §154① 보유요건은 양도일 연혁이다 — 2012-06-29 전 양도분은 3년(제22950호 2011-06-03 시행본·
 *        2010-06-08 시행본 원문 확인), 그 뒤는 2년(제23887호 2012-06-29 시행본 원문 확인). 「나중에 산 부수토지」 판정도
 *        주택 본체와 같은 연혁 leaf(`resolveOneHouseMinHoldingYears`)를 쓴다. 종전에는 24개월 상수.
 * S08-8  지분 양도에서도 나중 취득 2년 미만 토지분은 비과세에서 제외한다 — 종전에는 `totalPropertyTransferPrice !== undefined`
 *        (물건 전체 양도가액을 12억 분모로 싣는 값)를 「지분」의 대리 지표로 읽어 G-3을 통째로 껐다.
 * G5-6   영 §154⑦ 후단(2025-11-28 이후 양도, 수용 시 사업인정 고시일 전날 용도지역) 기준일 고지.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { isLaterAcquiredLandHeldTooShort } from "@/lib/tax-engine/transfer-tax-appurtenant-land";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const R = makeMockRates();
const d = (s: string) => new Date(s);
const labels = (r: { steps: { label: string }[] }) => r.steps.map((s) => s.label);

describe("S02-5 — 나중에 산 부수토지 보유요건은 양도일 연혁(3년 → 2년)", () => {
  it("leaf: 2010 양도 · 토지 2년 6개월 → 보유 미달", () => {
    expect(isLaterAcquiredLandHeldTooShort(d("2007-12-15"), d("2004-01-01"), d("2010-06-15"))).toBe(true);
  });
  it("leaf: 2010 양도 · 토지 3년 1개월 → 충족", () => {
    expect(isLaterAcquiredLandHeldTooShort(d("2007-05-15"), d("2004-01-01"), d("2010-06-15"))).toBe(false);
  });
  it("leaf: 경계 — 2012-06-28 양도는 3년, 2012-06-29 양도는 2년", () => {
    // 토지 2년 6개월 보유
    expect(isLaterAcquiredLandHeldTooShort(d("2009-12-20"), d("2004-01-01"), d("2012-06-28"))).toBe(true);
    expect(isLaterAcquiredLandHeldTooShort(d("2010-01-01"), d("2004-01-01"), d("2012-06-29"))).toBe(false);
  });
  it("leaf: 2013 양도 · 토지 2년 6개월 → 충족(2년 — 종전 동작 불변)", () => {
    expect(isLaterAcquiredLandHeldTooShort(d("2010-12-15"), d("2004-01-01"), d("2013-06-15"))).toBe(false);
  });
  it("leaf: 토지를 먼저 취득했으면 이 요건은 걸리지 않는다(주택 본체 요건)", () => {
    expect(isLaterAcquiredLandHeldTooShort(d("2003-01-01"), d("2004-01-01"), d("2010-06-15"))).toBe(false);
  });

  const eng = (transferDate: string, landAcquisitionDate: string): TransferTaxInput =>
    baseTransferInput({
      transferPrice: 600_000_000,
      acquisitionPrice: 200_000_000,
      acquisitionDate: d("2004-01-01"),
      transferDate: d(transferDate),
      residencePeriodMonths: 60,
      householdHousingCount: 1,
      isSeparateAcquisition: true,
      selfOwns: "both",
      landAcquisitionDate: d(landAcquisitionDate),
      landTransferPrice: 350_000_000,
      buildingTransferPrice: 250_000_000,
      landAcquisitionPrice: 100_000_000,
      buildingAcquisitionPrice: 100_000_000,
      landAcqMode: "actual",
      buildingAcqMode: "actual",
      saleSplitMode: "actual",
      landStandardPriceAtTransfer: 350_000_000,
      buildingStandardPriceAtTransfer: 250_000_000,
    } as Partial<TransferTaxInput>);

  it("엔진: 2010 양도 · 토지 2년 6개월 → 토지분 과세(양도차익 250,000,000)", () => {
    const r = calculateTransferTax(eng("2010-06-15", "2007-12-15"), R);
    expect(r.isExempt).toBe(false);
    expect(labels(r)).toContain("부수토지 비과세 제외");
    expect(r.taxableGain).toBe(250_000_000);
  });
  it("대조 · 2010 양도 · 토지 3년 1개월 → 전액 비과세", () => {
    const r = calculateTransferTax(eng("2010-06-15", "2007-05-15"), R);
    expect(r.isExempt).toBe(true);
    expect(r.taxableGain).toBe(0);
  });
  it("대조 · 2013 양도 · 토지 2년 6개월 → 전액 비과세", () => {
    const r = calculateTransferTax(eng("2013-06-15", "2010-12-15"), R);
    expect(r.isExempt).toBe(true);
  });
});

describe("S08-8 — 지분 양도에서도 나중 취득 2년 미만 토지분은 비과세 제외", () => {
  /** 건물 2010-06-01 · 토지 2025-06-01(주택보다 나중·양도일 2026-07-01에 2년 미만) · 지분 1/2. */
  function eng(total: number, share: boolean): TransferTaxInput {
    const k = 0.5;
    return baseTransferInput({
      transferPrice: total * k,
      acquisitionPrice: 250_000_000,
      acquisitionDate: d("2010-06-01"),
      transferDate: d("2026-07-01"),
      residencePeriodMonths: 120,
      householdHousingCount: 1,
      isSeparateAcquisition: true,
      selfOwns: "both",
      landAcquisitionDate: d("2025-06-01"),
      landTransferPrice: total * 0.7 * k,
      buildingTransferPrice: total * 0.3 * k,
      landAcquisitionPrice: 150_000_000,
      buildingAcquisitionPrice: 100_000_000,
      landAcqMode: "actual",
      buildingAcqMode: "actual",
      saleSplitMode: "actual",
      landStandardPriceAtTransfer: 400_000_000,
      buildingStandardPriceAtTransfer: 150_000_000,
      ...(share ? { totalPropertyTransferPrice: total, ownershipRatio: k } : {}),
    } as Partial<TransferTaxInput>);
  }

  it("10억 1/2 지분 = 금액만 절반으로 넣은 대조군과 같은 결과", () => {
    const control = calculateTransferTax(eng(1_000_000_000, false), R);
    const share = calculateTransferTax(eng(1_000_000_000, true), R);
    expect(control.taxableGain, "대조군 자체가 G-3을 탄다").toBe(200_000_000);
    expect(share.isExempt).toBe(false);
    expect(labels(share)).toContain("부수토지 비과세 제외");
    expect(share.taxableGain).toBe(200_000_000);
    expect(share.totalTax).toBe(control.totalTax);
  });

  it("20억 1/2 지분(12억 초과) — G-3 단계가 있다", () => {
    const r = calculateTransferTax(eng(2_000_000_000, true), R);
    expect(labels(r)).toContain("부수토지 비과세 제외");
  });

  it("F-13 단위 카드 — 합계액 주입(지분 아님)도 G-3을 끄지 않는다", () => {
    // `applyOneHouseUnitPrice`가 단위 카드에 `totalPropertyTransferPrice`(합계액)를 채운다 — 지분이 아니다.
    const noUnit = calculateTransferTax(eng(2_000_000_000, false), R);
    const unit = calculateTransferTax(
      { ...eng(2_000_000_000, false), totalPropertyTransferPrice: 1_000_000_000 } as TransferTaxInput,
      R,
    );
    expect(labels(noUnit)).toContain("부수토지 비과세 제외");
    expect(labels(unit)).toContain("부수토지 비과세 제외");
  });

  it("대조 · 지분이어도 토지가 2년 이상이면 비과세(정상)", () => {
    const r = calculateTransferTax({ ...eng(1_000_000_000, true), landAcquisitionDate: d("2023-06-01") }, R);
    expect(r.isExempt).toBe(true);
    expect(r.taxableGain).toBe(0);
  });

  it("대조 · 부담부증여는 여전히 G-3 대상이 아니다(계획서 §5.4 선결 과제)", () => {
    const r = calculateTransferTax(
      { ...eng(1_000_000_000, false), burdenedGiftDenominator: 1_000_000_000 } as TransferTaxInput,
      R,
    );
    expect(labels(r)).not.toContain("부수토지 비과세 제외");
  });
});

describe("G5-6 — 수용 양도(2025-11-28 이후) 부수토지 배율의 용도지역 기준일 고지", () => {
  const eng = (
    transferDate: string,
    transferCause: "general" | "public_expropriation",
    over: Partial<TransferTaxInput> = {},
  ): TransferTaxInput =>
    baseTransferInput({
      propertyType: "housing",
      transferPrice: 2_000_000_000,
      acquisitionPrice: 300_000_000,
      landTransferPrice: 1_600_000_000,
      buildingTransferPrice: 400_000_000,
      landStandardPriceAtTransfer: 1_600_000_000,
      buildingStandardPriceAtTransfer: 400_000_000,
      landAcquisitionPrice: 200_000_000,
      buildingAcquisitionPrice: 100_000_000,
      acquisitionDate: d("2014-09-01"),
      landAcquisitionDate: d("2008-07-01"),
      transferDate: d(transferDate),
      isSeparateAcquisition: true,
      landAcqMode: "actual",
      buildingAcqMode: "actual",
      buildingFootprintArea: 100,
      acquisitionArea: 900,
      appurtenantLandZone: "metropolitan_residential",
      residencePeriodMonths: 60,
      isOneHousehold: true,
      householdHousingCount: 1,
      transferCause,
      ...over,
    } as Partial<TransferTaxInput>);
  const notice = (i: TransferTaxInput) =>
    (calculateTransferTax(i, R).warnings ?? []).filter((w) => w.includes("사업인정 고시일 전날"));

  it("2026-01-15 수용 → 기준일 고지 1건(법령 인용 포함)", () => {
    const n = notice(eng("2026-01-15", "public_expropriation"));
    expect(n).toHaveLength(1);
    expect(n[0]).toContain("§154⑦");
    expect(n[0]).toContain("확인 필요");
  });
  it("경계 · 시행일(2025-11-28) 당일 양도는 고지, 전날은 고지 없음", () => {
    expect(notice(eng("2025-11-28", "public_expropriation"))).toHaveLength(1);
    expect(notice(eng("2025-11-27", "public_expropriation"))).toHaveLength(0);
  });
  it("대조 · 일반 양도 → 고지 없음", () => {
    expect(notice(eng("2026-01-15", "general"))).toHaveLength(0);
  });
  it("대조 · 배율 판정이 안 도는 입력(용도지역 미선택) → 고지 없음", () => {
    expect(notice(eng("2026-01-15", "public_expropriation", { appurtenantLandZone: undefined }))).toHaveLength(0);
  });
  it("세액 불변 — 같은 입력에서 고지 유무와 무관하게 수용·일반의 결과 세액이 같다", () => {
    const a = calculateTransferTax(eng("2026-01-15", "public_expropriation"), R);
    const b = calculateTransferTax(eng("2026-01-15", "general"), R);
    expect(a.totalTax).toBe(b.totalTax);
  });
  it("manifest · §154·§167의5·§168의12 키워드에 후단 구절", async () => {
    const { TRANSFER_DECREE_ADDITIONS } = await import("@/lib/legal-verification/manifest/additions-transfer-decree");
    for (const id of [
      "TRANSFER_DECREE.ONE_HOUSE_SCOPE",
      "TRANSFER_DECREE.SHORT_TERM_HOUSE_LAND",
      "TRANSFER_DECREE.NBL_HOUSE_APPURTENANT",
    ]) {
      const rule = TRANSFER_DECREE_ADDITIONS.find((r) => r.id === id);
      expect(rule, id).toBeDefined();
      expect(rule!.keywords).toContain("사업인정 고시일 전날 현재 해당 토지의 용도지역을 적용한다");
    }
  });
});
