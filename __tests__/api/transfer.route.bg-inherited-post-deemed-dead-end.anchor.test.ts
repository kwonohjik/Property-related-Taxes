/**
 * 부담부증여 × 상속 × 의제취득일 이후 — ① 요구 막다른 길 해소(Q-40 a · Q-41 a)와 축 B 상속 지분 토글 요구(Q-42 a).
 * 계획서 docs/00-pm/remaining-4-measurements.plan.md §A.
 *
 * 종전: 부담부증여 화면은 ③ 상속 평가액 칸(`publishedValueAtInheritance`)을 숨기는데(§159①1호 A는 부담부증여 실지 칸 · Q-24 a)
 *   ⑧ `postDeemedClauseARequiredError`가 그 칸을 요구했고, 컴패니언은 ⑫ `refineCompanionInheritedValue`도 400을 냈다 — 단건 · 축 A · 축 B 모두 계산 불가.
 * 오라클(시가 10억 · 채무 6억 · 60/40 · 지분 1 매매 실지 2.5억 · 지분 2 상속 실지 2억): 0.36 × 7.5억 + 0.24 × 8억 = 462,000,000.
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
const primary = (k: Kind, ...over: Record<string, unknown>[]) =>
  Object.assign({ ...makeDefaultAsset(1) }, x({ assetId: "p", ...COMMON, assetKind: k, acquisitionDate: "2015-01-01", ...(k === "land" ? LAND : {}), [FIELD[k]]: "250000000" }), ...over.map(x)) as AssetForm;
/**
 * 「+ 지분 추가」로 만든 지분 카드 — 저장값은 기본값(양도 형태 「일반 양도」 · 자산 종류 「주택」). 2018 취득.
 * 취득시 기준시가는 지분 카드의 「이 지분의 취득시 기준시가 (물건 전체)」 칸 값(K-6 개산공제 · 기준시가 평가가 읽는다 — `BurdenedGiftTrancheBasisBlock`).
 */
const share = (...over: Record<string, unknown>[]) =>
  Object.assign({ ...makeDefaultAsset(2) }, x({ assetId: "s", acquisitionCause: "purchase", acquisitionDate: "2018-01-01", standardPriceAtAcq: "400000000" }), ...over.map(x)) as AssetForm;
/** 오라클용 축 A 단건 — 그 지분 재료로 넣은 같은 종류 단건(나머지 제3자). */
const single = (k: Kind, id: string, acq: string, actual: string, ...over: Record<string, unknown>[]) =>
  Object.assign({ ...makeDefaultAsset(1) }, x({ assetId: id, ...COMMON, assetKind: k, acquisitionDate: acq, ...(k === "land" ? LAND : {}), [FIELD[k]]: actual }), ...over.map(x)) as AssetForm;
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

const INH = { acquisitionCause: "inheritance", acquisitionDate: "2010-01-01", inheritanceStartDate: "2010-01-01", decedentAcquisitionDate: "1975-01-01", publishedValueAtInheritance: "" };

describe("DE-1 축 B 상속 지분(토글 켬 · ① 비움) — ⑧ 0 · ⑫ 200 · 오라클 462,000,000", () => {
  for (const k of KINDS) {
    it(k, async () => {
      const f = form([primary(k, pct(60), debt(600_000_000)), share(pct(40), INH, OWN, { bgAcquisitionMethod: "actual", [FIELD[k]]: "200000000" })], AB);
      expect(await gainOk(f)).toBe(462_000_000);
    });
  }
});

describe("DE-2 단건 상속 부담부증여(의제취득일 이후 · ① 비움) — ⑧ 0 · 200 · ①과 무관", () => {
  for (const k of KINDS) {
    it(k, async () => {
      const blank = await gainOk(form([primary(k, INH, debt(600_000_000), { [FIELD[k]]: "200000000" })], { contractTotalPrice: "1000000000" }));
      const nine = await gainOk(form([primary(k, INH, debt(600_000_000), { [FIELD[k]]: "200000000", publishedValueAtInheritance: "900000000" })], { contractTotalPrice: "1000000000" }));
      expect(blank).toBe(480_000_000);
      expect(nine).toBe(blank);
    });
  }
});

describe("DE-3 축 B 상속 지분 × 토글 끔 — ⑧이 지분 토글을 요구(Q-42 a)", () => {
  for (const k of KINDS) {
    it(k, () => {
      const f = form([primary(k, pct(60), debt(600_000_000)), share(pct(40), INH)], AB);
      const issues = allIssues(f); // `단계:칸:문구`
      expect(issues).toHaveLength(1);
      expect(issues[0]).toContain(":bgShareOwnAcquisition:자산 2: 이 지분은 상속으로 취득해 자산 1과 취득가액이 다릅니다");
    });
  }
  it("매매 지분 × 토글 끔은 요구하지 않는다(종전 450,000,000)", async () => {
    expect(await gainOk(form([primary("housing", pct(60), debt(600_000_000)), share(pct(40))], AB))).toBe(450_000_000);
  });
  it("상속 지분 × 환산(K-5)은 기존 규칙(상속 자산은 평가액 = 실지 · 환산 불가)이 먼저 막는다 — 토글 요구는 겹치지 않는다", () => {
    const f = form([primary("housing", pct(60), debt(600_000_000), { bgAcquisitionMethod: "converted" }), share(pct(40), INH)], AB);
    const issues = allIssues(f);
    expect(issues.some((i) => i.includes(":bgAcquisitionMethod:"))).toBe(true);
    expect(issues.some((i) => i.includes(":bgShareOwnAcquisition:"))).toBe(false);
  });
  it("자산 1도 상속이면(같은 원인) 요구하지 않는다", () => {
    const f = form([primary("housing", INH, pct(60), debt(600_000_000)), share(pct(40), INH)], AB);
    expect(allIssues(f)).toEqual([]);
  });
});

describe("DE-4 ⑫ 직접 호출 — 컴패니언 부담부증여에 `inheritanceValuation`이 없어도 400이 아니다", () => {
  it("housing", async () => {
    const f = form([primary("housing", pct(60), debt(600_000_000)), share(pct(40), INH, OWN, { bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "200000000" })], AB);
    const body = (await captureBody(f)) as Loose;
    const comps = (body.companionAssets as Loose[]).map((c) => { const { inheritanceValuation: _iv, ...rest } = c; return rest; }); // eslint-disable-line @typescript-eslint/no-unused-vars
    const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST", headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" }, body: JSON.stringify({ ...body, companionAssets: comps }),
    }));
    expect(res.status).toBe(200);
  });
});

describe("DE-5 일반 양도 상속(의제취득일 이후)은 종전대로 ①을 요구한다", () => {
  it("housing 단건", () => {
    const a = Object.assign({ ...makeDefaultAsset(1) }, x({ assetId: "p", addressJibun: "서울 강남구 테스트동 1-1", assetKind: "housing", transferType: "regular", ...INH, actualSalePrice: "1000000000" })) as AssetForm;
    expect(allIssues(form([a], { contractTotalPrice: "1000000000" })).some((i) => i.includes(":publishedValueAtInheritance:"))).toBe(true);
  });
});
