/**
 * §97의3 × 조합원입주권 — 자동말소 뒤 관리처분계획 인가로 입주권이 된 경우만 연다 (G-7) · ⑤ ⑧ ⑫ 단일 소스 leaf
 *
 * 계획서 docs/01-plan/features/rental-97-3-textbook-gaps.plan.md (Q-5 a · Q-6 a 권장안, 사용자 결정 2026-11-14).
 *
 * 근거: 서면-2023-법규재산-2731(2023.11.30.) — 「8년 이상 임대한 장기일반민간임대주택이 … 「민간임대주택에 관한 특별법」
 * 제6조제5항에 따라 등록이 말소된 이후 … 관리처분계획인가에 의해 조합원입주권으로 전환된 상태에서 그 조합원입주권을
 * 양도하는 경우, 조특법§97의3 … 을 적용받을 수 있는 것」(taxlaw 원문 확인 2026-11-14).
 *
 * 연 범위(Q-5 a = 그 회신의 사실관계 그대로): 원조합원 · 종전 자산 주택 · 양도 전 임대 종료 + 자동말소(구 조특령 §97의3②2호 간주)
 * · 말소일 ≤ 관리처분계획 인가일. 그 밖의 입주권 × §97의3 조합은 해석이 없어 막는다.
 * 공제 범위는 인가 전 양도차익뿐이다(소득세법 §95② 괄호 — 엔진 `applyRental97LthdSpecial` subject 축, PR-2 #3351).
 *
 * 안분식 D(Q-6 a): 입주권은 양도일에 주택 기준시가가 없다 — **관리처분계획 인가일 당시 기준시가**를 §97의3 카드의
 * 「양도 당시 기준시가」 칸에 받는다(분모 구간 = 장특 대상 차익 구간). 자산 카드 값으로 폴백하지 않는다(그 값은 양도일 기준).
 */

/** 이 조합을 여는 조문 id — `asset-kind-gate.ts`의 조문 단위 예외 */
export const RENTAL_973_RIGHT_TO_MOVE_IN_ID = "rental_97_3";

export interface Rental973RightFacts {
  /** 승계 입주권(`isSuccessorRightToMoveIn`) 또는 승계조합원(`redevelopment.isSuccessorMember`) */
  isSuccessor: boolean;
  /** 종전 자산 — 미입력은 ④와 같이 주택으로 본다(`redevOriginalAssetType || "housing"`) */
  originalAssetType?: string;
  /** 관리처분계획 인가일 `YYYY-MM-DD` */
  approvalDate?: string;
  rentalContinuesToTransfer?: boolean;
  autoCancelled973?: boolean;
  /** 임대 종료일(등록 말소일) `YYYY-MM-DD` */
  rentalEndDate?: string;
  /** §97의3 카드의 D 칸(인가일 기준시가)이 입력됐는가 */
  hasApprovalStdPrice: boolean;
}

const PREFIX =
  "조합원입주권 양도에 장기일반민간임대주택 장기보유특별공제 특례(조특법 §97의3)는 " +
  "원조합원의 종전 주택이 자동말소된 뒤 관리처분계획 인가로 입주권이 된 경우에만 적용합니다(서면-2023-법규재산-2731). ";

/** 막는 사유(열 수 있으면 `undefined`) — ⑧·⑫가 같은 문구를 쓴다 */
export function rental973RightToMoveInBlockReason(f: Rental973RightFacts): string | undefined {
  if (f.isSuccessor) return `${PREFIX}승계취득한 입주권은 대상이 아닙니다. 감면 선택을 해제하세요.`;
  if ((f.originalAssetType || "housing") !== "housing")
    return `${PREFIX}종전 자산이 토지이면 대상이 아닙니다. 감면 선택을 해제하세요.`;
  if (f.rentalContinuesToTransfer !== false || f.autoCancelled973 !== true)
    return `${PREFIX}「양도일까지 계속 임대」를 끄고 자동말소(민간임대주택법 §6⑤)를 선택하세요. 자진말소 등 그 밖의 경우는 해석이 없어 계산하지 않습니다.`;
  if (!f.rentalEndDate || !f.approvalDate)
    return `${PREFIX}등록 말소일과 관리처분계획 인가일을 입력하세요.`;
  if (f.rentalEndDate.slice(0, 10) > f.approvalDate.slice(0, 10))
    return `${PREFIX}등록 말소일(${f.rentalEndDate.slice(0, 10)})이 관리처분계획 인가일(${f.approvalDate.slice(0, 10)}) 뒤입니다 — 말소 뒤 인가로 입주권이 된 경우만 대상입니다.`;
  if (!f.hasApprovalStdPrice)
    return `${PREFIX}안분 산식의 D로 관리처분계획 인가일 당시 기준시가를 §97의3 카드의 「관리처분계획 인가일 당시 기준시가」 칸에 입력하세요.`;
  return undefined;
}

/** ⑤ 라벨 — 입주권이면 D 칸은 인가일 기준시가다(Q-6 a) */
export const RENTAL_973_RIGHT_STD_PRICE_D_LABEL = "관리처분계획 인가일 당시 기준시가 (주택+부속토지 합계)";
export const RENTAL_973_RIGHT_STD_PRICE_D_HINT =
  "조합원입주권은 양도일에 주택 기준시가가 없어, 장기보유특별공제 대상 차익 구간(취득일~관리처분계획 인가일)에 맞춰 인가일 당시 값을 D로 씁니다 — 해석 미확인(확인 필요). 자산 카드 값으로 대신하지 않습니다.";
