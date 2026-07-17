/**
 * cohabit-besshi-data — 동거주택상속공제신고서 [별지 제6호의2서식] 데이터 빌더
 *
 * 서식 출처: 상속세 및 증여세법 시행규칙 [별지 제6호의2서식] (2020.3.13. 개정)
 * KoreanLaw MCP 서식 구조 검증 완료 (bylSeq=000602).
 *
 * 칸 구조:
 *   1. 신고자: 피상속인(성명·주민번호·상속개시일), 신청인(성명·주민번호·주소)
 *   2. 동거주택 현황:
 *      소재지·취득일 / ①동거기간 / ②평가가액(주택가액-담보채무액)
 *      ③1세대1주택 해당/해당안됨 / ④예외유형
 *      상속인별: ⑤동거주택지분 / ⑥10년이상동거 / ⑦무주택자 / ⑧요건충족지분
 *      ⑨ 계(요건충족지분 합계)
 *   3. 동거주택 상속공제:
 *      ⑩공제대상액(②×⑨×시기별공제율) / ⑪한도(6억) / ⑫공제액(min(⑩,⑪))
 *
 * 미수집 칸(주소·취득일·⑥⑦무주택·④예외유형) = 공란 — D-1 정책.
 * 인쇄 후 수기 작성 안내 포함.
 */

import type {
  Heir,
  InheritanceTaxResult,
} from "@/lib/tax-engine/types/inheritance-gift.types";

// ─────────────────────────────────────────────
// 데이터 타입
// ─────────────────────────────────────────────

export interface Besshi6_2HeirRow {
  /** 상속인 성명 */
  name: string;
  /** 주민등록번호 (미수집 시 공란) */
  residentNumber?: string;
  /** ⑤ 동거주택지분 (0~1) */
  cohabitShare?: number;
  /** ⑥ 10년 이상 동거 요건 충족 여부 */
  meetsCohabitYears?: boolean;
  /** ⑦ 무주택자 요건 — 미수집, 공란 */
  meetsNoHouse?: undefined;
  /** ⑧ 요건충족 지분 */
  qualifiedShare?: number;
}

export interface Besshi6_2Data {
  // 1. 신고자
  /** 피상속인 성명 */
  decedentName?: string;
  /** 피상속인 주민등록번호 */
  decedentResidentNumber?: string;
  /** 상속개시일 */
  deathDate?: string;
  /** 신청인(상속인) 성명 — 1인 신청인 */
  applicantName?: string;
  /** 신청인 주민등록번호 */
  applicantResidentNumber?: string;

  // 2. 동거주택 현황
  /** 동거주택 소재지 (미수집 시 공란) */
  address?: string;
  /** 동거주택 취득일 (미수집 시 공란) */
  acquisitionDate?: string;
  /** ① 동거기간 — 유효 동거연수 (cohabitYears.effectiveYears). 미입력 시 공란 */
  cohabitPeriod?: string;
  /** ② 평가가액 = 주택가액 − 담보채무액 (CohabitDeductionDetail.base) */
  evaluatedValue?: number;
  /** ③ 1세대 1주택 여부 */
  isSingleHousehold?: boolean;
  /** 상속인별 행 */
  heirRows: Besshi6_2HeirRow[];
  /** ⑨ 계 — 요건충족 지분 합계 */
  totalQualifiedShare?: number;

  // 3. 동거주택 상속공제
  /** ⑩ 공제대상액 = ② 평가가액 × ⑨ 요건충족 지분 합계 */
  deductionBase?: number;
  /** ⑪ 한도금액 (6억) */
  cap: number;
  /** ⑫ 동거주택상속공제액 = min(⑩, ⑪) */
  deductionAmount?: number;
}

// ─────────────────────────────────────────────
// 빌더
// ─────────────────────────────────────────────

/**
 * buildBesshi6_2Data — [별지 제6호의2서식] 동거주택상속공제신고서 데이터 빌더.
 *
 * @param result 엔진 결과 (cohabitDeductionDetail 소비)
 * @param heirs 상속인 배열 (isCohabitant=true인 상속인 추출)
 * @param decedentName 피상속인 성명
 * @param decedentResidentNumber 피상속인 주민번호
 * @param deathDate 상속개시일 (InheritanceTaxInput.deathDate — result에 없어 별도 전달)
 * @returns Besshi6_2Data | null (동거주택공제 미적용 시 null)
 */
export function buildBesshi6_2Data(
  result: InheritanceTaxResult,
  heirs?: Heir[],
  decedentName?: string,
  decedentResidentNumber?: string,
  deathDate?: string,
): Besshi6_2Data | null {
  const detail = result.deductionDetail?.cohabitDeductionDetail;
  // 동거주택공제 결과가 없으면 서식 미출력
  if (!detail) return null;

  // 동거주택 해당 상속인 필터
  const cohabitHeirs = (heirs ?? []).filter((h) => h.isCohabitant === true);

  // ⑤⑧ 동거주택지분·요건충족지분 — 단일 상속인이면 지분 1, 복수는 heirAllocations 미소비(공란)
  const heirRows: Besshi6_2HeirRow[] = cohabitHeirs.map((h) => {
    const cy = detail.cohabitYears;
    return {
      name: h.name?.trim() || "(이름 미입력)",
      residentNumber: h.residentNumber,
      cohabitShare: cohabitHeirs.length === 1 ? 1 : undefined,
      meetsCohabitYears: cy ? cy.meetsRequirement : undefined,
      qualifiedShare: cohabitHeirs.length === 1 ? 1 : undefined,
    };
  });

  // 동거주택 상속인이 없는 경우 빈 행 1행
  if (heirRows.length === 0) {
    heirRows.push({ name: "(상속인 미입력)" });
  }

  const totalQualifiedShare = heirRows.reduce(
    (s, r) => s + (r.qualifiedShare ?? 0),
    0,
  );

  // ⑩ 공제대상액 = ② base × §23의2 시기별 공제율(rawDeduction, 2020+ 100%·2016~ 80%·2009~ 40%).
  // 엔진 단일진실: rawDeduction = floor(base × rate), cappedDeduction = min(rawDeduction, cap).
  // ⑨ 지분은 동거 단일상속인=1(복수는 undefined→⑩ 공란)이라 rawDeduction이 곧 ②×⑨×율.
  // 종전 base×지분(율 미반영)은 rate<1(2009~2019 상속)에서 ⑫=min(⑩,⑪)과 자체모순 (M-12·M-13).
  const evaluatedValue = detail.base;
  const deductionBase =
    totalQualifiedShare > 0 ? detail.rawDeduction : undefined;

  // ① 동거기간 표시 (cohabitYears.effectiveYears)
  const cohabitPeriod = detail.cohabitYears
    ? `${detail.cohabitYears.effectiveYears}년 이상`
    : undefined;

  // 신청인 — 1인 동거 상속인 우선, 없으면 공란
  const applicant = cohabitHeirs[0];

  return {
    decedentName,
    decedentResidentNumber,
    deathDate,
    applicantName: applicant?.name?.trim() || undefined,
    applicantResidentNumber: applicant?.residentNumber,
    address: undefined, // 미수집
    acquisitionDate: undefined, // 미수집
    cohabitPeriod,
    evaluatedValue,
    isSingleHousehold: undefined, // 미수집 — 공란
    heirRows,
    totalQualifiedShare: totalQualifiedShare > 0 ? totalQualifiedShare : undefined,
    deductionBase,
    cap: detail.cap,
    deductionAmount: detail.cappedDeduction,
  };
}
