/**
 * PreDeemedEstimatedNotice — 의제취득일 前 상속·증여인데 **①(가목)을 비운 채 추계로 가는** 조합 안내.
 *
 * 「소득세법 시행령」 §163⑨은 상속·증여받은 자산의 취득가액을 「상속개시일·증여일 현재 상증법
 * §60~66에 따라 평가한 가액」으로 **본다**(가목). 같은 조 1호·2호는 기준시가 고시 前 취득에 대해
 * 「그 평가액과 §164④~⑦ 가액 중 **많은 금액**」을 쓰도록 한다.
 *
 * ⚠️ **①을 비우면 그 두 값이 계산에 아예 등장하지 않는다** — payload에 `reportedValue`가 실리지
 *    않아 엔진이 ①을 후보에서 제외하고, ③(환산)만 남는다. 화면 어디에도 그 사실이 드러나지 않아
 *    사용자는 "환산이 적용됐다"는 것만 보게 된다.
 *
 * ⇒ **차단하지 않고 안내만 한다.** 의제취득일 前 취득은 §176조의2④(나목)도 적용 영역이라
 *    추계 자체가 법적으로 불가능하지 않고, 「가목 우선」으로 재편할지는 별도 판단이 남아 있다
 *    (계획서 §4.3 U2-E — 「가목이 확인됐다」의 판정 기준).
 *
 * ⚠️ **도달 경로**: 표준 자산(주택·토지)의 상속·증여는 추계 토글이 UI에 없다
 *    (`CompanionAcqPurchaseBlock`은 `acquisitionCause === "purchase"` 전용).
 *    따라서 이 안내가 뜨는 것은 ⑴ 상가·일반건물·재개발처럼 자체 환산 블록이 있는 자산,
 *    ⑵ **매매로 환산을 켰다가 취득원인을 상속·증여로 바꾼 stale 상태**다. ⑵가 실질적 위험이다.
 *
 * ⚠️ post-1985 증여는 `giftEstimatedModeError`가 **차단**하므로 이 안내가 아니라 오류로 간다.
 *
 * 계획서: docs/02-design/features/pre-deemed-clause-a-omitted-estimated-path.plan.md §5.5 S-1
 */
"use client";

import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import {
  deriveSec163_9BaseDate,
  sec163_9BaseDateLabel,
  sec163_9CauseLabel,
} from "@/lib/calc/transfer-163-9-base-date";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

/** 의제취득일 — 「소득세법」 부칙(1985.1.1. 개정). 이 날 前 취득은 §176조의2④ 적용 영역이기도 하다. */
const DEEMED_ACQUISITION_DATE = "1985-01-01";

export function PreDeemedEstimatedNotice({ asset }: { asset: AssetForm }) {
  const baseDate = deriveSec163_9BaseDate(asset);
  // §163⑨ 대상(상속·증여)이 아니면 baseDate가 빈 문자열이다 — 매매·이월과세·신축은 여기서 걸러진다.
  if (!baseDate || baseDate >= DEEMED_ACQUISITION_DATE) return null;

  const isEstimating =
    asset.useEstimatedAcquisition === true ||
    asset.isAppraisalAcquisition === true ||
    asset.isSalesCaseAcquisition === true;
  if (!isEstimating) return null;

  // ①의 소스는 취득원인별로 다르다 — 상속은 공시가격 필드, 증여는 「증여 신고가액」.
  const clauseA =
    asset.acquisitionCause === "gift"
      ? asset.fixedAcquisitionPrice
      : asset.publishedValueAtInheritance;
  if (parseAmount(clauseA ?? "") > 0) return null;

  const dateLabel = sec163_9BaseDateLabel(asset);
  const causeLabel = sec163_9CauseLabel(asset);

  return (
    <ToneCard tone="amber" title="§163⑨ 평가액이 계산에 반영되지 않습니다" noDark>
      <div className="flex flex-wrap items-center gap-1.5">
        <LawArticleModal legalBasis="소득세법 시행령 §163 ⑨" label="§163⑨" />
        <LawArticleModal legalBasis="소득세법 시행령 §176조의2" label="§176조의2④" />
      </div>
      <p className="text-xs text-amber-700">
        의제취득일(1985.1.1.) 이전에 {causeLabel}받은 자산이라 환산취득가액 등 추계 방법을 쓸 수
        있습니다. 다만 「{dateLabel} 상증법 평가액」을 입력하면 §163⑨에 따라 <b>그 평가액과 §164④~⑦
        가액 중 많은 금액</b>이 함께 비교됩니다. <b>지금은 그 두 값이 계산에 등장하지 않습니다.</b>
      </p>
    </ToneCard>
  );
}
