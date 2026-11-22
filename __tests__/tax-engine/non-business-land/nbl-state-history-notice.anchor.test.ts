/**
 * NBL-STATE-HISTORY-E0 · Anchor 3 — 이력 없음 경로의 «양도일 현재 상태를 소유기간 전체에 적용» 확인 필요 고지
 *
 * 계획서(정본): docs/01-plan/features/nbl-other-land-state-history.plan.md §4 E0 · §7(P-3)
 *   엔진 계획서: docs/01-plan/features/nbl-other-land-state-history.engine.plan.md §4.3(고지 표) · §7.1 P-3a·b · §7.2 Anchor 3
 * 결정: Q-15 (가) · V-1 일 단위.
 *
 * 왜 필요한가 — 착수 전 mutation(P-3a)에서 고지 미탑재를 잡는 기존 테스트는 1건(`nbl2611-b2-echo`)뿐이었다. E1·E2는 이 고지 옆에
 * «이력 있음이면 한정 고지로 대체(`changed`)» 분기를 넣는다. 이력 없음·`""`·`unchanged`·`unknown` 경로의 고지는 **현행 그대로**여야 한다는 것을
 * 기타토지 격자 전수 × 모드 4종으로 고정한다(대체 고지는 `changed`에서만 — E2 Anchor).
 */
import { describe, it, expect } from "vitest";
import { judgeNonBusinessLand } from "@/lib/tax-engine/non-business-land/engine";
import { DEFAULT_NON_BUSINESS_LAND_RULES } from "@/lib/tax-engine/non-business-land/types";
import type { NonBusinessLandInput } from "@/lib/tax-engine/non-business-land/types";
import { NBL_REVENUE_BUSINESS_START_APPLIED_NOTICE, NBL_STATE_AT_TRANSFER_APPLIED_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { GRID, MODES } from "@/__tests__/tax-engine/_helpers/nbl-state-history-grid";

const R = DEFAULT_NON_BUSINESS_LAND_RULES;

const OTHER_LAND_CASES = Object.entries(GRID).filter(([, input]) => input.landType === "other_land");
const NON_OTHER_LAND_CASES = Object.entries(GRID).filter(([, input]) => input.landType !== "other_land");

describe("NBL-STATE-HISTORY-E0 Anchor 3 — 이력 없음 경로 고지(엔진)", () => {
  it("고지 문구 고정 — 양도일 현재 상태 · 소유기간 전체 · 확인 필요 · 법 §104조의3① 각 호 외의 부분 · 영 §168조의6", () => {
    expect(NBL_STATE_AT_TRANSFER_APPLIED_NOTICE).toContain("양도일 현재의 상태로 판정해 소유기간 전체에 적용했습니다");
    expect(NBL_STATE_AT_TRANSFER_APPLIED_NOTICE).toContain("확인 필요");
    expect(NBL_STATE_AT_TRANSFER_APPLIED_NOTICE).toContain("소득세법 §104조의3 ① 각 호 외의 부분");
    expect(NBL_STATE_AT_TRANSFER_APPLIED_NOTICE).toContain("소득세법 시행령 §168조의6");
  });

  it("격자에 기타토지 대표 입력 ≥ 12건 · 타 지목 대조군 포함", () => {
    expect(OTHER_LAND_CASES.length).toBeGreaterThanOrEqual(12);
    expect(NON_OTHER_LAND_CASES.length).toBeGreaterThanOrEqual(1);
  });

  const cases = OTHER_LAND_CASES.flatMap(([name, input]) => MODES.map(([modeName, extra]) => [name, modeName, input, extra] as const));

  it.each(cases)("기타토지 %s × %s — warnings에 고지가 정확히 1회", (_name, _mode, input, extra) => {
    const j = judgeNonBusinessLand({ ...input, ...extra } as NonBusinessLandInput, R);
    expect(j.warnings.filter((w) => w === NBL_STATE_AT_TRANSFER_APPLIED_NOTICE)).toHaveLength(1);
  });

  it.each(NON_OTHER_LAND_CASES)("타 지목 %s — 이력 칸을 소비하지 않으므로 모드 4종이 어떤 고지도 바꾸지 않는다", (_name, input) => {
    const base = judgeNonBusinessLand(input, R).warnings;
    for (const [, extra] of MODES) {
      expect(judgeNonBusinessLand({ ...input, ...extra } as NonBusinessLandInput, R).warnings).toEqual(base);
    }
  });

  it("농지(기간 판정 지목)에는 «양도일 현재 상태» 고지를 달지 않는다", () => {
    const [, farm] = NON_OTHER_LAND_CASES.find(([, i]) => i.landType === "farmland")!;
    expect(judgeNonBusinessLand(farm, R).warnings).not.toContain(NBL_STATE_AT_TRANSFER_APPLIED_NOTICE);
  });

  it("DM-01(당해 사업개시일) 경로: 개시일 고지(D1)와 «양도일 현재 상태» 고지가 함께 실린다 — 이력 없음 현행", () => {
    const [, input] = OTHER_LAND_CASES.find(([name]) => name.startsWith("G11"))!;
    const j = judgeNonBusinessLand(input, R);
    expect(j.warnings).toContain(NBL_REVENUE_BUSINESS_START_APPLIED_NOTICE);
    expect(j.warnings).toContain(NBL_STATE_AT_TRANSFER_APPLIED_NOTICE);
  });

  it("전량 사업용·전량 비사업용·부분 면적 모두 같은 고지 — 판정 결과와 무관", () => {
    const flags = new Set(OTHER_LAND_CASES.map(([, input]) => {
      const j = judgeNonBusinessLand(input, R);
      return `${j.isNonBusinessLand}/${j.surcharge.nonBusinessAreaRatio}`;
    }));
    expect(flags.size).toBeGreaterThanOrEqual(3); // 사업용(0) · 전량 비사업용(1) · 부분(0<r<1)이 격자에 모두 있다
    for (const [, input] of OTHER_LAND_CASES) {
      expect(judgeNonBusinessLand(input, R).warnings).toContain(NBL_STATE_AT_TRANSFER_APPLIED_NOTICE);
    }
  });
});
