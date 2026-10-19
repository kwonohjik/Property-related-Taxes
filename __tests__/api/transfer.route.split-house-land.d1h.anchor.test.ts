/**
 * D1-H route anchor — 토지 상속·증여(1990.8.30.~2005.4.29.) + 건물 매매 주택의 **주택 부수토지 영 §163⑨ 단서 2호** 비교 (2026-10-19)
 *
 * 계획서 docs/00-pm/transfer-house-land-163-9-2.plan.md (Q-1~Q-5 권고안 확정) · 근거 부동산거래관리과-364(2010.3.10.).
 * 클라이언트 ④(`callTransferTaxAPI`·`callMultiTransferTaxAPI`) → ⑫ Zod → ⑭ → 엔진을 그대로 거친다. ⑧은 같은 시드로 함께 본다.
 *
 * 공통 시드: 양도 2026-06-30 · 12억(토지 7억 / 건물 5억, 파트 실가) · 건물 매매 2018-03-02 3.5억 · 토지 증여 1995-05-01 ① 1억 · 면적 200㎡
 *   ② = 최초공시 주택가격 3억 × 수증일 토지 기준시가(500,000 × 200 = 1억) ÷ (최초공시 토지 1,000,000 × 200 + 최초공시 건물 6천만)
 *     = floor(300,000,000 × 100,000,000 ÷ 260,000,000) = 115,384,615
 * 현행(수정 전) 실측: 토지 ① 1억 단독 · 양도차익 750,000,000 · 비교·고지 없음(계획서 §3 B).
 * ⚠️ 세액은 `makeMockRates()` 실측 — 정본 세액이 아니다. 「② 채택」의 세액은 「① = 115,384,615 · 비교 없음」 대조 시드와 같아야 한다(독립 대조).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST } from "@/app/api/calc/transfer/route";
import { POST as MULTI } from "@/app/api/calc/transfer/multi/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { callMultiTransferTaxAPI } from "@/lib/calc/multi-transfer-tax-api";
import { validateAssetAcquisition } from "@/lib/calc/transfer-tax-validate-acquisition";
import { collectWithFields } from "@/lib/calc/transfer-tax-validate-field";
import { separateAcqPartsSum } from "@/lib/calc/transfer-tax-split-acq-mode";
import { deriveHouseLandSec164Total, houseLandSec164Applies } from "@/lib/calc/transfer-house-land-sec164-bridge";
import { splitAcqBasisView, splitAcqBasisFormula } from "@/lib/tax-engine/transfer-tax-split-display";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { MultiTransferFormData } from "@/lib/stores/multi-transfer-tax-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

const req = (url: string, b: object) =>
  new NextRequest(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any;
type Form = ReturnType<typeof createDefaultTransferFormData>;

const SEC164_LAND = 115_384_615;

/** 건물 매매 + 토지 증여 1995-05-01(토글 ON, 매매 호스트) · 받을 당시 주택 있음 · 단독·다가구 · ② 4칸 + 면적. */
function asset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    addressJibun: "서울 강남구 테스트동 1-1",
    assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2018-03-02",
    landAcquisitionCause: "gift", landCauseHost: "purchase", landAcquisitionDate: "1995-05-01",
    hasSeperateLandAcquisitionDate: true, landAcqMode: "actual", buildingAcqMode: "actual",
    landAcquisitionPrice: "100,000,000", buildingAcquisitionPrice: "350,000,000", fixedAcquisitionPrice: "450,000,000",
    actualSalePrice: "1,200,000,000", saleSplitMode: "actual", landTransferPrice: "700,000,000", buildingTransferPrice: "500,000,000",
    landStandardPriceAtTransfer: "700,000,000", buildingStandardPriceAtTransfer: "500,000,000",
    acquisitionArea: "200", transferArea: "200",
    landHouseExisted: "yes", inheritanceAssetKind: "house_individual",
    inhHouseValHousePriceAtFirst: "300,000,000", inhHouseValLandPricePerSqmAtFirst: "1,000,000",
    inhHouseValBuildingStdPriceAtFirst: "60,000,000", inhHouseValLandPricePerSqmAtInheritance: "500,000",
    ...over,
  } as AssetForm;
}
function form(assets: AssetForm[], over: Partial<Form> = {}): Form {
  const f = createDefaultTransferFormData();
  f.transferDate = "2026-06-30";
  f.contractTotalPrice = "1,200,000,000";
  f.householdHousingCount = "2";
  f.assets = assets as never;
  return Object.assign(f, over);
}
async function bodyOf(send: () => Promise<unknown>) {
  let body: unknown;
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init: RequestInit) => {
    body = JSON.parse(String(init.body));
    return { ok: true, json: async () => ({ data: { mode: "single", result: {} } }) } as Response;
  }));
  await send().catch(() => undefined);
  vi.unstubAllGlobals();
  return body as J;
}
async function single(a: AssetForm) {
  const sent = await bodyOf(() => callTransferTaxAPI(form([a])));
  const res = await POST(req("http://l/api/calc/transfer", sent));
  const body = (await res.json()) as J;
  return { status: res.status, body, r: body?.data?.result, sent };
}
async function multi(a: AssetForm) {
  const m = { taxYear: 2026, annualBasicDeductionUsed: "0", basicDeductionAllocation: "EARLIEST_TRANSFER" } as MultiTransferFormData;
  const sent = await bodyOf(() => callMultiTransferTaxAPI(m, [{ propertyId: "p1", propertyLabel: "p1", form: form([a]), completionPercent: 100 }]));
  const res = await MULTI(req("http://l/api/calc/transfer/multi", sent));
  return { status: res.status, body: (await res.json()) as J, sent };
}
/** ⑧ — 첫 오류의 이동 칸과 문구 */
function v8(a: AssetForm): { field?: string; message?: string } {
  const c = collectWithFields(() => validateAssetAcquisition(a, "자산1", "2026-06-30"));
  const m = c.result as unknown as string | null | undefined;
  return m ? { field: c.fieldOf(m) as string | undefined, message: m } : {};
}
const warn = (r: J, needle: string) => ((r?.warnings ?? []) as string[]).some((w) => w.includes(needle));

