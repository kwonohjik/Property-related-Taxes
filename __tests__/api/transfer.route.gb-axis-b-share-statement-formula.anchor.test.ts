/**
 * 일반건물 지분 분할(축 B) — 상세명세서 카드별 산식(양도가액 · 취득가액 · 필요경비)이 그 카드 **지분의** 재료로 적힌다.
 * 계획서 `docs/00-pm/gb-carryover-estimated-share-lump-deduction.plan.md` §7 D-1 (Q-4 a · Q-5 (가)).
 *
 * 종전: 결과 상세 한 벌(`generalBuildingValuationDetail`)이 첫 지분 것이라 둘째 지분부터
 *   「600,000,000 × 200,000,000 / (200,000,000+200,000,000) = 200,000,000」 · 「취득시 토지기준시가 60,000,000 × 3% = 1,200,000」처럼
 *   산식이 자기 값을 못 만들었다(값 · 세액은 맞았다). 실가 경로 양도가액도 같았다.
 * 지금: route가 지분별 `shareFormulaEcho`(지분 양도가액 · 개산공제 base)를 싣고, 명세서(`gbFormulaInputsOf`)가 카드 지분 값으로 덮어 읽는다.
 *
 * 대조: 같은 지분율의 **축 A 단건**(지분 r 한 장) — 카드 값과 산식 문구가 글자 그대로 같아야 한다.
 * 화면 경로 그대로 — 폼 → ④(`captureBody`) → ⑫~⑭(route POST) → `aggregateToFilingResult` → `buildStatementItems`(`DetailedCalculationStatementCard`와 같은 인자). mock 세율.
 */
import { describe, expect, it, vi } from "vitest";
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

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type P = Partial<AssetForm>;
const S = (n: number, s: number) => String(Math.round(n * s));
const AREA = (n: number, s: number) => String(Math.round(n * s * 100) / 100);

/** 이월과세 서브폼 — 증여 2024-05-01 · 증여자 취득 2015 · 증여자 취득시 기준시가 1억(환산 일반). `ext` = 증여자 증축 85.01㎡(가산세 대상). */
const carryover = (s: number, ext = false) => ({
  ...CARRYOVER_DEFAULTS, giftRegistryDate: "2024-05-01", donorAcquisitionDate: "2015-01-01", giftDateValuation: S(800_000_000, s),
  useEstimatedAcquisition: true, estimationMode: "general", donorStandardPriceAtAcquisition: S(100_000_000, s),
  donorBuilt: ext, ...(ext ? { donorBuiltType: "extension", donorBuiltDate: "2022-01-10", donorBuiltExtensionArea: "85.01", donorBuiltExtensionStdPrice: S(50_000_000, s) } : {}),
});
/** 일반건물 10억 · 토지 100㎡ · 건물 200㎡ · 토지 매매 환산 + 건물 이월과세(환산). */
const BLD = (s: number, ext = false): P => ({
  addressJibun: "서울 강남구 테스트동 1-1", assetKind: "general_building", acquisitionCause: "purchase", gbBuildingAcquisitionCause: "carryover_gift",
  acquisitionDate: "2024-05-01", useEstimatedAcquisition: true, landAcqMode: "estimated", buildingAcqMode: "estimated",
  gbLandArea: AREA(100, s), gbBuildingArea: AREA(200, s), gbBuildingFootprintArea: AREA(50, s), gbTransferLandPricePerSqm: "2000000", gbTransferBuildingValue: S(200_000_000, s),
  gbZoneType: "general_residential", gbAcqLandPricePerSqm: "1000000", gbAcqBuildingValue: S(100_000_000, s), actualSalePrice: S(1_000_000_000, s), standardPriceAtTransfer: S(400_000_000, s),
  buildingCarryover: carryover(s, ext) as never, ownershipNumerator: "100", ownershipDenominator: "100",
});
/** 토지 파트 이월과세(환산) + 건물 매매 환산. */
const LND = (s: number): P => ({ ...BLD(s), acquisitionCause: "carryover_gift", gbBuildingAcquisitionCause: "purchase", buildingCarryover: undefined, carryover: carryover(s) as never });
/** 실가 경로(`actualPriceMode`) — 두 파트 실가 모드 · 토지 매매 실가(분리 ON) + 건물 이월과세(증여자 취득가액 환산). */
const ACTUAL = (s: number): P => ({ ...BLD(s), landAcqMode: "actual", buildingAcqMode: "actual", hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2015-05-01",
  landAcquisitionPrice: S(150_000_000, s), buildingAcquisitionPrice: S(200_000_000, s), useEstimatedAcquisition: false });
/** 증축(3-way) — 증축분 자가증축 환산 + 건물 이월과세(환산). */
const EXT3 = (s: number): P => ({ ...BLD(s), gbHasExtension: true, gbExtensionDate: "2025-01-01", gbExtensionArea: AREA(50, s), gbExtensionAcquisitionMode: "estimated",
  gbExtensionAcquisitionCause: "newConstruction", gbTransferExtensionBuildingStdPrice: S(40_000_000, s), gbAcquisitionExtensionBuildingStdPrice: S(30_000_000, s) });
const LAND: P = { assetKind: "land", addressJibun: "강원 홍천군 테스트리 1", acquisitionArea: "300", transferArea: "300", acquisitionCause: "purchase", acquisitionDate: "2015-01-01",
  fixedAcquisitionPrice: "100000000", standardPriceAtTransfer: "150000000", actualSalePrice: "300000000", landNature: "standalone" };

