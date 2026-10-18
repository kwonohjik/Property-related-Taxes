# 주택 부수토지 영 §163⑨ 단서 2호 — 구현 계획서 (D1-H)

> 작성 2026-10-19 · 상태 **Do 진행 — Q-1~Q-5 권고안 확정(2026-10-19 사용자 「권고대로」)** · 워크트리 `../Property-related-Taxes-hl2` · 브랜치 `plan/house-land-163-9-2`
> 상위 계획: `docs/00-pm/transfer-acq-cause-mixed.plan.md`(D1 토지 상속·증여 + 건물 매매 · D1-4 단서 1호 · D2-4 건물 몫)
> 계기: 자료 대기 8건 검색(2026-10-19) 2번 항목에서 찾은 국세청 해석 부동산거래관리과-364

## 1. 한 줄 요약

「소득세법 시행령」 제163조 제9항 단서 제2호(건물 기준시가 고시 전 상속·증여 → 평가액과 같은 영 제164조 제5항~제7항 가액 중 많은 금액)를
국세청은 **따로 증여받은 주택 부수토지**에도 적용한다. 엔진은 토지 파트에 단서 제1호(1990.8.30. 전)만 비교하므로,
**토지 상속·증여 + 건물 매매(D1)** 에서 토지를 1990.8.30.~개별주택가격 최초공시 전에 받은 주택은 평가액(①)만으로 계산하고 비교·고지가 없다.

## 2. 근거 (본문 확인)

| 자료 | 내용 | 확인 방법 |
|---|---|---|
| 「소득세법 시행령」 §163⑨ 단서 2호 (현행 MST 290841) | 「상속세 및 증여세법」 제61조제1항제2호 내지 제4호의 규정에 의한 **건물의 기준시가가 고시되기 전에** 상속 또는 증여받은 **건물**의 경우 → 평가액과 제164조제5항 내지 제7항의 가액 중 많은 금액 | KoreanLaw `get_law_text` |
| **부동산거래관리과-364 (2010.3.10.)** | 사실관계: 갑이 주택·부수토지 보유 → **부수토지만 을(직계비속)에게 증여(2005.5.12.)** → 수용(을 2009.12.31. 소유권 이전). 개별주택가격 **최초 공시 2006.4.28.** 회신 ②: 「상증법 §61①2호~4호의 규정에 의한 건물의 기준시가가 고시되기 전에 증여받은 **주택부수토지**의 취득가액은 증여일 현재 평가액과 영 §164⑦의 규정에 의한 가액 중 많은 금액」 | taxlaw.nts.go.kr Playwright 본문 |
| 서면4팀-73 (2006.1.18.) | 상증법 §61①**4호**(주택) 건물 기준시가 고시 전 상속 단독주택 → max(평가액, §164⑦). 「건물의 기준시가」를 주택은 개별주택가격으로 읽는다 | 같음 |
| 재산세과-371 (2009.10.5.) | 개별주택가격 공시 전 취득 주택으로 **토지·건물 취득시기가 다르면** 자산별 취득당시 기준시가는 §164⑦ 가액을 자산별 취득당시 §99①1호 가목·나목 가액으로 **안분** | 같음 |

⇒ 토지 몫 ② = §164⑦ 가액 × 토지 취득당시 기준시가 ÷ (토지 + 건물 취득당시 기준시가)
   = 최초공시 주택가격 P_F × 토지 취득당시 기준시가 L_E ÷ (최초공시 토지 기준시가 L_F + 최초공시 건물 기준시가 B_F).
   건물 취득당시 기준시가는 분자·분모에서 약분된다(D2-4 건물 몫에서 토지가 약분되는 것과 같은 구조 — `transfer-building-sec164-bridge.ts:9-10`).
   ⚠️ 이 약분 산식을 정면으로 쓴 해석례는 없다 — 재산세과-371의 안분을 토지 쪽에 적용한 것이다(**확인 필요**, 결과 고지로 표시 — D2-4와 같은 처리).

## 3. 현행 실측 (throwaway probe — 세션 scratchpad `_probe_house_land_163_9_2.test.ts`, 단건 ④ → route ⑫⑭ → 엔진)

공통: 양도 2026-06-30 · 양도가 12억 · 면적 200㎡ · P_F 3억 · 최초공시 ㎡당 1,000,000(L_F 2억) · B_F 6천만 · 수증일 ㎡당 500,000(L_E 1억).

