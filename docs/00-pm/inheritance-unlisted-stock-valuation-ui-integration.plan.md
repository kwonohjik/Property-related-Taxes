# 비상장주식 평가 후속 UI 14지점 통합 계획서 (v3)

> **Status**: Plan v3 — 11단계 자가검토 통과 (1차 10건 + 2차 5건 + 통합비교 4건 = 19건 정정)
> **디자인 문서**: [`inheritance-unlisted-stock-valuation-ui-integration.design.md`](../02-design/features/inheritance-unlisted-stock-valuation-ui-integration.design.md) (v2 동기화)
> **선행 commit**: `0f4c42b` (PR-E·F·M·N·Q 엔진 + 24 anchor)
> **본 계획서 범위**: PR-E·F·M·N·Q 5건의 UI 14지점 통합 (StepWizard 폼 ↔ Store ↔ API ↔ Zod ↔ Route ↔ 엔진)
> **Companion**:
>   - 후속 계획서 v4: [`inheritance-unlisted-stock-valuation-followup.plan.md`](./inheritance-unlisted-stock-valuation-followup.plan.md)
>   - 후속 디자인 v3: [`inheritance-unlisted-stock-valuation-followup.design.md`](../02-design/features/inheritance-unlisted-stock-valuation-followup.design.md)
> **Date**: 2026-05-22

---

## 0. 배경

엔진 + anchor 단계는 `0f4c42b`에서 5건(PR-E·F·M·N·Q) 완료. 24 anchor 통과, 회귀 0.
다만 사용자가 입력 폼에서 신규 필드(평가차액 행·자동 판정 모드·충당금·보험 준비금)를
입력하려면 **UI 14지점 통합**이 필요. 본 계획서는 그 통합 작업 명세서.

### 핵심 정책 (CLAUDE.md)

- **3중 패턴 강제** (`feedback_mirror_pattern`): UI display fallback이 있는 필드는 API 변환·validate 모두 동일 fallback
- **useEffect → store 미러링 금지** (`feedback_useeffect_store_mirror_forbidden`): cross-field 동기화는 onChange / useMemo
- **명시 입력 강제** (`feedback_silent_omission_full_input_enforcement`): 자동 fallback 금지, 빈값은 validate 차단
- **800줄 정책**: 신규 컴포넌트 sibling 분리 필수
- **enum substring 매칭 금지** (`feedback_enum_substring_match_forbidden`): exact 비교

### 아키텍처 현실 (O3·C1·C2 정정)

본 PR(commit 8f2eda1) UI 아키텍처 사전 조사 결과:

1. **폼 상태 = 엔진 입력 타입 직접 사용**: `EstateItem.unlistedStockValuationV2: UnlistedStockValuationInput` — 별도 FormState 없음
2. **string→number normalize 없음**: `CurrencyInput`이 컴포넌트 내부에서 string↔number 변환 처리. 폼 상태는 number
3. **자산 단위 입력**: 상속세는 여러 `EstateItem`이므로 비상장주식 자산별로 V2 입력이 있을 수 있음 (자산 단위 read/write)
4. **기존 ValuationDeltaTable**: 현재 **display-only** (총액만 표시) — 코드 주석 "입력 행 동적 추가는 F-3 후속" 명시. PR-N은 이를 **input-capable 확장**
5. **필드명 통일**: 기존 `ValuationDeltaRow`(accountName/evaluatedValue/bookValue) vs 신규 엔진 `EvaluationDeltaRow`(accountName/evaluationAmount/bookAmount) — **엔진 타입 우선**, 기존 컴포넌트 필드명 마이그레이션

---

## 1. 14 동기화 지점 현황 (PR별)

