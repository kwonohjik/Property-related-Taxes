/**
 * 신축주택 부수토지 한도 카드 — 표시 전용 계약 (A6)
 *
 * ## 문제
 *
 * `buildingFootprintArea`(정착면적)와 `appurtenantLandZone`(소재지 구분)을
 * **두 곳이 같은 위젯으로** 입력받고 있었다:
 *
 *   ① 기본정보 축 C  `asset-sections/AssetAreaSection.tsx:481·514`
 *   ③ 취득정보       `NewConstructionFootprintSection`
 *                    (← `CompanionAssetCardNewConstruction.tsx:147`
 *                     ← `AssetSectionAcquisition.tsx:210`)
 *
 * ③의 게이트는 `isNewConstruction && assetKind === "housing"`이고 ①의 축 C는
 * `FOOTPRINT_AREA_KINDS`(housing 포함) && 비겸용이라 **신축주택에서 동시에 렌더**된다.
 * 옵션 문구까지 같은 라디오가 한 화면에 두 번 나왔다(`AssetAreaSection.tsx:157` 주석이
 * 그 중복을 기록하고 있었다).
 *
 * ## 단순 중복을 넘어선 부분 — 표시와 저장의 불일치
 *
 * ③은 `value={appurtenantLandZone ?? "metropolitan_residential"}` **display fallback**을
 * 걸어 미선택을 "수도권 도시지역 3배 **선택됨**"으로 보여줬고, `multiplierOf`의 default도
 * 3배여서 한도 계산 결과까지 출력했다. 그런데 store는 `undefined` 그대로였다:
 *
 *   `calc-wizard-asset-factory.ts:124`  `appurtenantLandZone: undefined`
 *   `transfer-tax-validate-split.ts:117-126`  `undefined` + 토지 > 정착면적×3 → **차단**
 *
 * 즉 사용자는 "3배로 선택되어 한도가 나왔다"고 보는데 계산 버튼을 누르면
 * "「부수토지 소재지 구분」을 선택하세요"로 막혔다
 * (memory `feedback_store_default_vs_ui_display_fallback`의 구조 그대로).
 *
 * 게다가 그 3배 가정은 같은 validate 주석의 **R-7**이 "초과면적을 과다 산출해 납세자에게
 * 불리"하다며 배제한 바로 그 가정이다 — 엔진도 미선택 시 배율 판정을 하지 않는다.
 *
 * ## 계약
 *
 * ③은 **표시 전용**이다. 입력은 ① 하나. 소재지 미선택이면 배율을 가정하지 않고
 * 한도 계산을 생략한다.
 *
 * ⛔ 이 카드에 입력 위젯을 다시 넣지 말 것. 특히 소재지 구분의 display fallback 부활 금지.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NewConstructionPrimarySection } from "@/components/calc/transfer/CompanionAssetCardNewConstruction";
import { AssetSectionBasic } from "@/components/calc/transfer/asset-sections/AssetSectionBasic";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

// RTL cleanup은 프로젝트 규약상 수동 등록 (memory feedback_rtl_manual_cleanup_required)
afterEach(() => cleanup());

/** ③이 실제로 뜨는 자산 — 신축 취득 + 주택. */
function newConstructionHouse(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "housing",
    acquisitionCause: "newConstruction",
    buildingFootprintArea: "100",
    ...over,
  };
}

function renderThird(over: Partial<AssetForm> = {}) {
  render(<NewConstructionPrimarySection asset={newConstructionHouse(over)} onChange={vi.fn()} />);
}

function renderBasic(over: Partial<AssetForm> = {}) {
  render(
    <AssetSectionBasic
      asset={newConstructionHouse(over)}
      onChange={vi.fn()}
      isMultiBundled={false}
      onAddAsset={vi.fn()}
      showFormDates={false}
      transferDate="2026-05-01"
      filingDate=""
      filingOverdue={false}
      filingDeadline=""
      onFormChange={vi.fn()}
    />,
  );
}

describe("A6 — 신축 부수토지 카드는 표시 전용", () => {
  it("[A6-01] ③에 정착면적 입력 칸이 없다", () => {
    renderThird();
    // ①의 축 C 입력 칸에만 붙는 testid
    expect(screen.queryByTestId("basic-building-footprint-area")).toBeNull();
    // ③이 스스로 렌더하던 입력 라벨도 없다
    expect(screen.queryByLabelText(/건물 정착면적/)).toBeNull();
  });

  it("[A6-02] ③에 소재지 구분 라디오가 없다 — 미선택을 '3배 선택됨'으로 보이게 하던 원인", () => {
    renderThird({ appurtenantLandZone: undefined });
    expect(screen.queryByRole("radio", { name: /수도권 도시지역/ })).toBeNull();
  });

  it("[A6-03] 소재지 미선택이면 '미선택'으로 보이고 한도를 계산하지 않는다 (R-7)", () => {
    renderThird({ appurtenantLandZone: undefined });

    expect(screen.getByText(/미선택/)).toBeTruthy();
    // 3배를 가정한 한도(100 × 3 = 300.00㎡)를 출력하지 않는다
    expect(screen.queryByText(/300\.00㎡/)).toBeNull();
    expect(screen.getByText(/한도를 임의로 가정하지 않습니다/)).toBeTruthy();
  });

  it("[A6-04] 소재지를 선택하면 그 배율로 한도를 계산해 보여준다", () => {
    renderThird({ appurtenantLandZone: "non_metropolitan_or_green" });

    // 100㎡ × 5배 = 500.00㎡
    expect(screen.getByText(/500\.00㎡/)).toBeTruthy();
  });

  it("[A6-05] 입력은 ①에 있다 — 정착면적 칸과 소재지 라디오 모두", () => {
    renderBasic({ appurtenantLandZone: undefined });

    expect(screen.getByTestId("basic-building-footprint-area")).toBeTruthy();
    // 축 C 라디오는 정착면적 > 0 일 때 노출된다 (AssetAreaSection.tsx:499)
    expect(screen.getByRole("radio", { name: /수도권 도시지역/ })).toBeTruthy();
  });
});
