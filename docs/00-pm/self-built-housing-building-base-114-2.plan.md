# 일체 주택 **본인 신축** × 「소득세법」 §114조의2 환산·감정가액 5% 가산세 — base를 건물분으로 수정 계획서 (Q-12)

**상태**: Plan 초안 — **사용자 결정 대기** (2026-10-23). 결정 Q는 **§11**(Q-1~Q-9, 권장안 표시). 이 문서는 계획서뿐이고 소스는 건드리지 않았다(실측은 throwaway probe — 커밋·잔존 없음).
**브랜치**: `docs/self-built-housing-building-base-plan` (origin/master 4397071e7 기준)
**상위 계획**: `docs/00-pm/gb-card-built-penalty-114-2.plan.md` §10.1(H1, Q-12 「별건 계획서로 분리」 확정) · `docs/00-pm/carryover-donor-built-114-2.plan.md` §3.2·§3.3(`donorBuilt.housing`·`housingBase`·`LandBuildingSaleSplitSection` 재사용 — 상위 픽스처 base 187,500,000 → 9,375,000).
**사용자 확정 해석(재론 금지)**: ① §114조의2는 **건물 부분에만** 적용(토지분 제외) · ② **Q-2** 일체 주택 건물분 기준시가 = 주택공시가격 × 건물기준시가 ÷ (토지공시가격(개별공시지가×면적) + 건물기준시가) — 취득 당시·양도 당시 각각 · ③ **Q-6 (b)** 건물 양도가액 S_b는 `resolveTransferPriceSplit` 법정 서열(구분 기재 → §100③ 30% 판정 → 감정평가 → 기준시가 비례). **이 계획은 같은 조문이라 본인 신축에도 그대로 적용된다는 전제로 쓴다**(그 전제 자체는 §11 Q-1에서 한 번 확인받는다).

---

## 0. 한 줄 요약

**현행**: 비이월 **일체 주택**(`propertyType: housing`, 토지+건물 일체 공시가격)을 본인이 신축하고 환산(또는 감정)으로 계산하면 가산세 base가 **토지가 섞인 자산 전체**다 — 양도가 10억·취득시 2억·양도시 4억 → base **500,000,000**·가산세 **25,000,000**(`probe s1 S-A`). 같은 조문의 이월과세 × 증여자 신축은 이미 건물분(187,500,000 → 9,375,000)만 쓴다(불일치). **실측 결과 이 결함은 「단건·함께 양도(컴패니언)·다건 합산」의 **일체 주택 환산/감정** 한 갈래에만 있다**(§2) — 분리 취득 건물 파트·PHD·부담부증여 K-5/K-7·일반건물 카드·비주택 건물은 **이미 건물분**이고, 증축은 기준시가 비례 안분 모드에서 수식이 수학적으로 동치라 **수치가 안 변한다**(§5).
**설계**: 이월과세 선례(PR-1~2)를 그대로 본인 신축에 옮긴다 — 새 순수 leaf가 일체 주택 건물분 base를 계산해 **기존 `penaltyAxis` 채널**(finalize·손실 조기반환이 이미 읽는다)에 싣는다. 계산 로직 변경은 finalize/loss-return 각 1~3줄 + 신규 leaf 1개(§3). **진짜 비용은 입력**이다: 본인 신축 경로에는 토지·건물 분할 입력(L·N·L_T·N_T·S_b)이 **화면에도 body에도 없다** — 신설하면 저장된 세션·이력이 ⑧에 막힌다(자동 안분 fallback 금지 원칙, §4). 기존 AssetForm 칸을 최대한 재사용해 **신규 폼 칸은 감정가액 건물분 1~2칸뿐**이 되게 했다.
**영향 방향**: 세액이 **내려간다**(대표 −17,187,500, 지방소득세 포함 총납부). 저장된 이력을 열어 재계산하면 값이 바뀌고(또는 새 필수 입력에 막히고) 저장된 `resultData` 스냅샷 자체는 그대로다(§4.4).

---

## 1. 법령·해석 (KoreanLaw MCP 원문 확인 2026-10-23)

- **소득세법 §114조의2①** (MST 280405, 시행 2026-01-01) verbatim: 「거주자가 **건물**을 신축 또는 증축(증축의 경우 바닥면적 합계가 85제곱미터를 초과하는 경우에 한정한다)하고 그 건물의 취득일 또는 증축일부터 5년 이내에 **해당 건물**을 양도하는 경우로서 제97조제1항제1호나목에 따른 감정가액 또는 환산취득가액을 그 취득가액으로 하는 경우에는 **해당 건물의 감정가액**(증축의 경우 증축한 부분에 한정한다) 또는 **환산취득가액**(증축의 경우 증축한 부분에 한정한다)의 100분의 5에 해당하는 금액을 제92조제3항제2호에 따른 양도소득 결정세액에 더한다」 · ② 산출세액이 없는 경우에도 적용.
- **소득세법 §100②** verbatim: 양도가액 또는 취득가액을 실지거래가액에 따라 산정하는 경우로서 토지와 건물 등을 함께 취득하거나 양도한 경우 「이를 각각 구분하여 기장하되 토지와 건물 등의 가액 구분이 불분명할 때에는 취득 또는 양도 당시의 기준시가 등을 고려하여 대통령령으로 정하는 바에 따라 안분계산」 · ③ 구분 기장가액이 안분계산가액과 **100분의 30 이상 차이**가 있으면 불분명으로 본다(단서: 영 §166⑧ 사유 제외).
- **소득세법 시행령 §166⑥**: 「법 제100조제2항의 규정을 적용함에 있어서 토지와 건물 등의 가액의 구분이 불분명한 때에는 「부가가치세법 시행령」 제64조제1항에 따라 안분계산 한다」. **부가가치세법 시행령 §64①** (MST 283641): 1호 기준시가가 모두 있는 경우 「공급계약일 현재의 기준시가에 따라 계산한 가액에 비례하여 안분」, 단 **감정평가가액이 있으면 그 가액에 비례**; 2호 기준시가가 없고 감정평가가액이 있으면 그 비례.
- **소득세법 시행령 §176조의2②2호**: 환산취득가액 = 양도당시 실지거래가액 × 취득당시 기준시가 ÷ 양도당시 기준시가 (최초공시 전 주택은 §164⑦). ③ 감정가액: 둘 이상 감정평가법인등의 평균(기준시가 10억 이하는 하나) — **「해당 자산」** 단위.
- **해석례(본문 확인 — taxlaw.nts.go.kr, Playwright)**:
  - **기획재정부 재산세제과-939 (2018.11.01.)**: 「…고가주택(이에 딸린 토지 포함)에 대한 같은 법 제114조의2 규정에 의한 환산가액 적용에 따른 가산세는 **해당 건물분**에 대한 같은 법 제97조 제1항 제1호 나목에 따른 환산가액 전체의 100분의 5에 해당하는 것입니다」 (서면-2022-부동산-3466 회신과 기획재정부 재산세제과-397(2023.03.08.)이 이를 그대로 인용).
  - 기준-2018-법령해석재산-0119(2018.05.29.)·서면-2023-법규재산-2584(2023.12.19.)·조심-2019-인-2286: 고가주택의 **비과세 부분도 가산세 base에 포함**(전체 양도가액에 대한 환산취득가액). **토지 포함 여부 자체를 다룬 정면 해석례는 확인하지 못했다** — 위 질의는 비과세/과세 구분의 문제이고 토지·건물 취득시기가 다른(분리 취득) 사안이었다(2023-2584: 토지 2018.7.20., 건물 2019.1.23. 신축).
  - ⇒ **일체 취득한 주택의 가산세 base에서 토지분을 빼는 것**의 직접 근거는 법문(「해당 건물의」)과 재산세제과-939의 「해당 건물분」이고 정면 해석례는 **확인 필요**다. 사용자가 이월과세 경로에서 확정한 해석을 본인 신축에 일관 적용하는 것이 이 계획이다. 결과 고지에는 이월과세와 같은 「정면 해석례 확인 필요」 문구를 둔다(Q-8).
