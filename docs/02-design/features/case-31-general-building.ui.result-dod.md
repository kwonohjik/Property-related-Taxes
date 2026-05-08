# 사례 31 UI Design — 결과 카드·동기화 매트릭스·DoD

> 이 파일은 `case-31-general-building.ui.design.md`에서 800줄 정책으로 분리됨.
> §11~§17 (결과 카드 산식 / 14개 동기화 매트릭스 / 엔진 협업 / 케이스 매트릭스 / 수동 테스트 / DoD)

---

## 11. 결과 카드 산식 표시 (⑦ 결과 카드)

### 11.1 신규 결과 카드 컴포넌트

**위치**: `components/calc/results/GeneralBuildingValuationDetailCard.tsx` (신규 파일, ~250줄)
**렌더 조건**: 엔진 result에 `generalBuildingValuationDetail` 필드 존재 시
**배치**: `TransferTaxResultView.tsx` → CommercialBuildingValuationDetailCard 렌더 블록 아래

```typescript
// TransferTaxResultView.tsx 에 추가:
{result.generalBuildingValuationDetail && (
  <GeneralBuildingValuationDetailCard
    detail={result.generalBuildingValuationDetail}
    totalTransferPrice={result.transferPrice}
    holdingYears={result.holdingYears}
    holdingMonths={result.holdingMonths}
  />
)}
```

### 11.2 결과 카드 표시 구조 — 양도코리아 표 재현

#### [1단계] 양도가액 안분 표

```
┌─────────────────────────────────────────────────────────────────────┐
│ 토지·건물 양도가액 안분 (양도시 기준시가 비율)                          │
│ 근거: 소득세법 §100①, 시행령 §166①                                    │
├──────────────────┬───────────────┬───────────────┬───────────────┤
│ 구분             │ 토지          │ 건물          │ 합계          │
├──────────────────┼───────────────┼───────────────┼───────────────┤
│ 양도시 기준시가   │ 공시지가×면적  │ 건물기준시가  │ 합계          │
│                  │ 10,830,000×85 │ 20,629,440    │ 941,179,440   │
│                  │ = 920,550,000 │               │               │
├──────────────────┼───────────────┼───────────────┼───────────────┤
│ 안분율            │ 97.808...%    │  2.191...%    │ 100%          │
├──────────────────┼───────────────┼───────────────┼───────────────┤
│ 양도가액 안분     │ 904,725,192   │ 20,274,808    │ 925,000,000   │
│ (총 양도가 × 비율)│               │ (잔액 보정)   │               │
└──────────────────┴───────────────┴───────────────┴───────────────┘

산식 (한국어 표기):
  토지 양도가액 = INT(총양도가 925,000,000 × 토지 기준시가 920,550,000 / 합계 기준시가 941,179,440)
               = 904,725,192
  건물 양도가액 = 총양도가 925,000,000 − 토지 양도가액 904,725,192 = 20,274,808 (잔액 보정)

[BigInt 검산]
  양도시 토지 기준시가 = 10,830,000 × 85㎡ = 920,550,000
  양도시 건물 기준시가 = 20,629,440 (총액, BigInt 정밀 산출값)
  합계 기준시가       = 920,550,000 + 20,629,440 = 941,179,440
```

#### [2단계] 환산취득가 산식

```
환산취득가 (시행령 §176의2④)
  토지 환산취득가
    취득시 토지 기준시가 = 공시지가 2,800,000 × 토지면적 85㎡ = 238,000,000
    = INT(토지 양도가액 904,725,192 × 취득시 토지 기준시가 238,000,000 / 양도시 토지 기준시가 920,550,000)
    = 233,908,636

  건물 환산취득가
    = INT(건물 양도가액 20,274,808 × 취득시 건물기준시가 28,144,700 / 양도시 건물기준시가 20,629,440)
    = 27,660,876
```

#### [3단계] 개산공제 산식

