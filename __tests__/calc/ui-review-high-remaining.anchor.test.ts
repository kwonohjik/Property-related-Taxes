/**
 * anchor: 대장 재대조에서 **아직 살아 있던 高 결함** (H1·H3·H4·H5·H8, 2026-09-07).
 *
 * 「확정 72건」은 대장 216건 중 **파일이 한 번도 안 건드려진** 부분집합이었다. 나머지 103건은
 * 파일만 스쳤을 뿐 항목은 미확인이었고, 그중 高 17건을 코드로 대조하니 8건이 살아 있었다.
 *
 * 순수 함수·페이로드 축은 여기, 렌더 축은 `ui-review-high-remaining.test.tsx`에 있다.
 */
import { describe, it, expect, vi } from "vitest";
import { validateGeneralBuildingAsset } from "@/lib/calc/transfer-tax-validate-gb";
import { effectiveBundledSaleMode } from "@/lib/calc/bundled-sale-mode";
import { phdPayloadActive, carryoverPhdMode } from "@/lib/calc/phd-toggle-scope";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import {
  useMultiTransferStore,
  defaultMultiTransferFormData,
} from "@/lib/stores/multi-transfer-tax-store";
import { callMultiTransferTaxAPI } from "@/lib/calc/multi-transfer-tax-api";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

/* ────────────────────────────────────────────────────────────────
 * H1 — 일반건물 부담부증여 «시가» 모드가 채울 칸 없이 영구 차단됐다
 * ──────────────────────────────────────────────────────────────── */

function gbBurdenedGift(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "general_building",
    transferType: "burdened_gift",
    acquisitionCause: "purchase",
    acquisitionDate: "2010-06-01",
    bgValuationMode: "sangjeungbeop_market",
    bgMarketValueAtTransfer: "1,000,000,000",
    bgLendingDepositTotal: "300,000,000",
    bgAcquisitionMethod: "actual",
    bgActualAcquisitionLand: "200,000,000",
    gbLandArea: "300",
    gbTransferLandPricePerSqm: "1,000,000",
    gbAcqLandPricePerSqm: "500,000",
    gbTransferBuildingValue: "200,000,000",
    gbAcqBuildingValue: "100,000,000",
    ...over,
  } as AssetForm;
}

describe("H1 — GB 부담부증여 시가 모드: 화면에 없는 「취득시 평가액」을 요구하지 않는다", () => {
  it("🔑 A-1: `bgMarketValueAtAcquisition`이 비어도 그 사유로 막지 않는다", () => {
    const msg = validateGeneralBuildingAsset(
      gbBurdenedGift({ bgMarketValueAtAcquisition: "" }),
      "일반건물",
      "2025-05-01",
    );
    expect(msg ?? "").not.toContain("취득시 평가액");
  });

  it("🔑 A-2: 양도시 평가액은 종전대로 요구한다 — 게이트를 통째로 지운 게 아니다", () => {
    const msg = validateGeneralBuildingAsset(
      gbBurdenedGift({ bgMarketValueAtTransfer: "" }),
      "일반건물",
      "2025-05-01",
    );
    expect(msg).toContain("양도시 평가액");
  });
});

/* ────────────────────────────────────────────────────────────────
 * H8 — 증환지 결정방식 강제가 ④ 신고 단위까지 간다
 * ──────────────────────────────────────────────────────────────── */

describe("H8 — 증환지 증가분이 있으면 결정방식은 apportioned로 강제된다", () => {
  it("🔑 B-1: 증가분 자산이 있으면 stale «actual»을 덮는다", () => {
    expect(
      effectiveBundledSaleMode({
        bundledSaleMode: "actual",
        assets: [{}, { isReplotIncrement: true }],
      }),
    ).toBe("apportioned");
  });

  it("B-2: 증가분이 없으면 사용자 선택 그대로", () => {
    expect(
      effectiveBundledSaleMode({ bundledSaleMode: "actual", assets: [{}, {}] }),
    ).toBe("actual");
  });

  it("🔑 B-3: ④ body의 신고 단위 `bundledSaleMode`도 파생값이다", async () => {
    const mk = (i: number, extra: Partial<AssetForm> = {}) =>
      ({
        ...makeDefaultAsset(i),
        assetKind: "land",
        acquisitionCause: "purchase",
        acquisitionDate: "2015-02-10",
        actualSalePrice: "700,000,000",
        fixedAcquisitionPrice: "300,000,000",
        standardPriceAtTransfer: "700,000,000",
        ...extra,
      }) as AssetForm;
    const form = {
      transferDate: "2026-01-27",
      assets: [mk(1), mk(2, { isReplotIncrement: true })],
      houses: [],
      presaleRights: [],
      isOneHousehold: false,
      householdHousingCount: "0",
      residencePeriodMonths: "0",
      annualBasicDeductionUsed: "0",
      contractTotalPrice: "1,000,000,000",
      bundledSaleMode: "actual",
    } as unknown as TransferFormData;

    const cap: { body?: Record<string, unknown> } = {};
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_u: string, init?: RequestInit) => {
        cap.body = JSON.parse(String(init?.body));
        return { ok: true, json: async () => ({ mode: "single", result: {} }) } as unknown as Response;
      }),
    );
    await callTransferTaxAPI(form);
    vi.unstubAllGlobals();

    expect(cap.body?.bundledSaleMode).toBe("apportioned");
    // 주 자산 확정 양도가액도 같은 축을 본다 — actual 전제의 값이 실리면 안 된다.
    expect(cap.body?.primaryActualSalePrice).toBeUndefined();
  });
});

