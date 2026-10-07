# 토지·건물 취득일 상이 — 파트별 취득가액 산정방식·취득가액 분리 계산 확장 계획서 (rev.1)

> 작성 2026-10-06 · 브랜치 `feat/transfer-land-bldg-split-acq` · 워크트리 `Property-related-Taxes-lbs` (base `c47885ccd`)
> 대상 자산: **주택(겸용 아님) · 일반건물 · 겸용주택** (양도소득세)
> 상태: **Plan — 범위 확정(2026-10-06), Design 전.** Q-1·Q-3·Q-4 확정(§8). 남은 착수 조건: B1은 V-2 → Q-2.

---

## 0. 요청과 결론 요약

**사용자 요청**: 토지·건물 취득일이 다르면 산정방식이 파트마다 같을 수도(둘 다 실가), 다를 수도(토지 실가 + 건물 감정가액, 또는 그 반대) 있다. 지금은 취득일만 따로 받고 산정방식·취득가액은 분리 계산이 안 되는 것 같다 → 현행을 점검하고 확장 계획을 세운다.

**점검 결론** (§2 상세, 화면 실측 + 코드 추적):

| 자산 | 파트별 산정방식 | 파트별 취득가액 | 판정 |
|---|---|---|---|
| **주택**(겸용 아님) | ✅ 4방식(실가·환산·감정·매매사례) 독립 선택 | ✅ | **이미 동작** — 7조합 실측 통과. 단 표시 결함·취득원인 혼합 불가 |
| **일반건물** | ⚠️ **2방식(실가·환산)뿐** | ✅ | **부분** — 감정가액·매매사례가액 조합 입력 불가 + 실가 경로가 파트 모드를 무시하는 잠복 결함 |
| **겸용주택** | ❌ 자산 전체 라디오 1벌 | ❌ 총액 1칸 | **미구현** — 게이트에서 명시 제외 + 기준시가 시점 혼합 결함 |

⇒ 사용자 체감은 **겸용주택에서는 정확**하고, **일반건물에서는 「감정가액 조합」 한정으로 정확**하며, **주택에서는 기능이 있으나 진입 경로가 깊고 상세명세서 표시가 합산 1줄이라 없는 것처럼 보인다**.

---

## 1. 법령 근거 (KoreanLaw 본문 확인 — 2026-10-06)

| 조문 | 확인 MST | 요지 | 이 계획에서의 역할 |
|---|---|---|---|
| 「소득세법」 제100조 제1항 | 280405 | 양도가액이 실지거래가액이면 취득가액도 실지거래가액 — **매매사례가액·감정가액·환산취득가액 포함** | 파트마다 실가·감정·환산을 섞는 것이 같은 「실지거래가액」 범주 안 |
| 「소득세법」 제100조 제2항 | 280405 | 토지·건물을 **함께** 취득한 경우 각각 구분 기장, 구분 불분명 시 기준시가 등으로 안분. 후문 「공통되는 취득가액과 양도비용은 해당 자산의 가액에 비례하여 안분」 | 별개 취득은 파트별 가액이 실재 → 총액 안분 모델의 전제 밖 / 겸용 4부분 내부 안분의 근거(후문) |
| 「소득세법」 제100조 제3항 | 280405 | 구분 기장가액이 안분가액과 30% 이상 차이 → 구분 불분명으로 봄 | **함께 취득** 전제 조항 — 별개 취득 파트별 가액엔 적용 대상 아님(확인 필요 V-8) |
| 「소득세법 시행령」 제176조의2 제2항 | 290841 | 환산취득가액 **산식** 정의(2호 = 토지·건물) | 환산 파트 산식 |
| 「소득세법 시행령」 제176조의2 제3항 | 290841 | 추계 시 **매매사례가액(1호) → 감정가액(2호) → 환산취득가액(3호) → 기준시가(4호)** 순차 적용, 「해당 자산」 단위 | **일반건물 2방식 제한의 근거가 없음** — 코드 주석(`CompanionAcqPurchaseBlock.tsx:127`, 「§176의2②는 환산취득가만 규정」)은 ③을 누락한 독법 |

> ⚠️ 겸용주택 4부분 결합 방식(§5.3)에 대한 **국세청 집행기준·해석례는 미조회**다(V-2). 위 조문만으로는 「토지 파트 가액을 주택부수토지/상가부수토지로 무엇을 기준으로 나누는가」가 확정되지 않는다.

---

## 2. 현행 점검 결과

### 2.1 주택(assetKind=`housing`, 겸용 아님) — 이미 동작

**진입 경로**: ① 기본정보 「주택」 → **③ 취득정보 펼치기(기본 접힘)** → 취득원인 「매매」 → 「토지·건물 취득일 다름」 ON(`CompanionAcqDateSection.tsx:89-103`) → 두 날짜를 **실제로 다르게** 입력 → 상단 자산 전체 산정방식이 사라지고 「취득가액 산정 방식 — 토지·건물 독립 선택」 파트 블록 표시(`CompanionAcqPurchaseBlock.tsx:207-230` 게이트 `isSeparateAcquisition`, 직접 확인).

- 토글만 켜고 날짜가 같으면 상단 축과 파트 라디오가 **둘 다** 보인다(별개 취득 미성립).
- 매매가 아닌 원인으로 바꾸면 토글이 강제 OFF(`CompanionAcquisitionCauseSection.tsx:99`).

**조합 실측** (화면 testid + `/api/calc/transfer` 200, 감사 스크립트 `scratchpad/housing/phaseA·B.cjs`):

| 토지 / 건물 | 엔진 파트 취득가액 (토지 / 건물) | 개산공제 | 신고서 취득가액 |
|---|---|---|---|
| 실가 / 실가 | 200M / 150M | 0 | 350M |
| 실가 / 감정 | 200M / 150M | 건물 1.5M | 350M |
| 감정 / 실가 | 대칭 | 토지 3M | 350M |
| 실가 / 환산 | 200M / 112.5M | 건물 1.5M | 312.5M |
| 환산 / 실가 | 225M / 150M | 토지 3M | 375M |
| 환산 / 환산 | 225M / 112.5M | 4.5M | 337.5M |
| 매매사례 / 실가 | 210M / 150M | 토지 3M | 360M |

14지점 연결: ⑤ `LandBuildingSplitSection.tsx:251·414·485` · ⑧ `transfer-tax-validate-split.ts:82` · ④ `transfer-tax-api-split.ts:94-99·139·196-209` · ⑫ `transfer-tax-schema-base-shape.ts:260-267` · ⑭ `engine-input.ts:318-337` · 엔진 `transfer-tax-split-acq-price.ts:169-198`, `transfer-tax-split-gain.ts:207-213`. 장기보유특별공제도 파트별(토지 15년 30% / 건물 7년 14%).

