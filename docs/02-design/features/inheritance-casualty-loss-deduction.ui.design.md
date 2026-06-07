# 상속세 재해손실공제(상증법 §23) — UI 설계

> 계획서: `docs/00-pm/inheritance-casualty-loss-deduction.plan.md`
> 엔진 설계: `docs/02-design/features/inheritance-casualty-loss-deduction.engine.design.md`
> 작성일: 2026-06-07 / 13단계 자가검토 STEP 12

## Context

상속세 §23 재해손실공제 입력 UI 신규 추가. 기존 `disasterLossDeduction` 필드(steps.tsx:547, "재해손실공제 (§24 종합한도 분자 보정)")는 **§54/§24③ 분자 보정용**이므로 유지하되 라벨·hint를 명확화한다. §23은 **별도 필드군**으로 분리해 혼동을 차단한다.

---

## 사용자 시나리오

1. 상속재산 입력 후 Step 4(공제 입력)에서 "재해손실공제 신청(§23)" ToggleCard를 ON.
2. 재난 종류·발생일, 재해손실재산가액·보전가능금액 입력.
3. 자동계산 박스에 공제 신청액(= 손실 − 보전) 표시.
4. 계산 → 과세표준/세액에 §23 공제 반영, 결과 카드·부표3 ㉘에 표시.

---

## UI 위젯 (지점 ⑤) — Step 4 ToggleCard

```
┌─ [ToggleCard tone=rose]  재해손실공제 신청 (상증법 §23)        [ OFF | ON ] ─┐
│  신고기한(상속개시일 말일부터 6개월) 이내 화재·붕괴·폭발·자연재해 등으로     │
│  상속재산이 멸실·훼손된 경우 과세가액에서 공제                              │
│                                                                            │
│  ── ON 시 노출 ───────────────────────────────────────────────────────    │
│  ┌─ [sky 카드] ① 재난 정보 ─────────────────────────────────────────┐     │
│  │  재난 종류  [RadioCardGroup name="casualtyLossType"]              │     │
│  │    ( ) 화재 ( ) 붕괴 ( ) 폭발 ( ) 환경오염사고 ( ) 자연재해 ( ) 기타 │   │
│  │  재난 발생일  [DateInput casualtyLossDate]                        │     │
│  │    hint: §23 요건 — 상속개시일 후 ~ 신고기한(말일+6개월) 이내 발생   │     │
│  └──────────────────────────────────────────────────────────────────┘     │
│  ┌─ [rose 카드] ② 손실 산정 ────────────────────────────────────────┐     │
│  │  재해손실재산가액  [CurrencyInput casualtyLossValue]              │     │
│  │    hint: 멸실·훼손된 상속재산의 평가액 (상속개시일 평가 기준, §20②) │     │
│  │  보전가능금액      [CurrencyInput casualtyLossCompensated]        │     │
│  │    hint: 보험금 수령액·구상권 행사로 보전 가능한 금액. 없으면 0     │     │
│  │  ┌────────────────────────────────────────────────────────────┐  │     │
│  │  │ 공제 신청액 = 재해손실재산가액 − 보전가능금액   ▶  XXX        │  │     │
│  │  └────────────────────────────────────────────────────────────┘  │     │
│  └──────────────────────────────────────────────────────────────────┘     │
└────────────────────────────────────────────────────────────────────────────┘
```

- `RadioCardGroup`는 `name` 필수(`project_inheritance_personal_deduction_20` 교훈).
- `DateInput` 사용(type="date" 금지). `CurrencyInput`은 음수 불요(nonnegative).
- 토글 OFF도 tone 배경 유지(`feedback_toggle_card_visibility`).
- 자동계산 박스는 `useMemo`로 `max(0, loss−comp)` 표시 — store 미러링 금지(`feedback_useeffect_store_mirror_forbidden`).

### 기존 §24 보정 필드 라벨 명확화 (steps.tsx:547)

```
변경 전: "재해손실공제 (§24 종합한도 분자 보정)"
변경 후: "§24 분자 보정 — 사전증여 기간 §54 재해손실공제 (보정용)"
hint:    "사전증여재산에 적용된 §54 증여세 재해손실공제 합산액.
          §24 종합한도 분자에서 사전증여 합산가액을 차감할 때 보정에 사용.
          (상속세 §23 재해손실공제는 위 '재해손실공제 신청(§23)' 토글에서 입력)"
```

---

## 14개 동기화 지점

