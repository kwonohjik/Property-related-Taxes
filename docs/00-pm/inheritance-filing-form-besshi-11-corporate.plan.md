# 상속세 신고서 양식 (별지 제9호서식 부표 1·5) — 영리법인 사전증여 행 Phase 3 계획서

> 2026-05-21 PR-D 검증 결과: 본 계획서 v1의 "별지 11호" 인용은 오기 (별지 11호는 연부연납 신청서).
> 실제 양식 = 별지 제9호서식 부표 1 (사전증여 가산) + 부표 5 (영리법인 §3의2② 면제 명세).
> KoreanLaw MCP 검증: `mcp__claude_ai_KoreanLaw__get_annexes(상속세 및 증여세법 시행규칙, annexNo="9", knd="2")`

> 2026-05-21 · feature: `inheritance-filing-form-besshi-11-corporate`
> 선행: Phase 1 (commit `c48826a`) + Phase 1.5 (commit `bc3f8b3`)
> 소관: `inheritance-gift-tax-ui-senior` (UI) · `inheritance-gift-tax-senior` (엔진 노출 필드)
> 참조 정책: [[feedback_pdf_table_row_one_to_one_mapping]] · [[feedback_korean_law_82_vs_81_2_drift]] · [[feedback_besshi_form_replica]]

## 1. 배경

현재 `InheritanceTaxResultView.tsx:188-192` 는 사전증여 정보를 **단일 합계 행 `priorGiftAggregated`** 만 표시. 영리법인 사전증여를 별도 명세하지 않음.

상속세 신고 시 사용되는 **별지 제11호서식 (상속세 과세표준신고 및 자진납부계산서) 부표**는 사전증여재산을 회차별로 명세해야 하며, 영리법인 행은 별도 표시·§3의2② 면제액과 매핑 가능해야 함.

Phase 1·1.5 에서 사용자 가시성은 입력 화면 합산 요약 박스 + 결과 화면 면제 행으로 일부 확보했으나, **공식 신고서 양식 재현**은 미구현.

## 2. 법령·서식 근거 (KoreanLaw MCP 사전 검증 강제)

| 항목 | 확인 대상 |
|---|---|
| 상증법 시행규칙 별지 제11호서식 | 신고서 본지·부표 1·부표 2 등 구조 확정 |
| 부표 — 사전증여재산 명세서 | 컬럼 번호 (① 증여일 / ② 수증자 / ③ 관계 / ④ 재산종류 / ⑤ 평가가액 / ⑥ 증여세 산출세액 / ⑦ 신고세액공제 등) — 행 번호 동결 강제 |
| 부표 — 상속인 외 영리법인 부표 | 별도 양식 존재 여부 확인. 통상 사전증여 부표에 통합되되 비고란에 "영리법인 §3의2② 면제" 표기 |
| 국세청 집행기준 28-0-1 | 면제액 명세 표시 의무 |

**Plan 진입 전 강제**: `mcp__claude_ai_KoreanLaw__get_law_text(법령ID="상속세 및 증여세법 시행규칙", 조문="별지 제11호")` 본문 + 부표 PDF 캡처 첨부 후 v2 확정.

## 3. 현황 점검

### 3-1. 다른 세목 신고서 양식 (패턴 참조)

| 컴포넌트 | 위치 | 비고 |
|---|---|---|
| `FilingFormTable` (양도세) | `components/calc/results/transfer/FilingFormTable.tsx` | 32행 + redev ColumnMode + 합계 역산 |
| `StockFilingFormTable` (주식 양도) | `components/calc/stock-transfer/StockFilingFormTable.tsx` | 종목별 카드 |
| `GiftTaxFilingFormTable` (증여세) | `components/calc/results/GiftTaxFilingFormTable.tsx` | 신고서 양식 표 |
| **`InheritanceFilingFormTable` (상속세)** | **미존재** | **본 PR 신규** |

### 3-2. 엔진 결과 노출 필드

| 결과 필드 | 현황 | 부표 매핑 |
|---|---|---|
| `InheritanceTaxResult.priorGiftAggregated` | 합계만 | 부표 합계 행 |
| `InheritanceTaxResult.priorGiftBreakdown?` | ⚠️ 노출 여부 확인 필요 (`allBreakdown` 통합) | 행별 명세 — Phase 3에 필요 |
| `InheritanceTaxResult.corporateExemption?.{amount,limit,breakdown}` | 노출 (Phase 1) | 면제액 매핑 |
| `InheritanceTaxResult.creditDetail.giftTaxCredit` | 노출 | 부표 ⑥/⑦ 매핑 |
| 행별 `PriorGift` 입력 데이터 | UI 폼에서 직접 접근 가능 (`form.priorGifts`) | 결과 컴포넌트에 prop 전달 필요 |

