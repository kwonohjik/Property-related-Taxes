/**
 * GiftHouseStdPriceSection — **증여** 주택 §164⑤~⑦ 취득당시 기준시가 입력 (소령 §163⑨2호)
 *
 * 「소득세법 시행령」 §163⑨2호: 건물 기준시가 고시 前 **상속 또는 증여**받은 건물의 취득가액은
 * 「상증법 §60~66 평가액」과 「§164⑤~⑦에 의한 가액」 **중 많은 금액**이다.
 *
 * ⭐ **증여 전용 진입점이다.** 상속은 `CompanionAcqInheritanceBlock` →
 *    `InheritedAcquisitionDeemedSection` → `Pre/PostDeemedInputs` 경로가 이미 같은
 *    `HouseValuationSection`을 렌더한다. 그 경로는 ①(상속세 신고가액) 입력까지 포함하지만,
 *    **증여의 ①은 이미 「증여 신고가액」(`fixedAcquisitionPrice`)에 있다** — 상속 섹션을 통째로
 *    재사용하면 ① 입력이 두 곳이 되어 서로 다른 필드에 쓰인다. 그래서 ② 산출 입력만 노출한다.
 *
 * ⚠️ 종전에는 이 경로가 없어, PR #1097이 API payload 트리거를 「상속 또는 증여」로 열었어도
 *    `inhHouseVal*` 트리거 필드를 채울 화면이 증여에 존재하지 않아 **payload가 생성되지 않았다**
 *    (anchor `gift-163-9-sec164-ui-reach.anchor.test.tsx` G2-B).
 *
 * 계획서: docs/02-design/features/gift-163-9-clause-1-2-max.plan.md §5 Phase 3 · §7 U-3
 */
"use client";

import { ToneCard } from "@/components/calc/shared/ToneCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { HouseValuationSection } from "@/components/calc/transfer/inheritance/HouseValuationSection";
import {
  deriveSec163_9BaseDate,
  isSec163_9House,
  HOUSE_FIRST_DISCLOSURE,
} from "@/lib/calc/transfer-163-9-base-date";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  transferDate?: string;
}

export function GiftHouseStdPriceSection({ asset, onChange, transferDate }: Props) {
  // 기준일·자산 판정은 API payload 빌더(`buildInheritedHouseValuationPayload`)와 **같은 함수**.
  // 여기서 재기술하면 "칸은 보이는데 payload는 안 생기는" 어긋남이 생긴다.
  const giftDate = deriveSec163_9BaseDate(asset);
  if (
    asset.acquisitionCause !== "gift" ||
    !isSec163_9House(asset.assetKind) ||
    !giftDate ||
    giftDate >= HOUSE_FIRST_DISCLOSURE
  ) {
    return null;
  }

  return (
    <ToneCard
      tone="amber"
      title="§164⑤~⑦ 취득당시 기준시가 (선택 — 증여일 평가액과 큰 금액 적용)"
      noDark
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <LawArticleModal legalBasis="소득세법 시행령 §163 ⑨ 2호" label="§163⑨2호" />
        <LawArticleModal legalBasis="소득세법 시행령 §164 ⑦" label="§164⑦" />
      </div>
      <p className="text-xs text-amber-700">
        개별주택가격 최초공시(2005.4.30.) 전 증여받은 주택은{" "}
        <b>max(증여일 상증법 평가액, §164⑤~⑦ 취득당시 기준시가)</b>를 취득가액으로 봅니다. 위
        「증여 신고가액」이 앞의 값이고, 아래 3시점 입력이 뒤의 값을 산정합니다. 아래를 입력한
        경우에만 비교하며, 미입력 시 증여 신고가액만 사용합니다.
      </p>

      <HouseValuationSection asset={asset} onChange={onChange} transferDate={transferDate} />
    </ToneCard>
  );
}
