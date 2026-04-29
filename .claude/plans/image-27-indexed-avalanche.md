# Plan — 겸용주택 확장 패널을 "직접 귀속 필요경비" 바로 위로 분리 이동

## Context

**현재 동작**: `CompanionAssetCard.tsx:128`에서 `MixedUseSection`이 렌더링되며, 이 컴포넌트는 ① "검용주택 분리계산" 체크박스와 ② 체크 시 펼쳐지는 큰 입력 패널(면적·양도/취득 기준시가·거주·수도권 + PHD 3-시점 + 4-way 가이드)을 **함께** 출력합니다. 체크박스 위치(자산 카드 상단, 자산 종류 토글 바로 아래)에서 확장되기 때문에, 패널이 펼쳐지면 자산 카드의 일반 입력(소재지·양도가액·취득원인·취득일·취득가액 산정·기준시가·신축 여부 등)이 패널 **아래**로 밀려나 입력 흐름이 끊깁니다.

**원하는 동작**:
- 체크박스("검용주택 분리계산")는 **현재 위치 그대로** 자산 카드 상단에 유지
- 체크 시 펼쳐지는 **확장 패널만** "직접 귀속 필요경비" 바로 위로 이동
- 결과: 사용자는 일반 자산 정보(소재지~기준시가~신축)를 먼저 입력하고, 그 다음 검용주택 전용 입력(면적·거주·수도권), 마지막으로 필요경비를 입력하는 자연스러운 순서가 됨

## Approach — `MixedUseSection`을 토글 행 / 확장 패널 두 컴포넌트로 분리

`components/calc/transfer/MixedUseSection.tsx`를 두 개의 export로 쪼개고, `CompanionAssetCard.tsx`에서 각각 다른 위치에 배치합니다.

### 1. `MixedUseSection.tsx` 변경

기존 단일 export `MixedUseSection`을 다음 두 export로 분리:

- **`MixedUseToggleRow`**: 체크박스 + 라벨만 (`<label>` + `<input type="checkbox">` + 보조 문구). 현재의 `border-t pt-4` 래퍼 유지.
- **`MixedUseExpandedPanel`**: `asset.isMixedUseHouse === true`일 때만 출력하는 확장 영역(2022 경고 / 4-way 가이드 / ①~⑤ 섹션 카드). false면 `null` 반환.

기존 `MixedUseSection`은 두 컴포넌트를 합쳐 호출하는 얇은 wrapper로 남겨두면 다른 곳에서 import하는 케이스(있다면)와의 호환을 유지합니다 — grep 결과 import는 `CompanionAssetCard.tsx` 한 곳뿐이므로, wrapper 없이 export만 변경해도 충돌 없음.

두 컴포넌트가 공유하는 props는 동일(`asset`, `onChange`, `transferDate`, `useEstimatedAcquisition`, `jibun`)하므로 동일한 `Props` 인터페이스 그대로 사용. 상태(`asset.isMixedUseHouse`)는 store에서 단일 원천이므로 두 컴포넌트가 떨어져 있어도 일관성 유지됨.

### 2. `CompanionAssetCard.tsx` 변경

- **Line 128-136 (현재 위치)**: `<MixedUseSection ... />` → `<MixedUseToggleRow ... />` 로 교체. 체크박스가 같은 자리에 그대로 보임.
- **Line 547 (직접 귀속 필요경비 바로 위)**: `<MixedUseExpandedPanel ... />` 1줄 삽입. 동일한 props(`asset`, `onChange`, `transferDate`, `useEstimatedAcquisition={asset.useEstimatedAcquisition}`, `jibun={asset.addressJibun || undefined}`)를 전달. assetKind가 "housing"이 아니거나 `isMixedUseHouse`가 false면 `null` 반환하여 시각적 노이즈 없음.

### 3. assetKind 가드

현재 `MixedUseSection`은 호출부(`CompanionAssetCard:128`)에서 `asset.assetKind === "housing"` 조건으로 감싸져 있습니다. 분리 후에도 동일 조건으로 두 컴포넌트를 각각 감싸야 합니다 — 토지/건물(토지 외)/입주권/분양권 자산에는 노출되면 안 됨.

## Files to Modify

| 파일 | 변경 내용 |
|---|---|
| `components/calc/transfer/MixedUseSection.tsx` | 단일 컴포넌트를 `MixedUseToggleRow` + `MixedUseExpandedPanel` 두 export로 분리 |
| `components/calc/transfer/CompanionAssetCard.tsx` | 라인 128 영역의 `MixedUseSection` → `MixedUseToggleRow`로 교체. 라인 547 직전에 `MixedUseExpandedPanel` 추가. 둘 다 `assetKind === "housing"` 가드 유지 |

## 데이터 흐름 검증

확장 패널의 입력은 모두 `asset` store 필드(`mixedUseTotalLandArea`·`mixedAcq*`·`mixedTransfer*`·`mixedUseResidencePeriodYears`·`mixedIsMetropolitanArea`·`phd*` 등)에 직접 저장. 패널이 카드 어디에 배치되든 store가 SOT이므로 데이터 흐름은 변하지 않음. `transferDate`·`jibun`은 props로 주입되며 동일한 `asset`에서 파생되므로 위치 변경 영향 없음.

`CompanionAcqPurchaseBlock.tsx:188`은 `asset.isMixedUseHouse`를 읽어 토지/건물 분리 모드를 강제 ON 상태로 disable하는 로직 — 체크박스가 같은 store 필드를 토글하므로 위치 분리와 무관하게 정상 작동.

## 800줄 정책 체크

- `MixedUseSection.tsx`: 현재 121줄 → 분리 후 두 컴포넌트 합쳐도 ~130줄 이내 (export 추가 + Props 1회 더 정의). 단일 파일 유지 가능.
- `CompanionAssetCard.tsx`: 현재 564줄 → +5줄 정도 추가. 800줄 정책 여유 있음.

## Verification

1. **개발 서버 재기동 후 브라우저 확인**:
   - `npm run dev`
   - `/calc/transfer-tax` Step 1 진입 → 자산 종류를 "주택"으로 선택
   - "검용주택 분리계산" 체크박스가 자산 종류 토글 바로 아래에 보이는지 확인 (위치 변경 없음)
   - 체크박스 ON → 확장 패널이 카드 **하단** "직접 귀속 필요경비" 바로 위에 나타나는지 확인
   - 체크박스 OFF → 확장 패널이 사라지고, 일반 입력 흐름이 끊기지 않는지 확인
   - 자산 종류를 "토지·농지"·"건물(토지 외)"·"입주권"·"분양권"으로 바꾸면 체크박스/패널 모두 사라지는지 확인
2. **데이터 입력 검증**:
   - 면적·기준시가·거주연수·수도권 체크박스 입력값이 정상 저장되는지 (store 동작 확인 — 결과 화면에서 안분 결과가 이전과 동일하게 나오면 OK)
   - PHD 토글 후 3-시점 환산 입력이 정상 작동
3. **Type check**: `npx tsc --noEmit`
4. **회귀 테스트**: `npx vitest run __tests__/tax-engine/transfer-tax/mixed-use-house.test.ts` — UI 변경뿐이지만 데이터 흐름 변경 없음을 보강 검증
