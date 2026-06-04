# 상속세 연부연납(年賦延納) 일정표 — 구현 계획서

> ✅ **구현 완료 (2026-06-04)** — 엔진+데이터+anchor 14건+UI+E2E 2건. tsc 0건, 전체 6,392 PASS.
> 기본값 진행: ① 가업상속 모드 A(straight20) 기본 + UI 토글 B 병행 / ④ API 미경유(결과뷰 순수함수).
> 구현 파일: `lib/tax-engine/data/installment-surcharge-rates.ts` · `lib/tax-engine/credits/installment-payment.ts`(calcInstallmentSchedule·isInstallmentEligible 추가, calcInstallmentPayment 보존) · `components/calc/inheritance/InstallmentInputSection.tsx` · `components/calc/results/installment/InstallmentScheduleCard.tsx` · `__tests__/tax-engine/inheritance/installment-payment.test.ts` · `e2e/inheritance-installment-payment.spec.ts`.
> 미세 조정: 결과 표는 BesshiRow(FilingFormRow 전용) 대신 동일 정렬 클래스의 전용 표 사용. 가업상속재산가액 소스 = `result.deductionDetail.familyBusinessDetail.finalValue`(중첩 경로 정정).

> 상증법 §71·§72 + 시행령 §68·§69 기반. 상속세 마법사 5단계(공제·세액공제) 끝에
> 연부연납 입력을 받아, 결과 화면에 **회차·납부일자·납부원금·가산금·합계세액** 표를 출력한다.
>
> 작성일 2026-06-04 · 인터뷰 2회 반영 · KoreanLaw MCP 법령 실측 검증 완료

---

## 0. 인터뷰 확정 사항 (4건)

| # | 결정 | 내용 |
|---|---|---|
| 1 | **가산율** | 고시 연혁 **변동율** 기본(과거 회차는 납부일 당시 고시율, 변경 시 변경 전 기간은 변경 전 율로 일수 안분) + **미래 회차 가산율은 사용자 직접 입력**(기본값 현행 3.1%) |
| 2 | **적용 범위** | 일반 상속 10년 + **가업상속 20년까지 포함** |
| 3 | **납부일자 기산** | **신고·납부기한**부터(= 상속개시일이 속하는 달의 말일부터 6개월, §67①) 매년 1년 간격 |
| 4 | **회분 1천만원 미달** | §71② 단서(각 회분 분납세액 1천만원 초과) 위반 시 **가능한 최대 기간으로 자동 단축** + 안내. 결과 카드는 **요약 카드 유지 + 회차별 상세 표 추가** |

---

## 1. 법령 근거 (KoreanLaw MCP 실측 검증)

| 조문 | 내용 | 검증 |
|---|---|---|
| **상증법 §71①** | 납부세액 **2천만원 초과** 시 신청·허가, 담보 제공 | ✅ mst=276123 |
| **상증법 §71②1나** | 일반 상속재산: 허가일부터 **10년** | ✅ |
| **상증법 §71②1가** | 가업상속재산: 허가일부터 **20년** 또는 허가 후 10년이 되는 날부터 10년 | ✅ |
| **상증법 §71② 단서** | 각 회분 **분할납부 세액이 1천만원을 초과**하도록 기간 설정 | ✅ |
| **상증법 §67①** | 신고기한 = **상속개시일이 속하는 달의 말일부터 6개월**(해외거주 시 9개월 §67④) | ✅ |
| **시행령 §68①** | 매년 납부금액 = **연부연납 대상금액 ÷ (연부연납기간 + 1)**, 1천만원 초과 범위 | ✅ mst=283637 |
| **시행령 §68①1호** | 가업상속 "허가 후 10년 되는 날부터 10년" 납부분도 동일 산식 | ✅ |
| **시행령 §68①3호** | 일반·가업 일반분: **신고납부기한**과 경과 후 매년 동일 산식 | ✅ |
| **시행령 §68②** | 가업상속 연부연납 세액 = 납부세액 × **(가업상속재산가액 − 가업상속공제액) / (총상속재산가액 − 가업상속공제액)** | ✅(산식 본문은 이미지로 확보) |
| **상증법 §72 1호** | **첫 회** 가산금 = 연부연납 허가 총세액 × (신고기한 다음날 ~ 첫 분할납부 납부기한 **일수**) × 가산율 | ✅ |
| **상증법 §72 2호** | **이후 회** 가산금 = (허가 총세액 − 직전회까지 납부 분할세액 합계) × (직전 납부기한 다음날 ~ 당해 납부기한 **일수**) × 가산율 | ✅ |
| **시행령 §69①** | 가산율 = 각 회분 **납부일 현재** 국기령 §43의3② 이자율 | ✅ |
| **시행령 §69②** | 가산금 대상 기간 중 가산율 **1회 이상 변경 시 변경 전 기간은 변경 전 율** 적용(일수 안분) | ✅ |
| **국기령 §43의3②** | 이자율 = 재정경제부령(국기칙 §19의3) 율 — **현행 연 3.1%(2025.3.21~)** | ✅(연혁은 이미지) |

