# 부담부증여 §114의2 환산 5% 가산세 적용 계획

> **정정 로그 — critic 정정 반영(2026-06-21)**: critical 활성화 메커니즘(finalize penaltyBase 게이트 결선·D-2 재작성)·법령 강도 하향(§2.2·§2.3 강한 해석)·file:line repo-root 절대경로 prefix·B경로 mirror 패턴·④⑬ 통합·양도세 결과뷰 경유 확정·echo Phase1 미도입·2020 게이트 본 작업 비대상·지방소득세 base 정합 표시 등 **10건** 반영.
>
> **13단계 자가검증 정정 반영(2026-06-21)**: mustFix 4 + residual 9. ① §114조의2② 조기반환(transferGain≤0) 경로 결선(transfer-tax.ts:385-404 pb0)을 §6.1·§7·§8에 추가 — engine.design에 맞춰 동기화. ② K-5 건물 양도시 기준시가(item.standardPrice) 0-base 침묵 차단을 §6.3 ⑧에 추가. ③ §6.1 B경로의 잘못된 함수 스코프 인용(general_building) 3단계 명시로 정정. ④ apt→housing enum 통일·commercial_building 양도세 탭 한정·양도세 ⑦ 기존존재 확정·legal-codes 기존 상수 재사용·breakdown 변수명 통일·회귀 anchor 3종 등 residual 반영.

> **★ 구현 환류(2026-06-21, Do 완료)**: 본 PR은 결선 **A(step.ts override)+B(finalize:313-314 input→effectiveInput)+C(transfer-tax.ts:386-388 조기반환 pb0)** 로 **증여세·양도세 housing/building K-5 신축 §114조의2 발동**을 완결(anchor 5/5·E2E 9/9·전체 9091 회귀 0). **결선 D(general_building route-helper B경로)는 Phase 2 SCOPE OUT으로 환류** — 증여세 탭은 general_building 미도달(resolvePropertyType land/housing/building만), 양도세 general_building 부담부 K-5 신축은 payload 3단계 확장이 필요한 엣지라 별도 PR. §4 갭표·§3 매트릭스·§6.1의 general_building 행은 Phase 2 대상. 증축(extension)도 Phase 2(D-5).

## 0. 한줄 요약

부담부증여 "양도분"(채무인수분=유상양도)이 신축·증축 건물의 환산취득가(K-5)로 취득가액을 산정할 때, 소득세법 §114의2 5% 가산세가 발동하지 않는 갭을 해소한다. **엔진 수정(★finalize penaltyBase 게이트 결선 + step override 신축게이트 전파 + general_building route-helper 건물카드)으로 numeric을 양도세·증여세 두 탭에 자동 적용**하고, 증여세 탭에 신축필드 UI/폼/API/validate를 추가한다. land는 §114의2 무관. **★ 활성화 핵심**: step override 단독으로는 finalize:313-314가 원본 input을 읽어 penalty가 0이므로(D-2), finalize penaltyBase 게이트 결선(단일안 (a): input→effectiveInput)이 반드시 동반되어야 발동한다(anchor-1 실측 확정).

---

## 1. 배경·목표·검증 성공기준

### 1.1 현황 (실측 — grep/Read 검증)

- §114의2 가산세 계산 로직 `calculateBuildingPenalty`는 `lib/tax-engine/transfer-tax-rate-calc.ts:51-87`에 구현되어 일반 양도세에서 정상 작동.
  - 호출: `transfer-tax-finalize.ts:318`(단건 본선), `transfer-tax.ts:386-389`(손실/0 조기반환), `rate-calc.ts:512-516`(다필지), `transfer-tax-aggregate.ts:421-422`(다건 echo).
- 발동 게이트(`rate-calc.ts:55-78`, 전부 AND):
  - `:55` `if (!input.isSelfBuilt) return null;` — 신축/증축 플래그 필수.
  - `:60` `transferDate < 2018-01-01` → null.
  - `:62-65` `isPenaltyMethod` = `acquisitionMethod === "estimated"` **또는** (`appraisal` AND `transferDate >= 2020-01-01`). `acquisitionMethod` enum은 `"actual" | "estimated" | "appraisal" | "salesCase"`(`types/transfer.types.ts:252`)뿐 — **`"converted"` 부재**.
  - `:67-70` `buildingType === "extension"`이면 `transferDate < 2020-01-01` → null, `extensionFloorArea <= 85` → null.
  - `:72` `if (!input.constructionDate) return null;`
  - `:77-78` `addYears(constructionDate, 5)` 초과 양도면 null.
  - `:80` `penalty = applyRate(acquisitionPriceForPenalty, 0.05)` (단일 floor). base는 **호출자가 넘긴 값을 그대로 5% 곱할 뿐, 함수 내부에 토지/건물 분리 없음**.
- penalty → 결과 반영(`finalize.ts`): `:320` `determinedTaxWithPenalty = determinedTax + penaltyTax`, `:323` `localIncomeTax = applyRate(determinedTaxWithPenalty, 0.1)`(가산세 포함분에 지방소득세 10%), `:343` `totalTax = determinedTaxWithPenalty + localIncomeTax + ...`. 결과 타입 `penaltyTax`(`transfer.types.ts:636`)·`penaltyBase`(`:642`) 노출. **`determinedTax`(`finalize.ts:335`)는 가산세 전 값** — 결과 카드는 `determinedTax`(가산세 전)를 표시하므로 별도 penalty Row 필요.
- **부담부증여 경로 §114의2 미발동 원인 3개(★critic — 원인 3 추가)**:
  1. 신축필드(`isSelfBuilt`/`buildingType`/`constructionDate`/`extensionFloorArea`)가 부담부증여 입력 경로(양도세 BurdenedGift step·증여세 BurdenedGiftTransferTaxInput)에 미주입 → `rate-calc.ts:55` 즉시 null.
  2. K-5 환산은 `burdenedGiftInfo.acquisitionMethod === "converted"`(부담부증여 전용 enum)로만 표현되고, step override가 `acquisitionMethod`를 `workingInput`에 전파하지 않음. 게다가 메인 body는 `acquisitionMethod: "actual"`(`lib/calc/gift-burdened-transfer-api.ts:198`)·`useEstimatedAcquisition: false`(`:197`)로 송신 → `isPenaltyMethod = false`.
  3. **★ penalty base 게이트가 원본 `input`을 읽음**: `lib/tax-engine/transfer-tax-finalize.ts:313-317`의 `isEstimatedMode`(:313)·`effectiveEstimatedBase`(:314)·`penaltyBase`(:315-317)는 FinalizeArgs.`input`(= rawInput, `transfer-tax.ts:91`)을 읽는다. step override는 `workingInput`(=effectiveInput)만 바꾸고 원본 `input`은 미변경 → `isEstimatedMode=false`·`penaltyBase=0` → `penalty=floor(0×0.05)=0`. **이 원인이 핵심으로, finalize penaltyBase 게이트 결선 없이는 step override를 어떻게 고쳐도 발동하지 않음(§5 D-2).**
- **부담부증여 step override**(`lib/tax-engine/transfer-tax-burdened-gift-step.ts:50-59`): `workingInput`을 자산 합산값으로 교체하고 `useEstimatedAcquisition: false`(`:57`) 강제. `isSelfBuilt`/`acquisitionMethod`/`estimatedBase` 미설정. **★ 설사 step override가 `workingInput`에 이 값들을 설정해도, finalize:313-314가 원본 `input`을 읽으므로 penalty base는 여전히 0(원인 3) → finalize 결선(단일안 (a): input→effectiveInput) 동반 필수.**
- **부담부증여 엔진 자산별 환산취득가 이미 산출**: `lib/tax-engine/burdened-gift-apportionment.ts` STEP 4 K-5(`:309-321`)가 `perAsset.building.acquisitionPrice`(`:458`)를 **채무비율 안분 후 양도분 건물 환산취득가**로 독립 산출. land도 `perAsset.land.acquisitionPrice`(`:448`) 독립. base 즉시 가용.
- **증여세 자산 (엔진 propertyType)** = land/housing/building **단일슬롯**(general_building·commercial_building 없음 — 한 자산에 토지+건물 동시보유 케이스 자체 없음). 폼 카테고리 `real_estate_apartment`→엔진 `propertyType` **housing**, `real_estate_building`(주택)→housing/(비주택)→building, `real_estate_land`→land (`resolvePropertyType` `gift-burdened-transfer-api.ts:38-46`). `gift-burdened-transfer-api.ts:99-102`가 land→landStd전체/buildingStd0, housing·building→landStd0/buildingStd전체 배정. 시가모드(K-5) 비-land에서도 `buildingStdPriceAtAcquisition`은 `buildingStdAtAcquisition`(=`bgt.standardPriceAtAcquisition`)으로 정상 wiring(`:166`) → 건물 K-5 환산 base 산출 기능 정상.
- **양도세·증여세 부담부증여 둘 다 같은 POST /api/calc/transfer 엔진 호출** → 엔진 수정 1회로 numeric은 양 탭 자동 적용. UI·폼타입은 각 탭 별도(양도세 AssetForm엔 신축 4필드 자산수준 존재·UI/송신/validate 완비, 증여세 BurdenedGiftTransferTaxInput엔 신축필드 없음).
- 직전 PR#315로 증여세 부담부증여 K-4 실지/K-5 환산 취득가액 모드 구현 완료(`valuationMode`·`marketValueAtTransfer`·`acquisitionMethod`·`actualAcquisitionTotal`·`capitalExpenditure`·`transferExpense`·`landStdPriceAtTransfer`). 본 작업은 그 위에 §114의2 가산세 추가.
- §114의2는 "건물"의 신축·증축 행위 가산세 → 건물분 환산취득가에만 적용. **토지는 대상 아님.**

