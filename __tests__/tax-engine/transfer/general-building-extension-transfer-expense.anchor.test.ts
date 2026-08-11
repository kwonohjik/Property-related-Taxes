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
import { validateGeneralBuildingAsset } from "@/lib/calc/transfer-tax-validate-gb";
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

/**
 * 원건물 **실가**(조합 A) — 「② 채택 시 제외가 정본」이 성립하는 유일한 축.
 * 그 조합에서만 `bundledExpenses`가 토지·건물1에 실제로 안분되어 **소비**된다.
 *
 * ⚠️ 「분리 **OFF**」가 그 성립의 숨은 전제다 — 분리 ON이면 파트별 취득가액이 정본이라
 *    일괄 경로 자체를 타지 않는다(아래 D-11).
 */
function gbExtAssetOriginActual(over: Partial<AssetForm> = {}): AssetForm {
  return gbExtAsset({
    useEstimatedAcquisition: false,
    fixedAcquisitionPrice: "300,000,000",
    ...over,
  } as Partial<AssetForm>);
}

/** 분리 ON 파트별 자본적지출 — 자산 단위 칸은 V-8이 막으므로 파트 칸으로 옮긴다. */
const PART_CAPEX = 400_000_000;

/**
 * **분리 ON**(토지·건물 취득일 다름) × 증축 — D-11이 사는 축.
 *
 * 토지 실가 + 건물 환산의 **부분 혼합**이며, 이 조합은 분리 ON에서만 만들 수 있다
 * (파트별 산정방식 라디오가 `GeneralBuildingAcquisitionCards`의 분리 ON 분기에만 있다).
 */
function gbExtAssetSeparate(over: Partial<AssetForm> = {}): AssetForm {
  return gbExtAsset({
    hasSeperateLandAcquisitionDate: true,
    landAcquisitionDate: "1999-05-24",
    landAcqMode: "actual",
    buildingAcqMode: "estimated",
    landAcquisitionPrice: "300,000,000",
    useEstimatedAcquisition: false,
    // V-8 — 부분 혼합에서 자산 단위 자본적지출은 validate가 차단한다. 파트 칸이 정본이다.
    capitalExpenditure: "",
    landDirectExpenses: String(PART_CAPEX),
    buildingDirectExpenses: String(PART_CAPEX),
    ...over,
  } as Partial<AssetForm>);
}

function calc(asset: AssetForm) {
  const gbv = buildGeneralBuildingValuation(asset) as Record<string, unknown>;
  const r = dispatchGeneralBuilding(
    gbv,
    2_000_000_000,
    new Date("2024-03-01"),
    new Date("1999-05-24"),
    // 🔑 route.ts와 **같은 식**이어야 한다 — 종전 하드코딩 `0`은 환산 픽스처에서만 무해했고,
    //    원건물 실가 픽스처를 쓰는 순간 일괄 취득가액이 0으로 도달한다(`route.ts` bundledAcq).
    ((gbv.bundledAcquisitionPrice as number | undefined) ?? 0),
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
    /** ④가 실제로 실었는가 — 세액이 같아도 배관이 끊겼는지 여기서 갈린다. */
    transferExpensePayload: gbv.transferExpense as number | undefined,
  };
}

describe("W-1b — 전용 필드 입력(① 채택) 시 양도비가 나목에 들어간다", () => {
  it("🔴 나목 = 자본적지출 + 양도비", () => {
    const r = calc(gbExtAsset({ gbBundledAcquisitionExpenses: String(DEDICATED_BUNDLED) }));
    expect(r.bundledExpenses).toBe(DEDICATED_BUNDLED);
    expect(r.directSide).toBe(CAPEX + TRANSFER_EXP);
  });

  /**
   * 🔄 **차액 갱신(2026-08-08) — 이 테스트의 주제는 그대로다.**
   *
   * 단언하는 것은 「양도비를 나목에 넣느냐 마느냐가 **세액을 실제로 바꾼다**」는 사실이고,
   * 그 성질은 불변이다(`directSide` 단언도 그대로 통과한다). 바뀐 것은 **차액의 크기**다.
   *
   * 이 픽스처는 분리 OFF · **환산 모드** · 증축 조합인데, 종전에는 그 조합에서 원건물
   * 취득가액이 **0**이었다 — `route-helper`가 `actualBundledAcquisitionPrice`를 항상 주입해
   * 조합 C/D(환산 산식)에 도달하지 못했기 때문이다. 즉 가목(환산취득가 + 개산공제)이
   * 개산공제뿐이었고, 그 위에서 잰 차액이 121,962,280이었다.
   *
   * 그 결함을 고치면서(`general-building-extension.ts` — 환산 파트는 §176의2② 산식을 쓴다)
   * 가목이 실제 값을 갖게 됐고, §97②2호 단서의 겨루기가 달라져 차액이 **92,942,585**가 됐다.
   * 세액 자체도 내려간다 — 취득가액이 0에서 실제 환산취득가로 올라갔으므로 당연하다.
   *
   * 근거 anchor: `__tests__/tax-engine/transfer-tax/gb-extension-part-acq-date.anchor.test.ts`
   * (「분리 OFF + 증축 + 환산 모드에서 취득가액이 0이 아니다」).
   */
  it("🔄 세액이 실제로 달라진다 — 양도비를 나목에 넣는 것의 차액", () => {
    const fixed = calc(gbExtAsset({ gbBundledAcquisitionExpenses: String(DEDICATED_BUNDLED) }));
    // 양도비를 빼면(=종전 동작) 나목이 자본적지출만 남는다.
    const asIfExcluded = calc(
      gbExtAsset({ gbBundledAcquisitionExpenses: String(DEDICATED_BUNDLED), transferExpense: "0" }),
    );
    expect(asIfExcluded.directSide).toBe(CAPEX);
    expect(asIfExcluded.tax - fixed.tax).toBe(92_942_585);
  });
});

