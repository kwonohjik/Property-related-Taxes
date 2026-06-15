# 종합부동산세 — 재산세 감면율(조례 감면) 정식 지원 계획서

> PDCA Plan. 작성일 2026-06-15. 브랜치 `feat/cpt-test` (격리 worktree).
> 출처: 교재 제3편 종합부동산세 **사례2** "일반적인 1주택자(≠1세대1주택자)로 재산세 감면된 경우" (p.160~161).
> 엔진 시니어(`comprehensive-tax-senior`)·UI 시니어(`comprehensive-tax-ui-senior`) 병렬 분석 통합.

---

## 1. 배경·문제

지자체 조례에 의한 **재산세 감면비율**이 종부세 계산에 영향을 준다. 핵심 법령 원칙(교재 사례2 상단 박스):

1. **해당연도 종부세액 계산 시 감면비율은 공시가격에 적용** — 공시가격 × (1−감면율) 후의 공시가격 기준으로 계산.
2. 해당연도 재산세액은 감면전 재산세액 기준으로 세부담상한 적용 후, 산출된 재산세액에 감면비율 적용 → **감면후 실납부 재산세액**.
3. 종부세 세부담상한 계산 시 직전연도 재산세상당액·종부세상당액은 **직전연도 감면 여부와 무관하게 해당연도 감면비율을 적용**.

현재 엔진·UI에 감면율 입력 필드·로직이 **전무**(`comprehensive.types.ts` input·`comprehensive-tax.ts` 로직 grep 0건). 본 작업은 이를 정식 구현한다.

**v1 범위**: 주택분만. 종합합산·별도합산 토지 감면은 후속(리스크 R-6).

---

## 1.5 ★ Pre-Do anchor 환류 (2026-06-15 실측 — 본 섹션이 이후 본문보다 우선)

사례2 입력을 현행 엔진에 넣어 result를 덤프한 결과, **설계가 단순화됨**:

- **`imposedPropertyTax`(감면후 재산세 직접입력) 필드 폐기.** 입력은 **`reductionRate` 하나만**.
  - 근거: 엔진 `properties[].propertyTax = ptResult.determinedTax`(comprehensive-tax.ts:183)가 **세부담상한까지 적용된 결정세액**이며, 사례2에서 1,770,000(=교재 "세부담상한후 재산세")과 정확히 일치. 직전연도도 `previousYearEquivalent.propertyTaxEquiv = 1,530,000`(=교재 감면전)으로 정확.
  - → ②ⓐ = `propTax × (1−rate)`, ④나① = `propertyTaxEquiv × (1−rate)` **자동 도출**.
- **감면율 하나로 4지점 전부 자동 연쇄**:
  - A(①·②ⓒ): `effectiveIncluded = Σ floor(assessedValue × (1−rate))`
  - B(②ⓐ): `totalPropertyTaxAmount += floor(propTax × (1−rate))`
  - C(④나①): `propertyTaxEquiv × (1−rate)`
  - D(④나②): `previousYearAuto.assessedValue × (1−rate)` → detail 연쇄
- **현행 드리프트 실측**: ① 1,440,000(미감면) vs 540,000 / ⑤ 864,000 vs 294,923.
- **result 필드명 전부 확정**(추정 제거): `taxBase`·`calculatedTax`·`taxAfterPropertyCredit`·`taxBeforeCap`·`determinedHousingTax`·`properties[].propertyTax` / `propertyTaxCredit.{totalPropertyTax,propertyTaxBase,comprehensiveTaxBase,ratio,creditAmount}` / `taxCap.{capAmount,cappedTax,isApplied}` / `previousYearEquivalent.{propertyTaxEquiv,comprehensiveTaxEquiv,total,detail.{assessedValue,taxBase,calculatedTax,stdTaxNumerator,stdTaxDenominator,creditAmount}}`.
  - ⚠ ②ⓐⓑⓒⓓ ↔ result 매핑: ⓐ=`propertyTaxCredit.totalPropertyTax`, ⓑ=`comprehensiveTaxBase`, ⓒ=`propertyTaxBase`, ⓓ=`creditAmount`.
- 따라서 §3의 B행 "사용자 입력" 및 §4.1 `imposedPropertyTax`, §5/§7의 관련 항목은 **모두 폐기** — 감면율 단일 필드로 대체.

---

## 2. 사례2 데이터 + anchor (동결 — PDF 직접 확인 + 손계산 교차검증 완료)