| 지점 | 파일 | 작업 |
|---|---|---|
| ① 폼 상태 | `inheritance/shared.ts` | `casualtyLossEnabled:boolean`, `casualtyLossValue:string`, `casualtyLossCompensated:string`, `casualtyLossType:enum`, `casualtyLossDate:string` |
| ② initial | `shared.ts` INITIAL_FORM | `false`/`""`/`""`/`"fire"`/`""` |
| ③ normalize | `normalize-restored-form-dates.ts` | **불요 (환류 2026-06-07)** — `casualtyLossDate`는 FormState `string`이라 JSON round-trip 보존. normalize는 `Date` 객체 필드(V2 주식) 전용. Check에서 over-spec 확인 |
| ④ API 변환 | `lib/calc/inheritance-api.ts:82` + steps.tsx 변환부 | FormState→`casualtyLoss` 객체 매핑 (toggle OFF → `casualtyLoss:undefined`) |
| ⑤ UI 위젯 | `inheritance/steps.tsx` Step 4 | 위 ASCII (ToggleCard + sky/rose 카드) |
| ⑥ 사이드바 | `lib/stores/inheritance-summary.ts` | 엔진 rawTotal 반영 → 과세표준 자동 변동. 입력단계 미리보기 선택적 |
| ⑦ 결과 카드 | 공제 breakdown 카드 | 엔진 breakdown step 자동 렌더 + 산식(아래). **부표3 ㉘ 교체는 엔진 시니어 담당**, UI는 CL-07 자기일관 검증 |
| ⑧ validation | `lib/calc/inheritance-validate.ts` (존재) | toggle ON 시: `casualtyLossValue` 필수, `casualtyLossDate` 필수+범위(deathDate≤date≤말일+6개월), `compensated>value` 차단. API와 동일 `max(0,…)` fallback |
| ⑨ Zod 메인 | `lib/validators/property-valuation-input.ts:672 부근` | `casualtyLoss` 객체 스키마 |
| ⑩ Zod 컴패니언 | — | 상속세 route는 superRefine 없음 — 날짜 교차검증은 ⑧에서 |
| ⑪ acqDate fallback | — | 해당 없음 (공제 전역 입력) |
| ⑫ Zod 입력객체 | `inheritanceDeductionInputSchema` 내 `casualtyLoss` | ⑨와 동일 + 엔진 타입 동기화 (TS 미감지 → grep) |
| ⑬ body spread | `inheritance-api.ts:82` (`deductionInput` 통째) | 변환부에서 `casualtyLoss` 명시 포함 확인 |
| ⑭ Route 매핑 | `app/api/calc/inheritance/route.ts:82~83` (`as cast`) | Zod·엔진 타입 추가 후 자동 도달 |

### ⑨ Zod 스키마 (casualtyLoss)

```ts
casualtyLoss: z.object({
  lossValue: z.number().nonnegative(),
  compensatedValue: z.number().nonnegative().optional(),
  disasterType: z.enum(["fire","collapse","explosion","environmental","natural","other"]).optional(),
  disasterDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  isWithinFilingDeadline: z.boolean().optional(),
}).optional(),
```

> ⚠️ enum 값을 엔진 `CasualtyLossInput.disasterType`과 **정확히 일치**(`enum-verification-before-mapping`). UI RadioCardGroup option value = enum value 1:1.

### disasterType 라벨 ↔ enum 매핑 (1:1, 단일 출처)

| RadioCardGroup 라벨 | enum value | 법령(§20①) |
|---|---|---|
| 화재 | `fire` | 화재 |
| 붕괴 | `collapse` | 붕괴 |
| 폭발 | `explosion` | 폭발 |
| 환경오염사고 | `environmental` | 환경오염사고 |
| 자연재해 | `natural` | 자연재해 등 |
| 기타 | `other` | (등) |

> 이 표가 단일 출처 — `Record<DisasterType, string>` 라벨맵으로 구현(UI 옵션·결과 표시 공용). 검증: 엔진 타입·Zod enum·UI 옵션 3곳 grep 일치.

---

## 결과 카드 산식 (지점 ⑦)

```
재해손실공제 (§23)
  재해손실재산가액      XXX
  − 보전가능금액         XXX
  ─────────────────
  재해손실공제 신청액    XXX
```

- 변수 약어·`floor()` 금지(`feedback_result_view_korean_formula`).
- "원" 단위 표기 금지(`feedback_no_won_suffix`).
- 금액 칸 `font-mono`+`tabular-nums`+우측정렬(`amount-column-align`).

---

## validation 상세 (지점 ⑧)

```
casualtyLossEnabled === true 일 때:
  1. casualtyLossValue 빈값/≤0 → "재해손실재산가액을 입력하세요."
  2. casualtyLossDate 빈값 → "재난 발생일을 입력하세요."
  3. casualtyLossDate < deathDate → "재난은 상속개시일 이후 발생해야 합니다." (§23 하한)
  4. casualtyLossDate > endOfMonth(deathDate)+6개월 → "§23 요건: 신고기한 이내 발생한 재난이어야 합니다." (상한)
  5. compensated > value → "보전가능금액이 손실재산가액을 초과합니다."
  ※ value−compensated=0(전액 보전)은 차단 아님 — 공제 0 허용 (API max(0,…) fallback과 동기화)
```

> ⑧↔④ 3중 패턴(`mirror-pattern`): UI display(`max(0,…)`)=API 변환=validate 동일 fallback. `useEffect→store` 미러링 금지.

---

## 범위 밖

- 별지 제6호(재해손실공제신고서) 전체 서식 재현 — 후속.
- 사이드바 입력단계 공제 미리보기 — 선택적(엔진 결과 도착 시 자동 반영으로 충분).
- 자동 기한판정 거주자/비거주자 구분(decedentType) — v1 override-only 가능.
