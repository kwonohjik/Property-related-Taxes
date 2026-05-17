# 재개발 실가 모드 — 인가전 분 종전 주택 취득가액 입력란 신설

## Context

**문제**: 직전 PR(C안)에서 `assetKind === "redevelopment_apt"`일 때 상단 일반 "취득가액 산정 방식·취득가액" 입력 영역을 모두 숨겼다. 이 결정으로 환산 모드(사례 44) 사용자 혼동은 해소되었으나, **실가 모드 인가전 분 종전 주택 취득가**(사례 45 = 450,000,000 / 사례 46 = 400,000,000)를 브라우저 UI에서 입력할 위치가 사라졌다.

엔진(`redevelopment-split.ts`)은 `useEstimatedAcquisition === false` 시 `input.actualAcquisitionPrice ?? 0`를 사용하고, 단위 테스트는 이를 fixture에 직접 주입하므로 anchor 자체는 정상 작동한다. 그러나 실제 사용자가 브라우저에서 사례 45/46 시나리오를 재현하면 인가전 분 취득가 = 0으로 계산되어 비정상적인 큰 양도차익이 산출된다.

**사용자 요청**: 후속 PR로 §166 섹션 내부에 실가 모드 인가전 분 종전 취득가 입력란 추가.

**해결**: AssetForm에 신규 필드 `redevActualAcquisitionPrice` 추가 → `RedevelopmentBlock` §166 섹션 내부에 환산 토글 OFF일 때만 노출되는 sky tone 입력 카드 → `buildRedevelopmentPayload`에서 엔진 `actualAcquisitionPrice`로 매핑 → validate에서 실가 모드 필수 검증 → 사례 45/46 fixture를 OrchestratorInput 직주입에서 RedevelopmentInfo 필드로 마이그레이션.

## 산식 매핑

```
재개발 인가전 분 양도차익 (§166①1호 + §166⑤2호나목):
  실가 모드: oldAcquisitionPrice = redevActualAcquisitionPrice  (사용자 입력)
  환산 모드: oldAcquisitionPrice = computeRedevelopmentValuation(...)  (§166③ + §164⑦)

인가전 양도차익 = 권리가액 − oldAcquisitionPrice − estimatedLumpDeduction − preApprovalExpenses

  ※ estimatedLumpDeduction은 환산 모드만 (§163⑥). 실가 모드 0.
```

## 입력 필드 정의 (AssetForm)

### 신설
- `redevActualAcquisitionPrice: string` — 인가전 분 종전 주택 취득가 (실거래가, 원)
  - 환산 모드 시 무시 (validate skip)
  - 실가 모드 시 필수

### 기존 redev* 필드는 변경 없음

## UI 변경 (`components/calc/transfer/RedevelopmentBlock.tsx`)

### 배치
④ 재개발 일정·금액 카드(violet) 직후, ⑤ 환산 기준시가 ToggleCard(rose) 직전에 신규 sky tone 카드 추가. 조건: `!asset.useEstimatedAcquisition` (환산 토글 OFF 시만 표시).

```tsx
{/* 인가전 분 종전 주택 취득가 (실가 모드) — 환산 토글 OFF 시 활성 */}
{!asset.useEstimatedAcquisition && (
  <div className="rounded-lg border border-sky-200 bg-sky-50/40 p-3 space-y-2">
    <div className="flex items-center gap-2">
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-sky-200 text-[10px] font-bold text-sky-800 select-none">5</span>
      <p className="text-xs font-semibold text-sky-700">인가전 분 종전 주택 취득가액 (실가 모드)</p>
    </div>
    <FieldCard
      label="실거래가 취득가액"
      hint="재개발 관리처분 인가 전 종전 주택의 실거래가 (§166①1호 인가전 분 차감 기준).
            취득가액을 확인할 수 없으면 아래 환산취득가 토글을 ON으로 전환하세요."
    >
      <CurrencyInput
        label=""
        value={asset.redevActualAcquisitionPrice}
        onChange={(v) => onChange({ redevActualAcquisitionPrice: v })}
        hideUnit
      />
    </FieldCard>
  </div>
)}
```

### 환산 토글 라벨 명확화
⑤ ToggleCard 헤더 description을 보완: "취득가액 확인 불가 시 §166③ + §164⑦ 본문 기준시가 비율로 환산 (실가 모드와 상호 배타)".

### 섹션 번호 재정렬
- ④ 일정·금액 (violet)
- ⑤ 실가 인가전 취득가 (sky, 조건부) — 환산 OFF 시만
- ⑥ 환산 기준시가 (rose) — 환산 ON 시 펼침

## Files to Modify

