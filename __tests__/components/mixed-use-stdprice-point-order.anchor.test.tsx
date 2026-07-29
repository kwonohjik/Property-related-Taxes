/**
 * anchor: 겸용주택 기준시가 — 시점 입력 순서 = **취득 → 양도** (시계열 통일).
 *
 * PHD(§164⑦) 3-시점 패널이 취득→최초공시→양도(법정 시계열, 뒤집기 불가)인데
 * ②주택·③상가는 양도→취득이라 PHD ON 화면에서 방향이 반대로 보였다.
 * 사용자 결정(2026-07-15)으로 겸용주택 전체를 시계열에 맞춘다.
 *
 * ⚠️ 정책 이탈 기록: 엔진은 양도를 먼저 계산한다
 * (`transfer-tax-mixed-use-helpers.ts:95-101` 양도가액 안분 → `:241-247` 취득 환산).
 * 즉 `feedback_ui_order_follows_logic` 상으로는 종전 양도→취득이 정합이었으나,
 * PHD 3-시점이 화면의 지배적 구조이므로 의도적으로 이탈한다.
 *
 * ⚠️ 스코프 필수: "양도시"/"취득시" 텍스트가 AssetMajor에 각 3곳 있고
 * ②주택 sub-block이 DOM상 먼저다 → 스코프 없는 getAllByText()[0]은 ②주택을 잡는다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, within } from "@testing-library/react";
import { MixedUseAssetMajorStdPrice } from "@/components/calc/transfer/mixed-use/MixedUseAssetMajorStdPrice";
import { MixedUseLegacyStdPrice } from "@/components/calc/transfer/mixed-use/MixedUseLegacyStdPrice";
import { MixedUseStandardPriceInputs } from "@/components/calc/transfer/mixed-use/MixedUseStandardPriceInputs";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

const TRANSFER_DATE = "2025-09-01";

function baseAsset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    isMixedUseHouse: true,
    residentialFloorArea: "100",
    nonResidentialFloorArea: "100",
    mixedUseTotalLandArea: "200",
    buildingFootprintArea: "100",
    acquisitionDate: "1991-09-12",
    landAcquisitionDate: "1991-09-12",
    ...over,
  };
}

/** DOM 순서 비교 — a가 b보다 문서상 먼저면 true. */
function precedes(a: Element, b: Element): boolean {
  return !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
}

