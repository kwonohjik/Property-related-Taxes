/**
 * anchor(⑧·④·⑤) — 세대 보유 분양권·입주권 목록 필수화 (PR-D, 2026-10-05)
 *
 * 계획서 `docs/00-pm/roster-required-other-assets.plan.md` §4-5·§4-6(Q-17~Q-20).
 *
 * ## 재현한 결함 두 가지 (수정 전 FAIL이었다)
 *
 * (a) 입주권 양도 화면의 「세대 보유 조합원입주권 수」 숫자 칸(`householdRightCount`)과
 *     「분양권·입주권」 목록(`presaleRights`)이 **이중 입력**이었다 — 목록에 다른 조합원입주권을
 *     추가해도 숫자 칸이 "1"로 남아 있으면 그대로 「1개 보유」로 판정됐다(§4-6 V-5).
 *     ⇒ PD-A — ④가 더 이상 숫자 칸을 읽지 않고 목록에서 도출한다.
 *
 * (b) 대상 자산(housing·redevelopment_apt·right_to_move_in)에서 분양권·입주권 목록이 비어
 *     있어도 ⑧이 차단하지 않았다 — 「입력을 안 함」과 「정말 없음」을 구별할 수 없는 채로
 *     계산이 진행됐다(memory `feedback_unknown_fact_applies_unfavorably`와 같은 층위).
 *     ⇒ PD-B — ⑧이 「없음」 확정(`householdNoPresaleRightsConfirmed`)을 요구한다.
 *
 * | # | 주장 |
 * |---|---|
 * | PD-A1 | 목록에 다른 조합원입주권 1건 + 숫자 칸 "1" → ④는 숫자 칸을 무시하고 목록에서 2를 도출한다 |
 * | PD-A2 | 목록 0건 + 숫자 칸 "1"(기본값) → 도출 1(양도 대상 자신) — 스칼라와 우연히 같아도 "읽어서"가 아니다 |
 * | PD-B1 | housing·0행·미확정 → ⑧ 차단 |
 * | PD-B2 | housing·0행·확정 → ⑧ 통과 |
 * | PD-B3 | housing·1행 이상 → 미확정이어도 ⑧ 통과(행이 곧 입력) |
 * | PD-B4 | redevelopment_apt·right_to_move_in도 같다(대상 자산) |
 * | PD-B5 | presale_right(분양권 자신의 양도)는 대상 아님 — 0행이어도 차단하지 않는다(Q-11) |
 * | PD-C | `presaleRightsPatchWithConfirmClear` — 행이 생기면 확정을 해제한다, 줄어서 0행이 돼도 자동 재확정하지 않는다 |
 */
import { describe, it, expect } from "vitest";
import { collectStep1Issues } from "@/lib/calc/transfer-tax-validate-step1";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import {
  resolveHouseholdRightCount,
  presaleRightsPatchWithConfirmClear,
} from "@/lib/calc/household-house-count";

function form(over: Partial<TransferFormData> = {}): TransferFormData {
  const f = createDefaultTransferFormData();
  f.assets[0] = { ...f.assets[0], assetKind: "housing", acquisitionDate: "2015-01-01" };
  return { ...f, transferDate: "2024-06-01", filingDate: "2024-08-31", ...over };
}

function step1FieldsOf(f: TransferFormData): string[] {
  return collectStep1Issues(f)
    .filter((i) => i.field === "householdNoPresaleRightsConfirmed")
    .map((i) => i.message);
}