describe("A) ② 채택·① 채택·동점 — 받을 당시 주택 있음 · 단독·다가구", () => {
  it("A-1 ① 1억 < ② 115,384,615 → 토지 취득가액 ② · echo sec163_9_2_land · 세액은 「① = ② 값, 비교 없음」 대조와 같다", async () => {
    expect(v8(asset())).toEqual({});
    const x = await single(asset());
    expect(x.sent.landHouseExisted).toBe("yes");
    expect(x.sent.buildingHouseKind).toBe("house_individual");
    expect(x.sent.landHouseSec164Value).toBe(SEC164_LAND);
    expect(x.status, JSON.stringify(x.body)).toBe(200);
    expect(x.r.splitDetail.land.acquisitionPrice).toBe(SEC164_LAND);
    expect(x.r.splitDetail.land.acquisitionBasis).toEqual({ rule: "sec163_9_2_land", reported: 100_000_000, sec164: SEC164_LAND, adopted: "sec164" });
    expect(x.r.splitDetail.building.acquisitionBasis).toBeUndefined();
    expect(x.r.transferGain).toBe(1_200_000_000 - SEC164_LAND - 350_000_000);
    expect(warn(x.r, "제164조 제7항 가액의 토지 몫 중 많은 금액으로 정했습니다")).toBe(true);
    // 독립 대조 — 같은 토지 취득가액을 ①로 직접 넣고 비교를 끈 계산(받을 당시 주택 없음)
    const ctl = await single(asset({ landHouseExisted: "no", landAcquisitionPrice: SEC164_LAND.toLocaleString() }));
    expect(ctl.status).toBe(200);
    expect(ctl.r.splitDetail.land.acquisitionBasis).toBeUndefined();
    expect(x.r.taxBase).toBe(ctl.r.taxBase);
    expect(x.r.determinedTax).toBe(ctl.r.determinedTax);
  });

  it("A-2 ① 1.3억 > ② → ① 채택 · echo adopted reported", async () => {
    const x = await single(asset({ landAcquisitionPrice: "130,000,000" }));
    expect(x.status).toBe(200);
    expect(x.r.splitDetail.land.acquisitionPrice).toBe(130_000_000);
    expect(x.r.splitDetail.land.acquisitionBasis).toMatchObject({ rule: "sec163_9_2_land", adopted: "reported" });
  });

  it("A-3 동점(① = ②) → 평가액(reported) 채택", async () => {
    const x = await single(asset({ landAcquisitionPrice: SEC164_LAND.toLocaleString() }));
    expect(x.r.splitDetail.land.acquisitionBasis.adopted).toBe("reported");
    expect(x.r.splitDetail.land.acquisitionPrice).toBe(SEC164_LAND);
  });

  it("A-4 상속(피상속인 취득일 포함)도 같다", async () => {
    const x = await single(asset({ landAcquisitionCause: "inheritance", landDecedentAcquisitionDate: "1980-01-01" }));
    expect(x.status, JSON.stringify(x.body)).toBe(200);
    expect(x.r.splitDetail.land.acquisitionBasis).toMatchObject({ rule: "sec163_9_2_land", adopted: "sec164", sec164: SEC164_LAND });
  });

  it("A-5 지분 50% → ① ratioed 5천만 · ② applyRatio(115,384,615, 0.5) = 57,692,307", async () => {
    const half = asset({ ownershipNumerator: "1", ownershipDenominator: "2" } as Partial<AssetForm>);
    expect(deriveHouseLandSec164Total(half)).toBe(57_692_307);
    const x = await single(half);
    expect(x.status, JSON.stringify(x.body)).toBe(200);
    expect(x.sent.landHouseSec164Value).toBe(57_692_307);
    expect(x.r.splitDetail.land.acquisitionBasis).toMatchObject({ reported: 50_000_000, sec164: 57_692_307, adopted: "sec164" });
  });
});

