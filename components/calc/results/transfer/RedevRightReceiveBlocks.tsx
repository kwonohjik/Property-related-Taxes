"use client";

/**
 * 입주권 양도 × 청산금 수령(사례 38·39) — 인가전 분(§166①2호 나목) / 인가후 분(가목) 2-블록.
 * `RedevelopmentDetailCard`에서 분리(800줄 정책 — 2026-11-12, 내용 변경 없음).
 */
import type { RedevelopmentResult } from "@/lib/tax-engine/types/transfer-redevelopment.types";
import { Row, fmtPct } from "./RedevDetailRow";

// 신규 라벨 상수 (계획서 §3-4 (B) — DetailedStatement 라벨 동기화)
export const BRANCH_LABEL_RIGHT_RECEIVE_PREAPPROVAL  = "인가전 분 (§166①2호 나목)";
export const BRANCH_LABEL_RIGHT_RECEIVE_POSTAPPROVAL = "인가후 분 (§166①2호 가목)";

interface Props {
  detail: RedevelopmentResult;
  /** 개산공제율 표기(실제 두 값에서 역산 — `RedevelopmentDetailCard`) */
  estimatedDeductionRateLabel: string;
  /** 이월과세 증여세 상당액(인가 전 분 독립 항) */
  preApprovalGiftTax: number;
}

