/**
 * @vitest-environment jsdom
 *
 * anchor(⑤) — 주택 배율 초과분 유예기간·수용 안내 노출 게이트 (NBL2611-C4 · R16).
 * 노출 술어는 ④ 전송·⑧ 검증과 같은 `housingExcessGraceApplies` 하나다 — 칸이 보이지 않는데 남은 값이 세액에 닿는 일(stale)이 없다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { AssetAreaSection } from "@/components/calc/transfer/asset-sections/AssetAreaSection";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

afterEach(cleanup);

const house = (over: Partial<AssetForm> = {}): AssetForm =>
  ({
    ...makeDefaultAsset(1),
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2015-01-01",
    acquisitionArea: "1000",
    buildingFootprintArea: "100",
    appurtenantLandZone: "metropolitan_residential",
    ...over,
  }) as AssetForm;

const view = (a: AssetForm) => render(<AssetAreaSection asset={a} onChange={() => {}} transferDate="2024-09-01" />);

describe("주택 배율 초과분 — 유예기간·수용 안내 노출", () => {
  it("초과분이 있으면 유예기간 입력(NBL 섹션과 같은 컴포넌트)이 뜬다", () => {
    const { container } = view(house());
    expect(container.querySelector('[data-testid="housing-excess-grace"]')).not.toBeNull();
    expect(container.textContent).toContain("부득이한 사유 유예기간");
  });
  it("배율 한도 이내(초과 없음)면 뜨지 않는다 — 남은 행이 세액에 닿지 않게", () => {
    const { container } = view(house({ acquisitionArea: "250" }));
    expect(container.querySelector('[data-testid="housing-excess-grace"]')).toBeNull();
  });
  it("양도원인이 수용이면 사업인정고시일 안내가 함께 뜨고, 일반이면 안내가 없다", () => {
    expect(view(house({ transferCause: "public_expropriation" })).container.textContent).toContain("사업인정고시일로 초과분을 판정합니다");
    cleanup();
    expect(view(house({ transferCause: "general" })).container.textContent).not.toContain("사업인정고시일로 초과분을 판정합니다");
  });
  it("겸용주택은 이 입구가 아니다", () => {
    const { container } = view(house({ isMixedUseHouse: true }));
    expect(container.querySelector('[data-testid="housing-excess-grace"]')).toBeNull();
  });
});
