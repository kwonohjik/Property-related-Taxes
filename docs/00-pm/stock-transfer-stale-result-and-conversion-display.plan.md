# 주식 양도소득세 버그 수정 계획서 — stale 결과 · 환산취득가액 표시 · 「이전 1개월」 윈도우

- 작성일: 2026-08-27
- 워크트리: `/Users/mynote/workspace/PRT-stock-transfer-bugfix` (브랜치 `stock-transfer-bugfix`, base `origin/master` 2e1dd2f2)
- 제보: 사용자 **3건** (① 대주주로 판정됐는데 결과탭은 비대주주·세율 오적용 ② 환산취득가액을 제대로 표시 못함
  ③ 「양도일 이전 1개월」에서 「이전」은 양도일 포함인데 계산서가 양도일을 제외)
- 상태: **Do 완료 (2026-08-27)** — 자가검토 verdict `clean` 후 착수
- 결과: vitest **17,327건 통과 · 실패 0** · 주식 E2E **9건 통과**(신규 A-2 포함) · typecheck/lint 0 error
- 잔여: **E-2(비거래일 anchor 시프트)만 보류** — Q-4 참조. 그 외 A·B·C·E-1·E-3·E-4 완료

---

## 0. 제보 수치 재현 (실측 완료)

제보 화면(사례 48 「취득후 상장」·종목 주성·과세연도 2026)의 수치를 엔진 직접 호출로 재현했다.
`__tests__/tax-engine/stock-transfer/case-48-acquired-then-listed.test.ts`의 입력을 기준으로
`selfShareRatio`만 바꿔 두 번 돌렸다.

| probe | `selfShareRatio` | `taxCategory` | 세율 | 과세표준 | 산출세액 |
|---|---|---|---|---|---|
| A | 0.15 (15%) | `listed_major` | 20% | 11,860,175 | **2,372,030** |
| C | 0 | `listed_non_major_in_market` | 10% | 11,860,175 | **1,186,010** |

**제보 화면(이미지1)의 22행 11,860,175 · 25행 1,186,010은 probe C와 완전히 일치한다.**

⇒ 엔진 판정 로직은 정상이다. `stock-classification.ts:150-158`은 폼 토글이 아니라 **자동 산출을 우선**
적용하므로, 지분율 15%가 엔진에 도달했다면 반드시 `listed_major`가 나온다. 실제로 나오지 않았다는 것은
**계산 시점의 입력에 15%가 없었다**는 뜻이다.

### 배관 4지점 전수 확인 (모두 정상 — 원인 아님)

| 지점 | 파일:line | 실측 |
|---|---|---|
| ② store default / ③ normalize | `calc-wizard-stock-form.ts:435` · `calc-wizard-stock-normalize.ts:65` | 필드 존재·보존 ✓ |
| ④ API 변환 | `lib/calc/stock-transfer-tax-api.ts:329` | 폼 `"15"` → body `0.15` ✓ |
| ⑫ Zod | `lib/api/stock-transfer-tax-schema.ts:177` | `z.number().min(0).max(1)` 통과 ✓ |
| ⑭ Route 매핑 | `app/api/calc/stock-transfer/route.ts:144` | 단일 `buildEngineInput` 경유 ✓ |

폼 픽스처로 `buildStockTransferApiBody` → `stockTransferInputSchema.safeParse`를 실행해
`selfShareRatio: 0.15`, `success: true`를 직접 확인했다. **14 동기화 지점 결함이 아니다.**

### 사용자 확인 사항

- 「종목 목록」에 확정한 종목 **없음(단건)** ⇒ `callStockTransferTaxAPI(formData)` 단건 경로 확정.
  다종목 스냅샷(`savedItems`)·`carryFilingFields` 승계 누락 가설은 **기각**.

---

## 1. 결함 A — 입력을 고쳐도 결과가 갱신되지 않는다 (세액 변경)

### 원인 (코드 확정)

`lib/stores/calc-wizard-stock-store.ts:164-165`

```ts
updateFormData: (patch) =>
  set((state) => ({ formData: { ...state.formData, ...patch } })),
```

`result` · `aggregateResult`를 **무효화하지 않는다.** 같은 store의 다른 세 액션은 모두 무효화한다:

| 액션 | line | `result: null` |
|---|---|---|
| `commitCurrentItem` | :181-188 | ✓ (주석: 「남겨두면 화면이 stale 세액을 보인다」) |
| `editSavedItem` | :190-201 | ✓ |
| `removeSavedItem` | :204-209 | ✓ |
| **`updateFormData`** | **:164-165** | **✗ ← 결함** |

정책이 이미 존재하는데 **입력 변경 경로만 빠져 있다.**

### 노출 경로 (두 조건이 겹쳐야 증상이 된다)

1. **스텝 자유 이동** — `StockTransferTaxCalculator.tsx:195-199`(StepIndicator)과 `:323-326`(StockSidebar)
   둘 다 `onStepClick={(i) => setStep(i)}`로 **검증 없이 아무 스텝으로나 점프**한다. 결과 스텝(3)도 포함.
2. **결과 스텝의 자동계산이 1회뿐** — `app/calc/stock-transfer-tax/steps/Step4.tsx:41`

```ts
if (!result && !isLoading && !error && !autoTriggerredRef.current) { onCalculate(); }
```

`result`가 남아 있으면 **재계산하지 않고 그대로 렌더**한다.

⇒ 재현 흐름: 계산 → 결과 확인 → 1단계로 이동 → 지분율 15% 입력(판정 배지는 즉시 「대주주 해당」)
→ 결과 탭 클릭 → **이전 계산 결과가 그대로 표시**. 제보 화면의 이미지2/이미지1 조합이 정확히 이것이다.

### 영향

세액이 바뀐다. 제보 사례에서 산출세액 2,372,030 → 1,186,010으로 표시되고, 게다가 비과세
(`listed_non_major_in_market`)로 분류되어 **최종 납부세액이 0으로 안내**된다. 대주주 20% 과세가
비과세로 뒤집히므로 오안내의 폭이 크다.

### 수정 방향 (권장: 옵션 1)

| 옵션 | 내용 | 평가 |
|---|---|---|
| **1. `updateFormData`에서 `result`·`aggregateResult` 무효화** | store 한 곳. 결과 탭 재진입 시 `Step4:41`의 기존 자동계산이 자연히 재계산 | **권장** — 근본·최소·기존 패턴과 동일 |
| 2. 폼 스냅샷 해시 비교로 stale 판정 | 스냅샷 관리 코드 신설 | 과복잡 (Simplicity First 위배) |
| 3. 결과 탭 진입 시 항상 재계산 | `autoTriggerredRef`·`!result` 조건 제거 | 「계산」 버튼의 의미가 사라지고 매 진입 API 호출 |

