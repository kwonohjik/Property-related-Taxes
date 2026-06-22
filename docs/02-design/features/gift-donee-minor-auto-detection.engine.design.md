# 증여세 수증자 주민등록번호 입력으로 미성년 자동판정 — 엔진 설계

> Plan 참조: `docs/00-pm/gift-donee-minor-auto-detection.plan.md`
> 작성일: 2026-06-22
> 법령 검증: KoreanLaw MCP MST 276123 (상증법 §53, §57 시행 20260102) + MST 284415 (민법 §4 시행 20260317) 직접 확인
> 세목: 증여세(gift) · 단계: 1단계 "증여 정보"

---

## Context

현재 증여세 마법사 Step 0 "증여 정보"에서 **수증자 미성년 여부를 수동 ToggleCard**(`isMinorDonee: boolean`)로만 입력받는다.

이 수동 토글은 두 가지 실체 효과를 일으킨다:
1. **상증법 §57① 할증 판정**: `donorGroup === "B"` (grandparent) + `isMinorDonee === true` + `grossGiftValue > 20억` → 40% 할증 (30% 대신)
2. **상증법 §53 증여재산공제 분기**: `deriveDonorRelation(donor, isMinorDonee)` → `lineal_ascendant_minor`(2천만원) vs `lineal_ascendant_adult`(5천만원)

수동 토글은 사용자 실수 위험이 있다. 수증자 **주민등록번호(앞 7자리)** 에서 생년월일을 자동 도출하여 **증여일 기준 만 19세 미만** 여부를 자동 판정하면 오입력을 방지할 수 있다.

**주민번호는 클라이언트 전용 → 서버 미전송** 원칙: 판정 결과(boolean)만 기존 `isMinorDonee` 경로로 흘려보낸다. 이에 따라 **⑨~⑭ (서버/엔진 측) 동기화 지점은 전원 무변경**.

### 재사용 자산 (상속세 이미 구현)

| 자산 | 위치 | 재사용 방식 |
|---|---|---|
| 주민번호 파싱 | `lib/calc/resident-number.ts` `parseResidentNumber(raw)` | 앞 7자리 파싱, 체크섬 없음 → 그대로 호출 |
| 미성년 판정 패턴 | `components/calc/HeirEditor.tsx:257-267` `autoIsMinor` | 동일 로직을 증여세 헬퍼로 이식. HeirEditor 자체 미변경 |
| 날짜 라이브러리 | `date-fns` `differenceInYears` | 만 나이 계산 |

---

## 법령 근거 (KoreanLaw MCP 직접 확인)

### 민법 §4 — 성년 (MST 284415, 시행 20260317 확인)

```
제4조(성년)
사람은 19세로 성년에 이르게 된다.
```

**판정 기준**: 만 19세 미만(`differenceInYears(기준일, 생년월일) < 19`) = 미성년. 만 19세 도달 당일부터 성년.

### 상증법 §53 — 증여재산공제 (MST 276123, 시행 20260102 확인)

```
제53조(증여재산 공제)
거주자가 다음 각 호의 어느 하나에 해당하는 사람으로부터 증여를 받은 경우에는
다음 각 호의 구분에 따른 금액을 증여세 과세가액에서 공제한다.
...
2. 직계존속[...] 으로부터 증여를 받은 경우: 5천만원.
   다만, 미성년자가 직계존속으로부터 증여를 받은 경우에는 2천만원으로 한다.
...
```

**판정 수치 확정**:
- 성년 직계존속 증여공제: 5천만원 (`lineal_ascendant_adult: 50_000_000`)
- 미성년 직계존속 증여공제: 2천만원 (`lineal_ascendant_minor: 20_000_000`)
- 현행 코드 `lib/tax-engine/deductions/gift-deductions.ts:37-38` 수치와 일치 → 변경 불필요

### 상증법 §57① — 할증과세 (MST 276123, 시행 20260102 확인)

```
제57조(직계비속에 대한 증여의 할증과세)
① 수증자가 증여자의 자녀가 아닌 직계비속인 경우에는 증여세산출세액에
   100분의 30(수증자가 증여자의 자녀가 아닌 직계비속이면서 미성년자인 경우로서
   증여재산가액이 20억원을 초과하는 경우에는 100분의 40)에 상당하는 금액을 가산한다.
   다만, 증여자의 최근친(最近親)인 직계비속이 사망하여 그 사망자의 최근친인 직계비속이
   증여받은 경우에는 그러하지 아니하다.
② 할증과세액의 계산방법 등 필요한 사항은 대통령령으로 정한다.
```

**§57② 위임 체인 확인**: 상증령 §47조의2 조회 → NOT_FOUND. 상증령 §46조 § 47조 조회 결과 §57② 할증과세 계산방법 전용 대통령령 조항 별도 없음. 기존 `legal-codes/inheritance-gift.ts:98-102` 주석("KoreanLaw MCP 2026-02 시행 본문 확인, 시행령 매칭 조항 별도 없음")과 일치 → **§57② 위임: 시행령 전용 조항 부재 확인. 현행 산식 §58② 안분식 준용 유지.**

