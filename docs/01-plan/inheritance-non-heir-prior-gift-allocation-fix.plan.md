# 비상속인(상속인·수유자 외) 사전증여 수증자 배부·공제 오분류 수정 계획서

> P0 버그: 후순위 "기타(other)"·인척(며느리 등 사전증여만 받은 비상속인)이
> ⑪ 산출세액 배부·⑫ 증여세액공제에 상속인으로 잘못 포함됨.
> 해결: 민법 §1000 순위 자동판정(legalShares.shares 멤버십) 단일진실로 납세의무자 판정.

- 작성일: 2026-06-09
- 범위: **버그 수정만** (대습상속인은 §7 후속 계획)
- 사용자 결정: 완전 자동(순위 단일진실) / 비상속인 증여세액공제 ⑩ 이동 / 버그 먼저

---

## 1. 버그 재현 (실측 수치)

윤며느리: `relation="other"`, `isHeir=undefined`, 사전증여 250,000,000(과세표준 240,000,000). 1순위 자녀(김첫째·김둘째) 존재.

| 표 위치 | 현재 출력 | 코드 경로 | 판정 |
|---|---|---|---|
| 장례비 배분(㉡) | 0 | `computeDebtByHeirWithFuneralCap`→`distributeByLegalShares` (며느리 법정상속분 0) | ✅ 정확 |
| ⑥ 직접배부 | 240,000,000 | `directTaxBaseShare = giftTaxBase`(`inheritance-allocation.ts:478` 부근) | 버그 유발원 |
| ⑪ 산출세액 배부 | 105,196,111 | `computedTaxShare = distributableTax × taxBaseShare / denominator`. 며느리가 `isForProfitCorporate`만 아니면 배부(`:420-421`) | **버그** |
| ⑫ 증여세액공제 | 38,000,000 | `priorGiftCredit = Min(giftTaxPaid, 한도)`, `HEIR_NO_CORP`(corporate만 제외, other 포함, `heir-allocation-summary.ts:163,608`) | **버그** |

---

## 2. 법령 근거 (KoreanLaw 검증 완료, 2026-06-09)

- **민법 §1000**: 상속순위 1 직계비속 → 2 직계존속 → 3 형제자매 → 4 4촌 이내 방계. 선순위 있으면 후순위 상속인 자격 없음. (`inheritance-legal-share.ts:50-63` 이미 구현)
- **상증법 §3의2①**(시행 2026-01-02 검증): 상속세 납부의무자 = **상속인 또는 수유자**(영리법인 제외). 상속재산에 가산하는 증여재산 중 "상속인이나 수유자가 받은 증여재산"만 각자 납부 기준. → **비상속인 며느리는 납부의무 없음 → ⑪ 배부 제외**가 법리.
- **상증법 §28②**(검증):
  - **후단** "그 증여재산의 수증자가 **상속인이거나 수유자이면**" → 각자 납부할 상속세액에서 per-heir 비율 한도 공제 = **⑫**
  - **본문**(수증자가 상속인·수유자 **아니면**) → 상속세산출세액 × (가산증여 과세표준 / 상속재산 과세표준) 한도로 **전체 산출세액에서 공제** = **⑩**
- **상증법 §3의2②**: 영리법인 수유자 특칙 — ⑩의 기존 영리법인 면제(`corporateExemption`).

→ ⑩ "상속인(수유자)외 증여세액공제"에는 **2종**이 들어감: ① 영리법인 §3의2②(기존), ② 비상속인 자연인 §28② 본문(신규).

---

## 3. 근본 원인

1. **순위 미반영 판정**: `isStatutoryHeir`(`heir-allocation-summary.ts:74`)·`HEIR_NO_CORP`(`:163`)·`isForProfitCorporate`(`:404,421`)는 모두 **relation 단독** 판정. 민법 순위(선순위 존재 시 후순위 배제)를 반영하지 않음.
2. **단일진실 부재**: `computeLegalShares`는 순위로 `shares`를 산정(장례비는 정확)하나, ⑪·⑫는 이를 쓰지 않고 `directTaxBaseShare`·`taxBaseByDonee` 기반 독립 경로 → other가 사전증여만 있어도 배부·공제.
3. **⑩ 영리법인 전용**: `corporateGiftTaxBase`·`corporateExemption`이 영리법인만 분모/분자·면제에서 제외. 비상속인 자연인은 평행 처리 부재.

---

## 4. 해결 설계

### 4-1. 납세의무자 단일 판정 헬퍼 (신설)

`lib/tax-engine/inheritance-gift-common.ts`에 추가 (메모리 `single-source-engine-helper`):

```ts
/**
 * 상속세 납부의무자(§3의2①) = 민법 §1000 순위상 실제 상속인 ∪ 수유자. 영리법인 제외.
 * 실제 상속인 = computeLegalShares.shares 멤버(순위 자동판정 단일진실).
 * 수유자(legatee)는 법정상속분 없으나 유증으로 납세의무 → OR 포함.
 */
export function isInheritanceTaxPayer(
  heir: Heir,
  legalShares: LegalShareResult,
): boolean {
  if (isForProfitCorporate(heir)) return false;
  if (heir.relation === "legatee" && heir.isHeir !== false) return true;
  return legalShares.shares.some((s) => s.heirId === heir.id);
}
```

