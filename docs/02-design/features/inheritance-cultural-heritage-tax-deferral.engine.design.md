# 상속세 §74 지정문화유산 등 징수유예 — 엔진 설계

> 계획서: `docs/00-pm/inheritance-cultural-heritage-tax-deferral.plan.md` (13단계 자가검토 — 정정 14건 반영)
> UI 측: `inheritance-cultural-heritage-tax-deferral.ui.design.md`
> 법령 기준: 상증법 mst 276123(시행 2026-01-02) · 상증령 mst 283637 (KoreanLaw 실측 2026-06-05)

## Context

상속재산에 지정문화유산·박물관자료·천연기념물 등이 포함되면 그 재산가액에 상응하는 **상속세액의 징수를 유예**하는 §74가 **미구현**이다. 별지9호 ㉖ "문화재등 징수유예세액"은 **라벨만** 존재하고 어댑터에서 **항상 0 하드코딩**(`filing-form-9-data.ts:120·144`). 엔진(`inheritance-tax.ts`)·입력(`EstateItem`)·결과(`InheritanceTaxResult`) 어디에도 산정 로직·필드가 없다.

본 작업은 신규 자산 식별(`EstateItem.culturalHeritageType`) + 순수 산정 모듈(`calcCulturalHeritageDeferral`) + STEP 12.5 통합 + result echo 필드 + 별지9호 ㉖·㊳ 연동까지 **법령·재결례 정합으로 완성**한다.

**산정 방식 — "평균 비례 방식"(조세심판례·예규 확정)**:
- 조세심판원 **[940708] 국심1996서3457**(1997.12.31, 기각) + 예규 **재산46014-339**·**재삼46014-1158**: 징수유예세액 = 산출세액 × (대상 재산가액 ÷ 총 상속재산가액).
- **배척된 차액 방식**: "(문화재 포함 산출세액) − (문화재 제외 산출세액)" 한계세율 방식은 명시적으로 배척 → **엔진은 비례 곱셈만**(차액 방식 금지).

**§12 비과세와의 경계**: 현행 상증법 §12 비과세 항목에 문화재 **없음**(2호 삭제). 코드 `exemption-evaluator.ts:60`·`legal-codes/inheritance-gift.ts:192` 주석이 문화재를 §12 비과세로 오기 중 → **별도 PDCA로 정정**(본 작업 범위 밖, 이중혜택 경고만 포함).

---

## ★ 케이스 인벤토리 (필수)

| # | 시나리오 | 법령 근거 | anchor 출처 | 테스트 파일 | 상태 |
|---|---------|----------|-------------|-----------|------|
| CHD-01 | 문화유산 없음(`culturalHeritageType` 전무) → 0 | — | 회귀 가드 | `cultural-heritage-deferral.test.ts` | ☐ TODO |
| CHD-02 | 1호 단일 100%(총재산=해당자산) → computedTax 전액 | §76① ratio=1 | calculateProration 비율 1.0 상한 | 〃 | ☐ TODO |
| CHD-03 | **3호 부분 5억/20억 → 110,000,000 (Pre-Do)** | §76① + 재결례 940708 | 직접계산 `toBe(110_000_000)` | 〃 | ☐ TODO |
| CHD-04 | 4호 + §13 사전증여 5억/25억 → 88,000,000 | §76① 분모 §13 포함 | `toBe(88_000_000)` BigInt 경로 | 〃 | ☐ TODO |
| CHD-05 | 2호 박물관자료(전시·보존 중) → 정상 산출 | §74①2호 | 요건(type 신뢰) | 〃 | ☐ TODO |
| CHD-06 | 복수(1호 3억 + 3호 2억)/20억 → 합산 분자 5억 | §76① 호 무관 합산 | 합산 | 〃 | ☐ TODO |
| CHD-07 | 3호 담보면제 echo | §74⑤ | `collateralExemptible:true` | 〃 | ☐ TODO |
| CHD-08 | 1호 담보필요 echo | §74④ | `collateralExemptible:false` | 〃 | ☐ TODO |
| CHD-09 | 비율 0%(분자 평가액 0) → 0 | 분자 0 | 0 | 〃 | ☐ TODO |
| CHD-10 | computedTax 0(공제>과세가액) → 0 | — | 0 | 〃 | ☐ TODO |
| CHD-11 | §12 비과세 자산과 동일 EstateItem → 차감 전 평가액 분자 산입 | Q-3 정리 | 동작 고정 | 〃 | ☐ TODO |
| CHD-12 | **(통합) 별지9호 ㊳ = finalTax − ㉖ 정합** | 양식 공식 + 재결례 940708 | self-consistency | `calc/filing-form-9-data.test.ts`(어댑터 단위) | ☐ TODO |

