# 계획서 — 결과 화면 「조정대상지역 판정 — 확인 필요」 고지를 함께 양도 컴패니언까지

> 2026-11-08 · 기준 master `a4c2ea0f9` · 선행: #2926(결과 화면 고지) · #2942 · #2946 · #2980(A-3) · 측정 `regulated-rights-transfer-toggle.plan.md` §14-1
> 상태: **구현(Do) 완료** — 2026-11-08 사용자 결정 Q-1 a · Q-2 a · Q-3 a · Q-4 a(권장안). §8 구현 기록. 미검증은 「확인 필요」로 표기.

## 0. 한 줄 요약

함께 양도 컴패니언(주택·재개발APT·분양권)은 **자기 소재지로** 조정대상지역을 판정해 ④가 엔진에 싣는다(`companionRegulatedFlags`).
그런데 결과 화면·PDF의 「조정대상지역 판정 — 확인 필요」 고지는 첫 자산(`form.assets[0]`)만 읽는다. 컴패니언의 low·medium 판정은 세액에 실리는데 가정이라는 사실이 어디에도 나오지 않는다.
고지 leaf를 컴패니언까지 넓히되, 컴패니언 행은 **어느 자산인지** 밝히고 **직접 선택 칸이 없다**는 점을 문구에 반영한다.

## 1. 실측 (2026-11-08 · 이 브랜치 · throwaway probe, 삭제함 — 결과 원본 `scratchpad/c4-probe.json`)

| # | 입력 (양도 2026-02-16, 취득 2018-03-02 — 표시 외 날짜는 칸에) | 결과 |
|---|---|---|
| P1 | 주 자산 `강원특별자치도 춘천시 테스트동 1` + 컴패니언 `경기도 남양주시 화도읍 1`(취득 2020-12-01) → 현행 `regulatedAddressAssumptions` | **주 자산 두 줄뿐**(`transfer/low/false` · `acquisition/low/false`) — 컴패니언 행 없음 |
| P2 | 화도읍 주택을 첫 자산으로 둔 폼(같은 leaf) | `acquisition/medium/true` 한 줄 — 컴패니언일 때 없어지는 줄이 이것이다 |
| P3 | `companionRegulatedFlags(화도읍)` | `isRegulatedArea:false` · `wasRegulatedAtAcquisition:true` — ④가 엔진에 싣는 값, 고지 없음 |
| P2b·P3b | 시·도 생략 `강남구 테헤란로 1` 컴패니언 | 첫 자산이면 `transfer/low/true` + `acquisition/low/true`, 컴패니언이면 ④가 true/true를 싣고 고지 없음 |
| P4 | 분양권, 양도 2020-06-01(§104①4호 구간) | `transfer/low/true`만(취득 줄 없음) |
| P4b | 분양권, 양도 2021-06-01(구간 밖) | 줄 없음 |
| P5 | 토지 | 줄 없음 |
| P9 | 재개발APT | 양도·취득 두 줄 |
| P6 | 폼 전역 `regionCode` 설정 + 주 자산 춘천 + 컴패니언 시·도 생략 | 현행 leaf는 **전체 `[]`**(`primary.regionCode || form.regionCode`에서 반환) — 컴패니언 ④ 판정은 `form.regionCode`를 읽지 않는다 |
| P7 | 컴패니언 자체 법정동코드 | `companionRegulatedFlags`가 true/true 반환(코드 판정) — 고지 대상 아님(high) |
| P8 | 컴패니언 소재지 없음 | `{}` — ⑭가 주 자산 값으로 대신. 정상 입력에서는 도달하지 않는다: ⑧이 모든 자산의 소재지를 막는다(`lib/calc/transfer-tax-validate-asset.ts:183-191`, 예외는 축 B — 주 자산에서 승계) |

## 2. 현행 코드 (이 브랜치 file:line)

