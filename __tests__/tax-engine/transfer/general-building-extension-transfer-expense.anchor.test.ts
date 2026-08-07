/**
 * anchor: 증축 경로 **양도비**가 §97②2호 단서의 나목에 들어가는가 — **세액으로 잰다** (W-1b, 2026-08-07)
 *
 * ── 결함 ────────────────────────────────────────────────────────────────
 * `transfer-tax-api-gb.ts`가 증축(`gbHasExtension`)이면 `transferExpense`를 payload에서
 * **무조건 제외**했다(decision b). 이유는 `bundledExpenses`의 fallback ②가 같은 값을
 * 채택하면 **이중차감**이 되기 때문이고, 그 우려 자체는 **실재한다**.
 *
 * 그러나 전용 필드 `gbBundledAcquisitionExpenses`가 입력되면 fallback은 **①에서 멈춘다**
 * ⇒ `transferExpense`는 소비되지 않는데도 제외되어 **나목에서 통째로 빠졌다**.
 *
 * ── 실측 (양도비 3억) ────────────────────────────────────────────────────
 *   ① 채택: 나목 800,000,000(현행) → 1,100,000,000(정상) · 결정세액 **121,962,280원 과대**
 *   ② 채택: 나목에 또 넣으면 131,082,800 → 16,954,949 (**과소** — 이중차감)
 *
 * ⇒ 「무조건 제외」도 「무조건 포함」도 틀렸다. **채택된 fallback 단계가 조건**이다.
 *
 * ⚠️ 배관 계약(payload에 실리는가)은 `general-building-swap-api-wiring.test.ts`가 담당한다.
 *    여기서는 **세액이 실제로 달라지는지**를 잰다 — 둘 다 있어야 계약에 이빨이 있다.
 */
import { describe, it, expect } from "vitest";
import { buildGeneralBuildingValuation } from "@/lib/calc/transfer-tax-api-gb";
import { dispatchGeneralBuilding } from "@/app/api/calc/transfer/general-building-route-helper";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { makeMockRates } from "../_helpers/mock-rates";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

const rates = makeMockRates();

const CAPEX = 800_000_000;
const TRANSFER_EXP = 300_000_000;
const DEDICATED_BUNDLED = 5_000_000;

/** 증축 + 원건물 환산(C/D) — §97②2호 단서가 겨루는 조합. */
function gbExtAsset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "general_building",
    useEstimatedAcquisition: true,
    acquisitionDate: "1999-05-24",
    gbLandArea: "85",
    gbBuildingArea: "180.96",
    gbBuildingFootprintArea: "90.48",
    gbTransferLandPricePerSqm: "10830000",
    gbTransferBuildingValue: "20629440",
    gbAcqLandPricePerSqm: "2800000",
    gbAcqBuildingValue: "28144700",
    gbBuildingAcquisitionCause: "purchase",
    gbZoneType: "commercial",
    gbIsMetropolitan: true,
    gbHasExtension: true,
    gbExtensionDate: "2015-06-01",
    gbExtensionAcquisitionCause: "newConstruction",
    gbExtensionAcquisitionMode: "estimated",
    gbTransferExtensionBuildingStdPrice: "8000000",
    gbAcquisitionExtensionBuildingStdPrice: "6000000",
    capitalExpenditure: String(CAPEX),
    transferExpense: String(TRANSFER_EXP),
    ...over,
  } as AssetForm;
}

function calc(asset: AssetForm) {
  const gbv = buildGeneralBuildingValuation(asset) as Record<string, unknown>;
  const r = dispatchGeneralBuilding(
    gbv,
    2_000_000_000,
    new Date("2024-03-01"),
    new Date("1999-05-24"),
    0,
    (gbv.bundledExpenses as number) ?? 0,
    2024, 0, [], rates,
    undefined, {}, undefined,
  ) as unknown as {
    aggregated: {
      determinedTax: number;
      swapComparison?: { estimatedSide: number; directSide: number; chosen: string };
    };
  };
  return {
    tax: r.aggregated.determinedTax,
    directSide: r.aggregated.swapComparison?.directSide,
    bundledExpenses: gbv.bundledExpenses as number,
  };
}

describe("W-1b — 전용 필드 입력(① 채택) 시 양도비가 나목에 들어간다", () => {
  it("🔴 나목 = 자본적지출 + 양도비", () => {
    const r = calc(gbExtAsset({ gbBundledAcquisitionExpenses: String(DEDICATED_BUNDLED) }));
    expect(r.bundledExpenses).toBe(DEDICATED_BUNDLED);
    expect(r.directSide).toBe(CAPEX + TRANSFER_EXP);
  });

  it("🔴 세액이 실제로 달라진다 — 종전에는 121,962,280원 과대였다", () => {
    const fixed = calc(gbExtAsset({ gbBundledAcquisitionExpenses: String(DEDICATED_BUNDLED) }));
    // 양도비를 빼면(=종전 동작) 나목이 자본적지출만 남는다.
    const asIfExcluded = calc(
      gbExtAsset({ gbBundledAcquisitionExpenses: String(DEDICATED_BUNDLED), transferExpense: "0" }),
    );
    expect(asIfExcluded.directSide).toBe(CAPEX);
    expect(asIfExcluded.tax - fixed.tax).toBe(121_962_280);
  });
});

/**
 * ② 채택(전용 필드 미입력)에서는 **제외가 정본**이다.
 * 「고쳤으니 무조건 넣자」로 되돌리면 같은 3억이 두 번 반영돼 **과소납부**가 된다.
 */
describe("W-1b — 전용 필드 미입력(② 채택) 시 제외가 정본", () => {
  it("🔴 bundledExpenses가 곧 양도비다 — 나목에 또 넣지 않는다", () => {
    const r = calc(gbExtAsset());
    expect(r.bundledExpenses).toBe(TRANSFER_EXP);
    expect(r.directSide).toBe(CAPEX);
  });
});

describe("비-증축은 종전대로 항상 포함", () => {
  it("나목 = 자본적지출 + 양도비", () => {
    const r = calc(gbExtAsset({ gbHasExtension: false }));
    expect(r.directSide).toBe(CAPEX + TRANSFER_EXP);
  });
});
