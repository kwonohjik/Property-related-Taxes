# 작업 계획서 — 전 세목 펼치기/접기 토글 표준화

> 작성 2026-07-01. 양도세 표준화(PR#445·#446) 후속. 나머지 세목의 ad-hoc 섹션 토글 13건을
> 공용 표준(`ExpandToggleButton`)으로 통일한다. **모든 file:line은 실측 확인됨.**

## 1. 목표

세목 계산기 UI의 **섹션 단위 펼치기/접기 토글**을 단일 표준으로 통일하여 시각·동작 일관성 확보.

- 성공 기준: 표준화 대상 13건이 모두 표준 칩("▼ 펼치기"/"▲ 접기") 사용 + `npx tsc --noEmit` 0건 + 전체 테스트 회귀 0 + 인쇄(print) 동작 보존.

## 2. 표준 정의 (단일 출처)

`components/calc/results/shared/ExpandToggleButton.tsx`:
- `ExpandToggleButton({ open, onClick, tone })` — 독립 버튼(중첩 button 불가 위치엔 사용 금지).
- `expandToggleClass(tone)` + `expandToggleLabel(open)` — **헤더 전체가 `<button>`인 경우** span에 시각만 적용(중첩 button 회피). 라벨 "▼ 펼치기"/"▲ 접기". 클래스에 `print:hidden` 포함.
- tone: `sky|violet|slate|rose|emerald|amber|blue`. 기본 `slate` 사용(세목 무채색 통일).

## 3. 변환 패턴 (3종)

### P1. glyph 직접 사용 (`{open ? "▲" : "▼"}`) — 9건
헤더가 이미 `<button>`이고 우측에 glyph span이 있는 구조. **glyph span만 교체**:
```tsx
// before
<span className="text-muted-foreground">{open ? "▲" : "▼"}</span>
// after
<span className={expandToggleClass("slate")} aria-hidden>{expandToggleLabel(open)}</span>
```
- 헤더 텍스트 안에 glyph가 박힌 경우(UnlistedStockSimpleFields:196 "…(§59②) ▲ 산출근거")는 텍스트에서 glyph 제거 후 우측에 칩 추가.
- 본문 `print:block`/버튼 `print:hidden` 기존 패턴 유지(칩 클래스에 print:hidden 내장 → 정합).

### P2. ChevronIcon (lucide) — 1건 (`SimultaneousGiftCard` `SectionToggle`)
`<ChevronUp/Down>` → 칩 span 교체. 사용처가 한 곳뿐이면 `import { ChevronDown, ChevronUp }` 제거(미사용 시 tsc 경고).

### P3. native `<details>/<summary>` — 3건
상태 비보유 → React 상태 + 헤더 button + 칩 + 본문 `hidden print:block`로 변환(양도세 `ParcelDisclosure` 선례 동일):
```tsx
const [open, setOpen] = useState(false);
<div className="rounded-lg border ...">
  <button type="button" aria-expanded={open} onClick={() => setOpen(v=>!v)}
          className="flex w-full items-center gap-2 ...">
    <span>{헤더라벨}</span>
    <span className={expandToggleClass("slate")} aria-hidden>{expandToggleLabel(open)}</span>
  </button>
  <div className={open ? "" : "hidden print:block"}>{본문}</div>
</div>
```

## 4. 표준화 대상 (A) — 13건 (전부 file:line 실측)

| # | 세목 | 파일:라인 | 토글 용도 | 방식 | 패턴 |
|---|---|---|---|---|---|
| 1 | 취득세 | `components/calc/results/AcquisitionTaxResultView.tsx:661` | 계산 과정 상세 보기 | glyph | P1 |
| 2 | 취득세 | `components/calc/results/acquisition/SurchargeFlowDiagram.tsx:213` | 중과세율 흐름 step별 상세(아코디언) | glyph | P1 |
| 3 | 취득세 | `components/calc/results/acquisition/HouseCountVerifier.tsx:79` | 주택 수 검증 상세 | glyph | P1 |
| 4 | 증여세 | `components/calc/results/GiftTaxResultView.tsx:567` | 평가 근거 펼침 | glyph | P1 |
| 5 | 증여세 | `components/calc/results/GiftValuationBasisCard.tsx:129` | 자산별 평가 breakdown | glyph | P1 |
| 6 | 증여세 | `components/calc/prior-gift/GiftRowBesshiSection.tsx:45` | 별지 서식 섹션 펼침 | glyph | P1 |
| 7 | 증여세 | `components/calc/gift/SimultaneousGiftCard.tsx:78-80` | 동시증여 섹션 접기/펼치기 | ChevronIcon | P2 |
| 8 | 재산세 | `components/calc/results/PropertyTaxResultView.tsx:674` | 법령 근거 보기 | native details | P3 |
| 9 | 상속·증여 평가 | `components/calc/UnlistedStockSimpleFields.tsx:196` | 영업권 평가액 산출근거 | glyph(텍스트내) | P1 |
| 10 | 양도세 감면 | `components/calc/exemption/ExemptionChecklist.tsx:159` | 적용 요건·제외 사유 상세 | glyph | P1 |
| 11 | 공통도구 | `components/calc/building-std-price/nts-report/NtsBuildingStdPriceReport.tsx:68` | NTS 건물기준시가 보고서 상세 | glyph | P1 |
| 12 | 상속세(도구) | `app/calc/family-business-postmgmt/page.tsx:448` | 부가 설명 섹션 | native details | P3 |
| 13 | 상속세(도구) | `app/calc/inheritance-postmgmt/page.tsx:305` | 부가 설명 섹션 | native details | P3 |

비고:
- #2 `SurchargeFlowDiagram`은 단일 토글이 아니라 step별 아코디언이나, 각 step 우측 glyph가 동일 패턴이라 P1로 일괄 처리(여러 step 같은 glyph span).
- #10 `ExemptionChecklist`는 같은 파일 285행이 **이미 표준** → 159행만 정합 맞추면 파일 내 일관.
- #12·#13은 메인 6탭이 아닌 **독립 도구 페이지**(상속세 사후관리). 범위에 포함하되 별도 인지.

## 4b. 인라인 micro 토글 클래스 — **범위 밖 확정 (2026-07-01 결정: 제외)** (포괄 재감사 추가)

> **결정**: 양도세 표준화 때 인라인 micro 토글을 제외한 기준과 일관되게, 아래 micro 클래스(공용 `ExpandButton` 14곳
> 포함)와 `EstateItemHeader` 고급옵션 토글은 **표준화 대상에서 제외**. 최종 작업 범위 = §4의 섹션 13건.

초기 감사(3패턴 grep)가 놓친 것을 광역 재스윕(`aria-expanded`·rotate·Chevron·text 버튼)으로 재감사한 결과:
**다른 탭에 §4의 "섹션 레벨" ad-hoc 토글은 추가 0건**(13건이 섹션 기준으론 완전). 단, 아래
**인라인 micro 토글**(`text-[10px]` 급, 행/값 옆 "▲/▼" 또는 "▼ 산출근거")이 다수 존재 — 이는 양도세 표준화 때
사용자가 **명시적으로 제외한 인라인 micro**(`DetailedCalculationStatementCard` 자산별 토글)와 **동일 스케일**.

| 대상 | 파일:라인 | 비고 |
|---|---|---|
| 공용 `ExpandButton` (비표준) | `components/calc/results/deduction-breakdown/shared.tsx:139` | `text-[10px]` ▲/▼. **상속 공제·안분 상세카드 14곳이 사용**(deduction-breakdown 9 + allocation-breakdown 5) → 이 1개 컴포넌트만 표준화하면 14장 일괄 |
| 세액공제 산출근거 행토글 | `components/calc/TaxCreditBreakdownCard.tsx:368` | `text-[10px]` "▼ 산출근거" |
| 세대생략 할증 산출근거 행토글 | `components/calc/results/GenerationSkipSurchargeBreakdownCard.tsx:269` | `text-[10px]` "▼ 산출근거" (※ 헤더 :75는 이미 표준 ExpandToggleButton = B) |
| 사전증여 모달 내부 안내 | `components/calc/gift/PriorGiftHistoryModal.tsx:132` | 모달 내부 info (※ 헤더 :375는 표준 = B) |

**결정 필요**: "전체 통일"이 이 micro 클래스까지 포함인가?
- **포함**: `ExpandButton` 1곳 + 2개 행토글 표준화 → 14장 일괄 정합. 단 "산출근거" 라벨이 표준 고정라벨("▼ 펼치기")로 바뀌어 맥락 손실 → label variant 필요할 수 있음. 양도세 micro 제외 결정과 불일치.
- **제외(양도세와 일관, 권장)**: micro는 그대로 두고 §4의 13건(섹션)만 표준화.

### 별도 판단: 고급옵션 토글
- `components/calc/inheritance/estate-card/EstateItemHeader.tsx:87` — 자산카드 "고급 옵션" 패널 토글.
  Settings 아이콘 + 테두리 + `data-testid="estate-advanced-panel-toggle-*"`(E2E 결합) + `aria-controls`. "펼치기"가 아닌
  **고급옵션 gear 컨트롤**이라 표준 "▼ 펼치기" 칩으로 바꾸면 UX 의미 변질 + testid 영향. → 별도 결정(기본 제외 권장).

## 5. 제외 항목 (작업 안 함)

- **이미 표준(B) — 공용 래퍼(내부에서 표준 사용)**: `CollapsibleHintCard.tsx`, `inheritance/CollapsibleEstateGroup.tsx`,
  `results/source-summary/SourceDataSummarySection.tsx`. **이 래퍼를 쓰는 모든 카드는 자동으로 표준** → 상속 탭 다수가 이미 통일.
- **이미 표준(B) — 직접 사용**: `MajorShareholderCheckpointHints.tsx`·`MajorShareholderBlock.tsx`(주식양도세),
  `ExemptionChecklist.tsx:285`, `PropertyCardEditor.tsx`, 종부세 납부계산 카드(`HousingPayableTaxCalcCard`·`LandPayableTaxCalcCard`·`ComprehensiveFilingFormSection`), `GenerationSkip:75`, `PriorGiftHistoryModal:375` 등 다수.
- **토글 아님(C)**: `EstateItemHeaderChips.tsx`(칩 확장 인디케이터 rotate-180), `EstateItemActionsMenu`(DropdownMenu),
  `InheritanceStockNameAutocomplete`(combobox), `InheritanceMobileSummaryBar`(모바일바), `GiftCreditChecklist`(aria-pressed 칩),
  플로우/장식 화살표(`MixedUseResultCard` 등). 인라인 micro(§4b)는 범위 결정 대상.

## 6. 인쇄(print) 보존 규칙

- 칩 클래스에 `print:hidden` 내장 → 인쇄 시 토글 숨김.
- 본문은 `hidden print:block`(접힘 상태여도 인쇄 시 펼침)로 통일 — glyph 변환분은 기존 print 패턴 유지, native details 변환분은 신규 적용.
- print-only 헤더가 필요한 카드(예: 양도세 EngineSteps)는 선례대로 별도 print 헤더 유지.

## 7. 테스트/E2E 결합

- **실측 결과: UI 토글 텍스트·구조를 참조하는 테스트/E2E 없음**(grep 결과 전부 엔진 레벨 anchor). 회귀 위험 낮음.
- 단, native details(P3) 변환은 DOM 구조가 바뀌므로 변환 후 해당 결과뷰 컴포넌트 테스트(있으면) 재실행.

## 8. Ship 배치 계획 (세목별 그룹)

> ⚠️ 이 repo는 GitHub 브랜치 보호 미설정 → `ship.sh --auto`는 `enablePullRequestAutoMerge` 오류로 실패.
> **즉시 머지 모드(`ship.sh <branch> "<msg>"` 인자 2개)** 또는 push 후 `gh pr merge --squash --delete-branch` 사용.

| 배치 | 포함 # | 브랜치(제안) |
|---|---|---|
| B1 취득세 | 1·2·3 | `fix/acquisition-expand-toggle-standard` |
| B2 증여세 | 4·5·6·7 | `fix/gift-expand-toggle-standard` |
| B3 재산세+평가+감면 | 8·9·10 | `fix/property-valuation-exemption-expand-toggle-standard` |
| B4 공통도구+상속도구 | 11·12·13 | `fix/tools-expand-toggle-standard` |

배치별 독립 ship(작은 PR 다수 → 리뷰 용이). 또는 전부 한 브랜치로 묶어 1 ship도 가능(선택).

## 9. 검증 체크리스트 (배치마다)

- [ ] 변환 후 `npx tsc --noEmit` 0건 (P2는 미사용 import 제거 확인).
- [ ] 해당 세목 컴포넌트 테스트: `npx vitest run __tests__/components/calc/`.
- [ ] 전체 회귀: `npm test` (pre-push가 자동 실행).
- [ ] 칩이 헤더 우측에 렌더되고 본문 토글 동작(수동 또는 가능 시 E2E).
- [ ] 인쇄 미리보기: 토글 숨김 + 본문 노출(접힘 상태 포함).

## 10. 리스크/주의

- **중첩 button 금지**: 헤더가 `<button>`인 곳엔 `ExpandToggleButton`(자체 button) 대신 `expandToggleClass`/`expandToggleLabel` span 사용. native details 변환 시 신설 헤더 button 안에 또 button 넣지 않기.
- **tone 선택**: 무채색 통일 위해 기본 `slate`. 단 카드가 강한 색조(emerald 등)면 해당 tone 사용해 카드와 조화(양도세 자산카드 선례).
- **UnlistedStockSimpleFields(#9)**: glyph가 라벨 텍스트 중간에 박혀 있어 단순 span 교체 아님 — 텍스트에서 glyph 제거 후 헤더 우측 칩으로 이동.
- **independent state**: P3·`.map` 내부 토글은 항목별 `useState` 필요(양도세 `ParcelDisclosure` 선례) — 부모 단일 state 공유 금지.
</content>
