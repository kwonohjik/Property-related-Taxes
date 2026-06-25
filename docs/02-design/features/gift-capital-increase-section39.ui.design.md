# 증자에 따른 이익의 증여(§39) cap-table — UI 설계

> 엔진 측: [`gift-capital-increase-section39.engine.design.md`](./gift-capital-increase-section39.engine.design.md) · 계획서: [`../../00-pm/gift-capital-increase-section39.plan.md`](../../00-pm/gift-capital-increase-section39.plan.md) v3
> 적용 정책: `components/calc/CLAUDE.md` + memory(`feedback_section_card_numbering`·`feedback_toggle_card_visibility`·`feedback_no_internal_id_in_result`·`amount-column-align`·`feedback_three_state_optional_mode_toggle`·`history-lookup-modal`)

## Context

deemed-gift는 **독립 미니 계산기**(`/calc/gift-deemed`, `DeemedGiftCalculator` + `DeemedDetailModal`). 기존 `capital_increase`는 **단건 스칼라 폼**(`CapitalIncreaseFields`, `capital-forms.tsx:57`). 신규 `capital_increase_allocation`는 **주주 다중행(cap-table) 입력 + 수증자별·증여자별·검증내역 결과**가 필요 → 별개 선택형 모드로 추가. 단건 모드는 단순 1수증자 케이스용으로 유지.

---

## 사용자 시나리오

1. `/calc/gift-deemed` → 유형 피커에서 **"증자 이익의 증여 — 주주별(cap-table)"** 선택(`DEEMED_TYPE_META` T4 신규 라벨).
2. 증자 이벤트 입력(저가/고가·증자전 평가·발행가·주식수·균등총수).
3. 주주 목록 입력: 행 추가 → 모달에서 주주별(증자전 보유·당초배정·인수·재배정·특수관계인·소액주주) 입력. 표로 누적.
4. 계산 → 수증자별 증여재산가액 + 증여자별 분할 + **검증내역(증감 합계 0)** 표시.
5. (선택) "증여세 계산으로" → 산정 이익을 gift 마법사로 prefill(기존 `buildGiftWizardPrefill` 경로, 수증자별 분리).

---

## 입력 폼 (섹션 카드 + 원형 번호 — `feedback_section_card_numbering`)

### ① 증자 개요 (sky)
- 발행유형: `RadioCardGroup` `ci-alloc-direction` (저가발행 / 고가발행) — OFF도 tone 유지(`feedback_toggle_card_visibility`)
- 증자 전 1주당 평가가액 ㉮: `CurrencyInput` (onFocus select)
- 증자 전 발행주식총수: `CurrencyInput`(정수 주식수)
- 신주 1주당 인수가액 ㉰: `CurrencyInput`
- 증자(실제 증가)주식수: `CurrencyInput`
- 균등증자 가정 총수(② ㉯·⑤ 분모): `CurrencyInput` — hint "당초 지분대로 균등증자 시 증가주식수(통칙)"
- (고가⑥) 분모 오버라이드 `excessDenominator`: `CurrencyInput` optional — hint "미입력 시 주주 행 합으로 자동 산출"

### ② 주주 목록 (emerald) — cap-table 다중행 테이블+모달 (`history-lookup-modal` 패턴 차용)
```
┌─ ② 주주 목록 ─────────────────────────────────────────┐
│  [+ 주주 추가]                                         │
│ ┌────────┬────────┬────────┬──────┬──────┬─────────┐  │
│ │ 주주   │증자전  │당초배정│ 인수 │재배정│특수관계 │  │
│ ├────────┼────────┼────────┼──────┼──────┼─────────┤  │
│ │ 갑(父) │ 25,000 │ 25,000 │    0 │    0 │   —     │  │ ← 행 클릭 → 모달
│ │ 을(子) │ 15,000 │ 15,000 │15,000│25,000│ 갑      │  │
│ │ 소액주 │ 10,000 │ 10,000 │10,000│    0 │   —     │  │
│ └────────┴────────┴────────┴──────┴──────┴─────────┘  │
│  배정합 50,000 / 발행수 50,000  ✓                      │
└────────────────────────────────────────────────────────┘
```
- 행 클릭 → `Dialog`(주주 편집) — **5필드 위젯·testid 명세** `[디자인검토 Critical ui#2]`:

| 필드 | 위젯 | testid | 비고 |
|---|---|---|---|
| 이름 | text input(onFocus select) | `ci-alloc-modal-name` | 결과 표시명 |
| 증자전 보유 preShares | `CurrencyInput`(단위 미표기·주식수) | `ci-alloc-modal-preShares` | |
| 당초배정 entitledShares | `CurrencyInput`(단위 미표기) | `ci-alloc-modal-entitled` | 균등배정 |
| 인수 subscribedShares | `CurrencyInput`(단위 미표기) | `ci-alloc-modal-subscribed` | |
| 재배정 reallocatedShares | `CurrencyInput`(단위 미표기) | `ci-alloc-modal-reallocated` | 제3자·초과 포함 |
| 특수관계인 relatedTo | **주주 id 멀티토글**(다른 행 id 체크박스 목록) | `ci-alloc-modal-relatedTo` | **사례5 미과세 판정 단일원** |

