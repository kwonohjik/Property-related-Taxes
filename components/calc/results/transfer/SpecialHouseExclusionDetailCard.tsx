"use client";

/**
 * 모드 2 — 보유 조특법 감면주택 주택수 제외 결과 상세 카드 (§89①3호 의제)
 *
 * ⑦ 결과 카드 — 한국어 풀어쓰기·"원" 끝 미표기·내부 id 미노출.
 * 적격 감면주택은 비과세 판정 주택수에서 제외(violet), 부적격은 사유 표시(rose tone 행).
 * 다주택 중과 주택수는 불변 (R-D 선례) — 하단 안내.
 *
 * 결정 #42 후속 — 조특법 §71의2① 인구감소지역주택(명부 도출)도 같은 `entries`로 온다. 표제를 감면주택과 구분하고,
 * 중과 안내는 항목 조문이 엔진의 15호·13호 확인 목록(`SPECIAL_ACT_15HO_VERIFIED_ARTICLES`)에 드는지로 나눈다 —
 * 그 목록의 제외는 중과 주택 수는 그대로 두되 영 §167의10①15호·§167의3①13호 판정에서 뺀다(엔진 `surcharge15HouseCount`).
 *
 * §71의2 항목이 있으면 「중과 주택 수에는 반영되지 않는다」를 **이 의제 자체**로 한정한다 — 2026.1.1. 이후 취득한
 * 인구감소지역주택은 영 §167의3①12호 다·라목으로 중과 주택 수에서 따로 빠질 수 있다(같은 항 본문 괄호 「제1호 또는
 * 제12호에 해당하는 주택은 주택의 수를 계산할 때 산입하지 않는다」 · 엔진 `multi-house-surcharge-count.ts` 배제 7).
 */

import type { SpecialHouseExclusionResolution } from "@/lib/tax-engine/transfer-reductions/unsold-hybrid-p5";
import { POP_DECLINE_71_2_ARTICLE } from "@/lib/tax-engine/transfer-reductions/population-decline-71-2";
import { SPECIAL_ACT_15HO_VERIFIED_ARTICLES } from "@/lib/tax-engine/transfer-tax-house-exclusion-step";
import { MULTI_HOUSE } from "@/lib/tax-engine/legal-codes";
import { countExclusionHouseRef, type HouseRefRow } from "./count-exclusion-house-ref";

interface Props {
  detail: SpecialHouseExclusionResolution;
  /** 명부 — 행에서 온 항목에 「보유 주택 N」을 붙인다(`count-exclusion-house-ref.ts`). */
  houses?: readonly HouseRefRow[];
}

