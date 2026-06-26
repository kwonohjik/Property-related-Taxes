# 지상권(地上權) 보충적 평가 — 엔진 설계

> feature-id: `inheritance-superficies-supplemental-valuation`
> plan: [`docs/00-pm/inheritance-superficies-supplemental-valuation.plan.md`](../../00-pm/inheritance-superficies-supplemental-valuation.plan.md)
> 적용 세목: 상속·증여 공통 (EstateItem 공유 — `gift-tax.ts:94` `evaluateAllEstateItems`)

## 1. 법령 근거 (1차 출처 확인)

| 조문 | 내용 | 출처 |
|---|---|---|
| 상증법 §61③ | 지상권등의 보충적 평가 위임 | — |
| 상증령 §51① | 지상권 가액 = 토지가액 × 율 × 잔존연수 환산. 잔존연수 = 민법 §280·§281 준용 | mst 283637 ✅ |
| 상증칙 §16① | 율 = 연간 100분의 2 (2%) | mst 284609 ✅ |
| 상증칙 §16② | 환산 = Σ 각연도수입금액 / (1+10/100)ⁿ, n=평가기준일부터 경과연수. "합계액" | 시행규칙 전문 PDF ✅ |
| 민법 §280① | 약정 지상권 최단존속기간: ㉠견고건물·수목 30년 / ㉡기타건물 15년 / ㉢공작물 5년. 단축 약정은 최단으로 연장 | 교재 |
| 민법 §281① | 미약정 시 위 최단기간 | 교재 |
| 민법 §281② | 공작물 종류·구조 미정 시 ㉡(15년)으로 봄 | 교재 |

**평가 산식 (동결):**
```
                       income
지상권 평가액 = Σ(n=1..N) ──────────       income = floor(landValue × 2 / 100)
                      (11/10)ⁿ            N = 잔존연수, 할인율 10% 고정
```

## 2. 타입 정의

### 2-1. `lib/tax-engine/types/inheritance-gift-estate.types.ts`

```ts
// :36 AssetCategory union 확장
export type AssetCategory =
  | ... 기존 9종 ...
  | "superficies";           // 지상권 (상증법 §61③) — 권리 평가

// 신규 — 민법 §280·§281 건물종류 3분류 + 미정
export type SuperficiesStructureType =
  | "solid_building"   // ㉠ 석조·석회조·연와조 등 견고건물·수목 → 최단 30년
  | "other_building"   // ㉡ 그 외 건물 → 최단 15년
  | "non_building"     // ㉢ 건물 이외 공작물 → 최단 5년
  | "unspecified";     // 공작물 종류·구조 미정 (§281②) → 15년 간주

// :48 EstateItem 신규 필드 (모두 optional — discriminatedUnion 호환)
  /** 지상권 설정 토지 개별공시지가 (원/㎡) — §61① */
  superficiesLandStandardPrice?: number;
  /** 지상권 설정 토지 면적 (㎡) — UI에서 parseFloat(toFixed(2)) 후 전달 */
  superficiesLandArea?: number;
  /** 존속기간 약정 여부 (민법 §280 약정 / §281 미약정) */
  superficiesAgreed?: boolean;
  /** 건물·공작물 종류 (최단존속기간 결정) */
  superficiesStructureType?: SuperficiesStructureType;
  /** 약정 존속기간(연) — superficiesAgreed=true 시 필수 */
  superficiesAgreedYears?: number;
  /** 지상권 설정일 — 평가기준일과 차분해 잔존연수 도출 */
  superficiesSetDate?: Date | string;
  /** 잔존연수 사용자 오버라이드(정수) — 있으면 자동도출 대신 사용 */
  superficiesRemainingYearsOverride?: number;
  /**
   * 엔진 소비용 최종 잔존연수 — lib/calc API변환서 resolveSuperficiesTenureYears로 합성 주입.
   * (evaluateAllEstateItems가 평가기준일 미수신하므로 엔진 내 도출 불가 → 변환 레이어 합성)
   */
  superficiesRemainingYears?: number;
```

> `PropertyValuationResult`(`:501` `{ estateItemId, method, valuatedAmount, breakdown: CalculationStep[], warnings: string[] }`)는 generic — **변경 없음**. (`warnings`는 required 배열 — `evaluateSuperficies`는 빈 배열이라도 반환)

## 3. 알고리즘

### 3-1. 잔존연수 도출 — `resolveSuperficiesTenureYears` (엔진 단일진실, export)

`lib/tax-engine/property-valuation.ts`. client 입력빌드(`buildInput`/`buildGiftTaxInput`)·UI(useMemo 표시)·validate가 **모두 이 헬퍼를 import**(single-source-engine-helper, dual-truth 금지). 엔진 `evaluateSuperficies`는 합성된 `superficiesRemainingYears`만 소비.