### 입력
- 납세자: 일반 1주택자(1세대1주택자 아님 → 고령자·장기보유 공제 없음). 2022 귀속, 기본공제 6억.
- 주택공시가격: '22년 **10억**, '21년 **9억**
- 재산세 감면율: '22년 **25%**, '21년 25%
- 감면후 실납부 재산세: '22년 **1,327,500**, '21년 **1,147,500**
- 종부세 FMR '22=60%·'21=95%, 재산세 공정시장가액비율 60%, 종부세율 0.6%, 세부담상한 150%, 탄력세율 없음.

### anchor (원단위, `toBe()` 고정)

| 칸 | 값 | 산식 |
|---|---|---|
| **① 재산세공제전 종부세액** | **540,000** | (10억×0.75=7.5억 − 6억) × 60% × 0.6% |
| 과세표준 | 90,000,000 | (7.5억 − 6억) × 60% |
| ②ⓐ 해당연도 재산세(감면후) | 1,327,500 | **사용자 직접 입력** |
| ②ⓑ 표준세율재산세액(종부세 과표분) | 216,000 | 9천만 × 60% × 0.4% |
| ②ⓒ 총표준세율재산세액 | 1,170,000 | **7.5억(감면후)** × 60% × 0.4% − 63만 |
| **②ⓓ 공제할 재산세액** | **245,077** | 1,327,500 × 216,000 / 1,170,000 |
| **③ 세부담상한 적용전** | **294,923** | ① − ② |
| ④가 해당연도 총세액상당액 | 1,622,423 | ②ⓐ + ③ |
| ④나① 직전 재산세상당액 | 1,147,500 | 표준세율 1,530,000 × (1−25%) |
| ④나②ⓐ 직전 종부세액 | 427,500 | 과표 71,250,000(=(6.75억−6억)×95%) × 0.6% |
| ④나②ⓑ 직전 공제할 재산세 | 198,205 | 1,147,500 × 171,000 / 990,000 |
| ④나② 직전 종부세상당액 | 229,295 | 427,500 − 198,205 |
| ④나 직전 총세액상당액 | 1,376,795 | 1,147,500 + 229,295 |
| ④다 세부담상한액 | 2,065,193 | 1,376,795 × 150% (※반올림 — 아래 함정) |
| **④ 세부담상한 초과** | **0** | 가 1,622,423 ≤ 다 2,065,193 |
| **⑤ 납부할세액** | **294,923** | ③ − ④ |

**함정(1원)**: ④다 = 1,376,795 × 1.5 = 2,065,192.5. 교재는 반올림 **2,065,193**, floor 시 2,065,192. 이 사례는 ④ 초과가 0이라 ⑤에 영향 없으나, ④다를 anchor로 검증할 땐 반올림 방식 일치 필요(1원 tolerance 정책 / `bigint-round-half-up`).

**검증 완료**: 위 모든 값을 Python 손계산으로 교차검증 — ⑤ 294,923까지 전부 일치(④다 1원 제외).

---

## 3. 감면 작용 지점 — 4곳 + ⓐ 처리 (엔진 시니어 실측)

| 지점 | 현행 코드 | 감면 처리 | 연쇄 여부 |
|---|---|---|---|
| **A. ①·②ⓒ 분모** | `comprehensive-tax.ts:204-205` `includedAssessedValue` | `effectiveIncluded = Σ(assessedValue × (1−rate))` 신설 → 과세표준·②ⓒ에 사용 | **단일 변수 변환 1회로 ①·②ⓒ 동시 해결** |
| **B. ②ⓐ 부과 재산세** | `comprehensive-tax.ts:173-191` `calculatePropertyTax()` 자동계산 | **사용자 직접 입력** `imposedPropertyTax`(조례 감면은 DB에 없어 자동계산 불가) | 별도 입력 |
| **C. ④나① 직전 재산세상당** | `comprehensive-prior-year.ts:67-73` | 표준세율 재산세 산출 **결과에 × (1−rate)** (assessedValue를 줄이는 게 아님) | 후 곱 |
| **D. ④나② 직전 종부세상당** | `comprehensive-prior-year.ts:49-56` | `auto.assessedValue × (1−rate)` 변환 후 과표·분모 산정 | 변환 후 전달 |

