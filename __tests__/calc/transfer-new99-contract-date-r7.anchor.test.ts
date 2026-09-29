/**
 * R7 — 조특법 §99 1호(주택건설사업자로부터 취득) 매매계약일 ⑧ (2026-09-30 Zod↔엔진 필수 점검).
 *
 * §99①2호는 「신축주택취득기간 중에 … 최초로 매매계약을 체결하고 계약금을 납부한 자」로 적용을 가른다.
 * 계약일과 자산-수준 매매계약일이 모두 비면 엔진이 **취득일**로 대신 읽어(`new-99.ts`) 기간 판정이
 * 바뀌었다 — 화면에서 ⑧을 통과해 200 + 감면 적용(82,554,444 · 계약일 1998-03-01이면 113,060,000).
 * 형제 §99의3(:199)과 같은 자산-수준 fallback 규약이다. ⑫ 거울은 `transfer-tax-schema-reduction-refines.ts`.
 */
import { describe, it, expect } from "vitest";
import { validateStep2Reductions } from "@/lib/calc/transfer-tax-validate-reductions";
import { getReductionDefault } from "@/components/calc/transfer/UnifiedReductionPanel-defaults";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-store";
import type { AssetReductionForm, TransferFormData } from "@/lib/stores/calc-wizard-store";

function check(reductionOver: Record<string, unknown>, assetOver: Record<string, unknown> = {}) {
  const r = {
    ...getReductionDefault("new_99"),
    standardPriceAtAcquisition99: "150,000,000",
    standardPriceAt5Years99: "250,000,000",
    standardPriceAtTransfer99: "600,000,000",
    exclusiveAreaSqm99: "84",
    ...reductionOver,
  } as AssetReductionForm;
  const asset = {
    ...makeDefaultAsset(1),
    assetKind: "housing",
    acquisitionDate: "1998-07-01",
    assetContractDate: "",
    reductions: [r],
    ...assetOver,
  };
  return validateStep2Reductions(2, { assets: [asset], transferDate: "2024-03-01" } as unknown as TransferFormData);
}

const MSG = /§99 적용: 매매계약일/;

describe("R7 §99 1호 매매계약일 — ⑧", () => {
  it("🔴 계약일·자산 매매계약일 모두 비면 차단", () => {
    expect(check({ contractDate99: "" })?.message).toMatch(MSG);
  });
  it("🟢 감면 계약일이 있으면 통과", () => {
    expect(check({ contractDate99: "1998-03-01" })?.message ?? "").not.toMatch(MSG);
  });
  it("🟢 자산-수준 매매계약일로 대신할 수 있다 (라벨 「비우면 자산 매매계약일 사용」)", () => {
    expect(check({ contractDate99: "" }, { assetContractDate: "1998-03-01" })?.message ?? "").not.toMatch(MSG);
  });
  it("🟢 자기건설(2호)은 계약일이 아니라 사용승인일을 본다", () => {
    expect(
      check({ contractDate99: "", acquisitionType99: "self_built", usageApprovalDate99: "1998-08-01" })?.message ?? "",
    ).not.toMatch(MSG);
  });
});