describe("B) Q-1 「받을 당시 주택이 있었는가」", () => {
  it("B-1 모름 → ① 단독 · 확인 필요 고지 · ⑧ 통과", async () => {
    const a = asset({ landHouseExisted: "unknown" });
    expect(v8(a)).toEqual({});
    const x = await single(a);
    expect(x.sent.landHouseExisted).toBe("unknown");
    expect(x.sent.landHouseSec164Value).toBeUndefined();
    expect(x.sent.buildingHouseKind).toBeUndefined();
    expect(x.status).toBe(200);
    expect(x.r.splitDetail.land.acquisitionPrice).toBe(100_000_000);
    expect(x.r.splitDetail.land.acquisitionBasis).toBeUndefined();
    expect(x.r.transferGain).toBe(750_000_000); // 현행과 같은 값
    expect(warn(x.r, "그 사실이 확인되지 않아 평가액만으로 계산했습니다")).toBe(true);
  });

  it("B-2 없었음 → ① 단독 · 고지 없음", async () => {
    const x = await single(asset({ landHouseExisted: "no" }));
    expect(x.status).toBe(200);
    expect(x.r.splitDetail.land.acquisitionPrice).toBe(100_000_000);
    expect(warn(x.r, "토지 몫")).toBe(false);
  });

  it("B-3 미선택 → ⑧은 「있었는지 선택」으로 막는다 · ④는 보내지 않고 route는 모름과 같다(⑧이 더 엄격)", async () => {
    const a = asset({ landHouseExisted: "" });
    expect(v8(a).field).toBe("landHouseExisted");
    const x = await single(a);
    expect(x.sent.landHouseExisted).toBeUndefined();
    expect(x.status).toBe(200);
    expect(warn(x.r, "그 사실이 확인되지 않아")).toBe(true);
  });
});

