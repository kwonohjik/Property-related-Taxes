/**
 * 상속세·증여세 — 엔진이 필요로 하는데 ⑫가 비워 두게 두던 값 2차 (2026-09-30 Zod↔엔진 필수 점검 §4.2·§4.3).
 *
 * 비우면 400이 아니라 200 + 다른 세액이었다(실측은 각 it 이름의 「종전」). ⑧은 이미 요구한다 —
 * ⑫는 ⑧과 **같은 술어**를 부른다(`lib/calc/inheritance-required-inputs.ts`·`gift-required-inputs.ts`·
 * `estate-item-vacancy-validate.ts`). 각 describe 끝의 「⑧ 짝」이 같은 입력에서 ⑧도 막는지(또는 통과하는지) 고정한다.
 *
 * - #6 상속인 생년월일(인적공제 만 나이) · #7 재해손실 재난 발생일 · #10 단기재상속 분모·전의 산출세액
 * - #11 동거주택 부수토지 4필드(전부 또는 전무) · #12 공실 전체 건물 연면적(상속·증여 공용 자산 스키마)
 * - #16 사전증여 농지 감면세액 · #17 세대생략 회차 추가 할증세액 · #18 외국납부 국외 과세표준
 * - 저축 §63④ auto 예금 미수이자 — ④만 주입하던 것을 route도 주입
 * - §4.3 증여 ⑧ 동일인 합산 회차 ⑤·⑦·⑫ `> 0` → 존재 (공제 범위 안 회차는 실제 0)
 */
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi
    .fn()
    .mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST as INH } from "@/app/api/calc/inheritance/route";
import { POST as GIFT } from "@/app/api/calc/gift/route";
import { validateInheritanceTaxInput } from "@/lib/calc/inheritance-validate";
import { validateStep } from "@/components/calc/gift-tax-form-validate";
import { INITIAL_FORM, type FormState } from "@/components/calc/gift-tax-form-shared";
import { buildGiftTaxInput } from "@/lib/calc/gift-api";
import { injectSavingsAccrualIfAuto } from "@/lib/tax-engine/property-valuation";
import { toDate } from "@/lib/api/date-coerce";
import type { EstateItem, InheritanceTaxInput, PriorGift } from "@/lib/tax-engine/types/inheritance-gift.types";

