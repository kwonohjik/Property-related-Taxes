# 계산 결과 선택 출력 — 설계 문서 (상속세)

> 계획서: [`docs/00-pm/selective-print.plan.md`](../../00-pm/selective-print.plan.md) · 브랜치 `feature/selective-print`
> 옵션 B(화면 인쇄 + 서버 PDF). 본 문서는 UI·PDF 중심(엔진 input/result 무변경).
> 모든 인용은 `InheritanceTaxResultView.tsx`(현 워크트리) 실측 기준.

## 1. 케이스 인벤토리 — 결과뷰 섹션 ↔ 출력 채널 매트릭스

`InheritanceTaxResultView.tsx`의 전 블록을 `data-print-id`로 식별. **컨트롤/안내(C)** 는 선택 대상 아님.

| # | 라인 | data-print-id | 라벨(사용자) | 그룹 | 렌더 가드 (isAvailable) | screen | pdf | 비고 |
|---|---|---|---|---|---|---|---|---|
| 1 | :179-187 | — | (PDF/인쇄 버튼) | C | 항상 | — | — | 선택 패널로 대체 |
| 2 | :190-217 | `core-result` | 핵심 결과(결정세액) | A 요약 | 항상 | ✓ | ✗ | PDF엔 기존 요약으로 충분 |
| 3 | :220-270 | `tax-summary` | 상속세 과세 요약 | A 요약 | 항상 | ✓ | ✗ | |
| 4 | :277-288 | `source-data` | 상속개시자료 요약(A·B·C·D) | B 자료 | `heirs.length>0` | ✓ | ✗ | |
| 5 | :291-298 | `prior-gift-filing` | 사전증여재산 명세 | B 자료 | `priorGifts.length>0 && deathDate` | ✓ | ✗ | |
| 6 | :301-306 | `corporate-exemption` | 영리법인 면제(부표5 포함) | B 자료 | `corporateExemption.amount>0` | ✓ | ✗ | |
| 7 | :309-320 | `debt-allocation` | 채무·공과·장례비 협의분할 | B 자료 | `heirAllocationResult && debtItems.length>0 && heirs.length>0` | ✓ | ✗ | |
| 8 | :323-325 | `heir-allocation-summary` | 상속인별 상속세부담액 집계 | A 요약 | `heirAllocationResult && heirs.length>0` | ✓ | ✗ | PDF엔 기존 InheritanceHeirAllocationSection |
| 9 | :328-332 | `deduction-breakdown` | 상속공제 상세 내역 | A 요약 | 항상 | ✓ | ✗ | |
| 10 | :335-337 | `allocation-breakdown` | 산출세액·증여세액공제 근거 | A 요약 | `heirAllocationResult && heirs.length>0` | ✓ | ✗ | |
| 11 | :340-342 | `filing-form-9` | **별지 제9호서식(앞쪽)** | C 신고서식 | `heirAllocationResult && heirs.length>0` | ✓ | **✓** | PR-3 PDF |
| 12 | :345-356 | `besshi-buppyo-2` | **별지9호 부표2(상속인별)** | C 신고서식 | `heirAllocationResult && heirs.length>0 && (estateItems‖priorGifts)` | ✓ | **✓** | PR-3 PDF, N장 |
| 13 | :359-368 | `deduction-besshi` | **부표3·별지5호·별지1호** | C 신고서식 | `deductionDetail`(내부 b5·b1 조건부) | ✓ | **✓** | ⚠️ Do deviation: 화면 단일 카드(공유 토글·PDF버튼) 구조 → 3종을 **단일 leaf로 통합**. 부표3 항상·별지5/1 내부 null 가드. 서버 PDF(PR-3)는 페이지 단위 세분화 가능 |
| 14 | :371-387 | — | 영농 사후관리 안내 | C | `farmingDeduction>0` | — | — | 이미 `print:hidden`, 선택 대상 아님 |
| 15 | :390-427 | `valuation-detail` | 재산 평가 내역 | D 평가 | 항상(토글) | ✓ | ✗ | |
| 16 | :430 | `unlisted-stock-besshi` | **비상장주식 별지4 부표3** | D 평가 | `estateItems`(내부 V2 자산) | ✓ | **✓** | PR-3 PDF, 법인 N |
| 17 | :433-438 | `listed-stock-besshi` | **상장주식 평가조서(갑·을)** | D 평가 | `estateItems`(내부 상장) | ✓ | **✓** | PR-3 PDF, 종목 N |
| 18 | :441 | `installment-guide` | 연부연납 안내 | E 기타 | 항상(내부 finalTax) | ✓ | ✗ | |
| 19 | :444-457 | `warnings` | 주의 사항 | E 기타 | `warnings.length>0` | ✓ | ✗ | |
| 20 | :462 | — | 로그인 유도 | C | `showLoginPrompt` | — | — | 선택 대상 아님 |
| 21 | :465 | — | 면책고지 | C | 항상 | — | — | 항상 출력(법적 고지) |
| 22 | :468-492 | — | 하단 버튼 | C | 항상 | — | — | 이미 `print:hidden` |

