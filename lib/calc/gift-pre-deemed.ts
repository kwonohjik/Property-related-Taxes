/**
 * 의제취득일(1985.1.1.) 전 **증여** 자산의 ③(환산취득가액) 입력 칸 — ⑤ 노출·④ 전송·상가 환산 토글 숨김이 같은 술어를 쓴다 (PR-5).
 *
 * 취득가액은 max(① 증여 신고가액, ② 영 §164④~⑦ 가액, ③ 환산취득가액 — 영 §176조의2④)이다(엔진 `calcPreDeemed`).
 * 종전에는 증여 화면에 ③ 칸이 없어, 매매에서 남은 `standardPriceAtAcq`·`standardPriceAtTransfer`가 보이지 않는 채
 * ④로 실려 세액을 바꿨다(계획서 `inheritance-pre-deemed-clause-b-revisit.plan.md` §16).
 *
 * 범위는 증여 추계 검사와 같다(`giftEstimationGenericScope` — 일반건물·재개발·입주권·겸용은 자기 경로가 있다). 분양권은 뺀다.
 * 부담부증여는 §159가 취득가액을 정하므로 범위 밖(PR-7).
 */
import { deriveSec163_9BaseDate } from "./transfer-163-9-base-date";
import { giftEstimationGenericScope } from "./transfer-tax-validate-gift-163-9";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

export function isGiftPreDeemedConversionAsset(asset: AssetForm): boolean {
  if (asset.acquisitionCause !== "gift" || asset.transferType === "burdened_gift") return false;
  if (!giftEstimationGenericScope(asset) || asset.assetKind === "presale_right") return false;
  const base = deriveSec163_9BaseDate(asset);
  return !!base && base < "1985-01-01";
}