/**
 * ② 채택(전용 필드 미입력)에서는 **제외가 정본**이다.
 * 「고쳤으니 무조건 넣자」로 되돌리면 같은 3억이 두 번 반영돼 **과소납부**가 된다.
 *
 * 🔄 **픽스처를 원건물 실가(조합 A)로 옮겼다** (2026-08-12 D-10).
 *
 * 종전에는 이 단언이 **환산 픽스처**(`gbExtAsset()` = 조합 C)로 쓰여 있었다. 그런데 조합 C에서는
 * `bundledExpenses`가 **아무 데도 소비되지 않는다** — `general-building-extension.ts`가 환산 파트의
 * 필요경비를 개산공제로 덮기 때문이다(2026-08-08 변경). 즉 「이미 소비했으니 빼자」는 이 규칙의
 * 전제가 그 조합에서만 무너져 있었고, 결과는 **양도비가 §97②2호 나목에서 통째로 누락**이었다
 * (실측 결정세액 28,979,117원 과대).
 *
 * ⇒ 규칙 자체는 유효하다. **성립하는 축(원건물 실가)** 으로 픽스처를 옮긴다.
 *   조합 C·D의 반대 단언은 바로 아래 describe가 맡는다.
 * 계획서: `docs/02-design/features/transfer-gb-extension-4mode-matrix.plan.md` §4 D-10
 */
describe("W-1b — 원건물 실가 + 전용 필드 미입력(② 채택) 시 제외가 정본", () => {
  it("🔴 bundledExpenses가 곧 양도비다 — 나목에 또 넣지 않는다", () => {
    const r = calc(gbExtAssetOriginActual());
    expect(r.bundledExpenses).toBe(TRANSFER_EXP);
    expect(r.directSide).toBe(CAPEX);
  });

  it("전용 필드를 입력하면 ①에서 멈추고 양도비가 나목에 들어간다 (대조군)", () => {
    const r = calc(
      gbExtAssetOriginActual({ gbBundledAcquisitionExpenses: String(DEDICATED_BUNDLED) }),
    );
    expect(r.bundledExpenses).toBe(DEDICATED_BUNDLED);
    expect(r.directSide).toBe(CAPEX + TRANSFER_EXP);
  });
});

/**
 * 🔴 **D-10 — 원건물 환산(조합 C·D)에서는 전용 필드 미입력이어도 양도비를 나목에 넣는다.**
 *
 * 「소득세법」 제97조 제2항 제2호 **단서 나목** = 「제1항제2호 **및** 제3호에 따른 금액의 **합계액**」
 * ⇒ 양도비를 조건 없이 포함한다. 빼는 유일한 정당화는 **이중계상**인데, 원건물이 양쪽 다 환산이면
 * `bundledExpenses`가 소비되지 않으므로 그 정당화가 성립하지 않는다.
 *
 * ⚠️ 이 단언과 바로 위 describe는 **대조군 쌍**이다 — 한쪽만 보면 「무조건 포함」이나
 *    「무조건 제외」로 되돌아간다. 둘 다 틀렸다는 것이 W-1b·D-10의 결론이다.
 */
describe("D-10 — 원건물 환산이면 전용 필드 미입력이어도 나목에 포함", () => {
  it("🔴 나목 = 자본적지출 + 양도비 (bundledExpenses는 소비되지 않는다)", () => {
    const r = calc(gbExtAsset());
    expect(r.bundledExpenses).toBe(TRANSFER_EXP); // fallback ②가 집기는 한다
    expect(r.directSide).toBe(CAPEX + TRANSFER_EXP); // 그러나 소비되지 않으므로 나목에 포함
  });

  it("세액이 실제로 달라진다 — 양도비를 뺀 종전 동작과의 차액", () => {
    const withExp = calc(gbExtAsset());
    const withoutExp = calc(gbExtAsset({ transferExpense: "0" }));
    expect(withoutExp.directSide).toBe(CAPEX);
    expect(withoutExp.tax).toBeGreaterThan(withExp.tax);
  });
});

