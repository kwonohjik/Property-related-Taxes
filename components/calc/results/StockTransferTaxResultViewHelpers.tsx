"use client";

/**
 * StockTransferTaxResultView — 서브 컴포넌트 모음 (800줄 분할)
 *
 * ResultRow · EstimatedValuationBreakdown · ProgressiveTaxBreakdown
 * RuleBadges · Warnings · UnsupportedItemsCard
 *
 * 모두 순수 표시 컴포넌트 — hook 없음.
 */

import type { StockTransferResult } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { Frac } from "@/components/calc/results/shared/FormulaParts";

export function fmt(n: number): string {
  return n.toLocaleString();
}

// ── ResultRow ──

export function ResultRow({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div
      className={`flex justify-between items-center px-4 py-3 ${
        highlight ? "bg-white" : ""
      }`}
    >
      <span className={`text-sm ${highlight ? "font-medium text-slate-700" : "text-slate-500"}`}>
        {label}
      </span>
      <span
        className={`text-sm tabular-nums ${
          highlight ? "font-semibold text-slate-900" : "text-slate-700"
        }`}
      >
        {value.toLocaleString()}
      </span>
    </div>
  );
}

// ── EstimatedValuationBreakdown ──

export function EstimatedValuationBreakdown({
  result,
  shareCount,
}: {
  result: StockTransferResult;
  shareCount: number;
}) {
  const detail = result.valuationDetail;
  if (!detail) return null;

  const isTradingHaltBypass = result.appliedRules?.includes("거래정지우회");
  const isHaltAcquisition = detail.method === "halt_acquisition_conversion";

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-5 py-4 space-y-2">
      <p className="font-semibold text-amber-800 text-sm">
        {isHaltAcquisition ? "환산취득가 산식 분해 (소령 §165③·§165④)" : "환산취득가 산식 분해 (소령 §165⑤)"}
      </p>
      {isTradingHaltBypass && (
        <p className="text-xs text-rose-700">
          양도일 거래정지·관리종목 — 소령 §165③에 따라 1개월 종가평균 대신 비상장 보충 평가(§165④)로 환산했습니다.
        </p>
      )}
      {isHaltAcquisition && (
        <p className="text-xs text-rose-700">
          취득일 거래정지·관리종목 — 소령 §165③에 따라 취득시 기준시가만 비상장 보충 평가(§165④)로
          산정했습니다 (양도시 기준시가는 1개월 종가평균 유지).
        </p>
      )}
      <div className="space-y-1 text-xs text-amber-700 font-mono">
        {detail.method === "post_listing_conversion" && detail.weightedAvgPerShare !== undefined && (
          <>
            <p>1주당 취득기준시가 = {fmt(detail.finalPerShareValue)}</p>
            <p>
              취득가액 = {fmt(detail.finalPerShareValue)} × {shareCount.toLocaleString()}주 ={" "}
              <strong>{fmt(result.acquisitionPrice)}</strong>
            </p>
          </>
        )}
        {isHaltAcquisition && detail.conversionAcqStdPerShare !== undefined && (
          <>
            {detail.netAssetOnlyReason ? (
              <p>취득시 보충평가액 (1주당) = 순자산가치 단독 (§165④3) = {fmt(detail.conversionAcqStdPerShare)}</p>
            ) : (
              <p>
                취득시 보충평가액 (1주당) ={" "}
                <Frac
                  top={
                    <>
                      순손익가치 {fmt(detail.niPerShare ?? 0)} × {detail.isHeavyRE ? 2 : 3} + 순자산가치{" "}
                      {fmt(detail.naPerShare ?? 0)} × {detail.isHeavyRE ? 3 : 2}
                    </>
                  }
                  bottom="5"
                />{" "}
                = {fmt(detail.conversionAcqStdPerShare)}
              </p>
            )}
            <p>양도시 1개월 종가평균 (1주당) = {fmt(detail.conversionTransferStd ?? 0)}</p>
            <p>
              환산취득가 = 양도가액 ×{" "}
              <Frac top="취득시 보충평가액" bottom="양도시 1개월 종가평균" /> ={" "}
              <strong>{fmt(result.acquisitionPrice)}</strong>
            </p>
          </>
        )}
        {result.estimatedBase !== undefined && (
          <p>
            취득기준시가 합계 (개산공제 전) = {fmt(result.estimatedBase)}
          </p>
        )}
        {result.estimatedDeduction !== undefined && result.estimatedDeduction > 0 && (
          <p>
            개산공제 (취득기준시가 × 1%) = {fmt(result.estimatedDeduction)}
          </p>
        )}
        {detail.netAssetFloorApplied && detail.netAssetFloorValue !== undefined && (
          <p className="text-fuchsia-600 font-semibold">
            80% 하한 발동: 가중평균 &lt; 순자산 × 80% → max(가중평균, {fmt(detail.netAssetFloorValue)})
          </p>
        )}
        {detail.section1659Detail && (
          <div className="mt-1 rounded border border-sky-200 bg-sky-50/60 px-2 py-1.5 text-sky-700 not-italic space-y-0.5">
            <p className="font-semibold">§165⑨ 본체 — 양도·취득 기준시가 동일 → 소칙 §81④ 1호 월할 보정</p>
            <p>
              양도 기준시가 보정: {fmt(detail.section1659Detail.prior)} → {fmt(detail.section1659Detail.adjusted)}
            </p>
            <p>
              직전 사업연도 평가 {fmt(detail.section1659Detail.prior)} + (직전 {fmt(detail.section1659Detail.prior)} − 전전{" "}
              {fmt(detail.section1659Detail.prePrior)}) ×{" "}
              <Frac
                top={`${detail.section1659Detail.holdingMonths}개월`}
                bottom={`${detail.section1659Detail.priorBizYearMonths}개월`}
              />
            </p>
            <p>양도 기준시가가 상향되어 양도차익이 발생합니다 (취득 기준시가는 불변).</p>
          </div>
        )}
      </div>
      {result.swapComparison && (
        <SwapComparisonBlock result={result} />
      )}
    </div>
  );
}

