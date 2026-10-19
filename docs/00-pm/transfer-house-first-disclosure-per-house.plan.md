# 주택별 개별주택가격 최초공시일 — 영 §163⑨ 단서 2호 구간 끝을 주택마다 (Q-5 별건)

> 작성 2026-10-19 · 상태 **Do 진행 — Q-1~Q-4 권고안 확정(2026-10-19 사용자 「권고대로」)** · 워크트리 `../Property-related-Taxes-hfd` · 브랜치 `plan/house-first-disclosure-per-house`
> 선행: `transfer-house-land-163-9-2.plan.md` §6 Q-5(「별건 — 자산 단위·D2-4·D1-H 세 경로를 함께」) · §7. **PR #2255(D1-H) 위에 쌓았다** — #2255가 열린 채로 Do를 진행한다(머지는 사용자 지시 시에만). #2255 머지 후 master로 리베이스한다.

## 1. 문제

영 §163⑨ 단서 2호 구간(「건물의 기준시가가 고시되기 전에 상속 또는 증여받은」)의 끝을 저장소는 **모든 주택에 2005-04-30 고정**으로 둔다.
영 §164⑦은 「당해 주택에 대하여 … **최초로 공시한** 주택가격」으로 주택마다의 최초공시를 기준으로 삼는다. 2005.4.30. 뒤에 처음 공시된 주택(신축·누락 등)을 그 공시 전에 받으면 단서 2호 대상이다.
하지만 지금은 평가액(①)만으로 계산하고, 비교도 안내도 하지 않는다.

**이 단서를 처음 적용한 해석례 사안부터 이 경우다** — 부동산거래관리과-364는 2005.5.12. 증여·2006.4.28. 최초공시 사안에 단서 2호를 적용했다(§2).

## 2. 근거 (원문 확인 2026-10-19)

- **영 §163⑨ 단서 2호**(현행, KoreanLaw MCP): 「「상속세 및 증여세법」 제61조제1항제2호 내지 제4호의 규정에 의한 건물의 기준시가가 고시되기전에 상속 또는 증여받은 건물의 경우에는 … 평가한 가액과 제164조제5항 내지 제7항의 규정에 의한 가액중 많은 금액」.
- **영 §164⑦**(현행): 「…개별주택가격 및 공동주택가격(이들에 부수되는 토지를 포함한다)이 공시되기 전에 취득한 주택의 취득당시의 기준시가는 … 국토교통부장관이 **당해 주택에 대하여 최초로 공시한 주택가격** × 취득당시 (토지+건물 기준시가) / **당해 주택에 대하여 … 최초로 공시한 주택가격공시당시**의 (토지+건물 기준시가)」.
- **부동산거래관리과-364(2010.3.10.)** — 국세법령정보시스템 본문(Playwright, `ntstDcmId=010000000000139021`).
  - 사실관계: 「을의 부수토지 : ’05.5.12(직계존속으로부터 수증)」 · 「개별주택가격 최초 공시 : ’06.4.28」. 주택은 갑, 부수토지는 을 소유다.
  - 회신 ②: 「… 건물의 기준시가가 고시되기 전에 증여받은 주택부수토지의 취득가액은 증여일 현재 … 평가한 가액과 「소득세법 시행령」 제164조제7항의 규정에 의한 가액 중 많은 금액」.
- **형제 경로는 이미 주택별 날짜를 쓴다.**
  - 매매 주택 §164⑦ 환산(PHD): `phdFirstDisclosureDate`를 필수로 입력받고 `isPhdEligible(취득일, 최초공시일)`로 판정한다(`lib/calc/phd-eligibility.ts:31`).
  - 재개발: `redevelopment-valuation.ts:156`.

## 3. 현행 실측 (throwaway probe — 실제 ④→⑫→⑭→엔진 경로)

같은 입력에서 수증일(상속개시일)만 2005-04-29 ↔ 2005-05-12로 바꾸었다. 05-12 행에는 `inhHouseValFirstDisclosureDate: "2006-04-28"`도 넣었다.
양도 2026-06-30 · 양도가 12억 · P_F 3억 · 최초공시 ㎡당 1,000,000 · 200㎡. probe 사본은 세션 scratchpad `_probe_hfd.test.ts`다.