- 고지 leaf `regulatedAddressAssumptions` — `lib/calc/effective-regulated-at-acquisition.ts:372`; 첫 자산만 읽음 `:373` (`form.assets?.[0]`), 판정은 `storedRegulatedJudgments(form)` `:244`(첫 자산 `:252`).
- ④ 컴패니언 판정 `companionRegulatedFlags` — 같은 파일 `:306`. 같은 leaf를 `{ isPrimary: false }`(증여 세대 사실 안 묻는 위치)로 부른다. 호출은 `lib/calc/transfer-tax-api-bundled.ts:104`이며 같은 물건 지분 분할(축 B, `isFullFractionalBundle` — `transfer-tax-api-asset-basics.ts:165`)이면 **싣지 않는다**(⑭가 주 자산 값).
- ⑭ 폴백 `c.isRegulatedArea ?? ctx.primaryEngineInput.isRegulatedArea` — `app/api/calc/transfer/bundled-split-helpers.ts:423-424`.
- 행 타입 `RegulatedAddressAssumption` — 같은 파일 `:348` 이하. **자산 식별 필드 없음**.
- 화면 `RegulatedAreaAssumptionLine` — `components/calc/results/transfer/RegulatedAreaAssumptionLine.tsx:44`: `key`·`data-testid`가 `r.which`(양도/취득 둘뿐)라 자산이 둘 이상이면 키가 겹친다. 배치 3곳: `TransferTaxResultView.tsx:191` · `BundledAllocationCard.tsx:217` · `MixedUseResultCard.tsx:111`(+ 다건 `MultiTransferTaxResultView.tsx:535`는 건마다 폼, 판정 메뉴 2곳).
- PDF `RegulatedAssumptionPdfNote` — `lib/pdf/ResultPdfTransferSections.tsx:571`: 같은 `key={r.which}`. 묶음은 `regulatedAssumptionPdfGroups`(`lib/calc/regulated-area-assumption-text.ts`)가 `{ label?, rows }`로 만든다 — 다건이 이미 `label`로 건을 구분한다.
- 자산 식별에 쓸 수 있는 필드: `AssetForm.assetLabel`(기본 「자산 N」 — `lib/stores/calc-wizard-asset-factory.ts:90`, 사용자가 고칠 수 있음).
- testid를 읽는 기존 테스트: `__tests__/calc/regulated-area-assumption-notice.ui.test.tsx` · `e2e/regulated-area-assumption-notice.spec.ts` — 첫 자산 행의 testid는 **바꾸지 않는다**.

## 3. 권장 설계 (Q-1~Q-4 a 기준)

### 3.1 leaf

- `regulatedAddressAssumptions(form)`을 **자산 단위 호출의 합**으로 읽는다: 첫 자산은 현행 그대로, 컴패니언(`form.assets.slice(1)`)은 `storedRegulatedJudgments({ assets:[asset], transferDate }, { isPrimary:false })` — `companionRegulatedFlags`와 **같은 호출**(별도 판정식 금지).
- 컴패니언 제외 조건은 ④와 같은 술어를 쓴다: 축 B(`isFullFractionalBundle`)이면 컴패니언 행을 만들지 않는다(④가 싣지 않기 때문 — 주 자산 값을 따른다). 판정하지 못한 축(소재지·날짜 없음)은 행 없음(④도 싣지 않는다).
- 행 타입에 `assetIndex: number`·`assetLabel: string` 추가(첫 자산 행도 채운다). 컴패니언 행은 `selectable: false` — 컴패니언에는 두 토글이 없다(`companionRegulatedFlags` 주석).
- 분양권·입주권·재개발APT·토지 게이트는 첫 자산과 같은 규칙(`regulatedAtTransferToggleApplies` · `isOneHouseExemptionAsset` · `isHousingLike`)을 **자산 단위로** 적용한다.
- 폼 전역 `regionCode`: 첫 자산 행만 막는다(현행 `:374`). 컴패니언 행은 컴패니언 자신의 `regionCode`만 본다(④와 같다 — P6).

### 3.2 화면·PDF

