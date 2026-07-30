# 별개취득 취득시 기준시가 — 읽기전용 패널 제거 · 파트별 게이팅 · 자본적지출 검증

작성일 2026-07-30 · 대상 `assetKind ∈ {housing, building}` + 「토지·건물 취득일 다름」 ON (별개취득)

## 0. 요청 3건 (원문 기준)

| # | 요청 | 판정 |
|---|---|---|
| A | 별개취득 토글 ON일 때 상단 「취득시 기준시가 (원)」 3열 읽기전용 패널을 **완전히 숨김** | 변경 필요 |
| B | 필요경비 개산공제는 **환산으로 계산된 파트**에서 산정된 취득시 기준시가를 base로 적용 | **엔진은 이미 정본** — 다만 그 정책과 모순되는 **실가 파트 기준시가 강제 요구**가 있음 → 수정 필요 |
| C | 자본적지출이 실가 모드에서 반영되고 환산 모드에서 배제되는지 | **오류 없음 (실측 확인)** — 코드 수정 불요, UI 안내만 |

---

## 1. 실측 근거 (추정 없음 — throwaway probe `calcSplitGain` 직접 호출)

공통 입력: `building` 자산, 양도 5억(구분양도 토지 3억·건물 2억), 토지 취득 2025-01-08 / 건물 취득 2025-08-29, 건물 취득시 기준시가 99,960,000, 건물 양도시 기준시가 98,280,000.

| probe | 조건 | 결과 |
|---|---|---|
| A1 | 토지=실거래가, 건물=환산 · **토지 공시지가·면적 미입력** | **throw** — "환산·감정·매매사례 취득가액 계산에는 취득시 ㎡당 개별공시지가와 토지 면적이 필요합니다" |
| A2 | 위 + 토지 공시지가 1,000,000원/㎡ × 100㎡ | 정상. 토지 개산공제 **0**, 건물 개산공제 **2,998,800** (= 99,960,000 × 3%) · `apportionRatio 50:50` 산출됨(**어디에도 소비 안 됨**) |
| B | 양쪽 실거래가 + 토지 자본적지출 1천만·건물 2천만 | `land.directExpenses 10,000,000` / `building.directExpenses 20,000,000` → **양도차익에서 전액 차감** |
| C | 토지=실가, 건물=환산 + 양쪽 자본적지출 | 토지 `directExpenses 10,000,000` 차감 / 건물 `directExpenses 0` + `appraisalDeduction 2,998,800` → **환산 파트는 §97②2호 가목(환산+개산공제) 채택, 자본적지출 배제** |

### 1.1 요청 B — 엔진은 이미 파트별 정본

`transfer-tax-split-gain.ts:464-482`

```
landNonActual  = landMode  !== "actual"   → landAppraisalDed  = computeEstimatedDeduction(landStdAtAcq, 3%, 지분)
buildingNonActual = buildingMode !== "actual" → buildingAppraisalDed = computeEstimatedDeduction(buildingStdAtAcq, 3%, 지분)
```

`landStdAtAcq`·`buildingStdAtAcq`는 `calcAcqStdPair`(:47-74)가 별개취득 + 건물 기준시가 명시 입력 시 **파트 독립**으로 반환한다(:62-66, 결합 총액 미참조). 즉 **환산 파트의 자기 기준시가 × 3%** 가 이미 정본이며 실가 파트는 0이다(probe A2·C 확인).

### 1.2 요청 B에서 드러난 실제 결함 — 실가 파트의 기준시가 강제

`requiresAcqStdPrice`(`lib/calc/transfer-tax-split-acq-mode.ts:262-280`) 1절이 **파트를 구분하지 않는다**:

```ts
// ① 환산 분자 · ② 개산공제 base · ⑧ echo · ⑨ lumpDeductionBase
if (ctx.landMode !== "actual" || ctx.buildingMode !== "actual") return true;
```

