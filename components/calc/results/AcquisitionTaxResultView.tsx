"use client";

/**
 * 취득세 계산 결과 표시 컴포넌트 (P5UI-6 확장)
 *
 * - 신고기한 D-day 카운터
 * - 중과 흐름도 (SurchargeFlowDiagram)
 * - 주택 수 검산기 (HouseCountVerifier)
 * - 보유 주택 수별 시뮬레이션 표 (RateScenarioTable)
 * - 세율특례·법인 중과·자경농지 감면 상세
 * - surchargeDetail 5개 UI 요소:
 *   ① 일시적 2주택 처분기한 카드 (temporaryTwoHouseDeadlineDate)
 *   ② 조정지역 지정 전 계약 보호 배지 (preRegulationContractApplied)
 *   ③ 무상취득 단서 배제 사유 배지 (giftExclusionReason)
 *   ④ 중과 배제 사유 목록 (surchargeExceptions)
 *   ⑤ 실효 주택 수 (effectiveHouseCount)
 */

import { useState, useMemo } from "react";
import { differenceInDays, parseISO } from "date-fns";
import type { AcquisitionTaxResult } from "@/lib/tax-engine/types/acquisition.types";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { SurchargeFlowDiagram } from "./acquisition/SurchargeFlowDiagram";
import { HouseCountVerifier } from "./acquisition/HouseCountVerifier";
import { RateScenarioTable } from "./acquisition/RateScenarioTable";
import { LinearInterpolationGraph } from "./acquisition/LinearInterpolationGraph";
import { ReductionPossibilityPanel } from "./acquisition/ReductionPossibilityPanel";
import { DeemedAcquisitionResultCard } from "./acquisition/DeemedAcquisitionResultCard";
import { InstallmentResultCard } from "./acquisition/InstallmentResultCard";
import { PrintSelectionPanel } from "@/components/calc/results/PrintSelectionPanel";
import { PrintSection } from "@/components/calc/results/shared/PrintSection";
import { generateResultPdf } from "@/lib/pdf/generate-result-pdf";
import { formatIsoStamp } from "@/lib/utils/file-download";
import {
  ACQUISITION_PRINT_SECTIONS,
  type AcquisitionPrintSectionId,
} from "@/lib/print/acquisition-print-sections";

// ============================================================
// 포맷 유틸
// ============================================================

function formatKRW(amount: number): string {
  return amount.toLocaleString("ko-KR");
}

function formatRate(rate: number): string {
  return (rate * 100).toFixed(5).replace(/\.?0+$/, "") + "%";
}

// ============================================================
// D-day 카운터
// ============================================================

function FilingDeadlineCounter({ deadline }: { deadline: string }) {
  let dday: number;
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    dday = differenceInDays(parseISO(deadline), today);
  } catch {
    return null;
  }

  const isUrgent = dday >= 0 && dday <= 5;
  const isPast = dday < 0;

  return (
    <span className={`ml-2 text-xs font-bold px-1.5 py-0.5 rounded ${
      isPast
        ? "bg-destructive/20 text-destructive"
        : isUrgent
        ? "bg-red-100 text-red-700 animate-pulse"
        : "bg-green-100 text-green-700"
    }`}>
      {isPast ? `D+${Math.abs(dday)} 기한 초과` : dday === 0 ? "D-day" : `D-${dday}`}
    </span>
  );
}

// ============================================================
// 세목 행
// ============================================================

