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
import { getDefaultPriceYear } from "@/lib/hooks/useStandardPriceLookup";

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
    estimateNote: container.querySelectorAll('[data-testid="successor-apt-estimate-note"]').length,
  };
}

const SUCC = { assetKind: "redevelopment_apt", redevIsSuccessorMember: "yes" } as const;

/**
 * 2026-11-06 반전(계획서 `redev-successor-apt-estimate.plan.md` Q-1 a): **매매** 승계는 라디오 4종 · 사용승인일 안내가 보이고 고른 칸이 뜬다.
 * 「라디오 없음 · 실거래가 칸 고정」은 부담부증여 매매 승계에 남는다 — 상단 취득가액 영역 자체가 없어(§159) 남은 플래그로 추계 칸이 뜨지 않는다.
 */
describe("⑤ 승계 완공 APT — 매매는 추계 3종 · 부담부증여는 추계 칸 없음", () => {
  it.each([
    ["플래그 없음", {}, { fixed: 1, similar: 0 }],
    ["감정가액", { isAppraisalAcquisition: true }, { fixed: 1, similar: 0 }],
    ["매매사례가액", { isSalesCaseAcquisition: true, similarSalesValue: "500000000" }, { fixed: 0, similar: 1 }],
    ["환산", { useEstimatedAcquisition: true }, { fixed: 0, similar: 0 }],
  ] as const)("매매 · %s → 라디오 4 · 사용승인일 안내 1 · 고른 방식의 칸", (_l, over, cells) => {
    const v = view({ ...SUCC, ...over } as Partial<AssetForm>);
    expect({ radios: v.radios, estimateNote: v.estimateNote, fixed: v.fixed, similar: v.similar }).toEqual({ radios: 4, estimateNote: 1, ...cells });
  });

  it.each([
    ["남은 감정가액", { isAppraisalAcquisition: true }],
    ["남은 매매사례가액", { isSalesCaseAcquisition: true, similarSalesValue: "500000000" }],
    ["남은 환산", { useEstimatedAcquisition: true }],
  ] as const)("부담부증여 매매 · %s → 라디오 0 · 매매사례가액 칸 0 · 사용승인일 안내 0", (_l, over) => {
    const v = view({ ...SUCC, transferType: "burdened_gift", ...over } as Partial<AssetForm>);
    expect({ radios: v.radios, similar: v.similar, estimateNote: v.estimateNote }).toEqual({ radios: 0, similar: 0, estimateNote: 0 });
  });

  it("대조 — 일반 주택은 라디오가 있고 승계 안내는 없다", () => {
    expect(view({ assetKind: "housing" }).radios).toBeGreaterThan(0);
    expect(view({ assetKind: "housing" }).note).toBe(0);
    expect(view({ assetKind: "housing" }).estimateNote).toBe(0);
  });
});

/**
 * 매매 승계 환산 — 「취득시 기준시가」는 공동주택가격(총액) 칸이고(㎡당 단가 × 면적 위젯이 아니다), 공시가격 조회 기준일은 입주권 취득일이 아니라
 * 사용승인일(준공일)이다(소득세법 시행령 §162①4호 · 계획서 redev-successor-apt-estimate Playwright 실측).
 */
describe("⑤ 매매 승계 환산 — 취득시 기준시가 칸", () => {
  function stdView(over: Partial<AssetForm>) {
    const a = { ...makeDefaultAsset(1), acquisitionCause: "purchase", acquisitionDate: "2016-04-15", ...SUCC, redevCompletionDate: "2022-12-02", useEstimatedAcquisition: true, ...over } as AssetForm;
    const { container } = render(<CompanionAcquisitionCauseSection asset={a} onChange={() => {}} transferDate="2023-02-16" isNewConstruction={false} />);
    const acqWrap = container.querySelector('[data-field="standardPriceAtAcq"]')?.closest("div.space-y-2, div") as HTMLElement | null;
    const selects = Array.from(container.querySelectorAll("select")) as HTMLSelectElement[];
    return { area: container.querySelectorAll('[data-field="acquisitionArea"]').length, firstYear: selects[0]?.value, acqWrap: !!acqWrap };
  }
  it("면적 칸 0(공동주택가격 총액) · 첫 조회 연도 = 준공일 기준 기본 연도(입주권 취득일 2016이 아니다)", () => {
    const v = stdView({});
    expect(v.area).toBe(0);
    expect(v.firstYear).toBe(getDefaultPriceYear("2022-12-02", "housing"));
    expect(v.firstYear).not.toBe(getDefaultPriceYear("2016-04-15", "housing"));
  });
});