- 감정가액 일체 주택의 건물분 산정: **정면 해석례 없음**(KoreanLaw MCP `nts`·`tax_tribunal` 「환산취득가액 가산세 신축」 검색 — 조심 2021구0695·조심 2021중0697은 소급과세·정당한 사유 쟁점이고 base 범위는 다루지 않음). 근거는 §100②·영 §166⑥·부가령 §64①의 안분 체계 — §6, Q-3.

---

## 2. 현행 — 경로 전수 실측 (throwaway probe `scratchpad/q12/s1~s3.probe.ts`, mock 세율, 공통 픽스처 양도가 10억·양도일 2026-03-01·신축 2022-01-10·H(취득시)=2억·H_T=4억)

### 2.1 코드 구조 — 왜 일체 주택만 틀리는가

| 지점 | 현행 | 근거 |
|---|---|---|
| 일체 주택 환산 base | `calcTransferGain`이 `estimatedBase = 양도가 × H ÷ H_T` — **주택공시가격(토지 포함 일체)** 기준 | `lib/tax-engine/transfer-tax-helpers.ts:354-371` |
| 일체 주택 감정 base | `estimatedBase = appraisalValue ?? acquisitionPrice` — 사용자가 입력한 **자산 단위 감정 총액** | `transfer-tax-helpers.ts:373-383` |
| penalty base 결정 순서 | `splitBuildingAxis ?? input.penaltyAxis ?? effectiveInput.penaltyAxis` → 없으면 감정이면 `appraisalValue`, 환산이면 `estimatedBase` | `transfer-tax-finalize.ts:325-331` (정상) · `transfer-tax-loss-return.ts:96-105` (손실 — 같은 순서, dual-truth 방지) |
| 건물분이 되는 경우 | `resolveSplitBuildingPenaltyAxis`가 `splitDetail.building`(건물 파트 acqMode estimated/appraisal)에서 base를 낸다 | `transfer-tax-building-penalty.ts:161-171` |
| 증축 | `resolveExtensionPenaltyBase`: 환산이면 `양도가 × 증축부분 취득시 기준시가 ÷ standardPriceAtTransfer(H_T)` | `transfer-tax-building-penalty.ts:83-103` |
| ④ 전송 게이트 | `selfBuiltActive` = `housing|building` ∧ `isSelfBuilt` ∧ `acquisitionCause==="purchase"` | `lib/calc/self-built-scope.ts:27-45`, 사용 `lib/calc/transfer-tax-api.ts:425`·`transfer-tax-api-companion-payload.ts:419`·`multi-transfer-tax-api.ts:291` |
| `assetKind==="building"` | 「건물(토지 제외)」 — 토지 없는 건물 단독 | `lib/stores/calc-wizard-asset.ts:209` 주석 |

### 2.2 경로별 현행 base / 올바른 base / 필요한 입력

| ID | 경로 (probe) | 현행 base / 가산세 | 올바른 base (Q-2·Q-6 b) | 판정 · 필요한 입력 |
|---|---|---|---|---|
| **S-A** | **단건 housing 일체 환산** | **500,000,000 / 25,000,000** | **187,500,000 / 9,375,000** | **결함** · L·N·L_T·N_T(+sale) |
| **S-B** | **단건 housing 일체 감정** (감정 총액 3억) | **300,000,000 / 15,000,000** | 건물 감정가액(직접 1.1억 → 5,500,000) 또는 총액×취득시 N/(L+N)(112,500,000 → 5,625,000) | **결함** · 건물 감정(§6) |
| S-B2/B3 | 매매사례가액·실지거래가액 | 0 | 0 | 정상(비대상 — 조문 「감정가액 또는 환산취득가액」) · **입력 불요** |
| **S-E** | **지분 50% 환산** (transferPrice 5억·`ownershipRatio` 0.5) | **250,000,000 / 12,500,000** | 93,750,000 / 4,687,500 | **결함** · 동일 입력(기준시가는 전체 값, 구분 기재 양도가만 지분 스케일 — 이월과세 `buildHousing`과 동일 규약 `lib/calc/transfer-tax-api-donor-built.ts:23-26`) |
| **S-F** | **양도차손**(§97②2호 단서 swap, 자본적지출 12억) | **500,000,000 / 25,000,000** (세액 0이어도 부과 — §114조의2②) | 187,500,000 / 9,375,000 | **결함** · 손실 경로도 같은 축을 읽는다(`loss-return.ts:104-112`) |
| **S-G** | **고가주택**(1세대1주택 15억) 환산 | **500,000,000 / 25,000,000** | 187,500,000 / 9,375,000 | **결함** — 고가주택 안분(12억 초과분)은 base와 무관(재산세제과-939·397도 비과세 부분 제외 안 함). 비과세(12억 이하) 전액이면 가산세 자체가 0(S-G2: 엔진이 비과세 조기반환 — 현행 거동 유지) |
| S-P | 미등기 | 500,000,000 / 25,000,000 | 187,500,000 / 9,375,000 | **결함**(동일) |
| S-C | **분리 취득**(토지 2015 실가 + 건물 환산) | 225,000,000 / 11,250,000 | 동일 | **정상** — 건물 파트 축 `resolveSplitBuildingPenaltyAxis` |
| S-D / S-C2 | 분리 취득 양쪽 환산 / 건물 감정 | 225,000,000 / 250,000,000 | 동일 | 정상 |
| P | **PHD**(최초공시 전, `landAcquisitionDate` fallback으로 split 경로) | 191,860,465 / 9,593,023 (건물 파트) | 동일 | **정상** — PHD는 `phdSplitPathTaken`으로 분리 계산을 타 건물 파트 base(`transfer-tax-split-gain.ts:81-89`). 입력 불요 |
| BG-1/3 | **부담부증여 K-5/K-7 단건 housing** | 112,500,000 / 5,625,000 · 67,500,000(총액 입력) / 120,000,000(분리 입력) | 동일 | **정상** — §159 breakdown이 토지·건물을 따로 구한 `perAsset.building`(`transfer-tax-burdened-gift-step.ts:165-205`) |
| S-N | 비주택 `building`(건물 단독) | 500,000,000 / 25,000,000 | 동일 | **정상** — 건물 단독이라 토지 없음 |
| X | **증축 housing**(증축부분 std 1,500만, 100㎡) | 37,500,000 / 1,875,000 | S_b×ext÷B_tr = **37,500,000 (동일)** | **수치 불변**(기준시가 비례 안분이면 S_b/B_tr = S/H_T — §5.3). 구분 기재/감정 안분 모드에서만 28,125,000(−468,750) |
| CP1 | **컴패니언(함께 양도) 일체 주택** 환산/감정 | 환산 99,999,999 / 감정 300,000,000 (`__tests__/calc/companion-self-built-penalty.anchor.test.ts` C-1·V-1) | 건물분 | **결함**(S-A와 동일 엔진). ④⑫⑭ 컴패니언 3곳 별도 배선 필요 |
| MU | **다건 합산**(`/api/calc/transfer/multi`) housing | S-A와 동일 엔진(route probe 미실행 — 엔진 공유로 추론, **확인 필요**) | 건물분 | **결함** — 다건 ④(`multi-transfer-tax-api.ts:291`)·⑭(`multi/route.ts:496`)가 별도 배선. 키 분류 가드 `transfer.route.multi-key-coverage-f12.test.ts` 대상(Q-5) |
| 겸용 | **겸용주택** | 가산세 **없음** | — | `calcMixedUseTransferTax`에 §114조의2 배선 자체가 없다(`transfer-tax-mixed-use*.ts` grep `constructionDate` 0건) · ④는 `!isMixed`로 안 싣는다(`transfer-tax-api.ts:425`) 그러나 ⑤ 토글은 겸용에도 뜬다(`CompanionAcqPurchaseBlock.tsx:566-590`) → **별건 후보**(§12 V-5) — 이번 범위 밖 |
| 일반건물·상가 | 일반건물 카드/`commercial_building` | 카드가 이미 건물 파트 / 상가는 ⑤ 토글 미노출 | — | 범위 밖(V-6) |
| 상속·의제 | `acquisitionCause≠"purchase"` | 신축 입력 자체가 안 실린다(`selfBuiltActive`) | — | 해당 없음 |

