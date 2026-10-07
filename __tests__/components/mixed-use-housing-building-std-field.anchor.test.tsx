/**
 * anchor: S3-2 ⑤ — 「주택건물 기준시가」(나목) 입력칸 (`MixedUseHousingBuildingStdField`).
 *
 *  · 술어(`needsMixedHousingBuildingStdAtAcq/Transfer`) 참일 때만 **마운트**된다(미렌더 — CSS 숨김 아님).
 *    미렌더 단언에는 같은 시드의 긍정 단언이 짝으로 있다(`feedback_negative_anchor_needs_positive_twin`).
 *  · 모달 런처 계약: 스냅샷 키 `-mx-housing-{acq|transfer}` · `applyTimePoint` · prefill 연면적(주택 연면적 — 상가 부분 아님).
 *  · AssetMajor·Legacy 두 레이아웃 4곳에 삽입, DOM 순서 = 계산 순서(개별주택가격 → 나목).
 *
 * 설계: `docs/02-design/features/housing-std-split-proportional-s3-2.ui.design.md` §2.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";

type LauncherProps = {
  buttonLabel?: string;
  snapshotKey?: string;
  applyTimePoint?: string;
  prefill?: Record<string, string | undefined>;
  onApply?: (v: number) => void;
};
const launchers: LauncherProps[] = [];
vi.mock("@/components/calc/building-std-price/BuildingStdPriceModalButton", () => ({
  BuildingStdPriceModalButton: (props: LauncherProps) => {
    launchers.push(props);
    return <button type="button" data-testid={`launcher:${props.snapshotKey ?? "none"}`}>{props.buttonLabel}</button>;
  },
}));

import { MixedUseHousingBuildingStdField } from "@/components/calc/transfer/mixed-use/MixedUseHousingBuildingStdField";
import { MixedUseAssetMajorStdPrice } from "@/components/calc/transfer/mixed-use/MixedUseAssetMajorStdPrice";
import { MixedUseLegacyStdPrice } from "@/components/calc/transfer/mixed-use/MixedUseLegacyStdPrice";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(() => {
  cleanup();
  launchers.length = 0;
});

const ACQ_CARD = "mixed-acq-housing-building-std-card";
const TR_CARD = "mixed-transfer-housing-building-std-card";
const ACQ_IN = "mixed-acq-housing-building-std";
const TR_IN = "mixed-transfer-housing-building-std";

function asset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetId: "a1",
    assetKind: "housing",
    isMixedUseHouse: true,
    acquisitionCause: "purchase",
    // B1 — 이 anchor는 **총액 모델**(토글 OFF)의 나목·B0 칸을 본다. 신규 자산 initial이 파트 모델 ON이라 명시한다(시드 보강 — 의도 반전 아님).
    mixedAcqPerPartMode: false,
    acquisitionDate: "2010-03-15",
    residentialFloorArea: "100",
    nonResidentialFloorArea: "60",
    mixedUseTotalLandArea: "200",
    buildingFootprintArea: "100",
    mixedAcqHousingPrice: "400,000,000",
    mixedTransferHousingPrice: "900,000,000",
    mixedAcqLandPricePerSqm: "1,200,000",
    mixedTransferLandPricePerSqm: "5,000,000",
    ...over,
  } as AssetForm;
}
const H2C = { hasPartialUsageChange: true, partialChangeDirection: "house_to_commercial" as const, partialChangeDate: "2020-01-01" };
const C2H = { ...H2C, partialChangeDirection: "commercial_to_house" as const };

describe("컴포넌트 단독 — 술어 참/거짓", () => {
  it("취득시·양도시 참: 카드·입력·라벨·필수 표지·앵커(data-field)", () => {
    const { getByTestId, container } = render(
      <>
        <MixedUseHousingBuildingStdField asset={asset()} onChange={() => {}} timePoint="acq" />
        <MixedUseHousingBuildingStdField asset={asset()} onChange={() => {}} timePoint="transfer" />
      </>,
    );
    expect(getByTestId(ACQ_CARD).textContent).toContain("취득시 주택건물 기준시가");
    expect(getByTestId(TR_CARD).textContent).toContain("양도시 주택건물 기준시가");
    expect(getByTestId(ACQ_IN)).toBeTruthy();
    expect(getByTestId(TR_IN)).toBeTruthy();
    // ⑧의 입력칸 이동 앵커 — 검증 키 = FieldCard field
    expect(container.querySelector('[data-field="mixedAcqHousingBuildingStdPrice"]')).not.toBeNull();
    expect(container.querySelector('[data-field="mixedTransferHousingBuildingStdPrice"]')).not.toBeNull();
    // 「상가건물 기준시가」(③)와 혼동되지 않게 「주택」 라벨 + hint 첫 문장에 「상가 부분 제외」
    expect(getByTestId(ACQ_CARD).textContent).toContain("상가 부분·토지 제외");
  });

  it("토지·건물 취득일이 다르면 취득시 칸에 「건물 취득일 기준」 안내 — 같으면 없다(양도시 칸은 항상 없다)", () => {
    const sep = { hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2005-06-10" };
    const s = render(<MixedUseHousingBuildingStdField asset={asset(sep)} onChange={() => {}} timePoint="acq" />);
    const t = s.getByTestId(ACQ_CARD).textContent ?? "";
    expect(t).toContain("건물 취득일 기준");
    expect(t).toContain("토지 취득일(2005-06-10)과 건물 취득일(2010-03-15)");
    s.unmount();
    const same = render(<MixedUseHousingBuildingStdField asset={asset()} onChange={() => {}} timePoint="acq" />);
    expect(same.getByTestId(ACQ_CARD).textContent).not.toContain("건물 취득일 기준");
    same.unmount();
    const tr = render(<MixedUseHousingBuildingStdField asset={asset(sep)} onChange={() => {}} timePoint="transfer" />);
    expect(tr.getByTestId(TR_CARD).textContent).not.toContain("건물 취득일 기준");
  });

  it("상속·증여는 라벨이 상속개시일·증여일", () => {
    const { getByTestId } = render(
      <MixedUseHousingBuildingStdField asset={asset({ acquisitionCause: "inheritance" })} onChange={() => {}} timePoint="acq" acqLabel="상속개시일" />,
    );
    expect(getByTestId(ACQ_CARD).textContent).toContain("상속개시일 주택건물 기준시가");
  });

  it("PHD ON: 두 시점 모두 미렌더 (위 긍정의 짝)", () => {
    for (const tp of ["acq", "transfer"] as const) {
      const { queryByTestId, container, unmount } = render(
        <MixedUseHousingBuildingStdField asset={asset({ usePreHousingDisclosure: true })} onChange={() => {}} timePoint={tp} />,
      );
      expect(queryByTestId(tp === "acq" ? ACQ_CARD : TR_CARD)).toBeNull();
      expect(container.innerHTML).toBe("");
      unmount();
    }
  });

  it("상가→주택: 취득시 미렌더 · 양도시 렌더 (주택→상가는 둘 다 렌더 — 짝)", () => {
    const acqOf = (a: AssetForm) =>
      render(<MixedUseHousingBuildingStdField asset={a} onChange={() => {}} timePoint="acq" />);
    const trOf = (a: AssetForm) =>
      render(<MixedUseHousingBuildingStdField asset={a} onChange={() => {}} timePoint="transfer" />);
    const h2cAcq = acqOf(asset(H2C));
    expect(h2cAcq.queryByTestId(ACQ_CARD)).not.toBeNull();
    h2cAcq.unmount();
    const c2hAcq = acqOf(asset(C2H));
    expect(c2hAcq.queryByTestId(ACQ_CARD)).toBeNull();
    c2hAcq.unmount();
    const c2hTr = trOf(asset(C2H));
    expect(c2hTr.queryByTestId(TR_CARD)).not.toBeNull();
  });

  it("비겸용(일반 주택·일반건물)은 미렌더", () => {
    for (const over of [{ isMixedUseHouse: false }, { assetKind: "building" as AssetForm["assetKind"] }]) {
      const { container, unmount } = render(
        <MixedUseHousingBuildingStdField asset={asset(over)} onChange={() => {}} timePoint="acq" />,
      );
      expect(container.innerHTML).toBe("");
      unmount();
    }
  });

  it("입력 → 해당 시점 필드 하나만 patch한다", () => {
    const onChange = vi.fn();
    const { getByTestId } = render(
      <>
        <MixedUseHousingBuildingStdField asset={asset()} onChange={onChange} timePoint="acq" />
        <MixedUseHousingBuildingStdField asset={asset()} onChange={onChange} timePoint="transfer" />
      </>,
    );
    fireEvent.change(getByTestId(ACQ_IN), { target: { value: "150000000" } });
    fireEvent.change(getByTestId(TR_IN), { target: { value: "400000000" } });
    expect(onChange.mock.calls.map((c) => Object.keys(c[0]))).toEqual([
      ["mixedAcqHousingBuildingStdPrice"],
      ["mixedTransferHousingBuildingStdPrice"],
    ]);
  });

  it("stale(필드 undefined) → 예외 없이 빈 칸", () => {
    const a = asset() as Partial<AssetForm>;
    delete a.mixedAcqHousingBuildingStdPrice;
    const { getByTestId } = render(
      <MixedUseHousingBuildingStdField asset={a as AssetForm} onChange={() => {}} timePoint="acq" />,
    );
    expect((getByTestId(ACQ_IN) as HTMLInputElement).value).toBe("");
  });
});

describe("모달 런처 계약 — 스냅샷 키 · 시점 · prefill", () => {
  it("취득: 키 `-mx-housing-acq` · applyTimePoint=acquisition · 연면적=주택 연면적(상가 아님) · 단가=상가부수토지 단가(한 필지)", () => {
    render(<MixedUseHousingBuildingStdField asset={asset()} onChange={() => {}} timePoint="acq" transferDate="2024-08-20" />);
    const l = launchers.at(-1)!;
    expect(l.snapshotKey).toBe("bsp-a1-mx-housing-acq");
    expect(l.applyTimePoint).toBe("acquisition");
    expect(l.prefill?.floorArea).toBe("100");
    expect(l.prefill?.acqLandPricePerSqm).toBe("1,200,000");
    expect(l.prefill?.acquisitionDate).toBe("2010-03-15");
    expect(l.prefill?.transferDate).toBe("2024-08-20");
  });

  it("양도: 키 `-mx-housing-transfer` · applyTimePoint=transfer · 토지 면적·양도시 단가", () => {
    render(<MixedUseHousingBuildingStdField asset={asset()} onChange={() => {}} timePoint="transfer" landArea={62.5} />);
    const l = launchers.at(-1)!;
    expect(l.snapshotKey).toBe("bsp-a1-mx-housing-transfer");
    expect(l.applyTimePoint).toBe("transfer");
    expect(l.prefill?.floorArea).toBe("100");
    expect(l.prefill?.landAreaM2).toBe("62.5");
    expect(l.prefill?.transferLandPricePerSqm).toBe("5,000,000");
  });

  it("주택→상가 취득시 연면적 = 주택+상가 합(취득시 전체가 주택) · 양도시는 주택 연면적", () => {
    render(<MixedUseHousingBuildingStdField asset={asset(H2C)} onChange={() => {}} timePoint="acq" />);
    expect(launchers.at(-1)!.prefill?.floorArea).toBe("160");
    cleanup();
    render(<MixedUseHousingBuildingStdField asset={asset(H2C)} onChange={() => {}} timePoint="transfer" />);
    expect(launchers.at(-1)!.prefill?.floorArea).toBe("100");
  });

  it("별개 취득(B0): 취득시 단가 prefill은 건물 취득일 기준 칸(B0) 값 — 토지 취득일 값은 넘기지 않는다", () => {
    const sep = {
      hasSeperateLandAcquisitionDate: true,
      landAcquisitionDate: "2005-06-10",
      mixedAcqLandPricePerSqmAtBuildingAcq: "1,800,000",
    };
    render(<MixedUseHousingBuildingStdField asset={asset(sep)} onChange={() => {}} timePoint="acq" />);
    expect(launchers.at(-1)!.prefill?.acqLandPricePerSqm).toBe("1,800,000");
    cleanup();
    // B0 칸이 열려 있지 않으면(H 없음 → B0 술어 거짓, 상속) 토지 취득일 값(1,200,000)을 대신 넘기지 않는다
    render(
      <MixedUseHousingBuildingStdField
        asset={asset({ ...sep, acquisitionCause: "inheritance", mixedAcqHousingPrice: "" })}
        onChange={() => {}}
        timePoint="acq"
      />,
    );
    expect(launchers.at(-1)!.prefill?.acqLandPricePerSqm).toBeUndefined();
  });

  it("모달 적용 → 해당 시점 필드 patch (String)", () => {
    const onChange = vi.fn();
    render(<MixedUseHousingBuildingStdField asset={asset()} onChange={onChange} timePoint="acq" />);
    launchers.at(-1)!.onApply?.(123_456_789);
    expect(onChange).toHaveBeenCalledWith({ mixedAcqHousingBuildingStdPrice: "123456789" });
  });
});

describe("레이아웃 삽입 — AssetMajor · Legacy (DOM 순서 = 계산 순서)", () => {
  const major = (a: AssetForm) =>
    render(
      <MixedUseAssetMajorStdPrice asset={a} onChange={() => {}} transferDate="2024-08-20" useEstimatedAcquisition housingSectionNum={2} commercialSectionNum={3} />,
    );
  const legacy = (a: AssetForm) =>
    render(<MixedUseLegacyStdPrice asset={a} onChange={() => {}} transferDate="2024-08-20" useEstimatedAcquisition />);
  const after = (a: Element, b: Element) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

  it("AssetMajor: 취득 N은 취득시 개별주택공시가격 뒤·양도시 박스 앞, 양도 N은 양도시 개별주택공시가격 뒤·③ 상가 앞", () => {
    const { getByTestId, container } = major(asset());
    const hAcq = container.querySelector('[data-field="mixedAcqHousingPrice"]')!;
    const hTr = container.querySelector('[data-field="mixedTransferHousingPrice"]')!;
    const commercial = container.querySelector('[data-field="mixedAcqCommercialBuildingPrice"]')!;
    expect(after(hAcq, getByTestId(ACQ_CARD))).toBe(true);
    expect(after(getByTestId(ACQ_CARD), hTr)).toBe(true);
    expect(after(hTr, getByTestId(TR_CARD))).toBe(true);
    expect(after(getByTestId(TR_CARD), commercial)).toBe(true);
  });

  it("AssetMajor: PHD ON이면 둘 다 없다 / 끄면 다시 둘 다 있다 (부정·긍정 짝)", () => {
    const on = major(asset({ usePreHousingDisclosure: true }));
    expect(on.queryByTestId(ACQ_CARD)).toBeNull();
    expect(on.queryByTestId(TR_CARD)).toBeNull();
    on.unmount();
    const off = major(asset());
    expect(off.queryByTestId(ACQ_CARD)).not.toBeNull();
    expect(off.queryByTestId(TR_CARD)).not.toBeNull();
  });

  it("AssetMajor: 각 카드는 정확히 1개 (testid 유일)", () => {
    const { getAllByTestId } = major(asset());
    expect(getAllByTestId(ACQ_CARD)).toHaveLength(1);
    expect(getAllByTestId(TR_CARD)).toHaveLength(1);
    expect(getAllByTestId(ACQ_IN)).toHaveLength(1);
  });

  it("Legacy 주택→상가: 둘 다 / 상가→주택: 양도만 (취득 칸 없음)", () => {
    const h2c = legacy(asset(H2C));
    expect(h2c.queryByTestId(ACQ_CARD)).not.toBeNull();
    expect(h2c.queryByTestId(TR_CARD)).not.toBeNull();
    h2c.unmount();
    const c2h = legacy(asset(C2H));
    expect(c2h.queryByTestId(ACQ_CARD)).toBeNull();
    expect(c2h.queryByTestId(TR_CARD)).not.toBeNull();
  });

  it("Legacy: 취득 N은 취득 개별주택공시가격 뒤, 양도 N은 양도 개별주택공시가격 뒤", () => {
    const { getByTestId, container } = legacy(asset(H2C));
    const hAcq = container.querySelector('[data-field="mixedAcqHousingPrice"]')!;
    const hTr = container.querySelector('[data-field="mixedTransferHousingPrice"]')!;
    expect(after(hAcq, getByTestId(ACQ_CARD))).toBe(true);
    expect(after(hTr, getByTestId(TR_CARD))).toBe(true);
  });
});
