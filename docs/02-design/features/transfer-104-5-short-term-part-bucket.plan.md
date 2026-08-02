# §104⑤ `short_term` 그룹의 **파트 단위 버킷** — v1.1

작성 2026-08-02 · 선행 [[transfer-rate-clause-candidates.plan.md]] (v2.3 · Q1~Q3 완료 · §11.2가 이 건)

> **표기 규약** — 이하 **§**는 「소득세법」, **영 §**는 「소득세법 시행령」을 가리킨다.
> 다른 법령은 매번 법령명을 병기한다. (memory `feedback_law_citation_must_name_statute_and_tier`)

> **📌 결함 요약**
>
> | ID | 결함 | 방향 | 실측 | 상태 |
> |---|---|---|---:|---|
> | **P13** | `short_term` 그룹만 **자산 단위**로 버킷을 만든다 — 파트가 있는 자산(`isAssetLevelClause5`)이 통째로 `solo`로 빠져 **같은 호인 다른 자산과 합산되지 않는다** | **과소** | **23,000,000**(①) · **17,000,000**(③) | ✅ **해소** |
>
> 누진 호 분기는 **P12가 이미 파트를 버킷 멤버로** 풀었다(D-7 51,000,000 · D-12 23,400,000).
> `short_term`만 남았다 — **같은 결함의 마지막 조각**이고 규모도 같은 자릿수다.

---

## 0. 발단

Q1~Q3(`transfer-rate-clause-candidates.plan.md`)가 §104⑤ 묶음 **키**를 단일화했다 —
세 소비처가 `clauseBucketKey(candidateClauses, …)` 하나를 공유한다. 그런데 **버킷의 멤버 단위**는
아직 갈려 있다:

| 분기 | 버킷 멤버 |
|---|---|
| 누진 호 분기(`progressive`·`multi_house_surcharge`·`non_business_land`·`unregistered`) | **파트**(P12 2단계) |
| **`short_term`** | **자산** — 파트가 있으면 그 자산 전체가 `solo` |

Q2가 `short_term`에서 고친 것은 「키가 하나라도 다르면 **그룹 전체**가 붕괴」였고(ⓒ),
「**파트 자산 하나**가 통째로 빠진다」는 그대로 남겼다. 이 문서가 그 잔여분이다.

---

## 1. 법령 근거 (기확정 — 신규 해석 없음)

### 1.1 합산 단위는 「호」다

§104⑤2호 **본문**의 「자산별」을 예규가 확정했다 —
「"자산별"에서 "자산"의 의미는 동법 **제104조 각 호별로 합산한 자산**을 의미」
(「기획재정부 재산세제과-536」 2018.6.19. · 국세청 「기준-2018-법령해석재산-0098」
[법령해석과-1715] 2018.6.21.).

### 1.2 자산 하나가 둘 이상의 호에 걸치면 **파트가 합산 단위**다

§104⑤ 본문 **후단**이 「한 필지의 토지가 §104의3에 따른 비사업용 토지와 그 외의 토지로
구분되는 경우 **각각을 별개의 자산으로 보아**」라고 정한다. 토지·건물 분리취득도 §94①1호가
병렬 열거하는 **각각의 자산**이다.

⇒ **P12가 누진 호 분기에서 이미 이 근거로 파트를 버킷 멤버로 삼았다.** 이 문서는 같은 근거를
`short_term`에 적용할 뿐이며 **새 해석이 없다**.

---

## 2. 현행 지도 (grep 실측 · 2026-08-02)

`lib/tax-engine/transfer-tax-aggregate-helpers.ts` `aggregateByGroup` 한 함수 안에 두 분기가 있다.

