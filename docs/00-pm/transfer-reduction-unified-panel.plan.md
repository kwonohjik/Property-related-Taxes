# 양도세 감면 통합 패널 구축 계획 (5개 카테고리 + 펼침 라디오)

> **작성일**: 2026-05-06
> **상태**: ✅ **구현 완료** (커밋 116a03fe · 2026-05-07) — 2026-08-04 코드 실측 · 2026-08-05 인용 PR·커밋 재검증(종전 헤더는 stale이었음).
> ~~종전 표기: Plan (Round 8 직전)~~
> **선행 산출물**:
>   - `docs/00-pm/transfer-reduction-expansion.plan.md` (23개 조문 확장)
>   - `docs/02-design/features/transfer-reduction-99-3.engine.design.md` (Phase 2 §99의3)
>   - 사용자 의사결정 (2026-05-06): 5개 평면 + 별도 펼침 패널 → **통합 패널**

---

## 1. 배경

### 1.1 현재 구조 (Phase 2 종료 시점)

```
┌─ 자산 1 ─────────────────────────────────┐
│ [평면 5개 체크박스]                          │
│ ☐ 자경농지 감면 (§69)                        │
│ ☐ 장기임대주택 감면 (§97의3 단일)             │
│ ☐ 신축주택 감면 (§99 단일)                   │
│ ☐ 미분양주택 감면 (§98의3 단일)              │
│ ☐ 공익사업 수용 감면 (§77)                   │
│                                              │
│ [Phase 2 안내 박스 — 23개 조문 골격]          │
│                                              │
│ [별도 펼침 패널 3개]                          │
│ ▶ 장기임대주택 §97 시리즈 [활성 N / 전체 6]   │
│ ▶ 신축주택 §99 시리즈 [활성 N / 전체 4]       │
│ ▶ 미분양주택 §98·§99의2 [활성 N / 전체 10]   │
└─────────────────────────────────────────────┘
```

**문제점**:
- 평면 5개와 펼침 3개가 **이중 노출** (예: §97의3이 평면에도 있고 펼침 안에도 있음)
- 사용자가 어디서 선택해야 할지 혼란
- 화면 스크롤 길어짐
- 시각적 노이즈 (Phase 2 안내 박스 + stub 19개 disabled)

### 1.2 목표 구조 (Round 8 완료 시점)

```
┌─ 자산 1 ─────────────────────────────────┐
│ ☐ 자경농지 감면 (§69)                        │ ← 단일 (펼침 X)
│                                              │
│ ▶ 장기임대주택  활성 1 / 전체 6               │ ← 펼침 헤더 (라디오 그룹)
│   ◉ §97의3 — 장특공제율 70% (10년+ 임대)    │
│   ◯ §97 본문 — 50% [시한 종료]              │
│   ◯ §97의2 — 100% 면제 [시한 종료]          │
│   ◯ §97의4 — 장특공제 추가율 [구현 예정]     │
│   ◯ §97의5 — 100% 감면 [시한 종료]          │
│                                              │
│ ▶ 신축주택  활성 1 / 전체 4                  │
│   ◯ §99 — 5년 100%/안분 [시한 종료]         │
│   ◉ §99의3 — 5년 100%/안분 (2001~2003)     │
│   ◯ §99의4 (농어촌·고향) [구현 예정]         │
│                                              │
│ ▶ 미분양주택  활성 1 / 전체 10                │
│   ...                                         │
│                                              │
│ ☐ 공익사업 수용 감면 (§77)                   │ ← 단일 (펼침 X)
└─────────────────────────────────────────────┘
```

**개선점**:
- **5개 카테고리 그대로 유지** (학습 비용 0)
- 각 카테고리 = 단일 entity (체크박스) 또는 그룹 entity (펼침 + 라디오)
- 카테고리 내 라디오 → 조특법 §127② / §97의3 ② / §97의5 ② **중복배제 자연 강제**
- 카테고리 간 체크박스 → 자경+공익 등 별도 토지 시 동시 선택 가능

---

## 2. 사용자 의사결정 필요 항목 (Round 8 진입 전 확정)

| # | 항목 | 옵션 | 권장 |
|---|---|---|---|
| 1 | §99의2 카테고리 분류 | (a) 미분양 (b) 신축 | **(a) 미분양** — 효과상 미분양과 동일 (시드 정정 시 §99의2로 매핑된 대로) |
| 2 | 시한 외 항목 표시 강도 | (a) disabled + 회색 (b) 숨김 (c) 펼침 안에서만 보임 | **(a) disabled + 회색** — 사용자가 적용 가능 시점 자료 학습 |
| 3 | Phase 1 stub 19개 노출 | (a) 라디오 옵션으로 표시 + disabled (b) 펼침에서 제외 | **(a) 표시 + disabled + "Phase 2~ 구현 예정" tooltip** — 향후 진입점 |
| 4 | legacy ID(`long_term_rental` 등) deprecated 정책 | (a) 즉시 제거 (b) Round 8에서는 자동변환만, 1개월 후 제거 (c) 영구 alias 유지 | **(b) 자동변환 + 1개월 후 제거** — 기존 이력 호환 + 정리 |
| 5 | 카테고리 라디오에서 "선택 해제" 허용 | (a) 라디오 그룹 → 한번 선택하면 다른 항목으로만 변경 (b) 같은 항목 재클릭 시 해제 가능 | **(b) 재클릭 해제** — 토글 가능 (체크박스 직관) |
| 6 | 카테고리 헤더 자체 클릭 시 동작 | (a) 펼침 토글만 (b) 펼침 + "이 카테고리 적용" 같은 의미 부여 | **(a) 펼침 토글만** — 헤더 = navigation, 선택 = 라디오 |

