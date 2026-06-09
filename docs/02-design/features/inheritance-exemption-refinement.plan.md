# 상속세 비과세·과세가액 불산입 정비 계획서

> 작성일: 2026-06-09 · 대상 세목: 상속세(inheritance) · 영향 범위: Step 2 비과세 입력 + 결과 화면 + 엔진 per-heir 배분

## 0. 배경·목표

상속세 비과세(상증법 §11·§12)와 과세가액 불산입(§16·§17)을 다루는 `ExemptionChecklist` 입력 UI와 결과 표시를 4가지로 정비한다. 1번(입력 화면 그룹 분리)은 직전 작업에서 완료됐고, 본 계획은 그 후속 4건이다.

| # | 작업 | 성격 | 난이도 |
|---|---|---|---|
| 1 | 결과 화면에서도 비과세 / 과세가액 불산입 구분 표시 | 결과 카드(⑦) | 소 |
| 2 | 리스크 배지("사후관리 주의"·"추징 위험"·"고위험 추징") 삭제 | UI 표시(⑤) | 소 |
| 3 | 한도(9,900㎡ 등) 이중·삼중 중복 메시지 정리 (전 항목) | UI 표시 + 룰 데이터 | 중 |
| 4 | 비과세·과세가액 불산입 재산의 상속인별 귀속(협의분할) 입력 | 타입·UI·엔진·검증·결과 전 계층 | **대** |

**원칙(메모리 정책 준수)**: 법령 정확성 최우선·절감 표현 금지 / 자동 안분 fallback 금지(미입력=법정상속분은 기존 패턴 유지) / useEffect store 미러링 금지 / 8(14) 동기화 지점 전수.

---

## 1. 작업 1 — 결과 화면 구분 표시 (⑦)

### 현황 (실측)
- `components/calc/exemption/ExemptionSummaryCard.tsx:76` — 헤더 라벨 고정 `"비과세 적용 내역"`, 모든 항목을 `itemResults`로 한 리스트 렌더(`:91-96`).
- `components/calc/results/InheritanceTaxResultView.tsx:492-500` — `result.exemptionDetail.itemResults` 존재 시 `ExemptionSummaryCard` 렌더.
- `InheritanceTaxResultView.tsx:361-363` — 요약 카드에 `비과세 차감` 단일 행(`result.exemptAmount`).

### 변경안
- **treatment echo 주입 지점 (1-D)**: `exemption-evaluator.ts`의 `evaluateSingleExemption`(rule을 이미 조회하는 지점)에서 `getExemptionTreatment(rule)`를 `ExemptionItemResult.treatment?: "non_taxable" | "not_included"`로 echo. evaluator의 rule 조회 방식(`findExemptionRuleById` 등) **실측 확인 후** 배선. (result 필드 1개 추가 → ④⑫ 점검)
- `ExemptionResult`에 `nonTaxableTotal` / `notIncludedTotal` 분리 합계 echo 추가.
- `ExemptionSummaryCard`(`exemption/ExemptionSummaryCard.tsx`)를 `item.treatment`로 2개 소그룹 분리 렌더:
  - "비과세 (상증법 §12)" 소제목 + 해당 `ItemRow`
  - "과세가액 불산입 (상증법 §16·§17)" 소제목 + 해당 `ItemRow`
  - 한 그룹이 비면 소제목 미표시 (증여세는 불산입 그룹 없음 → 자동 비표시). 헤더 "총 비과세 차감"(`:80`) → "총 차감"으로 일반화.
- 요약 카드(`InheritanceTaxResultView.tsx:361-363`): 불산입액 있으면 `비과세 차감` / `과세가액 불산입 차감` 두 행 분리(`exemptionDetail.nonTaxableTotal`/`notIncludedTotal`).
- **(1-C) 영향 점검**: `InheritanceTaxResultView.tsx:269` `exemptAmount: result.exemptAmount` 매핑처(별지/PDF 데이터 빌더 추정) + `:225` 조건이 treatment 분리로 깨지지 않는지 실측 확인. 별지 서식에 비과세 표시가 있으면 구분 반영 여부 결정(작업1 범위=결과 화면, PDF는 선택).

### ✅ 결정 (2026-06-09)
- **(A) 엔진 echo 채택.** `ExemptionItemResult.treatment` + `exemptionDetail.nonTaxableTotal`/`notIncludedTotal` echo 추가. 요약 카드(`:361`)도 `비과세 차감` / `과세가액 불산입 차감` 두 행 분리.

---

## 2. 작업 2 — 리스크 배지 삭제 (⑤)

