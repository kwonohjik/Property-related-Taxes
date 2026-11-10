/**
 * V-P1 — 부담부증여 × 의제취득일(1985.1.1.) 전 상속 × 지분 × 시가·기준시가 보충 승: 상가 · 건물(토지 제외) · 재개발 완공 아파트.
 * 계획서 `docs/00-pm/bg-pre-deemed-fractional-other-kinds-vp1.plan.md` (측정 26칸 · 값 결함 0건 · 결정 Q-1 a 안전망 고정).
 *

 * V-P2 — 같은 시료를 «함께 양도»(컴패니언) 묶음에도 건다: 토지·주택 포함 5종 × 변형 19 × 순서 2(컴패니언=지분 · 주 자산=지분) = 38칸. 대조는 단건 합(주 자산 100% 단건 + 반 크기 단건).
 *   계획서 `bg-pre-deemed-fractional-companion-vp2.plan.md`. 컴패니언 payload는 별도 코드(`transfer-tax-api-companion-payload.ts`)다.
 *
 * 일반건물은 파트별 ①② 쌍(`landPreDeemedClauseA`·`buildingPreDeemedClauseA`)을 싣고 그 ①②가 #3021 전까지 지분 몫으로 줄지 않았다.
 * 이 세 종류는 단일 자산 `inheritedAcquisition`(pre-deemed)을 싣고 ①을 ④(`transfer-tax-api-inheritance.ts`)에서 지분 몫으로 줄인다 —
 * 그 규약이 조용히 깨지는 것을 막는 안전망이다(코드 변경 없음).
 *
 * 대조: 축 A = 지분 50% 단건 ↔ 반 크기 단건(채무는 본인 인수분이라 그대로) · 축 B = 60/40 두 카드 ↔ 100% 단건.
 * 화면 경로 그대로 — 폼 → ⑧(`collectStepIssues`) → ④(`captureBody`) → ⑫~⑭(route POST).
 * ⚠️ 재개발의 청산금 칸은 지분분을 직접 입력하는 칸이다(지분 카드에 전체 금액을 넣으면 차이가 난다 — 시료 오류).
 * ⚠️ 축 B는 카드마다 따로 계산해 합산하므로 카드별 floor의 합이 단건보다 작아 양도차익이 0~수 원 크게 나온다(V-P1b 계획서
 *    `bg-fractional-axis-b-one-won-vp1b.plan.md` — 값 결함 아님으로 종결). 60/40은 «0~1원», 분할 비율 스윕은 «음수 금지 · 2(n−1) 이하»로 고정한다.
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
import { captureBody } from "../calc/_one-house-pr3a-calc-route";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type AssetForm, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import { rosterForDeclaredCount } from "@/__tests__/calc/_helpers/roster-for-declared-count";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const x = (o: Record<string, unknown>) => o as unknown as Partial<AssetForm>;
const S = (n: number, sc: number) => String(Math.round(n * sc));
const FORM = { transferDate: "2026-02-16", filingDate: "2026-04-30", totalTransferExpense: "0", householdHousingCount: "0", isOneHousehold: false, householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true };

/** sc = 규모 배율(0.5 = 반 크기 단건 대조). 비율·면적·날짜는 규모와 무관해 그대로다. */
const COM = (sc: number, kind: "commercial_building" | "building"): Record<string, unknown> => ({
  addressJibun: "서울 강남구 테스트동 1-1", assetKind: kind, acquisitionCause: "inheritance", acquisitionDate: "1983-07-26", inheritanceStartDate: "1983-07-26", decedentAcquisitionDate: "1970-01-01",
  transferType: "burdened_gift", bgDonorRelation: "lineal_descendant", bgLendingDepositTotal: "0", standardPriceAtTransfer: S(400000000, sc), standardPriceAtAcq: S(200000000, sc),
});
/** 상가 §164⑥ 8칸 — 규모에 비례하는 가격 칸만 줄이고 면적은 그대로 */
const CB8 = (sc: number) => ({
  cbExclusiveArea: "50", cbSharedArea: "20", cbLandArea: "100", cbUnitPriceAtFirstOrAcq: S(10000000, sc), cbLandPricePerSqmAtAcq: S(500000, sc), cbLandPricePerSqmAtFirst: S(700000, sc),
  cbBuildingStdPriceAtAcq: S(30000000, sc), cbBuildingStdPriceAtFirst: S(40000000, sc), cbAcqBuildingStdBy164_5: true,
});
const REDEV = (sc: number): Record<string, unknown> => ({
  addressJibun: "제주특별자치도 강남구 테스트동 1-1", assetKind: "redevelopment_apt", actualSalePrice: S(525000000, sc), redevSubject: "apt", redevApprovalLawBasis: "urban_renovation_art_74", redevApprovalDate: "2009-10-23",
  redevRightsValue: S(219218500, sc), redevSettlementDirection: "pay", redevSettlementAmount: S(92781500, sc), redevCompletionDate: "2012-09-01", redevManagementDisposalHousingPrice: S(132000000, sc),
  redevAcquisitionHousingPrice: S(85034988, sc), acquisitionCause: "inheritance", acquisitionDate: "1980-01-01", inheritanceStartDate: "1980-01-01", decedentAcquisitionDate: "1970-01-01",
  inheritanceAssetKind: "house_individual", transferType: "burdened_gift", bgDonorRelation: "lineal_descendant", standardPriceAtTransfer: S(400000000, sc),
});

