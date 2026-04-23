# Step 3 기준시가 중복 제거 — 조건부 숨김

## Context

Step 1의 `CompanionAcqPurchaseBlock`이 최근 리팩터링으로 **취득시 기준시가 + 양도시 기준시가** 두 값을 모두 Vworld 조회·입력하도록 확장되었다. 그 결과 Step 3(`app/calc/transfer-tax/steps/Step3.tsx`, 화면 레이블 "2단계")의 **환산 공시가격 조회 블록**이 Step 1과 완전히 동일한 UI·데이터를 중복해서 제공한다.

목표: Step 3에서 해당 블록을 **조건부 숨김**하여 중복을 제거하되, Step 1이 비어 있는 경우(예: 소재지 미입력으로 조회 버튼 미노출)의 **fallback** 경로는 살려 둔다. Section C(취득가 산정방식 radio)는 `감정가액` 옵션 때문에 유지하며, 양방향 동기화(`useEstimatedAcquisition ↔ acquisitionMethod`)도 현재 방식을 보존한다.

## Scope

- **수정 1 파일**: `app/calc/transfer-tax/steps/Step3.tsx`
- 엔진(`lib/tax-engine/*`)·API 라우트·Zustand store 스키마·validate 로직은 **변경 없음**.
- 800줄 정책 영향 없음 (Step3는 현재 571줄 → 감소).

## Implementation

### 1. 조건부 숨김 로직 추가

`app/calc/transfer-tax/steps/Step3.tsx` 내 `isEstimated` 계산 직후, **Step 1이 이미 두 기준시가를 모두 채웠는지** 판정하는 flag를 도출한다.

```tsx
// 기존
const isEstimated = (form.acquisitionMethod || "actual") === "estimated" || primary.useEstimatedAcquisition;
const isAppraisal = form.acquisitionMethod === "appraisal";

// 추가
const hasBothStandardPrices =
  parseAmount(primary.standardPriceAtAcq) > 0 &&
  parseAmount(primary.standardPriceAtTransfer) > 0;
```

`parseAmount`는 이미 파일 상단에서 import 중 (`@/components/calc/inputs/CurrencyInput`).

### 2. Section D 조건부 렌더

기존 (Step3.tsx:342):
```tsx
{isEstimated && (
  <div className="space-y-4 rounded-lg border border-dashed border-primary/40 bg-primary/3 p-4">
    ...
```

변경:
```tsx
{isEstimated && !hasBothStandardPrices && (
  <div className="space-y-4 rounded-lg border border-dashed border-primary/40 bg-primary/3 p-4">
    <p className="text-xs font-medium text-primary">
      Step 1에서 기준시가가 입력되지 않았습니다 — 여기서 직접 조회·입력하거나 Step 1로 돌아가세요.
    </p>
    ... (기존 입력 필드 유지 — fallback)
```

fallback 안내 문구 한 줄을 기존 `환산취득가 = ...` 수식 문구 위에 추가하여, 사용자가 왜 이 블록이 보이는지(Step 1 미입력)를 알 수 있게 한다.

### 3. 완료 상태 요약 배너 (Section B 확장)

기존 안내 배너(Step3.tsx:292) 바로 아래에 `isEstimated && hasBothStandardPrices`일 때만 **읽기 전용 요약**을 표시.

```tsx
{isEstimated && hasBothStandardPrices && (
  <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20 px-4 py-3 space-y-1">
    <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">
      ✓ 환산취득가 기준시가 (Step 1에서 입력됨)
    </p>
    <p className="text-xs text-muted-foreground">
      취득 당시 {Number(primary.standardPriceAtAcq).toLocaleString()} 원
      {primary.standardPriceAtAcqLabel && ` · ${primary.standardPriceAtAcqLabel}`}
    </p>
    <p className="text-xs text-muted-foreground">
      양도 당시 {Number(primary.standardPriceAtTransfer).toLocaleString()} 원
      {primary.standardPriceAtTransferLabel && ` · ${primary.standardPriceAtTransferLabel}`}
    </p>
  </div>
)}
```

이렇게 하면 사용자는 Step 3에서도 자신이 입력한 값을 확인할 수 있고, 수정이 필요하면 이전 단계 버튼으로 Step 1로 돌아간다.

### 4. Auto-fetch useEffect 주의사항

