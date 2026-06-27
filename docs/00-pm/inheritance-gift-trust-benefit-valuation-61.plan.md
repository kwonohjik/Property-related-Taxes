# 신탁의 이익을 받을 권리 평가 (상증령 §61) — 재산평가 경로 신규 구현 계획

> 브랜치: `feat/inheritance-gift-trust-benefit-65-61` · 워크트리 `.claude/worktrees/trust-benefit`
> 검증 기준: 모든 file:line은 워크트리 실측. 산식·수치는 anchor 실증 후 단정. 미검증은 "확인 필요" 명시.
> 참고 패턴: 지상권 §61③([[project_gift_superficies_valuation_61_3]]) · 무체재산권 §64([[project_inheritance_gift_intangible_ip_valuation]]) · 예금 §63④([[project_gift_inheritance_deposit_valuation_63_4]])

---

## 1. 배경 — 무엇이 있고 무엇이 없는가 (실측)

### 이미 있는 것 ✅ — 증여 의제(§33) 경로
- `lib/tax-engine/gift-deemed/trust-benefit.ts` `calcTrustBenefit()` — **증여세 "증여로 보는 경우"(§33)** 산출 전용.
  - 🔴 **재사용 경계(검토 정정 A·B)**: `same`(동일수익자) 분기는 §33①·§25① 때문에 **원본권(신탁재산 800m) + 수익권 현가합(197m)을 별개 증여로 합산(997m)**(`trust-benefit.ts:82-101 subGifts total`). 이는 §33 증여 관점이며 **§61①1호 재산평가(동일수익자=신탁재산 가액 그 자체)와 다름** → `deemedGiftValue` **그대로 재사용 금지**. 공용화 대상은 `trustIncomePV`(수익권 PV)·`resolveIncomePeriods`(연수)에 한정.
  - 현가 헬퍼 `trustIncomePV(R, n)` (L25–30): `floor(R × 100ⁿ / 103ⁿ)` BigInt 거듭제곱 — 이자율 3%(칙§19의2①).
  - 기간 도출 `resolveIncomePeriods(input)` (L32–45): 유기(입력 회차)/무기 20년(§62 2호)/종신 기대여명 floor(§62 3호).
  - 일시금 Max (§61① 단서, L103–104). 수익률 미확정 → 원본×3%(칙§19의2②, L51).
  - anchor 검증됨: 교재 p.557 사례 `deemedGiftValue = 997,183,628` (`__tests__/tax-engine/gift-deemed/trust-benefit.test.ts`).

### 없는 것 ❌ — 재산평가(EstateItem) 경로
- 상속세/증여세 **자산카드(EstateItem)에서 "신탁의 이익을 받을 권리"를 평가 항목으로 선택**하는 경로가 없음.
- `AssetCategory` union(`lib/tax-engine/types/inheritance-gift-estate.types.ts:40-53`)에 `trust_benefit` 부재.
- 평가 dispatch(`property-valuation.ts` `evaluateEstateItem`)에 신탁 case 없음.
- ⚠️ **혼동 주의(정정 F)**: `deemedCategory?: "...|trust"` (types L405)는 **dead가 아님** — `inheritance-tax-financial-eligibility.ts:100-102`가 `category:"financial" + deemedCategory:"trust" + trustType:"cash_trust"` 조합을 **§22 금융재산공제(§19① 금전신탁) 판정**에 사용. 즉 "금전신탁"은 기존 `financial` 카테고리로 모델됨. **신규 `trust_benefit`(§61 신탁수익권 평가)는 이와 별개 모델로 공존** — UI/문서에서 두 경로 경계 명시(금전신탁 잔액평가 vs 신탁이익 현가평가). 신규 `trust_benefit`의 §22 대상 여부는 기존 cash_trust 판정과 조율 후 결정(§10).

### 결론
> **기능 본질 = "재산평가로서의 신탁수익권(§61)·정기금받을권리(§62)를 EstateItem 카테고리 2종으로 추가"**.
> 신탁 평가 *산식*은 §33 경로에 이미 검증돼 있어 헬퍼 공용 추출로 재사용. 정기금은 신규 산식(유기 20배 cap·종신 기대여명).
> 신규 작업 = **EstateItem 경로 배선(26지점, 카테고리당 키 2개)** + **평가기준일→연수 주입(공용)** + **전용 입력 UI 2종** + **신탁재산 하위 자산 연동(결정 B)**.
> §33 증여 의제 경로와는 **별개로 공존**(동시 적용 가능) — 산식 헬퍼만 공용 추출해 단일 진실 유지.

