# 비상장주식 V2 정식평가 — 섹션 번호 정리 계획서

> ✅ **구현 완료 (2026-05-27, 미커밋)**: §5 전 항목 적용 + §54⑥ badge 신규 추가 + 부모 단일출처 전환. anchor `__tests__/components/calc/UnlistedStockV2SectionNumbering.test.tsx` 3건(DOM순 badge=`["1".."9"]`). 전체 5193 PASS·tsc 0·lint 0. (브라우저 확인은 실제 컴포넌트를 렌더하는 RTL anchor로 충족 — 마법사 네비게이션 e2e 대체.)
>
> 작성일: 2026-05-27 · 대상: `components/calc/inheritance/unlisted-stock-v2/`
> 관련 메모리: `project_unlisted_capital_change_relocation` (★ badge=디자인섹션ID→재정렬 금지, "3·4중복·10·6역순은 범위밖 후속"으로 기록됐던 그 이슈를 본 계획에서 처리)

## 1. 배경 / 문제

비상장주식 V2(별지 제4호 부표3) 정식평가 폼은 9개 입력·결과 섹션이 위→아래로 렌더되지만, 각 섹션의 원형 번호 badge가 **컴포넌트마다 하드코딩**되어 있고 그 값이 "디자인 섹션ID"라 **실제 화면 순서와 어긋난다**.

### 현재 상태 (화면 렌더 순서 vs 현재 badge)

| 렌더 순서 | 섹션 | 컴포넌트 | 현재 badge | 색상 | 비고 |
|---|---|---|---|---|---|
| 1 | 평가대상 비상장법인 (별지 1쪽) | `CorporateInfoSection` (line 173) | **1** | sky | OK |
| 2 | 최대주주 할증평가 §63③ | `CorporateInfoSection` (line 327, 임베드) | **2** | violet | OK |
| 3 | 사업연도별 순손익액 (별지 6쪽) | `FiscalYearAdjustmentTable` (line 157) | **3** | emerald | OK |
| 4 | 평가차액 (별지 3쪽) | `ValuationDeltaTable` (line 115) | **4** | emerald | OK |
| 5 | 순자산가액 (별지 2~3쪽) | `NetAssetCalculationTable` (line 152) | **5** | violet | OK |
| 6 | 영업권 평가 (별지 5쪽) | `GoodwillCalculationTable` (line 44) | **7** | amber | ⚠️ 6 건너뜀 |
| 7 | §22② 금융재산공제 배제 | `MajorShareholderStockToggle` (sectionNum 기본 10) | **10** | violet | ⚠️ 8·9 건너뜀 |
| 8 | §54⑥ 평가심의위원회 | `EvaluationCommitteeToggle` (line 96~) | **없음** | emerald | ⚠️ badge 누락 |
| 9 | 1주당 가액의 평가 결과 (별지 1쪽) | `PerShareValuationResultCard` (line 48) | **6** | indigo | ⚠️ 역순(맨 아래인데 6) |
| — | 별지 양식 PDF 미리보기 | `BesshiForm4Buppyo3PrintView` | 없음 | — | 출력 → 번호 제외(유지) |

**결과**: 사용자가 스크롤하면 `1 → 2 → 3 → 4 → 5 → 7 → 10 → (없음) → 6` 순으로 보여 번호가 뒤죽박죽이다.

### 근본 원인

- badge 숫자가 각 컴포넌트 내부에 **문자열 리터럴로 하드코딩**됨 (단일 출처 없음).
- 과거 "디자인 섹션ID" 의도로 매겨졌으나 컴포넌트 재배치·추가(자본금 변동 이동, §22② 토글 신설, §54⑥ 추가)를 거치며 화면 순서와 드리프트.

## 2. 목표 (사용자 확정)