**갭**:
- **H-1 🟠 상세명세서 취득가액 표시 오분류** — 「실가/감정」이 「취득가액 351,500,000 (실제 거래가액)·필요경비 0」으로, 「환산/환산」이 「342,000,000 (실제 거래가액)」으로 표시. 신고서 표(350M+1.5M / 337.5M+4.5M)와 불일치. 원인 `DetailedStatementFormulaBuilders.ts:539-541`이 분리취득을 모름. **세액은 정확.**
- **H-2 🟠 엔진 단계 산식 문구 ≠ 금액** — 「양도가(900,000,000) - 취득가(0) - 경비(0)」인데 금액 548,500,000(`transfer-tax-taxable-gain.ts:139-143`이 body의 `acquisitionPrice:0` 사용). 장기보유 문구 「× 0% | 보유 7년×2% = 0%」인데 금액 152,790,000(`transfer-tax-lthd-steps.ts:131`).
- **H-3 🟡 취득원인 혼합 불가** — 지원: 「건물 신축 + 토지 상속·증여」(`NewConstructionLandAcqBlock.tsx`). 표현 불가: 「토지 상속 + 건물 매매」·「토지 매매 + 건물 상속·증여」·「토지 증여 + 건물 매매」 — 상속·증여 블록엔 취득일 분리 토글 자체가 없다.
- **H-4 🟢 낡은 주석·설계서** — `transfer-tax-split-gain.ts:51-55` 「단기세율 혼합 미구현」(실제로는 `transfer-tax-split-rate.ts` G-1 구현됨), `transfer-separate-acq-date-per-part-completion.plan.md` §14 「다건 split 전면 차단」(실제로는 `multi-transfer-tax-validate.ts:176-177` 허용).

### 2.2 일반건물(assetKind=`general_building`) — 2방식 한정

**진입 경로**: ① 「일반건물(토지+건물 일괄)」 → ③ 취득정보 → 맨 위 「토지·건물 취득일 다름」 ON(`GeneralBuildingAcquisitionCards.tsx:258-264`) → 토지 카드·건물 카드 각각 「취득가액 산정 방식」(`GeneralBuildingAcquisitionCardsParts.tsx`) + 금액칸.

**조합 실측**:

| 조합 | 계산 경로 | 결과 |
|---|---|---|
| 실가 / 실가 | 실가 경로 `general-building-route-actual.ts:454-461`(직접 확인 — `hasBothPartPrices`면 파트값 그대로) | ✅ 토지 3억·건물 4억 |
| 실가 / 환산 · 환산 / 실가 · 환산 / 환산 | 환산 경로(`transfer-tax-api-gb.ts:412` 한 파트라도 환산이면) → `general-building-part-acq.ts:72-144` | ✅ 파트별 취득가액·개산공제 |
| **감정·매매사례가 섞인 조합** | — | ❌ **선택지 없음** |

**갭**:
- **G-1 🔴 감정가액·매매사례가액 선택 불가** — 파트 라디오 `PART_MODE_OPTIONS`(`GeneralBuildingAcquisitionCardsParts.tsx:56-59`, 직접 확인)와 자산 단위 라디오(`CompanionAcqPurchaseBlock.tsx:126-143`, 직접 확인) 모두 2종. 근거 주석은 §1에서 본 대로 「시행령」 §176의2③ 누락. 엔진도 건물 감정가액을 이미 전제한다(§114의2 가산세 판정 `transfer-tax-building-penalty.ts:28-29`가 `method === "appraisal"` 포함 — 감사 보고, V-6). ⑫ Zod는 4종 허용(`transfer-tax-schema-base-shape.ts:260-262`).
- **G-2 🔴 실가 경로가 파트 산정방식을 무시 (잠복)** — 두 파트가 모두 비환산이면 실가 경로로 가는데, 이 경로는 `landAcqMode`/`buildingAcqMode`를 읽지 않고 개산공제를 0으로 고정한다. 시드 실측: 「토지 감정+건물 실가」 결정세액 = 「둘 다 실가」(300,333,515). **G-1을 UI에서 열면 즉시 활성화된다**(memory `feedback_ui_gate_expansion_activates_latent_defect`) ⇒ **G-1보다 먼저** 고친다.
- **G-3 🟠 자산종류 전환 시 감정 플래그 잔존 → 막다른 길** — 「건물(토지 제외)」에서 감정가액 선택 → 「일반건물」 전환: 전환 patch(`AssetSectionBasic.tsx:155-163`)가 `isAppraisalAcquisition`·`landAcqMode`를 비우지 않음 → 라디오 무선택·금액칸 숨김, 실가/실가를 골라도 body에 `acquisitionMethod:'appraisal'` → 서버 Zod 거부(`transfer-tax-schema-refines.ts:257`). G-1로 일반건물에 감정이 생기면 성격이 바뀌므로(잔존이 아니라 유효값) G-1과 함께 재판정.
- **G-4 🟡 상세명세서 산식 소제목 오기** — 환산 포함 조합에서 「자산별 실제 거래가액 합계」·「자산별 양도비 합계 — §97① 나목」 표시(실제는 개산공제). `DetailedStatementFormulaBuilders.ts:446-448·573-575`가 aggregated에 없는 `usedEstimatedAcquisition`으로 분기(실측 undefined). H-1과 같은 파일.
- **G-5 🟢 상속·증여 파트에도 「환산취득가」 노출 → 고르면 차단**(`validate-gb.ts:140-155`). 4방식 확장 시 같은 축이 커지므로 G-1에서 원인별 선택지 필터로 함께 처리.

> 참고: assetKind=`building`(「건물(토지 제외)」, `AssetSectionBasic.tsx:54`)은 주택과 같은 4방식 split 경로를 쓴다 — 이 계획의 대상 아님.

### 2.3 겸용주택(`housing` + `isMixedUseHouse`) — 미구현

**화면 실측**(시드: 주택·겸용·매매, 토지 2005-06-10 / 건물 2010-03-15): 취득일 2칸(`acq-date-land`·`acq-date-building`)은 있으나 「취득가액 산정 방식」 라디오 **1벌**, 「취득가액」 `fixed-acquisition-price` **1칸**. body: `isSeparateAcquisition:false`, `mixedUse.acquisitionActualTotalPrice` 총액 하나.

