# 사례 33 UX 개선 — acquisitionMethod 라디오 4번째 옵션 "쌍방+일방"

## Context

**왜 이 변경이 필요한가**
- 사례 33(원취득 실가 + 증축분 환산) 구현은 완료(커밋 `3d2927b`·`ed9311b`), 산출세액 6,480,952 / 지방세 648,095 양도코리아 PDF 1원 단위 일치. 그러나 **UI에서 사용자가 사례 33 진입 경로를 발견·이해하기 어려움**.
- 사용자 화면 캡처에서 확인된 혼란 4건:
  1. acquisitionMethod 라디오 3옵션(실거래가/환산취득가/감정가액) 중 무엇을 골라야 사례 33이 되는지 불명. "원취득은 실가인데 왜 환산을 골라야?" 직관 어긋남
  2. "증축 있음" 토글이 환산 모드 내부에 숨어 있어 발견 어려움
  3. "토지 취득 → 취득가액(원)" 라벨이 실제로는 일괄 200,000,000을 받음 (사용자는 토지 안분값 164,880,819 입력 시도 가능)
  4. 필요경비 8,000,000을 "양도비(원)" 필드에 받는 구조 — 직관 어긋남
- 양도코리아 PDF 패턴(이미지 ②, ③)은 **계산유형 라디오에 "쌍방+일방"을 명시적으로 노출**하여 사용자가 처음부터 사례 33임을 선택. 동일 패턴 도입.

**의도된 결과**: 14지점 백엔드 동기화 0건 + UI 발견성·라벨 명확성·자동 안분 미리보기로 사용자 혼란 제거. 코드 위험 최소.

## 핵심 설계 결정 — 4번째 옵션은 **시각 표시 전용**

```
[기존] useEstimatedAcquisition(boolean) + isAppraisalAcquisition(boolean) + gbHasExtension(boolean)
       → 라디오 3옵션 매핑

[정정] 동일 3 boolean 유지. 라디오만 "4옵션 표시"로 확장:
  - "실거래가"           → useEst=false, isAppr=false
  - "환산취득가"          → useEst=true,  isAppr=false, gbHasExt=false
  - "감정가액"            → useEst=false, isAppr=true
  - "쌍방+일방 (증축)"  ★ → useEst=true,  isAppr=false, gbHasExt=true  ← 신규
```

→ **API 변환·Zod·Route·Validate·엔진 모두 변경 없음**. `acquisitionMethod`는 여전히 "actual" | "estimated" | "appraisal" 3종 유지. 사례 33은 기존대로 `estimated + extensionInfo` 조합으로 백엔드 인식.

## 변경 5건

### #1 라디오 4번째 옵션 추가 — `CompanionAcqPurchaseBlock.tsx:421-478`

기존 3 옵션(라인 421~478) 다음에 4번째 추가:
```tsx
<button
  type="button"
  onClick={() => {
    props.onUseEstimatedChange(true);
    props.onIsAppraisalAcquisitionChange(false);
    onChange({ gbHasExtension: true });  // 일반건물 자산일 때만
  }}
  aria-pressed={isMixedExtension}
  className={mixedExtensionStyle}  // tone="fuchsia" 또는 amber
>
  <div className="text-sm font-semibold">쌍방+일방 (증축 있음)</div>
  <div className="text-[11px]">원취득 실가 + 증축분 환산취득가</div>
</button>
```

- `isMixedExtension` 파생: `useEstimatedAcquisition && !isAppraisalAcquisition && gbHasExtension`
- **`assetKind === "general_building"` 일 때만 4번째 옵션 표시** (그 외 자산은 기존 3 옵션 유지)
- 4번째 선택 시 라디오 3종 옵션은 ring/border 약화 (시각적 배제)

### #2 일괄 취득가·필요경비 라벨 동적 변경 — `CompanionAcqPurchaseBlock.tsx:503-506`

기존:
```tsx
label={props.isAppraisalAcquisition ? "감정가액 (원)" : "취득가액 (원)"}
```

정정:
```tsx
label={
  props.isMixedExtension ? "토지·건물 일괄 취득가액 (원)" :
  props.isAppraisalAcquisition ? "감정가액 (원)" :
  "취득가액 (원)"
}
hint={
  props.isMixedExtension
    ? "엔진이 양도시 비율로 토지/건물1로 자동 안분합니다. 200,000,000 그대로 입력하세요."
    : undefined
}
```

양도비 필드(`transferExpense`)도 동일 패턴:
```tsx
hint={
  props.isMixedExtension
    ? "토지·건물 일괄 필요경비. 엔진이 양도시 비율로 자동 안분합니다."
    : "양도 시 발생한 중개수수료·인지대 등"
}
```

