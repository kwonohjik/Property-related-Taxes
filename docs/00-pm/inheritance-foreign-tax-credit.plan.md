# 상속세 외국납부세액공제 (상증법 §29 / 상증령 §21) — 법령 정합 완성 계획서

> 작성일: 2026-06-04 · 작업 브랜치(worktree): `worktree-inheritance-foreign-tax-credit-plan`
> 단계: **PDCA Plan** (엔진 시니어 `inheritance-gift-tax-credit-senior` + UI 시니어 `inheritance-gift-tax-ui-senior` 병렬 참여 완료)
> 근거 이미지: 상속세 실무서 459~461쪽 (외국납부세액 공제 범위·한도·개정연혁·계산사례, 단기재상속 §30)

---

## 0. 한 줄 요약

외국납부세액공제(§29)는 **이미 골격이 있으나 "반쪽 구현"** 이다 — 현재는 외국납부세액 1칸만 입력받고 **상증령 §21①의 핵심인 "국외재산 과세표준 점유비 한도"가 전혀 적용되지 않는다.** 본 작업은 신규 구현이 아니라 **법령(상증령 §21① Min 한도) 정합으로 완성**하는 것이다.

---

## 1. 문제 정의 — 현행이 왜 반쪽인가 (실측 확정)

| 사실 | 근거 file:line | 의미 |
|---|---|---|
| UI는 외국납부세액 1칸만 입력 | `components/calc/inheritance/steps.tsx:566-572` | 국외재산 과세표준/비율 입력 위젯 **없음** |
| 한도는 `foreignPropertyRatio`로 계산 | `lib/tax-engine/credits/foreign-tax-credit.ts:77-91` | 이 값이 있어야만 한도 분기 작동 |
| `foreignPropertyRatio`는 `InheritanceTaxCreditInput`에 **없음** | `lib/tax-engine/types/inheritance-tax-credit.types.ts:11-38` | creditInput 경로로는 전달 불가 |
| `foreignPropertyRatio`는 `InheritanceTaxEngineOptions`에만 존재 | `lib/tax-engine/inheritance-tax.ts:75 → :612` | options 경로로만 흐름 |
| 그러나 route는 **options를 만들지 않는다** | `app/api/calc/inheritance/route.ts:69-90` (input 객체에 options 키 없음, `:97 calcInheritanceTax(input)`) | `foreignPropertyRatio`는 **도달 불가능한 dead code** |
| API 변환·Zod·UI 어디서도 세팅 안 함 | `InheritanceTaxForm.tsx:383` · `lib/validators/property-valuation-input.ts:682` | 항상 `undefined` |

**귀결**: `foreign-tax-credit.ts:77`의 `if (foreignPropertyRatio !== undefined …)` 분기가 **항상 else** → `limit = computedTax`(산출세액 전액) → **외국납부세액 전액이 산출세액 한도 내에서 무제한 공제**된다. 상증령 §21①이 정한 과세표준 점유비 한도가 누락된 과다공제 상태.

### 1-1. 법령 드리프트 (주석 ↔ 현행 법령 불일치)

`foreign-tax-credit.ts:7-8` 주석:
```
공제 한도: 산출세액 × (국외 상속·증여 재산가액 / 상속·증여 재산가액 총액)
```
이는 **1997.11.9 이전 구법(재산가액 점유비)** 표현이다. 현행은 과세표준 점유비. → memory `feedback_engine_comment_vs_impl_drift` 적용 대상 (주석을 법령 기준으로 정정).

---

## 2. 법령 근거 (KoreanLaw MCP 검증 완료)

- **상증법 §29 (외국 납부세액 공제)** — mst 276123
  > "거주자의 사망으로 상속세를 부과하는 경우에 외국에 있는 상속재산에 대하여 외국의 법령에 따라 상속세를 부과받은 경우에는 **대통령령으로 정하는 바에 따라** 그 부과받은 상속세에 상당하는 금액을 상속세산출세액에서 공제한다."
