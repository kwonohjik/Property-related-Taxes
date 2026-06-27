# 채권가액 평가 — UI 설계

> 상위: [`inheritance-receivable-valuation.plan.md`](./inheritance-receivable-valuation.plan.md) · [`.engine.design.md`](./inheritance-receivable-valuation.engine.design.md)
> 대상: EstateItem `receivable` 카테고리 입력 폼(`EstateBodyReceivable`) + 결과 표시. 템플릿: 지상권 `EstateBodySuperficies`.
> 기준 코드: worktree `receivable-valuation`. 인용 실측.

## 1. 진입·디스패치

- `components/calc/EstateItemEditor.tsx:46 VariantBody` switch에 `case "receivable": return <EstateBodyReceivable {...props} />`.
- 신규 `components/calc/inheritance/estate-card/variants/EstateBodyReceivable.tsx` + `variants/index.ts` re-export.
- 카테고리 노출 3원 배열(계획서 §5 ⚠️)에 `"receivable"` 추가: `estate-category-meta.ts:39`·`deemed-category-policy.ts:28`·`CategoryChangeDialog.tsx:45·56`.
- 라벨/아이콘: `estate-category-meta.ts` `CATEGORY_LABELS:21`="채권(대여금·외상매출금 등)", `CATEGORY_ICONS:32`="📄".

## 2. 입력 폼 레이아웃 (위젯 바인딩)

```
┌─ 채권 (대여금·외상매출금·받을어음 등) ───────────────────┐
│ 자산 명칭            [____________]  (선택, onFocus select)   │
│                                                              │
│ 채권 종류  ◉대여금/대부금 ○외상매출금 ○받을어음            │   RadioCardGroup
│            ○정리채권 ○기타                                  │   → receivableKind
│                                                              │
│ 평가방식 [ToggleCard]                                        │   → receivableMode
│   OFF(simple): 회수기간 5년 이내 — 원본+미수이자            │   (OFF도 tone 유지)
│   ON(discounted): 5년 초과·회사정리/화의 — 현가할인         │
│ ────────────────────────────────────────────────────────── │
│ [simple 일 때]                                              │
│   원본(원금) 가액      [        0] 원   CurrencyInput        │   → receivablePrincipal
│   미수이자상당액       [        0] 원   CurrencyInput        │   → receivableAccruedInterest
│   ┌ rose 회수불가능 차감(선택) ──────────────────┐          │
│   │ 차감액 [    0]원  사유 [__________]          │          │   → receivableUncollectible
│   └────────────────────────────────────────────┘          │   /…Reason
│                                                              │
│ [discounted 일 때]                                          │
│   ┌ amber 적정할인율 ─────────────────────────────┐         │
│   │ 평가기준일 기준 자동: 8.0% (2016.3.21.~)       │         │   resolveReceivableDiscountRate
│   │ override [   ]%  (미입력 시 자동)              │         │   → receivableDiscountRateOverride
│   └──────────────────────────────────────────────┘         │
│   연도별 회수 스케줄                                         │   → receivableSchedule[]
│   ┌──────────┬─────────────────┬────┐                       │
│   │ 회수일    │ 회수금액(원본+이자)│ ✕ │                       │   DateInput + CurrencyInput
│   │[2031-…]  │[1,500,000,000]원 │    │                       │   recoverDate / amount
│   │  …(행 추가 +)                                            │
│   └──────────┴─────────────────┴────┘                       │
│   ┌ rose 안내 ─────────────────────────────────┐            │
│   │ 회수불가능분은 각 회수금액에서 미리 차감해   │            │   (케이스 C×discounted=(가)안)
│   │ 입력하세요.                                  │            │
│   └────────────────────────────────────────────┘            │
│   ⚠ amber: 최종 회수일−평가기준일 ≤5년인데 현가할인 선택됨   │   resolveReceivableRecoveryYears
│                                                              │
│ ─ 평가액 미리보기:  2,837,396,278 원 ─                       │   computeEffectiveValuation
└──────────────────────────────────────────────────────────────┘
```

### 위젯 규칙
- 토글/라디오 native 금지 → `ToggleCard`·`RadioCardGroup` 필수(메모리 `feedback_toggle_card_visibility`, OFF도 tone).
- 금액 `CurrencyInput`(parseAmount), 날짜 `DateInput`(type=date 금지). onFocus 전체선택은 `SelectOnFocusProvider` 전역.
- 금액 칸 `font-mono tabular-nums text-right`(스킬 `amount-column-align`).
- placeholder 숫자예시 금지 — 형식설명은 FieldCard `hint`.
- 모드 토글은 **영향 필드 직전** 배치(UI순서=로직순서, `feedback_ui_order_follows_logic`).