**현행 모델**:
- 제외 게이트: `isSeparateAcquisition()`이 겸용이면 false(`transfer-tax-split-acq-mode.ts:259-260`, 직접 확인), 파트 블록도 `isSplit && !isMixedUse`로 숨김(`CompanionAcqPurchaseBlock.tsx:441-450`).
- 실가·감정: 총액 → 「취득시 주택가격 : (취득시 공시지가×상가부수토지 + 상가건물 기준시가)」로 주택분·상가분 → 각 분 안에서 취득시 토지·건물 기준시가 비율(`transfer-tax-mixed-use-helpers.ts:172-195`, `-housing.ts:273-289`, `-commercial.ts:182-232`).
- 환산: 주택분 = 주택 양도가액 × 취득시 개별주택가격 ÷ 양도시 개별주택가격, 상가분 = (토지+건물) 합산 비율(`-commercial.ts:217`) → 취득시 비율로 토지·건물 분할.
- 보유기간·장기보유공제: 4부분 모두 토지=토지 취득일, 건물=건물 취득일 — **이미 파트별**(`-housing.ts:331-338`, `-commercial.ts:277-284`, `-fourpart.ts:24-31`).
- 설계 근거: `transfer-separate-acq-date-per-part-completion.plan.md:123`·§14 「겸용주택 — 함께 취득이 정본」. **그 전제는 겸용 토글이 날짜 2칸을 강제로 켜는 실제 UI와 맞지 않는다.**

**갭**:
- **M-0 🔴 주택 건물분 취득시 기준시가 = 서로 다른 날짜의 값끼리 뺄셈 (현행 결함)** — 개별주택가격은 **건물 취득일** 기준 조회(`mixed-use/MixedUseAssetMajorStdPrice.tsx:115·244`), ㎡당 공시지가는 **토지 취득일** 기준 조회(`:118·410`), 엔진은 `acqBuildingStd = housingPrice − landPricePerSqm × 주택부수토지`(`transfer-tax-mixed-use-housing.ts:273-276`) — **세 위치 모두 직접 확인**. 단건 엔진은 같은 연산을 「서로 다른 취득시점 값의 뺄셈은 근거가 없다」며 금지(`transfer-tax-split-acq-price.ts:55-57`, 직접 확인). 오염 범위: 주택분 토지·건물 안분, 개산공제 base(`-housing.ts:297-300`), 실가 총액의 주택·상가 안분(`-helpers.ts:178-189`). **세액 영향 미실측**(V-1) — 건물 취득일 기준 공시지가를 넣는 입력 경로가 없다.
- **M-1 🔴 파트별 산정방식·취득가액 입력 경로 전무** — UI·④·⑫·엔진 입력 타입(`MixedUseAssetInput`) 모두 필드 없음.
- **M-2 🟢 안내문 인용 오기** — 날짜 안내문(`CompanionAcqDateSection.tsx:143`)이 「§166⑥」을 드는데 그 조항은 가액 구분 조항(감사 보고 — 본문 대조 V-9).

---

## 3. 범위 제안 — 4개 Phase

| Phase | 내용 | 갭 | 규모 | 의존 |
|---|---|---|---|---|
| **A** | **일반건물 감정가액·매매사례가액 개방** (자산 단위 + 파트 단위) | G-2 → G-1 → G-3·G-5 | 중 | 없음 |
| **B** | **겸용주택 별개 취득 파트별 산정방식·취득가액** | M-0 → M-1, M-2 | **대** (엔진 모델 신설) | V-2·Q-2 착수 조건 |
| **C** | **결과 표시 정합** (상세명세서·엔진 단계 문구) | H-1·H-2·G-4 | 소~중 | A·B와 독립. A·B 뒤에 하면 겸용·감정 조합까지 한 번에 |
| **D** | **취득원인 혼합**(토지 상속 + 건물 매매 등) | H-3 | 중~대 | 별건 권장(Q-3) |

**권장 순서**: **A → B(B0 선행) → C**. D는 이번 범위에서 제외하고 별건 계획으로(사용자 요청은 「산정방식」 축이고, 원인 혼합은 §104②·§163⑨ 축이 따로 붙는다).

PR 분할(각 PR ≤ 1 축, 기존 관례): `A1(G-2 엔진)` → `A2(G-1 UI·⑧·④ + G-3·G-5)` → `B0(M-0 결함)` → `B1(겸용 엔진 파트 모델)` → `B2(겸용 UI·14지점)` → `C(표시)`.

---

## 4. Phase A — 일반건물 감정가액·매매사례가액

### A1. 실가 경로가 파트 모드를 소비 (G-2) — **UI 개방 전 선행**

- `general-building-route-actual.ts`: 파트 모드가 `appraisal`/`salesCase`이면 그 파트 취득가액은 감정가액·매매사례가액, **개산공제 = 그 파트 취득시 기준시가 × 3%**(「소득세법 시행령」 §163⑥ — 조항호 본문 확인 V-5). 실가 파트는 0.
- 대안 검토: 「비환산 = 실가 경로」 분기 자체를 `part-acq.ts`(환산 경로, 감정·매매사례 개산공제 처리 `:105-106` 존재 — 감사 보고)로 통일. **어느 쪽이 덜 침습적인지 Design에서 실측으로 결정**(D-1).
- anchor: 「토지 감정+건물 실가」 결정세액 ≠ 「둘 다 실가」, 차이 = 토지 개산공제가 만드는 세액 차. 시드 실측값 300,333,515를 **변경 전 RED 기준**으로 고정(memory `feedback_pre_change_safety_net_probe`).

### A2. UI 개방 (G-1) + 잔존 플래그 (G-3) + 원인별 필터 (G-5)