/* ────────────────────────────────────────────────────────────────
 * H3 — 이월과세 PHD·APD가 ④에 도달한다
 * ──────────────────────────────────────────────────────────────── */

describe("H3 — 이월과세 3-시점 환산이 ④ payload에 실린다", () => {
  const carryoverAsset = (mode: string) =>
    ({
      ...makeDefaultAsset(1),
      assetKind: "housing",
      acquisitionCause: "carryover_gift",
      usePreHousingDisclosure: false,
      carryover: { useEstimatedAcquisition: true, estimationMode: mode },
    }) as unknown as AssetForm;

  it("🔑 C-1: `carryoverPhdMode`가 phd·apd를 잡는다", () => {
    expect(carryoverPhdMode(carryoverAsset("phd"))).toBe(true);
    expect(carryoverPhdMode(carryoverAsset("apd"))).toBe(true);
    expect(carryoverPhdMode(carryoverAsset("general"))).toBe(false);
  });

  it("🔑 C-2: store 토글이 꺼져 있어도 ④ 전송 술어가 참이다", () => {
    expect(phdPayloadActive(carryoverAsset("phd"))).toBe(true);
  });

  it("C-3: 매매 취득의 자산-수준 축은 종전 그대로 (자산 종류 게이트 유지)", () => {
    const land = {
      ...makeDefaultAsset(1),
      assetKind: "land",
      acquisitionCause: "purchase",
      usePreHousingDisclosure: true,
    } as AssetForm;
    expect(phdPayloadActive(land)).toBe(false);
    const housing = { ...land, assetKind: "housing" } as AssetForm;
    expect(phdPayloadActive(housing)).toBe(true);
  });
});

/* ────────────────────────────────────────────────────────────────
 * H4 — 다건 store: 입력이 바뀌면 result가 무효화된다
 * ──────────────────────────────────────────────────────────────── */

describe("H4 — 다건 계산기 result 무효화", () => {
  const seed = () => {
    const s = useMultiTransferStore.getState();
    s.reset();
    useMultiTransferStore.setState({ result: { totalTax: 1 } as never });
  };
  const result = () => useMultiTransferStore.getState().result;

  it("🔑 D-1: `updateProperty`가 result를 비운다", () => {
    seed();
    const s = useMultiTransferStore.getState();
    s.addProperty({ propertyId: "p1", propertyLabel: "A", form: {} } as never);
    useMultiTransferStore.setState({ result: { totalTax: 1 } as never });
    useMultiTransferStore.getState().updateProperty(0, { propertyLabel: "B" } as never);
    expect(result()).toBeNull();
  });

  it("🔑 D-2: `setForm`(공통 설정)도 비운다", () => {
    seed();
    useMultiTransferStore.getState().setForm({ annualBasicDeductionUsed: "1" } as never);
    expect(result()).toBeNull();
  });

  it("🔑 D-3: `setStep`은 **비우지 않는다** — 순수 이동이다", () => {
    seed();
    useMultiTransferStore.getState().setStep("result");
    expect(result()).not.toBeNull();
  });

  it("D-4: `setActiveProperty`도 비우지 않는다", () => {
    seed();
    useMultiTransferStore.getState().setActiveProperty(0);
    expect(result()).not.toBeNull();
  });
});

/* ────────────────────────────────────────────────────────────────
 * H5 — 기납부세액 편집 플래그가 국세·지방소득세로 분리됐다
 * ──────────────────────────────────────────────────────────────── */

describe("H5 — 기납부세액 편집 플래그 분리", () => {
  /**
   * 🔑 store에 두 키가 있다는 것만 보면 구별력이 0이다 — `setForm`은 넘긴 것을 그대로
   *    spread하므로 뮤테이션에서도 통과한다(실측). **④가 어느 플래그를 읽는지**를 본다.
   */
  it("🔑 E-1: ④는 지방소득세에 **자기 플래그**를 쓴다 — 국세는 자동 파생값을 유지한다", async () => {
    const cap: { body?: Record<string, unknown> } = {};
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_u: string, init?: RequestInit) => {
        cap.body = JSON.parse(String(init?.body));
        return { ok: true, json: async () => ({ result: {} }) } as unknown as Response;
      }),
    );
    const multiForm = {
      ...defaultMultiTransferFormData,
      properties: [],
      // 지방소득세만 사용자가 고쳤다. 국세는 손대지 않았다.
      priorPaidLocalTax: "1,000,000",
      priorPaidLocalTaxEdited: true,
      priorPaidTax: "0",
      priorPaidTaxEdited: false,
    };
    await callMultiTransferTaxAPI(multiForm as never, []).catch(() => {});
    vi.unstubAllGlobals();

    // 공유 플래그였다면 지방 편집이 국세까지 「편집됨」으로 만들어 store 기본값 "0"이 실린다.
    expect(cap.body?.priorPaidLocalTax).toBe(1_000_000);
    expect(cap.body?.priorPaidTax).toBe(0); // 자산 0건 → 자동 파생값도 0. 축이 갈렸음은 위 줄이 증명한다.
  });
});
