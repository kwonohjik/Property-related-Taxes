/**
 * §155① 일시적 2주택 — 신규 주택의 **취득 경위**(분양권·조합원입주권 유래) 갈래 (결정 #43 · G6-4).
 *
 * 명부 행에는 「취득일」 하나뿐이라 권리로 취득해 완공된 주택에 완공일을 넣으면 해석이 부적용으로 본 순차 사례까지 비과세가 나왔다
 * (평가셋 E014·E061·N-G105-completed가 inexpressible이던 이유). 경위와 권리 취득일을 받아 갈래를 가른다.
 *
 * | # | 갈래 | 기대 |
 * |---|---|---|
 * | L-1 | 일반 · 모름 · 경위 미수집 | 일반 통과 / 모름 불성립 + 확인 필요 / 미수집 통과 + 확인 필요 |
 * | L-2 | 분양권 | 2020.12.31. 이전 취득 통과 · 순차 불성립 · 같은 날 확인 필요 · 보유 중 분양권 갈래 현행 + 확인 필요 · 양론 B면 불성립 |
 * | L-3 | 승계 입주권·상가토지 원조합원 | 순차 불성립 · 3년 이내 통과(경계 ±1일) · 3년 경과 미선언 확인 필요 / 선언 통과 · 2006 전 인가분 통과 · 2006 전 승계는 인가일 공란도 통과(⑤ 3년 칸 동일 술어) · ⑧ 인가일 ≤ 승계취득일 |
 * | L-4 | 원조합원(기존주택)·자가 재건축 | 기존주택 취득일 필수 · 있으면 통과(날짜는 클라이언트가 바꿔 싣는다) |
 * | R-* | 판정 메뉴 route | 기존주택 취득일이 선후를 가른다 · 미답 ⑧ · 양론 · 15호 추종 |
 * | C-* | 계산기 route · ④ | 명부 행의 경위가 body에 실린다 · 직접 선언은 not_collected + 확인 필요 · 계약일 칸을 행이 덮는다 |
 */
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  judgeNewHouseOrigin,
  isHoldingPresaleOrigin,
  NEW_HOUSE_ORIGIN_PRESALE_START,
  NEW_HOUSE_ORIGIN_REDEV_RIGHT_START,
} from "@/lib/tax-engine/one-house/new-house-origin";
import { ARTICLE_89_2_REDEV_RIGHT_START_DATE } from "@/lib/tax-engine/transfer-tax-89-2-exclusion";
import { eraFormWithOriginDates } from "@/lib/calc/temporary-two-house-era-facts";
import { newHouseOriginIssue, newHouseOriginQuestionVisible } from "@/lib/calc/new-house-origin-scope";
import { rightThreeYearExceptionRightKinds } from "@/lib/calc/right-three-year-exception-scope";
import { effectiveNewHouseAcquisitionDate, resolveTemporaryTwoHouse } from "@/lib/calc/household-house-count";
import { observeCase, type RulingCase } from "../../calc/one-house-rulings/harness";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { POST as SINGLE } from "@/app/api/calc/transfer/route";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";

type Origin = NonNullable<NonNullable<TransferTaxInput["temporaryTwoHouse"]>["newHouseOrigin"]>;
const D = (s: string) => new Date(s);

/** 종전주택 2015-03-15 취득 · 신규 주택 완공 2025-09-15 · 양도 2026-06-15 (현행 3년) */
const judge = (origin: Origin, over: Partial<Pick<TransferTaxInput, "transferDate" | "rightThreeYearException">> & { prev?: string; next?: string } = {}) =>
  judgeNewHouseOrigin(
    {
      acquisitionDate: D(over.prev ?? "2015-03-15"),
      transferDate: over.transferDate ?? D("2026-06-15"),
      rightThreeYearException: over.rightThreeYearException,
      temporaryTwoHouse: {
        previousAcquisitionDate: D(over.prev ?? "2015-03-15"),
        newAcquisitionDate: D(over.next ?? "2025-09-15"),
        newHouseOrigin: origin,
      },
    },
    false,
  );

describe("L-1 일반 · 모름 · 경위 미수집", () => {
  it("일반 취득은 변화 없음", () => {
    const v = judge({ kind: "general" });
    expect(v).toMatchObject({ blocked: false, reasons: [], unconfirmed: [], confirmNotes: [] });
  });
  it("모름은 불성립 + 확인 필요 (확정 사유가 아니다)", () => {
    const v = judge({ kind: "unknown" });
    expect(v.blocked).toBe(true);
    expect(v.reasons).toEqual([]);
    expect(v.unconfirmed).toHaveLength(1);
  });
  it("경위를 묻지 못한 경로(not_collected)는 통과하되 확인 필요를 남긴다", () => {
    const v = judge({ kind: "not_collected" });
    expect(v.blocked).toBe(false);
    expect(v.confirmNotes).toHaveLength(1);
  });
});

