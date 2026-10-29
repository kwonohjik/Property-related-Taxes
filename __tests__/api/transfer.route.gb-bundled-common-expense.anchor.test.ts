/**
 * anchor — 일반건물 × 함께 양도(다른 물건 묶음) × 폼 상단 「총 양도비」 (계획서 `docs/00-pm/gb-total-transfer-expense-loss.plan.md` 결함 B · §5.2)
 *
 * 종전: 신고 단위 공통 양도비의 일반건물 몫(`allocatedExpenses` = 직접 + 공통)이 legacy `expenses` 채널로만 와서
 *   · 실가+실가(선언 채널 없음)만 파트로 나뉘었고
 *   · 혼합(감정·매매사례)·환산 포함 경로에서는 일반건물 payload 에 닿지 않아 몫 전체가 소실됐고
 *   · 선언 채널(자산 칸 자본적지출)이 있으면 실가 경로에서도 legacy 가 후퇴해 소실됐다.
 *
 * 약속: **총 양도비 N 한 번 입력 ≡ 각 자산 양도비 칸에 몫(양도가액 비례, 마지막 자산 잔액 흡수) 직접 입력** (소득세법 §100② 후문 · §97②1호·2호).
 *
 *   BC-1~3  혼합 · 환산+환산 · 실가+실가(회귀) — 오라클 값을 ±0 으로 고정
 *   BC-4    총 양도비 ≡ 자산 칸 몫 (live 대조) — 모드 5조합 × 주/컴패니언 위치 × 선언 채널 유무
 *   BC-5    총 양도비 없음 → 불변
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { allIssues, captureBody, newForm } from "../calc/_one-house-pr3a-calc-route";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { CARRYOVER_DEFAULTS } from "@/lib/stores/calc-wizard-asset-carryover";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});



const T = 1_600_000_000;
const BASE: Partial<AssetForm> = {
  assetKind: "general_building", addressJibun: "서울 강남구 역삼동 1",
  gbAcqLandPricePerSqm: "1000000", gbAcqBuildingValue: "150000000", gbLandArea: "205", gbBuildingArea: "300", gbBuildingFootprintArea: "135",
  gbZoneType: "general_residential", gbTransferLandPricePerSqm: "5514000", gbTransferBuildingValue: "259072400", actualSalePrice: String(T),
  acquisitionCause: "purchase", gbBuildingAcquisitionCause: "purchase", hasSeperateLandAcquisitionDate: true,
  landAcquisitionDate: "2005-05-01", acquisitionDate: "2010-05-01", useEstimatedAcquisition: true,
  landAcqMode: "actual", landAcquisitionPrice: "400000000", buildingAcqMode: "appraisal", buildingAcquisitionPrice: "200000000",
};
const ACTUAL = { buildingAcqMode: "actual", buildingAcquisitionPrice: "200000000" } as Partial<AssetForm>;
const ESTIMATED = { landAcqMode: "estimated", landAcquisitionPrice: "", buildingAcqMode: "estimated", buildingAcquisitionPrice: "" } as Partial<AssetForm>;
const LAND_EST_BLD_ACT = { landAcqMode: "estimated", landAcquisitionPrice: "", buildingAcqMode: "actual", buildingAcquisitionPrice: "200000000" } as Partial<AssetForm>;
const LAND_ACT_BLD_EST = { buildingAcqMode: "estimated", buildingAcquisitionPrice: "" } as Partial<AssetForm>;
const gbAsset = (id: number, ...over: Partial<AssetForm>[]) => Object.assign({ ...makeDefaultAsset(id) }, BASE, ...over) as AssetForm;
const landAsset = (id: number, over: Partial<AssetForm> = {}) =>
  ({
    ...makeDefaultAsset(id), addressJibun: "서울 강남구 테스트동 2-2", assetKind: "land", acquisitionCause: "purchase", acquisitionDate: "2012-01-01",
    acquisitionArea: "100", transferArea: "100", landNature: "standalone", standardPriceAtAcq: "100000000", standardPriceAtTransfer: "200000000",
    actualSalePrice: "400000000", fixedAcquisitionPrice: "100000000", ...over,
  }) as unknown as AssetForm;
const bundle = (assets: AssetForm[], over: Record<string, unknown> = {}): TransferFormData => {
  const f = newForm() as unknown as Record<string, unknown>;
  Object.assign(f, {
    transferDate: "2026-02-16", filingDate: "2026-05-31", assets, assetSplitMode: "companion", bundledSaleMode: "actual",
    contractTotalPrice: "2000000000", ...over,
  });
  return f as unknown as TransferFormData;
};
async function run(f: TransferFormData) {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
      body: JSON.stringify(await captureBody(f)),
    }),
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const j = (await res.json()) as any;
  expect(res.status, `${JSON.stringify(j.error)} ${String(allIssues(f)).slice(0, 120)}`).toBe(200);
  const ps = j.data.aggregated.properties as { propertyId: string; necessaryExpense: number }[];
  return { tax: j.data.aggregated.calculatedTax as number, cards: ps.map((p) => p.necessaryExpense) };
}
/** 총 양도비 한 번 입력 — 일반건물이 주 자산 */
const viaTotal = (gb: Partial<AssetForm>[], total: string) => bundle([gbAsset(1, ...gb), landAsset(2)], { totalTransferExpense: total });
/** 오라클 — 각 자산 칸에 몫만큼 직접 입력(양도가액 80% : 20%, 마지막 자산 잔액 흡수) */
const viaAssets = (gb: Partial<AssetForm>[], gbShare: string, landShare: string) =>
  bundle([gbAsset(1, ...gb, { transferExpense: gbShare }), landAsset(2, { transferExpense: landShare })]);

