# ⑫→⑭ 파생 타입 · 컴파일 타임 키 커버리지 가드 — 구현 계획

**상태**: ✅ **장치 1·2·3 구현 완료** (2026-09-04)
**계기**: 겸용주택 × 함께양도 착수 선행 조건
(`transfer-bundled-subengine-hosting.design.md` §9.3)
**적용 범위**: 컴패니언(함께양도) 경로의 ⑫→⑭ 배관 전체. 겸용은 그 위에 얹는다.

---

## 0. 무엇을 막으려는 것인가

⑫ Zod가 파싱한 값이 ⑭에서 엔진으로 넘어갈 때, **⑭가 그 키를 열거하지 않으면 조용히 사라진다.**
`bundled-split-helpers.ts` 헤더가 스스로 그 실패 모드를 경고하고 있다(F13·F15 실사고).

**갭은 두 개이고 서로 다르다** — 이 구분이 이 계획의 뼈대다.

| | 갭 | 증상 | 장치 |
|---|---|---|---|
| **갭 1** | ⑫ 키가 ⑭ **타입에 없다** | 조립부에서 **접근조차 못 한다** | 타입 파생(`Pick`/전면 파생) |
| **갭 2** | ⑭ 타입엔 있는데 **조립부가 안 싣는다** | 타입은 통과, **엔진에 미도달** | 키 커버리지 가드 |

⚠️ **갭 1만 막으면 갭 2가 남는다.** 기존 `CompanionSplitFields`는 갭 1만 다룬다.
F13·F15가 실제로 터진 지점은 **갭 2**다 — 필드는 타입에 있었고, 조립부가 안 실었다.

---

## 1. 착수 전 실측 (추정 아님)

### 1.1 현재 침묵 소실은 **0건**이다 — 이 작업은 재발 방지다

⑫ `companionAssetSchema` 키를 ⑭ `CompanionRawAsset`(손으로 쓴 44키 + 파생 24키)과 대조:

| | 건수 |
|---|---|
| ⑫ 스키마 키 | **56** |
| ⑭가 덮는 키 | 44 |
| ⑫에 있고 ⑭에 없는 키 | **12** |

그 12개를 전수 추적한 결과 **실제 소실은 0건**이다:

| 분류 | 건수 | 키 |
|---|---|---|
| 다른 컨텍스트가 소비 | 8 | `appurtenantLandZone`·`buildingFootprintArea`·`isUrbanArea`(`CompanionForHousingCtx`) · `fixedSalePrice`·`fixedAcquisitionPrice`·`directExpenses`·`standardPriceAtTransferForApportion`·`inheritanceValuation`(`BundledCompanionForApportion`) |
| **④에서 이미 파생** | 4 | `occupancyApprovalDate`·`approvalCertificateDate`·`temporaryApprovalDate`·`actualUseDate` — `buildAssetPayload`(`transfer-tax-api-helpers.ts:476-487`)가 「가장 빠른 날 → `acquisitionDate`」로 접는다(영 §162①4호, 사례 28) |

> 🔑 **그래서 이 계획은 버그 수정이 아니라 장치 설치다.** 지금은 우연히 맞아 있고,
> 그 「우연히」를 **컴파일러가 보장하는 상태**로 바꾼다.

### 1.2 왜 TypeScript가 지금은 못 잡는가

| 대상 | 필드 수 | optional |
|---|---:|---:|
| `MixedUseAssetInput` | 59 | **45 (76%)** |

optional 필드는 **빠뜨려도 타입이 통과**한다. 겸용 ⑭ 매핑 25필드가 대부분 폼-전역 optional인
것이 위험의 실체다.

### 1.3 저장소에 있는 선례는 **두 개뿐**이고 서로 다른 갭을 덮는다

| 선례 | 위치 | 덮는 갭 | 형태 |
|---|---|---|---|
| **A** `CompanionSplitFields` | `bundled-split-helpers.ts:149` | 갭 1 | `Pick<z.infer<typeof companionAssetSchema>, keyof typeof splitAcquisitionShape>` — 24키 자동 추종 |
| **B** `_zodEngineSyncGuards` | `lib/validators/acquisition-input.ts:383-388` | 갭 2 | 양방향 — ①`Schema extends EngineInput` ②`Exclude<keyof EngineInput, keyof Schema> extends never` |

> 🔴 **선례 B는 저장소 전체에 단 1곳뿐이다**(`extends never ? true : never` 전수 grep = 1건).
> 검증된 관용구인데 확산되지 않았다 — 이 계획이 그것을 컴패니언 축으로 옮긴다.