type Variant = {
  id: string;
  kind: string;
  base: (sc: number) => Record<string, unknown>;
  over: (sc: number) => Record<string, unknown>;
  /** 시가 평가: 시가(= 계약총액). 기준시가 평가: 0 */
  mkt: number;
  debt: number;
  /** 축 A 단건의 기대 양도차익(고정값 — 양쪽이 같이 어긋나는 것을 막는다) */
  fixedA?: number;
  /** 기대 채택 후보 (`transferBurdenedGiftBreakdown.preDeemed.selected` 또는 `.basis`) */
  selected?: string;
};
const MARKET = (sc: number, mkt: number) => ({ bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: S(mkt, sc) });
const STD = { bgValuationMode: "sangjeungbeop_standard" };
const com = (k: "commercial_building" | "building") => (s: number) => COM(s, k);
const VARIANTS: Variant[] = [
  { id: "상가 시가 ①승", kind: "commercial_building", base: com("commercial_building"), mkt: 920000000, debt: 460000000, over: (s) => ({ ...MARKET(s, 920000000), publishedValueAtInheritance: S(500000000, s) }), fixedA: 105000000, selected: "reported" },
  { id: "상가 시가 ③승", kind: "commercial_building", base: com("commercial_building"), mkt: 920000000, debt: 460000000, over: (s) => ({ ...MARKET(s, 920000000), publishedValueAtInheritance: S(300000000, s) }), fixedA: 113500000, selected: "converted" },
  { id: "상가 시가 §164⑥ 8칸", kind: "commercial_building", base: com("commercial_building"), mkt: 920000000, debt: 460000000, over: (s) => ({ ...MARKET(s, 920000000), ...CB8(s), publishedValueAtInheritance: S(300000000, s) }), fixedA: -66545453, selected: "converted" },
  { id: "상가 시가 ②승", kind: "commercial_building", base: com("commercial_building"), mkt: 300000000, debt: 150000000, over: (s) => ({ ...MARKET(s, 300000000), ...CB8(s), publishedValueAtInheritance: S(100000000, s) }), fixedA: -52272727, selected: "sec164" },
  { id: "상가 기준시가 칸", kind: "commercial_building", base: com("commercial_building"), mkt: 0, debt: 200000000, over: () => ({ ...STD }), fixedA: 48500000, selected: "deemed_std" },
  { id: "상가 기준시가 §164⑥ 8칸", kind: "commercial_building", base: com("commercial_building"), mkt: 0, debt: 200000000, over: (s) => ({ ...STD, ...CB8(s) }), fixedA: -31090908, selected: "deemed_std" },
  { id: "건물 시가 ①승", kind: "building", base: com("building"), mkt: 920000000, debt: 460000000, over: (s) => ({ ...MARKET(s, 920000000), publishedValueAtInheritance: S(500000000, s) }), fixedA: 105000000, selected: "reported" },
  { id: "건물 시가 ③승", kind: "building", base: com("building"), mkt: 920000000, debt: 460000000, over: (s) => ({ ...MARKET(s, 920000000), publishedValueAtInheritance: S(300000000, s) }), fixedA: 113500000, selected: "converted" },
  // 시가 < 양도시 기준시가라 ③(시가 × 분자 ÷ 양도시 기준시가)이 분자보다 작다 — ② §164⑤ = 분자가 이긴다(건물 계획서 §9 Q-34 a · 종전 ③ 36,000,000)
  { id: "건물 시가 < 기준시가", kind: "building", base: com("building"), mkt: 300000000, debt: 150000000, over: (s) => ({ ...MARKET(s, 300000000), publishedValueAtInheritance: S(100000000, s) }), fixedA: 25000000, selected: "sec164" },
  { id: "건물 기준시가 칸", kind: "building", base: com("building"), mkt: 0, debt: 200000000, over: () => ({ ...STD }), fixedA: 48500000, selected: "deemed_std" },
  { id: "재개발 시가 ①승", kind: "redevelopment_apt", base: REDEV, mkt: 525000000, debt: 210000000, over: (s) => ({ ...MARKET(s, 525000000), publishedValueAtInheritance: S(200000000, s) }), fixedA: 46443700, selected: "reported" },
  { id: "재개발 시가 ③승", kind: "redevelopment_apt", base: REDEV, mkt: 525000000, debt: 210000000, over: (s) => ({ ...MARKET(s, 525000000), publishedValueAtInheritance: S(100000000, s) }), fixedA: 57689185, selected: "converted" },
  { id: "재개발 기준시가 칸", kind: "redevelopment_apt", base: REDEV, mkt: 0, debt: 160000000, over: (s) => ({ ...STD, standardPriceAtAcq: S(50000000, s) }), fixedA: 51143700, selected: "deemed_std" },
];

