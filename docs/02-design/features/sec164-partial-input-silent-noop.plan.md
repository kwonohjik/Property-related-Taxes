# §164④·⑥·⑤~⑦ 부분 입력이 조용히 무시된다 (all-or-nothing opt-in의 침묵 실패)

> **상태**: 📋 계획 (미착수)
> **세목**: 양도소득세 — 「소득세법 시행령」 §163⑨1호·2호 · §164④·⑤·⑥·⑦
> **선행**: [`gift-163-9-clause-1-2-max.plan.md`](gift-163-9-clause-1-2-max.plan.md) §12(후속으로 기록) · #1103

---

## 1. 한 줄 요약

§163⑨1호·2호의 **②(§164④~⑦ 취득당시 기준시가)** 는 필수 필드가 **모두** 채워져야 payload가 생성된다.
일부만 입력하면 빌더가 `{}`를 반환해 **②가 계산에서 사라지고 ① 단독으로 계산되는데, 아무 경고도 없다**.

사용자에게는 **"입력했는데 반영되지 않는"** 상태다. 화면·결과 어디에도 그 사실이 드러나지 않는다.

---

## 2. 법령 — ②는 선택이 아니라 max의 한쪽이다

| 조항 | 문언 |
|---|---|
| **§163⑨1호** | "1990년 8월 30일 개별공시지가가 고시되기 전에 상속 또는 증여받은 **토지** … 평가한 가액과 **제164조제4항의 규정에 의한 가액 중 많은 금액**" |
| **§163⑨2호** | "…기준시가가 고시되기 전에 상속 또는 증여받은 **건물** … 평가한 가액과 **제164조제5항 내지 제7항의 규정에 의한 가액 중 많은 금액**" |

⇒ ②는 **비교 대상 자체**다. 누락되면 max의 한쪽이 사라져 **취득가액이 과소 산정**될 수 있다
(②가 ①보다 큰 경우). 「법령상 요구되는 비교를 수행하지 않는 것」이므로 정확성 문제다.

⚠️ **세액 방향으로 정당화하지 않는다** — ②가 크면 취득가액이 늘어 납세자에게 유리하지만,
판단 기준은 **법규정 정합**이다(memory `feedback_no_unfavorable_application_without_legal_basis`의 역방향도 같다).

---

## 3. 실태 — 실측 매트릭스 (2026-08-06 probe)

throwaway probe로 각 경로에 **필수 필드를 1개만 비워** 넣고 payload·validate를 동시에 측정했다.

| # | 경로 | 취득원인 | payload | validate | 판정 |
|---|---|---|---|---|---|
| 1 | 주택 §164⑤~⑦ | 상속 | `{}` | `null` | 🔴 **침묵** |
| 2 | 상가 §164⑥ | 상속 | `{}` | **에러 메시지** | ✅ 차단 |
| 3 | 상가 §164⑥ | **증여** | `{}` | `null` | 🔴 **침묵** |
| 4 | 토지 §164④ | **증여** | `{}` | `null` | 🔴 **침묵** |
| 5 | 토지 §164④ (비환산 §163⑨ 경로) | 상속 | `{}` | `null` | 🔴 **침묵** |

⇒ **5개 경로 중 4개가 침묵한다.** 유일한 차단은 **상속 상가**뿐이다.

### 3.1 빌더별 필수 필드 (실측 file:line)

| 경로 | 필수 필드 | 조기 반환 |
|---|---|---|
| **주택** `buildInheritedHouseValuationPayload` | `inhHouseValLandArea` · `…LandPricePerSqmAtTransfer` · `…LandPricePerSqmAtFirst` · `…HousePriceAtFirst` (4) | `transfer-tax-api-inheritance.ts:177` |
| ↳ 추가 조건 | 1990.8.30. **前**: 등급 3종 + `pre1990PricePerSqm_1990` **또는** `…AtInheritance`<br>1990.8.30. **後**: `…LandPricePerSqmAtInheritance` | `:206` · `:207` |
| **상가** `buildCommercialInheritanceValuationPayload` | 면적 3(`cbExclusiveArea`·`cbSharedArea`·`cbLandArea`) + 금액 5(`cbUnitPriceAtFirstOrAcq`·`cbLandPricePerSqmAtAcq`·`cbLandPricePerSqmAtFirst`·`cbBuildingStdPriceAtAcq`·`cbBuildingStdPriceAtFirst`) = **8** | `:128-139` |
| **토지** `buildPre1990LandPayload` | 등급 3종 + `acquisitionArea` + `pre1990PricePerSqm_1990` = **5** | `transfer-tax-api-helpers.ts:400` |

⚠️ **주택은 total이 가변이다** — 기준일이 1990.8.30. 前後냐에 따라 필요 필드가 달라지고,
前이면 「등급 3종+1990가」와 「상속개시일 단가」가 **택일**이다. 단순 카운트로 판정할 수 없다(§5.2).

### 3.2 유일한 차단(상속 상가)이 어떻게 되어 있나

