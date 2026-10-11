/**
 * 1h-G1-4·G1-9 anchor(결정 #25 C · #26 B) — 증여세 마법사의 3주택 합가(일시적 2주택 중첩·혼인과 동거봉양 이중 합가).
 *
 * 이 화면에는 세대 보유 주택 목록 입력 칸이 없다 → 3주택 중 어느 두 채가 일시적 2주택 짝인지, 합가 전 구성이 맞는지
 * 가릴 수 없다. 원칙 1(모름 = 혜택 불성립)대로 불성립·과세로 계산하고, **합가 요건이 모두 설 때만**(결론을 가를 때만)
 * 하나의 고지로 알린다. 고지는 엔진 warnings라 결과·인쇄·이력에 남는다.
 *
 * 세액은 바뀌지 않는다 — 시료 이중 합가 총세액 10,115,160(mock 세율표 실측).
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
import { NO_ROSTER_THREE_HOUSE_MERGE_NOTICE } from "@/lib/tax-engine/one-house/merge-confirm-warnings";
import type { BurdenedGiftTransferTaxInput } from "@/lib/tax-engine/types/inheritance-gift-estate.types";
import { gift, giftBody, run, type Obj } from "./_gift-burdened-pr7-harness";

beforeEach(() => vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates()));
afterEach(() => vi.unstubAllGlobals());

const BASE = { acquisitionDate: new Date("2015-01-01"), householdHousingCount: 3 } satisfies Partial<BurdenedGiftTransferTaxInput>;
const SINGLE = { ...BASE, marriageDate: "2020-01-01", isFirstTransferredInMerge: true };
const DOUBLE = { ...BASE, marriageDate: "2019-01-01", parentalCareMergeDate: "2020-01-01", parentalCareParentAge: "over_60", isFirstTransferredInMerge: true } satisfies Partial<BurdenedGiftTransferTaxInput>;
const warnings = (r: Obj) => (r.warnings as string[] | undefined) ?? [];
const has = (r: Obj) => warnings(r).includes(NO_ROSTER_THREE_HOUSE_MERGE_NOTICE);

describe("고지 문구", () => {
  it("N-0 비과세뿐 아니라 다주택 중과 배제(§167의3①13호)도 판정하지 않았다고 적고, 계산기(부담부증여)로 안내한다", () => {
    expect(NO_ROSTER_THREE_HOUSE_MERGE_NOTICE).toContain("소득세법 시행령 §167의3①13호");
    expect(NO_ROSTER_THREE_HOUSE_MERGE_NOTICE).toContain("양도소득세 계산기(부담부증여)");
    expect(NO_ROSTER_THREE_HOUSE_MERGE_NOTICE).not.toContain("목록에 입력하면 판정합니다");
  });
});

describe("G1-4·G1-9 — 합가 요건이 서면 3주택 합가 고지 1건 + 세액 불변", () => {
  it("N-1 ★ 이중 합가(혼인 2019 → 동거봉양 2020 · 증여 2022-06-01): 과세 10,115,160 그대로 + 고지", async () => {
    const r = await gift("2022-06-01", DOUBLE);
    expect(r.isExempt).toBe(false);
    expect(r.totalTax).toBe(10_115_160);
    expect(warnings(r).filter((w) => w === NO_ROSTER_THREE_HOUSE_MERGE_NOTICE)).toHaveLength(1);
  });

  it("N-2 ★ 일시적 2주택 중첩 후보(3주택 + 혼인합가 단일): 과세 그대로 + 같은 고지(둘을 한 건으로)", async () => {
    const withMerge = await gift("2025-06-01", SINGLE);
    const noMerge = await gift("2025-06-01", BASE);
    expect(withMerge.isExempt).toBe(false);
    expect(withMerge.totalTax).toBe(noMerge.totalTax);
    expect(has(withMerge)).toBe(true);
    expect(warnings(withMerge).filter((w) => w.includes("3주택이 된 합가 특례"))).toHaveLength(1);
  });

  it("N-3 역순 이중 합가(동거봉양 → 혼인)도 같은 고지", async () => {
    const r = await gift("2022-06-01", { ...DOUBLE, marriageDate: "2020-01-01", parentalCareMergeDate: "2019-01-01" });
    expect(r.isExempt).toBe(false);
    expect(has(r)).toBe(true);
  });
});

describe("G1-4·G1-9 — 결론을 가르지 않으면 고지하지 않는다(부정 짝)", () => {
  it("N-4 1세대가 아님(isOneHousehold OFF): 구성과 무관하게 과세 — 고지 없음", async () => {
    expect(has(await gift("2022-06-01", { ...DOUBLE, isOneHousehold: undefined } as never))).toBe(false);
  });
  it("N-5 「먼저 양도」 아님: 합가 특례 요건 불성립 — 고지 없음", async () => {
    expect(has(await gift("2022-06-01", { ...DOUBLE, isFirstTransferredInMerge: undefined }))).toBe(false);
  });
  it("N-6 기한 경과(먼저 합친 혼인 2010-01-01 · 증여 2022-06-01 > 10년): 고지 없음", async () => {
    expect(has(await gift("2022-06-01", { ...DOUBLE, marriageDate: "2010-01-01" }))).toBe(false);
  });
  it("N-7 양도 주택이 합가 뒤 취득(취득 2021-01-01 > 합가일): 고지 없음", async () => {
    expect(has(await gift("2022-06-01", { ...DOUBLE, acquisitionDate: new Date("2021-01-01") }))).toBe(false);
  });
  it("N-8 합가일 입력 없음: 고지 없음", async () => {
    expect(has(await gift("2022-06-01", BASE))).toBe(false);
  });
  it("N-9 세대 2주택(단일 합가): 이 고지가 아니다 — 증여 화면은 Q-10대로 비과세", async () => {
    const r = await gift("2023-06-01", { ...SINGLE, householdHousingCount: 2 });
    expect(r.isExempt).toBe(true);
    expect(has(r)).toBe(false);
  });
  it("N-10 이중 합가인데 증여가 나중에 합친 날 이전(증여 2019-06-01 < 동거봉양 2020-01-01): 요건 불성립 — 고지 없음", async () => {
    expect(has(await gift("2019-06-01", DOUBLE))).toBe(false);
  });
  it("N-12 ★ 동거봉양 직계존속 연령 「해당 없음」·미선택: 합가 특례가 어차피 서지 않는다 — 고지 없음(결정 #9)", async () => {
    expect(has(await gift("2022-06-01", { ...DOUBLE, parentalCareParentAge: "none" }))).toBe(false);
    expect(has(await gift("2022-06-01", { ...DOUBLE, parentalCareParentAge: "" }))).toBe(false);
  });
  it("N-13 단일 동거봉양 합가도 연령으로 가른다 — 요양급여(§155④ 경로 인정)는 고지 · 해당 없음은 없음", async () => {
    const SINGLE_PC = { ...BASE, parentalCareMergeDate: "2020-01-01", isFirstTransferredInMerge: true };
    expect(has(await gift("2025-06-01", { ...SINGLE_PC, parentalCareParentAge: "care_benefit" }))).toBe(true);
    expect(has(await gift("2025-06-01", { ...SINGLE_PC, parentalCareParentAge: "none" }))).toBe(false);
  });
  it("N-11 목록 입력 칸이 있는 호출(표식 없음)은 이 고지가 아니다(그 화면은 목록 입력으로 판정한다)", async () => {
    const body = giftBody("2022-06-01", DOUBLE);
    const { houseRosterInputUnavailable: _d, ...info } = body.burdenedGiftInfo as Obj;
    void _d;
    expect(has(await run({ ...body, burdenedGiftInfo: info }))).toBe(false);
  });
});

describe("다주택 중과 확인 고지 — 목록 입력 칸이 없는 화면은 계산기로 안내한다 (#25 조건)", () => {
  /** 조정대상지역 · 세대 2주택 · 증여 2021-06-01(한시 배제 전) → 명부 없이 원시 플래그로 중과 적용 */
  const SUR = { acquisitionDate: new Date("2015-03-01"), householdHousingCount: 2, isRegulatedArea: true, isOneHousehold: true } as const;
  const OLD_TAIL = "세대 보유 주택 목록에 주택을 입력하면 판정합니다";
  const find = (r: Obj) => warnings(r).find((w) => w.startsWith("세대 보유 주택 목록이 입력되지 않아"));

  it("S-1 ★ 증여 화면(표식): 이 화면에는 입력 칸이 없다는 문구 + 양도소득세 계산기(부담부증여) 안내 — «목록에 입력하면 판정» 막다른 안내가 아니다", async () => {
    const w = find(await gift("2021-06-01", SUR, { standardPrice: 800_000_000, debt: 300_000_000 }));
    expect(w).toBeDefined();
    expect(w).toContain("증여세 계산 화면에는 세대 보유 주택 목록 입력 칸이 없어");
    expect(w).toContain("양도소득세 계산기(부담부증여)");
    expect(w).not.toContain(OLD_TAIL);
  });
  it("S-2 부정 짝 — 표식이 없는 호출(목록 입력 칸이 있는 계산기)은 종전 안내 그대로", async () => {
    const body = giftBody("2021-06-01", SUR, { standardPrice: 800_000_000, debt: 300_000_000 });
    const { houseRosterInputUnavailable: _d, ...info } = body.burdenedGiftInfo as Obj;
    void _d;
    const w = find(await run({ ...body, burdenedGiftInfo: info }));
    expect(w).toBeDefined();
    expect(w).toContain(OLD_TAIL);
  });
});
