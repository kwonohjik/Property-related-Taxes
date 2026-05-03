# 1세대 1주택 거주 구간 다중 입력 + 거주기간 자동 합산 계산

## Context

현재 거주기간은 `TransferFormData.residencePeriodMonths`(폼-전역 정수, 개월)로만 입력하고 있어, 비연속 거주(중간 임대·일시 거주이탈) 사례를 정확히 반영할 수 없다. 1세대1주택 12억 초과 고가주택의 표2(보유 4%/년 + 거주 4%/년, 최대 80%) 장기보유특별공제는 거주기간 합산이 정확해야 하며, 신고서 양식 표의 "입주일/퇴거일/거주기간" 행도 실제 입력값을 반영해야 한다.

엔진(`transfer-tax.ts:518`, `transfer-tax-helpers.ts:215·376`)은 이미 `residencePeriodMonths` 단일 정수만 사용하므로, 다중 구간 합산값을 그대로 같은 필드에 주입하면 엔진 변경 없이 호환된다.

## 결정 사항 (사용자 답변)

- 저장 위치: **자산-수준 `AssetForm`** (자산별로 다른 거주 이력 입력 가능, 다건 양도 호환)
- 입력 UI: **구간 입력 모드 + 직접 입력 모드 전환 토글** (legacy 호환)
- 노출 조건: **1세대1주택 토글 ON + housing 자산일 때만**
- 신고서 표 표시: **최초 입주일 + 최종 퇴거일만** (중간 구간은 거주기간 합산값으로만 반영)

## 변경 파일

### ① 폼 상태 타입 — `lib/stores/calc-wizard-asset.ts`

```ts
interface ResidencePeriod {
  moveInDate: string;   // YYYY-MM-DD
  moveOutDate: string;  // YYYY-MM-DD (현재 거주 중이면 빈 문자열 = 양도일까지)
}

interface AssetForm {
  // ...
  /** 거주 입력 모드: "interval"(구간 다중 입력) | "direct"(개월수 직접 입력) */
  residenceInputMode: "interval" | "direct";
  /** 다중 거주 구간 (interval 모드 시 사용) */
  residencePeriods: ResidencePeriod[];
  /** 직접 입력 개월 (direct 모드 시 사용, 기존 form-global 값 마이그레이션 대상) */
  residencePeriodMonthsAsset: string;
}
```

### ② 초기값/마이그레이션 — `lib/stores/calc-wizard-asset.ts` `createInitialAssetForm`, `lib/stores/calc-wizard-migration.ts`

- 신규 자산: `residenceInputMode: "direct"`, `residencePeriods: []`, `residencePeriodMonthsAsset: "0"`
- 마이그레이션: legacy `formData.residencePeriodMonths` → primary asset의 `residencePeriodMonthsAsset` 으로 1회 이전, mode=direct

### ③ API 변환 — `lib/calc/transfer-tax-api.ts:419`

```ts
function calcResidenceMonths(asset: AssetForm, transferDate: string): number {
  if (asset.residenceInputMode === "interval" && asset.residencePeriods.length > 0) {
    return asset.residencePeriods.reduce((sum, p) => {
      const end = p.moveOutDate || transferDate;
      return sum + diffMonthsClamped(p.moveInDate, end);
    }, 0);
  }
  return parseInt(asset.residencePeriodMonthsAsset || form.residencePeriodMonths) || 0;
}
```

엔진 입력의 `residencePeriodMonths`는 위 함수 결과로 주입. **엔진은 무변경**.

### ④ Validation — `lib/calc/transfer-tax-validate.ts`

- interval 모드 + 1세대1주택 + housing 시: 각 구간의 `moveInDate` 필수, `moveOutDate < moveInDate` 거부, 구간 간 중첩 경고
- 양도일 이후 구간 거부
- direct 모드는 기존 검증 유지

### ⑤ UI 입력 위젯 — 신규 컴포넌트 `components/calc/transfer/ResidencePeriodSection.tsx`

배치: `Step4.tsx` "거주기간" 자리 또는 자산 카드 내부 (자산-수준 통합 원칙 준수). 노출 조건: `isOneHousehold === true && primaryKind === "housing"`.

