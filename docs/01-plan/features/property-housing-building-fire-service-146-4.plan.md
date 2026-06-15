# 재산세 주택 건축물분 소방분 (§146④ 단서) 구현 계획서

> 작성일: 2026-06-16 · 세목: 재산세(property) · 후속 갭 #3 (마지막)
> worktree: `.claude/worktrees/housing-bldg-fire` (branch `feat/property-housing-bldg-fire-146-4`, origin/master 12acd89d 기준)
> 근거: 지방세법 §146④ 단서 + §104 3호 + §110①2호 (KoreanLaw MCP 본문 검증 완료)

## 1. 배경 — 무엇이 미구현인가

재산세 후속 갭 #3(마지막). 소방분 지역자원시설세(§146③)는 §146④에 의해 **건축물·주택·선박**(§104 2호·3호·5호)에 과세되나, 현행 엔진은 **건축물(`objectType==="building"`)만** 소방분을 산출하고 **주택의 건축물 부분은 0원**으로 누락.

현행 코드 실측(worktree):
- `property-tax-surtax.ts:105-107` — `baseFireTax = objectType === "building" ? calcRegionalResourceTax(publishedPrice) : 0`. **주택(3호)·선박(5호) 누락.**
- 즉 주택은 지방교육세·도시지역분만 부가, **건물분 소방분 미과세** → 실제보다 과소 산출.

> 본 계획은 **주택(3호) 건축물 부분 소방분**만 구현. 선박(5호) 소방분은 별도 사전 갭(범위 외, §9).

## 2. 법령 근거 (검증 완료)

### 지방세법 §104 (MST 282559) — 과세대상 정의
- **2호 건축물** / **3호 주택**(주택법 §2①1호 — 토지+건축물 통합 개념, "토지와 건축물의 범위에서 주택은 제외") / **5호 선박**

### 지방세법 §146④ (MST 282559, 시행 2026-04-24)
> 제3항의 건축물 및 선박은 **제104조제2호, 제3호 및 제5호**에 따른 건축물 및 선박으로 하며, 그 과세표준은 제110조에 따른 가액 또는 시가표준액으로 한다.
> **다만, 주택의 건축물 부분에 대한 과세표준은 제4조제2항을 준용하여 지방자치단체의 장이 산정한 가액에 제110조제1항제2호에 따른 공정시장가액비율을 곱하여 산정한 가액으로 한다.**

→ **소방분 과세대상에 주택(3호) 포함.** 주택 건축물 부분 소방분 과세표준 = **(지자체장이 §4② 준용 산정한 건축물 부분 가액) × §110①2호 공정시장가액비율**.

### §110①2호 공정시장가액비율 (주택)
- 60% (일반). 단 2026 1세대1주택: 시가표준액 3억↓ 43% / 6억↓ 44% / 6억↑ 45% (시행령 §109①2호 단서).

## 3. 계산식 (정수 연산)

```
// 주택(objectType === "housing") + housingBuildingValue 입력 시
housingFireTaxBase = applyRate(housingBuildingValue, fairMarketRatio)  // §146④ 단서: 건물분가액 × §110①2호 비율
regionalResourceTax = calcRegionalResourceTax(housingFireTaxBase)       // §146③1호 6구간 누진
// housingBuildingValue 미입력 → 주택 소방분 0 (기존 동작 유지)
```
- `fairMarketRatio` = calcTaxBase가 산정한 주택 FMR(60% 또는 1세대1주택 43~45%). §146④ 단서 "§110①2호 비율"과 동일 → 엔진 기존 값 재사용. **§110③ 상한과 무관**: 상한은 과세표준(effectiveTaxBase)을 제한할 뿐 `fairMarketRatio`(비율) 자체는 불변 → 소방분 과세표준에 영향 없음.
- **§110③ 과세표준상한제 무관**: §146④ 단서는 건물분가액 × **비율(§110①2호)**만 참조 — §110③ 상한이 적용된 과세표준이 아니라 원 건물분가액 기준. (재산세 본세 과세표준상한과 소방분 과세표준은 별개)
- **화재위험 중과(§146③2호·2의2호) 미적용**: 시행령 §138①·②는 "주거용이 **아닌**" 건축물 대상 → 순수 주택은 base 소방분만. (housing은 multiplier 1 고정)
- **신규 입력 필요**: `housingBuildingValue`(주택 건축물 부분 시가표준액). 주택공시가격(publishedPrice = 토지+건물 통합)과 별개 — 건물 부분만.