`calcAcqStdPair`도 토지분이 산출 불가면 **쌍 전체를 null**로 만든다(:54 `if (landStd == null) return null`). 결과:

- **토지=실거래가 + 건물=환산**(= 첨부 이미지13의 화면 상태)에서 토지 공시지가·면적이 계산 어디에도 쓰이지 않는데 **필수**가 된다.
  - 취득가액: 토지는 입력 실가, 건물은 자기 기준시가 비율 환산 → landStd 불요
  - 양도가액: 구분양도 입력값 또는 양도시 기준시가 비율 → landStd 불요
  - 개산공제: 파트별 자기 base → landStd 불요
  - 안분비율(`apportionRatio`)은 산출되지만 **소비 지점이 없다**(probe A2)
- 미입력 시 엔진 throw(A1) + validate V5 차단(`transfer-tax-validate-split.ts:219-226`).

이는 요청 B의 정책("환산 파트의 기준시가만 개산공제 base")과 정면으로 어긋나는 잔존 요구다.

### 1.3 요청 C — 오류 없음

`applyAssetSwap`(:575-599) 판정이 법령대로다.

| 파트 모드 | 자본적지출 | 근거 |
|---|---|---|
| 실가(actual) | **전액 차감**(`effectiveDirect = directExp`, 개산공제 0) | §97①2호 필요경비 |
| 환산(estimated) | 가목(환산취득가 + 개산공제) vs 나목(자본적지출) **택일(max)** — 나목이 크면 swap, 아니면 **0** | §97②2호 단서 |
| 감정·매매사례 | 본문만(개산공제), 자본적지출 배제 | §97②2호 단서는 환산 전용 |

배관도 정상: `transfer-tax-api-split.ts:140-146`이 `landDirectExpenses`/`buildingDirectExpenses`를 전송하고, `ratioed`(:24-30)가 미입력·0을 `undefined`로 만들어 `applyAssetSwap`의 `explicitDirect` 판정(:488·:496)이 "명시 입력"만 true가 된다. Zod(`lib/api/transfer-tax-schema.ts:270·272`) · route(`app/api/calc/transfer/route.ts:268-269`) 모두 배선됨.

⚠️ 용어 정정: 자본적지출은 **취득가액에 산입되지 않는다** — 취득가액과 별개인 필요경비(§97①2호)로 양도차익에서 차감된다. 세액 효과는 동일.

**남는 문제는 UI 안내**: `LandBuildingSplitSection.tsx:485-493`의 자본적지출 칸은 "모드·양도 방식과 무관하게 항상 입력 가능"하며 hint가 "토지에 귀속되는 자본적지출만 입력"뿐이다. 환산 파트에 입력해도 대부분 반영되지 않는(가목 채택) 사실이 어디에도 표시되지 않아 "입력했는데 세액이 안 변한다"는 오인을 부른다.

---

## 2. P1 — 자산 전체 취득시 기준시가 블록 **완전 숨김** (요청 A)

### 대상
- `components/calc/transfer/CompanionAcqPurchaseBlock.tsx:595-601` — `<SplitAcqStdReadonlyPanel>` 렌더 블록 삭제
- `components/calc/transfer/SplitAcqStdReadonlyPanel.tsx` — 유일 호출부가 사라지므로 **파일 삭제**

### 부수 정리 (내가 만든 고아만)
- `SplitAcqStdReadonlyPanel` import(:31)
- **`showAcqStdReadonly`(:203) 변수 삭제** — 정의가 `= isSeparateAcq` 뿐이고 남는 사용처는 총액 블록 게이트(:602) 한 곳이다. 패널이 사라지면 이름("readonly 표시")이 거짓이 되므로 `acqStdPriceRequired && !isSeparateAcq`로 인라인한다. (초판은 "리네임 불요"라고 썼으나, 변수 자체가 불필요해지는 것이 맞다.)
- `__tests__/components/split-building-acq-std-readonly.test.tsx`(155줄) — 파일 전체가 "읽기 전용 파생 전환"(폐기된 설계)의 anchor다. **파일명·헤더 주석·기대값을 새 불변식으로 재작성**한다: 별개취득에서 `split-acq-std-readonly` **및** 자산 전체 총액 블록(`acq-std-required-mark`·`StandardPriceInput`)이 **모두 0개**, 파트 카드만 존재. 삭제만 하면 총액 블록 재출현 회귀 안전망이 사라진다.
- `e2e/split-mode-gating.spec.ts:191·379` — §6-4 참조.