### 1.2 목표

부담부증여 양도분이 신축 건물의 환산취득가(K-5)로 취득가액을 산정하고, 취득일~5년 이내 양도(=증여)인 경우 §114의2 5% 가산세를 결정세액에 가산한다. base는 **채무비율 안분 후 양도분 건물 환산취득가**(`perAsset.building.acquisitionPrice`). 양도세·증여세 두 탭 모두 적용. **증축(extension)은 Phase 1 SCOPE OUT(신축만, §11 참조).**

### 1.3 검증 성공기준 (verify)

- [ ] **Pre-Do anchor 실패 확보**: 부담부증여 K-5 + 신축 + 5년 이내 입력에 `penaltyTax === 0` (현행 미발동 실증) → **step override만 적용 시에도 여전히 0**(D-2 실측) → finalize penaltyBase 게이트 결선 후 `penaltyTax > 0` 통과.
- [ ] 단위 anchor: `perAsset.building.acquisitionPrice × 5% = penaltyTax`(floor 1회). land 미반영.
- [ ] **transferGain≤0 zero-tax anchor(mustFix 1)**: 부담부 K-5 신축 + 양도차익 ≤ 0(환산취득가>양도가액) → `penaltyTax > 0`(§114조의2② 산출세액 없어도 부과). 조기반환 경로(transfer-tax.ts:385-404) 결선 후 통과.
- [ ] 양도세 탭 E2E: 부담부증여 + 매매취득 + 신축 건물 + K-5 → **`TransferTaxResultView`** 가산세 Row 표시(selector 확정 — §6.2 ⑦).
- [ ] 증여세 탭 E2E: 부담부증여 K-5 + 신축 건물 → **`BurdenedTransferTaxResultCard`(Row sub-component)** 가산세 Row 표시.
- [ ] `npx tsc --noEmit` 0건.
- [ ] `npx vitest run __tests__/tax-engine/transfer/` 통과 + 전체 `npm test` 회귀.
- [ ] 14지점(증여세 측) 전부, ⑫⑬⑭ grep 자가 점검.

---

## 2. 법령 (소득세법 §114의2 — KoreanLaw 검증 결과)

검증 출처: KoreanLaw MCP `소득세법` MST 285523(현행, 시행 2026-04-21) 조문 직접 조회 + 조세심판원 조심2019서3934(948844) 전문.

### 2.1 §114의2 ① 본문 (현행 원문 — 검증됨)

> 거주자가 건물을 **신축 또는 증축(증축의 경우 바닥면적 합계가 85제곱미터를 초과하는 경우에 한정한다)**하고 그 건물의 **취득일 또는 증축일부터 5년 이내**에 해당 건물을 양도하는 경우로서 **제97조제1항제1호나목에 따른 감정가액 또는 환산취득가액을 그 취득가액으로 하는 경우**에는 해당 건물의 **감정가액(증축의 경우 증축한 부분에 한정한다) 또는 환산취득가액(증축의 경우 증축한 부분에 한정한다)의 100분의 5**에 해당하는 금액을 제92조제3항제2호에 따른 **양도소득 결정세액에 더한다.**
> ② 제1항은 **제92조제3항제1호에 따른 양도소득 산출세액이 없는 경우에도 적용한다.**

### 2.2 검증 결론표

| 항목 | 판정 | 근거 |
|---|---|---|
| base = 건물 환산취득가(토지 제외) | **확정** | §114의2① "해당 건물의 … 환산취득가액의 100분의 5". 토지는 신축·증축 대상 아님 |
| ★부담부증여 base = 안분 **후**(양도분=채무액분) 건물 환산취득가 | **강한 해석(재결 직접 판시 아님)** | §114의2①이 §159① 양도차익 계산 체계 **안에서** 건물 환산취득가에 부착 → 양도분=채무액분 안분 후 값이 그 체계의 건물 환산취득가라는 **도출 논리**. 조심2019서3934(948844)는 §114의2의 **적용 가부**와 **실지거래가액 선택 시 회피 가능**만 판단했고, 금액은 전부 'OOO' 마스킹되어 base가 안분 전/후 어느 쪽인지에 대한 **직접 판시는 없음**. numeric은 `perAsset.building.acquisitionPrice`(이미 안분 후)로 결선되어 **구현 영향 없음** |
| 부담부증여 채무분 양도에 §114의2 적용 | **확정** | 조심2019서3934(부담부증여 신축건물 환산취득가 5% 가산세 적법·기각) + §88①1호 후단 채무액분=양도 |
| 실지거래가액(K-4) 선택 시 미발동 | **확정** | 조심2019서3934 부연(§159① A=실지 §97①1호가목 선택 시 회피 가능) → K-4 미발동, K-5 환산만 발동 |
| 증축 = 증축부분 한정 + 바닥면적 합계 85㎡ 초과 | **확정** | §114의2① 괄호 |
| 산출세액 0이어도 부과 | **확정** | §114의2② |
| 5년 기산: 신축=취득일, 증축=증축일 | **확정** | §114의2① 본문 |
| 2018.1.1 신축+환산 시행 | **확정** | 조심2019서3934 구 조문(§93) 인용 실증 |
| 2020.1.1 감정가액 게이트 | **본 작업 비대상(★critic low)** | 감정가액(`appraisal`) 2020.1.1 게이트(`rate-calc.ts:64`)는 **증여 부담부증여(appraisal enum 부재, §11)·양도세 신축(本 PR 신축만)** 모두 **비경유** → 실제 무관. 본 작업 미변경 |
| 2020.1.1 증축 추가 시행일 | **후속 증축 PR로 이관** | KoreanLaw 연혁 MST 직접 미검증. 증축은 Phase1 SCOPE OUT(§11)이므로 본 작업 영향 없음. **증축 2020.1.1 시행일 부칙은 후속 증축 PR에서 KoreanLaw 연혁 MST로 검증**(이관 명시) |
| §159① 채무 안분 계산식 원문 수식 | **확인필요** | 재결 본문에 "계산식" 표 처리로 수식 미노출. 단 엔진 `burdened-gift-apportionment.ts` 기구현이라 영향 없음 — base 선택만 결선 |

### 2.3 ★penalty base 안분 전/후 판정 (핵심 — 강한 해석, 재결 직접 판시 아님)

**판정: 안분 후(양도분=채무액분) 건물 환산취득가. 단 이는 §159① 체계 도출 논리에 의한 강한 해석이며, 재결의 직접 판시(금액 마스킹)는 아님(★critic).**

근거 — 도출 논리(주):
- §114의2①은 "해당 건물의 … 환산취득가액의 100분의 5"를 §92③2호 **양도소득 결정세액에 더한다**고 규정 → §114의2는 §159① 양도차익 계산 체계 **안에서** 건물 환산취득가에 부착. 따라서 base는 §159①으로 산정된 "양도분"(채무액분) 건물 환산취득가다.

근거 — 조심2019서3934(948844, 2019.12.26, 기각)의 **실제 판단 범위**(KoreanLaw로 재결요지·이유 전문 직접 조회한 사실):
- 사실관계: 거주자가 건물 신축 → 자녀에게 토지+건물 부담부증여 → 건물 취득가액을 환산가액으로 신고. 처분청이 환산취득가액 5% 가산세 부과, 심판원 적법 확정(기각).
- **재결이 판단한 것**: §114의2의 **적용 가부**(부담부증여 신축건물 환산취득가에 §114의2 적용 적법) + **실지거래가액 선택 시 회피 가능**(§159① A=실지 §97①1호가목 선택 시 가산세 미부담 가능)뿐.
- **재결이 판단하지 않은 것**: 금액이 모두 'OOO'로 마스킹되어, base가 **안분 전/후 어느 쪽인지에 대한 명시적 판단(금액 산식)은 없음**. 즉 '안분 후' 결론은 plan의 §159① 체계 도출 논리이지 재결의 직접 판시가 아니다(추정 인용 금지 정책 준수).

**결론**: base는 `lib/tax-engine/burdened-gift-apportionment.ts`의 `perAsset.building.acquisitionPrice`(`:458`, 이미 채무비율 안분 후·자산별 독립 환산된 양도분 건물 환산취득가). 별도 재계산 불요 — base 선택만 이 값으로 결선. 안분 전 전체 건물 환산취득가를 base로 쓰면 **과대 부과**. (§114의2 본칙 텍스트 자체는 MST 285523과 자구 일치 — 본칙 인용은 정확.)

---

## 3. 케이스 매트릭스 (자산종류 × 취득방식 × 신축여부 → 발동·base)

