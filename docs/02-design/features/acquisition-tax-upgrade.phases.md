# 취득세 업그레이드 — Phase 상세 작업 (Phased Detail)

**상위 문서**: [`acquisition-tax-upgrade.design.md`](./acquisition-tax-upgrade.design.md) · 검토 이력: [`acquisition-tax-upgrade.review-history.md`](./acquisition-tax-upgrade.review-history.md)
**작성일**: 2026-04-30 (v5 — UI 시니어 협동 패턴 적용)
**문서 분할 사유**: 800줄 정책 준수.

## v5 작업 패턴 — 엔진·UI 시니어 협동

각 Phase 작업은 다음 라벨링과 7개 동기화 지점 강제:

- **[엔진]**: `acquisition-tax-senior` 등 엔진 시니어 — 타입 명세·순수 함수·회귀 테스트
- **[UI]**: `acquisition-tax-ui-senior` — 7개 동기화 지점 책임
- **[QA]**: `ui-engine-sync-checker` 호출 + `acquisition-tax-qa` 회귀

### Phase 완료 기준 — 7개 동기화 지점 체크리스트 (강제)

각 Phase에서 신규 입력 필드 추가 시 다음 모두 동기화 필수:

- [ ] ① **FormState** — `components/calc/acquisition/shared.ts` 또는 신규 store
- [ ] ② **INITIAL_FORM** — default value 명시
- [ ] ③ **normalize fallback** — sessionStorage 마이그레이션 호환 (해당 시)
- [ ] ④ **API 변환** — `lib/calc/acquisition-tax-api.ts` (v5 신설)
- [ ] ⑤ **UI 위젯** — 마법사 단계에 입력 위젯 배치 (tone·활성화 조건)
- [ ] ⑥ **사이드바** — `AcquisitionSidebar` (해당 시, v5 신설 옵션)
- [ ] ⑦ **결과 카드** — `AcquisitionTaxResultView` 또는 상세 카드 표시

---

## UI 명세 인덱스 (acquisition-tax-ui-senior 참조용)

`acquisition-tax-ui-senior` 에이전트가 Plan·Design 단계에 사전 명세해야 하는 7개 동기화 지점이 본 계획서 어디에 작성되어 있는지의 빠른 참조 표. 별도 `ui.design.md`를 분리하지 않고 본 4개 문서에 분산 명세된 형태.

| 7지점 | 명세 위치 (파일·섹션) |
|---|---|
| ① **FormState 변경분** (필드명·타입·optional·default) | 본 문서 §1 Phase 5-UI **§P5UI-1** + [`input-fields.md`](./acquisition-tax-upgrade.input-fields.md) (TypeScript 타입 정의 60+개 전체) |
| ② **INITIAL value** (`INITIAL_FORM` 변경분) | 본 문서 §1 Phase 5-UI **§P5UI-1** |
| ③ **normalize fallback** (sessionStorage 마이그레이션) | 본 문서 §1 Phase 5-UI **§P5UI-3** (`normalize.ts` 신설) |
| ④ **API 변환 매핑** | 본 문서 §1 Phase 5-UI **§P5UI-2** (`lib/calc/acquisition-tax-api.ts` 신설) |
| ⑤ **UI 위젯 상세** (단계·카드·tone·활성화 조건·hint) | 각 Phase 작업의 `[UI]` 라벨 항목 + 본 문서 §1 Phase 5-UI **§P5UI-4·P5UI-8** |
| ⑥ **사이드바·요약 영향** | 본 문서 §1 Phase 5-UI **§P5UI-7** (`AcquisitionSidebar`·`computeAcquisitionSummary`) |
| ⑦ **결과 카드 산식 표기** (특히 6~9억 선형보간·부가세 합산) | 본 문서 §1 Phase 5-UI **§P5UI-5·P5UI-6** + [`design.md`](./acquisition-tax-upgrade.design.md) §6 검증 시나리오 anchor |
| **시나리오·테스트 케이스** | [`design.md`](./acquisition-tax-upgrade.design.md) §6 — anchor 53개 |
| **검토 이력** (v3·v4·v5 발견 11+13+UI 누락 60개) | [`review-history.md`](./acquisition-tax-upgrade.review-history.md) |

### 마법사 6단계별 UI tone 규칙 (참조)

| Step | 영역 | tone | 주요 위젯 |
|---|---|---|---|
| 0 | 취득 정보 | violet (취득 원인) / sky (물건 종류) | RadioCardGroup |
| 1 | 물건 상세 | sky (면적·시가표준액) | LandPriceLookupField·CurrencyInput |
| 2 | 주택 현황 | (보유 주택 카드) + violet (세대 별도) | 카드 배열·ToggleCard |
| 3 | 지역·중과 분기 | rose (조정대상지역·1억/2억 한도·일시적 2주택) | ToggleCard |
| 4 | 법인·특수 분기 | rose (사치성·법인 중과) / violet (세율특례) | ToggleCard·RadioCardGroup |
| 5 | 감면·무상취득 | violet (생애최초·자경농지·무상취득 단서) | ToggleCard |

### UI 시니어 작업 워크플로 (acquisition-tax-ui-senior.md §6 준수)

```
1. 엔진 시니어로부터 변경 명세 수령
2. 시나리오 설계 (주택·토지·건축물 + 매매·증여·상속·신축 조합)
3. FormState 타입 확장 + INITIAL_FORM 갱신
4. API 변환 갱신 (lib/calc/acquisition-tax-api.ts)
5. UI 위젯 작성 (Step0~Step5)
6. 결과 카드 산식·표시
7. npx tsc --noEmit + 회귀 테스트
8. ui-engine-sync-checker 호출 — 누락 0건 도달
9. 브라우저 수동 확인 (4 시나리오: 주택매매·증여·법인·신축)
10. Definition of Done 점검 후 보고
```

---

## 1. 업그레이드 계획 (Phased)

### Phase 1 — 중과세율 정확성 (Critical, 최우선)
**목표**: 사치성·다주택·법인 중과 세율 100% 정확 + 입력 일관성 검증.
**일정**: **5~6일** (v3 법령 정밀 대조 11건 추가 반영 — 시가표준액 1억/2억 이중 기준, 일시적 2주택 시점별 변천, §13⑦, §13의2④ 지정 전 계약, 무상취득 단서 정밀화)

**작업**:

0. **[엔진 P1-0]** 입력 일관성 검증 헬퍼 `validateInputConsistency(input)` (Phase 0에서 통합)
   - 비논리 조합 차단:
     - `acquiredBy === "corporation"` + `giftRelation === "spouse_or_lineal"` → 에러
     - `acquiredBy === "corporation"` + `isFirstHome === true` → 에러
     - `acquisitionCause === "burdened_gift"` + `encumbrance === 0` → 에러
     - `isLuxuryProperty === true` + 별장 이후 잔금일(`acquisitionDate >= "2023-03-14"`) + 별장 유형 → 별장 중과 폐지 안내
   - Zod refine으로 API 레벨에서도 검증