| # | 입력 | ⑧ | route | 결과 | 판정 |
|---|---|---|---|---|---|
| A | 주택 **전체** 증여 1995-05-01 · ① 1억 | 통과 | 200 | 취득가액 **173,076,923** (= 3억 × 1.5억 ÷ 2.6억, `§163⑨ 2호 · §164⑦` 단계) · 양도차익 1,026,923,077 | ✅ 대조군 — 자산 단위 경로는 비교한다 |
| A2 | 같은 주택 **전체** 상속 | 통과 | 200 | 173,076,923 | ✅ |
| **B** | **D1**: 건물 매매 2018-03-02(3.5억) + **토지 증여 1995-05-01**(① 1억) | 통과 | 200 | 양도차익 **750,000,000** = 12억 − 토지 ① 1억 − 건물 3.5억. 비교 단계·고지 **없음** | 🔴 결함 — ② 토지 몫 115,384,615가 비교되지 않는다 |
| B2 | D1 **신축 호스트**: 건물 신축 2020-06-01(4억) + 토지 증여 1995-05-01(① 1억) | 통과 | 200 | 토지 취득가액 100,000,000 · 양도차익 700,000,000 · 비교·고지 없음 | Q-2 대상 |
| C1·C2 | **소유자 분리** `land_only` + 토지 증여 1995 (해석례 사실관계와 같은 형태) | 통과 | 200 | 자산 단위 max(① 1억, ② 173,076,923) = 173,076,923 → 취득시 기준시가 비율(2:1) 안분 → 토지 **115,384,615** | ✅ 정합 — 안분 비율이 같으므로 `r·max(①,②) = max(r·①, r·②)` |

- C는 소유자 분리 모델이 ①을 **물건 전체 평가액**으로 받아 안분하는 설계라 정합한다(`NonPurchaseSplitInputsBlock.tsx` 안내 「취득가액·양도가액은 아래 기준시가 비율로 토지·건물에 안분합니다」). 토지만 증여받은 사람이 **토지분 신고가액만** 알고 있는 경우의 입력 의미는 별건(§8 U-3).
- 엔진 토지 파트 비교는 단서 1호만이다: `resolveLandPartAcquisition`(`transfer-tax-split-acq-price.ts:318-335`)의 조건이 `isSec163_9LandProviso`(`transfer-split-part-cause.ts:132-134`, 토지 취득일 < 1990-08-30)뿐이다.

## 4. 범위

**결함 경로는 D1 하나다** — 토지 overlay 상속·증여 ∧ 건물(자산 단위) 매매 ∧ 주택 ∧ 토지 취득일이 1990.8.30. 이후이고 개별주택가격 최초공시 전.

| 경로 | 현행 | 이번 |
|---|---|---|
| 주택 전체 상속·증여 (자산 단위 `inheritedAcquisition` + `inheritedHouseValuation`) | 비교함 (A) | 변경 없음 |
| 소유자 분리 `land_only` | 정합 (C) | 변경 없음 |
| D2-4 건물 상속·증여 + 토지 매매 | 건물 몫 비교함 | 변경 없음 |
| D1-4 토지 상속·증여 1990.8.30. **전** | 단서 1호 §164④ 비교 | 변경 없음 (Q-4) |
| **D1 토지 상속·증여 1990.8.30.~최초공시 전 + 건물 매매** | ① 단독 | **② 토지 몫 비교 추가** |
| D1 신축 호스트(토지 상속·증여 + 건물 신축) | ① 단독 (B2 실측) | Q-2 |

## 5. 설계 (권고안 기준)

### 5.1 엔진 (Layer 2)
- **leaf** `transfer-split-part-cause.ts`: 새 술어 `isSec163_9HouseLandProviso(cause, landDate)` = 토지 원인 상속·증여 ∧ `SEC_163_9_LAND_FIRST_DISCLOSURE ≤ landDate < SEC_163_9_BUILDING_FIRST_DISCLOSURE`(1990-08-30 ≤ d < 2005-04-30, 엄격 `<`). 주택 ∧ 단독·다가구는 D2-4 술어 `isSec163_9BuildingSec164Open` 재사용.
  위반 규칙(D2-4 Y4 미러): 구간 안 주택 → 비주택은 해당 없음 · 주택 구분 미확인/공동주택 → Q-3 · 일부 양도 → 차단(기준 면적 미확정, 자동 안분 금지) · 「수증 당시 주택 있음」 사실 → Q-1 · ② 없음 → 차단(`landHouseSec164Value` 필수).
