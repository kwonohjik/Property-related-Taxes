# 미등기 양도(§104①10호) 자산 종류 커버리지 확장 — 계획서

작성일: 2026-08-11 · 대상: 양도소득세 마법사 「보유 상황」 ⑤ 특수 상황

---

## 1. 현상

`/calc/transfer-tax` 「보유 상황」 단계에서 **자산 종류에 따라 「미등기 양도」 토글이 아예 렌더되지 않는다**. 사용자 캡처(일반건물 선택 상태)에서는 ⑤ 특수 상황 카드가 **제목만 남고 내용이 비어** 있다.

### 1.1 원인 — UI 게이트가 3종만 허용

`app/calc/transfer-tax/steps/Step4.tsx:662-676`

```tsx
{/* 미등기 양도 — 주택·토지·건물만 표시 (입주권·분양권은 등기 개념 없음) */}
{(primaryKind === "housing" || primaryKind === "land" || primaryKind === "building") && (
  <ToggleCard checked={form.isUnregistered} ... title="미등기 양도" />
)}
```

같은 파일 `:288-295`가 **표시되지 않는 종류에서는 값을 강제로 되돌린다**:

```tsx
const allowsUnregistered =
  primaryKind === "housing" || primaryKind === "land" || primaryKind === "building";
if (!allowsUnregistered && form.isUnregistered) patch.isUnregistered = false;
```

⇒ 자산 종류 8종 중 **`commercial_building`·`general_building`·`redevelopment_apt` 3종에서 미등기 양도를 입력할 방법이 없다.** 주택→일반건물로 종류를 바꾸면 이미 켠 값도 조용히 꺼진다.

### 1.2 자산 종류 8종 대비표

`components/calc/transfer/asset-labels.ts:10-19` · `AssetSectionBasic.tsx:35-54` 기준.

| assetKind | 화면 라벨 | 현재 토글 | §94① 분류 | 판정 |
|---|---|---|---|---|
| `housing` | 주택 | ✅ | 1호 (건물) | 유지 |
| `land` | 단순토지(나대지,농지,임야) | ✅ | 1호 (토지) | 유지 |
| `building` | 건물(토지 제외) | ✅ | 1호 (건물) | 유지 |
| `commercial_building` | 상업용건물·오피스텔 | ❌ | 1호 (건물+부수토지) | **추가** |
| `general_building` | 일반건물(토지+건물 일괄) | ❌ | 1호 (토지+건물) | **추가** (단 배관이 없어 **Phase C까지 한시 제외** — §4 A-1) |
| `redevelopment_apt` | 재개발/재건축 APT | ❌ | 1호 (완공 신축주택) | **추가** |
| `right_to_move_in` | 입주권 | ❌ | 2호 (부동산을 취득할 수 있는 권리) | 제외 유지 — **Q1** |
| `presale_right` | 분양권 | ❌ | 2호 (동상) | 제외 유지 — **Q1** |

겸용주택은 별도 kind가 아니라 `housing` + `isMixedUseHouse`이므로 **이미 토글이 뜬다**(엔진도 `transfer-tax-mixed-use-totals.ts:187` 70% 단일세율·`transfer-tax-mixed-use-housing.ts:202` 개산공제율 분기 처리).

---

## 2. 법령 근거 (KoreanLaw MCP 원문 확인 — 2026-08-11)

「소득세법」 MST 280405(시행 2026-07-01) · 「소득세법 시행령」 MST 286211(시행 2026-07-01) 직독.

- **법 §104①10호**: 「미등기양도자산 양도소득 과세표준의 100분의 70」
- **법 §104③**: 「제1항제10호에서 "미등기양도자산"이란 **제94조제1항제1호 및 제2호에서 규정하는 자산**을 취득한 자가 그 자산 취득에 관한 등기를 하지 아니하고 양도하는 것을 말한다. 다만, 대통령령으로 정하는 자산은 제외한다.」
- **시행령 §168①**(미등기양도제외 자산): 1호 장기할부조건으로 등기 불가 / 2호 법률의 규정·법원의 결정으로 등기 불가 / 3호 법 §89①2호·조특법 §69①·§70① 토지 / 4호 법 §89①3호 주택으로서 「건축법」 건축허가를 받지 아니하여 등기가 불가능한 자산 / 6호 도시개발사업 미종료 토지 / 7호 체비지 (5호 삭제)

⇒ **§94①1호(토지·건물)에 해당하는 한 자산 종류를 가리지 않는다.** 상업용건물·일반건물·재개발 완공 APT는 모두 1호 자산이므로 미등기 양도가 성립할 수 있고, 현행 UI 게이트에는 **법령상 근거가 없다**.

### 2.1 미해결 — Q1 (입주권·분양권)

§104③은 **2호(부동산에 관한 권리)도 포함**한다. 현행 코드 주석의 「입주권·분양권은 등기 개념 없음」은 소유권이전등기 대상이 아니라는 실무 이해로 보이나, **이번 조사에서 이를 뒷받침하는 예규·판례·집행기준은 확인하지 않았다.** 본 계획은 **현행(제외) 유지**를 전제로 하고, 근거 확보는 별건으로 남긴다. (memory `feedback_no_statute_claim_needs_requirement_article` — 「못 찾았다」≠「없다」)

---

## 3. 엔진 지원 현황 — **경로마다 다르다** (코드 실측)

미등기는 세율(70%)뿐 아니라 **비과세 배제 · 장기보유특별공제 배제 · 기본공제 배제 · 개산공제율 3%→0.3%** 를 동시에 바꾼다. 각 효과의 근거 조문:

| 효과 | 근거 조문 | 코드 상수 |
|---|---|---|
| 70% 단일세율 | 법 §104①10호 | `legal-codes/transfer.ts:70` |
| **비과세 규정 부적용** | **법 §91①** (원문 확인) | `transfer-tax-mixed-use.ts:135`(겸용 경로 주석) |
| 장기보유특별공제 배제 | **법 §95② 본문 괄호** | `legal-codes/transfer-house.ts:313,325` |
| 기본공제 배제 | 법 §103② 관련 rules `excludeUnregistered` | `transfer-tax-helpers.ts:434` |
| 개산공제 3%→0.3% | **시행령 §163⑥1호 단서**(「미등기 3/1000」) | `legal-codes/transfer-nbl.ts:169-171`(0.03 / 0.003) |

> 🔑 **§91① 원문 (KoreanLaw MST 280405 직독, 2026-08-11)**: 「제104조제3항에서 규정하는 미등기양도자산에 대하여는 이 법 또는 이 법 외의 법률 중 양도소득에 대한 소득세의 **비과세**에 관한 규정을 적용하지 아니한다.」
>
> ⚠️ **①항이 배제하는 것은 「비과세」뿐이다.** 조문 표제가 「비과세 **또는 감면**의 배제 등」이라 오독하기 쉬우나, 감면 배제는 ②항(매매계약서 거래가액 허위기재) 사유이고 **미등기를 사유로 한 감면 배제는 §91에 없다**. Q5 배선 시 감면까지 함께 끄면 **법 근거 없는 불리 적용**이 된다(memory `feedback_no_unfavorable_application_without_legal_basis`). 미등기 자산의 감면 배제 여부는 조특법 등 별도 근거를 확인해야 하며 — **본 계획 범위 밖**이다.

### 3.1 경로별 배선 매트릭스

> ✅ **2026-08-11 구현 완료분 반영** — Q5(§91①)·Phase A·Phase B가 머지되었다. 아래 표는 그 이후 상태다.

| 경로 | 세율 70% | **§91① 비과세배제** | LTHD 배제 | 기본공제 배제 | 개산공제 0.3% | UI |
|---|---|---|---|---|---|---|
| 단건 (`housing`·`land`·`building`) | ✅ `transfer-tax-rate-calc.ts:195` | ✅ **신규** `transfer-tax-exemption.ts:checkExemption` 진입부 | ✅ `transfer-tax-lthd.ts:64` | ✅ `transfer-tax.ts:548` | ✅ `transfer-tax-helpers.ts:310` | ✅ |
| 겸용주택 (`housing`+`isMixedUseHouse`) | ✅ `transfer-tax-mixed-use-totals.ts:187` | ✅ `transfer-tax-mixed-use.ts:135-139` | ✅ | ✅ | ✅ `transfer-tax-mixed-use-housing.ts:202` | ✅ |
| `redevelopment_apt` | ✅ 단건 공유 | ✅ 단건 공유(신규) | ✅ 단건 공유 | ✅ 단건 공유 | ✅ `redevelopment.ts:208,364` → `redevelopment-{split,housing-contribution,land-contribution}.ts`가 `estimatedDeductionRate(input.isUnregistered)` 사용 | ✅ **신규** |
| `commercial_building` | ✅ 단건 공유 | (주택 아님 — 무관) | ✅ 단건 공유 | ✅ 단건 공유 | ✅ **신규** `commercial-building-valuation.ts` → `estimatedDeductionRate(input.isUnregistered)` | ✅ **신규** |
| `general_building` (bundled) | ✅ **신규** 카드별 매핑(`general-building-route-cards.ts`) | (주택 아님 — 무관) | ✅ 카드별 | ✅ 카드별 | ✅ **신규** 토지·건물 **각각** `estimatedDeductionRate()` 파생 | ✅ **신규** 2토글 |

**경로 판정 근거(실측)**: `app/api/calc/transfer/route.ts`의 `propertyType` 분기는 **3개뿐**이다 — `:246 land` · `:319 mixed-use-house` · `:392 general_building`. `commercial_building`·`redevelopment_apt` 전용 분기는 **없다** ⇒ 둘 다 generic 단건 경로(`transfer-tax.ts`)를 탄다. 재개발은 엔진 내부에서 `transfer-tax.ts:216 isRedevelopmentActive(...)`로 서브엔진에 분기한다.

- **재개발 APT는 엔진이 (Q5를 제외하면) 완비**돼 있다 — UI 게이트만 열면 동작한다.
- **상업용건물은 단건 엔진을 그대로 타므로** 세율·공제 3종은 즉시 동작하고, **환산 취득 시 개산공제율만** 어긋난다.
- **일반건물은 배관이 전무하다.** bundled 경로는 카드→엔진 매핑에서 `isUnregistered: false`가 **하드코딩**돼 있다(`app/api/calc/transfer/general-building-route-cards.ts:92`). UI만 열면 **세액 변화 0의 no-op**이 된다. (memory `feedback_api_trigger_without_input_path_is_noop`의 대칭 사례)

### 3.2 🔑 동일 성격 정정 선례 — 2026-07-28, 15곳

이 작업은 **처음 발견된 결함이 아니라 그때 남은 잔여분**이다. `lib/tax-engine/legal-codes/transfer-nbl.ts:175-178`:

> §163⑥ 개산공제율 선택 — **미등기양도자산(소득세법 §104③) 여부 단일 판정점**. 각 산출 지점이 `0.03`을 직접 쓰면 미등기 분기가 조용히 누락된다 — 실제로 split·PHD·겸용·재개발 경로 **15곳이 3% 고정**이어서 미등기 자산의 개산공제가 **10배**로 산출됐다(2026-07-28 정정).

⇒ **Phase B·C는 그때의 정정 패턴을 그대로 따른다**: `0.03` 직접 참조를 전부 `estimatedDeductionRate(isUnregistered)` 경유로 바꾼다. GB·CB가 그 스윕에서 빠진 이유는 두 경로가 **율을 인자로 주입받는 구조**(`transfer-tax-api-gb.ts:386`이 `0.03`을 payload로 주입 / CB는 상수 직접 참조)여서 `0.03` 리터럴 grep에 걸리는 형태가 달랐기 때문으로 보인다 — **확인 필요**(정정 커밋 미조회).

