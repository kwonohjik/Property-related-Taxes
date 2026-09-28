/**
 * E-1 후속 — 증여세 부담부증여 양도 경로의 1세대1주택 입력 미배선분 (계획서 §9.3 E-1 행).
 *
 * 경로: 증여세 마법사 `BurdenedGiftTransferSection`(⑤) → `bgt`·`item.estateAddress`(①) →
 *       `buildGiftBurdenedTransferBody`(④) → POST `/api/calc/transfer`(⑫ · ⑭) → 엔진.
 *       「본문에 키가 있다」는 도달을 증명하지 않는다 — route 결과로 관측한다(`feedback_leaf_anchor_skips_zod_layer`).
 *
 * | 축 | 종전(base) | 고친 뒤 | 패리티(양도세 계산기 `callTransferTaxAPI`) |
 * |---|---|---|---|
 * | R — 증여 주택 주소(PNU 앞 10자리 = 법정동코드) | `regionCode` 미전송 → 조정 여부는 선언 토글로만 | 주소가 있으면 엔진이 코드로 판정(계산기와 같은 우선순위) | `assets[0].regionCode` |
 * | P — §154① 단서(삭제 전 4호 OH-38 포함) | 사유 칸 없음 → 거주 2년 요구 | `ExemptionProvisoSection` 재사용 → `oneHouseExemptionProviso` | `provisoReason`·`proviso4ho*` |
 * | F — §154⑤ 단서 재기산(OH-22) | 처분 이력 칸 없음 → 비과세 + 판정 보류 고지 | `FinalHouseRestartSection` 재사용 → `finalOneHouseRestart` | `finalHouseRestart*` |
 *
 * 시료는 모두 아파트 1채 부담부증여(증여일 = 양도일) · 채무 1.5억 · 증여시 기준시가 3억 · 취득시 1.5억.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi
    .fn()
    .mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));

import { POST as SINGLE } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { buildGiftBurdenedTransferBody } from "@/lib/calc/gift-burdened-transfer-api";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import type { BurdenedGiftTransferTaxInput } from "@/lib/tax-engine/types/inheritance-gift-estate.types";
import type { FormState } from "@/components/calc/gift-tax-form-shared";

type Obj = Record<string, unknown>;
type R = { isExempt: boolean; totalTax: number; determinedTax: number; exemptReason?: string; warnings?: string[] };

/** 서울 강남구 역삼동 — 2017-08-03 조정대상지역 지정 이후 계속 조정(`judgment-transfer-regulated-region-code` 시료) */
const GANGNAM = "1168010100";
const GANGNAM_PNU = `${GANGNAM}100120034`;

// ─── 증여세 쪽 ────────────────────────────────────────────────────────────────

const giftForm = (giftDate: string): FormState =>
  ({ giftDate, donor: "father", donorRelation: "lineal_ascendant_adult", priorGifts: [] }) as unknown as FormState;

function giftItem(bgt: Partial<BurdenedGiftTransferTaxInput>, pnu?: string): EstateItem {
  return {
    id: "apt-1",
    category: "real_estate_apartment",
    name: "테스트 아파트",
    standardPrice: 300_000_000,
    leaseDeposit: 100_000_000,
    mortgageAmount: 50_000_000,
    assumedDebtForGift: 150_000_000,
    monthlyRent: 0,
    ...(pnu ? { estateAddress: { jibun: "서울특별시 강남구 역삼동 12-34", pnu } } : {}),
    burdenedGiftTransferTax: {
      standardPriceAtAcquisition: 150_000_000,
      isOneHousehold: true,
      householdHousingCount: 1,
      isRegulatedArea: false,
      wasRegulatedAtAcquisition: false,
      residencePeriodMonths: 0,
      isUnregistered: false,
      ...bgt,
    },
  } as EstateItem;
}

// ─── 양도세 계산기 쪽(패리티) ──────────────────────────────────────────────────

function transferForm(transferDate: string, acquisitionDate: string, over: Partial<TransferFormData>, regionCode = ""): TransferFormData {
  const f = createDefaultTransferFormData();
  f.transferDate = transferDate;
  f.householdHousingCount = "1";
  f.isOneHousehold = true;
  f.isRegulatedArea = false;
  f.wasRegulatedAtAcquisition = false;
  f.residencePeriodMonths = "0";
  f.contractTotalPrice = "300,000,000";
  Object.assign(f.assets[0], {
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate,
    actualSalePrice: "300,000,000",
    fixedAcquisitionPrice: "150,000,000",
    useEstimatedAcquisition: false,
    residenceInputMode: "direct",
    residencePeriodMonthsAsset: "0",
    regionCode,
  });
  return { ...f, ...over };
}