// ── SwapComparisonBlock (B-2 §97②2호 단서) ──

export function SwapComparisonBlock({ result }: { result: StockTransferResult }) {
  const cmp = result.swapComparison;
  if (!cmp) return null;
  const applied = result.swapApplied === true;
  return (
    <div
      className={`mt-2 rounded-lg border px-4 py-3 space-y-1 text-xs ${
        applied
          ? "border-fuchsia-300 bg-fuchsia-50/70 text-fuchsia-800"
          : "border-slate-200 bg-slate-50/60 text-slate-600"
      }`}
    >
      <p className="font-semibold">
        {applied ? "§97②2호 단서 적용 — 실제 필요경비 선택" : "§97②2호 단서 비교 — 본문(개산공제) 적용"}
      </p>
      <div className="font-mono space-y-0.5">
        <p>가목 (환산취득가 + 개산공제) = {fmt(cmp.estimatedSide)}</p>
        <p>나목 (자본적지출 + 양도비) = {fmt(cmp.directSide)}</p>
      </div>
      {applied ? (
        <p>
          나목이 더 크므로 실제 필요경비를 적용합니다. 양도차익 계산에서 환산취득가는 차감되지 않습니다 (양도차익 = 양도가액 − 실제 필요경비).
        </p>
      ) : (
        <p>가목이 나목 이상이므로 환산취득가 + 개산공제를 필요경비로 적용합니다.</p>
      )}
    </div>
  );
}

// ── ProgressiveTaxBreakdown ──

/**
 * 누진세율 산식 분해 — **실제 적용된 세율·누진공제**로 만든다.
 *
 * 🔴 종전에는 대주주 20/25% 표(§104①11 가목2)를 **하드코딩**했다. 렌더 게이트가
 *    `progressiveDeduction > 0` 하나뿐이라 기타자산 §55 8단계(§104①1호)와
 *    §104①9호 NBL(기본세율 +10%p)도 그대로 이 카드를 탔고, 그때마다
 *    ① 「3억 이하 20% + 3억 초과 25%」 구간 합이 실제 세액과 다르고
 *    ② 「과세표준 × 25% − 누진공제」 좌변이 우변과 맞지 않는 **항등식 2중 파괴**가 났다.
 *    else 분기는 누진공제 항 자체가 없어 대주주 3억 이하가 게이트에서 걸러지는 구조상
 *    **렌더되는 전량이 거짓**이었다.
 *
 * ⇒ 항상 `taxBase × appliedRate − progressiveDeduction = calculatedTax` 한 줄로 낸다.
 *   구간 분해는 **대주주 2단 표일 때만** 보여준다(그 표에서만 「3억」이 실재하는 경계다).
 *   형제 경로(`DetailedStatementHelpers.ts`·`StockFilingFormTableHelpers.ts`)는 이미
 *   `appliedRate`를 동적으로 읽고 있어, 종전에는 같은 화면 안에서 두 표시가 모순됐다.
 *
 * 근거: 소득세법 §55①(기본세율 8단계) · §104①1호(기타자산) · §104①9호(NBL 과다소유법인)
 *      · §104①11호 가목2)(대주주 20/25%)
 */
