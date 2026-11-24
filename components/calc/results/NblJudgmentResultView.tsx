"use client";

/**
 * 비사업용 토지 **판정 결과** 뷰 (계획서 `docs/01-plan/features/nbl-judgment-menu.ui.plan.md` §6 · 「사용자 결정 2차」)
 *
 * 세액이 아니라 사업용·비사업용 **판정**을 보인다. 결과 카드는 계산기와 같은 `NonBusinessLandResultCard`를 쓰되 `judgmentOnly`로 세율을 단정하는 문장 2곳만 판정 중심으로 바꾼다.
 *
 * 🔴 이월과세(`carryover_gift`)는 A(증여자 취득일 기산)·B(증여 등기접수일 기산) 두 판정을 **나란히** 보인다. 어느 쪽이 적용되는지는 소득세법 §97의2①·②
 *    (① 양도일부터 소급 10년 이내 증여 · ② 수용 2년 이전 증여·1세대1주택·세액 비교 배제)가 정하므로 이 화면은 단정하지 않고 「양도소득세 계산기에서 세액 비교로 정해진다」고만 알린다.
 * 🔑 판정 배지는 단일 소스(`nblVerdictOf`)를 거친다 — 요건을 여기서 다시 따지지 않는다. 날짜는 JSON 경유 문자열이다(카드가 안전 처리).
 */
import type { ReactNode } from "react";
import type { NonBusinessLandJudgmentResponse } from "@/app/api/calc/non-business-land-judgment/route";
import { NonBusinessLandResultCard } from "@/components/calc/NonBusinessLandResultCard";
import { CtaButton } from "@/components/calc/shared/WizardNav";
import { DisclaimerBanner, JUDGMENT_DISCLAIMER } from "@/components/calc/shared/DisclaimerBanner";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { nblInputEffectLines } from "@/lib/calc/nbl-judgment-input-effects-text";
import { nblVerdictOf, nblVerdictFromResult } from "@/lib/calc/nbl-judgment-verdict";
import type { NblVerdict } from "@/lib/calc/nbl-judgment-verdict";
import { computeNblJudgmentSummary } from "@/lib/calc/nbl-judgment-summary";
import { getOwnershipRatio } from "@/lib/calc/transfer-tax-api-asset-basics";
import type { NblJudgmentFormData } from "@/lib/stores/nbl-judgment-form.types";
import type { NblInputEffects } from "@/lib/tax-engine/non-business-land-menu-effects";

/** 결과 머리의 전제 요약에 쓰는 사이드바 항목 — 소재지·지목·취득일(원인별)·양도일·면적·지분. */
const PREMISE_LABELS = new Set(["소재지", "지목", "취득일", "상속개시일", "증여 등기접수일", "증여자 취득일", "양도일", "면적", "공유 지분"]);

const VERDICT_BADGE: Record<NblVerdict["tone"], string> = {
  emerald: "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300",
  rose: "border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-700 dark:bg-rose-950/30 dark:text-rose-300",
  amber: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-300",
  violet: "border-violet-300 bg-violet-50 text-violet-800 dark:border-violet-700 dark:bg-violet-950/30 dark:text-violet-300",
};

/** 계산기에서 §66 자경 편입 부분감면을 켜면 비워 둔 도시편입일이 그 감면의 편입일로 채워질 수 있다(엔진 V-10 · `non-business-land-request.ts` fallback). */
const SELF_FARMING_INCORPORATION_NOTE =
  "계산기에서 자경 농지 감면의 편입 부분감면(조세특례제한법 §66)을 켜면, 여기서 비워 둔 도시편입일이 그 감면의 편입일로 채워져 판정에 쓰일 수 있습니다 — 계산기에서 판정을 다시 확인하세요.";

const SHARE_NOTE =
  "지분율과 「나머지 지분은 타인 소유」 선언은 그대로 넘어갑니다. 계산기에서 양도가액·취득가액은 물건 전체(100%) 기준으로 입력하세요 — 시스템이 지분율을 적용합니다.";

function EffectsCard({ effects, testId, title }: { effects: NblInputEffects | undefined; testId: string; title?: string }) {
  const lines = nblInputEffectLines(effects);
  if (lines.length === 0) return null;
  return (
    <ToneCard tone="amber" title={title ?? "입력했지만 판정에 쓰이지 않은 칸"}>
      <ul className="list-disc space-y-0.5 pl-5 text-caption" data-testid={testId}>
        {lines.map((l) => (
          <li key={l.field}>{l.text}</li>
        ))}
      </ul>
    </ToneCard>
  );
}

function VerdictBadge({ verdict, testId }: { verdict: NblVerdict; testId: string }) {
  return (
    <div className={`rounded-lg border px-4 py-3 ${VERDICT_BADGE[verdict.tone]}`} data-testid={testId}>
      <p className="text-lg font-bold">{verdict.label}</p>
      <p className="mt-0.5 text-xs">{verdict.detail}</p>
    </div>
  );
}