/** 토지·주택 시료 — 양도시 기준시가 12.4335억 · 취득시 2.0262억 · 시가 9.2억 (V-P2 전용: 단건 축 A·B 대조는 #3021 기록) */
const LH = (k: "land" | "housing") => (sc: number): Record<string, unknown> => ({
  addressJibun: "서울 강남구 테스트동 1-1", assetKind: k, acquisitionCause: "inheritance", acquisitionDate: "1983-07-26", inheritanceStartDate: "1983-07-26", decedentAcquisitionDate: "1970-01-01",
  transferType: "burdened_gift", bgDonorRelation: "lineal_descendant", bgLendingDepositTotal: "0", bgAcquisitionMethod: "converted",
  standardPriceAtTransfer: S(1243350000, sc), standardPriceAtAcq: S(202620000, sc), acquisitionArea: "184.2", transferArea: "184.2", landNature: "standalone",
  ...(k === "housing" ? { inheritanceAssetKind: "house_individual" } : {}),
});
const LHV = (k: "land" | "housing", label: string): Variant[] => [
  { id: label + " 시가 ①승", kind: k, base: LH(k), mkt: 920000000, debt: 460000000, over: (s) => ({ ...MARKET(s, 920000000), publishedValueAtInheritance: S(300000000, s) }) },
  { id: label + " 시가 ③승", kind: k, base: LH(k), mkt: 920000000, debt: 460000000, over: (s) => ({ ...MARKET(s, 920000000), publishedValueAtInheritance: S(20000000, s) }) },
  { id: label + " 기준시가 칸", kind: k, base: LH(k), mkt: 0, debt: 621675000, over: () => ({ ...STD }) },
];
const ALL_VARIANTS: Variant[] = [...LHV("land", "토지"), ...LHV("housing", "주택"), ...VARIANTS];
/** 함께 양도 묶음(주 자산 100% + 지분 50% 카드)의 양도차익 고정값 — 단건 합과 같다. 두 순서(C·D) 공통 */
const FIXED_BUNDLE: Record<string, number> = {
  "토지 시가 ①승": 465000000, "토지 시가 ③승": 572996607, "토지 기준시가 칸": 775988550,
  "주택 시가 ①승": 465000000, "주택 시가 ③승": 572996607, "주택 기준시가 칸": 775988550,
  "상가 시가 ①승": 315000000, "상가 시가 ③승": 340500000, "상가 시가 §164⑥ 8칸": -199636361, "상가 시가 ②승": -156818181,
  "상가 기준시가 칸": 145500000, "상가 기준시가 §164⑥ 8칸": -93272725,
  "건물 시가 ①승": 315000000, "건물 시가 ③승": 340500000, "건물 시가 < 기준시가": 75000000, "건물 기준시가 칸": 145500000,
  "재개발 시가 ①승": 139331100, "재개발 시가 ③승": 173067553, "재개발 기준시가 칸": 153431100,
};

