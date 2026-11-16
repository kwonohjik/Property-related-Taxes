/**
 * ⑤ 술어 ≡ ④ 전송 격자 — `landHoldingResidenceDirectHintApplies`(직접 입력 칸 안내 게이트)가 켜지는 자산 ⇔ **같은 폼을 구간 입력으로 바꿨을 때 ④가 겹침 키를 싣는 자산**
 * 계획서: docs/00-pm/split-land-residence-rate-4289.plan.md §8 · V-11 (3중 패턴 — display fallback ≡ API 변환)
 *
 * 세 경로: 분리취득 주 자산(`landHoldingResidenceMonths`) · 겸용주택(`mixedUse.landHoldingResidencePeriodYears`) · 함께 양도 부수토지 카드(`companionAssets[0].landHoldingResidenceMonths`).
 * ④는 구간 입력일 때만 키를 싣는다 — 직접 입력 폼에서 ⑤가 안내를 띄우는지(술어)와 구간 입력으로 바꾼 같은 폼에서 키가 실리는지(④)가 모든 칸에서 같아야 한다.
 * 겸용 ④ 게이트는 `buildMixedLandHoldingResidencePayload`가 `mixedLandHoldingResidenceApplies`를 쓰는지(단일 소스)도 함께 본다.
 */
import { describe, it, expect, vi } from "vitest";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import {
  buildMixedLandHoldingResidencePayload,
  landHoldingResidenceDirectHintApplies,
  mixedLandHoldingResidenceApplies,
} from "@/lib/calc/transfer-land-holding-residence-scope";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

const intervalPatch = { residenceInputMode: "interval", residencePeriods: [{ moveInDate: "2010-06-01", moveOutDate: "2025-01-15" }] } as Partial<AssetForm>;
const directPatch = { residenceInputMode: "direct", residencePeriods: [], residencePeriodMonthsAsset: "178" } as Partial<AssetForm>;

function form(assets: AssetForm[]): TransferFormData {
  return {
    ...createDefaultTransferFormData(),
    transferDate: "2025-01-15",
    filingDate: "2025-03-31",
    contractTotalPrice: "2000000000",
    isOneHousehold: true,
    householdHousingCount: "1",
    householdNoOtherHousesConfirmed: true,
    householdNoPresaleRightsConfirmed: true,
    residencePeriodMonths: "0",
    assets,
  };
}

async function bodyOf(assets: AssetForm[]): Promise<Record<string, unknown>> {
  const cap: { body?: Record<string, unknown> } = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u: string, init?: RequestInit) => {
      cap.body = JSON.parse(String(init?.body));
      return { ok: true, json: async () => ({ mode: "single", result: {} }) } as unknown as Response;
    }),
  );
  try {
    await callTransferTaxAPI(form(assets));
  } finally {
    vi.unstubAllGlobals();
  }
  return cap.body!;
}

const splitBase = (o: Partial<AssetForm>) =>
  ({
    ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 1-1", assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2010-03-01",
    landAcquisitionDate: "2020-03-01", hasSeperateLandAcquisitionDate: true, landAcqMode: "actual", buildingAcqMode: "actual",
    landAcquisitionPrice: "900,000,000", buildingAcquisitionPrice: "100,000,000", actualSalePrice: "2,000,000,000", saleSplitMode: "actual",
    landTransferPrice: "1,400,000,000", buildingTransferPrice: "600,000,000", landStandardPriceAtTransfer: "1,400,000,000",
    buildingStandardPriceAtTransfer: "600,000,000", ...o,
  }) as unknown as AssetForm;

const mixedBase = (o: Partial<AssetForm>) =>
  ({
    ...makeDefaultAsset(1), assetKind: "housing", isMixedUseHouse: true, addressJibun: "서울 강남구 역삼동 1", acquisitionCause: "purchase", acquisitionDate: "2010-03-01",
    hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2020-03-01", useEstimatedAcquisition: false, residentialFloorArea: "150", nonResidentialFloorArea: "100",
    buildingFootprintArea: "100", mixedUseTotalLandArea: "200", mixedZoneType: "general_residential", actualSalePrice: "2500000000", landAcqMode: "actual",
    buildingAcqMode: "actual", landAcquisitionPrice: "600000000", buildingAcquisitionPrice: "300000000", ...o,
  }) as unknown as AssetForm;

const houseBase = (o: Partial<AssetForm>) =>
  ({
    ...makeDefaultAsset(1), assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2014-01-01", fixedAcquisitionPrice: "500000000", actualSalePrice: "1000000000",
    standardPriceAtTransfer: "500000000", addressJibun: "서울 테스트동 1", buildingFootprintArea: "100", appurtenantLandZone: "metropolitan_residential", isUrbanArea: true, ...o,
  }) as unknown as AssetForm;
const cardBase = (o: Partial<AssetForm>) =>
  ({
    ...makeDefaultAsset(2), assetKind: "land", landNature: "appurtenant", acquisitionCause: "purchase", acquisitionDate: "2022-06-01", fixedAcquisitionPrice: "200000000",
    actualSalePrice: "400000000", standardPriceAtTransfer: "200000000", addressJibun: "서울 테스트동 1", acquisitionArea: "200", transferArea: "200", ...o,
  }) as unknown as AssetForm;