> **★ 자산종류 enum 통일(residual medium)**: 아래 표는 엔진 `propertyType` enum 기준으로 표기한다. 부담부증여 안분 SUPPORTED = `["housing", "land", "building", "general_building", "commercial_building"]`(`burdened-gift-apportionment.ts:494`) — **"apt"/"apartment"는 엔진 enum에 없다**. 증여세 폼 카테고리 `real_estate_apartment`는 `resolvePropertyType`(`gift-burdened-transfer-api.ts:38-46`)에서 엔진 `propertyType` **housing**으로 변환된다. 따라서 이하 "housing"은 (주거용 건물) 폼 카테고리 `real_estate_apartment`·`real_estate_building`(주택)을 포괄한다.

| 자산종류(엔진 propertyType) | 취득방식 | 신축/증축 | §114의2 발동 | base |
|---|---|---|---|---|
| land(토지) | K-4실지/K-5환산/표준 | (전부) | **미발동** | — (토지는 §114의2 대상 아님) |
| building/housing | K-4 실지 | 신축/증축 | **미발동** | — (실지=§97①1호가목, 환산 아님) |
| building/housing | K-5 환산 | 해당없음 | 미발동 | — (`isSelfBuilt=false`) |
| building/housing | K-5 환산 | 신축(취득일~5년이내) | **발동** | `perAsset.building.acquisitionPrice`(안분후 환산취득가) × 5% |
| building/housing | K-5 환산 | 신축(취득일~5년초과) | 미발동 | — (5년 게이트 `rate-calc.ts:77-78`) |
| building/housing | K-5 환산 | 증축(85㎡초과·증축일~5년) | (Phase1 미지원) | 증축부분 한정 base 미구현 → **SCOPE OUT(§11)** |
| building/housing | K-5 환산 | 증축(85㎡이하) | 미발동 | — (85㎡ 게이트 `rate-calc.ts:69`) |
| building/housing | 표준(K-1~3) | (전부) | 미발동 | — (환산/감정 아님) |
| general_building(토지+건물 혼재, **양도세 탭 한정**) | 건물카드 K-5환산 | 신축 | **발동** | 건물카드 `estimatedBase`=`perAsset.building.acquisitionPrice`(토지카드 제외) |

증여세 탭은 land/housing/building **단일슬롯**(토지+건물 동시보유 없음·`resolvePropertyType`이 land/housing/building 3종만 산출) → 발동 시 자산 전체=건물분이라 분리 정밀도 문제 비발생. 정밀 분리(토지+건물 혼재) general_building은 **양도세 탭에 한정**(증여세 탭 미도달).

---

## 4. 갭 분석 (이미 구현 vs 추가)

| 항목 | 상태 | 근거(file:line) |
|---|---|---|
| `calculateBuildingPenalty`(5% applyRate·5년·85㎡ 게이트) | ✅ 있음 | `lib/tax-engine/transfer-tax-rate-calc.ts:51-87` |
| penalty → 결정세액·지방소득세·totalTax 반영 | ✅ 있음 | `lib/tax-engine/transfer-tax-finalize.ts:320,323,343` |
| 양도세 AssetForm 신축 4필드(타입·초기·normalize) | ✅ 있음 | `lib/stores/calc-wizard-asset.ts` / factory / migration (조사 인용) |
| 양도세 SelfBuiltSection 부담부증여+매매취득 시 노출 | ✅ 노출됨 | `components/calc/transfer/CompanionAcqPurchaseBlock.tsx:673-689`(transferType 무관, 조사 인용) |
| 양도세 신축 4필드 body 송신·route 매핑·validate | ✅ 있음 | body 송신(조사) / `app/api/calc/transfer/route.ts:268-271`(`toOptionalDate`) / validate(조사) |
| Zod `propertyBaseShape`에 신축 4필드 | ✅ 있음(확인됨) | `lib/api/transfer-tax-schema.ts:175-178`. ⑨⑫ **신규 0** |
| Route 엔진 매핑 `constructionDate` toOptionalDate | ✅ 있음(확인됨) | `app/api/calc/transfer/route.ts:268-271`. ⑭ **신규 0** |
| 부담부증여 K-5 건물 환산취득가 자산별 독립 산출 | ✅ 있음 | `lib/tax-engine/burdened-gift-apportionment.ts:309-321`, `perAsset.building.acquisitionPrice:458` |
| **★엔진: finalize penaltyBase 게이트 결선(critical D-2 핵심)** | ❌ **추가** | `lib/tax-engine/transfer-tax-finalize.ts:313-314`가 원본 `input`(=rawInput, `transfer-tax.ts:91`)만 읽어 부담부 step override(effectiveInput) 미반영 → `penaltyBase=0`. **단일안 (a): finalize:313-314 input→effectiveInput**(D-2). (b) FinalizeArgs 전용 base 주입은 SCOPE OUT |
| **엔진: 부담부증여 step 신축 게이트 전파** | ❌ **추가** | `lib/tax-engine/transfer-tax-burdened-gift-step.ts:50-59` override가 신축필드·`acquisitionMethod`·`estimatedBase` 미설정. **단 step 단독으로는 base 게이트 미작동 → finalize 결선 동반(위 행)** |
| **엔진: K-5("converted")를 estimated로 인식** | ❌ **추가** | `acquisitionMethod` enum에 `"converted"` 부재(`lib/tax-engine/types/transfer.types.ts:252`). step override에서 매핑 |
| **엔진: general_building route-helper 부담부 건물카드** | ❌ **추가** | `app/api/calc/transfer/general-building-route-helper.ts:538-543` `usedEstimatedAcquisition:false, estimatedBase:0` 하드코딩 → 건물카드 미발동. `lib/tax-engine/general-building-valuation.ts:679-693` 비-부담부 설정 mirror |
| 증여세 BurdenedGiftTransferTaxInput 신축 4필드 | ❌ **추가** | `lib/tax-engine/types/inheritance-gift-estate.types.ts:571-686`(현재 없음) |
| 증여세 UI 신축 위젯·initial·normalize·validate·API변환·결과카드 Row | ❌ **추가** | 아래 §6.3 |

---

## 5. 핵심 설계결정

### D-1. 건물분 base 배선 = `perAsset.building.acquisitionPrice` (안분 후, 양도분)
§2.3 법령 결론 일치. `burdened-gift-apportionment.ts:458`이 이미 보유. 별도 산출 불요. land(`:448`)는 §114의2 대상 아니므로 제외.

### D-2. K-5 신축 penalty 활성화 = finalize penaltyBase 게이트 결선 (★critic 재작성 — step override 단독으로는 미작동, 코드 실측)

**★ critic 실측 결론(2026-06-21): step override만으로는 penalty가 영구 미발동한다.** 코드 흐름을 직접 검증한 사실:

- `lib/tax-engine/transfer-tax-finalize.ts:313`: `const isEstimatedMode = input.useEstimatedAcquisition || input.usedEstimatedAcquisition` — 여기 `input`은 **원본 rawInput**(`lib/tax-engine/transfer-tax.ts:91`)이지 effectiveInput/workingInput이 아니다.
- `lib/tax-engine/transfer-tax-finalize.ts:314`: `effectiveEstimatedBase = estimatedBase || (input.usedEstimatedAcquisition ? input.estimatedBase : 0)`.
- `lib/tax-engine/transfer-tax-finalize.ts:315-317`: `penaltyBase = input.acquisitionMethod === "appraisal" ? appraisalValue : (isEstimatedMode ? effectiveEstimatedBase : 0)`.
- `lib/tax-engine/transfer-tax-finalize.ts:318`: `calculateBuildingPenalty(effectiveInput, penaltyBase)` — **게이트(isSelfBuilt 등)는 effectiveInput에서 읽지만, base(penaltyBase)는 위 `input`(원본) 기준**.
- finalize 호출은 `lib/tax-engine/transfer-tax.ts:672`(`finalizeTransferTax({ input, effectiveInput, steps, ... })`). `FinalizeArgs`(`transfer-tax-finalize.ts:41-46`)는 **`input`·`effectiveInput`만 보유 — `rawInput` 필드 없음**(finalize에 rawInput은 전달되지 않는다). 즉 finalize에서 참조 가능한 것은 `effectiveInput`(=step override 반영됨)과 `input`(override 미반영)뿐. finalize:313-314는 penaltyBase 산정에 `input`만 읽고, 게이트(`calculateBuildingPenalty`)에는 `effectiveInput`을 쓴다. (transfer-tax.ts:336은 `handleMultiParcelBranch(...)` 호출로 finalize 호출이 아님.)
- `lib/tax-engine/transfer-tax-burdened-gift-step.ts`의 STEP 0.48 override는 **`workingInput` 새 객체만** 만들고 **원본 `input`을 바꾸지 않는다**.

→ 부담부증여는 `input.useEstimatedAcquisition === false`, `input.usedEstimatedAcquisition` 미설정 → `isEstimatedMode === false` → `penaltyBase === 0` → `penalty = floor(0 × 0.05) === 0`. **증여세 §114의2 영구 미발동.** A경로(증여세 탭의 유일 경로 — 증여 부담부증여는 land/housing/building만, general_building 미사용)에서 plan 구버전대로 구현하면 anchor-1(현행 0 → 수정 후 >0)이 통과하지 않는다.