또한 코드베이스가 이 갭을 명시적으로 남겨 두었다 — `lib/tax-engine/general-building-valuation.ts:45-51`:

> ⚠️ 현재 미사용: 일반건물·상가 환산 경로는 등기 자산 전제(3% 고정)이며, route helper가 `estimatedDeductionRate: 0.03`을 주입한다. 미등기양도자산을 지원하려면 route helper·validate에서 이 율로 wiring해야 한다.

### 3.1 🔴 이름 충돌 함정 — `gbIsUnregistered`·`cbIsUnregistered`는 §104③이 **아니다**

| 필드 | 실제 의미 | 근거 |
|---|---|---|
| `AssetForm.gbIsUnregistered` (`lib/stores/calc-wizard-asset-gb.ts:65`) | **허가·사용승인 미이행 건축물** → 부속토지 전량 비사업용 | 「지방세법 시행령」 §101① 단서 (`GeneralBuildingNblSection.tsx:83-90`) |
| `AssetForm.cbIsUnregistered` (`lib/stores/calc-wizard-asset-cb.ts:123`) | 동상 | `CommercialAppurtenantLandSection.tsx:77-84` |
| GB payload `isUnregistered` (`general-building-route-actual.ts:180` → `judgeAppurtenantLandExcess`) | 동상 (NBL 판정 입력) | `lib/tax-engine/appurtenant-land-excess.ts:27` — 주석이 직접 명시: 「입력 플래그 이름은 `isUnregistered`이나 의미는 "허가·사용승인 미이행" 전반이다」 |

⇒ **GB 배선에 기존 `isUnregistered` 키를 재사용하면 NBL 판정을 조용히 오염시킨다.** 신규 키는 반드시 다른 이름(`unregisteredTransfer`)으로 만든다. (memory `feedback_ui_mode_flag_not_domain_semantics`)

### 3.2 부수 갭 — 컴패니언(2번째 이후) 자산

Zod(`lib/api/transfer-tax-schema-sub.ts:319`)와 엔진 매핑(`app/api/calc/transfer/bundled-split-helpers.ts:246`)에는 **자산별 `isUnregistered`가 이미 있으나, 이를 쓰는 입력 UI가 없다**(컴패니언 카드 grep 0건). 항상 `false`로 고정된다. 폼-전역 `form.isUnregistered`는 **주 자산에만** 적용된다.

본 계획의 **Phase D(선택)** 로 분리한다 — 사용자가 지적한 현상(주 자산 종류별 미표시)과는 별개 축이고, 컴패니언 카드 전반의 자산-수준 입력 정책과 함께 봐야 한다.

---

## 4. 구현 계획

### Phase A — UI 게이트 확장 (핵심, 이것만으로 2종 동작)

**A-1.** `Step4.tsx:662-676` 렌더 조건 확장. 하드코딩 3종 나열 대신 **제외 목록(블랙리스트)** 으로 뒤집는다 — 신규 자산 종류가 추가될 때 조용히 빠지는 것을 막는다. (사이드바 `canPreviewEstimated`에서 같은 전환을 이미 한 선례 — 2026-08-11)

```ts
// 「소득세법」 §104③ — §94①1호(토지·건물) 자산이면 종류를 가리지 않는다.
// 제외 3종:
//   - right_to_move_in·presale_right : §94①2호 권리 (근거 미확정 — Q1)
//   - ""                             : assetKind 미선택 방어. 화이트리스트가 갖고 있던
//                                      성질이라 블랙리스트 전환 시 명시하지 않으면 사라진다
//                                      (`Step4.tsx:67` — `assetKind ?? ""`).
//   - general_building               : ⚠️ **Phase C 완료까지 한시 제외**. 배관이 없어
//                                      토글을 열면 세액이 전혀 안 변하는 no-op이 된다.
//                                      C 머지와 **같은 PR에서** 이 줄을 제거한다.
const UNREGISTERED_EXCLUDED_KINDS = [
  "", "right_to_move_in", "presale_right",
  "general_building", // TODO(Phase C): 배선 완료 시 제거
] as const;
const allowsUnregistered = !UNREGISTERED_EXCLUDED_KINDS.includes(primaryKind);
```

**A-2.** `Step4.tsx:288-295` 리셋 `useEffect`가 **같은 술어를 공유**하도록 한다(별도 재정의 금지 — memory `feedback_shared_predicate_argument_parity`). 위 상수를 모듈 스코프로 올려 두 지점이 함께 읽는다.

**A-3.** ⑤ 특수 상황 카드가 **전 종류에서 비지 않는지** 확인. 게이트 확장 후에도 입주권·분양권에서는 카드가 비므로, 그 경우 「해당 항목 없음」 안내를 넣을지 판단 — **범위 밖으로 두고 별건 제안**(현행 동작 유지).

**A-0 (선행 게이트).** **Q5(§91① 비과세 배제)를 anchor U-5로 먼저 판정한다.** 미배선으로 확인되면 재개발 APT를 여는 것이 「미등기 + 1세대1주택 비과세」 조합을 신규 활성화해 **과소과세**를 만든다 — 그 경우 §91① 배선이 Phase A의 일부가 된다(§7 Q5).

**검증**: `commercial_building`은 A만으로 **세액 계산**(세율 70%·LTHD 배제·기본공제 배제)이 즉시 정상화된다(주택이 아니라 Q5 무관) → anchor로 세액 변화 실측. `redevelopment_apt`는 Q5 판정 후.

⚠️ 단 **환산 취득 시 개산공제율(3%)과 사이드바 프리뷰(0.3%)가 어긋난 채 남는다** — 세액은 맞지만 표시가 틀린다(§5.1). 그래서 B와 함께 내보낸다.

