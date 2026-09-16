# 계산 이력 dedup 키가 **물건을 유일 식별하지 못한다** (수정 계획서)

> 작성 2026-09-16 · 기준 커밋 `9de4c242`
> 발단: PR #1644 잔여 🟡 「businessKey 주소 누락 시 키 충돌」 검증 요청
>
> ⚠️ 인용 file:line은 위 커밋 기준이다. 머지 후 재검토 시 전수 대조할 것
> ([[feedback_merged_plan_citations_drift]]).
>
> **검증 깊이 L3** — 초판은 「세액 불변이라 L2」로 봤다. **틀렸다**: §1-4 실측으로
> 이 결함이 **합산 세액을 바꾼다**는 것이 확인됐다(오염된 자산으로 계산된다).
> ⇒ V-n·Q-n 레지스터 + **구현 후 mutation** 필수.

## 0. 한 줄 요약

**서로 다른 물건이 같은 `businessKey`를 갖고, 뒤가 앞을 덮어써 완성된 신고서가 사라진다.**
실측으로 마법사 왕복 2회 → 이력 **1건**(기대 2건). 화면에는 아무 표시도 없다.

**소실로 끝나지 않는다** — 덮인 record가 합산에 편입돼 있으면 [다시 불러오기]가 **엉뚱한 물건을
그 슬롯에 넣고**(라벨은 그대로), **합산 세액이 바뀐다**(§1-4 실측).

축이 둘이다 — ① 주소 미입력 ② 같은 지번 집합건물 두 세대. **어느 한쪽만 막아서는 닫히지 않는다.**

---

## 1. 실측 — 실제 UI로 재현했다

### 1-1. 🔴 주소 미입력 + 같은 양도일

양도가액만 다른 **서로 다른 두 물건**(10억 / 20억)을 소재지 없이 같은 양도일(2023-05-01)로
마법사에서 각각 계산 → `/history`:

```
이력 카드 수 = 1                              ← 기대 2
businessKey: "addr:|2023.05.01"
title:       "양도소득세 — 양도 2023.05.01"    ← 두 건이 같은 제목
```

저장소 계층에서도 같다 — 두 번째 저장이 `created: false`로 **첫 record의 id를 재사용**해
`inputData`·`resultData`를 통째로 덮었다(`111,111,111` → `222,222,222`).

대조군: 주소가 다르면 2건. `clientId`가 다르면 2건(완화 조건이지 방어선은 아니다 — 기본값 `null`).

### 1-2. 🔴 같은 지번 집합건물 두 세대 — **주소를 필수로 해도 안 닫힌다**

`extractAddress`(`lib/storage/title-generator.ts:28-51`)는 **road/jibun만 읽고 동·호를 버린다**:

```
101동 501호  → "addr:서울 강남구 대치동 316|2026.06.03"
102동 1201호 → "addr:서울 강남구 대치동 316|2026.06.03"   동일
```

동·호는 폼에 **있다**(`calc-wizard-asset.ts:269,271` `addressDong`/`addressHo`).
키가 안 볼 뿐이다.

### 1-3. 거짓 분리(반대 방향)도 있다

같은 물건을 한 번은 도로명, 한 번은 지번으로 넣으면 키가 갈린다
(`addr:테헤란로 1|…` vs `addr:역삼동 1|…`). 이 계획서 범위 밖 — §9 미결.

---

### 1-4. 🔴 하류 — **합산 [다시 불러오기]가 오염된다** (세액이 바뀐다)

PR #1644가 만든 staleness 감지 장치가 **오염을 실어 나르는 경로**가 된다. 실측:

```
물건 A를 합산에 편입 (sourceCalculationId = X)
→ 사용자가 무관한 물건 B를 주소 없이 같은 날짜로 계산
   → created: false · 같은 id  (B가 X를 덮었다)
→ 합산 화면: stale 판정 1건 · reason "source_changed"   ← 배너가 뜬다
→ [다시 불러오기]
   → A 슬롯의 양도가액 100 → 999 (=B)
   → 라벨은 "양도 1번" 그대로            ← 사용자는 여전히 A라고 믿는다
```

`reloadPropertyFromSource`(`lib/calc/transfer-multi-load-entry.ts:209-221`)가 폼 전체를
`rec.inputData`로 교체하되 `propertyLabel`·`sourceCalculationId`는 **의도적으로 보존**하기
때문이다(그 자체는 옳은 설계 — 순번·provenance 유지).

⇒ **합산 세액이 엉뚱한 물건으로 계산된다.** 이 계획서가 L3인 이유다.

---

## 2. 왜 열려 있나

- **소재지는 어디서도 막지 않는다** — `lib/calc/transfer-tax-validate*.ts` 전 파일에 주소 검사 **0건**.
  엔진으로 emit되지도 않는다(`transfer-tax-api-helpers.ts:113` 「소재지·좌표는 미emit·미검사」).
  🔬 이 부정형 단언은 **mutation으로 확증했다** — 차단을 넣자 vitest 71건·E2E 58건이 깨졌다(§7).
  정적 grep 0건이 실행으로 확인됐다 ([[feedback_negative_assertion_needs_mutation_probe]]).
