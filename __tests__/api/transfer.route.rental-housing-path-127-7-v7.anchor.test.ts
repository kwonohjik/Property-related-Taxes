/**
 * route anchor — 거주주택 특례(소령 §155⑳) 경로에서 «반영되지 않는» §97의3·§97의4 선택이 §127⑦로 다른 감면을 막는 위양성 (V-7).
 * 계획서 docs/00-pm/rental-97-v7-residence-path.plan.md (Q-1 a · Q-2 a · Q-3 a).
 *
 * 고정하는 것
 *  1) Q-1 a — 차단 기준은 «선언»이 아니라 현행(⑧·⑫ 선택 사실)이다. 선언했으나 불성립(거주 0개월)인 입력이 일반 경로에서
 *     §97의3 + §99의3을 이중 적용하는 것을 ⑧·⑫가 막는다 — 선언만으로 풀면 이 입력이 샌다(U2).
 *  2) Q-2 a — 선언이 실리는 첫 «주택» 자산이고 충돌 쌍에 §97의3/4가 있으면 ⑧·⑫ 400 문구 끝에 같은 경로 안내를 붙인다.
 * 세율표는 route 폴백이다. 시료: 취득 2002-09-01 · 양도 2025-08-01 · 양도가 2,000,000,000 · 취득가 400,000,000(실지) · 임대주택 1호(시나리오 A).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { preloadTaxRates, loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { createDefaultTransferFormData, type AssetForm, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset, makeDefaultRentalUnit } from "@/lib/stores/calc-wizard-asset-factory";
import { getReductionDefault } from "@/components/calc/transfer/UnifiedReductionPanel-defaults";
import { validateStep2Reductions } from "@/lib/calc/transfer-tax-validate-reductions";
import { findTrack127_7Conflict } from "@/lib/tax-engine/transfer-reductions/income-deduction-router";
import { rentalHousingPathApplies, rentalHousingPathNotice, track127_7ConflictMessage } from "@/lib/tax-engine/transfer-reductions/track-127-7-message";
import { POST } from "@/app/api/calc/transfer/route";
import { captureBody } from "../calc/_one-house-pr3a-calc-route";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/rate-limit")>();
  return { ...actual, checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }) };
});
beforeEach(() => {
  vi.mocked(preloadTaxRates).mockImplementation(async (_t, date) => loadFallbackTransferRates(date) as never);
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const CONFLICT_RE = /조특법 §127⑦ 중복배제/;
const NOTICE_RE = /참고: 장기임대주택 거주주택 비과세 특례\(소득세법 시행령 §155⑳\)를 선언한 계산입니다\./;

const rentalCommon = {
  registrationDate: "2014-01-01", rentalStartDate: "2014-01-01", isTaxRegistered: true, taxRegistrationDate: "2014-01-01",
  rentIncreaseViolationMode: "none", rentalContinuesToTransfer: true, hasVacancyOverGrace: false,
  officialPriceAtStart: "300,000,000", isNationalHousingScale: true,
};
const r973 = () => ({ ...getReductionDefault("rental_97_3"), ...rentalCommon, stdPriceAtAcquisition: "100,000,000", stdPriceAtTransfer: "400,000,000" });
const r974 = () => ({ ...getReductionDefault("rental_97_4"), ...rentalCommon, rental974Category: "purchase_a", region: "capital" });
// §99의3 — 계약 2002-05-01(법률 제6762호 부칙 §29① 적용 시료 — nh37 anchor와 같은 시료), 주택 유형을 명시한다(픽스처 기본값이 게이트를 가리지 않게)
const r99_3 = () => ({
  ...getReductionDefault("new_99_3"), acquisitionType993: "from_builder", contractDate993: "2002-05-01", exclusiveAreaSqm993: "84",
  houseType993: "apartment", firstContract993: "yes", region993: "outside_speculation",
  standardPriceAtAcquisition993: "100,000,000", standardPriceAt5Years: "150,000,000", standardPriceAtTransfer993: "400,000,000",
});
const r77 = () => ({ ...getReductionDefault("public_expropriation" as never), expropriationCash: "500,000,000", expropriationApprovalDate: "2023-01-01" });

/** months = 주택 거주 개월(60 → 특례 성립, 0 → 선언했으나 불성립), declare=false → 선언 끔(일반 경로) */
function mk(reds: unknown[], over: { months?: string; declare?: boolean } = {}): TransferFormData {
  const f = createDefaultTransferFormData() as Any;
  const a = Object.assign({ ...makeDefaultAsset(1) }, {
    assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2002-09-01",
    actualSalePrice: "2,000,000,000", fixedAcquisitionPrice: "400,000,000", standardPriceAtAcq: "100,000,000", standardPriceAtTransfer: "400,000,000",
    assetContractDate: "", reductions: reds,
  }) as Any;
  if (over.declare !== false) {
    a.residenceInputMode = "direct";
    a.residencePeriodMonthsAsset = over.months ?? "60";
    a.rentalHousingException = {
      ...a.rentalHousingException, applyException: true, scenario: "A",
      rentalUnits: [{
        ...makeDefaultRentalUnit(), businessRegistrationDate: "2015-06-01", rentalRegistrationDate: "2015-06-01",
        standardPriceAtRentalStart: "250,000,000", rentalInputMode: "direct", rentalMonths: "120", requirementsConfirmed: true,
      }],
    };
  }
  f.assets = [a as AssetForm];
  return Object.assign(f, {
    transferDate: "2025-08-01", contractTotalPrice: "2,000,000,000", isOneHousehold: true, householdHousingCount: "1", residencePeriodMonths: over.months ?? "60",
  }) as TransferFormData;
}
async function post(f: TransferFormData) {
  const body = await captureBody(f);
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST", headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" }, body: JSON.stringify(body),
  }));
  const j = (await res.json()) as Any;
  const result = j.data?.result ?? j.data ?? {};
  return {
    status: res.status, errors: Object.values((j.error?.fieldErrors ?? {}) as Record<string, string[]>).flat(),
    total: result.totalTax as number | undefined, rheApplied: result.rentalHousingExceptionDetail?.applied as boolean | undefined,
    notReflected: ((result.steps ?? []) as Array<{ label: string; formula: string }>).filter((s) => /반영되지 않았습니다/.test(s.formula)).length,
  };
}
const step8 = (f: TransferFormData) => validateStep2Reductions(2, f)?.message;