describe("PD-A ④ 입주권 수는 목록에서 도출한다 (이중 입력 해소)", () => {
  it("[PD-A1] 목록에 다른 조합원입주권 1건 + 숫자 칸 「1」 → 스칼라를 무시하고 2를 도출한다", () => {
    // 수정 전: ④가 householdRightCount 스칼라("1")를 그대로 읽어 1을 보냈다(결함).
    const presaleRights = [
      { id: "r1", type: "redevelopment_right" as const, acquisitionDate: "2015-01-01", region: "capital" as const },
    ];
    expect(resolveHouseholdRightCount("right_to_move_in", presaleRights)).toBe(2);
  });

  it("[PD-A2] 목록 0건 → 도출 1(양도 대상 입주권 자신)", () => {
    expect(resolveHouseholdRightCount("right_to_move_in", [])).toBe(1);
    expect(resolveHouseholdRightCount("right_to_move_in", undefined)).toBe(1);
  });

  it("[PD-A3] 분양권(presale_right)은 세지 않는다 — 조합원입주권만 센다", () => {
    const presaleRights = [
      { id: "p1", type: "presale_right" as const, acquisitionDate: "2015-01-01", region: "capital" as const },
    ];
    expect(resolveHouseholdRightCount("right_to_move_in", presaleRights)).toBe(1);
  });

  it("[PD-A4] 양도 대상이 주택이면(right_to_move_in이 아니면) 자신을 더하지 않는다", () => {
    const presaleRights = [
      { id: "r1", type: "redevelopment_right" as const, acquisitionDate: "2015-01-01", region: "capital" as const },
    ];
    expect(resolveHouseholdRightCount("housing", presaleRights)).toBe(1);
  });
});

describe("PD-B ⑧ 분양권·입주권 목록 필수화 — 대상 자산", () => {
  it("[PD-B1] housing·0행·미확정 → 차단", () => {
    const issues = step1FieldsOf(form({ presaleRights: [], householdNoPresaleRightsConfirmed: false }));
    expect(issues.length).toBe(1);
    expect(issues[0]).toMatch(/보유한 분양권·입주권이 없는지 확인/);
  });

  it("[PD-B2] housing·0행·확정 → 통과", () => {
    expect(step1FieldsOf(form({ presaleRights: [], householdNoPresaleRightsConfirmed: true }))).toEqual([]);
  });

  it("[PD-B3] housing·1행 이상 → 미확정이어도 통과(행이 곧 입력)", () => {
    const row = { id: "p1", type: "presale_right" as const, acquisitionDate: "2020-01-01", region: "capital" as const };
    expect(
      step1FieldsOf(form({ presaleRights: [row], householdNoPresaleRightsConfirmed: false })),
    ).toEqual([]);
  });

  it.each(["redevelopment_apt", "right_to_move_in"] as const)(
    "[PD-B4-%s] 대상 자산 — 0행·미확정 → 차단",
    (assetKind) => {
      const issues = step1FieldsOf(
        form({
          presaleRights: [],
          householdNoPresaleRightsConfirmed: false,
          assets: [{ ...createDefaultTransferFormData().assets[0], assetKind, acquisitionDate: "2015-01-01" }],
        }),
      );
      expect(issues.length).toBe(1);
    },
  );

  it("[PD-B5] presale_right(분양권 자신의 양도)는 대상 아님 — 0행이어도 차단하지 않는다(Q-11)", () => {
    const issues = step1FieldsOf(
      form({
        presaleRights: [],
        householdNoPresaleRightsConfirmed: false,
        assets: [{ ...createDefaultTransferFormData().assets[0], assetKind: "presale_right", acquisitionDate: "2015-01-01" }],
      }),
    );
    expect(issues).toEqual([]);
  });
});

describe("PD-C presaleRightsPatchWithConfirmClear — #1919 패턴", () => {
  it("[PD-C1] 행이 생기면(빈 행 포함) 확정을 해제한다", () => {
    const patch = presaleRightsPatchWithConfirmClear([
      { id: "p1", type: "presale_right" as const, acquisitionDate: "", region: "capital" as const },
    ]);
    expect(patch.householdNoPresaleRightsConfirmed).toBe(false);
  });

  it("[PD-C2] 0행으로 패치해도 확정 필드를 건드리지 않는다 — 자동 재확정 금지", () => {
    const patch = presaleRightsPatchWithConfirmClear([]);
    expect(patch).not.toHaveProperty("householdNoPresaleRightsConfirmed");
  });
});
