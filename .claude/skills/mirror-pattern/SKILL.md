---
name: mirror-pattern
description: 두 필드 간 자동 동기화·미러링·fallback 구현 시 useEffect로 store에 쓰는 패턴 금지. display fallback prop + API/validate fallback의 3중 패턴 강제. 무한 루프(Maximum update depth exceeded) 사전 차단.
trigger: 동기화, 미러링, fallback, sync, mirror, 자동 입력, 자동 채우기, useEffect onChange, store 업데이트
---

# mirror-pattern — Cross-field 자동 동기화 안전 패턴

같은 의미의 값을 여러 필드(예: `mixedAcqLandPricePerSqm` ↔ `phdLandPricePerSqmAtAcq`) 사이에서 자동 동기화할 때 사용. zustand store에 useEffect로 쓰는 패턴은 무한 루프를 일으키므로 금지.

## 적용 시점

- 사용자가 "X 값을 Y에 자동으로 가져와줘", "두 필드를 동기화해줘", "fallback 추가" 같은 요청을 할 때
- 한 화면의 입력을 다른 화면 필드에 표시하거나, 계산 입력으로 넘기는 작업

## ❌ 금지 패턴 — useEffect로 store 미러링

```tsx
// 무한 루프 발생 (Maximum update depth exceeded)
useEffect(() => {
  const a = parseAmount(asset.fieldA);
  const b = parseAmount(asset.fieldB);
  if (a !== b) {
    onChange({ fieldB: a > 0 ? String(a) : "" });
  }
}, [asset.fieldA, asset.fieldB, onChange]);
```

**왜 안 되는가**:
- `onChange`가 새 asset 객체 생성 → 컴포넌트 리렌더 → asset 참조 변경 → useEffect 재실행
- 가드(`if (a !== b)`)를 두어도 store의 normalize·정규화 과정에서 객체 참조가 바뀌면 탈출 불가
- `onChange`를 deps에서 제거해도 asset 다른 필드 변경 시 함께 재실행

## ✅ 권장 패턴 — 3중 fallback

### 1. UI Display (props에 직접 fallback)

```tsx
<LandPriceLookupField
  pricePerSqm={asset.mixedAcqLandPricePerSqm || asset.phdLandPricePerSqmAtAcq}
  onPricePerSqmChange={(v) => onChange({ mixedAcqLandPricePerSqm: v })}
/>
```

### 2. 사이드바 합계·파생 계산 (useMemo 또는 직접 계산)

```typescript
const acqLandPerSqm =
  parseAmount(asset.mixedAcqLandPricePerSqm) ||
  parseAmount(asset.phdLandPricePerSqmAtAcq);
```

### 3. API 변환 (`lib/calc/{tax-type}-api.ts`)

```typescript
landPricePerSqm:
  parseAmount(primary.mixedAcqLandPricePerSqm) ||
  parseAmount(primary.phdLandPricePerSqmAtAcq) || 0,
```

### 4. ⑧ Validation (`lib/calc/{tax-type}-validate.ts`) **— 누락하면 image 18 버그 재발**

```typescript
const directLandPerSqm = parseAmount(asset.mixedAcqLandPricePerSqm);
const phdLandPerSqm = parseAmount(asset.phdLandPricePerSqmAtAcq);
if (directLandPerSqm <= 0 && phdLandPerSqm <= 0) {
  return `${label}: 개별공시지가를 입력하세요.`;
}
```

## 예외적으로 useEffect onChange가 허용되는 경우

- **사용자 이벤트 응답**: onClick/onChange 핸들러 내부에서 호출되는 onChange는 OK
- **단방향 자동 활성화**: `useEffect(() => { if (isPre1990 && !pre1990Enabled) onChange({ pre1990Enabled: true }) })` 같은 boolean toggle (값이 한 번만 바뀌어 정착)
- 두 경우 모두 deps에 `onChange` 자체를 넣지 말 것 (함수 참조 비교 위험)

## 자가 점검

새 동기화·미러링 코드 작성 시:
- [ ] useEffect 안에 `onChange({ ... })`가 있는가? → 위 예외 케이스인지 재확인, 아니면 fallback 패턴으로 전환
- [ ] UI/사이드바/API/Validate 4곳 모두 같은 fallback이 적용되었는가?
- [ ] `npx tsc --noEmit` + 회귀 테스트 + 브라우저 확인은 Playwright E2E(`e2e/*.spec.ts`)로 실증 (Maximum update depth 오류 없음 확인)

## 관련 메모리

- `feedback_useeffect_store_mirror_forbidden.md` — 이 패턴의 사례·이유
- `feedback_zustand_selector.md` — selector에서의 다른 무한 루프 패턴
- `feedback_validation_sync_8th_point.md` — ⑧ validation 동기화 강제