### 확정 불변식 — "읽기 전용 전환"이 아니라 **완전 숨김**

2026-07-30 사용자 재확인: 별개취득에서 자산 전체 취득시 기준시가 블록은 **읽기 전용 파생 표시로 대체하는 것이 아니라 아예 노출하지 않는다**. 종전 Phase 3 설계(`transfer-split-part-std-card-gating.plan.md` §6 — "입력형 → 읽기 전용 파생으로 전환")는 **폐기**한다.

**불변식**: `isSeparateAcquisition === true` 이면 자산 전체 레벨에 취득시 기준시가 UI가 **0개**다.
- 입력형 총액 블록(`StandardPriceInput`, :602-638) → 이미 `!isSeparateAcq` 게이트로 미노출
- 읽기 전용 3열 패널 → 이번에 삭제
- 취득시 기준시가 입력은 **파트 카드 안에서만** 존재(토지: `split-land-std-acq-card` / 건물: `split-building-std-acq-card`)

### 판단 근거
패널은 파생 표시라 **계산·전송에 관여하지 않는다**(값은 파트 카드가 보유). 삭제해도 엔진 입력은 불변이며, 오히려 "합계 = 개산공제·안분 비율의 base"라는 hint(`SplitAcqStdReadonlyPanel.tsx:57`)가 파트별 독립 정책(§1.1)과 어긋나 있었다 — 실제 base는 합계가 아니라 **각 파트의 자기 기준시가**다(probe A2).

⚠️ 문서·주석·테스트 파일명에 남은 "읽기 전용 파생으로 대체" 서술은 **현행 코드 설명**이며 이번 변경으로 전부 무효가 된다. 갱신 대상: `CompanionAcqPurchaseBlock.tsx:191-203`(주석) · `transfer-tax-api-split.ts:109-112`(주석) · `transfer-tax-validate-split.ts:136-139`(V6 주석) · `__tests__/components/split-building-acq-std-readonly.test.tsx`(파일 목적 자체).

---

## 3. P2 — 취득시 기준시가 요구·노출을 **파트별**로 (요청 B의 귀결)

### 3.1 결정 — **안 ① 확정** (2026-07-30 사용자 확정)

| | 안 ① 요구만 완화 (엔진·validate) | 안 ② 요구 + UI 카드까지 파트별 |
|---|---|---|
| 엔진 | 파트별 필요 판정 | 동일 |
| validate | 파트별 차단 | 동일 |
| UI 토지 카드 | 토지 실가라도 **건물이 환산이면 노출**(선택 입력) | 토지가 실가면 무조건 **숨김** |
| 장점 | 건물 기준시가 계산 모달 prefill 소스 보존 | 화면에서 불필요 입력 완전 제거 |
| 위험 | 화면에 "계산에 안 쓰이는 칸"이 남음 | **입력 경로 소실(dead-end) 위험** — 아래 참조 |

⚠️ 두 안 모두 **양쪽 실가 + 안분 근거 있음(케이스 1)에서는 토지 카드를 숨긴다** — 현행 동작이자 E2E가 이미 검증하는 회귀선이다(§3.2 (4)). 안 ①의 "노출"은 **건물이 환산인 조합에 한정**된다.

