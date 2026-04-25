# 다건 양도세 자산별 카드: "과세표준 기여분" 수식·"산출세액(참고)" 재계산

## Context

다건 양도세 결과 화면에서 자산별 카드에 표시 오류가 발견됨. 사용자 시나리오: 다건 모드에서 자산1만 입력하고 자산2는 아직 입력 전인 단계에서 결과를 봤을 때:

1. **"과세표준 기여분" 수식 라벨이 값과 모순**
   - 표시: 545,401,140원
   - 수식: "양도소득금액 547,901,140원 - 기본공제 0원" (기본공제 0원이라고 표기되지만 실제로는 250만원이 차감됨)
2. **"산출세액 (참고)" 행이 양도소득금액 기준으로 계산됨**
   - 표시: 194,178,478원 (= 547,901,140 × 42% - 35,940,000)
   - 사용자 기대: 545,401,140 × 42% - 35,940,000 = 193,128,478원 (과세표준 기준)
   - 자산이 1건뿐이면 이 자산별 산출세액 = 합산 산출세액이어야 함

**근본 원인**: `transfer-tax-aggregate.ts:103-110`에서 자산별 단건 엔진을 `skipBasicDeduction: true`로 호출하므로, 단건 엔진이 만든 step의 "과세표준" formula는 기본공제 0원을, "산출세액" 값은 양도소득금액 × 세율을 표시함. UI(`MultiTransferTaxResultView.tsx:237-238`)는 이 단건 step을 그대로 가져와 표시하면서, 같은 행의 **값**은 다건 컨텍스트의 `breakdown.taxBaseShare`(차손통산 + 기본공제 배분 후) 를 쓰고 있어 수식과 값이 어긋남.

**의도한 결과**:
- 자산별 카드의 "과세표준 기여분" 수식이 다건 컨텍스트 그대로 표시됨 (예: "통산후 소득 547,901,140원 - 기본공제 배분 2,500,000원")
- "산출세액 (참고)"가 자산별 과세표준 기여분 × 자산 세율 - 누진차감으로 재계산됨 → 자산 1건일 때 합산 산출세액과 일치

## 변경 대상 파일

### 1. `lib/tax-engine/types/transfer-aggregate.types.ts:65-118`

`PerPropertyBreakdown`에 자산별 세율 정보 노출 필드 3개 추가:
```ts
/** 자산별 적용 세율 (단건 엔진 결과) — 자산별 산출세액 재계산용 */
appliedRate: number;
/** 자산별 누진 차감액 */
progressiveDeduction: number;
/** 자산별 중과세율 (해당 시) */
surchargeRate?: number;
```

### 2. `lib/tax-engine/transfer-tax-aggregate.ts:381-408`

`PerPropertyBreakdown` 빌드 시 위 필드 채우기 (기존 `r.result`에 이미 있음):
```ts
appliedRate: r.result.appliedRate,
progressiveDeduction: r.result.progressiveDeduction,
surchargeRate: r.result.surchargeRate,
```

### 3. `components/calc/results/MultiTransferTaxResultView.tsx:237-238, 346-364`

자산별 카드 표시 로직 변경:

(a) **과세표준 기여분 수식 직접 생성** (라인 346-353):
- 단건 step의 formula 대신 다건 컨텍스트 formula 직접 작성
- 예: `"통산후 소득 ${breakdown.incomeAfterOffset}원 - 기본공제 배분 ${breakdown.allocatedBasicDeduction}원"`
- legalBasis: `"소득세법 §92"` (기존 동일)

(b) **산출세액(참고) 직접 재계산** (라인 355-364):
- `getStep("산출세액")` 의존 제거
- 값: `Math.max(0, breakdown.taxBaseShare * (breakdown.appliedRate + (breakdown.surchargeRate ?? 0)) - breakdown.progressiveDeduction)` (정수 절사 적용 — `applyRate` 패턴과 일관성)
- 수식: `"과세표준 기여분 ${taxBaseShare}원 × 세율 ${rate}%${중과시 + 중과율}${누진차감 - X원}"`
- 자산이 차손(taxBaseShare=0)이면 0원으로 표시
- legalBasis: `"소득세법 §104"` (기존 단건 엔진과 동일)
- "(참고)" 표기 + `muted` 스타일 유지: 비교과세 적용 시 합산 산출세액과 차이 가능

## 재사용 가능한 기존 코드

- `r.result.appliedRate`, `r.result.progressiveDeduction`, `r.result.surchargeRate` — 이미 단건 엔진(`transfer-tax.ts:171-173`)이 채우는 값. 추가 계산 불필요.
- `breakdown.taxBaseShare` — 다건 컨텍스트의 자산별 과세표준 기여분 (이미 정확하게 계산됨, `transfer-tax-aggregate.ts:398`).
- `breakdown.incomeAfterOffset`, `breakdown.allocatedBasicDeduction` — 수식 표시용 데이터.
- 정수 절사 패턴: `Math.floor(taxBaseShare * rate)`. 단건 엔진의 `applyRate`와 동일한 절사 규칙 (원 단위 floor).

## 회귀 위험

- **타입 변경 위험 0**: `PerPropertyBreakdown`에 필드 추가는 후방 호환. 기존 소비자 영향 없음.
- **표시 로직 변경**: `getStep("과세표준")`과 `getStep("산출세액")`의 의존 제거 → 단건 엔진 step 변경에 둔감해져 오히려 안정성 향상.
- **테스트 영향**: 테스트는 엔진 결과(`r.result.calculatedTax` 등)를 검증. PerPropertyBreakdown의 새 필드 추가는 회귀 0. 표시 로직은 단위 테스트가 없으므로 회귀 테스트 영향 없음.

## 검증

### 자동 (vitest)
```bash
npx vitest run __tests__/tax-engine/transfer-tax-aggregate
npm test  # 80 파일 / 1502 tests 그린 유지
npx tsc --noEmit  # 타입 체크
```

### 수동 시나리오 (사용자 보고 케이스 재현)
1. `/calc/transfer-tax` 자산1 입력: 양도가액·취득가액 등 사용자가 보고한 케이스와 동일한 값
2. 결과 화면 → "동일연도 다른 양도건 계산하기" → 다건 모드 진입 (자산2는 빈 상태)
3. 자산2를 의도적으로 미입력하고 (예: 자산2 삭제) → 자산1만 있는 상태로 계산
4. 결과 화면의 자산1 카드 펼침
5. **확인 항목**:
   - "과세표준 기여분 545,401,140원" 행의 수식: "통산후 소득 547,901,140원 - 기본공제 배분 2,500,000원"으로 정확히 표시되는지
   - "산출세액 (참고): 193,128,478원" (= 545,401,140 × 42% - 35,940,000)으로 표시되는지
   - 합산 결과의 "산출세액"과 동일한 값인지 (자산 1건이면 일치해야 함)

### 다건 시나리오 회귀
- 자산 2건 이상에서 차손통산·기본공제 배분이 정상 동작하는지
- 비교과세(§104의2) 적용 시 자산별 "산출세액 (참고)" 합 ≠ 합산 산출세액일 수 있음 → "(참고)" 표기 + muted 스타일로 의도 전달
