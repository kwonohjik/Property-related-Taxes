# Phase 3 — 6세목 확장 계획서

> 작성: 2026-05-21
> 선행: [history-dedup-and-manual-save-unification.plan.md (v2)](./history-dedup-and-manual-save-unification.plan.md) §3 Phase 3
> 대상: 증여세를 제외한 6대 세목(양도·주식양도·상속·취득·재산·종부) 모두에 수동 저장 + 토스트 UX 통합
> 인프라: Phase 1·2에서 완성한 `saveOrUpdateByContent` + `SaveToast` + `SaveButton`(disabled 가드) 재사용

---

## 1. 배경

Phase 2에서 증여세(`GiftTaxForm`)에 적용 완료된 표준 패턴:
- 헤더(홈으로 ↔ 초기화 사이) `SaveButton`(outline) + 결과 미계산 시 disabled
- 하단 내비게이션 우측 `SaveButton`(primary) + 결과 미계산 시 disabled
- 결과 화면(PDF 옆 / 하단 끝) `SaveButton` 2개
- 자동저장 토스트 1회 + 수동저장 토스트(신규/갱신/실패 3분기)
- `useAutoSaveCalculation` v2 `saveOrUpdateByContent` 사용 — dedup 자동 보장
- sibling 헬퍼 `{tax}-save-handler.ts`로 800줄 정책 회피

Phase 3에서 동일 패턴을 6세목에 확장. **엔진/계산 로직 변경 없음, UI/UX만 동기화.**

## 2. 세목별 현황·작업량 인벤토리

| # | 세목 | UI 진입점 | 현재 SaveButton | 현재 자동저장 | 현재 토스트 | 작업 강도 |
|---|---|---|---|---|---|---|
| 1 | 양도세 | `app/calc/transfer-tax/TransferTaxCalculator.tsx` (707줄) | ❌ | ✅ v2 통합됨 | ❌ | M |
| 2 | 주식 양도세 | `app/calc/stock-transfer-tax/StockTransferTaxCalculator.tsx` (224줄) | ❌ | ✅ v2 통합됨 | ❌ | S |
| 3 | 상속세 | `components/calc/InheritanceTaxForm.tsx` (353줄) | ❌ | ✅ v2 통합됨 | ❌ | S |
| 4 | 취득세 | `components/calc/AcquisitionTaxForm.tsx` (352줄) | ❌ | ✅ v2 통합됨 | ❌ | S |
| 5 | 재산세 | `components/calc/PropertyTaxForm.tsx` (229줄) | ❌ | ✅ v2 통합됨 | ❌ | S |
| 6 | 종부세 | `app/calc/comprehensive-tax/page.tsx` (722줄, 단일 파일) | ❌ | ✅ v2 통합됨 | ❌ | M |

작업 강도: **S(Small)** ≈ 0.2d / **M(Medium)** ≈ 0.35d / 합계 ~1.6d.

## 3. 표준 통합 절차 (세목당 6 단계)

증여세 적용 사례(`docs/00-pm/history-dedup-and-manual-save-unification.plan.md` §3 Phase 2)와 동일.

### 3.1. 공통 헬퍼 분리 (sibling module — 800줄 정책)

각 세목별로 `{tax}-save-handler.ts` 신규:

```typescript
// 패턴 (예: transfer)
export async function runTransferManualSave({
  formData, result, clientId,
}): Promise<{ id: string; created: boolean }> {
  if (!result) throw new Error(NO_RESULT_SENTINEL);
  return calculationRepository.saveOrUpdateByContent({
    taxType: "transfer",
    title: generateTitle("transfer", inputData, now),
    inputData: formData,
    resultData: result,
    taxLawVersion: formData.transferDate || now.split("T")[0],
    linkedCalculationId: null,
    clientId,
  });
}

export function formatTransferSaveMessage(outcome): SaveToastMessage { /* 동일 */ }
```

### 3.2. useAutoSaveCalculation 반환값 활용