/**
 * 🔴 **D-11 — 분리 ON(토지·건물 취득일 다름)에서도 전용 필드 미입력이어야 양도비를 나목에 넣는다.**
 *
 * 계획서 §14 O-3을 실측으로 종결한 항목이다. 종전 서술은 「부분 혼합은 실가 파트가
 * `bundledExpenses`를 **실제로 소비**하므로 이중계상 위험이 남는다」였는데, **그 전제가 틀렸다**.
 *
 * ── 실측 (2026-08-12) ────────────────────────────────────────────────────
 * 분리 ON에서는 파트별 취득가액이 정본이라 **일괄 경로 자체를 타지 않는다**:
 *   · `gbBundledAcquisitionExpenses`를 0 → 5억으로 바꿔도 토지 카드 필요경비·결정세액 **불변**
 *   · stale `fixedAcquisitionPrice` 9억이 payload에 실려도 토지 취득가액은 **파트 가격 그대로**
 *   ⇔ 대조군(분리 OFF·조합 A)은 같은 mutation에서 토지 필요경비 0 → 333,333,333,
 *      결정세액 155,801,082 → 17,789,329으로 **크게 반응한다**
 *
 * ⇒ 이중계상이 성립하지 않는데도 양도비가 §97②2호 나목에서 통째로 빠졌다.
 *   실측 **결정세액 58,948,319원 과대**(양도비 3억 · 별도 픽스처 기준 — probe 원값).
 *
 * 범위는 부분 혼합에 한정되지 않는다 — **분리 ON × 증축 전부**(둘 다 실가 포함)가 같은 결함이다.
 *
 * ⚠️ 위 「원건물 실가 + 전용 필드 미입력(② 채택) 시 제외가 정본」 describe와 **대조군 쌍**이다.
 *    그쪽은 분리 **OFF**라 일괄 경로를 타고, 이쪽은 분리 **ON**이라 타지 않는다.
 *    한쪽만 보면 다시 「무조건 포함」·「무조건 제외」로 되돌아간다.
 */
describe("D-11 — 분리 ON × 증축이면 전용 필드 미입력이어도 나목에 포함", () => {
  it("전제 — 부분 혼합 × 증축 픽스처가 validate를 통과한다", () => {
    expect(
      validateGeneralBuildingAsset(gbExtAssetSeparate(), "자산1", "2024-03-01"),
    ).toBeNull();
  });

  it("🔴 ④가 transferExpense를 싣는다 (종전에는 침묵 drop)", () => {
    const r = calc(gbExtAssetSeparate());
    expect(r.transferExpensePayload).toBe(TRANSFER_EXP);
  });

  it("🔴 세액이 실제로 달라진다 — 양도비를 뺀 종전 동작과의 차액", () => {
    const withExp = calc(gbExtAssetSeparate());
    const withoutExp = calc(gbExtAssetSeparate({ transferExpense: "0" }));
    expect(withoutExp.transferExpensePayload).toBeUndefined();
    expect(withoutExp.tax).toBeGreaterThan(withExp.tax);
  });

  it("분리 ON × 둘 다 실가에서도 싣는다 — 부분 혼합에 한정된 결함이 아니다", () => {
    const r = calc(
      gbExtAssetSeparate({
        buildingAcqMode: "actual",
        buildingAcquisitionPrice: "150,000,000",
      }),
    );
    expect(r.transferExpensePayload).toBe(TRANSFER_EXP);
  });

  /**
   * 🔑 **이 mutation이 D-11의 근거를 고정한다.**
   *
   * 「소비되지 않으므로 이중계상이 아니다」가 수정의 유일한 정당화이므로, 소비되지 않는다는
   * 사실 자체를 테스트가 붙들어야 한다. 엔진이 나중에 분리 ON에서도 일괄 경비를 소비하도록
   * 바뀌면 이 단언이 먼저 깨져 D-11 전제를 재검토하게 만든다
   * (메모리 `feedback_negative_assertion_needs_mutation_probe`).
   */
  it("🔑 근거 mutation — 분리 ON에서는 일괄 필요경비를 바꿔도 세액이 불변이다", () => {
    // ⚠️ **양도비를 0으로 고정**해야 한 변수만 움직인다. 양도비가 있으면
    //    `gbBundledAcquisitionExpenses` 입력이 위 게이트까지 함께 열어 두 효과가 섞인다.
    const zero = calc(gbExtAssetSeparate({ transferExpense: "0", gbBundledAcquisitionExpenses: "0" }));
    const huge = calc(
      gbExtAssetSeparate({ transferExpense: "0", gbBundledAcquisitionExpenses: "500,000,000" }),
    );
    expect(huge.tax).toBe(zero.tax);
  });

  it("🔑 대조군 — 분리 OFF(조합 A)에서는 같은 mutation이 세액을 바꾼다", () => {
    const zero = calc(
      gbExtAssetOriginActual({ transferExpense: "0", gbBundledAcquisitionExpenses: "0" }),
    );
    const huge = calc(
      gbExtAssetOriginActual({ transferExpense: "0", gbBundledAcquisitionExpenses: "500,000,000" }),
    );
    expect(huge.tax).not.toBe(zero.tax);
  });
});

describe("비-증축은 종전대로 항상 포함", () => {
  it("나목 = 자본적지출 + 양도비", () => {
    const r = calc(gbExtAsset({ gbHasExtension: false }));
    expect(r.directSide).toBe(CAPEX + TRANSFER_EXP);
  });
});