### 현황 (실측)
- `ExemptionChecklist.tsx:28-41` — `RiskBadge` 컴포넌트. `riskLevel` 별 "사후관리 주의"(low)·"추징 위험"(medium)·"고위험 추징"(high) 칩.
- `ExemptionChecklist.tsx:107` — `ExemptionRow` 헤더에서 `<RiskBadge level={rule.riskLevel} />` 렌더.
- `ExemptionChecklist.tsx:175-179` — 펼침 영역의 `rule.riskNote`(⚠️ amber 박스)는 **별개**.

### 변경안 (✅ 결정 2026-06-09 — 배지·박스 모두 삭제)
- `RiskBadge` 컴포넌트 + `:107` 호출 제거(배지 삭제). `lawRef` 배지는 유지.
- `riskNote`(⚠️ 박스, `:175-179`) **표시 제거** — `ExemptionRow`에서 riskNote 렌더 블록 삭제.
- 엔진 데이터(`exemption-rules.ts`의 `riskLevel`/`riskNote` 필드)는 **삭제하지 않음** — 타입에서 빼면 16개 룰 + 평가기 영향. **표시만 제거**(필드는 잔존).
- 결과 화면 `ExemptionSummaryCard`의 `item.warnings`(`:46-50`)는 **한도 초과 과세 안내**라 별개 — 유지(작업 3에서 중복만 정리).

---

## 3. 작업 3 — 중복 한도 메시지 정리 (⑤ + 룰 데이터)

### 현황 (실측 — 금양임야 예시, 이미지 2)
같은 "9,900㎡" 정보가 한 카드에서 **4회** 반복:
1. `exemption-rules.ts:99` `description` — "…9,900㎡(3,000평) 이내 (상증령 §8③1호)"
2. `ExemptionChecklist.tsx:133-137` 금액 라벨 옆 — "(면적 한도 9,900㎡ — 초과 시 면적 비율로 안분 과세)"
3. `ExemptionChecklist.tsx:151-155` 면적 라벨 옆 — "한도 9,900㎡"
4. `:166-170` warning 박스 — "9,900㎡ 초과분은 일반 상속재산으로 과세. 금양임야+묘토 합산 2억원 한도…"
5. `exemption-rules.ts:113` `exclusions` — "9,900㎡(3,000평) 초과 부분"

추가로 `requirements`(종중 소유·직접 제사·종중 관리)와 `exclusions`(개인 소유·제사 무관·초과 부분)도 description과 정보 중복.

### 변경안 (단일 출처 원칙)
면적 한도 정보는 **면적 입력 필드 라벨에 1회만** 노출하고 나머지 중복 제거:
- `description`(룰): 한도 수치 제거 → 본질 설명만. 예) "피상속인이 제사를 모시던 선조 분묘에 속한 임야 (상증령 §8③1호)". (한도는 입력 필드가 안내)
- 금액 라벨(`:128-137`): `limitType === "area"`의 면적 한도 안내 문구 **제거**(금액 라벨에는 한도 불필요). `fixed`(족보·제구 1천만)는 금액 한도라 라벨에 유지.
- 면적 라벨(`:151-155`): "면적 (㎡) · 한도 9,900㎡" **단일 표기 유지** (여기가 단일 출처).
- warning 박스(`:166-170`): **초과 입력 시에만 조건부 표시**로 축소(이미 `areaM2 > limitAreaM2` 조건 있음 `:166`). 단 "금양임야+묘토 합산 2억원 한도"는 `showGraveGroupNotice` 그룹 안내(`:293-297`)와 중복 → warning에서 제거하고 그룹 안내로 일원화.
- `requirements`·`exclusions` 리스트(`:117-121`, `:182-193`): ✅ **"자세히" 접힘 처리**(결정 2026-06-09). 펼침 영역에 `<details>`/토글로 기본 숨김, 클릭 시 노출. "9,900㎡ 초과 부분" 같은 한도 재진술 항목은 데이터에서 제거.

### 적용 범위
- 면적 한도: 금양임야·묘토 (`inh_forest_burial`·`inh_grave_land`)
- 금액 한도: 족보·제구(1천만)·장애인신탁(증여, 5억) — 금액 라벨 1회로 통일
- 전 항목 공통: `description` ↔ `requirements`/`exclusions` 중복 제거 + 요건/제외는 "자세히" 접힘

---

## 4. 작업 4 — 비과세·불산입 재산 상속인별 귀속 (전 계층) ★핵심