type Handler = (req: NextRequest) => Promise<Response>;
async function post(h: Handler, body: unknown) {
  const res = await h(
    new NextRequest("http://localhost/api/calc/x", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, json: await res.json() };
}
const paths = (json: { issues?: { path: string[] }[] }) => (json.issues ?? []).map((i) => i.path.join("."));
async function expectRejected(h: Handler, body: unknown, path: string) {
  const r = await post(h, body);
  expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(400);
  expect(paths(r.json)).toContain(path);
}
async function finalTax(h: Handler, body: unknown): Promise<number> {
  const r = await post(h, body);
  expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
  return r.json.result.finalTax;
}
const without = <T extends object>(o: T, ...keys: string[]) => {
  const c = { ...o } as Record<string, unknown>;
  for (const k of keys) delete c[k];
  return c;
};
/** ⑧ 짝 — body 모양이 InheritanceTaxInput 과 같다 */
const inh8 = (body: object) => validateInheritanceTaxInput(body as unknown as InheritanceTaxInput);

const H = { id: "h1", relation: "child", name: "자녀", birthDate: "1980-01-01" };
const INH_BASE = {
  decedentType: "resident",
  deathDate: "2024-06-01",
  estateItems: [{ id: "e1", category: "cash", name: "현금", marketValue: 3e9 }],
  preGiftsWithin10Years: [] as unknown[],
  heirs: [H],
  deductionInput: { heirs: [H] },
  creditInput: { isFiledOnTime: true },
};

describe("#6 상속인 생년월일 — 인적공제(상증법 §20①2호) 만 나이", () => {
  const kids = [1, 2, 3].map((n) => ({ id: `k${n}`, relation: "child", name: `자녀${n}`, birthDate: "2022-01-01" }));
  const kidsNo = kids.map((k) => without(k, "birthDate"));
  const body = (top: object[], ded: object[]) => ({ ...INH_BASE, heirs: top, deductionInput: { heirs: ded } });

  it("🟢 미성년 자녀 3명 673,180,000", async () => {
    expect(await finalTax(INH, body(kids, kids))).toBe(673_180_000);
  });
  it("🔴 생년월일 없음 → 400 (종전 812,860,000 — 미성년자공제 누락)", async () => {
    await expectRejected(INH, body(kidsNo, kidsNo), "deductionInput.heirs.0.birthDate");
    await expectRejected(INH, body(kidsNo, kidsNo), "heirs.0.birthDate");
  });
  it("🔴 인적공제가 읽는 deductionInput.heirs 쪽만 비어도 400 (종전 812,860,000)", async () => {
    await expectRejected(INH, body(kids, kidsNo), "deductionInput.heirs.2.birthDate");
  });
  it("🟢 생년월일을 도출할 수 있는 주민등록번호만 있으면 통과(⑧과 같은 규칙) · 법인은 대상 아님", async () => {
    const rrn = { id: "h1", relation: "child", name: "자녀", residentNumber: "8001011234567" };
    expect((await post(INH, body([rrn], [rrn]))).status).toBe(200);
    const corp = { id: "c1", relation: "corporate", name: "법인" };
    expect((await post(INH, body([H, corp], [H, corp]))).status).toBe(200);
  });
  it("⑧ 짝 — 같은 입력에서 ⑧도 막는다", () => {
    expect(inh8(body(kidsNo, kidsNo))).toMatch(/주민등록번호를 입력하세요/);
    expect(inh8(body(kids, kids))).toBeNull();
  });
});

describe("#7 §23 재해손실공제 — 재난 발생일", () => {
  const cl = (x: object) => ({ ...INH_BASE, deductionInput: { heirs: [H], casualtyLoss: { lossValue: 5e8, ...x } } });
  it("🟢 신고기한 이내 618,860,000 · 기한 후 812,860,000(공제 없음)", async () => {
    expect(await finalTax(INH, cl({ disasterDate: "2024-08-01" }))).toBe(618_860_000);
    expect(await finalTax(INH, cl({ disasterDate: "2025-06-01" }))).toBe(812_860_000);
  });
  it("🔴 날짜 없음 → 400 (종전 「기한 내」로 가정해 618,860,000)", async () => {
    await expectRejected(INH, cl({}), "deductionInput.casualtyLoss.disasterDate");
  });
  it("🟢 기한 판정을 명시(isWithinFilingDeadline)하면 엔진이 그 값을 쓰므로 날짜를 요구하지 않는다", async () => {
    expect(await finalTax(INH, cl({ isWithinFilingDeadline: false }))).toBe(812_860_000);
  });
  it("⑧ 짝", () => {
    expect(inh8(cl({}))).toMatch(/재난 발생일을 입력하세요/);
    expect(inh8(cl({ disasterDate: "2024-08-01" }))).toBeNull();
  });
});

describe("#10 §30 단기재상속 — 분모·전의 산출세액", () => {
  const st = (x: object) => ({
    ...INH_BASE,
    creditInput: { isFiledOnTime: true, shortTermReinheritPriorDeathDate: "2020-06-01", ...x },
  });
  const ARR = { shortTermReinheritTaxPaid: 2e8, shortTermReinheritAssets: [{ priorValue: 1e9 }], shortTermReinheritPriorEstateValue: 4e9 };
  const LEG = { shortTermReinheritTaxPaid: 2e8, shortTermReinheritAssetValue: 1e9, shortTermReinheritPriorEstateValue: 4e9 };
  it("🟢 재산별·legacy 모두 778,910,000", async () => {
    expect(await finalTax(INH, st(ARR))).toBe(778_910_000);
    expect(await finalTax(INH, st(LEG))).toBe(778_910_000);
  });
  it("🔴 재산별 — 분모 없음 → 400 (종전 전부재상속으로 677,060,000)", async () => {
    await expectRejected(INH, st(without(ARR, "shortTermReinheritPriorEstateValue")), "creditInput.shortTermReinheritPriorEstateValue");
  });
  it("🔴 재산별 — 전의 산출세액 없음 → 400 (종전 공제 0 → 812,860,000)", async () => {
    await expectRejected(INH, st(without(ARR, "shortTermReinheritTaxPaid")), "creditInput.shortTermReinheritTaxPaid");
  });
  it("🔴 legacy — 분모만 없음·분자만 없음 → 400 (종전 둘 다 677,060,000)", async () => {
    await expectRejected(INH, st(without(LEG, "shortTermReinheritPriorEstateValue")), "creditInput.shortTermReinheritPriorEstateValue");
    await expectRejected(INH, st(without(LEG, "shortTermReinheritAssetValue")), "creditInput.shortTermReinheritAssetValue");
  });
  it("🟢 분자·분모를 모두 비운 전부재상속 입력은 그대로 통과 (677,060,000)", async () => {
    expect(await finalTax(INH, st({ shortTermReinheritTaxPaid: 2e8 }))).toBe(677_060_000);
  });
  it("⑧ 짝", () => {
    expect(inh8(st(without(ARR, "shortTermReinheritPriorEstateValue")))).toMatch(/분모/);
    expect(inh8(st(without(ARR, "shortTermReinheritTaxPaid")))).toMatch(/전의 상속세 산출세액/);
    expect(inh8(st(ARR))).toBeNull();
  });
});

describe("#11 §23의2① 주택부수토지 면적한도 — 4필드 전부 또는 전무", () => {
  const coH = { ...H, isCohabitant: true };
  const ANC = {
    ancillaryLandArea: 1000,
    buildingFootprintArea: 100,
    ancillaryLandRegion: "metro_residential_commercial_industrial",
    ancillaryLandStdPrice: 5e8,
  };
  const co = (x: object) => ({ ...INH_BASE, heirs: [coH], deductionInput: { heirs: [coH], cohabitHouseStdPrice: 6e8, ...x } });
  it("🟢 전부 715,860,000 · 전무 580,060,000", async () => {
    expect(await finalTax(INH, co(ANC))).toBe(715_860_000);
    expect(await finalTax(INH, co({}))).toBe(580_060_000);
  });
  it.each(Object.keys(ANC))("🔴 %s 만 없음 → 400 (종전 차감 없이 580,060,000)", async (k) => {
    await expectRejected(INH, co(without(ANC, k)), `deductionInput.${k}`);
  });
  it("⑧ 짝", () => {
    expect(inh8(co(without(ANC, "ancillaryLandStdPrice")))).toMatch(/네 항목을 모두/);
    expect(inh8(co(ANC))).toBeNull();
  });
});

describe("#12 §61⑤ 미임대(공실) 부분 — 전체 건물 연면적 (상속·증여 공용 자산 스키마)", () => {
  const BLD = {
    id: "b1",
    category: "real_estate_building",
    name: "건물",
    standardPrice: 5e8,
    appurtenantLandStandardPrice: 5e8,
    monthlyRent: 5e6,
    leaseDeposit: 1e8,
    vacantBuildingArea: 50,
    vacantBuildingStandardPrice: 2e8,
    totalBuildingArea: 100,
  };
  it("🟢 상속 100,395,000", async () => {
    expect(await finalTax(INH, { ...INH_BASE, estateItems: [BLD] })).toBe(100_395_000);
  });
  it("🔴 상속 — 전체 연면적 없음 → 400 · 미임대 연면적 없음 → 400 (종전 둘 다 86,330,000)", async () => {
    await expectRejected(INH, { ...INH_BASE, estateItems: [without(BLD, "totalBuildingArea")] }, "estateItems.0.totalBuildingArea");
    await expectRejected(INH, { ...INH_BASE, estateItems: [without(BLD, "vacantBuildingArea")] }, "estateItems.0.vacantBuildingArea");
  });
  it("⑧ 짝", () => {
    expect(inh8({ ...INH_BASE, estateItems: [without(BLD, "totalBuildingArea")] })).toMatch(/전체 건물 연면적을 입력/);
    expect(inh8({ ...INH_BASE, estateItems: [BLD] })).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 증여세
// ─────────────────────────────────────────────────────────────────────────────

const GIFT_BASE = {
  giftDate: "2025-01-01",
  donorRelation: "lineal_descendant",
  donor: "mother",
  giftItems: [{ id: "g1", category: "real_estate_apartment", name: "재산", marketValue: 1e9 }],
  priorGiftsWithin10Years: [] as unknown[],
  isGenerationSkip: false,
  isMinorDonee: false,
  deductionInput: { donorRelation: "lineal_descendant" },
  creditInput: { isFiledOnTime: true },
};
const P = { giftDate: "2020-01-01", isHeir: true, giftAmount: 5e8, giftTaxPaid: 8e7, donor: "mother", giftTaxBase: 4.5e8, computedTax: 8e7 };
/** ⑧ 짝 — 증여 폼(단계 2·3) */
const giftForm = (over: Partial<FormState>): FormState => ({ ...INITIAL_FORM, giftDate: "2025-01-01", donor: "mother", ...over } as FormState);

it("#12 증여 🟢 232,800,000 / 🔴 전체 연면적 없음 → 400 (종전 218,250,000)", async () => {
  const bld = { id: "g1", category: "real_estate_building", name: "건물", standardPrice: 5e8, appurtenantLandStandardPrice: 5e8, monthlyRent: 5e6, leaseDeposit: 1e8, vacantBuildingArea: 50, vacantBuildingStandardPrice: 2e8, totalBuildingArea: 100 };
  expect(await finalTax(GIFT, { ...GIFT_BASE, giftItems: [bld] })).toBe(232_800_000);
  await expectRejected(GIFT, { ...GIFT_BASE, giftItems: [without(bld, "totalBuildingArea")] }, "giftItems.0.totalBuildingArea");
});

describe("#16 사전증여 §71 농지 감면세액 (조특법 §133④ 5년 1억 한도 누계)", () => {
  const LAND = { ...GIFT_BASE, giftItems: [{ id: "g1", category: "real_estate_land", name: "농지", marketValue: 1e9, isFarmlandGiftReduction: true }] };
  const PF = { ...P, giftDate: "2021-01-01", farmlandReductionApplied: true };
  it("🟢 기감면 80,000,000 → 310,400,000", async () => {
    expect(await finalTax(GIFT, { ...LAND, priorGiftsWithin10Years: [{ ...PF, farmlandReductionAmount: 8e7 }] })).toBe(310_400_000);
  });
  it("🔴 감면세액 없음 → 400 (종전 누계 0으로 읽어 232,800,000)", async () => {
    await expectRejected(GIFT, { ...LAND, priorGiftsWithin10Years: [PF] }, "priorGiftsWithin10Years.0.farmlandReductionAmount");
  });
  it("⑧ 짝", () => {
    expect(validateStep(2, giftForm({ priorGifts: [PF as PriorGift] }))).toMatch(/감면받은 증여세액/);
  });
});

describe("#17 세대생략 회차 추가 할증세액 (상증법 §57)", () => {
  const GS = { ...GIFT_BASE, donor: "grandparent", isGenerationSkip: true };
  const PG = { ...P, donor: "grandparent", wasGenerationSkip: true };
  it("🟢 24,000,000 → 428,740,000", async () => {
    expect(await finalTax(GIFT, { ...GS, priorGiftsWithin10Years: [{ ...PG, additionalGenerationSkipSurcharge: 2.4e7 }] })).toBe(428_740_000);
  });
  it("🔴 없음 → 400 (종전 0으로 읽어 452,020,000)", async () => {
    await expectRejected(GIFT, { ...GS, priorGiftsWithin10Years: [PG] }, "priorGiftsWithin10Years.0.additionalGenerationSkipSurcharge");
  });
  it("⑧ 짝 — 없으면 차단 · 0은 존재(통과)", () => {
    const f = (x: object) => giftForm({ donor: "grandparent", priorGifts: [{ ...PG, ...x } as PriorGift] });
    expect(validateStep(2, f({}))).toMatch(/추가 할증세액 ⑫/);
    expect(validateStep(2, f({ additionalGenerationSkipSurcharge: 0 }))).toBeNull();
  });
});

describe("#18 외국납부세액 — 국외 증여재산 과세표준 (상증법 §59 · 영 §48 → §21①)", () => {
  const cr = (x: object) => ({ ...GIFT_BASE, creditInput: { isFiledOnTime: true, foreignTaxPaid: 1e8, ...x } });
  it("🟢 과세표준 100,000,000 → 195,276,317", async () => {
    expect(await finalTax(GIFT, cr({ foreignGiftTaxBase: 1e8 }))).toBe(195_276_317);
  });
  it("🔴 과세표준 없음 → 400 (종전 한도 없이 전액 공제 121,250,000)", async () => {
    await expectRejected(GIFT, cr({}), "creditInput.foreignGiftTaxBase");
  });
  it("⑧ 짝", () => {
    expect(validateStep(3, giftForm({ foreignTaxPaid: "100,000,000", foreignGiftTaxBase: "" }))).toMatch(/국외 증여재산 과세표준/);
  });
});

describe("§4.3 동일인 합산 회차 ⑤·⑦ — ⑧은 존재만 요구 (공제 범위 안 회차는 실제 0)", () => {
  const P0 = { ...P, giftAmount: 5e7, giftTaxPaid: 0, giftTaxBase: 0, computedTax: 0 };
  it("🟢 ⑫ — 과세표준·산출세액 0 회차 → 232,800,000 (합산 없는 경우와 같은 세액)", async () => {
    expect(await finalTax(GIFT, { ...GIFT_BASE, priorGiftsWithin10Years: [P0] })).toBe(232_800_000);
  });
  it("🟢 ⑧ — 같은 회차가 단계 2를 통과한다 (종전 「합산과세표준 ⑤을 입력하세요」로 막힘)", () => {
    expect(validateStep(2, giftForm({ priorGifts: [P0 as PriorGift] }))).toBeNull();
  });
  it("🔴 ⑧ — 값이 없으면 여전히 막는다 (존재 요구)", () => {
    expect(validateStep(2, giftForm({ priorGifts: [without(P0, "giftTaxBase") as unknown as PriorGift] }))).toMatch(/합산과세표준 ⑤/);
    expect(validateStep(2, giftForm({ priorGifts: [without(P0, "computedTax") as unknown as PriorGift] }))).toMatch(/산출세액 ⑦/);
  });
});

describe("저축 — §63④ auto 예금 미수이자를 route도 주입한다", () => {
  const SV = {
    id: "f1",
    category: "financial",
    name: "예금",
    savingsValuationMode: "auto",
    savingsPrincipal: 3e9,
    savingsAnnualRate: 3,
    savingsStartDate: "2023-01-01",
  };
  it("상속 — 주입 전 요청 = ④가 주입한 요청 (종전 원금만 812,860,000)", async () => {
    const injected = injectSavingsAccrualIfAuto(SV as unknown as EstateItem, toDate(INH_BASE.deathDate, "deathDate"));
    expect(injected.savingsAccruedInterest).toBeGreaterThan(0);
    const raw = await finalTax(INH, { ...INH_BASE, estateItems: [SV] });
    expect(raw).toBe(await finalTax(INH, { ...INH_BASE, estateItems: [injected] }));
    expect(raw).toBe(854_704_875);
  });
  it("증여 — 주입 전 요청 = ④(buildGiftTaxInput) 결과 (종전 원금만 989,400,000)", async () => {
    const built = buildGiftTaxInput(
      giftForm({ giftItems: [SV as unknown as EstateItem] }),
    );
    expect(built.giftItems[0].savingsAccruedInterest).toBeGreaterThan(0);
    const raw = await finalTax(GIFT, { ...GIFT_BASE, giftItems: [SV] });
    expect(raw).toBe(await finalTax(GIFT, { ...GIFT_BASE, giftItems: [built.giftItems[0]] }));
    expect(raw).toBe(1_058_506_972);
  });
  it("증여 동시증여 추가 건도 그 건의 증여일로 주입한다", async () => {
    const sub = { ...GIFT_BASE, donor: "grandparent", donorRelation: "lineal_descendant", isGenerationSkip: true, giftItems: [SV] };
    const r = await post(GIFT, { ...GIFT_BASE, simultaneousGiftForms: [sub] });
    expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
    const subInjected = { ...sub, giftItems: [injectSavingsAccrualIfAuto(SV as unknown as EstateItem, toDate(sub.giftDate, "giftDate"))] };
    const r2 = await post(GIFT, { ...GIFT_BASE, simultaneousGiftForms: [subInjected] });
    expect(r.json.simultaneousResults[0].finalTax).toBe(r2.json.simultaneousResults[0].finalTax);
  });
});