| 지점 | 변경 |
|---|---|
| ⑤ | `PART_MODE_OPTIONS` 4종화 · 자산 단위 `acqBasisOptions` 일반건물 분기 4종화 · 파트별 감정가액·매매사례가액 입력칸(주택 `LandBuildingSplitSection`의 `split-*-appraisal-value`/`salesCase-value` 패턴 차용, testid는 `gb-` 접두로 분리) · 상속·증여 파트는 선택지 필터 |
| ⑧ | `validate-gb.ts` V-7(비환산 파트 금액 필수)에 감정·매매사례 분기, 감정평가기준일 ±3개월(「시행령」 §176의2③2호) 검증은 **주택 경로가 하는 만큼만**(새 규칙 발명 금지 — 주택 경로 현황 확인 D-2) |
| ④ | `transfer-tax-api-gb.ts:402-412` — 감정·매매사례 파트 값 전송, 경로 분기(실가/환산) 조건 갱신 |
| ⑨⑫ | Zod는 이미 4종 허용 — refine(`transfer-tax-schema-refines.ts:257` 자산 단위 `appraisalValue` 요구)이 **파트 모드와 충돌하지 않는지** 확인 |
| ⑭ | `general-building-route-helper.ts`·`-route-actual.ts` 매핑 |
| ⑥ | 사이드바 `separateAcqPartsSum`(`transfer-tax-split-acq-mode.ts`) — 이미 salesCase 분기 존재, 감정은 `price` 필드 공유 여부 확인 |
| ⑦ | 결과 카드·신고서 — 파트 「취득가액 산정 방식」 라벨에 감정·매매사례 |
| 기타 | `AssetSectionBasic.tsx:155-163` 전환 patch에 `isAppraisalAcquisition`·`isSalesCaseAcquisition`·`landAcqMode`·`buildingAcqMode` 정리 여부 — G-1 이후 「잔존」이 「유효값 승계」가 되는 경우를 구별(Q-5) |
| 연관 | 지분(`api-gb-shares.ts:124-130`)·증축(3파트 축, V-3 차단)·용도변경·이월과세·부담부증여(파트 라디오 숨김 `Parts.tsx:107`)와의 조합 매트릭스 — Design에서 전수 |
| 가산세 | §114의2(신축 5년 내 감정·환산 → 가산세) 판정이 파트 모드 감정을 받는지 확인(V-6) |

### A-통합. 설계 통합 결정 (2026-10-06, rev.2)

설계서: 엔진 `docs/02-design/features/gb-part-appraisal-salescase.engine.design.md` · UI `…ui.design.md`.
Pre-Do anchor: `__tests__/api/transfer.route.gb-part-appraisal-salescase.predo.anchor.test.ts` — **8 passed · 5 skipped** 재실행 확인. G-2 실측: 「토지 감정 + 건물 실가」 = 「둘 다 실가」 = 300,333,515(기대 299,208,965). skip 5건(X1~X5) 해제가 A1 완료 기준.

**두 설계서 충돌 해소** (근거를 확인해 오케스트레이터가 결정):

| # | 쟁점 | 결정 | 근거 |
|---|---|---|---|
| D-1 | 감정·매매사례 파트 계산 경로 | **(b) 하나라도 비-actual이면 환산 경로(`general-building-part-acq.ts`)**, 둘 다 actual만 실가 경로 | 실가 경로(`route-actual.ts`·`route-cards.ts`)엔 `ownershipRatio` 0회 — (a)는 지분 자산 개산공제 과다(직접 확인). `part-acq.ts:1-20`이 이미 「감정·매매사례 파트는 개산공제 대상」 규약 보유 |
| D-1′ | 술어 분리 | 라우팅은 신규 `anyNonActual`, **`transfer-tax-api-gb.ts:600` 최초공시 블록 게이트는 `anyEstimated` 유지** | `:585-600` 주석 — 그 블록은 환산 한정(직접 확인) |
| C-1 | 취득시 기준시가 노출 술어 | **UI안 채택** — leaf `partNeedsOwnAcqStd(mode)` = `mode !== "actual"`를 ④⑤⑧⑫가 공유, `requiresAcqStdPricePart` 1절이 이 leaf를 호출하도록 리팩터 | `requiresAcqStdPricePart` 전체를 쓰면 분리 OFF 실가 일괄에서 `needsApportionRatio`가 참 → 시점별 런처 숨김 회귀 위험. 일반건물 실가 안분은 `needsGbActualAcqStdPrice`가 정본 |
| Q-A2·Q-B | 분리 OFF의 유효 모드 | **전면 — 레거시 3플래그로 통일**, leaf `gbPartModes(asset)`(ON=`effectivePartAcqMode`, OFF=레거시 파생 양쪽 동일)를 ④⑤⑧이 공유 | 「한정」이면 ⑤⑧(explicit)↔④(레거시) 모순이 남는다 — UI 통과↔전송 모순 금지 |
| E-3 | 분리 ON에서 최상위 `acquisitionMethod`·`appraisalValue` | **④가 일반건물 분리 ON이면 최상위 모드 `"actual"` 고정** + UI `gbSeparateOnPatch`·복원 정규화 (3중 방어) | `transfer-tax-api.ts:392-399`가 레거시 플래그만 봄 → ⑩ refine 400(G-3 실체). 엔진안 「변경 없음」은 UI 방어만으로 미지 복원 경로를 못 막음 |
| E-1 | 카드 `acquisitionMode` echo | **A1 포함** | 없으면 감정 파트에 「실지거래가액 파트라 개산공제 미적용」 거짓 문구(`DetailedStatementGbFormulas.ts:463-470`) |
| E-4 | §114의2 날짜 게이트 | **leaf export**(`buildingPenaltyMethodApplies`) — 배지·엔진 공유 | UI 배지가 날짜를 하드코딩 복제 중 |
| Q-A5 | §114의2 감정 가산세 | **A1 포함** (`penaltyAxis` 신설안) | 「소득세법」 §114의2는 강행규정 — UI만 열면 가산세 누락(과소). 엔진 F-3 |
| Q-A / C-2 | 이월과세 파트 | **현행 유지** — 선택지 {실거래가, 환산취득가} 그대로, 감정·매매사례만 비노출 + ⑧ R8은 stale 방어로 유지 | 라디오 숨김은 현행 환산 경로를 지우는 동작 변경. 요청 범위 밖(Surgical) |
| Q-C | 일반건물 매매사례 RTMS 자동조회 | 열지 않음(단순 금액칸) | RTMS는 집합건물 기준 — 신규 기능 |
| Q-D | 신축 자가건축 파트의 매매사례 | 주택 신축 경로와 대칭(필터 없음) | 새 ⑧ 규칙 발명 금지 |
| Q-E | `transfer-tax-api-gb.ts` 공동 수정 | Do는 시퀀셜 — A1(엔진)이 ④ 정본을 고치고 A2(UI)는 그 위에 | 루트 CLAUDE.md 「Do는 시퀀셜」 |
| Q-F | 취득가액 산식 거짓 등식 가드 | A는 감정·매매사례만, **실가 파트(혼합 환산) 가드는 Phase C** | 범위 분리 |
| Q-G | 2-way 결과 산정방식 라벨 신설 | 범위 밖 | 요청 밖 기능 |
| Q-H | 분리 OFF 전환 시 파트 값 소거 | **소거할 값이 있으면 Dialog 확인**, 없으면 즉시 | memory `feedback_dialog_data_discard_confirm`(토글 OFF 데이터 손실 → Dialog 선례) |