- **설계서가 그 칸을 열거하지 않았다** — `calc-history-business-key-dedup.engine.design.md`
  케이스 매트릭스 C1~C9에 「주소 전무, 양도일만」이 **없다**. 의도된 설계가 아니라 미열거 갭이다.
  (같은 문서가 재산세는 `addr ? … : null`로 적으면서 「주소만으로 물건 식별」이라 못박았다 —
  저자의 원칙은 「물건 식별자가 없으면 키를 만들지 않는다」였다.)
- **`addr || date` 형태는 상속의 `name || death` 복사로 보인다** — 상속은 두 짝이 모두 피상속인
  식별자라 성립하지만, 양도는 주소가 물건이고 양도일은 사건이라 **양도일만으로 물건이 식별되지 않는다**.
- **안전망 0건** — 빈 주소 키(`addr:|`)를 단언하는 테스트가 `__tests__`·`e2e` 통틀어 0건.

---

## 3. 모집단 — 세목별 실측

| 세목 | 키 | 주소 축 | 동·호 축 | 차단 |
|---|---|---|---|---|
| 양도 | `addr:{주소}\|{양도일}` | 🔴 `addr:\|날짜` | 🔴 | ✗ 미검증 |
| 취득 | `addr:{주소}\|{취득일}` | 🔴 `addr:\|날짜` | 🔴 | ✗ 미검증 |
| 상속 | `nd:{성명}\|{상속개시일}` | 🔴 `nd:\|날짜` | — | ✗ 미검증 |
| 재산 | `addr:{주소}` | ✅ null 폴백 | 🔴 | — |
| 주식양도 | `sec:{종목}\|{양도일}` | ✅ | — | ✓ `stock-transfer-tax-validate.ts:140` |
| 주식평가 | `sec-val:{종목}\|{평가일}` | 🔴 `sec-val:\|날짜` | — | ✗ 미검증 (V-1 실측) |

양도만 UI 왕복으로 소실까지 재현했다. **취득·상속·재산·주식평가는 키 충돌만 실측**했고 UI 왕복은 미측정.

**주식평가(V-1 해소)**: `StockValuationTool.tsx:65`가 `useAutoSaveCalculation`으로 저장하므로
businessKey 경로를 탄다. 회사명 차단 검증은 **0건**(`StockValuationForm`·`UnlistedStockEditor`·
`UnlistedStockSimpleFields` 전수 grep) — 저장 조건은 `computeStockValuation(it) > 0`이지
회사명이 아니다. ⇒ §5 #2 대상에 **포함**한다.

---

## 4. 설계 — 두 축은 **경쟁이 아니라 역할 분담**이다

| | 담당 | 방어 경로 |
|---|---|---|
| **A. 식별 강화** (필수화 + 키에 동·호) | 이력 dedup이 **물건 단위**로 동작 | 정상(계산 완주) |
| **B. 안전 폴백** (식별자 불충분 → `null`) | 덮어쓰기 **원천 차단** | 저장하기·레거시·미완성 |

**A만으로는 안 된다** — §4-3의 우회 경로가 남는다.
**B만으로는 안 된다** — §1-2의 동·호 충돌이 남는다.

### 4-1. 🔑 필수화만 하면 **no-op**이다

키는 `extractAddress`가 만들고 그 함수는 동·호를 버린다(§1-2). **⑤⑧ 게이트와 키 산출을
같이 고쳐야** 한다. 한쪽만 고치면 화면만 까다로워지고 충돌은 그대로다
([[feedback_fixed_layer_vs_consumed_layer]]).

### 4-2. 🔑 집합건물을 가르는 축이 **없다** — 만들지 말고 기존 신호를 쓴다

`assetKind`는 8종인데 **`"housing"`이 아파트와 단독주택을 함께 담는다**
(`calc-wizard-asset.ts:71`). 상가도 집합·단독이 한 값이다. 코드 어디에도 집합건물 판별
헬퍼가 없다(grep 0건).

⇒ **새 분류를 만들지 않는다.** `AddressSearch`가 주소 선택 시 이미
`fetchUnits(pnu, jibun)`로 **공동주택 세대 목록을 조회**한다(`components/ui/address-search.tsx:203`).

> **규칙: 「세대를 고를 수 있었는데 안 골랐으면 차단」.**
> 토지·단독건물은 목록이 비므로 자동 면제된다. 새 taxonomy도, 자산유형별 분기도 필요 없다.

⚠️ 세대 목록은 **런타임 신호**라 폼에 남지 않는다 ⇒ 선택 결과(`addressDong`/`addressHo`)와
**「세대가 있었다」는 사실**을 폼에 남겨야 ⑧이 판정할 수 있다. 필드 1개 추가(§5-3).

### 4-3. 🔑 [저장하기]는 validate를 **우회한다**

`handleManualSave`(`app/calc/transfer-tax/TransferTaxCalculator.tsx:124-138`)는
`runTransferManualSave`를 바로 부르고, 그 안은 `isFormEmpty`만 본다
(`components/calc/transfer-tax-save-handler.ts:26-35`). **validate를 타지 않는다.**

차단을 걸 수도 없다 — 「미완성 입력을 일단 저장」이 그 버튼의 존재 이유다.
⇒ **이 경로는 축 B(`null` 폴백)로만 방어된다.**