### 가산율 고시 연혁 (이미지 Screenshot_104657 — 정적 상수화 대상)

| 적용기간(시행일) | 연 가산율 |
|---|---|
| 2018.3.19 ~ 2019.3.19 | 1.8% |
| 2019.3.20 ~ 2020.3.12 | 2.1% |
| 2020.3.13 ~ 2021.3.15 | 1.8% |
| 2021.3.16 ~ 2023.3.19 | 1.2% |
| 2023.3.20 ~ 2024.3.21 | 2.9% |
| 2024.3.22 ~ 2025.3.20 | 3.5% |
| **2025.3.21 ~ (현행)** | **3.1%** |

> 연혁 표는 `lib/tax-engine/data/installment-surcharge-rates.ts` 정적 상수로 (CLAUDE.md `feedback_historical_tax_tables` 정책). 시행일 경계는 KoreanLaw 또는 국기칙 §19의3 개정 이력으로 재확인 후 동결.

---

## 2. 현행 구현 갭 분석

대상 파일: `lib/tax-engine/credits/installment-payment.ts` + 결과 카드 `InheritanceTaxResultView.tsx`(L52~81)

| # | 현행 | 문제 | 법령 |
|---|---|---|---|
| G1 | `GENERAL_MAX_YEARS = 5` | **상속세 일반 최대 5년 = 오류**. 증여세가 5년, 상속세 일반은 **10년** | §71②1나 |
| G2 | 가산율 `0.018`(1.8%) 하드코딩 | 현행 **3.1%**, 변동율·미래 사용자 입력 미반영 | §69 |
| G3 | 회차에 **납부일자 없음** | 이미지의 "납부일자" 컬럼 출력 불가 | §72(일수 필요) |
| G4 | 가산금 = `잔액 × 연율`(1년치 고정) | 변동율 일수 안분(§69②) 미반영, 첫 회 일수(§72 1호) 미반영 | §72·§69 |
| G5 | 가업상속 거치 모델 임의 구현 | §68② 안분(가업분/일반분) 없음, 사례(20년 straight /(N+1))와 불일치 | §68② |
| G6 | 결과 = 정적 안내 카드 2줄 | 회차별 상세 표 없음 | — |
| G7 | 입력 단계 없음(`finalTax`만) | 연부연납 여부·희망기간·미래율 입력 UI 없음 | — |
| G8 | `INSTALLMENT_MIN_TAX` 비교 `> 20_000_000` | OK(2천만원 **초과**) — 유지 | §71① |
| **G9** | `calcInstallmentPayment`을 **증여세 결과뷰도 사용**(`GiftTaxResultView.tsx` L20·75·255·507, `isFamilyBusiness:false`) | **함수 시그니처 변경 시 증여세(5년)가 깨짐** — 비파괴 설계 필수(§3.1 C1) | — |
| **G10** | 인쇄 등록 게이트 `InheritanceTaxResultView.tsx` **L244** `calcInstallmentPayment({finalTax}).eligible` | 결과뷰 L567 외 **두 번째 호출처** — 교체 누락 위험 | — |

---

## 3. 아키텍처 결정

### 3.1 계산 위치 — 순수 엔진 함수 + 결과 화면 호출 (API 미경유)

연부연납 일정은 **결정세액(`result.finalTax`)을 확정한 뒤의 납부 계획 투영**이며, **결정세액 자체에 영향을 주지 않는다**. 입력값(여부·희망기간·미래율)도 백엔드 엔진 계산에 들어가지 않는다.

→ **백엔드 API/Zod/Route(동기화 지점 ⑨~⑭) 미변경.** 대신:

1. **순수 엔진 함수 `calcInstallmentSchedule()` 신규 추가**(`lib/tax-engine/credits/installment-payment.ts`) — 단일 진실. UI 자체 재구현 금지(`feedback_ui_engine_dual_truth_avoidance`).
2. **C1(비파괴) — 기존 `calcInstallmentPayment`은 증여세 결과뷰가 사용 중**(G9). 따라서 **삭제·시그니처 변경 금지**. 처리:
   - 가벼운 적격 판정 술어 `isInstallmentEligible(finalTax: number): boolean`(= `finalTax > 20_000_000`)을 별도 export하여 **인쇄 등록 게이트(L244·증여세 L255)** 를 이 술어로 교체(무거운 일정 계산 없이 적격만 판정).
   - 증여세 결과뷰의 `InstallmentGuide`(5년 정적 카드)는 **이번 범위 외 — 변경하지 않음**. `calcInstallmentPayment` 그대로 유지하거나, 공통화 시 증여세 5년 동작을 anchor로 보존.
3. **결과 화면**(`InheritanceTaxResultView`)이 `result` + 폼 입력 props를 받아 `calcInstallmentSchedule()`를 호출해 표를 렌더. 기존 `InstallmentGuide`(L52~81)는 새 `InstallmentScheduleCard`로 교체, L567 렌더·**L244 게이트** 모두 갱신.
4. 입력값은 폼 상태(sessionStorage/IndexedDB 자동 persist)에만 저장.

> 근거: 14 동기화 지점은 "엔진 input·result 변경 시" 발동. 본 기능은 엔진 input/result 불변(투영 계산). 과도한 Zod/Route churn 회피하되, 계산은 순수 함수로 단일화하여 dual-truth 회피. **이 판단은 Do 착수 전 재확인 필요 — 만약 이력 저장(IndexedDB resultData)에 일정표를 영속해야 하면 result 확장 필요.**

### 3.2 파일 맵

```
lib/tax-engine/
├── credits/installment-payment.ts        # ★추가: calcInstallmentSchedule() + isInstallmentEligible() (기존 calcInstallmentPayment 보존 — 증여세 사용 G9)
├── data/installment-surcharge-rates.ts    # ★신규: 가산율 고시 연혁 정적 상수 + lookupSurchargeRate()
└── legal-codes/inheritance-gift.ts        # TAX_CREDIT.INSTALLMENT 유지 + §72 상수 추가

components/calc/inheritance/
├── shared.ts                              # ①②③ 폼 필드 추가 + ⑧ validateStep
├── steps.tsx (Step4 끝, 함수 끝 L655 / 입력 삽입 L644 직후) # ⑤ 연부연납 입력 섹션
└── (입력 위젯만)

components/calc/results/
├── installment/InstallmentScheduleCard.tsx # ★신규(결과카드 관례 results/ 하위): 요약 카드 + 회차별 표 (800줄 정책 — 표 행 컴포넌트 분리 가능, BesshiRow 재사용)
└── InheritanceTaxResultView.tsx           # ⑦ InstallmentGuide(L52~81) → InstallmentScheduleCard 교체, L567 렌더·L244 게이트(isInstallmentEligible) 갱신, props 추가
# InheritanceTaxForm.tsx L453 InheritanceTaxResultView 호출에 연부연납 폼 props 4개 추가 배선
```

---

## 4. 엔진 설계 — `calcInstallmentSchedule()`

### 4.1 입력/출력 타입

```ts
export interface InstallmentScheduleInput {
  finalTax: number;                 // 결정세액 = 연부연납 대상금액 (result.finalTax)
  filingDeadline: Date;             // 신고기한 = 상속개시월 말일 + 6개월 (해외 9개월)
  requestedYears: number;           // 사용자 희망 연부연납 기간(년)
  // 가업상속 (옵션)
  familyBusiness?: {
    familyBusinessValue: number;    // 가업상속재산가액 ← result.familyBusinessDeductionDetail.finalValue (정정: form 아님)
    familyBusinessDeduction: number;// 가업상속공제액 (result.familyBusinessDeduction)
    grossEstateValue: number;       // 총상속재산가액 (result.grossEstateValue, 확인필요⑤)
    mode: "straight20" | "grace10"; // 20년 균등 vs 10년거치+10년 (4.4 참조, 확인필요①)
  };
  // 가업상속 시 requestedYears는 일반분 상한(≤10)에만 적용. 가업분 기간은 mode로 결정(straight20=20 고정).
  futureSurchargeRate: number;      // 미래 회차 가산율 (사용자 입력, 기본 0.031)
  today: Date;                      // 과거/미래 경계 (호출처 주입 — Date.now 직접 금지)
}

export interface InstallmentRow {
  installmentNo: number;            // 0 = 신고기한 즉납, 1..N = 연부연납 회차
  dueDate: Date;                    // 납부일자
  principal: number;                // 납부원금 (floor, 마지막 회차 잔액 흡수)
  surcharge: number;                // 연부연납 가산금 (§72)
  total: number;                    // principal + surcharge
  segment?: "general" | "fb_grace" | "fb_pay"; // 가업상속 분기 구분(표 그룹)
  rateNote?: string;                // 적용 가산율 설명(변동 구간 표기)
}

export interface InstallmentScheduleResult {
  eligible: boolean;                // finalTax > 2천만원
  requestedYears: number;           // 사용자 요청
  appliedYears: number;             // 1천만원 단서로 자동 단축된 실제 기간
  autoShortened: boolean;           // appliedYears < requestedYears
  deferredTotal: number;            // 연부연납 허가 총세액 = finalTax − 즉납분(installmentNo 0)
  rows: InstallmentRow[];
  totalPrincipal: number;           // = finalTax
  totalSurcharge: number;
  grandTotal: number;
  notes: string[];                  // 경고·안내(단축·해외기한·미래율 가정 등)
}
```

