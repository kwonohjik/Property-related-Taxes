/**
 * 조특법 §99·§99의3·§99의4 리뷰 후속 L15 C-4 — 소령 §167의3①5호 축에서 종전(원시) §99의3 유형 「국민주택 모름」이 불성립이면서
 * 「확인 필요」가 응답에 없었다(leaf `resolveSpecialHouseExclusions`의 `entries[].reason`에만 있음). 3호 임대주택 고지와 같은 경로
 * (`multiHouseSurchargeEvaluation.warnings` · 최상위 `warnings`)로 나오는지, 세액은 불변인지 고정한다.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi
    .fn()
    .mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST as SINGLE } from "@/app/api/calc/transfer/route";
import { preloadTaxRates, loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";

type Form = ReturnType<typeof createDefaultTransferFormData>;
type Obj = Record<string, unknown>;

const TRANSFER_DATE = "2026-09-18";
const GANGNAM = "1168010100";

const ROW: HouseEntry = {
  id: "s",
  region: "capital",
  regionCode: GANGNAM,
  acquisitionDate: "2001-05-01",
  officialPrice: "300000000",
  isInherited: false,
  isLongTermRental: false,
  isApartment: true,
  isOfficetel: false,
  isUnsoldHousing: false,
};

function form(houses: HouseEntry[], over: Partial<Form> = {}): Form {
  const f = createDefaultTransferFormData();
  f.isOneHousehold = true;
  f.assets[0] = {
    ...f.assets[0],
    assetKind: "housing",
    acquisitionDate: "2015-01-01",
    fixedAcquisitionPrice: "300,000,000",
    regionCode: GANGNAM,
  };
  return Object.assign(f, {
    transferDate: TRANSFER_DATE,
    contractTotalPrice: "2,000,000,000",
    residencePeriodMonths: "0",
    householdHousingCount: String(houses.length + 1),
    isRegulatedArea: true,
    wasRegulatedAtAcquisition: false,
    houses,
    ...over,
  });
}

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

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockImplementation(
    async () => loadFallbackTransferRates(new Date(TRANSFER_DATE)) as Awaited<ReturnType<typeof preloadTaxRates>>,
  );
});
afterEach(() => vi.unstubAllGlobals());

const decl = (over: Record<string, unknown> = {}) =>
  ({
    article: "new_99_3",
    houseId: "s",
    houseAcquisitionDate: "2001-05-01",
    houseContractDate: "2001-03-01",
    isNationalHousing: false,
    housingKind: "original_purchase",
    originalOutsideMetropolitan: "yes",
    originalNationalHousing: "yes",
    requirementsConfirmed: true,
    ...over,
  }) as unknown as Form["specialHouseExclusions"][number];

async function run(decls: Form["specialHouseExclusions"], houses: HouseEntry[] = [ROW]) {
  const f = form(houses, { specialHouseExclusions: decls });
  const body = await bodyOf(() => callTransferTaxAPI(f));
  const res = await SINGLE(
    new NextRequest("http://l/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  const json = (await res.json()) as { data: { result: Obj } };
  expect(res.status, JSON.stringify(json).slice(0, 300)).toBe(200);
  const r = json.data.result;
  const mh = r.multiHouseSurchargeEvaluation as { surchargeApplicable: boolean; exclusionReasons: { type: string }[]; warnings?: string[] };
  return { totalTax: r.totalTax as number, mh, top: (r.warnings ?? []) as string[], r };
}

const BEFORE_AFTER_TOTAL = 1_141_178_500;
const EXCLUDED_TOTAL = 582_598_500;
const notice5ho = (ws: string[] | undefined) =>
  (ws ?? []).filter((w) => w.startsWith("확인 필요: 주택 수 제외로 선언한 감면주택이 소득세법 시행령 §167의3①5호에 해당하는지"));

describe("L15 C-4 — 소령 §167의3①5호 축 「모름」 = 불성립 + 확인 필요", () => {
  it("국민주택 「예」 → 5호 성립 · 10호 배제 582,598,500 · 고지 없음", async () => {
    const x = await run([decl()]);
    expect(x.totalTax).toBe(EXCLUDED_TOTAL);
    expect(x.mh.surchargeApplicable).toBe(false);
    expect(notice5ho(x.mh.warnings)).toEqual([]);
  });

  it("국민주택 「모름」 → 불성립(2주택 중과 1,141,178,500 — 수정 전과 같은 세액) + 중과 판정 warnings에 「확인 필요」 · 사유 · 배제 가능 조문", async () => {
    const x = await run([decl({ originalNationalHousing: "unknown" })]);
    expect(x.totalTax).toBe(BEFORE_AFTER_TOTAL);
    expect(x.mh.surchargeApplicable).toBe(true);
    const [n] = notice5ho(x.mh.warnings);
    expect(notice5ho(x.mh.warnings)).toHaveLength(1);
    expect(n).toContain("국민주택(모름·미답)");
    expect(n).toContain("소득세법 시행령 §167의10①10호");
    expect(n).toContain("소득세법 시행령 §167의3①10호");
  });

  it("수도권 밖 「모름」도 같은 경로 · 둘 다 모름이면 사유에 둘 다", async () => {
    const a = await run([decl({ originalOutsideMetropolitan: "unknown" })]);
    expect(a.totalTax).toBe(BEFORE_AFTER_TOTAL);
    expect(notice5ho(a.mh.warnings)[0]).toContain("수도권 밖 지역 소재(모름·미답)");
    const b = await run([decl({ originalOutsideMetropolitan: "unknown", originalNationalHousing: "unknown" })]);
    expect(notice5ho(b.mh.warnings)[0]).toContain("수도권 밖 지역 소재(모름·미답)");
    expect(notice5ho(b.mh.warnings)[0]).toContain("국민주택(모름·미답)");
  });

  it("국민주택 「아니오」 → 모르는 것이 아니라 아닌 것 — 고지 없음, 세액 같음", async () => {
    const x = await run([decl({ originalNationalHousing: "no" })]);
    expect(x.totalTax).toBe(BEFORE_AFTER_TOTAL);
    expect(notice5ho(x.mh.warnings)).toEqual([]);
  });

  it("유형 미선택(§99의3, API 직접) → 같은 경로로 확인 필요", async () => {
    const x = await run([decl({ housingKind: undefined, originalOutsideMetropolitan: undefined, originalNationalHousing: undefined })]);
    expect(x.totalTax).toBe(BEFORE_AFTER_TOTAL);
    expect(notice5ho(x.mh.warnings)[0]).toContain("유형");
  });

  it("본 요건 확인이 꺼진 선언 + 「모름」 → 답이 무엇이어도 불성립이라 결론을 가르지 못한다 — 고지 없음", async () => {
    const x = await run([decl({ originalNationalHousing: "unknown", requirementsConfirmed: false })]);
    expect(x.totalTax).toBe(BEFORE_AFTER_TOTAL);
    expect(notice5ho(x.mh.warnings)).toEqual([]);
  });

  it("3주택(다른 일반주택 1채 더) → 5호로 봐도 중과가 남는다 — 고지 없음", async () => {
    const x = await run([decl({ originalNationalHousing: "unknown" })], [ROW, { ...ROW, id: "g", acquisitionDate: "2018-01-01" }]);
    expect(x.mh.surchargeApplicable).toBe(true);
    expect(notice5ho(x.mh.warnings)).toEqual([]);
  });
});