| 지점 | 영역 | 파일 | PR-E | PR-F | PR-M | PR-N | PR-Q |
|---|---|---|---|---|---|---|---|
| ① 폼 상태 | `EstateItem.unlistedStockValuationV2` 자산 단위 | ✓ | ✓ | ✓ | ✓ | ✓ |
| ② initial | `createDefaultUnlistedStockV2()` (`UnlistedStockV2Card.tsx`) | ✓ | ✓ | ✓ | ✓ | ✓ |
| ③ normalize | **N/A** (CurrencyInput 내부 string↔number 변환) | — | — | — | — | — |
| ④ API 변환 | `lib/calc/inheritance-api.ts` + `transfer-tax-api-inheritance.ts` | ✓ | ✓ | ✓ | ✓ | ✓ |
| ⑤ UI 위젯 | `components/calc/inheritance/unlisted-stock-v2/` | ✓ (신규 Toggle) | ✓ (신규 Toggle) | ✓ (기존 확장) | ✓ (기존 input-capable 확장) | ✓ (기존 라벨) |
| ⑥ 사이드바 | `components/calc/inheritance/InheritanceSidebar.tsx` + `lib/stores/inheritance-summary.ts` | ✓ | — | — | ✓ | — |
| ⑦ 결과 카드 | `UnlistedStockV2Card.tsx` + `PerShareValuationResultCard.tsx` + `BesshiForm4Buppyo3PrintView.tsx` | ✓ | ✓ | ✓ | ✓ (3쪽 표) | ✓ |
| ⑧ validation | `lib/calc/inheritance-validate.ts` | ✓ | ✓ | ✓ | ✓ | ✓ |
| ⑨ Zod enum 메인 | `lib/validators/unlisted-stock-valuation-v2.schema.ts` | ✓ | ✓ | — | — | — |
| ⑩ Zod refines | 동일 | ✓ | ✓ | — | ✓ | — |
| ⑪ 자산-수준 fallback | **N/A** (양도세 전용 패턴) | — | — | — | — | — |
| ⑫ Zod 입력 객체 정의 | 동일 | ✓ | ✓ | ✓ | ✓ | ✓ |
| ⑬ API body spread | `lib/calc/inheritance-api.ts` (자동 spread) | — | — | — | — | — |
| ⑭ Route handler 엔진 매핑 | `app/api/calc/inheritance/route.ts` + `app/api/calc/gift/route.ts` | ✓ (echo 결과) | ✓ (echo 결과) | — (엔진 통과만) | ✓ (resolveEvaluationDelta 호출) | — |

**유효 동기화 지점**: ③⑪⑬ 모두 N/A (본 PR 아키텍처). 실제 변경 지점:
- PR-E: ①②④⑤⑦⑧⑨⑩⑫⑭ = **10**
- PR-F: ①②④⑤⑦⑧⑨⑩⑫⑭ = **10**
- PR-M: ①②④⑤⑦⑧⑫ = **7**
- PR-N: ①②④⑤⑥⑦⑧⑩⑫⑭ = **10**
- PR-Q: ①②④⑤⑦⑧⑫ = **7**

**총 변경 지점: 44**

---

## 2. PR별 UI 작업 명세

### 2-1. PR-N — 3쪽 평가차액 행 단위 입력 (가장 큰 작업)

**선행 자산**:
- 엔진: `resolveEvaluationDelta(input)` (`evaluation-delta.ts`) — 행 단위 우선 + 총액 fallback
- 기존 UI: `ValuationDeltaTable.tsx` (현재 **display-only**, 총액 표시만, 코드 주석에 "F-3 후속" 명시)
- 기존 필드명: `ValuationDeltaRow`(accountName/**evaluatedValue**/**bookValue**) — 엔진 신규는 (accountName/**evaluationAmount**/**bookAmount**)
- **필드명 정책**: 엔진 타입 우선. 기존 `evaluatedValue`/`bookValue` → `evaluationAmount`/`bookAmount` 마이그레이션 (display-only 기존 사용처 grep 점검)
- **route handler 통합 위치 결정 (M1 정정)**: **엔진 진입점 `evaluateUnlistedStockV2()` 내부에서 `resolveEvaluationDelta()` 호출** (route handler는 단순 spread). 이유: route handler가 비대해지지 않게 + 엔진이 자기완결적

**14지점 작업**:

1. **① 폼 상태**: `UnlistedNetAssetCalculation`에 `evaluationDeltaRows?: EvaluationDeltaRow[]` 단일 통합 배열 추가 (★ 통합비교 정정 — design v2와 정합. 자산·부채는 `category` 필드로 분리)
   - 폼 상태는 number 직접 사용 (CurrencyInput 내부에서 string↔number 변환)
2. **② initial**: 빈 배열 (default OFF — 사용자가 행 추가 시 활성)
3. **③ normalize**: 빈 문자열 → undefined, 행 0개면 array 자체 undefined
4. **④ API 변환**: `lib/calc/inheritance-api.ts`
   ```ts
   // 통합 배열 spread (★ 통합비교 정정)
   if (form.netAssetValueRaw.evaluationDeltaRows?.length) {
     body.unlistedStockValuationV2.netAssetValueRaw.evaluationDeltaRows =
       form.netAssetValueRaw.evaluationDeltaRows;
   }
   // 총액 fallback도 유지 (3중 패턴) — 엔진 진입점 resolveEvaluationDelta가 처리
   ```