### 1.4 🔑 가드가 **조건부 spread에서도 작동함**을 실측했다

계획의 핵심 가정이라 먼저 쟀다(throwaway probe, 측정 후 삭제):

```ts
function assemble(src) {            // ← 반환 타입을 **명시하지 않는다**
  return { a: src.x, ...(cond ? { b } : {}), ...(cond2 ? { c } : {}), d: 1 };
}
type Missing = Exclude<keyof EngineInput, keyof ReturnType<typeof assemble>>;
const ok: Missing extends never ? true : never = true;
```

- 조건부 spread의 키(`b`·`c`)도 **추론 반환 타입에 포함**된다 ✅
- `d`를 빼면 **그 줄에서만** `TS2322: Type 'true' is not assignable to type 'never'` ✅

⚠️ **반환 타입을 `: EngineInput`으로 명시하면 가드가 무의미해진다** — `keyof`가 항상 일치해
언제나 통과한다. **추론에 맡기는 것이 장치의 전부**다. 구현 시 이 한 줄을 지킬 것.

---

## 2. 설계

### 2.1 장치 1 — `CompanionRawAsset` 전면 파생 (갭 1)

```ts
// 종전: 44키를 손으로 나열 + splitAcquisitionShape 24키만 파생
type CompanionRawAsset = z.infer<typeof companionAssetSchema> & {
  // 좁힘이 필요한 것만 덧씌운다
  acquisitionCause: TransferTaxItemInput["acquisitionCause"];
  sameAdjustmentPeriod?: SameAdjustmentPeriodTransferInput;
};
```

- ⑫에 필드가 늘면 **자동으로 ⑭ 타입에 나타난다** — 손으로 옮길 일이 없어진다.
- 좁힘 override는 **최소로** 유지한다. 늘어나면 그만큼 파생의 이점이 준다.

⚠️ **파생만으로는 갭 2가 남는다.** 타입에 나타나는 것과 조립부가 싣는 것은 다른 문제다.

### 2.2 장치 2 — 조립부 키 커버리지 가드 (갭 2 · 이 계획의 본론)

컴패니언 엔진 input 조립(`buildCompanionEngineInputs`)에 선례 B를 건다:

```ts
// 반환 타입 명시 금지 — 추론이 곧 계측 지점이다
function buildCompanionEngineItem(c: CompanionRawAsset, a: CompanionApportioned, ctx: Ctx) {
  return { propertyId: c.assetId, /* … */ } ;
}

// ⑭ 컴파일 타임 키 커버리지 가드 (런타임 영향 없음)
type _Assembled = ReturnType<typeof buildCompanionEngineItem>;
const _companionSyncGuards: [
  _Assembled extends TransferTaxItemInput ? true : never,
  Exclude<RequiredEngineKeys, keyof _Assembled> extends never ? true : never,
] = [true, true];
void _companionSyncGuards;
```

🔑 **`RequiredEngineKeys`를 무엇으로 잡느냐가 설계 판단이다.** `keyof TransferTaxItemInput`
전체로 잡으면 **컴패니언이 의도적으로 싣지 않는 primary 전용 축까지** 요구해 거짓 실패가 된다
(⑧↔⑩ 모순과 같은 형태의 dead-end를 타입 층에 만드는 셈).

⇒ **컴패니언이 책임지는 키 집합을 명시적으로 선언**하고 그것만 강제한다:

```ts
/** 컴패니언이 반드시 싣는 축 — 여기 추가하면 조립부가 강제된다. */
type CompanionOwnedKeys = keyof typeof companionOwnedShape;
```

이 선언 자체가 **문서**가 된다 — 「컴패니언은 무엇을 책임지는가」가 한 곳에 모인다.

### 2.3 장치 3 — 겸용 전용 조립 leaf (선행 조건의 해소)

route 5-a-2(`route.ts:363~440`)의 `mixedAsset` 조립 25필드를 leaf로 추출하고 같은 가드를 건다:

```ts
export function buildMixedUseEngineInput(src: MixedUseEngineInputSource) { /* 반환 타입 명시 X */ }

type _MU = ReturnType<typeof buildMixedUseEngineInput>;
const _mixedUseGuards: [
  _MU extends MixedUseAssetInput ? true : never,
  Exclude<MixedUseOwnedKeys, keyof _MU> extends never ? true : never,
] = [true, true];
```

- primary(5-a-2)와 컴패니언이 **같은 leaf**를 쓴다 ⇒ 규칙 복제가 없다.
- `MixedUseEngineInputSource`는 **⑫ 스키마 + 폼-전역 컨텍스트**에서 파생한다 — 소스 타입을
  손으로 쓰면 같은 문제가 한 층 위에서 재발한다.