---

## 2. 법령 근거 (이미지 1~10 + 기존 KoreanLaw 검증)

### 신탁의 이익을 받을 권리 — 상증령 §61 (2021.2.17. 개정, 이후 신고분 적용)
| 구분 | 평가액 | 비고 |
|---|---|---|
| **§61①1호** 원본·수익 수익자 **동일** | `Max(① 신탁재산을 상증법 §60~65로 평가한 가액, ② 해지·철회·취소 일시금)` | 개정 후 ①=시가·보충적평가. 현행 엔진은 입력 신탁재산가액 사용 |
| **§61①2호가목** 원본권 수익(수익자 다름) | `Max(㉮ 신탁재산 평가액 − 수익권 평가액(2호나), ㉯ 일시금)` | 령§60①2가 |
| **§61①2호나목** 수익권 수익(수익자 다름) | `Max(㉮ Σₙ (각 연도 세후수익) / (1+0.03)ⁿ, ㉯ 일시금)` | 세후수익 = 원본×수익률 − 원천징수 |
| **§61②** 수익시기 미정 | §62 2호(무기)=20년 / §62 3호(종신)=기대여명 연수(floor) | 유기 20배 cap은 §61 **미준용**(연수만 차용) |

- **이자율 3%** (상증칙 §19의2①, 2017.3.10. 이후). 수익률 미확정 시 원본×3%(§19의2②).
- **n = 평가기준일부터 수익시기까지의 연수** (이미지5 ①). EstateItem 경로의 핵심: 평가기준일(상속개시일/증여일)부터 각 수익시기까지 연수를 도출해야 함.
- 상수: 기존 `GIFT.TRUST_BENEFIT_VALUATION`(="상증령 §61") 재사용 + 신규 `VALUATION.TRUST_BENEFIT_*` 추가 검토(legal-codes 분리).

### 정기금을 받을 권리 — 상증령 §62 (이미지 4~10) — ✅ 독립 카테고리 포함
공통: 평가액 = `Max(아래 본칙, 해지·철회·취소 일시금)` (§62 본문 단서, 2019.2.12. 이후 상속·증여분).

| 종류 | 본칙 | 비고 |
|---|---|---|
| **유기정기금**(§62 1호) | `Min( Σₙ 각연도 정기금/(1+r)ⁿ , 1년분 정기금 × 20 )` | n=평가기준일부터 경과연수. **20배 cap** |
| **무기정기금**(§62 2호) | `1년분 정기금 × 20` | |
| **종신정기금**(§62 3호) | `Σₙ (기대여명 연수까지) 각연도 정기금/(1+r)ⁿ` | 통계청 성별·연령별 기대여명(소수점 버림). 2010.12.31. 이전분은 75세까지 |

- **이자율 r 연혁** (평가기준일 기준 적용): **3.0%**(2017.3.10.~ 현행, 칙§19의2③) · 3.5%(2016.3.21.~) · 6.5%(2004.1.1.~). 이미지9 표 = 1차 출처.
- **현가계수 anchor**(이미지8, r=3.0%): n3=2.82861 · n5=4.57971 · n10=8.53020 · n20=14.87747. 엔진은 BigInt floor-per-term 산식, 계수표는 **검증 대조용**(1원 tolerance).
- 정기금 anchor 후보: 연 10,000,000 × 5년 유기 r3% → **floor-per-term Σ(Pre-Do 실측)** vs 1년분×20=200,000,000 → Min=Σ. (계수표 45,797,100은 반올림 근사 — Do anchor 부적합, §62 권위 출처로 floor-of-sum vs floor-per-term 정책 확정)
- 종신 기대여명: 기존 `lib/tax-engine/data/life-expectancy-2023.ts` + `getLifeExpectancyFloor` 재사용(신탁 §61②와 공용).
- 상수: 기존 `GIFT.PERIODIC_*`(있으면) 재사용/신규 `VALUATION.PERIODIC_PAYMENT_*` — Do 시 legal-codes grep.
- ⚠️ **유기 20배 cap은 정기금 전용** — 신탁 수익권(§61)에는 미적용(§61은 §62의 *연수*만 준용). 산식 공용화 시 cap을 정기금 경로에만 게이트.