**규칙**: CHD-01~11 = `calcCulturalHeritageDeferral` **단위**. CHD-03 = **Pre-Do anchor**([[pre-do-anchor-verification]], 현재 0 → 실패 확보 후 환류). CHD-12 = 별지9호 통합(㊳ 정합).

---

## 법령 근거

`lib/tax-engine/legal-codes/inheritance-gift.ts` 상수 신규 (문자열 리터럴 금지). `INH`(:12) 객체 — `inheritance-tax.ts`는 `import { INH }`:
```ts
INH.CULTURAL_HERITAGE_DEFERRAL      = "상증법 §74"      // 징수유예 근거
INH.CULTURAL_HERITAGE_DEFERRAL_CALC = "상증령 §76①"    // 징수유예액 산식
```
> 기존 `INH.PAYMENT_DEFERRAL`(:257 "조특법 §30의7")과 명명 구분됨(실측 확인).

```
법 §74①(징수유예 대상): 상속재산 중 다음 재산 포함 시 그 재산가액에 상당하는 상속세액 징수유예
  1호. 문화유산자료등(문화유산보존법 §2③3호 + 국가등록문화유산 + 보호구역 토지)
  2호. 박물관자료등(등록 박물관/미술관 자료로서 전시·보존 중. 사립은 공익법인등만)
  3호. 국가지정문화유산등(국가·시도지정문화유산 + 보호구역 토지) ← §74⑤ 담보 면제 가능
  4호. 천연기념물등(자연유산법 + 보호구역 토지)                  ← §74⑤ 담보 면제 가능
법 §74②: 유상양도·(박물관자료) 인출 시 즉시 징수 (사후관리 — 본 PR 범위 외, 경고만)
법 §74④: 유예세액 상당 담보 제공(§71 준용). §74⑤: 3·4호는 담보 면제 가능

상증령 §76①(징수유예액 계산):
  징수유예 상속세액 = 상속세산출세액 × [ §74①각호 재산가액 ÷ 상속재산(§13 가산 증여재산 포함) ]
```

> ⚠️ **인용 정책**([[korean-law-citation-verify]]): 분모 "상속재산"은 §76① 괄호가 **§13 가산증여만 명시** → §15 추정상속재산 **미포함**(Q-1 확정, 재결례 940708 "총 상속재산가액"). "상속세산출세액"은 §27 할증 전 `computedTax`.

---

## 엔진 input 타입

```ts
// lib/tax-engine/types/inheritance-gift.types.ts — EstateItem(:81~)에 추가
/**
 * §74①각호 지정문화유산 분류 (farmingCategory enum 패턴).
 * undefined = 해당 없음. 담보 면제(§74⑤): "designated"·"natural_monument"만.
 * 2호 박물관자료: 사립은 공익법인등만(UI 체크리스트 안내, 엔진은 type 신뢰).
 */
culturalHeritageType?:
  | "heritage_data"      // 1호 문화유산자료등
  | "museum"             // 2호 박물관자료등
  | "designated"         // 3호 국가지정문화유산등 (담보 면제)
  | "natural_monument";  // 4호 천연기념물등       (담보 면제)
```
> §74② 사후관리(`culturalHeritageDeferralRisk`) echo 필드는 **본 PR 미신설**(Q-4 범위 외).

## 엔진 result 타입

