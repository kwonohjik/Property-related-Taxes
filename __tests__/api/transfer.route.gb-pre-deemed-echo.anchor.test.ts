/**
 * anchor — 의제취득일 전(1980) 상속·증여 파트의 ①② echo(`preDeemedAcquisition`)·§163⑨ 근거 echo(`sec1639Basis`)와 `compareSec164` (#2725) 의 정합
 * (계획서 `docs/00-pm/gb-pre-deemed-echo-measure.plan.md`)
 *
 * 측정 질문 — #2725 가 파트 슬롯을 `compareSec164(① , 적용, ②)` 로 바꾼 뒤에도 ①② 를 따로 싣는 `landPreDeemedClauseA`·③ 환산 비교·카드 echo 가 어긋나지 않는가.
 * 시료는 비교 채널이 갈리도록 골랐다 — 양도가액 1.6B 는 ③ 환산이 ①② 를 이기는 셀(36)을, 1.0B 는 ③ 환산 채택 0 · ② §164 채택 90파트(1.6B 는 54파트)를 만든다.
 * 오라클 = 이미 동작하는 채널: ⓐ 멱등 — 파트 가액을 max(①,②,③) 로 미리 넣은 같은 자산의 세액이 같다 ⓑ 증여는 같은 날짜의 매매(실가) 채널 세액이 같다(③ 채택 파트는 추계 모드).
 * 결과: 어긋남 0.
 * 부수 관찰 — BG(부담부증여) 시가 평가 × 의제취득일 전 × 파트 ① 비움은 ⑧ 차단 · ⑫ 200 이지만 **의도된 비대칭**이다(`docs/02-design/features/bg-gb-residuals.plan.md` §2.2 · Q-2 a —
 * PR-7b-6a 계약 R-0·R-2, 기존 앵커 5건이 지킨다). 그래서 결함으로 세지 않고 여기서 다시 고정하지 않는다.
 * 아래 EC-2 는 그와 달리 근거 문서가 없는 ⑧ 차단 · ⑫ 200 한 건의 **현재 동작 기록**이다(고쳐지면 반전).
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
type R3 = (typeof ROLES3)[number];
const formOf = (role: R3, over: Partial<AssetForm>) => (role === "단건" ? single(over) : form(role, over));
async function go(role: R3, over: Partial<AssetForm>) {
  const f = formOf(role, { actualSalePrice: String(SALE), ...over } as Partial<AssetForm>);
  const r = await post(await captureBody(f));
  return { blocked8: allIssues(f).length > 0, issues: JSON.stringify(allIssues(f)).slice(0, 600), ...r };
}
let SALE = 1_600_000_000;
const SL = 205_000_000, SB = 150_000_000;
const DATES = ["1980-05-01", "1988-05-01", "1995-05-01", "2005-05-01"];
const FAC: [number, number][] = [[0.5, 0.5], [1, 1], [2, 2], [0.5, 2], [2, 0.5]];
const mk = (cause: "inheritance" | "gift", d: string, sep: boolean, lp: number, bp: number): Partial<AssetForm> =>
  cause === "inheritance"
    ? ({ acquisitionCause: "inheritance", gbBuildingAcquisitionCause: "inheritance", landAcquisitionDate: d, acquisitionDate: d, decedentAcquisitionDate: "1960-01-01",
        publishedValueAtInheritance: String(lp), gbBuildingInheritedValue: String(bp), hasSeperateLandAcquisitionDate: sep, ...(sep ? { landAcqMode: "actual", buildingAcqMode: "actual" } : {}) } as Partial<AssetForm>)
    : ({ acquisitionCause: "gift", gbBuildingAcquisitionCause: "gift", landAcquisitionDate: d, acquisitionDate: d, hasSeperateLandAcquisitionDate: true, landAcqMode: "actual", buildingAcqMode: "actual",
        landAcquisitionPrice: String(lp), buildingAcquisitionPrice: String(bp) } as Partial<AssetForm>);

const pick = (found: Record<string, unknown>, role: R3) => {
  const keys = Object.keys(found).filter((k) => (role === "컴패니언" ? k.includes(".asset-") : role === "주 자산" ? k.includes(".primary.") : k.includes("generalBuildingValuationDetail")));
  const o: Record<string, any> = {}; // eslint-disable-line @typescript-eslint/no-explicit-any
  for (const k of keys) { if (k.endsWith("assetCards.0.sec1639Basis")) o.b0 = found[k]; else if (k.endsWith("assetCards.1.sec1639Basis")) o.b1 = found[k]; else if (k.endsWith("preDeemedAcquisition")) o.pd = found[k]; }
  return o;
};
const purchase = (d: string, lp: number, bp: number): Partial<AssetForm> =>
  ({ acquisitionCause: "purchase", gbBuildingAcquisitionCause: "purchase", landAcquisitionDate: d, acquisitionDate: d, hasSeperateLandAcquisitionDate: true, landAcqMode: "actual", buildingAcqMode: "actual",
     landAcquisitionPrice: String(lp), buildingAcquisitionPrice: String(bp) } as Partial<AssetForm>);

const SALES: [number, { conv: number; sec164Parts: number; rawDiffers: number }][] = [
  [1_600_000_000, { conv: 36, sec164Parts: 54, rawDiffers: 15 }],
  [1_000_000_000, { conv: 0, sec164Parts: 90, rawDiffers: 24 }],
];

describe("EC-1 ①② echo · 카드 echo · 세액 오라클 — 상속·증여 × 4일자 × 분리 × 가액 5조합 × 위치 3 (180셀) × 양도가액 2", () => {
  it.each(SALES)("양도가액 %s: 전 셀 ⑧ 통과 · 200, 멱등·매매 채널 세액 ±0, 카드·echo 정합", async (sale, want) => {
    SALE = sale;
    const bad: string[] = []; let conv = 0; let sec164Parts = 0; let rawDiffers = 0; let n = 0;
    for (const cause of ["inheritance", "gift"] as const) for (const d of DATES) for (const sep of cause === "gift" ? [true] : [false, true]) for (const [fl, fb] of FAC) for (const role of ROLES3) {
      const y = Number(d.slice(0, 4)); const tag = `${cause}|${d}|${sep}|${fl}|${fb}|${role}`;
      const lp = SL * fl; const bp = SB * fb;
      const base = await go(role, mk(cause, d, sep, lp, bp)); n++;
      if (base.blocked8 || base.status !== 200) { bad.push(`${tag} 상태 ${base.blocked8}/${base.status}`); continue; }
      const c = pick(base.found, role);
      let Pl = y < 1991 ? Math.max(lp, SL) : lp; let Pb = y <= 1995 ? Math.max(bp, SB) : bp;
      let convLand = false; let convBld = false;
      if (y === 1980) {
        for (const [part, rep, s164] of [["land", lp, SL], ["building", bp, SB]] as const) {
          const e = c.pd?.[part];
          if (!e) { bad.push(`${tag} ${part} pd 없음`); continue; }
          if (e.reported !== rep || e.sec164 !== s164) bad.push(`${tag} ${part} ①② echo ${e.reported}/${e.sec164}`);
          if ((e.adopted !== "converted") !== (part === "land" ? "b0" in c : "b1" in c)) bad.push(`${tag} ${part} 카드 유무와 채택 불일치`);
          if (e.adopted === "sec164") sec164Parts++;
        }
        if (c.pd?.land) { Pl = Math.max(c.pd.land.reported, c.pd.land.sec164, c.pd.land.converted); convLand = c.pd.land.adopted === "converted"; }
        if (c.pd?.building) { Pb = Math.max(c.pd.building.reported, c.pd.building.sec164, c.pd.building.converted); convBld = c.pd.building.adopted === "converted"; }
      }
      for (const [nm, rep, s164, applies] of [["b0", lp, SL, y < 1991], ["b1", bp, SB, y <= 1995]] as const) {
        if (c[nm] && c[nm].adopted !== (applies && s164 > rep ? "sec164" : "reported")) bad.push(`${tag} ${nm} 근거 ${c[nm].adopted}`);
        if (c[nm] && y !== 1980 && c[nm].adopted === "sec164") sec164Parts++;
      }
      const isConv = convLand || convBld; if (isConv) conv++;
      if (!isConv) { const idem = await go(role, mk(cause, d, sep, Pl, Pb)); if (idem.tax !== base.tax) bad.push(`${tag} 멱등 ${base.tax}/${idem.tax}`); }
      if (cause === "gift") {
        const pur = await go(role, isConv
          ? ({ ...purchase(d, Pl, Pb), landAcqMode: convLand ? "estimated" : "actual", buildingAcqMode: convBld ? "estimated" : "actual", ...(convLand ? { landAcquisitionPrice: "" } : {}), ...(convBld ? { buildingAcquisitionPrice: "" } : {}) } as Partial<AssetForm>)
          : purchase(d, Pl, Pb));
        if (pur.tax !== base.tax) bad.push(`${tag} 매매 채널 ${base.tax}/${pur.tax}`);
        if (!isConv && (await go(role, purchase(d, lp, bp))).tax !== base.tax) rawDiffers++;
      }
    }
    expect([n, bad, conv, rawDiffers]).toEqual([180, [], want.conv, want.rawDiffers]);
    expect(sec164Parts).toBe(want.sec164Parts);
    SALE = 1_600_000_000;
  }, 300_000);
});

describe("EC-2 현재 동작의 기록 — BG(부담부증여) 상속 × 취득방식 「converted」 × 의제취득일 후: ⑧ 차단 · ⑫ 200 (세액 영향 미측정)", () => {
  /** ⑧ `transfer-tax-validate-bg.ts:380-384` — 상속개시일 1985.1.1. 이후 상속은 §163⑨ 평가액이 실지거래가액이라 환산취득가액 불가(소득세법 §97①1호 단서). ⑫ 에는 같은 조건이 없다. */
  const BGX = { transferType: "burdened_gift", transferCause: "general", bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1,000,000,000", bgDonorRelation: "lineal_descendant",
    bgLendingDepositTotal: "0", bgMortgageDebtAmount: "500,000,000", bgMortgageSetAmount: "500,000,000", bgAcquisitionMethod: "converted",
    bgCoDonorLandStdPriceAtAcq: "10,000,000", bgCoDonorBuildingStdPriceAtAcq: "40,000,000" } as unknown as Partial<AssetForm>;
  it("1988·1995·2005 × 분리 OFF·ON × 평가액 5조합 (30셀): 전부 ⑧ 차단 · ⑫ 200 · 평가액을 바꿔도 세액 불변(평가액이 쓰이지 않는다)", async () => {
    const tally: Record<string, number> = {}; const taxes: Record<string, Set<number | undefined>> = {};
    for (const d of ["1988-05-01", "1995-05-01", "2005-05-01"]) for (const sep of [false, true]) for (const [lp, bp] of [["100000000", "75000000"], ["400000000", "300000000"], ["", "75000000"], ["100000000", ""], ["", ""]]) {
      const r = await go("단건", { ...BGX, acquisitionCause: "inheritance", gbBuildingAcquisitionCause: "inheritance", landAcquisitionDate: d, acquisitionDate: d, decedentAcquisitionDate: "1960-01-01", hasSeperateLandAcquisitionDate: sep,
        ...(sep ? { landAcqMode: "actual", buildingAcqMode: "actual" } : {}), publishedValueAtInheritance: lp, gbBuildingInheritedValue: bp } as Partial<AssetForm>);
      const k = `${r.blocked8 ? "차단" : "통과"}|${r.status}`; tally[k] = (tally[k] ?? 0) + 1;
      (taxes[d] ??= new Set()).add(r.tax);
    }
    expect(tally).toEqual({ "차단|200": 30 });
    expect(Object.fromEntries(Object.entries(taxes).map(([d, v]) => [d, [...v]]))).toEqual({ "1988-05-01": [76_712_292], "1995-05-01": [76_712_292], "2005-05-01": [76_712_292] });
  });
});
