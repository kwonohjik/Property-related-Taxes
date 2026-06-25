# 합병에 따른 이익의 증여(§38) 보완 — UI 설계 (UI DESIGN)

> 엔진 설계 `gift-merger-supplement.engine.design.md` 짝. 독립 페이지 `/calc/gift-deemed` 내 합병 유형.
> 기존 `components/calc/deemed-gift/capital-forms.tsx` `MergerFields`(15-48줄) 확장. emerald 톤 유지.

## 0. UI 원칙 (프로젝트 공통 적용)

- 토글/라디오: `ToggleCard`/`RadioCardGroup` 필수, native 신규 금지, OFF도 tone 유지(`feedback_toggle_card_visibility`).
- 금액: `CurrencyInput`(`feedback_no_won_suffix` — 끝 "원" 생략). 주식수도 CurrencyInput(정수).
- 모드 토글은 **영향 필드 직전**(`feedback_ui_order_follows_logic`). placeholder 숫자예시 금지 → FieldCard `hint`.
- 포커스 전체선택(전역 Provider 적용됨) / Enter 이동(전역) — 별도 처리 불요.
- 결과 산식 한국어 풀어쓰기(변수약어·floor 금지 `feedback_result_view_korean_formula`).
- 3중 패턴(`mirror-pattern`): `mrgMergedPriceMode` 기본 `"direct"`를 INITIAL=normalize=UI fallback=API=validate 일치.

## 1. 폼 상태 확장 (`DeemedFormState` — shared.tsx)

```ts
// 기존 mrg* 8필드 유지 + Phase A 신규 (전부 string, CurrencyInput 호환)
mrgMergedPriceMode: "direct" | "auto";   // 기본 "direct"
mrgUnderSharePrice: string;               // 과소평가(반대) 법인 1주평가
mrgUnderPreShares: string;                // 과소평가법인 합병전 주식수
mrgPostMergerTotalShares: string;         // 합병후 존속법인 주식수 (합병비율 반영)
mrgIsListed: boolean;                     // 상장 여부 (기본 false)
mrgListedPostAvgPrice: string;            // 상장 합병등기일후 2월 종가평균
mrgIsRelatedCompany: boolean;             // G0 특수관계 (기본 true — 과세요건 전제)
mrgOwnRatioNumer: string; mrgOwnRatioDenom: string;  // G0 대주주 판정 echo
mrgFaceValueSum: string;                  // G0 액면 합계
```

**INITIAL_DEEMED(②)**: `mrgMergedPriceMode:"direct"`, `mrgIsListed:false`, `mrgIsRelatedCompany:true`, 나머지 `""`.
→ 기본 direct라 기존 E2E(직접입력) 회귀 보존.

## 2. 입력 폼 위젯 (`MergerFields` 확장 — capital-forms.tsx)

레이아웃(stock 케이스, 모드 토글이 ㉮ 입력 직전):

```
┌─ §38 합병에 따른 이익 (emerald) ──────────────────────────┐
│ [RadioCardGroup] 합병대가: ⦿ 주식교부(§28③1)  ○ 주식외(§28③2) │
│                                                            │
│ ── G0 과세요건 전제 (안내 카드, amber) ────────────────     │
│ [ToggleCard] 특수관계 법인간 합병 (§28①)   [ON]            │
│   hint: 자본시장법 §165의4 상장법인 합병은 제외             │
│                                                            │
│ ── 공통: 과대평가(이익측)법인 ───────────────────────────  │
│ [CurrencyInput] 과대평가(이익측)법인 1주평가 ← overvaluedSharePrice·안내툴팁 │
│ [CurrencyInput] 과대평가법인 합병전 주식수    ← preMergerShares │
│ [CurrencyInput] 교부받은 주식수 (㉯ 분모)     ← exchangedShares │
│ [CurrencyInput] 대주주등 교부 주식수          ← majorShares  │
│                                                            │
│ ── 합병 후 1주당 평가가액 (§28⑤) ──────────────────────    │
│ [ToggleCard] 단순평균액 자동계산        [OFF=직접입력]      │ ← mrgMergedPriceMode
│  · OFF(direct): [CurrencyInput] 합병 후 1주당 평가가액      │
│  · ON(auto): ★과대평가측은 위 공통란 재사용(중복입력 없음)  │
│     [CurrencyInput] 과소평가(반대)법인 1주평가             │
│     [CurrencyInput] 과소평가법인 합병전 주식수             │
│     [CurrencyInput] 합병후 존속법인 주식수  ← hint:합병비율반영 │
│     [ToggleCard] 상장법인 [OFF]                            │
│       └ ON: [CurrencyInput] 합병등기일후 2월 종가평균       │
│         hint: Min(종가평균, 단순평균액) 적용               │
└────────────────────────────────────────────────────────────┘
```