const asset = (v: Variant, sc: number, id: string, ...o: Record<string, unknown>[]) =>
  Object.assign({ ...makeDefaultAsset(1) }, x({ assetId: id, ...v.base(sc), ...v.over(sc) }), ...o.map(x)) as AssetForm;
const form = (assets: AssetForm[], total: number, over: Record<string, unknown> = {}) =>
  rosterForDeclaredCount(rosterForDeclaredCount(Object.assign(createDefaultTransferFormData(), FORM, { assets, contractTotalPrice: String(total) }, over))) as TransferFormData;
const debtOf = (v: Variant, mult: number) => { const d = String(Math.round(v.debt * mult)); return { bgMortgageDebtAmount: d, bgMortgageSetAmount: d }; };
/** 재개발 청산금 칸은 지분분 직접 입력 — 다른 종류는 해당 없음 */
const settle = (v: Variant, frac: number) => (v.kind === "redevelopment_apt" ? { redevSettlementAmount: S(92781500, frac) } : {});
const HALF = { ownershipNumerator: "50", ownershipDenominator: "100", ownershipRemainderThirdParty: "yes" };
const pct = (n: string) => ({ ownershipNumerator: n, ownershipDenominator: "100" });

const issuesOf = (f: TransferFormData) => {
  const o: string[] = [];
  for (let i = 0; i <= 5; i++) for (const m of collectStepIssues(i, f)) o.push(`${m.field}: ${m.message.slice(0, 60)}`);
  return o;
};
async function post(f: TransferFormData) {
  const body = await captureBody(f);
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" }, body: JSON.stringify(body) }));
  const j = (await res.json()) as Loose;
  const data = j.data as Loose | undefined;
  const bg = (data?.result?.transferBurdenedGiftBreakdown ?? data?.transferBurdenedGiftBreakdown ?? data?.assets?.[0]?.transferBurdenedGiftBreakdown) as Loose | undefined;
  return {
    status: res.status,
    gain: (data?.aggregated?.totalTransferGain ?? data?.result?.transferGain ?? data?.transferGain) as number | undefined,
    acq: bg ? (bg.perAsset?.land?.acquisitionPrice ?? 0) + (bg.perAsset?.building?.acquisitionPrice ?? 0) : undefined,
    selected: (bg?.preDeemed?.selected ?? bg?.preDeemed?.basis) as string | undefined,
    err: res.status === 200 ? "" : JSON.stringify(j.error ?? j).slice(0, 160),
  };
}

async function cells(v: Variant) {
  const total = v.mkt > 0 ? v.mkt : 400000000;
  const fa = form([asset(v, 1, "a", HALF, debtOf(v, 0.5), settle(v, 0.5))], total);
  const ra = form([asset(v, 0.5, "z", debtOf(v, 0.5))], total / 2);
  const fb = form([asset(v, 1, "p", pct("60"), debtOf(v, 1), settle(v, 0.6)), asset(v, 1, "s", pct("40"), debtOf(v, 1), settle(v, 0.4))], total, { assetSplitMode: "fractional" });
  const rb = form([asset(v, 1, "z", debtOf(v, 1))], total);
  return { a: await post(fa), aRef: await post(ra), aIssues: issuesOf(fa), b: await post(fb), bRef: await post(rb), bIssues: issuesOf(fb) };
}

