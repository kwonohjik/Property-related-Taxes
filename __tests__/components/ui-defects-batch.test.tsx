/**
 * anchor: UI 결함 배치 (UI 리뷰 보통 #28·#33·#34·#40·#41·#43·#44·#47).
 *
 * 세액에 직결되는 것부터 순수 표시까지 섞여 있지만, 전부 **화면이 사용자를 잘못 인도하거나
 * 조작을 불가능하게 만드는** 결함이다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { APPURTENANT_ZONE_OPTIONS } from "@/components/calc/transfer/appurtenant-zone-options";
import { LOCAL_TAX_ZONE_AREA_MULTIPLIER } from "@/lib/tax-engine/local-tax-zone-multiplier";
import { DeemedTransferSection } from "@/components/calc/transfer/nbl/DeemedTransferSection";
import { RentalHousingExceptionSection } from "@/components/calc/transfer/RentalHousingExceptionSection";
import { LandBuildingSplitSection } from "@/components/calc/transfer/LandBuildingSplitSection";
import { AuctionBlock } from "@/components/calc/transfer/AuctionBlock";
import { makeDefaultAsset, makeDefaultRentalUnit } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

describe("§101② 부수토지 용도지역 선택지 (#28)", () => {
  it("🔑 Z-1: 배율 정본의 **전 키**를 덮는다 — `undesignated`(7배)가 빠져 있었다", () => {
    const optionKeys = APPURTENANT_ZONE_OPTIONS.map((o) => o.value).sort();
    const engineKeys = Object.keys(LOCAL_TAX_ZONE_AREA_MULTIPLIER).sort();
    expect(optionKeys).toEqual(engineKeys);
  });

  it("🔑 Z-2: 4배(미계획지역)와 7배(용도 미지정)의 라벨이 구별된다", () => {
    const label = (v: string) => APPURTENANT_ZONE_OPTIONS.find((o) => o.value === v)?.label ?? "";
    expect(LOCAL_TAX_ZONE_AREA_MULTIPLIER.unplanned).toBe(4);
    expect(LOCAL_TAX_ZONE_AREA_MULTIPLIER.undesignated).toBe(7);
    // 종전 라벨은 「도시계획 미지정」 하나뿐이라 「용도 미지정」으로 읽혔다.
    expect(label("unplanned")).toContain("미계획지역");
    expect(label("undesignated")).toContain("용도 미지정");
    expect(label("unplanned")).not.toBe(label("undesignated"));
  });
});

describe("NBL 양도일 의제 라디오 — name이 자산별로 스코프된다 (#43)", () => {
  const view = (assetId: string) =>
    render(
      <DeemedTransferSection
        asset={{ ...makeDefaultAsset(1), assetId } as AssetForm}
        onAssetChange={() => {}}
      />,
    );

  it("🔑 Z-3: 두 자산을 함께 렌더하면 native 라디오 그룹이 서로 다르다", () => {
    view("asset-a");
    view("asset-b");
    const names = new Set(
      Array.from(document.querySelectorAll<HTMLInputElement>('input[name^="nbl-deemed-reason"]')).map(
        (el) => el.name,
      ),
    );
    // 종전에는 둘 다 "nbl-deemed-reason"이라 문서 전역에서 **하나의 그룹**이 됐다 —
    // 자산 1에서 방향키를 누르면 자산 2의 값이 바뀐다.
    expect(names.size).toBe(2);
  });
});

describe("임대주택 카드 목록 key — 안정 식별자 (#33)", () => {
  const asset = (): AssetForm =>
    ({
      ...makeDefaultAsset(1),
      rentalHousingException: {
        applyException: true,
        scenario: "A",
        rentalUnits: [makeDefaultRentalUnit(), makeDefaultRentalUnit(), makeDefaultRentalUnit()],
      },
    }) as AssetForm;

  it("🔑 Z-4: 각 호가 서로 다른 `unitId`를 갖는다 (인덱스 재사용 차단)", () => {
    const a = asset();
    const ids = a.rentalHousingException.rentalUnits.map((u) => u.unitId);
    expect(new Set(ids).size).toBe(3);
    expect(ids.every((id) => typeof id === "string" && id.length > 0)).toBe(true);
  });

  it("Z-5: 목록이 실제로 렌더된다 — 술어만 두고 관측을 빠뜨리지 않는다", () => {
    render(
      <RentalHousingExceptionSection
        rh={asset().rentalHousingException}
        asset={asset()}
        acquisitionDate="2015-01-01"
        transferDate="2024-06-01"
        onChangeResidence={() => {}}
        onChange={() => {}}
      />,
    );
    expect(screen.getAllByText(/임대주택/).length).toBeGreaterThan(0);
  });
});

describe("토지·건물 분리 — 비소유 파트의 자본적지출 칸 (#47)", () => {
  const base = {
    part: "both" as const,
    landAcqMode: "actual" as const,
    buildingAcqMode: "actual" as const,
    landDirectExpenses: "",
    buildingDirectExpenses: "",
    onLandDirectExpensesChange: () => {},
    onBuildingDirectExpensesChange: () => {},
  };

  const view = (selfOwns: string) =>
    render(
      <LandBuildingSplitSection
        {...({ ...base, selfOwns, showTransfer: false } as unknown as React.ComponentProps<
          typeof LandBuildingSplitSection
        >)}
      />,
    );

  it("🔑 Z-6: 건물만 소유하면 「토지 자본적지출」 칸이 없다 (입력해도 세액 불변)", () => {
    view("building_only");
    expect(screen.queryByText("토지 자본적지출")).toBeNull();
    expect(screen.getByText("건물 자본적지출")).toBeTruthy();
  });

  it("Z-7: 둘 다 소유하면 종전대로 두 칸 모두 있다", () => {
    view("both");
    expect(screen.getByText("토지 자본적지출")).toBeTruthy();
    expect(screen.getByText("건물 자본적지출")).toBeTruthy();
  });
});

describe("FieldCard 안의 CurrencyInput 라벨 중복 (#40·#41)", () => {
  it("🔑 Z-8: 같은 라벨이 두 번 그려지지 않는다", () => {
    render(
      <AuctionBlock
        asset={
          {
            ...makeDefaultAsset(1),
            assetKind: "land",
            useEstimatedAcquisition: true,
            isAuctionTransfer: true,
          } as AssetForm
        }
        onChange={() => {}}
        transferDate="2024-06-01"
      />,
    );
    // 종전에는 FieldCard 라벨 + CurrencyInput 라벨로 **2개**였다.
    expect(screen.getAllByText("공매·경락가액")).toHaveLength(1);
  });

  it("Z-9: 접근성은 유지된다 — `hideLabel`이 aria-label로 남긴다", () => {
    render(
      <AuctionBlock
        asset={
          {
            ...makeDefaultAsset(1),
            assetKind: "land",
            useEstimatedAcquisition: true,
            isAuctionTransfer: true,
          } as AssetForm
        }
        onChange={() => {}}
        transferDate="2024-06-01"
      />,
    );
    expect(screen.getByLabelText("공매·경락가액")).toBeTruthy();
  });
});

/**
 * 호 검색창(#34)은 fetch 모킹이 필요해 `commercial-unit-search-persists.test.tsx`,
 * 겸용 면책 고지(#44)는 `mixed-use-disclaimer.test.tsx`에서 각각 고정한다.
 */
