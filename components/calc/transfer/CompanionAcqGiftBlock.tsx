"use client";

/**
 * 동반자산 증여 취득(gift) 입력 블록
 *
 * 증여 취득가액 = 증여세 신고가액 (또는 시가).
 * 증여자 취득일을 자체 입력받아 단기보유 통산(§104②2호) 정확도 확보.
 */

import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { DateInput } from "@/components/ui/date-input";
import { LawArticleModal } from "@/components/ui/law-article-modal";

interface BlockProps {
  acquisitionDate: string; // 증여일
  onAcquisitionDateChange: (v: string) => void;
  donorAcquisitionDate: string;
  onDonorAcquisitionDateChange: (v: string) => void;
  fixedAcquisitionPrice: string;
  onFixedAcquisitionPriceChange: (v: string) => void;
}

export function CompanionAcqGiftBlock(props: BlockProps) {
  return (
    <div className="space-y-3 rounded-md border border-border bg-background p-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="block text-sm font-medium">증여일</label>
          <DateInput
            value={props.acquisitionDate}
            onChange={props.onAcquisitionDateChange}
          />
        </div>
        <div className="space-y-1.5">
          <label className="block text-sm font-medium">증여자 취득일</label>
          <DateInput
            value={props.donorAcquisitionDate}
            onChange={props.onDonorAcquisitionDateChange}
          />
          <p className="text-caption text-muted-foreground">단기보유 통산용 (소득세법 §104②2호)</p>
        </div>
      </div>

      <div className="space-y-1.5">
        <CurrencyInput
          label="증여 신고가액 (원)"
          value={props.fixedAcquisitionPrice}
          onChange={props.onFixedAcquisitionPriceChange}
          required
          // 「소득세법 시행령」 §163⑨ 본문 괄호는 소스 서열을 **강행**으로 정한다 —
          // "「상속세 및 증여세법」 제76조에 따라 세무서장등이 결정·경정한 가액이 있는 경우
          // **그** 결정·경정한 가액**으로 한다**". 신고가액과 다르면 결정·경정액이 우선한다(U2-F).
          hint="증여세 신고서상 시가 또는 보충적평가액. 세무서장등이 결정·경정한 가액이 있으면 그 가액을 입력하세요."
        />
        <div className="flex flex-wrap items-center gap-1.5">
          <LawArticleModal legalBasis="소득세법 §97 ① 1호" label="§97①1호" />
          <LawArticleModal legalBasis="소득세법 시행령 §163 ⑨" label="§163⑨" />
        </div>
      </div>
    </div>
  );
}
