# 겸용주택 주택분 기준시가 분할: 뺄셈 → 비례 (S3-2) — 엔진 설계 + Pre-Do anchor

> 작성 2026-10-06 · 브랜치 `fix/mixed-use-housing-std-proportional` · 워크트리 `Property-related-Taxes-s32` (base `eeb0ea719`)
> **소스 수정 없음** — 산출물 = 이 문서 + anchor `__tests__/api/transfer.route.mixed-use-housing-std-proportional.s3-2.predo.anchor.test.ts`.

## §0 요약

**결정(권고)**
1. **분할 방식**: 겸용 주택분의 토지·건물 기준시가 분할을 뺄셈 `H − 가목`에서 **비례 `floor(H × 가목 ÷ (가목 + 나목))`(건물 = H − 토지분, 잔액 흡수)** 로 — S3-1 공용 leaf `apportionByStdPrice`(`std-price-apportion.ts:20-24`) 재사용. 양도시·취득시 모두.
2. **신규 입력 2개**: `acquisitionStandardPrice.housingBuildingPrice`·`transferStandardPrice.housingBuildingPrice`(공용 타입 `MixedUseStandardPrice`에 optional 1필드). 필수 술어는 **엔진 leaf 1곳**(`lib/tax-engine/mixed-use-housing-std.ts` 제안)을 엔진·⑫·④·⑤·⑧이 공유. **PHD·용도변경(상가→주택, 취득측)은 요구하지 않는다.**
3. **소비 지점**(§1): 변수 `acqLandStd`·`transferLandStd`는 전부 「그 파트의 기준시가 값(basis)」 한 의미로 통일(원값 가목·나목은 `stdSplit` echo에만). 바꾸지 않는 곳 = 개산공제 3%·합계 보존, 12억 안분, 주택:상가 안분(H), 환산 분자·분모(H_A/H_T). **PHD 경로에 숨은 뺄셈 1곳**(단서 양도비 안분 축, `housing.ts:129-133`)을 발견 — 신규 입력 없이 PHD 자체 양도시 분할로 교체 권고(Q-C).
4. **B0(§2)**: 권고 β — 토지분은 토지 취득일 가목 **원값 유지**, 건물분만 `H − floor(H × L_b ÷ (L_b + N_b))`(L_b = 건물 취득일 공시지가, N_b = 건물 취득일 나목). `landPricePerSqmAtBuildingAcq`는 「뺄셈 감수」 → 「비례 분모의 가목」으로 역할만 바뀌고 필수 술어는 불변. β는 N = H − L_b일 때 현행 B0와 **1원까지 동일**.
5. **세액 영향의 정체(§4)**: 같은 취득일·같은 보유기간이면 분배만 바뀌고 세액 ±1원. 크게 움직이는 곳은 **배율초과(NBL) 토지분 몫**(가상 픽스처에서 +48,004,446 / −32,048,682)·주택 건물 차손 0 처리·B0 보유기간 상이. **유·불리 단정 금지.**
6. **새로 드러난 사실**: ① 상속·증여 신고가액만 있고 개별주택가격이 없으면 현행은 취득가액 **전부를 토지분**에 배정(침묵 오배분 — Q-B) ② 양도시 나목이 신규 **필수**라 비-PHD 겸용 테스트의 거의 전부가 입력 보충 대상(§5).

**깨질 기존 테스트(실측, 프로토타입 변형)**: 입력 보충 **72파일 / 531건**(node 58파일·467건, dom 14파일·64건) — 그중 **값 갱신 10건/7파일**(clamp 픽스처 9 + PHD 양도비 축 1). E2E 미측정.
**anchor**: `…s3-2.predo.anchor.test.ts` **18 passed | 12 skipped**(skip 해제 + 프로토타입 패치 시 12건 전부 통과·(A) 9건 실패 — 구별력 확인).
**사용자 결정**: Q-A(B0 β/α) · Q-B(상속 신고가액만) · Q-C(PHD 단서 양도비 축 포함).
**상태**: 코드 소스 무수정(프로토타입은 scratchpad에서 적용 후 **원복**, md5 일치) · 커밋·push 없음.
## §1 소비 지점 전수 열거 — 「원값 가목(L)」 vs 「H의 비례 분할분(basis)」

표기: **확인** = 파일을 열어 줄 번호까지 본 것 · **실측** = throwaway probe 실행값 · 줄 번호는 base `eeb0ea719` 기준 `lib/tax-engine/transfer-tax-mixed-use-housing.ts`(이하 `housing.ts`).
법령(KoreanLaw MCP 본문 확인, 2026-10-06 현행 MST 290841·280405): 「소득세법」 §99①1호 가목(개별공시지가)·나목(건물 신축가격 등 국세청 고시)·라목(개별주택가격·공동주택가격) / §100②(양도·취득 당시 기준시가 등을 고려한 토지·건물 가액 안분, 후문 「공통되는 취득가액과 양도비용은 해당 자산의 가액에 비례하여 안분」) / 「소득세법 시행령」 §163⑥1호(토지 = **가목 개별공시지가 × 3/100**)·2호가목(「라목의 주택 취득당시의 다목 또는 **라목의 가액 × 3/100**」) / §164③(새 기준시가 고시 전 취득·양도 시 직전 기준시가)·⑦(공시 전 취득 주택 — 분자에 「가목의 가액과 나목의 가액의 합계액」) / §166⑥(토지·건물 가액 구분 불분명 시 「부가가치세법 시행령」 §64①1호 안분).

### 1.1 변수 정의 — 한 변수가 두 의미를 갖는 곳

`housing.ts`의 `transferLandStd`·`acqLandStd`는 **현행에서 이미 두 의미**다.

| 변수 | 현행 값 | 의미 | S3-2 후 |
|---|---|---|---|
| `transferLandStd` (:129-130) | `L_T = 양도시 ㎡당 공시지가 × 주택부수토지` (**원값 가목**) | ① 양도시 토지분 비율의 분자 ② 양도비 안분 축 ③ (PHD 조기분기가 볼 때) PHD 단서의 양도비 안분 축 | **basis(`land′_T`)** — 의미를 하나로: 「양도시 주택 기준시가의 토지분」 |
| `transferBuildingStd` (:132) | `max(H_T − L_T, 0)` | 같은 비율의 건물분 | **`H_T − land′_T`**(잔액 흡수) |
| `acqLandStd` (:274-275) | `L_A = 취득시 ㎡당 공시지가 × 주택부수토지` (**원값 가목**, 토지 취득일) | 토지분 취득시 기준시가 | 같은 취득일: **`land′_A`**(basis) / **별개 취득(B0)**: 원값 `L_A` 유지(§2) — **두 경우의 의미가 다르다 → 이름 분리 필요** |
| `acqBuildingStd` (:296-301) | `max(H − L, 0)` (B0: `max(H − L_b×면적, 0)`) | 건물분 취득시 기준시가 | 같은 취득일: `H − land′_A` / B0: `H − floor(H × L_b ÷ (L_b + N_b))` |

**분리 방안**: 이 파일 안에서 두 갈래(원값 / basis)를 한 이름으로 두면 읽는 사람이 `landStdPriceAtAcq`를 「공시지가×면적」으로 오독한다(결과 카드 라벨 「취득시 토지 기준시가」, `MixedUseCalculationSections.tsx:328·340`). 설계:
- 신설 순수 함수 leaf(제안 파일 `lib/tax-engine/mixed-use-housing-std-split.ts`, ≈40줄)가 **`HousingStdSplit { housingTotal, landStd(L), buildingStd(N), landBasis, buildingBasis, source }`** 를 만든다. 호출은 `apportionByStdPrice`(`std-price-apportion.ts:20-24`) 재사용 — S3-1 leaf 그대로.
- `housing.ts`의 `acqLandStd`·`acqBuildingStd`·`transferLandStd`·`transferBuildingStd` 는 **전부 basis**(= 그 파트의 취득시/양도시 기준시가 값)라는 한 가지 의미만 갖는다. 원값 가목·나목은 `stdSplit` echo(§3.4)에만 따로 담는다. B0 토지분이 원값 `L_A`인 것은 「토지 파트의 취득시 기준시가 = 토지 취득일 가목」이라 **basis의 정의에 부합**한다(§2) — 즉 `acqLandStd`는 어느 경우에도 「토지 파트의 취득시 기준시가」다.

### 1.2 소비 지점 표

