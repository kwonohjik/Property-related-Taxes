# 사례 33 — 증축 건물의 취득 실거래가 환산 (수정 계획서)

## Context

**왜 이 변경이 필요한가**
- 양도세 사례 33은 동일 부동산 위에 **2003년 원취득 건물(쌍방실가)** + **2007년 증축분(일방실가=환산)** 이 공존하는 케이스다.
- 사례 31(`propertyType="general_building"`)은 건물 1동 일괄 모델이라 증축분을 별도 환산 자산으로 분리하지 못한다.
- 양도코리아 정답: 산출세액 **6,480,952** / 지방세 **648,095** — 3개 소득 라인(토지·건물1·건물2)을 자동 생성하고 영 §102② 결손 통산으로 도달.

**검토 라운드(2026-05-11)에서 정정된 산식 5건**
1. 일괄 취득가 안분은 **양도시** 기준시가 비율(소령 §166⑥) — "취득시 비율"은 오류였음
2. 환산 산식의 `transfer` 인자는 **자산별 안분된 양도가**(건물2 몫) — 총 양도가 아님
3. 안분 분모 3항은 모두 **원 총액** 단위로 통일 (UI에서 ㎡당 단가 받으면 침묵 버그)
4. 영 §102② 결손 통산은 **양도소득금액(income) 기준** pro-rata — gain 기준 아님 (`transfer-tax-aggregate-helpers.ts:137-150` 확인)
5. §114조의2 5% 가산세는 비스코프이지만, **가산세=0 명시 anchor** 1개를 회귀에 박아 5년 이내 케이스 침묵 버그 차단

**의도된 결과**: 사례 31 회귀 0건 + 사례 33 anchor 24개 100% 통과 + 사례 34/35(증축 후속) 확장 안전.

## 1. 사례 정답표 (anchor 기준)

| 라인 | 양도가 | 취득가 | 필요경비 | 양도차익 | LTHD | 양도소득금액 (income) | 통산 후 |
|---|---:|---:|---:|---:|---:|---:|---:|
| 토지 (1001) | 275,736,648 | 164,880,819 (실가 안분) | 6,595,233 | 104,260,596 | 31,278,178 | 72,982,418 | 48,791,668 |
| 건물1 (3001) | 9,996,854 | 35,119,181 (실가 안분) | 1,404,767 | -26,527,094 | 0 | -26,527,094 | 0 |
| 건물2 (3002) | 44,266,498 | 32,978,880 (환산) | 1,218,126 (개산공제) | 10,069,492 | 3,020,847 | 7,048,645 | 4,712,301 |
| **합계** | 330,000,000 | 232,978,880 | 9,218,126 | 87,802,994 | 34,299,025 | **53,503,969** | **53,503,969** |

**검산 (영 §102② income 기준)**:
- 흡수 풀: min(80,031,063 양수합, 26,527,094 손실절대값) = 26,527,094
- 토지 안분 비율 72,982,418/80,031,063 = 91.193% → 흡수 24,190,750
- 건물2 안분 비율 7,048,645/80,031,063 = 8.807% → 흡수 2,336,344
- 토지 통산 후 72,982,418 − 24,190,750 = **48,791,668** ✓
- 건물2 통산 후 7,048,645 − 2,336,344 = **4,712,301** ✓

**세액**: 53,503,969 − 기본공제 2,500,000 = 51,003,969 × 24% − 누진공제 5,760,000 (2023년 §55 누진세율표) = **6,480,952** / 지방세 10% = **648,095**.

## 2. 엔진 변경 — `lib/tax-engine/general-building-valuation.ts`

### 2.1 입력 타입 확장 (`GeneralBuildingInput`)

기존 입력에 **`extensionInfo?` optional 서브객체** 추가. 미입력 시 사례 31 동작 100% 보존.

```ts
extensionInfo?: {
  /** 증축일 (=건물2 취득일, 영 §162①4호) */
  extensionDate: Date;
  /** 증축 연면적 (㎡) — 정보용 (현 시점 안분식에 미사용, 위치지수 산정 확장 대비) */
  extensionArea: number;
  /** 양도시 건물2 기준시가 총액 (원) — UI에서 단가 곱한 총액 받음 */
  transferExtensionBuildingStdPrice: number;
  /** 취득시(증축시) 건물2 기준시가 총액 (원) — 환산 분자 */
  acquisitionExtensionBuildingStdPrice: number;
  /** 건물2 취득원인 — default "newConstruction"(자가증축). "purchase"는 매수 증축. */
  extensionAcquisitionCause: "purchase" | "newConstruction";
};
```