- **해결자** `resolveLandPartAcquisition` 확장: 단서 1호 분기 다음에 단서 2호 토지 분기 — overlay 상속·증여 ∧ 건물 원인 매매 ∧ 주택 ∧ `house_individual` ∧ 구간 ∧ 별개 취득 ∧ ① 있음 ∧ ② > 0 → `max(①, ②)`, 동점 = 평가액. echo `rule: "sec163_9_2_land"`(새 값 — 기존 `sec163_9_2`는 표시층이 「건물」로 매핑하므로 섞으면 파트 라벨이 틀린다).
- **타입** `LandAcquisitionBasis.rule` 유니온에 `"sec163_9_2_land"` 추가(`transfer-split-gain.types.ts:61`). 입력 `landHouseSec164Value?`·`landHouseExisted?`(Q-1) 추가.
- 개산공제 없음(①②는 법 §97①1호 가목 의제 — 토지 파트 모드 `actual` 강제, 기존 G-2 규칙 그대로).

### 5.2 클라이언트 · API (14지점)
- **④ 브리지** `lib/calc/transfer-house-land-sec164-bridge.ts`(신규, D2-4 브리지 미러): `houseLandSec164Applies` · `houseLandSec164Open` · `deriveHouseLandSec164Total` = `safeMultiplyThenDivide(P_F, L_E, L_F + B_F)` 1회 floor + 지분 `applyRatio` 1회. L_E = `multiplyByArea(inhHouseValLandPricePerSqmAtInheritance, 면적)`, L_F = `multiplyByArea(inhHouseValLandPricePerSqmAtFirst, 면적)`, B_F = `inhHouseValBuildingStdPriceAtFirst`, 면적 `sec164AreaSqm`. **신규 AssetForm 키 0**(Q-1 사실 칸만 예외) — D2-4와 같은 `inhHouseVal*` 키를 쓰되 D1·D2는 overlay로 배타라 같은 자산에서 동시에 켜지지 않는다.
- **⑤ 카드** `HouseLandSec164Card.tsx`(신규, `LandPartCauseBlock`의 `LandSec164Card` 자리 옆 — D1-4가 1990.8.30. 전, 이 카드가 그 이후): 주택 구분 칸(D2-4 카드와 같은 `houseKindChangePatch`) · Q-1 사실 칸 · 4칸(최초공시 주택가격 · 최초공시 ㎡당 공시지가 · 최초공시 건물 기준시가 · 수증일 ㎡당 공시지가) · 파생 박스(`Frac` 산식, 채택값 미표시). 토글 없음.
- **⑧** `transfer-tax-validate-split.ts`: leaf 위반을 칸으로 라우팅(구분 → `inheritanceAssetKind` · 사실 → 새 칸 · ② 5칸 순서 · 일부 양도 → `areaScenario`). ⚠️ 이 파일은 675줄 — 추가가 +50줄을 넘으면 ⑧ 라우팅을 D2-4와 함께 별도 파일로 뺀다(800줄 정책).
- **⑥ 사이드바** `separateAcqPartsSum`: 구간 안 → pending, 결과 후 엔진 합(D1-4·D2-4와 같은 분기).
- **⑦ 4뷰** `SPLIT_ACQ_BASIS_RULE`에 `sec163_9_2_land` 행(파트 「토지」 · 라벨 「영 §164⑦ 가액의 토지 몫」 · 근거 「소득세법 시행령 §163조 제9항 단서 2호」) — `satisfies Record<rule, …>` 키 가드가 누락을 잡는다. 카드·상세명세서·신고서 각주·PDF.
- **⑫** 두 스키마(주 자산 `base-shape` · 컴패니언 `split`)에 `landHouseSec164Value`(양의 정수)·Q-1 사실 추가, `refineSplitPartCause`에 같은 leaf. **⑭** 3곳(`engine-input.ts` · `multi/route.ts` · `bundled-split-helpers.ts`). **⑬** `buildLandPartCausePayload` 공용(단건·다건·컴패니언 body 동일).
- **고지**(warnings): 「토지 몫 산식을 정면으로 쓴 해석례는 없다 — 재산세과-371 안분 적용」. 채택 쪽·방향은 말하지 않는다.

## 6. 사용자 결정 — ✅ 전부 권고안 확정 (2026-10-19)