- `isSmallShareholder` 필드 **제거** `[디자인검토 integ#2]` — §39② 의제는 cap-table 비범위(기존 단건 모드 담당).
- testid: 동적 `tr[role=button]` + `data-testid="ci-alloc-row-${id}"`
- **활성 판정 = type === 'capital_increase_allocation' (배열 length derive 금지** — `feedback_three_state_optional_mode_toggle`)
- 빈 값 자동 채움 금지 — 미입력 행은 ⑧validate 차단

### 입력 순서 = 계산 로직 순서 (`feedback_ui_order_follows_logic`)
㉮ → 증자전 주식수 → ㉰ → 증가주식수 → 균등총수 → 주주목록(이익귀속·배분에 사용).

---

## 결과 화면 (`DeemedGiftResultView` 확장)

### 수증자별 카드 (violet) — 결과 내부 id 노출 금지 (`feedback_no_internal_id_in_result`)
표시명 = `name.trim() || "수증자"`. id(을·병 등 내부키) 출력 금지.
```
┌─ 을 — 증여재산가액 175,000,000 ─────────────────┐   ← 우측정렬 font-mono tabular-nums
│  · 실권주 재배정분(①)        125,000,000        │     (amount-column-align)
│  · 실권주 실권처리분(②)       50,000,000        │
│  증여자별: 갑(父) 175,000,000                    │
└──────────────────────────────────────────────────┘
```
- 증여자별 분할 표(④⑤⑥): 병 = 부 225,000,000 + 모 75,000,000
- 산식 한국어 풀어쓰기(`feedback_result_view_korean_formula`) — "(증자 후 1주당 평가액 − 신주 인수가액) × 배정받은 실권주수". 변수 약어·floor() 금지
- 특수관계 부재 0행: "특수관계 없음 — 과세 제외"(excludedReason) 회색 표시

### 검증내역 zero-sum 표 (slate) — 펼침 토글(`ExpandToggleButton`, print:block)
**바인딩 단일원 = `result.byShareholder[]`** `[디자인검토 Critical ui#1·integ#1]`(`preValuation`·`paidIn`·`postValuation`·`delta`). 기존 `result.breakdown`과 별도 섹션 — `result.type==='capital_increase_allocation'` 분기로 렌더.
```
┌─ 검증내역 (증감 합계 = 0) ───────────────────────────────────────┐
│ 주주    증자전 평가   납입대금     증자후 평가      증감          │
│ 갑(父)  750,000,000           0  500,000,000  −250,000,000      │ ← 우측정렬
│ 을(子)  450,000,000  400,000,000  1,100,000,000  +250,000,000   │
│ ...                                                              │
│ 합계                                                  0          │
└──────────────────────────────────────────────────────────────────┘
```
- 컬럼 = `byShareholder.{preValuation, paidIn, postValuation, delta}`. `delta = post − pre − paidIn`, Σdelta=0.
- 금액 칸 전부 `font-mono tabular-nums text-right`(`amount-column-align`)
- "원" 단위 표기 금지(`feedback_no_won_suffix`)

---

## 8 클라이언트 동기화 지점 (UI 측)

| # | 지점 | 작업 | file |
|---|---|---|---|
| ① 폼 상태 | `ciAllocShareholders: CapTableRow[]`(폼 string 필드 6종) + 이벤트 스칼라. ④에서 `CapShareholder`(number)로 변환 `[디자인검토 integ#3]` | `shared.tsx:107` |
| ② initial | 1행 기본값. 활성=type only(length derive 금지) | `shared.tsx:254` |
| ③ normalize | N/A(독립 계산기) | — |
| ④ API 변환 | cap-table → `CapitalIncreaseAllocationInput`. 명시입력만(자동안분 0) | `gift-deemed-api.ts:103` |
| ⑤ UI 위젯 | 주주 테이블+모달 신규 컴포넌트 + 이벤트 카드 | `capital-forms.tsx` |
| ⑥ 사이드바 | N/A(마법사 사이드바 부재) | — |
| ⑦ 결과 카드 | `type==='capital_increase_allocation'` 분기로 신규 섹션: `perBeneficiary[].byDonor[]`(수증자별·증여자별 카드) + `byShareholder[]`(검증내역 zero-sum 표). 기존 `breakdown` 표와 분리 `[디자인검토 Critical]` | `DeemedGiftResultView.tsx:48` |
| ⑧ validation | cross-row(배정합=발행수·분모 합)·빈행 차단·자동보정 금지 | `gift-deemed-validate.ts:59` |

> 엔진-타입 T1~T6·API/Route 6지점은 engine.design.md·계획 §6 참조. 피커 라벨(T4·T5)·prefill(T6)은 UI 경유.

---

## 위젯 규칙 체크
- [ ] `RadioCardGroup`/`ToggleCard`만(native 금지), OFF tone 유지
- [ ] `CurrencyInput` onFocus select(전역 `SelectOnFocusProvider` 또는 내장)
- [ ] **주식수 입력은 `CurrencyInput` 단위 미표기**(주식수는 "원" 아님 — 콤마 포맷만 사용) `[디자인검토 ui#3]`
- [ ] 주주 행 클릭 `Dialog` 편집, 동적 testid `tr[role=button]`
- [ ] 금액 칸 `font-mono tabular-nums text-right`
- [ ] 결과 표시명 `name.trim()||라벨`, 내부 id 노출 0
- [ ] placeholder 숫자 예시 금지 → FieldCard `hint`
- [ ] 정적 색조 매핑(`bg-${tone}` dynamic 금지)
- [ ] 데이터 폐기 확인 `window.confirm` 금지 → shadcn `Dialog`
