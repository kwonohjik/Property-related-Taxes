/**
 * @vitest-environment jsdom
 *
 * anchor: 대장 재대조 보통·낮음 15건의 **렌더 축**.
 *
 * ⚠️ 순수 함수만 단언하면 컴포넌트가 그것을 쓴다는 증명이 안 된다
 *    ([[feedback_library_anchor_does_not_prove_component_uses_it]]) — 렌더 결과로 고정한다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, renderHook } from "@testing-library/react";
import { ReductionDetailCards } from "@/components/calc/results/transfer/ReductionDetailCards";
import { SalesCaseSection } from "@/components/calc/transfer/SalesCaseSection";
import { ReplotIncreaseFields } from "@/components/calc/transfer/CompanionAssetCardReplot";
import { useUnifiedRateBadge } from "@/components/calc/transfer/CompanionAssetCardNewConstruction";
import { Step4 } from "@/app/calc/transfer-tax/steps/Step4";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { appurtenantLimitShareOfAssets } from "@/lib/calc/housing-excess-split";
import { CompanionAssetsSection } from "@/components/calc/transfer/CompanionAssetsSection";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferTaxResult } from "@/lib/tax-engine/transfer-tax";

afterEach(cleanup);

/* ── #21 §97의4 라벨 ─────────────────────────────────────────── */

function resultWithRental97(effectCategory: string): TransferTaxResult {
  return {
    steps: [],
    rental97LthdDetail: {
      isEligible: true,
      effectCategory,
      baseLthdRate: 0.2,
      gainApplied: 100_000_000,
      deductionApplied: 20_000_000,
      ineligibleReasons: [],
    },
  } as unknown as TransferTaxResult;
}

describe("#21 — §97의4 결과는 §97의3을 근거로 제시하지 않는다", () => {
  it("🔑 D-1: 추가공제율(§97의4) 카드는 §97의4 라벨을 쓴다", () => {
    render(
      <ReductionDetailCards
        result={resultWithRental97("long_term_holding_additional")}
        calculatedTax={50_000_000}
        taxBase={200_000_000}
        longTermHoldingDeduction={20_000_000}
      />,
    );
    expect(screen.getByText(/§97의4/)).toBeTruthy();
    expect(screen.queryByText(/장기보유특별공제 특례 \(§97의3\)/)).toBeNull();
  });

  it("D-2: 대체율(§97의3)은 종전 라벨 그대로 — §97의4로 바뀌지 않는다", () => {
    render(
      <ReductionDetailCards
        result={resultWithRental97("long_term_holding")}
        calculatedTax={50_000_000}
        taxBase={200_000_000}
        longTermHoldingDeduction={20_000_000}
      />,
    );
    expect(screen.queryByText(/§97의4/)).toBeNull();
  });
});

/* ── #30 RTMS 비활성 사유 ────────────────────────────────────── */

describe("#30 — RTMS 비활성 사유가 실제로 막고 있는 조건을 말한다", () => {
  const base = {
    similarSalesValue: "",
    onSimilarSalesValueChange: () => {},
    acquisitionDate: "2015-02-10",
    acquisitionAddress: "서울시 강남구 역삼동 123",
    acquisitionArea: "84.5",
    standardPriceAtAcq: "",
    onStandardPriceAtAcqChange: () => {},
  } as const;

  it("🔑 E-1: 주소·면적은 있는데 시군구코드가 없으면 그 사실을 말한다", () => {
    render(<SalesCaseSection {...base} acquisitionSigunguCode="" />);
    expect(screen.getByText(/시·군·구가 확인되지 않았습니다/)).toBeTruthy();
  });

  it("E-2: 면적이 비면 종전 문구", () => {
    render(
      <SalesCaseSection {...base} acquisitionArea="" acquisitionSigunguCode="11680" />,
    );
    expect(screen.getByText(/취득 주소·면적을 먼저 입력하세요/)).toBeTruthy();
  });
});

/* ── #27 증환지 증가분 중복 추가 ─────────────────────────────── */

function replotAsset(): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "land",
    areaScenario: "increase",
    entitlementArea: "100",
    allocatedArea: "130",
  } as AssetForm;
}

