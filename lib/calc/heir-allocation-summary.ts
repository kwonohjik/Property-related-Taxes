/**
 * 상속인별 상속세부담액 집계 표 — 변환 헬퍼 (Phase C1·C2·C3)
 *
 * Plan: docs/01-plan/heir-allocation-summary-table.plan.md §0.8
 * UI Design: docs/02-design/features/heir-allocation-summary-table.ui.design.md
 *
 * 화면 컴포넌트와 PDF 섹션이 동일하게 소비. 엔진 echo만 조립, 자체 산식 0.
 */

import type {
  Heir,
  InheritanceTaxResult,
} from "@/lib/tax-engine/types/inheritance-gift.types";

export type SummaryGroupId =
  | "asset"
  | "value"
  | "deduction"
  | "taxBase"
  | "computedTax"
  | "credit10"
  | "allocation"
  | "credit12"
  | "final";

export interface SummaryTableRow {
  rowId: string;
  groupId: SummaryGroupId;
  rowNo?: string;
  label: string;
  total: number | null;
  perHeir: Record<string, number | null>;
  isBoldFinal?: boolean;
  isHeaderGroup?: boolean;
  /** 그룹 헤더 행(⑥ 과세표준 등) — 값 칸 공란, 라벨만 표시 (이미지4 rowSpan 그룹 칼럼 복원) */
  isGroupHeader?: boolean;
  /** 그룹 헤더에 종속된 세부행(㉠직접배부 등) — 라벨 들여쓰기 */
  isGroupChild?: boolean;
}

export interface SummaryTableData {
  heirOrder: string[];
  rows: SummaryTableRow[];
  hasCorporate: boolean;
  hasGenerationSkip: boolean;
  usedLegalShareFallback: boolean;
}

/**
 * heirOrder 정책 (U-10): spouse → child → ascendant → sibling → other → corporate → legatee.
 * PDF 표8 헤더 순서와 일치 — corp가 legatee 앞.
 */
const RELATION_ORDER: Record<string, number> = {
  spouse: 0,
  child: 1,
  lineal_ascendant: 2,
  sibling: 3,
  other: 4,
  corporate: 5,
  legatee: 6,
};

export function sortHeirs(heirs: Heir[]): Heir[] {
  return [...heirs].sort(
    (a, b) =>
      (RELATION_ORDER[a.relation] ?? 99) - (RELATION_ORDER[b.relation] ?? 99),
  );
}

/**
 * 법정상속인 여부 — 비상속인(수유자 legatee · 영리법인 corporate · isHeir===false) 제외.
 * 상증법: 부표2 「상속인별」 서식 등 상속인 한정 산출의 단일 진실(enum exact 비교).
 */
export function isStatutoryHeir(h: Heir): boolean {
  return (
    h.relation !== "legatee" &&
    h.relation !== "corporate" &&
    h.isHeir !== false
  );
}

export function labelOf(heirId: string, heirs: Heir[]): string {
  const h = heirs.find((x) => x.id === heirId);
  if (!h) return heirId;
  if (h.name) return h.name;
  switch (h.relation) {
    case "spouse":
      return "배우자";
    case "child":
      return "자녀";
    case "lineal_ascendant":
      return "직계존속";
    case "sibling":
      return "형제자매";
    case "corporate":
      return "영리법인";
    case "legatee":
      return "수유자";
    default:
      return "기타";
  }
}

export function fmt(v: number | null | undefined): string {
  // 이슈3: 값 0만 "0", 구조적 미배부(null/undefined)는 빈칸 — 대시("—") 제거.
  if (v === null || v === undefined) return "";
  if (v === 0) return "0";
  return v.toLocaleString();
}

/**
 * heir별 값 추출 + corp/legatee 강제 null 매핑 (UI-I-1).
 * @param accessor — heir에 대해 호출되는 값 추출 함수
 * @param allowedRelations — 허용 relation 목록 (없으면 전체)
 */