describe("L-2 분양권", () => {
  const presale = (R: string | undefined, over?: Parameters<typeof judge>[1], extra: Partial<Origin> = {}) =>
    judge({ kind: "presale", rightAcquisitionDate: R ? D(R) : undefined, ...extra }, over);

  it("분양권 취득일이 없으면 모름과 같다", () => {
    const v = presale(undefined);
    expect(v.blocked).toBe(true);
    expect(v.unconfirmed).toHaveLength(1);
  });

  it("2020-12-31 이전 취득 분양권 — 주택 수에 들지 않던 때라 현행 §155①(완공일 기산) 그대로 (경계 ±1일)", () => {
    expect(presale("2020-12-31", { prev: "2021-06-01" }).blocked).toBe(false);
    // 2021-01-01 취득부터는 순차 판정이 걸린다 — 종전주택 취득(2021-06-01)보다 앞서므로 불성립
    expect(presale("2021-01-01", { prev: "2021-06-01" }).blocked).toBe(true);
  });

  it("순차(권리 취득일 < 종전주택 취득일) → 확정 불성립 · 같은 날 → 확인 필요 · 하루 뒤 → 보유 중 갈래", () => {
    const seq = presale("2022-03-14", { prev: "2022-03-15", next: "2025-09-15" });
    expect(seq.blocked).toBe(true);
    expect(seq.reasons).toHaveLength(1);
    expect(seq.unconfirmed).toEqual([]);
    const same = presale("2022-03-15", { prev: "2022-03-15", next: "2025-09-15" });
    expect(same.blocked).toBe(true);
    expect(same.reasons).toEqual([]);
    expect(same.unconfirmed).toHaveLength(1);
    const later = presale("2022-03-16", { prev: "2022-03-15", next: "2025-09-15", transferDate: D("2026-06-15") });
    expect(later.blocked).toBe(false);
    expect(later.holdingPresale).toBe(true);
  });

  it("보유 중 분양권 갈래 — §156의3으로 판정하면 불충족이면 현행 비과세 + 확인 필요 (두 입장이 같으면 고지 없음)", () => {
    // 종전 2015 · 분양권 2022-03-15 · 양도 2026-06-15 → §156의3②(3년)은 2025-03-15에 지났다 → 입장 B 불충족
    const differ = presale("2022-03-15");
    expect(differ.blocked).toBe(false);
    expect(differ.holdingPresale).toBe(true);
    expect(differ.confirmNotes).toHaveLength(1);
    // 분양권 2024-03-15 · 양도 2026-06-15 → 3년 이내 → 입장 B도 충족 → 고지 없음
    const same = presale("2024-03-15");
    expect(same.holdingPresale).toBe(true);
    expect(same.confirmNotes).toEqual([]);
  });

  it("양론 반대 입장(§156의3) 플래그 — 불충족이면 불성립", () => {
    const b = presale("2022-03-15", undefined, { holdingPresalePosition: "156_3" });
    expect(b.blocked).toBe(true);
    expect(b.reasons).toHaveLength(1);
    expect(presale("2024-03-15", undefined, { holdingPresalePosition: "156_3" }).blocked).toBe(false);
  });

  it("isHoldingPresaleOrigin — 분양권 · 2021.1.1. 이후 · 종전주택보다 뒤일 때만", () => {
    const mk = (R: string, prev = "2015-03-15") =>
      ({ previousAcquisitionDate: D(prev), newAcquisitionDate: D("2025-09-15"), newHouseOrigin: { kind: "presale" as const, rightAcquisitionDate: D(R) } });
    expect(isHoldingPresaleOrigin(mk("2022-03-15"))).toBe(true);
    expect(isHoldingPresaleOrigin(mk("2020-12-31"))).toBe(false);
    expect(isHoldingPresaleOrigin(mk("2014-01-01"))).toBe(false);
  });

  it("상수 — 분양권 시작일은 시드(2021-01-01)와, 입주권 시행일은 §89② 상수와 같다", () => {
    expect(NEW_HOUSE_ORIGIN_PRESALE_START.toISOString().slice(0, 10)).toBe("2021-01-01");
    expect(NEW_HOUSE_ORIGIN_REDEV_RIGHT_START.getTime()).toBe(ARTICLE_89_2_REDEV_RIGHT_START_DATE.getTime());
  });
});