1. **화면 순서대로 1~N 순차** 재부여 — 보이는 순서 = badge 번호 100% 일치.
2. **입력·결과 섹션만 번호, 출력(PDF 미리보기)은 제외.** §54⑥ 평가심의위원회는 선택적 입력 섹션이므로 번호 부여.
3. **재발 방지**: 번호를 부모(`UnlistedStockV2Card`)에서 `sectionNum` prop으로 주입 → 향후 순서 변경 시 **한 곳만 수정**. (CLAUDE.md `components/calc/CLAUDE.md` "다-섹션 입력 폼 — 색상 카드 + 섹션 번호 패턴" 강제 규칙 준수)

## 3. 최종 번호 매핑

| 섹션 | 현재 → 변경 | 처리 |
|---|---|---|
| 평가대상 비상장법인 | 1 → **1** | 유지 (CorporateInfoSection 내부, 항상 최상단) |
| 최대주주 할증평가 §63③ | 2 → **2** | 유지 (CorporateInfoSection 내부 임베드, §1과 co-located) |
| 사업연도별 순손익액 | 3 → **3** | 부모 prop |
| 평가차액 | 4 → **4** | 부모 prop |
| 순자산가액 | 5 → **5** | 부모 prop |
| 영업권 평가 | 7 → **6** | 부모 prop (하드코딩 7 제거) |
| §22② 금융재산공제 배제 | 10 → **7** | 부모 prop (기본값 10 제거) |
| §54⑥ 평가심의위원회 | 없음 → **8** | badge 신규 추가 + 부모 prop |
| 1주당 가액의 평가 결과 | 6 → **9** | 부모 prop (하드코딩 6 제거) |
| 별지 양식 PDF 미리보기 | — → — | 번호 제외 유지 |

> §1·§2는 `CorporateInfoSection` 한 컴포넌트 안에 인접 배치돼 항상 최상단에 고정되므로 내부 하드코딩 유지가 안전하다(분리·재배치 가능성 없음). 부모 단일 출처는 **형제 섹션 3~9**를 관할한다.

## 4. 구현 방식 — 부모 주입(centralized `sectionNum`)

`UnlistedStockV2Card`가 형제 섹션 3~9에 `sectionNum`을 명시 전달. 각 섹션 컴포넌트는 `sectionNum?: number` prop을 받아 badge에 렌더.

```tsx
// UnlistedStockV2Card.tsx (return 내부 — 실제 렌더 순서 그대로)
<CorporateInfoSection ... />                         {/* 내부 1·2 고정 */}
<FiscalYearAdjustmentTable ... sectionNum={3} />
<ValuationDeltaTable ... sectionNum={4} />
<NetAssetCalculationTable ... sectionNum={5} />
<GoodwillPanel input={effectiveInput} sectionNum={6} />        {/* 주식수>0일 때만 렌더 */}
<MajorShareholderStockToggle ... sectionNum={7} />            {/* 항상 렌더 */}
<EvaluationCommitteeToggle ... sectionNum={8} />              {/* 항상 렌더 */}
<EvaluationCommitteeResultPanel input={effectiveInput} />     {/* 번호 없음 — §8 하위 결과(조건부) */}
{input.evaluationCommittee && <EvaluationCommitteeFilingGuideCard ... />}  {/* 번호 없음 — §8 하위 안내(조건부) */}
<PerShareValuationResultCard input={effectiveInput} sectionNum={9} />  {/* 주식수>0일 때만 렌더 */}
<BesshiForm4Buppyo3PrintView ... />                  {/* 번호 없음 — 출력 */}
```

> - `GoodwillPanel`은 `UnlistedStockV2Card` 내부 로컬 컴포넌트(line 344)이므로 `sectionNum`을 받아 `GoodwillCalculationTable`로 전달하도록 시그니처 확장 필요.
> - **`EvaluationCommitteeResultPanel`(line 307)·`EvaluationCommitteeFilingGuideCard`(line 309)는 §8(§54⑥) 토글의 하위 결과·안내 카드**로, §54⑥ 신청이 적용될 때만 조건부 렌더된다. badge 없음(현재도 없음) 유지 — §8 흐름의 일부이므로 별도 번호를 부여하지 않는다. (사용자 "결과 섹션 번호"는 메인 1주당 가액 결과 §9를 가리킴. 위원회 하위 결과는 §8 sub-card.)