**옵션 1의 무한 루프 위험 없음(확인 완료)**: `Step4.tsx`는 `form`을 **읽기만** 하고 `onChange`를
받지 않는다(props: `result`·`form`·`error`·`isLoading`·`onCalculate`·`aggregate` — `Step4.tsx:21-33`).
결과 렌더 중 `updateFormData`가 호출되는 경로가 없으므로 `result: null` → 자동계산 → `setResult`의
순환은 발생하지 않는다. `autoTriggerredRef`(`:40`)는 Step4가 `currentStep === 3`일 때만 마운트되므로
탭 이동 시 언마운트되어 초기화된다 — 재진입마다 1회 자동계산이 보장된다.

### 예상 부작용 — 결함이 아니라 **의도된 결과**로 기록한다 (자가검토 F-7·F-8)

| # | 부작용 | 근거 | 판단 |
|---|---|---|---|
| F-7 | 입력을 고치는 즉시 **사이드바 합계가 「엔진값」 → 「입력값 추정」으로 전환**된다 | `StockSidebar.tsx:33`이 store `result`를 구독하고 `:146-151`이 `result` 유무로 항목을 가른다 | **정상** — stale 엔진값을 계속 보여주는 것보다 낫다. 다만 숫자가 바뀌는 것처럼 보이므로 E2E 기대값 확인 필요 |
| F-8 | 폼을 고칠 때마다 재계산되므로 **이력 건수가 늘어난다** | `useAutoSaveCalculation`(`StockTransferTaxCalculator.tsx:75`)이 결과 마운트 시 저장. `contentHash` dedup(`use-auto-save-calculation.ts:59-68`)은 **동일 내용만** 차단 | **정상** — 각 계산이 실제로 다른 결과다. 종전에는 stale이라 저장조차 안 됐다 |

두 부작용 모두 **바뀐 동작이 옳다.** 다만 기존 E2E가 「사이드바에 엔진값이 남아 있다」거나
「이력이 1건이다」를 단언하고 있으면 깨진다 — Phase 0 probe로 먼저 센다.

---

## 2. 결함 B — 12행이 환산취득가액이 아니다 (표시)

### 현상

제보 이미지3 (`components/calc/stock-transfer/StockFilingFormTableHelpers.ts:388-410`)

| 행 | 라벨 | 값 |
|---|---|---|
| 11 | 취득가액 (②) | 30,098,625 ← **이것이 환산취득가액** |
| 12 | 환산 base (취득기준시가, estimated 모드) | 29,120,000 ← 환산의 *base* |
| 13 | 액면가 합계 (장부분실 §99①4) | — |

사용자 확인: **「12행 값이 환산취득가액이 아님」**. 라벨이 「환산…」으로 시작해 환산취득가액으로
읽히는데 값은 base다. 그리고 정작 환산취득가액(11행)은 「취득가액」이라고만 적혀 있어,
**§163⑨ 환산 산식이 화면 어디에도 드러나지 않는다.**

### 값 자체는 정상 (수정 대상 아님)

```
취득 당시 1주당 기준시가 = 5,824원  (§165⑤ 환산 — post-listing)
환산 base                = 5,824 × 5,000주 = 29,120,000
환산취득가액             = 44,750,000 × 5,824 ÷ 8,659 = 30,098,625   (§163⑨)
개산공제                 = 29,120,000 × 1% = 291,200                  (§163⑥4)
```

`case-48-acquired-then-listed.test.ts:102`가 `acquisitionPrice = 30_098_625`를,
`:145`가 `estimatedBase = 29_120_000`을 anchor로 고정하고 있다. **계산 결함이 아니라 표시 결함이다.**

### 수정 방향

12행 한 줄을 **환산 산식 3요소로 분해**한다 (신고서 행 번호는 뒤 행이 밀리므로 재번호 필요).

> 🔴 **초판 정정 (자가검토 F-1·F-5)** — 초판은 13행을 「`transferDatePriceAvg1Month × shareCount`」로,
> 항등식을 「① × 12 ÷ 13」으로 적었다. **둘 다 틀렸다.**
> `resolveTransferStd`(`apply-163-9-conversion.ts:56-68`)는 **1주당** 값을 반환하고,
> `apply163_9Conversion`(`:33-45`)은 **1주당끼리** 나눈다. 반면 12행 `estimatedBase`는
> **총액**(5,824 × 5,000 = 29,120,000)이다. **단위가 섞여 항등식이 성립하지 않는다** —
> 44,750,000 × 29,120,000 ÷ 8,659 ≠ 30,098,625.
> ⇒ 표시 단위를 **1주당으로 통일**한다.

| 신규 행 | 라벨(안) | 값 출처 | 단위 |
|---|---|---|---|
| 12 | 환산 산식 — 취득 당시 **1주당** 기준시가 (§165⑤) | `result.valuationDetail.finalPerShareValue` (= 5,824) | 원/주 |
| 13 | 환산 산식 — 양도 당시 **1주당** 기준시가 | `resolveTransferStd().transferStd` (= 8,659) — **echo 필드 신설 필요** | 원/주 |
| 14 | 환산취득가액 = ① × 12 ÷ 13 (§163⑨) | `result.acquisitionPrice` (11행과 동일 값) | 원 |

**검증 항등식**: `floor(① × 12 ÷ 13) = 14` — 44,750,000 × 5,824 ÷ 8,659 = 30,098,625 ✓
(총액 `estimatedBase` 29,120,000은 **개산공제 base**로서 필요경비 섹션(17행)에 이미 쓰이므로
취득가액 섹션에서 중복 표시하지 않는다.)

- 「양도 당시 1주당 기준시가」는 현재 `StockTransferResult`에 노출되지 않는다. `echo-field-pattern`
  스킬대로 **산식 무변경 optional echo 필드**로 추가한다. 엔진 계산은 손대지 않는다.
- 🔴 **fallback 동반 표시 필수 (F-3)** — `resolveTransferStd`는 `transferDatePriceAvg1Month` 미입력 시
  **1주당 양도가액으로 자동 대체**하고 `usedFallback: true`를 반환한다(`:61-67`).
  그 값을 「양도 당시 기준시가」라고만 표시하면 **거짓 표시**다.
  ⇒ `usedFallback`도 함께 echo하고, true일 때 13행에 「미입력 — 1주당 양도가액으로 대체」를 병기한다.
  (`stock-acquisition-basis.ts:140`이 이미 같은 상황에서 경고를 push한다 — 문구를 재사용한다.)