describe("L-3 승계 입주권 · 상가토지 원조합원", () => {
  const succ = (R: string | undefined, over?: Parameters<typeof judge>[1], extra: Partial<Origin> = {}) =>
    judge({ kind: "successor_right", rightAcquisitionDate: R ? D(R) : undefined, ...extra }, over);

  it("순차 → 확정 불성립 · 같은 날 → 확인 필요", () => {
    const seq = succ("2016-02-19", { prev: "2018-12-02" });
    expect(seq.blocked).toBe(true);
    expect(seq.reasons).toHaveLength(1);
    const same = succ("2018-12-02", { prev: "2018-12-02" });
    expect(same.blocked).toBe(true);
    expect(same.unconfirmed).toHaveLength(1);
  });

  it("종전주택 보유 중 취득 — §156의2③: 취득 후 1년이 지난 뒤 입주권 취득 · 입주권 취득일부터 3년 이내 양도 (경계)", () => {
    // 종전 2015-03-15 · 입주권 2023-06-15 → 3년 말일 2026-06-15
    expect(succ("2023-06-15", { transferDate: D("2026-06-15") }).blocked).toBe(false);
    const late = succ("2023-06-15", { transferDate: D("2026-06-16") });
    expect(late.blocked).toBe(true);
    // 3년 경과 + 예외 미선언 → 확인 필요(확정 불성립이 아니다)
    expect(late.unconfirmed).toHaveLength(1);
    expect(late.reasons).toEqual([]);
  });

  it("종전주택 취득 후 1년이 지나기 전에 입주권을 취득하면 ③ 불성립 (응당일은 미경과)", () => {
    // 종전 2022-03-15 · 입주권 2023-03-15(1년 응당일) → 불성립 / 2023-03-16 → 성립
    expect(succ("2023-03-15", { prev: "2022-03-15", transferDate: D("2024-06-15") }).blocked).toBe(true);
    expect(succ("2023-03-16", { prev: "2022-03-15", transferDate: D("2024-06-15") }).blocked).toBe(false);
  });

  it("3년 경과 예외 선언 — new_house(완성 후 3년 내 이사·1년 거주) 통과 / none이면 확정 불성립", () => {
    const base = { transferDate: D("2026-06-15") };
    const ok = succ("2022-03-15", {
      ...base,
      rightThreeYearException: { kind: "new_house", completionDate: D("2025-09-15"), movedInWithin3Years: true, residedOneYearOrMore: true },
    });
    expect(ok.blocked).toBe(false);
    const none = succ("2022-03-15", { ...base, rightThreeYearException: { kind: "none" } });
    expect(none.blocked).toBe(true);
    expect(none.reasons).toHaveLength(1);
    expect(none.unconfirmed).toEqual([]);
  });

  it("2006.1.1. 전 인가 · 그 전 승계 입주권은 §89② 대상이 아니라 현행 §155① (경계 ±1일)", () => {
    const pre = succ("2005-12-31", { prev: "1997-10-15", next: "2008-09-30", transferDate: D("2009-06-15") }, { rightApprovalDate: D("2005-05-06") });
    expect(pre.blocked).toBe(false);
    expect(pre.confirmNotes).toEqual([]);
    // 승계취득이 2006-01-01이면 대상이다 — 3년이 지났고 예외 미선언이라 확인 필요
    const post = succ("2006-01-01", { prev: "1997-10-15", next: "2008-09-30", transferDate: D("2009-06-15") }, { rightApprovalDate: D("2005-05-06") });
    expect(post.blocked).toBe(true);
  });

  it("2006.1.1. 전 승계 입주권 — 인가일을 비워도 §89② 대상이 아니다(입주권은 인가 뒤에만 생긴다 · 부칙 §12)", () => {
    const base = { prev: "2004-01-01", next: "2008-09-30", transferDate: D("2012-06-01") };
    // 승계 2005.6.1. — 인가일 공란도 인가일(2004.12.1.)을 넣은 것과 같은 결론(종전: 공란이면 3년 경과 미선언으로 불성립)
    expect(succ("2005-06-01", base)).toMatchObject({ blocked: false, reasons: [], unconfirmed: [], confirmNotes: [] });
    expect(succ("2005-06-01", base, { rightApprovalDate: D("2004-12-01") }).blocked).toBe(false);
    // 승계 2003.6.1.이 종전주택 2004.1.1.보다 앞서도 §89② 입주권이 아니라 순차 사유로 막지 않는다
    const seq = succ("2003-06-01", base);
    expect(seq.blocked).toBe(false);
    expect(seq.reasons).toEqual([]);
    // 경계 — 승계 2005.12.31.은 대상 아님 / 2006.1.1.은 부칙 ②로 대상(3년 경과 미선언 → 확인 필요)
    expect(succ("2005-12-31", base).blocked).toBe(false);
    const post = succ("2006-01-01", base);
    expect(post.blocked).toBe(true);
    expect(post.unconfirmed).toHaveLength(1);
  });

  it("⑤ 3년 경과 예외 칸 — 2006.1.1. 전 승계 입주권 행은 인가일 공란이어도 묻지 않는다(엔진과 같은 술어)", () => {
    const def = createDefaultTransferFormData();
    const form = (R: string) =>
      ({
        ...def,
        transferDate: "2012-06-01",
        assets: [{ ...def.assets[0], assetKind: "housing" }],
        houses: [{ id: "b", acquisitionDate: "2008-09-30", acquisitionOrigin: "successor_right", rightAcquisitionDate: R }],
      }) as never;
    expect(rightThreeYearExceptionRightKinds(form("2005-06-01"))).toEqual([]);
    expect(rightThreeYearExceptionRightKinds(form("2006-01-01"))).toEqual(["redevelopment_right"]);
  });

  it("상가·토지 원조합원 — 권리 취득일이 곧 인가일이다(2006 전 인가는 대상 아님)", () => {
    const o = (R: string) => judge({ kind: "original_member_non_house", rightAcquisitionDate: D(R) }, { prev: "2000-01-01", next: "2008-09-30", transferDate: D("2009-06-15") });
    expect(o("2005-12-31").blocked).toBe(false);
    expect(o("2006-01-01").blocked).toBe(true); // 3년 경과 미선언
  });
});

