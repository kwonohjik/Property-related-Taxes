/**
 * anchor: 단건 자동 백업이 다건 작업을 지우지 않는다 (2026-09-05 · 코드리뷰 Q28)
 *
 * ## 종전 결함
 *
 * 단건 계산기는 계산 성공 시 다건 store의 `properties[0]`에 폼을 자동 백업하는데,
 * 그 앞에서 `multiStore.reset()`을 **무조건** 불렀다. 다건에 자산 3건을 입력해 두고
 * (계산 전) 단건에서 「세금 계산하기」를 한 번 누르면 그 3건이 **경고·확인 없이** 전부
 * 사라졌다. 주석은 정반대로 「보존된다」고 설명하고 있었다.
 *
 * ## 판정 신호는 propertyId 하나뿐이다
 *
 * 백업본과 사용자 입력을 겉으로 구별할 방법이 없다 — 라벨(「양도 1번」)은 사용자가 다건에서
 * 처음 만든 건에도 붙는다. 그래서 호출부가 **직전 백업의 propertyId**를 세션 ref로 들고
 * 있다가 넘긴다. 새로고침 등으로 그 id가 사라지면 「사용자 입력」으로 판정되어 보존된다 —
 * 백업이 한 번 갱신되지 않는 것보다 입력이 사라지는 쪽이 훨씬 나쁘기 때문이다.
 */
import { describe, it, expect } from "vitest";
import { multiStoreHasUserWork } from "../../lib/stores/multi-transfer-tax-store";

const p = (id: string) => ({ propertyId: id });

describe("multiStoreHasUserWork — 덮어쓰면 데이터 손실이 나는가", () => {
  it("빈 store → false (덮어써도 잃을 것이 없다)", () => {
    expect(multiStoreHasUserWork([], null)).toBe(false);
    expect(multiStoreHasUserWork([], "prop-1")).toBe(false);
  });

  it("🔴 자산 3건 작업 중 → true (종전에는 이 3건이 조용히 사라졌다)", () => {
    expect(multiStoreHasUserWork([p("a"), p("b"), p("c")], null)).toBe(true);
  });

  it("이 세션이 만든 백업 1건뿐 → false (백업은 갱신해도 된다)", () => {
    expect(multiStoreHasUserWork([p("backup-1")], "backup-1")).toBe(false);
  });

  it("사용자가 다건에서 만든 1건 → true (id가 다르면 백업이 아니다)", () => {
    expect(multiStoreHasUserWork([p("user-1")], "backup-1")).toBe(true);
  });

  it("백업 id를 모르면(새로고침 후) 1건도 보존한다 — 안전측", () => {
    expect(multiStoreHasUserWork([p("backup-1")], null)).toBe(true);
  });

  it("백업 id가 있어도 2건 이상이면 사용자가 늘린 것 → true", () => {
    // 백업은 언제나 1건만 넣는다. 2건째부터는 사용자가 다건에서 추가한 것이다.
    expect(multiStoreHasUserWork([p("backup-1"), p("user-2")], "backup-1")).toBe(true);
  });
});