**정정된 설계 방향 (★ Simplicity First — 단일안 (a) 확정, 코드 독해로 결정)**: 올바른 활성화는 **finalize의 penaltyBase 게이트(`finalize.ts:313-318`)가 부담부증여 신축 케이스를 인식하도록 결선**해야 한다. enum 확장은 ⑨⑩⑫·전 세목 Zod·일반 양도세 경로 전부 파급이므로 회피한다. 후보를 anchor가 끝날 때까지 동시 유지하지 않는다 — **코드 독해만으로 (a)가 최소 변경임이 이미 결정**되므로 (a) 단일안으로 확정하고 (b)는 SCOPE OUT한다:

- **(a) finalize 게이트 확장 [확정]**: `finalize.ts:313-314`의 `isEstimatedMode`·`effectiveEstimatedBase` 산정을 `input` → `effectiveInput`으로 변경(step override가 effectiveInput=workingInput에 설정한 `usedEstimatedAcquisition:true`+`estimatedBase`를 finalize가 읽게 함). **이미 finalize:313-314는 `input.usedEstimatedAcquisition`/`input.estimatedBase`를 읽는 established pattern**(aggregate 경로: `general-building-valuation.ts:685-686`이 card에 `usedEstimatedAcquisition:true`+`estimatedBase` 설정 → `cardToItemInput` → 단건 `input` → finalize:313 분기로 §114의2 발동 중). step override가 effectiveInput에 동일 필드를 설정하면 이 기존 패턴과 정확히 동형이다. **일반 양도세 단건 경로 회귀는 anchor·전체 vitest로 검증** — aggregate 경로는 `effectiveInput === input`이므로 input→effectiveInput 변경이 **무영향**임을 §6.1에 명시.
- **(b) FinalizeArgs 전용 base 주입 [SCOPE OUT]**: 신규 전용 필드 + `transfer-tax.ts:672` `finalizeTransferTax` 호출부 주입 + finalize 분기 추가로 순수 더 많은 코드(speculative flexibility) → Simplicity First 위반으로 제거. **단 이는 FinalizeArgs 전용 base 주입안(b)만 SCOPE OUT이라는 뜻이며, `transfer-tax.ts:385-404` pb0 조기반환 경로 결선(§6.1 파일2·mustFix 1)은 별개로 본 작업 범위**(input→effectiveInput 치환만)이다.

**step override(`transfer-tax-burdened-gift-step.ts`)의 역할**: 신축 게이트 값(`isSelfBuilt`/`buildingType`/`constructionDate`/`extensionFloorArea`)을 effectiveInput에 전파하여 `calculateBuildingPenalty`의 게이트(`rate-calc.ts:55-78`)를 통과시키고, **base 결선을 위해 effectiveInput(=workingInput)에 `usedEstimatedAcquisition:true`+`estimatedBase=building.acquisitionPrice`를 설정**(aggregate card 패턴 mirror). **단 step override만으로는 base 게이트(finalize:313-314가 `input`을 읽음)가 켜지지 않으므로, 위 (a) finalize input→effectiveInput 결선이 반드시 동반된다.** `useEstimatedAcquisition`(메인 차익 계산 트리거)은 false 유지(차익 산식은 step이 이미 안분값으로 override했으므로 변경 금지) — penalty base만 별도 결선.

→ 이유: enum 확장 회피로 Surgical 유지하되, 진짜 활성화 지점은 step override가 아니라 **finalize penaltyBase 게이트**임이 코드 독해로 확정됨. **anchor-1은 (a)/(b) 택일 도구가 아니라, (a) 적용 전(0)/후(>0) 회귀 확보 도구로 역할 한정.**

### D-3. 안분 전/후 = 안분 후
§2.3 조심2019서3934 + §159①. `perAsset.building.acquisitionPrice`가 안분 후 값(`burdened-gift-apportionment.ts:309-321` STEP4 K-5: `buildingTransferPrice`=채무액분으로 환산).

### D-4. 신축입력 양탭 — 양도세 완비, 증여세 신규
- 양도세: AssetForm·UI·송신·validate·Zod·route 매핑 전부 완비(§4). **UI/폼/변환 측 신규 0건.**
- 증여세: `components/calc/inheritance/estate-card/variants/BurdenedGiftValuationModeSection.tsx` K-5 환산 박스 내부(`isMarketMode && isConverted && !isLandType`, `:217`)에 신규 위젯 추가.

### D-5. 증축 Phase 1 SCOPE OUT
`perAsset.building.acquisitionPrice`는 건물 전체 환산취득가. §114의2 증축은 "증축부분 한정"인데 분리 미구현 → 증축 발동 시 과대 부과 위험. **Phase 1은 신축(`buildingType: "new"`)만**. 증축 부분 한정 base는 후속(§11).

### D-6. 이중 floor 회피
`calculateEstimatedAcquisitionPrice`(안분 환산)에서 1회 floor → `applyRate(base, 0.05)`(`rate-calc.ts:80`)에서 1회 floor. base를 다시 채무비율 곱하지 말 것(`perAsset.building.acquisitionPrice`가 이미 안분 후).

---

## 6. 변경 상세

### 6.1 엔진 공통 (양 탭 numeric 자동 적용)

부담부증여는 **두 진입 경로**(A: step.ts / B: general_building route-helper)가 분리되어 둘 다 수정 필요하고, **양 경로 공통으로 finalize penaltyBase 게이트 결선**(★critic — D-2)이 동반되어야 penalty가 실제 발동한다. 엔진 변경 파일 목록:

1. **`lib/tax-engine/transfer-tax-finalize.ts:313-314`** — ★penaltyBase 게이트 결선(D-2 핵심, **단일안 (a) 확정**). `isEstimatedMode`·`effectiveEstimatedBase` 산정을 `input` → `effectiveInput`으로 변경(step override가 effectiveInput에 설정한 값을 finalize가 읽게 함). step override만으로는 base가 0이므로 반드시 수정. **일반 양도세 회귀 검증 필수** — aggregate 경로는 `effectiveInput === input`이므로 input→effectiveInput 변경이 **무영향**(established pattern: general-building card가 단건 `input`을 통과하는 경우 effectiveInput===input).
2. **`lib/tax-engine/transfer-tax.ts:385-404`** — ★조기반환(`if (transferGain <= 0)`) 경로 결선(D-2 보강·mustFix 1). K-5 환산취득가가 양도가액보다 커서 **양도차익 ≤ 0인 정상 시나리오**에서도 §114조의2②("산출세액 없어도 부과", KoreanLaw MST 285523 검증)로 가산세가 부과되어야 한다. 실측: `:386-388`의 `pb0`는 finalize를 경유하지 않고 별도 penalty를 산정하는데, 원본 `input`(step override 미반영, `useEstimatedAcquisition=false`)을 읽고 `calcTransferGain(effectiveInput)`가 K-5에서 `estimatedBase=0` 반환(`transfer-tax-helpers.ts:289`) → `pb0=0` → penalty=0. **finalize(파일1)만 고쳐도 transferGain≤0 분기에서는 여전히 0이므로**, `pb0` 산정을 `input` → `effectiveInput`(+ `usedEstimatedAcquisition` 포함, finalize:313-314와 동일 로직)으로 변경한다.
3. **`lib/tax-engine/transfer-tax-burdened-gift-step.ts`** — 신축 게이트 값 + `usedEstimatedAcquisition:true`+`estimatedBase` effectiveInput 전파(A경로).
4. **`app/api/calc/transfer/general-building-route-helper.ts`** — 건물카드 estimated 설정(B경로).

> (b) FinalizeArgs 전용 base 주입안(신규 전용 필드 + `transfer-tax.ts:672` 호출부 주입 + finalize 분기 추가)은 **SCOPE OUT**(D-2·§11) — Simplicity First. **단 위 파일2(`transfer-tax.ts:385-404` pb0 조기반환 결선)는 SCOPE OUT 대상이 아니다** — (b)의 FinalizeArgs 전용 필드 주입과 무관하게, 기존 `input`→`effectiveInput` 치환만으로 §114조의2② zero-tax 경로를 켜는 mustFix이다.

#### A경로: step.ts (housing·land·building·commercial 단일슬롯) + finalize 게이트
- **`lib/tax-engine/transfer-tax-burdened-gift-step.ts:50-59`** — override 확장(D-2):
  - `isBurdenedGiftEngine && rawInput.burdenedGiftInfo`(`:24`) 분기 내, `building = transferBurdenedGiftBreakdown.perAsset.building`(`:44`) 이미 존재.
  - 신축 발동 조건: `rawInput.isSelfBuilt === true` AND `rawInput.burdenedGiftInfo.acquisitionMethod === "converted"` AND `rawInput.buildingType === "new"`(증축 SCOPE OUT).
  - 발동 시 `workingInput`(=effectiveInput) 스프레드에 추가:
    - `acquisitionMethod: "estimated"`
    - `usedEstimatedAcquisition: true`
    - `estimatedBase: building.acquisitionPrice` (토지 제외)
    - `isSelfBuilt: rawInput.isSelfBuilt`
    - `buildingType: rawInput.buildingType`
    - `constructionDate: rawInput.constructionDate`
    - `extensionFloorArea: rawInput.extensionFloorArea`
  - `useEstimatedAcquisition: false`(`:57`)는 유지(차익 산식 변경 방지).
  - **★ 단, 이 override가 설정하는 `usedEstimatedAcquisition`/`estimatedBase`는 `workingInput`(=effectiveInput)에 있고, finalize:313-314는 원본 `input`을 읽으므로 step override만으로는 base 게이트가 켜지지 않는다(D-2 실측).** 위 finalize 결선 **단일안 (a)(finalize:313-314 input→effectiveInput)**가 반드시 동반되어야 penalty가 발동한다 — anchor-1로 (a) 적용 전후 0→>0 회귀 확보.
  - **확인필요**: `rawInput.constructionDate`가 부담부증여 양도세 경로에서 채워지는지 — 양도세는 AssetForm `constructionDate`→body 최상위(조사) 송신·route 매핑(`app/api/calc/transfer/route.ts:270`) 확인됨. 증여세는 §6.3 ① 신설 후 body 최상위 송신(§6.3 ④).

