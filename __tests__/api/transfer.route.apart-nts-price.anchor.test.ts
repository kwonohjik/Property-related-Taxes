/**
 * 자산 단위 공동주택 — 「상속개시일·증여일 당시 국세청 고시 공동주택 기준시가가 있었는가」 route anchor (영 §163⑨ 단서 2호)
 *
 * 계획서 docs/00-pm/transfer-163-9-apart-nts-price-question.plan.md (A안 · Q-1~Q-3 A — 2026-10-19 사용자 「권고대로」 · 「모름」 없음).
 * 클라이언트 ④(`callTransferTaxAPI`) → ⑫ Zod → ⑭ → 엔진을 그대로 거친다. ⑧은 같은 시드로 함께 본다.
 *
 * 종전(수정 전): 2005.4.30. 전 상속·증여 공동주택은 단독주택과 똑같이 ②(§164⑦)를 열었다 — 국세청 고시 가액이 있던 아파트도
 * 평가액(①)과 환산값(②) 중 큰 금액이 됐다(해석례 체계상 ①만: 사전-2018-법령해석재산-0183 · 감사원-2011-감심-423).
 * ⚠️ 세액은 `makeMockRates()` — 정본 세액이 아니다. 양도차익으로 「어떤 비교가 돌았는가」를 본다.
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
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { validateAssetAcquisition } from "@/lib/calc/transfer-tax-validate-acquisition";
import { collectWithFields } from "@/lib/calc/transfer-tax-validate-field";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import {
  APART_NTS_PRICE_EXISTED_NOTE,
  APART_PRE_DEEMED_FIRST_PRICE_NOTE,
} from "@/lib/tax-engine/apart-nts-price";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

const req = (b: object) =>
  new NextRequest("http://l/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any;
type Form = ReturnType<typeof createDefaultTransferFormData>;
const TD = "2026-06-30";

/** 영 §164⑥·⑦ 보조 입력 — 최초 가격 3억 · ㎡당 1,000,000 · 200㎡ · 기준일 ㎡당 500,000 · 건물 기준시가 6천만/5천만 ⇒ ② = 3억 × 1.5억 / 2.6억 = 173,076,923 */
const HOUSE164: Partial<AssetForm> = {
  inhHouseValLandArea: "200",
  inhHouseValLandPricePerSqmAtTransfer: "3,000,000",
  inhHouseValLandPricePerSqmAtFirst: "1,000,000",
  inhHouseValHousePriceAtFirst: "300,000,000",
  inhHouseValLandPricePerSqmAtInheritance: "500,000",
  inhHouseValBuildingStdPriceAtFirst: "60,000,000",
  inhHouseValBuildingStdPriceAtInheritance: "50,000,000",
};
/** ① 1억만 쓰면 1,100,000,000 · ②(173,076,923)가 이기면 1,026,923,077 — 양도가 12억, 필요경비 없음 */
const GAIN_REPORTED = 1_100_000_000;
const GAIN_SEC164 = 1_026_923_077;

/** 2000.3.1. 상속 공동주택(의제취득일 이후 · 2005.4.30. 전) · ① 1억 · ② 4칸 입력 */
function inh(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    addressJibun: "서울 강남구 테스트동 1-1",
    assetKind: "housing", acquisitionCause: "inheritance", acquisitionDate: "2000-03-01", inheritanceStartDate: "2000-03-01",
    decedentAcquisitionDate: "1990-01-01", inheritanceAssetKind: "house_apart",
    publishedValueAtInheritance: "100,000,000", inheritanceValuationMethod: "supplementary",
    actualSalePrice: "1,200,000,000", acquisitionArea: "200", transferArea: "200",
    ...HOUSE164,
    ...over,
  } as AssetForm;
}
/** 같은 사안의 증여 — ① = 증여 신고가액 */
function gift(over: Partial<AssetForm> = {}): AssetForm {
  return inh({ acquisitionCause: "gift", inheritanceStartDate: "", publishedValueAtInheritance: "", inheritanceValuationMethod: "", fixedAcquisitionPrice: "100,000,000", ...over } as Partial<AssetForm>);
}
const NO_NTS: Partial<AssetForm> = { inhApartNtsPriceExisted: "no", inhApartFirstPriceAgency: "nts", inhApartFirstPriceDate: "2001-01-01" };
const NO_MOLIT: Partial<AssetForm> = { inhApartNtsPriceExisted: "no", inhApartFirstPriceAgency: "molit", inhApartFirstPriceDate: "2005-04-30" };

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
  const res = await POST(req(sent));
  const body = (await res.json()) as J;
  return { status: res.status, body, r: body?.data?.result, sent };
}
async function ok(a: AssetForm) {
  const x = await single(a);
  expect(x.status, JSON.stringify(x.body).slice(0, 400)).toBe(200);
  return x;
}
/** ⑧ — 자산 취득 정보 첫 오류의 이동 칸과 문구 */
function v8(a: AssetForm): { field?: string; message?: string } {
  const c = collectWithFields(() => validateAssetAcquisition(a, "자산1", TD));
  const m = c.result as unknown as string | null | undefined;
  return m ? { field: c.fieldOf(m) as string | undefined, message: m } : {};
}
/** ⑧ 전 단계 */
const steps = (f: Form) => [0, 1, 2, 3].flatMap((s) => collectStepIssues(s, f));

