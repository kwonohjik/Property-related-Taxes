# 겸용주택 수정신고·경정청구 — UI 설계

계획서: [`mixed-use-amendment-correction.plan.md`](./mixed-use-amendment-correction.plan.md) (rev.2 — 가드·배치 결정의 **정본**)
엔진 설계: [`mixed-use-amendment-correction.engine.design.md`](./mixed-use-amendment-correction.engine.design.md) (rev.2)
선행 UI 설계: [`transfer-tax-amendment.ui.design.md`](./transfer-tax-amendment.ui.design.md) ·
[`transfer-tax-correction-claim.ui.design.md`](./transfer-tax-correction-claim.ui.design.md)

## Context — UI 신규 위젯 **0개**

입력 측(마법사)은 **이미 전부 동작한다**(계획서 §1.5 실측):
`Step6.tsx:40-41`이 `form.amendmentMode`로 `AmendmentBlock`을 전환하고, `CorrectionModeBanner`
(`TransferTaxCalculator.tsx:448-451`)는 `isResult` 분기 **밖**·`formData` 기반이라 겸용주택에서도 노출된다.
validate(`transfer-tax-validate.ts:262`)도 자산종류 무관.

⇒ 본 UI 설계의 범위는 **결과 화면(⑦) 3건 + 이력 카드 1건**뿐이다. 신규 입력 위젯·신규 폼 필드 없음.

## 클라이언트 8 동기화 지점 — 실측 커버리지

| # | 지점 | 판정 | 근거 |
|---|---|---|---|
| ① | 폼 상태 타입 | **무변경** | `amendmentMode`·`correctionKind`가 `TransferFormData` 폼-전역(`calc-wizard-store.ts:183,201`) — 자산종류 무관 |
| ② | initial | **무변경** | 동상 `:268,279` |
| ③ | normalize | **무변경** | 신규 폼 필드 0 |
| ④ | API 변환 | **무변경** | `transfer-tax-api.ts:417-438` — `amendment`가 `mixedUse`(`:597`)와 같은 body에 이미 주입 |
| ⑤ | UI 입력 위젯 | **무변경** | `Step6.tsx:40-41` — 자산종류 분기 없음 |
| ⑥ | 사이드바 합계 | **무변경** | `computeTransferSummary`(`calc-wizard-store.ts:452-457`)는 테스트 전용 死코드(라이브 참조 0건 — 사이드바는 `transfer-per-asset-summary.ts`) |
| ⑦ | **결과 카드** | **변경** | 아래 §U1~U3 |
| ⑧ | validation | **무변경** | `transfer-tax-validate.ts:262` — 자산종류 무관 |

추가 1건(8지점 외): **이력 카드 납부세액**(§U4).

## U1. `AmendmentResultCard` 배치 — `calculation` PrintSection **내부** (D9)

`components/calc/results/mixed-use/MixedUseResultCard.tsx`

실측 구조(라인 = 현행):

```
<PrintSelectionPanel/>                      :106-111   (불변)
<PrintSection id="filing-form">             :114-138   (불변 — 신고서 양식 표)
<PrintSection id="calculation" …>           :141
  ★ 삽입 지점 — PrintSection 첫 자식 (아래 4요소보다 앞)
  ⚠ 경고박스                                 :143
  <PartialUsageChangeCard/>                 :150
  <UsagePeriodSplitCard/>                   :158
  1세대1주택 배지                             :166
  <ResultSection "양도가액 안분">              :184
  … 주택부분 · 상가부분 · 비사업용토지 …
  <ResultSection "합산 세액">
    <Row "총 납부세액" highlight large>       :435-441   ← U2 라벨 전환
</PrintSection>
<CalculationRouteCard/>
```

삽입 코드:

```tsx
<PrintSection id="calculation" selectedIds={selectedPrintIds} className="space-y-4">
  {/* ★ 수정신고·경정청구 hero — calculation 첫 자식(단건 TransferTaxResultView.tsx:270→:283 동형) */}
  {breakdown.amendmentDetail && (
    <AmendmentResultCard
      detail={breakdown.amendmentDetail}
      fullTotalTax={t.totalPayable}
    />
  )}
  {/* 기존 경고박스(:143) 이하 불변 */}
```