- 11행 라벨은 `acquisitionMode`에 따라 분기하는 것을 검토 — estimated 모드에서는
  「취득가액 (② = 환산취득가액)」으로 읽히게 한다. 다만 **모드별 분기는 표 전체 일관성에 영향**하므로
  라벨 문자열만 바꾸고 행 구조는 유지한다.
- 값이 없는 모드(actual·face_value)에서는 기존과 같이 `null`(「-」) 유지.

---

## 3. 결함 C — §94①3 가목 1)·2) 라벨이 서로 뒤바뀌어 있다 (별건 발견 · 법령 인용)

**사용자 제보가 아니라 이번 조사에서 발견했다.** 제보 이미지1의 01행과 02행이 서로 모순되는
원인이기도 하다 — 01행 「가목1) — 상장 비대주주 **장외**」 / 02행 「상장 비대주주 **(장내)**」.

### 조문 실측 (KoreanLaw MCP · 소득세법 mst 280405, 시행 2026-07-01)

> 가. 주권상장법인의 주식등으로서 다음의 어느 하나에 해당하는 주식등
> 　1) … **대주주가 양도하는** 주식등
> 　2) 1)에 따른 **대주주에 해당하지 아니하는 자가 증권시장에서의 거래에 의하지 아니하고** 양도하는 주식등

### 코드 현황

**(C-1) 라벨 — `StockFilingFormTableHelpers.ts:105-106`**

| 키 | 현재 라벨 | 조문 |
|---|---|---|
| `①3가1)` | 「상장 비대주주 장외」 | **대주주** ❌ |
| `①3가2)` | 「상장 대주주」 | **비대주주 장외** ❌ |

**두 라벨이 정확히 뒤바뀌어 있다.** `lib/tax-engine/legal-codes/stock.ts:13-16`의 주석은 조문과
일치하므로(1)=대주주, 2)=장외 비대주주), 틀린 것은 표시 라벨 쪽이다.

**(C-2) 조문 배정 — `lib/tax-engine/stock-classification.ts`**

| 분기 | line (실측) | 현재 `appliedSection94` | 조문상 |
|---|---|---|---|
| `listed_major` | **:300** | `①3가1)` | ✓ 정답 |
| `listed_otc_non_major` (K-OTC) | **:309** | `①3가2)` | Q-2 해소 → D 트랙 |
| `listed_off_market_non_major` (장외 비대주주) | **:318** | `①3가1)` | ❌ **`①3가2)`가 정답** |
| `listed_non_major_in_market` (장내 비대주주) | **:326** | `①3가1)` | ❌ 가목 어디에도 **해당 없음**(과세대상 아님) |

### 🔴 세팅 지점 누락 (자가검토 F-2) — **override가 하나 더 있다**

위 4개는 `classifySection94`의 **반환값**일 뿐이다. 그 뒤 `classifyStockTransfer`가 비과세 판정 결과로
**덮어쓴다**(`stock-classification.ts:439-447`):

```ts
let appliedSection94 = classResult.appliedSection94;
if (exemptionResult.isExempt && exemptionResult.reason === "kotc_sme_mid") {
  taxCategory = "kotc_sme_mid_exempt";
  appliedSection94 = "①3나_단서";        // ← 5번째 세팅 지점
}
```

⇒ **:318·:326만 고치면 이 경로는 그대로 남는다.** 「첫 히트에서 멈추면 고쳤는데 그대로」
([[feedback_enumerate_all_write_sites_before_fixing]])의 전형이다.
Phase C는 **5개 지점 전부**를 대상으로 한다. (이 override가 상장주식에 `①3나_단서`를 붙이는 것이
결함 D의 표시 증상이기도 하다 — 조문 배정 교정은 본 계획서, 비과세 차단은 D 트랙.)

> `kotc_venture` 분기(`:444-447`)는 `taxCategory`만 바꾸고 조문은 유지한다 — 비대칭이나
> 본 계획서 범위에서는 손대지 않는다(D 트랙 관찰 항목).

세액에는 영향이 없다(분류 라벨·조문 표시 전용). 다만 **틀린 인용은 링크도 틀리게 연다** —
`LawArticleModal`/`parseCitations`가 조문 문자열로 모달을 여는 구조이므로 「세액 무영향 ≠ 무해」다.

> ⚠️ **「세액 무영향」은 부정형 단언이다** — mutation probe로 검증한다(P-3, §4 Phase 0).
> `appliedSection94`의 사용처를 grep한 결과 분기 조건으로 쓰는 곳은 없고 `sectionLabel` 표시뿐이었으나,
> 실행으로 확증한다([[feedback_negative_assertion_needs_mutation_probe]]).

---

## 3-2. 결함 D — 상장주식에 §94①3 나목 단서 비과세가 적용된다 → **별도 트랙으로 분리**

Q-2를 조사하다 발견한 **세액 변경** 결함이다. 사용자 결정(2026-08-27)으로 **본 계획서 범위에서
제외**하고 별도 문서로 옮겼다.

→ **[`stock-transfer-kotc-listed-exemption-gap.plan.md`](./stock-transfer-kotc-listed-exemption-gap.plan.md)**

요약만 남긴다:

- 상장주식(kospi·kosdaq·konex)에 **주권비상장법인 전용** 비과세(§94①3 나목 단서)가 적용되어
  세액 **2,997,500 → 0**. `judgeExemption`(`stock-classification.ts:203-209`)에 marketType 가드 부재.
- 근본 원인은 `isKOTCTrading`이 「K-OTC 시장」과 「장외거래」 **두 의미로 혼용**되는 것.
- 자본시장법 §286①5호가 K-OTC를 「증권시장에 **상장되지 아니한** 주권」의 장외매매거래로 정의한다.

### ⚠️ 본 계획서 Phase C와의 교차점

C-2에서 `listed_off_market_non_major`의 조문을 `①3가1)` → **`①3가2)`**로 교정하면,
`listed_otc_non_major`(현행 `①3가2)`)와 **조문·의미가 완전히 중복**된다.
**중복 자체의 해소는 D 트랙 Phase B에서 한다** — 본 계획서는 조문 배정만 바로잡고 중복은 남긴다.
Phase C 작업 시 이 사실을 주석으로 남겨 D 트랙이 이어받게 한다.