자동저장은 `resultData`가 있을 때만 돌므로(`use-auto-save-calculation.ts:85`) 계산 완주 =
validate 통과 ⇒ 축 A가 덮는다.

### 4-4. 🔴 **다건은 검증이 차단이 아니다** (초판 판정 정정)

> **초판은 「다건은 IndexedDB 시드로 들어와 ⑧ 자산 검증을 타지 않는다」고 했다. 틀렸다.**
> `isPropertyReady`가 `validateStep(0..2)`를 **호출한다**(`lib/calc/multi-transfer-tax-validate.ts:191-198`).
> 그러나 유일한 소비자 `MultiTransferSteps.tsx:137`이 그 결과를 **경고 Alert 렌더 조건**으로만 쓴다 —
> 「일부 자산의 필수 정보가 입력되지 않았습니다」를 띄울 뿐 **버튼을 막지 않는다.**
> ⇒ 결론 정정: **주소를 필수로 해도 다건은 계산이 막히지 않는다.**

귀결이 둘이다:

1. **축 A가 다건에 없다** — `addr:|{양도일}|multi` 충돌이 그대로 남는다. 다건 자동저장도
   `saveOrUpdateByBusinessKey`를 타므로 **같은 방식으로 덮어쓴다.**
2. **E2E 0건 실패는 「안전」이 아니라 「게이트 부재」의 증상**이었다.

⇒ 다건에도 차단을 세울지는 **Q-3**(§10-2). 세우지 않으면 다건은 축 B만으로 방어된다.

### 4-5. 🔴 **레거시 이력의 재계산이 막힌다** (신규 발견)

`handleSubmit`이 **전 step `collectStepIssues`를 돌린다**(`app/calc/transfer-tax/TransferTaxCalculator.tsx:233-238`).
기존 이력 record 대다수는 **주소 없이 저장됐다**(소재지가 필수였던 적이 없다).

⇒ 사용자가 옛 신고서를 열어 **재계산·수정신고·경정청구를 하려면 주소를 새로 입력해야 한다.**
데이터 소실은 아니지만 **기존 워크플로가 끊긴다.** 차단 강도는 **Q-2**(§10-2).

### 4-6. `extractAddress`를 고칠 것인가, 별도 헬퍼를 만들 것인가

`extractAddress`는 **businessKey(양도·취득·재산)와 `generateTitle`(전 세목) 공용**이다
(`title-generator.ts:116`). business-key.ts 헤더가 「title ↔ businessKey 단일 소스(드리프트 방지)」를
명시적 설계로 선언했다.

**⇒ `extractAddress`를 고친다(별도 헬퍼 금지).** 근거 셋:

1. 헤더가 선언한 단일 소스를 깨지 않는다.
2. **제목도 같이 고쳐진다** — §1-1에서 두 건의 제목이 동일했다. 동·호가 들어가면 사용자가 구분할 수 있다.
3. **제목 회귀가 0건이다** — `generateTitle` 반환을 단언하는 테스트는 실측 **3건**이고
   전부 주소 형식과 무관하다:
   `multi-amendment-dedup.test.ts:66,79`(접두 `toContain("양도소득세 (다건)")`) ·
   `stock-transfer/title-generator.test.ts:67,89`(주식 — 주소 미사용).
   별도로 `title:`을 직접 세팅하는 픽스처 2건이 있으나 생성 제목을 단언하지 않는다.

   > ⚠️ **초판은 「2건뿐」이라 적었다. 모집단이 좁았다** — 세목 4개 패턴만 grep했고
   > 함수명(`generateTitle`)으로는 훑지 않았다. 결론(영향 0)은 유지되나 근거를 교체한다.
   > ([[feedback_closure_claim_scoped_to_verified_subset]])

필드명이 세목별로 다르다 — 양도는 `addressDong`/`addressHo`, 취득·재산은 `dong`/`ho`
(`components/calc/acquisition/shared.ts:202,204` · `components/calc/property/shared.ts:133,135`).
기존 함수가 이미 `input.road ?? input.addressRoad` 패턴을 쓰므로 **같은 방식으로 흡수**한다.

---

## 5. 수정 범위

| # | 파일 | 변경 | 축 |
|---|---|---|---|
| 1 | `lib/storage/title-generator.ts` `extractAddress` | 동·호를 주소에 접미 (양도 `addressDong/Ho` · 취득·재산 `dong/ho` 필드명 흡수) | A |
| 2 | `lib/storage/business-key.ts` | 양도·취득: 주소 없으면 `null` / 상속: 성명·RRN 없으면 `null` / 주식평가·**주식양도**: 종목명 없으면 `null` | B |
| 3 | `lib/calc/transfer-tax-validate-asset.ts` | ⑧ 소재지 필수 + 세대 있으면 동·호 필수 | A |
| 4 | `components/calc/transfer/asset-sections/AssetSectionBasic.tsx` | ⑤ 필수 표시 + 세대 미선택 경고 | A |
| 5 | **신규 asset 필드** — §5-1 참조 (4곳 배선) | 「세대 목록이 있었다」 플래그 | A |
| 6 | `lib/storage/db.ts` | `version(8)` — `businessKey` 재계산 (§6) | — |
| 7 | `app/calc/transfer-tax/multi/MultiTransferSteps.tsx:137` | 다건 게이트 — 경고 Alert → **차단**(Q-3 (가)) | A |
| **8** | **`components/ui/address-search.tsx`** | **「입력한 주소 그대로 사용」 경로** — §5-2 (구현 중 발견) | A |
| **9** | **`lib/calc/transfer-tax-api-helpers.ts` `mergePrimaryBasic`** | 지분 컴패니언의 소재지·세대 승계 — §5-3 (구현 중 발견) | A |

