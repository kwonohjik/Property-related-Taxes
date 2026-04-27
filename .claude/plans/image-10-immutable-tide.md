# Plan: 양도소득세 앱 크래시 버그 수정

## Context

개별주택가격 미공시 취득(§164⑤) 기능 개발 중 발생한 런타임 오류 두 가지를 수정한다.
dev 서버 로그(`next-development.log`)에서 실제 오류 내용을 확인했다.

## 진단 결과

### 버그 1: areaDisplay 미정의 (이미 수정됨)
- 로그 19:45:38: `ReferenceError: areaDisplay is not defined at PreHousingDisclosureSection.tsx:104`
- **현재 파일**에 `areaDisplay` 참조 없음 → 이미 수정 완료
- 추가 조치 불필요

### 버그 2: `phd.inputs` undefined (현재 활성 오류)
- 로그 20:04~20:17: `TypeError: Cannot read properties of undefined (reading 'landPricePerSqmAtAcquisition')`
- 위치: `components/calc/results/TransferTaxResultView.tsx:395`
- 원인: `phd.inputs` 접근 시 null 가드 누락
  - `result.preHousingDisclosureDetail`이 truthy이지만 `.inputs`가 undefined인 상태 발생
  - 구 엔진(inputs 필드 미포함)으로 계산한 결과가 Zustand 인-메모리 상태에 남아 재렌더 시 크래시
- 현재 엔진(`transfer-tax-pre-housing-disclosure.ts:131`)은 `inputs` 반환 → 새 계산은 정상
- 단, 구 결과가 메모리에 남아 있는 경우 guard 없으면 크래시

## 수정 파일

### `components/calc/results/TransferTaxResultView.tsx` (라인 ~363-370)

**현재 코드:**
```tsx
{result.preHousingDisclosureDetail && (() => {
  const phd = result.preHousingDisclosureDetail;
  const i = phd.inputs;
  const fmt = (n: number) => n.toLocaleString();
```

**수정 코드:**
```tsx
{result.preHousingDisclosureDetail && (() => {
  const phd = result.preHousingDisclosureDetail;
  const i = phd.inputs;
  if (!i) return null;
  const fmt = (n: number) => n.toLocaleString();
```

파일: `components/calc/results/TransferTaxResultView.tsx`
변경: `const i = phd.inputs;` 다음 줄에 `if (!i) return null;` 추가

## 즉시 해결 방법 (사용자)

브라우저 하드 리프레시: `Ctrl+Shift+R` (Windows) / `Cmd+Shift+R` (Mac)
→ Zustand 인-메모리 상태 초기화, 구 result 소거

## 검증

1. 하드 리프레시 후 앱 정상 로드 확인
2. PHD 모드 활성화 → 계산 → 결과 화면 정상 표시 확인
3. 결과 화면에서 "개별주택가격 미공시 취득 환산" 상세 섹션 렌더링 확인
