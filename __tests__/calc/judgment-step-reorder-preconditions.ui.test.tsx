/**
 * @vitest-environment jsdom
 *
 * anchor — 판정 마법사 **단계 재배치(②↔③)가 고친 두 결함**을 고정한다.
 * 계획서: `docs/00-pm/one-house-judgment-step-reorder.plan.md` §8 AN-1·AN-2.
 *
 * ## 이 파일은 Pre-Do anchor였고, 수정 후 **반전됐다**
 *
 * 재배치 **전**에 아래 두 진단을 현행에서 먼저 통과시켜 확정했다(그러지 않았다면 「현행 일치
 * 예상」이라는 추정으로 착수하는 것이다 — `pre-do-anchor-verification`):
 *
 *   - AN-1 취득일이 비면 「종전 주택 취득일」 칸 **자체가 없다**
 *     (`household-house-count.ts:263` → `TemporaryTwoHouseSection.tsx:123`이 `null`)
 *   - AN-2 주택 수 ≥ 2에서 합가일 칸이 ①과 ② **양쪽에** 뜬다
 *
 * 지금은 그 반대를 고정한다. **AN-1은 화면 순서가 되돌아가면, AN-2는 `hideMergeDate`가
 * 빠지면 다시 red가 된다** — 그것이 이 파일의 존재 이유다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Step1 } from "@/app/calc/one-house-exemption/steps/Step1";
import { Step2 } from "@/app/calc/one-house-exemption/steps/Step2";
import {
  createInitialOneHouseJudgmentForm,
  deriveJudgmentHouseCount,
  type OneHouseJudgmentFormData,
} from "@/lib/stores/one-house-judgment-form.types";
import { getStepErrorCount } from "@/lib/calc/one-house-exemption-validate";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";

vi.mock("@/components/ui/address-search", () => ({
  AddressSearch: () => null,
}));

afterEach(cleanup);

/** 명부 1채(2020-01-01) + 양도 대상 1채 = 2주택 ⇒ ③ 특례 섹션 노출 게이트 성립. */
const HOUSES = [
  {
    id: "h1",
    region: "capital",
    acquisitionDate: "2020-01-01",
    officialPrice: "300000000",
    isInherited: false,
    isLongTermRental: false,
    isApartment: true,
    isOfficetel: false,
    isUnsoldHousing: false,
  },
];

/**
 * 양도 대상 취득일만 변수로 남긴다.
 *
 * 🔑 `acquisitionDate: ""`가 **①→② 순방향으로 처음 도달한 상태**다 —
 *    그 값의 유일한 입력 경로가 ③ 단계이기 때문이다(`Step3.tsx:83-89`).
 */
function form(acquisitionDate: string): OneHouseJudgmentFormData {
  return {
    ...createInitialOneHouseJudgmentForm(),
    assets: [
      {
        ...makeDefaultAsset(1),
        assetKind: "housing",
        acquisitionCause: "purchase",
        acquisitionDate,
      },
    ],
    transferDate: "2026-06-01",
    isOneHousehold: true,
    houses: HOUSES,
    presaleRights: [],
  } as unknown as OneHouseJudgmentFormData;
}

