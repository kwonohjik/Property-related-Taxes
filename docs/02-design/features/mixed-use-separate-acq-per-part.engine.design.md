# 겸용주택 별개 취득 — 파트별 취득가액 산정방식·취득가액 (B1) 엔진 설계

> 작성 2026-10-07 · 워크트리 `Property-related-Taxes-b1` · 브랜치 `feat/mixed-use-separate-acq-per-part` (master `7dd290e4d` 병합 기준)
> 상태: **Do 완료(엔진 + API ⑫⑭ 층, 2026-10-07)** — 구현 결과·UI 회신은 **§11**. 클라이언트 ①~⑧·컴포넌트는 UI 에이전트 몫(미착수). Pre-Do anchor `__tests__/api/transfer.route.mixed-use-separate-acq-per-part.b1.predo.anchor.test.ts` — skip 14건 전부 해제(24 passed).
> 상위 계획서 `docs/00-pm/transfer-split-acq-per-part-method.plan.md` §5 B1·B1-V2 · 해석례 조사 `mixed-use-separate-acq-authority-research.md` · 선행 `housing-std-split-proportional.plan.md` §10(S3-2).
> 짝 문서: UI 설계 `mixed-use-separate-acq-per-part.ui.design.md`(다른 에이전트 작성 — 이 문서에서 수정하지 않음).
> 표기: 「확인 필요」 = 미검증. file:line은 이 워크트리에서 직접 확인한 것만. 수치는 throwaway probe(`__tests__/zz-probe-b1.test.ts` — 삭제함, 원자료 scratchpad `b1-probe.json`) 실측이며 **mock 세율표** 기준이다(정본 세액 아님). fixture는 가상(실제 신고 사례 아님).

## 0. 요약

**한 줄**: 겸용주택 토지·건물 취득일이 다르면 **토지 파트·건물 파트가 각각 {실가·감정·매매사례·환산} 중 하나**를 고르고, 각 파트 값은 **S-1(토지: 토지일 가목 비율 = 면적비) · S-2(건물: 용도별 계약액, 없으면 건물일 나목 비율)** 로 주택/상가에 나뉘어 **4부분(주택부수토지·주택건물·상가부수토지·상가건물)** 취득가액이 된다. 환산 파트는 **현행 환산 값 그대로**(상대 파트 모드와 독립), 개산공제는 **비-실가 파트에만** 현행 basis × 3%.

| 항목 | 결정 |
|---|---|
| 입력 | `MixedUseAssetInput.separateAcquisition?: { landMode, buildingMode, landAcquisitionPrice?, landSalesCaseValue?, buildingAcquisitionPrice?, buildingSalesCaseValue?, housingBuildingContractPrice? }` — **필드 존재 = 파트 모델, 부재 = 현행 총액 모델**(구 이력 무영향). 단건 주택 split 규약과 이름·의미 일치(감정값은 `*AcquisitionPrice` 공용, 매매사례는 별도 필드) |
| 4부분 결합 | 토지값 → 주택부수토지:상가부수토지 = `apportionByStdPrice(값, 토지일 가목×주택부수면적, 토지일 가목×상가부수면적)` · 건물값 → 주택건물:상가건물 = 계약액 우선 / 건물일 나목 : 상가건물 기준시가. 환산 파트 = 현행 `E_h`·`E_c` 분할값 |
| 개산공제 (S-5 확정안) | **파트별**·**비-실가 파트에만** · base = 현행 취득시 기준시가 basis(주택 γ1 비례값 · 상가 가목·나목 원값) × 3%(미등기 3/1000) · 성분별 독립 floor · 지분 스케일 현행 |
| 양도가액·보유기간 | **현행 유지** — probe로 확인(환산·실가 총액·감정 총액 3모드에서 4분할 양도가액 동일, 보유기간은 파트별 기존 로직) |
| 게이트 (D-4) | `isSeparateAcquisition()`의 겸용 제외(`lib/calc/transfer-tax-split-acq-mode.ts:303`)를 **해제하지 않는다** — 겸용 전용 술어 신설(§5) |
| 결합 제외 | 용도변경 · 공익수용 · 상속·증여 · 총액 모델 플래그 동시 지정 · 같은 취득일 · 값 누락 — 엔진 throw + ⑫ 400 + ⑧ 차단 3중(§4) |
| S-4 PHD | 포함 — PHD는 **환산 파트가 있을 때만** 의미(Q3: 토지일 가목 + 건물일 나목을 §164⑦ 분자에 대입). 현행 PHD 엔진이 이미 두 날짜 값을 받으므로 신규 계산은 없고 **파트별 선택·필수 술어**가 새 일이다 |
| 새로 드러난 것 | ① 필수 술어가 모드 키여야 한다(양쪽 실가면 H_A·L_b 불요) — 기존 3개 술어가 거짓 요구를 만든다 ② 별개 취득 환산 분자가 `H_A`(건물일 결합가)이고 γ1 취득당시 주택가격 `P`가 아니다 — 세액 +15,966,395 차이(§2.4, 별건 Q-6) ③ `transfer-tax-mixed-use-helpers.ts`가 766줄 — 신규 로직은 새 leaf로 |

**사용자 결정이 필요한 것**(§9): Q-1 용도별 계약액 형태·적용 모드 · Q-2 구 이력 해석(opt-in) · Q-3 §97②2호 단서 판정 단위 · Q-4 라목 한 덩어리 개산공제의 파트 혼합 · Q-5 총액 모델 존치 · Q-6 환산 분자 H_A vs P(별건).

## 1. 선행 결정·법령 근거

### 1.1 선행·사용자 결정 (그대로 수용)

| 출처 | 내용 | B1에서의 쓰임 |
|---|---|---|
| S-1 (2026-10-06) | 토지 파트 → 주택부수/상가부수 = 토지 기준시가 비율(같은 필지 = 면적비). 근거 표기 「소득세법」 §100② 후문 **유추** | 토지 파트 분할 |
| S-2 (2026-10-06) | 건물 파트 → 주택건물/상가건물 = 용도별 계약액(도급계약서·세금계산서) 우선, 없으면 건물 취득일 나목 비율 | 건물 파트 분할 |
| S-3 = S3-1·S3-2 (master 병합) | 개별주택가격 분할 뺄셈 → 가목:나목 비례. 겸용 B0는 γ1(집행기준 99-164-9) | 주택 파트 basis(γ1) = 개산공제 base · 환산 분할 |
| S-4 | PHD 결합 포함 | §3.3 |
| S-5 | 개산공제는 S-3 연동 — 이번에 확정 | §3.4 |

### 1.2 법령 본문 확인 (KoreanLaw MCP — 2026-10-07)

| 조문 | MST·시행 | 본문 요지(직접 확인) | B1 연결 |
|---|---|---|---|
| 「소득세법」 §100② | 280405 · 2026.1.1 | 「**양도가액 또는 취득가액을 실지거래가액에 따라 산정하는 경우로서 토지와 건물 등을 함께 취득하거나 양도한 경우**」 각각 구분 기장, 구분 **불분명**할 때 기준시가 등을 고려해 안분. 후문 「**공통되는 취득가액과 양도비용**은 해당 자산의 가액에 비례하여 안분」 | 별개 취득은 파트 값이 실재 → 전문의 안분 전제 밖. S-1·S-2는 후문 **유추**(직접 대상 아님 — 문서·화면 모두 「유추」 표기) |
| 「소득세법」 §100③ | 〃 | 「토지와 건물 등을 **함께 취득하거나 양도한 경우**로서 구분 기장 가액이 안분가액과 100분의 30 이상 차이…불분명으로 본다」 | **별개 취득 파트 값에는 적용하지 않는 독법**(함께 취득 아님) — 해석례 없음, 추론(V-3). 양도가액 측(함께 양도)은 B1 범위 밖·현행 |
| 「소득세법 시행령」 §163⑥ | 290841 · 2026.10.1 | 1호 토지 = 취득당시 **개별공시지가×3/100**(미등기 3/1000) · 2호가목 = **다목 건물(부수토지 포함) 및 라목 주택** 취득당시 다목·라목 가액×3/100 · 2호나목 = 가목 외 건물 나목 가액×3/100 | S-5: 주택(부수토지 포함)은 **라목 한 덩어리**(2호가목), 상가토지=1호, 상가건물=2호나목. 현행 엔진 base와 일치(§3.4) |
| 「소득세법 시행령」 §176의2② | 〃 | 2호: 토지·건물 환산 = 양도당시 실지거래가액 × 취득당시 기준시가 ÷ 양도당시 기준시가. **개별주택가격 최초 공시 전 취득 주택과 부수토지를 함께 양도**하면 분자를 §164⑦로 | 환산 파트 산식·PHD 결합 |
| 「소득세법 시행령」 §176의2③ | 〃 | 추계 시 매매사례(1호) → 감정(2호) → 환산(3호) → 기준시가(4호) **순차**, 「**해당 자산**」 단위. 매매사례·감정 창은 「양도일 또는 취득일 **전후 각 3개월**」 | 파트별 산정방식 혼합의 문언 근거(「해당 자산」). 감정·매매사례 기준일은 **자산별 취득일**로 각각 걸린다(⑧ — §6) |
| 「소득세법 시행령」 §164⑦ | 〃 | 개별주택가격 공시 전 취득 주택의 취득당시 기준시가 = 최초공시가 × (**취득당시** 가목+나목) ÷ (최초공시당시 가목+나목) | PHD(Q3). 「취득당시」가 토지·건물에 하나로 정해지지 않는 공백은 대법원 97누15746·조심2008서1720이 「토지 취득 당시 + 건물 취득 당시를 바로 대입」으로 메움(조사 문서 Q3, 높음) |
| 「소득세법 시행령」 §164③ | 〃 | 새 기준시가 고시 전 취득·양도는 **직전** 기준시가 | 각 파트 기준시가 = 그 파트 **자기 취득일의 직전 고시분** |

