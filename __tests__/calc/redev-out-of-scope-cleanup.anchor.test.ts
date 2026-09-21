/**
 * anchor: 축이 바뀌면 범위 밖 재개발 필드가 함께 비워진다 (2026-09-05 · 코드리뷰 Q20)
 *
 * ## 종전 결함 — 채울 칸 없는 영구 차단
 *
 * ③-c 「비과세 보유 요건」 카드는 완공APT + 청산금 **수령** + 원조합원에서만 뜬다. 그 안의
 * 「인가일 이후 사실상 주거용 사용」 토글을 켜 두고 축을 되돌리면(수령→납부, 원조합원→승계)
 * 카드가 사라지는데 값은 남고, ⑧이 종료일을 요구해 **지울 위젯도 채울 칸도 없는 상태**로
 * 계산이 영구 차단됐다(memory `feedback_ui_gate_removes_sole_input_path`).
 *
 * 마이그레이션은 같은 정리를 이미 했지만 **저장값 재수화 시점에만** 돈다 — 세션 안에서는
 * 새로고침해야 정상화됐다. 종전 ⑤ onChange는 자기선언 **1키만** 비웠다.
 *
 * ⇒ 정리 대상을 `clearOutOfScopeRedevPatch` 단일 소스로 모으고 ⑤·마이그레이션이 공유한다.
 */
import { describe, it, expect } from "vitest";
import { clearOutOfScopeRedevPatch } from "../../lib/calc/redev-field-scope";
import { makeDefaultAsset } from "../../lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "../../lib/stores/calc-wizard-asset";

/** 완공APT · 청산금 수령 · 원조합원 — ③-c 카드가 열리는 축, 3필드 모두 채운 상태 */
function inScopeAsset(overrides: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "redevelopment_apt",
    redevSubject: "apt",
    redevSettlementDirection: "receive",
    redevIsSuccessorMember: "no",
    redevExemptionEligibleAtApproval: "no",
    redevPostApprovalHousingUse: "yes",
    redevPostApprovalHousingUseEndDate: "2023-05-01",
    ...overrides,
  } as AssetForm;
}

describe("clearOutOfScopeRedevPatch — ③-c 자기선언 축", () => {
  it("대조군: 축 안에서는 아무것도 지우지 않는다", () => {
    expect(clearOutOfScopeRedevPatch(inScopeAsset())).toEqual({});
  });

  it("🔴 청산금 수령 → 납부: 자기선언 + 「사실상 주거용 사용」 2필드까지 함께 비운다", () => {
    const patch = clearOutOfScopeRedevPatch(inScopeAsset({ redevSettlementDirection: "pay" }));
    // 종전에는 이 한 줄만 있었다 — 아래 두 줄이 없어서 ⑧이 영구 차단했다.
    expect(patch.redevExemptionEligibleAtApproval).toBe("");
    expect(patch.redevPostApprovalHousingUse).toBe("");
    expect(patch.redevPostApprovalHousingUseEndDate).toBe("");
  });

  it("🔴 원조합원 → 승계조합원: 같은 3필드를 비운다", () => {
    const patch = clearOutOfScopeRedevPatch(
      inScopeAsset({ redevIsSuccessorMember: "yes" }),
    );
    expect(patch.redevExemptionEligibleAtApproval).toBe("");
    expect(patch.redevPostApprovalHousingUse).toBe("");
    expect(patch.redevPostApprovalHousingUseEndDate).toBe("");
  });

  /**
   * 🔄 **종전 단언은 `toEqual({})`이었다 — 대리 지표였다** (P6-c-3 정밀화).
   *
   * 지키려던 것은 「§89①4호 **자기선언**이 지워지지 않는다」 하나인데, 같은 if 블록에 묶여
   * 있던 ③-c 부속 2필드까지 싸잡아 「아무것도 안 지운다」로 적었다. 그래서 부속 필드의 축을
   * 바로잡자 **의도와 무관하게** 빨개졌다.
   *
   * ⇒ 두 주장을 갈라서 각각 단언한다. 자기선언 보존은 그대로, 부속 2필드는 입주권에서
   *   **지워지는 것이 맞다**(③-c 카드가 입주권에는 렌더되지 않으므로 — 남기면 ⑧이 종료일을
   *   요구하는데 채울 칸이 없다).
   */
  it("입주권: §89①4호 자기선언은 **지우지 않는다** — 판정 메뉴에서 넘어온 값이다", () => {
    const right = inScopeAsset({
      assetKind: "right_to_move_in",
      redevSubject: "right",
      redevSettlementDirection: "pay",
    });
    // `undefined` = patch에 키 자체가 없다 = 건드리지 않았다.
    expect(clearOutOfScopeRedevPatch(right).redevExemptionEligibleAtApproval).toBeUndefined();
  });

  it("입주권: ③-c 부속 2필드는 **지운다** — 그 카드가 입주권 화면에 없다 (P6-c-3)", () => {
    const right = inScopeAsset({
      assetKind: "right_to_move_in",
      redevSubject: "right",
    });
    const patch = clearOutOfScopeRedevPatch(right);
    expect(patch.redevPostApprovalHousingUse).toBe("");
    expect(patch.redevPostApprovalHousingUseEndDate).toBe("");
    // 🔑 같은 호출에서 자기선언은 살아 있어야 한다 — 한 술어로 묶으면 이게 깨진다.
    expect(patch.redevExemptionEligibleAtApproval).toBeUndefined();
  });

  it("이미 비어 있으면 patch에 키를 넣지 않는다 (불필요한 store 쓰기 방지)", () => {
    const clean = inScopeAsset({
      redevSettlementDirection: "pay",
      redevExemptionEligibleAtApproval: "",
      redevPostApprovalHousingUse: "",
      redevPostApprovalHousingUseEndDate: "",
    });
    expect(clearOutOfScopeRedevPatch(clean)).toEqual({});
  });

  it("승계 전용 「인가후 필요경비」도 원조합원으로 되돌리면 비운다 (U1-02 축)", () => {
    const patch = clearOutOfScopeRedevPatch(
      inScopeAsset({ redevIsSuccessorMember: "no", redevPostApprovalExpenses: "5000000" }),
    );
    expect(patch.redevPostApprovalExpenses).toBe("");
  });
});