// ─── 공통 ────────────────────────────────────────────────────────────────────

const post = (body: unknown) =>
  SINGLE(
    new NextRequest("http://l/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-ratelimit-bypass": "1" },
      body: JSON.stringify(body),
    }),
  );
async function run(body: unknown): Promise<R> {
  const res = await post(body);
  const json = (await res.json()) as { data: { result: R } };
  expect(res.status, JSON.stringify(json).slice(0, 400)).toBe(200);
  return json.data.result;
}
const gift = (giftDate: string, bgt: Partial<BurdenedGiftTransferTaxInput>, pnu?: string) =>
  run(buildGiftBurdenedTransferBody(giftItem(bgt, pnu), giftForm(giftDate)));
async function bodyOf(send: () => Promise<unknown>): Promise<Obj> {
  let body: unknown;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u: string, init: RequestInit) => {
      body = JSON.parse(String(init.body));
      return { ok: true, json: async () => ({ data: { mode: "single", result: {} } }) } as Response;
    }),
  );
  await send().catch(() => undefined);
  vi.unstubAllGlobals();
  return body as Obj;
}
const transfer = async (f: TransferFormData) => run(await bodyOf(() => callTransferTaxAPI(f)));
const warned = (r: R, s: string) => (r.warnings ?? []).some((w) => w.includes(s));

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});
afterEach(() => vi.unstubAllGlobals());

// ═══ R — 증여 주택 주소 → 조정대상지역 자동 판정 ═══════════════════════════════

describe("R ④ — 증여 주택 주소(PNU 앞 10자리)를 `regionCode`로 싣는다 (주택만)", () => {
  it("R-B1 주소 PNU → regionCode = 앞 10자리", () => {
    const body = buildGiftBurdenedTransferBody(giftItem({ acquisitionDate: new Date("2018-01-01") }, GANGNAM_PNU), giftForm("2021-01-01"));
    expect(body.regionCode).toBe(GANGNAM);
  });
  it("R-B2 부정 짝 — 주소 없음 · PNU 10자리 미만이면 키 없음(선언 토글로 판정)", () => {
    const none = buildGiftBurdenedTransferBody(giftItem({ acquisitionDate: new Date("2018-01-01") }), giftForm("2021-01-01"));
    expect(none).not.toHaveProperty("regionCode");
    const short = buildGiftBurdenedTransferBody(giftItem({ acquisitionDate: new Date("2018-01-01") }, "11680"), giftForm("2021-01-01"));
    expect(short).not.toHaveProperty("regionCode");
  });
});

describe("R ⑭ route — 주소가 선언을 이긴다(양도세 계산기와 같은 우선순위)", () => {
  it("R-1 ★ §154① 거주요건 — 강남 2018-01-01 취득·거주 0·「취득시 조정」 토글 OFF: 종전 비과세 → 과세, 계산기와 같은 세액", async () => {
    const bgt = { acquisitionDate: new Date("2018-01-01") };
    const base = await gift("2021-01-01", bgt); // 주소 없음 — 토글(OFF)로 판정
    expect(base.isExempt).toBe(true);
    const withAddress = await gift("2021-01-01", bgt, GANGNAM_PNU);
    expect(withAddress.isExempt).toBe(false);
    expect(withAddress.determinedTax).toBe(10_592_400);
    // 패리티 — 같은 주소·같은 토글(OFF)
    const calc = await transfer(transferForm("2021-01-01", "2018-01-01", {}, GANGNAM));
    expect(calc.isExempt).toBe(false);
    // 선언 토글을 켠 값과 같다(주소 자동 판정 = 조정)
    expect((await gift("2021-01-01", { ...bgt, wasRegulatedAtAcquisition: true })).determinedTax).toBe(10_592_400);
  });

  it("R-2 부정 짝 — 2017-08-02 취득(지정 전)이면 주소가 있어도 거주요건 없음 → 비과세 · 토글 ON도 코드가 이긴다", async () => {
    const r = await gift("2021-01-01", { acquisitionDate: new Date("2017-08-02"), wasRegulatedAtAcquisition: true }, GANGNAM_PNU);
    expect(r.isExempt).toBe(true);
    const calc = await transfer({ ...transferForm("2021-01-01", "2017-08-02", {}, GANGNAM), wasRegulatedAtAcquisition: true });
    expect(calc.isExempt).toBe(true);
  });

  it("R-3 ★ §155①2호 — 종전(증여) 주택 조정 여부 선언 없음: 종전 판정 보류(대리 지표 비과세) → 주소로 판정해 과세 (신규 2020-06-01 조정 선언 · 증여 2021-08-01)", async () => {
    const tt = {
      previousAcquisitionDate: new Date("2015-01-01"),
      newAcquisitionDate: new Date("2020-06-01"),
      newHouseRegulatedAtAcquisition: "yes",
    };
    const bgt = { acquisitionDate: new Date("2015-01-01"), householdHousingCount: 2, temporaryTwoHouse: tt };
    const base = await gift("2021-08-01", bgt);
    expect(base.isExempt).toBe(true);
    expect(warned(base, "신규주택 취득일 기준")).toBe(true);
    const withAddress = await gift("2021-08-01", bgt, GANGNAM_PNU);
    expect(withAddress.isExempt).toBe(false);
    expect(withAddress.determinedTax).toBe(9_544_800);
    expect(warned(withAddress, "신규주택 취득일 기준")).toBe(false);
  });
});