| # | 위치 (확인) | 소비 내용 | 쓰는 값 | 판정 근거 | S3-2 |
|---|---|---|---|---|---|
| C1 | `housing.ts:307·310-311` `transferLandRatio = transferLandStd / transferTotal` → `landTransferPrice = floor(주택 양도가 × 비율)` | 양도가액 토지:건물 안분 | **basis** (`land′_T ÷ H_T`) | §100② 「양도 당시의 기준시가 등을 고려해 안분」 + 영 §166⑥. 토지가액·건물가액의 안분 단위는 주택가격(라목)의 분할분이다 — 조심2016중0801(「주택가액을 토지가액으로 안분하는 경우에는 국세청 고시 규정」), 계획서 §1 | **바뀜**. 실측 EST_SAME 양도가 토지분 1,241,379,309 → 993,103,447 |
| C2 | `housing.ts:269-271` `commercial_to_house` — `transferLandRatioForFallback`로 **취득시** 주택 합계를 토지·건물로 나눔 | 용도변경(상가→주택) 취득시 분할 | **basis (양도시)** | 집행기준 99-164-10(「환산주택가격을 자산별 기준시가로 안분」). 취득시 주택이 없어 양도시 비율을 차용하는 **기존 설계** — 차용되는 비율이 basis로 바뀐다 | **바뀜(양도시 나목에만 의존)**. 취득시 나목은 불요. 실측 UC_C2H 165M/55M → 132M/88M |
| C3 | `housing.ts:343-349` `necessaryExpensePair` → `resolvePartNecessaryExpense`(`transfer-tax-mixed-use-inheritance.ts:153-179`) 양도비 축 | 공통 양도비를 토지:건물로 | **basis (양도시)** | §100② 후문(양도비용은 「해당 자산의 가액에 비례」) + 본문 「양도 당시」 | **바뀜** |
| C4 | `housing.ts:230-239` PHD 비-4부분 단서(`applyHousingProviso`)에 넘기는 `transferLandStd/BuildingStd` — **:129-133 에서 PHD 분기 위로 끌어올린 뺄셈값** | PHD + §97②2호 단서의 양도비 안분 축 | **PHD 자체 양도시 분할** `phd.landHousingAtTransfer / buildingHousingAtTransfer` | PHD는 양도가액을 이미 `Math.floor(P_T×land/sum)` 비례(`transfer-tax-pre-housing-disclosure.ts:115-118`)로 나눈다 — 양도비만 뺄셈이면 **한 자산 안 척도 혼재**(S3-1 §1과 같은 결함). **신규 입력 불요**(PHD는 `buildingStdPriceAtTransfer`를 이미 받는다) | **바뀜(PHD 경로의 숨은 뺄셈)**. 실측 PHD_PROVISO 토지 양도비분 309,117,089 → 306,634,330(−2,482,759, 건물 +같은 값), 이 픽스처는 세액 불변 |
| C5 | `housing.ts:149-170` PHD 4부분 단서 `fp.housing*` | 취득·양도 4갈래 | 이미 비례 | — | 불변 |
| C6 | `housing.ts:306·315-316` `acqLandRatio = acqLandStd / acqTotal` → `landAcqPrice = floor(주택 환산·실가·감정 취득가 × 비율)` | 취득가액 토지:건물 분할 (환산·실가·감정·매매사례·상속·증여 공통) | **basis** | §100② 후문 + 영 §166⑥. 환산 분자·분모(주택 전체 H_A/H_T, `helpers.ts:384-410`)는 **분할 전 값 그대로** — 분할만 바뀐다 | **바뀜** |
| C7 | `housing.ts:323-326` 개산공제 `computeEstimatedDeduction(acqLandStd/acqBuildingStd, 3%)` | 환산·감정·매매사례 개산공제 | **basis** — 단, **합 = 라목 가액** 보존 | 영 §163⑥2호가목 「라목의 가액 × 3/100」(결합가 하나에 3%). 파트별 독립 floor가 정본(`housing.ts:318-321` 주석, PHD Step 7과 동일). **바꾸지 말 것: 3% 율·합계 보존** | 값만 교체. 실측 같은 취득일에서 3.6M+8.4M = 2.88M+9.12M = **12,000,000** (합계 불변) |
| C8 | `housing.ts:328-349` `commonCapexHousing`·`commonTransferExpHousing` ← `apportionAcquisitionPrice`/`apportionTransferPrice`(`helpers.ts:108-195` — `apportionTransferPrice` :108, `apportionAcquisitionPrice` :172) | 주택:상가 안분 | **H 그대로** | 주택(라목) 대 상가(가목+나목)의 안분 — 라목 결합가가 정본 | **불변(바꾸지 말 것)** |
| C9 | `helpers.ts:384-410` `calcHousingEstimatedAcq` 환산 `housingTransferPrice × H_A / H_T` | 주택분 환산취득가 | **H 그대로** | 영 §164③·⑦ 취지 — 라목 가액 대 라목 가액. 분할은 환산 **후** | **불변** |
| C10 | `inheritance.ts:190` `resolveHousingInheritedAcqDirect` (`stdCandidate = housingPrice`) | 상속·증여 주택분 평가액 | **H 그대로** | 영 §163⑨ | **불변**. 단 신고가액만 있고 H가 없으면(INH_REPONLY) 분할이 불가 → §3.3 |
| C11 | `housing.ts:376-377` echo → `helpers.ts:658·662·709·713` → 결과 카드 `MixedUseCalculationSections.tsx:328·340`(「개산공제 (취득시 토지 기준시가 X × 3%)」) | 개산공제 base 표시 | **basis** | 표시가 계산을 재도출하지 않는다(feedback_aggregate_display_rederives_engine_value) | 값은 자동 추종 + **`stdSplit` echo 신설**(비례 산식 표시) |
| C12 | `helpers.ts:564-566` 비사업용토지(배율초과) `floor(housingPart.landGain × nonBizRatio)` | **세액에 가장 크게 닿는 하류** — 토지분 양도차익이 NBL 몫이 된다 | (C1·C6·C7이 만든 `landGain`) | §104⑤·§104의3·영 §168의12 | **간접 변동**. 실측 NBL_EST 산출세액 **+48,004,446**, LOW_NBL_EST **−32,048,682** (§4) |
| C13 | `helpers.ts:571-586` 12억 초과 안분 `proratedLandGain/BuildingGain` | 파트 양도차익에 같은 비율 | gain | §89①3호 | 간접(파트 gain 합 불변 — 비율 동일이면 세액 불변, 실측 EXEMPT_12 Δ0) |
| C14 | `commercial.ts:154·182·186·217-222`(상가분) | 상가토지·상가건물 기준시가 | 상가 가목+나목 | 상가는 H가 없다 | **불변** |
| C15 | `fourpart.ts:42-43·74-75` echo | PHD 4부분 | `fp.*` | — | 불변 |
| C16 | `steps.ts:44` `acqHousing` 경로 라벨 | 표시 | H | — | 불변 |
| C17 | ⑫ `transfer-tax-schema-mixed-use.ts:122-130·143-157` | 주택분 H 필수 규칙 | H | — | 확장(§3.2) |
| C18 | 사이드바 `lib/stores/calc-wizard-store.ts:431-449` | `housingTransferPrice` = H/(H+상가) | H 그대로 | 주택:상가 | **불변** — ⑥ 동기화 대상 아님 |

### 1.3 「바꾸지 말 것」 재확인 (사용자 지시)
§163⑥2호가목 개산공제(라목 가액 × 3%, 결합가 합계 보존) · 12억 고가주택 안분 · 겸용 주택:상가 안분(H 그대로, C8·C9) · PHD 경로(이미 비례 — **단 C4 한 곳은 숨은 뺄셈**) — 위 표에서 C7·C8·C9·C13·C5가 이에 해당하고 변경 대상이 아니다.

### 1.4 컴패니언(함께 양도) 겸용
`bundled-split-helpers.ts:634-635` → `buildMixedUseCompanionItems` → `mixed-use-part-cards.ts:82` `calcMixedUseTransferTax`(**같은 엔진**) 이고 입력은 `buildMixedUseAssetInput`(`mixed-use-asset-input.ts:173` `...s.mixedUse`)과 `mixedUseAssetSchema`(`transfer-tax-schema-companion.ts:119`) 공유 — **엔진·⑫·⑭ 변경은 컴패니언에 그대로 적용**된다. ④ 는 `transfer-tax-api-companion-payload.ts:230`이 **같은 빌더** `buildMixedUsePayload`를 자산별로 부른다 → 1곳 수정으로 전파.
## §2 B0 대체 정의 — 토지·건물 취득일이 다른 겸용

### 2.1 현행 B0 (PR #1999, `housing.ts:277-302`)
토지분 `acqLandStd = L_A×면적`(토지 취득일 가목, 원값) · 건물분 `acqBuildingStd = max(H − L_b×면적, 0)`(H = 건물 취득일 공시 결합가, L_b = **건물 취득일** 기준 ㎡당 공시지가 `landPricePerSqmAtBuildingAcq`). 필수 술어 `isBuildingDayLandPriceRequired`(`mixed-use-acq-date.ts:51-58`) = 두 취득일 다름 ∧ PHD OFF ∧ 용도변경이 `commercial_to_house` 아님 ∧ H>0. 합 `acqTotal = L_A + (H − L_b)` ≠ H (의도 — B0 설계서 §1.3).

### 2.2 권고안 β — 「토지분은 토지일 원값 유지, 건물분만 건물일 H의 비례분」

```
같은 취득일(!required)  : 토지분 = land′_A = floor(H × L_A ÷ (L_A + N_A)),   건물분 = H − land′_A             (합 = H)
별개 취득(required, B0) : 토지분 = L_A (토지 취득일 가목 원값 — 현행 유지),
                         건물분 = H − floor(H × L_b ÷ (L_b + N_b))   (L_b = 건물 취득일 가목, N_b = 건물 취득일 나목) (합 ≠ H)
```
- **`landPricePerSqmAtBuildingAcq`의 역할 재정의**: 「H에서 빼는 감수」 → 「비례 분모의 가목(건물 취득일)」. 입력 의미(건물 취득일 기준 ㎡당 공시지가)·필수 조건(`isBuildingDayLandPriceRequired` 4조건)·폴백 없음 규약은 **그대로**다. 같은 취득일에서는 이 값을 읽지 않는다(현행과 같음).
- **N의 기준일**: 같은 취득일이면 그 취득일, B0이면 **건물 취득일**의 건물 기준시가(나목). 건물 기준시가는 건물의 속성이라 건물 취득일이 자연스럽고(영 §164③ 「새로운 기준시가가 고시되기 전에 취득 … 직전의 기준시가」), 같은 필드 `acquisitionStandardPrice.housingBuildingPrice` 하나로 양쪽을 표현한다.
- **토지분 원값 유지의 근거**: 별개 취득이면 토지는 건물이 없던 때 **토지로** 취득된 자산이다 → 영 §163⑥1호 「토지 취득당시의 가목 개별공시지가 × 3/100」(본문 확인)에 그대로 조응한다. 같은 취득일에서는 토지·건물이 **주택 하나로** 취득되어 §163⑥2호가목 「라목의 가액 × 3/100」(결합가에 3%)이 적용되므로 비례 분할분의 합이 H가 된다. 두 경우의 `acqLandStd` 의미가 다른 것(원값 / 비례분)은 **법적 대상이 다르기 때문**이고, 불연속은 날짜가 같아지는 순간에 있다(§1.1 이름 분리 필요 근거).
- **결합가 합계 보존이 깨지는 곳**: B0는 합 `L_A + 건물비례분`이 H와 다르다. 개산공제 합 = 3% × (L_A + bld′_b). B0가 이미 이 구조를 확정했으므로(B0 설계서 Q-2 「토지분 토지일 값 유지」) β는 **B0 결정을 유지**한다.

### 2.3 대안과 기각/보류 사유

| 안 | 정의 | 장점 | 문제 | 판정 |
|---|---|---|---|---|
| **β (권고)** | 위 | B0 결정 보존 · 변경 최소(뺄셈 1곳 → 비례 1곳) | 합 ≠ H · 같은 취득일과 의미가 다름 | 권고 |
| α | 별개 취득에서도 토지분 = `floor(H × L_b ÷ (L_b+N_b))`(건물일 비례분), 건물분 = 잔액(합 = H) | §163⑥2호가목 「라목 가액 × 3%」 정합 · 같은 취득일과 의미 통일 | 토지 취득일 가목을 주택 토지분에서 **쓰지 않게** 된다 → B0 Q-2(토지분 토지일 값 유지)·파트별 개산공제 규약(§163⑥1호)과 충돌, 토지 취득일 ㎡당 공시지가 입력의 소비처가 상가부수토지뿐이 됨 | 사용자 결정 Q-A |
| γ | 조심2008서1720식 — 비율 = 토지일 가목 : 건물일 나목(H 미사용) | 공시 전 취득(§164⑦) 선례와 같은 모양 | H(개별주택가격)를 쓰지 않는다 → S3-2의 전제(H를 가목:나목으로 안분)와 다른 문제. 공시 **후** 취득 + 취득일 상이의 직접 선례 미확보 | 기각(PHD 경로가 이미 이 모양을 담당) |

「공시 후 취득 + 토지·건물 취득일 상이」를 정면으로 다룬 해석례·심판례는 이 조사에서 **확보하지 못했다**(B1 조사 문서 `docs/02-design/features/mixed-use-separate-acq-authority-research.md`는 워크트리 `-b1` 소속 — 본 설계에서 미열람, **확인 필요**). β도 α도 법령 본문에서 직접 도출되지 않는 **설계 선택**이다 → Q-A로 올린다.

### 2.4 B0 수치 (실측, 프로토타입 패치 — 원본 복원 완료)
픽스처: 토지 2005-06-10(L_A 1.2M/㎡) / 건물 2010-03-15(L_b 1.8M/㎡, H 400M, 나목 N_b 320M — 가목+나목 = 1.25H) · 양도 2024-08-20 30억 · 비조정 전부 과세.

| | 건물분 기준시가 | 토지/건물 취득가(환산) | 개산공제 토지/건물 | 산출세액 |
|---|---|---|---|---|
| 현행 B0 (환산 B0_EST) | 220,000,000 | 146,044,624 / 267,748,479 | 3,600,000 / 6,600,000 | 678,734,368 |
| **β 수정 후** | **256,000,000** | 132,061,628 / 281,731,475 | 3,600,000 / 7,680,000 | **680,493,084 (+1,758,716)** |
| 현행 (실가 B0_ACT) | 220,000,000 | 211,764,705 / 388,235,295 | 0 | 592,430,538 |
| β 수정 후 | 256,000,000 | 191,489,361 / 408,510,639 | 0 | 594,482,542 (+2,052,004) |
| 현행 (감정 B0_APP) | 220,000,000 | 211,764,705 / 388,235,295 | 3,600,000 / 6,600,000 | 586,944,138 |
| β 수정 후 | 256,000,000 | 191,489,361 / 408,510,639 | 3,600,000 / 7,680,000 | 588,646,222 (+1,702,084) |
| **항등 대조**(N_b = H − L_b×면적 = 220,000,000) | 220,000,000 | 현행과 동일 | 동일 | **현행과 1원까지 동일**(B0_EST_ID) |

