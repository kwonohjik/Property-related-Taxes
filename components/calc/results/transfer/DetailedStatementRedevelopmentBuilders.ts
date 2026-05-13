/**
 * DetailedStatementRedevelopmentBuilders — 재개발/재건축 3분할 산식 빌더
 *
 * 재개발 케이스(result.redevelopmentDetail 존재)에서 계산결과 상세명세서 1단계
 * 양도차익 산정 그룹의 각 항목을 인가전·인가후 기존건물분·청산금 분 3분할로 분해.
 *
 * `PerAssetValue[]` 패턴 재사용 — label은 자산명 대신 분할명("① 인가전 분 (§166①1호)" 등).
 * formula에는 변수값을 inline한 한국어 산식 문자열.
 *
 * 800줄 정책: DetailedStatementHelpers.ts 진입은 `applyRedevelopmentOverrides()` 단일 호출.
 */

import type { StatementItem, PerAssetValue } from "./DetailedStatementHelpers";
import type { RedevelopmentResult } from "@/lib/tax-engine/types/transfer-redevelopment.types";

// ──────────────────────────────────────────────────────────────────────────────
// 분할 정의
// ──────────────────────────────────────────────────────────────────────────────

export type RedevBranch = "preApproval" | "postApprovalExistingHouse" | "settlement";

interface BranchLabelDef {
  prefix: string;
  legal: string;
}

const BRANCH_LABEL_PAY: Record<RedevBranch, BranchLabelDef> = {
  preApproval: { prefix: "① 인가전 분", legal: "§166①1호 · §166⑤2호나목" },
  postApprovalExistingHouse: { prefix: "② 인가후 기존건물분", legal: "§166②1호 · §166⑤2호나목" },
  settlement: { prefix: "③ 청산금 납부분", legal: "§166②1호 · §166⑤2호가목" },
};


function getBranchLabels(redev: RedevelopmentResult): Record<RedevBranch, BranchLabelDef> {
  // settlementDirection 정보는 RedevelopmentResult에 직접 없으나
  // settlement.apportionedTransfer < settlement.apportionedAcquisition (수령 — 양도가액이 청산금만)
  // 단순 휴리스틱: salePriceTotal 검사로 판단 어렵기 때문에 기본은 PAY 라벨,
  // 외부에서 receive 신호가 들어오면 RECEIVE 라벨 사용 (현재는 PAY 기본).
  // TODO: subject·direction을 RedevelopmentResult에 직접 노출하면 정확 분기 가능.
  void redev;
  return BRANCH_LABEL_PAY;
}

const fmt = (n: number) => n.toLocaleString("ko-KR");

// ──────────────────────────────────────────────────────────────────────────────
// 산식 빌더 — 각 분할별
// ──────────────────────────────────────────────────────────────────────────────

/** 양도가액 분할별 산식 */
export function buildRedevTransferFormula(
  branch: RedevBranch,
  redev: RedevelopmentResult,
  totalTransferPrice: number,
): string {
  const sale = redev.salePriceTotal ?? 0;
  if (branch === "preApproval") {
    // 인가전 분 의제 양도가액 = 권리가액 (§166④)
    return `의제 양도가액 = 권리가액 = ${fmt(redev.preApproval.apportionedTransfer)} (§166④ 평가액)`;
  }
  if (branch === "postApprovalExistingHouse") {
    // 안분 = floor(transferPrice × rightsValue / salePriceTotal)
    // rightsValue를 역산: postApproval.apportionedAcquisition = rightsValue (납부) 또는 salePriceTotal (수령)
    const rights = redev.preApproval.apportionedTransfer; // 권리가액
    return `floor(${fmt(totalTransferPrice)} × ${fmt(rights)} / ${fmt(sale)}) = ${fmt(redev.postApprovalExistingHouse.apportionedTransfer)} (분양가 안분 — 권리가액 비율)`;
  }
  // settlement
  const settlementAcq = redev.settlement.apportionedAcquisition; // 청산금
  return `floor(${fmt(totalTransferPrice)} × ${fmt(settlementAcq)} / ${fmt(sale)}) = ${fmt(redev.settlement.apportionedTransfer)} (분양가 안분 — 청산금 비율)`;
}

/** 취득가액 분할별 산식 */
export function buildRedevAcquisitionFormula(
  branch: RedevBranch,
  redev: RedevelopmentResult,
): string {
  if (branch === "preApproval") {
    const meta = redev.valuationMeta;
    if (meta && meta.method !== "actual" && meta.denominator > 0) {
      const rights = redev.preApproval.apportionedTransfer;
      return `환산취득가 = floor(${fmt(rights)} × ${fmt(meta.numerator)} / ${fmt(meta.denominator)}) = ${fmt(redev.preApproval.apportionedAcquisition)} (§166③ — 권리가액 × P_A / D)`;
    }
    return `실제 취득가액 = ${fmt(redev.preApproval.apportionedAcquisition)} (실가 모드)`;
  }
  if (branch === "postApprovalExistingHouse") {
    return `의제 = 권리가액 = ${fmt(redev.postApprovalExistingHouse.apportionedAcquisition)} (§166②1호 안분 분자)`;
  }
  return `의제 = 청산금 = ${fmt(redev.settlement.apportionedAcquisition)} (§166②1호 안분 분자)`;
}