describe("A) 의제취득일 이후 상속·증여 공동주택 — 답이 ②를 여닫는다", () => {
  it("A-0 대조: 단독·다가구는 질문 없이 종전대로 ② 비교(1,026,923,077) · 공동주택 키를 싣지 않는다", async () => {
    const a = inh({ inheritanceAssetKind: "house_individual" });
    expect(v8(a)).toEqual({});
    const x = await ok(a);
    expect(x.r.transferGain).toBe(GAIN_SEC164);
    expect("apartNtsPriceExisted" in x.sent.inheritedAcquisition).toBe(false);
  });

  for (const [name, mk] of [["상속", inh], ["증여", gift]] as const) {
    it(`A-1 ${name} · 있었음 → ①만(1,100,000,000) · ② 미송신 · 근거 고지`, async () => {
      const a = mk({ inhApartNtsPriceExisted: "yes" });
      expect(v8(a)).toEqual({});
      const x = await ok(a);
      expect(x.sent.inheritedAcquisition.apartNtsPriceExisted).toBe(true);
      expect(x.sent.inheritedHouseValuation).toBeUndefined();
      expect(x.r.transferGain).toBe(GAIN_REPORTED);
      expect(x.r.inheritedHouseValuationDetail).toBeUndefined();
      expect(x.r.inheritedAcquisitionDetail.formula).toContain(APART_NTS_PRICE_EXISTED_NOTE);
    });
    it(`A-2 ${name} · 없었음 + 국세청 첫 고시 → ② 비교(1,026,923,077) · 영 §164⑥ 표기`, async () => {
      const x = await ok(mk(NO_NTS));
      expect(x.sent.inheritedAcquisition).toMatchObject({ apartNtsPriceExisted: false, apartFirstPriceAgency: "nts", apartFirstPriceDate: "2001-01-01" });
      expect(x.r.transferGain).toBe(GAIN_SEC164);
      expect(x.r.inheritedAcquisitionDetail.legalBasis).toBe("소득세법 시행령 §163 ⑨ 2호 · §164 ⑥");
      expect(x.r.inheritedAcquisitionDetail.formula).toContain("§164⑥");
      expect(x.r.inheritedHouseValuationDetail.apartFirstPriceAgency).toBe("nts");
      expect(x.r.inheritedHouseValuationDetail.legalBasis).toContain("소득세법 시행령 §164⑥");
      expect(x.r.inheritedHouseValuationDetail.formula).toContain("취득 당시 공동주택 기준시가 (소득세법 시행령 §164⑥ 산식)");
      expect(x.r.inheritedHouseValuationDetail.formula, "법령에 없는 조어 «추정» 금지").not.toContain("추정");
    });
    it(`A-3 ${name} · 없었음 + 국토교통부 첫 공시 → 같은 값 · 영 §164⑦ 표기`, async () => {
      const x = await ok(mk(NO_MOLIT));
      expect(x.r.transferGain).toBe(GAIN_SEC164);
      expect(x.r.inheritedAcquisitionDetail.legalBasis).toBe("소득세법 시행령 §163 ⑨ 2호 · §164 ⑦");
      expect(x.r.inheritedHouseValuationDetail.formula).toContain("취득 당시 공동주택가격 (소득세법 시행령 §164⑦ 산식)");
      expect(x.r.inheritedHouseValuationDetail.formula, "법령에 없는 조어 «추정» 금지").not.toContain("추정");
    });
  }

  it("A-4 「있었음」으로 바꿔도 4칸 값은 남는다 — 남은 값은 싣지 않는다(범위 밖 값 미전송)", async () => {
    const a = inh({ ...NO_NTS, inhApartNtsPriceExisted: "yes" });
    const x = await ok(a);
    expect(x.sent.inheritedHouseValuation).toBeUndefined();
    expect(x.sent.inheritedAcquisition).toEqual(expect.objectContaining({ apartNtsPriceExisted: true }));
    expect("apartFirstPriceAgency" in x.sent.inheritedAcquisition).toBe(false);
    expect(x.r.transferGain).toBe(GAIN_REPORTED);
  });
});