**결론**: 영향 면적은 **「일체 주택 × 본인 신축 × 환산|감정 × 가산세 게이트 개방(5년 이내·양도일 ≥ 2018-01-01(환산)/2020-01-01(감정))」** × {단건·컴패니언·다건} × {정상·손실} 이다. 나머지 경로는 바이트 동일해야 한다(§9 회귀 0 격자).

---

## 3. 설계 — 엔진 (순수 leaf 1개 + 배선 2곳)

원칙은 이월과세 PR-1과 같다: **기존 `penaltyAxis` 채널 재사용**(finalize·loss-return·aggregate 합산·결과 4뷰 코드는 거의 안 바뀐다), 신규 입력은 **중첩 객체**(최상위 평문 칸을 늘리면 분리 계산(`calcSplitGain`)과 섞인다 — `carryover-donor-built-114-2.plan.md` §3.2 「최상위 재사용 금지」와 같은 이유).

### 3.1 입력 모양 — `TransferTaxInput.selfBuiltHousing` (신규, 일체 주택·본인 신축 전용)

| 필드 | 환산 | 감정 | 비고 |
|---|---|---|---|
| `landPricePerSqmAtAcquisition` · `landArea` · `buildingStdPriceAtAcquisition` | 필수(L, N) | 선택(비례 안분 선택 시 필수) | 취득 당시(신축일 시점) 토지 ㎡당 개별공시지가·면적·건물 기준시가 |
| `landStdPriceAtTransfer` · `buildingStdPriceAtTransfer` | 필수(L_T, N_T) | 불요 | 양도 당시 |
| `sale` (구분 기재·감정·예외) | 선택 | 불요 | `resolveTransferPriceSplit` 법정 서열 입력 그대로 |
| `buildingAppraisalValue` | 불요 | 직접 입력 시 | 감정평가서에 건물 가액이 구분 표시된 경우 |

⑫ shape는 **이월과세의 `donorBuiltHousingShape`(`lib/api/transfer-tax-schema-donor-built.ts:17-39`)를 그대로 `extend`** 한다 — 환산 필수 칸 구성이 같다. `.strict()`.

### 3.2 신규 leaf `lib/tax-engine/transfer-tax-self-built-housing-penalty.ts` (~130줄 예상)

- `needsSelfBuiltHousingBase(input)` — 판정 단일 소스(UI 술어가 이를 거울로 쓴다, §7): `propertyType==="housing"` ∧ `isSelfBuilt` ∧ `acquisitionCause`가 매매 ∧ 겸용 아님 ∧ 부담부증여 아님 ∧ **분리 계산 아님**(`splitDetail` 없음 — 분리/PHD/소유자 분리/배율초과분은 건물 파트가 이미 축) ∧ 산정방식이 `estimated|appraisal` ∧ 증축 아님(Q-4 권장) ∧ **가산세 게이트가 열림**(`calculateBuildingPenalty(input,1)!==null` — 5년·시행일).
- `resolveSelfBuiltHousingPenaltyAxis(input, ctx)` → `{ acquisitionMethod, base } | undefined`:
  - 환산: ① `B_acq = apportionByStdPrice(H, L, N).building` (H=`standardPriceAtAcquisition`, L=`calcLandStdPriceAtAcq`) ② `B_tr = apportionByStdPrice(H_T, L_T, N_T).building` ③ `S_b = resolveTransferPriceSplit({...}).building` ④ `base = calculateEstimatedAcquisitionPrice(S_b, B_acq, B_tr)`. — 이월과세 `housingBase`(`transfer-tax-carryover-donor-penalty.ts:132-170`)와 **같은 헬퍼 호출 순서**. 실측 재현 `fx`: L=100,000,000 · B_acq=75,000,000 · B_tr=160,000,000 · S_b=400,000,000 → **187,500,000**.
  - 감정: 직접 `buildingAppraisalValue`, 없으면 `apportionByStdPrice(appraisalValue, L, N).building`(Q-3).
- 입력 거부(`assertSelfBuiltHousingInput`): 필요한데 `selfBuiltHousing` 부재/불충분이면 `INVALID_INPUT`(이월과세 `assertDonorBuiltInput`과 같은 방어선). **단 엄격화 시점은 마지막 PR**(§9 — 선행 PR은 입력이 없으면 현행 base 유지로 배선만 한다. Q-2).
- 순환 의존 회피: `transfer-tax-carryover-donor-penalty.ts`(436줄)를 import하지 않고 헬퍼(`apportionByStdPrice`·`resolveTransferPriceSplit`·`calcLandStdPriceAtAcq`·`calculateEstimatedAcquisitionPrice`)를 직접 쓴다. (`housingBase`를 export해 공유하는 안은 구조 타입 결합이 커서 기각 — 중복 ~20줄은 허용. **확인 필요**: 공유 시 순환 여부 실측은 Do 단계.)

### 3.3 배선 (계산 로직 변경은 여기뿐)

| 위치 | 변경 |
|---|---|
| `transfer-tax-finalize.ts:325-326` (651줄 → +~5) | `const selfBuiltAxis = resolveSelfBuiltHousingPenaltyAxis(effectiveInput) ; const splitPenaltyAxis = splitBuildingAxis ?? selfBuiltAxis ?? input.penaltyAxis ?? effectiveInput.penaltyAxis;` — **우선순위 주의**: `splitBuildingAxis`(건물 파트)가 있으면 그것, 그다음 본인 신축 일체 주택 축 |
| `transfer-tax-loss-return.ts:104-105` (220줄 → +~3) | 같은 순서 (dual-truth 방지 — 손실 경로를 빠뜨리면 이월과세 PR-3 때 실측된 「손실이면 가산세 0/전체」 불일치 재발: `split-building-penalty-loss-extension.test.ts` L-1) |
| `transfer.types.ts` (types-only 예외 — 현재 1827줄) | `TransferTaxInput.selfBuiltHousing`(+~25) · `TransferTaxResult.selfBuiltHousingPenalty` echo(+~20) |
| `transfer-tax-aggregate-pickers.ts:45` | echo 승계(합산/컴패니언/다건 결과가 per-asset 결과의 필드를 골라 싣는다) |