describe("L-3b 합가 세대 가드 — 합가 + 권리 유래 신규 주택은 이번 범위 밖 (§156의2⑧⑨·§156의3⑥)", () => {
  const withMerge = (origin: Origin) =>
    judgeNewHouseOrigin(
      {
        acquisitionDate: D("2015-03-15"),
        transferDate: D("2026-06-15"),
        marriageMerge: { marriageDate: D("2019-05-01") },
        temporaryTwoHouse: { previousAcquisitionDate: D("2015-03-15"), newAcquisitionDate: D("2025-09-15"), newHouseOrigin: origin },
      },
      false,
    );
  it("권리 유래 경위 + 합가 → 조용히 결론내지 않고 불성립 + 확인 필요", () => {
    for (const kind of ["presale", "successor_right", "original_member_non_house"] as const) {
      const v = withMerge({ kind, rightAcquisitionDate: D("2024-03-15") });
      expect(v.blocked).toBe(true);
      expect(v.unconfirmed).toHaveLength(1);
      expect(v.unconfirmed[0]).toContain("합가");
    }
  });
  it("일반 취득·기존주택의 연장은 합가 세대라도 영향이 없다 (짝)", () => {
    expect(withMerge({ kind: "general" }).blocked).toBe(false);
    expect(withMerge({ kind: "self_rebuild", rightAcquisitionDate: D("2022-01-10") }).blocked).toBe(false);
  });
});

describe("L-4 기존주택의 연장 — 원조합원(기존주택) · 자가 재건축", () => {
  it("기존주택 취득일이 없으면 모름과 같다 / 있으면 통과", () => {
    for (const kind of ["original_member_house", "self_rebuild"] as const) {
      expect(judge({ kind }).blocked).toBe(true);
      expect(judge({ kind, rightAcquisitionDate: D("2022-01-10") }).blocked).toBe(false);
    }
  });
});

describe("클라이언트 도출 — 기존주택의 연장은 선후를 기존주택 취득일로 본다", () => {
  const args = (houses: Parameters<typeof resolveTemporaryTwoHouse>[0]["houses"]) => ({
    primaryKind: "housing",
    primaryAcquisitionDate: "2015-03-15",
    houses,
    transferDate: "2026-06-15",
    legacyPrecedence: false,
    declaredSpecial: false,
    declaredNewHouseDate: undefined,
    mergeContext: undefined,
    excludedHouseIds: new Set<string>(),
    rentalResidenceHouseIds: new Set<string>(),
  });
  it("완공일이 종전주택보다 뒤여도 기존주택 취득일이 앞서면 신규 주택 후보가 아니다 (도출 없음)", () => {
    const d = resolveTemporaryTwoHouse(
      args([{ id: "b", acquisitionDate: "2024-09-15", acquisitionOrigin: "original_member_house", rightAcquisitionDate: "2005-01-10" }]),
    );
    expect(d).toBeUndefined();
  });
  it("기존주택 취득일이 종전주택보다 뒤면 그 날짜가 신규 주택 취득일이다", () => {
    const d = resolveTemporaryTwoHouse(
      args([{ id: "b", acquisitionDate: "2024-09-15", acquisitionOrigin: "self_rebuild", rightAcquisitionDate: "2022-01-10" }]),
    );
    expect(d).toMatchObject({ newAcquisitionDate: "2022-01-10", newHouseRowId: "b", newHouseOrigin: { kind: "self_rebuild", rightAcquisitionDate: "2022-01-10" } });
  });
  it("미답 행은 일반 취득과 같이 도출하되 경위는 unknown으로 싣는다", () => {
    const d = resolveTemporaryTwoHouse(args([{ id: "b", acquisitionDate: "2024-09-15" }]));
    expect(d).toMatchObject({ newAcquisitionDate: "2024-09-15", newHouseOrigin: { kind: "unknown" } });
  });
  it("직접 선언 폴백은 경위를 묻지 못했으므로 not_collected다", () => {
    const d = resolveTemporaryTwoHouse({ ...args([]), declaredSpecial: true, declaredNewHouseDate: "2024-09-15" });
    expect(d).toMatchObject({ source: "declared", newHouseOrigin: { kind: "not_collected" } });
  });
  it("effectiveNewHouseAcquisitionDate — 날짜를 모르면 완공일 그대로", () => {
    expect(effectiveNewHouseAcquisitionDate({ acquisitionDate: "2024-09-15", acquisitionOrigin: "self_rebuild" })).toBe("2024-09-15");
    expect(effectiveNewHouseAcquisitionDate({ acquisitionDate: "2024-09-15", acquisitionOrigin: "presale", rightAcquisitionDate: "2021-09-01" })).toBe("2024-09-15");
  });
});

