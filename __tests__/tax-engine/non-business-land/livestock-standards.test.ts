/**
 * 축산용 토지 기준면적 정본 anchor
 *
 * 「소득세법 시행령」 [별표 1의3](개정 2008.2.22) = 「지방세법 시행령」 §102①3호 [표]
 * — 2026-08-06 원문 대조 결과 **값·비고 완전 동일**. 정본은 `lib/tax-engine/livestock-standard-area.ts`.
 *
 * # 🔴 산식 정정 (2026-08-06) — **세액이 바뀐다**
 *
 * 표의 열 묶음 헤더가 접속사를 구분한다:
 *
 * | 열 묶음 | 접속사 | 처리 |
 * |---|---|---|
 * | 축사 **및** 부대시설 | 및 | 둘 다 더한다 |
 * | 초지 **또는** 사료포(사료밭) | **또는** | **둘 중 하나** = `max` |
 *
 * 종전 구현은 넷을 모두 **합산**했다. 문언대로 읽으면 `축사 + 부대시설 + max(초지, 사료포)`이고,
 * 표에서 항상 초지 ≥ 사료포이므로 실질은 **초지 값**이 된다.
 *
 * > ⚠️ **권위 있는 근거는 없다**(2026-08-06 실측): 법제처 법령해석례 **0건**, 조세심판례
 * > 국심1994경1281 **1건뿐인데 본문이 「(내용없음)」**. 문언 해석이며, 한도가 줄어
 * > **납세자에게 불리한 방향**이다 — 예규 확인 시 재검토 대상.
 * > 경위: `docs/02-design/features/livestock-standard-area-limit.plan.md`
 *
 * 아래 표가 before/after를 값으로 고정한다. 초지·사료포가 「-」인 3종(돼지·가금·밍크)은 **불변**이다.
 */
import { describe, it, expect } from "vitest";
import {
  computeLivestockStandardArea,
  LIVESTOCK_STANDARD,
  perUnitStandardArea,
} from "@/lib/tax-engine/livestock-standard-area";
import { getLivestockStandardArea } from "@/lib/tax-engine/non-business-land/data/livestock-standards";

describe("축산용 토지 기준면적 — 초지·사료포는 max (정정 후)", () => {
  // 한우(육우) 사육 1두당: 7.5 + 5 + max(0.5ha=5000, 0.25ha=2500) = 5,012.5  [종전 7,512.5]
  it("AT-LIVESTOCK-1: 한우 육우 사육 1두 → 5,012.5 (종전 7,512.5)", () => {
    expect(computeLivestockStandardArea("hanwoo_breeding", 1)).toBe(5012.5);
  });
  // 한우(육우) 비육 1두당: 7.5 + 5 + max(2000, 1000) = 2,012.5  [종전 3,012.5]
  it("AT-LIVESTOCK-2: 한우 육우 비육 1두 → 2,012.5 (종전 3,012.5)", () => {
    expect(computeLivestockStandardArea("hanwoo_fattening", 1)).toBe(2012.5);
  });
  // 유우 목장 1두당: 11 + 7 + max(5000, 2500) = 5,018  [종전 7,518]
  it("AT-LIVESTOCK-3: 유우 1두 → 5,018 (종전 7,518)", () => {
    expect(computeLivestockStandardArea("dairy", 1)).toBe(5018);
  });
  // 양 목장 10두당: 8 + 3 + max(5000, 2500) = 5,011 → 100두 = 50,110  [종전 75,110]
  it("AT-LIVESTOCK-4: 양 100두 → 50,110 (10두당 5,011 · 종전 75,110)", () => {
    expect(computeLivestockStandardArea("sheep", 100)).toBe(50110);
  });
  // 사슴 목장 10두당: 66 + 16 + max(5000, 2500) = 5,082  [종전 7,582]
  it("AT-LIVESTOCK-5: 사슴 10두 → 5,082 (종전 7,582)", () => {
    expect(computeLivestockStandardArea("deer", 10)).toBe(5082);
  });
  // 토끼 사육 100두당: 33 + 7 + max(2000, 1000) = 2,040  [종전 3,040]
  it("AT-LIVESTOCK-6: 토끼 100두 → 2,040 (종전 3,040)", () => {
    expect(computeLivestockStandardArea("rabbit", 100)).toBe(2040);
  });
});

describe("초지·사료포가 「-」인 3종은 정정 전후 동일하다", () => {
  it("AT-LIVESTOCK-7: 돼지 5두 → 63 (50 + 13, 불변)", () => {
    expect(computeLivestockStandardArea("pig", 5)).toBe(63);
  });
  it("AT-LIVESTOCK-8: 가금 100수 → 49 (33 + 16, 불변)", () => {
    expect(computeLivestockStandardArea("poultry", 100)).toBe(49);
  });
  it("AT-LIVESTOCK-9: 밍크 5수 → 14 (7 + 7, 불변)", () => {
    expect(computeLivestockStandardArea("mink", 5)).toBe(14);
  });
});

describe("표 정본 — 원문과 대조", () => {
  it("AT-LIVESTOCK-10: 미지원 축종 → 0 (호출부가 「추정 금지」로 처리)", () => {
    expect(computeLivestockStandardArea("unknown", 100)).toBe(0);
  });

  it("AT-LIVESTOCK-11: 9종이며 초지 ≥ 사료포다 (max가 곧 초지임을 보장)", () => {
    const keys = Object.keys(LIVESTOCK_STANDARD);
    expect(keys).toHaveLength(9);
    for (const k of keys) {
      const s = LIVESTOCK_STANDARD[k];
      expect(s.grasslandM2, `${k}: 초지 < 사료포`).toBeGreaterThanOrEqual(s.fodderM2);
    }
  });

  it("AT-LIVESTOCK-12: 헥타르 환산이 표와 맞는다 (0.5ha=5,000 · 0.25ha=2,500 · 0.2ha=2,000 · 0.1ha=1,000)", () => {
    expect(LIVESTOCK_STANDARD.hanwoo_breeding.grasslandM2).toBe(5000);
    expect(LIVESTOCK_STANDARD.hanwoo_breeding.fodderM2).toBe(2500);
    expect(LIVESTOCK_STANDARD.hanwoo_fattening.grasslandM2).toBe(2000);
    expect(LIVESTOCK_STANDARD.hanwoo_fattening.fodderM2).toBe(1000);
  });

  it("AT-LIVESTOCK-13: perUnitStandardArea는 축사+부대시설+max다", () => {
    const s = LIVESTOCK_STANDARD.dairy;
    expect(perUnitStandardArea(s)).toBe(11 + 7 + 5000);
    // 합산이었다면 7,518이 나온다 — 정정이 실제로 반영됐는지의 대조점
    expect(perUnitStandardArea(s)).not.toBe(7518);
  });
});

describe("하위 호환 — NBL 재수출 경로", () => {
  it("AT-LIVESTOCK-14: 종전 이름 `getLivestockStandardArea`가 같은 값을 준다", () => {
    // 재수출이 끊기면 `tsc`가 잡지만, **다른 구현으로 갈라지는 것**은 못 잡는다.
    expect(getLivestockStandardArea("hanwoo_breeding", 1)).toBe(
      computeLivestockStandardArea("hanwoo_breeding", 1),
    );
    expect(getLivestockStandardArea("dairy", 3)).toBe(5018 * 3);
  });
});
