# 증여로 보는 경우 — Phase 1 UI 설계 (UI DESIGN)

> 상위: [`docs/00-pm/gift-deemed-transfer.plan.md`](../../00-pm/gift-deemed-transfer.plan.md) · 엔진: [`gift-deemed-transfer.engine.design.md`](./gift-deemed-transfer.engine.design.md)
> 범위: **Phase 1 MVP** — (2)§34 · (3)§35 · (4)§36 · (5)§37 · (6)§41의4 독립 페이지 `/calc/gift-deemed`
> 작성일: 2026-06-18

---

## 0. 페이지 구조

독립 페이지 — 기존 4단계 증여세 마법사와 분리. 증여이익만 산정 → 기존 마법사로 prefill 이관.

```
app/calc/gift-deemed/page.tsx                  진입점 (메타 + GiftDeemedCalculator)
components/calc/gift-deemed/
  GiftDeemedCalculator.tsx                      오케스트레이터 (유형 state + 입력/결과 라우팅)
  DeemedTypeSelector.tsx                        ① 규정 유형 선택 (RadioCardGroup, 그룹 헤더)
  forms/
    InsuranceForm.tsx          (2) §34
    BargainTransferForm.tsx    (3) §35
    DebtForgivenessForm.tsx    (4) §36
    FreeRealEstateForm.tsx     (5) §37
    FreeLoanForm.tsx           (6) §41의4
  DeemedGiftResultView.tsx                      ② 증여이익 결과 + 산식 + 세액연결 버튼
```

**화면 흐름**
```
┌─────────────────────────────────────────────┐
│ 증여이익 계산기                                  │
│ 증여일 [DateInput]  (증여시기·적정이자율 연도 룩업) │
│ ① 어떤 "증여로 보는 경우"인가요?  [RadioCardGroup] │
│   [단순] 보험금·채무면제·무상사용·무상대출         │
│   [거래] 저가양수·고가양도                        │
│   (Phase 2~3: 자본거래·파생·법인 — 비활성/안내)   │
├─────────────────────────────────────────────┤
│ ② [선택 규정 전용 입력폼]  (조건부 렌더)          │
├─────────────────────────────────────────────┤
│ ③ [증여이익 결과]  XX,XXX,XXX                    │
│    산식 펼치기 ▼ / 임계 판정 / 미적용 사유         │
│   [이 금액으로 증여세 계산하기] → 마법사 이관       │
└─────────────────────────────────────────────┘
```

---

## 1. 유형 선택 (`DeemedTypeSelector`)

`RadioCardGroup` (layout stack) — 그룹 헤더로 난이도군 구분. Phase 1은 5종 활성, 나머지는 `disabled` + "준비 중" 배지.

```
┌ 단순 ───────────────────────────────────────┐
│ ◉ 보험금의 증여            §34   [활성]          │
│ ○ 채무면제 등             §36   [활성]          │
│ ○ 부동산 무상사용          §37   [활성]          │
│ ○ 금전 무상대출            §41의4 [활성]         │
├ 거래 ───────────────────────────────────────┤
│ ○ 저가양수·고가양도        §35   [활성]          │
├ 자본거래 (Phase 2) ─────────────────────────┤
│ ⊘ 합병·증자·감자·현물출자·전환사채  [준비 중]      │
└─────────────────────────────────────────────┘
```
- 각 항목 `LawArticleModal` 배지(§34 등 클릭 → 조문 팝업).
- testid: `deemed-type-{insurance|bargain_transfer|debt_forgiveness|free_realestate|free_loan}`

---

## 2. 규정별 입력 위젯

> 공통: **증여일 `DateInput`은 페이지 상단 1개**(모든 의제 공통 — 증여시기·이자율 연도 룩업, 유형별 중복 입력 금지). 금액 `CurrencyInput`(원, hideUnit), 비율·연수 `DecimalInput`, 토글 `ToggleCard`/`RadioCardGroup`. placeholder 숫자예시 금지 → `FieldCard hint`. OFF도 tone 유지. testid: `deemed-gift-date`.

### (2) 보험금 §34 — `InsuranceForm`
```
┌ 보험금 증여 (§34) ──────────── sky ─┐
│ 유형  [RadioCardGroup]                │
│  ◉ 보험금 수령인 ≠ 보험료 납부자 (1호)  │
│  ○ 증여받은 재산으로 보험료 납부 (2호)   │
│ 보험금              [        ] 원       │
│ 납부보험료 총액      [        ] 원       │
│ ┌ 1호 선택 시 ─────────────┐          │
│ │ 수령인 외의 자가 납부한 보험료 [   ] │  │
│ └──────────────────────────┘          │
│ ┌ 2호 선택 시 ─────────────┐          │
│ │ 증여받은 재산으로 납부한 보험료 [  ] │  │
│ └──────────────────────────┘          │
│ [ToggleCard] §8 상속재산으로 보는 보험금  │
│   (켜짐 → §34② 증여세 미적용 안내)       │
└──────────────────────────────────────┘
```
- `caseType` 라디오 → 관련보험료 라벨/필드 전환. `isInheritanceInsurance` ToggleCard(켜짐 시 rose 안내 + 결과 미적용).
- testid: `ins-case-type`·`ins-proceeds`·`ins-total-premium`·`ins-relevant-premium`·`ins-inheritance-toggle`

