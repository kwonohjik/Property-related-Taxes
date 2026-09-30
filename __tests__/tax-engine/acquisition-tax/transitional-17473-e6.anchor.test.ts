/**
 * anchor: 취득세 — 법률 제17473호 부칙 제6조 (2020.7.10. 이전 매매계약 경과조치) — 계획서 E-6
 *
 * 부칙 제6조 (DRF target=law MST 220927 부칙단위 실독 2026-09-30):
 *  「제13조제2항 및 제13조의2의 개정규정을 적용할 때 법인 및 국내에 주택을 1개 이상 소유하고 있는
 *   1세대가 2020년 7월 10일 이전에 주택에 대한 매매계약(공동주택 분양계약을 포함한다)을 체결한
 *   경우에는 그 계약을 체결한 당사자의 해당 주택의 취득에 대하여 종전의 규정을 적용한다. 다만,
 *   해당 계약이 계약금을 지급한 사실 등이 증빙서류에 의하여 확인되는 경우에 한정한다.」
 * 종전 규정(법률 제16855호, MST 213055): §11①8호 1~3% · §11④2호 1세대 4주택 이상 4% ·
 *   §13② 괄호(대도시 법인 주택 = 표준세율 + 중과기준세율×200%) · §13의2 없음.
 * 선례: 조심 2023지3609(1세대 2주택 → 종전 1%) · 조심 2021지5664(법인 → §11①8호 세율).
 *
 * 변경 전 실측(같은 입력 — 폼 → 빌더 → Zod → 엔진, base b49826f8):
 *   개인 조정 2주택 5억 8% 40,000,000 · 개인 조정 4주택 12% 60,000,000 ·
 *   법인 12% 60,000,000 · 대도시 법인 12% 60,000,000
 */

import { describe, it, expect } from "vitest";
import { INITIAL_FORM, createOwnedHouseInfo, type FormState } from "@/components/calc/acquisition/shared";
import { buildAcquisitionTaxBody } from "@/lib/calc/acquisition-tax-api";
import { acquisitionTaxInputSchema } from "@/lib/validators/acquisition-input";
import { calcAcquisitionTax } from "@/lib/tax-engine/acquisition-tax";
import { ACQUISITION } from "@/lib/tax-engine/legal-codes";

function house(id: string) {
  return { ...createOwnedHouseInfo(id), standardValue: "300000000", acquisitionDate: "2015-01-01", isMetropolitanRegion: true };
}

/** 개인 · 조정 · 5억 매매 · 2020.7.1. 계약(계약금 증빙) · 2021.5.12. 잔금 · 보유 1주택 */
function baseForm(over: Partial<FormState> = {}): FormState {
  return {
    ...INITIAL_FORM,
    propertyType: "housing",
    acquisitionCause: "purchase",
    acquiredBy: "individual",
    reportedPrice: "500000000",
    standardValue: "500000000",
    isRegulatedArea: true,
    isMetropolitanRegion: true,
    houseCountAfter: "2",
    balancePaymentDate: "2021-05-12",
    saleContractDate: "2020-07-01",
    hasContractDepositProof: true,
    ownedHouseAtSaleContract: true,
    ownedHouses: [house("A")],
    ...over,
  } as FormState;
}

function calcViaRoute(form: FormState) {
  const parsed = acquisitionTaxInputSchema.safeParse(buildAcquisitionTaxBody(form));
  expect(parsed.success).toBe(true);
  if (!parsed.success) throw new Error("unreachable");
  return calcAcquisitionTax(parsed.data);
}

const exceptions = (r: ReturnType<typeof calcViaRoute>) => r.surchargeDetail?.surchargeExceptions ?? [];