describe("BC-1~3 총 양도비의 일반건물 몫이 파트 필요경비에 닿는다 (일반건물 80% · 토지 20%)", () => {
  it("BC-1 혼합(토지 실가 + 건물 감정) · 총 5,000,000 → 일반건물 몫 4,000,000 이 토지 3,254,168 로(감정 건물은 개산공제 4,500,000 그대로), 토지 자산 1,000,000", async () => {
    const r = await run(viaTotal([], "5000000"));
    expect(r.cards).toEqual([3_254_168, 4_500_000, 1_000_000]);
    expect(r.tax).toBe(345_147_874);
  });

  it("BC-2 환산+환산 · 총 1,500,000,000(단서 발동 규모) → 일반건물 몫 1,200,000,000 이 나목으로 채택", async () => {
    const r = await run(viaTotal([ESTIMATED], "1500000000"));
    expect(r.cards).toEqual([692_957_747, 507_042_253, 300_000_000]);
    expect(r.tax).toBe(61_717_089);
  });

  it("BC-3 (회귀) 실가+실가 · 총 5,000,000 → 종전과 같다 3,254,168 + 745,832 (Σ 5,000,000)", async () => {
    const r = await run(viaTotal([ACTUAL], "5000000"));
    expect(r.cards).toEqual([3_254_168, 745_832, 1_000_000]);
    expect(r.cards.reduce((s, v) => s + v, 0)).toBe(5_000_000);
    expect(r.tax).toBe(346_251_600);
  });
});

describe("BC-4 총 양도비 ≡ 자산 칸 몫 (live 대조)", () => {
  const MODES: [string, Partial<AssetForm>[], string, string, string][] = [
    ["혼합", [], "5000000", "4000000", "1000000"],
    ["환산+환산", [ESTIMATED], "1500000000", "1200000000", "300000000"],
    ["실가+실가", [ACTUAL], "5000000", "4000000", "1000000"],
    ["토지 환산 + 건물 실가", [LAND_EST_BLD_ACT], "5000000", "4000000", "1000000"],
    ["토지 실가 + 건물 환산", [LAND_ACT_BLD_EST], "5000000", "4000000", "1000000"],
  ];
  it.each(MODES)("%s — 일반건물이 주 자산", async (_t, gb, total, gbShare, landShare) => {
    const a = await run(viaTotal(gb, total));
    const b = await run(viaAssets(gb, gbShare, landShare));
    expect(a.cards).toEqual(b.cards);
    expect(a.tax).toBe(b.tax);
  });

  it.each(MODES)("%s — 일반건물이 컴패니언(토지가 주 자산)", async (_t, gb, total, gbShare, landShare) => {
    const a = await run(bundle([landAsset(1), gbAsset(2, ...gb)], { totalTransferExpense: total }));
    const b = await run(bundle([landAsset(1, { transferExpense: landShare }), gbAsset(2, ...gb, { transferExpense: gbShare })]));
    expect(a.cards).toEqual(b.cards);
    expect(a.tax).toBe(b.tax);
  });

  it("선언 채널(일반건물 자산 칸 자본적지출 10,000,000)이 있어도 몫이 합산된다 — 실가+실가 · 혼합 · 환산+환산", async () => {
    for (const [gb, total, gbShare, landShare] of [
      [[ACTUAL], "5000000", "4000000", "1000000"],
      [[], "5000000", "4000000", "1000000"],
      [[ESTIMATED], "1500000000", "1200000000", "300000000"],
    ] as const) {
      const withCapex = [...gb, { capitalExpenditure: "10000000" } as Partial<AssetForm>];
      const a = await run(viaTotal(withCapex, total));
      const b = await run(viaAssets(withCapex, gbShare, landShare));
      expect(a.cards).toEqual(b.cards);
      expect(a.tax).toBe(b.tax);
    }
  });
});

