/**
 * 주택별 개별주택가격 최초공시일 route anchor — 영 §163⑨ 단서 2호 구간의 끝을 주택마다로 (2026-10-19)
 *
 * 계획서 docs/00-pm/transfer-house-first-disclosure-per-house.plan.md (Q-1~Q-4 권고안 확정) · 근거 영 §164⑦ ·
 * 부동산거래관리과-364(2010.3.10. — 수증 2005.5.12. · 최초공시 2006.4.28.).
 * 클라이언트 ④(`callTransferTaxAPI`·`callMultiTransferTaxAPI`) → ⑫ Zod → ⑭ → 엔진을 그대로 거친다. ⑧은 같은 시드로 함께 본다.
 *
 * 현행(수정 전) 실측(계획서 §3): 해석례 사안을 넣으면 네 경로 모두 평가액(①) 단독 — 자산 단위 증여 1,100,000,000 ·
 * 소유자 분리 land_only 961,904,762 · D2-4 870,000,000 · D1-H 750,000,000. 같은 입력의 2005-04-29 대조는
 * 1,026,923,077 · 913,186,813 · 864,000,000 · 734,615,385.
 * ⚠️ 세액은 `makeMockRates()` — 정본 세액이 아니다. 양도차익 일치로 「같은 비교가 돌았다」를 본다.
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
const TD = "2026-06-30";
const FD = "2006-04-28";

/** 영 §164⑦ 보조 입력(최초공시 주택가격 3억 · ㎡당 1,000,000 · 200㎡ · 수증일 ㎡당 500,000 · 건물 기준시가) */
const HOUSE164: Partial<AssetForm> = {
  inhHouseValLandArea: "200",
  inhHouseValLandPricePerSqmAtTransfer: "3,000,000",
  inhHouseValLandPricePerSqmAtFirst: "1,000,000",
  inhHouseValHousePriceAtFirst: "300,000,000",
  inhHouseValLandPricePerSqmAtInheritance: "500,000",
  inhHouseValBuildingStdPriceAtFirst: "60,000,000",
  inhHouseValBuildingStdPriceAtInheritance: "50,000,000",
};

/** P1 — 주택 전체 증여(자산 단위 영 §163⑨ 단서 2호) · ① 1억 · 단독·다가구 명시 */
function wholeGift(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    addressJibun: "서울 강남구 테스트동 1-1",
    assetKind: "housing", acquisitionCause: "gift", acquisitionDate: "2005-05-12",
    inheritanceAssetKind: "house_individual",
    fixedAcquisitionPrice: "100,000,000", actualSalePrice: "1,200,000,000",
    acquisitionArea: "200", transferArea: "200",
    ...HOUSE164,
    ...over,
  } as AssetForm;
}
/** P4 — 소유자 분리 land_only(해석례 364와 같은 소유 형태: 주택은 다른 사람, 부수토지만 수증) */
const OWNER_SPLIT: Partial<AssetForm> = {
  selfOwns: "land_only", buildingOwnerSameHousehold: true, buildingOwnerHouseholdMerged: false, hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2005-05-12",
  standardPricePerSqmAtAcq: "500000", standardPriceAtAcq: "150,000,000", buildingStandardPriceAtAcq: "50,000,000",
  landStandardPriceAtTransfer: "600,000,000", buildingStandardPriceAtTransfer: "100,000,000",
} as Partial<AssetForm>;
/** P2 — D2-4 건물 상속 + 토지 매매 */
function d24(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    addressJibun: "서울 강남구 테스트동 1-1",
    assetKind: "housing", acquisitionCause: "inheritance", acquisitionDate: "2005-05-12", inheritanceStartDate: "2005-05-12", inheritanceDate: "2005-05-12",
    decedentAcquisitionDate: "1990-01-01", landCauseHost: "inheritance", landAcquisitionCause: "purchase", landAcquisitionDate: "2020-01-10",
    hasSeperateLandAcquisitionDate: true, landAcqMode: "actual", buildingAcqMode: "actual", landAcquisitionPrice: "300,000,000",
    buildingAcquisitionPrice: "30,000,000", actualSalePrice: "1,200,000,000", saleSplitMode: "actual", landTransferPrice: "700,000,000",
    buildingTransferPrice: "500,000,000", landStandardPriceAtTransfer: "700,000,000", buildingStandardPriceAtTransfer: "500,000,000",
    inheritanceAssetKind: "house_individual", acquisitionArea: "200",
    inhHouseValHousePriceAtFirst: "300,000,000", inhHouseValLandPricePerSqmAtFirst: "1,000,000",
    inhHouseValBuildingStdPriceAtFirst: "50,000,000", inhHouseValBuildingStdPriceAtInheritance: "30,000,000",
    ...over,
  } as AssetForm;
}
/** P3 — D1-H 토지 증여 + 건물 매매 · 받을 당시 주택 있음 */
function d1h(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    addressJibun: "서울 강남구 테스트동 1-1",
    assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2018-03-02",
    landAcquisitionCause: "gift", landCauseHost: "purchase", landAcquisitionDate: "2005-05-12",
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
  f.transferDate = TD;
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
  const c = collectWithFields(() => validateAssetAcquisition(a, "자산1", TD));
  const m = c.result as unknown as string | null | undefined;
  return m ? { field: c.fieldOf(m) as string | undefined, message: m } : {};
}
async function gain(a: AssetForm): Promise<number> {
  const x = await single(a);
  expect(x.status, JSON.stringify(x.body).slice(0, 400)).toBe(200);
  return x.r.transferGain;
}