**미성년 판정 기준일**: §57①은 "미성년자인 경우"라고 명시하나 판정 기준일을 별도로 명시하지 않음. 증여세 과세 기준일은 **증여일(증여재산 취득일)** 이므로 `giftDate` 기준으로 판정. 확인 필요로 Plan §9에 명시됨 — 본 설계는 `giftDate` 기준을 채택하되 도입부에 안내.

> **확인 필요**: 상증법 §57① "미성년자" 판정 기준일이 증여일인지에 대한 명문 규정 부재. 증여세 과세 원리(취득일 기준)에 따라 `giftDate` 사용하나, 별도 심판례·유권해석 있으면 갱신 필요.

### 법령 검증 결론표

| 항목 | 판정 | 근거 |
|---|---|---|
| 성년 기준: 만 19세 도달 | 확정 | 민법 §4 본문 직접 확인 |
| 미성년 직계존속 공제 2천만원 | 확정 | 상증법 §53②2호 단서 직접 확인 |
| 성년 직계존속 공제 5천만원 | 확정 | 상증법 §53②2호 본문 직접 확인 |
| §57① 미성년+20억 초과 → 40% | 확정 | 상증법 §57①② 본문 직접 확인 |
| §57① 미성년+20억 이하 → 30% | 확정 | 상증법 §57① 본문 직접 확인 |
| §57② 위임 시행령 별도 조항 | 없음 (기존 판단 재확인) | 상증령 §46, §47, §47조의2 조회 |
| 판정 기준일 = 증여일 | 확인 필요 | 명문 부재, 과세원리 추론 |

---

## ★ 케이스 인벤토리 (법령 본문·단서·각호 전수)

| # | 시나리오 | 법령 근거 | 기대값 | anchor 파일 | 상태 |
|---|---|---|---|---|---|
| M-1 | 주민번호 M(2010년생) + giftDate 2026-02-09 → 만 15세 | 민법 §4 | `computeAutoMinor` → `true` | `gift-donee-minor.test.ts` | ☐ TODO |
| M-2 | 주민번호 M(2005년생) + giftDate 2026-02-09 → 만 21세 | 민법 §4 | `computeAutoMinor` → `false` | 동상 | ☐ TODO |
| M-3 | 경계: 생일 전날 (2007-02-10생, giftDate 2026-02-09) → 만 18세 | 민법 §4 | `computeAutoMinor` → `true` (아직 미성년) | 동상 | ☐ TODO |
| M-4 | 경계: 생일 당일 (2007-02-09생, giftDate 2026-02-09) → 만 19세 | 민법 §4 | `computeAutoMinor` → `false` (당일 성년) | 동상 | ☐ TODO |
| M-5 | 1900년대 코드(1999년생, 세기코드 1/2) | `resident-number.ts` 세기코드 | `computeAutoMinor` → `false` | 동상 | ☐ TODO |
| M-6 | 파싱 실패 ("abc") | D-1 수동 fallback | `computeAutoMinor` → `null` → `resolveIsMinorDonee` fallback | 동상 | ☐ TODO |
| M-7 | 미입력 ("") | D-2 차단 없음 | `computeAutoMinor` → `null` → `resolveIsMinorDonee` → `false` (default) | 동상 | ☐ TODO |
| M-8 | giftDate 미입력 (주민번호 있어도) | — | `computeAutoMinor` → `null` → 수동 fallback | 동상 | ☐ TODO |
| A-8 | 통합: 미성년 주민번호 + 직계존속 → buildGiftTaxInput | 상증법 §53②2호 단서 + §57① | `isMinorDonee:true` + `donorRelation:"lineal_ascendant_minor"` 동기화. gift-api.ts:47·:85·:96 세 경로 모두 (:47·:85 = donorRelation, :96 = isMinorDonee) | `gift-donee-minor.test.ts` | ☐ TODO |
| A-9 | 자동판정 모드 (수동 토글 숨김, `form.isMinorDonee=false`) + 미성년 주민번호 | §5.5 store↔API 2값 분기 차단 | `buildGiftTaxInput` → `donorRelation:"lineal_ascendant_minor"` | 동상 | ☐ TODO |
| A-10 | §53 공제액 변화 검증: 미성년 판정 시 공제 2천만 vs 성년 시 5천만 | 상증법 §53②2호 | 미성년 → `giftDeduction: 20_000_000`, 성년 → `giftDeduction: 50_000_000` | 동상 | ☐ TODO |
| A-11 | §57 할증율 *결과값* 검증: donor=grandparent + 자동판정 미성년 + grossGiftValue>20억 → 40% | 상증법 §57①(미성년+20억 초과 100분의40) | `calculateGiftTax` 결과 `generationSkipSurchargeDetail.surchargeRate === 0.4` (성년·20억 이하 시 0.3) | 동상 | ☐ TODO |
| A-12 | 부담부증여 + 자동판정 미성년 통합: callGiftBurdenedTransferAPI 경로 | 상증법 §53②2호 단서·§57①, 상증법 §88·§159(양도세) | `buildGiftBurdenedTransferBody` 결과의 `burdenedGiftInfo.donorRelation === "lineal_ascendant_minor"` + `isMinorDonee === true` (store 수동값 false 무관) | 동상 | ☐ TODO |