- **상증령 §21① (외국납부세액공제)** — mst 283637
  > "법 제29조에 따라 상속세산출세액에서 공제할 외국납부세액은 **다음 계산식에 따라 계산한 금액**으로 한다. **다만, 그 금액이 외국의 법령에 따라 부과된 상속세액을 초과하는 경우에는 그 상속세액을 한도로 한다.**"
  > ② 외국납부세액공제신청서를 상속세과세표준신고와 함께 납세지 관할세무서장에게 제출.
  - ※ 계산식 본체는 법전에 **수식 이미지**로 삽입되어 Open API 텍스트로는 미출력. 아래 교재가 그 계산식의 정식 표현.
- **교재 459~461쪽 — §21① 계산식 정식 표현**
  - **공제액 = Min( ① , ② )**
    - ① 한도계산식 = **상속세 산출세액 × ( 외국법령에 따라 상속세가 부과된 상속재산의 과세표준 ÷ 상증법 §25① 상속세 과세표준 )**
    - ② = 외국법령에 따라 부과된 상속세액
  - **개정연혁(460쪽)**: 1997.11.9 이전 = 재산가액 점유비 → **1997.11.10 ~ 현재 = 과세표준 점유비**
  - **공식 계산사례(460~461쪽)** — anchor 고정 대상:

    | 구분 | 총상속 | 국외상속 |
    |---|---:|---:|
    | 재산가액 | 50억 (국외 20억 포함) | 20억 |
    | 공제액 | 10억 | 10억 |
    | 과세표준 | 40억 | 10억 |
    | 산출세액 | 15억 | 4억 (= 외국부과세액 ②) |

    - 현행 ① = 15억 × (10억 / 40억) = **3.75억** → Min(3.75억, 4억) = **공제 3.75억** = `375,000,000`
    - (참고) 구법 ① = 15억 × (20억 / 50억) = 6억 → Min(6억, 4억) = 4억

---

## 3. 설계 결정 — 설계 A 채택

### 입력 모델
- `foreignTaxPaid` (외국 부과 상속세액 = ②) **유지**
- **신규** `foreignInheritanceTaxBase` (국외 상속재산 과세표준 = ① 분자) 를 `InheritanceTaxCreditInput`에 optional 추가
- **분모(전체 과세표준)는 사용자 입력 없음** — 엔진이 이미 보유한 `taxBase`(`inheritance-tax.ts:471` STEP7 → `calcInheritanceTaxCredits` params, `inheritance-gift-tax-credit.ts:192`)를 `calcForeignTaxCredit`에 주입

### 설계 A vs B
| | 설계 A (채택) | 설계 B (기각) |
|---|---|---|
| 분자 | UI 입력 `foreignInheritanceTaxBase` | 동일 |
| 분모 | **엔진 `taxBase` 자동** | 사용자 별도 입력 |
| 장점 | 단일 진실, 분모 불일치 0, 입력 최소 | §30과 형태 동일 |
| 단점 | 엔진 배선 1줄 | 분모 이중관리 → 불일치 버그 위험 |

**채택 근거**: §21① 분모는 "§25① 상속세 과세표준"이라는 **법령이 지정한 단일값**. 엔진이 정확히 보유 중이므로 재입력은 모순·실수 유발. (memory `feedback_ui_engine_dual_truth_avoidance` 정합)

### 한도 산식 (정수·BigInt) + 잔액 클램핑 ⚠️ 1차 검토 정정(R1)
```
한도① = safeMultiplyThenDivide(totalComputedTax, foreignInheritanceTaxBase, taxBase)  // 산출세액 = §28 차감 前 원본
공제후보 = Math.min(foreignTaxPaid, 한도①)
외국납부세액공제 = Math.min(공제후보, remainingTax)   // §28 차감 후 잔액 초과 방지 (§30 패턴)
```
- **(R1) 산출세액 기준 = `totalComputedTax`(§28 증여세액공제 차감 前 원 산출세액).** 상증령 §21① 한도식의 "상속세 산출세액"은 세액공제 차감 전 산출세액 — 현행 `inheritance-gift-tax-credit.ts:232`가 `remainingTax`(§28 차감 후)를 넘기므로 한도 활성화 시 분자 곱이 과소 계산되어 법령 위반. §30(`:253 currentComputedTax: totalComputedTax` + `:259 Math.min(credit, remainingTax)`)과 **동일 2단 구조**(한도=원 산출세액, 실제 공제=잔액 클램핑)로 정정.
- **`applyRate(amount, ratio)`(float 비율 곱) 금지** — 산출세액 15억 × 국외과표 10억 = **1.5e18 > Number.MAX_SAFE_INTEGER(9.007e15)**. `safeMultiplyThenDivide`(tax-utils.ts:87)가 `product>MAX_SAFE` 시 **BigInt 경로**, `c===0` 시 **0 반환** 두 방어를 모두 내장 (실측 확인). memory `feedback_safemul_decimal_apportion_precision` 정합.