---

## 3. 확정된 설계 결정 (사용자 승인 2026-06-27)

| # | 쟁점 | **확정** |
|---|---|---|
| **A** | 정기금(§62) 독립 카테고리 | ✅ **포함** — 신탁수익권(`trust_benefit`) + **정기금받을권리(`periodic_payment`)** 2개 카테고리를 한 워크트리에서. 유기·무기·종신 + 현가계수 anchor. §6.2 |
| **B** | 신탁재산 가액 입력 | ✅ **별도 자산 평가 연동** — 신탁수익권 카드 내부에 "신탁재산 구성" 하위 자산 배열을 두고 각각 기존 엔진(`evaluateEstateItem`)으로 평가·합산. §5.4 데이터 모델 |
| **C** | 수익권 연도별 수익 | **균등 가정**(연 1회 동일 세후수익 × N회차) — §33 경로 동일 모델 |
| **D** | 수익시기 연수 UI | **수익만기일(date) → 평가기준일~만기 연수 자동 + override.** 미정 토글 시 §62 준용(무기 20 / 종신 기대여명) |
| **E** | 카테고리 명칭 | `trust_benefit`="신탁수익권" · `periodic_payment`="정기금받을권리" |

> **잔여 미결**(§10): B 하위 자산 UI 깊이(전체 자산카드 중첩 vs 경량 종류+금액). 권장 = 경량(부동산·주식은 평가액 직접, 단순 항목만 중첩) — Pre-Do 후 환류.

---

## 4. 케이스 매트릭스 (Do 진입 게이트 — anchor)

> 🔴 **정정 A·B**: §61①은 권리별로 평가액이 갈린다 — **동일수익자(1호)는 신탁재산 가액 그 자체**(수익권 PV 불포함). 997,183,628(=800m+197m)은 §33 증여(별개 증여 합산)값이지 §61①1호 평가액이 **아님**. 아래는 신탁재산 8억·세후연수익 67,680,000·3회차(n=0,1,2) 공통 전제.

| # | 시나리오 | 법령 | anchor (원단위) | 상태 |
|---|---|---|---|---|
| TBV-1 | **동일수익자(1호)** 일시금 < 평가액 | §61①1호 | **신탁재산 가액 = 800,000,000** (수익권 PV 불포함) | ☐ Pre-Do |
| TBV-2 | 수익권 현가합 n=0,1,2 (2호나 핵심) | §61①2호나·칙§19의2① | 67,680,000 + 65,708,737 + 63,794,891 = **197,183,628** | ☐ Pre-Do |
| TBV-3 | **원본권(2호가, 수익자 다름)** | §61①2호가 | 신탁재산 − 수익권 = 800,000,000 − 197,183,628 = **602,816,372** | ☐ |
| TBV-3b | **수익권(2호나, 수익자 다름)** | §61①2호나 | = TBV-2 = 197,183,628 | ☐ |
| TBV-4 | 해지일시금 > 평가액 → 일시금 | §61① 단서 | Max 적용 | ☐ |
| TBV-5 | 수익률 미확정 → 원본×3% | 칙§19의2② | R=원본×30/1000 | ☐ |
| TBV-6 | 수익시기 미정 → §62 준용 20년(무기) | §61②·§62 2호 | 20회차 현가합 | ☐ |
| TBV-7 | 수익시기 미정 → §62 준용 기대여명(종신) | §61②·§62 3호 | 기대여명 floor 회차 | ☐ |
| TBV-8 | **상속세 경로** 동일 평가값 (상속개시일 기준) | §61①·§60 | 증여 경로와 평가액 동일 | ☐ |
| TBV-9 | 신탁재산 하위 자산 합산 (결정 B) | §61①·§60 | Σ trustAssets = 신탁재산가액 | ☐ |