describe("[E6] 법률 제17473호 부칙 제6조 — 개인", () => {
  it("[E6-01] 🔴 조정 2주택 · 2020.7.1. 계약 → 종전 §11①8호 1% (현행 8% 40,000,000)", () => {
    const r = calcViaRoute(baseForm());
    expect(r.appliedRate).toBe(0.01);
    expect(r.isSurcharged).toBe(false);
    expect(r.acquisitionTax).toBe(5_000_000);
    expect(r.totalTax).toBe(6_500_000);
    expect(r.legalBasis).toContain(ACQUISITION.SURCHARGE_17473_TRANSITION);
    expect(exceptions(r).some((e) => e.includes(ACQUISITION.SURCHARGE_17473_TRANSITION))).toBe(true);
  });

  it("[E6-02] 경계 — 계약일 2020.7.10.(「이전」은 당일 포함) → 1%", () => {
    expect(calcViaRoute(baseForm({ saleContractDate: "2020-07-10" } as Partial<FormState>)).acquisitionTax).toBe(5_000_000);
  });

  it("[E6-03] 긍정 짝 — 계약일 2020.7.11. → 현행 8% 40,000,000", () => {
    const r = calcViaRoute(baseForm({ saleContractDate: "2020-07-11" } as Partial<FormState>));
    expect(r.appliedRate).toBe(0.08);
    expect(r.acquisitionTax).toBe(40_000_000);
  });

  it("[E6-04] 단서 — 계약금 증빙 없음 → 현행 8% + 고지", () => {
    const r = calcViaRoute(baseForm({ hasContractDepositProof: false }));
    expect(r.acquisitionTax).toBe(40_000_000);
    expect(r.warnings.some((w) => w.includes("계약금 지급 사실이 증빙서류로 확인되지 않아"))).toBe(true);
  });

  it("[E6-05] 계약 당시 무주택 1세대 → 부칙 대상 아님 → 현행 8% + 고지", () => {
    const r = calcViaRoute(baseForm({ ownedHouseAtSaleContract: false } as Partial<FormState>));
    expect(r.acquisitionTax).toBe(40_000_000);
    expect(r.warnings.some((w) => w.includes("국내에 주택을 1개 이상 소유한 1세대가 아니어서"))).toBe(true);
  });

  it("[E6-06] 🔴 조정 4주택 → 종전 §11④2호 4% 20,000,000 (현행 12% 60,000,000) · 교육세 본문 0.4%", () => {
    const r = calcViaRoute(baseForm({ houseCountAfter: "4", ownedHouses: [house("A"), house("B"), house("C")] }));
    expect(r.appliedRate).toBe(0.04);
    expect(r.acquisitionTax).toBe(20_000_000);
    expect(r.ruralSpecialTax).toBe(1_000_000); // 표준세율 2% 치환 × 10%
    expect(r.localEducationTax).toBe(2_000_000); // (4% − 2%) × 20%
    expect(r.totalTax).toBe(23_000_000);
    expect(r.legalBasis).toContain(ACQUISITION.PRE_17473_FOUR_HOUSE_RATE);
    // 본문 (4% − 2%) × 20%와 §11①8호 괄호(본세 × 50% × 20%)는 4%에서 원 단위까지 항등이다
    // (floor(floor(0.04x)/10) = floor(floor(0.02x)/5) — 2n+1은 10의 배수가 될 수 없다). 금액으로는 분기를
    // 구별할 수 없으므로 표시 산식으로 고정한다.
    const edu = r.steps?.find((st) => st.label === "지방교육세");
    expect(edu?.formula).toContain("종전 §11④2호");
  });

  it("[E6-07] 3주택(4주택 미만) → 종전 §11①8호 1% (현행 12% 60,000,000)", () => {
    const r = calcViaRoute(baseForm({ houseCountAfter: "3", ownedHouses: [house("A"), house("B")] }));
    expect(r.appliedRate).toBe(0.01);
    expect(r.acquisitionTax).toBe(5_000_000);
  });

  it("[E6-08] 종전 §22의2는 입주권·분양권·오피스텔을 세지 않는다 — 주택 2 + 분양권 1 + 취득 → 3주택 1%", () => {
    const right = { ...createOwnedHouseInfo("R"), propertyType: "subscription_right", acquisitionDate: "2020-09-01" };
    const r = calcViaRoute(baseForm({ ownedHouses: [house("A"), house("B"), right] }));
    expect(r.acquisitionTax).toBe(5_000_000);
  });

  it("[E6-09] 교환(매매계약 아님) → 부칙 대상 아님 → 현행 8% (④도 매매계약일을 보내지 않는다)", () => {
    const r = calcViaRoute(baseForm({ acquisitionCause: "exchange" }));
    expect(r.acquisitionTax).toBe(40_000_000);
    expect(buildAcquisitionTaxBody(baseForm({ acquisitionCause: "exchange" })).saleContractDate).toBeUndefined();
  });

  it("[E6-09b] 엔진 직접 — 교환에 매매계약일이 실려 와도 부칙 제6조를 적용하지 않는다 (④ 게이트와 겹친 방어)", () => {
    const parsed = acquisitionTaxInputSchema.parse(buildAcquisitionTaxBody(baseForm()));
    const r = calcAcquisitionTax({ ...parsed, acquisitionCause: "exchange" });
    expect(r.acquisitionTax).toBe(40_000_000);
  });

  it("[E6-10] 취득일 2020.8.11.(시행 전) → 부칙 제6조 대상 아님 + 시행 전 취득 고지", () => {
    const r = calcViaRoute(baseForm({ balancePaymentDate: "2020-08-11" }));
    expect(r.legalBasis).not.toContain(ACQUISITION.SURCHARGE_17473_TRANSITION);
    expect(r.warnings.some((w) => w.includes("2020.8.12. 전입니다"))).toBe(true);
  });

  it("[E6-11] 계약일 미입력 → 현행 규정 그대로 (8%)", () => {
    expect(calcViaRoute(baseForm({ saleContractDate: "" } as Partial<FormState>)).acquisitionTax).toBe(40_000_000);
  });
});

describe("[E6] 법률 제17473호 부칙 제6조 — 법인", () => {
  const corp = (over: Partial<FormState> = {}) =>
    baseForm({ acquiredBy: "corporation", ownedHouseAtSaleContract: false, ...over } as Partial<FormState>);

  it("[E6-12] 🔴 법인(대도시 아님) → 종전 §11①8호 1% 5,000,000 (현행 §13의2①1호 12% 60,000,000)", () => {
    const r = calcViaRoute(corp());
    expect(r.appliedRate).toBe(0.01);
    expect(r.acquisitionTax).toBe(5_000_000);
    expect(r.totalTax).toBe(6_500_000);
  });

  it("[E6-13] 긍정 짝 — 법인 · 2020.7.11. 계약 → 현행 12%", () => {
    expect(calcViaRoute(corp({ saleContractDate: "2020-07-11" } as Partial<FormState>)).acquisitionTax).toBe(60_000_000);
  });

  it("[E6-14] 🔴 대도시 법인(과밀억제·설립 5년 내) → 종전 §13② 괄호 1% + 4% = 5% 25,000,000", () => {
    const r = calcViaRoute(corp({ isMetropolitanCongestion: true, isWithin5YearsOfEstablishment: true }));
    expect(r.appliedRate).toBeCloseTo(0.05, 10);
    expect(r.acquisitionTax).toBe(25_000_000);
    expect(r.ruralSpecialTax).toBe(3_000_000); // (2% + 4%p) × 10%
    expect(r.localEducationTax).toBe(2_000_000); // §151①1가 단서 → 나목 0.4%
    expect(r.totalTax).toBe(30_000_000);
    expect(r.legalBasis).toContain(ACQUISITION.PRE_17473_METRO_CORP_HOUSING);
  });
});