describe("⑧ · ⑤ 범위", () => {
  it("신규 주택으로 도출된 행만 경위를 요구한다 · 모름은 유효한 답", () => {
    const row = { id: "b", acquisitionDate: "2025-09-15" } as never;
    expect(newHouseOriginIssue(row, "b")?.field).toBe("acquisitionOrigin");
    expect(newHouseOriginIssue(row, "other")).toBeNull();
    expect(newHouseOriginIssue(row, undefined)).toBeNull();
    expect(newHouseOriginIssue({ ...(row as object), acquisitionOrigin: "unknown" } as never, "b")).toBeNull();
    expect(newHouseOriginIssue({ ...(row as object), acquisitionOrigin: "general" } as never, "b")).toBeNull();
  });
  it("권리 유래 경위는 권리 취득일이 필요하고 완공일보다 늦을 수 없다", () => {
    const mk = (over: object) => ({ id: "b", acquisitionDate: "2025-09-15", acquisitionOrigin: "presale", ...over }) as never;
    expect(newHouseOriginIssue(mk({}), "b")?.field).toBe("rightAcquisitionDate");
    expect(newHouseOriginIssue(mk({ rightAcquisitionDate: "2025-09-16" }), "b")?.message).toContain("늦을 수 없");
    expect(newHouseOriginIssue(mk({ rightAcquisitionDate: "2025-09-15" }), "b")).toBeNull();
  });
  it("승계 입주권의 관리처분계획 인가일은 승계취득일보다 늦을 수 없다(같은 날·공란은 허용)", () => {
    const mk = (over: object) =>
      ({ id: "b", acquisitionDate: "2008-09-30", acquisitionOrigin: "successor_right", rightAcquisitionDate: "2005-06-01", ...over }) as never;
    const late = newHouseOriginIssue(mk({ rightApprovalDate: "2005-06-02" }), "b");
    expect(late?.field).toBe("rightApprovalDate");
    expect(late?.message).toContain("승계취득일보다 늦을 수 없");
    expect(newHouseOriginIssue(mk({ rightApprovalDate: "2005-06-01" }), "b")).toBeNull();
    expect(newHouseOriginIssue(mk({}), "b")).toBeNull();
  });
  it("질문은 양도 주택보다 나중에 취득한 행에만 연다 (같은 날은 후보가 아니다)", () => {
    expect(newHouseOriginQuestionVisible("housing", "2015-03-15", { acquisitionDate: "2025-09-15" })).toBe(true);
    expect(newHouseOriginQuestionVisible("housing", "2015-03-15", { acquisitionDate: "2015-03-15" })).toBe(false);
    expect(newHouseOriginQuestionVisible("housing", "2015-03-15", { acquisitionDate: "2010-01-01" })).toBe(false);
    expect(newHouseOriginQuestionVisible("land", "2015-03-15", { acquisitionDate: "2025-09-15" })).toBe(false);
  });
  it("권리 유래 행이면 폼 전역 계약일 칸을 행의 권리 취득일이 덮는다 (일반·모름·미수집은 그대로)", () => {
    const f = { newHouseContractDate: "2018-06-15" };
    expect(eraFormWithOriginDates(f, { kind: "presale", rightAcquisitionDate: "2021-09-01" }).newHouseContractDate).toBe("2021-09-01");
    expect(eraFormWithOriginDates(f, { kind: "general", rightAcquisitionDate: "2021-09-01" }).newHouseContractDate).toBe("2018-06-15");
    expect(eraFormWithOriginDates(f, { kind: "not_collected" }).newHouseContractDate).toBe("2018-06-15");
    expect(eraFormWithOriginDates(f, undefined)).toBe(f);
  });
});

// ─── 판정 메뉴 route ────────────────────────────────────────────────────────────
const menu = (houses: Record<string, unknown>[], over: Record<string, unknown> = {}, asset: Record<string, unknown> = {}): RulingCase => ({
  id: "d43",
  docNo: "-",
  docDate: "-",
  basis: "current",
  today: "2026-10-10",
  summary: "신규 주택 취득 경위",
  bucket: "match",
  form: {
    isOneHousehold: true,
    transferDate: "2026-06-15",
    contractTotalPrice: "800000000",
    asset: { assetKind: "housing", acquisitionDate: "2015-03-15", ...asset },
    houses,
    ...over,
  } as RulingCase["form"],
});

