/**
 * ⑤ 승계조합원 완공 APT — 「취득가액 산정 방식」 라디오가 없고 실거래가 취득가액 칸으로 고정된다
 * (계획서 `docs/02-design/features/redev-successor-bg-acq-method.plan.md` Q-2 a · ④⑧ `isRedevSuccessorAptActualOnly`와 같은 술어).
 *
 * 종전: 라디오 4종이 렌더되고, 남은 매매사례 플래그면 취득가액 칸 대신 매매사례가액 칸이 떴다(Playwright E-3) — 엔진은 그 값을 읽지 않았다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { CompanionAcquisitionCauseSection } from "@/components/calc/transfer/CompanionAcquisitionCauseSection";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(() => cleanup());

function view(over: Partial<AssetForm>) {
  const a = {
    ...makeDefaultAsset(1),
    acquisitionCause: "purchase",
    acquisitionDate: "2020-04-15",
    fixedAcquisitionPrice: "450000000",
    ...over,
  } as AssetForm;
  const { container } = render(
    <CompanionAcquisitionCauseSection asset={a} onChange={() => {}} transferDate="2023-02-16" isNewConstruction={false} />,
  );
  return {
    radios: container.querySelectorAll('input[type="radio"][name="acqBasisMode"]').length,
    fixed: container.querySelectorAll('[data-field="fixedAcquisitionPrice"]').length,
    similar: container.querySelectorAll('[data-field="similarSalesValue"]').length,
    note: container.querySelectorAll('[data-testid="successor-apt-actual-only-note"]').length,
  };
}

const SUCC = { assetKind: "redevelopment_apt", redevIsSuccessorMember: "yes" } as const;

describe("⑤ 승계 완공 APT — 실거래가 전용", () => {
  it.each([
    ["플래그 없음", {}],
    ["남은 감정가액", { isAppraisalAcquisition: true }],
    ["남은 매매사례가액", { isSalesCaseAcquisition: true, similarSalesValue: "500000000" }],
    ["남은 환산", { useEstimatedAcquisition: true }],
  ] as const)("%s → 라디오 0 · 취득가액 칸 1 · 매매사례가액 칸 0 · 안내 1", (_l, over) => {
    expect(view({ ...SUCC, ...over } as Partial<AssetForm>)).toEqual({ radios: 0, fixed: 1, similar: 0, note: 1 });
  });

  it("대조 — 일반 주택은 라디오가 있다", () => {
    expect(view({ assetKind: "housing" }).radios).toBeGreaterThan(0);
    expect(view({ assetKind: "housing" }).note).toBe(0);
  });
});