`finalize`가 `penaltyAxis`를 읽을 때 감정 증축은 `splitPenaltyAxis ? undefined : effectiveInput.acquisitionMethod`로 분기한다(`finalize.ts:337-343`) — 새 축을 실으면 증축 감정 base가 건너뛰어지므로 **증축은 이 축을 내지 않는다**(`needsSelfBuiltHousingBase`가 증축 제외, Q-4).

### 3.4 이월과세와 본인 신축의 경계
`acquisitionCause`가 이월과세·부담부증여면 이 leaf는 동작하지 않는다 — 이월과세는 `donorBuilt`(`penaltyDonorBuilt`), 부담부증여는 §159 스텝이 이미 건물분을 낸다. 같은 자산에 둘이 겹칠 수 없다(취득원인 단일 선택).

---

## 4. 입력 문제 — 재사용 후보 실측과 신설 대안

### 4.1 본인 신축 경로에는 입력이 없다 (실측)
일체 주택 단건 환산의 화면 칸은 H(취득시)·H_T(양도시) **합계 2개**뿐이다(`CompanionAcqStdPriceSection.tsx:129-250`). L·N·L_T·N_T·양도가액 구분은 split/소유자 분리/배율초과분 분리 때만 열린다(`isSplitPayloadActive`/`ownerSplitHousingNeedsBuildingStd` — `lib/calc/transfer-tax-split-acq-mode.ts:551-571`).

### 4.2 재사용 가능한 기존 AssetForm 칸 (엔진·④ 관점 실측 — UI 배치는 UI 시니어 메모 참조)

| 필요한 값 | 기존 AssetForm 칸 | 근거 |
|---|---|---|
| L = ㎡당 공시지가 × 면적 (취득 당시) | `standardPricePerSqmAtAcq` + `acquisitionArea` (`calcLandStdPriceAtAcq`) | `CompanionAcqStdPriceSection.tsx:191-203`(소유자 분리용 칸) |
| N (취득 당시 건물 기준시가) | `buildingStandardPriceAtAcq` (`AcqBuildingStdField` variant `proportional`; ④가 와이어 `buildingStandardPriceAtAcquisition`으로 옮긴다) | `CompanionAcqStdPriceSection.tsx:204-212` |
| L_T · N_T (양도 당시) | `resolveLandStdAtTransfer(asset)`(← `standardPricePerSqmAtTransfer`·`landStandardPriceAtTransfer`) · `buildingStandardPriceAtTransfer` | 이월과세 ④가 읽는 칸(`transfer-tax-api-donor-built.ts:44-48`, `resolveLandStdAtTransfer` — `transfer-tax-split-acq-mode.ts:677`) |
| 양도가액 구분(구분 기재·감정·예외) | `saleSplitMode`·`landTransferPrice`·`buildingTransferPrice`·`landAppraisalAtTransfer`·`buildingAppraisalAtTransfer`·`saleSplitExemption` + 컴포넌트 `LandBuildingSaleSplitSection`(144줄) | `transfer-tax-api-donor-built.ts:23-40`, `CarryoverDonorBuiltSection.tsx:200-217` |
| 건물 감정가액 | **신규** `AssetForm` 1~2칸 (직접 입력 금액 + 안분 방식 토글) | 기존에 자산 단위 건물 감정 칸이 없다(분리 취득의 `buildingAcquisitionPrice`는 split 전용) |

→ **신규 store 칸 최대 2개**(감정만). 환산은 신규 0칸. ④는 이 칸들을 `selfBuiltHousing` 중첩 객체로 모아 싣는다(이월과세 `buildHousing`과 같은 구조 — 지분 스케일 규약 동일).
⚠️ **의미 충돌 점검(확인 필요 V-3)**: `acquisitionArea`는 일부양도에서 「양도분 면적」 의미로 쓰인다(`transfer-tax-api.ts:455-470` 주석). 본인 신축 L 산정에 쓸 면적이 취득 전체 면적인지 양도분인지 — 기준시가 H 쪽 면적과 같은 척도여야 하므로 `usesTransferAreaForAcqStdPrice` 술어와 동치 확인 필요.

### 4.3 신설 시 문제와 대안 (Q-2)
- **① 저장된 세션·이력의 기존 입력이 ⑧에 막힌다.** 이미 본인 신축 일체 주택 환산(또는 감정)으로 저장된 입력을 열면 L·N·L_T·N_T가 비어 계산이 막힌다. **자동 안분 fallback 금지** 정책상 H를 임의 비율로 나눠 채울 수 없다.
- **② 새 필수 칸**이 생긴다(신규 항목 최대 6개 — 환산).
- 대안:
  - **(a) 권장**: 가산세 게이트가 열리는 조합에서만 ⑧이 막고(엔진도 마지막 PR에서 throw), 사유를 안내(「건물분 가산세 계산에 토지·건물 기준시가가 필요합니다」). 게이트가 닫히는 조합(실가·매매사례·5년 초과·시행일 전·비신축)은 **요구하지 않는다**(요구 시 거짓 요구).
  - (b) 입력이 없으면 현행(전체 base) 유지 + 「건물분 산정 입력이 없어 토지 포함 금액으로 계산했습니다 — 확인 필요」 고지. 이월과세 P6가 한때 쓴 방식(`DONOR_BUILT_SPLIT_UNDECLARED_NOTICE`). 저장 이력은 안 막히지만 **과다 부과가 조용히 남는다**(−17,187,500 미반영).
  - (c) (a)+ 이력 한정 한시 허용: 저장 시점이 신 버전 이전인 이력만 (b). 이력 버전 구분 수단이 없고(`CalculationRecord`에 앱 버전 없음 — **확인 필요**) 복잡도 대비 이득이 작아 비권장.
- 반드시 지킬 것: 새 필수 칸은 **3중 패턴**(UI 노출 ⇔ ④ 전송 ⇔ ⑧ 요구가 한 술어, §7).

### 4.4 저장된 이력 영향
`CalculationRecord`는 `inputData`(폼)와 `resultData`(결과 스냅샷)를 따로 저장한다(`lib/storage/CLAUDE.md`). **스냅샷은 바뀌지 않는다.** 이력에서 불러와 계산을 다시 하면 ① (a)안: 새 필수 입력 차단 후 입력 시 새 값 ② (b)안: 현행 값 + 고지. `normalizeAsset`은 새 칸 부재를 빈 문자열로 복원한다(이월과세 DBC-N 선례 — `normalizeCarryoverForm`).

---

## 5. 세액 영향 실측 (throwaway probe `scratchpad/q12/s3.probe.ts`, 수정 후는 신규 산식을 기존 헬퍼로 계산해 `penaltyAxis`로 주입한 **실제 엔진 실행**)

### 5.1 대표 픽스처 (상위 계획 재확인: H=2억·L=1억(㎡당 100만×100㎡)·N=6천만, H_T=4억·L_T=2.4억·N_T=1.6억, 양도가 10억 → 187,500,000/9,375,000)