5. **⑤ UI 위젯**: `ValuationDeltaTable.tsx` 확장 또는 sibling 분리
   - 자산/부채 2 섹션
   - 각 섹션: 계정과목 input + 평가액 CurrencyInput + 장부금액 CurrencyInput + 차액 derive (read-only)
   - "행 추가" / "행 삭제" 버튼
   - 합계 카드 (자산/부채/평가차액)
   - 사례 6 prefill (8행+3행)
6. **⑥ 사이드바**: `InheritanceSidebar` 평가차액 = 91,548,350 표시
7. **⑦ 결과 카드**: `PerShareValuationResultCard` 또는 `BesshiForm4Buppyo3PrintView`에 3쪽 표 재현 (행 단위)
8. **⑧ validation**: `inheritance-validate.ts`
   - 행 단위 입력 시: 각 행의 accountName 필수 + evaluationAmount/bookAmount 숫자 필수
   - 행 + 총액 동시 입력 가능 (행 우선)
   - 행 미입력 + 총액 미입력 = 평가차액 0 (안전 default)
9. **⑫ Zod 입력 객체**: `unlistedStockValuationV2Schema.netAssetValueRaw`에 `assetDeltaRows: z.array(evaluationDeltaRowSchema).optional()` 추가
10. **⑬ API body spread**: 자동 (spread 패턴)
11. **⑭ Route handler**: `app/api/calc/inheritance/route.ts`에서 `netAssetValueRaw`를 엔진 입력에 전달 시 `resolveEvaluationDelta()` 호출하여 `assetValuationDelta` 도출 — 또는 엔진이 직접 호출하도록 통합

**파일 변경 예상**:
- `lib/stores/inheritance-*.ts` (+30줄)
- `lib/calc/inheritance-api.ts` (+20줄)
- `lib/calc/inheritance-validate.ts` (+30줄)
- `lib/validators/unlisted-stock-valuation-v2.schema.ts` (+15줄)
- `components/calc/inheritance/unlisted-stock-v2/ValuationDeltaTable.tsx` (대폭 확장 — sibling 분리 검토)
- `components/calc/inheritance/unlisted-stock-v2/AssetDeltaRows.tsx` (신규, 800줄 분리 시)
- `components/calc/inheritance/unlisted-stock-v2/LiabilityDeltaRows.tsx` (신규)
- `app/api/calc/inheritance/route.ts` (resolveEvaluationDelta 호출 추가)
- `app/api/calc/gift/route.ts` (gift도 동일)

**예상 작업량**: 1.5~2일 (가장 큰 작업)

**M2 정정 — PR-E·F 엔진 result echo 필드**: 본 PR `UnlistedStockValuationResult`에 echo 필드 신설은 **본 UI 통합 PR 범위 외**. 결과 카드는 `deriveSection22MajorShareholder()` / `judgeIsRealEstateHeavy()` 헬퍼를 UI에서 useMemo로 직접 호출하여 표시 (엔진 result 확장 없이). 엔진 result에 echo 필드를 추가하려면 별도 PR 분리.

### 2-2. PR-E — §22② 최대주주 자동 도출 3-state ToggleCard

**선행 자산**:
- 엔진: `deriveSection22MajorShareholder(input)` (`auto-judgment.ts`) — 보유지분 기준

**14지점 작업**:

1. **① 폼 상태**: `section22MajorShareholderMode: "auto" | "manual_on" | "manual_off"` 추가 (default "auto")
2. **② initial**: `"auto"`
3. **③ normalize**: 기본값 보존
4. **④ API 변환**: mode 따라 `isMaxShareholder` 자동 도출 vs 수동 override
   ```ts
   if (form.section22MajorShareholderMode === "auto") {
     const auto = deriveSection22MajorShareholder({ ownedShares, totalShares });
     body.unlistedStockValuationV2.isMaxShareholder = auto.isSection22Major;
   } else {
     body.unlistedStockValuationV2.isMaxShareholder = form.section22MajorShareholderMode === "manual_on";
   }
   ```
   ⚠️ 단, §22②와 §63③은 다른 개념 — `isMaxShareholder`는 §63③용. PR-E는 별도 echo 필드 필요. **추가 작업: result echo 필드 신설**
