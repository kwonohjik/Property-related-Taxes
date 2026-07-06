# 다건 양도세 신고서 양식 — 자산별 양도일 + 기납부·차감납부세액 + 기신고 양도소득금액 계획서

- **작성일**: 2026-07-06
- **세목**: 양도소득세 다건(multi)
- **선행**: `multi-transfer-filing-form.plan.md`(#512 — 상단 합산 신고서 양식 이식) 후속 정정
- **요청 (3건)**:
  1. **자산2번 양도일 오류 수정** — 신고서 양식(합산) 표의 "양도일자" 행이 합계·자산1·자산2 모두 `2026-01-12`(자산1 양도일)로 표시됨. 자산2 실제 양도일은 `2026-03-25`.
  2. **기납부·차감납부세액 행 추가** — (a) 합계란 "총결정세액" 바로 아래에 기납부세액·차감납부세액, (b) 지방소득세 "결정세액" 하단에 기납부세액·차감납부세액.
  3. **기신고 양도소득금액 표시** — 신고서 양식 "기신고 양도소득금액" 행이 항상 0(미구현). **예정신고 이력에서 자동 파생**(사용자 확정, 2026-07-06)해 채움.

## 규모·Phase 분리 (핵심)

| 수정 | 규모 | 성격 | Phase |
|---|---|---|---|
| ① 양도일자(+취득일·보유기간·거주기간 동반) | 작음~중간 | 배선 버그, **엔진 무변경** | **A** |
| ② 기납부·차감납부 4행 | 작음 | additive, 데이터 이미 존재(`priorPaidTax` 등) | **A** |
| ③ 기신고 양도소득금액 | **대 (14-sync 신규 입력)** | `priorPaidTax` 패턴 미러 — store·Zod·엔진 input·result echo·이력 자동채움·편집 위젯·신고서 배선 | **B** |

- **Phase A**(①②): 신고서 양식 표시 정정. 엔진 input/result 무변경(②는 기존 필드 표시). 빠르게 완결 가능.
- **Phase B**(③): `priorPaidTax`(다건 기납부 정산, memory `project_transfer_multi_prepaid_settlement_plan`)와 완전 동일한 14-sync 신규 입력 필드. 별도 규모 → A와 분리 실행.

> ①②는 #512가 드러낸 신고서 양식 결함 정정이고, ③은 신규 입력 기능이다. A를 먼저 ship하고 B를 후속으로 진행 권장(§6-4).

---

## 1. 수정 1 — 자산별 양도일 (근본: bundled 가정 불일치)

### 원인 (실측)
- `FilingFormTableAggregateHelpers.ts:32` `const transferDate = formData?.transferDate ?? ""` — **단일 formData** 값을 `:74`(합계)·`:101`(전 자산 컬럼)에 동일하게 씀.
- `findAssetByPropertyId(pid)`(`:52-70`)는 `formData.assets`에서 `assetId === pid`로 조회. **묶음매매(bundled)=1 form + N assets** 구조 전용.
- multi는 **N개 개별 filing**이고 각 property가 자기 `form`을 가진다(`propertyId = np1/np2…`). 상단 신고서는 `formData={properties[0]?.form}`(자산1) 하나만 넘기므로:
  - `transferDate` = 자산1 양도일 → 전 컬럼에 `2026-01-12`
  - `findAssetByPropertyId("np2")` → `formData.assets`에 자산2 없음 → `undefined` → **취득일자도 "-"** (스크린샷과 일치)
- ⚠️ 즉 버그는 양도일뿐 아니라 **자산별 asset·form 파생 머리정보 전반**(양도일·취득일·보유기간·거주기간)에 걸친다. 사용자는 양도일만 지목했으나 원인이 하나다.

### 수정 방향 — per-property form 주입 (엔진 무변경)
`AggregateMeta`(`FilingFormTableHelpers.ts:30`)에 **`propertyFormMap?: Map<string, TransferFormData>`**(propertyId → 해당 property의 form) **optional 추가**. (앞선 조사의 2맵 `transferDateMap`+`assetMap` 안은 폐기 — form 단일 맵이 transferDate·assets[0]·거주 정보 모두 파생, 검토 I1)
- ⚠️ **`buildAggregateRows` 시그니처 무변경 강제** (검토 A2): `propertyFormMap`은 `AggregateMeta`(2번째 인자)에 optional로만 추가. 3번째 `formData` 인자 제거·필수화 금지 — `filing-form-exempt-gain-reduction-cap.test.tsx:100`이 propertyFormMap 없이 `buildAggregateRows(…, meta)` 호출.
- `MultiTransferFilingFormSection`이 `properties`에서 `Map(p.propertyId → p.form)` 구성해 주입 (ownershipMap/landNatureMap과 동일 패턴, `"primary"` 하드코딩 없음).
- `buildAggregateRows`:
  - 컬럼별 `const colTransferDate = aggregate.propertyFormMap?.get(pid)?.transferDate ?? transferDate`
  - ⚠️ **루프 내 `transferDate` 참조 4곳 전부 `colTransferDate`로 치환** (검토 A1 — 일부만 치환 시 자산2 퇴거일·거주기간이 자산1 기준으로 잔존): `:101` setStr("transferDate")·`:103` 보유기간·`:108` 퇴거일 fallback·`:113` 거주기간 end·`:146` holdingMs.
  - `findAssetByPropertyId(pid)`(`:50-69`): `propertyFormMap` 있으면 `propertyFormMap.get(pid)?.assets[0]` 우선, 없으면 기존 로직 폴백.
  - 합계 열 양도일(`:74`): 자산 양도일이 모두 동일하면 그 값, 다르면 `"-"`. **표 내 모든 날짜/기간성 행(양도일·취득일·보유기간·거주기간)에 동일 "-" 정책** 적용.
- **bundled(propertyFormMap 미주입)은 기존 로직 그대로 → 회귀 0.** BundledAllocationCard 호출부 무변경.

### 스코프 판단
- 최소: 양도일자만 per-property. 하지만 원인이 `findAssetByPropertyId`의 bundled 가정이므로, **propertyFormMap 우선 조회로 양도일·취득일·보유기간·거주기간이 함께 정상화**된다(같은 한 줄 수정으로 파생). 별도 비용 없이 취득일 "-" 문제도 해소 → **함께 수정 권장**(§열린판단 1).

---

## 2. 수정 2 — 기납부·차감납부세액 4행 추가 (데이터 이미 존재)

### 데이터 소스 (실측 — echo 추가 불필요)
`AggregateTransferResult`에 전부 존재:
| 필드 | 의미 |
|---|---|
| `priorPaidTax`(:294) | 예정신고 기납부세액 (국세, §111③) |
| `priorPaidLocalTax`(:296) | 예정신고 기납부 지방소득세 |
| `settlementAdditionalPayable`(:298) | = max(0, 총결정−기납부) = **차감납부(국세)** |
| `settlementRefund`(:300) | = max(0, 기납부−총결정) 환급(국세) |
| `settlementLocalPayable`(:302) | = max(0, 지방결정−기납부지방) = **차감납부(지방)** |

`MultiTransferTaxSummaryCard`(`:107-176`)가 이미 이 필드들로 정산을 표시(엔진 단일진실 approach A). **신고서 양식 라벨·산식을 summary 카드와 일치**시킨다.

### 삽입 지점 (rowOrder `FilingFormTableAggregateHelpers.ts:253-286`)
```
["totalDeterminedTax", "총결정세액", { highlight, separatorAfter }],   :281  ← separatorAfter 제거
  🆕 ["priorPaidTax", "기납부세액 (예정신고, §111③)"],                  ← :281 뒤, :282 앞
  🆕 ["deductedPayable", "차감납부할세액", { highlight, separatorAfter }], ← separatorAfter 이동
["ruralSurtax", ...](:282), ["localCalculatedTax", "지방소득세 산출세액"](:283), ["localReduction", ...](:284),
["localDeterminedTax", "지방세 결정세액", { highlight }],               :285
  🆕 ["priorPaidLocalTax", "기납부세액 (지방, 예정신고)"],               ← :285 뒤 = rowOrder 최종
  🆕 ["deductedLocalPayable", "차감납부할 지방소득세", { highlight }],    ← 마지막 행(separator 불요)
```
- 국세 2행 = `totalDeterminedTax`(:281) 뒤 `ruralSurtax`(:282) 앞 (사용자 "총결정세액 바로 아래"와 일치). 지방 2행 = `localDeterminedTax`(:285) 뒤 = **rowOrder 최종**.
- `separatorAfter`를 `totalDeterminedTax`→`deductedPayable`로 이동(총결정~차감납부 한 그룹).
- **row key는 무제약 string** (`ColumnKey=string`(:88), `v: Record<string,…>`(:33)) → RowDef/enum TS 정의 **불요** (검토 A3).

### 값 (`setNum`) — **합계 열만, 자산별 컬럼은 null("-")**
기납부세액은 신고서 단위(전체) 개념이라 자산별 분리 없음.
- `priorPaidTax` total = `aggregated.priorPaidTax`
- `deductedPayable` total = `aggregated.settlementAdditionalPayable` (환급 시 0 — §열린판단 2에서 환급 표기 결정)
- `priorPaidLocalTax` total = `aggregated.priorPaidLocalTax`
- `deductedLocalPayable` total = `aggregated.settlementLocalPayable`
- 부호: FilingFormTable 기존 차감행 관례(양수 저장, 라벨로 차감 의미) 따름. summary 카드와 **절대값 일치, 부호는 각 컴포넌트 관례** (summary는 `-priorPaidTax` 음수 렌더 `:165`, FilingFormTable은 기본공제·장특공처럼 양수+라벨 — 이 비대칭은 기존부터 존재, 신규 도입 아님. 검토 #2).

### 자산별 null 처리
`setNum("priorPaidTax", col, null)` 등 자산 루프에서 4행 모두 null → 합산-only 행(과세표준·지방세와 동일 패턴, `:172·190-193`).

---

## 3. 수정 3 — 기신고 양도소득금액 (Phase B, 14-sync 신규 입력)

### 근본: 표시 버그 아닌 미구현
- `priorIncomeAmount` 행 3곳 하드코딩 0: `FilingFormTableAggregateHelpers.ts:169`(자산별)·`:236`(합계)·`FilingFormTableHelpers.ts:768`(단건). 상세명세서 `DetailedStatementHelpers.ts:524`도 0 + "기신고분 미반영" 주석. 채울 엔진 필드·입력 전무.

### 데이터 소스 (사용자 확정: 예정신고 이력 자동 파생)
`priorPaidTax`(기납부세액)와 동일 정산 맥락. 이력 record.resultData에서 양도소득금액 추출:
- **multi record**: `AggregateTransferResult.totalIncomeAfterOffset`(`transfer-aggregate.types.ts:264`) clean 필드 ✅
- **single record**: 양도소득금액 단일 필드 없음 → `taxableGain − longTermHoldingDeduction` 계산 (lossy, §99의3 reducible 미반영) ⚠️ (§6-6)

### 구현 — `priorPaidTax` 14-sync 파이프라인 미러
> 추출 소스는 다름(priorPaidTax=이력 `determinedTax` 세액, 기신고 소득=이력 `totalIncomeAfterOffset` 소득금액)이나 **store→api→zod→route→engine input→result echo 파이프라인·계층은 동일 미러** (검토 #4). 엔진은 저장만·계산 안 함.
| # | 지점 | 위치 |
|---|---|---|
| ① store | `priorReportedIncome: string` + `priorReportedIncomeEdited: boolean` | `multi-transfer-tax-store.ts` (priorPaidTax/Edited 미러) |
| ② 자동채움 | `extractLoadPriorReportedIncome`(형제) — multi=`rd.totalIncomeAfterOffset`, single=`taxableGain−LTHD`. `!edited` 게이트 | `transfer-multi-load-entry.ts` + `MultiTransferTaxCalculator.tsx:302,319` |
| ③④ API 변환 | parseAmount → body | `lib/calc/multi-transfer-tax-api.ts` |
| ⑫ Zod | `priorReportedIncome?: number` | `transfer-tax-schema.ts` `multiInputSchema` |
| ⑭ Route | 엔진 input 매핑 | `app/api/calc/transfer/multi/route.ts` |
| 엔진 input | `priorReportedIncome?` (저장만, 계산 안 함) | `AggregateTransferInput` |
| 엔진 result echo | `priorReportedIncome` | `AggregateTransferResult` |
| ⑦ 신고서 배선 | 합계 `priorIncomeAmount`(`:236`) = `aggregated.priorReportedIncome`; 자산별(`:169`) null("-") | `FilingFormTableAggregateHelpers.ts` |
| ⑤ 편집 위젯 | priorPaidTax 옆 입력(onChange→`priorReportedIncomeEdited=true`) | `AggregateSettingsPanel` |
| ⑧ validation | fallback 동기화 | `lib/calc/*-validate.ts` |
| ⑥ 사이드바 | **반영 불필요** — 기신고 소득은 세액 무영향 display echo (≠priorPaidTax는 납부세액 변경). 검토 A5 | `computeXxxSummary` 수정 없음 |

> 미러 원본 = memory `project_transfer_multi_prepaid_settlement_plan`(priorPaidTax 정산): store→api→zod→route→engine→echo 전 지점 레퍼런스.
> - `priorReportedIncomeEdited`는 **UI 전용** — API body·Zod 미포함 (priorPaidTaxEdited 관례, 검토 #7).
> - **마운트 타이밍 가드**: `MultiTransferTaxCalculator.tsx:280` mount useEffect(잔존 property 정리)와 자동채움 충돌 방지 — priorPaidTax가 이미 겪은 "auto-add blank ↔ append stray blank" 가드를 동일 재사용 (검토 A6).

### 별건 버그 (범위 밖, 발견 기록)
`extractLoadPriorPaid` single 분기(`transfer-multi-load-entry.ts:26`)가 `rd.result?.determinedTax`(중첩 `.result`)를 읽으나 single 저장은 flat(`TransferTaxCalculator.tsx:100` `resultData: result`) → single 이력 불러오기 시 priorPaidTax 자동채움이 0으로 빠질 가능성. **별건**(요청 3건과 무관) — 확인 후 별도 처리 권장.

---

## 4. 케이스 매트릭스

| # | 케이스 | 기대 |
|---|---|---|
| C1 | 자산 2건 양도일 상이(01-12/03-25) | 자산1=01-12, 자산2=03-25, 합계="-" |
| C2 | 자산 2건 양도일 동일 | 자산1=자산2=합계=동일값 |
| C3 | 취득일·보유기간·거주기간·퇴거일 (per-property) | 각 자산 실제값 (기존 "-"/자산1값 해소, transferDate 4곳 치환) |
| C4 | 기납부세액 0 (미입력) | 기납부=0, 차감납부=총결정세액 |
| C5 | 기납부 < 총결정 | 차감납부 = 총결정−기납부 (양수) |
| C6 | 기납부 > 총결정 (환급) | settlementRefund>0 → 차감납부 표기 (§열린판단 2) |
| C7 | 지방세 기납부 | 지방세 결정 하단 기납부·차감납부 정상 |
| C8 | bundled(§166⑥) 회귀 | propertyFormMap 미주입 → 기존 동작 그대로 (양도일·행 무변경) |
| C9 | 자산별 컬럼 기납부 행 | null → "-" |
| C10 | (B) multi 이력 불러오기 → 기신고 소득 | `totalIncomeAfterOffset` 합산 → 기신고 양도소득금액 행 표시 |
| C11 | (B) 기신고 소득 미입력 | 0 (기존 동작, 회귀 없음) |
| C12 | (B) 사용자 수동편집 후 재-불러오기 | `priorReportedIncomeEdited=true` → 자동채움 skip (수동값 보존) |

> Phase A = C1~C9(엔진 무변경), Phase B = C10~C12(신규 입력).

---

## 5. Pre-Do Anchor (memory `feedback_pre_anchor_verification`)
기존 anchor `e2e/transfer-multi-filing-form.spec.ts` 확장(자산 양도일 상이 시드 이미 있음 — np1=2026-01-01, np2=2026-03-01):
**Phase A**:
1. **양도일**: `[data-print-id="form-table"]` 내 자산2 컬럼 셀에 자산2 양도일(2026-03-01 등)이 표시, 자산1 값과 다름을 assert (구현 전 실패 → 후 통과).
2. **기납부·차감납부**: 시드에 `priorPaidTax`/`priorPaidLocalTax` 부여 → "차감납부할세액" 행 + 값(총결정−기납부) assert. (기납부 0이면 차감=총결정 확인)

**Phase B** (③ 착수 시):
3. **기신고 양도소득금액**: multi 이력 시드(resultData.totalIncomeAfterOffset) → 불러오기 → "기신고 양도소득금액" 행에 합산값 표시 assert. 미입력 시 0(회귀) 확인.

---

## 6. 검증 게이트
- [ ] `tsc --noEmit` 0
- [ ] ESLint 0
- [ ] anchor E2E (양도일 자산별 + 기납부·차감 행) 통과
- [ ] 다건 결과탭 E2E 회귀 (transfer-multi-*, transfer-bundled-amendment)
- [ ] `__tests__/components/filing-form-exempt-gain-reduction-cap.test.tsx` + DetailedCalculationStatementCard 테스트 — 신고서 양식 행 추가 영향 확인
- [ ] 전체 vitest (pre-push) — `feedback_print_leaf_add_unit_test_sync`: 이번은 leaf 추가 아님(행 추가)이나, aggregate 행 개수를 하드코딩한 테스트가 있으면 동기화
- [ ] 800줄: `FilingFormTableAggregateHelpers.ts` 현재 라인 수 확인 (4행 + per-property 로직 추가)
- [ ] bundled 회귀 (C8) — BundledAllocationCard 신고서 양식 무변경 확인
- [ ] **(Phase B) 14-sync 전지점** — memory `feedback_api_zod_schema_sync` ⑫⑬⑭ grep 자가점검. store·Zod·route·엔진 input·result echo·validation 누락 0
- [ ] **(Phase B) priorPaidTax 회귀** — 신규 필드 추가가 기존 정산(priorPaidTax) 경로 무영향 확인
- [ ] **(Phase B) 엔진 회귀 테스트 신설** — `multi-prepaid-settlement.test.ts`의 priorPaidTax S4(미지정→불변) 동형으로 `priorReportedIncome` 미지정→result 불변 anchor (검토 A4)
- [ ] **(Phase A) 기존 신고서 테스트** — `filing-form-exempt-gain-reduction-cap.test.tsx`는 label 기반 행 조회라 4행 추가에 안전(검토 A5-해소)하나 회귀 실행은 유지

---

## 7. 열린 설계 판단
1. **수정1 스코프**: 양도일만 vs 취득일·보유기간 동반. 근본 원인이 `findAssetByPropertyId` bundled 가정이라 propertyFormMap 우선 조회 한 번으로 **모두 정상화** → 동반 수정 권장(추가 비용 0, 취득일 "-" 버그도 해소). **권장: 동반.**
2. **수정2 환급 표기 (C6)**: 기납부 > 총결정이면 `settlementRefund>0`. "차감납부할세액" 행에 (ㄱ) 0 표기 + 별도 "환급세액" 행, (ㄴ) 음수 표기 중 선택. summary 카드는 별도 "환급세액 (국세)" 행(`:166-167`) 방식 → **일관성 위해 (ㄱ) 권장**(차감납부=0, 환급>0 시 환급 행 추가 표시).
3. **부호 표시**: FilingFormTable 차감행 관례(양수+라벨) vs summary(음수 렌더). 신고서 양식은 기존 관례(양수) 유지, 값은 summary와 동일 소스.
4. **Phase 분리 실행 (③)**: ①② (Phase A, 엔진 무변경 신고서 정정)를 먼저 완결·ship, ③ (Phase B, 14-sync 신규 입력)을 후속. **권장: A 먼저.** ③을 A에 합치면 규모·회귀면이 커져 A의 빠른 정정이 지연됨.
5. **단건 `priorIncomeAmount`(`FilingFormTableHelpers.ts:768`) 범위**: ③은 다건 전용. 단건 신고서의 동일 하드코딩 0 행은 이번 범위 밖. **권장: 다건만** (단건 예정신고 정산은 별건 기능).
6. **single 이력 소득금액 lossy 계산 (③)**: single record엔 양도소득금액 clean 필드가 없어 `taxableGain − LTHD`로 계산 (§99의3 reducible·비과세 미반영으로 부정확 가능). multi 이력은 `totalIncomeAfterOffset` 정확. **판단 필요**: (ㄱ) single도 근사 계산 허용, (ㄴ) single 불러오기 시 기신고 소득 자동채움 제외(수동만). 다건 정산은 multi 이력 위주(§107 telescoping)이므로 (ㄴ)이 안전할 수 있음 — Phase B 착수 시 사용자 확인.

> 권장안(1 동반, 2-ㄱ, 3 양수, 4 A먼저, 5 다건만)으로 진행 예정. 6은 Phase B 착수 시 확인. 확정 후 `plan-design-self-review-loop` 검토 → Pre-Do anchor → Do.