## 3. 가시성 (asset-toggle-visibility.ts:76 인근 신규 `receivable` 블록)

| 필드 | simple | discounted |
|---|---|---|
| receivableKind | 표시 | 표시 |
| receivablePrincipal | 표시(필수) | 숨김 |
| receivableAccruedInterest | 표시 | 숨김 |
| receivableUncollectible/Reason | 표시 | 숨김(스케줄 사전반영) |
| receivableDiscountRateOverride | 숨김 | 표시 |
| receivableSchedule | 숨김 | 표시(필수 ≥1) |

> mode 전환은 `receivableMode` onChange만으로 파생(useMemo) — **useEffect→store 미러링 금지**(`mirror-pattern`).
> 숨김 필드값은 store에 남되 validate·엔진에서 모드별로 무시(지상권 override 패턴).

## 4. 검증 (estate-item-schema.ts receivableItemSchema)

```ts
receivableItemSchema = base.extend({ category: z.literal("receivable"), … }).superRefine((it, ctx) => {
  if (it.receivableMode === "discounted") {
    if (!it.receivableSchedule?.length) addIssue(["receivableSchedule"], "연도별 회수 스케줄을 1건 이상 입력하세요.");
    it.receivableSchedule?.forEach((s,i) => { if (!(s.amount>0)) addIssue([… i], "회수금액을 입력하세요."); /* recoverDate 필수 */ });
  } else { // simple  (optional 가드 — U2)
    if (!((it.receivablePrincipal ?? 0) > 0)) addIssue(["receivablePrincipal"], "원본(원금) 가액을 입력하세요.");
    if (it.receivableUncollectible && it.receivableUncollectible > (it.receivablePrincipal ?? 0))
      addIssue(["receivableUncollectible"], "회수불가능 차감액이 원본을 초과할 수 없습니다.");
  }
});
```
- discriminatedUnion(`estate-item-schema.ts` 마지막)에 등록.
- **API/UI fallback ↔ validate 동기화**(`feedback_validation_sync_8th_point`): 미입력 차단(자동 안분 fallback 금지).

## 5. 사이드바 합계 (⑥)
`computeEffectiveValuation(item, valuationDate)` — receivable은 valuationDate 주입 후 evaluateReceivable. 부분입력 try/catch 0. 0원 미표시.

## 6. 결과 카드 (⑦)
`InheritanceTaxResultView` breakdown 자동 렌더(엔진이 한국어 산식 제공). 예:
```
채권 평가 (정리채권 §58②)
  2031.12.20 회수 1,500,000,000 ÷ (1+8%)^9 = 750,373,451
  …(연도별)
  현재가치 합계 = 2,837,396,278
```
- 변수약어·`floor()` 금지, 한국어 풀어쓰기(`feedback_result_view_korean_formula`).
- 별지2호: `besshi-buppyo-2-data.ts:51 CATEGORY_LABEL_KO["receivable"]="채권"` + `inheritance-filing-form-helpers.ts` typeCode(코드표 검증 후, §9).

### testid 규칙 (E2E 셀렉터 동결, U1)
- 모드 토글 `role=switch`(ToggleCard 기본). 스케줄 행: `data-testid="receivable-row-{i}"`, 회수일 `receivable-row-{i}-date`,
  금액 `receivable-row-{i}-amount`, 행추가 `receivable-row-add`, 삭제 `receivable-row-{i}-remove`. 미리보기 `receivable-preview`.

## 7. E2E (`e2e/receivable-valuation.spec.ts`)
- 채권 카테고리 선택 → discounted 토글 → 스케줄 5행 입력 → 계산 → 결과 `2,837,396,278` 검증.
- 셀렉터 표준(`feedback_e2e_gift_modal_chip_switch_selectors`): ToggleCard=`role=switch`, 자산명=모달 안.
- simple 케이스(RC-A1=103,000,000) 별도 spec.
- 포트 격리 `E2E_PORT=3102`(worktree slot 2).

## 8. 동결 전 확인
- CATEGORY_ICONS 이모지 선택 / 별지2호 type 코드(코드표) / 할인율 표시 포맷(8.0%)