| 셀 | base 현행→수정 | 가산세 | 결정세액 | 지방소득세 | **총납부** |
|---|---|---|---|---|---|
| A 일체 환산 | 500,000,000 → **187,500,000** | 25,000,000 → **9,375,000** (−15,625,000) | 154,852,000 (불변) | 17,985,200 → 16,422,700 | 197,837,200 → **180,649,700 (−17,187,500)** |
| F 양도차손(결정세액 0) | 500,000,000 → 187,500,000 | 25,000,000 → 9,375,000 | 0 | 2,500,000 → 937,500 | 27,500,000 → **10,312,500 (−17,187,500)** |
| E 지분 50%(양도가 5억) | 250,000,000 → 93,750,000 | 12,500,000 → 4,687,500 | 65,461,200 | 7,796,120 → 7,014,870 | 85,757,320 → **77,163,570 (−8,593,750)** |
| G 고가 1주택 15억(H_T 6억·L_T 3.6억·N_T 2.4억) | 500,000,000 → 187,500,000 | 25,000,000 → 9,375,000 | 30,999,400 | 5,599,940 → 4,037,440 | 61,599,340 → **44,411,840 (−17,187,500)** |
| B 감정(총액 3억) — 비례 안분 | 300,000,000 → 112,500,000 | 15,000,000 → 5,625,000 | 231,171,600 | 24,617,160 → 23,679,660 | 270,788,760 → **260,476,260 (−10,312,500)** |
| B 감정 — 건물 감정 직접 1.1억 | 300,000,000 → 110,000,000 | 15,000,000 → 5,500,000 | 231,171,600 | → 23,667,160 | 270,788,760 → **260,338,760 (−10,450,000)** |
| 구분 기재(토지 7억/건물 3억, §100③ 통과) | → 140,625,000 | 7,031,250 | 154,852,000 | 16,188,325 | 197,837,200 → **178,071,575 (−19,765,625)** |

**결정세액·세율·장특은 모두 불변** — 변하는 것은 §114조의2 가산세와 그 10% 지방소득세뿐이다. 부호는 항상 감소(건물분 ⊂ 자산 전체).

### 5.2 변하지 않는 셀 (probe 확인 — 회귀 0이어야 함)
분리 취득 건물 파트 225,000,000/11,250,000(S-C)·250,000,000(감정, S-C2) · PHD 191,860,465/9,593,023 · 부담부증여 K-5 housing 5,625,000·K-7 3,375,000/6,000,000 · 비주택 건물 500,000,000/25,000,000 · 실가·매매사례 0.

### 5.3 증축 — 왜 수치가 변하지 않는가
`S_b ÷ B_tr`에서 S_b = S × N_T/(L_T+N_T), B_tr = H_T × N_T/(L_T+N_T)(둘 다 floor 오차 제외) ⇒ `S_b ÷ B_tr = S ÷ H_T` — 현행 증축 식 `S × ext ÷ H_T`와 **수학적 동치**(probe X: 현행 1,875,000, 신 산식 37,500,000 → 동일). 다른 값은 구분 기재/감정 안분 모드에서만 나온다(구분 기재 700/300 → 28,125,000 → 1,406,250, −468,750). 증축은 기준시가 안분이 법정 서열의 최하위 수단일 뿐 기본값이고 현행이 이미 증축부분(건물) 한정이므로 **이번 범위에서 제외**를 권장한다(Q-4).

---

## 6. 감정가액 일체 주택 — 건물분 산정

법문은 「**해당 건물의 감정가액**」이다. 감정평가서는 토지·건물을 구분 표시하는 경우가 일반적이라 **직접 입력**이 법문에 가장 가깝다(분리 취득의 건물 파트가 `buildingAcquisitionPrice`로 건물 감정가액을 직접 받는 것과 같다 — S-C2). 구분 표시가 없는 감정서는 법 §100②·영 §166⑥·부가령 §64①1호(감정평가가액 > 기준시가 비례)와 저장소 선례(부담부증여 K-7 총액 입력은 **취득 당시 토지:건물 기준시가 비례**로 건물분 산정 — probe BG-3: 총액 3억×0.6 채무비율×75/200 = 67,500,000)에 따라 **취득 당시 기준시가 비례**로 나눈다. 정면 해석례는 확인하지 못했다 → **확인 필요**, Q-3에서 선택.

---

## 7. 14 동기화 지점 · ⑧↔⑫ 격자 · 3중 패턴

| # | 지점 | 본인 신축 일체 주택 변경 | 파일(현재 줄 수) |
|---|---|---|---|
| ① | 폼 상태 | 환산: 기존 칸 재사용(신규 0). 감정: 건물 감정 직접 `selfBuiltBuildingAppraisal` + 안분 방식 토글(신규 ≤2) | `lib/stores/calc-wizard-asset.ts`(663) |
| ② | initial | 신규 칸 기본값 | `calc-wizard-asset-factory.ts`(613) · `calc-wizard-store.ts:66` |
| ③ | normalize | 새 칸 부재(구 세션·이력) → 빈 값 복원 | `calc-wizard-migration.ts`(322) · `normalizeAsset` 계열 |
| ④ | API 변환 | `lib/calc/transfer-tax-api-self-built-housing.ts`(신규 ~80줄, `withSelfBuiltHousing`) — 단건 `transfer-tax-api.ts:425` 근처·컴패니언 `transfer-tax-api-companion-payload.ts:419` 근처·다건 `multi-transfer-tax-api.ts:291` 근처 **3곳 호출** | 731 · 702 · 661 |
| ⑤ | UI | §7.1 UI 메모 요약 (`CompanionAcqPurchaseBlock.tsx`(595)·`SelfBuiltSection`(159) 인접, 신규 카드 `SelfBuiltHousingShareBlock`) | — |
| ⑥ | 사이드바 합계 | **변경 없음** — 가산세는 합계에 안 들어간다(본인 신축 가산세 포함 기존 동일, `transfer-per-asset-summary.ts`) | — |
| ⑦ | 결과 | echo `selfBuiltHousingPenalty`(건물분 산식 구성요소: B_acq·B_tr·S_b) + 4뷰 단일 접점(`DetailedStatementLateStages.ts:176-210`의 `resultDonorBuiltEcho` 패턴) + pickers `transfer-tax-aggregate-pickers.ts:45` — 4뷰 상세는 §7.1 | — |
| ⑧ | validate | `lib/calc/transfer-tax-validate-self-built-housing.ts`(신규 ~70줄) — `validateAcquisition` 신축·증축 블록(`transfer-tax-validate-acquisition.ts:~682`) 뒤 1줄 호출(706줄) | |
| ⑨ | Zod enum 메인 | 신규 enum 없음(`saleSplitExemption` 재사용) — N/A | |
| ⑩ | Zod 컴패니언 + `addPropertyRefines` | 컴패니언 shape(`transfer-tax-schema-companion.ts:303` 근처, 402줄)에 동일 키 + refine | |
| ⑪ | 자산-수준 `acquisitionDate` fallback | N/A (일반건물 카드 전용) | |
| ⑫ | Zod 입력 객체 | `lib/api/transfer-tax-schema-self-built-housing.ts`(신규 ~80줄) — 메인 `base-shape.ts:301` 근처(659줄, +3) · 컴패니언 · **다건 스키마**(Q-5: 매핑 또는 `MULTI_REJECT_RULES`) | |
| ⑬ | `callTransferTaxAPI` body spread | 위 ④ 3곳의 spread — 키 누락 시 침묵 strip | |
| ⑭ | Route 엔진 input 매핑 | `engine-input.ts:363` 근처(558)·`bundled-split-helpers.ts:508` 근처(**779줄 — ≥750 위험구간**)·`multi/route.ts:496` 근처(701). 중첩 객체에 Date 없음(날짜 변환 불요) | |

