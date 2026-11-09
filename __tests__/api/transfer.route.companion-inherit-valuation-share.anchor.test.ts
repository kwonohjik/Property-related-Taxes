/**
 * V-P2c — 매매 함께 양도 × 컴패니언 상속 × 지분: `companion-payload.ts`의 `inheritanceValuation`(상증법 평가액) 지분 축소.
 * 계획서 `docs/00-pm/companion-inherit-valuation-share-vp2c.plan.md` (측정 8칸 · 값 결함 0건 · 결정 Q-1 a).
 * V-P2d — 같은 묶음에서 **주 자산**이 상속 지분인 반대 방향: `transfer-tax-api-bundled.ts`의 `primaryInheritanceValuation` 지분 축소.
 * 계획서 `docs/00-pm/bundled-primary-inherit-valuation-share-vp2d.plan.md` (측정 8칸 · 값 결함 0건).
 *
 * 그 줄을 끄면 최종 취득가액·양도차익은 그대로인데 안분 echo `apportionment.apportioned[].allocatedAcquisitionPrice`만 두 배가 된다
 * (100,000,000 → 200,000,000). 최종 값 단언만으로는 이 줄을 못 잡아서 echo를 직접 단언한다.
 * 최종 값을 덮는 쪽은 `adjustedAcqPrice`(매매 환산 전용)가 아니라 엔진 STEP 0.45다. ④가 같은 지분 축소를 따로 한 `inheritedAcquisition.reportedValue`
 * (`transfer-tax-api-inheritance.ts`)로 취득가액을 다시 쓴다. 그 운반이 없는 상속 컴패니언(`ownsAcquisitionSubobject` 참 — 승계 입주권 ·
 * 준공 전 받은 승계 완공 APT)은 이 줄이 최종 값이 된다(계획서 §7). 지분 규약을 바꾸면 두 곳을 함께 볼 것.
 *
 * 화면 경로 그대로 — 폼 → ⑧(`collectStepIssues`) → ④(`captureBody`) → ⑫~⑭(route POST). 대조는 단건 합(주 자산 단건 + 반 크기 컴패니언 단건).
 * 시료: 주 자산 토지 매매 100%(취득가액 3억 · 기준시가 5억 · 양도 8억) + 컴패니언 상속 지분 50%(평가액 2억 · 기준시가 6억 · 양도 10억 — 물건 전체 기준).
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
const S = (n: number, sc: number) => String(Math.round(n * sc));
const x = (o: Record<string, unknown>) => o as unknown as Partial<AssetForm>;
const FORM = { transferDate: "2026-02-16", filingDate: "2026-04-30", totalTransferExpense: "0", householdHousingCount: "0", isOneHousehold: false, householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true };
const HALF = { ownershipNumerator: "50", ownershipDenominator: "100", ownershipRemainderThirdParty: "yes" };

const PRIMARY = (id: string): Partial<AssetForm> => x({
  assetId: id, addressJibun: "서울 강남구 테스트동 1", assetKind: "land", acquisitionArea: "300", transferArea: "300", acquisitionCause: "purchase", acquisitionDate: "2015-03-03",
  fixedAcquisitionPrice: "300000000", standardPriceAtTransfer: "500000000", actualSalePrice: "800000000", ownershipNumerator: "100", ownershipDenominator: "100", landNature: "standalone",
});
/** sc = 규모 배율(0.5 = 반 크기 단건 대조) */
const LAND = (date: string) => (sc: number) => ({
  addressJibun: "서울 강남구 테스트동 2", assetKind: "land", acquisitionArea: "300", transferArea: "300", acquisitionCause: "inheritance", acquisitionDate: date, inheritanceStartDate: date,
  decedentAcquisitionDate: "1970-01-01", publishedValueAtInheritance: S(200000000, sc), standardPriceAtTransfer: S(600000000, sc), actualSalePrice: S(1000000000, sc), landNature: "standalone",
});
const HOUSE = (date: string) => (sc: number) => ({
  addressJibun: "서울 강남구 테스트동 3", assetKind: "housing", acquisitionCause: "inheritance", acquisitionDate: date, inheritanceStartDate: date, decedentAcquisitionDate: "1970-01-01",
  inheritanceAssetKind: "house_individual", publishedValueAtInheritance: S(200000000, sc), standardPriceAtTransfer: S(600000000, sc), actualSalePrice: S(1000000000, sc), acquisitionArea: "100", transferArea: "100",
});
const KINDS: [string, (sc: number) => Record<string, unknown>][] = [
  ["토지 상속 1995(의제 후)", LAND("1995-05-05")], ["토지 상속 1983(의제 전)", LAND("1983-07-26")],
  ["주택 상속 1995(의제 후)", HOUSE("1995-05-05")], ["주택 상속 1983(의제 전)", HOUSE("1983-07-26")],
];

const form = (assets: Partial<AssetForm>[], over: Record<string, unknown> = {}) =>
  rosterForDeclaredCount(rosterForDeclaredCount(Object.assign(createDefaultTransferFormData(), FORM, { assets: assets.map((a, i) => Object.assign({ ...makeDefaultAsset(i + 1) }, a)) }, over))) as TransferFormData;
const issuesOf = (f: TransferFormData) => {
  const o: string[] = [];
  for (let i = 0; i <= 5; i++) for (const m of collectStepIssues(i, f)) o.push(`${m.field}: ${m.message.slice(0, 70)}`);
  return o;
};
async function post(f: TransferFormData) {
  const body = await captureBody(f);
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" }, body: JSON.stringify(body) }));
  const j = (await res.json()) as Loose;
  const d = j.data as Loose | undefined;
  return {
    status: res.status,
    gain: (d?.aggregated?.totalTransferGain ?? d?.result?.transferGain ?? d?.transferGain) as number | undefined,
    props: (d?.aggregated?.properties ?? []) as Loose[],
    apportioned: (d?.apportionment?.apportioned ?? []) as Loose[],
    err: res.status === 200 ? "" : JSON.stringify(j.error ?? j).slice(0, 150),
  };
}