```typescript
const autoSave = useAutoSaveCalculation({ ... });

const autoSaveToast: SaveToastMessage | null =
  autoSave.status === "saved" && autoSave.savedId
    ? { kind: "success", text: `✓ 이력에 자동 저장되었습니다 (ID: ${autoSave.savedId.slice(0,8)})` }
    : autoSave.status === "error"
    ? { kind: "error", text: "자동 저장 실패 — 우상단 저장하기 버튼으로 재시도하세요." }
    : null;
```

### 3.3. 헤더 SaveButton (outline)

```tsx
<HomeButton ... />
<SaveButton
  onSave={handleManualSaveForForm}
  disabled={!result}
  disabledReason="결과를 먼저 계산하시면 자동으로 이력에 저장됩니다."
/>
<ResetButton ... />
```

### 3.4. 하단 SaveButton (primary)

```tsx
<button>이전</button>
<button>다음 / 계산하기</button>
<SaveButton
  variant="primary"
  onSave={handleManualSaveForForm}
  disabled={!result}
  disabledReason="결과를 먼저 계산하시면 자동으로 이력에 저장됩니다."
/>
```

### 3.5. 결과 화면 SaveButton 2개

| 위치 | variant |
|---|---|
| PDF/인쇄 버튼 옆 | `outline` |
| 하단 내비(처음으로/다시계산 옆) | `primary` |

### 3.6. SaveToast 1개 (전역 fixed)

```tsx
<SaveToast message={saveMessage} onClose={() => setSaveMessage(null)} />
```

결과 화면 마운트 시 `autoSaveToast`가 `saveMessage`로 자동 흘러 들어가도록 `useEffect` 1회.

---

## 4. 세목별 특이사항·주의점

### 4.1. 양도세 (transfer)

- **분할 lot 모드(`multi`) 별도 라우트** — `app/calc/transfer-tax/multi/page.tsx`. 단건과 다중을 모두 커버해야 함. 우선은 단건만 적용하고 multi는 후속 PR.
- `TransferTaxResultView`는 단건/다중 분기 결과 컴포넌트가 따로 있음 — `result.mode === "single"` 분기에만 SaveButton 추가.
- `TransferTaxCalculator.tsx` 707줄 — sibling 분리 시 거의 800줄 도달. handler 분리 + 헤더/하단 SaveButton 추가는 +20줄 미만.

### 4.2. 주식 양도세 (stock-transfer)

- Steps 별도 디렉터리(`steps/`) — Step4가 결과 화면 역할. `Step4` 내부 또는 Calculator 본체에 SaveButton 배치 결정 필요.
- 권장: Step4가 결과 화면이므로 SaveButton 2개는 Step4에 배치. 헤더/하단은 Calculator 본체.
- ProfessionalClientGate 사용 — 의뢰인 선택 게이트 통과 후 진입.

### 4.3. 상속세 (inheritance)

- `InheritanceTaxForm.tsx` — 353줄, 단일 파일. 결과 화면도 본체 내 분기로 추정.
- 사망일(`deathDate`) 기준 taxLawVersion 사용.
- ProfessionalClientGate 사용.

### 4.4. 취득세 (acquisition)

- `AcquisitionTaxForm.tsx` — 352줄.
- `targetDate`(취득일) 기준 taxLawVersion.
- 회귀 위험 적음 — 가장 단순 구조.

### 4.5. 재산세 (property)

- `PropertyTaxForm.tsx` — 229줄, 최소 크기.
- `targetDate`/`assessmentYear` 기준 taxLawVersion.
- 종부세 연동: 재산세 record가 종부세 입력 prefill에 쓰일 수 있음 — `linkedCalculationId` 흐름 보존 검증 필요.

### 4.6. 종부세 (comprehensive)