- **선택 가능 노드(leaf)**: **17종** (2~13·15~19). 부표3/별지5/별지1은 화면 단일 카드라 `deduction-besshi`로 통합(Do deviation).
- **PDF 채널 (실측 기준 — 거짓 선택 방지)**:
  - ⚠️ 표의 `pdf:✓`(별지 5종)는 **PR-3 목표값**(별지 react-pdf 구현 후). **PR-2 현재**는 별지 PDF 미구현이므로 별지 5종은 모두 **screen-only**.
  - **PR-2 실제 pdf 채널 = `tax-summary`·`heir-allocation-summary`** (현존 `ResultPdfDocument` 상속세 섹션 = 계산 내역 표 + 상속인별 집계로 표현 가능한 노드). 별지는 PR-3에서 `["screen","pdf"]`로 승격.
- **항상 출력(선택 무관)**: 면책고지(21)는 법적 고지이므로 선택 트리에서 제외하고 인쇄 시 항상 포함.

## 2. 계층 트리 (큰 섹션 → 개별 서식)

```
A. 계산 요약            (group:summary)
   ├ core-result        핵심 결과(결정세액)
   ├ tax-summary        상속세 과세 요약
   ├ heir-allocation-summary  상속인별 부담액 집계
   ├ deduction-breakdown      상속공제 상세
   └ allocation-breakdown     산출세액·증여세액공제 근거
B. 상속개시 자료        (group:source)
   ├ source-data        상속개시자료 요약(A·B·C·D)
   ├ prior-gift-filing  사전증여재산 명세
   ├ corporate-exemption 영리법인 면제
   └ debt-allocation    채무·공과·장례비 협의분할
C. 공식 신고서식        (group:forms)   ← PDF 채널 집중
   ├ filing-form-9      별지 제9호서식(앞쪽)              [pdf]
   ├ besshi-buppyo-2    별지9호 부표2(상속인별)           [pdf]
   └ deduction-besshi   부표3·별지5호·별지1호(단일 카드)  [pdf]  ← 3종 통합(Do deviation)
D. 재산 평가            (group:valuation)
   ├ valuation-detail   재산 평가 내역
   ├ unlisted-stock-besshi  비상장주식 별지4 부표3    [pdf]
   └ listed-stock-besshi    상장주식 평가조서(갑·을)  [pdf]
E. 기타                 (group:etc)
   ├ installment-guide  연부연납 안내
   └ warnings           주의 사항
```

- 그룹 id(`group:*`)는 부모 체크박스용. leaf id와 **네임스페이스 분리**(`group:` 접두)로 충돌 방지.
- 부모 체크 → 자식 일괄 토글, 자식 일부만 → 부모 indeterminate.

## 3. 모듈 설계 — `lib/print/inheritance-print-sections.ts` (순수)