describe("A) 해석례 364 사안 — 네 경로가 2005-04-29 대조군과 같은 비교를 한다", () => {
  const cases: [string, (o?: Partial<AssetForm>) => AssetForm, Partial<AssetForm>, number][] = [
    ["P1 자산 단위 증여", wholeGift, { acquisitionDate: "2005-04-29" }, 1_026_923_077],
    ["P4 소유자 분리 land_only", (o) => wholeGift({ ...OWNER_SPLIT, ...o }), { acquisitionDate: "2005-04-29", landAcquisitionDate: "2005-04-29" }, 913_186_813],
    ["P2 D2-4 건물 상속", d24, { acquisitionDate: "2005-04-29", inheritanceStartDate: "2005-04-29", inheritanceDate: "2005-04-29" } as Partial<AssetForm>, 864_000_000],
    ["P3 D1-H 토지 증여", d1h, { landAcquisitionDate: "2005-04-29" }, 734_615_385],
  ];
  for (const [name, mk, control, controlGain] of cases) {
    it(`${name}: 최초공시 ${FD}이면 양도차익 = 대조군 ${controlGain.toLocaleString()} · ⑧ 통과 · body에 날짜`, async () => {
      expect(await gain(mk(control))).toBe(controlGain);
      const a = mk({ inhHouseValFirstDisclosureDate: FD });
      expect(v8(a)).toEqual({});
      const x = await single(a);
      expect(x.status, JSON.stringify(x.body).slice(0, 400)).toBe(200);
      expect(x.sent.houseFirstDisclosureDate).toBe(FD);
      expect(x.r.transferGain).toBe(controlGain);
    });
  }

  it("P1i 자산 단위 상속(의제취득일 이후) — 05-12 + 최초공시가 04-29 대조와 같다", async () => {
    const inh = (o: Partial<AssetForm>) => wholeGift({
      acquisitionCause: "inheritance", inheritanceStartDate: "2005-05-12", decedentAcquisitionDate: "1980-01-01",
      fixedAcquisitionPrice: "", publishedValueAtInheritance: "100,000,000", inheritanceValuationMethod: "supplementary", ...o,
    } as Partial<AssetForm>);
    const control = await gain(inh({ acquisitionDate: "2005-04-29", inheritanceStartDate: "2005-04-29" } as Partial<AssetForm>));
    const before = await gain(inh({}));
    expect(before).toBe(1_100_000_000);
    expect(await gain(inh({ inhHouseValFirstDisclosureDate: FD }))).toBe(control);
    expect(control).not.toBe(before);
  });
});

