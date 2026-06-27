# 신탁수익권(§61)·정기금받을권리(§62) 평가 — 엔진 설계

> 계획서: `docs/00-pm/inheritance-gift-trust-benefit-valuation-61.plan.md`. UI: `inheritance-gift-trust-benefit-valuation-61.ui.design.md`.
> 검증: KoreanLaw 상증령 §61·§62 본문 실측(2026-06-27, mst 283637). 현가 모델: `gift-deemed/trust-benefit.ts:25-45`(§33 재사용 헬퍼).
> ⚠️ §61①1호(동일수익자)=신탁재산 가액 **그 자체** — §33 `calcTrustBenefit` `same` 합산값(997m) 재사용 금지(계획 정정 A).

## Context

EstateItem 재산평가에 **신규 카테고리 2종** 추가 (상속·증여 공용):
- `trust_benefit` — 신탁의 이익을 받을 권리(상증령 §61). 권리별 3분기 평가.
- `periodic_payment` — 정기금을 받을 권리(상증령 §62). 유기·무기·종신.

평가 산식의 PV 코어(`pvAt`·연수도출)는 §33 경로(`gift-deemed/trust-benefit.ts`)에서 공용 추출해 재사용하되, 권리별/종류별 **조립은 각 평가 함수 전용**.

---

## ★ 케이스 인벤토리 (행≥1 — Do 진입 게이트)

공통 전제(신탁): 신탁재산 8억 · 세후연수익 = 800,000,000 × 10% × (1−0.154) = 67,680,000 · 3회차 n=0,1,2.

| # | 시나리오 | 법령 | anchor (원단위) | 테스트 | 상태 |
|---|---|---|---|---|---|
| TBV-1 | **동일수익자(1호)** 일시금 < 평가 | 령§61①1호 | 신탁재산 가액 = **800,000,000** | `__tests__/tax-engine/property-valuation/trust-benefit-61.test.ts` | ☐ Pre-Do |
| TBV-2 | 수익권 PV합 n=0,1,2 | 령§61①2호나·칙§19의2① | 67,680,000+65,708,737+63,794,891 = **197,183,628** | 〃 | ☐ Pre-Do |
| TBV-3 | **원본권(2호가)** 수익자 다름 | 령§61①2호가 | 800,000,000 − 197,183,628 = **602,816,372** | 〃 | ☐ Pre-Do |
| TBV-3b | 수익권(2호나) 수익자 다름 | 령§61①2호나 | = TBV-2 = 197,183,628 | 〃 | ☐ |
| TBV-4 | 해지일시금 > 평가 → 일시금 | 령§61① 단서 | Max(평가, surrender) | 〃 | ☐ |
| TBV-5 | 수익률 미확정 → 원본×3% | 칙§19의2② | R = 800,000,000×30/1000 − 원천징수 | 〃 | ☐ |
| TBV-6 | 수익시기 미정 → §62 준용 20년(무기) | 령§61②·§62 2호 | 20회차 PV합 | 〃 | ☐ |
| TBV-7 | 수익시기 미정 → 기대여명(종신) | 령§61②·§62 3호 | getLifeExpectancyFloor 회차 | 〃 | ☐ |
| TBV-8 | 상속세 경로(상속개시일 기준) 평가 동일 | 령§61①·법§60 | 증여 경로와 동일 | 〃 | ☐ |
| TBV-9 | 신탁재산 하위 자산 합산(결정 B) | 령§61①·법§60 | Σ trustAssets = 신탁재산가액 | 〃 | ☐ |

정기금(공통: ordinary annuity n=1.., r=3%, floor-per-term):
| # | 시나리오 | 법령 | anchor | 상태 |
|---|---|---|---|---|
| PP-1 | 유기 현가합 < 20배 | 령§62 1호 | 연10,000,000×5년 ordinary n=1..5 floor-per-term = **45,797,069**(BigInt 실측 동결. 계수 45,797,100은 반올림 근사) | ✅ |
| PP-2 | 유기 20배 cap | 령§62 1호 단서 | Σ > 1년분×20 → 1년분×20 | ☐ |
| PP-3 | 무기 | 령§62 2호 | 1년분 × 20 | ☐ |
| PP-4 | 종신(기대여명) | 령§62 3호 | getLifeExpectancyFloor 회차 PV합 | ☐ |
| PP-5 | 일시금 > 본칙 | 령§62 본문 단서 | Max | ☐ |

> **Pre-Do(필수 환류)**: TBV-1·2·3 + PP-1을 먼저 작성·실행. ① §61 권리별 ≠ §33 합산 실증, ② 정기금 ordinary n=1 시작·floor-per-term vs floor-of-sum 정책 확정.

---

