# 재개발 APT 신고서 양식 표 4가지 버그 수정

## Context

`FilingFormTable` 의 재개발 3분할 모드(인가전 분 / 인가후 기존건물분 / 청산금 분)에서 다음 4가지가 누락·강제 0:
- (a) 분기별 취득일자·양도일자 강제 `"-"` (보유기간만 표시)
- (b) 분기별 필요경비 강제 `0` — 입력된 `redevPreApprovalExpenses`·`redevPostApprovalExpenses` 손실
- (c) 분기별 입주일·퇴거일·거주기간 강제 `"-"` — 이전 PR에서 추가한 4 Date 필드가 표에 연결 안 됨
- (d) 장기보유특별공제 보유분/거주분 분리 미적용 — 표2 적용 케이스에서도 보유분 합계만 표시, 거주분 0

## 구현 방향

### 1. 타입 확장 (`RedevelopmentBranchDetail`)
필드 추가:
- `branchAcqDate?: Date` · `branchTransferDate?: Date` (분기별 기산일)
- `expenses?: number` (분기별 필요경비)
- `residenceStartDate?: string` · `residenceEndDate?: string` · `residenceMonths?: number`
- `lthdHoldingPart?: number` · `lthdResidencePart?: number`

### 2. LTHD 엔진 분리 (`redevelopment-lthd.ts`)
`RedevelopmentLthdBranch`에 `holdingRate`·`residenceRate`·`holdingDeductionAmount`·`residenceDeductionAmount` 추가. 표2 적용 시 각각 계산. 표1은 holdingAmount=lthd 전액, residenceAmount=0.

### 3. orchestrator (`transfer-tax-redevelopment.ts`)
분기별로:
- **인가전분**: 취득일 ~ 관리처분인가일, 종전주택 거주기간(prior), expenses = preApprovalExpenses
- **인가후 기존건물분**: 관리처분인가일 ~ 양도일, 신축주택 거주기간(new), expenses = postApprovalExpenses
- **청산금분**: 관리처분인가일 ~ 양도일(또는 settlementSaleDate), 신축주택 거주기간(new), expenses = 0

각 분기에 LTHD 분리 금액 부착.

### 4. FilingFormTableHelpers.ts
- L479-480: 취득일·양도일을 분기별 부착값으로 교체
- L481-483: 거주기간 prop 부착
- L492-496: 필요경비 분기별 매핑
- L505-510: 장특 보유분/거주분 분기별 매핑

## 변경 파일

1. `lib/tax-engine/types/transfer-redevelopment.types.ts` — Branch detail 필드 추가
2. `lib/tax-engine/redevelopment-lthd.ts` — 분리 계산
3. `lib/tax-engine/transfer-tax-redevelopment.ts` — branch 부착
4. `components/calc/results/transfer/FilingFormTableHelpers.ts` — 렌더 매핑

## 검증
- `npx tsc --noEmit` 0건
- `npx vitest run __tests__/tax-engine/transfer-tax/redevelopment/` 회귀 0건
- 합계 LTHD 동일 (분리 표시만 변경, 총액 보존)