답변 주시면 그 결정사항을 반영하여 Round 8 진입.

---

## 3. 작업 단계 (Round 8.1~8.6)

### 8.1 데이터·타입 정비 (영향 0~소)

#### 8.1-A. 카테고리 메타데이터 확장
- `lib/tax-engine/transfer-reductions/metadata.ts`
  - `ReductionMetadata`에 `isLegacyAlias?: boolean` (deprecated 표시)
  - `ReductionCategory` 그대로 유지 (5개 → 4개로 정리: rental·new_housing·unsold_housing·standalone)
  - `getCategoryUiSchema()` 신규 — 카테고리별 UI 표시 메타 (단일 vs 그룹, 헤더 라벨, 색상 tone)

#### 8.1-B. 마이그레이션 v4 강화
- `lib/storage/migrations/reduction-reclassification.ts`
  - 기존 `unsold_housing` → `new_99_3` (시기 2001~2003) 또는 `unsold_98_3` (그 외) 정확 분기
  - `long_term_rental` → `rental_97_3` (단순 변환)
  - `new_housing` → `new_99` (시기 1998~1999) 또는 `new_99_3` (시기 2001~2003) 정확 분기
  - 변환 통계 로깅 (P2-1 `analyzeReductionReclassificationImpact` 활용)

#### 8.1-C. legacy ID alias 정책 (옵션 4 (b) 선택 시)
- `transfer-reductions-stub.types.ts`에 legacy 5개 type alias 유지 (1개월)
- `transfer-tax-api-helpers.ts`의 `toEngineReductions` legacy 분기 유지
- 1개월 후 제거 PR 별도

### 8.2 통합 UI 컴포넌트 (영향 중)

#### 8.2-A. `UnifiedReductionPanel.tsx` 신규 작성
- `ReductionExpansion.tsx` 폐지 (분리된 펼침 패널 제거)
- 5개 카테고리 단일 컴포넌트로 통합:
  - **standalone 단일** (자경·공익): 체크박스 1개 + 서브패널 (기존 Step5 평면 형태 유지)
  - **그룹** (장기임대·신축·미분양): 펼침 헤더 + 활성/전체 카운터 + 라디오 그룹 + 본격 입력 폼

#### 8.2-B. `Step5.tsx` 정비
- 기존 `REDUCTION_LABELS` 5개 평면 제거
- `AssetReductionBlock` 내부:
  - 자경 서브패널 (기존)
  - 공익 서브패널 (기존)
  - **`<UnifiedReductionPanel />`** 통합 호출 (장기임대·신축·미분양)
- Phase 2 안내 박스 제거 (통합 후 불필요)

#### 8.2-C. 라디오 그룹 동작
- 카테고리 내 단일 선택 강제 (`reductions[]` 배열에 카테고리당 최대 1개)
- 같은 항목 재클릭 시 해제 (옵션 5 (b))
- `RadioCardGroup` 컴포넌트 활용 (CLAUDE.md 정책 — native radio 신규 작성 금지)

### 8.3 검증 로직 정비 (영향 소)

#### 8.3-A. `transfer-tax-validate.ts`
- 카테고리 내 중복 검증 (`reductions` 배열에 동일 카테고리 type ≥ 2개 차단)
- legacy ID 입력 시 마이그레이션 권고 메시지

#### 8.3-B. Zod schema 검증 강화
- `reductionSchema` discriminatedUnion 그대로 유지 (legacy + 신규 모두 통과)
- API 진입 시 카테고리 중복 refine 추가 (선택)

### 8.4 결과 카드 통합 (영향 소)

- `TransferTaxResultView.tsx`
  - 결과 카드에 카테고리 + 세부 조문 라벨 함께 표시 (예: "장기임대주택 (§97의3)")
  - 기존 5개 평면 라벨 매핑 (`REDUCTION_LABELS_LEGACY`) 제거 또는 alias 처리

### 8.5 anchor 테스트 정정 (영향 중)

- `__tests__/tax-engine/` 의 `long_term_rental` / `new_housing` / `unsold_housing` 사용 fixture 검색 → 신규 ID로 정정
  - 양도세 anchor: 약 30개 추정 (자경·공익 제외)
  - 회귀 테스트 통과 확인 (526 → 526+ 유지)

### 8.6 회귀 검증 + 브라우저 수동