| 경로 | 2005-04-29 (대조) 양도차익 | 2005-05-12 + 최초공시 2006-04-28 양도차익 | 05-12에서 ④가 보낸 ② |
|---|---|---|---|
| P1 자산 단위 — 주택 전체 증여 | 1,026,923,077 | **1,100,000,000** (① 1억 단독) | `inheritedHouseValuation` 없음 |
| P1i 자산 단위 — 주택 전체 상속 | (대조 미측정) | **1,100,000,000** (① 단독) | 없음 |
| P4 소유자 분리 `land_only`(**해석례와 같은 소유 형태**) | 913,186,813 | **961,904,762** | 없음 |
| P2 D2-4 — 건물 상속 + 토지 매매 | 864,000,000 | **870,000,000** | `buildingSec164Value` 없음 |
| P3 D1-H — 토지 증여 + 건물 매매(받을 당시 주택 있음) | 734,615,385 | **750,000,000** | `landHouseSec164Value` 없음 |

- 네 경로 모두 ⑧ 오류 0건 · ⑫ 200 · 안내 없음. **저장된 `inhHouseValFirstDisclosureDate`는 어느 경로의 판정에도 쓰이지 않는다.**
  - ④는 그 값을 `inheritedHouseValuation.firstDisclosureDate`로 싣기만 한다(`transfer-tax-api-inheritance.ts:243`). 그런데 05-12에서는 payload 자체가 만들어지지 않는다.
  - 엔진 `inheritance-house-valuation.ts`는 그 필드를 읽지 않는다.
- 이 값을 바꾸는 입력 칸이 없다. 기본값 `"2005-04-30"`은 `calc-wizard-asset-factory.ts:258`에서 넣고, 복원 시 `calc-wizard-asset-migrate.ts:263`에서 채운다.

## 4. 고정 경계 소비처 전수 (grep `2005-04-30|HOUSE_FIRST_DISCLOSURE|SEC_163_9_BUILDING_FIRST_DISCLOSURE`)

### 4.1 이번 범위 — 주택 단서 2호 세 경로

| 층 | 위치 | 역할 |
|---|---|---|
| 엔진 leaf | `transfer-split-part-cause.ts:181` 상수 · `:227` `isSec163_9BuildingProviso` · `:241` `isSec163_9HouseLandProviso` | D2-4·D1-H 구간 술어 |
| 엔진 자산 단위 | `inheritance-acquisition-helpers.ts:154-156` `isHousePreDisclosure` | ② 주입(`shouldInjectHouseMax`) |
| 엔진 해결자·고지 | `transfer-tax-split-acq-price.ts:385`(D2-4) · `:341-349`(D1-H, leaf 술어 경유) · `transfer-tax-appurtenant-land.ts:435` | max·고지 |
| ④·⑧ 공용 | `sec164-required-fields.ts:25,115` · `transfer-163-9-base-date.ts:144` | 자산 단위 payload·필수 판정 |
| ④ 브리지 | `transfer-building-sec164-bridge.ts:39` · `transfer-house-land-sec164-bridge.ts:47` | D2-4·D1-H 노출·payload |
| ⑤ 게이트 | `GiftHouseStdPriceSection.tsx:43-50` · `PostDeemedInputs.tsx:82,90-92` · `PreDeemedInputs.tsx:55`(1985 전이라 결과 불변) | 카드 노출 |
| ⑤ 조회 기준일·라벨 | `HouseValuationSection.tsx:163,266,346,433-451` · `BuildingSec164Card.tsx:51,102-103,118,167-181` · `HouseLandSec164Card.tsx:46,87,138-152` | 최초공시 시점 공시가 조회·문구 |
| 문구 | `transfer-tax-validate-split.ts:147,173` · `transfer-tax-appurtenant-land.ts:438,445` · `GiftHouseStdPriceSection.tsx:64` · `PostDeemedInputs.tsx:348` · `BuildingCauseMixBlock.tsx:100` · `LandPartCauseBlock.tsx:193` | 「2005.4.30.」 고정 표기 |

