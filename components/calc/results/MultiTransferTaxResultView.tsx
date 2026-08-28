"use client";

import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ArrowRight } from "lucide-react";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { cn } from "@/lib/utils";
import { reductionTypeLabelOf } from "@/lib/tax-engine/transfer-reduction-type-labels";
import type { AggregateTransferResult } from "@/lib/tax-engine/transfer-tax-aggregate";
import type { PropertyItem } from "@/lib/stores/multi-transfer-tax-store";
import { MultiTransferTaxSummaryCard } from "./MultiTransferTaxSummaryCard";
import { CalculationWarningsCard } from "./shared/CalculationWarningsCard";
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
  isLoggedIn?: boolean;
  savedId?: string | null;
}


// ─── 감면세액 합산 재계산 내역 ─────────────────────────────────
// 조특법 §69(자경) + §127의2(중복배제) + §133(종합한도) 기반 재계산 결과 표시.
// 단건 산출세액 × 감면대상소득 / 과세표준 → §133 유형별 한도 적용.

function ReductionRecalculationSection({
  result,
  properties,
}: {
  result: AggregateTransferResult;
  properties: PropertyItem[];
}) {
  if (!result.reductionBreakdown || result.reductionBreakdown.length === 0) return null;

  const labelMap = new Map(properties.map((p) => [p.propertyId, p.propertyLabel]));


  return (
    <Card>
      <div className="p-4 space-y-3">
        <h3 className="text-sm font-medium">
          감면세액 합산 재계산 (조특법 §127의2 + §133)
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
                  <span className="text-right tabular-nums">
                    {entry.aggregateCalculatedTax.toLocaleString()}
                  </span>
                  <span className="text-muted-foreground">합산 감면대상소득</span>
                  <span className="text-right tabular-nums">
                    {entry.totalReducibleIncome.toLocaleString()}
                  </span>
                  <span className="text-muted-foreground">합산 과세표준</span>
                  <span className="text-right tabular-nums">
                    {entry.aggregateTaxBase.toLocaleString()}
                  </span>
                  <span className="text-muted-foreground">재계산 원시 감면</span>
                  <span className="text-right tabular-nums">
                    {entry.rawAggregateReduction.toLocaleString()}
                  </span>
                  <span className="text-muted-foreground font-medium">최종 감면세액</span>
                  <span className="text-right tabular-nums font-medium text-primary">
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
                            <td className="text-right tabular-nums">
                              {resolveRefCalculatedTax(p).toLocaleString()}
                            </td>
                            <td className="text-right tabular-nums">
                              {p.reductionAmount.toLocaleString()}
                            </td>
                            <td className="text-right tabular-nums">
                              {p.reducibleIncome.toLocaleString()}
                            </td>
                            <td className="text-right tabular-nums font-medium">
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
  if (result.lossOffsetTable.length === 0) return null;

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
  if (result.groupTaxes.length <= 1) return null;

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
  isLoggedIn,
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
    s.add("reduction-recalc");
    s.add("group-tax");
    s.add("loss-offset");
    s.add("per-property");
    // 계산서는 모달 스냅샷이 있는 자산이 있을 때만 렌더된다 → 그때만 선택 가능.
    if (hasBuildingStdReport({ assets: allAssets })) s.add("building-std-report");
    return s;
  }, [allAssets]);

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
      {/* [B6] 신고서 단위 수정신고·경정청구 정정 카드 (당초 대비 추가납부/환급 hero) */}
      {result.amendmentDetail && (
        <AmendmentResultCard detail={result.amendmentDetail} fullTotalTax={result.totalTax} />
      )}
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
        const aggregateMeta = {
          properties: result.properties,
          aggregated: result,
        };
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

      {/* 이력 안내 */}
      {!isLoggedIn && (
        <Card className="border-dashed print:hidden">
          <CardContent className="py-4 text-center text-sm text-muted-foreground">
            로그인하면 계산 이력이 자동 저장되고 PDF 다운로드가 가능합니다.{" "}
            <a href="/auth/login" className="text-primary underline">
              로그인
            </a>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
