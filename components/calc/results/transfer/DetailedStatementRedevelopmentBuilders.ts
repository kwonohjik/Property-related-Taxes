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
import type { LthdExclusionReason } from "@/lib/tax-engine/legal-codes/transfer";
import { LTHD_EXCLUSION_LABEL } from "@/lib/tax-engine/legal-codes/transfer";
import { redevBranchTotals } from "./redev-acquisition-inverse";
import { redevFilingTotals } from "./redev-acquisition-inverse";

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

// 사례 36 — subject="right" 입주권 양도 (납부 모드).
// §166①1호 산식: 인가전·인가후+청산금 2분기. 인가후 기존건물분(=0) 행은 숨김 처리.
// LTHD: 인가전 분만 적용 (§95② 본문 괄호). 인가후·청산금 분 LTHD=0 강제.
const BRANCH_LABEL_RIGHT_PAY: Record<RedevBranch, BranchLabelDef> = {
  preApproval: { prefix: "① 인가전 분", legal: "§166①1호 · §166⑤1호 (취득일~인가일 기산)" },
  postApprovalExistingHouse: { prefix: "② 인가후 기존건물분 (장기보유특별공제 제외)", legal: "§166①1호 · §95② 본문 괄호 (인가후분 = 0 fill)" },
  settlement: { prefix: "② 인가후·청산금 납부분 (장기보유특별공제 제외)", legal: "§166①1호 · §95② 본문 괄호 (장기보유특별공제 공제율 0%)" },
};

/*
 * 사례 46 — 청산금 **수령 단독 신고** 전용 라벨 (§166①2호 가목 단독, 인가전·인가후 0 강제).
 *
 * 🔴 `legal` 자리는 화면·PDF에서 **근거 조문**으로 읽힌다(다른 분기는 전부 「§166①1호 ·
 *    §166⑤2호나목」 같은 인용이다). 종전에는 여기에 내부 플래그 이름이 그대로 실려
 *    「① 인가전 분 (미신고) (**receiveOnly — 0 강제**)」로 찍혔다 — 코드 식별자가 근거인 것처럼
 *    보였다(메모리 `feedback_no_internal_id_in_result`).
 */
/**
 * 사례 46에서 인가전·인가후 분의 **산식 칸**에 찍히는 0 — 3항목(양도가액·취득가액·필요경비)
 * × 2분할 = 6칸이다.
 *
 * 🔴 같은 이유로 내부 식별자를 쓰지 않는다 (2026-09-07 UI 리뷰 L7). 종전 문자열
 *    `"0 (receiveOnly — 신고 대상 아님)"`은 `PerAssetRow`의 `<FormulaText>`가 그대로
 *    인쇄해 사용자가 한 화면에서 코드 토큰을 6번 봤다. 산식 슬롯은 components/calc/CLAUDE.md가
 *    「한국어 풀어쓰기·법정 용어 우선」을 요구하는 자리다.
 */
const RECEIVE_ONLY_ZERO_FORMULA = "0 (청산금 수령분만 신고 대상 — §166①2호 가목)";

const BRANCH_LABEL_RECEIVE_ONLY: Record<RedevBranch, BranchLabelDef> = {
  preApproval: { prefix: "① 인가전 분 (미신고)", legal: "§166①2호 가목 — 청산금 수령분 단독 신고" },
  postApprovalExistingHouse: {
    prefix: "② 인가후 기존건물분 (미신고)",
    legal: "§166①2호 가목 — 청산금 수령분 단독 신고",
  },
  settlement: { prefix: "③ 청산금 수령분 (단독 신고)", legal: "§166①2호 가목 · 재산-439 · 서면2016-2705" },
};

// 사례 48 — 승계조합원 신축APT 양도 (안분 우회 단순 차감).
// 관리처분 후 입주권 승계 취득 → 신축APT 양도 시 §166 안분 산식 미적용.
// 인가전·청산금은 0 fill, 인가후만 primary.
const BRANCH_LABEL_SUCCESSOR_MEMBER: Record<RedevBranch, BranchLabelDef> = {
  preApproval: { prefix: "① 인가전 분 (승계조합원 — 미적용)", legal: "§166 안분 우회" },
  postApprovalExistingHouse: {
    prefix: "② 승계조합원 신축APT (단순 차감)",
    legal: "사전-2019-법령해석재산-0649 · 시행령 §162①4호",
  },
  settlement: { prefix: "③ 청산금 분 (승계조합원 — 미신고)", legal: "본 PR 미지원" },
};

