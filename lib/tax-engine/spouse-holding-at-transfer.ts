/**
 * 「소득세법 시행령」 §167의3⑨ · §167의4⑤ — 혼인 5년 내 양도일 현재 **배우자가 보유한** 주택·분양권·입주권 차감의 단일 소스 (결정 #47).
 *
 * 엔진 Step 1.5(차감)·확인 필요 고지와 계산기 ⑤(질문 노출)·⑧(응답 요구)이 모두 이 파일의 술어를 읽는다 — 서로 다른 사본을 두면
 * 화면은 묻는데 엔진은 읽지 않거나 그 반대가 된다.
 *
 * ## 응답을 읽는 법
 * - `spouseHeldAtTransfer`가 있으면 그것이 정본이다.
 * - 없으면 레거시 `isSpouseOwned === true`만 「예」다. `false`·미제공은 「아니오」가 아니라 **미응답**이다 — 옛 저장분·직접 호출의
 *   꺼진 값은 응답이 아니라 기본값이었다. 미응답과 「모름」은 차감하지 않는다(모름 = 혜택 불성립).
 *
 * ## 누구에게 묻나
 * 질문은 「혼인 전 보유자」(`mergeOrigin`)와 **다른 사실**이다(⑨의 기준은 양도일 현재 보유). 혼인한 배우자 쪽 행(`spouseSideOriginOf`)은
 * 필수 응답, 그 밖의 행은 선택 응답(빈칸 = 아니오)이다. 단일 혼인 합가에서 배우자 쪽은 `counterpart_side`이고, 혼인·동거봉양 이중 합가에서는
 * 혼인이 먼저면 `counterpart_side`, 동거봉양이 먼저면 `second_merge_side`다(`lib/calc/merge-house-origin.ts`와 같은 규약 — 같은 날이면 혼인이 먼저).
 */
import { isWithinDeadline } from "./civil-period";
import { MULTI_HOUSE } from "./legal-codes";
import type { MergeOrigin, SpouseHoldingAnswer } from "./types/multi-house-surcharge.types";

export type { SpouseHoldingAnswer };

/** 응답 읽기 — `undefined` = 미응답. */
export function readSpouseHolding(h: {
  spouseHeldAtTransfer?: SpouseHoldingAnswer;
  isSpouseOwned?: boolean;
}): SpouseHoldingAnswer | undefined {
  if (h.spouseHeldAtTransfer) return h.spouseHeldAtTransfer;
  return h.isSpouseOwned === true ? "yes" : undefined;
}

/** 혼인한 배우자 쪽 행의 `mergeOrigin` 값. 혼인일이 없으면 `undefined`. 동거봉양 합가가 혼인보다 **먼저**일 때만 `second_merge_side`다. */
export function spouseSideOriginOf(
  marriageDate: Date | undefined,
  parentalCareMergeDate: Date | undefined,
): MergeOrigin | undefined {
  if (!marriageDate) return undefined;
  if (parentalCareMergeDate && parentalCareMergeDate.getTime() < marriageDate.getTime()) return "second_merge_side";
  return "counterpart_side";
}

/**
 * ⑨ 적용 구간 — 「혼인한 날부터 5년 이내」 양도 + 단서 「혼인한 날부터 5년 이내에 새로운 주택을 취득한 경우 그 취득일 이후 양도하는 주택에는
 * 적용하지 아니한다」(혼인 뒤 양도일까지 새로 취득한 주택·분양권·입주권이 하나도 없을 것).
 * 5년은 혼인일부터 잰다(초일불산입 — 민법 §160③·§161). 호출부는 양도 주택·명부 행·권리의 취득일을 모두 넘긴다.
 */
export function marriageSubtractionWindowOpen(o: {
  marriageDate: Date;
  transferDate: Date;
  acquisitionDates: readonly Date[];
}): boolean {
  const m = o.marriageDate;
  const within5y =
    o.transferDate >= m && isWithinDeadline(m, MULTI_HOUSE.MARRIAGE_SUBTRACT_YEARS_3HOUSE, o.transferDate);
  if (!within5y) return false;
  return !o.acquisitionDates.some((d) => d > m && d <= o.transferDate);
}
