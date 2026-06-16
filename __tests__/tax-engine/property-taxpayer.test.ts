/**
 * 재산세 납세의무자 확정 테스트 (P2-18~19)
 *
 * T01: 공부상 소유자 원칙
 * T02: 사실상 소유자 ≠ 공부상 소유자 → 사실상 소유자
 * T03: 신탁재산 → 위탁자 (truster, §107②5호 — 2020.12.29 개정, 구법 수탁자 아님)
 * T04: 상속 미등기 → 주된 상속인 (연대납세 warning)
 * T05: 공유재산 → co_owner (지분 최대자)
 * T06: distributeCoOwnershipTax — 2인 공유 안분
 * T07: distributeCoOwnershipTax — 3인 공유 안분 + 잔여 처리
 * T08: distributeCoOwnershipTax — 지분 합계 >1 → 에러
 * T09: 신탁 위탁자 정보 없음 → warning + 공부상 소유자
 */

import { describe, it, expect } from "vitest";
import {
  determineTaxpayer,
  distributeCoOwnershipTax,
} from "../../lib/tax-engine/property-taxpayer";
import { TaxCalculationError } from "../../lib/tax-engine/tax-errors";

const BASE = {
  registeredOwner: "홍길동",
  ownerType: "individual" as const,
};

// ============================================================
// determineTaxpayer
// ============================================================

describe("determineTaxpayer — 납세의무자 확정", () => {
  it("T01: 기본 → 공부상 소유자 (registered_owner)", () => {
    const result = determineTaxpayer(BASE);
    expect(result.type).toBe("registered_owner");
    expect(result.name).toBe("홍길동");
    expect(result.warnings).toHaveLength(0);
  });

  it("T02: 사실상 소유자 ≠ 공부상 소유자 → actual_owner", () => {
    const result = determineTaxpayer({
      ...BASE,
      actualOwner: "김철수",
    });
    expect(result.type).toBe("actual_owner");
    expect(result.name).toBe("김철수");
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("T03: 신탁재산 + 위탁자 정보 있음 → truster (§107②5호, 2020.12.29 개정)", () => {
    const result = determineTaxpayer({
      ...BASE,
      isTrust: true,
      settlor: "홍길동위탁", // 위탁자(신탁 설정자) — 현행법상 납세의무자
    });
    expect(result.type).toBe("truster");
    expect(result.name).toBe("홍길동위탁");
  });

  it("T09: 신탁재산이지만 위탁자 정보 없음 → warning + registered_owner", () => {
    const result = determineTaxpayer({
      ...BASE,
      isTrust: true,
    });
    expect(result.type).toBe("registered_owner");
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("T04: 상속 미등기 + 상속인 2명 → heir_representative + warning", () => {
    const result = determineTaxpayer({
      ...BASE,
      isInheritanceUnregistered: true,
      heirs: ["홍길동", "홍길순"],
    });
    expect(result.type).toBe("heir_representative");
    expect(result.name).toBe("홍길동");
    expect(result.warnings.some((w) => w.includes("연대납세의무"))).toBe(true);
  });

  it("T05: 공유재산 2인 → co_owner (지분 최대자)", () => {
    const result = determineTaxpayer({
      ...BASE,
      coOwnershipShares: [
        { ownerId: "홍길동", shareRatio: 0.3 },
        { ownerId: "김철수", shareRatio: 0.7 },
      ],
    });
    expect(result.type).toBe("co_owner");
    // 지분 최대자 = 김철수(0.7)
    expect(result.name).toBe("김철수");
  });
});

// ============================================================
// distributeCoOwnershipTax
// ============================================================

describe("distributeCoOwnershipTax — 공유세액 안분", () => {
  it("T06: 2인 공유 (5:5) — 100,000원 안분", () => {
    const result = distributeCoOwnershipTax(100_000, [
      { ownerId: "A", shareRatio: 0.5 },
      { ownerId: "B", shareRatio: 0.5 },
    ]);
    expect(result.distributions[0].taxAmount).toBe(50_000);
    expect(result.distributions[1].taxAmount).toBe(50_000);
    expect(result.roundingDiff).toBe(0);
  });

  it("T07: 3인 공유 (1:1:1) — 100,001원 → 마지막 공유자 잔여 처리", () => {
    const result = distributeCoOwnershipTax(100_001, [
      { ownerId: "A", shareRatio: 1 / 3 },
      { ownerId: "B", shareRatio: 1 / 3 },
      { ownerId: "C", shareRatio: 1 / 3 },
    ]);
    // A, B: floor(100001 / 3) = floor(33333.67) = 33333
    expect(result.distributions[0].taxAmount).toBe(33_333);
    expect(result.distributions[1].taxAmount).toBe(33_333);
    // C: 100001 - 33333 - 33333 = 33335
    expect(result.distributions[2].taxAmount).toBe(33_335);
  });

  it("T08: 지분 합계 > 1 → TaxCalculationError", () => {
    expect(() =>
      distributeCoOwnershipTax(100_000, [
        { ownerId: "A", shareRatio: 0.6 },
        { ownerId: "B", shareRatio: 0.6 },
      ]),
    ).toThrow(TaxCalculationError);
  });
});

// ============================================================
// §107 기타 특수 납세의무자 (②3·4·6·7·8호·③)
// ============================================================

describe("determineTaxpayer — §107 기타 특수 납세의무자", () => {
  it("T10: 연부 매수계약자 (§107②4호) → installment_buyer", () => {
    const r = determineTaxpayer({ ...BASE, installmentBuyer: "매수계약자A" });
    expect(r.type).toBe("installment_buyer");
    expect(r.name).toBe("매수계약자A");
    expect(r.legalBasis).toContain("§107②4호");
  });

  it("T11: 환지 체비지·보류지 사업시행자 (§107②6호) → project_operator", () => {
    const r = determineTaxpayer({ ...BASE, projectOperator: "○○도시개발조합" });
    expect(r.type).toBe("project_operator");
    expect(r.name).toBe("○○도시개발조합");
    expect(r.legalBasis).toContain("§107②6호");
  });

  it("T12: 외국인 항공기·선박 수입자 (§107②7호) → importer", () => {
    const r = determineTaxpayer({ ...BASE, importer: "수입자B" });
    expect(r.type).toBe("importer");
    expect(r.name).toBe("수입자B");
    expect(r.legalBasis).toContain("§107②7호");
  });

  it("T13: 종중재산 미신고 (§107②3호) → registered_owner + 종중 근거", () => {
    const r = determineTaxpayer({ ...BASE, isClanProperty: true });
    expect(r.type).toBe("registered_owner");
    expect(r.name).toBe("홍길동");
    expect(r.legalBasis).toContain("§107②3호");
  });

  it("T14: 파산재단 (§107②8호) → registered_owner + 파산 근거", () => {
    const r = determineTaxpayer({ ...BASE, isBankruptcyEstate: true });
    expect(r.type).toBe("registered_owner");
    expect(r.legalBasis).toContain("§107②8호");
  });

  it("T15: 소유권 귀속 불명 (§107③) → user", () => {
    const r = determineTaxpayer({ ...BASE, ownershipUnclearUser: "사용자C" });
    expect(r.type).toBe("user");
    expect(r.name).toBe("사용자C");
    expect(r.legalBasis).toContain("§107③");
  });

  it("T16: 우선순위 — 연부(②4호)가 사실상소유자(①본문)보다 우선", () => {
    const r = determineTaxpayer({
      ...BASE,
      installmentBuyer: "매수자",
      actualOwner: "사실상소유자X",
    });
    expect(r.type).toBe("installment_buyer");
  });
});