### 2.2 산식 (정정 반영)

**Step 1 — 양도가 3-way 안분 (양도시 기준시가 비율, 소령 §166⑥)**

```
landStdTotal      = transferLandPricePerSqm × landArea           // 원
buildingStdTotal  = transferBuildingStdPrice                     // 원 (건물1)
extStdTotal       = transferExtensionBuildingStdPrice            // 원 (건물2)
denom             = landStdTotal + buildingStdTotal + extStdTotal // 원
// ※ 3항 모두 원 단위 — UI/validate에서 단위 검증 필수

landTransferPrice         = floor(totalTransferPrice × landStdTotal     / denom) = 275,736,648
building1TransferPrice    = floor(totalTransferPrice × buildingStdTotal / denom) =   9,996,854
building2TransferPrice    = floor(totalTransferPrice × extStdTotal      / denom) =  44,266,498
```

**Step 2 — 일괄 취득가 안분 (토지+건물1만, 양도시 비율 §166⑥)**

```
// 200,000,000은 토지+건물1 일괄. 건물2는 별도 증축이므로 분배 대상 아님.
landBuildingDenom = landStdTotal + buildingStdTotal     // 양도시 비율 그대로
landAcq           = floor(200,000,000 × landStdTotal     / landBuildingDenom) = 164,880,819
building1Acq      = floor(200,000,000 × buildingStdTotal / landBuildingDenom) =  35,119,181
landExp           = floor(  8,000,000 × landStdTotal     / landBuildingDenom) =   6,595,233
building1Exp      = floor(  8,000,000 × buildingStdTotal / landBuildingDenom) =   1,404,767
```

**Step 3 — 건물2 환산취득가 (소령 §176의2②)**

```
// 첫 인자는 건물2 안분 양도가 (총 양도가 아님)
building2Acq = floor(
  building2TransferPrice × acquisitionExtensionBuildingStdPrice / transferExtensionBuildingStdPrice
)
            = floor(44,266,498 × ratio) = 32,978,880   // ratio ≈ 0.7451

building2EstDeduction = floor(building2Acq × 0.03) = 989,366
// ⚠ anchor 1,218,126과 불일치 → 검증 필요 (아래 §6.3 미해결 항목)
```

**Step 4 — 3장의 `AssetCardForAggregate` 출력**

| 카드 | propertyType | acquisitionPrice | expenses | usedEstimatedAcquisition | buildingAcquisitionDate | isSelfBuilt |
|---|---|---:|---:|---|---|---|
| 토지 | "land" | 164,880,819 | 6,595,233 | false | — | — |
| 건물1 | "general_building_unit" | 35,119,181 | 1,404,767 | false | acquisitionDate (2003-03-17) | false |
| 건물2 | "general_building_unit" | 32,978,880 | 1,218,126 (=환산×3% 또는 추가 자본지출 별도) | true | **extensionDate (2007-07-24)** | extensionAcquisitionCause==="newConstruction" |

**Step 5 — 결손 통산은 aggregate 엔진에 위임 (변경 없음)**

`transfer-tax-aggregate-helpers.ts:137-150`의 income 기준 pro-rata가 3장 카드를 받아 자동 처리.

### 2.3 §114조의2 5% 가산세 (사례 33 활성)

- 사례 33: 증축일 2007-07-24 + 5년 = 2012-07-24 < 양도일 2023-02-19 → **가산세 = null (발동 안 함)**
- 인프라(`calculateBuildingPenalty()`)는 `isSelfBuilt + buildingAcquisitionDate` 이미 받음 — **추가 구현 0, anchor만 추가**
- **5.4 회귀 anchor 1개 추가**: `extensionAcquisitionCause === "newConstruction"` 시에도 가산세 0 명시
- 후속 PR: 2007 증축 → 2012 이내 양도 시뮬레이션 (5년 경계 anchor)

## 3. UI 변경 — 14개 동기화 지점