export function NblJudgmentResultView({
  result,
  form,
  onCalculateTax,
  remainingInputs,
}: {
  result: NonBusinessLandJudgmentResponse;
  /** 판정 전제 요약·계산기 넘기기 안내에 쓰는 입력 — 표시 전용(요건을 다시 따지지 않는다) */
  form: NblJudgmentFormData;
  /** 「양도세 계산하기」 — 없으면 넘기기 카드를 그리지 않는다 */
  onCalculateTax?: () => void;
  /** 계산기에서 더 입력해야 하는 값(`nblHandoffRemainingInputs`) */
  remainingInputs?: readonly string[];
}) {
  const asset = form.assets[0];
  const carryoverB = result.judgmentIfCarryoverExcluded;
  const verdict = nblVerdictFromResult(result as unknown as Record<string, unknown>);
  const premise = computeNblJudgmentSummary(form).filter((i) => PREMISE_LABELS.has(i.label));
  const fractional = asset ? getOwnershipRatio(asset) < 1 : false;
  const showSelfFarmingNote = asset?.nblLandType === "farmland" && !asset.nblUrbanIncorporationDate;

  let card: ReactNode;
  if (carryoverB) {
    const verdictA = nblVerdictOf(result.judgment);
    const verdictB = nblVerdictOf(carryoverB);
    card = (
      <div className="space-y-3" data-testid="nbl-judgment-carryover-pair">
        <ToneCard tone="violet" title="이월과세 — 두 경우를 나란히 판정했습니다">
          <p className="text-caption" data-testid="nbl-judgment-carryover-notice">
            어느 경우가 적용되는지는 이월과세 적용 요건(소득세법 §97의2① 양도일부터 소급 10년 이내의 증여 · ② 배제 사유 — 사업인정고시일부터 소급 2년 이전 증여 후 수용, 이월과세 적용 시 1세대1주택 비과세, 세액 비교)에 따라{" "}
            <b>양도소득세 계산기에서 세액 비교로 정해집니다.</b> 이 화면은 어느 쪽이 적용된다고 말하지 않습니다.
          </p>
        </ToneCard>
        <div className="grid gap-3 lg:grid-cols-2">
          <section className="space-y-2" data-testid="nbl-judgment-card-a">
            <h3 className="text-sm font-semibold">A. 이월과세가 적용되는 경우 — 증여자 취득일부터 소유기간</h3>
            <VerdictBadge verdict={verdictA} testId="nbl-judgment-verdict-a" />
            <NonBusinessLandResultCard judgment={result.judgment} judgmentOnly />
            <EffectsCard effects={result.inputEffects} testId="nbl-judgment-input-effects-a" />
          </section>
          <section className="space-y-2" data-testid="nbl-judgment-card-b">
            <h3 className="text-sm font-semibold">B. 이월과세가 적용되지 않는 경우 — 증여 등기접수일부터 소유기간</h3>
            <VerdictBadge verdict={verdictB} testId="nbl-judgment-verdict-b" />
            <NonBusinessLandResultCard judgment={carryoverB} judgmentOnly />
            <EffectsCard effects={result.inputEffectsIfCarryoverExcluded} testId="nbl-judgment-input-effects-b" />
          </section>
        </div>
      </div>
    );
  } else {
    card = (
      <>
        <NonBusinessLandResultCard judgment={result.judgment} judgmentOnly />
        <EffectsCard effects={result.inputEffects} testId="nbl-judgment-input-effects" />
      </>
    );
  }

  return (
    <div className="space-y-4" data-testid="nbl-judgment-result">
      {/* 결론 머리 — 이월과세 A·B 결론이 다르면 어느 쪽도 고르지 않는다 */}
      {verdict && <VerdictBadge verdict={verdict} testId="nbl-judgment-verdict" />}

      {premise.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" data-testid="nbl-judgment-premise">
          {premise.map((i) => (
            <li key={i.label} className="rounded-full border bg-muted/40 px-2.5 py-0.5 text-xs">
              <span className="text-muted-foreground">{i.label}</span> <span className="font-medium">{i.value}</span>
            </li>
          ))}
        </ul>
      )}

      {card}

      {/* 세율 한정 안내 — 숫자 없음 */}
      <p className="text-xs text-muted-foreground" data-testid="nbl-judgment-qualifier-note">
        이 판정은 사업용·비사업용 여부만 답합니다. 세율·장기보유특별공제·중과 유예·배제는 양도소득세 계산기에서 정해집니다.
      </p>

      {onCalculateTax && (
        <ToneCard tone="emerald" title="이 판정을 양도소득세 계산기로 이어가기" bodyClassName="space-y-2">
          <p className="text-sm leading-relaxed">
            여기서 입력한 <b>판정 사실</b>을 양도소득세 계산기에 그대로 넘깁니다. 계산기는 판정 결과를 복사하지 않고 <b>같은 엔진으로 다시 판정</b>하므로, 계산기에서 양도일 등을 바꾸면 판정도 그에 맞게 바뀝니다.
          </p>
          {remainingInputs && remainingInputs.length > 0 && (
            <p className="text-sm text-muted-foreground" data-testid="nbl-judgment-to-calculator-remaining">
              계산기에서 더 입력할 값: <b>{remainingInputs.join(" · ")}</b>
            </p>
          )}
          {fractional && (
            <p className="text-sm text-muted-foreground" data-testid="nbl-judgment-to-calculator-share-note">
              {SHARE_NOTE}
            </p>
          )}
          {showSelfFarmingNote && (
            <p className="text-sm text-muted-foreground" data-testid="nbl-judgment-to-calculator-self-farming-note">
              {SELF_FARMING_INCORPORATION_NOTE}
            </p>
          )}
          <CtaButton data-testid="nbl-judgment-to-calculator" onClick={onCalculateTax}>
            양도세 계산하기
          </CtaButton>
        </ToneCard>
      )}

      <DisclaimerBanner body={JUDGMENT_DISCLAIMER} />
    </div>
  );
}
