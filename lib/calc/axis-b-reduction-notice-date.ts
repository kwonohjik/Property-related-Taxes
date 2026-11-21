/**
 * 축 B(같은 물건 지분 분할) 지분 카드의 §77 감면 «사업인정 고시일» fallback 소스 — ④ · ⑤ · ⑧ 3층의 단일 술어 (NBL2611-C9).
 *
 * 사업인정 고시일은 **물건(땅) 단위 사실**이다. 지분 카드는 ② 양도정보(`ExpropriationBlock`)를 숨겨 자기 `expropriationNoticeDate` 칸이 없다 —
 * 값은 첫 카드에만 있다. 감면 행(`reductions[].expropriationApprovalDate`)이 비어 있으면 단건과 같이 «자산의 고시일»을 쓰는데(④ `toEngineReductions` ·
 * ⑧ `transfer-tax-validate-reductions.ts` · ⑤ `Step5`의 칸 표시), 그 자산이 지분 카드면 **첫 카드의 값**을 읽는다.
 *
 * - 지분 카드 자신의 `expropriationNoticeDate`(숨은 칸 — 예전 세션·잔재)는 읽지 않는다. 읽으면 첫 카드가 비었을 때 보이지 않는 값이 ⑧을 통과시킨다.
 * - 지분 카드가 감면 행에 직접 넣은 고시일이 있으면 그 값이 이긴다(호출부가 `행 값 || 이 함수` 순서로 쓴다).
 * - 첫 카드도 비어 있으면 빈 문자열 → ⑧이 종전대로 «사업인정고시일을 선택하세요»로 막는다.
 * - `mergePrimaryBasic`에는 병합하지 않는다 — 그 병합값은 ⑧·감면 변환·사이드바·NBL 판정이 함께 읽어 파급이 크다(C6가 비채택한 이유).
 *
 * 순환 import 방지를 위해 `isFullFractionalBundle`은 정의 파일(`transfer-tax-api-asset-basics`)에서 직접 가져온다.
 */
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";
import { isFullFractionalBundle } from "./transfer-tax-api-asset-basics";

/** 축 B 지분 카드(둘째 이후)가 쓰는 고시일 — 첫 카드 값만 본다. ④가 지분 카드를 이미 판별한 자리(`fractionalBundleMerge` · GB 지분 루프)에서 쓴다. */
export function axisBShareNoticeDate(primary: Pick<AssetForm, "expropriationNoticeDate">): string {
  return primary.expropriationNoticeDate ?? "";
}

/** `index`번 카드가 축 B 지분 카드(둘째 이후 — ② 양도정보가 숨고 물건 값은 첫 카드에 있다)인가. */
export function isAxisBShareCard(form: Pick<TransferFormData, "assets" | "assetSplitMode">, index: number): boolean {
  return index > 0 && isFullFractionalBundle(form.assets, form.assetSplitMode);
}

/** 폼의 `index`번 카드가 §77 감면 행 고시일 공란일 때 읽는 «자산 고시일». 축 B 지분 카드면 첫 카드 값, 그 밖에는 그 카드 자신의 값. ⑤ 칸 표시·⑧이 쓴다. */
export function reductionNoticeDateOf(form: Pick<TransferFormData, "assets" | "assetSplitMode">, index: number): string {
  const asset = form.assets[index];
  if (isAxisBShareCard(form, index)) return axisBShareNoticeDate(form.assets[0]);
  return asset?.expropriationNoticeDate ?? "";
}
