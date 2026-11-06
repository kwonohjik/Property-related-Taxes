/**
 * 승계조합원 완공 APT — 「취득 당시 기준시가」 §164⑦ 계산 도우미 (계획서 `docs/02-design/features/redev-successor-apt-phd-assist.plan.md` Q-1~3 a).
 *
 * - 사본 leaf `successorAptPhdAssistView` — 매매 승계만 · 취득일 = 사용승인일 · 공동주택 · 추계 플래그 끔.
 * - V-1 — 최초 고시일이 입주권 취득일과 사용승인일 사이면 사용승인일 당시 가격이 이미 있다 → 사본은 계산을 거부한다(원래 자산으로 읽으면 계산했다).
 * - ⑤ 렌더 — 감정가액·매매사례가액·환산 모두 도우미 1 · 면적 칸 · 주택 유형 라디오 없음 / 부담부증여 0 / 일반 주택은 종전(면적 칸 없음).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { CompanionAcquisitionCauseSection } from "@/components/calc/transfer/CompanionAcquisitionCauseSection";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { successorAptPhdAssistView } from "@/lib/calc/redev-successor-phd-assist";
import { computeConvertedHousingPrice } from "@/lib/calc/phd-converted-housing-price";

afterEach(() => cleanup());

const PHD = {
  acquisitionArea: "40", phdFirstDisclosureDate: "2023-04-28", phdFirstDisclosureHousingPrice: "320000000",
  phdLandPricePerSqmAtAcq: "5000000", phdBuildingStdPriceAtAcq: "100000000", phdLandPricePerSqmAtFirst: "5200000", phdBuildingStdPriceAtFirst: "98000000",
};
const succ = (over: Partial<AssetForm> = {}) =>
  ({
    ...makeDefaultAsset(1), assetKind: "redevelopment_apt", redevIsSuccessorMember: "yes", acquisitionCause: "purchase",
    acquisitionDate: "2020-04-15", redevCompletionDate: "2022-12-02", fixedAcquisitionPrice: "450000000", standardPriceAtTransfer: "600000000",
    ...PHD, ...over,
  }) as AssetForm;

describe("사본 leaf", () => {
  it("L-1 매매 승계 → 취득일 = 준공일 · housing · 공동주택 · 추계 플래그 끔", () => {
    const v = successorAptPhdAssistView(succ({ isAppraisalAcquisition: true, useEstimatedAcquisition: true }))!;
    expect(v).toMatchObject({ assetKind: "housing", acquisitionDate: "2022-12-02", phdHousingType: "apartment", useEstimatedAcquisition: false, isAppraisalAcquisition: false, isSalesCaseAcquisition: false });
    expect(v.acquisitionArea).toBe("40");
  });
  it.each([
    ["증여 승계", { acquisitionCause: "gift" }],
    ["부담부증여", { transferType: "burdened_gift" }],
    ["준공일 비움", { redevCompletionDate: "" }],
    ["원조합원", { redevIsSuccessorMember: "no" }],
    ["일반 주택", { assetKind: "housing" }],
  ] as const)("L-2 %s → 사본 없음", (_l, over) => {
    expect(successorAptPhdAssistView(succ(over as Partial<AssetForm>))).toBeUndefined();
  });
  it("L-3 계산값 313,725,490 = ⌊320,000,000 × 300,000,000 / 306,000,000⌋", () => {
    const r = computeConvertedHousingPrice(successorAptPhdAssistView(succ())!, "2023-02-16");
    expect(r).toMatchObject({ ok: true, value: 313_725_490, sumAtAcquisition: 300_000_000, sumAtFirstDisclosure: 306_000_000 });
  });
  it("L-4 (V-1) 최초 고시일 2021-04-29(입주권 취득일과 준공일 사이) → 사본은 거부(not_eligible) · 원래 자산으로 읽으면 계산했다", () => {
    const a = succ({ phdFirstDisclosureDate: "2021-04-29" });
    expect(computeConvertedHousingPrice(successorAptPhdAssistView(a)!, "2023-02-16")).toMatchObject({ ok: false, blocked: "not_eligible" });
    expect(computeConvertedHousingPrice(a, "2023-02-16").ok).toBe(true);
  });
});

function view(over: Partial<AssetForm>) {
  const { container } = render(
    <CompanionAcquisitionCauseSection asset={succ(over)} onChange={() => {}} transferDate="2023-02-16" isNewConstruction={false} />,
  );
  const assist = container.querySelectorAll('[data-testid="phd-fill-assist"]');
  return {
    assist: assist.length,
    area: assist[0] ? assist[0].querySelectorAll('[data-field="acquisitionArea"]').length : 0,
    radio: assist[0] ? assist[0].querySelectorAll('input[type="radio"][name^="housingType-"]').length : 0,
    note: assist[0] ? assist[0].querySelectorAll('[data-testid="phd-fill-successor-note"]').length : 0,
  };
}

describe("⑤ 렌더", () => {
  it.each([
    ["감정가액", { isAppraisalAcquisition: true }],
    ["매매사례가액", { isSalesCaseAcquisition: true, similarSalesValue: "500000000" }],
    ["환산", { useEstimatedAcquisition: true }],
  ] as const)("R-1 매매 승계 · %s → 도우미 1 · 면적 칸 1 · 주택 유형 라디오 0 · 사용승인일 안내 1", (_l, over) => {
    expect(view(over as Partial<AssetForm>)).toEqual({ assist: 1, area: 1, radio: 0, note: 1 });
  });
  it("R-2 부담부증여 매매 승계 → 도우미 0(취득가액 영역이 없다)", () => {
    expect(view({ transferType: "burdened_gift", isAppraisalAcquisition: true } as Partial<AssetForm>).assist).toBe(0);
  });
  it("R-3 대조 — 일반 주택 감정가액은 종전 도우미(면적 칸 0 · 라디오 있음 · 승계 안내 0)", () => {
    expect(view({ assetKind: "housing", redevIsSuccessorMember: "", isAppraisalAcquisition: true, acquisitionDate: "2003-05-01", standardPriceAtAcq: "1" } as Partial<AssetForm>)).toEqual({ assist: 1, area: 0, radio: 2, note: 0 });
  });
});