### 현황 (실측 — 가장 중요)
- 비과세 입력 `ExemptionCheckedItem`(`types/inheritance-exemption.types.ts:14-33`)에 **`heirAllocations` 없음**.
- 엔진 per-heir 산식(`inheritance-allocation.ts:522-527`):
  ```
  taxableValueShare = directEstateAmount + presumedAmount + giftAmount − debtShare
  ```
  → **비과세(exemptAmount)가 상속인별 차감에서 빠져 있음.**
- `inheritance-tax.ts:793` — `totalExcludedFromTaxation: exemptAmount`(전체 합계만 echo).
- per-heir `excludedFromTaxation?`(`inheritance-allocation-result.types.ts:65`)는 **정의만 되고 `perHeir` 객체에 미기입**(`inheritance-allocation.ts:495·598`에 키 없음) → `heir-allocation-summary.ts:217`이 읽어도 항상 `undefined`→0. **죽은 필드.**

### 재사용 가능 자산 (실측)
- `HeirAllocation` 타입(`types/inheritance-gift.types.ts:852-859`): `{ heirId, amount, areaM2? }`. 그대로 재사용.
- `HeirAllocationInput`(`components/calc/inheritance/HeirAllocationInput.tsx:82`): 칩 토글 + 잔여 자동채움 + 합계 검증 색상. props: `allocations`·`expectedTotal`·`heirs`·`onChange`·`showAreaInput?`·`heading?`·`flush?`.
- `HeirAllocationToggleSection`(`HeirAllocationToggleSection.tsx:34`): `ToggleCard`(violet) ON/OFF, `hasDistributableHeir(heirs)` 활성 조건, `buildInitialHeirAllocations()`→`[]`.
- `scaleMapToTotal(raw, target)`(`inheritance-allocation.ts:189-206`): raw 분배비율을 목표 총액으로 환산 + 마지막 항목 잔액 흡수(Σ==target). **claimedAmount 분배 → 인정 exemptAmount 안분에 핵심 사용**.
- 3-state 패턴(`T[] | undefined`): undefined=OFF / []=ON빈 / [...]=ON데이터. 메모리 `feedback_three_state_optional_mode_toggle` 준수.

### ★★ 분배 단위 ≠ 차감 단위 (1-A 정정 — Critical)
- **UI 분배 입력 단위 = `claimedAmount`**(사용자는 청구액을 상속인별로 나눔. 입력 시점엔 인정액 모름). `HeirAllocationInput.expectedTotal = claimedAmount`, validate도 `Σamount === claimedAmount`.
- **엔진 차감 단위 = 인정 `exemptAmount`(한도 후)** — 금양임야 면적초과·공익법인 동족주식초과 시 `claimedAmount ≠ exemptAmount`.
- ❌ **`resolveAllocationsByHeir(exemptions, ex=>exemptAmount)` 직접 호출 금지** — 협의분할 입력 시 `amountOf`를 무시하고 `alloc.amount`(claimedAmount 분배)를 그대로 합산(`:169-173`)하여 인정액과 어긋남.
- ✅ **항목별 2단계 안분**:
  1. 항목 `ex`의 `heirAllocations`(있으면) 비율로 raw 분배. 미입력이면 `distributeByLegalShares(claimedAmount, legalShares)`.
  2. `scaleMapToTotal(raw, ex의 인정 exemptAmount)` → 인정액 기준 per-heir 차감액. floor 잔액 흡수 내장(`feedback_floor_residual_absorption`).
  3. 전 항목 결과를 heirId별 합산 → `exemptByHeir`.

### ★ 핵심 설계 난점 — per-heir 정합성
비과세를 상속인별로 차감하려면 **전체 합계 산식과 per-heir 합계가 일치**해야 한다.
- 전체(`inheritance-tax.ts:252`): `taxableEstateValue = grossEstate + presumed − exemptAmount − deducted + priorGift`
- per-heir 합(`:527` Σ): 현재 `exemptAmount` 미반영 → 둘이 `exemptAmount`만큼 어긋남(현재는 per-heir에서 안 빼므로 per-heir Σ가 과대).
- **이게 기존 잠복 불일치인지 먼저 anchor로 실증**(아래 Pre-Do). 비과세 재산이 `estateItems`에 포함 입력되는지(→ `estateByHeir`에 들어가 차감 의미 있음) vs `exemptions`에만 입력되는지에 따라 설계가 갈림.