### 5-2. 🔴 필수로 만들면 **입력 경로를 함께 열어야 한다** (계획서 초판 누락)

소재지는 **검색 결과 선택으로만** 폼에 들어간다 — 입력창에 타이핑해도 `query`(로컬 state)만
바뀌고 `value.jibun`은 그대로다(`components/ui/address-search.tsx:244-263`). 수동 입력 경로가
**없다**.

⇒ 필수로 만든 채 두면 **검색이 안 되는 순간 계산 자체가 막힌다** — Vworld 장애, 신규 분양,
미등기 토지, 검색 색인 누락. 「검색 결과가 없습니다」가 막다른 길이 된다.

⇒ 검색 무결과·오류 양쪽에 **「입력한 주소 「…」를 그대로 사용」** 버튼을 낸다. pnu가 없으므로
`regionCode` 자동 파생(조정대상지역 정밀 판정)은 되지 않고 **수동 선택으로 폴백**한다 —
pnu 없는 주소를 고른 종전 경로와 동일하다.

> 이것이 없으면 이 변경은 **배포할 수 없다**. 계획서 초판이 못 본 것은 「필수화」를 검증 규칙으로만
> 보고 **입력 가능성**을 재지 않았기 때문이다.

### 5-3. 🔴 지분 컴패니언은 소재지를 **primary에서 승계**한다 (계획서 초판 누락)

지분 모드(같은 물건을 지분으로 나눔) 컴패니언 카드는 ① 기본정보를 **숨긴다**. `mergePrimaryBasic`이
primary 값을 병합해 검사하는데, 그 목록의 규약이 **「⑬ emit + ⑧ 검사의 합집합」**이다.

소재지는 종전에 「미emit·**미검사**」라 제외였는데 ⑧이 막기 시작하면서 근거의 절반이 뒤집혔다
⇒ `addressRoad`·`addressJibun`·`addressDong`·`addressHo`·`hasAddressUnits`를 승계 목록에 넣는다.
넣지 않으면 **화면에 칸이 없는데 「소재지를 입력하세요」**가 뜬다(UI 통과 ↔ validate 차단 모순).

⚠️ **함께양도(bundled)는 대상이 아니다** — 서로 다른 물건이고 컴패니언 카드가 ① 기본정보를
노출한다. 호출부가 `fullFractional`로 이미 가른다.

취득·재산의 ⑤⑧ 필수화는 **이 계획서 범위 밖**으로 둔다(§11). 1·2·6은 3세목 공통이라
키·제목은 함께 고쳐지고, 입력 게이트만 양도세 먼저다.

### 5-1. 🔴 신규 asset 필드는 **4곳**을 배선한다

「세대 목록이 있었다」는 `AddressSearch`의 **런타임 신호**라 폼에 남지 않는다 ⇒ 필드로 저장해야
⑧이 판정할 수 있다. 신규 `assets[]` 필드는 memory
[[feedback_new_asset_field_stale_sessionstorage_guard]]가 정한 4곳을 **모두** 탄다:

| 지점 | 내용 |
|---|---|
| ① 타입 | `lib/stores/calc-wizard-asset.ts` — 필드 선언 |
| ② factory | `calc-wizard-asset-factory.ts` `makeDefaultAsset` 기본값 |
| ③ migrate | `calc-wizard-asset-migrate*.ts` backfill |
| **④ 접근부 가드** | ⑧·⑤에서 `a.hasAddressUnits ?? false` — **유일한 안전망** |

⚠️ **타입을 non-optional로 선언해도 stale sessionStorage는 `undefined`다.** persist 마이그레이션은
legacy 포맷일 때만 `migrateAsset`을 돌리므로 현행 포맷 구 데이터는 backfill되지 않는다.
④를 빼면 「세대 있었는데 플래그 없음」이 `undefined`로 들어와 **게이트가 조용히 열리거나 크래시**한다.

🔑 **엔진 input이 아니다** ⇒ ⑨~⑭(Zod·body spread·Route 매핑)는 **타지 않는다.**
④ API 변환에서도 **emit하지 않는다**(소재지와 같은 취급).

---

## 6. 🔴 마이그레이션 — 사용자 이력에 보이는 변화다

키 형식이 바뀌면 기존 record는 `businessKey`가 구 형식이라 **매칭되지 않는다** ⇒ 다음 저장 때
새 record가 생겨 **이력에 비슷한 항목 2개**가 뜬다(설계서 §6.1이 기술한 배포 전환 동작).

| 안 | 내용 | 평가 |
|---|---|---|
| (a) 무처리 | 1회 중복 수용 | 사용자가 원인을 알 수 없다 |
| **(b) 일괄 재계산** | `version(8).upgrade`에서 전 record의 `businessKey`를 `extractBusinessKey`로 다시 계산 | **권고** |
| (c) dual-read | 새 키로 못 찾으면 구 키로도 조회 | 복잡도↑·임시 코드가 남는다 |

