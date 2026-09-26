/**
 * anchor — 「~한 날부터 N년 이내」 처분기한의 윤년 경계 (계획서 one-house-exemption-fix §1 유형 B)
 *
 * 국세기본법 §4 → 민법 §157·§160: 사건일 다음날이 기산일이고, 만료일은 기산일 응당일의 전날이다.
 * 평년 2/28 사건이면 기산일 3/1 → 만료는 윤년의 **2/29**다. 종전 `addYears`는 2/28을 만료로 봐
 * 하루 짧았다(사건일 2/29 → `setFullYear`는 3/1로 넘겨 하루 길었다 — §89①4호나목).
 *   근거: 서면2018부동산-3033, 조심2012중305(「N년 이내」 초일불산입).
 *
 * 경계 밖 일반 날짜는 종전과 같다(만료 = 사건일 응당일). 이 파일의 모든 케이스는 **만료일(이내) ↔
 * 다음날(초과)** 짝이며, 종전 코드는 부정 쪽이 아니라 **만료일 당일**을 기한 도과로 판정했다.
 * 뮤테이션 A(계획서 §1.2)에서 이 축은 기존 테스트 실패가 0건이었다 — 이 파일이 유일한 안전망이다.
 */
import { describe, it, expect } from "vitest";
import { checkExemption } from "@/lib/tax-engine/transfer-tax-exemption";
import { parseRatesFromMap } from "@/lib/tax-engine/transfer-tax-helpers";
import {
  qualifiesRuralHouse,
  qualifiesUnavoidableOutsideCapital,
  resolveExemptionProviso,
  resolveMergeDeeming,
} from "@/lib/tax-engine/transfer-tax-exemption-requirements";
import {
  isRightThreeYearExceeded,
  resolveArticle89Clause2,
} from "@/lib/tax-engine/transfer-tax-89-2-exclusion";
import { resolveOneRightExemptionClause } from "@/lib/tax-engine/transfer-tax-redevelopment-transforms";
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

/** 만료일(이내)과 그 다음날(초과) */
const LAST = "2024-02-29";
const OVER = "2024-03-01";

describe("§155① 요건 B — 신규주택 취득일(2021-02-28)부터 3년 이내", () => {
  const tt = (transferDate: string): Partial<TransferTaxInput> => ({
    householdHousingCount: 2,
    acquisitionDate: D("2018-01-01"),
    transferDate: D(transferDate),
    residencePeriodMonths: 0,
    temporaryTwoHouse: {
      previousAcquisitionDate: D("2018-01-01"),
      newAcquisitionDate: D("2021-02-28"),
    } as TransferTaxInput["temporaryTwoHouse"],
  });

  it("만료일 2024-02-29 양도 → 비과세", () => {
    expect(judge(tt(LAST)).isExempt).toBe(true);
  });
  it("다음날 양도 → 과세 · pending 기한은 2024-02-29", () => {
    const r = judge(tt(OVER));
    expect(r.isExempt).toBe(false);
    expect(r.pending.map((p) => [p.id, iso(p.deadline)])).toEqual([
      ["155-1-disposal-deadline", LAST],
    ]);
  });
  it("UI 판정 카드 처분기한 표시도 2024-02-29", () => {
    const v = judgeTempTwoHouseFromForm({
      previousAcquisitionDate: "2018-01-01",
      newHouseAcquisitionDate: "2021-02-28",
      transferDate: LAST,
      provisoReason: "",
      provisoDepartureDate: "",
      provisoExpropriationDate: "",
      provisoBusinessApprovalDate: "",
      residencePeriodMonths: "0",
    });
    if (v.status === "pending") throw new Error("pending");
    expect(iso(v.deadline)).toBe(LAST);
    expect(v.threeYearMet).toBe(true);
  });
});

