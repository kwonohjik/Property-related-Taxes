# 비상장주식 평가 — 이력 자동조회 모달 (PR-H) 계획서

> **Status**: Plan — Design·Do 진입 전 사용자 승인 대기
> **Source**: `docs/00-pm/inheritance-unlisted-stock-valuation-followup.plan.md` §3 **PR-H (F-5)**
> **Pattern**: memory `history-lookup-modal` skill + `components/calc/gift/PriorGiftHistoryModal.tsx` 모범 사례
> **Companion**: Design 단계에 `docs/02-design/features/inheritance-unlisted-stock-history-lookup.design.md` 작성 예정
> **Date**: 2026-05-24
> **Author**: claude (PDCA Plan)

---

## 1. 배경 및 목표

### 1.1 현재 상태

상속세·증여세 마법사에서 비상장주식 평가(`unlistedStockValuationV2` 모드)는 25+ 필드(법인명·평가기준일·발행주식·3년 사업연도 순손익·재무상태표 17필드·자본금변동·할증 등)를 매번 수동 입력해야 한다.

### 1.2 문제 시나리오

- **동일 법인 반복 평가**: 가족 4명이 동일 ㈜A 주식을 각자 다른 비율로 상속/증여받을 때, 법인 정보(재무상태표·순손익·자본금)는 모두 동일하지만 평가기준일·보유주식수만 다름 → **20+ 필드 4회 중복 입력**
- **재평가 시나리오**: 동일 평가기준일에 한 번 계산한 후 보유주식수만 바꿔 재평가할 때 → 입력 데이터 분실 시 처음부터 다시
- **세무사 모드**: 의뢰인별 비상장주식 이력 관리·재활용 필요

### 1.3 목표

**상속세·증여세 마법사 → 비상장주식 자산 카드**에서 "📂 이력 조회" 버튼 클릭 시:
1. IndexedDB의 동일 사용자(또는 의뢰인) 비상장주식 평가 이력 표시
2. 사용자 선택 → 25+ 필드 자동 채움
3. 이후 사용자가 평가기준일·보유주식수 등만 수정 가능
4. `sourceCalculationId` 메타로 출처 추적 (PriorGiftHistoryModal 동일 패턴)

### 1.4 사용자 인터뷰 (사전 결정 필요)

| # | 질문 | 옵션 | 디폴트 |
|---|---|---|---|
| Q1 | 자동 채움 범위 | A. 모든 25+ 필드 / B. 법인 정보만(평가기준일·보유주식 제외) | **B 권장** (재평가 유연성) |
| Q2 | 후보 추출 기준 | A. 동일 법인명(`corpName`) 매칭 / B. 모든 이력 / C. corpName + 평가기준일 ±3개월 | **A 권장** (메모리 효율 + 명확) |
| Q3 | 부분 자동 채움 후 수정 시 | A. `sourceCalculationId` 메타 유지 / B. 첫 수정 시 메타 제거 | **B 권장** (memory `history-lookup-modal` 정책 동일) |
| Q4 | 모달 진입점 | A. 비상장주식 자산 카드 상단 버튼 / B. 폼 첫 진입 시 자동 모달 | **A 권장** (강제 노출 회피) |
| Q5 | 후보 없을 때 표시 | A. 모달 자체 열지 않음 + toast 안내 / B. 빈 모달 + 안내 메시지 | **B 권장** (사용자 인지) |
| Q6 | 상속·증여 cross-기록 활용 | A. 상속 이력 → 증여 모드에서도 조회 가능 / B. 모드별 격리 | **A 권장** (법인 정보 공용) |
| Q7 | 평가기준일 자동 동기화 | A. 사용자 입력 그대로 유지 / B. 이력 선택 시 평가기준일도 prefill | **A 권장** (재평가 케이스 보호) |

---

## 2. 법령·정책 정합성

### 2.1 법령 측면 — 영향 없음

비상장주식 평가 산식(상증령 §54·§55·§56)은 **입력 데이터의 출처와 무관**. 본 PR은 순수 UX 개선으로 법령 검증 불필요.

### 2.2 정책 측면

- memory `history-lookup-modal` skill 정책 **전수 적용**:
  - `lib/calc/<mediator>.ts` 단일 모듈
  - `filterCandidates` 순수 함수 (records 인자만)
  - Dialog 기반 모달 (shadcn `@/components/ui/dialog`)
  - `sourceCalculationId` 메타
  - **자동 채움 후 수정 시 배지 제거** (Q3 B안)