### 1.3 해석례 조사 결론 → 설계 반영 (조사 문서 §0 재인용 — 원문 대조는 조사 문서 §6 한계 그대로)

| Q | 결론 | 설계 반영 |
|---|---|---|
| Q2 환산 | 자산별·각자 자기 취득일 기준시가 | 환산 파트 분자 = 토지 파트 토지일 · 건물 파트 건물일. 양도가액 안분이 같은 기준시가를 쓰는 한 「주택 1회 환산 → 분할」과 「파트별 환산」은 같은 값 |
| Q3 §164⑦ | 정면 근거(대법원) | PHD 분자 = 토지일 가목 + 건물일 나목 (현행 엔진 입력 구조 그대로) |
| Q4 혼합 | 가능(서면4팀-566, 대전고법 2009누377, 조심2023광10375) — **「실가+감정」 조합 문헌 없음** | 4×4 허용. 같은 문언(「해당 자산」)상 달리 볼 이유 없다는 **추론** — 문서·UI에 고지 |
| Q1 | 정면 해석례 없음 | S-1·S-2는 **사용자 결정**(근거 없는 선택은 「설계 선택」으로 표기) |

## 2. 현행 실측 (probe)

### 2.1 코드 추적 — 겸용 취득가액이 지금 어떻게 나뉘는가

| 단계 | 위치 | 동작 |
|---|---|---|
| 양도가액 | `transfer-tax-mixed-use-helpers.ts:108` `apportionTransferPrice` | 총양도가 → 주택분:상가분 = 양도시 H_T : (상가토지+상가건물) |
| 총액 안분 | `:172` `apportionAcquisitionPrice` · `transfer-tax-mixed-use.ts:240` | 실가·감정·매매사례 **총액 1개**를 주택분:상가분 = H_A(건물일 결합가) : (상가토지 **토지일** ㎡당 × 면적 + 상가건물 **건물일**) — **날짜 섞인 비율** |
| 주택분 → 토지·건물 | `transfer-tax-mixed-use-housing.ts:371` `splitMixedUseHousingStd` (γ1) · `:392` | 주택 취득가액을 γ1 basis 비율로 |
| 상가분 → 토지·건물 | `transfer-tax-mixed-use-commercial.ts:231` | 상가 가목 원값 : 나목 원값 비율로 |
| 환산 | `-helpers.ts:241` `calcHousingEstimatedAcq`(주택: 양도주택분 × H_A ÷ H_T) · `-commercial.ts:215`(상가: × (CLA+CBA) ÷ (CLT+CBT)) | 환산 총액 → basis 비율로 분할 |
| 개산공제 | `-housing.ts:399-424` · `-commercial.ts:236-262` | `usesDeemedAcq`(상속·증여·**실가**) = 실제 필요경비, 그 밖(환산·**감정·매매사례**) = 3% |
| 단서 | `transfer-tax-mixed-use.ts:332-358` | **자산 단위**·환산 전용(`provisoEligible` — 실가·감정·상속·증여 제외) |
| 산정방식 | `MixedUseAssetInput.useActualAcquisition`/`useAppraisalSalesAcquisition`/(둘 다 없음=환산) — **자산 전체 1벌** (`types/transfer-mixed-use.types.ts:456·470`) | 파트별 모드·금액 입력 경로 **전무** |
| 게이트 | `lib/calc/transfer-tax-split-acq-mode.ts:303` 겸용 제외 · `CompanionAcqPurchaseBlock.tsx:470` `isSplit && !isMixedUse` 파트 블록 숨김 | 의도된 제외(B1 전까지) |

### 2.2 probe 수치 (가상 fixture · mock 세율 · 양도가 30억 · 토지 2005-06-10/건물 2010-03-15)

| # | 입력 | 주택 취득가 토·건 | 상가 취득가 토·건 | 개산공제 주택 / 상가 | 세액 |
|---|---|---|---|---|---|
| E1 | 별개 환산 | 112,852,664 / 300,940,439 | 124,137,930 / 82,758,621 | 2.88M·7.68M / 3.6M·2.4M | 680,547,003 |
| E2 | 별개 실가 총액 900M | 163,636,363 / 436,363,637 | 180,000,000 / 120,000,000 | 0 / 0 | 594,231,865 |
| E3 | 별개 감정 총액 900M | 〃(E2와 같음) | 〃 | 2.88M·7.68M / 3.6M·2.4M | 588,622,345 |
| E4 | 같은 취득일 실가 900M | 144,000,000 / 456,000,000 | 180M / 120M | 0 | 611,249,483 |
| E6 | 별개 PHD 환산(1998/2000) | 64,655,172 / 64,655,172 | 51,724,137 / 31,034,483 | 1.875M·1.875M / 1.5M·0.9M | 809,196,027 |
| E7 | 별개 PHD + 실가 | **throw** 「겸용 취득 실거래가 + 미공시(PHD)·보유 중 용도변경 조합은 아직 지원하지 않습니다」 | | | |
| E12 | E1 + 자본적지출 900M·양도비 30M | 단서 `direct`(취득가액 0) | | 173.57M·442.98M / 192.41M·121.03M | 584,582,624 |
| E13 | E6 + 같은 비용 | 단서 `direct` | | | 581,030,374 |

**확인된 사실**
1. **산정방식 1벌 제약** — E2·E3: 사용자가 토지·건물 값을 따로 알아도 총액 하나로 합쳐 넣어야 하고, 엔진이 H_A 비율로 주택/상가를 나눈다. 토지 합계 = 163.6M+180M, 건물 합계 = 436.4M+120M가 **되어버린다** — 실제 토지·건물 값과 무관.
2. **양도가액 불변** — E1·E2·E3 모두 4분할 양도가액이 `[993,103,447 / 662,068,966] · [1,241,379,311 / 103,448,276]`. 양도가액·양도시 안분은 B1이 건드리지 않는다.
3. **보유기간 파트별** — 코드 `-housing.ts:434-440`·`-commercial.ts:278-284`(토지=토지일, 건물=건물일) · E1 장기보유공제율 0.28(혼합).
4. **신규 중첩 필드는 지금 strip** — 엔진 직접 호출은 무시(E8: 결과 동일), Route는 ⑫가 strip(R2: 상태 200 · 세액 680,547,003 동일). → anchor P-1이 이를 고정하고 R-B1이 긍정 짝.
5. 환산 총액 = 양도 주택분 × H_A ÷ H_T = 413,793,103 — 합계 분자는 **H_A=400M**이며 분할 basis 합(γ1 P=352M)과 다르다(§2.4).

### 2.3 실가·PHD 가드 위치 (현행 — B1이 총액 모델에 대해 유지)

| 가드 | 위치 |
|---|---|
| 엔진 throw (실가·감정 + PHD·용도변경) | `-helpers.ts:254-262` |
| 엔진 throw (실가·감정 + 공익수용) | `-helpers.ts:261`, `-commercial.ts:142` |
| ⑧ (같은 3조합) | `lib/calc/transfer-tax-validate-mixed-use-asset.ts:84-92` |
| ⑫ | 총액 필수·H_A 필수 `transfer-tax-schema-mixed-use.ts:154-160` |

### 2.4 발견 — 별개 취득 환산 분자 `H_A` vs γ1 취득당시 주택가격 `P` (B1 범위 밖 · 별건 Q-6)

S3-2 Q-A γ1은 별개 취득의 주택 **basis**를 `P = ⌊H × (토지일 가목 + 나목) ÷ (건물일 가목 + 나목)⌋`(= 352M)로 바꿨다(plan §10 「범위 밖: 환산 분자/분모」). 그러나 환산 총액의 **분자는 여전히 `H_A`(400M)**다. 집행기준 99-164-9가 「취득당시 주택가격」을 환산 분자로 쓰는 것과 같다면 분자도 `P`여야 한다. 실측 E11(H_A=352M·L_b=토지일 단가로 두어 P=H_A가 되게 함): 주택 환산취득가 **413,793,103 → 364,137,930**(−49,655,173) · 세액 **680,547,003 → 696,513,398**(+15,966,395). **법령상 정답 여부는 미판정** — 99-164-9는 최초공시 가격 → 취득당시 가격의 환산 절차이고, 그 결과를 다시 환산 분자로 쓰는지는 원문 확인 필요. **B1은 현행 값을 정본으로 보존**(양쪽 환산 = 현행과 1원 동일이 회귀선)하고 별건으로 올린다.

## 3. 모델 설계

### 3.1 입력

```ts
// lib/tax-engine/types/transfer-mixed-use-part-acq.types.ts (신규 — 타입 전용. types/transfer-mixed-use.types.ts는 이미 1031줄)
import type { PartAcqMode } from "@/lib/calc/transfer-tax-split-acq-mode"; // 엔진이 이미 이 모듈을 import 중(transfer-tax-split-acq-price.ts:16)
export interface MixedSeparateAcquisition {
  landMode: PartAcqMode;                 // actual | estimated | appraisal | salesCase
  buildingMode: PartAcqMode;
  landAcquisitionPrice?: number;         // actual | appraisal 공용 (단건 주택 split 규약 D-3)
  landSalesCaseValue?: number;           // salesCase
  buildingAcquisitionPrice?: number;     // actual | appraisal 공용 — S-2 분할 대상 **총액**
  buildingSalesCaseValue?: number;
  housingBuildingContractPrice?: number; // S-2 — buildingMode==="actual" 한정. 상가건물 = 총액 − 이 값(도출)
}
// MixedUseAssetInput 에 `separateAcquisition?: MixedSeparateAcquisition`
```

