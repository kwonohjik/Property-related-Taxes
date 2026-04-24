# 공시가격 입력 통일화 설계 (Unified Standard Price Input)

**Feature ID**: `unified-standard-price-input`
**작성일**: 2026-04-24
**대상 세목**: 양도세·취득세·재산세·종부세·상속세·증여세 (전 세목)
**PDCA Phase**: Design
**상태**: 초안

---

## 1. 배경 및 목적

### 1.1 현재 문제점
- **인터넷 장애 대응 불가**: Vworld 공시가격 조회 API가 다운되면 일부 화면에서 계산 진행 불가능.
- **API 장애 시 우회 경로 없음**: `KOREAN_LAW_OC`·Vworld 키 미설정 환경에서는 조회 기능 자체가 작동 안 함.
- **화면별 UI 불일치**: 일부 화면은 `CurrencyInput`으로 수동 입력 가능, 일부 화면은 조회 전용에 가까움 (아래 "2. 현황 분석" 참조).
- **단가 vs 총액 혼동 위험**: 토지 케이스에서 사용자가 "단가(원/㎡)"와 "총액(원)"을 구분하지 못해 면적 배율만큼 틀어진 세액을 낼 위험.

### 1.2 목표
1. **전 세목 · 전 화면** 공시가격 입력 UI를 **단일 공용 컴포넌트**로 통일.
2. **토지·비주거 건물**: "단가(원/㎡) × 면적 = 총액" 방식으로 자동 계산.
3. **주택**: 총액(원) 직접 입력 방식 유지 (공시가격이 총액 고시이므로).
4. **수동 입력 상시 가능**: API 장애 여부 무관하게 사용자가 언제든 직접 입력 가능.
5. **세목 간 일관성은 고려하지 않음**: 동일 부동산이라도 세목별로 각자의 입력값을 가짐 (본 설계 범위 외).

---

## 2. 현황 분석

### 2.1 공시가격 입력 UI 사용 화면

| 파일 | 역할 | 현재 UI | 주요 문제 |
|---|---|---|---|
| `components/calc/transfer/CompanionSaleModeBlock.tsx` (ApportionedPriceBlock) | 양도세 일괄양도 안분 기준시가 | 조회 + `CurrencyInput` | 단가/총액 구분 모호, land만 `pricePerSqm` 재계산 있음 |
| `components/calc/transfer/CompanionAcqPurchaseBlock.tsx` | 양도세 환산취득가 | 조회 + `CurrencyInput` | 단가 입력 UI 없음 |
| `components/calc/transfer/CompanionAcqInheritanceBlock.tsx` | 양도세 상속취득 평가 | 조회 + `CurrencyInput` | 토지/주택 분기 있음 |
| `components/calc/inputs/Pre1990LandValuationInput.tsx` | 1990.8.30 이전 토지 환산 | 조회 후 단가 자동 입력 | 단가 방식이 이미 구현되어 있음 (참고 모델) |
| `components/calc/inputs/SelfFarmingIncorporationInput.tsx` | 자경 감면 기준시가 | 조회 전용에 가까움 | 수동 입력 제한 |
| `components/calc/property/Step0.tsx` | 재산세 공시가격 | 조회 + 입력란 혼재 | 통일 필요 |
| `components/calc/acquisition/Step0.tsx`, `Step1.tsx` | 취득세 시가표준액 | 조회 + 입력란 혼재 | 통일 필요 |
| `components/calc/PropertyValuationForm.tsx` | 상증세 재산평가 | 조회 + 입력란 | 법정 평가 순위 고지 필요 |
| `components/calc/PropertyListInput.tsx` | 종부세 자산 목록 | 조회 + 입력란 | 통일 필요 |

### 2.2 기존 데이터 모델 (AssetForm 기준)

```typescript
interface AssetForm {
  acquisitionArea: string;              // 취득 당시 면적 (㎡)
  transferArea: string;                 // 양도 당시 면적 (㎡)
  standardPriceAtAcq: string;           // 취득 당시 기준시가 (원, 총액)
  standardPriceAtTransfer: string;      // 양도 당시 기준시가 (원, 총액)
  standardPriceAtAcqLabel: string;      // 조회 결과 라벨
  standardPriceAtTransferLabel: string; // 조회 결과 라벨
  // ... (단가 필드 없음)
}
```

**문제**: `standardPriceAtAcq`·`standardPriceAtTransfer`가 총액만 저장 → 면적 변경 시 자동 재계산 불가.

---

## 3. 설계 원칙