5. **⑤ UI 위젯**: `MajorShareholderStockToggle.tsx` 신규
   - 3-state RadioCardGroup
   - 자동 미리보기 카드 (보유지분율 + 판정 결과 violet/slate)
6. **⑦ 결과 카드**: "§22② 최대주주 자동판정 적용" 표시 + LawArticleModal "§22② + 시행령 §53④⑤"
8. **⑧ validation**: auto 모드 시 ownedShares·totalShares 필수
9. **⑨ Zod enum**: `section22MajorShareholderMode` enum 추가
10. **⑩ Zod refines**: auto 모드 + shares 미입력 → refine fail
12. **⑫ Zod 입력 객체**: 동일 schema 확장
13. **⑬ body spread**: spread
14. **⑭ Route handler**: 자동 도출 결과를 result echo에 부착 (`appliedSection22MajorShareholder`)

**파일 변경 예상**: 7 파일 / +120줄
**예상 작업량**: 1일

### 2-3. PR-F — §54⑤ 부동산과다보유 자동 판정 3-state ToggleCard

**선행 자산**: `judgeIsRealEstateHeavy(input)` (`auto-judgment.ts`) — 50% 경계

**14지점 작업**:

1. **① 폼**: `realEstateHeavyMode: "auto" | "manual_on" | "manual_off"` + `totalAssets` + `realEstateAssets` 신규
2. **② initial**: `"auto"` + 0
3. **③ normalize**: 동일
4. **④ API 변환**:
   ```ts
   if (form.realEstateHeavyMode === "auto") {
     const auto = judgeIsRealEstateHeavy({ totalAssets, realEstateAssets });
     body.unlistedStockValuationV2.isRealEstateHeavy = auto.isRealEstateHeavy;
   } else {
     body.unlistedStockValuationV2.isRealEstateHeavy = form.realEstateHeavyMode === "manual_on";
   }
   ```
5. **⑤ UI 위젯**: `RealEstateHeavyToggle.tsx` 신규
   - 3-state RadioCardGroup
   - auto 시: totalAssets + realEstateAssets 입력 + 비율 미리보기 (rose / slate)
   - manual: 토글만
6. **⑦ 결과 카드**: 가중치 반전 미리보기 (3·2 vs 2·3)
8. **⑧ validation**: auto 모드 시 두 자산 필드 필수
9. **⑨⑩⑫**: Zod 확장 + refine

**파일 변경 예상**: 6 파일 / +100줄
**예상 작업량**: 1일

### 2-4. PR-M — 보험법인 §17의2 4호 단서 나·다

**선행 자산**: 엔진 이미 처리 (`net-asset-calc.ts:77~79` insuranceReservePolicy/Extraordinary/Surrender)

**14지점 작업**:

1. **① 폼**: 3 필드 (`insuranceReservePolicyStr`, `insuranceExtraordinaryReserveStr`, `insuranceSurrenderReserveStr`)
2. **② initial**: 빈 문자열
3. **③ normalize**: 빈 문자열 → undefined
4. **④ API 변환**: CurrencyInput 값 → number
5. **⑤ UI 위젯**: `NetAssetCalculationTable.tsx`에 보험법인 토글 추가 + 3 필드 노출
   - "보험사업·보험회사 여부" 토글 ON 시만 3 필드 활성
   - 안내 카드: §17의2 4호 단서 나·다 정확 인용
8. **⑧ validation**: optional, 보험 토글 ON 시 최소 1 필드 입력 권장 (warning)
9. **⑫**: Zod schema (이미 `insuranceReservePolicy: z.number().nonnegative().optional()` 있음 — 라인 95)

**파일 변경 예상**: 4 파일 / +60줄
**예상 작업량**: 0.5일

### 2-5. PR-Q — §17의2 4호 단서 가 (충당금 확정분)

**선행 자산**: 엔진 이미 처리 (`net-asset-calc.ts:73` otherProvision 부채 가산)

**14지점 작업**:

1. **① 폼**: `otherProvisionStr` (이미 있을 가능성 — 별지 양식 ⑮ 매핑)
2. **⑤ UI 위젯**: `NetAssetCalculationTable.tsx`에 ⑮ 행 라벨 명확화
   - "기타 충당금 중 평가기준일 비용 확정분 ⑮"
   - 안내 카드: §17의2 4호 단서 가 (모든 법인 적용 — 보험법인 한정 아님)
