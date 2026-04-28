# Plan: 상속 취득가액 의제 특례 — 상속개시일 중복 숨김 + 자동 활성화

## Context

현재 취득원인 = "상속" 선택 시 화면에 **상속개시일이 두 번** 표시되는 문제가 있다.

- **위쪽 (CompanionAcqInheritanceBlock)**: `asset.acquisitionDate` 필드 → "상속개시일" 입력
- **아래쪽 (InheritedAcquisitionDeemedSection)**: `asset.inheritanceStartDate` 필드 → "상속개시일" 입력 (또 다시)

두 필드는 논리적으로 **동일한 값**이므로 사용자가 같은 날짜를 두 번 입력해야 하는 UX 문제가 있다.

또한 위쪽에 상속개시일(1985.1.1. 이전)이 이미 입력되어 있어도 아래쪽 의제 특례 섹션은 자동으로 활성화되지 않았다. 별도로 `inheritanceStartDate`를 입력해야 했다.

**목표**:
1. 위쪽 상속개시일(`acquisitionDate`) → 아래쪽 `inheritanceStartDate` 자동 동기화
2. 의제 특례 섹션 내부의 중복 상속개시일 DateInput 숨김
3. 위쪽 상속개시일이 1985.1.1. 전이면 의제 특례 섹션이 자동 활성화(pre-deemed 모드)

---

## 변경 파일

### 1. `components/calc/transfer/CompanionAssetCard.tsx`
- 위치: `acquisitionCause === "inheritance"` 블록 내 `onAcquisitionDateChange` 핸들러 (줄 430~435)
- **변경**: `inheritanceStartDate: v` 동기화 추가

```ts
// Before
onAcquisitionDateChange={(v) => onChange({
  acquisitionDate: v,
  ...(asset.inheritanceValuationMode === "auto" ? { inheritanceDate: v } : {}),
})}

// After
onAcquisitionDateChange={(v) => onChange({
  acquisitionDate: v,
  inheritanceStartDate: v,   // ← 신규 추가: 의제 특례 섹션 자동 동기화
  ...(asset.inheritanceValuationMode === "auto" ? { inheritanceDate: v } : {}),
})}
```

### 2. `components/calc/transfer/InheritedAcquisitionDeemedSection.tsx`

#### 2-A. `computeMode()` 호출에서 fallback 추가
- 위치: 줄 43 `const mode = ...`
- **변경**: `inheritanceStartDate`가 없으면 `acquisitionDate`로 fallback

```ts
// Before
const mode = asset.inheritanceMode ?? computeMode(asset.inheritanceStartDate);

// After
const mode = asset.inheritanceMode
  ?? computeMode(asset.inheritanceStartDate || asset.acquisitionDate);
```

#### 2-B. 상속개시일 DateInput 블록 숨김
- 위치: 줄 78~104 (상속개시일 입력 div 전체)
- **변경**: DateInput 제거, 모드 배지만 헤더에 인라인으로 표시

```tsx
{/* Before: 상속개시일 DateInput 블록 전체 */}
{/* After: 상속개시일 표시(읽기 전용) + 모드 배지만 */}
<div className="flex items-center gap-2 text-sm text-muted-foreground">
  <span>상속개시일:</span>
  <span className="font-medium text-foreground">
    {asset.inheritanceStartDate || asset.acquisitionDate || "—"}
  </span>
  {mode === "pre-deemed" && <배지 "의제취득일 이전" />}
  {mode === "post-deemed" && <배지 "의제취득일 이후" />}
</div>
```

→ `handleStartDateChange`는 더 이상 UI에서 호출되지 않으므로 내부 함수로만 유지 (마이그레이션 목적 또는 제거 가능)

---

## 변경 범위 요약

| 파일 | 변경 줄 수 | 내용 |
|---|---|---|
| `CompanionAssetCard.tsx` | +1줄 | `inheritanceStartDate: v` 동기화 추가 |
| `InheritedAcquisitionDeemedSection.tsx` | ~10줄 변경 | computeMode fallback + DateInput 블록 숨김 처리 |

---

## 동작 흐름 (변경 후)

```
[사용자] 취득원인 = "상속" 선택
         ↓
[CompanionAcqInheritanceBlock] 상속개시일 입력 (1983-07-26)
  → onChange({ acquisitionDate: "1983-07-26", inheritanceStartDate: "1983-07-26", ... })
         ↓
[InheritedAcquisitionDeemedSection]
  computeMode("1983-07-26") → "pre-deemed"  ← 자동 활성화!
         ↓
  상속개시일 DateInput 없음 (숨김)
  모드 배지 "의제취득일 이전" 표시
         ↓
  PreDeemedInputs 자동 렌더
```

---

## 기존 사용자 호환성 (sessionStorage)

`inheritanceStartDate`가 비어있는 기존 세션 데이터는:
- `computeMode(asset.inheritanceStartDate || asset.acquisitionDate)`의 fallback으로
- `acquisitionDate`가 있으면 자동으로 mode 결정 → 의제 특례 섹션 자동 활성화
- 별도 마이그레이션 코드 불필요

---

## 검증 방법

1. 취득원인 "상속" 선택
2. 상속개시일에 1983-07-26 입력 → 아래 의제 특례 섹션이 즉시 "pre-deemed" 모드로 활성화되는지 확인
3. 의제 특례 섹션 내부에 상속개시일 DateInput이 없고, 대신 날짜 + "의제취득일 이전" 배지가 표시되는지 확인
4. 상속개시일에 1990-01-01 입력 → "post-deemed" 모드로 자동 전환되는지 확인
5. 상속개시일 지우기 → 의제 특례 섹션 내부가 숨겨지는지 확인
6. 기존 sessionStorage 데이터(inheritanceStartDate=""인 경우)에서도 acquisitionDate 기준으로 올바르게 분기되는지 확인
