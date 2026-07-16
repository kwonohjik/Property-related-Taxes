/**
 * @vitest-environment jsdom
 *
 * Pre-Do anchor — "기타(other)" 수증자 isHeir 분류 수정 (옵션 A)
 * Plan/Design: docs/02-design/features/prior-gift-donee-classification-fix.*
 *
 *  A-1: derive 데이터 모델 (green 증거 — 엔진/derive는 이미 정답, 갭은 UI 입력 경로뿐)
 *  A-2~A-4: changeHeirRelation isHeir 전이 (현재 미구현 → red, 구현 후 green)
 */
import { describe, it, expect } from "vitest";
import {
  deriveIsHeirFromHeir,
  deriveBeneficiaryTypeFromHeir,
} from "@/lib/calc/prior-gift-donee-derive";
import { changeHeirRelation } from "@/components/calc/HeirEditor";
import { calcInheritanceDeductions } from "@/lib/tax-engine/deductions/inheritance-deductions";
import type { Heir } from "@/lib/tax-engine/types/inheritance-gift.types";

describe("Pre-Do A-1: derive 데이터 모델 (green 증거)", () => {
  it("기타 + isHeir=false → 비상속인(legatee) 5년", () => {
    const h: Heir = { id: "h1", relation: "other", isHeir: false };
    expect(deriveIsHeirFromHeir(h)).toBe(false);
    expect(deriveBeneficiaryTypeFromHeir(h)).toBe("legatee");
  });
  it("기타 + isHeir 미설정 → 상속인(heir) 10년 추론 (4순위 방계·대습)", () => {
    const h: Heir = { id: "h2", relation: "other" };
    expect(deriveIsHeirFromHeir(h)).toBe(true);
    expect(deriveBeneficiaryTypeFromHeir(h)).toBe("heir");
  });
  it("기타 + isHeir=true → 상속인 10년", () => {
    const h: Heir = { id: "h3", relation: "other", isHeir: true };
    expect(deriveBeneficiaryTypeFromHeir(h)).toBe("heir");
  });
});

describe("Pre-Do A-2~A-4: changeHeirRelation isHeir 전이 (현재 red — 미구현)", () => {
  it("A-2 자녀 → 기타: isHeir=false (기본 비상속인) [T-3]", () => {
    const child: Heir = { id: "c", relation: "child" };
    expect(changeHeirRelation(child, "other").isHeir).toBe(false);
  });
  it("A-3 기타(false) → 자녀: isHeir=undefined (추론 복원, 자녀=상속인) [T-4 Critical]", () => {
    const other: Heir = { id: "o", relation: "other", isHeir: false };
    expect(changeHeirRelation(other, "child").isHeir).toBeUndefined();
  });
  it("A-4 기타(true) → 수유자: isHeir=undefined (추론 복원, legatee=비상속인) [T-5]", () => {
    const other: Heir = { id: "o2", relation: "other", isHeir: true };
    expect(changeHeirRelation(other, "legatee").isHeir).toBeUndefined();
  });
});

describe("A-8: §21② 배우자단독 판정 — 비상속인 '기타'(isHeir=false) 제외 (numeric)", () => {
  const TAXABLE = 1_000_000_000;
  it("배우자 + 기타(isHeir=false 며느리) → 배우자단독 → 일괄공제 배제(itemized)", () => {
    const r = calcInheritanceDeductions(
      {
        heirs: [
          { id: "s", relation: "spouse" },
          { id: "o", relation: "other", isHeir: false },
        ],
        deathDate: "2024-06-10",
      },
      TAXABLE,
      0,
    );
    expect(r.lumpSumComparisonDetail?.spouseSoleHeirExclusion).toBe(true);
    expect(r.lumpSumComparisonDetail?.selectedMethod).toBe("itemized");
  });
  it("배우자 + 기타(isHeir 미설정 4순위 방계) → 배우자단독 아님 (회귀 0 — 추론 상속인)", () => {
    const r = calcInheritanceDeductions(
      {
        heirs: [
          { id: "s", relation: "spouse" },
          { id: "o", relation: "other" },
        ],
        deathDate: "2024-06-10",
      },
      TAXABLE,
      0,
    );
    expect(r.lumpSumComparisonDetail?.spouseSoleHeirExclusion).toBe(false);
  });

  it("C-1: 배우자 + 대습상속인 며느리(substituteGroupId + isHeir:false) → 배우자단독 아님 → 일괄공제 유지", () => {
    const r = calcInheritanceDeductions(
      {
        heirs: [
          { id: "s", relation: "spouse" },
          { id: "o", relation: "other", isHeir: false, substituteGroupId: "g1" },
        ],
        deathDate: "2024-06-10",
      },
      TAXABLE,
      0,
    );
    // 대습상속인은 상속인 → 배우자 단독 아님 → §21② 배제 미적용 (일괄공제 후보 유지)
    // 수정 전: isHeir:false 잔재로 realHeirs 탈락 → 배우자 단독 오판 → spouseSoleHeirExclusion=true
    expect(r.lumpSumComparisonDetail?.spouseSoleHeirExclusion).toBe(false);
  });
});