### Store
- `lib/stores/calc-wizard-asset-redev.ts` — `redevActualAcquisitionPrice: string` 신규 필드 추가
- `lib/stores/calc-wizard-asset-factory.ts` — initial value (`""`) + normalize fallback (`if (a.redevActualAcquisitionPrice === undefined) a.redevActualAcquisitionPrice = ""`)

### UI
- `components/calc/transfer/RedevelopmentBlock.tsx` — sky tone 신규 입력 카드 (조건부 표시) + ⑤ ToggleCard 번호/설명 보완

### API
- `lib/calc/transfer-tax-api-helpers.ts` `buildRedevelopmentPayload()` — `actualAcquisitionPrice: asset.redevActualAcquisitionPrice ? parseAmount(asset.redevActualAcquisitionPrice) : undefined` 추가

  ※ 주의: 현재 `RedevelopmentInfo` 타입에는 `actualAcquisitionPrice` 필드가 없을 수 있음. `RedevelopmentOrchestratorInput`만 가짐. payload 매핑은 RedevelopmentInfo가 아닌 OrchestratorInput으로 전달되는 경로 확인 필요. 만약 RedevelopmentInfo에 없다면 타입 확장 또는 별도 경로로 전달.

### Validate
- `lib/calc/transfer-tax-validate-redev.ts` — 실가 모드 분기에서 `redevActualAcquisitionPrice` 필수 검증 추가:
  ```ts
  if (!asset.useEstimatedAcquisition) {
    if (parseAmount(asset.redevActualAcquisitionPrice) <= 0) {
      return `${label}: 실가 모드 — 인가전 분 종전 주택 취득가액(실거래가)을 입력하세요. (§166①1호)`;
    }
  }
  ```

### Zod 스키마
- `lib/api/transfer-tax-schema.ts` `redevelopment` 객체 — 필요 시 `actualAcquisitionPrice: z.number().int().nonnegative().optional()` 추가 (현재 전달 경로 확인 후 결정)

### 테스트
- `__tests__/tax-engine/transfer-tax/redevelopment/_helpers.ts` 사례 45/46 fixture:
  - 기존: `actualAcquisitionPrice: 450_000_000` (OrchestratorInput 직주입)
  - 변경: `RedevelopmentInfo`에 신규 필드 추가 또는 현 구조 유지 + UI 통합 테스트 별도
- UI 단위 테스트: `RedevelopmentBlock` 환산 OFF 시 sky 카드 표시 + onChange 호출 검증

## 데이터 흐름 경로 확인 필요

### 경로 1: AssetForm → buildRedevelopmentPayload → RedevelopmentInfo
- `RedevelopmentInfo` 타입(`lib/tax-engine/types/transfer-redevelopment.types.ts`)에 `actualAcquisitionPrice?: number` 추가 필요 여부 확인
- 없으면 추가, 있으면 매핑만

### 경로 2: AssetForm → callTransferTaxAPI body → Route handler → RedevelopmentOrchestratorInput
- Route handler에서 `actualAcquisitionPrice`를 어떻게 전달하는지 확인
- 현재 단위 테스트는 OrchestratorInput에 직접 주입하지만, 실제 브라우저 흐름은 Route를 거침
- `app/api/calc/transfer/route.ts` 라인 398 부근 `data.redevelopment` spread 확인

## Reuse — 기존 함수/패턴

| 자산 | 경로 | 적용 |
|---|---|---|
| `RedevelopmentSplitInput.actualAcquisitionPrice` | `lib/tax-engine/redevelopment-split.ts:66` | 이미 정의 — 엔진 변경 0 |
| 환산/실가 토글 UI 패턴 (CompanionAcqPurchaseBlock 라디오) | 직전 PR | 동일 컬러 토큰·간격 차용 |
| `FieldCard` + `CurrencyInput` | `components/calc/inputs/` | 표준 입력 UI |
| 14지점 동기화 체크리스트 | `feedback_api_zod_schema_sync.md` | 8 클라이언트 + 6 API/Route 모두 점검 |

## 14개 동기화 지점 체크리스트