- **존재 = 파트 모델 / 부재 = 총액 모델.** 기본값 뒤집기 금지(memory `feedback_flipping_enum_default_rewrites_absent_records`): 기존 이력은 필드가 없으므로 현행 총액 모델로 해석된다. ④는 **명시 opt-in 폼 필드**가 켜졌을 때만 이 객체를 싣는다(UI 설계가 폼 필드 이름을 정한다 — 엔진 계약은 「객체 존재」뿐).
- 지분(`ownershipRatio`) — 절대금액 5종(`landAcquisitionPrice`·`landSalesCaseValue`·`buildingAcquisitionPrice`·`buildingSalesCaseValue`·`housingBuildingContractPrice`)은 ④에서 `share()`로 스케일(`transfer-tax-api-mixed-use.ts:`의 기존 `acquisitionActualTotalPrice` 규약과 같음), 기준시가·면적은 100% 유지.
- 자산 단위 총액 모델 필드(`useActualAcquisition`·`useAppraisalSalesAcquisition`·`acquisitionActualTotalPrice`·`acquisitionByInheritance`·`acquisitionByGift`)와 **동시 지정 금지**(§4) — 두 번째 override가 첫째를 가리는 상태를 만들지 않는다(memory `feedback_mutation_masked_by_second_override`).

### 3.2 4부분 결합 — 모드 조합별 산식

**기호**: `LV` 토지 파트 값 · `BV` 건물 파트 값 · `HL/CL/HB/CB` 주택부수토지·상가부수토지·주택건물·상가건물 취득가액.
`HLs = multiplyByArea(landPricePerSqm(토지일), residentialLandArea)`, `CLs = multiplyByArea(landPricePerSqm, commercialLandArea)` — **토지일** 가목. `N` = 건물일 주택건물 나목(`acquisitionStandardPrice.housingBuildingPrice`, PHD면 `preHousingDisclosure.buildingStdPriceAtAcquisition`), `CBs` = 건물일 상가건물 기준시가(`commercialBuildingPrice`).

| 파트 모드 | 파트 값 | 4부분 분할 | 개산공제(§3.4) |
|---|---|---|---|
| **토지 actual** | `landAcquisitionPrice` | **S-1** `apportionByStdPrice(LV, HLs, CLs)` → HL, CL(잔액 흡수) | 없음(실제 필요경비 — §3.5) |
| 토지 appraisal | `landAcquisitionPrice` | 같음 | 있음 |
| 토지 salesCase | `landSalesCaseValue` | 같음 | 있음 |
| **토지 estimated** | 현행 환산 총액의 토지분 | 현행 분할값 그대로: 주택 `E_h` → γ1 basis 비율의 토지분, 상가 `E_c` → (CLA : CBA)의 토지분 | 있음(단서 후보) |
| **건물 actual** | `buildingAcquisitionPrice` | **S-2** 계약액 없음: `apportionByStdPrice(BV, N, CBs)` → HB, CB · 계약액 있음: `HB = housingBuildingContractPrice`, `CB = BV − HB` | 없음 |
| 건물 appraisal | `buildingAcquisitionPrice` | **S-2 나목 비율만**(Q-1 권장: 계약액은 actual만) | 있음 |
| 건물 salesCase | `buildingSalesCaseValue` | S-2 나목 비율 | 있음 |
| **건물 estimated** | 현행 환산 총액의 건물분 | 현행 분할값 | 있음(단서 후보) |

**불변식 (anchor B-4·B-5·B-6)**: 환산 파트의 값은 **상대 파트 모드와 무관하게 양쪽 환산일 때의 값과 같다.** 따라서 「양쪽 환산」을 파트 모델로 보내면 현행 총액-환산 모델과 **1원 일치**(B-6, 회귀 R-1). 이 불변식이 구 이력 호환과 Q2(자산별 독립)를 한 번에 지킨다. 환산 파트를 계산하려면 현행 환산 경로(`calcHousingEstimatedAcq`의 §97 직접 환산 또는 PHD)를 **모드와 무관하게 돌려 `E_h`·`E_c`를 얻고** 그 중 환산 파트만 취한다.

**4×4 수치 예 (가상 fixture, 양도가액은 R-2의 4분할 그대로)**

| 토지 / 건물 | HL / CL | HB / CB | 개산공제 HL·CL / HB·CB | anchor |
|---|---|---|---|---|
| 실가 500M / 실가 400M | 250M / 250M | 320M / 80M | 0·0 / 0·0 | B-1 |
| 실가 / 감정 400M | 250M / 250M | 320M / 80M | 0·0 / 7,680,000·2,400,000 | B-2 |
| 감정 500M / 실가 | 250M / 250M | 320M / 80M | 2,880,000·3,600,000 / 0·0 | B-3 |
| 실가 / 환산 | 250M / 250M | 300,940,439 / 82,758,621 | 0·0 / 7,680,000·2,400,000 | B-4 |
| 환산 / 실가 | 112,852,664 / 124,137,930 | 320M / 80M | 2,880,000·3,600,000 / 0·0 | B-5 |
| 환산 / 환산 | 현행(E1) | 현행(E1) | 현행(E1) | B-6 |
| 실가 / 실가 + 주택건물 계약 300M | 250M / 250M | 300M / 100M | 0 | B-7 |
| 매매사례 520M / 실가 | 260M / 260M | 320M / 80M | 2,880,000·3,600,000 / 0·0 | B-8 |
| PHD: 실가 300M / 환산 | 150M / 150M | 64,655,172 / 31,034,483 | 0·0 / 1,875,000·900,000 | B-9 |

(기대값은 anchor가 독립 BigInt·하드 리터럴로 적었다. **세액은 Do에서 실측 후 고정** — 파트 입력 모델이 아직 없어 지금은 산출할 수 없다. 확인 필요 V-1.)

### 3.3 PHD(§164⑦) 결합 (S-4)

- **술어**: `usePreHousingDisclosure ∧ 환산 파트 존재`일 때만 PHD 경로. 환산 파트가 없으면 PHD는 소비처가 없다 → ④는 `usePreHousingDisclosure`를 **싣지 않고**(`transfer-tax-validate-split` 쪽 「노출 ⇔ 도달」 선례 — `ownerSplitHousingNeedsBuildingStd`의 PHD 주석), ⑫는 「PHD ON인데 환산 파트 없음」을 400, ⑧은 요구하지 않는다(UI는 PHD 칸을 숨김 — 같은 술어).
- **계산**: 현행 `calcPreHousingDisclosureGain`이 `Sum_A = landPricePerSqmAtAcquisition × area + buildingStdPriceAtAcquisition`을 한 번에 받는다 — 토지일 단가와 건물일 건물 기준시가를 **서로 다른 날짜 값으로** 넣을 수 있는 구조라 대법원 97누15746·조심2008서1720의 「바로 대입」을 이미 충족한다(E6가 별개 취득 PHD를 이미 계산). 신규 엔진 계산은 없다. 환산 파트 값 = PHD 결과의 `landAcquisitionPrice`/`buildingAcquisitionPrice`(주택)와 현행 상가 환산(`calcCommercialGainSplit`) — 불변식 그대로.
- **실가 + PHD**: 총액 모델은 throw 유지(R-7). 파트 모델은 비-환산 파트가 PHD 계산을 소비하지 않으므로 허용(B-9: 토지 실가 + 건물 PHD 환산). S-2의 `N`은 PHD면 `buildingStdPriceAtAcquisition`을 쓴다(건물일 값).
- **열린 점(확인 필요 V-4)**: ④의 PHD `landSqmAtAcq`(`transfer-tax-api-mixed-use.ts:` `phdLandPricePerSqmAtAcq || mixedAcqLandPricePerSqm || …`)가 **토지 취득일 기준 값**인지, `phdBuildingStdPriceAtAcq`가 **건물 취득일 기준 값**인지 — 화면 라벨·캡션이 날짜를 지시해야 Q3와 맞는다. UI 설계와 조율.
- **용도변경 + PHD(Case A/B)** 는 제외(§4) — 취득시 주택/상가 구성이 시점별로 달라 S-1·S-2의 「현재 면적」 가정이 깨진다.

### 3.4 개산공제 (S-5 확정안)

**확정안**: **파트별로, 그 파트 모드가 `actual`이 아닐 때만, 현행 base × 3/100**(미등기 3/1000 — `estimatedDeductionRate(isUnregistered)`), 성분별 독립 floor, 공유지분 스케일은 `computeEstimatedDeduction` 그대로.

| 부분 | base (= 현행 취득시 기준시가 basis) | 법 근거 |
|---|---|---|
| 주택부수토지 HL | γ1 `landBasis` = `⌊P × 토지일 가목 ÷ (토지일 가목 + 나목)⌋` (PHD면 `landHousingAtAcquisition`) | §163⑥2호가목(라목 한 덩어리 `P`)의 토지 성분 |
| 주택건물 HB | γ1 `buildingBasis` = `P − landBasis` (PHD면 `buildingHousingAtAcquisition`) | 같은 호 건물 성분 |
| 상가부수토지 CL | `토지일 단가 × 상가부수면적` (원값) | §163⑥1호 |
| 상가건물 CB | `건물일 상가건물 기준시가` (원값) | §163⑥2호나목 |