### 변경 단계 (8 동기화 지점 매핑)
| 지점 | 변경 |
|---|---|
| ① 폼 타입 | `ExemptionCheckedItem.heirAllocations?: HeirAllocation[]` 추가 (`inheritance-exemption.types.ts`) |
| ② initial | `ExemptionChecklist` 토글 OFF 기본 = `heirAllocations` 미설정(undefined) |
| ③ normalize | sessionStorage 마이그레이션 — 기존 항목은 `heirAllocations` 없음 → undefined 안전 |
| ④ API 변환 | `lib/calc/inheritance-api.ts`에서 `exemptions[].heirAllocations` 전달 (spread 누락 점검 — 메모리 `explicit_prop_mapping_strip`) |
| ⑤ UI 위젯 | `ExemptionRow` 펼침 영역 하단에 `HeirAllocationToggleSection` + `HeirAllocationInput` 추가. `expectedTotal = claimedAmount`. `heirs` prop을 `ExemptionChecklist`까지 내려야 함(현재 미전달 — 시그니처 확장) |
| ⑥ 사이드바 | 영향 없음(합계 표시 항목 아님) |
| ⑦ 결과 | **신규 카드 불요(3-1).** `heir-allocation-summary.ts:210-218`에 **㉠ "과세제외 재산(비과세+과세가액불산입)" 행이 이미 존재**하고 `total`·`perHeir(excludedFromTaxation)` 둘 다 읽도록 배선됨. → `perHeir[].excludedFromTaxation` 기입만으로 ㉠ 행 per-heir 칸 **자동 완성**(표 빌더 무변경). + 작업1 요약 카드 2행 분리 |
| ⑧ validation | `lib/calc/inheritance-validate.ts`에 `validateExemptionItemAllocations` 추가 — 입력 시 `Σamount === claimedAmount` 강제(미입력=통과). `validateEstateItemAllocations`(`:140`) 패턴 복제 |
| ⑫ Zod | `lib/validators/property-valuation-input.ts`의 `exemptionCheckedItemSchema`(`:381-`)에 `heirAllocations: z.array(heirAllocationSchema).optional()` 추가. **`heirAllocationSchema`(`:52`) 재사용**(estate·debt·presumed 동일 패턴). ⑫ 누락 시 침묵 strip |
| ⑭ Route | `app/api/calc/inheritance/route.ts:80` `exemptions: parsedData.exemptions` — heirAllocations는 number/string 평면값이라 Date 변환 불요. Zod 통과 시 자동 전달 |

> ⑤ 상세(heirs prop·토글 배치·증여세 게이트)는 UI 설계 문서로 이관.

### ★ 귀속 정합 (6-3 — ✅ anchor A1로 해소)
후보② 별도 항 차감 확정으로 **exemption 자체 귀속으로만 차감** → estateItem 귀속 추종 불요. 정책 **(c) 음수 가드 `max(0,…)`** + 초과분 재분배만 적용. (a)/(b) 폐기.

### 엔진 변경
- `inheritance-allocation.ts`: 신규 `exemptByHeir` 집계 — **항목별 2단계 안분**(위 ★★ 분배≠차감 참조):
  ```
  for ex of exemptionItems:
    raw = ex.heirAllocations?.length
            ? Map(heirId → alloc.amount)              // claimedAmount 분배
            : distributeByLegalShares(ex.claimedAmount, legalShares)
    scaled = scaleMapToTotal(raw, 인정exemptAmountById.get(ex.ruleId))  // 인정액 안분 + 잔액흡수
    exemptByHeir += scaled
  ```
  이후 `taxableValueShare`에서 **별도 항 차감(✅ anchor A1 확정 — 후보②)**:
  ```
  taxableValueShare = max(0, directEstateAmount + presumedAmount + giftAmount − debtShare − exemptShare)
  ```
  - anchor A1 실증: 비과세 재산 estateItems 포함(A)/미포함(B) **모두** 별도 항 차감으로 비과세 100M 정확히 제거. 후보①(estateByHeir 차감)은 B에서 directEstate에 비과세재산 없어 불가 → 폐기.
  - 음수 가드 `max(0,…)` + 초과분 재분배(정책 c).
- `perHeir[heir.id].excludedFromTaxation = exemptShare` 기입(죽은 필드 활성화).
- `HeirAllocationParams`(`inheritance-allocation.ts:122`)에 `exemptionItems: ExemptionCheckedItem[]` + `인정exemptAmountById: Map<string, number>`(evaluator의 `itemResults[].exemptAmount`를 ruleId 키로) 매개변수 추가.
- evaluator 결과(`exemptionDetail.itemResults`)를 `inheritance-tax.ts`의 **`calcHeirAllocation({...})` 호출부(`:720-728`)** 에서 allocation params로 주입(STEP 2 `:138-142` 평가 결과 재사용). result 노출은 `:822 exemptionDetail` 기존 라인 활용.
- **㉠ total ↔ per-heir Σ 정합**: `totalExcludedFromTaxation`(`:793`, ㉠ total) == `Σ perHeir.excludedFromTaxation`. `scaleMapToTotal(target=인정exemptAmount)`이 항목별 보장 → ㉠ 행 합계 일치.