- 컴포넌트가 행을 자산별로 묶어 **카드를 자산마다 하나** 그린다 — 첫 자산 카드는 제목·testid 그대로, 컴패니언 카드는 제목 「조정대상지역 판정 — 확인 필요 · {assetLabel}」. 다건이 이미 쓰는 `label` 표기와 같은 방식이다.
- 끝 줄: 컴패니언 카드는 `selectable:false`뿐이라 기존 `regulatedAssumptionFooter`가 「직접 선택하세요」 없이 조회 안내만 낸다(`every(selectable === false)` — 이미 구현된 분기).
- testid: 첫 자산 `regulated-area-assumption-{which}` 유지, 컴패니언 `regulated-area-assumption-{which}-{assetIndex}`.
- PDF: `regulatedAssumptionPdfGroups`가 자산별 그룹(`label`=컴패니언 `assetLabel`)을 낸다. 키는 `{assetIndex}-{which}`.

### 3.3 14지점

엔진 input·result를 바꾸지 않는다(폼에서 읽는 표시 전용 — 선례 `SameDayOrderLine`). ①②③④⑬ 변경 없음, ⑫⑭ 해당 없음, ⑤⑥⑦(결과 카드)만 해당, ⑧ validate 변경 없음.

## 4. 케이스 매트릭스 (Do anchor)

| # | 입력 | 기대 |
|---|---|---|
| C-1 | 주 자산 high + 컴패니언 화도읍(medium) | 컴패니언 카드 `acquisition/medium/true` 한 줄 · 첫 자산 카드 없음 |
| C-2 | 주 자산 low + 컴패니언 low | 카드 둘, 컴패니언 제목에 `assetLabel` |
| C-3 | 컴패니언 자체 법정동코드 | 컴패니언 행 없음 |
| C-4 | 컴패니언 토지 | 행 없음 |
| C-5 | 컴패니언 분양권 4호 구간 / 구간 밖 | `transfer` 한 줄 / 없음 |
| C-6 | 컴패니언 재개발APT | 두 줄 |
| C-7 | 축 B(전 자산 지분) | 컴패니언 행 없음 |
| C-8 | 컴패니언 소재지 비어 있음 | 행 없음(④도 안 싣는다) |
| C-9 | `assetLabel` 사용자 수정 | 카드 제목에 수정값 |
| C-10 | 단건 · 첫 자산 행의 testid·제목 | 현행과 동일(기존 테스트 불변) |
| C-11 | PDF 그룹 | 자산마다 한 그룹, 빈 그룹 제외 |
| parity | C-1·C-2 | 행의 true/false가 `companionRegulatedFlags` 값과 같다(고지가 ④와 어긋나지 않음) |

## 5. 결정 레지스터 (Q)

| Q | 질문 | 선택지 | 권장 |
|---|---|---|---|
| Q-1 | 컴패니언 고지를 만들 것인가 | **a** 만든다 · b 만들지 않고 §14-1로 닫는다(현행 유지) | **a** — 컴패니언 가정이 세액에 실리는데 알릴 곳이 없다는 것이 P1·P3로 확인됐다. 단 법적 결함이 아니라 **표시 누락**이다 |
| Q-2 | 컴패니언 행 표기 | **a** 자산마다 카드를 따로(제목에 `assetLabel`) · b 한 카드 안에 「자산 N:」 접두 | **a** — 끝 줄(직접 선택 가능 여부)이 자산마다 달라 한 카드에 섞이면 문구가 거짓이 된다 |
| Q-3 | 컴패니언 끝 줄 | **a** 조회 안내만(직접 선택 칸이 없다) · b 「보유 상황」으로 안내 | **a** — 컴패니언 카드에는 두 토글이 없다. b는 존재하지 않는 칸을 가리킨다 |
| Q-4 | 컴패니언에 직접 선택 칸을 만들 것인가 | a 이번 범위 밖 · **b** 이후 별건 | **a** — 칸을 만들면 ①②④⑥⑧ 전부 건드린다(14지점). 고지부터 먼저 |

## 6. 미검증 레지스터 (V)