- 현행 코드와 **동일 base**(`-housing.ts:399-402`·`-commercial.ts:236-250`) — S-3(비례)에 연동한다는 S-5의 결론이 곧 「γ1 basis가 base」다. 합 `HLb+HBb = P`(1원 이내) = 라목 `P` × 3%와 일치(R-3 형제 anchor `C-3`이 이미 합 불변을 고정).
- **설계 선택(Q-4)**: 라목 주택은 법문상 부수토지를 포함한 **한 덩어리**(2호가목)다. 토지 파트는 `actual`·건물 파트는 `appraisal`처럼 **한 덩어리의 반쪽만 개산공제 대상**이 되는 조합이 생긴다. 현행 3% 성분 분해(토지·건물 각각)를 모드별로 켜고 끄는 것이 법문에 가장 가깝다고 보았으나 **직접 근거는 없다**(조사 문서 §4: 「방향 부합, 정면 근거 없음」). 대안: 주택은 한 덩어리라 두 파트가 모두 비-실가일 때만 공제 → 조합이 줄지만 실가 파트가 있어도 반대쪽 공제를 잃는다(불리).
- 상속·증여·실가 파트는 개산공제 **배제**(§97②1호 가산 구조) — 현행 `usesDeemedAcq`의 파트 버전.

### 3.5 필요경비·단서 (§97②)

자산 단위 `capitalExpenditure`·`transferExpense`·파트별 직접 경비(`housing/commercialInheritedExpense`)는 현행 안분 함수(`apportionAcquisitionPrice`→`resolvePartNecessaryExpense`)로 4부분 몫을 구하고, **파트 모드로 용처를 가른다**:

| 파트 모드 | 필요경비 |
|---|---|
| actual | 그 파트 몫 **가산**(실제 필요경비 — §97②1호) |
| appraisal·salesCase | 개산공제만(§97②2호 **본문**) — 경비 미반영 (GB 갈래 4와 동일: `general-building-swap.ts:243-246` · 현행 `provisoEligible`이 감정·매매사례를 제외하는 것과 동일) |
| estimated | 개산공제 + **단서**(가목 < 나목이면 나목 채택) 후보 |

**단서 판정 단위 (설계 선택 · Q-3)**: **환산 파트 묶음** `G`. 가목_G = Σ(G 파트 취득가액 + 개산공제), 나목_G = Σ(G 파트 경비 몫). `나목_G > 가목_G`이면 G의 파트는 취득가액 0 + 경비=나목 몫(현행 `swapToDirect`의 파트 버전). 양쪽 환산이면 `G`=4부분 전체 → **현행 asset 단위 판정과 같다**(R-6·B-10 회귀). 한쪽만 환산이면 그 쪽(토지측 HL+CL / 건물측 HB+CB)만 비교 — 「파트별로 취득모드가 갈리면 파트 단위, 아니면 자산 단위」(`general-building-swap.ts:144-148` 선례). 법령 직접 근거는 일반건물과 같은 수준(「제1항제1호나목에 따라 취득가액을 환산취득가액으로 하는 경우로서」의 「취득가액」 단위 해석)이며 별개 취득 겸용 해석례는 없다(V-2).

⚠️ **경비 안분 비율은 현행 그대로**(날짜 섞인 `apportionAcquisitionPrice`) — B0 문서가 「안분 비율만 건물일로 통일해도 결정세액 약 −2.6M」이라 적은 그 함수다. B1은 총액 안분 자체를 파트 모델에서 **우회**(S-1·S-2)하므로 취득가액 쪽은 문제가 사라지지만, **경비 안분**에는 남는다. 같은 함수 한 곳이라 별건 한 번에 고칠 수 있다 — B1에서 바꾸면 양쪽 환산 + 경비 회귀선(R-6)이 깨진다. 별건(Q-6과 함께).

### 3.6 양도가액·보유기간 (현행 유지 확인)

- 양도가액 4분할: `apportionTransferPrice`(+ 주택 `splitMixedUseHousingStd` 양도시 비례)·`calcCommercialGainSplit` — B1이 건드리지 않는다. anchor R-2가 3모드 동일을 고정.
- 보유기간·장기보유공제율·§104 단기세율 파트: `landHoldingYears`/`buildingHoldingYears`가 토지일·건물일 기준(`-housing.ts:434-440`) — 변경 없음. 12억 안분·배율초과(NBL)·표2는 파트 양도차익(`landGain`/`buildingGain`)을 읽으므로 취득가액 값만 바뀌어도 자동 추종(`buildHousingPart`).

### 3.7 엔진 구조 (800줄 정책)

| 파일 | 현재 줄 | 변경 | 비고 |
|---|---|---|---|
| `lib/tax-engine/mixed-use-part-acq.ts` (신규) | — | S-1·S-2 분할 · 모드 조합 필수 술어 `mixedPartAcqNeeds` · 파트 모델 조립 `resolveMixedPartAcq` · 가드 `assertMixedSeparateAcqSupported` | ≈250줄 목표. **술어·분할은 leaf 1곳**, ④⑤⑧⑫ 공유(`mixed-use-acq-date.ts` 선례) |
| `lib/tax-engine/mixed-use-part-proviso.ts` (신규) | — | §3.5 환산 묶음 단서 판정 | `transfer-tax-mixed-use.ts` 636줄에 넣으면 ≈700 → 분리 |
| `types/transfer-mixed-use-part-acq.types.ts` (신규) | — | §3.1 타입 + echo 타입 | 기존 types 파일 1031줄(타입 전용 예외이나 더 키우지 않음) |
| `transfer-tax-mixed-use.ts` | 636 | 오케스트레이션 분기(가드 호출·파트 조립·단서 호출) +≈40 | |
| `transfer-tax-mixed-use-housing.ts` | 459 | `partAcq?` 인자: 파트별 취득가액 override·공제 선택 +≈50 | |
| `transfer-tax-mixed-use-commercial.ts` | 308 | 같음 +≈40 | |
| `transfer-tax-mixed-use-helpers.ts` | **766** | **추가 금지** — 750 위험구간. 기회주의 분리 대상이 되려면 별건 | |

## 4. 결합 제외 조합과 코드 가드

계획서 「제외엔 코드 가드 필수」(memory `feedback_plan_exclusion_decision_needs_a_code_gate`). 파트 모델(`separateAcquisition` 존재)에서만 적용 — 총액 모델은 현행 가드 그대로.

| # | 제외 조합 | 이유 | 엔진 throw (`assertMixedSeparateAcqSupported`) | ⑫ superRefine | ⑧ (+ UI 술어) |
|---|---|---|---|---|---|
| X-1 | 보유 중 일부 용도변경(`partialUsageChange`) | 취득시 주택/상가 구성이 시점별로 달라 S-1·S-2의 「현재 면적·현재 나목」 가정이 깨짐. 조사 문서에 해당 분할 선례 없음 | ✓ | ✓ | ✓ |
| X-2 | 공익수용(`transferCause=public_expropriation`) | §164⑨1호 분모 특례가 주택 총액·상가 토지 단위라 파트 환산 분모의 단위가 미정(현행도 실가·감정 + 수용은 throw: `-helpers.ts:261`) | ✓ | ✓ | ✓ |
| X-3 | 상속·증여 취득(`acquisitionByInheritance/Gift`) | 취득가액이 §163⑨ 평가액 — 파트 산정방식 개념이 다름. 「토지 상속 + 건물 매매」는 Phase D(H-3, 사용자 지시 후속) | ✓ | ✓ | 이미 `validateMixedUseInheritanceAsset` — 파트 모델 UI는 매매만 노출 |
| X-4 | 총액 모델 플래그 동시(`useActualAcquisition`·`useAppraisalSalesAcquisition`·`acquisitionActualTotalPrice`) | 두 번째 override가 첫째를 가림 — 어느 쪽이 이기는지 사용자가 알 수 없음 | ✓ | ✓ | ✓(④가 파트 모델이면 총액 플래그를 `false/undefined`로 고정 — 3중) |
| X-5 | 같은 취득일(`areMixedAcqDatesSeparate` 거짓) | 별개 취득이 아니면 파트 값이 실재하지 않는다(소유자 분리 등은 이 범위 밖) | ✓ | ✓ | ✓ |
| X-6 | 파트 값 누락(`actual/appraisal`인데 `*AcquisitionPrice ≤ 0`, `salesCase`인데 `*SalesCaseValue ≤ 0`) · 용도별 계약액 ≥ 건물 총액 · 계약액인데 건물 모드가 actual 아님 | 자동 안분 fallback 금지 — 값을 지어내지 않는다 | ✓ | ✓ | ✓ |
| X-7 | PHD ON ∧ 환산 파트 없음 | 소비처 없는 PHD(§3.3) | (무시 아님 — throw) | ✓ | ④ 미전송 · ⑧ 요구 안 함 |

**일반건물 Phase A의 Q-A3(증축 × 자산 단위 감정·매매사례 차단) 같은 차단이 겸용에도 필요한가?** **필요 없다.** Q-A3의 위험은 「자산 단위 감정/매매사례가 파트 값 없이 3파트 안분을 돌려 실가 경로 잠복 결함(G-2)을 재현」하는 것인데, (1) 겸용에는 증축 파트 축이 없고 (2) 파트 모델에서는 **자산 단위 총액 자체가 입력이 아니다**(X-4). 총액 모델(감정 총액 + 날짜 상이)은 현행 동작 그대로 유지(Q-5) — G-2류 결함이 없음은 E2·E3가 보여준다(총액이 H_A 비율로 일관되게 나뉨).

**가드 3중 위치**: 엔진 = `calcMixedUseTransferTax` 진입(날짜 거부 직후)에서 `assertMixedSeparateAcqSupported(asset)` · ⑫ = `mixedUseAssetSchema.superRefine`(`transfer-tax-schema-mixed-use.ts:118`) — 길어지므로 `transfer-tax-schema-mixed-use-part-acq.ts`로 분리 · ⑧ = `validateMixedUseAsset`(`transfer-tax-validate-mixed-use-asset.ts:30`) 앞부분. **모두 `mixed-use-part-acq.ts` leaf 술어를 호출**한다(규칙 두 벌 금지).