describe("§156의2③ — 권리 취득일(2021-02-28)부터 3년 이내 · ⑤ UI 술어", () => {
  const withRight = (transferDate: string) =>
    input({
      acquisitionDate: D("2015-06-01"),
      transferDate: D(transferDate),
      presaleRights: [
        { id: "r1", type: "redevelopment_right", acquisitionDate: D("2021-02-28"), region: "capital" },
      ],
    });

  it("만료일 양도 → §156의2③ 충족", () => {
    expect(resolveArticle89Clause2(withRight(LAST), undefined)).toMatchObject({
      status: "exception_met",
      exception: "소득세법 시행령 §156의2 ③",
    });
  });
  it("다음날 양도 → 3년 초과(④ 선언 대기) · 기한 2024-02-29", () => {
    const r = resolveArticle89Clause2(withRight(OVER), undefined);
    expect(r.status).toBe("undetermined");
    expect(r.status === "undetermined" && r.deadline && iso(r.deadline)).toBe(LAST);
  });
  it("isRightThreeYearExceeded — 만료일 ✗ · 다음날 ✓", () => {
    const p = (t: string) => ({ rightAcquisitionDate: D("2021-02-28"), transferDate: D(t) });
    expect(isRightThreeYearExceeded(p(LAST))).toBe(false);
    expect(isRightThreeYearExceeded(p(OVER))).toBe(true);
  });
});

describe("§156의2④2호 — 신축주택 완성일(2021-02-28) 후 3년 이내", () => {
  const withException = (transferDate: string) =>
    input({
      acquisitionDate: D("2015-06-01"),
      transferDate: D(transferDate),
      presaleRights: [
        { id: "r1", type: "redevelopment_right", acquisitionDate: D("2016-10-01"), region: "capital" },
      ],
      rightThreeYearException: {
        kind: "new_house",
        completionDate: D("2021-02-28"),
        movedInWithin3Years: true,
        residedOneYearOrMore: true,
      },
    });

  it("만료일 양도 → ④ 충족", () => {
    expect(resolveArticle89Clause2(withException(LAST), undefined).status).toBe("exception_met");
  });
  it("다음날 양도 → 배제", () => {
    expect(resolveArticle89Clause2(withException(OVER), undefined).status).toBe("excluded");
  });
});

describe("§156의2⑨ — 혼인한 날(2014-02-28)부터 10년 이내 먼저 양도", () => {
  const merged = (transferDate: string) =>
    input({
      acquisitionDate: D("2010-01-01"),
      transferDate: D(transferDate),
      presaleRights: [
        { id: "r1", type: "redevelopment_right", acquisitionDate: D("2012-01-01"), region: "capital" },
      ],
      marriageMerge: { marriageDate: D("2014-02-28") } as TransferTaxInput["marriageMerge"],
      mergedHouseholdFirstHouse: { kind: "house_only" },
      isFirstTransferredInMerge: true,
    });

  it("만료일 양도 → ⑨2호 충족", () => {
    expect(resolveArticle89Clause2(merged(LAST), undefined)).toMatchObject({
      status: "exception_met",
      exception: "소득세법 시행령 §156의2 ⑨2호",
    });
  });
  it("다음날 양도 → ⑨ 불성립", () => {
    expect(resolveArticle89Clause2(merged(OVER), undefined).status).not.toBe("exception_met");
  });
});

describe("§155④⑤ 합가 — 혼인한 날(2014-02-28)부터 10년 이내", () => {
  const merge = (transferDate: string) =>
    input({
      householdHousingCount: 2,
      acquisitionDate: D("2010-01-01"),
      transferDate: D(transferDate),
      marriageMerge: { marriageDate: D("2014-02-28") } as TransferTaxInput["marriageMerge"],
      isFirstTransferredInMerge: true,
    });

  it("술어 — 만료일 ✓ · 다음날 ✗", () => {
    expect(resolveMergeDeeming(merge(LAST))).toBe("marriage_merge");
    expect(resolveMergeDeeming(merge(OVER))).toBeUndefined();
  });
  it("pending 기한 = 2024-02-29", () => {
    const r = judge({
      householdHousingCount: 2,
      acquisitionDate: D("2010-01-01"),
      marriageMerge: { marriageDate: D("2014-02-28") } as TransferTaxInput["marriageMerge"],
      isFirstTransferredInMerge: true,
    });
    expect(r.pending.map((p) => [p.id, iso(p.deadline)])).toEqual([["155-5-marriage-merge", LAST]]);
  });
});

describe("§155⑦3호 — 귀농주택 취득일(2019-02-28)부터 5년 이내", () => {
  const RURAL = {
    kind: "return_to_farm",
    isOutsideCapitalEupMyeon: true,
    acquisitionDate: D("2019-02-28"),
    isHighPriceAtAcquisition: false,
    landAreaSqm: 300,
    wholeHouseholdMoved: true,
  } as TransferTaxInput["ruralHouse"];
  const rural = (t: string) => input({ householdHousingCount: 2, transferDate: D(t), ruralHouse: RURAL });

  it("술어 — 만료일 ✓ · 다음날 ✗", () => {
    expect(qualifiesRuralHouse(rural(LAST))).toBe(true);
    expect(qualifiesRuralHouse(rural(OVER))).toBe(false);
  });
  it("pending 기한 = 2024-02-29", () => {
    const r = judge({ householdHousingCount: 2, ruralHouse: RURAL });
    expect(r.pending.map((p) => [p.id, iso(p.deadline)])).toEqual([["155-7-3ho-return-to-farm", LAST]]);
  });
});