### 4.2 일반 상속 알고리즘 (핵심)

1. **적격**: `finalTax > 20_000_000` 아니면 `eligible:false`.
2. **기간 상한**: 일반 10년. `years0 = min(requestedYears, 10)`.
3. **1천만원 단서 자동 단축** (결정4): 매 회분 원금 = `floor(finalTax / (years+1))`.
   회분 원금 ≤ 1천만원이면 years를 줄여 `floor(finalTax/(years+1)) > 10_000_000` 인 최대 years 탐색.
   - `appliedYears = max{ y ∈ [1, years0] : floor(finalTax/(y+1)) > 10_000_000 }`
   - 단축 시 `autoShortened:true` + note.
   - (예외) finalTax가 작아 y=1에서도 미충족이면 → 연부연납 부적격에 준해 note 표시.
4. **회차·일자·원금**: N = appliedYears
   - 회차 0: `dueDate = filingDeadline`, `principal = floor(finalTax/(N+1))`, `surcharge = 0`(신고와 동시 납부).
   - 회차 k(1..N): `dueDate = filingDeadline + k년`, `principal = floor(finalTax/(N+1))` (마지막 회차 = 잔액 흡수: `finalTax − Σ직전원금`).
   - `deferredTotal = finalTax − 회차0 원금`.
5. **가산금**(§72, 변동율 일수 안분):
   - `base_k = deferredTotal − Σ_{1≤j<k} principal_j`
     (k=1: base = deferredTotal 전액 = §72 1호; k≥2: 직전회까지 분할세액 차감 = §72 2호)
   - 기간 = `(이전 납부기한 다음날) ~ (당해 납부기한)`. 이전 납부기한: k=1 → 신고기한(filingDeadline), k≥2 → 회차 k-1 dueDate.
   - **변동율 일수 안분**: 기간을 가산율 고시 변경일로 분할 → 각 소구간 `base_k × days_sub × rate_sub / 365` 합산(분모 **365 고정** — 이미지 산식 ×1/365).
     - 납부기한 ≤ today 구간 → `lookupSurchargeRate(date)` 연혁율.
     - 납부기한 > today 구간 → `futureSurchargeRate`(사용자 입력).
     - today를 가로지르는 회차 → 과거분 연혁율 + 미래분 사용자율 안분.
   - `surcharge_k = Σ floor(...)` (회차 단위 floor; 소구간 합산 후 절사 — 절사 위치는 사례 anchor로 동결).
6. **합계**: `totalPrincipal = finalTax`, `totalSurcharge = Σ surcharge`, `grandTotal = 합`.

### 4.3 가산금 변동율 일수 안분 — 예시 (사례 1회분 검증)

이미지 사례(상속개시 2015.12.20 → 신고기한 2016.6.30, 허가총세액 5억, 신청 당시율 1.8%):
- 1회분 = 5억 × 455일(2016.7.1~2017.9.28) × 1.8% / 365 = **11,219,170** ✓
- 2회분 = (5억−1억)=4억 × 365 × 1.8% / 365 = 4억×1.8% = **7,200,000** ✓
- 5회분 = 1억 × 1.8% = **1,800,000** ✓