```ts
import { addYears, differenceInYears } from "date-fns";

const SUPERFICIES_MIN_TENURE: Record<SuperficiesStructureType, number> = {
  solid_building: 30,   // ㉠ §280①
  other_building: 15,   // ㉡
  non_building: 5,      // ㉢
  unspecified: 15,      // §281② 종류미정 → ㉡ 간주
};

export function resolveSuperficiesTenureYears(p: {
  agreed: boolean;
  structureType: SuperficiesStructureType;
  agreedYears?: number;
  setDate: Date;
  valuationDate: Date;   // 상속개시일/증여일
}): number {
  const min = SUPERFICIES_MIN_TENURE[p.structureType];
  // §280① 약정: max(약정, 최단) — 단축 약정은 최단으로 연장 / §281① 미약정: 최단
  const tenure = p.agreed ? Math.max(p.agreedYears ?? 0, min) : min;
  const expiry = addYears(p.setDate, tenure);                  // 존속만료일
  if (expiry <= p.valuationDate) return 0;                     // 만료 — SU-C7
  // 잔존연수 = 만료일 − 평가기준일, 1년 미만 단수 = 절상
  const full = differenceInYears(expiry, p.valuationDate);
  const hasRemainder = addYears(p.valuationDate, full) < expiry;
  return full + (hasRemainder ? 1 : 0);
}
```

> **절상**(plan §9-4): `differenceInYears`는 완성 연도만 세므로(floor) 잔여월 존재 시 +1. 14.3년 → 15.

### 3-2. 지상권 평가 — `evaluateSuperficies`

```ts
import { safeMultiply } from "./tax-utils";
// resolveSuperficiesTenureYears가 쓰는 addYears/differenceInYears는 date-fns에서 import (파일 상단)
// SUPERFICIES_RATE=2, 할인 분수 11/10 — legal-codes/inheritance-gift.ts

export function evaluateSuperficies(item: EstateItem): PropertyValuationResult {
  if (item.category !== "superficies")
    throw new TaxCalculationError(TaxErrorCode.INVALID_INPUT, "evaluateSuperficies: 지상권 자산이 아닙니다.");

  const unit = item.superficiesLandStandardPrice ?? 0;
  const area = item.superficiesLandArea ?? 0;            // UI에서 toFixed(2) 처리됨(소수 2자리)
  // 면적 소수 → ×100 정수화 후 BigInt 곱·/100 floor (부동소수 금지)
  const areaScaled = Math.round(area * 100);
  const landValue = Math.floor(safeMultiply(unit, areaScaled) / 100);          // 토지가액 §61①
  const income = Math.floor(safeMultiply(landValue, SUPERFICIES_RATE) / 100);  // ×2%
  const years = Math.max(0, Math.trunc(item.superficiesRemainingYears ?? 0));

  // Σ floor(income × 10ⁿ / 11ⁿ) — BigInt 분수 (부동소수 누적 금지)
  let sum = 0n;
  let num = 1n;   // 10ⁿ
  let den = 1n;   // 11ⁿ
  const incBig = BigInt(income);
  for (let n = 1; n <= years; n++) {
    num *= 10n;
    den *= 11n;
    sum += (incBig * num) / den;   // 각 항 BigInt floor
  }
  const valuatedAmount = Number(sum);

  return {
    estateItemId: item.id,
    method: "standard_price",
    valuatedAmount,
    breakdown: [
      { label: "지상권 설정 토지가액 (개별공시지가 × 면적)", amount: landValue, lawRef: VALUATION.REAL_ESTATE_SUPP },
      { label: "각 연도 수입금액 (토지가액 × 2%)", amount: income, lawRef: VALUATION.SUPERFICIES },
      { label: `잔존연수 ${years}년 · 할인율 10% 현재가치 환산 합계`, amount: valuatedAmount, lawRef: VALUATION.SUPERFICIES },
      { label: "평가액", amount: valuatedAmount },
    ],
    warnings: ["지상권 보충적 평가 — 잔존연수·존속기간 약정 내용 확인 권장"],
  };
}
```

### 3-3. dispatch — `evaluateEstateItem` (`:454`)

```ts
    case "superficies":
      return evaluateSuperficies(item);   // 담보/임대 무관 — applyCollateralFloor 미사용
```

> 증여세 `gift-tax.ts:94`도 `evaluateAllEstateItems` → `evaluateEstateItem` 경유 → **case 1곳으로 상속·증여 양쪽 적용**. 주식 라우팅(`:506~514`)과 무관.

## 4. 케이스 인벤토리 (anchor)

