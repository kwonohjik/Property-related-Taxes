# 조정대상지역 안내 메시지 2종 — 수정 계획서 (v2, 검토 반영)

> 작성일: 2026-06-29 · 대상: 양도세 마법사 Step4 + 엔진/변환 헬퍼 추출
> 사용자 결정: **①은 주택+양도시 조정이면 항상** · **②는 Step4 실시간 + 엔진 100% 일치(큰 리팩터 수용)**
> 정책: `single-source-engine-helper`·`feedback_ui_engine_dual_truth_avoidance`(엔진/변환 헬퍼 재사용) · `feedback_tax_calculation_principle`(법령 정확·단정 회피) · `pre-do-anchor-verification`
> v1→v2 변경: "좁은 인터페이스+UI 도출"(실현 불가) → "변환 헬퍼 추출 + Pick 인터페이스 + 엔진 헬퍼 재사용".

---

## 1. 요구사항

| # | 메시지 | 확정 표시 조건 |
|---|---|---|
| ① | "양도일 현재 조정대상지역입니다 — 중과세 적용 여부를 검토하세요." | `assetKind==="housing"` && `isRegulatedArea===true` |
| ② | "조정대상지역 거주요건(2년) 불충족 — 1세대1주택 비과세가 배제될 수 있습니다." | 주택 + 1세대1주택 + **엔진 §154① 거주요건 미충족**(`!meetsOneHouseResidenceRequirement`) |

---

## 2. 현황 (실측 확인 — file:line)

### 2-1. 거주요건 엔진 로직 — `transfer-tax-exemption.ts:101-125`

`meetsResidence = proviso==="both" || proviso==="residence_only" || !wasRegulated || (prePolicyExemptResidence && isPrePolicy) || residenceYears>=2`
- `proviso = resolveExemptionProviso(input)` → 반환 **`"both" | "residence_only" | null`** (44-76). `null`이 "면제 없음"(v1의 `"none"`은 오류).
- `wasRegulated = resolveWasRegulatedAtAcquisition(input)` (85-93) → `regionCode` 있으면 취득일 기준 `isRegulatedByBjdCode`, 없으면 `wasRegulatedAtAcquisition` boolean.
- `isPrePolicy = (input.residenceTransitionAcquisitionDate ?? input.acquisitionDate) < new Date(rule.prePolicyDate)`.
- `residenceYears = Math.floor(input.residencePeriodMonths / 12)`.
- 호출처: `transfer-tax.ts:197`. 추출 시 **결과 불변 보증 필요**(회귀 anchor).

### 2-2. `resolveExemptionProviso` 입력 — `transfer-tax-exemption.ts:44-76`

`input.oneHouseExemptionProviso`(객체: reason·businessApprovalDate·expropriationDate·departureDate) + `residencePeriodMonths` + `acquisitionDate` + `transferDate` + `EXEMPTION_PROVISO_CONST`. **5케이스 분기**(수용·해외이주·해외거주·부득이·임대5년·사전지정). → UI 재구현 금지, 헬퍼 재사용.

### 2-3. proviso 조립 — `transfer-tax-api.ts:485-494`

```ts
...(form.provisoReason ? { oneHouseExemptionProviso: {
  reason: form.provisoReason,
  ...(form.provisoDepartureDate ? { departureDate: ... } : {}),
  ...(form.provisoExpropriationDate ? { expropriationDate: ... } : {}),
  ...(form.provisoBusinessApprovalDate ? { businessApprovalDate: ... } : {}),
}} : {})
```
form FLAT(`provisoReason` 등) → 객체. **단순 조립 → 순수 함수 추출 쉬움.**

### 2-4. 거주기간 개월수 도출 — `transfer-tax-api.ts:426-429`

interval 모드면 `sumResidenceMonths(primary.residencePeriods, form.transferDate)`, 아니면 `parseInt(primary.residencePeriodMonthsAsset || form.residencePeriodMonths) || 0`.

### 2-5. `residenceTransitionAcquisitionDate` — **API 변환에 없음(grep 0건)**

→ 단건 API 경유 시 엔진은 항상 `acquisitionDate` fallback. **UI도 이 필드를 주지 않으면 엔진과 자동 일치** — 도출 불필요(v1의 우려 해소).

### 2-6. seed 거주요건 값 — `transfer-rate-seed.ts` `special_rules.one_house_exemption`