> **앱 단순화 주의**: 앱은 허가 지연을 모델링하지 않고 신고기한 기준 **정확히 1년 간격**(결정3)으로 일자를 생성 → 첫 회분 일수가 사례의 455일이 아니라 약 365일이 됨. 따라서 앱 산출 첫 회분 가산금 = 5억×(365/365)×1.8% = 9,000,000(사례 11,219,170과 다름 — 사례는 허가지연 특수). **anchor는 "신고기한 기준 1년 간격" 모델 기준 재산정값으로 동결**(`feedback_anchor_correction_legal_priority`). 사례값은 일수 입력이 다른 별도 시나리오로 보조 검증.

### 4.4 가업상속 분기 (§68②) — ⚠️ Do 착수 전 확정 필요

`familyBusiness` 제공 시:
- **가업상속재산분 세액** = `floor(finalTax × (가업상속재산가액 − 가업상속공제액) / (총상속재산가액 − 가업상속공제액))`
- **일반재산분 세액** = `finalTax − 가업상속재산분 세액`
- 두 분을 **독립 일정**으로 생성 후 회차별 합산(이미지 사례 나):
  - 일반분: 10년(11회) — 4.2 알고리즘
  - 가업분: **20년**
    - **모드 A `straight20`**(교재 사례 기준, 권장): /(20+1)=21 균등, 매년 21분의 1, 가산금 = 잔액×율×일수/365
    - **모드 B `grace10`**(현행 §71②1가 후단): 허가 후 10년 거치(원금 0·가산금만) + 11~20년 납부
  - 사례 나 매20년 = 440,000 × 1/21 = **20,952**(천원) → 모드 A 검증 anchor.
- **결합 일정표 구성**: 두 분(일반·가업)을 각각 독립 일정으로 생성하되, **납부일자(연도) 기준으로 같은 해 회차를 합산**해 하나의 표로 출력. 회차0(신고기한)에는 두 분의 첫 회분(일반 /(10+1) + 가업 /(20+1))이 모두 발생. 표 행 수 = max(일반 11, 가업 21) = **최대 21행**. 각 행에 `segment`(general/fb_grace/fb_pay) 구분 + 연도별 원금·가산금 소계, 행 합산은 `principal`·`surcharge`·`total` 단순 합.
- **1천만원 단서 적용 단위**: 결합 시 §68① "매년 납부할 금액"이 **분(分)별인지 합산 기준인지** 모호 → **확인 필요 ⑥**. 1차 구현은 **분별 독립 판정**(일반분·가업분 각각 /(N+1)>1천만)으로 가정.

> **확인 필요 ①**: 가업상속 20년을 (A) **20년 균등 /(20+1)** 으로 갈지, (B) **10년 거치+10년 납부**로 갈지, 또는 (C) **사용자 선택 토글**로 둘 다 제공할지. 교재 사례·anchor 검증 가능성 측면에서 **기본 A 권장**, B는 후속. 현행 코드(거치 모델)는 A로 정정.

---

## 5. UI 설계

### 5.1 입력 — Step4(공제·세액공제) 맨 끝 (동기화 ⑤)

기존 단기재상속 입력 블록 뒤(`steps.tsx` 함수 끝 L655 이전, **L644 직후**)에 **연부연납 섹션 카드**(amber tone, ToggleCard) 추가:

```
┌ 연부연납 (상증법 §71)  [ToggleCard amber]  ⊙────  ← 여부 토글
│  ⓘ 결정세액 2천만원 초과 시 신청 가능. 결과 화면에 회차별 일정표가 표시됩니다.
│  (ON 시 펼침)
│  • 희망 연부연납 기간 [Select 1~10년]  ← 일반분 기준(가업분은 아래 방식으로 20년 자동)
│  • [ToggleCard] 가업상속재산 포함 (§71②1가)  ⊙────   ← result 가업상속공제 적용 시 자동 추천
│     (ON 시) 가업상속 납부방식 [RadioCardGroup: 20년 균등 / 10년거치+10년]  ← 확인필요①
│  • 미래 회차 가산율(연) [DecimalInput %, 기본 3.1]
│     ⓘ 과거 회차는 고시 연혁율 자동 적용, 미래 회차에 이 율 적용
└
```

> 희망기간 Select는 1~10(일반분 상한 §71②1나). 가업분 기간은 RadioCardGroup의 mode로 결정(균등 20년 / 10년거치+10년) — requestedYears와 분리(§4.1).

규칙: ToggleCard(native 금지)·OFF도 amber tone 유지·DecimalInput(연수·%는 CurrencyInput 금지)·placeholder 숫자 예시 금지(hint 한국어).