**(b)를 권고**한다 — `version(7)`이 이미 데이터 정정 upgrade 선례다
(`db.ts:160-172` `migrateNblSigunguCodeRecovery`).

⚠️ 재계산 시 **두 record가 같은 키가 되는 경우**가 있다 — 바로 §1의 충돌로 이미 만들어진
이력이다. 그때 **어느 쪽도 지우지 않는다**(중복 키 허용). `saveOrUpdateByBusinessKey`가
`find`로 첫 건만 잡으므로 이후 저장이 그중 하나를 갱신할 뿐이다.

> 🔴 **「데이터 소실 없음」의 범위를 오해하지 말 것.** 마이그레이션이 **새로** 지우지 않는다는
> 뜻이다. **§1의 충돌로 이미 사라진 신고서는 복구되지 않는다** — 덮어쓰기가 `update`였으므로
> 이전 `inputData`·`resultData`는 어디에도 남아 있지 않다. 이 수정은 **앞으로를 막을 뿐이다.**

⚠️ 재계산 결과가 `null`인 record(주소 없음)는 `businessKey`를 **`undefined`로 지운다**.
그 record는 이후 content 폴백 경로를 타는데, `key === null`이면 `find` 분기에 **도달조차 하지 않으므로**
`null`/`undefined` 표현 차이는 무해하다.

📌 **`businessKey`에는 인덱스가 없다**(`db.ts` grep 0건). `saveOrUpdateByBusinessKey`는
`[userId+taxType+createdAt]` 범위를 `toArray()`한 뒤 `find`한다. 상한이 `MAX_CALCULATIONS_PER_USER`라
성능 문제는 아니다 — 마이그레이션도 같은 방식으로 훑는다. 인덱스 추가는 **범위 밖**.

---

## 7. 회귀 — **실측**

차단을 임시로 넣고(`validateAssetEntry` 선두에 소재지 필수) 전건을 돌렸다.

| 게이트 | 모집단 | 실패 |
|---|---|---|
| vitest 전건 | 2053파일 · 21542테스트 | **29파일 / 71테스트** |
| E2E `transfer-*`+`multi-*` | 266테스트 | **35파일 / 58테스트** (+flaky 1) |

E2E 실패 spec 전체 목록은 §7-1. 착수 전 정적 집계(「계산 완주 37개 중 35개가 소재지 미입력」)와
실측이 일치했다.

🔑 **`transfer-multi-*` 11개 + `multi-*` 1개 spec은 0건 실패다.** 원인은 §4-4 — 다건은
`validateStep`을 호출하면서도 그 결과를 **경고 Alert로만** 쓴다(`MultiTransferSteps.tsx:137`).
⇒ **0건 실패는 「안전」이 아니라 「게이트 부재」의 증상**이다. 다건에 차단을 세우면(Q-3)
이 12개 spec도 회귀 대상이 된다 — **§7 수치는 Q-3을 「세우지 않음」으로 가정한 값이다.**

⚠️ **측정 시 파이프 함정에 걸렸다** — `npx playwright test … | tail -15`가 `tail`의 exit 0을
돌려줘 「전건 통과」로 보였다. 실제로는 58건이 실패했고 아티팩트로만 드러났다.
**E2E 판정은 파이프 없이, exit code로** 할 것 ([[feedback_gh_watch_pipe_exit0_false_green]] ·
[[feedback_playwright_summary_last_passed_line_hides_failures]]).

⚠️ vitest 픽스처를 고쳐도 **E2E는 별개 모집단**이다
([[feedback_blocking_validation_full_e2e_regression]]) — 양쪽을 따로 수선해야 한다.
⚠️ 픽스처는 **실제 저장 경로와 맞춘다** — 단언을 느슨하게 해서 통과시키지 않는다
([[feedback_fixture_default_masks_gate_defect]]).

---

## 7-1. E2E 실패 spec 전체

**아래 36개 중 `transfer-phd-building-stdprice-calculator`는 flaky**(재시도 통과) ⇒
**실질 실패 35파일 / 58테스트.** §7 표와 같은 수다.

```
transfer-155-16-18-deadline-specials        transfer-gift-163-9-sec164-flow
transfer-155-8-outside-capital              transfer-inheritance-post-deemed-land-164-4
transfer-155-temp-two-house-surcharge-…     transfer-nbl-academy-land
transfer-amendment                          transfer-nbl-revenue-deemed-common
transfer-axis-b-burdened-gift               transfer-nbl-surcharge-amount
transfer-axis-b-expropriation               transfer-nbl-unconditional-exemption
transfer-burdened-gift-carryover-block      transfer-phd-building-stdprice-calculator ← flaky
transfer-burdened-gift-fractional           transfer-pre1990-land-transfer-stdprice
transfer-commercial-bundled                 transfer-replacement-house
transfer-companion-burdened-gift            transfer-result-no-detail-summary-table
transfer-companion-general-building         transfer-self-owns-filing-form
transfer-companion-mixed-use                transfer-sidebar-asset-kind-amounts
transfer-companion-presale-right            transfer-sidebar-estimated-preview
transfer-companion-redev-166                transfer-single-loss-gain
transfer-correction-claim                   transfer-swap-97-2-statement
transfer-date-input-validation              transfer-unregistered-asset-kind-gate
transfer-estimate-mode-lump-sum-deduction
transfer-expropriation-77-2025
transfer-fractional-bundled
transfer-fractional-single-asset
```

