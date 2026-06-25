# 전환사채등 주식전환 이익의 증여 (§40) — 보완 UI 설계 (UI DESIGN)

> 계획서: [`docs/00-pm/gift-convertible-bond-40.plan.md`](../../00-pm/gift-convertible-bond-40.plan.md) · 엔진설계: [`gift-convertible-bond-40.engine.design.md`](./gift-convertible-bond-40.engine.design.md)
> 대상: `components/calc/deemed-gift/capital-forms.tsx` `ConvertibleBondFields`(현행 329-377) 확장 / 폼상태 `shared.tsx:142-153`
> 작성일 2026-06-25 / 브랜치 `feat/gift-convertible-bond-40`

---

## 0. 페이지 구조 (현행 확장)

- 유형 선택 `DeemedTypeSelector`에서 "전환사채등 §40"(convertible_bond) 선택 → `ConvertibleBondFields` 렌더.
- 폼 상태: `DeemedFormState`(shared.tsx) — 현행 `cb*` 11필드 + **신규 cb필드**(creditedShares·isListed·listedMarketAvg·모드토글·raw입력군).
- 색상 tone: **rose**(현행 유지). 카드 헤더 "전환사채등 (§40)".
- caseType별 조건부 렌더: `acquisition`/`conversion`/`conversion_reverse`/`transfer` (RadioCardGroup, 현행 334-346).

---

## 1. caseType 선택 (현행 RadioCardGroup)

```
┌ 거래단계 (§40①) [RadioCardGroup] ─────────── rose ─┐
│ ◉ 인수·취득 (①1호)      ○ 주식전환 가·나·다목 (①2호) │
│ ○ 주식전환 라목 (①2호)  ○ 양도 (①3호)               │
└────────────────────────────────────────────────────┘
```
testid: `cb-case-acquisition`·`cb-case-conversion`·`cb-case-conversion_reverse`·`cb-case-transfer` (현행 유지)

---

## 2. caseType별 입력 위젯

### 2.1 인수·취득 ①②③ (`acquisition`)
```
┌ 인수·취득 (§40①1호) ─────────────── rose ─┐
│ 전환사채등 시가        [           ] 원      │
│  hint: 상증법 §60·§63 평가가액(§58의2)       │
│ 인수·취득가액          [           ] 원      │
│ ┌ [ToggleCard] 균등지분 초과 자동산정 (②) ─┐ │   ← 신규 autoExcess
│ │ 본인 전환전 지분율    [      ] %           │ │
│ │ 인수 주식수          [           ] 주      │ │
│ │ 총인수가능 주식수     [           ] 주      │ │
│ │  hint: 초과분 = 인수 − 총인수가능×지분율    │ │
│ └────────────────────────────────────────┘ │
│  ⓘ ②(주주 균등초과)는 토글 ON → 초과분 기준 자동. ①③은 OFF(전부) │
└────────────────────────────────────────────┘
```
- autoExcess **OFF**(기본, ①③): 시가·인수가 그대로(전부). **ON**(②): 본인지분율·인수주식수·총인수가능 입력 → lib/calc가 초과분 비율로 시가·인수가 자동 안분.
- testid: `cb-market-value`·`cb-acquisition-price`·`cb-auto-excess`·`cb-own-pre-ratio`·`cb-subscribed-shares`·`cb-total-subscribable`

