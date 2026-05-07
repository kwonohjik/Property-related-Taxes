# 양도세 사례 29 — 건물 기준시가 입력을 ㎡당 단가에서 면적-곱 총액으로 변경 계획서

> **PDCA Plan 단계**. 사례 29 후속 개선. Engine + UI 시니어 병렬 진행 전제.
> **작성일**: 2026-05-08 / **담당**: Daniel
> **선행**: `transfer-tax-commercial-building-case-29.plan.md` (Phase 1 완료)
> **선행 인터뷰 결정**: 총액 입력 / 완전 rename / 결과 anchor 동일

---

## 1. 배경 — 일관성 결여

현재 사례 29 UI(`CommercialBuildingBlock.tsx`)에서 **3시점 환산**에 사용되는 3종 데이터의 입력 방식이 일관되지 않다:

| 섹션 | 입력 단위 | 비고 |
|---|---|---|
| ② 호별 ㎡당 고시가 | `원/㎡` (단가) | 엔진 내부에서 연면적 곱셈하여 호별총액 산정 |
| **③ 건물 ㎡당 기준시가 (3시점)** | **`원/㎡` (단가)** | **엔진 내부에서 연면적 곱셈** |
| ④ 개별공시지가 (3시점) | `원/㎡` (단가) + 토지면적 → `원` 자동 계산 표시 | LandPriceLookupField — 사용자가 토지기준시가 총액 시각 확인 |

**문제**: 일반적으로 환산취득가 산정 자료는 **㎡당 단가가 아니라 기준시가 총액**을 입력하는 관행. 사례 29의 ②는 호별 고시가가 ㎡당 단가로만 고시되는 특수성 때문에 단가 입력이 정당하지만, **③ 건물 기준시가는 동일고시자의 전유/공용 높이별 보정계수를 사용자가 미리 반영해 총액을 산정**하는 것이 실무 관행에 더 부합한다.

엑셀 시트 `환산, 공시전`에서도 E39/E40/E41 셀이 **하드코딩 총액** (42,337,680 / 27,600,830 / 32,674,400)으로 되어 있어 이 관행을 뒷받침.

---

## 2. 변경 사항 (Single Source of Truth)

### 2.1 엔진 input 타입 — 완전 rename

`lib/tax-engine/types/commercial-building.types.ts`:

| 기존 (㎡당 단가) | 변경 (총액, 원) |
|---|---|
| `buildingStdPricePerSqmAtAcq?: number` | `buildingStdPriceAtAcq?: number` |
| `buildingStdPricePerSqmAtFirst?: number` | `buildingStdPriceAtFirst?: number` |
| `buildingStdPricePerSqmAtTransfer?: number` | `buildingStdPriceAtTransfer?: number` |

**의미 변경**: 단위가 `원/㎡`에서 `원`으로 바뀜. 사용자(또는 사용자 측 외부 자료)가 이미 `㎡당 단가 × (전유면적 + 공용면적 × 보정계수)`를 계산해 입력한다는 전제.

### 2.2 엔진 산식 변경

`lib/tax-engine/commercial-building-valuation.ts` `calcStdPriceSum()`:

```ts
// 기존
return landPricePerSqm * landArea + buildingStdPricePerSqm * totalFloorArea;

// 변경
return landPricePerSqm * landArea + buildingStdPriceTotal;  // 건물 부분은 곱셈 제거
```

→ 함수 시그니처도 변경: `(landPricePerSqm, landArea, buildingStdPriceTotal)` (4번째 인자 `totalFloorArea` 제거 — 건물 분만 적용).

토지 분(`개별공시지가 × 대지면적`)은 그대로 유지 (토지는 ㎡당 단가 입력 + 토지면적 곱셈 패턴 — 개별공시지가 시스템과 일관).

### 2.3 UI 변경

`components/calc/transfer/CommercialBuildingBlock.tsx`:

- **섹션 제목**: `③ 건물 ㎡당 기준시가 — 3시점 (원/㎡)` → `③ 건물 기준시가 — 3시점 (원)`
- **각 필드 라벨**:
  - `취득시 건물 ㎡당 기준시가` → `취득시 건물 기준시가`
  - `최초고시(2005) 건물 ㎡당 기준시가` → `최초고시(2005) 건물 기준시가`
  - `양도시 건물 ㎡당 기준시가` → `양도시 건물 기준시가`
- **단위**: `원/㎡` → `원`
- **hint**: "국세청 기준시가 조회 → 건물분 ㎡당 가액 (원/㎡)" → **"국세청 기준시가 조회 → 건물 ㎡당 가액 × 연면적(전유+공용 보정계수 반영) = 건물 기준시가 총액"**
- **CurrencyInput 그대로 사용** (자동 콤마 포맷, 정수 원).