// ═══ P — §154① 단서 (삭제 전 4호 OH-38 포함) ═══════════════════════════════════

/** 리뷰 OH-38 시료 — 조정 1주택 2018-03-01 취득 · 2018-06-01 두 등록 신청 · 거주 0 · 임대의무 준수 · 5% 이내 */
const FOUR_HO = {
  provisoReason: "rental_registration_4ho",
  proviso4hoBusinessRegDate: "2018-06-01",
  proviso4hoRentalRegDate: "2018-06-01",
  proviso4hoRegulatedOneHouse: "yes",
  proviso4hoStatus: "maintained",
  proviso4hoDuringMandatory: "no",
  proviso4hoRentOver5: "no",
} as const;
const REGULATED_BGT = { acquisitionDate: new Date("2018-03-01"), isRegulatedArea: true, wasRegulatedAtAcquisition: true };

describe("P ⑭ route — §154① 단서 사유가 엔진에 닿는다", () => {
  it("P-1 ★ 4호(OH-38) — 종전 과세(거주 2년 미충족) → 비과세 · 근거 부칙 제38조②, 계산기와 같은 결론", async () => {
    const base = await gift("2021-06-01", REGULATED_BGT);
    expect(base.isExempt).toBe(false);
    expect(base.determinedTax).toBe(10_592_400);
    const r = await gift("2021-06-01", { ...REGULATED_BGT, ...FOUR_HO } as Partial<BurdenedGiftTransferTaxInput>);
    expect(r.isExempt).toBe(true);
    expect(r.exemptReason).toContain("대통령령 제30395호 부칙 제38조 ②");
    const calc = await transfer({
      ...transferForm("2021-06-01", "2018-03-01", FOUR_HO as Partial<TransferFormData>),
      isRegulatedArea: true,
      wasRegulatedAtAcquisition: true,
    });
    expect(calc.isExempt).toBe(true);
  });

  it("P-2 부정 짝 — 4호 등록 신청이 2019-12-17(기한 뒤)이면 비과세 아님(엔진이 사유를 낸다)", async () => {
    const late = { ...FOUR_HO, proviso4hoBusinessRegDate: "2019-12-17", proviso4hoRentalRegDate: "2019-12-17" };
    const r = await gift("2021-06-01", { ...REGULATED_BGT, ...late } as Partial<BurdenedGiftTransferTaxInput>);
    expect(r.isExempt).toBe(false);
  });

  it("P-3 ★ 3호 부득이(거주 12개월) — 종전 과세 → 비과세, 계산기와 같은 결론", async () => {
    const bgt = { ...REGULATED_BGT, residencePeriodMonths: 12 };
    expect((await gift("2021-06-01", bgt)).isExempt).toBe(false);
    const r = await gift("2021-06-01", { ...bgt, provisoReason: "unavoidable" } as Partial<BurdenedGiftTransferTaxInput>);
    expect(r.isExempt).toBe(true);
    const f = {
      ...transferForm("2021-06-01", "2018-03-01", { provisoReason: "unavoidable" }),
      isRegulatedArea: true,
      wasRegulatedAtAcquisition: true,
    };
    f.assets[0].residencePeriodMonthsAsset = "12"; // 계산기는 자산 수준 거주 개월(direct 모드)을 쓴다
    expect((await transfer(f)).isExempt).toBe(true);
  });

  it("P-4 ④ 게이트 — 1세대 OFF · 3주택이면 남은 사유를 싣지 않는다(카드가 숨는 맥락)", () => {
    const off = buildGiftBurdenedTransferBody(
      giftItem({ ...REGULATED_BGT, ...FOUR_HO, isOneHousehold: false } as Partial<BurdenedGiftTransferTaxInput>),
      giftForm("2021-06-01"),
    );
    expect(off).not.toHaveProperty("oneHouseExemptionProviso");
    const three = buildGiftBurdenedTransferBody(
      giftItem({ ...REGULATED_BGT, ...FOUR_HO, householdHousingCount: 3 } as Partial<BurdenedGiftTransferTaxInput>),
      giftForm("2021-06-01"),
    );
    expect(three).not.toHaveProperty("oneHouseExemptionProviso");
  });

  it("P-5 ④ 일시적 2주택 맥락 — 1·2가·3호만 싣는다(4호는 1주택 맥락 전용)", () => {
    const tt = { previousAcquisitionDate: new Date("2018-03-01"), newAcquisitionDate: new Date("2020-06-01") };
    const four = buildGiftBurdenedTransferBody(
      giftItem({ ...REGULATED_BGT, ...FOUR_HO, householdHousingCount: 2, temporaryTwoHouse: tt } as Partial<BurdenedGiftTransferTaxInput>),
      giftForm("2021-06-01"),
    );
    expect(four).not.toHaveProperty("oneHouseExemptionProviso");
    const unav = buildGiftBurdenedTransferBody(
      giftItem({ ...REGULATED_BGT, provisoReason: "unavoidable", householdHousingCount: 2, temporaryTwoHouse: tt } as Partial<BurdenedGiftTransferTaxInput>),
      giftForm("2021-06-01"),
    );
    expect(unav.oneHouseExemptionProviso).toEqual({ reason: "unavoidable" });
  });
});

