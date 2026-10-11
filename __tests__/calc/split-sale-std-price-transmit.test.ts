/**
 * anchor: 양도시 기준시가 전송 게이트 — `hasSaleRatio` 계층 간 인자 비대칭 해소 (S1).
 *
 * 계획서: docs/02-design/features/transfer-split-part-std-card-gating.plan.md §12-S1
 *
 * 🔴 결함: UI·validate는 **폼값**으로 `hasSaleRatio`를 판정하는데, 엔진은
 *   `resolveSaleApportionBasis` 즉 **실제 전송된 필드** 기준이다. API가
 *   `saleStdPriceActive`(일괄양도 || 어느 파트든 환산)일 때만 양도시 기준시가를 전송하므로,
 *   **일괄양도 → 구분양도 전환 후 양도시 기준시가 2필드가 잔존 + 양도가액 2칸 공백**이면
 *   validate는 전부 통과시키는데 엔진은 `saleRatio = null` → `splitPair` throw.
 *
 * validate V4가 "양도가액 구분 입력 **또는** 양도시 기준시가 2필드"를 정당한 입력으로 인정하므로
 * (§166⑥ → 부가세령 §64①1호 — 구분이 없으면 양도 당시 기준시가 비율), 엔진이 그 두 번째 경로를
 * 쓸 수 있어야 한다. **전송 게이트가 validate 의도보다 좁은 것**이 결함의 본체다.
 *
 * 불변식:
 *   · 분리 축이 활성이면 양도시 기준시가는 **항상 전송**한다(기준시가는 물건 속성값 — 지분 스케일
 *     대상도 아니고, 양도가액을 명시 입력하면 엔진이 비율을 쓰지 않으므로 과잉 전송이 무해하다)
 *   · 양도가액 2칸이 입력되면 `splitPair`가 입력값을 쓴다 — 비율은 무시된다(회귀 0)
 */
import { describe, it, expect } from "vitest";
import { buildSplitPayload } from "@/lib/calc/transfer-tax-api-split";
import { validateSplitDirectInputs } from "@/lib/calc/transfer-tax-validate-split";
import { calcSplitGain } from "@/lib/tax-engine/transfer-tax-split-gain";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";

const ratioed = (v: string | undefined) =>
  v ? parseInt(String(v).replace(/,/g, ""), 10) || undefined : undefined;

/** 일괄양도에서 양도시 기준시가를 채운 뒤 구분양도로 바꾸고 양도가액은 비워 둔 상태 */
function asset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2018-06-01",
    landAcquisitionDate: "2015-06-01",
    hasSeperateLandAcquisitionDate: true,
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    landAcquisitionPrice: "300,000,000",
    buildingAcquisitionPrice: "250,000,000",
    saleSplitMode: "actual",
    landTransferPrice: "",
    buildingTransferPrice: "",
    landStandardPriceAtTransfer: "600,000,000",
    buildingStandardPriceAtTransfer: "400,000,000",
    actualSalePrice: "1,000,000,000",
    ...over,
  } as AssetForm;
}

function engineInput(body: Record<string, unknown>): TransferTaxInput {
  return {
    propertyType: "housing",
    transferPrice: 1_000_000_000,
    acquisitionDate: "2018-06-01",
    transferDate: "2026-03-06",
    acquisitionPrice: 550_000_000,
    ...body,
  } as unknown as TransferTaxInput;
}

describe("S1 — 구분양도 + 양도가액 미입력 + 양도시 기준시가 有", () => {
  it("S1-a 양도시 기준시가 2필드가 전송된다", () => {
    const body = buildSplitPayload(asset(), { isBurdenedGift: false, usesPhd: false, ratioed });
    expect(
      body.landStandardPriceAtTransfer,
      "validate가 인정하는 안분 근거를 엔진에 넘기지 않으면 계산이 실패한다",
    ).toBe(600_000_000);
    expect(body.buildingStandardPriceAtTransfer).toBe(400_000_000);
  });

  it("S1-b 엔진이 throw하지 않고 양도시 기준시가 비율로 안분한다", () => {
    const body = buildSplitPayload(asset(), { isBurdenedGift: false, usesPhd: false, ratioed });
    const r = calcSplitGain(engineInput(body));
    expect(r).not.toBeNull();
    // 토지 60% : 건물 40% (§166⑥ → 부가세령 §64①1호 — 양도 당시 기준시가 비율)
    expect(r!.land.transferPrice).toBe(600_000_000);
    expect(r!.building.transferPrice).toBe(400_000_000);
  });

  it("S1-c validate는 통과한다 (UI ↔ validate ↔ 엔진 3계층 일치)", () => {
    expect(validateSplitDirectInputs(asset(), "자산 1")).toBeNull();
  });
});

describe("S1 회귀 가드 — 과잉 전송이 계산을 바꾸지 않는다", () => {
  it("S1-d 양도가액을 명시 입력하면 비율을 무시하고 입력값을 쓴다", () => {
    const a = asset({ landTransferPrice: "700,000,000", buildingTransferPrice: "300,000,000" });
    const body = buildSplitPayload(a, { isBurdenedGift: false, usesPhd: false, ratioed });
    const r = calcSplitGain(engineInput(body));
    expect(r!.land.transferPrice, "splitPair는 2칸이 모두 입력되면 비율을 쓰지 않는다").toBe(700_000_000);
    expect(r!.building.transferPrice).toBe(300_000_000);
  });

  it("S1-e 일괄양도(종전 경로)는 그대로 전송된다", () => {
    const body = buildSplitPayload(asset({ saleSplitMode: "apportioned" }), {
      isBurdenedGift: false,
      usesPhd: false,
      ratioed,
    });
    expect(body.landStandardPriceAtTransfer).toBe(600_000_000);
  });

  it("S1-f 분리 축이 비활성이면 전송하지 않는다", () => {
    const body = buildSplitPayload(
      asset({ hasSeperateLandAcquisitionDate: false, selfOwns: "both" }),
      { isBurdenedGift: false, usesPhd: false, ratioed },
    );
    expect(body.landStandardPriceAtTransfer).toBeUndefined();
  });
});
