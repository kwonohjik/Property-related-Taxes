# 신탁수익권(§61)·정기금받을권리(§62) — UI 설계

> 계획서: `docs/00-pm/inheritance-gift-trust-benefit-valuation-61.plan.md`. 엔진: `inheritance-gift-trust-benefit-valuation-61.engine.design.md`.
> 패턴 선례: `variants/EstateBodyReceivable.tsx`·`EstateBodyConvertibleBond.tsx`·`EstateBodyIntangibleIp.tsx`·`EstateBodySuperficies.tsx`.

## 신규 컴포넌트 2종 (`components/calc/inheritance/estate-card/variants/`)
- `EstateBodyTrustBenefit.tsx` — 신탁수익권 입력
- `EstateBodyPeriodicPayment.tsx` — 정기금받을권리 입력

barrel `variants/index.ts` re-export + `variants/types.ts` `SupportedCategory`에 2종 추가. `EstateItemEditor.tsx:52` VariantBody switch case 2개(🔴 tsc-blind — 수동 확인).

---

## EstateBodyTrustBenefit — 입력 순서 (= §61 평가 로직 순서)

```
┌─ 신탁수익권 (상증령 §61) ───────────────────────────┐
│ ① 수익자 구성  [RadioCardGroup · emerald]            │
│   ◉ 동일수익자(원본·수익 같은 사람)  testId=tb-same   │
│   ○ 원본권 (수익자 다름)             testId=tb-prin  │
│   ○ 수익권 (수익자 다름)             testId=tb-inc   │
│                                                      │
│ ② 신탁재산 구성 (결정 B 하위 자산)  [sky 섹션카드]    │  ← diff_income 외 노출(1호·2호가만 신탁재산 필요)
│   [+ 항목추가]  종류 라벨 · 평가액(CurrencyInput)     │
│   소계: Σ value  (자동, font-mono 우측정렬)          │
│                                                      │
│ ③ 수익률  [ToggleCard · violet "수익률 확정"]         │  ← same·diff_income(수익권 PV 필요 분기) 노출
│   ON: 수익률 % (DecimalInput) / 원천징수세율 %       │
│   OFF(amber): "미확정 → 원본×3%(칙§19의2②)" 안내     │
│                                                      │
│ ④ 수익시기  [sky]                                    │  ← 수익권 PV 분기 노출
│   수익만기일 (DateInput, <div data-testid=tb-mat>)   │
│   [ToggleCard "수익시기 미정"] ON → RadioCardGroup:   │
│     ○ 무기(20년) ○ 종신(성별·나이→기대여명)           │
│   잔존연수 override (DecimalInput, 선택)              │
│                                                      │
│ ⑤ 해지·철회 일시금 (CurrencyInput, 선택)  [sky]       │
└──────────────────────────────────────────────────────┘
```

**분기 노출**(엔진 분기 = UI 노출):
- `same`(1호): ② 신탁재산 + ⑤ 일시금. (평가=신탁재산가액 — ③④ 불요지만 표시상 생략)
- `diff_principal`(2호가): ② 신탁재산 + ③ 수익률 + ④ 수익시기 + ⑤. (원본권 = 재산−수익권 → 수익권 PV 필요)
- `diff_income`(2호나): ③ 수익률 + ④ 수익시기 + ⑤. (② 신탁재산 불요)

---

## EstateBodyPeriodicPayment — 입력 순서 (= §62)

```
┌─ 정기금받을권리 (상증령 §62) ───────────────────────┐
│ ① 정기금 종류  [RadioCardGroup · emerald]            │
│   ◉ 유기정기금   testId=pp-finite                    │
│   ○ 무기정기금   testId=pp-perp                      │
│   ○ 종신정기금   testId=pp-life                      │
│                                                      │
│ ② 1년분 정기금액 (CurrencyInput)  [sky]              │
│                                                      │
│ ③ 기간  [sky]                                        │
│   유기: 만기일(DateInput) 또는 잔존연수 override      │
│   종신: 성별·나이(→기대여명 floor) / 또는 override   │
│   무기: (없음 — 1년분×20)                            │
│                                                      │
│ ④ 해지·철회 일시금 (CurrencyInput, 선택)  [sky]       │
└──────────────────────────────────────────────────────┘
  안내(amber): "유기는 1년분×20 한도. 이자율 3%(칙§19의2③)"
```

---

## 위젯 함정 (MEMORY 교훈 — 강제)
- `RadioCardGroup`: 그룹 testid 미지원 → **옵션별 `testId`**.
- `DateInput`: data-testid 미forward → **`<div data-testid>` 래퍼**.
- `CurrencyInput`: `label` 필수(FieldCard 안 `hideLabel`). 금액=CurrencyInput·연수/%=DecimalInput(소수점).
- `ToggleCard`: OFF도 tone 배경 유지. 수익시기 미정 토글 boolean → schema `.optional()`(엔진 `!!`).
- placeholder 숫자 예시 금지 → FieldCard `hint` 한국어.
- override clamp: schema `.positive().int()` + UI `Math.max(0, Math.trunc())` (silent drift 차단).

## 동기화 (UI측 8지점)
| # | 지점 | 위치 |
|---|---|---|
| ① 폼상태 | EstateItem(엔진 타입 직접) | types §input |
| ② initial | 카테고리 변경 시 기본값 | CategoryChangeDialog preserved |
| ③ normalize | — (optional, sessionStorage 호환) | |
| ④ API | gift-api:52·InheritanceTaxForm:428 주입 호출 | inject 2함수 |
| ⑤ 위젯 | EstateBodyTrustBenefit·PeriodicPayment | 신규 2 |
| ⑥ 사이드바 | computeEffectiveValuation if-블록 2 | 🔴 tsc-blind |
| ⑦ 결과카드 | InheritanceTaxResultView ASSET_CATEGORY_LABELS:21 + breakdown 산식 | 한국어 풀어쓰기 |
| ⑧ validate | estate-item-schema:527 멤버 2 | 단일 허브 |

## 결과뷰 산식 (한국어 풀어쓰기 — formula-display-builder)
- 신탁 1호: "신탁재산 평가액(§61①1호 동일수익자)". 2호가: "신탁재산 − 수익권 현가합(§61①2호가)". 2호나: "수익 현가합(§61①2호나)".
- 정기금 유기: "Σ 각연도 정기금 현가 (1년분×20 한도 적용 시 한도)". 무기: "1년분 × 20". 종신: "기대여명 N년 현가합".
- 일시금 적용 시: "해지일시금이 평가액보다 커 일시금 적용(§61①·§62 단서)".
- 금액 칸 `font-mono tabular-nums text-right`(amount-column-align).