### 2.4 폼 상태 (`AssetForm`) — 의미 재해석

`lib/stores/calc-wizard-asset.ts`:
- `cbBuildingStdPriceAtAcq: string` (이름 유지, 의미만 "총액")
- `cbBuildingStdPriceAtFirst: string`
- `cbBuildingStdPriceAtTransfer: string`

→ **폼 필드명은 변경하지 않음** (CB prefix 사용 중 + AssetForm 마이그레이션 비용 회피). 주석으로 의미 변경 명시.

> **결정 근거**: 폼 필드는 string이므로 PerSqm 명시가 없음. 엔진 input 타입에서만 명시적 rename. 마이그레이션 호환성 유지 (기존 sessionStorage 사용자에게는 이전 값이 그대로 남지만 단위가 바뀐 셈 — 아래 §6 마이그레이션 참고).

### 2.5 API 변환·Zod 스키마

`lib/calc/transfer-tax-api-helpers.ts` `buildCommercialBuildingValuation()`:
- 키 이름 변경: `buildingStdPricePerSqmAtAcq` → `buildingStdPriceAtAcq` 등 3개

`lib/api/transfer-tax-schema.ts` `commercialBuildingValuationSchema`:
- 동일 키 rename. `.int().positive()` 제약은 유지

`lib/api/transfer-tax-schema-refines.ts`:
- era별 필수 검증 path 수정 (`buildingStdPricePerSqm*` → `buildingStdPrice*`)

### 2.6 결과 카드 — 산식 라벨 갱신

`components/calc/results/CommercialBuildingValuationDetailCard.tsx`:
- 산식 표기: "취득시 기준시가합 = 개공지 × 대지면적 + 건물기준시가 × 연면적" → **"취득시 기준시가합 = 개공지 × 대지면적 + 건물 기준시가"** (건물 분 곱셈 제거)
- 시점별 토지·건물 분리 표는 그대로 유지 (`landStdAtAcq`, `buildingStdAtAcq` 결과 필드는 엔진이 계산해 둠)

### 2.7 anchor 테스트 — fixture 재작성

`__tests__/tax-engine/transfer-tax/_helpers/case-29-fixtures.ts`:

| 시점 | 기존 (㎡당) | 변경 (총액, 원) |
|---|---|---|
| `buildingStdPriceAtAcq` | 397,020 | **27,600,830** (= 397,020 × 69.52) |
| `buildingStdPriceAtFirst` | 470,000 | **32,674,400** |
| `buildingStdPriceAtTransfer` | 609,000 | **42,337,680** |

→ 결과 anchor (135,155,041 / 85,844,292 / 8,584,429 / 94,428,721) **동일 유지** — 산식 등가성 확인 (Do 단계 1차 검증).

> **수학적 등가성**: `buildingStdPricePerSqm × totalFloorArea` ≡ `buildingStdPriceTotal` (입력값을 사전 곱셈해서 받는 것뿐). INT 시점·중간 절사 위치가 동일하면 결과 완전 동일.

---

## 3. 영향 범위 — 14개 동기화 지점

| # | 지점 | 영향 |
|---|---|---|
| ① 폼 상태 | AssetForm cb* 필드 | **변경 없음** (string, 의미 재해석만) |
| ② initial value | `""` 초기값 | 변경 없음 |
| ③ normalize fallback | `??= ""` | 변경 없음 |
| ④ API 변환 | buildCommercialBuildingValuation 키 | **rename** |
| ⑤ UI 위젯 | CommercialBuildingBlock 섹션 ③ 라벨·hint·단위 | **변경** |
| ⑥ 사이드바 | 변경 없음 |
| ⑦ 결과 카드 | 산식 라벨 (건물 분 곱셈 표기 제거) | **변경** |
| ⑧ validation | `buildingStdPrice*` 필드명 + 양수 검증 (그대로) | 메시지만 갱신 |
| ⑨ Zod enum | 변경 없음 |
| ⑩ Zod refines | path 키 rename | **변경** |
| ⑪ acquisitionDate fallback | 해당 없음 |
| ⑫ Zod 객체 | commercialBuildingValuationSchema 키 rename | **변경** (TS 미감지) |
| ⑬ body spread | spread는 객체 그대로 | 변경 없음 |
| ⑭ Route handler | `data.commercialBuildingValuation` 그대로 전달 | 변경 없음 (객체 통째 spread) |

**TS가 잡는 갭**: ④ 헬퍼 / ⑤ UI / ⑦ 결과 / ⑧ validation / ⑩⑫ Zod — 엔진 타입 변경하면 TS 컴파일 에러로 자동 catch.

