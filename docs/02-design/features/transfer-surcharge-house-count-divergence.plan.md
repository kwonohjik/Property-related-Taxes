# 다주택 중과 — ① 세대 보유 주택 수 ↔ ④ 다른 보유 주택 목록 불일치 경고 (B안)

> **상태**: ✅ **구현 완료** (PR#768 · 2026-07-24) — 2026-08-04 코드 실측 · 2026-08-05 인용 PR·커밋 재검증(종전 헤더는 stale이었음).
> ~~종전 표기: Plan · 세목: 양도소득세(중과) · 작성일: 2026-07-24~~
> 관련 조사: mem S1756 "다주택 중과 2주택/3주택 판정 두 개의 독립 경로 존재 — 불일치 가능성"
> 개정1: 2026-07-24 — ① 토글 "3채 이상" 개방 버킷의 **누락 입력 탐지 불가** 사각 해소 위해 ① 위젯을 **정확 숫자 입력**으로 전환.
> 개정2(R2): 2026-07-24 — 자가검토 Fork B가 "정확값→엔진 전달 시 세액 불변"이 **거짓**임을 발견(비과세/장특 판정 변동).
>       사용자 결정 **Resolution 2** 채택 → 정확값을 엔진에 전달하여 **4채+ 세대의 1주택/표2 특례 undercount를 §89①3호가목 근거로 정정**.
>       즉 본 계획은 (1) divergence 경고 + (2) 비과세/장특 undercount 정정 **2개 산출물**이다.

## 1. 문제 정의

다주택 중과 배수(2주택 +20%p vs 3주택+ +30%p)를 결정하는 `effectiveHouseCount`의
**소스가 두 개로 갈리고, 둘 사이 정합성 검증이 전혀 없다.**

- **④ `houses[]`가 1건 이상**이면 → `determineMultiHouseSurcharge()`가 목록을 세어 판정하고,
  **① 토글 `householdHousingCount`는 완전히 무시**된다.
- **④가 비어 있으면** → **① 토글값**이 폴백으로 2/3 판정 기준이 된다.

근거 (실측):
- `lib/tax-engine/transfer-tax.ts:489-491` — `multiHouseSurchargeResult ? effectiveHouseCount : householdHousingCount`
- `lib/tax-engine/transfer-tax-rate-calc.ts:346-347` — 동일 삼항 폴백
- `lib/tax-engine/transfer-tax.ts:182-214` — `houses.length > 0`일 때만 정밀 엔진 호출

### Silent divergence 시나리오

| 케이스 | ① | ④ 목록 | 엔진 판정 | 결과 |
|---|---|---|---|---|
| S1 | 3채↑ | 다른 주택 1채 | houses=[양도,1채]=2 → **2주택(+20%p)** | ①(3채)이 조용히 무시됨 |
| S2 | 3채↑ | 비움 | 폴백 → `3 >= 3` → **3주택(+30%p)** | ④ 입력 유무만으로 20↔30%p 변동 |
| S3 | 2채 | 다른 주택 2채 | houses=3 → **3주택(+30%p)** | ①(2채)이 조용히 무시됨 |

### ★ "3채 이상" 개방 버킷의 누락 탐지 사각 (개정 트리거)

기존 토글은 4채·5채·…를 모두 **"3채 이상"(값 `"3"`)** 으로만 저장 → **정확한 세대 주택 수 정보가 소실**된다.

- 예: 세대 5채(양도1 + 다른 4채) 보유, ④에 다른 주택 **3채만** 입력.
  - `houses[]` = 양도 + 3 = **4개** → `effectiveHouseCount`(배제 전) = 4 → `>= 3` → 3주택+.
  - **배제규칙이 개입하면 오류(유리) 발생**: 5채 중 2채가 지방3억↓ 배제 시 실제 `eff=3`(3주택+)이 맞지만,
    ④에 4개분만 입력하고 그중 2채가 배제되면 `eff=2` → **2주택(+20%p)로 잘못 완화**. 누락된 비배제 1채가 판정을 바꿈.
  - 이때 ①이 "3채 이상"(하한 3)뿐이면 **`5 ≠ 4` 불일치를 원리적으로 탐지할 수 없다**(3 이상은 상한 정보가 없음).

→ 2↔3 경계(토글이 정확값 2)는 탐지 가능하나, **3채 이상 개방 버킷의 누락 입력만 사각**.
   이를 닫으려면 ①이 **정확 숫자**를 담아야 한다.

## 2. 설계 결정

### 결정 A — "차단 validation 오류"가 아니라 "비차단 인라인 안내"로 구현

사용자 요청은 "validation 경고"이나, `transfer-tax-validate.ts`에 **차단 오류**로 넣지 않는다.

이유:
1. **④가 비어 있는 것은 정당한 경로**(폴백 의도). 차단하면 정상 흐름을 막는다.
2. 불일치가 항상 오류는 아니다 — **§167의3 배제규칙**으로 `effectiveHouseCount`가 목록 개수보다 정당하게 낮아질 수 있다.
3. 정책 준수: `feedback_blocking_validation_full_e2e_regression`, CLAUDE.md "UI 통과↔validate 차단 모순 금지".

→ **비차단 인라인 안내 카드**(ToneCard)로, `HousesListSection`에서 `useMemo`로 계산해 렌더.
   useEffect·store 미러링 금지(`feedback_useeffect_store_mirror_forbidden`).

### 결정 B — ① 위젯을 "정확 숫자 입력"으로 전환 (개정 핵심)

`app/calc/transfer-tax/steps/Step4.tsx:260-282`의 3버튼 토글(1채/2채/3채 이상)을 유지하되,
**"3채 이상" 버튼 활성 시 정확 숫자 스텝퍼(min 3, 상한 없음)를 노출**해 정확한 세대 주택 수를 저장한다.

- 저장: `householdHousingCount`(문자열)에 **정확 숫자**("3"/"4"/"5"/…). 필드 추가 없음(기존 필드 값 범위 확장). **이 값이 엔진에 그대로 도달**(R2 — §2-1).
- 클릭 흐름: "3채 이상" 클릭 → 값 "3" set + 정확 입력 노출 → 사용자가 실제값(예: 5)으로 조정. 스텝퍼 미조작 시 3 유지(C9 정상 — ④와 다르면 C-2가 유도).
- 선택 하이라이트(:273): `v === "3+" ? parseInt(form.householdHousingCount) >= 3 : form.householdHousingCount === v` 로 변경.
- **위젯(F3 정정 — Fork C 실측)**: `components/calc/inputs/IntegerInput.tsx`(`IntegerInput` — 정수 전용, 콤마 포맷, `parseInteger`) **존재** → 재사용. `value:number|undefined, onChange:(n)=>void`. min 3 하한은 onChange에서 `Math.max(3, n)` 클램프(선례 `BurdenedGiftTransferSection.tsx:520` `Math.max(1, ...)`). 저장은 문자열이라 `String(Math.max(3, parseInteger(v)))`. select-on-focus는 `SelectOnFocusProvider` 전역 적용으로 자동(수동 `onFocus` 불요). `data-testid="household-house-count-exact"`.

### 결정 C — 두 층위의 안내

**(C-1) 우선순위 안내 (④가 채워지면 항상 노출) — 핵심**
> "중과 2주택·3주택 판정은 아래 ④ 목록(배제규칙 반영) 기준으로 산정됩니다.
>  ① '세대 보유 주택 수'는 목록이 비어 있을 때만 사용됩니다."

**(C-2) 개수 불일치 힌트 — ① 정확값 vs ④ 구조 카운트 엄격 대조**
정확 숫자 전환으로 tolerance 불필요 → **엄격 일치** 비교.
> "참고: ① 세대 보유 주택 수(5채)와 ④에 입력한 주택 수(4채, 양도주택 포함)가 다릅니다.
>  누락된 주택을 ④에 추가하거나 ①을 실제 세대 주택 수에 맞게 조정하세요. (분양권·입주권은 별도 집계)"

### 결정 D — ④ 배제규칙(effectiveHouseCount)은 UI에서 재계산하지 않는다

`countEffectiveHouses`의 배제 로직은 엔진 전용. UI 복제 시 single-source 위반
(`feedback_ui_engine_dual_truth_avoidance`). C-2는 **배제 전 구조적 개수**만 비교.
배제로 인한 정당한 감소(eff < 목록수)는 **결과 화면**에서 설명한다(§6 후속).

## 2-1. 엔진 영향 실측 (R2 — 정확값 전달은 "무변경"이 아니라 "의도된 비과세 정정")

> ⚠️ 자가검토 Fork B 발견(직접 재현 확정): 개정1의 "값 5 ≡ 값 3 세액 동일"은 **거짓**.
> `householdHousingCount`는 surcharge tier(`>=2/>=3`)뿐 아니라 **비과세/장특 판정 경로**에도 흘러들며, 폴백 경로(④ 미입력)에서도 세액을 바꾼다.

**세액을 바꾸는 경로 (실측):**
- `transfer-tax-house-exclusion-step.ts:41-44` — `exemptionJudgeInput.householdHousingCount = Math.max(householdHousingCount − totalExcluded, 0)`.
  `totalExcluded = (hceApplied?1:0) + specialHouseExclusionDetail.excludedCount + inheritedExclusion.excludedCount`.
  `hceApplied`(§98의9·§99의4 **감면주택**)·`specialHouseExclusions`는 **houses[] 무관** → ④ 미입력에도 `>0` 가능.
- `transfer-tax.ts:513-517, 530-534` — `exemptionJudgeInput.householdHousingCount === 1`이 `isOneHouseSpecial(982)`를 켜 **표2 장특(최대 80%)**·1주택 산식을 좌우.

**반례 (④ 미입력, 감면주택1 + specialHouseExclusion1 → totalExcluded=2):**
| ① 입력 | 저장값 | judge = max(declared−2,0) | 표2 특례 | 세액 |
|---|---|---|---|---|
| 구(캡) "3채 이상" | 3 | max(3−2,0)=**1** | ON | (과소 — undercount) |
| 신(R2) 정확 5채 | 5 | max(5−2,0)=**3** | OFF | **정정(증가)** |

**판정: 구 동작이 버그.** 세대 5채(배제 후 3채)는 §89①3호가목 "1주택" 요건 미충족인데, 토글 상한 3 캡이 `3−2=1`로 만들어 1주택 특례를 오부여했다. R2(정확값)는 이를 §89①3호가목 근거로 **정정**한다(§2-2).

**플러밍 안전성(값 4·5가 코드를 깨지 않음 — 별개 확인):**
| 위치 | 검사 | 값 5 | 비고 |
|---|---|---|---|
| `lib/api/transfer-tax-schema.ts:144` | `z.number().int().min(0)` | 통과 | 상한 없음 — Zod 변경 불필요(단·다건 공용) |
| `-rate-calc.ts:260,268,347` / `transfer-tax.ts:487,491` | `>=2/>=3` surcharge | 3주택+ | tier는 3과 동일(중과 세율 무변동) |
| `transfer-tax.ts:515,532` (exemptionJudge===1) | 표2/1주택 | judge값 따라 변동 | **← R2 정정 대상 경로** |
| `transfer-tax-exemption.ts:307,362` | `===2` 일시적2주택 | false | 5채는 대상 아님(정상) |
| `Step4.tsx:312,348,404,519,597,602` | 가시성 `==="1"/">=2/>=3"` | 3과 동일 | UI 게이트 무변동 |

→ 값 4·5는 코드를 깨지 않으며(플러밍 안전), **유일한 동작 변화는 비과세/표2 undercount 정정**이다. 항상 equal-or-stricter(특례 감소 방향)이므로 새 유리-오류를 만들지 않는다.

## 2-2. 법령 근거 (R2 정정의 정당성 — KoreanLaw 검증)

- **소득세법 §89①3호가목** (KoreanLaw MST 280405, 시행 2026-07-01 검증): *"가. 1세대가 **1주택**을 보유하는 경우로서 대통령령으로 정하는 요건을 충족하는 주택"*.
- 나목은 대체취득·상속·동거봉양·혼인 등 **한정된 2주택 이상 특례**만 열거. 4채+ 일반 다주택은 비과세 대상 아님.
- 엔진의 exemption-judge 차감(§154·§155 상속·감면주택 배제)은 **"특례 주택만 count에서 제외"**하는 것이지, 실제 보유수를 3으로 캡하는 규정이 아니다. 토글 상한 3은 **UI 제약이 엔진에 누수된 것**일 뿐 법적 근거 없음.
- 따라서 R2는 `feedback_no_unfavorable_application_without_legal_basis`에 **부합**(불리 방향이나 §89①3호가목 명문 근거 有 — 오부여된 특례의 제거는 정정이지 근거 없는 불리 적용이 아님).

## 3. 개수 정의 (C-2)

```
// 게이트(F1): primaryKind === "housing" 일 때만 계산. right_to_move_in·presale_right 양도는 제외.
populated       = houses.length > 0 || presaleRights.length > 0   // 우선순위(C-1) 노출 조건 — 분양권만 입력해도 ④ 경로 진입
structuralCount = 1 (양도 주택 = selling, 주택 양도일 때만 성립)
               + houses.filter(h => h.acquisitionDate).length     // 주택만. 분양권 제외(F7)
declared        = parseInt(householdHousingCount)                 // 정확 숫자(세대 보유 "주택" 수)
match           = structuralCount === declared                    // tolerance 제거 — 엄격 일치
showMismatch    = isHouseSale && populated && !match              // C-2
```

- **F1 게이트 (High 정정)**: `isHousingLike`는 `right_to_move_in`·`presale_right`도 포함하나(`transfer-tax-api-helpers.ts:204-205`), 그 자산 양도 시 `householdHousingCount`는 **주택 수(양도 입주권/분양권 미포함, 예 "0")** 라 `structuralCount(+1 selling)`과 의미 축이 어긋나 false mismatch를 낸다. → divergence는 **`primaryKind === "housing"`(실제 주택 양도)일 때만** 노출.
- **F7 분양권 제외 (Medium 정정)**: ① "세대 보유 주택 수"는 **주택만** 센다(분양권은 ④ 별도 subsection). `structuralCount`에 분양권을 더하면 "주택 vs 주택+분양권" 어긋남 + pre-2021·3억↓ 분양권은 엔진 미산입(`isPresaleRightCounted`, `multi-house-surcharge-count.ts:551-553`)이라 이중 오탐 → **structuralCount는 주택 행만** 카운트. 분양권은 house-완결성 교차검증 대상 아님(단 `populated`엔 포함 → C-1은 분양권만 입력해도 노출).
- ④ 미입력(houses 0 && presale 0)이면 C-1·C-2 모두 미노출(폴백은 정상 경로).

## 4. 케이스 매트릭스 (정확 숫자 기준 전 분기)

| # | ④ 채움? | declared(①) | structuralCount | C-1 우선순위 | C-2 불일치힌트 |
|---|---|---|---|---|---|
| C1 | ✗ | 1 | — | 미노출 | 미노출 |
| C2 | ✗ | 5 | — | 미노출 | 미노출 (폴백 정상) |
| C3 | ✓ 다른주택 4 | 5 | 5 | 노출 | 일치 → 미노출 |
| C4 | ✓ 다른주택 3 | 5 | 4 | 노출 | **노출** (5 ≠ 4) ← 개정 대상 케이스 |
| C5 | ✓ 다른주택 2 | 2 | 3 | 노출 | **노출** (2 ≠ 3) |
| C6 | ✓ 다른주택 1 | 3 | 2 | 노출 | **노출** (3 ≠ 2) |
| C7 | ✓ 분양권 1만(주택 0) | 1 | 1 | 노출 | 일치 → 미노출 (분양권 제외, selling만=1) |
| C7b | ✓ 분양권 1만(주택 0) | 2 | 1 | 노출 | **노출** (주택 2 주장·1채만=selling → 주택 누락) |
| C8 | ✓ 다른주택 1(취득일 미입력) | 2 | 1 | 노출 | **노출** (미완성 행 제외 → 2 ≠ 1) |
| C9 | ✓ 다른주택 4 | 3(스텝퍼 방치) | 5 | 노출 | **노출** (3 ≠ 5 — 정상: ①을 실제값으로 조정 유도) |
| C10 | ✓ (입주권/분양권 **양도**) | — | — | **미노출** | **미노출** (F1 게이트 — primaryKind≠housing) |

- **C4 = 사용자가 지적한 5채-3입력 사각.** 정확 숫자(5) 저장으로 `5 ≠ 4` 엄격 대조 → 이제 탐지됨.
- C8: 취득일 없는 행은 payload·structuralCount 모두 제외 → 자연스럽게 불일치 노출(입력 유도).
- **C9(F6)**: "3채 이상"만 누르고 스텝퍼를 3에 방치한 채 ④에 4채 입력 시 `3 ≠ 5` mismatch는 **정상 동작** — ①을 실제 세대 주택 수로 조정하도록 유도.
- **C10(F1)**: 양도 자산이 입주권·분양권이면 divergence 자체를 계산·노출하지 않음.

## 5. 변경 지점

엔진 input/result **타입·필드는 무변경**(신규 필드 없음). 단 R2로 `householdHousingCount`의 **값 도메인이 4·5·…까지 확장되어 엔진에 도달** → 비과세/표2 판정이 의도대로 정정된다(§2-1). 실질 변경은 ⑤(UI 위젯) + ⑭(엔진 도달 값 도메인).

| 지점 | 파일 | 변경 |
|---|---|---|
| ⑤ UI (①) | `app/calc/transfer-tax/steps/Step4.tsx:260-282` | "3채 이상" 활성 시 숫자 스텝퍼(min 3) 노출 + set. 하이라이트 조건(:273) `>= 3`로 변경 |
| ⑤ UI (④) | `app/calc/transfer-tax/steps/step4-sections/HousesListSection.tsx` | `useMemo` divergence 계산 + ToneCard C-1(sky/violet 정보)·C-2(amber 경고) 렌더(F5). 테이블 아래 삽입(입력 후 확인 흐름). C-2에 `data-testid="house-count-mismatch"`(E2E) |
| — | (신규 순수 함수) `lib/calc/house-count-divergence.ts` | `computeHouseCountDivergence(input)` → `{ showPrecedence, showMismatch, declared, structuralCount }`. **primaryKind 인자 필요(F1 게이트)** |

**동기화 지점 점검:**
- ①②③(타입·initial·normalize) — `householdHousingCount` 타입(string)·기본값("1") 불변, 값 범위만 확장. 신규 필드 없음.
- ④⑬⑭(API·body·route) — 매핑 코드 무변경(`parseInt` 그대로), Zod `min(0)` 상한 없음(2-1). **단 전달되는 값이 4·5로 확장됨(R2 의도)** → 엔진 exemption-judge 정정. 침묵 strip 위험 없음(기존 필드).
- ⑥(사이드바)·⑦(결과 카드) — 본 계획 범위 밖(§6 후속).
- ⑧(validate) — **의도적 미변경**(결정 A). `householdHousingCount` 빈값 검증(:106)은 정확 숫자에도 유효.
- **⑦ 결과 표시(경미 확인 필요)**: exemption-judge step formula(`transfer-tax-house-exclusion-step.ts:52`)가 `주택수 N → M` 을 표시 → R2로 N이 정확값(5)으로 바뀌어 자연히 정확해짐(추가 작업 불요, 확인만).

### 순수 함수 시그니처(안)

F4: param을 `TransferFormData` 대신 **narrow 구조 타입**으로 받아 테스트 경량화(호출부는 form이 satisfy).
F1: `primaryKind` 인자로 주택 양도만 게이트.

```ts
// 엔진 로직 복제 아님 — 구조적 개수만. 배제규칙은 엔진 소관.
interface HouseCountDivergenceInput {
  primaryKind: string;                        // form.assets[0].assetKind
  householdHousingCount: string;
  houses: { acquisitionDate?: string }[];
  presaleRights: unknown[];
}
export function computeHouseCountDivergence(input: HouseCountDivergenceInput): {
  showPrecedence: boolean;   // 주택 양도 && ④ 채워짐
  showMismatch: boolean;     // 위 && declared ≠ structuralCount
  declared: number;
  structuralCount: number;
} {
  const isHouseSale = input.primaryKind === "housing";   // F1 게이트 — 입주권·분양권 양도 제외
  const populated = input.houses.length > 0 || input.presaleRights.length > 0;  // C-1: 분양권만 입력해도 노출
  const declared = parseInt(input.householdHousingCount || "1", 10);  // store default "1"과 일치
  const structuralCount =
    1 + input.houses.filter((h) => h.acquisitionDate).length;   // F7: 주택만. 분양권 제외
  return {
    showPrecedence: isHouseSale && populated,
    showMismatch: isHouseSale && populated && structuralCount !== declared,
    declared,
    structuralCount,
  };
}
```

## 6. 후속(선택, 본 계획 범위 밖)

**결과 화면 echo (권장 후속):** `components/calc/MultiHouseSurchargeDetailCard.tsx`에
`① 세대 선언 N채` vs `중과 적용 N채(§167의3 배제 반영)`를 함께 표기 →
배제로 인한 정당한 감소(eff < 목록수, C4의 배제 시나리오)를 사용자에게 설명.
단, `MultiHouseSurchargeResult`에 `householdHousingCount` echo 필드 존재 여부 **선확인 필요**
(현재 미검증 — echo 필드 추가 시 결과 타입 변경 → 별도 계획).

**다건(multi-transfer) 경로 (범위 밖):** 다건도 per-property `householdHousingCount`를 사용하나(`app/api/calc/transfer/multi/route.ts:126`) 별도 마법사 UI다. 동일 divergence 사각 존재 여부·대응은 본 단건 계획과 분리된 후속 검토 대상.

## 7. Pre-Do Anchor (Do 진입 전 우선 작성)

**(A) `computeHouseCountDivergence` 단위 테스트** — `__tests__/calc/house-count-divergence.test.ts` (모두 `primaryKind:"housing"` 전제, 별도 표기 제외):
- A1: C1(④ 미입력·declared 1) → `{showPrecedence:false, showMismatch:false}`
- A2: **C4(declared 5, 다른주택 3) → `{showPrecedence:true, showMismatch:true, structuralCount:4}`** (사각 폐쇄 검증)
- A3: C3(declared 5, 다른주택 4) → `{showPrecedence:true, showMismatch:false}` (정확 일치)
- A4: C8(취득일 미입력 행) → structuralCount 감소로 mismatch 확인
- A5: **C10 게이트 — `primaryKind:"right_to_move_in"` + ④ 채움 → `{showPrecedence:false, showMismatch:false}`** (F1 입주권 양도 제외)
- A6: **F7 분양권 제외 — declared 1, 주택 0 + 분양권 2 → `{showPrecedence:true, showMismatch:false, structuralCount:1}`** (분양권은 카운트 미포함, C-1만 노출)

**(B) 비과세/표2 undercount 정정 anchor (R2 핵심 — Fork B #2)** — 엔진 레벨(`calculateTransferTax`):
- 세팅: 주택 양도, `isOneHousehold:true`, ④ 미제공, `totalExcluded>0` 조건 조성
  (감면주택 §98의9/§99의4 **또는** `specialHouseExclusions` 1건 + 상속배제 등으로 excludedCount 합 ≥1), 보유·거주 표2 요건 충족.
- **B-1**: `householdHousingCount: 3`(구 캡) → `isOneHouseSpecial=true`(표2 특례 ON) — 기존 undercount 동작 고정.
- **B-2**: `householdHousingCount: 5`(R2 정확) → `isOneHouseSpecial=false`(표2 OFF) → **세액이 B-1보다 큼** = §89①3호가목 정정 확인.
- **B-3 (surcharge 무변동)**: 위 두 케이스의 `surchargeType`은 동일(`multi_house_3plus`) — 중과 tier는 5≡3.

**(C) 회귀 무영향 anchor** — `householdHousingCount ≤ 3` 기존 케이스(대다수 테스트)는 R2로 **결과 불변**
(값 도메인 확장은 4·5에서만 발생). `npx vitest run __tests__/tax-engine/transfer/` 전건 통과로 확인.

→ anchor 실패 메시지로 정정 방향(equal-or-stricter)·surcharge 무변동·기존 회귀 무영향을 Do 전에 확정.

## 8. 검증 게이트 (완료 기준)

- [ ] `computeHouseCountDivergence` anchor A1~A6 통과
- [ ] **비과세 정정 anchor B-1/B-2/B-3 통과** — declared 5 → 표2 특례 OFF·세액 증가, surcharge tier 불변(R2 핵심)
- [ ] `npx tsc --noEmit` 0건
- [ ] E2E(주택 양도 자산): ① "3채 이상"→스텝퍼 5 입력 + ④ 3채 입력 시 C-1(정보)·C-2(amber, `testid=house-count-mismatch`) 노출; ④ 미입력 시 미노출; declared=structural 일치 시 C-2 미노출
- [ ] **엔진 회귀 anchor C**: `npx vitest run __tests__/tax-engine/transfer/` 전건 통과 — declared≤3 기존 케이스 결과 불변 확인(R2 파급이 4·5에 한정됨을 입증)
- [ ] 브라우저 수동 확인(스텝퍼·목록 조작 시 안내 실시간 반영)

## 9. 정책 준수 체크

- `feedback_no_unfavorable_application_without_legal_basis` — **(R2 핵심)** divergence 안내는 정보 제공만이나, 정확값 엔진 전달은 4채+ 세대 비과세/표2 특례를 **감소(불리)**시킨다. 그러나 **§89①3호가목 명문 근거**(§2-2)에 따른 오부여 특례의 정정이므로 정책 부합(근거 없는 불리 적용 아님).
- `feedback_numeric_impact_verify_before_bug_claim` — 개정1의 "세액 불변" 단정이 미검증 오판이었음(Fork B 발견). R2는 반례·법령·anchor(B)로 수치영향 **검증 후** 단정.
- `feedback_ui_engine_dual_truth_avoidance` — divergence 함수는 배제규칙 미복제(구조 카운트만). `householdHousingCount`는 단일 필드 유지(정확 숫자로 확장 — UI 전용 사본·엔진 사본 분리 안 함 → dual-truth 없음).
- `feedback_useeffect_store_mirror_forbidden` — useMemo 파생, store 미기록.
- `feedback_blocking_validation_full_e2e_regression` — 비차단.
- `feedback_store_default_vs_ui_display_fallback` (F2 정정) — store 기본값 "1". **API는 기존 `parseInt(...) || 0`**(`transfer-tax-api.ts:347`·`multi-transfer-tax-api.ts:122`) — 본 기능은 API 매핑 무변경(빈값→0은 엔진상 무중과 edge, 기존 동작 유지). divergence 함수는 store default·`HousesListSection:431`과 일치하는 `|| 1`(빈값→1채 가정) 사용. 두 fallback은 소비처가 달라(엔진 vs UI 표시) 상이가 정당 — "3곳 동일값" 강제 대상 아님.
- CLAUDE.md 색상 토큰화 (F5) — C-1(정보)=sky/violet, C-2(경고)=amber. ToneCard 사용, 인라인 톤 하드코딩 금지.