8. **⑧ validation**: optional
9. **⑫**: Zod schema 정합 확인 (이미 있을 가능성)

**파일 변경 예상**: 2 파일 / +30줄 (라벨·안내 카드만)
**예상 작업량**: 0.3일

---

## 3. 실행 순서 (권장)

```
Phase A: 사전 조사 (0.5일)
  - lib/stores/inheritance-*.ts 확인 — 비상장주식 V2 폼 상태 구조
  - components/calc/inheritance/unlisted-stock-v2/ 컴포넌트 9개 review
  - lib/validators/unlisted-stock-valuation-v2.schema.ts 현행 schema 파악

Phase B: PR-Q + PR-M (0.3~0.5일) — 가장 작은 변경, 라벨·토글·안내 카드만 (I1 정정)
  - 라벨 정정 + 토글·안내 카드 추가
  - validation 정합

Phase C: PR-E + PR-F (2일) — 자동 판정 컴포넌트 신규
  - MajorShareholderStockToggle 신규
  - RealEstateHeavyToggle 신규
  - 자동 판정 미리보기 카드
  - Zod refine + result echo

Phase D: PR-N (1.5~2일) — 가장 큰 작업
  - ValuationDeltaTable 대폭 확장 (또는 sibling 분리)
  - 행 추가/삭제 UX
  - 사례 6 prefill (선택)
  - 결과 카드 3쪽 표 재현
  - Route handler resolveEvaluationDelta 통합

Phase E: 통합 검증 (0.5일)
  - 브라우저 수동 시나리오 (사례 6 풀 입력 → 별지 양식 미리보기)
  - npm run typecheck 0 에러
  - 전체 회귀 0 (4,024 PASS 기준)
  - ui-engine-sync-checker read-only 검증

합계: 약 4.8~5.5일

### 3-1. 섹션 순서 (디자인 §2-5 cross-link)

본 UI 통합은 선행 PR `UnlistedStockV2Card.tsx` orchestrator에 다음 12 섹션 순서로 배치:

1. 평가대상 비상장법인 (기존)
2. 순자산만 평가 사유 (기존)
3. **부동산과다 자동 판정** (🆕 PR-F)
4. **평가차액 (3쪽)** (🔧 PR-N — 의존성 순서로 2쪽보다 먼저)
5. 순자산가액 (2쪽, 기존 + PR-M·Q 확장)
6. 1주당 순자산가액 (기존)
7. 영업권 (5쪽, 기존)
8. 1주당 순손익가액 (6쪽, 기존)
9. 자본금 변동 (기존)
10. **최대주주 §22② 자동 판정** (🆕 PR-E)
11. 결과 카드 (기존 + PR-E·F echo 라인)
12. 별지 양식 미리보기 (기존 + PR-N 3쪽 표)
```

---

## 4. UI 컴포넌트 신규/확장 요약 (I2 정정 — 기존 vs 신규 명확화)

| 컴포넌트 | 분류 | 작업 |
|---|---|---|
| `MajorShareholderStockToggle.tsx` | 🆕 **신규** | 3-state RadioCardGroup + 미리보기 카드 + LawArticleModal |
| `RealEstateHeavyToggle.tsx` | 🆕 **신규** | 3-state RadioCardGroup + 비율 미리보기 + 자산 입력 2 필드 |
| `ValuationDeltaTable.tsx` | 🔧 **기존 → input-capable 확장** | 현재 display-only(props로 총액만 수신) → 자산/부채 행 단위 input 추가. 800줄 근접 시 분리 |
| `AssetDeltaRows.tsx` | 🆕 신규 (분리 시) | ValuationDeltaTable 800줄 초과 대비 sibling |
| `LiabilityDeltaRows.tsx` | 🆕 신규 (분리 시) | 동일 |
| `NetAssetCalculationTable.tsx` | 🔧 **기존 확장** | 보험법인 토글 ON 시 3 필드(insuranceReservePolicy 등) 노출 + ⑮ 라벨 정정 (§17의2 4호 단서 가) |
| `UnlistedStockV2Card.tsx` (orchestrator) | 🔧 기존 확장 | 신규 Toggle 2개 import + props 전달 + Card 레이아웃 추가 |
| `BesshiForm4Buppyo3PrintView.tsx` | 🔧 **기존 확장** | 3쪽 표 행 단위 렌더링 (assetRows/liabilityRows derive) + 새 필드 매핑 |
| `InheritanceSidebar.tsx` | 🔧 기존 확장 | 평가차액·자동판정 표시 (선택) |
| `lib/stores/inheritance-summary.ts` | 🔧 기존 확장 | computeInheritanceSummary 평가차액 합계 도출 |