---

## 4. 마이그레이션 — sessionStorage 호환성

기존 사용자가 사례 29 입력을 sessionStorage에 보관 중인 상태에서 본 변경이 적용되면:
- `cbBuildingStdPriceAtAcq: "397020"` → 새 의미("총액")로 해석되면 0.0145 정도의 잘못된 값
- 결과: 환산취득가 산정값이 무의미해짐

**처리 방침**:
1. 폼 필드명 유지하므로 마이그레이션 코드 자체는 불필요
2. 다만 **본 변경 배포 시 `calc-wizard-migration.ts`의 폼 버전 번호 증가**로 cb* 필드만 초기화 권장 — sessionStorage 기존 값 silently drop
3. 또는 안내 배너로 "기존 입력값 단위 변경 — 재입력 필요" 1회성 표시

→ Do 단계 첫 작업: 마이그레이션 정책 확정.

---

## 5. 케이스 매트릭스 변경 영향

| 케이스 | 영향 |
|---|---|
| C-01 (호별고시 전 환산) | 건물기준시가 3시점 입력 단위만 변경. 결과 anchor 동일 |
| C-02 (호별고시 후 환산) | C-02는 건물기준시가 미사용 → 영향 없음 |
| C-03 (실가) | 영향 없음 |
| C-04~C-06 (보유기간 경계) | C-01 fixture 기반이므로 fixture 재작성에 따라 함께 갱신 |
| C-07~C-08 (validation) | error message에 "㎡당" 제거 |

---

## 6. PDCA 진행 — Todo 리스트 (Do 단계)

1. **마이그레이션 정책 확정** — sessionStorage 기존 cb* 값 drop 여부
2. **엔진 타입 rename** (`commercial-building.types.ts`) — `buildingStdPricePerSqm*` → `buildingStdPrice*` (3개)
3. **엔진 산식 수정** (`commercial-building-valuation.ts`)
   - `calcStdPriceSum()` 시그니처: 4인자 → 3인자 (totalFloorArea 제거)
   - 모든 호출처(187·191·200·304·333행 부근) 갱신
4. **API 변환 헬퍼 키 rename** (`transfer-tax-api-helpers.ts`)
5. **Zod 스키마 키 rename** (`transfer-tax-schema.ts` + `-refines.ts`)
6. **UI 라벨·단위·hint 변경** (`CommercialBuildingBlock.tsx`)
7. **결과 카드 산식 라벨 변경** (`CommercialBuildingValuationDetailCard.tsx`)
8. **validation 메시지 갱신** (`transfer-tax-validate.ts`)
9. **fixture 재작성** (`case-29-fixtures.ts`) — 27,600,830 / 32,674,400 / 42,337,680
10. **anchor 회귀** — 결과값 135,155,041 / 85,844,292 / 8,584,429 / 94,428,721 동일 확인
11. **typecheck + vitest 전체 회귀** (656 passed 유지)
12. **브라우저 수동 확인** — 사례 29 입력 (총액으로) → 결과 동일 확인
13. **메모리 환류** — `feedback_3point_input_consistency.md` 신설 (3시점 환산 입력은 면적-곱 총액으로 통일)

---

## 7. Definition of Done (Do 종료 시)

- [ ] 엔진 타입 PerSqm 키 0건 (grep 검증)
- [ ] `npx tsc --noEmit` 0건
- [ ] anchor 37개 모두 통과 (입력만 총액, 결과 동일)
- [ ] 회귀 656 passed 유지
- [ ] 브라우저: 사례 29 입력 (3시점 총액) → 환산취득가 135,155,041 / 산출세액 85,844,292 / 지방세 8,584,429
- [ ] UI 라벨에서 "㎡당" 0건 (③섹션 한정 grep)
- [ ] 마이그레이션 정책 결정 + 적용

---

## 8. 위험·미해결

1. **다른 시점·자산에도 같은 일관성 검토 필요** — 예를 들어 1990 환산·일반 housing PHD 등도 ㎡당 입력일 수 있음. 본 PDCA 범위 외, 후속 PDCA로 분리.
2. **사용자 외부 자료 의존성** — 국세청 고시는 ㎡당 단위로 발표. 사용자가 직접 곱셈해서 입력하므로 입력 오류 가능성 증가. UI hint에 명시적 안내 강화.
3. **anchor 등가성 가정** — 수학적으로 등가이지만 INT 절사 시점에 차이 가능. Do 단계 첫 회귀 시 결과 anchor 1원 단위까지 일치하지 않으면 산식 검토.
