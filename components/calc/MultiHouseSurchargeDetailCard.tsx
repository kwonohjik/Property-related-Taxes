/**
 * 다주택 중과세 상세 판정 결과 카드
 *
 * TransferTaxResult.multiHouseSurchargeDetail 데이터를 시각화.
 * - 유효 주택 수 / 원시 주택 수
 * - 산정 제외 주택 목록 (배제 이유)
 * - 중과 배제 사유
 * - 경고 메시지
 */

import { cn } from "@/lib/utils";
import type { ExcludedHouse, ExclusionReason } from "@/lib/tax-engine/multi-house-surcharge";

interface MultiHouseSurchargeDetail {
  effectiveHouseCount: number;
  rawHouseCount: number;
  excludedHouses: ExcludedHouse[];
  exclusionReasons: ExclusionReason[];
  isRegulatedAtTransfer: boolean;
  warnings: string[];
  excludedPresaleRights?: Array<{ id: string; reason: string }>;
  /** 부칙 §9270호 §14① — 취득기간(2009.3.16~2012.12.31) 세율 중과배제(장특 배제는 유지) */
  rateSurchargeStatutoryExcluded?: boolean;
}

interface Props {
  detail: MultiHouseSurchargeDetail;
}

// 제외 사유 레이블 매핑
const EXCLUDED_REASON_LABEL: Record<string, string> = {
  inherited_5years: "상속주택 (5년 이내)",
  co_inherited_minor_share: "공동상속주택 소수지분 (§167의3②2호)",
  long_term_rental: "장기임대 등록주택",
  low_price_non_capital: "지방 저가주택",
  low_price_local_300: "지방 공시가 3억 이하",
  unsold_housing: "미분양주택",
  officetel_pre2022: "2022년 이전 취득 오피스텔",
  small_new_house: "소형 신축·미분양 특례",
  population_decline_second_home: "인구감소지역 세컨드홈 특례",
  spouse_marriage_subtraction: "혼인합가 배우자 주택 차감 (3주택·§167의3⑨)",
};

// 배제 사유 레이블 매핑
const EXCLUSION_REASON_LABEL: Record<string, string> = {
  temporary_two_house: "일시적 2주택 특례",
  rural_house: "농어촌주택 1세대1주택 의제 (§155⑦)",
  marriage_merge: "혼인합가 1세대1주택 의제 (2주택·10년)",
  parental_care_merge: "동거봉양 합가 특례 (10년 이내)",
  pre_designation_contract: "조정대상지역 공고일 이전 매매계약",
  only_one_remaining: "배제 후 유일한 1주택",
  mortgage_execution_3years: "저당권 실행 3년 이내",
  employee_housing_10years: "사원용 주택 10년 이상",
  tax_special_exemption: "조특법 특례",
  cultural_heritage: "문화재 주택",
  daycare_center_5years: "어린이집 5년 이상",
  tax_incentive_rental: "조특법 감면 임대주택",
  small_new_house: "소형 신축·미분양 중과배제",
  unavoidable_reason_two_house: "2주택 부득이한 사유 (취학·근무·질병)",
  unavoidable_outside_capital: "수도권 밖 부득이한 사유 주택 (§155⑧)",
  low_price_two_house: "2주택 기준시가 1억 이하 소형",
  litigation_housing_two_house: "2주택 소송 취득·진행 중 주택",
};