## 법령 근거 (KoreanLaw 본문 실측 2026-06-27)
```
상증령 §61①    신탁이익 받을 권리 가액 = 각 호. 단서: 철회·해지·취소 일시금 > 각호 평가액 → 일시금
  1호  원본·수익 수익자 같음 = 평가기준일 현재 법(§60~65)에 따라 평가한 신탁재산의 가액   ← 수익권 PV 미가산
  2호가 원본권 수익 = 신탁재산 가액 − 2호나 합계액
  2호나 수익권 수익 = Σ 추산 장래 각연도 수익금(원천징수세액상당액 고려) / (1+이자율)ⁿ
상증령 §61②    수익시기 미정 → §62 2호(20년)·3호(기대여명) 준용
상증령 §62     정기금 받을 권리. 단서: 일시금 > 각호 → 일시금
  1호  유기 = Σ 각연도 정기금/(1+r)ⁿ (n=평가기준일부터 경과연수). 단 1년분×20 초과 불가
  2호  무기 = 1년분 × 20
  3호  종신 = 기대여명 연수(소수점 버림)까지 Σ (제1호 식)
상증칙 §19의2① 이자율 3%(30/1000) · ② 수익률 미확정 시 원본×30/1000 · ③ §62 이자율 3%
```
상수(`legal-codes/inheritance-gift.ts`): 기존 `GIFT.TRUST_BENEFIT_VALUATION`(="상증령 §61") 재사용 + 신규 `VALUATION.PERIODIC_PAYMENT="상증령 §62"`·`VALUATION.PERIODIC_RATE="상증칙 §19의2③"` (Do 시 grep로 기존 상수 확인).

---

## input 타입 (`types/inheritance-gift-estate.types.ts` EstateItem 확장 — 모두 optional)
```ts
// === 신탁수익권 (trust_benefit) ===
trustBeneficiaryType?: "same" | "diff_principal" | "diff_income"; // §61①1호/2호가/2호나
trustAssets?: { kind: AssetCategory | "simple"; label?: string; value: number }[]; // 결정 B 신탁재산 구성(경량 MVP)
trustYieldRateNumer?: number; trustYieldRateDenom?: number;        // 확정 수익률(미입력=미확정→원본×3%)
trustWithholdingRateNumer?: number; trustWithholdingRateDenom?: number;
trustIncomeMaturityDate?: string;                                 // 수익만기일(→ 연수)
trustAnnuityType?: "finite" | "perpetual" | "lifetime";           // 수익시기 미정 분기(§61②)
trustBeneficiaryGender?: "male" | "female"; trustBeneficiaryAge?: number; // 종신 기대여명
trustRemainingYearsOverride?: number;
trustSurrenderValue?: number;                                     // 해지·철회·취소 일시금
trustRemainingYears?: number;                                     // ← 합성 주입(store 미저장, schema도 선언)

// === 정기금받을권리 (periodic_payment) ===
periodicAnnuityType?: "finite" | "perpetual" | "lifetime";        // 유기/무기/종신
periodicAnnualAmount?: number;                                    // 1년분 정기금액
periodicMaturityDate?: string;                                    // 유기 만기일(→ 잔존연수)
periodicBeneficiaryGender?: "male" | "female"; periodicBeneficiaryAge?: number; // 종신
periodicRemainingYearsOverride?: number;
periodicSurrenderValue?: number;
periodicRemainingYears?: number;                                  // ← 합성 주입
```
result = 공통 `PropertyValuationResult`(`valuatedAmount`·`breakdown`·`method`). 신규 result 필드 없음.

---

## 알고리즘

### 공용 코어 (`valuation-annuity-core.ts` 신규 — §33과 공유)
```ts
// 1/(1+3%)ⁿ floor PV — BigInt 거듭제곱(103ⁿ>MAX_SAFE 회피). n 단항만 책임(오프셋·cap 미내장)
export function pvAt(afterTax: number, n: number): number {
  const e = Math.max(0, Math.floor(n));
  if (afterTax <= 0) return Math.max(0, afterTax);
  return Number((BigInt(afterTax) * 100n ** BigInt(e)) / 103n ** BigInt(e));
}
// 연수 도출(§61②·§62): perpetual=20 / lifetime=getLifeExpectancyFloor / finite=만기−평가기준일 floor
export function resolveAnnuityYears(opts): number { /* superficies/intangible 미러 */ }
```
> `gift-deemed/trust-benefit.ts`의 `trustIncomePV`·`resolveIncomePeriods`를 이 코어로 이동, §33는 import로 전환(동작 불변·anchor 997m 회귀0).

### `evaluateTrustBenefit(item)` (`property-valuation-trust-benefit.ts` 신규)
```ts
const principal = sumTrustAssets(item.trustAssets);              // 결정 B 경량 MVP: Σ value (직접 합산). 풀중첩(Phase2)만 evaluateEstateItem(하위). trustAssets 비었으면 0→validate 차단
const y = (item.trustYieldRateNumer!=null) ? {n,d} : {30,1000}; // 미확정→원본×3%(칙§19의2②)
const afterTax = applyRateFraction(principal, y.n, y.d) - 원천징수;
const N = item.trustRemainingYears ?? 0;                         // 합성 주입(§5.2)
let incomePV = 0; for (let k=0;k<N;k++) incomePV += pvAt(afterTax, k); // 신탁 startIndex=0
const incomeRight = incomePV;
const valueByRight =
  item.trustBeneficiaryType==="diff_income"    ? incomeRight :                    // 2호나
  item.trustBeneficiaryType==="diff_principal" ? Math.max(0, principal - incomeRight) : // 2호가
                                                 principal;                       // 1호 동일수익자 ← PV 미가산
const valuatedAmount = Math.max(valueByRight, item.trustSurrenderValue ?? 0);    // §61① 단서
```
- 🔴 1호는 `principal`만(수익권 PV 불포함) — 정정 A.
- breakdown: 신탁재산 가액 + (해당 시)회차별 PV + 권리별 평가 + (일시금>평가 시)일시금 Max.