| ID | 시나리오 | 입력 | 기대 | 법령 |
|---|---|---|---|---|
| SU-C1 | 교재 사례 | 공시 2,500,000 · 990㎡ · 미약정 · ㉡ · 설정일=평가기준일 | landValue 2,475,000,000 · income 49,500,000 · 첫항 45,000,000 · years 15 · **value = 376,500,929** (실측 동결) | §16② |
| SU-C2 | 약정 > 최단 | 약정 40년 · ㉠ · 설정일=평가기준일 | tenure max(40,30)=40 | §280① |
| SU-C3 | 약정 < 최단(단축) | 약정 10년 · ㉠ | tenure max(10,30)=30 | §280① |
| SU-C4 | 미약정 공작물 | 미약정 · ㉢ | tenure 5 | §281① |
| SU-C5 | 종류 미정 | 미약정 · unspecified | tenure 15 | §281② |
| SU-C6 | 경과 후 잔존 차분 | 설정일=평가기준일−10년 · 미약정 ㉡(15) | 잔존 5년 | 차분 |
| SU-C6b | 단수 절상 | 만료까지 14.3년 | 잔존 15 (절상) | plan §9-4 |
| SU-C7 | 만료 가드 | 만료일 ≤ 평가기준일 | tenure 0 · value 0 | 가드 |
| SU-C8 | 토지 입력 0 | 공시 0 또는 면적 0 | landValue 0 · value 0 (validate 차단) | §8 |
| SU-C9 | 오버라이드 | 자동 15 · override 20 | years 20 | plan §3 D-2 |

> **Pre-Do anchor**(SU-C1) — 실측 동결: BigInt floor-per-term 합 = **376,500,929**. 교재 376,501,950(계수 7.6061 곱 근사)·부동소수 합 376,500,935와 모두 다름. 엔진 anchor는 **376,500,929**, 교재값은 근사 주석으로만 병기(1원 tolerance 아님 — 계수 반올림 차이 1,021원). 추가 케이스:
> - 약정+연수미입력(`superficiesAgreed=true`, `agreedYears` undefined → `??0` → `max(0,min)`=min): SU-C2b
> - override ≤ 0 (`Math.trunc(?? 0)` → 0 → value 0): SU-C9b
> - 윤년 설정일 2/29 `addYears` 경계: SU-C10

## 5. 정수 연산 (정책 강제)

| 단계 | 산식 | 정책 |
|---|---|---|
| 토지가액 | `floor(safeMultiply(공시지가, round(면적×100)) / 100)` | 면적 소수2자리 ×100 정수화. `unit*area` 부동소수 금지 |
| 연수입 | `floor(safeMultiply(landValue, 2) / 100)` | `landValue*0.02` 금지 |
| 현가환산 | `Σ floor(income × 10ⁿ / 11ⁿ)` BigInt | `Math.pow(1.1,n)` 부동소수 누적 금지. n≤30 시 `income×10ⁿ` > MAX_SAFE → BigInt 필수 |

근거 메모리: `applyrate_fractional_rate_one_won_error`, `safemul_decimal_apportion_precision`.

## 6. 14 동기화 지점 매핑

