/**
 * @vitest-environment jsdom
 *
 * A2 ⑤ — 일반건물 감정가액·매매사례가액 개방 UI (설계서 §3 · 계획서 §4 A-통합)
 *
 * 고정 계약:
 *   P-1 파트 라디오 4종(실거래가·환산취득가·감정가액·매매사례가액) + testid
 *   P-2 원인별 필터 — 상속·증여 1종 / 이월과세 {실거래가, 환산취득가}(감정·매매사례 비노출) / 매매·신축 4종
 *   P-3 파트 금액칸 — 감정=`gb-*-apr-price`·매매사례=`gb-*-sc-value`, 개산공제만 인정 안내(`gb-deduction-only-notice`)
 *   P-4 원인 전환 patch — 허용되지 않는 모드면 같은 patch에 명시 actual
 *   A-1 자산 단위 라디오 4종 + 증축이면 감정·매매사례 disabled + 금액칸(`gb-asset-sc-value`, 단일 기준시가 칸 없음)
 *   T-1 분리 ON patch — 레거시 감정 → 명시 파트 모드 승격 + 두 플래그 소거
 *   T-2 분리 OFF — 지울 입력이 없으면 즉시, 있으면 Dialog(취소=불변 · 확정=소거 patch)
 *   B-1 §114조의2 배지 — 감정도 대상(≥2020), 매매사례는 비대상
 *   H-1 주택 split 거동 불변
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within, waitFor } from "@testing-library/react";
import { GeneralBuildingAcquisitionCards } from "@/components/calc/transfer/GeneralBuildingAcquisitionCards";
import { GeneralBuildingBlock } from "@/components/calc/transfer/GeneralBuildingBlock";
import { CompanionAcqPurchaseBlock } from "@/components/calc/transfer/CompanionAcqPurchaseBlock";
import { AssetSectionExpense } from "@/components/calc/transfer/asset-sections/AssetSectionExpense";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { gbSeparateOffPartClearPatch } from "@/lib/calc/transfer-tax-gb-toggle-patches";

afterEach(cleanup);

const LAND = "1999-05-24";
const BUILDING = "2015-03-01";

function gbAsset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "general_building",
    acquisitionCause: "purchase",
    gbBuildingAcquisitionCause: "purchase",
    acquisitionDate: LAND,
    landAcquisitionDate: LAND,
    hasSeperateLandAcquisitionDate: false,
    ...over,
  } as AssetForm;
}
const ON: Partial<AssetForm> = {
  hasSeperateLandAcquisitionDate: true,
  landAcquisitionDate: LAND,
  acquisitionDate: BUILDING,
};

function renderCards(over: Partial<AssetForm> = {}, transferDate = "2026-02-16") {
  const onChange = vi.fn();
  render(<GeneralBuildingAcquisitionCards asset={gbAsset(over)} onChange={onChange} transferDate={transferDate} />);
  return onChange;
}
const labelsOf = (testId: string) =>
  within(screen.getByTestId(testId))
    .getAllByRole("radio")
    .map((r) => r.closest("label")?.textContent?.trim() ?? "");

describe("P-1·P-2 — 파트 라디오 4종 + 원인별 필터", () => {
  it("매매 파트 — 4종, 라벨은 주택 split과 같다", () => {
    renderCards(ON);
    expect(labelsOf("gb-part-acq-mode-land")).toEqual(["실거래가", "환산취득가", "감정가액", "매매사례가액"]);
    expect(labelsOf("gb-part-acq-mode-building")).toEqual(["실거래가", "환산취득가", "감정가액", "매매사례가액"]);
  });

  it("옵션별 testid — gb-{part}-acq-mode-{actual|estimated|appraisal|salescase}", () => {
    renderCards(ON);
    for (const m of ["actual", "estimated", "appraisal", "salescase"]) {
      expect(screen.getByTestId(`gb-land-acq-mode-${m}`)).toBeTruthy();
      expect(screen.getByTestId(`gb-building-acq-mode-${m}`)).toBeTruthy();
    }
  });

  it("신축(자가건축) 건물 파트도 4종 (Q-D — 주택 신축과 대칭)", () => {
    renderCards({ ...ON, gbBuildingAcquisitionCause: "newConstruction" });
    expect(labelsOf("gb-part-acq-mode-building")).toHaveLength(4);
  });

  it.each(["inheritance", "gift"] as const)("%s 파트 — 실거래가 1종", (cause) => {
    renderCards({ ...ON, acquisitionCause: cause, gbBuildingAcquisitionCause: cause });
    expect(labelsOf("gb-part-acq-mode-land")).toEqual(["실거래가"]);
    expect(labelsOf("gb-part-acq-mode-building")).toEqual(["실거래가"]);
  });

  it("이월과세 파트 — 현행 {실거래가, 환산취득가} 유지, 감정·매매사례만 비노출 (A-통합 Q-A)", () => {
    renderCards({ ...ON, acquisitionCause: "carryover_gift", gbBuildingAcquisitionCause: "carryover_gift" });
    expect(labelsOf("gb-part-acq-mode-land")).toEqual(["실거래가", "환산취득가"]);
    expect(labelsOf("gb-part-acq-mode-building")).toEqual(["실거래가", "환산취득가"]);
  });

  it("앵커 `landAcqMode`·`buildingAcqMode`는 필터 후에도 항상 렌더된다 (⑧ 필드 점프)", () => {
    renderCards({ ...ON, acquisitionCause: "inheritance", gbBuildingAcquisitionCause: "inheritance", landAcqMode: "estimated" });
    expect(document.querySelector('[data-field="landAcqMode"]')).toBeTruthy();
    expect(document.querySelector('[data-field="buildingAcqMode"]')).toBeTruthy();
  });

  it("파트 라디오는 해당 파트의 명시 모드 하나만 기록한다 — 감정가액", () => {
    const onChange = renderCards(ON);
    fireEvent.click(screen.getByTestId("gb-land-acq-mode-appraisal"));
    expect(onChange).toHaveBeenCalledWith({ landAcqMode: "appraisal" });
    fireEvent.click(screen.getByTestId("gb-building-acq-mode-salescase"));
    expect(onChange).toHaveBeenCalledWith({ buildingAcqMode: "salesCase" });
  });
});

describe("P-3 — 파트 금액칸·개산공제 안내", () => {
  it("actual → gb-*-act-price 만, 안내 없음", () => {
    renderCards({ ...ON, landAcqMode: "actual", buildingAcqMode: "actual" });
    expect(screen.getByTestId("gb-land-act-price")).toBeTruthy();
    expect(screen.queryByTestId("gb-land-apr-price")).toBeNull();
    expect(screen.queryByTestId("gb-deduction-only-notice")).toBeNull();
  });

  it("감정 → gb-*-apr-price (`*AcquisitionPrice` 슬롯) + 개산공제 안내", () => {
    const onChange = renderCards({ ...ON, landAcqMode: "appraisal", buildingAcqMode: "actual" });
    const input = screen.getByTestId("gb-land-apr-price") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "300000000" } });
    expect(onChange).toHaveBeenCalledWith({ landAcquisitionPrice: "300000000" });
    expect(screen.queryByTestId("gb-land-act-price")).toBeNull();
    expect(screen.getByTestId("gb-deduction-only-notice").textContent).toContain("개산공제");
  });

  it("매매사례 → gb-*-sc-value (`*SalesCaseValue` 슬롯, 감정 슬롯과 다른 필드)", () => {
    const onChange = renderCards({ ...ON, landAcqMode: "actual", buildingAcqMode: "salesCase" });
    fireEvent.change(screen.getByTestId("gb-building-sc-value"), { target: { value: "150000000" } });
    expect(onChange).toHaveBeenCalledWith({ buildingSalesCaseValue: "150000000" });
    expect(screen.queryByTestId("gb-building-apr-price")).toBeNull();
  });

  it("환산 → 금액칸·안내 없음 (기준시가가 분자)", () => {
    renderCards({ ...ON, landAcqMode: "estimated", buildingAcqMode: "estimated" });
    expect(screen.queryByTestId("gb-land-act-price")).toBeNull();
    expect(screen.queryByTestId("gb-land-apr-price")).toBeNull();
    expect(screen.queryByTestId("gb-land-sc-value")).toBeNull();
    expect(screen.queryByTestId("gb-deduction-only-notice")).toBeNull();
  });
});

describe("P-4 — 취득원인 전환 patch", () => {
  it("감정 파트 → 상속: 같은 patch에 명시 landAcqMode:'actual' (비우지 않는다)", () => {
    const onChange = renderCards({ ...ON, landAcqMode: "appraisal" });
    const causeGroup = document.querySelector('[data-field="acquisitionCause"]') as HTMLElement;
    fireEvent.click(within(causeGroup).getByText("상속"));
    expect(onChange).toHaveBeenCalledWith({ acquisitionCause: "inheritance", landAcqMode: "actual" });
  });

  it("(긍정 짝) 실거래가 파트 → 상속: 모드 patch 없음", () => {
    const onChange = renderCards({ ...ON, landAcqMode: "actual" });
    const causeGroup = document.querySelector('[data-field="acquisitionCause"]') as HTMLElement;
    fireEvent.click(within(causeGroup).getByText("상속"));
    expect(onChange).toHaveBeenCalledWith({ acquisitionCause: "inheritance" });
  });

  it("환산 파트 → 이월과세: 허용되는 모드라 건드리지 않는다 / 감정 → 이월과세: actual", () => {
    let onChange = renderCards({ ...ON, landAcqMode: "estimated" });
    let causeGroup = document.querySelector('[data-field="acquisitionCause"]') as HTMLElement;
    fireEvent.click(within(causeGroup).getByText("이월과세(증여)"));
    expect(onChange).toHaveBeenCalledWith({ acquisitionCause: "carryover_gift" });
    cleanup();
    onChange = renderCards({ ...ON, landAcqMode: "salesCase" });
    causeGroup = document.querySelector('[data-field="acquisitionCause"]') as HTMLElement;
    fireEvent.click(within(causeGroup).getByText("이월과세(증여)"));
    expect(onChange).toHaveBeenCalledWith({ acquisitionCause: "carryover_gift", landAcqMode: "actual" });
  });

  it("건물 파트 감정 → 증여: 건물 모드 actual", () => {
    const onChange = renderCards({ ...ON, buildingAcqMode: "appraisal" });
    const g = document.querySelector('[data-field="gbBuildingAcquisitionCause"]') as HTMLElement;
    fireEvent.click(within(g).getByText("증여"));
    expect(onChange).toHaveBeenCalledWith({ gbBuildingAcquisitionCause: "gift", buildingAcqMode: "actual" });
  });
});

describe("A-1 — 자산 단위(분리 OFF) 라디오 4종", () => {
  it("일반건물도 4종 — 실거래가·환산취득가·감정가액·매매사례가액", () => {
    renderCards();
    expect(labelsOf("gb-asset-acq-mode").map((t) => t.replace(/(계약서|양도가|개산|§).*$/, "").trim())).toEqual([
      "실거래가",
      "환산취득가",
      "감정가액",
      "매매사례가액",
    ]);
  });

  it("옵션 value·name은 종전 그대로 (E2E 셀렉터 `name^=acqBasisMode][value=…]`)", () => {
    renderCards();
    for (const v of ["actual", "estimated", "appraisal", "sales_case"]) {
      expect(document.querySelector(`input[name^="acqBasisMode"][value="${v}"]`)).toBeTruthy();
    }
  });

  it("매매사례 선택 — 단일 키 patch로 isSalesCaseAcquisition만 켠다(감정 플래그는 끈다)", () => {
    const onChange = renderCards();
    fireEvent.click(document.querySelector('input[name^="acqBasisMode"][value="sales_case"]') as HTMLElement);
    expect(onChange).toHaveBeenCalledWith({ isSalesCaseAcquisition: true });
    expect(onChange).toHaveBeenCalledWith({ isAppraisalAcquisition: false });
    expect(onChange).toHaveBeenCalledWith({ useEstimatedAcquisition: false });
  });

  it("매매사례 금액칸 = 단순 CurrencyInput(similarSalesValue) — RTMS·단일 취득시 기준시가 칸은 숨긴다", () => {
    const onChange = renderCards({ isSalesCaseAcquisition: true });
    expect(document.querySelector('[data-field="standardPriceAtAcq"]')).toBeNull();
    expect(screen.queryByText(/RTMS|실거래가 조회|자동조회/)).toBeNull();
    fireEvent.change(screen.getByTestId("gb-asset-sc-value"), { target: { value: "420000000" } });
    expect(onChange).toHaveBeenCalledWith({ similarSalesValue: "420000000" });
    expect(document.querySelector('[data-field="similarSalesValue"]')).toBeTruthy();
  });

  it("감정 금액칸 = fixedAcquisitionPrice — 단일 취득시 기준시가 칸 없음(개산공제 base는 ①②의 두 칸)", () => {
    const onChange = renderCards({ isAppraisalAcquisition: true });
    fireEvent.change(screen.getByTestId("fixed-acquisition-price"), { target: { value: "410000000" } });
    expect(onChange).toHaveBeenCalledWith({ fixedAcquisitionPrice: "410000000" });
    expect(document.querySelector('[data-field="standardPriceAtAcq"]')).toBeNull();
  });

  it("증축이 있으면 감정·매매사례 옵션은 disabled(숨김 아님) + 사유 hint, 실거래가·환산은 그대로 (Q-A3)", () => {
    renderCards({ gbHasExtension: true });
    const radio = (v: string) => document.querySelector(`input[name^="acqBasisMode"][value="${v}"]`) as HTMLInputElement;
    expect(radio("appraisal").disabled).toBe(true);
    expect(radio("sales_case").disabled).toBe(true);
    expect(radio("actual").disabled).toBe(false);
    expect(radio("estimated").disabled).toBe(false);
    expect(screen.getAllByText(/증축분이 있으면 원건물을 감정가액·매매사례가액으로 산정할 수 없습니다/).length).toBeGreaterThan(0);
  });

  it("(긍정 짝) 증축이 없으면 감정·매매사례 옵션이 활성이다", () => {
    renderCards({ gbHasExtension: false });
    const r = document.querySelector('input[name^="acqBasisMode"][value="appraisal"]') as HTMLInputElement;
    expect(r.disabled).toBe(false);
  });

  it("분리 ON이면 자산 단위 라디오는 숨는다 (파트 라디오가 대신)", () => {
    renderCards(ON);
    expect(screen.queryByTestId("gb-asset-acq-mode")).toBeNull();
  });
});

describe("A-2 — 자산 단위 필요경비 안내 (AssetSectionExpense)", () => {
  const renderExpense = (over: Partial<AssetForm>) =>
    render(<AssetSectionExpense asset={gbAsset(over)} onChange={() => {}} />);

  it.each([{ isAppraisalAcquisition: true }, { isSalesCaseAcquisition: true }])("일반건물 분리 OFF %o — 개산공제만 인정 안내", (over) => {
    renderExpense(over);
    expect(screen.getByTestId("gb-deduction-only-notice")).toBeTruthy();
  });

  it("(긍정 짝) 실가·환산 / 일반건물 아님 / 분리 ON(파트 카드가 안내) 은 안내 없음", () => {
    renderExpense({});
    expect(screen.queryByTestId("gb-deduction-only-notice")).toBeNull();
    cleanup();
    renderExpense({ useEstimatedAcquisition: true });
    expect(screen.queryByTestId("gb-deduction-only-notice")).toBeNull();
    cleanup();
    render(<AssetSectionExpense asset={{ ...gbAsset({ isAppraisalAcquisition: true }), assetKind: "housing" } as AssetForm} onChange={() => {}} />);
    expect(screen.queryByTestId("gb-deduction-only-notice")).toBeNull();
    cleanup();
    renderExpense({ ...ON, isAppraisalAcquisition: true, landAcqMode: "actual", buildingAcqMode: "actual" });
    expect(screen.queryByTestId("gb-deduction-only-notice")).toBeNull();
  });
});

describe("T — 분리 토글 전환", () => {
  // hidden:true — Dialog가 열려 있는 동안 배경이 aria-hidden이어도 토글을 집을 수 있게 한다.
  const toggle = () => screen.getByRole("switch", { name: /토지·건물 취득일 다름/, hidden: true });

  it("T-1 ON: 자산 단위 감정 → 명시 파트 모드로 승격 + 숨은 감정·매매사례 플래그 소거 (한 덩어리 patch)", () => {
    const onChange = renderCards({ isAppraisalAcquisition: true, fixedAcquisitionPrice: "410000000" });
    fireEvent.click(toggle());
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({
      hasSeperateLandAcquisitionDate: true,
      landAcqMode: "appraisal",
      buildingAcqMode: "appraisal",
      isAppraisalAcquisition: false,
      isSalesCaseAcquisition: false,
    });
  });

  it("T-1b ON: 매매사례도 승격 / 환산·실가는 파생값 그대로 / useEstimatedAcquisition은 건드리지 않는다", () => {
    let onChange = renderCards({ isSalesCaseAcquisition: true });
    fireEvent.click(toggle());
    expect(onChange.mock.calls[0][0]).toMatchObject({ landAcqMode: "salesCase", buildingAcqMode: "salesCase" });
    cleanup();
    onChange = renderCards({ useEstimatedAcquisition: true });
    fireEvent.click(toggle());
    expect(onChange.mock.calls[0][0]).toMatchObject({ landAcqMode: "estimated", buildingAcqMode: "estimated" });
    expect(onChange.mock.calls[0][0]).not.toHaveProperty("useEstimatedAcquisition");
  });

  it("T-1c ON 승격은 stale 명시 파트 모드가 아니라 분리 OFF 화면이 보여 준 레거시 파생값을 쓴다", () => {
    const onChange = renderCards({ landAcqMode: "estimated", buildingAcqMode: "estimated", isAppraisalAcquisition: true });
    fireEvent.click(toggle());
    expect(onChange.mock.calls[0][0]).toMatchObject({ landAcqMode: "appraisal", buildingAcqMode: "appraisal" });
  });

  it("T-2 OFF — 지울 입력이 없으면 Dialog 없이 즉시 전환(소거 patch 포함)", () => {
    const onChange = renderCards({ ...ON, landAcqMode: "actual", buildingAcqMode: "actual" });
    fireEvent.click(toggle());
    expect(screen.queryByText(/삭제하고 끄기/)).toBeNull();
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ hasSeperateLandAcquisitionDate: false, ...gbSeparateOffPartClearPatch() }));
  });

  it("T-2b OFF — 입력한 파트 값이 있으면 Dialog를 먼저 띄우고 토글·데이터는 불변", async () => {
    const onChange = renderCards({ ...ON, landAcqMode: "appraisal", landAcquisitionPrice: "300000000" });
    fireEvent.click(toggle());
    expect(await screen.findByText("삭제하고 끄기")).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
    expect((toggle() as HTMLElement).getAttribute("aria-checked")).toBe("true");
  });

  it("T-2c Dialog 취소 → 불변 / 확정 → 소거 patch 한 덩어리", async () => {
    const onChange = renderCards({ ...ON, buildingAcqMode: "salesCase", buildingSalesCaseValue: "150000000" });
    fireEvent.click(toggle());
    fireEvent.click(await screen.findByText("취소"));
    await waitFor(() => expect(screen.queryByText("삭제하고 끄기")).toBeNull());
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.click(toggle());
    fireEvent.click(await screen.findByTestId("confirm-dialog-confirm"));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toMatchObject({
      hasSeperateLandAcquisitionDate: false,
      buildingSalesCaseValue: "",
      buildingAcqMode: "",
      landAcqMode: "",
      landAcquisitionPrice: "",
      landDirectExpenses: "",
    });
  });

  it("T-2d OFF — 파트 자본적지출만 있어도 Dialog (소거 대상)", async () => {
    const onChange = renderCards({ ...ON, landAcqMode: "actual", buildingAcqMode: "actual", buildingDirectExpenses: "5000000" });
    fireEvent.click(toggle());
    expect(await screen.findByText("삭제하고 끄기")).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("T-3 OFF 이월과세 — 감정·매매사례 플래그도 같은 patch에서 비운다 (R8의 짝: 이월과세 카드에는 끌 라디오가 없다)", () => {
    const onChange = renderCards({
      ...ON,
      acquisitionCause: "carryover_gift",
      gbBuildingAcquisitionCause: "carryover_gift",
      isAppraisalAcquisition: true,
    });
    fireEvent.click(toggle());
    expect(onChange.mock.calls[0][0]).toMatchObject({ isAppraisalAcquisition: false, isSalesCaseAcquisition: false });
  });
});

describe("B-1 — §114조의2 배지 (엔진 leaf 공유)", () => {
  const NEW = { ...ON, gbBuildingAcquisitionCause: "newConstruction", acquisitionDate: "2024-06-01" } as Partial<AssetForm>;

  it("환산 — 양도일 ≥ 2018-01-01이면 환산 문구", () => {
    renderCards({ ...NEW, buildingAcqMode: "estimated" });
    expect(screen.getByText(/환산취득가액 가산세 적용 대상/)).toBeTruthy();
  });

  it("감정 — 양도일 ≥ 2020-01-01이면 감정 문구", () => {
    renderCards({ ...NEW, buildingAcqMode: "appraisal" });
    expect(screen.getByText(/감정가액 가산세 적용 대상 — 건물 감정가액의 5%/)).toBeTruthy();
  });

  it("감정 — 양도일 2019년이면 비대상 (엔진 두 게이트: 환산 2018 · 감정 2020)", () => {
    renderCards({ ...NEW, acquisitionDate: "2017-06-01", buildingAcqMode: "appraisal" }, "2019-06-01");
    expect(screen.queryByText(/가산세 적용 대상/)).toBeNull();
  });

  it("(긍정 짝) 같은 양도일 2019년에 환산은 대상이다", () => {
    renderCards({ ...NEW, acquisitionDate: "2017-06-01", buildingAcqMode: "estimated" }, "2019-06-01");
    expect(screen.getByText(/환산취득가액 가산세 적용 대상/)).toBeTruthy();
  });

  it("매매사례·실가는 조문 문언에 없어 비대상", () => {
    renderCards({ ...NEW, buildingAcqMode: "salesCase" });
    expect(screen.queryByText(/가산세 적용 대상/)).toBeNull();
    cleanup();
    renderCards({ ...NEW, buildingAcqMode: "actual" });
    expect(screen.queryByText(/가산세 적용 대상/)).toBeNull();
  });
});

describe("C — 취득시 기준시가 카드 노출 (`GeneralBuildingBlock` — ⑧이 요구하는 칸이 화면에 있다)", () => {
  const acqStdCards = (a: AssetForm) => {
    render(<GeneralBuildingBlock asset={a} onChange={() => {}} transferDate="2026-02-16" />);
    return document.querySelectorAll('[data-gb-stdprice="acq"]').length;
  };

  it("분리 ON 감정·매매사례 파트 → 열린다 (종전에는 환산·증축일 때만 열려 막다른 길)", () => {
    expect(acqStdCards(gbAsset({ ...ON, landAcqMode: "appraisal", buildingAcqMode: "actual" }))).toBeGreaterThan(0);
    cleanup();
    expect(acqStdCards(gbAsset({ ...ON, landAcqMode: "actual", buildingAcqMode: "salesCase" }))).toBeGreaterThan(0);
  });

  it("(긍정 짝) 분리 ON 두 파트 실가 → 닫힌다 (시점별 런처 숨김 회귀 방지)", () => {
    expect(acqStdCards(gbAsset({ ...ON, landAcqMode: "actual", buildingAcqMode: "actual" }))).toBe(0);
  });

  it("분리 OFF + 레거시 감정 → 열린다 / stale explicit 환산(플래그 없음) → 닫힌다 (`gbPartModes`)", () => {
    expect(acqStdCards(gbAsset({ isAppraisalAcquisition: true }))).toBeGreaterThan(0);
    cleanup();
    expect(acqStdCards(gbAsset({ landAcqMode: "estimated", buildingAcqMode: "estimated" }))).toBe(0);
  });
});

describe("H — 주택 split 거동 불변", () => {
  it("housing 자산 단위 라디오는 종전 4종이고 일반건물 전용 testid·증축 disabled가 새지 않는다", () => {
    const a = { ...makeDefaultAsset(1), assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2015-01-08" } as AssetForm;
    render(
      <CompanionAcqPurchaseBlock
        assetKind="housing"
        asset={a}
        onAssetChange={() => {}}
        acquisitionDate={a.acquisitionDate}
        onAcquisitionDateChange={() => {}}
        useEstimatedAcquisition={false}
        onUseEstimatedChange={() => {}}
        isAppraisalAcquisition={false}
        onIsAppraisalAcquisitionChange={() => {}}
        isSalesCaseAcquisition={false}
        onIsSalesCaseAcquisitionChange={() => {}}
        gbHasExtension
        fixedAcquisitionPrice=""
        onFixedAcquisitionPriceChange={() => {}}
        standardPriceAtAcq=""
        onStandardPriceAtAcqChange={() => {}}
        standardPriceAtTransfer=""
        onStandardPriceAtTransferChange={() => {}}
        transferDate="2026-02-16"
      />,
    );
    expect(screen.queryByTestId("gb-asset-acq-mode")).toBeNull();
    for (const v of ["actual", "estimated", "appraisal", "sales_case"]) {
      const r = document.querySelector(`input[name^="acqBasisMode"][value="${v}"]`) as HTMLInputElement;
      expect(r, v).toBeTruthy();
      expect(r.disabled, `${v} — 일반건물 증축 차단은 housing에 적용되지 않는다`).toBe(false);
    }
  });
});
