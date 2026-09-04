/**
 * 세금 계산 결과 PDF 문서 컴포넌트
 * 6개 세금 유형(양도·상속·증여·취득·재산·종부세) 전용 섹션 + 입력 조건 요약 지원
 */
import {
  Document,
  Page,
  View,
  Text,
} from "@react-pdf/renderer";
import { type R, C, s, fmt, fmtRate, num, str, bool } from "./ResultPdfPrimitives";
import { InheritanceHeirAllocationSection } from "@/lib/pdf/sections/inheritance-heir-allocation-section";
import { InheritanceSelectedBesshiPages } from "@/lib/pdf/inheritance-besshi-pages";
import { GiftSelectedBesshiPages } from "@/lib/pdf/gift-besshi-pages";
import { BuildingStdReportPdfPages } from "@/lib/pdf/BuildingStdReportPdfPages";
import { buildBuildingStdReportsFromInput } from "@/lib/calc/building-std-pdf-data";
// ⑲ 세액감면대상금액은 조문별로 기준이 다르다(§77·§77의3 = 양도소득금액 전액 / §77의2 = 대토보상분 echo).
// 화면·신고서와 **같은 헬퍼**를 써야 값이 갈리지 않는다 — 순수 함수라 레이어 역행 없이 재사용한다
// (dual-truth 회피: memory `single-source-engine-helper`).
import type {
  Heir,
  InheritanceTaxResult,
} from "@/lib/tax-engine/types/inheritance-gift.types";

// ─── 공통 타입 ──────────────────────────────────────────────────
interface CalcStep {
  label: string;
  formula: string;
  amount: number;
  legalBasis?: string;
}

// result_data를 Record로 받아 각 세금 유형에 맞게 필드 접근

export interface ResultPdfProps {
  taxType: string;       // "transfer" | "acquisition" | "inheritance" | "gift" | "property" | "comprehensive_property"
  taxTypeLabel: string;
  createdAt: string;
  resultData: R;
  inputData?: R;
  /**
   * 선택 출력(상속세, PR-2). 지정 시 해당 leaf id만 PDF에 포함.
   * undefined(GET 하위호환)면 전체 렌더.
   * 현재 매핑: "tax-summary"→계산 내역 표, "heir-allocation-summary"→상속인별 집계.
   */
  selectedSectionIds?: string[];
}

// ─── 색상·스타일 ──────────────────────────────────────────────────


// ─── 헬퍼 ────────────────────────────────────────────────────────

// 세금 유형별 총 납부세액 필드 매핑
function getTotalTax(taxType: string, r: R): number | undefined {
  if (taxType === "transfer" || taxType === "transfer_multi") return num(r.totalTax);
  if (taxType === "acquisition") return num(r.totalTaxAfterReduction) ?? num(r.totalTax);
  if (taxType === "inheritance" || taxType === "gift") return num(r.finalTax) ?? num(r.totalTax);
  if (taxType === "property") return num(r.totalPayable) ?? num(r.totalTax);
  if (taxType === "comprehensive_property") return num(r.grandTotal) ?? num(r.totalTax);
  return num(r.totalTax);
}
// ─── 양도세 섹션 3종 — ResultPdfTransferSections.tsx로 분리 (800줄 정책) ───
import { TransferSection, TransferMultiSection } from "./ResultPdfTransferSections";