// 사례 47 — settlement 비과세 차감 모드 라벨 (신축APT 양도 + 청산금 수령 동시신고).
// 인가전·인가후는 사례 44/45 동일 산식, settlement만 비과세 차감으로 0 마스킹.
const BRANCH_LABEL_SETTLEMENT_EXEMPTED: Record<RedevBranch, BranchLabelDef> = {
  preApproval: { prefix: "① 인가전 분", legal: "§166②2호 + §166①2호 가목 (수령 안분)" },
  postApprovalExistingHouse: { prefix: "② 인가후 기존건물분", legal: "§166②2호 · §166⑤2호나목" },
  settlement: {
    prefix: "③ 청산금 수령분 (1세대1주택 비과세)",
    legal: "PDF 사례수정 2 (2)-1번 · 서면2016-법령해석재산-2705",
  },
};

// R-5/사례 38/39 — subject="right" + settlementDirection="receive" (§166①2호 가목·나목).
// 가목: 인가후 분(양도가 − 안분취득가) = §166①2호 가목 — 사례 38·39 라벨 정합화
// 나목: 인가전 분(축소) = 인가전양도차익 × (평가액 − 청산금) / 평가액 (§166①2호 나목)
// settlement LTHD = zeroBranch (§94①2호 + §95② 본문 괄호)
// ★ 2026-05-15 사례 38·39: 라벨 "인가전 분(나목)" / "인가후 분(가목)"으로 정합화
const BRANCH_LABEL_RIGHT_RECEIVE_NAMOK: Record<RedevBranch, BranchLabelDef> = {
  preApproval: {
    prefix: "① 인가전 분 (§166①2호 나목)",
    legal: "§166①2호 나목 · §166⑤1호 (취득일~인가일 기산)",
  },
  postApprovalExistingHouse: {
    prefix: "② 인가후 기존건물분 (장기보유특별공제 제외)",
    legal: "§166①2호 · §95② 본문 괄호 (인가후분 = 0)",
  },
  settlement: {
    prefix: "③ 인가후 분 (§166①2호 가목) — 장기보유특별공제 미적용",
    legal: "§166①2호 가목 · §95② 본문 괄호 · §94①2호 (공제율 0 적용)",
  },
};

function getBranchLabels(
  redev: RedevelopmentResult,
  subject?: "apt" | "right",
  settlementDirection?: "pay" | "receive",
): Record<RedevBranch, BranchLabelDef> {
  // 우선순위 0: successorMemberApplied (사례 48 — 가장 먼저 평가)
  if (redev.successorMemberApplied === true) return BRANCH_LABEL_SUCCESSOR_MEMBER;
  // 우선순위 1: receiveOnlyMode (사례 46)
  if (redev.receiveOnlyMode === true) return BRANCH_LABEL_RECEIVE_ONLY;
  // 우선순위 2: settlementExemptionApplied (사례 47)
  if (redev.settlementExemptionApplied === true) return BRANCH_LABEL_SETTLEMENT_EXEMPTED;
  // 우선순위 3: subject="right" + settlementDirection="receive" — §166①2호 가목·나목 (R-5)
  if (subject === "right" && settlementDirection === "receive") return BRANCH_LABEL_RIGHT_RECEIVE_NAMOK;
  // 우선순위 4: subject="right" 입주권 납부 모드 (사례 36 — §166①1호 + §95② 단서)
  if (subject === "right") return BRANCH_LABEL_RIGHT_PAY;
  return BRANCH_LABEL_PAY;
}

/** 재개발 산식·오버라이드 공용 숫자 포맷. 분리 파일(`…RedevOverrides`)도 쓴다. */
export const fmt = (n: number) => n.toLocaleString("ko-KR");

// ──────────────────────────────────────────────────────────────────────────────
// 산식 빌더 — 각 분할별
// ──────────────────────────────────────────────────────────────────────────────

