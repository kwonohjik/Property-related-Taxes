# 부동산 무상사용·담보이용 증여이익 (§37) 보완 계획서

> 대상: "증여로 보는 경우" 탭(`/calc/gift-deemed`) > **부동산 무상사용**(`free_realestate`)
> 작업 워크트리: `feat/gift-free-realestate-supplement` (origin/master 분기, slot 1 · dev 3001 / e2e 3101)
> 근거 교재: 「2026 양도·상속·증여세」 제8편 — 부동산무상사용이익/담보이용이익 계산방법 + 계산사례(첨부 이미지 1~4)

---

## 0. 검증 기준 준수 선언

본 계획서의 모든 법령 인용·산식·anchor·file:line은 **추정 금지** 원칙(CLAUDE.md 검증 기준)에 따라 실측한다.
- 법령: KoreanLaw MCP로 상증법 본칙(mst=276123)·시행령(mst=283637) 본문 직접 조회 후 인용.
- 현행 코드 상태: 워크트리 실파일 grep으로 확인한 file:line만 기재.
- anchor: 첨부 이미지4 교재 예제값 + 정수경로(`node -e`) 실증.
- **미검증 1건**(§81⑨2호 가목 계산식 MCP 미렌더)은 §6에 "확인 필요"로 명시.

---

## 1. 배경 — 현재 §37 구현 상태 (실측)

`lib/tax-engine/gift-deemed/free-realestate-use.ts` `calcFreeRealEstateGift()` 가 §37①(무상사용)·②(담보이용)의 **단일 기간 기본 계산을 이미 정확히 구현**.

| 항목 | 현재 구현 | 검증 |
|---|---|---|
| §37① 연간이익 = 부동산가액×2% | `applyRateFraction(pv, 2, 100)` (`:24`) | ✓ |
| §37① 5년 현가합 = Σ floor(연이익×10ⁿ/11ⁿ) | `safeMultiplyThenDivide` 루프 (`:26-29`) | ✓ image4: 5,000,000,000 → **379,078,675** 일치 |
| §37① 기준금액 1억 | `FREE_USE_THRESHOLD=100_000_000` | ✓ 시행령 §27④ |
| §37② 차입이익 = 차입금×4.6%−실제이자 | `applyRateFraction(loan,46,1000)−interest` (`:54-55`) | ✓ 시행령 §27⑤ |
| §37② 기준금액 1천만 | `FREE_LOAN_THRESHOLD=10_000_000` | ✓ 시행령 §27⑥ |
| §37③ 비특수+정당사유 → 비적용 | `_fail()` (`:17-19`) | ✓ |

> **결론: 기본 계산은 보완 불필요.** 본 계획은 아래 **미구현 갭 3건**만 다룬다.

---

## 2. 첨부 이미지 분석 + 법령 검증

### 이미지 1·2 — §37① 무상사용 (상증령 §27③)
- 무상사용 기간 = **5년**. **5년 초과 시 5년이 되는 날 다음 날에 새로 무상사용 개시한 것으로 간주** → 재계산·재과세(상증령 §27③ 후단, 상증통 37-27…2).
- 간편식 = 부동산가액 × 2% × **3.79079**(5년 연금현가계수). → 현재 루프 정수경로와 동치.

### 이미지 3 — §37② 담보이용 (상증령 §27⑤)
- 차입기간 미정 시 **1년**. **1년 초과 시 1년이 되는 날 다음 날에 새로 담보이용 개시한 것으로 간주**(상증령 §27⑤ 후단).
- 적정이자율 4.6%(상증칙 §10의5, 2016.3.21. 이후). 1천만 미만 과세제외.

### 이미지 4 — 계산사례 (경정청구)
- 2020.3.15. 모(母) 토지(50억) 위 자(子) 건물 신축·무상사용 → 모 2023.7.20. 사망.
- 증여재산가액 = 50억×2%×3.790787 = **379,078,675**(현가합).
- 증여세 산출세액 = (379,078,700−50,000,000)×20%−10,000,000 = **55,815,740**.
- **경정청구 세액 = 55,815,740 × 20개월(2023.7.20.~2025.3.15.) / 60개월 = 18,605,246**.
  - 정수경로 `floor(55815740×20/60)=18,605,246` ✓.