### 4.2 범위 밖 — 고정 경계 유지 (Q-4)

| 위치 | 그대로 두는 이유 |
|---|---|
| 비주택 건물 Y4a(`transfer-split-part-cause.ts:319` · `transfer-land-part-cause.ts:186`) | 일반건물은 영 §164⑤ 체계다. 상수 주석에 「보수적 상위 집합」으로 적힌 차단이고 주택별 공시와 무관하다 |
| 겸용 부담부증여 MB-18(`mixed-use-burdened-gift-prepare.ts:205-207`) | 계산하지 않고 차단만 하는 규칙이다. 경계를 늦추면 차단 범위가 넓어진다 — 별건 |
| 매매 5칸 안분 안내(`housing-excess-split.ts:114-120` · `HousingExcessSplitCard.tsx:76,111`) | 매매 주택 안내다. 매매의 주택별 날짜는 PHD(`phdFirstDisclosureDate`)가 이미 맡는다 |
| 재개발(`redevelopment-valuation.ts:156`) · 매매 PHD | 이미 주택별 날짜를 쓴다 |
| 공동주택(`house_apart`) 자산 단위 경계 | Q-2 |

## 5. 설계

### 5.1 사실 하나 · 운반 하나

- **입력 사실** = 기존 store 필드 `inhHouseValFirstDisclosureDate`. D2-4·D1-H 카드도 이미 `inhHouseVal*` 묶음(최초공시 주택가격·㎡당가·건물 기준시가)을 같이 쓰므로 같은 주택의 같은 사실이다. 새 store 필드도 마이그레이션도 없다.
- **운반** = 새 최상위 입력 `houseFirstDisclosureDate?: string`(본 자산·컴패니언 공통) 하나로 세 경로가 모두 읽는다.
  - 자산 단위에만 있는 기존 `inheritedHouseValuation.firstDisclosureDate`는 D2-4·D1-H에서는 실리지 않는다(Y7). 그래서 그것을 쓰면 운반이 둘이 된다(memory `feedback_shared_predicate_argument_parity`).
  - 기존 중첩 필드는 지금처럼 소비되지 않은 채 둔다. 언급만 하고 손대지 않는다.
- **④ 송신 규칙(단일 헬퍼 `houseFirstDisclosureSent(asset)`, `transfer-163-9-base-date.ts`)**: 다음을 모두 만족할 때만 그 날짜를 보내고, 아니면 보내지 않는다.
  - 주택(`housing`)이다.
  - 주택 구분을 **명시로** 단독·다가구(`inheritanceAssetKind === "house_individual"`)로 골랐다.
  - 날짜가 유효하고 2005-04-30보다 뒤다.

  ⇒ **날짜를 바꾸지 않은 모든 기존 입력은 payload가 지금과 같다**(회귀 0의 근거, anchor로 고정).

### 5.2 leaf — 경계 함수 하나

```ts
/** 단서 2호 구간의 끝 — 주택별 최초공시일(단독·다가구, 2005-04-30 뒤일 때만)이 있으면 그 날, 없으면 2005-04-30. */
export function houseDisclosureBoundary(houseFirstDisclosureDate?: string): string
```

- `isSec163_9BuildingProviso(cause, date, boundary = SEC_163_9_BUILDING_FIRST_DISCLOSURE)`와 `isSec163_9HouseLandProviso(cause, landDate, boundary = …)`에 셋째 인자를 더한다. 기본값이 있으므로 비주택 Y4a 호출부는 그대로다.
- `SplitPartCauseFacts`에 `houseFirstDisclosureDate?`를 더한다.
- Y4 분기(`:318`)는 주택일 때만 `houseDisclosureBoundary(f.houseFirstDisclosureDate)`를 넘긴다.
- D1-H 표적(`isSec163_9HouseLandTarget`)도 같은 경계를 받는다.
- 엄격 `<`는 그대로다 — 최초공시 **당일** 수증은 「공시되기 전」이 아니다. PHD `isPhdEligible`과 같다.