| # | 지점 | 파일:라인 | 작업 |
|---|---|---|---|
| ① | 폼 상태 | `components/calc/inheritance/estate-card/variants/` | superficies variant 폼 (UI 설계) |
| ② | initial | estate-card factory | 신규 필드 기본값 |
| ③ | normalize | `lib/calc/estate-item-valuation.ts:35` `resolveEstateItemValuation` | **superficies 명시 분기 추가** — 현재 fallback(`marketValue ?? … ?? standardPrice ?? 0`)에 빠지면 사이드바 추정금액이 엉뚱하게 잡힘. 0 또는 엔진 단일진실 처리 |
| ④ | API 변환(합성) | **상속** `components/calc/InheritanceTaxForm.tsx:420 buildInput()` · **증여** `lib/calc/gift-api.ts:44 buildGiftTaxInput()` | **잔존연수 합성** 위치는 client 입력 빌드(✗ `inheritance-api.ts:71`은 fetch 래퍼). `resolveSuperficiesTenureYears({ setDate: parseISO(superficiesSetDate), valuationDate: parseISO(deathDate/giftDate) })` → `superficiesRemainingYears`. override 우선 |
| ⑤ | UI 위젯 | estate-card variants | 공시지가·면적·약정토글·건물종류 라디오·약정기간·설정일·잔존연수(자동/override) (UI 설계) |
| ⑥ | 사이드바 | `InheritanceSidebar.tsx` | **엔진 result 도착 후 `valuatedAmount` echo만**(`tax-summary-sidebar-pattern`·`engine_result_display_drift`). BigInt 환산을 사이드바서 재계산 **금지**(dual-truth). 입력시점엔 `resolveSuperficiesTenureYears`로 연수 표시까지만 |
| ⑦ | 결과 카드 | `components/calc/results/.../source-summary/` | breakdown 산식 행 표시 (`resolveEngineValuatedAmount` 단일진실) |
| ⑧ | validation | `lib/validators/estate-item-schema.ts:267` 패턴 | **`superficiesItemSchema.superRefine`**(개별, `unlistedStockItemSchema:267` 패턴) — 필수검증 + 합성 잔존연수 0 경고. UI↔validate 모순 금지 |
| ⑨ | category enum | `estate-item-schema.ts` `superficiesItemSchema` | `category: z.literal("superficies")` |
| ⑩ | API 응답 타입 | passthrough | — |
| ⑪ | Date 필드 | **client 빌드(④)** | route는 nested `estateItems` 날짜 coerce **안 함**(`route.ts:74` passthrough, `deathDate`/`giftDate`는 ISO string). `superficiesSetDate`·평가기준일은 ④ `buildInput`에서 `parseISO` 통일(memory `parseISO통일`). `differenceInYears`에 string 전달 시 silent 오작동 |
| ⑫ | **Zod 입력객체** | `estate-item-schema.ts:299` | **`superficiesItemSchema` 신설 + discriminatedUnion(`:299~309`) 추가**. COORD_INCOMPATIBLE(`:313`) 추가 — 지상권은 영농 §16②1호나 거주지 판정 대상 아니므로 좌표 차단 유지(근거: estateLatLng 용도=영농공제) |
| ⑬ | body spread | `inheritance-api.ts:71` | estateItems 배열 통째 passthrough — 자동. 합성은 ④ |
| ⑭ | Route 엔진 매핑 | `app/api/calc/{inheritance,gift}/route.ts:74` | Zod parse → 엔진 passthrough. **nested date coerce 불요**(합성·parseISO는 client ④에서 완료) |

> **⑫ Critical** — superficiesItemSchema를 discriminatedUnion 누락 시 침묵 strip/파싱 실패.

### 6-1. ⚠️ total `Record<AssetCategory>` 6곳 — TS2741 (Critical, enum-verification-before-mapping)

`superficies`를 `AssetCategory`에 추가하면 아래 6개 **total Record**가 **컴파일 에러(TS2741: superficies 키 누락)**. Do에서 6곳 모두 `superficies` 키 추가 필수:

| 파일:라인 | Record | 추가할 값 |
|---|---|---|
| `lib/calc/besshi-buppyo-2-data.ts:44` | `CATEGORY_LABEL_KO` | "지상권" |
| `lib/calc/deduction-besshi-data.ts:243` | `FINANCIAL_ASSET_KIND_LABEL` | 비금융 → 적정 라벨/제외 |
| `lib/calc/asset-toggle-visibility.ts:48` | `MATRIX` (AssetToggleVisibility) | 지상권 전용 토글 가시성 |
| `lib/calc/asset-toggle-visibility.ts:205` | `CULTURAL_HERITAGE_VISIBILITY` | 해당없음 처리 |
| `lib/tax-engine/inheritance-asset-category.ts:15` | `CATEGORY_TO_SUMMARY` | 집계표 카테고리 매핑 |
| `components/calc/results/inheritance-filing-form-helpers.ts:121` | `ESTATE_ITEM_TYPE_CODE` | 신고서 재산종류 코드 |

> TypeScript가 **즉시 잡는다**(침묵 strip 아님) — 하지만 설계서 누락 시 구현자가 6곳을 빠뜨려 빌드 깨짐. `enum-verification-before-mapping` 정책: 매핑 전 grep으로 전수 확인(완료).

## 7. 검증 규칙 (⑧)

`superficiesItemSchema` superRefine 또는 validate:
- `superficiesLandStandardPrice > 0`, `superficiesLandArea > 0` (미입력 차단 — 자동 안분 fallback 금지).
- `superficiesSetDate` 필수, `superficiesAgreed`·`superficiesStructureType` 필수.
- `superficiesAgreed === true` → `superficiesAgreedYears > 0` 필수.
- 합성 잔존연수(`resolveSuperficiesTenureYears`) ≤ 0 → "지상권 존속기간이 만료되어 평가액이 0입니다" 경고/차단(정책 결정: UI 표시 0 허용 + 경고). UI 통과↔validate 차단 모순 금지.

## 8. 테스트 계획

`__tests__/tax-engine/property-valuation/superficies-61-3.test.ts`:
- `resolveSuperficiesTenureYears` 단위: SU-C2~C7 (민법 도출·절상·만료).
- `evaluateSuperficies` 단위: SU-C1(교재)·C8·C9 + landValue/income 중간값.
- 정수연산: 큰 토지가액(n=30) BigInt 오버플로 미발생 확인.
