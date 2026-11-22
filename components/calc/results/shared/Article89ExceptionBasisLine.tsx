import { LawArticleModal } from "@/components/ui/law-article-modal";
import type { TransferTaxResult } from "@/lib/tax-engine/transfer-tax";

/**
 * §89② 예외(「소득세법 시행령」 §156의2·§156의3)로 받은 비과세의 근거 줄 — 계산기 결과의 비과세 사유(`exemptReason`) 바로 아래에 그린다.
 * 사유 문구(예: 「혼인 합가 (§155⑤) 1세대1주택 비과세」)는 본체 특례만 말해, 조합원입주권·분양권이 있는 세대가 실제로 기댄 조문이
 * 화면에서 사라졌다. 판정 메뉴 「적용된 특례」 카드(`OneHouseJudgmentResultView`)와 같은 엔진 echo(`article89ExceptionApplied`)를 읽는다.
 */
export function Article89ExceptionBasisLine({
  applied,
  className,
}: {
  applied: TransferTaxResult["article89ExceptionApplied"];
  className?: string;
}) {
  if (!applied) return null;
  return (
    <p data-testid="calc-89-2-exception-basis" className={className}>
      {applied.label}
      {applied.legalBasis.map((b) => (
        <span key={b} className="ml-2">
          <LawArticleModal legalBasis={b} />
        </span>
      ))}
    </p>
  );
}