#### B경로: general_building route-helper (양도세만, step.ts 미경유)

**★ mustFix 3 — 함수 스코프 정정**: 기존 plan이 인용한 `general-building-route-helper.ts:233`/`:240`(buildingAcqDate·isSelfBuilt 도출)은 **K-5 standalone/dispatch 함수 스코프**다. 부담부증여 건물카드는 **별개 함수 `calculateGeneralBuildingActualTransfer`(`:413` 함수 정의)** 내부이고, 그 건물카드(`:538-543`)는 `usedEstimatedAcquisition:false`·`estimatedBase:0` 하드코딩이며 self-built 필드는 함수 내부에 **grep 0건**이다. 진입 타입 `GeneralBuildingActualPricePayload`(`:34-61`)에 self-built 필드가 없고, 디스패처 `actualPriceMode` 분기(`:301-322`)도 self-built 필드를 forward하지 않는다. 따라서 `:233`/`:240` 인용은 제거하고 **3단계로 명시**:

- **(1) payload 타입 확장** — `GeneralBuildingActualPricePayload`(`:34-61`)에 `isSelfBuilt?`·`buildingType?`·`buildingAcquisitionCause?`·`buildingAcquisitionDate?` 필드 추가.
- **(2) 디스패처 forward** — `actualPriceMode` 분기(`:301-322`)의 `calculateGeneralBuildingActualTransfer(...)` 호출 객체에 해당 4필드를 `coercedGbRaw.*`에서 forward(기존 `acquisitionLandPricePerSqm`·`burdenedGiftInfo` forward와 동형).
- **(3) 함수 내부 도출 + 건물카드 설정** — `calculateGeneralBuildingActualTransfer` 내부에서 `isSelfBuilt = buildingAcquisitionCause === 'newConstruction'` 도출 후, 건물카드(`:538-543`, `propertyId:"building"`)에 다음 설정(기존 `usedEstimatedAcquisition:false`·`estimatedBase:0` 교체):
  - `usedEstimatedAcquisition: true`
  - `estimatedBase: perAsset.building.acquisitionPrice` (= 부담부 분기 `if (burdenedGiftInfo)`에서 도출되는 `buildingAcq`)
  - `isSelfBuilt`(위 도출)·`buildingAcquisitionDate`·`buildingAcquisitionCause`

**★ mirror 패턴(residual)**: 비-부담부 general_building 경로는 이미 `lib/tax-engine/general-building-valuation.ts:679-693`에서 `usedEstimatedAcquisition:true`·`estimatedBase`·`isSelfBuilt`(= `isSelfBuiltForCard` 엔진측 도출 변수)·`buildingAcquisitionDate`·`buildingAcquisitionCause`를 설정해 §114의2가 작동 중(인프라 패턴 존재). 부담부 건물카드는 이 설정을 그대로 mirror하되 base만 `buildingAcq`로 교체한다. **`isSelfBuiltForCard`는 엔진측(`general-building-valuation.ts`) 도출 변수이며, route-helper에서는 위 (2) payload forward로 동일 값을 확보**(엔진측 변수를 route-helper로 직접 가져오는 게 아님).

- → `cardToItemInput`(`app/api/calc/transfer/general-building-route-helper.ts:108-133`)이 자동 전달: `acquisitionMethod`(`:124` `isBuilding && card.usedEstimatedAcquisition ? "estimated" : "actual"`)·`isSelfBuilt`(`:125`)·`constructionDate`(`:127` = `card.buildingAcquisitionDate`)·`estimatedBase`(`:112` = `card.estimatedBase`). 작업자는 위 (1)~(3)만 추가하면 됨(중복 구현 금지).
- **발동 조건(residual·오발동 방지 3중 AND 게이트)**: 비-부담부 general_building+newConstruction(실지가) 및 부담부 K-4 실지에서 오발동하면 안 되므로(§114조의2① 나목 환산·감정만 적용·가목 실지 미적용, 조심2019서3934), 건물카드 estimated 설정은 **`acquisitionMethod==='converted'(K-5) AND breakdown!=null AND isSelfBuilt` 3중 AND 게이트**로 한다. K-4 실지·비-부담부 실거래가는 기존대로 `usedEstimatedAcquisition:false` 유지.
- 토지카드(`:531-536`)는 §114의2 무관 → 무변경.
- **★ SCOPE OUT(§11)**: `buildingType`/`extensionFloorArea`는 `AssetCardForAggregate` 타입·cardToItemInput(`:124-164`) 매핑에 **전파되지 않음(grep 0건)**. B경로 신축은 `buildingType` undefined로 도달 → `calculateBuildingPenalty`(`rate-calc.ts:67`) extension 분기 skip → 신축(default) 취급으로 **Phase1엔 무해**. 증축 정밀화는 후속(§11).
- **B경로는 finalize 단건 게이트(D-2)를 경유하지 않고 cardToItemInput → 자산별 item input으로 penalty가 산정**되므로(aggregate는 effectiveInput===input → finalize:313-314 무영향), D-2 finalize 결선과 별개로 위 건물카드 설정만으로 발동(anchor-3로 확인).
- **★ 변수명 통일(residual low)**: 본 plan의 약식 `breakdown`은 engine.design·route-helper의 정식 `transferBurdenedGiftBreakdown`(route-helper 부담부 분기 산출물)과 동일 대상이다. `buildingAcq`는 그 `.perAsset.building.acquisitionPrice`를 가리키는 약칭. **Do 진입 시 route-helper의 실제 로컬 변수명을 grep으로 확정(추정 금지)** — 위 약칭은 plan 가독성용이다.

#### echo 필드 — Phase1 미도입(★critic low)
- echo는 **Phase1 미도입으로 못박는다.** penalty는 이미 `TransferTaxResult.penaltyTax`(`lib/tax-engine/types/transfer.types.ts:636`)·`penaltyBase`(`:642`)로 노출되어 **결과 카드 산식 표시(⑦ `건물 환산취득가 ${penaltyBase} × 5%`)에 충분**하다. anchor-1의 base 검증(land 미포함·안분 후 1회 floor)은 엔진 직접 호출로 얻은 `breakdown.perAsset.building.acquisitionPrice`를 테스트에서 직접 비교하면 되므로 echo 불요. → §10 작업 순서에서 echo 독립 단계 삭제.

### 6.2 양도세 측 (8지점)

**신규 0건.** (§4·D-4) — AssetForm 신축 4필드·SelfBuiltSection 노출·body 최상위 송신·route 매핑(`app/api/calc/transfer/route.ts:268-271`)·validate·Zod(`lib/api/transfer-tax-schema.ts:175-178`) 전부 기존 완비.

| # | 지점 | 상태 |
|---|---|---|
| ① 폼타입 | AssetForm `isSelfBuilt`/`buildingType`/`constructionDate`/`extensionFloorArea` | ✅ 있음 |
| ② initial | factory 4필드 | ✅ 있음 |
| ③ normalize | migration 4필드 | ✅ 있음 |
| ④ API변환 | body 최상위 송신(transferType 무관) | ✅ 있음 |
| ⑤ UI위젯 | SelfBuiltSection(`components/calc/transfer/CompanionAcqPurchaseBlock.tsx:673-689`, 부담부+매매취득) | ✅ 노출 |
| ⑥ 사이드바 | 해당없음(penalty는 API 결과 후) | — |
| ⑦ 결과카드 | `TransferTaxResultView.tsx:420-421` penalty Row(★residual 확정) | 양도세 탭 부담부증여 **단건**은 `app/api/calc/transfer/route.ts:765` `calculateTransferTax` 단건 호출 → 결과는 일반 `TransferTaxResultView` 경유(증여세 탭의 `BurdenedTransferTaxResultCard`와 다름). **일반 양도세 penalty Row는 이미 `TransferTaxResultView.tsx:420-421`에 존재**(`{result.penaltyTax > 0 && <Row label="환산가액적용가산세 (§114조의2)" … />}`, 실측 확인) → **양도세 ⑦ 신규 0건 확정.** E2E selector는 `TransferTaxResultView` 기준 |
| ⑧ validate | `acquisitionCause === "purchase"` 게이트 | ✅ 있음 |
| ⑨~⑭ | Zod `lib/api/transfer-tax-schema.ts:175-178`·route `app/api/calc/transfer/route.ts:268-271` | ✅ 있음 |