describe("B) 회귀 0 — 날짜를 바꾸지 않으면 payload·결과가 종전과 같다", () => {
  it("B-1 기본값(2005-04-30)은 싣지 않는다 · 05-12 수증은 ① 단독(종전 실측값)", async () => {
    for (const [mk, g] of [[wholeGift, 1_100_000_000], [d24, 870_000_000], [d1h, 750_000_000]] as const) {
      const x = await single(mk());
      expect(x.status).toBe(200);
      expect("houseFirstDisclosureDate" in x.sent).toBe(false);
      expect(x.r.transferGain).toBe(g);
    }
  });
  it("B-2 공동주택 명시 + 2003 상속 + 최초공시 2006-04-28 — 싣지 않고 ⑧ 통과(자산 단위 공동주택은 이 날짜를 쓰지 않는다)", async () => {
    // 2026-10-19 공동주택 국세청 고시 가액 질문(transfer-163-9-apart-nts-price-question.plan.md) — 2005.4.30. 전 공동주택은 그 답이 필수다.
    // 「있었음」으로 답한 상태에서 남은 개별주택 날짜가 싣지 않음·⑧ 통과임을 본다(답 없는 경우는 apart-nts-price route anchor).
    const a = wholeGift({ acquisitionCause: "inheritance", acquisitionDate: "2003-05-01", inheritanceStartDate: "2003-05-01", decedentAcquisitionDate: "1980-01-01", fixedAcquisitionPrice: "", publishedValueAtInheritance: "100,000,000", inheritanceValuationMethod: "supplementary", inheritanceAssetKind: "house_apart", inhApartNtsPriceExisted: "yes", inhHouseValFirstDisclosureDate: FD } as Partial<AssetForm>);
    expect(v8(a)).toEqual({});
    const x = await single(a);
    expect("houseFirstDisclosureDate" in x.sent).toBe(false);
  });
  it("B-3 매매 주택에 남은 날짜는 싣지 않는다(경로 없음)", async () => {
    const x = await single(d1h({ landAcquisitionCause: "", hasSeperateLandAcquisitionDate: false, inhHouseValFirstDisclosureDate: FD } as Partial<AssetForm>));
    expect("houseFirstDisclosureDate" in x.sent).toBe(false);
  });
});

describe("C) 경계 — 최초공시 당일 수증은 「공시되기 전」이 아니다(엄격 <)", () => {
  it("C-1 최초공시일 = 수증일 → 닫힘(① 단독) · 다음 날 → 열림", async () => {
    expect(await gain(wholeGift({ inhHouseValFirstDisclosureDate: "2005-05-12" }))).toBe(1_100_000_000);
    expect(await gain(wholeGift({ inhHouseValFirstDisclosureDate: "2005-05-13" }))).toBe(1_026_923_077);
    expect(await gain(d1h({ inhHouseValFirstDisclosureDate: "2005-05-12" }))).toBe(750_000_000);
    expect(await gain(d1h({ inhHouseValFirstDisclosureDate: "2005-05-13" }))).toBe(734_615_385);
    expect(await gain(d24({ inhHouseValFirstDisclosureDate: "2005-05-12" }))).toBe(870_000_000);
    expect(await gain(d24({ inhHouseValFirstDisclosureDate: "2005-05-13" }))).toBe(864_000_000);
  });
});

describe("D) 차단 — 범위(Q-3)·주택 구분(Q-2)", () => {
  it("D-1 ⑧ 범위 밖(2005-04-30 전 · 양도일 뒤) → 최초 공시일 칸", () => {
    for (const d of ["2004-12-31", "2026-07-01"]) {
      const e = v8(wholeGift({ inhHouseValFirstDisclosureDate: d }));
      expect(e.field).toBe("inhHouseValFirstDisclosureDate");
      expect(e.message).toContain("2005.4.30.(개별주택가격 첫 공시)부터 양도일까지");
    }
    expect(v8(wholeGift({ inhHouseValFirstDisclosureDate: TD }))).toEqual({});
  });
  it("D-2 ⑫ 범위 밖 직접 전송 → 400 · 경로 houseFirstDisclosureDate (주 자산)", async () => {
    const x = await single(wholeGift({ inhHouseValFirstDisclosureDate: FD }));
    for (const d of ["2004-12-31", "2026-07-01"]) {
      const res = await POST(req("http://l/api/calc/transfer", { ...x.sent, houseFirstDisclosureDate: d }));
      expect(res.status).toBe(400);
      expect(JSON.stringify(await res.json())).toContain("houseFirstDisclosureDate");
    }
  });
  it("D-3 ⑧ 구간을 넓히는 날짜인데 주택 구분이 비었거나 공동주택 → 주택 구분 칸 (자산 단위 공동주택 제외)", () => {
    for (const k of ["", "house_apart"]) {
      for (const mk of [wholeGift, d24, d1h]) {
        // 자산 단위 공동주택은 이 날짜를 쓰지 않는다 — 첫 가격 날짜는 `inhApartFirstPriceDate`(공동주택 질문)다. 남은 값으로 막지 않는다.
        if (mk === wholeGift && k === "house_apart") continue;
        const e = v8(mk({ inheritanceAssetKind: k as never, inhHouseValFirstDisclosureDate: FD }));
        expect(e.field, `${mk.name} ${k}`).toBe("inheritanceAssetKind");
        expect(e.message).toContain("단독·다가구주택인지 골라야 합니다");
      }
    }
    // 자산 단위 공동주택 + 남은 개별주택 날짜: ⑧ 통과(공동주택 질문은 2005.4.30. 전 수증·첫 가격 날짜로 열린 구간에서만) · ④ 미송신
    expect(v8(wholeGift({ inheritanceAssetKind: "house_apart", inhHouseValFirstDisclosureDate: FD }))).toEqual({});
  });
});

