"use client";

/**
 * 가업상속공제 §97의2④ 의제·일반 비교 결과 카드
 *
 * Plan v3 §4-2 레이아웃: 4행 비교 표
 *   ① 일반 §97 결정세액 (상속개시일 평가액 기준 · 「소득세법 시행령」 §163⑨)
 *     ⚠️ A21(2026-09-02) 정정: 「피상속인 원취득가액 기준」이 아니다. 엔진은 §163⑨에 따라
 *        **상속개시일 현재 평가액**을 취득가액으로 보고 계산한다. 피상속인의 원취득가액이
 *        쓰이는 곳은 §97의2④1호(의제) 쪽이다 — 두 행의 설명이 서로 뒤바뀌어 있었다.
 *   ② 의제 §97의2④ 결정세액 (의제 취득가액 기준)
 *   ③ §18의2⑩ 양도소득세 상당액 공제액 = max(0, 의제세액 − 일반세액)
 *     — 이 양도세에서 빼지 않는다. 사후관리(상증법 §18의2⑤·⑧2호)로 상속세를 부과할 때 상속세 산출세액에서 공제한다(R-c06-03).
 *   ④ 적용 분기 (의제 세액이 더 낮으면 의제 적용, 높으면 의제 + §18의2⑩ 공제)
 *
 * 음수 가드: creditAmount=0 시 (의제 산식이 일반보다 유리) sky 안내 배지
 * rose 안내: §97의2④ 본문 강제 적용 (납세자 불리해도 의제 적용)
 *
 * 정책 준수:
 *   - 한국어 풀어쓰기 (변수 약어 금지)
 *   - 숫자 끝 "원" 표기 금지 (feedback_no_won_suffix)
 *   - print:block 자동 펼침
 */

import Link from "next/link";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import type { FamilyBusinessCgtDetail } from "@/lib/tax-engine/transfer-tax-family-business";
import { resolveFamilyBusinessRateFraction } from "@/lib/tax-engine/family-business-applied-rate";
import { formatFractionPercent } from "@/lib/calc/format-fraction-percent";
import { Frac } from "@/components/calc/results/shared/FormulaParts";
import { FamilyBusinessLthdPortionTable } from "@/components/calc/results/transfer/FamilyBusinessLthdPortionTable";
import type { FbLthdSliceDetail } from "@/lib/tax-engine/types/fb-lthd.types";
import type { StockFamilyBusinessDetail } from "@/lib/tax-engine/stock-transfer/types/stock-family-business.types";
import { FB_MOVING_AVG_NOTICE } from "@/lib/tax-engine/stock-transfer/stock-family-business-lot";

interface Props {
  /** 부동산 `FamilyBusinessCgtDetail` 또는 주식 `StockFamilyBusinessDetail`(1주당 × 주식수 행·신고 단위 합계 안내가 더해진다) */
  detail: FamilyBusinessCgtDetail | StockFamilyBusinessDetail;
  /** 다종목일 때 이 카드가 어느 종목의 것인지 — 부제로 붙는다 */
  itemLabel?: string;
  /** §95④ 후단 부분별 장기보유특별공제 echo(`result.fbLthdDetail`) — 없으면(구 이력·주식) 표를 그리지 않는다 */
  fbLthdDetail?: FbLthdSliceDetail;
  /** `result.longTermHoldingDeduction` */
  longTermHoldingDeduction?: number;
  /**
   * 주식 다종목 신고의 전체 종목 수 — 2 이상이면 세 금액이 **신고 단위 합계**(비가업 종목 세액 포함)라는 고지를 띄운다.
   * 단건이면 생략.
   */
  filingItemCount?: number;
  /** 사후관리 추징 연동 링크 — 다종목에서 같은 공제액이 카드마다 실리므로 첫 카드에만 둔다(이중 입력 방지). 기본 true */
  showPostMgmtLink?: boolean;
}

// ── 행 컴포넌트 ─────────────────────────────────────────────────