---

## 5. Definition of Done

- [ ] 5 PR × 유효 변경 지점 = **44 변경 지점** (③⑪⑬ N/A 반영) 전수 적용 + grep 자가 점검
- [ ] 신규 컴포넌트 5개 (Toggle 2 + DeltaTable 분리 2 + 행 컴포넌트 1)
- [ ] 사례 6 풀 입력 시나리오 브라우저 수동 검증 (Network 탭 신규 필드 송신 확인)
- [ ] 전체 회귀 0건 (4,024 PASS 기준 유지)
- [ ] `npm run typecheck` 0 에러
- [ ] `ui-engine-sync-checker` read-only 매트릭스 0 누락
- [ ] 3중 패턴 (UI display fallback + API + validate) 자가 점검
- [ ] useEffect → store 미러링 grep 0 (사용 시 즉시 교체)
- [ ] enum substring 매칭 grep 0 (`.includes(` / `.startsWith(` 검사)
- [ ] 800줄 정책 (PostToolUse hook 0 경고)
- [ ] **엔진 변경 최소화** (O5 정정): PR-N route handler 통합 1줄(`resolveEvaluationDelta()` 호출) 외 엔진 코드 변경 X. 24 anchor 회귀 0 보장
- [ ] PR-N route handler 통합 시 `inheritance-unlisted-stock-valuation.engine.design.md` 갱신 동반

## 5-0. 신규 anchor (디자인 §6 cross-link)

본 UI 통합 PR은 엔진 변경 최소(PR-N 진입점 1줄). 신규 anchor 5건:

| anchor ID | 검증 | 파일 |
|---|---|---|
| UI-N-1 | `resolveEvaluationDelta()` 엔진 진입점 통합 — 행 단위 입력 → 평가차액 자동 도출 | `__tests__/tax-engine/property-valuation/orchestrator-evaluation-delta.test.ts` 신규 |
| UI-N-2 | 행 미입력 시 총액 `assetValuationDelta` fallback (회귀, 사례 6 동일 결과) | 동일 |
| UI-EF-1 | API 변환 `realEstateHeavyMode="auto"` + 자산 입력 → `isRealEstateHeavy` 자동 도출 | `__tests__/calc/inheritance-api-pr-ef.test.ts` 신규 |
| UI-EF-2 | API 변환 `manual_on` → true override | 동일 |
| UI-VAL-1 | validate `realEstateHeavyMode="auto"` + 자산 미입력 → 차단 | `__tests__/calc/inheritance-validate-pr-ef.test.ts` 신규 |

## 5-1. 사례 6 풀 입력 검증 시나리오 (S2 정정 — Phase E 기준값)

브라우저 수동 검증용 입력 표:

| 단계 | 입력값 | 기대 출력 |
|---|---|---|
| 자산 행 8건 | 미수이자 5,744,770/5,300,000 / 매출채권 299,050,000/298,534,500 / 단기대여금 493,000,000/495,000,000 / 상품 49,527,500/55,027,500 / 투자유가증권 275,554,500/250,887,000 / 외화채권 145,300,200/150,670,350 / 토지 400,550,000/330,500,000 / 기계장치 334,410,000/309,893,470 | 자산 합계 ① = 107,324,150 |
| 부채 행 3건 | 외화채무 185,335,800/200,560,000 / 손해배상금 26,000,000/0 / 보증채무 5,000,000/0 | 부채 합계 ② = 15,775,800 |
| 평가차액 | (①−②) | 가 = **91,548,350** → 2쪽 ② 기재 |
| §22② 자동 판정 | ownedShares=26,000 / totalShares=50,000 | isSection22Major=true, 52% violet 배지 |
| §54⑤ 자동 판정 | totalAssets=2,476,889,520 / realEstateAssets=400,550,000 | isRealEstateHeavy=false, 16.16% slate 배지 |
| 결과 카드 | 본 PR 사례 6 anchor 일치 | ⑥=10,910 / ⑦=10,910(비최대) / ⑧=13,092(최대 ×1.2) / 상속재산가액 340,392,000 |

