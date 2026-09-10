# lint warning 342건 — 실측 분해와 정리 계획

> 작성 2026-09-11. 기준 커밋 `6586206f`(PR #1576 머지 직후).
> 모든 수치는 `npx eslint . --format json` **1회 실행 결과의 집계**다(추정 없음).
> 재현: `npx eslint . --format json > lint.json` 후 이 문서 §1의 집계 스크립트.

## 0. 한 줄 요약

342건은 성격이 셋으로 갈린다:

| | 건수 | 성격 |
|---|---|---|
| **기계적 정리** | **306** | 미사용 import·죽은 상수·`_` 관용 표기·불필요한 disable |
| 🔴 **조사 대상** | **27** | **만들어 놓고 쓰지 않는다** — 값 8 + 죽은 함수 17 + `_` 후보 3 − 중복 1. 삭제하면 누락 로직을 덮는다(§4) |
| **개별 판단** | **9** | `exhaustive-deps` — 고치면 동작이 바뀔 수 있다(§6) |

> 🔴 **초판은 조사 대상을 8건으로 적었다.** 「값을 할당하고 안 쓴다」 축만 보고
> 「함수를 선언하고 안 부른다」 축을 놓쳤다 — 자가검토에서 17건이 더 나왔다(§4).
>
> ✅ **자가검토에서 판정한 것들은 전부 α·β였다 — γ(엔진 결함) 0건**(V-2~V-6 · D-3).
> 남은 미판정은 D-1의 8건이다. 조사가 필요하다는 결론은 유지되지만,
> **「세액 결함이 숨어 있다」를 전제로 삼지 않는다.**

**「경고 0」을 목표로 삼지 않는다.** 9건 중 일부는 **그대로 두는 것이 정답**이고,
27건은 정리가 아니라 결함일 수 있다.

## 1. 실측 현황

```
총 342건 (errors 0)
├── @typescript-eslint/no-unused-vars   332
│   ├── defined but never used (import·선언)   267
│   ├── assigned but never used (지역 변수)     63
│   └── only used as a type                      2
├── react-hooks/exhaustive-deps           9
└── unused eslint-disable directive       1
```

| 구역 | no-unused-vars |
|---|---|
| 프로덕션 (`lib/`·`components/`·`app/`) | **173** |
| 테스트 (`__tests__/`·`e2e/`) | **157** |
| 스크립트 (`scripts/`) | 2 |

**상위 파일**(no-unused-vars)

| 건수 | 파일 |
|---|---|
| 12 | `__tests__/tax-engine/multi-house-surcharge/suspension-and-multi.test.ts` |
| 11 | `__tests__/tax-engine/multi-house-surcharge/basic-exclusion.test.ts` |
| 10 | `__tests__/tax-engine/multi-house-surcharge/utilities-and-2house.test.ts` |
| 9 | `lib/tax-engine/comprehensive-tax.ts` |
| 8 | `lib/tax-engine/property-valuation.ts` |
| 8 | `__tests__/tax-engine/multi-house-surcharge/special-exclusions.test.ts` |
| 6 | `app/api/calc/transfer/bundled-split-helpers.ts` · `lib/tax-engine/burdened-gift-apportionment.ts` |

**반복되는 잔재 심볼** — 같은 것이 여러 파일에 흩어져 있어 배치로 묶인다.

| 건수 | 심볼 | 성격 |
|---|---|---|
| 9 | `HouseInfo` | 타입 import 후 미사용 (테스트 9파일) |
| 5 | `applyRate` | 엔진 헬퍼 import 후 미사용 (프로덕션 5파일) |
| 5 | `formatSaveMessage` · `buildAutoSaveToast` | 각 5건 |
| **20** | `_` 프리픽스 전체 | **의도적 무시 표기**(로 보이는 것) — §3 참조 |

## 2. 🔴 먼저 기각한 의심 — `applyRate` 5건은 정책 위반이 아니다

`applyRate`는 CLAUDE.md 정수 연산 정책이 요구하는 헬퍼다. 그것을 import만 하고
쓰지 않는 파일이 5개라 **「금액 곱셈을 다른 방법으로 하고 있는 것 아닌가」를 의심**했다.
실측으로 기각한다:

| 파일 | `Math.round` | `Math.floor` | `safeMultiply` | 판정 |
|---|---|---|---|---|
| `burdened-gift-apportionment.ts:29` | 0 | 0 | 10 | 정책 준수 |
| `burdened-gift-valuation.ts:18` | 0 | 2 | 6 | 정책 준수 |
| `commercial-building-valuation.ts:18` | 0 | 7 | 11 | 정책 준수 |
| `comprehensive-tax.ts:27` | **4** | 7 | 0 | 아래 참조 |
| `transfer-tax-mixed-use-commercial.ts:10` | 0 | 2 | 0 | 정책 준수 |

`comprehensive-tax.ts`의 `Math.round` 4건은 **금액 반올림이 아니다** — 전부
`Math.round(rate * 1000)` / `Math.round(propertyFMR * 100)` 형태로 **세율·비율의
부동소수 보정**이고, 금액은 바깥의 `Math.floor`가 절사한다:

```ts
lib/tax-engine/comprehensive-tax.ts:104   Math.floor((base * Math.round(rate * 1000)) / 1000)
lib/tax-engine/comprehensive-tax.ts:454   Math.floor((taxBase * Math.round(corporateRate * 1000)) / 1000)
```

⇒ **이 5건은 단순 import 잔재**다. 배치 B에서 삭제한다.

## 3. 배치 A — eslint 설정 보완 (`_` 프리픽스) · **20건**

> 🔴 **이 절은 초안에서 「7건」이라고 썼다가 정정했다.** 빈도 상위 목록(`_drop` 4 · `_` 3)만
> 보고 모집단을 셌기 때문이다. 배치별 합계를 342와 **검산**하니 20건으로 드러났다
> (memory `feedback_regex_charclass_undercounts_population` — 스캔이 모집단을 조용히 줄인다).
> ⇒ 이 문서의 모든 건수는 §8의 검산 스크립트를 통과한 값이다.

`eslint.config.mjs`는 `eslint-config-next/typescript`의 기본값을 그대로 쓰고
`no-unused-vars` 커스텀 설정이 **없다**(파일 전문 확인). 그래서 **의도적 무시**를 뜻하는
관용 표기가 경고로 잡힌다. 전수 20건 = 테스트 13 + 프로덕션 7:

```
[테스트] single-timepoint.test.ts:171,186              _drop
[테스트] legacy-rental-97-requirements.anchor.test.ts:86    _drop
[테스트] rental-97-5-clause3-incorporation.anchor.test.ts:84,120,120  _drop · _d · _d2
[테스트] comprehensive-exclusion-area-limit.test.ts:145     _
[테스트] filing-penalty-fraud-g07b2.anchor.test.ts:39,160   _clause · _mok
[테스트] heir-allocation-gifttaxbase-derive.test.ts:40,238   _omit
[테스트] ls-additional-cases.test.ts:109                    _ignored
[테스트] general-building-route-helper.test.ts:76           _z
[프로덕션] CarryoverEstimationSection.tsx:176,198           _
[프로덕션] MultiTransferTaxSummaryCard.tsx:99               _properties
[프로덕션] lib/calc/gift-api.ts:113                         _src
```

`varsIgnorePattern`·`argsIgnorePattern`에 `^_`를 추가한다.

> ⚠️ **이것은 「경고를 숨기는 것」과 다르다.** `_` 프리픽스는 「의도적으로 안 쓴다」는
> 뜻의 표준 관용이고, 규칙이 그것을 인정하지 않으면 **개발자가 표기할 방법이 없다**.

### 🔴 그런데 `_` 3건은 «이름이 도메인 값»이다 — 설정 전에 배치 D로 검토

`_` 프리픽스가 붙어 있어도 **의도적 무시라는 보장은 없다**. 아래 3건은 이름 자체가
세액에 닿는 값이라, 설정을 먼저 넣으면 **조사 기회를 영구히 잃는다**:

| file:line | 심볼 | 왜 |
|---|---|---|
| `lib/tax-engine/new-housing-reduction.ts:373` | `_taxableGain` | **양도차익** |
| `lib/tax-engine/transfer-tax-mixed-use-steps.ts:114` | `_acqStandardSource` | 취득 기준시가 **출처** |
| `components/calc/transfer/inheritance/HouseValuationSection.tsx:320` | `_price` | 가격 |

⇒ **배치 D를 배치 A보다 먼저 끝낸다.** 이 3건을 D의 절차(§4)로 판정한 뒤,
「의도적 무시가 맞다」로 확정된 것만 A의 설정 뒤로 보낸다.

## 4. 🔴 배치 D — 만들어 놓고 쓰지 않는 것들 · 조사 14건 (**삭제 금지, 조사 대상**)

> 🔴 **자가검토(2026-09-11)가 이 절을 두 번 뒤집었다.** 기록해 둔다 — 같은 실수가 재발한다.
>
> **뒤집힘 1 — 모집단.** 초판은 `assigned but never used`(값 할당) **28건만** 훑었다.
> 그런데 `defined but never used` 267건 안에 **「선언했으나 호출되지 않는 함수」 17건**이
> 있었다(실측). 「만들어 놓고 안 쓴다」는 성격은 같은데 **한쪽 축만 본 것**이다
> (memory `feedback_enumerate_forms_vs_conservative_superset` — 참조를 셀 때 형태 열거 금지).
>
> **뒤집힘 2 — 판정 기준.** 초판 기준은 「**이름이 도메인 값**이면 의심」이었다. 주관적이고,
> 실측 반례가 나왔다: `computeLthdRate`(재개발 장기보유공제 **율**)는 이름이 완벽한 도메인
> 값이지만 `computeLthdRateSplit(...).total`을 감싼 **얇은 래퍼**이고 본체는 8곳에서 살아
> 있다 ⇒ 삭제해도 무해. ⇒ 기준을 **「그 로직이 다른 경로로 수행되는가」**로 교체한다.

### 판정 기준 (3단)

| 판정 | 조건 | 처리 |
|---|---|---|
| **α 죽은 래퍼·잔재** | 같은 로직을 수행하는 **다른 구현이 활발히 쓰인다** | 삭제 (배치 C) |
| **β 의도된 설계의 잔재** | 그 역할을 **다른 층**(DB·상위 호출자·설정)이 맡는다고 **코드가 명시** | 삭제하되 커밋에 근거 기록 |
| **γ 진짜 누락** | 그 로직을 대신하는 것이 **아무 데도 없다** | 🔴 결함 — 별건 PR |

> β 판정에는 **그 줄의 커밋 메시지·주변 주석을 읽는 것**이 포함된다
> (memory `feedback_deliberate_design_looks_like_the_defect`).

### D-1 · 값 할당 후 미사용 — 8건

프로덕션 `assigned but never used` 28건 중 세액에 닿는 것들이다.

| file:line | 심볼 | 왜 의심스러운가 |
|---|---|---|
| `lib/tax-engine/exemption-evaluator.ts:62` | `exemptRatio` | 감면 **비율**을 구해 놓고 안 쓴다 |
| `lib/tax-engine/exemption-evaluator.ts:82` | `exemptRatio` | 같은 파일 두 번째 |
| `lib/tax-engine/inheritance-tax.ts:115` | `nonFuneralDebts` | 장례비 외 채무 |
| `lib/tax-engine/inheritance-tax.ts:117` | `presumedTotal` | 추정상속재산 합계 |
| `lib/tax-engine/inheritance-generation-skip.ts:63` | `preGifts` | 사전증여 (세대생략 할증) |
| `app/api/calc/transfer/bundled-companion-split.ts:199` | `appurtenantRatio` | 부수토지 비율 |
| `app/api/calc/transfer/general-building-route-actual.ts:249` | `effectiveExpenses` | 필요경비 |
| `lib/tax-engine/transfer-tax-normal-return.ts:50` | `input` | 함수 인자 전체 |

**각 건의 처리 절차** (하나씩, 배치 처리 금지):

1. 그 값이 **어디에 쓰였어야 하는지**를 주변 코드·조문 주석으로 확인한다.
2. **뮤테이션 probe** — 그 값을 쓰도록 고쳤을 때 세액이 바뀌는지 anchor로 잰다.
   바뀌면 결함(별건 PR), 안 바뀌면 죽은 계산(삭제).
3. 삭제로 판정해도 **커밋 메시지에 「무엇을 확인하고 죽은 것으로 판정했는지」를 남긴다**
   — memory `feedback_deliberate_design_looks_like_the_defect`(의도된 설계가 결함처럼
   보일 수 있다)의 역방향 사례다.

> 나머지 20건은 죽은 **라벨 상수**가 대부분이라 배치 C로 간다
> (`STEP_LABELS` · `RENOVATION_TYPE_LABELS` · `AGENCY_TYPE_LABEL` · `CAUSE_LABEL_FOR_DATE` ·
> `GENERAL_BASIC_DEDUCTION` · `LAW_NAME_RE` 등).

### D-2 · 🔴 선언했으나 호출되지 않는 «함수» — 17건 중 조사 3건 (**초판 누락분**)

`defined but never used` 267건의 내역을 실측하면 **import가 208건**이고 나머지는
타입 선언 20 · **함수 선언 17** · 기타 17 · 매개변수 5다. 이 중 함수 17건은
「구현해 놓고 아무도 부르지 않는다」이므로 D의 성격에 정확히 해당한다.

**이미 판정한 3건** (검토 중 실측):

| file:line | 심볼 | 판정 | 근거 |
|---|---|---|---|
| `lib/tax-engine/new-housing-reduction.ts:234` | `getRateByAcquisitionPrice` | **β** | §99② 가격별 감면율(6억↓100%/6~9억 80%/9억↑60%)을 엔진이 계산하는 대안이었으나, `:378~383`이 「**DB에 구간별 article을 별도 저장**」이라 명시하고 `matchedArticle.reductionRate`를 쓴다 ⇒ 의도된 설계 |
| `lib/tax-engine/redevelopment-lthd.ts:360` | `computeLthdRate` | **α** | `computeLthdRateSplit(...).total` 얇은 래퍼. 본체는 8곳에서 사용 중 |
| `lib/korean-law/parsers/ref-parser.ts:50` | `parseHangLike` | ⏳ **V-3** | 「항」 파싱기인데 호출처 0. 참조 파싱에 구멍인지 확인 필요 |

> 🪤 **β 판정에 딸린 별건**: `new-housing-reduction.ts:378~383`은
> `let reductionRate = matchedArticle.reductionRate;` 직후 같은 값을 **다시 대입**하는
> no-op이다(주석이 그 자리를 설명한다). 감면율 자체는 옳게 흐르지만 **죽은 재대입**이므로
> 배치 C에서 함께 정리한다.

### D-3 · anchor 보강 3건 — **엔진 결함은 0건**(실측으로 확정)

V-4 조사에서 「테스트가 값을 계산해 놓고 단언하지 않는다」를 3건 찾았다. **초판 검토는
이것을 γ(진짜 누락)로 판정했으나, 실측이 두 번 뒤집었다.** 기록해 둔다.

| # | file:line | 초판 판정 | **실측 판정** | 근거 |
|---|---|---|---|---|
| ① | `carryover-pdf-case24.test.ts:65` `EXAMPLE_A_DEDUCTION` | γ | **β** | `:164` 주석이 「**양도차익 역산으로 개산공제 확인**」이라 명시하고 `:169`가 `transferGain`을 단언한다 — 간접 검증이 **설계된 선택** |
| ② | `carryover-pdf-case24.test.ts:68` `EXAMPLE_A_LTHD` | γ | **α** | **같은 값이 `:235`에서 리터럴로 단언되고 있다**(`expect(result.longTermHoldingDeduction).toBe(96_512_614)`). 검증은 살아 있고 **상수를 안 쓴 것**뿐 |
| ③ | `basic.test.ts:261` `pureTax` | γ | **anchor 보강** | 주석은 「calculatedTax > 순수 누진세액」인데 단언은 `> 0`이었다. **`toBeGreaterThan(pureTax)`로 고쳐 실행하니 30건 전건 통과** ⇒ 엔진 정상, 단언만 비어 있었다 |

⇒ **γ(엔진 결함) 0건.** 처리는 이렇게 나뉜다:

- ②는 리터럴 `96_512_614`를 `EXAMPLE_A_LTHD`로 바꾼다(memory `feedback_pdf_example_test_anchoring`
  — PDF 예시값 상수화). 값이 같으므로 무동작.
- ③은 **단언을 강화**한다. 무동작이 아니라 **검증 강화**이므로 배치 B와 섞지 말고
  「anchor 보강」으로 따로 커밋한다.
- ①은 그대로 둔다. 상수는 주석의 산식을 문서화하는 값이므로 **삭제하지 않고**
  `void EXAMPLE_A_DEDUCTION`이 아니라 **주석 안으로 옮기거나 `_` 프리픽스**를 붙인다(배치 A).

> 🔑 **이 절이 검토의 값을 보여준다.** 「미사용 변수」 경고 3건이 각각 β·α·보강으로 갈렸고,
> **셋 다 「지우면 그만」이 아니었다.** 반대로 셋 다 세액 결함도 아니었다 —
> 어느 쪽으로도 성급히 단정하지 않는 것이 이 배치의 요점이다.

**나머지 14건**은 UI 서브컴포넌트·테스트 헬퍼다. 성격상 α가 대부분이나 **전수 판정 후**
배치 C로 넘긴다 — 특히 아래 둘은 「표시 누락」 신호일 수 있어 먼저 본다:

```
components/calc/results/comprehensive-filing/ComprehensiveFilingFormMain.tsx:38,57  AmountCell · RateCell
__tests__/tax-engine/non-business-land/qa-{integration,land-type-flow,period-criteria}.test.ts  makeBusinessPeriods ×3
```

`AmountCell`·`RateCell`은 **신고서 서식의 금액·세율 셀**이다. 정의해 두고 쓰지 않는다면
그 표가 다른 방식으로 렌더된다는 뜻이고, 금액 칼럼 정렬 표준(`amount-column-align`)과
어긋날 수 있다. `makeBusinessPeriods`는 비사업용 토지 **기간 산정 헬퍼**를 3개 파일에서
각각 정의하고 쓰지 않는 것이라 **의도한 테스트 케이스가 빠졌을** 가능성이 있다.

## 5. 배치 B/C/S — 미사용 import·선언 삭제 · 304건

| 배치 | 대상 | 건수 | 위험 |
|---|---|---|---|
| **B** | 테스트 파일의 미사용 import·선언 | **144** | 낮음 |
| **C** | 프로덕션 미사용 import·죽은 상수 | **158** | 낮음~중간 |
| **S** | 스크립트 2건 (C와 함께 처리) | **2** | 낮음 |

스크립트 2건은 아래가 전부다:

```
scripts/e2e-law-research.mjs:32                 'info' is defined but never used
scripts/playwright-verify-history-dedup.mjs:104 'dateInputs' is assigned a value but never used
```

`only used as a type` 2건도 이 배치에 포함된다 — 값 import를 `import type`으로 바꾸면 된다:

```
__tests__/components/stock-penalty-result-basis.test.tsx:19  'o'                (→ B)
app/calc/transfer-tax/steps/Step5.tsx:24                     'REDUCTION_LABELS' (→ C)
```

### 🪤 `eslint --fix`를 **파일 전체에 일괄로 걸지 않는다**

CLAUDE.md에 기록된 함정이다 — `eslint --fix`가 미사용 import를 정리하면서
**같은 라인의 사용 중인 named export까지 제거**한 실례가 있다
(`import { CurrencyInput, parseAmount }`에서 `CurrencyInput`만 미사용인데 `parseAmount`도
제거 → TS2304). 실측으로도 이번 342건 중 `--fix` 가능은 **1건뿐**이다(=§6의 `disable` 지시자).

⇒ **수동 삭제 + 배치마다 `tsc`**. 배치를 20~40파일 단위로 쪼개 커밋한다.

### 테스트 파일 삭제 전 확인 (배치 B)

이번 세션에서 실제로 겪은 사례 — `post-listing-section2-daily-axis.anchor.test.tsx`의
`const T1 = "양도 당시 기준시가"`는 **S3에서 분모 블록이 카드 밖으로 나가며 남은 잔재**였다.
그러나 같은 형태가 **「부재 단언용 문자열」**일 수도 있다. 삭제 전에 그 파일에서
**같은 문자열이 다른 형태로 쓰이는지** grep한다(`toHaveCount(0)`·`not.toContain`).

## 6. 배치 E — `react-hooks/exhaustive-deps` 9건 (**개별 판단**)

| file:line | 누락/불안정 | 성격 |
|---|---|---|
| `components/calc/deemed-gift/ExcessShareholderTable.tsx:51` | `safeRows` 논리식 | 참조 불안정 — **안전** |
| `components/calc/transfer/UnifiedReductionPanel.tsx:161` | `reductions` 논리식 | 참조 불안정 — **안전** |
| `components/calc/acquisition/AcquisitionSidebar.tsx:257` | `form` 누락 | 판단 필요 |
| `components/calc/transfer/GeneralBuildingAcquisitionCards.tsx:348` | `asset` 누락 | 판단 필요 |
| `components/calc/transfer/RedevelopmentValuationSection.tsx:92` | `asset` 누락 | 판단 필요 |
| `components/calc/gift/PriorGiftHistoryModal.tsx:266` | `mode` 누락 | 판단 필요 |
| `components/ui/address-search.tsx:105` | `query` 누락 | 판단 필요 |
| `app/calc/transfer-tax/multi/MultiTransferTaxCalculator.tsx:353` | `syncToWizardStore` 누락 | **위험** |
| `components/calc/transfer/CompanionAcqPurchaseBlock.tsx:197` | `props` 누락 | **위험** |

**두 부류를 다르게 다룬다.**

- **논리식·배열 참조 불안정(2건)**: `useMemo`로 감싸 참조를 고정한다. 값이 같고 참조만
  달라 **메모가 조용히 무효**인 상태이므로, 고치면 의도대로 작동한다. 동작 무변경.
  (이번 세션 PR #1576에서 같은 형태 7건을 이렇게 처리했다.)
- **의존성 누락(7건)**: deps에 넣으면 **effect가 더 자주 돈다**. 이 저장소는
  `useEffect → store` 미러링으로 무한 루프를 겪은 이력이 있다
  (memory `feedback_useeffect_store_mirror_forbidden` · `feedback_zustand_selector`).
  ⇒ **소비처가 그 값을 어떻게 만드는지 실측**한 뒤에만 넣는다. PR #1576의
  `KiwoomStockNameAutocomplete`가 선례다 — 유일한 소비처가 useState setter를 그대로
  넘겨 참조가 안정적임을 확인하고 넣었다. 안정적이지 않으면 **부모를 `useCallback`으로
  고치거나, 그대로 두고 이유를 주석으로 남긴다**(경고 잔존을 허용).

### 🔴 위험도 재분류 (자가검토 실측 — 초판은 2건 다 「위험」이었다)

| file:line | 초판 | 실측 | 근거 |
|---|---|---|---|
| `MultiTransferTaxCalculator.tsx:353` | 위험 | **조건부 안전** | `syncToWizardStore`는 **`useCallback`으로 감싸져 있고**(`:355`), **다른 3곳의 deps에 이미 들어 있다**(`:373`·`:452`). 참조가 안정적이라 재실행이 늘지 않는다 |
| `CompanionAcqPurchaseBlock.tsx:197` | 위험 | **위험 유지** | deps가 요구하는 것은 `props` **객체 전체**이고 그것은 매 렌더 새 참조다. 게다가 이 effect는 `props.onPre1990Change(...)`를 호출한다 = **store 쓰기** ⇒ 무한 루프 위험 |

> ⚠️ **그런데 `:353`에는 다른 함정이 있다.** `syncToWizardStore`의 정의는 `:355`인데
> 호출은 `:351`이다 — 위 `useCallback` **안**이라 실행 시점에는 문제가 없지만, **deps 배열에
> 넣는 순간 「정의 전 참조」**가 되어 TDZ에 걸린다. ⇒ **선언 순서를 먼저 옮기고** deps를 넣는다.
> 순서 이동 자체가 동작 변경이 아님을 `tsc` + 해당 화면 anchor로 확인한 뒤 진행한다.

⇒ 최종 분류: **안전 2 · 조건부 안전 1 · 판단 5 · 위험 1**.

## 7. 배치 F — `unused eslint-disable` 1건

```
lib/korean-law/article-parser.ts:213
  Unused eslint-disable directive (no problems were reported from '@typescript-eslint/no-explicit-any')
```

그 줄의 `any`가 이미 제거됐다는 뜻이다. 지시자만 지운다. `--fix` 가능한 유일한 1건.

## 7-2. ⏳ 미검증 레지스터 V-n (착수 전 해소)

| ID | 항목 | 무엇이 달라지나 | 검증 방법 | 상태 |
|---|---|---|---|---|
| V-1 | 게이트가 쓰는 lint 명령(`npm run lint` = `eslint`)과 이 문서의 모집단(`npx eslint .`)이 같은가 | 다르면 **342라는 수치 전체**가 흔들린다 | 두 명령 실행 대조 | ✅ **둘 다 342 — 동일** |
| V-2 | `getRateByAcquisitionPrice`가 세액 결함인가 | γ면 신축주택 감면율이 틀린다(별건 PR) | 호출처 grep + `:378~383` 주석·구현 확인 | ✅ **β(의도된 설계)** — DB가 구간별 article 보유 |
| V-3 | `parseHangLike`(법령 「항」 파서) 미사용이 참조 파싱 구멍인가 | γ면 `/law` 참조조문 파싱 누락 | `ref-parser.ts` 소비처·대체 경로 확인 | ✅ **α** — 「항」은 `HANG_RE`가 `:70`·`:134`에서 정상 파싱. 다만 **원숫자(①②) 표기는 인식하지 않는다**(아래 주) |
| V-4 | 테스트의 `assigned but never used` **34건**에 단언 누락이 섞여 있는가 | 있으면 anchor가 계산만 하고 검증을 안 한다 | 전수 훑기 + 표본 정독 + **probe 실행** | ✅ **엔진 결함 0건** — 3건이 β·α·anchor 보강으로 갈렸다(§4 D-3). probe: 단언을 의도대로 고치니 **30건 전건 통과** |
| V-5 | `AmountCell`·`RateCell` 미사용이 신고서 표시 결함인가 | γ면 금액 칼럼 정렬 표준 위반 | 그 표의 실제 렌더 경로 확인 | ✅ **α** — `<AmountCell` **0회**·`<RateCell` **0회**·`<BlankCell` 25회. 표는 인라인 `<td className={BESSHI_CELL_AMOUNT}>`로 렌더돼 **정렬 상수를 그대로 쓴다** ⇒ 표준 위반 아님 |
| V-6 | 죽은 함수 17건 중 나머지 14건의 α/β/γ 판정 | γ가 있으면 별건 PR | §4 3단 기준 적용 | ✅ **전건 α** — 파일 내 등장 1회(=정의뿐). `separate-aggregate-land.ts:640 land`·`BurdenedGiftTransferSection.tsx:429 referenceDate`는 **동명 심볼이 따로 살아 있으니** 삭제 시 혼동 주의 |

> 📌 **V-3 주** — 참조조문 파서의 입력은 「제N항」 형태(예: `"소득세법 제94조 제1항"`)라
> 원숫자 미인식이 현재 경로에서 문제를 일으키지 않는다. 다만 **조문 본문은 「①」로 쓰므로**,
> 본문에서 참조를 뽑는 기능을 나중에 추가하면 그때 되살릴 값이 있다 — 삭제 시 커밋에 남긴다.
> 같은 파일의 `LAW_NAME_RE`(`:31`)·`LAW_NAME_STRICT_RE`(`:32`)도 미사용이라 함께 정리한다.

> ✅ **V-3~V-6 전건 해소.** 배치 C·A의 선행 조건이 풀렸다. 단 **D-3(아래) 2건은 lint 정리가
> 아니라 테스트 결함**이므로 별건 PR로 분리한다.

## 8. 실행 순서와 검증

| 순서 | 배치 | 건수 | 선행 조건 | PR |
|---|---|---|---|---|
| 1 | **B** 테스트 미사용 import | ~144 | 없음 (조사 대상과 안 겹침) | 2~4 (파일 20~40개씩) |
| 2 | **F** unused disable | 1 | 없음 | (1과 합침) |
| 3 | 🔴 **D** 조사 — 값 8 · 죽은 함수 17 · `_` 후보 3 | 27 | — | 결함(γ)이면 **별건 PR**, α·β는 4로 |
| 4 | **A** eslint 설정 `^_` | 20 | **V-3~V-6 해소 후** | 1 |
| 5 | **C+S** 프로덕션·스크립트 미사용 + D의 α·β | ~160 | **3 완료 후** | 2~4 |
| 6 | **E** deps 안전 2 + 조건부 1 | 3 | `:353`은 **선언 순서 이동 선행** | 1 |
| 7 | **E** deps 판단 5건 | 5 | 소비처 실측 | 1~2 |
| 8 | **E** deps 위험 1건(`CompanionAcqPurchaseBlock`) | 1 | 무한 루프 anchor 선작성 | 1 |

> **순서가 바뀌었다** — 초판은 D를 1번에 뒀으나, 배치 B(테스트 import)는 조사 대상과
> 겹치지 않아 **먼저 처리해 모집단을 줄이는 편**이 낫다. 반대로 **A·C는 D 뒤로 미룬다**:
> 먼저 하면 조사 대상이 「미사용이니 삭제」로 함께 쓸려 나간다.

**⚠️ 두 축을 혼동하지 말 것.**

| 축 | 무엇 | 합 |
|---|---|---|
| **배치 축**(아래 스크립트) | 342건을 처리 방법으로 나눈다 | A 20 · B 144 · C 158 · D 8 · E 9 · F 1 · S 2 = **342** |
| **조사 축**(§4) | 그중 **삭제 전 판정이 필요한 것**을 가로질러 뽑는다 | 값 8 + 죽은 함수 17 + `_` 후보 3 − 중복 1 = **27** |

조사 축의 「죽은 함수 17」은 배치 축에서 **B·C에 흩어져 있다**(`defined but never used`라서).
그래서 **배치 B·C를 실행할 때 그 17건을 통과시키면 안 된다** — §8 순서표가 C를 D 뒤로
미루는 이유다. 분류 스크립트(배치 축):

```python
if rule is None:                    F      # unused eslint-disable
elif rule == "react-hooks/...":     E
elif name.startswith("_"):          A      # 관용 무시 표기
elif (file, line) in D_TARGETS:     D      # §4 표의 8건
elif file.startswith("scripts"):    S
elif file.startswith("__tests__"):  B
else:                               C
```

**배치마다**: `npx tsc --noEmit` 0건 → 관련 스위트 → `npx eslint . | tail -3`으로
**감소 건수가 예상과 정확히 일치하는지** 확인(이번 세션에서 351 → 342로 9건 감소를
그렇게 확인했다). 마지막에 pre-push 전체 테스트.

**무동작 판정**: 배치 B·C·F는 테스트 파일 수·테스트 수가 바뀌지 않아야 한다.
배치 D·E는 동작이 바뀔 수 있으므로 **anchor로 세액을 못박은 뒤** 진행한다.

## 9. 하지 않을 것

- **`--fix` 일괄 적용** — §5의 함정. 실측상 fixable도 1건뿐이라 이득이 없다.
- **경고를 0으로 만드는 것 자체를 목표로 삼기** — 배치 E의 7건은 **그대로 두는 것이
  정답일 수 있다**. 그때는 이유를 주석으로 남기고 잔존시킨다.
- **`eslint.config.mjs`에 규칙 자체를 끄기** — 배치 A는 `^_` 관용 표기 인정이지
  규칙 비활성화가 아니다.
- **`docs/`의 과거 계획서 정리** — 이 문서의 범위 밖.

## 10. 절차 보완 (자가검토 추가)

- **연쇄 warning**: import 하나를 지우면 그것만 쓰던 다른 심볼이 새로 미사용이 된다.
  배치마다 **삭제 후 `npx eslint .`를 다시 돌려** 감소분이 예상과 «정확히» 일치하는지 본다
  — 일치하지 않으면 연쇄가 생긴 것이므로 그 배치 안에서 마저 정리한다.
- **pre-push 비용**: 이 저장소의 pre-push는 매번 **전체 테스트(약 4분)**를 돌린다.
  PR을 8개로 쪼개면 그 자체로 30분 이상이다 ⇒ **배치 B·C는 파일을 모아 PR 수를 줄인다**.
- **삭제의 무동작 판정**: 미사용 import·상수 삭제는 `tsc`가 참조 누락을 잡는다. 그러나
  **테스트 파일 수·테스트 수는 바뀌지 않아야 한다** — 배치마다 그 두 수치를 함께 기록한다.