### Phase B — 상업용건물 환산 개산공제율 배선

`commercial-building-valuation.ts:302·401`의 `ESTIMATED_DEDUCTION_RATE.LAND_BUILDING` 직접 참조를 `estimatedDeductionRate(input.isUnregistered)`(`legal-codes/transfer-nbl.ts:183`) 경유로 바꾼다 — **2026-07-28 15곳 정정과 동일 패턴**(§3.2). 근거는 「소득세법 시행령」 §163⑥1호 단서.

- ⑫⑬⑭: `commercialBuildingValuation` 서브객체(`lib/calc/transfer-tax-api-helpers.ts:buildCommercialBuildingValuation`)에 §104③ 플래그를 **새로 넘길 필요가 있는지 먼저 확인**한다 — 엔진 input에 폼-전역 `isUnregistered`가 이미 도달해 있으면(단건 경로) 서브엔진 호출부에서 그대로 내리는 것으로 충분하다. **호출부 실측 후 확정**(추정 금지).
- 미등기 + 환산 취득의 동시 성립이 §168① 제외 사유에 걸리는 경우는 UI가 판단하지 않는다(사용자 입력 그대로).

### Phase C — 일반건물(bundled) §104③ 배선

#### 🔑 C-0. 등기 여부는 **토지·건물 각각** 판단한다 (2026-08-11 설계 정정)

일반건물은 「토지+건물 일괄」이지만 **토지와 건물은 별개 부동산이고 등기부도 별도**다. 건물만 미등기(무허가 신축 등)이고 토지는 등기된 조합이 실무에서 흔하고, 그 반대도 성립한다. §104③의 「그 자산 취득에 관한 등기를 하지 아니하고 양도」도 **자산별**로 읽힌다.

⇒ **단일 boolean으로는 표현할 수 없다.** GB는 폼-전역 `form.isUnregistered`를 쓰지 않고 **자산-수준 2필드**를 갖는다.

| 축 | 필드 | 영향 카드 |
|---|---|---|
| 토지 | `gbLandUnregistered` | `land_business` · `land_nbl` |
| 건물 | `gbBuildingUnregistered` | `building` · 증축 건물2 (**C-6 확인 필요**) |

✅ **엔진 구조가 이미 이를 받아들일 준비가 돼 있다** — `general-building-valuation.ts:237-242`의 `calculateEstimatedDeduction`이 개산공제를 `landDed`·`buildingDed`로 **이미 분리 산출**한다(주석: 「토지는 §99①1호 가목(개별공시지가), 건물은 나목(국세청장 산정)으로 **별도 공시**라 결합 총액 개념이 없다」). 단일 `rate` 파라미터를 `landRate`·`buildingRate`로 쪼개면 되고, 그 외 산식은 손대지 않는다.

⚠️ **§104⑤ 재평가**: 한쪽만 미등기면 토지 카드와 건물 카드가 **서로 다른 세율군 버킷**으로 갈린다(`classifyRateGroup`이 `isUnregistered`를 최우선 분기로 두므로 — `transfer-tax-aggregate-helpers.ts:61`). Q3가 「미등기는 70% 비례세율이라 합산해도 동일」로 단순히 닫히지 않는다 — **한쪽만 미등기인 케이스가 진짜 검증 대상**이다.

#### C-1~C-6 작업

**토지·건물 카드 각각**에 해당 축의 플래그를 건다.

1. **①②③ 폼**: `AssetForm`(`lib/stores/calc-wizard-asset-gb.ts`)에 `gbLandUnregistered`·`gbBuildingUnregistered` 2필드 + `makeDefaultAsset` 초기값 `false` + `calc-wizard-asset-migrate-phase3.ts` normalize fallback(stale sessionStorage 가드).
   - ⚠️ **기존 `gbIsUnregistered`와 이름이 위험할 만큼 가깝다** — 그쪽은 「지방세법 시행령」 §101① 단서의 **허가·사용승인 미이행**(NBL 축)이다(§3.1). 신규 2필드 JSDoc에 이 구분을 명시한다. Q2(개명)는 별건.
2. **⑤ UI**: ⑤ 특수 상황의 단일 「미등기 양도」 토글은 GB에서 계속 숨긴다(폼-전역 `isUnregistered`를 GB가 쓰지 않으므로). 대신 **토지·건물 2토글**을 배치한다 — 위치는 GB 자산 카드(파트별 입력이 모여 있는 곳) 또는 ⑤ 안의 GB 전용 블록. **UI 시니어 판단 필요**.
3. **⑫ Zod**: `lib/api/transfer-tax-building-schemas.ts`의 GB payload에 `unregisteredLand`·`unregisteredBuilding` 추가. **기존 `isUnregistered`(NBL·:108,560)와 별개 키**임을 주석으로 못박는다. 개산공제율도 `estimatedDeductionRate` 단일 → `landEstimatedDeductionRate`·`buildingEstimatedDeductionRate` 2필드.
4. **⑬ API 변환**: `lib/calc/transfer-tax-api-gb.ts` — 2필드 전달 + `:386`의 `estimatedDeductionRate: 0.03`을 파트별 `estimatedDeductionRate(gbLandUnregistered)` / `(gbBuildingUnregistered)`로.
   - ⚠️ `lib/calc/transfer-tax-api-gb-shares.ts:50`의 GB 필드 화이트리스트(지분 경로)에도 신규 키를 **전부** 등록해야 침묵 strip을 피한다.
