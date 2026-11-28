/**
 * 영 §165④3 순자산 단독 사유 선택지 — 비상장 보충평가(`EstimatedUnlistedBlock`)·취득 후 상장 환산
 * (`PostListingNetAssetOnlyReasonFields` — §165⑤ 분자·분모, U-14) 공용.
 *
 * 양도일에 있던 사유만 보인다(`isNetAssetOnlyReasonInEra` · ⑧·⑫와 같은 leaf). 양도일 미입력이면 현행 사유.
 * 이미 고른 값은 시기가 맞지 않아도 남긴다(숨기면 ⑧ 오류를 고칠 칸이 없다).
 */

import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";
import { isNetAssetOnlyReasonInEra } from "@/lib/tax-engine/stock-transfer/net-asset-only-basis";

type ReasonOption = { value: StockTransferFormData["netAssetOnlyReason"]; label: string; description: string };

export const NET_ASSET_ONLY_REASON_OPTIONS: ReasonOption[] = [
  { value: "", label: "해당 없음", description: "가중평균 (§165④1 본칙) 적용" },
  {
    value: "liquidation_or_owner_death",
    label: "가목: 청산 진행 또는 사업자 사망",
    description: "청산 중인 법인 또는 사업자가 사망한 경우",
  },
  {
    value: "no_business_or_short_or_closed",
    label: "나목: 사업 개시 전·1년 미만·휴폐업",
    description: "순손익가치 산출이 불가능한 경우",
  },
  {
    value: "consecutive_loss_3y",
    label: "다목: 3년 연속 결손 (2023.2.27. 이전 양도)",
    description: "양도일·취득일이 속하는 사업연도 전 3년 이내의 사업연도부터 계속하여 결손금이 있는 법인",
  },
  {
    value: "stock_holding_company",
    label: "다목: 주식가액 80% 이상 (지주회사형)",
    description: "주식·출자지분이 순자산의 80% 이상인 법인",
  },
  {
    value: "remaining_term_under_3y",
    label: "라목: 잔여 존속기한 3년 이내",
    description: "정관상 존속기한이 3년 이내로 남은 법인",
  },
];

/** 그 칸에 보일 선택지 — `selected`(이미 고른 값)는 시기가 맞지 않아도 남긴다 */
export function netAssetOnlyReasonOptionsFor(selected: string, transferDate: Date | undefined): ReasonOption[] {
  return NET_ASSET_ONLY_REASON_OPTIONS.filter(
    (o) =>
      o.value === "" ||
      o.value === selected ||
      (transferDate ? isNetAssetOnlyReasonInEra(o.value || undefined, transferDate) : o.value !== "consecutive_loss_3y"),
  );
}
