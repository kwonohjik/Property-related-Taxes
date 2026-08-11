/**
 * anchor — 일반건물 증축 **4조합**(원건물 실가/환산 × 증축분 실가/환산)
 *
 * 계획서: `docs/02-design/features/transfer-gb-extension-4mode-matrix.plan.md`
 *
 * ## 무엇을 잡는가
 *
 * 엔진(`general-building-extension.ts`)은 4조합의 취득가액 산식을 갖추고 있으나, 그 위 계층이
 * 조합에 따라 값을 흘린다. 이 파일은 **폼 → ④ API 변환 → ⑫ Zod → ⑭ Route → 엔진**을
 * 통째로 태워 조합별 결과를 잰다.
 *
 * ### D-1 — 증축 실가 모드에서 「양도시 건물2 기준시가」가 payload에서 소실된다
 *
 * `transfer-tax-api-gb.ts` `buildExtensionInfo`의 `mode === "actual"` 분기가
 * `transferExtensionBuildingStdPrice`를 싣지 않아 엔진 `extStdTotal`이 0이 된다
 * ⇒ §166⑥ 3-way 안분 분모에서 건물2가 빠지고 **건물2 양도가액이 0**이 된다.
 * UI는 그 칸을 실가 모드에서도 렌더한다(`GeneralBuildingBlock.tsx:592-603`) — 받는데 안 보낸다.
 *
 * ### D-10 — 조합 C·D에서 양도비가 §97②2호 나목에서 부당하게 배제된다
 *
 * `transfer-tax-api-gb.ts:481` 게이트는 「`bundledExpenses`가 양도비를 이미 소비하므로 뺀다」는
 * 전제인데, **원건물 환산(C·D)에서는 `bundledExpenses`가 아무 데도 소비되지 않는다** —
 * `general-building-extension.ts:328-338`이 개산공제로 덮기 때문이다(2026-08-08 변경으로 전제가 무너졌다).
 *
 * 「소득세법」 제97조 제2항 제2호 단서 나목은 「제1항제2호 **및** 제3호에 따른 금액의 **합계액**」
 * (= 자본적지출 + 양도비)이므로, 이중계상이 성립하지 않는 조합에서 양도비를 빼면 조문에 반한다.
 *
 * ## 대조군으로 읽을 것
 *
 * 조합 A·C만 통과하는 것은 구별력이 없다 — **네 조합을 한 파일에 두고 쌍으로** 본다
 * (메모리 `feedback_anchor_observes_wrong_stage`).
 */
import { describe, it, expect } from "vitest";
import { buildGeneralBuildingValuation } from "@/lib/calc/transfer-tax-api-gb";
import { validateGeneralBuildingAsset } from "@/lib/calc/transfer-tax-validate-gb";
import { generalBuildingValuationSchema } from "@/lib/api/transfer-tax-building-schemas";
import { dispatchGeneralBuilding } from "@/app/api/calc/transfer/general-building-route-helper";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { makeMockRates } from "../_helpers/mock-rates";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

const rates = makeMockRates();

// ── 픽스처 (계획서 §3.1) ────────────────────────────────────────────────
const TRANSFER_PRICE = 1_000_000_000;
const TRANSFER_DATE = "2024-06-01";
const ACQ_DATE = "2005-03-01";

/**
 * §166⑥ 3-way 안분 — 손계산 정본.
 *   토지  기준시가 = 3,000,000 × 200 = 600,000,000
 *   건물1 기준시가 =                   200,000,000
 *   건물2 기준시가 =                    50,000,000
 *   분모           =                   850,000,000
 */
const LAND_TRANSFER = 705_882_352; // floor(10억 × 600/850)
const BLD1_TRANSFER = 235_294_117; // floor(10억 × 200/850)
const BLD2_TRANSFER = 58_823_531; // 잔액 흡수