### #3 GeneralBuildingBlock 상단 사례 시나리오 안내 카드 신규 — `GeneralBuildingBlock.tsx:83 근처`

새 컴포넌트 `GeneralBuildingScenarioGuide.tsx` 또는 inline:
```tsx
<div className="rounded-lg border border-blue-200 bg-blue-50/40 p-3 text-xs space-y-1">
  <p className="font-semibold text-blue-800">📘 일반건물 — 취득 시나리오 가이드</p>
  <ul className="text-blue-700 space-y-0.5">
    <li>• <b>실거래가</b>: 토지·건물 일괄 취득가 입증 가능 (사례 31)</li>
    <li>• <b>환산취득가</b>: 토지+건물 전체 입증 불가, 모두 환산</li>
    <li>• <b>쌍방+일방 (증축 있음)</b>: 원취득은 실가 + 후속 증축분만 환산 (사례 33)</li>
  </ul>
</div>
```

### #4 증축 ToggleCard 위치 승격 — `GeneralBuildingBlock.tsx:174`

기존: ③ 취득시 기준시가 섹션 다음, 환산 모드 내부에만 표시
정정:
- 토글 자체는 동일 위치 유지 (조건 `isEstimated`도 유지)
- **4번째 라디오 옵션 선택 시 자동 `gbHasExtension: true` 설정** → 토글이 자동 ON 상태로 펼쳐짐
- description 텍스트 강화: "사례 33: 양도코리아 '쌍방+일방' 케이스 — 원취득은 실가, 증축분은 환산"
- tone "amber" 유지 (현재 `fuchsia` 표기는 디자인 문서 잔재 — 코드는 amber)

### #5 안분 결과 미리보기 카드 신규 — `GeneralBuildingBlock.tsx` 증축 토글 펼침 마지막에 추가

```tsx
{asset.gbHasExtension && allInputsReady && (
  <div className="rounded bg-amber-100/60 border border-amber-200 px-3 py-2 text-xs text-amber-800 space-y-1">
    <p className="font-semibold">자동 안분 미리보기 (엔진 결과 추정)</p>
    <p>토지 양도가: {format(landTransferEst)} / 건물1: {format(b1TransferEst)} / 건물2: {format(b2TransferEst)}</p>
    <p>토지 취득가: {format(landAcqEst)} / 건물1: {format(b1AcqEst)} / 건물2 환산: {format(b2EstimatedEst)}</p>
    <p className="text-[10px] text-amber-700">엔진 실제 계산값은 결과 단계에서 확인하세요.</p>
  </div>
)}
```

순수 함수로 미리보기 계산 (`useMemo` — store 미러링 금지). 산식은 엔진 `general-building-extension.ts`와 동일.

## 변경 대상 파일

| 파일 | 변경 | 예상 +줄 |
|---|---|---:|
| `components/calc/transfer/CompanionAcqPurchaseBlock.tsx` | 라디오 4번째 옵션 + 라벨 동적 + 파생 props 추가 | +35 |
| `components/calc/transfer/GeneralBuildingBlock.tsx` | 시나리오 가이드 + 안분 미리보기 카드 + description 강화 | +45 |
| `components/calc/transfer/CompanionAssetCard.tsx` | `isMixedExtension` prop 전파 (라디오 4번째 옵션 표시 조건) | +5 |
| `lib/calc/transfer-tax-validate.ts` 또는 `validate-gb.ts` | `gbHasExtension=true` 시 acquisitionMethod 일관성 검증 (`useEst=true && !isAppr` 강제) — 정합성 가드 | +5 |
| (선택) 별도 컴포넌트 분리 | `GeneralBuildingScenarioGuide.tsx` 또는 inline 유지 | +20 (분리 시) |

**파일 크기 정책**: 
- `CompanionAcqPurchaseBlock.tsx` 현재 줄수 wc -l 사전 측정 필수 (예상 +35줄로 800 초과 시 분할)
- `GeneralBuildingBlock.tsx` 332줄 → +45줄 = 377줄 (마진 충분)

## 재사용 (신규 작성 금지)

- `RadioCardGroup` 패턴 — 4번째 옵션도 동일 컴포넌트 사용 (이미 `CompanionAcqPurchaseBlock.tsx`는 button 기반이라 패턴 분석 후 적용)
- `safeMultiplyThenDivide()` — 안분 미리보기 계산 (lib/tax-engine/tax-utils.ts)
- amber 색상 카드 패턴 — `GeneralBuildingBlock.tsx:307-318` 비사업용토지 미리보기 카드 재사용
- 사례 28 안분 결과 표시 패턴 — 그 외 없으면 이번 PR이 첫 도입

## 14지점 동기화 평가