→ 윤며느리(후순위 other, shares 비멤버, legatee 아님) = **false**.

### 4-2. ⑪ 산출세액 배부 — 비납세의무자 일반화 (영리법인 경로 재사용)

**핵심 근거**: 영리법인 §3의2② 면제와 자연인 비상속인 §28② 본문 공제는 **동일 산식**:
`Min(증여세 산출세액, floor(computedTax × 비상속인 증여 과세표준 / taxBase))` (`inheritance-corporate-exemption.ts:7,102-105` — 주석 "§28① 안분 한도와 동일 구조"). 따라서 영리법인 처리를 **비납세의무자(영리법인 ∪ 자연인 비상속인) 전체로 일반화**하면 자연인분이 영리법인과 완전 동일 경로를 탄다.

**계산 위치 (STEP 3 정정)**: `corporateExemption`은 기존대로 orchestrator 주입 유지. 하지만 자연인 비상속인분(`nonPayerNaturalGiftTaxBase`·`nonPayerNaturalGiftCredit`)은 **`calcHeirAllocation` 내부 계산** — 비상속인 판정에 필요한 `legalShares`가 내부에서 계산(`inheritance-allocation.ts:391`)되고 orchestrator `corpStep`(`:597`)은 그 이전이라 주입 시 legalShares 중복계산을 강제하기 때문. 내부에 `priorGifts`(`:133`)·`taxBase`(`:139`)·`computedTax`(`:141`)·`distributableTax`(`:412`) 모두 가용 → orchestrator 변경 불필요.

| 변수 | 현재 | 변경 |
|---|---|---|
| 직접배부 합산(`inheritance-allocation.ts:402-407`) | `isForProfitCorporate` 제외 | **`!isInheritanceTaxPayer`** 제외 |
| `nonPayerNaturalGiftTaxBase`(신규, orchestrator 주입) | — | 비상속인 자연인 사전증여 과세표준 합 |
| `computedTaxShareDenominator`(`:415`) | `taxBase − corporateGiftTaxBase` | `− nonPayerNaturalGiftTaxBase` 추가 (영리법인과 동일) |
| `indirectNumerator`(`:408`) | `taxBase − totalHeirDirectTaxBase − corporateGiftTaxBase` | `− nonPayerNaturalGiftTaxBase` 추가 |
| `distributableTax`(`:412`) | `computedTax − corporateExemption` | `− nonPayerNaturalGiftCredit` 추가 |
| heir 루프(`:420`) | `isCorporate`면 `computedTaxShare=0` | corp 분기 **불변** + 비상속인 자연인 **별도 분기 신설**(회귀 안전, 설계 STEP 6 정정). 둘 다 `computedTaxShare=0` |

→ 며느리 `computedTaxShare = 0`. distributableTax·분모에서 며느리분 빠짐 → ⑪ 합계 = `computedTax − corporateExemption − nonPayerNaturalGiftCredit`.

**표시 필터(`isTaxPayer` echo)**: summary.ts는 `legalShares`가 없으므로 perHeir에 `isTaxPayer?: boolean` echo 추가(모든 분기 set). `HEIR_NO_CORP` 사용 행(*1·*2·⑪·*3·*4·*5·소계·⑬⑭⑮)의 accessor·total을 `isTaxPayer !== false` 가드로 교체 → 비상속인 자연인 자동 빈칸. 비상속인 없는 기존 케이스 동작 불변.

### 4-3. ⑫ 증여세액공제(§28② 후단) — 납세의무자만

heir 루프의 `priorGiftCredit`(`:509-524` 부근) 계산을 `isInheritanceTaxPayer` 가드. 비상속인은 ⑫ 0.
표시(`heir-allocation-summary.ts` ⑫ a/b/c)의 `HEIR_NO_CORP` → 납세의무자 필터로 교체.

### 4-4. ⑩ 비상속인 자연인 증여세액공제(§28② 본문) — 신규

`computeCorporateExemption`(`inheritance-corporate-exemption.ts`) 산식을 **재사용**(메모리 `single-source-engine-helper`):
- a = 증여세 산출세액(`computedTaxByDonee.get(id)`)
- b = 한도 = `floor(computedTax × 해당 증여 과세표준 / taxBase)` (§3의2②와 동일 `corporate-exemption.ts:102`)
- c = Min(a, b) = `nonPayerNaturalGiftCredit`
- ⑩ 표시(`heir-allocation-summary.ts:436-499`): 영리법인 행 + **비상속인 자연인 행** 추가. perHeir accessor를 `["corporate"]` → "비납세의무자(corp ∪ 자연인 비상속인)"로 확장. 라벨로 §3의2②(법인)·§28②본문(자연인) 구분.

### 4-5. UI (HeirComposition.tsx) — 변경 최소