### `evaluatePeriodicPayment(item)` (`property-valuation-periodic.ts` 신규)
```ts
const A = item.periodicAnnualAmount ?? 0;
let body: number;
if (type==="perpetual")      body = A * 20;                          // §62 2호
else {
  const N = item.periodicRemainingYears ?? 0;                       // finite=만기연수 / lifetime=기대여명 floor
  let pv = 0; for (let n=1;n<=N;n++) pv += pvAt(A, n);              // 정기금 startIndex=1(ordinary)
  body = (type==="finite") ? Math.min(pv, A * 20) : pv;            // 유기만 20배 cap(§62 1호 단서)
}
const valuatedAmount = Math.max(body, item.periodicSurrenderValue ?? 0); // §62 본문 단서
```
- 🔴 유기 20배 cap은 **유기(finite)에만**. **종신(§62 3호) cap 미적용 근거**: 3호 본문 "기대여명 연수까지 … **제1호의 계산식에 따라** 계산한 금액의 합계액"(KoreanLaw §62 본문 2026-06-27) — 준용은 1호의 **현가 계산식**이고, 1호 단서(1년분×20 한도)는 계산식이 아닌 별도 단서이므로 종신에 미준용. 기대여명 자체가 상한 역할. 무기(2호)=1년분×20 고정이라 cap 개념 자체 없음.
- floor-per-term(BigInt) 채택 — 무체재산권 §64 per-term 선례 일관. PP-1 실측 45,797,069 동결.

### dispatch (`property-valuation.ts:733-754` switch)
```ts
case "trust_benefit":   return evaluateTrustBenefit(item);
case "periodic_payment":return evaluatePeriodicPayment(item);
```
> 800줄: property-valuation.ts 948줄 → 신규 로직은 별도 2파일, 본체엔 case 2줄·import만.

---

## 평가기준일 주입 (`lib/calc/estate-item-valuation.ts`)
- `injectTrustBenefitRemainingYears(item, valuationDateISO)` / `injectPeriodicRemainingYears(...)` — override 우선, finite=만기−평가기준일 floor, perpetual=20, lifetime=getLifeExpectancyFloor. 미입력=0(validate 차단). superficies/intangible 미러(useEffect→store 금지, 빌드시 합성).
- `computeEffectiveValuation`(L133, **if-체인**) — `trust_benefit`·`periodic_payment` if 블록 추가(주입 후 `evaluateEstateItem` 위임). 🔴 누락 시 tsc 통과·말단 default 오값 → 수동 grep.

---

## 동기화 지점 (계획 §6 — 26+1지점, file:line 실측)
| 분류 | 위치 | 비고 |
|---|---|---|
| 타입(1) | inheritance-gift-estate.types.ts:53 | `trust_benefit`·`periodic_payment` + 필드 |
| Exhaustive Record(10) | estate-category-meta(16·30·45)·CategoryChangeDialog(34)·inheritance-asset-category(15)·deduction-besshi-data(243)·besshi-buppyo-2-data(44)·asset-toggle-visibility(48·232)·ResultView.types(21)·filing-form-helpers(121) | tsc 안전망. 카테고리당 키 2개 |
| 非exhaustive 배열(5) | deemed-category-policy:28·estate-category-meta:45·CategoryChangeDialog(48·62)·estate-item-schema:546(COORD_INCOMPATIBLE) | grep 수동 |
| dispatch(2) | property-valuation.ts switch + 신규 2파일 | |
| 주입(4) | estate-item-valuation.ts(신규 inject 2 + if-체인) + InheritanceTaxForm:428 + gift-api:52 | |
| Validation(1) | **estate-item-schema.ts:527-541** discriminatedUnion + 멤버 2 | 🔴 단일 허브(정정 C) |
| UI(2) | EstateItemEditor:52 VariantBody case 2(tsc-blind) + variants 2 신규 | |

## 회귀·리스크
- §33 경로 anchor 997m 회귀0(헬퍼 import 전환만). 기존 카테고리 무영향(case 추가).
- noImplicitReturns 미설정 3지점(VariantBody·computeEffectiveValuation·dispatch): grep 자가점검.
- BigInt floor-per-term(부동소수 금지). 1원 tolerance 정책. 종신 기대여명=floor(§20③ ceil 혼동 금지).
- 결정 B `trustAssets`: top-level 루프 미진입(이중계상 엔진 가드 불요), schema sub-schema 정의(strip 방지).
