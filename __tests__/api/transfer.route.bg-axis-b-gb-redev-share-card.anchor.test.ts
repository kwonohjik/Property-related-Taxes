/**
 * 축 B(지분 분할) × 부담부증여 — 「+ 지분 추가」 기본값 지분 카드의 일반건물 · 재개발 막다른 길(D-3e · D-3f · Q-12 a · Q-13 a).
 * 계획서 `docs/00-pm/companion-inherit-valuation-share-vp2c.plan.md` §19.
 *
 * D-3e 일반건물: 지분 카드 ③이 저장값 「일반 양도」로 판정돼 취득시 토지 공시지가 · 건물 기준시가 칸(`gbShowsAcqStdPrice`)이 숨었다 —
 *   ⑧은 그 값을 요구해 기준시가 평가 · K-4 · K-5 · K-6 모두 막혔다(우회: 쓰이지 않는 일반 산정방식에서 「환산취득가」).
 *   지금: ③이 병합값(부담부증여)으로 판정한다(`BG_SHARE_CARD_KINDS`에 일반건물) — 칸이 열리고 쓰이지 않는 일반 칸이 숨는다.
 * D-3f 재개발: 지분 카드에 양도시 기준시가 칸이 없어 기준시가 평가 · K-5가 막다른 길이었다(D-3d와 같음 · 우회 없음).
 *   지금: 자산 1 값을 병합한다(`BG_SHARE_STD_TRANSFER_KINDS`에 재개발).
 *
 * 시료: 지분 2 = 「+ 지분 추가」 기본값(`makeDefaultAsset`) + 그 카드 ③에 **보이는 칸**만 같은 재료로 채움. 오라클 = 같은 물건 100% 단건.
 */
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { allIssues, captureBody } from "../calc/_one-house-pr3a-calc-route";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type AssetForm, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import { rosterForDeclaredCount } from "@/__tests__/calc/_helpers/roster-for-declared-count";
import { bgShareCardJudgmentFields } from "@/lib/calc/bg-pre-deemed-shares";
import { gbShowsAcqStdPrice } from "@/lib/calc/transfer-tax-split-acq-mode";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

type A = Record<string, unknown>;
type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const COMMON: A = { addressJibun: "서울 강남구 테스트동 1-1", acquisitionCause: "purchase", transferType: "burdened_gift", bgDonorRelation: "lineal_descendant", bgLendingDepositTotal: "0" };
/** 일반건물 — `bg-gb-fractional-win` base 재료(양도시 기준시가 8억 · 취득시 4억 · 시가 10억 · 실지 토지 1억 + 건물 1.5억). */
const GB: A = { assetKind: "general_building", acquisitionDate: "2015-01-01", standardPriceAtTransfer: "800000000", standardPriceAtAcq: "400000000",
  gbAcqLandPricePerSqm: "2000000", gbAcqBuildingValue: "200000000", gbLandArea: "100", gbBuildingArea: "300", gbBuildingFootprintArea: "135", gbZoneType: "general_residential",
  gbTransferLandPricePerSqm: "6000000", gbTransferBuildingValue: "200000000", bgGiftBuildingStdPriceAtTransfer: "200000000", gbBuildingAcquisitionCause: "purchase", hasSeperateLandAcquisitionDate: false, landAcquisitionDate: "2015-01-01",
  useEstimatedAcquisition: false, bgActualAcquisitionLand: "100000000", bgActualAcquisitionBuilding: "150000000" };
/** 일반건물 지분 카드 ③에 보이는 칸 — 취득일 · 취득시 토지 공시지가 · 건물 기준시가. */
const GB_SHARE: A = { acquisitionDate: "2015-01-01", gbAcqLandPricePerSqm: "2000000", gbAcqBuildingValue: "200000000" };
/** 재개발 — `bg-redev-fractional-win` 청산금 납부 원조합원(청산금은 지분 해당분). */
const SET = 92_781_500;
const REDEV = (set: number): A => ({ assetKind: "redevelopment_apt", acquisitionDate: "2015-01-01", standardPriceAtTransfer: "800000000", standardPriceAtAcq: "400000000", redevSubject: "apt",
  redevApprovalLawBasis: "urban_renovation_art_74", redevApprovalDate: "2018-06-01", redevRightsValue: "219218500", redevSettlementDirection: "pay", redevSettlementAmount: String(set),
  redevCompletionDate: "2022-09-01", redevPreApprovalExpenses: "0", redevOriginalAssetType: "housing", redevActualAcquisitionPrice: "100000000", bgActualAcquisitionTotal: "250000000", useEstimatedAcquisition: false });