순위 자동판정이므로 **수동 isHeir 토글 불필요**(사용자 결정: 완전 자동). "기타(other)" 입력 그대로 두면 선순위 상속인 존재 시 자동 비상속인 처리. UI 코드 변경 없음(엔진 판정만 교체).

---

## 5. 변경 범위·파일

| Phase | 파일 | 작업 |
|---|---|---|
| A 헬퍼 | `inheritance-gift-common.ts` | `isInheritanceTaxPayer(heir, legalShares)` 신설 |
| B 엔진 배부 | `inheritance-allocation.ts` | **내부**에서 `nonPayerNaturalGiftTaxBase`·`nonPayerNaturalGiftCredit` 계산(`computeCorporateExemption` 산식 재사용) + 직접배부 합산·분모·분자·distributableTax·heir 루프 가드를 `isInheritanceTaxPayer` 기반 일반화 (corp 분기 흡수) |
| C 타입 | `types/inheritance-allocation-result.types.ts` | ⑩ 자연인분 echo 필드 (perHeir 또는 result) |
| D 표시 | `heir-allocation-summary.ts` | ⑪·⑫ 대상 필터 `HEIR_NO_CORP`→납세의무자, ⑩ 비상속인 자연인 행 추가 |
| E anchor | `__tests__/tax-engine/inheritance/` | 신규 |

> orchestrator(`inheritance-tax.ts`) 변경 **불필요** — nonPayer 계산이 calcHeirAllocation 내부(legalShares 재사용).

⚠️ 800줄: `inheritance-allocation.ts` 현재 ~675줄. nonPayer 계산 + 가드 일반화(corp 분기 재사용) +30~40줄 예상 → 경계. 초과 시 nonPayer 산출을 `inheritance-allocation-deductions.ts`로 추출.

---

## 6. anchor 테스트 (Pre-Do 우선)

윤며느리 시나리오(자녀 2인 + 며느리 사전증여 250M):
- **AN-1**: 며느리 `computedTaxShare === 0` (⑪ 배부 제외)
- **AN-2**: 며느리 `priorGiftCredit === 0` (⑫ 제외)
- **AN-3**: ⑩ 비상속인 자연인 공제 = Min(38M, §28② 본문 한도) — 38M echo
- **AN-4**: 정합 — `Σ computedTaxShare(상속인) == distributableTax`, `Σ taxBaseShare(납세의무자) == computedTaxShareDenominator`
- **AN-4b**: `distributableTax == computedTax − corporateExemption − nonPayerNaturalGiftCredit`, ⑪ 합계 = 며느리 §28공제(38M)만큼 감소 (영리법인 면제와 평행)
- **AN-5 회귀**: 4촌 방계 단독상속(1~3순위 부재, other가 유일) → other가 `shares` 멤버 → ⑪·⑫ **정상 포함**(자동판정이 진짜 상속인은 살림)
- **AN-6 회귀**: 영리법인 케이스(기존 corporateExemption) 불변
- **AN-7 회귀**: 기존 상속인 배부(`heir-allocation-summary-table.test.ts` AN-1 등) 불변

> 메모리 `feedback_pre_anchor_verification`: AN-1·AN-5를 Do 전 우선 작성·실행해 현행 버그 실증 + 자동판정이 진짜 상속인 보존하는지 환류.

---

## 7. 후속 — 대습상속인 (별도 계획)

민법 §1001·§1003② 대습상속: 피상속인의 자녀·형제자매가 상속개시 전 사망/결격 시 그 직계비속·배우자(며느리·사위)가 피대습자 지위 승계.

- `computeLegalShares` 확장: 대습상속인을 피대습자 자리에 넣어 상속분 승계(피대습자 상속분을 대습상속인들이 §1010 재분배).
- 모델링(미정): `isSubstituteInheritance` 플래그 확대(현재 §27 할증배제·legatee 전용, 메모리 `project_inheritance_section27_substitute`) vs 새 relation. + 피대습자 식별 필드.
- 대습상속인은 `isInheritanceTaxPayer=true`(shares 멤버) → 본 버그 수정과 자동 정합.
- **별도 계획서·PR**로 진행.

---

## 8. 리스크

- **회귀 최우선**: 자동판정 교체가 기존 정상 케이스(상속인 배부·영리법인·수유자)를 깨지 않아야. AN-5·6·7로 가드.
- **분모/분자 일반화 정밀도**: `nonPayerNaturalGiftTaxBase` 차감이 영리법인 `corporateGiftTaxBase`와 중복·누락 없이 합산되어야(둘 다 "비납세의무자"). BigInt floor 잔액(메모리 `feedback_floor_residual_absorption`).
- **§13 합산기간**: 비상속인 사전증여는 5년 cutoff(§13①2호) — 본 계획은 배부·공제만, 합산은 기존 동작. 합산 정확성은 별도 확인 필요(범위 외 표시).
- **`corporateExemption` 산출 위치**: params 주입인지 내부 계산인지 Do 단계 정밀 확인 후 자연인분 평행 추가.
