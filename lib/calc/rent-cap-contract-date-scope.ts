/**
 * 장기임대 「5%를 넘게 올린 계약의 체결·갱신일」 칸의 범위 — ⑤ 노출 · ④⑬ 전송이 **같은 술어**를 쓴다 (E-14m).
 *
 * 대통령령 제29523호 부칙 제6조: 가·다·마·바목(§167의3①2호)의 5% 요건은 2019-02-12 이후 체결·갱신한
 * 임대차계약분부터 적용된다. 등록(사업자등록·임대사업자 등록 중 늦은 날)이 그 날 이후면 비교 기준 계약도 그 뒤라
 * 물을 필요가 없다. 5% 충족을 선언했으면 묻지 않는다. 화면에서 사라진 칸의 stale 값은 보내지 않는다.
 *
 * ⑧은 없다 — 선택 입력이고, 비워 두면 종전과 같이 5% 미충족으로 판정한다(혜택을 추정하지 않는다).
 */
import type { RentalDeclaration } from "@/lib/stores/calc-wizard-asset-nbl";
import { ARTICLE_BY_RENTAL_TYPE } from "@/lib/tax-engine/multi-house-surcharge-count";
import { RENT_CAP_29523_ARTICLES, isRentCapContractSubject } from "@/lib/tax-engine/rental-article/check";
import { toOptionalDate } from "@/lib/api/date-coerce";

export function rentIncreaseContractDateInScope(d: RentalDeclaration | undefined): boolean {
  if (!d?.isLongTermRental || !d.rentalType || d.rentIncreaseUnder5Pct) return false;
  const article = d.rentalType === "G" ? d.saMokBaseArticle : ARTICLE_BY_RENTAL_TYPE[d.rentalType];
  if (!article || !RENT_CAP_29523_ARTICLES.includes(article)) return false;
  const biz = (d.businessRegistrationDate ?? "").slice(0, 10);
  const rent = (d.rentalRegistrationDate ?? "").slice(0, 10);
  if (!d.isRegisteredRental || !biz || !rent) return false;
  // 등록기준일 = 두 등록 중 늦은 날(엔진 `deriveEffectiveRegDate`와 같은 규약)
  const effective = toOptionalDate(biz > rent ? biz : rent);
  return !!effective && !isRentCapContractSubject(effective);
}

/** ④⑬ — 범위 안이고 값이 있을 때만 싣는다 */
export function rentIncreaseContractDatePayload(d: RentalDeclaration | undefined): { rentIncreaseContractDate?: string } {
  return rentIncreaseContractDateInScope(d) && d?.rentIncreaseContractDate
    ? { rentIncreaseContractDate: d.rentIncreaseContractDate }
    : {};
}