describe("C) Q-3 주택 구분 · ② 필수 · 일부 양도 — ⑧ 칸 ≡ ⑫ 400", () => {
  it("C-1 구분 미선택 → ⑧ inheritanceAssetKind(선택 요구) · ⑫ 400", async () => {
    const a = asset({ inheritanceAssetKind: "land" });
    const e = v8(a);
    expect(e.field).toBe("inheritanceAssetKind");
    expect(e.message).toContain("주택 구분(단독·다가구주택 / 공동주택)을 선택하세요");
    expect((await single(a)).status).toBe(400);
  });

  it("C-2 공동주택 → ⑧ leaf 문구(지원하지 않음) · ⑫ 400", async () => {
    const a = asset({ inheritanceAssetKind: "house_apart" });
    const e = v8(a);
    expect(e.field).toBe("inheritanceAssetKind");
    expect(e.message).toContain("단독·다가구주택으로 확인된 주택만 지원합니다");
    expect((await single(a)).status).toBe(400);
  });

  it.each([
    ["acquisitionArea", { acquisitionArea: "", transferArea: "" }],
    ["inhHouseValHousePriceAtFirst", { inhHouseValHousePriceAtFirst: "" }],
    ["inhHouseValLandPricePerSqmAtFirst", { inhHouseValLandPricePerSqmAtFirst: "" }],
    ["inhHouseValBuildingStdPriceAtFirst", { inhHouseValBuildingStdPriceAtFirst: "" }],
    ["inhHouseValLandPricePerSqmAtInheritance", { inhHouseValLandPricePerSqmAtInheritance: "" }],
  ])("C-3 ② 칸 %s 비움 → ⑧ 그 칸 · ⑫ 400", async (f, over) => {
    const a = asset(over as Partial<AssetForm>);
    expect(v8(a).field).toBe(f);
    expect((await single(a)).status).toBe(400);
  });

  it("C-4 일부 양도 → ⑧ areaScenario · ⑫ 400", async () => {
    const a = asset({ areaScenario: "partial", transferArea: "100" } as Partial<AssetForm>);
    expect(v8(a).field).toBe("areaScenario");
    expect((await single(a)).status).toBe(400);
  });
});

describe("D) 구간 경계 · 호스트 (Q-2 · Q-4)", () => {
  it("D-1 토지 취득일 1990-08-30(고시일 당일) → 단서 2호 구간 안 · 비교", async () => {
    const a = asset({ landAcquisitionDate: "1990-08-30" });
    expect(houseLandSec164Applies(a)).toBe(true);
    const x = await single(a);
    expect(x.status, JSON.stringify(x.body)).toBe(200);
    expect(x.r.splitDetail.land.acquisitionBasis?.rule).toBe("sec163_9_2_land");
  });

  it("D-2 2005-04-29 → 구간 안 · 2005-04-30 → 구간 밖(① 단독 · 고지 없음 · ④ 미전송)", async () => {
    expect(houseLandSec164Applies(asset({ landAcquisitionDate: "2005-04-29" }))).toBe(true);
    const out = asset({ landAcquisitionDate: "2005-04-30" });
    expect(houseLandSec164Applies(out)).toBe(false);
    const x = await single(out);
    expect(x.sent.landHouseExisted).toBeUndefined();
    expect(x.status).toBe(200);
    expect(x.r.splitDetail.land.acquisitionPrice).toBe(100_000_000);
    expect(warn(x.r, "토지 몫")).toBe(false);
  });

  it("D-3 1990-08-29 → 단서 1호(D1-4) 구간 — 이 카드는 열리지 않는다(Q-4 현행 유지)", () => {
    expect(houseLandSec164Applies(asset({ landAcquisitionDate: "1990-08-29" }))).toBe(false);
  });

  it("D-4 신축 호스트(Q-2) → 비교 없음 · ① 단독 · 종전 주택 한계 고지", async () => {
    const nc = asset({
      acquisitionCause: "newConstruction", landCauseHost: "newConstruction", acquisitionDate: "2020-06-01", occupancyApprovalDate: "2020-06-01",
      buildingAcquisitionPrice: "", fixedAcquisitionPrice: "400,000,000",
    } as Partial<AssetForm>);
    expect(houseLandSec164Applies(nc)).toBe(false);
    const x = await single(nc);
    expect(x.sent.landHouseExisted).toBeUndefined();
    expect(x.status, JSON.stringify(x.body)).toBe(200);
    expect(x.r.splitDetail.land.acquisitionPrice).toBe(100_000_000);
    expect(x.r.transferGain).toBe(700_000_000); // 현행(계획서 §3 B2)과 같다
    expect(warn(x.r, "이 계산기는 종전 주택의 가액을 받지 않아")).toBe(true);
  });

  it("D-5 비주택(건물) → 열리지 않는다", () => {
    expect(houseLandSec164Applies(asset({ assetKind: "building" }))).toBe(false);
  });
});