수선은 **픽스처에 소재지를 넣는 방향**이다 — 단언을 느슨하게 하거나 게이트를 우회하지 않는다.
공용 헬퍼(`e2e/_helpers/`)에 소재지 입력 스텝을 추가해 36곳 중복을 피할 것.

---

## 8. 🔴 이 수정으로도 **못 잡는 것** (한계 명시)

1. **[저장하기]로 만든 미완성 record** — 축 B가 `null`을 주므로 덮어쓰기는 막히지만,
   content dedup으로 떨어져 **입력 한 글자마다 새 record**가 생긴다. businessKey가 애초에
   풀려던 문제가 그 경로에서 되살아난다. 증여·종부세가 이미 감수하는 동작이라 **수용**한다.
2. **세대 목록 조회가 실패한 집합건물 — 확정된 한계다(V-2 해소).**
   `fetchUnits`는 4개 연도를 순회하다 `res.ok`가 아니면 `continue`하고, 전부 실패하면
   `catch {}`가 **주석까지 달아** 「API 실패 시 텍스트 input fallback (units 빈 배열 유지)」로
   삼킨다(`components/ui/address-search.tsx:154-186`). **에러 플래그가 없어** 「세대 없음」과
   구분할 수 없다 ⇒ 3-state 게이트는 **불가**. 그때 축 B도 주소가 있어 키를 만드므로
   **충돌이 남는다.**
3. **도로명↔지번 거짓 분리**(§1-3) — 이 계획서는 다루지 않는다.
4. ~~다건에 축 A가 없다~~ — **Q-3 (가) 차단으로 해소**(§10-2). 다건도 ⑧ 게이트를 받는다.
5. **합산 오염(§1-4)은 이 수정으로 닫힌다** — 원인인 덮어쓰기가 사라지기 때문이다.
   **남는 구멍은 항목 2(세대 조회 실패) 하나**뿐이다 — 그 경우에만 여전히 합산 세액이
   엉뚱한 물건으로 계산될 수 있다.

---

## 9. Pre-Do anchor (구현 **전에** 작성 — 🔴는 전부 실패해야 착수)

| # | 내용 | 착수 전 |
|---|---|---|
| K-1 | 주소 없는 두 물건·같은 양도일 → 키 2종 | 🔴 |
| K-2 | 같은 지번·다른 동·호 → 키 2종 | 🔴 |
| K-3 | 같은 지번·같은 동·호 → 키 1종 (중간 저장 dedup 보존) | ✅ 유지 |
| K-4 | 주소 없음 → `null` (양도·취득) | 🔴 |
| K-5 | 성명·RRN 없음 → `null` (상속) | 🔴 |
| K-6 | 제목에 동·호 노출 | 🔴 |
| **K-7** | 회사명 없음 → `null` (주식평가 · V-1 해소분) | 🔴 |
| G-1 | ⑧ 소재지 미입력 차단 | 🔴 |
| G-2 | ⑧ 세대 있는데 미선택 차단 | 🔴 |
| G-3 | ⑧ 세대 없는 토지는 동·호 불요(통과) | ✅ 유지 |
| **G-4** | **다건**에서도 미입력이 차단된다 (§4-4 · Q-3 (가) **확정**) | 🔴 |
| M-1 | `version(8)` 재계산 후 구 record가 새 키를 갖는다 | 🔴 |
| M-2 | 재계산이 **중복 키를 만들어도 record를 지우지 않는다** | 🔴 |
| **M-3** | **재계산 전후 이력 «건수»가 같다** — (b)안의 핵심 약속 | 🔴 |
| **M-4** | 주소 없는 구 record는 `businessKey`가 지워지고 **content 폴백으로 동작**한다 | 🔴 |
| **L-1** | 주소 없는 레거시 폼을 열면 ⑧이 차단한다 (§4-5 · Q-2 결정에 종속) | 🔴 |
| **N-1** | 신규 asset 필드가 **없는**(stale) 자산에서 게이트가 크래시하지 않는다 (§5-1 ④) | 🔴 |
| **R-1** | **§1-4 오염 재현** — 편입된 A의 원본을 무관한 B가 덮지 못한다 (재로드 후 A 값 보존) | 🔴 |

**E2E** — `e2e/transfer-address-unit-gate.spec.ts`:
- **UG-1** 소재지 미입력 → 다음 단계 차단
- **UG-2** 검색 무결과에서도 「입력한 주소 그대로 사용」으로 채워진다 (§5-2 — 없으면 배포 불가)
- **UG-3** 집합건물(세대 목록 있음)에서 동·호 미선택 → 차단 (**배선 증명** — P-8 참조)

⚠️ 차단 메시지는 **인라인 오류 + 점프 링크 두 곳**에 렌더된다 → 셀렉터에 `.first()` 필요
([[feedback_selector_axis_has_three_forms]]).