function gbAsset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "general_building",
    acquisitionCause: "purchase",
    acquisitionDate: ACQ_DATE,
    gbLandArea: "200",
    gbBuildingArea: "300",
    gbBuildingFootprintArea: "100",
    gbZoneType: "commercial",
    gbIsMetropolitan: true,
    gbTransferLandPricePerSqm: "3,000,000",
    gbTransferBuildingValue: "200,000,000",
    gbAcqLandPricePerSqm: "1,000,000",
    gbAcqBuildingValue: "100,000,000",
    gbBuildingAcquisitionCause: "purchase",
    gbHasExtension: true,
    gbExtensionDate: "2012-05-01",
    gbExtensionAcquisitionCause: "newConstruction",
    gbTransferExtensionBuildingStdPrice: "50,000,000",
    gbAcquisitionExtensionBuildingStdPrice: "40,000,000",
    ...over,
  } as AssetForm;
}

/** 원건물 실가(A·B) — 일괄 취득가 3억. */
const originActual = { useEstimatedAcquisition: false, fixedAcquisitionPrice: "300,000,000" };
/** 원건물 환산(C·D). */
const originEstimated = { useEstimatedAcquisition: true };
/** 증축분 환산(A·C). */
const extEstimated = { gbExtensionAcquisitionMode: "estimated" as const };
/** 증축분 실가(B·D). */
const extActual = {
  gbExtensionAcquisitionMode: "actual" as const,
  gbExtensionActualAcquisitionPrice: "80,000,000",
  gbExtensionActualExpenses: "3,000,000",
};

const COMBOS = [
  { id: "A", label: "원건물 실가 + 증축 환산", over: { ...originActual, ...extEstimated } },
  { id: "B", label: "원건물 실가 + 증축 실가", over: { ...originActual, ...extActual } },
  { id: "C", label: "원건물 환산 + 증축 환산", over: { ...originEstimated, ...extEstimated } },
  { id: "D", label: "원건물 환산 + 증축 실가", over: { ...originEstimated, ...extActual } },
] as const;

interface CardOut {
  propertyId: string;
  transferPrice: number;
  acquisitionPrice: number;
  expenses: number;
  usedEstimatedAcquisition: boolean;
}

/** 폼 → ④ → ⑫ → ⑭ → 엔진 전 구간. */
function runCombo(over: Partial<AssetForm>) {
  const asset = gbAsset(over);
  const validateError = validateGeneralBuildingAsset(asset, "자산1", TRANSFER_DATE);
  const gbv = buildGeneralBuildingValuation(asset, TRANSFER_DATE) as Record<string, unknown>;
  // ⑫ Zod를 실제로 통과시킨다 — 침묵 strip이 있으면 여기서 값이 사라진다.
  const parsed = generalBuildingValuationSchema.parse(gbv) as unknown as Record<string, unknown>;
  const result = dispatchGeneralBuilding(
    gbv,
    TRANSFER_PRICE,
    new Date(TRANSFER_DATE),
    new Date(ACQ_DATE),
    (gbv.bundledAcquisitionPrice as number | undefined) ?? 0,
    (gbv.bundledExpenses as number | undefined) ?? 0,
    2024,
    0,
    [],
    rates,
    undefined,
    {},
    undefined,
  ) as unknown as {
    aggregated: {
      determinedTax: number;
      generalBuildingValuationDetail?: { assetCards: CardOut[] };
    };
  };
  const cards = result.aggregated.generalBuildingValuationDetail?.assetCards ?? [];
  const card = (id: string) => cards.find((c) => c.propertyId === id);
  return {
    validateError,
    payload: gbv,
    parsed,
    tax: result.aggregated.determinedTax,
    land: card("land"),
    bld1: card("building1"),
    bld2: card("building2"),
  };
}

// ── 전제 ────────────────────────────────────────────────────────────────

describe("전제 — 4조합이 모두 validate·Zod를 통과한다", () => {
  for (const c of COMBOS) {
    it(`${c.id} ${c.label}`, () => {
      const r = runCombo(c.over);
      expect(r.validateError).toBeNull();
      expect(r.land).toBeDefined();
      expect(r.bld1).toBeDefined();
      expect(r.bld2).toBeDefined();
    });
  }
});

// ── D-1: §166⑥ 3-way 양도가액 안분 ──────────────────────────────────────