```
기타필요경비 (개산공제, 시행령 §163⑥ 등기 자산 3%)
  토지 개산공제 = INT(취득시 토지 기준시가 238,000,000 × 3%)
               = INT(2,800,000 × 85㎡ × 3%)
               = 7,140,000
  건물 개산공제 = INT(취득시 건물기준시가 28,144,700 × 3%)
               = 844,341
  합계         = 7,984,341
```

#### [4단계] 자산별 양도차익·장특공제·양도소득금액 표

```
┌──────────────────────────────────────┬──────────────┬──────────────┬──────────────┐
│ 구분                                  │ 토지         │ 건물         │ 합계         │
├──────────────────────────────────────┼──────────────┼──────────────┼──────────────┤
│ 양도가액                               │ 904,725,192  │ 20,274,808   │ 925,000,000  │
│ 환산취득가                             │ 233,908,636  │ 27,660,876   │ 261,569,520  │
│ 기타필요경비(개산공제)                  │ 7,140,000    │ 844,341      │ 7,984,341    │
│ 양도차익                               │ 663,676,556  │ −8,230,409   │ 655,446,139  │
│ 장기보유특별공제                        │ 199,102,966  │ 0            │ 199,102,966  │
│  └ 보유기간 만 23년, 표1 일반자산 30%   │              │ (차손 미적용) │              │
│ 양도소득금액 (통산 전)                  │ 464,573,590  │ −8,230,409   │ 456,343,181  │
├──────────────────────────────────────┼──────────────┼──────────────┼──────────────┤
│ §102② 결손금 1차 통산                  │ (−8,230,409) │ (+8,230,409) │ —            │
│ 양도소득금액 (통산 후)                  │ 456,343,181  │ 0            │ 456,343,181  │
└──────────────────────────────────────┴──────────────┴──────────────┴──────────────┘
```

> **자산코드(1001/3001) 표기 기준**: 결과 카드에서는 "토지/건물" 단순 라벨 사용. 자산코드 1001/3001은 신고서 양식 표(`FilingFormTable`) 내부에서만 표시.

#### [5단계] 과세표준·세액 산식

```
양도소득금액 합계: 456,343,181
양도소득기본공제: 2,500,000
과세표준: 456,343,181 − 2,500,000 = 453,843,181

산출세액 (양도연도 2023 §55 누진세율표 — 외부 자료 추종 금지)
  ★ 2023년 적용 소법 §55 세율표로 직접 계산 (양도코리아 PDF 산출값 anchor 금지)

장기보유특별공제 산식 (토지):
  = INT(양도차익 663,676,556 × 30%)
  = 199,102,966
  보유기간: 1999-05-24 → 2023-02-19 = 만 23년 8개월 → 1년 미만 절사 → 만 23년
  장특공률: 소법 §95② 표1 일반자산 — 15년 이상 상한 30% (2%×15=30%)

건물 장기보유특별공제: 0
  (양도차익 −8,230,409 → 차손이므로 장특 미적용. §95①: 양도차익에서 차감)
```

### 11.3 표기 금지 사항

- "장특공 = 양도소득금액 × 30%" — 양도차익 × 30%가 정확
- "건물 차손 → 장특공제 마이너스 처리" — 차손이면 장특 0, 통산 단계에서 흡수
- "개산공제 = 환산취득가 × 3%" — 취득시 기준시가 × 3%가 정확 (분자 기준)
- "산출세액 × 10% = 지방세" — §103조의3 누진세율표 직접 적용
- 변수 약어 (`P_F`, `T_land`, `gbTV`) 직접 표기
- 과세표준 천원 절사 (소법·지방세법에 절사 규정 없음)

---

## 12. 14개 동기화 지점 매트릭스

신규 gb* 필드 8개 × 14지점 전수 점검. **⑫⑬⑭는 TypeScript 미감지 영역** — grep 자가 점검 필수.