```ts
export type PrintChannel = "screen" | "pdf";

// leaf id 17종 union (오타 방지·exact 매칭). besshi-buppyo-3/5/1 → deduction-besshi 통합(Do deviation)
export type PrintSectionId =
  | "core-result" | "tax-summary" | "heir-allocation-summary"
  | "deduction-breakdown" | "allocation-breakdown"
  | "source-data" | "prior-gift-filing" | "corporate-exemption" | "debt-allocation"
  | "filing-form-9" | "besshi-buppyo-2" | "deduction-besshi"
  | "valuation-detail" | "unlisted-stock-besshi" | "listed-stock-besshi"
  | "installment-guide" | "warnings";

export interface PrintSectionNode {
  id: PrintSectionId;
  label: string;
  channel: PrintChannel[];           // ["screen"] 기본, 별지는 ["screen","pdf"]
}
export interface PrintSectionGroup {
  id: `group:${string}`;
  label: string;
  children: PrintSectionNode[];
}

export const INHERITANCE_PRINT_SECTIONS: PrintSectionGroup[];  // §2 트리

// ── 순수 헬퍼 (Pre-Do anchor 대상) ──
export function flattenPrintSectionIds(
  groups?: PrintSectionGroup[]
): PrintSectionId[];                  // 모든 leaf id (선언 순서)

export function pdfEligibleIds(
  groups?: PrintSectionGroup[]
): PrintSectionId[];                  // channel에 "pdf" 포함 leaf만 (별지 7종)

/**
 * 화면 인쇄 가시성 클래스.
 * 선택됨 → "" (기존 표시 유지) / 미선택 → "print:hidden" (인쇄에서 제외)
 * 화면 표시는 불변(print:hidden은 인쇄 매체만). 회귀 최소.
 */
export function resolvePrintVisibilityClass(
  id: PrintSectionId,
  selectedIds: ReadonlySet<string>
): "" | "print:hidden";

// 그룹 체크 상태 (부모 체크박스 indeterminate 판정)
export type GroupCheckState = "all" | "partial" | "none";
export function resolveGroupCheckState(
  group: PrintSectionGroup,
  selectedIds: ReadonlySet<string>
): GroupCheckState;

// 서버 PDF에 포함할 섹션 (PR-2) — 선택 ∩ pdf 채널 ∩ 가용. Panel·route 공용 단일 헬퍼.
export function selectPdfSections(
  selectedIds: ReadonlySet<string>,
  availableIds?: ReadonlySet<string>
): PrintSectionId[];
```

### 설계 근거
- **화면 표시 불변 원칙**: 선택은 "인쇄 대상"만 제어. 미선택이어도 화면엔 그대로 보이고, 인쇄(print)에서만 `print:hidden`으로 제거 → 기존 화면 동작 회귀 0.
- 기존 별지의 `hidden print:block`(화면 접힘·인쇄 펼침)과의 상호작용: 래퍼에 `print:hidden`을 주면 부모가 `display:none`(print)이므로 내부 `print:block`보다 **우선**(자식은 부모가 숨으면 안 보임). 선택 시엔 래퍼 클래스 없음 → 기존 `hidden print:block` 그대로.

## 4. 결과뷰 통합 — `data-print-id` 래핑 (14지점 무관, UI 한정)

각 선택 가능 블록을 래퍼로 감싼다. 신규 컴포넌트 `components/calc/results/shared/PrintSection.tsx`:

```tsx
function PrintSection({ id, selectedIds, children }: {
  id: PrintSectionId; selectedIds: ReadonlySet<string>; children: ReactNode;
}) {
  return (
    <div data-print-id={id} className={resolvePrintVisibilityClass(id, selectedIds)}>
      {children}
    </div>
  );
}
```

- 면책고지·하단버튼·영농안내·로그인유도(C)는 래핑 **안 함**(기존 유지).
- `besshi-buppyo-3/5/1`은 `DeductionBesshiFormsSection` 내부 3종 → 이 섹션은 **3개 PrintSection으로 분해 래핑**하거나, 섹션이 `selectedIds`를 받아 내부에서 개별 래핑(분해 권장, 후속 PDF 채널과 일치).

## 5. 선택 UI 패널 — `components/calc/results/PrintSelectionPanel.tsx`

- 위치: 결과뷰 최상단(`:179` 버튼 자리 대체). `print:hidden`.
- 계층 체크박스 트리(shadcn `Checkbox` + 펼침). 부모=그룹(indeterminate 지원), 자식=leaf.
- 가용성: `isAvailable` false인 노드는 트리에서 **숨김**(렌더 가드와 동일 — §1 표). 데이터 없는 서식 선택 방지.
- 버튼 2개:
  - **"선택 항목 인쇄"**: 선택 0건 disabled + "출력할 항목을 선택하세요". `window.print()`.
  - **"선택 항목 PDF"**: `(loggedIn && savedId)` 동시 충족 시만 활성. 미충족 시 disabled + "로그인 후 또는 화면 인쇄로 저장하세요". POST(§6).