## 3-3. 결함 E — 「양도일 이전 1개월」 윈도우 산정 (제보 3건째 · 일부 세액 변경)

제보: 「"이전"은 양도일·취득일을 **포함**하는 개념인데 양도일 기준시가 계산서가 양도일을 제외한다」.

### 조문 실측 — 「이전 = 당일 포함」은 맞다

**소득세법 §99①3** (mst 280405)

> 「상속세 및 증여세법」 제63조제1항제1호가목을 준용하여 평가한 가액. 이 경우
> "**평가기준일 이전ㆍ이후 각 2개월**"은 "**양도일ㆍ취득일 이전 1개월**"로 본다.

**상증법 §63①1가목** (mst 276123)

> 상장주식은 **평가기준일**(평가기준일이 공휴일 등 대통령령으로 정하는 매매가 없는 날인 경우에는
> **그 전일을 기준으로 한다**) **이전ㆍ이후 각 2개월** 동안 공표된 매일의 … 최종 시세가액
> (**거래실적 유무를 따지지 아니한다**)의 평균액

**상증령 §52의2④** (mst 283637) — 「매매가 없는 날」 = 공휴일·대체공휴일·**토요일**

⇒ 준용 구조상 축은 **양도일 당일**이고, 「이전 1개월」은 **당일을 포함해 소급**한다. 제보가 조문과 맞다.

### 그러나 실측: **평일 양도일은 이미 포함되어 있다**

`preTransferAutoFillDates`(`PostListingClosingPriceTable.tsx:74-89`) 직접 호출:

| 양도일 | anchor | 윈도우 | 일수 | 양도일 포함 |
|---|---|---|---|---|
| 2023-02-24 (금) | 2023-02-24 | 2023-01-25 ~ 2023-02-24 | 31 | **예** |
| 2024-06-03 (월) | 2024-06-03 | 2024-05-04 ~ 2024-06-03 | 31 | **예** |
| 2024-06-01 (토) | 2024-05-31 | 2024-05-02 ~ 2024-05-31 | 30 | 아니오 |
| 2024-06-02 (일) | 2024-05-31 | 2024-05-02 ~ 2024-05-31 | 30 | 아니오 |
| **2023-03-31 (금)** | 2023-03-31 | **2023-03-04 ~ 2023-03-31** | **28** | 예 |

- **평일 양도일은 정상**이다 — 이 부분은 결함이 아니다.
- **주말 양도일의 제외도 결함이 아니다** — §63①1가목 괄호(「그 전일을 기준으로 한다」)에 근거가 있다.
  기준일 자체가 전일로 바뀌므로 윈도우 전체가 함께 당겨지는 것도 조문에 부합한다.

⇒ **제보의 「양도일을 제외한다」는 평일 케이스에서는 성립하지 않는다.** 다만 조사 과정에서
**별개의 실제 결함 2건**이 드러났다.

### E-1 (세액 변경) — 월말 양도일에서 윈도우가 3~4일 짧아진다

`preTransferAutoFillDates:80-83`

```ts
// start = (월 − 1, 일 + 1) — 기계적 산식 (JS overflow 자동 보정)
start.setUTCMonth(start.getUTCMonth() - 1);
start.setUTCDate(start.getUTCDate() + 1);
```

2023-03-31의 경우 `(2023, 2월, 32일)`이 되는데 2023년 2월은 28일이라 **3월 4일로 넘어간다.**
결과는 [2023-03-04 ~ 2023-03-31] **28일**이다.

민법 §160②(월로 정한 기간은 역에 의해 계산하고, 최후의 월에 해당일이 없으면 그 월의 말일로 만료)에
따르면 2023-03-31의 소급 1개월은 **2023-02-28**이다. 즉 윈도우는 [2023-02-28(또는 03-01) ~ 03-31]이어야 한다.

**평균 대상 거래일이 달라지므로 기준시가가 바뀌고, §163⑨ 환산취득가액의 분모가 바뀐다 ⇒ 세액 변경.**

`PostListingClosingPriceTable.tsx:72`의 주석은 「anchor 2023-03-31 → [2023-03-01, 2023-03-31] (31일)
※ 2-32 overflow → 3-01」이라고 적혀 있으나 **실측은 3-04·28일**이다 — 주석과 구현 드리프트
([[feedback_engine_comment_vs_impl_drift]]).

### E-2 (세액 변경) — anchor 시프트가 **평일 공휴일·납회기간**을 보지 않는다

`resolvePreTransferAnchor:56-58`은 **토·일만** 뒤로 시프트한다:

```ts
while (anchor.getUTCDay() === 0 || anchor.getUTCDay() === 6) { ... }
```

상증령 §52의2④의 「매매가 없는 날」은 **공휴일·대체공휴일·토요일**이다. 삼일절·현충일 같은
**평일 공휴일에 양도**하면 조문상 전일 기준이어야 하는데 코드는 그대로 둔다.
실측: 2024-03-01(삼일절·금) → anchor 그대로 `2024-03-01`, 윈도우 [2024-02-02 ~ 2024-03-01].

**같은 사실을 두 기준으로 다루는 비대칭**이기도 하다 — 표 셀에서는 `isKrxHolidayInFixture`로
휴장일을 제외하면서(`TransferDate1MonthClosingPriceTable.tsx:53`), anchor 산정에서는 보지 않는다.

⚠️ **미확인(V-8)**: 「그 전일」이 **1일만**인지, 전일도 매매 없는 날이면 **연속 소급**인지.
현행 코드는 주말에 대해 연속 소급한다(일 → 토 → 금, 2일). 조문 문언은 「그 전일」 단수다.
예규 확인 없이 바꾸지 않는다.

### 🔴 E-2 처방의 한계 (자가검토 F-4·F-6)

**F-4 — 휴장일 판정은 2020~2026 정적 픽스처다.**
`isKrxHolidayInFixture`(`lib/kiwoom/calendar.ts:43-45`)는 `KRX_HOLIDAYS_2020_2026` Set 조회일 뿐이고,
`isKrxTradingDay`의 주석(`:53`)이 명시한다 — 「fixture 범위 밖 → 주말·납회만 false
(**휴장일 판단 보류** — 호출 측이 키움 응답으로 보정)」.

⇒ E-2를 그대로 넣으면 **2019년 이전·2027년 이후 양도일에서는 시프트가 조용히 일어나지 않는다.**
같은 결함이 연도에 따라 고쳐지기도 하고 안 고쳐지기도 하는 **비일관**이 된다.