- **참고 구현 (single source of truth)**:
  - `lib/calc/prior-gift-lookup.ts` (294줄) — 필터·후보 추출·변환
  - `lib/calc/family-business-inheritance-lookup.ts` — 영리법인 사전증여 1-클릭 import
  - `components/calc/gift/PriorGiftHistoryModal.tsx` — Dialog UI 패턴

---

## 3. 작업 범위

### 3.1 신규 모듈

```
lib/calc/
├── unlisted-stock-valuation-lookup.ts          # ★ 신규 (~250줄)
│   - UnlistedStockCandidate 타입 (corpName·evaluationDate·grossValuation·perShareValue 등)
│   - filterUnlistedStockCandidates(records, currentClientId, currentCorpName?, excludeIds)
│   - candidateToUnlistedStockInput(candidate): Partial<UnlistedStockValuationInput>
│     - Q1 B안: 법인 정보만 (corpName·businessStartDate·faceValuePerShare·totalShares·
                fiscalYears·capitalChanges·netAssetValueRaw·capitalizationRate·companySize 등)
│     - 평가기준일·보유주식수·isMaxShareholder는 제외 (재평가 유연성)
│   - LookupWarning 4종 (corp_missing·result_missing·excluded·different_client)
│
components/calc/inheritance/unlisted-stock-v2/
├── UnlistedStockHistoryModal.tsx               # ★ 신규 (~180줄)
│   - Dialog 모달 + 후보 카드 목록 + 검색·필터
│   - "📂 이력 조회" 버튼 → 모달 open
│   - 선택 시 onSelect(partialInput) 콜백 + 모달 close
│   - hasInnerPriorGifts 패턴 차용 — 동일 법인 다회 평가 시 sky 배지
│
└── UnlistedStockV2Card.tsx                     # 수정 (+30줄)
    - 카드 상단에 HistoryLookupButton 추가
    - onSelect callback: partial input → setForm 머지 (평가기준일·보유주식수는 보존)
    - sourceCalculationId 메타 부착 + 사용자 수정 시 자동 제거 (mirror-pattern)
```

### 3.2 단위주 vs PriorGiftHistoryModal 차이점

| 항목 | PriorGiftHistoryModal | UnlistedStockHistoryModal |
|---|---|---|
| 후보 추출 키 | donor (증여자 관계) | corpName (법인명) |
| 그룹화 | same_group(§47) vs other | 동일 법인 vs 다른 법인 |
| 자동 채움 범위 | 전체 PriorGift 객체 1건 | Partial 입력 (Q1 B안) |
| 시간 제약 | 10년 합산 룰 (§47①) | 없음 — 법인 정보는 시점 무관 |
| 후보 정렬 | giftDate desc | evaluationDate desc |
| 모드 격리 | gift만 (상속세 → inheritance 별도 함수) | 상속·증여 cross (Q6 A안) |

---

## 4. 케이스 매트릭스 (anchor 대상)

### 4.1 필터·후보 추출 anchor

| ID | 시나리오 | 입력 records | 기대 후보 |
|---|---|---|---|
| H-1 | 동일 법인 1건 매칭 (상속) | corpName "㈜A" 1건 이력 + 현재 자산 corpName "㈜A" | 후보 1건 |
| H-2 | 동일 법인 + 다른 법인 혼재 | "㈜A" 2건 + "㈜B" 1건 + 현재 "㈜A" | 후보 2건 (㈜A만) |
| H-3 | corpName 누락 이력 | 일부 record.corpName 미입력 | warnings.corp_missing |
| H-4 | resultData 손상 | 일부 result.totalValuation 누락 | warnings.result_missing |
| H-5 | excludeCalculationIds | 이미 자산 목록에 추가된 회차 1건 | warnings.excluded |
| H-6 | 다른 의뢰인 격리 (세무사 모드) | record.clientId !== currentClientId | warnings.different_client |
| H-7 | 상속·증여 cross 조회 (Q6 A안) | 증여 모드에서 상속 이력 1건 + 증여 이력 1건 | 후보 2건 모두 |
| H-8 | 빈 records | records = [] | candidates = [], warnings = [] |
| H-9 | 정렬 검증 — evaluationDate desc | 2023·2024·2022 3건 | [2024·2023·2022] |

