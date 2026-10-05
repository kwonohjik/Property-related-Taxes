/**
 * anchor (L-1) — 「~이내」 기한(계획서 §1 유형 B)의 말일이 토요일·공휴일이면 **익일로 만료**한다.
 *
 * 법령·해석(2026-09-28 실독):
 * - 국세기본법 §4 「이 법 또는 세법에서 규정하는 기간의 계산은 이 법 또는 그 세법에 특별한 규정이 있는 것을
 *   제외하고는 「민법」에 따른다.」 (MST 288571)
 * - 민법 §161 「기간의 말일이 토요일 또는 공휴일에 해당한 때에는 기간은 그 익일로 만료한다.」
 *   (2007.12.21. 법률 제8720호로 토요일 추가 — 같은 날 시행)
 * - 사전-2021-법령해석재산-1190(법령해석과-3656, 2021.10.21.) — 요지 「조정대상지역 일시적 2주택 비과세특례가
 *   적용되는 소득령§155①(2)의 종료일이 공휴일인 경우 그 다음날에 종료하는 것으로 봄」. 신규주택 기존 임차인의
 *   임대차 종료일 2021.10.11.이 한글날 대체공휴일 → 「임대차계약 종료일의 다음 날까지」 요건 충족.
 *   (taxlaw.nts.go.kr 원문)
 * - 조심2011중1228(2011.7.29., 합동회의) · 수원지법 2008구합11410 — 국세기본법 §4(§5 아님)로 민법 §161 적용.
 *
 * ⚠️ A 유형(「~이 지난 후」)에는 적용하지 않는다 — 충족일이 늦어지는 방향이라 선례 없이 쓰지 않는다(계획서 §9.7).
 *
 * 날짜 축: 2024-06-01(토) → 월 06-03 이내 · 화 06-04 초과. 2024 추석 09-16~18(월~수, 앞 주말 포함).
 */
import { describe, it, expect } from "vitest";
import {
  deadlineEnd,
  deadlineEndFrom,
  deadlineEndNote,
  isWithinDeadline,
  firstDayAfterPeriod,
  isAfterPeriod,
  CIVIL_161_SATURDAY_START,
} from "@/lib/tax-engine/civil-period";
import {
  PUBLIC_HOLIDAYS_KR,
  PUBLIC_HOLIDAY_LONGEST_RUN_DAYS,
  PUBLIC_HOLIDAY_TABLE_FIRST_YEAR,
  PUBLIC_HOLIDAY_TABLE_LAST_YEAR,
  PUBLIC_HOLIDAY_TABLE_OFFICIAL_LAST_YEAR,
} from "@/lib/tax-engine/data/public-holidays-kr";
import { checkExemption } from "@/lib/tax-engine/transfer-tax-exemption";
import { parseRatesFromMap } from "@/lib/tax-engine/transfer-tax-helpers";
import {
  qualifiesRuralHouse,
  qualifiesUnavoidableOutsideCapital,
  resolveExemptionProviso,
  resolveMergeDeeming,
} from "@/lib/tax-engine/transfer-tax-exemption-requirements";
import { isRightThreeYearExceeded, resolveArticle89Clause2 } from "@/lib/tax-engine/transfer-tax-89-2-exclusion";
import { resolveOneRightExemptionClause } from "@/lib/tax-engine/transfer-tax-redevelopment-transforms";
import { judgeTemporaryTwoHouseTiming } from "@/lib/tax-engine/transfer-tax-temporary-two-house-timing";
import { resolveTemporaryTwoHouseDeadlineEra } from "@/lib/tax-engine/data/temporary-two-house-deadline-era";
import { judgeTempTwoHouseFromForm } from "@/lib/calc/transfer-temp-two-house-judge";
import type { OneHouseJudgeInput } from "@/lib/tax-engine/one-house/types";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const rules = parseRatesFromMap(makeMockRates()).oneHouseSpecialRules;
const D = (s: string) => new Date(s);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const input = (over: Partial<TransferTaxInput>) => baseTransferInput(over);
const judge = (over: Partial<TransferTaxInput>) =>
  checkExemption(input(over) as OneHouseJudgeInput, rules, D("2021-01-01"));

/** 역상 말일(토) · 연장 말일(월) · 초과(화) */
const SAT = "2024-06-01";
const MON = "2024-06-03";
const TUE = "2024-06-04";