5. **⑭ Route 매핑**: `app/api/calc/transfer/general-building-route-cards.ts:92`의 `isUnregistered: false` 하드코딩을 **카드별** 매핑으로 교체(`land_*` → 토지 플래그, `building`·증축 → 건물 플래그). **`general-building-route-actual.ts`(실가)·`general-building-route-helper.ts`(환산) 두 경로가 이 파일을 공유**하므로 한 곳 수정으로 양쪽이 덮인다 — **양쪽 anchor로 확인**.
6. **엔진 율 분리**: `general-building-valuation.ts:229·330`의 단일 `rate` 파라미터를 `landRate`·`buildingRate`로 분리. `calculateEstimatedDeduction`은 이미 `landDed`/`buildingDed`를 나눠 산출하므로 **인자만 갈라 주면 된다**. `general-building-extension.ts:63`(증축)도 동일.
7. ~~**§104⑤ 그룹핑 (Q3)**~~ ✅ **종결(2026-08-11) — 기존 anchor가 이미 잠그고 있다.**
   GB bundled은 두 경로 모두 `calculateTransferTaxAggregate`를 탄다(`general-building-route-actual.ts:572` · `general-building-route-helper.ts:419`) ⇒ `classifyRateGroup`(`transfer-tax-aggregate-helpers.ts:57-61`)에 도달한다. 그 뒤 규칙은 `aggregate-progressive-clause-104-5.anchor.test.ts`가 **두 케이스 모두** 고정해 두었다:

   | anchor | 케이스 | 규칙 |
   |---|---|---|
   | **B-39**(`:127`) | 미등기 2건 | 같은 호(10호) **합산 1회** — floor 1원으로 판별(자산별이면 140,000,000, 합산이면 **140,000,001**) |
   | **B-40**(`:135`) | 누진 1건 + 미등기 1건 | 호가 다르므로 **버킷 분리 후 자산별 합**(68,980,000 + 70,000,000 = 138,980,000) |

   ⇒ GB의 두 시나리오(양쪽 미등기 / 한쪽만 미등기)가 그대로 대응된다. **새 anchor 불필요.** 전제는 「토지 카드와 건물 카드를 **별개 자산**으로 본다」인데, 토지·건물은 별개 부동산이고 신고서도 행을 나누므로 §104⑤2호 「자산별」(= 호별 합산, 기재부 재산세제과-536) 해석과 정합한다.
   - memory `project_transfer_104_5_model_a_defect` · `project_transfer_104_5_short_term_part_bucket` 참조.

#### C-6. 착수 전 판정이 필요한 항목

| ID | 질문 | 왜 중요한가 |
|---|---|---|
| **C-6a** | **증축 건물2 카드는 원건물과 같은 등기 축인가?** 증축은 통상 표시변경등기라 별도 소유권보존등기가 아니다 — 원건물 플래그를 따르는 것이 맞아 보이나 미확인 | 틀리면 3파트 중 하나가 잘못된 율·세율로 계산된다 |
| ~~**C-6b**~~ ✅ | **판정(2026-08-11): 카드 구조 변경 불필요.** `calcTax` T-1(`transfer-tax-rate-calc.ts:194-205`)은 미등기면 **§104① 후단 비교 없이 70%로 조기 반환**하고 `candidateClauses`도 `104-1-10` 하나만 싣는다. GB 맥락에서는 결과가 옳다 — 경쟁 호가 8호(비사업용, 최고 55%)·§104④3호(지정지역 비사업용, 8호+10%p = 최고 65%)뿐이라 **70%가 항상 승자**다 | — |
| 🟡 (범위 밖 기록) | 위 조기 반환은 **§104⑦ 다주택 중과**(§55① 최고 45% + 30%p = **75%**)와 겹칠 때는 70%를 골라 과소가 될 수 있다. 다만 §104① 후단은 문언상 「①항 각 호」 간 비교이고 ⑦항과의 우열은 명문이 없다. **GB는 주택이 아니라 이 계획의 범위 밖** — memory `project_transfer_104_1_latter_short_term`(🟠 재검토 필요) 축과 연결해 별건으로 다룰 것 | 미판정 |
| **C-6c** | 미등기 + 환산 취득의 동시 성립이 §168① 제외 사유(장기할부·법원 결정 등)에 걸리는 경우 UI가 판단하지 않는다 | 현행 정책 유지(사용자 입력 그대로) — Q4와 동일 축 |

### Phase D — 컴패니언 자산-수준 미등기 입력 (선택 · 별건 권고)

§3.2 갭. Zod·엔진은 준비돼 있고 UI만 없다. 본 작업과 분리해 진행할 것을 권고한다.

---

## 5. 14개 동기화 지점 점검표

| # | 지점 | Phase A | Phase B | Phase C |
|---|---|---|---|---|
| ① 폼 상태 | 기존 `form.isUnregistered` 재사용 — 변경 없음 | – | – |
| ② initial | 변경 없음 (`calc-wizard-store.ts:299`) | – | – |
| ③ normalize | 변경 없음 | – | – |
| ④ API 변환 | 변경 없음 (`transfer-tax-api.ts:415`) | 확인 | **신규** (`transfer-tax-api-gb.ts`) |
| ⑤ UI 위젯 | **수정** (`Step4.tsx:662`) | – | – |
| ⑥ 사이드바 | 🔴 **불일치 위험** (아래) | **해소** | **해소** |
| ⑦ 결과 카드 | 확인 — `MultiTransferPropertyBreakdown.tsx:81` 「미등기」 라벨 有 | – | 확인 |
| ⑧ validation | 확인 — 현행 미등기 전용 게이트 없음(grep 0건) | – | GB validate |
| ⑨⑩ Zod enum | 변경 없음 | – | – |
| ⑪ 자산-수준 fallback | – | – | 확인 |
| ⑫ Zod 입력 객체 | 변경 없음 (`transfer-tax-schema.ts:133`) | 확인 | **신규 키** |
| ⑬ body spread | 변경 없음 | 확인 | **신규 + shares 화이트리스트** |
| ⑭ Route 엔진 매핑 | 변경 없음 (`route.ts:334`) | 확인 | **하드코딩 제거** |

