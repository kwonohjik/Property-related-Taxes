# 사례 33 — 증축 건물의 취득 실거래가 환산 구현 계획서

> 일반건물 사례 31의 확장. 동일 부동산 위에 **원건물(쌍방실가)** + **증축분(일방실가=환산)** 이 공존하는 케이스를 지원한다. 양도일 기준 자산 1개(상가1) 안에 **3개 소득 라인**(토지·건물1·건물2)을 자동 생성해 안분→환산→통산까지 처리한다.

## 1. 사례 요약

| 항목 | 값 |
|---|---|
| 소재지 | 서울 성북구 정릉동 299-6 |
| 양도일·가액 | 2023-02-19 / 330,000,000 |
| 원취득 | 2003-03-17 — 토지+건물1 일괄 200,000,000 / 필요경비 8,000,000 |
| 증축 | 2007-07-24 — 건물2 83.72㎡ (취득가 입증 불가 → 환산) |
| 부수토지 | 57㎡ |
| 예제 anchor | 산출세액 **6,480,952** / 지방세 **648,095** / 과세표준 51,003,969 / 양도소득금액 53,503,969 |

### 1.1 예제가 자동 생성하는 3개 소득 라인 (정답표)

| 라인 | 양도가 | 취득가 | 필요경비 | 양도차익 | LTHD | 양도소득금액 |
|---|---:|---:|---:|---:|---:|---:|
| 토지 (1001) | 275,736,648 | 164,880,819 (실가) | 6,595,233 | 104,260,596 | 31,278,178 | 72,982,418 |
| 건물1 (3001) | 9,996,854 | 35,119,181 (실가) | 1,404,767 | -26,527,094 | 0 | -26,527,094 |
| 건물2 (3002) | 44,266,498 | 32,978,880 (환산) | 1,218,126 (개산) | 10,069,492 | 3,020,847 | 7,048,645 |
| **결손 통산 후** | | | | | | **53,503,969** |

- 건물1 손실 26,527,094 → 토지(48,791,668) + 건물2(4,712,301) 로 안분 흡수 (영 §102② 1차 통산)
- 안분 분모 (양도가): 양도시 토지 기준시가 + 양도시 건물1 기준시가 + 양도시 건물2 기준시가
- 환산 분자 (건물2): 취득시(2007) 건물2 기준시가 / 양도시(2022 고시) 건물2 기준시가

## 2. 기존 자산 대비 추가 입력

사례 31(`propertyType="general_building"`)은 **건물 1동 일괄** 모델이다. 사례 33은 **2동 모델**로 확장하되, 기존 케이스를 깨지 않기 위해 `extensionInfo?` optional 서브객체로 격리한다.

```ts
// lib/tax-engine/general-building-valuation.ts — GeneralBuildingInput 확장
extensionInfo?: {
  /** 증축일 (= 건물2 취득일, 영 §162① 4호) */
  extensionDate: Date;
  /** 증축 연면적 (㎡) */
  extensionArea: number;
  /** 양도시 건물2 기준시가 총액 (원) — UI 입력 (㎡당 단가 × 면적 미리 곱한 총액) */
  transferExtensionBuildingStdPrice: number;
  /** 증축시 건물2 기준시가 총액 (원) — 환산 분자 */
  acquisitionExtensionBuildingStdPrice: number;
  /** 건물2 취득원인 — "newConstruction"이 default (자가 증축) */
  extensionAcquisitionCause: "purchase" | "newConstruction";
  /** §114조의2 5% 가산세 발동 판단용 (newConstruction + 5년 이내). 라우트에서 isSelfBuilt 도출 */
};
```

**원칙**: `extensionInfo` 미입력 시 사례 31 동작 100% 보존(2동 전개 비활성).

## 3. 엔진 변경 — `general-building-valuation.ts`

### 3.1 안분 분모 (양도가)
```
denom = landArea × transferLandPricePerSqm
      + transferBuildingStdPrice          // 건물1 (양도시 위치지수 반영)
      + transferExtensionBuildingStdPrice  // 건물2 — 신규
```