### 하위호환 + gift(§59) 회귀 방지 (D1·D2)
- `foreignPropertyRatio` (도달 불가 dead code) → `@deprecated`/제거: `ForeignTaxCreditInput`(foreign-tax-credit.ts:31), `InheritanceTaxCreditParams`(inheritance-gift-tax-credit.ts:156), `InheritanceTaxEngineOptions`(inheritance-tax.ts:75) + 전달 라인(inheritance-tax.ts:612, inheritance-gift-tax-credit.ts:233, **gift 호출부 :408**).
- ⚠️ **gift(§59) 회귀 방지 (D1)**: `calcForeignTaxCredit`은 상속·증여 **공용**. gift 호출부(`:404-410`)는 `overallTaxBase`를 전달하지 않으므로, `calcForeignTaxCredit`에서 **`overallTaxBase === undefined` → 한도=computedTax 전액(기존 동작 보존)**, `!== undefined`(inheritance) → §21① 점유비 한도로 분기한다. 이 분기 없이 점유비 로직을 적용하면 **gift 외국납부세액공제가 0으로 퇴행**. 참고: gift(`:407`)는 이미 `computedTax: totalComputedTax` 사용 — 상속세(`:232 remainingTax`)와 불일치였고 R1 정정으로 양쪽 통일.

### 결과 표시용 echo (dual-truth 회피)
`calcForeignTaxCredit`이 한도①·공제후보와 산식 표시용 데이터를 반환하고, `calcInheritanceTaxCredits`이 **잔액 클램핑(R1) 후 최종 공제액**으로 `TaxCreditResult.foreignCreditDetail`을 조립한다: `{ computedTax(산출세액 원본), foreignTaxPaid, foreignInheritanceTaxBase, overallTaxBase, creditLimit(한도①), creditAmount(최종, 클램핑 후) }`. `computedTax`(P1)는 `buildSection29Formula`가 "산출세액 × (국외과표 ÷ 과세표준)" 산식을 그리는 데 필수. UI는 이 echo만 렌더 — 비율·한도 UI 재계산 금지. (상세 §7)

---

## 4. 변경 파일·함수 목록

### 엔진 (시퀀셜 1순위 — `inheritance-gift-tax-credit-senior`)
| 파일 | 변경 |
|---|---|
| `lib/tax-engine/credits/foreign-tax-credit.ts` | 주석 정정(재산가액→과세표준), `ForeignTaxCreditInput`에 `foreignInheritanceTaxBase`·`overallTaxBase` 추가·`foreignPropertyRatio` deprecate, 한도 산식 `safeMultiplyThenDivide`로 교체, breakdown Min(①,②) 재편 |
| `lib/tax-engine/types/inheritance-tax-credit.types.ts:11-38` | `InheritanceTaxCreditInput`에 `foreignInheritanceTaxBase?: number` 추가 |
| `lib/tax-engine/inheritance-gift-tax-credit.ts:230-240` | (R1) `computedTax: remainingTax` → **`totalComputedTax`**(원 산출세액)로 변경 + `foreignInheritanceTaxBase`·`overallTaxBase: taxBase ?? 0` 전달, `foreignPropertyRatio` 제거. 반환 `creditAmount`를 `Math.min(_, remainingTax)`로 잔액 클램핑 후 `remainingTax -=` (§30 패턴, `:253·259`) |
| `lib/tax-engine/inheritance-tax.ts:75, 612` | `foreignPropertyRatio` deprecate/제거 (taxBase는 이미 전달 중 — 무변경) |
| `lib/tax-engine/legal-codes/inheritance-gift.ts:225` | 신규 상수 `INH_FOREIGN_LIMIT: "상증령 §21①"` (한도 lawRef) |
| `lib/tax-engine/types/inheritance-tax-credit.types.ts` `TaxCreditResult` | `foreignCreditDetail?` echo 필드 추가 (§7 결과표시용) |
| `foreign-tax-credit.ts` + `inheritance-gift-tax-credit.ts` | `ForeignTaxCreditResult`에 detail 반환 → `calcInheritanceTaxCredits`이 `foreignCreditDetail`로 끌어올림 |

