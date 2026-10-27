/**
 * anchor(render) — 상속·증여 자산이 자산 종류 버튼·겸용 OFF로 일반 범위에 들어올 때 산정 방식 플래그를 같은 onChange에 비운다
 * (계획서 `docs/02-design/features/inherit-gift-scope-entry-stale-acq-flags.plan.md` — #2594 V-1).
 * 세액 쪽은 route anchor `__tests__/api/transfer.route.inherit-gift-scope-entry-stale-acq-flags.anchor.test.ts`.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { AssetSectionBasic } from "@/components/calc/transfer/asset-sections/AssetSectionBasic";
import { MixedUseToggleRow } from "@/components/calc/transfer/MixedUseSection";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const FLAGS_CLEARED = { useEstimatedAcquisition: false, isAppraisalAcquisition: false, isSalesCaseAcquisition: false };

function clickKind(over: Partial<AssetForm>, label: RegExp): Partial<AssetForm> {
  const onChange = vi.fn();
  const asset = { ...makeDefaultAsset(1), acquisitionDate: "2015-01-01", ...over } as AssetForm;
  render(
    <AssetSectionBasic
      asset={asset}
      onChange={onChange}
      isMultiBundled={false}
      onAddAsset={vi.fn()}
      showFormDates={false}
      transferDate="2023-02-16"
      filingDate=""
      filingOverdue={false}
      filingDeadline=""
      onFormChange={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: label }));
  expect(onChange).toHaveBeenCalledTimes(1);
  return onChange.mock.calls[0][0] as Partial<AssetForm>;
}

function toggleMixedOff(over: Partial<AssetForm>): Partial<AssetForm> {
  const onChange = vi.fn();
  const asset = { ...makeDefaultAsset(1), assetKind: "housing", isMixedUseHouse: true, hasSeperateLandAcquisitionDate: true, ...over } as AssetForm;
  const { container } = render(<MixedUseToggleRow asset={asset} onChange={onChange} />);
  fireEvent.click(within(container.querySelector('[data-field="isMixedUseHouse"]') as HTMLElement).getByRole("switch"));
  expect(onChange).toHaveBeenCalledTimes(1);
  return onChange.mock.calls[0][0] as Partial<AssetForm>;
}

describe("자산 종류 버튼 — 범위 밖 → 일반 범위", () => {
  it.each([
    ["상속 재개발 환산 → 주택", { acquisitionCause: "inheritance", assetKind: "redevelopment_apt", useEstimatedAcquisition: true }, /^주택$/],
    ["상속 입주권 감정 → 단순토지", { acquisitionCause: "inheritance", assetKind: "right_to_move_in", isAppraisalAcquisition: true }, /단순토지/],
    ["증여 입주권 매매사례 → 주택", { acquisitionCause: "gift", assetKind: "right_to_move_in", isSalesCaseAcquisition: true }, /^주택$/],
    ["증여 재개발 환산 → 단순토지", { acquisitionCause: "gift", assetKind: "redevelopment_apt", useEstimatedAcquisition: true }, /단순토지/],
  ] as const)("%s: 플래그 3종을 같은 onChange에 비운다", (_n, over, label) => {
    expect(clickKind(over as Partial<AssetForm>, label)).toMatchObject(FLAGS_CLEARED);
  });

  it("상속 겸용(주택) 환산 → 단순토지: 겸용이 꺼지며 일반 범위에 들어오므로 비운다", () => {
    const patch = clickKind({ acquisitionCause: "inheritance", assetKind: "housing", isMixedUseHouse: true, useEstimatedAcquisition: true }, /단순토지/);
    expect(patch).toMatchObject({ isMixedUseHouse: false, ...FLAGS_CLEARED });
  });

  it("상속 파트 값도 복원과 같게 비운다(파트 방식·파트 취득가)", () => {
    const patch = clickKind(
      { acquisitionCause: "inheritance", assetKind: "redevelopment_apt", useEstimatedAcquisition: true, landAcqMode: "estimated", buildingAcquisitionPrice: "100000000" },
      /^주택$/,
    );
    expect(patch).toMatchObject({ landAcqMode: "", buildingAcqMode: "", buildingAcquisitionPrice: "", landAcquisitionPrice: "" });
  });

  it.each([
    ["매매 재개발 환산 → 주택(매매는 그 라디오가 일반 카드에도 있다)", { acquisitionCause: "purchase", assetKind: "redevelopment_apt", useEstimatedAcquisition: true }, /^주택$/],
    ["상속 재개발 환산 → 입주권(범위 밖에 머문다 — §166③ 라디오가 그대로 있다)", { acquisitionCause: "inheritance", assetKind: "redevelopment_apt", useEstimatedAcquisition: true }, /입주권/],
    ["상속 주택 → 단순토지(범위 안 → 범위 안)", { acquisitionCause: "inheritance", assetKind: "housing", useEstimatedAcquisition: true }, /단순토지/],
    ["부담부증여 재개발 환산 → 주택(복원도 비우지 않는다)", { acquisitionCause: "gift", transferType: "burdened_gift", assetKind: "redevelopment_apt", useEstimatedAcquisition: true }, /^주택$/],
  ] as const)("%s: 플래그를 건드리지 않는다", (_n, over, label) => {
    const patch = clickKind(over as Partial<AssetForm>, label);
    expect(patch).not.toHaveProperty("useEstimatedAcquisition");
  });
});

describe("겸용 토글 OFF", () => {
  it.each([["상속", { acquisitionCause: "inheritance" }], ["증여", { acquisitionCause: "gift" }]] as const)(
    "%s 「개별주택가격 미공시」가 켠 환산 → 겸용 OFF: 같은 onChange에 비운다",
    (_n, over) => {
      const patch = toggleMixedOff({ ...over, useEstimatedAcquisition: true, usePreHousingDisclosure: true } as Partial<AssetForm>);
      expect(patch).toMatchObject({ isMixedUseHouse: false, ...FLAGS_CLEARED });
    },
  );

  it.each([
    ["매매", { acquisitionCause: "purchase" }],
    ["부담부증여", { acquisitionCause: "gift", transferType: "burdened_gift" }],
  ] as const)("%s → 겸용 OFF: 플래그를 건드리지 않는다", (_n, over) => {
    const patch = toggleMixedOff({ ...over, useEstimatedAcquisition: true } as Partial<AssetForm>);
    expect(patch).toEqual({ isMixedUseHouse: false });
  });
});