### 법령 검증 결과 (KoreanLaw 실측)
| 조문 | 검증 내용 |
|---|---|
| 상증법 §37①②③④ | 무상사용·담보 증여, 비특수 정당사유 한정(③), 계산방법 위임(④) |
| 상증령 §27③ | "무상사용 기간 5년, **5년 초과 시 5년 다음 날 새로 개시 간주**" ✓ |
| 상증령 §27⑤ | "차입기간 1년, **1년 초과 시 1년 다음 날 새로 개시 간주**" ✓ |
| 상증령 §27④/⑥ | 기준금액 1억 / 1천만 ✓ |
| **상증법 §79②1호** | **§37 증여세 결정·경정받은 자가 부동산무상사용기간 중 부동산을 상속·증여받거나 무상사용하지 않게 된 경우 → 사유발생일부터 3개월 내 경정청구** |
| **상증령 §81⑤** | "부동산무상사용기간"=§27③후단(5년) **및 §27⑤후단(1년)** → **§37②(담보)도 §79②1호 경정청구 대상** |
| **상증령 §81⑥** | 경정 인정사유: 1호 부동산소유자 토지 양도 / 3호 **부동산소유자 사망** / 4호 유사사유로 무상사용 못하게 된 경우 |
| **상증령 §81⑨** | 경정세액 = **①증여세산출세액(§57 할증 포함) × ②비율**. 월수는 역산, **1개월 미만 일수는 1개월**로 본다. |

---

## 3. 갭 분석 (보완 대상 3건 — 사용자 확정 범위)

| # | 갭 | 근거 | 현재 | 비고 |
|---|---|---|---|---|
| **G1** | **경정청구 세액 계산** | §79②1호·시행령§81⑨ | 전무 (grep 0건) | 이미지4 핵심 |
| **G2** | **무상사용 5년 초과 다기간 재과세** | §37①·시행령§27③후단 | 단일 5년 window만 | 5년 단위 N개 증여 |
| **G3** | **담보이용 1년 초과 다기간** | §37②·시행령§27⑤후단 | 단일 1년만 | 1년 단위 N개 증여 |

> 제외(사용자 미선택): 비특수관계인 정당사유 정교화.
> 범위 밖(별도 기능): 시행령 §27② **수인 공동 무상사용**(실제 사용면적 불분명 시 동일면적 안분·대표사용자 판정) — 본 보완 미포함, 단일 무상사용자 전제.

---

## 4. 케이스 매트릭스 (전수 enumerate)

### G2 무상사용 다기간
| 케이스 | 입력 | 기대 |
|---|---|---|
| U-1 | 사용기간 ≤5년 | 기존과 동일(window 1개) — **회귀 0** |
| U-2 | 사용기간 5년 초과~10년 | window 2개, 각 별도 증여일(개시일 / 개시+5년+1일), 각 1억 기준 독립 |
| U-3 | window별 부동산가액 재평가(상이) | 각 window 증여일 기준 §4장 평가가액 별도 적용 |
| U-4 | window 1은 ≥1억, window 2는 <1억 | window별 독립 적용/배제 |

### G3 담보 다기간
| 케이스 | 입력 | 기대 |
|---|---|---|
| C-1 | 차입기간 ≤1년 | 기존과 동일 — **회귀 0** |
| C-2 | 차입기간 1년 초과 | 1년 단위 window N개, 각 1천만 기준 독립 |

### G1 경정청구
| 케이스 | 입력 | 기대 |
|---|---|---|
| R-1(image4) | 산출세액 55,815,740 / 증여일 2020.3.15 / 사망 2023.7.20 / 무상사용 | 18,605,246 (20/60) |
| R-2 | 중단일 = 만료일 이후 | 잔여월수 0 → 경정세액 0 (환급 없음) |
| R-3 | 중단일 ~ 만료일 = 정확히 N개월 + 일부일 | 1개월 미만 일수 → +1개월 |
| R-4 | 담보(§37②) 중단 | 분모 = 12개월 (**§6 확인 필요**) |

---

## 5. 엔진 설계

> 원칙(CLAUDE.md): 정수연산 `Math.floor`·`safeMultiplyThenDivide`, `Math.round` 금지. 순수함수. 기존 단일기간 경로는 **그대로 유지**(회귀 0)하고 다기간·경정은 **분기 추가**.
> **날짜 직렬화**: 증여세 도메인은 날짜를 **ISO 문자열**로 다룸 → `date-coerce` N/A(memory `project_gift_deemed_transfer_plan` ⑭). 엔진은 문자열을 `new Date()`/date-fns(`differenceInMonths`·`addMonths`·`addYears`, 4.1.0)로 파싱.
> **result 직렬화**: `periodBreakdown`은 **plain 배열**, `rectification`은 **plain 객체** — `Map` 금지(memory `feedback_engine_result_map_json_loss`: Map은 `NextResponse.json`에서 `{}`로 소실).

