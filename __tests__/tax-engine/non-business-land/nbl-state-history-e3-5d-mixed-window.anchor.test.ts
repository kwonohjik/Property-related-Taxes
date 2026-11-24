/**
 * NBL-STATE-HISTORY-E3-⑤ E3f-3 sync-checker High-1 + Medium-1 — 혼합 창 = **합집합(각 창 자기 게이트)** · 단서 미사용 고지.
 *
 * 계획서(정정 단락): docs/01-plan/features/nbl-state-history-e3-5d-vacant-public-use.engine.plan.md «혼합 창 = 합집합»
 * 오라클: `evalDayRow`(= `meetsPeriodCriteria`)에 사업용 구간을 직접 넣은 값 + 창·과세기준일 계산은 이 파일의 독립 산식(민법 §157·§160 — `periodEndFromMonths`) — 엔진 `demolishedStatusWindow`를 거치지 않는다.
 *
 *   A  leaf — 맞닿음·겹침 = 하나로 합침(종전 바이트 동일) · 떨어짐 = 두 창 · 단서 창 게이트 · 접힘과 미사용 고지 배타
 *   B  엔진 raw → 판정·세액 — 개시일 경계 표(맞닿음 2023-09-02 → 떨어짐 2023-09-03 · 2024-04-01 · 2024-06-01) · 오라클 합집합 일치 · 철거일 2021-12 구조
 *   C  격자 — 철거일 6 × 취득 3 × 구간 끝 2 × 양도 2 × 개시 7 × 종료 4: 엔진 = 독립 오라클(판정·유효 일수) · 두 창 구조·미사용 고지 플래그
 *   D  Medium-1 — 단서 4칸을 다 답했는데 영향이 없을 때의 고지(접힘과 중복 없음)
 */
