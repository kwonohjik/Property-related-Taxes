/**
 * 증환지 증가분 「양도시 기준시가」 파생 — ⑤·⑥·④·⑧ **단일 소스**.
 *
 * 증환지 증가분 자산은 자기 「양도시 기준시가」를 입력받지 않는다. 당초분(assets[0])의
 * ㎡당 기준시가에 증가분 면적을 곱해 파생하므로, 증가분을 몇 번째로 추가했는지와
 * 무관하게 §166⑥ 안분 키가 도달한다.
 *
 * 🔴 **왜 함수로 뺐는가** — 같은 규칙이 ⑤(입력 화면)·④(API 변환)·⑧(검증) 세 곳에
 *    각각 복제돼 있었고, 뒤에 생긴 ⑥(사이드바 프리뷰)만 이 규칙을 빠뜨려 증환지
 *    증가분에서 사이드바가 환산 전 값을 보여줬다. 술어를 공유해야 네 번째·다섯 번째
 *    호출부가 같은 방식으로 어긋나지 않는다.
 */
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

type IncrementAsset = Pick<AssetForm, "isReplotIncrement" | "standardPriceAtTransfer" | "transferArea">;
type PrimaryAsset = Pick<AssetForm, "standardPricePerSqmAtTransfer">;

/**
 * 파생 가능하면 총액(원), 아니면 `undefined`.
 *
 * `undefined`를 돌려주는 경우는 넷이다 — 자기 입력값이 이미 있음 / 증환지 증가분이 아님 /
 * 당초분이 없음 / 당초분 ㎡당 기준시가·증가분 면적 중 하나가 비어 있음.
 */
export function replotIncrementStdPriceAtTransfer(
  asset: IncrementAsset | undefined,
  primary: PrimaryAsset | undefined,
): number | undefined {
  if (!asset || !primary) return undefined;
  if (!asset.isReplotIncrement) return undefined;
  if (parseAmount(asset.standardPriceAtTransfer) > 0) return undefined;

  const perSqm = parseAmount(primary.standardPricePerSqmAtTransfer);
  const area = parseFloat((asset.transferArea || "").replace(/,/g, ""));
  return perSqm > 0 && area > 0 ? Math.floor(perSqm * area) : undefined;
}