### 3.1 부동산 종류별 입력 방식

| 분류 | 입력 방식 | 저장 필드 |
|---|---|---|
| **토지** (나대지·농지·임야·도시계획시설부지 등) | 단가(원/㎡) + 면적(㎡) → 총액 자동 계산 | `pricePerSqm` + `area` + `totalPrice` |
| **건물 (비주거)** (상가·공장·사무소) | 단가(원/㎡) + 면적(㎡) → 총액 자동 계산 | `pricePerSqm` + `area` + `totalPrice` |
| **단독주택** | 총액 직접 입력 | `totalPrice` 만 저장 |
| **공동주택** (아파트·빌라·오피스텔) | 총액 직접 입력 | `totalPrice` 만 저장 |

**근거**:
- 개별공시지가 (부동산 가격공시법 §10): **원/㎡** 단가 고시
- 개별주택가격 (동법 §17): **호별 총액** 고시
- 공동주택가격 (동법 §18): **호별 총액** 고시
- 국세청 건물 기준시가 (상증법 §61①1): **원/㎡** 단가 고시

### 3.2 수동 입력 상시 허용 정책

- 자동 조회 버튼은 **부가 기능** (편의성)으로 포지셔닝.
- 수동 입력은 **항상 가능** (최상위 경로).
- 조회 성공 시 입력란에 값이 자동으로 채워지되, 사용자가 언제든 수정 가능.
- 조회 버튼 재클릭 시 **확인 다이얼로그** 없이 덮어씀 (사용자가 조회 버튼을 누른 행위 자체가 의사표시).
  - 단, "수동 편집 이력" 메타데이터만 저장하여 감사 가능성 유지.

### 3.3 출처 추적 (선택적)

```typescript
type PriceSource = "lookup" | "manual" | "lookup-edited";
```
- 수동 입력값의 세무 근거 추적용 (이력 저장 시에만 사용).
- UI에는 노출하지 않음 (편의성 우선).

---

## 4. 공용 컴포넌트 설계

### 4.1 신규 컴포넌트: `StandardPriceInput`

**경로**: `components/calc/inputs/StandardPriceInput.tsx`

```typescript
interface StandardPriceInputProps {
  /** 부동산 종류 — 입력 방식 분기 */
  propertyKind: "land" | "building_non_residential" | "house_individual" | "house_apart";

  /** 현재 저장된 총액 (원) */
  totalPrice: string;
  onTotalPriceChange: (v: string) => void;

  /** 단가 (원/㎡) — land·building_non_residential 시에만 사용 */
  pricePerSqm?: string;
  onPricePerSqmChange?: (v: string) => void;

  /** 면적 (㎡) — land·building_non_residential 시에만 사용 */
  area?: string;
  onAreaChange?: (v: string) => void;

  /** 조회용 지번 주소 (옵션) */
  jibun?: string;

  /** 조회 기준일 (양도일·취득일·과세기준일 등) */
  referenceDate?: string;

  /** 라벨 커스터마이징 */
  label?: string;
  hint?: string;
  required?: boolean;

  /** 조회 기능 활성화 여부 (기본 true) */
  enableLookup?: boolean;

  /** 출처 추적 (옵션) */
  onSourceChange?: (source: PriceSource) => void;
}
```

### 4.2 UI 레이아웃

#### 토지·건물(비주거) 모드
```
┌─ 양도 시점 공시가격 ─────────────────────────────────────────┐
│  [2026년 ▼]  [🔎 공시가격 조회]                              │
│                                                              │
│  ㎡당 공시지가 (원)  [     12,345    ] (수동 입력 가능)      │
│  면적 (㎡)           [       793     ] (다른 곳과 동기화)    │
│  ─────────────────────────────────────────                   │
│  총액 (원)           [   9,792,585   ] (자동 계산, 편집가능) │
│                                                              │
│  ✓ 2026년 개별공시지가 기준                                  │
└──────────────────────────────────────────────────────────────┘
```

#### 주택 모드
```
┌─ 양도 시점 공시가격 ─────────────────────────────────────────┐
│  [2026년 ▼]  [🔎 공시가격 조회]                              │
│                                                              │
│  공시가격 (원 총액)  [  520,000,000  ] (수동 입력 가능)      │
│                                                              │
│  ✓ 2026년 공동주택가격 기준                                  │
└──────────────────────────────────────────────────────────────┘
```

### 4.3 동작 규칙