### Anchor 예시 (주택 건물분 1.5억, 일반주택 60%)
| 항목 | 값 |
|---|---|
| 소방분 과세표준 | 150,000,000 × 60% = **90,000,000** |
| §146③1호 base | 49,100 + (90,000,000 − 64,000,000) × 12/10,000 = 49,100 + 31,200 = **80,300** |
| 미입력 시 | 주택 소방분 **0** (기존) |

## 4. 입력 설계

```ts
// PropertyTaxInput
/** 주택 건축물 부분 시가표준액 (원) — 주택 소방분 지역자원시설세 과세표준(§146④ 단서, §4② 지자체장 산정).
 *  objectType==="housing" 전용·선택. 미입력 시 주택 소방분 미산출. */
housingBuildingValue?: number;
```
- UI: 주택 분기에서 `CurrencyInput`(직전연도 공시가격 §110③ 입력란 인근). hint: "주택 건축물 부분 시가표준액(재산세 고지서·주택가격 공시의 건물분). 입력 시 건물분 소방분(지역자원시설세) 산출. 미입력 시 미산출."

## 5. 파이프라인 통합 위치

`calcSurtax`가 소방분을 산출하는 지점에 주택 분기 추가. 주택 과세표준은 orchestrator에서 FMR 적용 후 전달(calcSurtax는 FMR 미보유):

```ts
// orchestrator(property-tax.ts:710 인근) — housing FMR 적용
// fairMarketRatio는 calcTaxBase(Step 1)가 반환한 주택 비율(§110③ 상한과 무관 — ratio 자체는 불변).
const housingFireServiceTaxBase =
  input.objectType === "housing" && input.housingBuildingValue != null
    ? applyRate(input.housingBuildingValue, fairMarketRatio)
    : undefined;

const surtaxResult = calcSurtax(
  determinedTax, effectiveTaxBase, input.publishedPrice,
  input.objectType, input.isUrbanArea ?? false, input.fireHazardClass,
  housingFireServiceTaxBase,   // ← 신규 7번째 (주택 건물분 소방분 과세표준, 변수명=param명 통일)
);
```
```ts
// calcSurtax — 소방분 분기 확장
const baseFireTax =
  objectType === "building"
    ? Math.max(0, calcRegionalResourceTax(publishedPrice))           // 건축물(2호) — 시가표준액 직접
    : objectType === "housing" && housingFireServiceTaxBase != null
      ? Math.max(0, calcRegionalResourceTax(housingFireServiceTaxBase)) // 주택(3호) — 건물분 × FMR
      : 0;
const fireHazardMultiplier =
  objectType === "building" ? resolveFireHazardMultiplier(fireHazardClass) : 1; // 주택은 중과 없음
```
- **legalBasis**: 주택 소방분 산출 시에도 `PROPERTY.REGIONAL_RESOURCE_TAX` push (현재 building만 → housing+산출 시 추가).
- orchestrator 4호출 중 **non-land 공통 경로(710)만** 전달(land early-return 무관).

## 6. 동기화 지점 (재산세 8지점 + Zod)

