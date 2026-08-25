# 겸용주택 §104⑦ 중과 — 세대 주택 목록 미입력 시 중과 전무 (별건)

> 이월 출처: `transfer-right-to-move-in-surcharge-scope.plan.md` §6.2 「겸용주택 fallback 미포함」
> 검증 깊이 **L3** — 세액이 바뀐다 · 좌우 불일치 · 입력 경로 정책이 갈린다
> 작성 2026-08-25 · base `e4d6e580`(PR #1279 머지 후)

---

## §0 착수 전 실측 (P-0)

### P-0.1 🔴 **결함은 실재하고 규모가 크다**

겸용주택(주택 100㎡ + 상가 100㎡ · 조정대상지역 · 세대 2주택 · 양도 2026-06-01) 실브라우저 실측:

| 세대 보유 주택 목록 | 세율 | 결정세액 | 주택분 장특공제 |
|---|---|---|---|
| **입력함**(`houses[]` 1건) | 0.65 (0.45 + §104⑦1호 20%p) | **1,567,019,136** | 0 |
| **미입력** | 0.45 | **1,061,535,000** | 445,655,171 |

⇒ **505,484,136원 과소과세.** 같은 사실관계인데 사용자가 목록을 채웠는지 여부로 갈린다.

API 응답 키가 그대로 드러낸다 — 미입력이면 `result.multiHouseSurcharge` **키 자체가 없다**.

```
houses 있음: [... "warnings", "multiHouseSurcharge", "acquisitionByInheritance"]
houses 없음: [... "warnings",                        "acquisitionByInheritance"]
```

### P-0.2 🔴 **좌우 불일치** — 일반 주택은 걸리고 겸용만 안 걸린다

| 자산 | `houses[]` 없이 조정·다주택 | 중과 |
|---|---|---|
| `housing` (일반 주택) | fallback(`householdHousingCount` + `isRegulatedArea`) | ✅ 0.68 |
| `redevelopment_apt` | 같은 fallback | ✅ 0.68 |
| **겸용주택** | **fallback 없음** | ❌ 0.45 |

일반 주택·재개발APT는 `resolveSurchargeApplication`의 fallback 분기를 타지만, 겸용은 **그 leaf를 쓰지 않는다**.

### P-0.3 🔴 **초판 판정 정정 — 「fallback 집합에 넣으면 걸린다」는 틀렸다**

직전 계획서(`transfer-right-to-move-in-surcharge-scope.plan.md` §3.5.2)는 이렇게 적었다:

> 반대로 **fallback 집합**에 넣으면 원시 플래그만으로 중과가 **새로** 걸린다(세액 증가 = 범위 확대).

**틀렸다.** 겸용은 중과를 자체 경로로 판정한다:

- `app/api/calc/transfer/route.ts:352` — `data.houses && data.houses.length > 0` 일 때만 `mixedAsset.multiHouse`를 만든다. 주석에도 「`houses` 미전송(단독 주택)이면 undefined → **엔진이 중과 판정을 건너뛴다**」로 적혀 있다.
- `lib/tax-engine/transfer-tax-mixed-use.ts:180` — `asset.multiHouse`가 있을 때만 `determineMultiHouseSurcharge`를 호출하고, 없으면 `multiHouseSurcharge === undefined`.
- `:206` `surchargeLthdExcluded` · `:394` `surchargeAddon` — 둘 다 `multiHouseSurcharge`를 직접 읽는다. **`SURCHARGE_FALLBACK_PROPERTY_TYPES`를 보지 않는다.**

⭐ **이미 신호가 있었다.** 직전 배치의 mutation **P-7**(fallback 집합에 `mixed-use-house` 추가)이 실패시킨 것은 leaf 단위 테스트 `RT-14` **1건뿐**이었고 엔진 경유 영향은 **0**이었다. 그때 「별건 경계 표식」으로만 읽고 넘어갔는데, 그 0이 곧 「이 집합은 겸용 세액에 닿지 않는다」는 증거였다.

⇒ **`SURCHARGE_FALLBACK_PROPERTY_TYPES`에 `mixed-use-house`를 추가하는 것은 이 결함의 해법이 아니다.** 무해하지만 무효다.

---

## §1 법령

### §1.1 겸용주택의 **주택분**은 §104⑦ 대상이다 — 이미 확립된 판단

「소득세법」 §104⑦은 「다음 각 호의 어느 하나에 해당하는 **주택**(이에 딸린 토지를 포함한다)을 양도하는 경우」다. 겸용주택은 주택분과 상가분을 나눠 계산하므로 **주택분에만** 미친다 — 현행 코드가 이미 그렇게 적용하고 있다(`transfer-tax-mixed-use.ts:200` 「적용 범위는 **주택분 한정**이다 … 상가건물·상가부수토지, 배율초과 비사업용 토지(§104①8호 자산)에는 미치지 않는다」).

⇒ **이 배치는 「대상인가」를 다투지 않는다.** 대상인 것은 이미 정해져 있고, **입력 경로에 따라 적용이 갈리는 것**이 결함이다.

### §1.2 ✅ 중과 주택 수에 **양도하는 겸용주택 자체가 포함**된다 (V-2 · 2026-08-25 사용자 판정)

§104⑦ 각 호는 「조정대상지역에 있는 주택으로서 … **1세대 2주택**에 해당하는 주택」 형식이고, 그 「2주택」은 **세대가 소유한 주택 수**다 — 양도 대상 주택도 세대 소유분이므로 당연히 산입된다. 정밀 경로도 같다(`sellingHouseId`가 `houses[]` 안에 있고 `effectiveHouseCount`에 포함된다).

⇒ **fallback 산식은 `householdHousingCount`를 그대로 쓴다.** 폼의 「세대 보유 주택 수」가 이미 양도 물건을 포함한 값이므로 +1 보정을 하지 않는다.

> 🔑 이 판정이 세율을 직접 가른다 — 1채 차이로 §104⑦1호(20%p)와 3호(30%p)가 뒤바뀐다.
> 일반 주택 경로의 fallback도 `input.householdHousingCount >= 2`를 그대로 쓰므로 **좌우가 일치**한다
> (`transfer-tax-surcharge-predicate.ts`).

---

## §2 해법 후보 — Q-1 (사용자 결정 필요)

세 갈래가 있고, 이 저장소의 두 원칙이 **서로 다른 방향을 가리킨다**.

> **자동 안분 fallback 금지** — 「미입력은 검증 오류로 차단」 (CLAUDE.md 설계 원칙)
> **UI↔엔진 단일 진실 · 좌우 불일치 제거** — 일반 주택과 겸용이 달라서는 안 된다

| | 해법 | 작업량 | 회귀 표면 | 원칙 정합 |
|---|---|---|---|---|
| **(a)** | **겸용 엔진에 원시 플래그 fallback** — 일반 주택과 같은 leaf(`resolveSurchargeApplication`) 사용 | 중~대 — 겸용 엔진 입력에 `householdHousingCount`·`isRegulatedArea`가 **top-level로 없다**(`multiHouse` 안에만) ⇒ 14지점 동기화 필요 | 중 — 겸용 전건이 움직일 수 있다 | 좌우 불일치 해소 ✅ / 자동 fallback 금지와 **충돌** ⚠️ |
| **(b)** | **입력 차단** — 겸용 + 조정지역 + 주택수 ≥2면 세대 주택 목록을 **필수**로 | 소~중 | **대** — 차단 validation은 전체 E2E를 무더기로 빨갛게 만든 전례가 있다(memory `feedback_blocking_validation_full_e2e_regression`) | 자동 fallback 금지 ✅ / 일반 주택은 여전히 fallback이라 **불일치 잔존** ⚠️ |
| **(c)** | **경고만** — 계산은 현행 유지, 「세대 주택 목록 미입력 — 중과가 반영되지 않았습니다」 경고 노출 | 소 | 소 | 침묵 과소과세는 해소 ❌ (여전히 틀린 세액을 낸다) |

### ✅ **(a) 채택** (2026-08-25 사용자 결정)

**권고: (a).** 근거 셋이다.

1. **일반 주택이 이미 fallback을 쓴다.** 겸용만 다르게 두면 「같은 세대·같은 지역인데 자산 종류로 세액이 갈린다」가 남는다. 자동 fallback 금지 원칙은 **없는 사실을 지어내는 것**을 막는 규칙이지, 이미 입력받은 사실(`householdHousingCount`·`isRegulatedArea`)을 쓰는 것을 막는 규칙이 아니다.
2. **(b)는 겸용만 차단해도 일반 주택 쪽 불일치가 남는다.** 일관되게 하려면 일반 주택도 차단해야 하는데 그건 훨씬 큰 변경이고 이 배치의 범위를 넘는다.
3. **(c)는 세액을 안 고친다.** 505,484,136원이 그대로 남는다.

⚠️ **(a)를 택해도 (c)의 경고는 함께 둔다.** fallback은 **근사**다 — 주택수 제외(영 §167의3① 각 호)·유예·상속 5년 배제를 반영하지 못한다. 일반 주택 경로도 같은 한계를 갖고, 그 사실을 화면이 말해야 한다.

---

## §3 (a) 채택 시 설계 초안

### §3.1 겸용 엔진이 원시 플래그를 **받아야 한다**

현재 `MixedUseAssetInput`에는 `isRegulatedArea`·`householdHousingCount`가 **top-level에 없다** — `multiHouse` 서브객체 안에만 있고(`types/transfer-mixed-use.types.ts:185`), 그 서브객체가 통째로 없는 것이 결함의 원인이다.

⇒ 두 필드를 **top-level optional**로 올린다. `multiHouse`는 정밀 판정 입력으로 그대로 두고, 없을 때만 원시 플래그를 쓴다.

### §3.2 술어는 `resolveSurchargeApplication` **재사용**

직전 배치가 만든 leaf를 그대로 쓴다. `mixed-use-house`는 이미 `SURCHARGE_SUBJECT_PROPERTY_TYPES`에 있으므로 **대상 축은 이미 열려 있다** — `SURCHARGE_FALLBACK_PROPERTY_TYPES`에 추가하고 leaf를 호출하면 된다.

```
const surcharge = resolveSurchargeApplication(
  { propertyType: "mixed-use-house", isRegulatedArea, householdHousingCount, transferDate },
  asset.multiHouse ? multiHouseSurcharge : undefined,
  surchargeSpecialRules,
);
surchargeLthdExcluded = surcharge.isSurchargeCase && !surcharge.isSuspended;  // §95②
surchargeAddon        = surcharge.isRateSurchargeApplied ? resolveSurchargeAddonRate(transferDate, surcharge.effectiveSurchargeType) : undefined;
```

⚠️ **두 축이 다르다는 것을 유지한다** — 위기취득 배제는 세율만 빼고 장특 배제는 존속한다(`transfer-tax-mixed-use.ts:196` 주석 · 서울행정법원 2024구단72950). leaf가 이미 그 구분을 갖고 있다.

### §3.3 결과 카드 표시

`MixedUseResultCard.tsx:441`은 `mh.effectiveHouseCount`를 문구에 쓴다(「조정대상지역 N주택 중과 대상 주택」). fallback 경로에는 `mh`가 없으므로 **표시 소스를 leaf 결과로 통일**해야 한다 — 아니면 「배제인데 사유 문구가 안 뜬다」가 된다(직전 배치의 재개발 카드와 같은 함정).

### §3.4 14 동기화 지점

신규 필드 2개(top-level `isRegulatedArea`·`householdHousingCount`)는 **폼-전역 값이 이미 있으므로 ①~⑧은 대부분 무변경**이고, **⑫⑬⑭**가 실작업이다. 특히 `route.ts:352` 근처에서 `multiHouse`와 **나란히** 전달해야 한다.

> ⚠️ ⑫⑬⑭는 TypeScript가 못 잡는다 — 넣지 않으면 조용히 stripping되어 세액이 1원도 안 움직인다(memory `feedback_api_zod_schema_sync` · `feedback_api_trigger_without_input_path_is_noop`).

---

## §4 미검증 레지스터 V-n

| ID | 항목 | 판정 | 상태 |
|---|---|---|---|
| **V-1** | 겸용 엔진 top-level에 원시 플래그가 있는가 | ❌ **없다** — `isRegulatedArea`·`householdHousingCount` 둘 다 `multiHouse` 서브객체 안에만 있다. **신규 top-level 필드 2개 + ⑫⑬⑭** 필요 | ✅ |
| **V-2** | 중과 주택 수에 **양도하는 겸용주택 자신**이 포함되는가 | ✅ **포함** (사용자 판정 · §1.2) — `householdHousingCount`를 **그대로** 쓴다(+1 보정 없음) | ✅ |
| **V-3** | §104⑤ 파트 세율(`rateParts`)이 fallback 중과를 반영하는가 | ✅ **자동 반영** — `rateParts`의 `housing` 파트가 `surchargeAddon`을 그대로 받는다(`transfer-tax-mixed-use.ts:413`). **추가 배선 불필요** | ✅ |
| **V-4** | 주택 면적 ≤ 상가 면적인 겸용주택도 같은 취급인가 | ✅ **게이트 불필요** — `splitMode`는 「2022.1.1 이후/이전」 축이지 면적 비교 축이 **아니다**(`types/transfer-mixed-use.types.ts:648`). 2022 개정 후 겸용은 **항상 분리계산**이라 면적비로 갈리는 분기가 없다 | ✅ |

### §4.1 V-1 상세 — 폼-전역 값 주입은 **이미 확립된 패턴**이다

`MixedUseAssetInput`은 폼-전역 값을 route가 주입하는 필드를 이미 여럿 갖고 있다:

- `isOneHouseExempt`(`:133` — 「AssetForm.isOneHousehold 값을 그대로 전달」)
- `temporaryTwoHouse`(`:141` — 「**폼-전역** 값이라 route가 주입한다」)
- 영 §154① 요건 3필드(`:144` — 「셋 다 **폼-전역(top-level)** 값이다」)

⇒ 같은 패턴으로 2개를 더한다. **새 개념을 만드는 것이 아니다.**

---

## §4.5 착수 전 안전망 — **46건** (0이 아니다)

`multiHouseSurcharge === undefined`일 때 장특 배제와 세율 가산을 **무조건** 켜는 mutation을 걸고 측정:

```
Test Files  13 failed | 734 passed (747)
      Tests  46 failed | 7262 passed | 3 skipped | 1 todo (7312)
```

⚠️ **이 46은 과대 측정이다.** 실제 fallback은 `isRegulatedArea === true && householdHousingCount >= 2` **조건부**인데, 엔진에 그 값이 아직 없어 mutation으로는 조건을 재현할 수 없다 — 비조정·1주택 fixture까지 전부 중과가 걸렸다. **정확한 회귀 수치는 구현 후에만 나온다.**

그래도 방향은 분명하다 — 재개발·입주권 때의 **0건**과 달리 **겸용 중과 축에는 계약이 실재한다**. 기존 anchor(`mixed-use-104-7-surcharge.anchor.test.ts` 등)가 그 축을 지키고 있으므로, 구현 후 **의도된 변화(조정·다주택 fixture)와 의도치 않은 변화(그 외)를 갈라 확인**해야 한다.

---

## §5 anchor 계획 + mutation

### §5.1 anchor (엔진)

| ID | 단언 |
|---|---|
| MF-01 | 🔴 `houses[]` 없이 조정·2주택 → 중과 적용 (세율 0.65 · 장특 0) |
| MF-02 | 🔴 정밀 경로와 **같은 값** (입력 방식이 세액을 가르지 않는다) |
| MF-03 | 정밀 판정이 있으면 **그것이 이긴다** (주택수 제외가 반영된 fallback 역전 케이스) |
| MF-04 | 유예 창 안(2026-05-09)에서는 미적용 — 경계 |
| MF-05 | 대조 — 비조정이면 fallback도 미적용 |
| MF-06 | 대조 — 상가분·비사업용 토지 파트는 **불변** (주택분 한정) |
| MF-07 | 위기취득(2009-03-16~2012-12-31) — 세율은 배제, 장특 배제는 존속 |
| MF-08 | 결과 카드가 fallback 경로에서도 배제 사유를 표시한다 (RTL) |
| MF-09 | 경고 — 목록 미입력 시 「fallback 근사」 안내가 뜬다 |

### §5.2 mutation probe

| ID | 무력화 | 잡아야 할 anchor |
|---|---|---|
| MP-1 | fallback 분기 제거(현행 복원) | MF-01·MF-02 |
| MP-2 | `SURCHARGE_FALLBACK_PROPERTY_TYPES`에서 `mixed-use-house` 제거 | MF-01 |
| MP-3 | 정밀 결과 우선순위 뒤집기 | MF-03 |
| MP-4 | 세율 축만 배선하고 장특 축 누락 | MF-01 (장특 단언) |
| MP-5 | 장특 축만 배선하고 세율 축 누락 | MF-01 (세율 단언) |
| MP-6 | ⑭ route에서 신규 필드 전달 제거 | MF-01 (**⑫⑬⑭ 침묵 strip 검출**) |
| MP-7 | 경고 제거 | MF-09 |

> **MP-6이 이 배치의 핵심 probe다.** 신규 필드가 실제로 엔진에 도달하는지를 재는 유일한 수단이다.

### §5.3 착수 전 안전망 — ⏳ 미측정

fallback 분기를 넣기 전에 **현행 동작(중과 미적용)을 지키는 것이 있는지** 먼저 잰다. 0건이면 신규 anchor를 필수로 못박는다.

---

## §6 범위 밖

| 항목 | 이유 |
|---|---|
| 일반 주택 fallback을 **차단으로 바꾸는 것** | 훨씬 큰 정책 변경 — 전 세목 입력 UX에 영향 |
| 겸용주택 §104⑦ **대상 여부** 재론 | 이미 확립(§1.1) — 재제안 금지 |
| 유예 창 나·다목 | 별건(직전 계획서에서 이월) |

---

## §7 실행 순서

```
1. V-1~V-4 probe                  → verify: 타입·주택수 축·rateParts·splitMode 실측
2. 착수 전 안전망 측정(§5.3)       → verify: fallback 없는 현행을 지키는 테스트 수
3. Q-1 결정 확인                   → verify: (a) 확정 시 §3 설계 확정
4. 타입 + ⑫⑬⑭ 배선               → verify: tsc 0 · route probe로 엔진 도달 확인
5. 겸용 엔진 leaf 배선(§3.2)       → verify: MF-01 실측값 확정
6. 결과 카드 표시(§3.3) + 경고     → verify: RTL
7. MF-01~09 작성                   → verify: 전건 초록
8. mutation MP-1~7                 → verify: 7/7 구별. 0인 항목은 anchor 재작성
9. 전건 회귀 + E2E                 → verify: tsc 0 · lint 베이스라인 · E2E 인접 spec
```

**완료 조건**

- [ ] V-1~V-4 전건 해소 (판정 근거 기록)
- [ ] MF-01~09 초록 · mutation 7/7 구별
- [ ] 겸용 기존 anchor(`mixed-use-104-7-surcharge.anchor.test.ts` 27건 등) 불변
- [ ] 전건 통과 · tsc 0 · lint 베이스라인 유지
- [ ] E2E 실브라우저 확인

---

## §8 산출물 게이트 판정

`.engine.design.md` / `.ui.design.md` — **N/A**.

- 여러 세션·여러 PR: ❌ 단일 배치 예상
- UI 위젯 5개 이상 신설: ❌ 경고 1건뿐
- 다른 맥락에서 이어받음: ❌ 이 문서로 충분

⇒ 통합 계획서 1건이 1급 산출물이다.

---

## §9 실행 결과 (2026-08-25)

### §9.1 확정 수치 (실브라우저 · 조정지역 · 세대 2주택 · 양도 2026-06-01)

| 케이스 | 세율 | 결정세액 | 주택분 장특공제 | 경고 |
|---|---|---|---|---|
| 정밀(`houses[]` 입력) | 0.65 | 1,567,019,136 | 0 | 0 |
| **fallback(목록 미입력)** | **0.65** | **1,567,019,136** | **0** | **1** |
| 대조 비조정 | 0.45 | 1,061,535,000 | 445,655,171 | 0 |
| 대조 1주택 | 0.45 | 716,221,875 | 203,330,171 | 0 |
| 대조 유예 창 안(2026-05-09) | 0.45 | 1,061,535,000 | 445,655,171 | 0 |

⭐ **정밀 == fallback.** 입력 방식이 세액을 가르지 않는다 — 종전 505,484,136원 과소 해소.

### §9.2 변경 파일

| 파일 | 내용 |
|---|---|
| `types/transfer-mixed-use.types.ts` | `surchargeFallback` 입력 + `surchargeLthdExclusion` 결과 echo |
| `transfer-tax-mixed-use.ts` | leaf 재사용 · 세율/장특 두 축 배선 · 근사 경고 |
| `app/api/calc/transfer/route.ts` | ⑭ 원시 플래그 전달 |
| `MixedUseResultCard.tsx` | **재도출 제거** → echo 표시 + 근사 안내 |
| anchor 4파일 | 엔진 10 · route 5 · RTL 6 · E2E 3 |

### §9.3 🔴 초판 판정 정정 — 표시 배선이 빠져 있었다

계획서 §3.3이 예고한 대로 **결과 카드가 `multiHouseSurcharge`를 직접 읽어 재도출**하고 있었다.
카드 주석에는 「판정은 엔진 결과를 그대로 읽는다 — **재도출 금지**」라 적혀 있었지만 실제 코드는
`mhs.surchargeType !== "none" && !isSurchargeSuspended`를 다시 계산했다. fallback 경로에는 그
객체가 없으므로 카드가 배제를 못 알아보고 **「장기보유공제 (표1, 0.0%)」**로 표시했다.

⇒ E2E **F-1이 그 상태에서 빨개졌다.** 엔진·route anchor 15건은 전부 초록이었다 —
**표시 축은 그 층에서 관측되지 않는다**(직전 배치의 재개발 카드와 같은 함정).
`surchargeLthdExclusion` echo를 신설해 카드가 **읽기만** 하도록 바꿨다.

### §9.4 anchor 24건 · mutation **10/10 구별**

| ID | 무력화 | 실패 |
|---|---|---|
| MP-1 | fallback 분기 제거(현행 복원) | 11 |
| MP-2 | `propertyType`을 `mixed-use-house`로(집합에 없음) | 11 |
| MP-3 | 정밀 우선순위 뒤집기 | 15 |
| MP-4 | 세율 축만 배선(장특 누락) | 7 |
| MP-5 | 장특 축만 배선(세율 누락) | 5 |
| MP-6 | ⑭ route 전달 제거(**침묵 strip**) | 3 |
| MP-7 | 경고 제거 | 2 |
| MP-8 | 주택수 **+1 보정** 오구현(V-2 반대) | 7 |
| MP-9 | 경고를 `isSurchargeCase`로(유예 중 오발화) | 1 |
| MP-10 | 배제 echo 미탑재(카드 재도출로 회귀) | 5 |

> **MP-8이 V-2 판정을 고정한다** — 「양도하는 겸용주택 자신이 주택 수에 포함된다」를 어기면
> 1주택 케이스가 2주택으로 승격돼 중과가 잘못 걸린다.
> **MP-6이 ⑫⑬⑭ 침묵 strip을 잡는 유일한 probe다.**

### §9.5 검증

- **1,497파일 16,456테스트 전건 통과** · tsc 0 · lint **0 errors / 309 warnings**(베이스라인)
- 겸용 기존 anchor 전건 불변 — **회귀 0**
- E2E 신규 3건 + 기존 겸용 중과 3건 통과
- ⚠️ 착수 전 안전망 46건은 **과대 측정**이었다(§4.5). 실제 회귀 0 — 엔진 fixture 직접 호출은
  `surchargeFallback`이 undefined라 `householdHousingCount: 0`으로 fallback이 걸리지 않는다.

### §9.6 미수행 / 별건

- **일반 주택 fallback을 차단으로 바꾸는 것** — 범위 밖(§6). 이 배치는 겸용을 일반 주택에
  **맞춘** 것이지 fallback 정책 자체를 다루지 않는다.
- **§104⑤ 다건** — 겸용은 다건에서 차단된다(`multi-transfer-tax-validate.ts:72`).
