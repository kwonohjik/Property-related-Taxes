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

/**
 * V-P2d-1·2 — 주 자산 종류 · 지분율 · 3건 묶음 · 증여 확장(2026-11-16 · 계획서 §6). 측정 54칸 · 값 결함 0건.
 * 이 줄(`primaryInheritanceValuation` 지분 축소)을 끄면 상속 칸은 안분 echo만 바뀌고(지분분 → 100%) 최종 값은 그대로다 —
 * 승계 입주권 · 준공 전 승계 완공 APT도 주 자산 쪽에서는 최종 값이 덮인다(컴패니언 쪽 §6.4와 다르다). 증여 칸은 이 줄 밖이다.
 * 대조: 단건 합. 단 일반건물 × apportioned는 양도가액을 기준시가 비율로 다시 나누고 의제취득일 전(1983) 건물은 취득가액이
 * 양도가액에 연동되므로, 주 자산 양도차익을 **같은 안분 양도가액을 넣은 반 크기 단건**과 비교한다(면적은 반올림하지 않는다).
 */
const SH = (n: number) => ({ ownershipNumerator: String(n), ownershipDenominator: "100", ownershipRemainderThirdParty: "yes" });
const inh = (date: string, dec = "1970-01-01") => ({ acquisitionCause: "inheritance", acquisitionDate: date, inheritanceStartDate: date, decedentAcquisitionDate: dec });
const FLAT = (kind: string, date: string) => (sc: number) => ({ addressJibun: "서울 강남구 테스트동 3", assetKind: kind, ...inh(date),
  publishedValueAtInheritance: S(200000000, sc), standardPriceAtTransfer: S(600000000, sc), actualSalePrice: S(1000000000, sc), acquisitionArea: "100", transferArea: "100" });
const GB = (date: string) => (sc: number) => ({ assetKind: "general_building", addressJibun: "서울 강남구 역삼동 1", gbAcqLandPricePerSqm: "1000000", gbAcqBuildingValue: S(150_000_000, sc),
  gbLandArea: String(205 * sc), gbBuildingArea: String(300 * sc), gbBuildingFootprintArea: String(135 * sc), gbZoneType: "general_residential", gbTransferLandPricePerSqm: "5514000",
  gbTransferBuildingValue: S(259_072_400, sc), actualSalePrice: S(1_000_000_000, sc), standardPriceAtTransfer: S(1_389_442_400, sc), acquisitionCause: "inheritance", gbBuildingAcquisitionCause: "inheritance",
  hasSeperateLandAcquisitionDate: false, landAcquisitionDate: date, acquisitionDate: date, inheritanceStartDate: date, decedentAcquisitionDate: "1970-01-01", landAcqMode: "actual", buildingAcqMode: "actual",
  publishedValueAtInheritance: S(300_000_000, sc), gbBuildingInheritedValue: S(100_000_000, sc) });
/** 원조합원 — `redev-companion-sec164-carry` 시료. 청산금은 지분 납부분 직접 입력(줄이지 않는다 · `transfer-tax-api-redev.ts`). */
const OM = (kind: "rtmi" | "apt") => (sc: number) => ({ addressJibun: "제주특별자치도 강남구 테스트동 7-1", assetKind: kind === "apt" ? "redevelopment_apt" : "right_to_move_in", redevSubject: kind === "apt" ? "apt" : "right",
  redevApprovalLawBasis: "urban_renovation_art_74", redevOriginalAssetType: "housing", redevSettlementDirection: "pay", redevApprovalDate: "2015-03-01", redevRightsValue: S(500000000, sc),
  redevPreApprovalExpenses: "0", redevIsSuccessorMember: "no", isSuccessorRightToMoveIn: false, useEstimatedAcquisition: false, redevActualAcquisitionPrice: S(100000000, sc),
  redevSettlementAmount: "50000000", actualSalePrice: S(1_000_000_000, sc), transferType: "regular", ...inh("2000-06-01", "1980-01-01"),
  publishedValueAtInheritance: S(300000000, sc), inheritanceValuationMethod: "supplementary", inheritanceAssetKind: "house_individual", standardPriceAtTransfer: S(600000000, sc) });