- `app/calc/comprehensive-tax/page.tsx` 722줄 단일 파일 — 800줄 임계. **헬퍼 분리 + handler 추가 시 800줄 초과 위험.**
- 우선 `comprehensive-tax-save-handler.ts` 분리 + 결과 화면 분기에 SaveButton 추가. 본 파일 +30줄 → 752줄 예상. 800줄 정책 내.
- 본 파일이 800줄 정책 위반 임박 시 `ComprehensiveTaxPage`를 별도 컴포넌트 디렉터리로 추출하는 **별개 PR로 분리** (Phase 3 범위 외).
- `assessmentYear`(과세연도) 기준 taxLawVersion.
- 종부세는 history "수정" 시 결과 화면이 `currentStep === STEPS.length`(=5)로 표시되는 특이 구조 — 자동저장 hook의 `resultData` 트리거 조건 그대로 사용.

---

## 5. 작업 항목 (세목별 6 batch)

### Phase 3-1. 양도세 (M, 0.35d)

- [ ] `lib/calc/transfer-save-handler.ts` 신규 (`runTransferManualSave` + `formatTransferSaveMessage`)
- [ ] `TransferTaxCalculator.tsx`:
  - [ ] `useAutoSaveCalculation` 반환값 캡처 + `autoSaveToast` 변환
  - [ ] `handleManualSave` + `handleManualSaveForForm` 추가
  - [ ] 헤더 SaveButton 추가 (HomeButton ↔ ResetButton 사이)
  - [ ] 하단 SaveButton(primary) 추가
- [ ] `TransferTaxResultView.tsx`:
  - [ ] `onSave?: () => Promise<{id, created}>` + `autoSaveToast?: SaveToastMessage | null` props 추가
  - [ ] PDF 옆 SaveButton + 하단 SaveButton 추가
  - [ ] SaveToast 통합
- [ ] 회귀: `npx tsc --noEmit` 0건, 양도세 vitest 전체 통과

### Phase 3-2. 주식 양도세 (S, 0.25d)

- [ ] `lib/calc/stock-transfer-save-handler.ts` 신규
- [ ] `StockTransferTaxCalculator.tsx` 헤더/하단 SaveButton + autoSaveToast
- [ ] `steps/Step4.tsx` (결과 화면) SaveButton 2개 + SaveToast
- [ ] 회귀: kiwoom anchor 보존, stock-transfer vitest 전체 통과

### Phase 3-3. 상속세 (S, 0.2d)

- [ ] `components/calc/inheritance-tax-save-handler.ts` 신규
- [ ] `InheritanceTaxForm.tsx` 헤더/하단 SaveButton + autoSaveToast
- [ ] `InheritanceTaxResultView.tsx`(있는 경우) 결과 SaveButton 2개 + SaveToast
- [ ] 회귀: inheritance vitest 전체 통과

### Phase 3-4. 취득세 (S, 0.2d)

- [ ] `components/calc/acquisition-tax-save-handler.ts` 신규
- [ ] `AcquisitionTaxForm.tsx` 동상
- [ ] 결과 화면 동상
- [ ] 회귀: acquisition vitest 전체 통과

### Phase 3-5. 재산세 (S, 0.2d)

- [ ] `components/calc/property-tax-save-handler.ts` 신규
- [ ] `PropertyTaxForm.tsx` 동상
- [ ] 결과 화면 동상
- [ ] **재산세 → 종부세 linkedCalculationId 연동 회귀** — record 1건 dedup 통과 후에도 prefill 흐름 보존 검증

### Phase 3-6. 종부세 (M, 0.35d)

- [ ] `lib/calc/comprehensive-save-handler.ts` 신규
- [ ] `app/calc/comprehensive-tax/page.tsx` 800줄 정책 내 작업 (현재 722줄, 작업 후 752줄 예상)
  - [ ] 800줄 초과 시 즉시 `ComprehensiveTaxCalculator.tsx`로 추출 (별개 PR)
- [ ] `ComprehensiveTaxResultView.tsx` 결과 화면 SaveButton 2개
- [ ] 회귀: 종부세 84 케이스 anchor 100% 보존

### Phase 3-7. 통합 검증 (0.3d)