describe("BC-5 (회귀) 총 양도비가 없으면 종전 그대로", () => {
  it("혼합 · 총 0 → 토지 0 · 건물 개산공제 · 토지 자산 0", async () => {
    const r = await run(viaTotal([], ""));
    expect(r.cards).toEqual([0, 4_500_000, 0]);
    expect(r.tax).toBe(346_407_000);
  });
});

describe("BC-6 증축 일반건물 — 새 입력(선언 채널)은 몫이 합산된다 · 이전 형식 직접분이 있으면 종전 그대로", () => {
  const EXT_ACTUAL = {
    gbHasExtension: true, gbExtensionDate: "2018-05-01", gbExtensionArea: "50", gbExtensionAcquisitionMode: "actual", gbExtensionAcquisitionCause: "purchase",
    gbExtensionActualAcquisitionPrice: "50000000", gbTransferExtensionBuildingStdPrice: "40000000", gbAcquisitionExtensionBuildingStdPrice: "30000000",
  } as Partial<AssetForm>;
  const EXT_EST = {
    gbHasExtension: true, gbExtensionDate: "2018-05-01", gbExtensionArea: "50", gbExtensionAcquisitionMode: "estimated", gbExtensionAcquisitionCause: "newConstruction",
    gbTransferExtensionBuildingStdPrice: "40000000", gbAcquisitionExtensionBuildingStdPrice: "30000000",
  } as Partial<AssetForm>;
  const OFF = {
    hasSeperateLandAcquisitionDate: false, landAcqMode: "actual", buildingAcqMode: "actual", useEstimatedAcquisition: false, fixedAcquisitionPrice: "600000000",
    acquisitionDate: "2005-05-01", landAcquisitionDate: "2005-05-01", landAcquisitionPrice: "", buildingAcquisitionPrice: "",
  } as Partial<AssetForm>;

  it.each([
    ["증축 실가 · 분리 ON 실가+실가", [EXT_ACTUAL, ACTUAL]],
    ["증축 환산 · 분리 ON 실가+실가", [EXT_EST, ACTUAL]],
    ["증축 실가 · 분리 OFF 일괄 실가", [OFF, EXT_ACTUAL]],
    ["증축 환산 · 분리 OFF 일괄 실가", [OFF, EXT_EST]],
    ["증축 실가 · 원건물 감정(혼합)", [EXT_ACTUAL]],
  ] as [string, Partial<AssetForm>[]][])("%s — 총 5,000,000 ≡ 자산 칸 4,000,000 + 1,000,000", async (_t, gb) => {
    const a = await run(viaTotal(gb, "5000000"));
    const b = await run(viaAssets(gb, "4000000", "1000000"));
    expect(a.cards).toEqual(b.cards);
    expect(a.tax).toBe(b.tax);
    expect(a.cards.length).toBe(4); // 토지 · 원건물 · 증축분 · 토지 자산
  });

  it("증축 실가 · 분리 ON 실가+실가 — 오라클 값 고정 (토지 3,163,107 · 원건물 724,961 · 증축분 111,932 · 토지 자산 1,000,000)", async () => {
    const r = await run(viaTotal([EXT_ACTUAL, ACTUAL], "5000000"));
    expect(r.cards).toEqual([3_163_107, 724_961, 111_932, 1_000_000]);
    expect(r.tax).toBe(330_878_857);
  });

  it("(회귀) 증축 + 이전 형식 직접분 3,000,000 + 총 5,000,000 → 종전 그대로 — 직접분은 후퇴하지 않는다(공통 몫은 이전 형식 한계로 소실)", async () => {
    const r = await run(viaTotal([OFF, EXT_ACTUAL, { directExpenses: "3000000" } as Partial<AssetForm>], "5000000"));
    expect(r.cards).toEqual([1_732_394, 1_267_606, 0, 1_000_000]);
    expect(r.tax).toBe(331_186_961);
  });
});