describe("B) ⑧ — 「모름」 없음 · 필수 · 범위(Q-2)", () => {
  it("B-1 미선택 → 질문 칸", () => {
    const e = v8(inh());
    expect(e.field).toBe("inhApartNtsPriceExisted");
    expect(e.message).toContain("국세청장이 고시한 공동주택 기준시가가 있었는지 고르세요");
  });
  it("B-2 없었음 + 기관 미선택 → 기관 칸 (Q-1)", () => {
    expect(v8(inh({ ...NO_NTS, inhApartFirstPriceAgency: "" })).field).toBe("inhApartFirstPriceAgency");
  });
  it("B-3 없었음 + 날짜: 비움·기준일 당일·양도일 뒤 → 날짜 칸 / 기준일 다음 날·2005.4.30. 전·양도일 당일 → 통과 (Q-2 — 2005.4.30. 하한 없음)", () => {
    for (const d of ["", "2000-03-01", "1992-01-01", "2026-07-01"]) expect(v8(inh({ ...NO_NTS, inhApartFirstPriceDate: d })).field, d).toBe("inhApartFirstPriceDate");
    for (const d of ["2000-03-02", "2003-01-01", "2005-04-30", TD]) expect(v8(inh({ ...NO_NTS, inhApartFirstPriceDate: d })), d).toEqual({});
  });
  it("B-4 있었음이면 기관·날짜를 묻지 않는다", () => {
    expect(v8(inh({ inhApartNtsPriceExisted: "yes", inhApartFirstPriceAgency: "", inhApartFirstPriceDate: "" }))).toEqual({});
  });
  it("B-5 단계 검증에도 같은 칸으로 뜬다(화면 이동 앵커)", () => {
    expect(steps(form([inh()])).some((i) => i.field === "inhApartNtsPriceExisted")).toBe(true);
  });
  it("B-7 자산 단위 공동주택에 남은 단독주택 최초공시일(범위 밖·구간 확대)로는 막지 않는다 — 첫 가격 날짜는 별도 칸", () => {
    for (const d of ["2004-01-01", "2006-04-28"]) {
      expect(v8(inh({ inhApartNtsPriceExisted: "yes", inhHouseValFirstDisclosureDate: d })), d).toEqual({});
      expect(v8(gift({ acquisitionDate: "2005-05-12", inhHouseValFirstDisclosureDate: d } as Partial<AssetForm>)), `gift ${d}`).toEqual({});
    }
  });
  it("B-6 동·호가 있는 미선택 주택 구분은 공동주택으로 읽는다(④가 싣는 구분과 같은 파생) · 단독 명시는 묻지 않는다", () => {
    expect(v8(inh({ inheritanceAssetKind: "land" as never, addressDong: "101", addressHo: "1001" } as Partial<AssetForm>)).field).toBe("inhApartNtsPriceExisted");
    expect(v8(inh({ inheritanceAssetKind: "land" as never } as Partial<AssetForm>))).toEqual({});
  });
});

