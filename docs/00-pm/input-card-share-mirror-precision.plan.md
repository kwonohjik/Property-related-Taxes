# 입력 카드 지분 안내 금액 `Math.floor(금액 × 지분)` 1원 과소 — 수정 계획서

**작성**: 2026-10-21 · **base**: master `f204df8f2` · **선행**: 지분 규약 `applyRatio` 십진 정확화 #2368(`docs/00-pm/share-ratio-apply-float-precision.plan.md` §9.4 「확인 필요」 2건을 이 계획서가 받는다)
**상태**: ✅ Plan 확정 (2026-10-21 사용자 승인 — 결정 사항 없음) → Do
**실측 원자료**: 세션 scratchpad `plan3-a/`(probe1·3·4.ts · probe2.mjs · render/body/den.probe.test.tsx · scan.mjs · scan.out) — 세션이 끝나면 지워진다. 제품 코드·테스트는 아직 한 줄도 바꾸지 않았다(`git status` clean).

---

## 1. 요약

#2368이 `applyRatio`를 십진 정확 계산으로 바꾸고 사이드바·신고서 거울 9곳을 통일했지만, **입력 카드의 안내 금액 2곳**은 옛 식 `Math.floor(금액 × 지분)`이 남았다. 둘 다 화면에 보이는 숫자일 뿐 **store에 저장되지도 API로 가지도 않는다**(§2) — 영향은 «사용자가 입력 단계에서 보는 금액이 계산 결과 단계의 금액과 1원 다르다»는 것이다.

| # | 위치 | 화면 | 70% · 입력 340,000,000 / 21,000,000 |
|---|---|---|---|
| A | `components/calc/transfer/CompanionSaleModeBlock.tsx:197` | 「자동 계산 (총 양도가액 × 지분율)」 카드 | 화면 **237,999,999** · ④ transferPrice **238,000,000** |
| B | `components/calc/transfer/asset-sections/AssetSectionExpense.tsx:89` | 「양도비」 칸(잠김) 값 + 힌트 「자동 안분 …」 | 화면 **14,699,999** · ④ transferExpense **14,700,000** |

- 수정은 두 줄(`Math.floor(x * ratio)` → `applyRatio(x, ratio)`) + 정적 가드 `GUARDED_FILES`에 두 파일 추가 + 렌더 anchor다.
- 둘 다 `ratio`가 ④의 `getOwnershipRatio`와 **같은 double**임을 확인했다(§3.3) — 식만 바꾸면 ④와 1원도 안 다르다.

## 2. 현황 — 두 곳이 보여주는 값과 대응하는 엔진 값

### 2.1 A — `FractionalAutoSalePriceCard` (`CompanionSaleModeBlock.tsx:184-216`)