function AcquisitionSection({ r, selectedSectionIds }: { r: R; selectedSectionIds?: string[] }) {
  const isExempt = bool(r.isExempt);
  if (isExempt) return null;
  // tax-detail 대표 노드 — 선택 필터(POST) 적용 시 미포함이면 null (단일 계산표, 검토 U1)
  if (selectedSectionIds !== undefined && !selectedSectionIds.includes("tax-detail")) return null;
  return (
    <>
      <Text style={s.sectionTitle}>계산 내역</Text>
      <View style={s.table}>
        {num(r.acquisitionValue) !== undefined && (
          <View style={s.row}><Text style={s.lbl}>취득가액</Text><Text style={s.val}>{fmt(r.acquisitionValue)}</Text></View>
        )}
        {num(r.taxBase) !== undefined && (
          <View style={s.rowBg}><Text style={s.lbl}>과세표준</Text><Text style={s.valAccent}>{fmt(r.taxBase)}</Text></View>
        )}
        {num(r.appliedRate) !== undefined && (
          <View style={s.row}>
            <Text style={s.lbl}>적용 세율{bool(r.isSurcharged) ? " (중과)" : ""}</Text>
            <Text style={s.val}>{fmtRate(r.appliedRate)}</Text>
          </View>
        )}
        {num(r.acquisitionTax) !== undefined && (
          <View style={s.row}><Text style={s.lbl}>취득세 본세</Text><Text style={s.val}>{fmt(r.acquisitionTax)}</Text></View>
        )}
        {num(r.ruralSpecialTax) !== undefined && (r.ruralSpecialTax as number) > 0 && (
          <View style={s.row}><Text style={s.lbl}>농어촌특별세</Text><Text style={s.val}>{fmt(r.ruralSpecialTax)}</Text></View>
        )}
        {num(r.localEducationTax) !== undefined && (r.localEducationTax as number) > 0 && (
          <View style={s.row}><Text style={s.lbl}>지방교육세</Text><Text style={s.val}>{fmt(r.localEducationTax)}</Text></View>
        )}
        {num(r.totalTax) !== undefined && (
          <View style={s.rowBg}><Text style={s.lbl}>총 납부세액 (감면 전)</Text><Text style={s.valAccent}>{fmt(r.totalTax)}</Text></View>
        )}
        {num(r.reductionAmount) !== undefined && (r.reductionAmount as number) > 0 && (
          <View style={s.row}><Text style={s.lbl}>생애최초 감면</Text><Text style={s.val}>- {fmt(r.reductionAmount)}</Text></View>
        )}
        {num(r.totalTaxAfterReduction) !== undefined && (r.reductionAmount as number) > 0 && (
          <View style={s.rowLast}><Text style={s.lbl}>감면 후 납부세액</Text><Text style={s.val}>{fmt(r.totalTaxAfterReduction)}</Text></View>
        )}
      </View>
      {str(r.filingDeadline) && (
        <Text style={{ fontSize: 8, color: C.muted, marginTop: 3 }}>신고기한: {str(r.filingDeadline)}</Text>
      )}
    </>
  );
}