### 5.1 타입 확장 (`gift-deemed/types.ts` `FreeRealEstateInput` `:109`)
```ts
export interface FreeRealEstateInput {
  subType: "free_use" | "collateral";
  propertyValue?: number;          // free_use 단일기간 (기존)
  loanAmount?: number;             // collateral 단일기간 (기존)
  actualInterestPaid?: number;     // (기존)
  isRelatedParty: boolean;
  hasJustifiableReason?: boolean;
  // ── G2/G3: 다기간 (optional, 미입력 시 기존 단일기간 경로) ──
  periods?: FreeUsePeriod[];       // 입력 시 다기간 모드
  // ── G1: 경정청구 (optional) ──
  rectification?: RectificationInput;
}

export interface FreeUsePeriod {       // window별 별도 증여
  startDate: string;                   // 이 window 무상사용/담보 개시일(=증여일)
  propertyValue?: number;              // free_use: window 증여일 기준 §4장 평가가액
  loanAmount?: number;                 // collateral
  actualInterestPaid?: number;         // collateral
}

export interface RectificationInput {
  giftTaxCalculated: number;           // 증여세 산출세액(§57 할증 포함) — 직접입력
  giftDate: string;                    // 당초 증여일(=무상사용/담보 개시일)
  terminationDate: string;             // 중단사유 발생일(사망·양도일 등)
  // 분모(기간월수)는 subType으로 결정: free_use=60, collateral=12
}
```

### 5.2 결과 확장 (`DeemedGiftResult`)
```ts
periodBreakdown?: FreeUsePeriodResult[];   // window별 증여일·평가액·현가합/차입이익·적용여부 (※ isFuture 미포함 — 엔진은 "오늘"을 모르는 순수함수. 예정 여부는 결과뷰가 증여일 표시로 안내)
rectification?: {                          // 경정청구
  giftTaxCalculated: number;
  remainingMonths: number;                 // 역산 월수(1개월 미만→1)
  totalMonths: number;                     // 60(무상) / 12(담보)
  refundableTax: number;                   // floor(산출세액 × 잔여월수/기간월수) — "경정청구 가능 세액"(중립, "환급" 단정 금지)
};
```

### 5.3 산식

**G2 무상사용 다기간** — `periods` 입력 시 각 window를 **기존 단일계산 함수에 재위임**(현가합 + 1억 기준 독립 판정). window별 증여일은 `startDate`(없으면 첫 개시일+5년·n 자동 도출).
> ⚠️ **합산 금지(Critical)**: 각 window는 **별개 증여일의 별개 증여** → 합산하면 누진세율로 세액 과대. `deemedGiftValue`(세액연결 단발주입)는 **첫 '적용' window만**(현재 증여), 나머지는 `periodBreakdown` 표로 조망(개별 증여 — 각자 마법사 산정). 1억 기준·증여세는 window별 독립.
> **시맨틱 명확화**: 다기간 모드는 "총 무상사용기간이 확정·예정되어 **전체 기간 증여세를 한 번에 조망**"하는 용도. window 2+의 증여일이 **미래**(아직 5년 미경과)이면 그 시점 도래 시 별도 신고 대상임을 결과뷰에 안내(예정 표시). 본 도구는 산정만 하고 신고 시기는 판단하지 않는다.

**G3 담보 다기간** — 동일 구조, 1년 단위, 1천만 기준 독립.

**G1 경정청구** (`rectification` 입력 시):
```
totalMonths   = subType==="free_use" ? 60 : 12
expiryDate    = giftDate + (free_use ? 5년 : 1년)
remainingMonths = monthsBetween(terminationDate, expiryDate)   // 역산, 1개월 미만 일수=1개월, 음수→0
refundableTax = floor(giftTaxCalculated × remainingMonths / totalMonths)
```
- `monthsBetween`: date-fns `differenceInMonths` 후 잔여일 있으면 +1 (단, terminationDate ≥ expiryDate → 0). **부동소수 금지, 정수 월수.**
- 정수경로: `safeMultiplyThenDivide(giftTaxCalculated, remainingMonths, totalMonths)` 또는 `Math.floor(a×b/c)`.

