"use client";

/**
 * 장기임대주택 특례 — **계산기(`mode="calc"`) 전용 요약·안내** (P6-c-2).
 *
 * `RentalHousingExceptionSection.tsx`에서 800줄 정책에 따라 분리(결정 #21, 2026-10-11). 옮긴 것은 위치뿐이다 — 토글이 없는 계산기 카드가
 * 판정 메뉴에서 넘겨받은 선언을 요약하고(없으면 안내), 아래 `body`(③ 거주기간·§161① 안분 입력)를 그대로 싣는다.
 */

import Link from "next/link";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { isAddendumTransitionEffective } from "@/lib/tax-engine/data/rental-155-20-era";
import type { ReactNode } from "react";

export function RentalHousingCalcSummary({
  rh,
  judgmentLoaded,
  body,
}: {
  rh: AssetForm["rentalHousingException"];
  judgmentLoaded: boolean;
  body: ReactNode;
}) {
  if (!rh.applyException) {
    return (
      <div
        className="rounded-lg border border-violet-200 bg-violet-50/40 p-3 text-sm text-violet-900 dark:text-violet-200 dark:bg-violet-950/40"
        data-testid="rental-housing-handoff-notice"
      >
        {/*
          🔴 **이미 판정을 다녀온 사용자에게 「가라」고 하지 않는다** (P6-c-5).

          종전에는 이 카드가 `asset`만 받아 폼-전역 provenance를 볼 수단이 없었다. 판정을
          불러왔는데 이 특례가 **해당 없어** 선언하지 않은 사용자(대부분)에게도 「판정한 뒤
          불러오세요」라고 말했다 — 다시 가도 할 것이 없다. `JudgmentHandoffNoticeCard`
          (Step4)는 같은 축에서 provenance를 보는데 이 카드와 §89①4호만 못 봤다.
        */}
        {judgmentLoaded ? (
          <>
            <p>
              넘겨받은 판정에 장기임대주택 거주주택 특례(
              <LawArticleModal legalBasis="소득세법 시행령 §155" label="소령 §155⑳" />
              ) 선언이 <strong>없습니다</strong> — 해당하지 않으면 그대로 두세요.
            </p>
            <p className="mt-1 text-caption text-muted-foreground">
              선언하려면{" "}
              <Link
                href="/calc/one-house-exemption"
                className="font-medium underline underline-offset-2"
                data-testid="rental-housing-handoff-link"
              >
                판정 메뉴
              </Link>
              로 돌아가 다시 판정하세요. 이 계산은 <strong>특례 없음</strong>으로 산출됩니다.
            </p>
          </>
        ) : (
          <>
            <p>
              장기임대주택 보유자 거주주택 비과세 특례(
              <LawArticleModal legalBasis="소득세법 시행령 §155" label="소령 §155⑳" />
              )는{" "}
              <Link
                href="/calc/one-house-exemption"
                className="font-medium underline underline-offset-2"
                data-testid="rental-housing-handoff-link"
              >
                1세대1주택 비과세 판정
              </Link>
              에서 판정한 뒤, 1단계의 「📋 판정 불러오기」로 가져오세요.
            </p>
            <p className="mt-1 text-caption text-muted-foreground">
              판정을 거치지 않으면 이 계산은 <strong>특례 없음</strong>으로 산출됩니다.
            </p>
          </>
        )}
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-violet-300 bg-violet-50/70 p-3 space-y-3 dark:bg-violet-950/40">
      <div className="flex flex-wrap items-center gap-1.5">
        <p className="text-sm font-semibold text-violet-900 dark:text-violet-200">
          장기임대주택 보유자 거주주택 비과세 특례 — 적용
        </p>
        <LawArticleModal legalBasis="소득세법 시행령 §155" label="§155⑳" />
      </div>
      {/* 판정 메뉴에서 넘겨받은 사실 — 여기서는 고칠 수 없다. */}
      <div
        className="rounded-md border border-violet-200 bg-violet-100/50 p-2.5 space-y-1 text-xs text-violet-900 dark:text-violet-200 dark:bg-violet-900/40"
        data-testid="imported-rental-housing-facts"
      >
        <p>
          <strong>
            {rh.scenario === "B"
              ? "임대주택을 거주주택으로 전환 후 양도 (§161① 안분)"
              : "거주주택 양도 (장기임대주택 보유 중)"}
          </strong>{" "}
          · 임대주택 {rh.rentalUnits.length}호
        </p>
        {/* OH-40 — 넘겨받은 생애 1회 판정 사실(세액을 바꾼다). 값이 있을 때만 말한다. */}
        {(rh.priorRentalExemptionHistory || rh.residenceTransitionUnderAddendum) && (
          <p data-testid="imported-rental-lifetime-facts">
            {[
              !rh.residenceTransitionUnderAddendum
                ? null
                : rh.residenceTransitionBasis === "residing"
                  ? "2019.2.12 부칙 경과조치 해당(당시 거주)"
                  : rh.residenceTransitionBasis === "contract_with_prior_rental"
                    ? "2019.2.12 부칙 경과조치 해당(그 전 계약금 지급 · 등록 임대주택 소유)"
                    : rh.residenceTransitionBasis === "contract_without_prior_rental"
                      ? "2019.2.12 부칙 경과조치 — 그 전 등록 임대주택 없음(종전 규정 미적용)"
                      : "2019.2.12 부칙 경과조치 — 사유 미입력(종전 규정 미적용, 판정 메뉴에서 사유를 선택하세요)",
              // 경과조치가 종전 규정을 주면 생애 1회 이력은 묻지 않는다(D11) — 주지 않을 때만 이력을 말한다.
              !isAddendumTransitionEffective(rh.residenceTransitionUnderAddendum === true, rh.residenceTransitionBasis) &&
              rh.priorRentalExemptionHistory
                ? rh.priorRentalExemptionHistory === "used"
                  ? "장기임대주택 보유 중 거주주택 양도 이력: 있음 (생애 1회 제한)"
                  : "장기임대주택 보유 중 거주주택 양도 이력: 없음"
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}
        <p className="text-caption text-muted-foreground">
          시나리오와 임대주택 정보는 이 화면에서 수정할 수 없습니다 — 고치려면 판정 메뉴로
          돌아가 다시 판정하세요.
        </p>
      </div>
      {body}
    </div>
  );
}