describe("R 판정 메뉴 route", () => {
  it("R-1 원조합원(기존주택) — 기존주택 취득일이 종전주택보다 앞서면 2주택(일시적 아님) 과세 / 일반 취득 짝은 비과세", async () => {
    const oldOrigin = await observeCase(
      menu([{ id: "b", region: "capital", acquisitionDate: "2025-09-15", acquisitionOrigin: "original_member_house", rightAcquisitionDate: "2005-01-10" }]),
    );
    expect(oldOrigin.isExempt).toBe(false);
    const general = await observeCase(menu([{ id: "b", region: "capital", acquisitionDate: "2025-09-15", acquisitionOrigin: "general" }]));
    expect(general.isExempt).toBe(true);
    expect(general.appliedExceptions).toContain("155-1-temporary-two-house");
  });

  it("R-2 원조합원(기존주택)의 기존주택 취득일이 선후와 3년 기한을 정한다 (완공일 기준이면 3년 이내인 사례가 과세)", async () => {
    const mk = (transferDate: string) =>
      observeCase(
        menu([{ id: "b", region: "capital", acquisitionDate: "2024-09-15", acquisitionOrigin: "original_member_house", rightAcquisitionDate: "2022-01-10" }], { transferDate }),
      );
    // 기존주택 2022-01-10 + 3년 = 2025-01-10(금) → 그날까지는 §155① (말일이 토·일이면 민법 §161로 익일 — 2025-01-11·12는 토·일이라 월요일 13일까지)
    const within = await mk("2025-01-10");
    expect(within.isExempt).toBe(true);
    const over = await mk("2025-01-14");
    expect(over.isExempt).toBe(false); // 완공일(2024-09-15)부터 세면 3년 이내인데도 과세
  });

  it("R-3 미답 → ⑧ 오류 + 불성립 + 확인 필요 / 모름 → ⑧ 오류 없음 + 같은 판정", async () => {
    const un = await observeCase(menu([{ id: "b", region: "capital", acquisitionDate: "2025-09-15" }]));
    expect(un.validationErrors.join(" ")).toContain("취득했는지");
    expect(un.isExempt).toBe(false);
    expect(un.undetermined).toContain("155-1-new-house-origin-unconfirmed");
    const known = await observeCase(menu([{ id: "b", region: "capital", acquisitionDate: "2025-09-15", acquisitionOrigin: "unknown" }]));
    expect(known.validationErrors).toEqual([]);
    expect(known.isExempt).toBe(false);
    expect(known.undetermined).toContain("155-1-new-house-origin-unconfirmed");
  });

  it("R-4 확인 필요는 결론을 가를 때만 — 처분기한이 어차피 지났으면 모름이어도 고지하지 않는다", async () => {
    const o = await observeCase(
      menu([{ id: "b", region: "capital", acquisitionDate: "2020-09-15", acquisitionOrigin: "unknown" }], { transferDate: "2026-06-15" }),
    );
    expect(o.isExempt).toBe(false);
    expect(o.undetermined).not.toContain("155-1-new-house-origin-unconfirmed");
  });

  it("R-5 보유 중 분양권 갈래 — 판정 메뉴는 양론을 함께 보인다 (결론이 갈릴 때) · 같으면 병기하지 않는다", async () => {
    const differ = await observeCase(
      menu([{ id: "b", region: "capital", acquisitionDate: "2025-09-15", acquisitionOrigin: "presale", rightAcquisitionDate: "2022-03-15" }]),
    );
    expect(differ.isExempt).toBe(true); // 엔진 입장 A(현행 §155①)
    const issue = differ.contested.find((c) => c.id === "155-1-presale-holding-completion");
    expect(issue).toMatchObject({ enginePosition: "A", A: "exempt", B: "taxable" });
    const same = await observeCase(
      menu([{ id: "b", region: "capital", acquisitionDate: "2025-09-15", acquisitionOrigin: "presale", rightAcquisitionDate: "2024-03-15" }]),
    );
    expect(same.isExempt).toBe(true);
    // 두 입장 결론이 같아도 쟁점 자체는 목록에 있으나 conclusionsDiffer=false — 평가셋 contested 단언은 id·A·B만 본다
    expect(same.contested.find((c) => c.id === "155-1-presale-holding-completion")).toMatchObject({ A: "exempt", B: "exempt" });
  });

  it("R-6 권리 유래 행이면 폼 전역 계약일 칸이 아니라 행의 권리 취득일로 공고 전 취득을 판정한다 (원칙 4)", async () => {
    // 조정대상지역 두 주택 · 신규 취득 2025-09-15 · 폼 전역 계약일 칸에 낡은 값(2099)이 남아 있어도 행이 덮는다
    const o = await observeCase(
      menu(
        [{ id: "b", region: "capital", acquisitionDate: "2025-09-15", acquisitionOrigin: "successor_right", rightAcquisitionDate: "2024-06-15" }],
        { newHouseContractDate: "2099-01-01", transferDate: "2026-06-15" },
      ),
    );
    expect(o.validationErrors.filter((e) => e.includes("newHouseContractDate"))).toEqual([]);
  });

  it("R-7 2006.1.1. 전 승계 입주권 — 인가일 공란도 일반 취득과 같이 비과세 (종전: 공란이면 과세 + 확인 필요 · 순차면 확정 과세) · 인가일 > 승계취득일은 ⑧", async () => {
    // 종전주택 2004-01-01 · 신규 주택 완공 2011-09-30 · 양도 2012-06-01
    const mk = (o: Record<string, unknown>) =>
      observeCase(menu([{ id: "b", region: "non_capital", acquisitionDate: "2011-09-30", ...o }], { transferDate: "2012-06-01" }, { acquisitionDate: "2004-01-01" }));
    for (const o of [
      { acquisitionOrigin: "general" },
      { acquisitionOrigin: "successor_right", rightAcquisitionDate: "2005-06-01" },
      { acquisitionOrigin: "successor_right", rightAcquisitionDate: "2005-06-01", rightApprovalDate: "2004-12-01" },
      { acquisitionOrigin: "successor_right", rightAcquisitionDate: "2003-06-01" },
    ]) {
      const r = await mk(o);
      expect(r.isExempt).toBe(true);
      expect(r.appliedExceptions).toContain("155-1-temporary-two-house");
      expect(r.undetermined).not.toContain("155-1-new-house-origin-unconfirmed");
      expect(r.validationErrors).toEqual([]);
    }
    const bad = await mk({ acquisitionOrigin: "successor_right", rightAcquisitionDate: "2005-06-01", rightApprovalDate: "2005-06-02" });
    expect(bad.validationErrors.join(" ")).toContain("houses.0.rightApprovalDate");
  });
});