### 5.3 엔진

- 자산 단위 `isHousePreDisclosure`(`inheritance-acquisition-helpers.ts:154`):
  - `base.inheritanceDate < 경계(base.assetKind === "house_individual" ? rawInput.houseFirstDisclosureDate : undefined)`로 바꾼다.
  - 공동주택은 고정 경계를 그대로 쓴다(Q-2).
- 해결자 D2-4(`:385`)·D1-H(`:341`)·D1-H 고지(`appurtenant-land.ts:435`)는 같은 경계를 넘긴다.
- 「모름 = 불성립」은 그대로다. 날짜를 보내지 않으면 지금과 같다.

### 5.4 14지점

| 지점 | 변경 |
|---|---|
| ①②③ | 없음 — 기존 필드·기본값·복원 채움 |
| ④ | `buildLandPartCausePayload`(D2-4·D1-H) · 본 자산 payload(자산 단위) · 컴패니언 payload에 `houseFirstDisclosureSent` spread |
| ⑤ | §5.5 |
| ⑥ | 브리지가 경계를 따라가므로 `transfer-tax-split-acq-mode.ts`의 pending 판정이 자동으로 맞춰진다 — anchor로 확인 |
| ⑦ | 고지 문구가 「2005.4.30.」 대신 그 주택의 최초공시일을 말한다(§5.6) |
| ⑧ | facts 전달 · 날짜 범위 검증(Q-3) · `sec164HouseStatus`·브리지 경계 |
| ⑨⑩⑫ | `base-shape`·`split` 스키마에 `houseFirstDisclosureDate: z.string().date().optional()` · 범위 refine(Q-3) · required-refines facts |
| ⑪ | 해당 없음 |
| ⑬ | ④ spread가 body에 실린다 |
| ⑭ | `engine-input.ts`(D1-H 줄 `:373` 옆) · `multi/route.ts:221` 옆 · `bundled-split-helpers.ts:417` 옆. 문자열 그대로 넘긴다 — leaf가 `YYYY-MM-DD` 문자열을 비교한다 |

### 5.5 화면

- **진입 칸**: 공용 `HouseFirstDisclosureDateField` 하나(DateInput, hint로 형식 설명, placeholder 숫자 금지).
  - 라벨: 「이 주택의 개별주택가격 최초 공시일」.
  - 안내: 「2005.4.30. 뒤에 처음 공시된 주택(그 뒤 신축 등)을 그 공시 전에 받았으면 그 날짜로 고치세요」.
- **어디에 뜨나** — 한 시점에 한 곳에만:
  - 기준일(상속개시일·증여일·토지 취득일) **≥ 2005-04-30**이면 각 경로의 진입 위치에 이 칸만 단독으로 띄운다. 위치는 `PostDeemedInputs` 주택 영역 · 증여 주택(`GiftHouseStdPriceSection` 자리) · `LandBuildingSplitSection`의 D2-4·D1-H 카드 자리다. 날짜가 기준일보다 뒤가 되면 기존 카드가 열린다.
  - 기준일 **< 2005-04-30**(이미 열린 구간)이면 열린 카드의 「최초 공시 시점」 머리에 같은 칸을 둔다.
    - 하드코딩된 `(2005-04-30)` 라벨을 대체한다.
    - 조회 기준일(`referenceDate`·`landPriceYear`)이 이 날짜를 따르게 한다(`BuildingSec164Card.tsx:102-103,174-181` · `HouseLandSec164Card.tsx:145-152`). `HouseValuationSection`은 이미 이 필드를 조회 기준으로 쓰므로(`:266,439,451`) 라벨만 바꾼다.
- **주택 구분**: 날짜가 열린 뒤 단독·다가구 명시 선택이 필요하다(Q-2).
  - D2-4·D1-H 카드와 `PostDeemedInputs`(`InheritanceHouseKindPicker`)에는 선택기가 이미 있다.
  - 증여 자산 단위(`GiftHouseStdPriceSection`)에는 선택기가 없다(grep). 그 경로에 한해 진입 칸 아래에 같은 선택기(`houseKindChangePatch` 공용)를 붙인다.