const IND = { inhHouseValLandArea: "100", inhHouseValLandPricePerSqmAtTransfer: "3000000", inhHouseValLandPricePerSqmAtFirst: "1000000", inhHouseValHousePriceAtFirst: "900000000", inhHouseValLandPricePerSqmAtInheritance: "800000" };
const LANDOM = { redevOriginalAssetType: "land", redevLandArea: "200", inheritanceAssetKind: "land", ...inh("1988-06-01", "1980-01-01") };
const GRADE = { pre1990GradeMode: "value", pre1990Grade_current: "100000", pre1990Grade_prev: "100000", pre1990Grade_atAcq: "80000", pre1990PricePerSqm_1990: "3000000" };
/** ② 칸(§164⑤ 7.2억 · §164④ 4.8억)은 결합(sc = 1)에만 넣고, 대조 단건은 ① = ② × 지분율(V-P2c §6.1 동치) */
const OM2 = (kind: "rtmi" | "apt") => (sc: number) => (sc === 1 ? { ...OM(kind)(1), ...IND } : { ...OM(kind)(sc), publishedValueAtInheritance: S(720000000, sc) });
const OMLAND = (sc: number) => (sc === 1 ? { ...OM("rtmi")(1), ...LANDOM, ...GRADE } : { ...OM("rtmi")(sc), ...LANDOM, publishedValueAtInheritance: S(480000000, sc) });
const SUCC = (kind: "rtmi" | "apt", date: string) => (sc: number) => ({ addressJibun: "제주특별자치도 강남구 테스트동 1-1", assetKind: kind === "apt" ? "redevelopment_apt" : "right_to_move_in",
  redevSubject: kind === "apt" ? "apt" : "right", isSuccessorRightToMoveIn: kind === "rtmi", actualSalePrice: S(1_000_000_000, sc), redevApprovalLawBasis: "urban_renovation_art_74", redevApprovalDate: "2016-02-20",
  redevIsSuccessorMember: "yes", ...(kind === "apt" ? { redevCompletionDate: "2022-12-02" } : {}), redevSettlementDirection: "pay", redevSettlementAmount: "0", redevPreApprovalExpenses: "0", redevPostApprovalExpenses: "0",
  standardPriceAtTransfer: S(600_000_000, sc), ...inh(date, "2018-01-01"), fixedAcquisitionPrice: "", publishedValueAtInheritance: S(200_000_000, sc), inheritanceValuationMethod: "supplementary" });
const PRESALE = (sc: number) => ({ addressJibun: "서울 강남구 테스트동 5", assetKind: "presale_right", ...inh("2021-03-01", "2020-01-01"),
  publishedValueAtInheritance: S(200000000, sc), actualSalePrice: S(1000000000, sc), standardPriceAtTransfer: S(600000000, sc) });
const GIFT = (base: (sc: number) => Record<string, unknown>) => (sc: number) => ({ ...base(sc), acquisitionCause: "gift", inheritanceStartDate: "", publishedValueAtInheritance: "",
  donorAcquisitionDate: "2010-01-01", giftDonorRelation: "lineal", giftSameHousehold: "no", fixedAcquisitionPrice: S(200000000, sc) });