1. **단가 입력 시** → 총액 자동 계산 (`단가 × 면적`, `Math.floor`)
2. **면적 입력 시** → 총액 자동 재계산 (면적 변경은 다른 필드에서도 오는 경우 있음)
3. **총액 수동 편집 시** → 단가 역산 (`총액 ÷ 면적`, 소수점 허용)
4. **조회 성공 시**:
   - 토지·비주거 건물: 단가에 API 응답값 저장, 면적과 곱하여 총액 채움
   - 주택: 총액에 API 응답값 직접 저장
5. **조회 실패 시**: 에러 메시지 표시, 입력 필드는 활성 상태 유지 → 사용자가 수동 입력으로 진행
6. **모든 입력 필드에 `onFocus={(e) => e.target.select()}` 자동 적용** (프로젝트 전역 규칙)

---

## 5. 데이터 모델 변경

### 5.1 `AssetForm` 필드 추가 (양도세)

```typescript
interface AssetForm {
  // ── 기존 ──
  acquisitionArea: string;
  transferArea: string;
  standardPriceAtAcq: string;         // 총액 유지 (기존 호환)
  standardPriceAtTransfer: string;    // 총액 유지 (기존 호환)

  // ── 신규 (토지·비주거 건물 전용) ──
  /** 취득 시점 ㎡당 공시지가 (원/㎡) */
  standardPricePerSqmAtAcq: string;
  /** 양도 시점 ㎡당 공시지가 (원/㎡) */
  standardPricePerSqmAtTransfer: string;

  // ── 출처 추적 (선택적, 이력 저장용) ──
  standardPriceAtAcqSource?: PriceSource;
  standardPriceAtTransferSource?: PriceSource;
}
```

### 5.2 타 세목 폼도 동일 패턴 적용

- 재산세: `PropertyFormItem` (있는 경우) 또는 Step0 state
- 취득세: `AcquisitionFormData` state
- 종부세: `PropertyListItem` state
- 상증세: `EstateItem` state (`PropertyValuationForm`)

**API 페이로드는 변경 없음** — 기존 `total` 필드 그대로 유지하여 엔진 레이어 영향 제로.

### 5.3 이력 마이그레이션

- 기존 이력에는 `pricePerSqm` 필드 없음
- Rehydrate 시 `pricePerSqm = floor(total / area)` 역산 (`area > 0` 조건)
- `area = 0` 또는 주택이면 단가 필드 없이 총액만 복원

---

## 6. 적용 범위 (리팩토링 목록)

### 6.1 Phase 1 — 공용 컴포넌트 생성
| # | 파일 | 작업 |
|---|---|---|
| 1 | `components/calc/inputs/StandardPriceInput.tsx` | **신규** 공용 컴포넌트 |
| 2 | `components/calc/inputs/__tests__/StandardPriceInput.test.tsx` | **신규** L1 단위 테스트 |

### 6.2 Phase 2 — 양도세 적용 (최우선, 이미 구현 비중 높음)
| # | 파일 | 작업 |
|---|---|---|
| 3 | `components/calc/transfer/CompanionSaleModeBlock.tsx` | `ApportionedPriceBlock` → `StandardPriceInput` 교체 |
| 4 | `components/calc/transfer/CompanionAcqPurchaseBlock.tsx` | 환산취득가 조회 → `StandardPriceInput` 교체 |
| 5 | `components/calc/transfer/CompanionAcqInheritanceBlock.tsx` | 상속 토지·주택 분기 → `StandardPriceInput` 통합 |
| 6 | `lib/stores/calc-wizard-store.ts` | `AssetForm`에 `standardPricePerSqmAt*` 필드 추가 + 기본값 + 마이그레이션 |

### 6.3 Phase 3 — 재산세·종부세 적용
| # | 파일 | 작업 |
|---|---|---|
| 7 | `components/calc/property/Step0.tsx` | `StandardPriceInput` 교체 |
| 8 | `components/calc/PropertyListInput.tsx` | `StandardPriceInput` 교체 |

### 6.4 Phase 4 — 취득세 적용
| # | 파일 | 작업 |
|---|---|---|
| 9 | `components/calc/acquisition/Step0.tsx` | `StandardPriceInput` 교체 |
| 10 | `components/calc/acquisition/Step1.tsx` | `StandardPriceInput` 교체 |

### 6.5 Phase 5 — 상증세 적용
| # | 파일 | 작업 |
|---|---|---|
| 11 | `components/calc/PropertyValuationForm.tsx` | `StandardPriceInput` 교체 |