### 정기금받을권리 (§62) — 케이스
| # | 시나리오 | 법령 | anchor (원단위) | 상태 |
|---|---|---|---|---|
| PP-1 | 유기정기금 현가합 < 20배 | §62 1호 | 연10,000,000×5년 r3% **ordinary n=1..5 floor-per-term** → Pre-Do 엔진 실측 확정(계수 4.57971×1e7=45,797,100은 **반올림 근사 — anchor 금지**, floor합 ≈45,796,1xx, 966원 차) | ☐ |
| PP-2 | 유기정기금 20배 cap 적용 | §62 1호 단서 | Σ > 1년분×20 → 1년분×20 | ☐ |
| PP-3 | 무기정기금 | §62 2호 | 1년분 × 20 | ☐ |
| PP-4 | 종신정기금 (기대여명) | §62 3호 | 기대여명 floor 회차 현가합 (life-expectancy-2023) | ☐ |
| PP-5 | 일시금 > 본칙 → 일시금 | §62 본문 단서 | Max 적용 | ☐ |
| PP-6 | 이자율 연혁 (평가기준일 3.5%/6.5%) | 칙§19의2③ 연혁 | r 분기 (역사 평가) — **확인 필요** SCOPE | ☐ |

> **Pre-Do**: TBV-C / TBV-2 / PP-1을 먼저 작성·실행([[pre-do-anchor-verification]]). ① 평가기준일→연수 모델이 §33 경로(회차 직접입력)와 동일값을 내는지, ② 정기금 현가계수표 대조 1원 tolerance를 환류.

---

## 5. 아키텍처 — 산식 단일 진실 + EstateItem 배선

### 5.1 평가 산식 공용 추출 ([[single-source-engine-helper]])
- `gift-deemed/trust-benefit.ts`의 **`trustIncomePV`(PV)·`resolveIncomePeriods`(연수)·세후수익 산식만** 공용 모듈로 추출 (`lib/tax-engine/valuation-annuity-core.ts` 가칭). 🔴 `calcTrustBenefit` 전체(권리별 조립·subGifts)는 **재사용 금지**(정정 A — §33 합산 ≠ §61 권리별 평가).
- 🔴 **할인 시작 인덱스 오프셋 파라미터화**(정정 D): 신탁 §61 수익권은 평가기준일=첫수익시기 가정 시 `n=0,1,2…`(annuity-due, `trust-benefit.ts:64` `disc=floor(k*interval)`). 정기금 §62는 본문 "n: 평가기준일부터의 **경과연수**" + 계수표(n5=4.57971=(1−1.03⁻⁵)/0.03, ordinary) → `n=1,2…`. 공용 PV 헬퍼는 `pvAt(R, n)` 단항만 책임, **루프 인덱싱(시작 0 vs 1)은 각 평가 함수에서** (`startIndex` 분리). 헬퍼에 cap·오프셋 내장 금지.
- 권리별 조립은 **§61 전용 로직**: 1호=`Max(신탁재산가액, 일시금)` / 2호가=`Max(신탁재산가액 − Σ수익권PV, 일시금)` / 2호나=`Max(Σ수익권PV, 일시금)`.
- 신규 `evaluateTrustBenefit(item): { valuatedAmount, breakdown }`(`property-valuation-trust-benefit.ts`) + `evaluatePeriodicPayment(item)`(`property-valuation-periodic.ts`, 유기 20배 cap은 **여기서만** 게이트). `property-valuation.ts` dispatch가 호출.

### 5.2 평가기준일 → 수익시기 연수 주입 (지상권/무체재산권 미러)
- `estate-item-valuation.ts`에 `injectTrustBenefitRemainingYears(item, valuationDateISO)` 신규.
  - 수익만기일 입력 시: `differenceInYears(만기, 평가기준일)` (floor). override 우선.
  - 미정 토글: `perpetual`→20 / `lifetime`→기대여명 floor(`getLifeExpectancyFloor`, 기존 `data/life-expectancy-2023` 재사용).
  - **3중 패턴**([[mirror-pattern]]): UI useMemo derive + override만 store + API/사이드바 합성 주입. `useEffect→store` 금지.
- `computeEffectiveValuation`(estate-item-valuation.ts:133)에 `case "trust_benefit"` 분기 — receivable(L173)·intangible(L165) 동형(주입 후 `evaluateEstateItem` 위임).

