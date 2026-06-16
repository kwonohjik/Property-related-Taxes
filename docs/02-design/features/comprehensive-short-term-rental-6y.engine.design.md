# 종합부동산세 단기민간임대주택(6년형) 합산배제 — 엔진/데이터 설계

> 계획서: `docs/01-plan/features/comprehensive-short-term-rental-6y.plan.md` · worktree `comp-short-rental-6y`
> 범위: 옵션 A(건설·매입 분리 2종) · 종부세령 §3①10호(건설)·11호(매입) · 민특법 §2⑥의2(6년)

---

## 1. 케이스 인벤토리 (엔진 anchor — `__tests__/tax-engine/comprehensive-exclusion-short-term-6y.test.ts`)

| # | 시나리오 | registrationType | area(㎡) | location | assessedValue | 경과/말소 | 기대 |
|---|---|---|---|---|---|---|---|
| 1 | 건설 적격 | `private_short_term_6y_construction` | 100 | metro | 5억 | 7년 | `isExcluded:true`, reason=§3①10호 |
| 2 | 건설 가격초과 | construction | 100 | metro | **6.5억** | 7년 | false, PRICE_EXCEEDED |
| 3 | 건설 면적초과 | construction | **150** | metro | 5억 | 7년 | false, AREA_EXCEEDED_149(149 경계) |
| 4 | 건설 면적경계 | construction | **149** | metro | 5억 | 7년 | true (149 이하 OK) |
| 5 | 매입 적격(대면적·수도권) | `private_short_term_6y_purchase` | **200** | metro | 3.5억 | 7년 | true (면적 무관·수도권 4억↓) |
| 5b | 매입 수도권 가격초과 | purchase | 100 | metro | **4.5억** | 7년 | false, PRICE_EXCEEDED(4억 경계) |
| 5c | 매입 비수도권 경계 | purchase | 100 | non_metro | **2억** | 7년 | true (비수도권 2억↓) |
| 5d | 매입 비수도권 초과 | purchase | 100 | non_metro | **2.5억** | 7년 | false, PRICE_EXCEEDED(2억 초과) |
| 6 | 의무기간 경고 | construction | 100 | metro | 5억 | **4년·말소X** | true + warnings(6년 미충족) |
| 7 | 말소→거부 | construction | 100 | metro | 5억 | **말소≤과세기준일** | false, MANDATORY_PERIOD_NOT_MET |
| 8 | 임대료 5%초과 | construction | 100 | metro | 5억 | 비최초·6%↑ | false, RENT_INCREASE_EXCEEDED |
| 9 | **회귀: 기존 6종 불변** | (각 기존유형) | 85 | — | 기존 | — | 기존 anchor 무변경 (getAreaLimit=85 유지) |

> Pre-Do 우선 anchor: #1·#3·#5(매입 면적무관)·#5b·#9. 현행 실패(enum 부재 컴파일 에러)로 디자인 환류.

---

## 2. 타입 변경 (`lib/tax-engine/types/comprehensive.types.ts`)

### 2.1 `ExclusionType` (현행 :49-63) — 2종 추가
```ts
  | "private_short_term_rental_6y_construction"  // 단기민간임대 건설 (시행령 §3①10호)
  | "private_short_term_rental_6y_purchase"      // 단기민간임대 매입 (시행령 §3①11호)
```

### 2.2 `RentalExclusionInput["registrationType"]` (현행 :69-75) — 2종 추가
```ts
  | "private_short_term_6y_construction"
  | "private_short_term_6y_purchase"
```

> result 타입(`AggregationExclusionResult`·`ExclusionResult`)은 **변경 없음** — 신규 유형도 기존 `excludedValue`/`reason`/`warnings` 경로로 처리. ⑦ 결과뷰 무변경.

---

## 3. 상수 추가 (`lib/tax-engine/legal-codes/comprehensive.ts`)