**핵심 설계 결정**:
- **감면율 ≠ 단일 지점**. 최소 2개 독립 변환(당해 `effectiveIncluded` + 직전연도 변환) + ⓐ 사용자 입력.
- **C/D의 직전연도 감면율은 "해당연도 감면율"을 사용**(법령 원칙3). `PreviousYearAutoInput.reductionRate`에 해당연도 값을 넣음.
- 합산배제 요건 판정은 **원공시가격** 사용(법 취지), 과세표준만 **감면후 공시** 사용 → 엔진에서 두 값 분리(R-5).

---

## 4. 설계 — 타입·엔진·result

### 4.1 input 타입 (`lib/tax-engine/types/comprehensive.types.ts`)
```ts
// ComprehensiveProperty (line ~201)
reductionRate?: number;        // 0~1. 25% → 0.25. 미입력=감면 없음. 과세표준용 감면후 공시 = assessedValue×(1−rate)
imposedPropertyTax?: number;   // 원. 감면후 실납부 재산세(②ⓐ). 미입력 시 calculatePropertyTax() 자동계산 유지

// PreviousYearAutoInput (line ~309)
reductionRate?: number;        // 직전연도 자동계산용 — 해당연도 감면율 적용(법령 원칙3)
```

### 4.2 엔진 로직 (`comprehensive-tax.ts`, `comprehensive-prior-year.ts`)
- Step1 루프: `effectiveAssessedValue = rate>0 ? floor(assessedValue×(1−rate)) : assessedValue`. `totalAssessedValue`(원, echo)와 `effectiveIncludedAssessedValue`(과세표준용) 분리.
- Step2/4: 과세표준 산정에 `effectiveIncludedAssessedValue` 사용.
- Step6 ②ⓒ 분모: `calcHousingTax(effectiveIncluded × propertyFMR)` 사용(R-2). ②ⓐ는 `imposedPropertyTax ?? 자동계산`.
- Step8/prior-year: C는 후 곱, D는 `auto.assessedValue×(1−rate)` 변환.
- **800줄 정책**: 현재 591줄 + ~30줄 → 한계 내. (위반 시 helpers 분리)

### 4.3 result echo (`ComprehensiveTaxResult`)
- `effectiveIncludedAssessedValue?: number` (감면후 과세 공시 = 부표3 ③칸)
- `totalAssessedValue` (감면전 원공시 — 납세자 확인용, 이미 존재 여부 확인)
- `propertyTaxCredit.reductionRates?: number[]` (결과 카드 표시용)
- ⚠ anchor 작성 시 실제 result 필드명(`calculatedTax`·`taxBase`·`propertyTaxCredit.*`·`previousYearEquivalent.*`·`determinedHousingTax`) **존재 여부 grep 확인 필수** — 시니어 인용은 미검증.

---

## 5. 14개 동기화 지점

### 클라이언트 (UI 시니어)
| # | 위치 | 작업 |
|---|---|---|
| ① FormData | `comprehensive-wizard-store.ts` `PropertyEntry`(~line15-50) | `reductionRate: string` + `imposedPropertyTax: string` |
| ② initial | 동 `makeProperty()`(~144-176) | `""` 초기값 |
| ③ normalize | 동 `onRehydrateStorage`(~390-428) | `?? ""` 복원 가드 |
| ④ API 변환 | `lib/calc/comprehensive-api.ts`(106-172) | `reductionRate: parseDecimal(...)/100 || undefined`, `imposedPropertyTax: parseAmount(...)`. previousYearAuto에도 reductionRate |
| ⑤ UI 위젯 | `components/calc/PropertyListInput.tsx` 공시가격 직후(~155-170) | ToggleCard(sky) + DecimalInput(감면율%) + CurrencyInput(감면후 재산세). hint, placeholder 숫자 금지 |
| ⑥ 사이드바 | 해당 없음 (종부세 마법사 사이드바 미구현) | — |
| ⑦ 결과 카드 | `HousingPayableTaxCalcCard.tsx` Step1(~86-97) | "원공시 ×(1−감면율)=감면후 공시" bullet(rate>0 조건부) + 부표3 ③ 정합 |
| ⑧ validation | `comprehensive-api.ts` `validateLandParcels` 패턴 / Zod | 0~1 범위. UI 통과↔Zod 차단 모순 금지. 미입력=0 fallback 3중 일치 |

