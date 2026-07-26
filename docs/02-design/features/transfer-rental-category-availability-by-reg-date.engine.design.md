# 임대 구분 등록시기별 활성 판정 — 엔진 설계

> 계획서: `transfer-rental-category-availability-by-reg-date.plan.md`. UI: 동명 `.ui.design.md`.
> **엔진 input/result 타입 변경 없음** — §155⑳ 도메인에 **순수 파생 헬퍼 1개**(`deriveCategoryAvailability`)만 추가.
> 판정 규칙은 신설하지 않고 기존 `rental-article/check.ts`의 `REG_DATE_GATE`를 표시용으로 투영(단일 소스).

## Context

§155⑳ 임대주택 카드(`RentalUnitCard`)에서 "임대 구분" 라디오 5개는 **등록일과 무관하게 항상 전부 선택 가능**했다.
등록시기상 성립 불가한 유형(예: 2009 등록에 단기 6년(아·자, 2025.6.4 신설))을 골라도 입력 단계에선 통과하고,
엔진 `checkEligibility`가 **결과 계산 시점**에 `REG_DATE_GATE`로 "특례 미적용"을 뒤늦게 알린다.

목표: 등록일 2필드로 **결정적으로 배제되는 유형을 입력 시점에 disabled**로 사전 안내 → 사용자가 성립 가능한
유형만 능동적으로 선택하도록. 배제 근거는 **엔진이 이미 강제하는 `REG_DATE_GATE`를 그대로 투영**(과·소 배제 0).

---

## ★ 케이스 인벤토리 (필수 — 비어 있으면 Do 단계 진입 금지)

| # | 시나리오 | 법령/엔진 근거 | anchor 출처 | 테스트 파일 | 상태 |
|---|---------|--------------|-------------|-----------|------|
| 1 | 세무서 등록일 `> 2003-10-29` → `existing_business`(나) 배제 | check.ts:187-189 `bizRegDateMax` | 화면 2009-08-12 · phase2-unification.design:149 "등록 2004 REG_DATE_GATE" | `category-availability.test.ts` | ☐ TODO |
| 2 | 등록기준일(max) `< 2025-06-04` → `short_6y`(아·자) 배제 | check.ts:186 `regDateMin` | 화면 eff 2009-08-31 | 〃 | ☐ TODO |
| 3 | 경계 포함(strict): biz `2003-10-29` → 나 활성 / eff `2025-06-04` → 아·자 활성 | 부등호 `>`·`<` (check.ts:186·189) | — | 〃 | ☐ TODO |
| 4 | 경계 인접: biz `2003-10-30` → 나 배제 / eff `2025-06-03` → 아·자 배제 | 〃 | — | 〃 | ☐ TODO |
| 5a | 둘 다 미입력 → **5유형 전부 활성**(조기 차단 금지) | 계획 §3 | — | 〃 | ☐ TODO |
| 5b | biz만 입력(rental 미입력): `short_6y`는 활성(effTs=null), `existing_business`는 biz 단독 판정(2009→disabled / 2003-10-29→활성) | 계획 §3·§6 | — | 〃 | ☐ TODO |
| 6 | 근거 없는 3유형(`long_general`·`unsold_08_09`·`pre_2018`)은 등록일 무관 **항상 활성** | 엔진에 등록일-단독 배제 게이트 없음 | — | 〃 | ☐ TODO |

**규칙**: 라목(`unsold_08_09`) 게이트는 `saleWindow`(최초 분양계약일, 별도 필드)이지 등록일이 아니므로 헬퍼 대상 아님(계획 §7).

---

## 법령/엔진 근거

배제 경계는 **신설하지 않고** `lib/tax-engine/rental-article/rules.ts`의 `RA_CUT` 상수를 재사용한다(dual-truth 회피).

```
§167조의3①2호 나목(기존사업자 매입): 세무서 사업자등록 ≤ 2003-10-29 (RA_CUT.Y2003_10_29)
  → check.ts checkArticleGates: bizRegDateMax. 초과 시 REG_DATE_GATE.
§167조의3①2호 아·자목(단기 6년, 2025.6.4 신설): 등록기준일 ≥ 2025-06-04 (RA_CUT.Y2025_06_04)
  → check.ts checkArticleGates: regDateMin. 미만 시 REG_DATE_GATE.
등록기준일 = max(세무서 §168, 지자체 민특법§5)  (deriveEffectiveRegDate)
```

- reason 문구("2003.10.29 이전"·"2025.6.4 이후")는 코드베이스 확립 문서(types.ts:20/22·multi-house-surcharge.types.ts:18/24-25)와 일치 — 신규 법령 주장 아님.

---

## 엔진 "타입" — 신규 input/result 없음. 파생 헬퍼 시그니처만 추가

`lib/tax-engine/transfer-tax/rental-housing-exception/eligibility.ts`에 추가:

```ts
export type CategoryAvailability = { available: boolean; reason?: string };

/**
 * 등록일 2필드로 결정적으로 배제되는 임대 구분 유형을 disabled 처리하기 위한 판정.
 * 배제 기준 = check.ts checkArticleGates의 REG_DATE_GATE와 1:1(단일 소스, RA_CUT 재사용).
 * 판정 불가(날짜 미입력)면 available=true(조기 차단 금지 — 계획 §3).
 */
export function deriveCategoryAvailability(
  businessRegistrationDate: Date | null,
  rentalRegistrationDate: Date | null,
): Record<RentalCategory, CategoryAvailability>;
```

- `RentalCategory`·`deriveEffectiveRegDate`는 eligibility.ts에 이미 존재(재-import 불필요).
- **⚠️ 타입 가드 필수**: `deriveEffectiveRegDate`의 파라미터는 `Pick<RentalUnitInput, …>` = non-null `Date` 2개(types.ts:43,45). `Date|null`을 직접 넘기면 **TS2322**. 내부에서 `biz && rental ? deriveEffectiveRegDate({biz, rental}) : null`로 좁힌다.

**14 동기화 지점 영향**: 순수 헬퍼는 엔진 input/result 타입이 아니므로 Zod ⑫·body spread ⑬·Route 매핑 ⑭ **무관**. 소비 필드(`businessRegistrationDate`·`rentalRegistrationDate`·`rentalCategory`)는 기존 필드로 이미 전 지점 동기화됨.

---

## 계산 알고리즘 (단계별)

```
1. bizTs   = businessRegistrationDate?.getTime()  (Number.isNaN 방어)
2. effRegDate = (biz && rental) ? deriveEffectiveRegDate({biz, rental}) : null   // TS 가드
   effTs   = effRegDate?.getTime() ?? null
3. existing_business:  (bizTs 유효 && bizTs > RA_CUT.Y2003_10_29) → {available:false, reason:…} ; else {available:true}
4. short_6y:           (effTs != null && effTs < RA_CUT.Y2025_06_04) → {available:false, reason:…} ; else {available:true}
5. long_general·unsold_08_09·pre_2018 → 항상 {available:true}
6. return Record<RentalCategory, CategoryAvailability>
```

- **엔진과의 비대칭(의도적)**: check.ts는 `effTs ?? 0`으로 미입력 시 0<cutoff → short_6y fail시키지만, 헬퍼는 `effTs==null`이면 available=true(조기 차단 금지). `existing_business`도 동일 — check.ts:189는 `bizTs==null`도 fail시키나 헬퍼는 `bizValid` false → available=true(더 관대). 두 등록일 모두 필수(validation:35-36)라 계산 실행 시점엔 양측 non-null로 수렴 → transient 차이는 무해(계획 §3, fork 실측 확인).
- **부등호 정합**: 나 `>`(strict) = check.ts:189 / 아·자 `<`(strict) = check.ts:186. 경계일 당일은 양측 모두 활성/pass.
- **과·소 배제 0**: 헬퍼는 엔진 게이트보다 **더 관대**할 뿐(미입력 시 열어둠) 더 엄격한 배제 케이스 없음 → 법 근거 없는 불리 적용 금지(`feedback_no_unfavorable_application_without_legal_basis`) 충족.

---

## Silent fallback / 자동 안분 후보 식별

- **자동 안분 없음** — 이 헬퍼는 값을 채우지 않고 boolean 판정만 반환.
- UI auto-reset(§4-3 계획)은 `long_general`로 복원하나, 이는 자동 안분이 아니라 **무효 선택의 명시적 복원**(onChange 이벤트, useEffect 아님). 복원 대상은 rentalCategory 1필드뿐.
- 미입력 시 disabled로 조기 차단하지 않음 — validation(§155⑳ 필수 필드)이 별도 차단.

---

## 테스트 약속

- 케이스 인벤토리 7행 → `deriveCategoryAvailability` 단위 테스트(경계 포함/인접·미입력(둘다/biz만)·근거없는 3유형).
- 경계값은 `getTime()` 밀리초 정수 비교 → 날짜 문자열 `toBe()` 없이 `available` boolean `toBe()`.
- §155⑳ 회귀: `checkEligibility`·`checkRentalArticle` 기존 테스트 GREEN 유지(헬퍼 추가는 기존 판정 경로 무변경).

---

## UI 통합 위임

- UI 명세는 `transfer-rental-category-availability-by-reg-date.ui.design.md` 참조.
- 헬퍼 소비: `categoryAvail = useMemo(() => deriveCategoryAvailability(...), [reg dates])` → RadioCardGroup `disabled`(선택-제외 가드) + 사유 캡션 + auto-reset(`setRegDate`).
- 신규 엔진 타입 필드 없음 → 8 클라이언트 동기화 지점 중 ⑤(위젯)만 실질 변경.