## 5. 게이트 판단 (D-4)

**결론: `isSeparateAcquisition()`의 겸용 제외(`lib/calc/transfer-tax-split-acq-mode.ts:302-304`)를 해제하지 않는다. 겸용 전용 술어 `isMixedUsePerPartAcq(asset)`를 신설**한다 (UI 어댑터 `lib/calc/mixed-use-part-acq-split.ts` — 판정 규칙은 엔진 leaf, 어댑터는 폼 문자열 → leaf 인자 변환만. `mixed-use-acq-date-split.ts` 선례).

**소비처 전수와 해제 시 새로 들어오는 경로의 영향** (`grep -rn isSeparateAcquisition` 직접 실행, 테스트·e2e 제외 — 실제 줄 확인):

| # | 소비처 | 현행 겸용 동작 | **해제 시** 겸용에 일어나는 일 | 위험 |
|---|---|---|---|---|
| 1 | `lib/calc/transfer-tax-api-split.ts:66` · `:141` | `isSplitPayloadActive`는 겸용(`hasSeperate…` 강제 ON)에서 참 → `separateAcquisition=false`로 body 최상위 split 필드 전송 | `isSeparateAcquisition: true` + `landAcqMode`·`buildingAcqMode`가 **최상위 body**에 실림. Route 5-a-2(`app/api/calc/transfer/route.ts:465`)는 `mixedUse`만 읽어 무시 | 낮음(무시). 단 다건·aggregate 쪽은 아래 5·6 |
| 2 | `lib/calc/transfer-tax-api-companion-payload.ts:292` | `splitActive && !isSeparateAcquisition` 참 → `standardPriceAtAcquisition` 전송 | **거짓이 되어 `standardPriceAtAcquisition`이 전송되지 않음** — 컴패니언 item 최상위 값이 바뀜(파트 카드는 `neutralized`로 중화하지만 `mixed-use-part-cards.ts:155-` `neutralized` 외 경로의 영향 미측정) | **중** — 확인 필요 |
| 3 | `lib/calc/transfer-tax-validate-acquisition.ts:662` | 겸용은 `:335`에서 `validateMixedUseAsset`로 **먼저 return** — 도달 안 함 | 변화 없음 | 없음 |
| 4 | `lib/calc/transfer-lump-sum-base-gate.ts:50` | 겸용은 「도달하지 않는다」(같은 파일 주석 — 각 early return) | 변화 없음 | 없음 |
| 5 | `app/api/calc/transfer/engine-input.ts:325` · `multi/route.ts:203` · `bundled-split-helpers.ts:393` | 겸용 값은 false | 엔진 item `isSeparateAcquisition: true` — 겸용 파트 카드는 `mixed-use-part-cards.ts:156`이 `false`로 중화하나, **multi 경로·비-카드 경로**는 미확인 | **중** — 확인 필요 |
| 6 | `lib/calc/transfer-tax-validate-split.ts:150·189·271·449` | `validateSplitDirectInputs`는 `validate-acquisition.ts:721`에서 호출되는데 겸용은 `:335`에서 먼저 빠져 **도달 안 함** | 변화 없음(그러나 **겸용이 이 함수에 들어오면** V1·V2가 `landAcquisitionPrice`를 요구하는 주택 split 규칙이 겸용에 적용됨 — 방어선이 `:335` early return 한 줄뿐) | 낮음~중 |
| 7 | `lib/stores/calc-wizard-store.ts:364` · `lib/stores/transfer-per-asset-summary.ts:236` | 총액 칸 합계 | `separateAcqPartsSum`(토지값+건물값)으로 합계 대체 — **UI가 원하는 동작일 수 있으나** 겸용 사이드바 미리보기(`mixed-use-sidebar-acq-preview` 선례)와 **이중 정본**이 됨 | 중 — UI 설계와 조율 |
| 8 | `lib/calc/transfer-tax-split-acq-mode.ts:490` (`ownerSplitHousingNeedsBuildingStd`) | 겸용은 `:479` 선 return | 변화 없음 | 없음 |
| 9 | `components/calc/transfer/CompanionAcqPurchaseBlock.tsx:233-239` · `:470` | 겸용은 false → 상단 총액 축 노출, 파트 블록 `isSplit && !isMixedUse`로 숨김 | 상단 축 숨김·파트 블록(주택 `LandBuildingSplitSection`) 노출 — **주택 전용 컴포넌트가 겸용 4부분을 모르는 채 렌더** | **높음** — 의도와 다른 UI |
| 10 | `NonPurchaseSplitInputsBlock.tsx:48-49` | 겸용 return null | 변화 없음(자체 early return) | 없음 |

⇒ 해제하면 **영향 경로 8곳 중 4곳(2·5·7·9)이 겸용에 새로 걸리고**, 그중 2·5는 미측정이다(memory `feedback_ui_gate_expansion_activates_latent_defect`). 겸용 전용 술어는 **새 경로를 필요한 곳(⑤ 파트 블록·④ 전송·⑧ 필수·⑥ 사이드바)에만 명시적으로** 연다. 비용: 술어 1개 + 어댑터 1개, 사이드바·합계 소비처 2곳에 겸용 분기 추가(UI 설계). anchor R-8이 「겸용은 날짜가 달라도 `isSeparateAcquisition` false」를 계속 고정한다(이 판단이 뒤집히려면 이 anchor를 의도적으로 반전해야 한다).

## 6. ⑨~⑭ 엔진·API 측

14지점 중 B1이 건드리는 곳(①~⑧ 클라이언트는 UI 설계 소관).

| 지점 | 변경 | 위치 |
|---|---|---|
| ⑨⑩ Zod enum 메인·컴패니언 | **없음** — 겸용 서브객체 `mixedUse`는 단건(`transfer-tax-schema-base-shape.ts:470`)·컴패니언(`transfer-tax-schema-companion.ts:119`)이 **같은 `mixedUseAssetSchema`**를 쓴다. 한 곳 수정이 양쪽에 반영 | |
| ⑪ 자산-수준 `acquisitionDate` fallback | **해당 없음** — 날짜는 `mixedUse.landAcquisitionDate/buildingAcquisitionDate`로 이미 명시 | |
| ⑫ Zod 입력 객체 | `separateAcquisition` **중첩 객체 정의**(비엄격 `z.object`라 정의 누락 = 침묵 strip — 현재 P-1이 증명) + superRefine(§4 X-1~X-7 + **모드 키 필수 술어**: 비-실가 파트가 있으면 H_A·L_b(날짜 상이)·N, 파트 공통 경비가 있으면 같은 basis, 양쪽 실가면 N·`commercialBuildingPrice`·`landPricePerSqm`만 — 기존 3 술어 `isBuildingDayLandPriceRequired`·`isHousingBuildingStdAtAcqRequired`·`isHousingPriceAtAcqRequired`에 **모드 입력을 추가**: 양쪽 실가 + 잔존 H_A가 거짓 요구(L_b)를 만든다 — 아래 ⚠️) | `lib/api/transfer-tax-schema-mixed-use.ts` (232줄 → refine은 신규 파일로) |
| ⑬ `callTransferTaxAPI` body | `buildMixedUsePayload`가 **명시 필드 매핑**(spread 아님 — 파일 헤더 경고)으로 `separateAcquisition`을 조립. 파트 모델 opt-in이 아니면 키 자체 없음(Q20 규약 「범위 밖이면 보내지 않는다」). 총액 모델 플래그는 파트 모델이면 `false`·`undefined`로 고정. 절대금액 5종 `share()` 스케일 | `lib/calc/transfer-tax-api-mixed-use.ts:62-` (382줄) |
| ⑭ Route 엔진 입력 매핑 | **`buildMixedUseAssetInput`이 `...s.mixedUse` 스프레드**(`mixed-use-asset-input.ts` — Zod 서브객체 통째) → 신규 중첩 객체는 **자동으로 엔진에 도달**. 키 커버리지 가드(`_mixedUseKeyCoverageGuards`)는 `MixedUseAssetInput` 키를 보므로 타입에 필드를 추가하면 가드가 통과한다. 단 가드는 **중첩 키를 못 본다** — 중첩 객체 키 일치는 anchor R-B1(값을 바꾸면 결과가 바뀜 = strip 아님)로 방어 | `app/api/calc/transfer/mixed-use-asset-input.ts` |
| 컴패니언 | 파트 카드 확장(`mixed-use-part-cards.ts`)은 엔진 결과 `housingPart.landAcqPrice`·`landAppraisalDed` 등을 그대로 카드 `acquisitionPrice`·`expenses`로 옮긴다(`:241-` 카드 구성) → **파트 모델 값이 엔진 결과에 정확히 들어가면 컴패니언이 자동 추종**. 카드는 `useEstimatedAcquisition:false`로 중화돼 item 단건 엔진이 재환산하지 않음 | `mixed-use-part-cards.ts:155-185` |
| 다건 합산(multi) | **확인 필요 V-5** — `multi/route.ts:203`이 `p.isSeparateAcquisition`을 item으로 넘기는 경로에서 겸용 파트 모델이 어떻게 흐르는지 미실측 | |

⚠️ **필수 술어가 모드 키여야 하는 이유(실측 근거)**: 현행 `isBuildingDayLandPriceRequired`는 `housingPrice > 0`을 게이트로 쓴다(`mixed-use-acq-date.ts` 하단) — 사용자가 H_A를 한 번 채웠다가 양쪽 실가로 바꾸면(stale) **쓰이지 않는 L_b를 요구**한다. 노출 ⇔ 소비(memory `feedback_required_field_needs_an_input_path` · `feedback_validation_called_but_used_as_warning`). 새 leaf `mixedPartAcqNeeds({ modes, usePhd, partialDirection, expenseDeclared })`가 반환하는 요구 집합 — `{ housingPriceAtAcq, landPricePerSqmAtBuildingDay, housingBuildingStdAtAcq, commercialStdAtAcq }` — 을 기존 3 술어가 AND로 받는다(⑧ 8번째 동기화).

