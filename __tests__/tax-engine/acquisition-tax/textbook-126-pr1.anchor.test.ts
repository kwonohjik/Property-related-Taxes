/**
 * 취득세 교재 대조(「부동산 컨설팅 전문가 과정」 pp.126~157) PR-1 anchor — T1·T2·T4·T5·T7
 *
 * - T1 (p26): 특수관계인 저가취득 = 시가인정액과 사실상취득가격의 차액이 3억원 이상이거나 시가인정액의
 *   100분의 5 이상 (지방세법 시행령 §18의2). 종전 엔진은 시가 70%~130% 범위로 판정했다.
 * - T2 (p18): 일시적 2주택 처분기한 — 2026.10.1. 이후 납세의무 성립분은 종전·신규 모두 조정대상지역이면 2년
 *   (시행령 §28의5① 2026.9.30. 개정 · 대통령령 제36736호 부칙 제2조①). 2026.8.26. 이전 매매계약 +
 *   계약금 지급 증빙이면 종전 3년(같은 부칙 제2조②).
 * - T4 (p5): 비영리법인도 §13의2①1호 「개인이 아닌 자」 — 주택 수와 무관하게 12%.
 * - T5 (p5): 일시적 2주택(§28의5①)은 §13의2①2호(1세대 2주택) 제외 규정 — 법인에는 없다.
 * - T7 (p20·p29): 「속하는 달의 말일부터 N개월」 = (속한 달 + N)월의 말일 (지방세기본법 §23 → 민법 §157·§160②).
 */
import { describe, it, expect } from "vitest";
import { calcAcquisitionTax } from "../../../lib/tax-engine/acquisition-tax";
import {
  assessTemporaryTwoHouse,
  getDisposalDeadlineYears,
} from "../../../lib/tax-engine/acquisition-surcharge/multi-house";
import { determineAcquisitionTiming } from "../../../lib/tax-engine/acquisition-timing";
import { buildAcquisitionTaxBody } from "@/lib/calc/acquisition-tax-api";
import { INITIAL_FORM, type FormState } from "@/components/calc/acquisition/shared";
import type { AcquisitionTaxInput } from "../../../lib/tax-engine/types/acquisition.types";

function calc(input: Partial<AcquisitionTaxInput>) {
  return calcAcquisitionTax({
    propertyType: "housing",
    acquisitionCause: "purchase",
    acquiredBy: "individual",
    houseCountAfter: 1,
    isRegulatedArea: false,
    balancePaymentDate: "2026-11-01",
    ...input,
  } as AcquisitionTaxInput);
}

// ============================================================
// T1 — 시행령 §18의2 부당행위계산 유형
// ============================================================

describe("T1 특수관계인 저가취득 — 차액 3억 이상 또는 시가 5% 이상 (시행령 §18의2)", () => {
  it("교재 p26·p28: 시가 15억 주택을 12.5억에 취득(차액 2.5억 ≥ 5% 7,500만) → 15억 × 3% = 45,000,000", () => {
    const r = calc({ reportedPrice: 1_250_000_000, marketValue: 1_500_000_000, isRelatedParty: true });
    expect(r.taxBaseMethod).toBe("recognized_market");
    expect(r.taxBase).toBe(1_500_000_000);
    expect(r.acquisitionTax).toBe(45_000_000); // 종전 70% 기준: 12.5억 × 3% = 37,500,000
  });

  it("5% 경계: 시가 10억 건물 — 차액 정확히 5,000만(5%)이면 시가, 4,999만이면 신고가", () => {
    const at = calc({ propertyType: "building", reportedPrice: 950_000_000, marketValue: 1_000_000_000, isRelatedParty: true });
    expect(at.taxBaseMethod).toBe("recognized_market");
    expect(at.taxBase).toBe(1_000_000_000);
    const under = calc({ propertyType: "building", reportedPrice: 950_010_000, marketValue: 1_000_000_000, isRelatedParty: true });
    expect(under.taxBaseMethod).toBe("actual_price");
    expect(under.taxBase).toBe(950_010_000);
  });

  it("3억 경계: 시가 100억 건물 — 차액 3억(3%)이면 시가, 2억9,999만이면 신고가", () => {
    const at = calc({ propertyType: "building", reportedPrice: 9_700_000_000, marketValue: 10_000_000_000, isRelatedParty: true });
    expect(at.taxBaseMethod).toBe("recognized_market");
    expect(at.taxBase).toBe(10_000_000_000);
    const under = calc({ propertyType: "building", reportedPrice: 9_700_010_000, marketValue: 10_000_000_000, isRelatedParty: true });
    expect(under.taxBaseMethod).toBe("actual_price");
    expect(under.taxBase).toBe(9_700_010_000);
  });

  it("시가 이상 신고는 부당행위가 아니다 — 사실상취득가격 그대로", () => {
    const r = calc({ propertyType: "building", reportedPrice: 1_100_000_000, marketValue: 1_000_000_000, isRelatedParty: true });
    expect(r.taxBaseMethod).toBe("actual_price");
    expect(r.taxBase).toBe(1_100_000_000);
  });
});