describe("전제 — 거주주택 경로 단독 값 (Q-1 a의 대조)", () => {
  it("감면 없음 84,029,000 · §99의3 단독 69,436,998 · §77 단독 73,716,350 — 특례 성립(applied)", async () => {
    const r0 = await post(mk([]));
    const r1 = await post(mk([r99_3()]));
    const r2 = await post(mk([r77()]));
    for (const r of [r0, r1, r2]) { expect(r.status).toBe(200); expect(r.rheApplied).toBe(true); }
    expect(r0.total).toBe(84_029_000);
    expect(r1.total).toBe(69_436_998);
    expect(r2.total).toBe(73_716_350);
  });
  it("§97의3 단독은 세액에 반영되지 않는다 — 감면 없음과 같은 84,029,000 + «반영되지 않았습니다» 고지", async () => {
    const r3 = await post(mk([r973()]));
    expect(r3.status).toBe(200);
    expect(r3.total).toBe(84_029_000);
    expect(r3.notReflected).toBeGreaterThan(0);
  });
});

describe("Q-1 a — 위양성은 현행 그대로 400이다 (⑧↔⑫ 문구 일치) · 안내 문구가 붙는다 (Q-2 a)", () => {
  const CASES: Array<[string, () => unknown[]]> = [
    ["§97의3 + §99의3", () => [r973(), r99_3()]],
    ["§99의3 + §97의3", () => [r99_3(), r973()]],
    ["§97의4 + §99의3", () => [r974(), r99_3()]],
    ["§97의3 + §77", () => [r973(), r77()]],
    ["§97의4 + §77", () => [r974(), r77()]],
  ];
  it.each(CASES)("%s — ⑧이 §127⑦로 막고 ⑫도 같은 문구로 400이며 둘 다 거주주택 경로 안내를 붙인다", async (_n, mkReds) => {
    const f = mk(mkReds());
    const m8 = step8(f) ?? "";
    expect(m8, "전제: ⑧이 막는다").toMatch(CONFLICT_RE);
    expect(m8).toMatch(NOTICE_RE);
    const r = await post(f);
    expect(r.status).toBe(400);
    expect(r.errors).toContain(m8);
  });
  it("안내는 «해제하면 다른 감면이 계산된다»는 방향을 말한다 — 성립하지 않으면 일반 경로에서 반영된다는 단서 포함", () => {
    const m8 = step8(mk([r973(), r99_3()])) ?? "";
    expect(m8).toContain("이 특례가 성립하면 이 경로는 §97의3·§97의4를 세액에 반영하지 않으므로");
    expect(m8).toContain("성립하지 않으면 일반 경로에서 반영됩니다");
    expect(m8).toContain("해제하고 다른 감면만 선택하면 그 감면이 계산됩니다");
  });
  it("U2 — 선언했으나 불성립(거주 0개월)이어도 ⑧·⑫는 막는다 (선언만으로 풀면 §97의3 + §99의3 이중 적용이 샌다)", async () => {
    const f = mk([r973(), r99_3()], { months: "0" });
    const m8 = step8(f) ?? "";
    expect(m8).toMatch(CONFLICT_RE);
    expect(m8).toMatch(NOTICE_RE); // 안내는 선언 기준이라 불성립이어도 붙는다 — 문구가 «성립하지 않으면 일반 경로에서 반영»을 말한다
    const r = await post(f);
    expect(r.status).toBe(400);
    expect(r.errors).toContain(m8);
  });
  it("U0 — 같은 폼에서 거주 0개월은 일반 경로(applied=false)다: 이 입력의 요청 본문 차이는 거주 개월 수뿐", async () => {
    const r = await post(mk([], { months: "0" }));
    expect(r.status).toBe(200);
    expect(r.rheApplied).toBe(false);
  });
});