describe("AN-1 — 취득일이 §155① 블록보다 **먼저** 입력된다", () => {
  /**
   * 게이트 자체는 열려 있음을 먼저 못 박는다. 이것이 없으면 「2주택이 아니라서 안 뜬 것」과
   * 「취득일이 없어서 안 뜬 것」이 구별되지 않는다(`feedback_guard_uses_proxy_not_the_claim`).
   */
  it("[AN-1a] 전제 — 취득일 유무와 무관하게 판정 주택 수는 2다", () => {
    expect(deriveJudgmentHouseCount(form(""))).toBe(2);
    expect(deriveJudgmentHouseCount(form("2018-01-01"))).toBe(2);
  });

  /**
   * 🔑 **이것이 재배치가 실제로 보증하는 것**이다.
   *
   * 컴포넌트를 단독으로 렌더하면 순서와 무관하므로 `Step2`만 봐서는 아무것도 증명되지 않는다
   * (`feedback_guard_uses_proxy_not_the_claim`). 보증의 실체는 **화면 인덱스 ↔ 검증 함수 매핑**이다:
   * 취득일을 막는 검증이 명부 화면보다 **앞 인덱스**에 있어야 순방향 진행에서 값이 채워진다.
   */
  it("[AN-1b] ② 양도 대상(idx 1)이 빈 취득일을 막고, ③ 명부(idx 2)는 막지 않는다", () => {
    expect(getStepErrorCount(form(""), 1)).toBeGreaterThan(0);
    expect(getStepErrorCount(form(""), 2)).toBe(0);
  });

  /** 음성 짝 — 취득일을 채우면 idx 1이 더는 막지 않는다(구별력 확보). */
  it("[AN-1c] 음성 짝 — 취득일을 채우면 idx 1의 차단이 사라진다", () => {
    const f = { ...form("2018-01-01"), contractTotalPrice: "1000000000" };
    expect(getStepErrorCount(f, 1)).toBe(0);
  });

  /**
   * 🔴 **회귀 감시** — 순서가 되돌아가면 사용자가 다시 보게 될 상태다.
   *    컴포넌트 동작 자체는 바뀌지 않았다(바꿀 이유가 없다). 순방향 진행에서 이 상태에
   *    **도달할 수 없게** 된 것이 이번 변경이고, 그것을 지키는 것이 AN-1b다.
   */
  it("[AN-1d] 취득일이 비면 §155① 블록은 여전히 그려지지 않는다 (도달 불가 상태)", () => {
    render(<Step2 form={form("")} onChange={() => {}} />);
    // `household-house-count.ts:263` → `TemporaryTwoHouseSection.tsx:123`이 `null`
    expect(screen.queryByText("종전 주택 취득일")).toBeNull();
    expect(screen.queryByText("일시적 2주택 특례 (§155①)")).toBeNull();
  });

  /** 긍정 짝 — 취득일이 있으면(= ②를 지나온 상태) 블록이 뜬다. */
  it("[AN-1e] 긍정 짝 — 취득일이 있으면 같은 폼에서 블록이 뜬다", () => {
    render(<Step2 form={form("2018-01-01")} onChange={() => {}} />);
    expect(screen.queryByText("종전 주택 취득일")).toBeTruthy();
    expect(screen.queryByText("일시적 2주택 특례 (§155①)")).toBeTruthy();
  });
});

describe("AN-2 — 합가일 칸이 ①과 ② 양쪽에 뜬다 (주택 수 ≥ 2)", () => {
  /**
   * `Step1.tsx:78` `judgmentMergeDateOwnedByStep1` = `!(분양권>0 && 주택수<2)` ⇒ 주택수 2면 true.
   * `TemporaryTwoHouseSection.tsx:461` `<MergeDateSection>`은 `full` 가드 **밖**이라 무조건 렌더.
   * 배타 규약 주석(`one-house-judgment-section-scope.ts:26-32`)이 이 경로를 빠뜨렸다.
   */
  it("[AN-2a] ① 세대 단계가 합가일을 소유한다", () => {
    render(<Step1 form={form("2018-01-01")} onChange={() => {}} />);
    expect(screen.queryByText("혼인합가일")).toBeTruthy();
    expect(screen.queryByText("동거봉양 합가일")).toBeTruthy();
  });

  it("[AN-2b] ③ 보유 주택 단계에는 같은 칸이 없다 (중복 해소)", () => {
    render(<Step2 form={form("2018-01-01")} onChange={() => {}} />);
    expect(screen.queryByText("혼인합가일")).toBeNull();
    expect(screen.queryByText("동거봉양 합가일")).toBeNull();
  });

  /**
   * 🔑 **부정 단언의 긍정 짝** — ③ 화면이 통째로 죽어도 AN-2b는 초록이다
   *    (`feedback_negative_anchor_needs_positive_twin`). 같은 렌더에서 그 섹션이 살아 있음을 본다.
   */
  it("[AN-2c] 긍정 짝 — ③에 특례 섹션 자체는 그대로 있다", () => {
    render(<Step2 form={form("2018-01-01")} onChange={() => {}} />);
    expect(screen.queryByText("③ 일시적 2주택·합가 특례")).toBeTruthy();
    expect(screen.queryByText("일시적 2주택 특례 (§155①)")).toBeTruthy();
  });
});
