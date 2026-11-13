/**
 * 축 B(지분 분할) × 부담부증여 — **주택 · 토지 · 상가 · 건물** 지분 카드의 취득가액 따로 입력(D-3 · Q-8 a)과 지분 카드 판정값(D-3c).
 * 계획서 `docs/00-pm/companion-inherit-valuation-share-vp2c.plan.md` §15.
 *
 * 종전: #3093 토글(`bgShareOwnAcquisition`)은 일반건물만 열려, 이 네 종류는 지분 2의 실지취득가액 · 산정방식이 자산 1 값으로 덮였다
 *   (시가 보충 승 60/40 · 지분 1 실지 2.5억 · 지분 2 실지 3억 → 양도차익 450,000,000 · 오라클 438,000,000).
 *   또 「+ 지분 추가」로 만든 카드는 저장값이 「일반 양도」라 ③에 일반 「취득가액」 칸이 떴고, 거기 넣은 값은 계산에 쓰이지 않았다(D-3c).
 * 지금: 토글이 네 종류에도 열리고, 지분 카드 ③은 병합 판정값(자산 1의 양도 형태 · 부담부증여 값)으로 판정한다.
 *
 * 오라클 = 축 A 단건(그 지분 재료 · 채무 × 지분율) 양도차익 합. 화면 경로 그대로(폼 → ⑧ → ④ → route POST · mock 세율).
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
import { bgShareOwnAcquisitionApplies } from "@/lib/calc/bg-share-own-acquisition";
import { bgShareCardJudgmentFields } from "@/lib/calc/bg-pre-deemed-shares";
import { mergePrimaryBasic } from "@/lib/calc/transfer-tax-api-helpers";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Kind = "housing" | "land" | "commercial_building" | "building";
const KINDS: Kind[] = ["housing", "land", "commercial_building", "building"];
const x = (o: Record<string, unknown>) => o as unknown as Partial<AssetForm>;
/** 종류별 실지취득가액 칸 — 화면 `BurdenedGiftBlock.tsx`와 같다(토지는 토지 칸, 그 밖은 총액). */
const FIELD: Record<Kind, "bgActualAcquisitionTotal" | "bgActualAcquisitionLand"> = {
  housing: "bgActualAcquisitionTotal", land: "bgActualAcquisitionLand", commercial_building: "bgActualAcquisitionTotal", building: "bgActualAcquisitionTotal",
};
const LAND = { landAreaM2: "100", acquisitionArea: "100", transferArea: "100", landNature: "independent", companionLandNature: "independent" };
/** 시가 10억 · 양도시 기준시가 8억 · 취득시 기준시가 4억 — vp2c §15.1과 같은 재료. */
const COMMON = { addressJibun: "서울 강남구 테스트동 1-1", acquisitionCause: "purchase", transferType: "burdened_gift", bgDonorRelation: "lineal_descendant",
  bgLendingDepositTotal: "0", standardPriceAtTransfer: "800000000", standardPriceAtAcq: "400000000",
  bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1000000000", bgAcquisitionMethod: "actual" };
const STD = { bgValuationMode: "sangjeungbeop_standard", bgMarketValueAtTransfer: "", bgAcquisitionMethod: "" };
const debt = (d: number) => ({ bgMortgageDebtAmount: String(d), bgMortgageSetAmount: String(d) });
const pct = (n: number, third = false) => ({ ownershipNumerator: String(n), ownershipDenominator: "100", ...(third ? { ownershipRemainderThirdParty: "yes" } : {}) });
const K6 = { bgAcquisitionMethod: "salesCase", bgPresumedInputKind: "total", bgPresumedAcquisitionTotal: "300000000", bgPresumedAcquisitionLand: "300000000" };
const OWN = { bgShareOwnAcquisition: true };

/** 자산 1(주 자산) — 2015 취득 · 실지 2.5억. */
/** 건물 기준시가 평가는 증여일 기준시가(상증법 §61①2호) 필수 — 양도시 기준시가와 같은 값(종전 엔진 대체값)이라 세액 불변. 토지·주택·상가에는 싣지 않는다. */
const GIFT_STD = { bgGiftBuildingStdPriceAtTransfer: "800000000" };
const primary = (k: Kind, ...over: Record<string, unknown>[]) =>
  Object.assign({ ...makeDefaultAsset(1) }, x({ assetId: "p", ...COMMON, assetKind: k, acquisitionDate: "2015-01-01", ...(k === "land" ? LAND : {}), ...(k === "building" ? GIFT_STD : {}), [FIELD[k]]: "250000000" }), ...over.map(x)) as AssetForm;
/**
 * 「+ 지분 추가」로 만든 지분 카드 — 저장값은 기본값(양도 형태 「일반 양도」 · 자산 종류 「주택」). 2018 취득.
 * 취득시 기준시가는 지분 카드의 「이 지분의 취득시 기준시가 (물건 전체)」 칸 값(K-6 개산공제 · 기준시가 평가가 읽는다 — `BurdenedGiftTrancheBasisBlock`).
 */
const share = (...over: Record<string, unknown>[]) =>
  Object.assign({ ...makeDefaultAsset(2) }, x({ assetId: "s", acquisitionCause: "purchase", acquisitionDate: "2018-01-01", standardPriceAtAcq: "400000000" }), ...over.map(x)) as AssetForm;
/** 오라클용 축 A 단건 — 그 지분 재료로 넣은 같은 종류 단건(나머지 제3자). */
const single = (k: Kind, id: string, acq: string, actual: string, ...over: Record<string, unknown>[]) =>
  Object.assign({ ...makeDefaultAsset(1) }, x({ assetId: id, ...COMMON, assetKind: k, acquisitionDate: acq, ...(k === "land" ? LAND : {}), ...(k === "building" ? GIFT_STD : {}), [FIELD[k]]: actual }), ...over.map(x)) as AssetForm;
const form = (assets: AssetForm[], over: Record<string, unknown> = {}) =>
  rosterForDeclaredCount(rosterForDeclaredCount(Object.assign(createDefaultTransferFormData(), {
    transferDate: "2026-02-16", filingDate: "2026-04-30", totalTransferExpense: "0", householdHousingCount: "2", isOneHousehold: false,
    householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, assets, contractTotalPrice: "",
  }, over))) as TransferFormData;
const AB = { assetSplitMode: "fractional", contractTotalPrice: "1000000000" };

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

describe("OK-1 토글 켬 — 축 B 양도차익 = 지분별 재료 축 A 단건 합 (4종 × 2칸 × 2분할)", () => {
  // [이름, 지분 2 재료(토글 켬), 오라클 지분 2 추가 재료, 60/40 고정값, 30/70 고정값]
  const CELLS: [string, (k: Kind) => Record<string, unknown>, Record<string, unknown>, number, number][] = [
    ["실지 3억", (k) => ({ ...OWN, bgAcquisitionMethod: "actual", [FIELD[k]]: "300000000" }), {}, 438_000_000, 429_000_000],
    ["매매사례가액 3억(K-6)", () => ({ ...OWN, ...K6 }), K6, 435_120_000, 423_960_000],
  ];
  for (const k of KINDS) for (const [name, own, oracleExtra, fixed64, fixed37] of CELLS) for (const [r1, r2, fixed] of [[60, 40, fixed64], [30, 70, fixed37]] as const) {
    it(`${k} · ${name} · ${r1}/${r2}`, async () => {
      const b = await gainOk(form([primary(k, pct(r1), debt(600_000_000)), share(pct(r2), own(k))], AB));
      const a1 = await gainOk(form([single(k, "p", "2015-01-01", "250000000", pct(r1, true), debt(600_000_000 * r1 / 100))]));
      const a2 = await gainOk(form([single(k, "s", "2018-01-01", "300000000", pct(r2, true), debt(600_000_000 * r2 / 100), oracleExtra)]));
      expect(b).toBe(a1 + a2);
      expect(b).toBe(fixed);
    });
  }
});

describe("OK-2 토글 끔(기본) — 종전 그대로 자산 1 값(450,000,000)", () => {
  for (const k of KINDS) {
    it(k, async () => {
      // 지분 카드에 다른 값이 남아 있어도(숨은 칸) 토글이 꺼져 있으면 읽지 않는다
      expect(await gainOk(form([primary(k, pct(60), debt(600_000_000)), share(pct(40), { [FIELD[k]]: "300000000", bgAcquisitionMethod: "actual" })], AB))).toBe(450_000_000);
    });
  }
});

describe("OK-3 ⑧ — 토글 켬 + 이 지분 칸 비움은 막는다", () => {
  for (const k of KINDS) {
    it(`${k} 실지취득가액 비움 → ⑧ ≥ 1 ∧ ⑫ 400`, async () => {
      const f = form([primary(k, pct(60), debt(600_000_000)), share(pct(40), OWN, { bgAcquisitionMethod: "actual", [FIELD[k]]: "" })], AB);
      expect(allIssues(f).length).toBeGreaterThan(0);
      expect((await post(f)).status).toBe(400);
    });
    it(`${k} 산정방식 비움 → ⑧ ≥ 1`, () => {
      const f = form([primary(k, pct(60), debt(600_000_000)), share(pct(40), OWN, { bgAcquisitionMethod: "" })], AB);
      expect(allIssues(f).length).toBeGreaterThan(0);
    });
  }
});

describe("OK-4 범위 밖 — 기준시가 평가는 토글이 켜져 있어도 자산 1 값(취득시 기준시가 × 채무비율)", () => {
  for (const k of KINDS) {
    it(k, async () => {
      // 지분 카드의 양도시 기준시가는 시료에서 직접 넣는다 — 실제 화면 지분 카드에는 이 칸이 없다(⑧이 숨은 ②를 가리킴 · 계획서 §16 D-3d 별건)
      const g = await gainOk(form([primary(k, pct(60), STD, debt(400_000_000)), share(pct(40), OWN, { standardPriceAtTransfer: "800000000", bgAcquisitionMethod: "actual", [FIELD[k]]: "300000000" })], AB));
      expect(g).toBe(194_000_000);
    });
  }
});

describe("OK-5 leaf — 토글을 여는 종류", () => {
  const merged = (kind: string) => mergePrimaryBasic(share(), Object.assign({ ...makeDefaultAsset(1) }, x({ ...COMMON, assetKind: kind, acquisitionDate: "2015-01-01" })) as AssetForm);
  it.each(["general_building", ...KINDS])("%s 열림", (kind) => expect(bgShareOwnAcquisitionApplies(merged(kind))).toBe(true));
  it.each(["redevelopment_apt", "right_to_move_in"])("%s 열림 — 실지취득가액 한 칸(vp2c §25 D-3g · Q-18 a)", (kind) => expect(bgShareOwnAcquisitionApplies(merged(kind))).toBe(true));
  it("presale_right 닫힘(부담부증여 지원 종류 밖)", () => expect(bgShareOwnAcquisitionApplies(merged("presale_right"))).toBe(false));
});

describe("OK-6 지분 카드 ③ 판정값(D-3c) — 저장값 「일반 양도」 카드도 자산 1의 부담부증여로 판정", () => {
  it.each(KINDS)("%s → 양도 형태 · 부담부증여 값을 병합값으로", (k) => {
    const f = bgShareCardJudgmentFields(share(), primary(k));
    expect(f.transferType).toBe("burdened_gift");
    expect(f.bgValuationMode).toBe("sangjeungbeop_market");
    expect(f.bgAcquisitionMethod).toBe("actual");
  });
  it("토글 켬 — 산정방식은 이 지분 값", () => {
    expect(bgShareCardJudgmentFields(share(OWN, { bgAcquisitionMethod: "salesCase" }), primary("housing")).bgAcquisitionMethod).toBe("salesCase");
  });
  it("일반 양도 · 분양권은 빈 객체 — 종전 그대로", () => {
    expect(bgShareCardJudgmentFields(share(), primary("housing", { transferType: "regular" }))).toEqual({});
    expect(bgShareCardJudgmentFields(share(), primary("housing", { assetKind: "presale_right" }))).toEqual({});
  });
  it("재개발 · 입주권(원조합원) → 병합값 — 종전에는 빈 객체라 쓰이지 않는 ⑤ 실거래가 칸이 떴다(vp2c §25 D-3h · Q-19 a)", () => {
    for (const assetKind of ["redevelopment_apt", "right_to_move_in"]) expect(bgShareCardJudgmentFields(share(), primary("housing", { assetKind })).transferType).toBe("burdened_gift");
  });
  it("일반건물(D-3e · vp2c §19.3 · Q-12 a) → 병합값 — 종전에는 빈 객체라 취득시 기준시가 칸이 숨었다", () => {
    expect(bgShareCardJudgmentFields(share(), primary("housing", { assetKind: "general_building" })).transferType).toBe("burdened_gift");
  });
});
