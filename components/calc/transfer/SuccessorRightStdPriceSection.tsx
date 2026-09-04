"use client";

/**
 * SuccessorRightStdPriceSection — 승계 입주권 §165① 기준시가 입력 (R-12)
 *
 * ## 근거
 *
 * 조합원입주권은 「소득세법」 §94①2호 **가목**(「부동산을 취득할 수 있는 권리」)이고,
 * 그 기준시가는 §99①2호 가목이 시행령에 위임한다. 「소득세법 시행령」 **§165①**:
 *
 * > 법 제99조제1항제2호 가목에서 "대통령령으로 정하는 방법에 따라 평가한 가액"이란
 * > **취득일 또는 양도일까지 납입한 금액과 취득일 또는 양도일 현재의 프리미엄에 상당하는
 * > 금액을 합한 금액**을 말한다.
 *
 * ⇒ 시점마다 **납입액 + 프리미엄** 두 칸으로 받는다. 합계 한 칸으로 받지 않는 이유는 §165①의
 *   구성과 1:1이라 사용자가 근거를 따라 검산할 수 있어서다(합계는 미리보기로 보여 준다).
 *
 * ## 어느 모드에서 무엇이 필요한가
 *
 * | 모드 | 취득당시 | 양도당시 | 쓰이는 곳 |
 * |---|---|---|---|
 * | 환산 | ✅ | ✅ | §176의2②2호 분자·분모 + §163⑥ 개산공제 base |
 * | 감정·매매사례 | ✅ | — | §163⑥ 개산공제 base **만** |
 *
 * 양도당시 기준시가는 환산에서만 쓰이므로 감정·매매사례에서 **묻지 않는다** — 쓰지도 않을 값을
 * 필수로 만들면 입력할 수 없는 값을 요구하게 된다.
 *
 * ## 개산공제는 1%다
 *
 * §163⑥은 호별로 율이 다르고, 입주권은 §94①2호 **가목**이라 3호(나목·다목 7%)가 아닌
 * **4호 = 1%**다(PR #1257). 화면에도 그 율을 명시해 사용자가 결과를 검산할 수 있게 한다.
 *
 * 정책 준수:
 *  - 자동 안분 fallback 금지 — 미입력은 ⑧ validate가 차단(합계 0이면 취득가액이 0이 된다)
 *  - useEffect → store 미러링 금지 — 합계는 순수 계산, 저장하지 않음
 *  - placeholder 숫자 예시 금지 → FieldCard hint 한국어 설명
 */

import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { LawArticleModal } from "@/components/ui/law-article-modal";

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  mode: "estimated" | "appraisal" | "salesCase";
  /** §165① 취득당시 기준시가 합계 — 부모가 ④ 변환과 **같은 헬퍼**로 계산해 내려준다 */
  stdAtAcq: number;
  /** §165① 양도당시 기준시가 합계 (환산 전용) */
  stdAtTransfer: number;
}

export function SuccessorRightStdPriceSection({
  asset,
  onChange,
  mode,
  stdAtAcq,
  stdAtTransfer,
}: Props) {
  const needsTransfer = mode === "estimated";

  return (
    <ToneCard tone="amber" title="기준시가 — 납입액 + 프리미엄" bodyClassName="space-y-2" noDark>
      <div className="flex flex-wrap items-center gap-1.5">
        <LawArticleModal legalBasis="소득세법 시행령 §165 ①" label="시행령 §165①" />
        <LawArticleModal legalBasis="소득세법 §99 ① 2호" label="§99①2호 가목" />
        {needsTransfer && (
          <LawArticleModal legalBasis="소득세법 시행령 §176의2 ②" label="시행령 §176의2②2호" />
        )}
      </div>

      <p className="text-xs text-amber-800">
        조합원입주권의 기준시가는 <b>그 시점까지 납입한 금액</b>과 <b>그 시점 현재의 프리미엄</b>을
        합한 금액입니다. 두 칸에 나누어 입력하면 합계를 아래에 보여 드립니다.
      </p>

      <FieldCard
        label="취득일까지 납입한 금액"
      >
        <CurrencyInput
          label=""
          value={asset.successorRightStdPaidAtAcq}
          onChange={(v) => onChange({ successorRightStdPaidAtAcq: v })}
          hideUnit
        />
      </FieldCard>

      <FieldCard
        label="취득일 현재 프리미엄"
      >
        <CurrencyInput
          label=""
          value={asset.successorRightStdPremiumAtAcq}
          onChange={(v) => onChange({ successorRightStdPremiumAtAcq: v })}
          hideUnit
        />
      </FieldCard>

      {needsTransfer && (
        <>
          <FieldCard
            label="양도일까지 납입한 금액"
          >
            <CurrencyInput
              label=""
              value={asset.successorRightStdPaidAtTransfer}
              onChange={(v) => onChange({ successorRightStdPaidAtTransfer: v })}
              hideUnit
            />
          </FieldCard>

          <FieldCard
            label="양도일 현재 프리미엄"
          >
            <CurrencyInput
              label=""
              value={asset.successorRightStdPremiumAtTransfer}
              onChange={(v) => onChange({ successorRightStdPremiumAtTransfer: v })}
              hideUnit
            />
          </FieldCard>
        </>
      )}

      {(stdAtAcq > 0 || stdAtTransfer > 0) && (
        <div className="rounded-md border border-amber-200 bg-amber-100/60 p-2.5 text-caption text-amber-900 space-y-1">
          <div className="font-semibold">미리보기 — §165① 기준시가</div>
          {stdAtAcq > 0 && (
            <div className="font-mono tabular-nums">
              취득당시 = {stdAtAcq.toLocaleString("ko-KR")}
            </div>
          )}
          {needsTransfer && stdAtTransfer > 0 && (
            <div className="font-mono tabular-nums">
              양도당시 = {stdAtTransfer.toLocaleString("ko-KR")}
            </div>
          )}
          <div>
            ※ 개산공제는 취득당시 기준시가의 <b>1%</b>입니다 — 조합원입주권은 §94①2호 가목이라
            시행령 §163⑥<b>4호</b>가 적용됩니다(7%인 3호는 지상권·전세권만 열거).
          </div>
        </div>
      )}
    </ToneCard>
  );
}