### 4.2 자동 채움 anchor (candidateToUnlistedStockInput)

| ID | 시나리오 | 검증 |
|---|---|---|
| H-10 | Q1 B안 — 법인 정보만 prefill | result에 corpName·businessStartDate·재무상태표 17필드·순손익 3년 모두 포함, 평가기준일·ownedShares·isMaxShareholder는 **undefined** |
| H-11 | 자본금변동 prefill | capitalChanges 배열 그대로 복사 |
| H-12 | evaluationDeltaRows prefill (PR-N 호환) | 자산·부채 행 단위 입력 그대로 복사 |
| H-13 | netAssetOnlyReason 보존 | §54④ 1·2·3·5·6호 사유 그대로 prefill |
| H-14 | 보험사업 PR-M 필드 보존 | insuranceReservePolicy 등 3필드 prefill |
| H-15 | Date 직렬화 round-trip | record.inputData(JSON string) → Date 복원 (lib/api/date-coerce.ts) |

### 4.3 UI 통합 anchor (RTL)

| ID | 시나리오 | 검증 |
|---|---|---|
| H-16 | "📂 이력 조회" 버튼 클릭 → Dialog open | `getByRole("dialog")` |
| H-17 | 후보 카드 클릭 → onSelect 호출 + 모달 close | mock callback + `queryByRole("dialog")` null |
| H-18 | 선택 후 sourceCalculationId 부착 | form.sourceCalculationId === candidate.calculationId |
| H-19 | 사용자가 corpName 수정 시 sourceCalculationId 제거 | mirror-pattern — onChange에서 자동 |
| H-20 | 평가기준일·보유주식수 보존 (Q1 B안 검증) | prefill 후 form.evaluationDate·ownedShares는 사용자 입력 그대로 |

**총 20 anchor** (H-1~H-20).

---

## 5. 14 동기화 지점 매핑

신규 mediator + 모달 + 카드 수정. 다음 지점 영향:

| # | 지점 | 본 PR 작업 |
|---|---|---|
| ① | 폼 상태 타입 | `sourceCalculationId?: string` UnlistedStockValuationInput에 추가 |
| ② | initial value | undefined (이력 미선택 시) |
| ③ | normalize | 없음 (optional 메타) |
| ④ | API 변환 | `lib/calc/inheritance-api.ts` — sourceCalculationId는 엔진 미전달 (UI 전용 메타) |
| ⑤ | UI 위젯 | `UnlistedStockHistoryModal` + `UnlistedStockV2Card` 버튼 |
| ⑥ | 사이드바 합계 | 없음 |
| ⑦ | 결과 카드 | "이력 출처: ㈜A 2024-01-20 평가" 작은 배지 (선택적) |
| ⑧ | Validation | sourceCalculationId는 검증 없음 (메타) |
| ⑨~⑭ | Zod·route·body spread | sourceCalculationId optional string 추가 |

**핵심**: UI 메타 1필드 추가뿐 — 엔진 결과·산식 무영향. 회귀 위험 최소.

---

## 6. 작업 분해 (Phase 단위)

| Phase | 산출물 | 예상 시간 |
|---|---|---|
| **A. Design** | `docs/02-design/features/inheritance-unlisted-stock-history-lookup.design.md` — UnlistedStockCandidate 타입·filterCandidates 알고리즘·Dialog 와이어프레임·20 anchor 매트릭스 | 45분 |
| **B. Pre-Do anchor** | H-1·H-10 우선 작성·실패 확인 → Design 환류 | 20분 |
| **C. mediator 신규** | `lib/calc/unlisted-stock-valuation-lookup.ts` (~250줄) — 타입·filterCandidates·candidateToInput | 90분 |
| **D. UnlistedStockHistoryModal** | `components/calc/inheritance/unlisted-stock-v2/UnlistedStockHistoryModal.tsx` (~180줄) — Dialog + 카드 목록 + 검색 | 90분 |
| **E. UnlistedStockV2Card 통합** | 카드 상단 "📂 이력 조회" 버튼 + onSelect 머지 로직 + sourceCalculationId mirror-pattern | 45분 |
| **F. Zod·타입 동기화** | `sourceCalculationId?: string` ① ② ⑨ 추가 + inheritance-validate 확인 | 30분 |
| **G. anchor 20건** | `__tests__/calc/unlisted-stock-valuation-lookup.test.ts` (필터·변환 unit) + `__tests__/components/UnlistedStockHistoryModal.test.tsx` (RTL) | 120분 |
| **H. 브라우저 수동 확인** | 상속세 마법사 → 비상장주식 V2 추가 → 사례 6 입력·저장 → 새 자산 추가 → 이력 조회 → prefill 동작 확인 | 30분 |

