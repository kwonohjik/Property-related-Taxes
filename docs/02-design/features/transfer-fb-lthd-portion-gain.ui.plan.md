# 가업상속공제 자산 §95④ 후단 장기보유특별공제 — 부분별 양도차익 분할 · UI 계획서

작성 2026-11-26 · 워크트리 `Property-related-Taxes-fb-lthd-plan` · 브랜치 `docs/fb-lthd-portion-gain-plan` · 기준 master `210de9754`
짝 문서: `transfer-fb-lthd-portion-gain.engine.plan.md` (병렬 작성 중 — 엔진 echo 이름은 그쪽이 정본이다. 이 문서의 «(가정)» 표시 이름은 **엔진 계획서와 맞출 것**)
선행 계획: `transfer-fb-lthd-95-4-latter.plan.md`(후단 도입) · `fb-97-2-4-fixes.plan.md`(F-3·F-2·F-1) · 진행 중 PR #3672(`fix/fb-rate-fraction`)

> **표기 규약** — 수치는 throwaway probe(`npx tsx`로 `calculateTransferTax` 직접 호출 · 스크래치패드 · 커밋 안 함, `makeMockRates()`)로 실측했다. 인용은 master `210de9754` 기준 file:line이다. 미확인은 «확인 필요». 이 문서는 **문서만** — 코드 변경 0.

---

## 0. 요약

- **세액·장특 계산은 엔진 계획서 소관이다.** UI는 엔진이 부분별로 낸 echo를 **그대로 읽어** 보여 준다(재계산 금지 — 신고서가 합계를 다시 쪼개다 틀린 선례 `transfer-mixed-use-filing-lthd-part-split.plan.md`).
- **입력 변경 없음** — ①~⑧ 변경 없음, ⑨~⑭ 변경 없음. 필요한 입력(피상속인 취득일·적용률·피상속인 취득가액·상속개시일 평가액·양도가액·필요경비)은 이미 전부 있다(§4).
- **변경은 결과 표시(⑦)뿐**: ① 가업상속 비교 카드에 «부분별 장기보유특별공제» 표 신설, ② 엔진 step 산식 문구 교체(명세서·계산 단계·PDF 계산 단계가 자동 반영), ③ PDF·명세서의 «(22%)» 가중 공제율 라벨 정리, ④ (엔진 의존) 표2 보유·거주 sub-step 정정.
- **실효(가중) 공제율은 숨기는 쪽을 추천**(UQ-1) — 법에 가중률이 없고, 새 공제액은 어떤 반올림 율×전체 양도차익으로도 재현되지 않는다.
- 선행 조건: **#3672 머지 → 엔진 PR → UI PR** 순(§9). #3672가 `transfer-tax-lthd.ts:643`·`FamilyBusinessImputedComparisonCard.tsx`를 이미 고치고 있다.

---

## 1. 결함 — 교재 사례 (실측)

피상속인 2012.3.8. 토지 5억 취득 → 2022.4.10. 상속(시가 15억 · 적용률 70%) → 2026.10.15. 양도가액 18억 · 양도비 3천만.

| 구분 | 적용분 (70%) | 비적용분 (30%) | 합계 |
|---|---|---|---|
| 양도가액 | 1,260,000,000 | 540,000,000 | 1,800,000,000 |
| 취득가액 | 350,000,000 (피상속인 5억 × 70%) | 450,000,000 (평가액 15억 × 30%) | 800,000,000 |
| 필요경비(양도비) | 21,000,000 | 9,000,000 | 30,000,000 |
| 양도차익 | **889,000,000** | **81,000,000** | 970,000,000 |
| 보유기간 | 피상속인 취득일부터 14년 | 상속개시일부터 4년 | |
| 장특 공제율 | 28% | 8% | |
| 장특 공제액 | **248,920,000** | **6,480,000** | **255,400,000** |

→ 양도소득금액 714,600,000 − 기본공제 2,500,000 = **과세표준 712,100,000**(사용자 제시 정답과 산술 일치).

**앱 현행 실측**(probe1 · 토지 · mock 세율): `transferGain 970,000,000 · longTermHoldingRate 0.22 · longTermHoldingDeduction 213,400,000 · taxBase 754,100,000`. 장특 step 문구:

```
970,000,000 × 22% | 가업상속공제적용률 70% 분은 피상속인 취득일부터 14년 → 28% + 나머지 30% 분은 상속개시일부터 4년 → 8% = 22% (소득세법 §95④ 후단) | 보유기간 4년 6개월
```

(엔진 `transfer-tax-lthd.ts:630-665` L-5 블록 — 양도차익 970M을 적용률로만 안분: `:643` decedentGain = 970M × 70% = 679M → 28%, 나머지 291M → 8%. 부분별 양도가액·취득가액·필요경비는 안분하지 않는다.) 차이 **−42,000,000**(255.4M − 213.4M).

UI 관점의 부수 발견:

| ID | 현상 | 실측 근거 |
|---|---|---|
| **U-1** | 장특 step 문구 끝의 «보유기간 4년 6개월»은 **상속개시일 기산만**이다. 적용분은 14년인데 한 줄에 두 기간이 섞여 읽힌다 | probe1 · `transfer-tax-lthd-steps.ts:149`(`holdingPeriodStr`)·`:244-246` |
| **U-2** | 표2(1세대1주택) FB 결과의 sub-step **보유 기간분 장특 194,880,000 / 거주 기간분 장특 194,880,000**이 본 step(389,760,000 = 56%)과 어긋난다 — 정답은 보유분 36%·거주분 20%(696M × 36% = 250,560,000 / × 20% = 139,200,000, **산술 도출 — 엔진 확정 필요**). sub-step이 상속인 보유연수 × 4% 하나로 총액을 나누기 때문 | probe2(C-6 anchor 픽스처) · `transfer-tax-lthd-steps.ts:292-330`. 신고서가 이 sub-step을 읽는다(`lthd-split-display.ts:64-77` `resolveLthdSplit`) → **세액 불변·신고서 보유분/거주분 칸만 오표시** (현행 결함 — 이번 수정 범위에 포함 권고, UQ-5) |
| **U-3** | PDF «장기보유특별공제 (22%)» 라벨(`ResultPdfTransferSections.tsx:168`)은 현재 `22% × 970M = 213.4M`로 자기 일치한다. 수정 후 엔진이 실효율(26.33%)을 주면 PDF가 «(26.3%)»를 찍는데 `970M × 26.3% = 255,110,000 ≠ 255,400,000` | `lib/pdf/ResultPdfPrimitives.ts:127-130` `fmtRate`(소수 1자리) |
| **U-4** | 명세서 «보유기간» 행(`DetailedStatementDateItems.ts:100-105`)과 신고서 보유기간 칸(`FilingFormTableHelpers.ts:188`)은 상속개시일 기산 «4년 6개월»만 보인다. 이월과세 파트에는 파트별 기산일 분기가 있는데(`:96-99`) FB에는 없다 | 코드 대조 |