describe("E) ⑥ 사이드바 · ⑦ 표시", () => {
  it("E-1 비교가 도는 경우만 pending — 모름·없었음은 ① 합산", () => {
    expect(separateAcqPartsSum(asset()).pending).toBe(true);
    expect(separateAcqPartsSum(asset({ landHouseExisted: "unknown" }))).toEqual({ sum: 450_000_000, pending: false });
  });

  it("E-2 ⑦ 결과 문장 — 파트 「토지」 · 「영 §164⑦ 가액의 토지 몫」 · 단서 2호", async () => {
    const x = await single(asset());
    const v = splitAcqBasisView(x.r.splitDetail.land)!;
    expect(v.partLabel).toBe("토지");
    expect(v.legalBasis).toBe("소득세법 시행령 §163조 제9항 단서 2호");
    expect(splitAcqBasisFormula(v)).toBe("토지 취득가액 = 많은 금액(증여 신고가액 100,000,000, 영 §164⑦ 가액의 토지 몫 115,384,615) = 115,384,615");
  });
});

describe("F) 다건 · 직접 호출 — ⑫ 다건 스키마 · ⑭ multi", () => {
  it("F-1 다건 route도 ②를 받아 200 · 토지 echo", async () => {
    const m = await multi(asset());
    expect(m.status, JSON.stringify(m.body)).toBe(200);
    expect(JSON.stringify(m.body)).toContain("sec163_9_2_land");
  });

  it("F-2 다건에서 ② 칸을 비우면 400", async () => {
    expect((await multi(asset({ inhHouseValHousePriceAtFirst: "" }))).status).toBe(400);
  });

  it("F-4 직접 호출 — 신축 호스트에 「있었음」·구분·②를 실어도 비교하지 않는다(Q-2) · 200 · 종전 주택 한계 고지", async () => {
    const x = await single(asset());
    const b = JSON.parse(JSON.stringify(x.sent));
    Object.assign(b, { acquisitionCause: "newConstruction", acquisitionDate: "2020-06-01" });
    const res = await POST(req("http://l/api/calc/transfer", b));
    const j = (await res.json()) as J;
    expect(res.status, JSON.stringify(j)).toBe(200);
    expect(j.data.result.splitDetail.land.acquisitionBasis).toBeUndefined();
    expect(j.data.result.splitDetail.land.acquisitionPrice).toBe(100_000_000);
    expect(warn(j.data.result, "이 계산기는 종전 주택의 가액을 받지 않아")).toBe(true);
  });

  it("F-3 단건 body에서 ②를 지우면(있음 · 단독) ⑫ 400 — 직접 호출도 같은 leaf", async () => {
    const x = await single(asset());
    const b = JSON.parse(JSON.stringify(x.sent));
    delete b.landHouseSec164Value;
    expect((await POST(req("http://l/api/calc/transfer", b))).status).toBe(400);
  });
});

