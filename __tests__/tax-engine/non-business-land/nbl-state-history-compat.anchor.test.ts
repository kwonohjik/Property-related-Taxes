/**
 * NBL-STATE-HISTORY-E0 · Anchor 2 — 하위호환 격자 골든 스냅샷 («이력 없음 = 바이트 동일»이라는 부정형 단언의 실행 확증)
 *
 * 계획서(정본): docs/01-plan/features/nbl-other-land-state-history.plan.md §4 E0 · §7
 *   엔진 계획서: docs/01-plan/features/nbl-other-land-state-history.engine.plan.md §4.4 · §7.2 Anchor 2 · §7.3 P-11
 * 결정: Q-15 (가′) · V-1 일 단위(과세기준일 단위 재제안 금지) — 이 anchor는 판정 단위와 무관하게 «이력 칸이 판정 결과를 바꾸지 않는다»만 고정한다.
 *
 * 구조
 *   · 격자 GRID(대표 입력 N개)의 `judgeNonBusinessLand` 결과 객체 **전체**(steps·warnings·echo 포함) + 같은 거래의 세액(`calculateTransferTax`)을
 *     master에서 생성한 스냅샷(`__snapshots__/…snap`)으로 고정한다. 의도적 변경 없이 스냅샷이 바뀌면 «이력 없음 경로가 달라졌다»는 뜻이다.
 *   · 모드 4종 — 필드 미전송 / `""` / `unchanged` / `unknown`. `""`·`unchanged`는 E2가 이 필드를 읽기 시작해도 «현행 그대로»(결과 객체 전체가 미전송과 같다 — P-11).
 *     **`unknown`만 E2에서 바뀐다**(엔진 §4.4 · 통합 Q-6): 기타토지는 현행 결과 + `NBL_STATE_HISTORY_UNKNOWN_NOTICE` 한 줄(세액·판정·steps·echo 불변), 타 지목은 그대로.
 *
 * ⚠️ 스냅샷 갱신(`-u`)은 «이력 없음 경로를 의도적으로 바꿨다»는 결정이 있을 때만. E2도 스냅샷(미전송 기준)은 한 글자도 바꾸지 않았다 — `unknown`의 한 줄은 모드 4종 단언이 따로 고정한다.
 */
import { describe, it, expect } from "vitest";
import { judgeNonBusinessLand } from "@/lib/tax-engine/non-business-land/engine";
import { DEFAULT_NON_BUSINESS_LAND_RULES } from "@/lib/tax-engine/non-business-land/types";
import type { NonBusinessLandInput } from "@/lib/tax-engine/non-business-land/types";
import { NBL_STATE_HISTORY_UNKNOWN_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { GRID, MODES, tax } from "@/__tests__/tax-engine/_helpers/nbl-state-history-grid";

const R = DEFAULT_NON_BUSINESS_LAND_RULES;

const snapshotOf = (nbl: NonBusinessLandInput) => ({ judgment: judgeNonBusinessLand(nbl, R), tax: tax(nbl) });

describe("NBL-STATE-HISTORY-E0 Anchor 2 — 격자 골든 스냅샷 (master 생성)", () => {
  it("격자 규모: 대표 입력 ≥ 12(엔진 §7.2) · 기타토지 외 지목 포함", () => {
    expect(Object.keys(GRID).length).toBeGreaterThanOrEqual(12);
    expect(Object.values(GRID).some((g) => g.landType !== "other_land")).toBe(true);
  });

  it.each(Object.entries(GRID))("%s", (name, input) => {
    expect(snapshotOf(input)).toMatchSnapshot(name.slice(0, 3));
  });

  it("세액 2값(전량 비사업용 253,960,000 / 전량 사업용 198,210,000)이 골든과 별개로 고정된다 — 잡종지 1,000㎡ · 양도 10억 · 취득 3억", () => {
    expect(tax(GRID["G01 나대지·종합합산 → 전량 비사업용(253,960,000)"]).calculatedTax).toBe(253_960_000);
    expect(tax(GRID["G02 나대지·별도합산 + 공지상태 근거 → 전량 사업용(198,210,000)"]).calculatedTax).toBe(198_210_000);
  });
});

describe("NBL-STATE-HISTORY-E0 Anchor 2 — 모드 3종(\"\"·unchanged은 미전송과 결과 객체 전체가 같다 · unknown은 고지 한 줄만 더한다)", () => {
  const same = Object.entries(GRID).flatMap(([name, input]) =>
    MODES.slice(1, 3).map(([modeName, extra]) => [name, modeName, input, extra] as const),
  );
  const unknown = Object.entries(GRID).map(([name, input]) => [name, input, MODES[3][1]] as const);

  it.each(same)("%s × %s", (_name, _mode, input, extra) => {
    const withField = { ...input, ...extra } as NonBusinessLandInput;
    // 판정 결과 전체(steps·warnings·echo 포함) + 세액 — 미전송과 한 글자도 다르지 않다.
    expect(snapshotOf(withField)).toEqual(snapshotOf(input));
  });

  it.each(unknown)("%s × unknown — 기타토지는 고지 한 줄만 더하고 나머지(판정·steps·echo·세액)는 미전송과 같다 · 타 지목은 전부 같다", (_name, input, extra) => {
    const base = snapshotOf(input);
    const got = snapshotOf({ ...input, ...extra } as NonBusinessLandInput);
    const isOtherLand = input.landType === "other_land";
    expect(got.judgment.warnings.filter((w) => w === NBL_STATE_HISTORY_UNKNOWN_NOTICE)).toHaveLength(isOtherLand ? 1 : 0);
    expect({ ...got, judgment: { ...got.judgment, warnings: got.judgment.warnings.filter((w) => w !== NBL_STATE_HISTORY_UNKNOWN_NOTICE) } }).toEqual(base);
  });

  it("모드 격자 규모: 입력 × 3모드(미전송은 기준) 전수", () => {
    expect(same.length + unknown.length).toBe(Object.keys(GRID).length * 3);
  });
});
