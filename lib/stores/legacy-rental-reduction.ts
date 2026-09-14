/**
 * 레거시 `long_term_rental` 감면 입력 → `rental_97_3` 이관 (R-4, 2026-09-14).
 *
 * 종전에는 레거시 타입을 **그대로 보존**하고 엔진이 시한·등록일·기준시가·규모 게이트 **없이**
 * 8년 50%를 적용했다. 보류 사유는 「§97의3 8년 50% 경과규정의 부칙을 확보하지 못했다」였는데
 * 그 근거를 확보하면서(법률 제19199호 부칙 §38 + 2022-12-08 시행본 mst 237393) 사라졌다.
 *
 * 이관 원칙:
 *   · **없는 사실을 만들지 않는다** — 구 폼에는 등록일·임대개시일이 없다(`rentalYears` 연수뿐).
 *     연수로 날짜를 역산하면 추정 입력이 되므로 **비워 두고** ⑧이 사용자에게 묻게 한다.
 *   · 승계 가능한 사실 하나만 옮긴다 — 구 폼이 직접 물었던 **임대료 5% 증액 요건**.
 *
 * 두 경로가 모두 이 함수를 쓴다:
 *   ① 폼-전역 구버전 세션 → `calc-wizard-migration.ts`
 *   ② 이미 레거시 타입이 들어 있는 자산 폼 → `calc-wizard-asset-migrate-rental-split.ts`
 * ②가 없으면 2026-04-25~2026-09-14 사이에 저장된 세션의 감면이 **조용히 사라진다**
 * (폼 union에서 빠지고 ④·⑫도 더는 받지 않기 때문이다).
 *
 * 이력(IndexedDB)은 이미 같은 방향으로 치환한다 —
 * `lib/storage/migrations/reduction-reclassification.ts`.
 */
export function legacyLongTermRentalToRental973(
  legacyRentIncreaseRatePct: unknown,
): Record<string, unknown> {
  const pct = Number(legacyRentIncreaseRatePct ?? 0);
  return {
    type: "rental_97_3",
    registrationDate: "",
    rentalStartDate: "",
    isTaxRegistered: false,
    // 구 폼의 「임대료 인상률(%)」 — 5% 초과면 위반, 이하면 위반 없음. 값이 없으면 미선택(차단).
    rentIncreaseViolationMode: Number.isFinite(pct) ? (pct > 5 ? "has_violation" : "none") : "",
    rentHistory: [],
    hasVacancyOverGrace: null,
    rentalContinuesToTransfer: null,
    stdPriceAtRentalEnd: "",
    stdPriceAtAcquisition: "",
    stdPriceAtTransfer: "",
    vacancyPeriods: [],
    rentalHousingType: "long_term_private",
    region: "capital",
    officialPriceAtStart: "",
    isNationalHousingScale: false,
    isConvertedFromShortTerm: false,
    isPrivateConstructionRental: false,
  };
}