### 5.6 문구

§4.1 「문구」 행의 「2005.4.30.」 표기는 주택 경로에서 「개별주택가격 최초 공시일(이 주택은 YYYY.M.D.)」로 바꾼다. 비주택 문구(`transfer-split-part-cause.ts:186`)는 그대로 둔다.
문구를 바꾸면 테스트·E2E가 그 문자열에 걸려 있는지 역방향으로 grep한다(memory `feedback_display_string_change_needs_reverse_grep`).

## 6. 결정 (2026-10-19 확정 — 전부 A)

| # | 질문 | 선택지 | 권고 |
|---|---|---|---|
| **Q-1** | 2005.4.30. 뒤에 받은 주택에서 「최초공시가 더 늦었는가」를 어떻게 물을까 | **A 선택 날짜 칸**(기본 2005.4.30. — 그대로 두면 지금과 같다) · B 상속·증여 주택마다 필수 3지선다(공시돼 있었음/없었음/모름) | **A** — 2005년 뒤에 받은 상속·증여 주택 전부에 필수 질문이 붙는다. 그대로 둔 경우는 「모름 = 불성립」과 같은 결과(① 단독)다. 매매 PHD도 최초공시일은 사용자가 입력한다(`phdFirstDisclosureDate`, 기본값 빈칸) |
| **Q-2** | 주택별 날짜를 어느 주택에 적용할까 | **A 단독·다가구로 명시 선택한 주택만** · B 모든 주택(공동주택 포함) | **A** — 공동주택은 2006년 전에 국세청 고시 공동주택 기준시가가 있던 경우 「고시되기 전」이 아니다. 영 §164⑥·⑦ 중 어느 쪽인지 갈린다(D1-H Q-3과 같은 이유). 그래서 자산 단위 공동주택은 지금의 고정 경계를 유지한다. 날짜를 고쳤는데 주택 구분이 비었거나 공동주택이면 ⑧·⑫에서 차단한다(D1-H Q-3 미러) |
| **Q-3** | 날짜 범위 검증 | **A 2005-04-30 ≤ 날짜 ≤ 양도일, 밖은 ⑧·⑫ 차단** · B 하한만 | **A** — 개별주택가격은 2005.4.30.에 처음 공시됐다. 양도일 뒤의 최초공시는 영 §164⑦ 산식의 「최초로 공시한 주택가격」을 양도 시점에 알 수 없다(상한은 확인 필요 U-2) |
| **Q-4** | 다른 고정 경계 소비처(§4.2) | **A 그대로** · B 함께 변경 | **A** — 비주택·겸용 부담부증여는 다른 조문 체계나 차단 규칙이고, 매매·재개발은 이미 주택별이다 |

## 7. 범위 밖 (언급만)

- 자산 단위 경로는 「4칸 다 채우면 비교」(opt-in, `sec164-required-fields.ts:2-11`)이고, D2-4·D1-H는 구간이면 ② 필수(차단)다. 이 차이는 기존 설계라 이번에 맞추지 않는다.
- `inheritedHouseValuation.firstDisclosureDate`(중첩)는 소비처 없이 운반만 된다. 기존 dead field라 이번에 지우지 않는다.

## 8. 검증 계획

**Pre-Do anchor**(구현 전 빨강 → 구현 후 초록):
- §3의 다섯 행을 앵커로 고정한다. 05-12 + 2006-04-28은 **같은 입력의 2005-04-29 대조군과 양도차익이 같아야** 한다(1,026,923,077 · 913,186,813 · 864,000,000 · 734,615,385). 세액은 Do에서 실측해 적는다.
- 경계:
  - 날짜 = 기준일(당일 — 닫힘)
  - 기준일 + 1일(열림)
  - 2005-04-30 그대로(지금과 같음)
  - 공동주택·주택 구분 미선택(날짜를 보내지 않음, 고친 경우 ⑧·⑫ 차단)
  - 범위 밖 날짜(차단)