수정 방향에 다음을 포함한다:
- 픽스처 범위(`KRX_HOLIDAY_FIXTURE_RANGE`) **밖**이면 시프트를 시도하지 않고 **화면에 안내**를 띄운다
  (「휴장일 자동 판정 범위 밖 — 종가가 없는 날은 빈칸으로 두세요」). 조용히 넘어가지 않는다.
- 자동 안분 fallback 금지 원칙과 같은 층위다 — **모르는 것을 아는 척하지 않는다.**

**F-6 — 납회기간(12/29~31)이 빠졌다.**
`isYearEndNonTrading`(year-agnostic)은 거래가 없는 날인데 E-2 초판 처방이 `isKrxHolidayInFixture`만
언급했다. 「매매가 없는 날」에 해당하므로 anchor 시프트 대상이다.
⇒ 단일 술어는 `isKrxHolidayInFixture`가 아니라 **`isKrxTradingDay`의 부정**이어야 한다.

> 부수 확인: 종가표 **셀 판정**도 `isYearEndNonTrading`을 보지 않는다
> (`TransferDate1MonthClosingPriceTable.tsx:53`은 주말+`isKrxHolidayInFixture`만).
> `nonTradingLabel`은 납회를 라벨링하므로 **같은 파일 안에서 비대칭**이다. E-2와 함께 정리한다.

### E-3 (표시·인용) — 「직전」·「소령 §99①3」

`TransferDate1MonthClosingPriceTable.tsx:120`

> 양도일 **직전** 1개월 종가 (**소령** §99①3 분모 — …)

- 조문 문언은 「**이전**」이다. 「직전」은 당일 제외로 읽히므로 제보와 같은 오해를 만든다.
- **§99는 소득세법(법률)**이지 시행령이 아니다. 「소령 §99①3」은 틀린 인용이다
  (같은 오기가 `stock-valuation-listed.ts:6-7`, `stock-acquisition-basis.ts` 등 주석에도 있다 — 전수 grep 대상).

### E-4 (주석 모순) — 세 주석이 서로 다르다

| 위치 | 주장 | 실측 |
|---|---|---|
| `TransferDate1MonthClosingPriceTable.tsx:12` | `[transferDate − 1 month, transferDate − 1 day]` **(양도일 미포함)** | 평일은 **포함** ❌ |
| `PostListingClosingPriceTable.tsx:68` | `end = anchor ← anchor 포함` | ✓ |
| `PostListingClosingPriceTable.tsx:72` | anchor 2023-03-31 → `[2023-03-01, 2023-03-31] (31일)` | `[2023-03-04, 03-31]` **28일** ❌ |

### 취득일 쪽은 UI 자체가 없다 (비대칭)

취득일은 `acquisitionDatePriceAvg1Month`(**평균값 직접 입력**)만 있고 종가표 UI가 없다
(`calc-wizard-stock-form.ts:147`). 그래서 제보도 양도일 화면만 지목했다.
E-1·E-2를 고쳐도 **취득일 기준시가는 사용자가 손으로 넣은 값 그대로**다 — 본 계획서에서는
취득일 종가표 신설을 하지 않는다(범위 밖·별건 기록).

### 수정 방향

1. **E-1**: 윈도우 시작일 산식을 민법 §160② 역산으로 교체. `setUTCDate(+1)` 후 overflow가
   나는 경우를 **말일로 클램프**한다. 경계 픽스처: 3-31·5-31·1-31(윤년·평년 양쪽) 전수 anchor.
2. **E-2**: `resolvePreTransferAnchor`에 공휴일 판정을 추가해 `isKrxHolidayInFixture`와 **단일 술어**로 통일.
   V-8 결과에 따라 연속 소급 여부 확정.
3. **E-3**: UI 문구 「이전」으로, 인용을 「소득세법 §99①3」으로 교정 + 같은 오기 전수 grep.
4. **E-4**: 주석을 실측에 맞춰 교정하고, 그 예시들을 그대로 anchor 테스트로 옮긴다
   (주석이 다시 드리프트하지 못하게 한다).

---

## 4. Phase 계획

### Phase 0 — Pre-Do anchor (착수 전 필수)

「바꾸기 전에 안전망을 잰다」 원칙에 따라 **anchor를 먼저 쓰고 실패를 확인한 뒤** 수정한다.

| # | anchor | 예상 | 파일 |
|---|---|---|---|
| A-1 | `updateFormData` 호출 후 `result`·`aggregateResult`가 `null`이 된다 | **실패** | `__tests__/stores/calc-wizard-stock-store.test.ts` (신규 또는 기존) |
| A-2 | E2E — 계산 → 1단계 지분율 15% 입력 → 결과 탭 → 대주주 20% 반영 | **실패** | `e2e/stock-transfer-stale-result.spec.ts` (신규) |
| A-3 | 신고서 표 항등식 **`floor(① × 12 ÷ 13) = 14`** (12·13 모두 **1주당**) + `usedFallback` 시 병기 문구 | **실패** | `__tests__/components/calc/stock-transfer/StockFilingFormTable-*.test.tsx` |
| A-4 | `sectionLabel("①3가1)")`이 「대주주」를, `("①3가2)")`가 「비대주주 장외」를 포함 | **실패** | 위와 동일 파일 |
| A-5 | `listed_off_market_non_major` → `①3가2)` / `listed_non_major_in_market` → 「해당없음」 · **비과세 override 경로(`:441`)도 함께** | **실패** | `__tests__/tax-engine/stock-transfer/` 분류 anchor |
| A-6 | 월말 양도일 윈도우 — 2023-03-31 → 시작일이 **2023-03-01**(현행 03-04) | **실패** | `__tests__/components/calc/stock-transfer/` 윈도우 anchor (신규) |
| A-7 | **비거래일 양도일**(2024-03-01 삼일절 · 2023-12-29 납회) → anchor가 **직전 거래일**로 시프트 | **실패** | 위와 동일 |
| A-8 | **거래일 평일 양도일은 포함 유지**(2023-02-24 금·2024-06-03 월) · **주말 양도일은 전일 기준 유지** | 통과 | 위와 동일 |
| A-9 | 픽스처 범위 **밖** 연도(예: 2018 양도일) → 시프트하지 않고 **안내 문구 노출** | **실패** | 위와 동일 |

> **A-7 ↔ A-8 경계 (자가검토 F-9)**: A-8의 「평일」은 **거래일인 평일**로 좁힌다.
> 평일 공휴일·납회기간은 A-7이 담당한다 — 두 anchor가 같은 날짜를 다르게 기대하지 않도록
> 픽스처를 명시적으로 갈라 둔다.