- `npx tsc --noEmit` 0건
- `npx vitest run` 526+ tests passed
- `ui-engine-sync-checker` 에이전트 호출 — 통합 후 14개 동기화 지점 재점검
- **브라우저 수동 확인** (사용자 또는 협력 필요):
  1. 자산 추가
  2. 카테고리 펼침 → 라디오 선택 → 본격 입력
  3. 카테고리 닫고 다시 열어도 선택 유지
  4. 다른 카테고리 추가 선택 (자경 + 신축)
  5. 같은 카테고리 다른 항목 선택 시 기존 해제
  6. 같은 항목 재클릭 시 해제
  7. 계산 → 결과 카드 표시 확인

---

## 4. 14개 동기화 지점 재점검 (Round 8 완료 후)

| # | 지점 | Round 8 영향 |
|---|---|---|
| ① 폼 상태 타입 | `reductions[]` 구조 그대로 — 신규 ID는 Phase 2에서 추가됨. **변경 없음** |
| ② initial value | 라디오 토글 시 `getDefaultReduction(id)` — 기존 패턴 유지 |
| ③ normalize | 마이그레이션 v4 강화 (8.1-B) — 자동변환 정확화 |
| ④ API 변환 | legacy 5개 + 신규 23개 분기 — 8.1-C alias 정책 반영 |
| ⑤ UI 입력 위젯 | **`UnifiedReductionPanel.tsx` 신규** + `Step5.tsx` 정비 |
| ⑥ 사이드바 합계 | N/A (감면은 사이드바 미반영) |
| ⑦ 결과 카드 | 카테고리 + 세부 조문 라벨 통합 (8.4) |
| ⑧ validation | 카테고리 중복 검증 추가 (8.3-A) |
| ⑨ Zod enum | priorReductionUsage 기존 25개 그대로 (legacy + 신규) |
| ⑩ Zod 컴패니언 | reductionSchema 기존 그대로 |
| ⑪ acquisitionDate fallback | N/A |
| ⑫ Zod 입력 객체 | (⑩에 통합) |
| ⑬ callTransferTaxAPI body spread | reductions 배열 통과 — 변경 없음 |
| ⑭ Route handler | 변경 없음 (Zod 검증 통과 시 그대로 전달) |

---

## 5. 마이그레이션 전략

### 5.1 단계별 활성화

| 단계 | 시점 | 작업 |
|---|---|---|
| **A** (Round 8 시작) | T+0 | DB v4 활성화 (이미 완료) — `unsold_housing` → `new_99_3`/`unsold_98_3` 자동 변환 |
| **B** (Round 8 완료) | T+0 | UI 통합 패널 배포. legacy ID alias 유지 (Zod schema에서 통과) |
| **C** (1개월 후) | T+30d | legacy ID alias 제거 PR (별도). `transfer-tax-api-helpers.ts` legacy 분기 삭제 |
| **D** (Supabase 전환 시) | TBD | DB 폐기 + 신규 스키마 (legacy 흔적 0) |

### 5.2 사용자 영향 시나리오

| 사용자 | 영향 |
|---|---|
| 신규 사용자 | 통합 패널만 노출. legacy ID 모름 |
| 기존 사용자 (이력 있음) | 다음 접속 시 DB v4 자동 마이그레이션 → toast 안내 ("§99의3은 신축주택 감면입니다. 이력이 자동 분류되었습니다") |
| 기존 사용자 (마이그레이션 1개월 후) | legacy ID 입력 시도 시 Zod schema 검증 실패 (alias 제거됨) — 정상 사용에 영향 없음 |

---

## 6. 테스트 계획

### 6.1 단위 테스트 (anchor 정정)

| 파일 | 변경 |
|---|---|
| `__tests__/tax-engine/transfer-tax/basic.test.ts` | `long_term_rental` 사용 case → `rental_97_3` |
| `__tests__/tax-engine/transfer-tax/reductions-and-exempt.test.ts` | 5개 평면 fixture 정정 |
| `__tests__/tax-engine/new-housing-reduction.test.ts` | (이미 시드와 독립) — 변경 없음 |
| `__tests__/tax-engine/transfer-tax/reduction-99-3.test.ts` | 그대로 (Phase 2 산출) |
| 기타 | grep으로 검색 + 신규 ID로 일괄 변경 |

예상 영향: **약 30개 fixture 정정 (회귀 테스트 526 유지)**

### 6.2 통합 테스트 (신규)

`__tests__/tax-engine/transfer-tax/unified-panel-integration.test.ts` (신규)
- 카테고리 내 라디오 선택 변경 시 reductions[] 정확 갱신
- 카테고리 간 다중 선택 (자경 + 신축)
- legacy ID 입력 시 자동 변환 (마이그레이션)
- 시한 외 항목 disabled 처리

### 6.3 회귀 테스트
- 기존 526 tests + Phase 2 32 = 526 → **목표: 558+ passed (회귀 0)**
- todo 1개 (PDF 사례 26 정확값 — 미해결 유지)

---

## 7. 회귀 위험 + 대응

