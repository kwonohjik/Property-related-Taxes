"use client";

/**
 * 다주택 중과 판정 결과 뷰 — 조립(계획서 `multi-house-surcharge-judgment-menu.plan.md` §5.5 · P7).
 *
 * 순서: 고지 → 결론 → D1 표 → D1 양도 예정 주택 상세 → D3b 세율 영향 → D3a 비과세 요약 → D3d 계산기 넘기기.
 * 판정 범위 밖(2018.4.1. 전·입주권 양도 등)이면 사유와 비과세 요약만 보인다.
 *
 * 🔑 이 뷰는 응답과 **입력 사실 몇 가지**(명부 순번·기준시가)만 받는다 — store를 읽지 않는다. 화면은 판정하지 않는다(T5).
 * 섹션 번호는 그려지는 것만 센다(1주택 결과뷰와 같은 규약 — 고정 번호는 「1 · 2 · 5」로 건너뛴다).
 */
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { CtaButton } from "@/components/calc/shared/WizardNav";
import type {
  MultiHouseSurchargeJudgmentResponse,
  SurchargeJudgmentScopeReason,
} from "@/app/api/calc/multi-house-surcharge-judgment/route";
import type { HouseEntry, PresaleRightEntry } from "@/lib/stores/calc-wizard-asset-nbl";
import { SurchargeHouseTable } from "./surcharge/SurchargeHouseTable";
import { SurchargeSellingDetail } from "./surcharge/SurchargeSellingDetail";
import { SurchargeRateImpactCard } from "./surcharge/SurchargeRateImpactCard";
import { ExemptionSummaryCard } from "./surcharge/ExemptionSummaryCard";
import { rowConclusionLabel } from "./surcharge/surcharge-labels";

const SCOPE_REASON_TEXT: Record<SurchargeJudgmentScopeReason, string> = {
  before_2018_04_01: "2018년 4월 1일 전 양도는 다주택 중과(소득세법 §104⑦) 시행 전이라 판정하지 않습니다.",
  rules_not_loaded: "주택 수 산정 규칙을 불러오지 못해 판정하지 않았습니다. 잠시 뒤 다시 판정해 주세요.",
  non_housing_sale: "양도 대상이 조합원입주권·분양권입니다 — 다주택 중과는 주택을 양도할 때 적용하므로 중과 대상이 아닙니다.",
  no_house_roster: "보유 주택 정보가 없어 판정하지 않았습니다.",
};

type Props = {
  result: MultiHouseSurchargeJudgmentResponse;
  formHouses: readonly HouseEntry[];
  formRights: readonly PresaleRightEntry[];
  sellingStdPrice: string | undefined;
  /** D3d 「이 사실로 양도세 계산」 — 사실(폼)을 아는 것은 오케스트레이터다 */
  onCalculateTax?: () => void;
};

export function MultiHouseSurchargeResultView({ result, formHouses, formRights, sellingStdPrice, onCalculateTax }: Props) {
  let n = 0;
  const next = () => String(++n);
  const { headline, rows, rateImpact } = result;

  return (
    <div className="space-y-6" data-testid="surcharge-result">
      {result.notices.map((text) => (
        <ToneCard key={text} tone="sky">
          <p className="text-sm leading-relaxed">{text}</p>
        </ToneCard>
      ))}

      {!result.scope.supported && (
        <div data-testid="surcharge-scope-unsupported">
          <ToneCard tone="amber" sectionNum={next()} title="판정 범위 밖">
            <p className="text-sm leading-relaxed">{SCOPE_REASON_TEXT[result.scope.reason]}</p>
          </ToneCard>
        </div>
      )}

      {headline && (
        <div data-testid="surcharge-conclusion">
          <ToneCard tone={headline.result.surchargeType === "none" || headline.result.isSurchargeSuspended ? "emerald" : "rose"} sectionNum={next()} title="양도 예정 주택 결론">
            <p className="text-2xl font-bold" data-testid="surcharge-conclusion-label">
              {rowConclusionLabel(headline.result)}
            </p>
            <p className="text-sm text-muted-foreground">양도일 {result.transferDate} 기준 판정입니다.</p>
          </ToneCard>
        </div>
      )}

      {headline && rows && (
        <ToneCard tone="slate" sectionNum={next()} title="보유 주택별 판정">
          <SurchargeHouseTable
            houses={rows.houses}
            rights={rows.rights}
            formHouses={formHouses}
            formRights={formRights}
            sellingStdPrice={sellingStdPrice}
            effectiveHouseCount={headline.result.effectiveHouseCount}
          />
        </ToneCard>
      )}

      {headline && (
        <ToneCard tone="violet" sectionNum={next()} title="양도 예정 주택 — 판정 순서">
          <SurchargeSellingDetail narrative={headline.narrative} formHouses={formHouses} />
        </ToneCard>
      )}

      {rateImpact && (
        <ToneCard tone="amber" sectionNum={next()} title="세율 영향">
          <SurchargeRateImpactCard rateImpact={rateImpact} />
        </ToneCard>
      )}

      <ExemptionSummaryCard exemption={result.exemption} transferDate={result.transferDate} sectionNum={next()} />

      <div className="flex flex-wrap items-center justify-end gap-2 print:hidden">
        <button
          type="button"
          data-testid="surcharge-print"
          className="text-sm font-medium text-primary hover:underline"
          onClick={() => window.print()}
        >
          인쇄
        </button>
        {onCalculateTax && (
          <CtaButton data-testid="surcharge-calculate-tax" onClick={onCalculateTax}>
            이 사실로 양도세 계산
          </CtaButton>
        )}
      </div>
    </div>
  );
}