| # | 지점 | 파일·위치 | 작업 |
|---|---|---|---|
| 엔진-T | 타입 | `types/property.types.ts` | `PropertyTaxInput.housingBuildingValue?` / `PropertySurtaxDetail.housingFireServiceTaxBase?`(echo — 소방분 과세표준). 결과 카드 "건물분 × FMR" 표기는 이 필드 + `result.fairMarketRatio`(이미 존재)로 충분 → `housingBuildingValue` echo 불요 |
| 엔진-C | 법령 상수 | `legal-codes/property.ts` | `PROPERTY.REGIONAL_RESOURCE_TAX_HOUSING = "지방세법 §146④ 단서"` 신규 — 주택 소방분 legalBasis(building의 §146과 구분). 수치 상수 없음 |
| 엔진-F | 계산 | `property-tax-surtax.ts` `calcSurtax` 7번째 param + 주택 분기 / orchestrator 710 전달 |
| ① | FormState | `components/calc/property/shared.ts` | `housingBuildingValue: string` |
| ② | INITIAL_FORM | 동상 | `housingBuildingValue: ""` |
| ③ | normalize | **해당 없음**(component-local) |
| ④ | API 변환 | 동상 `buildPropertyTaxRequestBody` | housing + 값>0 시 `body.housingBuildingValue` |
| ⑤ | UI 위젯 | `components/calc/property/Step0.tsx` | 주택 분기 `CurrencyInput`(priorYear 입력란 인근) |
| ⑥ | 사이드바 | **해당 없음** |
| ⑦ | 결과 카드 | `PropertyTaxResultView.tsx` | 주택 소방분 행(과세표준 = 건물분 × FMR 표기) |
| ⑧ | Validation | `shared.ts` validateStep | optional·입력 시 숫자 검증만(미입력 통과 — 모순 0) |
| ⑫ | Zod | `lib/validators/property-input.ts` | `housingBuildingValue: z.number().int().nonnegative().optional()` + housing 외 refine |
| ⑭ | Route | **자동**(직접 캐스트) |

## 7. 작업 순서 (PDCA Do — 시퀀셜)

1. **엔진 시니어**: 엔진-T·F → calcSurtax 주택 분기 + orchestrator + anchor.
2. **Pre-Do anchor**: §3 anchor(건물분 1.5억 → 과표 9천만 → base 80,300) 우선 작성·실행 → 실패 확보.
3. **UI 시니어**: ①②④⑤⑦⑧⑫.
4. **Check**: `ui-engine-sync-checker` + `bkit:gap-detector`.

## 8. 테스트 계획

`__tests__/tax-engine/property-tax.test.ts`:
- **HB-1**: 주택 건물분 1.5억 / 일반 60% → 소방분 과세표준 90,000,000 · regionalResourceTax 80,300.
- **HB-2**: 주택 + housingBuildingValue 미입력 → 소방분 0 (기존 회귀).
- **HB-3**: 1세대1주택 2026 / `publishedPrice=7억`(→FMR 45% 구간) / `targetDate="2026-06-01"` / 건물분 1억 → 소방분 과세표준 = 100,000,000 × 45% = 45,000,000 · regionalResourceTax = 24,100 + (45,000,000 − 39,000,000) × 10/10,000 = **30,100**. (FMR 구간은 **publishedPrice** 기준 판정 — 건물분가액 아님)
- **HB-4**: 건축물(building) → 신규 필드 무시·기존 publishedPrice 경로 불변(회귀).
- **HB-5**: 주택 소방분 + 화재위험 중과 미적용(multiplier 1) 확인.
- **HB-6**: UI `buildPropertyTaxRequestBody` — 주택+건물분 전송 / 건축물·미입력 미전송.
- **E2E**: 주택 + 건물분가액 입력 → 결과 소방분 행 표시.

## 9. 리스크·미확정 (확인 필요)

- **선박(5호) 소방분**: §146④는 선박도 대상이나 현행 엔진 미지원. 본 계획 범위 외(별도 갭).
- **housingBuildingValue 출처**: 지자체장 §4② 산정 건물분 가액 — 재산세 고지서·주택가격 공시(건물/토지 분리분)에서 확인. 사용자 직접 입력(미입력 시 graceful 0). 자동 안분 금지(CLAUDE.md) — 주택공시가격에서 건물분 자동 추정하지 않음.
- **1세대1주택 FMR 적용**: 소방분 과세표준의 FMR이 본세와 동일(엔진 `fairMarketRatio` 재사용). 2026 1세대1주택 43~45%도 동일 적용 — 단, 비율 구간은 **주택공시가격(publishedPrice)** 기준 판정(엔진 기존 동작) vs 건물분가액 기준? §146④ 단서 "§110①2호 비율"은 그 주택의 비율 → publishedPrice 기준 판정이 타당. Do 시 anchor로 확정.
- **§110③ 상한 무관**: 소방분 과세표준은 건물분 × 비율(상한 미적용). Do anchor로 자기일관 검증.
- **브라우저/E2E**: 주택 → 건물분가액 입력 → Network body `housingBuildingValue` → 결과 소방분 행 (E2E 또는 명시적 미수행).