---

## 2. 현재 장특 표시 경로 전수 (file:line)

값의 단일 원천은 **엔진 `CalculationStep`(label «장기보유특별공제»)의 `formula`/`amount`와 결과 숫자 필드**다.

### 2.1 엔진 → 문구

| 위치 | 하는 일 |
|---|---|
| `lib/tax-engine/transfer-tax-lthd.ts:614-665` | L-5 블록. `fbLthdFormula` 문자열(`:659-663`) + `rate: blendedRate`(`:665`, 가중율 0.22) 반환 |
| `lib/tax-engine/transfer-tax.ts:553-572` | `fbLthdFormula`를 구조분해해 `applyLthd982AndPushSteps`에 전달 |
| `lib/tax-engine/transfer-tax-lthd-982-step.ts:41·91·104·140` | `fbLthdFormula`를 임대·분할 판정 가드로 쓰고 steps 인자에 통과 |
| `lib/tax-engine/transfer-tax-lthd-steps.ts:65·137·146·186-188·224` | `fbLthdFormula`가 있으면 formulaRateText = `${fbLthdFormula} (소득세법 §95④ 후단)`(`:187`), 임대 특례·split 문구 비활성(`:146`·`:224`). `:235-247` 본 step: `formula = [«970,000,000 × 22%», formulaRateText, 보유기간 문구].join(" \| ")`, `amount = longTermHoldingDeduction` |
| `lib/tax-engine/transfer-tax-lthd-steps.ts:292-330` | 표2 sub-step(보유 기간분/거주 기간분) — FB 결과도 이 분기를 탄다(U-2) |

### 2.2 결과 화면 (단건) — FB 자산은 **단건만** 도달한다

다건·합산은 `MULTI_FAMILY_BUSINESS_UNSUPPORTED_MESSAGE`로 차단(`lib/calc/multi-transfer-support-messages.ts:33` · ⑧ `lib/calc/multi-transfer-tax-validate.ts:176` · ⑫ `lib/api/transfer-tax-schema-multi-refines.ts:82`). 겸용주택도 차단(`lib/calc/transfer-fb-gate.ts` `sendsFamilyBusinessInheritance` · `app/api/calc/transfer/mixed-use-part-cards.ts:250-254`). ⇒ **다건/합산 결과뷰(`MultiTransferPropertyBreakdown`·`BundledAllocation*`)에는 FB 자산이 오지 않는다 — 변경 없음**(`ValuationDetailCards.tsx:160`이 같은 카드를 마운트하지만 도달 불가. 함께 양도(bundled) 경로 도달 여부는 «확인 필요» — grep상 `app/api/calc/transfer`에서 FB는 `engine-input.ts:507`과 `mixed-use-part-cards.ts:254`뿐).

| # | 화면 | 위치 | 장특 표시 방식 | 수정 후 |
|---|---|---|---|---|
| 1 | **명세서 «장기보유특별공제»** | `DetailedStatementLthdItems.ts:75-92`(`lthStep?.formula` 우선) → `DetailedCalculationStatementCard.tsx:345-349` `ItemRow` | step.formula 그대로 (`FormulaText`) | 엔진 문구 교체만으로 자동 반영(§3.2) |
| 2 | 명세서 보유기간 행 | `DetailedStatementDateItems.ts:100-105` | 상속개시일 기산만(U-4) | 보조 formula 한 줄 추가(UQ-6) |
| 3 | **«전체 엔진 계산 과정»** | `DetailedCalculationStatementCard.tsx:178`·`:191-250` `EngineStepsSubToggle` | step.label/formula/amount 그대로 | 자동 반영. 인쇄 시 항상 펼침(`:211`·`:216`) |
| 4 | **가업상속 비교 카드** | `SingleDetailCards.tsx:65-66` → `FamilyBusinessImputedComparisonCard.tsx`(`appliedRate`·취득가액 행만, 장특 없음) | **장특 없음** | **부분표 신설**(§3.1) |
| 5 | 신고서(별지 서식) | `FilingFormTableHelpers.ts:498` `setNum("ltDeduction", total, result.longTermHoldingDeduction)` · `:560-563` 양도소득금액 = `taxableGain − 장특` · `:536-557` 보유분/거주분 = `resolveLthdSplit(result.steps)` | 총액만. 표1이면 보유분 = 총액·거주분 0 | **변경 없음**(값만 새 총액). 표2는 sub-step 정정(U-2)에 의존 |
| 6 | 신고서 보유기간 칸 | `FilingFormTableHelpers.ts:188` | 상속개시일 기산 | 공식 서식 열이라 **유지**(UQ-6) |
| 7 | 상세 카드 묶음 게이트 | `SingleDetailCards.tsx:41`(`hasSingleDetailCards`) · `TransferTaxResultView.tsx:184`·`:644` `PrintSection id="detail-cards"` | `!!result.familyBusinessDetail`로 이미 열림 | 변경 없음 — 부분표는 같은 카드 안이라 인쇄 선택 «detail-cards»에 자동 포함 |

### 2.3 PDF (react-pdf)

| # | 위치 | 내용 | 수정 후 |
|---|---|---|---|
| 8 | `lib/pdf/ResultPdfDocument.tsx:424-427`·`:479-492` | `계산 단계` 섹션이 `r.steps`의 label/formula/amount를 그대로 인쇄 | 엔진 문구 교체로 자동 반영 |
| 9 | `lib/pdf/ResultPdfTransferSections.tsx:82`(`showLthRate`)·`:168` | «장기보유특별공제 (`fmtRate(r.longTermHoldingRate)`)» | FB 부분 echo가 있으면 율 라벨 생략(UQ-1 추천안) |
| 10 | FB 카드 | `lib/pdf`에 `familyBusiness`·`가업상속` grep **0건**(상속 별지 PDF 제외) — **PDF에는 FB 비교 카드가 원래 없다** | 부분표를 PDF에 신설할지는 UQ-4 |

### 2.4 읽지 않는 곳(확인 완료)

