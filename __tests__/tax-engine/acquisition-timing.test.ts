/**
 * 취득세 취득 시기 확정 단위 테스트
 *
 * acquisition-timing.ts — determineAcquisitionTiming
 *
 * 지방세법 §20 — 취득 시기 결정 규칙:
 * - 유상취득: 잔금지급일·등기접수일 중 빠른 날
 * - 상속: 상속개시일 (사망일), 신고기한 6개월
 * - 증여·부담부증여·기부: 계약일, 신고기한 60일
 * - 원시취득: 사용승인서 발급일 vs 사실상 사용개시일 중 빠른 날
 * - 간주취득: 과점주주/지목변경/개수 완료일
 */

import { describe, it, expect } from "vitest";
import { determineAcquisitionTiming } from "../../lib/tax-engine/acquisition-timing";

// ============================================================
// 유상취득 (매매·교환·공매경매·현물출자)
// ============================================================

describe("determineAcquisitionTiming — 유상취득", () => {
  it("잔금지급일만 있을 때: 잔금지급일이 취득일", () => {
    const result = determineAcquisitionTiming({
      acquisitionCause: "purchase",
      balancePaymentDate: "2024-03-15",
    });
    expect(result.acquisitionDate).toBe("2024-03-15");
    expect(result.filingDeadline).toBe("2024-05-14"); // 60일 후
  });

  it("등기접수일만 있을 때: 등기접수일이 취득일", () => {
    const result = determineAcquisitionTiming({
      acquisitionCause: "purchase",
      registrationDate: "2024-04-01",
    });
    expect(result.acquisitionDate).toBe("2024-04-01");
    expect(result.filingDeadline).toBe("2024-05-31"); // 60일 후
  });

  it("잔금지급일 < 등기접수일: 잔금지급일 선택", () => {
    const result = determineAcquisitionTiming({
      acquisitionCause: "purchase",
      balancePaymentDate: "2024-03-10",
      registrationDate: "2024-03-20",
    });
    expect(result.acquisitionDate).toBe("2024-03-10");
  });

  it("등기접수일 < 잔금지급일: 등기접수일 선택", () => {
    const result = determineAcquisitionTiming({
      acquisitionCause: "purchase",
      balancePaymentDate: "2024-03-20",
      registrationDate: "2024-03-10",
    });
    expect(result.acquisitionDate).toBe("2024-03-10");
  });

  it("잔금지급일·등기접수일 동일: 해당 날짜 취득일", () => {
    const result = determineAcquisitionTiming({
      acquisitionCause: "purchase",
      balancePaymentDate: "2024-03-15",
      registrationDate: "2024-03-15",
    });
    expect(result.acquisitionDate).toBe("2024-03-15");
  });

  it("날짜 미입력: 오늘 날짜 + 경고 메시지", () => {
    const result = determineAcquisitionTiming({
      acquisitionCause: "purchase",
    });
    expect(result.acquisitionDate).toBe(new Date().toISOString().slice(0, 10));
    expect(result.warnings.some((w) => w.includes("미입력"))).toBe(true);
  });

  it("신고기한 = 취득일 + 60일", () => {
    const result = determineAcquisitionTiming({
      acquisitionCause: "purchase",
      balancePaymentDate: "2024-01-01",
    });
    expect(result.filingDeadline).toBe("2024-03-01"); // 60일 후
  });

  it("교환·공매경매도 동일 규칙 적용", () => {
    const exchange = determineAcquisitionTiming({
      acquisitionCause: "exchange",
      balancePaymentDate: "2024-05-01",
      registrationDate: "2024-05-10",
    });
    const auction = determineAcquisitionTiming({
      acquisitionCause: "auction",
      balancePaymentDate: "2024-05-01",
      registrationDate: "2024-05-10",
    });
    expect(exchange.acquisitionDate).toBe("2024-05-01");
    expect(auction.acquisitionDate).toBe("2024-05-01");
  });
});

