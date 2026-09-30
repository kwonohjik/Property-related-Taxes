/**
 * Zod(⑫) ↔ 엔진 필수 불일치 2차분 — 1주택 판정 축 O3·O4 · 명부 H-3 · 한시 유예 · 다건 M2
 * (계획서 `docs/00-pm/zod-engine-required-mismatch.plan.md` §4.1·§4.2·§4.3).
 *
 * 각 행은 **비우면 200 + 다른 판정·세액**이었다(엔진이 빈 값을 보수적 기본값·현재 기준시가·
 * 「요건 충족」으로 조용히 읽는다). 수정 후: 비우면 400 + 정확한 경로, 값이 있으면 종전과 같은 결과(🟢).
 * 조건은 모두 ⑧의 거울이다 — refine 주석(`transfer-tax-schema-household-refines.ts`)의 ⑧ 위치 참조.
 *
 * M2는 방향이 다르다 — ④가 화면에 없는(주택·건물 외 자산의) 소유자 분리를 보내 **단건만 400**
 * 이던 막다른 길이다. ④가 보내지 않게 하고, API 직접 호출은 단건·다건이 **같이 400**이다.
 *
 * ⚠️ 세액은 mock 세율표·fallback 세율표 실측값이다(정본 세액 아님). 긍정 짝은 「수정 전과 같다」를 고정한다.
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

import { preloadTaxRates, loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { POST as SINGLE } from "@/app/api/calc/transfer/route";
import { POST as MULTI } from "@/app/api/calc/transfer/multi/route";
import { POST as JUDGE } from "@/app/api/calc/one-house-exemption/route";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { callMultiTransferTaxAPI } from "@/lib/calc/multi-transfer-tax-api";
import { defaultMultiTransferFormData } from "@/lib/stores/multi-transfer-tax-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";

type Json = {
  data?: {
    result?: { determinedTax: number; totalTax: number; isExempt: boolean };
    judgment?: { isExempt: boolean };
    totalTax?: number;
  };
  error?: { fieldErrors?: Record<string, string[]> };
};
async function post(handler: (req: NextRequest) => Promise<Response>, body: unknown) {
  const res = await handler(
    new NextRequest("http://localhost/api/calc/x", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, json: (await res.json()) as Json };
}
async function ok(handler: (req: NextRequest) => Promise<Response>, body: unknown) {
  const r = await post(handler, body);
  expect(r.status, String(JSON.stringify(r.json.error)).slice(0, 300)).toBe(200);
  return r.json.data!;
}
async function rejected(handler: (req: NextRequest) => Promise<Response>, body: unknown, path: string) {
  const r = await post(handler, body);
  expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(400);
  expect(Object.keys(r.json.error?.fieldErrors ?? {})).toContain(path);
}

const row = (id: string, acq: string, extra: Record<string, unknown> = {}) => ({
  id,
  region: "capital",
  acquisitionDate: acq,
  officialPrice: 300_000_000,
  isInherited: false,
  isLongTermRental: false,
  isApartment: true,
  isOfficetel: false,
  isUnsoldHousing: false,
  ...extra,
});
const BASE = {
  propertyType: "housing",
  transferPrice: 800_000_000,
  acquisitionPrice: 400_000_000,
  expenses: 0,
  useEstimatedAcquisition: false,
  isRegulatedArea: false,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: false,
  isOneHousehold: true,
  annualBasicDeductionUsed: 0,
  reductions: [],
};
const asItem = (b: object) => ({ ...b, propertyId: "p1", propertyLabel: "p1" });
const multiOf = (b: object) => ({ taxYear: 2023, properties: [asItem(b)], annualBasicDeductionUsed: 0 });

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

// ── O3 §155② 괄호 — 소급 2년 내 피상속인 증여일 (⑧ `transfer-tax-validate-step1.ts` OH-12c) ──
describe("O3 피상속인 증여일", () => {
  // 명부 = 양도 주택 + 단독상속주택(2019) · 양도 주택은 2017-06-01 피상속인 증여(2018-02-13 부칙 전 → 제외 부적용)
  const body = (giftDate?: string) => ({
    ...BASE,
    acquisitionDate: "2017-06-01",
    transferDate: "2023-06-01",
    householdHousingCount: 2,
    residencePeriodMonths: 0,
    sellingHouseId: "selling",
    houses: [
      row("selling", "2017-06-01"),
      row("inh", "2019-06-01", { isInherited: true, inheritedDate: "2019-06-01" }),
    ],
    generalHouseGiftedFromDecedentWithin2yr: true,
    ...(giftDate ? { generalHouseGiftDate: giftDate } : {}),
  });

  it("🟢 증여일 2017-06-01 → 비과세 (단건·판정 메뉴 — 종전과 같다)", async () => {
    const s = await ok(SINGLE, body("2017-06-01"));
    expect(s.result!.isExempt).toBe(true);
    const j = await ok(JUDGE, body("2017-06-01"));
    expect(j.judgment!.isExempt).toBe(true);
  });

  it("🔴 증여일 생략 → 400 (종전 200 + 과세 113,860,000 · 판정 반전)", async () => {
    await rejected(SINGLE, body(), "generalHouseGiftDate");
    await rejected(JUDGE, body(), "generalHouseGiftDate");
    await rejected(MULTI, multiOf(body()), "properties.0.generalHouseGiftDate");
  });

  it("양도 행(`sellingHouseId`)의 상속 표시는 게이트가 아니다 — ⑧은 다른 보유 주택만 본다", async () => {
    // 상속 취득 양도 주택 + 명부에 다른 상속주택 없음 → ⑤가 토글·날짜 칸을 열지 않는다 ⇒ 요구하면 막다른 길
    const b = {
      ...body(),
      acquisitionCause: "inheritance",
      houses: [row("selling", "2017-06-01", { isInherited: true, inheritedDate: "2017-06-01" }), row("h2", "2019-06-01")],
    };
    const r = await post(SINGLE, b);
    expect(Object.keys(r.json.error?.fieldErrors ?? {})).not.toContain("generalHouseGiftDate");
  });
});

// ── O4 §154① 5호 — 계약금 지급일 현재 무주택 (⑧ `exemption-proviso-validate.ts`) ──
describe("O4 조정 공고 전 계약 — 무주택 확인", () => {
  // 2018 조정 취득 · 거주 0 → 단서 없으면 과세 117,060,000 · 5호면 거주요건 면제 → 비과세
  const body = (extra: Record<string, unknown>) => ({
    ...BASE,
    acquisitionDate: "2018-06-01",
    transferDate: "2023-06-01",
    householdHousingCount: 1,
    residencePeriodMonths: 0,
    isRegulatedArea: true,
    wasRegulatedAtAcquisition: true,
    oneHouseExemptionProviso: { reason: "pre_designation_contract", ...extra },
  });

  it("🟢 무주택 확인(true) → 비과세 (단건·판정 메뉴 — 종전과 같다)", async () => {
    const s = await ok(SINGLE, body({ preContractNoHouse: true }));
    expect(s.result!.isExempt).toBe(true);
    const j = await ok(JUDGE, body({ preContractNoHouse: true }));
    expect(j.judgment!.isExempt).toBe(true);
  });

  it("🔴 확인 생략·false → 400 (종전: ⑫에 키가 없어 strip — 값과 무관하게 200 비과세)", async () => {
    await rejected(SINGLE, body({}), "oneHouseExemptionProviso.preContractNoHouse");
    await rejected(SINGLE, body({ preContractNoHouse: false }), "oneHouseExemptionProviso.preContractNoHouse");
    await rejected(JUDGE, body({}), "oneHouseExemptionProviso.preContractNoHouse");
    await rejected(MULTI, multiOf(body({})), "properties.0.oneHouseExemptionProviso.preContractNoHouse");
  });

  it("다른 사유에는 요구하지 않는다 (부정 짝)", async () => {
    const r = await post(SINGLE, { ...body({}), oneHouseExemptionProviso: { reason: "unavoidable" } });
    expect(Object.keys(r.json.error?.fieldErrors ?? {})).not.toContain("oneHouseExemptionProviso.preContractNoHouse");
  });
});

// ── H-3 명부 장기임대 9유형 (⑧ `transfer-tax-validate-step1.ts` 보유 주택 행 검증) ──
describe("H-3 장기임대 다목 — 임대개시 당시 공시가격·면적", () => {
  beforeEach(() => {
    vi.mocked(preloadTaxRates).mockImplementation(
      async () => loadFallbackTransferRates(new Date("2021-03-01")) as Awaited<ReturnType<typeof preloadTaxRates>>,
    );
  });
  // 강남 양도 주택 + 다목 건설임대 1채 → 임대가 중과배제면 양도 주택은 §167의10①10호로 중과 제외
  const rent = (extra: Record<string, unknown>) =>
    row("rent", "2014-01-01", {
      isApartment: false,
      isLongTermRental: true,
      isRegisteredRental: true,
      rentalRegistrationDate: "2014-02-01",
      businessRegistrationDate: "2014-02-01",
      rentalPeriodYears: 8,
      rentalType: "C",
      rentIncreaseUnder5Pct: true,
      hasMinimum2Units: true,
      rentalLandArea: 100,
      rentalTotalFloorArea: 80,
      rentalStartOfficialPrice: 700_000_000,
      ...extra,
    });
  const body = (extra: Record<string, unknown>) => ({
    ...BASE,
    transferPrice: 900_000_000,
    acquisitionPrice: 300_000_000,
    acquisitionDate: "2015-01-01",
    transferDate: "2021-03-01",
    isRegulatedArea: true,
    wasRegulatedAtAcquisition: true,
    regionCode: "1168010100",
    householdHousingCount: 3,
    residencePeriodMonths: 0,
    sellingHouseId: "selling",
    houses: [row("selling", "2015-01-01", { regionCode: "1168010100" }), rent(extra)],
  });

  it("🟢 임대개시 공시가격 7억(한도 초과) → 중과 275,300,000 (종전과 같다)", async () => {
    const s = await ok(SINGLE, body({}));
    expect(s.result!.determinedTax).toBe(275_300_000);
  });

  it("🔴 임대개시 공시가격 생략 → 400 (종전 200 — 현재 공시가격 3억으로 읽어 배제 185,310,000)", async () => {
    await rejected(SINGLE, body({ rentalStartOfficialPrice: undefined }), "houses.1.rentalStartOfficialPrice");
  });

  it("🔴 대지면적 생략 → 400 (종전 200 — 규모 미확인으로 배제 불성립)", async () => {
    await rejected(SINGLE, body({ rentalLandArea: undefined }), "houses.1.rentalLandArea");
  });

  it("양도 행의 임대 선언에는 요구하지 않는다 — ⑧에 그 검증이 없다(막다른 길 방지)", async () => {
    const b = body({});
    b.houses = [
      row("selling", "2015-01-01", { regionCode: "1168010100", isLongTermRental: true, rentalType: "C" }),
      rent({}),
    ];
    const r = await post(SINGLE, b);
    expect(Object.keys(r.json.error?.fieldErrors ?? {}).filter((k) => k.startsWith("houses.0"))).toEqual([]);
  });
});

// ── 한시 유예 나목 — 허가신청일 (⑧ `transfer-tax-validate-step1.ts` gracePeriod) ──
describe("한시 유예 나목 — 토지거래허가 신청일", () => {
  beforeEach(() => {
    vi.mocked(preloadTaxRates).mockImplementation(
      async () => loadFallbackTransferRates(new Date("2026-08-15")) as Awaited<ReturnType<typeof preloadTaxRates>>,
    );
  });
  const body = (gp: Record<string, unknown>) => ({
    ...BASE,
    transferPrice: 1_500_000_000,
    acquisitionPrice: 500_000_000,
    acquisitionDate: "2015-01-01",
    transferDate: "2026-08-15",
    isRegulatedArea: true,
    wasRegulatedAtAcquisition: true,
    regionCode: "1168010100",
    householdHousingCount: 2,
    residencePeriodMonths: 0,
    sellingHouseId: "selling",
    houses: [row("selling", "2015-01-01", { regionCode: "1168010100" }), row("h2", "2016-01-01")],
    gracePeriod: {
      contractDate: "2026-05-01",
      isLandPermitTarget: true,
      permitGranted: true,
      depositReceiptConfirmed: true,
      ...gp,
    },
  });

  it("🟢 허가신청일 2026-04-20 → 유예 290,610,000 (종전과 같다)", async () => {
    const s = await ok(SINGLE, body({ permitApplicationDate: "2026-04-20" }));
    expect(s.result!.determinedTax).toBe(290_610_000);
  });

  it("🔴 허가신청일 생략 → 400 (종전 200 + 중과 582,510,000)", async () => {
    await rejected(SINGLE, body({}), "gracePeriod.permitApplicationDate");
    await rejected(MULTI, { ...multiOf(body({})), taxYear: 2026 }, "properties.0.gracePeriod.permitApplicationDate");
  });

  it("다목(허가 대상 아님)에는 요구하지 않는다 (부정 짝)", async () => {
    const s = await ok(SINGLE, body({ isLandPermitTarget: false }));
    expect(s.result!.determinedTax).toBe(290_610_000);
  });
});

// ── M2 주택·건물 외 자산의 소유자 분리 (⑤ `AssetOwnershipSplitSection` 게이트) ──
describe("M2 stale 소유자 분리 — 단건·다건 같은 결론", () => {
  const land = {
    ...BASE,
    propertyType: "land",
    acquisitionDate: "2010-01-01",
    transferDate: "2024-03-01",
    householdHousingCount: 0,
    residencePeriodMonths: 0,
    isOneHousehold: false,
  };

  it("🔴 API 직접 호출 — 토지 + selfOwns: 단건·다건 모두 400 (종전: 단건 400 · 다건 200 무시)", async () => {
    const stale = { ...land, selfOwns: "building_only", landAcquisitionDate: "2010-01-01" };
    await rejected(SINGLE, stale, "selfOwns");
    await rejected(MULTI, { ...multiOf(stale), taxYear: 2024 }, "properties.0.selfOwns");
  });

  it("🟢 토지 기본(소유자 분리 없음) — 단건·다건 88,550,000 / 합계 97,405,000", async () => {
    const s = await ok(SINGLE, land);
    expect(s.result!.determinedTax).toBe(88_550_000);
    const m = await ok(MULTI, { ...multiOf(land), taxYear: 2024 });
    expect(m.totalTax).toBe(97_405_000);
  });

  describe("④ — 화면에 없는 소유자 분리를 보내지 않는다", () => {
    afterEach(() => vi.unstubAllGlobals());
    const staleLand = (): AssetForm =>
      ({
        ...makeDefaultAsset(1),
        assetKind: "land",
        acquisitionCause: "purchase",
        acquisitionDate: "2010-01-01",
        actualSalePrice: "800,000,000",
        fixedAcquisitionPrice: "400,000,000",
        // 주택에서 켠 뒤 토지로 바꾼 잔재 — 토지에는 토글이 렌더되지 않는다
        selfOwns: "building_only",
        landAcquisitionDate: "2010-01-01",
      }) as AssetForm;
    const form = (asset: AssetForm): TransferFormData => ({
      ...createDefaultTransferFormData(),
      transferDate: "2024-03-01",
      contractTotalPrice: "800,000,000",
      assets: [asset],
      isOneHousehold: false,
      householdHousingCount: "0",
    });
    async function capture(fn: () => Promise<unknown>) {
      const cap: { body?: Record<string, unknown> } = {};
      vi.stubGlobal(
        "fetch",
        vi.fn(async (_u: string, init?: RequestInit) => {
          cap.body = JSON.parse(String(init?.body));
          return { ok: true, json: async () => ({ mode: "single", result: {} }) } as unknown as Response;
        }),
      );
      await fn().catch(() => {});
      vi.unstubAllGlobals();
      return cap.body!;
    }

    it("🔴 단건 ④ 본문에 selfOwns·분리 필드가 없고, route가 200으로 계산한다 (종전 400 막다른 길)", async () => {
      const body = await capture(() => callTransferTaxAPI(form(staleLand())));
      expect(body.selfOwns).toBeUndefined();
      expect(body.landAcquisitionDate).toBeUndefined();
      // 분리 축 자체가 꺼진다(`isSplitPayloadActive`) — 파트 모드·양도 분리 모드도 싣지 않는다
      expect(body.saleSplitMode).toBeUndefined();
      expect(body.landAcqMode).toBeUndefined();
      const clean = await capture(() => callTransferTaxAPI(form({ ...staleLand(), selfOwns: "both" })));
      const s = await ok(SINGLE, body);
      const c = await ok(SINGLE, clean);
      expect(s.result!.determinedTax).toBe(c.result!.determinedTax);
    });

    it("🔴 다건 ④도 같은 게이트 — 단건과 같은 세액", async () => {
      const multiForm = { ...defaultMultiTransferFormData, taxYear: 2024, transferDate: "2024-03-01", properties: [] };
      const body = await capture(() =>
        callMultiTransferTaxAPI(multiForm as never, [
          { propertyId: "p1", propertyLabel: "자산 1", form: form(staleLand()) } as never,
        ]),
      );
      const first = (body.properties as Record<string, unknown>[])[0];
      expect(first.selfOwns).toBeUndefined();
      const m = await ok(MULTI, body);
      const single = await ok(
        SINGLE,
        await capture(() => callTransferTaxAPI(form({ ...staleLand(), selfOwns: "both" }))),
      );
      expect(m.totalTax).toBe(single.result!.totalTax);
    });

    it("주택은 종전대로 보낸다 (부정형의 짝)", async () => {
      const house = { ...staleLand(), assetKind: "housing" } as AssetForm;
      const body = await capture(() => callTransferTaxAPI(form(house)));
      expect(body.selfOwns).toBe("building_only");
    });
  });
});