function TaxRow({
  label,
  amount,
  highlight = false,
  sub = false,
}: {
  label: string;
  amount: number;
  highlight?: boolean;
  sub?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between py-2 ${
      highlight
        ? "border-t-2 border-foreground font-bold text-base"
        : sub
        ? "pl-4 text-sm text-muted-foreground"
        : "text-sm"
    }`}>
      <span>{label}</span>
      <span className={highlight ? "text-primary" : ""}>{formatKRW(amount)}</span>
    </div>
  );
}

// ============================================================
// 세율특례 상세 카드
// ============================================================

function SpecialRateDetailCard({ detail }: { detail: NonNullable<AcquisitionTaxResult["specialRateDetail"]> }) {
  const specialTypeLabels: Record<string, string> = {
    redemption: "환매등기 병행 매매의 환매",
    inheritance_one_house: "상속 1가구1주택",
    corp_merger: "법인 적격합병",
    co_ownership_split: "공유물·합유물 분할",
    building_relocation: "건축물 이전",
    divorce_division: "이혼 재산분할",
    timber: "입목 취득(벌채용 원목)",
  };
  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50/30 p-3 text-sm">
      <p className="font-semibold text-violet-800 mb-1">세율특례 적용 (지방세법 §15①)</p>
      <div className="space-y-1 text-muted-foreground text-xs">
        <p>특례 사유: {specialTypeLabels[detail.type] ?? detail.type}</p>
        <p>특례 전 세율: {formatRate(detail.basicRate)} → 적용 세율: {formatRate(detail.appliedRate)}</p>
        <p>{detail.message}</p>
        <LawArticleModal legalBasis={detail.legalBasis} />
      </div>
    </div>
  );
}

// ============================================================
// 법인 중과 상세 카드
// ============================================================

function CorpSurchargeDetailCard({ detail }: { detail: NonNullable<AcquisitionTaxResult["corpSurchargeDetail"]> }) {
  return (
    <div className="rounded-lg border border-rose-200 bg-rose-50/30 p-3 text-sm">
      <p className="font-semibold text-rose-800 mb-1">법인·공장 중과 적용</p>
      <div className="space-y-1 text-muted-foreground text-xs">
        <p>중과 유형: {detail.surchargeType}</p>
        <p>기본세율 {formatRate(detail.basicRate)} → 중과세율 {formatRate(detail.surchargeRate)}</p>
        <p>{detail.reason}</p>
        {detail.legalBasis.map((b, i) => (
          <LawArticleModal key={i} legalBasis={b} />
        ))}
      </div>
    </div>
  );
}

// ============================================================
// 자경농지 감면 상세 카드
// ============================================================

function SelfCultivationDetailCard({ detail }: { detail: NonNullable<AcquisitionTaxResult["selfCultivationReductionDetail"]> }) {
  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50/30 p-3 text-sm">
      <p className="font-semibold text-violet-800 mb-1">자경농지 감면 (지특법 §6)</p>
      <div className="space-y-1 text-muted-foreground text-xs">
        {detail.isEligible ? (
          <p>감면액: {formatKRW(detail.reductionAmount)} (50% 감면)</p>
        ) : (
          <>
            <p className="text-amber-700">요건 미충족 — 감면 미적용</p>
            {detail.ineligibleReasons?.map((r, i) => (
              <p key={i}>• {r}</p>
            ))}
          </>
        )}
        {detail.warnings.map((w, i) => (
          <p key={i} className="text-amber-600">• {w}</p>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// 부가세 상세 카드
// ============================================================

function AdditionalTaxDetailCard({ detail, acquisitionTax }: {
  detail: NonNullable<AcquisitionTaxResult["additionalTaxDetail"]>;
  acquisitionTax: number;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/10 p-3 text-sm">
      <p className="font-semibold text-muted-foreground mb-2 text-xs">부가세 산출 상세</p>
      <div className="space-y-1 text-xs text-muted-foreground">
        <div className="flex justify-between">
          <span>농어촌특별세</span>
          <span>{formatKRW(detail.ruralSpecialTax)}</span>
        </div>
        {detail.isRuralExemption && (
          <p className="text-green-700 pl-2">읍·면 지역 100㎡ 이하 — 면제</p>
        )}
        <div className="flex justify-between">
          <span>지방교육세</span>
          <span>{formatKRW(detail.localEducationTax)}</span>
        </div>
        <p className="pl-2">
          {detail.isHousingPurchaseEduRule
            ? `주택 유상거래: 본세 ${formatKRW(acquisitionTax)} × 50% × 20%`
            : "과세표준 × 표준세율 × 20%"}
        </p>
      </div>
    </div>
  );
}

// ============================================================
// ① 일시적 2주택 처분기한 카드
// ============================================================

function TemporaryTwoHouseDeadlineCard({
  deadlineDate,
  deadlineYears,
}: {
  deadlineDate: string;
  deadlineYears?: 1 | 2 | 3;
}) {
  let deadline: Date;
  try {
    deadline = parseISO(deadlineDate);
  } catch {
    return null;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysLeft = differenceInDays(deadline, today);
  const isExpired = daysLeft < 0;
  const isUrgent = !isExpired && daysLeft <= 5;

  return (
    <div className="rounded-lg border border-sky-200 bg-sky-50 p-4">
      <p className="text-sm font-semibold text-sky-800 mb-2">
        일시적 2주택 — 처분 기한 안내
      </p>
      <p className="text-sm text-sky-700">
        종전 주택을{" "}
        <strong>{deadline.toLocaleDateString("ko-KR")}까지</strong> 처분하면
        취득세 중과가 적용되지 않습니다
        {deadlineYears !== undefined && ` (처분기한: ${deadlineYears}년)`}.
      </p>
      <p className={`text-xs mt-2 font-medium ${
        isExpired
          ? "text-destructive"
          : isUrgent
          ? "text-red-600"
          : "text-sky-600"
      }`}>
        {isExpired
          ? `처분기한 경과 (${Math.abs(daysLeft)}일 초과)`
          : daysLeft === 0
          ? "오늘이 처분기한입니다"
          : `D-${daysLeft}`}
      </p>
    </div>
  );
}

// ============================================================
// ② 조정지역 지정 전 계약 보호 배지
// ============================================================

function PreRegulationContractBadge() {
  return (
    <span className="inline-flex items-center rounded-full border border-emerald-400 px-2 py-0.5 text-xs text-emerald-700 font-medium">
      §13의2④ 지정 전 계약 — 비조정지역 간주 적용
    </span>
  );
}

// ============================================================
// ③ 무상취득 단서 배제 사유 배지
// ============================================================

const GIFT_EXCLUSION_REASON_LABELS: Record<string, string> = {
  one_house_household: "1세대 1주택자 무상취득 단서 적용 (시행령 §28의6②)",
  divorce_division: "이혼 재산분할 세율특례 적용 (§15①6)",
};

function GiftExclusionReasonBadge({ reason }: { reason: string }) {
  const label = GIFT_EXCLUSION_REASON_LABELS[reason] ?? reason;
  return (
    <span className="inline-flex items-center rounded-full bg-violet-100 px-2.5 py-0.5 text-xs text-violet-800 font-medium">
      {label}
    </span>
  );
}

// ============================================================
// ④ 중과 배제 사유 목록
// ============================================================

function SurchargeExceptionsList({ exceptions }: { exceptions: string[] }) {
  if (exceptions.length === 0) return null;
  return (
    <div className="text-sm">
      <p className="font-medium text-foreground mb-1">중과 배제 적용 항목</p>
      <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground">
        {exceptions.map((reason, i) => (
          <li key={i}>{reason}</li>
        ))}
      </ul>
    </div>
  );
}

// ============================================================
// ⑤ 실효 주택 수 인라인 표시 (헬퍼 함수)
// ============================================================

function EffectiveHouseCountBadge({ count }: { count: number }) {
  return (
    <span className="text-sm text-muted-foreground">
      산정 주택 수: <strong className="text-foreground">{count}채</strong>
    </span>
  );
}

// ============================================================
// 메인 결과 컴포넌트
// ============================================================

interface Props {
  result: AcquisitionTaxResult;
  /** 원본 폼 데이터 (시뮬레이션 표용) */
  isRegulatedArea?: boolean;
  isCorporation?: boolean;
  /** 해당 단계로 이동 (감면 가능성 패널 클릭용) */
  onGoToStep?: (step: number) => void;
  /** 연부취득 폼 회차 데이터 (엔진 결과에 amount 없을 경우 보충용) */
  installmentRows?: Array<{
    label?: string;
    paymentDate: string;
    amount: string;
  }>;
  /** 저장된 계산 id — 서버 PDF 선택 출력(PR-C)용. 미저장/비로그인 시 undefined */
  savedId?: string;
}

export function AcquisitionTaxResultView({ result, isRegulatedArea = false, isCorporation = false, onGoToStep, installmentRows }: Props) {
  const [showSteps, setShowSteps] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [selectedPrintIds, setSelectedPrintIds] = useState<Set<string>>(
    () => new Set()
  );

  // 간주취득 판정 — deemedDetail 존재 여부 또는 acquisitionCause 기준
  const isDeemedAcquisition = result.deemedDetail !== undefined ||
    ["deemed_major_shareholder", "deemed_land_category", "deemed_renovation"].includes(result.acquisitionCause);

  // 선택 항목 PDF 다운로드 — 클라이언트 react-pdf 생성 (로컬 result 기준).
  async function handlePrintPdf(pdfSections: string[]) {
    if (pdfSections.length === 0) return;
    setPdfBusy(true);
    try {
      await generateResultPdf({
        taxType: "acquisition",
        taxTypeLabel: "취득세",
        resultData: result as unknown as Record<string, unknown>,
        selectedSectionIds: pdfSections,
        filename: `취득세_계산결과_${formatIsoStamp()}.pdf`,
      });
    } catch {
      alert("PDF 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setPdfBusy(false);
    }
  }

  // 현재 결과뷰에 실제 렌더되는 leaf id (각 섹션 렌더 가드와 1:1 — 설계 §2.2)
  const availablePrintIds = useMemo<Set<AcquisitionPrintSectionId>>(() => {
    const s = new Set<AcquisitionPrintSectionId>();
    if (isDeemedAcquisition) s.add("deemed-acquisition");
    s.add("tax-info");
    s.add("tax-detail");
    if (result.additionalTaxDetail) s.add("surtax-detail");
    if (result.installmentFilingSchedule && result.installmentFilingSchedule.length > 0)
      s.add("installment");
    if (!isDeemedAcquisition) s.add("reduction-panel");
    if (
      !isDeemedAcquisition ||
      result.specialRateDetail ||
      result.corpSurchargeDetail ||
      result.selfCultivationReductionDetail
    )
      s.add("surcharge-detail");
    if (!isDeemedAcquisition) s.add("house-count");
    if (result.steps.length > 0) s.add("steps");
    if (result.warnings.length > 0) s.add("warnings");
    if (result.legalBasis.length > 0) s.add("legal-basis");
    return s;
  }, [result, isDeemedAcquisition]);

  if (result.isExempt) {
    return (
      <div className="rounded-lg border bg-muted/50 p-4 text-center">
        <p className="text-lg font-semibold">비과세</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {result.exemptionType === "government_acquisition" && "국가·지방자치단체 취득 — 취득세 비과세 (지방세법 §9①1)"}
          {result.exemptionType === "trust_return" && "신탁 위탁자 반환 — 취득세 비과세 (지방세법 §9①2)"}
          {result.exemptionType === "cemetery" && "묘지 취득 — 취득세 비과세 (지방세법 §9①3)"}
          {result.exemptionType === "religious_nonprofit" && "종교·비영리 법인 용도 취득 — 취득세 비과세 (지방세법 §9①4)"}
          {result.exemptionType === "temporary_building" && "임시건축물 취득 — 취득세 비과세 (지방세법 §9①5)"}
          {result.exemptionType === "self_cultivated_farmland" && "자경농지 취득 — 취득세 비과세 (지방세법 §9①6)"}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 출력 항목 선택 패널 (선택 항목만 인쇄·PDF) */}
      <PrintSelectionPanel
        allGroups={ACQUISITION_PRINT_SECTIONS}
        selectedIds={selectedPrintIds}
        availableIds={availablePrintIds}
        onChange={setSelectedPrintIds}
        onPrintPdf={handlePrintPdf}
        pdfReady={true}
        pdfBusy={pdfBusy}
      />

      {/* 간주취득 결과 카드 — 최상단 (요약 카드 직전) */}
      {isDeemedAcquisition && (
        <PrintSection id="deemed-acquisition" selectedIds={selectedPrintIds}>
          <DeemedAcquisitionResultCard result={result} />
        </PrintSection>
      )}

      {/* 과세 정보 요약 */}
      <PrintSection id="tax-info" selectedIds={selectedPrintIds}>
      <div className="rounded-lg border bg-muted/30 p-4">
        <h3 className="mb-3 text-sm font-semibold text-muted-foreground">과세 정보</h3>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <span className="text-muted-foreground">과세표준</span>
            <p className="font-medium">{formatKRW(result.taxBase)}</p>
          </div>
          <div>
            <span className="text-muted-foreground">적용세율</span>
            <p className="font-medium">
              {formatRate(result.appliedRate)}
              {result.isSurcharged && (
                <span className="ml-1 text-xs text-destructive font-normal">중과</span>
              )}
            </p>
          </div>
          <div>
            <span className="text-muted-foreground">취득일</span>
            <p className="font-medium">{result.acquisitionDate}</p>
          </div>
          <div>
            <span className="text-muted-foreground">신고 기한</span>
            <p className="font-medium">
              {result.filingDeadline}
              <FilingDeadlineCounter deadline={result.filingDeadline} />
            </p>
          </div>
        </div>

        {/* ② 조정지역 지정 전 계약 보호 배지 */}
        {result.surchargeDetail?.preRegulationContractApplied === true && (
          <div className="mt-2">
            <PreRegulationContractBadge />
          </div>
        )}

        {/* ③ 무상취득 단서 배제 사유 배지 */}
        {result.surchargeDetail?.giftExclusionReason && (
          <div className="mt-2">
            <GiftExclusionReasonBadge reason={result.surchargeDetail.giftExclusionReason} />
          </div>
        )}
      </div>
      </PrintSection>

      {/* 세액 상세 */}
      <PrintSection id="tax-detail" selectedIds={selectedPrintIds}>
      <div className="rounded-lg border p-4">
        <h3 className="mb-3 text-sm font-semibold text-muted-foreground">세액 명세</h3>

        {/* 부담부증여 분리 내역 */}
        {result.burdenedGiftBreakdown && (
          <div className="mb-3 rounded bg-muted/30 p-3 text-sm">
            <p className="mb-2 font-medium text-muted-foreground">부담부증여 분리 계산</p>
            <TaxRow
              label={`유상분 과세표준 (채무 ${formatKRW(result.burdenedGiftBreakdown.onerousTaxBase)})`}
              amount={result.burdenedGiftBreakdown.onerousTax}
              sub
            />
            <TaxRow
              label={`무상분 과세표준 (증여 ${formatKRW(result.burdenedGiftBreakdown.gratuitousTaxBase)})`}
              amount={result.burdenedGiftBreakdown.gratuitousTax}
              sub
            />
          </div>
        )}

        <TaxRow label="취득세 본세" amount={result.acquisitionTax} />
        <TaxRow label="농어촌특별세" amount={result.ruralSpecialTax} sub />
        <TaxRow label="지방교육세" amount={result.localEducationTax} sub />

        <div className="my-2 border-t" />
        <TaxRow label="납부세액 합계" amount={result.totalTax} />

        {result.reductionAmount > 0 && (
          <>
            <TaxRow
              label={`${result.reductionType === "first_home" ? "생애최초" : "자경농지"} 감면 (-)`}
              amount={result.reductionAmount}
              sub
            />
            <TaxRow
              label="감면 후 최종 납부세액"
              amount={result.totalTaxAfterReduction}
              highlight
            />
          </>
        )}

        {result.reductionAmount === 0 && (
          <div className="mt-2 flex items-center justify-between border-t-2 border-foreground pt-2 font-bold">
            <span>최종 납부세액</span>
            <span className="text-primary text-lg">{formatKRW(result.totalTaxAfterReduction)}</span>
          </div>
        )}
      </div>
      </PrintSection>

      {/* 부가세 상세 */}
      {result.additionalTaxDetail && (
        <PrintSection id="surtax-detail" selectedIds={selectedPrintIds}>
          <AdditionalTaxDetailCard
            detail={result.additionalTaxDetail}
            acquisitionTax={result.acquisitionTax}
          />
        </PrintSection>
      )}

      {/* 연부취득 신고 일정 카드 */}
      {result.installmentFilingSchedule && result.installmentFilingSchedule.length > 0 && (
        <PrintSection id="installment" selectedIds={selectedPrintIds}>
          <InstallmentResultCard
            installmentFilingSchedule={result.installmentFilingSchedule}
            acquisitionTax={result.acquisitionTax}
            isSurcharged={result.isSurcharged}
            installmentRows={installmentRows}
          />
        </PrintSection>
      )}

      {/* 감면·세율 분석 (선형보간 그래프 + 감면 가능성) — 간주취득 시 숨김 */}
      {!isDeemedAcquisition && (
        <PrintSection id="reduction-panel" selectedIds={selectedPrintIds} className="space-y-4">
          {result.rateType === "linear_interpolation" && (
            <LinearInterpolationGraph
              acquisitionValue={result.acquisitionValue}
              appliedRate={result.appliedRate}
            />
          )}
          <ReductionPossibilityPanel result={result} onGoToStep={onGoToStep} />
        </PrintSection>
      )}

      {/* 중과·특례 상세 (중과 사유·배제·흐름도·일시적2주택·세율특례·법인중과·자경농지) */}
      <PrintSection id="surcharge-detail" selectedIds={selectedPrintIds} className="space-y-4">
      {/* 중과 사유 */}
      {result.isSurcharged && result.surchargeReason && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-2">
          <p className="text-sm font-medium text-destructive">중과세 적용</p>
          <p className="text-xs text-muted-foreground">{result.surchargeReason}</p>
        </div>
      )}

      {/* ④ 중과 배제 사유 목록 — 간주취득 시 숨김 */}
      {!isDeemedAcquisition && result.surchargeDetail?.surchargeExceptions &&
        result.surchargeDetail.surchargeExceptions.length > 0 && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3">
          <SurchargeExceptionsList exceptions={result.surchargeDetail.surchargeExceptions} />
        </div>
      )}

      {/* 중과 흐름도 — 간주취득 시 숨김 */}
      {!isDeemedAcquisition && <SurchargeFlowDiagram result={result} />}

      {/* ① 일시적 2주택 처분기한 카드 — 간주취득 시 숨김 */}
      {!isDeemedAcquisition && result.surchargeDetail?.temporaryTwoHouseDeadlineDate && (
        <TemporaryTwoHouseDeadlineCard
          deadlineDate={result.surchargeDetail.temporaryTwoHouseDeadlineDate}
          deadlineYears={result.surchargeDetail.temporaryTwoHouseDeadlineYears}
        />
      )}

      {/* 세율특례 상세 */}
      {result.specialRateDetail && <SpecialRateDetailCard detail={result.specialRateDetail} />}

      {/* 법인 중과 상세 */}
      {result.corpSurchargeDetail && <CorpSurchargeDetailCard detail={result.corpSurchargeDetail} />}

      {/* 자경농지 감면 상세 */}
      {result.selfCultivationReductionDetail && (
        <SelfCultivationDetailCard detail={result.selfCultivationReductionDetail} />
      )}
      </PrintSection>

      {/* 실효 주택 수·검산·시뮬레이션 — 간주취득 시 숨김 */}
      {!isDeemedAcquisition && (
        <PrintSection id="house-count" selectedIds={selectedPrintIds} className="space-y-4">
          {result.surchargeDetail?.effectiveHouseCount !== undefined && (
            <div className="rounded-lg border border-border bg-muted/20 px-4 py-2 flex items-center justify-between">
              <EffectiveHouseCountBadge count={result.surchargeDetail.effectiveHouseCount} />
            </div>
          )}
          <HouseCountVerifier result={result} />
          <RateScenarioTable
            result={result}
            isRegulatedArea={isRegulatedArea}
            isCorporation={isCorporation}
            acquisitionValue={result.acquisitionValue}
          />
        </PrintSection>
      )}

      {/* 경고 메시지 */}
      {result.warnings.length > 0 && (
        <PrintSection id="warnings" selectedIds={selectedPrintIds}>
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-800 dark:bg-yellow-950">
          <p className="mb-1 text-sm font-medium text-yellow-800 dark:text-yellow-200">
            유의사항
          </p>
          <ul className="space-y-1">
            {result.warnings.map((w, i) => (
              <li key={i} className="text-xs text-yellow-700 dark:text-yellow-300">
                • {w}
              </li>
            ))}
          </ul>
        </div>
        </PrintSection>
      )}

      {/* 계산 과정 토글 */}
      {result.steps.length > 0 && (
        <PrintSection id="steps" selectedIds={selectedPrintIds} className="space-y-2">
          <button
            type="button"
            onClick={() => setShowSteps((v) => !v)}
            className="w-full flex items-center justify-between rounded-lg border border-border px-4 py-3 text-sm font-medium hover:bg-muted/40 transition-colors"
          >
            <span>계산 과정 상세 보기</span>
            <span className="text-muted-foreground">{showSteps ? "▲" : "▼"}</span>
          </button>

          {showSteps && (
            <div className="rounded-lg border border-border divide-y divide-border text-sm">
              {result.steps.map((step, i) => (
                <div key={i} className="px-4 py-3 flex justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-medium">{step.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{step.formula}</p>
                    {step.legalBasis && (
                      <LawArticleModal legalBasis={step.legalBasis} />
                    )}
                  </div>
                  <p className="font-mono font-medium shrink-0">
                    {step.amount < 0
                      ? `−${Math.abs(step.amount).toLocaleString("ko-KR")}`
                      : formatKRW(step.amount)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </PrintSection>
      )}

      {/* 법령 근거 */}
      {result.legalBasis.length > 0 && (
        <PrintSection id="legal-basis" selectedIds={selectedPrintIds}>
        <div className="text-xs text-muted-foreground flex flex-wrap gap-1 items-center">
          <span className="font-medium">적용 법령:</span>
          {result.legalBasis.filter(Boolean).map((b, i) => (
            <LawArticleModal key={i} legalBasis={b} />
          ))}
        </div>
        </PrintSection>
      )}
    </div>
  );
}