export function MultiHouseSurchargeDetailCard({ detail }: Props) {
  const surchargeTypeLabel =
    detail.effectiveHouseCount >= 3
      ? "3주택+"
      : detail.effectiveHouseCount === 2
        ? "2주택"
        : "해당없음";

  return (
    <div className="rounded-lg border border-border overflow-hidden text-sm">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 py-3 bg-muted/30 border-b border-border">
        <p className="font-semibold">다주택 중과세 판정 상세</p>
        <span
          className={cn(
            "px-2 py-0.5 rounded-full text-xs font-medium",
            detail.effectiveHouseCount >= 2
              ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-400"
              : "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-400",
          )}
        >
          {surchargeTypeLabel}
        </span>
      </div>

      {/* 부칙 §9270호 §14① — 취득기간 세율 중과배제 */}
      {detail.rateSurchargeStatutoryExcluded && (
        <div className="px-4 py-2 bg-blue-50 dark:bg-blue-900/20 border-b border-border text-xs text-blue-800 dark:text-blue-300 leading-snug">
          양도주택 취득일이 2009.3.16~2012.12.31 — 다주택 <strong>중과세율 배제(기본세율)</strong> 적용(부칙 §9270호 §14①·기재부 재산세제과-1422). 단, 장기보유특별공제는 조정대상지역 다주택 기준으로 <strong>별도 배제</strong>됩니다(서울행정법원 2024구단72950).
        </div>
      )}

      {/* 주택 수 요약 */}
      <div className="grid grid-cols-2 divide-x divide-border border-b border-border">
        <div className="px-4 py-3 text-center">
          <p className="text-xs text-muted-foreground mb-1">전체 보유 주택 수</p>
          <p className="text-2xl font-bold">{detail.rawHouseCount}<span className="text-base font-normal">채</span></p>
        </div>
        <div className="px-4 py-3 text-center">
          <p className="text-xs text-muted-foreground mb-1">중과 산정 주택 수</p>
          <p className={cn("text-2xl font-bold", detail.effectiveHouseCount >= 2 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400")}>
            {detail.effectiveHouseCount}<span className="text-base font-normal">채</span>
          </p>
        </div>
      </div>

      {/* 제외 주택 목록 */}
      {detail.excludedHouses.length > 0 && (
        <div className="px-4 py-3 border-b border-border">
          <p className="text-xs font-medium text-muted-foreground mb-2">산정 제외 주택 ({detail.excludedHouses.length}채)</p>
          <div className="space-y-1">
            {detail.excludedHouses.map((h) => (
              <div key={h.houseId} className="flex items-start gap-2">
                <span className="mt-0.5 shrink-0 text-muted-foreground">–</span>
                <div>
                  <span className="text-xs text-muted-foreground">주택 {h.houseId.replace("selling", "양도 주택")} </span>
                  <span className="inline-block text-caption bg-muted/60 rounded px-1.5 py-0.5 font-medium">
                    {EXCLUDED_REASON_LABEL[h.reason] ?? h.reason}
                  </span>
                  <p className="text-xs text-muted-foreground/80 mt-0.5">{h.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* #2b 제외 분양권·입주권 (혼인 §167의4⑤ 배우자 차감) */}
      {(detail.excludedPresaleRights?.length ?? 0) > 0 && (
        <div className="px-4 py-3 border-b border-border">
          <p className="text-xs font-medium text-muted-foreground mb-2">
            산정 제외 분양권·입주권 ({detail.excludedPresaleRights!.length}건)
          </p>
          <div className="space-y-1">
            {detail.excludedPresaleRights!.map((p) => (
              <div key={p.id} className="flex items-start gap-2">
                <span className="mt-0.5 shrink-0 text-muted-foreground">–</span>
                <span className="inline-block text-caption bg-muted/60 rounded px-1.5 py-0.5 font-medium">
                  혼인합가 배우자 보유 차감 (§167의4⑤)
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 중과 배제 사유 */}
      {detail.exclusionReasons.length > 0 && (
        <div className="px-4 py-3 border-b border-border">
          <p className="text-xs font-medium text-muted-foreground mb-2">중과 배제 사유</p>
          <div className="space-y-1">
            {detail.exclusionReasons.map((r, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="mt-0.5 text-emerald-600 dark:text-emerald-400 shrink-0">✓</span>
                <div>
                  <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                    {EXCLUSION_REASON_LABEL[r.type] ?? r.type}
                  </span>
                  <p className="text-xs text-muted-foreground/80 mt-0.5">{r.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 경고 */}
      {detail.warnings.length > 0 && (
        <div className="px-4 py-3 bg-amber-50/60 dark:bg-amber-950/20">
          <div className="space-y-1">
            {detail.warnings.map((w, i) => (
              <p key={i} className="text-xs text-amber-700 dark:text-amber-400">⚠️ {w}</p>
            ))}
          </div>
        </div>
      )}

      {/* 조정대상지역 표시 */}
      <div className="px-4 py-2 bg-muted/20 text-xs text-muted-foreground">
        양도일 기준 조정대상지역: {detail.isRegulatedAtTransfer ? "해당" : "미해당"}
        {" — "}소득세법 §104 ②
      </div>
    </div>
  );
}