/** 필요경비(개산공제 §163⑥) 분할별 산식 */
export function buildRedevExpenseFormula(
  branch: RedevBranch,
  redev: RedevelopmentResult,
): string {
  if (branch === "preApproval") {
    const lump = redev.estimatedLumpDeduction ?? 0;
    if (lump > 0 && redev.valuationMeta) {
      const P_A = redev.valuationMeta.numerator;
      return `개산공제 = floor(${fmt(P_A)} × 3%) = ${fmt(lump)} (§163⑥ — 취득당시 라목값 × 3%)`;
    }
    return "필요경비 없음 (실가 모드)";
  }
  // 인가후·청산금 분은 신고서 표시상 0 (인가후·청산금 분에는 별도 필요경비 항목이 없음)
  return "해당 분할에는 개산공제 미적용";
}

/** 양도차익 분할별 산식 */
export function buildRedevGainFormula(
  branch: RedevBranch,
  redev: RedevelopmentResult,
): string {
  const detail = redev[branch];
  const t = detail.apportionedTransfer;
  const a = detail.apportionedAcquisition;
  if (branch === "preApproval") {
    const lump = redev.estimatedLumpDeduction ?? 0;
    return `${fmt(t)} − ${fmt(a)} − 개산공제 ${fmt(lump)} = ${fmt(detail.gain)}`;
  }
  return `${fmt(t)} − ${fmt(a)} = ${fmt(detail.gain)}`;
}

/** 장기보유공제 분할별 산식 */
export function buildRedevLthdFormula(
  branch: RedevBranch,
  redev: RedevelopmentResult,
): string {
  const detail = redev[branch];
  if (!detail.gain || detail.gain <= 0) {
    return "LTHD 대상 양도차익 부존재";
  }
  const years = Math.floor(detail.holdingMonths / 12);
  const months = detail.holdingMonths % 12;
  const pct = (detail.lthdRate * 100).toFixed(0);
  return `${fmt(detail.gain)} × ${pct}% (보유 ${years}년 ${months}개월) = ${fmt(detail.lthd)}`;
}

/** 양도소득금액 분할별 산식 */
export function buildRedevIncomeFormula(
  branch: RedevBranch,
  redev: RedevelopmentResult,
): string {
  const detail = redev[branch];
  const income = Math.max(0, detail.gain - detail.lthd);
  return `${fmt(detail.gain)} − ${fmt(detail.lthd)} = ${fmt(income)}`;
}

// ──────────────────────────────────────────────────────────────────────────────
// perAsset[] 빌더 — 3원소 배열 반환
// ──────────────────────────────────────────────────────────────────────────────

const BRANCHES: RedevBranch[] = ["preApproval", "postApprovalExistingHouse", "settlement"];

function buildPerAsset(
  redev: RedevelopmentResult,
  pickValue: (branch: RedevBranch, redev: RedevelopmentResult) => number,
  pickFormula: (branch: RedevBranch, redev: RedevelopmentResult) => string,
): PerAssetValue[] {
  const labels = getBranchLabels(redev);
  return BRANCHES.map((branch) => ({
    label: `${labels[branch].prefix} (${labels[branch].legal})`,
    value: pickValue(branch, redev),
    formula: pickFormula(branch, redev),
  }));
}

export function buildRedevPerAssetForTransfer(
  redev: RedevelopmentResult,
  totalTransferPrice: number,
): PerAssetValue[] {
  return buildPerAsset(
    redev,
    (b, r) => r[b].apportionedTransfer,
    (b, r) => buildRedevTransferFormula(b, r, totalTransferPrice),
  );
}

export function buildRedevPerAssetForAcquisition(redev: RedevelopmentResult): PerAssetValue[] {
  return buildPerAsset(
    redev,
    (b, r) => r[b].apportionedAcquisition,
    (b, r) => buildRedevAcquisitionFormula(b, r),
  );
}

export function buildRedevPerAssetForExpense(redev: RedevelopmentResult): PerAssetValue[] {
  return buildPerAsset(
    redev,
    (b, r) => (b === "preApproval" ? (r.estimatedLumpDeduction ?? 0) : 0),
    (b, r) => buildRedevExpenseFormula(b, r),
  );
}

export function buildRedevPerAssetForGain(redev: RedevelopmentResult): PerAssetValue[] {
  return buildPerAsset(
    redev,
    (b, r) => r[b].gain,
    (b, r) => buildRedevGainFormula(b, r),
  );
}

export function buildRedevPerAssetForLthd(redev: RedevelopmentResult): PerAssetValue[] {
  return buildPerAsset(
    redev,
    (b, r) => r[b].lthd,
    (b, r) => buildRedevLthdFormula(b, r),
  );
}