**총 예상 시간: 약 7시간** (1일 1회 PDCA)

---

## 7. Definition of Done

- [ ] 20 anchor (H-1 ~ H-20) 모두 통과
- [ ] 기존 비상장주식 회귀 0건 (`__tests__/tax-engine/property-valuation/` 141건 + `besshi-form-full-replica` 15건 + PR-I 8건 = 164건)
- [ ] memory `history-lookup-modal` skill 정책 전수 준수:
  - mediator 단일 모듈
  - filterCandidates 순수 함수 (records 인자만)
  - Dialog 기반 모달
  - sourceCalculationId 메타
  - 사용자 수정 시 메타 자동 제거 (mirror-pattern)
- [ ] PriorGiftHistoryModal과 동일한 정책·UI 패턴 (코드 비교 grep 검증)
- [ ] 800줄 정책 — 모든 신규 파일 ≤ 250줄
- [ ] `npx tsc --noEmit` 0건
- [ ] `npx vitest run` 전체 회귀 통과
- [ ] 브라우저 수동 확인 — 상속세·증여세 모드 양쪽
- [ ] (선택) 결과 카드에 이력 출처 배지 표시

---

## 8. 리스크 / 비고

- **Q6 cross-mode 조회 (상속↔증여)**: 상속 이력의 `unlistedStockValuationV2`와 증여 이력의 동일 구조 호환성 확인 필요. 양쪽 모두 `EstateItem.unlistedStockValuationV2` 동일 타입 사용 → 호환성 확보됨.
- **재무상태표 17필드 + evaluationDeltaRows 호환**: PR-N에서 추가된 행 단위 입력(`evaluationDeltaRows`)도 prefill 대상 — 누락 시 자산총액 합계 ⑧ 변경됨. 자기일관성 anchor H-12 강제.
- **세무사 모드 격리**: PriorGiftHistoryModal과 동일하게 `record.clientId !== currentClientId` 격리 보장 — anchor H-6.
- **`sourceCalculationId`는 엔진 미전달**: 순수 UI 메타. ④ API 변환에서 strip — 엔진 input 변경 0건.
- **모달 진입점 위치**: 비상장주식 V2 카드 상단(`UnlistedStockV2Card`)이 가장 자연스러움. 자산 추가 버튼 옆 globalsearch 등 다른 위치는 후속 N-1.

---

## 9. 후속 PR 후보 (본 PR 범위 외)

- **N-1**: 마법사 자산 추가 메뉴에서 "이력에서 비상장주식 추가" 단축 진입점
- **N-2**: 이력 조회 모달에 사용자 메모 (record.memo) 표시 — 법인 식별 보조
- **N-3**: 동일 법인 다회 평가 시 "최신 1건 자동 추천" — Q3 변형
- **N-4**: 평가기준일 ±3개월 범위 자동 추천 (Q2 C안 일부)

---

## 10. 승인 요청

본 계획서로 진행해도 되는지 확인 부탁드립니다. 핵심 결정 사항:

1. **Q1 B안 (법인 정보만 prefill)** — 평가기준일·보유주식수·할증 여부는 사용자 입력 보존
2. **Q2 A안 (corpName 매칭)** — 메모리 효율 + 명확한 그룹화
3. **Q3 B안 (수정 시 메타 제거)** — memory `history-lookup-modal` 정책 동일
4. **Q4 A안 (UnlistedStockV2Card 카드 상단 버튼)** — 강제 노출 회피
5. **Q5 B안 (빈 모달 + 안내)** — 사용자 인지 향상
6. **Q6 A안 (상속·증여 cross 조회)** — 법인 정보 공용 가능
7. **Q7 A안 (평가기준일 사용자 입력 유지)** — 재평가 케이스 보호
8. **mediator 1파일 + 모달 1파일 + 카드 수정** 3 산출물
9. **20 anchor 매트릭스** (필터 9 + 변환 6 + RTL 5)
10. **`sourceCalculationId` 메타 1필드만 ① ② ⑨ 추가** — 엔진·산식 무영향