function InheritanceGiftSection({
  r,
  taxType,
  inputData,
  selectedSectionIds,
}: {
  r: R;
  taxType: string;
  inputData?: R;
  selectedSectionIds?: string[];
}) {
  const isInheritance = taxType === "inheritance";
  // 선택 필터 (상속세 PR-2·증여세 PR-B1). 미지정(전체 GET)이면 항상 렌더.
  // 증여세 pdf 채널은 tax-summary(계산표) 1종 — 별지는 PR-B2에서 승격.
  const filtered = selectedSectionIds !== undefined;
  const showSummary = !filtered || selectedSectionIds!.includes("tax-summary");
  const showHeirAllocation =
    !filtered || selectedSectionIds!.includes("heir-allocation-summary");
  return (
    <>
      {showSummary && (
      <>
      <Text style={s.sectionTitle}>계산 내역</Text>
      <View style={s.table}>
        {isInheritance && num(r.grossEstateValue) !== undefined && (
          <View style={s.row}><Text style={s.lbl}>상속재산가액</Text><Text style={s.val}>{fmt(r.grossEstateValue)}</Text></View>
        )}
        {!isInheritance && num(r.grossGiftValue) !== undefined && (
          <View style={s.row}><Text style={s.lbl}>증여재산가액</Text><Text style={s.val}>{fmt(r.grossGiftValue)}</Text></View>
        )}
        {!isInheritance && num(r.aggregatedGiftValue) !== undefined && (
          <View style={s.row}><Text style={s.lbl}>10년 합산 증여가액</Text><Text style={s.val}>{fmt(r.aggregatedGiftValue)}</Text></View>
        )}
        {isInheritance && num(r.exemptAmount) !== undefined && (r.exemptAmount as number) > 0 && (
          <View style={s.row}><Text style={s.lbl}>비과세 차감</Text><Text style={s.val}>- {fmt(r.exemptAmount)}</Text></View>
        )}
        {isInheritance && num(r.taxableEstateValue) !== undefined && (
          <View style={s.row}><Text style={s.lbl}>상속세 과세가액</Text><Text style={s.val}>{fmt(r.taxableEstateValue)}</Text></View>
        )}
        {num(r.totalDeduction) !== undefined && (
          <View style={s.row}><Text style={s.lbl}>{isInheritance ? "상속공제" : "증여재산공제"}</Text><Text style={s.val}>- {fmt(r.totalDeduction)}</Text></View>
        )}
        {num(r.taxBase) !== undefined && (
          <View style={s.rowBg}><Text style={s.lbl}>과세표준</Text><Text style={s.valAccent}>{fmt(r.taxBase)}</Text></View>
        )}
        {num(r.computedTax) !== undefined && (
          <View style={s.row}><Text style={s.lbl}>산출세액</Text><Text style={s.val}>{fmt(r.computedTax)}</Text></View>
        )}
        {num(r.generationSkipSurcharge) !== undefined && (r.generationSkipSurcharge as number) > 0 && (
          <View style={s.row}><Text style={s.lbl}>세대생략 할증</Text><Text style={s.val}>+ {fmt(r.generationSkipSurcharge)}</Text></View>
        )}
        {num(r.totalTaxCredit) !== undefined && (r.totalTaxCredit as number) > 0 && (
          <View style={s.row}><Text style={s.lbl}>세액공제</Text><Text style={s.val}>- {fmt(r.totalTaxCredit)}</Text></View>
        )}
        {num(r.finalTax) !== undefined && (
          <View style={s.rowLast}><Text style={s.lbl}>결정세액</Text><Text style={s.valAccent}>{fmt(r.finalTax)}</Text></View>
        )}
      </View>
      </>
      )}

      {/* Phase D: 상속인별 상속세부담액 집계 표 (이미지 8) — 상속세 한정·heirs 존재 시 */}
      {showHeirAllocation && isInheritance && r.heirAllocationResult && Array.isArray(inputData?.heirs) && (inputData!.heirs as unknown[]).length > 0 && (
        <InheritanceHeirAllocationSection
          result={r as unknown as InheritanceTaxResult}
          heirs={inputData!.heirs as unknown as Heir[]}
        />
      )}
    </>
  );
}

function PropertySection({ r, selectedSectionIds }: { r: R; selectedSectionIds?: string[] }) {
  // computed-tax 대표 노드 — 선택 필터(POST) 적용 시 미포함이면 null (단일 계산표, 검토 U1)
  if (selectedSectionIds !== undefined && !selectedSectionIds.includes("computed-tax")) return null;
  return (
    <>
      <Text style={s.sectionTitle}>계산 내역</Text>
      <View style={s.table}>
        {num(r.publishedPrice) !== undefined && (
          <View style={s.row}><Text style={s.lbl}>공시가격</Text><Text style={s.val}>{fmt(r.publishedPrice)}</Text></View>
        )}
        {num(r.fairMarketRatio) !== undefined && (
          <View style={s.row}><Text style={s.lbl}>공정시장가액비율</Text><Text style={s.val}>{fmtRate(r.fairMarketRatio)}</Text></View>
        )}
        {num(r.taxBase) !== undefined && (
          <View style={s.rowBg}><Text style={s.lbl}>과세표준</Text><Text style={s.valAccent}>{fmt(r.taxBase)}</Text></View>
        )}
        {num(r.appliedRate) !== undefined && (
          <View style={s.row}><Text style={s.lbl}>적용 세율</Text><Text style={s.val}>{num(r.appliedRate) === 0 ? "누진세율 (구간별)" : fmtRate(r.appliedRate)}</Text></View>
        )}
        {num(r.calculatedTax) !== undefined && (
          <View style={s.row}><Text style={s.lbl}>산출세액</Text><Text style={s.val}>{fmt(r.calculatedTax)}</Text></View>
        )}
        {num(r.determinedTax) !== undefined && (
          <View style={s.rowBg}><Text style={s.lbl}>확정세액</Text><Text style={s.valAccent}>{fmt(r.determinedTax)}</Text></View>
        )}
        {num(r.totalSurtax) !== undefined && (r.totalSurtax as number) > 0 && (
          <View style={s.row}><Text style={s.lbl}>부가세 합계</Text><Text style={s.val}>{fmt(r.totalSurtax)}</Text></View>
        )}
        {num(r.totalPayable) !== undefined && (
          <View style={s.rowLast}><Text style={s.lbl}>총 납부세액</Text><Text style={s.val}>{fmt(r.totalPayable)}</Text></View>
        )}
      </View>
      {bool(r.oneHouseSpecialApplied) && (
        <Text style={{ fontSize: 8, color: C.success, marginTop: 3 }}>1세대1주택 특례 적용됨</Text>
      )}
    </>
  );
}