### 결정 필요
- 비과세 재산을 `estateItems`에도 입력하는 현행 전제 확인 후, per-heir 차감이 estateByHeir와 **이중 차감**되지 않는지(estateItems에 비과세 재산이 있으면 거기서 이미 분배됨) 검증. → Pre-Do anchor 필수.

---

## 5. Pre-Do Anchor (Do 진입 전 우선 실증 — 메모리 `feedback_pre_anchor_verification`)

작업 4 착수 전 **anchor 2건**을 먼저 작성·실행해 현행 동작을 실증하고 설계를 환류한다:

1. **per-heir 비과세 정합 anchor**: 상속인 2인 + 비과세 항목 1건(예: 공익법인 출연 1억, **estateItems에도 동일 재산 포함**) 입력 후, 현재 `result.heirAllocationResult.perHeir[*].taxableValueShare` 합계 vs `result.taxableEstateValue`를 비교. **현행이 `exemptAmount`만큼 불일치하는지** 실증. → 비과세 재산이 estateByHeir에 이미 들어있으면(전체 산식 `:252`가 `grossEstate−exemptAmount`이므로 그래야 정합) **estateByHeir에서 차감**이 정답 / 미포함이면 taxableValueShare 차감. 차감 위치 확정.
2. **한도초과 안분 anchor (1-A 검증)**: 금양임야 청구 2억(인정 1.5억 가정) + 2인 협의분할(1.2억/0.8억) → 인정 1.5억이 분배비율(0.6:0.4)로 9천만/6천만 안분되는지(`scaleMapToTotal`). claimedAmount(2억)가 아닌 **인정액(1.5억) 합계** 차감 확인.
3. **이중차감 가드 anchor**: anchor1에서 확정한 차감 위치 적용 후, 비과세가 estateByHeir와 exemptShare 양쪽에서 빠지지 않는지(Σ taxableValueShare == taxableEstateValue).

> "현행 일치 예상" 금지 — anchor 실패 메시지로 설계(차감 기준·이중차감 가드)를 확정한 뒤 Do.

---

## 6. 실행 순서·커밋 분할

| Phase | 내용 | 커밋 |
|---|---|---|
| A | 작업 2(배지 삭제) + 작업 3(중복 메시지 정리) — 표시 전용, 저위험 | `refactor(inheritance): 비과세 카드 리스크배지·중복 한도문구 정리` |
| B | 작업 1(결과 구분 표시) — (A)/(B) 결정 후 | `feat(inheritance): 결과 화면 비과세/과세가액 불산입 구분 표시` |
| C | Pre-Do anchor 2건 (작업 4) | (테스트 커밋) |
| D | 작업 4 타입·엔진·검증 (①③④⑦⑧ + 엔진) | `feat(inheritance): 비과세·불산입 상속인별 귀속 — 엔진/검증` |
| E | 작업 4 UI (⑤ HeirAllocation 통합) + 결과 카드 | `feat(inheritance): 비과세 협의분할 입력 UI·결과 카드` |

각 Phase: `npx tsc --noEmit` 0건 + `npx vitest run __tests__/tax-engine/inheritance/` 통과. 작업 4 완료 후 `ui-engine-sync-checker` + 전체 `npm test`. 브라우저 확인은 E2E spec(`e2e/`)로(메모리 `feedback_browser_verify_with_playwright`).

---

## 7. 오픈 이슈 / 결정 목록

1. ✅ **작업 1**: 엔진 echo **(A) 채택** — `treatment` + 분리합계 echo, 요약 카드 2행 분리.
2. ✅ **작업 2**: **배지·riskNote 박스 모두 삭제** (표시만 제거, 룰 필드 잔존).
3. ✅ **작업 3**: 요건/제외 리스트 **"자세히" 접힘** + 한도 재진술 데이터 제거.
4. ✅ **작업 4 차감 설계**: **anchor A1 실증 완료** — 후보②(taxableValueShare 별도 항 차감) + 음수 가드(c). 차감 단위=인정 exemptAmount(2단계 안분). 불변식=비과세 기여분 분리(`ΣTVS(비과세)==ΣTVS(미입력)−exemptAmount`).
5. ✅ **작업 4 범위**: `category === "inheritance"`에서만 협의분할 토글 노출(증여세 제외).

> 이 계획서의 모든 file:line은 실측 인용. 작업4 차감 설계는 anchor A1로 확정(추정 0). **Do 진입 가능.**
