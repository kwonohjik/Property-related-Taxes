# 검용주택 — 토지·건물 취득일 분리 토글 잠금 해제 (옵션 2)

## Context

검용주택 분리계산 ON 시 `CompanionAcqPurchaseBlock.tsx`의 "토지·건물 취득일 다름" 토글이 `disabled`로 강제 ON 잠금되어 있다. 엔진(`MixedUseAssetInput`)은 두 날짜가 동일해도 정상 작동하며, API 변환(`transfer-tax-api.ts:250` `primary.landAcquisitionDate || primary.acquisitionDate`)도 폴백을 갖추고 있어, 검용주택이라도 동일 취득일인 경우 토글 OFF가 가능해야 한다. 사용자가 옵션 2(자동 ON 유지 + 잠금만 해제)를 선택.

## 변경

**파일**: `components/calc/transfer/CompanionAcqPurchaseBlock.tsx` (chip 토글 props)

- `disabled={isMixedUse}` 제거
- `disabledReason="검용주택 분리계산은 항상 토지/건물 분리로 처리됩니다"` 제거
- `description` 분기에서 `isMixedUse` 안내문 "검용주택은 항상 분리" → "기본 분리 권장 (동일일 가능)"

자동 ON 동작은 유지: `MixedUseSection.tsx:47`에서 검용주택 토글 ON 시 `hasSeperateLandAcquisitionDate: true` 자동 설정 — 그대로 둠. 사용자가 명시적으로 OFF로 토글하면 단일 취득일 모드.

## 검증

1. `npx tsc --noEmit` — 0 오류
2. 브라우저 수동:
   - 검용주택 토글 ON → "토지·건물 취득일 다름"이 자동 ON, 사용자가 OFF로 토글 가능
   - OFF 시 토지 취득일 입력 영역 숨김, 단일 acquisitionDate로 엔진 동작
   - PHD 토글 ON 시 분리 토글이 함께 자동 ON되어 PHD 3-시점 입력 게이트 통과

## 영향 범위

- 엔진/API: 무변경 (이미 폴백 동작 보유)
- UI: chip 토글 잠금만 해제, 다른 동작 변경 없음
- 회귀 위험: 낮음 — disabled 속성 제거만 수행
