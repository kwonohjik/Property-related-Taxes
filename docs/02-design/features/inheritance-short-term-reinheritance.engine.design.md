# 단기 재상속세액공제 재산별 구분 계산 — 엔진 설계

> Plan: [`docs/00-pm/inheritance-short-term-reinheritance-per-asset.plan.md`](../../00-pm/inheritance-short-term-reinheritance-per-asset.plan.md)
> 조문: 상증법 §30 (KoreanLaw 검증 mst=276123, 시행 20260102) · 집행기준 30-22-1
> 결정: 재산별 배열 입력 / 1차·2차 상속개시일 자동 banding / floor 일관(권고)

## Context

교재(상속·증여세 2026 제2권) §30 사례는 재상속 재산(비상장주식·토지1·토지2)을 **재산별로 구분 계산**(집행기준
30-22-1 ②)해 합산하는 표를 요구한다. 현 엔진(`credits/short-term-reinheritance.ts`)은 **단일 안분 분수**만
지원하고, 공제율 구간을 사용자가 **수동 정수 입력**한다. 또 `tax-utils.ts:233 calcShortTermReinheritYears`는
`differenceInYears`(버림)라 사례 2.27년 → 2(90%, 오류) — "N년 이내"는 올림 banding(80%)이어야 한다(미사용 dead helper).

본 설계는 (1) 재상속분 **재산 배열** 입력 (2) 두 상속개시일 → **공제율 구간 자동 도출** (3) 재산별 floor 계산·합산·표
echo를 더하고, **legacy 단일 입력 경로를 fallback으로 보존**한다(회귀 0).

---

## ★ 케이스 인벤토리 (필수)

> anchor는 **엔진 floor 실측값**(node 복제 검증 2026-06-04) 고정. 교재 round 값은 Δ 주석.
> R-5/R-6 출처: 교재 p.468~469 사례 (부친 2020.7.5 산출세액 440M·상속재산 4,300M → 모친 2022.10.10, 80%).

| # | 시나리오 | 법령 근거 | anchor (실측 floor) | 테스트 파일 | 상태 |
|---|---|---|---|---|---|
| R-1 | banding 경계 — 정확히 2년(=2년 이내 90%) | §30②2호 | `deriveBand("2020-07-05","2022-07-05")=2`, rate 0.9 | `tax-credit.test.ts` | ☐ |
| R-1b | banding 경계 — 2년+1일(=3년 이내 80%) | §30②2호 | `deriveBand("2020-07-05","2022-07-06")=3`, rate 0.8 | 〃 | ☐ |
| R-2 | banding 사례 — 2020.7.5→2022.10.10 | §30②2호 | `deriveBand=3` (현 differenceInYears=2 대비) | 〃 | ☐ |
| R-3 | banding 10년 초과 → 0 | §30① | `deriveBand("2010-07-05","2020-07-06")=11`, rate 0 (실측 확정) | 〃 | ☐ |
| R-4 | banding 동일일(부부동시) → band 0 = 100% | 교재 ⑥ | `deriveBand(d,d)=0`, rate 1.0 | 〃 | ☐ |
| R-5 | 재산별 3건 합산 (80%) | §30②1호·집행 30-22-1② | `creditAmount=203_832_555` (교재 round 203,832,558 Δ3) | 〃 | ☐ |
| R-6 | 재산별 개별 credit | §30②1호 | `106_418_604 / 57_302_324 / 40_111_627` (교재 round +1씩) | 〃 | ☐ |
| R-7 | 재산별 비율≤1 위반 차단 | 집행 30-22-1③ | validate 오류 (priorValue > 전상속재산가액) | `inheritance-validate` | ☐ |
| R-8 | legacy lump fallback (assets 미입력) | 하위호환 | 기존 C7~C7f GREEN 유지 | `tax-credit.test.ts` | ☐ |
| R-9 | §30③ 한도 — §28·§29 차감 후 잔액 클램핑 | §30③ | orchestrator min(credit, remainingTax) | 〃 | ☐ |
| R-10 | 통합 end-to-end (1차/2차 가액 구분) — 2차 estate 2,670M(2차가 1,350/800/520)+일괄공제5억+장례비10M → taxBase 2,160M → `computedTax=704_000_000`; §30 assets 1차가(1,300/700/490) → 공제 203,832,555 | 파이프라인 | `inheritance/*.test.ts` | ☐ |

