# 증여세 상업용 건물 — 부수토지 보충평가 합산 구현 계획서 (v2 — 자가검증 수렴)

> 작성일: 2026-06-22 · 세목: 증여세(상속세 공유 엔진) · 영역: 부동산 평가(§60~§66)
> 검증 원칙: 인용 file:line·법령은 실측. 미확인은 "🔎 확인 필요"로 표기(추정 금지).
> **v2 변경**: plan-design-self-review 13단계 루프(25 에이전트) 반영 — 위젯 식별 정정
> (`LandPriceLookupField`→**`StandardPriceInput`**), 저장 방식·§159 처리 확정, ⑧ 협의분할 오귀속 정정.

---

## 0. 자가검증 수렴 결정 (확정 — 이 절이 v1 미해결을 닫음)

| 결정 | 내용 | 근거 |
|---|---|---|
| **부수토지 위젯** | 건물용 `StandardPriceInput` 옆에 **부수토지용 `StandardPriceInput` 1개 더**(propertyKind=토지·개별공시지가 area-mode) | 보충평가 위젯이 실제 `StandardPriceInput`(`EstateBodyRealEstate.tsx:252`)임을 실측 확정. `LandPriceLookupField` 아님 |
| **저장 필드** | `appurtenantLandStandardPrice?: number` **총액 1필드** | `StandardPriceInput`은 `onTotalPriceChange`로 **총액(원)** emit(단가×면적은 위젯 내부) → 별도 면적 필드·dual-truth 불필요 |
| **§159 부담부증여** | **이번 범위 포함.** 경로 B에서 `standardPrice`=건물분, `appurtenantLandStandardPrice`=토지분으로 §159 건물/토지 안분에 **각각** 공급 | 사용자 결정. 분리 필드라 오히려 §159① 정밀 안분에 유리 |
| **대안 A(단일 standardPrice UI 합산)** | **폐기.** v1 §8의 "BuildingStdPriceModalButton이 이미 합산 주입" 근거는 **사실오류**(아래) | must-fix #1 |