| # | 지점 | 파일 위치 | 신규 내용 | 비고 |
|---|---|---|---|---|
| ① | 폼 상태 타입 | `lib/stores/calc-wizard-asset.ts` → `AssetForm` | `assetKind`에 `"general_building"` 추가 + `gb*` 8개 필드 | 메인 §3 |
| ② | initial value | `lib/stores/calc-wizard-asset.ts` `createInitialAssetForm()` 또는 `calc-wizard-asset-factory.ts` `makeDefaultAsset()` | `gb*` 8개 필드 기본값 | 메인 §4 |
| ③ | normalize fallback | `lib/stores/calc-wizard-asset.ts` `normalizeAsset()` 또는 `calc-wizard-asset-factory.ts` `migrateAsset()` | `gb*` `??=` 보호 + `assetKind` fallback | 메인 §5 |
| ④ | API 변환 헬퍼 | `lib/calc/transfer-tax-api-helpers.ts` | `buildGeneralBuildingValuation()` 신규 + `toEngineAssetKind` 반환타입 확장 | 메인 §6.2~6.3 |
| ⑤ | UI 입력 위젯 | `components/calc/transfer/GeneralBuildingBlock.tsx` (신규) + `CompanionAssetCard.tsx` | ASSET_KIND_OPTIONS 확장 + 위젯 트리 | 메인 §8 |
| ⑥ | 사이드바 합계 | `lib/stores/calc-wizard-store.ts` → `computeTransferSummary()` | `"general_building"` 라벨 케이스 추가 | 메인 §9 |
| ⑦ | 결과 카드 | `components/calc/results/GeneralBuildingValuationDetailCard.tsx` (신규) + `TransferTaxResultView.tsx` | 안분표 + 환산산식 + 통산표 | §11 |
| ⑧ | Validation | `lib/calc/transfer-tax-validate.ts` → `validateStep()` step 0 | `assetKind === "general_building"` 분기 | 메인 §10 |
| ⑨ | Zod enum (메인) | `lib/api/transfer-tax-schema.ts` → `propertyType` enum + `propertyBaseShape` | `"general_building"` enum 추가 + `generalBuildingValuation: generalBuildingValuationSchema.optional()` | 메인 §7.1 |
| ⑩ | Zod refine (컴패니언) | `lib/api/transfer-tax-schema-sub.ts` → `addPropertyRefines` | `generalBuildingValuation` 교차 검증 블록 추가 | 메인 §7.3 |
| ⑪ | acquisitionDate fallback | `app/api/calc/transfer/route.ts` | general_building은 별도 서브객체 acquisitionDate 없음 — 기존 경로 유지 | 해당 없음 |
| ⑫ | Zod 객체 정의 | `lib/api/transfer-tax-schema.ts` (또는 sub) | `generalBuildingValuationSchema` Zod 객체 신규 정의 | 메인 §7.2. TS 미감지 |
| ⑬ | callTransferTaxAPI body spread | `lib/calc/transfer-tax-api.ts` → `body` 객체 | `...(gbValuation !== undefined ? { generalBuildingValuation: gbValuation } : {})` | 메인 §6.4. TS 미감지 |
| ⑭ | Route handler 엔진 input 매핑 | `app/api/calc/transfer/route.ts` | `generalBuildingValuation: {...validated.generalBuildingValuation, totalTransferPrice: body.transferPrice, transferDate: toDate(...), acquisitionDate: toDate(...)}` — 최상위 필드 서브객체 주입 | 메인 §7.4. TS 미감지 |

### ⑫⑬⑭ grep 자가 점검 명령어 (Do 단계 완료 보고 전 실행)

```bash
# ⑫ Zod 객체 정의
grep -n "generalBuildingValuationSchema" lib/api/transfer-tax-schema.ts lib/api/transfer-tax-schema-sub.ts

# ⑬ body spread
grep -n "generalBuildingValuation" lib/calc/transfer-tax-api.ts

# ⑭ route handler 매핑
grep -n "generalBuildingValuation" app/api/calc/transfer/route.ts

# 엔진 타입 선언 (엔진 시니어 완료 후)
grep -rn "GeneralBuildingValuationInput\|generalBuildingValuation" lib/tax-engine/
```

---