**규칙**: 행 1개 = anchor 1개+. R-5/R-6 floor 실측이 1차 anchor, 교재 round는 주석(Δ1~3). round 정확 재현 결정(D5) 시 헬퍼 전환.

---

## 법령 근거

```
§30② 1호 (원문):
  전의 상속세산출세액 × [재상속분의 재산가액 × (전의 상속세 과세가액 / 전의 상속재산가액)] ÷ 전의 상속세 과세가액
  → 판례 약분(전의 과세가액 상쇄):
  공제 기준액 = 전의 상속세 산출세액 × (재상속분의 재산가액 ÷ 전의 상속재산가액)

§30② 2호: 공제율 1년 이내 100% … 10년 이내 10% (1년당 10%p 체감)

§30③: 공제액 ≤ 산출세액 − §28 증여세액공제 − §29 외국납부세액

재상속분의 재산가액 = 전의(1차) 상속 당시 가액 (2002.12.18 개정 §30③) — 2차 평가액 아님
                     §30① 본문: §13 가산 증여재산 중 상속인·수유자 수령분도 포함 가능
전의 상속재산가액(분모) = 1차 총상속재산(채무공제 전) — 사례 4,300M (과세가액 3,500M·채무후 3,500M 아님)  [검토 #1-4]
전의 산출세액·전의 상속재산가액 = 1차 상속 전체 기준(특정 상속인 몫 아님), 재상속분만 피상속인 수령분  [검토 #1-5]
집행기준 30-22-1 ②: 재산별로 각각 구분하여 계산
집행기준 30-22-1 ③: 재상속분 ≤ 전의 상속재산가액 (비율 ≤ 1)
```

법령 상수: `TAX_CREDIT.SHORT_TERM_REINH`(`legal-codes/inheritance-gift.ts:229`, 기존 유지). 문자열 리터럴 금지.

---

## 엔진 input 타입

`lib/tax-engine/types/inheritance-tax-credit.types.ts` — `InheritanceTaxCreditInput` 확장:

```ts
/** §30 재상속분 재산 1건 (재산별 구분 계산 — 집행기준 30-22-1 ②) */
export interface ShortTermReinheritAsset {
  /** 표시·결과 echo용 명칭 (비상장주식·토지1 등). 미입력 시 "재상속재산 N" */
  name?: string;
  /** 재상속분의 재산가액 = 1차(전의) 상속 당시 가액 (§30③). §30②1호 분자. */
  priorValue: number;
}

export interface InheritanceTaxCreditInput {
  // ... 기존 priorGifts·foreign·isFiledOnTime 유지 ...

  // ===== §30 단기재상속 (재산별 모델) — 신규 필드 2개만 (검토 #1-1) =====
  /** [신규] 1차(전의) 상속개시일 ISO(YYYY-MM-DD). 2차 = input.deathDate. 공제율 구간 자동 도출용(D2). */
  shortTermReinheritPriorDeathDate?: string;
  /** [신규] 재상속분 재산 배열 (재산별 구분). 1건+ → per-asset, 미입력 → legacy lump. */
  shortTermReinheritAssets?: ShortTermReinheritAsset[];

  // ===== 재사용 (per-asset·legacy 공용) =====
  /** [재사용] 전의 상속세 **산출세액** (§30②1호 계수, 1차 상속 **전체**). 필드명 "TaxPaid"이나 의미는 산출세액(납부세액 아님). */
  shortTermReinheritTaxPaid?: number;
  /** [재사용] 전의 상속재산가액 = 1차 **총상속재산(채무공제 전)** (§30②1호 분모). */
  shortTermReinheritPriorEstateValue?: number;

  // ===== legacy fallback (하위호환 — 보존) =====
  /** @deprecated priorDeathDate + deathDate 자동 banding 권장. priorDeathDate 부재 시 수동 band fallback. */
  shortTermReinheritYears?: number;
  /** @deprecated shortTermReinheritAssets 권장. 단일 분자(전부재상속 fallback). */
  shortTermReinheritAssetValue?: number;
}
```

> Date 필드는 string regex(YYYY-MM-DD) 유지 — route handler에서 별도 Date 변환 불필요(creditInput 통째 캐스팅). [[feedback_api_zod_schema_sync]]

## 엔진 result 타입

`credits/short-term-reinheritance.ts` — `ShortTermReinheritResult` 확장 + `TaxCreditResult.shortTermReinheritDetail?` 추가:

```ts
/** 재산별 단기재상속 공제 1행 (결과 표 echo) */
export interface ShortTermReinheritPerAsset {
  name: string;
  priorValue: number;        // 재상속분 재산가액(1차 당시)
  base: number;              // floor(전산출 × priorValue / 전상속재산가액)
  credit: number;            // floor(base × rate)
}

export interface ShortTermReinheritResult {
  creditAmount: number;      // Σ per-asset.credit (한도 전)
  creditRate: number;
  band: number;              // 적용 구간(자동 도출 결과) — echo
  perAsset: ShortTermReinheritPerAsset[];   // 재산별 표(legacy lump = 1행)
  prorationApplied: boolean;
  breakdown: CalculationStep[];
  // 기존 echo(prorationNumerator·Denominator·proratedBaseTax) — 하위호환 유지(legacy 경로)
}
```

`types/inheritance-tax-credit.types.ts`:
```ts
export interface TaxCreditResult {
  // ... 기존 ...
  /** §30 재산별 표 echo (상속세 + assets 입력 시). 결과뷰 TaxCreditBreakdownCard 렌더용. */
  shortTermReinheritDetail?: {
    band: number;
    creditRate: number;
    priorComputedTax: number;       // 전의 산출세액(echo)
    priorEstateValue: number;       // 전의 상속재산가액(채무공제 전)
    perAsset: ShortTermReinheritPerAsset[];
    creditAmount: number;           // Σ per-asset.credit (한도 전) — 검토 #3-11
    limit: number;                  // §30③ 한도(= remainingTax, §28·§29 차감 후) — 결과카드 "한도 X" 표시용
  };
}
```

---

## 계산 알고리즘 (단계별)