| # | 질문 | 선택지 | 권고 |
|---|---|---|---|
| **Q-1** | 「토지를 받을 당시 지금의 주택이 그 위에 있었다」를 어떻게 확인하나 — 없었으면 그 토지는 주택부수토지가 아니어서 단서 2호가 성립하지 않는다(건물 매매일은 건물 **신축일**이 아니라서 날짜로 판정 불가) | **A** 구간 안에서 예/아니오 필수 선언(모르면 진행 불가) · B 예/아니오/모름 — 모름은 ① 단독 + 확인 필요 고지 · C 묻지 않고 항상 비교 | **B** — 「모름 = 혜택 불성립 + 확인 필요」 규칙(memory `feedback_unknown_fact_applies_unfavorably`) |
| **Q-2** | 신축 호스트(토지 상속·증여 + 건물 신축)도 여는가 | A 열지 않음 — 지금 건물은 수증 뒤 신축이라 수증 당시 그 건물은 없었다. 종전 주택이 있었던 경우는 그 주택 가액을 받을 칸이 없어 ① 단독 + 고지 · B 열고 종전 주택 가액을 받는다 | **A** |
| **Q-3** | 구간 안 공동주택·구분 미선택 | A D2-4처럼 **차단**(구분 선택 요구 · 공동주택은 영 §164⑥ 체계라 미지원 문구) · B ① 단독 + 고지 | **A** — D2-4와 같은 leaf, 종전 ① 단독 계산이 법상 비교 누락이라 그대로 두면 조용한 오답 |
| **Q-4** | 1990.8.30. **전** 주택 부수토지 — 단서 1호(§164④, 현행 D1-4)인가, 2호(§164⑦ 토지 몫)인가, 둘 다인가 | A 현행 유지(1호) + 확인 필요 기록 · B 2호로 바꾼다 · C 3자 max | **A** — 해석례(2005년 증여)는 1990.8.30. 이후 사안만 답한다. 바꿀 근거가 없다 |
| **Q-5** | 구간 상한을 **주택마다의 최초공시일**로 할 것인가 (§7) | A 이번 범위에 포함(D1-H만) · **B 별건 — 자산 단위·D2-4·D1-H 세 경로를 함께** · C 고정 2005-04-30 유지 | **B** — 술어를 경로마다 다르게 두면 같은 주택이 경로에 따라 갈린다(memory `feedback_shared_predicate_argument_parity`) |

## 7. 별건 — 개별주택가격 최초공시일이 주택마다 다르다 (이번 범위 밖, Q-5)

- 해석례 사실관계의 최초공시는 **2006.4.28.**이고 증여는 **2005.5.12.**다. 고정 경계 2005-04-30 아래에서는 **해석례 자신의 사안이 구간 밖**이 된다 — 이번 D1-H만으로는 그 사안을 다루지 못한다.
- 저장소의 경계는 전부 고정 상수다: `HOUSE_FIRST_DISCLOSURE_DATE`(`inheritance-house-valuation.types.ts:27`) — 자산 단위 게이트 `inheritance-acquisition-helpers.ts:154-156` · ⑧ `sec164-required-fields.ts:25,115` · D2-4 `SEC_163_9_BUILDING_FIRST_DISCLOSURE`(`transfer-split-part-cause.ts:170`).
- 주택별 날짜 입력 `inhHouseValFirstDisclosureDate`는 있으나 ④가 `firstDisclosureDate`로 싣기만 하고(`transfer-tax-api-inheritance.ts:243`, 기본 2005-04-30) 엔진 `inheritance-house-valuation.ts`는 그 값을 읽지 않는다(grep 0건). 화면은 공시가 조회 기준일로만 쓴다(`HouseValuationSection.tsx:266,439,451`). 이 값을 바꾸는 입력 칸은 grep상 없다(store 제외 setter 0건).
- 형제 경로는 이미 주택별 날짜로 판정한다: 재개발 `redevelopment-valuation.ts:156`(`acquisitionDate < firstDisclosureDate`).

## 8. 확인 필요 (근거 미확보)

- **U-1** 토지 몫 산식(건물 기준시가 약분)을 정면으로 쓴 해석례 — 재산세과-371 안분을 토지 쪽에 적용한 것(결과 고지).
- **U-2** 해석례 ②의 「영 §164⑦의 규정에 의한 가액」이 토지 몫인지 주택 전체 가액인지 회신 문언은 말하지 않는다 — 토지만 증여받은 사안이므로 토지 몫으로 읽었다.
- **U-3** 소유자 분리 `land_only` 수증자가 **토지분 신고가액만** 아는 경우의 ① 입력 의미(현 모델은 물건 전체 평가액을 받아 안분) — 계산은 정합(C), 안내 문구 별건.
- **U-4** 1990.8.30. 전 주택 부수토지의 1호·2호 관계(Q-4).

