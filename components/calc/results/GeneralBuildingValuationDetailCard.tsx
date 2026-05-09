"use client";

/**
 * GeneralBuildingValuationDetailCard
 *
 * 일반건물(토지+건물 일괄) 환산취득가 산정 근거 + 자산별 통산 결과 카드.
 * result.generalBuildingValuationDetail 이 있을 때만 렌더.
 *
 * 산식 표기 규칙 (강제):
 *  - 변수 약어(P_F, Sum_A) 금지 → 한국어 풀어쓰기
 *  - 숫자 옆 변수명 라벨 표시 (양도가액 xxx - 환산취득가 yyy)
 *  - "원" 단위 표기 금지 (feedback_no_won_suffix.md)
 *  - floor() / Math.floor() 표기 금지 — 묵시 처리
 *  - 개산공제 = 취득시 기준시가 × 3% (취득가액 합산 금지)
 *  - 건물 차손 → 장특 0 명시
 *  - §102② 통산 표 (차손 → 토지 흡수)
 */

import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import type { GeneralBuildingOutput } from "@/lib/tax-engine/general-building-valuation";

interface Props {
  detail: GeneralBuildingOutput;
  totalTransferPrice: number;
  holdingYears?: number;
  holdingMonths?: number;
  /** 토지 장특공제율 */
  lthdRateLand?: number;
  /** 토지 장특공제액 */
  lthdLand?: number;
  /** 건물 장특공제액 (차손 시 0) */
  lthdBuilding?: number;
  /** 토지 양도소득금액 (통산 전) */
  incomeLandPreOffset?: number;
  /** 건물 양도소득금액 (통산 전, 차손 시 음수) */
  incomeBuildingPreOffset?: number;
  /** §102② 흡수액 */
  offsetAmount?: number;
  /** 토지 양도소득금액 (통산 후) */
  incomeLandPostOffset?: number;
  /** 합계 양도소득금액 */
  totalIncome?: number;
}

function SectionTitle({ number, text, tone }: { number: string; text: string; tone: "emerald" | "amber" | "sky" | "violet" }) {
  const toneClass = {
    emerald: "bg-emerald-200 text-emerald-800 border-emerald-300 text-emerald-700",
    amber:   "bg-amber-200 text-amber-800 border-amber-300 text-amber-700",
    sky:     "bg-sky-200 text-sky-800 border-sky-300 text-sky-700",
    violet:  "bg-violet-200 text-violet-800 border-violet-300 text-violet-700",
  }[tone];
  const bgClass = {
    emerald: "bg-emerald-50/40 border-emerald-200",
    amber:   "bg-amber-50/40 border-amber-200",
    sky:     "bg-sky-50/40 border-sky-200",
    violet:  "bg-violet-50/40 border-violet-200",
  }[tone];
  const textClass = {
    emerald: "text-emerald-700",
    amber:   "text-amber-700",
    sky:     "text-sky-700",
    violet:  "text-violet-700",
  }[tone];
  return (
    <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${bgClass}`}>
      <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold select-none ${toneClass.split(" ").slice(0, 2).join(" ")}`}>
        {number}
      </span>
      <p className={`text-xs font-semibold ${textClass}`}>{text}</p>
    </div>
  );
}

function TableRow({ label, land, building, total, highlight = false, sub = false }: {
  label: string;
  land?: number | string | null;
  building?: number | string | null;
  total?: number | string | null;
  highlight?: boolean;
  sub?: boolean;
}) {
  const fmt = (v: number | string | null | undefined) => {
    if (v === null || v === undefined) return "—";
    if (typeof v === "number") return formatKRW(v);
    return v;
  };
  return (
    <tr className={highlight ? "bg-muted/40 font-semibold" : ""}>
      <td className={`py-1 pr-3 text-xs ${sub ? "pl-4 text-muted-foreground" : "font-medium"}`}>{label}</td>
      <td className="py-1 text-right text-xs tabular-nums">{fmt(land)}</td>
      <td className="py-1 text-right text-xs tabular-nums">{fmt(building)}</td>
      <td className="py-1 text-right text-xs tabular-nums">{fmt(total)}</td>
    </tr>
  );
}

function Divider() {
  return <tr><td colSpan={4} className="py-0"><div className="border-t border-border/60" /></td></tr>;
}