describe("민법 §161 헬퍼 — 토요일·공휴일·대체공휴일·표 밖", () => {
  it("토요일 말일 → 다음 월요일(월요일이 공휴일 아님)", () => {
    const d = deadlineEnd(D(SAT));
    expect([iso(d.end), d.extended, d.holidayTableUncovered]).toEqual([MON, true, false]);
  });
  it("평일 말일 → 그대로(부정 짝)", () => {
    const d = deadlineEnd(D(TUE));
    expect([iso(d.end), d.extended]).toEqual([TUE, false]);
  });
  it("추석 연휴 — 2024-09-14(토)~09-18(수) 어느 날이 말일이든 → 09-19(목)", () => {
    for (const s of ["2024-09-14", "2024-09-15", "2024-09-16", "2024-09-17", "2024-09-18"]) {
      expect(iso(deadlineEnd(D(s)).end), s).toBe("2024-09-19");
    }
    expect(iso(deadlineEnd(D("2024-09-13")).end)).toBe("2024-09-13");
  });
  it("대체공휴일 — 2021-10-09(토 한글날)·10-11(월 대체공휴일) → 10-12(화)", () => {
    expect(iso(deadlineEnd(D("2021-10-09")).end)).toBe("2021-10-12");
    expect(iso(deadlineEnd(D("2021-10-11")).end)).toBe("2021-10-12");
  });
  it("2026 개정 — 노동절(2026-05-01 금) → 05-04 · 제헌절(2026-07-17 금) → 07-20", () => {
    expect(iso(deadlineEnd(D("2026-05-01")).end)).toBe("2026-05-04");
    expect(iso(deadlineEnd(D("2026-07-17")).end)).toBe("2026-07-20");
  });
  it("예정 공휴일(2028~2035) — 연장하고 「예정」으로 표시: 설·추석+개천절·선거일·대체공휴일", () => {
    const flags = (s: string) => {
      const d = deadlineEnd(D(s));
      return [iso(d.end), d.extended, d.holidayTableUncovered, d.holidayTableProvisional];
    };
    // 2028 설 01-26(수)~28(금) + 주말 → 01-31(월)
    expect(flags("2028-01-26")).toEqual(["2028-01-31", true, false, true]);
    // 2028 추석 10-02~04 · 10-03 개천절 겹침(평일) → 대체 10-05(목) → 10-06(금)
    expect(flags("2028-10-03")).toEqual(["2028-10-06", true, false, true]);
    // 임기만료 선거일(10의2호) — 제23대 국회의원 2028-04-12 · 제10회 지방 2030-06-12(§34② 현충일 다음 주)
    expect(flags("2028-04-12")).toEqual(["2028-04-13", true, false, true]);
    expect(flags("2030-06-12")).toEqual(["2030-06-13", true, false, true]);
    // 대체공휴일 — 2029-05-05(토 어린이날) → 05-07(월 대체) → 05-08 · 2035 추석 09-16(일) → 09-18(화 대체) → 09-19
    expect(flags("2029-05-05")).toEqual(["2029-05-08", true, false, true]);
    expect(flags("2035-09-15")).toEqual(["2035-09-19", true, false, true]);
    // 연장 없는 평일 말일도 예정 표시(부정 짝: 연장 X)
    const wk = deadlineEnd(D("2028-03-15"));
    expect([iso(wk.end), wk.extended, wk.holidayTableProvisional]).toEqual(["2028-03-15", false, true]);
    expect(deadlineEndNote(wk)).toContain("예정 공휴일");
    expect(deadlineEndNote(deadlineEnd(D("2028-01-26")))).toContain("기한이 2028-01-31까지 늘어났습니다");
  });
  it("표 밖(2036) — 토·일만 반영하고 표시한다: 06-07(토) → 06-09 · 10-03(금 개천절) → 그대로", () => {
    const sat = deadlineEnd(D("2036-06-07"));
    expect([iso(sat.end), sat.extended, sat.holidayTableUncovered, sat.holidayTableProvisional]).toEqual([
      "2036-06-09", true, true, false,
    ]);
    const wk = deadlineEnd(D("2036-10-03"));
    expect([iso(wk.end), wk.extended, wk.holidayTableUncovered]).toEqual(["2036-10-03", false, true]);
    expect(deadlineEndNote(wk)).toContain("토·일요일만");
  });
  it("공식 표 끝(2027-12-31 금) — 고지 없음 · 예정 표 끝(2035-12-29 토 → 12-31 월) — 예정, 표 밖 아님", () => {
    const last = deadlineEnd(D("2027-12-31"));
    expect([last.holidayTableUncovered, last.holidayTableProvisional, deadlineEndNote(last)]).toEqual([false, false, undefined]);
    // 2027-12-25(토 기독탄신일)·26(일)·27(월 대체) → 28(화) — 표 안
    expect(iso(deadlineEnd(D("2027-12-25")).end)).toBe("2027-12-28");
    const end35 = deadlineEnd(D("2035-12-29"));
    expect([iso(end35.end), end35.holidayTableUncovered, end35.holidayTableProvisional]).toEqual(["2035-12-31", false, true]);
  });
  it("토요일 연장은 2007-12-21 시행분부터 — 2007-12-15(토)는 그대로, 일요일은 연장", () => {
    expect(iso(CIVIL_161_SATURDAY_START)).toBe("2007-12-21");
    expect(iso(deadlineEnd(D("2007-12-15")).end)).toBe("2007-12-15");
    expect(iso(deadlineEnd(D("2007-12-16")).end)).toBe("2007-12-17");
  });
  it("deadlineEndFrom · isWithinDeadline — ±1일", () => {
    expect(iso(deadlineEndFrom(D("2021-06-01"), 3).calendarEnd)).toBe(SAT);
    expect(isWithinDeadline(D("2021-06-01"), 3, D(MON))).toBe(true);
    expect(isWithinDeadline(D("2021-06-01"), 3, D(TUE))).toBe(false);
  });
  it("A 유형(「~이 지난 후」)은 연장하지 않는다 — 1년 만료 2024-06-01(토) → 최초 충족일 06-02(일)", () => {
    expect(iso(firstDayAfterPeriod(D("2023-06-01"), 1))).toBe("2024-06-02");
    expect(isAfterPeriod(D("2023-06-01"), 1, D("2024-06-02"))).toBe(true);
    expect(isAfterPeriod(D("2023-06-01"), 1, D(SAT))).toBe(false);
  });
});

