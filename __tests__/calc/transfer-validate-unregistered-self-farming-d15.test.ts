// D15 · Q-1 — 미등기 + 자경농지 감면(조특법 §69) 동시 입력 차단 (validate ⑧).
// 자경농지 감면 대상 토지는 미등기양도자산이 아니다(소득세법 시행령 §168①3호) — 모순 입력.
// 미등기 축은 ④와 같다: 주 자산은 폼-전역 `form.isUnregistered`, 컴패니언은 자산 값.
import { describe, it, expect } from "vitest";
import { validateStep } from "@/lib/calc/transfer-tax-validate";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetReductionForm } from "@/lib/stores/calc-wizard-asset-reduction";

const SF = { type: "self_farming", farmingYears: "10" } as AssetReductionForm;
const EXPROPRIATION = {
  type: "public_expropriation",
  expropriationCash: "600,000,000",
  expropriationBond: "0",
  expropriationApprovalDate: "2013-01-01",
} as AssetReductionForm;
const msg = "§168①3호";

function form(opts: { formUnregistered?: boolean; companionUnregistered?: boolean; onCompanion?: boolean; reduction?: AssetReductionForm }) {
  const f = createDefaultTransferFormData();
  f.transferDate = "2024-06-01";
  f.isUnregistered = opts.formUnregistered ?? false;
  const reduction = opts.reduction ?? SF;
  f.assets[0] = {
    ...f.assets[0],
    assetKind: "land",
    acquisitionDate: "2010-01-01",
    reductions: opts.onCompanion ? [] : [reduction],
  };
  if (opts.onCompanion) {
    f.assets[1] = {
      ...f.assets[0],
      assetId: "c1",
      isUnregistered: opts.companionUnregistered ?? false,
      reductions: [reduction],
    };
  }
  return f;
}

describe("D15 · Q-1 validate — 미등기 + 자경농지 감면", () => {
  it("V-1 주 자산: 폼-전역 미등기 + self_farming → 차단 / 등기면 통과(긍정 짝)", () => {
    expect(validateStep(2, form({ formUnregistered: true }))).toContain(msg);
    expect(validateStep(2, form({ formUnregistered: false })) ?? "").not.toContain(msg);
  });

  it("V-2 컴패니언: 자산 미등기 + self_farming → 차단 / 폼-전역 미등기만으로는 컴패니언을 막지 않는다", () => {
    expect(validateStep(2, form({ onCompanion: true, companionUnregistered: true }))).toContain(msg);
    expect(validateStep(2, form({ onCompanion: true, companionUnregistered: false, formUnregistered: true })) ?? "").not.toContain(msg);
  });

  it("V-3 미등기라도 자경농지가 아니면 이 차단은 없다 — 감면은 엔진이 §129②로 0 처리한다", () => {
    expect(validateStep(2, form({ formUnregistered: true, reduction: EXPROPRIATION })) ?? "").not.toContain(msg);
  });
});