### UI (시퀀셜 2순위 — `inheritance-gift-tax-ui-senior`)
| 파일 | 변경 |
|---|---|
| `components/calc/inheritance/shared.ts:70, 133` | `FormState`·`INITIAL_FORM`에 `foreignInheritanceTaxBase: string` 추가 |
| `components/calc/inheritance/steps.tsx:566-572` | 단순 CurrencyInput → **섹션 카드(번호+tone)** 승격, 외국납부세액 + 국외 상속재산 과세표준 2칸 |
| `components/calc/InheritanceTaxForm.tsx:383, 106` | `buildInput`의 `creditInput`에 `foreignInheritanceTaxBase: parseAmount(form.x) \|\| undefined` 추가(④) + `KEY_LABELS`(:106)에 라벨 추가(R4). **단일 마법사 진입 — 실측 해소** |
| `lib/calc/inheritance-validate.ts` | V-29-2(음수 금지)·V-29-3(과표만/세액만 입력 케이스) 추가 |
| `lib/validators/property-valuation-input.ts:682` | `foreignInheritanceTaxBase: z.number().nonnegative().optional()` |
| `components/calc/TaxCreditBreakdownCard.tsx:357-361` | `buildSection29Formula()` 신규 + §29 `CreditRow`에 `formula` 연결 (현재 §29만 펼침 누락 — 사용자 지적) |
| `components/calc/results/InheritanceTaxResultView.tsx:338` | `TaxCreditBreakdownCard` 렌더(숨김 해제) + `AllocationBreakdownSection` §28 중복 정리 |

### route / api 변환 — **무수정**
- `app/api/calc/inheritance/route.ts:84-85` 가 `creditInput`을 객체째 전달하므로, Zod 스키마에 필드만 추가하면 ⑬⑭ 자동 충족 (실측 확인).

---

## 5. 14개 동기화 지점 매핑

| # | 지점 | 현재 위치 | 작업 |
|---|---|---|---|
| ① | 폼 상태 | `inheritance/shared.ts:70` | `foreignInheritanceTaxBase: string` 추가 |
| ② | initial | `inheritance/shared.ts:133` | `""` 추가 |
| ③ | normalize | (상속세 폼 normalize 루틴 없음 — 실측) | **N/A** — `shared.ts`에 normalize 함수 없음(INITIAL_FORM·pruneOrphanHeirReferences만), `calc-wizard-migration`은 양도세 자산 전용. ②(INITIAL_FORM)로 충족 |
| ④ | API 변환 | `InheritanceTaxForm.tsx:383` buildInput(creditInput) | `foreignInheritanceTaxBase: parseAmount(form.x) \|\| undefined` 추가. 마법사 단일 진입(`callInheritanceTaxAPI(buildInput)` :425·434) — **실측 해소** |
| ⑤ | UI 위젯 | `steps.tsx:566-572` | 섹션 카드 + 국외과표 입력칸 |
| ⑥ | 사이드바 | `InheritanceSidebar` | 합계만 — 별도 노출 불요(검토) |
| ⑦ | 결과 카드 | `TaxCreditBreakdownCard:357` + `InheritanceTaxResultView:338` | §29 `formula` 연결 + 카드 렌더(숨김 해제) + result `foreignCreditDetail` echo (§7 옵션 X) |
| ⑧ | validation | `inheritance-validate.ts` | V-29-2·V-29-3 |
| ⑨ | Zod enum | (enum 아님) | N/A |
| ⑩ | Zod 컴패니언 | `property-valuation-input.ts:682` | 필드 추가 |
| ⑪ | acqDate fallback | — | N/A (상속세) |
| ⑫ | Zod 입력객체 | `inheritanceTaxCreditInputSchema:680-690` | 필드 추가 |
| ⑬ | body spread | `inheritance-api.ts:68-89` / route:84 | creditInput 통째 — **자동** |
| ⑭ | route 매핑 | `route.ts:84-85` | creditInput 통째 — **무수정** |