**안전망 mutation probe (필수)** — 수정 전에 측정해 **결과를 이 문서에 기록**한다:

| P-n | 무력화 대상 | 재는 것 | **실측 결과 (2026-08-27)** |
|---|---|---|---|
| P-1 | `updateFormData`에 `result: null` 주입 | 깨지는 기존 테스트 수 | 🔴 **0건** (411파일 3,704건 전부 통과) — A-1·A-2가 유일한 방어선 |
| P-2 | `sectionLabel` 두 라벨 교환 | 반응 테스트 수 | 🔴 **0건** — C-1은 지금까지 **아무도 안 보고 있었다** |
| P-3 | `appliedSection94`를 전 분기에서 `"①3나_본문"` 고정 | **「세액 무영향」 부정형 단언 검증** | ✅ **9건 실패 — 전부 `appliedSection94` 값 단언, 세액 단언 0건.** 분기 조건이 아니라 표시값임이 실행으로 확증됐다 |
| P-4 | `preTransferAutoFillDates` 시작일을 +7일 이동 | 윈도우 길이 안전망 수 | 🔴 **0건** — E-1을 지키는 것이 없다 |
| P-5 | `resolveTransferStd`의 fallback 분기 제거 | fallback 경로 안전망 수 | 🔴 **0건** — F-3 위험이 무방비 |

**P-3이 찾아준 기존 anchor 9건** — Phase C가 갱신 대상 여부를 판단해야 한다:

| 파일 | 케이스 | Phase C 영향 |
|---|---|---|
| `on-market-venue.test.ts` | OM-2 (`listed_off_market_non_major` → `①3가1)`) | ⚠️ **갱신 필요** → `①3가2)` |
| `case-3-8-listed.test.ts` | C4-1 (`listed_otc_non_major` → `①3가2)`) · C8-1 | 유지 (대조군) |
| `case-48-acquired-then-listed.test.ts` | L48-8 (`listed_major` → `①3가1)`) | 유지 (대조군) |
| `case-9-11-other-asset.test.ts` | C10-03 · C11-02 · C11-04 (`①4다`·`①4라`) | 유지 (무관) |
| `case-12-18-20-22-24.test.ts` | C12-1 · C12-2 (§94② 우선순위) | 유지 (무관) |

> `listed_non_major_in_market`의 `appliedSection94`를 단언하는 테스트는 **9건 중 없다** —
> 「해당없음」으로 바꾸는 C-2는 기존 anchor와 충돌하지 않는다.

### Phase A — 결함 A 수정 (세액 변경)

1. `lib/stores/calc-wizard-stock-store.ts:164` — `updateFormData`에 `result: null, aggregateResult: null` 추가.
2. A-1·A-2 통과 확인.
3. 회귀: `npx vitest run __tests__/tax-engine/stock-transfer/ __tests__/calc/` + 주식 관련 E2E.

> ⚠️ 이 변경은 **결과 화면이 표시된 상태에서 폼이 바뀌면 결과가 사라지고 자동 재계산된다**는 뜻이다.
> 기존 E2E 중 「결과 화면에서 폼을 건드리는」 spec이 있으면 깨질 수 있다 — Phase 0 probe로 먼저 센다.

### Phase B — 결함 B 수정 (표시)

1. 엔진 result에 「양도 당시 기준시가」 echo 필드 추가 (산식 무변경 · `echo-field-pattern`).
   - `lib/tax-engine/stock-transfer/types/stock-transfer.types.ts` — optional 필드
   - 채우는 지점: 정상 경로(`stock-acquisition-basis.ts`)와 **비과세 정보용 경로**
     (`exempt-informational-acquisition.ts:104-122`) **양쪽** — 한쪽만 채우면 비과세 화면에서 빈다.
2. `StockFilingFormTableHelpers.ts` 12행 분해 + 뒤 행 재번호.
3. 다종목(aggregate) 열에서도 값이 채워지는지 확인 (V-4).
4. `amount-column-align` 정렬 규칙 유지.

### Phase C — 결함 C 수정 (법령 인용) — **Q-1 결정: 조문 배정까지 포함**

1. **C-1(라벨)**: `sectionLabel` 두 항목 교정 (`StockFilingFormTableHelpers.ts:105-106`). 저위험.
2. **C-2(조문 배정)**: `stock-classification.ts` 교정 — **세팅 지점 5개 전수**(F-2).
   - `:318` `listed_off_market_non_major` → `①3가1)` ⇒ **`①3가2)`**
   - `:326` `listed_non_major_in_market` → `①3가1)` ⇒ **「해당없음」**(과세대상 아님)
   - `:441-443` **비과세 override**(`kotc_sme_mid` → `①3나_단서`) — 상장 경로가 여기로 새는지 확인
   - `:300`(`listed_major`)·`:309`(`listed_otc_non_major`)는 **현행 유지**가 정답 — 대조군으로 고정
3. **타입 확장** — `appliedSection94`에 「해당없음」에 해당하는 값이 없다.
   `types/stock-transfer.types.ts`의 union에 값을 추가하고, 그 값을 읽는 **전 지점을 grep으로 전수 확인**한다:
   `sectionLabel` 매핑 · 결과 카드 · 신고서 표 · 이력 저장(`lib/storage`) · 별지 84호 서식.
   **union 확장은 TypeScript가 누락을 잡아주지만, `Record<string, string>` 매핑은 잡지 못한다**
   (`sectionLabel`의 map이 그 형태다 — 반드시 `Record<AppliedSection94, string>`으로 좁혀
   컴파일러가 누락을 잡게 한다).
4. `verify:legal` manifest 등록 — 새 조문 문자열을 인용하면
   `lib/legal-verification/manifest/additions-*.ts` 등록이 필요하다(미등록 시 검증에서 조용히 빠진다).

### Phase D — 결함 E 수정 (「이전 1개월」 윈도우 · 일부 세액 변경)

> 결함 **D**(K-OTC)는 별도 트랙으로 분리했다 — §3-2 참조.

1. **E-1(세액)** — `preTransferAutoFillDates:80-83` 시작일 산식을 민법 §160② 역산으로 교체.
   `setUTCDate(+1)` overflow 시 **말일 클램프**. A-6 통과.
