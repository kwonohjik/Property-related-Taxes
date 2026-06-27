/**
 * besshi-buppyo-2-data — 별지 제9호서식 부표 2 「상속인별 상속재산 및 평가명세서」 데이터 어댑터
 *
 * 단일 진실 게이트웨이 (filing-form-9-data.ts 패턴): InheritanceTaxResult + 입력(heirs·estateItems·
 * priorGifts)만 읽어 상속인별 N장(가/나/계) 표시값을 산출. 엔진 변경 0, 자체 산식 최소(법정상속분
 * 도출·집계만). 화면(BesshiBuppyo2Section)·PDF가 이 결과만 소비 → dual-truth 0.
 *
 * Plan: docs/00-pm/inheritance-besshi-9-buppyo-2-property-valuation.plan.md
 * Design: docs/02-design/features/inheritance-besshi-9-buppyo-2-property-valuation.engine.design.md
 *
 * 근거: KoreanLaw MCP get_annexes (시행규칙 별지 제9호서식 부표 2, 개정 2024.3.22.)
 *   - 가. 상속인별 상속현황: 관계·성명·주민번호·주소·법정상속지분율·법정상속재산가액·실제상속지분율·실제상속재산가액
 *   - 나. 상속인별 상속재산명세: 재산구분코드·재산종류코드·소재지·국외여부·사업자번호(지분)·수량·단가·평가가액·평가기준코드
 *   - 계: 상속재산가액·추정상속재산 산입액·비과세 3종·과세가액불산입 3종·가산증여재산 3종·합계
 */

import type {
  InheritanceTaxResult,
  Heir,
  EstateItem,
  PriorGift,
  AssetCategory,
  PropertyValuationResult,
  EstatePropertyKindCode,
  ExemptionCheckedItem,
} from "@/lib/tax-engine/types/inheritance-gift.types";
import {
  computeLegalShares,
  distributeByLegalShares,
} from "@/lib/tax-engine/inheritance-legal-share";
import { scaleMapToTotal } from "@/lib/tax-engine/inheritance-allocation-deductions";
import { findExemptionRuleById } from "@/lib/tax-engine/exemption-rules";
import { sortHeirs, isStatutoryHeir } from "@/lib/calc/heir-allocation-summary";
import { HEIR_RELATION_TO_DECLARANT_LABEL } from "@/lib/calc/filing-form-9-data";
import {
  toEstateItemTypeCode,
  toEstateItemValuationMethodCode,
  inferEstateItemKindCode,
  inferPropertyKindCode,
  toPriorGiftPropertyTypeCode,
} from "@/components/calc/results/inheritance-filing-form-helpers";

/** locationOrName fallback용 — 자산명 미입력 시 내부 id 대신 한글 카테고리 라벨 (feedback_no_internal_id_in_result) */
const CATEGORY_LABEL_KO: Record<AssetCategory, string> = {
  real_estate_land: "토지",
  real_estate_building: "건물",
  real_estate_apartment: "아파트",
  listed_stock: "상장주식",
  unlisted_stock: "비상장주식",
  cash: "현금",
  financial: "금융재산",
  deposit: "전세보증금",
  superficies: "지상권",
  receivable: "채권",
  other: "기타재산",
};

/** 부표2 계 ⑲~㉔ 비과세·불산입 6항목 필드 키 */
type ExemptField =
  | "nonTaxableFarmland" // ⑲
  | "nonTaxablePublic" // ⑳
  | "nonTaxableOther" // ㉑
  | "exclusionPublicCorp" // ㉒
  | "exclusionPublicTrust" // ㉓
  | "exclusionOther"; // ㉔

/** 비과세/불산입 룰 id → 부표2 계 행 (exemption-rules.ts 룰 id 기준). 미등록은 treatment fallback. */
const EXEMPT_RULE_TO_FIELD: Record<string, ExemptField> = {
  inh_forest_burial: "nonTaxableFarmland", // 금양임야
  inh_grave_land: "nonTaxableFarmland", // 묘토
  inh_ritual_items: "nonTaxableFarmland", // 족보·제구
  inh_state_bequest: "nonTaxablePublic", // 국가·지자체·공공단체 유증 §12 1호
  inh_disaster_relief: "nonTaxableOther", // 이재구호금품 §12 6호
  inh_political_party: "nonTaxableOther", // 정당 유증 §12 4호
  inh_public_interest: "exclusionPublicCorp", // 공익법인 출연 §16
  inh_public_trust: "exclusionPublicTrust", // 공익신탁 §17
};

