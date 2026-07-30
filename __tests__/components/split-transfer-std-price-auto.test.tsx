/**
 * anchor: 토지·건물 분리 — 「양도시 기준시가」 자동 계산 (§99①1호).
 *
 * 계획서: docs/02-design/features/transfer-split-transfer-std-price-auto.plan.md (§6 P3·P4, §6.2)
 *
 * 핵심 불변식 — 양도가액 안분(§166⑥ → 부가세령 §64①1호 준용)의 기준시가는 **파트별 독립 공시액**:
 *   · 토지 = ㎡당 개별공시지가 × 양도 당시 면적 (§99①1호 가목)
 *   · 건물 = 국세청장 산정 건물 기준시가 —「건물 기준시가 계산서」 모달 (§99①1호 나목)
 *
 * 🔴 **주택이라도 `라목 결합 총액 − 토지분` 역산을 쓰지 않는다**(2026-07-29 사용자 확정).
 * 라목 역산은 취득시 축(개산공제 법정액 정합)의 규칙이지 양도가액 안분의 규칙이 아니다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { useState } from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { LandBuildingSaleSplitSection } from "@/components/calc/transfer/LandBuildingSaleSplitSection";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { saleStdPlacement } from "@/lib/calc/transfer-tax-split-acq-mode";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

function Harness({ init }: { init: Partial<AssetForm> }) {
  const [asset, setAsset] = useState<AssetForm>({
    ...makeDefaultAsset(1),
    hasSeperateLandAcquisitionDate: true,
    saleSplitMode: "apportioned", // needsSaleStdPrice = true
    addressJibun: "서울특별시 강남구 삼성동 100",
    ...init,
  } as AssetForm);

  return (
    <LandBuildingSaleSplitSection
      saleSplitMode={asset.saleSplitMode ?? "apportioned"}
      onSaleSplitModeChange={() => {}}
      landTransferPrice="" onLandTransferPriceChange={() => {}}
      buildingTransferPrice="" onBuildingTransferPriceChange={() => {}}
      // 실제 배선과 동일하게 호출부(공통 조상)가 술어로 계산해 주입한다.
      showStdCard={
        saleStdPlacement({
          saleSplitMode: asset.saleSplitMode ?? "apportioned",
          landMode: asset.landAcqMode || "actual",
          buildingMode: asset.buildingAcqMode || "actual",
          selfOwns: asset.selfOwns ?? "both",
        }).saleAxis
      }
      asset={asset}
      onAssetChange={(patch) => setAsset((a) => ({ ...a, ...patch }))}
      transferDate="2025-06-01"
    />
  );
}

const perSqmInput = () => screen.getByPlaceholderText("원/㎡") as HTMLInputElement;
const areaInput = () => screen.getByTestId("split-land-std-transfer-area") as HTMLInputElement;
/**
 * 토지 기준시가는 **표시 전용**이다(2026-07-29) — §99①1호 가목상 `개별공시지가 × 면적`이
 * 정의 그 자체라 별도 고시 총액이 없어 수동 입력 칸을 두지 않는다.
 */
const landTotal = () => screen.getByTestId("split-land-std-transfer").textContent ?? "";
const buildingTotal = () => screen.getByTestId("split-building-std-transfer") as HTMLInputElement;

describe("A. 일반 건물(가목+나목) — 파트 독립 산정", () => {
  it("A-1 ㎡당 공시지가 × 양도면적 → 양도시 토지 기준시가 자동 기록", () => {
    render(<Harness init={{ assetKind: "building" }} />);
    fireEvent.change(perSqmInput(), { target: { value: "5000000" } });
    fireEvent.change(areaInput(), { target: { value: "200" } });

    expect(landTotal()).toBe("1,000,000,000"); // floor(5,000,000 × 200)
    // 단가·면적도 같은 배치 patch로 보존돼야 한다 (stale spread 덮어쓰기 회귀 가드)
    expect(perSqmInput().value).toBe("5,000,000");
    expect(areaInput().value).toBe("200");
  });

  it("A-2 토지 총액 수동 입력 칸은 없다 — 가목상 `공시지가 × 면적`이 정의 그 자체", () => {
    render(<Harness init={{ assetKind: "building" }} />);
    fireEvent.change(perSqmInput(), { target: { value: "5000000" } });
    fireEvent.change(areaInput(), { target: { value: "200" } });
    // 표시 전용 div — input이 아니다(중복 입력 제거)
    expect(screen.getByTestId("split-land-std-transfer").tagName).toBe("DIV");
    expect(landTotal()).toBe("1,000,000,000");
  });

  it("A-3 건물분은 「건물 기준시가 계산」 모달로 독립 산정 (나목 별도 공시)", () => {
    render(<Harness init={{ assetKind: "building" }} />);
    expect(screen.getByRole("button", { name: /건물 기준시가/ })).toBeTruthy();
  });

  it("A-4 소수 면적도 절사 규칙 일치 — floor(단가 × 면적)", () => {
    render(<Harness init={{ assetKind: "building" }} />);
    fireEvent.change(perSqmInput(), { target: { value: "3333333" } });
    fireEvent.change(areaInput(), { target: { value: "76.51" } });

    expect(landTotal()).toBe(Math.floor(3333333 * 76.51).toLocaleString("en-US"));
  });
});

