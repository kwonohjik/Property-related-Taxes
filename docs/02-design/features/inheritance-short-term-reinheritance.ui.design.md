# 단기 재상속세액공제 재산별 구분 — UI 설계

> Plan: [`../../00-pm/inheritance-short-term-reinheritance-per-asset.plan.md`](../../00-pm/inheritance-short-term-reinheritance-per-asset.plan.md)
> Engine Design: [`inheritance-short-term-reinheritance.engine.design.md`](inheritance-short-term-reinheritance.engine.design.md)
> 담당: inheritance-gift-tax-ui-senior (Do 단계) · 본 문서는 13단계 검토 seed

## 사용자 시나리오

피상속인이 **10년 이내에 다른 사람으로부터 상속받은 재산**이 있는 경우, 1차 상속 정보(개시일·전체 산출세액·전체
상속재산가액)와 **재상속되는 재산을 종류별로** 입력하면, 재산별 단기재상속세액공제 표가 결과에 표시된다.

- 입력: 1차 상속개시일(→ 공제율 구간 자동) · 전의 산출세액 · 전의 상속재산가액 · 재상속분 재산 목록(명칭+1차가).
- 출력: 재산별 [재상속분 · base · 공제세액] 표 + 합계 + 적용 공제율(경과 N년 → %) + §30③ 한도.

교재 사례(부친 2020.7.5 → 모친 2022.10.10): 1차 산출 440M·상속재산 4,300M, 재상속분 비상장주식 1,300M·토지1 700M·토지2 490M → 80% → **203,832,555**(floor).

---

## UI 위젯 (Step5 공제·세액공제 — `inheritance/steps.tsx:599-677` 개편)