describe.each(KINDS)("V-P2c %s — 매매 함께 양도 × 컴패니언 지분 50%", (_name, base) => {
  for (const mode of ["actual", "apportioned"] as const) {
    it(`${mode}: ⑧ 0건 · ⑫ 200 · 양도차익 = 단건 합 900,000,000 · 컴패니언 안분 취득가액(echo)·최종 취득가액 = 평가액 × 50% = 100,000,000`, async () => {
      const comp = (sc: number, id: string, ...o: Record<string, unknown>[]) => Object.assign({ assetId: id }, x(base(sc)), ...o.map(x)) as Partial<AssetForm>;
      const f = form([PRIMARY("p"), comp(1, "c", HALF)], { assetSplitMode: "companion", bundledSaleMode: mode, contractTotalPrice: "1300000000" });
      const z1 = await post(form([PRIMARY("z1")], { contractTotalPrice: "800000000" }));
      const z2 = await post(form([comp(0.5, "z2")], { contractTotalPrice: "500000000" }));
      expect([z1.status, z2.status], `대조 ${z1.err}${z2.err}`).toEqual([200, 200]);
      const r = await post(f);

      expect(issuesOf(f), "⑧").toEqual([]);
      expect(r.status, `⑫ ${r.err}`).toBe(200);
      expect(r.gain, "양도차익").toBe((z1.gain as number) + (z2.gain as number));
      expect(r.gain, "양도차익 고정값").toBe(900_000_000);

      // 안분 echo — 이 줄(`inheritanceValuation` 지분 축소)을 지키는 유일한 단언
      const ap = Object.fromEntries(r.apportioned.map((a) => [a.assetId, a]));
      expect(ap.primary.allocatedAcquisitionPrice, "주 자산 안분 취득가액").toBe(300_000_000);
      expect(ap.c.allocatedAcquisitionPrice, "컴패니언 안분 취득가액(echo)").toBe(100_000_000);
      // 최종 값
      expect(r.props.map((p) => p.acquisitionPrice), "자산별 최종 취득가액").toEqual([300_000_000, 100_000_000]);
      // 양도가액: actual = 구분기재 그대로(주 자산 8억 · 컴패니언 지분분 5억), apportioned = 총 13억을 양도시 기준시가 5억 : 3억(= 6억 × 50%)으로 안분
      expect(r.props.map((p) => p.transferPrice), "자산별 양도가액").toEqual(mode === "actual" ? [800_000_000, 500_000_000] : [812_500_000, 487_500_000]);
    });
  }
});

/** V-P2d — 주 자산이 상속 지분 50%, 컴패니언은 매매 토지 100%. 대조는 단건 합(반 크기 주 자산 단건 + 컴패니언 단건). */
describe.each(KINDS)("V-P2d %s — 매매 함께 양도 × 주 자산 상속 지분 50%", (_name, base) => {
  for (const mode of ["actual", "apportioned"] as const) {
    it(`${mode}: ⑧ 0건 · ⑫ 200 · 양도차익 = 단건 합 900,000,000 · 주 자산 안분 취득가액(echo)·최종 취득가액 = 평가액 × 50% = 100,000,000`, async () => {
      const prim = (sc: number, id: string, ...o: Record<string, unknown>[]) => Object.assign({ assetId: id }, x(base(sc)), ...o.map(x)) as Partial<AssetForm>;
      const other = (id: string): Partial<AssetForm> => ({ ...PRIMARY(id), addressJibun: "서울 강남구 테스트동 9" });
      const f = form([prim(1, "p", HALF), other("c")], { assetSplitMode: "companion", bundledSaleMode: mode, contractTotalPrice: "1300000000" });
      const z1 = await post(form([prim(0.5, "z1")], { contractTotalPrice: "500000000" }));
      const z2 = await post(form([other("z2")], { contractTotalPrice: "800000000" }));
      expect([z1.status, z2.status], `대조 ${z1.err}${z2.err}`).toEqual([200, 200]);
      const r = await post(f);

      expect(issuesOf(f), "⑧").toEqual([]);
      expect(r.status, `⑫ ${r.err}`).toBe(200);
      expect(r.gain, "양도차익").toBe((z1.gain as number) + (z2.gain as number));
      expect(r.gain, "양도차익 고정값").toBe(900_000_000);

      // 안분 echo — `primaryInheritanceValuation` 지분 축소를 지키는 유일한 단언(끄면 100,000,000 → 200,000,000)
      const ap = Object.fromEntries(r.apportioned.map((a) => [a.assetId, a]));
      expect(ap.primary.allocatedAcquisitionPrice, "주 자산 안분 취득가액(echo)").toBe(100_000_000);
      expect(ap.c.allocatedAcquisitionPrice, "컴패니언 안분 취득가액").toBe(300_000_000);
      expect(r.props.map((p) => p.acquisitionPrice), "자산별 최종 취득가액").toEqual([100_000_000, 300_000_000]);
      // 양도가액: actual = 구분기재(주 자산 지분분 5억 · 컴패니언 8억), apportioned = 총 13억을 양도시 기준시가 3억(= 6억 × 50%) : 5억으로 안분
      expect(r.props.map((p) => p.transferPrice), "자산별 양도가액").toEqual(mode === "actual" ? [500_000_000, 800_000_000] : [487_500_000, 812_500_000]);
    });
  }
});

