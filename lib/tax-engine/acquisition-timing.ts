/**
 * 취득세 취득 시기 확정 모듈
 *
 * 지방세법 §20 — 취득 시기 결정 규칙
 * - 유상취득: 잔금지급일 (또는 등기접수일 중 빠른 날)
 * - 무상취득: 계약일 (증여·기부) / 상속개시일 (상속)
 * - 원시취득: 사용승인서 발급일 (또는 사실상 사용개시일)
 * - 간주취득: 과점주주 취득일 / 지목변경일 / 개수 완료일
 */

import { ACQUISITION, ACQUISITION_CONST } from "./legal-codes";
import type { AcquisitionCause, InstallmentPayment } from "./types/acquisition.types";

// ============================================================
// 취득 시기 결과 타입
// ============================================================

export interface AcquisitionTimingResult {
  acquisitionDate: string;   // 확정 취득일 (YYYY-MM-DD)
  filingDeadline: string;    // 신고 기한 (YYYY-MM-DD)
  timingBasis: string;       // 취득 시기 결정 근거
  legalBasis: string;
  warnings: string[];
  /** 연부취득 회차별 신고기한 스케줄 (연부취득인 경우에만 포함) */
  filingSchedule?: Array<{
    paymentDate: string;      // 회차 지급일 (YYYY-MM-DD)
    deadline: string;         // 신고기한 (YYYY-MM-DD, 지급일 + 60일)
    label?: string;           // 회차 라벨
  }>;
}

// ============================================================
// 날짜 유틸리티
// ============================================================

/**
 * 두 날짜 중 빠른 날짜 반환
 */
function earlierDate(a: string | undefined, b: string | undefined): string | undefined {
  if (!a && !b) return undefined;
  if (!a) return b;
  if (!b) return a;
  return a < b ? a : b;
}

/**
 * 날짜에 일수 더하기
 */
function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * 날짜에 월수 더하기
 */
function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

/**
 * 해당 날짜가 속한 달의 말일 (YYYY-MM-DD)
 * 다음 달 0일 = 이번 달 말일
 */
function endOfMonth(dateStr: string): string {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + 1, 0);
  return d.toISOString().slice(0, 10);
}

/**
 * 오늘 날짜 (YYYY-MM-DD)
 */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// ============================================================
// 취득 시기 결정 규칙 (지방세법 §20)
// ============================================================

interface AcquisitionTimingInput {
  acquisitionCause: AcquisitionCause;
  /** 잔금 지급일 (유상취득) */
  balancePaymentDate?: string;
  /** 등기접수일 (유상취득) */
  registrationDate?: string;
  /** 계약일 (증여·교환·기부) */
  contractDate?: string;
  /** 사용승인서 발급일 (신축·증축·개축) */
  usageApprovalDate?: string;
  /** 사실상 사용개시일 (사용승인 이전 실사용 시) */
  actualUsageDate?: string;
  /** 간주취득 완료일 (과점주주 취득일 / 지목변경일 / 개수 완료일) */
  deemedAcquisitionDate?: string;
  /** 연부취득 회차 목록 (시행령 §20⑤ — 각 지급일이 취득시기) */
  installments?: InstallmentPayment[];
}

/**
 * 취득 시기 확정 (지방세법 §20)
 *
 * 유상취득: 잔금지급일과 등기접수일 중 빠른 날
 * 상속:     상속개시일 (피상속인 사망일)
 * 증여·기부: 계약일 (증여계약서·기부채납)
 * 원시취득: 사용승인서 발급일 (없으면 사실상 사용개시일)
 * 간주취득: 과점주주 주주명부 확정일 / 지목변경 공부 등록일 / 개수 사용개시일
 */