### 5.3 입력 필드 (types EstateItem 확장, 접두어 `trust*`로 충돌 회피)
```ts
// inheritance-gift-estate.types.ts — EstateItem 확장 (모두 optional)
trustBeneficiaryType?: "same" | "diff_principal" | "diff_income"; // §61①1호/2호가/2호나
trustPropertyValueAmount?: number;        // 평가기준일 현재 신탁재산 평가액 (1호·2호가)
trustYieldRateNumer?: number;             // 확정 수익률 분자 (미입력=미확정→원본×3%)
trustYieldRateDenom?: number;
trustWithholdingRateNumer?: number;       // 원천징수세율 (15.4% 등)
trustWithholdingRateDenom?: number;
trustIncomeMaturityDate?: string;         // 수익만기일 (→ 연수 도출)
trustAnnuityType?: "finite" | "perpetual" | "lifetime"; // 수익시기 미정 분기
trustBeneficiaryGender?: "male" | "female"; trustBeneficiaryAge?: number; // 종신 기대여명
trustRemainingYearsOverride?: number;     // 연수 직접 override
trustSurrenderValue?: number;             // 해지·철회·취소 일시금 (Max)
trustRemainingYears?: number;             // ← 합성 주입 결과 (store 미저장, validate도 선언해 strip 방지)
```
> 필드명은 §33 경로(`trustPropertyValue` 등 `gift-deemed/types.ts`)와 **충돌하지 않도록 EstateItem 전용 접두어** 확정 — Do 시 grep 재확인.

### 5.4 신탁재산 별도 자산 평가 연동 (결정 B) — 데이터 모델
**제약(실측)**: `EstateItem`은 **flat list** — 부모-자식/그룹핑 필드 없음. 비상장주식이 법인 사업무관자산을 *item 내부 배열*로 품는 선례(`CorporateNonBusinessAssetsSection`)는 있음.

**채택안: self-contained 하위 배열** (이중계상 차단 — 신탁재산은 수익자가 직접 소유 아님 → 별도 상속재산으로 합산 금지, 신탁수익권만 계상):
```ts
// 신탁수익권 item 내부 — 외부 상속재산 list와 분리
trustAssets?: TrustAssetComponent[];   // 신탁재산 구성 항목
// TrustAssetComponent = 경량(권장) { kind: AssetCategory|"simple"; label; value: number }
//   또는 중첩 EstateItem[](부동산·주식 풀 평가 — Phase 2 확장)
```
- **신탁재산 평가액** = `Σ evaluate(trustAssets[i])`. 경량 항목은 입력 평가액 그대로, 부동산/주식 종류는 기존 `evaluateEstateItem` 재사용 위임(단일 진실).
- 이 합계가 §61①1호(동일수익자)·2호가목(원본권)의 "신탁재산 가액"으로 투입.
- **이중계상 가드**: `trustAssets`는 `evaluateAllEstateItems`의 외부 루프에서 **독립 평가 안 함**(신탁수익권 item 평가 내부에서만 소비). validate가 외부 list에 동일 자산 중복 입력 차단 불가 → UI 안내로만.
- ⚠️ **잔여 결정**(§10): 하위 항목 UI 깊이 — 경량(종류 라벨+평가액) vs 풀 중첩 자산카드. 권장 = **경량 MVP**(부동산·주식도 평가액 직접 입력), 풀 중첩은 Phase 2.

---

## 6. 동기화 지도 (실측 file:line, 워크트리 기준)

> **2개 카테고리(`trust_benefit` + `periodic_payment`)를 동시 추가.** 아래 26지점은 카테고리당이 아니라 **지점당** — 대부분의 Record/배열은 같은 위치에 **키 2개**를 추가(작업량은 +α, 지점 수는 동일). 엔진 dispatch·주입·UI variant·validate 멤버만 카테고리별 2벌.