1. **[엔진 P1-1]** 사치성 재산 중과세율 분기 수정 (`getSurchargeRateForLuxury` 폐지 → `calcLuxurySurchargeRate(basicRate, multiHouseContext, corpMetroContext)` 신규)
   ```ts
   // 단독 사치성 (지법 §13⑤): 표준세율 + 중과기준세율 × 400% (= 8%p)
   if (!multiHouse && !corpMetro) return basicRate + 0.08;

   // 사치성 + 다주택 중복 (지법 §13의2③): 1항 또는 2항 세율 + 8%p
   if (multiHouseRate) return multiHouseRate + 0.08;
   // 예: 조정 2주택 8% + 사치성 8%p = 16%
   //     조정 3주택 12% + 사치성 8%p = 20%

   // ※ v3 신규: 사치성 + 대도시 법인 중복 (지법 §13⑦) — 별도 산식
   // 주택 외: 표준세율 × 300% + 중과기준세율 × 200% = 4% × 3 + 4%p = 16%
   // 주택(§11①8): 해당 세율 + 중과기준세율 × 600% (= 12%p)
   if (corpMetroContext) {
     if (propertyType === "housing") return basicRate + 0.12;  // 9억 초과 3% → 15%
     else return basicRate * 3 + 0.04;  // 토지·건물 4% → 16%
   }
   ```
   - **별장 폐지 분기 (v4 D1 명시)**: `acquisitionDate < "2023-03-14"`만 중과 — **§13⑤ 사치성 한정**. §13의2 다주택 중과와는 **무관** (별장은 주택 아님 → 다주택 카운트에 포함 안 됨)
   - 코드 주석에 "별장 폐지는 사치성 분기에만 영향 — 다주택 중과 분기에서는 별장 입력 자체가 의미 없음" 명시

2. **[엔진 P1-2]** 다주택 중과 — **§13의2① 각 호 결과 매핑 + 산식 분해 주석** (v4 가독성 보강)
   ```ts
   // 지방세법 §13의2① — 산식 구조 (법령 원문):
   //   "§11①7나의 세율(=4%)을 표준세율로 하여 + 중과기준세율 × N% 합한 세율"
   // 결과를 직접 매핑 (가독성 + 디버깅 용이성, v4 외부 검토 반영)
   const SURCHARGE_RATES = {
     CORP: 0.12,           // 1호 (법인): 4% + 중과기준세율 × 400%(=8%p) = 12%
     MULTI_HOUSE_8: 0.08,  // 2호 (조정 2주택 OR 비조정 3주택): 4% + ×200%(=4%p) = 8%
     MULTI_HOUSE_12: 0.12, // 3호 (조정 3주택+ OR 비조정 4주택+): 4% + ×400%(=8%p) = 12%
   } as const;

   // [v4 D2] 법인 주택 12% — 주택 수 카운트 skip 최적화
   if (acquiredBy === "corporation") {
     return SURCHARGE_RATES.CORP;  // 12% 즉시 리턴, houseCount 평가 불필요
   }

   // 2호: 조정 2주택 OR 비조정 3주택
   if ((isRegulatedArea && houseCount === 2) || (!isRegulatedArea && houseCount === 3)) {
     return SURCHARGE_RATES.MULTI_HOUSE_8;  // 8%
   }

   // 3호: 조정 3주택+ OR 비조정 4주택+
   if ((isRegulatedArea && houseCount >= 3) || (!isRegulatedArea && houseCount >= 4)) {
     return SURCHARGE_RATES.MULTI_HOUSE_12;  // 12%
   }

   // 다주택 미해당 → §11①8 가격별 주택세율 (1~3% 또는 6~9억 선형보간)
   return getStandardHousingRate(input);
   ```
   - **v4 외부 재검토 반박 메모**: 외부 검토자가 "§13의2는 1천분의 120/80 직접 규정"이라 주장했으나, 법령 원문은 명백히 "§11①7나 표준세율(4%) + 중과기준세율 가산" 구조. 우리 v3 산식 정확. 다만 코드 가독성 측면에서 결과 직접 매핑 + 산식 주석 병기로 보강.
   - **[v4 D8] 사회기반시설업 등 §13②단서 중과제외업종은 §13의2에 적용 X**: §13의2① 1호 단서는 시행령 §28의2 8호 나목 5종(주택건설사업자·주택조합·민간임대·공공주택건설·도시정비사업자)만 적용. 사회기반시설·은행업·해외건설 등은 §13② 대도시 법인 중과 단서 한정.

3. **[엔진 P1-3]** 무상취득 중과 — 3분기 흐름 (v4 M3 명시)
   ```ts
   // 지방세법 §13의2② — 산식 (법령 원문):
   //   "§11①2(증여 3.5%/2.8%)에도 불구하고 §11①7나 표준세율(4%) + 중과기준세율 × 400%(=8%p) = 12%"
   // 단서 배제 시 §11①2 표준세율로 복귀 (3.5% 일반 / 2.8% 비영리)
   const GIFT_SURCHARGE_RATE = 0.12;  // 4% + 8%p

   if (cause !== "gift") return basicRate;  // 무상취득 외 분기 종료

   const wholeStdValue = input.wholeHouseStandardValue ?? input.standardValue ?? 0;

   // [분기 1] 시가표준액 3억 미만 → 일반 증여 표준세율 (3.5% 또는 2.8%)
   if (wholeStdValue < 300_000_000) {
     return basicRate;  // §11①2 표준세율 그대로
   }

   // [분기 2] 비조정지역 → 중과 적용 안 됨 (§13의2② 본문 "조정대상지역" 한정)
   if (!isRegulatedArea) {
     return basicRate;  // 일반 증여 표준세율
   }

   // [분기 3] 조정지역 + 3억 이상 → 단서 배제 검토
   // 시행령 §28의6② 1호: 1세대 1주택자가 소유한 주택을 가족이 무상취득
   if (input.giftorIs1HHHolder && isFamilyRelation(input.giftorRelation)) {
     return basicRate;  // 단서 배제 → 일반 증여 표준세율 (3.5%)
   }
   // 시행령 §28의6② 2호: §15①6 재산분할 세율특례 적용
   if (input.specialRateType === "divorce_division") {
     return basicRate;  // 단서 배제
   }

   // [분기 4] 조정지역 + 3억 이상 + 단서 미배제 → 12% 중과
   return GIFT_SURCHARGE_RATE;
   ```

   **[v4 M4] `giftorRelation` enum 정밀화 — 수증자 관점에서 본 증여자의 신분**:
   - 시행령 §28의6② 1호 구조: 증여자가 1세대 1주택자 → 그 1세대 내의 가족(배우자/직계존속/직계비속)이 무상취득 시 단서 적용
   - **수증자 입장에서 본 증여자의 관계** enum:
     ```ts
     giftorRelation?:
       | "spouse"                   // 가목: 증여자가 수증자의 배우자
       | "lineal_ascendant"         // 나목 1: 증여자가 수증자의 직계존속 (부모·조부모)
       | "lineal_ascendant_spouse"  // 나목 2: 증여자가 수증자의 직계존속의 배우자 (계부·계모)
       | "lineal_descendant"        // 다목 1: 증여자가 수증자의 직계비속 (자녀·손자녀)
       | "lineal_descendant_step"   // 다목 2: 증여자가 수증자의 의붓자녀 (혼인 중 배우자의 직계비속)
       | "other";                   // 단서 배제 안 됨
     ```
   - 사실혼은 모든 케이스에서 제외
   - `giftorIs1HHHolder: boolean` — 증여자가 무상취득 직전 시점에 1세대 1주택자인지 (필수 검증)