## 9. 검증 계획 (Do)

1. **Pre-Do anchor 먼저** — 현행 B를 고정(`[D1-H 전환]` 이름 표지): ⑧ 통과 · route 200 · 양도차익 750,000,000 · 비교 echo 없음. 대조군 A·C 불변 테스트.
   → verify: master에서 통과
2. 엔진 leaf·해결자·⑫·⑭·④ 브리지 → anchor: ② = floor(300,000,000 × 100,000,000 ÷ 260,000,000) = **115,384,615**(산술 확정) · ② 채택 시 토지 취득가액 115,384,615 · ① 1.3억이면 ① 채택 · 동점 = 평가액 · 경계 1990-08-30(구간 안 시작) / 2005-04-29(안) / 2005-04-30(밖) · 지분 50% · 컴패니언 · 다건 = 단건 세액. 양도차익·세액 기대값은 **Do에서 실측해 확정**(손계산 예상 734,615,385는 장특공제 등 하류를 거치지 않은 값).
   → verify: 신규 anchor 통과 · 기존 D1·D1-4·D2-4 테스트 불변
3. ⑤ 카드·⑧·⑥·⑦ → RTL anchor · ⑧≡⑫ 격자(구간 × 호스트 × 구분 × Q-1 사실 × 입력 완결)에서 「⑧ 통과 ∧ ⑫ 비-200」 0
   → verify: 격자 위반 0
4. 뮤테이션(구간 경계 2곳 · 단독 게이트 · Q-1 사실 · 호스트 · 별개 취득 · ① 존재 · max/동점 · rule 매핑 · ⑫ 2스키마 · ⑭ 3곳 · ④ 지분) — 전부 KILLED
5. `check:pre-pr` · E2E acq-cause 계열 + 신규 spec(입력 → 계산 → body·카드·명세서) · Playwright 1280/375px

## 10. 미수행

- 브라우저에서 B 사례를 직접 입력해 본 확인은 하지 않았다(probe는 ④ → route → 엔진).
- 다건·컴패니언 경로의 현행 실측은 하지 않았다 — 단건과 같은 `buildLandPartCausePayload`를 쓴다는 것은 D2-4 기록(상위 계획서 §13.3)에 근거한다(**확인 필요**, Do 1단계에서 실측).

## 11. Do 결과 (2026-10-19)

### 11.1 구현 — 14지점

| 지점 | 파일 | 내용 |
|---|---|---|
| 엔진 leaf | `lib/tax-engine/transfer-split-part-cause.ts` | `isSec163_9HouseLandProviso`(1990-08-30 ≤ d < 2005-04-30) · `isSec163_9HouseLandTarget`(주택 ∧ 건물 매매 ∧ 「있었음」 ∧ 구간) · 위반 순서 구분 → 일부 양도 → ② (D2-4 Y4 미러). 사실 `landHouseExisted`·`landHouseSec164Value` |
| 엔진 해결자 | `transfer-tax-split-acq-price.ts` `resolveLandPartAcquisition` | 단서 1호 분기 뒤 D1-H 분기 — max, 동점 = 평가액, echo `rule: "sec163_9_2_land"` |
| 엔진 고지 | `transfer-tax-appurtenant-land.ts` `houseLandSec164Notice` | 비교가 돈 경우 방법·한계(U-1) · 매매 호스트 모름·미입력 → 평가액만 · 신축 호스트 → 종전 주택 한계 |
| 타입 | `transfer.types.ts` · `transfer-split-gain.types.ts` | 입력 2필드 · `rule` 유니온에 `sec163_9_2_land` |
| ⑦ 4뷰 | `transfer-tax-split-display.ts` | `SPLIT_ACQ_BASIS_RULE` 한 행(토지 · 「영 §164⑦ 가액의 토지 몫」 · 단서 2호) — 카드·명세서·신고서·PDF가 이 맵 하나를 읽는다 |
| ⑫ | `transfer-tax-schema-base-shape.ts` · `transfer-tax-schema-split.ts` · `…required-refines-2a.ts` | 두 스키마에 2필드 · refine leaf 사실 |
| ⑭ | `engine-input.ts` · `multi/route.ts` · `bundled-split-helpers.ts` | 2필드 매핑 |
| ④ | `lib/calc/transfer-house-land-sec164-bridge.ts`(신규) · `transfer-tax-api-split.ts` | 게이트·「있었음」·구분(명시 선택만)·② 파생(`safeMultiplyThenDivide` 1회 + 지분 `applyRatio` 1회) · `buildLandPartCausePayload`에 동봉(단건·다건·컴패니언 공용) |
| ⑧ | `transfer-tax-validate-split.ts` · `sec164-required-fields.ts` | 「있었는지」 미선택 차단(⑧ 전용 — ⑫는 모름으로 읽음) · 구분 → `inheritanceAssetKind` · ② 5칸 순서 `sec164HouseLandPartStatus` |
| ⑥ | `transfer-tax-split-acq-mode.ts` | 비교가 도는 경우만 pending |
| ⑤ | `components/calc/transfer/HouseLandSec164Card.tsx`(신규) · `LandBuildingSplitSection.tsx` 마운트 · `LandPartCauseBlock.tsx` 안내 문구 | 3택 라디오 · 구분 라디오 · 4칸 · 파생 박스 |
| ①② | `calc-wizard-asset-split-acq.ts` · `calc-wizard-asset-factory.ts` | AssetForm 키 `landHouseExisted` 1개(기본 "") — 복원은 `fillMissingFromFactory`가 채운다 |