β 수정 후 양도가액 토지분이 같이 바뀌는 것(1,241,379,309 → 993,103,447)은 **양도시 나목**(N_T)이 들어오기 때문이며 B0와 무관한 §3 항목이다.
## §3 신규 엔진 입력 · 필수 술어 · 14지점(엔진·API 측)

### 3.1 필드 (겸용 주택건물 나목 × 취득시·양도시)

| 층 | 취득시 | 양도시 |
|---|---|---|
| 엔진 타입 | `MixedUseAssetInput.acquisitionStandardPrice.housingBuildingPrice?: number` | `MixedUseAssetInput.transferStandardPrice.housingBuildingPrice?: number` |
| 정의 위치 | 공용 타입 `MixedUseStandardPrice`(`types/transfer-mixed-use.types.ts:36-43`)에 `housingBuildingPrice?` **1줄** — 양도측은 그대로 상속, 취득측은 `Omit<MixedUseStandardPrice,"housingPrice"> & {…}`(:95-105)가 자동 상속. 기존 `commercialBuildingPrice`(상가건물, **토지 제외**)와 이름이 대칭 | |
| 폼(①②③) | `mixedAcqHousingBuildingPrice` | `mixedTransferHousingBuildingPrice` |
| 의미 | 국세청 고시 **건물 기준시가**(소득세법 §99①1호 나목)를 주택 건물에 적용한 값 — 건축물대장 연면적 기준(기획재정부 재산세제과-802·조심2016중0801, 계획서 §1). 같은 취득일이면 그 취득일, **B0는 건물 취득일** 기준 | 양도일 기준 |

- 타입은 **optional**(기존 테스트·`MixedUseStandardPrice` 리터럴 컴파일 보존) · 필수는 런타임 술어(§3.2). `acquisitionStandardPrice`는 PHD에서 `housingPrice`가 optional인 선례와 같다.
- PHD ON: 이 필드는 쓰지 않는다 — PHD는 `preHousingDisclosure.buildingStdPriceAtAcquisition/AtTransfer`(`types/transfer-phd.types.ts:41·53`)를 이미 받는다(폼 `phdBuildingStdPriceAtAcq/AtTransfer`). **PHD ③ 열과 필드를 공유할지**(`mixedTransferCommercialBuildingPrice`가 PHD ③ 상가건물 칸과 양방향 공유되는 선례, `MixedUsePreHousingDisclosureSection.tsx:254-268`)는 UI 설계 소관.

### 3.2 필수 술어 — leaf 1곳 (S3-1 `ownerSplitHousingNeedsBuildingStd`·B0 `isBuildingDayLandPriceRequired` 방식)

제안 파일 `lib/tax-engine/mixed-use-housing-std.ts`(순수, `mixed-use-acq-date.ts` 옆):

```ts
export interface HousingStdNeedInput {
  usePhd?: boolean;                                   // PHD ON이면 PHD가 자체 3시점 + 비례(요구 안 함)
  partialDirection?: "house_to_commercial" | "commercial_to_house";
}
/** 양도시 주택건물 나목(N_T) — 양도가액·양도비의 토지:건물 안분(C1·C3·C2)에 쓰인다. PHD 외 항상. */
export function isHousingBuildingStdAtTransferRequired(i: HousingStdNeedInput): boolean {
  return i.usePhd !== true;
}
/** 취득시 주택건물 나목(N_A) + 취득시 개별주택가격(H_A) — 환산·실가·감정·상속·증여 취득가 분할(C6)·개산공제(C7)·취득시 비용 안분(C3). */
export function isHousingBuildingStdAtAcqRequired(i: HousingStdNeedInput): boolean {
  return i.usePhd !== true && i.partialDirection !== "commercial_to_house";
}
```

- **소비 5층이 같은 leaf를 부른다**(규칙을 두 곳에 쓰지 않는다 — dual-truth 금지): ① 엔진 `housing.ts`(throw) ② ⑫ `mixedUseAssetSchema.superRefine`(`transfer-tax-schema-mixed-use.ts:159-177`, B0 블록 바로 아래) ③ ④ `buildMixedUsePayload`(`transfer-tax-api-mixed-use.ts:148-167` — 술어가 거짓이면 **키를 싣지 않는다**, B0 `needsMixedAcqLandPriceAtBuildingAcq`의 Q20 규약) ④ ⑧ `validateMixedUseAsset`(`transfer-tax-validate-mixed-use-asset.ts:130-136` 바로 아래) ⑤ ⑤ UI 노출. UI는 B0처럼 **얇은 어댑터**(제안 `lib/calc/mixed-use-housing-std-split.ts` — `needsMixedAcqHousingBuildingStd(a: AssetForm)`·`needsMixedTransferHousingBuildingStd(a)`; 겸용 ∧ 폼 → leaf 인자 변환만).
- **나목이 필요 없는 분기에서는 요구하지 않는다**(사용자 지시): PHD(`usePreHousingDisclosure`)·용도변경 `commercial_to_house`(취득측만 — 취득시 주택이 없어 **양도시 비율을 차용**, C2). 상가 파트는 H가 없어 무관.
- **미입력 신호**: 엔진 `throw new Error("겸용주택: …취득시 주택건물 기준시가(나목)가 필요합니다 — 토지분 = 개별주택가격 × 가목 ÷ (가목 + 나목) (소득세법 §99①1호 가목·나목)")` / ⑫ 400 `acquisitionStandardPrice.housingBuildingPrice`·`transferStandardPrice.housingBuildingPrice` / ⑧ `fieldError("mixedAcqHousingBuildingPrice"|"mixedTransferHousingBuildingPrice", …)`. **뺄셈 fallback 없음**(Q-3 확정) · 납세자 유·불리 표현 금지.
- **H 필수성의 보충**: 취득시 분할은 `H_A>0`이 전제다. 환산·실가·감정은 ⑫가 이미 H를 요구(`:122-130·143-157`). **상속·증여 + 신고가액만 입력(H 없음)**은 ⑫(`:150-158` 상속·증여 블록)·⑧(`validate-mixed-use-inheritance.ts:48-54`)이 허용하는데, 현행 엔진은 이때 `acqLandStd=L, acqBuildingStd=max(0−L,0)=0`이라 **취득가액 전부를 토지분에 배정**한다(실측 INH_REPONLY: 건물분 취득가 0, 토지분 450,000,000 — **기존 침묵 오배분**). 분할을 비례로 바꾸면 이 경우도 규칙이 필요하다 → **Q-B**(차단 권장).
- **술어 격자(⑧ ⇔ ⑫ ⇔ 엔진)**:

| 조합 (겸용 non-companion/companion 동일) | N_T | N_A | H_A | 비고 |
|---|---|---|---|---|
| 일반 환산·실가·감정·상속(H 있음)·증여 | 필수 | 필수 | 필수(기존) | |
| 별개 취득(B0) 위 전부 | 필수 | 필수(**건물 취득일 기준**) | 필수 | + `landPricePerSqmAtBuildingAcq`(기존 술어) |
| 상속·증여 + 신고가액만 | 필수 | **필수(Q-B 권장: H도 필수화)** | 신규 필수 | 현행 침묵 오배분 제거 |
| 보유 중 용도변경 `house_to_commercial`(비-PHD) | 필수 | 필수(취득시 **주택부분** 건물 기준시가) | 필수(기존) | 확인 필요 §9-3 |
| 용도변경 `commercial_to_house`(비-PHD) | 필수 | **불요** | 불요(기존: H 없음) | 취득시 분할은 양도시 비율 차용 |
| PHD 켬(4부분 포함) | **불요**(PHD 자체 양도시 분할 사용 — C4) | 불요 | 불요 | |

### 3.3 엔진 의사코드 (`housing.ts` — 뺄셈 2곳 + PHD 양도비 축 1곳 교체)

```ts
// 양도시 (PHD가 아닐 때만 — PHD 분기가 위에서 조기 return하므로 :129-133 호이스팅은 PHD 단서 인자 때문에만 필요했다)
const L_T = asset.transferStandardPrice.landPricePerSqm * derived.residentialLandArea;          // 원값 가목
const xfer = splitHousingStd({ housingTotal: H_T, landStd: L_T, buildingStd: N_T, at: "양도시" }); // apportionByStdPrice 재사용
const transferLandStd = xfer.landBasis, transferBuildingStd = xfer.buildingBasis;               // basis로 의미 통일
// PHD 비-4부분 단서(:230-239): transferLandStd/BuildingStd ← phd.landHousingAtTransfer / buildingHousingAtTransfer

// 취득시 (비-c2h)
const L_A = acqStd.landPricePerSqm * effectiveAcqDerived.residentialLandArea;
if (!buildingDayRequired) { const a = splitHousingStd({ H_A, L_A, N_A }); acqLandStd = a.landBasis; acqBuildingStd = a.buildingBasis; }
else { const b = splitHousingStd({ H_A, L_b·면적, N_b }); acqLandStd = L_A /* 원값 */; acqBuildingStd = b.buildingBasis; }
```
- 안분 비율 `acqLandRatio`·`transferLandRatio`는 **쌍에서 도출**(`landBasis ÷ 합`) — S3-1 D-3과 같은 규약(「분모 = 파트 합계가 정본」). 환산 취득가 분할은 현행 `Math.floor(est × ratio)`(부동소수 비율) 유지 — **정수 BigInt 대조 실측 200만 건 중 1건 1원 차**(`|diff|>1` 0건)라 이번에 건드리지 않는다.
- 파일 규모: `housing.ts` 381줄 → 신설 leaf로 분기 코드를 빼면 +20줄 안팎(≤700 착지 문제 없음). `types/transfer-mixed-use.types.ts` 985줄은 타입 전용 파일(정책 예외) · `helpers.ts` 765줄(≥750 위험구간)은 **이번에 손대지 않는다**(echo 복사 `:658·709`는 필드 추가가 필요하면 +3줄 — 기회주의적 분리 판단은 구현자).

### 3.4 결과 echo — `stdSplit` (S3-1 E-2와 같은 모양)
`HousingGainSplit`(`housing.ts:34-50`)·`MixedUseHousingPart`(`types:560-600`)에 `stdSplit?: { acq?: {housingTotal, landStd, buildingStd, landBasis, buildingBasis, kind}, transfer?: {…} }`. `kind: "proportional" | "land_raw_building_proportional"`(B0). 결과 카드가 이 유무로 「주택가격 × 가목 ÷ (가목 + 나목)」 산식을 풀어쓴다(재계산 금지 — feedback_aggregate_display_rederives_engine_value). 구 resultData·PHD는 없음. `landStdPriceAtAcq`/`buildingStdPriceAtAcq`의 의미는 **「그 파트의 취득시 기준시가 값(basis)」** 으로 고정한다.

### 3.5 14 동기화 지점 — 엔진/API(⑨~⑭) file:line + 클라이언트(①~⑧) 소관