export function GeneralBuildingValuationDetailCard({
  detail,
  totalTransferPrice,
  holdingYears,
  holdingMonths,
  lthdRateLand,
  lthdLand,
  lthdBuilding,
  incomeLandPreOffset,
  incomeBuildingPreOffset,
  offsetAmount,
  incomeLandPostOffset,
  totalIncome,
}: Props) {
  const { allocation, acquisition, estimatedDeduction } = detail;

  // 양도시 기준시가 합계 (안분 분모)
  // transferLandStd는 엔진이 safeMultiplyThenDivide로 계산 — UI에서는 표시용만
  // GeneralBuildingOutput에 입력값이 없으므로 assetCards에서 역산 불가 → 별도 prop 불필요
  // 결과 카드에서 분모/분자 표시는 가용 정보로 최선 표시

  // 차익 계산 (양도가 - 환산취득가 - 개산공제)
  const gainLand = allocation.land - acquisition.land - estimatedDeduction.land;
  const gainBuilding = allocation.building - acquisition.building - estimatedDeduction.building;
  const gainTotal = gainLand + gainBuilding;

  // 보유기간 텍스트
  const holdingText = holdingYears !== undefined && holdingMonths !== undefined
    ? `만 ${holdingYears}년 ${holdingMonths}개월 → 1년 미만 절사 → 만 ${holdingYears}년`
    : null;

  const lthdRatePct = lthdRateLand !== undefined ? `${Math.round(lthdRateLand * 100)}%` : null;

  // 장특공제액 (없으면 양도차익 × 율 추정)
  const lthdLandValue = lthdLand ?? (lthdRateLand !== undefined && gainLand > 0 ? Math.floor(gainLand * lthdRateLand) : undefined);
  const lthdBuildingValue = lthdBuilding ?? (gainBuilding < 0 ? 0 : undefined);

  // 양도소득금액 표시값
  const incomeLandPre = incomeLandPreOffset ?? (lthdLandValue !== undefined ? gainLand - lthdLandValue : undefined);
  const incomeBuildingPre = incomeBuildingPreOffset ?? gainBuilding;
  const offset = offsetAmount ?? (incomeBuildingPre !== undefined && incomeBuildingPre < 0 ? Math.abs(incomeBuildingPre) : undefined);
  const incomeLandPost = incomeLandPostOffset ?? (incomeLandPre !== undefined && offset !== undefined ? incomeLandPre - offset : undefined);
  const incomeTotal = totalIncome ?? incomeLandPost;

  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50/20 p-4 space-y-4">
      <h3 className="text-sm font-bold text-violet-900">
        일반건물(토지+건물 일괄) 환산취득가 산정 근거
        <span className="ml-2 text-[10px] font-normal text-violet-500">
          (소득세법 시행령 §176의2④ · §163⑥ · §102②)
        </span>
      </h3>

      {/* ① 양도가액 안분 */}
      <div className="space-y-2">
        <SectionTitle number="①" text="양도가액 안분 (양도시 기준시가 비율 — 시행령 §166⑥)" tone="emerald" />
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/60">
                <th className="py-1 pr-3 text-left font-medium text-muted-foreground">구분</th>
                <th className="py-1 text-right font-medium text-muted-foreground">토지</th>
                <th className="py-1 text-right font-medium text-muted-foreground">건물</th>
                <th className="py-1 text-right font-medium text-muted-foreground">합계</th>
              </tr>
            </thead>
            <tbody>
              <TableRow
                label="양도가액 안분"
                land={allocation.land}
                building={allocation.building}
                total={totalTransferPrice}
                highlight
              />
            </tbody>
          </table>
        </div>
        <div className="rounded bg-emerald-50/60 border border-emerald-200 px-3 py-2 text-xs text-emerald-800 space-y-1">
          <p className="font-medium">산식</p>
          <p>토지 양도가액 = INT(총양도가 {formatKRW(totalTransferPrice)} × 토지 기준시가 / 합계 기준시가)</p>
          <p className="pl-2">= <span className="font-semibold tabular-nums">{formatKRW(allocation.land)}</span></p>
          <p>건물 양도가액 = 총양도가 {formatKRW(totalTransferPrice)} − 토지 양도가액 {formatKRW(allocation.land)}</p>
          <p className="pl-2">= <span className="font-semibold tabular-nums">{formatKRW(allocation.building)}</span> (잔액 보정)</p>
        </div>
      </div>

      {/* ② 환산취득가 */}
      <div className="space-y-2">
        <SectionTitle number="②" text="환산취득가 (시행령 §176의2④)" tone="amber" />
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/60">
                <th className="py-1 pr-3 text-left font-medium text-muted-foreground">구분</th>
                <th className="py-1 text-right font-medium text-muted-foreground">토지</th>
                <th className="py-1 text-right font-medium text-muted-foreground">건물</th>
                <th className="py-1 text-right font-medium text-muted-foreground">합계</th>
              </tr>
            </thead>
            <tbody>
              <TableRow
                label="환산취득가"
                land={acquisition.land}
                building={acquisition.building}
                total={acquisition.land + acquisition.building}
                highlight
              />
            </tbody>
          </table>
        </div>
        <div className="rounded bg-amber-50/60 border border-amber-200 px-3 py-2 text-xs text-amber-800 space-y-1">
          <p className="font-medium">산식</p>
          <p>토지 환산취득가 = INT(토지 양도가액 {formatKRW(allocation.land)} × 취득시 토지 기준시가 / 양도시 토지 기준시가)</p>
          <p className="pl-2">= <span className="font-semibold tabular-nums">{formatKRW(acquisition.land)}</span></p>
          <p>건물 환산취득가 = INT(건물 양도가액 {formatKRW(allocation.building)} × 취득시 건물기준시가 / 양도시 건물기준시가)</p>
          <p className="pl-2">= <span className="font-semibold tabular-nums">{formatKRW(acquisition.building)}</span></p>
        </div>
      </div>

      {/* ③ 개산공제 */}
      <div className="space-y-2">
        <SectionTitle number="③" text="기타필요경비 — 개산공제 (시행령 §163⑥, 등기 자산 3%)" tone="sky" />
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/60">
                <th className="py-1 pr-3 text-left font-medium text-muted-foreground">구분</th>
                <th className="py-1 text-right font-medium text-muted-foreground">토지</th>
                <th className="py-1 text-right font-medium text-muted-foreground">건물</th>
                <th className="py-1 text-right font-medium text-muted-foreground">합계</th>
              </tr>
            </thead>
            <tbody>
              <TableRow
                label="개산공제"
                land={estimatedDeduction.land}
                building={estimatedDeduction.building}
                total={estimatedDeduction.land + estimatedDeduction.building}
                highlight
              />
            </tbody>
          </table>
        </div>
        <div className="rounded bg-sky-50/60 border border-sky-200 px-3 py-2 text-xs text-sky-800 space-y-1">
          <p className="font-medium">산식 (취득시 기준시가 × 3%)</p>
          <p>토지 개산공제 = INT(취득시 토지 기준시가 × 3%) = <span className="font-semibold tabular-nums">{formatKRW(estimatedDeduction.land)}</span></p>
          <p>건물 개산공제 = INT(취득시 건물기준시가 × 3%) = <span className="font-semibold tabular-nums">{formatKRW(estimatedDeduction.building)}</span></p>
        </div>
      </div>

      {/* ④ 자산별 양도차익·장특공제·양도소득금액 */}
      <div className="space-y-2">
        <SectionTitle number="④" text="자산별 양도차익 · 장기보유특별공제 · 양도소득금액" tone="violet" />
        {holdingText && (
          <div className="text-xs text-muted-foreground px-1">
            보유기간: {holdingText}
            {lthdRatePct && ` / 장특율: ${lthdRatePct} (표1 일반자산, 15년 이상 상한 30%)`}
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/60">
                <th className="py-1 pr-3 text-left font-medium text-muted-foreground">구분</th>
                <th className="py-1 text-right font-medium text-muted-foreground">토지</th>
                <th className="py-1 text-right font-medium text-muted-foreground">건물</th>
                <th className="py-1 text-right font-medium text-muted-foreground">합계</th>
              </tr>
            </thead>
            <tbody>
              <TableRow label="양도가액" land={allocation.land} building={allocation.building} total={totalTransferPrice} />
              <TableRow label="환산취득가" land={acquisition.land} building={acquisition.building} total={acquisition.land + acquisition.building} sub />
              <TableRow label="기타필요경비(개산공제)" land={estimatedDeduction.land} building={estimatedDeduction.building} total={estimatedDeduction.land + estimatedDeduction.building} sub />
              <Divider />
              <TableRow label="양도차익" land={gainLand} building={gainBuilding} total={gainTotal} highlight />
              {lthdLandValue !== undefined && (
                <TableRow
                  label={`장기보유특별공제${lthdRatePct ? ` (${lthdRatePct})` : ""}`}
                  land={lthdLandValue}
                  building={gainBuilding < 0 ? "0 (차손 미적용)" : lthdBuildingValue}
                  total={lthdLandValue + (lthdBuildingValue ?? 0)}
                  sub
                />
              )}
              <Divider />
              {incomeLandPre !== undefined && incomeBuildingPre !== undefined && (
                <TableRow
                  label="양도소득금액 (통산 전)"
                  land={incomeLandPre}
                  building={incomeBuildingPre}
                  total={incomeLandPre + incomeBuildingPre}
                  highlight
                />
              )}
            </tbody>
          </table>
        </div>
        {gainBuilding < 0 && (
          <div className="rounded bg-rose-50/60 border border-rose-200 px-3 py-2 text-xs text-rose-700">
            건물 양도차익 {formatKRW(gainBuilding)} (차손) → 장기보유특별공제 미적용 (소득세법 §95①: 양도차익에서 차감)
          </div>
        )}
      </div>

      {/* ⑤ §102② 1차 통산 */}
      {offset !== undefined && offset > 0 && (
        <div className="space-y-2">
          <SectionTitle number="⑤" text="§102② 결손금 1차 통산 (건물 차손 → 토지 흡수)" tone="violet" />
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/60">
                  <th className="py-1 pr-3 text-left font-medium text-muted-foreground">구분</th>
                  <th className="py-1 text-right font-medium text-muted-foreground">토지</th>
                  <th className="py-1 text-right font-medium text-muted-foreground">건물</th>
                  <th className="py-1 text-right font-medium text-muted-foreground">합계</th>
                </tr>
              </thead>
              <tbody>
                {incomeLandPre !== undefined && incomeBuildingPre !== undefined && (
                  <TableRow label="통산 전" land={incomeLandPre} building={incomeBuildingPre} total={incomeLandPre + incomeBuildingPre} />
                )}
                <TableRow label="§102② 흡수" land={`−${formatKRW(offset)}`} building={`+${formatKRW(offset)}`} total={null} sub />
                <Divider />
                <TableRow
                  label="양도소득금액 (통산 후)"
                  land={incomeLandPost}
                  building={0}
                  total={incomeTotal}
                  highlight
                />
              </tbody>
            </table>
          </div>
          <div className="rounded bg-violet-50/60 border border-violet-200 px-3 py-2 text-xs text-violet-800">
            <p>흡수액 = 건물 차손 절댓값 <span className="font-semibold tabular-nums">{formatKRW(offset)}</span></p>
            <p>토지 양도소득금액 = 통산 전 {incomeLandPre !== undefined ? formatKRW(incomeLandPre) : "—"} − 흡수액 {formatKRW(offset)} = <span className="font-semibold tabular-nums">{incomeLandPost !== undefined ? formatKRW(incomeLandPost) : "—"}</span></p>
          </div>
        </div>
      )}

      {/* NBL 판정 결과 */}
      <div className="rounded bg-sky-50/60 border border-sky-200 px-3 py-2 text-xs text-sky-800 space-y-1">
        <p className="font-semibold">비사업용토지 판정 (시행령 §168의8)</p>
        <p>건물 수평투영면적 = <span className="tabular-nums font-medium">{detail.buildingFootprintArea.toFixed(2)} ㎡</span> (사용자 입력 — 건축물대장 건축면적)</p>
        <p>인정 한도 = 수평투영면적 {detail.buildingFootprintArea.toFixed(2)}㎡ × 3배 = <span className="tabular-nums font-medium">{detail.allowedLandArea.toFixed(2)} ㎡</span></p>
        <p>판정: {detail.isWithinNblRatio
          ? <span className="text-emerald-700 font-semibold">사업용 (배율 내 — 중과 미발동)</span>
          : <span className="text-rose-700 font-semibold">비사업용 (배율 초과 — 중과 발동)</span>
        }</p>
      </div>
    </div>
  );
}