### 5.1 🔴 ⑥ 사이드바 — Phase A 단독 ship 시 표시 불일치

`lib/stores/calc-wizard-store.ts:566-577`의 필요경비 프리뷰는 **자산 종류를 가리지 않고** 환산·감정 모드이면 `formData.isUnregistered ? 0.003 : 0.03`을 적용한다.

⇒ Phase A만 머지하고 B·C를 미뤄 두면, 상업용건물·일반건물 환산 자산에서 **사이드바는 0.3%로 미리보기를 그리는데 엔진 결과는 3%로 계산**된다. 계산 전후 값이 10배 어긋난 채 표시된다.

- 이것이 **Phase A와 B를 같은 PR로 묶는 실질 근거**다(§8).
- 다만 프리뷰가 실제로 그려지려면 `a.standardPriceAtAcq`가 CB/GB 자산에서 채워져 있어야 한다 — **미확인**. Phase B 착수 시 실측할 것(비어 있으면 프리뷰 자체가 0이라 불일치가 드러나지 않는다).

---

## 6. Pre-Do anchor (착수 전 작성 — 정책 강제)

「현행 엔진 일치 예상」 가정 금지. 아래 anchor 5건 중 **U-5·U-1·U-2 3건을 Phase A 착수 전에** 작성·실행해 설계 환류 기회를 확보한다(U-3는 Phase B, U-4는 Phase A 구현과 함께).

| ID | 대상 | 단언 | 기대 |
|---|---|---|---|
| **U-1** | `redevelopment_apt` + `isUnregistered: true` 단건 엔진 호출 | 세율 70% 적용 · LTHD 0 · 기본공제 0 · 개산공제 base×0.3% | **통과 예상**(엔진 기배선) — 실패하면 Phase A 범위가 커진다 |
| **U-2** | `general_building` bundled + `isUnregistered: true` | 세액이 미등기 OFF 대비 **변화** | **현행 실패 예상**(하드코딩 `false`) — Phase C 착수 근거이자 완료 판정선 |

> ⚠️ **U-1 픽스처 주의**: 재개발 APT는 **주택**이다. 1세대1주택 요건을 충족하는 픽스처를 쓰면 비과세로 세액이 0이 되어 위 네 단언이 **전부 무의미**해진다(Q5가 미배선이면 미등기여도 0이 나온다). **비과세 미해당 조건**(다주택 또는 보유·거주 요건 미충족)을 픽스처에 명시적으로 고정할 것.

⚠️ U-2는 **mutation probe 성격**이다. 「변화 없음」이 정상 동작으로 오독되지 않도록 **양성 대조군**(단건 `building` 자산 동일 조건)을 같은 spec에 둔다. (memory `feedback_negative_assertion_needs_mutation_probe`)

추가 anchor:
- **U-3**: `commercial_building` 환산 취득 + 미등기 → 개산공제가 `기준시가 × 0.3%`인지 (Phase B 완료선)
- **U-4**: 자산 종류를 `general_building` → `presale_right`로 바꾸면 `isUnregistered`가 `false`로 리셋되는지 (A-2 회귀 — 기존 `__tests__/calc/transfer-nbl-assetkind-stale-gate.test.ts` 확장. 그 파일은 같은 `useEffect`의 자매 케이스(`isNonBusinessLand` stale 전송)를 이미 다룬다)
- **U-5 🔴 (Phase A 선행 게이트)**: `housing` + 1세대1주택 요건 충족 + `isUnregistered: true` → **비과세가 배제되는가**(§91①). `transfer-tax.ts`에서 `isUnregistered`는 **548행(기본공제) 단 1곳**이고 `transfer-tax-exemption.ts`에는 0건이므로 **미배선이 의심**된다. 겸용 경로에는 있다(`transfer-tax-mixed-use.ts:135-139`).
  - ⚠️ **mutation probe 필수** — 「세액이 0이 아니다」만 보면 다른 이유(요건 미충족)로 통과할 수 있다. 미등기 OFF에서 **비과세가 실제로 성립하는 입력**을 대조군으로 같은 spec에 두고, ON에서만 과세로 뒤집히는지 본다. (memory `feedback_negative_assertion_needs_mutation_probe`)

### 6.1 기존 테스트 자산 — 없는 것은 **E2E뿐**

엔진 단위 anchor는 이미 여럿 있다. 신설 전에 재사용·확장을 우선 검토한다:

| 파일 | 다루는 것 |
|---|---|
| `__tests__/tax-engine/transfer/lthd-exclusion-reason.anchor.test.ts:35` | 미등기 → LTHD 배제 사유 |
| `__tests__/tax-engine/transfer-tax-aggregate.test.ts:521` | 다건 집계에서의 미등기 |
| `__tests__/tax-engine/transfer/aggregate-progressive-clause-104-5.anchor.test.ts:73` | §104⑤ 미등기 버킷 |
| `__tests__/tax-engine/transfer/short-term-104-1-latter-open.anchor.test.ts:192` | 단기 ↔ 미등기 교차 |
| `__tests__/tax-engine/multi-parcel-transfer.test.ts:141,228` | 다필지 미등기 |

⇒ **없는 것은 브라우저 플로우 E2E다**(`e2e/`에서 §104③ 미등기 토글을 켜는 spec 0건 — 매칭되는 `isUnregistered: false`는 전부 폼 시드값이고, `허가·사용승인 미이행`을 켜는 spec들은 「지방세법 시행령」 §101① 단서 축이라 별개다). Phase A 완료 시 「상업용건물 선택 → ⑤ 특수 상황에 미등기 토글 표시 → 계산 → 70% 세율」 1건을 신설한다.

---

## 7. 리스크 / 판단이 필요한 지점

