/**
 * anchor: 상가부수토지 **양도시** 개별공시지가 — PHD(§164⑦) 값 read-through fallback.
 *
 * 회귀 대상: 취득측(`MixedUseAssetMajorStdPrice.tsx:70·257` 계열)은
 * `mixedAcq || phdLandPricePerSqmAtAcq` fallback을 갖는데 양도측은 없어서,
 * 사용자가 PHD 3-시점 패널에 양도시 공시지가를 넣어도
 *  (1) 상가 양도 입력칸이 비어 보이고
 *  (2) "양도 상가부수토지 기준시가 (자동)"이 "—"로 남는다.
 * 주택부수토지·상가부수토지는 동일 필지 → 개별공시지가(원/㎡) 공유가 정당.
 *
 * ⚠️ `parseAmount`는 number를 반환하고 null을 반환하지 않는다(CurrencyInput.tsx:22-26).
 * fallback은 반드시 `||` — `??`는 조용히 무효화된다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, within } from "@testing-library/react";
import { MixedUseAssetMajorStdPrice } from "@/components/calc/transfer/mixed-use/MixedUseAssetMajorStdPrice";
import { MixedUseLegacyStdPrice } from "@/components/calc/transfer/mixed-use/MixedUseLegacyStdPrice";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

const TRANSFER_DATE = "2025-09-01";

/** 상가부수토지 면적이 산출되도록 면적·토지를 채운 기본 자산. */
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

function renderSection(asset: AssetForm) {
  return render(
    <MixedUseAssetMajorStdPrice
      asset={asset}
      onChange={() => {}}
      transferDate={TRANSFER_DATE}
      useEstimatedAcquisition
      housingSectionNum={2}
      commercialSectionNum={3}
    />,
  );
}

describe("상가부수토지 양도시 공시지가 — PHD fallback (C3·C4·C7)", () => {
  it("C3: PHD ON + mixed 빈값 → 입력칸에 PHD 양도 값이 표시된다", () => {
    const { getByPlaceholderText } = renderSection(
      baseAsset({
        usePreHousingDisclosure: true,
        mixedTransferLandPricePerSqm: "",
        phdLandPricePerSqmAtTransfer: "6216000",
      }),
    );
    const input = getByPlaceholderText("양도시 개별공시지가 /㎡") as HTMLInputElement;
    expect(input.value).toBe("6,216,000");
  });

  it("C3: PHD ON + mixed 빈값 → 자동합계가 '—'가 아니라 금액을 표시한다", () => {
    // 이 케이스가 사용자 보고 증상의 핵심 — 입력칸만 고치면 여기가 "—"로 남는다.
    const { getByText } = renderSection(
      baseAsset({
        usePreHousingDisclosure: true,
        mixedTransferLandPricePerSqm: "",
        phdLandPricePerSqmAtTransfer: "6216000",
        mixedTransferCommercialBuildingPrice: "100000000",
      }),
    );
    // 상가부수토지 면적 100㎡ × 6,216,000 = 621,600,000
    const landRow = getByText("양도 상가부수토지 기준시가 (자동)").parentElement as HTMLElement;
    expect(within(landRow).getByText("621,600,000")).toBeTruthy();

    // 합계 = 621,600,000 + 100,000,000
    const totalRow = getByText("양도 상가부분 기준시가 합계 (자동)").parentElement as HTMLElement;
    expect(within(totalRow).getByText("721,600,000")).toBeTruthy();
  });

  it("C4: mixed 값이 있으면 우선한다 (자기 필드 우선)", () => {
    const { getByPlaceholderText } = renderSection(
      baseAsset({
        usePreHousingDisclosure: true,
        mixedTransferLandPricePerSqm: "6216000",
        phdLandPricePerSqmAtTransfer: "5000000",
      }),
    );
    const input = getByPlaceholderText("양도시 개별공시지가 /㎡") as HTMLInputElement;
    expect(input.value).toBe("6,216,000");
  });

  it("C7: PHD OFF + phd 잔존값 → 통과(취득측과 대칭·동일 필지 단가)", () => {
    // PHD OFF는 phd 필드를 지우지 않는다(AssetMajor:146-151이 토글 플래그만 patch).
    const { getByPlaceholderText } = renderSection(
      baseAsset({
        usePreHousingDisclosure: false,
        mixedTransferLandPricePerSqm: "",
        phdLandPricePerSqmAtTransfer: "6216000",
      }),
    );
    const input = getByPlaceholderText("양도시 개별공시지가 /㎡") as HTMLInputElement;
    expect(input.value).toBe("6,216,000");
  });

  it("C3-Legacy: 용도변경 경로(MixedUseLegacyStdPrice)도 동일 fallback", () => {
    // Legacy는 hasPartialUsageChange === true일 때 렌더된다
    // (MixedUseStandardPriceInputs.tsx:38 분기). asset-major와 코드가 같지만
    // 두 컴포넌트가 향후 갈라질 때 legacy 회귀를 잡기 위해 독립 커버.
    const { getByPlaceholderText } = render(
      <MixedUseLegacyStdPrice
        asset={baseAsset({
          hasPartialUsageChange: true,
          partialChangeDirection: "house_to_commercial",
          usePreHousingDisclosure: false,
          mixedTransferLandPricePerSqm: "",
          phdLandPricePerSqmAtTransfer: "6216000",
        })}
        onChange={() => {}}
        transferDate={TRANSFER_DATE}
        useEstimatedAcquisition
        transferSectionNum={2}
        acqSectionNum={3}
      />,
    );
    const input = getByPlaceholderText("양도시 개별공시지가 /㎡") as HTMLInputElement;
    expect(input.value).toBe("6,216,000");
  });

  it("C1 대조군: 취득측 fallback은 회귀 없음", () => {
    const { getByPlaceholderText } = renderSection(
      baseAsset({
        usePreHousingDisclosure: true,
        mixedAcqLandPricePerSqm: "",
        phdLandPricePerSqmAtAcq: "2280000",
      }),
    );
    const input = getByPlaceholderText("취득시 개별공시지가 /㎡") as HTMLInputElement;
    expect(input.value).toBe("2,280,000");
  });
});