describe("§155⑧ — 부득이한 사유 해소일(2021-02-28)부터 3년 이내", () => {
  const U = { reason: "work", resolvedDate: D("2021-02-28") } as TransferTaxInput["unavoidableOutsideCapitalHouse"];
  const unavoidable = (t: string) =>
    input({ householdHousingCount: 2, transferDate: D(t), unavoidableOutsideCapitalHouse: U });

  it("술어 — 만료일 ✓ · 다음날 ✗", () => {
    expect(qualifiesUnavoidableOutsideCapital(unavoidable(LAST))).toBe(true);
    expect(qualifiesUnavoidableOutsideCapital(unavoidable(OVER))).toBe(false);
  });
  it("pending 기한 = 2024-02-29", () => {
    const r = judge({ householdHousingCount: 2, unavoidableOutsideCapitalHouse: U });
    expect(r.pending.map((p) => [p.id, iso(p.deadline)])).toEqual([["155-8-unavoidable-resolved", LAST]]);
  });
});

describe("§154① 단서 — 수용일부터 5년 · 출국일부터 2년 이내", () => {
  const proviso = (t: string, p: NonNullable<TransferTaxInput["oneHouseExemptionProviso"]>) =>
    resolveExemptionProviso(
      input({ acquisitionDate: D("2015-01-01"), transferDate: D(t), oneHouseExemptionProviso: p }),
    );

  it("2호가목 수용일 2019-02-28 — 만료일 ✓ · 다음날 ✗", () => {
    const p = {
      reason: "expropriation",
      businessApprovalDate: D("2016-01-01"),
      expropriationDate: D("2019-02-28"),
    } as NonNullable<TransferTaxInput["oneHouseExemptionProviso"]>;
    expect(proviso(LAST, p)).toBe("both");
    expect(proviso(OVER, p)).toBeNull();
  });
  it("2호나목 출국일 2022-02-28 — 만료일 ✓ · 다음날 ✗", () => {
    const p = {
      reason: "overseas_migration",
      departureDate: D("2022-02-28"),
    } as NonNullable<TransferTaxInput["oneHouseExemptionProviso"]>;
    expect(proviso(LAST, p)).toBe("both");
    expect(proviso(OVER, p)).toBeNull();
  });
});

describe("§156의2⑤ 대체주택 — 신축주택 완성일(2021-02-28) 후 3년 이내", () => {
  const replacement = (t: string) =>
    judge({
      householdHousingCount: 2,
      acquisitionDate: D("2019-06-01"),
      transferDate: D(t),
      replacementHouse: {
        businessApprovalDate: D("2019-01-01"),
        completionDate: D("2021-02-28"),
        replacementResidenceMonths: 24,
        willResideNewHouse: true,
      },
    });

  it("만료일 ✓ · 다음날 ✗", () => {
    expect(replacement(LAST).isExempt).toBe(true);
    expect(replacement(OVER).isExempt).toBe(false);
  });
});

describe("§89①4호나목 — 그 1주택 취득일부터 3년 이내 입주권 양도", () => {
  const clause = (otherHouse: string, t: string) =>
    resolveOneRightExemptionClause(
      { exemptionEligibleAtApproval: true, otherHouseAcquisitionDate: D(otherHouse) },
      input({ householdHousingCount: 1, householdRightCount: 1, transferDate: D(t) }),
    );

  it("평년 2/28 취득 → 윤년 2/29 만료: 만료일 ✓ · 다음날 ✗", () => {
    expect(clause("2021-02-28", LAST)).toBe("na");
    expect(clause("2021-02-28", OVER)).toBeUndefined();
  });
  it("2/29 취득 → 2023-02-28 만료(§160③): 만료일 ✓ · 3/1 ✗", () => {
    expect(clause("2020-02-29", "2023-02-28")).toBe("na");
    expect(clause("2020-02-29", "2023-03-01")).toBeUndefined();
  });
});