### API/Route (엔진 시니어)
| # | 위치 | 작업 |
|---|---|---|
| ⑨ Zod 메인 | `lib/validators/comprehensive-input.ts:142-203` | `reductionRate: z.number().min(0).max(1).optional()`, `imposedPropertyTax: z.number().min(0).optional()` |
| ⑩ Zod previousYearAuto | 동(359-372) | `reductionRate` 추가 |
| ⑪ 자산수준 fallback | 해당 없음(optional) | — |
| ⑫ Zod 입력객체 | ⑨로 커버(per-property 도달) | — |
| ⑬ API body spread | `comprehensive-api.ts` | properties·previousYearAuto 매핑 |
| ⑭ Route 엔진 input | `app/api/calc/comprehensive/route.ts` `toEngineInput()`(~80-92) | pass-through(숫자, Date 변환 불요) |

---

## 6. anchor 테스트

### Pre-Do (Do 진입 전 우선 실행 → 현행 어긋남 실측, 정책 `pre-do-anchor-verification`)
`__tests__/tax-engine/comprehensive-case2-anchor.test.ts` — 사례2 입력(감면율 미적용 현행)으로:
- `calculatedTax` 기대 540,000 (현행 미감면 1,440,000 → **실패해야 정상**)
- `creditAmount` 245,077, `determinedHousingTax` 294,923 → 실패 예상
→ 실패 메시지로 드리프트 규모 실측 후 설계 환류. **result 필드명 실재 확인 동시 수행.**

### 구현 후 (CASE2-A1~A5, 중간값+최종 toBe())
A1 과표 90,000,000 / A2 ① 540,000 / A3 ②ⓑ216,000·ⓒ1,170,000·ⓓ245,077 / A4 ④가1,622,423·나1,376,795·상한 미초과 / A5 ⑤ 294,923.
- ②ⓐ는 `imposedPropertyTax: 1,327,500` 입력으로 주입.
- previousYearAuto: `assessedValue 900,000,000` + `reductionRate 0.25`.

---

## 7. 리스크·미해결

- **R-1 ②ⓐ 처리(최대 결정)**: 방안 A 채택 — `imposedPropertyTax` 직접 입력(미입력 시 자동계산 유지). 방안 B(자동×(1−rate))는 세부담상한 영향으로 부정확 → 기각.
- **R-2 ②ⓒ 분모**: `includedAssessedValue` → `effectiveIncluded`로 교체 필요.
- **R-3 ④나① 후 곱 검증**: 교재 1,530,000×(1−25%)=1,147,500 → "표준세율 산출 후 × (1−rate)"가 정답(assessedValue 축소 아님). prior-year `propertyTaxEquiv`에 적용.
- **R-4 연도 파라미터**: 감면율은 `getComprehensiveParams(year)`와 독립 → 충돌 없음. 직전연도는 `currentYear-1` 파라미터 자동.
- **R-5 합산배제 분리**: 합산배제 요건 판정=원공시, 과세표준=감면후 공시. 엔진 내 두 값 분리.
- **R-6 토지 감면**: v1 제외. 주택분만.
- **R-7 직전연도 자동모드 충돌(UI)**: 자동모드 + 감면율 조합 시 직전연도에 해당연도 감면율 적용. UI 안내 또는 직접입력 강제 검토.
- **다주택 per-property**: `effectiveIncluded = Σ(각 주택 effectiveAssessedValue)`. §8④ 안분 분자도 effective 기반.
- **부부공동명의(§10의2)·세액공제**: 과세표준 이후 단계 → 충돌 없음.

---

## 8. 작업 순서 (Do — 시퀀셜: 엔진 먼저, UI 후)

1. **Pre-Do anchor** 작성·실행(현행 실패 확보 + result 필드명 확인).
2. **엔진**: 타입(4.1) → 헬퍼/로직(4.2, A·B·C·D) → result echo(4.3) → ⑨⑩⑬⑭ → CASE2-A1~A5 anchor green.
3. **UI**: ①②③⑤⑦⑧ → 위젯·결과 카드·validation.
4. **검증**: `npx tsc --noEmit` 0 / `npx vitest run __tests__/tax-engine/comprehensive*` / 종부세 전체 회귀 / E2E 사례2 spec / 브라우저 수동(3003).
5. `ui-engine-sync-checker` + `gap-detector`.

---

## 9. 자가 점검 (착수 전)
- [x] 케이스 anchor 손계산 교차검증(④다 1원 함정 기록)
- [ ] Pre-Do anchor로 result 필드명 실재 확인
- [ ] 14지점 ⑫⑬⑭ grep 자가점검
- [ ] API fallback ↔ validation 동기화(⑧)
- [ ] 다른 세션(상속·증여·양도)과 파일 비충돌 — 종부세 전용이라 격리 확인