**✅ Q-A3 (2026-10-06 사용자 확정 — 차단)**: 증축 있는 일반건물(분리 OFF)에서 자산 단위 감정·매매사례 **차단**(엔진 F-6: 3파트 안분이 파트 값 없이 원건물을 일괄 실가로 계산 → G-2 재현). 코드 가드: A1 서버 측(⑫/Route 400, 메시지 명시) + A2 ⑧ R9.

**PR 구성 (확정)**:
- **A1 (엔진·④)**: D-1 라우팅 `anyNonActual` + 부담부증여 실가 경로 가드 · F-1(⑫ `*SalesCaseValue`·타입·⑭) · F-2(자산 단위 감정/매매사례 → `bundledAcquisitionPrice`) · F-4(비-actual 파트 취득시 기준시가 요구, leaf `partNeedsOwnAcqStd`) · F-7(`applyShareScale`에 `*SalesCaseValue`) · E-1 echo · E-3 · E-4 · Q-A5 가산세 · `gbPartModes` leaf · anchor X1~X5 skip 해제. **UI는 아직 2종 — 사용자 노출 변화 없음.**
- **A2 (UI·⑧)**: ⑤ 4종화·금액칸·안내 · ⑧ R1~R11 · `gbSeparateOnPatch`/분리 OFF 소거 Dialog · ⑥ · ⑦(E-1 소비) · E2E `e2e/general-building-part-appraisal.spec.ts` + `transfer-expropriation-general-building.spec.ts:32·58` exact 교체 · `gb-separate-validate.anchor.test.ts:185-195` 갱신 · `validate-gb` 신규 규칙은 `validate-gb-required.ts`로(800줄).

---

## 5. Phase B — 겸용주택 별개 취득

### B0. 기준시가 시점 혼합 결함 (M-0) — 별도 PR, B1보다 먼저

- **함께 취득(날짜 같음)에서는 결함 없음** — 두 조회일이 같다. 별개 취득에서만 발생.
- 수정안: 별개 취득이면 주택 건물분 취득시 기준시가 = **건물 취득일 기준** 개별주택가격 − **건물 취득일 기준** ㎡당 공시지가 × 주택부수토지. ⇒ **「건물 취득일 기준 ㎡당 공시지가」 신규 입력**(`LandPriceLookupField`, referenceDate=건물 취득일). 토지 취득일 기준 공시지가는 토지 파트(환산 분자·개산공제)용으로 그대로 유지.
- 상가분도 같은 검사: 상가부수토지 기준시가(공시지가 × 면적)와 상가건물 기준시가가 각각 어느 날짜로 조회되는지 확인(V-10).
- anchor: 두 날짜 공시지가가 다른 픽스처에서 `acqBuildingStd`가 건물 취득일 공시지가로 계산됨 + 세액 변화 실측(V-1).

#### B0-통합. 설계 통합 결정 (2026-10-06)

설계서: 엔진 `docs/02-design/features/mixed-use-acq-std-date-mismatch.engine.design.md` · UI `…ui.design.md`. Pre-Do anchor `__tests__/api/transfer.route.mixed-use-acq-std-date-mismatch.predo.anchor.test.ts` — 6 passed · 4 skipped 재실행 확인.

- **V-1 실측**(가상 fixture 토지 2005-06-10·L1=1.2M / 건물 2010-03-15·L2=1.8M): 주택 건물분 취득시 기준시가 현행 280,000,000 → 수정 후 220,000,000. 결정세액 변화(수정 후 값은 현행 3모드와 1원 일치를 확인한 재구현 산출 — 패치 실측은 Do에서): 환산 +780,360 / 실가 −1,725,151 / 감정·매매사례 −3,863,551 — 부호 혼재(파트별 장기보유공제율·개산공제·주택 건물 차손 0 처리 중첩). **함께 취득(날짜 같음)은 불변**(C-5·C-6 회귀선).
- **V-10**: 상가부수토지 공시지가=토지 취득일, 상가건물 기준시가=건물 취득일 — 각 항이 자기 파트 날짜인 **합산**이라 뺄셈 결함 없음.
- 법령: 「개별주택가격 − 공시지가×면적」 역산의 **명문 근거는 없다**(엔진 §8 — 「소득세법」 §99①1호 가·라목, 「소득세법 시행령」 §163⑥·§164③⑦·§166⑥ 본문 확인). 근거는 결합 공시의 항등성(토지분+건물분 = 라목 가액)이고 **같은 날짜일 때만 성립** — B0는 그 전제를 복원한다.

| # | 쟁점 | 결정 | 근거 |
|---|---|---|---|
| 범위 | B0에서 고칠 곳 | **뺄셈 1곳**(`transfer-tax-mixed-use-housing.ts:275-276`)만. 토지분(`:273-274`)은 토지일 값 유지 | 뺄셈 소비처 전수표 E1~E15·F1~F10에서 1곳뿐 |
| Q-3 | 주택:상가 안분 비율(`helpers.ts:179`)·상가분 환산 합산·PHD §164⑦ 3시점 합산(`transfer-tax-pre-housing-disclosure.ts:198-216`)·용도변경(상가→주택) | **B1 이관** | 뺄셈이 아닌 합산·비율이고, 별개 취득에서 「취득 당시」가 어느 날짜인지 법령상 정해지지 않는다(「부가가치세법 시행령」 §64①1호 단일 시점 전제, 「소득세법」 §100② 「함께 취득」 전제). ⚠️ 안분 비율만 건물일로 통일해도 결정세액 약 −2.6M — B1에서 반드시 다룬다 |
| 필드 | 신규 입력 | 폼 `mixedAcqLandPricePerSqmAtBuildingAcq` ↔ 엔진 `acquisitionStandardPrice.landPricePerSqmAtBuildingAcq?: number`(⑫ 취득측 extend에만 — 양도측 공유 스키마 불변) | 비엄격 z.object 침묵 strip 방지 |
| 술어 | 필수·노출 | 겸용 ∧ ④가 보내는 두 취득일 다름 ∧ PHD OFF ∧ 용도변경 `commercial_to_house` 아님 ∧ 취득시 개별주택가격 > 0. **엔진 leaf 1곳**, UI `lib/calc/` 쪽은 얇은 어댑터. ⑤·④·⑧·⑫·엔진 공유 | dual-truth 금지 |
| Q-1 | 필수 판정 축 | **날짜가 다르면 항상 필수**(기준연도가 같아도 면제 안 함) | 면제는 토지일 값 대체 = 자동 fallback 금지 정책과 충돌 |
| Q-2 | 토지분 날짜 | **토지 취득일 값 유지**(M안) | 토지 파트의 기준시가는 그 파트 취득 시점 — 파트별 보유기간·개산공제 규약과 정합 |
| 미입력 | 처리 | 엔진 throw / ⑫ 400 / ⑧ 오류. 필수가 아닐 때 온 값은 무시 | 자동 대체 금지 |
| UI Q-1 | 칸 배치 | **주택 취득 블록의 개별주택공시가격 바로 아래**(새 컴포넌트, AssetMajor·Legacy 두 레이아웃 공통), 기존 토지일 칸엔 「토지 취득일 기준」 캡션 | 계산 순서(결합가 − 같은 날 토지분) = 표시 순서 |
| Q-4 | 분리 OFF·상속 시 `landAcquisitionDate` 잔존 | **B0 범위 밖**(기존 별건) — 술어는 ④가 실제로 보내는 날짜 기준 | 막다른 길 아님 |
| Q-5·Q-6 | 산출근거 echo·결과 행 | **추가 안 함** | 결과·신고서·사이드바는 엔진 echo를 읽어 자동 추종 — 요청 범위 밖 |

