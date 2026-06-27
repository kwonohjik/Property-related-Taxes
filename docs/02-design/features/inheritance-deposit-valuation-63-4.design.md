# 예금·저금·적금 등의 평가 보완 (상증법 §63④) — 설계문서 (v2 · 자가검토 반영)

> 상속세·증여세 재산평가에서 예금·저금·적금 평가를 현행 "예입총액 단일값"에서
> **상증법 §63④ 3항 산식(예입총액 + 미수이자 − 원천징수세액)** 으로 보완한다.
> 평가기준일 = **상속세 `deathDate`(상속개시일) · 증여세 `giftDate`(증여일)**.
>
> v2 변경: STEP 1 독립검토 3종(법령·코드·UI) + KoreanLaw 실측 반영. 30+건 정정.
> 핵심 방향 전환: "엔진에 날짜 주입" → **"클라이언트가 valuationDate로 엔진 순수헬퍼를
> 호출해 파생값(미수이자·원천징수세액)을 산정·주입"** (지상권 잔존연수 주입과 동형 — dual-truth·NaN 차단).

---

## 0. 법적 근거 (KoreanLaw 실측 완료 — 추정 금지)

**상증법 §63④** (법률 본칙, 시행령 위임 없이 산식 직접 규정 — MST 276123, 시행일 2026-01-02 확인):

> 예금ㆍ저금ㆍ적금 등의 평가는 평가기준일 현재 예입(預入) 총액과 같은 날 현재 이미 지난
> 미수이자(未收利子) 상당액을 합친 금액에서 **「소득세법」 제127조제1항에 따른 원천징수세액**
> 상당 금액을 뺀 가액으로 한다.

```
예금등 평가액 = 예입총액 + 미수이자 상당액 − 원천징수세액 상당액
```

### lawRef 상수 확정 (3종 — 모두 KoreanLaw 본문 직접 확인)

| 변수 | 조문 | 확인 |
|---|---|---|
| 평가 본칙 | **상증법 §63 ④** | MST 276123 §63④ 본문 일치 ✅ |
| 원천징수 의무 | **소득세법 §127 ①** | MST 285523 — 이자소득 원천징수 의무 (세율 미규정) ✅ |
| 이자소득 원천징수 **세율 14%** | **소득세법 §129 ① 1호 라목** | "그 밖의 이자소득에 대해서는 100분의 14" 직접 확인 ✅ |
| 지방소득세(특별징수 10%) | **지방세법 §103의13 ①** | "원천징수하는 소득세의 100분의 10을 개인지방소득세로 특별징수" 직접 확인 ✅ |

### 인용 정정 기록 (feedback_korean_law_citation_verify ★★★)

| 인용 | 판정 | 실제 |
|---|---|---|
| §63① (초안) | ❌ | 주식·유가증권 |
| 시행령 §58 (1차 추정) | ❌ | 국채·공채 등 그 밖의 유가증권 |
| 코드 주석 "§62" (`property-valuation.ts:509`) | ❌ | 선박·항공기·차량 |
| `lawRef: VALUATION.PRINCIPLE`(§60) | ❌ | 일반 평가원칙 |
| 검토자 제시 "지방세법 §103의20" | ❌ | **법인**지방소득세 세율 (개인 특별징수 아님) |
| **정답** | ✅ | §63④ + 소득세법 §127①·§129①1라 + 지방세법 §103의13① |

### 미수이자 정의·산정 (이미지2 ①②)
- 정의(재삼 46014-2351, 1998.12.3.): 평가기준일까지 발생한 이자상당액 중 미수령 금액.
- 산정(국심 2000구0305, 2000.11.17.): **중도해지이율이 아니라 약정이율 × 경과일수**. (설계 핵심 제약)

### 지방소득세 포함 여부 — 법령 해석
§63④ 본문은 "소득세법 §127①에 따른 원천징수세액"만 차감 대상으로 명시 → 엄격해석은 소득세분만.
그러나 국세청 상증기준 63-58의 2-10 계산사례는 지방소득세(특별징수)를 포함해 차감.
→ "원천징수세액 상당액"을 **실제 징수되는 소득세+지방소득세**로 본 집행 해석.
**설계 결정: 기본 포함(toggle ON)** + 엄격해석용 제외 토글 제공. 법문이 소득세분만 명시함을 §5 주석에 기록.

