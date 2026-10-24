"use client";

/**
 * 개별주택가격 미공시 취득 환산 상세 섹션 — 소득세법 시행령 §164⑦
 *
 * TransferTaxResultView에서 분리 (800줄 정책).
 */

import type { TransferTaxResult } from "@/lib/tax-engine/transfer-tax";
// 단건 결과·일괄 자산별 breakdown 양쪽에서 쓰이므로 **필요한 필드만** 요구한다.
type PhdSource = Pick<TransferTaxResult, "preHousingDisclosureDetail">;
import { Frac, FormulaText } from "@/components/calc/results/shared/FormulaParts";
import { phdConvertedPriceName } from "@/components/calc/results/transfer/phd-housing-term";

interface PhdRowProps {
  label: string;
  value: number;
  formula: React.ReactNode;
  highlight?: boolean;
}

function PhdRow({ label, value, formula, highlight }: PhdRowProps) {
  const fmt = (n: number) => n.toLocaleString();
  return (
    <div className="border-b border-blue-200/50 dark:border-blue-900/40 last:border-0 py-2">
      <div className="flex items-baseline justify-between gap-4">
        <span className={highlight
          ? "text-sm font-medium text-blue-900 dark:text-blue-200"
          : "text-sm text-muted-foreground"}>
          {label}
        </span>
        <span className={highlight
          ? "font-mono text-right font-bold text-blue-800 dark:text-blue-200 tabular-nums"
          : "font-mono text-right tabular-nums"}>
          {fmt(value)}
        </span>
      </div>
      <p className="mt-0.5 text-caption text-muted-foreground leading-relaxed"><FormulaText value={formula} /></p>
    </div>
  );
}

interface Props {
  result: PhdSource;
  /**
   * PHD 주택 종류가 공동주택인가 — 엔진 result에 없어 폼(`AssetForm.phdHousingType`)에서 읽어 내려온다.
   * 미전달·옛 이력은 «환산 개별주택가격»(종전 표기)이다.
   */
  phdApartment?: boolean;
  /** PR-F1: printScoped 제거(PrintSelectionPanel 통일) → optional. 미전달 시 자체 인쇄 버튼 숨김. */
  onPrint?: () => void;
}