| 모드 조합 | H_A | L_b(날짜 상이) | N | 상가건물·토지일 단가 |
|---|---|---|---|---|
| 양쪽 actual, 계약액 있음, 공통 경비 없음 | 불요 | 불요 | 불요 | 불요 (토지 S-1은 면적만) — 단 ⑫ 기존 규칙이 `landPricePerSqm`·`commercialBuildingPrice`를 무조건 요구하므로 **모드 키로 완화할지는 별도 판단**(V-6) |
| 양쪽 actual, 계약액 없음 | 불요 | 불요 | **필요**(S-2) | 필요 |
| 하나라도 비-actual **또는** 공통 자본적지출·파트 직접 경비 선언 | **필요** | 필요 | 필요 | 필요 |
| PHD(환산 파트 있음) | PHD가 대체(현행) | 불요 | PHD `buildingStdPriceAtAcquisition` | 필요 |

**결과 echo (⑦ 소비 — UI·신고서·상세명세서 단일 정본)**: `MixedUseGainBreakdown.separateAcquisition?`:
```ts
{ landMode, buildingMode,
  parts: { housingLand|housingBuilding|commercialLand|commercialBuilding: { mode, acquisitionPrice, deemedDeduction: boolean, basis?: number } },
  landSplit:     { basis: "std_price_ratio"; housingStd; commercialStd },                    // S-1
  buildingSplit: { kind: "contract" | "std_ratio"; housingStd?; commercialStd?; contract? }, // S-2
  provisoGroup?: { parts: ("land"|"building")[]; estimatedSide; directSide; chosen } }      // §3.5
```
결과 카드는 이 유무로 분기하고 값을 재도출하지 않는다(memory `feedback_aggregate_display_rederives_engine_value`). 취득가액·개산공제는 기존 `housingPart.landAcqPrice`·`landAppraisalDed` 등이 이미 파트별 값이다.

## 7. 케이스 매트릭스 + probe 실측

### 7.1 매트릭스

| # | 분기 | 현행(실측) | B1 기대 | anchor |
|---|---|---|---|---|
| 1 | 환산/환산(파트 모델 필드) | E1 680,547,003 | **같음** | R-1 · B-6 |
| 2 | 실가 총액(총액 모델) | E2 594,231,865 | **같음** | R-3 |
| 3 | 감정 총액(총액 모델) | E3 588,622,345 | **같음** | R-4 |
| 4 | PHD 환산(별개) | E6 809,196,027 | **같음** | R-5 |
| 5 | 실가+PHD(총액 모델) | E7 throw | **같음** | R-7 |
| 6 | 단서(양쪽 환산 + 경비) | E12·E13 | **같음**(환산 묶음 = 4부분) | R-6 · B-10 |
| 7 | 실가/실가 | 표현 불가 | 250/250·320/80 | B-1 |
| 8 | 실가/감정 | 표현 불가 | + 건물 개산공제 | B-2 |
| 9 | 감정/실가 | 표현 불가 | + 토지 개산공제 | B-3 |
| 10 | 실가/환산 | 표현 불가 | 건물 환산 = E1 값 | B-4 |
| 11 | 환산/실가 | 표현 불가 | 토지 환산 = E1 값 | B-5 |
| 12 | S-2 계약액 | 표현 불가 | 300M/100M | B-7 |
| 13 | 매매사례 | 표현 불가 | S-1 면적비 | B-8 |
| 14 | PHD × 파트 | E7 throw(실가) | 토지 실가 + 건물 PHD 환산 | B-9 |
| 15 | 결합 제외 7종 | 침묵 strip / throw 혼재 | 3중 차단 | B-11 · R-B2 |
| 16 | 모드 키 필수 술어 | L_b 거짓 요구 | 양쪽 실가 H_A·L_b 없이 200 | R-B3 |
| 17 | 컴패니언 | (파트 카드가 엔진 결과 승계) | 자동 추종 — 카드 `acquisitionPrice`·`expenses`에 파트 값 | Do에서 `transfer.route.companion-mixed-use.anchor` 형제 anchor 추가(확인 필요) |
| 18 | 구 이력(필드 부재) | 현행 | **현행** | R-1~R-5 · P-1 |
| 19 | 지분 양도 | 현행 `share()` | 절대금액 5종 `share()` | Do에서 B-1에 지분 변형 추가(확인 필요) |

### 7.2 probe 방법·한계
- 현행은 `calcMixedUseTransferTax`를 직접 호출(mock 세율)해 실측했다 — 원자료 scratchpad `b1-probe.json`(E1~E13 + R1·R2).
- **신규 동작 수치는 실측이 아니다.** 파트 모델이 없어 엔진으로 산출할 수 없으므로 anchor skip 기대값은 독립 산식(BigInt floor·잔액 흡수·`⌊v×3/100⌋`)으로 적었다. 양도가액 4분할(R-2)·환산 파트 값(E1)·개산공제 base(γ1 96M/256M · 상가 120M/80M)는 현행 실측 리터럴이다. **세액은 Do 구현 후 독립 재구현과 대조해 고정**(S3-2 anchor와 같은 방식) — 확인 필요 V-1.

## 8. Pre-Do anchor

파일 `__tests__/api/transfer.route.mixed-use-separate-acq-per-part.b1.predo.anchor.test.ts` — **실행 결과: 10 passed · 14 skipped** (24).

| 구분 | 건수 | 내용 |
|---|---|---|
| (R) 회귀선 통과 | 9 | R-1 환산 · R-2 양도가액 4분할 불변(3모드) · R-3 실가 총액 · R-4 감정 총액 · R-5 PHD 별개 · R-6 단서 · R-7 실가+PHD throw · R-8 `isSeparateAcquisition` 겸용 제외 유지(D-4) · R-9 환산 총액 전제 |
| (P) 현행 고정 통과 | 1 | P-1 신규 중첩 필드가 ⑫에서 strip(결과 불변) — **부정형이므로 긍정 짝 R-B1 skip 동반** |
| (B) 신규 `it.skip` | 14 | B-1~B-11(4×4·계약액·매매사례·PHD·단서·가드) · R-B1(Route 도달) · R-B2(Route 400) · R-B3(모드 키 필수) |

skip 해제 = B1 완료 기준. **뮤테이션 probe는 수행하지 않았다**(skip 구현체가 없어 대상 없음) — Do에서 분할 기준·모드 분기·개산공제 on/off·환산 묶음 단서 각 1건 KILLED 확인 필요(계획서 §9).

## 9. 사용자 결정 (Q-n)

| # | 질문 | 갈리는 이유(근거) | **권장안** | 영향 |
|---|---|---|---|---|
| **Q-1** | S-2 「용도별 계약액」의 **입력 형태**와 **적용 모드** | 형태: (가) 총액 + 주택건물분(상가=잔액 도출) (나) 주택건물·상가건물 두 칸. 모드: 실가만 / 감정도(감정평가서가 용도별 구분 표기 시). 법령·해석례 없음 — 순수 설계 선택 | **(가) + 실가 한정.** 총액이 한 번 입력돼야 사이드바·§97②1호 합계가 맞고, 「한쪽을 알면 반대쪽은 총액−입력값으로 **유일하게 확정**」은 도출이지 안분이 아니다(`transfer-tax-split-acq-price.ts` 주석 선례). 감정·매매사례는 S-2 사용자 결정(계약액)의 범위 밖 | B-7 수치 300M/100M. 감정 허용으로 바뀌면 ⑧·⑫ 술어 1줄 |
| **Q-2** | 구 이력·신규 입력의 **총액↔파트 모델 전환 규약** | 날짜 상이 겸용 구 이력(총액 모델)이 이미 있다. 날짜 상이면 무조건 파트 모델로 강제하면 구 이력이 ⑧에 막힌다(저장값에서 파트 값을 복원할 수 없음) | **명시 opt-in 필드(부재 = 총액 모델), 신규 입력 시 UI 기본 ON**(onChange, `useEffect` 미러링 금지). 엔진은 「객체 존재」만 본다 | 구 이력 회귀 0(R-1~R-5·P-1이 고정) |
| **Q-3** | §97②2호 **단서(가목<나목이면 나목)** 의 판정 단위 | 법문은 「취득가액을 환산취득가액으로 하는 경우로서」 — 모드가 갈릴 때 비교 단위 해석 없음. (가) 환산 묶음 G(권장 — 양쪽 환산이면 현행과 동일) (나) 파트 4개 각각 (다) 파트 모델에서 단서 비활성 | **(가)**. (다)는 법 근거 없이 불리(memory `feedback_no_unfavorable_application_without_legal_basis`)·(나)는 양쪽 환산에서 현행 값이 바뀜 | R-6·B-10. 설계 선택 — 직접 해석례 없음(V-2) |
| **Q-4** | 라목 한 덩어리(2호가목) 개산공제의 **파트 모드 혼합** | 토지 actual + 건물 appraisal이면 주택 한 덩어리의 반쪽만 공제 대상. 법문은 라목 총액 기준 | **현행 3% 성분 분해를 파트 모드로 on/off**(§3.4). 대안(두 파트 모두 비-실가일 때만)은 실가 파트가 있어도 반대쪽 공제를 잃어 불리 | B-2·B-3 수치 |
| **Q-5** | 날짜 상이 겸용에서 **총액 모델(감정·매매사례 총액 + 날짜 상이)** 을 계속 허용? | 일반건물 Q-A3는 증축 때문에 차단했지만 겸용엔 증축 축이 없고 총액 모델은 일관되게 동작(E2·E3). 단 별개 취득이면 파트 값이 실재하는데 총액 안분은 그 값과 무관 | **허용 유지 + UI 안내**(「토지·건물 값을 각각 알면 파트 입력을 쓰세요」). 차단은 Q-2 구 이력과 충돌 | 회귀 0 |
| **Q-6** | (별건 제안) 환산 분자 `H_A`→`P` · 경비 안분 비율 날짜 통일 | §2.4: 분자 정합 시 환산취득가 −49,655,173·세액 +15,966,395(가상 fixture) — **법령상 정답 미판정**(99-164-9 원문 필요). B0 인용: 비율 날짜 통일 시 약 −2.6M(본 설계에서 재측정 안 함) | **B1에서 바꾸지 않는다**(양쪽 환산 = 현행이 회귀선). 별건 계획서로 분리하고 99-164-9 원문 대조 후 결정 | B1 무관 |