### 5.2 결과 — `InstallmentScheduleCard` (동기화 ⑦, 기존 `InstallmentGuide` 교체)

결정4: **요약 카드 유지 + 표 추가**. amber 카드 헤더 유지하되 본문 교체:

아래는 **교재 사례 가(결정세액 6억·5년·신청당시율 1.8%)** 로 그린 일관 예시:

```
연부연납 안내 (상증법 §71)
결정세액 2천만원 초과 시 분할납부 — 일반 10년 / 가업상속 20년
─────────────────────────────────────────────
[요약]  연부연납 대상(결정세액)   600,000,000
        허가 즉시 납부(신고기한)   100,000,000
        연부연납 허가 총세액       500,000,000
        가산금 합계                 29,218,170
        총 납부세액                629,218,170
        적용 기간                 5년 (희망 M년 → 단서로 단축 시 배지)
─────────────────────────────────────────────
[회차별 상세 표]  (BesshiRow 재사용, 금액 우측정렬 tabular-nums)
 회차 | 납부일자     | 납부원금      | 가산금      | 합계세액
  0   | 2016-06-30  | 100,000,000 |          0 | 100,000,000  (신고기한 즉납)
  1   | 2017-06-30  | 100,000,000 |  11,219,170| 111,219,170
  2   | 2018-06-30  | 100,000,000 |   7,200,000| 107,200,000
  3   | 2019-06-30  | 100,000,000 |   5,400,000| 105,400,000
  4   | 2020-06-30  | 100,000,000 |   3,600,000| 103,600,000
  5   | 2021-06-30  | 100,000,000 |   1,800,000| 101,800,000
 합계 |             | 600,000,000 |  29,218,170| 629,218,170
─────────────────────────────────────────────
※ 가산금은 각 회분 납부일 현재 고시 가산율(국기령 §43의3) 적용.
  미래 회차는 입력 가산율 연 X.X% 가정. 실제 세액은 관할 세무서·세무사 확인 권장.
```

> ⚠️ 위 1회분 가산금 11,219,170은 **교재 사례의 입력(허가지연으로 1회분 455일·1.8%)** 기준이다. **앱 기본 모델은 신고기한 기준 정확히 1년 간격(결정3)·현행 변동율**이므로 같은 입력이라도 1회분 가산금이 달라진다(4.3 참조). 표의 납부일자도 앱에서는 신고기한+k년으로 생성(예시는 사례 일자 차용).

- 표는 `components/calc/results/shared/BesshiRow.tsx` 재사용(금액 칸 `text-right font-mono tabular-nums`).
- "원" 접미사 금지, 변수 약어·floor 금지(한국어 산식).
- 가업상속 분기 시 segment별 소그룹 행(일반분 / 가업분 거치 / 가업분 납부) + 합계행.
- 자동 단축 시 배지 "§71② 단서로 N년 적용(희망 M년)".
- 내부 id 노출 금지 정책 해당 없음(자산명 미표시).
- 인쇄 선택(PrintSection id="installment-guide") 기존 연결 유지.

### 5.3 데이터 소싱 매핑

| 엔진 입력 | 출처 | 비고 |
|---|---|---|
| `finalTax` | `result.finalTax` | 결정세액 |
| `filingDeadline` | `deathDate`(prop) → `addMonths(endOfMonth(deathDate), 6)` | date-fns. 상속개시일 속하는 달 **말일**(endOfMonth)부터 6개월. 예: 2015-12-20→말일 2015-12-31→2016-06-30(사례 일치). 해외거주 9개월은 **확인 필요 ②** |
| `requestedYears` | 신규 폼 필드 `installmentYears`(string→number) | |
| `familyBusinessValue` (가업상속재산가액) | **`result.familyBusinessDeductionDetail?.finalValue`** | ⚠️ 정정: `form.familyBusinessValue`(string·legacy)나 nested `form.familyBusiness`가 아니라 **엔진이 확정한 result 측 finalValue**(manual ?? auto, 직접입력 시 directAmount). 단일 진실 |
| `familyBusinessDeduction` (가업상속공제액) | `result.familyBusinessDeduction` | |
| `grossEstateValue` (총상속재산가액) | `result.grossEstateValue` | **확인 필요 ⑤**: §68② "총상속재산가액" ↔ result "상속재산가액(평가 후)" 의미 일치 여부(간주상속재산·추정상속 포함 범위) |
| `futureSurchargeRate` | 신규 폼 필드 `installmentFutureRate`(%, 기본 "3.1") → **/100 변환**(3.1→0.031) | 엔진은 decimal 수령. UI는 % 표기 |
| `today` | 호출처에서 `new Date()` 주입 | 엔진 내부 Date.now 금지(`api/date-coerce` 정책) |