| 위험 | 영향 | 확률 | 대응 |
|---|---|---|---|
| anchor fixture 정정 누락 | 중 | 중 | grep + sed로 일괄 변경 후 vitest 통과 확인 |
| 기존 사용자 이력 손실 | 고 | 저 | DB v4 마이그레이션 + 백업 안내 토스트. 결정사항 #4 (b) 선택 시 1개월 alias 유지로 추가 안전망 |
| §127② 중복배제 깨짐 | 중 | 저 | 카테고리 내 라디오 강제 + validate에서 중복 검증 (8.3-A) |
| 결과 카드 라벨 표시 깨짐 | 저 | 중 | TransferTaxResultView 라벨 매핑 grep 후 일괄 정정 |
| §99의2 분류 결정에 따른 학습 비용 | 저 | 중 | 결정사항 #1 확정 후 카테고리 헤더 sublabel에 명시 ("§99의2 신축·미분양·1세대1주택") |
| Phase 1 stub 19개 disabled 노이즈 | 저 | 중 | 시한 외 항목 회색 + tooltip — 결정사항 #2 (a) |

---

## 8. 분량 추정

| 작업 | 코드 변경 라인 | 신규/수정 |
|---|---|---|
| `UnifiedReductionPanel.tsx` 신규 | ~400 | 신규 |
| `ReductionExpansion.tsx` 제거 | -308 | 삭제 |
| `Step5.tsx` 정비 | ~50 변경 | 수정 |
| `metadata.ts` 카테고리 UI schema | ~50 | 수정 |
| `reduction-reclassification.ts` 강화 | ~30 | 수정 |
| `transfer-tax-validate.ts` 카테고리 중복 검증 | ~30 | 수정 |
| `TransferTaxResultView.tsx` 라벨 통합 | ~20 | 수정 |
| anchor 테스트 fixture 정정 | ~30개 case × 2~5라인 | 수정 |
| 통합 테스트 신규 | ~150 | 신규 |
| 합계 | **약 800라인 변경** | |

**예상 작업 시간**: 묶음 5~6개 (각 묶음 100~150라인)
- 묶음 1: 데이터·타입·메타데이터 (8.1)
- 묶음 2: UnifiedReductionPanel.tsx 작성 (8.2-A)
- 묶음 3: Step5.tsx 정비 + 결과 카드 (8.2-B + 8.4)
- 묶음 4: 검증 로직 (8.3) + anchor fixture 정정 (8.5)
- 묶음 5: 통합 테스트 + sync-checker (8.6)
- 묶음 6: 브라우저 수동 확인 안내 + 후속

---

## 9. 진입 조건 체크리스트

Round 8 진입 전 확정 사항:
- [ ] 의사결정 #1~#6 답변
- [ ] DB v4 마이그레이션 활성화 확인 (이미 P1-3 완료)
- [ ] Phase 2 §99의3 526+ tests 통과 확인 (이미 완료)
- [ ] anchor fixture 영향 범위 grep 사전 점검
- [ ] 사용자 이력 영향 카운트 (P2-1 도구로 사전 측정)

---

## 10. 후속 단계 (Round 9+)

Round 8 완료 후:
- **Round 9**: legacy ID alias 제거 (T+30d)
- **Round 10**: §97의5/§99/§98의3 등 시한 내 케이스 본격 구현 (사용자 사례 제공 시)
- **Round 11**: §99의4 (농어촌·고향주택) 본격 구현
- **Round 12**: §97 ① 본문/단서·§97의2/§97의4 등 한시 종료 조문 구현 (선택적)

---

## 11. 다음 액션

1. **사용자 의사결정 #1~#6 확정** → 본 계획서 §2 답변
2. 답변 후 Round 8.1 (데이터·타입 정비) 즉시 착수
3. 묶음별 진행 + 각 묶음 후 회귀 검증

---

## 12. Round 9 (긴급 보강) — 매매계약일 기반 시한 판정 (2026-05-06 추가)

### 12.1 배경

조특법 원문 재검토 결과, **신축·미분양·임대 감면 대부분이 매매계약일 + 계약금 납부 기준**으로 시한을 판정합니다. 그러나 현재 구현은 활성/비활성 카운터 계산 시 자산의 `acquisitionDate`만 사용합니다.

**핵심 버그**: `components/calc/transfer/UnifiedReductionPanel.tsx` `buildPeriodContext()`:
```ts
return {
  transferDate: transDate,
  acquisitionDate: acqDate,
  contractDate: undefined,   // ★ 항상 undefined
  registrationDate: undefined,
  rentalStartDate: undefined,
  usageApprovalDate: undefined,
};
```

→ 분양계약 2001.5.24 + 잔금/취득 2003.7.15 (§99의3 시한 외) 케이스가 잘못 비활성/활성 판정될 위험.

### 12.2 조문별 시한 판정 기준 매트릭스 (확정)

