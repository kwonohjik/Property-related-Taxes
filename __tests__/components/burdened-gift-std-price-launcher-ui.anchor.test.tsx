/**
 * anchor: 부담부증여 ④ 「증여재산 평가」 — 상속·증여 건물 기준시가 계산기 런처 노출 계약
 *
 * ## 무엇을 잡는가
 *
 * 1. **런처 노출 자산이 정확히 2종**(`general_building`·`building`)인가.
 *    넓히면 계산기가 낼 수 없는 값(주택 일괄고시·상가 호별고시)을 계산기로 채우게 되고,
 *    좁히면 입력 경로가 사라진다.
 * 2. **④ 섹션 게이트** — 시가 모드·토지 자산에서 숨는가.
 *    시가 모드에서는 평가액이 시가로 통째 대체돼 이 값이 쓰이지 않고
 *    (`burdened-gift-valuation.ts:134-137`), 토지는 건물이 없다.
 * 3. **연면적 prefill 축** — GB는 **전체**(`gbBuildingArea`)다. 양도세용 런처가 쓰는
 *    원건물분(`gbBuildingStdPriceFloorArea`)으로 바뀌면 증축분이 평가에서 빠진다.
 *
 * 주입 규칙(합산 여부) 자체는 순수함수 anchor가 진다:
 *   `__tests__/calc/burdened-gift-std-price-launcher.anchor.test.ts`
 *
 * 설계: docs/02-design/features/burdened-gift-valuation-std-price-calculator.plan.md §3·§4.7
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { BurdenedGiftBlock } from "@/components/calc/transfer/BurdenedGiftBlock";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

const LAUNCHER = /건물 기준시가 계산 \(상속·증여\)/;
const SECTION_TITLE = /증여재산 평가 — 증여일 현재 기준시가/;

function renderBlock(over: Partial<AssetForm>, transferDate = "2025-06-01") {
  const asset: AssetForm = {
    ...makeDefaultAsset(1),
    transferType: "burdened_gift",
    bgValuationMode: "sangjeungbeop_standard",
    ...over,
  };
  return render(<BurdenedGiftBlock asset={asset} onChange={() => {}} transferDate={transferDate} />);
}

describe("A-1 런처가 노출되는 자산 (2종)", () => {
  it.each(["general_building", "building"] as const)("%s", (assetKind) => {
    renderBlock({ assetKind });
    expect(screen.getAllByRole("button", { name: LAUNCHER })).toHaveLength(1);
  });
});

describe("A-2 런처가 노출되지 않는 자산 (전수)", () => {
  it.each(["housing", "commercial_building", "land"] as const)("%s", (assetKind) => {
    renderBlock({ assetKind });
    expect(screen.queryByRole("button", { name: LAUNCHER })).toBeNull();
  });

  it("housing·commercial_building은 ④ 섹션 자체는 유지한다 (직접입력 경로 보존)", () => {
    renderBlock({ assetKind: "housing" });
    expect(screen.getByText(SECTION_TITLE)).toBeTruthy();
  });
});

describe("A-3/A-4 ④ 섹션 게이트", () => {
  it("A-3 시가 모드 → ④ 섹션 전체 미렌더 (런처 포함)", () => {
    renderBlock({ assetKind: "general_building", bgValuationMode: "sangjeungbeop_market" });
    expect(screen.queryByText(SECTION_TITLE)).toBeNull();
    expect(screen.queryByRole("button", { name: LAUNCHER })).toBeNull();
  });

  it("A-4 토지 자산 → ④ 섹션 미렌더 (건물이 없다)", () => {
    renderBlock({ assetKind: "land" });
    expect(screen.queryByText(SECTION_TITLE)).toBeNull();
  });

  it("🔴 대조군 — 기준시가 모드 + 건물 자산에서는 렌더된다", () => {
    renderBlock({ assetKind: "general_building" });
    expect(screen.getByText(SECTION_TITLE)).toBeTruthy();
  });
});

describe("A-9 building 전용 부수토지 안내", () => {
  it("building에서만 뜬다", () => {
    renderBlock({ assetKind: "building" });
    // 안내문이 「건물 + 부수토지」를 <b>로 감싸 텍스트 노드가 갈린다 — 그 조각으로 찾는다
    expect(screen.getByText("건물 + 부수토지")).toBeTruthy();
    expect(screen.getByText(/제61조 제1항 제1호·제2호/)).toBeTruthy();
  });

  it("general_building에는 없다 (토지분은 별도 산출 — 합산 안내가 오히려 오도)", () => {
    renderBlock({ assetKind: "general_building" });
    expect(screen.queryByText(/부수토지/)).toBeNull();
  });
});

describe("A-10 ④ 라벨 — 「건물」이라고만 쓰면 토지분이 조용히 빠진다", () => {
  /**
   * `general_building`만 순수 건물분이고 나머지 3종은 토지를 포함한다(상증법 §61① 2·3·4호).
   * 한 라벨로 통일하려는 시도가 이 테스트에 걸린다 — 통일하면 어느 한쪽이 반드시 틀린다.
   * 기준일도 「양도시」가 아니라 **증여일**이다(부담부증여라 값은 같지만 상증 평가의 기준일은 증여일).
   */
  it.each([
    ["general_building", "증여일 건물 기준시가"],
    ["building", "증여일 기준시가 (부수토지 포함)"],
    ["housing", "증여일 주택 기준시가"],
    ["commercial_building", "증여일 기준시가 (토지·건물 일괄)"],
  ] as const)("%s → %s", (assetKind, label) => {
    renderBlock({ assetKind });
    expect(screen.getByText(label)).toBeTruthy();
  });

  it("토지 포함 자산의 라벨에 「건물」 단독 표기가 없다", () => {
    for (const assetKind of ["housing", "commercial_building"] as const) {
      cleanup();
      renderBlock({ assetKind });
      expect(screen.queryByText(/^증여일 건물 기준시가$/)).toBeNull();
    }
  });
});

describe("A-5 연면적 prefill 축 — GB는 전체 연면적", () => {
  /**
   * 모달을 열지 않고 계약을 고정하기 위해 순수함수 쪽 값을 본다(UI는 그 값을 그대로 넘긴다).
   * ⚠️ 원건물분(`gbOriginalBuildingArea`)이 아니라 **전체**(`gbBuildingArea`)여야 한다.
   */
  it("gbOriginalBuildingArea가 있어도 전체를 쓴다", async () => {
    const { bgGiftStdPriceLauncherSpec } = await import(
      "@/lib/calc/burdened-gift-std-price-launcher"
    );
    const asset = {
      ...makeDefaultAsset(1),
      assetKind: "general_building" as const,
      gbBuildingArea: "300",
      gbOriginalBuildingArea: "200",
      gbLandArea: "150",
    };
    expect(bgGiftStdPriceLauncherSpec(asset)?.floorArea).toBe("300");
  });
});
