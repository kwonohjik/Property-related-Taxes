"use client";

/**
 * CaseFortyNineFormulaCard — 사례 49 산식 풀어쓰기 카드.
 *
 * [DM-3] 결과 카드에서 사용자가 환산취득가 산출 과정을 단계별로 추적할 수 있도록
 *  양도기준시가 → 취득기준시가 → 환산취득가 → 개산공제 4 섹션으로 한국어 풀어쓰기.
 *
 * 정책: feedback_result_view_korean_formula — 변수 약어 금지, 법령 인용 포함.
 *
 * 활성 조건: result.acqFaceValueOnly === true (Step4에서 prop 전달).
 */

import { LawArticleModal } from "@/components/ui/law-article-modal";

interface CaseFortyNineFormulaCardProps {
  transferPrice: number;
  acqFaceValuePerShare: number;
  shareCount: number;
  /** §165④1 가중평균 입력값 */
  niPerShare: number;
  naPerShare: number;
  isHeavyRE: boolean;
  isNetAssetOnly: boolean;
  /** engine result */
  weighted: number;
  transferStdPriceAfterFloor: number;
  floor80Applied: boolean;
  acquisitionStdPriceTotal: number;
  acquisitionPrice: number;  // 환산취득가
  expenses: number;           // §163⑥4 개산공제
}

export function CaseFortyNineFormulaCard({
  transferPrice,
  acqFaceValuePerShare,
  shareCount,
  niPerShare,
  naPerShare,
  isHeavyRE,
  isNetAssetOnly,
  weighted,
  transferStdPriceAfterFloor,
  floor80Applied,
  acquisitionStdPriceTotal,
  acquisitionPrice,
  expenses,
}: CaseFortyNineFormulaCardProps) {
  const niWeight = isHeavyRE ? 2 : 3;
  const naWeight = isHeavyRE ? 3 : 2;
  const floor80Value = Math.floor(naPerShare * 0.8);

  return (
    <div
      data-testid="case49-formula-card"
      className="rounded-lg border border-fuchsia-200 bg-fuchsia-50/60 p-4 space-y-4 text-sm"
    >
      <p className="font-semibold text-fuchsia-900">
        사례 49 산식 풀어쓰기 (<LawArticleModal legalBasis="소득세법 §99 ① 4호" label="§99①4 후단" /> + <LawArticleModal legalBasis="소득세법 시행령 §165 ④" label="§165④" /> 혼합)
      </p>

      {/* 양도기준시가 */}
      <section className="space-y-1">
        <p className="font-semibold text-fuchsia-800">① 양도기준시가 (<LawArticleModal legalBasis="소득세법 시행령 §165 ④ 1호" label="§165④1" />)</p>
        {isNetAssetOnly ? (
          <p className="text-fuchsia-700">
            순자산가치 단독 평가 (§165④3) = 1주당 순자산가치 ={" "}
            <strong>{naPerShare.toLocaleString()}</strong>
          </p>
        ) : (
          <>
            <p className="text-fuchsia-700">
              가중평균 = (1주당 순손익가치 × {niWeight} + 1주당 순자산가치 × {naWeight}) ÷ 5
            </p>
            <p className="text-fuchsia-700">
              = ({niPerShare.toLocaleString()} × {niWeight} + {naPerShare.toLocaleString()} ×{" "}
              {naWeight}) ÷ 5 = <strong>{weighted.toLocaleString()}</strong>
            </p>
            {floor80Applied && (
              <p className="text-rose-700">
                ※ 80% 하한 발동 (§165④1 단서): 1주당 순자산가치 × 80% ={" "}
                {naPerShare.toLocaleString()} × 80% = <strong>{floor80Value.toLocaleString()}</strong>
                {" "}→ 양도기준시가 = <strong>{transferStdPriceAfterFloor.toLocaleString()}</strong>
              </p>
            )}
            {!floor80Applied && (
              <p className="text-emerald-700">
                양도기준시가 = <strong>{transferStdPriceAfterFloor.toLocaleString()}</strong>{" "}
                (80% 하한 미발동)
              </p>
            )}
          </>
        )}
      </section>

      {/* 취득기준시가 */}
      <section className="space-y-1">
        <p className="font-semibold text-fuchsia-800">
          ② 취득기준시가 (<LawArticleModal legalBasis="소득세법 §99 ① 4호" label="§99①4 후단" /> — 장부분실 액면가)
        </p>
        <p className="text-fuchsia-700">
          = 1주당 액면가 × 주식수 = {acqFaceValuePerShare.toLocaleString()} ×{" "}
          {shareCount.toLocaleString()}주 ={" "}
          <strong>{acquisitionStdPriceTotal.toLocaleString()}</strong>
        </p>
      </section>

      {/* 환산취득가 */}
      <section className="space-y-1">
        <p className="font-semibold text-fuchsia-800">
          ③ 환산취득가 (<LawArticleModal legalBasis="소득세법 §99 ① 4호" label="§99①4" /> 후단 + <LawArticleModal legalBasis="소득세법 시행령 §165 ④" label="§165④" /> 혼합)
        </p>
        <p className="text-fuchsia-700">= 양도가 × (1주당 액면가 ÷ 양도기준시가)</p>
        <p className="text-fuchsia-700">
          = {transferPrice.toLocaleString()} × ({acqFaceValuePerShare.toLocaleString()} ÷{" "}
          {transferStdPriceAfterFloor.toLocaleString()}) ={" "}
          <strong className="text-fuchsia-900">{acquisitionPrice.toLocaleString()}</strong>
        </p>
      </section>

      {/* 개산공제 */}
      <section className="space-y-1">
        <p className="font-semibold text-fuchsia-800">
          ④ 개산공제 (<LawArticleModal legalBasis="소득세법 시행령 §163 ⑥ 4호" label="§163⑥4" /> — 1% 자동 적용)
        </p>
        <p className="text-fuchsia-700">
          = 취득기준시가 × 1% = {acquisitionStdPriceTotal.toLocaleString()} × 1% ={" "}
          <strong>{expenses.toLocaleString()}</strong>
        </p>
      </section>
    </div>
  );
}