**dead-end 위험(안 ②)**: 별개취득 + 건물 환산 조합에서 파트 토지 카드는 `standardPricePerSqmAtAcq`·`acquisitionArea`의 **유일한 입력 경로**다(자산 전체 `StandardPriceInput` area 모드는 별개취득에서 숨겨지고 — §2 불변식 —, `SalesCaseSection:92`의 면적 칸은 매매사례 모드 전용). 두 값은 **건물 기준시가 계산 모달의 prefill**로도 쓰인다 — `LandBuildingSplitSection.tsx:207`(`landAreaM2`) · `:212`(`acqLandPricePerSqm`, 위치지수 소스). 카드를 숨기면 건물 환산에 필요한 위치지수·부속토지 값을 모달 안에서 수기로만 넣게 된다.

→ **안 ① 확정**. 요청 B의 실질(개산공제 base·필수 요구)을 충족하면서 dead-end를 만들지 않는다. 실가 파트의 기준시가 카드는 **노출을 유지하되 필수(`*`)를 해제**하고, hint를 다음으로 전환한다:

> 토지가 실거래가여서 취득가액 계산에는 쓰이지 않습니다. 「건물 기준시가 계산」의 위치지수 산정에만 사용됩니다.

미입력 상태로도 계산이 성공해야 한다(현행은 throw — §1.2).

### 3.2 구현 — 안 ① 기준

**(1) 술어 파트별 분해** — `lib/calc/transfer-tax-split-acq-mode.ts`

```ts
/** 안분 비율(양쪽 std 필요)이 소비되는가 — 기존 2·3·4절 */
function needsApportionRatio(a, ctx): boolean {
  if (!ctx.isSeparate && empty(a.landAcquisitionPrice) && empty(a.buildingAcquisitionPrice)) return true;
  if (!ctx.hasSaleRatio && empty(a.landTransferPrice) && empty(a.buildingTransferPrice)) return true;
  if ((a.expenses ?? 0) > 0 && empty(a.landDirectExpenses) && empty(a.buildingDirectExpenses)) return true;
  return false;
}

/** 그 파트의 취득시 기준시가가 실제로 쓰이는가 */
export function requiresAcqStdPricePart(part: "land" | "building", a, ctx): boolean {
  const mode = part === "land" ? ctx.landMode : ctx.buildingMode;
  return mode !== "actual" || needsApportionRatio(a, ctx);
}

/** 기존 API 보존 — 어느 한쪽이라도 필요하면 true */
export function requiresAcqStdPrice(a, ctx): boolean {
  return requiresAcqStdPricePart("land", a, ctx) || requiresAcqStdPricePart("building", a, ctx);
}
```

기존 `requiresAcqStdPrice`의 시그니처·의미를 보존하므로 **다른 호출부는 회귀 0**이다(UI 상위 게이트·validate V3/V6가 그대로 동작).

**(2) 엔진 — 파트별 산출 허용** `lib/tax-engine/transfer-tax-split-gain.ts`

- `calcAcqStdPair` 반환형을 `{ land: number | null; building: number | null; buildingDerived: boolean } | null` 로 완화. **분기 순서가 결정적**이다(구현 중 회귀 29건으로 확인 — §7 참조):
  1. **별개취득 + 건물분 명시 입력** → `{ land: landStd(널 가능), building: buildingStd, buildingDerived: false }`
  2. **레거시 역산 시도** — `landStd != null && 총액 > 0`이면 `{ land, building: 총액 − land, buildingDerived: true }`.
     ⚠️ **별개취득이라도 건물분 미입력이면 이 분기로 후퇴한다** — 초판은 "별개취득은 역산 경로 없음"으로 잘못 단정했다. 총액 전송 차단은 UI 경로(`transfer-tax-api-split.ts`)의 성질일 뿐이고, 엔진을 직접 호출하는 경로·기존 anchor는 총액을 넘긴다.
  3. **역산 불가 + 별개취득** → `{ land: landStd, building: buildingStd ?? null, buildingDerived: false }` (파트별 부분 산출).
     비-별개취득은 총액 안분이 전제라 부분 산출이 무의미하므로 **종전대로 쌍 전체 null**.
