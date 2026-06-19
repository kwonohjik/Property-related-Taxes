# 신탁이익의 증여 (§33) — UI 설계

> 엔진 설계: `gift-trust-benefit.engine.design.md` · 계획: `docs/00-pm/gift-trust-benefit.plan.md`.
> 공용 규칙: `components/calc/CLAUDE.md`(RadioCardGroup·CurrencyInput·DecimalInput·ToggleCard 필수, native 금지).

## Context

증여 의제 유형 선택(`DeemedTypeSelector`, `deemed-gift/shared.tsx`)에 `trust_benefit` 추가 + Step② 입력(`DeemedInputFields` switch, shared.tsx:374)에 `TrustBenefitFields` 신규. 결과는 공통 `DeemedGiftResultView`가 breakdown 회차별 PV 렌더.

---

## 유형 선택 (TYPE_OPTIONS — shared.tsx:330)
```ts
{ value: "trust_benefit", label: "신탁이익의 증여",
  description: "상증법 §33 — 원본·수익 권리 현재가치(령§61·3%)", testId: "deemed-type-trust_benefit" }
```
- 라벨맵(shared.tsx:300~)도 `trust_benefit: { label: "신탁이익의 증여", law: "상증법 §33" }`.
- 23종으로 홀수 → `RadioCardGroup columns={2}`(feat/gift-2col 머지 후) 마지막 칸 단독. 정상.

## 입력 위젯 (`TrustBenefitFields` — 신규, `deemed-gift/other-forms.tsx` 또는 신규 `trust-forms.tsx`)

```
┌─ 신탁이익의 증여 (§33) ────────────────────────────── rose ─┐
│ 수익자 구성 (RadioCardGroup, §61①)                          │
│   ◉ 원본·수익 동일 수익자 (§61①1호)        → same           │
│   ○ 원본만 수익 (§61①2호가목)              → diff_principal │
│   ○ 수익만 수익 (§61①2호나목)              → diff_income    │
│                                                             │
│ 신탁재산(원본) 가액         [ 800,000,000 ] 원  CurrencyInput│
│ ▸ 수익률 확정 (ToggleCard ON)                               │
│   확정 수익률              [ 10 ] %      DecimalInput        │
│   (OFF=미확정 → 칙§19의2② 원본×3% 자동)                     │
│ 원천징수세율               [ 15.4 ] %    DecimalInput        │
│ 수익 분할 횟수(계약기간 연수)[ 3 ] 년    DecimalInput        │
│ 해지·철회 일시금(선택)      [        ] 원  CurrencyInput     │
│ ▸ 증여시기 (RadioCardGroup, §25①, 표시용)                   │
│   ○ 실제 지급일  ○ 위탁자 사망일  ○ 약정일  ◉ 분할 최초지급일│
│ ─ 미리보기 ─ 수익권 197,183,628 + 원본 800,000,000          │
│            → 증여재산가액 997,183,628                       │
└─────────────────────────────────────────────────────────────┘
```

- **수익자 구성·증여시기**: `RadioCardGroup` tone="rose"(deemed 공통). native radio 금지.
- **수익률 확정 토글**: `ToggleCard` — OFF 시 미확정(원본×3%), ON 시 % 입력. 율→분수 변환은 API/엔진 입력 직전 — **소수자릿수 기반 정확 변환**(10%→{1,10}, 15.4%→{154,1000}, 15.45%→{1545,10000}; `denom=10^(2+소수자리)`, `numer=round(pct×denom/100)`). `pct*10/1000` 고정 금지(2자리 % 오차).
- **금액(원)**: `CurrencyInput`+`parseAmount`. **%·연수**: `DecimalInput`+`parseDecimal` (CurrencyInput 금지 — 소수 버그).
- **미리보기**: 엔진 `calcTrustBenefit` 직접 import(single-source) useMemo — UI 재계산 금지.
- testid: `tb-beneficiary-radio`·`tb-property-value`·`tb-yield-toggle`·`tb-yield-rate`·`tb-withholding`·`tb-installments`·`tb-surrender`·`tb-gift-timing-radio`·`tb-preview`.

## 결과 (DeemedGiftResultView — 변경 최소)
공통 breakdown 렌더 재사용. `calcTrustBenefit`의 breakdown 행: 수익¹~ⁿ PV(각 67,680,000·65,708,737·63,794,891…) + 원본권(800,000,000, diff_income 제외) + (해지일시금>평가액 시) Max 행. `formula-display-builder` 패턴.

## 8지점 동기화 (UI 측)
| # | 작업 |
|---|---|
| ① 폼 | DeemedFormState에 trust 필드 (shared.tsx form state) |
| ② initial | 기본값 (beneficiaryType="same", installments 빈값) |
| ③ normalize | sessionStorage 호환 |
| ④ API | gift-deemed API 변환 — % → 분수, DeemedGiftInput 구성 |
| ⑤ 위젯 | TrustBenefitFields (本문서) |
| ⑥ 사이드바 | N/A (deemed는 단건 결과) |
| ⑦ 결과 | breakdown 회차별 PV (공통 렌더) |
| ⑧ validation | beneficiaryType·원본·원천징수·installments 필수, surrender 선택. 미입력 차단(자동 fallback 금지) |

## E2E (`e2e/gift-deemed-trust-benefit.spec.ts`, E2E_PORT=3104)
1. **TB-UI-1**: 유형 "신탁이익의 증여" 선택 → 동일수익자·원본 8억·수익률 10%·원천징수 15.4%·3년 입력 → 미리보기 "997,183,628" + 계산 결과 deemedGiftValue 997,183,628.
2. **TB-UI-2**: 수익률 확정 토글 OFF → 미확정(원본×3%) 안내 노출.
E2E 함정: RadioCardGroup native radio role·DecimalInput placeholder·worktree E2E_PORT=3104.
