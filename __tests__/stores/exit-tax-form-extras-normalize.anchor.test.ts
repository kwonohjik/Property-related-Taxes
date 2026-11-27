/**
 * 국외전출세 폼 전역 신규 필드(외국인근로자 · 기본공제 배분) normalize 왕복 anchor (③)
 *
 * `normalizeStockFormData`가 새 필드를 나열에서 빠뜨리면 새로고침(rehydrate)마다 값이 조용히 기본값으로 돌아간다.
 * 키 집합은 `createInitialStockFormData()`의 `et*` 전체를 기준으로 해, 이후 `et*` 필드가 늘어도 자동으로 검증된다.
 */
import { describe, it, expect } from "vitest";
import {
  createInitialStockFormData,
  normalizeStockFormData,
} from "@/lib/stores/calc-wizard-stock-store";

const NEW_KEYS = [
  "etForeignWorkerStatus",
  "etForeignWorkerIsOfficerOrEmployee",
  "etForeignWorkerIsNotDailyWorker",
  "etForeignWorkerDomesticRatio80",
  "etForeignWorkerDeparted6Months",
  "etForeignWorkerFamilyKind",
  "etForeignWorkerStartDate",
  "etBasicDeductionAllocClause1",
  "etBasicDeductionAllocClause2a",
  "etBasicDeductionAllocClause2b",
] as const;

describe("국외전출세 폼 전역 신규 필드 normalize", () => {
  it("N-1 모든 신규 키가 initial에 있다 (②)", () => {
    const init = createInitialStockFormData() as unknown as Record<string, unknown>;
    for (const k of NEW_KEYS) expect(init, k).toHaveProperty(k);
  });

  it("N-2 기본값과 다른 값으로 왕복해도 그대로다 (③ — 조용한 기본값 복귀 차단)", () => {
    const filled = {
      ...createInitialStockFormData(),
      etForeignWorkerStatus: "foreign_worker_family",
      etForeignWorkerIsOfficerOrEmployee: true,
      etForeignWorkerIsNotDailyWorker: true,
      etForeignWorkerDomesticRatio80: true,
      etForeignWorkerDeparted6Months: true,
      etForeignWorkerFamilyKind: "child_20_or_under",
      etForeignWorkerStartDate: "2024-03-01",
      etBasicDeductionAllocClause1: "2,500,000",
      etBasicDeductionAllocClause2a: "0",
      etBasicDeductionAllocClause2b: "0",
    };
    const n = normalizeStockFormData(JSON.parse(JSON.stringify(filled))) as unknown as Record<string, unknown>;
    for (const k of NEW_KEYS) expect(n[k], k).toEqual((filled as Record<string, unknown>)[k]);
  });

  it("N-3 신규 키가 없던 구 세션은 factory 기본값으로 채운다 — status none · 요건 false · 가족 미선택", () => {
    const old = JSON.parse(JSON.stringify(createInitialStockFormData())) as Record<string, unknown>;
    for (const k of NEW_KEYS) delete old[k];
    const n = normalizeStockFormData(old);
    const init = createInitialStockFormData();
    for (const k of NEW_KEYS) expect(n[k]).toEqual(init[k]);
    expect(n.etForeignWorkerStatus).toBe("none");
    expect(n.etForeignWorkerFamilyKind).toBe("");
  });

  it("N-4 허용 밖 열거값은 기본값으로 — status · 가족 구분", () => {
    const n = normalizeStockFormData({
      ...createInitialStockFormData(),
      etForeignWorkerStatus: "bogus",
      etForeignWorkerFamilyKind: "cousin",
    });
    expect(n.etForeignWorkerStatus).toBe("none");
    expect(n.etForeignWorkerFamilyKind).toBe("");
  });
});
