"use client";

/**
 * 1세대1주택 판정 — **비과세 요건 순차 검토** 카드 (2026-09-29)
 *
 * 계획서 `docs/00-pm/one-house-judgment-temp-two-house-review.plan.md` §5-3.
 *
 * 🔑 이 카드는 **판정하지 않는다** — 엔진이 낸 `judgment.requirementReview`의 행을 순서대로 그릴 뿐이다.
 *    상태·날짜·금액을 여기서 다시 계산하면 배지와 어긋나는 dual truth가 된다
 *    (`feedback_aggregate_display_rederives_engine_value`).
 */
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { TONE, type Tone } from "@/components/calc/shared/tones";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import type {
  OneHouseRequirementReview,
  OneHouseRequirementStatus,
} from "@/lib/tax-engine/one-house/types";

const STATUS_LABEL: Record<OneHouseRequirementStatus, string> = {
  met: "충족",
  unmet: "미충족",
  waived: "면제",
  not_required: "해당 없음",
  partial: "초과분 과세",
};

const STATUS_TONE: Record<OneHouseRequirementStatus, Tone> = {
  met: "emerald",
  unmet: "rose",
  waived: "violet",
  not_required: "slate",
  partial: "amber",
};

const SCHEME_TITLE: Record<OneHouseRequirementReview["scheme"], string> = {
  "155-1-temporary-two-house": "일시적 2주택 비과세 요건 검토",
  "154-1-one-house": "1세대1주택 비과세 요건 검토",
};

export function OneHouseRequirementReviewCard({
  review,
  sectionNum,
}: {
  review: OneHouseRequirementReview;
  sectionNum: string;
}) {
  return (
    <ToneCard tone="sky" sectionNum={sectionNum} title={SCHEME_TITLE[review.scheme]}>
      <p className="text-sm text-muted-foreground">
        법령이 정한 순서대로 각 요건을 검토한 결과입니다.
      </p>
      <ol className="space-y-3" data-testid="one-house-requirement-review">
        {review.items.map((item, i) => (
          <li
            key={item.id}
            className="space-y-1 text-sm"
            data-testid={`one-house-requirement-${item.id}`}
            data-status={item.status}
          >
            <p className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{i + 1}.</span>
              <span
                className={`rounded px-1.5 py-0.5 text-micro font-semibold ${TONE[STATUS_TONE[item.status]].badge}`}
              >
                {STATUS_LABEL[item.status]}
              </span>
              <span className="font-medium">{item.label}</span>
            </p>
            {item.facts.length > 0 && (
              <p className="ml-5 text-caption text-muted-foreground">
                {item.facts.map((f, j) => (
                  <span key={f.label}>
                    {j > 0 && " · "}
                    {f.label} <span className="font-mono tabular-nums text-foreground">{f.value}</span>
                  </span>
                ))}
              </p>
            )}
            {item.note && <p className="ml-5 text-caption">{item.note}</p>}
            <span className="ml-5 inline-block">
              <LawArticleModal legalBasis={item.legalBasis} />
            </span>
          </li>
        ))}
      </ol>
    </ToneCard>
  );
}