/** 룰 id → 부표2 필드. 미등록 룰은 taxTreatment(§12 vs §16·§17)로 기타행 fallback. */
function resolveExemptField(ruleId: string): ExemptField {
  const mapped = EXEMPT_RULE_TO_FIELD[ruleId];
  if (mapped) return mapped;
  const rule = findExemptionRuleById(ruleId);
  return rule?.taxTreatment === "not_included"
    ? "exclusionOther"
    : "nonTaxableOther";
}

/** 가. 상속인별 상속현황 */
export interface Buppyo2SectionA {
  relation: string;
  name: string;
  residentId?: string;
  address?: string;
  /** "3/7" 형태. legatee·corporate(법정상속분 없음) → null */
  legalShareLabel: string | null;
  /** 법정상속재산가액 (작성방법 #3 — 과세가액 base × 법정지분). 비대상 → null */
  legalShareAmount: number | null;
  /** 실제상속지분율 (0~1) = grossInheritance ÷ Σgross */
  actualShareRatio: number;
  /** 실제상속재산가액 = perHeir.grossInheritance */
  actualShareAmount: number;
}

/** 나. 상속인별 상속재산명세 행 (본래상속 + 사전증여 2원) */
export interface Buppyo2ItemRow {
  /** 재산구분코드 — 본래상속 A11/A12 · 사전증여 A21~A24 (그 외 코드는 본 양식 미사용) */
  kindCode: EstatePropertyKindCode;
  typeCode: string; // 01~14
  locationOrName: string;
  isOverseasAsset: boolean;
  overseasCountry?: string;
  /** 사업자등록번호(계좌번호,지분) — 부동산은 실제 상속지분 (작성방법 #6) */
  ownershipShareLabel?: string;
  quantityOrArea: number | null;
  unitPrice: number | null;
  valuatedAmount: number;
  valuationMethodCode: string; // 01~08
}

/** 계 (12행) */
export interface Buppyo2SectionTotal {
  grossEstateValue: number;
  presumedAmount: number;
  /** ⑲ 금양임야 등 가액 (§12 3호 — 금양임야·묘토·족보·제구) per-heir 인정 비과세액 */
  nonTaxableFarmland: number;
  /** ⑳ 공공단체 유증 (§12 1호) */
  nonTaxablePublic: number;
  /** ㉑ 기타 비과세 (§11 전사자·§12 이재구호·정당 유증 등) */
  nonTaxableOther: number;
  /** ㉒ 공익법인 출연재산 가액 (§16 과세가액 불산입) */
  exclusionPublicCorp: number;
  /** ㉓ 공익신탁 재산가액 (§17 과세가액 불산입) */
  exclusionPublicTrust: number;
  /** ㉔ 기타 과세가액 불산입 */
  exclusionOther: number;
  /** 가산증여재산 §13 (= A21 상속인 + A22 상속인 외) */
  priorGift13: number;
  /** 조특 §30의5 창업자금 (PriorGift 경로 없음 → 0) */
  priorGift30_5: number;
  /** 조특 §30의6 가업승계 (PriorGift 경로 없음 → 0) */
  priorGift30_6: number;
  total: number; // taxableValueShare
}

export interface Buppyo2HeirData {
  heirId: string;
  sectionA: Buppyo2SectionA;
  itemRows: Buppyo2ItemRow[];
  /** 2쪽 「상속인별 상속재산명세」 계 행 — ⑮평가가액 합계 (Σ itemRows.valuatedAmount). UI 무산술 */
  itemRowsTotal: number;
  sectionTotal: Buppyo2SectionTotal;
  /** 협의분할 미입력 자산이 법정상속분 fallback으로 계 합계에 반영됨 (안내 배지용) */
  usedLegalShareFallback: boolean;
}

/** 자산명 표시 — 내부 id 노출 금지 (feedback_no_internal_id_in_result) */
function estateLocationOrName(item: EstateItem): string {
  return item.name?.trim() || CATEGORY_LABEL_KO[item.category] || "재산";
}

/** 부동산 지분 라벨 — 작성방법 #6 (해당 상속인의 실제 상속지분). 부동산만, itemTotal 0 시 undefined */
function ownershipShareLabel(
  item: EstateItem,
  allocationAmount: number,
): string | undefined {
  if (
    item.category !== "real_estate_land" &&
    item.category !== "real_estate_building" &&
    item.category !== "real_estate_apartment"
  ) {
    return undefined;
  }
  const itemTotal = (item.heirAllocations ?? []).reduce((s, a) => s + a.amount, 0);
  if (itemTotal <= 0) return undefined;
  const pct = (allocationAmount / itemTotal) * 100;
  return `${parseFloat(pct.toFixed(2))}%`;
}

/**
 * 별지 제9호서식 부표 2 데이터 조립 — 상속인 N명 → N장.
 */