### ⑧↔⑫ 정합 격자 (구현 전 설계 — 구현 시 전수 대조)
차원: 자산종류(housing/building/기타) × 취득원인(매매/기타) × 산정방식(환산/감정/매매사례/실가) × `isSelfBuilt` × 게이트(5년·시행일) × 분리(없음/별개취득/소유자 분리/PHD/배율초과분) × 부담부증여 × 겸용 × 증축 × 필수 칸 누락(각각).
기대 결과: **게이트 닫힘/비대상 조합 → ⑧·⑫·엔진 모두 입력을 요구하지 않고 허용(stale 값은 ④가 미전송)** · **게이트 열린 일체 주택 → ⑧ 차단 ⇔ ⑫ 400 ⇔ 엔진 throw 동일 집합** · 분리/PHD/부담부증여/겸용/증축/비주택 건물에 `selfBuiltHousing`을 보내면 ⑫ 400(받고 무시 = 침묵 오답 금지, `.strict()` + refine).

### 3중 패턴 (display fallback prop + API 변환 + validate)
토글/라디오 기본값(`saleSplitMode ?? "apportioned"`, 감정 안분 방식 기본)이 UI·④·⑧에서 **같은 값**이어야 한다 — 이월과세 `buildHousing`의 `asset.saleSplitMode ?? "apportioned"`(`transfer-tax-api-donor-built.ts:24`)를 같은 상수 헬퍼로 공유. `useEffect → store` 미러링 금지: 모든 쓰기 `onChange`. 자동 안분 금지: 빈 L/N을 H에서 역산하지 않고 ⑧로 차단.

---

### 7.1 UI 시니어 메모 요약 (원문: `scratchpad/q12-ui-notes.md` — ⑤⑥⑦ 상세는 그쪽, 통합 요청 시 본문으로 승격)

