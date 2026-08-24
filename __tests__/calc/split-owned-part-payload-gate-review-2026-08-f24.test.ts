/**
 * F24 — 비소유 파트(`selfOwns ≠ both`)의 잔존 취득가액이 전송돼 본인 파트 취득가액을
 * 잔액으로 뒤바꾸는 결함의 회귀 anchor (코드리뷰 2026-08).
 *
 * ## 결함
 * `landAcqDirectActive`/`buildingAcqDirectActive`(transfer-tax-api-split.ts)가 `isSplitActive`와
 * 파트 모드만 보고 **`selfOwns`를 보지 않았다**. UI는 비소유 파트의 취득가액 칸을 렌더하지 않고
 * (`LandBuildingSplitSection` `landOwned`/`buildingOwned` 게이트) validate도 그 파트를 건너뛰는데
 * (`validateSeparateAcqParts`의 `p.owned`), 소유 축을 `both`로 두었을 때 입력해 둔 값이 폼에 남아
 * (`AssetOwnershipSplitSection`은 전환 시 값을 지우지 않는다) 그대로 body에 실렸다.
 *
 * 엔진 `splitPair`는 한쪽만 입력되면 반대쪽을 `총액 − 입력값`으로 도출하므로, **화면에 없는
 * 잔존값이 본인 파트 취득가액을 결정**하고 §166⑥ 기준시가 비율 안분이 조용히 우회된다.
 *
 * ## 실측 (수정 전 → 수정 후)
 * housing · 양도 10억 · 취득 총액 5억 · `selfOwns="building_only"` · 취득시 기준시가 토지 3억/건물 1억
 * · 양도시 기준시가 토지 7.5억/건물 2.5억 · 2주택 비1세대1주택 · 2019-06-01 → 2024-06-01:
 *   · 토지값 미전송(정상): 건물 취득가액 125,000,000 · 총세액 26,328,500
 *   · 잔존 450,000,000 전송: 건물 취득가액  50,000,000 · 총세액 53,933,000  ← **+27,604,500 과대**
 *
 * ⚠️ 기준시가 필드는 이 게이트의 대상이 아니다 — 비소유 토지의 취득시 기준시가 카드는
 *    **일부러** 렌더된다(주택 라목 결합 공시에서 건물분을 역산하는 유일 경로). 물건 속성값이라
 *    소유 축과 무관하다. 아래 마지막 케이스가 그것을 고정한다.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { buildSplitPayload } from "@/lib/calc/transfer-tax-api-split";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { validateSplitDirectInputs } from "@/lib/calc/transfer-tax-validate-split";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

/** 지분 스케일 없는 순수 파서 — `makeRatioed(1, false)`와 동일 규약 */
const ratioed = (v: string | undefined) => {
  const n = parseInt(String(v ?? "").replace(/,/g, ""), 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

function splitAsset(over: Record<string, unknown> = {}) {
  return {
    ...makeDefaultAsset(1),
    assetKind: "housing" as const,
    acquisitionCause: "purchase" as const,
    // 취득일 동일 = 비-별개취득. `selfOwns ≠ both`만으로 분리 축이 켜지는 경로다.
    acquisitionDate: "2019-06-01",
    landAcquisitionDate: "2019-06-01",
    actualSalePrice: "1,000,000,000",
    fixedAcquisitionPrice: "500,000,000",
    // 소유 축을 `both`로 두었을 때 입력해 둔 잔존값
    landAcquisitionPrice: "450,000,000",
    buildingAcquisitionPrice: "450,000,000",
    landSalesCaseValue: "300,000,000",
    buildingSalesCaseValue: "100,000,000",
    standardPricePerSqmAtAcq: "3,000,000",
    acquisitionArea: "100",
    standardPriceAtAcq: "400,000,000",
    standardPricePerSqmAtTransfer: "7,500,000",
    transferArea: "100",
    buildingStandardPriceAtTransfer: "250,000,000",
    ...over,
  };
}

function payloadOf(over: Record<string, unknown> = {}) {
  return buildSplitPayload(splitAsset(over) as never, {
    isBurdenedGift: false,
    usesPhd: false,
    ratioed,
  });
}

describe("F24 — 비소유 파트 취득가액은 전송하지 않는다", () => {
  it('🔴 selfOwns="building_only" → 잔존 landAcquisitionPrice 미전송 (건물 취득가액이 잔액으로 뒤바뀌는 것 차단)', () => {
    const p = payloadOf({ selfOwns: "building_only" });
    expect(
      p.landAcquisitionPrice,
      "토지 비소유인데 잔존 토지 취득가액이 실리면 splitPair가 건물 취득가액을 `총액 − 450,000,000`으로 도출한다",
    ).toBeUndefined();
    expect(p.buildingAcquisitionPrice).toBe(450_000_000);
  });

  it('🔴 selfOwns="land_only" → 잔존 buildingAcquisitionPrice 미전송', () => {
    const p = payloadOf({ selfOwns: "land_only" });
    expect(p.buildingAcquisitionPrice).toBeUndefined();
    expect(p.landAcquisitionPrice).toBe(450_000_000);
  });

  it('selfOwns="both" → 양쪽 그대로 전송 (게이트 과잉 차단 방어)', () => {
    const p = payloadOf({ selfOwns: "both", hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2015-06-01" });
    expect(p.landAcquisitionPrice).toBe(450_000_000);
    expect(p.buildingAcquisitionPrice).toBe(450_000_000);
  });

  it("🔴 매매사례가액 2필드도 같은 소유 축을 탄다", () => {
    const bo = payloadOf({ selfOwns: "building_only", landAcqMode: "salesCase", buildingAcqMode: "salesCase" });
    expect(bo.landSalesCaseValue).toBeUndefined();
    expect(bo.buildingSalesCaseValue).toBe(100_000_000);

    const lo = payloadOf({ selfOwns: "land_only", landAcqMode: "salesCase", buildingAcqMode: "salesCase" });
    expect(lo.landSalesCaseValue).toBe(300_000_000);
    expect(lo.buildingSalesCaseValue).toBeUndefined();
  });

  it("취득시 기준시가는 소유 축의 대상이 **아니다** — 비소유 토지 카드는 의도적으로 렌더된다", () => {
    // 별개취득 경로에서만 건물분 기준시가가 실리므로 그 조합으로 확인한다.
    const p = payloadOf({
      selfOwns: "building_only",
      hasSeperateLandAcquisitionDate: true,
      landAcquisitionDate: "2015-06-01",
      buildingStandardPriceAtAcq: "100,000,000",
    });
    expect(p.buildingStandardPriceAtAcquisition).toBe(100_000_000);
    expect(p.landStandardPriceAtTransfer, "양도시 기준시가도 소유와 무관한 물건 속성값이다").toBe(750_000_000);
  });

  it("⑧ 정합 — validate는 비소유 파트를 차단하지 않는다(전송 게이트와 같은 술어)", () => {
    expect(validateSplitDirectInputs(splitAsset({ selfOwns: "building_only" }) as never, "자산 1")).toBeNull();
    expect(validateSplitDirectInputs(splitAsset({ selfOwns: "land_only" }) as never, "자산 1")).toBeNull();
  });
});

describe("F24 — fetch body 실측(⑬ 배관까지 도달하는가)", () => {
  afterEach(() => vi.unstubAllGlobals());

  function captureBody() {
    const captured: { body?: Record<string, unknown> } = {};
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        captured.body = JSON.parse(String(init?.body));
        return { ok: true, json: async () => ({ mode: "single", result: {} }) } as unknown as Response;
      }),
    );
    return captured;
  }

  it('🔴 selfOwns="building_only" — 실제 전송 body에 landAcquisitionPrice가 없다', async () => {
    const cap = captureBody();
    await callTransferTaxAPI({
      transferDate: "2024-06-01",
      assets: [splitAsset({ selfOwns: "building_only" })],
      houses: [],
      presaleRights: [],
      contractTotalPrice: "1,000,000,000",
      totalTransferExpense: "0",
    } as unknown as TransferFormData);
    expect(cap.body?.selfOwns).toBe("building_only");
    expect(cap.body?.landAcquisitionPrice).toBeUndefined();
  });
});