**깨질 기존 fixture**(L2=L1로 채우면 값 불변): `expropriation-mixed-use.anchor.test.ts` · `mixed-use-inherited-cohabitation-table2.anchor.test.ts` · `mixed-use-housing-estimated-numerator.anchor.test.tsx` · `mixed-use-part-cards.equivalence.anchor.test.ts`(확인 필요) · E2E `mixed-use-filing-form-4col.spec.ts:145-151`.

**별건 기록(B0 밖)**: 주택 건물 차손 0 처리 vs 상가 통산 비대칭(의도 여부 확인 필요) · 상속·증여의 토지 취득일 칸 노출에 대한 `CompanionAcqDateSection.tsx:152-165` ↔ ⑧ 주석(`validate-mixed-use-asset.ts:25-30`) 모순.

### B1. 엔진 — 파트별 산정방식 모델

**입력 신설**(`MixedUseAssetInput`): `isSeparateAcquisition`, `landAcqMode`, `buildingAcqMode`, `landAcquisitionPrice`, `buildingAcquisitionPrice`(감정·매매사례값 포함 규약은 주택 split과 동일하게 맞출지 D-3).

**4부분 결합 방식(제안 — Q-2·V-2 확정 전 착수 금지)**:

| 단계 | 제안 | 근거 |
|---|---|---|
| 토지 파트 가액 → 주택부수토지 / 상가부수토지 | 토지 취득일 기준 공시지가 × 각 부수토지 면적 비율 (같은 필지라 사실상 **면적 비율**) | 「소득세법」 §100② 후문 「공통되는 취득가액 … 해당 자산의 가액에 비례」 |
| 건물 파트 가액 → 주택건물 / 상가건물 | 건물 취득일 기준 「주택건물 기준시가 : 상가건물 기준시가」 (주택건물 기준시가는 B0 역산값) | 같은 후문 |
| 환산 파트 | 토지 = 토지 양도가액 × 토지 취득일 공시지가 ÷ 양도시 공시지가 / 건물 = 건물 양도가액 × 건물 취득일 건물분 ÷ 양도시 건물분 | 「시행령」 §176의2②2호 |
| 개산공제 | 토지 취득일에 주택이 없었다면 토지 §163⑥1호, 건물 §163⑥2호를 따로 (`transfer-tax-split-acq-price.ts:46-50` 주석과 같은 논리) | 조항호 본문 V-5 |
| 양도가액 | 현행 유지(양도시 기준시가 4부분 안분) | 변경 없음 |
| 보유기간·장기보유공제 | 현행 유지(이미 파트별) | 변경 없음 |

**결합 제외(Phase B 범위 밖, throw 대신 ⑧ 차단 + 안내)**: ~~PHD(§164⑦ 미공시)~~(아래 S-4로 **포함** 전환) · 보유 중 용도변경 · 공익수용 · 상속·증여 — 현행 실가 경로도 throw(`-helpers.ts:256-265`). 계획서 「제외」엔 **코드 가드 필수**(memory `feedback_plan_exclusion_decision_needs_a_code_gate`).

#### B1-V2. 해석례 조사(V-2) 결과와 사용자 결정 (2026-10-06)

조사 문서: `docs/02-design/features/mixed-use-separate-acq-authority-research.md` (국세청 해석 35·심판례 16·판례 7 본문 판정). ⚠️ 국세법령정보시스템 장애(502)로 국세청 해석 원문은 미러(casenote.kr)로 열람 — 오케스트레이터가 원문을 직접 확인한 것은 **조심2008서1720**(KoreanLaw 본문) 1건.

| 질문 | 조사 결론 | 신뢰도 |
|---|---|---|
| Q1 별개 취득 겸용의 토지·건물 실가를 주택·상가로 나누는 기준 | **정면 해석례 없음**. 토지·건물 사이엔 안분 규정 미적용(서울행정법원 2021구단6105 — 「구분이 분명하므로 … 안분계산규정이 적용되지 않」음) | 낮음~중 |
| Q2 환산 | 토지·건물 **자산별로, 각자 자기 취득일 기준시가**로 환산(재산세과-1702, 법규재산2012-255, 조심2024구0226). 환산 단위(주택 1회 vs 파트별)는 양도가액을 같은 기준시가로 나누는 한 결과 동일 — 바뀌는 것은 날짜 | 중~높음 |
| Q3 §164⑦(공시 전 취득) | **정면 근거** — 분자에 「토지 취득 당시 개별공시지가 + 건물 취득 당시 건물 기준시가(나목)」를 바로 대입(대법원 97누15746, **조심2008서1720 — 직접 확인**), 그 결과를 취득당시 토지분·건물분 기준시가로 **비례 안분**(같은 재결의 처분청 산식 유지) | 높음 |
| Q4 산정방식 혼합 | **가능**(서면4팀-566, 대전고법 2009누377 — 별개 취득 겸용에서 토지 실가·건물 환산 경정 유지, 조심2023광10375). 「토지 실가 + 건물 감정」 조합 문헌은 없음 | 높음 |
| Q5 일반 주택·건물 | 같은 원리 — Q2~Q4 근거 다수가 일반 주택·건물 사안 | — |

