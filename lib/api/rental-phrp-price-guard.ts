/**
 * §155⑳ 시나리오 B(직전거주주택보유주택) — **계산 API가 §161 기준시가 3개를 필수로 받는 가드** (결정 #19 X1-1).
 *
 * 계산기 화면(⑧ `mode="full"`)은 임대주택이 1호 이상인 B에 취득 당시·직전 양도 당시·현 양도 당시 기준시가를 필수로 막는다. API를 직접 부르면
 * 그 검증을 거치지 않는데, 빠지면 엔진(`validatePrices`)이 특례를 못 적용해 STEP 2.5가 일반 경로로 돌리고 — 주택 수 1 전제가 그대로 남아
 * §161 안분 없이 15억 부분 비과세가 나갔다(불충족 사유를 되돌리는 주택 수 복원과 별개의 입력 누락 경로).
 *
 * 판정 메뉴(`/api/calc/one-house-exemption`)는 같은 Zod 스키마를 쓰지만 §161 안분 입력을 받지 않는다(Q-7: 판정 사실은 판정 메뉴, 세액 산식 입력은
 * 계산기) — 그래서 스키마가 아니라 **계산 route에서만** 건다. 임대 0호(§154⑩ 표준 경로)는 종전 고지를 유지한다(범위 밖).
 */

type PhrpPriceFields = {
  applyException: boolean;
  scenario: "A" | "B";
  rentalUnits: readonly unknown[];
  standardPriceAtAcquisitionForPhrp?: number;
  standardPriceAtPriorTransfer?: number;
  standardPriceAtTransferForPhrp?: number;
};

const FIELDS = [
  ["standardPriceAtAcquisitionForPhrp", "취득 당시 기준시가"],
  ["standardPriceAtPriorTransfer", "직전거주주택 양도 당시 기준시가"],
  ["standardPriceAtTransferForPhrp", "현 양도 당시 기준시가"],
] as const;

/** 누락된 §161 기준시가 필드 오류를 `fieldErrors` 모양(경로 → 메시지 배열)으로 돌려준다. 문제 없으면 `undefined`. */
export function rentalPhrpPriceFieldErrors(
  rhe: PhrpPriceFields | undefined,
  pathPrefix = "rentalHousingException",
): Record<string, string[]> | undefined {
  if (!rhe?.applyException || rhe.scenario !== "B" || rhe.rentalUnits.length === 0) return undefined;
  const errors: Record<string, string[]> = {};
  for (const [key, label] of FIELDS) {
    const v = rhe[key];
    if (!(typeof v === "number" && v > 0)) {
      errors[`${pathPrefix}.${key}`] = [`임대주택이 있는 직전거주주택보유주택(시나리오 B)은 ${label}를 입력해야 합니다 (소령 §161①).`];
    }
  }
  return Object.keys(errors).length > 0 ? errors : undefined;
}