2. **E-2(세액)** — `resolvePreTransferAnchor:52-60`의 술어를 **`isKrxTradingDay`의 부정**으로 통일한다
   (주말 + 픽스처 휴장일 + **납회기간** — F-6). `single-source-engine-helper` 원칙.
   **픽스처 범위 밖은 시프트하지 않고 안내를 띄운다**(F-4) — A-7·A-9 통과.
   V-8 확정 후 연속 소급 여부 결정.
   종가표 셀 판정(`TransferDate1MonthClosingPriceTable.tsx:53`)의 납회 누락도 같은 술어로 정리.
3. **E-3(표시·인용)** — UI 문구 「직전」 → 「이전」, 「소령 §99①3」 → 「소득세법 §99①3」.
   같은 오기를 **전수 grep**해 함께 교정.
4. **E-4(주석)** — 세 주석을 실측에 맞춰 교정하고, 그 예시를 **그대로 anchor로 옮긴다**
   (주석이 다시 드리프트하지 못하게 한다).
5. **과잉 수정 방지** — A-8(평일 포함 유지 · 주말 전일 기준 유지)이 계속 통과하는지 확인.

### Phase F — 회귀·머지

- `npm run check:pre-pr` (typecheck + lint + 전체 test)
- 주식 E2E: `E2E_PORT=3402 npx playwright test e2e/stock-transfer-*.spec.ts`
- PR 분리 — 세액 변경과 표시를 섞지 않는다:
  1. **PR-1 (세액)** Phase A — stale 결과
  2. **PR-2 (세액)** Phase D — 「이전 1개월」 윈도우 (E-1·E-2)
  3. **PR-3 (표시)** Phase B + C + E-3·E-4 — 환산 산식 노출 · §94 조문 배정·라벨 · 인용·주석
- **별도 트랙**: K-OTC 결함은 [`stock-transfer-kotc-listed-exemption-gap.plan.md`](./stock-transfer-kotc-listed-exemption-gap.plan.md)

---

## 5. 미검증 항목 (V) · 결정 대기 (Q)

### V — Do 착수 전 실측으로 닫을 것

| # | 항목 | 방법 |
|---|---|---|
| V-1 | 결함 A의 stale 가설이 **실제 브라우저에서** 재현되는가 | A-2 E2E. 이것이 재현되지 않으면 원인 가설을 다시 세운다 |
| V-2 | `result` 무효화로 깨지는 기존 테스트·E2E | Phase 0 mutation probe |
| V-3 | 「양도 당시 기준시가」가 모든 estimated 하위 모드에서 산출되는가 (post-listing / 일반 환산 / face_value) | 모드별 probe |
| V-4 | 12행 분해가 다종목 열(`av()` 경로)에서도 채워지는가 | aggregate 픽스처 렌더 테스트 |
| V-5 | (D 트랙으로 이관) | → `stock-transfer-kotc-listed-exemption-gap.plan.md` V-1 |
| V-6 | `appliedSection94` union 확장이 닿는 전 지점 | grep 전수 + `Record<AppliedSection94, …>`로 좁혀 컴파일러가 잡게 함 |
| V-7 | (D 트랙으로 이관) | → 위 문서 V-3 |
| V-8 | 「그 전일을 기준으로 한다」(상증법 §63①1가목)가 **1일만**인지 **연속 소급**인지 | 예규·국세청 해석 확인. 확인 전에는 현행(연속 소급) 유지 |
| V-9 | E-1 수정이 바꾸는 **거래일 집합의 실제 세액 영향** | 월말 양도일 픽스처로 평균·환산분모·세액 before/after 실측 |
| V-10 | 「소령 §99①3」 오기가 있는 지점 전수 | `grep -rn "소령 §99"` — 주석·UI 문구 모두 |

### Q — 결정 이력 / 대기

| # | 질문 | 상태 |
|---|---|---|
| Q-1 | 결함 C를 라벨만 고칠지, 조문 배정까지 고칠지 | ✅ **결정(2026-08-27): 조문 배정까지** — Phase C에 반영. 타입 확장 포함 |
| Q-2 | 상장주식의 K-OTC 거래를 가목 2)로 볼지 나목 단서로 볼지 | ✅ **해소** — 조문 실측 결과 **상장주식의 K-OTC 거래는 성립하지 않는다**(자본시장법 §286①5호 「증권시장에 상장되지 아니한 주권」). 나목 단서는 비상장 전용 ⇒ 결함 D로 전환 |
| **Q-3** | **결함 D를 이번 범위에 포함할지** | ⏳ **대기** — 세액 변경(2,997,500 → 0)이고 UI에서 도달 가능하나, 사용자 제보 2건 밖의 별건이다 |

---

## 6. 범위 밖 (관찰만 — 이번에 고치지 않는다)

- **타 세목 store 동일 위험**: `lib/stores/calc-wizard-store.ts:546`(양도세 등 공용)도 `updateFormData`가
  `result`를 무효화하지 않는다. 다만 그 마법사의 결과 화면 진입·재계산 구조가 주식과 같은지는 미확인이다.
  이번 요청은 주식 양도세이므로 **손대지 않는다**(Surgical Changes). 별건으로 남긴다.
- **사례 48 교재값과의 3,625원 차이**: 교재 PDF는 1주당 6,019원(절사) × 5,000주 = 30,095,000,
  엔진은 총액 기준 30,098,625다. 현행 anchor(`case-48-*.test.ts:102`)가 30,098,625를 정답으로
  고정하고 있고 사용자도 11행 금액은 문제로 지목하지 않았다. **이번 범위 밖.**
- **`computeAutoIsMajor`의 `isVentureCompany` 누락**: `major-sync.ts:43-46`은
  `getMajorShareholderThreshold`를 호출할 때 `{ isVentureCompany }`를 넘기지 않는다.
  같은 파일의 미리보기(`MajorShareholderBlock.tsx:120`)는 넘긴다 ⇒ **비상장 벤처기업에서 UI 배지와
  폼 토글 값이 갈릴 수 있다.** 다만 엔진은 자동 재판정하므로 세액에는 영향이 없다. 별건 기록.

---

## 7. 회귀 위험 요약