| 지점 | 변경 | 위치 (확인) |
|---|---|---|
| ⑨ Zod enum 메인 | 해당 없음(enum 신설 없음) | — |
| ⑩ 컴패니언 enum + `addPropertyRefines` | enum 없음. 컴패니언 `mixedUse`가 **같은 `mixedUseAssetSchema`**(`transfer-tax-schema-companion.ts:119`)라 ⑫ 변경이 자동 전파. 컴패니언 별도 refine 추가 불요(겸용 refine은 스키마 내부 superRefine) | `transfer-tax-schema-companion.ts:119` |
| ⑪ 자산-수준 `acquisitionDate` fallback | 해당 없음(`landAcquisitionDate` fallback은 ④가 이미 처리 `transfer-tax-api-mixed-use.ts:147`) | — |
| **⑫ Zod 입력 객체 정의** | `mixedUseStandardPriceSchema`(`:43-47`)에 `housingBuildingPrice: z.number().int().nonnegative().optional()` — 양도측·취득측(`.extend` `:52`)이 공유하므로 **1줄**. 비엄격 `z.object`라 **빠뜨리면 침묵 strip**(B0에서 확인된 함정) | `lib/api/transfer-tax-schema-mixed-use.ts:43-47` |
| ⑫ 필수화 | superRefine(`:159-177` B0 블록 아래)에 leaf 2개 호출: N_T 없음/0 → 이슈 `["transferStandardPrice","housingBuildingPrice"]`, N_A 없음/0 → `["acquisitionStandardPrice","housingBuildingPrice"]`; H 필수 보강(Q-B) | 같은 파일 |
| **⑬ `callTransferTaxAPI` body spread** | ④ `buildMixedUsePayload`는 **명시 매핑**(spread 아님 — `:5-6` 경고)이므로 `transferStandardPrice`(`:148-157`)·`acquisitionStandardPrice`(`:158-167`)에 키 추가. 호출부 2곳(`transfer-tax-api.ts:164` 단건, `transfer-tax-api-companion-payload.ts:230` 컴패니언)이 같은 빌더 | `lib/calc/transfer-tax-api-mixed-use.ts` |
| **⑭ Route handler 엔진 input 매핑** | `buildMixedUseAssetInput`이 `...s.mixedUse` spread(`mixed-use-asset-input.ts:173`)라 중첩 `*StandardPrice` 객체가 통째로 통과 → **코드 변경 불요**. ⚠️ 상위 키 커버리지 가드(`:253-257`)는 **중첩 키를 못 본다** → 누락(⑫ strip)을 잡는 건 Route anchor뿐 — Pre-Do anchor의 Route 블록이 이 역할(§6) | `app/api/calc/transfer/mixed-use-asset-input.ts:173·253-257`, route `route.ts:351-357·465-476`, 컴패니언 `bundled-split-helpers.ts:634-635` |
| ① 폼 상태 | `AssetForm` 2필드 + 키 유니온 | `lib/stores/calc-wizard-asset-gb.ts:325-347`(겸용 필드 타입 블록) · `calc-wizard-asset-mixed-use.ts:49-56` |
| ② initial | `""` 2줄 | `calc-wizard-asset-mixed-use.ts:87-94` |
| ③ normalize | stale sessionStorage 복원 `""` 2줄 — **저장본에 없으면 `""`가 되어 ⑧이 막는다**(값을 지어내지 않음, Q-3) | `calc-wizard-asset-mixed-use.ts:175-182` |
| ⑤ UI 위젯 | 양 레이아웃(`MixedUseAssetMajorStdPrice.tsx`·`MixedUseLegacyStdPrice.tsx`)에 건물 기준시가 계산 모달(`BuildingStdPriceModalButton`, 상가건물 칸과 같은 방식 `…MajorStdPrice.tsx:364-404`) + 직접 입력. B0 칸 `MixedUseAcqHousingLandPriceField.tsx:40-48`의 hint(「토지분을 빼야 합니다」)·엔진/⑫/⑧ 메시지 정정 | UI 시니어 소관 |
| ⑥ 사이드바 | **변경 없음** — 겸용 미리보기는 H/(H+상가)만 쓴다(`lib/stores/calc-wizard-store.ts:431-449`) | — |
| ⑦ 결과 | `stdSplit` echo 읽기, 개산공제 행 `:328·340` | `components/calc/results/mixed-use/MixedUseCalculationSections.tsx` |
| ⑧ validation | leaf 2개 호출(B0 `:130-136` 아래) + 상속·증여 H(Q-B) | `lib/calc/transfer-tax-validate-mixed-use-asset.ts` · `…-mixed-use-inheritance.ts:48-54` |
## §4 케이스 매트릭스 (throwaway probe 실측 — 추정 없음)

**방법**: `calcMixedUseTransferTax`를 직접 호출하는 probe(`zz-probe-s32.test.ts`, 삭제함)를 **원본 엔진**과 **설계 프로토타입 패치**(`housing.ts` 뺄셈 2곳 → `apportionByStdPrice`, PHD 단서 양도비 축 → `phd.landHousingAtTransfer` — 패치는 scratchpad에 보관 후 **원본 복원, md5 일치 확인**)에서 각각 돌려 전·후를 비교했다. mock 세율표(`makeMockRates`) · 양도 2024-08-20 30억 · 산출세액 = `total.transferTax`(정본 세액 아님). 결과 JSON: scratchpad `s32/probe-{before_final,after_final,alpha}.json`.
**픽스처(가상, 실제 신고 사례 아님)**: 주택·상가 각 100㎡ · 토지 200㎡(주택부수 100㎡) · 취득 H 400M, 가목 L 120M(1.2M×100), 나목 N 380M / 양도 H_T 1.6B, L_T 1.2B, N_T 800M — **가목+나목 = 1.25 × 개별주택가격**(계획서 §3과 같은 가정). ⚠️ 이 괴리(25%)는 가정이라 세액 Δ의 **크기는 픽스처 의존**이고 부호도 단정할 수 없다(납세자 유·불리 표현 금지).
**항등 대조(`*_ID`)**: 나목 = H − 가목 (취득 280M · 양도 400M)이면 비례 = 뺄셈 — **모든 ID 변형이 현행과 1원까지 동일**(EST_SAME_ID · ACT_SAME_ID · ACT_EXP_ID · B0_EST_ID · PROVISO_EST_ID · EXEMPT_12_ID · NBL_EST_ID · NBL_ACT_ID · LOW_NBL_EST_ID · NONEX_NBL_EST_ID, 전 필드 Δ0). ⇒ 기존 테스트의 「입력 보충」이 값을 안 바꾼다는 증거(§5).

| 케이스 | 취득시 기준시가 토지/건물 (전 → 후) | 양도가액 토지/건물 (전 → 후) | 산출세액 (전 → 후) | Δ |
|---|---|---|---|---|
| 환산 · 같은 취득일 `EST_SAME` | 120M/280M → **96M/304M** | 1,241,379,309/413,793,104 → **993,103,447/662,068,966** | 697,999,552 → 697,999,553 | **+1** (개산공제 합 12,000,000 불변, 보유기간 같고 차손 없음) |
| 실가 `ACT_SAME` | 취득가 180M/420M → 144M/456M | 같음 | 613,260,517 → 611,249,483 | −2,011,034 (현행은 주택 건물분 차손 −6,206,896이 0 처리되는 구조 — 분배가 바뀌며 변동) |
| 실가 + 공통 자본적지출·양도비 `ACT_EXP` | 취득가 180M/420M → 144M/456M | 같음 | 595,270,862 → 584,359,138 | −10,911,724 |
| 감정·매매사례 `APP_SAME` | 180M/420M → 144M/456M | 같음 | 609,847,717 → 605,115,083 | −4,732,634 |
| 상속(H 있음) `INH_STD` | 120M/280M → 96M/304M | 같음 | 704,055,000 → 704,055,000 | **0** (분배만) |
| 상속 신고가액 450M + H `INH_REP` | 취득가 135M/315M → 108M/342M | 같음 | 720,255,000 → 720,255,000 | 0 |
| 증여 `GIFT_STD` | 120M/280M → 96M/304M | 같음 | 710,535,000 → 710,535,000 | 0 |
| **상속 신고가액만(H 없음) `INH_REPONLY`** | 취득가 **450M/0**(전부 토지) → **차단** | 같음 | 726,735,000 → 차단 | 현행 침묵 오배분 제거(Q-B) |
| 별개 취득 환산 `B0_EST` | 120M/220M → **120M/256M** | 1,241,379,309/413,793,104 → 993,103,447/662,068,966 (양도시 나목 효과) | 678,734,368 → 680,493,084 | +1,758,716 |
| 별개 취득 실가 `B0_ACT` | | | 592,430,538 → 594,482,542 | +2,052,004 |
| 별개 취득 감정 `B0_APP` | | | 586,944,138 → 588,646,222 | +1,702,084 |
| PHD(단서 없음) `PHD_PLAIN` | 75M/62.5M 불변 | 993,103,447/662,068,966 불변 | 801,651,505 → 801,651,505 | 0 |
| **PHD + 단서 `PHD_PROVISO`** | 불변 | 불변 | 582,788,884 → 582,788,884 | 0 — 단 **양도비 안분 토지 309,117,089 → 306,634,330 / 건물 251,390,678 → 253,873,437**(PHD 자체 양도 분할 60:40과 맞춤, 이 픽스처는 LTHD 같아 세액 불변) |
| 용도변경 주택→상가 `UC_H2C` | 240M/160M → 154,838,709/245,161,291 | 같음 → 60:40 | 697,999,552 → 697,999,553 | +1 |
| 용도변경 상가→주택 `UC_C2H` | 165M/55M → 132M/88M | 같음 → 60:40 | 663,515,525 → 663,515,525 | 0 (취득시 나목 불요, 양도시 나목만) |
| 단서(환산 + 큰 공통비용) `PROVISO_EST` | 120M/280M → 96M/304M | 같음 → 60:40 | 604,750,862 → 601,399,138 | −3,351,724 |
| 비과세 + 12억 초과 안분, 배율초과 없음 `EXEMPT_12` | 120M/280M → 96M/304M | 1,333,333,333/2,222,222,222 → 1,523,809,523/2,031,746,032 | 511,775,500 → 511,775,500 | **0** (12억 안분은 파트 차익 합 기준) |
| **12억 초과 + 배율초과(NBL) `NBL_EST`** | 120M/280M → 96M/304M | 같음 → 토지 양도가 +190M | 739,278,267 → **787,282,713** | **+48,004,446** |
| 12억 초과 + NBL 실가 `NBL_ACT` | | | 750,156,750 → 803,483,400 | +53,326,650 |
| **12억 이하(주택분 비과세) + NBL `LOW_NBL_EST`** | | 토지 786M → 629M | 330,396,675 → **298,347,993** | **−32,048,682** |
| 비과세 아님 + NBL `NONEX_NBL_EST` | | | 701,173,820 → 697,999,553 | −3,174,267 |
| 컴패니언(함께 양도) 겸용 | 같은 엔진(`mixed-use-part-cards.ts:82`) — 별도 probe 안 함(**확인 필요: 컴패니언 Route 값**) | | | |

**읽는 법 (세액이 움직이는 경로)**
1. 같은 취득일·같은 보유기간·건물 차손 없음이면 토지/건물 **분배만** 바뀌고 세액은 ±1원이다(EST_SAME·INH·GIFT·EXEMPT_12·UC).
2. 세액이 크게 움직이는 곳은 **토지분 양도차익이 별도 세율·공제를 받는 경로**다 — 배율초과 비사업용 몫 `floor(landGain × nonBizRatio)`(`helpers.ts:564-566`)가 가장 크다(±수천만 원). 그 다음이 주택 건물 차손 0 처리(실가·감정)와 토지·건물 보유기간 상이(B0).
3. 토지분 양도가액 비율이 **양도시 나목 N_T**에서 오는 것이 핵심 동인이다(뺄셈은 N_T = H_T − L_T = 400M를 암묵 가정, 가상 픽스처는 800M) — 그래서 양도시 나목이 **신규 필수 입력**이다.
4. 기준값 방향이 일정하지 않다(NBL 고가 +48M / NBL 12억 이하 −32M). **유·불리로 단정하지 않는다.**
## §5 깨질 기존 테스트 — 변형(뮤테이션) 실측