// ============================================================
// T2 — §28의5① 2026.9.30. 개정 (조정→조정 2년)
// ============================================================

describe("T2 일시적 2주택 처분기한 — 2026.10.1. 이후 조정→조정 2년", () => {
  it("시행일 경계: 2026-09-30 취득 3년 / 2026-10-01 취득 2년", () => {
    expect(getDisposalDeadlineYears("2026-09-30", "regulated", "regulated")).toBe(3);
    expect(getDisposalDeadlineYears("2026-10-01", "regulated", "regulated")).toBe(2);
  });

  it("2026-10-01 이후라도 한쪽이 비조정이면 3년", () => {
    expect(getDisposalDeadlineYears("2026-11-01", "non_regulated", "regulated")).toBe(3);
    expect(getDisposalDeadlineYears("2026-11-01", "regulated", "non_regulated")).toBe(3);
  });

  it("부칙 제2조②: 2026-08-26 계약 + 계약금 증빙 → 3년 / 증빙 없거나 08-27 계약 → 2년", () => {
    const base = {
      houseCount: 2,
      isTemporaryTwoHouse: true,
      balanceDate: "2026-11-01",
      previousHouseRegion: "regulated" as const,
      newHouseRegion: "regulated" as const,
    };
    const kept = assessTemporaryTwoHouse({ ...base, saleContractDate: "2026-08-26", hasContractDepositProof: true });
    expect(kept.disposalDeadlineYears).toBe(3);
    expect(kept.disposalDeadlineDate).toBe("2029-11-01");
    expect(assessTemporaryTwoHouse({ ...base, saleContractDate: "2026-08-26" }).disposalDeadlineYears).toBe(2);
    const late = assessTemporaryTwoHouse({ ...base, saleContractDate: "2026-08-27", hasContractDepositProof: true });
    expect(late.disposalDeadlineYears).toBe(2);
    expect(late.disposalDeadlineDate).toBe("2028-11-01");
    expect(late.warning).toContain("2026.8.26. 이전");
  });

  it("전체 계산: 조정 2주택째 5억 2026-11-01 일시적 2주택 → 중과 배제 1% · 처분기한 2028-11-01(2년)", () => {
    const r = calc({
      reportedPrice: 500_000_000,
      houseCountAfter: 2,
      isRegulatedArea: true,
      isTemporaryTwoHouse: true,
      previousHouseRegion: "regulated",
      newHouseRegion: "regulated",
    });
    expect(r.isSurcharged).toBe(false);
    expect(r.acquisitionTax).toBe(5_000_000);
    expect(r.surchargeDetail?.temporaryTwoHouseDeadlineYears).toBe(2);
    expect(r.surchargeDetail?.temporaryTwoHouseDeadlineDate).toBe("2028-11-01");
  });
});

// ============================================================
// T4 · T5 — §13의2①1호 법인(개인이 아닌 자)
// ============================================================

describe("T4 비영리법인 주택 유상취득 — §13의2①1호 12%", () => {
  it("비영리법인 5억 주택 매매 → 12% = 60,000,000 (종전 1% = 5,000,000)", () => {
    const r = calc({ acquiredBy: "nonprofit", reportedPrice: 500_000_000 });
    expect(r.isSurcharged).toBe(true);
    expect(r.appliedRate).toBe(0.12);
    expect(r.acquisitionTax).toBe(60_000_000);
    expect(r.rateType).toBe("surcharge_corporate");
  });

  it("비교: 같은 조건 개인 1주택 → 1% = 5,000,000", () => {
    expect(calc({ reportedPrice: 500_000_000 }).acquisitionTax).toBe(5_000_000);
  });
});

