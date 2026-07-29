"use client";

/**
 * 재산세 계산 결과 표시 컴포넌트 (P1-15)
 *
 * 표시 항목:
 * - 과세표준 (공정시장가액비율 포함)
 * - 산출세액 (세율 + 1세대1주택 특례 뱃지)
 * - 세부담상한 적용 후 확정세액
 * - 부가세 분해 (지방교육세·도시지역분·지역자원시설세)
 * - 총 납부세액
 * - 분납 안내
 */

import type {
  PropertyTaxResult,
  PropertyTaxpayerInfo,
  PropertyCoOwnershipDistribution,
  PropertyHouseSplitDistribution,
} from "@/lib/tax-engine/types/property.types";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { useState, useMemo } from "react";
import { expandToggleClass, expandToggleLabel } from "@/components/calc/results/shared/ExpandToggleButton";
import { generateResultPdf } from "@/lib/pdf/generate-result-pdf";
import { formatIsoStamp } from "@/lib/utils/file-download";
import { PrintSelectionPanel } from "@/components/calc/results/PrintSelectionPanel";
import { PrintSection } from "@/components/calc/results/shared/PrintSection";
import {
  PROPERTY_PRINT_SECTIONS,
  type PropertyPrintSectionId,
} from "@/lib/print/property-print-sections";

function formatKRW(amount: number): string {
  return amount.toLocaleString("ko-KR");
}

