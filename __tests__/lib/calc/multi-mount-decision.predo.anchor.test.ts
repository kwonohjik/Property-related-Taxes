/**
 * Pre-Do anchor — 다건 마법사 **마운트 판정표**
 *
 * 계획서: `docs/00-pm/multi-mount-effect-stale-closure.plan.md`
 *
 * ## 왜 판정을 순수 함수로 빼는가
 *
 * 마운트 `useEffect(..., [])`의 세 분기는 지금 effect 안에 묻혀 있어 **단위로 잴 수 없다**.
 * 빼면 우선순위·경계가 여기 고정되고, 「무엇을 입력으로 주는가」(stale closure ↔ live state)가
 * 호출부의 한 줄로 드러난다.
 *
 * ## 🔑 이 anchor만으로는 결함을 못 잡는다
 *
 * 순수 함수는 **무엇을 넣는지 모른다**. 실제 결함은 effect가 **첫 렌더(persist 리하이드레이션
 * 전)의 closure**를 넣는 것이었다 — 그 축은 **E2E가 유일한 안전망**이다.
 * 여기서는 판정표만 고정한다.
 */
import { describe, it, expect } from "vitest";
import { decideMultiMountAction } from "@/lib/calc/multi-mount-decision";
import type { MultiTransferFormData, PropertyItem } from "@/lib/stores/multi-transfer-tax-store";

const prop = (id: string): PropertyItem =>
  ({ propertyId: id, propertyLabel: id, form: {}, completionPercent: 0 }) as unknown as PropertyItem;

function form(o: Partial<MultiTransferFormData>): Pick<
  MultiTransferFormData,
  "activeStep" | "properties" | "activePropertyIndex"
> {
  return {
    activeStep: "list",
    properties: [],
    activePropertyIndex: 0,
    ...o,
  } as Pick<MultiTransferFormData, "activeStep" | "properties" | "activePropertyIndex">;
}

describe("A-1·A-2. 결과 단계 복구 — result는 partialize 제외라 재진입 시 null이다", () => {
  it("A-1 자산이 있으면 공통 설정으로 되돌린다", () => {
    expect(decideMultiMountAction(form({ activeStep: "result", properties: [prop("a")] }), false))
      .toEqual({ kind: "restore-step", step: "settings" });
  });

  it("A-1b 자산이 없으면 자산 목록으로 되돌린다", () => {
    expect(decideMultiMountAction(form({ activeStep: "result" }), false)).toEqual({
      kind: "restore-step",
      step: "list",
    });
  });

  it("A-2 결과가 살아 있으면 건드리지 않는다", () => {
    expect(decideMultiMountAction(form({ activeStep: "result", properties: [prop("a")] }), true))
      .toEqual({ kind: "none" });
  });
});

describe("A-3·A-4. 편집 진입 — 활성 자산 폼을 wizard로 끌어온다", () => {
  it("A-3 활성 인덱스의 자산이 있으면 그 인덱스로 동기화", () => {
    expect(
      decideMultiMountAction(
        form({ activeStep: "edit", properties: [prop("a"), prop("b")], activePropertyIndex: 1 }),
        false,
      ),
    ).toEqual({ kind: "sync-edit", propertyIndex: 1 });
  });

  it("A-4 인덱스가 범위 밖이면 아무것도 하지 않는다 — 빈 자산을 더 만들지 않는다", () => {
    expect(
      decideMultiMountAction(
        form({ activeStep: "edit", properties: [prop("a")], activePropertyIndex: 5 }),
        false,
      ),
    ).toEqual({ kind: "none" });
  });
});

describe("A-5·A-6. 첫 자산 자동 추가", () => {
  it("A-5 자산이 하나도 없이 자산 목록에 들어오면 첫 자산을 만든다", () => {
    expect(decideMultiMountAction(form({ activeStep: "list", properties: [] }), false)).toEqual({
      kind: "add-first",
    });
  });

  /**
   * 🔴 **이 케이스가 결함 그 자체다.**
   *    새로고침 시 effect가 첫 렌더의 closure(`properties: []`, `activeStep: "list"`)를 보고
   *    A-5로 판정해 자산을 추가했다 — **store에는 이미 자산이 복원돼 있었는데도**.
   *    실측: `{closureLen: 0, closureStep: "list"}` ↔ `{liveLen: 1, liveStep: "edit"}`.
   */
  it("A-6 자산이 이미 있으면 추가하지 않는다", () => {
    expect(
      decideMultiMountAction(form({ activeStep: "list", properties: [prop("a")] }), false),
    ).toEqual({ kind: "none" });
  });
});

describe("A-7. 분기는 activeStep으로 서로 배타적이다", () => {
  /**
   * 🔴 처음엔 「result 분기가 먼저 판정된다」는 **우선순위** 단언으로 썼는데,
   *    분기 순서를 바꾸는 뮤테이션이 **9건 전부를 통과**시켰다(구별력 0).
   *    이유를 손으로 따져 보면 당연하다 — 세 분기의 게이트가 `activeStep`의
   *    `"result"` / `"edit"` / `"list"`로 **상호 배타적**이라 **순서가 결과를 바꿀 수 없다**.
   *    ⇒ 공허한 단언을 유지하는 대신 **그 사실 자체**를 고정한다.
   *    (memory `feedback_mutation_zero_discrimination_is_not_proof`)
   */
  it("activeStep이 result면 properties가 비어 있어도 add-first로 가지 않는다", () => {
    expect(decideMultiMountAction(form({ activeStep: "result", properties: [] }), false)).toEqual({
      kind: "restore-step",
      step: "list",
    });
  });

  it("activeStep이 edit이면 properties가 비어 있어도 add-first로 가지 않는다", () => {
    expect(decideMultiMountAction(form({ activeStep: "edit", properties: [] }), false)).toEqual({
      kind: "none",
    });
  });

  it("settings 단계는 아무것도 하지 않는다", () => {
    expect(
      decideMultiMountAction(form({ activeStep: "settings", properties: [prop("a")] }), false),
    ).toEqual({ kind: "none" });
  });
});