export function ProgressiveTaxBreakdown({ result }: { result: StockTransferResult }) {
  const taxBase = result.taxBase;
  const deduction = result.progressiveDeduction ?? 0;
  const ratePct = (result.appliedRate * 100).toFixed(result.appliedRate * 100 % 1 === 0 ? 0 : 1);

  /**
   * §104①11호 가목2)의 2단 표(3억 이하 20% / 초과 25%)인가.
   * 이 표에서만 「3억」이 실재하는 구간 경계다 — §55 8단계·NBL 표는 경계가 다르다.
   */
  const isMajorTwoTier =
    result.taxCategory === "listed_major" || result.taxCategory === "unlisted_major";
  const THRESHOLD = 300_000_000; // §104①11 가목2) — 3억
  const upperPart = isMajorTwoTier ? Math.max(0, taxBase - THRESHOLD) : 0;
  const lowerPart = Math.min(taxBase, THRESHOLD);

  const title = isMajorTwoTier
    ? "누진세율 산식 분해 (소득세법 §104①11호 가목2))"
    : "누진세율 산식 분해 (소득세법 §55① 기본세율 8단계)";

  return (
    <div className="rounded-xl border border-sky-200 bg-sky-50/60 px-5 py-4 space-y-2">
      <p className="font-semibold text-sky-800 text-sm">{title}</p>
      <div className="space-y-1 text-xs text-sky-700">
        {upperPart > 0 && (
          <>
            <p>3억 이하 분: {fmt(lowerPart)} × 20% = {fmt(Math.floor(lowerPart * 0.2))}</p>
            <p>3억 초과 분: {fmt(upperPart)} × 25% = {fmt(Math.floor(upperPart * 0.25))}</p>
          </>
        )}
        <p>
          산출세액: 과세표준 {fmt(taxBase)} × {ratePct}%
          {deduction > 0 && <> − 누진공제 {fmt(deduction)}</>} ={" "}
          <strong>{fmt(result.calculatedTax)}</strong>
        </p>
      </div>
    </div>
  );
}

// ── RuleBadges ──

const RULE_BADGE: Record<string, string> = {
  "국외주식§118②준용": "bg-sky-100 text-sky-700 border-sky-200",
  "§94②우선": "bg-rose-100 text-rose-700 border-rose-200",
  "80%하한": "bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200",
  "80%하한미적용": "bg-fuchsia-50 text-fuchsia-600 border-fuchsia-200",
  "단기30%": "bg-rose-100 text-rose-700 border-rose-200",
  "거래정지우회": "bg-amber-100 text-amber-700 border-amber-200",
  "취득일거래정지우회": "bg-amber-100 text-amber-700 border-amber-200",
  "§97②단서swap": "bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200",
  "KOTC중소중견비과세": "bg-emerald-100 text-emerald-700 border-emerald-200",
  "KOTC벤처비과세": "bg-emerald-100 text-emerald-700 border-emerald-200",
  "월할가산": "bg-sky-100 text-sky-700 border-sky-200",
  "의제취득일적용": "bg-amber-100 text-amber-700 border-amber-200",
  "장부분실액면가": "bg-amber-100 text-amber-700 border-amber-200",
  "기타자산우선§55누진": "bg-sky-100 text-sky-700 border-sky-200",
  "기본공제부동산그룹합산": "bg-sky-100 text-sky-700 border-sky-200",
  "로트개별법": "bg-violet-100 text-violet-700 border-violet-200",
  "로트선입선출": "bg-violet-100 text-violet-700 border-violet-200",
  "로트이동평균": "bg-violet-100 text-violet-700 border-violet-200",
};

// ── RuleBadges → legalBasis 매핑 (UI 레이어, 엔진 무변경) ──
// 기존 RULE_BADGE(tone)와 별개. appliedRules 20종 전수(Record 강제 — 누락 시 컴파일 에러).
// 대주주 판정 세부 3종(F15F16·판정기준일·본인미보유)은 §157/§167의8 세부 항 모호 → 링크 보류("", tone 배지만).
const RULE_BADGE_LAW_MAP: Record<
  NonNullable<StockTransferResult["appliedRules"]>[number],
  string
