# 증여 취득가액 — §163⑨1호·2호 max(①,②) 미적용 (상속과의 비대칭)

> **상태**: ✅ **전 Phase 완료** (2026-08-06).
> · Phase 1 — payload 트리거 3곳 확장(API 계층)
> · **Phase 3 — 입력 UI 개방**(상가 §164⑥ · 주택 §164⑤~⑦ · 토지 §164④). Phase 1만으로는 **도달 불가**였다(§11).
> · **G-1 — 입력 계층 분리**(`hasPre1990ForSec164`). §10의 당초 진단은 **실측으로 반증**됐다.
> · **후속 2건도 종결**(§12) — 부분 입력 침묵 무시 ✅#1106 · U-2 조사 + S-1 안내 ✅#1108.
>   세액을 바꾸는 S-3·S-4만 **U2-E(「가목 확인」 판정 기준) 종속으로 보류**.
> **선행**: [`inheritance-pre-deemed-clause-a-b-separation.plan.md`](inheritance-pre-deemed-clause-a-b-separation.plan.md)(#1089 상속 V-3) · [`post-deemed-land-164-4-ui-gap.plan.md`](post-deemed-land-164-4-ui-gap.plan.md)(#1096 상속 토지 UI)
> **세목**: 양도소득세 — 「소득세법 시행령」 §163⑨ 본문·1호·2호 · §164④~⑦ · §176조의2④

---

## 1. 한 줄 요약

「소득세법 시행령」 §163⑨은 **「상속 **또는 증여**」 공통** 규정인데, 1호·2호의 **max(① 상증법 평가액, ② §164④~⑦ 기준시가)**가 **증여에는 어느 경우에도 수행되지 않는다**.

상속은 #1089·#1096으로 정비를 마쳤다. **증여만 남았다.**

---

## 2. 법령 — 조문은 「상속 또는 증여」다

| 조항 | 문언 |
|---|---|
| **§163⑨ 본문** | "**상속 또는 증여**(…)받은 자산에 대하여 법 §97①1호가목을 적용할 때에는 **상속개시일 또는 증여일 현재** 상증법 §60~66에 따라 평가한 가액을 취득당시의 실지거래가액으로 본다" |
| **§163⑨1호** | "1990년 8월 30일 개별공시지가가 고시되기 전에 **상속 또는 증여**받은 **토지**의 경우에는 … 평가한 가액과 **제164조제4항의 규정에 의한 가액 중 많은 금액**" |
| **§163⑨2호** | "상증법 §61①2호~4호에 의한 **건물**의 기준시가가 고시되기 전에 **상속 또는 증여**받은 건물의 경우에는 … 평가한 가액과 **제164조제5항 내지 제7항의 규정에 의한 가액 중 많은 금액**" |
| **§176조의2④** | "의제취득일 전에 취득한 자산(**상속 또는 증여받은 자산을 포함**한다)" |

⇒ **네 곳 모두 증여를 포함**한다. 상속 전용 규정이 아니다.

**국심 2003부0627·0626**(2003.7.25.)은 **증여 사안**이다 — 1977.4.30. **증여**받은 토지에 대해 처분청의 §176조의2④ 환산 경정을 **취소**하고 §163⑨ 적용을 인정했다(주문: 경정 · 납세자 승). #1089에서 확보한 그 결정이 **바로 증여의 정면 근거**다.

---

## 3. 실태 (실측)

### 3.1 증여 취득가액 = ① 하나뿐이다

| 계층 | 실태 |
|---|---|
| UI | `CompanionAcqGiftBlock.tsx:46` 「증여 신고가액 (원)」 → `fixedAcquisitionPrice` (hint: "증여세 신고서상 시가 또는 보충적평가액") |
| validation | `giftEstimatedModeError` — post-1985 증여의 **환산·감정·매매사례를 차단**하고 실거래가 모드 강제 (PR#731) |
| ② 주입 | **없음** — `buildInheritedAcquisitionPayload`는 `acquisitionCause === "inheritance"`에서만 호출(`transfer-tax-api-inheritance.ts:25·154`) |

### 3.2 §164④가 **명시적으로 배제**돼 있다

`transfer-tax-api.ts:99-107`

```ts
// pre1990 토지등급 환산은 §176의2④ 의제취득(pre-1985) 영역. post-1985 증여는 §163⑨ 신고가액이
// 취득당시 실지거래가액으로 확인 가능 → 토지등급 환산 배제.
const hasPre1990 =
  (primary.pre1990Enabled ?? false) &&
  primary.assetKind === "land" &&
  !(primary.acquisitionCause === "gift" && (primary.acquisitionDate ?? "") >= "1985-01-01");
```

⚠️ **전제가 §163⑨1호와 어긋난다.** 1호는 "평가한 가액**과** §164④ 가액 **중 많은 금액**"이다 — **①이 확인돼도 ②와 비교해야 한다.** ①이 있으니 ②가 불필요하다는 추론은 조문에 없다.

> 이는 #1089 V-3에서 상속에 대해 바로잡은 것과 **동일한 구조의 오류**다. 그때도 "①이 있으면 ③은 필요 없다"가 아니라 "가목 안에서 ①②를 비교하고, 나목은 가목 확인 불가 시에만"이 답이었다.

### 3.3 pre-1985 증여는 환산으로 간다

`giftEstimatedModeError`의 게이트가 `acquisitionDate >= "1985-01-01"`이라 **pre-1985 증여는 차단 대상이 아니다**. 주석: *"pre-1985 증여는 §176의2④ 의제취득 영역이라 제외(기존 환산 fallback 유지·회귀-safe)"*.

⇒ **상속은 #1089로 가목 우선이 됐는데 증여는 여전히 환산이다.** 같은 조문·같은 심판례인데 갈린다.

---

## 4. 갭 정리

| # | 대상 | 현행 | 법문 |
|---|---|---|---|
| **G-1** | 1990.8.30. 前 **증여 토지** | ① 신고가액만 | **max(①, ② §164④)** — §163⑨1호 |
| **G-2** | 기준시가 고시 前 **증여 건물·주택** | ① 신고가액만 | **max(①, ② §164⑤~⑦)** — §163⑨2호 |
| **G-3** | **pre-1985 증여** | ③ 환산(§176조의2④) | **가목 우선** — 국심2003부0627(증여 사안) |

**세액 방향**: G-1·G-2는 ②가 ①보다 크면 **취득가액 증가**(납세자 유리). G-3은 케이스마다 다르다.
⇒ 판단 기준은 **법규정 정합**이다. 증감은 기준이 아니다.

---

## 5. 변경 설계

### Phase 1 — G-1·G-2 (post-1985 증여의 ② 비교)

**A안(권고): 상속 경로 재사용.** 엔진 `InheritanceAcquisitionInput`은 이미 §163⑨ 공통 개념(`inheritanceDate` = "상속개시일 **또는 증여일**")이다.

1. `buildInheritedAcquisitionPayload` 트리거를 `inheritance` → `inheritance | gift`로 확장
   - `inheritanceStartDate` 자리에 **증여일** 주입
   - `reportedValue` ← `fixedAcquisitionPrice`(증여 신고가액)
2. `hasPre1990`의 gift 배제(`api.ts:106`)를 **제거** — ②가 필요해졌으므로
3. `buildInheritedHouseValuationPayload`·`buildCommercialInheritanceValuationPayload`의 `acquisitionCause === "inheritance"` 조건도 동일 확장

⇒ 엔진·`shouldInjectLandMax`·`sec164Amount`·§166③ 판정·UI 결과 카드는 **전부 재사용**된다(#1089·#1096에서 이미 pre/post·자산 3종 대칭).

**B안: 별도 경로 신설** — 중복이 커서 권고하지 않는다.

### Phase 2 — G-3 (pre-1985 증여 가목 우선)

`calcPreDeemed`는 이미 가목 우선이다(#1089). Phase 1로 payload가 증여에도 만들어지면 **자동으로 적용**된다.

⚠️ 다만 `giftEstimatedModeError`가 pre-1985를 제외하는 현재 상태와의 상호작용을 확인해야 한다(§7 U-2).

### Phase 3 — UI

증여도 §164④ 등급환산 섹션이 필요하다. `CompanionAcqGiftBlock`에는 없다.
⇒ #1096에서 상속에 넣은 것과 같은 구조. **다만 증여는 `PostDeemedInputs`를 쓰지 않는다** — 배치 지점 재확인 필요(§7 U-3).

---

## 6. 케이스 매트릭스

| # | 증여일 | 자산 | 기대 |
|---|---|---|---|
| **F-1** | 1987-05-01 | 토지 | max(①, ② §164④) — ②가 크면 ② 채택 |
| **F-2** | 2000-03-01 | 건물 | max(①, ② §164⑥) — 기준시가 고시(2005) 前 |
| **F-3** | 1977-04-30 | 토지 | **가목 우선** — 국심2003부0627 사실관계 재현 |
| **F-4(회귀)** | 2010-01-01 | 토지 | 고시 후 — ① 그대로 (변화 없음) |
| **F-5(회귀)** | 상속 전건 | — | #1089·#1096 anchor 불변 |

---

## 7. 미확인 (Do 착수 전 해소)

| # | 항목 | 결과 |
|---|---|---|
| ~~U-4~~ | **증여의제 제외** | ✅ **해소 — 별도 게이트 불요.** 취득원인 선택지가 매매/상속/**증여**/이월과세/신축뿐이라 **증여의제 항목이 없다**(`CompanionAcquisitionCauseSection.tsx:25-29`) ⇒ `gift`는 순수 수증만이라 §163⑨ 본문 괄호와 정합 |
| ~~U-5~~ | 겸용·GB·재개발 중복 | ✅ **없다** — 그쪽은 자체 경로(`transfer-tax-api-mixed-use.ts` 등)이고 본 빌더는 **표준·상가 전용**이다 |
| ~~U-1~~ | 부담부증여 충돌 | ✅ **회귀 0** — `acquisitionCause === "gift"`만 트리거하고 `burdened_gift`는 별도 enum 값이다. 전체 회귀로 확인 |
| ~~U-2~~ | pre-1985 증여에서 ③이 필요한 경우 | ⚠️ **범위 정정 후 부분 해소 — §12.2**(#1108). 「pre-1985 **증여**」가 아니라 **pre-deemed 상속·증여 공통**이었다. 안내(S-1)는 구현, **세액을 바꾸는 부분은 U2-E 종속으로 보류** |
| ~~U-3~~ | 증여 UI의 §164④ 섹션 배치 | ✅ **해소 — §10·§11**(#1103). `GiftLandStdPriceSection`을 환산 모드 토글 **밖**에 신설하고 payload 생성만 `hasPre1990ForSec164`로 분리 |

---

## 8. 리스크

| # | 항목 | 대응 |
|---|---|---|
| R-1 | 부담부증여 경로 오염(U-1) | 게이트에 `transferType !== "burdened_gift"` 유지 검토 |
| R-2 | 증여의제 오적용(U-4) | 본문 괄호 제외 대상을 게이트에 반영 |
| R-3 | PR#731 차단과의 모순 | ②는 **가목**이므로 추계 차단과 무관 — 오히려 정합 |

---

## 9. 결론

| | |
|---|---|
| **법령 판단** | §163⑨ 본문·1호·2호·§176조의2④는 **전부 "상속 또는 증여"**다. 증여만 max(①,②)를 안 하는 것은 **법문에 없는 구분**이다 |
| **정면 근거** | **국심 2003부0627**은 **증여 사안**이고 §163⑨ 우선을 판정했다(#1089에서 확보) |
| **범위** | 엔진·②주입·결과표시는 #1089·#1096에서 **이미 대칭 구조**로 만들어져 있다 ⇒ **API 트리거 확장이 핵심** |
| **Phase 1** | ✅ **완료** — payload 트리거 3곳 확장(본체·주택 §164⑤~⑦·상가 §164⑥). **단 API 계층 한정**(§11) |
| **Phase 3** | ✅ **완료** — 입력 UI 개방. 이것까지 해야 G-2가 실제로 적용된다 |
| **G-1** | ✅ **완료** — 입력 계층 분리(§10 정정) |
| **후속 2건** | ✅ **종결 — §12**. 부분 입력 침묵(#1106) · U-2 조사 + S-1 안내(#1108). 잔여는 **U2-E 종속 보류분**뿐 |

## 10. ✅ G-1(토지 §164④) — 당초 진단은 **틀렸다**(2026-08-06 실측 정정)

> 🔴 **아래 원래 진단은 반증됐다.** probe 실측 결과 엔진은 증여 토지의 max(①,②)를 **이미 정확히
> 수행한다**. STEP 0.4가 `acquisitionPrice: 0`·`useEstimatedAcquisition: true`로 override해도
> **STEP 0.45(`runInheritedAcquisitionStep` → `applyResultToInput`)가 `acquisitionPrice`를 max
> 결과로 덮어쓴다**. 즉 "신고가액 경로가 깨진다"는 관찰되지 않았다.
>
> ```
> formula: "max(상증법 평가액 100,000,000, §164④ 취득당시 기준시가 84,443,174) = 100,000,000"
> legalBasis: "소득세법 시행령 §163 ⑨ 1호 · §164 ④"      acquisitionPrice: 100,000,000
> ```
> anchor `__tests__/tax-engine/transfer/gift-land-164-4-max.anchor.test.ts`가 이 계약을 고정한다.
>
> ⇒ **실제 갭은 입력 계층뿐이었다** — ⑴ API `hasPre1990`의 post-1985 gift 배제, ⑵ 증여 토지에
> §164④ 등급 입력 UI 부재.
>
> **해소**: `hasPre1990ForSec164`를 신설해 **payload 생성만** 분리했다. 환산 모드 override 6곳은
> `hasPre1990` 그대로라 증여 신고가액 경로가 그대로 살아 있다. `pre1990Enabled` 래치를 조건에서
> 뺐으므로 PR#731이 막으려던 stale 오염도 재발하지 않는다(`buildPre1990LandPayload`의
> all-or-nothing 필수 검사가 opt-in 신호 역할을 한다).
>
> **교훈**: "payload가 override와 한 게이트에 묶여 있다"는 관찰은 옳았으나, 그로부터 **세액이
> 깨진다**는 결론은 하류 단계(STEP 0.45)를 확인하지 않은 추정이었다.
> (memory `feedback_numeric_impact_verify_before_bug_claim`)

<details>
<summary>당초 진단 원문 (보존)</summary>

`hasPre1990` 게이트(`transfer-tax-api.ts:106`)를 열면 ②가 올 것 같지만 **그렇지 않다**.

```ts
// transfer-tax.ts:85-96 — STEP 0.4
if (rawInput.pre1990Land) {
  input = { ...rawInput,
    acquisitionPrice: 0,
    useEstimatedAcquisition: true,      // ← 환산 강제
    acquisitionMethod: "estimated",
  };
}
```

⇒ `pre1990Land` payload가 있으면 엔진이 **환산 모드로 전환**한다. 증여의 실거래가(신고가액) 경로가 **깨진다**.

게다가 PR#731이 그 게이트를 넣은 이유는 `pre1990Enabled`의 **uncleaable 래치**(환산 클릭 시 set·clear 없음)가 실거래가 전환 후 stale로 남는 문제였다 — 단순 제거는 그 결함을 되살린다.

**본질**: ②(§164④)는 **가목**이라 환산(나목)과 무관해야 하는데, 현재 구조는 **한 payload에 묶여 있다**. #1089에서 엔진의 ②·③을 필드로 분리한 것처럼, **입력 계층에서도 「§164④ 산출」과 「환산 모드 전환」을 분리**해야 한다.

⇒ 별도 계획이 필요하다. **상속 토지는 `runInheritedAcquisitionStep`이 payload override로 보호받지만**(#1089 Phase C·D), 증여는 그 보호가 없다.

</details>

---

## 11. 🔴 Phase 1만으로는 **도달할 수 없었다** (2026-08-06 발견)

Phase 1은 API payload **트리거**를 「상속 또는 증여」로 열었다. 그러나 그 payload가 요구하는
**입력 필드를 증여에서 채울 화면이 없었다** ⇒ 트리거 필드가 0으로 남아 payload가 생성되지 않고,
결과적으로 **증여 세액은 전혀 달라지지 않았다**.

| 대상 | 필요 필드 | 종전 입력 UI | 증여 도달 |
|---|---|---|---|
| 주택 §164⑤~⑦ | `inhHouseValLandArea` 외 3 | `HouseValuationSection`(상속 블록 안에만 마운트) | ❌ |
| 상가 §164⑥ | `cbUnitPriceAtFirstOrAcq` 외 5 | `CommercialInheritanceStdPriceSection`(`!== "inheritance"` → `return null`) | ❌ |
| 토지 §164④ | 등급 3종·면적·1990 ㎡당가 | 환산 모드 전용 `CompanionAcqPurchaseBlock` · 상속 `PreDeemedInputs` | ❌ |

**해소 (Phase 3)**

1. **상가** — 게이트를 `isSec163_9Cause`로 확장하고 상속 전제 문구를 취득원인별로 분기.
2. **주택** — `GiftHouseStdPriceSection` 신설. 상속 섹션을 통째로 재사용하지 **않는다** —
   증여의 ①은 이미 「증여 신고가액」(`fixedAcquisitionPrice`)에 있어 ① 입력이 두 곳이 되기 때문이다.
   ② 산출 입력(`HouseValuationSection`)만 감싼다.
3. **토지** — `GiftLandStdPriceSection` 신설(환산 모드 토글 **밖**). §10의 게이트 분리와 짝을 이룬다.

**단일 소스 강제** — `lib/calc/transfer-163-9-base-date.ts`

UI 노출 게이트와 API payload 빌더가 기준일을 **각자 파생하면 어긋난다**: 취득원인을 상속에서
증여로 바꾼 자산에는 `inheritanceStartDate`가 stale로 남아, 한쪽은 그 값을 다른 쪽은
`acquisitionDate`를 보게 된다 — 그 순간 "칸은 보이는데 payload는 안 생기는" 침묵 실패가 된다.
`deriveSec163_9BaseDate` / `isSec163_9Cause`를 UI·API 양쪽이 공유한다.
(memory `feedback_shared_predicate_argument_parity`)

**anchor**: `__tests__/calc/gift-163-9-sec164-ui-reach.anchor.test.tsx` (12건)
— Pre-Do 시점에 G2-A(상가)·G2-B(주택)·G1-UI(토지)가 **실패하는 것을 먼저 확인**했고,
회귀·경계(매매·이월과세·고시 이후) 케이스는 처음부터 통과해 기준선이 됐다.

## 12. 후속 — ✅ **둘 다 해소** (2026-08-06)

당초 이 절은 후속 2건을 「미착수」로 남겼다. **둘 다 별도 계획서로 착수해 종결**했으므로 결과를
여기에 되돌려 기록한다(상위 계획서가 하위 계획서보다 낡아 있던 상태 — 인덱스와 같은 드리프트).

### 12.1 부분 입력 침묵 무시 → ✅ **차단으로 전환** (#1106)

> 계획서 [`sec164-partial-input-silent-noop.plan.md`](sec164-partial-input-silent-noop.plan.md) · 커밋 `3f0ef4d7`

§164④·⑥·⑤~⑦ 세 경로가 all-or-nothing opt-in이라 필수 필드를 **일부만** 입력하면 payload가
`{}`가 되어 조용히 ① 단독으로 계산되던 것을, **검증 오류로 차단**한다.

- **필드 목록 단일 소스** — `lib/calc/sec164-required-fields.ts`. 빌더·validate·UI 안내가
  같은 목록을 본다. 주택은 필수 개수가 가변(`oneOf` 택일 그룹)이라 **카운트만으로 판정하지 않는다**.
- **검사 위치** — `lib/calc/transfer-tax-validate-sec164.ts`를 validator **진입부**
  (`transfer-tax-validate-asset.ts:120`)에서 호출한다. 종전 검사는 상속 상가 블록(`:117`)
  **안**에 있어 증여가 도달하지 못했다 ⇒ 이 이관으로 **상속·증여 양쪽이 함께 해소**됐다
  (§12 당초 기술 「상속은 이번 범위에서 건드리지 않았다」는 결과적으로 뒤집혔다).
- **토지 예외** — `hasPre1990`(환산 모드)은 기존 환산 검증이 같은 필드를 이미 필수로 요구하므로
  제외한다(메시지 중복 방지 · 회귀 0).

### 12.2 U-2 → ✅ **범위 정정 + 안내 구현**, 세액 부분만 보류 (#1108)

> 계획서 [`pre-deemed-clause-a-omitted-estimated-path.plan.md`](pre-deemed-clause-a-omitted-estimated-path.plan.md) · 커밋 `8eba72b2`·`3bd45cfe`·`3ea7378a`·`02113bc6`

**범위가 틀렸다** — U-2는 「pre-1985 **증여**」가 아니라 **pre-deemed 상속·증여 공통**이다.
①을 비운 채 ③(환산)으로 가는 경로가 양쪽 모두에 열려 있다(post-1985 증여만 차단).

| 조사 | 결과 |
|---|---|
| 표본(U2-C) | ✅ 「갈린다」가 **부정확했다** — 현행 체계 정면 쟁점 **2건 모두 §163⑨ 우선**, 반대 **0건**. 구법 표본(min 구조)을 섞으면 판정이 뒤집히므로 시기 확인 필수 |
| U-5 = ①의 정의(U2-D) | ✅ **이미 정합**하며 anchor도 수정돼 있었다 — **선행 과제가 아니다** |
| 남은 난점 | ✅ **U2-E 설계 완료** — [`…confirmation-criteria.engine.design.md`](pre-deemed-clause-a-confirmation-criteria.engine.design.md). 🔴 조사 중 **「현행 3자 max」 전제가 거짓**으로 확인됐다(#1089에서 이미 가목 우선으로 재편) |

**구현된 것은 S-1(안내) 하나** — 세액 무영향. `components/calc/transfer/PreDeemedEstimatedNotice.tsx`가
pre-deemed + 추계 + ① 미입력 조합에서 「그 두 값이 계산에 등장하지 않습니다」를 알린다(차단 아님).
도달 경로는 ⑴ 자체 환산 블록이 있는 자산, ⑵ **매매로 환산을 켰다가 취득원인을 바꾼 stale 상태**다.

**상태 정정(2026-08-06 U2-E 설계 중 실측)**: **S-4는 이미 구현돼 있었다**(#1089 `af74d907` —
anchor W-1~W-5가 고정). **S-3는 U2-E 설계 완료로 착수 가능**해졌다(엔진 무변경 · validate·UI만).
S-2·U2-F(증여 hint의 §76 결정·경정액 누락)는 그 설계의 D-3·D-4로 흡수됐다.

### 12.3 브라우저 관통 검증

`e2e/transfer-gift-163-9-sec164-flow.spec.ts` 3건이 **#1103·#1106·#1108을 한 스펙에서** 관통한다
(커밋 `ceec962f`). `pre1990*`을 시드에 넣지 않아 **화면 입력만으로 도달**함이 증명되고,
`inheritedAcquisitionDetail.acquisitionPrice === 100,000,000`(② 채택)으로 max 동작이 세액으로 실증된다.