- `stdPriceDerivedFromTotal`(결과 fine-print)은 **산출 지점이 반환하는 `buildingDerived`를 그대로 쓴다** — 호출부가 조건을 재구성하면 분기가 늘 때마다 어긋난다(초판은 `isSeparate !== true`로 재구성했다가 2번 분기를 놓쳤다).
- `calcApportionRatio`(:85-92)는 **둘 다 non-null일 때만** 비율을 산출(그 외 null) — 안분 소비부는 술어가 이미 차단하므로 도달 불가.
- throw 게이트(:366-387)를 파트별로 분해:
  ```
  requiresAcqStdPricePart("land", …)     && landStd     == null → throw(토지분 문구, §99①1호 가목)
  requiresAcqStdPricePart("building", …) && buildingStd == null → throw(건물분 문구, §99①1호 나목)
  ```
  기존 에러코드(`INVALID_INPUT`)는 유지하되 **어느 파트인지 명시**한다(사용자가 어느 칸을 채울지 알 수 있게).
- `landStdAtAcq`/`buildingStdAtAcq`의 `?? 0` fallback(:397-398)은 유지 — 위 게이트가 소비 경로의 non-null을 보증하므로 0 침묵 산출이 불가능하다.
- **`note` 문구 정정(:558-561)** — 초판 누락. 현행은 `landRatio == null`이면 무조건 `"파트별 실지거래가액 — 기준시가 안분 미적용"`인데, P2 이후 **토지 실가 + 건물 환산**에서도 이 분기에 진입한다. 건물이 환산인데 "파트별 실지거래가액"은 거짓이다 → `"파트별 개별 산정 — 기준시가 안분 미적용"` 등 모드 중립 문구로 교체한다. (양쪽 실가 케이스만 종전 문구를 유지하려면 파트 모드로 분기.)

**(3) validate 파트별** `lib/calc/transfer-tax-validate-split.ts`

- V3(:120-134) all-or-nothing: 게이트를 `requiresAcqStdPricePart("land", …)` 로 좁힌다 — 건물분만 필요한 조합에서 토지 3요소를 함께 요구하면 **안 ①에서도 "칸은 있으나 불필요 입력 강제"** 가 된다.
- V6(:144-156): `requiresAcqStdPricePart("building", …)` 로 교체.
- V5(:219-226): 같은 이유로 `requiresAcqStdPricePart("land", …)`.
  ⚠️ **V5는 별개취득 경로에서 이미 도달 불가**다(초판 미기재). V6가 `buildingStd == null`을 먼저 차단하고, V3가 `buildingStd != null`일 때 토지 3요소를 먼저 차단하므로, V5에 도달하는 시점엔 3요소가 이미 채워져 있다. **삭제하지 않고 게이트만 맞춘다** — 비-별개취득 경로 확장이나 V3/V6 조건 변경 시 되살아나는 안전망이고, 제거는 요청 범위 밖이다.
- V3를 좁힌 뒤에도 V3 ⊄ V5 관계(메시지 차별성: "건물분을 입력하면 토지분도")는 유지하므로 **V3는 존치**한다. 기존 anchor 2건이 환산 모드로 V3를 검증하므로(`transfer-tax-validate-split.test.ts:353-365`) 좁히기 후에도 통과한다.

**(4) UI** `components/calc/transfer/LandBuildingSplitSection.tsx` · `CompanionAcqPurchaseBlock.tsx`