---

## 3. 검증 계획

| # | 검증 | 방법 |
|---|---|---|
| **V-1** | 가드가 실제로 잡는가 | **뮤테이션** — 조립부에서 필드 1개를 지우고 `tsc --noEmit`가 **그 가드 줄에서** 실패하는지 |
| **V-2** | 거짓 실패가 없는가 | 현행 코드에서 `tsc` 0건 · 전건 테스트 회귀 0건 |
| **V-3** | 파생이 실제로 추종하는가 | ⑫에 더미 필드를 추가하면 ⑭ 타입에 나타나는지(추가 후 되돌림) |
| **V-4** | 런타임 무영향 | 가드는 `void`로 소비 — 번들·동작 변화 0 |

> 🔴 **V-1이 이 계획의 유일한 성공 기준이다.** 가드를 넣고 「tsc가 통과한다」만 확인하면
> **아무것도 안 잡는 가드**와 구별되지 않는다(구별력 0 — 이 저장소가 반복해 겪은 함정).

---

## 4. 위험과 한계 — 이 장치가 **못 하는 것**

| | |
|---|---|
| **값의 정확성은 못 본다** | 「키가 있다」만 보장한다. `landAcquisitionDate`에 건물 취득일을 실어도 통과한다 |
| **Date 변환은 못 본다** | `Date` vs `string` 드리프트는 가드 ①(`extends`)이 잡지만, `toEngineRedevelopment` 같은 **변환 누락**은 타입이 같으면 통과한다 |
| **의미적 중복은 못 본다** | 같은 값을 두 키에 실어도 통과 |
| **`CompanionOwnedKeys` 선언이 곧 신뢰 경계** | 그 목록에서 빠뜨린 축은 여전히 자유낙하다. 목록은 **줄이지 말고 늘리기만** 할 것 |

⇒ 가드는 **anchor·뮤테이션을 대체하지 않는다.** 「침묵 strip」이라는 한 부류를 컴파일러로 옮길 뿐이다.

---

## 5. 순서

1. ✅ **완료** — 장치 2를 컴패니언 일반 경로에 걸었다(§6 참조)
2. ✅ **완료** — 장치 1(전면 파생)로 손 유지 면적을 없앴다(§7 참조)
3. ✅ **완료** — 장치 3(겸용 조립 가드, §8). 그 위에서 겸용 컴패니언 축을 연다
   (`transfer-bundled-subengine-hosting.design.md` §9.2 파트 카드 구성 · §9.1 12억 카드 단위 함정)

> 1·2는 **겸용 착수 없이도 독립적으로 머지 가능**하다 — 먼저 넣어 두면 그 뒤 축 개방이
> 전부 이 안전망 위에서 진행된다.

---

## 6. 장치 2 구현 결과 ✅ (2026-09-04)

### 6.1 `satisfies`가 장치의 전부였다

```ts
// 종전 — 가드를 무의미하게 만든다
const companionEngine: TransferTaxItemInput = { … };
// 현행
const companionEngine = { … } satisfies TransferTaxItemInput;
```

**실측**(throwaway probe, 삭제함):

| | `keyof` | 가드 | 초과 키 검사 |
|---|---|---|---|
| `: EngineInput` 주석 | **전체 키로 넓어짐** | 상수 참 — 무의미 | ○ |
| `satisfies EngineInput` | **리터럴 키만** | 작동 | ○ |

⇒ `satisfies`는 좁은 키 집합을 보존하면서 대입 가능성·초과 키 검사는 그대로 한다.

### 6.2 `CompanionOwnedKeys` = ⑫ ∩ 엔진 − 컨텍스트 전용

```ts
type CompanionOwnedKeys = Exclude<
  Extract<keyof z.infer<typeof companionAssetSchema>, keyof TransferTaxItemInput>,
  CompanionContextOnlyKeys
>;
```

가드를 걸자 **3개 키가 즉시 짚혔다**: `buildingFootprintArea` · `isUrbanArea` ·
`appurtenantLandZone`. 추적 결과 이 셋은 `resolveHousingContextFromCompanion`이 읽어
**다른 컴패니언(토지)** 에게 줄 주택 컨텍스트를 만드는 값이고, 소비처가 **자기 자신이 아니라
형제 자산**이라 자기 item에는 실리지 않는다 ⇒ 근거를 붙여 명시 제외했다.

> 🟡 **미검증으로 남긴 것** — 컴패니언 주택이 **자기 부수토지 축**(영 §167의5)을 가질 수 있는
> 국면에서도 싣지 않는 것이 옳은지는 확인하지 않았다. 싣는 쪽으로 바꾸면 세액이 움직이므로
> anchor 없이 건드리지 않는다.

