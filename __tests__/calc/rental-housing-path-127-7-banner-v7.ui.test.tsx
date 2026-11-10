/**
 * anchor — §127⑦ 택일 배너(⑤ 패널)에 거주주택 특례(소령 §155⑳) 경로 안내가 ⑧·⑫와 같은 술어·같은 문구로 붙는다 (V-7 Q-3 a).
 * 계획서 docs/00-pm/rental-97-v7-residence-path.plan.md. route 쪽 anchor: `__tests__/api/transfer.route.rental-housing-path-127-7-v7.anchor.test.ts`.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { UnifiedReductionPanel } from "@/components/calc/transfer/UnifiedReductionPanel";
import { makeDefaultAsset, makeDefaultRentalUnit } from "@/lib/stores/calc-wizard-asset-factory";
import { getReductionDefault } from "@/components/calc/transfer/UnifiedReductionPanel-defaults";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { AssetReductionForm } from "@/lib/stores/calc-wizard-asset-reduction";

afterEach(cleanup);

const NOTICE = "참고: 장기임대주택 거주주택 비과세 특례(소득세법 시행령 §155⑳)를 선언한 계산입니다.";

function asset(over: { reductions: string[]; declare?: boolean; kind?: AssetForm["assetKind"] }): AssetForm {
  const a = {
    ...makeDefaultAsset(1),
    assetKind: over.kind ?? "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2002-09-01",
    reductions: over.reductions.map((t) => getReductionDefault(t as never)) as unknown as AssetReductionForm[],
  } as AssetForm;
  if (over.declare !== false) {
    a.rentalHousingException = {
      ...a.rentalHousingException, applyException: true, scenario: "A",
      rentalUnits: [{ ...makeDefaultRentalUnit(), businessRegistrationDate: "2015-06-01", rentalRegistrationDate: "2015-06-01", rentalInputMode: "direct", rentalMonths: "120", requirementsConfirmed: true }],
    };
  }
  return a;
}
const text = () => document.body.textContent ?? "";

describe("⑤ §127⑦ 배너 — 거주주택 경로 안내", () => {
  it("선언이 실리는 첫 주택 자산 + §97의3 + §99의3 → 배너에 안내(testid)가 있다", () => {
    render(<UnifiedReductionPanel asset={asset({ reductions: ["rental_97_3", "new_99_3"] })} assetIndex={0} transferDate="2025-08-01" onChange={() => {}} />);
    expect(text()).toContain("조특법 §127⑦ — 두 감면은 택일입니다");
    const note = document.querySelector('[data-testid="track-127-7-rental-housing-notice"]');
    expect(note?.textContent).toContain(NOTICE);
    expect(note?.textContent).toContain("성립하지 않으면 일반 경로에서 반영됩니다");
  });
  it("assetIndex 생략은 첫 자산(0)으로 본다", () => {
    render(<UnifiedReductionPanel asset={asset({ reductions: ["rental_97_4", "public_expropriation"] })} transferDate="2025-08-01" onChange={() => {}} />);
    expect(document.querySelector('[data-testid="track-127-7-rental-housing-notice"]')).not.toBeNull();
  });
  it("컴패니언 카드(assetIndex 1) — ④가 선언을 싣지 않으므로 안내 없음", () => {
    render(<UnifiedReductionPanel asset={asset({ reductions: ["rental_97_3", "new_99_3"] })} assetIndex={1} transferDate="2025-08-01" onChange={() => {}} />);
    expect(text()).toContain("조특법 §127⑦ — 두 감면은 택일입니다");
    expect(document.querySelector('[data-testid="track-127-7-rental-housing-notice"]')).toBeNull();
  });
  it("선언을 끄면 안내 없음 — 배너는 그대로", () => {
    render(<UnifiedReductionPanel asset={asset({ reductions: ["rental_97_3", "new_99_3"], declare: false })} assetIndex={0} transferDate="2025-08-01" onChange={() => {}} />);
    expect(text()).toContain("조특법 §127⑦ — 두 감면은 택일입니다");
    expect(document.querySelector('[data-testid="track-127-7-rental-housing-notice"]')).toBeNull();
  });
  it("충돌 쌍에 §97의3/4가 없으면(§99의3 + 수용) 안내 없음", () => {
    render(<UnifiedReductionPanel asset={asset({ reductions: ["new_99_3", "public_expropriation"] })} assetIndex={0} transferDate="2025-08-01" onChange={() => {}} />);
    expect(text()).toContain("조특법 §127⑦ — 두 감면은 택일입니다");
    expect(document.querySelector('[data-testid="track-127-7-rental-housing-notice"]')).toBeNull();
  });
});