// 법령 근거 — 펼치기/접기 (native details → 표준 칩, 인쇄 시 자동 펼침)
function LegalBasisDisclosure({ legalBasis }: { legalBasis: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="text-xs text-muted-foreground">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 hover:text-foreground transition-colors"
      >
        <span>법령 근거 보기 ({legalBasis.length}건)</span>
        <span className={expandToggleClass("slate")} aria-hidden>{expandToggleLabel(open)}</span>
      </button>
      <ul className={`${open ? "" : "hidden print:block "}mt-2 space-y-0.5 pl-3 list-disc`}>
        {legalBasis.map((b, i) => (
          <li key={i}>
            <LawArticleModal legalBasis={b} className="hover:text-primary hover:underline transition-colors text-xs" />
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatRate(rate: number): string {
  return (rate * 100).toFixed(4).replace(/\.?0+$/, "") + "%";
}

interface Props {
  result: PropertyTaxResult;
  /** 저장된 계산 id — 서버 PDF 선택 출력(PR-D)용. 미저장/비로그인 시 undefined */
  savedId?: string;
}

/** 납세의무자 유형 한국어 라벨 */
const TAXPAYER_TYPE_LABEL: Record<string, string> = {
  registered_owner:        "공부상 소유자 (§107①본문)",
  actual_owner:            "사실상 소유자 (§107①본문)",
  co_owner:                "공유자 — 지분별 납세 (§107①1호)",
  truster:                 "신탁 위탁자 (§107②5호)",
  trustee:                 "신탁 수탁자",
  beneficiary:             "신탁 수익자",
  heir_representative:     "주된 상속인 — 상속 미등기 (§107②2호)",
  construction_contractor: "건축주 — 건설 중 건축물",
  lessee:                  "지상권자·임차인",
  // 기타 6종 §107
  installment_buyer:       "연부 매수계약자 (§107②4호)",
  project_operator:        "체비지·보류지 사업시행자 (§107②6호)",
  importer:                "외국인 수입 항공기·선박 수입자 (§107②7호)",
  user:                    "사용자 — 소유권 불명 (§107③)",
  // §107①2호: 주택 건물·부속토지 소유자 분리 안분
  building_owner:          "건물 소유자 (§107①2호)",
  land_owner:              "부속토지 소유자 (§107①2호)",
};

/** 납세의무자 판정 결과 서브섹션 */
function TaxpayerSection({ taxpayer }: { taxpayer: PropertyTaxpayerInfo }) {
  const typeLabel = TAXPAYER_TYPE_LABEL[taxpayer.type] ?? taxpayer.type;
  return (
    <div className="rounded-md border border-sky-200 bg-sky-50/40 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-sky-200 text-micro font-bold text-sky-800 select-none">
          §
        </span>
        <p className="text-xs font-semibold text-sky-700">납세의무자 유형</p>
      </div>
      <div className="rounded-md border border-sky-200 bg-white/60 divide-y text-sm">
        <div className="flex items-start justify-between py-2 px-3">
          <span className="text-muted-foreground">납세의무자</span>
          <span className="font-medium">{taxpayer.name || "(미입력)"}</span>
        </div>
        <div className="flex items-start justify-between py-2 px-3">
          <span className="text-muted-foreground">판정 유형</span>
          <span className="font-medium text-right">{typeLabel}</span>
        </div>
        <div className="flex items-start justify-between py-2 px-3">
          <span className="text-muted-foreground">법령 근거</span>
          <span className="text-right text-xs">{taxpayer.legalBasis}</span>
        </div>
      </div>
      {taxpayer.warnings.length > 0 && (
        <div className="rounded-md bg-amber-50 border border-amber-200 p-2 space-y-0.5">
          {taxpayer.warnings.map((w, i) => (
            <p key={i} className="text-xs text-amber-800">
              ⚠ {w}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

/** 공유 지분 안분 표 */
function CoOwnershipTable({
  distribution,
  determinedTax,
  totalPayable,
}: {
  distribution: PropertyCoOwnershipDistribution;
  determinedTax: number;
  totalPayable: number;
}) {
  return (
    <div className="rounded-md border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/40">
          <tr>
            <th className="text-left py-2 px-3 font-medium text-muted-foreground">
              공유자
            </th>
            <th className="text-right py-2 px-3 font-medium text-muted-foreground whitespace-nowrap">
              지분율
            </th>
            <th className="text-right py-2 px-3 font-medium text-muted-foreground whitespace-nowrap">
              본세 안분액
            </th>
            <th className="text-right py-2 px-3 font-medium text-muted-foreground whitespace-nowrap">
              고지액 안분액
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {distribution.distributions.map((d, i) => (
            <tr key={i} className="hover:bg-muted/20 transition-colors">
              <td className="py-2 px-3 font-medium">
                {d.ownerId || `공유자 ${i + 1}`}
              </td>
              <td className="py-2 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                {(d.shareRatio * 100).toFixed(2).replace(/\.?0+$/, "")}%
              </td>
              <td className="py-2 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                {formatKRW(d.taxAmount)}
              </td>
              <td className="py-2 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                {formatKRW(d.totalAmount)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="bg-primary/5 border-t-2 border-foreground">
          <tr>
            <td className="py-2 px-3 font-bold">합계</td>
            <td className="py-2 px-3 text-right font-bold font-mono tabular-nums whitespace-nowrap">
              100%
            </td>
            <td className="py-2 px-3 text-right font-bold font-mono tabular-nums whitespace-nowrap text-primary">
              {formatKRW(determinedTax)}
            </td>
            <td className="py-2 px-3 text-right font-bold font-mono tabular-nums whitespace-nowrap text-primary">
              {formatKRW(totalPayable)}
            </td>
          </tr>
        </tfoot>
      </table>
      {distribution.roundingDiff !== 0 && (
        <p className="text-caption text-muted-foreground px-3 py-1 border-t">
          안분 오차 {formatKRW(Math.abs(distribution.roundingDiff))}원이
          마지막 공유자에게 흡수됩니다 (floor 잔액 흡수 원칙).
        </p>
      )}
    </div>
  );
}

/** §107①2호 주택 건물·부속토지 소유자 분리 안분 표 */
function HouseSplitDistributionTable({
  distribution,
}: {
  distribution: PropertyHouseSplitDistribution;
}) {
  const {
    buildingOwner,
    buildingStdValue,
    buildingTaxAmount,
    buildingTotalAmount,
    landOwner,
    landStdValue,
    landTaxAmount,
    landTotalAmount,
    buildingRatio,
  } = distribution;

  const totalStdValue = buildingStdValue + landStdValue;
  const totalTax = buildingTaxAmount + landTaxAmount;
  const totalAmount = buildingTotalAmount + landTotalAmount;

  return (
    <div className="rounded-md border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/40">
          <tr>
            <th className="text-left py-2 px-3 font-medium text-muted-foreground">구분</th>
            <th className="text-right py-2 px-3 font-medium text-muted-foreground whitespace-nowrap">시가표준액</th>
            <th className="text-right py-2 px-3 font-medium text-muted-foreground whitespace-nowrap">본세 안분</th>
            <th className="text-right py-2 px-3 font-medium text-muted-foreground whitespace-nowrap">고지액 안분</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          <tr>
            <td className="py-2 px-3">
              <span className="font-medium">건물</span>
              {buildingOwner && (
                <span className="ml-1 text-xs text-muted-foreground">({buildingOwner.trim()})</span>
              )}
            </td>
            <td className="py-2 px-3 text-right font-mono tabular-nums whitespace-nowrap">
              {formatKRW(buildingStdValue)}
            </td>
            <td className="py-2 px-3 text-right font-mono tabular-nums whitespace-nowrap">
              {formatKRW(buildingTaxAmount)}
            </td>
            <td className="py-2 px-3 text-right font-mono tabular-nums whitespace-nowrap">
              {formatKRW(buildingTotalAmount)}
            </td>
          </tr>
          <tr>
            <td className="py-2 px-3">
              <span className="font-medium">부속토지</span>
              {landOwner && (
                <span className="ml-1 text-xs text-muted-foreground">({landOwner.trim()})</span>
              )}
            </td>
            <td className="py-2 px-3 text-right font-mono tabular-nums whitespace-nowrap">
              {formatKRW(landStdValue)}
            </td>
            <td className="py-2 px-3 text-right font-mono tabular-nums whitespace-nowrap">
              {formatKRW(landTaxAmount)}
            </td>
            <td className="py-2 px-3 text-right font-mono tabular-nums whitespace-nowrap">
              {formatKRW(landTotalAmount)}
            </td>
          </tr>
        </tbody>
        <tfoot className="bg-primary/5 border-t-2 border-foreground">
          <tr>
            <td className="py-2 px-3 font-bold">합계</td>
            <td className="py-2 px-3 text-right font-bold font-mono tabular-nums whitespace-nowrap">
              {formatKRW(totalStdValue)}
            </td>
            <td className="py-2 px-3 text-right font-bold font-mono tabular-nums whitespace-nowrap text-primary">
              {formatKRW(totalTax)}
            </td>
            <td className="py-2 px-3 text-right font-bold font-mono tabular-nums whitespace-nowrap text-primary">
              {formatKRW(totalAmount)}
            </td>
          </tr>
        </tfoot>
      </table>
      <p className="text-caption text-muted-foreground px-3 py-1.5 border-t">
        건물분 비율 {(buildingRatio * 100).toFixed(1)}% · 안분 잔액은 토지분에 흡수 (floor 잔액 흡수 원칙)
      </p>
    </div>
  );
}

function TaxRow({
  label,
  amount,
  highlight = false,
  sub = false,
  note,
}: {
  label: string;
  amount: number;
  highlight?: boolean;
  sub?: boolean;
  note?: string;
}) {
  return (
    <div
      className={`flex items-start justify-between py-2 ${
        highlight
          ? "border-t-2 border-foreground font-bold text-base"
          : sub
          ? "pl-4 text-sm text-muted-foreground"
          : "text-sm"
      }`}
    >
      <span>
        {label}
        {note && (
          <span className="ml-1 text-xs text-muted-foreground">({note})</span>
        )}
      </span>
      <span className={highlight ? "text-primary" : ""}>{formatKRW(amount)}</span>
    </div>
  );
}

export function PropertyTaxResultView({ result }: Props) {
  const {
    publishedPrice,
    fairMarketRatio,
    taxBase,
    taxBaseBeforeCap,
    taxBaseCapApplied,
    taxBaseCapLimit,
    priorYearTaxBaseEquivalent,
    appliedRate,
    calculatedTax,
    calculatedTaxBeforeCap,
    taxCapRate,
    determinedTax,
    surtax,
    totalSurtax,
    totalPayable,
    installment,
    oneHouseSpecialApplied,
    warnings,
    legalBasis,
    taxCapMode,
    taxCapBasisTax,
    recomputeDetail,
    housingTransitionalCap,
  } = result;

  const taxpayer = result.taxpayer;
  const coOwnershipDistribution = result.coOwnershipDistribution;
  const houseSplitDistribution = result.houseSplitDistribution;

  const capApplied = determinedTax < calculatedTaxBeforeCap;

  const [pdfBusy, setPdfBusy] = useState(false);
  const [selectedPrintIds, setSelectedPrintIds] = useState<Set<string>>(
    () => new Set()
  );

  // 선택 항목 클라이언트 PDF 다운로드 (react-pdf). result 존재 기준.
  async function handlePrintPdf(pdfSections: string[]) {
    if (pdfSections.length === 0) return;
    setPdfBusy(true);
    try {
      await generateResultPdf({
        taxType: "property",
        taxTypeLabel: "재산세",
        resultData: result as unknown as Record<string, unknown>,
        selectedSectionIds: pdfSections,
        filename: `재산세_계산결과_${formatIsoStamp()}.pdf`,
      });
    } catch {
      alert("PDF 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setPdfBusy(false);
    }
  }

  // 현재 결과뷰에 실제 렌더되는 leaf id (각 섹션 렌더 가드와 1:1 — 설계 §2.3)
  const availablePrintIds = useMemo<Set<PropertyPrintSectionId>>(() => {
    const s = new Set<PropertyPrintSectionId>();
    s.add("tax-base");
    s.add("computed-tax");
    s.add("surtax");
    s.add("total-payable");
    if (installment.eligible) s.add("installment");
    if (warnings.length > 0) s.add("warnings");
    if (legalBasis.length > 0) s.add("legal-basis");
    if (taxpayer) s.add("taxpayer");
    if (coOwnershipDistribution) s.add("co-ownership");
    return s;
  }, [installment, warnings, legalBasis, taxpayer, coOwnershipDistribution]);

  return (
    <div className="space-y-6">
      {/* 출력 항목 선택 패널 (선택 항목만 인쇄·PDF) */}
      <PrintSelectionPanel
        allGroups={PROPERTY_PRINT_SECTIONS}
        selectedIds={selectedPrintIds}
        availableIds={availablePrintIds}
        onChange={setSelectedPrintIds}
        onPrintPdf={handlePrintPdf}
        pdfReady={true}
        pdfBusy={pdfBusy}
      />

      {/* ─── 경고 메시지 ─── */}
      {warnings.length > 0 && (
        <PrintSection id="warnings" selectedIds={selectedPrintIds}>
        <div className="rounded-md bg-amber-50 border border-amber-200 p-3 space-y-1">
          {warnings.map((w, i) => (
            <p key={i} className="text-xs text-amber-800">
              ⚠ {w}
            </p>
          ))}
        </div>
        </PrintSection>
      )}

      {/* ─── 과세표준 ─── */}
      <PrintSection id="tax-base" selectedIds={selectedPrintIds}>
      <section className="space-y-1">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          과세표준
        </h3>
        <div className="rounded-md border divide-y">
          <TaxRow
            label="공시가격"
            amount={publishedPrice}
          />
          <TaxRow
            label={`공정시장가액비율 (${formatRate(fairMarketRatio)})`}
            amount={taxBaseBeforeCap ?? taxBase}
            sub
          />
          <TaxRow
            label="과세표준 (천원 절사)"
            amount={taxBase}
            highlight
          />
        </div>

        {/* 주택 과세표준상한제 (지방세법 §110③) — 상한 적용 시에만 */}
        {taxBaseCapApplied &&
          taxBaseBeforeCap != null &&
          taxBaseCapLimit != null &&
          priorYearTaxBaseEquivalent != null && (
            <div className="mt-2 rounded-lg border border-sky-200 bg-sky-50/40 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-sky-200 text-micro font-bold text-sky-800 select-none">
                  §
                </span>
                <p className="text-xs font-semibold text-sky-700">
                  과세표준상한 적용 (지방세법 §110③)
                </p>
              </div>
              <div className="rounded-md border border-sky-200 bg-white/60 divide-y">
                <TaxRow label="당해연도 과세표준" amount={taxBaseBeforeCap} sub />
                <TaxRow
                  label="직전연도 과세표준 상당액"
                  amount={priorYearTaxBaseEquivalent}
                  sub
                />
                <TaxRow
                  label="과세표준상한율 가산 (당해 과세표준의 5%)"
                  amount={taxBaseCapLimit - priorYearTaxBaseEquivalent}
                  sub
                />
                <TaxRow label="과세표준상한액" amount={taxBaseCapLimit} highlight />
              </div>
              <p className="text-caption text-sky-700">
                당해연도 과세표준이 과세표준상한액보다 커서, 과세표준을 상한액으로 제한합니다.
              </p>
            </div>
          )}
      </section>
      </PrintSection>

      {/* ─── 산출세액 ─── */}
      <PrintSection id="computed-tax" selectedIds={selectedPrintIds}>
      <section className="space-y-1">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
          산출세액
          {oneHouseSpecialApplied && (
            <span className="text-xs font-medium bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
              1세대1주택 특례
            </span>
          )}
        </h3>
        <div className="rounded-md border divide-y">
          <TaxRow
            label={
              appliedRate === 0
                ? "누진세율 (구간별)"
                : `적용 세율 (${formatRate(appliedRate)})`
            }
            amount={calculatedTax}
            sub
          />
          <TaxRow label="산출세액" amount={calculatedTax} />
          {capApplied && (
            <>
              {taxCapMode === "recompute" && recomputeDetail ? (
                <TaxRow
                  label={`직전연도(${recomputeDetail.priorYear}) 재산정 (§118 본문)`}
                  amount={recomputeDetail.recomputedTax}
                  sub
                  note={
                    recomputeDetail.appliedRate != null
                      ? `직전 과세표준 ${formatKRW(recomputeDetail.priorTaxBase)} × ${formatRate(recomputeDetail.appliedRate)}`
                      : `직전 과세표준 ${formatKRW(recomputeDetail.priorTaxBase)} × 직전연도 누진세율`
                  }
                />
              ) : (
                taxCapBasisTax != null && (
                  <TaxRow
                    label={
                      housingTransitionalCap
                        ? "직전연도 재산세 본세"
                        : "직전연도 부과세액 (직접입력)"
                    }
                    amount={taxCapBasisTax}
                    sub
                    note={
                      housingTransitionalCap
                        ? "부칙 제15조 — 종전 §122 세부담상한"
                        : "§118 단서"
                    }
                  />
                )
              )}
              <TaxRow
                label={`세부담상한 적용 (상한율 ${formatRate(taxCapRate)})`}
                amount={determinedTax}
                sub
                note={`전년도 × ${taxCapRate * 100 - 100 > 0 ? `${((taxCapRate - 1) * 100).toFixed(0)}% 가산`  : "상한"}`}
              />
              <TaxRow label="확정세액 (상한 적용 후)" amount={determinedTax} highlight />
            </>
          )}
          {!capApplied && (
            <TaxRow label="확정세액" amount={determinedTax} highlight />
          )}
        </div>
      </section>
      </PrintSection>

      {/* ─── 부가세 ─── */}
      <PrintSection id="surtax" selectedIds={selectedPrintIds}>
      <section className="space-y-1">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          부가세
        </h3>
        <div className="rounded-md border divide-y">
          <TaxRow
            label="지방교육세"
            amount={surtax.localEducationTax}
            note="재산세 × 20%"
            sub
          />
          {surtax.urbanAreaTax > 0 &&
            (housingTransitionalCap?.urbanApplied ? (
              <>
                <TaxRow
                  label="도시지역분 산출"
                  amount={housingTransitionalCap.urbanCalculatedTax!}
                  note="과세표준 × 0.14%"
                  sub
                />
                <TaxRow
                  label={`도시지역분 세부담상한 (상한율 ${formatRate(housingTransitionalCap.capRate)})`}
                  amount={surtax.urbanAreaTax}
                  note={`직전 도시지역분 ${formatKRW(housingTransitionalCap.previousYearUrbanTax!)} × ${(housingTransitionalCap.capRate * 100).toFixed(0)}% (부칙 제15조·§118 본문)`}
                  sub
                />
              </>
            ) : (
              <TaxRow
                label="도시지역분"
                amount={surtax.urbanAreaTax}
                note="과세표준 × 0.14%"
                sub
              />
            ))}
          {surtax.regionalResourceTax > 0 &&
            (surtax.fireHazardMultiplier ? (
              <>
                <TaxRow
                  label="소방분 (기본세율 §146③1호)"
                  amount={surtax.regionalResourceTaxBeforeSurcharge!}
                  note="건축물 시가표준액 누진"
                  sub
                />
                <TaxRow
                  label={`화재위험 중과 ×${surtax.fireHazardMultiplier} (지방세법 §146③${
                    surtax.fireHazardMultiplier === 3 ? "2의2호" : "2호"
                  })`}
                  amount={surtax.regionalResourceTax}
                  sub
                />
              </>
            ) : surtax.housingFireServiceTaxBase != null ? (
              <TaxRow
                label="지역자원시설세 (주택 건물분, §146④ 단서)"
                amount={surtax.regionalResourceTax}
                note={`소방분 과세표준 ${surtax.housingFireServiceTaxBase.toLocaleString()} = 건물분 × 공정시장가액비율 ${formatRate(fairMarketRatio)}`}
                sub
              />
            ) : (
              <TaxRow
                label="지역자원시설세"
                amount={surtax.regionalResourceTax}
                note="건축물 시가표준액 누진"
                sub
              />
            ))}
          <TaxRow label="부가세 합계" amount={totalSurtax} />
        </div>
      </section>
      </PrintSection>

      {/* ─── 총 납부세액 ─── */}
      <PrintSection id="total-payable" selectedIds={selectedPrintIds}>
      <section>
        <div className="rounded-md border bg-primary/5 divide-y">
          <TaxRow label="재산세 (확정세액)" amount={determinedTax} />
          <TaxRow label="부가세 합계" amount={totalSurtax} />
          <TaxRow label="총 납부세액" amount={totalPayable} highlight />
        </div>
      </section>
      </PrintSection>

      {/* ─── 분납 안내 ─── */}
      {installment.eligible && (
        <PrintSection id="installment" selectedIds={selectedPrintIds}>
        <section className="rounded-md bg-blue-50 border border-blue-200 p-4 space-y-2">
          <h4 className="text-sm font-semibold text-blue-800">
            분납 안내 (지방세법 §115)
          </h4>
          <p className="text-xs text-blue-700">
            재산세 산출세액이 20만원을 초과하여 7월과 9월에 나누어 납부할 수 있습니다.
          </p>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded bg-white border p-2 text-center">
              <div className="text-xs text-muted-foreground mb-1">1차 (7월)</div>
              <div className="font-semibold">{formatKRW(installment.firstPayment)}</div>
            </div>
            <div className="rounded bg-white border p-2 text-center">
              <div className="text-xs text-muted-foreground mb-1">2차 (9월)</div>
              <div className="font-semibold">{formatKRW(installment.secondPayment)}</div>
            </div>
          </div>
        </section>
        </PrintSection>
      )}

      {/* ─── 납세의무자 판정 (taxpayerInfo 입력 시에만) ─── */}
      {taxpayer && (
        <PrintSection id="taxpayer" selectedIds={selectedPrintIds}>
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            납세의무자 판정
          </h3>
          <TaxpayerSection taxpayer={taxpayer} />
          {/* ─── §107①2호 주택 건물·부속토지 분리 안분 표 (taxpayer leaf 내부 — 신규 print leaf 미추가) ─── */}
          {houseSplitDistribution && (
            <div className="space-y-1">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                주택 건물·부속토지 분리 안분 (지방세법 §107①2호)
              </h4>
              <HouseSplitDistributionTable distribution={houseSplitDistribution} />
            </div>
          )}
        </section>
        </PrintSection>
      )}

      {/* ─── 공유 지분 안분 (co_owner + 공유자 2인 이상 시에만) ─── */}
      {coOwnershipDistribution && (
        <PrintSection id="co-ownership" selectedIds={selectedPrintIds}>
        <section className="space-y-1">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            공유 지분별 세액 안분 (지방세법 §107①1호)
          </h3>
          <CoOwnershipTable
            distribution={coOwnershipDistribution}
            determinedTax={determinedTax}
            totalPayable={totalPayable}
          />
        </section>
        </PrintSection>
      )}

      {/* ─── 법령 근거 ─── */}
      {legalBasis.length > 0 && (
        <PrintSection id="legal-basis" selectedIds={selectedPrintIds}>
        <section>
          <LegalBasisDisclosure legalBasis={legalBasis} />
        </section>
        </PrintSection>
      )}
    </div>
  );
}