- 단축: "전체 선택" / "전체 해제". `pdf` 채널 없는 leaf는 PDF 버튼 동작에서 자동 제외(인쇄엔 포함).
- 색상/번호: `section-card-numbering`(sky), `ToggleCard` 톤. placeholder 숫자 금지.
- Select-on-focus·Enter-nav 전역 Provider 적용 대상(체크박스라 해당 적음).

## 6. 서버 PDF (PR-2·PR-3)

### route POST 추가 — `app/api/pdf/result/[id]/route.ts`
```ts
export async function POST(req, ctx) {
  // rate-limit 동일(분당 10), getCalculation 동일
  const { sections } = await req.json();      // string[] (leaf id)
  // sections ∩ pdfEligibleIds 만 유효, 빈 배열 → 400
  // ResultPdfDocument에 selectedSectionIds 전달
}
```
- GET(전체)은 **하위호환 유지**(양도세 `ResultDetailClient.tsx:61` 사용 중). POST는 상속세 선택 출력.
- `/api/pdf`는 `proxy.ts:6` 보호 → 로그인 강제(이미 미들웨어 처리).

### `ResultPdfDocument` 필터 + 별지 7종
- `selectedSectionIds?: string[]` prop 추가. 미지정=전체(GET 하위호환).
- 상속세 `InheritanceGiftSection`에 별지 7종 `<Page>`를 `selectedSectionIds.includes(id)`로 조건부 추가.
- 별지 데이터: `input_data`(=저장 form)에서 화면과 **동일 가공 재현**:
  - `estateItems = [...input.estateItems, ...input.stockItems]` (화면 `:414`)
  - `familyBusinessInput = input.familyBusiness` (화면 `:426`)
  - Date: `coerceDates`(deathDate 등). `result_data` Map 필드 금지(Record만).
- 별지별 신규 파일 `lib/pdf/sections/inheritance/*.tsx`(§3.4). 라벨·칸번호 상수는 **별지별 화면 컴포넌트에서 개별 확인**(besshi-form-constants는 비상장 전용 — 일반화 금지).

## 7. 케이스별 동작 (선택 → 출력)

| 케이스 | 선택 | 화면 인쇄 결과 | PDF 결과 |
|---|---|---|---|
| K-1 | 0건 | 면책고지만(본문 전부 print:hidden) → 인쇄 버튼 disabled로 차단 | 차단(400) |
| K-2 | `filing-form-9`만 | 별지9호 + 면책고지만 인쇄 | filing-form-9 1장 PDF |
| K-3 | group:forms 전체 | 신고서식 5종 인쇄 | 별지 5종 PDF(부표2 N장 포함) |
| K-4 | 전체 선택 | 현행과 동일(별지 모두 펼쳐 인쇄) | 전체 별지 PDF |
| K-5 | `besshi-5` 선택했으나 farmingDeduction=0 | (트리에 노드 없음 → 선택 불가) | — |
| K-6 | 비로그인 + `filing-form-9` | 화면 인쇄 정상 | PDF 버튼 disabled |

## 8. Pre-Do anchor (PR-1 선행)

`__tests__/print/inheritance-print-sections.test.ts` — 모듈 미구현 → **RED 확인 후 Do**.

- **PD-1**: `selectedIds=∅` → 모든 leaf에 `resolvePrintVisibilityClass = "print:hidden"`.
- **PD-2**: `selectedIds={"filing-form-9"}` → `filing-form-9`="", 그 외 전부 "print:hidden".
- **PD-3**: `flattenPrintSectionIds()` = 17 leaf, 전부 유니크, `group:` 접두 없음.
- **PD-4**: `pdfEligibleIds()` = 별지 5종 정확히(filing-form-9·besshi-buppyo-2·deduction-besshi·unlisted-stock-besshi·listed-stock-besshi).
- **PD-5**: `resolveGroupCheckState(group:forms, {"filing-form-9"})` = "partial"; 전체 선택 시 "all"; ∅ → "none".
- (PR-2 진입 시) **PD-6**: 저장 input_data로 별지 1종 PDF 렌더 → 화면과 수치 일치(직렬화·가공 재현 검증).

