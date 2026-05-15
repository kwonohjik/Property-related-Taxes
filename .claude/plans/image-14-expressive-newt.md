# 재개발/재건축 입주권 양도 — propertyType/subject 부정합 회귀 정정

## Context

사용자가 양도소득세 마법사에 다음 입력을 했을 때 결과 화면이 여전히 단일 "합계" 열 + LTHD 126,000,000 (= 30% × 420M 전체 양도차익)으로 표시되는 문제가 두 번의 작업에도 해결되지 않았다.

**사용자 입력 (이미지 #15에서 확인)**:
- 자산 종류 카드: **재개발/재건축 APT** (`assetKind="redevelopment_apt"`)
- 양도 정보: 일반 양도
- 양도 대상 라디오 (시행령 §166): **입주권 양도** ★ violet 활성 (`redevSubject="right"`)
- 취득 2002-04-09 100,000,000 / 양도 2023-03-02 520,000,000 / 권리가액 300,000,000 / 청산금 납부 90,000,000

**기대값** (소령 §166①1호 + §95② 단서):
- 신고서 양식 표 3열: **합계 / 인가전 / 인가후**
- 인가전 양도차익 200M × 30% (16년 6월 표1) = LTHD **60,000,000**
- 인가후·청산금 양도차익 220M × **0** (§95② 단서 배제) = LTHD 0
- 산출세액 81,710,000 (2023년 §55 누진)

**현재 화면 결과**:
- 단일 "합계" 열
- 보유기간 20년 10월 (취득~양도 전체)
- LTHD 126,000,000 (= 30% × 420M 전체)
- 산출세액 90,830,000 (잘못된 계산)

## 근본 원인 (Explore 2회 진단 확정)

엔진 진입 게이트 `isRedevelopmentActive()` (`lib/tax-engine/redevelopment.ts:340-348`):

```typescript
if (propertyType === "redevelopment_apt") return redevelopment.subject === "apt";
if (propertyType === "right_to_move_in") return redevelopment.subject === "right";
return false;
```

사용자 입력은 `propertyType="redevelopment_apt"` + `subject="right"` — **엔진이 이 조합을 거부**하여 일반 양도 분기로 routing → `result.redevelopmentDetail = undefined` → `TransferTaxResultView.tsx:130-138` 의 props 도출이 `undefined` → `FilingFormTable.tsx` 의 `deriveColumns()` 가 `redev-right-pay` 3열 분기를 활성화하지 못함 → 기본 단일 "합계" 표시 + LTHD가 전체 양도차익에 적용됨.

**왜 두 번의 anchor가 잡지 못했나** — 선행 anchor `case-redev-right-transfer-pay-lthd-split.test.ts:73` 의 R-PAY-1~7은 `propertyType: "right_to_move_in"` 으로 엔진을 직접 호출. **사용자의 실제 UI 입력 경로(`redevelopment_apt` + `subject="right"`)는 anchor에서 검증되지 않음**. R-PAY-8 회귀 차단 anchor는 `redevelopment_apt + subject="apt"` 조합만 검증.

## 수정 전략 (옵션 A — API 변환 layer 단일 지점 remap)

**선택 근거**:
- 엔진 의미 변경 없음 → 회귀 위험 최소
- UI 자유도 유지 — 사용자가 자산 종류 "재개발/재건축 APT"를 선택해도 라디오로 입주권/완공APT 자유 전환 가능
- 단일 지점 수정 → 추적 용이

**핵심**: API 변환 시 `redevSubject="right"` 가 명시되면 엔진 `propertyType` 을 `"right_to_move_in"` 으로 자동 remap. UI assetKind 는 그대로 `"redevelopment_apt"` 유지.

## 수정 파일 (3개 + anchor 2개)

### 1. `lib/calc/transfer-tax-api.ts:307-309` — propertyType remap ★ 핵심

현재:
```typescript
propertyType: isMixed
  ? ("mixed-use-house" as const)
  : (primary.assetKind as "housing" | "land" | ...),
```

변경:
```typescript
// 재개발/재건축: subject="right" 시 엔진 routing 키를 right_to_move_in으로 remap
//   - UI assetKind="redevelopment_apt"는 사업 분류, 양도 대상(subject)이 실제 양도 객체
//   - 엔진 isRedevelopmentActive()는 propertyType ↔ subject 1:1 매핑 요구
const isRedevelopmentRightTransfer =
  primary.assetKind === "redevelopment_apt" && primary.redevSubject === "right";

propertyType: isMixed
  ? ("mixed-use-house" as const)
  : isRedevelopmentRightTransfer
    ? ("right_to_move_in" as const)
    : (primary.assetKind as "housing" | "land" | ...),
```

**위치 트레이드오프 확인**: `transfer-tax-api.ts:438` 의 `primary.assetKind === "right_to_move_in"` 분기와 `transfer-tax-api.ts:309`의 propertyType assertion 외에 propertyType 의존 코드 추가 영향 없음 (`buildRedevelopmentPayload` 는 subject 명시 전달).

### 2. `__tests__/tax-engine/transfer-tax/redevelopment/case-redev-right-transfer-pay-lthd-split.test.ts` — anchor 보강

신규 describe 블록 (R-PAY-11~14): API layer 진입 anchor.
- API layer 진입을 모사하기 위해 `lib/calc/transfer-tax-api.ts` 의 `callTransferTaxAPI` 또는 `buildBody` 분기 단위 테스트가 가능하면 그쪽으로. 어려우면 엔진에 `propertyType="redevelopment_apt" + subject="right"` 입력 시 결과 검증 anchor.
- R-PAY-11: 사용자 시나리오 그대로 — 산출세액 81,710,000 일치
- R-PAY-12: LTHD = 60,000,000 (현재 화면 126M 회귀 차단)
- R-PAY-13: `redevelopmentDetail.preApproval.gain` = 200,000,000
- R-PAY-14: `redevelopmentDetail.settlement.lthd` = 0 (§95② 단서)

### 3. (선택) `__tests__/calc/transfer-tax-api.test.ts` 신규 — UI→API 변환 회귀

`buildBody({assetKind:"redevelopment_apt", redevSubject:"right", ...})` 호출 시 반환 body의 `propertyType === "right_to_move_in"` 검증. API 변환 layer 단독 anchor — 향후 다른 분기 추가 시 회귀 차단.

존재하지 않으면 신규 생성. 800줄 미만 유지.

## 검증 (end-to-end)

### 1. 단위 회귀
```bash
npx tsc --noEmit                                                          # 0 errors
npx vitest run __tests__/tax-engine/transfer-tax/redevelopment/           # 14 files / 212+ tests
npx vitest run __tests__/tax-engine/transfer-tax/                         # 양도세 전체
```

기존 사례 36 (CORE-36 81,710,000)·44·45·47·48 회귀 0건 필수.

### 2. UI flow 회귀 (수동 — 사용자 환경)

`npm run dev` 후 양도세 마법사:

| 시나리오 | 입력 | 기대 신고서 양식 |
|---|---|---|
| 본 사례 | 자산 종류=재개발/재건축 APT + 양도 대상=입주권 양도 + 청산금 납부 | **3열** (합계/인가전/인가후), 인가전 LTHD 60M, 인가후 LTHD 0 §95② 단서 rose 주석, 산출세액 81,710,000 |
| 회귀 1 (사례 44) | 자산 종류=재개발/재건축 APT + 양도 대상=완공 APT 양도 | 기존 4열(redev-4split), 회귀 0 |
| 회귀 2 (사례 47) | 자산 종류=재개발/재건축 APT + 완공 APT + 청산금 수령 + 비과세 | 4열, 산출세액 37,630,000 (옵션 B) 보존 |
| 회귀 3 | 자산 종류=주택 (assetKind="housing") | propertyType="housing" 그대로, 일반 양도 |

### 3. Network 탭 검증
- 본 사례 입력 후 `/api/calc/transfer` request body의 `propertyType` 필드가 **`"right_to_move_in"`** 인지 확인
- `redevelopment.subject` 가 `"right"` 인지 확인

## 비범위 (별도 PR)

- R-5 (right + settlement="receive") 3열 분리 — 현재 `redev-4split` 4열 유지
- `redev-right-pay` 모드에서 보유기간 행 표시 정책 미세 조정
- `BundledAllocationCard` · `MultiTransferTaxResultView` · `MixedUseResultCard` 에 redev props 전달 (현재 미전달이지만 사용자 시나리오 = 단건 모드라 영향 없음)

## 영향받지 않는 파일 (확인용)

이미 선행 PR에서 완료된 부분 (수정 불필요):
- `components/calc/results/transfer/FilingFormTableHelpers.ts` (ColumnMode + deriveColumns redev-right-pay 3열 — 활성화 조건만 충족하면 동작)
- `components/calc/results/transfer/FilingFormTableRedevRows.ts` (fillRedevRightPayBranchData)
- `components/calc/results/transfer/FilingFormTable.tsx` (redevSubject/redevSettlementDirection props 수신)
- `components/calc/results/TransferTaxResultView.tsx` (props 도출)
- `lib/tax-engine/redevelopment-lthd.ts` (computeRightLthd — §95② 단서 LTHD 0)
- `lib/tax-engine/redevelopment-split.ts` (computeRightPay — preApproval/settlement gain split)

이들은 모두 정상 구현되어 있으며, `propertyType` remap만 추가하면 자동으로 연쇄 활성화됨.