export function PreHousingDisclosureDetailSection({ result, phdApartment, onPrint }: Props) {
  const phd = result.preHousingDisclosureDetail;
  if (!phd) return null;
  const i = phd.inputs;
  if (!i) return null;
  const fmt = (n: number) => n.toLocaleString();
  // §164⑦ 산식 결과의 이름 — 주택 종류별(단독·다가구 «환산 개별주택가격» / 공동주택 «환산 공동주택가격»)
  const convertedName = phdConvertedPriceName(phdApartment);
  /**
   * 개산공제 산식의 base·율은 **엔진 echo를 그대로** 쓴다 (결과탭 코드리뷰 #053).
   * 종전에는 지분 100% 스케일 `landHousingAtAcquisition`에 「× 3%」를 고정 표기해,
   * 공유지분 1/2이면 표시값의 **2배**, 미등기(§163⑥1호·2호 단서 0.3%)면 **10배**가 나왔다 —
   * 산식이 자기 값을 유도하지 못했다.
   */
  const dedRatePct = `${(phd.estimatedDeductionRate * 100).toFixed(1).replace(/\.0$/, "")}%`;
  const dedBaseLabel =
    phd.landLumpDeductionBase < phd.landHousingAtAcquisition ? " (지분 반영)" : "";

  return (
    <div data-print-section="phd" className="rounded-lg border border-blue-500/50 bg-blue-50/40 dark:bg-blue-950/20 p-4 space-y-1">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-semibold text-blue-900 dark:text-blue-200">
          {phdApartment ? "공동주택가격 미공시 취득 환산 (소득세법 시행령 §164⑦)" : "개별주택가격 미공시 취득 환산 (소득세법 시행령 §164⑦)"}
        </p>
        {onPrint && (
        <button
          type="button"
          onClick={onPrint}
          className="print:hidden shrink-0 rounded-md border border-blue-300 px-2.5 py-1 text-xs font-medium hover:bg-blue-100 transition-colors text-blue-700 dark:border-blue-700 dark:text-blue-300 dark:hover:bg-blue-900/50"
        >
          🖨️ PDF
        </button>
        )}
      </div>

      {/* 1. 시점별 기준시가 합계 */}
      <PhdRow
        label="취득시 기준시가 합계"
        value={phd.sumAtAcquisition}
        formula={`토지기준시가(${fmt(i.landPricePerSqmAtAcquisition)}/㎡ × ${fmt(i.landArea)}㎡) + 건물기준시가(${fmt(i.buildingStdPriceAtAcquisition)})`}
      />
      <PhdRow
        label="최초공시일 기준시가 합계"
        value={phd.sumAtFirstDisclosure}
        formula={`토지기준시가(${fmt(i.landPricePerSqmAtFirstDisclosure)}/㎡ × ${fmt(i.landArea)}㎡) + 건물기준시가(${fmt(i.buildingStdPriceAtFirstDisclosure)})`}
      />
      <PhdRow
        label="양도시 기준시가 합계"
        value={phd.sumAtTransfer}
        formula={`토지기준시가(${fmt(i.landPricePerSqmAtTransfer)}/㎡ × ${fmt(i.landArea)}㎡) + 건물기준시가(${fmt(i.buildingStdPriceAtTransfer)})`}
      />

      {/* 2. 환산 개별주택가격 / 환산 공동주택가격 (§164⑦ 산식) */}
      <PhdRow
        label={`${convertedName} (취득시)`}
        value={phd.estimatedHousingPriceAtAcquisition}
        highlight
        formula={
          <>
            최초 고시 주택가격 {fmt(i.firstDisclosureHousingPrice)} ×{" "}
            <Frac
              top={`취득시 합계 ${fmt(phd.sumAtAcquisition)}`}
              bottom={`최초공시일 합계 ${fmt(phd.sumAtFirstDisclosure)}`}
            />
          </>
        }
      />

      {/* 3. 총 환산취득가 */}
      <PhdRow
        label="총 환산취득가"
        value={phd.totalEstimatedAcquisitionPrice}
        formula={
          <>
            양도가액 {fmt(i.totalTransferPrice)} ×{" "}
            <Frac
              top={`${convertedName} ${fmt(phd.estimatedHousingPriceAtAcquisition)}`}
              bottom={`양도시 주택가격 ${fmt(i.transferHousingPrice)}`}
            />
          </>
        }
      />

      {/* 4. 양도가액 분리 */}
      <div className="pt-2 mt-2 border-t border-border">
        <p className="text-caption font-medium text-muted-foreground mb-1">
          양도가액 분리 (양도시 기준시가 비율 적용)
        </p>
        <PhdRow
          label="양도시 토지 주택가격 성분"
          value={phd.landHousingAtTransfer}
          formula={
            <>
              양도시 주택가격 {fmt(i.transferHousingPrice)} ×{" "}
              <Frac
                top={`양도시 토지기준시가 ${fmt(phd.landStdAtTransfer)}`}
                bottom={`양도시 합계 ${fmt(phd.sumAtTransfer)}`}
              />
            </>
          }
        />
        <PhdRow
          label="토지 양도가액"
          value={phd.landTransferPrice}
          highlight
          formula={
            <>
              양도가액 {fmt(i.totalTransferPrice)} ×{" "}
              <Frac
                top={`양도시 토지 성분 ${fmt(phd.landHousingAtTransfer)}`}
                bottom={`양도시 주택가격 ${fmt(i.transferHousingPrice)}`}
              />
            </>
          }
        />
        <PhdRow
          label="건물 양도가액"
          value={phd.buildingTransferPrice}
          highlight
          formula={`양도가액(${fmt(i.totalTransferPrice)}) - 토지 양도가액(${fmt(phd.landTransferPrice)})`}
        />
      </div>

      {/* 5. 환산취득가 분리 */}
      <div className="pt-2 mt-2 border-t border-border">
        <p className="text-caption font-medium text-muted-foreground mb-1">
          환산취득가 분리 (취득시 토지·건물 기준시가 비율 적용)
        </p>
        <PhdRow
          label="취득시 토지 주택가격 성분"
          value={phd.landHousingAtAcquisition}
          formula={
            <>
              {convertedName} {fmt(phd.estimatedHousingPriceAtAcquisition)} ×{" "}
              <Frac
                top={`취득시 토지기준시가 ${fmt(phd.landStdAtAcquisition)}`}
                bottom={`취득시 합계 ${fmt(phd.sumAtAcquisition)}`}
              />
            </>
          }
        />
        <PhdRow
          label="취득시 건물 주택가격 성분"
          value={phd.buildingHousingAtAcquisition}
          formula={`${convertedName}(${fmt(phd.estimatedHousingPriceAtAcquisition)}) - 취득시 토지 성분(${fmt(phd.landHousingAtAcquisition)})`}
        />
        <PhdRow
          label="토지 환산취득가"
          value={phd.landAcquisitionPrice}
          highlight
          formula={
            <>
              총 환산취득가 {fmt(phd.totalEstimatedAcquisitionPrice)} ×{" "}
              <Frac
                top={`취득시 토지 성분 ${fmt(phd.landHousingAtAcquisition)}`}
                bottom={`${convertedName} ${fmt(phd.estimatedHousingPriceAtAcquisition)}`}
              />
            </>
          }
        />
        <PhdRow
          label="건물 환산취득가"
          value={phd.buildingAcquisitionPrice}
          highlight
          formula={`총 환산취득가(${fmt(phd.totalEstimatedAcquisitionPrice)}) - 토지 환산취득가(${fmt(phd.landAcquisitionPrice)})`}
        />
      </div>

      {/* 6. 개산공제 */}
      <div className="pt-2 mt-2 border-t border-border">
        <p className="text-caption font-medium text-muted-foreground mb-1">
          개산공제 (소득세법 시행령 §163 ⑥)
        </p>
        <PhdRow
          label="토지 개산공제"
          value={phd.landLumpDeduction}
          highlight
          formula={`취득시 토지 성분${dedBaseLabel}(${fmt(phd.landLumpDeductionBase)}) × ${dedRatePct}`}
        />
        <PhdRow
          label="건물 개산공제"
          value={phd.buildingLumpDeduction}
          highlight
          formula={`취득시 건물 성분${dedBaseLabel}(${fmt(phd.buildingLumpDeductionBase)}) × ${dedRatePct}`}
        />
      </div>
    </div>
  );
}