// ============================================================
// 상속
// ============================================================

describe("determineAcquisitionTiming — 상속", () => {
  it("상속개시일(사망일) → 취득일, 신고기한 6개월", () => {
    const result = determineAcquisitionTiming({
      acquisitionCause: "inheritance",
      balancePaymentDate: "2024-06-01", // 사망일을 balancePaymentDate로 전달
    });
    expect(result.acquisitionDate).toBe("2024-06-01");
    expect(result.filingDeadline).toBe("2024-12-01"); // 6개월 후
  });

  it("상속_농지도 동일 규칙 적용", () => {
    const result = determineAcquisitionTiming({
      acquisitionCause: "inheritance_farmland",
      balancePaymentDate: "2024-01-15",
    });
    expect(result.acquisitionDate).toBe("2024-01-15");
    expect(result.filingDeadline).toBe("2024-07-15");
  });

  it("상속개시일 미입력: 오늘 날짜, 6개월 신고기한", () => {
    const result = determineAcquisitionTiming({
      acquisitionCause: "inheritance",
    });
    const today = new Date().toISOString().slice(0, 10);
    expect(result.acquisitionDate).toBe(today);
    expect(result.warnings.some((w) => w.includes("미입력"))).toBe(true);
    // 6개월 신고기한 확인
    const sixMonthsLater = new Date(today);
    sixMonthsLater.setMonth(sixMonthsLater.getMonth() + 6);
    expect(result.filingDeadline).toBe(sixMonthsLater.toISOString().slice(0, 10));
  });
});

// ============================================================
// 증여·부담부증여·기부
// ============================================================

describe("determineAcquisitionTiming — 증여·부담부증여·기부", () => {
  it("증여계약일이 취득일, 신고기한 60일", () => {
    const result = determineAcquisitionTiming({
      acquisitionCause: "gift",
      contractDate: "2024-07-01",
    });
    expect(result.acquisitionDate).toBe("2024-07-01");
    expect(result.filingDeadline).toBe("2024-08-30"); // 60일 후
  });

  it("부담부증여도 계약일 기준", () => {
    const result = determineAcquisitionTiming({
      acquisitionCause: "burdened_gift",
      contractDate: "2024-08-15",
    });
    expect(result.acquisitionDate).toBe("2024-08-15");
  });

  it("기부채납도 계약일 기준", () => {
    const result = determineAcquisitionTiming({
      acquisitionCause: "donation",
      contractDate: "2024-09-01",
    });
    expect(result.acquisitionDate).toBe("2024-09-01");
  });

  it("contractDate 없고 balancePaymentDate 있으면 balancePaymentDate 사용", () => {
    const result = determineAcquisitionTiming({
      acquisitionCause: "gift",
      balancePaymentDate: "2024-07-20",
    });
    expect(result.acquisitionDate).toBe("2024-07-20");
  });

  it("날짜 미입력: 오늘 날짜 + 경고", () => {
    const result = determineAcquisitionTiming({
      acquisitionCause: "gift",
    });
    expect(result.acquisitionDate).toBe(new Date().toISOString().slice(0, 10));
    expect(result.warnings.some((w) => w.includes("미입력"))).toBe(true);
  });
});

// ============================================================
// 원시취득 (신축·증축·개축·공유수면 매립)
// ============================================================