function buildPerHeir(
  heirs: Heir[],
  accessor: (h: Heir) => number | null | undefined,
  allowedRelations?: Heir["relation"][],
): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const h of heirs) {
    if (allowedRelations && !allowedRelations.includes(h.relation)) {
      out[h.id] = null;
      continue;
    }
    const v = accessor(h);
    out[h.id] = v == null ? null : v;
  }
  return out;
}

/**
 * 33행 매트릭스 조립 — corp 행 셀별 정책(U-11) 준수.
 */
export function buildSummaryTable(
  result: InheritanceTaxResult,
  heirs: Heir[],
): SummaryTableData {
  const sorted = sortHeirs(heirs);
  const heirOrder = sorted.map((h) => h.id);
  const perHeirEngine = result.heirAllocationResult?.perHeir ?? {};
  const summary = result.summaryTable;
  const hasCorporate = sorted.some((h) => h.relation === "corporate");
  const hasGenerationSkip = sorted.some(
    (h) => h.isGenerationSkipBeneficiary === true,
  );
  const usedLegalShareFallback =
    result.heirAllocationResult?.usedLegalShareFallback ?? false;

  const get = (id: string) => perHeirEngine[id];
  // 비납세의무자(§3의2① — 영리법인·후순위 비상속인 자연인, isTaxPayer===false) 셀은 null.
  //   ⑪·⑫·*1~*5·소계·⑬⑭⑮ 공통 가드. 비상속인 없는 케이스는 모두 true → 동작 불변.
  const payerOnly =
    (accessor: (h: Heir) => number | null | undefined) =>
    (h: Heir): number | null =>
      perHeirEngine[h.id]?.isTaxPayer === false ? null : accessor(h) ?? null;

  // null 셀 헬퍼 — 합계행 (상속인 셀 모두 null)
  const headerOnly = (): Record<string, number | null> => {
    const r: Record<string, number | null> = {};
    for (const id of heirOrder) r[id] = null;
    return r;
  };

  const rows: SummaryTableRow[] = [];

  // 자산 4분류 4행 (corp는 0)
  const catKeys: Array<{
    key: "financial" | "realEstate" | "stock" | "other";
    label: string;
  }> = [
    { key: "financial", label: "상속재산 — 금융" },
    { key: "realEstate", label: "상속재산 — 부동산" },
    { key: "stock", label: "상속재산 — 주식" },
    { key: "other", label: "상속재산 — 기타 (퇴직·보험 포함)" },
  ];
  for (const c of catKeys) {
    rows.push({
      rowId: `row-asset-${c.key}`,
      groupId: "asset",
      label: c.label,
      total: summary?.categoryTotals[c.key] ?? null,
      perHeir: buildPerHeir(sorted, (h) => get(h.id)?.categoryBreakdown?.[c.key]),
    });
  }

  // ① 총상속재산
  rows.push({
    rowId: "row-1-gross",
    groupId: "asset",
    rowNo: "①",
    label: "총상속재산 (채무공제 전)",
    isHeaderGroup: true,
    total: summary
      ? summary.categoryTotals.financial +
        summary.categoryTotals.realEstate +
        summary.categoryTotals.stock +
        summary.categoryTotals.other
      : null,
    perHeir: buildPerHeir(sorted, (h) => get(h.id)?.grossInheritance),
  });

  // ㉠ 과세제외 분리 — 비과세(§11·§12) / 과세가액 불산입(§16·§17). rowNo 생략(원문자 충돌 회피).
  const sumPerHeir = (getter: (p: (typeof perHeirEngine)[string]) => number | undefined) =>
    Object.values(perHeirEngine).reduce((s, p) => s + (getter(p) ?? 0), 0);

  rows.push({
    rowId: "row-a-nontaxable",
    groupId: "value",
    rowNo: "㉠",
    label: "비과세 재산 (§11·§12)",
    total: sumPerHeir((p) => p?.nonTaxableShare) || null,
    perHeir: buildPerHeir(sorted, (h) => get(h.id)?.nonTaxableShare),
  });
  rows.push({
    rowId: "row-a-notincluded",
    groupId: "value",
    rowNo: "㉠",
    label: "과세가액 불산입 (§16·§17)",
    total: sumPerHeir((p) => p?.notIncludedShare) || null,
    perHeir: buildPerHeir(sorted, (h) => get(h.id)?.notIncludedShare),
  });

  // ㉡ 채무·공과·장례비 분리 — 채무(§14①3호) / 공과금(§14①1호) / 장례비(§14①2호). 그룹 원문자 ㉡ 반복.
  rows.push({
    rowId: "row-b-debt-principal",
    groupId: "value",
    rowNo: "㉡",
    label: "채무 (§14①3호)",
    total: sumPerHeir((p) => p?.debtPrincipalShare) || null,
    perHeir: buildPerHeir(sorted, (h) => get(h.id)?.debtPrincipalShare),
  });
  rows.push({
    rowId: "row-b-debt-publiccharge",
    groupId: "value",
    rowNo: "㉡",
    label: "공과금 (§14①1호)",
    total: sumPerHeir((p) => p?.publicChargeShare) || null,
    perHeir: buildPerHeir(sorted, (h) => get(h.id)?.publicChargeShare),
  });
  rows.push({
    rowId: "row-b-debt-funeral",
    groupId: "value",
    rowNo: "㉡",
    label: "장례비 (§14①2호)",
    total: sumPerHeir((p) => p?.funeralShare) || null,
    perHeir: buildPerHeir(sorted, (h) => get(h.id)?.funeralShare),
  });

  // ② 사전증여
  // 2-A 수정: total을 인별 합(doneeId 없으면 0) 대신 엔진 echo priorGiftAggregated로 교체.
  //   - 수정 전: Σ perHeir.priorGiftAmount → doneeId 미지정 시 0 → ② 합계열 누락(Bug #2).
  //   - 수정 후: result.priorGiftAggregated (§13 cutoff 적용 합계) → ④ 합계열과 정합.
  //   - 한계: 2-A는 합계열 표시 전용. 인별 ④(taxableValueShare)는 2-B(doneeId select) 완료 후 정합.
  //     doneeId 미지정 시 인별 셀은 0 유지 → UI에서 "수증자 미지정 — 인별 배부 생략" 배지 표시 예정.
  const priorGiftTotal = result.priorGiftAggregated ?? 0;
  rows.push({
    rowId: "row-2-priorGift",
    groupId: "value",
    rowNo: "②",
    label: "사전증여재산",
    total: priorGiftTotal || null,
    perHeir: buildPerHeir(sorted, (h) => get(h.id)?.priorGiftAmount),
  });

  // ③ 추정상속
  const presumedTotal = Object.values(perHeirEngine).reduce(
    (s, p) => s + (p?.presumedAmount ?? 0),
    0,
  );
  rows.push({
    rowId: "row-3-presumed",
    groupId: "value",
    rowNo: "③",
    label: "추정상속재산 (법정상속분 안분)",
    total: presumedTotal || null,
    perHeir: buildPerHeir(sorted, (h) => get(h.id)?.presumedAmount),
  });

  // ④ 과세가액
  rows.push({
    rowId: "row-4-taxableEstate",
    groupId: "value",
    rowNo: "④",
    label: "상속세 과세가액 (① − ㉠ − ㉡ + ② + ③)",
    isHeaderGroup: true,
    total: result.taxableEstateValue ?? null,
    perHeir: buildPerHeir(sorted, (h) => get(h.id)?.taxableValueShare),
  });

  // *1 distributableTaxBase
  rows.push({
    rowId: "row-s1-distributableBase",
    groupId: "value",
    rowNo: "*1",
    label: "과세표준 배부대상 과세가액",
    total: summary?.distributableTaxBase ?? null,
    perHeir: buildPerHeir(
      sorted,
      payerOnly((h) => {
        const p = get(h.id);
        if (!p) return null;
        // 상속인별 *1 = 과세가액상당액 − 본인 사전증여가액
        return p.taxableValueShare - p.priorGiftAmount;
      }),
    ),
  });

  // *2 surchargeTargetTaxableValue
  rows.push({
    rowId: "row-s2-surchargeTarget",
    groupId: "value",
    rowNo: "*2",
    label: "할증과세 대상 과세가액",
    total: summary?.surchargeTargetTaxableValue ?? null,
    perHeir: buildPerHeir(
      sorted,
      payerOnly((h) => get(h.id)?.taxableValueShare),
    ),
  });

  // ⑤ 상속공제 — 합계만
  rows.push({
    rowId: "row-5-deduction",
    groupId: "deduction",
    rowNo: "⑤",
    label: "상속공제",
    total: result.totalDeduction ?? null,
    perHeir: headerOnly(),
  });

  // ⑥ 과세표준 — 그룹 헤더 행 (이미지4 rowSpan 그룹 칼럼 복원)
  rows.push({
    rowId: "row-6-group",
    groupId: "taxBase",
    rowNo: "⑥",
    label: "과세표준",
    isGroupHeader: true,
    total: null,
    perHeir: headerOnly(),
  });

  // ⑥ ㉠ 직접배부
  const directTotal = Object.values(perHeirEngine).reduce(
    (s, p) => s + (p?.directTaxBaseShare ?? 0),
    0,
  );
  rows.push({
    rowId: "row-6a-direct",
    groupId: "taxBase",
    rowNo: "㉠",
    label: "직접배부",
    isGroupChild: true,
    total: directTotal || null,
    perHeir: buildPerHeir(sorted, (h) => get(h.id)?.directTaxBaseShare),
  });

  // ⑥ ㉡ 간접배부
  const indirectTotal = Object.values(perHeirEngine).reduce(
    (s, p) => s + (p?.indirectTaxBaseShare ?? 0),
    0,
  );
  rows.push({
    rowId: "row-6b-indirect",
    groupId: "taxBase",
    rowNo: "㉡",
    label: "간접배부",
    isGroupChild: true,
    total: indirectTotal || null,
    perHeir: buildPerHeir(sorted, (h) => get(h.id)?.indirectTaxBaseShare),
  });

  // ⑥ ㉢ 과세표준상당액 계
  rows.push({
    rowId: "row-6c-total",
    groupId: "taxBase",
    rowNo: "㉢",
    label: "과세표준상당액 계",
    isHeaderGroup: true,
    isGroupChild: true,
    total: result.taxBase ?? null,
    perHeir: buildPerHeir(sorted, (h) => get(h.id)?.taxBaseShare),
  });

  // *3
  rows.push({
    rowId: "row-s3-afterCorpGifts",
    groupId: "taxBase",
    rowNo: "*3",
    label: "상속인등 과세표준상당액 (영리법인 제외)",
    total: summary?.distributableTaxBaseAfterGifts ?? null,
    perHeir: buildPerHeir(sorted, payerOnly((h) => get(h.id)?.taxBaseShare)),
  });

  // ⑦ 산출세액
  rows.push({
    rowId: "row-7-computedTax",
    groupId: "computedTax",
    rowNo: "⑦",
    label: "산출세액",
    total: result.computedTax ?? null,
    perHeir: headerOnly(),
  });

  // ⑧ 세대생략가산
  rows.push({
    rowId: "row-8-generationSkip",
    groupId: "computedTax",
    rowNo: "⑧",
    label: "세대생략가산액",
    total: result.generationSkipSurcharge || null,
    perHeir: headerOnly(),
  });

  // ⑨ 소계
  rows.push({
    rowId: "row-9-computedTaxSum",
    groupId: "computedTax",
    rowNo: "⑨",
    label: "산출세액 소계 (⑦ + ⑧)",
    isHeaderGroup: true,
    total:
      (result.computedTax ?? 0) + (result.generationSkipSurcharge ?? 0) || null,
    perHeir: headerOnly(),
  });

  // ⑩ 상속인(수유자)외 증여세액공제 — 그룹 헤더 행
  rows.push({
    rowId: "row-10-group",
    groupId: "credit10",
    rowNo: "⑩",
    label: "상속인(수유자)외 증여세액공제",
    isGroupHeader: true,
    total: null,
    perHeir: headerOnly(),
  });

  // ⑩a/b/c — 상속인·수유자 외(영리법인 §3의2② + 비상속인 자연인 §28②본문) 증여세액공제.
  //   isNonPayer = isTaxPayer===false (영리법인 ∪ 후순위 비상속인 자연인).
  const isNonPayer = (id: string) => perHeirEngine[id]?.isTaxPayer === false;
  // 비상속인 자연인 합 (corp는 nonHeirGiftCredit*=undefined → 0)
  const nonPayerNaturalLimitSum = Object.values(perHeirEngine).reduce(
    (s, p) => s + (p?.nonHeirGiftCreditLimit ?? 0),
    0,
  );
  const nonPayerNaturalCreditSum = Object.values(perHeirEngine).reduce(
    (s, p) => s + (p?.nonHeirGiftCredit ?? 0),
    0,
  );
  rows.push({
    rowId: "row-10a-corpGiftTax",
    groupId: "credit10",
    rowNo: "a",
    label: "증여세 산출세액",
    isGroupChild: true,
    total:
      Object.values(perHeirEngine).reduce(
        (s, p) => (p?.isTaxPayer === false ? s + (p?.priorGiftComputedTax ?? 0) : s),
        0,
      ) || null,
    perHeir: buildPerHeir(sorted, (h) =>
      isNonPayer(h.id) ? get(h.id)?.priorGiftComputedTax : null,
    ),
  });
  rows.push({
    rowId: "row-10b-corpLimit",
    groupId: "credit10",
    rowNo: "b",
    label: "공제 한도",
    isGroupChild: true,
    total:
      (summary?.corporateExemptionLimitDisplay ?? 0) + nonPayerNaturalLimitSum ||
      null,
    perHeir: buildPerHeir(sorted, (h) => {
      const p = get(h.id);
      if (p?.isTaxPayer !== false) return null;
      // 자연인 비상속인 §28②본문 한도 / 영리법인 §3의2② 한도
      return p.nonHeirGiftCreditLimit ?? p.priorGiftCreditLimit ?? null;
    }),
  });
  rows.push({
    rowId: "row-10c-corpCredit",
    groupId: "credit10",
    rowNo: "c",
    label: "공제할 증여세액 = Min(a, b)",
    isGroupChild: true,
    total:
      (result.corporateExemption?.amount ?? 0) + nonPayerNaturalCreditSum || null,
    perHeir: buildPerHeir(sorted, (h) => {
      const p = get(h.id);
      if (p?.isTaxPayer !== false) return null;
      if (h.relation === "corporate") {
        // GAP-2: 다수 영리법인 시 법인별 안분 면제액(perCorporateBreakdown). 단일/누락 시 전체 fallback.
        return (
          result.corporateExemption?.perCorporateBreakdown?.find(
            (c) => c.corporateId === h.id,
          )?.exemptionAmount ??
          result.corporateExemption?.amount ??
          0
        );
      }
      // 비상속인 자연인 §28②본문 공제액
      return p.nonHeirGiftCredit ?? null;
    }),
  });

  // ⑪ 산출세액 배부 — 비납세의무자(영리법인·비상속인 자연인) 제외
  const taxAllocTotal = Object.values(perHeirEngine).reduce(
    (s, p) => (p?.isTaxPayer === false ? s : s + (p?.computedTaxShare ?? 0)),
    0,
  );
  rows.push({
    rowId: "row-11-allocation",
    groupId: "allocation",
    rowNo: "⑪",
    label: "상속인등 산출세액 배부",
    total: taxAllocTotal || null,
    perHeir: buildPerHeir(sorted, payerOnly((h) => get(h.id)?.computedTaxShare)),
  });

  // *4 세대생략가산
  rows.push({
    rowId: "row-s4-genSkip",
    groupId: "allocation",
    rowNo: "*4",
    label: "세대생략가산액",
    total: result.generationSkipSurcharge || null,
    perHeir: buildPerHeir(
      sorted,
      payerOnly((h) => get(h.id)?.generationSkipSurcharge),
    ),
  });

  // *5 부담비율
  rows.push({
    rowId: "row-s5-burdenRatio",
    groupId: "allocation",
    rowNo: "*5",
    label: "상속인등 상속세부담 비율",
    total: 1.0,
    perHeir: buildPerHeir(sorted, payerOnly((h) => get(h.id)?.burdenRatio)),
  });

  // 소계
  rows.push({
    rowId: "row-allocation-subtotal",
    groupId: "allocation",
    label: "소계 (⑪ + *4)",
    isHeaderGroup: true,
    total:
      taxAllocTotal + (result.generationSkipSurcharge ?? 0) || null,
    perHeir: buildPerHeir(
      sorted,
      payerOnly((h) => {
        const p = get(h.id);
        if (!p) return null;
        return p.computedTaxShare + p.generationSkipSurcharge;
      }),
    ),
  });

  // ⑫a/b/c (납세의무자만 — 영리법인·비상속인 자연인 제외)
  const sumByHeirNoCorp = (
    getter: (id: string) => number | undefined,
  ): number => {
    let s = 0;
    for (const h of sorted) {
      if (perHeirEngine[h.id]?.isTaxPayer === false) continue;
      s += getter(h.id) ?? 0;
    }
    return s;
  };
  // ⑫ 상속인등의 증여세액공제 — 그룹 헤더 행
  rows.push({
    rowId: "row-12-group",
    groupId: "credit12",
    rowNo: "⑫",
    label: "상속인등의 증여세액공제",
    isGroupHeader: true,
    total: null,
    perHeir: headerOnly(),
  });
  rows.push({
    rowId: "row-12a-priorGiftTax",
    groupId: "credit12",
    rowNo: "a",
    label: "증여세 산출세액",
    isGroupChild: true,
    total:
      sumByHeirNoCorp((id) => get(id)?.priorGiftComputedTax) || null,
    perHeir: buildPerHeir(
      sorted,
      payerOnly((h) => get(h.id)?.priorGiftComputedTax),
    ),
  });
  rows.push({
    rowId: "row-12b-limit",
    groupId: "credit12",
    rowNo: "b",
    label: "공제 한도",
    isGroupChild: true,
    total: sumByHeirNoCorp((id) => get(id)?.priorGiftCreditLimit) || null,
    perHeir: buildPerHeir(
      sorted,
      payerOnly((h) => get(h.id)?.priorGiftCreditLimit),
    ),
  });
  rows.push({
    rowId: "row-12c-credit",
    groupId: "credit12",
    rowNo: "c",
    label: "사전증여세액공제 = Min(a, b)",
    isGroupChild: true,
    total: sumByHeirNoCorp((id) => get(id)?.priorGiftCredit) || null,
    perHeir: buildPerHeir(sorted, payerOnly((h) => get(h.id)?.priorGiftCredit)),
  });

  // ⑬ 차가감세액
  rows.push({
    rowId: "row-13-preFiling",
    groupId: "final",
    rowNo: "⑬",
    label: "차가감세액 (⑪ + *4 − ⑫c)",
    total: sumByHeirNoCorp((id) => get(id)?.preFilingCreditTax) || null,
    perHeir: buildPerHeir(sorted, payerOnly((h) => get(h.id)?.preFilingCreditTax)),
  });

  // ⑭ 신고세액공제
  rows.push({
    rowId: "row-14-filingCredit",
    groupId: "final",
    rowNo: "⑭",
    label: "신고세액공제 (⑬ × 0.03)",
    total: sumByHeirNoCorp((id) => get(id)?.filingCredit) || null,
    perHeir: buildPerHeir(sorted, payerOnly((h) => get(h.id)?.filingCredit)),
  });

  // ⑮ 차감자진납부세액 (강조)
  rows.push({
    rowId: "row-15-finalTax",
    groupId: "final",
    rowNo: "⑮",
    label: "차감자진납부세액 (⑬ − ⑭)",
    isBoldFinal: true,
    total: sumByHeirNoCorp((id) => get(id)?.finalTax) || null,
    perHeir: buildPerHeir(sorted, payerOnly((h) => get(h.id)?.finalTax)),
  });

  return {
    heirOrder,
    rows,
    hasCorporate,
    hasGenerationSkip,
    usedLegalShareFallback,
  };
}