/** 양도가액 분할별 산식 */
export function buildRedevTransferFormula(
  branch: RedevBranch,
  redev: RedevelopmentResult,
  totalTransferPrice: number,
): string {
  // 사례 46 receiveOnly — 인가전·인가후 0 강제, settlement만 청산금 수령액 자체
  if (redev.receiveOnlyMode === true) {
    if (branch === "settlement") {
      return `청산금 수령액 = ${fmt(redev.settlement.apportionedTransfer)} (§166①2호 가목 — 양도가액 의제)`;
    }
    return RECEIVE_ONLY_ZERO_FORMULA;
  }

  const sale = redev.salePriceTotal ?? 0;
  if (branch === "preApproval") {
    // 인가전 분 의제 양도가액 = 권리가액 (§166④)
    return `의제 양도가액 = 권리가액 = ${fmt(redev.preApproval.apportionedTransfer)} (§166④ 평가액)`;
  }
  if (branch === "postApprovalExistingHouse") {
    // 안분 = floor(transferPrice × rightsValue / salePriceTotal)
    const rights = redev.preApproval.apportionedTransfer; // 권리가액
    return `${fmt(totalTransferPrice)} × (${fmt(rights)} ÷ ${fmt(sale)}) = ${fmt(redev.postApprovalExistingHouse.apportionedTransfer)} (분양가 안분 — 권리가액 비율, 1원 미만 절사)`;
  }
  /**
   * settlement — **잔액 흡수**다. floor 안분이 아니다.
   *
   * 엔진(`redevelopment-split.ts:338-339`)이 기존주택분을 먼저 floor 안분한 뒤
   * `양도가액 − 기존주택분`을 청산금분으로 준다. 그래야 두 파트 합이 총 양도가액과
   * 정확히 일치한다(1원 잔차가 소실되지 않는다).
   *
   * 🔴 종전에는 여기서 `floor(총양도가액 × 청산금 / 분양가)`로 인쇄했는데, 잔차가 나는
   *    조합에서 **좌변을 계산하면 우변과 1원 달랐다** — 사례 44에서
   *    「floor(525,000,000 × 92,781,500 / 312,000,000) = 156,122,717」로 찍혔다(좌변은 …716).
   *    표시 산식이 산술적으로 거짓이 되는 것이라, 안분비를 함께 적어 근거는 유지하되
   *    **등식은 실제 산출 방식으로** 바꾼다.
   *
   * ⚠️ `postApprovalExistingHouse`(위)는 여전히 floor다 — 잔액을 흡수하는 쪽은 청산금분뿐이다.
   */
  const existing = redev.postApprovalExistingHouse.apportionedTransfer;
  return `${fmt(totalTransferPrice)} − ${fmt(existing)} = ${fmt(redev.settlement.apportionedTransfer)} (분양가 안분 후 잔액 — 청산금 비율, 기존주택분 차감)`;
}

