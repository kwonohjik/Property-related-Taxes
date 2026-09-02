/**
 * anchor: 거리 스냅샷 fallback은 **거주 이력이 아예 없을 때만** 쓴다
 *
 * 발견 U1-02 (docs/reviews/nbl-code-review-2026-09.md) — 리뷰 확정 78건 중 유일하게
 * 어느 배치에도 들어가지 않았던 항목.
 *
 * ## 결함
 *
 * UI는 거주 이력이 1건이라도 생기면 「직선거리 (km)」 입력을 **화면에서 감춘다**
 * (`ResidenceHistorySection.tsx` — `histories.length === 0` 조건부 렌더).
 * 그런데 store 값 `nblFarmerResidenceDistance`는 남아 그대로 전송되고,
 * 엔진 게이트가 `residenceFromHistory.length === 0`(= **매칭된** 재촌 기간)이라
 * **이력이 있어도 하나도 매칭되지 않으면** 그 stale 거리로 전 보유기간을 재촌으로 인정했다.
 *
 * 방향은 **과소과세**다 — 비사업용이어야 할 농지가 사업용으로 뒤집혀 §104①8호 +10%p가 빠진다.
 * (§1 정정에 따라 장기보유특별공제는 현행법상 배제되지 않으므로 세액차는 +10%p 부분만이다.)
 *
 * ## 법령
 *
 * 「소득세법 시행령」 §168의8②은 재촌을 「제153조제3항에 따른 농지소재지에 **사실상 거주**」로
 * 정하고, §153③은 동일 시·군·구 / 연접 시·군·구 / 직선거리 30km를 요건으로 한다.
 * 즉 재촌은 **실제 거주지 ↔ 토지 관계**로 판정되어야 하며, 화면에서 사라진 과거 스냅샷 거리로
 * 전 보유기간을 재촌으로 간주할 근거가 없다. 저장소 정책(「자동 안분 fallback 금지」)과도 충돌한다.
 *
 * ⇒ 게이트를 「`residenceHistories`가 **아예 없을 때**」로 좁힌다. 그래야 `farmland.ts`의
 *   경고 문구(「주거 이력 미입력 — legacy 거리 스냅샷 fallback 사용」)와도 일치한다.
 */
import { describe, it, expect } from "vitest";
import { judgeFarmland } from "@/lib/tax-engine/non-business-land/farmland";
import type { NonBusinessLandInput, OwnerResidenceHistory } from "@/lib/tax-engine/non-business-land/types";
import { DEFAULT_NON_BUSINESS_LAND_RULES } from "@/lib/tax-engine/non-business-land/types";

const d = (s: string) => new Date(s);
const RULES = DEFAULT_NON_BUSINESS_LAND_RULES;

/** 강원특별자치도 평창군(51760) 농지 — 도시지역 밖 · 전 기간 자경 */
function farm(partial: Partial<NonBusinessLandInput> = {}): NonBusinessLandInput {
  return {
    landType: "farmland",
    landArea: 1000,
    zoneType: "agriculture_forest",
    acquisitionDate: d("2010-01-01"),
    transferDate: d("2024-06-01"),
    farmingSelf: true,
    landLocation: { sigunguCode: "51760" },
    businessUsePeriods: [{ startDate: d("2010-01-02"), endDate: d("2024-06-01"), usageType: "자경" }],
    gracePeriods: [],
    ...partial,
  };
}

/** 부산 강서구(26440) — 평창군과 동일·연접 어느 쪽도 아니고 좌표도 없다 */
const unmatchedHistory: OwnerResidenceHistory = {
  sidoName: "부산광역시",
  sigunguName: "강서구",
  sigunguCode: "26440",
  startDate: d("2010-01-01"),
  endDate: d("2024-06-01"),
  hasResidentRegistration: true,
};

describe("[U1-02] 거리 스냅샷 fallback 게이트", () => {
  it("🔴 이력이 있으나 하나도 매칭되지 않으면 stale 거리를 쓰지 않는다 → 비사업용", () => {
    const r = judgeFarmland(
      farm({
        ownerProfile: { residenceHistories: [unmatchedHistory] },
        farmerResidenceDistance: 5,
      }),
      RULES,
    );
    expect(r.isBusiness).toBe(false);
  });

  it("🔴 그 경우 「이력 미입력」 경고를 달지 않는다 (문구↔조건 일치)", () => {
    const r = judgeFarmland(
      farm({
        ownerProfile: { residenceHistories: [unmatchedHistory] },
        farmerResidenceDistance: 5,
      }),
      RULES,
    );
    expect((r.warnings ?? []).some((w) => w.includes("주거 이력 미입력"))).toBe(false);
  });

  it("이력이 아예 없으면 종전대로 거리 fallback (legacy 호환 — 과차단 방지)", () => {
    const r = judgeFarmland(farm({ farmerResidenceDistance: 5 }), RULES);
    expect(r.isBusiness).toBe(true);
    expect((r.warnings ?? []).some((w) => w.includes("주거 이력 미입력"))).toBe(true);
  });

  it("빈 배열도 「없음」으로 본다 (UI가 행을 모두 지운 경우)", () => {
    const r = judgeFarmland(
      farm({ ownerProfile: { residenceHistories: [] }, farmerResidenceDistance: 5 }),
      RULES,
    );
    expect(r.isBusiness).toBe(true);
  });

  it("이력이 매칭되면 거리와 무관하게 사업용 (대조군)", () => {
    const r = judgeFarmland(
      farm({
        ownerProfile: {
          residenceHistories: [{ ...unmatchedHistory, sigunguCode: "51760" }],
        },
      }),
      RULES,
    );
    expect(r.isBusiness).toBe(true);
  });

  it("거리가 한도를 넘으면 이력 없어도 재촌 아님 (과대적용 방지)", () => {
    const r = judgeFarmland(farm({ farmerResidenceDistance: 50 }), RULES);
    expect(r.isBusiness).toBe(false);
  });
});