- `t`는 `:100`의 `const { …, total: t } = breakdown` 구조분해로 JSX 스코프 내 접근 가능(실측).
- `PrintSection` props(`PrintSection.tsx:12-22`) = `{id, selectedIds, children, className?}` — 기존 태그 그대로 사용.
- 조기반환(`:89-98`, `splitMode === "pre-2022-rejected"` → 에러박스)이 D8과 **구조적으로 정합** —
  거부 경로는 이 JSX에 도달조차 하지 않는다.

**금지 — 최상단(모든 PrintSection 밖) 배치**:
- 인쇄 선택과 무관하게 **항상 인쇄**되어 "선택은 인쇄 대상만 제어" 계약(`lib/print/mixed-use-print-sections.ts:7-8`) 위반.
- 인쇄 패널(`:104-111`)보다 위에 결과 카드가 놓이는 UX 역전.

**print leaf 미신설(D9)**: 단건도 amendment 전용 leaf가 없다(`lib/print/transfer-print-sections.ts` grep `amend` 0건 —
`calculation` PrintSection 내부 `TransferTaxResultView.tsx:270,283`에 편승). 동형 유지.
⇒ `MixedUsePrintSectionId`(`:35-38`)·`MIXED_USE_PRINT_SECTIONS`(`:47-63`)·`availablePrintIds`
(`MixedUseResultCard.tsx:84-85`)·`__tests__/print/mixed-use-print-sections.test.ts:25`(ALL_LEAVES)·`:81` **전부 불변**
(정책 `feedback_print_leaf_add_unit_test_sync` — leaf를 늘리지 않으므로 동기화 대상 아님).

**props 계약**: `fullTotalTax={t.totalPayable}` — 단건 `result.totalTax`와 의미 동일
(겸용은 가산세·농특세 경로 부재라 `본세 + 지방소득세`가 곧 전체 세액). 엔진 result만으로 도출.

## U2. "총 납부세액" Row — 존치 + 라벨 조건부 전환 (D10)

`MixedUseResultCard.tsx:435-441`

```tsx
<Row
  label={
    breakdown.amendmentDetail
      ? breakdown.amendmentDetail.correctionKind === "refund_claim"
        ? "경정 후 전체 세액"   // 카드 :87 "참고 · 경정 후 전체 세액"과 일치
        : "수정 후 전체 세액"   // 카드 :155 "참고 · 수정 후 전체 세액"과 일치
      : "총 납부세액"
  }
  value={fmt(t.totalPayable)}
  highlight
  large
  formula="양도소득세 + 지방소득세"
/>
```

> **⚠️ 단일 라벨("경정 후") 금지** — `AmendmentResultCard`는 분기별로 문구가 다르다
> (refund `:87` "경정 후" / **amend `:155` "수정 후"**). 단일 라벨로 고정하면 수정신고(더 흔한 케이스)에서
> 바로 위 카드와 **같은 숫자에 다른 라벨**이 뜬다 — U2가 없애려던 충돌을 U2가 재생산한다.
>
> **`correctionKind` 3분기가 안전한 이유(실측)**: `computeAmendment`의 amend 반환
> (`transfer-tax-amendment.ts:257-267`)은 `correctionKind`를 **설정하지 않는다**(undefined).
> refund 반환(`:128`)만 `correctionKind: "refund_claim"`을 명시 → `=== "refund_claim"` 비교가 정확히 동작.

**판정 근거(3-way)**:
- **Row 교체 기각** — 겸용의 총 납부세액은 hero 카드가 아니라 `ResultSection "합산 세액"`의 **결론 행**이다.
  제거하면 수정 결정세액의 산출근거가 끊긴다. 단건의 배타 교체(`TransferTaxResultView.tsx:282-284`)는
  hero **카드**가 대상이라 1:1 대응이 없다.
