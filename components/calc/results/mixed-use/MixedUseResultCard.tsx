"use client";

/**
 * 검용주택 분리계산 결과 카드 (4-카드 + 합산)
 *
 * 학습·검증 목적: 양도가액 안분 → 주택부분 → 상가부분 → 비사업용토지 → 합산세액
 * 각 항목 하단에 계산 과정(산식)을 한국어로 표기.
 */

import type { MixedUseGainBreakdown } from "@/lib/tax-engine/types/transfer-mixed-use.types";

// 결과 데이터에 신규 필드가 누락된 캐시 케이스를 안전하게 처리하기 위해 nullish 가드.
const fmt = (n: number | undefined | null) => (n ?? 0).toLocaleString() + "원";
const fmtPlain = (n: number | undefined | null) => (n ?? 0).toLocaleString();
const fmtPct = (r: number | undefined | null) => `${((r ?? 0) * 100).toFixed(2)}%`;
const fmtSqm = (n: number | undefined | null) => `${(n ?? 0).toFixed(2)} ㎡`;

interface Props {
  breakdown: MixedUseGainBreakdown;
}

export function MixedUseResultCard({ breakdown }: Props) {
  if (breakdown.splitMode === "pre-2022-rejected") {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        <p className="font-semibold mb-1">검용주택 분리계산 불가</p>
        {breakdown.warnings.map((w, i) => (
          <p key={i}>{w}</p>
        ))}
      </div>
    );
  }

  const { apportionment: a, housingPart: h, commercialPart: c, nonBusinessLandPart: nb, total: t } = breakdown;
  const totalTransfer = a.housingTransferPrice + a.commercialTransferPrice;

  return (
    <div className="space-y-4">
      {/* 경고 */}
      {breakdown.warnings.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 space-y-1">
          {breakdown.warnings.map((w, i) => <p key={i}>⚠ {w}</p>)}
        </div>
      )}

      {/* 1. 양도가액 안분 */}
      <ResultSection title="① 양도가액 안분" basis="소득세법 §99 + 시행령 §164">
        <Row
          label="양도시 개별주택공시가격"
          value={fmt(a.housingStandardPrice)}
          formula="입력값 — 주택건물+주택부수토지 일괄"
        />
        <Row
          label="양도시 상가부분 기준시가 합계"
          value={fmt(a.commercialStandardPrice)}
          formula="(공시지가/㎡ × 상가부수토지 면적) + 상가건물 기준시가"
        />
        <DivRow />
        <Row
          label={`주택비율`}
          value={fmtPct(a.housingRatio)}
          formula={`${fmtPlain(a.housingStandardPrice)} ÷ (${fmtPlain(a.housingStandardPrice)} + ${fmtPlain(a.commercialStandardPrice)})`}
        />
        <Row
          label="주택 양도가액"
          value={fmt(a.housingTransferPrice)}
          highlight
          formula={`${fmtPlain(totalTransfer)} × ${fmtPct(a.housingRatio)} → 내림`}
        />
        <Row
          label="상가 양도가액"
          value={fmt(a.commercialTransferPrice)}
          highlight
          formula={`총 양도가액 - 주택 양도가액 = ${fmtPlain(totalTransfer)} - ${fmtPlain(a.housingTransferPrice)}`}
        />
      </ResultSection>

      {/* 2. 주택부분 */}
      <ResultSection title="② 주택부분" basis="소득세법 §89 ① 3호 단서 + §95 ②">
        <Row
          label="주택 환산취득가액"
          value={fmt(h.estimatedAcquisitionPrice)}
          formula={
            h.phdEstimatedAcqHousingPrice
              ? `§164⑤ 3-시점 환산: 주택 양도가액 × (PHD 환산 취득시 주택가격 ${fmtPlain(h.phdEstimatedAcqHousingPrice)} ÷ 양도시 개별주택공시가격)`
              : `§97: 주택 양도가액 × (취득시 개별주택공시가격 ÷ 양도시 개별주택공시가격)`
          }
        />
        <Row
          label="주택 양도차익"
          value={fmt(h.transferGain)}
          formula="(양도가액 - 환산취득가액 - 개산공제) — 토지/건물 분리 후 합산"
        />
        <Row
          label="  ▸ 토지분"
          value={fmt(h.landTransferGain)}
          small
          formula={`${fmtPlain(h.landTransferPrice)} - ${fmtPlain(h.landAcqPrice)} - ${fmtPlain(h.landAppraisalDed)} (양도가액 - 환산취득가액 - 개산공제 3%)`}
        />
        <Row
          label="  ▸ 건물분"
          value={fmt(h.buildingTransferGain)}
          small
          formula={`${fmtPlain(h.buildingTransferPrice)} - ${fmtPlain(h.buildingAcqPrice)} - ${fmtPlain(h.buildingAppraisalDed)} (양도가액 - 환산취득가액 - 개산공제 3%)`}
        />
        <DivRow />
        {h.isExempt ? (
          <Row label="12억 이하 → 전액 비과세" value="0원" />
        ) : (
          <Row
            label="12억 초과 안분 후 과세대상 양도차익"
            value={fmt(h.proratedTaxableGain)}
            formula={`주택 양도차익 × ((주택 양도가액 - 12억) ÷ 주택 양도가액) — 비사업용 이전분 제외`}
          />
        )}
        <Row
          label={`장기보유공제 (표${h.longTermDeductionTable}, ${fmtPct(h.longTermDeductionRate)})`}
          value={`△ ${fmt(h.longTermDeductionAmount)}`}
          formula={
            h.longTermDeductionTable === 2
              ? "보유연수×4% + 거주연수×4% (최대 80%)"
              : "보유연수×2% (최대 30%)"
          }
        />
        <DivRow />
        <Row
          label="주택부분 양도소득금액"
          value={fmt(h.incomeAmount)}
          highlight
          formula="과세대상 양도차익 - 장기보유공제"
        />
        {h.nonBusinessTransferRatio > 0 && (
          <Row
            label={`비사업용 이전 (${fmtPct(h.nonBusinessTransferRatio)})`}
            value={`→ ${fmt(h.nonBusinessTransferredGain)}`}
            small
            formula="주택 토지분 양도차익 중 부수토지 배율초과 면적 비율만큼 ④로 이전"
          />
        )}
      </ResultSection>

      {/* 3. 상가부분 */}
      <ResultSection title="③ 상가부분" basis="소득세법 §95 ② 표1">
        <Row
          label="상가 환산취득가액"
          value={fmt(c.estimatedAcquisitionPrice)}
          formula="상가 양도가액 × (취득시 상가부분 기준시가 ÷ 양도시 상가부분 기준시가) — §97"
        />
        <Row
          label="상가 양도차익"
          value={fmt(c.transferGain)}
          formula="(양도가액 - 환산취득가액 - 개산공제) — 토지/건물 분리 후 합산"
        />
        <Row
          label="  ▸ 토지분"
          value={fmt(c.landTransferGain)}
          small
          formula={`${fmtPlain(c.landTransferPrice)} - ${fmtPlain(c.landAcqPrice)} - ${fmtPlain(c.landAppraisalDed)} (양도가액 - 환산취득가액 - 개산공제 3%)`}
        />
        <Row
          label="  ▸ 건물분"
          value={fmt(c.buildingTransferGain)}
          small
          formula={`${fmtPlain(c.buildingTransferPrice)} - ${fmtPlain(c.buildingAcqPrice)} - ${fmtPlain(c.buildingAppraisalDed)} (양도가액 - 환산취득가액 - 개산공제 3%)`}
        />
        <DivRow />
        <Row
          label={`장기보유공제 (표1, ${fmtPct(c.longTermDeductionRate)})`}
          value={`△ ${fmt(c.longTermDeductionAmount)}`}
          formula="보유연수×2% (최대 30%) — 토지/건물 별 보유연수 적용"
        />
        <DivRow />
        <Row
          label="상가부분 양도소득금액"
          value={fmt(c.incomeAmount)}
          highlight
          formula="양도차익 - 장기보유공제"
        />
      </ResultSection>

      {/* 4. 비사업용토지 (조건부) */}
      {nb && (
        <ResultSection title="④ 비사업용토지 (주택부수토지 배율초과)" basis="시행령 §168의12 + §104의3">
          <Row
            label={`적용 배율`}
            value={`${nb.appliedMultiplier}배`}
            formula="수도권 주거지역 3배 / 녹지·외곽 5배 / 도시 외 10배"
          />
          <Row
            label="배율초과 면적"
            value={fmtSqm(nb.excessArea)}
            formula="주택부수토지 면적 - (주택 정착면적 × 배율)"
          />
          <Row
            label="비사업용 양도차익"
            value={fmt(nb.transferGain)}
            formula="주택 토지분 양도차익 × (배율초과 면적 ÷ 주택부수토지 면적)"
          />
          <Row
            label={`장기보유공제 (표1, ${fmtPct(nb.longTermDeductionRate)})`}
            value={`△ ${fmt(nb.longTermDeductionAmount)}`}
            formula="토지 보유연수×2% (최대 30%)"
          />
          <DivRow />
          <Row
            label="비사업용토지 양도소득금액 (+10%p 가산)"
            value={fmt(nb.incomeAmount)}
            highlight
            formula="양도차익 - 장기보유공제 (세율 가산은 합산세액에서 처리)"
          />
        </ResultSection>
      )}

      {/* 합산 세액 */}
      <ResultSection title="합산 세액" basis="소득세법 §92~§107">
        <Row
          label="합산 양도소득금액"
          value={fmt(t.aggregateIncome)}
          formula="주택부분 + 상가부분 + 비사업용토지 양도소득금액"
        />
        <Row
          label="기본공제"
          value={`△ ${fmt(t.basicDeduction)}`}
          formula="연 250만원 (소득세법 §103)"
        />
        <Row
          label="과세표준"
          value={fmt(t.taxBase)}
          formula="합산 양도소득금액 - 기본공제"
        />
        <DivRow />
        <Row
          label="산출세액 (기본세율)"
          value={fmt(t.taxByBasicRate)}
          formula="과세표준 × 누진세율 (6%~45% 8구간) — 소득세법 §104"
        />
        {t.nonBusinessSurcharge > 0 && (
          <Row
            label="비사업용토지 +10%p 가산세"
            value={fmt(t.nonBusinessSurcharge)}
            formula="비사업용토지 양도소득금액 × 10%"
          />
        )}
        <Row
          label="양도소득세"
          value={fmt(t.transferTax)}
          formula="산출세액 + 비사업용토지 가산세"
        />
        <Row
          label="지방소득세 (10%)"
          value={fmt(t.localTax)}
          formula="양도소득세 × 10% (지방세법 §103의3)"
        />
        <DivRow />
        <Row
          label="총 납부세액"
          value={fmt(t.totalPayable)}
          highlight
          large
          formula="양도소득세 + 지방소득세"
        />
      </ResultSection>

      {/* 계산 경로 메타 (학습·검증용) */}
      <CalculationRouteCard route={breakdown.calculationRoute} />
    </div>
  );
}

