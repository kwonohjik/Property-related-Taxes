/**
 * anchor: 대장 재대조에서 살아 있던 **보통·낮음 15건** — 순수 함수·엔진 echo 축.
 *
 * 축은 셋이다:
 *   ① ⑤ 렌더 게이트 ↔ ⑧ 무게이트 (빈 값이 남으면 지울 화면도 남아야 한다)
 *   ② 다건이 단건 수정을 못 따라감 (`filingDisplay` echo 신설)
 *   ③ 표시가 엔진과 다른 판정
 *
 * 렌더 축은 `ui-review-remaining-med.test.tsx`에 있다.
 */
import { describe, it, expect } from "vitest";
import {
  LTHD_HOLDING_STEP_LABEL,
  LTHD_RESIDENCE_STEP_LABEL,
} from "@/lib/tax-engine/transfer-tax-lthd-steps";


describe("B. 장특 sub-step 라벨은 엔진이 단일 소스다", () => {
  it("🔑 B-1: 표시 계층이 찾는 라벨과 엔진이 emit하는 라벨이 같은 상수다", () => {
    expect(LTHD_HOLDING_STEP_LABEL).toBe("보유 기간분 장특");
    expect(LTHD_RESIDENCE_STEP_LABEL).toBe("거주 기간분 장특");
  });
});

/* ── 축 ③ ─────────────────────────────────────────────────────── */

/**
 * ⚠️ A(주택수 판정 입력 게이트)·C(부수토지 배율)의 **leaf 단언은 여기 두지 않는다**.
 *
 * 뮤테이션 프로브에서 그 8건이 **전부 통과**했다 — leaf는 신규 파일이거나 이미 있던 엔진
 * 함수라, 컴포넌트가 그것을 **부르는지**는 증명하지 못한다
 * ([[feedback_library_anchor_does_not_prove_component_uses_it]]).
 * ⇒ `__tests__/components/ui-review-remaining-med.test.tsx`의 G-*(Step4 렌더)·
 *   H-*(배지 훅)가 그 축을 고정한다.
 */