| | `short_term` 분기 (**:437~492**) | 누진 호 분기 (**:493~**) |
|---|---|---|
| 버킷 멤버 | **자산** — `perAsset.forEach` | **파트** — `perAsset.flatMap(a => a.parts ?? [자산])` |
| 파트 자산 처리 | `isAssetLevelClause5(p) ? \`solo-${n}\`` | 파트로 **분해**해 다른 자산의 파트와 섞는다 |
| 묶음 키 | `clauseBucketKey(p.candidateClauses, p.rate, n)` | `clauseBucketKey(p.candidateClauses, p.appliedRate, i)` — **같은 함수** |
| 합산 대표 입력 | `records[idxList[bucket[0]]].correctedSingleInput` | `bucket[0].rateInput` — **파트가 실어 보낸 입력** |
| `appliedRate` | 버킷 결과의 max(**합산 세율 포함**) | 파트 `appliedRate`의 max |
| `surchargeRate` | `undefined` 고정 | 파트 `surchargeRate`의 max |

`isAssetLevelClause5`(**:419**) = `p.splitParts || p.partialNbl` — ⓐ토지·건물 파트 분해(split)
ⓑ한 필지 중 일부만 비사업용(부분 비사토).

---

## 3. 결함 메커니즘

```
[S(split 주택: 토지 파트 + 건물 파트), B(단순 주택)]   ← 셋 다 해당 호 {①2호, ⑦3호}
   현행 : S → solo(자기 §104⑤만)   B → 자기 버킷        ⇒ 두 계산이 만나지 않는다
   도출 : S.토지 + S.건물 + B → **한 버킷**             ⇒ 합산 1회
```

`solo` 처리 자체는 **필요하다** — 자산 내부에서 이미 §104⑤가 적용된 자산을 그룹 합산 1회로
되돌리면 그 분해가 사라지기 때문이다(Q2 주석 · D-12). 문제는 **되돌리는 대신 파트로 풀어야**
하는데 `short_term`만 「통째로 빼기」에 머물러 있다는 점이다.

---

## 4. 실측 (2026-08-02 · throwaway probe)

**공통 픽스처** — 2026-06-01 양도 · 기본공제 소진 · 조정대상지역 3주택

| 기호 | 구성 | 해당 호 |
|---|---|---|
| `S` | split 주택 — 건물 2024-08-01(**22개월**) + 토지 2025-01-01(17개월) · 토지 파트 300,000,000 / 건물 파트 150,000,000 | 두 파트 모두 {①2호, ⑦3호} |
| `S2` | 〃 (토지 100,000,000 / 건물 50,000,000) — **세율이 같아 파트 분해 게이트에 걸리지 않아** 파트가 없다 | {①2호, ⑦3호} |
| `B` | 단순 주택 17개월 · 200,000,000 | {①2호, ⑦3호} |
| `B2` | 단순 주택 17개월 · 450,000,000 | {①2호, ⑦3호} |
| `N` | 토지 17개월 · 400,000,000 · **한 필지 중 50%만 비사업용** | 파트 {①2호,①8호} / {①2호} |
| `P` | 사업용 토지 17개월 · 200,000,000 | {①2호} |

| # | 케이스 | 현행 | 도출 | 차 |
|---|---|---:|---:|---:|
| **①** | `[S, B]` — split + 단순 | **409,060,000** | **432,060,000** | **과소 23,000,000** |
| **③** | `[S, S2]` — split + (파트 없는) split | **379,060,000** | **396,060,000** | **과소 17,000,000** |
| ② | `[N, P]` — 부분 비사토 + 사업용 | 240,000,000 | 240,000,000 | **0**(단일세율 호라 floor만) |
| ④ | `[B, B2]` — 파트 없는 자산만 | 432,060,000 | 432,060,000 | **0**(회귀 케이스) |

순서 반전은 ①③ 모두 같은 값이다(Q2가 이미 순서 의존을 제거했다).

### 4.1 ⭐ 도출값을 **엔진 자신이 확증**한다

①의 도출값 432,060,000은 **파트가 없는 동등 입력** `[B2(450,000,000), B(200,000,000)]`에 대해
**현행 엔진이 이미 내는 값**이다(과세표준 합계가 650,000,000으로 같다).