> **A-8/A-9 한계 보강**: A-8/A-9는 `input.donorRelation`·`input.isMinorDonee` 필드 동치만 확인한다. 그러나 엔진은 `isMinorDonee`를 **§53 공제(donorRelation 경유)와 별개로** §57 할증함수에 *독립 인자로* 전달한다(`gift-tax.ts:237` → `calcGiftGenerationSkipSurchargeWithLimit`, `inheritance-gift-common.ts:294-296` `isMinorDonee && currentGiftValue > 2_000_000_000 → 0.4`. 특례 2-스트림 경로 `gift-tax.ts:631`도 동일). 따라서 grandparent+20억 초과 시 할증율 30%→40% **전환을 계산결과로 검증하는 A-11**을 별도 추가한다. 엔진 두 호출 지점(:240·:634)이 모두 resolved `isMinorDonee`를 받는지 확인.

---

## 엔진 설계 원칙 — 주민번호는 클라이언트 전용, 엔진 미전송

```
클라이언트:
  doneeResidentNumber(string) → computeAutoMinor(rn, giftDate) → boolean|null
                                                        ↓
  resolveIsMinorDonee({doneeResidentNumber, giftDate, isMinorDonee}) → boolean
                                                        ↓
  buildGiftTaxInput(form) → GiftTaxInput { isMinorDonee: boolean, donorRelation: DonorRelation, ... }
                                                        ↓
서버/엔진: 기존 GiftTaxInput 그대로 처리 (⑨~⑭ 무변경)
```

**주민번호가 서버에 도달하지 않는 구조** → 개인정보 노출면 최소화 + 서버/엔진/Zod 변경 0.

---

## 신규 헬퍼 파일: `lib/calc/gift-donee-minor.ts`

```ts
import { parseResidentNumber } from "./resident-number";
import { differenceInYears } from "date-fns";

/**
 * 주민번호 + 기준일에서 미성년(만 19세 미만) 자동 판정.
 * 판정 불가(파싱 실패·기준일 미입력·유효하지 않은 날짜) 시 null.
 *
 * 기준: 민법 §4 "19세로 성년에 이르게 된다" → 생일 당일 성년.
 * differenceInYears(baseDate, birthDate) < 19 → 미성년.
 *
 * 판정 기준일 = giftDate (증여일). 상증법 §57① 판정 기준일 명문 부재.
 * 증여세 과세원리(취득일 기준)에 따라 giftDate 사용. 확인 필요.
 */
export function computeAutoMinor(
  residentNumber: string | undefined,
  baseDate: string | undefined,
): boolean | null {
  const parsed = parseResidentNumber(residentNumber ?? "");
  if (!parsed || !baseDate) return null;
  const base = new Date(baseDate);
  const birth = new Date(parsed.birthDate);
  if (isNaN(base.getTime()) || isNaN(birth.getTime())) return null;
  return differenceInYears(base, birth) < 19; // 민법 §4
}

/**
 * 미성년 단일 진실 — 주민번호 자동판정 우선, 불가 시 수동 토글 fallback (D-1).
 *
 * 3중 패턴(memory mirror-pattern):
 *   UI 표시 · API 변환(④) · validate(⑧) 세 곳 모두 이 함수 단일 호출.
 *
 * useEffect → store 미러링 금지(memory feedback_useeffect_store_mirror_forbidden):
 *   이 함수는 derive 전용 — store.isMinorDonee에 자동판정 결과를 쓰지 않는다.
 *   store.isMinorDonee는 수동 fallback 값으로만 유지.
 */
export function resolveIsMinorDonee(form: {
  doneeResidentNumber?: string;
  giftDate?: string;
  isMinorDonee: boolean;
}): boolean {
  const auto = computeAutoMinor(form.doneeResidentNumber, form.giftDate);
  return auto ?? form.isMinorDonee;
}
```

---

## 엔진 input 타입 변경 — 없음

`GiftTaxInput` (`lib/tax-engine/types/inheritance-gift.types.ts:593-594`) 은 **무변경**.
`isMinorDonee: boolean` 필드가 그대로 사용되며, 주민번호는 클라이언트에서 소비 후 버린다.

---

## 엔진 result 타입 변경 — 없음

`GiftTaxResult`도 무변경. 자동판정 여부를 결과에 노출하지 않는다.
(주민번호 결과/PDF 노출 금지 — §7 확인 대상)

---

## 계산 알고리즘 (변경 지점만)

### Phase 1: 헬퍼 신규 (`lib/calc/gift-donee-minor.ts`)

1. `computeAutoMinor(residentNumber, baseDate)` — 주민번호 파싱 후 만 나이 `< 19` 판정.
2. `resolveIsMinorDonee(form)` — `auto ?? form.isMinorDonee`. 3중 패턴 단일 진실.

### Phase 2: 폼 상태 확장 (① ②)

`FormState` (`components/calc/gift-tax-form-shared.tsx:56`):
```ts
doneeResidentNumber: string;  // 신규 — 주민번호 (클라이언트 전용, API 미전송)
```