- **그대로 존치 기각** — hero "추가 납부세액"과 표 "총 납부세액"이 동시 노출되어 오독.
  `AmendmentResultCard`가 이미 동일 금액을 muted로 표시 — refund `:87` "참고 · 경정 후 전체 세액" ·
  amend `:155` "참고 · 수정 후 전체 세액" (**양 분기 모두**) → 3중 표시.
- **채택** — 라벨만 전환(금액·`highlight large` 불변). 카드 추가(U1)는 bundled 선례
  (`TransferTaxCalculator.tsx:521-528` = AmendmentResultCard 추가 + 자체 합계 존치)와 동형.

**표시 정합**(정책 `feedback_engine_result_display_drift`): 라벨이 바뀌어도 값은 `t.totalPayable` 단일 소스 —
카드의 "참고 · 경정 후 전체 세액"과 **동일 숫자**. 드리프트 없음.

## U3. 어댑터 — `amendmentDetail` 전달 금지 (D4 경계)

`MixedUseResultCard.tsx:20-52` `buildResultLike`(명세서·신고서 카드용 `TransferTaxResult`-like 어댑터)에
`amendmentDetail`을 **넣지 않는다**.

- 실측상 소비처 0건(`FilingFormTable`·`DetailedCalculationStatementCard` 모두 `amendmentDetail` 미참조)이라
  넣어도 현재는 무해하나, **D4(신고서 replica = 당초 신고 서식) 경계를 코드로 지키기 위해** 명시 금지.
- 어댑터의 `determinedTax: t.transferTax`(`:42`)는 **엔진 기준값과 동일 축** — 유지.
  향후 어댑터가 `breakdown.amendmentDetail`을 **재계산하지 않도록** 주의(dual-truth 방지).

## U4. 이력 카드 납부세액 `-` → 금액 (§1.6)

`app/history/HistoryClient.tsx:160-178` `extractTotalTax()` — `inner` 블록(`:162-166`) **내부**에 분기 추가:

```ts
const inner = resultData?.result as Record<string, unknown> | undefined;
if (inner) {
  if (inner.isExempt) return "비과세";
  if (typeof inner.totalTax === "number") return inner.totalTax.toLocaleString();
  if (typeof inner.finalTax === "number") return inner.finalTax.toLocaleString();
  // ★ 겸용주택(mode:"mixed-use") — 납부세액이 result.total 한 단계 깊음
  const t = inner.total as { totalPayable?: number } | undefined;
  if (typeof t?.totalPayable === "number") return t.totalPayable.toLocaleString();
}
```

- **회귀 안전(실측)**: `inner` 블록 내부이므로 top-level `totalPayable`(재산세, `:175`)·`grandTotal`(종부세, `:176`)
  분기와 충돌 없음. `inner.isExempt`가 먼저 걸리는 케이스도 불변.
- **export 필요**: A9 앵커용. → **A9 경로 확정**: `__tests__/app/history/extract-total-tax.test.ts`(신규).
  `lib/storage/`로 함수를 옮기는 안은 **전 세목 공용 함수 이동 = blast-radius 확대**라 본 작업 범위 외
  (계획서 §6 O2와 함께 별도 트랙).

## 화면 흐름 (겸용주택 수정신고)

```
/history  ─ 겸용주택 카드 [수정신고] [경정청구] ← D5 가드 해제로 노출
                │  납부세액: 219,902,989      ← U4 (기존 "-")
                ▼ enterAmendment(record, router)
/calc/transfer-tax  ─ CorrectionModeBanner "수정신고 모드"   (기존 — 무변경)
                │  Step "가산세" → AmendmentBlock            (기존 — 무변경)
                │    · 당초 결정세액 = result.total.transferTax 자동 prefill  ← H2
                ▼ 계산
결과 ─ <PrintSection "calculation">
         ★ AmendmentResultCard  (hero: 추가 납부세액 / 환급 청구세액)   ← U1
           …
           Row "수정 후 전체 세액"  219,902,989   (경정청구면 "경정 후")  ← U2
```

## E2E 설계 (`e2e/mixed-use-amendment.spec.ts` — 신규)

