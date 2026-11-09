/**
 * §98 시리즈 경계·시행일 게이트 (리뷰 US-05·US-57·US-17·US-18·US-20·US-22·US-75, 2026-11-08)
 *
 * 조문별 평가 파일(`unsold-98-3.ts` 등)·`period-check.ts`·`unsold-hybrid-p5.ts`(주택 수 제외 창)가
 * **같은 상수·같은 술어**를 쓰도록 한 곳에 둔다. 이 파일은 순수 함수만 가진다(DB·평가 파일 의존 없음).
 *
 * 근거 부칙(KoreanLaw MCP 부칙 원문 실독 2026-11-08, `lib/tax-engine/legal-codes/transfer.ts` TRANSFER.UNSOLD_98_*):
 * - 법률 제10285호(2010.5.14.) 부칙 제2조: 「제98조의5의 개정규정은 이 법 시행 후 최초로 계약하는 분부터 적용한다」
 * - 법률 제9272호(2009.1.1. 시행) 부칙 제21조: 「제98조의2의 개정규정은 이 법 시행 후 최초로 양도하는 분부터 적용한다」
 * - 법률 제9512호(2009.3.25.) 부칙 제6조(§98의2④)·제7조(§98의3): 「이 법 시행 후 최초로 양도하는 분부터 적용」
 * - 법률 제9671호(2009.5.21.) 부칙 제15조(§98의3): 「이 법 시행 후 최초로 양도하는 분부터 적용」 — 비거주자 규정 신설분
 * 「시행 후 최초로 양도하는 분」은 시행일 당일 양도를 포함한다(저장소 선례 rental_97_4 `transferDate >= D(...)`).
 * 날짜는 UTC 자정 문자열 파싱(`T` 접미사 금지) — period-check `D()`와 같은 기준이다.
 */

import { TRANSFER } from "../legal-codes/transfer";
import { UNSOLD_98_DECREE } from "../legal-codes/transfer-house";
import type { UnsoldHybridIneligibleReason } from "./unsold-hybrid";

// ── 날짜 상수 ──
/** §98의2 매매계약일 하한 — 령 §98의2①1·2호 「2008년 11월 3일」 (미분양 정의상 그 전 본인 계약은 성립할 수 없다, 재산세과-267) */
export const UNSOLD_98_2_CONTRACT_FROM = new Date("2008-11-03");
/** §98의2 본문 특칙 시행일 — 법률 제9272호 부칙 제1조·제21조 */
export const UNSOLD_98_2_TRANSFER_FROM = new Date("2009-01-01");
/** §98의2④ 주택 수 제외 신설 — 법률 제9512호 부칙 제1조·제6조 */
export const UNSOLD_98_2_EXCLUSION_TRANSFER_FROM = new Date("2009-03-25");
/** §98의3 시행일(거주자) — 법률 제9512호 부칙 제1조·제7조 */
export const UNSOLD_98_3_TRANSFER_FROM = new Date("2009-03-25");
/** §98의3 비거주자 규정 신설 시행일 — 법률 제9671호 부칙 제1조·제15조 */
export const UNSOLD_98_3_TRANSFER_FROM_NONRESIDENT = new Date("2009-05-21");
/** §98의5 최초 매매계약 시작일 — 법률 제10285호 부칙 제1조·제2조 (공포·시행 2010.5.14.) */
export const UNSOLD_98_5_CONTRACT_FROM = new Date("2010-05-14");
/** §98의6 「2011년 3월 29일 현재 준공후미분양」 — 령 §98의5②·③2·3호 (포함) */
export const UNSOLD_98_6_ACQUISITION_FROM = new Date("2011-03-29");
/** §98의7 시행일 — 법률 제11486호 부칙 제1조·제2조 (공포·시행 2012.10.2.) */
export const UNSOLD_98_7_TRANSFER_FROM = new Date("2012-10-02");

const t = (d: Date) => d.getTime();
type Reason = UnsoldHybridIneligibleReason;