describe("#27 — 증가분 자산 추가 여부는 폼의 사실로 판정한다", () => {
  it("🔑 F-1: 이미 증가분 자산이 있으면 추가 버튼이 뜨지 않는다 (재마운트해도)", () => {
    render(
      <ReplotIncreaseFields
        asset={replotAsset()}
        onChange={() => {}}
        onAddAsset={() => {}}
        hasIncrementAsset
      />,
    );
    expect(screen.queryByTestId("replot-inc-add-btn")).toBeNull();
    expect(screen.getByText(/추가됨/)).toBeTruthy();
  });

  it("F-2: 없으면 종전대로 추가 버튼", () => {
    render(
      <ReplotIncreaseFields asset={replotAsset()} onChange={() => {}} onAddAsset={() => {}} />,
    );
    expect(screen.getByTestId("replot-inc-add-btn")).toBeTruthy();
  });
});

/* ── #1·#7·#8·#9 ⑤ 렌더 게이트가 「담긴 값」을 본다 (Step4 렌더 축) ─────── */

describe("#1·#7~#9 — 빈 행이 남으면 지울 화면도 남는다", () => {
  const baseForm = () =>
    ({
      ...createDefaultTransferFormData(),
      transferDate: "2025-05-01",
      householdHousingCount: "1",
      assets: [{ ...makeDefaultAsset(1), assetKind: "land", acquisitionDate: "2015-02-10" }],
    }) as unknown as TransferFormData;

  it("🔑 G-1: 토지 자산 + 1채인데 주택 목록에 행이 있으면 그 목록이 렌더된다", () => {
    const form = {
      ...baseForm(),
      houses: [{ id: "h1", acquisitionDate: "", officialPrice: "" }],
    } as unknown as TransferFormData;
    render(<Step4 form={form} onChange={() => {}} />);
    expect(screen.getByText(/세대 구성원이 보유한 주택을 입력하세요/)).toBeTruthy();
  });

  it("G-2: 행이 없으면 종전대로 렌더하지 않는다 — 넓히기만 했다", () => {
    render(<Step4 form={baseForm()} onChange={() => {}} />);
    expect(screen.queryByText(/세대 구성원이 보유한 주택을 입력하세요/)).toBeNull();
  });

  it("🔑 G-3: 3주택+ 배제특례 토글이 켜져 있으면 2채로 낮춰도 그 섹션이 렌더된다", () => {
    const form = {
      ...baseForm(),
      assets: [{ ...makeDefaultAsset(1), assetKind: "housing", acquisitionDate: "2015-02-10" }],
      householdHousingCount: "2",
      sellingHouseExclusion: { isDayCareCenter: true, dayCareOperationYears: "" },
    } as unknown as TransferFormData;
    render(<Step4 form={form} onChange={() => {}} />);
    expect(screen.getAllByText(/어린이집/).length).toBeGreaterThan(0);
  });
});

/* ── #12·#36 부수토지 한도 배율이 엔진 축이다 (배지 훅) ──────────────── */