const asset = (n: number, ...over: P[]) => Object.assign({ ...makeDefaultAsset(n) }, ...over) as AssetForm;
const SH = (n: number, third = true) => ({ ownershipNumerator: String(n), ownershipDenominator: "100", ...(third ? { ownershipRemainderThirdParty: "yes" } : {}) }) as P;
const COMPANION = { assetSplitMode: "companion", bundledSaleMode: "actual" } as Partial<TransferFormData>;
function form(contract: number, assets: AssetForm[], extra: Partial<TransferFormData> = {}): TransferFormData {
  const f = newForm();
  f.transferDate = "2026-03-01";
  f.filingDate = "2026-05-31";
  f.contractTotalPrice = String(contract);
  f.householdHousingCount = "2";
  f.isOneHousehold = false;
  f.assets = assets;
  return Object.assign(f, extra);
}
import { buildStatementItems } from "@/components/calc/results/transfer/DetailedStatementHelpers";
import { aggregateToFilingResult } from "@/components/calc/results/BundledAllocationCard";

const KEYS = ["transferPrice", "acquisitionPrice", "expenses"] as const;
type Row = { share: number; label: string; key: string; value: unknown; formula: string };
async function statement(f: TransferFormData): Promise<Row[]> {
  expect(allIssues(f), "⑧").toEqual([]);
  const body = await captureBody(f);
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST", headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" }, body: JSON.stringify(body),
  }));
  const j = (await res.json()) as Loose;
  expect(res.status, `⑫ ${JSON.stringify(j.error ?? null).slice(0, 200)}`).toBe(200);
  const ag = j.data.aggregated as Loose;
  const items = buildStatementItems(aggregateToFilingResult(ag as never), f, f.assets[0], { properties: ag.properties, aggregated: ag } as never, undefined);
  return KEYS.flatMap((key) => (items.get(key)?.perAsset ?? []).map((r) => ({
    share: Number(/^자산 (\d+) /.exec(String(r.label))?.[1] ?? 0),
    label: String(r.label).replace(/^자산 \d+ /, ""),
    key, value: r.value, formula: String(r.formula),
  })));
}
const pick = (rows: Row[], key: string, label: string) => rows.find((r) => r.key === key && r.label === label);

/** 매매 환산(이월과세 없음) — 2-way · 증축 3-way. */
const PUR = (s: number): P => ({ ...BLD(s), gbBuildingAcquisitionCause: "purchase", buildingCarryover: undefined });
const EXTP = (s: number): P => ({ ...EXT3(s), gbBuildingAcquisitionCause: "purchase", buildingCarryover: undefined });
const KINDS: [string, (s: number) => P][] = [
  ["매매 환산", PUR], ["건물 이월과세 환산", BLD], ["토지 이월과세 환산", LND], ["두 파트 실가", ACTUAL], ["증축 3-way 매매 환산", EXTP], ["증축 3-way 건물 이월과세", EXT3],
];
const fractional = (k: (s: number) => P, split: number[]) =>
  form(1e9, split.map((r, i) => asset(i + 1, k(1), SH(r, false))), { assetSplitMode: "fractional" });

describe.each(KINDS)("%s × 축 B — 지분 카드 산식 = 같은 지분율 축 A 단건", (_n, kind) => {
  it.each([[[60, 40]], [[20, 30, 50]]])("지분 %j — 카드마다 값 · 산식 문구가 대조와 같다", async (split) => {
    const rows = await statement(fractional(kind, split));
    for (let i = 0; i < split.length; i++) {
      const ref = await statement(form(1e9, [asset(1, kind(1), SH(split[i]))]));
      const mine = rows.filter((r) => r.share === i + 1);
      expect(mine.length, `지분 ${i + 1} 행 수`).toBe(ref.length);
      for (const m of mine) {
        const r = pick(ref, m.key, m.label);
        expect({ value: m.value, formula: m.formula }, `지분 ${i + 1} ${m.key} ${m.label}`).toEqual({ value: r?.value, formula: r?.formula });
      }
    }
  }, 60_000);
});

describe("고정 문구 — 둘째 지분(40%)이 자기 재료로 적힌다", () => {
  it("매매 환산 60/40 지분 2: 양도가액 400,000,000 기준 · 개산공제 base 40,000,000", async () => {
    const two = (await statement(fractional(PUR, [60, 40]))).filter((r) => r.share === 2);
    expect(pick(two, "transferPrice", "토지(1001)")?.formula).toBe("400,000,000 × 200,000,000 / (200,000,000+200,000,000) = 200,000,000");
    expect(pick(two, "expenses", "토지(1001)")?.formula).toBe("취득시 토지기준시가 40,000,000 × 3% = 1,200,000");
    expect(pick(two, "expenses", "건물(3001)")?.formula).toBe("취득시 건물기준시가 40,000,000 × 3% = 1,200,000");
  });
  it("증축 3-way 매매 환산 60/40 지분 2: 증축건물 잔액 · 개산공제 base 12,000,000", async () => {
    const two = (await statement(fractional(EXTP, [60, 40]))).filter((r) => r.share === 2);
    expect(pick(two, "transferPrice", "증축건물(3002)")?.formula).toMatch(/^400,000,000 - /);
    expect(pick(two, "expenses", "증축건물(3002)")?.formula).toBe("취득시 증축건물기준시가 12,000,000 × 3% = 360,000");
  });
});