---

## 1. Anchor — 상증기준 63-58의 2-10 정기예금 계산사례 (이미지2)

> Pre-Do anchor 우선(feedback_pre_anchor_verification ★★★) — Do 전 본 anchor 실행→실패 확보.
> 모든 수치 이미지2 캡처 동결. PDF 표 행 ↔ 변수 1:1(feedback_pdf_table_row_one_to_one_mapping ★★★).

### 자료
| 항목 | 값 |
|---|---|
| 예금기간 | 2007.7.1. ~ 2009.6.30. |
| 원천징수세율 | 14% (소득세법 §129①1라) |
| 평가기준일 | 2008.5.1. |
| 정기예금액 | 10억 (연이자율 5%, 복리, 이자 만기 일시지급) |

### 평가액 (㉠ + ㉡ − ㉢)

| 행 | 변수명(설계) | 산식 | PDF값 | 엔진값(floor 정책) |
|---|---|---|---|---|
| **㉠** | `principal` | — | 1,000,000,000 | 1,000,000,000 |
| **㉡** | `accruedInterest` | 1,000,000,000 × 5% × 305/365 | 41,780,822 | **41,780,822** (round-half-up) |
| ㉢-1 | `incomeWithholding` | 41,780,822 × 14% | 5,849,315 | **5,849,315** (floor; .08) |
| ㉢-2 | `localIncomeTax` | 5,849,315 × 10% | 584,932 | **584,931** (floor; .5 절사) |
| **㉢** | `withholdingTax` | ㉢-1 + ㉢-2 | 6,434,247 | **6,434,246** |
| — | `valuatedAmount` | ㉠ + ㉡ − ㉢ | **1,035,346,575** | **1,035,346,576** |

### ⚠️ 정수연산 정책 (v2 — floor 잠정, 절사단위 Do 전 확정)
| 단계 | 연산 | 근거 |
|---|---|---|
| ㉡ 미수이자 | `safeMulDivRound(예입 × 율, 일수, 100 × 365)` **round-half-up** | `tax-utils.ts:131` 3인자 BigInt 헬퍼. 검산 41,780,822 ✓ |
| ㉢-1 이자소득세 | `floor(미수이자 × 14%)` | 원천징수 원미만 절사 (.08 → floor=round) |
| ㉢-2 지방소득세 | `floor(㉢-1 × 10%)` = **584,931**(잠정) | 원천징수 원미만 절사 실무표준. PDF round(584,932)는 1원 오기로 판정 |

> **✅ 절사단위 = 원 단위 확정 (H-2 해소 — 국고금관리법 §47 실측)**:
> - §47① "10원 미만 끝수 절사"는 **국고금의 수입·지출**(실제 징수·납부)에 적용 → §63④ "원천징수세액
>   **상당액**"은 평가목적 계산값이라 **10원 절사 대상 아님(배제 확정)**.
> - §47② 1원 미만 절사는 과세표준 단계(세액 아님).
> - PDF 계산사례도 ㉢-1·㉢-2를 **원 단위**로 계산 → 원 단위 확정. ㉢-2 로직 `floor(㉢-1/10)` 유효(10원 절사 아님).
>
> **floor vs round 1원만 잔존 → tolerance 흡수**: 엔진값 **1,035,346,576**(floor) 채택, PDF 1,035,346,575와
> 1원 차이를 anchor `Math.abs(diff)<=1` 허용. floor(원미만 절사)는 원천징수 실무 표준이자 보수적.
> ※ 세액 자체의 원미만 floor/round 명문은 부재하나 1원 tolerance 범위 내 → anchor 영향 없음.

---

## 2. 현행 구현 갭 (실측 — property-valuation.ts:512)