describe("#12·#36 — 일체과세 배지가 §167의5 3/5/10배를 쓴다", () => {
  const primary = (over: Partial<AssetForm> = {}) =>
    ({
      ...makeDefaultAsset(1),
      assetKind: "housing",
      acquisitionCause: "newConstruction",
      occupancyApprovalDate: "2025-01-01",
      buildingFootprintArea: "100",
      appurtenantLandZone: "metropolitan_residential",
      ...over,
    }) as unknown as AssetForm;
  const land = (area: string) =>
    ({ ...makeDefaultAsset(2), assetKind: "land", acquisitionArea: area }) as AssetForm;

  it("🔑 H-1: 수도권 주거 3배 — 400㎡는 한도(300㎡) 초과라 배지가 꺼진다 (5배였다면 켜졌다)", () => {
    const { result } = renderHook(() =>
      useUnifiedRateBadge(land("400"), primary(), "2025-06-01"),
    );
    expect(result.current).toBe(false);
  });

  it("H-2: 한도 안(250㎡)이면 켜진다 — 배지를 죽인 게 아니다", () => {
    const { result } = renderHook(() =>
      useUnifiedRateBadge(land("250"), primary(), "2025-06-01"),
    );
    expect(result.current).toBe(true);
  });

  it("🔑 H-3: 2022.1.1. 전 양도는 경과조치 5배 — 같은 400㎡가 한도 안이다", () => {
    const { result } = renderHook(() =>
      useUnifiedRateBadge(
        land("400"),
        primary({ occupancyApprovalDate: "2021-06-01" }),
        "2021-12-31",
      ),
    );
    expect(result.current).toBe(true);
  });

  /**
   * #17 후속(K1) — route(`resolveCompanionSplit`)는 한도를 주 자산 주택 카드 토지에서 먼저 뺀다. 배지도 같은 leaf(`appurtenantCardLimitShare`)로 잰다.
   * route 실측(신축 2025-06-01 · 양도 2026-02-16 · 정착 100㎡ · 수도권 주거 3배): 주택 500 + 카드 100 → 카드 전부 초과분(104-1-1, 일체과세 아님) ·
   * 주택 100 + 카드 200 → 카드 104-1-3(일체과세) · 주택 200 + 카드 200 → 한도 내 100 + 초과 100.
   */
  const landA = (area: string) => ({ ...land(area), landNature: "appurtenant" }) as AssetForm;
  const badgeWith = (h: string, l: AssetForm) => {
    const p = primary({ acquisitionArea: h });
    return renderHook(() => useUnifiedRateBadge(l, p, "2025-06-01", appurtenantLimitShareOfAssets(p, [l]))).result.current;
  };

  it("🔑 H-4: 주택 카드 토지 500㎡가 이미 한도(300㎡)를 넘었으면 카드 100㎡는 배지가 꺼진다 (수정 전: 카드 단독 비교로 켜졌다)", () => {
    expect(badgeWith("500", landA("100"))).toBe(false);
  });

  it("H-5: 주택 100㎡ + 카드 200㎡(합계 한도 이내)는 켜진다 · 주택 200㎡ + 카드 200㎡(남은 한도 100㎡)는 꺼진다", () => {
    expect(badgeWith("100", landA("200"))).toBe(true);
    expect(badgeWith("200", landA("200"))).toBe(false);
  });

  it("H-6: 부수토지 카드끼리는 남은 한도를 함께 쓴다 — 카드 150㎡ 둘이면 각자 한도 안이어도 합계 300㎡ > 남은 200㎡라 꺼진다", () => {
    const p = primary({ acquisitionArea: "100" });
    const a = landA("150");
    const b = { ...landA("150"), assetId: "b" } as AssetForm;
    expect(renderHook(() => useUnifiedRateBadge(a, p, "2025-06-01", appurtenantLimitShareOfAssets(p, [a, b]))).result.current).toBe(false);
    expect(renderHook(() => useUnifiedRateBadge(a, p, "2025-06-01", appurtenantLimitShareOfAssets(p, [a]))).result.current).toBe(true);
  });

  it("🔑 H-8: 화면 배선 — 자산 목록이 배지에 한도 공유 면적을 넘긴다 (주택 500 + 카드 100 꺼짐 · 주택 100 + 카드 200 켜짐)", () => {
    const BADGE = /주택·부수토지 일체과세 자동 적용 중/;
    const renderSection = (h: string, l: string) =>
      render(
        <CompanionAssetsSection
          assets={[primary({ acquisitionArea: h, transferArea: h }), { ...landA(l), transferArea: l } as AssetForm]}
          bundledSaleMode="actual"
          onChange={() => {}}
          transferDate="2025-06-01"
          splitMode="companion"
          onFractionalToggle={() => {}}
        />,
      );
    renderSection("500", "100");
    expect(screen.queryByText(BADGE)).toBeNull();
    cleanup();
    renderSection("100", "200");
    expect(screen.queryByText(BADGE)).not.toBeNull();
  });

  it("H-7: 주 자산이 «건물만 본인 소유»면 주택 카드 토지를 세지 않는다 — route `appurtenantLimitShareOf`와 같은 술어", () => {
    const p = primary({ acquisitionArea: "500", selfOwns: "building_only" });
    expect(appurtenantLimitShareOfAssets(p, [landA("100")])).toEqual({ houseLandAreaM2: undefined, appurtenantCardsAreaM2: 100 });
    expect(appurtenantLimitShareOfAssets(primary({ acquisitionArea: "500" }), [landA("100"), land("70")])).toEqual({ houseLandAreaM2: 500, appurtenantCardsAreaM2: 100 });
  });
});