// ═══ F — §154⑤ 단서 최종 1주택 재기산 (OH-22) ════════════════════════════════

const SOLD = {
  finalHouseRestartHistory: "yes",
  finalHouseRestartDisposals: [{ id: "d1", kind: "transfer", date: "2021-06-01", temporaryTwoHouse: "no" }],
} as const;

describe("F ⑭ route — 처분 이력이 엔진에 닿는다", () => {
  it("F-1 ★ 2021-06-01 다른 주택 양도 → 재기산 과세, 계산기와 같은 결론 (취득 2015-03-01 · 증여 2022-03-01)", async () => {
    const bgt = { acquisitionDate: new Date("2015-03-01") };
    const base = await gift("2022-03-01", bgt);
    expect(base.isExempt).toBe(true); // 판정 보류 고지와 함께 비과세(종전 동작)
    const r = await gift("2022-03-01", { ...bgt, ...SOLD } as unknown as Partial<BurdenedGiftTransferTaxInput>);
    expect(r.isExempt).toBe(false);
    expect(r.determinedTax).toBe(9_195_600);
    expect(warned(r, "2021-06-01부터 다시 셉니다")).toBe(true);
    const calc = await transfer(transferForm("2022-03-01", "2015-03-01", SOLD as unknown as Partial<TransferFormData>));
    expect(calc.isExempt).toBe(false);
  });

  it("F-2 부정 짝 — 「처분 없음」이면 비과세이고 판정 보류 고지도 사라진다", async () => {
    const bgt = { acquisitionDate: new Date("2015-03-01") };
    const base = await gift("2022-03-01", bgt);
    const r = await gift("2022-03-01", { ...bgt, finalHouseRestartHistory: "no" } as Partial<BurdenedGiftTransferTaxInput>);
    expect(r.isExempt).toBe(true);
    expect((r.warnings ?? []).length).toBeLessThan((base.warnings ?? []).length);
  });

  it("F-3 ④ 범위 밖(증여 2022-05-10)의 stale 이력은 싣지 않는다 → 비과세", async () => {
    const bgt = { acquisitionDate: new Date("2015-03-01"), ...SOLD } as unknown as Partial<BurdenedGiftTransferTaxInput>;
    expect(buildGiftBurdenedTransferBody(giftItem(bgt), giftForm("2022-05-10"))).not.toHaveProperty("finalOneHouseRestart");
    expect((await gift("2022-05-10", bgt)).isExempt).toBe(true);
  });
});