4. **[엔진 P1-4]** 시가표준액 중과 배제 — **수도권/비수도권 1억/2억 이중 기준** + 전체 주택 기준 (v3)
   - `assessSurcharge` 진입부에 `isExemptFromSurcharge_LowValue(wholeStdValue, isMetropolitanRegion, isUrbanRegenerationArea)` 호출
   ```ts
   function isExemptFromSurcharge_LowValue(
     wholeStdValue: number,
     isMetropolitanRegion: boolean,
     isUrbanRegenerationArea: boolean
   ): boolean {
     if (isUrbanRegenerationArea) return false;  // 정비구역은 배제 불가
     const limit = isMetropolitanRegion ? 100_000_000 : 200_000_000;  // 수도권 1억 / 그 외 2억
     return wholeStdValue <= limit;
   }
   ```
   - 신규 입력 필드:
     - `wholeHouseStandardValue?: number` — 전체 주택 시가표준액 (지분/부속토지 시 필수)
     - `isMetropolitanRegion?: boolean` — 수도권 여부 (1억/2억 한도 결정)
     - `isUrbanRegenerationArea?: boolean` — 정비구역(재개발·재건축·소규모정비) 소재

5. **[엔진 P1-5]** 일시적 2주택 — **현행 3년 단일 + 시점별 적용** (v3 정정)
   - 신규 입력 필드: `isTemporaryTwoHouse`, `previousHouseAcquisitionDate`, `previousHouseRegion: "regulated" | "non_regulated"`, `newHouseRegion: "regulated" | "non_regulated"`
   - **잔금일 시점별 처분기한** (지방세법 시행령 §28의5① 변천):
     ```ts
     function getDisposalDeadline(balanceDate: Date, prevReg: Region, newReg: Region): number {
       const isAllRegulated = prevReg === "regulated" && newReg === "regulated";

       // 2023.2.28 ~ 현행: 모든 경우 3년 단일
       if (balanceDate >= new Date("2023-02-28")) return 3;

       // 2022.5.10 ~ 2023.2.27: 조정+조정 2년, 그 외 3년
       if (balanceDate >= new Date("2022-05-10")) return isAllRegulated ? 2 : 3;

       // ~ 2022.5.9: 조정+조정 1년, 그 외 3년
       return isAllRegulated ? 1 : 3;
     }
     ```
   - `houseCountAfter === 2 && isTemporaryTwoHouse` → 중과 배제 + 처분기한 D-day 안내

6. **[엔진 P1-6]** 부담부증여 — 배우자·직계존비속 적용 배제
   - 신규 입력: `giftRelation: "spouse_or_lineal" | "other"`
   - `spouse_or_lineal` + `burdened_gift` → 전체 무상 처리 (지법 §7④, "증여로 본다")
   - `acquisition-tax-base.ts:289` 부담부증여 분기 진입부에서 조기 리턴

6의2. **[엔진 P1-6.5]** 조정대상지역 지정 전 매매계약 보호 (v3 신규 — §13의2④)
   - 신규 입력 필드:
     - `contractDateBeforeRegulation: boolean` — 계약일이 조정지역 지정고시일 이전
     - `regulationDesignationDate: string` — 조정지역 지정고시일 (YYYY-MM-DD)
     - `hasContractDepositProof: boolean` — 계약금 지급 증빙 여부
   - `assessSurcharge` 진입부에서: 조건 만족 시 `isRegulatedArea = false` 강제 적용
   - 지정 전 계약은 비조정지역 취득 간주 → 다주택 중과 분기 결과 변경

7. **[엔진 P1-7]** 모듈 분할 (800줄 정책 + 가독성)
   ```
   acquisition-surcharge/
   ├── index.ts          # assessSurcharge orchestrator
   ├── luxury.ts         # 사치성 (G1 분기 + 별장 폐지 시점)
   ├── multi-house.ts    # 다주택 (조정/비조정 × 1~4주택+ × 일시적 2주택)
   ├── corp-house.ts     # 법인 주택 12% (P2 확장 대비)
   └── exclusion.ts      # 1억 이하 + 정비구역 + 신탁
   ```