---

## 6. 케이스 인벤토리 (anchor 직결)

| # | 상황 | 입력 (computedTax/국외과표/전체과표/외국세액) | 기대 한도① | 기대 공제 | 검증 |
|---|---|---|---:|---:|---|
| FTC-01 | 교재 공식 사례 (①<②) | 15억 / 10억 / 40억 / 4억 | 3.75억 | **375,000,000** | BigInt 경로, Min=① |
| FTC-02 | 외국세액이 한도 이내 (①>②) | 15억 / 10억 / 40억 / 3억 | 3.75억 | **300,000,000** | Min=② |
| FTC-03 | 국외 과세표준 미입력 | 15억 / undefined / 40억 / 4억 | 0 | **0** | 과다공제 차단 |
| FTC-04 | 전체 과세표준=0 | 15억 / 10억 / 0 / 4억 | 0 | **0** | c===0 방어 |
| FTC-05 | 국외과표 ≥ 전체과표 (비율 100%) | 15억 / 40억 / 40억 / 16억 | 15억 | **1,500,000,000** | 한도=산출세액 전액 |
| FTC-06 | 외국세액=0 | 15억 / 10억 / 40억 / 0 | — | **0** | 조기반환, "해당 없음" |
| FTC-07 | 소액 floor 검증 | 1,001 / 1 / 3 / 500 | floor(1001×1/3)=333 | **333** | Math.round 금지 확인 |
| FTC-09 | (회귀·D1) gift §59 — overallTaxBase 미전달 | mode=gift, computedTax=15억, overallTaxBase=undefined, 외국세액 4억 | computedTax 전액 | **400,000,000** | gift 한도=전액 보존, 점유비 미적용 |

> ※ FTC-01~07은 `calcForeignTaxCredit` **단위** 테스트(`computedTax`=산출세액 원본 직접 입력, 잔액 클램핑 미포함 — 클램핑은 호출부이므로 통합 anchor FTC-08에서 검증). "기대 공제"=`Min(외국세액, 한도①)`.
> ※ FTC-03 "국외과표 미입력 시 0 공제"는 자동 안분 fallback이 아니라 **한도 조건 미충족**으로 정의(memory `feedback_no_silent_apportion_fallback` 정합). UI는 외국세액만 입력하고 과표 미입력 시 hint로 안내하되 차단 여부는 §7-validation에서 확정.

---

## 7. 결과 표시 설계 (R-1 확정 — 사용자 결정 2026-06-04)

### breakdown (Min 구조, 한국어 풀어쓰기)
```
① 외국에서 납부한 상속세액                                      400,000,000   (상증법 §29)
② 한도 — 상속세 산출세액 × 국외 상속재산 과세표준 ÷ 상속세 과세표준   375,000,000   (상증령 §21①)
   (산출세액 15억 × 국외 과세표준 10억 ÷ 전체 과세표준 40억)
③ 외국납부세액공제 = 한도와 납부액 중 작은 금액                  - 375,000,000  (상증법 §29)
```
- 변수 약어·`floor()` 금지(memory `feedback_result_view_korean_formula`), "원" 접미사 금지(`feedback_no_won_suffix`), 금액칼럼 `text-right font-mono tabular-nums`(스킬 `amount-column-align`).

### 표시 위치 — 실측 현황 + 확정 해법 (옵션 X)