## 5. 파일별 변경 내역

> **공통 지침 (prop 기본값)**: 각 컴포넌트의 `sectionNum?`은 **해당 섹션의 표준 번호를 기본값으로** 둔다(예: Fiscal=3, ValuationDelta=4, NetAsset=5, Goodwill=6, Committee=8, Result=9). 부모가 명시 전달하면 prop이 우선이므로, 부모 누락 시에도 빈 badge 없이 정상 번호가 표시된다(belt-and-suspenders). `MajorShareholderStockToggle`은 기존 prop 존재 → 기본값만 10→7로 정정.

### 5-1. `FiscalYearAdjustmentTable.tsx` (line 157)
- props에 `sectionNum?: number = 3` 추가.
- badge `>3<` → `>{sectionNum}<`.

### 5-2. `ValuationDeltaTable.tsx` (line 115~117)
- props에 `sectionNum?: number` 추가.
- badge `4` → `{sectionNum}`.

### 5-3. `NetAssetCalculationTable.tsx` (line 152)
- props에 `sectionNum?: number` 추가.
- badge `>5<` → `>{sectionNum}<`.

### 5-4. `GoodwillCalculationTable.tsx` (line 44)
- props에 `sectionNum?: number` 추가.
- badge `}>7</span>` → `}>{sectionNum}</span>` (isExcluded 색상 조건은 유지).
- `GoodwillPanel`(부모 로컬 컴포넌트)에 `sectionNum` prop 추가 → `<GoodwillCalculationTable goodwill={...} sectionNum={sectionNum} />`.

### 5-5. `MajorShareholderStockToggle.tsx` (line 26)
- 기본값 `sectionNum = 10` → `sectionNum = 7`로 변경 (부모가 명시 전달하면 prop 우선이므로 안전, 기본값도 정합으로 정리).

### 5-6. `EvaluationCommitteeToggle.tsx` (line 96~) — ★ badge 신규 추가
- props에 `sectionNum?: number` 추가.
- 현재 `ToggleCard`만 직접 렌더 → badge 없음. `MajorShareholderStockToggle` 패턴을 차용해 **emerald 헤더 행(badge + 섹션 라벨)을 ToggleCard 위에 추가**.
- ⚠️ **현재 return은 Fragment `<>` 안에 `<ToggleCard>` + `<Dialog>`(폐기 확인, line 188~)를 함께 반환한다.** badge 헤더로 감쌀 때 **Dialog는 카드 밖 sibling으로 유지**해야 한다(모달 폐기 확인이 사라지지 않도록). 즉 ToggleCard만 bordered div로 감싼다:

```tsx
return (
  <>
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-200 text-[10px] font-bold text-emerald-800 select-none">
          {sectionNum}
        </span>
        <p className="text-xs font-semibold text-emerald-700">평가심의위원회 신청 (선택)</p>
      </div>
      <ToggleCard tone="emerald" ... title="§54⑥ 평가심의위원회 신청 옵션" ... >
        {/* 기존 children 유지 */}
      </ToggleCard>
    </div>
    <Dialog open={discardOpen} ...>{/* 기존 폐기 확인 Dialog 그대로 sibling 유지 */}</Dialog>
  </>
);
```

> 헤더 라벨에 "§54⑥"을 빼고 "평가심의위원회 신청 (선택)"으로 둬 ToggleCard title("§54⑥ 평가심의위원회 신청 옵션")과 문구 중복을 줄인다.

