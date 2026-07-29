"use client";

/**
 * RedevelopmentDeemedAcquisitionNotice — 재개발 종전자산 취득가액 §163⑨ 안내 카드.
 *
 * 상속·증여 취득 종전자산은 상속개시일/증여일 현재 상증법 §60~66 평가액(신고가액)을
 * 취득당시 실지거래가액으로 본다(소령 §163⑨) → §166③ 환산·§163⑥ 개산공제 배제.
 *
 * RedevelopmentBlock.tsx 800줄 정책 준수를 위해 안내 카드 2종을 분리.
 */

import { ToneCard } from "@/components/calc/shared/ToneCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";

export function RedevelopmentDeemedAcquisitionNotice({
  acquisitionCause,
}: {
  acquisitionCause?: string;
}) {
  if (acquisitionCause === "inheritance") {
    return (
      <ToneCard
        tone="amber"
        title="종전자산 취득가액 — 상속개시일 상증법 평가액"
        titleExtra={<LawArticleModal legalBasis="소득세법 시행령 §163 ⑨" label="소령 §163⑨" />}
      >
        <p className="text-xs text-amber-800">
          상속으로 취득한 종전자산은 상속개시일 현재 상증법 §60~66 평가액(상속세 신고가액)을 종전자산
          취득가액으로 봅니다(위 &ldquo;상속개시일 평가액&rdquo; 입력값). 이 값이 확인되면 §166③ 환산취득가·
          §163⑥ 개산공제는 적용하지 않습니다. 상속개시일 평가액을 확인할 수 없는 경우에만 아래 환산 기준시가로
          §166③ 환산을 적용합니다.
        </p>
      </ToneCard>
    );
  }

  if (acquisitionCause === "gift") {
    return (
      <ToneCard
        tone="violet"
        title="종전자산 취득가액 — 증여일 상증법 평가액"
        titleExtra={<LawArticleModal legalBasis="소득세법 시행령 §163 ⑨" label="소령 §163⑨" />}
      >
        <p className="text-xs text-violet-800">
          증여로 취득한 종전자산은 증여일 현재 상증법 §60~66 평가액(증여세 신고가액)을 종전자산 취득가액으로
          봅니다. 증여 신고가액은 항상 확인 가능하므로 §166③ 환산취득가·§163⑥ 개산공제는 적용하지 않습니다.
          <span className="font-semibold"> &ldquo;환산취득가 사용&rdquo; 토글을 OFF</span>로 두고 아래 &ldquo;인가전 분 종전
          주택 취득가액(실가 모드)&rdquo;에 증여 신고가액을 입력하세요.
        </p>
      </ToneCard>
    );
  }

  return null;
}