describe("C) ⑫ 직접 전송 — 엔진이 조용히 값을 버리지 않게 경로를 짚는다", () => {
  async function sentOf(a: AssetForm) {
    return (await single(a)).sent;
  }
  it("C-1 공동주택 + ② 가액 + 답 없음 → 400 · inheritedAcquisition.apartNtsPriceExisted", async () => {
    const s = await sentOf(inh(NO_NTS));
    for (const k of ["apartNtsPriceExisted", "apartFirstPriceAgency", "apartFirstPriceDate"]) delete s.inheritedAcquisition[k];
    const res = await POST(req(s));
    expect(res.status).toBe(400);
    expect(JSON.stringify(await res.json())).toContain("apartNtsPriceExisted");
  });
  it("C-2 있었음 + ② 가액 동봉 → 400 · inheritedHouseValuation", async () => {
    const s = await sentOf(inh(NO_NTS));
    s.inheritedAcquisition = { ...s.inheritedAcquisition, apartNtsPriceExisted: true };
    const res = await POST(req(s));
    expect(res.status).toBe(400);
    expect(JSON.stringify(await res.json())).toContain("inheritedHouseValuation");
  });
  it("C-3 없었음 + 기관 없음 · 날짜 범위 밖(기준일 이전·양도일 뒤) → 400 · 그 경로", async () => {
    const s = await sentOf(inh(NO_NTS));
    for (const [patch, key] of [
      [{ apartFirstPriceAgency: undefined }, "apartFirstPriceAgency"],
      [{ apartFirstPriceDate: "2000-03-01" }, "apartFirstPriceDate"],
      [{ apartFirstPriceDate: "2026-07-01" }, "apartFirstPriceDate"],
      [{ apartFirstPriceDate: undefined }, "apartFirstPriceDate"],
    ] as const) {
      const res = await POST(req({ ...s, inheritedAcquisition: { ...s.inheritedAcquisition, ...patch } }));
      expect(res.status, key).toBe(400);
      expect(JSON.stringify(await res.json())).toContain(key);
    }
  });
  it("C-4 ② 가액 없이 답이 없으면 200 · ① 단독(값이 같다 — 비주택 파생 공동주택을 막지 않는다)", async () => {
    const s = await sentOf(inh({ inhApartNtsPriceExisted: "yes" }));
    delete s.inheritedAcquisition.apartNtsPriceExisted;
    const res = await POST(req(s));
    expect(res.status).toBe(200);
    expect(((await res.json()) as J).data.result.transferGain).toBe(GAIN_REPORTED);
  });
});

describe("D) 의제취득일 전 상속 공동주택 — 같은 답이 ③ 자동 주입도 정한다(Q-3)", () => {
  /** 1980.6.1. 상속 · 1990.8.30. 전이라 기준일 토지는 등급환산 4칸 */
  const pre = (over: Partial<AssetForm> = {}) =>
    inh({
      acquisitionDate: "1980-06-01", inheritanceStartDate: "1980-06-01", decedentAcquisitionDate: "1970-01-01",
      inhHouseValLandPricePerSqmAtInheritance: "",
      pre1990GradeMode: "number", pre1990Grade_current: "150", pre1990Grade_prev: "140", pre1990Grade_atAcq: "130", pre1990PricePerSqm_1990: "500000",
      standardPriceAtTransfer: "600,000,000",
      ...over,
    } as Partial<AssetForm>);

  it("D-1 미선택 → ⑧ 질문 칸 (의제 전도 같은 질문)", () => {
    expect(v8(pre()).field).toBe("inhApartNtsPriceExisted");
  });
  it("D-2 있었음 → ② 미송신 · ①이 채택 · ③(환산) 미적용", async () => {
    const x = await ok(pre({ inhApartNtsPriceExisted: "yes" }));
    expect(x.sent.inheritedHouseValuation).toBeUndefined();
    const b = x.r.inheritedAcquisitionDetail.preDeemedBreakdown;
    expect(b).toMatchObject({ reportedAmount: 100_000_000, sec164Amount: null, selectedMethod: "reported" });
    expect(x.r.transferGain).toBe(GAIN_REPORTED);
  });
  it("D-3 있었음 + ① 없음 + 가목 확인 불가 선언 → ③은 사용자가 넣은 의제취득일 기준시가로(자동 주입 없음)", async () => {
    const x = await ok(pre({ inhApartNtsPriceExisted: "yes", publishedValueAtInheritance: "", preDeemedClauseAUnconfirmed: true, standardPriceAtAcq: "50,000,000" }));
    const b = x.r.inheritedAcquisitionDetail.preDeemedBreakdown;
    expect(b.selectedMethod).toBe("converted");
    // 양도가 12억 × 5천만 / 6억 = 1억
    expect(b.convertedAmount).toBe(100_000_000);
  });
  it("D-4 없었음 + 첫 가격 1992.1.1. → ② 주입(환산 카드의 값과 같다) · 확인 필요 고지 없음", async () => {
    const x = await ok(pre({ inhApartNtsPriceExisted: "no", inhApartFirstPriceAgency: "nts", inhApartFirstPriceDate: "1992-01-01" }));
    const b = x.r.inheritedAcquisitionDetail.preDeemedBreakdown;
    expect(b.sec164Amount).toBe(x.r.inheritedHouseValuationDetail.housePriceAtInheritanceUsed);
    expect(x.r.inheritedAcquisitionDetail.warnings ?? []).not.toContain(APART_PRE_DEEMED_FIRST_PRICE_NOTE);
  });
  it("D-5 없었음 + 첫 가격이 의제취득일(1985.1.1.) 이전·당일 → 확인 필요 고지 / 다음 날 → 고지 없음", async () => {
    for (const [d, noted] of [["1983-07-01", true], ["1985-01-01", true], ["1985-01-02", false]] as const) {
      const x = await ok(pre({ inhApartNtsPriceExisted: "no", inhApartFirstPriceAgency: "nts", inhApartFirstPriceDate: d }));
      expect((x.r.inheritedAcquisitionDetail.warnings ?? []).includes(APART_PRE_DEEMED_FIRST_PRICE_NOTE), d).toBe(noted);
    }
  });
});