8. **[테스트 P1-T]** PDF 예시값 anchor 테스트 (v4 확장):
   - 사치성 4 + 다주택 6 + 1억/2억 이중 4 + 일시적 2주택 시점별 3 + 부담부증여 2 (**v4 M5: #14는 비조정 OR 시가표준액 3억 미만 전제 명시**) + 별장 1 (§13⑤ 한정) + 무상 단서 3 + §13⑦ 사치성+법인 2 + §13의2④ 지정 전 계약 1 + **v4 무상취득 3분기 흐름 anchor 3** (3억 미만 / 비조정 / 단서 배제) = **29개 anchor**

9. **[운영 P1-9]** 이력 마이그레이션 스크립트
   - `calculations` 테이블에 `engine_version` 컬럼 추가
   - G1 수정 전 산출 결과 보존 (legacy 마크) + 재계산 비교 페이지 제공

**완료 기준**:
- `npm test -- acquisition-tax-surcharge` 100% 통과 (26 anchor)
- 사치성 9억 초과 주택 매매 → **11%** (이전: 15%)
- 사치성 + 조정 3주택 → **20%** (이전: 15%)
- 사치성 + 대도시 법인 토지 4억 → **16%** (v3 §13⑦)
- 사치성 + 대도시 법인 9억 초과 주택 → **15%** (v3 §13⑦ 단서)
- 비조정지역 3주택 → **8%** (이전: 1~3%)
- 조정지역 전체 시가표준액 4억 증여 → **12%** (이전: 3.5%)
- 부담부증여(배우자) → 전체 무상 3.5% (이전: 유상 분리)
- **비수도권 시가표준액 1.5억 주택 → 중과 배제** (v3, 이전: 12%)
- **2023.2.28 이후 잔금 일시적 2주택 (조정+조정) → 처분기한 3년** (v3, 이전: 2년 매트릭스)
- **조정지역 지정고시 전 매매계약 + 계약금 증빙 → 비조정지역 취득 간주** (v3 §13의2④)
- **1세대 1주택자가 의붓자녀에게 증여 → 단서 배제, 3.5%** (v3 §28의6② 다목)

---

### Phase 2 — 세율특례 §15 + 법인·공장 중과 §13① (High)
**목표**: 9종 세율특례 + 법인 본점·대도시·공장 중과 분기.
**일정**: 3~4일

**작업**:
1. **[엔진 P2-1]** `acquisition-tax-rate-special.ts` 신규 — `applySpecialRate(basicRate, specialType, surchargeContext)` 순수 함수
   - 9종 enum: `redemption | inheritance_one_house | corp_merger | co_ownership_split | building_relocation | divorce_division | hoyu_division | timber | leasing`
   - **중과 분기** (지법 §15①단서):
     ```ts
     // §15 단독 적용
     if (!surchargeContext.isCorpMetro) return Math.max(0, basicRate - 0.02);

     // §15 + §13② (대도시 법인 중과) 동시 적용
     // 표준세율 - 중과기준세율(2%)을 뺀 세율의 100분의 300
     return Math.max(0, basicRate - 0.02) * 3;
     // 예: 대도시 법인 합병 토지 4% → (4%-2%)×3 = 6%
     ```
   - **§13① 본점·공장 중과**: §15 적용 배제 (별도 중과세율 직접 적용 — 페이지 28 본문)
   - **상속 1가구1주택 + §13② 중복 케이스**: `(2.8%-2%)×3 = 2.4%` (페이지 21 인용 1,000분의 24)
2. **[엔진 P2-2]** 법인 중과 모듈 `acquisition-corp-surcharge.ts` 신규
   - 입력: `isMetropolitanCongestion`(과밀억제권역), `corpAge`(설립 연수), `isHeadquarterUse`, `isFactoryNewExpand`, `excludedBusinessType`(중과제외업종 enum)
   - 분기: 본점 신증축 → 표준 + 4%p / 대도시 5년 이내 → 표준 × 3 - 4%p / 본점+대도시 → 표준 × 3 / 사치성+대도시 → 표준 × 3 + 8%p
   - **비도시형 공장 토지·건물 분리** (G22): 토지 매매 4% + 4%p = 8%, 건물 원시취득 2.8% + 4%p = 6.8% — 입력 분리
   - 중과제외업종: 사회기반시설·은행업·해외건설·주택건설(주택법§4)·전기통신·첨단기술·유통산업·운송사업·국가출자20%+ — 9종
3. **[엔진 P2-3]** 휴면법인 판정 헬퍼 `assessDormantCorp`
   - 6유형: 해산·해산간주·폐업·재사업자등록(1년)·계속등기(1년)·임원50%교체
   - 과점주주 도달 시점이 "법인 설립 시점"으로 간주 → 5년 기산
4. **[UI P2-4]** 새 Step "법인·공장 중과 확인" (조건부) — `acquiredBy === "corporation"` 시 표시
   - ToggleCard: 과밀억제권역, 본점/주사무소, 비도시형 공장, 대도시 5년 이내, 사회기반시설·해외건설 등
5. **[엔진 P2-5]** 자경농지 50% 감면 (지특법 §6)
   - 새 입력: `isSelfCultivatedFarmer`, `farmingYears`, `farmlandArea`, `farmlandLocationDistance`(km)
   - 판정: 2년 이상 영농 + 거주 기준 + 면적 한도 → 50% 감면

**완료 기준**:
- 상속 1가구1주택 → 0.8% (현재 2.8%)
- 협의분할(공유물 분할) → 0% (현재 4%)
- 이혼 재산분할 → `basicRate - 2%`
- 대도시 5년 이내 법인 본점 신축 → 8.4% (2.8 × 3)
- 자경농지 매매 → 1.5% (3% × 50%)
- 비도시형 공장 건물 신축 → 6.8% / 토지 매매 → 8% (분리)

---

### Phase 3 — 주택 수 산정 정교화 (Medium)
**목표**: 입주권·분양권·오피스텔·주택 수 제외 항목 정확 반영 + 한시 특례 6종 + 공유지분·공동상속·권리취득일.
**일정**: **5~6일** (v4 외부 재검토 — 6차원 매트릭스 [시점·지분·상속·권리·세대·한시] 반영)

**작업**:
1. **[엔진 P3-1]** `house-count-calculator.ts` 신규 — `HouseCountInput { houses: HouseAsset[]; rights: RightAsset[]; offices: OfficeAsset[]; pendingAcquisition: HouseAsset; ... }` → `effectiveCount`
   - **시행령 §28의4⑥ 9호 + §28의2 18+α종 정밀 매핑**:
     1. 시가표준액 한도 충족 (수도권 1억 / 비수도권 2억) — §28의2 1호
     2. 노인복지주택·임대사업자 공공지원·가정어린이집·사원임대용·인구감소지역임대 (직접 사용)
     3. 문화유산·천연기념물
     4. 멸실 목적 + 미분양 시공자 취득 (3년 한정)
     5. 농어촌 주택 (대지 660㎡·연면적 150㎡·6,500만 이내, 일정 지역 외)
     6. 미분양 아파트 (수도권 외 85㎡·6억 이하)
     7. 상속 5년 미경과 주택·입주권·분양권·오피스텔
     8. **시가표준액 1억 이하 오피스텔** (v3)
     9. **시가표준액 1억 이하 부속토지만 소유** (v3)
     10. **혼인 전 분양권 → 다른 배우자 혼인 전 보유 주택** (v3, 2026.12.31까지)
     11. **2024.1.10~2027.12.31 신축 60㎡·3억(수도권 6억) 이하** (v3 한시)

2. **[엔진 P3-1.5]** **취득 주택 자체가 한시 특례 대상이면 카운트 제외** (v3, 시행령 §28의4②)
   - 2024.1.10~2027.12.31 신축 + 60㎡·3억(수도권 6억) 이하 다가구·연립·다세대·도시형생활주택
   - 2024.1.10~2027.12.31 유상승계 + 임대사업자 등록 + 60㎡·3억(6억) 이하
   - 2024.1.10~2025.12.31 미분양 아파트 (수도권 외 85㎡·6억 이하)
   - **다가구 60㎡ 판정**: 건축물대장에 호수별 전용면적 구분 기재된 경우만 적용

3. **[UI P3-2]** Step "주택 현황" 재설계
   - "보유 주택 추가" → 카드별 입력 (시가표준액, 종류, 매입일, 소재지, 한시 특례 해당 여부)
   - "보유 입주권/분양권/오피스텔" 별도 섹션
   - 자동 카운트 표시: "산정 주택 수: 5채 (제외 3채 → 실효 2채)"
   - **취득일 기준 anchor**: "이 날짜(취득일) 기준 보유 주택만 카운트하세요" 안내 필수

4. **[엔진 P3-3]** 일시적 2주택 자동 판정 강화 (v3 시점별 분기)
   - 잔금일 시점에 따른 처분기한 자동 산출 — P1-5에서 통합
   - 종전 처분일 입력 시 D-day 카운트다운

5. **[UI P3-4]** "주택 수 검산기" 도움말 모달
   - **시행령 §28의2 18+α 종 전체 중과제외 표** (v3 신규):
     | # | 유형 | 조건 |
     |---|---|---|
     | 1 | 시가표준액 1억/2억 이하 | 수도권 1억 / 비수도권 2억 (정비구역 제외) |
     | 2~2의3 | 공공주택사업자 매입임대·분양 | 환매 포함 |
     | 3 | 노인복지주택 | 1년 내 직접 사용 |
     | 3의2 | 도시재생사업 현물보상 | — |
     | 4 | 문화유산·천연기념물 | — |
     | 5 | 공공지원민간임대주택 | 임대사업자 등록 |
     | 6 | 가정어린이집 | 1년 내 직접 사용 |
     | 7 | 부동산투자회사 매입 | 매도자 1주택 + 5억 이하 |
     | 8 | 멸실 목적 주택 | 3년 내 멸실, 7년 내 신축 |
     | 9 | 미분양 시공자 취득 | 3년 한정 |
     | 10 | 채권변제 취득 | 3년 내 처분 |
     | 11 | 농어촌 주택 | 660㎡·150㎡·6,500만 |
     | 12 | 사원 임대용 60㎡ | 공동주택, 1년 내 직접 사용 |
     | 13~13의3 | 분할/합병 | 적격분할 |
     | 14 | 리모델링조합 | — |
     | 15 | 토지임대부 분양주택 | — |
     | 16 | 기업구조조정 부동산투자회사 | 수도권 외 미분양 아파트 |
     | 17 | 미분양 아파트 한시 | 2026년, 수도권 외 85㎡·6억 |
     | 18 | 인구감소지역 임대주택 | 2026년, 60일 내 등록 |

6. **[엔진 P3-5]** 신탁재산 위탁자 카운트 가산 (지법 §13의3 1호)
   - 새 입력: `trustedHouseCount: number` (수탁자 명의의 위탁 주택)

7. **[엔진 P3-6]** **세대 별도 인정 4종** (v3, 시행령 §28의3②) + **미성년 예외 강조 (v4 D7)**
   ```ts
   function isSeparateHousehold(input: HouseholdInput): boolean {
     // 1. 30세 미만 자녀 + 12개월 소득 ≥ 기준중위소득 40% + 독립 생계 (미성년 제외)
     if (input.under30Income >= input.medianIncome * 0.4 && !input.isMinor) return true;
     // 2. 65세 이상 직계존속 동거봉양 합가
     if (input.over65Cohabitation) return true;
     // 3. 90일 이상 출국
     if (input.overseasMoreThan90Days) return true;
     // 4. 60일 이내 분리 (취득 후 주소 이전)
     if (input.relocateWithin60Days) return true;
     return false;
   }
   ```

8. **[엔진 P3-7] 공유지분 1주택 카운트 (v4 D3, 시행령 §28의4④)**
   ```ts
   // 1세대 내 공유: 1개 주택으로 카운트
   // 1세대 외부와 공유: 각자 1주택씩 카운트
   function countOwnership(asset: HouseAsset, currentHousehold: Household): number {
     if (asset.ownershipShare === undefined) return 1;  // 단독
     // 공동소유자 모두 동일 1세대 → 1주택
     if (asset.coOwnersAllInHousehold) return 1;
     // 외부와 공유 → 본인 1주택 (지분율 무관)
     return 1;
   }
   ```
   - 신규 입력 필드: `ownedHouses[].ownershipShare?: number` (지분율, 0~1), `ownedHouses[].coOwnersAllInHousehold?: boolean`

9. **[엔진 P3-8] 공동상속 — 주된 상속자만 카운트 + 5년 미경과 제외 (v4 D4, 시행령 §28의4⑤·⑥3호)**
   ```ts
   // 시행령 §28의4⑤: 상속 공동소유 → 지분 큰 상속인이 소유자
   //   동순위 시: 거주자 → 최연장자 순
   // 시행령 §28의4⑥3호: 상속개시일부터 5년 미경과 → 주택 수에서 제외
   function isMainInheritor(input: InheritedHouse, taxpayer: Taxpayer): boolean {
     if (input.shareOfTaxpayer < input.maxShareInInheritors) return false;
     // 동순위: 거주자 우선 → 최연장자
     if (input.tieInMaxShare) {
       if (taxpayer.isResident) return true;
       if (taxpayer.isOldest) return true;
       return false;
     }
     return true;
   }
   function isExcludedBy5YearRule(asset: InheritedHouse, today: Date): boolean {
     const yearsSinceInheritance = diffYears(asset.inheritanceDate, today);
     return yearsSinceInheritance < 5;
   }
   ```
   - 신규 입력 필드: `inheritedHouses[].inheritanceDate`, `shareInInheritance`, `isResidentInInheritedHouse`, `isOldestInheritor`

10. **[엔진 P3-9] 입주권·분양권 권리취득일 기준 소급 산정 (v4 D5, 시행령 §28의4①)**
    ```ts
    // 분양권·입주권에 의해 주택을 취득하는 경우:
    //   주택 수 산정 기준일 = 권리취득일 (분양사업자 분양권: 분양계약일)
    //   1세대 내 매매·교환·증여로 동일 분양권 취득일 둘 이상 → 가장 빠른 날
    function getHouseCountReferenceDate(input: AcquiredHouse): Date {
      if (input.acquiredViaRight) {
        return input.rightAcquisitionDate;  // 권리취득일 (소급)
      }
      return input.balancePaymentDate;  // 일반 매매: 잔금일
    }
    ```
    - 신규 입력 필드: `acquiredViaRight: boolean`, `rightAcquisitionDate: string`
    - 도움말 시나리오: "2023년 분양권 취득 + 2024년 추가 주택 매수 + 2026년 분양권 → 아파트 등기 시 → 2023년 권리취득일 기준 보유 주택 수로 산정"

**완료 기준**:
- 시가표준액 1억 이하 빌라 5채 + 1주택 → 실효 1주택 → 기본세율 적용
- **비수도권 시가표준액 1.5억 빌라 5채 + 1주택 → 실효 1주택** (v3 비수도권 2억 한도)
- 입주권 보유 + 신규 주택 취득 → 일시적 2주택 처분 기간(3년) 자동 안내
- **2024년 신축 55㎡·2억 도시형 생활주택 취득 + 보유 1주택 → 1주택으로 산정** (v3 한시 §28의4② 1호)
- **30세 미만 자녀 소득 충족 + 미성년 아님 → 별도 세대 인정** (v3·v4 §28의3② 1호)
- **취득 주택이 한시 특례 미분양 아파트 → 보유 3주택 + 신규 1주택 = 3주택 산정** (v3 §28의4② 3호)
- **부부 공동명의 1주택 (1세대) → 1주택 카운트** (v4 D3 §28의4④)
- **부부 공동명의 1주택 (별도세대) → 부부 각 1주택** (v4 D3)
- **공동상속 (지분 50% + 50%, 본인 거주) + 5년 미경과 → 주택 수에서 제외** (v4 D4 §28의4⑥3호)
- **공동상속 (지분 50% + 50%, 본인 거주) + 5년 경과 → 본인이 주된 상속자로 카운트** (v4 D4 §28의4⑤)
- **2023년 분양권 + 2024년 주택 매수 + 2026년 등기 → 2023년 기준 산정** (v4 D5 §28의4①)

---

### Phase 4 — 부가세·감면 정확성 (Medium)
**목표**: 지방교육세 차등·농특세 정밀화·생애최초 소형주택 한도.
**일정**: 1~2일

**작업**:
1. **[엔진 P4-1]** `calcLocalEducationTax` — 주택 유상거래 분기
   ```ts
   // 주택 유상거래: 취득세본세 × 50% × 20% (지법 §151①1나)
   if (propertyType === "housing" && isOnerousPurchase) {
     return floor(acquisitionTax * 0.5 * 0.2);
   }
   // 그 외: 표준세율분 × 20%
   return floor(taxBase * 0.02 * 0.2);
   ```
2. **[엔진 P4-2]** 중과세 시 지방교육세 — 다주택 0.4%, 사치성 +1.4%/1.8%(중복) 표 그대로 매핑
3. **[엔진 P4-3]** 생애최초 소형주택 한도 (300만원) 분기
   - `ACQUISITION_CONST.FIRST_HOME_MAX_REDUCTION_SMALL` 이미 정의됨 — 호출 경로 추가
   - 입력: `isSmallHouse: boolean` (전용면적 기준 — §36의3①1호)
4. **[엔진 P4-4]** 농특세 국민주택규모 도시·지방 분기 (G21)
   ```ts
   // 수도권 외 도시지역 외 읍·면 지역 100㎡ 이하 → 비과세
   const exemptLimit = input.isRuralRegion ? 100 : 85;
   if (propertyType === "housing" && areaSqm <= exemptLimit) return 0;
   ```
   - 신규 입력: `isRuralRegion?: boolean`
5. **[테스트 P4-T]** 법인 주택 12% 부가세 anchor 테스트 추가
   - 법인 주택 5억 매매 → 본세 6,000만 / 농특세 (12%-2%) × 5억 × 10% = 500만 / 교육세 5억 × 2% × 20% = 200만
   - 다주택 8%·12% 케이스, 사치성 단독·중복 케이스 각 부가세 anchor

**완료 기준**:
- 6억 이하 주택 → 지방교육세 0.1% (현재 0.4%)
- 다주택 8% → 지방교육세 0.4%
- 사치성 + 다주택 → 지방교육세 1.4% / 1.8%
- 비수도권 읍·면 지역 95㎡ 주택 → 농특세 비과세 (현재 85㎡ 초과로 과세)

---

### Phase 5-UI — 통합 동기화 (7지점 일괄 정리, v5 신설)
**목표**: P1~P4에서 누적된 ~60개 신규 입력 필드의 7개 동기화 지점을 일괄 정비.
**담당**: `acquisition-tax-ui-senior` 단독 (엔진 시니어 검수 후 진행)
**일정**: **3~4일**

**작업**:

1. **[UI P5UI-1] FormState 확장** — `components/calc/acquisition/shared.ts`
   - 18 필드 → ~78 필드로 확장
   - P1 다주택·중과 8 + P1 v3 무상취득 3 + §13의2④ 3 + §13⑦ 1 + P2 법인·공장 8 + P2 자경농지 3 + P3 주택 5 + 한시 4 + 세대별도 1 + 공유지분·공동상속·권리 12 + P4 부가세·감면 2
   - TypeScript discriminated union으로 타입 안전성 확보 (acquiredBy === "corporation" 시에만 법인 필드 활성)
   - 모든 신규 필드 default value `INITIAL_FORM`에 등록
   - 기존 필드 영향도 회귀 검증

2. **[UI P5UI-2] `lib/calc/acquisition-tax-api.ts` 신설**
   - `shared.ts:124` 인라인 `callAcquisitionTaxAPI` 분리
   - 양도세 `lib/calc/transfer-tax-api.ts` 패턴 준수
   - 60+ 필드 변환 매핑 + Zod 사전 검증 + 빈 값 → undefined 정규화
   - `lib/calc/acquisition-tax-validate.ts` 분리 (옵션) — `validateInputConsistency` 포함

3. **[UI P5UI-3] `components/calc/acquisition/normalize.ts` 신설**
   - sessionStorage 마이그레이션 함수 `normalizeAcquisitionForm(legacy)`
   - 18 필드 legacy → 78 필드 default 매핑
   - `currentStep` 4단계 → 6단계 인덱스 변환

4. **[UI P5UI-4] 마법사 4단계 → 6단계 확장**
   - `components/calc/acquisition/Step{0,1,2,3,4,5}.tsx` 6파일 (각 ≤ 400줄)
   - Step 2 (주택 현황) — 보유 주택 카드 배열 + 한시 특례 + 세대별도 ToggleCard·RadioCardGroup
   - Step 3 (지역·중과 분기) — 조정대상지역·지정 전 계약·일시적 2주택·1억/2억 배제
   - Step 4 (법인·특수 분기) — `acquiredBy === "corporation"` 시 조건부 활성, 비조건 시 자동 skip
   - Step 5 (감면·무상취득) — 생애최초·자경농지·부담부증여 관계·무상취득 단서
   - 비주택·개인 케이스 자동 skip (현행 패턴 확장)

5. **[UI P5UI-5] 결과 카드 신규 컴포넌트 3종**
   - `components/calc/results/acquisition/SurchargeFlowDiagram.tsx` (V1, ~200줄)
     - 8단계 중과 흐름도 (사치성→법인→1억 이하→§13의2④→일시적→다주택→공유지분/상속→최종세율)
     - 각 단계 펼치면 입력값 + 조문 표시 (LawArticleModal 연결)
   - `components/calc/results/acquisition/HouseCountVerifier.tsx` (V3, ~250줄)
     - 세대 카운트 검산기 인터랙티브 모달
     - 보유 주택·입주권·분양권·오피스텔 카드 + 별도 세대 4종 체크 + 미성년 예외 강조
     - 11종 제외 항목 자동 검증 + 한시 특례 6종 체크박스
   - `components/calc/results/acquisition/RateScenarioTable.tsx` (V2, ~150줄)
     - 보유 주택 수별 세율 시뮬레이션 (1주택~4주택+ × 조정/비조정 × 법인 매트릭스)
     - 입력값 변경 시 실시간 갱신

6. **[UI P5UI-6] `AcquisitionTaxResultView` 확장** — 신규 결과 필드 노출
   - v3·v4 신규 결과 필드 ~25개 (지정 전 계약 적용 여부, 한시 특례 카운트 제외 내역, 권리취득일 소급 산정 결과, 단서 배제 사유 등)
   - 신규 컴포넌트 3종 통합 (SurchargeFlowDiagram → HouseCountVerifier → RateScenarioTable 순)
   - 신고기한 D-day 카운터 통합

7. **[UI P5UI-7] `AcquisitionSidebar` 신설 (옵션)**
   - `components/calc/acquisition/AcquisitionSidebar.tsx`
   - 양도세 `WizardSidebar` 패턴 준수
   - `computeAcquisitionSummary(form)` 순수 함수 — 단계별 진행 + 임시 세율 미리보기
   - 사이드바 바로가기 클릭 시 해당 단계로 이동

8. **[UI P5UI-8] `Step0`·`Step1`·기존 Step 2/3 inline 갱신**
   - 신규 필드 추가 + tone 일관성 (취득=violet / 물건=sky / 지역=rose / 사치성=rose / 감면=violet)
   - native checkbox·radio 잔존분 ToggleCard·RadioCardGroup 마이그레이션

9. **[QA P5UI-9] `ui-engine-sync-checker` 호출**
   - 60+ 신규 필드 × 7지점 매핑 자동 점검
   - 누락 0건 도달까지 P5UI 완료 불가
   - 결과 보고서 `docs/02-design/features/acquisition-tax-upgrade.sync-report.md` 생성

10. **[UI P5UI-10] 마법사 진척 사이드바 미적용 시 대체 — 단계 인디케이터 강화**
    - `StepIndicator` 컴포넌트에 6단계 + 단계별 입력 완료율 시각화

**완료 기준 (P5-UI Definition of Done)**:
- [ ] FormState ~78 필드 모두 매핑 + INITIAL_FORM default 등록
- [ ] `lib/calc/acquisition-tax-api.ts` 신설 + 60+ 필드 변환
- [ ] `normalize.ts` 신설 + 4→6단계 currentStep 마이그레이션
- [ ] 마법사 6단계 모두 동작 (비주택·개인 skip 패턴 검증)
- [ ] 결과 컴포넌트 3종 신설 + 결과 화면 통합
- [ ] `npx tsc --noEmit` 오류 0건
- [ ] `npx vitest run __tests__/tax-engine/acquisition-tax/` 회귀 통과
- [ ] `ui-engine-sync-checker` 호출 — 누락 0건
- [ ] 브라우저 수동 확인 (주택 매매·증여·법인·신축 4 시나리오) 또는 미수행 명시

---

### Phase 5 — 도움말·시각화 강화 (UX, 핵심)
**목표**: 사용자가 "이 세율이 왜 적용되는지"를 한눈에 이해.
**일정**: 3~4일

#### 5.1 입력 단계 도움말 (Tooltip + Info Banner)

**TaxHelp 컴포넌트 신설** (`components/calc/inputs/TaxHelp.tsx`):
- props: `title`, `summary` (1줄), `details` (markdown 본문), `legalBasis` (조문 코드)
- 라벨 옆 ⓘ 아이콘 → 클릭 시 모달 / hover 시 툴팁
- 본문에는 `LawArticleModal` 자동 연결

**적용 위치 (최소 16곳, v3 4곳 추가)**:

| 위치 | 도움말 내용 |
|---|---|
| 사치성재산 토글 | 5종 정의표 + 각 종류 판정 기준 + 별장 폐지 안내 |
| 조정대상지역 토글 | 현재 지정 지역 리스트 + 시점별 변동 이력 + 자동 조회 안내 |
| 보유 주택 수 입력 | 11개 제외 항목 체크리스트 + 취득일 기준 anchor |
| 일시적 2주택 토글 | **시점별 처분기한 변천표** (~2022.5.9 / 2022.5.10~2023.2.27 / 2023.2.28~ 현행 3년) |
| 시가표준액 중과배제 | **수도권 1억 / 비수도권 2억 이중 기준** + 정비구역 제외 + 전체 주택 기준 (v3) |
| 부담부증여 채무액 | 배우자·직계존비속 간 적용 배제 안내 |
| 무상취득 단서 (v3) | **계부모·의붓자녀 포함** 1세대 1주택자 무상취득 배제 + §15①6 재산분할 |
| 자경농지 감면 | 2년 이상 영농 + 거주·면적·소득 요건 |
| 생애최초 감면 | 12억 한도 + 추징 사유 3가지 + 소형주택 300만원 한도 |
| 법인 취득자 선택 | 휴면법인 판정 6유형 + 5년 기산 |
| 본점·주사무소 | 과밀억제권역 vs 산업단지 차이 |
| 신축·증축 | 원시취득 정의 + 부담부증여와 차이 |
| 6~9억 선형보간 | 산식 + 그래프 + 예시 (8억 → 2.333%) |
| 조정대상지역 지정 전 계약 (v3) | **§13의2④ 단서** — 계약금 증빙 시 비조정지역 취득 간주 |
| 한시 특례 (v3) | **2024.1.10~2027.12.31** 신축 60㎡·3억(수도권 6억) 주택 수 제외 + 미분양 아파트 |
| 세대 별도 인정 (v3) | **§28의3② 4종** — 30세 미만 소득자녀(미성년 제외)·동거봉양·90일 출국·60일 분리 |
| **분양권 자체 (v4 D6)** | "분양권은 권리 양수만 — 취득세 비과세. 등기 시 비로소 과세" |
| **공유지분 (v4 D3)** | "1세대 내 공유 → 1주택. 별도세대와 공유 → 각자 1주택" |
| **공동상속 (v4 D4)** | "지분 큰 상속자만 카운트. 5년 미경과 → 제외. 동순위 시 거주자 → 최연장자" |
| **권리취득일 소급 (v4 D5)** | "분양권으로 등기 시 권리취득일 기준 보유 주택 수로 산정" |

#### 5.2 결과 화면 — 중과 흐름도 시각화 (v4 V1: 5단계 → **8단계** 확장)

**SurchargeFlowDiagram 컴포넌트 신설**:
```
[1] 사치성 판정 (§13⑤·⑥·⑦) ────────────── ❌ 비해당
[2] 법인 주택 12% (§13의2① 1호) ────────── ❌ 비해당
[3] 시가표준액 1억/2억 이하 (§28의2 1호) ── ❌ 한도 초과 (수도권 1억)
[4] §13의2④ 지정 전 계약 보호 ──────────── ❌ 해당 안 됨
[5] 일시적 2주택 (§28의5) ──────────────── ❌ 해당 안 됨
[6] 주택 수 산정 (§28의4)
    ├─ 공유지분: 부부 공동명의 1주택 → 1주택 (§28의4④)
    ├─ 공동상속: 5년 미경과 → 카운트 제외 (§28의4⑥3호)
    ├─ 권리취득일 소급: 2023년 분양권 기준 (§28의4①)
    ├─ 한시 특례 6종: 해당 없음
    └─ 11종 제외 항목: 1.5억 비수도권 1채 제외
[7] 1세대 효과적 주택 수 = 3주택 (취득 후)
[8] 다주택 중과 적용 (§13의2① 3호) ────── ✅ 조정지역 3주택 → 12%
                                          최종세율: 12%
```
- 각 단계 클릭 시 판정 근거 펼침 (input 값 + 조문 + LawArticleModal)
- 적용된 단계는 강조 색(rose), 미적용·skip은 회색
- [6] 주택 수 산정 단계는 펼치면 6차원 매트릭스 (시점·지분·상속·권리·세대·한시) 시각화

#### 5.3 결과 화면 — 세율 비교 표 + **보유 주택 수별 시뮬레이션 (v4 V2)**

**기존 RateBar (1줄 비교)를 표 형태로 확장**:

| 적용 가능 세율 | 비고 |
|---|---|
| 1% | 6억 이하 주택 (기본세율) — 미적용 |
| 8% | 조정지역 2주택 — 미적용 (1주택) |
| **12%** | 조정지역 3주택+ — **적용** (사용자 입력 3주택) |
| 9~11% | 사치성 — 미적용 |

**v4 V2 — 보유 주택 수별 시뮬레이션 (실시간)**:

현재 사용자 입력 + 가산/차감 시뮬레이션 표:

| 보유 주택 수 (취득 후) | 조정지역 | 비조정지역 | 차액 |
|---|---|---|---|
| 1주택 | 1~3% (가격별) | 1~3% (가격별) | — |
| 2주택 (일시적 X) | **8%** | 1~3% | +5%p~7%p |
| 3주택 | **12%** | **8%** | +5%p~11%p |
| 4주택+ | **12%** | **12%** | +9%p~11%p |
| 법인 주택 | **12%** (전 영역) | **12%** | +9%p~11%p |

→ 사용자가 "1채 더 사면 얼마 더 내요?" 즉답 가능. 입력값 변경 시 실시간 갱신.

#### 5.3.1 세대 카운트 검산기 (v4 V3)

**HouseCountVerifier 컴포넌트 신설** (인터랙티브 모달):
- 입력: 보유 주택·입주권·분양권·오피스텔 카드 추가
- 자동 분류:
  - ✅ 1세대 내 가족 동의 (배우자·30세 미만 미혼 자녀·미혼 부모)
  - 🔵 별도 세대 인정 4종 (소득 충족 30세 미만·동거봉양 합가·90일 출국·60일 분리)
  - ⚠️ 미성년 — 별도 세대 인정 불가 (강조)
- 11종 제외 항목 자동 검증 + 한시 특례 6종 체크박스
- 결과: "산정 1세대 주택 수: 3채 (보유 5채 - 제외 2채)"

#### 5.4 결과 화면 — "감면·배제 가능성" 패널

- "이 사례에서 추가 감면 가능 여부": 자경농지·일시적 2주택·1억 이하 등 미체크 시 안내
- 각 항목 클릭 → 입력 단계로 복귀

#### 5.5 결과 화면 — 신고기한 D-day 카운터

원인별 신고기한 자동 산출 + 카운트다운 표시 (지법 §20):

| 원인 | 신고기한 |
|---|---|
| 일반 유상 | 취득일 + 60일 |
| 상속 | 상속개시 월말 + 6개월 (외국 거주 9개월) |
| 증여 | 취득일 월말 + 3개월 (2023 신설) |
| 등기 전 | 등기·등록 신청일까지 (§20④) |

UI: "신고기한: 2026-06-29 (D-29)" + 5일 이내 시 빨강 강조.

#### 5.6 진행 사이드바(`WizardSidebar`) — 실시간 세율 미리보기

- 현재 단계까지의 입력으로 산출되는 임시 세율 표시
- "취득가 8억 + 1주택 → 약 2.333% 적용 예정"

#### 5.7 6~9억 선형보간 그래프 시각화

산식: `세율 = (취득가 × 2 - 9억) / 300억` (BigInt 정밀)

```
6억 ─────────●─── 9억
1%      [입력 8억 → 2.333%]      3%
```
입력값이 변경되면 그래프 위 ●가 실시간 이동. 산식 풀이 1줄 + 결과값 highlight.

#### 5.8 도움말 페이지 신설 (`app/help/acquisition-tax/page.tsx`)

- 표준세율 표 (12종 × 원인별)
- 중과세율 표 (조정/비조정 × 1~4주택+) — **다주택 중과 표준세율 항상 §11①7나 4% 베이스 명시 (v3)**
- 사치성 5종 정의·판정 기준
- 세율특례 9종 표 + §15+§13 동시 적용 분기
- 법인·공장 중과 분류 + **§13⑦ 사치성+대도시 법인 중복 (주택 +12%p / 그 외 ×3+200%) (v3)**
- **다주택 중과 제외 18+α 종 전체 표** (v3 시행령 §28의2 — 공공주택·노인복지·문화유산·미분양 시공자·채권변제·농어촌·사원임대·임대사업자·인구감소지역 등)
- **주택 수 제외 11종 표** (v3 시행령 §28의4⑥ + §28의2 매핑)
- **세대 정의 + 별도 인정 4종** (v3 시행령 §28의3)
- **일시적 2주택 시점별 처분기한 변천표** (v3)
- **무상취득 중과 배제 단서 정밀** (v3 §28의6② — 계부모·의붓자녀 + §15①6)
- **조정대상지역 지정 전 계약 보호** (v3 §13의2④)
- **공유지분·공동상속·권리취득일 산정 가이드** (v4 D3·D4·D5 — 시행령 §28의4①·④·⑤·⑥3호)
- **세대 별도 인정 4종 검산기 가이드** (v4 V3 — 미성년 예외 강조)
- **별장 폐지(2023.3.14)는 §13⑤ 사치성 한정** — §13의2 다주택과 무관 (v4 D1)
- **사회기반시설 등 §13②단서 vs §13의2 중과제외 차이** — §13의2① 1호 단서는 시행령 §28의2 8호 나목 5종(주택건설사업자 등)만 (v4 D8)
- 신고 기한 D-day (4가지 원인별 — §20)
- 모든 표는 `LawArticleModal` 자동 링크

**완료 기준**:
- 결과 화면에서 사용자가 "왜 12%인지" 3초 내 이해
- 입력 화면에서 모든 토글에 ⓘ 아이콘 + 도움말
- 도움말 페이지 8섹션 작성
- 신고기한 D-day 카운터 4가지 원인별 동작

---

### Phase 6 — 조정대상지역 자동 매칭 (Optional, 양도세 인프라 재사용)
**목표**: 잔금일/등기일 + 소재지(지번) → DB `regulated_areas` 자동 매칭.

**작업**:
1. `lib/calc/acquisition-tax-api.ts` 신설 — 양도세의 `regulated_areas` 조회 로직 재사용
2. Step1에 "조정대상지역 자동 조회" 버튼 → 결과는 토글 사전 선택 + 직접 수정 가능
3. 시점별 차이 안내 (예: "2022.5.10 이전 잔금 → 일시적 2주택 처분기한 1년")

---

## 2. 신규/변경 입력 필드 명세 (별도 문서)

신규 입력 필드 ~60개의 TypeScript 타입 정의는 800줄 정책에 따라 별도 분리:

📄 **[`acquisition-tax-upgrade.input-fields.md`](./acquisition-tax-upgrade.input-fields.md)**

분류:
- P1 다주택·중과 정밀화 (8) + 무상취득 단서 (3) + §13의2④ 지정 전 계약 (3) + §13⑦ 사치성+법인 (1)
- P2 법인·공장 중과 (8) + 세율특례 §15 (3) + 자경농지 §6 (3)
- P3 주택 수 정교화 (5) + 공유지분 (2) + 공동상속 (1 배열) + 권리취득일 소급 (2) + 한시 특례 (4) + 세대 별도 (1)
- P4 부가세·감면 (2)

UI 측 `FormState` 매핑은 P5-UI Phase 작업 항목 참조 (§1 Phase 5-UI).