describe("공휴일 표 — 범위·월력요항 대조", () => {
  it("모든 키가 표 범위 안이다", () => {
    for (const k of Object.keys(PUBLIC_HOLIDAYS_KR)) {
      const y = Number(k.slice(0, 4));
      expect(y >= PUBLIC_HOLIDAY_TABLE_FIRST_YEAR && y <= PUBLIC_HOLIDAY_TABLE_LAST_YEAR, k).toBe(true);
    }
  });
  it("2027 — 우주항공청공고 제2026-0078호(2027년 월력요항) 「관공서의 공휴일」 표와 같다(일요일 제외 비교)", () => {
    const official = [
      "2027-01-01", "2027-02-06", "2027-02-07", "2027-02-08", "2027-02-09", "2027-03-01", "2027-05-01",
      "2027-05-03", "2027-05-05", "2027-05-13", "2027-06-06", "2027-07-17", "2027-07-19", "2027-08-15",
      "2027-08-16", "2027-09-14", "2027-09-15", "2027-09-16", "2027-10-03", "2027-10-04", "2027-10-09",
      "2027-10-11", "2027-12-25", "2027-12-27",
    ];
    const ours = Object.keys(PUBLIC_HOLIDAYS_KR).filter((k) => k.startsWith("2027-"));
    expect(ours).toEqual(official);
  });
  it("2028~2035 예정분 — 대체공휴일·임기만료 선거일(현행 규정 §3 · 공직선거법 §34 계산값 고정)", () => {
    const pick = (re: RegExp) =>
      Object.entries(PUBLIC_HOLIDAYS_KR)
        .filter(([k, v]) => Number(k.slice(0, 4)) > PUBLIC_HOLIDAY_TABLE_OFFICIAL_LAST_YEAR && re.test(v))
        .map(([k]) => k);
    expect(PUBLIC_HOLIDAY_TABLE_OFFICIAL_LAST_YEAR).toBe(2027);
    expect(PUBLIC_HOLIDAY_TABLE_LAST_YEAR).toBe(2035);
    expect(pick(/^대체공휴일/)).toEqual([
      "2028-10-05", "2029-05-07", "2029-05-21", "2029-09-24", "2030-02-05", "2030-05-06", "2031-03-03",
      "2032-05-03", "2032-05-17", "2032-07-19", "2032-08-16", "2032-09-21", "2032-10-04", "2032-10-11",
      "2032-12-27", "2033-02-02", "2033-05-02", "2033-07-18", "2033-10-10", "2033-12-26", "2034-02-21",
      "2035-05-07", "2035-09-18",
    ]);
    expect(pick(/선거/)).toEqual(["2028-04-12", "2030-03-27", "2030-06-12", "2032-04-14", "2034-05-31", "2035-03-28"]);
    expect(pick(/임시공휴일/)).toEqual([]);
  });
  it("표 안 최장 연속 휴무(토·일·공휴일)는 10일(2017-09-30~10-09) — 머리 주석의 범위 근거", () => {
    let best = 0;
    let start = "";
    let run = 0;
    let runStart = "";
    for (let t = Date.UTC(PUBLIC_HOLIDAY_TABLE_FIRST_YEAR, 0, 1); t <= Date.UTC(PUBLIC_HOLIDAY_TABLE_LAST_YEAR, 11, 31); t += 86_400_000) {
      const d = new Date(t);
      const off = d.getUTCDay() === 0 || d.getUTCDay() === 6 || PUBLIC_HOLIDAYS_KR[iso(d)] !== undefined;
      if (!off) {
        run = 0;
        continue;
      }
      if (run === 0) runStart = iso(d);
      run += 1;
      if (run > best) [best, start] = [run, runStart];
    }
    expect([best, start]).toEqual([PUBLIC_HOLIDAY_LONGEST_RUN_DAYS, "2017-09-30"]);
    expect(best).toBe(10);
  });
});