describe("E) 2005.4.30. 이후 수증 — 첫 가격 날짜가 질문을 연다(Q-2 · U-3)", () => {
  const late = (over: Partial<AssetForm> = {}) => gift({ acquisitionDate: "2005-05-12", ...over });
  it("E-1 날짜 없음 → 질문 없음 · ① 단독 · 공동주택 키 미송신", async () => {
    expect(v8(late())).toEqual({});
    const x = await ok(late());
    expect(x.r.transferGain).toBe(GAIN_REPORTED);
    expect("apartNtsPriceExisted" in x.sent.inheritedAcquisition).toBe(false);
  });
  it("E-2 첫 가격 2006.4.28. → 질문 필수 · 없었음+국토교통부 → ② 비교 · 있었음 → ①", async () => {
    expect(v8(late({ inhApartFirstPriceDate: "2006-04-28" })).field).toBe("inhApartNtsPriceExisted");
    expect((await ok(late({ ...NO_MOLIT, inhApartFirstPriceDate: "2006-04-28" }))).r.transferGain).toBe(GAIN_SEC164);
    expect((await ok(late({ inhApartNtsPriceExisted: "yes", inhApartFirstPriceDate: "2006-04-28" }))).r.transferGain).toBe(GAIN_REPORTED);
  });
  it("E-3 첫 가격 = 수증일 → 질문 없음(구간을 넓히지 않는다 — 엄격 <)", async () => {
    expect(v8(late({ inhApartFirstPriceDate: "2005-05-12" }))).toEqual({});
    expect((await ok(late({ ...NO_MOLIT, inhApartFirstPriceDate: "2005-05-12" }))).r.transferGain).toBe(GAIN_REPORTED);
  });
});

