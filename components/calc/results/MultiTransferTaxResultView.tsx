"use client";

import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ArrowRight } from "lucide-react";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { cn } from "@/lib/utils";
import { reductionTypeLabelOf } from "@/lib/tax-engine/transfer-reduction-type-labels";
import { reductionEligibleIncome } from "./transfer/reduction-eligible-income";
import { RATED_REDUCIBLE_INCOME_LABEL } from "./transfer/reduction-eligible-income";
import type { AggregateTransferResult } from "@/lib/tax-engine/transfer-tax-aggregate";
import type { PropertyItem } from "@/lib/stores/multi-transfer-tax-store";
import { MultiTransferTaxSummaryCard } from "./MultiTransferTaxSummaryCard";
import { CalculationWarningsCard } from "./shared/CalculationWarningsCard";
import { buildAggregateMeta } from "./transfer/build-aggregate-meta";
import { MultiTransferFilingFormSection } from "@/components/calc/results/transfer/MultiTransferFilingFormSection";
import { DetailedCalculationStatementCard } from "@/components/calc/results/transfer/DetailedCalculationStatementCard";
import { AmendmentResultCard } from "@/components/calc/results/transfer/AmendmentResultCard";
import { aggregateToFilingResult } from "@/components/calc/results/BundledAllocationCard";
import { PrintSelectionPanel } from "@/components/calc/results/PrintSelectionPanel";
import {
  PropertyBreakdownAccordion,
  formatKRW,
  resolveRefCalculatedTax,
  RATE_GROUP_LABELS,
  RATE_GROUP_COLORS,
} from "./MultiTransferPropertyBreakdown";
import { PrintSection } from "@/components/calc/results/shared/PrintSection";
import {
  BuildingStdPriceReportSection,
  hasBuildingStdReport,
} from "@/components/calc/results/BuildingStdPriceReportSection";
import { extractRelevantBuildingStdSnapshots } from "@/lib/storage/use-auto-save-calculation";
import { downloadSelectedPdf } from "@/components/calc/results/transfer/TransferTaxResultViewHelpers";
import { CrossEngine1045Notice } from "@/components/calc/shared/CrossEngine1045Notice";
import {
  MULTI_TRANSFER_PRINT_SECTIONS,
  type MultiTransferPrintSectionId,
} from "@/lib/print/multi-transfer-print-sections";

interface MultiTransferTaxResultViewProps {
  result: AggregateTransferResult;
  properties: PropertyItem[];
  taxYear: number;
  savedId?: string | null;
}


/**
 * 선택 출력 leaf의 가용성 술어 — **렌더 게이트와 같은 함수를 쓴다**.
 *
 * 🔴 종전에는 `availablePrintIds`가 이 셋을 무조건 `add`했고, 정작 컴포넌트는 데이터가
 *   없으면 `null`을 반환했다. 그래서 「출력 항목 선택」에 **화면에 없는 섹션**이 떠서
 *   선택·인쇄가 가능했다 — 패널의 계약(「가용 노드만 표시 — 데이터 없는 서식 선택 방지」)과
 *   정면으로 어긋난다.
 *
 * ⚠️ 술어를 공유하는 것만으로는 부족하고 **같은 인자**로 불러야 한다
 *   (memory `feedback_shared_predicate_argument_parity`). 셋 다 `result` 하나만 받는다.
 */
export const hasReductionRecalc = (r: AggregateTransferResult) =>
  (r.reductionBreakdown?.length ?? 0) > 0;
export const hasLossOffsetTable = (r: AggregateTransferResult) => r.lossOffsetTable.length > 0;
export const hasGroupTaxCards = (r: AggregateTransferResult) => r.groupTaxes.length > 1;

// ─── 감면세액 합산 재계산 내역 ─────────────────────────────────
// 조특법 §69(자경) + §127⑦(중복배제) + §133(종합한도) 기반 재계산 결과 표시.
// ⚠️ 종전에는 「의2」가 붙은 조문을 적었으나 조특법에 그런 조문은 **존재하지 않는다**
//    (KoreanLaw 실측 NOT_FOUND). 중복배제는 §127⑦이다.
// 단건 산출세액 × 감면대상소득 / 과세표준 → §133 유형별 한도 적용.