⇒ 「**split이라는 이유만으로** 23,000,000이 빠진다」가 정확한 서술이다. 도출값은 추정이 아니라
현행 엔진의 다른 경로가 내는 실측값이다.

### 4.2 ③이 보여주는 것 — 파트 분해 게이트는 세율이 갈릴 때만 열린다

`S2`는 토지·건물 파트의 세율이 **둘 다 60%**라 `computeSplitPartTax`의 게이트 7(`uniform`)에
걸려 파트가 만들어지지 않는다 ⇒ `isAssetLevelClause5`가 거짓이라 **평범한 자산으로 취급**된다.
그래서 ③은 「파트 있는 자산 1건 + 파트 없는 자산 1건」이고 ①과 같은 구조다.

---

## 5. 설계

### 5.1 채택안 — **버킷 멤버만 파트로 바꾼다(표시 규약 유지)**

| 안 | 내용 | 판정 |
|---|---|---|
| A | 두 분기를 **완전 통합**(누진 호 분기 코드를 그대로 사용) | ❌ `surchargeRate`·`appliedRate` 표시 규약이 달라 **회귀 케이스 ④의 표시가 바뀐다**(실측: `appliedRate` 0.72→0.70 · `surchargeRate` null→0.3) |
| **B** | **버킷 멤버만** 자산 → 파트로 교체하고, `appliedRate`(버킷 결과 max)·`surchargeRate`(`undefined`) 계산은 **그대로** | ✅ **채택** — ④가 세액·표시 **모두 완전 불변**, ①은 파트 없는 동등 입력과 세액·`appliedRate` 둘 다 일치 |
| C | `isAssetLevelClause5`를 없애고 파트 자산도 그룹 합산 1회로 | ❌ 자산 내부 §104⑤ 분해가 사라진다(D-12 회귀) |

**B안 실측 확인**(임시 적용): ① 432,060,000(rate 0.72 — 동등 입력과 일치) · ③ 396,060,000 ·
② 불변 · ④ **완전 불변**. **양도+calc 812파일 9,835건 회귀 0.**

### 5.2 변경 형태

```ts
// 현행 — 자산 단위
const buckets = new Map<string, number[]>();
perAsset.forEach((p, n) => {
  const k = isAssetLevelClause5(p) ? `solo-${n}` : clauseBucketKey(p.candidateClauses, p.rate, n);
  ...
});

// 변경 — 파트 단위(누진 호 분기와 같은 flatMap)
const stParts = perAsset.flatMap((a, n) =>
  a.parts
    ? a.parts.map((p) => ({ taxBase, calculatedTax, appliedRate, candidateClauses, rateInput: p.rateInput }))
    : [{ taxBase: a.taxBase, calculatedTax: a.tax, appliedRate: a.rate,
         candidateClauses: a.candidateClauses,
         rateInput: records[idxList[n]].correctedSingleInput }],
);
// 키·합산·appliedRate 산출은 종전 그대로
```

⚠️ **대표 입력은 반드시 `p.rateInput`**(파트가 실어 보낸 것)이다 — 재구성하면 dual-truth다.
토지 파트는 `buildLandRateInput`으로 §104② 기산일을 확정했고, 비사업용 파트는
`nonBusinessLandAreaRatio`를 1로 되돌린 입력이기 때문이다
(memory `feedback_ui_engine_dual_truth_avoidance`).

⚠️ `isAssetLevelClause5`는 **소비처가 사라진다**. 내 변경이 만든 고아이므로 제거한다(Surgical).

### 5.3 범위 밖

- **`assetPartTax` / `refCalculatedTax`**(P12 3단계) — `assetTaxOf` 안에서 `splitPartDetail`
  유무로만 정해지므로 이 변경과 무관하다. **자산 단독 참고값**이라 `Σ ref ≠ 그룹 세액`은
  비교과세의 본질이고, ❌**역안분 재제안 금지**(선행 계획서 §4.10-R).
- **누진 호 분기** — 이미 파트 단위다. 손대지 않는다.
- **기본공제 배분** — 파트 배분은 `resolveSplitAwareTax` 내부에서 이미 끝났다.