- **단일소스(dual-truth 방지)**: 단순평균액 분자의 과대평가측 항(1주평가×주식수)은 **공통란 `overvaluedSharePrice`·`preMergerShares` 재사용** — auto 영역에 별도 입력란 두지 않음. auto는 과소평가측·합병후주식수만 추가.
- non_stock 선택 시: 단순평균액 토글·㉮ 영역 **숨김**(non_stock은 ㉮ 미사용), 액면가·합병대가·평가가액·대주주주식수만.
- "과대평가(이익측)" 라벨 옆 안내툴팁: "합병비율 산정상 상대적 과대평가 = 이익을 얻는 측. 1주 평가액 크기와 무관."
- G0 대주주 판정(지분율·액면합계)은 **advanced 접이식**(기본 접힘) — echo 안내용, 입력 강제 아님.

## 3. validate (⑧ — gift-deemed-validate.ts)

```
if mrgCaseType==="stock" && mrgMergedPriceMode==="auto":
   필수: mrgUnderSharePrice, mrgUnderPreShares, mrgPostMergerTotalShares,
         (mrgIsListed면) mrgListedPostAvgPrice
   ※ mrgPostMergerTotalShares 자동추정 금지(빈값=차단, feedback_no_silent_apportion_fallback)
if mrgCaseType==="stock" && mode==="direct":  필수 mrgMergedPrice (기존)
if mrgCaseType==="non_stock":  auto 무관(토글 숨김), 필수 faceValue·평가·majorShares (기존)
```
> UI 통과 ↔ validate 동기화: auto 모드 ON인데 3필드 미입력 시 UI도 차단(모순 금지).

## 4. API 변환 (④ — gift-deemed-api.ts buildDeemedGiftInput)

```ts
case "merger":
  if (form.mrgCaseType === "non_stock") { /* 기존 */ }
  else return {
    type: "merger", caseType: "stock",
    overvaluedSharePrice: parseAmount(form.mrgOvervaluedPrice),
    majorShares: parseAmount(form.mrgMajorShares),
    exchangedShares: parseAmount(form.mrgExchangedShares),
    preMergerShares: parseAmount(form.mrgPreShares),
    mergedPriceMode: form.mrgMergedPriceMode,                          // 3중 패턴
    ...(form.mrgMergedPriceMode === "direct"
      ? { mergedSharePrice: parseAmount(form.mrgMergedPrice) }
      : { underSharePrice: parseAmount(form.mrgUnderSharePrice),
          underPreShares: parseAmount(form.mrgUnderPreShares),
          postMergerTotalShares: parseAmount(form.mrgPostMergerTotalShares),
          isListed: form.mrgIsListed,
          ...(form.mrgIsListed && { listedPostAvgPrice: parseAmount(form.mrgListedPostAvgPrice) }) }),
    isRelatedCompany: form.mrgIsRelatedCompany,
    ...(G0 echo 필드 조건부),
  };
```

## 5. 결과 표시 (⑦ — DeemedGiftResultView / breakdown)

- auto 모드 시 breakdown에 단계 추가(한국어 풀어쓰기):
  - "합병 후 1주당 평가가액(단순평균액)" = `computedMergedPrice`, lawRef `GIFT.MERGER_VALUATION`
  - 상장이면 "한국거래소 2월 종가평균과 비교(작은 금액 적용)" = `appliedMergedPrice`
- G0 echo 안내(차단 아님, `feedback_no_unfavorable_application_without_legal_basis` — 단정 회피):
  - `isMajorShareholder===false`면 amber "대주주 요건(지분 1%·액면 3억) 미달 — 과세대상 여부 확인".
  - 특수관계 ToggleCard **OFF**(비특수관계) 시 amber "특수관계 법인간 합병만 §38 과세대상 — 비해당 가능" 안내(이익은 참고 표시).
- 자기일관 표시: 직접입력/자동 모두 동일 ㉮로 (㉮−㉯)×주식수 산식 카드.