### 2.2 주식전환 가·나·다목 ④⑤⑥ (`conversion`)
```
┌ 주식전환 (§40①2호 가·나·다) ──────── rose ─┐
│ 전환등 전 1주당 평가가액 [        ] 원        │
│ 전환등 전 발행주식총수   [        ] 주        │
│ 1주당 전환가액등         [        ] 원        │
│ 전환등 증가주식수        [        ] 주        │   ← ㉡ 가중평균 분모
│ ┌ [ToggleCard] 주권상장법인 ────────────┐  │   ← 신규 isListed
│ │ 전환일 전후 2개월 종가평균 [      ] 원   │  │
│ │  hint: 상장은 Min(종가평균, 이론주가) 적용 │ │
│ └──────────────────────────────────────┘  │
│ ┌ [ToggleCard] 균등지분 초과 (⑤) ────────┐ │   ← 신규 autoExcess
│ │ (ON) 본인지분율·인수주식수·총인수가능 입력  │ │
│ │ (OFF) 교부받은 주식수 [        ] 주        │ │   ← creditedShares 직접(미입력=증가주식수)
│ └──────────────────────────────────────┘  │
│ ┌ 이자손실분 (§10의2) ───────────────────┐ │
│ │ [ToggleCard] 자동계산 (PV)              │ │   ← 신규 autoInterestLoss
│ │ (ON) 만기상환금액 [   ]·사채발행이율 [ ]%  │ │
│ │      잔여연수 [  ]년 (적정할인율 자동 8%)  │ │
│ │ (OFF) 이자손실분 직접 [           ] 원    │ │
│ └──────────────────────────────────────┘  │
│ 인수시 기과세 이익 (§30①1) [        ] 원     │
│  ⓘ ⑥(제3자)은 초과분 토글 OFF(교부 전부)      │
└────────────────────────────────────────────┘
```
- **isListed ON** → listedMarketAvg 입력 → 교부주식가액 Min(㉠,㉡). OFF → 이론주가(㉡).
- **autoExcess**: ON(⑤)=초과분 자동 / OFF(④⑥)=creditedShares 직접(미입력=증가주식수).
- **autoInterestLoss**: ON=raw(만기·발행이율·연수)로 PV 산출(⑤는 ×초과분) / OFF=직접입력.
- testid: `cb-pre-conv-price`·`cb-pre-conv-shares`·`cb-conversion-price`·`cb-increased-shares`·`cb-is-listed`·`cb-listed-market-avg`·`cb-credited-shares`·`cb-auto-interest-loss`·`cb-bond-maturity`·`cb-coupon-rate`·`cb-remaining-years`·`cb-interest-loss`·`cb-acq-gain-prior`

### 2.3 주식전환 라목 ⑦ (`conversion_reverse`)
```
┌ 주식전환 라목 (§40①2호 라) ───────── rose ─┐
│ 전환등 전 1주당 평가가액 [        ] 원        │
│ 전환등 전 발행주식총수   [        ] 주        │
│ 1주당 전환가액등         [        ] 원        │
│ 전환등 증가주식수        [        ] 주        │
│ ┌ [ToggleCard] 주권상장법인 ────────────┐  │
│ │ 전환일 전후 2개월 종가평균 [      ] 원   │  │
│ │  hint: 라목은 Max(종가평균, 이론주가)     │ │
│ └──────────────────────────────────────┘  │
│ 특수관계인 전환전 지분율  [      ] %          │
│  hint: 전환가액 > 교부주식가액 → 기존주주 이익(전부과세) │
└────────────────────────────────────────────┘
```
- 라목은 **Max**(㉠,㉡) — isListed ON 시. 기준금액 0(전부과세).
- testid: `cb-rev-pre-conv-price`·`cb-rev-pre-conv-shares`·`cb-rev-conversion-price`·`cb-rev-increased-shares`·`cb-is-listed`·`cb-listed-market-avg`·`cb-related-pre-ratio`

### 2.4 양도 ⑧ (`transfer`)
```
┌ 양도 (§40①3호) ─────────────────── rose ─┐
│ 전환사채등 양도가액     [           ] 원     │
│ 전환사채등 시가         [           ] 원     │
│  hint: 특수관계인 고가양도. (양도가−시가)≥Min(시가30%,1억) 과세 │
└────────────────────────────────────────────┘
```
- testid: `cb-transfer-price`·`cb-market-value`

---

## 3. 결과뷰 (`DeemedGiftResultView`)

`formula-display-builder` 패턴 — breakdown 자동 표시(현행 29-65). 산식 한국어, "원" 생략, 우측정렬 `font-mono tabular-nums`.

```
┌ 증여재산가액 (증여이익) ───────────────────┐
│                          526,264,550        │   ← 사례4 예
│  ▼ 산출 근거 펼치기                          │
│  ├ 교부받은 주식가액(1주당)        6,750      │
│  ├ 1주당 전환가액등               5,000      │
│  ├ 교부받은 주식수(초과분)       700,000      │
│  ├ 이자손실분                698,735,450      │   ← lawRef 상증칙 §10의2 (신규)
│  ├ 인수 시 기과세 이익(§30①1)         0      │
│  └ 증여재산가액              526,264,550      │
│  [근거: 상증법 §40①2호]  (LawArticleModal)   │
├────────────────────────────────────────────┤
│ ⓘ 미적용 시: rose 카드 "이익 < 기준금액 → 비과세" │
├────────────────────────────────────────────┤
│ [ 이 금액으로 증여세 계산하기 ]  → 마법사 이관    │
└────────────────────────────────────────────┘
```
- 이자손실분 row에 lawRef(상증칙 §10의2) 부여 — 현행 lawRef 부재(G10 정정).
- 미적용(`applied=false`) → rose 카드 + `exclusionReason`. 금액 0 미표시.
- 펼치기 `ExpandToggleButton` + 인쇄 CSS-only(`print:block`).
- testid: `deemed-result-value`·`deemed-breakdown`·`deemed-exclusion`·`deemed-to-wizard`