const KINDS: [string, string][] = [["commercial_building", "상가"], ["building", "건물(토지 제외)"], ["redevelopment_apt", "재개발 완공 아파트"]];
describe.each(KINDS)("V-P1 %s × 의제전 × 지분 × 보충 승 — 단건 대조", (kind) => {
  it("축 A(지분 50%)는 반 크기 단건과 1원까지 같고, 축 B(60/40)는 단건과 0~1원 안이다 — ⑧ 0건 · ⑫ 200 · 채택 후보와 고정값", async () => {
    for (const v of VARIANTS.filter((c) => c.kind === kind)) {
      const r = await cells(v);
      // 화면에서 도달한다: ⑧ 0건 → ⑫ 200
      expect(r.aIssues, `${v.id} A ⑧`).toEqual([]);
      expect(r.bIssues, `${v.id} B ⑧`).toEqual([]);
      expect([r.a.status, r.aRef.status, r.b.status, r.bRef.status], `${v.id} ⑫ ${r.a.err}${r.b.err}`).toEqual([200, 200, 200, 200]);
      // 축 A — 취득가액·양도차익 모두 일치, 고정값, 채택 후보
      expect(r.a.acq, `${v.id} A 취득가액`).toBe(r.aRef.acq);
      expect(r.a.gain, `${v.id} A 양도차익`).toBe(r.aRef.gain);
      expect(r.a.gain, `${v.id} A 고정값`).toBe(v.fixedA);
      expect(r.a.selected, `${v.id} A 채택`).toBe(v.selected);
      expect(r.aRef.selected, `${v.id} A 대조 채택`).toBe(v.selected);
      // 축 B — 카드별 floor로 단건보다 0~1원 크게 나올 수 있다(계획서 §3.2)
      const accDiff = (r.bRef.acq as number) - (r.b.acq as number);
      const gainDiff = (r.b.gain as number) - (r.bRef.gain as number);
      expect([0, 1], `${v.id} B 취득가액 차 ${accDiff}`).toContain(accDiff);
      expect([0, 1], `${v.id} B 양도차익 차 ${gainDiff}`).toContain(gainDiff);
      expect(r.bRef.selected, `${v.id} B 대조 채택`).toBe(v.selected);
    }
  });
});

/** V-P1b — 분할 비율 스윕. 카드별 floor의 합 ≤ 전체의 floor 이므로 양도차익은 단건보다 **작아지지 않는다**(음수 금지). 상한 2(n−1)은 78칸 관측치다. */
const SPLITS: number[][] = [[50, 50], [60, 40], [70, 30], [90, 10], [25, 75], [34, 33, 33]];
describe.each(KINDS)("V-P1b %s × 분할 비율 6종 — 카드별 절사 합산은 단건보다 작아지지 않는다", (kind) => {
  it("⑧ 0건 · ⑫ 200 · 양도차익 차이 0 이상 2(n−1) 이하 · 취득가액 차이 0 이상 n−1 이하", async () => {
    for (const v of VARIANTS.filter((c) => c.kind === kind)) {
      const total = v.mkt > 0 ? v.mkt : 400000000;
      const ref = await post(form([asset(v, 1, "z", debtOf(v, 1))], total));
      expect(ref.status, `${v.id} 대조 ${ref.err}`).toBe(200);
      for (const sp of SPLITS) {
        const f = form(sp.map((n, i) => asset(v, 1, `c${i}`, pct(String(n)), debtOf(v, 1), settle(v, n / 100))), total, { assetSplitMode: "fractional" });
        const r = await post(f);
        const tag = `${v.id} ${sp.join("/")}`;
        expect(issuesOf(f), `${tag} ⑧`).toEqual([]);
        expect(r.status, `${tag} ⑫ ${r.err}`).toBe(200);
        const gainDiff = (r.gain as number) - (ref.gain as number);
        const acqDiff = (ref.acq as number) - (r.acq as number);
        expect(gainDiff, `${tag} 양도차익 차`).toBeGreaterThanOrEqual(0);
        expect(gainDiff, `${tag} 양도차익 차`).toBeLessThanOrEqual(2 * (sp.length - 1));
        expect(acqDiff, `${tag} 취득가액 차`).toBeGreaterThanOrEqual(0);
        expect(acqDiff, `${tag} 취득가액 차`).toBeLessThanOrEqual(sp.length - 1);
      }
    }
  });
});