describe("determineAcquisitionTiming — 원시취득", () => {
  it("사용승인서 발급일만 있을 때: 사용승인서 발급일이 취득일", () => {
    const result = determineAcquisitionTiming({
      acquisitionCause: "new_construction",
      usageApprovalDate: "2024-10-01",
    });
    expect(result.acquisitionDate).toBe("2024-10-01");
    expect(result.filingDeadline).toBe("2024-11-30"); // 60일 후
  });

  it("사실상 사용개시일 < 사용승인서 발급일: 사실상 사용개시일 선택 + 경고", () => {
    const result = determineAcquisitionTiming({
      acquisitionCause: "new_construction",
      usageApprovalDate: "2024-10-15",
      actualUsageDate: "2024-10-01",
    });
    expect(result.acquisitionDate).toBe("2024-10-01");
    expect(result.warnings.some((w) => w.includes("사실상 사용개시일"))).toBe(true);
  });

  it("사용승인서 발급일 < 사실상 사용개시일: 사용승인서 발급일 선택", () => {
    const result = determineAcquisitionTiming({
      acquisitionCause: "new_construction",
      usageApprovalDate: "2024-10-01",
      actualUsageDate: "2024-10-20",
    });
    expect(result.acquisitionDate).toBe("2024-10-01");
    expect(result.warnings.some((w) => w.includes("사실상 사용개시일"))).toBe(false);
  });

  it("사실상 사용개시일만 있을 때: 사실상 사용개시일이 취득일", () => {
    const result = determineAcquisitionTiming({
      acquisitionCause: "new_construction",
      actualUsageDate: "2024-09-15",
    });
    expect(result.acquisitionDate).toBe("2024-09-15");
  });

  it("날짜 미입력: 오늘 날짜 + 경고", () => {
    const result = determineAcquisitionTiming({
      acquisitionCause: "new_construction",
    });
    expect(result.acquisitionDate).toBe(new Date().toISOString().slice(0, 10));
    expect(result.warnings.some((w) => w.includes("미입력"))).toBe(true);
  });

  it("증축·개축도 동일 규칙 적용", () => {
    const ext = determineAcquisitionTiming({
      acquisitionCause: "extension",
      usageApprovalDate: "2024-11-01",
    });
    const rec = determineAcquisitionTiming({
      acquisitionCause: "reconstruction",
      usageApprovalDate: "2024-11-01",
    });
    expect(ext.acquisitionDate).toBe("2024-11-01");
    expect(rec.acquisitionDate).toBe("2024-11-01");
  });
});

// ============================================================
// 간주취득 시기
// ============================================================

describe("determineAcquisitionTiming — 간주취득", () => {
  it("과점주주: deemedAcquisitionDate가 취득일, 신고기한 60일", () => {
    const result = determineAcquisitionTiming({
      acquisitionCause: "deemed_major_shareholder",
      deemedAcquisitionDate: "2024-05-20",
    });
    expect(result.acquisitionDate).toBe("2024-05-20");
    expect(result.filingDeadline).toBe("2024-07-19"); // 60일 후
    expect(result.timingBasis).toContain("과점주주");
  });

  it("지목변경: deemedAcquisitionDate가 취득일", () => {
    const result = determineAcquisitionTiming({
      acquisitionCause: "deemed_land_category",
      deemedAcquisitionDate: "2024-06-10",
    });
    expect(result.acquisitionDate).toBe("2024-06-10");
    expect(result.timingBasis).toContain("지목변경");
  });

  it("건물 개수: deemedAcquisitionDate가 취득일", () => {
    const result = determineAcquisitionTiming({
      acquisitionCause: "deemed_renovation",
      deemedAcquisitionDate: "2024-07-01",
    });
    expect(result.acquisitionDate).toBe("2024-07-01");
    expect(result.timingBasis).toContain("개수");
  });

  it("deemedAcquisitionDate 미입력: contractDate 폴백 + 경고", () => {
    const result = determineAcquisitionTiming({
      acquisitionCause: "deemed_major_shareholder",
      contractDate: "2024-05-01",
    });
    expect(result.acquisitionDate).toBe("2024-05-01");
    expect(result.warnings.some((w) => w.includes("미입력"))).toBe(true);
  });

  it("deemedAcquisitionDate·contractDate 모두 미입력: 오늘 날짜 + 경고", () => {
    const result = determineAcquisitionTiming({
      acquisitionCause: "deemed_land_category",
    });
    expect(result.acquisitionDate).toBe(new Date().toISOString().slice(0, 10));
    expect(result.warnings.some((w) => w.includes("미입력"))).toBe(true);
  });
});