→ 양도세 측은 **엔진 A·B경로 + finalize 결선(D-2) + 조기반환 결선(transfer-tax.ts:385-404) 수정만으로 numeric 발동**. 결과뷰 penalty Row는 `TransferTaxResultView.tsx:420-421` 기존 Row 경유 확정(실측) → 양도세 ⑦ 신규 0건 확정.

### 6.3 증여세 측 (14지점)

**★ critic(high): 모든 file:line은 repo-root 기준 절대경로 prefix.** (동명 파일 혼동 방지 — 예: `lib/calc/transfer-tax-api-burdened-gift.ts` vs `lib/calc/gift-burdened-transfer-api.ts` 2개 존재.)

| # | 지점 | file:line (repo-root 절대경로) | 작업 |
|---|---|---|---|
| ① 폼타입 | `lib/tax-engine/types/inheritance-gift-estate.types.ts:571-686` | `isSelfBuilt?: boolean` / `buildingType?: "new" \| "extension"` / `constructionDate?: Date` / `extensionFloorArea?: number` 4필드 추가. 주석: **엔진 propertyType housing·building 전용**(폼 카테고리 `real_estate_apartment`→housing·`real_estate_building` 주택→housing/비주택→building), **land 제외**(§114의2①은 건물 신축·증축 — 주거용·비주거용 불문) |
| ② initial | `components/calc/inheritance/estate-card/variants/BurdenedGiftTransferSection.tsx:57` (`createEmptyBgt`) + `hasData:73` | 4필드 `undefined` 초기값 + hasData OR 조건 추가 (경로 Do 중 실측 확정) |
| ③ normalize | `components/calc/inheritance/normalize-restored-form-dates.ts:85-99`(`normalizedAcq` 확인됨) | **`toOptionalDate(bgt.constructionDate)`** (`normalizedAcq` 패턴 동형, Date 침묵함정) |
| ④ API변환 | `lib/calc/gift-burdened-transfer-api.ts:153-218` | body **최상위** 신축 필드(시가모드 한정 spread) — `burdenedGiftInfo` 객체 아님. 엔진 step override가 `workingInput`(=body 최상위 TransferTaxInput 필드)에서 읽음. `capitalExpenditure`/`transferExpense`가 최상위(`:205-206`)인 것과 동일. **Phase1은 3필드(isSelfBuilt·buildingType·constructionDate) 매핑**(extensionFloorArea는 Phase2 — extension disabled로 Phase1엔 미입력, UI 설계 §13). 타입(①)은 4필드 선언·매핑(④⑬)은 3필드. **④와 ⑬은 동일 위치**(critic medium ⑬/④ — 아래 ⑬ 참조) |
| ⑤ UI위젯 | `components/calc/inheritance/estate-card/variants/BurdenedGiftValuationModeSection.tsx:217`(`isMarketMode && isConverted`) | `!isLandType` 추가 게이트 → `isSelfBuilt` ToggleCard(amber) + `buildingType` RadioCardGroup(new만; extension은 Phase1 disabled) + `constructionDate` DateInput. 양도세 SelfBuiltSection 패턴 차용. **★ 위젯은 ValuationModeSection K-5 박스(`:217`)에 `!isLandType` 게이트로 1회만 추가 → `BurdenedGiftTransferSection.tsx:251` land 인라인(isLandType=true)에서는 자동 미노출, HousingFieldSet(`:459`)·NonHousingFieldSet(`:654`)(둘 다 isLandType=false)에서 모두 노출됨. §114의2는 "건물" 신축이므로 주거용 건물(housing)도 대상 — HousingFieldSet 경유에서도 위젯이 떠야 함.** |
| ⑥ 사이드바 | — | 해당없음(부담부증여 양도세는 별도 API 결과로 GiftTaxResultView 주입, 증여세 사이드바는 본세만) |
| ⑦ 결과카드 | `components/calc/results/BurdenedTransferTaxResultCard.tsx` — **2지점**: (1) exported wrapper `BurdenedTransferTaxResultCard`(props `transferTaxResults: TransferTaxResult[]`, `:227-230`) (2) 내부 Row sub-component(`result: TransferTaxResult`, `:63`)의 Row 영역(`:136` 결정세액 ~ `:141` 지방소득세) | Row sub-component(`:63`~)에서 `result.penaltyTax > 0` Row 삽입(결정세액 `:136`과 지방소득세 `:137-141` 사이) + 상세 산식 `건물 환산취득가 ${penaltyBase} × 5%`(기존 `penaltyBase` 필드, `transfer.types.ts:642`). `totalTax`(`:142-145`)는 이미 penalty 포함(`finalize.ts:343`). **지방소득세 base 정합 표시 — ⑦ 보강 참조(critic low)** |
| ⑧ validate | `components/calc/gift-tax-form-shared.tsx`(`validateStep:246`, `isMarketMode` 블록 `:302-322` 확인됨) | (a) `isMarketMode && acquisitionMethod === "converted" && propertyType !== "land" && isSelfBuilt === true` 시 `buildingType` 미선택 차단·`constructionDate` 필수 차단(자동 fallback 금지). extension은 Phase1 미노출이므로 extensionFloorArea 차단 불요. (b) **★mustFix 2 — 건물 양도시 기준시가 0-base 침묵 차단**: 현행 K-5 converted 검사(`:318`)는 `propertyType==='land'`의 `landStdPriceAtTransfer`만 검사하고 building/housing 분모는 미검사 → 사용자가 건물 양도시 기준시가를 비우면 0 → `buildingAcquisitionPrice=0` → `penaltyBase=0` → penalty 침묵 미발동(자동 fallback 금지 정책 위반). 따라서 `isMarketMode && acquisitionMethod === "converted" && propertyType !== "land" && isSelfBuilt === true` 시 **`item.standardPrice > 0` 필수 차단**(현행 land-only 검사와 대칭). 검증 대상 필드는 `item.standardPrice`(= 양도시 건물 기준시가, K-5 환산 분모) — **`bgt.buildingStdPriceAtTransfer` 아님**(해당 필드는 타입에 부재). 근거: 소령 §176의2②2호(분모 0이면 환산 정의불가) |
| ⑨ Zod enum 메인 | `lib/api/transfer-tax-schema.ts:175-178`(4필드 확인됨) | **0건(확인완료)** — propertyBaseShape에 이미 존재 |
| ⑩ Zod enum 컴패니언 | 동상 | **0건** — 신규 enum 없음(buildingType enum 재사용) |
| ⑪ acqDate fallback | — | **0건** — 신축필드 무관 |
| ⑫ Zod 입력객체 | `lib/api/transfer-tax-schema.ts:175-178` (propertyBaseShape) | **0건(확인완료)** — body 최상위 배치 시 propertyBaseShape spread로 양 스키마 수용 |
| ⑬ body spread | `lib/calc/gift-burdened-transfer-api.ts:177-218` (= ④ 동일 위치) | 명시 매핑 추가(spread 아님 → 신규 필드 누락 시 TS 미감지·침묵 strip. grep 자가점검). **Phase1 3필드(isSelfBuilt/buildingType/constructionDate) 매핑**(extensionFloorArea는 Phase2). propertyBaseShape Zod(:175-178)가 4필드 모두 수용. 단 critical D-2 활성화는 ⑬(body)로 해결 불가 — 아래 별도 리스크 참조 |
| ⑭ Route 매핑+Date | `app/api/calc/transfer/route.ts:268-271`(확인됨) | **0건(확인완료)** — `isSelfBuilt`(`:268`)·`buildingType`(`:269`)·`constructionDate: toOptionalDate`(`:270`)·`extensionFloorArea`(`:271`) 이미 매핑. 부담부증여도 동일 body 경유 |

**증여세 측 실제 신규 작업: ①②③④⑤⑦⑧ (7지점).** ⑨⑩⑪⑫⑭ 0건, ⑥ 해당없음, ⑬=④와 동일 위치.

**★ critic(medium ⑬/④) — 활성화 메커니즘 ≠ body 점검**: critical D-2의 penalty 활성화(§5·§6.1)는 ⑬ body에 `usedEstimatedAcquisition`/`estimatedBase`를 넣는 것으로 **해결 불가**다. 실측: 이 두 필드는 `lib/api/transfer-tax-schema.ts` Zod에 **미정의**이고 `app/api/calc/transfer/route.ts` 엔진 매핑에도 **미매핑** → body로 보내도 strip된다. 따라서 진짜 활성화는 **엔진 내부(finalize penaltyBase 게이트 결선 + transfer-tax.ts:385-404 조기반환 결선, §5 D-2 단일안 (a): finalize:313-314 input→effectiveInput)로만 해결**되며, ⑬은 신축 게이트 필드(isSelfBuilt 등 Phase1 3필드) 누락 방지 용도로만 한정한다.