## 13. 엔진 시니어 협업 요청 사항

### 13.1 엔진 신규 input 필드 (`TransferTaxInput`)

```typescript
/**
 * 일반건물(토지+건물 일괄) 환산취득가 계산 입력 (선택).
 * 제공 시 general-building-valuation.ts로 환산취득가 계산.
 * propertyType === "general_building" + gbUseEstimatedAcquisition=true 시 의미 있음.
 */
generalBuildingValuation?: GeneralBuildingValuationInput;
```

### 13.2 `GeneralBuildingValuationInput` 타입 (엔진 시니어 확정)

Plan §4.2 기준 — UI는 다음 타입과 1:1 매핑:

```typescript
type GeneralBuildingValuationInput = {
  totalTransferPrice: number;           // 총 양도가액
  transferDate: Date;                   // 양도일
  acquisitionDate: Date;                // 취득일
  landArea: number;                     // 토지면적 (㎡)
  buildingArea: number;                 // 건물 연면적 (㎡)
  buildingFloors: number;               // 층수
  transferLandPricePerSqm: number;      // 양도시 공시지가 (원/㎡)
  transferBuildingValue: number;        // 양도시 건물기준시가 총액 (원)
  acquisitionLandPricePerSqm: number;   // 취득시 공시지가 (원/㎡)
  acquisitionBuildingValue: number;     // 취득시 건물기준시가 총액 (원)
  estimatedDeductionRate?: number;      // 기본 0.03 (시행령 §163⑥)
};
```

> **[합의 확정]** `totalTransferPrice` / `transferDate` / `acquisitionDate`는 route handler(⑭)에서 최상위 필드 참조 후 서브객체에 주입. `buildGeneralBuildingValuation()` 헬퍼와 Zod 스키마에 미포함. UI는 별도 처리 불필요. (메인 §7.4 참조)

### 13.3 엔진 결과 필드 (`TransferTaxResult`) — 결과 카드 echo

```typescript
generalBuildingValuationDetail?: GeneralBuildingValuationDetail;
```

`GeneralBuildingValuationDetail` 최소 포함 필드:

| 필드명 | 설명 |
|---|---|
| `transferLandStd` | 양도시 토지 기준시가 합계 |
| `transferBuildingStd` | 양도시 건물기준시가 합계 |
| `totalTransferStd` | 양도시 기준시가 합계 |
| `acquisitionLandStd` | 취득시 토지 기준시가 합계 |
| `acquisitionBuildingStd` | 취득시 건물기준시가 합계 |
| `allocatedLandPrice` | 토지 안분 양도가액 |
| `allocatedBuildingPrice` | 건물 안분 양도가액 |
| `estimatedAcquisitionLand` | 환산취득가(토지) |
| `estimatedAcquisitionBuilding` | 환산취득가(건물) |
| `estimatedDeductionLand` | 개산공제(토지) |
| `estimatedDeductionBuilding` | 개산공제(건물) |
| `gainLand` | 토지 양도차익 (장특 전) |
| `gainBuilding` | 건물 양도차익 (장특 전, 차손 시 음수) |
| `lthdLand` | 토지 장특공제액 |
| `lthdBuilding` | 건물 장특공제액 (차손 시 0) |
| `incomeLandPreOffset` | 토지 양도소득금액 (통산 전) |
| `incomeBuildingPreOffset` | 건물 양도소득금액 (통산 전, 음수 가능) |
| `offsetAmount` | §102② 1차 통산 흡수액 |
| `incomeLandPostOffset` | 토지 양도소득금액 (통산 후) |
| `incomeBuildingPostOffset` | 건물 양도소득금액 (통산 후, 0) |
| `totalIncome` | 통산 후 합계 양도소득금액 |
| `holdingYearsFloor` | 보유기간 (1년 미만 절사) |
| `lthdRate` | 장특공제율 (소수, 예: 0.30) |
| `buildingFootprintArea` | 바닥면적 (연면적 ÷ 층수, NBL 판정용) |

---