`INITIAL_FORM` (`gift-tax-form-shared.tsx:119`):
```ts
doneeResidentNumber: "",
```

### Phase 3: API 변환 업데이트 (④)

미성년 판정에 의존하는 할당 사이트는 **`buildGiftTaxInput` 내 3곳**이다(grep 실측):

- `gift-api.ts:47` — `deductionInput.donorRelation = deriveDonorRelation(form.donor, form.isMinorDonee)`
- `gift-api.ts:85` — top-level `donorRelation = deriveDonorRelation(form.donor, form.isMinorDonee)`
- `gift-api.ts:96` — `isMinorDonee: form.isMinorDonee`

세 곳 모두 `resolveIsMinorDonee(form)` 기준으로 전환한다. **§57① 40% 할증은 엔진(`gift-tax.ts:237` → `calcGiftGenerationSkipSurchargeWithLimit`)이 `input.isMinorDonee`(= `gift-api.ts:96`)를 직접 읽으므로** :96을 누락하고 :47·:85(donorRelation 2곳)만 전환하면, 자동판정 minor=true·수동 토글 false인 경우(A-9) §53 공제는 `lineal_ascendant_minor`로 맞지만 §57 40% 할증이 발동하지 않아 **설계 목표 #1(line 15·401 '주민번호→자동 미성년 배지→§57 40% 결과')과 직접 모순**된다.

```ts
// 변경 전 (3곳):
//   :47  deductionInput.donorRelation = deriveDonorRelation(form.donor, form.isMinorDonee)
//   :85  donorRelation = deriveDonorRelation(form.donor, form.isMinorDonee)
//   :96  isMinorDonee: form.isMinorDonee

// 변경 후 (3곳 모두 resolvedMinor 기준):
const resolvedMinor = resolveIsMinorDonee(form);
// :47, :85
donorRelation: deriveDonorRelation(form.donor, resolvedMinor)
// :96
isMinorDonee: resolvedMinor
```

**주민번호 자체는 buildGiftTaxInput 반환값에 포함하지 않는다 — 서버 미전송.**

#### ④ 두 번째 변환 경로 — 부담부증여 양도세 (`gift-burdened-transfer-api.ts`)

증여세 폼은 부담부증여 시 `callGiftBurdenedTransferAPI(item, form)`(`GiftTaxForm.tsx:173`)로 양도세를 함께 계산한다. 이 변환 함수 `gift-burdened-transfer-api.ts`는 `buildGiftTaxInput`을 거치지 않고 폼 필드를 **직접 read**한다(grep 실측):

- `gift-burdened-transfer-api.ts:117` — `const donorRelation = form.donorRelation;` (store 값. burdened-gift-apportionment.ts:360가 역매핑)
- `gift-burdened-transfer-api.ts:119` — `const isMinorDonee = form.isMinorDonee;`

이 두 read도 `resolveIsMinorDonee(form)` 기준으로 전환한다:

```ts
const resolvedMinor = resolveIsMinorDonee(form);
const donorRelation = deriveDonorRelation(form.donor, resolvedMinor); // :117
const isMinorDonee = resolvedMinor;                                   // :119
```

전환하지 않으면 부담부증여 양도세/증여재산평가(§61 층별가감·burdened-gift-apportionment.ts:360 역매핑) 입력이 자동판정 미성년을 반영하지 못하고, Phase 4에서 store `donorRelation` set을 제거할 경우 INITIAL `lineal_ascendant_adult`·`isMinorDonee=false`로 stale 고정되어 buildGiftTaxInput 본계산과 **§53 관계·§57 할증이 2값 분기**된다. 검증은 A-12 anchor.

### Phase 4: onChange store set 유지 + 소비처 derive 통일 (⑤ — donorRelation 정합)

현재 onChange(:524·:567)에서 `store.donorRelation` 을 직접 set한다.
자동판정 도입 후 주민번호 변경 시 store.isMinorDonee가 false로 남으면서 store.donorRelation이 `lineal_ascendant_adult`를 유지하지만, API 변환(④)에서 `resolveIsMinorDonee=true`로 derive되어 **store ↔ API 2값 분기** 모순이 발생한다.

#### ⚠️ "단일 진실(buildGiftTaxInput 단독 derive)" 전제 오류 — 소비처 전수 enumerate

초안은 `form.donorRelation`(store) 소비처가 `buildGiftTaxInput`(gift-api.ts:47·:85)뿐이라 가정했으나, **실측 결과 추가 소비처가 존재**한다. store set만 제거하면 이 소비자들은 자동판정 결과를 반영하지 못하고 INITIAL `lineal_ascendant_adult`에 동결되어, "한 곳의 분기를 차단하며 다른 경로에서 같은 2값 분기를 재발"시킨다(Surgical 위반·미검토 트레이드오프).

`form.donorRelation` / `form.isMinorDonee` (store) 소비처 전수:

| 소비처 | 위치 | read 내용 | store set 제거 시 영향 |
|---|---|---|---|
| buildGiftTaxInput (④ 본계산) | `gift-api.ts:47·:85·:96` | donorRelation 2곳·isMinorDonee 1곳 | resolveIsMinorDonee 전환으로 정합 (Phase 3) |
| 부담부증여 양도세 (④ 2번째) | `gift-burdened-transfer-api.ts:117·:119` | `form.donorRelation`·`form.isMinorDonee` 직접 read | **stale 고정** → 양도세 §53관계·§57할증 2값 분기 |
| 동시증여 행 seed | `GiftCreditChecklist.tsx:308` | 새 행 `{ donorRelation: form.donorRelation, ... }` seed (gift-api.ts:56 경유 엔진 §53의2 sameGroup 안분) | **stale 기본값** → 증여자/미성년 변경해도 새 행 관계 미갱신 silent default drift |

#### 채택안 — (A) Surgical 최소: store set 유지 + 전 소비처 derive

store `donorRelation` 직접 set은 **제거하지 않는다**(:524·:567 유지). 대신 미성년 판정에 의존하는 **모든 소비처를 `resolveIsMinorDonee(form)` 기반 derive로 통일**하여 단일 진실을 헬퍼 레벨에서 확보한다:

- `buildGiftTaxInput`: gift-api.ts:47·:85·:96 → `resolveIsMinorDonee(form)` (Phase 3)
- `buildGiftBurdenedTransferBody`: gift-burdened-transfer-api.ts:117·:119 → `deriveDonorRelation(form.donor, resolveIsMinorDonee(form))` / `resolveIsMinorDonee(form)` (Phase 3 두 번째 경로)
- `GiftCreditChecklist.tsx:308` seed: `form.donorRelation` 대신 `deriveDonorRelation(form.donor, resolveIsMinorDonee(form))`로 동일 derive (derive 헬퍼 주입)

이 방식은 store↔API 분기를 **헬퍼 단일 호출**로 차단하므로 onChange set을 굳이 제거할 필요가 없고, 제거 시 발생하는 stale 소비처 문제(부담부증여·동시증여 seed)를 모두 회피한다.

> **대안 (B)** — store set 제거 후 전 소비처 derive 전환: 변경 범위가 (A)보다 크고(소비처 3곳 모두 store 대신 derive로 재배선) UI 표시도 useMemo로 derive해야 하므로 Surgical 원칙상 (A)를 우선 채택. 단 (A)에서 store.donorRelation은 더 이상 단일 진실이 아니라 "수동 fallback·표시용"으로만 의미를 가진다(엔진 전송값은 항상 헬퍼 derive).

> 어느 안이든 `useEffect → store 미러링 금지` 정책 준수: 자동판정 결과를 useEffect로 store에 쓰지 않는다. derive는 onChange/useMemo·변환 함수 내부에서만 수행.

### Phase 5: UI 거동 (⑤)

직계존속 증여 시에만 노출 (기존 노출 조건 `father/mother/grandparent` 유지):

```
[수증자 주민등록번호]  (선택 — hint: YYMMDD-GXXXXXX)  ← 신규 text input
   ↓ parseResidentNumber 성공 + giftDate 있음
   ├─ 자동판정 성공 → 읽기전용 배지 표시
   │    "생년월일 2010-05-01 · 증여일 기준 만 15세 → 미성년자"
   │    수동 ToggleCard(isMinorDonee) 숨김
   └─ 파싱 실패 / 미입력 / giftDate 없음
        → 기존 수동 ToggleCard 노출 (fallback, D-1)
```

