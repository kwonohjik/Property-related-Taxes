/**
 * anchor: 증축 **일괄 필요경비의 성질별 안분 시점** (W-1a, 2026-08-07)
 *
 * ── 결함 ────────────────────────────────────────────────────────────────
 * `transfer-tax-api-gb.ts`의 `bundledExpenses`는 세 후보를 **한 슬롯**에 담는다:
 *   ① `gbBundledAcquisitionExpenses`(전용) → ② `transferExpense` → ③ `directExpenses`(legacy)
 *
 * 그 슬롯을 `general-building-extension.ts`가 **전부 취득시 비율**로 안분했다.
 * ②가 채택되면 **양도비가 취득 축으로** 안분된다 — 「소득세법」 제100조 제2항이 정하는
 * 시점(양도비 = **양도 당시**)과 어긋난다.
 *
 * ── 왜 「② 제거」가 아니라 「성질 전달」인가 ──────────────────────────────
 * ②를 fallback에서 빼면 **원건물 실가(A/B) 조합에서 양도비의 차감 경로가 사라진다** —
 * 자산 단위 swap 판정은 실가 카드에 §97②1호 가산을 적용하지 않기 때문이다
 * (`general-building-swap.ts` 자산 분기). 실측으로 확인했다.
 * ⇒ **값은 그대로 두고 성질만 알린다.**
 *
 * ── 고정 계약 ────────────────────────────────────────────────────────────
 *   N1. ②(양도비) 채택 → **양도시** 축
 *   N2. ①(전용 필드) 채택 → **취득시** 축 (현행 유지)
 *   N3. ③(legacy) 채택 → **취득시** 유지 — 섞인 덩어리는 나눌 근거가 없다
 *   N4. 두 축이 실제로 다르다 (같으면 위 계약이 공허해진다)
 */
import { describe, it, expect } from "vitest";
import { buildGeneralBuildingValuation } from "@/lib/calc/transfer-tax-api-gb";
import { dispatchGeneralBuilding } from "@/app/api/calc/transfer/general-building-route-helper";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { makeMockRates } from "../_helpers/mock-rates";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

const rates = makeMockRates();

const BUNDLED = 300_000_000;

/** 증축 + 원건물 **실가**(A/B) — `bundledExpenses`가 실제로 소비되는 조합. */
function abAsset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "general_building",
    useEstimatedAcquisition: false,
    fixedAcquisitionPrice: "500000000",
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
    ...over,
  } as AssetForm;
}

function calc(asset: AssetForm) {
  const gbv = buildGeneralBuildingValuation(asset) as Record<string, unknown>;
  const r = dispatchGeneralBuilding(
    gbv, 2_000_000_000, new Date("2024-03-01"), new Date("1999-05-24"),
    (gbv.bundledAcquisitionPrice as number) ?? 0,
    (gbv.bundledExpenses as number) ?? 0,
    2024, 0, [], rates, undefined, {}, undefined,
  ) as unknown as { aggregated: { determinedTax: number } };
  return { nature: gbv.bundledExpenseNature, bundled: gbv.bundledExpenses, tax: r.aggregated.determinedTax };
}

describe("N4 — 두 축이 실제로 다르다", () => {
  it("취득시 토지비중 ≠ 양도시 토지비중 (같으면 계약이 공허해진다)", () => {
    const acqLand = 2_800_000 * 85;
    const acqBuilding = 28_144_700;
    const transferLand = 10_830_000 * 85;
    const transferBuilding = 20_629_440;
    const acqRatio = acqLand / (acqLand + acqBuilding);
    const transferRatio = transferLand / (transferLand + transferBuilding);
    expect(acqRatio).not.toBeCloseTo(transferRatio, 3);
  });
});

describe("N1·N2·N3 — 채택된 후보가 축을 정한다", () => {
  it("🔴 ②(양도비) 채택 → nature=transfer → **양도시** 축", () => {
    const r = calc(abAsset({ transferExpense: String(BUNDLED) }));
    expect(r.nature).toBe("transfer");
    expect(r.bundled).toBe(BUNDLED);
  });

  it("①(전용 필드) 채택 → nature=capital → **취득시** 축", () => {
    const r = calc(abAsset({ gbBundledAcquisitionExpenses: String(BUNDLED) }));
    expect(r.nature).toBe("capital");
    expect(r.bundled).toBe(BUNDLED);
  });

  it("③(legacy) 채택 → nature=mixed → **취득시** 유지", () => {
    const r = calc(abAsset({ directExpenses: String(BUNDLED) }));
    expect(r.nature).toBe("mixed");
    expect(r.bundled).toBe(BUNDLED);
  });

  it("🔴 **세액으로 잰다** — 같은 3억이라도 성질이 다르면 세액이 다르다", () => {
    const asTransfer = calc(abAsset({ transferExpense: String(BUNDLED) }));
    const asCapital = calc(abAsset({ gbBundledAcquisitionExpenses: String(BUNDLED) }));
    // 슬롯에 담긴 금액은 같다 — 다른 것은 **안분 축**뿐이다.
    expect(asTransfer.bundled).toBe(asCapital.bundled);
    expect(asTransfer.tax).not.toBe(asCapital.tax);
  });

  it("③(legacy)는 ①(취득시)과 같은 축이다 — 기존 이력 보존", () => {
    const asMixed = calc(abAsset({ directExpenses: String(BUNDLED) }));
    const asCapital = calc(abAsset({ gbBundledAcquisitionExpenses: String(BUNDLED) }));
    expect(asMixed.tax).toBe(asCapital.tax);
  });
});