- 회귀 0:
  - 날짜를 바꾸지 않은 기존 시드는 payload가 바이트 단위로 같아야 한다(D2-4·D1-H·자산 단위 앵커 기존 전건 통과).
  - 비주택 Y4a·MB-18은 불변이어야 한다.

**나머지 검증:**
- **⑧⇔⑫ 격자**: D1-H 720셀 격자에 `houseFirstDisclosureDate` 축(없음·기준일·기준일+1·범위 밖)을 더해 「⑧ 통과 ⇒ ⑫ 200」을 확인한다(memory `feedback_fe8_vs_12_parity_grid`).
- **뮤테이션**(백업 복원 하네스, `git checkout` 금지) — 다음 변형이 각각 죽어야 한다:
  - 경계 함수 상수화
  - `<` → `<=`
  - 주택 구분 조건 제거
  - 자산 단위 엔진 경계 미적용
  - ④ spread 삭제
  - ⑫ 스키마 줄 삭제
  - ⑭ 3곳 매핑 삭제
  - ⑤ 진입 칸 미마운트
  - 조회 기준일 하드코딩 복귀
- **⑤ RTL**:
  - 진입 칸 노출 조건(4경로 × 기준일 전/후)
  - 날짜 변경 → 카드 열림
  - 조회 기준일 전달
- **E2E**: 해석례 형태(증여 주택 2005-05-12 · 최초공시 2006-04-28)를 화면에서 입력해 결과 취득가액이 대조군과 같은지 확인한다. 375/1280px에서 가로 넘침이 없어야 한다.
- 법령 인용 상수 추가가 있으면 `additions-transfer.ts`에 등록한다.

## 9. 순서

1. PR #2255 머지 → 이 브랜치를 master로 리베이스 → verify: 계획서 file:line 재확인(memory `feedback_merged_plan_citations_drift`).
2. Pre-Do anchor(빨강) → verify: §3 수치 재현.
3. 엔진 leaf 경계 함수·술어·자산 단위·해결자 → verify: 엔진 앵커 초록.
4. ⑨⑩⑫⑭ → verify: route 앵커 초록, 격자.
5. ④⑧ → verify: ⑧⇔⑫ 격자 0 위반.
6. ⑤ 진입 칸·카드 라벨·조회 기준일·⑦ 문구 → verify: RTL·E2E.
7. 뮤테이션 → check:pre-pr → PR.

## 10. 확인 필요

- **U-1** 해석례 364는 「2005년 8월 5일 이후에 양도하는 경우」로 한정해 회신했다(영 §163⑨ 2호·§164⑦ 2005.8.5. 개정). 이 계산기의 양도일 범위(2009.3.16. 이후 — memory `project_transfer_pre_2009_3_16_out_of_scope`)에서는 문제가 되지 않는다고 보지만, 연혁 게이트로 따로 확인하지는 않았다.
- **U-2** 최초공시일이 양도일 뒤인 주택(양도 당시 개별주택가격 없음)에 대한 해석례는 찾지 않았다. Q-3의 상한 차단은 계산 불능에 따른 차단이다.
- **U-3** 공동주택 2005.4.30.~2006.4.28. 구간이 영 §164⑥(국세청 고시)인지 ⑦인지 정면 해석례는 찾지 않았다. Q-2 A는 그 판단을 하지 않고 기존 경계를 유지한다.

## 11. Do 결과 (2026-10-19)