describe("BC-7 이월과세 토지 · 지분 컴패니언", () => {
  const CARRY = {
    giftRegistryDate: "2021-03-01", giftTaxCalculated: "30,000,000", giftTaxBase: "400,000,000", donorAcquisitionDate: "2005-06-15",
    donorAcquisitionPrice: "150,000,000", giftDateValuation: "400,000,000", donorRelation: "spouse",
  };
  const CO = { acquisitionCause: "carryover_gift", carryover: { ...CARRYOVER_DEFAULTS, ...CARRY }, landAcquisitionDate: "2021-03-01" } as unknown as Partial<AssetForm>;
  it.each([
    ["이월과세 토지(실가) + 건물 실가", [CO]],
    ["이월과세 토지(환산) + 건물 실가", [CO, { landAcqMode: "estimated", landAcquisitionPrice: "" } as Partial<AssetForm>]],
  ] as [string, Partial<AssetForm>[]][])("%s — 총 5,000,000 ≡ 자산 칸 몫 (본인 양도비로 합산)", async (_t, gb) => {
    const a = await run(viaTotal([...gb, ACTUAL], "5000000"));
    const b = await run(viaAssets([...gb, ACTUAL], "4000000", "1000000"));
    expect(a.cards).toEqual(b.cards);
    expect(a.tax).toBe(b.tax);
    expect(a.cards).toEqual([3_254_168, 745_832, 1_000_000]);
  });

  it("지분 50% 일반건물 컴패니언(혼합) — 몫 3,333,333(= 5,000,000 × 800 ÷ 1,200 · 마지막 자산 잔액 1,666,667)이 토지 카드 2,711,806 으로", async () => {
    const half = { ownershipNumerator: "50", ownershipDenominator: "100" } as Partial<AssetForm>;
    const r = await run(bundle([gbAsset(1, half), landAsset(2)], { contractTotalPrice: "1200000000", totalTransferExpense: "5000000" }));
    expect(r.cards).toEqual([2_711_806, 4_500_000 / 2, 1_666_667]);
  });
});

describe("BC-8 legacy 직접분(이전 형식) × 선언 채널 × 공통 몫 — 분리 OFF 일반건물 실가 일괄", () => {
  const OFF = {
    hasSeperateLandAcquisitionDate: false, landAcqMode: "actual", buildingAcqMode: "actual", useEstimatedAcquisition: false, fixedAcquisitionPrice: "600000000",
    acquisitionDate: "2005-05-01", landAcquisitionDate: "2005-05-01", landAcquisitionPrice: "", buildingAcquisitionPrice: "",
  } as Partial<AssetForm>;
  const legacy = { directExpenses: "3000000" } as Partial<AssetForm>;
  const capex = { capitalExpenditure: "10000000" } as Partial<AssetForm>;

  it("선언 채널 없음 — 직접분 3,000,000 과 공통 몫 4,000,000 이 모두 반영된다 (Σ 7,000,000 · legacy 채널이 파트로 나눔)", async () => {
    const r = await run(viaTotal([OFF, legacy], "5000000"));
    expect(r.cards).toEqual([5_694_795, 1_305_205, 1_000_000]);
    expect(r.cards[0] + r.cards[1]).toBe(7_000_000);
    expect(r.tax).toBe(345_369_600);
  });

  it("선언 채널(자본적지출 10,000,000)이 있으면 종전 규칙대로 이전 형식 직접분은 후퇴하고 공통 몫은 합산된다 (Σ 14,000,000)", async () => {
    const r = await run(viaTotal([OFF, legacy, capex], "5000000"));
    expect(r.cards).toEqual([9_028_815, 4_971_185, 1_000_000]);
    expect(r.cards[0] + r.cards[1]).toBe(14_000_000);
    expect(r.tax).toBe(343_311_600);
  });
});
