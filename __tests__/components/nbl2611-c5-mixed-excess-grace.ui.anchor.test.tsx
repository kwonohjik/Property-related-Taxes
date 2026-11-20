/**
 * @vitest-environment jsdom
 *
 * anchor(⑤⑦) — 겸용주택 배율 초과분 유예·수용 안내 노출 게이트와 결과 문구 (NBL2611-C5).
 * 노출 술어는 ④ 전송·⑧ 검증과 같은 `housingExcessGraceApplies` — 겸용은 겸용 면적(주택분·OH-17 두 기준)으로 판정한다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { AssetAreaSection } from "@/components/calc/transfer/asset-sections/AssetAreaSection";
import { MixedUseNblSection } from "@/components/calc/results/mixed-use/MixedUseNblSection";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import type { MixedUseNonBusinessLandPart } from "@/lib/tax-engine/types/transfer-mixed-use.types";

afterEach(cleanup);

const mixed = (over: Partial<AssetForm> = {}): AssetForm =>
  ({
    ...makeDefaultAsset(1),
    assetKind: "housing",
    isMixedUseHouse: true,
    acquisitionCause: "purchase",
    acquisitionDate: "2015-06-01",
    residentialFloorArea: "150",
    nonResidentialFloorArea: "100",
    buildingFootprintArea: "100",
    mixedUseTotalLandArea: "400",
    mixedZoneType: "general_residential",
    mixedIsMetropolitanArea: true,
    ...over,
  }) as AssetForm;
const view = (a: AssetForm) => render(<AssetAreaSection asset={a} onChange={() => {}} transferDate="2024-06-01" />);

describe("⑤ 겸용 배율 초과분 — 유예기간·수용 안내", () => {
  it("초과분이 있으면 유예기간 입력(NBL 섹션과 같은 컴포넌트)이 뜨고, 겸용은 주택분 한정 안내가 붙는다", () => {
    const { container } = view(mixed());
    expect(container.querySelector('[data-testid="housing-excess-grace"]')).not.toBeNull();
    expect(container.textContent).toContain("부득이한 사유 유예기간");
    expect(container.querySelector('[data-testid="housing-excess-grace-mixed"]')?.textContent).toContain("상가분 부수토지는 이 판정을 하지 않습니다");
  });
  it("한도 이내(대지 300㎡)면 뜨지 않는다", () => {
    expect(view(mixed({ mixedUseTotalLandArea: "300" })).container.querySelector('[data-testid="housing-excess-grace"]')).toBeNull();
  });
  it("양도원인이 수용이면 사업인정고시일 안내가 함께 뜬다", () => {
    expect(view(mixed({ transferCause: "public_expropriation" })).container.textContent).toContain("사업인정고시일로 초과분을 판정합니다");
  });
});

describe("⑦ 겸용 결과 — 비사업용 토지로 보지 않은 초과분", () => {
  const nb: MixedUseNonBusinessLandPart = {
    excessArea: 100, appliedMultiplier: 3, transferGain: 52_640_217, longTermDeductionRate: 0.18, longTermDeductionAmount: 9_475_239,
    incomeAmount: 43_164_978, additionalRate: 0,
    deemedBusiness: { reason: "public_expropriation", detail: "배율 초과분 — 공익사업 협의매수·수용 — 고시일 2019-01-01 2년 이전 취득", legalBasis: "소득세법 시행령 §168의14③3호" },
  };
  it("가산 0 라벨이 «위기취득»이 아니라 비사업용 토지로 보지 않은 사유로 나오고 근거 카드가 뜬다", () => {
    const { container } = render(<MixedUseNblSection nb={nb} landTransferGain={0} nonBusinessTransferRatio={0.25} open onToggle={() => {}} />);
    expect(container.textContent).toContain("비사업용 토지로 보지 않아 가산 없음");
    expect(container.textContent).not.toContain("위기취득");
    expect(container.querySelector('[data-testid="mixed-nbl-deemed-business"]')?.textContent).toContain("배율 초과분은 비과세 범위가 아니라 과세 대상입니다");
  });
  it("대조 — 위기취득 가산 0은 종전 문구 그대로", () => {
    const { container } = render(<MixedUseNblSection nb={{ ...nb, deemedBusiness: undefined, surchargeExcludedBy: "crisis_acquisition" }} landTransferGain={0} nonBusinessTransferRatio={0.25} open onToggle={() => {}} />);
    expect(container.textContent).toContain("위기취득 — 가산 없음");
    expect(container.querySelector('[data-testid="mixed-nbl-deemed-business"]')).toBeNull();
  });
});