- **신규 AssetForm 칸 0개로 환산 가능**: H·H_T·L(단가×면적)·N·L_T·N_T·S_b 구분이 전부 기존 칸이고 normalize도 되어 있다(S3-1 소유자 분리·#17 배율초과분·이월과세 donorBuilt와 같은 칸 — `factory.ts:257-265`, `migrate.ts:81`). 새로 만들 것: 술어 leaf 1(⑤⑧④ 공유) · 카드 1(`SelfBuiltHousingShareBlock`, 본인 신축 토글 본문 끝 `children` 슬롯 — `CompanionAcqPurchaseBlock.tsx:568-594`) · ④ 중첩 객체 빌더(이월과세 `buildHousing`의 `sale` 조립을 공용 leaf로 추출) · ⑧ 검증 1 · ⑦ 4뷰 건물분 산식 줄.
- **술어 게이트**(AND): `selfBuiltActive` ∧ housing ∧ 비겸용·비부담부·비 D2 ∧ 환산|감정 ∧ **가산세 창 개방**(`calculateBuildingPenalty(input,1)` — `bgAppraisalBuildingPenaltyApplies`(`burdened-gift-presumed-acquisition.ts:154`)가 `"appraisal"` 하드코딩이라 방식 인자 일반화 신규 함수) ∧ **`!isSplitPayloadActive` ∧ `!phdFlagEffective`**(S3-1/#17 카드와 `data-field` 중복 구조적 차단). 반환: 환산 신축 {취득·양도 둘 다} / 감정 신축 {취득만} / 환산 증축 {양도만} / 감정 증축 null.
- **⑥ 사이드바 변경 없음**(가산세는 합계에 안 들어간다, 양도차익 불변 — 엔진 (B) 방식 전제 = 이 계획 §3). **⑦**: 현재 본인 신축 가산세는 숫자 1개뿐(근거 설명 카드 없음) → 건물분이 되면 산식 노출 필요: 단건 echo 1개(이월과세 `DonorBuiltPenaltyEcho`와 같은 모양, `transfer-carryover.types.ts:408-448`) + 4뷰 단일 접점(상세명세서 `:209-212`, 신고서 `FilingFormTableHelpers.ts:677-699` 각주, PDF `:84-120`, 결과 카드 신규 `SelfBuiltPenaltyCard`).
- **⑧ 저장된 세션 흐름**: 새 카드가 빈 채로 보이고 「다음/계산」에서 ⑧ 오류 → 필드 이동 → 입력 → 통과. 술어가 거짓이면(5년 경과·방식 변경·PHD 등) 칸도 요구도 없다(막다른 길 방지). 이력 `resultData`는 열기만 하면 재계산이 없어 영향 없음(단 복원 경로 코드 확인 필요).
- **발견된 UI 함정**: 양도 토지 면적 칸 중복(`LandBuildingSaleSplitSection(showStdCard)` ↔ ① `same` 시나리오 한 칸 공유 — 앵커 `transferArea` vs `acquisitionArea`) · `TransferTaxResultView.tsx` 790줄.
- **UI 메모의 결정 Q 대응**: Q-UI-2(컴패니언·다건 포함) = 본 문서 Q-5·Q-6(권장 일치: 한 번에 ④ 3곳) · Q-UI-3(감정) = 본 문서 Q-3(**UI는 (B) 비례만·신규 칸 0 권장 vs 본 문서 (C) 직접+토글 권장 — 사용자 선택**) · Q-UI-5(증축) = Q-4 · Q-UI-6(지분·일부양도) = V-3 · Q-UI-7(고지) = Q-7 · Q-UI-9(엔진 (B)) = §3 채택 · Q-UI-10(`TransferTaxResultView` 분리 포함) = §8.

---

## 8. 파일 줄 수 (800줄 정책) — `wc -l` 실측 (2026-10-23)

| 파일 | 현재 | 변경 | 판정 |
|---|---|---|---|
| `transfer-tax-finalize.ts` | 650 | +~5 | OK |
| `transfer-tax-loss-return.ts` | 220 | +~3 | OK |
| `transfer-tax-building-penalty.ts` | 203 | 0 | — |
| `transfer-tax-self-built-housing-penalty.ts` (신규) | — | ~130 | OK |
| `lib/tax-engine/types/transfer.types.ts` | 1827 | +~45 | types-only 예외(별도 판단) |
| `lib/api/transfer-tax-schema-base-shape.ts` | 659 | +~3 | OK |
| `lib/api/transfer-tax-schema-companion.ts` | 402 | +~3 | OK |
| `lib/api/transfer-tax-schema-self-built-housing.ts` (신규) | — | ~80 | OK |
| `lib/calc/transfer-tax-api.ts` | 731 | +~6 | OK (≥700 근접, 호출 1줄) |
| `lib/calc/transfer-tax-api-companion-payload.ts` | 702 | +~6 | OK |
| `lib/calc/multi-transfer-tax-api.ts` | 661 | +~6 | OK |
| `lib/calc/transfer-tax-validate-acquisition.ts` | 706 | +~4 | OK |
| `app/api/calc/transfer/engine-input.ts` | 558 | +~6 | OK |
| **`app/api/calc/transfer/bundled-split-helpers.ts`** | **779** | +~6 → 785 | **⚠️ 750 이상 — 800 직하. 정책(기회주의적 분리)상 이 파일을 여는 PR에서 `companionEngine` 조립부(:472-659) 분리 선행 권장 — PR-0** |
| `app/api/calc/transfer/multi/route.ts` | 701 | +~6 | OK |
| `lib/calc/self-built-scope.ts` | 45 | +~30 (술어; UI 메모는 별도 leaf `self-built-housing-share-scope.ts`를 제안 — 어느 쪽이든 신규 파일) | OK |
| **`components/calc/results/TransferTaxResultView.tsx`** | **790** | 카드 마운트 시 ~793 | **⚠️ 750 이상 — PR-3에서 기회주의적 분리(≤700 착지) 필요 (UI 메모 Q-UI-10)** |
| `components/calc/results/transfer/FilingFormTableHelpers.ts` | 723 | +~7 | OK(분리 목표선 근접) |
| `DetailedStatementLateStages.ts` / `ResultPdfTransferSections.tsx` | 324 / 489 | +~11 | OK |

---

## 9. PR 분할 · Pre-Do anchor · 회귀 0 격자 · 뮤테이션

**분할 원칙**: ⑧을 UI(⑤)보다 먼저 켜면 입력 경로 없는 차단(dead-end)이 생기고, 엔진을 엄격화(throw)하기 전에 모든 전송 경로(④⑫⑭ 단건·컴패니언·다건)가 배선돼야 한다. 그래서 **「배선(관대) → 입력 UI+⑧ → 결과 → 엄격화」** 순서를 권장한다.

| PR | 범위 | 핵심 anchor |
|---|---|---|
| **PR-0**(선택) | `bundled-split-helpers.ts` 779줄 분리 선처리(≥750) | 분리 전후 컴패니언 격자 응답 해시 동일 |
| **PR-1** | 엔진 leaf + 타입 + finalize/loss-return 배선 + ⑫(메인·컴패니언·다건 분류) + ⑭(3곳). **`selfBuiltHousing` 부재 시 현행 base 유지**(관대) | 아래 Pre-Do 1~9 · 키 없는 응답 해시 불변 · 다건 키 분류 가드 |
| **PR-2** | ④ 3곳 + ⑤ 입력 UI + ⑧ validate + ①②③ + 술어 leaf | ⑧↔⑫ 격자 · ④ stale 미전송 · 브라우저/Playwright E2E 신규 spec |
| **PR-3** | ⑦ 결과 echo 4뷰 + 고지 문구 + 결과 카드 라벨 | 4뷰 단일 접점 anchor · 합산 pickers |
| **PR-4** | 엔진 엄격화(throw) + 기존 테스트 fixture 갱신(§10) + 주석/문서 정리 | §10 영향 테스트 전수 갱신 · 그 외 불변 |

### Pre-Do anchor (구현 전에 먼저 작성·실행 — 「현행 일치 예상」 금지)
1. **현행 고정**: S-A 500,000,000/25,000,000/총 197,837,200 · S-B 300,000,000/15,000,000 · X 증축 37,500,000/1,875,000.
2. **신 산식 재현**: `fx` → B_acq 75,000,000 · B_tr 160,000,000 · S_b 400,000,000 · base 187,500,000 · 가산세 9,375,000 · 총납부 180,649,700(−17,187,500).
3. 손실(F) 10,312,500 · 지분 50%(E) 77,163,570 · 고가(G) 44,411,840 · 미등기(P).
4. 감정: 직접 1.1억 → 5,500,000 / 비례 → 5,625,000.
5. 구분 기재 700/300 → 140,625,000 · §100③ 30% 경계(양도시 기준시가 안분 대비 ±30% / 29.99%).
6. 경계: 신축 5년 되는 날/다음날(`addYears`), 윤년 2/29, 환산 시행일 2017-12-31/2018-01-01, 감정 2019-12-31/2020-01-01.
7. **변하지 않는 셀**: 분리 취득 225,000,000·PHD 191,860,465·BG K-5 5,625,000/K-7 3,375,000·비주택 건물 500,000,000·증축 1,875,000(기준시가 안분)·실가·매매사례·5년 초과 → 0.
8. 컴패니언 C-1(환산 99,999,999→건물분)·V-1(감정 300,000,000→건물분)·다건 동일 값.
9. 침묵 strip 가드: 컴패니언 `satisfies` 키 커버리지(`bundled-split-helpers.ts:472-659` `satisfies` · 키 커버리지 가드 `:688`)·다건 키 분류.

### 회귀 0 격자
기준선(master)과 수정 후를 **응답 전체 JSON 해시**로 대조. 차원: 자산종류{housing,building,land,mixed} × 산정방식{actual,estimated,appraisal,salesCase} × `isSelfBuilt`{T,F} × 신축/증축 × 신축일{5년 이내,초과} × 양도일{2017-12-31,2018-01-01,2019-12-31,2020-01-01,2026} × 분리{없음,별개,소유자,PHD} × 부담부증여{없음,K-5,K-7} × 지분{1,0.5} × 비과세{예,아니오} × 경로{단건,컴패니언,다건}. **기대 diff 집합 = {housing, 비분리, 비BG, 비겸용, isSelfBuilt, 신축, 게이트 개방, 환산|감정} 셀의 `penaltyBase·penaltyTax·localIncomeTax·totalTax·steps`뿐**; PR-1(관대)에서는 `selfBuiltHousing` 미전송이면 diff **0**.

### 뮤테이션 계획 (백업 키 = label+file md5, 전 변경 파일 sha 전후 대조, 하네스 후 잔존 변형 확인)
(1) 축 우선순위 뒤집기(`selfBuiltAxis ?? splitBuildingAxis`) → 분리 취득 셀이 죽어야 · (2) 손실 경로 배선 제거 → F 셀 · (3) S_b 대신 `transferPrice` 사용 · (4) B_tr 대신 H_T · (5) B_acq 대신 H · (6) 구분 기재 서열 무시 · (7) 지분 스케일 제거 · (8) 증축 제외 술어 제거 → X 셀 · (9) 게이트 술어에서 감정 시행일 제거 · (10) 컴패니언 ④ 호출 제거 · (11) 다건 ⑭ 매핑 제거 · (12) ⑧ 술어와 ④ 술어 한쪽만 바꿈 → ⑧↔⑫ 격자. 손실×증축처럼 **분기 쌍을 갖춘 anchor** 없이는 SURVIVED가 나오는 전례(이월과세 PR-3 N02)를 반복하지 않는다.

---

## 10. 영향 받는 기존 테스트 (throwaway 실측 — 엄격화 PR-4에서 갱신)

**방법(throwaway, 원복·md5 대조 완료)**: finalize·loss-return에 「일체 주택(`propertyType==="housing"`) ∧ 가산세 게이트 개방 ∧ 건물 파트 축 없음 ∧ 부담부증여 아님이면 throw」 한 줄씩을 임시로 넣고 `vitest run __tests__` 전건(40,742건)을 돌렸다 — 「전체 base에 의존하는 기존 테스트」를 찾는 실측이다. 원복 후 대상 3개 파일 45/45 통과 재확인(기준선 정상).

| 파일 | 실패 | 해당 경로 | Q-4(증축 제외)·권장안 기준 |
|---|---|---|---|
| `__tests__/calc/companion-self-built-penalty.anchor.test.ts` | 6 | C-1·C-2(컴패니언 환산 신축 99,999,999→건물분) · V-1(컴패니언 감정 신축 300,000,000→건물분) | **갱신 필요 3건**: C-1·C-2·V-1 · (C-3 환산 증축·V-2/V-4 감정 증축은 Q-4 제외로 **불변**) |
| `__tests__/tax-engine/transfer-tax/general-extension-appraisal-penalty.anchor.test.ts` | 5 | G-1·G-1b·G-3·G-6·G-8 (증축 감정/환산) | **불변**(증축 — 본 축을 내지 않음) |
| `__tests__/calc/general-extension-appraisal.anchor.test.ts` | 1 | W-3 (증축 감정) | **불변** |
| E2E (미실행 — 정적 grep, **확인 필요**: CI e2e 12샤드) | — | `e2e/transfer-companion-self-built-penalty.spec.ts`(컴패니언 환산 4,999,999·감정 300M/15M 단언 `:128`·`:140-141`) · `e2e/transfer-extension-appraisal-penalty.spec.ts` EA-3(신축 감정 `penaltyBase` 300M/15M `:127-128`) | 갱신 필요 2 spec |

⇒ 엔진 단위 테스트(`integration.test.ts` 등)는 `building`(건물 단독) fixture라 영향이 없다. **전체 vitest에서 실제 갱신이 필요한 것은 단 3건(+E2E 2 spec)** 이며, 신규 anchor는 §9 Pre-Do 목록에서 만든다. (증축을 Q-4에서 「포함」으로 바꾸면 위 불변 6건 + W-3 중 일부가 입력 추가와 함께 갱신 대상으로 편입된다.)

---

## 11. 사용자 결정 Q (권장안 ★)

| Q | 질문 | 선택지 · 수치 | 권장 |
|---|---|---|---|
| **Q-1** | **전제 확인**: 이월과세에서 확정한 「건물분만」 해석(Q-2 산식·Q-6 b)을 **본인 신축에도 그대로** 적용하는가? 근거: 법문 「해당 건물의」·재산세제과-939 「해당 건물분」. 정면 해석례(일체 취득 시 토지분 제외)는 **확인 필요** | 예: 대표 −17,187,500(총납부) / 아니오: 현행 유지(이월과세 쪽과 불일치 지속) | ★ 예 (일관성) |
| **Q-2** | **입력 부재 처리**(저장된 세션·이력 + 새 필수 칸) | (a) ⑧ 차단 + 사유 안내, 엔진은 마지막 PR에서 throw / (b) 현행(토지 포함 base) 유지 + 「건물분 산정 입력 없음 — 확인 필요」 고지 / (c) (a)+ 구 이력 한시 허용 | ★ (a). (b)는 과다 부과(예: 25,000,000 vs 9,375,000)가 조용히 남는다 |
| **Q-3** | **감정가액 일체 주택** 건물분 산정 | (A) 건물 감정가액 직접 입력만 / (B) 총액 × 취득 당시 N/(L+N) 비례만 / (C) 직접 입력 + 「구분 표시 없음」 토글 시 비례. 수치: 직접 1.1억 → 5,500,000 · 비례 112,500,000 → 5,625,000 | ★ (C) — 법문(「해당 건물의 감정가액」)에 가깝고 구분 없는 감정서의 막다른 길을 막는다. 비례 근거 정면 해석례는 **확인 필요**(영 §166⑥·부가령 §64①·K-7 선례) |
| **Q-4** | **증축 일체 주택** 포함 여부 | 제외(현행 유지: 기준시가 안분이면 수학적 동치 1,875,000 불변) / 포함(S_b 법정 서열 반영 — 구분 기재 700/300이면 1,406,250, −468,750, 입력 동일) | ★ 제외 (변동 0, 입력 추가 부담 없음). 구분 기재/감정 안분 모드의 미세 차이는 확인 필요로 기록 |
| **Q-5** | **다건 합산 경로** | 매핑(단건 ④ leaf·⑭ 재사용, 현재 자산 가산세가 동작하는 기능 유지) / `MULTI_REJECT_RULES`로 거부(다건에서 본인 신축 일체 주택 환산 불가 — 기능 후퇴) | ★ 매핑 (현재 동작 기능을 막지 않는다. 비용: ④ 1곳 + ⑭ 1곳 + 키 분류 가드 갱신) |
| **Q-6** | **PR 순서** | 관대 배선 → UI+⑧ → 결과 → 엄격화(§9, 5 PR) / 단일 PR | ★ 분할 (PR-0은 ≥750 파일 분리 정책 이행) |
| **Q-7** | **거동 변경 고지** 수준 | 결과 카드·신고서·PDF에 「건물분만 대상 — 정면 해석례 확인 필요」 한 줄 / 고지 없음 | ★ 고지 (이월과세 Q-5 문구 승계, 계산 결과에 영향 주는 해석 선택이므로) |
| **Q-8** | **라벨 정정 동시 처리**: 결과 카드 §114조의2 행의 고정 「환산취득가액」 라벨(감정에서도 동일 — 5b에서 정정 완료 여부는 **확인 필요**) | 본 PR-3에서 echo와 함께 정리 / 별건 | ★ PR-3 포함 |
| **Q-9** | **겸용주택 신축 토글 노출 ↔ 미전송 불일치**(별건 발견: ⑤는 겸용에도 토글을 보이고 ④는 `!isMixed`로 안 싣는다) | 본 계획 범위 밖으로 기록 / 함께 수정 | ★ 범위 밖 (겸용 엔진에 §114조의2 배선이 없어 정확성 작업이 별도로 필요 — 별건 계획서) |

---

## 12. 미확인·검증 레지스터

| ID | 항목 | 상태 |
|---|---|---|
| V-1 | 일체 취득 주택의 가산세 base에서 토지분을 제외하는 **정면 해석례** | **확인 필요** — 법문·재산세제과-939 「해당 건물분」만 확인 |
| V-2 | 감정가액 일체의 건물분 안분(기준시가 비례) 정면 해석례 | **확인 필요** |
| V-3 | 본인 신축 L 산정 면적(`acquisitionArea`)이 취득 전체 면적인지 양도분인지 — H 쪽과 동척도인지(`usesTransferAreaForAcqStdPrice`) | **확인 필요** — Do 전 probe |
| V-4 | 공익수용 §164⑨ 환산 분모 특례(`resolveConversionDenominatorAtTransfer`)와 B_tr 안분의 상호작용 | **확인 필요** — 이번 범위에서 특례 적용 시 거부할지 |
| V-5 | 겸용주택 §114조의2 미배선(엔진) · 토글 불일치(⑤) | 별건 후보 — 의도 여부 **확인 필요** |
| V-6 | 오피스텔·상업용 건물(`commercial_building`) 일괄 고시 가격의 건물분 | 이번 범위 밖 · ⑤ 토글 미노출 |
| V-7 | 최초공시 전 취득(신축 직후 첫 개별주택가격 공시 전) 주택의 H: `PHD`는 split 경로로 이미 건물 파트 — **개별주택가격이 있는 신축 주택**의 H 취득시점 (신축일 직전 공시에는 건물이 없음) 해석 | 현행 거동 유지 · 별건 **확인 필요** |
| V-8 | `calc-wizard` 저장 이력에 앱 버전 구분 수단 | **확인 필요**(Q-2 (c) 판단) |
| V-10 | 다건 ④(`multi-transfer-tax-api.ts:291`)는 `selfBuiltActive(primary)`만 보고 겸용 제외가 없다(단건 `transfer-tax-api.ts:425`는 `!isMixed`) — 비대칭이 실제 오전송을 일으키는지 | **확인 필요**(UI 메모 §10-6) |
| V-9 | KoreanLaw MCP: 소득세법 MST 280405 §114조의2·§97·§100, 영 MST 290841 §166·§176의2, 부가령 MST 283641 §64 | **확인 완료**(2026-10-23) |

---

## 13. 자가 점검

- [x] useEffect → store 미러링: 신규 쓰기 모두 onChange 전제(설계서 §7). 신규 입력은 감정 건물분 ≤2칸.
- [x] 자동 안분 fallback 금지: 빈 L/N/L_T/N_T를 H·합계에서 역산하지 않는다 — ⑧ 차단. 예외 PHD(§166⑥ 면적 안분)는 해당 없음.
- [x] ⑧ 동기화: §7 격자(UI 통과 ↔ validate 차단 ↔ ⑫ ↔ 엔진 동일 집합) — 구현 시 전수 대조.
- [ ] 14지점 grep(⑫⑬⑭), anchor, tsc, vitest, 브라우저 확인 — Do 단계 항목(이번은 계획서만).