describe("G) ⑧ ≡ ⑫ 격자 — 「⑧ 통과 ⇒ ⑫ 200」 · 구간 안 「있었음 ∧ 단독 ∧ 완결」만 비교", () => {
  it("날짜 5 × 호스트 2 × 원인 2 × 있었음 4 × 구분 3 × 입력 3 = 720셀", async () => {
    const dates = ["1990-08-29", "1990-08-30", "1995-05-01", "2005-04-29", "2005-04-30"];
    const hosts: Partial<AssetForm>[] = [
      {},
      { acquisitionCause: "newConstruction", landCauseHost: "newConstruction", acquisitionDate: "2020-06-01", occupancyApprovalDate: "2020-06-01",
        buildingAcquisitionPrice: "", fixedAcquisitionPrice: "400,000,000" } as Partial<AssetForm>,
    ];
    const causes: Partial<AssetForm>[] = [{}, { landAcquisitionCause: "inheritance", landDecedentAcquisitionDate: "1980-01-01" }];
    const existed = ["", "yes", "no", "unknown"] as const;
    const kinds = ["land", "house_individual", "house_apart"] as const;
    const inputs: Partial<AssetForm>[] = [{}, { inhHouseValHousePriceAtFirst: "" }, { areaScenario: "partial", transferArea: "100" } as Partial<AssetForm>];
    const violations: string[] = [];
    let compared = 0;
    for (const d of dates) for (const [hi, h] of hosts.entries()) for (const c of causes) for (const e of existed) for (const k of kinds) for (const [ii, inp] of inputs.entries()) {
      const a = asset({ landAcquisitionDate: d, ...h, ...c, landHouseExisted: e, inheritanceAssetKind: k, ...inp });
      const pass = !v8(a).field && !v8(a).message;
      if (!pass) continue;
      const x = await single(a);
      const tag = `${d}/${hi ? "nc" : "p"}/${c.landAcquisitionCause ?? "gift"}/${e}/${k}/${ii}`;
      if (x.status !== 200) violations.push(`${tag} → ${x.status} ${JSON.stringify(x.body?.error ?? "").slice(0, 120)}`);
      else if (x.r.splitDetail?.land?.acquisitionBasis?.rule === "sec163_9_2_land") {
        compared++;
        const inRange = d >= "1990-08-30" && d < "2005-04-30";
        if (!(inRange && hi === 0 && e === "yes" && k === "house_individual" && ii === 0)) violations.push(`${tag} → 범위 밖 비교`);
      }
    }
    expect(violations).toEqual([]);
    // 비교가 도는 셀: 날짜 3(1990-08-30·1995·2005-04-29) × 원인 2 = 6
    expect(compared).toBe(6);
  }, 120_000);
});

describe("H) 컴패니언 일괄양도 — ④ buildAssetPayload · ⑫ 컴패니언 스키마 · ⑭ bundled-split-helpers", () => {
  function bundled(companion: AssetForm): Form {
    const land = { ...makeDefaultAsset(1), assetKind: "land", acquisitionCause: "purchase", acquisitionDate: "2010-01-01", fixedAcquisitionPrice: "100,000,000", standardPriceAtTransfer: "300,000,000", actualSalePrice: "300,000,000" } as AssetForm;
    return form([land, { ...companion, assetId: "c1" } as AssetForm], { contractTotalPrice: "1,500,000,000", bundledSaleMode: "actual" as never } as never);
  }
  async function sendForm(f: Form) {
    const sent = await bodyOf(() => callTransferTaxAPI(f));
    const res = await POST(req("http://l/api/calc/transfer", sent));
    return { status: res.status, body: (await res.json()) as J, sent };
  }

  it("H-1 컴패니언: body에 「있었음」·구분·②가 실리고 route 200 · 토지 echo sec163_9_2_land · 토지 취득가액 ②", async () => {
    const s = await sendForm(bundled(asset()));
    expect(s.sent.companionAssets[0]).toMatchObject({ landHouseExisted: "yes", buildingHouseKind: "house_individual", landHouseSec164Value: SEC164_LAND });
    expect(s.status, JSON.stringify(s.body)).toBe(200);
    const c1 = s.body.data.aggregated.properties.find((p: J) => p.propertyId === "c1");
    expect(c1.splitDetail.land.acquisitionBasis).toMatchObject({ rule: "sec163_9_2_land", adopted: "sec164", sec164: SEC164_LAND });
    expect(c1.splitDetail.land.acquisitionPrice).toBe(SEC164_LAND);
  });

  it("H-2 컴패니언 body에서 ②를 지우면 ⑫ 400 · 「있었음」을 지우면 모름으로 읽혀 200(비교 없음)", async () => {
    const s = await sendForm(bundled(asset()));
    const noSec = JSON.parse(JSON.stringify(s.sent));
    delete noSec.companionAssets[0].landHouseSec164Value;
    expect((await POST(req("http://l/api/calc/transfer", noSec))).status).toBe(400);
    const noExisted = JSON.parse(JSON.stringify(s.sent));
    delete noExisted.companionAssets[0].landHouseExisted;
    const r = await POST(req("http://l/api/calc/transfer", noExisted));
    expect(r.status).toBe(200);
    const c1 = ((await r.json()) as J).data.aggregated.properties.find((p: J) => p.propertyId === "c1");
    expect(c1.splitDetail.land.acquisitionBasis).toBeUndefined();
  });
});