describe("F) 함께 양도 컴패니언 — 같은 빌더·같은 ⑫ 규칙", () => {
  const land = () => ({ ...makeDefaultAsset(1), assetKind: "land", landNature: "standalone", acquisitionCause: "purchase", acquisitionDate: "2010-01-01", fixedAcquisitionPrice: "100,000,000", standardPriceAtTransfer: "300,000,000", actualSalePrice: "300,000,000" }) as AssetForm;
  const twoForm = (a: AssetForm) => form([land(), { ...a, assetId: "c1" } as AssetForm], { contractTotalPrice: "1,500,000,000", bundledSaleMode: "actual" as never } as never);

  it("F-1 ④ 컴패니언 body에 답이 실리고 ⑫·⑭를 지나 ② 비교 / 있었음이면 ①", async () => {
    const run = async (a: AssetForm) => {
      const sent = await bodyOf(() => callTransferTaxAPI(twoForm(a)));
      const res = await POST(req(sent));
      const body = (await res.json()) as J;
      expect(res.status, JSON.stringify(body).slice(0, 400)).toBe(200);
      return { sent, c1: body.data.aggregated.properties.find((p: J) => p.propertyId === "c1") };
    };
    const no = await run(inh(NO_NTS));
    expect(no.sent.companionAssets[0].inheritedAcquisition).toMatchObject({ apartNtsPriceExisted: false, apartFirstPriceAgency: "nts" });
    expect(no.c1.inheritedAcquisitionDetail.acquisitionPrice).toBe(173_076_923);
    const yes = await run(inh({ inhApartNtsPriceExisted: "yes" }));
    expect(yes.sent.companionAssets[0].inheritedHouseValuation).toBeUndefined();
    expect(yes.c1.inheritedAcquisitionDetail.acquisitionPrice).toBe(100_000_000);
  });
  it("F-2 ⑫ 컴패니언 — 답을 지우면 400 · 경로 companionAssets[0].inheritedAcquisition.apartNtsPriceExisted", async () => {
    const sent = await bodyOf(() => callTransferTaxAPI(twoForm(inh(NO_NTS))));
    delete sent.companionAssets[0].inheritedAcquisition.apartNtsPriceExisted;
    const res = await POST(req(sent));
    expect(res.status).toBe(400);
    const s = JSON.stringify(await res.json());
    expect(s).toContain("companionAssets");
    expect(s).toContain("apartNtsPriceExisted");
  });
  it("F-3 ⑧ 컴패니언도 같은 칸으로 막는다", () => {
    expect(steps(twoForm(inh())).some((i) => i.field === "inhApartNtsPriceExisted")).toBe(true);
  });
});

describe("G) ⑧ 통과 ⇒ ⑫ 200 격자 (원인 2 × 구분 2 × 기준일 3 × 답 3 × 기관 2 × 날짜 6 = 432셀)", () => {
  it("G-1 위반 0 · ②가 도는 셀 수 고정", async () => {
    const causes = [["inh", inh], ["gift", gift]] as const;
    const kinds = ["house_apart", "house_individual"];
    const bases = ["2000-03-01", "2005-04-29", "2005-05-12"];
    const answers = ["", "yes", "no"];
    const agencies = ["", "nts"];
    const dates = ["", "1992-01-01", "2000-03-01", "2005-04-30", "2006-04-28", "2026-07-01"];
    const violations: string[] = [];
    let passed8 = 0;
    let compared = 0;
    for (const [cn, mk] of causes) for (const k of kinds) for (const b of bases) for (const ans of answers) for (const ag of agencies) for (const d of dates) {
      const at = cn === "inh" ? { acquisitionDate: b, inheritanceStartDate: b } : { acquisitionDate: b };
      const a = mk({ ...at, inheritanceAssetKind: k as never, inhApartNtsPriceExisted: ans as never, inhApartFirstPriceAgency: ag as never, inhApartFirstPriceDate: d } as Partial<AssetForm>);
      if (Object.keys(v8(a)).length) continue;
      passed8++;
      const x = await single(a);
      if (x.status !== 200) {
        violations.push(`${cn} ${k} ${b} ${ans}/${ag}/${d} → ${x.status} ${JSON.stringify(x.body).slice(0, 160)}`);
        continue;
      }
      if (x.r.transferGain === GAIN_SEC164) compared++;
    }
    expect(violations).toEqual([]);
    // 손 셈(원인마다 같다):
    //  · 단독 108셀 — 전부 통과(공동주택 칸을 읽지 않는다). 기준일 2000·2005-04-29의 72셀이 ② 비교.
    //  · 공동주택 2000·2005-04-29 — 질문 필수: 미선택 12 차단 · 있었음 12 통과 · 없었음+기관 없음 6 차단 ·
    //    없었음+국세청 6 중 날짜가 기준일 뒤·양도일 이전인 2005-04-30·2006-04-28 2셀만 통과(=② 비교) ⇒ 기준일마다 통과 14 · 비교 2.
    //  · 공동주택 2005-05-12 — 날짜 비움·1992·2000·2005-04-30 24셀은 질문 없이 통과(① 단독) · 2006-04-28: 있었음 2 + 없었음·국세청 1(비교) ·
    //    2026-07-01(양도일 뒤 — 질문은 열리지만 범위 밖): 있었음 2만 ⇒ 통과 29 · 비교 1.
    //  ⇒ 원인마다 통과 108 + 57 = 165 · 비교 72 + 5 = 77 → 두 원인 330 · 154.
    expect({ passed8, compared }).toEqual({ passed8: 330, compared: 154 });
  }, 300_000);
});
