/**
 * 차감형 감면 농어촌특별세의 시행령 항 번호 — 양도일(성립 시점)별 단일 헬퍼 (리뷰 후속 R 3항 · 세액 불변, 라벨만).
 *
 * 농어촌특별세법 시행령: 2013.8.26.까지 「대통령령으로 정하는 계산방법」 산식은 §5①, 2013.8.27. 개정 이후는 §5②.
 * 엔진 5곳(일반·다필지·합산·재개발·임대 차감)과 결과 화면이 같은 헬퍼로 고른다.
 */
import { TRANSFER } from "./legal-codes";

/** 시행령 §5②로 항 번호가 바뀐 시행일(2013.8.27.) — 이 날 이후 양도분은 §5②. */
export const RURAL_SURTAX_DECREE_5_2_FROM = new Date("2013-08-27");

/**
 * 차감형 농특세 근거 라벨. 양도일이 모두 2013.8.27. 전이면 시행령 §5①, 모두 이후이면 §5②.
 * 양도일이 갈리는 합산이면 둘 다 적는다. 양도일이 없으면 현행(§5②).
 */
export function ruralSurtaxDeductionBasis(...transferDates: Array<Date | undefined>): string {
  const dates = transferDates.filter((d): d is Date => d instanceof Date);
  if (dates.length === 0) return TRANSFER.RURAL_SURTAX_DEDUCTION;
  const cut = RURAL_SURTAX_DECREE_5_2_FROM.getTime();
  const before = dates.filter((d) => d.getTime() < cut).length;
  if (before === 0) return TRANSFER.RURAL_SURTAX_DEDUCTION;
  if (before === dates.length) return TRANSFER.RURAL_SURTAX_DEDUCTION_BEFORE_2013_08_27;
  return `${TRANSFER.RURAL_SURTAX_DEDUCTION} (2013.8.26. 이전 양도분은 시행령 §5①)`;
}

/** 엔진 단계 목록에서 차감형 농특세 근거를 읽는다(결과 화면용) — 없으면 undefined. */
export function findRuralSurtaxDeductionBasis(steps: ReadonlyArray<{ legalBasis?: string }> | undefined): string | undefined {
  return steps?.find((st) => st.legalBasis?.startsWith(TRANSFER.RURAL_SURTAX_DEDUCTION_BEFORE_2013_08_27) || st.legalBasis?.startsWith(TRANSFER.RURAL_SURTAX_DEDUCTION))?.legalBasis;
}