// ─── 계산기 route · ④ ───────────────────────────────────────────────────────────
describe("C 계산기", () => {
  const buildForm = (houses: Record<string, unknown>[], top: Record<string, unknown> = {}) => {
    const f = createDefaultTransferFormData();
    f.transferDate = "2026-06-15";
    f.isOneHousehold = true;
    f.contractTotalPrice = "800000000";
    f.householdNoPresaleRightsConfirmed = true;
    f.householdNoOtherHousesConfirmed = true;
    f.residencePeriodMonths = "0";
    Object.assign(f.assets[0], {
      assetKind: "housing",
      acquisitionCause: "purchase",
      acquisitionDate: "2015-03-15",
      actualSalePrice: "800000000",
      fixedAcquisitionPrice: "300000000",
      addressJibun: "테스트 주소 1",
      regionCode: "4377037000",
      residenceInputMode: "direct",
      residencePeriods: [],
      residencePeriodMonthsAsset: "0",
    });
    f.houses = houses.map((h) => ({
      region: "non_capital",
      regionCode: "4377037000",
      officialPrice: "100000000",
      isInherited: false,
      isLongTermRental: false,
      isApartment: false,
      isOfficetel: false,
      isUnsoldHousing: false,
      ...h,
    })) as never;
    Object.assign(f, top);
    return f;
  };
  const run = async (f: ReturnType<typeof buildForm>) => {
    let body: Record<string, unknown> = {};
    const realFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (_u: unknown, init?: RequestInit) => {
      body = JSON.parse(String(init?.body));
      return { ok: true, json: async () => ({ data: { mode: "single", result: {} } }) } as unknown as Response;
    }) as never;
    try {
      await callTransferTaxAPI(f);
    } catch {
      /* 본문만 본다 */
    } finally {
      globalThis.fetch = realFetch;
    }
    const res = await SINGLE(
      new NextRequest("http://localhost/api/calc/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
        body: JSON.stringify(body),
      }),
    );
    const json = (await res.json()) as { data?: { result: { isExempt: boolean; warnings: string[] } } };
    return { body, status: res.status, result: json.data?.result };
  };

  it("C-1 ④ — 명부 행의 경위·권리 취득일이 body에 실리고 같은 사실이 같은 결론으로 간다", async () => {
    const seq = await run(
      buildForm([{ id: "b", acquisitionDate: "2025-09-15", acquisitionOrigin: "presale", rightAcquisitionDate: "2014-09-01" }]),
    );
    expect((seq.body as { temporaryTwoHouse?: Record<string, unknown> }).temporaryTwoHouse?.newHouseOrigin).toEqual({
      kind: "presale",
      rightAcquisitionDate: "2014-09-01",
    });
    // 분양권 취득일 2014-09-01은 2021.1.1. 전이라 현행 §155①(완공일 기산) — 비과세
    expect(seq.result?.isExempt).toBe(true);
    const seq2021 = await run(
      buildForm([{ id: "b", acquisitionDate: "2025-09-15", acquisitionOrigin: "presale", rightAcquisitionDate: "2021-06-01" }], {
        // 종전주택을 2022년으로 — 분양권이 앞선 순차 사례
      }),
    );
    expect(seq2021.status).toBe(200);
  });

  it("C-2 순차 사례 — 분양권 2021-09-01 · 종전주택 2023-03-15 → 과세 (일반 취득 짝은 비과세)", async () => {
    const mkForm = (origin: Record<string, unknown>) => {
      const f = buildForm([{ id: "b", acquisitionDate: "2024-06-15", ...origin }], { transferDate: "2025-06-15" });
      f.assets[0].acquisitionDate = "2023-03-15";
      return f;
    };
    const seq = await run(mkForm({ acquisitionOrigin: "presale", rightAcquisitionDate: "2021-09-01" }));
    expect(seq.result?.isExempt).toBe(false);
    const general = await run(mkForm({ acquisitionOrigin: "general" }));
    expect(general.result?.isExempt).toBe(true);
  });

  it("C-3 직접 선언 폴백(명부 없음) — not_collected를 싣고 §155①으로 비과세가 서면 확인 필요 경고를 낸다", async () => {
    const f = buildForm([], { temporaryTwoHouseSpecial: true, newHouseAcquisitionDate: "2024-09-15", householdHousingCount: "2" });
    f.householdNoOtherHousesConfirmed = false;
    const r = await run(f);
    expect((r.body as { temporaryTwoHouse?: Record<string, unknown> }).temporaryTwoHouse?.newHouseOrigin).toEqual({ kind: "not_collected" });
    expect(r.result?.isExempt).toBe(true);
    expect(r.result?.warnings.join(" ")).toContain("취득한 주택인지 답하지 않았거나 이 경로에서 묻지 못했습니다");
  });

  it("C-4 구 중과 배제 8호(2023.2.28. 전 양도분)는 이 갈래 분리를 적용하지 않는다 — 현행 유지 + 비과세와 엇갈릴 때만 확인 필요 (결정 #43 하위 1 나)", async () => {
    const mk = async (origin: Record<string, unknown>) => {
      const f = buildForm([{ id: "n", region: "capital", regionCode: "1168010100", acquisitionDate: "2022-03-01", officialPrice: "900000000", ...origin }], {
        transferDate: "2022-05-02",
        contractTotalPrice: "2000000000",
      });
      Object.assign(f.assets[0], { acquisitionDate: "2021-06-01", actualSalePrice: "2000000000", fixedAcquisitionPrice: "1500000000", regionCode: "1168010100" });
      const r = await run(f);
      const j = r.result as unknown as {
        multiHouseSurchargeDetail?: { exclusionReasons: { type: string }[]; warnings: string[] };
      };
      return j.multiHouseSurchargeDetail!;
    };
    // 일반 취득 — 8호 성립(일시적 2주택) · 고지 없음
    const general = await mk({ acquisitionOrigin: "general" });
    expect(general.exclusionReasons.map((x) => x.type)).toContain("temporary_two_house");
    expect(general.warnings.join(" ")).not.toContain("옛 중과 배제 조항");
    // 순차 분양권 — 비과세는 불성립인데 8호는 현행대로 성립 → 엇갈림을 알린다(세액은 현행 유지)
    const seq = await mk({ acquisitionOrigin: "presale", rightAcquisitionDate: "2021-03-01" });
    expect(seq.exclusionReasons.map((x) => x.type)).toContain("temporary_two_house");
    expect(seq.warnings.join(" ")).toContain("옛 중과 배제 조항");
  });

  it("C-5 중과 15호가 같은 정본을 읽는다 — 순차 사례는 비과세뿐 아니라 15호 중과 배제도 불성립 (일반 취득 34,413,500 → 순차 299,816,000 + 다주택 중과)", async () => {
    const mk = async (origin: Record<string, unknown>) => {
      const f = buildForm(
        [{ id: "n", region: "capital", regionCode: "1168010100", acquisitionDate: "2025-09-15", officialPrice: "900000000", ...origin }],
        { transferDate: "2026-09-01", contractTotalPrice: "2000000000", residencePeriodMonths: "52" },
      );
      Object.assign(f.assets[0], {
        acquisitionDate: "2022-05-01",
        actualSalePrice: "2000000000",
        fixedAcquisitionPrice: "1500000000",
        regionCode: "1168010100",
        residencePeriodMonthsAsset: "52",
      });
      const r = await run(f);
      const j = r.result as unknown as {
        totalTax: number;
        isPartialExempt: boolean;
        multiHouseSurchargeEvaluation?: { surchargeType: string };
      };
      return j;
    };
    const general = await mk({ acquisitionOrigin: "general" });
    expect(general).toMatchObject({ totalTax: 34_413_500, isPartialExempt: true });
    expect(general.multiHouseSurchargeEvaluation?.surchargeType).toBe("none");
    // 신규 주택 분양권을 종전주택(2022-05-01)보다 앞선 2021-06-01에 취득 — 순차
    const seq = await mk({ acquisitionOrigin: "presale", rightAcquisitionDate: "2021-06-01" });
    expect(seq).toMatchObject({ totalTax: 299_816_000, isPartialExempt: false });
    expect(seq.multiHouseSurchargeEvaluation?.surchargeType).toBe("multi_house_2");
  });
});