**사용자 요구 (2026-06-04)**: 외국납부세액공제도 세액공제 명세서에서 **다른 세액공제(§28·§30·§69)와 동일하게 ▼펼치기로 계산근거(Min 산식)** 를 표시한다.

**실측 현황** (추정 아님):
1. `TaxCreditBreakdownCard.tsx:357-361`에 "외국납부세액공제" 행이 **이미 있으나 `formula` prop이 없다.** §28(`buildSection28Formula`)·§30(`buildSection30Formula`)·§69(`buildSection69Formula`)는 `formula`가 있어 ▼펼침 산식이 나오는데 **§29만 펼침이 없다** ← 사용자 지적의 정확한 대상.
2. `CreditRow`(`:224-278`)는 `formula`가 있으면 자동으로 "▶/▼ 산출근거" 토글을 렌더 → **인프라 완비, §29 빌더만 부재.**
3. 단, 이 카드는 `InheritanceTaxResultView.tsx:338`에서 **상속세 화면에 렌더되지 않는다** (증여세 `GiftTaxResultView.tsx:424`만 사용). 현재 상속세 세액공제 펼침은 `AllocationBreakdownSection`(67줄)이 **§28만** 다룬다 → §29·§30·§69는 상속세 화면에 개별 펼침이 없다.

**확정 해법 (옵션 X)**:

| 단계 | 내용 |
|---|---|
| (1) 엔진 echo | `TaxCreditResult`에 `foreignCreditDetail?: { computedTax; foreignTaxPaid; foreignInheritanceTaxBase; overallTaxBase; creditLimit; creditAmount }` 추가(`computedTax`=산출세액 원본, `creditAmount`=잔액 클램핑 후 최종). §28 `priorGiftCreditDetail` 패턴과 동일 → UI 재계산(dual-truth) 회피 (memory `feedback_ui_engine_dual_truth_avoidance`) |
| (2) 산식 빌더 | `buildSection29Formula(detail)` 신규 (TaxCreditBreakdownCard.tsx, §28 빌더 패턴 차용) |
| (3) formula 연결 | §29 `CreditRow`(`:357-361`)에 `formula={section29Formula}` 추가 |
| (4) 카드 렌더 | `TaxCreditBreakdownCard`를 상속세 결과뷰에 렌더(`InheritanceTaxResultView` 숨김 해제). `AllocationBreakdownSection`(§28)과 역할 정리 — 세액공제 개별 명세+펼침은 카드로 일원화, 배부표는 산출세액·인별 배부에 집중 |

**부수 이득**: 카드 렌더 시 §29뿐 아니라 §30·§69도 상속세 화면에서 ▼펼침을 갖게 되어 세액공제 명세 일관성이 완성된다.

---

## 8. anchor 테스트 설계

**신규** `__tests__/tax-engine/inheritance/foreign-tax-credit.test.ts` (기존 `installment-payment.test.ts` 등 구조 차용)
```ts
// FTC-01 교재 사례 — 원단위 고정
expect(calcForeignTaxCredit({
  foreignTaxPaid: 400_000_000, computedTax: 1_500_000_000,
  foreignInheritanceTaxBase: 1_000_000_000, overallTaxBase: 4_000_000_000,
  mode: "inheritance",
}).creditAmount).toBe(375_000_000);
// FTC-02 → 300_000_000 / FTC-03 → 0 / FTC-04 → 0
// FTC-05 → 1_500_000_000 / FTC-06 → 0 / FTC-07 → 333
```
+ 통합 anchor 2건: (a) `calcInheritanceTax`에 creditInput.foreignInheritanceTaxBase 주입 → result 세액공제 foreignTaxCredit 검증 (엔진 taxBase 자동 주입 확인). (b) **FTC-08 (R1 클램핑)**: §28 증여세액공제가 존재하는 입력에서 §29 한도가 `totalComputedTax`(원 산출세액) 기준으로 계산되는지(§28 차감 후 잔액 기준이 **아님**), 그리고 공제 후보가 `remainingTax`(§28 차감 후 잔액)를 초과하면 잔액으로 클램핑되는지 검증.
+ E2E 1건: `e2e/inheritance-foreign-tax-credit.spec.ts` (패턴: `e2e/inheritance-corporate-exemption-filing-credit.spec.ts`) — 폼→계산→결과 §29 산식 노출. memory `feedback_browser_verify_with_playwright`.