describe("§155① 요건 B — 처분기한 말일 토요일", () => {
  const tt = (transferDate: string): Partial<TransferTaxInput> => ({
    householdHousingCount: 2,
    acquisitionDate: D("2018-01-01"),
    transferDate: D(transferDate),
    residencePeriodMonths: 0,
    temporaryTwoHouse: {
      previousAcquisitionDate: D("2018-01-01"),
      newAcquisitionDate: D("2021-06-01"),
    } as TransferTaxInput["temporaryTwoHouse"],
  });

  it("🔴 월요일 양도 → 비과세 · 화요일 → 과세", () => {
    expect(judge(tt(MON)).isExempt).toBe(true);
    expect(judge(tt(TUE)).isExempt).toBe(false);
  });
  it("pending 기한은 연장된 월요일 + 짧은 설명", () => {
    const p = judge(tt(TUE)).pending.find((x) => x.id === "155-1-disposal-deadline");
    expect(p && iso(p.deadline)).toBe(MON);
    expect(p?.deadlineNote).toContain("민법 §161");
  });
  it("UI 판정 카드 — 처분기한 월요일 · 충족 · 설명", () => {
    const v = judgeTempTwoHouseFromForm({
      previousAcquisitionDate: "2018-01-01",
      newHouseAcquisitionDate: "2021-06-01",
      transferDate: MON,
      provisoReason: "",
      provisoDepartureDate: "",
      provisoExpropriationDate: "",
      provisoBusinessApprovalDate: "",
      residencePeriodMonths: "0",
    });
    if (v.status === "pending") throw new Error("pending");
    expect([iso(v.deadline), v.threeYearMet]).toEqual([MON, true]);
    expect(v.deadlineNote).toContain("2024-06-01");
  });
  it("추석 — 신규 취득 2021-09-16 → 말일 2024-09-16(추석 전날) → 09-19까지", () => {
    const t = (d: string) =>
      judgeTemporaryTwoHouseTiming({
        previousAcquisitionDate: D("2018-01-01"),
        newAcquisitionDate: D("2021-09-16"),
        transferDate: D(d),
        deadlineYears: 3,
        oneYearWaived: false,
      });
    expect([iso(t("2024-09-19").deadline), t("2024-09-19").threeYearMet]).toEqual(["2024-09-19", true]);
    expect(t("2024-09-20").threeYearMet).toBe(false);
  });
  it("oneYearThreshold(A 유형 「최초 충족일」)는 그대로 — 종전 취득 2023-06-01 → 2024-06-02", () => {
    const t = judgeTemporaryTwoHouseTiming({
      previousAcquisitionDate: D("2023-06-01"),
      newAcquisitionDate: D("2024-06-02"),
      transferDate: D("2025-01-01"),
      deadlineYears: 3,
      oneYearWaived: false,
    });
    expect([iso(t.oneYearThreshold), t.oneYearMet]).toEqual(["2024-06-02", true]);
  });
});