export function buildRedevPerAssetForIncome(redev: RedevelopmentResult): PerAssetValue[] {
  return buildPerAsset(
    redev,
    (b, r) => Math.max(0, r[b].gain - r[b].lthd),
    (b, r) => buildRedevIncomeFormula(b, r),
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// 진입 헬퍼 — DetailedStatementHelpers.ts buildStatementItems()에서 1줄 호출
// ──────────────────────────────────────────────────────────────────────────────

/**
 * 재개발 케이스 1단계 양도차익 산정 그룹의 항목에 3분할 perAsset[] 부착.
 *
 * - isAggregate(다건) 모드와 mutually exclusive로 처리 (호출 전 분기 체크)
 * - 합계값(value)은 기존 단건 합계 그대로 유지 → 32-항목 합계 anchor 회귀 0
 * - 각 항목의 formula·legalBasis는 재개발 §166 컨텍스트로 갱신
 */
export function applyRedevelopmentOverrides(
  items: Map<string, StatementItem>,
  redev: RedevelopmentResult,
  totalTransferPrice: number,
): void {
  // 양도가액 — 합계는 totalTransferPrice 유지
  const transferItem = items.get("transferPrice");
  if (transferItem) {
    transferItem.formula = "재개발 §166 — 인가전(권리가액 의제) + 인가후(분양가 안분) + 청산금(분양가 안분)";
    transferItem.legalBasis = "소득세법 시행령 §166①·②·④";
    transferItem.perAsset = buildRedevPerAssetForTransfer(redev, totalTransferPrice);
  }

  // 취득가액
  const acqItem = items.get("acquisitionPrice");
  if (acqItem) {
    // 합계: 분할별 apportionedAcquisition 합
    const sumAcq =
      redev.preApproval.apportionedAcquisition +
      redev.postApprovalExistingHouse.apportionedAcquisition +
      redev.settlement.apportionedAcquisition;
    acqItem.value = sumAcq;
    acqItem.formula = "재개발 §166 — 인가전(§166③ 환산 또는 실가) + 인가후(권리가액 의제) + 청산금(청산금 의제)";
    acqItem.legalBasis = "소득세법 시행령 §166③ · §163";
    acqItem.note = undefined;
    acqItem.perAsset = buildRedevPerAssetForAcquisition(redev);
  }

  // 필요경비 — 개산공제(§163⑥, 인가전만)
  const expItem = items.get("expenses");
  if (expItem) {
    expItem.value = redev.estimatedLumpDeduction ?? 0;
    expItem.formula = "개산공제 (§163⑥) = 취득당시 라목값 × 3% — 인가전 분에만 적용";
    expItem.legalBasis = "소득세법 시행령 §163⑥";
    expItem.perAsset = buildRedevPerAssetForExpense(redev);
  }

  // 전체 양도차익 — 합계는 기존 result.transferGain 유지
  const gainItem = items.get("transferGain");
  if (gainItem) {
    gainItem.formula = "재개발 §166 분할별 양도차익 합 = 인가전 + 인가후 기존건물분 + 청산금 분";
    gainItem.legalBasis = "소득세법 시행령 §166①·②";
    gainItem.perAsset = buildRedevPerAssetForGain(redev);
  }

  // 과세대상 양도차익 — 합계 result.taxableGain 유지 (1세대1주택 12억 안분 등은 합계 단계에서 처리)
  const taxableItem = items.get("taxableGain");
  if (taxableItem) {
    taxableItem.perAsset = buildRedevPerAssetForGain(redev);
  }

  // 장기보유특별공제 — 분할별 lthdRate 상이
  const ltItem = items.get("ltDeduction");
  if (ltItem) {
    ltItem.formula = "재개발 §166⑤ 분할별 보유기간·율 — 인가전·인가후 기존건물분(취득일 기산) + 청산금분(인가일 기산)";
    ltItem.legalBasis = "소득세법 §95② · 시행령 §166⑤";
    ltItem.perAsset = buildRedevPerAssetForLthd(redev);
  }

  // 보유분/거주분 — 재개발은 분할별 표1·표2 적용으로 보유/거주 분리 미적용
  const ltHoldItem = items.get("ltHoldingPart");
  if (ltHoldItem) {
    ltHoldItem.note = "재개발은 분할별 표1·표2 적용 — 보유/거주 분리 미적용";
    ltHoldItem.perAsset = undefined;
  }
  const ltResItem = items.get("ltResidencePart");
  if (ltResItem) {
    ltResItem.note = "재개발은 분할별 표1·표2 적용 — 보유/거주 분리 미적용";
    ltResItem.perAsset = undefined;
  }

  // 양도소득금액 — 합계 기존 유지
  const incomeItem = items.get("incomeAmount");
  if (incomeItem) {
    incomeItem.formula = "재개발 §166 분할별 (양도차익 − LTHD) 합 (음수 시 0)";
    incomeItem.legalBasis = "소득세법 §95①";
    incomeItem.perAsset = buildRedevPerAssetForIncome(redev);
  }
}