- [ ] Playwright 스크립트 확장 — `scripts/playwright-verify-history-dedup-all-tax.mjs`
  - 증여세 + 신규 6세목 = 7세목 모두에서 §1.2 시나리오 1~4 검증
  - 자동저장 토스트 표시 확인
  - 수동저장 토스트 신규/갱신 분기 확인
  - `/history`에서 세목당 record 1건 검증
- [ ] 전체 `npx tsc --noEmit` 0건
- [ ] 전체 `npx vitest run` 회귀 0건
- [ ] 800줄 정책 모든 파일 통과

---

## 6. 표준 산출물

세목당 평균:
- 신규 sibling 파일 1개 (`{tax}-save-handler.ts`, ~70줄)
- Calculator/Form 본체 변경 ~30줄
- ResultView 변경 ~25줄
- 신규 anchor 시나리오 4개 (Playwright)

전체 산출물 합계:
- 신규 파일 6개 (~420줄)
- 수정 파일 12개 (~330줄)
- Playwright 시나리오 24개

## 7. 위험·트레이드오프

| 위험 | 영향 | 완화 |
|---|---|---|
| 종부세 800줄 정책 위반 | 종부세 1세트 PR 차단 | Phase 3-6 진입 전 본 파일 줄수 측정 → 임계 시 추출 별개 PR 우선 |
| 양도세 multi(분할 lot) 미적용 | 분할 lot 사용자만 수동저장 불가 | Phase 3 범위 외 — multi 별도 PR 명시 |
| 재산세↔종부세 linkedCalculationId 회귀 | 종부세 prefill 깨짐 | Phase 3-5 회귀 시 종부세 prefill 케이스 1건 anchor |
| `useAutoSaveCalculation` 반환 시그니처 추가로 인한 타 호출자 영향 | TypeScript catch 가능 | Phase 2에서 이미 transfer·stock-transfer는 부분 정리됨 — typecheck 우선 통과 검증 |
| 세목별 generateTitle 동작 차이 | record title 불일치 | `lib/storage/title-generator.ts`는 6세목 모두 분기 구현되어 있음 — 회귀 없음 |
| Playwright 7세목 시나리오 작성 시간 폭증 | Phase 3-7 일정 초과 | 헬퍼 함수 추출(`drive세목별`) — 본문 50줄 내 반복 |

## 8. Definition of Done

- [ ] 6세목 모두 헤더 SaveButton + 하단 SaveButton + 결과 SaveButton 2개 추가
- [ ] 6세목 모두 자동저장 토스트 1회 노출
- [ ] 6세목 모두 수동저장 토스트 신규/갱신/미계산/실패 4분기 문구
- [ ] 6세목 모두 미계산 시 SaveButton disabled + tooltip
- [ ] `lib/storage/saveOrUpdateByContent` 단일 진입점 사용 — `save()` 직접 호출 0건
- [ ] 800줄 정책 모든 파일 준수
- [ ] `npx tsc --noEmit` 0건
- [ ] `npx vitest run` 회귀 0건 (현재 4098 → +0 회귀)
- [ ] Playwright 7세목(증여+6) 시나리오 1~4 PASS 24/24
- [ ] memory `feedback-save-button-pattern` 신규 — Phase 3 패턴 표준화

## 9. 작업 순서

권장: **S → M → 종부세 마지막** (위험 분리)

1. Phase 3-5 재산세 (가장 단순, 229줄)
2. Phase 3-4 취득세
3. Phase 3-3 상속세
4. Phase 3-2 주식 양도세
5. Phase 3-1 양도세
6. Phase 3-6 종부세 (800줄 위험 — 마지막)
7. Phase 3-7 통합 검증 Playwright

## 10. 후속 (Phase 3 범위 외)

- 양도세 multi(분할 lot) 라우트 SaveButton 적용 — 별개 PR
- `useManualSave(taxType)` 훅 추출로 6세목 헬퍼 통합 (DRY) — 별개 PR
- `/history` 페이지 "동일 입력 그룹화" 토글
- 200건 상한 도달 사용자 알림
- 자동저장 토스트 사용자 설정 (`설정 > 알림 > 자동저장 토스트 표시`)