---

## 6. Phase

| Phase | 내용 | 세액 변경 |
|---|---|---|
| **P13** ✅ | `short_term` 버킷 멤버를 파트로 교체 + `isAssetLevelClause5` 제거 | **있음** — 과소 23,000,000 / 17,000,000 해소 · **완료 2026-08-02 §6-R** |

단일 Phase다. 변경이 한 분기·한 블록에 갇혀 있고 회귀 0이 실측됐다.

### 6-R P13 구현 결과 ✅ (2026-08-02)

**엔진 1파일**(`transfer-tax-aggregate-helpers.ts`). `short_term` 분기의 버킷 멤버를
**자산 → 파트**로 교체했다. 계획대로 **B안**(표시 계산 유지)이다.

⇒ **§104⑤ 합산 단위가 전 그룹에서 「파트」로 통일됐다.** 두 분기가 이제 키 함수(`clauseBucketKey`) ·
인자 축(`candidateClauses`) · 멤버 단위(파트) 셋 다 같다.

**Do 중 추가 정리 3건**(내 변경이 만든 고아만 — Surgical):
1. `isAssetLevelClause5` — **마지막 소비처가 이 분기였다** → 제거.
2. `assetTaxOf`의 `splitParts`·`partialNbl` 반환 → 제거. `parts`의 주석에 그 취지
   (「파트를 자산 단위 합산 1회로 되돌리면 분해가 사라진다」)를 옮겨 근거를 보존했다.
3. `hasPartialNonBusinessLand` import 고아 → 제거(lint가 잡았다).

**anchor 7건 신설**(`aggregate-short-term-part-bucket.anchor.test.ts`) — 세액 4건 + 회귀 2건 + 구조 1건.
**P13-3**이 핵심이다: `[S,B]`와 **파트 없는 동등 입력** `[B2,B]`의 세액이 같음을 직접 고정한다
(전제로 `groupTaxBase` 일치도 함께 고정 — 비교가 성립하는지부터 잠근다).

**검증**: `tsc` 0 · `lint` 0 · 신규 7건 + GREEN 조건 64건 = **71건** · 전체 회귀 0.

---

## 7. Pre-Do anchor (memory `feedback_pre_anchor_verification`)

### 7.1 🔴 GREEN 조건 — 먼저 통과시킨다

| 대상 | 위치 |
|---|---|
| 교재 사례1·2 (§104⑤2호 단서) | `aggregate-same-clause-104-5.anchor.test.ts` B-28·B-29 |
| R7 감사 | 〃 B-29c |
| 예규(호별 합산) | `aggregate-progressive-clause-104-5.anchor.test.ts` B-36~B-42 |
| P12 호별 합산 | `aggregate-clause-merge-104-5.anchor.test.ts` B-43~B-47 |
| 파트 참고세액 | `aggregate-ref-tax-parts.anchor.test.ts` A-1~A-3b |
| **Q2 호별 버킷** | `aggregate-clause-bucket-short-term.anchor.test.ts` Q-1~Q-8d |
| **Q3 파트 묶음** | `split-part-clause-bucket.anchor.test.ts` E-2a~E-2d |

### 7.2 신규 anchor 시나리오

| ID | 케이스 | 현행 | 도출값 |
|---|---|---:|---:|
| **P13-1** | ① `[S, B]` | 409,060,000 | **432,060,000** |
| **P13-2** | ① 순서 반전 `[B, S]` | 409,060,000 | **432,060,000**(동일) |
| **P13-3** | ⭐ **파트 없는 동등 입력과 같은 값** — `[S,B]` == `[B2,B]` | 불일치 | **일치** |
| **P13-4** | ③ `[S, S2]` | 379,060,000 | **396,060,000** |
| **P13-5** | 회귀 ② `[N, P]` 부분 비사토 + 사업용 | 240,000,000 | 불변 |
| **P13-6** | 회귀 ④ `[B, B2]` 파트 없는 자산만 — **세액·`appliedRate` 모두 불변** | 432,060,000 · 0.72 | 불변 |
| **P13-7** | 구조 — split 자산의 파트가 다른 자산과 **같은 버킷**임을 `groupCalculatedTax`로 고정 | — | — |