---

## 6. 케이스 인벤토리 (Do 진입 필수 — 행 ≥ 1)

| ID | 시나리오 | 입력 | 기대 | 검증원 |
|---|---|---|---|---|
| INS-01 | 부적격 | finalTax 2천만원 이하 | eligible:false, 표 미표시 | §71① |
| INS-02 | 경계 | finalTax = 20,000,000 | 부적격(초과 아님) | §71① |
| INS-03 | 일반 5년 | finalTax 6억, 5년 | 회차0~5, 즉납 1억, 매년 1억 | §68① 사례 가 |
| INS-04 | 일반 10년 | finalTax 5.5억, 10년 | 회차0~10, /(10+1) | §71②1나 |
| INS-05 | 1천만원 자동단축 | finalTax 3천만원, 10년 요청 | **appliedYears=1** (y=1: 30M/2=15M>10M ✓ / y=2: 30M/3=10M는 **초과 아님** ✗), autoShortened | §71② 단서 |
| INS-06 | 가산금 변동율 안분 | 회차 납부일이 고시 변경일 가로지름 | 소구간별 율 합산 | §69② |
| INS-07 | 미래 회차 사용자율 | 미래 회차 = 입력율 적용 | 과거 연혁 + 미래 입력율 | 결정1 |
| INS-08 | 첫 회 일수(앱 모델) | 신고기한~1회=1년 | 첫 회분 = deferredTotal×율 (365/365) | §72 1호+결정3 |
| INS-09 | 가업상속 20년균등 | 사례 나: 납부세액 1,100,000,000(11억), 가업비율 40% | 가업분세액 = 1,100,000,000×40/100 = 440,000,000 → 매년 floor(440,000,000/21) = **20,952,380** (사례 천원표기 20,952천원 ↔ 원단위 절사 차이 caveat 동결) | §68② 사례 나·모드A |
| INS-10 | 가업+일반 합산 | 사례 나 | 일반분 10년(660,000천원/11=60,000천원) + 가업분 20년(20,952천원) **연도별 회차 합산**, 표는 최대 21행 | 사례 나 |
| INS-11 | 잔액 흡수 | 나누어 떨어지지 않음 | 마지막 회차 원금 = 잔액(±절사) | floor 정책 |
| INS-12 | 해외거주(보류 가능) | 9개월 기한 | filingDeadline +9개월 | §67④ / 확인필요② |

> 사례값(이미지 Screenshot_104621·104704)은 원/천원 단위 `toBe()` anchor로 고정(`feedback_pdf_example_test_anchoring`). 단, 첫 회분은 앱 1년 모델 재산정값으로 동결(4.3).

---

## 7. 동기화 지점 영향도

본 기능은 **엔진 input/result 불변**(투영) → 14 지점 중 **클라이언트 ①②③⑤⑦⑧** + **순수 함수**만 해당. **④⑥⑨~⑭ 미해당**(API 미경유). 단:

| 지점 | 작업 | 해당 |
|---|---|---|
| ① 폼 상태 | `installmentEnabled` / `installmentYears` / `installmentFutureRate`(+ `installmentFbMode`) | ✅ shared.ts FormState |
| ② initial | INITIAL_FORM에 기본값(`false`/`5`/`3.1`) | ✅ |
| ③ normalize | sessionStorage 호환 fallback | ✅ |
| ④ API 변환 | — | ❌ 미경유 |
| ⑤ UI 위젯 | Step4 입력 섹션 | ✅ |
| ⑥ 사이드바 합계 | — | ❌(세액 불변) |
| ⑦ 결과 카드 | InstallmentScheduleCard | ✅ |
| ⑧ validation | requestedYears 범위(1~10), 미래율 ≥0, 가업상속 ON 시 mode 필수 | ✅(클라이언트 한정) |
| ⑨~⑭ | — | ❌ |

> ⚠️ 3.1 아키텍처(API 미경유)가 뒤집히면(이력 영속 필요 등) ⑨~⑭ 전부 재평가.

---

## 8. 작업 순서 (PDCA Do — 엔진 선행 → UI)

