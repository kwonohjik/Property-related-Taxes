# ⑫→⑭ 파생 타입 · 컴파일 타임 키 커버리지 가드 — 구현 계획

**상태**: 📐 계획 · 구현 미착수
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

1. 장치 2를 **컴패니언 일반 경로**에 먼저 건다(겸용과 무관하게 가치가 있다) → V-1 뮤테이션
2. 장치 1(전면 파생)로 손 유지 면적을 줄인다 → V-3
3. 장치 3(겸용 leaf + 가드)을 얹고, 그 위에서 겸용 컴패니언 축을 연다
   (`transfer-bundled-subengine-hosting.design.md` §9.2 파트 카드 구성 · §9.1 12억 카드 단위 함정)

> 1·2는 **겸용 착수 없이도 독립적으로 머지 가능**하다 — 먼저 넣어 두면 그 뒤 축 개방이
> 전부 이 안전망 위에서 진행된다.