describe("D-1 — 증축분 양도가액은 취득 방식과 무관하게 §166⑥ 기준시가 비율이다", () => {
  for (const c of COMBOS) {
    it(`${c.id} ${c.label} — 건물2 양도가액 = ${BLD2_TRANSFER.toLocaleString()}`, () => {
      const r = runCombo(c.over);
      expect(r.bld2!.transferPrice).toBe(BLD2_TRANSFER);
    });
  }

  for (const c of COMBOS) {
    it(`${c.id} — 토지·건물1 양도가액도 3-way 비율을 따른다`, () => {
      const r = runCombo(c.over);
      expect(r.land!.transferPrice).toBe(LAND_TRANSFER);
      expect(r.bld1!.transferPrice).toBe(BLD1_TRANSFER);
    });
  }

  for (const c of COMBOS) {
    it(`${c.id} — 3파트 합계 = 총 양도가액 (잔액 흡수 정합성)`, () => {
      const r = runCombo(c.over);
      expect(r.land!.transferPrice + r.bld1!.transferPrice + r.bld2!.transferPrice).toBe(
        TRANSFER_PRICE,
      );
    });
  }
});

describe("D-1 배관 — ④가 「양도시 건물2 기준시가」를 실가 모드에서도 싣는다", () => {
  for (const c of COMBOS) {
    it(`${c.id} ${c.label} — extensionInfo.transferExtensionBuildingStdPrice = 50,000,000`, () => {
      const r = runCombo(c.over);
      const ext = r.payload.extensionInfo as Record<string, unknown>;
      expect(ext.transferExtensionBuildingStdPrice).toBe(50_000_000);
    });

    it(`${c.id} — ⑫ Zod 통과 후에도 남는다 (침묵 strip 금지)`, () => {
      const r = runCombo(c.over);
      const ext = r.parsed.extensionInfo as Record<string, unknown>;
      expect(ext.transferExtensionBuildingStdPrice).toBe(50_000_000);
    });
  }
});

// ── 취득가액 축 — 조합별로 산식이 갈린다 (대조군) ────────────────────────

describe("취득가액 — 조합별 산식 (대조군 쌍)", () => {
  it("A·B(원건물 실가) — 토지·건물1은 일괄 취득가 3억의 취득시 기준시가 안분", () => {
    // 취득시 토지 2억 : 건물1 1억 = 2:1 ⇒ 토지 2억, 건물1 1억
    for (const id of ["A", "B"] as const) {
      const r = runCombo(COMBOS.find((c) => c.id === id)!.over);
      expect(r.land!.acquisitionPrice).toBe(200_000_000);
      expect(r.bld1!.acquisitionPrice).toBe(100_000_000);
      expect(r.land!.usedEstimatedAcquisition).toBe(false);
      expect(r.bld1!.usedEstimatedAcquisition).toBe(false);
    }
  });

  it("C·D(원건물 환산) — §176의2② 환산 + §163⑥ 개산공제", () => {
    for (const id of ["C", "D"] as const) {
      const r = runCombo(COMBOS.find((c) => c.id === id)!.over);
      // 토지: 안분양도가 × (취득시 2억 ÷ 양도시 6억)
      expect(r.land!.acquisitionPrice).toBe(Math.floor((LAND_TRANSFER * 200_000_000) / 600_000_000));
      expect(r.bld1!.acquisitionPrice).toBe(
        Math.floor((BLD1_TRANSFER * 100_000_000) / 200_000_000),
      );
      expect(r.land!.usedEstimatedAcquisition).toBe(true);
      expect(r.bld1!.usedEstimatedAcquisition).toBe(true);
      // 개산공제 = 취득시 기준시가 × 3%
      expect(r.land!.expenses).toBe(6_000_000);
      expect(r.bld1!.expenses).toBe(3_000_000);
    }
  });

  it("A·C(증축 환산) — 건물2는 §176의2② 환산 + 개산공제 4천만×3%", () => {
    for (const id of ["A", "C"] as const) {
      const r = runCombo(COMBOS.find((c) => c.id === id)!.over);
      expect(r.bld2!.acquisitionPrice).toBe(Math.floor((BLD2_TRANSFER * 40_000_000) / 50_000_000));
      expect(r.bld2!.usedEstimatedAcquisition).toBe(true);
      expect(r.bld2!.expenses).toBe(1_200_000);
    }
  });

  it("B·D(증축 실가) — 건물2는 실지거래가액 + 실제 필요경비, 개산공제 없음", () => {
    for (const id of ["B", "D"] as const) {
      const r = runCombo(COMBOS.find((c) => c.id === id)!.over);
      expect(r.bld2!.acquisitionPrice).toBe(80_000_000);
      expect(r.bld2!.usedEstimatedAcquisition).toBe(false);
      expect(r.bld2!.expenses).toBe(3_000_000);
    }
  });
});