| # | 위치 | 작업 |
|---|---|---|
| ① 타입 | `lib/stores/calc-wizard-store.ts` AssetForm | `gbHasExtension`(boolean) + 5필드 (`gbExtensionDate`/`gbExtensionArea`/`gbTransferExtensionBuildingStdPrice`/`gbAcquisitionExtensionBuildingStdPrice`/`gbExtensionAcquisitionCause`) |
| ② initial | 동일 store | `gbHasExtension: false`, 나머지 ""/undefined |
| ③ normalize | `normalizeAssetForm` | gbHasExtension=false 시 5필드 전부 폐기 (legacy 자동 정리) |
| ④ API 변환 | `lib/calc/transfer-tax-api-helpers.ts` | gbHasExtension=true 시 `extensionInfo` 객체 빌드 후 `GeneralBuildingInput` spread |
| ⑤ UI 위젯 | `components/calc/transfer/AssetForm` 일반건물 섹션 | ToggleCard "증축 있음" 펼침: DateInput + DecimalInput(면적) + **CurrencyInput 2개(총액·원 단위 명시 hint)** + RadioCardGroup(매매/자가증축) |
| ⑥ 사이드바 | — | 영향 없음 |
| ⑦ 결과 카드 | `BundledAllocationCard` | `cards.length === 3` 분기 — 4열(토지/건물1/건물2/합계) 안분표 |
| ⑧ validation | `lib/calc/transfer-tax-validate.ts` | gbHasExtension=true 시: 5필드 필수 + 증축일 ∈ (토지취득일, 양도일) + 면적 > 0 + 2기준시가 > 0 + **"기준시가는 ㎡당 단가가 아닌 총액(원)" 메시지** |
| ⑨ Zod enum (main) | `lib/api/transfer-tax-schema.ts` | `extensionAcquisitionCause` z.enum 정의 |
| ⑩ Zod enum (sub) | `lib/api/transfer-tax-schema-sub.ts` | 동일 enum re-export + `addPropertyRefines` 헬퍼 타입 |
| ⑪ acquisitionDate fallback | route handler | 건물2 카드는 extensionDate 사용 (단일 진실) |
| ⑫ **Zod 객체 정의** | `transfer-tax-schema-sub.ts` | `extensionInfo` z.object 신규 정의 — **누락 시 침묵 stripping** |
| ⑬ **callTransferTaxAPI body spread** | `lib/calc/transfer-tax-api.ts` | `extensionInfo` 메인 body 통합 |
| ⑭ **Route handler 엔진 매핑** | `app/api/calc/transfer/general-building-route-helper.ts` | `toOptionalDate(body.extensionInfo?.extensionDate)` + `extensionInfo` 객체 엔진 input 매핑 |

**UI 표시 순서 (계산 로직 순서 = §3.1 기본 모드 표시)**: 토지 → 건물1 → **[증축 토글]** → 건물2 5필드 → 일괄 취득가·필요경비.

## 4. 변경 대상 파일

| 파일 | 변경 | 예상 +줄 |
|---|---|---:|
| `lib/tax-engine/general-building-valuation.ts` (621줄) | 입력 타입 + Step1·3 안분 + 카드 3장 분기 | +120 |
| `lib/tax-engine/types/transfer.types.ts` | 해당 사항 없음 (aggregate가 카드 받음) | 0 |
| `lib/stores/calc-wizard-store.ts` | 6필드 추가 | +20 |
| `components/calc/transfer/AssetForm.tsx` | 증축 토글 카드 | +80 |
| `components/calc/transfer/BundledAllocationCard.tsx` | 3-way 분기 | +40 |
| `lib/calc/transfer-tax-api-helpers.ts` | extensionInfo 빌드 | +25 |
| `lib/calc/transfer-tax-api.ts` | body spread | +5 |
| `lib/calc/transfer-tax-validate.ts` (776줄) | 5필드 validate + 단위 메시지 | +35 (분할 신호 점검) |
| `lib/api/transfer-tax-schema.ts` | enum + extensionInfo z.object | +25 |
| `lib/api/transfer-tax-schema-sub.ts` | enum re-export | +10 |
| `app/api/calc/transfer/general-building-route-helper.ts` | 엔진 매핑 + Date 변환 | +15 |
| `__tests__/tax-engine/transfer-tax/general-building-extension-case-33.test.ts` | anchor 24+1 | 신규 |

**800줄 신호**: `transfer-tax-validate.ts` 776줄 → +35줄이면 811줄 → **도메인 분할 선행** (메모리 `feedback_validate_split_signal.md`).

## 5. 재사용 대상 (신규 작성 금지)

