/**
 * anchor: B0 ⑤ — 「주택부수토지 개별공시지가 — 건물 취득일 기준」 칸
 *
 *  · 술어(`needsMixedAcqLandPriceAtBuildingAcq`) 참일 때만 **마운트**된다(CSS 숨김 아님 — 미렌더).
 *  · 기준일 = 건물 취득일(추천 연도 라벨로 확인) — 기존 칸(토지 취득일)과 연도가 다르다.
 *  · AssetMajor·Legacy 두 레이아웃 모두에 삽입, 기존 토지일 칸 라벨·placeholder 불변(+「토지 취득일 기준」 캡션).
 *  · 미렌더 단언엔 대응 긍정 단언(같은 시드에서 날짜만 다르게)을 함께 둔다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { MixedUseAcqHousingLandPriceField } from "@/components/calc/transfer/mixed-use/MixedUseAcqHousingLandPriceField";
import { MixedUseAssetMajorStdPrice } from "@/components/calc/transfer/mixed-use/MixedUseAssetMajorStdPrice";
import { MixedUseLegacyStdPrice } from "@/components/calc/transfer/mixed-use/MixedUseLegacyStdPrice";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

const TID = "mixed-acq-land-price-at-building-acq";
const INPUT_TID = "mixed-acq-land-price-at-building-acq-input";

function asset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "housing",
    isMixedUseHouse: true,
    acquisitionCause: "purchase",
    residentialFloorArea: "100",
    nonResidentialFloorArea: "100",
    mixedUseTotalLandArea: "200",
    buildingFootprintArea: "100",
    acquisitionDate: "2010-03-15",
    landAcquisitionDate: "2005-06-10",
    mixedAcqHousingPrice: "400,000,000",
    ...over,
  } as AssetForm;
}

describe("컴포넌트 단독 — 술어 참/거짓", () => {
  it("참: 마운트 + 두 날짜 문구 + 입력칸 + 라벨·placeholder", () => {
    const { getByTestId, getByPlaceholderText, getByText } = render(
      <MixedUseAcqHousingLandPriceField asset={asset()} onChange={() => {}} />,
    );
    expect(getByTestId(TID)).toBeTruthy();
    expect(getByTestId(INPUT_TID)).toBeTruthy();
    expect(getByPlaceholderText("건물 취득일 기준 개별공시지가 /㎡")).toBeTruthy();
    expect(getByText("주택부수토지 개별공시지가 (원/㎡) — 건물 취득일 기준")).toBeTruthy();
    expect(getByTestId(TID).textContent).toContain("토지 취득일(2005-06-10)");
    expect(getByTestId(TID).textContent).toContain("건물 취득일(2010-03-15)");
  });

  it("거짓(날짜 같음): 같은 시드에서 날짜만 같게 → 미렌더 (참 단언의 짝)", () => {
    const { queryByTestId, container } = render(
      <MixedUseAcqHousingLandPriceField asset={asset({ landAcquisitionDate: "2010-03-15" })} onChange={() => {}} />,
    );
    expect(queryByTestId(TID)).toBeNull();
    expect(container.innerHTML).toBe("");
  });

  it("거짓(PHD ON · 용도변경 상가→주택 · 주택가격 미입력 · 비겸용)", () => {
    for (const over of [
      { usePreHousingDisclosure: true },
      { hasPartialUsageChange: true, partialChangeDirection: "commercial_to_house" as const },
      { mixedAcqHousingPrice: "" },
      { isMixedUseHouse: false },
    ]) {
      const { queryByTestId, unmount } = render(
        <MixedUseAcqHousingLandPriceField asset={asset(over)} onChange={() => {}} />,
      );
      expect(queryByTestId(TID)).toBeNull();
      unmount();
    }
  });

  it("기준일 = 건물 취득일 — 추천 연도 2009(자동) (토지 취득일이면 2005)", () => {
    const { getAllByText, queryByText } = render(
      <MixedUseAcqHousingLandPriceField asset={asset()} onChange={() => {}} />,
    );
    expect(getAllByText(/2009년 \(자동\)/).length).toBeGreaterThan(0);
    expect(queryByText(/2005년 \(자동\)/)).toBeNull();
  });

  it("입력 → 이 필드 하나만 patch한다 (토지일 칸 값으로 채우지 않는다)", () => {
    const onChange = vi.fn();
    const { getByTestId } = render(
      <MixedUseAcqHousingLandPriceField
        asset={asset({ mixedAcqLandPricePerSqm: "1,200,000" })}
        onChange={onChange}
      />,
    );
    fireEvent.change(getByTestId(INPUT_TID), { target: { value: "1800000" } });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(Object.keys(onChange.mock.calls[0][0])).toEqual(["mixedAcqLandPricePerSqmAtBuildingAcq"]);
  });

  it("stale(필드 undefined) + 비어 있음 → 예외 없이 빈 칸 (토지일 값 1,200,000이 보이지 않는다)", () => {
    const a = asset({ mixedAcqLandPricePerSqm: "1,200,000" }) as Partial<AssetForm>;
    delete a.mixedAcqLandPricePerSqmAtBuildingAcq;
    const { getByTestId } = render(
      <MixedUseAcqHousingLandPriceField asset={a as AssetForm} onChange={() => {}} />,
    );
    expect((getByTestId(INPUT_TID) as HTMLInputElement).value).toBe("");
  });

  it("면적 전달 시 토지기준시가 열, 미전달 시 2열(면적 재계산 안 함)", () => {
    const withArea = render(
      <MixedUseAcqHousingLandPriceField asset={asset({ mixedAcqLandPricePerSqmAtBuildingAcq: "1,800,000" })} onChange={() => {}} area={100} />,
    );
    expect(withArea.queryByText("토지기준시가")).toBeTruthy();
    withArea.unmount();
    const withoutArea = render(
      <MixedUseAcqHousingLandPriceField asset={asset({ mixedAcqLandPricePerSqmAtBuildingAcq: "1,800,000" })} onChange={() => {}} />,
    );
    expect(withoutArea.queryByText("토지기준시가")).toBeNull();
  });
});

describe("레이아웃 삽입 — AssetMajor · Legacy 공통", () => {
  const major = (a: AssetForm) =>
    render(
      <MixedUseAssetMajorStdPrice asset={a} onChange={() => {}} transferDate="2024-08-20" useEstimatedAcquisition housingSectionNum={2} commercialSectionNum={3} />,
    );
  const legacy = (a: AssetForm) =>
    render(<MixedUseLegacyStdPrice asset={a} onChange={() => {}} transferDate="2024-08-20" useEstimatedAcquisition />);

  it("AssetMajor: 날짜 다름 → 신규 칸 + 기존 토지일 칸 캡션 / 날짜 같음 → 둘 다 없음", () => {
    const sep = major(asset());
    expect(sep.getByTestId(TID)).toBeTruthy();
    expect(sep.getByText("토지 취득일 기준")).toBeTruthy();
    sep.unmount();
    const same = major(asset({ landAcquisitionDate: "2010-03-15" }));
    expect(same.queryByTestId(TID)).toBeNull();
    expect(same.queryByText("토지 취득일 기준")).toBeNull();
  });

  it("AssetMajor: 신규 칸은 개별주택공시가격 바로 뒤(주택 블록), 상가 토지일 칸보다 앞", () => {
    const { getByTestId, getByPlaceholderText } = major(asset());
    const nu = getByTestId(TID);
    const commercialLand = getByPlaceholderText("취득시 개별공시지가 /㎡");
    expect(nu.compareDocumentPosition(commercialLand) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("AssetMajor: 기존 토지일 칸 placeholder는 그대로 1건(신규와 충돌 없음)", () => {
    const { getAllByPlaceholderText } = major(asset());
    expect(getAllByPlaceholderText("취득시 개별공시지가 /㎡")).toHaveLength(1);
  });

  it("Legacy(용도변경 주택→상가): 신규 칸 + 캡션 / 상가→주택·PHD ON은 없음", () => {
    const base = { hasPartialUsageChange: true, partialChangeDirection: "house_to_commercial" as const, partialChangeDate: "2020-01-01" };
    const sep = legacy(asset(base));
    expect(sep.getByTestId(TID)).toBeTruthy();
    expect(sep.getByText("토지 취득일 기준")).toBeTruthy();
    sep.unmount();
    const c2h = legacy(asset({ ...base, partialChangeDirection: "commercial_to_house" }));
    expect(c2h.queryByTestId(TID)).toBeNull();
  });
});
