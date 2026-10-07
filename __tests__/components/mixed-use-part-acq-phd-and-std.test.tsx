/**
 * anchor: 겸용 별개 취득 파트 모델(B1) — 기준시가 패널(`MixedUseAssetMajorStdPrice`)의 PHD 토글·H 노출·실비 카드.
 *
 * 설계: ui.design.md §2.4(PHD)·§2.6(H 노출)·§6(토글 왕복). 불변식
 *  · PHD 토글은 **환산 파트가 있을 때만** 렌더(엔진 X-7) — 없으면 숨고 저장값은 남는다.
 *  · 파트 모델의 PHD ON patch는 `usePreHousingDisclosure` **한 키만** 쓴다 — 레거시 `useEstimatedAcquisition`을 켜면
 *    토글 OFF(총액 모델) 복귀 후 상단 라디오가 조용히 「환산」으로 바뀐다(왕복 무변화 위반). 총액 모델은 종전 patch(레거시 동반) 그대로.
 *  · 취득시 개별주택공시가격(H)은 `mixedPartAcqNeeds.housingPriceAtAcq`가 참일 때만 렌더(양쪽 실가 + 경비 없음이면 쓰이지 않는다).
 *  · 주택분·상가분 실제 필요경비 카드는 「어느 한 파트라도 실거래가」일 때만(U-2 — ④ 실비 필드 선택과 같은 술어).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, fireEvent, screen } from "@testing-library/react";
import { MixedUseAssetMajorStdPrice } from "@/components/calc/transfer/mixed-use/MixedUseAssetMajorStdPrice";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

function asset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "housing",
    isMixedUseHouse: true,
    acquisitionCause: "purchase",
    hasSeperateLandAcquisitionDate: true,
    landAcquisitionDate: "2005-06-10",
    acquisitionDate: "2010-03-15",
    residentialFloorArea: "100",
    nonResidentialFloorArea: "100",
    mixedUseTotalLandArea: "200",
    buildingFootprintArea: "100",
    mixedAcqPerPartMode: true,
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    ...over,
  } as AssetForm;
}
function renderPanel(a: AssetForm, onChange: (p: Partial<AssetForm>) => void = () => {}) {
  return render(<MixedUseAssetMajorStdPrice asset={a} onChange={onChange} transferDate="2026-02-16" />);
}
const PHD_TITLE = /개별주택가격 미공시 \(§164⑦ 3-시점 환산\)/;
const HOUSING_COST_CARD = /주택분 실제 필요경비/;

describe("PHD 토글 노출 — 환산 파트가 있을 때만(파트 모델)", () => {
  it("실/실 → 토글 없음 (stale PHD 저장값이 있어도) · 건물 환산 → 토글 있음 (긍정 짝)", () => {
    const none = renderPanel(asset({ usePreHousingDisclosure: true }));
    expect(screen.queryAllByText(PHD_TITLE)).toHaveLength(0);
    none.unmount();
    renderPanel(asset({ buildingAcqMode: "estimated" }));
    expect(screen.queryAllByText(PHD_TITLE)).toHaveLength(1);
  });
  it("총액 모델은 항상 노출(불변)", () => {
    renderPanel(asset({ mixedAcqPerPartMode: false }));
    expect(screen.queryAllByText(PHD_TITLE)).toHaveLength(1);
  });
});

describe("PHD ON patch — 파트 모델은 한 키, 총액 모델은 종전(레거시 동반)", () => {
  const clickPhd = () => {
    const title = screen.getByText(PHD_TITLE);
    const card = title.closest('[data-slot="toggle-card"]') as HTMLElement;
    fireEvent.click(card.querySelector('[role="switch"]') as HTMLElement);
  };
  it("파트 모델 → { usePreHousingDisclosure: true } 만", () => {
    const patches: Array<Partial<AssetForm>> = [];
    renderPanel(asset({ buildingAcqMode: "estimated" }), (p) => patches.push(p));
    clickPhd();
    expect(patches).toEqual([{ usePreHousingDisclosure: true }]);
    expect("useEstimatedAcquisition" in patches[0]).toBe(false);
  });
  it("총액 모델(토글 OFF) → 종전 patch: 레거시 useEstimatedAcquisition 동반 (회귀 짝)", () => {
    const patches: Array<Partial<AssetForm>> = [];
    renderPanel(asset({ mixedAcqPerPartMode: false }), (p) => patches.push(p));
    clickPhd();
    expect(patches).toEqual([{ usePreHousingDisclosure: true, useEstimatedAcquisition: true }]);
  });
});

describe("취득시 H 칸 노출 = mixedPartAcqNeeds.housingPriceAtAcq", () => {
  const hField = (c: HTMLElement) => c.querySelector('[data-field="mixedAcqHousingPrice"]');
  it("양쪽 실가 + 경비 없음 → H 칸 없음 / 비-실가 파트 → 있음 / 경비 선언(자본적지출) → 있음 + 사유 hint", () => {
    const aa = renderPanel(asset());
    expect(hField(aa.container)).toBeNull();
    aa.unmount();
    const nonActual = renderPanel(asset({ landAcqMode: "appraisal" }));
    expect(hField(nonActual.container)).not.toBeNull();
    expect(nonActual.container.textContent).toContain("토지 또는 건물 파트가 실거래가가 아니어서");
    nonActual.unmount();
    const expense = renderPanel(asset({ capitalExpenditure: "10,000,000" }));
    expect(hField(expense.container)).not.toBeNull();
    expect(expense.container.textContent).toContain("자본적지출 또는 주택분·상가분 실제 필요경비를 입력하셨으므로 필요합니다");
  });
  it("총액 모델은 H 칸이 항상 있다(불변) — 같은 시드의 짝", () => {
    const off = renderPanel(asset({ mixedAcqPerPartMode: false }));
    expect(hField(off.container)).not.toBeNull();
  });
});

describe("실제 필요경비 카드 — 어느 한 파트라도 실거래가", () => {
  it("실/실·실/감정 → 카드 있음 · 감정/매매사례·환산 혼합(실거래가 파트 없음) → 없음", () => {
    expect(renderPanel(asset()).container.textContent).toMatch(HOUSING_COST_CARD);
    cleanup();
    expect(renderPanel(asset({ buildingAcqMode: "appraisal" })).container.textContent).toMatch(HOUSING_COST_CARD);
    cleanup();
    expect(renderPanel(asset({ landAcqMode: "appraisal", buildingAcqMode: "salesCase" })).container.textContent).not.toMatch(HOUSING_COST_CARD);
    cleanup();
    expect(renderPanel(asset({ landAcqMode: "estimated", buildingAcqMode: "appraisal" })).container.textContent).not.toMatch(HOUSING_COST_CARD);
  });
  it("총액 모델은 레거시 3플래그 — 실거래가(기본)면 카드 있음, 환산이면 없음 (회귀 짝)", () => {
    const actual = render(
      <MixedUseAssetMajorStdPrice asset={asset({ mixedAcqPerPartMode: false })} onChange={() => {}} transferDate="2026-02-16" useEstimatedAcquisition={false} />,
    );
    expect(actual.container.textContent).toMatch(HOUSING_COST_CARD);
    actual.unmount();
    const est = render(
      <MixedUseAssetMajorStdPrice asset={asset({ mixedAcqPerPartMode: false })} onChange={() => {}} transferDate="2026-02-16" useEstimatedAcquisition />,
    );
    expect(est.container.textContent).not.toMatch(HOUSING_COST_CARD);
  });
});