### 6.3 검증 — V-1·V-3 실측

| # | 뮤테이션 | 결과 |
|---|---|---|
| **V-1** | 조립부에서 `landNature` 제거 | **가드 줄에서 TS2322** ✅ |
| **V-3** | ⑫에 엔진 공유 키(`appraisalValue`) 추가 | **가드 줄에서 TS2322** ✅ — ⑫가 늘면 자동으로 요구한다 |
| **V-2** | 거짓 실패 없음 | tsc 0건 · lint 0건 · 회귀 0건(4,684 테스트) |
| **V-4** | 런타임 무영향 | 가드는 `void` 소비 · 타입 주석만 `satisfies`로 교체 |

> 🔑 **V-1이 없었다면 「아무것도 안 잡는 가드」와 구별되지 않았다.** 실제로 가드를 처음 걸었을 때
> 3개 키가 짚혔고, 그것이 가드가 살아 있다는 첫 증거였다.

---

## 7. 장치 1 구현 결과 ✅ (2026-09-04)

### 7.1 override가 **하나도 필요 없었다**

```ts
- interface CompanionRawAsset extends CompanionSplitFields { /* 44키 손으로 나열 */ }
+ type CompanionRawAsset = z.infer<typeof companionAssetSchema>;
```

착수 전 실측 두 가지가 이 교체를 안전하게 만들었다:

| 확인 | 결과 |
|---|---|
| 손으로 쓴 44키 중 ⑫에 **없는** 키 | **0개** — 구조적 장애 없음 |
| 전면 파생 시 `tsc` 에러 | **0건** — 좁힘 override 불요 |

> 계획서 §2.1은 「좁힘 override를 최소로 유지한다」고 썼는데, 실측하니 **하나도 필요 없었다.**
> `acquisitionCause`처럼 엔진 타입으로 좁혀 두었던 것들이 스키마 enum과 이미 호환됐다.

### 7.2 갭 1이 실제로 닫혔음을 **짝 실측**했다

같은 코드(`(x as CompanionRawAsset).inheritanceValuation`)를 두 상태에서 컴파일:

| 상태 | 결과 |
|---|---|
| 손-인터페이스 | **`TS2339: Property 'inheritanceValuation' does not exist`** — 갭 1 실재 |
| 전면 파생 | **0건** — 접근 가능 |

⇒ 「⑫에 있는데 ⑭ 타입에 없어 손댈 수조차 없다」가 사라졌다.

### 7.3 두 장치는 **함께** 있어야 한다

| 장치 | 막는 갭 | V |
|---|---|---|
| 1 전면 파생 | 갭 1 (타입에 없음) | **V-5** ⑫ 전용 키 접근 가능 ✅ |
| 2 키 커버리지 가드 | 갭 2 (조립부 미탑재) | **V-1** 조립부 필드 제거 → TS2322 ✅ |
| 1+2 | ⑫ 성장 추종 | **V-3** ⑫에 엔진 공유 키 추가 → TS2322 ✅ |

> 🔑 **파생만으로는 F13·F15가 다시 난다.** 파생은 「타입에 나타난다」까지이고,
> 「조립부가 싣는다」는 가드만 본다. 장치 1을 넣은 뒤에도 V-1이 여전히 RED임을 확인한 것이
> 두 장치가 서로를 대체하지 않는다는 증거다.

### 7.4 부수 효과

- **손 유지 면적 0** — 종전 44키를 손으로 따라 적던 것이 사라졌다.
- **`bundled-split-helpers.ts` 892줄 → 808줄** (−84). 삭제된 인터페이스가 만든 고아 import
  2건(`splitAcquisitionShape`·`reductionSchema`)도 함께 제거했다 — **내 변경이 만든 고아만**
  치웠다(변경 전에는 둘 다 사용 중이었음을 stash로 확인).
- ⚠️ 파일이 **여전히 800줄 정책 초과**(808)다. 이 작업이 84줄을 줄였지만 트리거 아래로는
  내려가지 않았다 — **분리는 별건**으로 남긴다.

---

## 8. 장치 3 구현 결과 ✅ (2026-09-04)

### 8.1 🔴 착수 전 안전망 실측 — **구멍이 실재했다**

route 5-a-2의 `mixedAsset` 조립에서 필드를 하나씩 지우고 잰 결과:

| 제거한 필드 | tsc | 겸용 route 테스트 |
|---|---|---|
| `isOneHousehold` (**필수**) | **잡힘** ✅ | 전건 통과 |
| `marriageMerge` (optional) | 0건 | **전건 통과** 🔴 |
| `parentalCareMerge` (optional) | 0건 | **전건 통과** 🔴 |
| `gracePeriod` (optional) | 0건 | **전건 통과** 🔴 |
| `specialHouseExclusions` (optional) | 0건 | 1 failed ✅ |

⇒ **필수 필드는 컴파일러가 이미 잡는다.** 위험은 **optional**이고, 4개 중 **3개는 tsc도
테스트도 못 잡았다**. 이것이 이 장치가 닫는 구멍이다(추정이 아니라 실측).

### 8.2 leaf 추출은 하지 않았다 — 소비처가 아직 하나다

계획서 §2.3은 「route 5-a-2의 조립을 leaf로 추출해 컴패니언과 공유」였는데, **컴패니언 겸용
축이 아직 없어 두 번째 소비처가 없다.** 소비처 하나짜리 추상화는 이 저장소가 금지하는
speculative abstraction이다 ⇒ **가드만 먼저 건다.** 추출은 컴패니언 축 작업과 함께.

조립부가 이미 무주석 추론(`const mixedAsset = {`)이라 재구조화 없이 `satisfies` + 가드로 끝났다.

### 8.3 🔴 상위 가드는 **중첩을 못 본다** — 별도 가드가 필요했다

상위 가드(`keyof MixedUseAssetInput`)를 걸고 §8.1의 3필드를 다시 지웠더니 **여전히 안 잡혔다**.
그 셋은 `multiHouse` **중첩 객체 리터럴 안**이라 top-level `keyof`에 나타나지 않는다.

⇒ 중첩 객체를 **이름 있는 const로 끌어올리고**(`mixedMultiHouse`) 별도 가드를 걸었다.

> 🔑 **「가드를 걸었다」와 「그 가드가 내가 잰 구멍을 닫는다」는 다른 말이다.** 상위 가드만
> 걸고 끝냈다면 §8.1에서 잰 구멍이 그대로 남은 채 「가드 완료」로 보고할 뻔했다.

### 8.4 🔴 가드가 비대칭을 하나 찾았다 — `unavoidableOutsideCapitalHouse`

중첩 가드를 걸자마자 이 키가 짚혔다. 추적 결과:

- 그 boolean은 **엔진이 파생**한다 — `transfer-tax-judgment-steps.ts:55`가
  `qualifiesUnavoidableOutsideCapital(input)`으로 세운다.
- 그런데 그 파생은 **단건 경로에만** 있다. 겸용 엔진은 `...asset.multiHouse`를 넘기면서
  `sellingHouseMeetsOneHouseRequirements`·`deemedOneHouseBy155` **둘만** 「단건과 같은 정본
  함수」로 파생한다(`transfer-tax-mixed-use.ts:209·212`) — **셋째만 빠졌다.**
- ⇒ 겸용 + 부득이한 사유 수도권 밖 주택이면 §167의10①4호 **중과 배제가 발동하지 않는다**
  (`multi-house-surcharge-exclusion.ts:393`). **납세자에게 불리한** 방향이다.

> ⚠️ **처음에 「route가 안 실은 결함」으로 오판했다.** top-level
> `TransferTaxInput.unavoidableOutsideCapitalHouse`는 **`{reason, resolvedDate}` 객체**이고
> 중첩된 것은 **`boolean`** — **같은 이름의 다른 축**이었다. 그대로 이어 붙이려다 타입 에러로
> 드러났다([[feedback_rename_same_name_two_axes]]와 같은 함정).

🟡 **이 PR에서 고치지 않았다** — 세액이 움직이는 변경이라 anchor와 요건 확인이 먼저다.
`MixedUseMultiHouseEngineDerivedKeys`로 **근거와 함께 제외**해 추적 가능하게 남겼다.

### 8.5 검증

| # | 뮤테이션 | 착수 전 | 가드 후 |
|---|---|---|---|
| **V-1** | `marriageMerge` 제거 | tsc 0 · 테스트 통과 🔴 | **tsc 1건** ✅ |
| | `parentalCareMerge` 제거 | tsc 0 · 테스트 통과 🔴 | **tsc 1건** ✅ |
| | `gracePeriod` 제거 | tsc 0 · 테스트 통과 🔴 | **tsc 1건** ✅ |
| **V-1b** | `specialHouseExclusions` 제거(상위) | tsc 0 | **tsc 1건** ✅ |
| V-2 | 거짓 실패 없음 | — | tsc 0 · 회귀 0(4,684) · 겸용 E2E 9건 통과 |
