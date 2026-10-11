/**
 * 1h-G1-4·G1-5 anchor(결정 #25 C) — §155① 일시적 2주택 사실의 ④ 전송 게이트가 ⑤ 표시 게이트와 같다.
 *
 * 종전: ④는 `temporaryTwoHouse` 객체 존재만 보내서
 *  (G1-4) 주택 수를 2→3으로 바꿔 칸이 사라져도 숨은 날짜가 실려 「일시적 2주택·혼인 합가 중첩」 비과세가 섰고,
 *  (G1-5) 신규 주택 취득일이 빈 채 객체만 있으면 ⑫ Zod 400(막다른 오류)이 났다.
 * 증여 화면에는 보유 주택 목록이 없어 3주택 중 어느 두 채가 일시적 2주택 짝인지 가릴 수 없다 → 주택 수 2에서만 연다.
 *
 * 금액은 mock 세율표 실측 — 방향만 유효하다(시료: 취득 2015-01-01 · 증여 2025-06-01).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));

import { preloadTaxRates } from "@/lib/db/tax-rates";
import { validateStep } from "@/components/calc/gift-tax-form-validate";
import { INITIAL_FORM, type FormState } from "@/components/calc/gift-tax-form-shared";
import {
  giftBurdenedNewAcquisitionDatePatch,
  giftBurdenedTempTwoHouseIncompleteError,
  giftBurdenedTempTwoHouseInScope,
} from "@/lib/calc/gift-burdened-temp-two-house";
import type { BurdenedGiftTransferTaxInput } from "@/lib/tax-engine/types/inheritance-gift-estate.types";
import { gift, giftBody, giftItem, post, type Obj } from "./_gift-burdened-pr7-harness";

beforeEach(() => vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates()));
afterEach(() => vi.unstubAllGlobals());

const ACQ = new Date("2015-01-01");
const TT = { previousAcquisitionDate: ACQ, newAcquisitionDate: new Date("2023-03-01") };
const MERGE = { marriageDate: "2020-01-01", isFirstTransferredInMerge: true };
const bgt = (over: Partial<BurdenedGiftTransferTaxInput>): Partial<BurdenedGiftTransferTaxInput> => ({ acquisitionDate: ACQ, ...over });
const validate = (b: Partial<BurdenedGiftTransferTaxInput>) =>
  validateStep(1, { ...INITIAL_FORM, giftDate: "2025-06-01", donor: "father", giftItems: [giftItem(b)] } as FormState);

describe("G1-4 ④ — 주택 수가 2가 아니면 숨은 §155① 날짜를 싣지 않는다", () => {
  it("T-1 ★ 주택 수 2→3으로 바꿔 칸이 사라진 뒤 합가일을 넣어도 body에 temporaryTwoHouse 없음 · 중첩 비과세 없음(과세 8,368,800)", async () => {
    const b = bgt({ householdHousingCount: 3, temporaryTwoHouse: TT, ...MERGE });
    expect(giftBody("2025-06-01", b)).not.toHaveProperty("temporaryTwoHouse");
    const r = await gift("2025-06-01", b);
    expect(r.isExempt).toBe(false);
    expect(r.totalTax).toBe(8_368_800);
  });

  it("T-2 긍정 짝 — 주택 수 2 · 두 날짜가 있으면 그대로 싣는다(일시적 2주택 비과세)", async () => {
    const b = bgt({ householdHousingCount: 2, temporaryTwoHouse: TT });
    expect(giftBody("2025-06-01", b)).toHaveProperty("temporaryTwoHouse");
    const r = await gift("2025-06-01", b);
    expect(r.isExempt).toBe(true);
    expect(r.exemptReason).toBe("일시적 2주택 비과세");
  });

  it("T-3 술어 — ⑤ 처분기한 예외 칸의 게이트(DeadlineInScope)와 ④ 전송 게이트가 같은 값", () => {
    for (const count of [1, 2, 3]) {
      const b = bgt({ householdHousingCount: count, temporaryTwoHouse: TT }) as BurdenedGiftTransferTaxInput;
      expect(giftBurdenedTempTwoHouseInScope(b)).toBe(count === 2);
    }
  });
});

describe("G1-5 ④⑧ — 신규 주택 취득일이 빈 채 객체만 있으면 400 대신 ⑧이 막는다", () => {
  const HALF = bgt({ householdHousingCount: 2, temporaryTwoHouse: { previousAcquisitionDate: ACQ } as never });

  it("T-4 ★ 종전 400: 객체만 있는 body → 지금은 ④가 싣지 않아 200 (과세 8,368,800)", async () => {
    expect(giftBody("2025-06-01", HALF)).not.toHaveProperty("temporaryTwoHouse");
    const res = await post(giftBody("2025-06-01", HALF));
    expect(res.status).toBe(200);
  });

  it("T-5 ★ ⑧: 주택 수 2 + 객체 있음 + 신규 취득일 없음 → 막고 안내(침묵 금지)", () => {
    expect(giftBurdenedTempTwoHouseIncompleteError(HALF as BurdenedGiftTransferTaxInput)).toContain("신규 주택 취득일");
    expect(validate(HALF)).toContain("신규 주택 취득일");
  });

  it("T-6 부정 짝 — ⑧은 주택 수 2가 아니거나 객체가 없으면 막지 않는다(숨은 값 영구 차단 방지)", () => {
    expect(validate(bgt({ householdHousingCount: 3, temporaryTwoHouse: { previousAcquisitionDate: ACQ } as never }))).toBeNull();
    expect(validate(bgt({ householdHousingCount: 2 }))).toBeNull();
    expect(validate(bgt({ householdHousingCount: 2, temporaryTwoHouse: TT }))).toBeNull();
  });
});

describe("G1-5 ⑤ setter — 취득일을 비우면 쓴 항목이 없을 때 객체를 되돌린다", () => {
  it("T-7 한 글자만 쳐서 빈 값이 나오면 undefined — 빈 객체가 남지 않는다", () => {
    expect(giftBurdenedNewAcquisitionDatePatch(TT as never, undefined, ACQ)).toBeUndefined();
    expect(giftBurdenedNewAcquisitionDatePatch(undefined, undefined, ACQ)).toBeUndefined();
  });
  it("T-8 부정 짝 — 소재지 등 쓴 항목이 있으면 지우지 않는다", () => {
    const withAddr = { ...TT, newHouseJibun: "서울 강남구 역삼동 1-1" } as never;
    const out = giftBurdenedNewAcquisitionDatePatch(withAddr, undefined, ACQ);
    expect(out).toMatchObject({ newHouseJibun: "서울 강남구 역삼동 1-1" });
  });
  it("T-9 날짜가 완성되면 두 날짜를 저장하고 다른 항목은 보존한다", () => {
    const d = new Date("2023-03-01");
    const out = giftBurdenedNewAcquisitionDatePatch({ ...TT, newHouseRegionCode: "1168010100" } as never, d, ACQ);
    expect(out).toMatchObject({ newAcquisitionDate: d, previousAcquisitionDate: ACQ, newHouseRegionCode: "1168010100" });
  });
});

void (null as unknown as Obj);