describe("D′) 직접 전송 — 날짜는 오는데 주택 구분이 비었거나 공동주택", () => {
  it("D2-4: 구분 없이 날짜만 → 구간이 넓어져 ⑫ 400(단독·다가구 확인) · 공동주택 + 날짜 → 고정 경계라 200(① 단독)", async () => {
    const x = await single(d24({ inhHouseValFirstDisclosureDate: FD }));
    const noKind = { ...x.sent };
    delete noKind.buildingHouseKind;
    const r1 = await POST(req("http://l/api/calc/transfer", noKind));
    expect(r1.status).toBe(400);
    expect(JSON.stringify(await r1.json())).toContain("단독·다가구주택으로 확인된 주택만 지원합니다");
    const r2 = await POST(req("http://l/api/calc/transfer", { ...x.sent, buildingHouseKind: "house_apart" }));
    expect(r2.status).toBe(200);
    expect(((await r2.json()) as J).data.result.transferGain).toBe(870_000_000);
  });
});

describe("D″) 구간이 넓어진 뒤 ② 필수 — ⑧·⑫가 각자 막는다(겹친 방어를 층마다 잠근다)", () => {
  it("⑧: D1-H·D2-4 최초공시 + ② 입력 칸 비움 → 그 칸으로 이동", () => {
    expect(v8(d1h({ inhHouseValFirstDisclosureDate: FD, inhHouseValHousePriceAtFirst: "" })).field).toBe("inhHouseValHousePriceAtFirst");
    expect(v8(d24({ inhHouseValFirstDisclosureDate: FD, inhHouseValBuildingStdPriceAtInheritance: "" })).field).toBe("inhHouseValBuildingStdPriceAtInheritance");
  });
  it("⑫: D1-H·D2-4 body에서 ②를 지우면 400 · Zod 경로가 그 필드", async () => {
    for (const [mk, key] of [[d1h, "landHouseSec164Value"], [d24, "buildingSec164Value"]] as const) {
      const x = await single(mk({ inhHouseValFirstDisclosureDate: FD }));
      const body = { ...x.sent };
      delete body[key];
      const res = await POST(req("http://l/api/calc/transfer", body));
      expect(res.status).toBe(400);
      const j = (await res.json()) as J;
      expect(JSON.stringify(j.error?.details ?? j.details ?? j.issues ?? j), key).toMatch(new RegExp(`"path":\\["${key}"\\]|"${key}"`));
      expect(JSON.stringify(j)).not.toContain("TaxCalculationError");
    }
  });
});

describe("E) 다건·함께 양도 — ⑭ multi·bundled 매핑", () => {
  it("E-1 다건: D1-H·D2-4 body에 날짜가 실리고 대조군과 같은 파트 취득가액", async () => {
    const m1 = await multi(d1h({ inhHouseValFirstDisclosureDate: FD }));
    expect(m1.status, JSON.stringify(m1.body).slice(0, 400)).toBe(200);
    expect(JSON.stringify(m1.sent)).toContain(`"houseFirstDisclosureDate":"${FD}"`);
    const p1 = m1.body.data.properties?.[0] ?? m1.body.data.aggregated?.properties?.[0];
    expect(p1.splitDetail.land.acquisitionBasis).toMatchObject({ rule: "sec163_9_2_land", adopted: "sec164" });
    const m2 = await multi(d24({ inhHouseValFirstDisclosureDate: FD }));
    expect(m2.status, JSON.stringify(m2.body).slice(0, 400)).toBe(200);
    const p2 = m2.body.data.properties?.[0] ?? m2.body.data.aggregated?.properties?.[0];
    expect(p2.splitDetail.building.acquisitionBasis).toMatchObject({ rule: "sec163_9_2", adopted: "sec164" });
  });
  it("E-2 함께 양도 컴패니언(D1-H): body·⑫ 컴패니언 스키마·⑭ bundled 매핑 · 범위 밖은 400", async () => {
    const land = { ...makeDefaultAsset(1), assetKind: "land", acquisitionCause: "purchase", acquisitionDate: "2010-01-01", fixedAcquisitionPrice: "100,000,000", standardPriceAtTransfer: "300,000,000", actualSalePrice: "300,000,000" } as AssetForm;
    const f = form([land, { ...d1h({ inhHouseValFirstDisclosureDate: FD }), assetId: "c1" } as AssetForm], { contractTotalPrice: "1,500,000,000", bundledSaleMode: "actual" as never } as never);
    const sent = await bodyOf(() => callTransferTaxAPI(f));
    expect(sent.companionAssets[0].houseFirstDisclosureDate).toBe(FD);
    const res = await POST(req("http://l/api/calc/transfer", sent));
    const body = (await res.json()) as J;
    expect(res.status, JSON.stringify(body).slice(0, 400)).toBe(200);
    const c1 = body.data.aggregated.properties.find((p: J) => p.propertyId === "c1");
    expect(c1.splitDetail.land.acquisitionBasis).toMatchObject({ rule: "sec163_9_2_land", adopted: "sec164" });
    const bad = JSON.parse(JSON.stringify(sent));
    bad.companionAssets[0].houseFirstDisclosureDate = "2004-01-01";
    const r2 = await POST(req("http://l/api/calc/transfer", bad));
    expect(r2.status).toBe(400);
    expect(JSON.stringify(await r2.json())).toContain("houseFirstDisclosureDate");
  });
});