function ComprehensiveSection({ r, selectedSectionIds }: { r: R; selectedSectionIds?: string[] }) {
  // housing-tax 대표 노드 — 선택 필터 적용 시 미포함이면 null (주택분 계산표만, 토지분 PDF 없음, 검토 U1)
  if (selectedSectionIds !== undefined && !selectedSectionIds.includes("housing-tax")) return null;
  return (
    <>
      <Text style={s.sectionTitle}>계산 내역 (주택분)</Text>
      <View style={s.table}>
        {num(r.includedAssessedValue) !== undefined && (
          <View style={s.row}><Text style={s.lbl}>과세 대상 공시가격 합계</Text><Text style={s.val}>{fmt(r.includedAssessedValue)}</Text></View>
        )}
        {num(r.basicDeduction) !== undefined && (
          <View style={s.row}><Text style={s.lbl}>기본공제</Text><Text style={s.val}>- {fmt(r.basicDeduction)}</Text></View>
        )}
        {num(r.fairMarketRatio) !== undefined && (
          <View style={s.row}><Text style={s.lbl}>공정시장가액비율</Text><Text style={s.val}>{fmtRate(r.fairMarketRatio)}</Text></View>
        )}
        {num(r.taxBase) !== undefined && (
          <View style={s.rowBg}><Text style={s.lbl}>과세표준</Text><Text style={s.valAccent}>{fmt(r.taxBase)}</Text></View>
        )}
        {num(r.appliedRate) !== undefined && (
          <View style={s.row}><Text style={s.lbl}>적용 세율</Text><Text style={s.val}>{num(r.appliedRate) === 0 ? "누진세율 (구간별)" : fmtRate(r.appliedRate)}</Text></View>
        )}
        {num(r.calculatedTax) !== undefined && (
          <View style={s.row}><Text style={s.lbl}>산출세액</Text><Text style={s.val}>{fmt(r.calculatedTax)}</Text></View>
        )}
        {num(r.determinedHousingTax) !== undefined && (
          <View style={s.rowBg}><Text style={s.lbl}>결정세액</Text><Text style={s.valAccent}>{fmt(r.determinedHousingTax)}</Text></View>
        )}
        {num(r.housingRuralSpecialTax) !== undefined && (r.housingRuralSpecialTax as number) > 0 && (
          <View style={s.row}><Text style={s.lbl}>농어촌특별세</Text><Text style={s.val}>{fmt(r.housingRuralSpecialTax)}</Text></View>
        )}
        {num(r.totalHousingTax) !== undefined && (
          <View style={s.rowLast}><Text style={s.lbl}>주택분 총납부세액</Text><Text style={s.val}>{fmt(r.totalHousingTax)}</Text></View>
        )}
      </View>
      {bool(r.isOneHouseOwner) && (
        <Text style={{ fontSize: 8, color: C.success, marginTop: 3 }}>1세대1주택자 세액공제 적용됨</Text>
      )}
    </>
  );
}

