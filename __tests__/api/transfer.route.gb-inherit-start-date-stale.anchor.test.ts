/**
 * anchor — BG 상속 × 환산·감정·매매사례 방식 규칙의 기준일: 「상속개시일 칸(`inheritanceStartDate`) ≠ 토지 취득일(`landAcquisitionDate`)」 상태에서 ⑧↔⑫ 가 갈린다
 * (계획서 `docs/00-pm/gb-inherit-start-date-stale.plan.md` — 측정, 소스 변경 없음)
 *
 * ⑧(`transfer-tax-validate-bg.ts:383` · `burdened-gift-presumed-acquisition.ts:61`)은 `deriveSec163_9BaseDate` = `inheritanceStartDate || acquisitionDate` 로 판정하고,
 * ⑫(`bgInheritNonActualBlocked`)는 payload 가 가진 토지 파트 취득일(`landAcquisitionDate`)로 판정한다. 두 값이 같으면 어긋남이 없다(EC-1).
 * 화면에서 두 값이 갈리는 길: 일반건물 카드의 분리 OFF 전환(`GeneralBuildingAcquisitionCards.tsx:214` `applySeparateOff`)은 `landAcquisitionDate` 를 건물 취득일로 되맞추지만
 * `inheritanceStartDate` 는 건드리지 않는다(그 칸을 쓰는 곳은 `CompanionAcqInheritanceBlock:75-79` 한 곳) — 분리 ON 에서 토지 상속일을 넣은 뒤 OFF 로 끄면 갈린다.
 * 아래 EC-2 는 **현재 동작의 기록**이다(고쳐지면 반전).
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
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

const BASE: Partial<AssetForm> = {
  assetKind: "general_building", addressJibun: "서울 강남구 역삼동 1",
  gbAcqLandPricePerSqm: "1000000", gbAcqBuildingValue: "150000000", gbLandArea: "205", gbBuildingArea: "300", gbBuildingFootprintArea: "135",
  gbZoneType: "general_residential", gbTransferLandPricePerSqm: "5514000", gbTransferBuildingValue: "259072400", actualSalePrice: "1600000000",
  acquisitionCause: "purchase", gbBuildingAcquisitionCause: "purchase", hasSeperateLandAcquisitionDate: false,
  acquisitionDate: "2010-05-01", useEstimatedAcquisition: false,
};
const gbAsset = (id: number, ...over: Partial<AssetForm>[]) => Object.assign({ ...makeDefaultAsset(id) }, BASE, ...over) as AssetForm;
const landAsset = (id: number) =>
  ({
    ...makeDefaultAsset(id), addressJibun: "서울 강남구 테스트동 2-2", assetKind: "land", acquisitionCause: "purchase", acquisitionDate: "2012-01-01",
    acquisitionArea: "100", transferArea: "100", landNature: "standalone", standardPriceAtAcq: "100000000", standardPriceAtTransfer: "200000000",
    actualSalePrice: "400000000", fixedAcquisitionPrice: "100000000",
  }) as unknown as AssetForm;
const bundle = (assets: AssetForm[]): TransferFormData => {
  const f = newForm() as unknown as Record<string, unknown>;
  Object.assign(f, { transferDate: "2026-02-16", filingDate: "2026-05-31", assets, assetSplitMode: "companion", bundledSaleMode: "actual", contractTotalPrice: String(SALE + 400_000_000) });
  return f as unknown as TransferFormData;
};
type Role = "컴패니언" | "주 자산";
const form = (role: Role, over: Partial<AssetForm>, bg = false) => {
  const gb = gbAsset(role === "컴패니언" ? 2 : 1, over);
  const other = bg ? gbAsset(role === "컴패니언" ? 1 : 2, over) : landAsset(role === "컴패니언" ? 1 : 2);
  return bundle(role === "컴패니언" ? [other, gb] : [gb, other]);
};
const post = async (b: unknown) => {
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" }, body: JSON.stringify(b) }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const j = (await res.json()) as any;
  const found: Record<string, unknown> = {};
  const walk = (o: unknown, p: string) => {
    if (!o || typeof o !== "object") return;
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      if (k === "sec1639Basis" || k === "preDeemedAcquisition") found[`${p}.${k}`] = v;
      walk(v, `${p}.${k}`);
    }
  };
  if (res.status === 200) walk(j.data, "d");
  return { status: res.status, tax: res.status === 200 ? (j.data.aggregated.calculatedTax as number) : undefined, found };
};
const single = (over: Partial<AssetForm>) => {
  const f = newForm() as unknown as Record<string, unknown>;
  Object.assign(f, { transferDate: "2026-02-16", filingDate: "2026-05-31", contractTotalPrice: String(SALE), assets: [gbAsset(1, over)] });
  return f as unknown as TransferFormData;
};
const ROLES3 = ["컴패니언", "주 자산", "단건"] as const;
const SALE = 1_600_000_000;
const D83 = "1983-07-26"; const D95 = "1995-05-01";
const BGX = { transferType: "burdened_gift", transferCause: "general", bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1,000,000,000", bgDonorRelation: "lineal_descendant",
  bgLendingDepositTotal: "0", bgMortgageDebtAmount: "500,000,000", bgMortgageSetAmount: "500,000,000", bgCoDonorLandStdPriceAtAcq: "10,000,000", bgCoDonorBuildingStdPriceAtAcq: "40,000,000" } as unknown as Partial<AssetForm>;
const dateState = (S: string, L: string, B: string, sep: boolean, m: string, bc: string): Partial<AssetForm> =>
  ({ ...BGX, acquisitionCause: "inheritance", gbBuildingAcquisitionCause: bc, landAcquisitionDate: L, acquisitionDate: B, inheritanceStartDate: S, decedentAcquisitionDate: "1960-01-01",
    hasSeperateLandAcquisitionDate: sep, ...(sep ? { landAcqMode: "actual", buildingAcqMode: "actual" } : {}), publishedValueAtInheritance: "300000000", gbBuildingInheritedValue: "100000000", bgAcquisitionMethod: m,
    bgActualAcquisitionLand: "300000000", bgActualAcquisitionBuilding: "100000000", bgPresumedAcquisitionLand: "300000000", bgPresumedAcquisitionBuilding: "100000000" } as unknown as Partial<AssetForm>);

describe("EC-1·EC-2 상속개시일 칸 S · 토지 취득일 L · 건물 취득일 B 조합 × 분리 × 방식 3 × 건물 원인 2 × 위치 3 (324셀)", () => {
  it("S = L 이면 ⑧↔⑫ 어긋남 0 (108셀) · S ≠ L 이면 어긋난다(현재 동작) — 거짓 차단(⑧ 통과·⑫ 400)·⑫ 미차단(⑧ 차단·⑫ 200)", async () => {
    const t: Record<string, number> = {};
    for (const S of ["", D83, D95]) for (const L of [D83, D95]) for (const B of [D83, D95]) for (const sep of [true, false]) for (const m of ["converted", "appraisal", "actual"]) for (const bc of ["inheritance", "purchase"]) for (const role of ROLES3) {
      if (!sep && L !== B) continue;
      const o = dateState(S, L, B, sep, m, bc);
      const f = role === "단건" ? single(o) : form(role, o, true);
      const r = await post(await captureBody(f)); const b8 = allIssues(f).length > 0;
      const cls = S === L ? "S=L" : S === "" ? "S빈" : "S≠L";
      const mm = !b8 && r.status === 400 ? "거짓차단" : b8 && r.status === 200 ? "⑫미차단" : "일치";
      const k = `${cls}|${m === "actual" ? "actual" : "비actual"}|${mm}`; t[k] = (t[k] ?? 0) + 1;
    }
    expect(t).toEqual({
      "S=L|actual|일치": 36, "S=L|비actual|일치": 72,
      "S≠L|actual|일치": 36, "S≠L|비actual|거짓차단": 36, "S≠L|비actual|⑫미차단": 24, "S≠L|비actual|일치": 12,
      "S빈|actual|일치": 36, "S빈|비actual|거짓차단": 12, "S빈|비actual|⑫미차단": 12, "S빈|비actual|일치": 48,
    });
  }, 600_000);
  it("대표 상태 — 분리 ON 에서 토지 상속일 1983 을 넣고(S=L=1983, B=1995) 분리 OFF 로 끈 직후(L=B=1995, S=1983 그대로): ⑧ 통과 · ⑫ 400 (환산·감정 × 위치 3)", async () => {
    const t: Record<string, number> = {};
    for (const m of ["converted", "appraisal"]) for (const role of ROLES3) {
      const f = role === "단건" ? single(dateState(D83, D95, D95, false, m, "inheritance")) : form(role, dateState(D83, D95, D95, false, m, "inheritance"), true);
      const r = await post(await captureBody(f)); const k = `${allIssues(f).length > 0 ? "차단" : "통과"}|${r.status}`; t[k] = (t[k] ?? 0) + 1;
    }
    expect(t).toEqual({ "통과|400": 6 });
  });
});