describe("F) 결과 고지 — D1-H 「있었는지 모름」 문구가 그 주택의 구간 끝을 말한다", () => {
  it("F-1 모름 + 최초공시 2006-04-28 → 「2006.4.28. 전」", async () => {
    const x = await single(d1h({ landHouseExisted: "unknown", inhHouseValFirstDisclosureDate: FD }));
    expect(x.status).toBe(200);
    const w = (x.r.warnings as string[]).find((s) => s.includes("받을 당시 지금의 주택"));
    expect(w).toContain("(2006.4.28. 전)");
  });
});

describe("G) ⑧ 통과 ⇒ ⑫ 200 격자 (경로 3 × 기준일 3 × 최초공시일 5 × 주택 구분 3 = 135셀)", () => {
  it("G-1 위반 0 · 비교가 도는 셀 수 고정", async () => {
    const paths: [string, (o: Partial<AssetForm>) => AssetForm, (d: string) => Partial<AssetForm>][] = [
      ["gift", wholeGift, (d) => ({ acquisitionDate: d })],
      ["d24", d24, (d) => ({ acquisitionDate: d, inheritanceStartDate: d, inheritanceDate: d }) as Partial<AssetForm>],
      ["d1h", d1h, (d) => ({ landAcquisitionDate: d })],
    ];
    const bases = ["2005-04-29", "2005-05-12", "2006-04-28"];
    const fds = ["2005-04-30", "2005-05-12", FD, "2004-01-01", "2026-07-01"];
    const kinds = ["house_individual", "house_apart", ""];
    const violations: string[] = [];
    let passed8 = 0;
    let widened = 0;
    for (const [name, mk, at] of paths) for (const b of bases) for (const fd of fds) for (const k of kinds) {
      const a = mk({ ...at(b), inhHouseValFirstDisclosureDate: fd, inheritanceAssetKind: k as never });
      if (Object.keys(v8(a)).length) continue;
      passed8++;
      const x = await single(a);
      if (x.status !== 200) violations.push(`${name} ${b} ${fd} ${k} → ${x.status} ${JSON.stringify(x.body).slice(0, 160)}`);
      if (x.sent.houseFirstDisclosureDate) widened++;
    }
    expect(violations).toEqual([]);
    // ⑧ 통과 65셀 — 종전 63에서 자산 단위 증여(gift) × 공동주택 15셀만 바뀌었다(2026-10-19 공동주택 국세청 고시 가액 질문):
    //   · 2005-04-29 수증 5셀 = 공동주택 질문 미답으로 차단(종전 통과 3 → 0)
    //   · 2005-05-12·2006-04-28 수증 10셀 = 개별주택 날짜를 쓰지 않아 통과(종전 범위·구분 차단 5 → 0, 통과 5 → 10)
    // 그중 날짜를 싣는 셀 18(단독 × 2005-04-30 뒤 범위 안 날짜 2 × 기준일 3 × 경로 3)은 그대로다.
    expect({ passed8, widened }).toEqual({ passed8: 65, widened: 18 });
  }, 180_000);
});