export function determineAcquisitionTiming(
  input: AcquisitionTimingInput
): AcquisitionTimingResult {
  const warnings: string[] = [];
  const cause = input.acquisitionCause;

  // ── 유상취득 (매매·교환·공매경매·현물출자) ──
  if (["purchase", "exchange", "auction", "in_kind_investment"].includes(cause)) {
    // 연부취득: 시행령 §20⑤ — 각 연부금 지급일이 취득시기 (마지막 회차 = 실질 취득 완료일)
    if (input.installments && input.installments.length >= 2) {
      const lastPayment = input.installments[input.installments.length - 1];
      const acquisitionDate = lastPayment.paymentDate;

      // 각 회차별 신고기한 계산 (지급일 + 60일)
      const filingSchedule = input.installments.map((p, i) => ({
        paymentDate: p.paymentDate,
        deadline: addDays(p.paymentDate, ACQUISITION_CONST.INSTALLMENT_FILING_DAYS),
        label: p.label ?? `${i + 1}회차`,
      }));

      warnings.push(
        `연부취득: 취득시기는 각 연부금 지급일입니다 (시행령 §20⑤). ` +
        `신고기한은 각 지급일로부터 60일 이내입니다.`
      );
      filingSchedule.forEach(s => {
        warnings.push(`${s.label} (${s.paymentDate}) 신고기한: ${s.deadline}`);
      });

      return {
        acquisitionDate,
        filingDeadline: filingSchedule[filingSchedule.length - 1].deadline,
        timingBasis: `연부취득 마지막 회차 지급일(${acquisitionDate})`,
        legalBasis: ACQUISITION.INSTALLMENT_TIMING,
        filingSchedule,
        warnings,
      };
    }

    const earlier = earlierDate(input.balancePaymentDate, input.registrationDate);

    if (!earlier) {
      const fallback = today();
      warnings.push("잔금지급일·등기접수일 모두 미입력 — 오늘 날짜를 임시 취득일로 사용합니다.");
      return {
        acquisitionDate: fallback,
        filingDeadline: addDays(fallback, ACQUISITION_CONST.FILING_DEADLINE_DAYS),
        timingBasis: "잔금지급일 또는 등기접수일 중 빠른 날 (미입력 — 임시)",
        legalBasis: ACQUISITION.ACQUISITION_TIMING,
        warnings,
      };
    }

    return {
      acquisitionDate: earlier,
      filingDeadline: addDays(earlier, ACQUISITION_CONST.FILING_DEADLINE_DAYS),
      timingBasis:
        input.balancePaymentDate && input.registrationDate
          ? `잔금지급일(${input.balancePaymentDate})과 등기접수일(${input.registrationDate}) 중 빠른 날`
          : input.balancePaymentDate
          ? `잔금지급일(${input.balancePaymentDate})`
          : `등기접수일(${input.registrationDate})`,
      legalBasis: ACQUISITION.ACQUISITION_TIMING,
      warnings,
    };
  }

  // ── 상속 ──
  if (cause === "inheritance" || cause === "inheritance_farmland") {
    // 상속개시일 = 피상속인 사망일. balancePaymentDate를 상속개시일로 재활용
    const inheritanceDate = input.balancePaymentDate ?? input.contractDate;

    if (!inheritanceDate) {
      const fallback = today();
      warnings.push("상속개시일(사망일) 미입력 — 오늘 날짜를 임시 취득일로 사용합니다.");
      return {
        acquisitionDate: fallback,
        filingDeadline: addMonths(fallback, ACQUISITION_CONST.INHERITANCE_FILING_MONTHS),
        timingBasis: "상속개시일 (피상속인 사망일, 미입력 — 임시)",
        legalBasis: ACQUISITION.ACQUISITION_TIMING,
        warnings,
      };
    }

    return {
      acquisitionDate: inheritanceDate,
      // 상속: 상속개시일로부터 6개월 이내 신고
      filingDeadline: addMonths(inheritanceDate, ACQUISITION_CONST.INHERITANCE_FILING_MONTHS),
      timingBasis: `상속개시일(${inheritanceDate}) — 피상속인 사망일`,
      legalBasis: ACQUISITION.ACQUISITION_TIMING,
      warnings,
    };
  }

  // ── 증여·부담부증여·기부 ──
  if (["gift", "burdened_gift", "donation"].includes(cause)) {
    const contractDate = input.contractDate ?? input.balancePaymentDate;

    if (!contractDate) {
      const fallback = today();
      warnings.push("증여계약일 미입력 — 오늘 날짜를 임시 취득일로 사용합니다.");
      return {
        acquisitionDate: fallback,
        // §20①: 무상취득(상속 제외)은 취득일 속한 달 말일부터 3개월
        filingDeadline: addMonths(endOfMonth(fallback), ACQUISITION_CONST.GRATUITOUS_FILING_MONTHS),
        timingBasis: "증여계약일 (미입력 — 임시)",
        legalBasis: ACQUISITION.ACQUISITION_TIMING,
        warnings,
      };
    }

    return {
      acquisitionDate: contractDate,
      // §20①: 무상취득·부담부증여(상속 제외)은 취득일이 속하는 달의 말일부터 3개월 이내 신고
      filingDeadline: addMonths(endOfMonth(contractDate), ACQUISITION_CONST.GRATUITOUS_FILING_MONTHS),
      timingBasis: `증여계약일(${contractDate})`,
      legalBasis: ACQUISITION.ACQUISITION_TIMING,
      warnings,
    };
  }

  // ── 원시취득 (신축·증축·개축·공유수면 매립) ──
  if (["new_construction", "extension", "reconstruction", "reclamation"].includes(cause)) {
    // 사실상 사용개시일이 사용승인서 발급일보다 빠른 경우 → 사실상 사용개시일
    const timing =
      input.actualUsageDate && input.usageApprovalDate
        ? earlierDate(input.actualUsageDate, input.usageApprovalDate)!
        : input.actualUsageDate ?? input.usageApprovalDate;

    if (!timing) {
      const fallback = today();
      warnings.push("사용승인서 발급일·사실상 사용개시일 모두 미입력 — 오늘 날짜를 임시 취득일로 사용합니다.");
      return {
        acquisitionDate: fallback,
        filingDeadline: addDays(fallback, ACQUISITION_CONST.FILING_DEADLINE_DAYS),
        timingBasis: "사용승인서 발급일 또는 사실상 사용개시일 중 빠른 날 (미입력 — 임시)",
        legalBasis: ACQUISITION.ACQUISITION_TIMING,
        warnings,
      };
    }

    const isActualUsedEarlier =
      input.actualUsageDate &&
      input.usageApprovalDate &&
      input.actualUsageDate < input.usageApprovalDate;

    if (isActualUsedEarlier) {
      warnings.push(
        `사실상 사용개시일(${input.actualUsageDate})이 사용승인서 발급일(${input.usageApprovalDate})보다 빠릅니다. 사실상 사용개시일이 취득일입니다.`
      );
    }

    return {
      acquisitionDate: timing,
      filingDeadline: addDays(timing, ACQUISITION_CONST.FILING_DEADLINE_DAYS),
      timingBasis: isActualUsedEarlier
        ? `사실상 사용개시일(${timing}) — 사용승인서 발급일 이전 실사용`
        : `사용승인서 발급일(${timing})`,
      legalBasis: ACQUISITION.ACQUISITION_TIMING,
      warnings,
    };
  }

  // ── 간주취득 ──
  if (["deemed_major_shareholder", "deemed_land_category", "deemed_renovation"].includes(cause)) {
    const deemedDate = input.deemedAcquisitionDate ?? input.contractDate ?? today();

    if (!input.deemedAcquisitionDate) {
      warnings.push("간주취득 완료일 미입력 — 제공된 날짜 또는 오늘 날짜를 사용합니다.");
    }

    return {
      acquisitionDate: deemedDate,
      filingDeadline: addDays(deemedDate, ACQUISITION_CONST.FILING_DEADLINE_DAYS),
      timingBasis:
        cause === "deemed_major_shareholder" ? "과점주주 주주명부 확정일" :
        cause === "deemed_land_category" ? "지목변경 공부 등록일" :
        "개수 완료·사용개시일",
      legalBasis: ACQUISITION.ACQUISITION_TIMING,
      warnings,
    };
  }

  // 알 수 없는 취득 원인 — 기본값
  const fallback = today();
  warnings.push(`취득 원인(${cause})에 대한 취득 시기 규칙 없음 — 오늘 날짜를 사용합니다.`);
  return {
    acquisitionDate: fallback,
    filingDeadline: addDays(fallback, ACQUISITION_CONST.FILING_DEADLINE_DAYS),
    timingBasis: "알 수 없는 취득 원인 — 임시",
    legalBasis: ACQUISITION.ACQUISITION_TIMING,
    warnings,
  };
}