describe("§155①2호 단서·가목 — 법령해석과-3656 사실관계(임대차 종료일 2021-10-11 대체공휴일)", () => {
  const era = (moveIn: string) =>
    resolveTemporaryTwoHouseDeadlineEra({
      bothRegulated: true,
      baseDeadlineYears: 3,
      newAcquisitionDate: D("2020-03-27"),
      moveInDate: D(moveIn),
      existingTenantLeaseEndDate: D("2021-10-11"),
      transferDate: D("2021-09-15"),
    });

  it("🔴 가목 — 종료일 다음 날(10-12) 전입 → 충족 · 10-13 → 미충족", () => {
    expect(era("2021-10-12").moveInMet).toBe(true);
    expect(era("2021-10-13").moveInMet).toBe(false);
  });
  it("🔴 나목 — 기한 말일(종료일) 10-11 → 10-12 양도까지", () => {
    const t = (d: string) =>
      judgeTemporaryTwoHouseTiming({
        previousAcquisitionDate: D("2009-01-01"),
        newAcquisitionDate: D("2020-03-27"),
        transferDate: D(d),
        deadlineYears: 1,
        oneYearWaived: false,
        deadlineDate: D("2021-10-11"),
      });
    expect([iso(t("2021-10-12").deadline), t("2021-10-12").threeYearMet]).toEqual(["2021-10-12", true]);
    expect(t("2021-10-13").threeYearMet).toBe(false);
  });
});

describe("§156의2③·④·⑨ · §89②", () => {
  const withRight = (t: string) =>
    input({
      acquisitionDate: D("2015-06-01"),
      transferDate: D(t),
      presaleRights: [{ id: "r1", type: "redevelopment_right", acquisitionDate: D("2021-06-01"), region: "capital" }],
    });
  it("🔴 ③ 권리 취득 3년 — 월 충족 · 화 대기(기한 월요일 + 설명)", () => {
    expect(resolveArticle89Clause2(withRight(MON), undefined).status).toBe("exception_met");
    const r = resolveArticle89Clause2(withRight(TUE), undefined);
    expect(r.status).toBe("undetermined");
    expect(r.deadline && iso(r.deadline)).toBe(MON);
    expect(r.deadlineNote).toContain("민법 §161");
  });
  it("⑤ UI 술어 isRightThreeYearExceeded — 엔진과 같다(월 ✗ · 화 ✓)", () => {
    const p = (t: string) => ({ rightAcquisitionDate: D("2021-06-01"), transferDate: D(t) });
    expect(isRightThreeYearExceeded(p(MON))).toBe(false);
    expect(isRightThreeYearExceeded(p(TUE))).toBe(true);
  });
  it("🔴 ④2호 완성 후 3년 — 월 충족 · 화 배제", () => {
    const x = (t: string) =>
      input({
        acquisitionDate: D("2015-06-01"),
        transferDate: D(t),
        presaleRights: [{ id: "r1", type: "redevelopment_right", acquisitionDate: D("2016-10-01"), region: "capital" }],
        rightThreeYearException: {
          kind: "new_house",
          completionDate: D("2021-06-01"),
          movedInWithin3Years: true,
          residedOneYearOrMore: true,
        },
      });
    expect(resolveArticle89Clause2(x(MON), undefined).status).toBe("exception_met");
    expect(resolveArticle89Clause2(x(TUE), undefined).status).toBe("excluded");
  });
  it("🔴 ⑨ 혼인 5년 — 월 ⑨2호 · 화 불성립", () => {
    const m = (t: string) =>
      input({
        acquisitionDate: D("2010-01-01"),
        transferDate: D(t),
        presaleRights: [{ id: "r1", type: "redevelopment_right", acquisitionDate: D("2012-01-01"), region: "capital" }],
        marriageMerge: { marriageDate: D("2019-06-01") } as TransferTaxInput["marriageMerge"],
        mergedHouseholdFirstHouse: { kind: "house_only" },
        isFirstTransferredInMerge: true,
      });
    expect(resolveArticle89Clause2(m(MON), undefined).exception).toBe("소득세법 시행령 §156의2 ⑨2호");
    expect(resolveArticle89Clause2(m(TUE), undefined).status).not.toBe("exception_met");
  });
});