function ReductionRecalculationSection({
  result,
  properties,
}: {
  result: AggregateTransferResult;
  properties: PropertyItem[];
}) {
  if (!hasReductionRecalc(result)) return null;

  const labelMap = new Map(properties.map((p) => [p.propertyId, p.propertyLabel]));


  return (
    <Card>
      <div className="p-4 space-y-3">
        <h3 className="text-sm font-medium">
          감면세액 합산 재계산 (조특법 §127⑦ + §133)
        </h3>
        <div className="flex flex-wrap items-center gap-1.5">
          <LawArticleModal legalBasis="조세특례제한법 §133" label="§133 종합한도" />
        </div>
        <p className="text-xs text-muted-foreground">
          산출세액 × (감면대상 양도소득금액 / 과세표준)으로 재계산한 뒤 유형별 연간 한도를 적용합니다.
        </p>
        <div className="space-y-3">
          {result.reductionBreakdown.map((entry) => {
            const perAsset = result.properties.filter(
              (p) => p.reductionType === entry.type,
            );
            return (
              <div key={entry.type} className="rounded border border-amber-200/60 bg-amber-50/30 p-3">
                <p className="text-sm font-medium">
                  {reductionTypeLabelOf(entry.type)}
                  {entry.cappedByLimit && (
                    <span className="ml-2 text-xs text-amber-700">
                      ⚠ 한도 적용 ({entry.annualLimit.toLocaleString()})
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground mt-1">{entry.legalBasis}</p>

                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <span className="text-muted-foreground">합산 산출세액</span>
                  <span className="text-right font-mono tabular-nums whitespace-nowrap">
                    {entry.aggregateCalculatedTax.toLocaleString()}
                  </span>
                  {/*
                    🔴 「합산 감면대상소득」은 `totalReducibleIncome`이 **아니다** (2026-09-03).
                    그 필드는 유형마다 단위가 갈린다 — §97 계열은 감면율 前 소득이지만
                    §77·§77의2·§77의3은 **감면율이 곱해진** 값이라, 같은 결과의 신고서 ⑲
                    (감면율 前)와 화면이 어긋났다(§77 공익수용 6억: 화면 28,800,000 ↔ ⑲ 288,000,000).
                    ⇒ 엔진이 §90①의 B를 `eligibleIncomeBeforeRate`로 따로 싣는다.
                    `totalReducibleIncome`은 자산별 배분 분모로만 남는다.
                  */}
                  {/* 옛 저장 결과(IndexedDB)에는 신규 필드가 없다 — 종전 값으로 폴백한다. */}
                  <span className="text-muted-foreground">합산 감면대상소득 (감면율 前)</span>
                  <span className="text-right font-mono tabular-nums whitespace-nowrap">
                    {(entry.eligibleIncomeBeforeRate ?? entry.totalReducibleIncome).toLocaleString()}
                  </span>
                  {/*
                    양도소득 기본공제 — 「소득세법」 §90①의 C. §103②이 「감면소득금액 외의
                    양도소득금액에서 먼저 공제」하라 정하므로 비감면소득이 있으면 0이 된다.
                    그래서 통상 사안에서는 이 행이 뜨지 않는다.
                  */}
                  {(entry.basicDeductionApplied ?? 0) > 0 && (
                    <>
                      <span className="text-muted-foreground">양도소득 기본공제</span>
                      <span className="text-right font-mono tabular-nums whitespace-nowrap">
                        −{entry.basicDeductionApplied.toLocaleString()}
                      </span>
                    </>
                  )}
                  {/*
                    적용 감면율 — §97 계열·장기임대·신축·미분양은 「합산 감면대상소득」이
                    별지84호 부표1 ⑲ 표시 계약상 **감면율 前** 금액이라, 감면율을 함께 보여야
                    「산출세액 × 감면대상소득 / 과세표준 × 감면율 = 원시 감면」 항등식이 성립한다.
                    §77·§69처럼 소득에 이미 반영된 유형은 1이므로 행을 숨긴다 (코드리뷰 D8-01).
                  */}
                  {/* 옛 저장 결과(IndexedDB)에는 이 필드가 없다 — null 가드가 없으면 「NaN%」가 찍힌다. */}
                  {entry.appliedReductionRate != null && entry.appliedReductionRate !== 1 && (
                    <>
                      <span className="text-muted-foreground">적용 감면율</span>
                      <span className="text-right font-mono tabular-nums whitespace-nowrap">
                        {(entry.appliedReductionRate * 100).toFixed(entry.appliedReductionRate * 100 % 1 === 0 ? 0 : 2)}%
                      </span>
                    </>
                  )}
                  {/*
                    §90①의 `(B − C) × E` — 재계산이 실제로 쓴 분자다.
                    「산출세액 × 이 값 / 과세표준 = 원시 감면」이 **정확히** 성립한다.
                    §77처럼 현금분·채권분의 감면율이 섞이면 위의 단일 「적용 감면율」로는
                    복원되지 않으므로 이 행이 자기일관성을 지킨다.
                    감면율이 1이고 기본공제도 0이면 위 행과 같은 값이라 숨긴다.
                  */}
                  {entry.reducibleIncomeAfterBasicDeduction != null &&
                    entry.reducibleIncomeAfterBasicDeduction !==
                      (entry.eligibleIncomeBeforeRate ?? entry.totalReducibleIncome) && (
                      <>
                        <span className="text-muted-foreground">
                          {RATED_REDUCIBLE_INCOME_LABEL}
                        </span>
                        <span className="text-right font-mono tabular-nums whitespace-nowrap">
                          {entry.reducibleIncomeAfterBasicDeduction.toLocaleString()}
                        </span>
                      </>
                    )}
                  <span className="text-muted-foreground">합산 과세표준</span>
                  <span className="text-right font-mono tabular-nums whitespace-nowrap">
                    {entry.aggregateTaxBase.toLocaleString()}
                  </span>
                  <span className="text-muted-foreground">재계산 원시 감면</span>
                  <span className="text-right font-mono tabular-nums whitespace-nowrap">
                    {entry.rawAggregateReduction.toLocaleString()}
                  </span>
                  <span className="text-muted-foreground font-medium">최종 감면세액</span>
                  <span className="text-right font-mono tabular-nums whitespace-nowrap font-medium text-primary">
                    {entry.cappedAggregateReduction.toLocaleString()}
                  </span>
                </div>

                {perAsset.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-amber-200/60">
                    <p className="text-xs text-muted-foreground mb-1">건별 배분</p>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-muted-foreground">
                          <th className="text-left font-normal">자산</th>
                          <th className="text-right font-normal">건별 산출세액</th>
                          <th className="text-right font-normal">건별 단독감면</th>
                          <th className="text-right font-normal">감면대상소득</th>
                          <th className="text-right font-normal">배분 감면</th>
                        </tr>
                      </thead>
                      <tbody>
                        {perAsset.map((p) => (
                          <tr key={p.propertyId}>
                            <td>{labelMap.get(p.propertyId) ?? p.propertyLabel}</td>
                            {/*
                              「건별 산출세액」 — 자산별 산출세액(참고) `refCalculatedTax`.
                              종전에는 감면세액(`reductionAmount`)을 그리고 목적지 없는 화살표를
                              남겨, 옆 「건별 단독감면」 열과 같은 숫자가 나란히 떴다
                              (감면율 = 감면 ÷ 산출 검산 불가). 옛 저장 결과에서 필드가 없을 수
                              있으므로 아코디언과 같은 가드(`resolveRefCalculatedTax`)를 쓴다.
                            */}
                            <td className="text-right font-mono tabular-nums whitespace-nowrap">
                              {resolveRefCalculatedTax(p).toLocaleString()}
                            </td>
                            <td className="text-right font-mono tabular-nums whitespace-nowrap">
                              {p.reductionAmount.toLocaleString()}
                            </td>
                            {/*
                              🔴 `p.reducibleIncome`을 직접 그리면 §77 계열에서 **감면율이 곱해진**
                                 값이 「감면대상소득」으로 뜬다 — 위 합계 행·신고서 ⑲와 어긋난다.
                                 ⑲의 단일 소스(`reductionEligibleIncome`)를 그대로 쓴다.
                            */}
                            <td className="text-right font-mono tabular-nums whitespace-nowrap">
                              {reductionEligibleIncome(
                                p.reductionType,
                                p.income,
                                p.reducibleIncome ?? 0,
                                p.replacementLandDetail?.eligibleTransferIncome,
                              ).toLocaleString()}
                            </td>
                            <td className="text-right font-mono tabular-nums whitespace-nowrap font-medium">
                              {p.reductionAggregated.toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

// ─── 차손 통산 표 ──────────────────────────────────────────────

function LossOffsetTable({ result, properties }: { result: AggregateTransferResult; properties: PropertyItem[] }) {
  if (!hasLossOffsetTable(result)) return null;

  const labelMap = new Map(properties.map((p) => [p.propertyId, p.propertyLabel]));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          양도차손 통산 내역{" "}
          <span className="text-sm font-normal text-muted-foreground">(소득세법 §102② + 시행령 §167의2)</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {result.lossOffsetTable.map((row, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">
                [{labelMap.get(row.fromPropertyId) ?? row.fromPropertyId}]
              </span>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">
                [{labelMap.get(row.toPropertyId) ?? row.toPropertyId}]
              </span>
              <span className="ml-auto font-medium text-red-600">
                -{formatKRW(row.amount)}
              </span>
              <Badge
                variant="outline"
                className={cn(
                  "text-micro",
                  row.scope === "same_group" ? "border-blue-300 text-blue-700" : "border-purple-300 text-purple-700",
                )}
              >
                {row.scope === "same_group" ? "동일그룹" : "타군안분"}
              </Badge>
            </div>
          ))}
        </div>
        {result.unusedLoss > 0 && (
          <div className="mt-3 pt-3 border-t flex justify-between text-sm">
            <span className="text-muted-foreground">소멸 차손 (이월 불인정 — §102② 단서)</span>
            <span className="text-destructive font-medium">-{formatKRW(result.unusedLoss)}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}


// ─── 세율군 집계 카드 ──────────────────────────────────────────

function GroupTaxCards({ result }: { result: AggregateTransferResult }) {
  if (!hasGroupTaxCards(result)) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">세율군별 산출세액 (방법 B)</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {result.groupTaxes.map((g) => (
            <div key={g.group} className="flex items-center gap-3 text-sm">
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2 py-0.5 text-micro font-medium",
                  RATE_GROUP_COLORS[g.group],
                )}
              >
                {RATE_GROUP_LABELS[g.group]}
              </span>
              <span className="text-muted-foreground">과세표준 {formatKRW(g.groupTaxBase)}</span>
              <span className="ml-auto font-medium">{formatKRW(g.groupCalculatedTax)}</span>
              <span className="text-muted-foreground text-xs">
                ({(g.appliedRate * 100).toFixed(1)}%
                {g.surchargeRate ? ` +${(g.surchargeRate * 100).toFixed(0)}%p` : ""})
              </span>
            </div>
          ))}
          <Separator />
          <div className="flex justify-between font-medium">
            <span>세율군별 합계</span>
            <span>{formatKRW(result.calculatedTaxByGroups)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── 결과 행 공통 컴포넌트 ────────────────────────────────────

function ResultRow({
  label,
  value,
  highlight,
  compact,
  className,
}: {
  label: string;
  value: number;
  highlight?: boolean;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex justify-between",
        compact ? "text-sm" : "",
        highlight ? "font-semibold" : "text-muted-foreground",
        className,
      )}
    >
      <span>{label}</span>
      <span className={value < 0 ? "text-red-600" : ""}>{formatKRW(value)}</span>
    </div>
  );
}

// ─── 메인 컴포넌트 ─────────────────────────────────────────────

export function MultiTransferTaxResultView({
  result,
  properties,
  taxYear,
}: MultiTransferTaxResultViewProps) {
  // showSteps는 명세서 카드의 EngineStepsSubToggle로 통합됨 (2026-05-12)
  const [isPdfLoading, setIsPdfLoading] = useState(false);
  const [selectedPrintIds, setSelectedPrintIds] = useState<Set<string>>(
    () => new Set()
  );

  /**
   * 건물 기준시가 계산서 소속 판정용 — 다건은 건별 form을 가지므로 전 건의 자산을 모은다.
   * (스냅샷 키의 assetId가 이 목록 JSON에 등장하는지로 이 계산 소속을 가린다.)
   */
  const allAssets = useMemo(
    () => properties.flatMap((p) => p.form?.assets ?? []),
    [properties],
  );

  // 현재 결과뷰에 실제 렌더되는 leaf id (설계 §2.6 — sub 컴포넌트 내부 가드라 7개 항상)
  const availablePrintIds = useMemo<Set<MultiTransferPrintSectionId>>(() => {
    const s = new Set<MultiTransferPrintSectionId>();
    s.add("form-table");
    s.add("summary");
    s.add("detailed-statement");
    // 아래 셋은 렌더 게이트와 **같은 술어**를 탄다 — 화면에 없는 섹션을 선택지에 올리지 않는다.
    if (hasReductionRecalc(result)) s.add("reduction-recalc");
    if (hasGroupTaxCards(result)) s.add("group-tax");
    if (hasLossOffsetTable(result)) s.add("loss-offset");
    s.add("per-property");
    // 계산서는 모달 스냅샷이 있는 자산이 있을 때만 렌더된다 → 그때만 선택 가능.
    if (hasBuildingStdReport({ assets: allAssets })) s.add("building-std-report");
    return s;
  }, [allAssets, result]);

  // 선택 항목 클라이언트 PDF 다운로드 — Helpers downloadSelectedPdf 위임 (로컬 result react-pdf 생성)
  const handlePrintPdf = (pdfSections: string[]) =>
    downloadSelectedPdf(
      {
        taxType: "transfer_multi",
        taxTypeLabel: "양도소득세 (다건)",
        resultData: result as unknown as Record<string, unknown>,
        // 건물 기준시가 계산서 PDF는 inputData.buildingStdSnapshots에서 재유도.
        inputData: { buildingStdSnapshots: extractRelevantBuildingStdSnapshots({ assets: allAssets }) },
        filenamePrefix: "양도소득세_계산결과",
      },
      pdfSections,
      setIsPdfLoading,
    );

  return (
    <div className="space-y-4">
      {/* 자산별 경고 — 집계 엔진이 단건 warnings를 자산 라벨과 함께 모은다(R-5). */}
      <CalculationWarningsCard warnings={result.warnings} />

      {/* 출력 항목 선택 패널 (선택 항목만 인쇄·PDF) */}
      <PrintSelectionPanel
        allGroups={MULTI_TRANSFER_PRINT_SECTIONS}
        selectedIds={selectedPrintIds}
        availableIds={availablePrintIds}
        onChange={setSelectedPrintIds}
        onPrintPdf={handlePrintPdf}
        pdfReady={true}
        pdfBusy={isPdfLoading}
      />

      {/* 상단 합산 신고서 양식 (합계 + 자산별 컬럼) — 단건 결과와 동일 위치 */}
      <PrintSection id="form-table" selectedIds={selectedPrintIds}>
        <MultiTransferFilingFormSection result={result} properties={properties} />
      </PrintSection>

      {/* 합산 결과 카드 */}
      <PrintSection id="summary" selectedIds={selectedPrintIds}>
      {/**
        [B6] 신고서 단위 수정신고·경정청구 정정 카드 (당초 대비 추가납부/환급).

        📌 **`PrintSection` 안이어야 한다.** 종전에는 이 카드만 첫 `PrintSection`보다 **위**에
           있어 어느 leaf에도 속하지 않았고, 그래서 **인쇄·PDF에 들어가지 않았다**.
           일괄 뷰는 2026-08-27에 같은 비대칭을 `calculation` 그룹 안으로 옮겨 고쳤는데
           (`BundledAllocationCard.tsx`) 다건에만 남아 있었다.

        ⛔ 위로 다시 올리지 말 것 — `data-testid="amendment-result"`가 비유일해지면
           Playwright strict 로케이터가 깨진다.
      */}
      {result.amendmentDetail && (
        <AmendmentResultCard detail={result.amendmentDetail} fullTotalTax={result.totalTax} />
      )}
      <MultiTransferTaxSummaryCard
        result={result}
        properties={properties}
        taxYear={taxYear}
      />
      </PrintSection>

      {/* ── 계산결과 상세명세서 (다건 합산) ── */}
      {/* 신고서 양식 32 항목별 산식·변수값·법령 노출 (자산별 펼침 포함) */}
      <PrintSection id="detailed-statement" selectedIds={selectedPrintIds}>
      {(() => {
        const adapted = aggregateToFilingResult(result);
        // 🔴 종전에는 `{ properties, aggregated }`만 넘겨 **`propertyFormMap`이 없었다**.
        //    그러면 명세서의 자산별 취득일·보유기간·양도일이 조회할 소스가 없어 1번 양도건의
        //    자산 하나만 보게 되고, 바로 위 신고서 표와 **같은 항목에 다른 날짜**가 찍혔다
        //    (결과탭 코드리뷰 #054·#093). 이제 신고서 섹션과 같은 leaf로 조립한다.
        const aggregateMeta = buildAggregateMeta(result, properties);
        const firstProperty = properties[0];
        return (
          <DetailedCalculationStatementCard
            result={adapted}
            formData={firstProperty?.form}
            asset={firstProperty?.form?.assets[0]}
            aggregate={aggregateMeta}
          />
        );
      })()}
      </PrintSection>

      {/* 감면세액 합산 재계산 내역 (자경·공익수용 등) */}
      <PrintSection id="reduction-recalc" selectedIds={selectedPrintIds}>
        <ReductionRecalculationSection result={result} properties={properties} />
      </PrintSection>

      {/* 세율군별 분리 산출 (2개 이상 그룹일 때) */}
      <PrintSection id="group-tax" selectedIds={selectedPrintIds}>
        <GroupTaxCards result={result} />
      </PrintSection>

      {/* 차손 통산 표 */}
      <PrintSection id="loss-offset" selectedIds={selectedPrintIds}>
        <LossOffsetTable result={result} properties={properties} />
      </PrintSection>

      {/* 건별 breakdown */}
      <PrintSection id="per-property" selectedIds={selectedPrintIds}>
      <div className="space-y-2">
        <h3 className="font-medium text-sm text-muted-foreground">건별 상세</h3>
        {result.properties.map((p) => (
          <PropertyBreakdownAccordion
            key={p.propertyId}
            breakdown={p}
            property={properties.find((x) => x.propertyId === p.propertyId)}
          />
        ))}
      </div>
      </PrintSection>

      {/* 건물 기준시가 계산서 (모달 스냅샷 재유도 — 스냅샷 있을 때만 렌더) */}
      <PrintSection id="building-std-report" selectedIds={selectedPrintIds}>
        <BuildingStdPriceReportSection inputData={{ assets: allAssets }} />
      </PrintSection>

      {/* 합산 계산 과정 토글은 명세서 카드 내 'EngineStepsSubToggle'로 통합됨 (2026-05-12) */}

      {/* §104⑤ 크로스 엔진 고지 — 비사업용 토지 그룹이 있을 때만 (계획서 C-1 · R-5) */}
      {result.groupTaxes.some((g) => g.group === "non_business_land") && (
        <CrossEngine1045Notice from="real_estate" />
      )}

      {/* ⛔ 로그인 안내 배너를 되살리지 말 것 (2026-09-05 · 코드리뷰 Q30).
          「로그인하면 이력 저장·PDF 가능」은 **사실이 아니었다** — 이력은 로컬 IndexedDB로
          일원화됐고(`proxy.ts:4`에서 /api/history 보호 라우트 제거), PDF는 클라이언트에서
          생성한다. 같은 화면의 PDF 버튼이 비로그인에서도 동작해 안내와 정면으로 모순됐다.
          로그인이 실제로 무엇을 더 주는지가 생기면 그때 그 사실을 쓴다. */}
    </div>
  );
}