## 14. UI 입력 경로 케이스 매트릭스 (★★★ 정책 준수)

Policy: `feedback_ui_input_path_enumeration.md` — 신규 모드/취득원인 추가 시 모든 분기 enumerate.

| # | propertyType | 환산토글 | 일괄/각각 | 자산 수 | UI 분기 | 본 작업 | 비고 |
|---|---|---|---|---|---|---|---|
| G-01 | general_building | ON | 일괄(토지+건물) | 2(자동 분리) | GeneralBuildingBlock 노출, gbValuation 생성 | ★ 이번 구현 | anchor 17종 |
| G-02 | general_building | OFF | 일괄 | 2(자동 분리) | 실가 입력 경로 (기존 building 경로 준용) | 후속 PDCA | 취득가액 직접 |
| G-03 | general_building | — | 각각 별도 양도 | 1(토지 or 건물) | 단독 자산, 안분 불필요 | 후속 PDCA | 별도 산식 |

**본 작업 구현 범위**: G-01만. G-02·G-03은 후속 PDCA로 분리.

---

## 15. 브라우저 수동 테스트 시나리오

### 15.1 사례 31 입력 시나리오 (합계 양도소득금액 456,343,181 확인)

```
① npm run dev → http://localhost:3000/calc/transfer-tax
② Step 1 → "자산 추가"
③ 자산종류: "일반건물(토지+건물 일괄)" 선택
④ 취득원인: "매매"
⑤ 양도가액: 925,000,000
⑥ 양도일: 2023-02-19 (DateInput)
⑦ "환산취득가 사용" ToggleCard → ON
⑧ [GeneralBuildingBlock 노출 확인]
⑨ 토지면적: 85 / 건물 연면적: 180.96 / 층수: 2
⑩ 양도시 공시지가: 10,830,000 (LandPriceLookupField, 2022년)
⑪ 양도시 건물기준시가: 20,629,440
⑫ 취득시 공시지가: 2,800,000 (LandPriceLookupField, 1998년)
⑬ 취득시 건물기준시가: 28,144,700
⑭ 취득일: 1999-05-24 (DateInput)
⑮ "다음" → Step 2 → 특이사항 없음 → Step 3 → 감면 없음
⑯ "계산하기"
```

### 15.2 결과 확인 항목

| 확인 항목 | 기대값 |
|---|---|
| 토지 안분 양도가액 | 904,725,192 |
| 건물 안분 양도가액 | 20,274,808 |
| 토지 환산취득가 | 233,908,636 |
| 건물 환산취득가 | 27,660,876 |
| 토지 개산공제 | 7,140,000 |
| 건물 개산공제 | 844,341 |
| 토지 양도차익 | 663,676,556 |
| 건물 양도차익 | −8,230,409 (차손) |
| 토지 장특공제 | 199,102,966 |
| 건물 장특공제 | 0 |
| 통산 흡수액 | 8,230,409 |
| **합계 양도소득금액** | **456,343,181** |
| 과세표준 (− 기본공제 250만) | 453,843,181 |
| **산출세액 (2023년 §55 누진세율표)** | **155,597,272** |
| **지방소득세 (§103조의3 누진세율표)** | **15,559,727** |

> 산출세액 산식 (2023년 §55 세율표 직접 계산, 외부 자료 추종 금지):
> `94,060,000 + (453,843,181 − 300,000,000) × 0.40 = 155,597,272`
> (300,000,000 구간 누계세액 94,060,000 + 잔여액 153,843,173 × 40%, 원 미만 절사)
>
> 지방소득세: §103조의3 누진세율표 직접 적용 (단순 "산출세액 × 10%" 가정 금지)

### 15.3 Network 탭 확인

브라우저 개발자도구 → Network → `calc/transfer` → Request Body:

```json
{
  "propertyType": "general_building",
  "generalBuildingValuation": {
    "transferLandPricePerSqm": 10830000,
    "transferBuildingValue": 20623824,
    "acquisitionLandPricePerSqm": 2800000,
    "acquisitionBuildingValue": 28144700,
    "landArea": 85,
    "buildingArea": 180.96,
    "buildingFloors": 2,
    "estimatedDeductionRate": 0.03
  }
}
```