> **엔진 함수 시그니처 최소 변경(검토 #1-2)**: `calcShortTermReinheritCredit`는 기존 param
> `priorTaxPaid`(전의 산출세액)·`elapsedYears`(=band 정수)·`currentComputedTax`·`shortTermReinheritPriorEstateValue`를
> **유지**하고 `assets?: ShortTermReinheritAsset[]`만 추가(C7~C7f 회귀 0). 아래 의사코드 변수명(priorComputedTax 등)은
> 의미 명확화용. result의 `band`는 echo(=elapsedYears 값).

**1. 공제율 구간 도출** (`deriveShortTermReinheritBand`)

```ts
export function deriveShortTermReinheritBand(priorDeathDate: string, currentDeathDate: string): number {
  const prior = toDate(priorDeathDate, "priorDeathDate");
  const current = toDate(currentDeathDate, "currentDeathDate");   // lib/api/date-coerce
  const fullYears = differenceInYears(current, prior);            // date-fns 버림
  const anniversary = addYears(prior, fullYears);
  return current > anniversary ? fullYears + 1 : fullYears;       // "N년 이내" 경계 포함
}
```
- band → `getShortTermReinheritRate(band)` (공제율 표 함수 **변경 없음**).
- legacy: `priorDeathDate` 부재 + `shortTermReinheritYears` 존재 → 그 정수를 band로.

**2. 재산 배열 정규화**
- `assets` 존재 → 그대로. 미입력 + legacy `shortTermReinheritAssetValue` → `[{priorValue: assetValue}]`.
  분자·분모 모두 부재 → 전부재상속(분수=1) 합성 1행(`priorValue = priorEstateValue`).

**3. 재산별 계산**
```ts
const rate = getShortTermReinheritRate(band);
let creditAmount = 0;
const perAsset = assets.map((a, i) => {
  const base = priorEstateValue > 0
    ? safeMultiplyThenDivide(priorComputedTax, a.priorValue, priorEstateValue)  // floor
    : priorComputedTax;                                                          // 분모0 → 분수1
  const credit = applyRate(base, rate);                                          // floor(base × rate)
  creditAmount += credit;
  return { name: a.name ?? `재상속재산 ${i + 1}`, priorValue: a.priorValue, base, credit };
});
```

**4. §30③ 한도** — orchestrator(`inheritance-gift-tax-credit.ts:266`)에서 `min(creditAmount, remainingTax)`
(remainingTax = 산출세액 − §28 − §29). 엔진 내부 `currentComputedTax` 한도는 보조 방어로 유지.

**5. orchestrator banding 통합** (`inheritance-gift-tax-credit.ts:252-270`)
```ts
const band = creditInput.shortTermReinheritPriorDeathDate && deathDate
  ? deriveShortTermReinheritBand(creditInput.shortTermReinheritPriorDeathDate, deathDate)
  : creditInput.shortTermReinheritYears;   // legacy fallback
// 게이트: band 도출 가능 + 전의 산출세액 존재. assets는 optional(미입력 시 legacy lump). 검토 #2
if (band !== undefined && creditInput.shortTermReinheritTaxPaid !== undefined) {
  const r = calcShortTermReinheritCredit({ priorTaxPaid, elapsedYears: band, currentComputedTax, shortTermReinheritPriorEstateValue, assets });
  shortTermReinheritCredit = Math.min(r.creditAmount, remainingTax);   // §30③ 한도
  // echo 배선(검토 #3-9): r.perAsset·band·creditRate·limit → creditResult.shortTermReinheritDetail (결과뷰 표 소스)
}
```

---

## Silent fallback / 자동 안분 후보 식별

- **금지**: `assets` 일부만 입력 시 빈 슬롯 자동 채움 금지. 미입력 = validation 오류([[feedback_no_silent_apportion_fallback]]).
- **허용 fallback(명시 하위호환)**: assets·priorEstate **둘 다 미입력** → legacy 분수=1(전부재상속). 한쪽만 입력 = ⑧ 차단.
- **banding fallback**: `priorDeathDate` 부재 시 legacy `shortTermReinheritYears`(수동 band). 둘 다 부재 → §30 미적용.
- **재산별 비율≤1**(R-7): 각 `priorValue ≤ priorEstateValue` **AND `Σ priorValue ≤ priorEstateValue`**(재상속분 합 ≤ 전상속재산, 검토 #3-7). 위반 = validate 차단(집행 30-22-1③).
- **날짜 정합**: `priorDeathDate ≤ deathDate` (1차가 2차보다 늦으면 오류).

---

## floor vs round (D5 — 미결, Do 진입 시 확정)

- **권고 floor 일관**: anchor = 203,832,555(재산별 합). 교재 203,832,558(round half-up)은 Δ3 주석.
- round 정확 재현 시: `bigint-round-half-up` 헬퍼로 `credit = roundHalfUp(base × rate)` → 교재 정확 일치(floor 원칙 예외 1건).
- 실측 근거(node, 2026-06-04): 무한소수 비율(1,300/4,300) → 자산당 floor Δ1, 합 Δ3 / lump Δ1.

---

## 테스트 약속

- `__tests__/tax-engine/tax-credit.test.ts`: R-1~R-9 (banding 경계·사례·재산별·legacy 회귀·한도).
- `__tests__/tax-engine/inheritance-gift/inheritance.test.ts`: R-10 통합(2차 산출 704M).
- 기존 C1~C7f **전부 GREEN 유지**(legacy lump). `differenceInYears` dead helper 대체 후 `tax-utils` 테스트 영향 확인.
- 원단위 `toBe()` 고정([[feedback_pdf_example_test_anchoring]]). 교재 round 값은 주석 + (선택)`±3 tolerance`.

---

## UI 설계 (요약 — 상세 `.ui.design.md`는 inheritance-gift-tax-ui-senior 담당)

- `steps.tsx:599-677` 단기재상속 섹션 개편:
  - **1차 상속개시일** `DateInput`(2차 = deathDate 자동, "경과 N년 → 공제율 %" 자동 표시) — 현 정수 입력 대체.
  - **전의 상속세 산출세액** `CurrencyInput`(hint "1차 상속의 **전체** 산출세액, 결정세액·상속인 몫 아님" — 검토 #1-5).
  - **전의 상속재산가액** `CurrencyInput`(분모, hint "1차 **총상속재산(채무공제 전)**, 과세가액 아님" — 검토 #1-4).
  - **재상속분 재산 목록**: 추가/삭제 반복 카드(명칭 + 1차 당시 가액). hint "1차 상속 당시 평가액 — 2차 평가액 아님"(G4).
- 결과뷰 `TaxCreditBreakdownCard`: `shortTermReinheritDetail.perAsset[]` → 재산별 표(명칭·재상속분·base·credit) + 합계 + 공제율·band echo. `amount-column-align` 적용. label-parse 폐지.
- 800줄: 재상속 자산 반복 카드는 sub-component 추출 검토.