**P13-3이 이 작업의 핵심 성공 기준**이다 — 「split이라는 이유만으로 달라지지 않는다」.

---

## 8. 리스크

| # | 리스크 | 완화 |
|---|---|---|
| R-1 | `isAssetLevelClause5` 제거가 **D-12를 회귀**시킨다(자산 내부 §104⑤ 분해 소멸) | 파트로 **분해**하는 것이지 자산 단위로 **되돌리는** 것이 아니다. 파트 세액은 `a.parts`가 이미 들고 있다. §7.1 GREEN 조건 + P13-5(부분 비사토)가 고정 |
| R-2 | 대표 입력을 재구성하면 dual-truth | `p.rateInput` 그대로 사용(§5.2 ⚠️) |
| R-3 | 표시(`appliedRate`·`surchargeRate`) 드리프트 | B안이 계산식을 유지 → ④ 완전 불변 실측. P13-6이 고정 |
| R-4 | `short_term`은 `groupTaxBase`(그룹 합계)와 `Σ 파트 과세표준`이 어긋날 수 있다 | 파트 과세표준의 합 = 자산 과세표준의 합 = `groupTaxBase`(`resolveSplitAwareTax`가 `Σ파트 = 자산` 불변식을 지킨다 — `computeSplitPartTax:286` 검증 후 `null` 반환). 실측 회귀 0 |

---

## 9. 미검증 레지스트리

| 항목 | 상태 |
|---|---|
| 🆕 **표시 이중계상(기존 결함 · 이 작업 범위 밖)** — `calcTax`의 중과 반환은 `appliedRate = baseRate + additionalRate`로 **가산을 이미 포함**하는데 `surchargeRate`가 따로 있고, UI가 **더한다**(`BundledAllocationCard.tsx:425` `(appliedRate + surchargeRate) * 100` · `MultiTransferTaxResultView.tsx:606` `+N%p` 병기). 누진 호 분기(P12)가 그 상태다 | 🔶 **표시 전용 · 미판정**. B안은 `short_term`의 `surchargeRate = undefined`를 유지해 **새로 노출시키지 않는다**. 별건 |
| `classifyRateGroup`이 **승자**를 본다 | 🔶 선행 계획서 §11.3 — 법령 검토 선행 |
| 다건(②) 비사토 축 E-2 | ✅ 선행 계획서 §11.1 — 구조적 미발현 |

---

## 10. 이력

- **v1.0** (2026-08-02) — 최초 작성. 선행 `transfer-rate-clause-candidates.plan.md` v2.3 §11.2가
  실측한 「`short_term` 파트 단위 버킷 과소 23,000,000」을 단독 계획서로 분리했다.
  - 케이스 4종 실측(① 23,000,000 · ③ 17,000,000 · ② 0 · ④ 0) + **도출값을 엔진 자신이 확증**함을 확인.
  - 설계 3안 비교 후 **B안(버킷 멤버만 교체 · 표시 규약 유지)** 채택 — A안(완전 통합)은 회귀
    케이스 ④의 **표시가 바뀜**을 실측으로 확인해 배제.
  - B안 임시 적용해 **양도+calc 812파일 9,835건 회귀 0** 실측.
  - 🆕 표시 이중계상(기존 결함)을 §9에 등록.

- **v1.1** (2026-08-02) — **P13 완료**. `short_term` 버킷 멤버를 파트로 교체.
  ⇒ §104⑤ 합산 단위가 **전 그룹에서 「파트」로 통일**됐다(키·인자 축·멤버 단위 셋 다 동일).
  Do 중 고아 3건 제거(`isAssetLevelClause5` · `splitParts`/`partialNbl` 반환 · import).
