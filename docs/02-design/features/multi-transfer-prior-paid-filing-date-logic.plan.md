# 다건 양도세 기납부세액 — 신고일 비교 로직으로 전환 (기신고 양도소득금액과 정합)

> 작성일: 2026-07-06 · 대상: 다건 신고서 양식(합산)의 «기납부세액(예정신고 §111③)» 국세·지방
> 증상: 단건 신고서 2건을 불러와 합산 시, 기납부세액이 **두 건을 단순 합산**해서 표시됨(이미지 138,050,712 / 지방 13,805,070).

## 1. 배경·목표

기신고 양도소득금액(§103)은 이미 "가장 늦은 신고일(확정신고분)보다 신고일이 빠른 자산들의 양도소득금액만 합산"하도록 구현돼 있다(`FilingFormTableAggregateHelpers.ts:256-270`, PR #514). 그러나 **기납부세액(국세·지방)은 신고일 무관하게 불러온 모든 자산의 결정세액을 단순 누적**한다. 목표는 기납부세액을 기신고 양도소득금액과 **동일한 신고일 비교 로직**으로 산정하는 것 — 즉 확정신고분(가장 늦은 신고일 자산)보다 신고일이 빠른 자산들의 예정신고 납부세액만 합산.

## 2. 근본 원인 (코드 실증)

### 2.1 "단순합"의 실제 위치 = 이력 불러오기 auto-fill (엔진 아님)

- 엔진은 `input.priorPaidTax`를 **echo만** 한다. `transfer-tax-settlement.ts:50-53`이 `max(0, 결정세액 − priorPaidTax)` 정산만 수행. autoPriorPaid·단순합 로직은 엔진에 **없음**(`AggregateTransferInput.priorPaidTax` 주석 "자동 안분·추정 없음").
- 단순합은 **`MultiTransferTaxCalculator.tsx:301-317 handleLoadSingle`**: 단건 이력을 편입할 때 `extractLoadPriorPaid`(`transfer-multi-load-entry.ts:26-40`)가 record의 standalone `result.determinedTax`(국세)·`result.localIncomeTax`(지방)를 뽑아 **신고일 무관하게** `form.priorPaidTax += pp.national` / `priorPaidLocalTax += pp.local`로 누적(310-312행).
- 이 누적 총액 → `multi-transfer-tax-api.ts:231-232` body → 엔진 `input.priorPaidTax` → settlement → `aggregated.priorPaidTax` → 신고서 양식(`FilingFormTableAggregateHelpers.ts:284,286`) + 요약 카드(`MultiTransferTaxSummaryCard.tsx:107-112`) 표시.

### 2.2 왜 display-only 수정이 불가한가 (핵심 함정)

기신고 양도소득금액은 순수 **display 계산**(엔진 무관)이라 표시 레이어에서 재산정하면 끝이었다. 그러나 기납부세액은 다르다:
- 신고서 «차감납부할세액» 행(`deductedPayable` = `aggregated.settlementAdditionalPayable`, 285행)은 **엔진이 `input.priorPaidTax`로 계산**한다.
- 만약 기납부세액 행(284)만 표시 레이어에서 신고일 필터로 다시 계산하면, «기납부 행»은 필터값(작음) / «차감납부 행»은 미필터값(엔진) 기준 → **두 행이 cross-foot 안 맞음**. 요약 카드·납부 카드와도 dual-truth.
- ⇒ 필터링은 반드시 **엔진 입력(`priorPaidTax`)에 반영**해 settlement가 같은 값을 쓰게 해야 한다(단일 진실). memory `feedback_ui_engine_dual_truth_avoidance`.

### 2.3 상태 구조 제약

`form.priorPaidTax`는 **누적 총액 문자열 1개**(`multi-transfer-tax-store.ts:38,40`)라, 저장된 뒤에는 신고일로 "역-분해"가 불가능하다. 자산별 예정세액을 보존해야 신고일 필터가 가능하다.

## 3. 설계 (Approach A — 엔진 단일 진실 + 신고일 필터 파생)

### 3.1 자산별 예정세액 보존 (PropertyItem 확장)

`PropertyItem`(`multi-transfer-tax-store.ts:12`)에 optional 필드 추가:
```ts
/** 이력 불러오기 시 포착한 예정신고 납부세액(standalone) — 신고일 필터 기납부 산정용 */
priorPaidNational?: number;
priorPaidLocal?: number;
```
- `buildPropertyFromSingleRecord`(`transfer-multi-load-entry.ts:43`)가 `extractLoadPriorPaid(record,"single")` 결과를 이 필드에 담아 반환.
- **basis = record의 standalone `result.determinedTax`·`result.localIncomeTax`** — 실제 예정신고 시 납부한 세액. aggregate 안분값(`refDeterminedTax`)이 아니라 **실제 납부액**이 법정 기납부세액(§111③). 지방세도 record의 실제 `localIncomeTax`를 그대로 포착 → ×10% 파생 불필요·자산별 지방세 필드 부재 문제 우회.

### 3.2 순수 파생 함수 (신고일 필터) — 필터 로직 단일 출처

**필터 원시함수를 단일 정의**하고 priorIncome·priorPaid 양쪽이 import(중복 구현 금지 — memory `single-source-engine-helper`). `lib/calc/multi-prior-filed.ts`(신규) PropertyItem 타입만 의존(순환 없음):
```ts
/** 신고일이 가장 늦은 자산(확정신고분)보다 빠른 자산 인덱스 — priorIncome·priorPaid 공용 */
export function selectPriorFiledIndices(filingDates: string[]): number[] {
  const maxFilingDate = [...filingDates].filter(Boolean).sort().at(-1) ?? "";
  return filingDates.flatMap((d, i) => (d && maxFilingDate && d < maxFilingDate ? [i] : []));
}

export function computeAutoPriorPaid(properties: PropertyItem[]): { national: number; local: number } {
  const filingDates = properties.map((p) => p.form.filingDate || p.form.statutoryFilingDeadline || "");
  const idx = new Set(selectPriorFiledIndices(filingDates));
  let national = 0, local = 0;
  properties.forEach((p, i) => {
    if (idx.has(i)) { national += p.priorPaidNational ?? 0; local += p.priorPaidLocal ?? 0; }
  });
  return { national, local };
}
```
- `FilingFormTableAggregateHelpers.ts:259-270`의 priorIncome도 **동일 `selectPriorFiledIndices`를 import**해 재구현 제거 → 두 값의 필터가 코드로 단일화(대칭 보장).
- **대상 자산 집합 대칭 (실측 검증)**: `result.properties`는 `input.properties`와 1:1(`transfer-tax-aggregate.ts:398-401`, 비과세도 0으로 포함). `propertyFormMap`은 `result.properties`를 `form.properties`에 propertyId 매칭(`MultiTransferFilingFormSection.tsx:33-36`). ⇒ priorIncome(propertyFormMap)·priorPaid(form.properties)의 filingDate 소스가 동일 → maxFilingDate·대상집합 항상 일치.

### 3.3 3중 미러 배선 (memory `mirror-pattern`)

`priorPaidTaxEdited === false`(사용자 미편집)일 때 파생값 사용, `true`면 사용자 입력 우선:

| 지점 | 현행 | 변경 |
|---|---|---|
| **load 핸들러** | `handleLoadSingle`이 `form.priorPaidTax`에 **누적**(310-312) | 누적 제거. 자산 append만(예정세액은 PropertyItem에 보존). `doLoadMulti`도 동일 |
| **API 변환** | `parseAmount(multiForm.priorPaidTax)` (231-232) | `edited ? parseAmount(form.priorPaidTax) : computeAutoPriorPaid(properties).national` (지방 동일). **엔진 입력 = 필터값** |
| **설정 패널 value 바인딩** | `CurrencyInput value={form.priorPaidTax}` (119-130) | `value={edited ? form.priorPaidTax : String(derived.national)}` — ⚠️ **파생은 number → `String()` 변환 필수**(CurrencyInput이 parseAmount 재포맷). 지방 동일 |
| **설정 패널 auto 배지** | 조건 `!edited && (form.priorPaidTax !== "0" \|\| priorPaidLocalTax !== "0")` (106-107) | ⚠️ load 누적 제거로 `form.priorPaidTax`는 항상 "0" → **현 조건이면 배지 영영 안 뜸**. 조건을 파생값 기준으로: `!edited && (derived.national > 0 \|\| derived.local > 0)` |
| **validate** | priorPaid 검증 없음 | 무변경(차단 없음) |

> `derived = computeAutoPriorPaid(form.properties)` — 설정 패널은 이미 `form` 전체를 받으므로(`MultiTransferTaxCalculator.tsx:636`) **신규 prop 불요**, 컴포넌트 내부에서 `useMemo`로 1회 계산. API·설정 패널이 **동일 export fn을 import**(인라인 재구현 금지).

- 엔진 입력이 필터값이므로 `aggregated.priorPaidTax`(echo)·`settlementAdditionalPayable`·신고서 양식·요약 카드가 **모두 동일 basis** → cross-foot·dual-truth 해소.
- 사용자 편집 override UX(“자동(참고)” 배지 → 편집 시 제거, 이후 파생 중단)는 **그대로 보존**. 편집 시 `priorPaidTaxEdited: true`.
- `useEffect → store` 미러링 없음 — 파생은 **읽는 시점에 계산**(properties/filingDate 변경 시 자동 반영). memory `feedback_useeffect_store_mirror_forbidden`.

## 4. 케이스 매트릭스

| # | 시나리오 | 기대 (국세·지방) |
|---|---|---|
| P1 | 단건 A(신고일 이름) + 단건 B(신고일 늦음) 불러오기 | 기납부 = A의 예정세액만(B=확정신고분 제외). priorIncome=A income과 **대칭** |
| P2 | 3건: A·B(빠름) + C(가장 늦음) | 기납부 = A+B 예정세액 합 |
| P3 | 전 자산 신고일 동일 | 기납부 = 0 (strict `<`, priorIncome도 0 — 대칭) |
| P4 | 사용자가 기납부세액 직접 편집(edited=true) | 사용자 입력값 사용(파생 무시), 배지 제거 |
| P5 | 신고일 미입력 자산 → statutoryFilingDeadline(양도일 파생) fallback | priorIncome과 동일 fallback |
| P6 | 수동 추가(이력 미경유) 자산 | `priorPaidNational` undefined → 0 기여(예정신고 없음 = 정상) |
| P7 | bundled(§166⑥) | propertyFormMap/priorPaid 미주입 → filingDates "" → 0 (회귀 0) |
| P8 | 다건 record 통째 불러오기(`doLoadMulti`) | 자산별 standalone 예정세액 부재(aggregate result) → auto-fill 없음(0, §7-2) |
| P9 | 단건 1건만 로드(정산 대상 없음) | 파생 0 — 그 1건이 곧 확정신고분(자신). 배지 미노출. 기존 prepaid-load E2E Test 1 시맨틱 변경 |

## 5. Pre-Do Anchor (Do 진입 전 우선 작성·실행)

- **A1 (P1, 핵심)**: `computeAutoPriorPaid` 단위 테스트 — 자산 2건(A 신고일 2026-02-15/priorPaidNational=X·priorPaidLocal=x, B 신고일 2026-04-20/Y·y) → `{national: X, local: x}`(B 제외). 신설 fn이므로 red→green.
- **A2 (P3)**: 신고일 동일 2건 → `{national:0, local:0}`.
- **A3 (P1 대칭·실 브라우저 경로)** — ✅ 구현: `transfer-multi-prepaid-load.spec.ts` 재작성. 단건 2건(신고일 상이) 실제 폼→훅→파생 로드 → 신고일 빠른 A만 파생 → 설정 패널 auto 배지 노출로 검증(derived>0가 실 UI 도달). doLoadMulti는 배지 부재 단언.
  - 필터·basis·합산 정확도는 `multi-prior-filed.test.ts`(10케이스, A1·A2·P2·P6·P9·fallback)로 커버. 신고서 행은 엔진 echo(입력=파생값)라 cross-foot는 settlement가 보장(별도 heavy calculate-to-filing-form E2E는 disproportion으로 미추가 — 파이프라인 각 구간 검증으로 충족).

## 6. 회귀 검증 게이트

- [ ] Pre-Do anchor A1·A2 red→green
- [ ] `npx tsc --noEmit` 0건 (PropertyItem optional 필드 추가 — 기존 사용처 무영향 확인)
- [ ] `npx vitest run __tests__/tax-engine/transfer/ __tests__/calc/`(해당 시) + 신고서 양식 테스트 통과
- [ ] **⚠️ 기존 Phase A anchor 회귀 확인**: `transfer-multi-filing-form.spec.ts:178-179` 등이 "기납부 0 → 차감납부=총결정세액"을 단정. 신 로직에서 그 픽스처 자산들이 **신고일 차이 + priorPaidNational 값**을 가지면 기납부가 비-0으로 뒤집혀 단언이 깨질 수 있음 → Do 시 픽스처 실측(신고일 동일/미입력·priorPaid 부재면 0 유지=회귀 없음) 후 필요 시 anchor 갱신(memory `feedback_anchor_correction_legal_priority`)
- [ ] **⚠️ `transfer-multi-prepaid-load.spec.ts` 2건 갱신(의도된 시맨틱 변경)**:
  - Test 1(`:100` 단건 1건 → 배지): 신 로직은 자산 1건이면 파생 0(strict `<`, 정산 대상 없음) → 배지 미노출. **단건 2건(신고일 상이) 로드로 재작성**해 빠른 자산 예정세액이 배지·값에 반영됨을 검증.
  - Test 2(`:118` 다건 통째 로드 → 배지): §7-2로 `doLoadMulti` auto-fill 제거 → 배지 미노출. **배지 부재를 단언**하거나 수동입력 검증으로 재작성.
  - (배지 testid `prior-paid-tax-auto-badge` 실재 — A3에서도 사용)
- [ ] priorIncome 리팩터(`selectPriorFiledIndices` import) 후 기존 priorIncome anchor(`transfer-multi-filing-form.spec.ts` "기신고 양도소득금액 합계…") **green 유지**(동작 등가 확인)
- [ ] PropertyItem optional 2필드는 sessionStorage 구세션에서 undefined → `?? 0`로 흡수, 마이그레이션 불요 확인
- [ ] bundled 신고서 E2E 회귀 0 (`transfer-multi-filing-form`·`transfer-multi-amendment`)
- [ ] 브라우저(E2E): 단건 2건(신고일 상이) 불러오기 → 신고서 기납부세액 = 빠른 자산 예정세액, 차감납부 정합. 사용자 편집 시 override 동작

## 7. 열린 설계 판단 (사용자 확정 2026-07-06)

1. **예정세액 basis** — ✅ **실제 standalone 예정신고 결정세액**(이력 record `result.determinedTax`, 가산세 제외) 확정. aggregate 안분값(refDeterminedTax) 아님. 지방세도 record 실제 `localIncomeTax` 사용(×10% 파생 아님). §111③ 법정 기납부세액(실제 납부액)과 일치.
2. **`doLoadMulti`(P8)** — ✅ **0으로 두고 수동확정** 확정. 다건 record는 aggregate 결과만이라 자산별 standalone 예정세액이 없음 → `doLoadMulti`는 `priorPaidTax`/`priorPaidLocalTax` auto-fill을 **하지 않음**(현행 329-331행의 aggregate determinedTax 대입 제거). 사용자가 필요 시 직접 입력(override). ⚠️ 회귀: 기존 doLoadMulti auto-fill 제거는 의도된 동작 변경 — 신고서 양식 E2E에 반영.
3. **UI 표시 위치** — 파생값을 설정 패널 입력칸에 반영(현행 auto 배지 유지). 신고서 양식은 엔진 echo라 자동 정합. 추가 표시 불요.

## 8. 예상 변경 규모

- `lib/stores/multi-transfer-tax-store.ts`: PropertyItem optional 2필드(`priorPaidNational?`·`priorPaidLocal?`)
- `lib/calc/multi-prior-filed.ts`(신규): `selectPriorFiledIndices` + `computeAutoPriorPaid`. **PropertyItem 타입만 의존**(순환 없음). client 컴포넌트·api·filing-form helper 3곳이 import
- `lib/calc/transfer-multi-load-entry.ts`: `buildPropertyFromSingleRecord`가 `extractLoadPriorPaid` 결과를 PropertyItem에 포착
- `app/calc/transfer-tax/multi/MultiTransferTaxCalculator.tsx`: `handleLoadSingle`·`doLoadMulti` 누적 제거
- `lib/calc/multi-transfer-tax-api.ts`: body priorPaid 파생 분기(edited override)
- `components/calc/transfer/AggregateSettingsPanel.tsx`: 미편집 시 value 바인딩(`String(derived)`)·배지 조건 파생 기준. 신규 prop 불요(`form.properties` 보유)
- `components/calc/results/transfer/FilingFormTableAggregateHelpers.ts`: priorIncome이 `selectPriorFiledIndices` import(중복 필터 제거)
- 테스트: A1·A2 단위(`multi-prior-filed`) + A3 E2E + prepaid-load 2건 갱신
- 단일 브랜치 1회 ship 예상.

## 9. 자가 검토 로그 (plan-design-self-review-loop, 2026-07-06)

STEP 1 fork 3-way(오류·누락 / 모순·정책위반 / 개선·UI누락) 병렬 검토 → 병합. Critical 0, High 3, Medium 3, Low 2 정정.

**실측 통과(설계 견고 확인)**: cross-foot 보장(`transfer-tax-settlement.ts:49-53` input.priorPaidTax 경로)·대상 자산 집합 대칭(`result.properties` 1:1 `transfer-tax-aggregate.ts:398-401` + `propertyFormMap`=prop.form)·요약카드 정합(`MultiTransferTaxSummaryCard.tsx:109-111` echo)·validate 무변경·단건 저장 중첩 shape(obs 4656 "flat" 단서 현행 재현 안 됨)·`statutoryFilingDeadline` 실존.

**반영 정정**:
- **F1/F2 (High)**: 설정 패널 auto 배지 조건·CurrencyInput value를 파생값 기준으로(load 누적 제거 시 `form.priorPaidTax` 항상 "0" → 배지 안 뜸/값 0 표시 버그). number→`String()` 변환 명시. §3.3.
- **F3 (Medium)**: 신고일 필터를 `selectPriorFiledIndices` 공용 primitive로 단일화, priorIncome도 import(중복→드리프트 방지). §3.2·§8.
- **F5 (Medium)**: 파생 함수 위치 `lib/calc/multi-prior-filed.ts` 명시(PropertyItem 타입만 의존, 순환 없음). §8.
- **F6 blast-radius (High)**: `transfer-multi-prepaid-load.spec.ts` 2건이 신 시맨틱(단건 1건=0, doLoadMulti=0)으로 깨짐 → 갱신을 작업에 포함. §6·P8·P9.
- **F7/F8 (Low)**: 설정 패널 신규 prop 불요(`form.properties` 보유)·A3 셀렉터·픽스처 값 고정. §3.3·§5.

Critical/High 잔존 0(F1·F2·F6 반영 완료). 규모 "중"(엔진 input/result 신규 필드 없음 — `priorPaidTax`는 `AggregateTransferInput` 기존 필드) → STEP 5·12 디자인 문서 N/A.