/** §98의2 — 매매계약일 하한(US-17) + 양도일 시행일 게이트(US-18). 날짜 미입력은 통과(미입력은 별도 검증이 막는다). */
export function unsold982PeriodGateReasons(contractDate: Date | undefined, transferDate: Date | undefined): Reason[] {
  const legalBasis = "조특법 §98의2①";
  const out: Reason[] = [];
  if (contractDate && t(contractDate) < t(UNSOLD_98_2_CONTRACT_FROM)) {
    out.push({
      code: "CONTRACT_BEFORE_UNSOLD_CUTOFF",
      message: "최초 매매계약일이 2008.11.3. 전이면 미분양주택에 해당할 수 없습니다 — 령 §98의2①1호(2008.11.2.까지 분양계약 미체결 후 11.3. 이후 선착순)·2호(11.3. 현재 입주자 계약일 미경과)와 맞지 않습니다.",
      legalBasis,
    });
  }
  if (transferDate && t(transferDate) < t(UNSOLD_98_2_TRANSFER_FROM)) {
    out.push({
      code: "TRANSFER_BEFORE_EFFECTIVE",
      message: `§98의2는 2009.1.1. 이후 최초로 양도하는 분부터 적용됩니다 (${TRANSFER.UNSOLD_98_2_ADDENDUM}).`,
      legalBasis: TRANSFER.UNSOLD_98_2_ADDENDUM,
    });
  }
  return out;
}

/** §98의3 — 양도일 시행일 게이트(US-20). 거주자 2009.3.25. / 국내사업장 없는 비거주자 2009.5.21. (자기건설 ②도 같다) */
export function unsold983TransferGateReasons(
  transferDate: Date | undefined,
  residencyType: "resident" | "nonresident_no_pe" | "nonresident_with_pe" | undefined,
): Reason[] {
  if (!transferDate) return [];
  const nonresident = residencyType === "nonresident_no_pe";
  const from = nonresident ? UNSOLD_98_3_TRANSFER_FROM_NONRESIDENT : UNSOLD_98_3_TRANSFER_FROM;
  if (t(transferDate) >= t(from)) return [];
  const basis = nonresident ? TRANSFER.UNSOLD_98_3_ADDENDUM_NONRESIDENT : TRANSFER.UNSOLD_98_3_ADDENDUM;
  return [{
    code: "TRANSFER_BEFORE_EFFECTIVE",
    message: nonresident
      ? `국내사업장 없는 비거주자의 §98의3 적용은 2009.5.21. 이후 최초로 양도하는 분부터입니다 (${basis}).`
      : `§98의3은 2009.3.25. 이후 최초로 양도하는 분부터 적용됩니다 (${basis}).`,
    legalBasis: basis,
  }];
}

/** §98의5 — 최초 매매계약일이 시작일(2010.5.14.) 전인가(US-05). 평가부는 이 술어를 쓴다. */
export function isBeforeUnsold985ContractStart(contractDate: Date): boolean {
  return t(contractDate) < t(UNSOLD_98_5_CONTRACT_FROM);
}

/** §98의6 — 「2011.3.29. 현재 준공후미분양」 하한(US-22). 취득일 < 2011-03-29이면 준공후미분양주택이 아니다. */
export function unsold986AcquisitionGateReasons(acquisitionDate: Date | undefined): Reason[] {
  if (!acquisitionDate || t(acquisitionDate) >= t(UNSOLD_98_6_ACQUISITION_FROM)) return [];
  return [{
    code: "ACQUISITION_BEFORE_COMPLETED_UNSOLD_CUTOFF",
    message: "취득일이 2011.3.29. 전이면 「2011년 3월 29일 현재 준공후미분양주택」에 해당할 수 없습니다 — 령 §98의5②·③2·3호 (매수자의 최초 매매계약은 2011.3.29. 이후).",
    legalBasis: UNSOLD_98_DECREE.D98_6_PRICE_AREA,
  }];
}

