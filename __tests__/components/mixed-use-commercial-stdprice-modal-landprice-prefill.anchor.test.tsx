/**
 * 겸용주택 상가건물 기준시가 모달 — 개별공시지가 prefill anchor.
 *
 * 계획서: docs/02-design/features/mixed-use-commercial-stdprice-modal-landprice-prefill.plan.md
 *
 * 부모 화면·주택분 PHD 배치 모달에서 이미 입력한 ㎡당 개별공시지가를 상가 모달이 읽어와
 * 이중 입력을 없앤다. 단, 취득시는 **트랙이 갈린다**(§164⑤):
 *  - 취득 ≤2000 → 모달 칸은 2001.1.1 기준 → phdLandPricePerSqmAtAcq2001만 주입(취득당시 값 금지)
 *  - 취득 ≥2001 → 취득당시 연도 값 주입
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

afterEach(cleanup);
import { BuildingStdPriceModalButton } from "@/components/calc/building-std-price/BuildingStdPriceModalButton";
import { MixedUseAssetMajorStdPrice } from "@/components/calc/transfer/mixed-use/MixedUseAssetMajorStdPrice";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";

const ADDR = {
  road: "서울특별시 서초구 남부순환로297나길 13",
  jibun: "방배동 593-64",
  building: "방배동 상가주택",
  detail: "",
  lng: "126.993824",
  lat: "37.475198",
};

const AT_ACQ = "1000000"; // 취득당시(1997년) 공시지가 — 토지값 트랙
const AT_2001 = "1200000"; // 2001.1.1 현재 공시지가 — 위치지수 트랙
const AT_TRANSFER = "6216000"; // 양도당시 공시지가

const openModal = () => fireEvent.click(screen.getByRole("button", { name: "건물 기준시가 계산" }));

describe("상가 모달 prefill — 양도당시 개별공시지가", () => {
  it("부모 양도 공시지가가 모달 양도칸에 자동 채움", async () => {
    render(
      <BuildingStdPriceModalButton
        lockedTaxType="transfer"
        initialAddress={ADDR}
        prefill={{
          floorArea: "283.06",
          landAreaM2: "78.01",
          acquisitionDate: "1997-09-12",
          transferDate: "2026-02-16",
          transferLandPricePerSqm: AT_TRANSFER,
        }}
        onApplyBoth={() => {}}
      />,
    );
    openModal();
    expect(await screen.findByDisplayValue("6,216,000")).toBeTruthy();
  });
});

describe("상가 모달 prefill — 취득당시 개별공시지가 (§164⑤ 트랙 분기)", () => {
  it("케이스 1: 취득 1997 + 2001값 있음 → 2001값 주입 (취득당시 값은 미주입)", async () => {
    render(
      <BuildingStdPriceModalButton
        lockedTaxType="transfer"
        initialAddress={ADDR}
        prefill={{
          acquisitionDate: "1997-09-12",
          transferDate: "2026-02-16",
          acqLandPricePerSqm: AT_ACQ,
          acqLandPricePerSqm2001: AT_2001,
          transferLandPricePerSqm: AT_TRANSFER,
        }}
        onApplyBoth={() => {}}
      />,
    );
    openModal();
    // 2001.1.1 기준값이 위치지수 칸에 채워짐
    expect(await screen.findByDisplayValue("1,200,000")).toBeTruthy();
    // 취득당시 연도 값(토지값 트랙)은 절대 새면 안 됨
    expect(screen.queryByDisplayValue("1,000,000")).toBeNull();
  });

  it("케이스 2: 취득 1997 + 2001값 없음 → 취득칸 빈 값 (취득당시 값 대체 주입 금지)", async () => {
    render(
      <BuildingStdPriceModalButton
        lockedTaxType="transfer"
        initialAddress={ADDR}
        prefill={{
          acquisitionDate: "1997-09-12",
          transferDate: "2026-02-16",
          acqLandPricePerSqm: AT_ACQ,
          transferLandPricePerSqm: AT_TRANSFER,
        }}
        onApplyBoth={() => {}}
      />,
    );
    openModal();
    expect(await screen.findByDisplayValue("6,216,000")).toBeTruthy();
    expect(screen.queryByDisplayValue("1,000,000")).toBeNull();
    expect(screen.queryByDisplayValue("1,200,000")).toBeNull();
  });

  it("케이스 4: 취득 2005 → 취득당시 값 주입 (2001값은 미주입)", async () => {
    render(
      <BuildingStdPriceModalButton
        lockedTaxType="transfer"
        initialAddress={ADDR}
        prefill={{
          acquisitionDate: "2005-03-10",
          transferDate: "2026-02-16",
          acqLandPricePerSqm: AT_ACQ,
          acqLandPricePerSqm2001: AT_2001,
          transferLandPricePerSqm: AT_TRANSFER,
        }}
        onApplyBoth={() => {}}
      />,
    );
    openModal();
    expect(await screen.findByDisplayValue("1,000,000")).toBeTruthy();
    expect(screen.queryByDisplayValue("1,200,000")).toBeNull();
  });

  it("케이스 6: 공시지가 전부 미지정 → 미주입(기존 빈 값 미주입 규약 유지)", async () => {
    render(
      <BuildingStdPriceModalButton
        lockedTaxType="transfer"
        initialAddress={ADDR}
        prefill={{ acquisitionDate: "2005-03-10", transferDate: "2026-02-16", landAreaM2: "78.01" }}
        onApplyBoth={() => {}}
      />,
    );
    openModal();
    expect(await screen.findByDisplayValue("78.01")).toBeTruthy();
    expect(screen.queryByDisplayValue("1,000,000")).toBeNull();
    expect(screen.queryByDisplayValue("6,216,000")).toBeNull();
  });
});

/**
 * 두 번째 축 — 토지 취득일 ↔ 건물 취득일 분리(§166⑥).
 *
 * 겸용은 `acquisitionDate`=건물 취득일 / `landAcquisitionDate`=토지 취득일 이원 구조다.
 * 화면의 상가부수토지 공시지가는 **토지 취득일** 기준(`acqLandReferenceDate`, PR#598)이고,
 * 모달 취득 위치지수 칸은 **건물 취득일** 기준(`BuildingStdPriceForm.tsx:464` landRefFromEvent).
 * 두 날짜가 다르면 연도가 달라 **다른 값**이므로 주입하면 위치지수 오산 → 상가건물 기준시가 오류.
 * 종전(prefill 이전)에는 빈 값이라 사용자가 직접 입력했다 → 침묵 오입력 회귀 방지.
 */