---

## 4. 14 동기화 지점 (클라이언트 ①~⑧)

| 지점 | 내용 | 위치 |
|---|---|---|
| ① 폼 상태 | `cb*` 신규필드(string/boolean) 추가 | `shared.tsx:142-153` |
| ② initial | INITIAL_DEEMED 초기값(`""`·`false`) | `shared.tsx:292-302` |
| ③ normalize | **N/A** — deemed-gift 별도 normalize 없음(실측). 누락 키는 initial 머지 | — |
| ④ API 변환 | caseType별 return + **분수 string→{numer,denom}**(cbRelatedPreRatioPct 선례) + autoExcess/autoInterestLoss ON 시 헬퍼로 creditedShares·interestLoss·②시가/인수가 도출 | `lib/calc/gift-deemed-api.ts:167-195` |
| ⑤ UI 위젯 | §2 4 caseType 폼 + 신규 ToggleCard | `capital-forms.tsx:329-377` |
| ⑥ 사이드바 | **N/A** — 단발 의제(합계 누적 없음) | — |
| ⑦ 결과 카드 | breakdown 자동 표시 + 이자손실분 lawRef | `DeemedGiftResultView.tsx:29-65` |
| ⑧ validation | caseType·모드별 required. **creditedShares non-required**(미입력=증가주식수 — UI통과↔validate 모순 금지). 모드 ON→raw required / OFF→직접 required | `gift-deemed-validate.ts:127-138` |

> API/Route 측(⑨⑩⑫⑬⑭)은 engine.design §5. ⑫ Zod 신규필드 누락 시 침묵 strip 주의.
> **3중 패턴**(`mirror-pattern`): creditedShares display fallback(`?? 증가주식수`) ↔ ④ API ↔ ⑧ validate 동일. presence-derive 금지.

---

## 5. UI 규칙 준수 체크 (Do 단계 — memory)
- [ ] rose tone 섹션 카드 — `feedback_section_card_numbering`
- [ ] `ToggleCard`(isListed·autoExcess·autoInterestLoss)/`RadioCardGroup`(caseType), OFF도 tone 유지 — `feedback_toggle_card_visibility`
- [ ] 모드 토글은 **명시**(presence-derive 금지) — `feedback_no_silent_apportion_fallback`·`feedback_three_state_optional_mode_toggle`
- [ ] `CurrencyInput`(금액)·`DecimalInput`(지분율·이율 %)·주식수 정수 — `feedback_decimal_input`
- [ ] 결과 산식 한국어, 약어·floor 금지 / "원" 생략 우측정렬 — `feedback_result_view_korean_formula`·`amount-column-align`
- [ ] placeholder 숫자예시 금지 → hint — 시가는 §58의2 안내
- [ ] 법조문 배지 `LawArticleModal`(§40·§10의2) — `feedback_law_article_link`
- [ ] 모드 토글은 영향 필드 직전 — `feedback_ui_order_follows_logic`
- [ ] 펼치기 `ExpandToggleButton` + 인쇄 CSS-only — `feedback_result_expand_toggle_standard`·`print-only-css-toggle`
- [ ] 분수 % string → {numer,denom} 변환(④, `cbRelatedPreRatioPct` 선례)

---

## 6. E2E (`e2e/`)
- `gift-deemed-cb-conversion-excess.spec.ts`: 주식전환 가나다목 → 사례4 입력(creditedShares 700,000·이자손실 698,735,450) → 결과 `526,264,550` 확인
- `gift-deemed-cb-acquisition.spec.ts`: 인수·취득 → 사례1(시가 1,030,000,000·취득 910,000,000) → `120,000,000`
- `gift-deemed-cb-exclusion.spec.ts`: 양도 임계미달 → 미적용 rose 카드
> 함정: ToggleCard testId 선택(`feedback_gift_stock_burdened_debt` 3함정), 종가평균/주식수 textbox role 한정.

---

## 7. 미결정 (Do 단계)
- 증여일 입력 위치(적정이자율 시대 룩업 위해 conversion auto에 필요) — 상단 공통 vs caseType별. 상단 공통 잠정.
- autoExcess·autoInterestLoss 동시 ON UI(⑤+자동이자손실) 레이아웃 — 접이식 2단 토글.
- 양도 cap(G6 전환가능기간 전환사채 양도) UI 노출 — Phase E.