### 3.1 `COMPREHENSIVE_EXCL` (법령코드 — 209행 뒤)
```ts
  /** 종합부동산세법 §8②1호, 시행령 §3①10호 — 단기민간임대 건설(6년) 합산배제 */
  PRIVATE_SHORT_TERM_RENTAL_6Y_CONSTRUCTION: "종합부동산세법 §8②1호, 시행령 §3①10호",
  /** 종합부동산세법 §8②1호, 시행령 §3①11호 — 단기민간임대 매입(6년) 합산배제 */
  PRIVATE_SHORT_TERM_RENTAL_6Y_PURCHASE:     "종합부동산세법 §8②1호, 시행령 §3①11호",
  /** 건설 단기(§3①10호) 전용면적 초과 (149㎡) — 기존 AREA_EXCEEDED(85㎡)와 분리(회귀 0) */
  AREA_EXCEEDED_149:                         "전용면적 149㎡ 초과 — 시행령 §3①10호",
```

### 3.2 `COMPREHENSIVE_EXCL_CONST` (가격 270행 뒤·면적 276행 뒤)
```ts
  /** 단기민간임대 건설 공시가격 상한 (6억, 수도권 무관) — §3①10호가목 */
  SHORT_TERM_6Y_PRICE_CONSTRUCTION:        600_000_000,
  /** 단기민간임대 매입 수도권 공시가격 상한 (4억) — §3①11호가목1) */
  SHORT_TERM_6Y_PRICE_PURCHASE_METRO:      400_000_000,
  /** 단기민간임대 매입 비수도권 공시가격 상한 (2억) — §3①11호가목1) */
  SHORT_TERM_6Y_PRICE_PURCHASE_NON_METRO:  200_000_000,
  /** 단기민간임대 건설 전용면적 상한 (149㎡) — §3①10호가목. 매입(11호)은 면적조건 없음 */
  SHORT_TERM_6Y_AREA_CONSTRUCTION:         149,
```
- `MANDATORY_PERIOD_SHORT_TERM_6Y: 6`(현행 290) **재사용** + 주석의 `(현재 registrationType enum 미대응 — 후속 확장)` 삭제.
- ⚠️ 매입 4억/2억은 2차 소스 확인값 → **Do 1순위 법령 표 원문 최종 대조**(계획서 §2.3) 후 확정.

---

## 4. 알고리즘 (`lib/tax-engine/comprehensive-exclusion.ts`)

### 4.1 `MANDATORY_PERIOD_BY_TYPE` (현행 :34-44) — 2종 추가
```ts
  private_short_term_6y_construction: COMPREHENSIVE_EXCL_CONST.MANDATORY_PERIOD_SHORT_TERM_6Y, // 6
  private_short_term_6y_purchase:     COMPREHENSIVE_EXCL_CONST.MANDATORY_PERIOD_SHORT_TERM_6Y, // 6
```

### 4.2 `getAreaLimit` 신설 — 면적 차단 분기 (현행 :55 단일 85 차단 대체)
```ts
function getAreaLimit(registrationType: RentalExclusionInput["registrationType"]): number {
  if (registrationType === "private_short_term_6y_construction")
    return COMPREHENSIVE_EXCL_CONST.SHORT_TERM_6Y_AREA_CONSTRUCTION; // 149
  if (registrationType === "private_short_term_6y_purchase")
    return Infinity; // 매입 단기(§3①11호)는 면적조건 없음
  return COMPREHENSIVE_EXCL_CONST.AREA_LIMIT_NATIONAL_HOUSING; // 85 — 기존 6종 회귀 0
}
```
- :55 변경: `if (input.area > getAreaLimit(input.registrationType))`
- :184 (사원용 `validateOtherExclusion`)은 **무변경** — 임대유형 무관, 단기와 별개.

### 4.3 `getPriceLimit` (현행 :107-119) — 단기 분기 추가 (public_support 분기 앞)
```ts
  if (registrationType === "private_short_term_6y_construction")
    return COMPREHENSIVE_EXCL_CONST.SHORT_TERM_6Y_PRICE_CONSTRUCTION; // 6억, location 무관
  if (registrationType === "private_short_term_6y_purchase")
    return location === "metro"
      ? COMPREHENSIVE_EXCL_CONST.SHORT_TERM_6Y_PRICE_PURCHASE_METRO       // 4억
      : COMPREHENSIVE_EXCL_CONST.SHORT_TERM_6Y_PRICE_PURCHASE_NON_METRO;  // 2억
```

### 4.4 `getRentalExclusionLegalCode` (현행 :121-132) — 2 case 추가
```ts
  case "private_short_term_6y_construction": return COMPREHENSIVE_EXCL.PRIVATE_SHORT_TERM_RENTAL_6Y_CONSTRUCTION;
  case "private_short_term_6y_purchase":     return COMPREHENSIVE_EXCL.PRIVATE_SHORT_TERM_RENTAL_6Y_PURCHASE;
```

