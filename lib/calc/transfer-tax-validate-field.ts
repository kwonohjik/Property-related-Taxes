/**
 * 검증 메시지 → 입력칸 식별자(field) 수집기.
 *
 * 계획서: `docs/00-pm/transfer-validation-field-jump.plan.md` D-3(F안)
 *
 * ## 왜 반환 타입을 바꾸지 않는가
 *
 * 하위 검증(`validateAssetEntry`·`validateAssetAcquisition` 등)은 `string | null`을 돌려주고,
 * 테스트가 그 문자열을 **직접** 단언한다(`validateAssetAcquisition`만 109회). 반환 타입을
 * `{ message, field }`로 바꾸면 단언 수백 건을 고쳐야 한다.
 * ⇒ `fieldError`는 **문자열을 그대로 반환**하고, `collectStepIssues`가 실행 중일 때만 열어 두는
 *   수집기에 `message → field`를 기록한다. 하위 함수의 계약은 변하지 않는다.
 *
 * ## 계약
 *
 * - 검증은 동기 순수 함수다 — 수집기가 열린 동안 다른 검증이 끼어들 수 없다(JS 단일 스레드).
 * - 수집기 밖에서 부르면(테스트의 직접 호출) 기록 없이 문자열만 돌려준다.
 * - 한 실행에서 같은 메시지가 두 번 기록되면 **첫 기록**이 이긴다.
 * - 자산 수준 키는 인덱스를 넣지 않는다 — 어느 자산인지는 `ValidationIssue.assetIndex`가 준다.
 */
import type { TransferFormData } from "@/lib/stores/calc-wizard-form.types";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

/**
 * 입력칸 식별자 — 화면의 `data-field` 값과 같다.
 * 폼 전역·자산 1단계 키는 컴파일러가 오타를 잡고, 하위 경로(`gracePeriod.contractDate`·
 * `presaleRights.0.acquisitionDate`)는 문자열로 받는다.
 */
export type IssueField = keyof TransferFormData | keyof AssetForm | `${string}.${string}`;

let active: Map<string, IssueField> | null = null;

/** 메시지를 그대로 반환하면서, 수집 중이면 그 메시지가 가리키는 입력칸을 기록한다. */
export function fieldError(field: IssueField, message: string): string {
  if (active && !active.has(message)) active.set(message, field);
  return message;
}

/** `fn` 실행 동안 수집기를 열고, 메시지로 입력칸을 찾는 함수를 함께 돌려준다. */
export function collectWithFields<T>(fn: () => T): {
  result: T;
  fieldOf: (message: string) => IssueField | undefined;
} {
  const prev = active;
  const map = new Map<string, IssueField>();
  active = map;
  try {
    return { result: fn(), fieldOf: (m) => map.get(m) };
  } finally {
    active = prev;
  }
}