**설계와 달라진 점**
- 주택 구분 사실은 새 필드를 만들지 않고 D2-4의 `buildingHouseKind`를 같이 쓴다(D1·D2 overlay는 배타라 한 자산에서 동시에 켜지지 않는다). 그래서 ⑫·⑭ 신규 필드는 2개다.
- 해결자에서 단독·다가구 재확인을 뺐다 — 유일한 호출부 `calcSplitGain`이 leaf를 먼저 돌려 그 경우는 이미 던진다(뮤테이션 M11 생존으로 도달 불가 확인). D2-4 해결자에는 같은 겹친 검사가 남아 있다(이번 범위 밖).
- ⑧은 「있었는지」 미선택을 막지만 ⑫·엔진은 막지 않는다(⑧이 더 엄격한 방향 — 「⑧ 통과 ⇒ ⑫ 200」 유지). 그래서 D1-4 쪽 「⑧ ⇔ ⑫ 정확 일치」 격자 3개 테스트의 매매 호스트 시드에 `landHouseExisted: "no"`를 고정했다(단서 1호가 주제라 종전 계산을 유지) — E2E d1-4b 「1991 부정형 짝」 시드도 같다.

### 11.2 검증

- 신규 테스트: route anchor 30건(`__tests__/api/transfer.route.split-house-land.d1h.anchor.test.ts` — ② 채택·① 채택·동점·상속·지분 50% · Q-1 3값·미선택 · Q-3 구분·② 5칸·일부 양도 · 경계 1990-08-29/30·2005-04-29/30 · 신축 · ⑥⑦ · 다건 · 직접 호출 · 컴패니언 · ⑧≡⑫ 720셀 격자) + UI anchor 18건(`house-land-sec164-card.d1h.ui.anchor.test.tsx` — 카드 노출·라디오·파생 박스·⑧ 앵커 전부 화면 존재·⑥ 465,384,615·⑦ 4뷰).
- ② 채택 세액은 「① = 115,384,615 · 비교 없음」 대조 시드와 과세표준·결정세액이 같다(독립 대조). 양도차익 750,000,000 → 734,615,385.
- ⑧≡⑫ 격자 720셀: 「⑧ 통과 ∧ ⑫ 비-200」 0 · 비교가 도는 셀 6(구간 날짜 3 × 원인 2)만.
- 뮤테이션 34종: 32 KILLED → M03(호스트 조건) 직접 호출 테스트 F-4 추가 후 KILLED · M11은 도달 불가 검사라 코드에서 제거.
- 전체: `check:pre-pr` 1차 3,081파일 통과·4건 실패(위 D1-4 시드 3파일 — 수정 후 75건 통과), lint 오류 0.
- E2E 22건 통과(신규 d1h 4 + d1-4b 8 + d1-2 5 + d2-4 6 — 워크트리 `E2E_PORT`). Playwright 1280/375px 카드 확인, 가로 넘침 0.
- ⚠️ 워크트리 `node_modules` 복제본에 `node_modules/node_modules → 메인 트리` 심링크가 있어 RTL이 React 두 벌로 실패했다 — 지우고 해결(제품 코드 무관).

### 11.3 미수행·남김
- §7 주택별 최초공시일(Q-5 별건) — 해석례 자신의 사안(2006.4.28. 최초공시)은 아직 구간 밖이다.
- U-1~U-4 확인 필요 그대로.