- `safeMultiplyThenDivide()` (`tax-utils.ts`) — overflow 안전 안분
- `calculateConvertedAcquisition()` 내부 산식 (`general-building-valuation.ts:313-350`) — 호출 인자만 `building2TransferPrice`로 변경하여 재호출
- `calculateBuildingPenalty()` (`transfer-tax-rate-calc.ts:68-104`) — §114조의2 가산세 (사례 32 인프라 그대로)
- `transfer-tax-aggregate-helpers.ts:137-150` income-기준 pro-rata — 변경 없음
- `toOptionalDate()` (`lib/api/date-coerce.ts`)
- UI: `ToggleCard` · `DateInput` · `CurrencyInput` · `DecimalInput` · `RadioCardGroup` · `FieldCard hint` (단위 명시 — placeholder 숫자 예시 금지)

## 6. anchor 테스트 (25개, `toBe()` 원단위)

### 6.1 안분·환산 (8)
- 토지 양도가 275,736,648 / 건물1 양도가 9,996,854 / 건물2 양도가 44,266,498 / 합 330,000,000
- 토지 실가 164,880,819 / 건물1 실가 35,119,181 / 합 200,000,000
- 건물2 환산 32,978,880

### 6.2 양도차익·LTHD·income (9)
- 토지 차익 104,260,596 / LTHD 31,278,178 / income 72,982,418
- 건물1 차익 -26,527,094 / LTHD 0 / income -26,527,094
- 건물2 차익 10,069,492 / LTHD 3,020,847 / income 7,048,645

### 6.3 통산·세액 (7)
- 토지 통산후 48,791,668 / 건물2 통산후 4,712,301 / 건물1 0
- 흡수 합 검증 anchor: 24,190,750 + 2,336,344 = 26,527,094
- 통산후 합 53,503,969 / 과세표준 51,003,969 / 산출세액 6,480,952 / 지방세 648,095

### 6.4 회귀 + 가산세 0 (1)
- `extensionAcquisitionCause: "newConstruction"` + 양도일 > 증축일+5년 → **penalty = 0** anchor (5년 초과 침묵 가드)
- 사례 31 모든 anchor 그대로 통과 (별도 회귀 파일 변경 없음)

### ⚠️ 미해결 항목 — 건물2 개산공제
- 사례 33 정답표: 건물2 개산공제 **1,218,126**
- 단순 산식 검증: 32,978,880 × 3% = **989,366**
- 차이: 228,760 — 양도코리아의 개산공제 산정 기준 별도 조사 필요 (양도시 기준시가 × 3% 가능성? `lib/tax-engine/transfer-tax-helpers.ts`의 `calcEstimatedDeductionForGB()` 비교)
- **Phase 1.1 작업 첫 단계로 양도코리아 화면 캡처 + 사례 31 동일 모듈 산식 grep 필수**

## 7. 검증 방법 (E2E)

```bash
# 1. 단위 테스트 (anchor 25개 + 사례 31 회귀)
npx vitest run __tests__/tax-engine/transfer-tax/general-building-extension-case-33.test.ts
npx vitest run __tests__/tax-engine/transfer-tax/general-building-case-31.test.ts
npx vitest run __tests__/tax-engine/transfer-tax/   # 전체 회귀

# 2. 타입·린트
npm run typecheck
npm run lint

# 3. 브라우저 수동 (필수)
npm run dev
# /calc/transfer 진입 → 자산 추가 → 일반건물 선택
# → 토지·건물1 기준값 입력 → "증축 있음" 토글 ON
# → 증축일 2007-07-24 / 면적 83.72 / 양도시·취득시 건물2 기준시가 총액 입력
# → 일괄 취득가 200,000,000 / 필요경비 8,000,000 입력
# → 계산 결과: 산출세액 6,480,952 / 지방세 648,095 확인
# → Network 탭에서 request body에 `extensionInfo` 포함 확인 (⑫⑬⑭ 검증)
# → 단가(원/㎡)로 잘못 입력 → validate 메시지 "총액(원) 단위" 확인

# 4. 사용자 자가 점검 (작업 완료 보고 전)
# - [ ] 14개 동기화 지점 grep (특히 ⑫⑬⑭ TypeScript 미감지)
# - [ ] anchor 25개 toBe 정확 통과
# - [ ] §114조의2 가산세 0 anchor 통과 (5년 초과 케이스)
# - [ ] 사례 31 회귀 anchor 38개 0건 실패
```

## 8. 비스코프 (후속 PR 후보)

- 증축 2회 이상 (건물2·건물3 다중)
- 2007 증축 → 2012 이내 양도 시뮬레이션 (§114조의2 5% 가산세 active 케이스)
- 증축 + 토지 상속·증여 cross-cutting (#4-a~#7-b 결합)
- 건물1만 양도 / 건물2만 양도 (부분 양도)