function Row({
  label,
  value,
  sub = false,
  highlight = false,
}: {
  label: React.ReactNode;
  value: string;
  sub?: boolean;
  highlight?: boolean;
}) {
  return (
    <tr className={highlight ? "bg-muted/30" : ""}>
      <td className={`py-1.5 pl-3 pr-2 text-muted-foreground ${sub ? "pl-6 text-xs" : "text-sm"}`}>
        {label}
      </td>
      {/* 금액 열은 sub 여부와 무관하게 표(text-sm)에서 크기를 상속받는다 —
          구성요소와 합계가 다른 크기로 렌더되면 자릿수가 세로로 어긋난다. */}
      <td className={`py-1.5 pr-3 text-right font-mono tabular-nums whitespace-nowrap ${highlight ? "font-semibold" : ""}`}>
        {value}
      </td>
    </tr>
  );
}

/** 주식 상세인가 — 주식만 `shareCount`(양도 주식수)를 싣는다 */
function isStockDetail(d: FamilyBusinessCgtDetail | StockFamilyBusinessDetail): d is StockFamilyBusinessDetail {
  return "shareCount" in d;
}

/** 적용률 법정량 한 줄 — lot별 표에서 쓴다 */
function basisText(b: NonNullable<StockFamilyBusinessDetail["appliedRateBasis"]>): string {
  return b.kind === "deduction_ratio"
    ? `가업상속공제금액 ${formatKRW(b.deductionAmount)} / 가업상속 재산가액 ${formatKRW(b.businessEstateValue)}`
    : `(법인 총자산가액 ${formatKRW(b.totalAssets)} − 사업무관자산가액 ${formatKRW(b.nonBusinessAssets)}) / 법인 총자산가액 ${formatKRW(b.totalAssets)}`;
}

/**
 * 취득 lot 단위 입력에서 가업 lot이 둘 이상 매도에 배정됐을 때 — lot마다 법정량·피상속인 취득가액이 달라
 * 위 표의 상단 값은 첫 lot 기준이다. 정확한 값은 여기(배정 주식수 기준 금액).
 * 이동평균(`pooled`)이면 취득가액이 풀 평균 단가로 정해져 이 금액은 FIFO 물량 기준 **참고값**이다.
 */