```ts
// InheritanceTaxResult(:1049~) — 신규 (echo — finalTax 불변, 별지9호 ㉖·㊳ 차감 소스)
culturalHeritageDeferredTax?: number;                       // 별지9호 ㉖
culturalHeritageDeferralDetail?: CulturalHeritageDeferralDetail;

// 신규 인터페이스 (types/inheritance-gift.types.ts)
export interface CulturalHeritageDeferralDetail {
  qualifyingAssetValue: number;        // §76① 분자: §74①각호 재산 평가액 합
  totalEstateWithPriorGifts: number;   // §76① 분모: grossEstateValue + priorGiftAggregated (§15 제외)
  deferralRatio: number;               // 분자 ÷ 분모 (표시용 echo)
  computedTaxBase: number;             // = computedTax (§26, §27 할증 전)
  items: {
    estateItemId: string;
    itemName: string;
    heritageType: "heritage_data" | "museum" | "designated" | "natural_monument";
    valuatedAmount: number;
    collateralExemptible: boolean;     // §74⑤: designated·natural_monument만 true
  }[];
  hasCollateralExemption: boolean;     // 3·4호만 있으면 true
  warnings: string[];                  // §74② 사후관리·§74④ 담보 안내
}
```
새 Date 필드 없음 (금액 정수만).

---

## 계산 알고리즘 (단계별)

### `calcCulturalHeritageDeferral(params)` — 순수 함수 (`lib/tax-engine/inheritance-cultural-heritage-deferral.ts` 신규)
```ts
calcCulturalHeritageDeferral(params: {
  estateItems: EstateItem[];
  valuatedAmountById: Map<string, number>;   // 키 = estateItemId (inheritance-tax.ts:545)
  computedTax: number;                        // §26 산출세액 (할증 전)
  grossEstateValue: number;                   // 비과세·§14 차감 전 평가액 합
  priorGiftAggregated: number;                // §13 사전증여 합
}): { deferredTax: number; detail: CulturalHeritageDeferralDetail | null; breakdown: CalculationStep[]; lawApplied: boolean }
```
1. `culturalHeritageType` 설정 자산 필터 → 없으면 `{ deferredTax: 0, detail: null, ... }` 조기 반환 (CHD-01).
2. **분자** = `Σ valuatedAmountById.get(item.id)` (해당 자산. Map 키=estateItemId=EstateItem.id, CHD-06 호 무관 합산).
3. **분모** = `grossEstateValue + priorGiftAggregated` (§76① "상속재산 + §13 가산증여". **§15 presumedTotal 제외** — Q-1).
4. **징수유예세액** = `calculateProration(computedTax, 분자, 분모)` (tax-utils.ts:106).
   - div0 방어(분모 0 → 0, CHD 이론상 불가) + 비율 1.0 상한(분자≥분모 → computedTax 전액, CHD-02) + floor + BigInt overflow(분자×산출세액 2.2×10¹⁷ > MAX_SAFE) 내장.
   - 입력 3값 모두 원단위 정수 → Number/BigInt 경로 일치([[feedback_safemul_decimal_apportion_precision]]). **차액 방식 금지 — 비례 곱셈만**.
5. `detail.items[].collateralExemptible` = `heritageType ∈ {designated, natural_monument}` (§74⑤, CHD-07·08).
6. `breakdown` push (deferredTax>0 시, lawRef `INH.CULTURAL_HERITAGE_DEFERRAL_CALC`).

### 상속 통합 — `inheritance-tax.ts` STEP 12.5 (STEP 12 `:676` finalTax 확정 이후, STEP 13 `:682` 배부 이전 appended)
```ts
// STEP 12: finalTax 확정 (변경 없음)
// STEP 12.5: §74 징수유예 (신규 — appended, 기존 분기 삽입 금지)
const chd = calcCulturalHeritageDeferral({
  estateItems: input.estateItems, valuatedAmountById,   // :545 기존 Map 재사용
  computedTax, grossEstateValue, priorGiftAggregated,
});
// result.culturalHeritageDeferredTax = chd.deferredTax; result.culturalHeritageDeferralDetail = chd.detail;
// allBreakdown.push(...chd.breakdown);
// ⚠️ finalTax 불변 — 징수유예는 결정세액을 줄이지 않음. 별지9호 ㊳에서만 차감.
```
- **finalTax 관계**: `result.finalTax`(결정세액)는 **불변**. 별지9호 ㊳(납부세액) = `finalTax − culturalHeritageDeferredTax`(어댑터에서 차감, 양식 공식 `㉔+㉕−㉖−㉗+...` + 재결례 940708 정합, CHD-12).
- **800줄 정책**: `inheritance-tax.ts` 이미 820줄(기존 초과) — STEP 12.5는 import+호출 **+2~3줄만**(산식은 서브엔진 격리). 800 환원은 별도 리팩터링.