- 파트 술어는 **호출부(`CompanionAcqPurchaseBlock`)가 1회 계산해 주입**한다(기존 `acqStdPriceRequired` 주입과 같은 규약 — 하위 재파생 금지, `LandBuildingSplitSection.tsx:70-74` 주석). **`Props`에 `acqStdRequiredLand` · `acqStdRequiredBuilding` 2개를 추가**하고 기존 `acqStdPriceRequired`는 존치(다른 게이트가 사용).
- `showBuildingStdPrice`(:352) = `isSeparateAcq && acqStdRequiredBuilding && !isPhdBothEstimated && …`
- `showLandStdPrice`(:338-347) = `isSeparateAcq && (acqStdRequiredLand || buildingAcqMode === "estimated") && !isPhdBothEstimated && …`
  - 뒤 항은 **건물 기준시가 계산 모달의 prefill 소스**(`landAreaM2` :207 · `acqLandPricePerSqm` :212) 확보용이며, 이때 카드는 **필수 표시 없이** hint를 전환한다: "토지가 실거래가여서 취득가액 계산에는 쓰이지 않습니다. 「건물 기준시가 계산」의 위치지수 산정에만 사용됩니다."
- ⚠️ **케이스 1(양쪽 실가 + 안분 근거 있음)에서는 토지 카드가 계속 숨겨져야 한다** — 초판 미기재 제약. `e2e/split-mode-gating.spec.ts:379-390`이 이미 `split-land-std-acq-card` → `toHaveCount(0)`을 검증한다. 위 식은 `acqStdRequiredLand=false` + `buildingAcqMode="actual"` 이므로 false가 되어 이 회귀를 지킨다.

### 3.3 3절(양도가액 안분 fallback) — **후속 PR에서 폐지 완료** (2026-07-30)

`requiresAcqStdPrice` 3절은 엔진이 2026-07-29에 취득시 비율 후퇴를 폐지(`transfer-tax-split-gain.ts` `effectiveSaleLandRatio = saleRatio?.land ?? null`)한 뒤에도 남아 있어, 양도가액 미입력 시 **계산에 쓰이지 않는** 취득시 기준시가를 요구했다. 본 PR에서는 범위 밖으로 두었으나 별도 PR에서 제거했다:

- 술어에서 ⑤절 삭제 + `AcqStdPriceNeedContext.hasSaleRatio` 제거(유일 소비처가 3절이었다). 전달 지점 5곳(엔진·UI·validate 3) 정리.
- **차단 구멍 없음** — 구분양도는 V4, 일괄양도는 V7이 담당하고, 엔진 `splitPair`가 "양도가액을 토지·건물로 나눌 수 없습니다"로 막는다. 오히려 오류 메시지가 **실제 원인(양도가액)** 을 가리키게 됐다.
- 기대값을 반전한 테스트 3건(컴포넌트 G3·R7, E2E U10·U11·U13·P6의 "기본 진입 → 카드 노출" 전제)은 전부 3절이 만들던 거짓 요구에 의존하던 것이다. G6′는 폐지.
- anchor: `__tests__/calc/acq-std-predicate-sale-clause-removal.test.ts` (8건 — 술어 4절 회귀 포함).

### 3.4 V5 dead branch (기록만 — 조치 불요)

별개취득 경로에서 V6가 `buildingStd == null`을, V3가 `buildingStd != null`일 때 토지 3요소를 먼저 차단하므로 V5에 도달하는 시점엔 3요소가 이미 채워져 있다. **삭제하지 않고 게이트만 맞춘다** — V3/V6 조건이 바뀌거나 비-별개취득 경로가 확장되면 되살아나는 안전망이다.

---

## 4. P3 — 자본적지출 (요청 C): 코드 수정 없음, 안내만

`LandBuildingSplitSection.tsx:485-493`

- 각 파트의 자본적지출 `FieldCard` hint를 파트 모드에 따라 분기:
  - 실가: 현행 유지("토지/건물에 귀속되는 자본적지출만 입력")
  - 환산: **"환산취득가 파트는 「환산취득가 + 개산공제」와 「자본적지출」 중 큰 쪽만 필요경비가 됩니다 (소득세법 §97②2호). 입력값이 작으면 반영되지 않습니다."**
  - 감정·매매사례: "개산공제(§163⑥)가 적용되어 자본적지출은 차감되지 않습니다."