describe("§155④⑤·⑦3호·⑧ · §154① 단서 · §156의2⑤ · §89①4호나목", () => {
  it("🔴 §155⑤ 혼인 5년 — 월 ✓ · 화 ✗ · pending 월요일", () => {
    const merge = (t?: string) =>
      input({
        householdHousingCount: 2,
        acquisitionDate: D("2010-01-01"),
        ...(t ? { transferDate: D(t) } : {}),
        marriageMerge: { marriageDate: D("2019-06-01") } as TransferTaxInput["marriageMerge"],
        isFirstTransferredInMerge: true,
        // §155④⑤ 합가 전 구성(2026-10-05 정책) — 상대 쪽 주택 1채를 명시한다.
        houses: [
          { id: "selling", acquisitionDate: D("2010-01-01"), officialPrice: 300_000_000, region: "capital", isInherited: false, isLongTermRental: false },
          { id: "h1", acquisitionDate: D("2008-01-01"), officialPrice: 300_000_000, region: "capital", isInherited: false, isLongTermRental: false, mergeOrigin: "counterpart_side" },
        ] as TransferTaxInput["houses"],
        sellingHouseId: "selling",
      });
    expect(resolveMergeDeeming(merge(MON))).toBe("marriage_merge");
    expect(resolveMergeDeeming(merge(TUE))).toBeUndefined();
    const r = checkExemption(merge(TUE) as OneHouseJudgeInput, rules, D("2021-01-01"));
    expect(r.pending.map((p) => [p.id, iso(p.deadline)])).toEqual([["155-5-marriage-merge", MON]]);
  });
  it("🔴 §155⑦3호 귀농 5년 — 월 ✓ · 화 ✗", () => {
    const RURAL = {
      kind: "return_to_farm",
      isOutsideCapitalEupMyeon: true,
      acquisitionDate: D("2019-06-01"),
      isHighPriceAtAcquisition: false,
      landAreaSqm: 300,
      wholeHouseholdMoved: true,
    } as TransferTaxInput["ruralHouse"];
    const r = (t: string) => qualifiesRuralHouse(input({ householdHousingCount: 2, transferDate: D(t), ruralHouse: RURAL }));
    expect([r(MON), r(TUE)]).toEqual([true, false]);
  });
  it("🔴 §155⑧ 해소 3년 — 월 ✓ · 화 ✗ · pending 월요일", () => {
    const U = { reason: "work", resolvedDate: D("2021-06-01") } as TransferTaxInput["unavoidableOutsideCapitalHouse"];
    const u = (t: string) =>
      qualifiesUnavoidableOutsideCapital(input({ householdHousingCount: 2, transferDate: D(t), unavoidableOutsideCapitalHouse: U }));
    expect([u(MON), u(TUE)]).toEqual([true, false]);
    const r = judge({ householdHousingCount: 2, transferDate: D(TUE), unavoidableOutsideCapitalHouse: U });
    expect(r.pending.map((p) => [p.id, iso(p.deadline)])).toEqual([["155-8-unavoidable-resolved", MON]]);
  });
  it("🔴 §154①2호가목 수용 5년 · 나목 출국 2년 — 월 ✓ · 화 ✗", () => {
    const pr = (t: string, p: NonNullable<TransferTaxInput["oneHouseExemptionProviso"]>) =>
      resolveExemptionProviso(input({ acquisitionDate: D("2015-01-01"), transferDate: D(t), oneHouseExemptionProviso: p }));
    const ex = {
      reason: "expropriation",
      businessApprovalDate: D("2016-01-01"),
      expropriationDate: D("2019-06-01"),
    } as NonNullable<TransferTaxInput["oneHouseExemptionProviso"]>;
    const ov = { reason: "overseas_migration", departureDate: D("2022-06-01") } as NonNullable<
      TransferTaxInput["oneHouseExemptionProviso"]
    >;
    expect([pr(MON, ex), pr(TUE, ex)]).toEqual(["both", null]);
    expect([pr(MON, ov), pr(TUE, ov)]).toEqual(["both", null]);
  });
  it("🔴 §156의2⑤ 대체주택 완성 후 3년 — 월 비과세 · 화 과세", () => {
    const rep = (t: string) =>
      judge({
        householdHousingCount: 2,
        acquisitionDate: D("2019-06-01"),
        transferDate: D(t),
        replacementHouse: {
          businessApprovalDate: D("2019-01-01"),
          completionDate: D("2021-06-01"),
          replacementResidenceMonths: 24,
          willResideNewHouse: true,
        },
      }).isExempt;
    expect([rep(MON), rep(TUE)]).toEqual([true, false]);
  });
  it("🔴 §89①4호나목 1주택 취득 3년 — 월 ✓ · 화 ✗", () => {
    const c = (t: string) =>
      resolveOneRightExemptionClause(
        { exemptionEligibleAtApproval: true, otherHouseAcquisitionDate: D("2021-06-01") },
        input({ householdHousingCount: 1, householdRightCount: 1, transferDate: D(t) }),
      );
    expect([c(MON), c(TUE)]).toEqual(["na", undefined]);
  });
});

