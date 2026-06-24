/**
 * 주택 재산세 분납 — 본세 + 부가세 총액 분할 (지방세법 §115①3호) 버그 회귀.
 *
 * 버그: calcInstallment가 본세(determinedTax)만 1/2 분할 → 도시지역분·지역자원시설세·지방교육세 누락.
 * 수정: 주택은 §115①3호(본세) + 도시지역분(§112)·지역자원시설세(§147)·지방교육세(§152) 동일 납기로
 *   함께 분할 고지 → 각 기분 실납부액 = 총 납부세액 ÷ 2. 비주택(§118)은 본세 기준 유지.
 * 실측 화면: 본세 266,072 + 부가세 365,464 = 631,536 → 1차/2차 각 315,768.
 */

import { describe, it, expect } from "vitest";
import { calcInstallment } from "../../../lib/tax-engine/property-tax-surtax";

describe("주택 분납 총액 분할 (§115①3호 버그 수정)", () => {
  it("주택: 본세 266,072 + 부가세 365,464 = 631,536 → 1차/2차 315,768", () => {
    const r = calcInstallment(266_072, "housing", 365_464);
    expect(r.eligible).toBe(true);
    expect(r.firstPayment).toBe(315_768);
    expect(r.secondPayment).toBe(315_768);
    expect(r.firstPayment + r.secondPayment).toBe(631_536);
  });

  it("주택 20만원 이하: 전액 7월 (부가세 포함 총액)", () => {
    const r = calcInstallment(150_000, "housing", 30_000);
    expect(r.eligible).toBe(false);
    expect(r.firstPayment).toBe(180_000);
    expect(r.secondPayment).toBe(0);
  });

  it("비주택(건축물): 본세만 분할 — totalSurtax 무관(§118)", () => {
    const r = calcInstallment(3_000_000, "building", 500_000);
    expect(r.eligible).toBe(true);
    expect(r.firstPayment).toBe(1_500_000);
    expect(r.secondPayment).toBe(1_500_000);
  });

  it("totalSurtax 미전달(기본 0) — 하위호환: 본세만 분할", () => {
    const r = calcInstallment(266_072, "housing");
    expect(r.firstPayment + r.secondPayment).toBe(266_072);
  });
});