> = {
  "국외주식§118②준용": "소득세법 §118②1호",
  "§94②우선": "소득세법 §94②",
  "80%하한": "소득세법 시행령 §165④1",
  "80%하한미적용": "소득세법 시행령 §165④1",
  "단기30%": "소득세법 §104①11",
  "거래정지우회": "소득세법 시행령 §165③",
  "취득일거래정지우회": "소득세법 시행령 §165③",
  "§97②단서swap": "소득세법 §97②",
  "KOTC중소중견비과세": "소득세법 §94①3 나목 단서",
  "KOTC벤처비과세": "조세특례제한법 §14①7호",
  "월할가산": "소득세법 시행규칙 §81④",
  "의제취득일적용": "소득세법 시행령 §162⑦3호",
  "장부분실액면가": "소득세법 §99①4",
  "기타자산우선§55누진": "소득세법 §55①",
  "기본공제부동산그룹합산": "소득세법 §103①1호",
  "로트개별법": "소득세법 시행령 §162⑤",
  "로트선입선출": "소득세법 시행령 §162⑤",
  "로트이동평균": "소득세법 시행령 §162⑤",
  "F15F16대차사모펀드자동가산": "",
  "판정기준일특수분기": "",
  "본인미보유강제합산": "",
};

export function RuleBadges({ appliedRules }: { appliedRules: StockTransferResult["appliedRules"] }) {
  if (!appliedRules || appliedRules.length === 0) return null;
  const badgeCls = "px-2 py-0.5 rounded border text-xs font-medium";
  return (
    <div className="flex flex-wrap gap-2">
      {appliedRules.map((rule) => {
        const tone = RULE_BADGE[rule] ?? "bg-slate-100 text-slate-600 border-slate-200";
        const legalBasis = RULE_BADGE_LAW_MAP[rule];
        return legalBasis ? (
          <LawArticleModal key={rule} legalBasis={legalBasis} label={rule} className={`${badgeCls} ${tone}`} />
        ) : (
          <span key={rule} className={`${badgeCls} ${tone}`}>
            {rule}
          </span>
        );
      })}
    </div>
  );
}

// ── Warnings ──

export function Warnings({ warnings }: { warnings: string[] }) {
  if (!warnings || warnings.length === 0) return null;
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-4 py-3 space-y-1">
      {warnings.map((w, i) => (
        <p key={i} className="text-xs text-amber-700">⚠ {w}</p>
      ))}
    </div>
  );
}

// ── UnsupportedItemsCard ──

/**
 * 「현재 미지원 항목」 고지 — 종전 `PrRoadmapCard`(개발용 PR 로드맵) 대체.
 *
 * ## 왜 로드맵을 없앴는가
 *
 * 종전 카드의 「PR-3 현재 / 후속 대기」는 **구현 현황과 아무 연결이 없는 하드코딩**이었다.
 * PR-3 본체(다자산·가산세·신고서)와 후속 3축(§97의2·국외전출세·해외주식)이 전부 머지된
 * 뒤에도 화면은 「PR-3 진행 중」이라고 말하고 있었다. 애초에 **내부 PR 번호는 사용자에게
 * 의미가 없다** — 사용자가 알아야 할 것은 「이 계산기가 지금 무엇을 못 하는가」다.
 *
 * ## 규율
 *
 * · 항목은 **실측 근거가 있는 것만** 적는다(「아마 안 될 것」 금지).
 * · 항목이 해소되면 **같은 PR 에서 이 문구를 지운다** — 안 그러면 이 카드가 다음 stale 표시가 된다.
 */
export function UnsupportedItemsCard() {
  const items: { title: string; detail: string }[] = [
    {
      title: "증권거래세 — 2021-01-01 이전 양도",
      detail:
        "당시 세율표를 지원하지 않아 현행 세율로 표시합니다. 양도소득세 계산에는 영향이 없습니다(증권거래세는 정보성 표시입니다).",
    },
    {
      title: "국외전출세 — 기준환율",
      detail: "한국은행 고시 기준환율을 자동으로 가져오지 않습니다. 직접 입력해야 합니다.",
    },
    {
      title: "국외전출자 보유현황 신고서",
      detail: "세액 계산만 제공하며 신고서 서식은 자동 생성되지 않습니다.",
    },
    {
      title: "가산세 — 국외 종목만으로 이루어진 신고",
      detail:
        "국내 종목이 하나도 없는 신고에서는 가산세가 계산되지 않습니다. 국내 종목이 하나라도 있으면 국외 소득분까지 함께 산정됩니다.",
    },
  ];

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-5 py-4">
      <p className="mb-2 text-sm font-semibold text-slate-800">현재 지원하지 않는 항목</p>
      <ul className="space-y-2">
        {items.map((it) => (
          <li key={it.title} className="text-xs leading-relaxed">
            <span className="font-semibold text-slate-700">{it.title}</span>
            <span className="block text-slate-600">{it.detail}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