function mixedAssetSplitDates(over: Partial<ReturnType<typeof makeDefaultAsset>> = {}) {
  return {
    ...makeDefaultAsset(1),
    assetKind: "housing" as const,
    isMixedUseHouse: true,
    hasSeperateLandAcquisitionDate: true,
    acquisitionDate: "2012-03-01", // 건물 취득일
    landAcquisitionDate: "2005-06-10", // 토지 취득일 (≠ 건물일)
    residentialFloorArea: "100",
    nonResidentialFloorArea: "100",
    mixedUseTotalLandArea: "200",
    buildingFootprintArea: "100",
    mixedAcqLandPricePerSqm: "2280000", // 토지 취득일(2005) 기준 값
    mixedTransferLandPricePerSqm: "6216000",
    ...over,
  };
}

describe("상가 모달 prefill — 토지·건물 취득일 분리 축 (§166⑥)", () => {
  it("토지일 ≠ 건물일 → 취득 공시지가 미주입 (토지일 기준 값을 건물일 연도에 주입 금지)", async () => {
    render(
      <MixedUseAssetMajorStdPrice
        asset={mixedAssetSplitDates()}
        onChange={() => {}}
        transferDate="2026-02-16"
        useEstimatedAcquisition
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "건물 기준시가 계산" }));
    // 모달 취득 위치지수 칸에 토지일(2005) 기준 값이 새면 안 된다.
    // ⚠️ 화면(모달 밖) 상가부수토지 칸에는 같은 값이 정상 표시되므로 dialog로 스코프를 한정한다.
    const dialog = await screen.findByRole("dialog");
    const acqLeaked = Array.from(dialog.querySelectorAll("input")).some(
      (i) => (i as HTMLInputElement).value === "2,280,000",
    );
    expect(acqLeaked, "토지 취득일 기준 공시지가가 모달 취득칸에 주입되면 안 됨").toBe(false);
  });

  it("토지일 = 건물일 → 취득 공시지가 주입 (같은 트랙이므로 안전)", async () => {
    render(
      <MixedUseAssetMajorStdPrice
        asset={mixedAssetSplitDates({
          hasSeperateLandAcquisitionDate: false,
          landAcquisitionDate: "",
          acquisitionDate: "2012-03-01",
        })}
        onChange={() => {}}
        transferDate="2026-02-16"
        useEstimatedAcquisition
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "건물 기준시가 계산" }));
    const dialog = await screen.findByRole("dialog");
    const acqFilled = Array.from(dialog.querySelectorAll("input")).some(
      (i) => (i as HTMLInputElement).value === "2,280,000",
    );
    expect(acqFilled, "토지일 미입력(=건물일) 시엔 주입되어야 함").toBe(true);
  });
});