**방법**: 프로토타입 패치를 얹은 채 전체 vitest(node + dom 두 프로젝트, 28,896 테스트, 12분)를 1회 실행하고(원본은 `s32/orig/`에 복사해 두고 복원 — `git checkout`/`git stash` 미사용, 복원 후 md5 일치·`git status` 소스 무변경 확인), 실패 파일을 다시 **「나목이 없으면 N := H − 가목×면적(≤0이면 1)」로 채우는 변형**(MUT_FILL)으로 파일별 재실행해 **값이 달라지는 것**을 분리했다. 변형 규칙: STRICT = 이 설계 그대로(나목 누락 차단 + PHD 단서 양도비 축 교체) · FILL = 입력 보충(항등이면 값 불변).

| 구분 | 파일 | 테스트 |
|---|---|---|
| **STRICT 실패(= 입력 보충 필요)** | **72** | **531** (= 개별 실패 319 + 모듈/describe 수준 실패 13파일에 든 212) |
| 　└ `__tests__/api/` (Route) | 25 | 107 |
| 　└ `__tests__/tax-engine/transfer/` | 25 | 234 |
| 　└ `__tests__/tax-engine/transfer-tax/` | 6 | 122 |
| 　└ `__tests__/components/` `.test.ts`(node) | 2 | 4 |
| 　└ `__tests__/components/` `.test.tsx`(dom) | 14 | 64 |
| **FILL 후에도 실패(= 기대값 갱신)** | **7** | **10** |
| 　· H < 가목×면적 (뺄셈이 건물분을 0으로 clamp하던 가상 픽스처) | 4 | 5 — `transfer.route.companion-sec163-9-carriage-cp3` · `…mixed-use-gb-required-ui`(주택 부수토지 360㎡ × 1.0M = 360M > H 300M) · `…zod-required-2-cb-mu-cp`(2) · `…zod-required-2-ex-sp-pd` |
| 　· 같은 clamp 픽스처의 NBL 1원 차 | 2 | 4 — `mixed-use-appurtenant-excess-filing-form-f35`(3, 336,174,985↔984) · `mixed-use-inheritance-acquisition` 케이스#10(10,000,000↔9,999,999) |
| 　· PHD 단서 양도비 축 교체(C4) | 1 | 1 — `review-2026-08-f18` 「P7-3 양도비 9억(양도시 축)」 162,866,000 → 155,166,000 |

해석:
- **계획서 §4의 「겸용 79건/21파일」과는 정의가 다르다** — 그 수치(MUT_A 계열)는 취득시 뺄셈 교체로 **값이 어긋난** 건수로 읽히고(원 측정 방법은 본 설계에서 재현하지 않음 — 직접 비교 불가), 이 설계는 **양도시 나목까지 필수화**하므로 비-PHD 겸용을 계산하는 거의 모든 테스트가 **입력 보충** 대상이 된다. 그중 값이 실제로 달라지는 것은 10건뿐(521/531은 필드 보충만으로 해소).
- **STRICT 실패 72파일 중 `mixed-use-*` 이름이 아닌 것도 많다**(`surcharge-*-e14*`·`lthd-special-notice-three-paths`·`transfer-final-tax-stack-invariant` 등) — 겸용을 fixture로 쓰는 횡단 테스트다. 목록은 scratchpad `s32/strict-files.json`.
- **기대값 갱신이 필요한 10건은 두 부류**: (a) **H < 가목×면적인 픽스처** — 비례에는 clamp가 없으므로 **현실적 나목을 새로 정해야** 한다(N = H − 가목 불가). 이 5+4건은 구현 단계에서 픽스처의 나목을 정하고 기대값을 재산출한다. (b) PHD 단서 양도비 축(1건) — Q-C.
- **미측정**: E2E(`e2e/` 겸용 spec 16개 안팎 — `mixed-use-*` 15 · `transfer-companion-mixed-use`, `validation-field-jump-cases-mixed.ts`: 신규 필수 칸이 생기므로 계산을 끝까지 진행하는 spec은 전부 영향 후보) · 특성화 anchor 6건은 위 transfer 그룹에 포함됨.
- **B0 predo anchor**(`transfer.route.mixed-use-acq-std-date-mismatch.predo.anchor.test.ts`) STRICT 12건 실패 — Route 입력에 두 나목 필드 추가 필요, 값 갱신은 B0 S-1~3(220M→256M)뿐.
## §6 Pre-Do anchor

파일: `__tests__/api/transfer.route.mixed-use-housing-std-proportional.s3-2.predo.anchor.test.ts` (엔진 직접 + Route).
실행(`npx vitest run <path> --project node`, 원본 소스): **18 passed | 12 skipped (30)**, `npx tsc --noEmit` 0건.

| 블록 | 건수 | 상태 | 내용 |
|---|---|---|---|
| (0) 산식 전제 | 3 | passed | 비례 토지분 = 독립 BigInt 재구현 1원 일치(안전 정수 초과 포함) · `apportionByStdPrice` 공용 leaf 재사용 · 뺄셈 = 비례 ⇔ H = L+N |
| (A) 현행 고정 | 8 | passed | A-1 환산 120M/280M·697,999,552(나목을 주든 빼든 같은 값 = 무시) · A-2 실가 613,260,517 · A-3 NBL 고가 739,278,267 · A-4 NBL 12억 이하 330,396,675 · A-5 B0 220M·678,734,368 · A-6 PHD 단서 양도비 축 뺄셈(309,117,089) · **A-7 결함 핀: 상속 신고가액만 → 취득가 450M 전부 토지분** · A-8 상가→주택 165M/55M |
| (C) 회귀선 | 6 | passed | C-1 **항등**(N = H − L → 현행과 1원 동일: 환산·실가+비용·단서·B0·NBL) · C-2 PHD 801,651,505 · C-3 개산공제 합 12,000,000·환산취득가 총액 불변 · C-4 상가분 불변 · C-5 12억 안분 511,775,500 · C-6 상속 704,055,000 |
| Route R-A1 | 1 | passed | 나목을 실어도 ⑫가 strip → 나목 없는 요청과 같은 결과(220M·678,734,368) |
| (B) 수정 후 | 10 | **skip** | B-1 환산 96M/304M·993,103,447 · B-2 실가·공통비용·감정 · B-3 단서 · B-4 NBL(787,282,713 / 298,347,993 / 697,999,553) · B-5 B0 β(120M/256M·680,493,084·594,482,542·588,646,222) · B-6 PHD 양도비 축(306,634,330) · B-7 용도변경 · B-8 상속·증여 · B-9 나목 누락 throw · B-10 상속 신고가액만 → 차단 |
| Route (B) | 2 | **skip** | R-B1 나목 도달(256M·680,493,084, 값 변경 시 결과가 바뀜 = strip 아님) · R-B2 누락 → 400 + `housingBuildingPrice` 지목 |

**구별력 검증(실측)**: skip을 `S32_UNSKIP=1`로 풀고 **설계 프로토타입 패치**(엔진 + ⑫ 필드·필수화)를 얹어 돌리면 — (B)·Route (B) **12건 전부 통과**, (0)·(C) 통과, (A) 8건 + R-A1 **9건 실패**(현행 고정이 변경을 감지). 즉 skip 값은 프로토타입이 실제로 낸 값과 1원 일치하고, (A)·(C)는 각각 「바뀌어야 하는 것」「바뀌면 안 되는 것」을 가른다. 패치는 원복했고 위 18 passed | 12 skipped는 원본 상태 실행이다.
⚠️ (B-9)(B-10)의 정규식 `/나목/`·`/개별주택가격/`은 구현의 메시지 어휘가 정해지기 전의 가정이다 — 구현 시 같은 단어를 쓰거나 anchor를 맞출 것.
## §7 B1(겸용 별개 취득 파트별 산정방식)과의 연결점 — 충돌 없게

참조(읽기만): `Property-related-Taxes-b1/docs/00-pm/transfer-split-acq-per-part-method.plan.md` §5 B1-V2 (S-1·S-2·S-4·S-5, S-3 = 본 S3-2).

| B1 결정 | S3-2와의 연결 | 충돌 여부 |
|---|---|---|
| **S-1** 토지 취득가액 → 주택부수토지/상가부수토지: **토지 기준시가 비율** | 토지 파트 = **토지 취득일 가목** — S3-2 β(별개 취득)의 `acqLandStd`(원값 L_A)와 **같은 축**. B1은 별개 취득 한정이라 항상 β의 원값 분기만 탄다 | 없음(β 채택 시). **α 채택 시 충돌**(토지분이 건물일 비례분이 되어 S-1의 「토지일 가목 비율」과 어긋남) |
| **S-2** 건물 취득가액 → 주택건물/상가건물: 용도별 계약액 우선, 없으면 **건물 취득일 건물 기준시가(나목) 비율** | 주택건물 쪽 분자 = 건물일 나목 N_b = S3-2가 신설하는 **`acquisitionStandardPrice.housingBuildingPrice`**(별개 취득이면 건물 취득일 기준) — **B1이 새 필드를 만들 필요 없다**. 상가건물 쪽은 기존 `commercialBuildingPrice`(나목). 두 값이 모두 **나목 원값**이라 척도가 같다 | 연결점. **결정 필요(B1)**: S-2 분자를 N_b(원값)로 할지, S3-2의 건물 basis(`H − land′_b`)로 할지 — 권고: **원값 N_b**(상가는 나목 자체가 기준시가라 같은 척도) |
| **S-4** PHD(§164⑦) 포함 | S3-2는 PHD 경로에서 나목 필드를 **요구하지 않는다**(PHD 자체 입력 사용) + C4(PHD 단서 양도비 축)만 교체. B1이 PHD+별개 취득에서 파트별 환산을 얹을 때 같은 `applyHousingProviso`·`calcHousingGainSplit` PHD 분기를 만진다 | 순서 S3-2 → B1이므로 B1이 C4 이후 구조 위에서 작업. B1 변경이 PHD `phdResult.land/buildingHousingAtTransfer`를 읽는 점은 동일 |
| **S-5** 개산공제 방식(「S-3 결론에 따라 확정」) | **S3-2가 결론을 준다**: 같은 취득일 = 비례 분할분 × 3%(합 = 라목 H × 3%, 영 §163⑥2호가목) / 별개 취득(β) = 토지 L_A × 3%(영 §163⑥1호) + 건물 `bld′_b` × 3%. B1은 이 base 정의를 그대로 이어받는다 | 없음 |
| B0 `landPricePerSqmAtBuildingAcq` | 역할이 「뺄셈 감수」→「비례 분모의 가목」으로만 바뀐다. B1이 별개 취득 파트 블록을 열어도 이 필드·술어(`isBuildingDayLandPriceRequired`)는 그대로 필요 | 없음 |
| 파일군 | B1도 `housing.ts`·`mixed-use-asset-input.ts`·`transfer-tax-api-mixed-use.ts`·`transfer-tax-schema-mixed-use.ts`·`validate-mixed-use-asset.ts`를 만진다 | S3-2는 취득시 분할 블록(`housing.ts:244-303`)을 **신설 leaf 함수로 추출**해 B1이 파트별 모드를 얹을 자리를 만든다 — B1 diff 최소화 |
| B1 UI 게이트 `isSeparateAcquisition()` 겸용 제외 해제(D-4) | 무관 | 없음 |
## §8 사용자 결정 질문 (Q-n) — 법령·정책상 갈리는 것만