describe("Q-2 a — 안내가 붙지 않는 경우", () => {
  it("선언을 끈 일반 경로(N4) — 같은 충돌이어도 안내 없음, ⑧↔⑫ 일치", async () => {
    const f = mk([r973(), r99_3()], { declare: false });
    const m8 = step8(f) ?? "";
    expect(m8).toMatch(CONFLICT_RE);
    expect(m8).not.toMatch(NOTICE_RE);
    const r = await post(f);
    expect(r.status).toBe(400);
    expect(r.errors).toContain(m8);
  });
  it("충돌 쌍에 §97의3/4가 없으면 안내 없음 — §99의3 + §77", async () => {
    const f = mk([r99_3(), r77()]);
    const m8 = step8(f) ?? "";
    expect(m8).toMatch(CONFLICT_RE);
    expect(m8).not.toMatch(NOTICE_RE);
    const r = await post(f);
    expect(r.errors).toContain(m8);
  });
  it("명문 배제 쌍(§97의3 + §97의4)은 문구가 그대로다 — 거주주택 경로 안내와 무관", async () => {
    const f = mk([r973(), r974()]);
    const m8 = step8(f) ?? "";
    expect(m8).toMatch(/\(조특법 §97의3②\)/);
    expect(m8).not.toMatch(NOTICE_RE);
    const r = await post(f);
    expect(r.errors).toContain(m8);
  });
  it("단독 선택은 막지 않고 안내도 없다", () => {
    expect(step8(mk([r973()])) ?? "").not.toMatch(CONFLICT_RE);
  });
});

describe("술어 · 문구 단위", () => {
  it("rentalHousingPathApplies — 첫 자산 · housing · 선언 payload가 실릴 때만", () => {
    expect(rentalHousingPathApplies({ assetIndex: 0, assetKind: "housing", declared: true })).toBe(true);
    expect(rentalHousingPathApplies({ assetIndex: 1, assetKind: "housing", declared: true })).toBe(false); // 컴패니언은 ④가 선언을 안 싣는다
    expect(rentalHousingPathApplies({ assetIndex: 0, assetKind: "redevelopment_apt", declared: true })).toBe(false); // 완공 아파트는 §97의3이 반영된다(계획서 §3.5)
    expect(rentalHousingPathApplies({ assetIndex: 0, assetKind: "land", declared: true })).toBe(false);
    expect(rentalHousingPathApplies({ assetIndex: 0, assetKind: "housing", declared: false })).toBe(false);
    expect(rentalHousingPathApplies({ assetIndex: 0, assetKind: undefined, declared: true })).toBe(false);
  });
  it("rentalHousingPathNotice — 경로가 아니거나 쌍에 §97의3/4가 없으면 null", () => {
    const withLthd = findTrack127_7Conflict(["rental_97_3", "new_99_3"], false)!;
    const without = findTrack127_7Conflict(["new_99_3", "public_expropriation"], false)!;
    expect(withLthd && without).toBeTruthy();
    expect(rentalHousingPathNotice(withLthd, true)).toMatch(NOTICE_RE);
    expect(rentalHousingPathNotice(withLthd, false)).toBeNull();
    expect(rentalHousingPathNotice(withLthd, undefined)).toBeNull();
    expect(rentalHousingPathNotice(without, true)).toBeNull();
  });
  it("track127_7ConflictMessage — 옵션이 없으면 종전 문구 그대로(안내 없음), 있으면 끝에 안내가 붙는다", () => {
    const c = findTrack127_7Conflict(["rental_97_4", "public_expropriation"], false)!;
    const base = track127_7ConflictMessage(c);
    expect(base).not.toMatch(NOTICE_RE);
    expect(track127_7ConflictMessage(c, { rentalHousingPath: false })).toBe(base);
    const withNotice = track127_7ConflictMessage(c, { rentalHousingPath: true });
    expect(withNotice.startsWith(base)).toBe(true);
    expect(withNotice).toMatch(NOTICE_RE);
  });
  it("refine — 옵션을 넘기면 안내, 생략(컴패니언)하면 안내 없음", async () => {
    const { refineReductionTrack127_7 } = await import("@/lib/api/transfer-tax-schema-reduction-refines");
    const run = (opts?: { rentalHousingPath?: boolean }) => {
      const issues: { message: string }[] = [];
      refineReductionTrack127_7([{ type: "rental_97_3" }, { type: "new_99_3" }], "2002-09-01", "2025-08-01", { addIssue: (i: { message: string }) => issues.push(i) } as never, ["reductions"], opts);
      return issues;
    };
    expect(run({ rentalHousingPath: true })[0].message).toMatch(NOTICE_RE);
    expect(run({ rentalHousingPath: false })[0].message).not.toMatch(NOTICE_RE);
    expect(run()[0].message).not.toMatch(NOTICE_RE);
  });
});