- [ ] ① 폼 상태 타입: `redevActualAcquisitionPrice` 추가
- [ ] ② initial value: factory `""`
- [ ] ③ normalize: undefined → "" fallback
- [ ] ④ API 변환: buildRedevelopmentPayload 매핑
- [ ] ⑤ UI 위젯: RedevelopmentBlock sky 카드 (조건부)
- [ ] ⑥ 사이드바 합계: 영향 없음 (재개발 미반영 정책)
- [ ] ⑦ 결과 카드 산식: 영향 없음 (이미 oldAcquisitionPrice가 분할별 표시됨)
- [ ] ⑧ Validation: 실가 모드 시 필수 검증
- [ ] ⑨~⑩ Zod enum/객체: `redevelopment.actualAcquisitionPrice` 또는 `redevActualAcquisitionPrice` 명시 (경로 확인 후 결정)
- [ ] ⑪ acquisitionDate fallback: 영향 없음
- [ ] ⑫ Zod 입력 객체 정의: 신설 필드 명시 (경로 확인 후)
- [ ] ⑬ callTransferTaxAPI body spread: buildRedevelopmentPayload에서 자동
- [ ] ⑭ Route handler 엔진 매핑: Date 변환 외 변경 없음 (number 필드 spread 자동)

## 회귀 영향

- 단위 테스트 anchor (사례 45/46): OrchestratorInput 직주입 fixture는 마이그레이션. 산출 결과(인가전 분 양도차익·LTHD·산출세액·지방세) 보존 필수.
- 환산 모드 사용자(사례 44): 변경 없음 — sky 카드는 환산 OFF 시만 표시되므로 비노출.
- 다른 자산 종류(housing·land·building·general_building·commercial_building): assetKind 비교로 분기 격리 — 무영향.
- 14지점 sync 영향 최소화: 입력 측 6지점 + Route 변동 가능성.

## Verification

1. **타입 안전**:
   ```
   npx tsc --noEmit
   ```
   - 0건

2. **단위 회귀 (재개발)**:
   ```
   npx vitest run __tests__/tax-engine/transfer-tax/redevelopment/
   ```
   - 사례 44(환산) 환산취득가 141,221,534 / 산출세액 56,799,409 / 지방세 5,679,940 보존
   - 사례 45(실가+납부+1세대1주택): 안분 결과 보존
   - 사례 46(실가+수령): 안분 결과 보존
   - PHD 본문 발동 anchor 7개 보존

3. **양도세 전체 회귀**:
   ```
   npx vitest run __tests__/tax-engine/transfer-tax/
   ```
   - 1,067개 이상 anchor 통과

4. **브라우저 수동 확인**:
   - 사례 45 입력 시나리오:
     1. 자산 종류 = 재개발/재건축 APT
     2. 양도가액 1,500,000,000, 양도일 2023-02-16, 취득일 2007-04-09
     3. 매매, 환산취득가 토글 OFF
     4. ⑤ sky 카드 노출 확인 → 실거래가 450,000,000 입력
     5. ④ 재개발 일정·금액: 권리가액 650,000,000 / 청산금 납부 300,000,000 / 인가일 2013-10-23
     6. 1세대1주택 + 거주 5년 6월 입력
     7. 결과 화면 산출세액·지방세가 사례 45 anchor와 일치
   - 사례 46 (수령) 동일하게 검증
   - 환산 모드(사례 44): 토글 ON 후 sky 카드 비노출 확인

5. **UI 통합 테스트** (선택):
   ```
   npx vitest run __tests__/components/calc/transfer/RedevelopmentBlock.test.tsx
   ```
   - 환산 OFF → sky 카드 보임 / 환산 ON → 숨김
   - CurrencyInput onChange가 onChange({ redevActualAcquisitionPrice: ... }) 호출 검증

## Notes / Caveats

- **데이터 흐름 경로 확정 우선**: 본 작업 Phase 0으로 `RedevelopmentInfo` 타입에 `actualAcquisitionPrice` 필드가 있는지 확인하고, 없으면 추가. 있으면 payload 매핑만. 이는 ④⑨⑫ 동기화 범위를 결정.
- **사례 45/46 fixture 마이그레이션 부담 평가**: fixture가 OrchestratorInput에 `actualAcquisitionPrice`를 직접 주입하는 현 구조를 유지하면 anchor 회귀 0. UI 입력으로 변환은 통합 테스트가 따로 잡힐 때 처리.
- **환산 ↔ 실가 토글 전환 시 데이터 보존**: useEffect 미러링 금지 정책 준수 — 토글 OFF로 전환 후 다시 ON 했다가 OFF 했을 때 `redevActualAcquisitionPrice` 입력값이 보존되어야 함. 별도 store reset 로직 금지.
- **빈 자산 카드 첫 진입 사용자 가이드**: 환산 OFF가 기본값이므로 첫 진입 시 sky 카드가 즉시 노출. hint에 "환산이 가능하면 토글 ON으로 §164⑦ 입력으로 전환" 안내 명시.
- **부담부증여와 mutually exclusive**: `transferType === "burdened_gift"` + `assetKind === "redevelopment_apt"` 조합은 현재 미지원 정책 (직전 PR D-0-2 결정). 본 PR 범위 외.