| # | 영향 |
|---|---|
| ① 폼 타입 | **변경 없음** (기존 3 boolean 그대로) |
| ② initial value | **변경 없음** |
| ③ normalize | **변경 없음** |
| ④ API 변환 | **변경 없음** (`acquisitionMethod`는 여전히 actual/estimated/appraisal) |
| ⑤ UI 위젯 | ★ 라디오 4번째 옵션 + 라벨 동적 + 가이드 카드 + 미리보기 카드 (본 PR 본체) |
| ⑥ 사이드바 | 영향 없음 (안분 미리보기는 자산 카드 내부) |
| ⑦ 결과 카드 | **변경 없음** (기존 GeneralBuilding3WayTable 그대로) |
| ⑧ validate | 정합성 가드 1건 추가 (가벼움) |
| ⑨~⑭ Zod·route·엔진 | **변경 없음** |

→ **14지점 중 실질 변경은 ⑤·⑧ 2개. 백엔드·엔진·anchor 영향 0**.

## 검증 방법 (E2E)

```bash
# 1. 타입·린트
npm run typecheck
npm run lint

# 2. 회귀 (anchor 변동 없음 — 백엔드 무변경)
npx vitest run __tests__/tax-engine/transfer-tax/general-building-extension-case-33.test.ts
npx vitest run __tests__/tax-engine/transfer-tax/general-building-case-31.test.ts
npx vitest run __tests__/tax-engine/transfer-tax/general-building-case-32.test.ts

# 3. 브라우저 수동 (UX 변경의 본 검증)
npm run dev
# /calc/transfer 진입 → 자산종류 "일반건물(토지+건물 일괄)" 선택
# ※ 라디오 4번째 옵션 "쌍방+일방 (증축 있음)" 표시 확인
# ※ 4번째 옵션 클릭 → useEstimatedAcquisition=true + gbHasExtension=true 자동 설정 확인
# ※ "취득가액(원)" 라벨이 "토지·건물 일괄 취득가액 (원)"으로 변경 확인
# ※ "양도비(원)" 필드 hint에 "토지·건물 일괄 필요경비 자동 안분" 표시 확인
# ※ 증축 5필드 입력 시 안분 미리보기 카드에 실시간 토지/건물1/건물2 값 표시 확인
# ※ 사례 33 입력값 전체로 산출세액 6,480,952 결과 동일 확인 (회귀 보장)

# 4. Playwright 자동 (기존 tests/playwright/case-33-extension.mjs 재실행)
node tests/playwright/case-33-extension.mjs
# 셀렉터를 4번째 라디오 옵션으로 변경 후 G-07·G-09·G-10·G-11 통과 확인
```

## 후속 PR 후보 (비스코프)

1. **acquisitionMethod 전체 RadioCardGroup 리팩터** — 현 button 기반 → `RadioCardGroup` 컴포넌트로 통일 (다른 자산도 영향 — 별도 작업)
2. **사례 31·32 시나리오도 라디오에 명시** — 현재 "환산취득가" 라벨만 — "사례 31 (전체 환산)"·"사례 32 (신축 5년 이내)" 등으로 세분화 (큰 변경, 별도 검토)
3. **양도비 필드 분리** — 일괄 필요경비 전용 필드 `bundledExpenses` 신설 + 양도비와 명확 분리 (현재 양도비 필드 이중 용도 — 14지점 영향)
4. **결과 화면 양도코리아 양식 매칭** — `BundledAllocationCard`에 양도코리아 PDF 표 구조 그대로 매핑

## DoD 자가 점검

- [ ] 라디오 4번째 옵션 표시 — `assetKind === "general_building"` 일 때만
- [ ] 4번째 옵션 클릭 시 3 boolean 자동 설정 (useEst=true·isAppr=false·gbHasExt=true)
- [ ] 다른 라디오 옵션 클릭 시 gbHasExtension=false 자동 reset (정합성 유지)
- [ ] 일괄 취득가·양도비 라벨·hint 동적 변경 확인
- [ ] 시나리오 가이드 카드 표시 (일반건물 자산 진입 시)
- [ ] 안분 미리보기 카드 — 5필드 모두 입력 시에만 표시 (불완전 입력 차단)
- [ ] `typecheck` 0건
- [ ] 사례 31·32·33 회귀 0건 (백엔드 무변경 → anchor 그대로 통과)
- [ ] 브라우저 수동 — 4번째 옵션 진입 → 사례 33 계산 → 6,480,952 표시
- [ ] Playwright 스크립트 — 4번째 옵션 selector로 G-07·G-09·G-10·G-11 자동 통과
- [ ] `ui-engine-sync-checker` — 14지점 누락 0 (실질 변경 ⑤·⑧만)