| # | 질문 | 선택지 | 권장 | 근거 · 수치 영향 |
|---|---|---|---|---|
| **Q-A** | 토지·건물 취득일이 다른 겸용(B0)의 주택 기준시가 분할을 어떻게 정의하나 | **β** 토지분 = 토지 취득일 가목 원값 유지, 건물분 = 건물일 H의 비례분 / **α** 토지분도 건물일 H의 비례분(합 = H) / γ 기각 | **β** | ① B0 확정 결정(Q-2 「토지분 토지일 값 유지」)을 보존, 뺄셈 1곳만 비례로 교체 ② 토지 파트 개산공제를 영 §163⑥1호(토지 가목×3%)와 조응 ③ **β는 N = H − 건물일 가목일 때 현행 B0와 1원까지 동일**(B0_EST_ID Δ0), α는 항등이 깨진다(B0_EST_ID 토지분 120M → 180M, 세액 678,734,368 → 678,528,828) ④ B1 S-1과 정합. 수치: 환산 B0 세액 현행 678,734,368 → **β 680,493,084 / α 680,418,418**(실가 β 594,482,542 / α 594,703,138 · 감정 β 588,646,222 / α 588,640,018). **법령 직접 근거는 없음**(공시 후 취득 + 취득일 상이 정면 선례 미확보) — 설계 선택이다 |
| **Q-B** | 상속·증여 취득 겸용에서 **신고가액만 입력하고 개별주택가격이 없는** 경우 | (1) 개별주택가격 필수화 → 차단 / (2) 가목:나목 가중 비율로 신고가액을 분할(H 불요) / (3) 현행 유지(취득가액 **전부 토지분**) | **(1)** | (3)은 침묵 오배분(실측 INH_REPONLY: 건물분 취득가 0, 토지분 450,000,000)이라 비례 전환 후 유지할 수 없다. (2)는 값이 (1)+H 입력과 같아(108M/342M) 새 입력이 정보를 더하지 않지만 leaf가 「H 있음/없음」 두 모양이 되고 「미입력은 차단」 정책(Q-3)과 모양이 다르다. (1)은 ⑫·⑧에 상속·증여 H 필수 1줄 추가 — 공시 후 상속이면 개별주택가격은 존재하는 값. 영향: 신고가액만 입력해 오던 사용자는 H 입력이 새로 필요 |
| **Q-C** | PHD(이미 비례)+ §97②2호 단서 경로의 **양도비 안분 축**(`housing.ts:129-133` 호이스팅된 뺄셈값)도 이번에 PHD 자체 양도시 분할로 교체하나 | 포함 / 별건 분리 | **포함** | 같은 파일·같은 결함(한 자산 안 척도 혼재: 양도가액은 60:40, 양도비는 75:25). **신규 입력 없음**(PHD가 양도시 나목을 이미 받는다). 실측: 토지 양도비분 309,117,089 → 306,634,330(−2,482,759), 이 픽스처는 세액 불변. 기존 테스트 1건(`review-2026-08-f18` P7-3) 기대값 갱신 |

사용자 결정이 **필요 없는** 항목(이미 확정): 뺄셈 → 비례(Q-1) · 나목 누락 차단(Q-3) · 건물 기준시가 계산 모달 + 직접 입력(Q-4) · 양도시 나목 필수(계획서 §4 「주택건물 나목 × 취득시·양도시」) · 분배 쌍 도출 비율(S3-1 D-3).
## §9 확인 필요 (미검증 — 추정으로 단정하지 않는다)

1. **공시 후 취득 + 토지·건물 취득일 상이**의 직접 해석례·심판례 미확보 — β·α 모두 설계 선택(Q-A). B1 조사 문서(`mixed-use-separate-acq-authority-research.md`)는 워크트리 `-b1` 소속이라 본 설계에서 **미열람**.
2. 계획서 §7 미해소 그대로: 국세청 고시 제2025-26호 현행 산식 텍스트 · 공시 후 아파트 정면 사안 · 개별주택가격 ↔ 가목+나목 괴리 표본(본 matrix의 1.25배는 **가정**).
3. **용도변경 `house_to_commercial`(비-PHD)의 취득시 나목 N_A 정의** — 코드는 취득시 주택부수토지(`acqDerived.residentialLandArea`)와 H_A를 쓴다. N_A를 취득시 **주택으로 쓰인 부분**(`acqResidentialArea`)의 건물 기준시가로 보는 것이 일관되나 UI(모달 연면적 prefill)·사용자 안내에서 확인 필요.
4. **공유지분**: 겸용은 「기준시가·면적은 100%, 개산공제만 `ownershipRatio` 축소」계약(`transfer-tax-api-mixed-use.ts:78-86`)이다 — 나목도 100%로 보내는 것이 맞다고 판단했으나 지분 양도 + 겸용 + 나목 anchor는 이번에 만들지 않았다.
5. ⑫는 `transferStandardPrice.housingPrice`를 `nonnegative`로 허용한다(0 가능) — 비-PHD에서 H_T = 0이면 엔진은 환산 0으로 조용히 끝난다(⑧만 막음). N_T 요구 조건에 `H_T > 0`을 붙일지(현행 프로토타입은 붙임) · ⑫에서 H_T 필수로 올릴지 구현 시 결정.
6. 컴패니언(함께 양도) 겸용의 Route 값(같은 엔진 호출이라 동일할 것으로 보나 **실측 안 함**).
7. **DOM/E2E 영향**: DOM 14파일/64건은 STRICT에서 측정(입력 보충). E2E는 미측정(§5).
8. `lib/tax-engine/types/transfer-mixed-use.types.ts` 985줄·`transfer-tax-mixed-use-helpers.ts` 765줄(≥750 위험구간) — 파일 크기 정책상 후자는 이번에 손대지 않는 설계이나, echo 복사(+3줄)·타입 추가(+필드 2~3개)가 필요하면 분리 판단은 구현자.
9. 1985.1.1 이전 의제취득·2000 이전 건물 N(모달이 산정기준율 트랙으로 값을 내는지) — S3-1 확인 필요 4와 같은 항목(겸용 모달 prefill 경로는 UI 확인).
10. 상속·증여 + 토지·건물 취득일 상이(B0 Q-4 별건 「분리 OFF·상속 시 `landAcquisitionDate` 잔존」)와 N_b 요구의 상호작용 — 술어는 ④가 실제로 보내는 날짜 기준(B0와 동일)이라 새 모순은 없을 것으로 보나 미실측.
11. 위 수치는 mock 세율표 · 가상 fixture 기준이다(정본 세액 아님).

---

## §10 Do 결과 (엔진·API 층 — 2026-10-07, 진행 중 기록)

> 진행 로그(중간에 멈춰도 상태가 남도록 단계마다 갱신). 최종 정리는 이 절 끝의 「최종」 소절.

- **[1/10 완료] leaf**: `lib/tax-engine/mixed-use-housing-std.ts` 신설 — 술어 `isHousingBuildingStdAtTransferRequired`·`isHousingBuildingStdAtAcqRequired` + 분할 `splitMixedUseHousingStd`. 설계 §3.2 시그니처에서 **분할 함수를 같은 파일에 합쳤다**(설계안은 `mixed-use-housing-std-split.ts` 별도 제안 — 응집도상 한 파일).
- **[2/10 완료] 엔진**: `transfer-tax-mixed-use-housing.ts` — 양도시·취득시 뺄셈 2곳 + PHD 단서 양도비 축(Q-C) 교체. echo `housingStdSplit` → `HousingGainSplit` → `buildHousingPart`(helpers +1줄) → `MixedUseHousingPart`. 타입 `MixedUseHousingStdSplitDetail`·`MixedUseStandardPrice.housingBuildingPrice` 추가.
- **[3/10 완료] ⑫**: `transfer-tax-schema-mixed-use.ts` — `housingBuildingPrice` 필드(양측 공유 정의) + superRefine(leaf 호출). ⑭는 `...s.mixedUse` spread라 코드 변경 불요(Route anchor로 도달 실측).
- **[5/10 완료] Pre-Do anchor**: skip 12건 해제 → 21 passed(종전 (A) 8건·R-A1은 의미 상실로 제거, B-10은 Q-B 확정에 맞춰 개정).
- **[6/10 진행] 기존 테스트 보충**: 나목 없는 fixture에 **항등 나목**(N = H − 가목)을 채우는 test helper `__tests__/tax-engine/_helpers/mixed-use-identity-std.ts` 신설(`calcMixedUseTransferTaxIdN` 엔진 래퍼 · `withIdentityStdInBody` route body shim · `withIdentityHousingBuildingStd`). 엔진 직접 호출 테스트는 import 한 줄 교체, route 테스트는 `body: JSON.stringify(withIdentityStdInBody(...))`. 항등이 안 되는 clamp fixture 10건은 개별 현실적 나목으로 기대값 갱신(목록은 최종 소절).

### 최종 (엔진·API 층 Do 완료 — 2026-10-07)

**변경 소스 6개**: `lib/tax-engine/mixed-use-housing-std.ts`(신설 leaf) · `transfer-tax-mixed-use-housing.ts`(엔진) · `transfer-tax-mixed-use-helpers.ts`(echo 1줄) · `types/transfer-mixed-use.types.ts`(타입) · `lib/api/transfer-tax-schema-mixed-use.ts`(⑫) · `mixed-use-acq-date.ts`(stale 주석만). ⑭는 `...s.mixedUse` spread라 코드 변경 없음(Route anchor로 도달 실측 — `…s3-2.do.anchor.test.ts` R-1·R-5·R-6). **④·⑤·⑧·① ~ ③·⑦은 UI 단계 몫(미착수).**

**leaf 공개 API** (`lib/tax-engine/mixed-use-housing-std.ts`)

```ts
export type HousingStdPartialDirection = "house_to_commercial" | "commercial_to_house";
export interface HousingStdNeedInput { usePhd?: boolean; partialDirection?: HousingStdPartialDirection | undefined }
export function isHousingBuildingStdAtTransferRequired(i: HousingStdNeedInput): boolean // usePhd !== true
export function isHousingBuildingStdAtAcqRequired(i: HousingStdNeedInput): boolean      // usePhd !== true && partialDirection !== "commercial_to_house"
export interface SplitMixedUseHousingStdArgs { housingTotal: number; landStd: number; buildingStd: number; landStdAtBuildingDay?: number }
export function splitMixedUseHousingStd(a: SplitMixedUseHousingStdArgs): MixedUseHousingStdSplitDetail
```

**설계 대비 차이**