**뮤테이션**: ① 동·호 접미 제거 → K-2 red ② `null` 폴백 제거 → K-4·K-5 red
③ 세대 게이트 제거 → G-2 red ④ M-2의 「지우지 않는다」 가드 제거 → M-2 red
⑤ **§5-1 ④ 접근부 가드(`?? false`) 제거 → N-1 red**.
구별력 0이면 **그 분기가 맞다는 뜻이 아니다** — anchor를 다시 쓴다
([[feedback_mutation_zero_discrimination_is_not_proof]]).

---

## 10. 검증 게이트

- [x] **V-n 전건 ✅**(§10-1) · **Q-1~Q-4 전건 확정 ✅**(§10-2) — 착수 조건 충족
- [ ] Pre-Do anchor 🔴 전건 실패 확인 후 착수
- [ ] `npx tsc --noEmit` 0건
- [ ] vitest 전건 — §7의 **71건**을 **픽스처 수선으로** 해소(단언 약화 금지)
- [ ] E2E 전건 — §7-1의 **35파일 58건**을 별개 모집단으로 따로 수선
      \+ **다건 12 spec**(Q-3 (가) 확정)
- [ ] 뮤테이션 **5종** 전부 red
- [ ] 브라우저 수동 확인(신규 계산 2건 → 이력 2건 · 집합건물 동·호 게이트 · 합산 재로드)

---

## 10-1. ⭐ 미검증 레지스터 V-n — **전건 해소 전 착수 금지**

| ID | 항목 | 판정 근거 | 결과 | 상태 |
|---|---|---|---|---|
| V-1 | 주식평가 회사명이 **필수인가** | 차단 검증 **0건**(3 컴포넌트 전수 grep) · 저장 조건은 `computeStockValuation > 0` | **필수 아님** ⇒ §5 #2에 세목 추가 | ✅ |
| V-2 | 세대 조회 **실패**가 「세대 없음」과 구분되는가 | `address-search.tsx:154-186` — `catch {}`가 주석과 함께 삼킴, 에러 플래그 없음 | **구분 불가** ⇒ 3-state 불가 · §8-2 한계 확정 | ✅ |
| V-3 | 취득·재산 폼이 **동·호를 실제로 채우는가** | `acquisition/Step0.tsx:232` · `property/Step0.tsx:109` — `dong: v.dong ?? "", ho: v.ho ?? ""` | **채운다** ⇒ §5 #1의 취득·재산 효과 실재 | ✅ |
| V-4 | 합산 편입분 오염이 **실재하는가** | probe 실측 — A 슬롯 100 → **999(=B)**, 라벨은 「양도 1번」 유지 | **실재** ⇒ §1-4로 승격 · **깊이 L3** · anchor R-1 추가 | ✅ |

> **전건 해소.** V-4가 깊이 판정을 L2 → **L3**로 뒤집었다.

## 10-2. ⭐ 결정 게이트 Q-n — **전건 확정** (2026-09-16 사용자 결정)

| ID | 질문 | **결정** | 채택 근거 · 파급 |
|---|---|---|---|
| **Q-1** | 마이그레이션 (§6) | **(b) `version(8)` 일괄 재계산** | 이력 중복이 안 생긴다. `version(7)`이 데이터 정정 upgrade 선례(`db.ts:160-172`) |
| **Q-2** | 레거시 이력 재계산 (§4-5) | **(가) 차단** | 술어를 하나로 유지한다. 대가: 주소 없이 저장된 옛 신고서는 **재계산·수정신고 전에 소재지를 입력**해야 한다 ⇒ anchor **L-1 유효** |
| **Q-3** | 다건 게이트 (§4-4) | **(가) 차단으로 승격** | 다건에도 축 A가 생긴다. ⚠️ **범위가 소재지보다 넓다** — `areAllPropertiesReady`는 step 0~2 **전체** 필수 항목을 보므로 「미완성이어도 계산됨」이 통째로 닫힌다. 경고를 무시한 계산은 어차피 틀린 세액이므로 수용. ⇒ anchor **G-4 유효** · E2E **다건 12 spec 추가 회귀** |
| **Q-4** | [저장하기] content churn (§8-1) | **수용** | 증여·종부세가 이미 감수하는 동작. 완성된 신고서를 지우는 것보다 낫다 |

⇒ **§8 한계 항목 4(다건)는 해소된다.** 남는 한계는 항목 1(churn·수용) · 2(세대 조회 실패) · 3(도로명↔지번)뿐이다.

## 10-3. ✅ 구현 기록 (2026-09-16)

### 초판 판정 정정 2건

| # | 초판 | 실측 | 정정 |
|---|---|---|---|
| 1 | 「다건은 ⑧ 자산 검증을 **타지 않는다**」 | `isPropertyReady`가 `validateStep`을 **호출한다**(`multi-transfer-tax-validate.ts:191-198`) — 다만 결과가 **경고 Alert**일 뿐(`MultiTransferSteps.tsx:137`) | 원인 서술 교체 · Q-3으로 차단 승격 |
| 2 | 「세액 불변이라 **L2**」 | §1-4 probe — 합산 재로드가 A 슬롯에 B를 넣는다(100 → 999) | **L3** |

### 계획서에 없던 작업 2건 (구현 중 발견)

