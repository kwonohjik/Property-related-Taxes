/**
 * 과세 무상주(의제배당 과세분) — 취득가액은 액면가액만 (실가 모드만 허용)
 *
 *   BT-1  ⑧ 환산취득가·매매사례가액이면 차단 / 실가는 통과
 *   BT-2  ③ 저장 이력(과세 무상주 + 추계 모드) 복원 → 실가로 되돌린다 (라디오가 막혀 벗어날 수 없으므로)
 *   BT-3  형제 원인(매매·유상증자)의 추계 모드는 그대로 허용·보존된다 (과잉 차단 없음)
 */

import { describe, it, expect } from "vitest";
import { validateStep2 } from "@/lib/calc/stock-transfer-tax-validate";
import { normalizeStockFormData } from "@/lib/stores/calc-wizard-stock-normalize";
import { createInitialStockFormData } from "@/lib/stores/calc-wizard-stock-store";
import { BONUS_TAXED_ACTUAL_ONLY_MESSAGE } from "@/lib/calc/stock-acquisition-cause";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-form";

function form(o: Partial<StockTransferFormData> = {}): StockTransferFormData {
  return {
    ...createInitialStockFormData(),
    securityName: "테스트",
    marketType: "unlisted",
    acquisitionDate: "2025-03-01",
    transferDate: "2026-05-10",
    shareCount: "1000",
    transferActualInputMode: "total",
    transferTotalPrice: "200000000",
    acquisitionActualInputMode: "per_share",
    perShareAcquisitionPrice: "500",
    acquisitionCause: "bonus_taxed",
    ...o,
  } as StockTransferFormData;
}

const blocked = (f: StockTransferFormData) =>
  validateStep2(f).some((e) => e.severity === "error" && e.message === BONUS_TAXED_ACTUAL_ONLY_MESSAGE);

describe("BT-1 ⑧", () => {
  it.each(["estimated", "sale_case"] as const)("과세 무상주 + %s → 차단", (mode) => {
    expect(blocked(form({ acquisitionMode: mode }))).toBe(true);
  });
  it("과세 무상주 + 실가 → 통과", () => {
    expect(blocked(form({ acquisitionMode: "actual" }))).toBe(false);
  });
});

describe("BT-2 ③ 복원", () => {
  it.each(["estimated", "sale_case"] as const)("과세 무상주 + %s 저장분 → 실가", (mode) => {
    const restored = normalizeStockFormData(JSON.parse(JSON.stringify(form({ acquisitionMode: mode }))));
    expect(restored.acquisitionMode).toBe("actual");
  });
});

describe("BT-3 형제 원인은 그대로", () => {
  it.each(["purchase", "rights_issue"] as const)("%s + 환산 → 이 차단 없음 · 복원 보존", (cause) => {
    const f = form({ acquisitionCause: cause, acquisitionMode: "estimated" });
    expect(blocked(f)).toBe(false);
    expect(normalizeStockFormData(JSON.parse(JSON.stringify(f))).acquisitionMode).toBe("estimated");
  });
});