/** 취득가액 분할별 산식 */
export function buildRedevAcquisitionFormula(
  branch: RedevBranch,
  redev: RedevelopmentResult,
): string {
  // 사례 46 receiveOnly — settlement 안분 취득가액 = 종전취득가 × (청산금/권리가액)
  if (redev.receiveOnlyMode === true) {
    if (branch === "settlement") {
      // salePriceTotal = rights − settlement → rights = salePriceTotal + settlement
      const settle = redev.settlement.apportionedTransfer;
      const rights = (redev.salePriceTotal ?? 0) + settle;
      const apportioned = redev.settlement.apportionedAcquisition;
      // 종전 취득가액 = apportioned × rights / settle (역산)
      const oldAcq = settle > 0 ? Math.round((apportioned * rights) / settle) : 0;
      return `안분 취득가액 = ${fmt(oldAcq)} × (${fmt(settle)} ÷ ${fmt(rights)}) = ${fmt(apportioned)} (§166①2호 가목 — 종전 취득가 × 청산금 ÷ 권리가액, 1원 미만 절사)`;
    }
    return RECEIVE_ONLY_ZERO_FORMULA;
  }

  if (branch === "preApproval") {
    const meta = redev.valuationMeta;
    if (
      meta &&
      meta.method !== "actual" &&
      meta.method !== "successor_member_decree_162_1_4" &&
      meta.numerator !== undefined &&
      meta.denominator !== undefined &&
      meta.denominator > 0
    ) {
      const rights = redev.preApproval.apportionedTransfer;
      return `환산취득가 = ${fmt(rights)} × (${fmt(meta.numerator)} ÷ ${fmt(meta.denominator)}) = ${fmt(redev.preApproval.apportionedAcquisition)} (§166③ — 권리가액 × 취득 당시 기준시가 ÷ 관리처분계획 인가일 직전 기준시가, 1원 미만 절사)`;
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
  // 사례 46 receiveOnly — settlement 분 별도 필요경비 미산정 (§97①2·3호 슬롯 본 PR 미매핑)
  if (redev.receiveOnlyMode === true) {
    if (branch === "settlement") {
      return "0 (청산금 수령분 별도 필요경비 미산정 — §97①2·3호 슬롯 미매핑)";
    }
    return RECEIVE_ONLY_ZERO_FORMULA;
  }

  /**
   * 🔴 **분할 행은 엔진의 `branch.expenses`를 그대로 쓴다** (2026-09-07 UI 리뷰).
   *
   * 합계는 이미 `redevBranchTotals(redev).expenses`(세 분기 합)로 고쳐져 있었는데 분할 행만
   * 「인가전 = `estimatedLumpDeduction`, 나머지 = 0」으로 남아 **합계와 분할이 어긋났다**.
   * 엔진은 인가전에 `preApprovalNecessaryExpense(개산공제, 인가전필요경비)`(수령 분기는 §166①2호
   * 나목 비율로 안분), 인가후 기존건물분에 `postApprovalExpenseShare.existingHouse`,
   * 청산금 분에 `postApprovalExpenseShare.settlement + settlementPreExpenseShare`를 담는다
   * (`redevelopment.ts:667·694·740`).
   */
  const amount = redev[branch].expenses ?? 0;

  if (branch === "preApproval") {
    const lump = redev.estimatedLumpDeduction ?? 0;
    if (lump > 0 && redev.valuationMeta && redev.valuationMeta.numerator !== undefined) {
      // base는 엔진 echo(지분 기준시가) 우선 — numerator는 물건 전체(100%) 값이다.
      const P_A = redev.valuationMeta.lumpDeductionBase ?? redev.valuationMeta.numerator;
      const lumpFormula = `개산공제 = ${fmt(P_A)} × 3% = ${fmt(lump)} (§163⑥ — 취득 당시 개별주택가격(소득세법 시행령 §164④ 라목) × 3%, 1원 미만 절사)`;
      // 개산공제 외 성분(인가전 필요경비·수령 분기 안분)이 있으면 **합계를 함께** 밝힌다.
      return amount === lump
        ? lumpFormula
        : `${lumpFormula} → 인가전 분 필요경비 합계 ${fmt(amount)} (인가전 필요경비 포함 · 청산금 수령 분기는 §166①2호 나목 비율로 안분된 값)`;
    }
    return amount > 0
      ? `인가전 분 필요경비 ${fmt(amount)} (실가 모드 — 개산공제 미적용)`
      : "필요경비 없음 (실가 모드)";
  }
  // 인가후·청산금 분에는 개산공제(§163⑥)가 없다 — 다만 그 분할 몫의 필요경비는 있을 수 있다.
  return amount > 0
    ? `${branch === "settlement" ? "청산금 분" : "인가후 기존건물분"} 필요경비 ${fmt(amount)} (개산공제 미적용)`
    : "해당 분할에는 개산공제 미적용";
}

/** 양도차익 분할별 산식 (사례 45 — 12억 안분 시 과세대상 표기) */
export function buildRedevGainFormula(
  branch: RedevBranch,
  redev: RedevelopmentResult,
  /**
   * 「**전체** 양도차익」 행인가 — 12억 안분 **전** 값을 쓴다.
   *
   * 🔴 종전에는 한 빌더가 「전체 양도차익」과 「과세대상 양도차익」 **두 행에 모두** 쓰였다.
   *   `detail.gain`은 12억 안분이 걸리면 **안분 後 과세대상**이라(안분 전은
   *   `gainBeforeAllocation`에 따로 있다 — `transfer-tax-redevelopment-transforms.ts:209~211`),
   *   전체 양도차익 행의 자산별 값이 그 행의 합계(Σ`gainBeforeAllocation`)와 어긋났다.
   */
  gross = false,
): string {
  const detail = redev[branch];
  const t = detail.apportionedTransfer;
  const a = detail.apportionedAcquisition;
  const hva = redev.highValueAllocation;

  // 사례 47 — settlement 비과세 차감 3단계 분해
  // 안분 전(gainBeforeAllocation) → 안분 후(gainAfterAllocation) → 비과세 차감 → 0
  if (
    redev.settlementExemptionApplied === true &&
    branch === "settlement" &&
    detail.gainAfterAllocation !== undefined
  ) {
    const before = detail.gainBeforeAllocation ?? detail.gainAfterAllocation;
    const after = detail.gainAfterAllocation;
    if (gross) return `${fmt(t)} − ${fmt(a)} = ${fmt(before)} (안분 전)`;
    return (
      `${fmt(t)} − ${fmt(a)} = ${fmt(before)} (안분 전) ` +
      `→ × (양도가 − 12억) / 양도가 = ${fmt(after)} (안분 후) ` +
      `− 1세대1주택 비과세 차감 ${fmt(after)} = 0 ` +
      `(인가일 평가액 ≤ 12억 — 서면2016-법령해석재산-2705)`
    );
  }

  // 12억 안분 적용 시 detail.gain 은 과세대상(전체 × taxableRatio). 안내 라벨 추가.
  const suffix = hva && !gross
    ? ` (12억 안분 후 과세대상 — 전체 × ${(hva.taxableRatio * 100).toFixed(0)}%)`
    : "";
  const value = gross ? (detail.gainBeforeAllocation ?? detail.gain) : detail.gain;
  if (branch === "preApproval") {
    const lump = redev.estimatedLumpDeduction ?? 0;
    return `${fmt(t)} − ${fmt(a)} − 개산공제 ${fmt(lump)} = ${fmt(value)}${suffix}`;
  }
  return `${fmt(t)} − ${fmt(a)} = ${fmt(value)}${suffix}`;
}

/** 장기보유공제 분할별 산식 (사례 45 — 거주월수 귀속 분리 시 안내) */
export function buildRedevLthdFormula(
  branch: RedevBranch,
  redev: RedevelopmentResult,
): string {
  const detail = redev[branch];

  // 사례 47 — settlement 비과세 차감 시 LTHD 안내
  if (
    redev.settlementExemptionApplied === true &&
    branch === "settlement" &&
    detail.lthdAfterAllocation !== undefined
  ) {
    const after = detail.lthdAfterAllocation;
    const pct = (detail.lthdRate * 100).toFixed(0);
    const years = Math.floor(detail.holdingMonths / 12);
    const months = detail.holdingMonths % 12;
    return (
      `안분 후 ${pct}% × ${fmt(detail.gainAfterAllocation ?? 0)} = ${fmt(after)} ` +
      `(보유 ${years}년 ${months}개월, 표1 강등 — 거주월수 귀속 분리) ` +
      `− 1세대1주택 비과세 차감 ${fmt(after)} = 0`
    );
  }

  if (!detail.gain || detail.gain <= 0) {
    return "장기보유특별공제 대상 양도차익 부존재";
  }
  const years = Math.floor(detail.holdingMonths / 12);
  const months = detail.holdingMonths % 12;
  const pct = (detail.lthdRate * 100).toFixed(0);

  // 거주월수 귀속 메모 (사례 45 — §154⑧ 거주·보유기간 통산 + 해석례 2020-386)
  const attr = redev.lthdResidenceAttribution;
  let residenceMemo = "";
  if (attr) {
    if (branch === "settlement") {
      const tableLabel = attr.payTable === "table2" ? "표2(보유+거주)" : "표1(보유만)";
      residenceMemo = `, 청산금분 거주 ${attr.payResidenceMonths}월 (신축만) → ${tableLabel}`;
    } else {
      const tableLabel = attr.existingTable === "table2" ? "표2(보유+거주)" : "표1(보유만)";
      residenceMemo = `, 기존건물분 거주 ${attr.existingResidenceMonths}월 (종전+신축 통산) → ${tableLabel}`;
    }
  }

  return `${fmt(detail.gain)} × ${pct}% (보유 ${years}년 ${months}개월${residenceMemo}) = ${fmt(detail.lthd)}`;
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
  subject?: "apt" | "right",
  settlementDirection?: "pay" | "receive",
): PerAssetValue[] {
  const labels = getBranchLabels(redev, subject, settlementDirection);
  return BRANCHES.map((branch) => ({
    label: `${labels[branch].prefix} (${labels[branch].legal})`,
    value: pickValue(branch, redev),
    formula: pickFormula(branch, redev),
  }));
}

export function buildRedevPerAssetForTransfer(
  redev: RedevelopmentResult,
  totalTransferPrice: number,
  subject?: "apt" | "right",
  settlementDirection?: "pay" | "receive",
): PerAssetValue[] {
  return buildPerAsset(
    redev,
    (b, r) => r[b].apportionedTransfer,
    (b, r) => buildRedevTransferFormula(b, r, totalTransferPrice),
    subject,
    settlementDirection,
  );
}

export function buildRedevPerAssetForAcquisition(
  redev: RedevelopmentResult,
  subject?: "apt" | "right",
  settlementDirection?: "pay" | "receive",
): PerAssetValue[] {
  return buildPerAsset(
    redev,
    (b, r) => r[b].apportionedAcquisition,
    (b, r) => buildRedevAcquisitionFormula(b, r),
    subject,
    settlementDirection,
  );
}

export function buildRedevPerAssetForExpense(
  redev: RedevelopmentResult,
  subject?: "apt" | "right",
  settlementDirection?: "pay" | "receive",
): PerAssetValue[] {
  return buildPerAsset(
    redev,
    (b, r) => r[b].expenses ?? 0,
    (b, r) => buildRedevExpenseFormula(b, r),
    subject,
    settlementDirection,
  );
}

export function buildRedevPerAssetForGain(
  redev: RedevelopmentResult,
  subject?: "apt" | "right",
  settlementDirection?: "pay" | "receive",
): PerAssetValue[] {
  return buildPerAsset(
    redev,
    (b, r) => r[b].gain,
    (b, r) => buildRedevGainFormula(b, r),
    subject,
    settlementDirection,
  );
}

/**
 * 「**전체** 양도차익」 행 전용 — 12억 안분 **전** 값(`gainBeforeAllocation`).
 *
 * 그 행의 합계는 `effectiveGrossGain(result)` → `redevBranchTotals().gain` =
 * Σ`gainBeforeAllocation`이다. 종전에는 자산별 행이 `buildRedevPerAssetForGain`(안분 後)을
 * 그대로 써서 **합계와 어긋났다** — 「과세대상 양도차익」 행과 값이 완전히 같아지기도 했다.
 */
export function buildRedevPerAssetForGrossGain(
  redev: RedevelopmentResult,
  subject?: "apt" | "right",
  settlementDirection?: "pay" | "receive",
): PerAssetValue[] {
  return buildPerAsset(
    redev,
    (b, r) => r[b].gainBeforeAllocation ?? r[b].gain,
    (b, r) => buildRedevGainFormula(b, r, true),
    subject,
    settlementDirection,
  );
}

export function buildRedevPerAssetForLthd(
  redev: RedevelopmentResult,
  subject?: "apt" | "right",
  settlementDirection?: "pay" | "receive",
): PerAssetValue[] {
  return buildPerAsset(
    redev,
    (b, r) => r[b].lthd,
    (b, r) => buildRedevLthdFormula(b, r),
    subject,
    settlementDirection,
  );
}

export function buildRedevPerAssetForIncome(
  redev: RedevelopmentResult,
  subject?: "apt" | "right",
  settlementDirection?: "pay" | "receive",
): PerAssetValue[] {
  return buildPerAsset(
    redev,
    (b, r) => Math.max(0, r[b].gain - r[b].lthd),
    (b, r) => buildRedevIncomeFormula(b, r),
    subject,
    settlementDirection,
  );
}