| ID | 내용 | 판단 |
|---|---|---|
| **Q1** | 입주권·분양권 제외의 법적 근거 미확보 (§2.1) | 현행 유지 · 근거 확보는 별건 |
| **Q2** | GB 신규 키 이름 `unregisteredTransfer` — 기존 `isUnregistered`(NBL) 쪽을 개명하는 편이 근본이나, 사용처가 UI·API·엔진·테스트에 걸쳐 있어 **Surgical Changes 원칙상 범위 밖** | 신규 키만 추가 · 기존 개명은 별건 제안 |
| **Q3** | §104⑤ 자산별 산출세액 비교에서 미등기 파트가 별도 버킷이 되는 것이 GB 3파트 구조와 정합한지 | Phase C에서 **법령 검토 선행** 후 착수 |
| **Q4** | 미등기 + §168① 제외 사유(장기할부·법원결정 등) 입력 UI 부재 — 사용자가 제외 대상인데 토글을 켜면 과대 계산 | 본 계획 범위 밖 · ⑤ 카드 hint로 제외 사유 안내만 검토 |
| ~~**Q5**~~ ✅ | **확정 후 해소(2026-08-11)** — anchor U-5로 실증했다. `checkExemption`에 미등기 게이트가 없어 **미등기 주택 + 1세대1주택 = 세액 0**이었다(과소과세). U-5a 대조군이 비과세 성립을 먼저 증명해 probe 유효성을 확보했고, 배선 후 3건 GREEN. **기존 6,036 테스트가 전혀 깨지지 않았다 — 이 조합을 다루는 테스트가 애초에 없었다는 뜻**(사각지대) | 해소 — `transfer-tax-exemption.ts` `checkExemption` 진입부에 게이트 추가. **감면은 건드리지 않았다**(§91①은 비과세만) |
| **Q6** | §3.2 선례(2026-07-28 15곳 정정)에서 GB·CB가 빠진 이유를 커밋으로 확인하지 않았다 — 의도적 유보였는지 누락이었는지 | 착수 시 `git log -S "estimatedDeductionRate"` 로 확인. 의도적 유보였다면 그 근거를 먼저 읽을 것 |

---

## 8. 실행 순서 / 진행 상황

### ✅ 완료 (2026-08-11)

| 항목 | 내용 | 검증 |
|---|---|---|
| **Q5 해소** | §91① 미등기 비과세 배제를 `checkExemption` 진입부에 배선 | `unregistered-91-1-exemption-bar.anchor.test.ts` 3건 |
| **Phase A** | `Step4.tsx` 게이트를 화이트리스트 → **제외 목록**으로 전환. 렌더 조건과 리셋 `useEffect`가 상수 공유 | `e2e/transfer-unregistered-asset-kind-gate.spec.ts` 3건 (+mutation probe 확인) |
| **Phase B** | CB 환산 개산공제율을 `estimatedDeductionRate(isUnregistered)` 경유로 전환 | `commercial-unregistered-lump-sum-rate.anchor.test.ts` 3건 |
| 회귀 | 전체 vitest **14,898 통과** · `tsc` 0 · `lint` 0 error | — |

⇒ **상업용건물·재개발 APT에서 미등기 양도 입력이 가능해졌다.** 일반건물은 배관 미완이라 한시 차단 상태다.

부수 확인: GB는 UI가 잠겨 `formData.isUnregistered`가 항상 `false`이므로 사이드바 프리뷰(3%)와 엔진(3%)이 일치한다 — §5.1의 표시 불일치는 **현재 발생하지 않는다**. Phase C에서 UI를 열 때 `transfer-tax-api-gb.ts:386`을 함께 고쳐야 이 정합이 유지된다.

### ✅ Phase C 완료 (2026-08-11) — 토지·건물 축 분리

| 항목 | 내용 |
|---|---|
| **설계 변경** | 사용자 지적으로 **단일 boolean → 토지·건물 2축**으로 바꿨다. 둘은 별개 부동산·별개 등기부이고, 건물만 미등기(무허가 신축)인 조합이 실무에서 흔하다. 증축분(건물2)은 건물 축을 따른다(민법 §256 부합) |
| **①②③ 폼** | `gbLandUnregistered`·`gbBuildingUnregistered` + factory 초기값 + migrate normalize |
| **⑤ UI** | ⑤ 특수 상황 안 2토글 + 「미등기 파트만 70%」 안내. GB는 폼-전역 `isUnregistered` 미사용 |
| **⑫⑬⑭** | Zod 2필드 · payload 빌더 `unregisteredFields`(**환산·실가 두 경로 모두**) · 지분 화이트리스트 · 카드별 매핑(`land_*`→토지, `building*`→건물) |
| **엔진** | `rate` 단일 인자 → `landRate`·`buildingRate`. **율 payload 필드 폐지** — 율은 미등기 여부의 함수라 엔진이 파생한다(이중 소스 제거) |
| **파일 분리** | Step4 812줄 초과 → `step4-sections/SpecialSituationSection.tsx` 추출(696줄 착지) |
| 검증 | 전체 vitest **14,914** · GB·CB E2E **63** · anchor U-2a~d · U4 가드 GREEN · tsc 0 · lint 0 error |

**Q6 규명**: 2026-07-28 정정(`75a6f29c`)이 GB·CB를 빠뜨린 것은 의도적 유보가 아니라 **오판**이었다 — 커밋 본문이 「일반건물·상가는 지켰다」고 적고 있다. 그때 세운 U4 구조 가드도 둘을 못 잡았다: (a) 정규식이 **숫자 리터럴만** 봐서 CB의 상수 참조를 놓쳤고, (b) 스캔 범위가 `lib/tax-engine`뿐이라 GB의 `lib/calc` 주입이 범위 밖이었다. ⇒ **가드를 두 축 모두 확장**했다(`unregistered-lump-deduction-rate.test.ts` U4).