export function buildBuppyo2Data(
  result: InheritanceTaxResult,
  heirs: Heir[],
  estateItems: EstateItem[],
  priorGifts: PriorGift[],
  exemptions: ExemptionCheckedItem[] = [],
): Buppyo2HeirData[] {
  // 상속인만 — 비상속인(수유자·영리법인·isHeir===false)은 부표2 미작성 (시트·번호·⑦ 분모 모두 상속인 기준)
  const sorted = sortHeirs(heirs).filter(isStatutoryHeir);
  const perHeir = result.heirAllocationResult?.perHeir ?? {};
  const usedLegalShareFallback =
    result.heirAllocationResult?.usedLegalShareFallback ?? false;

  // 법정상속분 (legatee·corporate 제외)
  const legal = computeLegalShares(heirs);

  // ── 비과세·과세가액불산입 per-heir·6항목 분해 (⑲~㉔) ──────────────
  //   인정액 단일진실 = result.exemptionDetail.itemResults(exemptAmount), 룰 합산.
  //   per-heir 귀속 = exemptions.heirAllocations(있으면) → scaleMapToTotal, 없으면 법정상속분.
  const recognizedByRuleId = new Map<string, number>();
  for (const r of result.exemptionDetail?.itemResults ?? []) {
    recognizedByRuleId.set(
      r.ruleId,
      (recognizedByRuleId.get(r.ruleId) ?? 0) + r.exemptAmount,
    );
  }
  // heirId → (field → 금액)
  const exemptByHeir = new Map<string, Record<ExemptField, number>>();
  const addExempt = (heirId: string, field: ExemptField, amt: number) => {
    const cur =
      exemptByHeir.get(heirId) ??
      ({
        nonTaxableFarmland: 0,
        nonTaxablePublic: 0,
        nonTaxableOther: 0,
        exclusionPublicCorp: 0,
        exclusionPublicTrust: 0,
        exclusionOther: 0,
      } as Record<ExemptField, number>);
    cur[field] += amt;
    exemptByHeir.set(heirId, cur);
  };
  for (const ex of exemptions) {
    const recognized = recognizedByRuleId.get(ex.ruleId) ?? 0;
    if (recognized <= 0) continue;
    const field = resolveExemptField(ex.ruleId);
    const raw =
      ex.heirAllocations && ex.heirAllocations.length > 0
        ? new Map(ex.heirAllocations.map((a) => [a.heirId, a.amount]))
        : distributeByLegalShares(ex.claimedAmount, legal);
    const scaled = scaleMapToTotal(raw, recognized);
    for (const [heirId, v] of scaled) addExempt(heirId, field, v);
  }
  const numeratorByHeir = new Map<string, number>();
  for (const s of legal.shares) numeratorByHeir.set(s.heirId, s.numerator);

  // 작성방법 #3 법정상속재산가액 base — 엔진 §19 echo(numeratorCorrected) 단일 진실.
  //   = (총상속+추정) + 상속인사전증여 − 상속인외유증 − 채무 − 비과세 (heir-독립 공유 base).
  //   배우자 부재(Phase D 미발동) 시 taxableEstateValue fallback (근사). 어댑터 재계산 금지.
  const legalShareBase =
    result.deductionDetail?.spouseDeductionDetail?.legalShareTable?.numerator ??
    result.taxableEstateValue;

  // 실제상속지분율 분모 = Σ grossInheritance
  const totalGross = sorted.reduce(
    (sum, h) => sum + (perHeir[h.id]?.grossInheritance ?? 0),
    0,
  );

  // 평가기준코드용 vr 매칭 맵
  const vrByItemId = new Map<string, PropertyValuationResult>();
  for (const vr of result.valuationResults ?? []) {
    vrByItemId.set(vr.estateItemId, vr);
  }

  return sorted.map((heir) => {
    const breakdown = perHeir[heir.id];
    const grossInheritance = breakdown?.grossInheritance ?? 0;
    const presumedAmount = breakdown?.presumedAmount ?? 0;
    // 사전증여 (doneeId 매칭) — 나 행·계 가산증여·⑧ 명세합계 공용 단일 소스
    const myPriorGifts = priorGifts.filter((g) => g.doneeId === heir.id);
    const priorGift13 = myPriorGifts.reduce((s, g) => s + g.giftAmount, 0);

    // ── 가 섹션 ──
    const numerator = numeratorByHeir.get(heir.id);
    const legalShareLabel =
      numerator !== undefined ? `${numerator}/${legal.denominator}` : null;
    // 작성방법 #3 — base(엔진 §19 echo) × 법정지분. legatee·corporate(numerator 없음) → null
    const legalShareAmount =
      numerator !== undefined
        ? Math.floor((legalShareBase * numerator) / legal.denominator)
        : null;
    const actualShareRatio = totalGross > 0 ? grossInheritance / totalGross : 0;

    const sectionA: Buppyo2SectionA = {
      relation: HEIR_RELATION_TO_DECLARANT_LABEL[heir.relation] ?? "",
      name: heir.name?.trim() ?? "",
      residentId: heir.residentNumber?.trim() || undefined,
      legalShareLabel,
      legalShareAmount,
      actualShareRatio,
      // ⑧ 실제상속재산가액 = 명세합계(본래+추정+사전증여), 작성방법 #5. 완전입력 시 itemRowsTotal과 동치
      actualShareAmount: grossInheritance + presumedAmount + priorGift13,
    };

    // ── 나 섹션: 본래상속 행 (협의분할 입력분만, 자동 안분 금지) ──
    const itemRows: Buppyo2ItemRow[] = [];
    for (const item of estateItems) {
      const alloc = (item.heirAllocations ?? []).find(
        (a) => a.heirId === heir.id,
      );
      if (!alloc) continue; // 미입력 자산 행 생략 (feedback_no_silent_apportion_fallback)
      itemRows.push({
        kindCode: inferEstateItemKindCode(heir),
        typeCode: toEstateItemTypeCode(item.category),
        locationOrName: estateLocationOrName(item),
        isOverseasAsset: false,
        ownershipShareLabel: ownershipShareLabel(item, alloc.amount),
        quantityOrArea:
          item.areaSqm ?? alloc.areaM2 ?? item.quantityCount ?? null,
        unitPrice:
          item.category === "listed_stock"
            ? (item.listedStockAvgPrice ?? null)
            : null,
        valuatedAmount: alloc.amount,
        valuationMethodCode: toEstateItemValuationMethodCode(
          item,
          vrByItemId.get(item.id),
        ),
      });
    }

    // ── 나 섹션: 추정상속재산 행 (§15 일괄 추정 — 상속인별 단일 행) ──
    if (presumedAmount > 0) {
      itemRows.push({
        kindCode: "A13", // 상속개시 전 처분재산등 (§15 추정상속재산)
        typeCode: "12", // 기타재산 (D-1 — 양식 뒷면 코드표 확인 전 placeholder)
        locationOrName: "추정상속재산",
        isOverseasAsset: false,
        quantityOrArea: null,
        unitPrice: null,
        valuatedAmount: presumedAmount,
        valuationMethodCode: "08", // D-2 — 코드표 확인 전 placeholder
      });
    }

    // ── 나 섹션: 사전증여 행 (doneeId 매칭분만) ──
    for (const gift of myPriorGifts) {
      itemRows.push({
        kindCode: inferPropertyKindCode(gift, gift.specialTreatmentType),
        typeCode: toPriorGiftPropertyTypeCode(gift),
        locationOrName:
          gift.propertyLocation?.trim() ||
          gift.propertyName?.trim() ||
          `사전증여 (${gift.giftDate})`,
        isOverseasAsset: false,
        quantityOrArea: null,
        unitPrice: null,
        valuatedAmount: gift.giftAmount,
        valuationMethodCode: "08",
      });
    }

    // ── 계 섹션 ── (priorGift13·presumedAmount는 위에서 산출 — 단일 소스)
    const ex = exemptByHeir.get(heir.id);
    const sectionTotal: Buppyo2SectionTotal = {
      grossEstateValue: grossInheritance,
      presumedAmount,
      // ⑲~㉔ 비과세·불산입 6항목 (메모 행 — ㉘ 합계에 미차감, ⑰에 이미 포함)
      nonTaxableFarmland: ex?.nonTaxableFarmland ?? 0,
      nonTaxablePublic: ex?.nonTaxablePublic ?? 0,
      nonTaxableOther: ex?.nonTaxableOther ?? 0,
      exclusionPublicCorp: ex?.exclusionPublicCorp ?? 0,
      exclusionPublicTrust: ex?.exclusionPublicTrust ?? 0,
      exclusionOther: ex?.exclusionOther ?? 0,
      priorGift13,
      priorGift30_5: 0,
      priorGift30_6: 0,
      // ㉘ 합계 = ⑰+⑱+㉕ (비과세·불산입은 ⑰에 포함된 메모 행 → 미차감) = ⑧ 실제상속재산가액
      total: grossInheritance + presumedAmount + priorGift13,
    };

    return {
      heirId: heir.id,
      sectionA,
      itemRows,
      itemRowsTotal: itemRows.reduce((s, r) => s + r.valuatedAmount, 0),
      sectionTotal,
      usedLegalShareFallback,
    };
  });
}