/** §98의7 — 양도일 시행일 게이트(US-75, 법률 제11486호 부칙 제2조). */
export function unsold987TransferGateReasons(transferDate: Date | undefined): Reason[] {
  if (!transferDate || t(transferDate) >= t(UNSOLD_98_7_TRANSFER_FROM)) return [];
  return [{
    code: "TRANSFER_BEFORE_EFFECTIVE",
    message: `§98의7은 2012.10.2. 이후 최초로 양도하는 주택부터 적용됩니다 (${TRANSFER.UNSOLD_98_7_ADDENDUM}).`,
    legalBasis: TRANSFER.UNSOLD_98_7_ADDENDUM,
  }];
}

/**
 * 모드 2(주택 수 제외) 공통 게이트 — 양도일 하한(US-75) · 감면주택 계약일/취득일 하한(US-17·US-22).
 * 반환값은 사유 문구(통과면 undefined). `meetsSpecialHouseReductionRequirements`(영 §167의3①5호)도 이 게이트는 무시하지 않는다 —
 * 시행 전이면 「감면되는 주택」 자체가 아니다.
 */
export function specialHouseExclusionGateReason(
  article: string,
  ctx: { transferDate: Date; houseContractDate?: Date; houseAcquisitionDate?: Date },
): string | undefined {
  const before = (d: Date | undefined, from: Date) => d !== undefined && t(d) < t(from);
  switch (article) {
    case "unsold_98_2":
      if (before(ctx.houseContractDate, UNSOLD_98_2_CONTRACT_FROM)) {
        return "감면주택의 최초 매매계약일이 2008.11.3. 전이면 미분양주택에 해당할 수 없습니다 (조특령 §98의2①).";
      }
      if (before(ctx.transferDate, UNSOLD_98_2_EXCLUSION_TRANSFER_FROM)) {
        return `§98의2④(소유주택 제외)는 2009.3.25. 이후 최초로 양도하는 분부터 적용됩니다 (${TRANSFER.UNSOLD_98_2_EXCLUSION_ADDENDUM}).`;
      }
      return undefined;
    case "unsold_98_3":
      return before(ctx.transferDate, UNSOLD_98_3_TRANSFER_FROM)
        ? `§98의3(소유주택 제외 포함)은 2009.3.25. 이후 최초로 양도하는 분부터 적용됩니다 (${TRANSFER.UNSOLD_98_3_ADDENDUM}).`
        : undefined;
    case "unsold_98_6": {
      // 🔴 사용자 결정(2026-11-09, 그룹 K): §98의6 감면주택을 2011.3.29.~5.18.에 취득하고 그 기간(§98의6 신설 법률 제10631호
      // 2011.5.19. 시행 전)에 다른 주택을 양도해도 주택 수에서 뺀다 — **양도일 게이트를 두지 않는다(현행 동작 유지)**.
      // 근거: 부칙 제10631호 제4조(`TRANSFER.UNSOLD_98_6_ADDENDUM`) 「제98조의6의 개정규정은 2011년 3월 29일 현재 준공후미분양주택에
      // 해당되는 주택을 최초로 양도하는 분부터 적용한다」에 §98의2④·§98의3·§98의7(「이 법 시행 후 최초로 양도」)과 달리 「시행 후」
      // 문언이 없다. §98의2·§98의3·§98의7 case의 양도일 게이트와 의도적으로 비대칭이다 — 대칭으로 「고치지」 말 것.
      const basisDate = ctx.houseContractDate ?? ctx.houseAcquisitionDate;
      return before(basisDate, UNSOLD_98_6_ACQUISITION_FROM)
        ? "감면주택의 최초 매매계약일(없으면 취득일)이 2011.3.29. 전이면 「2011년 3월 29일 현재 준공후미분양주택」에 해당할 수 없습니다 (조특령 §98의5②·③)."
        : undefined;
    }
    case "unsold_98_7":
      return before(ctx.transferDate, UNSOLD_98_7_TRANSFER_FROM)
        ? `§98의7(소유주택 제외 포함)은 2012.10.2. 이후 최초로 양도하는 주택부터 적용됩니다 (${TRANSFER.UNSOLD_98_7_ADDENDUM}).`
        : undefined;
    default:
      return undefined;
  }
}
