# 계획서: PHD 모드 토지 면적 입력 필드 추가

## Context

**문제**: 개별주택가격 미공시 취득 환산(§164⑤) 모드를 활성화하면 토지기준시가 계산에 `면적(㎡)`이 반드시 필요하다. 공식은 `토지기준시가 = 단위공시지가(원/㎡) × 면적(㎡)`. 그런데 housing 자산에서 면적 입력 필드가 완전히 없다.

**왜 없나**: `CompanionAssetCard.tsx` line ~198에 `{asset.assetKind === "land" && ...}` 조건이 있어 면적 입력 전체 섹션이 토지 전용으로 잠겨 있다. Housing 자산은 통상 면적이 필요 없지만, PHD(§164⑤) 모드에서는 필수가 된다.

**현 상태**: `PreHousingDisclosureSection`이 "토지 면적 — 읽기 전용"으로 `asset.acquisitionArea`를 표시하지만, housing 자산은 이 필드를 채울 방법이 UI에 없다. "자산 기본 정보에서 입력해 주세요" 경고가 표시되지만 실행 불가능한 지시다.

**결과**: 면적 = 0으로 전송 → `Sum_A`, `Sum_F`, `Sum_T` 모두 0 → 토지기준시가 0 → 계산 왜곡 (조용한 버그).

---

## 해결 방법

`PreHousingDisclosureSection.tsx`의 "토지 면적" 행을 **조건부 편집 가능**으로 변경.

- `asset.acquisitionArea`가 이미 채워져 있으면 → 기존처럼 읽기 전용 표시
- `asset.acquisitionArea`가 비어있으면 → 직접 입력할 수 있는 숫자 필드 노출, `onChange({ acquisitionArea: value })` 호출

이 방식이 가장 침습도가 낮다. `CompanionAssetCard`에는 손대지 않고, 이미 있는 `onChange: (patch: Partial<AssetForm>) => void` prop을 이용한다.

---

## 수정 파일

| 파일 | 변경 내용 |
|---|---|
| `components/calc/transfer/PreHousingDisclosureSection.tsx` | "토지 면적" 섹션을 조건부 편집 가능으로 전환 |

### 변경 상세 (`PreHousingDisclosureSection.tsx`)

현재 `areaDisplay` 상수와 읽기 전용 `<div>` 블록을 아래 로직으로 교체:

```tsx
{/* ④ 토지 면적 */}
{asset.acquisitionArea ? (
  // 기본 정보에 이미 면적이 있으면 읽기 전용 표시 (기존 동작 유지)
  <div className="rounded-md border border-dashed border-border bg-muted/20 px-4 py-3">
    <div className="flex items-center justify-between">
      <span className="text-sm font-medium">토지 면적</span>
      <span className="text-sm tabular-nums">{asset.acquisitionArea} ㎡</span>
    </div>
    <p className="mt-1 text-xs text-muted-foreground">
      자산 기본 정보의 취득 면적을 사용합니다.
    </p>
  </div>
) : (
  // 주택 자산에서는 면적 필드가 없으므로 여기서 직접 입력
  <FieldCard
    label="토지 면적 (㎡)"
    hint="공시지가(원/㎡) × 면적으로 기준시가 계산"
    warning="필수 — 미입력 시 토지기준시가를 계산할 수 없습니다."
  >
    <input
      type="number"
      min="0"
      step="0.01"
      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      placeholder="예: 212"
      value={asset.acquisitionArea}
      onChange={(e) => onChange({ acquisitionArea: e.target.value })}
    />
  </FieldCard>
)}
```

`input`에 `onFocus` 불필요 — `SelectOnFocusProvider`가 전역 처리.

---

## 추가 고려사항

### 기존 읽기 전용 → 편집 가능 전환 시 이슈 없음
- `acquisitionArea`는 이미 `AssetForm`에 존재하는 필드 (`lib/stores/calc-wizard-asset.ts`)
- `onChange` prop은 `Partial<AssetForm>`을 받으므로 추가 타입 변경 불필요
- API 변환(`lib/calc/transfer-tax-api.ts`)은 이미 `landArea: parseFloat(primary.acquisitionArea) || 0`으로 처리
- 검증(`lib/calc/transfer-tax-validate.ts`)의 PHD 블록은 이미 `acquisitionArea <= 0`을 검증

### 영향 범위
- 수정 파일 1개, 비침습적
- housing 자산에서 `acquisitionArea`가 이미 채워진 경우 동작 변화 없음

---

## 검증

```bash
npx tsc --noEmit       # 컴파일 오류 없어야 함
npm test               # 1,586개 테스트 회귀 없어야 함
```

UI 수동 검증:
1. 주택 자산 + 취득일 분리 + 환산취득가 + PHD 체크
2. "토지 면적" 행에 숫자 입력 가능한지 확인
3. 면적 입력 후 PreHousingDisclosurePreviewCard에서 Sum_A 등 중간값이 올바르게 변하는지 확인
4. 기존에 `acquisitionArea` 있는 자산에서 읽기 전용으로 남는지 확인