describe("T5 법인 + 일시적 2주택 토글 — 법인에는 §28의5① 없음", () => {
  const corpTemp: Partial<AcquisitionTaxInput> = {
    acquiredBy: "corporation",
    reportedPrice: 500_000_000,
    houseCountAfter: 2,
    isRegulatedArea: true,
    isTemporaryTwoHouse: true,
    previousHouseRegion: "regulated",
    newHouseRegion: "regulated",
  };

  it("엔진: 토글이 남아 있어도 법인은 12% = 60,000,000 (종전 1% = 5,000,000)", () => {
    const r = calc(corpTemp);
    expect(r.isSurcharged).toBe(true);
    expect(r.acquisitionTax).toBe(60_000_000);
    expect(r.surchargeDetail?.temporaryTwoHouseDeadlineYears).toBeUndefined();
  });

  it("비영리법인도 같다", () => {
    expect(calc({ ...corpTemp, acquiredBy: "nonprofit" }).acquisitionTax).toBe(60_000_000);
  });

  it("API(④): 개인→법인으로 바꿔 화면에서 카드가 사라진 토글 값은 보내지 않는다", () => {
    const form: FormState = {
      ...INITIAL_FORM,
      propertyType: "housing",
      acquisitionCause: "purchase",
      acquiredBy: "corporation",
      reportedPrice: "500,000,000",
      houseCountAfter: "2",
      isTemporaryTwoHouse: true,
      previousHouseRegion: "regulated",
      newHouseRegion: "regulated",
    };
    expect(buildAcquisitionTaxBody(form).isTemporaryTwoHouse).toBeUndefined();
    expect(buildAcquisitionTaxBody({ ...form, acquiredBy: "individual" }).isTemporaryTwoHouse).toBe(true);
  });
});

describe("T2 API(④): 2026.8.26. 이전 계약 계약금 증빙은 조정→조정 일시적 2주택에서만 보낸다", () => {
  const form: FormState = {
    ...INITIAL_FORM,
    propertyType: "housing",
    acquisitionCause: "purchase",
    acquiredBy: "individual",
    reportedPrice: "500,000,000",
    houseCountAfter: "2",
    isRegulatedArea: true,
    isTemporaryTwoHouse: true,
    previousHouseRegion: "regulated",
    newHouseRegion: "regulated",
    saleContractDate: "2026-08-20",
    hasContractDepositProof: true,
  };

  it("08-20 계약 + 증빙 → hasContractDepositProof 전송", () => {
    const body = buildAcquisitionTaxBody(form);
    expect(body.saleContractDate).toBe("2026-08-20");
    expect(body.hasContractDepositProof).toBe(true);
  });

  it("09-01 계약이면 증빙 칸이 화면에 없으므로 보내지 않는다", () => {
    expect(buildAcquisitionTaxBody({ ...form, saleContractDate: "2026-09-01" }).hasContractDepositProof).toBeUndefined();
  });

  it("종전 주택이 비조정이면 보내지 않는다", () => {
    expect(buildAcquisitionTaxBody({ ...form, previousHouseRegion: "non_regulated" }).hasContractDepositProof).toBeUndefined();
  });
});

// ============================================================
// T7 — 「속하는 달의 말일부터 N개월」 신고기한
// ============================================================

describe("T7 상속·증여 신고기한 — (속한 달 + N)월의 말일", () => {
  it("교재 p29: 2026-03-15 상속 → 2026-09-30 (종전 오버플로 10-01)", () => {
    const r = determineAcquisitionTiming({ acquisitionCause: "inheritance", balancePaymentDate: "2026-03-15" });
    expect(r.filingDeadline).toBe("2026-09-30");
  });

  it("상속 2027-08-31 → 2028-02-29 (윤년 2월 말일)", () => {
    const r = determineAcquisitionTiming({ acquisitionCause: "inheritance", balancePaymentDate: "2027-08-31" });
    expect(r.filingDeadline).toBe("2028-02-29");
  });

  it("증여 2026-11-30 → 2027-02-28 / 2026-05-31 → 2026-08-31", () => {
    expect(determineAcquisitionTiming({ acquisitionCause: "gift", contractDate: "2026-11-30" }).filingDeadline).toBe("2027-02-28");
    expect(determineAcquisitionTiming({ acquisitionCause: "gift", contractDate: "2026-05-31" }).filingDeadline).toBe("2026-08-31");
  });

  it("매매 60일은 그대로: 2026-03-15 → 2026-05-14", () => {
    const r = determineAcquisitionTiming({ acquisitionCause: "purchase", balancePaymentDate: "2026-03-15" });
    expect(r.filingDeadline).toBe("2026-05-14");
  });
});