| 항목 | 설계 | 구현 | 이유 |
|---|---|---|---|
| leaf 파일 | 술어 `mixed-use-housing-std.ts` + 분할 `…-split.ts`(별도 제안) | **한 파일**에 술어 + 분할 | 응집도(≈100줄). 분할 함수는 `apportionByStdPrice` 재사용 |
| 양도측 술어의 `H_T > 0` 조건 | 프로토타입이 붙임(§9-5 미결) | **붙이지 않음** — 나목은 PHD 아니면 항상 필수 | ⑧이 H_T를 이미 요구하고, H_T = 0이어도 나목 입력은 막다른 길이 아니다. 술어가 H에 의존하면 UI·⑫·엔진 3곳이 H 해석까지 맞춰야 한다 |
| 엔진이 술어에 넘기는 `usePhd` | `asset.usePreHousingDisclosure` | **`housingAcqResult.phdResult !== undefined`** | 엔진의 실제 분기 기준. 토글만 켜고 `preHousingDisclosure`가 없는 엔진 직접 입력(⑫는 400)이 NaN으로 흘러가던 경로를 차단(E-10). 정상 입력(토글 ON + 3시점 객체)은 동일 |
| 가목 곱셈 | 평문 `단가 × 면적`(종전 L_A·L_T) | **`multiplyByArea`**(floor 정수) 통일 | 비례 leaf가 정수 입력일 때 BigInt 정확 경로. 면적이 2자리 소수여도 fixture에선 이미 정수라 값 불변(사례14 1000㎡ 변형 실측 동일) |
| 상가→주택 용도변경 취득시 합계 분할 | `floor(H × 양도시 비율 float)` | **`apportionByStdPrice(H, 양도시 토지분 basis, 건물분 basis)`** | 부동소수 비율 floor 1원 위험 제거. anchor B-7 132,000,000/88,000,000 정확 |
| 나목 오류 메시지 | `…(소득세법 §99①1호 가목·나목)` 인용 포함 | **조문 인용 없음**(「가목(개별공시지가 × 주택부수토지 면적):나목(주택건물 기준시가)」 풀이만) | §10 Q-D — 미확인 조문 인용 금지. E-7 가 `§·소득세법·시행령` 부재를 고정 |
| echo `kind` | `proportional` · `land_raw_building_proportional` | + **`raw_ratio`**(H 없음 — Q-B) | Q-B 표현. `housingTotal = 0` |

**Q-B 구현 정의 (사용자 확정)**: 상속·증여 취득 + 개별주택가격(H) 없음 + 신고가액만 입력 → **H를 요구하지 않는다**(⑫도 엔진도). 주택건물 나목(취득시)은 필수. 분할 basis = (토지 가목 **원값**, 주택건물 나목 **원값**) — `splitMixedUseHousingStd`의 `raw_ratio`. 취득가액 분할은 `floor(신고가액 × 가목/(가목+나목))`: 450M × 120M/500M → **108M / 342M**(H 400M을 줘도 같은 값 — predo B-10). 현행의 「전부 토지분」(건물분 0) 침묵 오배분 제거.
- **B0 × Q-B 상호작용**: `isBuildingDayLandPriceRequired`가 `H > 0`을 요구하므로 **H가 없으면 B0는 꺼진다** → 건물 취득일 가목(`landPricePerSqmAtBuildingAcq`)은 요구하지 않고, 분할은 (토지 취득일 가목 : 건물 취득일 나목) 원값 비율이다(조심2008서1720식 모양 — 공시 전 취득의 토지일 가목 + 건물일 나목). H가 있는 상속·증여 + 취득일 상이는 **기존 B0 규칙 그대로**(건물일 가목 없으면 차단 — E-6이 두 갈래를 고정). 필수 술어 `isBuildingDayLandPriceRequired`는 **불변**.
- **일반화(설계 선택, 확인 필요)**: `raw_ratio`는 엔진 레벨에서 「H ≤ 0」이면 모두 적용된다(상속·증여 한정이 아니다). 상속·증여 외 경로(환산·실가·감정)는 ⑫(`housingPrice > 0` 요구)와 ⑧이 H 없는 입력을 이미 막으므로 API로는 도달하지 않는다. 엔진을 직접 부르는 테스트(사례14 등 H 미공시 fixture)만 해당 — 그 fixture는 이전에도 H 없음을 뺄셈 clamp(전부 토지분)로 흘렸다.

**기존 테스트 보충 (원칙: 항등 나목)**
- test helper `__tests__/tax-engine/_helpers/mixed-use-identity-std.ts`(신설) — `withIdentityHousingBuildingStd`(N = H − 가목, B0이면 건물일 가목, 항등 불가면 1) · `calcMixedUseTransferTaxIdN`(엔진 래퍼) · `withIdentityStdInBody`(route body shim, 컴패니언 포함, `{acqN, transferN}` 오버라이드). **나목 없는 fixture가 값 불변으로 통과**한다는 것이 항등의 증거(비례 = 뺄셈 ⇔ H = 가목 + 나목).
- 적용(테스트 파일 약 57개 수정): 엔진 직접 호출 34파일 import 한 줄 교체(`__tests__/components/` node 2파일 포함) · route 23파일 `body: JSON.stringify(withIdentityStdInBody(...))` · 파트 카드·컴패니언 직접 호출 5파일 `buildMixedUsePartCards(…, withIdentityHousingBuildingStd(asset), …)`.
- ⚠️ ④(`callTransferTaxAPI`)가 폼에서 나목을 싣기 전까지의 **shim**이다 — 폼 경유 route 테스트(컴패니언·gb-required-ui 등)도 이 shim으로 통과한다. UI 단계에서 폼 필드가 생기면 shim을 실제 폼 입력으로 바꿀 수 있다.
- S3-1 특성화 anchor(`housing-std-split-proportional.s3-characterization`) 겸용 (c) 블록은 **재현 훅(vi.mock)을 제거**하고 네이티브로 교체: 「현행(뺄셈)」 → 항등 나목(종전 값과 **1원 일치**) · 「비례」 → 실제 나목(종전 재현 훅 값과 **1원 일치**) — 18 passed. 엔진이 종전 재현값을 네이티브로 낸다는 독립 증거.

**기대값을 바꾼 기존 테스트 (10건 / 7파일 — 설계 §5 예측과 정확히 일치)**

| # | 파일 · 테스트 | 종전 → 신 | 나목·재산출 근거 |
|---|---|---|---|
| 1 | `transfer.route.mixed-use-gb-required-ui` 「모두 있음」 | 결정세액 175,236,001 → **175,765,201** | fixture H 300M < 가목 360M(1.0M × 부수토지 360㎡) — 뺄셈은 건물분 0 clamp로 가목 360M 전부 × 3% = 10.8M(H 초과)을 개산공제. 비례는 라목 가액 H(300M) × 3% = 9.0M. 나목 90M(가정 4:1)·토지 240M·건물 60M — 세액은 N 선택과 무관(실측: N=1과 N=90M 동일) |
| 2 | `transfer.route.zod-required-2-cb-mu-cp` 감정가액 | 163,180,001 → **163,684,001** | 위와 같음 |
| 3 | 같은 파일 「있음」(환산) | 175,236,001 → **175,765,201** | 위와 같음 |
| 4 | `transfer.route.zod-required-2-ex-sp-pd` EX-5 | 150,265,715 → **150,769,715** | 위와 같음 |
| 5 | `transfer.route.companion-sec163-9-carriage-cp3` 겸용 컴패니언 | 328,370,189 → **328,952,309** | 위와 같음 |
| 6~8 | `mixed-use-appurtenant-excess-filing-form-f35` A-0~A-9(9개 `it`, 값 단언 다수) | 주택분 토지 차익 336,174,985 → **220,009,878**(건물분 0 → 116,165,107, 합 불변) · 비사토 차익 235,336,494 → 154,016,080 · 결정세액 363,566,040 → 339,657,838 등 | 케이스 A는 「토지만 1,000㎡로 키운 변형」이라 양도시 가목 1,317,783,000 > H 872M(clamp). **건물(나목)은 그대로**이므로 사례14 실제 건물 값 650,204,000(= 872M − 6.1M × 36.36㎡)을 양도시 나목으로. 케이스 B는 H 50억 > 가목이라 항등(불변) |
| 9 | `mixed-use-inheritance-acquisition` 케이스#10-비사업용 | totalPayable 639,501,720 → **572,147,360** / 635,635,770 → **569,335,761** · 필요경비 토지분 전액 10,000,000 → 7,272,727 | 부수토지 400㎡ 변형(가목 800M > H 500M clamp). 실제 건물 기준으로 취득시 나목 300M·양도시 나목 500M. 토지분 basis 363,636,363 · 필요경비 10M × 363,636,363/500M. 방향(필요경비가 세액을 줄임)은 유지 |
| 10 | `review-2026-08-f18` P7-3 양도비 9억(PHD 단서, **Q-C**) | 162,866,000 → **155,166,000** | 양도비 안분 축 뺄셈(토지 75%) → PHD 자체 양도시 분할(양도가액과 같은 60:40). 주택분 합 562,500,000 불변, 배분만 변동(P7-2 자본적지출 경로와 같은 값) |

**깨졌으나 손대지 않은 테스트**: `__tests__/components/` dom(`.test.tsx`) **14파일** — 목록은 최종 보고. node(`.test.ts`) 2파일(`filing-form-local-tax-identity`·`mixed-use-statement-acquisition-actual`)은 import 교체로 보충.

**뮤테이션 probe (14종, 전부 KILLED — 원본 복원 후 md5 일치 확인)**: M1 취득 비례→뺄셈(15 failed) · M2 양도 비례→뺄셈(8) · M3 B0 β→α(5) · M4 Q-B → 전부 토지분(4) · M5 Q-C 뺄셈 복귀(1) · M6a/b ⑫ 양도시/취득시 나목 필수 제거(각 2) · M7 leaf 취득측 c2h 면제 제거(2) · M8 leaf 양도측 PHD 면제 제거(2) · M9 ⑫ 필드 삭제=strip(6) · M10 echo 미전달(6) · M11 엔진 취득측 나목 throw 제거(5) · M12 c2h 차용 분할을 원값 비율로(2) · M13 B0 건물일 가목 대신 토지일 가목(4). 대상 = predo + do anchor 2파일(42건). 하네스 `scratchpad/s32do/mutate.py`.

**남은 확인 필요**
1. **UI 단계 필수**: ④ `buildMixedUsePayload`(`lib/calc/transfer-tax-api-mixed-use.ts`)가 두 나목 키를 싣는다 — 술어가 거짓이면 **키를 싣지 않는다**(stale 방어). ⑧ `validateMixedUseAsset`(`…-validate-mixed-use-asset.ts`)가 같은 leaf를 부른다. 이 둘이 없으면 UI 통과 ↔ ⑫ 400 모순(정책 3 — validation 8번째 동기화).
2. 컴패니언 ⑫ 경로 오류 path는 `companionAssets.N.mixedUse.…housingBuildingPrice` — 입력칸 이동(`transfer-tax-error-format.ts` 라벨 매핑)은 UI 몫.
3. dom 14파일의 입력 보충(UI가 폼 필드를 만들면 shim 또는 fixture에 나목 추가).
4. `helpers.ts` 766줄(≥750 위험구간) — echo +1줄만 추가하고 분리는 하지 않았다(설계 §9-8 방침). `types/transfer-mixed-use.types.ts` 1,022줄은 타입 전용(정책 예외).
5. 계획서 §7 미해소 그대로: 공시 후 취득 + 토지·건물 취득일 상이의 직접 선례 · 국세청 고시 현행 산식 텍스트 · 개별주택가격 ↔ 가목+나목 괴리 표본.
6. 상속·증여 + 주택:상가 공통비용 안분(C8 `apportionAcquisitionPrice`)은 H가 없으면 `housingStd = 0`이라 주택분 몫이 0 — Q-B(H 없음)에서 **공통 자본적지출·양도비의 주택:상가 안분**은 이번 범위(불변 지시)라 그대로다. 신고가액만 입력 + 공통비용을 쓰는 경우의 영향은 미측정(별건 확인).