**계획과 달라진 점**
- **엔진 경계 규칙** — `houseDisclosureBoundary(date, kind)`는 「공동주택 사실이 함께 오면 쓰지 않는다」로 두었다. 계획서의 「단독·다가구일 때만」과 다르다.
  - 이유: D1-H는 「받을 당시 주택」이 모름·없었음이면 ④가 주택 구분을 싣지 않는다(기존 확정 동작, `transfer.route.split-house-land.d1h.anchor.test.ts:167`). 그러면 모름 고지가 고정 경계로 판정돼 사라졌다(F-1 실패로 발견).
  - 「단독·다가구 명시」는 ④ 쪽(`lib/calc/house-first-disclosure.ts` — `houseDisclosureBoundaryOf`·`houseFirstDisclosureSent`)이 지킨다. 날짜는 명시 단독일 때만 실린다.
  - 주택 구분 없이 날짜만 직접 보내면 구간이 넓어진 뒤 D2-4 Y4d·D1-H 구분 규칙이 ⑫ 400으로 막는다(앵커 D′).
- **⑧ 주택 구분 요구는 「그 날짜가 구간을 넓힐 때만」** — 기준일이 2005-04-30 이후이고 그 날짜보다 앞일 때만 묻는다. 이미 2005.4.30. 전에 받은 주택은 날짜가 조회 기준일만 바꾸므로 묻지 않는다(공동주택의 2006-04-28 조회 등).
- **⑫의 주택 구분 차단은 따로 두지 않았다** — ④가 명시 단독일 때만 날짜를 싣기 때문이다. ⑫는 범위(Q-3)만 본다. 「⑧ 통과 ⇒ ⑫ 200」 방향이라 격자 위반은 없다.

**구현 위치**
- leaf: `transfer-split-part-cause.ts` — `houseDisclosureBoundary`·`houseFirstDisclosureDateInRange`·`disclosureDateLabel`·`HOUSE_FIRST_DISCLOSURE_RANGE_MESSAGE`, 두 술어의 셋째 인자, facts `houseFirstDisclosureDate`.
- 엔진: 자산 단위(`inheritance-acquisition-helpers.ts`) · 해결자 2곳 · D1-H 고지(문구가 그 주택의 날짜를 말한다) · `transfer-tax-split-gain.ts` facts · 입력 타입.
- ⑫: `base-shape`·`split` 스키마 · `refineHouseFirstDisclosureDate`(주 자산·컴패니언) · required-refines facts.
- ⑭: `engine-input.ts`·`multi/route.ts`·`bundled-split-helpers.ts`.
- ④: `buildHouseFirstDisclosurePayload` — 단건·컴패니언·다건 3곳.
- ⑧: `transfer-tax-validate-acquisition.ts`(범위·구분, 경로 분기보다 앞) · `transfer-tax-validate-split.ts` facts · `sec164HouseStatus`·두 브리지 경계.
- ⑤:
  - 공용 `HouseFirstDisclosureFields.tsx`(날짜 칸·진입 카드). 진입 카드는 D1-H·D2-4(분리 섹션), 증여·상속(자산 단위)에 붙였다. D2에서는 자산 단위 쪽에 두지 않는다 — 날짜 칸은 한 곳에만 있다.
  - 열린 카드 3종은 「최초 공시 시점」 머리에 날짜 칸을 두고, 조회 기준일·안내 문구가 그 날짜를 따른다.
  - 증여 자산 단위는 날짜로 열린 경우에 주택 구분 선택기를 붙였다.
- ⑥: 브리지를 따라간다(UI 앵커 사이드바 pending).

**검증**
- 엔진 앵커 5 · route 앵커 19(격자 포함) · UI 앵커 15.
- 해석례 사안 네 경로(자산 단위 증여·상속·land_only·D2-4·D1-H)가 2005-04-29 대조군과 같은 양도차익이다(1,026,923,077 · 913,186,813 · 864,000,000 · 734,615,385).
- ⑧⇔⑫ 격자 135셀 위반 0 — ⑧ 통과 63셀, 그중 날짜를 싣는 셀 18.
- 뮤테이션 45종 전부 KILLED. 1차에 M07·M12·M17·M33 4종이 살아남아 엔진 직접 테스트와 ⑧·⑫ ② 필수 테스트(D″)를 더했다.

**범위 밖으로 남긴 것**
- `bundled-split-helpers.ts`(791줄)·`transfer-tax-validate-acquisition.ts`(782줄)는 750 위험구간이다. 이번 변경은 각 1·6줄이라 분리하지 않았다(별건).