| V | 내용 |
|---|---|
| V-1 | 정상 UI에서 `form.regionCode`(폼 전역 코드)가 함께 양도 흐름에 설정되는가 — P6은 직접 구성한 폼. 설정되면 첫 자산 행은 막히고 컴패니언 행만 남는 비대칭이 생긴다 |
| V-2 | 컴패니언 입주권이 함께 양도에서 허용되는가(첫 자산 입주권은 행을 내되 `selectable:false` — 컴패니언 입주권의 ④ 판정 경로는 확인 필요) |
| V-3 | ~~컴패니언 소재지 없음(P8)이 ⑧에서 막히는가~~ — **확인됨**(`transfer-tax-validate-asset.ts:183-191`: 주소 둘 다 비면 차단, 축 B 컴패니언은 `mergePrimaryBasic`으로 승계). 법정동코드만 있고 주소 문자열이 없는 입력은 이 검사가 막으므로 코드 판정 컴패니언에도 주소는 있다 |
| V-4 | 다건(`MultiTransferTaxResultView`)의 건마다 폼이 컴패니언을 가질 수 있는가 — 가질 수 있으면 같은 leaf가 건 단위로 그대로 적용된다 |
| V-5 | 판정 메뉴 두 계산기(`OneHouseJudgmentCalculator`·`MultiHouseSurchargeCalculator`)가 자산 하나뿐인지 — 폼 타입 주석은 「전부 `assets[0]`에서 읽는다」(`lib/stores/one-house-judgment-form.types.ts:22`)지만 `assets`가 여러 개일 수 있는지는 확인 필요. 여러 개면 같은 변경이 닿는다 |

## 7. 작업 순서·시간 (Q 확정 후)

1. leaf 확장 + `assetIndex`·`assetLabel` + 단위 anchor C-1~C-9 → verify: 기존 `regulated-area-assumption-notice`·`regulated-rights-transfer-toggle` anchor 불변 (40분)
2. 컴포넌트·PDF 묶음 + UI 테스트 C-10·C-11 + 뮤테이션 (40분)
3. E2E 1건(함께 양도 · 컴패니언 시·도 생략 → 결과 화면 컴패니언 카드) (30분)
4. 회귀·tsc·lint·리뷰 게이트 (30분)

합계 약 2시간 20분.

## 8. 구현 기록 (2026-11-08)

| 변경 | 파일 |
|---|---|
| 고지 leaf가 컴패니언을 읽는다 — `companionStoredJudgments`(④ `companionRegulatedFlags`와 같은 호출 공유) · 축 B는 제외 · 폼 전역 코드는 첫 자산 행만 막음 · 행에 `assetIndex`·`assetLabel` · 컴패니언 행 `selectable:false` | `lib/calc/effective-regulated-at-acquisition.ts` |
| 행 testid(`regulatedAssumptionRowTestId`) · 자산별 묶음(`groupRowsByAsset`) · PDF 묶음이 자산마다 한 그룹 | `lib/calc/regulated-area-assumption-text.ts` |
| 자산마다 카드(컴패니언 제목 「… · {assetLabel}」, testid `…-line-{i}`·`…-{which}-{i}`) | `components/calc/results/transfer/RegulatedAreaAssumptionLine.tsx` |
| PDF 줄 키 `{assetIndex}-{which}` | `lib/pdf/ResultPdfTransferSections.tsx` |