// ── D-10: §97②2호 나목에 양도비가 들어가는가 ─────────────────────────────

/**
 * 원건물 환산(C·D)에서는 `bundledExpenses`가 소비되지 않으므로 이중계상이 성립하지 않는다.
 * ⇒ 양도비는 나목(§97②2호 나목 = 제1항제2호 **및** 제3호의 합계액)에 들어가야 한다.
 *
 * 원건물 실가(A·B)는 `bundledExpenses` fallback ②가 양도비를 소비하므로 **현행 규칙 유지**가 정본이다
 * (전용 필드 `gbBundledAcquisitionExpenses` 입력 시에만 나목에 싣는다 — W-1b).
 */
describe("D-10 — 조합 C·D는 양도비를 나목에 싣는다 (전용 필드 미입력 시에도)", () => {
  const withExpenses = { capitalExpenditure: "20,000,000", transferExpense: "10,000,000" };

  for (const id of ["C", "D"] as const) {
    it(`${id} — payload.transferExpense = 10,000,000`, () => {
      const r = runCombo({ ...COMBOS.find((c) => c.id === id)!.over, ...withExpenses });
      expect(r.payload.transferExpense).toBe(10_000_000);
    });
  }

  for (const id of ["A", "B"] as const) {
    it(`${id} — 전용 필드 미입력이면 제외가 정본 (bundledExpenses가 소비한다)`, () => {
      const r = runCombo({ ...COMBOS.find((c) => c.id === id)!.over, ...withExpenses });
      expect(r.payload.transferExpense).toBeUndefined();
      expect(r.payload.bundledExpenses).toBe(10_000_000);
    });

    it(`${id} — 전용 필드를 입력하면 나목에 실린다`, () => {
      const r = runCombo({
        ...COMBOS.find((c) => c.id === id)!.over,
        ...withExpenses,
        gbBundledAcquisitionExpenses: "5,000,000",
      } as Partial<AssetForm>);
      expect(r.payload.transferExpense).toBe(10_000_000);
      expect(r.payload.bundledExpenses).toBe(5_000_000);
    });
  }
});

/**
 * 🔑 **mutation 대조군** — 조합 C에서 `bundledExpenses`는 실제로 소비되지 않는다.
 *
 * 이 사실이 D-10의 근거다. 값을 바꿔도 토지·건물1의 필요경비가 개산공제(6,000,000·3,000,000)에
 * 고정되면, 그 슬롯은 「이미 소비했으니 나목에서 빼자」는 전제를 지탱하지 못한다.
 */
describe("D-10 근거 — 조합 C에서 bundledExpenses는 소비되지 않는다", () => {
  it("일괄 필요경비를 바꿔도 토지·건물1 필요경비는 개산공제 그대로다", () => {
    const base = COMBOS.find((c) => c.id === "C")!.over;
    const a = runCombo({ ...base, capitalExpenditure: "20,000,000", transferExpense: "10,000,000" });
    const b = runCombo({
      ...base,
      capitalExpenditure: "20,000,000",
      transferExpense: "10,000,000",
      gbBundledAcquisitionExpenses: "5,000,000",
    } as Partial<AssetForm>);
    expect(a.payload.bundledExpenses).not.toBe(b.payload.bundledExpenses); // 입력은 달라졌다
    expect(a.land!.expenses).toBe(6_000_000);
    expect(b.land!.expenses).toBe(6_000_000);
    expect(a.bld1!.expenses).toBe(3_000_000);
    expect(b.bld1!.expenses).toBe(3_000_000);
  });
});