### 3.2 자산 카드 3장 출력
`buildGeneralBuildingAssetCards()` 결과를 `AssetCardForAggregate[]` 길이 3으로 확장:
1. 토지 카드 (기존 — propertyType="land", `acquisitionCause` = `landAcquisitionCause`)
2. 건물1 카드 (기존 — propertyType="general_building_unit", `usedEstimatedAcquisition=false`, **취득가 실가 35,119,181**)
3. 건물2 카드 (**신규** — propertyType="general_building_unit", `usedEstimatedAcquisition=true`, `acquisitionDate=extensionDate`, 환산취득가 32,978,880)

### 3.3 건물1 (쌍방실가) 처리
- 양도가: `transferBuildingStdPrice / denom × totalTransferPrice`
- 취득가: 일괄 200,000,000 중 건물1 몫 = **취득시 기준시가 안분** (`acquisitionBuildingStdPrice / (landArea × acquisitionLandPricePerSqm + acquisitionBuildingStdPrice)`)
- 필요경비: 필요경비 8,000,000 × 동일 비율
- `usedEstimatedAcquisition: false` — 환산 아님, 실가 안분

### 3.4 건물2 (일방실가 = 환산)
- 양도가: `transferExtensionBuildingStdPrice / denom × totalTransferPrice` = 44,266,498
- 환산취득가: `transferPrice × acquisitionExtensionBuildingStdPrice / transferExtensionBuildingStdPrice` = 32,978,880
- 개산공제: 환산취득가 × 3% = **1,218,126** (calculateEstimatedAcquisitionPrice 공식 동일)
- `buildingAcquisitionDate = extensionDate`, `isSelfBuilt = (extensionAcquisitionCause === "newConstruction")`

### 3.5 결손 1차 통산 위임
`transfer-tax-aggregate.ts`의 영 §102② 통산 로직(기존)이 3개 카드를 받아 손실(건물1) 흡수 자동 처리. 엔진 변경 없음.

## 4. UI 변경 — `AssetForm.tsx` 일반건물 섹션

신규 필드를 `extensionInfo` 토글 카드로 격리.

### 4.1 14개 동기화 지점 체크리스트

| # | 위치 | 작업 |
|---|---|---|
| ① 폼 상태 타입 | `lib/stores/calc-wizard-store.ts` AssetForm | `gbHasExtension`, `gbExtensionDate`, `gbExtensionArea`, `gbTransferExtensionBuildingStdPrice`, `gbAcquisitionExtensionBuildingStdPrice`, `gbExtensionAcquisitionCause` 6 필드 |
| ② initial | 동 store initialAssetForm | `gbHasExtension: false`, 나머지 ""/undefined |
| ③ normalize | `normalizeAssetForm` | gbHasExtension false 시 증축 필드 모두 폐기 |
| ④ API 변환 | `lib/calc/transfer-tax-api-helpers.ts` | gbHasExtension true 시 `extensionInfo` 객체 빌드해 `GeneralBuildingInput`에 spread |
| ⑤ UI 위젯 | `AssetForm` 일반건물 섹션 | ToggleCard "증축 있음" → 펼침: DateInput(증축일) + DecimalInput(증축 면적) + CurrencyInput(증축시 건물기준시가 총액·양도시 건물2 기준시가 총액) + RadioCardGroup(매매/신축자가증축) |
| ⑥ 사이드바 | — | 영향 없음 (자산-수준만) |
| ⑦ 결과 카드 | `BundledAllocationCard` | 3행 안분표(토지/건물1/건물2) 지원 — `cards.length === 3` 분기 |
| ⑧ validation | `lib/calc/transfer-tax-validate.ts` | gbHasExtension true 시 5필드 필수, 증축일 > 토지 취득일 + 증축 면적 > 0 + 4기준시가 > 0 |
| ⑨⑩ Zod enum | `lib/api/transfer-tax-schema.ts`·`-sub.ts` | `extensionAcquisitionCause` enum 추가 |
| ⑪ acquisitionDate fallback | route handler | 건물2 카드는 `extensionDate` 사용 (단일 진실) |
| ⑫ Zod 객체 정의 | `transfer-tax-schema-sub.ts` | `extensionInfo` z.object 신규 정의 — **침묵 stripping 차단** |
| ⑬ callTransferTaxAPI body spread | `transfer-tax-api.ts` | `extensionInfo` 메인 body에 포함 |
| ⑭ Route handler 엔진 매핑 | `app/api/calc/transfer/general-building-route-helper.ts` | `toOptionalDate(extensionInfo?.extensionDate)` + `extensionInfo` 객체 전체 엔진 input 매핑 |