## 10. 갭 분석 (PR-1 Do 완료 — 계획·설계 vs 구현)

| 항목 | 설계 | 구현 | 판정 |
|---|---|---|---|
| 레지스트리 모듈 | `lib/print/inheritance-print-sections.ts` 순수 헬퍼 4종 | 동일 구현 | ✓ |
| leaf 개수 | 17 (deduction-besshi 통합) | union·트리·anchor 17 일치 | ✓ |
| PDF 채널 노드 | 별지 5종 | `pdfEligibleIds` 5종, anchor PD-4 | ✓ |
| PrintSection 래퍼 | `data-print-id` + 미선택 print:hidden | 구현, 화면 표시 불변 | ✓ |
| 선택 UI | 계층 체크박스·0건 가드·전체선택 | `PrintSelectionPanel`(native checkbox·indeterminate) | ✓ (shadcn Checkbox 부재 → native, 입력폼 토글 정책 비대상) |
| 결과뷰 통합 | 17섹션 래핑 + 가용성 derive | 17 PrintSection + `availablePrintIds` useMemo(가드 1:1) | ✓ |
| anchor | PD-1~5 + 트리 sanity | 6 PASS | ✓ |
| **deviation** | besshi 3 leaf | **deduction-besshi 1 leaf 통합** | ⚠️ 문서 환류 완료(§1·§2·§3·§8·계획§3.4) |
| 설계 카운트 오류 | §1 "16종"(실제 19→통합 17) | anchor 기준 17 정정 | ⚠️ 설계 자체 오류였음, 정정 완료 |
| 서버 PDF(PR-2)·별지 PDF(PR-3) | 범위 | **미구현(별도 PR)** | 의도된 비범위 |

**잔여(후속 PR)**: route POST·`ResultPdfDocument` 필터·별지 react-pdf(PR-2/3), E2E Playwright(브라우저 인쇄 미리보기 검증).

### 10-2. PR-2 갭 분석 (서버 PDF 골격)

| 항목 | 설계 | 구현 | 판정 |
|---|---|---|---|
| route POST | `{ sections }` body, GET 하위호환 | `buildPdfResponse` 공유 헬퍼 + GET/POST, 빈 sections 400 | ✓ |
| ResultPdfDocument 필터 | `selectedSectionIds` prop | prop + `InheritanceGiftSection` 조건부(요약·상속인별) | ✓ |
| pdf 채널 정정 | 별지는 PR-3까지 screen-only | tax-summary·heir-allocation-summary만 pdf, 별지 5종 screen | ✓ (PR-1의 시기상조 pdf 표시 정정) |
| PDF 버튼 | 로그인+savedId 조건 | `PrintSelectionPanel` PDF 버튼 + `savedId` prop + 비활성 안내 | ✓ |
| 선택→PDF 변환 | 단일 헬퍼 | `selectPdfSections`(Panel·route 공용) | ✓ |
| savedId 전달 | 마법사 → 결과뷰 | `InheritanceTaxForm:425 savedId={autoSave.savedId ?? undefined}` | ✓ |
| anchor | PD-4 갱신 + PD-6 | 7 PASS | ✓ |
| **별지 PDF(PR-3)** | 범위 | **미구현** | 의도된 비범위 |

**deviation**: PR-1에서 별지를 `pdf` 채널로 선표시했으나 실제 PDF 미구현 → PR-2에서 **현존 PDF 표현 가능 노드(요약·상속인별)만 pdf 채널**로 정정(거짓 선택 방지). 별지는 PR-3에서 react-pdf 구현과 함께 pdf 승격.

## 9. 동기화 체크리스트 (출력 레지스트리 — 14지점과 별개)

신규 결과뷰 섹션 추가 시:
- [ ] `PrintSectionId` union에 leaf 추가
- [ ] `INHERITANCE_PRINT_SECTIONS` 트리에 노드 + 그룹 배치
- [ ] 결과뷰 블록을 `<PrintSection id=...>` 래핑(+ `data-print-id`)
- [ ] PDF 출력 대상이면 `channel:["screen","pdf"]` + `ResultPdfDocument` 별지 추가
- [ ] anchor PD-3/PD-4 갱신 (leaf 수·pdf 목록)
