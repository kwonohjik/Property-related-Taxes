/**
 * Pre-Do anchor — 증여세 부표1(별지10호 부표1) 계 영역 산식 (PR-B2)
 * 설계: docs/02-design/features/selective-print-6tax.ui.design.md §4
 *
 * ⚠️ 구현 전 작성 — `lib/calc/gift-valuation-besshi.ts` 미존재 시 RED(import 실패).
 *    computeRow10/computeRow14는 화면(GiftTaxValuationFormTable)·PDF(GiftValuationFormPdfDocument)
 *    단일 출처. 산식은 화면 컴포넌트 내부에서 추출(동작 동일 → 화면 RTL anchor 회귀 0).
 */
import { describe, it, expect } from "vitest";
import {
  computeRow10,
  computeRow14,
  PROPERTY_TYPE_LABEL,
} from "@/lib/calc/gift-valuation-besshi";

describe("증여세 부표1 계 영역 산식 — Pre-Do anchor (PR-B2)", () => {
  // ⑩ = max(0, 비과세 − ⑪ − ⑫ − ⑬)
  it("computeRow10: 비과세 − 불산입(⑪⑫⑬), 음수 가드", () => {
    expect(computeRow10(1_000_000, 200_000, 300_000, 100_000)).toBe(400_000);
    expect(computeRow10(700_000, 0, 0, 0)).toBe(700_000);
    // 음수 가드 (불산입 합이 비과세 초과)
    expect(computeRow10(500_000, 200_000, 300_000, 100_000)).toBe(0);
  });

  // ⑭ = max(0, ⑮합계 − max(0, ⑨−⑩비과세))  (사전증여 가산분 역산)
  it("computeRow14: 합산 − max(0, 증여재산 − 비과세), 음수 가드", () => {
    // gross-exempt = 8e8, aggregated 1.5e9 → 가산 7e8
    expect(computeRow14(1_500_000_000, 1_000_000_000, 200_000_000)).toBe(700_000_000);
    // 가산 없음 (aggregated == gross-exempt)
    expect(computeRow14(800_000_000, 1_000_000_000, 200_000_000)).toBe(0);
    // 비과세>증여재산: 분모 0 → 전액이 가산분
    expect(computeRow14(500_000_000, 200_000_000, 300_000_000)).toBe(500_000_000);
  });

  // ② 재산종류코드 라벨 (KoreanLaw 검증 14종) — 단일 출처 sanity
  it("PROPERTY_TYPE_LABEL: 14종 코드 라벨", () => {
    expect(PROPERTY_TYPE_LABEL["01"]).toBe("현금");
    expect(PROPERTY_TYPE_LABEL["09"]).toBe("상장주식");
    expect(PROPERTY_TYPE_LABEL["10"]).toBe("비상장주식");
    expect(Object.keys(PROPERTY_TYPE_LABEL)).toHaveLength(14);
  });
});