| 조문 | 1차 기준 | Fallback (조문 명시 시) | 비고 |
|---|---|---|---|
| **§97 ① 본문 (rental_97_main)** | 임대개시일 (`rentalStartDate`) | — | 신축 시기 별개 |
| **§97 ① 단서 (rental_97_proviso)** | 임대개시일 + 매입취득일 | — | 매입임대 1995.1.1 이후 취득 |
| **§97의2 (rental_97_2)** | **매매계약일 (`contractDate`) ★** | 사용승인일 (자기건설 신축) | "매매계약 + 계약금 지급" 명시 |
| **§97의3 (rental_97_3)** | 등록일 (`registrationDate`) | — | 임대 등록 시점 |
| **§97의4 (rental_97_4)** | 등록일 (`registrationDate`) | — | |
| **§97의5 (rental_97_5)** | **매매계약일 (`contractDate`) ★** | 등록일 | "취득 + 매매계약 ~2018.12.31" |
| **§99 (new_99)** | **매매계약일 (`contractDate`) ★** (1호 단서) | 사용승인일 (자기건설, ②항) | 1호=주건업·2호=자기건설 |
| **§99의3 (new_99_3)** | **매매계약일 (`contractDate`) ★** (1호) | 사용승인일 (자기건설, 2호) | 1호=주건업·2호=자기건설 |
| **§99의4 (new_99_4_rural/hometown)** | 취득일 (`acquisitionDate`) | — | 매매계약일 명시 없음 |
| **§98 (unsold_98)** | **매매계약일 (`contractDate`) ★** | 취득일 | "1997.12.31까지 매매계약" |
| **§98의2 (unsold_98_2)** | **매매계약일 (`contractDate`) ★** | 취득일 | |
| **§98의3 (unsold_98_3)** | **매매계약일 (`contractDate`) ★** | 취득일 | "2010.2.11까지 매매계약" |
| **§98의4 (unsold_98_4)** | **매매계약일 (`contractDate`) ★** | 취득일 | |
| **§98의5 (unsold_98_5)** | **매매계약일 (`contractDate`) ★** | — | 2010.2.11~2011.4.30 |
| **§98의6 (unsold_98_6)** | **임대계약일 (`contractDate` 재해석)** | 취득일 | 사업주체 임대계약 |
| **§98의7 (unsold_98_7)** | **매매계약일 (`contractDate`) ★** | — | 2012.9.24~2012.12.31 |
| **§98의8 (unsold_98_8)** | **매매계약일 (`contractDate`) ★** | — | 2015.1.1~2015.12.31 |
| **§98의9 (unsold_98_9)** | 취득일 (`acquisitionDate`) | — | 매매계약일 명시 없음 (2024 신설) |
| **§99의2 (unsold_99_2)** | **매매계약일 (`contractDate`) ★** | 취득일 | "2013.12.31까지 매매계약" |

**★ 매매계약일 기준 조문 = 13개** (전체 23개 중)
**취득일 기준 = 4개** (§99의4 농어촌·고향, §98의9, 자경)
**임대 등록·개시 기준 = 5개** (§97 시리즈)
**기타(공익·자경) = 비시한**

### 12.3 자산-수준 신규 필드 도입

#### `AssetForm.assetContractDate?: string`
- 위치: `lib/stores/calc-wizard-asset.ts`
- 의미: **주택 매매계약일** (분양계약 / 매매계약). 신축·미분양·임대 감면 시한 판정의 1차 기준
- 입력 위젯: 자산 카드(Step1) 안에 "매매계약일 (계약금 납부일)" 필드 추가
- 활성 조건: `assetKind === "housing"` (주택만 노출). 토지·건물은 시한 판정에 무관
- 선택 입력: 미입력 시 `acquisitionDate` fallback (현재 동작 유지 — backward-compat)

#### 시한 검증 우선순위
```ts
// period-check.ts (Round 9 갱신)
function getEffectiveContractDate(ctx: PeriodCheckContext, asset?: AssetForm): Date | undefined {
  // 1순위: 사용자가 reduction 본격 입력한 contractDate993 등 (이미 ctx.contractDate에 주입)
  // 2순위: 자산-수준 assetContractDate (Round 9 신규)
  // 3순위: acquisitionDate fallback (조문에서 "취득(매매계약 포함)" 명시 시)
  return ctx.contractDate ?? asset?.assetContractDate ?? ctx.acquisitionDate;
}
```

### 12.4 작업 단계 (Round 9.1~9.5)

#### 9.1 자산-수준 필드 추가 (영향 14개 동기화 지점)
- ① 폼 상태 타입: `AssetForm.assetContractDate?: string`
- ② initial value: `createInitialAssetForm()` 빈 문자열
- ③ normalize fallback: `migrateAsset()` legacy 자산 빈 문자열 default
- ④ API 변환: `transfer-tax-api.ts` 엔진 input에 매핑 (필요 시)
- ⑤ UI 입력 위젯: 자산 카드 Step1에 DateInput 추가 (조건부 — 주택)
- ⑥ 사이드바 합계: N/A
- ⑦ 결과 카드: N/A
- ⑧ validation: 신규 필수 검증 없음 (선택 입력)
- ⑨~⑭ Zod schema·route handler: 자산 객체에 optional 필드 추가

#### 9.2 시한 검증 헬퍼 보강
- `period-check.ts` `PeriodCheckContext`에 `assetContractDate?: Date` 추가
- 13개 매매계약일 기준 조문의 `check` 함수에서 `getEffectiveContractDate(ctx)` 호출
- `getReductionPeriodLabel()` 라벨 미세 조정 (예: "매매계약 2001.5.23~2003.6.30")