### 4.2 UI 표시 순서 (계산 로직 순서)
1. 토지 면적·양도시 개공·취득시 개공 (기존)
2. 건물1 양도시 기준시가·취득시 기준시가 (기존)
3. **[증축 있음 ▾ 토글]**
   - 증축일 (DateInput)
   - 증축 면적 (DecimalInput)
   - 증축시 건물 기준시가 총액 (취득 분자)
   - 양도시 건물2 기준시가 총액 (양도 안분 분모 + 환산 분모)
   - 증축 취득원인 (매매 / 자가증축 — 신축 5년 이내 가산세 분기)
4. 일괄 취득가·필요경비 (기존 — 건물2는 환산이므로 여기 미포함)

## 5. anchor 테스트 (최소 24개)

`__tests__/tax-engine/transfer-tax/general-building-extension-case-33.test.ts` 신규 작성. 모두 `toBe()` 원단위.

### 5.1 안분·환산 (8)
- 토지 양도가 275,736,648 / 건물1 양도가 9,996,854 / 건물2 양도가 44,266,498 / 합계 330,000,000
- 토지 실가 164,880,819 / 건물1 실가 35,119,181 / 합계 200,000,000
- 건물2 환산 32,978,880 / 건물2 개산공제 1,218,126

### 5.2 양도차익·LTHD (9)
- 토지 양도차익 104,260,596 / LTHD 31,278,178 / 양도소득금액 72,982,418
- 건물1 양도차익 -26,527,094 / LTHD 0 / 양도소득금액 -26,527,094
- 건물2 양도차익 10,069,492 / LTHD 3,020,847 / 양도소득금액 7,048,645

### 5.3 결손 통산·세액 (7)
- 토지 통산 후 48,791,668 / 건물2 통산 후 4,712,301 / 건물1 0
- 통산 합계 53,503,969
- 과세표준 51,003,969 / 세율 24% / 산출세액 6,480,952 / 지방세 648,095

### 5.4 회귀 (사례 31 격리)
- `extensionInfo` undefined 시 사례 31 결과(28,930,232 등) 그대로 유지하는 회귀 anchor 1개

## 6. 작업 분할 (시니어 호출 계획)

병렬 호출 1라운드 — Plan 단계:
- `transfer-tax-senior` — 엔진 GeneralBuildingInput 확장 + buildGeneralBuildingAssetCards 3카드 분기 설계
- `transfer-tax-ui-senior` — 14개 동기화 지점 + AssetForm 증축 토글 카드 설계 + BundledAllocationCard 3행 분기

병렬 호출 2라운드 — Do 단계:
- 엔진 시니어: 모듈 변경 (~+120줄, 800 한계 여유 확보) + anchor 24개
- UI 시니어: 6필드 추가 + Zod ⑨⑩⑫ + route ⑭ + validate ⑧

3라운드 — Check:
- `ui-engine-sync-checker` — 14개 동기화 누락 검증
- `transfer-tax-qa` — anchor 통과 + 사례 31 회귀 0
- 브라우저 수동: 토글 ON → 6필드 입력 → 산출세액 6,480,952 / 지방세 648,095 표시 확인

## 7. 종료 조건

- [ ] `extensionInfo` 입력 시 사례 33 anchor 24개 toBe 정확 통과
- [ ] `extensionInfo` 미입력 시 사례 31 회귀 anchor 38개 100% 보존
- [ ] 14개 동기화 지점 자가 점검 (특히 ⑫⑬⑭ grep)
- [ ] `npx tsc --noEmit` 0건 / `npx vitest run` 전체 통과
- [ ] 브라우저 Network 탭에서 request body에 `extensionInfo` 포함 + 결과 일치
- [ ] CLAUDE.md 최근 완료 1줄 + MEMORY.md `project_general_building_case_33.md` 추가

## 8. 비스코프 (후속 PR 후보)

- 증축 2회 이상 (건물2·건물3 다중) — 사례 33은 1회만
- 증축분 §114조의2 5% 가산세 — `extensionAcquisitionCause = "newConstruction"` + 5년 이내 양도 시 발동 (사례 32 인프라 재사용, 별도 anchor 필요)
- 토지 상속·증여 + 증축 cross-cutting (#4-a~#7-b와 결합)
