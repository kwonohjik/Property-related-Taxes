/**
 * 종부령 §3①1호 가목·7호 가목 건설임대 공시가격 상한 6억/9억의 적용례 — 대통령령 제31447호(2021.2.17.) 부칙 제2조
 * (2022.8.2. 대통령령 제32831호로 개정 — KoreanLaw MCP MST 244073 원문 확인).
 *   1. 공공건설임대: 2021.2.17. 이후 사용승인(사용검사 확인증)을 받은 주택만 9억
 *   2. 민간건설임대: 2021년도 납세의무 성립분은 2021.2.17. 이후 등록, 2022년도 이후는 2021.2.17. 이후 사용승인 주택만 9억
 * 그 밖은 종전 규정 6억(2020.8.7. 시행본 — 부칙의 반대해석, 해석례는 9억 쪽만 다룬다: 서면-2021-부동산-7363 · 확인 필요).
 * 2025 과세연도부터는 대통령령 제35352호가 가목을 새로 정해(30호 구간 포함) 부칙 제2조①로 전면 적용 — 사용승인일을 묻지 않는다
 * (계획서 Q-3 a · 그 뒤에도 제31447호 한정이 남는지는 해석례 0건 — V-1).
 * 4호 나목(미임대 민간건설임대)도 같은 부칙이 걸린다 — 제35352호 부칙 제2조①은 1·2·3·7·8호만 들므로(원문 확인 2026-11-13)
 * 4호는 2025 이후에도 사용승인일로 가른다(계획서 4·5·9호 Q-2 a).
 * 계획서: docs/01-plan/features/comprehensive-rental-excl-price-cap-eras.plan.md §4-1
 */
import { COMPREHENSIVE_EXCL, COMPREHENSIVE_EXCL_CONST } from "./legal-codes";
import type { RentalExclusionInput } from "./types/comprehensive.types";

type RegType = RentalExclusionInput["registrationType"];

/** 1호(민간·공공 건설)·7호(공공지원·장기일반 건설)·4호(미임대 민간건설) */
const BUILT_TYPES: ReadonlySet<RegType> = new Set([
  "private_construction",
  "public_construction",
  "public_support_construction",
  "vacant_construction",
]);

const NINE_EOK_FROM = Date.UTC(2021, 1, 17); // 부칙 제31447호 — 「2021년 2월 17일 이후」(당일 포함)
const FULL_NINE_EOK_ASSESSMENT = Date.UTC(2025, 1, 28); // 대통령령 제35352호 시행 — 2025 과세기준일부터

function ms(d: Date | null | undefined): number | null {
  return d && !Number.isNaN(d.getTime()) ? d.getTime() : null;
}

export interface BuiltRentalCap {
  /** 30호 미만 기본 상한(원) */
  cap: number;
  /** 6억을 적용한 까닭(가격 초과일 때 사유에 붙인다) · 9억이면 null */
  reason: string | null;
}

/** 건설임대 1·7호의 30호 미만 기본 상한 · 4호 나목 상한. 건설임대가 아니면 null. */
export function builtRentalBaseCap(input: RentalExclusionInput): BuiltRentalCap | null {
  if (!BUILT_TYPES.has(input.registrationType)) return null;
  const nine = COMPREHENSIVE_EXCL_CONST.BUILT_RENTAL_PRICE_UNDER30;
  const six = COMPREHENSIVE_EXCL_CONST.BUILT_RENTAL_PRICE_PRE_20210217;
  const asmt = input.assessmentDate.getTime();
  if (asmt >= FULL_NINE_EOK_ASSESSMENT && input.registrationType !== "vacant_construction") return { cap: nine, reason: null };
  if (asmt < NINE_EOK_FROM) return { cap: six, reason: COMPREHENSIVE_EXCL.BUILT_PRICE_CAP_6EOK_PRE_20210217 };
  const year = input.assessmentDate.getUTCFullYear();
  const isPublic = input.registrationType === "public_construction";
  // 2021년도 민간건설은 등록일, 그 밖(공공건설 · 2022년도 이후 민간건설)은 사용승인일
  const basis = !isPublic && year === 2021 ? ms(input.rentalRegistrationDate) : ms(input.usageApprovalDate);
  if (basis === null) return { cap: six, reason: COMPREHENSIVE_EXCL.USAGE_APPROVAL_DATE_UNKNOWN };
  return basis >= NINE_EOK_FROM
    ? { cap: nine, reason: null }
    : { cap: six, reason: COMPREHENSIVE_EXCL.BUILT_PRICE_CAP_6EOK_PRE_20210217 };
}