export function RedevRightReceiveBlocks({ detail, estimatedDeductionRateLabel, preApprovalGiftTax }: Props) {
  const { preApproval, settlement, valuationMeta } = detail;
  return (
      /* 사례 38·39 — 인가전 분(나목) / 인가후 분(가목) 2-블록 분리 표시 */
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {/* 블록 1: 인가전 분 (§166①2호 나목) */}
        <div className="rounded-md bg-white dark:bg-gray-900 border border-violet-200 p-3 space-y-1.5">
          <p className="text-caption font-semibold text-violet-700 dark:text-violet-300">
            {BRANCH_LABEL_RIGHT_RECEIVE_PREAPPROVAL}
          </p>
          <p className="text-micro text-violet-700 dark:text-violet-400">
            §166①2호 나목 · §166⑤1호 (취득일 → 인가일 기산)
            {detail.housingContribDetail ? " + §166③ 환산취득가" : ""}
          </p>
          {/* 의제양도가액 */}
          <Row label="의제양도가액 (권리가액 × 안분비율)" value={preApproval.apportionedTransfer} />
          {/* 취득가액 — 실가 vs 환산 분기 */}
          {detail.housingContribDetail ? (
            /*
              사례 39 — 환산취득가 + 개산공제.
              🔴 종전에는 §166③·§163⑥의 **원액**(안분 전)을 그대로 찍어, 같은 열의 의제양도가액·
                 양도차익(둘 다 안분 후)과 검산이 맞지 않았다(2026-09-07 대장 재대조 · #18).
                 §166①2호 나목은 (권리가액 − 환산취득가 − 개산공제)에 salePriceTotal/권리가액을
                 곱하므로 **실효 차감액이 이미 안분값**이고, 엔진도 그렇게 담아 둔다
                 (`redevelopment.ts:407·421`). 열에는 안분 후 값을 쓰고, 원액 산식은 라벨에 남긴다.
            */
            <>
              <Row
                label={`− 환산취득가(안분 후) — §166③ 원액 ${detail.housingContribDetail.convertedAcquisition.toLocaleString("ko-KR")} = 권리가액 × ${detail.housingContribDetail.housingStdPriceAtAcq.toLocaleString("ko-KR")} / ${detail.housingContribDetail.housingStdPriceAtApproval.toLocaleString("ko-KR")}`}
                value={preApproval.apportionedAcquisition}
              />
              {/* 🔴 base는 **지분 기준시가**(`lumpDeductionBase`)다. 100% 값인
                  `housingStdPriceAtAcq`를 쓰면 공유지분·미등기에서 산식이 자기 값을 만들지
                  못하고 같은 카드의 지분 배지와 모순된다(2026-09-07 대장 재대조 · #19). */}
              {/* 엔진의 인가 전 필요경비(`preApproval.expenses`)에는 이월과세 증여세 상당액(안분 후)이 함께 실려 있다 — 아래 줄로 떼어 보인다. */}
              <Row
                label={`− 필요경비(안분 후) — §163⑥ 개산공제 원액 ${detail.housingContribDetail.estimatedDeduction.toLocaleString("ko-KR")} = 취득시 개별주택가격 ${(valuationMeta?.lumpDeductionBase ?? detail.housingContribDetail.housingStdPriceAtAcq).toLocaleString("ko-KR")} × ${estimatedDeductionRateLabel}`}
                value={(preApproval.expenses ?? 0) - preApprovalGiftTax}
              />
            </>
          ) : (
            /* 사례 38 — 실가 취득가액 */
            <Row label="− 취득가액(실가) × 안분비율" value={preApproval.apportionedAcquisition} />
          )}
          {preApprovalGiftTax > 0 && (
            <Row label="− 이월과세 증여세 상당액(안분 후) — 소득세법 §97의2①3호" value={preApprovalGiftTax} />
          )}
          <Row label="인가전 양도차익" value={preApproval.gain} highlight />
          <p className="pt-1 border-t border-violet-100 text-micro text-violet-700 dark:text-violet-400">
            장기보유공제 ({(preApproval.lthdResidencePart ?? 0) > 0 ? "표2" : "표1"} {fmtPct(preApproval.lthdRate)} · 만 {Math.floor(preApproval.holdingMonths / 12)}년 {preApproval.holdingMonths % 12}개월)
          </p>
          <Row label="장기보유특별공제 (인가전 분)" value={preApproval.lthd} />
          <div className="pt-1 border-t border-violet-100">
            <Row label="인가전 양도소득금액" value={preApproval.gain - preApproval.lthd} highlight />
          </div>
        </div>

        {/* 블록 2: 인가후 분 (§166①2호 가목) + §95² LTHD 미적용 */}
        <div className="rounded-md bg-white dark:bg-gray-900 border border-violet-200 p-3 space-y-1.5">
          <p className="text-caption font-semibold text-violet-700 dark:text-violet-300">
            {BRANCH_LABEL_RIGHT_RECEIVE_POSTAPPROVAL}
          </p>
          <p className="text-micro text-violet-700 dark:text-violet-400">
            §166①2호 가목 · §94①2호 (장기보유특별공제 대상 외)
          </p>
          <Row label="양도가액 (실제 양도가)" value={settlement.apportionedTransfer} />
          <Row label="− (평가액 − 수령청산금)" value={settlement.apportionedAcquisition} />
          {/* 인가후 필요경비 — 0 이상일 때만 표시 */}
          {(settlement.expenses ?? 0) > 0 && (
            <Row label="− 인가후 필요경비" value={settlement.expenses ?? 0} />
          )}
          <Row label="인가후 양도차익" value={settlement.gain} highlight />
          {/* §95² LTHD 미적용 안내 — rose 톤 */}
          <div className="pt-1 border-t border-rose-200 rounded bg-rose-50/60 px-1.5 py-1 space-y-0.5 dark:bg-rose-950/40">
            <div className="flex items-center gap-1.5">
              <span className="rounded-full bg-rose-200 px-1.5 py-0.5 text-micro font-bold text-rose-800">§95② 본문 괄호</span>
              <span className="text-micro text-rose-800 font-semibold dark:text-rose-200">장기보유특별공제 적용 없음</span>
            </div>
            <p className="text-micro text-rose-700 dark:text-rose-300">
              조합원입주권은 §94①2호 가목(부동산을 취득할 수 있는 권리)이고, §95② 본문 괄호가 공제 대상을 관리처분 인가 전 토지분·건물분의 양도차익으로 한정합니다 — 인가후 분은 적용 제외.
            </p>
          </div>
          <div className="pt-1 border-t border-violet-100">
            <Row label="인가후 양도소득금액" value={settlement.gain} highlight />
          </div>
        </div>
      </div>
  );
}