describe("표 밖 양도 — 판정 보류 고지(토·일만 반영)", () => {
  const tt = (transferDate: string): Partial<TransferTaxInput> => ({
    householdHousingCount: 2,
    acquisitionDate: D("2022-01-01"),
    transferDate: D(transferDate),
    residencePeriodMonths: 0,
    temporaryTwoHouse: {
      previousAcquisitionDate: D("2022-01-01"),
      newAcquisitionDate: D("2025-06-03"),
    } as TransferTaxInput["temporaryTwoHouse"],
  });
  it("말일 2028-06-03(토) → 06-05(월)까지 비과세 + 예정 공휴일 고지(같은 id)", () => {
    const r = judge(tt("2028-06-05"));
    expect(r.isExempt).toBe(true);
    const u = r.undetermined.find((x) => x.id === "civil-161-holiday-table-uncovered");
    expect(u?.reason).toContain("예정 공휴일");
  });
  it("🔴 2028 설 — 신규 취득 2025-01-26 → 말일 2028-01-26(설날 전날) → 01-31(월)까지 비과세 · 02-01 과세", () => {
    const seol = (t: string) => ({
      ...tt(t),
      temporaryTwoHouse: {
        previousAcquisitionDate: D("2022-01-01"),
        newAcquisitionDate: D("2025-01-26"),
      } as TransferTaxInput["temporaryTwoHouse"],
    });
    expect([judge(seol("2028-01-27")).isExempt, judge(seol("2028-01-31")).isExempt]).toEqual([true, true]);
    expect(judge(seol("2028-02-01")).isExempt).toBe(false);
  });
  it("말일 2036-06-07(토) → 06-09(월)까지 비과세 + 표 미포함 고지(토·일만)", () => {
    const r = judge({
      ...tt("2036-06-09"),
      acquisitionDate: D("2030-01-01"),
      temporaryTwoHouse: {
        previousAcquisitionDate: D("2030-01-01"),
        newAcquisitionDate: D("2033-06-07"),
      } as TransferTaxInput["temporaryTwoHouse"],
    });
    expect(r.isExempt).toBe(true);
    const u = r.undetermined.find((x) => x.id === "civil-161-holiday-table-uncovered");
    expect(u?.reason).toContain("토·일요일만");
  });
  it("표 안 양도(2024)에는 고지하지 않는다", () => {
    const r = judge({ ...tt(MON), temporaryTwoHouse: { previousAcquisitionDate: D("2018-01-01"), newAcquisitionDate: D("2021-06-01") } as TransferTaxInput["temporaryTwoHouse"], acquisitionDate: D("2018-01-01") });
    expect(r.undetermined.map((u) => u.id)).not.toContain("civil-161-holiday-table-uncovered");
  });
  it("표 밖이어도 기한 축이 없으면 고지하지 않는다(단순 1주택)", () => {
    const r = judge({ householdHousingCount: 1, acquisitionDate: D("2022-01-01"), transferDate: D("2028-06-05") });
    expect(r.undetermined.map((u) => u.id)).not.toContain("civil-161-holiday-table-uncovered");
  });
});