`regulatedAreaMinResidenceYears: 2`, `prePolicyDate: "2017-08-03"`, `prePolicyExemptResidence: true`. 타입: `OneHouseSpecialRulesData["one_house_exemption"]`(v1의 `OneHouseExemptionRule`은 오류). **UI 접근 방법은 §8-1 확인**.

### 2-7. Step4 구조

`primaryKind`(38), `form.isOneHousehold`(폼-전역, store:82), 거주기간 섹션(284-296, `isOneHousehold && housing`), 조정대상 토글(310-328). 안내 패턴(257-264): `border-{tone}-200 bg-{tone}-50/40 text-{tone}-900`.

---

## 3. 설계 (C안: 실시간 + 엔진 100% 일치)

### 3-1. 공용 순수 함수 추출 (single-source)

| 신규 함수 | 위치 | 내용 | 공용 |
|---|---|---|---|
| `deriveResidencePeriodMonths(primary, form)` | `calc-wizard-asset-residence.ts` | 2-4 인라인 도출 | API·UI |
| ~~`buildOneHouseExemptionProviso(form)`~~ → **Do deviation**: 별도 추출 안 함. proviso Date 조립을 `buildResidenceReqInput` 내부에 인라인(UI=Date), API(485-494)는 string 유지(route 변환). 이유: API/UI 날짜 타입 상이(string vs Date)로 generic 추출 복잡. **판정 로직(resolveExemptionProviso)은 단일소스 유지** → dual-truth 핵심 회피됨(형식 조립만 분리). | UI |
| `buildResidenceReqInput(form): ResidenceReqInput` | `lib/calc/transfer-tax-api.ts`(export) | 아래 Pick 인터페이스 빌드 | UI(엔진 헬퍼 입력) |

`transfer-tax-api.ts`의 기존 인라인(426-429, 485-494)은 위 헬퍼 **호출로 교체**(동작 불변).

### 3-2. 엔진 거주요건 헬퍼 추출 — `transfer-tax-exemption.ts`

```ts
// TransferTaxInput에서 거주요건 판정에 필요한 부분만 (구조적 호환 — TransferTaxInput 그대로 할당 가능)
export type ResidenceReqInput = Pick<TransferTaxInput,
  "acquisitionDate" | "transferDate" | "residencePeriodMonths"
  | "oneHouseExemptionProviso" | "regionCode" | "wasRegulatedAtAcquisition"
  | "residenceTransitionAcquisitionDate">;

export function meetsOneHouseResidenceRequirement(
  input: ResidenceReqInput,
  rule: Pick<OneHouseSpecialRulesData["one_house_exemption"],
    "regulatedAreaMinResidenceYears" | "prePolicyDate" | "prePolicyExemptResidence">,
): boolean { /* 현행 meetsResidence 로직 그대로 */ }
```
- `resolveExemptionProviso`·`resolveWasRegulatedAtAcquisition` 파라미터를 `ResidenceReqInput`(또는 더 좁은 Pick)로 변경 — `TransferTaxInput`이 superset이라 기존 엔진 호출 무영향.
- 기존 `meetsOneHouseHoldingResidence`는 `meetsHolding && meetsOneHouseResidenceRequirement(input, rule)`로 재배선. **결과 불변** → 회귀 anchor.

### 3-3. Step4 UI

> **전제(E)**: 단건 양도 기준(`primaryKind`·`isOneHousehold` 폼-전역). 다건(multi) 양도에서의 자산별 메시지는 **비목표**(후속). 다건 진입 시 메시지 미표시 또는 assets[0] 기준 — Do에서 단건 게이트 확인.

- **메시지 ①** (검토 안내 — 항상): 조정대상 토글(328) 직후, `amber` 카드 + ⚠️.
  - 조건: `primaryKind==="housing" && form.isRegulatedArea === true`
  - 문구(G): "양도일 현재 조정대상지역입니다 — **중과세 적용 여부를 검토하세요.**" (1주택에도 표시되므로 "다주택" 단어 회피·중립화)
  - 역할 구분(F): 자동판정 박스(124-157)는 *판정 결과*("조정대상 ✓ — 근거"), 메시지 ①은 *행동 안내*("검토하세요"). 박스와 토글 사이가 아닌 **토글 직후**에 배치해 중복 인상 최소화.