---

## 6. ⚠️ 미검증 / 확인 필요

- **§81⑨2호 가목 계산식 본문 미렌더**: KoreanLaw 조회 시 "다음의 계산식에 따라 계산한 비율"로 표시되고 산식 박스(별표/이미지)가 텍스트로 안 옴.
  - **무상사용 분모 60개월**: 이미지4(20/60=18,605,246)로 **실증 완료** → 확정.
  - **담보(§37②) 분모 12개월**: §81⑤가 §27⑤후단(1년)을 포함하므로 **12개월로 추론**하나 이미지 예제 없음 → **Do 진입 전 법제처 별표/PDF 캡처로 동결 권장**(memory `feedback_pdf_table_row_one_to_one_mapping` 패턴). R-4 anchor는 캡처 확정 후 작성.
- **분자(잔여월수) 기산점**: 이미지4에서 `사망일(2023.7.20) ~ 당초 만료일(2025.3.15)`. "무상사용을 하지 않게 된 기간"으로 해석 → 만료일에서 차감 아닌 **중단일~만료일 직접 산출**. 실증 완료.

---

## 7. 동기화 지점 (deemed-gift 8지점 — 실측 경로)

| # | 지점 | 파일 | 작업 |
|---|---|---|---|
| ① 폼상태 | `freePeriods`·`rectXxx` 필드 추가 | `components/calc/deemed-gift/shared.tsx:84-91` | G1/G2/G3 입력 |
| ② initial | `shared.tsx:236-241` | 기본값(다기간 OFF·경정 빈값) |
| ③ UI 위젯 | `FreeRealEstateFields` `shared.tsx:702` | 다기간 토글(3-state)·경정 섹션. **날짜=`DateInput`(type="date" 금지)·금액=`CurrencyInput`·입력 select-on-focus**(memory `feedback_date_input`) |
| ④ Zod ⑫ | `lib/validators/gift-deemed-input.ts:57-64, 235-248` | **⚠️ Critical 침묵 strip**: `freeRealEstateSchema`(explicit z.object)는 미정의 키 제거 → `periods: z.array(z.object({startDate,propertyValue,loanAmount,actualInterestPaid}).partial()).optional()` + `rectification: z.object({giftTaxCalculated,giftDate,terminationDate}).optional()` **반드시 추가**(없으면 Zod가 strip, TS 미감지) + superRefine(다기간 빈배열·경정 필수값) |
| ⑤ API ⑬ | `lib/calc/gift-deemed-api.ts:66-74` | **⚠️ Critical 침묵 strip**: explicit object 반환 → `periods`·`rectification`을 **명시 매핑 추가**(누락 시 form 입력이 input 미도달, TS 미감지. memory `feedback_explicit_prop_mapping_strip`) |
| ⑭ Route | `app/api/calc/gift-deemed/route.ts:58` | **pass-through**(`parsed.data` 직접 → `calcDeemedGift`) → ⑫ Zod 충족 시 자동 도달. 무변경 |
| ⑥ validate | `lib/calc/gift-deemed-validate.ts:41-48` | 다기간·경정 필수값 검증(UI↔validate 동기). **다기간 ON인데 window 0개([]) → "기간을 1개 이상 추가하세요" 차단**(자동 fallback 금지 `feedback_no_silent_apportion_fallback`). 경정 ON → 산출세액>0·증여일·중단일 필수 |
| ⑦ 결과뷰 | `components/calc/results/DeemedGiftResultView.tsx` | window 표(증여일·평가액·현가합·적용여부) + 경정청구 카드. window 표 하단 **"각 기간은 해당 증여일 도래 시 별도 신고 대상" 정적 안내**(미래 window 예정 — 엔진 계산 아님). **숫자 끝 "원" 미표기**(`feedback_no_won_suffix`)·**금액 우측정렬 font-mono tabular-nums**(skill `amount-column-align`)·내부 id 노출 금지 |
| ⑧ 엔진/타입/라우터/상수 | `free-realestate-use.ts`·`types.ts`·`router.ts:34`·`data/gift-deemed-rates.ts` | 산식·타입·anchor |