Step3.tsx:252-266의 자동 조회 `useEffect` 두 개는 `primary.standardPriceAtAcq` / `standardPriceAtTransfer`가 이미 존재하면 **early-return**하도록 되어 있으므로(`if (primary.standardPriceAtAcq && ...label?.includes(acqYear)) return;`) **그대로 유지**한다. Step 1에서 채운 값이 Step 3에 진입할 때 덮어써지지 않는다.

다만 label 조건이 연도 포함 여부를 체크하므로, Step 1에서 설정한 label이 동일 포맷이라면 안전. 현재 CompanionAcqPurchaseBlock은 label을 설정하지 않으므로 (빈 문자열), label 조건이 true가 되어 재조회가 발생할 가능성이 있다 → **2번째 조건(`!hasBothStandardPrices`)을 early-return에 추가**:

```tsx
useEffect(() => {
  if (!primary.addressJibun || !primary.acquisitionDate) return;
  if (!primary.useEstimatedAcquisition) return;
  if (parseAmount(primary.standardPriceAtAcq) > 0) return; // ← 추가: 이미 값이 있으면 재조회 금지
  if (primary.standardPriceAtAcq && primary.standardPriceAtAcqLabel?.includes(acqYear)) return;
  fetchPriceForYear("acquisition", acqYear);
}, [...]);
```

(양도시에도 동일 처리)

## Critical Files

| 파일 | 작업 | 비고 |
|---|---|---|
| `app/calc/transfer-tax/steps/Step3.tsx` | 수정 | 4곳: flag 추가(268행 근처), Section B 하단 요약 배너 신설(297행 근처), Section D 조건 변경(342행), auto-fetch useEffect 2개 early-return 강화(252·260행) |

## 재사용 기존 유틸

- `parseAmount` — `components/calc/inputs/CurrencyInput.tsx` (이미 Step3에서 import 중)
- `Number.toLocaleString("ko-KR")` — 브라우저 내장

새 유틸 추가 없음.

## 변경하지 않는 것 (명시)

- Section C (tri-state radio) — 감정가액 선택용으로 유지
- Section E (감정가액 입력) — `isAppraisal`에서만 표시, 그대로
- Section F (Pre-1990 토지) — 그대로
- Section G (신축·증축) — 그대로
- `form.acquisitionMethod` ↔ `primary.useEstimatedAcquisition` 양방향 동기화 (Step3.tsx:322-328) — 현재 로직 유지
- API/validate/engine — 변경 없음
- Step1 (`CompanionAcqPurchaseBlock`) — 변경 없음

## Verification

1. **개발 서버 실행**
   ```bash
   npm run dev
   ```

2. **시나리오 A: Step 1에서 양쪽 기준시가 모두 입력**
   - Step 1 → 매매 → 환산취득가 선택 → 취득시·양도시 기준시가 각각 조회
   - Step 3 진입 → Section D 블록 사라짐·초록색 요약 배너 표시 확인
   - Section C radio "환산취득가액" 선택 상태 유지
   - Section E는 보이지 않음 (appraisal 아님)

3. **시나리오 B: Step 1 매매·실거래가 → Step 3에서 환산 전환**
   - Step 1 → 매매 → 실거래가 선택
   - Step 3 → Section C radio에서 "환산취득가액" 선택
   - Section D가 나타나는지 확인 (hasBothStandardPrices=false이므로 표시)
   - fallback 안내 문구 "Step 1에서 기준시가가 입력되지 않았습니다" 표시 확인
   - 여기서 조회 버튼으로 값 채우면 다음 렌더에서 요약 배너로 전환됨

4. **시나리오 C: 감정가액**
   - Step 3 → Section C에서 "감정가액" 선택
   - Section D 사라지고 Section E(감정가액 입력)만 표시

5. **시나리오 D: 다필지**
   - Step 1 → 토지 + 다필지 토글 ON → 필지 추가
   - Step 3 진입 → 다필지 UI만 표시 (Section B~G 전체 비노출, 기존 로직 유지)

6. **시나리오 E: 상속·증여**
   - Step 1 → 상속 / 증여 선택
   - Step 3 Section C는 그대로 표시되지만 `useEstimatedAcquisition`은 false이므로 D 비노출
   - Section F(Pre-1990)·G(신축·증축)는 자산 종류 조건에 따라 표시

7. **회귀 테스트**
   ```bash
   npx vitest run __tests__/tax-engine/
   ```
   — UI 전용 변경이므로 엔진 테스트(1,407개) 전부 통과 유지.

8. **린트**
   ```bash
   npm run lint
   ```