```typescript
export function evaluateFinancial(item: EstateItem): PropertyValuationResult {
  const amount = item.marketValue ?? 0;          // 예입총액만
  return { ..., valuatedAmount: amount, breakdown: [{ ..., lawRef: VALUATION.PRINCIPLE }] };
}
```
(인용 검증: 코드 검토자 #6 OK — `:512` evaluateFinancial·`:509` "§62" 주석·`:520`·`:530` 모두 실재 확인.
Do 전 `grep -n "evaluateFinancial"` 줄번호 재확인.)

| 항목 | 현행 | 목표 |
|---|---|---|
| 예입총액 | ✅ marketValue | ✅ savingsPrincipal (또는 marketValue 재사용 — §3 모드A 정의) |
| 미수이자·원천징수세액 | ❌ | ✅ 클라이언트 파생 주입 |
| 평가기준일 | dispatch 미수신 | ✅ VariantProps.valuationDate(`types.ts:15`, 기존 주입) 활용 |
| lawRef | ❌ §60 | ✅ §63④·§129①1라·§103의13① |
| method | market_value | ✅ `"deposit_statutory"` 신설 |

---

## 3. 입력 모드 (3-state union — feedback_three_state_optional_mode_toggle ★★★)

`savingsValuationMode: "balance" | "auto" | "manual"` — 명시 union, 필드존재 derive 금지.

> **UI 2단계 라디오 ↔ 3-state 매핑(M-2)**: 1단계 `잔액평가|정밀평가`의 "정밀평가"는 store 값이
> 아니라 **`savingsValuationMode ∈ {auto, manual}` 여부의 표시용 파생**. "정밀평가" 선택 시
> `savingsValuationMode = "auto"`(기본) 설정 + 2단계 라디오 노출. 2단계 `auto|manual`이 실제 mode 교체.
> store에 `"statutory"` 같은 비존재 값 저장 금지(3-state 위반 방지). testid는 표시용.