- `ToneCard`/`FieldCard` hint 슬롯만 사용 — 새 컴포넌트·상태 없음.

---

## 5. 영향 파일 · 14 동기화 지점

| 지점 | 영향 |
|---|---|
| ①②③ 폼 상태·initial·normalize | **변경 없음** (신규 필드 없음) |
| ④⑬ API 변환 | **변경 없음** — 전송 게이트는 `isSplitActive`/`separateAcquisition` 기준이며 술어 변경과 무관 |
| ⑤ UI 위젯 | `LandBuildingSplitSection`(게이트·hint), `CompanionAcqPurchaseBlock`(패널 제거·술어 주입) |
| ⑥ 사이드바 | 변경 없음 |
| ⑦ 결과 카드 | `stdPriceAtAcq` echo·개산공제 표시는 변경 없음(파트 모드 게이트 유지). **`SplitGainResult.note` 문구만 정정**(§3.2 (2)) — 토지 실가 + 건물 환산에서 "파트별 실지거래가액"이 거짓이 된다 |
| ⑧ validate | V3·V5·V6 파트별 전환 |
| ⑨⑩⑪⑫⑭ Zod·route | **변경 없음** (신규 필드 없음) |

신규 엔진 input 필드가 없으므로 ⑫⑬⑭ 침묵 strip 위험 없음. 단, **P2 (2)의 반환형 변경이 `calcAcqStdPair` 호출부 전수**(현재 `calcApportionRatio`·`calcSplitGain` 2곳)에 반영됐는지 grep 자가점검 필수.

---

## 6. 검증 계획 (성공 기준)

1. **anchor 선작성** — `__tests__/tax-engine/transfer-tax/split-acq-std-part-gating.test.ts`
   - T1: 토지=실가 + 건물=환산, **토지 공시지가·면적 미입력** → throw 없이 산출, 건물 개산공제 = 건물 기준시가 × 3%, 토지 개산공제 0 (**현행 A1은 throw — 이 테스트가 수정 전 red**)
   - T2: 토지=환산 + 건물=실가, 건물 기준시가 미입력 → 토지분만으로 정상 산출
   - T3: 양쪽 환산 → 양쪽 기준시가 필수(둘 중 하나 없으면 해당 파트 명시 throw)
   - T4: 회귀 — A2·B·C probe 수치 고정(건물 환산취득가 203,418,803 / 개산공제 2,998,800 / 실가 파트 자본적지출 전액 차감 / 환산 파트 0)
   - T5: `note` — 토지 실가 + 건물 환산에서 "실지거래가액" 문구가 나오지 않을 것
   - T6: 레거시 역산 경로 회귀 — 비-별개취득(겸용·`selfOwns≠both` 취득일 동일)에서 토지 3요소 미입력 시 **종전대로 null 반환**(반환형 완화가 이 분기에 새지 않음)
2. `npx vitest run __tests__/tax-engine/transfer-tax/ __tests__/calc/` (~36초) → 통과
3. `npx vitest run __tests__/components/` — 패널 제거 스펙 갱신 반영
4. `npx playwright test e2e/split-mode-gating.spec.ts` — 29건 전부 통과. 교체·유지 항목:
   - :191 · :379 `split-acq-std-readonly` **toBeVisible → 삭제**, 대신 **`toHaveCount(0)`** 단언으로 전환(§2 불변식 "자산 전체 레벨 기준시가 UI 0개"를 명시 검증 — 단순 삭제하면 총액 블록 재출현 회귀를 놓친다)
   - :387-390 `split-land-std-acq-card` `toHaveCount(0)`(케이스 1) — **그대로 통과해야 함**(§3.2 (4) 제약)
   - :189 `split-building-std-acq` toBeVisible — 그대로