- 식: `total = Number(contractTotalPrice 콤마 제거)`, `ratio = num/den`(`:196`), `allocated = total > 0 && ratio > 0 ? Math.floor(total * ratio) : 0`(`:197`). 표시 `allocated.toLocaleString()`(`:205`).
- 렌더 게이트(`:230-250`): `ratioReady`(`ownN>0 && ownN<ownD && ownD>0 && contractTotalPrice`) 이고 `fractionalActive = isFractionalSplit || (ratioReady && singleMode)`. 즉 **단건 지분** 또는 **축 B(같은 물건 지분 분할)** 에서만 뜬다. 함께양도(다른 물건) 묶음의 지분 자산은 이 카드가 아니다(`:238-242` 주석).
- 같아야 하는 엔진 값:
  - 단건: `transferPrice = applyRatio(totalContractPrice, primaryRatio)` — `lib/calc/transfer-tax-api.ts:285`(`primaryRatio = getOwnershipRatio(primary)` `:190`).
  - 축 B 컴패니언: `fixedSalePrice = applyRatio(totalContractPrice, ratio)` — `lib/calc/transfer-tax-api-companion-payload.ts:221-222`.
  - 사이드바(#2368에서 통일): `transfer-per-asset-summary.ts:202`(축 B)·`:400`(단건).
- **저장·전송**: 카드(`FractionalAutoSalePriceCard`)는 props로 문자열 3개만 받고 콜백이 없다 → store write 없음. 표시 전용.

### 2.2 B — 양도비 자동 안분 IIFE (`AssetSectionExpense.tsx:83-124`)

- 식: `formTotal = parseAmount(totalTransferExpense)`(`:84`), `ratio = … ? Math.min(num/den, 1.0) : 1.0`(`:88`), `allocated = formTotal > 0 ? Math.floor(formTotal * ratio) : 0`(`:89`). `useFormLevel = formTotal > 0`(`:90`).
- `allocated`가 쓰이는 곳: `CurrencyInput value={useFormLevel ? (fractional ? String(allocated) : "") : asset.transferExpense}`(`:97`), `disabled={useFormLevel}`(`:99`), 힌트 「자동 안분 {allocated} = 총 양도비 … × 지분 {num}/{den}」(`:101-103`의 `fractional` 갈래). **`fractional`이 아니면 `allocated`는 어디에도 표시되지 않는다.**
- 같아야 하는 엔진 값:
  - 단건: `primaryEffectiveTransferExpense = … applyRatio(formTotalTransferExpense, primaryRatio)` — `transfer-tax-api.ts:228-237`.
  - 컴패니언: `effectiveTransferExpenseFor`(`transfer-tax-api-asset-basics.ts:213-226`) → `companion-payload.ts:502`.
- **저장·전송 여부 — 표시 전용(실측)**: `CurrencyInput`의 `onChange`는 사용자 타이핑 핸들러(`CurrencyInput.tsx:91-96`)에서만 불리고 마운트·value 변경 effect는 `setLocalRaw`만 한다. 이 칸은 `disabled`다. 렌더 probe에서 **마운트 시 `onChange` 호출 0회**를 확인했다(`render.probe.test.tsx`). 칸의 `value`는 store의 `asset.transferExpense`와 무관하다(`useFormLevel`이면 store 값을 가리고 계산값을 보여 줄 뿐). ⇒ 영향은 화면 숫자뿐이다 — store·sessionStorage·API body·validate에 닿지 않는다(14지점 ①~⑧·⑨~⑭ 해당 없음).

### 2.3 렌더 probe — 현재 화면 (실측)

```
A: 자동 계산 (총 양도가액 × 지분율)  237,999,999 원  / 340,000,000 × 70/100 = 70% × 총양도가
B: 양도비 칸 value=237,999,999 disabled=true / 힌트 「자동 안분 237,999,999 = 총 양도비 340,000,000 × 지분 70/100」
```
(둘 다 입력 340,000,000 · 70%. 참값 238,000,000.)

## 3. 실측 (추정 아님 — 전부 probe 실행값)

### 3.1 고정 사례 — 화면 식 vs 엔진 값 (`probe1.ts`: 카드 식을 그대로 옮긴 함수 vs `getOwnershipRatio`+`applyRatio`/`effectiveTransferExpenseFor` 실함수)

| 지분 | 입력 금액 | 화면(옛 식) | 엔진 |
|---|---|---|---|
| 70% | 340,000,000 | 237,999,999 | 238,000,000 |
| 70% | 21,000,000 | 14,699,999 | 14,700,000 |
| 70% | 1,518,341,200 | 1,062,838,839 | 1,062,838,840 |
| 70% | 170,000,000 | 118,999,999 | 119,000,000 |
| 35% | 90,000,000 | 31,499,999 | 31,500,000 |
| 57% | 50,000,000 | 28,499,999 | 28,500,000 |
| 90.6% | 50,000,000 | 45,299,999 | 45,300,000 |
| 58.12% | 50,000,000 | 29,059,999 | 29,060,000 |

양도비 카드(B)도 같은 금액에서 같은 값이다(`cardExpense` = `cardSale`). ④ body 실측(`body.probe.test.tsx`, 70% · 총액 340,000,000 · 총 양도비 21,000,000, fetch 가로채기): `transferPrice 238000000`, `transferExpense 14700000` — A·B의 «맞아야 할 값».

### 3.2 불일치율 — 금액 분포에 따라 크게 다르다

- **무작위 금액**(10만~50억, 20만 건): 70% 1.56% · 35% 0.76% · 57% 0.53% · 90.6% 0.16% · 58.12% 0.04%. 12.5·30·33.3333·50·55·66.6667% 등은 0. 정수 % 1~99 평균 0.046%. 화면이 엔진보다 **큰** 경우 0건(과소만).
- ⚠️ **사용자는 무작위 금액이 아니라 둥근 금액을 입력한다.** 오차는 «참값이 정수일 때만» 나므로 둥근 금액에서 훨씬 잦다. **100만 원 단위 금액 5,000건**(100만~50억): 70% **15.3%** · 35% 15.3% · 57% **55.4%** · 90.6% **75.5%** · 58.12% **91.7%** · 50%·30%·12.5% 0%. #2368 계획서 §3.1의 0.04~1.5%는 무작위 금액 기준이라 **실사용 빈도를 과소 표현**한다(이 계획서가 처음 측정).
- 오차는 항상 1원, 방향은 항상 과소(화면 < 엔진).

### 3.3 «식만 바꾸면 ④와 1원도 안 다른가» — 동치 검증

- **A**: 카드 `ratio = parseFloat(numerator)/parseFloat(denominator)` ↔ `getOwnershipRatio` = `Math.min(parseFloat(n||"100")/parseFloat(d||"100"), 1.0)`(`asset-basics.ts:136-141`). 카드는 `ratioReady`(`ownN<ownD`)일 때만 뜨므로 `min(…,1.0)`의 클램프가 걸리지 않아 **같은 double**. 금액: 카드 `Number(…콤마 제거)` ↔ ④ `parseAmount`(parseInt). `CurrencyInput`이 숫자만 저장하므로 정수에서 같다(소수점 문자열이 들어오는 외부 경로는 확인하지 못했다 — §8).
- **B**: 카드 `Math.min(num/den, 1.0)`(`:88`) ↔ `getOwnershipRatio` — 같은 식. `allocated`는 `fractional`(`0<n<d`)일 때만 표시되고 그때 `min`의 상한은 걸리지 않는다. `n≥d`·`n≤0`·분모 비정상은 `fractional=false`라 표시 안 됨 ⇒ **클램프는 표시 경로에서 죽은 코드**다(동치 확인, 손대지 않는다).
- probe1이 카드 식과 `getOwnershipRatio`+`applyRatio`를 지분 14종 × 20만 금액으로 대조: 새 식으로 바꾸면 **불일치 0**이어야 하는 지점을 §5 anchor가 고정한다.

## 4. 범위 — 전수 역grep (`components/` · `app/` · `lib/stores/` · `lib/calc/`)

방법: `Math.floor( … * <지분 비율> )`을 가드와 같은 규칙(이름이 `ratio|ownRatio|ownershipRatio|primaryRatio|shareRatio`로 끝나거나 `(a / b)` 괄호 식) + 넓은 규칙(`share|pct|portion|fraction|ownN|numerator` 등 포함)으로 스캔(`scan.mjs` → `scan.out` 50건), 별도로 `ownershipNumerator` 소비 파일 27개(`lib/calc/transfer-tax-api*` 제외 — 그쪽은 §4.1 이미 applyRatio)와 `Math.round|trunc|ceil`·`ownN|ownD|num / den|n / d` 변형도 훑었다.

### 4.1 이 계획서의 대상 (applyRatio 경로 — 2곳)

| 위치 | 비고 |
|---|---|
| `CompanionSaleModeBlock.tsx:197` | A |
| `AssetSectionExpense.tsx:89` | B |

이 둘 외에 **지분 비율로 금액을 직접 곱하는 곳은 더 없다**(양도세 `components/`·`app/calc`·`lib/stores`·`lib/calc` 전역). 확인한 «이미 applyRatio»: `BurdenedGiftBlock.tsx:499`, `HousingContribEstimatedSection.tsx:56`(`computeLumpSumDeductionBase`), `transfer-tax-validate.ts:478-481`, #2368 거울 9곳.

### 4.2 범위 밖 — 지분 규약(applyRatio)이 아닌 것

| 위치 | 비율의 정체 | 분류 |
|---|---|---|
| `app/api/calc/transfer/mixed-use-part-cards.ts:121·122·167~169` | `ratio = hp.nonBusinessTransferRatio ?? 0`(`:120`) — 비사업용 양도 비율 | NBL 비율 — #2368 §9.4 이미 분류 |
| `app/api/calc/transfer/bundled-companion-split.ts:207·255` | `excessRatio = excessArea / totalArea`(`:171`) — 면적 비 | 배율 초과 안분 — 지분 아님 |
| `app/api/calc/transfer/general-building-route-actual.ts:357·360·365·474` | `landRatioNum = landStdAtTransfer / totalStd`(`:276`) · `acqLandRatioNum`(`:300`) — 기준시가 비 | 파트 안분 — 지분 아님 |
| `components/calc/results/transfer/FilingFormTableFinancials.ts:74·81·105~142·186·191·277·310~317` | `hpLandRatio = hp.landTransferGain / hp.transferGain`(`:94`) 등 — 결과 값끼리의 비 (`taxableRatio`·`housingExemptRatio`는 정의를 읽지 않았다 — 변수명 기준 분류) | 엔진 결과 분해 — 지분 입력이 아님 |
| `lib/calc/gift-burdened-transfer-api.ts:653` | 채무비율 `debtRatio` | #2368 Q2 (a) 별건(축 D) |
| `components/calc/acquisition/**` (`taxableRatio`) · `components/calc/stock-transfer/**` (`rate`·`ratio`·`selfShares`) · `components/calc/results/Multi*` (`taxBaseShare × rate`) · `lib/calc/inheritance-deduction-suggest.ts:453` | 다른 세목·세율 | 범위 밖 |
| `app/api/calc/transfer/bundled-apportionment.ts:268` | **나눗셈** `Math.floor(안분액 / 지분)` (물건 전체 복원) | 곱셈 패턴 아님. 참고: 정확 지분액 5개 지분 × 약 3.2만 건에서 `floor(정확 지분액 / 비율) ≠ 원금액` **0건**(`probe2.mjs`, 무작위 표본 — 증명 아님) |
| 퍼센트 문자열 표시 `(ratio*100).toFixed(…)` 전반 | 금액 아님 | 해당 없음 |

### 4.3 `Math.min(num/den, 1.0)` 클램프 ↔ applyRatio 경로 동치 (요청 3)

§3.3-B: 표시 경로(`fractional=true`)에서 클램프는 걸리지 않는다. 걸리는 경우(`n≥d`)의 `allocated`는 화면에 쓰이지 않는다. ⇒ 동치. 안전 측으로 클램프 식은 **그대로 둔다**(Surgical).

## 5. 설계안 (최소 변경)

### 5.1 제품 코드 — 2파일 각 import 1줄 + 식 1줄

1. `CompanionSaleModeBlock.tsx`: `import { applyRatio } from "@/lib/tax-engine/tax-utils";`(한 줄에 named 하나 — ESLint `--fix` 함정), `:197`을 `const allocated = total > 0 && ratio > 0 ? applyRatio(total, ratio) : 0;`로. 가드 `total > 0 && ratio > 0`·`ratioPct`·표시 문구·`:182` JSDoc의 «Math.floor» 표기만 「`applyRatio`(지분 규약)」로 정정.
2. `AssetSectionExpense.tsx`: 같은 import, `:89`를 `const allocated = formTotal > 0 ? applyRatio(formTotal, ratio) : 0;`로. `ratio` 식·`useFormLevel`·힌트 문구는 그대로.
3. 클라이언트 컴포넌트에서 `tax-utils`를 import하는 선례가 있다(`BurdenedGiftBlock.tsx:37`) → 번들·순환 문제 없음.

**하지 않는 것**: 두 카드를 `getOwnershipRatio(asset)`로 통일(A는 asset이 아니라 문자열 prop을 받는다 — 시그니처 변경), 공용 헬퍼 추출(단일 사용 추상화), 힌트 문구 개편, 아래 §7의 별건 관찰 수정.

### 5.2 정적 가드 — `__tests__/lib/share-ratio-apply-policy.test.ts`

- `GUARDED_FILES`에 `components/calc/transfer/CompanionSaleModeBlock.tsx` · `components/calc/transfer/asset-sections/AssetSectionExpense.tsx` 추가 → 첫 `it`이 두 파일의 `Math.floor(… * 지분 비율)` 0건을 강제. 헤더 주석의 「범위 밖 (알려진 별건)」 문단을 삭제하고 거울 9곳 → 11곳으로 문구 갱신.
- 둘째 `it`(applyRatio 실제 호출 수)에 두 파일 `toBeGreaterThanOrEqual(1)` 추가 — 가드가 «아무것도 안 보는» 상태로 통과하지 않게.
- 가드의 `isRatioOperand`가 두 파일의 현 식을 이미 잡는지 사전 확인: `Math.floor(total * ratio)`·`Math.floor(formTotal * ratio)` 모두 `ratio` 접미 → 잡힌다(Do 시작 전 가드를 먼저 확장해 **수정 전 2건 실패**를 확인).
- ⚠️ `__tests__/lib/estimated-acq-float-policy.test.ts`에도 별개 `GUARDED_FILES`(`:29`)가 있다 — 건드리지 않는다(다른 패턴·다른 파일 목록).

### 5.3 anchor — 렌더 테스트 (순수 계산 추출은 안 한다)

신규 `__tests__/components/input-card-share-mirror-precision.anchor.test.tsx`(jsdom — `.test.tsx`라 자동). 두 컴포넌트를 직접 렌더하는 선례가 있다(`companion-sale-mode-partial-share.test.tsx` · `partial-expense-apportion-note.test.tsx`). 식이 한 줄이라 추출은 «단일 사용 추상화»다.

1. **PREMISE**: §3.1 표의 (지분, 금액) 쌍에서 `Math.floor(x * (parseFloat(p)/parseFloat("100"))) === 기대값 − 1` — 입력이 옛 식 1원 과소인 쌍임을 고정(기존 `share-ratio-apply-float-precision.api.anchor`의 PREMISE와 같은 방식. 공유 단언이 아니라 쌍마다 리터럴).
2. **A 표**: `CompanionSaleModeBlock`(`singleMode`, `ownershipNumerator=p`, `ownershipDenominator="100"`, `contractTotalPrice=x`) → 카드 텍스트에 기대 리터럴(예 `238,000,000 원`)이 있고 옛 값(`237,999,999`)은 없다. 쌍: 70%·340,000,000 / 35%·90,000,000 / 57%·50,000,000 / 90.6%·50,000,000 / 58.12%·50,000,000. 축 B(`isFractionalSplit`, `singleMode` 없음) 1건.
3. **B 표**: `AssetSectionExpense`(asset 지분 `p`/100, `totalTransferExpense=x`) → `getByLabelText(/양도비 \(원\)/).value` = 기대 리터럴, 힌트에 `자동 안분 {기대}`. 쌍: 70%·21,000,000 → 14,700,000 등. 같은 렌더에서 `onChange` mock 호출 0회(표시 전용 고정).
4. **대조군(회귀 가드)**: 50%·170,000,000 → 85,000,000(옛 식도 같은 값) · 100%(`fractional=false`) → B 칸 value `""` · 순환 소수 레거시 1/3(분자 `1`, 분모 `3`) × 300,000,000 → 100,000,000 (applyRatio의 float 갈래 — #2368 §3.2 «1/3은 옛 식이 맞다» 유지).
5. **카드 = ④ 연결 anchor**: `callTransferTaxAPI`를 `fetch` 가로채기(`vi.stubGlobal`, 400 응답)로 호출해 body를 잡고(본 계획서 probe에서 실제로 동작 확인) `body.transferPrice` = A 카드 숫자, `body.transferExpense` = B 칸 숫자. 「사이드바 행 = ④ body」(`share-ratio-apply-float-precision.api.anchor.test.ts`)와 같은 불변을 입력 카드로 확장 — route(`POST`)까지는 안 간다(표시 값 = 변환 값이면 충분).

### 5.4 뮤테이션 계획 (Do에서 실행 — 하네스는 `git checkout` 금지, 백업 복사·sha 확인 방식)

| ID | 변형 | 기대 |
|---|---|---|
| M1 | A `:197` `applyRatio(total, ratio)` → `Math.floor(total * ratio)` | A 표 anchor + 가드 KILLED |
| M2 | B `:89` 같은 되돌리기 | B 표 anchor + 가드 KILLED |
| M3 | 가드 단독 실행으로 M1·M2 | 가드만으로 2/2 KILLED |
| M4 | B `value`에서 `fractional ?` 게이트 제거(100%에서도 allocated 표시) | 대조군 «100% → 빈 값» KILLED |
| M5 | A `total > 0 && ratio > 0` 에서 `ratio > 0` 제거 | **생존 예상(동치 변형)** — `applyRatio(total, 0)`=0이라 결과가 같다. 테스트로 죽이려 하지 않고 «동치»로 기록 |
| M6 | B `Math.min(…, 1.0)` 제거 | **생존 예상(동치 변형)** — §4.3, 표시 경로에서 클램프가 안 걸린다 |
| M7 | A·B에서 `ratio`를 `getOwnershipRatio`와 다른 식(예 `num/(den+1)`)으로 | 카드 = ④ 연결 anchor KILLED |

`applyRatio` 내부 변형은 #2368에서 17/17 KILLED로 끝났으므로 반복하지 않는다.

### 5.5 검증 순서 (Pre-Do anchor 우선)

1. anchor·가드 확장을 **제품 코드 수정 전에** 먼저 넣고 실행 → A·B 표·연결 anchor·가드 **수정 전 실패 건수**를 기록(통과하면 premise가 틀린 것).
2. 제품 코드 2줄 수정 → 같은 파일 전건 통과.
3. 회귀: `npx vitest run __tests__/components/input-card-share-mirror-precision.anchor.test.tsx __tests__/lib/share-ratio-apply-policy.test.ts __tests__/components/companion-sale-mode-partial-share.test.tsx __tests__/components/partial-expense-apportion-note.test.tsx`(수정 전 후 3파일 15건 통과 확인함) → `npm run test:transfer` → `npx tsc --noEmit`.
4. 뮤테이션 M1~M7.
5. pre-push 범위는 **전체**로 판정된다(`scripts/select-test-scope.sh --stdin`에 변경 후보 5파일을 넣어 실측: `test`).
6. 브라우저 수동 확인(단건 지분 70% · 양도가 340,000,000 → 카드 238,000,000 / 총 양도비 21,000,000 → 양도비 칸 14,700,000 / 계산 후 결과 양도가액·필요경비와 대조)은 Do에서 Playwright로. 이 Plan 단계에서는 **수행하지 않았다**(jsdom 렌더 probe까지).

기존 테스트 영향: 두 컴포넌트를 참조하는 `__tests__`는 여러 파일이나(`grep` 20여 건) 내가 본문을 읽은 2개 — `companion-sale-mode-partial-share`(50%·10억)·`partial-expense-apportion-note`(지분 없는 asset) — 는 70% 계열 값을 단언하지 않는다. 나머지는 읽지 않았다 — 확인 필요. E2E는 「자동 계산 (총 양도가액」·「자동 안분」 문구를 단언하는 spec이 없다(`grep e2e` 0건). 기존 기대값 수정은 **없을 것으로 예상** — Do에서 전체 테스트로 확인.

## 6. 사용자 결정

**결정 사항 없음.** 근거: (1) 두 곳 모두 표시 전용이라 저장·API·세액 정책에 닿지 않고, (2) 바꾸는 값은 «이미 확정된 단일 규약 `applyRatio`(#2368)와 같은 값을 쓴다»는 한 방향뿐이며, (3) 클램프·가드·문구는 그대로 둔다. #2368 §9.4가 이미 «가드에 두 파일을 더한다»를 후속으로 명시했다.

## 7. 범위 밖 · 별건 관찰 (이 PR이 건드리지 않는다)

- **카드 A는 분모가 빈 문자열이면 «0 원»을 보인다**: `ownershipDenominator=""`, 분자 70이면 `ratioReady`는 분모 기본값 `|| "100"`(`:229`)으로 통과하지만 카드는 `parseFloat("")`=NaN → `ratio=0` → 「0 원 / 70/? = —%」(렌더 probe `den.probe.test.tsx` 실측). ④의 `getOwnershipRatio("70","")`는 0.7. `OwnershipRatioInput`이 분모를 항상 `"100"`으로 쓰고(`OwnershipRatioInput.tsx:104`) 신규 자산 기본값도 `"100"`(`calc-wizard-asset-factory.ts:158`)이라 **위젯 경로에서는 도달하지 않는다**(레거시 sessionStorage 데이터만 확인 필요). 정밀도 문제가 아니므로 이 PR 범위 밖.
- **B는 자산-수준 양도비가 이미 있어도 «폼 총 양도비 × 지분»을 보인다**: 카드는 `formTotal > 0`이면 잠그고 `formTotal × ratio`를 보이는데, ④(`transfer-tax-api.ts:228-237`)는 `asset.transferExpense > 0`이면 그 값 × ratio를 우선한다. 두 값이 다 있는 상태가 UI로 만들어지는지는 확인하지 못했다 — 확인 필요. 정밀도와 무관한 별건.
- 채무비율(축 D)·다른 세목 비율 곱·`multiplyByAreaShare` 순환 소수: #2368 §7·§9.3~9.4 그대로.

## 8. 확인 필요 (미검증 — 추정으로 단정하지 않음)

1. `contractTotalPrice`에 소수점이 든 문자열이 들어오는 경로가 있는가(카드 `Number(…)` vs ④ `parseAmount`=`parseInt`가 갈린다 — 있다면 A를 `parseAmount`로 맞출지 Do에서 결정). 정상 입력(`CurrencyInput` 숫자만 저장)에서는 같다.
2. §7 두 번째 항목: 자산-수준 `transferExpense > 0` + 폼 `totalTransferExpense > 0` 동시 상태가 UI로 만들어지는가.
3. 레거시 sessionStorage에 분모가 빈 문자열인 자산이 실제로 남을 수 있는가(§7 첫째).
4. 브라우저·Playwright 확인은 Plan 단계에서 하지 않았다(jsdom 렌더 + ④ body 가로채기 probe까지).
5. 100만 원 단위 격자 불일치율(§3.2)은 «둥근 금액» 대리 지표일 뿐 실제 사용자 입력 분포가 아니다.