| 위험 | 완화 |
|---|---|
| `result` 무효화로 기존 E2E가 「결과가 사라진다」로 실패 | Phase 0 probe로 먼저 개수 측정 → 실패 spec은 원인을 확인해 고친다(known-failures 추가 금지) |
| 신고서 행 재번호로 기존 anchor의 행 번호 단언이 깨짐 | 행 번호를 단언하는 테스트를 grep으로 전수 확인 후 함께 갱신 |
| echo 필드를 정상 경로에만 채워 비과세 화면에서 빈칸 | 두 경로 모두 채우고 anchor로 양쪽 고정 |
| 조문 문자열 변경이 `verify:legal` 커버리지에서 누락 | `additions-*.ts` 등록 + `npm run verify:legal` |
| `appliedSection94` union 확장이 `Record<string, string>` 매핑에서 조용히 누락 | 매핑 타입을 `Record<AppliedSection94, string>`으로 좁혀 컴파일 에러로 드러냄 (V-6) |
| K-OTC UI 게이트만 넣고 엔진 가드를 빼면 stale 값이 그대로 비과세를 통과 | 엔진 가드를 **필수**로 두고 UI는 부수 — 순서를 지킨다 |
| E-1·E-2 수정이 **기존 종가 픽스처의 일자 배열 길이**를 바꿔 인덱스 misalign | 윈도우 길이에 의존하는 테스트·E2E를 전수 grep 후 함께 갱신. `transferPriceClosing` 인덱스 정합 확인 |
| E-2가 과잉 시프트로 **평일 양도일까지 당겨** 정상 케이스를 깨뜨림 | A-8 대조군을 먼저 심어 두고 수정 |


---

## 8. Do 실행 기록 (2026-08-27)

### 반영한 것

| 결함 | 변경 | 파일 |
|---|---|---|
| **A** (세액) | `updateFormData`가 `result`·`aggregateResult`를 무효화 | `lib/stores/calc-wizard-stock-store.ts` |
| **B** (표시) | 신고서 12-1(환산 분자)·12-2(분모) 행 신설 + 11행 라벨에 「환산취득가액」 명시 + 분모 자동대체 병기 | `StockFilingFormTableHelpers.ts` |
| **B** (배선) | 비과세 정보용 경로의 취득후상장 분기에 `conversion*` echo 채움 | `exempt-informational-acquisition.ts` |
| **C-1** (인용) | `sectionLabel` 가목 1)·2) 라벨 교정 + `Record<union, string>`으로 좁힘 | `StockFilingFormTableHelpers.ts` |
| **C-2** (인용) | 장외 비대주주 → `①3가2)` · 장내 비대주주 → `해당없음`(union 신설) | `stock-classification.ts` · `types/stock-transfer.types.ts` |
| **E-1** (세액) | 소급 1개월 **말일 클램프**(민법 §160②) — 월말 윈도우 절단 해소 | `lib/kiwoom/calendar.ts` |
| **E-1** (dual-truth) | UI 복제 구현을 `buildOneMonthBeforeSlots` 위임으로 통합 | `PostListingClosingPriceTable.tsx` |
| **E-3·E-4** | 「직전」→「이전」 · 「소령 §99①3」→「소득세법 §99①3」 · 반대로 적힌 주석 교정 | 종가표·PostListing·Kiwoom·결과카드 4파일 |

### 신규 anchor

| 파일 | 건수 |
|---|---|
| `__tests__/stores/stock-store-result-invalidation.anchor.test.ts` | 4 (A-1) |
| `__tests__/components/calc/stock-transfer/transfer-1month-window.anchor.test.ts` | 9 통과 + 3 보류(A-7) |
| `__tests__/tax-engine/stock-transfer/section-94-1-3-ga-assignment.anchor.test.ts` | 7 (A-4·A-5) |
| `__tests__/components/calc/stock-transfer/filing-form-conversion-rows.anchor.test.ts` | 6 (A-3) |
| `e2e/stock-transfer-stale-result.spec.ts` | 1 (A-2) |

기존 anchor 갱신 1건 — `on-market-venue.test.ts` OM-2(`①3가1)` → `①3가2)`, 조문 근거 주석 첨부).

### 🔴 Do 중 판정 뒤집힘 (계획서 정정)

1. **「echo 필드 신설 필요」가 틀렸다.** `valuationDetail.conversionAcqStdPerShare`·`conversionTransferStd`·
   `conversionUsedFallback`이 **이미 존재**했다. 진짜 갭은 ① 비과세 정보용 경로의 취득후상장 분기가
   그 필드를 **안 채우는 것**과 ② **화면이 그 필드를 한 번도 읽지 않는 것**이었다.
   ⇒ 타입 신설을 되돌리고 배선만 했다.
2. **dual-truth 발견.** 같은 「양도일 이전 1개월」을 `preTransferAutoFillDates`(UI)와
   `buildOneMonthBeforeSlots`(키움 자동조회 API)가 **각자 계산**하고 있었고 **둘 다 같은 결함**이었다.
   P-4가 0건이었던 것은 UI 복제본만 변이시켰기 때문이다 — calendar 쪽에는 안전망이 있었다.
   ⇒ UI를 calendar에 위임시켜 단일 소스로 통합했다.
3. **E-2는 기존 anchor와 충돌한다.** `__tests__/kiwoom/calendar.test.ts:33-37`이
   「2024-03-01(삼일절) → anchor 그대로」를 이미 고정하고 있었다. 조문(§63①1가목 괄호)은 전일 기준을
   지지하나 **기존 anchor를 뒤집는 세액 변경**이므로 V-8 원칙대로 보류했다(A-7 `describe.skip`).
4. **`calendar.ts:148-152` 주석에 이미 근거가 있었다** — 「"이전·이후" = 양도일 포함 / "전·후" = 미포함
   (**사용자 검증, 2026-05-19**)」. 제보와 정확히 일치한다. 반대로 적힌 쪽은
   `TransferDate1MonthClosingPriceTable.tsx` 헤더 주석이었다.

### Q-4 (신규 · 사용자 결정 대기)

**비거래일 양도일의 anchor 시프트를 「주말만」에서 「공휴일·납회 포함」으로 넓힐 것인가?**

- 조문: 상증법 §63①1가목 괄호 「평가기준일이 **공휴일 등** 매매가 없는 날이면 **그 전일**을 기준」
  + 상증령 §52의2④(공휴일·대체공휴일·토요일)
- 현행: 주말만 시프트. 삼일절·현충일 등 **평일 공휴일**과 납회기간(12/29~31)은 그대로 둔다.
- 충돌: `__tests__/kiwoom/calendar.test.ts:33-37`이 현행 동작을 고정하고 있다.
- 참고: 상증세 평가용 `resolveValuationAnchor`는 **이미** 공휴일·납회를 시프트한다 — 두 세목이 갈려 있다.
- 영향: 윈도우 전체가 이동해 **평균·환산분모·세액이 바뀐다**.