**검증 결과(최종)**: `npx tsc --noEmit` 0건 · `npx vitest run __tests__/tax-engine/ __tests__/api/ __tests__/calc/ __tests__/lib/`(`--reporter=json`) **24,089 passed · 0 failed · 13 pending(기존 skip)** (8,068 suites). `__tests__/components/` 전체 실행(보충 전 측정): **16파일 실패** 중 node 2파일은 import 교체로 해소(8 passed), **dom(`.test.tsx`) 14파일 미수정** — 개별 실패 38건(`mixed-use-count-exclusion-cards` 6 · `mixed-use-housing-estimated-numerator` 6 · `mixed-use-reduction-detail-cards` 7 · `mixed-use-surcharge-lthd-exclusion` 6 · `transfer-final-tax-stack-invariant` 4 · `transfer-result-view-amount-invariants` 2 · `valuation-cards-view-parity` 3 · `calc/detailed-statement-lthd-fallback` 4) + 모듈/describe 수준 실패 6파일(`mixed-use-acq-building-day-result-follow` · `mixed-use-disclaimer` · `mixed-use-filing-form-4col` · `mixed-use-filing-form-per-part-date` · `mixed-use-high-value-judgment-l10` · `mixed-use-high-value-row-oh61-oh17` — 엔진 호출이 describe 본문에서 throw). 전부 「양도시 주택건물 기준시가(나목)가 필요합니다」 또는 그 파생 — UI 단계에서 입력 보충(항등이면 값 불변 예상, 미확인).
E2E 미측정(설계 §5 그대로).

---

### 후속 2건 (2026-10-07 — 검토 요청 반영)

**1. raw_ratio 범위를 Q-B 확정 범위로 축소**
- leaf 신규/변경 시그니처 (`mixed-use-housing-std.ts`):
  ```ts
  export interface HousingStdNeedInput { usePhd?; partialDirection?; byInheritanceOrGift?: boolean }  // byInheritanceOrGift는 H 술어만 사용
  export function isHousingPriceAtTransferRequired(i): boolean // usePhd !== true
  export function isHousingPriceAtAcqRequired(i): boolean      // usePhd !== true && partialDirection !== "commercial_to_house" && byInheritanceOrGift !== true
  export interface SplitMixedUseHousingStdArgs { …; allowRawRatio?: boolean }   // 기본 false — H ≤ 0이면 throw
  ```
  나목 술어 2종은 불변(상속·증여도 나목은 필수).
- 엔진: 양도시 H_T ≤ 0(비-PHD) → throw 「양도시 개별주택가격…」 · 취득시 H_A ≤ 0 + (상속·증여 아님) + (PHD·상가→주택 아님) → throw 「취득시 개별주택가격…」. `allowRawRatio`는 취득시 **상속·증여일 때만** true. 양도시는 항상 false.
- ⑫: 비-PHD 양도시 `housingPrice > 0` 필수 추가(종전 `.nonnegative()`가 0을 허용 → 400). 취득시 H는 종전 규칙(환산·실가·감정·상속증여)이 이미 같은 조건을 요구한다 — **격자 anchor(R-8)로 ⑫ ⊇ 엔진을 실측**(환산·실가·감정 400 / 상속·증여·상가→주택 200).
- PHD 양도시 `transferStandardPrice.housingPrice = 0`은 **기존 동작 유지(200)** — 실측: 이 값이 주택:상가 양도가액 안분 분자(`apportionTransferPrice`)라 0이면 housingRatio 0 → 주택 양도가액 0(결정세액 811,661,423 vs 정상 801,651,505). S3-2 이전부터의 별건 — R-9가 현행 고정, 확인 필요.
- 사례14 등 H 미공시 엔진 직접 입력 fixture(`mixedUseCase14()`): 1992 토지·1997 신축 취득이라 **법적으로는 공시 전 취득 주택(§164⑦ PHD 대상)** 이지만 fixture는 PHD 3시점 입력 없이 H만 비운 **불완전 입력**이고 테스트 주제는 비과세 요건·중과·장특이다. PHD로 바꾸면 모든 수치가 달라지므로 test helper가 **항등 H = 가목 + 나목(= L_A + 1)** 으로 채운다(B0이면 건물일 가목 = 토지일 가목). ⚠️ **기대값은 보존되지 않는다** — 종전엔 환산 분자 0(취득가액 0)이었고, H가 생기면 취득가액·양도차익이 생긴다. 항등 H로 값 보존은 불가능(est ≥ 1원 단위가 아니라 수억 원 단위). route body shim은 H를 채우지 않는다(H 부재는 ⑫ 검증 대상 — MU-1·cb-mu-cp 「생략 → 400」 보존).
- **기대값이 바뀐 테스트(이 후속 한정 — 43건 / 5파일, 사례14 fixture의 취득가액 0 → 항등 H 반영)**: `mixed-use-part-cards.equivalence`(EQ-1·EQ-2) · `mixed-use-104-7-surcharge`(B-B11·B12·B13·B17·B18 + CLAUSE1_AFTER_B2 상수) · `mixed-use-154-1-holding`(B-11·B-12·B-14·B-17·B-18) · `mixed-use-154-1-residence`(상수 4개 → 13건) · `mixed-use-appurtenant-excess-filing-form-f35`(케이스 A·B 수치 18건, 4열 합·자기정합 불변식 단언은 불변). 테스트 주제(요건 판정·세율 가산·표1/표2·파트 카드 등가)는 불변이고 수치만 H 반영값으로 재산출. 재산출은 엔진 출력(autofix 스크립트)이며 손계산 근거는 항등 H 정의 + 종전 대비 취득가액 증가분. 주석의 손계산 수치(종전 값)는 일관성을 맞춰 정정.
- 뮤테이션 추가: **M14a**(취득시: 엔진 H 검사 제거 + 항상 허용 + leaf throw 제거) KILLED 2 · **M14b**(양도시 동일) KILLED 2 · **M14c**(⑫ H_T 필수 제거) KILLED 1 · **M14d**(leaf H 술어에서 상속·증여 면제 제거) KILLED 7. M1~M13 재확인 전부 KILLED.

**2. C8 실측 — Q-B 경로의 공통 자본적지출·양도비 주택:상가 안분** (수정하지 않음, 사용자 결정)
- 원인: `apportionAcquisitionPrice`(`helpers.ts:172`)의 주택 축이 `acquisitionStandardPrice.housingPrice ?? 0` — Q-B(H 없음)이면 0 → housingRatio 0 → 공통 자본적지출의 **주택분 몫 0**, 상가분이 전액 흡수. 양도비는 `apportionTransferPrice`(양도시 H_T)라 영향 없음.
- 프로브(상속 + 신고가액만, 주택 100㎡·상가 100㎡, 양도 30억, 공통 경비 1천만 원): 

  | | 자본적지출 1천만 → 주택/상가 | 양도비 1천만 → 주택/상가 | 세액 |
  |---|---|---|---|
  | H 없음 — **S3-2 이전(원본 코드)** | 0 / 10,000,000 | 5,517,241 / 4,482,759 | 723,495,000 |
  | H 없음 — S3-2 후 | 0 / 10,000,000 (**동일**) | 5,517,241 / 4,482,759 (토지:건물 내부 배분만 변동) | 723,495,000 |
  | H 400M 있음 | 6,666,666 / 3,333,334 | 5,517,241 / 4,482,759 | 723,495,000 |

  → **S3-2 이전부터의 기존 결함**(원본 코드에서도 동일). 이 fixture는 주택·상가 모두 과세라 세액이 같지만, **주택분이 비과세(1세대1주택 12억 이하)** 이면 상가분에 전액이 몰려 달라진다 — 주택 150㎡·상가 50㎡·양도 15억·1세대1주택·공통 자본적지출 1억: H 없음 상가분 공제 100,000,000 · 상가 양도차익 256,521,740 · **세액 44,073,478** / H 400M 있음 상가분 공제 25,925,926 · 상가 차익 330,595,814 · **세액 68,843,849**(주택분 공제 74,074,074). H가 없을 때 비과세 주택분에 배분돼야 할 필요경비가 과세 상가분에 쏠려 **세액이 낮아진다**(납세자 유·불리 단정은 금지 — 방향만 사실로 기록).
- 법령 본문(KoreanLaw MCP, 소득세법 MST 시행 20260701 · 시행령 MST 290841 시행 20261001):
  · 법 §99①1호 **라목** = 개별주택가격·공동주택가격 — **가목(토지)+나목(건물)의 합이 아니다**. 개별주택가격·공동주택가격이 없는 주택은 「납세지 관할 세무서장이 인근 유사주택의 개별주택가격 및 공동주택가격을 고려하여 대통령령으로 정하는 방법에 따라 평가한 금액」(영 §164⑪1호 — 표준주택 비준표 평가).
  · 가목+나목 합계가 등장하는 곳은 **영 §164⑦**(개별주택가격 **공시 전 취득**의 취득당시 기준시가 환산식의 **비율 요소** 「취득당시의 가목의 가액과 나목의 가액의 합계액」)뿐이다 — 라목 가액 자체의 대용이 아니다.
- 대안 (사용자 결정): **(A) 현행 유지** — 상속·증여 + 신고가액만 입력이면 공통 자본적지출이 상가로 쏠린다는 고지 · **(B) 주택 축 = 세무서장 평가 라목 가액(영 §164⑪)을 필수 입력** — H와 같은 입력 칸(Q-B의 「H 불요」를 C8 사용 시(공통 자본적지출 입력 시)에만 철회) · **(C) 주택 축에 가목+나목을 대용** — 법 §99①1호 라목에 근거 없음(위 확인: 라목 ≠ 가목+나목). 상가 축은 상가토지 가목 + 상가건물 나목이라 척도는 맞지만 **법문상 대용 규정이 없어 권고하지 않는다**(「법 근거 없이 불리 적용 금지」) · **(D) 신고가액을 주택 축으로** — 신고가액은 취득가액(§163⑨)이지 기준시가가 아니라 §100② 후문 「해당 자산의 가액」에 닿는지 미확인(확인 필요). **권고: (B) 또는 (A)+고지** — (C)·(D)는 해석 근거 확보 전 보류.


---

## §11 Q-A 변경 — β → γ1 (2026-10-07 사용자 확정)

사용자가 제시한 양도소득세 집행기준 99-164-9 원문(1995 토지 / 2000 신축 / 2005 최초공시 사례)은 토지·건물 취득일이 다른 경우에도 토지의 취득당시 기준시가를 **원값(50백만)이 아니라 「취득당시 주택가격」의 비례 몫(37,500천원)**으로 정한다. β의 근거(토지 원값 유지)가 반박되어 γ1로 바꿨다.

- 산식(`splitMixedUseHousingStd`, kind `separate_date_converted`): P = ⌊H_b × (L_A + N_b) ÷ (L_b + N_b)⌋ · 토지분 = ⌊P × L_A ÷ (L_A + N_b)⌋ · 건물분 = P − 토지분. echo에 `landStdAtLandAcq`(L_A)·`convertedHousingTotal`(P) 추가.
- 항등: H_b = L_b + N_b이면 P = L_A + N_b → 토지분 = L_A(종전 B0·β와 1원 동일). 건물분 = H_b × N_b ÷ (L_b + N_b)는 β와 같다(이중 floor로 ±1원 가능).
- 실측(predo B-5 픽스처): 기준시가 토지 96,000,000 · 건물 256,000,000(P 352,000,000), 환산 취득가 112,852,664 / 300,940,439, 개산공제 2,880,000 / 7,680,000, 결정세액 환산 680,547,003 · 실가 594,231,865 · 감정 588,622,345(β는 680,493,084 / 594,482,542 / 588,646,222).
- 갱신 테스트: predo B-5·R-B1, do anchor B0 leaf·E-2(+ 항등 케이스 추가), 결과 화면 anchor B0 블록, E2E H11(항등 픽스처 — 값 불변, kind·P 줄만). 뮤테이션(γ1 → β 토지 원값): 5 실패 KILLED.