**🔴 Phase B가 만든 신규 갭을 Phase C에서 잡았다**: `previewCommercialBuildingEstimated`(사이드바 프리뷰)가 엔진 input을 **화이트리스트로 재조립**하는데 `isUnregistered`가 빠져 있었다 ⇒ 미등기 CB에서 **프리뷰 3% vs 결과 0.3%**(10배). 타입이 잡아주지 않는 자리다. 배선 + anchor U-3d(mutation probe로 실효성 확인) 추가.
GB 프리뷰(`previewGeneralBuildingEstimated`)는 **같은 payload 빌더를 재사용**하므로 자동 정합했다.

### ✅ Q1 종결 (2026-08-11) — 현행 제외가 옳다

**분양권·입주권은 부동산등기법상 등기할 수 있는 권리가 아니다**(채권적 권리). §104③의 「그 자산 취득에 관한 등기를 하지 아니하고 양도」라는 요건이 성립할 수 없다.

⚠️ **검색되는 판례 4건에 속지 말 것** — 「분양권의 양도가 **아닌** 미등기 양도자산으로 보아」(서울행정법원 2012구단1276)·「분양권이 미등기양도제외자산에 해당 여부」(대법원 2007두15865 심리불속행) 등은 **자산 종류의 실질 판정** 사안이다. 잔금을 (거의) 완납하고 목적물이 완성된 상태에서 등기 없이 판 경우 실질을 **부동산의 미등기 양도**로 재구성한 것이지, 분양권 자체에 §104③을 적용한 것이 아니다.

⇒ UI도 정합한다: 그런 사안이면 자산 종류를 **주택/건물**로 고르고 미등기를 켜면 되고, 현행 게이트가 이미 그 조합을 지원한다.

§94①2호 **나목(지상권)·다목(전세권·「등기된」 부동산임차권)** 은 등기 대상이라 §104③이 적용될 수 있으나, 앱에 해당 자산 종류가 없어 범위 밖이다.

### ✅ Phase D 완료 (2026-08-11) — 컴패니언 자산-수준 미등기

⑫Zod(`transfer-tax-schema-sub.ts:319`)·⑭엔진 매핑(`bundled-split-helpers.ts:246`)은 **이미 있었는데** ⑬payload 빌더(`buildAssetPayload`)가 값을 싣지 않아 컴패니언 미등기가 **항상 false**였다. 입력 UI도 없었다.

| 지점 | 내용 |
|---|---|
| ①②③ | `AssetForm.isUnregistered` + 초기값 + stale 세션 가드 |
| ⑤ UI | 자산 카드 ① 기본정보에 chip 토글 — **`!isFirst`(컴패니언)에만**. 주 자산은 폼-전역 값을 Step4 ⑤에서 받으므로 여기 두면 dual-truth |
| ⑬ | `buildAssetPayload`에 `isUnregistered: asset.isUnregistered` |
| 검증 | anchor 4건(두 축 독립성 포함 · mutation probe 확인) + E2E 2건 |

컴패니언 `assetKind` enum은 `housing|land|building` 3종으로 **전부 §94①1호 자산**이라 종류 게이트가 필요 없다(지분 분할 GB는 companion 경로를 쓰지 않는다 — `transfer-tax-schema-sub.ts:289`).

### ⏭️ 남은 작업

**Q2**(`gbIsUnregistered`·`cbIsUnregistered` 개명) · **C-6c**(§168① 제외 사유 UI 미판단 — Q4와 동일 축)

> ⚠️ **Q2 착수 시점 주의**: 워크트리 `transfer-fb-lthd-95-4-latter`가 locked 상태로 병렬 진행 중이다(PR #1193 분기). 이 개명은 폼·payload·엔진 leaf·Zod에 걸쳐 12파일 50곳이고 legacy sessionStorage 마이그레이션까지 필요해, 병렬 작업의 머지를 어렵게 만든다. **기능 변화는 0**이므로 그 작업이 끝난 뒤가 안전하다.

🟡 **범위 밖 기록**: `calcTax` T-1의 미등기 70% 조기 반환이 §104⑦ 다주택 중과(최고 75%)와 겹칠 때의 우열은 명문이 없다(§7 C-6b 주). GB는 주택이 아니라 이번 범위 밖 — memory `project_transfer_104_1_latter_short_term` 축과 함께 별건으로.

### (참고) 착수 시점의 권고 순서

1. **Pre-Do anchor U-5 → U-1 → U-2 순으로 작성·실행**
   - **U-5가 먼저**다 — 결과에 따라 Phase A의 범위 자체가 바뀐다(Q5). 미배선이면 §91① 배선이 A에 들어오고, 배선돼 있으면 A는 UI 2줄 수정으로 끝난다.
   - U-1·U-2는 Phase A·C의 완료 판정선을 미리 고정한다.
2. **PR 1 = Phase A + B** (UI 게이트 + 상가 개산공제율)
   - 묶는 이유는 편의가 아니라 **§5.1 표시 불일치**다. A만 내보내면 상가 환산 자산에서 사이드바(0.3%)와 결과(3%)가 10배 어긋난다.
   - 이 PR 시점에 열리는 것은 **상업용건물 + (U-5 통과 시) 재개발 APT** 2종. 일반건물은 A-1 상수에서 한시 제외된 상태다.
3. **PR 2 = Phase C** (일반건물 배선) — Q3(§104⑤ 그룹핑) 법령 검토 선행. **같은 PR에서 A-1의 `general_building` 한시 제외를 제거**해 UI와 배관이 동시에 열리게 한다.
4. Phase D · Q1 · Q2 · Q6은 별건

**근거**: PR 1(A+B)로 사용자가 지적한 현상의 2/3(상업용건물·재개발 APT)가 해소된다. 일반건물을 함께 열면 **UI는 켜지되 세액이 안 변하는 no-op 토글**을 사용자에게 노출하게 되므로, 배관이 준비될 때까지 잠가 둔다.