export function SpecialHouseExclusionDetailCard({ detail, houses }: Props) {
  if (!detail.entries || detail.entries.length === 0) return null;

  const hasPopDecline = detail.entries.some((e) => e.article === POP_DECLINE_71_2_ARTICLE);
  const hasReduced = detail.entries.some((e) => e.article !== POP_DECLINE_71_2_ARTICLE);
  const subject = !hasPopDecline
    ? "조특법 감면주택"
    : hasReduced
      ? "조특법 감면주택·인구감소지역주택"
      : "조특법 인구감소지역주택";
  const eligibleEntries = detail.entries.filter((e) => e.eligible);
  const verified15 = eligibleEntries.some((e) => SPECIAL_ACT_15HO_VERIFIED_ARTICLES.has(e.article));
  const unverified15Labels = eligibleEntries
    .filter((e) => !SPECIAL_ACT_15HO_VERIFIED_ARTICLES.has(e.article))
    .map((e) => e.articleLabel);
  const surchargeCountLead = hasPopDecline
    ? "※ 이 주택 수 제외(의제) 자체는 다주택 중과세율 판정의 주택 수를 바꾸지 않습니다"
    : "※ 다주택 중과세율 판정의 주택 수에는 반영되지 않습니다";

  return (
    <div
      data-testid="special-house-exclusion-card"
      className="rounded-lg border border-violet-200 bg-violet-50/50 dark:border-violet-800/40 dark:bg-violet-950/20 p-4 space-y-3"
    >
      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-sm font-semibold text-violet-900 dark:text-violet-200">
          {subject} 보유 — 주택수 제외
        </p>
        <span className="text-xs rounded-full bg-violet-100 text-violet-800 dark:bg-violet-950/40 dark:text-violet-300 px-2 py-0.5 font-medium">
          제외 {detail.excludedCount}채
        </span>
      </div>

      <p className="text-xs text-violet-900 dark:text-violet-200/90">
        보유 중인 {subject}을 1세대 1주택 비과세 판정 주택 수에서 제외합니다 (소득세법
        제89조제1항제3호 의제). 아래 적격 {detail.excludedCount}채가 양도 주택의 비과세 판정에서
        소유주택으로 보지 않습니다.
      </p>

      <div className="space-y-1.5">
        {detail.entries.map((e, i) => (
          <div
            key={i}
            className={
              e.eligible
                ? "rounded border border-violet-100 dark:border-violet-800/30 bg-white/70 dark:bg-white/5 p-2.5 text-xs space-y-1"
                : "rounded border border-rose-200 dark:border-rose-800/40 bg-rose-50/70 dark:bg-rose-950/30 p-2.5 text-xs space-y-1"
            }
          >
            <div className="flex items-center justify-between gap-2">
              <span
                className={
                  e.eligible
                    ? "font-medium text-violet-900 dark:text-violet-200"
                    : "font-medium text-rose-900 dark:text-rose-200"
                }
              >
                {countExclusionHouseRef(houses, e.houseId) && (
                  <span data-testid="count-exclusion-house-ref">{countExclusionHouseRef(houses, e.houseId)} — </span>
                )}
                {e.articleLabel}
              </span>
              <span
                className={
                  e.eligible
                    ? "shrink-0 rounded-full bg-violet-100 text-violet-800 dark:bg-violet-950/40 dark:text-violet-300 px-2 py-0.5 font-medium"
                    : "shrink-0 rounded-full bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300 px-2 py-0.5 font-medium"
                }
              >
                {e.eligible ? "주택수 제외" : "제외 불가"}
              </span>
            </div>
            {!e.eligible && e.reason && (
              <p className="text-rose-900 dark:text-rose-200/90">{e.reason}</p>
            )}
            <p className="text-micro text-muted-foreground">근거 조문: {e.legalBasis}</p>
          </div>
        ))}
      </div>

      {verified15 ? (
        <p data-testid="special-house-exclusion-surcharge-15ho-notice" className="text-micro text-muted-foreground">
          {surchargeCountLead}. 다만 「조세특례제한법」에 따라 1주택으로 보는 중과
          배제 사유(소득세법 시행령 §167의10①15호·§167의3①13호)를 판정할 때는 이 주택을 빼고 봅니다
        </p>
      ) : (
        <p className="text-micro text-muted-foreground">
          {surchargeCountLead} (소득세법 시행령 §167의3 별개)
        </p>
      )}
      {verified15 && unverified15Labels.length > 0 && (
        <p className="text-micro text-muted-foreground">
          ※ {unverified15Labels.join("·")}은(는) 위 중과 배제 사유에 드는지 확인되지 않아 그 판정에서는 빼지
          않습니다(확인 필요)
        </p>
      )}
      {hasPopDecline && (
        <p data-testid="special-house-exclusion-second-home-notice" className="text-micro text-muted-foreground">
          ※ 인구감소지역주택을 2026년 1월 1일 이후 취득했다면 중과 주택 수는 이 의제와 별개로 {MULTI_HOUSE.SECOND_HOME_DEPOPULATION}
          (동일 시·군·구 보유주택 없음·기준시가 한도 등)에 따라 따로 판정하며, 요건을 갖추면 주택 수에 산입하지 않습니다
        </p>
      )}
    </div>
  );
}