- **메시지 ②** (거주요건 — 엔진 일치): 거주기간 섹션(296) 직후, `rose` 카드 + ⚠️.
  - 표시 조건(C·D 반영):
    ```ts
    const residenceShortfall = useMemo(() => {            // (A) useMemo 파생 — store 미러링 금지
      if (primaryKind !== "housing" || !form.isOneHousehold) return false;
      if (!form.transferDate || !primary?.acquisitionDate) return false;        // (C) 입력 가드
      const hasResidenceInput =                                                 // (D) 입력 흔적 게이트(§8-5)
        (primary.residencePeriods?.length ?? 0) > 0 || !!primary.residencePeriodMonthsAsset;
      if (!hasResidenceInput) return false;
      return !meetsOneHouseResidenceRequirement(buildResidenceReqInput(form), RESIDENCE_RULE);
    }, [primaryKind, form.isOneHousehold, form.transferDate, primary?.acquisitionDate,
        primary?.residencePeriods, primary?.residencePeriodMonthsAsset, primary?.residenceInputMode,
        primary?.regionCode, form.wasRegulatedAtAcquisition, form.provisoReason,
        form.provisoDepartureDate, form.provisoExpropriationDate, form.provisoBusinessApprovalDate]);
    ```
  - `RESIDENCE_RULE`: §8-1의 **legal-codes 단일 상수**(seed·엔진·UI 공유). 별도 리터럴 금지.
  - Date 변환은 `buildResidenceReqInput` 내부 `toDate`(date-coerce) — `new Date` 직접 금지.

---

## 4. 변경 파일

| # | 파일 | 변경 | 동작 |
|---|---|---|---|
| 1 | `lib/tax-engine/transfer-tax-exemption.ts` | `meetsOneHouseResidenceRequirement`+`ResidenceReqInput` export, `resolve*` 파라미터 좁힘, 기존 함수 재배선 | 불변(회귀 anchor) |
| 2 | `lib/stores/calc-wizard-asset-residence.ts` | `deriveResidencePeriodMonths` 추출 | 불변 |
| 3 | `lib/calc/transfer-tax-api.ts` | `buildOneHouseExemptionProviso`·`buildResidenceReqInput` export, 426-429·485-494 호출 교체 | 불변 |
| 4 | `app/calc/transfer-tax/steps/Step4.tsx` | 메시지 ①② 렌더 + import | 신규 표시 |
| 5 | (rule 상수) `legal-codes/transfer.ts` 또는 seed export | UI가 거주요건 3값 접근 | §8-1 |
| 6 | `__tests__/tax-engine/transfer/*` | 헬퍼 단위 + 회귀 anchor | — |
| 7 | `e2e/transfer-regulated-auto.spec.ts` | 메시지 ①② 표시 4케이스 | — |

> 새 엔진 input/result 필드·새 enum 없음 → 14 동기화 지점 대부분 무관. 표시 전용, 세액 불변.

---

## 5. 작업 절차 (PDCA)

```
1. Pre-Do anchor (엔진 회귀 우선) — 정책 강제
   → meetsOneHouseHoldingResidence 케이스 anchor 작성·실행(현행 통과 확보):
     R1 취득조정+거주1년+proviso없음+2018취득 → false
     R2 거주2년 → true / R3 proviso=expropriation 요건충족 → true(both)
     R4 2017-08-02 취득 → true(prePolicy) / R5 취득비조정 → true
   verify: 추출 전후 동일(회귀 0)

2. seed 거주요건 값 UI 접근 방법 확정 (§8-1)
   verify: RESIDENCE_RULE 3값을 UI에서 단일소스로 획득

3. 엔진 헬퍼 추출(meetsOneHouseResidenceRequirement) + resolve* 파라미터 좁힘 + 재배선
   → (M) resolveExemptionProviso·resolveWasRegulatedAtAcquisition **모든 호출처** grep
     (transfer-tax.ts·transfer-tax-helpers.ts·§155⑤ 게이트 등) → 좁힌 Pick 인터페이스가
     TransferTaxInput superset이라 전부 무영향인지 tsc로 확인
   verify: 1의 anchor 통과(회귀 0) · tsc 0 · resolve* 호출처 컴파일 통과

4. 변환 헬퍼 추출(deriveResidencePeriodMonths·buildOneHouseExemptionProviso·buildResidenceReqInput) + API 교체
   verify: 기존 API 변환 테스트 통과(input 동일)

5. Step4 메시지 ①② 렌더
   verify: tsc 0

6. E2E 4케이스(§6)
   verify: spec 통과 + 기존 regulated-auto 회귀
```

---