#### 9.3 UnifiedReductionPanel `buildPeriodContext` 정정
```ts
function buildPeriodContext(asset: AssetForm, transferDate: string): PeriodCheckContext {
  return {
    transferDate: new Date(transferDate),
    acquisitionDate: asset.acquisitionDate ? new Date(asset.acquisitionDate) : undefined,
    contractDate: asset.assetContractDate ? new Date(asset.assetContractDate) : undefined,  // ★ 신규
    registrationDate: undefined,  // §97의3·97의5 등록일 — 후속 작업 (현재 N/A)
    rentalStartDate: undefined,
    usageApprovalDate: undefined,
  };
}
```

#### 9.4 anchor 테스트 보강
- `__tests__/tax-engine/transfer-tax/reduction-99-3.test.ts`에 매매계약일 기반 케이스 추가:
  - 매매계약 2001.5.24 + 잔금 2003.7.15 → 시한 내 통과 (현재는 잔금만 보고 시한 외 오판)
  - 매매계약 2003.7.1 + 잔금 2003.5.1 (역순) → 시한 외 (계약일 기준)
- §97의2/§99/§98의3/§99의2 등도 동일 패턴 anchor 추가

#### 9.5 회귀 검증 + 브라우저 수동 확인
- tsc 0건 + vitest 526+ tests passed
- 브라우저: 자산 카드에 매매계약일 입력 → Step3 펼침 패널 카운터 변화 확인

### 12.5 분량 추정

| 작업 | 라인 |
|---|---|
| `AssetForm.assetContractDate` 추가 + initial/migrate | ~30 |
| 자산 카드 Step1 DateInput 위젯 | ~30 |
| `period-check.ts` 매매계약일 헬퍼 + 13개 조문 갱신 | ~80 |
| `UnifiedReductionPanel.buildPeriodContext` 정정 | ~10 |
| Zod schema 자산 객체 optional 필드 | ~5 |
| Route handler 매핑 | ~5 |
| anchor 테스트 보강 | ~80 |
| **합계** | **약 240라인** |

### 12.6 우선순위 (긴급 정정 vs Round 9 일괄)

**옵션 A (긴급 정정만)**: §99의3 본격 구현된 케이스만 매매계약일 기준 시한 판정 즉시 정정. 자산-수준 필드 미추가.
- 장점: 분량 작음 (~30라인)
- 단점: §99의3 외 22개 조문은 여전히 acquisitionDate 기반 — 본격 구현 시 다시 정정 필요

**옵션 B (Round 9 전체 진행)**: 자산-수준 `assetContractDate` 필드 + 13개 조문 매매계약일 매트릭스 일괄 정정.
- 장점: 한 번에 완료. 후속 22개 조문 본격 구현 시 시한 판정 인프라 이미 존재
- 단점: 분량 240라인 + 14개 동기화 지점 영향

**권장**: **옵션 B (Round 9 전체)** — Round 8 통합 패널 구축 직후 자연스러운 후속 작업. anchor 보강으로 시한 판정 정확성 검증.

### 12.7 진입 조건

- [x] Round 8 완료 (526 tests passed)
- [ ] 사용자 옵션 A vs B 결정
- [ ] (옵션 B 선택 시) 자산-수준 신규 필드 명칭 확정 (`assetContractDate` vs `purchaseContractDate` vs `housePurchaseContractDate`)

옵션·명칭 확정 후 Round 9.1부터 즉시 착수합니다.

---

## 13. Round 10 — PHD 환산 통합 (취득시 환산공시가격 자동 계산)

### 13.1 배경

신축주택 본질적 특성:
- 대부분 주택은 **준공 후 1~2년 후 공동주택가격·개별주택가격 공시**
- 따라서 **모든 신축주택 취득 당시에는 공시가격 없음**
- 일정기간 감면 안분 산식 (5년간 발생분 차감) 적용 시 **취득시 기준시가가 필수** → PHD 환산 필수

조특법 §99·§99의3·§98 시리즈·§99의2 등 **5년간 발생분 차감 안분 산식 8개 조문**이 PHD 환산 대상.

### 13.2 대상 조문 (8개)

| ID | 조문 | 시한 | PHD 환산 필요성 |
|---|---|---|---|
| `new_99` | §99 | 1998.5.22~1999.6.30 | ★ 필수 (1998 신축 → 최초공시 1999~2000) |
| `new_99_3` | §99의3 | 2001.5.23~2003.6.30 | ★ 필수 (PDF 사례 26 검증) |
| `unsold_98_3` | §98의3 | 2009.2.12~2010.2.11 | 취득 시 공시 가능성 높음, but 신축 직후면 필수 |
| `unsold_98_5` | §98의5 | 2010.2.12~2011.4.30 | 동일 |
| `unsold_98_6` | §98의6 | 2011.12.31까지 | 준공후미분양 — 공시 후 취득이 일반적 (PHD 불필요 多) |
| `unsold_98_7` | §98의7 | 2012.9.24~2012.12.31 | 동일 |
| `unsold_98_8` | §98의8 | 2015.1.1~2015.12.31 | 준공후미분양 — 공시 후 |
| `unsold_99_2` | §99의2 | 2013.4.1~2013.12.31 | 신축·미분양 매입자 — 신축이면 PHD 필수 |