> ❌ **v1 사실오류 정정(must-fix #1·#2)**: v1 §8은 "`BuildingStdPriceForm`이 `landAreaM2·landPricePerM2`로
> 합산값을 `onApply`로 단일 `standardPrice`에 주입한다(BuildingStdPriceModalButton.tsx:271)"고 단정했으나,
> 실측상 그 모달 `onApply`는 **건물분 기준시가만** 주입하고(개별공시지가는 위치지수 조회 인자로만 소비,
> `building-standard-price-helpers.ts:141`), 부수토지 가액을 합산하지 않는다. 또한 해당 파일은 99줄로
> **:271 라인이 없다.** → 대안 A는 갭을 닫지 못하므로 폐기. 본 계획(신규 필드 방식)으로 확정.

---

## 1. 배경 — 현재 갭

증여 마법사 Step 2의 "상업용 건물"(`real_estate_building`)은 토지·주택과 같은 폼
(`EstateBodyRealEstate.tsx`)을 공유하며 **단일 평가액 1개**(`standardPrice`)만 받는다.

- 평가 우선순위: `시가 → 감정가 → 매매사례가 → 건물 기준시가` (`EstateBodyRealEstate.tsx:92`)
- 보충평가 위젯: **`StandardPriceInput`**(`EstateBodyRealEstate.tsx:252`). `resolvePropertyKind`가
  `real_estate_building`→`building_non_residential`로 매핑, area-mode에서 **단가(원/㎡)×면적(㎡)→총액(원)**을
  `onTotalPriceChange`로 `standardPrice`에 emit.
- 엔진: `real_estate_building` → `evaluateDetachedHouse(item)` (`property-valuation.ts:402`),
  보충평가 시 `amount = item.standardPrice`(`resolveValuationAmount` `property-valuation.ts:69~82`)

**갭**: 보충평가 모드의 `StandardPriceInput` area-mode는 **곱 1개(건물 연면적×건물단가)만** 표현하므로
**두 번째 곱(대지면적×개별공시지가 = 부수토지)을 동시에 담지 못한다.** 시가/감정가/매매사례가 입력 시엔
통합 거래액이라 부수토지가 자연 포함되지만, 보충평가 모드에서는 부수토지 가액이 누락되어 과소평가된다.

---

## 2. 법령 근거 (KoreanLaw 실측 — 상증법 §61, MST 276123, 시행 2026-01-02)

§61① 부동산 평가는 물건별로 갈린다:

| 호 | 대상 | 평가 방법 | 부수토지 |
|---|---|---|---|
| 1호 | 토지 | 개별공시지가 | — |
| 2호 | 건물(3·4호 제외) | 국세청장 산정·고시 **건물 기준시가** | **별도(=1호 토지)** |
| **3호** | **오피스텔·상업용 건물**(대통령령 지정) | 국세청장이 **토지+건물 일괄** 산정·고시 가액 ("딸린 토지 포함") | **일괄 포함** |
| 4호 | 주택 | 개별·공동주택가격 | 일괄 포함 |

### 핵심 결론 — 상업용 건물은 두 경로로 갈린다

- **경로 A (§61①3호, 일괄고시 대상)**: 국세청 일괄고시 기준시가 1개 = 토지+건물 통합.
  → **현행 동작으로 충분.** 여기에 부수토지를 더하면 **이중계상.**
- **경로 B (§61①2호 + 1호, 일괄고시 대상 아님)**: 건물 기준시가(2호) + 부수토지 개별공시지가(1호)
  를 **각각 평가 후 합산.** → **현재 누락. 본 구현의 대상.**

⚠️ 따라서 "무조건 부수토지를 더하는" 구현은 틀린다. **두 경로를 UI에서 구분**해야 한다.

> §61⑤(임대료환산 MAX)·§66(담보채권 하한)은 §61①~④ 평가액 **합산 후** 금액과 비교해야 하므로,
> 엔진에서 부수토지를 더한 합산액을 `applyCollateralFloor`에 넘기면 자동으로 정합한다
> (`property-valuation.ts:104~124`).

---

## 3. 설계 결정

### 3-1. UI 분기 — 보충평가 토글 내부에 §61 경로 라디오

`real_estate_building` + 보충평가 토글 ON일 때만 `RadioCardGroup`(2지선다) 노출:

1. **"국세청 일괄고시 기준시가 (오피스텔·대규모 상가, §61①3호)"** — 기본값
   → 건물 `StandardPriceInput` 1개(현행) → `standardPrice`. 부수토지 위젯 숨김.
2. **"건물 기준시가 + 부수토지 개별공시지가 분리 (§61①2호·1호)"**
   → 건물 `StandardPriceInput`(`standardPrice`) + **부수토지 `StandardPriceInput`**(propertyKind=토지·개별공시지가,
   area-mode) → `appurtenantLandStandardPrice`

> 라디오 채택 이유: 법령상 두 평가체계가 명확히 구분되고(일괄 vs 분리), 침묵 합산은
> 일괄고시 케이스에서 이중계상을 유발. 토지·주택 카테고리는 변경 없음(이 분기는 건물 전용).
> 부수토지 위젯을 **기존 `StandardPriceInput` 재사용**(propertyKind만 토지로)으로 두어 신규 컴포넌트 0,
> 면적 반올림 일관성도 위젯 내부 처리에 위임(v1 면적 dual-truth 결함 원천 제거).

### 3-2. 엔진 — `evaluateDetachedHouse`만 수정 (실제 호출 함수)

- `evaluateDetachedHouse`(`property-valuation.ts:228`, **실제 호출되는 함수**, `:402` switch 진입)에서:
  `method === "standard_price"`이면
  `amount = (item.standardPrice ?? 0) + (item.appurtenantLandStandardPrice ?? 0)`로 합산 후
  `applyCollateralFloor` 호출.
  breakdown에 "건물 기준시가" / "부수토지 개별공시지가" **2행 분리** + "평가액(합계)" 표시.
- `method !== "standard_price"`(시가·감정·매매사례)면 `appurtenantLandStandardPrice` **무시**(통합액에 이미 포함).
- §61⑤ 임대료환산·§66 담보하한은 합산 후 `amount`로 비교 → 자동 정합.

> ⚠️ `evaluateBuilding`(`property-valuation.ts:262`)은 정의됐으나 switch 미호출 **dead code**.
> 수정·삭제 대상 아님(전역 dead code 정리 금지 정책 — 언급만).

### 3-3. 부담부증여 §159 — 경로 B 분리 안분 (이번 범위)

부담부증여 양도세 계산(`BurdenedGiftTransferSection`)이 `item.standardPrice`를 **양도시(증여시) 건물
기준시가**로 양방향 read한다. 경로 B에서는 `standardPrice`=건물분으로 의미가 정밀해지므로:

- §159① 건물/토지 양도차익 안분에 **건물분=`standardPrice`, 토지분=`appurtenantLandStandardPrice`**를
  각각 공급. 분리 필드라 안분 분자가 정확해진다(단일 합산 시의 왜곡 없음).
- 🔎 `BurdenedGiftTransferSection`가 토지분 기준시가를 어디서 읽는지(현재 단일 `standardPrice` 전제) Do 착수 전
  실측 후, 토지분 read 지점에 `appurtenantLandStandardPrice` 배선. 경로 B + `assumedDebtForGift > 0` 케이스를
  §6 매트릭스로 회귀 가드.

---

## 4. 영향 범위 — 동기화 지점 (CLAUDE.md 8지점 + Zod strip)

| # | 지점 | 파일 | 변경 | 상태 |
|---|---|---|---|---|
| ① | 타입 | `lib/tax-engine/types/inheritance-gift-estate.types.ts` (`standardPrice` :55 인접) | `appurtenantLandStandardPrice?: number`(부수토지 개별공시지가 **총액**) 1필드 추가 | ✅ 확정 |
| ② | initial | EstateItem 팩토리 | optional → 명시 기본값 불필요 | 🔎 팩토리 위치 확인(grep `category:.*real_estate`) |
| ③ | normalize | sessionStorage 마이그레이션 | optional → 자동 호환 | 🔎 확인 필요 |
| **Zod** | **입력 스키마(침묵 strip 게이트)** | `lib/validators/estate-item-schema.ts` (`standardPrice` :30) | `appurtenantLandStandardPrice: z.number().nonnegative().optional()` **필수 추가** + roundtrip 테스트 갱신 | ✅ 위치 확정 · **누락 시 silent strip** |
| ④ | API 변환 | 증여: `lib/calc/gift-api.ts` `buildGiftTaxInput`(`giftItems` :43·88, `.map` spread 보존) / 상속: `lib/calc/inheritance-api.ts:71` `estateItems` passthrough | 둘 다 spread/passthrough → 신규 optional 생존. **Zod 통과가 진짜 게이트** | ✅ 확인 |
| ⑤ | UI 위젯 | `EstateBodyRealEstate.tsx:236~`(보충평가 토글) | §61 경로 `RadioCardGroup` + 경로 B에 **부수토지 `StandardPriceInput`**(propertyKind=토지) → `onTotalPriceChange`→`appurtenantLandStandardPrice` | ✅ 위치·위젯 확정 |
| ⑥ | 사이드바·평가액 직접읽기 | `lib/calc/estate-item-valuation.ts` `computeEffectiveValuation`(:32~35 `marketValue ?? … ?? standardPrice` 직접) · `lib/tax-engine/valuation/resolve-estate-item-value.ts:141` · `inheritance-deduction-suggest.ts`(`getValuatedAmount` :71 등 `item.standardPrice` 직접) · 사이드바 `lib/stores/inheritance-summary.ts`(:100·125) | **자동 반영 아님 — dual-truth 위험.** `method==="standard_price"`일 때 `standardPrice + appurtenantLandStandardPrice` 합산을 **이 지점들에 동일 게이트로** 추가(엔진과 일치). 가능하면 `resolveEngineValuatedAmount` 단일 진실로 위임 통일 | 🔎 **`grep item.standardPrice` 전수 enumerate 후 표 갱신 — silent 실패 위험 최상위** |
| ⑦ | 결과 카드 | `PropertyValuationResult.breakdown` 렌더 | breakdown 2행 자동. **평가조서/별지 양식**이 항목 분해 시 별도 | 🔎 평가조서 양식 확인 |
| ⑧ | validation | 증여: `components/calc/gift-tax-form-validate.ts`(※`lib/calc/gift-validate.ts`는 **부재**) / 상속: `lib/calc/inheritance-validate.ts:148~162` `validateEstateItemAllocations` | **증여**: 단일 수증자라 **협의분할 validate 없음 → ⑧ 신규 차단 없음.** 부수토지 optional(미입력=0). **상속(공유 엔진)**: 협의분할 `expected = resolveEngineValuatedAmount(item)`(:155, 부수토지 합산 포함)이라 UI 표시(⑥)도 합산해야 차단 모순 없음 → **⑥과 단일 진실 통일이 곧 ⑧ 해결** | ✅ 정정(증여=무차단, 상속=⑥ 종속) |

> 🔎 항목은 Do 착수 전 grep 1회로 확정 후 표 갱신(memory `feedback_api_zod_schema_sync`·
> `feedback_explicit_prop_mapping_strip`). 특히 **Zod·⑥** 2곳이 silent 실패 위험 최상위.

---

## 5. Pre-Do Anchor (디자인 환류용 — Do 전 우선 실행)

`__tests__/tax-engine/property-valuation/` 신규 테스트로 **현행 실패 확보**:

```
// 경로 B 일반 상업용 건물 보충평가:
//   standardPrice(건물 기준시가) = 500,000,000
//   appurtenantLandStandardPrice(부수토지 개별공시지가 총액) = 200,000,000  ← 총액 직접(StandardPriceInput onTotalPriceChange)
// 기대: valuatedAmount === 700,000,000
// 현행: 500,000,000 (부수토지 누락) → 실패 확보 → 합산 후 통과
```

추가 anchor:
- 경로 A(일괄고시): `appurtenantLandStandardPrice` 미입력 → `standardPrice` 그대로(이중계상 없음 회귀 가드)
- 시가 입력 시(`method==="market_value"`) `appurtenantLandStandardPrice` 무시(통합액 우선)
- §61⑤ 임대료환산 MAX가 **합산액(7억)** 기준으로 비교(월세 입력 케이스)
- **사이드바 dual-truth 회귀(⑥)**: 부수토지 입력 시 `computeEffectiveValuation`·`computeInheritanceSummary`
  `totalEstate`도 7억(엔진 7억 ↔ 사이드바 5억 괴리 차단)
- **상속 협의분할 validate(⑧)**: 부수토지 입력 + `heirAllocations` 합계 7억 → `validateEstateItemAllocations` 통과
  (⑥ 해결 전 표시값 5억으로 입력 시 차단되는 모순 재현 후, ⑥ 통일로 통과 확인)

> memory `feedback_pre_anchor_verification`·`pre-do-anchor-verification` 스킬 — "현행 일치 예상" 금지.

---

## 6. 테스트 매트릭스 (전수 enumerate)

| 케이스 | standardPrice | 부수토지(총액) | method | 기대 |
|---|---|---|---|---|
| A 일괄고시 | 7억(통합) | 0 | standard_price | 7억 (현행 유지) |
| B 분리 | 5억(건물) | 2억 | standard_price | 7억 (신규) |
| B 부수토지만 | 0 | 2억 | standard_price | 2억 (건물 0 방어) |
| 시가 우선 | 5억 | 2억 | market_value | marketValue (부수토지 무시) |
| 임대료환산 | 5억 | 2억 | standard_price | MAX(7억, 임대료환산) |
| 담보하한 §66 | 5억 | 2억 | standard_price | MAX(7억, 담보채권) |
| 부담부증여 + 경로 B | 5억(건물) | 2억 | standard_price | 평가 7억 · **§159 건물분=5억·토지분=2억 각각 안분 공급**(건물분 축소 왜곡 차단) |

---

## 7. 실행 순서 (PDCA Do — 시퀀셜)

1. **법령 상수**: `legal-codes/inheritance-gift.ts` `VALUATION`에 §61①2호·1호·3호 근거 라벨 확인/보강.
2. **타입 ①**: EstateItem에 `appurtenantLandStandardPrice?: number` 추가.
3. **Zod**: `estate-item-schema.ts` 필드 추가 → roundtrip 테스트(`estate-item-schema-roundtrip.test.ts`) 갱신.
4. **Pre-Do anchor**(§5) 작성 → 현행 실패 확인 → 디자인 환류(사이드바·협의분할 anchor 포함).
5. **엔진**: `evaluateDetachedHouse` 합산 + breakdown 2행.
6. **사이드바·직접읽기 ⑥**: `computeEffectiveValuation`·`resolveEstateItemValue`·deduction-suggest 직접 읽기
   지점 enumerate 후 동일 게이트 합산(엔진 권위값 위임 검토). **dual-truth 차단.**
7. **§159 ⑤추가**: `BurdenedGiftTransferSection` 토지분 read 지점 실측 후 `appurtenantLandStandardPrice` 배선(§3-3).
8. **UI ⑤**: `EstateBodyRealEstate` §61 경로 `RadioCardGroup`(native 금지, tone=emerald, 미선택도 배경 유지) +
   경로 B 부수토지 `StandardPriceInput`(propertyKind=토지).
9. **validation ⑧**: 증여 무차단 확인. 상속은 ⑥ 통일로 협의분할 expected 모순 제거.
10. **결과뷰 ⑦**: breakdown 자동 + 평가조서 양식 영향 확인.
11. **게이트**: `npx tsc --noEmit` 0건 · `npx vitest run __tests__/tax-engine/property-valuation/` ·
    증여/상속 회귀 · E2E(증여 상업용 건물 경로 B + 상속 회귀).
12. **검증**: `ui-engine-sync-checker` + 브라우저 수동(Network body에 `appurtenantLandStandardPrice` 도달 확인).

---

## 8. 잔여 확인 / 주의

- **상속세 동시 적용**: EstateItem은 상속·증여 공유 → 본 변경은 **상속세 보충평가에도 자동 반영**.
  상속 모드 E2E·평가조서(별지) 회귀 포함(memory `project_inheritance_stale_e2e_specs` 주의).
- ~~**부수토지 `StandardPriceInput`의 propertyKind**~~ ✅ **실측 확정(2026-06-22)**: `propertyKind="land"`는
  `isAreaMode=true`(`StandardPriceInput.tsx:77~78`)로 `Math.floor(단가×면적)` 총액을 `onTotalPriceChange`로
  emit(`:109·122·145`). `area` prop 미제어 시 **면적을 내부 state로 관리**(`:84`)하므로 **부수토지 면적 전용
  저장 필드 불필요** — 총액(`appurtenantLandStandardPrice`)만 받으면 됨. 건물 `StandardPriceInput`과 동일 계약.
- **라디오 기본값**: 경로 A(일괄고시) 기본 — 다수가 일괄고시 대상이라는 실무 가정. (사용자 승인 시 확정)
- **§159 토지분 read 지점**(§3-3): 현재 단일 `standardPrice` 전제 코드라 토지분 배선 위치 실측 필요.

---

## 9. 범위 밖 (Scope Out)

- 양도세 `commercial_building`(별도 타입, 3시점 안분) 로직 이식 — 증여는 평가기준일 단일시점이라 불요.
- `evaluateBuilding` dead code 삭제 — 전역 dead code 정리 금지 정책.
- 국세청 일괄고시 기준시가 자동 조회 API 연동 — 본 계획은 수동 입력 합산까지.

---

## 부록 A. 자가검증 must-fix 처리 대장

| # | 심각도 | 결함(v1) | v2 처리 |
|---|---|---|---|
| 1 | critical | §8 대안 A 근거 사실오류(BuildingStdPriceModalButton :271 합산 주입) | §0에서 대안 A 폐기·오류 명시 |
| 2 | high | 대안 A가 '무변경 재사용' 아님 은폐 | §0 — 대안 A 폐기로 소멸 |
| 3 | high | 면적 raw vs rounded dual-truth(LandPriceLookupField) | 위젯을 `StandardPriceInput`(총액 emit)으로 변경 → 면적 위젯 내부 처리, **원천 제거** |
| 4 | high | 위젯 오인(LandPriceLookupField↔StandardPriceInput) | §0·§1·§3 전면 정정 → `StandardPriceInput` |
| 5 | high | ⑧ 협의분할 validate 오귀속 + 부재 파일 인용 | §4 ⑧ — 증여=무차단, 상속=⑥종속으로 정정·`gift-validate.ts` 인용 제거 |
| 잔여 | medium | §159 split 왜곡 | §3-3·§6에 범위 포함(분리 필드로 정밀 안분) |
| 잔여 | medium | BuildingStdPriceForm hedge 과소단정 | §0에서 합산 미수행 **확정**으로 상향 |
| 잔여 | medium | §3-1 라디오→design 추적 | 설계 문서 재정합 시 반영(아래) |

> ⚠️ **설계 문서 재정합 필요**: `docs/02-design/features/gift-commercial-building-appurtenant-land.{engine,ui}.design.md`는
> v1 위젯 전제(LandPriceLookupField·방식 a/b)로 생성됨 → 본 v2 결정(StandardPriceInput·단일 총액 필드)에
> 맞춰 재생성/정정 필요. (engine·ui 시니어 재호출 또는 surgical 정정)