// ── 계산 경로 메타 카드 (학습·검증용 — "왜 이 세액인지" 설명) ──

const ACQ_SOURCE_LABEL: Record<string, string> = {
  direct_input: "직접 입력",
  phd_auto: "PHD 3-시점 자동산정",
  missing: "미입력 (환산 불가)",
};

const CONVERSION_ROUTE_LABEL: Record<string, string> = {
  section97_direct: "§97 직접 환산 (양도가액 × 취득시 기준시가 / 양도시 기준시가)",
  phd_corrected: "PHD 보정 후 §97 환산 (1992~2005 미공시 케이스)",
};

const HIGH_VALUE_LABEL: Record<string, string> = {
  below_threshold_exempt: "주택 양도가액 ≤ 12억 → 전액 비과세",
  above_threshold_prorated: "주택 양도가액 > 12억 → 안분 과세 (§89 ① 3호 단서)",
};

function CalculationRouteCard({
  route,
}: {
  route: import("@/lib/tax-engine/types/transfer-mixed-use.types").MixedUseCalculationRoute;
}) {
  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-4 space-y-2">
      <div className="flex items-start justify-between mb-1">
        <h4 className="font-semibold text-sm text-blue-900">계산 경로 (학습·검증용)</h4>
        <span className="text-[10px] text-blue-700">&quot;왜 이 세액인지&quot; 설명</span>
      </div>
      <MetaRow label="취득시 주택공시가격" value={ACQ_SOURCE_LABEL[route.housingAcqPriceSource]} />
      <MetaRow label="환산취득가액 경로" value={CONVERSION_ROUTE_LABEL[route.acquisitionConversionRoute]} />
      <MetaRow label="12억 비과세 적용" value={HIGH_VALUE_LABEL[route.highValueRule]} />
      <MetaRow label="주택 장기보유공제" value={route.housingDeductionTableReason} />
      <MetaRow label="부수토지 배율" value={route.landMultiplierReason} />
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-start gap-2 text-xs">
      <span className="text-blue-800 font-medium whitespace-nowrap">{label}</span>
      <span className="text-blue-900 text-right">{value}</span>
    </div>
  );
}

// ── 공용 서브 컴포넌트 ──

function ResultSection({
  title,
  basis,
  children,
}: {
  title: string;
  basis: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-card p-4 space-y-2">
      <div className="flex items-start justify-between mb-2">
        <h4 className="font-semibold text-sm">{title}</h4>
        <span className="text-[10px] text-muted-foreground text-right max-w-[140px]">{basis}</span>
      </div>
      {children}
    </div>
  );
}

function Row({
  label,
  value,
  highlight,
  large,
  small,
  formula,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  large?: boolean;
  small?: boolean;
  formula?: string;
}) {
  return (
    <div className="space-y-0.5">
      <div className={`flex justify-between items-center ${small ? "text-xs text-muted-foreground" : "text-sm"}`}>
        <span className={highlight ? "font-medium" : ""}>{label}</span>
        <span className={`font-mono ${highlight ? "font-semibold text-primary" : ""} ${large ? "text-base" : ""}`}>
          {value}
        </span>
      </div>
      {formula && (
        <p className="text-[11px] text-muted-foreground/80 leading-snug pl-2 border-l-2 border-muted">
          {formula}
        </p>
      )}
    </div>
  );
}

function DivRow() {
  return <div className="border-t my-1" />;
}