- 사이드바 `lib/stores/transfer-per-asset-summary*.ts`·`calc-wizard-store.ts` — `longTermHolding|장기보유|taxableGain|transferGain` grep **0건** ⇒ ⑥ 변경 없음.
- `longTermHoldingRate`를 소비하는 그 밖의 화면(`BurdenedTransferTaxResultCard:216·396` · `ParcelDisclosure:51` · `Carryover*FilingCard`)은 부담부증여·다필지·이월과세 경로 — FB(상속) 자산 도달 여부 «확인 필요»(다필지 × FB는 단건에서 막혀 있는지 미확인 · `ParcelDisclosure.tsx:51`은 `toFixed(0)`).
- 이력(IndexedDB) 저장본은 **저장 당시 값**을 그대로 연다(재계산 없음) — 구 이력은 echo가 없으므로 부분표가 안 뜨고 구 step 문구(22%)가 보인다(§3.5).

---

## 3. 수정 후 표시안

### 3.1 가업상속 비교 카드 — «부분별 장기보유특별공제» 표 (신규)

**위치**: `FamilyBusinessImputedComparisonCard`(emerald 카드) 안, 의제 취득가액 행들 다음. 마운트 지점은 한 곳(`SingleDetailCards.tsx:65`·`ValuationDetailCards.tsx:160` 둘 다 이 카드를 부르므로 카드 안에 넣으면 두 곳이 같이 따른다). 새 컴포넌트는 **별도 파일** `components/calc/results/transfer/FamilyBusinessLthdPortionTable.tsx`(새 파일 — #3672와 충돌 면 최소 · 카드 파일은 `<FamilyBusinessLthdPortionTable detail={detail} />` 한 줄만 더한다).

**노출 조건**: `detail.lthdPortions`(가정 — 엔진 echo) 존재 시만. 없으면(구 이력·r 미적용) 렌더 안 함.

**표 구성** (2열 + 합계 행, 행 = 계산 순서 = 양도가액 → 취득가액 → 필요경비 → 양도차익 → 보유기간 → 공제율 → 공제액):

```
장기보유특별공제 — 가업상속공제 적용분·비적용분 (소득세법 §95④ 후단)
                     가업상속공제       가업상속공제
                     적용분  70%        비적용분  30%
양도가액               1,260,000,000      540,000,000
취득가액                350,000,000       450,000,000
  (피상속인 취득가액 × 적용률 │ 상속개시일 평가액 × (1 − 적용률))
필요경비                 21,000,000         9,000,000
양도차익                889,000,000        81,000,000
보유기간 기산일      피상속인 취득일      상속개시일
                     2012.3.8.            2022.4.10.
보유기간                      14년               4년
장기보유특별공제율             28%                8%
장기보유특별공제        248,920,000         6,480,000
────────────────────────────────────────────────────
장기보유특별공제 합계 255,400,000   (표2는 거주분 행 추가 — §3.3)
```

**규칙**

1. **한국어 풀어쓰기** — 약어(`P_F`)·`floor()`·«중간 산술 결과» 금지. 취득가액 행의 보조 줄은 산식의 **변수명 라벨**만 쓴다(숫자는 위 칸에 이미 있다).
2. **열 머리글에 안분 비율**을 적는다: `formatFractionPercent(분자, 분모)`(#3672가 도입, `lib/calc/format-fraction-percent.ts`)로 70% · 30%. 분수는 `resolveFamilyBusinessRateFraction(detail.appliedRate, detail.appliedRateBasis)`(#3672) — 입력칸·비교 카드와 **같은 분수**여야 «66.6666 vs 66.6667» 불일치가 안 생긴다. 비적용분 비율 = `denominator − numerator`.
3. **금액 칸 정렬**(skill `amount-column-align`): 모든 금액·% 셀 `text-right font-mono tabular-nums whitespace-nowrap`, **표 전체 단일 글자 크기**(`text-xs`) 상속(금액 칸만 크기 변경 금지), `toLocaleString("ko-KR")`/`formatKRW`, 「원」 미표기, 0은 `"0"`, 구조적 미해당은 `"—"`. 합계 행도 같은 크기·같은 클래스(구성요소와 합계가 다른 크기면 자릿수가 어긋난다 — `FamilyBusinessImputedComparisonCard.tsx:51-56` 주석 선례).
4. **0%·0원 열**: r=1이면 비적용분 열, r=0이면 적용분 열 전체 `"—"` + 머리글 회색(`text-muted-foreground`) — 숨기지 않는다(두 열이 항상 있어야 합계 검증이 된다). 공제율 0%(보유 3년 미만)는 `"0%"`, 공제액 `"0"`.
5. **합계 일치 표시**: 합계 행 «장기보유특별공제 합계»는 엔진 `longTermHoldingDeduction`과 같은 값이어야 한다 — UI에서 열을 더하지 않고 echo의 `totalDeduction`(가정)을 읽는다. 열 합 ≠ 합계면 anchor가 잡는다(§7).
6. **보유기간 칸**: 「N년」만(월 미표기 — 엔진 현 문구 «14년»과 동일 단위). 기산일은 `YYYY.M.D.` 한국식(`fmtDate` 재사용 «확인 필요»).
7. **각주 1줄** (`text-caption text-muted-foreground`): «양도가액·필요경비는 가업상속공제적용률로 나누어 부분별 양도차익을 구합니다.» — 법령 근거 표현은 엔진 계획서의 확정 해석을 따른다(V-1).
8. **톤**: 카드 안의 표이므로 기존 산식 표와 같은 `rounded-md border border-border bg-background` 컨테이너. 안내 카드가 아니므로 `ToneCard` 불필요(새 안내문이 생기면 emerald `ToneCard`). 라벨 크기는 정본 클래스(`text-xs`·`text-caption`) — 임의 px 금지.
9. **인쇄**: 표 컨테이너에 `print:break-inside-avoid`, 펼침/접힘 없음(항상 노출 — `print-only-css-toggle` 불필요). 카드 루트에 이미 `print:block`.
10. **접근성/E2E 앵커**: `data-testid="fb-lthd-portion-table"` · 셀 `fb-lthd-{applied|rest}-{transferPrice|acquisitionPrice|expenses|gain|holdingYears|rate|deduction}` · 합계 `fb-lthd-total`.

**375px**: 계산상(확인 필요 — Do에서 실측) 카드 안쪽 폭 ≈ 305px, 라벨 열 ≈ 95px, 금액 열 ≈ 105px × 2. 최장 값 `1,260,000,000`(13자) × `text-xs` mono ≈ 94px로 들어간다 — **`text-sm`이면 ≈ 109px로 넘친다**(그래서 표 전체 `text-xs`). 라벨 열은 `break-words` 2줄 허용. 실측에서 가로 스크롤이 생기면 `HorizontalScrollContainer`(`components/calc/shared`)로 감싼다(대체안 — 모바일 한정 부분별 세로 스택은 쓰지 않는다: 표 둘 유지보수 금지). 3열(합계 열)은 이 폭에 안 맞아 채택하지 않는다(UQ-2).

### 3.2 엔진 step 문구 (명세서 · 계산 단계 · PDF 계산 단계 공통 원천)

엔진 소관이지만 화면이 그대로 인쇄하므로 **UI가 요구하는 문구**를 못 박는다(엔진 계획서와 맞출 것):

```
가업상속공제 적용분 양도차익 889,000,000 × 28% (피상속인 취득일부터 14년) + 비적용분 양도차익 81,000,000 × 8% (상속개시일부터 4년) = 255,400,000 (소득세법 §95④ 후단)
```

- 앞의 «970,000,000 × 22%»와 뒤의 «| 보유기간 4년 6개월»은 **FB 경로에서 뺀다**(U-1). 한 줄에 하나의 기간만 남는다.
- `renderFormula`(`FormulaParts.tsx:49-70`)는 `숫자 / 숫자`·`÷`를 분수로 바꾼다 — 문구에 `/`·`÷`를 쓰지 않는다(위 문구는 안전).
- **기존 anchor 호환**: `fb-lthd-95-4-latter.anchor.test.ts` C-6은 formula에 `"피상속인 취득일부터"`·`"거주분"`·`"§95④ 후단"`을 요구한다 — 새 문구도 세 부분 문자열을 유지해야 한다(표2는 «+ 거주분 양도차익 696,000,000 × 20%» 항 추가).
- 공제율은 엔진이 정수 %로 낸다면 `28%`(소수면 현행 `pct()`처럼 소수 첫째 자리 — `transfer-tax-lthd.ts:655`).

### 3.3 표2(1세대1주택)·고가주택 변형

- 거주분 행 추가: «거주기간 공제율 (전체 양도차익 기준)» — 부분별이 아니라 **한 칸**(두 열 병합, `colSpan=2`). 거주분은 상속개시일 이후 상속인 실거주 기준이라 적용분/비적용분으로 나누지 않는다(선행 계획 Q3·사전-2025-법규재산-0506).
- 고가주택(12억 초과)은 과세대상 양도차익이 `양도차익 × (양도가액 − 12억) ÷ 양도가액`이라 부분별로도 안분해야 한다(C-6 픽스처 실측: `taxableGain 696,000,000 = 1,740,000,000 × 40%`). 엔진이 부분별 안분 echo를 주면 «12억 초과 안분 후 과세대상 양도차익» 행을 **양도차익 행 아래** 추가하고, 안 주면 표2 고가주택은 부분표를 안 띄우고 문구(§3.2)만 쓴다 — **엔진 계획서 결정에 종속(UQ-5)**.
- 표2 sub-step(보유 기간분/거주 기간분) 정정은 엔진 소관이지만 **UI 수정 기준 값**은: 보유분 = Σ(부분 과세양도차익 × 부분 보유율), 거주분 = 전체 과세양도차익 × 거주율, 합 = 본 step. 신고서는 `resolveLthdSplit`이 이미 sub-step을 정본으로 읽으므로(`lthd-split-display.ts:64-77`) **UI 코드 변경 없음**.

### 3.4 명세서·PDF 보조 정리

| 항목 | 변경 |
|---|---|
| 명세서 «장기보유특별공제» formula | §3.2 문구 자동 반영. `perAsset` 펼침(자산별 disclosure)을 «부분별»로 재활용할지는 UQ-3 — 기본안은 **재활용 안 함**(카드 표가 정본, 명세서는 한 줄) |
| 명세서 «보유기간» 행 | FB echo 있으면 보조 formula 1줄: «가업상속공제 적용분은 피상속인 취득일 2012.3.8.부터 14년 · 비적용분은 상속개시일부터 4년 (장기보유특별공제 보유기간 · 소득세법 §95④ 후단)». 값(`value`)은 현행 유지 — 신고서 칸 의미(취득일~양도일)를 건드리지 않는다 (UQ-6) |
| PDF 장특 라벨 | `ResultPdfTransferSections.tsx:168` — FB 부분 echo가 있으면 «(%)» 생략(UQ-1) |
| PDF FB 섹션 | 신설 안 함 추천(UQ-4) — 계산 단계 formula가 부분별 양도차익·율·공제액을 모두 담는다 |

### 3.5 구 이력·하위호환

- 결과는 sessionStorage persist 제외(`partialize`)이고 이력은 저장 당시 JSON을 그대로 연다 → **마이그레이션 불필요**. echo 없는 구 결과는 부분표 미렌더 + 구 step 문구(22%) — 새 PR 머지 전 저장본은 구 값이 보이는 것이 정상(재계산 안 함). 이 차이를 숨기려고 UI가 값을 만들지 않는다.
- `FamilyBusinessCgtDetail`에 **optional** 필드를 더하는 것이라 기존 테스트 픽스처(`fb-imputed-capex-display.anchor.test.tsx` 등 `detail()` 객체)는 그대로 컴파일된다.

---

## 4. 입력 변경 필요 여부 — **없음**

| 지점 | 판정 | 근거 |
|---|---|---|
| ① 폼 타입 | **변경 없음** | 필요 입력이 이미 `AssetForm`에 있다: 피상속인 취득일 `decedentAcquisitionDate`(`calc-wizard-asset.ts:508`) · `familyBusinessInheritance`{피상속인 취득가액·상속개시일 평가액·적용률·상속개시일·피상속인 자본적지출}(`:665-679`) · 양도가액·필요경비(자산 칸) |
| ② initial | 변경 없음 | — |
| ③ normalize | 변경 없음 | 결과 echo는 폼 상태가 아니다 |
| ④ API 변환 | 변경 없음 | `transfer-tax-api.ts:693-699` 객체 통째 전달 |
| ⑤ 입력 위젯 | 변경 없음 | `FamilyBusinessInheritanceTransferSection` 무변경(#3672만 만진다) |
| ⑥ 사이드바 | 변경 없음 | §2.4 grep 0건 |
| ⑦ 결과 카드 | **변경** | §3.1~3.4 |
| ⑧ validate | 변경 없음 | 엔진이 새 입력을 요구하지 않는 한. 엔진이 «피상속인 취득일» 필수화를 바꾸면(현재 `transfer-tax-validate-asset.ts:513`이 상속이면 필수) ⑧도 따라야 한다 — 엔진 계획서 확인 필요 |
| ⑨~⑭ | 변경 없음 | 입력 불변. 결과 echo는 route가 `TransferTaxResult` JSON으로 그대로 돌려준다. **날짜 echo는 문자열(`YYYY-MM-DD`)로** — Date 직렬화 함정(`lib/api/date-coerce.ts` 규칙) 회피 |

⚠️ **엔진이 부분별 취득가액을 만들려면 `acquisitionOverride` 하나(의제 취득가액 합)가 아니라 1호·2호 항(term1·term2)을 재귀 안으로 실어야 한다**(현재 `transfer-tax-family-business.ts:302-322`는 합 하나와 `fbLthdLatter{appliedRate, decedentAcquisitionDate}`만 전달). 이것은 입력이 아니라 엔진 내부 필드 — 엔진 계획서 소관.

---

## 5. 엔진 echo 요구 (UI가 읽을 계약 · 이름은 가정)

`FamilyBusinessCgtDetail`(`transfer-tax-family-business.ts:93`)에 optional로 중첩하는 것을 권고한다(**엔진 계획서와 맞출 것**). 이유: ① `transfer-tax-aggregate-pickers.ts:50`이 `familyBusinessDetail` 객체를 통째 복사해 최상위 필드보다 누락 위험이 낮다 ② 카드가 이미 `detail`만 받는다.

```ts
lthdPortions?: {                       // (가정) 엔진 계획서와 맞출 것
  applied: FbLthdPortion;              // 가업상속공제 적용분
  rest: FbLthdPortion;                 // 비적용분
  residence?: { rate: number; deduction: number; ... }; // 표2 거주분(전체 기준)
  totalDeduction: number;              // = result.longTermHoldingDeduction
}
interface FbLthdPortion {
  shareNumerator: number; shareDenominator: number; // 안분 비율 (표시는 formatFractionPercent)
  transferPrice: number; acquisitionPrice: number; expenses: number; gain: number;
  holdingStartDate: string;            // 'YYYY-MM-DD' (피상속인 취득일 | 상속개시일)
  holdingYears: number;
  ratePct: number;                     // 정수 % (소수면 number 그대로 — 엔진 결정)
  deduction: number;
}
```

UI 불변식(anchor가 강제): `applied.gain + rest.gain = result.transferGain`(과세대상 안분 전) · `applied.deduction + rest.deduction (+ residence.deduction) = totalDeduction = result.longTermHoldingDeduction`.

`result.longTermHoldingRate`(현 가중 0.22)가 무엇을 담을지는 엔진 소관이다. **UI는 FB 부분 echo가 있을 때 이 값을 읽지 않는다**(UQ-1 추천).

---

## 6. UQ — 사용자 결정 필요

| ID | 질문 | 안 (추천 ★) | 근거 |
|---|---|---|---|
| **UQ-1** | 실효(가중) 공제율(22%·26.33%)을 계속 보여줄까 | ★**A 숨기고 부분별 공제율만**(28%·8%). 표·PDF 라벨에서 %를 뺀다 / B 보조 표기(«참고: 공제액 ÷ 과세대상 양도차익 = 26.33%») / C 현행 가중 22% 유지 | 법에 가중률이 없다. 가중률 × 전체 양도차익으로는 새 공제액이 재현되지 않는다(970M × 26.3% = 255,110,000 ≠ 255,400,000 — 반올림 1자리일 때). 프로젝트 선례: 합산 자산에서 «율 하나로 쓰지 않는다»(`DetailedStatementLthdItems.ts:80-86`). C는 틀린 값(22%)을 정답처럼 보인다 |
| **UQ-2** | 표 모양 | ★**A 2열(적용분/비적용분) + 합계 행** / B 3열(합계 열 포함) / C 산식 문장만 | 375px에서 3열(13자 금액 × 3)은 안 들어간다(§3.1 계산). C는 부분별 양도가액·취득가액·필요경비가 안 보여 사용자 검증이 안 된다 — 이번 요구의 핵심 |
| **UQ-3** | 표의 위치 | ★**A 가업상속 비교 카드 안**(의제 취득가액 행 뒤 · 새 파일 컴포넌트) / B 별도 카드(`SingleDetailCards`에서 형제 마운트) / C A + 명세서 장특 항목 `perAsset` 펼침 병행 | A는 마운트 지점 1곳(두 호출부 자동). B는 `ValuationDetailCards`에도 따로 심어야 함. C는 `perAsset`의 aria-label이 «자산별»이라 어휘가 어긋난다. 부수: 카드 안 순서가 «의제 취득가액 → 비교과세(세액) → (표)»가 되려면 #3672 머지 뒤 `<table>`을 둘로 나눠 표를 세액 비교 앞에 끼우는 것이 계산 순서에 맞다(양도차익·장특 → 세액) — 추천 순서 |
| **UQ-4** | PDF(react-pdf)에 부분표 추가 | ★**A 추가 안 함** — 계산 단계 formula + 라벨 정리 / B PDF에 FB 섹션 신설 | PDF에는 FB 비교 카드가 원래 없다(grep 0건). 계산 단계 formula가 부분별 양도차익·율·공제액을 모두 담는다. 브라우저 인쇄(`print:block`)는 카드 표가 그대로 나간다 |
| **UQ-5** | 표2·고가주택 FB, 그리고 현행 sub-step 오표시(U-2) | ★**A 이번 수정에 포함** — 엔진이 부분별 과세 안분·sub-step을 정정하면 UI는 거주분 행 + 안분 행만 추가 / B 이번에는 표1만 표(표2·고가주택은 문구만) 하고 U-2는 별 건 | U-2는 신고서 보유분/거주분 칸 오표시(세액 불변)라 같은 엔진 블록(`transfer-tax-lthd.ts:630-665`)을 다시 여는 이번 PR에서 같이 닫는 편이 재진입 비용이 적다. 엔진 계획서의 범위 결정에 종속 |
| **UQ-6** | 보유기간 표시(명세서 행·신고서 칸) | ★**A 신고서 칸은 유지, 명세서 «보유기간» 행에 보조 formula 1줄만** / B 둘 다 그대로(보조 안 함) / C 명세서 `value`도 «적용분 14년 / 비적용분 4년»(이월과세 파트 방식) | 신고서는 공식 서식 열이라 의미(취득일~양도일)를 유지. C는 `value`가 문자열이 되어 신고서와 다른 값이 보이는 부작용(이월과세 파트는 선례가 있으나 그쪽은 파트별 취득일이 서식에 열로 존재) |

---

## 7. 케이스 매트릭스 · anchor · E2E

### 7.1 케이스 (화면 기준)

| # | 케이스 | 기대 화면 |
|---|---|---|
| P-1 | 교재 사례(§1) | 표 §3.1 그대로 · 합계 255,400,000 · 장특 step 문구 §3.2 |
| P-2 | r=1 | 비적용분 열 전부 `—`, 합계 = 적용분 |
| P-3 | r=0 | 적용분 열 전부 `—`(공제율 개념 없음), 회귀 감지선 — 기존 C-1 값 불변 |
| P-4 | 한쪽 보유 3년 미만 | 해당 열 공제율 `0%`·공제액 `0`, 다른 열만 공제 |
| P-5 | 양도차손/양도차익 ≤ 0 | 공제 0 — 표 노출 여부는 엔진 echo 유무에 따름(확인 필요: 엔진이 차손에서 echo를 생략하면 표 없음 + 기존 «0» 문구) |
| P-6 | 표2 1세대1주택(고가주택) | 거주분 행(`colSpan=2`) + (UQ-5=A) 12억 초과 안분 행 |
| P-7 | 구 이력(echo 없음) | 표 미렌더, 기존 step 문구 — 회귀 0 |
| P-8 | 주식 양도(F-1 예정, `FamilyBusinessImputedComparisonCard` 재사용) | 주식은 §94①3호라 장특 없음 → `lthdPortions` 없음 → 표 미렌더. F-1d의 카드 라벨 prop 변경과 같은 파일이므로 rebase만 |
| P-9 | 다건/합산 | FB 차단(§2.2) — 도달 불가, 변경 없음 |

### 7.2 anchor (현재 red 확인 후 Do)

Pre-Do: 교재 사례를 `calculateTransferTax`로 실행해 **현행 red를 먼저 고정**(장특 213,400,000 ≠ 255,400,000 · taxBase 754,100,000 ≠ 712,100,000 — probe1 실측).

| ID | 파일 | 내용 |
|---|---|---|
| UA-1 | `__tests__/components/fb-lthd-portion-table.anchor.test.tsx`(.tsx — jsdom) | detail 픽스처(교재 값)를 `FamilyBusinessImputedComparisonCard`에 렌더 → 셀 testid별 값 889,000,000·81,000,000·28%·8%·248,920,000·6,480,000·255,400,000 · 금액 셀 className에 `font-mono`·`text-right`·`tabular-nums` · 텍스트에 `floor`·`×`가 아닌 약어(P_F 등)·«원» 접미 없음 |
| UA-2 | 같은 파일 | r=1 → 비적용분 `—` / echo 없는 구 detail → `fb-lthd-portion-table` 부재 + 기존 행 testid 보존 |
| UA-3 | `__tests__/tax-engine/transfer-tax/` 또는 components 통합 | **엔진→화면 합계 일치**: `calculateTransferTax`(교재 사례 + C-6 표2) → `detail.lthdPortions`를 카드에 렌더 → 열 합 = `result.longTermHoldingDeduction` = 장특 step amount · Σ양도차익 = `transferGain` |
| UA-4 | 같은 | step 문구: 「889,000,000 × 28%」·「81,000,000 × 8%」·「255,400,000」 포함, 「× 22%」·「보유기간 4년 6개월」 부재, 표2는 `피상속인 취득일부터`·`거주분`·`§95④ 후단` 유지(C-6 호환) |
| UA-5 | `__tests__/calc/` 또는 pdf 헬퍼 단위 | PDF 장특 라벨: FB echo 있으면 «(%)» 없음 / 없으면 종전 «(x%)» — 판정을 leaf 함수로 빼면 jsdom 없이 검증 가능(`ResultPdfTransferSections.tsx` 직접 렌더 테스트 존재 여부 «확인 필요») |
| UA-6 | 엔진 anchor와 공유 | 표2 sub-step 정정(U-2): 보유 기간분 + 거주 기간분 = 본 step, 신고서 `resolveLthdSplit` 값과 일치 — 기대값은 엔진 확정 후(산술 예상 250,560,000 / 139,200,000) |

### 7.3 E2E — `e2e/transfer-fb-lthd-portion.spec.ts` (신규, 단건 1건)

선례: #3672 `e2e/transfer-fb-rate-fraction.spec.ts`(`seedWizard`·`singleSeed`·`calculate`·`expandAssetSection`·`stmtValue`, `_helpers/split-acq-display.ts`). 시드는 **토지**(`landStandalone` 변형 — 상속 취득 칸(`inheritanceStartDate`·`decedentAcquisitionDate`) 구성은 `e2e/bg-163-9-proviso-land-house.spec.ts:18` 참조 «확인 필요: Do 단계 probe로 확정»).

1. 시드: 토지 상속 · 상속개시 2022-04-10 · 피상속인 취득일 2012-03-08 · 양도일 2026-10-15 · 양도가액 1,800,000,000 · 양도비 30,000,000 · FB {피상속인 취득가액 500,000,000 · 상속개시일 평가액 1,500,000,000 · 적용률 70%(#3672 머지 후 `fbRateBasis` 700,000,000 ÷ 1,000,000,000 — 정확 분수)}.
2. 계산 → **Network body**: `familyBusinessInheritance`·`decedentAcquisitionDate` 불변(입력 무변경 확인) / 응답 `familyBusinessDetail`에 부분 echo.
3. 화면: `fb-lthd-portion-table` 셀 값(§1 표) · 명세서 `stmtValue(page, "장기보유특별공제") = 255,400,000` · **과세표준 712,100,000**(명세서/신고서 행 라벨은 probe로 확정 «확인 필요»).
4. **375px**: `page.setViewportSize({ width: 375, height: 812 })` → `document.documentElement.scrollWidth <= 375` · 표 셀 `toBeVisible` · 13자 금액이 셀 박스 안(`boundingBox` 폭 ≤ 열 폭).
5. **인쇄**: «전체 선택» 먼저 후 `emulateMedia({ media: "print" })` → 표 가시(`e2e` 인쇄 규약 `feedback_print_media_needs_section_selection`).
6. 워크트리 실행은 `E2E_PORT` 지정 + `.env.local` 부재 폴백(`e2e/CLAUDE.md`). **수동 브라우저 확인은 별도**(headless Playwright는 사람 확인이 아님을 보고에 명시).

### 7.4 회귀

`npx vitest run __tests__/tax-engine/transfer-tax/ __tests__/calc/ __tests__/components/fb-*` — 특히 C-1·C-7·M-2(회귀 감지선), `fb-imputed-capex-display`·`fb-18-2-10-credit-label` 카드 렌더 테스트 전건 통과. 신규 테스트가 같은 카드 testid를 쓰지 않도록 기존 `fb-rate-basis-row`(#3672)와 접두사를 분리한다(`fb-lthd-*`).

---

## 8. 파일 크기(800줄) · 정책 점검

- `FamilyBusinessImputedComparisonCard.tsx` 212줄(#3672 후 ≈ 245) + 한 줄 → 무영향. 부분표는 새 파일(≈ 130줄 예상).
- `transfer-tax-lthd.ts` 697줄(엔진 PR이 +40~60 예상 → 700 착지 목표 직상 — 엔진 계획서가 분리 여부 판단), `transfer-tax-lthd-steps.ts` 351줄.
- 정책 3종: **useEffect 미러링 없음**(표시 전용·props 파생) · **자동 안분 fallback 없음**(안분은 엔진이 입력값으로 하는 법정 계산이지 빈 입력 보정이 아니다 — UI는 echo가 없으면 표를 안 띄울 뿐 값을 만들지 않는다) · **⑧ 동기화 영향 없음**(입력·fallback 추가 0).

---

## 9. #3672 조율 (읽기 대조 완료: `git diff master...origin/fix/fb-rate-fraction`, head `5f6ce1520`, 상태 OPEN · MERGEABLE · 20파일 +984/−64)

### 9.1 겹침 지도

| 파일 | #3672 변경 | 이 계획의 변경 | 충돌 |
|---|---|---|---|
| `components/calc/results/transfer/FamilyBusinessImputedComparisonCard.tsx` | import 3종 추가(`resolveFamilyBusinessRateFraction`·`formatFractionPercent`·`Frac`) · `appliedRateBasis` destructure · 헤더 문구·행 라벨의 `toFixed(2)%` → 분수 표기 · `fb-rate-basis-row` 신규 | 부분표 마운트 한 줄(+ UQ-3 추천안이면 `<table>` 분할) · 같은 분수 유틸 **재사용** | **같은 파일** — 머지 순서로 해소(#3672 먼저). 분할을 하면 #3672가 만진 행들을 옮기게 되므로 반드시 머지 뒤 rebase |
| `lib/tax-engine/transfer-tax-lthd.ts` | `:643` `applyRateFraction(positiveGain, Math.round(fbl.appliedRate * 1_000_000), 1_000_000)` → `fbl.appliedRateFraction ?? resolveFamilyBusinessRateFraction(fbl.appliedRate)` | 엔진 계획서가 같은 L-5 블록(`:630-665`)을 **재작성**(부분별 양도차익) | **엔진 PR의 핵심 충돌** — #3672의 `fbFrac`(분수)가 새 부분별 안분(양도가액·필요경비 × r)에도 그대로 쓰여야 한다(소수 6자리 반올림이 다시 들어오면 F-3 회귀). 엔진 계획서에 전달 |
| `lib/tax-engine/types/transfer.types.ts` | `fbLthdLatter.appliedRateFraction?` 추가 | 엔진이 `fbLthdLatter`에 term1·term2(1호·2호 취득가액 항) 추가 예상 | 같은 객체 — 순서로 해소 |
| `lib/tax-engine/transfer-tax-family-business.ts` | 분수 연산·`appliedRateBasis` echo | 엔진이 detail에 `lthdPortions` 부착 | #3672 먼저 |
| `FamilyBusinessInheritanceTransferSection.tsx`·`FamilyBusinessInheritanceHistoryModal.tsx`·lookup·schema·store·validate | 적용률 입력 방식(금액/%)·이력 prefill·⑫⑧③① | **건드리지 않음** | 없음 |
| `docs/02-design/features/fb-97-2-4-fixes.plan.md` | 문서 10줄 | 이 문서는 별 파일 | 없음(링크만) |

### 9.2 순서

| 순서 | PR | 내용 | 이유 |
|---|---|---|---|
| 0 | **#3672 머지**(CI 전건 SUCCESS + `headRefOid` 일치 확인 후, `--auto` 금지) | 분수 적용률·입력 방식·카드 분수 표기 | 이 계획의 엔진 블록과 카드 파일이 그 위에 있다 |
| 1 | 엔진 PR (`engine.plan.md`) | 부분별 양도차익·`lthdPortions` echo·step 문구·sub-step 정정 · anchor | UI가 읽을 echo 선행 |
| 2 | UI PR (이 문서) | 부분표·PDF 라벨·명세서 보유기간 보조 줄 · UA-*·E2E | 엔진 echo 확정 뒤 |
| — | F-2(PR-2a/b)·F-1(PR-1d) | 이 계획과 파일 겹침: F-1d가 같은 카드에 라벨 prop·1주당 행 추가 | 어느 쪽이 먼저든 한 줄 마운트라 rebase로 충분 |

- 엔진 PR과 UI PR을 **한 PR로 합칠지**는 엔진 계획서와 사용자 결정(워크플로 «Do는 시퀀셜»은 PR 분리를 뜻하지 않음). 합치면 echo 이름 불일치 위험이 사라진다 — 규모(엔진 ≈ 250 + UI ≈ 250 + 테스트)가 한 PR로 감당 가능하면 합치는 편을 권한다.
- #3672의 «적용률 행 문안»(가업상속공제적용률 = 공제금액 ÷ 재산가액)과 이 계획의 열 머리글(70% · 30%)은 **같은 분수 소스**(`resolveFamilyBusinessRateFraction`)를 써야 한다 — 두 곳이 다른 절사를 하면 같은 카드 안에서 66.6666과 66.6667이 공존한다.

---

## 10. 동기화 체크 (Do 완료 시 점검표)

- [ ] 엔진 echo 이름 ↔ `FamilyBusinessCgtDetail` 타입 ↔ 카드 컴포넌트 props 일치(엔진 계획서와 맞춤)
- [ ] ⑦ 결과: 카드 표 · step 문구 · 명세서 보유기간 보조 줄 · PDF 라벨
- [ ] ①~⑥·⑧~⑭ «변경 없음» 재확인(Network body 입력 불변)
- [ ] `npx tsc --noEmit` 0 · `npx vitest run __tests__/tax-engine/transfer-tax/ __tests__/calc/ __tests__/components/` 통과
- [ ] 브라우저 확인(375px · 인쇄) — 미수행 시 «수동 확인 미수행» 명시
- [ ] `ui-engine-sync-checker`(14지점) + `bkit:gap-detector`

---

## 11. 미검증 (V — 확인 필요)

| ID | 항목 |
|---|---|
| V-1 | **양도가액·필요경비를 적용률로 안분하는 법적 근거 표현** — 교재 정답이 그렇게 계산하나 조문 문언(§95④ 후단 «비율에 해당하는 자산»)과의 대응 문구는 엔진 계획서가 확정. 각주(§3.1-7) 문구가 그에 종속 |
| V-2 | echo 이름·위치·정수 %/소수 공제율 — 엔진 계획서 |
| V-3 | 375px 실측(13자 × 2열 `text-xs`) — 계산 추정일 뿐 |
| V-4 | 표2 sub-step 정답값 250,560,000 / 139,200,000 — 산술 도출(696M × 36% · × 20%), 엔진 확정 필요 |
| V-5 | 양도차손·양도차익 ≤ 0일 때 엔진 echo 유무(P-5) |
| V-6 | 함께 양도(bundled)·다필지 단건 × FB 도달 여부(§2.2·§2.4) |
| V-7 | 교재 사례의 **산출세액·결정세액**은 이 문서에서 단정하지 않는다 — Do 단계 anchor가 실측(mock 세율 현행: 과세표준 754,100,000 → 산출 280,782,000). 과세표준 712,100,000만 사용자 제시값과 산술 일치 |
| V-8 | 교재 사례 E2E 시드의 상속 취득 칸 구성(토지) — Do 단계 probe |
| V-9 | PDF 장특 라벨(`ResultPdfTransferSections.tsx:168`)을 직접 렌더하는 기존 테스트 존재 여부 |
| V-10 | `fmtDate`의 한국식 날짜 포맷이 `YYYY.M.D.`인지(표 기산일 칸) |

---

## 사용자 결정 (2026-11-26 확정 — 이 표가 최종)

| 항목 | 결정 |
|---|---|
| 전제 | 교재(이월과세5) 정답 장특 255,400,000 · 과세표준 712,100,000으로 **앱 결함 확인**(사용자). #3672 머지(ebc8afccc) 위에서 구현 — `fbFrac` 분수 재사용, 6자리 반올림 재도입 금지 |
| Q-1 필요경비(양도비·자본적지출) | **(1) 적용률 r로 안분** |
| Q-2 한 부분 차손 | **(a) 차손 부분 공제 0 + 양수 부분 전액 공제** — ⚠️ 추천안 (b)와 다름. S4 시료 공제 210,000,000(양도차익의 38.2%, 표1 상한 30% 초과)을 사용자가 알고 선택. 해석례 미확보 상태의 결정 → 결과에 «확인 필요» 고지 |
| Q-3 감가상각비(§97③) | **(1) 취득가액 두 항 비율로 안분** |
| Q-4 일반 §97 재귀 | **(a) 현행 비례 안분 유지(비트 동일)** |
| UQ-1~UQ-6 | **전부 ★A 추천안** — 실효율 숨김·부분별 공제율만 / 2열+합계 행 / 비교 카드 안 신규 컴포넌트 / PDF는 계산 단계 문구만 / 표2 sub-step(U-2) 동행 정정 / 명세서 보유기간 보조 1줄 |

## Do 결과 정정 (2026-11-26 — 엔진 echo 확정 후 구현하며 계획서 §3·§5와 달라진 곳)

| 계획서 | 구현 |
|---|---|
| echo = `familyBusinessDetail.lthdPortions`(가정) | 엔진은 **`result.fbLthdDetail`**(최상위)에 실었다. 비교 카드에 선택 prop `fbLthdDetail`·`longTermHoldingDeduction`을 더해 `SingleDetailCards`가 넘긴다(옛 이력은 prop이 없어 표 미렌더). |
| 양도가액·필요경비 별도 행 | echo가 부분별 양도가액·필요경비를 따로 싣지 않는다(`netTransferShare` = (양도가액 − 필요경비) 몫) → **한 행** «양도가액 − 필요경비». 둘을 UI에서 다시 나누면 몫 절사가 어긋나므로 만들지 않는다. 감가상각비(§97③)가 있으면 «양도차익 = 몫 − (취득가액 항 − 감가상각비)» 항등식으로 그 차이만 행으로 보인다. |
| 보유기간 기산일(YYYY.M.D.) | echo에 날짜가 없다 → «피상속인 취득일부터 / 상속개시일부터» 문구 + 연수. |
| 합계 열 없음 · 합계 행 | 합계 = 양도차익 합계(G, 열 합) · (표2 거주기간 공제분) · 장기보유특별공제 합계(= `result.longTermHoldingDeduction` 그대로). 차손 부분이 있으면 양수 부분 `taxableGain`이 T보다 클 수 있어 «공제 기준액» 행은 12억 초과 안분 등으로 `taxableGain ≠ max(gain,0)`일 때만 그린다. |
| `basis === "proportional"` | 엔진은 슬라이스를 못 만들 때(G ≤ 0 · X < 0 · 일반 §97) `fbLthdDetail`을 싣지 않는다 → 표 없음(구 문구). `basis !== "slice_gain"`이면 컴포넌트도 그리지 않는다. |
| UQ-6 명세서 «보유기간» 보조 1줄 | 명세서 「일자·기간」 그룹은 화면에서 생략돼 있다(`DetailedStatementConfig` — 사용자 요청 2026-05-12) → 그 행은 렌더되지 않는다. **구현 안 함**(죽은 코드). 부분별 보유기간(«피상속인 취득일부터 14년 … 상속개시일부터 4년»)은 장특 행의 엔진 step 문구가 이미 싣는다. |
| UQ-1 소비처 | `SingleDetailCards`(상업용 카드 `lthdRate`) · `DetailedStatementLthdItems` 폴백 · PDF 장특 라벨(`lib/pdf/lthd-rate-label.ts`) — `fbLthdDetail`이 있으면 하나의 % 를 쓰지 않는다. |