describe("B. 주택(housing) — 일반 건물과 동일하게 파트별 독립 산정", () => {
  const housingInit = { assetKind: "housing" as const };

  it("🔴 B-1 주택에도 건물 기준시가 계산기를 노출한다 (라목 역산 폐지)", () => {
    render(<Harness init={housingInit} />);
    expect(screen.getByRole("button", { name: /건물 기준시가/ })).toBeTruthy();
  });

  it("🔴 B-2 토지 단가·면적 입력이 건물분을 자동 도출하지 않는다 (역산 회귀 가드)", () => {
    render(<Harness init={{ ...housingInit, standardPriceAtTransfer: "800000000" }} />);
    fireEvent.change(perSqmInput(), { target: { value: "3000000" } });
    fireEvent.change(areaInput(), { target: { value: "100" } });

    expect(landTotal()).toBe("300,000,000");
    expect(
      buildingTotal().value,
      "라목 결합 총액에서 토지분을 뺀 역산이 되살아나면 안 된다 — 건물은 계산기로 독립 산정한다",
    ).toBe("");
  });

  it("B-3 결합 총액(개별·공동주택가격) 입력칸은 이 블록에 없다", () => {
    render(<Harness init={housingInit} />);
    expect(screen.queryByText(/개별·공동주택가격/)).toBeNull();
  });

  it("B-4 토지분은 주택에서도 공시지가 × 면적으로 자동 계산", () => {
    render(<Harness init={housingInit} />);
    fireEvent.change(perSqmInput(), { target: { value: "540000" } });
    fireEvent.change(areaInput(), { target: { value: "206.6" } });
    expect(landTotal()).toBe(Math.floor(540000 * 206.6).toLocaleString("en-US"));
  });
});

describe("C. 게이트 — 회귀 0", () => {
  it("구분양도(actual) + 실가 파트 → 양도시 기준시가 블록 자체 미노출", () => {
    render(<Harness init={{ assetKind: "building", saleSplitMode: "actual" }} />);
    expect(screen.queryByTestId("split-land-std-transfer")).toBeNull();
    expect(screen.queryByTestId("split-land-std-transfer-area")).toBeNull();
  });

  /**
   * 2026-07-30 배치 변경 — 구분양도에서 양도시 기준시가는 **환산 분모 전용**이므로
   * 축 A가 아니라 그 파트 섹션(축 B `LandBuildingSplitSection`)에 렌더된다.
   * 축 A 카드는 일괄양도(안분 비율) 전용이 됐다.
   */
  it("구분양도 + 환산(estimated) 파트 → 축 A에는 미노출 (파트 섹션으로 이동)", () => {
    render(<Harness init={{ assetKind: "building", saleSplitMode: "actual", landAcqMode: "estimated" }} />);
    expect(screen.queryByTestId("split-sale-std-card")).toBeNull();
    expect(screen.queryByTestId("split-land-std-transfer")).toBeNull();
  });

  it("일괄양도(apportioned) → 축 A 카드 노출", () => {
    render(<Harness init={{ assetKind: "building", saleSplitMode: "apportioned" }} />);
    expect(screen.getByTestId("split-sale-std-card")).toBeTruthy();
  });

  it("라벨은 '양도시 토지/건물 기준시가' 어순 (시점 → 대상)", () => {
    render(<Harness init={{ assetKind: "building" }} />);
    expect(screen.getByText("양도시 기준시가 (§99①1호 가목·나목)")).toBeTruthy();
    expect(screen.getByText("양도시 건물 기준시가")).toBeTruthy();
  });
});