`transfer-tax-validate-asset.ts:124-140`

```ts
const inhDate164 = asset.inheritanceStartDate || asset.acquisitionDate || "";
if (inhDate164 && inhDate164 < "2005-01-01") {
  const filled = areas164.filter(f => parseDecimal(f) > 0).length
               + amounts164.filter(f => parseAmount(f) > 0).length;
  if (filled > 0 && filled < 8) return `${label}: §164⑥ … 8개 항목을 모두 입력하거나 모두 비워두세요.`;
}
```

**`filled > 0 && filled < 8`** — "하나라도 손댔으면 끝까지" 규약. 이 패턴이 정본이다.

두 가지 문제가 함께 있다:

1. **상속 전용 블록 안에 있다** — `:117`이 `acquisitionCause === "inheritance"`로 게이트한다.
   #1103이 상가 §164⑥ **입력 UI를 증여에 열었지만 validate는 따라가지 않았다**(경로 3).
2. **필드 목록이 validate에 하드코딩됐다** — 빌더(`:128-139`)와 **따로 관리**된다. 빌더에 필드가
   늘면 validate의 `8`과 배열이 조용히 낡는다.
3. **기준일 파생이 인라인이다**(`:126`) — #1103이 도입한 `deriveSec163_9BaseDate`를 쓰지 않아,
   취득원인을 상속→증여로 바꾼 자산의 stale `inheritanceStartDate`에서 UI·API와 어긋난다.

---

## 4. 갭 정리

| # | 대상 | 현행 | 기대 |
|---|---|---|---|
| **P-1** | 주택 §164⑤~⑦ (상속·증여) | 침묵 | 부분 입력 시 차단 |
| **P-2** | 상가 §164⑥ **증여** | 침묵 | 상속과 동일 차단 |
| **P-3** | 토지 §164④ (상속·증여 §163⑨ 경로) | 침묵 | 부분 입력 시 차단 |
| **P-4** | 필드 목록 이중 관리 | 빌더·validate 각자 | **단일 소스** 공유 |
| **P-5** | 상가 차단의 기준일 파생 | 인라인(`:126`) | `deriveSec163_9BaseDate` |

---

## 5. 설계

### 5.1 A안(권고) — 필드 그룹을 단일 소스로 추출하고 빌더·validate가 공유

신규 `lib/calc/sec164-required-fields.ts`:

```ts
/** 한 경로의 opt-in 충족 상태. total은 조합에 따라 가변이다(주택). */
export interface Sec164FieldStatus {
  filled: number;
  total: number;
  /** 사용자에게 보일 항목 이름들 — 에러 메시지에 그대로 쓴다 */
  missing: string[];
}
export function sec164HouseStatus(asset: AssetForm): Sec164FieldStatus | null;
export function sec164CommercialStatus(asset: AssetForm): Sec164FieldStatus | null;
export function sec164LandStatus(asset: AssetForm): Sec164FieldStatus | null;
```

- **빌더**는 `status.filled === status.total`일 때만 payload를 만든다(현행 조기 반환을 이 함수로 대체).
- **validate**는 `0 < filled < total`이면 차단하고 `missing`을 메시지에 넣는다.
- `null` 반환 = 그 경로가 애초에 대상이 아님(자산종류·취득원인·기간 밖) → 검사도 payload도 없음.

⇒ **필드가 늘어도 한 곳만 고치면 양쪽이 따라온다.** 상속 상가의 하드코딩 `8`이 사라진다(P-4).

⚠️ 대상 판정은 **`isSec163_9Cause`·`deriveSec163_9BaseDate`를 그대로 쓴다**(P-5) — #1103이 만든
단일 소스. 여기서 다시 파생하면 같은 병이 재발한다
(memory `feedback_shared_predicate_argument_parity`).

### 5.2 주택의 가변 total — 카운트만으로 판정하지 않는다

기준일 1990.8.30. **前**에는 ③의 분자 경로가 둘이라 **택일**이다:

```
필수 4  +  ( 등급3종 + 1990㎡당가  OR  상속개시일 단가 )
```

⇒ `total`을 단일 숫자로 두면 "등급만 넣은 사용자"와 "단가만 넣은 사용자" 중 한쪽을 잘못 차단한다.
**택일 그룹을 별도 타입으로 표현**한다:

```ts
type FieldGroup =
  | { kind: "all"; fields: FieldSpec[] }
  | { kind: "oneOf"; groups: FieldGroup[] };   // 하나의 하위 그룹이 완성되면 충족
```

`filled/total`은 **선택된 분기 기준**으로 계산한다(사용자가 손댄 쪽을 우선 — 둘 다 손댔으면 완성된 쪽).

### 5.3 B안 — validate에만 검사 추가 (빌더는 그대로)

가장 작은 변경이지만 **P-4가 남는다**(이중 관리). 상속 상가가 이미 그 상태이고, 빌더가 바뀌면
validate가 조용히 낡는다. **권고하지 않는다.**

