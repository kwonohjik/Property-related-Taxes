/**
 * 재산세 납세의무자 판정 anchor 테스트 (Phase A+B Pre-Do)
 *
 * A-1: 신탁재산 입력 시 determineTaxpayer → type "truster"(위탁자) 반환
 *      현재: "trustee"(수탁자) 반환 → 실패해야 정상
 *
 * A-2: calculatePropertyTax + taxpayerInfo.coOwnershipShares 입력 시
 *      result.taxpayer.type === "co_owner"
 *      && coOwnershipDistribution.distributions 합 == determinedTax 및 totalPayable
 *      현재: taxpayer 필드 자체가 없음 → 타입 에러/undefined로 실패해야 정상
 *
 * A-3: taxpayerInfo 미입력 시 기존 세액·과세표준 anchor 전부 불변 (회귀)
 */

import { describe, it, expect } from "vitest";
import {
  determineTaxpayer,
} from "../../../lib/tax-engine/property-taxpayer";
import {
  calculatePropertyTax,
} from "../../../lib/tax-engine/property-tax";

// ============================================================
// A-1: 신탁재산 → 위탁자 (Phase A 핫픽스 검증)
// ============================================================

describe("A-1: 신탁재산 → 위탁자(truster) — 현재 실패(trustee 반환) → 수정 후 통과", () => {
  it("신탁재산 입력 시 type=truster, name=위탁자 반환", () => {
    const result = determineTaxpayer({
      registeredOwner: "KB부동산신탁", // 공부상: 수탁자 법인
      isTrust: true,
      trustType: "other",
      settlor: "홍길동", // 위탁자(신탁 설정자) — 현행법상 납세의무자
    });
    // 수정 전: "trustee" 반환 → 실패
    // 수정 후: "truster" 반환 → 통과
    expect(result.type).toBe("truster");
    expect(result.name).toBe("홍길동");
  });

  it("신탁재산이지만 위탁자 정보 없음 → warning + registered_owner fallback", () => {
    const result = determineTaxpayer({
      registeredOwner: "KB부동산신탁",
      isTrust: true,
    });
    expect(result.type).toBe("registered_owner");
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

// ============================================================
// A-2: calculatePropertyTax + coOwnershipShares → 공유 안분 (Phase B 통합 검증)
// ============================================================

describe("A-2: calculatePropertyTax + taxpayerInfo.coOwnershipShares → co_owner + 안분 합 일치", () => {
  it("공유재산 2인(6:4) → taxpayer.type=co_owner + 안분 합 == determinedTax", () => {
    const result = calculatePropertyTax({
      objectType: "housing",
      publishedPrice: 300_000_000, // 3억 주택
      isOneHousehold: false,
      isUrbanArea: true,
      taxpayerInfo: {
        registeredOwner: "홍길동",
        coOwnershipShares: [
          { ownerId: "홍길동", shareRatio: 0.6 },
          { ownerId: "김철수", shareRatio: 0.4 },
        ],
      },
    } as Parameters<typeof calculatePropertyTax>[0]);

    // 납세의무자
    expect(result.taxpayer).toBeDefined();
    expect(result.taxpayer!.type).toBe("co_owner");

    // 공유 안분 결과
    expect(result.coOwnershipDistribution).toBeDefined();
    const dists = result.coOwnershipDistribution!.distributions;

    // determinedTax 안분 합 일치
    const taxSum = dists.reduce((s, d) => s + d.taxAmount, 0);
    expect(taxSum).toBe(result.determinedTax);

    // totalPayable 안분 합 일치
    const totalSum = dists.reduce((s, d) => s + d.totalAmount, 0);
    expect(totalSum).toBe(result.totalPayable);
  });

  it("공유 지분 합 검증 — floor 잔액은 마지막 공유자 흡수", () => {
    const result = calculatePropertyTax({
      objectType: "housing",
      publishedPrice: 200_000_000,
      isOneHousehold: false,
      taxpayerInfo: {
        registeredOwner: "A",
        coOwnershipShares: [
          { ownerId: "A", shareRatio: 1 / 3 },
          { ownerId: "B", shareRatio: 1 / 3 },
          { ownerId: "C", shareRatio: 1 / 3 },
        ],
      },
    } as Parameters<typeof calculatePropertyTax>[0]);

    expect(result.coOwnershipDistribution).toBeDefined();
    const dists = result.coOwnershipDistribution!.distributions;
    expect(dists).toHaveLength(3);

    const taxSum = dists.reduce((s, d) => s + d.taxAmount, 0);
    expect(taxSum).toBe(result.determinedTax);
  });
});

// ============================================================
// A-3: taxpayerInfo 미입력 시 기존 세액·과세표준 불변 (회귀)
// ============================================================

describe("A-3: taxpayerInfo 미입력 → 기존 세액·과세표준 완전 불변 (회귀)", () => {
  const BASE_INPUT = {
    objectType: "housing" as const,
    publishedPrice: 300_000_000,
    isOneHousehold: false,
    isUrbanArea: true,
  };

  it("taxpayerInfo 없을 때 과세표준·세율·세액 기존값 유지", () => {
    const withoutInfo = calculatePropertyTax(BASE_INPUT);
    const withInfo = calculatePropertyTax({
      ...BASE_INPUT,
      taxpayerInfo: undefined,
    } as Parameters<typeof calculatePropertyTax>[0]);

    expect(withInfo.taxBase).toBe(withoutInfo.taxBase);
    expect(withInfo.appliedRate).toBe(withoutInfo.appliedRate);
    expect(withInfo.calculatedTax).toBe(withoutInfo.calculatedTax);
    expect(withInfo.determinedTax).toBe(withoutInfo.determinedTax);
    expect(withInfo.totalPayable).toBe(withoutInfo.totalPayable);
  });

  it("taxpayerInfo 없을 때 result.taxpayer = undefined (판정 생략)", () => {
    const result = calculatePropertyTax(BASE_INPUT);
    expect(result.taxpayer).toBeUndefined();
    expect(result.coOwnershipDistribution).toBeUndefined();
  });
});

// ============================================================
// 주된 상속자 §107②2호 · 시행규칙 §53 — 지분 최대 → 동률 시 연장자
//   현재: heirs[0] 고정(객체 반환) → H-1·H-2 실패해야 정상 (Pre-Do)
// ============================================================

describe("주된 상속자 §53: 지분 최대 → 동률 시 연장자(이른 생년)", () => {
  const BASE = { isInheritanceUnregistered: true, registeredOwner: "공부상소유자" };

  it("H-1 지분 최대자 (A:0.5/B:0.3/C:0.2 → A)", () => {
    const r = determineTaxpayer({
      ...BASE,
      heirs: [
        { name: "A", shareRatio: 0.5 },
        { name: "B", shareRatio: 0.3 },
        { name: "C", shareRatio: 0.2 },
      ],
    } as Parameters<typeof determineTaxpayer>[0]);
    expect(r.type).toBe("heir_representative");
    expect(r.name).toBe("A");
  });

  it("H-2 동률이면 연장자 (A:0.4/1970, B:0.4/1965 → B)", () => {
    const r = determineTaxpayer({
      ...BASE,
      heirs: [
        { name: "A", shareRatio: 0.4, birthDate: "1970-03-15" },
        { name: "B", shareRatio: 0.4, birthDate: "1965-06-20" },
        { name: "C", shareRatio: 0.2 },
      ],
    } as Parameters<typeof determineTaxpayer>[0]);
    expect(r.name).toBe("B");
  });

  it("H-3 지분 미입력 → heirs[0] fallback + warning", () => {
    const r = determineTaxpayer({
      ...BASE,
      heirs: [{ name: "A" }, { name: "B" }],
    } as Parameters<typeof determineTaxpayer>[0]);
    expect(r.name).toBe("A");
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it("H-4 지분 일부만 입력 → fallback(heirs[0]) + warning", () => {
    const r = determineTaxpayer({
      ...BASE,
      heirs: [{ name: "A", shareRatio: 0.5 }, { name: "B" }],
    } as Parameters<typeof determineTaxpayer>[0]);
    expect(r.name).toBe("A");
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it("H-7 상속인 0명 → registeredOwner fallback (회귀)", () => {
    const r = determineTaxpayer({
      ...BASE,
      heirs: [],
    } as Parameters<typeof determineTaxpayer>[0]);
    expect(r.type).toBe("registered_owner");
  });
});