> **Do 자가점검 grep(강제)**: `grep -n "periods\|rectification" lib/validators/gift-deemed-input.ts lib/calc/gift-deemed-api.ts` → ⑫⑬ 양쪽 모두 hit 확인(둘 다 explicit strip 지점). E2E Network 탭 request body에 신규 필드 도달 확인.
> deemed-gift는 단일페이지 계산기(`DeemedGiftCalculator`)라 양도세 14지점 중 사이드바·initial-normalize 일부 N/A. **3-state 토글**(memory `feedback_three_state_optional_mode_toggle`): `periods` = `undefined`(단일) / `[]`(다기간 ON 빈) / `[...]`. **UI display fallback ↔ API ↔ validate 3중 일치**(mirror-pattern).

---

## 8. anchor (Pre-Do 우선 작성 — memory `feedback_pre_anchor_verification`)

| ID | 입력 | 기대값 | 출처 |
|---|---|---|---|
| FRE-MULTI-1 | 무상사용 부동산가액 50억, 사용 10년(window 2개, 동일 평가액) | window1=379,078,675 · window2=379,078,675 | 현가합×2 |
| FRE-MULTI-2 | window1 ≥1억, window2 부동산가액 1.2억(<1억 미달) | window2 적용 배제(현가합 **9,097,887**<1억) | 1억 기준 독립 (실측✓) |
| RECT-1(image4) | 산출세액 55,815,740 / 증여일 2020.3.15 / 중단 2023.7.20 / free_use | **18,605,246**(20/60) | 이미지4 (실증✓ date-fns 4.1.0) |
| RECT-2 | 중단일 2025.4.1 ≥ 만료일 2025.3.15 | 0 | 잔여 0(음수→0) |
| RECT-3 | 증여일 2020.1.10 / 중단 2024.6.5 → 잔여 만료(2025.1.10)까지 7개월+5일 | 8/60 비율 (1개월 미만 일수→1개월) | 월수 역산 검증 |
| COL-MULTI-1 | 차입금 10억, 차입 2년(window 2개) | 각 4,600만(>1천만 적용) | §27⑤후단 |
| COL-RECT-1 | (담보 경정) | **§6 캡처 후 확정** | 보류 |

> **Pre-Do 게이트**: RECT-1·FRE-MULTI-1을 가장 먼저 작성·실행하여 실패 확보 → 설계 환류 후 Do.

---

## 9. Phase 분할

- **Phase A — G1 경정청구 (free_use 한정)**(독립·이미지4 핵심): 타입 `RectificationInput`/결과 + 엔진 분기(분모 60) + RECT-1~3 anchor + UI 경정 섹션(산출세액 직접입력·중단일) + 결과 카드. 8지점 배선. **담보(§37②) 경정은 분모(12) 미검증이므로 Phase A 제외 → Phase C.**
- **Phase B — G2 무상사용 다기간**: `periods` 타입 + window 루프(기존 단일계산 재위임) + FRE-MULTI-1·2 anchor + 다기간 토글 UI + window 표.
- **Phase C — G3 담보 다기간 + 담보 경정**: B 구조 재사용(1년·1천만) + COL-MULTI-1. **담보 경정(분모 12)은 §6 별표 캡처로 분모 동결 후** COL-RECT-1 anchor 작성 → 확정 시 활성, 미확정 시 담보 경정 UI 비활성 출시.

> 각 Phase: anchor green → tsc 0 → lint 0 → `npx vitest run __tests__/tax-engine/gift-deemed/` → E2E(`E2E_PORT=3101`) → 커밋.

---

## 10. 리스크 / 결정 필요

1. **경정청구 산출세액 소스**: 본 도구 1차 산출물은 증여재산가액(세액은 기존 증여세 마법사 이관). 경정청구는 산출세액 필요 → **직접입력 방식 채택**(Simplicity First, calcGiftTax 결합 회피). 라벨 "증여세 산출세액(세대생략 할증 포함, §57)" 명시.
2. **다기간 증여세 합산**: window별 별도 증여일 → 10년 합산·증여공제는 window 간 영향. 본 도구는 **window별 증여재산가액 산출까지**, 세액·합산은 기존 마법사 책임(범위 밖 명시).
3. **§37② 담보 경정 분모(12월)**: §6 미검증 → Phase C에서 캡처 동결 후 anchor 확정. 미확정 시 담보 경정 UI 비활성 출시.
4. **회귀 0 보장**: `periods`/`rectification` 미입력 시 기존 단일기간 경로 그대로 → U-1·C-1 회귀 테스트로 고정.