→ 부표 표시에는 **`form.priorGifts` 를 결과 컴포넌트에 prop 전달**하는 패턴이 가장 안전. 엔진 결과 타입에 행별 메타 추가는 회귀 리스크 있음.

## 4. 작업 범위

### 4-1. 신규 컴포넌트 — `InheritanceFilingFormTable.tsx`

위치: `components/calc/results/InheritanceFilingFormTable.tsx`

#### Props

```tsx
interface Props {
  result: InheritanceTaxResult;
  priorGifts: PriorGift[];     // 행별 명세 원천
  heirs: Heir[];               // ② 수증자 라벨 매핑
  onPrint?: () => void;        // print:hidden 토글
  printDate?: string;          // 출력일
}
```

#### 표 구조 (KoreanLaw MCP 검증 후 확정)

**부표 — 사전증여재산 명세**

| 칸 | 컬럼명 | 출처 |
|---|---|---|
| ① | 증여일 (YYYY-MM-DD) | `gift.giftDate` |
| ② | 수증자 성명·법인명 | `heirs[gift.doneeId].name` ?? `propertyLocation` ?? "—" |
| ③ | 수증자 관계 | corporate → "영리법인" 고정 / 자연인 → `gift.doneeRelation` 라벨 |
| ④ | 재산종류 | `gift.propertyCategory` → GIFT_PRIOR_CATEGORY_LABELS |
| ⑤ | 평가가액 | `gift.giftAmount` |
| ⑥ | 증여세 과세표준 | `gift.giftTaxBase ?? gift.giftAmount` |
| ⑦ | 증여세 산출세액 | corporate → `gift.corporateGiftComputedTax` / 자연인 → `gift.computedTax` |
| ⑧ | 기납부세액 (§28) | corporate → "—" (§4의2③) / 자연인 → `gift.giftTaxPaid` |
| ⑨ | 비고 | corporate → "🏢 §13①2호 · §3의2② 면제" / 자연인 → blank |

빈 행은 `feedback_besshi_form_replica` 정책에 따라 일정 수 유지(부표 PDF 양식 동결).

**부표 합계 행**: `priorGiftAggregated` 사용. `feedback_redev_filing_form_acquisition_inverse` 의 역산 규칙은 본 부표에 부적용 (단순 합산).

**§3의2② 면제 별도 행** (부표 아래 또는 본지):
- 영리법인 사전증여 산출세액 합계
- 면제 한도 (산식 표시)
- 면제액 = Min(산출세액, 한도)

### 4-2. 결과 화면 통합

`InheritanceTaxResultView.tsx` 에서:
- `priorGiftAggregated > 0` 일 때 `InheritanceFilingFormTable` 호출
- `form.priorGifts` + `heirs` props 전달
- Phase 1 의 corporateExemption 카드는 본 표 내부로 흡수 또는 본지 영역에 배치 (디자인 결정)

### 4-3. print-only CSS 토글 ([[print-only-css-toggle]])

- 펼침 토글 useState 없이 CSS 만으로 인쇄 시 자동 펼침
- `className={open ? "block" : "hidden print:block"}` + 토글 버튼 `print:hidden`
- 다크모드 강제 흰 배경

## 5. 케이스 매트릭스

| # | 시나리오 | 부표 표시 |
|---|---|---|
| F1 | 자연인 사전증여 단일 행 | 행 1개 + 합계 행 + 자연인 ⑧ 표시 |
| F2 | 영리법인 단일 행 | 행 1개 + 합계 + ⑧="—" + ⑨="🏢 §3의2②" |
| F3 | 자연인 + 영리법인 혼합 | 행 2개 + 합계 + 영리법인 행만 비고 표기 |
| F4 | 영리법인 다수 행 | 각 행별 명세 + 산출세액 합산 + 면제 한도 단일 |
| F5 | 영리법인 5년 도과 (cutoff) | priorGiftAggregated 에서 제외되므로 부표 행도 미표시. ⚠ 단, 사용자가 입력은 했으므로 "참고 표시"로 분리 (또는 미표시 — UX 결정) |
| F6 | 사전증여 0건 (회귀) | InheritanceFilingFormTable 렌더 안 함 |