import { describe, it, expect } from "vitest";
import { evalDayRow } from "@/__tests__/tax-engine/_helpers/nbl-state-history-day-table";
import { baseTransferInput, makeMockRates } from "@/__tests__/tax-engine/_helpers/mock-rates";
import { e35Base } from "@/__tests__/tax-engine/_helpers/nbl-state-history-e3-5-table";
import { buildNblEngineInput } from "@/lib/calc/non-business-land-request";
import { periodEndFromMonths } from "@/lib/tax-engine/civil-period";
import { demolishedStatusWindow } from "@/lib/tax-engine/non-business-land/demolished-temp-status";
import { judgeNonBusinessLand } from "@/lib/tax-engine/non-business-land/engine";
import { NBL_STATE_HISTORY_BARE_DEMOLISHED_PUBLIC_USE_ACCEPTED_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { NBL_STATE_HISTORY_BARE_DEMOLISHED_PUBLIC_USE_MIXED_ACCEPTED_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { NBL_STATE_HISTORY_BARE_DEMOLISHED_PUBLIC_USE_NO_BASE_DATE_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { NBL_STATE_HISTORY_BARE_DEMOLISHED_PUBLIC_USE_UNUSED_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { bareIntervalTaxTypeText } from "@/lib/tax-engine/non-business-land/other-land-state-history";
import { DEFAULT_NON_BUSINESS_LAND_RULES } from "@/lib/tax-engine/non-business-land/types";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { addDays, parseISO } from "@/lib/tax-engine/utc-date";

const d = (s: string) => parseISO(s);
const iso = (x: Date) => x.toISOString().slice(0, 10);
const R = DEFAULT_NON_BUSINESS_LAND_RULES;
const judge = (raw: Record<string, unknown>) => judgeNonBusinessLand(buildNblEngineInput(raw as never)!, R);
const taxRaw = (raw: Record<string, unknown>) => {
  const input = buildNblEngineInput(raw as never)!;
  return calculateTransferTax(
    baseTransferInput({ propertyType: "land", transferPrice: 1_000_000_000, acquisitionPrice: 300_000_000, acquisitionDate: input.acquisitionDate, transferDate: input.transferDate, isOneHousehold: false, nonBusinessLandDetails: input }),
    makeMockRates(),
  ).calculatedTax;
};

interface Sample { acq: string; bld: string; rem: string; close: string; tr: string }
/** 주택 철거(정착면적 400) → 닫는 행(구분 변경 · 근거 철거ㆍ멸실). 기타토지 1,000㎡ 일반주거. */
function row(o: Sample, facts: Record<string, unknown>): Record<string, unknown> {
  return e35Base({
    acquisitionDate: o.acq, transferDate: o.tr, nblOtherPropertyTaxType: "comprehensive", nblOtherHasBuilding: false, nblIsMetropolitanArea: "no", nblOtherStateHistoryMode: "changed",
    nblOtherStateEvents: [
      { kind: "building_built", date: o.bld },
      { kind: "building_removed", date: o.rem, propertyTaxTypeBefore: "separate", buildingKindBefore: "house", houseFootprintBefore: "400" },
      { kind: "tax_type_changed", date: o.close, propertyTaxTypeBefore: "separate", propertyTaxBasisBefore: "demolished", ...facts },
    ],
  });
}
/** 허가 예 · 건축 외 용도 예 · 빈집정비 예 · 공용 사용 예 · 유료 예 + 기간. */
const PU = (from: string, to: string) => ({
  demolishedPermitBefore: "yes", demolishedOtherUseBefore: "yes", demolishedVacantHouseBefore: "yes", demolishedPublicUseBefore: "yes", demolishedPublicUsePaidBefore: "yes",
  demolishedPublicUseFromBefore: from, demolishedPublicUseToBefore: to,
});
const NOCLAIM = { demolishedPermitBefore: "yes", demolishedOtherUseBefore: "yes", demolishedVacantHouseBefore: "yes", demolishedPublicUseBefore: "no" };
const bareOf = (raw: Record<string, unknown>) => (judge(raw).periodEvaluation?.stateHistory?.intervals ?? []).find((x) => !x.hasBuilding && x.basis === "demolished")!;
const bTax = (acq: string, tr: string) => taxRaw(e35Base({ acquisitionDate: acq, transferDate: tr, nblOtherPropertyTaxType: "separate", nblOtherHasBuilding: true, nblOtherBuildingFloorArea: "250" }));
const nTax = (acq: string, tr: string) => taxRaw(e35Base({ acquisitionDate: acq, transferDate: tr, nblOtherPropertyTaxType: "comprehensive", nblOtherHasBuilding: false }));

// ── 독립 오라클 ──────────────────────────────────────────────────────────────

/** 과세기준일 `s`의 한시 기간(개월) — 빈집정비 «예» 주택 행: 2024.6.1.~ 36 · 그 밖 2016.6.1.~2026.5.31. 6 · 2026.6.1.~ 12. */
const monthsAt = (s: string): number => (s < "2016-06-01" ? 0 : s >= "2024-06-01" ? 36 : s < "2026-06-01" ? 6 : 12);
/** 철거일 `rem` 기준 `m`개월 한시 기간의 «만료일 + 1일»(반열린 끝). */
const expEx = (rem: string, m: number): string => iso(addDays(periodEndFromMonths(d(rem), m), 1));
const min = (...xs: string[]) => [...xs].sort()[0];

/**
 * 독립 오라클 — 과세기준일(6.1.) 중 `rem ≤ s < close` ∧ 한시 안(만료일 당일까지)인 것을 2024.6.1. 전(제한 없음 `own`)과 이후(건축 외 용도 «예» — 공용 사용 기간 안일 때만 `claim`)로 나누고,
 * 각 부분집합의 창을 따로 만들어 **합집합**을 사업용 구간으로 센다. 엔진을 거치지 않는다.
 */
function oracleBiz(s: Sample, from: string, to: string): { biz: Array<[string, string]>; own: boolean; claim: boolean; apart: boolean } {
  const own: string[] = [];
  const claim: string[] = [];
  for (let y = 2016; y <= 2028; y++) {
    const b = `${y}-06-01`;
    if (b < s.rem || b >= s.close) continue;
    const m = monthsAt(b);
    if (m === 0 || b >= expEx(s.rem, m)) continue;
    if (b < "2024-06-01") own.push(b);
    else if (from <= b && b <= to) claim.push(b);
  }
  const biz: Array<[string, string]> = [[s.bld, s.rem]];
  let aEnd = "";
  if (own.length) {
    aEnd = min(expEx(s.rem, Math.max(...own.map(monthsAt))), s.close);
    biz.push([s.rem, aEnd]);
  }
  let apart = false;
  if (claim.length) {
    const e = min(iso(addDays(d(to), 1)), expEx(s.rem, Math.max(...claim.map(monthsAt))), s.close);
    const st = from > s.rem ? from : s.rem;
    if (st < e) {
      biz.push([st, e]);
      apart = own.length > 0 && st > aEnd;
    }
  }
  return { biz, own: own.length > 0, claim: claim.length > 0, apart };
}
const oracle = (s: Sample, from: string, to: string) => {
  const o = oracleBiz(s, from, to);
  return { ...o, ...evalDayRow({ acq: s.acq, transfer: s.tr, biz: o.biz }) };
};

// ── A. leaf ──────────────────────────────────────────────────────────────────

describe("E3f-3 High-1 A — `demolishedStatusWindow`: 혼합 창 = 합집합(각 창 자기 게이트)", () => {
  const win = (facts: Parameters<typeof demolishedStatusWindow>[0]["facts"], end = "2025-01-01") =>
    demolishedStatusWindow({ removedOn: d("2023-03-01"), intervalStart: d("2023-03-01"), end: d(end), kind: "house", facts, landArea: 1000, zoneType: "general_residential" });
  const F = (from: string, to: string, over: Record<string, unknown> = {}) =>
    ({ permit: "yes", otherUse: "yes", vacantHouse: "yes", publicUse: "yes", publicPaid: "yes", publicUseFrom: d(from), publicUseTo: d(to), ...over }) as Parameters<typeof demolishedStatusWindow>[0]["facts"];
  const pair = (w: ReturnType<typeof win>) => (w.kind === "holds" ? [iso(w.window.start), iso(w.window.end), w.publicUseWindow ? iso(w.publicUseWindow.start) : null, w.publicUseWindow ? iso(w.publicUseWindow.end) : null] : w);

  it.each([
    // [이름, 개시, 종료, 주 창 시작, 주 창 끝, 단서 창 시작, 단서 창 끝] — 제한 없는 창 = [2023-03-01, 2023-09-02)
    ["겹침(개시 2023-08-01) → 하나로 합침", "2023-08-01", "2025-03-31", "2023-03-01", "2025-01-01", null, null],
    ["맞닿음(개시 2023-09-02 = 제한 없는 창 끝) → 하나로 합침", "2023-09-02", "2025-03-31", "2023-03-01", "2025-01-01", null, null],
    ["떨어짐 1일(개시 2023-09-03) → 두 창", "2023-09-03", "2025-03-31", "2023-03-01", "2023-09-02", "2023-09-03", "2025-01-01"],
    ["떨어짐(개시 2024-04-01) → 두 창", "2024-04-01", "2025-03-31", "2023-03-01", "2023-09-02", "2024-04-01", "2025-01-01"],
    ["떨어짐(개시 2024-06-01 = 최초 적용 과세기준일 당일) → 두 창", "2024-06-01", "2025-03-31", "2023-03-01", "2023-09-02", "2024-06-01", "2025-01-01"],
    ["종료일이 구간 끝보다 이르면 단서 창도 종료일 + 1일로 잘림", "2024-04-01", "2024-07-01", "2023-03-01", "2023-09-02", "2024-04-01", "2024-07-02"],
  ])("%s", (_n, from, to, s1, e1, s2, e2) => {
    expect(pair(win(F(from, to)))).toEqual([s1, e1, s2, e2]);
  });

  it("떨어진 두 창: 단서가 쓰였으므로 `publicUse` 참 · 미사용 아님 · `months` = 주 창(제한 없는 창)을 정한 6", () => {
    expect(win(F("2024-04-01", "2025-03-31"))).toMatchObject({ kind: "holds", publicUse: true, publicUseUnused: false, months: 6 });
  });

  it("단서 창 게이트: 공용 사용 기간이 2024-06-01을 덮지 못하면 단서 창을 만들지 않는다(= 제한 없는 창만) — 게이트 없이 단서 창을 만들면 개시일 이후가 사업용이 된다", () => {
    for (const [from, to] of [["2024-06-02", "2025-03-31"], ["2024-01-01", "2024-05-31"]]) {
      const w = win(F(from, to));
      expect(pair(w), `${from}~${to}`).toEqual(["2023-03-01", "2023-09-02", null, null]);
      expect(w).toMatchObject({ kind: "holds", publicUse: false, publicUseUnused: true });
    }
  });

  it("제한 없는 창 게이트: 제한 없는 시행본 과세기준일이 없으면(철거 2023-06-02 → 2023-06-01 이전) 단서 창만 — 합집합이어도 없는 창을 만들지 않는다", () => {
    const w = demolishedStatusWindow({ removedOn: d("2023-06-02"), intervalStart: d("2023-06-02"), end: d("2025-01-01"), kind: "house", facts: F("2024-04-01", "2025-03-31"), landArea: 1000, zoneType: "general_residential" });
    expect(w).toMatchObject({ kind: "holds", publicUse: true, publicUseUnused: false, months: 36 });
    expect(w.kind === "holds" && w.publicUseWindow).toBeFalsy();
    expect(w.kind === "holds" && [iso(w.window.start), iso(w.window.end)]).toEqual(["2024-04-01", "2025-01-01"]);
  });

  it("미사용 고지는 접힘과 배타 — 단서에만 기댄 구간(제한 없는 과세기준일 없음)은 접히고(`demolished_public_use_no_base_date`) 미사용 플래그는 없다", () => {
    const fold = demolishedStatusWindow({ removedOn: d("2023-06-02"), intervalStart: d("2023-06-02"), end: d("2025-01-01"), kind: "house", facts: F("2024-06-02", "2025-03-31"), landArea: 1000, zoneType: "general_residential" });
    expect(fold).toEqual({ kind: "fold", reason: "demolished_public_use_no_base_date" });
  });

  it("단서를 주장하지 않으면(공용 사용 «아니오») 미사용 플래그 없음 — 공용 사용 «예»여도 유료 «아니오»면 주장 아님", () => {
    expect(win(F("2024-04-01", "2025-03-31", { publicUse: "no" }))).toMatchObject({ kind: "holds", publicUse: false, publicUseUnused: false });
    expect(win(F("2024-04-01", "2025-03-31", { publicPaid: "no" }))).toMatchObject({ kind: "holds", publicUse: false, publicUseUnused: false });
  });
});

// ── B. 엔진 raw ─────────────────────────────────────────────────────────────

describe("E3f-3 High-1 B — 엔진 raw → 판정·세액: 개시일 경계 표 + 오라클 합집합", () => {
  const S: Sample = { acq: "2019-03-01", bld: "2019-04-01", rem: "2023-03-01", close: "2025-01-01", tr: "2027-02-01" };
  const B = bTax(S.acq, S.tr);
  const N = nTax(S.acq, S.tr);

  it("독립 B·N 세액 — 전량 사업용 215,850,000 · 전량 비사업용 275,800,000", () => {
    expect(B).toBe(215_850_000);
    expect(N).toBe(275_800_000);
  });

  // [개시일, 두 창?, 유효 사업용 일수, 비사업용?, 세액] — 종료일 2025-03-31 · 소유 2,893일
  it.each([
    ["2023-09-02", false, 2102, false, B],
    ["2023-09-03", true, 2101, false, B],
    ["2024-04-01", true, 1890, false, B],
    ["2024-06-01", true, 1829, false, B],
  ] as const)("개시 %s → 두 창 %s · 유효 %i일 · 비사업용 %s · 세액 %i (오라클 합집합 일치)", (from, apart, eff, nonBiz, tax) => {
    const raw = row(S, PU(from, "2025-03-31"));
    const j = judge(raw);
    expect(j.totalOwnershipDays).toBe(2893);
    expect(j.effectiveBusinessDays).toBe(eff);
    expect(j.isNonBusinessLand).toBe(nonBiz);
    expect(taxRaw(raw)).toBe(tax);
    const iv = bareOf(raw);
    expect(!!iv.temporaryStatusPublicUseWindow).toBe(apart);
    expect(iv.temporaryStatusPublicUse).toBe(true);
    expect(iv.temporaryStatusPublicUseUnused).toBeUndefined();
    // 독립 오라클(합집합) — 엔진 창 계산을 거치지 않는다
    const o = oracle(S, from, "2025-03-31");
    expect(o.apart).toBe(apart);
    expect(j.effectiveBusinessDays).toBe(o.effectiveBusinessDays);
    expect(!j.isNonBusinessLand).toBe(o.meets);
    // 단서가 쓰였고 제한 없는 창과 함께 성립했으므로(합쳤든 떨어졌든) 혼합 변형 수락 고지가 있다 — 단서만 기댄 구간 문구는 없다 · 미사용 고지는 없다
    expect(iv.temporaryStatusPublicUseMixed).toBe(true);
    expect(j.warnings).toContain(NBL_STATE_HISTORY_BARE_DEMOLISHED_PUBLIC_USE_MIXED_ACCEPTED_NOTICE);
    expect(j.warnings).not.toContain(NBL_STATE_HISTORY_BARE_DEMOLISHED_PUBLIC_USE_ACCEPTED_NOTICE);
    expect(j.warnings).not.toContain(NBL_STATE_HISTORY_BARE_DEMOLISHED_PUBLIC_USE_UNUSED_NOTICE);
  });

  it("개시 2024-06-02 = 2024-06-01을 못 덮음 → 단서 불성립 · 종전과 같은 1,615일 비사업용 275,800,000 + 미사용 고지(접힘 아님)", () => {
    const raw = row(S, PU("2024-06-02", "2025-03-31"));
    const j = judge(raw);
    expect(j.effectiveBusinessDays).toBe(1615);
    expect(j.isNonBusinessLand).toBe(true);
    expect(taxRaw(raw)).toBe(N);
    expect(taxRaw(raw)).toBe(taxRaw(row(S, NOCLAIM)));
    const iv = bareOf(raw);
    expect(iv.temporaryStatusPublicUse).toBeUndefined();
    expect(iv.temporaryStatusPublicUseUnused).toBe(true);
    expect(iv.basisOutcome).toBe("accepted");
    expect(j.warnings).toContain(NBL_STATE_HISTORY_BARE_DEMOLISHED_PUBLIC_USE_UNUSED_NOTICE);
    expect(j.warnings).not.toContain(NBL_STATE_HISTORY_BARE_DEMOLISHED_PUBLIC_USE_ACCEPTED_NOTICE);
    expect(j.warnings).not.toContain(NBL_STATE_HISTORY_BARE_DEMOLISHED_PUBLIC_USE_NO_BASE_DATE_NOTICE);
  });

  it("라벨: 혼합(맞닿아 합쳤든 떨어졌든)은 «한시 기간 + 한시 기간 중 공용 사용 기간» · 단서만 기댄 구간은 «한시 기간 중 공용 사용 기간만»(바이트 동일)", () => {
    const MIXED = "별도합산(나대지 — 철거·멸실 근거 · 한시 기간 + 한시 기간 중 공용 사용 기간)";
    expect(bareIntervalTaxTypeText(bareOf(row(S, PU("2024-04-01", "2025-03-31"))))).toBe(MIXED); // 떨어짐
    expect(bareIntervalTaxTypeText(bareOf(row(S, PU("2023-09-02", "2025-03-31"))))).toBe(MIXED); // 맞닿음
    expect(bareIntervalTaxTypeText(bareOf(row(S, PU("2023-08-01", "2024-07-01"))))).toBe(MIXED); // 겹침
    // 단서에만 기댄 구간(철거 2023-06-02 — 제한 없는 과세기준일 없음)
    const CLAIM_ONLY: Sample = { ...S, rem: "2023-06-02" };
    const only = bareOf(row(CLAIM_ONLY, PU("2024-04-01", "2025-03-31")));
    expect(only.temporaryStatusPublicUse).toBe(true);
    expect(only.temporaryStatusPublicUseMixed).toBeUndefined();
    expect(bareIntervalTaxTypeText(only)).toBe("별도합산(나대지 — 철거·멸실 근거 · 한시 기간 중 공용 사용 기간만)");
    // 미사용(제한 없는 창만) = 종전 «한시 기간만»
    expect(bareIntervalTaxTypeText(bareOf(row(S, PU("2024-06-02", "2025-03-31"))))).toBe("별도합산(나대지 — 철거·멸실 근거 · 한시 기간만)");
  });

  it("수락 고지(Low-B): 혼합 = 혼합 변형(한정은 단서에 기댄 부분에만) · 단서만 = 종전 문구 바이트 동일 · 미사용 = 둘 다 없음", () => {
    const only = judge(row({ ...S, rem: "2023-06-02" }, PU("2024-04-01", "2025-03-31"))).warnings;
    expect(only).toContain(NBL_STATE_HISTORY_BARE_DEMOLISHED_PUBLIC_USE_ACCEPTED_NOTICE);
    expect(only).not.toContain(NBL_STATE_HISTORY_BARE_DEMOLISHED_PUBLIC_USE_MIXED_ACCEPTED_NOTICE);
    const unused = judge(row(S, PU("2024-06-02", "2025-03-31"))).warnings;
    expect(unused).not.toContain(NBL_STATE_HISTORY_BARE_DEMOLISHED_PUBLIC_USE_ACCEPTED_NOTICE);
    expect(unused).not.toContain(NBL_STATE_HISTORY_BARE_DEMOLISHED_PUBLIC_USE_MIXED_ACCEPTED_NOTICE);
    // 문구: 혼합 변형은 한정이 «단서에 기댄 부분»에만 걸린다고 말하고, 단서만 기댄 문구(「입력한 사용 기간으로 한정해 적용했고」)와 다르다
    expect(NBL_STATE_HISTORY_BARE_DEMOLISHED_PUBLIC_USE_MIXED_ACCEPTED_NOTICE).toContain("단서에 기댄 부분은 입력한 사용 기간으로 한정해 적용");
    expect(NBL_STATE_HISTORY_BARE_DEMOLISHED_PUBLIC_USE_MIXED_ACCEPTED_NOTICE).toContain("단서와 무관하게 인정");
    expect(NBL_STATE_HISTORY_BARE_DEMOLISHED_PUBLIC_USE_MIXED_ACCEPTED_NOTICE.endsWith("확인 필요.")).toBe(true);
    expect(NBL_STATE_HISTORY_BARE_DEMOLISHED_PUBLIC_USE_ACCEPTED_NOTICE).not.toContain("단서와 무관하게");
  });

  it("echo: 두 창이 떨어지면 `temporaryStatusPublicUseWindow`가 echo에 실리고 구간표 businessDays = 두 창 합집합(오라클)", () => {
    const j = judge(row(S, PU("2024-04-01", "2025-03-31")));
    const echo = j.periodEvaluation!.stateHistory!.intervals.find((x) => x.temporaryStatusWindow)!;
    expect([iso(echo.temporaryStatusWindow!.start), iso(echo.temporaryStatusWindow!.end)]).toEqual(["2023-03-01", "2023-09-02"]);
    expect([iso(echo.temporaryStatusPublicUseWindow!.start), iso(echo.temporaryStatusPublicUseWindow!.end)]).toEqual(["2024-04-01", "2025-01-01"]);
    expect(echo.temporaryStatusMonths).toBe(6);
    // 이 구간 안 사업용 일수 = (2023-03-01~2023-09-01 = 185) + (2024-04-01~2024-12-31 = 275)
    expect(echo.businessDays).toBe(185 + 275);
  });

  it("철거일 2021-12-01 구조(제한 없는 창 [2021-12-01, 2022-06-02) · 단서 창 3년 ∩ 사용 기간)도 같다 — 취득 2014-03-01 · 양도 2026-02-01", () => {
    const S2: Sample = { acq: "2014-03-01", bld: "2014-04-01", rem: "2021-12-01", close: "2025-01-01", tr: "2026-02-01" };
    const raw = row(S2, PU("2024-04-01", "2025-03-31"));
    const j = judge(raw);
    const iv = bareOf(raw);
    expect([iso(iv.temporaryStatusWindow!.start), iso(iv.temporaryStatusWindow!.end)]).toEqual(["2021-12-01", "2022-06-02"]);
    expect([iso(iv.temporaryStatusPublicUseWindow!.start), iso(iv.temporaryStatusPublicUseWindow!.end)]).toEqual(["2024-04-01", "2024-12-02"]);
    const o = oracle(S2, "2024-04-01", "2025-03-31");
    expect(o.apart).toBe(true);
    expect(j.effectiveBusinessDays).toBe(o.effectiveBusinessDays);
    expect(!j.isNonBusinessLand).toBe(o.meets);
    expect(j.effectiveBusinessDays).toBeGreaterThan(oracle(S2, "2025-06-02", "2026-05-31").effectiveBusinessDays); // 단서 창이 더해진 값 > 제한 없는 창만
  });
});

// ── C. 격자 ──────────────────────────────────────────────────────────────────

describe("E3f-3 High-1 C — 격자: 엔진 = 독립 오라클 합집합(판정·유효 일수) · 두 창 구조 · 미사용 고지", () => {
  it("철거일 6 × 취득 3 × 구간 끝 2 × 양도 2 × 개시 7 × 종료 4 — 불일치 0", () => {
    const acqs = ["2014-03-01", "2019-03-01", "2021-03-01"];
    const rems = ["2021-12-01", "2022-03-01", "2022-05-31", "2023-03-01", "2023-05-15", "2024-03-01"];
    const closes = ["2025-01-01", "2026-01-01"];
    const transfers = ["2026-02-01", "2027-02-01"];
    const froms = ["2023-09-02", "2023-09-03", "2024-04-01", "2024-05-01", "2024-06-01", "2024-08-01", "2025-01-01"];
    const tos = ["2024-07-01", "2025-03-31", "2025-12-31", "2026-05-31"];
    const seen = { tried: 0, mixed: 0, apart: 0, unused: 0, claimOnly: 0, meetsFlip: 0, effDiff: 0, apartMis: 0, unusedMis: 0 };
    const bad: string[] = [];
    for (const acq of acqs) for (const rem of rems) for (const close of closes) for (const tr of transfers) for (const from of froms) for (const to of tos) {
      if (to < from || close > tr) continue;
      const bld = `${acq.slice(0, 4)}-04-01`;
      if (bld >= rem || acq >= bld) continue;
      const s: Sample = { acq, bld, rem, close, tr };
      const raw = row(s, PU(from, to));
      const j = judge(raw);
      const iv = (j.periodEvaluation?.stateHistory?.intervals ?? []).find((x) => !x.hasBuilding && x.basis === "demolished");
      if (!iv?.temporaryStatusWindow) continue; // 접힘(단서에만 기대고 과세기준일 없음 등) — 별도 anchor
      seen.tried++;
      const o = oracle(s, from, to);
      if (o.own && o.claim) seen.mixed++;
      if (!o.own && o.claim) seen.claimOnly++;
      if (o.apart) seen.apart++;
      if (o.own && !o.claim) seen.unused++;
      const tag = `${acq} ${rem} ${close} ${tr} ${from}~${to}`;
      if (!j.isNonBusinessLand !== o.meets) { seen.meetsFlip++; bad.push(`meets ${tag}`); }
      if (j.effectiveBusinessDays !== o.effectiveBusinessDays) { seen.effDiff++; bad.push(`eff ${tag} eng=${j.effectiveBusinessDays} oracle=${o.effectiveBusinessDays}`); }
      if (!!iv.temporaryStatusPublicUseWindow !== o.apart) { seen.apartMis++; bad.push(`apart ${tag}`); }
      if (!!iv.temporaryStatusPublicUseUnused !== (o.own && !o.claim)) { seen.unusedMis++; bad.push(`unused ${tag}`); }
    }
    expect(bad.slice(0, 5)).toEqual([]);
    expect(seen.meetsFlip + seen.effDiff + seen.apartMis + seen.unusedMis).toBe(0);
    // 공허 방지 — 격자가 합집합·떨어짐·미사용·단서만 기댄 4구조를 모두 지난다
    expect(seen.mixed).toBeGreaterThan(500);
    expect(seen.apart).toBeGreaterThan(300);
    expect(seen.unused).toBeGreaterThan(50);
    expect(seen.claimOnly).toBeGreaterThan(20);
  }, 120_000);
});

// ── D. Medium-1 ──────────────────────────────────────────────────────────────

describe("E3f-3 Medium-1 — 단서 4칸을 다 답했는데 결과에 영향이 없으면 고지(접힘 사유와 중복 없음)", () => {
  // 철거 2023-03-01 · 공용 사용 2025-01-01~2026-12-01 · 구간 끝 2024-09-01 · 양도 2024-12-01 — 공용 사용 기간이 구간 밖이라 어떤 과세기준일도 덮지 못한다. 제한 없는 창(2023-06-01)은 성립.
  const S: Sample = { acq: "2019-03-01", bld: "2019-04-01", rem: "2023-03-01", close: "2024-09-01", tr: "2024-12-01" };

  it("제한 없는 창으로 성립 + 단서 미반영 → 미사용 고지가 경고에 실린다 · 판정·세액은 단서 «아니오»와 같다 · 단서 적용 고지는 없다", () => {
    const raw = row(S, PU("2025-01-01", "2026-12-01"));
    const j = judge(raw);
    expect(j.warnings).toContain(NBL_STATE_HISTORY_BARE_DEMOLISHED_PUBLIC_USE_UNUSED_NOTICE);
    expect(j.warnings).not.toContain(NBL_STATE_HISTORY_BARE_DEMOLISHED_PUBLIC_USE_ACCEPTED_NOTICE);
    expect(j.warnings).not.toContain(NBL_STATE_HISTORY_BARE_DEMOLISHED_PUBLIC_USE_NO_BASE_DATE_NOTICE);
    const noClaim = judge(row(S, NOCLAIM));
    expect(j.effectiveBusinessDays).toBe(noClaim.effectiveBusinessDays);
    expect(j.isNonBusinessLand).toBe(noClaim.isNonBusinessLand);
    expect(taxRaw(raw)).toBe(taxRaw(row(S, NOCLAIM)));
    expect(noClaim.warnings).not.toContain(NBL_STATE_HISTORY_BARE_DEMOLISHED_PUBLIC_USE_UNUSED_NOTICE);
    const o = oracle(S, "2025-01-01", "2026-12-01");
    expect(o.claim).toBe(false);
    expect(j.effectiveBusinessDays).toBe(o.effectiveBusinessDays);
  });

  it("고지 문구: 확인 필요로 끝나고 과세기준일(6.1.)·단서 불반영을 말한다 · 접힘 고지와 다른 문장", () => {
    expect(NBL_STATE_HISTORY_BARE_DEMOLISHED_PUBLIC_USE_UNUSED_NOTICE.endsWith("확인 필요.")).toBe(true);
    expect(NBL_STATE_HISTORY_BARE_DEMOLISHED_PUBLIC_USE_UNUSED_NOTICE).toContain("과세기준일(6.1.)");
    expect(NBL_STATE_HISTORY_BARE_DEMOLISHED_PUBLIC_USE_UNUSED_NOTICE).not.toBe(NBL_STATE_HISTORY_BARE_DEMOLISHED_PUBLIC_USE_NO_BASE_DATE_NOTICE);
  });

  it("단서만 기댄 구간(제한 없는 과세기준일 없음)은 접힘 고지만 — 미사용 고지 없음(중복 없음)", () => {
    const S3: Sample = { acq: "2019-03-01", bld: "2019-04-01", rem: "2023-06-02", close: "2025-01-01", tr: "2027-02-01" };
    const j = judge(row(S3, PU("2024-06-02", "2025-03-31")));
    expect(j.warnings).toContain(NBL_STATE_HISTORY_BARE_DEMOLISHED_PUBLIC_USE_NO_BASE_DATE_NOTICE);
    expect(j.warnings).not.toContain(NBL_STATE_HISTORY_BARE_DEMOLISHED_PUBLIC_USE_UNUSED_NOTICE);
  });

  it("단서가 쓰인 구간(공용 사용이 과세기준일을 덮음)은 미사용 고지 없음", () => {
    const j = judge(row({ ...S, close: "2025-01-01", tr: "2027-02-01" }, PU("2024-04-01", "2025-03-31")));
    expect(j.warnings).not.toContain(NBL_STATE_HISTORY_BARE_DEMOLISHED_PUBLIC_USE_UNUSED_NOTICE);
    expect(j.warnings).toContain(NBL_STATE_HISTORY_BARE_DEMOLISHED_PUBLIC_USE_MIXED_ACCEPTED_NOTICE); // 제한 없는 창(2023-06-01)도 성립하는 혼합 구간
  });
});