```
┌ 단기재상속공제 (§30) ────────────────────────── sky 카드 ┐
│ [1] 1차 상속개시일   [DateInput 2020-07-05]              │
│     → 경과 2년 3개월 → "3년 이내" → 공제율 80% (자동표시) │  ← deriveBand(priorDeath, deathDate)
│ [2] 전의 상속세 산출세액  [CurrencyInput]                 │  hint: 1차 상속 전체 산출세액(결정세액·상속인 몫 아님)
│ [3] 전의 상속재산가액     [CurrencyInput]                 │  hint: 1차 총상속재산(채무공제 전)·과세가액 아님
│ ┌ 재상속분 재산 목록 (재산별 구분 — 집행 30-22-1②) ───┐ │
│ │ 비상장주식  [CurrencyInput 1,300,000,000]  [삭제]   │ │  hint: 1차 상속 당시 가액(2차 평가액 아님)
│ │ 토지1       [CurrencyInput   700,000,000]  [삭제]   │ │
│ │ 토지2       [CurrencyInput   490,000,000]  [삭제]   │ │
│ │ [+ 재상속 재산 추가]                                │ │
│ └────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

- [1] 1차 상속개시일이 **현 "경과 연수 정수 입력" 대체**. 2차 = `form.deathDate` 자동 연동. 경과기간·공제율 자동 표시(읽기전용).
- 1차 개시일 입력 시에만 [2][3][재산목록] 노출(현 `form.shortTermReinheritYears && (...)` 조건 → priorDeathDate 조건으로 전환).
- 재상속분 카드는 800줄 정책상 sub-component(`ShortTermReinheritAssetList`) 추출.
- `DateInput`·`CurrencyInput` 공용 컴포넌트 필수(type="date" 금지). placeholder 숫자 예시 금지 — hint 한국어.
- 빈 재산목록 + 전의 산출세액 입력 → legacy lump(전부재상속) 안내 또는 1행 입력 유도(자동 안분 금지).

---

## 결과 카드 (`TaxCreditBreakdownCard.tsx` — label-parser 폐지, 구조화 echo)

`result.creditDetail.shortTermReinheritDetail` 사용. 재산별 표:

```
단기재상속세액공제 (§30) — 경과 2년 3개월 → 3년 이내 80%
┌ 재산 ────────┬ 재상속분(1차가) ┬ 기준액 base ┬ 공제세액 ┐
│ 비상장주식    │   1,300,000,000 │ 133,023,255 │ 106,418,604 │
│ 토지1         │     700,000,000 │  71,627,906 │  57,302,324 │
│ 토지2         │     490,000,000 │  50,139,534 │  40,111,627 │
├──────────────┼─────────────────┼─────────────┼─────────────┤
│ 합계          │   2,490,000,000 │             │ 203,832,555 │
└──────────────┴─────────────────┴─────────────┴─────────────┘
산식: 전의 산출세액 440,000,000 × (재상속분 ÷ 전의 상속재산가액 4,300,000,000) × 80%
§30③ 한도 704,000,000 ≥ 203,832,555 → 전액 공제
```

- 금액 칸 `text-right font-mono tabular-nums` (skill `amount-column-align`). `BesshiRow`/`BesshiColumn` 재사용.
- `print:block` CSS-only 펼침(skill `print-only-css-toggle`). 산식 한국어 풀어쓰기·`floor()` 약어 금지.
- legacy lump(perAsset 1행)도 동일 표(1행) 렌더 — 분기 단순화.

---

## 14개 동기화 지점

| # | 지점 | 변경 | 3중 패턴(mirror) |
|---|---|---|---|
| ① | 폼 상태 `shared.ts FormState` | `shortTermReinheritPriorDeathDate: string`, `shortTermReinheritAssets: {name:string;value:string}[]` | — |
| ② | initial `INITIAL_FORM` | `""`, `[]` | factory=normalize=UI 일치 |
| ③ | normalize/migration | string·배열 default, sessionStorage 복원 시 배열 가드 | — |
| ④ | API 변환 `InheritanceTaxForm.tsx:382-397` | priorDeathDate 전달 + assets `[{name, priorValue: parseAmount(value)}]` 매핑. **명시 매핑 — 신규 필드 누락 시 침묵 strip([[feedback_explicit_prop_mapping_strip]])** | — |
| ⑤ | UI 위젯 `steps.tsx` | 상기 위젯. priorDeathDate 조건 노출 | display fallback |
| ⑥ | 사이드바 | 미표시(결과 후 산출) | — |
| ⑦ | 결과 카드 `TaxCreditBreakdownCard.tsx` | 구조화 `shortTermReinheritDetail.perAsset[]` 표. **label-parser(`:144`) 폐지** | — |
| ⑧ | validation `inheritance-validate.ts:327-349` | priorDeathDate ≤ deathDate; 각 priorValue ≤ priorEstate; **Σ priorValue ≤ priorEstate**; assets·priorEstate 동반 | API/UI fallback ↔ validate 동일 |
| ⑨ | Zod 메인 `property-valuation-input.ts:685-690` | priorDeathDate regex + assets array(원소 `{name?, priorValue:int.nonneg}`) | — |
| ⑩ | Zod 컴패니언 | 증여세 §30 없음 — N/A | — |
| ⑪ | 자산-수준 acqDate | N/A | — |
| ⑫ | Zod 입력객체 `inheritanceTaxCreditInputSchema` | 신규 2필드 정의(누락 시 strip) | — |
| ⑬ | body spread `route.ts:84-85` | creditInput 통째 캐스팅 → Zod 정의 시 자동 포함 | — |
| ⑭ | route 매핑 `route.ts:84-85` | priorDeathDate string regex 유지 → Date 변환 불필요 | — |

---

## 13단계 검토 (UI 설계 self-review) — 검토 #4

| # | 카테고리 | 우선순위 | 위치 | 문제 | 정정 |
|---|---|---|---|---|---|
| 12 | UI누락(바인딩) | High | ④ API 변환 | assets `value(string) → priorValue(number)` 단위변환·빈 행 필터 미명시 | `parseAmount(value)` + value="" 행 제외 매핑 명시 |
| 13 | UI누락(노출조건) | Medium | ⑤ | 현 `shortTermReinheritYears &&` 조건 → priorDeathDate 조건 전환 미명시 시 구필드 잔존 | 노출 게이트 priorDeathDate로 전환 명시 |
| 14 | UI누락(3-state) | Medium | ① | `shortTermReinheritAssets: []` vs `undefined` — 3-state 모호([[feedback_three_state_optional_mode_toggle]]) | 빈 배열=ON빈/미입력=OFF. length derive 금지 |
| 15 | 개선(일관) | Low | 결과표 | legacy lump perAsset 1행 명칭 fallback("재상속재산 1") | 명칭 없으면 "재상속재산"·결과 내부 id 노출 금지([[feedback_no_internal_id_in_result]]) |

→ 정정 4건(12~15) 상기 표·매핑에 반영 완료. **UI 누락 Critical 0**.

---

## 정책 체크

- [[feedback_no_silent_apportion_fallback]] — 빈 재산행 자동채움 금지. 부분 입력 차단.
- [[mirror-pattern]] — assets·priorEstate fallback UI display·API·validate 3중 일치. useEffect store 미러링 금지.
- [[feedback_explicit_prop_mapping_strip]] — ④ 명시 매핑 신규 필드 grep 자가점검.
- `amount-column-align` · `print-only-css-toggle` · `formula-display-builder` 스킬 적용.