★ 표시 4개 = PHD 환산 빈도 높음. 나머지 4개 = 선택적.

### 13.3 사용자 의사결정 (인터뷰 2026-05-06 답변 반영)

| Q | 결정 |
|---|---|
| Q1 | **8개 조문 인프라 일괄** + §99의3 본격 활용 |
| Q2 | **기존 PHD 엔진 재사용** + 자동 주입 |
| Q3 | **자동 활성화** + 사용자 수정 가능 |
| **Q4** | **(b) 각 감면 조문 입력 폼에 PHD 입력 별도** ← 사용자 선택 |
| Q5 | 5년시점 PHD 환산 X (단순 입력) |
| Q6 | 양도시 PHD 환산 X (단순 입력) |
| Q7 | 자산-수준 면적 + PHD 시점별 면적 별도 |
| Q8 | (a)+(b) 모드 토글 — PHD ON 시 환산, OFF 시 직접 입력 |
| Q9 | 공동·단독 모두 동일 산식 |
| Q10 | 인접 고시일 가격 그대로 (보간 X) |

**Q4 (b) 선택의 함의**:
- 각 감면 조문 입력 폼 안에 PHD 환산 위젯 **별도 배치** (자산-수준 PHD와 분리)
- 사용자 자유도 ↑ — 감면 조문별 다른 PHD 환산 가능 (이론적으로는 동일하지만 입력 별개)
- 자산-수준 PHD와 결과 정합성 검증은 사용자 책임

### 13.4 PHD 환산 산식 (기존 §164⑤)

```
취득시 추정 공동주택가격 = 최초공시 공동주택가격 × (Sum_A / Sum_F)

Sum_A = 취득시 토지 기준시가(공시지가 × 면적) + 취득시 건물 기준시가
Sum_F = 최초공시 토지 기준시가 + 최초공시 건물 기준시가
```

기존 엔진: `lib/tax-engine/transfer-tax-pre-housing-disclosure.ts` `calcPreHousingDisclosureGain()`
- input: `PreHousingDisclosureInput` (12개 필드)
- output: `PreHousingDisclosureResult` 중 `P_A_est` (= 취득시 추정 공동주택가격)

### 13.5 신규 컴포넌트 — `ReductionPhdInput.tsx`

각 감면 조문의 본격 입력 폼 안에 삽입할 **공통 PHD 환산 위젯**.

**입력**:
- 최초공시일자 (DateInput)
- 최초공시 공동주택가격/개별주택가격 (CurrencyInput)
- 토지면적(㎡) — 기존 자산 카드 면적 default
- 취득시 토지 공시지가/㎡ (CurrencyInput) + 기준연도 (Q9 통합)
- 취득시 건물 기준시가 (CurrencyInput, 선택)
- 최초공시시 토지 공시지가/㎡
- 최초공시시 건물 기준시가 (선택)

**출력**: 자동 환산 결과 표시 + `standardPriceAtAcquisition993`(또는 해당 조문 필드)에 자동 채움

**활성화 조건**:
- 자동: `asset.acquisitionDate < firstDisclosureDate` 자동 감지 → 위젯 자동 노출
- 수동: 사용자가 "취득시 환산공시가격 계산" 토글 ON

### 13.6 작업 단계 (Round 10.1~10.5)

#### 10.1 공통 PHD 환산 헬퍼 함수
- `lib/tax-engine/transfer-reductions/phd-helper.ts` 신규
  - `calcReductionAcquisitionStdPrice(input): number` — `calcPreHousingDisclosureGain` 래핑, 5년 안분 산식용 단순화
  - input: 7개 필드 (최초공시일·최초공시가·토지면적·취득시토지단가·취득시건물·최초공시토지단가·최초공시건물)
  - output: 환산 취득시 기준시가 (P_A_est)

#### 10.2 `ReductionPhdInput.tsx` 신규 컴포넌트
- 8개 조문에서 재사용 가능한 공통 위젯
- ToggleCard "PHD 환산 모드" + 펼침 영역에 7개 입력 필드
- 자동 환산 결과 박스 표시 ("취득시 추정 기준시가 = X원")
- "이 값을 취득시 기준시가에 자동 적용" 버튼 + 자동 채움 옵션

#### 10.3 §99의3 본격 입력 폼 통합 (1순위)
- `UnifiedReductionPanel.tsx` `New993InputForm`:
  - "취득시 기준시가 (원)" 입력 필드 위에 `<ReductionPhdInput />` 삽입
  - PHD 결과를 `onUpdate("standardPriceAtAcquisition993", v)` 자동 호출 (모드 ON 시)
  - 모드 OFF 시 기존 직접 입력 동작