> `generalBuildingValuation` 키 누락 시 ⑬ body spread 미적용. `lib/calc/transfer-tax-api.ts` grep 즉시 점검.

---

## 16. 사전 확인 정책 (작업 시작 전 9개 패턴 점검)

| # | 패턴 | 해당 여부 | 처리 방식 |
|---|---|---|---|
| 1 | 엔진 input 필드 → AssetForm 미반영 | 해당 | gb* 8개 필드 메인 §3 |
| 2 | API 변환 미갱신 | 해당 | generalBuildingValuation 서브객체 메인 §6 |
| 3 | initial value 누락 | 해당 | 메인 §4 |
| 4 | normalize 누락 | 해당 | 메인 §5 |
| 5 | 결과 노출 누락 | 해당 | §11 결과 카드 + §13.3 echo 요청 |
| 6 | 산식 숫자 매핑 모호 | 해당 | §11.2~11.3 산식 표기 규칙 |
| 7 | 활성화 조건 누락 | 해당 | assetKind === "general_building" 조건부 렌더 |
| 8 | 토글 가시성 미준수 | 해당 | ToggleCard(amber) + OFF 배경 유지 |
| 9 | 시점별 분기 누락 | 해당 (양도시/취득시 2시점) | emerald/amber 분리 섹션 |

3대 핵심 정책 점검:

- [x] **useEffect → store 미러링 금지**: gb* 필드는 onChange 직접 처리. 파생값(면적 × 단가)은 useMemo 또는 결과 카드에서만.
- [x] **자동 안분 fallback 금지**: 기준시가 미입력 시 validate가 오류로 차단. 0 분모 자동 계산 없음.
- [x] **Validation 8번째 동기화**: `buildGeneralBuildingValuation()` undefined 반환 조건과 `validateStep()` 차단 조건 일치.

---

## 17. Definition of Done (Do 단계 종료 전 체크리스트)

- [ ] 케이스 매트릭스 G-01 enumerate 완료. G-02·G-03은 후속 명기.
- [ ] anchor 17종 통과 (특히 통산 순서 4종: ltsd_building=0 / income_building_pre_offset=−8,230,409 / offset_amount=8,230,409 / income_land_post_offset=456,343,181)
- [ ] 14개 동기화 지점 모두 (특히 ⑫⑬⑭ grep 자가 점검 §12 명령어 실행)
- [ ] `npx tsc --noEmit` 0건
- [ ] `npx vitest run __tests__/tax-engine/transfer/` 612+ + 신규 anchor 통과
- [ ] 브라우저 수동: 폼 → 계산 → 결과 합계 **456,343,181** 확인
- [ ] Network 탭: `generalBuildingValuation` body 포함 확인
- [ ] 결과 화면: 건물 차손 −8,230,409 / 장특 0 / §102② 통산 표 표시
- [ ] OFF 상태 ToggleCard bg-violet-50/70 배경 유지 (tone="violet" 적용)
- [ ] placeholder 숫자 예시 없음 (FieldCard hint prop 대체)
- [ ] 사례 27·28·29 회귀 anchor 보존 (612 회귀 테스트)
- [ ] `양도연도 2023 §55 정확 누진세율표` 직접 적용 (외부 PDF 산출값 anchor 금지)
- [ ] 양도코리아 PDF 분모/분자 1:1 재현 검증: 합계 기준시가 = 920,550,000 + 20,629,440 = **941,179,440** (잘못된 anchor 940,173,824 박제 방지)
- [ ] 양도시 건물 기준시가 BigInt 역산 일치: 920,550,000 + B = 941,179,440 → B = **20,629,440** (엔진 산출값과 UI 표시값 일치)
- [ ] 산출세액·지방소득세 anchor 통과: **155,597,272** / **15,559,727** (§15.2 수동 확인)