### (3) 저가양수·고가양도 §35 — `BargainTransferForm`
```
┌ 저가양수·고가양도 (§35) ────── emerald ─┐
│ 관계  [RadioCardGroup]                  │
│  ◉ 특수관계인 (§35①)                    │
│  ○ 특수관계인 외 (§35②)                  │
│ 거래유형 [RadioCardGroup]               │
│  ◉ 저가 양수   ○ 고가 양도              │
│ 시가              [        ] 원         │
│ 거래대가           [        ] 원         │
│ ┌ 특수관계인 외 선택 시 ──────────┐     │
│ │ [ToggleCard] 거래관행상 정당한 사유 有 │  │
│ │   (켜짐 → §35② 미적용)              │  │
│ └────────────────────────────────┘     │
│ [ToggleCard] 과세제외 거래(§35③·법인세§52②) │
└────────────────────────────────────────┘
```
- 모드 토글(관계·거래유형)은 영향 필드 직전 배치 (UI 순서 = 계산 순서).
- 결과에 임계(MIN(시가30%,3억) or 시가30%·3억) 판정 표시.
- testid: `barg-related`·`barg-tx-type`·`barg-market`·`barg-price`·`barg-justifiable`·`barg-excluded`

### (4) 채무면제 §36 — `DebtForgivenessForm`
```
┌ 채무면제 등 (§36) ──────────── amber ─┐
│ 증여시기 [RadioCardGroup]              │
│  ◉ 채권자의 면제 (의사표시일)           │
│  ○ 제3자 인수·변제 (계약체결일)         │
│ 면제·인수·변제 채무액  [       ] 원      │
│ 보상(지급)액          [       ] 원      │
└──────────────────────────────────────┘
```
- testid: `debt-occur-type`·`debt-forgiven`·`debt-compensation`

### (5) 부동산 무상사용 §37 — `FreeRealEstateForm`
```
┌ 부동산 무상사용 (§37) ──────── violet ─┐
│ 유형 [RadioCardGroup]                  │
│  ◉ 무상 사용 (§37①)  ○ 무상 담보 (§37②) │
│ 관계 [RadioCardGroup] 특수 / 특수 외     │
│ ┌ 무상 사용 ──────────────┐            │
│ │ 부동산 가액   [       ] 원 │           │
│ │  hint: 5년 현가합 ≥ 1억 과세            │
│ └──────────────────────────┘            │
│ ┌ 무상 담보 ──────────────┐            │
│ │ 차입금       [       ] 원 │           │
│ │ 실제 지급이자 [       ] 원 │           │
│ │  hint: 차입이익 ≥ 1천만 과세           │
│ └──────────────────────────┘            │
│ ┌ 특수관계인 외 ──────────┐            │
│ │ [ToggleCard] 정당한 사유 有 (§37③)  │ │
│ └──────────────────────────┘            │
└────────────────────────────────────────┘
```
- `subType` 라디오 → 부동산가액 vs 차입금·이자 필드 전환.
- testid: `fre-subtype`·`fre-related`·`fre-property-value`·`fre-loan`·`fre-interest`·`fre-justifiable`

### (6) 금전 무상대출 §41의4 — `FreeLoanForm`
```
┌ 금전 무상대출 (§41의4) ──────── rose ─┐
│ 관계 [RadioCardGroup] 특수 / 특수 외    │
│ 대출금액            [       ] 원        │
│ 실제 지급이자        [       ] 원        │
│  hint: 무이자면 0. (대출금×4.6% − 이자) ≥ 1천만 과세 │
│ ┌ 특수관계인 외 ──────────┐           │
│ │ [ToggleCard] 정당한 사유 有 (§41의4③) │ │
│ └──────────────────────────┘           │
│ 적정이자율: 2016.3.7~ 연 4.6% (자동 적용) │
└────────────────────────────────────────┘
```
- 적정이자율은 증여일 기준 `gift-deemed-rates`에서 자동 — 입력 아님(표시만).
- testid: `loan-related`·`loan-amount`·`loan-interest`·`loan-justifiable`

---

## 3. 결과뷰 (`DeemedGiftResultView`)

`formula-display-builder` 패턴 — 변수 배지 + 값 + fine-print. 산식 한국어 풀어쓰기(약어·`floor()` 금지). 금액 우측정렬 `font-mono tabular-nums`, "원" 생략.

