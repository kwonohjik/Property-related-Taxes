/**
 * anchor U-1 / U-2 — 미등기양도자산(「소득세법」 §104③) 자산 종류별 엔진 도달 검증.
 *
 * 계획서: docs/02-design/features/transfer-unregistered-asset-kind-coverage.plan.md §6
 *
 * §104③은 미등기양도자산을 「제94조제1항제1호 및 제2호에서 규정하는 자산」으로 정의한다 —
 * 1호가 토지·건물이므로 **자산 종류를 가리지 않는다**. UI는 종전에 주택·토지·건물 3종만
 * 토글을 띄웠고(`Step4.tsx`), 그 게이트를 열기 전에 각 종류가 엔진에서 실제로 처리되는지
 * 확인하는 것이 이 anchor의 목적이다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";

const rates = makeMockRates();

/**
 * 재개발/재건축 APT — 관리처분인가 전후 3분할(시행령 §166).
 *
 * ⚠️ **비과세 미해당 조건을 명시적으로 고정한다.** 재개발 APT는 주택이므로 1세대1주택 요건을
 *    충족하는 픽스처를 쓰면 비과세로 세액이 0이 되어 아래 단언이 전부 무의미해진다
 *    (§91① 배선 전에는 미등기여도 0이 나왔다 — `unregistered-91-1-exemption-bar.anchor.test.ts`).
 */
function redevApt(overrides: Partial<TransferTaxInput> = {}): TransferTaxInput {
  return baseTransferInput({
    propertyType: "redevelopment_apt",
    transferPrice: 1_200_000_000,
    transferDate: new Date("2024-06-01"),
    acquisitionDate: new Date("2014-06-01"),
    acquisitionPrice: 600_000_000,
    // 비과세 미해당 — 다주택
    isOneHousehold: false,
    householdHousingCount: 2,
    residencePeriodMonths: 0,
    ...overrides,
  } as Partial<TransferTaxInput>);
}

describe("anchor U-1 — 재개발/재건축 APT × 미등기", () => {
  it("대조군: 등기 → 누진세율 · 장특공제 적용", () => {
    const r = calculateTransferTax(redevApt({ isUnregistered: false }), rates);
    expect(r.appliedRate).not.toBe(0.7);
    expect(r.longTermHoldingDeduction).toBeGreaterThan(0);
  });

  it("U-1: 미등기 → 70% 단일세율 · 장특공제 0 · 기본공제 0", () => {
    const r = calculateTransferTax(redevApt({ isUnregistered: true }), rates);
    expect(r.appliedRate).toBe(0.7);
    expect(r.longTermHoldingDeduction).toBe(0);
    expect(r.lthdExclusionReason).toBe("unregistered");
    expect(r.basicDeduction).toBe(0);
  });

  it("U-1b: 미등기 세액 > 등기 세액 (중과가 실제로 반영된다)", () => {
    const unreg = calculateTransferTax(redevApt({ isUnregistered: true }), rates);
    const reg = calculateTransferTax(redevApt({ isUnregistered: false }), rates);
    expect(unreg.totalTax).toBeGreaterThan(reg.totalTax);
  });
});

/**
 * U-2 — 일반건물(토지+건물 일괄)은 **bundled 경로**라 단건 엔진을 타지 않는다.
 *
 * 🔴 현행 갭: `app/api/calc/transfer/general-building-route-cards.ts`가 카드→엔진 매핑에서
 *    `isUnregistered: false`를 **하드코딩**한다. 그래서 폼에서 미등기를 켜도 엔진에 도달하지
 *    않는다(세액 변화 0의 no-op). 배관이 없는 채로 UI만 열면 사용자가 켠 토글이 조용히
 *    무시되므로, `Step4.tsx`의 `UNREGISTERED_EXCLUDED_KINDS`가 일반건물을 **한시 제외**한다.
 *
 * 아래는 그 하드코딩을 **현행 동작으로 고정**해 두는 회귀 감지선이다. Phase C에서 배선하면
 * 이 테스트가 깨지고, 그때 기대값을 뒤집으면서 UI 한시 제외도 함께 푼다.
 * (Phase C는 §104⑤ 그룹핑 정합 검토(Q3) 선행 — 계획서 §7)
 */
describe("anchor U-2 — 일반건물 bundled 경로 미등기 미배선 (Phase C 대기)", () => {
  it("route 카드 매핑이 isUnregistered를 false로 고정하고 있다", async () => {
    const src = await import("node:fs/promises").then((fs) =>
      fs.readFile("app/api/calc/transfer/general-building-route-cards.ts", "utf-8"),
    );
    // Phase C에서 payload 값을 전달하도록 바꾸면 이 단언이 깨진다 — 그때 UI 한시 제외도 해제한다.
    expect(src).toContain("isUnregistered: false");
  });
});
