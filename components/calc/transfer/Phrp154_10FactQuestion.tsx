"use client";

/**
 * §154⑩ 사실 질문 (계획서 `phrp-154-10-undeclared-one-house.plan.md` Q-1 (a)) — 판정 메뉴·부담부증여 화면에서 ⑳ 토글 **바깥**에
 * 예/아니오 필수로 묻는다. 게이트·응답 도출·쓰기는 `lib/calc/phrp-154-10-fact-question.ts`(⑧과 같은 정본)다.
 *
 * 「예」는 아래 ⑳ 카드에 §154⑩ 선언(시나리오 B · 임대주택 0호 · 등록·운영 사실)을 쓴다 — 직전거주주택 양도일·거주요건은 그 카드의
 * §154⑩ 블록이 받는다.
 */
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import {
  applyPhrp154_10Answer,
  phrp154_10AnswerOf,
  PHRP_154_10_QUESTION_FIELD,
  type Phrp154_10Answer,
} from "@/lib/calc/phrp-154-10-fact-question";

export function Phrp154_10FactQuestion({
  rh,
  assetId,
  onChange,
}: {
  rh: AssetForm["rentalHousingException"];
  assetId?: string;
  onChange: (rh: AssetForm["rentalHousingException"]) => void;
}) {
  return (
    <div className="space-y-2" data-testid="phrp-154-10-question">
      <div className="flex items-start gap-2">
        <p className="text-sm font-medium text-violet-800 dark:text-violet-200">
          이 주택을 민간임대주택으로 등록했거나 어린이집으로 운영한 적이 있고, 이 주택을 보유하는 동안 다른 거주주택을 양도한 적이
          있습니까? <span className="text-rose-700 dark:text-rose-400">*</span>
        </p>
        <LawArticleModal legalBasis="소득세법 시행령 §154" label="§154⑩" />
      </div>
      <RadioCardGroup<Phrp154_10Answer>
        name={`phrp-154-10-answer-${assetId ?? "primary"}`}
        tone="violet"
        columns={2}
        data-field={PHRP_154_10_QUESTION_FIELD}
        options={[
          {
            value: "yes",
            label: "예",
            description: "직전거주주택 양도일 후의 기간분만 비과세 — 아래 특례 카드에 직전거주주택 양도일과 거주요건을 입력하세요",
            testId: "phrp-154-10-answer-yes",
          },
          {
            value: "no",
            label: "아니오",
            description: "임대 등록·어린이집 운영 사실이 없거나, 보유 중 다른 거주주택을 양도한 적이 없습니다",
            testId: "phrp-154-10-answer-no",
          },
        ]}
        value={phrp154_10AnswerOf(rh) ?? ""}
        onChange={(v) => onChange(applyPhrp154_10Answer(rh, v))}
      />
    </div>
  );
}