// 입력 조건 요약 — 핵심 키만 표시
const INPUT_FIELD_LABELS: Record<string, Record<string, string>> = {
  transfer: {
    transferPrice: "양도가액",
    acquisitionPrice: "취득가액",
    holdingYears: "보유기간(년)",
    residenceYears: "거주기간(년)",
    propertyType: "자산 유형",
    isAdjustedArea: "조정대상지역",
  },
  acquisition: {
    acquisitionPrice: "취득가액",
    propertyType: "물건 종류",
    acquisitionCause: "취득 원인",
    isFirstHome: "생애최초",
    isAdjustedArea: "조정대상지역",
  },
  inheritance: {
    totalPropertyValue: "상속재산 총액",
    numberOfHeirs: "상속인 수",
    spouseInherits: "배우자 상속",
  },
  gift: {
    propertyValue: "증여재산가액",
    donorRelation: "증여자 관계",
    isGenerationSkip: "세대생략 여부",
  },
  property: {
    officialPrice: "공시가격",
    propertyType: "과세 유형",
    isOneHousehold: "1세대1주택",
  },
  comprehensive_property: {
    officialPrice: "공시가격",
    isOneHouseOwner: "1세대1주택",
    numberOfHouses: "주택 수",
  },
};

function InputSection({ taxType, inputData }: { taxType: string; inputData: R }) {
  const fields = INPUT_FIELD_LABELS[taxType] ?? {};
  const entries = Object.entries(fields)
    .map(([key, label]) => {
      const v = inputData[key];
      if (v === undefined || v === null) return null;
      let display: string;
      if (typeof v === "boolean") display = v ? "예" : "아니오";
      else if (typeof v === "number") display = key.toLowerCase().includes("price") || key.toLowerCase().includes("value") ? fmt(v) : String(v);
      else display = String(v);
      return { label, display };
    })
    .filter(Boolean) as { label: string; display: string }[];

  if (entries.length === 0) return null;

  return (
    <>
      <Text style={s.sectionTitle}>입력 조건 요약</Text>
      <View style={[s.table, { marginBottom: 6 }]}>
        <View style={s.inputGrid}>
          {entries.map(({ label, display }, i) => (
            <View key={i} style={s.inputItem}>
              <Text style={s.inputKey}>{label}</Text>
              <Text style={s.inputVal}>{display}</Text>
            </View>
          ))}
        </View>
      </View>
    </>
  );
}