검증:
- 신규 `__tests__/calc/regulated-area-assumption-companion.anchor.test.tsx` 15건(C-1~C-14 · parity). 뮤테이션 6/6 KILLED — 축 B 가드 · 컴패니언 `selectable` · 폼 전역 코드 차단 · 컴패니언 testid · 자산 묶음 · 분양권 구간 게이트(첫 실행에서 폼 전역 코드 변형이 살아남았다 — `[].every`가 빈 배열에서 참이라 단언이 비어 있었다 → 줄 키 전체 `toEqual`로 고정).
- 신규 E2E `e2e/regulated-area-assumption-companion.spec.ts` RAC-1(함께 양도 · 컴패니언 화도읍 → 요청 `wasRegulatedAtAcquisition:true` + 컴패니언 카드) · 컴패니언 순회 제거 변형으로 실패 확인. 기존 `regulated-area-assumption-notice`·`judgment-menu-regulated-address` 포함 7건 통과.
- 회귀: `__tests__/calc/` 819파일 11,520건 · `__tests__/lib`·`api`·`components`·`pdf` 1,486파일 16,518건 · tsc 0건 · 변경 파일 lint 0건.
- 미검증 V-1(폼 전역 `regionCode`가 함께 양도 흐름에 설정되는가) · V-2(컴패니언 입주권) · V-4(다건 건마다 컴패니언)는 그대로 — 코드는 세 경우 모두 컴패니언 행을 첫 자산과 독립으로 낸다. V-5: 판정 메뉴 두 계산기에는 자산 추가 UI가 없다(`app/calc/one-house-exemption`·`multi-house-surcharge`에서 `assets.push`·`addAsset` grep 0건).
- 브라우저 수동 확인은 E2E RAC-1로 갈음(Playwright 실제 화면·실제 API).

## 9. 미검증 V-1·V-2·V-4 측정 (2026-11-09 · 워크트리 `-m1` · throwaway probe, 삭제함 — 결과 원본 `scratchpad/m1-probe.json`)

변경 코드 없음. 측정 시료: 첫 자산 `서울특별시 강남구 테헤란로 1`(high) 또는 `강남구 테헤란로 1`(시·도 생략 · low), 양도일 2026-02-16, 취득일 2018-03-02.

| V | 결론 | 근거 |
|---|---|---|
| V-1 | **현행 UI에서 폼 전역 `form.regionCode`를 쓰는 경로를 찾지 못했다** — 읽는 곳만 있다 | `grep`: 쓰기는 자산 카드의 자산-수준 `regionCode`(`AssetSectionBasic.tsx:345-347`)뿐이고, 판정 메뉴 핸드오프는 `regionCode: undefined`로 비운다(`one-house-judgment-handoff.ts:156`). 폼 전역 값이 남을 수 있는 경로는 옛 저장 세션 복원뿐이다(**복원 경로 실측은 안 함 — 확인 필요**). 도달 시 동작은 측정: 코드 있음 → 첫 자산 줄 둘 사라지고 컴패니언 줄 둘(`1:transfer`·`1:acquisition`)만 남는다. ④의 컴패니언 값(`companionRegulatedFlags`)은 자기 자산만 읽어 폼 코드와 무관 → 고지와 ④가 일치(C-9·parity가 고정) |
| V-2 | **컴패니언 입주권은 함께 양도에서 허용되고(⑫ enum `transfer-tax-schema-companion.ts:107` · ⑭ `bundled-split-helpers.ts:216`), 고지는 주 자산 입주권과 똑같이 두 줄(양도·취득 당시)을 낸다 — 둘 다 `selectable:false`** | 컴패니언 입주권 `["1:transfer/low/true/sel=false","1:acquisition/low/true/sel=false"]` = 주 자산 입주권 `["0:…sel=false" ×2]`. `companionRegulatedFlags`는 `{isRegulatedArea:true, wasRegulatedAtAcquisition:true}`를 싣는다. 세액 영향은 앞선 측정(§11 `regulated-rights-transfer-toggle.plan.md`: 컴패니언 입주권 두 값 불변)을 그대로 따른다 — 이번에 다시 재지 않았다 |
| V-4 | **다건에서는 건마다 컴패니언이 있을 수 없다 → 컴패니언 고지는 다건에 도달하지 않는다** | ⑧ `validateMultiSupportedMode`가 `assets.length > 1`을 막는다(`multi-transfer-tax-validate.ts` · 문구 「한 건 내 다자산 일괄양도는 단건 계산기에서만 지원됩니다.」 — 프로브가 이 문구를 반환). ⑫도 `companionAssets`를 거부한다(`transfer-tax-schema-multi-refines.ts:96`) |

### 9-1. V-1 복원 경로 측정 (2026-11-09 · 워크트리 `-m2` · throwaway probe, 삭제함 — 결과 원본 `scratchpad/m2-probe.json`)