**★ critic(low) — ⑦ 지방소득세 base 정합 표시**: `BurdenedTransferTaxResultCard`의 Row는 `result.determinedTax`(가산세 **전**, `finalize.ts:335`)를 "결정세액"으로 표시하고 바로 다음 행이 지방소득세(`:137-141`)다. 그러나 지방소득세는 `determinedTaxWithPenalty × 10%`(= 결정세액+가산세, `finalize.ts:323`)로 산정되므로, penalty Row를 결정세액↔지방소득세 사이에 끼워넣을 때 둘 중 하나로 정합을 표시한다(결과뷰 산식 한국어 풀어쓰기 정책 준수):
- (i) penalty Row 산식/주석에 **"지방소득세 = (결정세액 + 가산세) × 10%"** 명시, 또는
- (ii) **"총결정세액(결정세액 + 가산세)" 중간 행**을 추가하여 지방소득세 base를 명시.

이로써 사용자가 지방소득세가 표시된 결정세액의 단순 10%와 불일치한다고 오인하는 것을 차단한다.

---

## 7. Pre-Do anchor 계획

[pre-do-anchor-verification] — Do 진입 전 핵심 anchor 1~2건 우선 실행하여 디자인 환류.

### ★ anchor-1 (가장 먼저 작성·실행 — 활성화 결선 지점 실측 확정): 부담부증여 K-5 신축 건물 5% 가산세
- **이 anchor를 §10 작업 순서의 1번으로 가장 먼저 작성·실행해, D-2 활성화 결선이 finalize penaltyBase 게이트(`finalize.ts:313-314`)에 있음을 실측 확정한다.** step override(workingInput) 단독 적용 시 penalty가 여전히 0임을 먼저 재현하고, finalize 단일안 (a)(input→effectiveInput) 적용 후 >0으로 바뀌는 회귀(0→>0)를 직접 관찰하여 확보한다. (anchor는 (a)/(b) 택일 도구가 아니라 (a) 적용 전후 회귀 확보 도구 — D-2.)
- 입력(엔진 직접 호출, `__tests__/tax-engine/transfer/burdened-gift-penalty.test.ts` 신설):
  - `transferType: "burdened_gift"`, `propertyType: "building"`(또는 housing)
  - `burdenedGiftInfo`: K-5 환산(`acquisitionMethod: "converted"`, `marketValueAtTransfer`·기준시가 4종·인수채무)
  - `isSelfBuilt: true`, `buildingType: "new"`, `constructionDate`=양도일 5년 이내, `transferDate >= 2018-01-01`
- **현행 기대(실패 확보)**: `result.penaltyTax === 0` (미발동 실증 — §1.1 원인 + D-2 finalize:313-314 base=0 게이트).
- **중간 검증(step override만 적용한 상태)**: penalty가 **여전히 0**임을 확인 → step override 단독으로는 base 게이트가 안 켜진다는 D-2 실측을 anchor로 고정.
- **수정 후 기대(finalize 단일안 (a) input→effectiveInput 적용)**: `result.penaltyTax === applyRate(breakdown.perAsset.building.acquisitionPrice, 0.05)`, 그리고 base가 land 미포함(토지분 환산취득가 × 5% ≠ penaltyTax).

### anchor-2: 5년 초과 미발동 + land 무관 + transferGain≤0 zero-tax 발동
- 케이스 A: `constructionDate`=양도일 5년 초과 → `penaltyTax === 0`(게이트 `rate-calc.ts:77-78`).
- 케이스 B: land 단일슬롯 K-5 신축 입력(비현실이나 방어) → `penaltyTax === 0`(토지 무관).
- **케이스 C(transferGain≤0 zero-tax — mustFix 1)**: 부담부 K-5 신축 건물 + 환산취득가가 양도가액보다 커 **양도차익 ≤ 0**(손실/0), 5년 이내. 양도차익>0 & 산출세액=0 케이스도 동치(§114조의2②). → `penaltyTax === applyRate(perAsset.building.acquisitionPrice, 0.05) > 0` (transfer-tax.ts:385-404 조기반환 경로 결선 후 — 산출세액 없어도 부과). **조기반환 경로 미결선 시 이 케이스는 0(회귀 실증 단계 → finalize만 고쳐선 미발동 확인).**

### anchor-3: general_building(B경로) 건물카드 발동 + 회귀 3종
- `propertyType: "general_building"` + 부담부증여 + 건물 newConstruction + K-5 → aggregate `penaltyTax > 0`, base = 건물카드 `estimatedBase`(토지카드 제외).
- **회귀 1(residual)**: 비-부담부 실거래가 general_building + newConstruction → `penaltyTax === 0`(실지=§97①1호가목, 환산 아님 → §114의2 비대상, 실지가 가산세 오부과 방지).
- **회귀 2(residual)**: 부담부증여 general_building K-4 실지 + 신축 → `penaltyTax === 0`(K-4=§97①1호가목, 환산 아님).
- **회귀 3(residual)**: 일반 양도세(비-부담부) 신축 K-5 → 기존 `penaltyTax` 불변(finalize input→effectiveInput 변경 무영향 — effectiveInput===input).

anchor-1을 **가장 먼저** 작성·실행하여 (1) 현행 0 확인, (2) step override 단독 시 여전히 0 확인, (3) finalize penaltyBase 게이트 단일안 (a)(input→effectiveInput) 적용 시 >0으로 통과(0→>0 회귀 확보) → 디자인(D-2 활성화 결선 지점) 환류.

---

## 8. 테스트 (단위·통합·E2E 양탭)

### 8.1 단위 (엔진)
- `burdened-gift-penalty.test.ts`(신설): anchor-1·2·3 + 경계.
  - 신축 5년 이내 K-5 → penalty = building.acquisitionPrice × 5%(floor 1회, [feedback_pdf_example_test_anchoring] 원단위 toBe).
  - 5년 초과 → 0. K-4 실지 → 0. 표준 K-1~3 → 0. land → 0. isSelfBuilt=false → 0.
  - 이중 floor 회피 검증(D-6): base가 안분 후 1회 floor된 값 그대로.
  - **transferGain≤0 zero-tax(anchor-2 케이스 C·mustFix 1)**: 환산취득가가 양도가액보다 커 양도차익≤0 → penalty>0(§114조의2② 산출세액 없어도 부과). 조기반환 경로 미결선 시 0 회귀 실증.
  - **회귀 3종(anchor-3·residual)**: 비-부담부 실거래가 general_building+newConstruction → 0 / 부담부 general_building K-4 실지 → 0 / 일반 양도세 신축 K-5 penaltyTax 불변.

### 8.2 통합 (route)
- 양도세 route: 부담부증여 + 매매취득 + 신축 + K-5 → `penaltyTax > 0`, `totalTax`에 penalty + 지방소득세 10%(가산세 포함분) 반영.
- general_building route: B경로 aggregate penalty.

### 8.3 E2E (양 탭)
- 양도세 탭 `e2e/transfer-burdened-gift-penalty.spec.ts`(신설): 부담부증여 → 매매취득 → 신축 토글 ON → buildingType new → constructionDate → K-5 → 계산 → 결과뷰 가산세 Row assert.
- 증여세 탭 `e2e/gift-burdened-transfer-penalty.spec.ts`(신설): 부담부증여 자산 모달 → K-5 시가모드 → 신축 위젯 ON → constructionDate → 계산 → BurdenedTransferTaxResultCard 가산세 Row assert.
  - E2E 함정: 모달 닫기(backdrop)·자산명 필수·getByLabel 오매칭(textbox role 한정) — [project_stock_item_table_modal_plan] 패턴 준수.

---

## 9. 리스크·함정