/** 재개발 지분 카드 ③에 보이는 칸(양도시 기준시가 칸은 없다). */
const REDEV_SHARE = (set: number): A => ({ acquisitionDate: "2015-01-01", redevSubject: "apt", redevApprovalLawBasis: "urban_renovation_art_74", redevApprovalDate: "2018-06-01", redevRightsValue: "219218500",
  redevSettlementDirection: "pay", redevSettlementAmount: String(set), redevPreApprovalExpenses: "0", redevOriginalAssetType: "housing", redevActualAcquisitionPrice: "100000000", redevCompletionDate: "2022-09-01" });
/** K-5 인가전 분 D · E — 지분 카드에서는 인가전 분 「환산취득가액」을 고르면 열린다. */
const REDEV_K5: A = { redevManagementDisposalHousingPrice: "300000000", redevAcquisitionHousingPrice: "150000000" };
const STD: A = { bgValuationMode: "sangjeungbeop_standard", bgMarketValueAtTransfer: "", bgAcquisitionMethod: "" };
const MKT: A = { bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1000000000" };
const K6S: A = { bgPresumedInputKind: "split", bgPresumedAcquisitionLand: "100000000", bgPresumedAcquisitionBuilding: "150000000", bgPresumedAcquisitionTotal: "250000000" };
const debt = (d: number): A => ({ bgMortgageDebtAmount: String(d), bgMortgageSetAmount: String(d) });
const pct = (n: number): A => ({ ownershipNumerator: String(n), ownershipDenominator: "100" });
const asset = (n: number, ...o: A[]) => Object.assign({ ...makeDefaultAsset(n) }, ...o) as unknown as AssetForm;
const BASE = { transferDate: "2026-02-16", filingDate: "2026-04-30", totalTransferExpense: "0", householdHousingCount: "2", isOneHousehold: false, householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true };
const frac = (assets: AssetForm[]) => rosterForDeclaredCount(Object.assign(createDefaultTransferFormData(), BASE, { assets, assetSplitMode: "fractional", contractTotalPrice: "1000000000" })) as TransferFormData;
const single = (a: AssetForm) => rosterForDeclaredCount(Object.assign(createDefaultTransferFormData(), BASE, { assets: [a] })) as TransferFormData;

async function post(f: TransferFormData) {
  const body = await captureBody(f);
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST", headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" }, body: JSON.stringify(body),
  }));
  const j = (await res.json()) as Loose;
  return { status: res.status, err: JSON.stringify(j.error ?? null).slice(0, 300), gain: (j.data?.aggregated?.totalTransferGain ?? j.data?.result?.transferGain) as number };
}
async function gainOk(f: TransferFormData) {
  expect(allIssues(f)).toEqual([]);
  const r = await post(f);
  expect(r.status, r.err).toBe(200);
  return r.gain;
}

// [이름, 모드, 고정값]
const GB_CELLS: [string, A, number][] = [
  ["기준시가 보충", { ...STD, ...debt(400_000_000) }, 194_000_000],
  ["기준시가 담보", { ...STD, ...debt(900_000_000) }, 488_000_000],
  ["시가 K-4 실지", { ...MKT, bgAcquisitionMethod: "actual", ...debt(600_000_000) }, 450_000_000],
  ["시가 K-5 환산", { ...MKT, bgAcquisitionMethod: "converted", ...debt(600_000_000) }, 292_800_000],
  ["시가 K-6 매매사례가액", { ...MKT, bgAcquisitionMethod: "salesCase", ...K6S, ...debt(600_000_000) }, 442_800_000],
];

describe("GR-1 일반건물 — 지분 카드에 보이는 칸(취득시 기준시가 포함)만으로 ⑧ 0 · ⑫ 200 · 양도차익 = 100% 단건", () => {
  for (const [name, mode, fixed] of GB_CELLS) {
    it(name, async () => {
      const k6 = mode.bgAcquisitionMethod === "salesCase" ? K6S : {};
      const b = await gainOk(frac([asset(1, { assetId: "p" }, COMMON, GB, mode, pct(60)), asset(2, { assetId: "s", acquisitionCause: "purchase" }, GB_SHARE, k6, pct(40))]));
      expect(b).toBe(await gainOk(single(asset(1, COMMON, GB, mode))));
      expect(b).toBe(fixed);
    });
  }
});