저장물에 최상위 `regionCode: "1168010100"`이 있을 때 복원 경로가 그 값을 남기는가:

| 경로 | 폼 전역 `regionCode` |
|---|---|
| 새 스키마 폼 `migratePersistedTransferForm` | 남음 |
| sessionStorage 복원 `mergePersistedWizard` | 남음 |
| 옛 스키마(`assets` 없음) `migratePersistedTransferForm` → `migrateLegacyForm` | 남음 |
| 단건 이력 재개 — **`resumeTransferRecord` 전체 실행으로 재측정(9-2)** | 남음 |
| 다건 `migrateMultiForm`의 건별 폼 | 남음 |

복원 뒤 고지(자산 2개 모두 시·도 생략 주소): 컴패니언 줄만 남는다(`["1:transfer","1:acquisition"]`) — §9 V-1 도달 시 동작과 같다.

**결론**: 복원 경로는 값을 지우지 않는다 — 저장물에 있으면 되살아난다. 그러나 **새로 저장되는 폼에는 생기지 않는다**: 이 저장소 이력에서 운영 코드가 폼 전역 `regionCode`를 쓴 흔적을 찾지 못했다(`git log -G` 두 패턴 — `updateFormData({…regionCode…})`는 테스트 `handoff-patch-keys-s11-7.anchor.test.ts`에서만, 자산 카드 쪽 `regionCode: v.pnu` 계열은 자산-수준). 도입 커밋 `2046d3f06`(2026-06-17)도 store·API 배선만 추가했다. 따라서 옛 저장물에 이 값이 들어 있을 가능성은 낮고, 있어도 영향은 «첫 자산은 코드로 판정, 고지는 컴패니언만»이며 ④와 일치한다. **검색한 패턴 밖의 쓰기 경로는 배제하지 못했다**(`-G` 두 패턴에 한정).

### 9-2. `resumeTransferRecord` 전체 실행 측정 (2026-11-09 · 워크트리 `-m3` · throwaway probe, 삭제함 — 결과 원본 `scratchpad/m3-probe.json`)

jsdom에서 `resumeTransferRecord(record, router)`를 그대로 호출(스토어는 실물, 라우터만 `push` 기록). 시료: 자산 2개(둘 다 `강남구 테헤란로 1`) + 최상위 `regionCode "1168010100"`.

| 시료 | 결과 |
|---|---|
| 단건 record, 직전 세션에 다른 코드 `9999999999`가 있던 스토어 | 반환 `null` · 재개 후 `form.regionCode = "1168010100"`(record 값) · 고지 줄 `["1:transfer","1:acquisition"]` · `push("/calc/transfer-tax")` |
| 단건 record에 `regionCode` 없음 + 직전 세션 `9999999999` | 재개 후 `regionCode` 없음(`reset()`이 직전 값을 지움 — 새지 않는다) |
| 다건 record(`properties[0].form.regionCode`) | 반환 `null` · 재개 후 `properties[0].form.regionCode = "1168010100"` · `push("/calc/transfer-tax/multi")` |

**결론**: 9-1의 «이력 재개는 남음»이 함수 전체 실행으로 확인됐다 — record에 있으면 그 값이, 없으면 비어 있다(직전 세션 값은 새지 않는다). 쓰기 경로 검색이 두 패턴에 한정된다는 9-1의 한계는 그대로다.

미해결로 남는 것: ① ~~V-1 옛 세션 복원 경로~~ → 9-1·9-2로 측정(복원은 되살림 · 쓰기 경로는 패턴 한정으로 못 찾음) ② V-2 컴패니언 입주권 고지 줄의 «세액 영향 없음» → `regulated-rights-transfer-toggle.plan.md` §16으로 재측정(양도일 값은 대조군이 움직이는 시료에서 불변 확인 · **취득 당시 값은 §16-1로 재측정 — 대조군이 움직이는 시료에서 불변, 단 입주권이 비과세 판정에 진입하지 않은 시료라 «진입 시에도 안 읽는다»는 확인 필요**)