**설계 선택(사용자 결정 불요, 근거 약함을 명시)**
- 환산 파트 값을 「양쪽 환산일 때의 값」으로 고정(상대 파트 독립) — 법령 직접 근거 없음, Q2(자산별 독립)·구 이력 호환에서 도출한 불변식.
- 용도별 계약액 = 총액 − 주택건물분의 상가건물 도출 — 상가건물 0원(계약액 = 총액)은 ⑫·⑧이 막는다(「상가건물 취득가액이 0인 겸용」은 비현실적, 필요하면 완화).
- PHD ON ∧ 환산 파트 없음 → 400(조용한 무시 아님).

## 10. 확인 필요 (V-n)

| # | 내용 |
|---|---|
| V-1 | 파트 모델 **세액**(skip anchor는 취득가액·개산공제·양도차익까지) — Do에서 독립 재구현 대조 후 고정 |
| V-2 | §97②2호 단서의 환산 묶음 판정(Q-3)·§97②2호 본문의 감정·매매사례 파트 — 별개 취득 겸용 해석례 미확보. GB 선례(`general-building-swap.ts`) 준용 |
| V-3 | §100③ 30% 판정이 **별개 취득 파트 값**에 적용되지 않는다는 독법 — 본문 확인(「함께 취득하거나 양도한 경우로서」)은 했으나 별개 취득 해석례는 없음(추론) |
| V-4 | PHD ④ 입력 필드가 토지일·건물일 값인지(`phdLandPricePerSqmAtAcq`·`phdBuildingStdPriceAtAcq` 라벨·캡션) — UI 설계와 조율 |
| V-5 | 다건 합산(`multi/route.ts:203`)·컴패니언 비-카드 경로에서 겸용 파트 모델의 흐름(D-4 표 2·5행 포함) |
| V-6 | 양쪽 실가일 때 ⑫가 무조건 요구하는 `landPricePerSqm`·`commercialBuildingPrice`를 모드 키로 완화할지(S-1은 면적만, S-2 계약액 있으면 상가건물 기준시가도 불요) — 완화 시 거짓 요구가 줄지만 술어 표면이 커진다. B1 v1은 이 두 값을 **계속 요구**해도 안전(거짓 요구 위험 낮음: 별개 취득 입력 화면에 이미 있음) |
| V-7 | 감정가액 기준일 ±3개월(§176의2③2호) ⑧ 검증을 **주택 경로가 하는 만큼만** 적용(새 규칙 발명 금지 — GB D-2와 동일) — 주택 경로 현황 재확인 |
| V-8 | 겸용 + 부담부증여(`transferType`) 조합의 현행 처리 — 파트 모델과 함께 오면 어떻게 되는지 |
| V-9 | 집행기준 99-164-9 원문 — Q-6 판정용(사용자 제공 원문이 S3-2 §10에 인용돼 있으나 환산 분자 사용 여부 문장 대조 필요) |
| V-10 | 컴패니언 겸용 ⑧ 경로가 파트 모델 값 필수를 primary와 동일하게 거는지(`validate-asset.ts:299`는 모든 자산 index를 순회하나 isNonPrimary 분기 확인) |
| V-11 | 이 문서의 file:line 중 「직접 확인」 표시가 없는 `:` 뒤 숫자 생략 항목(`transfer-tax-api-mixed-use.ts` 필드 줄) — Do 진입 시 재확인(memory `feedback_merged_plan_citations_drift`) |

## 11. Do 결과 (2026-10-07) — 구현 요약 · UI 회신 (U-1~U-4) · 설계 대비 편차

> 선행 정정: PR #2027(별개 취득 주택분 §97 환산 **분자** H_A → 취득당시 주택가격 P)이 머지된 뒤의 값이다. §2.4의 Q-6 「분자 H_A vs P」는 **#2027로 해소**됐고, §2.2·§3.2·§7의 환산 파트 수치(주택 112,852,664/300,940,439 · 세액 680,547,003)는 **#2027 이전 값**이다 → 정정 후 주택 환산 총액 364,137,930(토지 99,310,344 · 건물 264,827,586) · 상가 124,137,930/82,758,621 불변 · 양쪽 환산 세액 696,513,398. 위 표는 역사 기록으로 남기고 anchor가 정정 후 값을 독립 산식으로 고정한다.

### 11.1 변경 지점

| 지점 | 파일 | 내용 |
|---|---|---|
| 타입 | `lib/tax-engine/types/transfer-mixed-use-part-acq.types.ts`(신규) | `MixedSeparateAcquisition`·`MixedPartAcqNeeds`·echo. (경로: 엔진 타입은 `lib/tax-engine/types/` — 지시서의 `types/…`는 이쪽) |
| leaf | `lib/tax-engine/mixed-use-part-acq.ts`(신규) | `isMixedUsePerPartAcq` · `mixedPartAcqNeeds`/`mixedPartAcqNeedsOf` · `isMixedExpenseDeclared` · `collectMixedPartAcqIssues`/`assertMixedSeparateAcqSupported` · `applyMixedPartAcq` · `MIXED_PART_ACQ_MODES` |
| 필수 술어 AND | `mixed-use-acq-date.ts` · `mixed-use-housing-std.ts` | `isBuildingDayLandPriceRequired`·`isHousingPriceAtAcqRequired`·`isHousingBuildingStdAtAcqRequired`에 선택 입력 `partAcqNeeds`(AND). **미지정(총액 모델) = 기존 동작 불변** |
| 엔진 | `transfer-tax-mixed-use.ts` | 진입 가드 + 파트 모델 분기(est·exp 두 split → `applyMixedPartAcq`) + echo. 단서는 파트 모델에서 자산 단위 `provisoEligible` 대신 환산 묶음 판정 |
| 엔진 | `transfer-tax-mixed-use-housing.ts` · `-commercial.ts` | 취득시 기준시가가 쓰이지 않는 조합(`needs` false)에서 취득측 요구·계산을 건너뜀(양도시 측은 그대로). 총액 모델은 `needs`가 undefined라 불변 |
| ⑫ | `lib/api/transfer-tax-schema-mixed-use-part-acq.ts`(신규) · `transfer-tax-schema-mixed-use.ts` | 중첩 객체 정의 + superRefine(leaf 목록) + 기존 취득측 필수 규칙 4개를 `needs`로 AND |
| ⑭ | `app/api/calc/transfer/mixed-use-asset-input.ts` | **무변경** — `...s.mixedUse` 스프레드로 도달. 키 커버리지 가드가 Zod 키 누락을 컴파일 에러로 잡았다(M7 뮤테이션 + R-B1) |
| 법령 상수 | `legal-codes/transfer-mixed-use.ts` | `MIXED_USE.PHD_164_7` 1건(기존 §164⑦은 `INHERITANCE_PHD_MAX`로 이미 매니페스트 등록 — 커버리지 테스트 통과) |

### 11.2 UI가 쓰는 함수 시그니처 (⑤ 노출 · ⑧ 필수 · ④ 전송)

```ts
// lib/tax-engine/mixed-use-part-acq.ts — 모두 순수 함수, Date 변환 없음
isMixedUsePerPartAcq(a: { separateAcquisition?: unknown }): boolean          // 파트 모델 trigger = 객체 존재
mixedPartAcqNeeds(i: {
  modes: { land: PartAcqMode; building: PartAcqMode };
  usePhd?: boolean; partialDirection?: "house_to_commercial" | "commercial_to_house";
  expenseDeclared?: boolean;             // isMixedExpenseDeclared (U-1)
  buildingContractDeclared?: boolean;    // 건물 실가 + 주택건물 계약액 > 0 (건물 나목비가 필요 없다)
}): { housingPriceAtAcq; landPricePerSqmAtBuildingDay; housingBuildingStdAtAcq; commercialStdAtAcq }  // 전부 boolean
mixedPartAcqNeedsOf(src): MixedPartAcqNeeds | undefined                       // 엔진 입력·Zod 출력 구조 입력. 파트 모델이 아니면 undefined
isMixedExpenseDeclared({ capitalExpenditure?, housingInheritedExpense?, commercialInheritedExpense? }): boolean
collectMixedPartAcqIssues(src): { code: "X-1".."X-7"; message: string; path: string[] }[]   // ⑧이 그대로 사용 — path는 mixedUse 기준
MIXED_PART_ACQ_MODES                                                          // ["actual","estimated","appraisal","salesCase"]
```

기존 술어 3개는 `partAcqNeeds`를 **선택 입력**으로 받는다(`isBuildingDayLandPriceRequired({…, partAcqNeeds})` — `Pick<…,"landPricePerSqmAtBuildingDay">`, `isHousingPriceAtAcqRequired`·`isHousingBuildingStdAtAcqRequired`의 `HousingStdNeedInput.partAcqNeeds`). UI는 `mixedPartAcqNeedsOf`와 같은 입력으로 `needs`를 만들어 **그대로 넘기면** ⑤ 노출·⑧ 필수·⑫·엔진이 한 규칙이 된다. `needs`의 4필드 소비처:

| needs | 쓰이는 곳 | false일 때 |
|---|---|---|
| `housingPriceAtAcq` · `landPricePerSqmAtBuildingDay` | 비-실가 파트의 환산·개산공제 basis(γ1), 취득측 경비 안분 | 칸 숨김·⑧ 비요구·④ 미전송(전송해도 무시) |
| `housingBuildingStdAtAcq` | γ1 basis 또는 S-2 나목 비율(계약액 없을 때) | 〃 |
| `commercialStdAtAcq` | 상가 환산·개산공제 basis·S-2 상가건물 몫·취득측 경비 안분 | 〃 |

### 11.3 회신

**U-1 `expenseDeclared` 확정** — `capitalExpenditure > 0 ∨ housingInheritedExpense > 0 ∨ commercialInheritedExpense > 0`. UI 제안(`transferExpense` 포함)에서 **양도비를 뺐다**: 양도비는 양도시 기준시가(H_T·N_T·상가 양도시 — 항상 필수)로 나뉘어 취득시 기준시가를 소비하지 않는다(EX-4가 취득시 기준시가 전무 + 양도비로 계산되는 것을 고정). 넣으면 쓰이지 않는 값을 요구한다. ⑧ 메시지는 「자본적지출 또는 주택분·상가분 실제 필요경비가 입력되어 …」로 원인을 말할 것.

**U-2 실비 필드** — 엔진은 파트 모델에서 다음을 읽는다: 자산 단위 `capitalExpenditure`·`transferExpense`(공통 경비), **`housingInheritedExpense`·`commercialInheritedExpense`(주택분·상가분 직접 경비)**. 이름은 상속 맥락의 레거시지만 **매매 실비도 같은 필드**다(총액 실가 모델도 그렇다). 따라서 ④는 파트 모델 ∧ `purchase`이면 `mixedHousingActualExpense`→`housingInheritedExpense`, `mixedCommercialActualExpense`→`commercialInheritedExpense`로 싣는다(현행 `isMixedActualAcquisition` 게이트를 파트 모델에서는 열어야 침묵 소실이 없다). 의미: **실가(actual) 파트만 경비를 가산**하고(직접 경비가 있으면 그것, 없으면 공통 경비 몫 — 파트 안 토지:건물은 취득시 기준시가 비율), 감정·매매사례·환산 파트는 **개산공제만**(§97②2호 본문 — 직접 경비도 미반영). ⇒ 두 파트 모두 비-실가이면 실비 카드는 소비처가 없으므로 UI는 숨기는 편이 정합이다(전송해도 무시되지만 입력이 침묵 소실되는 모양이 된다). 환산 파트는 공통 경비만 §97②2호 단서 후보가 된다(직접 경비는 단서에도 들어가지 않는다 — 현행 총액-환산 모델과 같다).

**U-3 PHD 입력 기준일 확정** — `preHousingDisclosure.landPricePerSqmAtAcquisition` = **토지 취득일** 기준 ㎡당 개별공시지가, `preHousingDisclosure.buildingStdPriceAtAcquisition` = **건물 취득일** 기준 주택건물 기준시가(엔진 `Sum_A = landPricePerSqmAtAcquisition × 주택부수토지 면적 + buildingStdPriceAtAcquisition` — `transfer-tax-pre-housing-disclosure.ts:15,91,99`; 대법원 97누15746·조심2008서1720의 「토지 취득 당시 + 건물 취득 당시 대입」). 엔진은 날짜 일치를 검증할 수 없으므로 캡션·라벨이 날짜를 지시해야 한다. 추가: ① 파트 모델 + PHD에서 건물이 비-환산·계약액 없음(S-2 나목비)이면 나목은 **`buildingStdPriceAtAcquisition`**(>0 필수, 아니면 ⑫ 400·`collectMixedPartAcqIssues` X-6 경로 `preHousingDisclosure.buildingStdPriceAtAcquisition`). ② 상가는 PHD와 무관하게 `acquisitionStandardPrice.landPricePerSqm`(토지일)·`commercialBuildingPrice`(건물일)를 쓴다. ③ PHD ON ∧ 환산 파트 없음은 X-7로 막는다(UI는 PHD 칸을 숨김).

**U-4 총액 플래그 false 고정** — 확인. 파트 모델이면 ④는 `useActualAcquisition`·`useAppraisalSalesAcquisition`을 `false`/미전송, **`acquisitionActualTotalPrice`는 반드시 미전송(`undefined`)**으로 한다. ⑫가 `acquisitionActualTotalPrice`에 `.positive()`를 걸고 있어 0을 보내면 별도로 400이다. 셋 중 하나라도 켜지면 X-4(엔진 throw·⑫ 400). 계약액·모드가 쓰지 않는 값 필드는 **무시**되므로(환산 파트에 값이 남아 있어도 통과) 안전하지만, ④는 활성 모드 값만 싣는 편이 입력-전송 일관이다. `housingBuildingContractPrice`는 0·미입력 = 계약액 없음.

### 11.4 설계 대비 편차 · 결정한 것

| # | 설계 | 구현 | 사유 |
|---|---|---|---|
| 1 | S-1 = `apportionByStdPrice(값, 토지일 가목×주택부수면적, 토지일 가목×상가부수면적)`; echo `landSplit {basis:"std_price_ratio", housingStd, commercialStd}` | **면적비**(면적 ×100 정수, 단가 불요). echo `landSplit {basis:"area_ratio", housingArea, commercialArea}` | 같은 필지는 ㎡당 단가가 소거되어 같은 비율이고(S-1 결정문 「같은 필지 = 면적비」), §3.2 표·§6 표가 이미 「토지 S-1은 면적만」이라 적었다. 단가를 쓰면 쓰이지 않는 값을 요구하게 된다 |
| 2 | V-6 `landPricePerSqm`·`commercialBuildingPrice`를 v1은 계속 요구 | **needs.commercialStdAtAcq로 게이트**(⑫·엔진 모두) | 필수 술어가 모드 키여야 한다는 §6 ⚠️와 같은 원리. 엔진 소비처를 건너뛰도록 `housing.ts`·`commercial.ts`에 분기 추가(EX-4가 취득시 기준시가 전무로 계산됨을 고정) |
| 3 | 단서 echo는 `provisoGroup?` | + 기존 `necessaryExpenseProviso`(estimatedSide·directSide·chosen)도 **묶음 값으로** 채움 | 양쪽 환산이면 현행과 값이 같다(B-10·R-6) — 기존 표시 소비처 무변경 |
| 4 | — | `housingPart.estimatedAcquisitionPrice`·`commercialPart.estimatedAcquisitionPrice` = **파트 값 합**(단서 판정 전) | 총액 실가 모델이 같은 필드를 취득가액 합으로 쓰는 규약. 양쪽 환산이면 환산 총액과 1원 일치. ⚠️ `acqHousingStandardPrice`(환산 분자 echo)는 환산 경로 값 그대로(P 또는 0) — **환산 산식 표시는 echo의 환산 파트 유무로 분기**할 것 |
| 5 | — | `calculationRoute.acquisitionConversionRoute`는 **갱신하지 않음**(레거시 플래그로 파생 — 파트 모델은 `section97_direct`/`phd_corrected`로 나온다) | UI 설계 §0.1대로 결과 카드는 `separateAcquisition` echo 분기를 route 분기보다 **먼저** 둔다 |

### 11.5 V-n 처리 결과

| # | 결과 |
|---|---|
| V-1 | **해소** — 파트 양도차익은 독립 산식, 세액은 독립 구현(`indepTax`: 파트별 표1 장특 → 합산 → 기본공제 → 누진세율)과 1원 일치 확인 후 엔진 실측값을 리터럴로 고정(B-1~B-9). 겸용 엔진은 과세표준 천원 미만 절사를 하지 않는다(기존 동작 — B1 범위 밖, 아래 「범위 밖 관찰」) |
| V-4 | **엔진 쪽 해소**(U-3) — UI 라벨·캡션은 UI 몫 |
| V-5 | 다건 합산(`multi`)은 `mixedUse` 존재를 **거부**(`lib/api/transfer-tax-schema-multi-refines.ts:50` `MULTI_MIXED_USE_UNSUPPORTED_MESSAGE`)해 파트 모델이 도달하지 않는다. 컴패니언은 `buildMixedUseAssetInput`·파트 카드 경유 — 엔진 입력 수준 동치를 `mixed-use-separate-acq-per-part.part-cards.anchor.test.ts`가 고정(CP-1~3). **컴패니언 Route 전체(④ 경유)는 UI 구현 후 E2E 확인 필요** |
| V-6 | **해소**(편차 2) |
| V-10 | 확인 필요 — ⑧ 컴패니언 겸용 경로의 파트 값 필수는 UI 에이전트가 `collectMixedPartAcqIssues`를 부르는 지점에서 확인 |
| V-2·V-3·V-7~V-9·V-11 | 변동 없음(미검증 — 해석례·원문 확보 후) |

**범위 밖 관찰(수정하지 않음)**: ① 겸용 엔진 `buildTotalTax`(`transfer-tax-mixed-use-totals.ts:124`)는 과세표준을 천원 미만 절사하지 않는다 — 단건 엔진도 `truncateToThousand`를 쓰지 않는 것으로 확인했으나(grep) 법령상 정답 여부는 미판정. ② 경비 안분 비율이 날짜 섞인 `apportionAcquisitionPrice`(§3.5 ⚠️)인 점은 그대로 — 별건 Q-6 후반.