**시딩 재사용**: `mixed-use-filing-form-4col.spec.ts:16-39`의 `mixedUseAsset()`(+ `seedAndCalc` `:61-73`)
(`makeDefaultAsset` + `sessionStorage("transfer-tax-wizard")` 시드 + reload — 일반 겸용주택 §97 직접환산)
+ `transfer-amendment.spec.ts:61-79`의 amendmentMode 주입 패턴 결합(**동일 키·동일 방식**이라 결합 가능).

**셀렉터**:

| 대상 | 셀렉터 | 상태 |
|---|---|---|
| 이력 카드 수정신고 버튼 | `getByRole("button", {name:"수정신고", exact:true})`**`.first()`** (`transfer-amendment.spec.ts:255` — 이력 카드 복수 시 strict mode 위반 방지) | 기존 재사용 |
| 드로어 버튼 | `drawer-amend`(`HistoryDetailDrawer.tsx:302`) / `drawer-correction`(`:313`) | 기존 재사용 |
| **결과 hero** | `getByTestId("amendment-result")` | **신규 추가 완료**(Do) — 양 분기 루트 div(`AmendmentResultCard.tsx` refund/amend) |

⇒ **`AmendmentResultCard`에 `data-testid="amendment-result"` 추가**(단건·다건·bundled E2E에도 이득).

> **Do 환류**: 라벨 단언은 **`{ exact: true }` 필수**. `getByText`는 부분일치라
> 카드 산출근거의 `"수정신고 총 납부세액"`(= 추가본세+가산세 — `transfer-tax-amendment.ts:249`,
> "전체 세액"과 **별개 개념**)이 `"총 납부세액"` 단언에 걸린다.
대안 2종: (a) `[data-print-id="calculation"]` 스코프 — `PrintSection`이 `data-print-id`를 자동 부여(`PrintSection.tsx:26`) ·
(b) 텍스트 매칭 `환급 청구세액`(`AmendmentResultCard.tsx:55`). 둘 다 e2e/CLAUDE.md §3(결과 화면 라벨 중복 →
스코프 한정) 준수 필요.

**시나리오**(계획서 §5.4):
1. 겸용 계산 → 이력 저장 → `/history` 납부세액 **숫자 표시**(U4)
2. [수정신고] → 마법사 → Step "가산세"에 `AmendmentBlock` + **당초 결정세액 prefill**
3. 양도가액 수정 → 계산 → `calculation` 선두 **추가납부 hero** + 표 마지막 행 **"수정 후 전체 세액"**(U2 amend)
4. [경정청구] → 환급 hero(emerald) + 청구기한 + 표 마지막 행 **"경정 후 전체 세액"**(U2 refund)
5. **D5 회귀** — 다건 "이력 불러오기" 모달에 겸용주택 record **미노출**

## UI 정책 체크리스트

- [x] 신규 입력 위젯 0 → `DateInput`·`CurrencyInput`·`ToggleCard`·`RadioCardGroup` 규칙 **해당 없음**
- [x] `useEffect → store` 미러링 **없음** (신규 폼 필드 0)
- [x] 톤 하드코딩 없음 — `AmendmentResultCard` 기존 컴포넌트 재사용(emerald/primary 자체 보유)
- [x] 임의 px 폰트 없음 — 기존 컴포넌트 재사용
- [x] 금액 칸 정렬 — `AmendmentResultCard`의 `Row`(`:28`)가 이미 `font-mono tabular-nums` 적용
- [x] 결과 산식 한국어 — `detail.steps`가 이미 한국어 풀어쓰기(`transfer-tax-amendment.ts:99-125,165-255`)
- [x] 내부 id 노출 없음
- [x] **800줄 정책** — `MixedUseResultCard.tsx` 728줄 → **~745줄**(U1 5줄 + U2 1줄 라벨 삼항). 800 미만 유지.
      추가 확장 시 분리 신호 (`feedback_800line_split_export_preservation`)
- [x] print 토글 — U1이 기존 `<PrintSection id="calculation">` 내부라 `print-only-css-toggle` 규칙 자동 승계