- **§5-2 입력 경로** — 소재지가 검색으로만 들어가 필수화가 «계산 차단»이 될 뻔했다
- **§5-3 컴패니언 승계** — 지분 카드에 칸이 없는데 차단되는 모순

### 뮤테이션 — 5종 전부 과녁 명중

| P-n | 무력화 | 빨개진 anchor |
|---|---|---|
| P-1 | 동·호 접미 제거 | K-2 · K-2b · K-6 |
| P-2 | `null` 폴백 제거(양도) | K-1 · K-4 |
| P-3 | 세대 게이트 제거 | G-2 |
| P-4 | 재계산 건너뛰기 | M-1 · M-4 |
| P-5 | 접근부 가드 `?? false` 제거 | N-1 |
| P-6 | `delete` 대신 빈 문자열 | M-4 |
| P-7 | 충돌 회피 접미 부여 | M-5 |
| **P-8** | **컴포넌트의 `onUnitsResolved` 배선 제거** | **E2E `UG-3`만** — vitest 8건은 전부 초록 |

🔑 **P-8이 E2E의 존재 이유를 증명했다.** vitest anchor는 `hasAddressUnits`를 **직접 세팅**해
leaf를 검증하므로, 컴포넌트가 그 값을 **실제로 폼에 남기는지**는 보지 못한다. 배선을 끊자
**8/8 초록 · UG-3만 빨강**이었다 ([[feedback_library_anchor_does_not_prove_component_uses_it]]).

🟡 **M-2·M-3은 구별력 0이다** — 7종 중 어느 것도 빨갛게 만들지 못했다. 이 함수는 record **하나**만
보므로 「다른 record를 지운다」를 지역 편집으로 만들 수 없다. ⇒ **검증된 가드가 아니라 «의도 문서»**다.
마이그레이션이 나중에 일괄 삭제·병합을 하게 되면 그때 안전망이 된다.
[[feedback_mutation_zero_discrimination_is_not_proof]]

### 회귀 수선 — **단언을 약화시키지 않고 픽스처를 실제와 맞췄다**

| 게이트 | 예측 | 실측 | 수선 |
|---|---|---|---|
| vitest | 29파일 / 71테스트 | **동일** | 픽스처 29파일 + 공용 헬퍼 `__tests__/fixtures/transfer-test-address.ts` |
| E2E 양도 | 35파일 / 58테스트 | **동일** | 시드 23파일(`makeDefaultAsset` 스프레드) + UI 12파일(`e2e/_helpers/fill-address.ts`) |
| E2E 다건 | 12 spec 추가(Q-3) | **4 spec** | 시드를 «실제 저장 record» 모양으로(팩토리 통과 · 총양도가액 · 세대주택수) |
| E2E 전건 | — | **+60파일**(다른 접두) | 시드 codemod — `commercial-*`·`mixed-use-*`·`general-building-*` 등 |

🔑 **다건 시드는 «팩토리를 통과»해야 한다.** 손으로 최소 필드만 적은 시드는 지분율 등
기본값이 없어 ⑧이 「공유 지분율을 입력하세요」로 막는다 — 실제 저장 record는 마법사 폼이라
그 값들이 다 있다. `{...makeDefaultAsset(1), …}`로 고쳤다.

⚠️ **`setupAddress`는 `/api/address/standard-price`를 mock하지 않는다.** 그 라우트는 세대 목록뿐
아니라 **건물 기준시가 조회**에도 쓰여서, 빈 결과로 막으면 `building-stdprice-*`·
`commercial-building-std-batch`가 조용히 깨진다. 초판 헬퍼가 그렇게 돼 있어 좁혔다.

⚠️ 다건 실측이 예측(12)보다 **적었다**(4) — 나머지 8은 차단 지점을 밟지 않는 spec이었다.
「영향 목록」은 **무엇이 깨지는가**로 뽑아야지 파일 수로 추정하면 안 된다
([[feedback_impact_list_from_what_breaks_not_what_changes]]).

🔴 **§7 E2E 모집단이 좁았다 — 실측 정정.** 착수 전 회귀 측정을 `transfer-*`·`multi-*` 글롭으로만
돌렸는데, **양도세 마법사를 쓰는 spec은 그 접두에 한정되지 않는다** — `commercial-*`·`mixed-use-*`
등이 같은 폼을 채운다. 전건 실행에서 그것들이 추가로 드러났다.
⇒ **차단을 추가할 때의 회귀 모집단은 「파일명 접두」가 아니라 「그 UI를 밟는 spec 전부」**다.
파일명으로 모집단을 좁히면 반드시 샌다 ([[feedback_closure_claim_scoped_to_verified_subset]]).

⚠️ **코드모드가 주석 안의 문자열을 먹었다** — `createDefaultTransferFormData()`가 산문에도 있어
`withTestAddress(...)`로 치환됐다. diff 전수 확인으로 1건 잡아 되돌렸다
([[feedback_global_replace_eats_own_comment]]).

---

## 11. 🟡 미결 (이 계획서 범위 밖)

- 취득세·재산세의 ⑤⑧ 소재지 필수화 (키·제목은 이 계획서가 함께 고친다)
- 도로명↔지번 거짓 분리 (§1-3)
- 다건 record replace로 편입된 자산의 staleness (PR #1644 잔여)

---