describe("겸용주택 기준시가 시점 순서 — 취득 → 양도", () => {
  it("③ 상가 섹션: 상가건물 기준시가가 취득 → 양도 순", () => {
    const { getByPlaceholderText } = render(
      <MixedUseAssetMajorStdPrice
        asset={baseAsset()}
        onChange={() => {}}
        transferDate={TRANSFER_DATE}
        useEstimatedAcquisition
        housingSectionNum={2}
        commercialSectionNum={3}
      />,
    );
    const acq = getByPlaceholderText("취득시 상가건물 기준시가 (필수)");
    const transfer = getByPlaceholderText("양도시 상가건물 기준시가");
    expect(precedes(acq, transfer)).toBe(true);
  });

  it("③ 상가 섹션: 부수토지 개별공시지가가 취득 → 양도 순", () => {
    const { getByPlaceholderText } = render(
      <MixedUseAssetMajorStdPrice
        asset={baseAsset()}
        onChange={() => {}}
        transferDate={TRANSFER_DATE}
        useEstimatedAcquisition
        housingSectionNum={2}
        commercialSectionNum={3}
      />,
    );
    const acq = getByPlaceholderText("취득시 개별공시지가 /㎡");
    const transfer = getByPlaceholderText("양도시 개별공시지가 /㎡");
    expect(precedes(acq, transfer)).toBe(true);
  });

  it("② 주택 섹션: PHD 토글(취득)이 양도시 개별주택공시가격보다 먼저", () => {
    const { getByText } = render(
      <MixedUseAssetMajorStdPrice
        asset={baseAsset({ usePreHousingDisclosure: false })}
        onChange={() => {}}
        transferDate={TRANSFER_DATE}
        useEstimatedAcquisition
        housingSectionNum={2}
        commercialSectionNum={3}
      />,
    );
    // ⚠️ "양도시"는 ②주택·③상가건물·③부수토지 3곳에 있다 → ② 주택 섹션으로 스코프 필수.
    const housingSection = getByText("주택 기준시가").closest("div.rounded-lg") as HTMLElement;
    const acqToggle = within(housingSection).getByText(
      "취득 당시 개별주택가격 미공시 (§164⑦ 3-시점 환산)",
    );
    const transferLabel = within(housingSection).getByText("양도시");
    expect(precedes(acqToggle, transferLabel)).toBe(true);
  });

  it("자동합계: 면적 행이 취득(amber) 박스에 있고, 취득 박스가 양도 박스보다 먼저", () => {
    const { getByText } = render(
      <MixedUseAssetMajorStdPrice
        asset={baseAsset({
          mixedAcqLandPricePerSqm: "2280000",
          mixedAcqCommercialBuildingPrice: "50000000",
          mixedTransferLandPricePerSqm: "6216000",
          mixedTransferCommercialBuildingPrice: "100000000",
        })}
        onChange={() => {}}
        transferDate={TRANSFER_DATE}
        useEstimatedAcquisition
        housingSectionNum={2}
        commercialSectionNum={3}
      />,
    );
    const areaRow = getByText("상가부수토지 면적");
    const acqRow = getByText("취득 상가부수토지 기준시가 (자동)");
    const transferRow = getByText("양도 상가부수토지 기준시가 (자동)");

    // 면적 행이 취득 박스 안에 있다
    const acqBox = acqRow.closest("div.rounded-lg") as HTMLElement;
    expect(within(acqBox).getByText("상가부수토지 면적")).toBeTruthy();
    // 취득 박스가 양도 박스보다 먼저
    expect(precedes(areaRow, transferRow)).toBe(true);
    expect(precedes(acqRow, transferRow)).toBe(true);
  });

  it("상가부수토지 0(주택 override=전체토지)에서도 취득 합계가 사라지지 않는다", () => {
    // 회귀: 취득 박스 게이트를 commercialLandArea 단독으로 두면, 부수토지 0인데
    // 상가건물 기준시가가 있는 경우 취득 합계가 통째로 소실된다.
    // validate:330은 override === totalLand 를 허용하므로 도달 가능한 상태.
    const { getByText, queryByText } = render(
      <MixedUseAssetMajorStdPrice
        asset={baseAsset({
          mixedResidentialLandAreaOverride: "200", // 주택이 전체 토지 → 상가 부수토지 0
          mixedAcqCommercialBuildingPrice: "50000000",
          mixedTransferCommercialBuildingPrice: "100000000",
        })}
        onChange={() => {}}
        transferDate={TRANSFER_DATE}
        useEstimatedAcquisition
        housingSectionNum={2}
        commercialSectionNum={3}
      />,
    );
    expect(getByText("취득 상가부분 기준시가 합계 (자동)")).toBeTruthy();
    expect(getByText("양도 상가부분 기준시가 합계 (자동)")).toBeTruthy();
    // 면적이 0이면 면적 행은 숨긴다 (0.00㎡ 노이즈 방지)
    expect(queryByText("상가부수토지 면적")).toBeNull();
  });

  it("Legacy 자동합계: 면적 행이 취득 박스로 이관되고 양도 박스는 자기 값 게이트", () => {
    const { getByText } = render(
      <MixedUseLegacyStdPrice
        asset={baseAsset({
          hasPartialUsageChange: true,
          partialChangeDirection: "house_to_commercial",
          mixedAcqLandPricePerSqm: "2280000",
          mixedAcqCommercialBuildingPrice: "50000000",
          mixedTransferLandPricePerSqm: "6216000",
          mixedTransferCommercialBuildingPrice: "100000000",
        })}
        onChange={() => {}}
        transferDate={TRANSFER_DATE}
        useEstimatedAcquisition
        transferSectionNum={3}
        acqSectionNum={2}
      />,
    );
    const acqRow = getByText("취득시 상가부수토지 기준시가 (자동)");
    const acqBox = acqRow.closest("div.rounded-lg") as HTMLElement;
    expect(within(acqBox).getByText("상가부수토지 면적")).toBeTruthy();
    // 양도 박스(둘째)가 취득 박스보다 뒤
    expect(precedes(acqRow, getByText("상가부수토지 기준시가 (자동)"))).toBe(true);
  });

  it("Legacy(용도변경): 취득 섹션이 양도 섹션보다 먼저", () => {
    const { getByText } = render(
      <MixedUseLegacyStdPrice
        asset={baseAsset({
          hasPartialUsageChange: true,
          partialChangeDirection: "house_to_commercial",
        })}
        onChange={() => {}}
        transferDate={TRANSFER_DATE}
        useEstimatedAcquisition
        transferSectionNum={3}
        acqSectionNum={2}
      />,
    );
    const acqHeader = getByText("취득시 기준시가");
    const transferHeader = getByText("양도시 기준시가");
    expect(precedes(acqHeader, transferHeader)).toBe(true);
  });

  it("Legacy 배지 번호: 취득 섹션에 ②, 양도 섹션에 ③이 붙는다", () => {
    // 부모(MixedUseSection)는 transferSectionNum={2}/acqSectionNum={3} 하드코딩.
    // Legacy 분기에서만 스왑해야 한다 — 부모 값을 바꾸면 AssetMajor가 ③주택/②상가로 깨진다.
    // ⚠️ 배지 순서만 보면 스왑 전후 모두 ["2","3"]이라 구분 불가 →
    //    배지와 섹션 제목의 **연결**을 검증한다.
    const { getByText } = render(
      <MixedUseStandardPriceInputs
        asset={baseAsset({
          hasPartialUsageChange: true,
          partialChangeDirection: "house_to_commercial",
        })}
        onChange={() => {}}
        transferDate={TRANSFER_DATE}
        useEstimatedAcquisition
        transferSectionNum={2}
        acqSectionNum={3}
      />,
    );
    const badgeOf = (headerText: string) => {
      const header = getByText(headerText);
      const row = header.parentElement as HTMLElement; // flex items-center gap-2
      return within(row)
        .getAllByText(/^\d+$/)
        .map((e) => e.textContent)[0];
    };
    expect(badgeOf("취득시 기준시가")).toBe("2");
    expect(badgeOf("양도시 기준시가")).toBe("3");
  });

  it("AssetMajor 배지 회귀 방지: ②주택 / ③상가 유지", () => {
    const { container } = render(
      <MixedUseStandardPriceInputs
        asset={baseAsset({ hasPartialUsageChange: false })}
        onChange={() => {}}
        transferDate={TRANSFER_DATE}
        useEstimatedAcquisition
        transferSectionNum={2}
        acqSectionNum={3}
      />,
    );
    // ToggleCard의 Switch도 rounded-full이라 숫자 배지만 추린다.
    const badges = Array.from(container.querySelectorAll("span.rounded-full"))
      .map((e) => e.textContent ?? "")
      .filter((t) => /^\d+$/.test(t));
    expect(badges.slice(0, 2)).toEqual(["2", "3"]);
  });
});