> **필드 접두어 `savings*`**: 기존 `category:"deposit"`(임대보증금 반환채권, `EstateBodyDeposit.tsx`)와
> 명칭 충돌 회피(코드#4·UI#7). 본 작업은 `category:"financial"` 대상.

### 모드 A — `balance` (기본, 현행 유지·회귀 0)
- 입력: `marketValue`만. 평가액 = `marketValue`. 현행 100% 동일.
- **`marketValue` 의미 동결(법령#8)**: "예입원금 기준 잔액(미수이자 미포함)". 모드 A→B 전환 시 `savingsPrincipal`에 `marketValue` 자동 프리필.

### 모드 B-1 — `auto` (권장, 이미지2 산식)
| 입력 필드(store) | 타입 | 비고 |
|---|---|---|
| `savingsPrincipal` | 금액 | ㉠ |
| `savingsAnnualRate` | % DecimalInput | 약정이율(중도해지이율 아님) |
| `savingsStartDate` | DateInput | 경과일수 始點 |
| `savingsWithholdingRate` | % | 기본 14% (§129①1라) |
| `savingsIncludeLocalTax` | toggle | 기본 ON (§103의13①) |

- **평가기준일 입력칸 없음** — `VariantProps.valuationDate`(상속개시일/증여일) 사용, 읽기전용 echo.
- 미수이자·원천징수세액 = **클라이언트가 엔진 순수헬퍼 `computeSavingsAccrual` 호출**해 산정(§4).

### 모드 B-2 — `manual` (fallback)
| 입력 필드 | 타입 |
|---|---|
| `savingsPrincipal` | 금액 |
| `savingsAccruedInterest` | 금액 (직접) |
| `savingsWithholdingTax` | 금액 (직접) |

- 복리 다회차·복잡 이율구조나 금융기관 산출액 보유 시. 사용자 명시입력이므로 자동안분 금지정책 무관.

---

## 4. 평가기준일 전달 — 지상권 "파생값 주입" 동형 (v2 핵심 정정)

### 선례 실측 (코드#2·UI사전실측)
- 지상권: 클라이언트가 `valuationDate`로 **잔존연수(숫자)** 산정→주입(`resolveSuperficiesTenureYears`·
  `injectSuperficiesRemainingYears`, `estate-item-valuation.ts:35`). **엔진은 날짜 미수신**(`evaluateSuperficies`는 숫자만 소비).
- `VariantBodyProps.valuationDate` **이미 존재**(`types/...types.ts:15`) — `Step1Estate.tsx:96`(상속 `deathDate`)·
  `gift-tax-form-shared.tsx:398`(증여 `giftDate`) 주입 중. 자산카드는 평가기준일 접근 가능.

### 예금 적용 — 파생값 주입 (dual-truth·NaN 차단)
**산식은 엔진 순수헬퍼 단일 진실, 호출은 valuationDate를 아는 클라이언트 4경로**(single-source-engine-helper):

```typescript
// 엔진(property-valuation.ts) — 순수, 날짜연산 포함하되 진입은 클라이언트
export function computeSavingsAccrual(p: {
  principal: number; annualRate: number; startDate: Date; valuationDate: Date;
  withholdingRate: number; includeLocalTax: boolean;
}): { accruedInterest; incomeWithholding; localIncomeTax; withholdingTax; valuatedAmount } { ... }
```

| 경로 | 파일 | 역할 | 정정 |
|---|---|---|---|
| 본계산(상속) | `InheritanceTaxForm.tsx:426 buildInput` | item에 파생값 주입 후 엔진 input | **api 아님**(코드#1 Critical) |
| 본계산(증여) | `lib/calc/gift-api.ts:45 buildGiftTaxInput` | 동상 | 상속과 비대칭 |
| 사이드바 | `lib/calc/estate-item-valuation.ts:99 computeEffectiveValuation` | financial+mode 분기 valuatedAmount | **갱신 필수**(UI#1 Critical) |
| 검증(⑧) | `inheritance-validate.ts:159 resolveEngineValuatedAmount` 경유 | 미주입→NaN 위험 | **가드/주입**(코드#3) |
| 프리뷰 | `EstateBodyFinancial` useMemo (valuationDate prop) | 표시전용 | EstateBodySuperficies 동형(UI#5) |

- **evaluateFinancial(엔진 본계산)**: `auto`는 주입된 `savingsAccruedInterest`·`savingsWithholdingTax`를
  `manual`과 동일하게 합산. **엔진 evaluateFinancial은 날짜를 보지 않는다** → NaN 불가.
- **validate 경로 주입 — pre-inject 패턴(H-1 확정)**: `validateEstateItemAllocations(item)`
  (`inheritance-validate.ts:152`)는 item만 받지만 상위 `validateInheritanceTaxInput(:338)` 스코프에
  `input.deathDate` 존재. **호출부에서 pre-inject**:
  ```typescript
  const enriched = injectSavingsAccrualIfAuto(item, input.deathDate);   // 증여=giftDate
  validateEstateItemAllocations(enriched);
  ```
  `injectSavingsAccrualIfAuto`는 `computeSavingsAccrual`로 `savingsAccruedInterest`·`savingsWithholdingTax`를
  채운 사본 반환(시그니처 변경 없이 단일 진실 유지). → 본계산·validate 동일 주입값 → **dual-truth 0**.
  evaluateFinancial의 미주입 fallback은 최후 안전망(case 9)으로만 잔존.

> 대안(엔진에 valuationDate 주입·엔진 날짜연산) 기각: validate 경로 미주입 NaN·estateItems nested
> date-coerce 신규부담. 파생값 주입이 지상권 동형·견고.

---

## 5. 엔진 설계 (property-valuation.ts)

```typescript
const mode = item.savingsValuationMode ?? "balance";   // ?? "balance" 회귀안전
if (mode === "balance") { /* 현행: marketValue */ }
if (mode === "auto" || mode === "manual") {
  const principal = item.savingsPrincipal ?? 0;
  const accrued   = item.savingsAccruedInterest ?? null;     // auto=클라이언트 주입, manual=직접
  const wht       = item.savingsWithholdingTax ?? null;
  if (mode === "auto" && accrued == null) { /* 잔액 fallback + warning (코드#3) */ }
  valuatedAmount = principal + (accrued ?? 0) - (wht ?? 0);
  method = "deposit_statutory";                              // 신설(UI#6)
}
```

### breakdown (㉠㉡㉢ 분리 — lawRef 정확 귀속)
```typescript
breakdown: [
  { label: "㉠ 예입금액",            amount: principal,         lawRef: VALUATION.DEPOSIT },          // §63④
  { label: "㉡ 미수이자",            amount: accruedInterest,   lawRef: VALUATION.DEPOSIT },          // §63④
  { label: "㉢ 원천징수세액(−)",     amount: -withholdingTax,   lawRef: VALUATION.DEPOSIT },          // §63④
  //   ㉢-1 이자소득세 echo lawRef: INCOME_TAX.INTEREST_WHT_127_1 + INTEREST_RATE_129_1_D
  //   ㉢-2 지방소득세 echo lawRef: LOCAL_TAX.SPECIAL_COLLECTION_103_13_1
]
```

### method 라벨 (UI#6)
`"deposit_statutory"` 신설 → 결과뷰 라벨맵 "예금 보충적 평가(§63④)". 기존 `market_value`("시가") 유지 시
사용자가 §63④ 적용 사실 구분 불가 → 신설 필수.

### 법령 상수 (legal-codes — 리터럴 금지. 파일 결정: L-1)
세목 횡단 법령이므로 **신규 파일 `legal-codes/income-tax.ts`·`legal-codes/local-tax.ts` 신설**
(inheritance-gift.ts에 넣으면 양도세 등 재사용 불가). barrel `legal-codes.ts` re-export.
```typescript
// inheritance-gift.ts VALUATION 블록
DEPOSIT: "상증법 §63 ④",                                    // 예금·저금·적금
// legal-codes/income-tax.ts 신설
INCOME_TAX.INTEREST_WHT_127_1:      "소득세법 §127 ①",
INCOME_TAX.INTEREST_RATE_129_1_D:   "소득세법 §129 ① 1호 라목",   // 14%
// legal-codes/local-tax.ts 신설
LOCAL_TAX.SPECIAL_COLLECTION_103_13_1: "지방세법 §103의13 ①",      // 개인지방소득세 특별징수 10%
```
- barrel(`legal-codes.ts`) re-export 추가. 기존 `evaluateFinancial` "§62" 주석·`PRINCIPLE` lawRef 정정.

### §22 금융재산공제 영향 (법령#5 — 실측 `financial-deduction-resolver.ts` 존재)
- 평가액이 `marketValue`(원금)→`원금+이자−원천징수`로 변동 → §22 공제 대상 합산액 변동(2억 한도).
- **Do 전 확인**: `financial-deduction-resolver.ts`가 `valuatedAmount` 참조 경로 추적 → 정밀평가가
  공제 한도에 미치는 영향 + 회귀 테스트를 "금융재산공제 포함 통합 케이스"로 구체화. → §9.

---

## 6. UI 설계 (estate-card/variants/)

`EstateBodySimple`(cash·financial·other 공용)에서 **financial 분리**:
- **신설**: `EstateBodyFinancial.tsx` (`category:"financial"` 예금·저금·적금). `pickBodyVariant`
  switch `financial → EstateBodyFinancial`(`variants/index.ts:36`).
- **무관 명시**(UI#7): 기존 `EstateBodyDeposit.tsx`(`category:"deposit"` 전세보증금) 변경 없음.
- **dead code 제거**(UI#10): `EstateBodySimple.tsx`의 `financial` 키(`NAME_PLACEHOLDER`·`MARKET_LABEL`·
  `MARKET_HINT`·`PRIORITY_HINT`(잘못된 "§62")·`SUBTITLE`) 삭제, `cat` 타입 `"cash"|"other"`로 좁힘.

### 레이아웃 (UI 순서 = 로직 순서, tone 명시 — UI#3)
1. 평가모드 RadioCardGroup `잔액평가 | §63④ 정밀평가` — `tone="emerald"`(평가 확정)
2. (정밀) 미수이자 산정 RadioCardGroup `자동계산 | 직접입력` — `tone="sky"`
3. 입력 필드(모드 조건부 — 영향필드 직전 토글). DateInput(savingsStartDate)·DecimalInput(율)
4. 평가기준일 echo(읽기전용) — `mode==='inheritance'`→"상속개시일", `'gift'`→"증여일"
   (`VariantProps.mode` `types.ts:18`, `valuationDate` `types.ts:15` 분기 — UI#9)
5. `savingsIncludeLocalTax` ToggleCard — `tone="sky"`, OFF도 tone 유지
6. 미리보기: `valuationDate` 있으면 UI에서 `computeSavingsAccrual` 직접호출(표시전용, submit경로 아님 — UI#5)

### 결과뷰 (UI#2 — 상속/증여 경로 분리)
- **증여**: `GiftValuationBasisCard`(`GiftTaxResultView.tsx:550`)가 `breakdown` 자동 렌더 — 추가구현 불요.
- **상속**: `InheritanceTaxResultView.tsx:467-490`은 `valuatedAmount`·`method`만 표시 →
  **`vr.breakdown` 행 렌더 추가 필요**(기존 코드 수정). method 라벨맵에 `"deposit_statutory"` 추가.

### 결과카드 산식 (한국어 — floor()·약어 금지)
```
예금등 평가액 = 예입금액 1,000,000,000 + 미수이자 41,780,822 − 원천징수세액 6,434,246
            = 1,035,346,576
  · 미수이자 = 예입금액 × 연 5% × 305일 / 365일
  · 원천징수세액 = 이자소득세(미수이자 × 14%) + 지방소득세(이자소득세 × 10%)
```

---

## 7. 14 동기화 지점 (Definition of Done — 신규 필드 8개)

신규: `savingsValuationMode`·`savingsPrincipal`·`savingsAnnualRate`·`savingsStartDate`·
`savingsWithholdingRate`·`savingsIncludeLocalTax`·`savingsAccruedInterest`·`savingsWithholdingTax`. 상속·증여 양쪽.

**클라이언트 8**
- ① FormData(estate item): 8필드
- ② initial: factory **위치 grep 확정 필요**(UI#8) — mode 기본 `"balance"`, 율 14%, 지방세 ON
- ③ normalize: `normalize-restored-form-dates.ts:54 normalizeEstateItemDates`에 `savingsStartDate` 재수화 추가(UI#5·코드#5)
- ④ API 변환/주입: 상속 `InheritanceTaxForm.tsx buildInput` / 증여 `gift-api.ts buildGiftTaxInput` — `computeSavingsAccrual`로 파생 주입(코드#1)
- ⑤ UI 위젯: `EstateBodyFinancial`
- ⑥ 사이드바: `estate-item-valuation.ts:99 computeEffectiveValuation` financial mode 분기(UI#1·#4)
- ⑦ 결과카드: 증여=GiftValuationBasisCard 자동 / 상속=InheritanceTaxResultView breakdown 추가(UI#2)
- ⑧ validation: auto 필수필드(율·기산일) 미입력 차단. **API/UI fallback ↔ validate 동기화**. validate 주입경로 §4

**API/Route 6**
- ⑨⑩ Zod estateItemSchema(+companion addPropertyRefines): mode union + optional 8필드
- ⑪ 자산-수준 fallback
- ⑫ **Zod 입력객체 정의**(TS 미감지 — grep 자가점검)
- ⑬ **callXxxAPI body spread**(TS 미감지)
- ⑭ **Route 엔진 input 매핑**: 파생값 주입 방식이므로 엔진은 `savingsStartDate`를 Date로 **사용 안 함**
  → **Route date-coerce 대상 아님**(L-2, Simplicity First). `savingsStartDate`는 클라이언트
  `computeSavingsAccrual` 단계에서만 `parseISO`로 소비. 엔진 input엔 산정된 숫자(accrued·wht)만 도달.

> 파생값 주입 방식이므로 **`savingsValuationDate`는 엔진 input 필드 불요**(클라이언트가 산정해
> accruedInterest·withholdingTax만 주입). v1의 depositValuationDate 주입 필드 폐기.

---

## 8. 케이스 매트릭스 (anchor — 단순→복합, warning 동결)

| # | 모드 | 시나리오 | 기대 |
|---|---|---|---|
| 1 | balance | marketValue 5천만 | 50,000,000 (현행 회귀) |
| 2 | balance | marketValue 0 | 0 + warning "금융재산 금액이 0원 — 입력 확인 필요" |
| 3 | auto | **상증기준 63-58 2-10**(이미지2) | **1,035,346,576** (±1 tolerance, PDF 575) ★핵심 |
| 4 | auto | 지방소득세 OFF | 1,000,000,000 + 41,780,822 − 5,849,315 = 1,035,931,507 |
| 5 | auto | 평가기준일 < 이자기산일 | 미수이자 0 가드 + warning "예금 평가기준일이 이자기산일보다 빠릅니다 — 미수이자 0 처리" |
| 6 | auto | 율·기산일 미입력 | validate 차단(⑧) |
| 7 | manual | 1억 + 미수이자 50만 − 원천징수 7만 | 100,430,000 |
| 8 | auto-증여 | giftDate 기준 경과일수 | 증여 경로 주입 |
| 9 | auto + validate 경로 | 미주입 item으로 resolveEngineValuatedAmount 직접호출 | 잔액 fallback + warning, 본계산과 dual-truth 없음(주입 일치) — 코드#3 회귀 |

---

## 9. 미해결·확인 필요 (Do 전 해소 — 추정 금지)

1. ~~일수 산정~~ **✅ 확정(Pre-Do probe PASS)**: `differenceInDays(parseISO("2008-05-01"),
   parseISO("2007-07-01"))===305` vitest 통과(`__tests__/tax-engine/deposit-valuation.test.ts`). 보정 불요.
2. ~~지방소득세 절사 단위~~ **✅ 해소(H-2)**: 국고금관리법 §47 실측 — 10원 절사는 국고금 수입·지출
   끝수일 뿐 평가계산 아님 → 원 단위 확정, 10원 배제. floor vs round 1원만 anchor ±1로 흡수. §1 참조.
3. **§22 금융재산공제 영향**: `financial-deduction-resolver.ts` valuatedAmount 참조 경로 추적 →
   정밀평가의 2억 한도 영향 + 회귀 케이스 구체화(법령#5).
4. **validate 주입 경로**: `validateEstateItemAllocations` 호출부 `deathDate`/`giftDate` 접근성 실측 →
   주입 가능 여부 확정(코드#3).
5. **② factory 위치**: estate item 초기화 factory grep 확정(UI#8).
6. **복리 다회차 SCOPE_OUT**: 본 사례 단리식 성립(경과기간 내 복리회차 없음). 다회 복리는 manual 모드 안내.

---

## 10. 작업 순서 (PDCA Do — 시퀀셜, pre-do-anchor 선행)

1. **Pre-Do probe+anchor**:
   (a) `differenceInDays` 305 probe(§9-1) →
   (b) case 3 anchor(1,035,346,576 ±1) 작성→실패 확인→설계 환류
2. 엔진: legal-codes 상수 3종 → `computeSavingsAccrual` → `evaluateFinancial` 분기 + method + 주석/lawRef 정정
3. 타입: EstateItem 8필드(①)
4. 클라이언트 주입: 상속 buildInput / 증여 buildGiftTaxInput / `computeEffectiveValuation` / validate 경로(④⑥⑧)
5. Zod/Route: ⑨⑩⑫⑬⑭(grep 자가점검) + estateItems date-coerce
6. UI: `EstateBodyFinancial` + EstateBodySimple dead code 제거 + 결과뷰(상속 breakdown·method 라벨)(⑤⑦)
7. validation ⑧ (mode별 fallback 동기화)
8. 통합 anchor 전 케이스 9종 + 회귀(`npx vitest run __tests__/tax-engine/property-valuation`) + §22 공제 통합 + 상속·증여 전체
9. E2E(잔액·자동계산·직접입력 3 spec) — Playwright