### A. 타입 정의 (1)
1. `lib/tax-engine/types/inheritance-gift-estate.types.ts:53` — AssetCategory union에 **`| "trust_benefit" | "periodic_payment"`**(정정 #4 — 2종 동시) + EstateItem §5.3 신탁 필드 + §3 정기금 필드(`periodicAnnuityType`·`periodicAnnualAmount`·`periodicMaturityDate`·`periodicWithholding*`·`periodicSurrenderValue`·`periodic*RemainingYears(Override)`) 추가. (실측: `periodic_payment` 전역 0건 — 깨끗한 추가)

### B. Exhaustive Record — TS가 누락을 컴파일에러로 잡음 (10) ✅ tsc 안전망
2. `components/calc/inheritance/estate-card/estate-category-meta.ts:16` `CATEGORY_LABELS` → "신탁수익권"
3. `〃:30` `CATEGORY_ICONS` → 아이콘(emoji)
4. `components/calc/inheritance/estate-card/CategoryChangeDialog.tsx:34` `CATEGORY_LABELS`(중복 — 단일화는 SCOPE 밖, 라벨만 추가)
5. `lib/tax-engine/inheritance-asset-category.ts:15` `CATEGORY_TO_SUMMARY` → `"financial"` 또는 `"other"` (부표 분류 **확인 필요**)
6. `lib/calc/deduction-besshi-data.ts:243` `FINANCIAL_ASSET_KIND_LABEL` → **조건부**(금융재산공제 §22 대상 여부 **확인 필요**, 신탁수익권은 통상 비대상 추정)
7. `lib/calc/besshi-buppyo-2-data.ts:44` `CATEGORY_LABEL_KO`
8. `lib/calc/asset-toggle-visibility.ts:48` `MATRIX` → 영농·가업·금융공제·간주퇴직 토글 전부 `hidden_permanent` 추정
9. `〃:232` `CULTURAL_HERITAGE_VISIBILITY` → `hidden_permanent`
10. `components/calc/results/InheritanceTaxResultView.types.ts:21` `ASSET_CATEGORY_LABELS`
11. `components/calc/results/inheritance-filing-form-helpers.ts:121` `ESTATE_ITEM_TYPE_CODE` → 별지9호 자산구분코드 (**법정 코드값 확인 필요**)

### C. 非exhaustive 배열 — TS 미감지, grep 수동 (5) 🔴 누락 시 드롭다운 미표시/차단누락
12. `lib/calc/deemed-category-policy.ts:28` `INHERITANCE_CATEGORIES`
13. `components/calc/inheritance/estate-card/estate-category-meta.ts:45` `GIFT_CATEGORIES`
14. `components/calc/inheritance/estate-card/CategoryChangeDialog.tsx:48` `INHERITANCE_CATEGORIES`
15. `〃:62` `GIFT_CATEGORIES`
15b. `lib/validators/estate-item-schema.ts:546` `COORD_INCOMPATIBLE`(정정 — 좌표입력 차단 목록. 누락 시 무의미 좌표 허용, 무해하나 정합 흠)

### D. 평가 엔진 dispatch (2 지점 × 2 카테고리)
16. `lib/tax-engine/property-valuation.ts` `evaluateEstateItem` switch(L733–754) — `case "trust_benefit"` + `case "periodic_payment"` 추가.
17. 신규 **별도 파일**(948줄 초과 → 분리 강제): `property-valuation-trust-benefit.ts`(`evaluateTrustBenefit`) + `property-valuation-periodic.ts`(`evaluatePeriodicPayment`) + 공용 현가/기간 헬퍼(§5.1, §33과 공유). 유기 20배 cap은 정기금 경로에만 게이트.

### E. 평가기준일 주입 (4)
18. `lib/calc/estate-item-valuation.ts` 신규 `injectTrustBenefitRemainingYears()` + `injectPeriodicRemainingYears()`(공용 기대여명/만기 연수 헬퍼).
19. `〃:133` `computeEffectiveValuation`은 **switch 아님 — if-체인 + 말단 default**(L221 `return marketValue ?? … ?? 0`). 🔴 `noImplicitReturns` 미설정 → trust_benefit/periodic 분기 **누락해도 tsc 통과**, 말단 default로 흘러 사이드바·칩·미리보기 silent 오값(receivable L173 동형 if 블록 추가). **수동 grep 자가점검 필수**(비-tsc-safe).
20. `components/calc/InheritanceTaxForm.tsx` 입력빌드 체인 — 주입 호출 추가 (superficies/intangible 합성과 동일 지점).
21. `lib/calc/gift-api.ts` 입력빌드 체인 — 주입 호출 추가.

### F. Validation/Zod (1차 단일 위치) 🔴 정정 C — 위치 확정
22. **`lib/validators/estate-item-schema.ts:527-541` discriminatedUnion** — 신규 멤버 `trustBenefitItemSchema`·`periodicPaymentItemSchema` 정의 후 union 배열에 추가. **이것이 상속·증여 공용 단일 검증 허브**(`property-valuation-input.ts`가 import). discriminator 멤버 누락 시 **런타임 `Invalid discriminator value`로 항목 전체 거부**(silent strip 아님 — load-bearing 게이트). 합성 `trustRemainingYears`·`periodicRemainingYears`도 선언(strip 방지). 결정 B `trustAssets[]` 경량(`{kind,label,value}` 평탄)은 sub-schema 추가; 풀 중첩 EstateItem[]은 `z.lazy` 재귀 필요(Phase 2).
23. ~~`gift-validate.ts`/`inheritance-validate.ts`~~ **삭제(정정 C)** — `gift-validate.ts` 부재, `inheritance-validate.ts`엔 estateItemSchema 없음. 검증은 #22 단일.
24. (types 확장은 #1에 포함)

### G. 자산카드 UI (2 지점 × 2 카테고리)
25. `components/calc/EstateItemEditor.tsx:52-73` `VariantBody` switch에 `case "trust_benefit"`·`case "periodic_payment"` + variants/index.ts re-export. 🔴 **switch에 default 없고 반환타입 미주석 + `noImplicitReturns` 미설정 → 신규 case 누락이 tsc에 안 잡힘 = silent-blank 빈 렌더**(MEMORY intangible 교훈 동일). **반드시 수동 grep 확인**. `pickBodyVariant`(variants/index.ts:36)는 호출 0건 dead — 신뢰 금지. ⚠️ L63·**L71** `case "cash"` 중복 기존 버그(첫 매치 receivable 오라우팅) — 범위 밖(언급만).
26. 신규 `variants/EstateBodyTrustBenefit.tsx` + `variants/EstateBodyPeriodicPayment.tsx`.

> **추가 확인 필요(non-blocking)**: variants barrel re-export, `variants/types.ts` SupportedCategory union, `chip-config.ts resolveChips`(평가액 칩 valuationDate 의존 — 지상권 E2E 버그 ②).

---

## 7. UI 위젯 설계 (EstateBodyTrustBenefit)

§61 분기 순서 = 입력 순서([[feedback_ui_order_follows_logic]]):
1. **수익자 구성** `RadioCardGroup`(옵션별 `testId` — 그룹 testid 미지원): 동일수익자 / 원본권(수익자 다름) / 수익권(수익자 다름).
2. **신탁재산 평가액** `CurrencyInput`(동일수익자·원본권만 노출).
3. **수익률** — 확정 토글(`ToggleCard`). ON=수익률 입력(분자/분모 또는 %), OFF=미확정(원본×3% 안내, amber).
4. **원천징수세율** `DecimalInput`(15.4% 등).
5. **수익시기**: 수익만기일 `DateInput`(`<div data-testid>` 래퍼 — forward 미지원) + 미정 토글 → `perpetual`(20년)/`lifetime`(기대여명: 성별·나이) `RadioCardGroup`. 연수 override `DecimalInput`(clamp).
6. **해지·철회 일시금** `CurrencyInput`(선택).
- tone: 평가=`emerald`, 미확정 안내=`amber`. 회색 배경 금지. placeholder 숫자 예시 금지(hint 한국어).
- 결과 산식: 회차별 현가 + 권리별 평가액 + 일시금 Max — 한국어 풀어쓰기([[formula-display-builder]]).

---

## 8. 회귀·리스크

- **기존 18종 증여의제·기존 자산카테고리 무영향**: 신규 case 추가만. discriminatedUnion 순수 object.
- **§33 경로 보존**: `gift-deemed/trust-benefit.ts` 동작 불변 — 산식 헬퍼 추출 시 import만 변경, anchor(997,183,628) 회귀 0 확인.
- **dual-truth 차단**: 평가는 `evaluateTrustBenefit` 단일 진실, 사이드바·칩·미리보기는 `computeEffectiveValuation` 위임([[feedback_ui_engine_dual_truth_avoidance]]).
- **800줄**: `property-valuation.ts` **현재 948줄(실측, 이미 초과)** — 신탁·정기금 로직은 **별도 파일 강제**(`property-valuation-trust-benefit.ts`·`property-valuation-periodic.ts`). dispatch만 본체에 case 2줄 추가([[feedback_800line_split_export_preservation]]).
- **정기금 20배 cap / 이자율 연혁**: cap은 정기금 경로 전용 게이트(신탁 오염 금지). 이자율 연혁(3.5%/6.5%)은 PP-6 — 현행 3% 우선, 역사 평가는 SCOPE 확인.
- **이중계상**(결정 B, 정정): `trustAssets`는 trust_benefit item **내부**에 격납 → `evaluateAllEstateItems`(property-valuation.ts:786) top-level 루프에 **애초에 진입 안 함** → 엔진 가드 불필요. 위험은 사용자가 같은 자산을 외부 list에도 중복 입력하는 것뿐 → **UI 중복입력 안내만**(validate 차단 불가).
- **정수연산**: BigInt floor-per-term(부동소수 누적 금지). 1원 tolerance 정책([[bigint-round-half-up]]).
- **E2E 필수**([[feedback_browser_verify_with_playwright]]): 워크트리 `E2E_PORT=3102`. 셀렉터=자산버튼"신탁수익권"·RadioCardGroup 옵션 testId·DateInput 래퍼. 지상권 E2E가 잡은 3버그(VariantBody dispatch·칩 valuationDate·토글 boolean optional) 사전 가드.

---

## 9. Do 순서 (시퀀셜 — 단일 응답 완주 [[single-response-do-execution]])

1. **Pre-Do anchor**: TBV-1(1호=신탁재산가액)·TBV-2(수익권 PV합 197,183,628)·TBV-3(원본권 602,816,372)·PP-1(정기금 floor-per-term 실측) 작성·실행(실패 확보) → ① §61 권리별 평가가 §33 합산과 다름 확인, ② 정기금 ordinary n=1 인덱스·floor 정책 환류.
2. **법령상수·타입**(#1·24, 신탁+정기금 필드) → **공용 산식 헬퍼 추출 + `evaluateTrustBenefit`·`evaluatePeriodicPayment`**(#16·17, 별도 파일 2개).
3. **신탁재산 연동**(§5.4 `trustAssets` 합산) + **평가기준일 주입**(#18·19) + **dispatch 배선**(#16).
4. **Record/배열 26지점**(#2–15) — 카테고리당 키 2개. tsc 안전망 먼저, grep로 배열 4곳 확인.
5. **API 주입 호출**(#20·21) + **Validation 멤버 2종**(#22·23).
6. **UI**: `EstateBodyTrustBenefit`+`EstateBodyPeriodicPayment`(#26) + `VariantBody` case 2개(#25) + 결과뷰 산식 2종.
7. **검증**: `tsc --noEmit` 0건 → anchor(TBV 9 + PP 6) → `ui-engine-sync-checker`(14지점) → `bkit:gap-detector` → E2E(워크트리 `E2E_PORT=3102`).

---

## 10. 미해결·확인 필요 (단정 금지)

- [x] **결정 A·B**(§3) — A=정기금 포함, B=별도 자산 연동 확정(2026-06-27).
- [ ] **결정 B 하위 자산 UI 깊이** — 경량(종류+평가액) vs 풀 중첩 자산카드. 권장=경량 MVP. Pre-Do 후 사용자 환류.
- [ ] #5 `CATEGORY_TO_SUMMARY` 분류(신탁=other? 정기금=other?), #6 금융재산공제 §22 대상 여부, #11 별지9호 자산구분코드 — KoreanLaw/서식 실측 필요.
- [ ] **정기금 이자율 연혁(PP-6)** — 현행 3% 외 3.5%/6.5% 역사 평가 포함 여부(SCOPE). 현행만 우선 권장.
- [x] **정기금 재사용 헬퍼 없음 확정**(정정): `goodwill.ts:110` `annuityPresentValueFactor`는 **주석 한 줄**(실제 인라인 `Math.pow` float 루프, 영업권 §59④ — §62 아님). `estate-item-schema.ts:348`의 "정기금" 언급도 **무체재산권 §64 주석**. → 정기금 PV 루프는 **신규(ordinary, BigInt floor-per-term)**. 차용 가능한 건 `data/life-expectancy-2023.ts`(종신 기대여명, **`getLifeExpectancyFloor` — §62는 소수점 버림. `getLifeExpectancyByGender`의 §20③ ceil과 혼동 금지**)뿐.
- [ ] 정기금 이자율 연혁(§62 "재정경제부령") = 칙§19의2③, 현행 3% 우선. 무체재산권 §64 PV-sum(`estate-item-schema.ts:348`·legal-codes:284)이 유기정기금과 구조 동형 → 설계 참조 선례.
- [ ] §33 경로 필드명과 EstateItem 신규 필드명 충돌 grep 재확인.
- [x] `property-valuation.ts` = **948줄** — 신탁·정기금 별도 파일 2개 확정.
- [ ] 평가기준일→연수 모델이 §33 회차직접입력 모델과 동일 anchor 산출하는지(TBV-C Pre-Do).