/** [이름, 시료, 지분 %, 주 자산 안분 echo, 주 자산 최종 취득가액(파트 카드면 파트별), apportioned 최종 취득가액(다를 때만)] */
const P2D: [string, (sc: number) => Record<string, unknown>, number, number, number[], number[]?][] = [
  ["상가 상속 1995", FLAT("commercial_building", "1995-05-05"), 50, 100_000_000, [100_000_000]],
  ["상가 상속 1983(의제 전)", FLAT("commercial_building", "1983-07-26"), 50, 100_000_000, [100_000_000]],
  ["건물(토지 제외) 상속 1995", FLAT("building", "1995-05-05"), 50, 100_000_000, [100_000_000]],
  ["건물(토지 제외) 상속 1983(의제 전)", FLAT("building", "1983-07-26"), 50, 100_000_000, [100_000_000]],
  ["일반건물 C1 상속 1995", GB("1995-05-05"), 50, 150_000_000, [150_000_000, 75_000_000]],
  ["일반건물 C1 상속 1988", GB("1988-05-01"), 50, 150_000_000, [150_000_000, 75_000_000]],
  ["일반건물 C1 상속 1983(의제 전 — apportioned 건물 취득가액은 안분 양도가액에 연동)", GB("1983-07-26"), 50, 150_000_000, [150_000_000, 75_000_000], [150_000_000, 81_608_998]],
  ["분양권 상속 2021", PRESALE, 50, 100_000_000, [100_000_000]],
  ["원조합원 입주권 상속 2000 ①", OM("rtmi"), 50, 150_000_000, [200_000_000]],
  ["원조합원 완공 APT 상속 2000 ①", OM("apt"), 50, 150_000_000, [200_000_000]],
  ["원조합원 입주권 상속 2000 ① + ② §164⑤", OM2("rtmi"), 50, 150_000_000, [410_000_000]],
  ["원조합원 완공 APT 상속 2000 ① + ② §164⑤", OM2("apt"), 50, 150_000_000, [410_000_000]],
  ["원조합원 토지 출자 입주권 상속 1988 ① + ② §164④", OMLAND, 50, 150_000_000, [290_000_000]],
  ["승계 입주권 상속 2021", SUCC("rtmi", "2021-03-01"), 50, 100_000_000, [100_000_000]],
  ["승계 완공 APT 준공 뒤 상속 2023", SUCC("apt", "2023-03-01"), 50, 100_000_000, [100_000_000]],
  ["승계 완공 APT 준공 전 상속 2021", SUCC("apt", "2021-03-01"), 50, 100_000_000, [100_000_000]],
  ["토지 상속 1995 지분 30%", LAND("1995-05-05"), 30, 60_000_000, [60_000_000]],
  ["토지 상속 1995 지분 70%", LAND("1995-05-05"), 70, 140_000_000, [140_000_000]],
  ["토지 상속 1995 지분 25%", LAND("1995-05-05"), 25, 50_000_000, [50_000_000]],
  ["주택 상속 1995 지분 30%", HOUSE("1995-05-05"), 30, 60_000_000, [60_000_000]],
  ["주택 상속 1995 지분 70%", HOUSE("1995-05-05"), 70, 140_000_000, [140_000_000]],
  ["주택 상속 1983 지분 25%", HOUSE("1983-07-26"), 25, 50_000_000, [50_000_000]],
  ["상가 상속 1995 지분 30%", FLAT("commercial_building", "1995-05-05"), 30, 60_000_000, [60_000_000]],
  ["상가 상속 1983 지분 70%", FLAT("commercial_building", "1983-07-26"), 70, 140_000_000, [140_000_000]],
  // 대조 — 증여 주 자산은 이 줄 밖(acquisitionCause === "inheritance"만). echo는 지분 축소된 증여가액(`fixedAcquisitionPrice`)에서 온다.
  ["증여 토지 2020(이 줄 밖)", GIFT(LAND("2020-05-05")), 50, 100_000_000, [100_000_000]],
  ["증여 주택 2020(이 줄 밖)", GIFT(HOUSE("2020-05-05")), 50, 100_000_000, [100_000_000]],
];

