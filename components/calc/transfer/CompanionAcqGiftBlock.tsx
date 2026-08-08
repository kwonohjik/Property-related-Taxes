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
import { ToneCard } from "@/components/calc/shared/ToneCard";

interface BlockProps {
  acquisitionDate: string; // 증여일
  onAcquisitionDateChange: (v: string) => void;
  donorAcquisitionDate: string;
  onDonorAcquisitionDateChange: (v: string) => void;
  fixedAcquisitionPrice: string;
  onFixedAcquisitionPriceChange: (v: string) => void;
  /**
   * 부담부증여인가 — 참이면 **신고가액 칸을 숨긴다** (2026-08-08 · 계획서 §10-5).
   *
   * 「소득세법 시행령」 제159조가 「양도로 보는 부분」의 취득가액을 채무비율로 정하고 엔진이
   * `acquisitionPrice`를 덮어쓰므로, 여기 적은 값은 계산에 도달하지 않는다(실측: 50억을 넣어도
   * 세액 불변 · 전 자산종류 동일). 매매 경로가 이미 같은 판단이다
   * (`CompanionAcqPurchaseBlock.tsx:262`). 날짜 두 칸은 보유기간·단기 통산에 쓰이므로 남긴다.
   */
  isBurdenedGift?: boolean;
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

      {props.isBurdenedGift ? (
        <ToneCard
          tone="amber"
          title="취득가액 — 부담부증여 §159 자동 산정"
          titleExtra={<LawArticleModal legalBasis="소득세법 시행령 §159" label="§159 부담부증여" />}
        >
          <p className="text-xs text-amber-800">
            부담부증여에서 <strong>양도로 보는 부분</strong>의 취득가액은 취득당시 기준시가에
            <strong> 채무비율</strong>을 곱해 산정합니다. 증여 신고가액을 따로 적어도 계산에 쓰이지
            않으므로 입력란을 표시하지 않습니다. 위 <strong>증여일</strong>은 보유기간 기산일로,
            <strong> 증여자 취득일</strong>은 단기보유 통산에 계속 사용됩니다.
          </p>
        </ToneCard>
      ) : (
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
      )}
    </div>
  );
}