## 6. Phase B UI — 주주 매트릭스 (자료 동결 완료: 재산세과-799 + 사례2)

**모드 토글**: `MergerFields` 상단 `[ToggleCard] 주주 구성 입력(다수 대주주·동일인 자기증여)` [OFF].
- OFF: 기존 단일 대주주 모드(`majorShares` 직접) — 회귀 보존.
- ON: 주주 테이블 모드(`shareholders` 입력). `preMergerShares`만 주주 테이블 `Σshares`로 도출(읽기전용 표시). **1주평가(과대·과소평가)는 스칼라 입력 유지**(테이블엔 주식수만, 평가액 없음 → ㉮·㉯ 산정용 별도 입력).

**주주 테이블 모달** (`project_comprehensive_property_table_modal` 패턴):
```
┌─ 과대평가(이익측) 법인 주주 ──────────────┐  ┌─ 과소평가(증여자측) 법인 주주 ─┐
│ 주주명 | 합병전 주식수 | [동일인]         │  │ 주주명 | 합병전 주식수        │
│ 갑     | 140,000      | ☑ (양쪽)        │  │ 갑     | 100,000  ← id매칭     │
│ 병     |  60,000      | ☐               │  │ 을     |  60,000              │
│ [+ 주주 추가]                            │  │ 소액   |  40,000  [+ 추가]    │
└──────────────────────────────────────────┘  └──────────────────────────────┘
교부 환산비: [2] 주당 [1] 주   (과대평가법인 합병전→합병후)
```
- **동일인 매칭**: 양 테이블에서 같은 주주명/`id` → 자동 동일인 표시(체크박스는 명시 확인). `isSameMergerShareholder` 엔진 헬퍼 판정 결과 echo.
- 행 클릭 → Dialog 편집(동적 testid `tr[role=button]`). `feedback_no_internal_id_in_result` — id 노출 금지, `name.trim()||"주주"`.

**결과 표시 (매트릭스)**:
```
수증자별 증여이익 (§38)
┌────────┬──────────┬──────────┬──────────┬────┐
│ 수증자 │ 차감전   │ 자기증여 │ 순이익   │과세│
│ 갑     │1,400,000,000│1,000,000,000│400,000,000│ ✓ │
│ 병     │  600,000,000│        0│600,000,000│ ✓ │
└────────┴──────────┴──────────┴──────────┴────┘
증여자별 안분 (allocation Record 렌더)
  갑 ← 을 240,000,000 · 소액 160,000,000
  병 ← 갑 300,000,000 · 을 180,000,000 · 소액 120,000,000
```
- `amount-column-align` 스킬: 금액 칸 font-mono·tabular-nums·우측정렬.
- **prefill**: 수증자 행 선택 → 해당 `netGain`으로 증여세 마법사 이동(수증자별 분기). 다수면 선택 UI.
- §28④ 제외 수증자(순이익<3억)는 회색 "기준금액 미만" 표시(차단 아님, 정보).

**3중 패턴**: `shareholders` 모드 토글 OFF 기본 — INITIAL=normalize=UI=API=validate 일치. ON일 때만 주주배열 필수(validate).

## 7. 14 동기화 지점 체크 (클라이언트 측)

| 지점 | 파일 | 변경 |
|---|---|---|
| ① 폼상태 | shared.tsx DeemedFormState | mrg* Phase A 신규 |
| ② initial | shared.tsx INITIAL_DEEMED | mode "direct" 등 기본값 |
| ③ normalize | (restore 시 mode 기본 direct) | strip 방지 |
| ④ API변환 | gift-deemed-api.ts | §4 |
| ⑤ UI위젯 | capital-forms.tsx MergerFields | §2 |
| ⑥ 사이드바 | N/A (deemed 단발 산정) | — |
| ⑦ 결과 | DeemedGiftResultView | §5 |
| ⑧ validate | gift-deemed-validate.ts | §3 |

## 8. E2E (`feedback_browser_verify_with_playwright`)

- `e2e/gift-deemed-merger.spec.ts`: (1) direct 회귀 — 기존 동작, (2) auto 사례1 — 단순평균액 36,666→병 466,620,000, (3) non_stock 토글 시 auto 숨김.
- CurrencyInput label htmlFor 미연결 함정 → `getByPlaceholder`/testid 사용(`project_gift_deemed_transfer_plan` 함정 재적용).
