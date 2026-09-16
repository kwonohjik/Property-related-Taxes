/**
 * 다건 양도세 마법사 **마운트 판정** — 순수 함수.
 *
 * 계획서: `docs/00-pm/multi-mount-effect-stale-closure.plan.md`
 *
 * ## 왜 분리했는가
 *
 * 세 분기의 우선순위와 경계가 `MultiTransferTaxCalculator`의 `useEffect(..., [])` 안에 묻혀
 * 있어 **단위로 잴 수 없었다**. 빼면 판정표가 anchor로 고정되고, 무엇보다
 * **「무엇을 입력으로 주는가」가 호출부의 한 줄로 드러난다**.
 *
 * ## 🔴 입력은 반드시 **live state**여야 한다
 *
 * 종전에는 effect가 **첫 렌더의 closure**를 봤다. 그 시점은 zustand persist 리하이드레이션
 * **전**이라 새로고침 시 항상 기본값이다. 실측(2026-09-16):
 *
 *     최초 진입   : closure {0, "list"}  ·  live {0, "list"}
 *     새로고침 후 : closure {0, "list"}  ·  live {1, "edit"}   ← 어긋난다
 *
 * 그래서 「자산이 없다」로 오판해 **새로고침마다 빈 자산이 1건씩 늘었다**(1→2→3). 같은 이유로
 * 나머지 두 분기는 **영영 실행되지 않았다** — `activeStep`이 closure에서 `"result"`·`"edit"`가
 * 될 수 없기 때문이다(편집 중 새로고침 시 활성 자산 폼이 wizard와 동기화되지 않고, 빈 폼이
 * 대신 실렸다 — V-2 실측).
 */
import type { MultiTransferFormData } from "@/lib/stores/multi-transfer-tax-store";

/** 판정에 필요한 최소 입력 — 전체 폼을 요구하지 않는다(테스트가 쉬워진다) */
export type MultiMountForm = Pick<
  MultiTransferFormData,
  "activeStep" | "properties" | "activePropertyIndex"
>;

export type MultiMountAction =
  /** 결과 단계인데 결과가 없다(partialize 제외) → 되돌릴 단계 */
  | { kind: "restore-step"; step: "settings" | "list" }
  /** 편집 단계 진입 → 활성 자산 폼을 wizard store로 끌어온다 */
  | { kind: "sync-edit"; propertyIndex: number }
  /** 자산이 하나도 없다 → 첫 자산 생성 후 편집 진입 */
  | { kind: "add-first" }
  | { kind: "none" };

/**
 * 마운트 시 한 번 무엇을 할지 정한다.
 *
 * @param form **live state**의 폼(`useMultiTransferStore.getState().form`).
 *             ⚠️ 렌더 closure를 넘기지 말 것 — 위 주석의 실측이 그 결과다.
 * @param hasResult 계산 결과가 메모리에 살아 있는가
 */
export function decideMultiMountAction(
  form: MultiMountForm,
  hasResult: boolean,
): MultiMountAction {
  if (form.activeStep === "result" && !hasResult) {
    return { kind: "restore-step", step: form.properties.length > 0 ? "settings" : "list" };
  }
  if (form.activeStep === "edit" && form.properties[form.activePropertyIndex]) {
    return { kind: "sync-edit", propertyIndex: form.activePropertyIndex };
  }
  if (form.properties.length === 0 && form.activeStep === "list") {
    return { kind: "add-first" };
  }
  return { kind: "none" };
}