### 4.5 `rentalTypes` 배열 (현행 `applyAggregationExclusion` :215-222) — `ExclusionType` 2종 추가
```ts
  "private_short_term_rental_6y_construction",
  "private_short_term_rental_6y_purchase",
```

### 4.6 면적초과 메시지 — 신규 상수 분리 (동적화 철회 · 회귀 위험)
현행 :55는 `failReasons.push(COMPREHENSIVE_EXCL.AREA_EXCEEDED)`(상수 "국민주택 규모(85㎡) 초과"). 동적 문자열로 바꾸면 **기존 6종 reason도 변경 → 기존 anchor 회귀**. 따라서:
- 기존 6종: `AREA_EXCEEDED`(85 메시지) **그대로 유지**.
- 건설 단기: 신규 상수 `AREA_EXCEEDED_149` 별도 push (registrationType 분기).
- 매입 단기: 면적 차단 없음(getAreaLimit=∞) → 메시지 불요.

### 4.7 `toRegistrationType` map (④ `comprehensive-api.ts:152-162`) — 2건 추가
```ts
  private_short_term_rental_6y_construction: "private_short_term_6y_construction",
  private_short_term_rental_6y_purchase:     "private_short_term_6y_purchase",
```
rentalRegistrationType 미선택 시 fallback — 초기값(`private_purchase_long`) 존재로 보통 미사용하나 정합 위해 필수.

---

## 5. 동기화 지점 (계획서 §6 — 8지점)

| 지점 | 파일 | 변경 |
|---|---|---|
| ① 타입 | `types/comprehensive.types.ts:49·69` | §2 |
| 상수 | `legal-codes/comprehensive.ts:209·270·276·290` | §3 |
| 엔진 | `comprehensive-exclusion.ts:34·55·107·121·215·231` | §4 |
| ④ API | `lib/calc/comprehensive-api.ts:134·152` | RENTAL_TYPES + toRegistrationType 2건 |
| ⑧⑫ Zod | `lib/validators/comprehensive-input.ts:14·35` | exclusionTypeSchema + rentalRegistrationTypeSchema 2종 |
| ⑤a UI | `PropertyListInput.tsx:35` | EXCLUSION_TYPE_OPTIONS |
| ⑤b UI | `ExclusionInfoInput.tsx:27·37` | RENTAL_REG_TYPE_OPTIONS + RENTAL_EXCLUSION_TYPES + hint |
| ⑦ 결과뷰 | `ComprehensiveTaxResultView.tsx` | 무변경(자동) |
| store | `comprehensive-wizard-store.ts:34` | 옵션값만(필드 존재) |

---

## 6. 회귀 가드 (Critical)

- **기존 6종 numeric 0 변경**: `getAreaLimit` 기존 유형 → 85 유지, `getPriceLimit` 기존 분기 무변경. anchor #9로 6종 전부 재실행 대조.
- enum union 추가는 `Record<registrationType, number>`(MANDATORY_PERIOD_BY_TYPE) 컴파일러가 누락 catch.
- ⚠️ **침묵 위험 5곳 — 컴파일러 미감지(`ExclusionType[]`/Set/리터럴)**: `rentalTypes`(§4.5)·`RENTAL_TYPES` Set(④ api:134)·`toRegistrationType` map(④ :152)·`RENTAL_REG_TYPE_OPTIONS`(⑤b)·`RENTAL_EXCLUSION_TYPES` Set(⑤b). 누락 시 합산배제가 other로 빠져 **침묵 미적용**. 5곳 전부 grep(`private_short_term_rental_6y` 출현수 = 기대치) 점검.
- ⑫ Zod enum 2곳 누락 시 신규값 침묵 strip → 합산배제 미적용. grep 자가점검.

## 7. 범위 밖 (계획서 §10)

- §3①11호나목(조정대상지역)·아파트 제외 자동판정 — 주택유형·세대 보유현황 필드 부재(장기 §3①8호도 미구현). UI 안내문 보완.
- 기존 임대유형 85㎡ ↔ 법령(건설149/매입무관) 정합 — 별도 과제(회귀 위험).