type Cell = { name: string; build: (mode: Partial<AssetForm>) => AssetForm[]; sent: (b: Record<string, unknown>) => boolean };
const cells = (family: Cell["sent"], build: (o: Partial<AssetForm>, mode: Partial<AssetForm>) => AssetForm[], variants: [string, Partial<AssetForm>][]): Cell[] =>
  variants.map(([name, o]) => ({ name, build: (mode) => build(o, mode), sent: family }));

const splitSent = (b: Record<string, unknown>) => "landHoldingResidenceMonths" in b;
const mixedSent = (b: Record<string, unknown>) => "landHoldingResidencePeriodYears" in ((b.mixedUse ?? {}) as Record<string, unknown>);
const cardSent = (b: Record<string, unknown>) => "landHoldingResidenceMonths" in (((b.companionAssets as Record<string, unknown>[] | undefined)?.[0]) ?? {});

const GRID: [string, Cell[]][] = [
  [
    "분리취득 주 자산",
    cells(splitSent, (o, m) => [splitBase({ ...o, ...m })], [
      ["토지가 나중", {}],
      ["토지가 먼저", { landAcquisitionDate: "2000-03-01" }],
      ["같은 날", { landAcquisitionDate: "2010-03-01" }],
      ["별개 취득 토글 OFF 잔재", { hasSeperateLandAcquisitionDate: false } as Partial<AssetForm>],
      ["토지만 본인", { selfOwns: "land_only" } as Partial<AssetForm>],
      ["건물만 본인", { selfOwns: "building_only" } as Partial<AssetForm>],
      ["일반건물", { assetKind: "general_building" } as Partial<AssetForm>],
      ["토지 취득일 빈칸", { landAcquisitionDate: "" }],
    ]),
  ],
  [
    "겸용주택",
    cells(mixedSent, (o, m) => [mixedBase({ ...o, ...m })], [
      ["토지가 나중", {}],
      ["토지가 먼저", { landAcquisitionDate: "2000-03-01" }],
      ["같은 날", { landAcquisitionDate: "2010-03-01" }],
      ["토지 취득일 빈칸(건물 취득일로 대체)", { landAcquisitionDate: "" }],
    ]),
  ],
  [
    "함께 양도 부수토지 카드",
    cells(cardSent, (o, m) => [houseBase({ ...m }), cardBase(o)], [
      ["카드가 나중", {}],
      ["카드가 먼저", { acquisitionDate: "2010-01-01" }],
      ["같은 날", { acquisitionDate: "2014-01-01" }],
      ["독립 나대지", { landNature: "standalone" } as Partial<AssetForm>],
    ]),
  ],
];

describe("⑤ 직접 입력 안내 게이트 ≡ ④ 구간 입력 전송(격자)", () => {
  for (const [family, rows] of GRID)
    describe(family, () => {
      for (const c of rows)
        it(c.name, async () => {
          const direct = c.build(directPatch);
          const hint = landHoldingResidenceDirectHintApplies(direct[0], direct);
          const sent = c.sent(await bodyOf(c.build(intervalPatch)));
          expect(hint, c.name).toBe(sent);
          // 구간 입력 폼에서는 어떤 칸에서도 안내하지 않는다(안내 = 직접 입력 칸 전용)
          const iv = c.build(intervalPatch);
          expect(landHoldingResidenceDirectHintApplies(iv[0], iv), `${c.name} · 구간`).toBe(false);
        });
    });

  it("양성 셀이 실제로 켜진다(전 칸 false로 통과하는 거짓 격자 방지) — 세 경로 모두 첫 셀이 true", async () => {
    for (const [family, rows] of GRID) {
      const direct = rows[0].build(directPatch);
      expect(landHoldingResidenceDirectHintApplies(direct[0], direct), family).toBe(true);
      expect(rows[0].sent(await bodyOf(rows[0].build(intervalPatch))), family).toBe(true);
    }
  });

  it("주 자산 직접 입력 + 카드: 첫 자산이 아닌 자산에 거주 칸이 열려도(다른 주택) 카드 승계 안내는 첫 자산에만", () => {
    const first = houseBase({ ...directPatch });
    const other = houseBase({ ...directPatch, assetId: "other-house" } as Partial<AssetForm>);
    const c = cardBase({});
    expect(landHoldingResidenceDirectHintApplies(first, [first, c])).toBe(true);
    expect(landHoldingResidenceDirectHintApplies(other, [first, c])).toBe(false);
  });
});

describe("겸용 ④ 게이트 = ⑤ 술어(단일 소스)", () => {
  const variants: Partial<AssetForm>[] = [
    {}, { landAcquisitionDate: "2000-03-01" }, { landAcquisitionDate: "2010-03-01" }, { landAcquisitionDate: "" },
    { isMixedUseHouse: false } as Partial<AssetForm>, { assetKind: "land" } as Partial<AssetForm>,
  ];
  for (const o of variants)
    it(JSON.stringify(o), () => {
      const a = mixedBase({ ...intervalPatch, ...o });
      expect("landHoldingResidencePeriodYears" in buildMixedLandHoldingResidencePayload(a)).toBe(mixedLandHoldingResidenceApplies(a));
    });
});