- ⚠️ **테스트 영향**: `__tests__/components/calc/EvaluationCommitteeIntegration.test.tsx` line 61이 `/§54⑥ 평가심의위원회 신청 옵션/`(ToggleCard title)을 단언 → **title 텍스트 그대로 유지**하므로 통과. 헤더 라벨("평가심의위원회 신청 (선택)")은 "신청 옵션"을 포함하지 않아 정규식 이중 매칭 없음.

### 5-7. `PerShareValuationResultCard.tsx` (line 48)
- props에 `sectionNum?: number` 추가 (h-6 w-6 indigo badge 유지).
- badge `>6<` → `>{sectionNum}<`.

### 5-8. `UnlistedStockV2Card.tsx` (return)
- §4 코드블록대로 형제 섹션에 `sectionNum={3..9}` 전달.
- `GoodwillPanel` 시그니처 확장 (`sectionNum` 받아 전달).

## 6. 검증 계획

1. `npx tsc --noEmit` — 0건 (신규 optional prop이므로 타입 안전).
2. 관련 anchor 회귀:
   - `npx vitest run __tests__/components/calc/EvaluationCommitteeIntegration.test.tsx`
   - `npx vitest run __tests__/tax-engine/property-valuation/` (besshi·goodwill·committee anchor)
   - `npx vitest run __tests__/lib/calc/section22-major-shareholder-exclusion.test.ts`
3. **전체** `npm test` (공유 모듈 영향 확인).
4. e2e: `e2e/inheritance-unlisted-section22-toggle.spec.ts` 실행 (badge 텍스트 의존 없음 — 통과 예상). 필요 시 "화면 순서 = badge 순차" 검증 spec 1건 추가:
   - ⚠️ **선행 입력 필수**: §6 영업권(`GoodwillPanel`)·§9 결과(`PerShareValuationResultCard`)는 **`totalShares>0 && ownedShares>0`일 때만 렌더**(그 전엔 `return null`). 따라서 spec은 발행주식총수·보유주식수를 먼저 입력해야 §6·§9가 나타난다.
   - 입력 후 9개 섹션의 badge 숫자를 DOM 순서대로 수집 → `[1,2,3,4,5,6,7,8,9]`와 일치 단언. (§54⑥ 하위 결과·안내 카드는 번호 없음이므로 수집 대상에서 제외.)
5. 브라우저 수동 확인 대신 **Playwright e2e로 충족** (메모리 `feedback_browser_verify_with_playwright` 정책).

## 7. 리스크 / 메모리 환류

- **회귀 위험 낮음**: 모든 테스트가 제목 텍스트로 단언, 원형 badge 숫자에 의존하는 테스트 없음(grep 확인 완료).
- **메모리 갱신**: 완료 후 `project_unlisted_capital_change_relocation`의 "3·4중복·10·6역순은 범위밖 후속" 기록을 **해소 완료**로 갱신하고, "badge=부모 `sectionNum` 단일 출처로 전환(향후 재배치 시 부모 한 곳만 수정)" 정책을 명시.
- **범위 외(후속 가능)**: §1 평가대상 / §2 최대주주 할증이 한 컴포넌트에 co-located된 구조 자체는 유지(이번 정리 대상 아님). 두 "최대주주" 섹션(§63③ 할증 vs §22② 공제배제)의 명칭 혼동은 콘텐츠 이슈로 별도 트랙.

## 8. 작업 순서 (Do)

1. 6개 섹션 컴포넌트에 `sectionNum?` prop 추가 + badge 리터럴 → `{sectionNum}` (5-1~5-7).
2. `EvaluationCommitteeToggle` emerald 헤더 badge 신규 추가 (5-6).
3. `UnlistedStockV2Card`에서 `sectionNum={3..9}` 전달 + `GoodwillPanel` 시그니처 확장 (5-8).
4. `tsc` → 관련 anchor → 전체 `npm test`.
5. e2e 순차 검증 spec 추가(선택) + 실행.
6. 메모리 환류 + 커밋.