1. **데이터** `installment-surcharge-rates.ts` 신규 + 연혁 시행일 KoreanLaw 재확인 동결.
2. **엔진** `calcInstallmentSchedule()` + `isInstallmentEligible()` **신규 추가**(일반 → 1천만원 단축 → 변동율 안분 → 가업상속분기). **기존 `calcInstallmentPayment` 보존**(증여세 G9). 인쇄 게이트는 `isInstallmentEligible`로 교체(인헤리턴스 L244 + 증여세 L255 — 증여세는 동작 동일성 회귀로 보존).
3. **anchor** `__tests__/tax-engine/inheritance/installment-payment.test.ts` INS-01~12 작성 → 실패 확보(Pre-Do anchor, `feedback_pre_anchor_verification`). 증여세 5년 카드 회귀 anchor 1건 추가(시그니처 보존 확인).
4. **폼** shared.ts ①②③ 필드(`installmentEnabled`/`installmentYears`/`installmentFutureRate`(+`installmentFbMode`)) + INITIAL_FORM + normalize + validateStep ⑧.
5. **UI 입력** Step4 끝(L644 직후) 섹션(⑤).
6. **결과** InstallmentScheduleCard 신규 + InheritanceTaxResultView L52~81 `InstallmentGuide` 제거·L567 교체·**L244 게이트 `isInstallmentEligible`로 교체**(⑦) + InheritanceTaxForm L453 호출에 폼 props 4개 배선.
7. **Check** `npx tsc --noEmit` 0 → `npx vitest run __tests__/tax-engine/inheritance/` + **증여세 회귀** `__tests__/tax-engine/gift/` → e2e(`e2e/*.spec.ts` 폼→계산→결과 표, `feedback_browser_verify_with_playwright`).
8. **회귀** `npm test` 전체(공유 모듈·증여세 공용 함수 영향).

---

## 9. 확인 필요 (Do 착수 전 사용자/시니어 확정)

- **확인 필요 ①** 가업상속 20년: 20년 균등(A·권장) / 10년거치+10년(B) / 토글(C) 중 택. → 기본 A로 진행 가능하나 명시 확정 권장.
- **확인 필요 ②** 해외거주 9개월 신고기한(§67④): 거주지 입력 필드 존재 여부 — 없으면 INS-12 보류(국내 6개월 고정)하고 후속.
- **확인 필요 ③** 가산금 회차 단위 절사 위치(소구간 합산 후 floor vs 소구간별 floor) — 사례 anchor로 동결.
- **확인 필요 ④** 아키텍처 3.1(API 미경유, 결과뷰 계산) 승인 — 이력 영속 요구 시 result 확장.
- **확인 필요 ⑤** §68② 분모 "총상속재산가액" ↔ `result.grossEstateValue`("상속재산가액 평가 후") 의미 일치 — 간주·추정상속 포함 범위 엔진 시니어 확인.
- **확인 필요 ⑥** 결합(가업+일반) 시 1천만원 단서 적용 단위(분별 vs 합산) — 1차는 분별 독립 가정.

---

## 10. 참고 — 검증에 사용한 자료

- KoreanLaw MCP: 상증법 §67·§71·§72(mst 276123), 상증령 §68·§69(mst 283637), 국기령 §43의3(mst 283623)
- 이미지 7장(교재 PDF): 연부연납기간·가업상속 범위·매년 납부 산식·가산금 산식·가산율 고시 연혁·일반 상속 세부담 계산사례(가/나)
- 현행 코드(실측):
  - `lib/tax-engine/credits/installment-payment.ts` — `calcInstallmentPayment()`(증여세 공용)
  - `components/calc/results/InheritanceTaxResultView.tsx` — InstallmentGuide 정의 L52~81 / 인쇄 게이트 L244 / 렌더 L567 / import L33
  - `components/calc/results/GiftTaxResultView.tsx` — calcInstallmentPayment import L20·사용 L75·L255·L507 (증여세 5년, 변경 금지)
  - `components/calc/InheritanceTaxForm.tsx` — InheritanceTaxResultView 호출 L453
  - `components/calc/inheritance/shared.ts` — FormState(L46 flat familyBusinessValue, L64 nested familyBusiness)·INITIAL_FORM·STEPS L128 / `steps.tsx` — Step4 L365~655(단기재상속 끝 L644)
  - result 타입: `inheritance-gift.types.ts` grossEstateValue L1005·familyBusinessDeduction L882 / `inheritance-family-business.types.ts` FamilyBusinessDeductionDetail.finalValue L215~