```
┌ 증여재산가액 (증여이익) ───────────────────┐
│                          100,000,000        │
│  ▼ 산출 근거 펼치기                          │
│  ├ 시가               1,000,000,000          │
│  ├ 거래대가             600,000,000          │
│  ├ 차액                 400,000,000          │
│  ├ 공제 MIN(시가30%,3억) −300,000,000        │
│  └ 증여재산가액         100,000,000          │
│  [근거: 상증법 §35 ①]  (LawArticleModal)     │
├────────────────────────────────────────────┤
│ ⓘ 미적용 시: rose 카드 "차액 2억 < 기준 3억   │
│    → 증여세 비과세" (exclusionReason)         │
├────────────────────────────────────────────┤
│ [ 이 금액으로 증여세 계산하기 ]  → 마법사 이관   │
└────────────────────────────────────────────┘
```
- 펼치기/접기 `ExpandToggleButton`(▼펼치기/▲접기), 인쇄 시 CSS-only 자동 펼침(`print:block`).
- 미적용(`applied=false`)이면 rose 카드 + `exclusionReason`. 금액 0 표시 안 함.
- testid: `deemed-result-value`·`deemed-breakdown`·`deemed-exclusion`·`deemed-to-wizard`

**세액 연결 이관**: `[증여세 계산하기]` → `toGiftWizardPrefill(result, label)` → `GiftTaxForm`에 `giftItems:[{category:'other', marketValue:deemedGiftValue}]` prefill + 라우팅. 사용자가 Step0(증여자)·Step2(사전증여)·Step3(공제) 입력 → 세액.

---

## 4. 14 동기화 지점 (클라이언트 ①~⑧)

| 지점 | Phase 1 내용 |
|---|---|
| ① 폼 상태 | `GiftDeemedCalculator`에 `type` + 유형별 폼 state (단일 활성) |
| ② initial | 유형 전환 시 해당 폼 INITIAL (이전 유형 값 보존 X — 명확) |
| ③ normalize | 숫자 문자열 → number (parseAmount) |
| ④ API 변환 | `lib/calc/gift-deemed-api.ts` `buildDeemedInput(form): DeemedGiftInput` |
| ⑤ UI 위젯 | §2 5폼 (CurrencyInput·RadioCardGroup·ToggleCard) |
| ⑥ 사이드바 | **N/A** — 단발 계산(합계 누적 없음). 결과뷰 단일 |
| ⑦ 결과 카드 | `DeemedGiftResultView` breakdown 산식 |
| ⑧ validation | Zod superRefine(유형별 required) + 폼 인라인(시가>0, 보험료총액>0 등) |

> ⑥ 사이드바 N/A 근거: 증여세 마법사 자체도 사이드바 합계 미노출(plan §calc-bridge gaps). 단발 의제 계산은 결과뷰로 충분.
> API/Route 측(⑨⑩⑫⑬⑭)은 engine.design §4 참조.

---

## 5. UI 규칙 준수 체크 (Do 단계 적용 — memory)
- [ ] 색상 섹션 카드 + 규정별 tone (sky/emerald/amber/violet/rose) — `feedback_section_card_numbering`
- [ ] `ToggleCard`/`RadioCardGroup`, OFF도 tone 유지 — `feedback_toggle_card_visibility`
- [ ] `CurrencyInput`(금액)·`DecimalInput`(비율)·`DateInput`(증여일) — `feedback_decimal_input`
- [ ] 결과 산식 한국어 풀어쓰기, 약어·floor 금지 — `feedback_result_view_korean_formula`
- [ ] "원" 생략 + 금액칼럼 우측정렬 font-mono — `feedback_no_won_suffix`·`amount-column-align`
- [ ] placeholder 숫자예시 금지 → FieldCard hint
- [ ] 법조문 배지 `LawArticleModal` — `feedback_law_article_link`
- [ ] 모드 토글은 영향 필드 직전 — `feedback_ui_order_follows_logic`
- [ ] 펼치기 `ExpandToggleButton` + 인쇄 CSS-only — `feedback_result_expand_toggle_standard`·`print-only-css-toggle`
- [ ] 결과 내부 id 노출 금지 (name 표시) — `feedback_no_internal_id_in_result`

---

## 6. E2E (Phase 1)
- `e2e/gift-deemed-bargain.spec.ts`: 유형선택(§35) → 특수·저가·시가10억·대가6억 → 결과 100,000,000 확인 → 세액연결
- `e2e/gift-deemed-insurance.spec.ts`: §34 1호 → 6,000만
- `e2e/gift-deemed-exclusion.spec.ts`: §35 임계미달 → 미적용 rose 카드
> 함정: 증여일 DateInput "일" 토글 오매칭 → textbox role 한정 (memory `project_transfer_input_error_prevention`).

---

## 7. 미결정 (Do 단계)
- 증여일 입력 위치 — 페이지 상단 공통 vs 유형별(적정이자율 연도 룩업 위해 §41의4·§37엔 필수). **상단 공통 배치** 잠정.
- prefill 이관 라우팅 방식(쿼리파라미터 vs zustand 임시 store) — 기존 마법사 진입 패턴 따름.
- Phase 2~3 유형 "준비 중" 표기 vs 숨김 — 잠정 비활성 표기(로드맵 가시성).