## 6. anchor 검증

- ANCHOR-FF-1: F1 자연인 단일 행 — 부표 표시 spec
- ANCHOR-FF-2: F2 영리법인 단일 행 — ⑧/⑨ 매핑
- ANCHOR-FF-3: F4 영리법인 다수 행 — 산출세액 합산
- ANCHOR-FF-4: F5 cutoff — 표시·미표시 정책 anchor
- ANCHOR-FF-5: F6 0건 — null 렌더 회귀 보호
- Print test: 토글 닫힘 상태에서도 인쇄 시 표 노출 확인

## 7. 14 동기화 지점

| # | 지점 | 변경 |
|---|---|---|
| ① | 폼 상태 | 변경 없음 |
| ② | initial | 변경 없음 |
| ③ | normalize | 변경 없음 |
| ④ | API 변환 | 변경 없음 |
| ⑤ | UI 위젯 | InheritanceFilingFormTable 신규 + 결과 화면 통합 |
| ⑥ | 사이드바 | 변경 없음 (Phase 1.5 corporate hint 유지) |
| ⑦ | 결과 카드 | 본 PR 핵심 |
| ⑧ | Validation | 변경 없음 |
| ⑨~⑭ | Zod/route | 변경 없음 |

## 8. 작업량 예상

| 항목 | 변경 |
|---|---|
| `InheritanceFilingFormTable.tsx` 신규 | ~300~400줄 |
| `InheritanceTaxResultView.tsx` 통합 | ~+30줄 |
| `InheritanceFilingFormHelpers.ts` (행 생성·합계·라벨) | ~150줄 |
| anchor 5건 | ~150줄 |
| **합계** | **~750줄** |

800줄 정책: `InheritanceFilingFormTable.tsx` 단일 ≤800줄, 행 생성 헬퍼는 분리.

## 9. 모호 분기 / 결정 필요

1. **doneeId 매핑**: corporate 행에 doneeId 가 있어야 ② 수증자 표시 가능. 현재 UI에 doneeId 입력 없음 → Phase 2 결정과 연동
2. **F5 cutoff 표시 정책**: 5년 도과 영리법인 행은 priorGiftAggregated 에서 제외되지만 사용자 입력 데이터는 존재. 부표에 "참고 표시"로 별도 행 분리 vs 미표시 — UX 결정
3. **별지 11호 vs 별지 14호 분리**: 영리법인 사전증여 명세가 독립 별지에 있을 가능성 — KoreanLaw MCP 본문 확인 후 v2 확정
4. **신고세액공제 §69**: 부표 ⑦/⑧ 외 별도 표시 필요한지 — 다른 세목 패턴 참조
5. **결과 화면 사전증여 단일 합계 행 (`InheritanceTaxResultView.tsx:188-192`)**: 본 부표 도입 시 합계 행 유지 vs 부표로 통합 — UX 결정

## 10. 우선순위·일정

- **Pre-PR**: 별지 PDF 캡처 첨부 + KoreanLaw MCP 본문 검증 (Plan v2)
- **PR1**: `InheritanceFilingFormTable.tsx` 골격 + 자연인 케이스 (F1·F6)
- **PR2**: 영리법인 행 + ⑨ 비고 + §3의2② 면제 별도 행 (F2·F3·F4)
- **PR3**: F5 cutoff 정책 + 인쇄 토글

## 11. Definition of Done

- [ ] KoreanLaw MCP 별지 제11호 본문 + 부표 컬럼 검증
- [ ] PDF 캡처 첨부 + 행 번호 동결 ([[feedback_pdf_table_row_one_to_one_mapping]])
- [ ] InheritanceFilingFormTable 신규 (~400줄)
- [ ] InheritanceTaxResultView 통합
- [ ] anchor FF-1~5 통과
- [ ] doneeId 결정 (Phase 2 동반 or 본 PR에서 입력 UI 동반)
- [ ] print 토글 정책 적용
- [ ] `npx tsc --noEmit` 0건
- [ ] inheritance 회귀 0
- [ ] 브라우저 수동 확인 (F1·F2·F3·F5 인쇄 미리보기 포함)