### 5.4 채택하지 않는 것 — "부분 입력이면 남은 값을 추정해 채운다"

「자동 안분 fallback 금지」 정책 위반이다(memory `feedback_no_silent_apportion_fallback`).
기준시가는 고시된 사실값이라 추정 대상이 아니다.

---

## 6. 케이스 매트릭스

| # | 자산 | 취득원인 | 입력 상태 | 기대 |
|---|---|---|---|---|
| **C-1** | 주택 | 상속 | 4필수 중 3 | **차단** (누락 항목 명시) |
| **C-2** | 주택 | 증여 | 4필수 중 3 | **차단** |
| **C-3** | 주택 | 상속 | 4필수 + 등급 3종 중 2 (1990 前) | **차단** |
| **C-4** | 주택 | 상속 | 4필수 + **상속개시일 단가만** (1990 前) | **통과** — 택일 충족 |
| **C-5** | 상가 | 상속 | 8 중 7 | 차단 (**현행 유지** — 회귀 0) |
| **C-6** | 상가 | **증여** | 8 중 7 | **차단** (신규) |
| **C-7** | 토지 | 증여 | 등급 2/3 | **차단** |
| **C-8** | 토지 | 상속(비환산) | 등급 2/3 | **차단** |
| **C-9(회귀)** | 전 자산 | — | **전부 비움** | 통과 — ① 단독은 정상 경로 |
| **C-10(회귀)** | 전 자산 | — | **전부 채움** | 통과 + ② 비교 수행 |
| **C-11(경계)** | 토지 | 매매 | 환산 모드 등급 2/3 | 현행 `hasPre1990` 검사 유지(§163⑨ 아님) |
| **C-12(경계)** | 상가 | 이월과세 | 8 중 7 | 검사 없음 — §97의2 승계라 대상 아님 |

---

## 7. 미확인 (Do 착수 전 해소)

| # | 항목 | 상태 |
|---|---|---|
| **U-1** | **UI 안내 문구를 함께 넣을지** — 차단 메시지만으로 충분한지, 입력 카드에 "모두 입력해야 적용됩니다" 안내를 붙일지 | 미판정. 차단은 계산 시점이라 입력 중에는 모른다 |
| **U-2** | 주택 택일 그룹(§5.2)에서 **둘 다 부분 입력**한 경우의 메시지 | 미판정 |
| **U-3** | `hasPre1990`(환산 모드) 검사와 신규 §163⑨ 검사가 **동시 발동**하는 조합이 있는지 | 미확인 — 상속 토지에서 `pre1990Enabled`가 stale true면 둘 다 걸릴 수 있다 |
| **U-4** | 결과 화면에 **"② 미적용" 사유를 표시**할지 | 범위 밖 후보. 차단하면 도달하지 않으므로 불요일 수 있다 |

---

## 8. 리스크

| # | 항목 | 대응 |
|---|---|---|
| **R-1** | **차단이 늘어 기존 사용자 흐름이 막힌다** | `filled > 0`일 때만 차단 — 안 쓰던 사용자는 영향 0. 전부 비움(C-9)은 통과 |
| **R-2** | **E2E 전건 회귀** — 차단 validation 추가는 기존 spec을 광범위하게 깨뜨린 이력이 있다 | memory `feedback_blocking_validation_full_e2e_regression`. 구현 후 **E2E 전건** 필수 |
| **R-3** | 상속 상가 기존 메시지 변경 시 회귀 | C-5로 고정. 메시지 문구를 바꾸려면 기존 anchor 확인 |
| **R-4** | 주택 택일 로직 오판정 | C-4가 anchor. 단순 카운트 구현을 막는다 |

---

## 9. 결론

| | |
|---|---|
| **법령 판단** | ②는 max의 한쪽이므로 누락은 「법령상 요구되는 비교 미수행」이다 |
| **실태** | 5경로 중 **4경로가 침묵**. 유일한 차단(상속 상가)도 증여로 확장되지 않았고 필드 목록이 이중 관리다 |
| **핵심** | 검사 추가보다 **필드 목록 단일 소스화**가 본질 — 그래야 빌더가 바뀔 때 validate가 따라온다 |
| **범위** | 신규 파일 1 + 빌더 3곳 조기 반환 교체 + validate 3경로 + anchor 12케이스 |

---

## 10. 참고 — 왜 지금까지 드러나지 않았나

`{}` 반환은 **spread-safe**하게 설계됐다(`...buildX()`). 상위에서 아무 일도 일어나지 않으므로
**타입 오류도 런타임 오류도 없다**. payload 빌더 단위 테스트는 `AssetForm`을 완전한 형태로
구성해 넘기므로 **항상 통과한다** — 부분 입력을 넣어보는 테스트가 없었다.

⇒ 이 결함군은 [[feedback_api_trigger_without_input_path_is_noop]]와 같은 계열이다:
**"통과하는 테스트"가 "사용자가 도달할 수 있다"를 증명하지 않는다.**