// ─── 메인 PDF 문서 ────────────────────────────────────────────────
export function ResultPdfDocument({
  taxType,
  taxTypeLabel,
  createdAt,
  resultData: r,
  inputData,
  selectedSectionIds,
}: ResultPdfProps) {
  const isExempt = bool(r.isExempt);
  const totalTax = getTotalTax(taxType, r);
  const steps = Array.isArray(r.steps) ? (r.steps as CalcStep[])
    : Array.isArray(r.breakdown) ? (r.breakdown as CalcStep[])
    : [];
  const determinedTax = num(r.determinedTax);
  const localIncomeTax = num(r.localIncomeTax);

  return (
    <Document title={`${taxTypeLabel} 계산 결과`} author="KoreanTaxCalc">
      <Page size="A4" style={s.page}>

        {/* 헤더 */}
        <View style={s.header}>
          <View style={s.headerRow}>
            <Text style={s.appName}>KoreanTaxCalc</Text>
            <Text style={s.headerDate}>{createdAt} 생성</Text>
          </View>
          <Text style={s.headerTitle}>세금 계산 결과서</Text>
          <View style={s.badge}><Text style={s.badgeText}>{taxTypeLabel}</Text></View>
        </View>

        {/* 총 납부세액 카드 */}
        {isExempt ? (
          <View style={s.totalCardExempt}>
            <Text style={s.exemptTitle}>비과세</Text>
            <Text style={s.exemptSub}>{str(r.exemptReason) ?? "납부세액 0"}</Text>
          </View>
        ) : (
          <View style={s.totalCard}>
            <Text style={s.totalLabel}>총 납부세액</Text>
            <Text style={s.totalAmount}>{fmt(totalTax)}</Text>
            {determinedTax !== undefined && localIncomeTax !== undefined && (
              <View style={s.totalSub}>
                <Text style={s.totalSubText}>결정세액 {fmt(determinedTax)}</Text>
                <Text style={s.totalSubText}>지방소득세 {fmt(localIncomeTax)}</Text>
              </View>
            )}
          </View>
        )}

        {/* 입력 조건 요약 */}
        {inputData && <InputSection taxType={taxType} inputData={inputData} />}

        {/* 세금 유형별 상세 섹션 */}
        {taxType === "transfer" && <TransferSection r={r} selectedSectionIds={selectedSectionIds} />}
        {taxType === "transfer_multi" && <TransferMultiSection r={r} selectedSectionIds={selectedSectionIds} />}
        {taxType === "acquisition" && <AcquisitionSection r={r} selectedSectionIds={selectedSectionIds} />}
        {(taxType === "inheritance" || taxType === "gift") && <InheritanceGiftSection r={r} taxType={taxType} inputData={inputData} selectedSectionIds={selectedSectionIds} />}
        {taxType === "property" && <PropertySection r={r} selectedSectionIds={selectedSectionIds} />}
        {taxType === "comprehensive_property" && <ComprehensiveSection r={r} selectedSectionIds={selectedSectionIds} />}

        {/* 계산 단계 */}
        {steps.length > 0 && (
          <>
            <Text style={s.sectionTitle}>계산 단계</Text>
            <View style={s.stepsTable}>
              {steps.map((step, i) => (
                <View key={i} style={i === steps.length - 1 ? s.stepRowLast : s.stepRow}>
                  <View style={s.stepInfo}>
                    <Text style={s.stepLabel}>{step.label}</Text>
                    <Text style={s.stepFormula}>{step.formula}</Text>
                    {step.legalBasis && <Text style={s.stepLegal}>{step.legalBasis}</Text>}
                  </View>
                  <Text style={s.stepAmount}>{fmt(step.amount)}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* 면책 고지 */}
        <View style={s.disclaimer}>
          <Text style={s.disclaimerText}>
            ※ 이 계산서는 참고용이며 법적 효력이 없습니다. 실제 납부세액은 과세관청 신고 또는 전문 세무사 상담을 통해 확인하시기 바랍니다.
          </Text>
          <Text style={[s.disclaimerText, { marginTop: 2 }]}>
            ※ 세법 개정으로 인해 실제 세액과 다를 수 있습니다. 중요한 의사결정 전 반드시 전문가와 상의하시기 바랍니다.
          </Text>
        </View>

        <Text style={s.pageNumber} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} fixed />
      </Page>

      {/* 상속세 별지 선택 출력 (PR-3a/3b) — filing-form-9·부표2·부표3묶음·상장·비상장 */}
      {taxType === "inheritance" && (
        <InheritanceSelectedBesshiPages
          resultData={r}
          inputData={inputData}
          selectedSectionIds={selectedSectionIds}
        />
      )}

      {/* 증여세 별지 선택 출력 (PR-B2) — 별지10호·부표1·상장·비상장 */}
      {taxType === "gift" && (
        <GiftSelectedBesshiPages
          resultData={r}
          inputData={inputData}
          selectedSectionIds={selectedSectionIds}
        />
      )}

      {/* 건물 기준시가 계산서 — 양도(단건·다건)·상속·증여 공통(input_data 스냅샷 재유도).
          `transfer_multi`는 다건 결과뷰의 taxType이다 — 빠뜨리면 선택해도 PDF에 조용히 안 실린다. */}
      {(taxType === "transfer" || taxType === "transfer_multi" || taxType === "inheritance" || taxType === "gift") && (
        <BuildingStdReportPdfPages
          models={buildBuildingStdReportsFromInput(inputData)}
          selectedSectionIds={selectedSectionIds}
        />
      )}
    </Document>
  );
}