### 6.6 Phase 6 — Pre1990·자경 감면 (기존 단가 방식 이미 있음, 경량 리팩토링)
| # | 파일 | 작업 |
|---|---|---|
| 12 | `components/calc/inputs/Pre1990LandValuationInput.tsx` | `StandardPriceInput` 연계 (옵션) |
| 13 | `components/calc/inputs/SelfFarmingIncorporationInput.tsx` | 수동 입력 경로 추가 |

---

## 7. 테스트 계획

### 7.1 L1 — 단위 테스트 (`StandardPriceInput.test.tsx`)
- 단가 입력 → 총액 자동 계산 (Math.floor 확인)
- 면적 입력 → 총액 재계산
- 총액 수동 편집 → 단가 역산
- 주택 모드 → 단가/면적 필드 비활성
- 조회 성공 → 자동 채움
- 조회 실패 → 에러 메시지, 입력 필드 유지

### 7.2 L2 — 통합 테스트
- 양도세 Step3 기존 테스트 회귀 확인 (`__tests__/tax-engine/transfer-tax-*.test.ts`)
- 공시가격 입력 → 환산취득가 계산 정확도 유지

### 7.3 L3 — 시나리오 테스트
- 인터넷 장애 시뮬레이션 (API mock fail) → 수동 입력으로 세액 완성 가능한지
- 토지 → 주택 → 건물 간 propertyKind 전환 시 데이터 초기화 규칙

---

## 8. 리스크 및 대응

| 리스크 | 영향도 | 대응 |
|---|---|---|
| 기존 이력 데이터에 `pricePerSqm` 없음 | 🟡 중 | 역산 마이그레이션으로 자동 복원 |
| 주택 `area` 필드는 전용 주거면적 / 공급면적 구분 없음 | 🟢 낮 | 주택 모드는 단가 미사용이므로 영향 없음 |
| 기존 개별 화면의 custom 로직 (예: `pricePerSqm` state) 중복 | 🟡 중 | 공용 컴포넌트 내부로 흡수, 화면 레벨 state 제거 |
| `landAreaM2` 등 API 전달 필드 변경 우려 | 🟢 낮 | API는 총액만 전송, 내부 state만 단가 보관 → 엔진 무영향 |
| 테스트 파일 80개 중 공시가격 관련 회귀 | 🟡 중 | Phase별 점진 적용 + CI 통과 확인 |

---

## 9. 우려가 해소된 항목 (세목 간 일관성 관련)

**본 설계에서 의도적으로 제외**:
- 동일 부동산의 공시가격을 여러 세목에서 일관 유지하는 로직 → **개별 입력 허용**
- 상증세 법정 평가 순위 강제 → **사용자 자율에 맡김**
- 조회 덮어쓰기 확인 다이얼로그 → **생략** (편의성 우선)

**사유**: 사용자가 "세목 간 일관성은 고려하지 말고 편의성 우선"을 명시적으로 선택.

---

## 10. 구현 순서 (PDCA Do 단계 권장 순서)

1. ✅ **Phase 1**: 공용 컴포넌트 + 단위 테스트 (1일)
2. ✅ **Phase 2**: 양도세 적용 (2일) — 가장 복잡한 화면으로 조기 검증
3. ✅ **Phase 3**: 재산세·종부세 (1일)
4. ✅ **Phase 4**: 취득세 (1일)
5. ✅ **Phase 5**: 상증세 (1일)
6. ✅ **Phase 6**: Pre1990·자경 감면 (0.5일) — 기존 구조와 호환

**예상 총 공수**: 6.5일 (점진 배포 가능)

---

## 11. 성공 지표 (PDCA Check 단계)

- [ ] 모든 공시가격 입력 화면이 `StandardPriceInput` 컴포넌트로 통일됨
- [ ] 인터넷 장애 시뮬레이션(API mock fail) 상태에서도 전 세목 계산 완료 가능
- [ ] 토지·비주거 건물: 단가 변경 시 총액이 자동 재계산됨
- [ ] 주택: 총액 직접 입력이 그대로 작동함
- [ ] 기존 테스트 1,484개 전부 통과 (회귀 없음)
- [ ] Gap Detector Match Rate ≥ 90%

---

## 12. Non-Goals (범위 외)

- 세목 간 공시가격 자동 전파·동기화
- 상증세 법정 평가 순위 검증 로직
- 수동 입력 근거 메모 필드 (PriceSource만 저장)
- 부동산공시가격알리미 공식 사이트 링크 임베드

위 항목들은 별도 feature로 분리하여 향후 필요 시 추가.
