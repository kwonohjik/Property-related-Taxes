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
import { houseDisclosureBoundaryOf } from "@/lib/calc/house-first-disclosure";
import { effectiveBuildingCauseMix } from "@/lib/calc/transfer-land-part-cause";
import { disclosureDateLabel } from "@/lib/tax-engine/transfer-split-part-cause";
import { HouseFirstDisclosureEntryCard } from "@/components/calc/transfer/HouseFirstDisclosureFields";
import { InheritanceHouseKindPicker } from "@/components/calc/transfer/inheritance/InheritanceHouseKindPicker";
import { sec164HouseStatus } from "@/lib/calc/sec164-required-fields";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { ApartFirstPriceEntryCard, ApartNtsPriceQuestion } from "@/components/calc/transfer/inheritance/ApartNtsPriceQuestion";
import { apartNtsQuestionRelevant, apartSec164FormOpen, isApartSec163_9Asset } from "@/lib/calc/apart-nts-price";

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  transferDate?: string;
}

export function GiftHouseStdPriceSection({ asset, onChange, transferDate }: Props) {
  // 기준일·자산 판정은 API payload 빌더(`buildInheritedHouseValuationPayload`)와 **같은 함수**.
  // 여기서 재기술하면 "칸은 보이는데 payload는 안 생기는" 어긋남이 생긴다.
  const giftDate = deriveSec163_9BaseDate(asset);
  // 필수 항목 개수는 단일 소스에서 받는다 — 문구에 숫자를 하드코딩하면 필드가 늘 때 낡는다.
  const status = sec164HouseStatus(asset);
  if (asset.acquisitionCause !== "gift" || !isSec163_9House(asset.assetKind) || !giftDate) return null;
  // 공동주택 — 증여일 당시 국세청 고시 가액 유무를 먼저 묻는다(필수·모름 없음). 「없었음」일 때만 아래 비교 입력을 연다(`apart-nts-price.ts`).
  if (isApartSec163_9Asset(asset)) {
    if (!apartNtsQuestionRelevant(asset)) {
      return <ApartFirstPriceEntryCard asset={asset} onChange={onChange} baseDate={giftDate} baseDateLabel="증여일" />;
    }
    return (
      <ToneCard tone="amber" title="공동주택 — 증여일 당시 국세청 고시 공동주택 기준시가" noDark>
        <div className="flex flex-wrap items-center gap-1.5">
          <LawArticleModal legalBasis="소득세법 시행령 §163 ⑨ 2호" label="§163⑨2호" />
          <LawArticleModal legalBasis="소득세법 시행령 §164 ⑥" label="§164⑥" />
          <LawArticleModal legalBasis="소득세법 시행령 §164 ⑦" label="§164⑦" />
        </div>
        <InheritanceHouseKindPicker asset={asset} onChange={onChange} />
        <ApartNtsPriceQuestion asset={asset} onChange={onChange} baseDateLabel="증여일" />
        {apartSec164FormOpen(asset) && (
          <>
            <p className="text-xs text-amber-700">
              <b>증여일 상증법 평가액과 첫 가격으로 환산한 §164⑥·⑦ 취득당시 기준시가 중 큰 금액</b>을 취득가액으로 봅니다. 위
              「증여 신고가액」이 앞의 값이고, 아래 3시점 입력이 뒤의 값을 산정합니다.{" "}
              <b>{status ? `${status.total}개 항목을 모두` : "아래 항목을 모두"}</b> 입력한 경우에만 비교합니다. 전부 비워두면 증여
              신고가액만 사용하고, <b>일부만 입력하면 계산할 때 오류로 안내</b>합니다.
            </p>
            <HouseValuationSection asset={asset} onChange={onChange} transferDate={transferDate} />
          </>
        )}
      </ToneCard>
    );
  }
  // 구간 끝 = 이 주택의 최초 공시일(단독·다가구 명시일 때만, 아니면 2005-04-30) — ④ payload 빌더와 같은 `sec164HouseStatus` 경계.
  const boundary = houseDisclosureBoundaryOf(asset);
  if (giftDate >= boundary) {
    // 2005.4.30. 이후 증여 — 이 주택이 더 늦게 처음 공시됐으면 최초 공시일을 받아 아래 비교를 연다.
    // 건물 증여 + 토지 매매(D2)는 분리 섹션(`LandBuildingSplitSection`)의 진입 카드가 같은 칸을 가진다(한 곳에만).
    if (effectiveBuildingCauseMix(asset)) return null;
    return <HouseFirstDisclosureEntryCard asset={asset} onChange={onChange} baseDate={giftDate} baseDateLabel="증여일" open={false} />;
  }
  // 최초 공시일로 열린 구간(증여일이 2005.4.30. 이후)이면 주택 구분을 여기서도 바꿀 수 있어야 한다 — 진입 카드는 열리면 사라진다.
  const openedByHouseDate = giftDate >= HOUSE_FIRST_DISCLOSURE;

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
        이 주택의 개별주택가격 최초공시({disclosureDateLabel(boundary)}) 전 증여받은 주택은{" "}
        <b>증여일 상증법 평가액과 §164⑤~⑦ 취득당시 기준시가 중 큰 금액</b>를 취득가액으로 봅니다. 위
        「증여 신고가액」이 앞의 값이고, 아래 3시점 입력이 뒤의 값을 산정합니다.{" "}
        <b>{status ? `${status.total}개 항목을 모두` : "아래 항목을 모두"}</b> 입력한 경우에만
        비교합니다. 전부 비워두면 증여 신고가액만 사용하고,{" "}
        <b>일부만 입력하면 계산할 때 오류로 안내</b>합니다.
      </p>

      {openedByHouseDate && <InheritanceHouseKindPicker asset={asset} onChange={onChange} />}
      <HouseValuationSection asset={asset} onChange={onChange} transferDate={transferDate} />
    </ToneCard>
  );
}