**사용자 결정** (2026-10-06):

| # | 쟁점 | 결정 |
|---|---|---|
| **S-3** | 개별주택가격을 토지·건물로 나누는 방식 — 국세청·심판원은 「토지 공시지가(가목) : 건물 기준시가(나목)」 **비례 안분**, 현행 엔진(주택 결합 공시 역산 `calcDerivedBuildingStdAtAcq`, 겸용 `transfer-tax-mixed-use-housing.ts` — B0 포함)은 「개별주택가격 − 공시지가×면적」 **뺄셈**. 뺄셈을 지지하는 해석례 없음 | ✅ **B1 전에 별건으로 조사·수정** — 주택·겸용 전 경로 영향 실측 후 별도 계획서 |
| **S-4** | PHD(§164⑦) 결합 | ✅ **B1에 포함** — 신축 겸용 대부분이 이 경로, Q3 정면 근거 |
| **S-1** | 토지 취득가액 → 주택부수토지/상가부수토지 | ✅ **토지 기준시가 비율**(같은 필지라 값은 면적 비율과 같다 — 근거 표기는 「소득세법」 §100② 후문 유추) |
| **S-2** | 건물 취득가액(신축비 등) → 주택건물/상가건물 | ✅ **용도별 계약액(도급계약서·세금계산서) 우선, 없으면 건물 취득일 건물 기준시가(나목) 비율** |
| S-5 | 개산공제 방식 | 🟡 S-3 결론에 따라 확정(파트별 기준시가 base가 뺄셈값인지 비례값인지 연동) |

⇒ **순서 변경**: B1 착수 전 **S-3 별건**을 먼저 한다(B1의 건물 분할·개산공제 base가 S-3 결론에 의존).

### B1-통합. 설계 통합 결정 (2026-10-07 — 사용자 「권장안대로」)

엔진(`docs/02-design/features/mixed-use-separate-acq-per-part.engine.design.md`)·UI(`….ui.design.md`) 설계가 같은 결론. 충돌 없음.

| # | 결정 | 확정안 |
|---|---|---|
| 1 | 용도별 계약액(S-2) | 건물 총액 + 주택건물 계약액 1칸, 상가건물 = 총액 − 주택건물(읽기 전용 도출). 건물 실거래가일 때만 |
| 2 | 구 이력 ↔ 신규 | opt-in 중첩 필드 `mixedUse.separateAcquisition`(부재 = 총액 모델). 신규 자산 initial ON, 부재 기록은 OFF + 안내 |
| 3 | 개산공제(S-5) | 비-실가 파트만 취득시 기준시가 × 3%(미등기 3/1000), 성분별 독립 floor. 주택 base = S3-2 γ1 비례값 |
| 4 | §97②2호 단서 | 환산 파트 묶음 판정(양쪽 환산 = 현행 자산 단위). 직접 해석례 없음 — 일반건물 선례 준용 |
| 5 | 같은 날 / 총액 모델 존치 | 같은 날은 총액 모델. 날짜 달라도 토글 OFF 총액 모델 허용 + 안내 |
| 6 | 게이트(D-4) | `isSeparateAcquisition()` 겸용 제외 유지, 전용 술어 `isMixedUsePerPartAcq` 신설 |
| 7 | 화면(D-5) | `LandBuildingSplitSection` 재사용 안 함. 전용 `MixedUseSeparateAcqBlock` + `PartAcqInputs`·`ACQ_MODE_OPTIONS` 추출 |
| 8 | PHD | 환산 파트가 있을 때만 노출·의미. 파트 모델 PHD patch는 레거시 `useEstimatedAcquisition`을 쓰지 않는다 |
| 9 | 결합 제외 7종 | 용도변경·공익수용·상속·증여·총액 플래그 동시·같은 날·값 누락/계약액 ≥ 총액·PHD인데 환산 파트 없음 — 엔진 throw·⑫·⑧ 3중 |
| 10 | 신고서 4열 | 행 추가 없음, 취득가액 행 열별 notes |

**Do에서 함께 처리**: U-2(파트 모델에서 ④가 겸용 실비 필드를 읽지 않아 침묵 소실) · 필수 술어(`isBuildingDayLandPriceRequired` 등)에 산정방식 키 AND(양쪽 실가에서 쓰이지 않는 값 거짓 요구) · `mixedPartAcqNeeds` 단일 술어(⑤ 노출·⑧ 필수·⑫).