---

## Silent fallback / 자동 안분 후보 식별

- **`culturalHeritageType` 미설정 → 공제 0**(CHD-01). 자동 채움 아님 — 회귀 0([[feedback_no_silent_apportion_fallback]]).
- **분모 = grossEstateValue + priorGiftAggregated** — `taxableEstateValue`(과세가액) 자동 대입 금지. §15 추정상속재산 미포함(Q-1, dual-truth 회피).
- **분자 = valuatedAmountById 단일 도출** — 사용자 별도 가액 입력 없음([[feedback_ui_engine_dual_truth_avoidance]]).
- **§12 비과세 자산이 type 설정된 경우**(CHD-11) — 분자·분모 모두 차감 전 평가액으로 일관 산입(Q-3). 이중혜택 정정은 별도 PDCA.
- validation(⑧): `culturalHeritageType` 선택은 자산 식별이라 미선택=미적용(에러 아님). 음수 가액은 기존 EstateItem 평가에서 차단.

---

## 테스트 약속

- CHD-01~12 전부 anchor. 원단위 `toBe()`.
- **CHD-03 Pre-Do 우선**([[pre-do-anchor-verification]]): 현재 `culturalHeritageDeferredTax` 부재 → 기대 110,000,000 실패 확보 후 구현.
  `expect(calcCulturalHeritageDeferral({ computedTax: 440_000_000, grossEstateValue: 2_000_000_000, priorGiftAggregated: 0, estateItems:[...], valuatedAmountById: new Map([["e2",500_000_000],...]) }).deferredTax).toBe(110_000_000)`.
- CHD-04 BigInt 경로: 분자×산출세액 2.2×10¹⁷ > MAX_SAFE → `toBe(88_000_000)`.
- 세율은 **양도연도 §26 법정 누진**(외부 자료 금지 [[feedback_transfer_year_tax_rate]]): 10억~30억 40%·누진공제 1.6억(`inheritance-gift-common.ts:34`).
- 전체 회귀 0 — 미설정 시 0이라 기존 케이스 불변(baseline은 Do 시 `npm test` 확인).

---

## UI 통합 위임

- UI 명세는 `inheritance-cultural-heritage-tax-deferral.ui.design.md`.
- 14지점 중 **⑫(Zod discriminatedUnion base)** 명시 — 누락 시 침묵 strip([[feedback_explicit_prop_mapping_strip]]). ⑬⑭(api.ts·route)는 `estateItems` 통째 전달이라 자동(`inheritance-api.ts:71`·`route.ts:72`).
- 결과: `InheritanceTaxResultView` `CulturalHeritageDeferralCard` + 별지9호 ㉖(`filing-form-9-data.ts:120·144`)·㊳(b43) + 사이드바 3단.
- 엔진 시니어는 input/result 타입 + 알고리즘 + legal-codes 상수만. ⑤⑥⑦⑧은 UI 시니어.

---

## Do 환류 (구현 갭 — 2026-06-05)

- **STEP 12.5 위치**: 계획 "STEP 12~13 사이"이나 실제 **return 직전 appended**(finalTax reconcile STEP 13.5 후, 모든 변수 확정). 산식은 `computedTax` 기준이라 위치 무관·finalTax 불변 — 정합.
- **`inheritance-tax.ts` +18줄**(계획 "+2~3줄" 과소추정) → **838줄**. 기존 820 초과 상태 + STEP 12.5. 800 환원은 별도 리팩터링.
- **anchor**: CHD-01~10 단위 9건 GREEN(`cultural-heritage-deferral.test.ts`). CHD-11(§12 비과세 동일자산)·CHD-12(별지9호 ㊳)는 엔진이 type만 신뢰하므로 단위 무의미 → filing-form-9-data b43 정합·E2E로 대체.
- **회귀**: 전체 **6582 PASS**(print-sections leaf 17→18 anchor 갱신 1건 포함).