describe("GR-2 일반건물 — 지분 카드 취득시 기준시가를 비우면 계속 막는다(⑧ ⊇ ⑫ · 칸은 이제 보인다)", () => {
  for (const [name, mode] of GB_CELLS) {
    it(name, async () => {
      const k6 = mode.bgAcquisitionMethod === "salesCase" ? K6S : {};
      const f = frac([asset(1, { assetId: "p" }, COMMON, GB, mode, pct(60)), asset(2, { assetId: "s", acquisitionCause: "purchase", acquisitionDate: "2015-01-01" }, k6, pct(40))]);
      expect(allIssues(f).map(String).some((m) => m.includes("자산 2:") && m.includes("gbAcqLandPricePerSqm"))).toBe(true);
      expect((await post(f)).status).toBe(400);
    });
  }
});

describe("GR-3 일반건물 지분 카드 ③ 판정값 — 취득시 기준시가 칸을 띄운다", () => {
  const primary = asset(1, COMMON, GB, MKT, { bgAcquisitionMethod: "actual" }, pct(60));
  const share = asset(2, { acquisitionCause: "purchase" }, pct(40));
  it("병합 판정값이면 칸이 열린다 · 저장값(일반 양도)이면 닫힌다", () => {
    const raw: AssetForm = { ...share, assetKind: primary.assetKind };
    const judged: AssetForm = { ...raw, ...bgShareCardJudgmentFields(share, primary) };
    expect(judged.transferType).toBe("burdened_gift");
    expect(gbShowsAcqStdPrice(judged)).toBe(true);
    expect(gbShowsAcqStdPrice(raw)).toBe(false);
  });
  it("자산 1이 일반 양도면 빈 객체(종전 그대로)", () => {
    expect(bgShareCardJudgmentFields(share, { ...primary, transferType: "regular" })).toEqual({});
  });
});

describe("RD-1 재개발 — 지분 카드에 양도시 기준시가 칸 없음 → 자산 1 값 · ⑧ 0 · ⑫ 200 · 양도차익 = 100% 단건", () => {
  const CELLS: [string, A, A, A, number][] = [
    // [이름, 모드, 지분 카드 추가 칸, 단건 추가 칸, 고정값]
    ["기준시가 보충", { ...STD, ...debt(400_000_000) }, { standardPriceAtAcq: "400000000" }, {}, 147_609_250],
    ["기준시가 담보", { ...STD, ...debt(900_000_000) }, { standardPriceAtAcq: "400000000" }, {}, 395_218_500],
    ["시가 K-4 실지(종전에도 통과)", { ...MKT, bgAcquisitionMethod: "actual", ...debt(600_000_000) }, {}, {}, 394_331_100],
    ["시가 K-5 환산", { ...MKT, bgAcquisitionMethod: "converted", ...debt(600_000_000), ...REDEV_K5 }, { useEstimatedAcquisition: true, ...REDEV_K5 }, {}, 475_865_550],
  ];
  for (const [name, mode, shareExtra, , fixed] of CELLS) {
    it(name, async () => {
      const b = await gainOk(frac([asset(1, { assetId: "p" }, COMMON, REDEV(SET * 0.6), mode, pct(60)), asset(2, { assetId: "s", acquisitionCause: "purchase" }, REDEV_SHARE(SET * 0.4), shareExtra, pct(40))]));
      expect(b).toBe(await gainOk(single(asset(1, COMMON, REDEV(SET), mode))));
      expect(b).toBe(fixed);
    });
  }
});

describe("RD-2 재개발 — 자산 1 양도시 기준시가를 비우면 계속 막는다(형제 안전망)", () => {
  it("기준시가 보충 — ⑧이 자산 1을 짚는다 ∧ ⑫ 400", async () => {
    const f = frac([
      asset(1, { assetId: "p" }, COMMON, REDEV(SET * 0.6), STD, debt(400_000_000), pct(60), { standardPriceAtTransfer: "" }),
      asset(2, { assetId: "s", acquisitionCause: "purchase" }, REDEV_SHARE(SET * 0.4), { standardPriceAtAcq: "400000000" }, pct(40)),
    ]);
    expect(allIssues(f).map(String).some((m) => m.includes("자산 1:") && m.includes("standardPriceAtTransfer"))).toBe(true);
    expect((await post(f)).status).toBe(400);
  });
});