**선행 정정**: 환산 분자 H → P(PR #2027 — S3-2 γ1 분할 합과 분자 일치). B1 회귀선 「양쪽 환산 = 현행」은 이 정정 **이후** 값으로 잡는다.

### B2. UI·14지점

| 지점 | 변경 |
|---|---|
| 게이트 | `isSeparateAcquisition()`의 겸용 제외(`:259-260`) 해제 — **이 헬퍼는 주택·사이드바·validate·lump-sum 게이트(`transfer-lump-sum-base-gate.ts:50`) 등 8곳이 공유**하므로 해제 시 겸용이 그 경로들에 새로 들어온다. 해제 대신 겸용 전용 술어를 둘지 D-4 (memory `feedback_ui_gate_expansion_activates_latent_defect`) |
| ⑤ | 겸용 별개 취득이면 상단 산정방식·총액 숨김 + 토지/건물 파트 블록(주택 `LandBuildingSplitSection` 재사용 가능 여부 D-5) + 건물 취득일 기준 공시지가(B0) |
| ①②③ | 기존 `landAcqMode` 등 AssetForm 필드 재사용 — 신규 폼 필드는 B0의 공시지가 1개(+ stale sessionStorage 가드, memory `feedback_new_asset_field_stale_sessionstorage_guard`) |
| ④ | `transfer-tax-api-mixed-use.ts:60-74·332-339` — 파트 필드 전송 |
| ⑧ | `transfer-tax-validate-mixed-use-asset.ts` — 파트 금액 필수·제외 조합 차단 |
| ⑨⑫⑬⑭ | `transfer-tax-schema-mixed-use.ts` · `mixed-use-asset-input.ts` · `mixed-use-part-cards.ts` |
| ⑥ | 사이드바 겸용 미리보기(`mixed-use-sidebar-acq-preview` 선례) |
| ⑦ | 신고서 4열(이미 열별 취득일 표시 — `mixed-use-filing-form-per-part-acquisition-date.plan.md` 해소분)에 파트 산정방식·취득가액 |

---

## 6. Phase C — 결과 표시 정합

- **H-1·G-4**: `DetailedStatementFormulaBuilders.ts` — 별개 취득이면 취득가액을 「토지 ○○(산정방식) + 건물 ○○(산정방식)」로, 개산공제를 필요경비 쪽에 분리. 분기 플래그는 응답에 실재하는 값으로(G-4의 `usedEstimatedAcquisition` undefined 재발 방지 — 응답 JSON 실측 후 선택).
- **H-2**: `transfer-tax-taxable-gain.ts:139-143`·`transfer-tax-lthd-steps.ts:131` — 분리 계산이면 단계 문구를 파트 합 기준으로. 엔진 산식 변경 없이 문구만(echo 패턴).
- 양도세 결과뷰는 4개다(memory `feedback_transfer_result_view_is_not_one`) — 4곳 전수 확인.

---

## 7. 검증 항목 (V-n) — 미검증, 「확인 필요」

| # | 내용 | 착수 조건? |
|---|---|---|
| V-1 | M-0 세액 영향 실측 (엔진 직접 anchor, 두 날짜 공시지가 상이 픽스처) | B0 |
| V-2 | 겸용 별개 취득 4부분 안분 방식 — 국세청 집행기준·해석례·심판례 조회 (DRF 본문검색) | **B1 착수 조건** |
| V-3 | G-2 재현을 vitest anchor로 고정(감사는 화면 시드 실측) | A1 |
| V-4 | G-3 막다른 길에서 금액 미입력 시 V-7이 숨은 칸을 요구하는지(감사는 코드 추론) | A2 |
| V-5 | 「소득세법 시행령」 §163⑥ 1호·2호 조항호 본문 — 감정·매매사례 파트, 별개 취득 주택의 개산공제 base | A1·B1 |
| V-6 | §114의2 가산세 판정(`transfer-tax-building-penalty.ts:28-29`)이 일반건물 파트 감정 모드를 받는지 | A2 |
| V-7 | 겸용 PHD(§164⑦) + 별개 취득 결합 — 제외 처리의 법령상 타당성 | B2 |
| V-8 | 「소득세법」 §100③ 30% 판정이 별개 취득 파트별 가액에 적용되지 않는다는 독법 | B1 |
| V-9 | M-2 안내문 인용 — 「소득세법 시행령」 §166⑥ 본문 대조 | B2 |
| V-10 | 겸용 상가부수토지·상가건물 기준시가의 조회 기준일 | B0 |
| V-11 | 감사가 인용한 file:line 중 「직접 확인」 표시가 없는 것 — Design 진입 시 재확인 (memory `feedback_merged_plan_citations_drift`) | 각 Phase |

---

## 8. 사용자 결정 (Q-n)

| # | 질문 | 결정 |
|---|---|---|
| Q-1 | 범위·순서 | ✅ **A → B → C** (2026-10-06 사용자 확정 — 권장안) |
| Q-2 | 겸용 토지·건물 파트 가액을 4부분으로 나누는 기준 (§5 B1 표) | 🟡 미결 — V-2 조회 결과를 보고 확정 |
| Q-3 | 취득원인 혼합(H-3: 토지 상속 + 건물 매매 등)을 이번에 포함? | ✅ **별도 후속 작업** (2026-10-06 사용자 확정 — 「후속 작업으로 할 테니 기억해」) |
| Q-4 | B0(M-0)을 B와 묶을지, 독립 버그픽스로 먼저 낼지 | ✅ **독립 선행 PR** (2026-10-06 사용자 확정 — 권장안) |
| Q-5 | 자산종류 전환 시 산정방식 플래그: 승계 vs 초기화 | 🟡 Design에서 대상 자산 지원 여부로 결정 |

---

## 9. 검증 계획

- **Pre-Do anchor**(memory `feedback_pre_anchor_verification`): A1 = G-2 RED 기준값, B0 = M-0 RED 기준값을 먼저 작성·실행 → 설계 환류.
- **조합 매트릭스 anchor**: 일반건물 4×4(소유 파트·원인 필터 반영), 겸용 최소 6조합(실/실·실/감·감/실·실/환·환/실·환/환). 지정값은 범위가 아니라 ±1 동등성(memory `feedback_range_assertion_misses_spec_violation`).
- **mutation probe**: 파트 모드 분기·개산공제 base·B0 공시지가 시점 교체 — 각 1건 이상 KILLED.
- **E2E**: 일반건물 「토지 실가 + 건물 감정」, 겸용 「토지 실가 + 건물 감정」 각 1 spec, request body에 파트 모드·가액 단언. 워크트리 `E2E_PORT` 필수.
- **회귀**: `npm run test:transfer` + 전체(공유 헬퍼 `isSeparateAcquisition` 변경 시 전체 필수). 워크트리는 husky가 안 돌므로 push 전 `FULL_TEST=1 bash .husky/pre-push` 수동.
- **브라우저 수동 확인**: 폼 → 계산 → 결과, Network body.

## 10. 리스크

- `isSeparateAcquisition` 게이트 확장이 겸용을 주택 split 경로 8곳에 끌어들임(D-4).
- 겸용 엔진 파일군(`transfer-tax-mixed-use-*.ts`) 800줄 정책 — 수정 대상 파일 줄 수를 Design에서 측정, ≥750이면 기회주의적 분리.
- 저장 이력(IndexedDB) 재계산 호환 — 신규 필드 부재 record는 현행(함께 취득 모델)으로 해석되어야 함(memory `feedback_flipping_enum_default_rewrites_absent_records`).

## 11. 다음 단계

1. ~~사용자: Q-1·Q-3·Q-4 결정.~~ ✅ 2026-10-06
2. 루트 CLAUDE.md 「새 기능 추가 워크플로」대로 엔진+UI 시니어 병렬 Design(Phase A) → A1 Pre-Do anchor(G-2 RED 기준값).
3. B0(M-0) 독립 PR — V-1·V-10 실측 후.
4. V-2(겸용 4부분 안분 해석례) 조회 → Q-2 확정 → B1.
5. **후속 별건**: Phase D 취득원인 혼합(H-3) — 사용자 지시로 이 계획 종료 후 별도 계획서로.

---

### 부록 — 감사 원자료

`/private/tmp/claude-501/-Users-mynote-workspace-Property-related-Taxes/4469ebcb-4585-444f-b128-92140436196b/scratchpad/{housing,gb,mixed}/` — 스크린샷·request/response JSON·Playwright 스크립트 (세션 scratchpad라 영속되지 않음 — 필요한 수치는 본문에 옮겨 두었다).