## 6. 테스트 (anchor)

**엔진 단위 — `meetsOneHouseResidenceRequirement` + 회귀:** §5-1의 R1~R5 + `meetsOneHouseHoldingResidence` 추출 전후 동일(holding 조합 포함).

**E2E — Step4 메시지(`e2e/transfer-regulated-auto.spec.ts` 확장):**
| ID | 셋업(housing, 완전 asset) | 기대 |
|---|---|---|
| M1 | `isRegulatedArea=true` | ① 노출 |
| M2 | `isRegulatedArea=false` | ① 미노출 |
| M3 | `wasRegulatedAtAcquisition=true`+거주<2년+`isOneHousehold`+2018취득+proviso없음 | ② 노출 |
| M4 | 거주≥2년 | ② 미노출 |
| M5 | proviso 단서면제 + 거주<2년 | ② 미노출 — **Do deviation**: E2E 셋업 과다로 엔진 단위(regulated-area-residence.test.ts `R-req3` 5호·`R-req4` 3호)가 대체 커버. E2E P2-c 주석에 명시. |

> E2E 셋업 함정(검증됨): AddressSearch onChange 경로 케이스는 **완전한 asset**(`assetId`·`assetLabel:""`) 주입 필수 — 부분 asset이면 `asset.assetLabel.trim()` TypeError로 onChange 침묵 실패. regionCode·proviso 직접 주입(seedStep4)은 무관. M5가 단서면제 정확성(dual-truth 회피)의 핵심 anchor.

---

## 7. 법령 정확성

- 메시지 ②는 **엔진 §154① 거주요건 로직 재사용** — 새 조문·새 매트릭스 없음. 단서면제(소령 §154① 단서)·2017.8.3 경과규정(대통령령 제28293호 부칙)을 엔진 그대로 반영(M5로 검증).
- 메시지 ①은 안내성("검토하세요"). 중과 판정은 엔진(`multi-house-surcharge`) 수행. 납세자 유불리 단정 없음.
- 두 메시지 표시 전용 — 세액 불변.

---

## 8. 미확정·확인 필요 (Do에서 해소)

1. **🔴 Critical — seed 거주요건 3값 단일소스(dual-truth 방지)** — UI `RESIDENCE_RULE`과 엔진 seed rule이 **다른 소스면 값 드리프트 시 판정 불일치**(예: seed만 3년으로 바뀌면 UI는 2년 유지 → 메시지 오작동). 해소: `legal-codes/transfer.ts`에 `ONE_HOUSE_RESIDENCE = { regulatedAreaMinResidenceYears:2, prePolicyDate:"2017-08-03", prePolicyExemptResidence:true }` **상수 1곳 정의** → seed·엔진 호출·UI 모두 이를 참조(리터럴 금지 정책 `feedback_legal_codes`). 단, seed 값 변경이 잦지 않고 seed 직접 export가 가능하면 seed 재사용도 허용 — **핵심은 UI/엔진이 동일 출처**. Do 첫 단계에서 출처 일원화 확정.
2. **이월과세 `acquisitionDate` 의미** — UI `buildResidenceReqInput`은 API 변환의 `acquisitionDate` 도출을 그대로 따른다(`primary.acquisitionDate` 등 동일 경로). API가 `residenceTransitionAcquisitionDate`를 안 주는(2-5) 현 동작을 추종하므로 **엔진 결과와 100% 일치는 자동 달성**. 이월과세 거주요건 경과규정 자체의 정확성(엔진 주석 109-110: residenceTransition 미제공 이슈)은 **기존 동작 추종이며 본 작업 범위 밖**(메시지는 엔진과 일치만 보장).
3. **`buildResidenceReqInput` 배치** — `transfer-tax-api.ts` export. UI가 `TransferFormData` 전체를 넘겨 호출.
4. **`oneHouseExemptionProviso` 타입 import 경로** — `buildOneHouseExemptionProviso` 반환 타입(엔진 types). UI/API 공용 import.
5. **거주기간 미입력(0개월) 시 ② 표시 정책** — §3-3 `hasResidenceInput` 게이트로 **이미 설계 반영**(입력 흔적 있을 때만 ②). 잔존 확인: `residencePeriodMonthsAsset` 초기값이 빈 문자열인지 `"0"`인지(빈 문자열이면 `!!` 게이트 정상, `"0"`이면 `=== ""` 비교 등 보정) — Do에서 초기값 1회 확인.