describe.each(P2D)("V-P2d-1·2 %s — 매매 함께 양도 × 주 자산", (_name, base, pct, echo, acqActual, acqApportioned) => {
  for (const mode of ["actual", "apportioned"] as const) {
    it(`${mode}: ⑧ 0건 · ⑫ 200 · 양도차익 = 단건 합 · 주 자산 안분 echo ${echo.toLocaleString()} · 최종 취득가액`, async () => {
      const sc = pct / 100;
      const acq = mode === "apportioned" && acqApportioned ? acqApportioned : acqActual;
      const prim = (k: number, id: string, ...o: Record<string, unknown>[]) => Object.assign({ assetId: id }, x(base(k)), ...o.map(x)) as Partial<AssetForm>;
      const other = (id: string): Partial<AssetForm> => ({ ...PRIMARY(id), addressJibun: "서울 강남구 테스트동 9" });
      const sale = (k: number) => Number(base(k).actualSalePrice);
      const f = form([prim(1, "p", SH(pct)), other("c")], { assetSplitMode: "companion", bundledSaleMode: mode, contractTotalPrice: String(Math.round(sale(1) * sc) + 800_000_000) });
      const r = await post(f);
      expect(issuesOf(f), "⑧").toEqual([]);
      expect(r.status, `⑫ ${r.err}`).toBe(200);

      const ap = Object.fromEntries(r.apportioned.map((a) => [a.assetId, a]));
      expect(ap.primary.allocatedAcquisitionPrice, "주 자산 안분 echo").toBe(echo);
      expect(ap.c.allocatedAcquisitionPrice, "컴패니언 안분 취득가액").toBe(300_000_000);
      expect(r.props.map((p) => p.acquisitionPrice), "자산별 최종 취득가액").toEqual([...acq, 300_000_000]);

      const z2 = await post(form([other("z2")], { contractTotalPrice: "800000000" }));
      const isGb = base(1).assetKind === "general_building";
      const single = (price: number) => post(form([prim(sc, "z1", { actualSalePrice: String(price) })], { contractTotalPrice: String(price) }));
      // apportioned는 양도가액을 기준시가 비율로 다시 나눈다 — 주 자산 양도차익은 같은 안분 양도가액을 넣은 반 크기 단건과 대조한다
      const pt = mode === "apportioned" ? r.props.slice(0, acq.length).reduce((a, p) => a + (p.transferPrice as number), 0) : sale(sc);
      const z1 = await single(pt);
      expect([z1.status, z2.status], `대조 ${z1.err}${z2.err}`).toEqual([200, 200]);
      const primGain = r.props.slice(0, acq.length).reduce((a, p) => a + (p.transferGain as number), 0);
      expect(primGain, "주 자산 양도차익 = 같은 양도가액 반 크기 단건").toBe(z1.gain);
      // 합계 = 원래 양도가액 단건 합 — 의제 전 일반건물 apportioned만 건물 취득가액이 양도가액에 연동돼 갈린다(설계)
      const z1own = mode === "apportioned" ? await single(sale(sc)) : z1;
      if (!(isGb && mode === "apportioned" && String(base(1).acquisitionDate) < "1985-01-01")) {
        expect(r.gain, "양도차익 = 단건 합").toBe((z1own.gain as number) + (z2.gain as number));
      }
    });
  }
});

describe("V-P2d-2 3건 묶음 — 주 자산 토지 상속 50% + 토지 매매 100% + 주택 상속 50%", () => {
  for (const mode of ["actual", "apportioned"] as const) {
    it(`${mode}: ⑧ 0건 · ⑫ 200 · 양도차익 = 단건 셋의 합 1,300,000,000 · 안분 echo [100,000,000 · 300,000,000 · 100,000,000]`, async () => {
      const other = (id: string): Partial<AssetForm> => ({ ...PRIMARY(id), addressJibun: "서울 강남구 테스트동 9" });
      const land = (k: number, id: string, ...o: Record<string, unknown>[]) => Object.assign({ assetId: id }, x(LAND("1995-05-05")(k)), ...o.map(x)) as Partial<AssetForm>;
      const house = (k: number, id: string, ...o: Record<string, unknown>[]) => Object.assign({ assetId: id }, x(HOUSE("1995-05-05")(k)), x({ addressJibun: "서울 강남구 테스트동 4" }), ...o.map(x)) as Partial<AssetForm>;
      const f = form([land(1, "p", SH(50)), other("c"), house(1, "h", SH(50))], { assetSplitMode: "companion", bundledSaleMode: mode, contractTotalPrice: "1800000000" });
      const r = await post(f);
      const zs = [
        await post(form([land(0.5, "z1")], { contractTotalPrice: "500000000" })),
        await post(form([other("z2")], { contractTotalPrice: "800000000" })),
        await post(form([house(0.5, "z3")], { contractTotalPrice: "500000000" })),
      ];
      expect(issuesOf(f), "⑧").toEqual([]);
      expect(r.status, `⑫ ${r.err}`).toBe(200);
      expect(zs.map((z) => z.status)).toEqual([200, 200, 200]);
      expect(r.gain).toBe(zs.reduce((a, z) => a + (z.gain as number), 0));
      expect(r.gain).toBe(1_300_000_000);
      expect(r.apportioned.map((a) => a.allocatedAcquisitionPrice)).toEqual([100_000_000, 300_000_000, 100_000_000]);
      expect(r.props.map((p) => p.acquisitionPrice)).toEqual([100_000_000, 300_000_000, 100_000_000]);
    });
  }
});