```
┌─ 거주 정보 (1세대1주택) ────────────────────┐
│  [ToggleCard] 비연속 거주 구간 입력         │
│  ├ ON: 구간 카드 N개                        │
│  │  ┌ #1  입주일 [DateInput]  퇴거일 [DateInput]  자동 X개월 ┐
│  │  └ + 구간 추가 / 삭제                                       
│  │  합계: Y개월 (Z년 M개월)                                    
│  └ OFF: 개월수 직접 입력 [number]                               
└────────────────────────────────────────────┘
```

기존 컴포넌트 재사용:
- `DateInput` (`components/ui/date-input.tsx`) — 모든 날짜
- `ToggleCard` (`components/calc/inputs/ToggleCard.tsx` `tone="violet"`) — 모드 전환 (거주·자격 정보 violet)
- `FieldCard` — 구간 카드 래퍼

### ⑥ 사이드바 합계 — 변경 없음

거주기간은 사이드바 합계 표시 항목 아님.

### ⑦ 결과 카드 산식·표시 — `components/calc/results/transfer/FilingFormTable.tsx`

- 행 "입주일": `asset.residencePeriods[0]?.moveInDate` (interval 모드) 또는 빈값
- 행 "퇴거일": `asset.residencePeriods[asset.residencePeriods.length-1]?.moveOutDate ?? transferDate` (interval 모드) 또는 양도일
- 행 "거주기간": 합산 개월수를 `fmtPeriod`로 표시
- 행 "거주 기간분 장특": 기존 `splitLtDeduction` 로직이 `residencePeriodMonths` 합산값을 그대로 사용 → 자동 반영 (수정 불필요)

### ⑧ Validation 동기화

interval 모드의 합산 개월수가 form-global `residencePeriodMonths`와 다를 수 있음. API 변환에서 fallback 정의: `interval > 0 ? sum : direct`. validate도 같은 fallback 인식 (CLAUDE.md ⑧ 정책).

## 마이그레이션 영향

- 기존 sessionStorage 데이터: `residencePeriodMonths` form-global 값을 `residencePeriodMonthsAsset` 으로 1회 복사 (mode=direct). 사용자가 "비연속 거주" 토글 ON 시 자동 마이그레이션 없이 빈 구간 배열에서 시작.
- DB 이력(`calculations` 테이블): 입력 데이터는 jsonb이므로 기존 row 영향 없음. PDF 생성 시 신규 필드 누락은 fallback으로 처리.

## 검증

1. `npx tsc --noEmit` — 0 오류
2. `npx vitest run __tests__/tax-engine/transfer-tax/` — 회귀 통과 (엔진 무변경)
3. 새 단위 테스트 (`__tests__/calc/residence-period.test.ts` 신규):
   - 단일 구간 (1985-01-01 ~ 2023-02-16) → 전체 개월수
   - 비연속 2구간 (1년 거주 + 임대 5년 + 1년 거주) → 24개월 합산
   - 진행 중 구간 (moveOut 빈값) → 양도일까지 계산
   - 양도일 이후 구간 입력 → validation 거부
4. 브라우저 수동:
   - 1세대1주택 토글 ON → 거주 구간 카드 노출
   - 비연속 2구간 입력 → 합계 자동 표시
   - 신고서 양식 표 "입주일=첫 구간 입주일", "퇴거일=마지막 구간 퇴거일", "거주기간=합산값"
   - 표2 적용 시 "거주 기간분 장특" 행 금액 표시 확인
   - direct 모드로 전환 시 기존 입력값 유지

## 정책 점검 (CLAUDE.md DoD 8지점)

- [x] ① 폼 상태 타입 — AssetForm에 3필드 추가
- [x] ② initial value — createInitialAssetForm 갱신
- [x] ③ normalize fallback — 마이그레이션에서 legacy 값 자동 이전
- [x] ④ API 변환 — calcResidenceMonths 함수
- [x] ⑤ UI 위젯 — ResidencePeriodSection
- [x] ⑥ 사이드바 — 해당 없음
- [x] ⑦ 결과 카드 — FilingFormTable 입주일/퇴거일/거주기간 행 갱신
- [x] ⑧ Validation — interval/direct fallback 동일 인식

## 영향 범위·위험

- 엔진: 무변경 (residencePeriodMonths 정수 입력 그대로 유지)
- API/Store: AssetForm 필드 3개 추가, 마이그레이션 1회성
- UI: 거주기간 입력 위젯 신규 1개
- 회귀 위험: 낮음 — direct 모드가 기본값이며 기존 동작과 동일