const KINDS_ALL: [string, string][] = [["land", "토지"], ["housing", "주택"], ...KINDS];
describe.each(KINDS_ALL)("V-P2 %s × 함께 양도(컴패니언) × 의제전 × 지분 — 단건 합 대조", (kind) => {
  it("컴패니언이 지분 카드여도, 주 자산이 지분 카드여도 단건 합과 1원까지 같다 — ⑧ 0건 · ⑫ 200 · 고정값", async () => {
    const BND = { assetSplitMode: "companion", bundledSaleMode: "actual" };
    for (const v of ALL_VARIANTS.filter((c) => c.kind === kind)) {
      // 주택은 «같은 날 양도 주택 2채 함께양도»(소령 §154⑨) ⑧ 차단이 따로 있어 상대 카드를 같은 시료의 토지로 한다
      const other = v.kind === "housing" ? ALL_VARIANTS.find((c) => c.id === v.id.replace("주택", "토지"))! : v;
      const m = v.mkt > 0 ? v.mkt : 400000000;
      const total = Math.round(m * 1.5);
      const z1 = await post(form([asset(other, 1, "z1", debtOf(other, 1))], m));
      const z2 = await post(form([asset(v, 0.5, "z2", debtOf(v, 0.5))], m / 2));
      expect([z1.status, z2.status], `${v.id} 대조 ${z1.err}${z2.err}`).toEqual([200, 200]);
      const ref = (z1.gain as number) + (z2.gain as number);
      expect(ref, `${v.id} 대조 고정값`).toBe(FIXED_BUNDLE[v.id]);
      const shapes: [string, TransferFormData][] = [
        ["C 컴패니언=지분", form([asset(other, 1, "a", debtOf(other, 1)), asset(v, 1, "b", HALF, debtOf(v, 0.5), settle(v, 0.5))], total, BND)],
        ["D 주 자산=지분", form([asset(v, 1, "a", HALF, debtOf(v, 0.5), settle(v, 0.5)), asset(other, 1, "b", debtOf(other, 1))], total, BND)],
      ];
      for (const [shape, f] of shapes) {
        const r = await post(f);
        expect(issuesOf(f), `${v.id} ${shape} ⑧`).toEqual([]);
        expect(r.status, `${v.id} ${shape} ⑫ ${r.err}`).toBe(200);
        expect(r.gain, `${v.id} ${shape} 양도차익`).toBe(ref);
      }
    }
  });
});

describe("V-P1 격자 규모", () => {
  it("13변형 × 2모양 = 26칸이다(상가 6 · 건물 4 · 재개발 3) · 스윕은 13변형 × 6분할 = 78칸 · 함께 양도는 19변형 × 2순서 = 38칸이다", () => {
    expect(VARIANTS.length).toBe(13);
    expect(VARIANTS.filter((c) => c.kind === "commercial_building").length).toBe(6);
    expect(VARIANTS.filter((c) => c.kind === "building").length).toBe(4);
    expect(VARIANTS.filter((c) => c.kind === "redevelopment_apt").length).toBe(3);
    expect(SPLITS.length).toBe(6);
    expect(ALL_VARIANTS.length).toBe(19);
    expect(Object.keys(FIXED_BUNDLE).length).toBe(19);
  });
});