function FamilyBusinessLotsTable({ detail }: { detail: StockFamilyBusinessDetail }) {
  const lots = detail.lots;
  if (!lots || lots.length < 2) return null;
  return (
    <div className="space-y-1.5" data-testid="fb-lots-table">
      <p className="text-xs font-semibold text-emerald-900 dark:text-emerald-200">
        가업상속 lot별 의제 취득원가 (매도에 배정된 주식수 기준)
      </p>
      <div className="overflow-x-auto rounded-md border border-border bg-background">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="px-2 py-1.5 text-left font-semibold">매수 건</th>
              <th className="px-2 py-1.5 text-right font-semibold">배정 주식수</th>
              <th className="px-2 py-1.5 text-left font-semibold">가업상속공제적용률</th>
              <th className="px-2 py-1.5 text-right font-semibold">피상속인 1주당</th>
              <th className="px-2 py-1.5 text-right font-semibold">피상속인 취득가액</th>
              <th className="px-2 py-1.5 text-right font-semibold">자본적 지출액</th>
              <th className="px-2 py-1.5 text-right font-semibold">상속개시일 평가액</th>
              <th className="px-2 py-1.5 text-right font-semibold">의제 취득원가</th>
            </tr>
          </thead>
          <tbody>
            {lots.map((l, i) => {
              const f = resolveFamilyBusinessRateFraction(l.appliedRate, l.appliedRateBasis);
              return (
                <tr key={l.lotId ?? i} className="border-b border-border last:border-0" data-testid="fb-lots-row">
                  <td className="px-2 py-1.5">가업상속 매수 건 {i + 1}</td>
                  <td className="px-2 py-1.5 text-right font-mono tabular-nums">{formatKRW(l.shares)}</td>
                  <td className="px-2 py-1.5">
                    {formatFractionPercent(f.numerator, f.denominator)}%
                    <span className="block text-micro text-muted-foreground">{basisText(l.appliedRateBasis)}</span>
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono tabular-nums">{formatKRW(l.decedentAcquisitionPricePerShare)}</td>
                  <td className="px-2 py-1.5 text-right font-mono tabular-nums">{formatKRW(l.decedentPart)}</td>
                  <td className="px-2 py-1.5 text-right font-mono tabular-nums">{l.capex ? formatKRW(l.capex) : "-"}</td>
                  <td className="px-2 py-1.5 text-right font-mono tabular-nums">{formatKRW(l.valuationPart)}</td>
                  <td className="px-2 py-1.5 text-right font-mono tabular-nums font-semibold">{formatKRW(l.buyCost)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── 메인 컴포넌트 ───────────────────────────────────────────────

export function FamilyBusinessImputedComparisonCard({
  detail,
  itemLabel,
  fbLthdDetail,
  longTermHoldingDeduction,
  filingItemCount,
  showPostMgmtLink = true,
}: Props) {
  const {
    imputedAcquisitionPrice,
    cgtUnderSection97_2_4,
    cgtUnderSection97,
    creditAmount,
    appliedRate,
    decedentAcquisitionPrice,
    inheritanceMarketValue,
    decedentCapitalExpenditure,
    appliedRateBasis,
  } = detail;

  // F-3: 엔진이 곱한 것과 같은 분수로 표시한다(법정량이 있으면 그것, 없으면 소수 6자리 basis).
  const frac = resolveFamilyBusinessRateFraction(appliedRate, appliedRateBasis);
  const ratePct = formatFractionPercent(frac.numerator, frac.denominator);
  const restPct = formatFractionPercent(frac.denominator - frac.numerator, frac.denominator);

  const stock = isStockDetail(detail) ? detail : null;
  // 다종목이면 세 금액은 신고 단위 결정세액(비가업 종목 포함)의 차이 1회분이다 — 종목 간에 더하지 않는다
  const fbItemCount = stock?.fbItemCount ?? 1;
  const filingCount = Math.max(filingItemCount ?? 1, fbItemCount);
  // 가업 lot이 2개 이상 배정되면 lot마다 적용률·피상속인 단가가 다를 수 있다 — 상단 적용률(첫 lot 값)로 쓰면
  // 「합계 × 첫 lot 적용률」이 의제 취득가액과 맞지 않는다(14지점 점검 lot M-2). 적용률은 lot별 표에서만 보인다.
  const multiLot = (stock?.lots?.length ?? 0) >= 2;

  // 의제 산식이 일반보다 유리한 경우 (차액 공제 불필요)
  const imputedIsFavorable = creditAmount === 0 && cgtUnderSection97_2_4 <= cgtUnderSection97;

  return (
    <div className="rounded-lg border border-emerald-300 bg-emerald-50/40 dark:bg-emerald-950/20 p-4 space-y-3 print:block">

      {/* 헤더 */}
      <div>
        <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">
          {stock ? "가업상속공제 주식 양도세 특례" : "가업상속공제 자산 양도세 특례"} (소득세법 §97의2④)
          {itemLabel && <span className="ml-2 text-xs font-normal">{itemLabel}</span>}
        </p>
        <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-0.5">
          {multiLot
            ? "의제 취득가액 = 가업 lot마다 (피상속인 원취득가액 × 적용률 + 상속개시일 평가액 × (1 − 적용률))의 합계 — 적용률은 lot별 표"
            : `의제 취득가액 = 피상속인 원취득가액 × ${ratePct}% + 상속개시일 평가액 × ${restPct}%`}
        </p>
        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
          <LawArticleModal legalBasis="소득세법 §97의2④" label="§97의2④ 가업상속 의제" />
          <LawArticleModal legalBasis="상속세및증여세법 §18의2⑩" label="§18의2⑩ 양도소득세 상당액 공제" />
        </div>
      </div>

      {stock?.pooled && (
        <p className="text-xs text-amber-800 dark:text-amber-200" data-testid="fb-pooled-note">
          이동평균법에서는 가업 주식 구분이 없어 아래 요약은 FIFO 물량 기준 참고값입니다 — 실제 취득가액은 가업 주식의 단가가 풀 평균에
          섞인 값(로트별 매칭 상세의 매수단가 × 주식수)입니다. {FB_MOVING_AVG_NOTICE}
        </p>
      )}

      {/* 산식 표 */}
      <div className="rounded-md border border-border overflow-hidden bg-background">
        <table className="w-full text-sm border-collapse [&_tr]:border-b [&_tr]:border-border [&_tr:last-child]:border-0">
          <tbody>

            {/* 의제 취득가액 산출 */}
            <Row
              label={
                stock
                  ? stock.lots && stock.lots.length >= 2
                    ? // lot마다 1주당이 달라 평균 × 주식수가 합계와 어긋날 수 있다 — 합계와 배정 주식수만 보이고 lot별 값은 아래 표
                      `피상속인 원취득가액 (배정 주식수 ${formatKRW(stock.shareCount)} · lot별 1주당은 아래 표)`
                    : `피상속인 원취득가액 (1주당 ${formatKRW(stock.decedentAcquisitionPricePerShare)} × 주식수 ${formatKRW(stock.shareCount)})`
                  : "피상속인 원취득가액"
              }
              value={formatKRW(decedentAcquisitionPrice)}
              sub
            />
            {/* A22(2026-09-02): 자본적지출이 있으면 base 구성요소로 함께 보여준다.
                종전에는 이 행이 없어 표 안의 세 숫자가 서로 맞지 않았다(실측 괴리 80,000,000원). */}
            {!!decedentCapitalExpenditure && (
              <Row
                label="피상속인 자본적 지출액"
                value={formatKRW(decedentCapitalExpenditure)}
                sub
              />
            )}
            <Row
              label={stock ? "상속개시일 평가액 (취득가액 입력)" : "상속개시일 자산 평가액"}
              value={formatKRW(inheritanceMarketValue)}
              sub
            />
            {/* F-3: 적용률을 금액으로 입력했으면 그 법정량을 보인다(소령 §163의2③). */}
            {!multiLot && appliedRateBasis?.kind === "deduction_ratio" && (
              <Row
                label={
                  <span data-testid="fb-rate-basis-row">
                    가업상속공제적용률 ={" "}
                    <Frac
                      top={`가업상속공제금액 ${formatKRW(appliedRateBasis.deductionAmount)}`}
                      bottom={`가업상속 재산가액 ${formatKRW(appliedRateBasis.businessEstateValue)}`}
                    />
                  </span>
                }
                value={`${ratePct}%`}
                sub
              />
            )}
            {/* 신 ③2호(양도일 2026.2.27. 이후 법인가업) — 총자산가액 중 사업무관자산을 뺀 비율 */}
            {!multiLot && appliedRateBasis?.kind === "corporate_business_assets" && (
              <Row
                label={
                  <span data-testid="fb-rate-basis-row">
                    가업상속공제적용률 ={" "}
                    <Frac
                      top={`법인 총자산가액 ${formatKRW(appliedRateBasis.totalAssets)} − 사업무관자산가액 ${formatKRW(appliedRateBasis.nonBusinessAssets)}`}
                      bottom={`법인 총자산가액 ${formatKRW(appliedRateBasis.totalAssets)}`}
                    />
                  </span>
                }
                value={`${ratePct}%`}
                sub
              />
            )}
            <Row
              label={
                multiLot
                  ? "의제 취득가액 (가업 lot별 합계 · lot별 적용률은 아래 표)"
                  : decedentCapitalExpenditure
                    ? `의제 취득가액 ((원취득가 + 자본적지출) × ${ratePct}% + 평가액 × ${restPct}%)`
                    : `의제 취득가액 (원취득가 × ${ratePct}% + 평가액 × ${restPct}%)`
              }
              value={formatKRW(imputedAcquisitionPrice)}
              highlight
            />

            {/* 구분선 역할 빈 행 */}
            <tr className="bg-muted/20">
              <td colSpan={2} className="py-1 pl-3 text-caption font-semibold text-muted-foreground">
                비교과세 (소법 §97의2④ 본문)
              </td>
            </tr>

            {/* 일반 §97 결정세액 */}
            <Row
              label="일반 §97 결정세액 (상속개시일 평가액 기준 · 소득세법 시행령 §163⑨)"
              value={formatKRW(cgtUnderSection97)}
            />

            {/* 의제 §97의2④ 결정세액 */}
            <Row
              label="의제 §97의2④ 결정세액 (의제 취득가액 기준)"
              value={formatKRW(cgtUnderSection97_2_4)}
            />

            {/* §18의2⑩ 공제액 */}
            <Row
              label="§18의2⑩ 공제액 = 의제 결정세액 − 일반 결정세액 (음수면 0)"
              value={formatKRW(creditAmount)}
              highlight
            />

          </tbody>
        </table>
      </div>

      {stock?.lots && stock.lots.length >= 2 && <FamilyBusinessLotsTable detail={stock} />}

      {stock && filingCount >= 2 && (
        <p className="text-xs text-amber-800 dark:text-amber-200" data-testid="fb-item-count-note">
          위 두 결정세액은 이 신고의 종목 {filingCount}건(가업상속 종목 {fbItemCount}건 포함)을 합산한 <strong>신고 단위 결정세액</strong>이고,
          공제액은 가업상속 종목을 모두 상속개시일 평가액으로 되돌린 세액과의 차이 1회분입니다 — 종목마다 같은 값이 실리므로 종목끼리 더하지 마세요.
        </p>
      )}

      {fbLthdDetail && <FamilyBusinessLthdPortionTable detail={fbLthdDetail} totalDeduction={longTermHoldingDeduction ?? 0} />}

      {/* 적용 분기 안내 */}
      {/*
        🔴 두 안내문을 함께 고쳤다 (2026-09-07 대장 재대조 · #14 · #31).
          · #31 — 「납세자에게 유리」·「납세자 불리 케이스」는 루트 CLAUDE.md의 **유리/불리 표현 금지**에 걸린다.
          · #14 — 인과가 거꾸로였다. 일반 §97의 취득가액 기준은 **상속개시일 평가액**(영 §163⑨)이지
            「피상속인 원취득가액」이 아니다(그것은 의제 산식의 **구성요소**다). 두 결정세액의
            차이를 만드는 것은 「의제 취득가액 vs 상속개시일 평가액」이므로, 비교 대상은 위 표의
            **두 결정세액** 그 자체로 말한다.
      */}
      {imputedIsFavorable ? (
        /* 의제 결정세액 ≤ 일반 결정세액 → §18의2⑩ 공제 없음 */
        <div className="rounded-md border border-sky-300 bg-sky-50/60 px-3 py-2 text-xs text-sky-800 dark:text-sky-200 dark:bg-sky-950/40">
          <p className="font-semibold">의제 §97의2④ 산식 적용 — §18의2⑩ 공제액 없음</p>
          <p className="mt-0.5">
            의제 결정세액({formatKRW(cgtUnderSection97_2_4)})이 일반 결정세액({formatKRW(cgtUnderSection97)})
            {cgtUnderSection97_2_4 < cgtUnderSection97 ? "보다 작습니다." : "과 같습니다."}
            {" "}§18의2⑩ 공제는 「의제 − 일반」의 양(+)의 차액에만 적용되므로 이 경우 공제액이 0입니다.
          </p>
        </div>
      ) : (
        /* 의제 결정세액 > 일반 결정세액 → 강제 적용 + §18의2⑩ 공제 */
        <div className="rounded-md border border-rose-300 bg-rose-50/60 px-3 py-2 text-xs text-rose-800 space-y-1 dark:text-rose-200 dark:bg-rose-950/40">
          <p className="font-semibold">소법 §97의2④ 본문 — 의제 산식 강제 적용</p>
          <p>
            의제 결정세액({formatKRW(cgtUnderSection97_2_4)})이 일반 결정세액({formatKRW(cgtUnderSection97)})보다 높습니다.
          </p>
          <p>
            소법 §97의2④ 본문에 따라 의제 산식을 강제 적용합니다.
            차액({formatKRW(creditAmount)})은 가업상속 사후관리로 상속세를 부과할 때 상속세 산출세액에서 공제됩니다(§18의2⑩).
          </p>
        </div>
      )}

      {/* 사후관리 추징 연동 (§18의2⑩) — creditAmount를 시뮬레이터에 prefill (PR-5) */}
      {creditAmount > 0 && showPostMgmtLink && (
        <div className="rounded-md border border-emerald-300 bg-emerald-50/60 px-3 py-2 text-xs text-emerald-800 space-y-1 dark:text-emerald-200 dark:bg-emerald-950/40">
          <p className="font-semibold">가업상속 사후관리 추징과 연동 (§18의2⑩)</p>
          <p>
            이 양도세 상당액 {formatKRW(creditAmount)}은 가업상속공제 사후관리 추징세액에서
            양도세 환원 공제로 차감됩니다.
          </p>
          <Link
            href={`/calc/family-business-postmgmt?cgt=${creditAmount}`}
            className="inline-block font-medium text-emerald-700 underline underline-offset-2 hover:text-emerald-900 dark:text-emerald-300"
          >
            가업상속 사후관리 시뮬레이터에서 추징세액 계산 →
          </Link>
        </div>
      )}

    </div>
  );
}