1. **numeric 영향 0 위험** [feedback_numeric_impact_verify_before_bug_claim]: 증여세 UI/API만 추가하고 엔진(§6.1 A·B) 미머지 시 penalty=0. **엔진 PR과 동시 머지 필수.**
2. **③ normalize 침묵 함정** [feedback_engine_result_map_json_loss 류]: `constructionDate`가 신규 Date 필드 — sessionStorage 복원 시 `toOptionalDate` 누락하면 `addYears(string, 5)`(`lib/tax-engine/transfer-tax-rate-calc.ts:77`) 오동작·TS 미감지. `components/calc/inheritance/normalize-restored-form-dates.ts:85-99` `normalizedAcq` 패턴 동형으로 반드시 추가.
3. **이중 floor** [feedback_floor_residual_absorption / D-6]: base를 다시 채무비율 곱하지 말 것. `perAsset.building.acquisitionPrice`가 이미 안분 후.
4. **enum 확장 유혹 회피**: `"converted"`를 transfer enum/Zod에 추가하면 14지점·전 세목 파급. step override 국소 매핑 고수(D-2).
5. **자동 fallback 금지** [feedback_no_silent_apportion_fallback]: ⑧ validate에서 신축 ON 시 buildingType/constructionDate 미입력=차단. UI 통과↔validate 차단 모순 점검.
5b. **★ 건물 양도시 기준시가 0-base 침묵 미발동(mustFix 2)** [feedback_no_silent_apportion_fallback]: 현행 K-5 converted validate(`gift-tax-form-shared.tsx:318`)는 land의 `landStdPriceAtTransfer`만 검사 → building/housing 양도시 기준시가(`item.standardPrice`) 미입력 시 0 → `buildingAcquisitionPrice=0` → `penaltyBase=0` → penalty 침묵 미발동. ⑧에 `isMarketMode && acquisitionMethod==='converted' && propertyType!=='land' && isSelfBuilt===true` 시 `item.standardPrice>0` 필수 차단(land-only 검사와 대칭). 검증 필드는 `item.standardPrice`(`bgt.buildingStdPriceAtTransfer` 부재). 근거: 소령 §176의2②2호.
6. **useEffect store 미러링 금지** [feedback_useeffect_store_mirror_forbidden]: 신축 위젯 cross-field(buildingType OFF 시 constructionDate clear 등)는 onChange `set()`로. display fallback prop 사용, useEffect 금지.
7. **증축 base 부정확 위험** [D-5]: `perAsset.building.acquisitionPrice`=건물 전체. 증축 "증축부분 한정"(§114의2①) 미구현 → 증축 발동 시 과대 부과. **Phase1 신축만으로 차단**(buildingType RadioCardGroup에서 extension disabled).
8. **14지점 ⑬ 누락** [feedback_explicit_prop_mapping_strip]: `gift-burdened-transfer-api.ts`는 명시 매핑(spread 아님) → 신규 필드 누락 시 TS 미감지·침묵 strip. grep 자가점검 필수(Phase1 3필드: isSelfBuilt·buildingType·constructionDate).
9. **★ A경로 활성화는 step override 단독으로 미작동(critical D-2)**: `finalize.ts:313-314`의 penaltyBase 게이트는 원본 `input`(= `transfer-tax.ts:91` rawInput)을 읽고, step override는 `workingInput`(=effectiveInput)만 바꾸므로 step override만으로는 `isEstimatedMode=false`·`penaltyBase=0` → penalty 영구 0. **반드시 finalize penaltyBase 게이트 결선(D-2 단일안 (a): finalize:313-314 input→effectiveInput)이 동반되어야 발동.** `useEstimatedAcquisition`(차익 트리거)은 false 유지. anchor-1로 (a) 적용 전(0)/후(>0) 회귀 확보 + 일반 양도세 회귀 검증(aggregate는 effectiveInput===input이라 무영향).
10. **양도세 결과뷰 penalty Row 경유** [확정·★critic medium]: 양도세 탭 부담부증여 단건은 `app/api/calc/transfer/route.ts:765` 단건 → 일반 `TransferTaxResultView` 경유, 증여세는 `components/calc/results/BurdenedTransferTaxResultCard.tsx`(Row sub-component `:63`) 경유. ⑦ 표시 지점 2뷰 분리. E2E selector는 각 뷰 기준 확정. 남은 실측은 일반 양도세 penalty Row가 `TransferTaxResultView`에 기존 표시되는지뿐.

---

## 10. 작업 순서 (시퀀셜 verify)

```
1. ★Pre-Do anchor-1 작성·실행 → verify: penaltyTax === 0 (현행 실패 확보) + step override만으로도 여전히 0 (D-2 실측)
2. 엔진 A경로: finalize penaltyBase 게이트 결선(D-2 단일안 (a): finalize:313-314 input→effectiveInput) + **transfer-tax.ts:385-404 pb0 조기반환 경로 결선(input→effectiveInput + usedEstimatedAcquisition 포함·mustFix 1)** + step.ts override 수정(usedEstimatedAcquisition:true+estimatedBase 전파) → verify: anchor-1 penaltyTax > 0, base = building only, 일반 양도세 회귀 0
3. anchor-2(5년 초과·land·**transferGain≤0 zero-tax 케이스 C**) 작성·실행 → verify: A·B=0, C=penalty>0
4. 엔진 B경로(mustFix 3 — payload 타입 확장 + 디스패처 forward + `calculateGeneralBuildingActualTransfer:413` 내부 isSelfBuilt 도출 + 건물카드 mirror, `general-building-valuation.ts:679-693` mirror·K-5+breakdown+isSelfBuilt 3중 AND) 수정 + anchor-3(+회귀 3종) → verify: general_building penalty > 0, 비-부담부 실거래가·K-4 실지 = 0
5. 증여세 ① 폼타입 4필드(타입 선언) → verify: tsc 0
6. 증여세 ②initial ③normalize → verify: normalize에 constructionDate toOptionalDate (grep)
7. 증여세 ④⑬ API 변환(body 최상위 Phase1 3필드 isSelfBuilt·buildingType·constructionDate, 동일 위치) → verify: grep 3필드 + tsc 0
8. 증여세 ⑤ UI 위젯(!isLandType && isConverted) → verify: 렌더
9. 증여세 ⑧ validate(buildingType·constructionDate + **`item.standardPrice>0`** 차단·mustFix 2) → verify: 신축 ON + 미입력 차단 / UI 통과↔validate 모순 없음
10. 증여세 ⑦ 결과카드 penalty Row(Row sub-component + 지방소득세 base 정합 표시) → verify: penaltyTax>0 표시
11. E2E 양 탭 작성·실행 → verify: 두 spec 통과
12. npx tsc --noEmit / npx vitest run __tests__/tax-engine/transfer/ / npm test 전체 → verify: 0건·통과
13. 14지점 ⑫⑬⑭ grep 자가 점검 → verify: 누락 0
```

---

## 11. SCOPE OUT

- **D-2 (b) FinalizeArgs 전용 base 주입안**: 신규 전용 필드 + `transfer-tax.ts:672` 호출부 주입 + finalize 분기 추가로 (a)보다 순수 더 많은 코드(speculative). **단일안 (a)(finalize:313-314 input→effectiveInput)로 확정**(D-2·§6.1). (b)의 **FinalizeArgs 전용 필드 주입**(`transfer-tax.ts:672` 호출부)은 본 작업 비대상. **단 `transfer-tax.ts:385-404` pb0 조기반환 경로의 input→effectiveInput 치환(mustFix 1·§6.1 파일2)은 본 작업 범위** — (b)의 전용 필드 주입과 무관한 기존 변수 치환이다.
- **증축(extension) 부분 한정 base**: `perAsset.building.acquisitionPrice`가 건물 전체 → "증축부분 한정"(§114의2①) 미충족. Phase1은 신축만. 증축 부분 환산취득가 분리는 후속.
- **B경로 `buildingType`/`extensionFloorArea` 미전파(★critic medium)**: `AssetCardForAggregate` 타입·`cardToItemInput`(`app/api/calc/transfer/general-building-route-helper.ts:124-164`) 매핑에 `buildingType`/`extensionFloorArea`가 **전혀 전파되지 않음(grep 0건)**. B경로 신축은 `buildingType` undefined → `calculateBuildingPenalty`(`rate-calc.ts:67`) extension 분기 skip → 신축(default) 취급. **Phase1 신축만이라 무해**. 증축 정밀화 시 B경로 카드 타입·매핑 확장 필요(후속).
- **감정가액(appraisal) 경로**: 증여세 부담부증여는 K-4 actual/K-5 converted만(감정 enum 없음). §114의2 감정가액 5%는 증여 탭 비대상. 감정가액 2020.1.1 게이트도 양·증여 부담부 모두 비경유(§2.2·§12-3 본 작업 비대상 확정).
- **양도세 general_building 일반(비-부담부) 경로의 토지+건물 합산 base 정밀도**: 기존 동작·본 작업 무관(별도 갭). `calcTransferGain`이 토지+건물 합산 `estimatedBase` 반환(조사). 부담부 경로만 `perAsset.building.acquisitionPrice`로 토지 제외 보장.
- **2020.1.1 증축 시행일 부칙 재검증**: 증축 Phase1 SCOPE OUT → 본 작업 영향 없음. **후속 증축 PR에서 KoreanLaw 연혁 MST로 검증(이관)**.
- **§159① 안분 계산식 원문 수식 검증**: 엔진 `burdened-gift-apportionment.ts` 기구현이라 영향 없음(§2.2 확인필요). base 선택만 결선.
- **이력 자동저장/PDF 별지 서식의 penalty 칸**: 본 작업은 결과카드 표시까지. 신고서 양식 칸 반영은 후속.

---

## 12. 미해결 질문 (확인필요 — Do 중 실측)

1. **양도세 부담부증여 `rawInput.constructionDate` 채워짐 확인**: 양도세 AssetForm `constructionDate`→body→`app/api/calc/transfer/route.ts:270`까지는 확인됨. step.ts `rawInput`에 도달하는지 anchor로 실측(A경로 신축 게이트 전제).
2. **양도세 결과뷰 penalty Row 표시 경로**(⑦) — **확정(★critic medium)**: 양도세 탭 부담부증여 단건은 `app/api/calc/transfer/route.ts:765` `calculateTransferTax` 단건 → 일반 `TransferTaxResultView` 경유. 증여세 탭은 `components/calc/results/BurdenedTransferTaxResultCard.tsx`(Row sub-component `:63`) 확정. 남은 실측은 일반 양도세 penalty Row가 `TransferTaxResultView`에 기존 표시되는지뿐(존재 시 양도세 ⑦ 신규 0건).
3. **2020.1.1 감정가액 게이트 — 본 작업 비대상 확정(★critic low)**: 감정가액(`appraisal`) 게이트는 증여 부담부(appraisal enum 부재)·양도세 신축(本 PR 신축만) 모두 비경유. **증축 2020.1.1 시행일 부칙은 후속 증축 PR로 이관**(KoreanLaw 연혁 MST 검증).
4. **§159① 안분 계산식 원문 수식**: 재결 본문 표 처리로 미노출. 엔진 기구현이라 base 선택만 결선(영향 없음).