교재 수치는 외부 계산기/PDF 산출값이 아닌 **법정 산식 직접 계산값**으로 고정 (memory `feedback_pdf_example_test_anchoring`·`feedback_transfer_year_tax_rate`).

---

## 9. 작업 순서 (Plan 병렬 / Do 시퀀셜)

1. **Do-1 (엔진)**: 타입(`foreignInheritanceTaxBase`)·`foreign-tax-credit.ts` 산식·배선(taxBase 주입)·주석 정정·anchor FTC-01~07 → `npx vitest run __tests__/tax-engine/inheritance/foreign-tax-credit.test.ts`
2. **R-1 해결**: 결과뷰 §29 노출 경로 (a/b/c) 실코드 확정
3. **Do-2 (UI)**: ①②③⑤⑦⑧⑩⑫ + buildSection29Formula + E2E. ⑬⑭ 자동.
4. **Check**: `ui-engine-sync-checker`(14지점) → `bkit:gap-detector`(계획-구현 matchRate) → `npx tsc --noEmit` → `npm test`
5. **Act**: 회귀 + 본 계획서 환류.

---

## 10. 범위 밖 · 후속 (메모)

- **증여세 §59 대칭**: 후속 분리 권고. 증여세 분모는 10년 합산 과세표준(`gift-tax.ts:191 aggregatedTaxBase`). 별도 14지점 동기화 + 상증령 증여 외국납부 한도 조문 KoreanLaw 재검증 필요.
- **단기재상속 §30②1호**: KoreanLaw 정식 산식에 "전의 상속세 과세가액" 항 포함. 현행 약분 구현(`short-term-reinheritance.ts:80-83, 190` 재상속분÷전의상속재산가액)은 과세가액 소거로 **법령 정합 확인** (후속 리뷰 우선순위 LOW).

---

## 11. 미확인 항목 (Do 1순위 검증 — 추정 금지)

1. ✅ **해소(R2)** — 마법사 = `InheritanceTaxForm.tsx` 단일 진입(`callInheritanceTaxAPI(buildInput(form))` :425·434). legacy 공존 없음. ④ = `:383` creditInput에 추가, `inheritance-api.ts:84`·`route.ts:84` 는 `creditInput` 통째 전달 → 무수정.
2. ✅ **해소(R3)** — 상속세 폼에 normalize/sessionStorage 마이그레이션 루틴 없음(`shared.ts`는 INITIAL_FORM·pruneOrphanHeirReferences만). ③은 INITIAL_FORM(②) 추가로 충족, 별도 normalize N/A.
3. **⑥ 사이드바**: 외국납부세액공제 합계 노출 필요성.
4. **R-1**: ✅ 확정 — 옵션 X(§7). 사용자 결정으로 해소.
5. **§28 중복 펼침**: 카드 렌더 시 `AllocationBreakdownSection`의 §28 펼침과 `TaxCreditBreakdownCard`의 §28 행이 중복되는지 — Do 시 역할 분리 확정.

---

## 12. Definition of Done

- [ ] 케이스 매트릭스 FTC-01~07 전 분기 anchor `toBe()` 통과
- [ ] 엔진 주석 "재산가액"→"과세표준" 정정, `foreignPropertyRatio` deprecate
- [ ] 14지점 전부 (⑫⑬⑭ grep 자가점검)
- [ ] API fallback ↔ validation 동기화 (V-29-2·V-29-3)
- [ ] `npx tsc --noEmit` 0건
- [ ] `npm test` 통과 (공유 모듈 영향 — 세목별 스크립트 아닌 전체)
- [ ] §29 `formula` ▼펼침이 §28·§30·§69와 동일하게 동작 + `TaxCreditBreakdownCard` 상속세 렌더 + E2E(▼펼침 산식 노출) 통과 (사용자 요구)
- [ ] 모든 변경 파일 800줄 이하