- 주민번호 input `onChange` → `set({ doneeResidentNumber })` 만 (cross-field set 없음 → 미러링 회피).
- 미성년 여부·배지는 `useMemo(resolveIsMinorDonee)` 로 derive.
- 자동판정 배지는 결과 표시 전용 — `isMinorDonee` store 값 미변경.
- 채택안 (A)에서는 store `donorRelation` set(:524·:567)을 **유지**한다(부담부증여·동시증여 seed의 stale 회피). 엔진 전송값은 두 변환 함수(④ buildGiftTaxInput·④' buildGiftBurdenedTransferBody)·seed(④'' GiftCreditChecklist:308)가 모두 `resolveIsMinorDonee` 기반 derive로 단일화하므로 store 값과 분기되지 않는다.

### Phase 6: validate 검토 (⑧ — 변경 없음)

`validateStep(step=0)` 위치: `gift-tax-form-shared.tsx:258`. `lib/calc/gift-validate.ts` 부재 — 인라인 검증.

D-2(선택 입력·차단 없음) 결정에 따라 `doneeResidentNumber`/`isMinorDonee` 관련 차단 validation **추가하지 않는다**. UI 통과↔validate 차단 모순 없음.

`resolveIsMinorDonee` 가 `validateStep` 내부에서도 동일하게 사용 가능하나(3중 패턴), 차단 로직이 없으므로 validate 변경 불필요. 추후 차단 정책 추가 시 이 헬퍼를 그대로 호출.

---

## Silent fallback / 자동 안분 후보 식별

| 필드 | fallback 방식 | 판단 |
|---|---|---|
| `doneeResidentNumber` 미입력 | `computeAutoMinor` → `null` → `form.isMinorDonee` | 명시 fallback (D-1) — 자동 안분 아님 |
| `giftDate` 미입력 | `computeAutoMinor` → `null` → `form.isMinorDonee` | 명시 fallback — 판정 불가 시 수동값 |
| `isMinorDonee` (수동) | `false` (INITIAL_FORM) | D-2: 차단 없음, 기존 동작 보존 |

자동 안분 fallback 금지 정책(memory `feedback_no_silent_apportion_fallback`) 적용: 본 건은 "주민번호 파싱 불가 시 수동 값으로 명시 fallback"이며 **침묵 자동채움이 아님**.

---

## 14개 동기화 지점 영향 매트릭스

| # | 지점 | 파일 | 변경 | 내용 |
|---|---|---|---|---|
| ① | 폼 상태 | `gift-tax-form-shared.tsx:56` | **변경** | `doneeResidentNumber: string` 추가 |
| ② | initial | `gift-tax-form-shared.tsx:119` | **변경** | `doneeResidentNumber: ""` |
| ③ | normalize | — | 경미 | pass-through `.trim()` 또는 없음 (자동 안분 fallback 아님) |
| ④ | API 변환 (본계산) | `lib/calc/gift-api.ts:47·:85·:96` | **변경** | `resolveIsMinorDonee(form)` 기준으로 3곳 전환(:47·:85 donorRelation, :96 isMinorDonee). `doneeResidentNumber` 자체는 미포함 |
| ④' | API 변환 (부담부증여 양도세) | `lib/calc/gift-burdened-transfer-api.ts:117·:119` | **변경** | `callGiftBurdenedTransferAPI` 경로. `form.donorRelation`(:117)·`form.isMinorDonee`(:119) 직접 read → `deriveDonorRelation(form.donor, resolveIsMinorDonee(form))` / `resolveIsMinorDonee(form)` 전환. buildGiftTaxInput 미경유 |
| ④'' | 동시증여 행 seed | `components/calc/gift/GiftCreditChecklist.tsx:308` | **변경** | 새 행 seed `donorRelation: form.donorRelation` → `deriveDonorRelation(form.donor, resolveIsMinorDonee(form))` (gift-api.ts:56 경유 §53의2 sameGroup 안분 입력) |
| ⑤ | UI 위젯 | `gift-tax-form-shared.tsx:605-621` | **변경** | 주민번호 input + 자동 배지 + 토글 fallback. 채택안 (A): onChange set(:524·:567) store `donorRelation` **유지**(엔진 전송값은 ④·④'·④''가 derive 단일화) |
| ⑥ | 사이드바 | — | N/A | gift 사이드바 미사용 |
| ⑦ | 결과 카드 | `GiftResultView.tsx` 등 | 확인만 | 주민번호 결과/PDF 미노출 확인. §53 공제액 변화 자동 반영(엔진 무변경) |
| ⑧ | validate | `gift-tax-form-shared.tsx:258` | 무변경 | D-2(차단 없음) → no-op. `gift-validate.ts` 부재 — 인라인. 3중 패턴: `resolveIsMinorDonee` 호출 가능하나 차단 추가 안 함 |
| ⑨ | Zod enum | `app/api/calc/gift/route.ts` | **무변경** | 핵심 안전장치 |
| ⑩ | superRefine | 동상 | **무변경** | |
| ⑪ | 자산-수준 | — | N/A | gift는 form-global |
| ⑫ | Zod 입력 객체 | 동상 | **무변경** | 주민번호 미전송 → 스키마 무관 |
| ⑬ | body spread | `lib/calc/gift-api.ts` | **무변경** | |
| ⑭ | Route 엔진 input | `app/api/calc/gift/route.ts` | **무변경** | |

**⑨~⑭ 전원 무변경이 핵심 안전장치** — 주민번호가 서버에 도달하지 않으므로.

---

## Pre-Do anchor 시나리오

파일: `__tests__/calc/gift-donee-minor.test.ts` (신규)

### 헬퍼 단위 (A-1~A-7) — Do 진입 전 가장 먼저 실증

```ts
// A-1: M-1 일반 미성년
expect(computeAutoMinor("1005013XXXXXX", "2026-02-09")).toBe(true);
// → 2010-05-01생, 증여일 기준 만 15세

// A-2: M-2 일반 성년
expect(computeAutoMinor("0501013XXXXXX", "2026-02-09")).toBe(false);
// → 2005-01-01생, 만 21세

// A-3: M-3 경계 — 생일 전날 (만 18세, 미성년)
expect(computeAutoMinor("0702103XXXXXX", "2026-02-09")).toBe(true);
// → 2007-02-10생. differenceInYears(2026-02-09, 2007-02-10) = 18 → true

// A-4: M-4 경계 — 생일 당일 (만 19세 도달, 성년)
expect(computeAutoMinor("0702093XXXXXX", "2026-02-09")).toBe(false);
// → 2007-02-09생. differenceInYears(2026-02-09, 2007-02-09) = 19 → false (민법 §4)

// A-5: M-6 파싱 실패 → null + 수동 fallback
expect(computeAutoMinor("abc", "2026-02-09")).toBeNull();
expect(resolveIsMinorDonee({ doneeResidentNumber: "abc", giftDate: "2026-02-09", isMinorDonee: true })).toBe(true);

// A-6: M-7 미입력 → null + default false
expect(resolveIsMinorDonee({ doneeResidentNumber: "", giftDate: "2026-02-09", isMinorDonee: false })).toBe(false);

// A-7: M-8 giftDate 미입력
expect(computeAutoMinor("1005013XXXXXX", undefined)).toBeNull();
```

> **A-3/A-4 경계(만 19세 정의)를 가장 먼저 실증** — `differenceInYears` 거동이 "생일 당일=성년"임을 확정한 뒤 나머지 일괄.

### 통합 경로 (A-8·A-9)

```ts
// A-8: buildGiftTaxInput 통합 — isMinorDonee + donorRelation 동기화
// gift-api.ts:47·:85·:96 세 경로 모두 동일 derive 검증 (:47·:85 donorRelation, :96 isMinorDonee)
const input = buildGiftTaxInput({
  ...INITIAL_FORM,
  donor: "father",
  doneeResidentNumber: "1005013XXXXXX",  // 2010-05-01생 미성년
  giftDate: "2026-02-09",
  isMinorDonee: false,  // 수동 false지만 자동판정 true 우선
});
expect(input.isMinorDonee).toBe(true);
expect(input.deductionInput.donorRelation).toBe("lineal_ascendant_minor");
// → §53 공제 2천만원 적용 확인 (gift-deductions.ts:38)

// A-9: store↔API 2값 분기 차단 — 수동 토글 false인 상태에서 자동판정 결과 우선
const inputA9 = buildGiftTaxInput({
  ...INITIAL_FORM,
  donor: "grandparent",
  doneeResidentNumber: "1005013XXXXXX",  // 미성년 자동판정
  giftDate: "2026-02-09",
  isMinorDonee: false,  // 수동 토글 숨김 → false 잔류
});
expect(inputA9.donorRelation).toBe("lineal_ascendant_minor");
expect(inputA9.isMinorDonee).toBe(true);
// ← store.isMinorDonee=false이나 buildGiftTaxInput이 resolveIsMinorDonee로 true 반환

// A-10: §53 공제액 변화
// 성년: lineal_ascendant_adult → 50,000,000
// 미성년: lineal_ascendant_minor → 20,000,000
// (gift-deductions.ts:37-38 직접 단위 테스트로 검증)

// A-11: §57 할증율 *결과값* — donor=grandparent + 자동판정 미성년 + grossGiftValue>20억 → 40%
// isMinorDonee가 §53(donorRelation 경유)뿐 아니라 §57 할증함수에 독립 인자로 전달됨을 결과로 검증.
// inheritance-gift-common.ts:294-296 → isMinorDonee && currentGiftValue > 2_000_000_000 ? 0.4 : 0.3
const resultA11 = calculateGiftTax(buildGiftTaxInput({
  ...INITIAL_FORM,
  donor: "grandparent",
  doneeResidentNumber: "1005013XXXXXX",  // 미성년 자동판정
  giftDate: "2026-02-09",
  isMinorDonee: false,                    // 수동 false지만 자동판정 true 우선
  // grossGiftValue > 20억이 되도록 giftItems 구성
}), ratesMap);
expect(resultA11.generationSkipSurchargeDetail?.surchargeRate).toBe(0.4);
// 엔진 두 호출 지점(gift-tax.ts:237·:631 특례 2-스트림)이 모두 resolved isMinorDonee 수신 확인

// A-12: 부담부증여 + 자동판정 미성년 — callGiftBurdenedTransferAPI 경로 (buildGiftTaxInput 미경유)
// gift-burdened-transfer-api.ts:117·:119가 resolveIsMinorDonee 기반 derive로 전환되었는지 검증.
// 반환 타입은 Record<string, unknown>(gift-burdened-transfer-api.ts:65·68)이므로 타입 단언 후 접근.
const body = buildGiftBurdenedTransferBody(item, {
  ...INITIAL_FORM,
  donor: "father",
  doneeResidentNumber: "1005013XXXXXX",  // 미성년 자동판정
  giftDate: "2026-02-09",
  isMinorDonee: false,                    // store 수동값 false 무관
});
const info = body.burdenedGiftInfo as { donorRelation: string; isMinorDonee?: boolean };
expect(info.donorRelation).toBe("lineal_ascendant_minor");
expect(info.isMinorDonee).toBe(true);
```

---

## 기존 동작 100% 보존 원칙

- `doneeResidentNumber` 미입력("") → `computeAutoMinor` null → `form.isMinorDonee` fallback → 기존과 동일
- `resolveIsMinorDonee` 에 `doneeResidentNumber: undefined` 가능 → null → fallback → 기존과 동일
- `isMinorDonee: false` (INITIAL_FORM) → 자동판정 null이면 false 유지 → 기존 동작 100% 보존
- `isSubstituteGift`·`isGenerationSkip`·§57 할증 등 기존 필드 무변경
- 기존 `case-*.test.ts` 등 증여세 테스트 전부 무변경 통과 필수

---

## 구현 순서 (Do 단계)

1. **`lib/calc/gift-donee-minor.ts` 신규** — `computeAutoMinor` + `resolveIsMinorDonee`
   - verify: Pre-Do anchor A-1~A-7 통과 (특히 A-3/A-4 경계 가장 먼저)
2. **① 폼 상태 + ② INITIAL_FORM** — `doneeResidentNumber: string` / `""` 추가
   - verify: `npx tsc --noEmit` 0건
3. **④ `gift-api.ts` 업데이트** — `:47`·`:85`·`:96` 세 곳 `resolveIsMinorDonee(form)` 전환
   - verify: A-8·A-9·A-11 anchor 통과 (§53 관계 + §57 할증율 0.4 결과값)
4. **④' `gift-burdened-transfer-api.ts:117·:119` + ④'' `GiftCreditChecklist.tsx:308` derive 전환**
   - verify: A-12 anchor 통과 (부담부증여 경로 미성년 정합) + 동시증여 새 행 관계 갱신 확인
   - 채택안 (A): store `donorRelation` set(:524·:567)은 유지(제거 안 함)
5. **⑤ UI — 주민번호 input + 자동 배지 + 토글 fallback** (Step 0 직계존속 조건부)
   - verify: 렌더 + `tsc` + 배지 표시 / 수동 토글 fallback 거동
6. **⑧ validate 검토** — `validateStep(step=0)` D-2 → no-op 확인
   - verify: step0 무변경 확인
7. **⑦ 결과/PDF 주민번호 미노출 확인** — grep 전수
   - verify: 출력 경로 점검 (결과 카드·PDF 미노출)
8. **E2E** — `e2e/gift-*.spec.ts` 에 주민번호 입력 → 자동 미성년 배지 → §57 40% 결과 1건
   - verify: spec green
9. **회귀** — `npx vitest run __tests__/tax-engine/gift/` + `npm test`
   - verify: 0 회귀
10. **코드 품질** — `/code-review` High/Medium 0 → 커밋

---

## Definition of Done

- [ ] Pre-Do anchor A-1~A-12 통과 (A-3/A-4 경계 최우선, A-11 §57 결과값, A-12 부담부증여)
- [ ] 14지점: 클라이언트 ①②③④(④'·④'' 포함)⑤⑦⑧ 동기화 · ⑨~⑭ 무변경 grep 확인
- [ ] `isMinorDonee` ↔ `donorRelation` 자동/수동 모두 정합 (A-8·A-9·A-11·A-12)
- [ ] `gift-api.ts:47·:85·:96` 세 경로 모두 `resolveIsMinorDonee` 기준 전환 확인 (:96 isMinorDonee 누락 시 §57 할증 미발동)
- [ ] `gift-burdened-transfer-api.ts:117·:119` + `GiftCreditChecklist.tsx:308` derive 전환 확인 (form.donorRelation/isMinorDonee 직접 read 잔존 grep 0건)
- [ ] 주민번호 서버 미전송 (④ 미포함) + 결과/PDF 미노출 확인
- [ ] `npx tsc --noEmit` 0건
- [ ] `npx vitest run __tests__/tax-engine/gift/` 통과
- [ ] `npm test` 전체 회귀 0
- [ ] gift E2E 신규 1건 + 기존 gift E2E green
- [ ] `/code-review` High/Medium 0

## SCOPE OUT

- 주민번호 체크섬 검증 (사용자 명시 생략)
- 외국인등록번호 별도 처리
- 주민번호 암호화 저장 (상속세 HeirEditor와 동일 수준 — 로컬 sessionStorage 평문)
- 상속세 `HeirEditor.autoIsMinor` 와의 공용 추출 (`isMinorAt(birthDate, baseDate)`) — 향후 후보로만 메모
- 판정 기준일 §57① 명문 근거 별도 유권해석 조사 — 도입 후 갱신 예정

## 리스크

| 리스크 | 완화 |
|---|---|
| `form.donorRelation`/`isMinorDonee` 소비처 누락(부담부증여 :117·:119·동시증여 seed :308) | 채택안 (A): store set 유지 + 전 소비처 derive 전환. A-12 anchor + grep `form.donorRelation`·`form.isMinorDonee` 직접 read 잔존 점검 |
| `gift-api.ts:47`·`:85`·`:96` 세 경로 중 하나 누락 시 2값 분기 | A-8(donorRelation)·A-11(§57 isMinorDonee 결과값) anchor로 세 경로 검증. 특히 :96 누락 시 §57 40% 미발동 |
| §53 공제액 변화가 결과 카드에 미반영 | 엔진 무변경 → donorRelation 전환만으로 자동 반영. A-10 anchor 확인 |
| §57 할증율 미전환(isMinorDonee 미derive) | A-11로 grandparent+20억초과 시 surchargeRate 0.4 결과값 직접 검증 |
| `differenceInYears` "생일 당일" 거동 불일치 | A-3/A-4를 Pre-Do 첫 번째로 실증 |