---

## 6. 모호 분기 / 후속 PR

| 항목 | 결정 | 후속 |
|---|---|---|
| PR-E §22② vs §63③ 동시 충돌 | §22②는 추가공제 제외, §63③은 할증평가 — 본 PR-E는 §22②만 다룸 | §63③ 할증은 본 PR `max-shareholder-premium.ts` 그대로 |
| PR-F 자동 판정 시 manual override 우선순위 | 사용자 명시 ON/OFF > 자동 결과 | `realEstateHeavyMode` 3-state |
| PR-N 행 단위 + 총액 동시 입력 | 행 단위 우선 (3중 패턴 §6-1 헬퍼) | 회귀 anchor N-3b·N-3d |
| PR-N 행 추가/삭제 UX | 자유 추가 (max 자산 50행·부채 30행) | 800줄 정책 한도 |
| PR-N 사례 6 prefill 버튼 | **본 PR 범위 외** (I3 정정) — UX 검토 후 별도 PR. 본 PR은 빈 표에서 사용자 직접 입력 |
| PR-M 보험법인 토글 default | OFF (일반법인 회귀 보호) | M-3 anchor |
| PR-Q 충당금 확정분 라벨 (S1·L1 정정) | "⑮ 기타 (충당금 중 평가기준일 현재 비용으로 확정된 것)" — KoreanLaw §17의2 4호 단서 가 본문 직접 인용 | LawArticleModal 출처 라벨 |
| 엔진 result 타입 확장 여부 (I4) | **본 PR-UI 통합 범위 외** — PR-E·F result echo 필드 신설은 별도 PR. UI는 useMemo로 헬퍼 직접 호출 | M2와 cross-link |
| PR-E·F 자동 판정 결과 표시 위치 (O7) | `UnlistedStockV2Card` 본체 내부 — Toggle 위젯 직하 미리보기 카드 + 결과 카드(`PerShareValuationResultCard`)에 echo 라인 추가 | useMemo 호출 |
| PR-N route handler vs 엔진 통합 (O6) | **엔진 진입점 `evaluateUnlistedStockV2()` 내부에서 `resolveEvaluationDelta()` 호출** — 본 UI 통합 PR에서 엔진 본체 1줄 수정 필요. `inheritance-unlisted-stock-valuation.engine.design.md` 갱신 동반 | engine.design.md cross-link |

---

## 7. 참고 자료

- 엔진 + anchor: commit `0f4c42b` (PR-A·B·C·D + E·F·M·N·Q)
- 후속 계획서 v4: [`inheritance-unlisted-stock-valuation-followup.plan.md`](./inheritance-unlisted-stock-valuation-followup.plan.md)
- 후속 디자인 v3: [`inheritance-unlisted-stock-valuation-followup.design.md`](../02-design/features/inheritance-unlisted-stock-valuation-followup.design.md)
- 본 PR UI Design (선행): [`inheritance-unlisted-stock-valuation.ui.design.md`](../02-design/features/inheritance-unlisted-stock-valuation.ui.design.md)
- CLAUDE.md 14 동기화 지점 + 3중 패턴 정책
- 정책 메모리: `feedback_mirror_pattern`, `feedback_useeffect_store_mirror_forbidden`, `feedback_silent_omission_full_input_enforcement`, `feedback_enum_substring_match_forbidden`, `feedback_explicit_prop_mapping_strip`, `feedback_store_default_vs_ui_display_fallback`, `feedback_three_state_optional_mode_toggle`, `feedback_dialog_data_discard_confirm`, `feedback_800line_split_export_preservation`

---

## 8. 다음 행동

1. ☐ 사용자 승인 후 Phase A 사전 조사 착수 (lib/stores + components 9개 review)
2. ☐ Phase B (PR-Q·M) 라벨 정정 + 안내 카드 부터 시작 — 가장 작은 변경
3. ☐ Phase C (PR-E·F) 자동 판정 컴포넌트 신규 — 3-state RadioCardGroup 패턴
4. ☐ Phase D (PR-N) ValuationDeltaTable 행 단위 확장 — sibling 분리 800줄 정책
5. ☐ Phase E 통합 검증 — 브라우저 수동 + 회귀 + ui-engine-sync-checker
