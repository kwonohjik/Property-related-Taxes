/**
 * TTR — §155① 일시적 2주택 **신규주택을 명부에서 도출**한다 (2026-09-22 제보).
 *
 * ## 계기
 *
 * 「1세대1주택 비과세 판정」은 요건을 **자동 판정**하는 화면인데, §155①만 사용자가 토글
 * (`temporaryTwoHouseSpecial`)을 켜고 신규주택 취득일을 **직접 입력**해야 적용됐다.
 *
 * 실측(2주택 · 양도주택 2017-08-31 취득 · 명부 2024-05-30 · 양도 2026-09-30):
 *
 * | 입력 | 종전 판정 |
 * |---|---|
 * | 토글 OFF — 1년·3년 요건 전부 충족 | **과세** ← 명부에 사실이 다 있는데 |
 * | 토글 ON + 날짜 2024-05-30 | 비과세 |
 * | 토글 ON + **명부와 다른** 날짜 2026-01-01 | **비과세** ← 명부를 무시하고 그 값으로 판정 |
 *
 * 둘 다 잘못이다. 앞은 **법령에 없는 요건**을 만든 것이고 — 소령 §155①은 「…경우에는 이를
 * 1세대1주택으로 **보아** 제154조제1항을 적용한다」는 강행규정이라 납세자의 신청·선택을
 * 요건으로 하지 않는다(§155에서 신고서를 요구하는 항은 ⑬뿐이고 그것도 ⑦ 전용이다) —
 * 뒤는 `newHouseAcquisitionDate`가 명부와 **두 번째 진실**이 된 것이다(주택 수 스칼라↔명부
 * 괴리와 같은 구조, PR #1757).
 *
 * ## 도출 규칙
 *
 * 「양도주택보다 **나중에 취득한** 명부 행이 **정확히 1채**」면 그것이 신규주택.
 * 0채·2채 이상이면 도출하지 않고 종전 flat 필드로 폴백한다 — 억측으로 고르지 않는다.
 */
import { describe, it, expect } from "vitest";
import {
  resolveTemporaryTwoHouse,
  temporaryTwoHouseApplies,
} from "@/lib/calc/household-house-count";

const base = {
  primaryKind: "housing",
  primaryAcquisitionDate: "2017-08-31",
  legacyPrecedence: false,
  declaredSpecial: false,
  declaredNewHouseDate: "",
};

describe("TTR — §155① 신규주택 명부 도출", () => {
  it("TTR-1 제보 2주택 사례 — 토글 OFF여도 명부에서 도출된다", () => {
    const r = resolveTemporaryTwoHouse({ ...base, houses: [{ acquisitionDate: "2024-05-30" }] });
    expect(r).toEqual({
      previousAcquisitionDate: "2017-08-31",
      newAcquisitionDate: "2024-05-30",
      source: "roster",
    });
  });

  it("TTR-2 제보 3주택 사례 — 나중 취득이 1채뿐이면 도출된다", () => {
    // 2016-08-21은 양도주택(2017-08-31)보다 **먼저** 취득 → 후보가 아니다
    const r = resolveTemporaryTwoHouse({
      ...base,
      houses: [{ acquisitionDate: "2024-05-30" }, { acquisitionDate: "2016-08-21" }],
    });
    expect(r?.newAcquisitionDate).toBe("2024-05-30");
    expect(r?.source).toBe("roster");
  });

  it("TTR-3 🔴 나중 취득이 2채 — 억측으로 고르지 않는다(도출 안 함)", () => {
    const r = resolveTemporaryTwoHouse({
      ...base,
      houses: [{ acquisitionDate: "2024-05-30" }, { acquisitionDate: "2025-01-01" }],
    });
    expect(r).toBeUndefined();
  });

  it("TTR-4 나중 취득이 0채 — 도출 안 함", () => {
    const r = resolveTemporaryTwoHouse({ ...base, houses: [{ acquisitionDate: "2016-08-21" }] });
    expect(r).toBeUndefined();
  });

  it("TTR-5 취득일 없는 행은 후보에서 빠진다", () => {
    const r = resolveTemporaryTwoHouse({
      ...base,
      houses: [{ acquisitionDate: "2024-05-30" }, {}],
    });
    expect(r?.newAcquisitionDate).toBe("2024-05-30");
  });

  /** ── 폴백 — 명부가 정본이 아닌 경로는 **종전 그대로** 동작해야 한다 ── */

  it("TTR-6 명부 0건 + 레거시 선언 — flat 필드로 폴백(간이 입력 보존)", () => {
    const r = resolveTemporaryTwoHouse({
      ...base,
      houses: [],
      declaredSpecial: true,
      declaredNewHouseDate: "2024-05-30",
    });
    expect(r).toEqual({
      previousAcquisitionDate: "2017-08-31",
      newAcquisitionDate: "2024-05-30",
      source: "declared",
    });
  });

  it("TTR-7 명부 0건 + 선언 없음 — 도출 안 함", () => {
    expect(resolveTemporaryTwoHouse({ ...base, houses: [] })).toBeUndefined();
  });

  it("TTR-8 🔴 OH-34 레거시 표식 — 명부가 있어도 저장 당시 선언을 쓴다(세액 보존)", () => {
    const r = resolveTemporaryTwoHouse({
      ...base,
      houses: [{ acquisitionDate: "2024-05-30" }],
      legacyPrecedence: true,
      declaredSpecial: true,
      declaredNewHouseDate: "2023-01-01",
    });
    expect(r?.newAcquisitionDate).toBe("2023-01-01");
    expect(r?.source).toBe("declared");
  });

  it("TTR-9 권리 양도(F1) — 명부를 정본으로 쓰지 않는다", () => {
    const r = resolveTemporaryTwoHouse({
      ...base,
      primaryKind: "right_to_move_in",
      houses: [{ acquisitionDate: "2024-05-30" }],
    });
    expect(r).toBeUndefined();
  });

  it("TTR-10 양도주택 취득일이 없으면 「나중」을 가릴 수 없다 — 도출 안 함", () => {
    const r = resolveTemporaryTwoHouse({
      ...base,
      primaryAcquisitionDate: undefined,
      houses: [{ acquisitionDate: "2024-05-30" }],
    });
    expect(r).toBeUndefined();
  });

  it("TTR-11 같은 날 취득은 「나중」이 아니다", () => {
    const r = resolveTemporaryTwoHouse({ ...base, houses: [{ acquisitionDate: "2017-08-31" }] });
    expect(r).toBeUndefined();
  });

  it("TTR-12 `temporaryTwoHouseApplies`는 같은 판정의 boolean 사본이다", () => {
    const withRoster = { ...base, houses: [{ acquisitionDate: "2024-05-30" }] };
    const withoutRoster = { ...base, houses: [] };
    expect(temporaryTwoHouseApplies(withRoster)).toBe(true);
    expect(temporaryTwoHouseApplies(withoutRoster)).toBe(false);
    // 두 함수가 갈리면 화면(§154① 단서 카드)과 ④ 변환이 다른 답을 낸다
    expect(temporaryTwoHouseApplies(withRoster)).toBe(
      resolveTemporaryTwoHouse(withRoster) !== undefined,
    );
  });
});
