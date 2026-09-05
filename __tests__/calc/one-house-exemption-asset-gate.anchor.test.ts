/**
 * anchor: §154① 1세대1주택 비과세 판정 대상 자산 술어 (2026-09-05)
 *
 * 코드리뷰 미결 Q05. 「§154① 괄호(취득 당시 조정대상지역 거주요건)가 입주권·분양권·재개발APT에
 * 어떤 기준일로 적용되는지」가 선행 확인 대상이었다. 조문 실측 결과 **자산마다 답이 다르다**.
 *
 * | 자산 | §154① 판정 | 근거 |
 * |---|---|---|
 * | 주택 | ✅ | 법 §89①3호가목 → 영 §154① |
 * | 재개발APT | ✅ | 재개발 신축주택은 §94①1호 「건물」이자 §89①3호가목 「주택」 — 엔진이 `checkExemption` 경계에서 `housing`으로 번역한다 |
 * | 조합원입주권 | ❌ | 비과세는 법 §89①**4호**. 「관리처분계획 인가일 현재 §89①3호가목에 해당하는 **기존주택**을 소유하는 세대」가 요건이고, 엔진은 그 판정을 `exemptionEligibleAtApproval` **자기선언**으로 받는다 |
 * | 분양권 | ❌ | 법 §89①4호가 **조합원입주권만** 열거한다 |
 *
 * 🔴 **세액 영향**: 종전 리셋 게이트가 `primaryKind !== "housing"`이라 재개발APT의
 *    `wasRegulatedAtAcquisition`을 **false로 강제**했다. 조정대상지역에서 취득한 재개발
 *    신축주택이 거주요건을 면제받아 비과세가 인정됐다(과소과세).
 *
 * ⚠️ 이 술어를 `isHousingLike`(4종)로 대체하지 말 것 — 축이 다르다.
 *    `isHousingLike` = 「세대 주택 목록을 입력받을 자산인가」.
 */
import { describe, it, expect } from "vitest";
import {
  isOneHouseExemptionAsset,
  isHousingLike,
  ONE_HOUSE_EXEMPTION_ASSET_KINDS,
  HOUSING_LIKE_ASSET_KINDS,
} from "../../lib/calc/housing-like-asset";

describe("§154① 비과세 판정 대상 자산 — 조문별 포함/제외", () => {
  it.each([
    ["housing", true, "법 §89①3호가목 → 영 §154①"],
    ["redevelopment_apt", true, "신축주택은 §89①3호가목의 「주택」"],
    ["right_to_move_in", false, "비과세는 §89①4호 — exemptionEligibleAtApproval 자기선언이 흡수"],
    ["presale_right", false, "§89①4호가 조합원입주권만 열거"],
    ["land", false, "주택 아님"],
    ["building", false, "주택 아님"],
    ["commercial_building", false, "주택 아님"],
    ["general_building", false, "주택 아님"],
  ])("%s → %s (%s)", (kind, expected) => {
    expect(isOneHouseExemptionAsset(kind)).toBe(expected);
  });

  it("undefined는 false (미선택 상태에서 게이트가 열리지 않는다)", () => {
    expect(isOneHouseExemptionAsset(undefined)).toBe(false);
    expect(isOneHouseExemptionAsset("")).toBe(false);
  });
});

describe("🔴 isHousingLike와 **다른 술어**다 — 합치지 말 것", () => {
  it("§154① 집합은 isHousingLike의 진부분집합이다", () => {
    for (const k of ONE_HOUSE_EXEMPTION_ASSET_KINDS) {
      expect(HOUSING_LIKE_ASSET_KINDS.has(k)).toBe(true);
    }
    expect(ONE_HOUSE_EXEMPTION_ASSET_KINDS.size).toBeLessThan(HOUSING_LIKE_ASSET_KINDS.size);
  });

  it("입주권·분양권에서 두 술어가 갈린다 (구별력 확인 — 대조군)", () => {
    for (const k of ["right_to_move_in", "presale_right"]) {
      expect(isHousingLike(k)).toBe(true);          // 세대 주택 목록은 입력받는다
      expect(isOneHouseExemptionAsset(k)).toBe(false); // §154① 판정은 안 받는다
    }
  });
});