#### 10.4 AssetReductionForm 확장 — 8개 조문 PHD 데이터 저장
- `new_99_3` variant에 PHD 입력 필드 7개 추가 (옵션):
  - `phdMode993?: boolean` (ON/OFF)
  - `phdFirstDisclosureDate993?: string`
  - `phdFirstDisclosurePrice993?: string`
  - `phdLandAreaSqm993?: string`
  - `phdLandPricePerSqmAtAcq993?: string`
  - `phdLandPricePerSqmAtFirst993?: string`
  - `phdBuildingStdAtAcq993?: string` (선택)
  - `phdBuildingStdAtFirst993?: string` (선택)
- 다른 7개 조문도 동일 패턴 (변수명 prefix만 다름) — Round 11+ 본격 구현 시 추가

**선택 결정 — 8개 조문 모두 즉시 추가 vs §99의3만**:
- Q4 (b) 선택은 "각 조문에 별도 PHD 입력" → 본격 구현된 §99의3에만 즉시 추가, 나머지 7개는 본격 구현 시 함께 추가가 합리적

#### 10.5 anchor 테스트
- `__tests__/tax-engine/transfer-tax/reduction-phd-helper.test.ts` 신규
  - PDF 사례 26 (X=540M PHD 환산 → §99의3 안분 결과 정확값) 통합 anchor
  - 부호 (+,+) 정상 케이스, 면적 변경 케이스 등

### 13.7 14개 동기화 지점 영향

| # | 지점 | Round 10 영향 |
|---|---|---|
| ① 폼 상태 타입 | **갱신** — `new_99_3` variant에 PHD 7~8 필드 추가 |
| ② initial value | **갱신** — getReductionDefault new_99_3 |
| ③ normalize fallback | 변경 없음 |
| ④ API 변환 | **갱신** — toEngineReductions에서 PHD 입력 → engine 매핑 |
| ⑤ UI 입력 위젯 | **갱신** — `ReductionPhdInput.tsx` 신규 + `New993InputForm` 통합 |
| ⑥ 사이드바 합계 | N/A |
| ⑦ 결과 카드 | **갱신** (선택) — PHD 환산 결과를 §99의3 산식 단계에 표시 |
| ⑧ validation | **갱신** — PHD 모드 ON 시 7개 필드 검증, OFF 시 standardPriceAtAcquisition993 직접 입력 검증 |
| ⑨ Zod enum | 변경 없음 |
| ⑩ Zod 컴패니언 | **갱신** — reductionSchema new_99_3 PHD 필드 추가 |
| ⑪ acquisitionDate fallback | N/A |
| ⑫ Zod 입력 객체 | (⑩에 통합) |
| ⑬ callTransferTaxAPI body spread | 자산-수준 reductions 배열 통과 — 변경 없음 |
| ⑭ Route handler | string → Date/number 변환 (PHD 일자·금액 필드) |

### 13.8 Q4 (b) 선택의 트레이드오프

**장점**:
- 감면 조문별 자유도 (자산-수준 PHD와 다른 환산 가능)
- 자산 카드 단순화 (PHD 입력은 감면 사용 시에만 노출)
- §99의3 적용 안 하는 자산은 PHD 입력 부담 없음

**단점**:
- 자산-수준 PHD가 이미 있다면 동일 데이터 재입력
- 데이터 정합성 사용자 책임 (자산-수준 vs 감면 조문 PHD 결과 다를 수 있음)
- 8개 조문 본격 구현 시 PHD 위젯 8회 노출 (다중 감면 동시 적용은 §127② 중복배제로 1건 선택이라 실제로는 1회)

**완화책**:
- `ReductionPhdInput.tsx`에 "자산 카드 PHD 데이터 가져오기" 버튼 — 자산-수준 입력값을 감면 조문 PHD 입력으로 복사
- 사용자 1회 입력 부담 최소화

### 13.9 분량 추정

| 작업 | 라인 |
|---|---|
| `phd-helper.ts` 공통 헬퍼 | ~80 |
| `ReductionPhdInput.tsx` 신규 컴포넌트 | ~250 |
| `New993InputForm` 통합 (UnifiedReductionPanel.tsx) | ~30 |
| `AssetReductionForm.new_99_3` PHD 7~8 필드 추가 | ~20 |
| Zod schema·factory·migrate | ~30 |
| API 변환·route handler·validate | ~50 |
| anchor 테스트 (PDF 사례 26 PHD 통합) | ~150 |
| **합계** | **약 610라인** |

### 13.10 Round 10 진입 결정 (사용자 답변 완료, 즉시 착수 가능)

체크리스트:
- [x] Q1~Q10 의사결정 확정 (Q4 = b, 나머지 권장)
- [x] Round 9 완료 (542 tests passed)
- [x] 분양계약일 통합 완료 (assetContractDate 단일 source)
- [ ] 사용자 진입 명령

진입 명령 주시면 Round 10.1부터 즉시 착수합니다.

### 13.11 후속 라운드

- **Round 11** (T+30d): legacy contractDate993 제거 + Round 10에서 §99의3 외 7개 조문 본격 구현 시작
- **Round 12**: 나머지 12개 조문 (장기임대 §97 시리즈·§99의4 등)

진입 명령 주시면 의사결정 답변에 따라 Round 8.1부터 착수합니다.