5. `npx tsc --noEmit` 0건
6. `npm run test:transfer` 세목 회귀
7. **브라우저 수동 확인**: 이미지13 상태(토지 실거래가 + 건물 환산취득가) 재현 → 상단 3열 패널 부재 · 토지 공시지가 미입력 상태로 계산 성공 · 결과 화면 건물 개산공제만 표시

## 6.1 구현 결과 (2026-07-30 완료)

| 항목 | 결과 |
|---|---|
| anchor `split-acq-std-part-gating.test.ts` | 신규 18건 — 작성 시 11건 red(T4·T6 회귀선만 green) → 구현 후 18/18 green |
| 전체 vitest | **1111파일 12,411건 통과** (skip 14 · todo 1) |
| E2E `split-mode-gating.spec.ts` | **31/31 통과** (기존 29 + 이미지13 시나리오·자본적지출 안내 2건 신규) |
| `npx tsc --noEmit` | 0건 |
| lint(변경 파일) | 0 errors — 사전 존재 미사용 import 2건(`parseAmount`·`applyRate`)은 `eslint --fix`가 같은 줄의 사용 중 import를 지우는 함정(루트 CLAUDE.md)을 피하려 선제 정리 |

**구현 중 발견한 계획 오류 2건**(초판 → 정정):

1. **레거시 역산 차단이 회귀였다** — 별개취득에서 `buildingStd != null` 조건을 제거해 역산 경로를 끊자 **29건이 깨졌다**(`unregistered-lump-deduction-rate` 등, 엔진 직접 호출 anchor가 총액을 넘긴다). §3.2 (2)의 3단 분기로 정정.
2. **`stdPriceDerivedFromTotal` 재구성 오류** — 호출부에서 `isSeparate !== true`로 다시 만들었더니 "별개취득이지만 역산으로 후퇴" 조합을 놓쳤다. 산출 지점이 플래그를 직접 반환하도록 변경.

**기대값을 갱신한 기존 테스트 8건**(전부 의도된 정책 변경 — 축소가 아니라 이동):

| 테스트 | 변경 |
|---|---|
| `split-acq-std-gate-case-a` b-1 | throw 문구 `/개별공시지가/` → `/건물분/` (실제로 비어 있는 파트를 지목) |
| `transfer-tax-validate-split` V4 2건 | 토지 실가 케이스는 토지 3요소 미요구로 전환 + **토지 환산 케이스를 신설**해 all-or-nothing 불변식 보존 |
| `split-input-flow-reorder` R5·R6·R7 | 자산 전체 라벨 존재 → **0개 + 파트 카드 존재**로 검증 대상 이동 |
| `split-part-std-card-gating` G6 | 건물 실가면 건물 카드 0개 + **G6′ 신설**(일괄양도로 안분 비율이 소비되면 다시 필요) |
| `split-part-std-card-gating` G7 | "자산 전체 ↔ 파트 카드 동시 노출" → "별개취득이면 자산 전체는 **항상** 0개" |

## 7. 리스크

| 리스크 | 대응 |
|---|---|
| `calcAcqStdPair` 반환형 완화가 레거시 역산 경로(주택 동시취득 등)에 파급 | 별개취득 아닌 경로는 기존 분기(:68-73) 그대로 두고, null 허용은 **별개취득 + 파트 독립 분기에만** 적용 |
| 술어 분해로 UI 노출/validate/엔진 3자가 어긋남 | 세 계층 모두 **같은 `requiresAcqStdPricePart`** 를 import(재기술 금지) — 기존 dual-truth 회피 규약 준수 |
| E2E 패널 단언 제거로 "총액 블록 재출현" 회귀를 놓침 | 대체 단언에 **자산 전체 총액 블록 부재**(`acq-std-required-mark` 미존재 등)를 반드시 포함 |
| 안 ② 선택 시 `acquisitionArea` 입력 경로 소실 | 안 ② 채택 시 별도 단계로 대체 입력 경로 확보 후 진행 |
