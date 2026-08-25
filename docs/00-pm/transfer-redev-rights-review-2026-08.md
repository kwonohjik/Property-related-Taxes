# 양도소득세 코드 리뷰 — 재개발·재건축 APT / 조합원입주권 / 분양권

- **대상 브랜치**: `review-transfer-redev-rights` (worktree `/Users/mynote/workspace/PRT-review-transfer-redev-rights`, base `origin/master` 99a63940)
- **일자**: 2026-08-25
- **범위**: 소득세법 시행령 §166 축 세 자산(`redevelopment_apt` · `right_to_move_in` · `presale_right`)의 엔진 · UI · 14개 동기화 지점 · 법령 인용 · 테스트 안전망 전 계층

## 1. 요약

| | |
|---|---|
| 발굴 | 61건 |
| 적대적 검증 통과 | 55건 |
| **반증(기각)** | **5건** |
| 커버리지 비평 추가 | 5건 |
| 중복 병합 | 7건 |
| **고유 확정 결함** | **53건** (🔴 critical 7 · 🟠 high 16 · 🟡 medium 22 · ⚪ low 8) |
| 검증 미완 | 1건 (검증 에이전트 API 오류) |

리뷰는 10개 차원을 병렬로 돌린 뒤 **각 발견 항목마다 반증 전담 검증자**를 붙이는 방식으로 진행했다. 검증자에게는 「확신이 없으면 기각」을 기본값으로 주었고, 관점을 세 가지(법령 본문 / 재현 가능성 / 설계 의도·sibling 경로)로 돌려 배정했다. 그 결과 발굴 61건 중 5건이 기각됐다 — 기각 사유는 §6에 남긴다.

세액 영향이 적힌 항목은 대부분 **throwaway 프로브를 실행해 실측한 값**이다. 실측하지 못한 항목은 「미검증」으로 명시돼 있다. 안전망 공백 주장(T1 계열)은 해당 코드를 실제로 망가뜨린 뒤 테스트를 돌려 반응 건수를 세는 mutation probe로 확인했다.

## 2. 이 리뷰가 드러낸 구조

53건은 흩어진 개별 버그가 아니라 **네 개의 구조적 원인**으로 수렴한다.

### (가) §166 재개발 분기가 메인 파이프라인을 조기 이탈한다

`transfer-tax.ts` STEP 0.65가 `calculateRedevelopmentTax`로 조기 반환하면서, 그 뒤에 있어야 할 단계들이 통째로 건너뛰어진다. 그런데 재개발 분기는 그중 일부만 자체 구현했다. 결과가 critical/high 4건이다.

| 건너뛴 것 | 결과 | 항목 |
|---|---|---|
| §89①3호가목 1세대1주택 비과세 | 12억 **이하** 완공 신축APT가 전액 과세 (12억+1원에서는 0원이 되는 불연속) | `E3-01` |
| 조특법 감면 (`input.reductions`) | `reductionAmount: 0` 하드코딩 — UI·④·⑫를 다 통과한 감면이 엔진 안에서 침묵 소실 | `E3-02` |
| `carryoverTaxationDetail` | 이월과세 A/B 비교 카드 미표시 + 다건 §97의2②3호 비교에서 자산이 조용히 제외 | `E3-06` |
| §95② 본문 괄호의 **미등기양도자산** 배제 | 미등기인데 장기보유특별공제가 그대로 차감 | `E2-04` |

### (나) 자산 종류 축 일원화(#1245)가 남긴 뒷정리

축을 `redevSubject` 라디오에서 `assetKind`로 옮기면서, 옛 축을 전제로 짜인 게이트들이 비켜갔다.

- `SINGLE_ONLY` 차단 목록에 `redevelopment_apt`만 있고 `right_to_move_in`이 없다 → **함께양도 컴패니언이 입주권이면 §166 입력 전부가 계산에 도달하지 않는다**(`P2-01`). 응답 JSON이 「§166 필드를 하나도 넣지 않은 순수 주택」과 **바이트 단위로 동일**함을 실측했다.
- 다건(연간합산) 경로는 같은 이유로 2026-08-23에 이미 입주권을 차단했다 — 함께양도 경로만 빠졌다.

### (다) 컴패니언·다건 경로의 축 접힘(fold)

`toEngineAssetKind()`가 `right_to_move_in`·`presale_right`를 `"housing"`으로 접는다. 컴패니언 Zod enum(`["housing","land","building"]`)에 애초에 칸이 없어 구조적으로 결여돼 있다. 그 결과 분양권이 자산 2번 이후에 오면 **60% 단일세율·장기보유특별공제 배제·개산공제 1%가 전부 사라지고 일반 주택으로 계산된다**(`S1-02`, 실측 111,485,000원 과소).

### (라) 양도일(시행일) 축의 부재

분양권·단기 세율 결정식이 `input.transferDate`를 한 번도 읽지 않는다(`S1-01`). 같은 저장소가 §104⑦ 가산율은 이미 양도일 축을 걸어 두었고 누진표도 `loadFallbackTransferRates(targetDate)`를 타는데, 단기·분양권 세율만 축이 없다. 수정신고·경정청구 화면과 다건 `taxYear`(min 2000)가 과거 양도일을 정면으로 지원하므로 도달 가능하다.

## 3. 착수 권고 순서

세액 방향과 파급을 함께 본 순서다. **법령 정확성이 유일한 기준**이며, 과대·과소 어느 방향이든 같은 무게로 다룬다.

| 순서 | 항목 | 근거 |
|---|---|---|
| 1 | `P2-01` `S1-02` | 침묵 소실 — 사용자가 입력한 값이 계산에 **한 필드도** 도달하지 않는다. 화면에는 그대로 보인다. |
| 2 | `E3-01` | 12억 이하 1세대1주택 완공APT 전액 과세. 12억 경계에서 1원 차이로 6천만원대 세액이 사라지는 불연속. |
| 3 | `E2-01` | 승계조합원 + 매매 취득 시 취득가액 입력 칸이 어디에도 없어 0으로 계산(실측 315,000,000원 과대). 두 안내 카드가 서로를 가리키는 순환. |
| 4 | `E1-01` `E1-03` `E2-05`(병합) | 취득가액 산정 방식(실가/환산) 토글이 §166 적용 항(①↔②)을 바꾼다. 음수 인가후차익 clamp가 자산 종류에 따라 갈린다. |
| 5 | `S1-01` `C1-02` | 분양권 세율의 시행일 축 부재 + 조합원입주권에 분양권 전용 2021-01-01 기산일 오적용. |
| 6 | `C1-01` `E3-03` `C1-03` `L1-03` | §89② 배제 미구현 · §89①4호 요건 무검증 — 비과세 판정 축 전반. |
| 7 | 나머지 high · medium | |

> ⚠️ 4번 그룹은 서로 얽혀 있다(`E1-01`이 §166①↔② 라우팅, `E1-03`이 clamp 비대칭). 따로 고치면 한쪽이 다른 쪽을 가릴 수 있으니 **함께 착수**할 것.

> ⚠️ `E3-06`의 `isPartialExempt`·`exemptReason` 누락은 `E3-01`(비과세 자체 부재)이 먼저 해소돼야 의미가 생긴다.


## 4. 전체 목록

| 심각도 | ID | 항목 | 위치 |
|---|---|---|---|
| 🔴 critical | `E1-01` | 토지 출자 + 완공APT 양도 + 환산취득가 조합이 §166①1호(입주권) 산식으로 오라우팅 — §166②1호 안분·§166⑤2호 LTHD 전무 | `lib/tax-engine/redevelopment.ts:181` |
| 🔴 critical | `E2-01` | 승계조합원 완공APT + 매매 취득 — 취득가액 입력 경로가 어디에도 없고 검증도 없어 취득가액 0으로 계산된다 | `lib/tax-engine/redevelopment-successor.ts:60` |
| 🔴 critical | `E3-01` | §166 재개발 분기(subject="apt")에 §89①3호가목 1세대1주택 비과세가 전혀 없다 — 12억 이하 완공 신축APT가 전액 과세된다 | `lib/tax-engine/transfer-tax-redevelopment.ts:120` |
| 🔴 critical | `E3-06` | 재개발 분기 결과에 `carryoverTaxationDetail`이 실리지 않아 이월과세 A/B 판정이 화면·다건 집계에서 사라진다 | `lib/tax-engine/transfer-tax-redevelopment.ts:315` |
| 🔴 critical | `P2-01` | 함께양도 컴패니언이 조합원입주권이면 §166 입력 전부가 침묵 소실 — 축 일원화(#1245)가 SINGLE_ONLY 차단을 무력화 | `lib/calc/transfer-tax-validate.ts:131` |
| 🔴 critical | `S1-01` | 분양권 세율에 양도일(시행일) 축이 전혀 없다 — 2021-06-01 개정 前 양도에 현행 60%/70%를 적용해 과대과세 | `lib/tax-engine/transfer-tax-rate-calc.ts:428` |
| 🔴 critical | `S1-02` | 함께양도 컴패니언 자산의 분양권·입주권이 ④에서 `housing`으로 접혀 엔진에 도달 — 60% 세율·§95② 장특 배제·§163⑥4호 1%가 모두 소실 | `lib/calc/transfer-tax-api-helpers.ts:127` |
| 🟠 high | `C1-01` | 소득세법 §89② (주택 + 조합원입주권·분양권 보유 세대의 주택 양도 → §89①3호 배제)가 엔진에 전혀 없다 — 1세대1주택 비과세가 그대로 적용된다 | `lib/tax-engine/transfer-tax-exemption.ts:613` |
| 🟠 high | `C1-02` | 세대 보유 「조합원입주권」에 분양권 전용 2021-01-01 기산일이 적용돼 §104⑦ 주택 수에서 조용히 빠진다 (실측 Δ 109,725,000) | `lib/tax-engine/multi-house-surcharge-count.ts:309` |
| 🟠 high | `E1-02` | §166①1호·①2호나목 「§97①2·3호 **또는** §163⑥」 택일 위반 — 환산 모드에서 개산공제와 인가전 필요경비를 이중 차감 | `lib/tax-engine/redevelopment-split.ts:202` |
| 🟠 high | `E1-03` | §166②1호 인가후양도차익이 음수일 때 0으로 clamp — 인가전 이익과 상계되지 않아 양도차익 과대 | `lib/tax-engine/redevelopment-settlement.ts:82` |
| 🟠 high | `E1-04` | ⑧ validate 통과 ↔ ⑫ Zod 400 dead-end — Zod refine이 `settlementDirection === "receive"` 조건을 빠뜨려 「주택 출자 + 입주권 + 청산금 납부 + 환산」이 계산 불가 | `lib/api/transfer-tax-schema-refines.ts:264` |
| 🟠 high | `E1-08` | 승계조합원 분기가 `isOneHouseSingle`을 무시해 §95② 표2 진입 불가 — 같은 입력으로 §95③ 12억 안분은 1세대1주택으로 발동 | `lib/tax-engine/redevelopment-successor.ts:73` |
| 🟠 high | `E2-03` | 단독주택 출자 입주권 환산 경로가 1세대1주택·거주기간을 하드코딩 false/0으로 버려 실가 경로와 LTHD가 갈린다 | `lib/tax-engine/redevelopment-housing-contribution.ts:216` |
| 🟠 high | `E2-04` | 재개발 경로가 미등기양도자산에도 장기보유특별공제를 그대로 차감한다 (§95② 괄호 누락) | `lib/tax-engine/transfer-tax-redevelopment.ts:185` |
| 🟠 high | `E3-02` | §166 재개발·입주권 분기가 조특법 감면(input.reductions)을 통째로 버린다 — `reductionAmount: 0` 하드코딩 | `lib/tax-engine/transfer-tax-redevelopment.ts:352` |
| 🟠 high | `E3-03` | 조합원입주권(subject="right")의 12억 안분이 §89①4호 요건을 하나도 검증하지 않고 「세대 주택수 1」만으로 발동한다 | `lib/tax-engine/transfer-tax-redevelopment.ts:95` |
| 🟠 high | `L1-03` | §89①4호 가목의 「또는 분양권」 요건이 비과세 게이트에서 통째로 누락 — 분양권 보유 세대도 전액 비과세(실측 0원) | `lib/tax-engine/transfer-tax-redevelopment-transforms.ts:310` |
| 🟠 high | `P1-02` | 다건(연간합산) 경로가 세대 보유 분양권·입주권 목록(presaleRights)을 ⑬·⑭ 양쪽에서 나르지 않아 중과 주택수가 조용히 줄어든다 | `lib/calc/multi-transfer-tax-api.ts:216` |
| 🟠 high | `U1-01` | ③-c 「비과세 보유 요건」 카드는 청산금 수령에서만 열리는데, `exemptionEligibleAtApproval`은 방향과 무관하게 송신돼 납부 방향에서 LTHD를 표1로 강등한다 (재개발APT는 그 값을 지울 입력 경로가 전무) | `components/calc/transfer/RedevelopmentBlock.tsx:210` |
| 🟠 high | `U1-02` | 승계조합원 전용 「인가후 필요경비」가 원조합원으로 되돌린 뒤에도 payload에 남아 양도차익을 조용히 깎는다 (해제 경로 없음·마이그레이션 미정리) | `components/calc/transfer/RedevelopmentBlockCards.tsx:307` |
| 🟠 high | `U2-03` | 승계조합원 입주권(및 §166 재개발 경로)의 취득가액에 공유 지분율이 적용되지 않아, 양도가액만 지분 안분되고 취득가액은 100% 그대로 나간다 | `lib/calc/transfer-tax-api.ts:348` |
| 🟠 high | `U2-05` | 세대 보유 주택이 1채면 「분양권·입주권」 목록 입력 UI 자체가 렌더되지 않아 §104⑦2호(+20%p)·4호(+30%p) 판정이 영영 발화하지 않는다 | `app/calc/transfer-tax/steps/Step4.tsx:638` |
| 🟡 medium | `C1-03` | 소득세법 §89①4호 「나」목(1조합원입주권 + 1주택, 그 주택 취득일부터 3년 이내 입주권 양도) 비과세 경로가 전무 — 요건 충족 사안이 전액 과세된다 | `lib/tax-engine/transfer-tax-redevelopment-transforms.ts:311` |
| 🟡 medium | `C1-04` | 사이드바 ⑥ — §166 환산 모드에서 「계산 후 표시」로 안내한 취득가액·필요경비가 계산 후에도 «-»로 남는다 | `lib/stores/transfer-per-asset-summary.ts:469` |
| 🟡 medium | `C1-05` | 사이드바 ⑥ — receiveOnly(청산금 수령분 단독신고)에서 신고단위 양도가액이 아니라 신축APT 총 양도가액이 표시된다 | `lib/stores/transfer-per-asset-summary.ts:422` |
| 🟡 medium | `E1-05` | 완공APT + 청산금 수령 분기에서 인가전 분 필요경비만 안분되지 않아 신고서 행이 자기모순 | `lib/tax-engine/redevelopment.ts:583` |
| 🟡 medium | `E1-06` | §166②1호 인가후 필요경비가 두 표시 분기에 각각 전액 부착 — 신고서 필요경비 열 2배 + 행 자기모순 | `lib/tax-engine/redevelopment.ts:628` |
| 🟡 medium | `E1-07` | 환산 모드인데 §166③ 분모(D) 미입력이면 취득가액 0으로 침묵 fallback — ⑫ Zod에 대응 refine 부재 | `lib/tax-engine/redevelopment-split.ts:152` |
| 🟡 medium | `E2-07` | Zod refine(⑩)이 청산금 방향 조건 없이 §164⑤ PHD 2필드를 요구해 housing+입주권+납부+환산 조합이 400으로 막힌다 (⑧ validate는 통과·⑤ UI는 칸을 렌더하지 않음) | `lib/api/transfer-tax-schema-refines.ts:262` |
| 🟡 medium | `E3-05` | 비과세 마스킹 3곳이 `lthdHoldingPart`/`lthdResidencePart`를 함께 갱신하지 않아 신고서 서식의 「장특공제 = 보유분 + 거주분」이 깨진다 | `lib/tax-engine/transfer-tax-redevelopment-transforms.ts:230` |
| 🟡 medium | `L1-01` | 소득세법에 존재하지 않는 「§95② 별표2 [비고] 1호」를 30여 곳에서 인용 — 결과 배지·신고서·상세명세서에 그대로 노출 | `lib/tax-engine/legal-codes/transfer-house.ts:251` |
| 🟡 medium | `L1-02` | §89①4호의 12억 단서를 「가목 단서」로 인용 — 실제로는 「각 목 외의 부분 단서」이고 가목에는 단서가 없다 | `lib/tax-engine/transfer-tax-redevelopment.ts:214` |
| 🟡 medium | `L1-04` | §166③ 환산 산식(권리가액 × 취득당시PHD/인가당시PHD)을 §164⑤로 인용 — §164⑤에는 그 산식도, 인용부호로 적은 「양도 당시 기준시가」 문언도 없다 | `lib/tax-engine/types/transfer-redevelopment.types.ts:141` |
| 🟡 medium | `L1-06` | 결과 카드가 조합원입주권을 「§94①2호 기타자산」이라 표시 — §94①2호는 「부동산에 관한 권리」이고 기타자산은 §94①4호 | `components/calc/results/transfer/RedevelopmentDetailCard.tsx:195` |
| 🟡 medium | `P2-04` | isRedevPhdSectionActive에 「토지 출자」 배제 게이트 누락 — 출자자산을 토지로 바꿔도 §164⑦ 건물기준시가 계산서가 결과탭·이력·PDF에 남는다 | `lib/calc/redev-phd-trigger.ts:95` |
| 🟡 medium | `P2-06` | 출자자산을 토지→주택으로 되돌리면 §166③ 단가가 §164⑦ 부분입력 차단을 켜는데, 실가 모드 화면에는 해제할 입력칸이 없다 | `lib/calc/transfer-tax-validate-redev.ts:290` |
| 🟡 medium | `P2-07` | 입주권 stale 정규화가 재수화(migrate)와 세션 내 전환(patch) 사이에서 2필드 불일치 — anchor는 migrate 경로만 고정 | `components/calc/transfer/asset-sections/AssetAreaRedevelopment.tsx:55` |
| 🟡 medium | `T1-01` | §89①4호 가목 1세대1입주권 비과세 — 세대 구성 요건(입주권 1개·주택 0개) 게이트가 전건 미검증 (뮤테이션 0/7032, 실측 259,611,000 → 0) | `lib/tax-engine/transfer-tax-redevelopment-transforms.ts:311` |
| 🟡 medium | `T1-02` | Zod redevelopment 스키마가 안전망 0 — 필드를 지워도 7032건 전부 통과, 실측 세액 57,995,960 → 123,486,000 (침묵 strip) | `lib/api/transfer-tax-redevelopment-schema.ts:57` |
| 🟡 medium | `T1-04` | §166④1호 청산금 수령 비과세 게이트 — 5조건 중 3개(권리가액 12억·비교대상 축·receiveOnlyMode)가 미검증 (실측 Δ 21,847,466) | `lib/tax-engine/transfer-tax-redevelopment-transforms.ts:209` |
| 🟡 medium | `T1-05` | apt+receive 인가후 양도차손 0 clamp가 전건 미검증 — 뮤테이션 0/7032, 실측 Δ 20,900,000 | `lib/tax-engine/redevelopment-split.ts:375` |
| 🟡 medium | `T1-06` | §166①2호 나목 인가전 필요경비 차감을 지키는 테스트가 전 스위트에 1건뿐이고, 그 1건은 세액이 아니라 표시 자기일관성만 본다 (fixture 42/43이 값 0) | `lib/tax-engine/redevelopment-split.ts:202` |
| 🟡 medium | `U2-04` | 승계 입주권을 추계(환산·감정·매매사례) 모드로 바꿔도 ⑥ 사이드바는 실가 2칸 합계를 「취득가액」으로 계속 표시한다 (엔진은 0을 받아 추계한다) | `lib/stores/transfer-per-asset-summary.ts:145` |
| 🟡 medium | `U2-06` | 상속·증여로 승계취득한 조합원입주권은 ⑧이 「실지거래가액」 입력을 필수로 요구하지만 그 값은 §163⑨ 상속·증여 평가액에 덮여 엔진에 도달하지 않는다 | `lib/calc/transfer-tax-validate-successor-right.ts:74` |
| ⚪ low | `E3-07` | 파일 헤더 주석이 「STEP 7.5·9·10 농특세…transfer-tax-finalize.ts 재사용」이라고 하나 finalize를 호출하지 않고 농특세를 계산하지도 않는다 | `lib/tax-engine/transfer-tax-redevelopment.ts:12` |
| ⚪ low | `L1-05` | 삭제된 조항 「시행령 §155⑰」을 재개발 거주기간 통산 근거로 4곳에서 인용 — 엔진 측은 같은 규칙을 §154⑧로 인용 | `lib/stores/calc-wizard-asset-redev.ts:154` |
| ⚪ low | `L1-07` | 존재하지 않는 호 「§94①2호의2」를 입주권 근거로 기재 | `lib/tax-engine/redevelopment-split.ts:489` |
| ⚪ low | `L1-09` | 재개발 축이 전적으로 의존하는 §95② 두 문언을 verify:legal 키워드가 전혀 감시하지 않고, 커버리지 게이트는 조 단위라 항·호 오기를 통과시킨다 | `lib/legal-verification/verifier-manifest.ts:39` |
| ⚪ low | `P1-03` | acquisitionRounding — ⑫ Zod·엔진 타입에 있으나 ⑬가 만들지 않고 엔진 본문도 값을 읽지 않는 사문(死文) 필드 | `lib/tax-engine/redevelopment-valuation.ts:93` |
| ⚪ low | `P2-05` | 입주권 원조합원 차단 메시지가 입주권 화면에 존재하지 않는 「승계조합원 모드」 토글을 가리킨다 | `lib/calc/transfer-tax-validate-redev.ts:157` |
| ⚪ low | `S1-04` | 분양권을 §94①2호「나」목으로 인용 — 나목은 지상권이고 분양권은 「가」목이다 | `lib/tax-engine/transfer-tax-surcharge-predicate.ts:62` |
| ⚪ low | `U1-03` | 프로덕션 유일 호출부가 `transferPrice`·`wasRegulatedAtAcquisition` 두 prop을 넘기지 않아 입주권 비과세 카드의 「12억 초과 안내」와 「거주요건 미충족 경고」가 도달 불가 — anchor는 그 prop을 넘겨서 못 잡는다 | `components/calc/transfer/asset-sections/AssetSectionAcquisition.tsx:328` |

## 5. 상세

### 5.1 🔴 critical (7건)

#### `E1-01` 토지 출자 + 완공APT 양도 + 환산취득가 조합이 §166①1호(입주권) 산식으로 오라우팅 — §166②1호 안분·§166⑤2호 LTHD 전무

| | |
|---|---|
| 위치 | `lib/tax-engine/redevelopment.ts:181` |
| 조문 | 소득세법 시행령 §166②1호 · §166⑤2호 가목·나목 (본문 확인 — mst 286211) |
| 유형 | engine-formula |

`runRedevelopment`의 토지 출자 환산 분기(:181~186)가 `originalAssetType === "land" && useEstimatedAcquisition === true`만 보고 `subject`를 검사하지 않는다. 바로 위 주석(:178 「사례 37 — 토지 출자 **입주권** + 환산취득가 분기」)은 입주권 전용임을 명시하는데 조건에 그 축이 빠져 있다. 그 결과 자산 종류가 `redevelopment_apt`(완공 신축주택 양도, subject="apt")여도 환산 모드이기만 하면 `runLandContribEstimated`가 잡아, §166①1호(입주권) 구조 — 인가전 분(취득일~인가일 LTHD) + 인가후 분(LTHD 0) — 로 계산된다. 실가 모드(사례 40)에서 동일 사실관계는 `runOriginalMember`→`computeAptPay`로 §166②1호 안분 + §166⑤2호 LTHD를 받는다. 즉 **취득가액 산정 방식(실가/환산) 토글 하나가 §166 적용 항(①↔②)을 바꾼다**. 총 양도차익은 우연히 같지만 LTHD가 통째로 사라져 세액이 크게 과대해진다.

**실패 시나리오** — 자산 종류 「재개발APT」 · 출자 자산 「토지」 · 청산금 「납부」 300,000,000 · 취득가액 산정 「환산취득가」 · 취득 2007-04-09 · 인가 2013-10-23 · 양도 2023-02-16 · 양도가 1,500,000,000 · 권리가액 650,000,000 · 취득시 공시지가 200,000,000 / 인가시 500,000,000 (⑧ validate 통과 실측). 엔진 출력: 총 양도차익 934,000,000 · LTHD **46,080,000**(인가전 분 12%만) · 산출세액 **335,936,400** · 세액합계 369,530,040. 동일 사실을 §166②1호 경로(실가, 인가전 취득가 266,000,000 = 환산 260,000,000 + 개산공제 6,000,000로 인가전 차익 384,000,000 동일)로 태우면 LTHD 259,357,893(기존건물분 30% 190개월 + 청산금분 18% 111개월) · 산출세액 246,359,684 · 세액합계 270,995,652.

**세액 영향** — 산출세액 335,936,400 vs 246,359,684 = **89,576,716원 과대**, 세액합계 369,530,040 vs 270,995,652 = 98,534,388원 과대 (프로브 실측, mock 세율)

**수정 방향** — (a) 최소 조치 — 분기 조건에 `input.redevelopment.subject === "right"`를 추가해 주석과 구현을 일치시키고, 동시에 `validateRedevelopmentAsset` land 분기(:87 인접)와 Zod refine에 `land + apt + 환산` 차단을 넣어 dead-end(취득가액 0 침묵 계산, E1-07)로 떨어지지 않게 한다. (b) 정공법 — `calcRedevLandContribEstimated`가 산출한 §166③ 환산취득가·개산공제를 `computeRedevelopmentSplit`의 `oldAcquisitionPrice`·`estimatedLumpDeduction`으로 주입해 subject="apt"면 `computeAptPay`(§166②1호) + `computeAptLthd`(§166⑤2호)를 그대로 타게 한다. 어느 쪽이든 「환산이면 land, 실가면 apt」로 갈리는 현행 축을 없애는 것이 요점.

#### `E2-01` 승계조합원 완공APT + 매매 취득 — 취득가액 입력 경로가 어디에도 없고 검증도 없어 취득가액 0으로 계산된다

| | |
|---|---|
| 위치 | `lib/tax-engine/redevelopment-successor.ts:60` |
| 조문 | 소득세법 §97①1호 가목 / 소득세법 시행령 §162①4호 |
| 유형 | ui-gate |

`runSuccessorMember`는 취득가액을 `input.actualAcquisitionPrice ?? redevelopment.rightsValue`로 잡는데, 승계조합원 모드에서는 두 소스가 모두 0이 될 수 있다. `RedevelopmentBlockCards.tsx:304`의 토글 핸들러가 `redevRightsValue: ""`를 강제로 비우고, `RedevelopmentBlock.tsx:374`가 §166 ⑤ 「인가전 분 종전 부동산 취득가액」 섹션 전체를 승계 모드에서 숨기며, 그 자리를 대신한다고 안내하는 「상단 자산 카드 취득가액」(`fixedAcquisitionPrice`)은 `CompanionAcqPurchaseBlock.tsx:431-433`이 `assetKind === "redevelopment_apt"`이면 통째로 렌더하지 않는다. 두 안내 카드가 서로를 가리키는 순환이다. 취득원인 gift(=`CompanionAcqGiftBlock`)·inheritance(=STEP 0.45 `inheritedAcquisition` override)는 각각 다른 입력 경로가 살아 있으나, **purchase(매매)** 는 어느 경로도 없다 — 그런데 `transfer-tax-validate-redev.ts:183`은 매매를 정식 허용 취득원인으로 열어 두고 `:214`의 실가 취득가액 필수 검증은 `&& !isSuccessor`로 승계를 제외한다. `?? `는 nullish 연산자라 0에서는 fallback도 걸리지 않는다.

**실패 시나리오** — 관리처분 인가(2016-02-20) 후 입주권을 **매매**로 승계취득(2020-04-15) → 신축APT 준공(2022-12-02) → 2023-02-16에 920,000,000원 양도. 화면에서 취득가액을 입력할 칸이 없으므로 `fixedAcquisitionPrice`는 빈 문자열로 남고 payload `acquisitionPrice = 0`이 전송된다. 두 validate 모두 통과(probe9 실측: `validateRedevelopmentAsset` → null, `validateAssetAcquisition` → null)하여 경고 한 줄 없이 양도차익이 양도가액 전액으로 계산된다.

**세액 영향** — 실측(probe6-B, mock 세율): acquisitionPrice=450,000,000 → 양도차익 470,000,000 · 산출세액 327,250,000 / acquisitionPrice=0 → 양도차익 920,000,000 · 산출세액 **642,250,000**. 산출세액 315,000,000원 과대.

**수정 방향** — 승계조합원 완공APT에도 취득가액 입력 칸을 열거나(`CompanionAcqPurchaseBlock`의 redevelopment_apt 게이트에 `redevIsSuccessorMember !== "yes"` 조건 추가), 최소한 `validateRedevelopmentAsset`의 승계 분기에서 `fixedAcquisitionPrice > 0`을 요구할 것. 다만 「차단은 dead-end」 원칙상 입력 경로를 여는 쪽이 정본이다. 아울러 `input.actualAcquisitionPrice ?? redevelopment.rightsValue`는 `?? `가 0을 통과시키므로 fallback으로 기능하지 못한다.

#### `E3-01` §166 재개발 분기(subject="apt")에 §89①3호가목 1세대1주택 비과세가 전혀 없다 — 12억 이하 완공 신축APT가 전액 과세된다

| | |
|---|---|
| 위치 | `lib/tax-engine/transfer-tax-redevelopment.ts:120` |
| 조문 | 소득세법 §89①3호가목 · §95③ / 소득세법 시행령 §154①·§154⑧1호 · §160 · §166 |
| 유형 | engine-formula |

`transfer-tax.ts` STEP 0.65가 `calculateRedevelopmentTax`로 조기 반환하면서 STEP 1의 `checkExemption`을 건너뛴다. 그런데 재개발 분기는 §95③ **12억 초과 안분(`applyHighValueAllocation`)만** 구현하고, 그 전제인 §89①3호가목 **비과세 자체(12억 이하 전액)** 는 subject="apt" 경로에 아예 없다. 결과적으로 1세대1주택 요건을 충족하는 재개발 완공 신축APT가 양도가액 12억 이하이면 **전액 과세**되고, 12억을 1원 넘기면 taxableRatio≈0이 되어 세액이 0으로 떨어지는 불연속이 발생한다. `applyOneRightExemption`이 subject="right"에는 전액 비과세를 구현해 둔 것과 정반대의 비대칭이다.

**실패 시나리오** — 1세대1주택(isOneHousehold=true, householdHousingCount=1) · 종전주택 2007-04-09 취득 · 2013-10-23 관리처분인가 · 2023-02-16 완공APT 양도 · 실가취득 4.5억 · 거주 66개월. 양도가액 12억 → 세액합계 64,117,240원. 양도가액 12억+1원 → 세액합계 0원. 동일 조건을 assetKind=housing(일반주택)으로 계산하면 12억까지 isExempt=true·세액 0. 즉 12억 이하 구간 전체가 과대 과세다.

**세액 영향** — 실측(프로브 v2-exempt.ts): redevelopment_apt 1세대1주택 양도가 10억 → 세액합계 21,261,089원(정답 0원) · 양도가 12억 → 64,117,240원(정답 0원). 대조군 housing은 두 경우 모두 0원. 12억+1원에서는 재개발도 0원이 되어 1원 차이로 64,117,240원이 사라지는 불연속.

**수정 방향** — STEP 0.65 진입 전(또는 `calculateRedevelopmentTax` 내부 Step A.5 앞)에 subject="apt"에 대해 `checkExemption`을 태워 §89①3호 판정을 받고, 그 결과가 전액 비과세면 3분기 gain/lthd를 0으로 마스킹(입주권의 `applyOneRightExemption` 전액 비과세 분기와 동형)하고 `isExempt`·`exemptReason`을 채운다. 고가주택(부분 비과세)이면 현행 `applyHighValueAllocation`을 그대로 태우되 `isPartialExempt`도 함께 세운다. 12억 안분 발동 조건을 `isOneHouseSingle`(주택수만)이 아니라 `checkExemption`의 판정 결과로 바꾸는 것이 핵심이다.

#### `E3-06` 재개발 분기 결과에 `carryoverTaxationDetail`이 실리지 않아 이월과세 A/B 판정이 화면·다건 집계에서 사라진다

| | |
|---|---|
| 위치 | `lib/tax-engine/transfer-tax-redevelopment.ts:315` |
| 조문 | 소득세법 §97의2①·②3호 · §92③2호 |
| 유형 | plumbing-14pt |

STEP 0.475가 §97의2 A/B 시나리오를 계산해 `workingInput`을 교체하고 `carryoverDetail`을 만들지만(transfer-tax.ts:139-171), 재개발 분기는 STEP 0.65에서 조기 반환하면서 그 detail을 결과에 담지 않는다. 정상 경로는 `buildTransferResultDetails`가 `carryoverTaxationDetail: ctx.carryoverDetail`로 싣는다(transfer-tax-finalize.ts:592). 결과적으로 ① 결과 화면의 `CarryoverComparisonCard`가 렌더되지 않아(TransferTaxResultView.tsx:393 / ValuationDetailCards.tsx:118) 취득가액이 증여자 것으로 바뀐 근거를 볼 수 없고, ② 다건 집계가 `p.carryoverTaxationDetail?.isEligible === true`로 §97의2②3호 신고단위 비교 대상을 추리므로(transfer-tax-aggregate.ts:661-663) 재개발·입주권 자산이 그 비교에서 조용히 빠지며, ③ `adoptedCarryoverAcquisitionPrice(r.result.carryoverTaxationDetail)`가 undefined가 되어 신고서 표시 취득가액이 수증자 취득가액으로 되돌아간다(transfer-tax-aggregate.ts:508).

**실패 시나리오** — redevelopment_apt(또는 right_to_move_in) 자산의 취득원인을 「이월과세(증여)」로 선택하고 증여자 취득일·취득가액·증여세 상당액을 입력한다(UI 게이트 없음 — CompanionAcquisitionCauseSection.tsx:31이 자산종류와 무관하게 옵션을 렌더하고 :311이 CarryoverGiftBlock을 띄운다). 계산은 이월과세를 반영해 세액이 달라지는데(일반주택 211,563,000 vs 재개발 218,031,000, 같은 이월과세 입력) 결과 화면에는 A/B 비교 카드가 뜨지 않는다. 함께양도로 입주권을 넣으면(E3-04 경유) 그 자산이 §97의2②3호 신고단위 비교 대상에서 빠져 자산별 비교 결과가 그대로 채택된다.

**세액 영향** — 단건 세액은 불변(단건 엔진이 스스로 A/B를 판정한다) — 표시만 소실. 다건 신고단위 비교 배제로 인한 세액 차이는 **미검증**(E3-04가 먼저 해소돼야 도달 가능한 조합이라 격리 측정하지 못했다).

**수정 방향** — `calculateRedevelopmentTax`에 `carryoverDetail`을 매개변수로 넘겨(현행 `multiHouseSurchargeResult` echo와 같은 방식) 결과에 `carryoverTaxationDetail`로 싣는다. 같은 반환 블록에 `isPartialExempt`·`exemptReason`·`warnings`도 빠져 있어 §97의2②2호 자동 판정(`transfer-tax-carryover.ts:351` `resultA.isExempt === true || resultA.isPartialExempt === true`)이 재개발 자산에서는 항상 false가 되는데, 이는 E3-01(비과세 자체 부재)이 먼저 해소돼야 의미가 생긴다.

#### `P2-01` 함께양도 컴패니언이 조합원입주권이면 §166 입력 전부가 침묵 소실 — 축 일원화(#1245)가 SINGLE_ONLY 차단을 무력화

| | |
|---|---|
| 위치 | `lib/calc/transfer-tax-validate.ts:131` |
| 조문 | 소득세법 시행령 §166① |
| 유형 | plumbing-14pt |

「함께 양도」(assets.length>1) 경로에서 특수 분기 자산을 명시 차단하는 SINGLE_ONLY 목록에 `redevelopment_apt`만 있고 `right_to_move_in`이 없다. 2026-07-28 `5591e0b9`가 이 목록을 만들 당시에는 입주권 양도가 `assetKind="redevelopment_apt" + redevSubject="right"`로 모델링됐고 `right_to_move_in`에는 §166 입력 UI가 아예 없었다(RedevelopmentBlock.tsx:156-160 주석). 2026-08-13 `52c1180d`(#1245)가 축을 자산 종류로 일원화해 입주권 양도를 `right_to_move_in`으로 옮기면서 그 차단이 통째로 비켜갔다. 그 결과 컴패니언 입주권은 ⑧ validate를 통과하고, ④ `buildAssetPayload`가 `toEngineAssetKind`로 `assetKind: "housing"`으로 접어 보내며(§166 서브객체 미생성), route는 200을 반환한다 — 관리처분 인가일·권리가액·청산금·인가전 취득가액이 화면에는 그대로 입력된 채 계산에는 한 필드도 도달하지 않는다.

**실패 시나리오** — 자산1=주택(2015-03-02 취득, 계약 9억) + 자산2=조합원입주권(2010-03-02 취득, 계약 6억, 관리처분 인가일 2020-10-23, 권리가액 4억, 청산금 납부 5천만, 인가전 취득가액 1.8억), 「함께 양도」 actual 모드, 양도일 2026-06-15. → collectStepIssues(0) = [] (통과) · companionAssets[0].assetKind="housing" · redevelopment 서브객체 없음 · route 200 · 결정세액 182,250,000원. 같은 자산을 `assetKind="housing"`으로만 바꾼 대조군도 **정확히 182,250,000원** — §166①의 인가전/인가후 분할이 전혀 적용되지 않고 `fixedAcquisitionPrice`(3억)를 취득가액으로 한 일반 주택 계산이 된다.

**세액 영향** — 실측: 컴패니언 입주권 = 컴패니언 주택 = 182,250,000원(동일). §166 3분할·권리가액·청산금·인가전 취득가액 1.8억이 전부 미반영. 정확한 §166 세액은 이 파이프라인으로 산출 불가(컴패니언 Zod enum이 3종뿐)이라 차액 절대값은 미측정.

**수정 방향** — `SINGLE_ONLY`에 `[(a) => a.assetKind === "right_to_move_in", "조합원입주권(시행령 §166①)"]`을 추가한다. 다물건 계산기(`multi-transfer-tax-validate.ts:69`)는 2026-08-23에 같은 이유로 이미 입주권을 추가했다 — 함께양도 경로만 빠져 있다. 회귀 방어는 `__tests__/api/transfer.route.bundled-swallows-special.test.ts`에 입주권 케이스를 추가.

#### `S1-01` 분양권 세율에 양도일(시행일) 축이 전혀 없다 — 2021-06-01 개정 前 양도에 현행 60%/70%를 적용해 과대과세

| | |
|---|---|
| 위치 | `lib/tax-engine/transfer-tax-rate-calc.ts:428` |
| 조문 | 소득세법 §104①1호·2호·3호·4호 (법률 제17477호, 2020-08-18 공포 / 2021-06-01 시행) |
| 유형 | statute-mismatch |

`calcTax`의 단기·분양권 세율 결정식(`shortTermFlatRate`)은 `input.transferDate`를 한 번도 읽지 않는다. 그 결과 분양권은 양도일이 언제든 「1년 미만 70% / 1~2년 60% / 2년 이상 60%」가 적용된다. 그러나 이 세 값은 전부 2021-06-01 시행분이다. 법제처 DRF eflaw로 2021-01-01 시행본(MST 224801)과 2018-04-01 시행본(MST 199742)을 실독한 결과, 그 이전 §104①은 1호가 「제55조제1항에 따른 세율」(분양권 괄호 **없음**), 2호가 「40%[주택·조합원입주권은 **제외**]」, 3호가 「50%(주택 및 조합원입주권의 경우에는 40%)」, 그리고 **4호 「조정대상지역 내 주택의 입주자로 선정된 지위 … 50%」**였다. 같은 저장소가 §104⑦ 가산율은 `resolveSurchargeAddonRate`로 양도일 축을 이미 걸고 있고(`data/multi-house-surcharge-rate-history.ts` — 근거가 바로 같은 2021.6.1 개정이다), 누진표도 `loadFallbackTransferRates(targetDate)`로 양도일 축을 타므로, 단기·분양권 세율만 축이 빠져 있다. 또한 §104①4호(조정대상지역 분양권 50%)는 `RateClause` union에도 lib/ 어디에도 존재하지 않는다(`grep "104-1-4"` 0건).

**실패 시나리오** — 2020-06-01 양도 · 2015-01-01 취득(5년 보유) · 비조정대상지역 분양권 · 양도가 800,000,000 · 취득가 500,000,000 → 엔진은 60%를 적용해 산출세액 178,500,000(총세액 196,350,000)을 낸다. 2021-06-01 前 §104①1호는 §55① 누진세율이므로 같은 과세표준 297,500,000에 대한 법정 산출세액은 93,650,000이다. 1.5년 보유면 엔진 60%(178,500,000) vs 법정 §104①2호 40%(119,000,000), 0.5년 보유면 엔진 70%(208,250,000) vs 법정 §104①3호 50%(148,750,000). 조정대상지역이었다면 §104①4호 50% 고정인데 그 호는 코드에 존재하지 않는다. 수정신고·경정청구 화면(`amendmentSchema`)과 다건 `taxYear`(min 2000)가 과거 양도일을 정면으로 지원하므로 도달 가능하다.

**세액 영향** — 실측(loadFallbackTransferRates(2020-06-01), 양도 8억/취득 5억): 5년 보유 산출세액 178,500,000 vs 법정 93,650,000 → 84,850,000 과대(총세액 차 93,335,000). 1.5년 59,500,000 과대. 0.5년 59,500,000 과대. ※ 같은 식이 주택·조합원입주권도 지배하므로 파급이 있다 — 2020-06-01 양도 0.5년 주택은 엔진 70%(법정 §104①3호 40%), 1.5년 주택은 엔진 60%(법정은 2호가 주택을 제외하므로 §104①1호 누진)로 실측됐다.

**수정 방향** — §104⑦ 가산율과 동형으로 `lib/tax-engine/data/`에 분양권·단기 세율의 시행일별 정적 테이블을 두고(경계 2021-06-01), `calcTax`가 `input.transferDate`로 조회하도록 한다. 2021-06-01 前 구간에는 §104①4호(조정대상지역 분양권 50%, 단서 제외 요건 포함)를 `RateClause`에 추가해 §104① 후단 비교(`compareWithClause1`)에 함께 태워야 한다. 착수 전 각 구간의 부칙 적용례를 추가 확인할 것.

#### `S1-02` 함께양도 컴패니언 자산의 분양권·입주권이 ④에서 `housing`으로 접혀 엔진에 도달 — 60% 세율·§95② 장특 배제·§163⑥4호 1%가 모두 소실

| | |
|---|---|
| 위치 | `lib/calc/transfer-tax-api-helpers.ts:127` |
| 조문 | 소득세법 §104①1호(분양권 60%) · §95② 본문 괄호(분양권 장기보유특별공제 배제) · 소득세법 시행령 §163⑥3호·4호(개산공제 1%) |
| 유형 | plumbing-14pt |

`toEngineAssetKind()`가 `right_to_move_in`·`presale_right`를 `"housing"`으로 접는다. 이 함수는 컴패니언 자산 페이로드 빌더(`buildAssetPayload`)에서만 쓰이고, 그 값이 ⑩ `companionAssetSchema.assetKind`(enum `["housing","land","building"]`)를 통과한 뒤 ⑭ `bundled-split-helpers.ts`에서 그대로 `propertyType`이 된다. 결과적으로 자산 2번 이후에 분양권을 넣으면 엔진은 그것을 **주택**으로 계산한다 — 세율이 60%(§104①1호)에서 누진으로 떨어지고, §95② 장기보유특별공제 배제가 풀려 공제가 붙고, 개산공제가 §163⑥4호 1%가 아니라 2호 3%가 된다. ⑤ 입력 UI는 열려 있다(`CompanionAssetCard`가 8종 전부를 담은 `ASSET_KIND_OPTIONS`로 `AssetSectionBasic`을 렌더). ⑧ validate의 `SINGLE_ONLY` 차단 목록은 부담부증여·겸용주택·재개발APT·일반건물만 막고 분양권·입주권은 막지 않는다. 즉 축 자체가 ⑩ Zod에 칸이 없어 구조적으로 결여돼 있고, 그 사실을 기존 characterization 테스트(`__tests__/api/transfer.route.review-2026-08-f40.test.ts:365`)가 「엔진 축에서는 구분이 사라진다」로 고정해 두었으나 그로 인한 세액 결과는 다뤄지지 않았다.

**실패 시나리오** — 함께 양도 모드에서 자산1 = 주택, 자산2 = 분양권(2019-01-01 취득, 2026-06-01 양도, 안분 양도가 800,000,000 · 취득가 500,000,000)을 입력하면, 자산2가 엔진에 `propertyType: "housing"`으로 도달한다. 세율이 60%가 아닌 누진 38%로 적용되고, 배제돼야 할 장기보유특별공제 42,000,000이 공제되며, 환산취득 모드일 때 개산공제가 3,000,000(§163⑥4호 1%)이 아니라 9,000,000(2호 3%)이 된다. 화면에는 「분양권」이 그대로 표시되므로 사용자가 알 수 없다. 승계취득 조합원입주권도 같은 경로로 §95② 배제가 풀린다.

**세액 영향** — 실측(loadFallbackTransferRates(2026-06-01), 7년 보유, 양도 8억/취득 5억): `propertyType="presale_right"` 총세액 196,350,000(rate 0.60·장특 0·과표 297,500,000) vs 현행 매핑 결과 `"housing"` 총세액 84,865,000(rate 0.38·장특 42,000,000·과표 255,500,000) → **111,485,000 과소**. 승계입주권은 법정 102,421,000 vs 84,865,000 → **17,556,000 과소**. 환산취득 경로 개산공제는 취득 기준시가 3억 기준 3,000,000 vs 9,000,000(**6,000,000 과대공제**).

**수정 방향** — ⑩ `companionAssetSchema.assetKind` enum에 `right_to_move_in`·`presale_right`를 추가하고, ⑭ `bundled-split-helpers.ts:266`의 3분기 매핑을 그 둘까지 확장한 뒤 `toEngineAssetKind`의 fold를 제거한다. 축을 열 수 없다면(§166 재개발 경로가 컴패니언에 없으므로 `right_to_move_in`은 그럴 수 있다) `SINGLE_ONLY`에 명시 차단을 추가해 「침묵 오산보다 명시 차단」 정책(multi-transfer-tax-validate.ts:57-71과 동일)을 적용할 것. 어느 쪽이든 ④가 조용히 접는 현행은 유지 불가.

### 5.2 🟠 high (16건)

#### `C1-01` 소득세법 §89② (주택 + 조합원입주권·분양권 보유 세대의 주택 양도 → §89①3호 배제)가 엔진에 전혀 없다 — 1세대1주택 비과세가 그대로 적용된다

| | |
|---|---|
| 위치 | `lib/tax-engine/transfer-tax-exemption.ts:613` |
| 조문 | 소득세법 §89② 본문·단서 / 소득세법 시행령 §156의2·§156의3 |
| 유형 | statute-mismatch |

소득세법 §89②은 「1세대가 주택과 조합원입주권 또는 분양권을 보유하다가 그 주택을 양도하는 경우에는 제1항에도 불구하고 같은 항 제3호를 적용하지 아니한다」고 규정하고, 그 단서의 예외를 시행령 §156의2(주택+조합원입주권)·§156의3(주택+분양권)이 정한다. 그런데 비과세 판정의 단일 진입점인 `checkExemption`(:586-615, 파일 주석 :598이 스스로 「§89①3호·§155 각 특례를 전부 판정하는 단일 진입점」이라 명시)은 세대의 입주권·분양권 보유를 나타내는 두 입력(`householdRightCount`·`presaleRights[]`)을 한 번도 읽지 않는다. 배제(§89② 본문)도, 그 예외(§156의2·§156의3)도 구현돼 있지 않아, 조합원입주권·분양권 보유 사실이 비과세 판정에 아무 영향을 주지 않는다.

**실패 시나리오** — 주택 1채(2015-06-01 취득) + 세대가 2021-03-01 이후 취득한 분양권 1개를 보유한 상태에서 그 주택을 12억 이하(9억)에 양도. 프로브 실측 [A] 분양권 없음 → isExempt=true·totalTax=0 / [B] presaleRights 1건 보유 → isExempt=true·totalTax=0 / [C] householdRightCount=1(조합원입주권) → isExempt=true·totalTax=0 — **세 케이스가 완전히 동일**하다. 시행령 §156의3②(3년 이내 양도)·③(완성 후 3년 내 이사·1년 거주) 요건을 충족하지 못하는 조합(예: 분양권 취득 후 3년 초과 후 종전주택 양도)에서도 전액 비과세로 계산된다. 입력 경로 측면에서도, 세대 보유 분양권·입주권 목록 UI(`app/calc/transfer-tax/steps/Step4.tsx:638`)는 `householdHousingCount >= 2`에서만 렌더되므로 「1주택 + 1분양권」 세대는 그 사실을 알릴 수단조차 없다(U2-05가 지적한 게이트와 같은 지점). 반대로 householdHousingCount=2(일시적 2주택)에서는 목록 UI가 열려 presaleRights가 엔진에 실제로 도달하는데, 프로브 실측에서도 분양권 유무와 무관하게 「일시적 2주택 비과세·totalTax=0」이 나왔다 — 즉 값이 도달해도 판정이 바뀌지 않는다.

**세액 영향** — 실측(mock 세율, __tests__/tax-engine/_helpers/mock-rates): 양도가 900,000,000 · 취득가 400,000,000 · 보유 9년 · 거주 60개월 기준으로 현행 totalTax = 0. 같은 입력에서 비과세를 배제한 대조군(isOneHousehold=false) totalTax = 155,166,000 (양도차익 500,000,000 · LTHD 80,000,000). 즉 이 조합에서 세액이 0으로 나온다. 절대값은 mock 세율 기준이므로 대조 차액이 의미 있는 값이다.

**수정 방향** — 엔진 입력에 이미 도달하는 `householdRightCount`·`presaleRights[]`를 `checkExemption`이 읽어 §89② 본문 배제를 먼저 판정하고, 시행령 §156의2·§156의3 각 항의 예외를 충족할 때만 §89①3호로 되돌리는 구조가 필요하다. 단, ①§156의2·§156의3은 항이 12개까지 있고 상속·동거봉양·혼인 등 호마다 요건·기산점이 다르므로 「한 호를 복사하면 조용히 틀린다」(memory `project_inheritance_remaining_gaps_code_verified`)는 점, ②배제만 먼저 넣으면 특례 충족 세대에 법 근거 없이 불리해지므로 배제와 예외를 **같은 PR에서** 넣어야 한다는 점, ③「1주택 + 1분양권/입주권」 세대가 그 사실을 입력할 경로(Step4 목록 UI 게이트)를 함께 열어야 no-op이 되지 않는다는 점을 전제로 별도 설계가 선행돼야 한다.

#### `C1-02` 세대 보유 「조합원입주권」에 분양권 전용 2021-01-01 기산일이 적용돼 §104⑦ 주택 수에서 조용히 빠진다 (실측 Δ 109,725,000)

| | |
|---|---|
| 위치 | `lib/tax-engine/multi-house-surcharge-count.ts:309` |
| 조문 | 소득세법 §104⑦2호·4호 / 소득세법 시행령 §167의4②1호 · §167의11②1호 (본문 실독, 취득시기 요건 부존재 확인) / 2021-01-01 기산일의 근거인 분양권 신설 개정법률 부칙 적용례는 **본문 미확인** |
| 유형 | statute-mismatch |

`isPresaleRightCounted`가 `presaleRights[]` 전 항목에 대해 「취득일 < 2021-01-01이면 주택 수에 산입하지 않는다」를 적용한다. 그런데 그 배열은 분양권(`type: "presale_right"`)과 **조합원입주권(`type: "redevelopment_right"`)** 을 함께 담고(UI가 두 값을 라디오로 제공), 함수는 `type`을 보지 않는다. 2021-01-01 기산일의 근거는 분양권을 §104⑦ 주택 수에 새로 넣은 개정(소득세법 §88 10호 「분양권」 정의 신설)의 적용례이지 조합원입주권(§88 9호, 그 이전부터 §104⑦ 주택 수 요소)에 대한 것이 아니다. 함수 주석이 근거로 든 소득세법 시행령 §167의4②1호·§167의11②1호를 실독한 결과 두 조문의 산입 제외 사유에는 **취득시기 요건이 전혀 없고**(수도권·광역시·특별자치시 외 지역 + 가액 3억 이하만) 조합원입주권과 분양권을 나란히 열거한다.

**실패 시나리오** — 조정대상지역 주택 2채(양도주택 포함) + 2019-05-01 취득 조합원입주권 1개를 보유한 세대가 2026-06-01에 주택 1채를 양도. 코드는 입주권을 산입하지 않아 주택 수 2 → §104⑦2호(+20%p, `surchargeType=multi_house_2`)로 계산한다. 조합원입주권을 산입하면 3 → §104⑦4호(+30%p, `multi_house_3plus`)여야 한다. 프로브 실측: `redevelopment_right` 2019-05-01 취득 → surchargeType=multi_house_2·rate=0.2·totalTax=640,761,000 / 같은 입주권을 2021-06-01 취득으로만 바꾸면 → multi_house_3plus·rate=0.3·totalTax=750,486,000. `presale_right`로 바꿔도 완전히 같은 값이 나온다(= type 미판별 확증).

**세액 영향** — 실측 Δ = 109,725,000원 (mock 세율 makeMockRatesWithHouseEngine 기준, 양도가 1,500,000,000 · 취득가 500,000,000 · 조정대상지역). 세율 데이터가 바뀌면 절대값은 달라지나 「+20%p vs +30%p」라는 구조적 차이는 세율 데이터와 무관하다. 방향은 **과소과세**다.

**수정 방향** — `isPresaleRightCounted`에서 취득일 게이트를 `right.type === "presale_right"`에만 적용하고 `"redevelopment_right"`는 기산일 없이 3억 배제만 적용하는 방향. 다만 이 정정은 납세자에게 불리한 방향이므로 착수 전에 (a)분양권을 §104⑦ 주택 수에 넣은 개정법률(소득세법 §88 10호 신설) **부칙 적용례 본문**과 (b)조합원입주권의 §104⑦ 산입 개시 시점 연혁을 실독해 기산일 자체를 확정할 것. 확정 전에는 코드 주석의 「§167의4②1호·§167의11②1호 근거 + 2021.1.1」 병기가 조문에 없는 요건을 조문 근거인 것처럼 적고 있다는 사실만이라도 정정 대상이다.

#### `E1-02` §166①1호·①2호나목 「§97①2·3호 **또는** §163⑥」 택일 위반 — 환산 모드에서 개산공제와 인가전 필요경비를 이중 차감

| | |
|---|---|
| 위치 | `lib/tax-engine/redevelopment-split.ts:202` |
| 조문 | 소득세법 시행령 §166①1호 후단 · §166①2호 나목 (본문 확인 — 「법 제97조제1항제2호 및 제3호 **또는** 제163조제6항에 따른 필요경비」) |
| 유형 | engine-formula |

`computeRedevelopmentSplit`의 인가전 양도차익이 `권리가액 − 취득가액 − 개산공제 − preApprovalExpenses`로 **둘을 모두** 뺀다. 조문은 「§97①2호 및 3호 **또는** §163⑥에 따른 필요경비」로 택일을 규정하며, 이 저장소는 같은 조문에 대해 이미 두 sibling 경로에서 택일로 정정했다 — `redevelopment-housing-contribution.ts:171-192`(#591 감사 R7, 「종전에는 …까지 차감해 **이중차감**했다」)와 표시 헬퍼 `redevelopment.ts:89-93 preApprovalNecessaryExpense`. 본류인 `computeRedevelopmentSplit`만 정정에서 빠졌다. 결과는 두 가지다: (1) 환산 모드에서 인가전 필요경비를 입력하면 그 금액만큼 양도차익이 추가로 줄어 세액이 과소, (2) 신고서 양식의 인가전 분 필요경비 열은 `preApprovalNecessaryExpense`가 택일한 개산공제만 표시해 「양도가액 − 취득가액 − 필요경비 ≠ 양도차익」으로 어긋난다. 게다가 계산 근거 step(`transfer-tax-redevelopment-transforms.ts:428-440`)은 두 항을 **모두** 표시해 신고서 열과 서로 모순된다.

**실패 시나리오** — 사례 44(재개발APT · 주택 출자 · 청산금 납부 92,781,500 · 환산 · 권리가액 219,218,500 · 취득시 라목값 85,034,988 · 인가시 132,000,000 · 양도가 525,000,000)에서 「인가전 분 필요경비」에 10,000,000을 입력. 인가전 양도차익이 75,445,917 → 65,445,917로 10,000,000 줄어든다(개산공제 2,551,049는 이미 별도 차감됨). 동시에 신고서 인가전 분 열은 `필요경비 2,551,049`만 표시해 219,218,500 − 141,221,534 − 2,551,049 = 75,445,917 ≠ 표시 양도차익 65,445,917로 어긋나고, 계산근거 step은 「… - 필요경비 10,000,000 - 개산공제(시행령 §163⑥) 2,551,049」로 정반대를 보여준다.

**세액 영향** — 산출세액 55,836,614 → **53,176,614 (2,660,000원 과소)**, 세액합계 61,420,275 → 58,494,275 (2,926,000원 과소) — 프로브 실측(mock 세율). 과소액은 입력한 인가전 필요경비 × 한계세율만큼 선형 증가.

**수정 방향** — `redevelopment-split.ts:201-202`를 `preApprovalNecessaryExpense(estimatedLumpDeduction, redevelopment.preApprovalExpenses)` 단일 소스로 바꿔 sibling 두 경로와 술어를 통일한다(엔진 헬퍼를 재정의하지 말고 `redevelopment.ts`의 것을 export해 공유). 동시에 `transfer-tax-redevelopment-transforms.ts:428-440`의 step 산식도 택일 값 하나만 표시하도록 맞춘다 — 지금은 신고서 열과 step이 서로 다른 진실을 말한다. 회귀 anchor로 `subject:"apt"` + 환산 + `preApprovalExpenses>0` 케이스를 추가할 것(현재 코퍼스에 0건).

#### `E1-03` §166②1호 인가후양도차익이 음수일 때 0으로 clamp — 인가전 이익과 상계되지 않아 양도차익 과대

| | |
|---|---|
| 위치 | `lib/tax-engine/redevelopment-settlement.ts:82` |
| 조문 | 소득세법 시행령 §166②1호 (본문 확인) · 대비 §166①1호 |
| 유형 | engine-formula |

`splitAptPay`가 `postApprovalGain <= 0`이면 청산금납부분·기존건물분을 **둘 다 0**으로 반환한다. §166②1호는 「기존건물분양도차익 = [인가후양도차익 × 평가액 ÷ 분양가] + 인가전양도차익」이라는 대수적 합이므로 인가후양도차익이 음수면 그만큼 기존건물분이 줄어야 한다. clamp 때문에 음수분이 사라지고 인가전 이익만 남아 총 양도차익이 부풀려진다. 같은 사실관계를 §166①1호(입주권, `computeRightPay`)로 태우면 음수가 그대로 흘러 정상 합계가 나오므로, **같은 경제적 사실이 자산 종류에 따라 다른 양도차익**을 만든다. 법 근거 없이 납세자에게 불리한 방향이다.

**실패 시나리오** — 종전주택 2007-04-09 취득(실가 400,000,000) → 2013-10-23 관리처분 인가(권리가액 650,000,000) → 청산금 300,000,000 납부 → 2023-02-16 완공 신축APT를 **800,000,000에 양도**(분양가 950,000,000 미만 = 인가후 −150,000,000 손실). 실제 양도차익은 800,000,000 − (400,000,000 + 300,000,000) = 100,000,000인데, 엔진은 인가전 250,000,000만 남기고 인가후 −150,000,000을 버려 총 양도차익 250,000,000을 만든다. 동일 입력을 자산 종류만 「입주권」으로 바꾸면(§166①1호 경로) 총 양도차익 100,000,000이 나온다.

**세액 영향** — 산출세액 45,610,000(완공APT) vs 10,440,000(동일 사실 입주권 경로) = **35,170,000원 과대**, 세액합계 50,171,000 vs 11,484,000 = 38,687,000원 과대 (프로브 실측, mock 세율)

**수정 방향** — `splitAptPay`의 early return을 `salePriceTotal <= 0`(분모 0 방어)만 남기고 `postApprovalGain <= 0` 조건을 제거해 음수가 안분되어 흐르도록 한다(`safeMultiplyThenDivide`는 음수를 처리한다). 같은 판단을 `computeAptReceive`(redevelopment-split.ts:375)·`splitReceive`(redevelopment-settlement.ts:167)·`calcRedevLandContribEstimated`(redevelopment-land-contribution.ts:142·149)의 `Math.max(0, …)`에도 일괄 적용할지 별도 결정할 것 — 지금은 경로마다 clamp 유무가 갈려 있다. 음수 차익의 최종 처리는 `total.taxableIncome`의 `Math.max(0, …)`(redevelopment.ts:683)가 이미 담당하므로 분기 단계에서 자를 이유가 없다.

#### `E1-04` ⑧ validate 통과 ↔ ⑫ Zod 400 dead-end — Zod refine이 `settlementDirection === "receive"` 조건을 빠뜨려 「주택 출자 + 입주권 + 청산금 납부 + 환산」이 계산 불가

| | |
|---|---|
| 위치 | `lib/api/transfer-tax-schema-refines.ts:264` |
| 조문 | 소득세법 시행령 §166③ · §164⑤ (분기 조건 자체는 코드 정합성 문제) |
| 유형 | validate-sync |

사례 39(단독주택 출자 §164⑤ 2-point 환산) 전용 refine이 활성 조건에서 청산금 방향을 검사하지 않는다. 엔진 dispatch(`redevelopment.ts:160-168`)와 클라이언트 validate(`transfer-tax-validate-redev.ts:223-227`)는 둘 다 `settlementDirection === "receive"`를 요구하는데 Zod만 `housing + right + estimated`로 넓다. 그래서 청산금 **납부** 조합에서는 UI가 일반 환산 카드(D + 취득당시 라목값)를 렌더하고 클라이언트 validate가 통과시키는데, 서버 Zod가 `housingStdPriceAtAcq`·`housingStdPriceAtApproval`을 요구하며 400을 낸다. 그 두 필드의 입력 UI(`HousingContribEstimatedSection`)는 `isHousingContribEstimatedBranch`가 `receive`를 요구해 이 화면에서는 렌더되지 않으므로, 사용자는 요구받은 값을 입력할 방법이 없다 — 완전한 dead-end다.

**실패 시나리오** — 자산 종류 「입주권」 · 출자 자산 「주택」 · 청산금 「납부」 100,000,000 · 취득가액 「환산취득가」 선택 후 일반 환산 카드에 D(인가일 개별주택공시가격 200,000,000)·취득당시 라목값 120,000,000을 입력. 클라이언트 `validateRedevelopmentAsset` = `null`(통과) → 계산 요청 → 서버 `propertySchema.safeParse`가 `[redevelopment.housingStdPriceAtAcq] 단독주택 출자 환산취득가 — 취득당시 개별주택가격(§164⑤ 분자) 필수` + `[redevelopment.housingStdPriceAtApproval] …` 2건으로 거부(400). 사용자는 해당 입력칸이 화면에 없어 진행 불가.

**세액 영향** — 세액 오류가 아니라 **계산 자체가 차단**된다(400). 사례 37(토지 출자 + 입주권 + 납부 + 환산)의 주택 출자 대응 케이스가 통째로 사용 불가.

**수정 방향** — `transfer-tax-schema-refines.ts:262-265`의 `isHousingEstimated`에 `rd.settlementDirection === "receive"`를 추가해 엔진 dispatch·⑧ validate·UI 게이트와 술어를 일치시킨다. 이 저장소는 이미 `isHousingContribEstimatedBranch`를 UI 단일 소스로 두고 있으므로(AssetAreaRedevelopment.tsx:113), Zod도 같은 세 축(housing·right·receive·estimated)을 그대로 복제하지 말고 공용 leaf 술어로 뽑아 네 지점이 한 함수를 보게 하는 것이 재발 차단에 낫다.

#### `E1-08` 승계조합원 분기가 `isOneHouseSingle`을 무시해 §95② 표2 진입 불가 — 같은 입력으로 §95③ 12억 안분은 1세대1주택으로 발동

| | |
|---|---|
| 위치 | `lib/tax-engine/redevelopment-successor.ts:73` |
| 조문 | 소득세법 §95② 단서 (본문 확인) · 소득세법 시행령 §159의4 (본문 확인 — 「양도일 현재 국내에 1주택 보유 + 보유기간 중 거주기간 2년 이상」) |
| 유형 | engine-formula |

`runRedevelopment`가 `isSuccessorMember === true`일 때 호출하는 `runSuccessorMember`는 `RedevelopmentOrchestratorInput.isOneHouseSingle`·거주월수를 **한 번도 읽지 않고** 표1(`computeTable1Rate`)만 적용한다. 같은 파일 헤더(:22-23)는 이 분기를 「단순 housing 양도와 동치 처리」라고 선언하는데, 단순 주택 양도라면 1세대1주택 + 거주 2년 이상 시 §95② 단서·시행령 §159의4에 따라 표2(보유 4%/년 + 거주 4%/년, 최대 80%)가 적용되어야 한다. 더구나 상위 오케스트레이터는 **같은 입력을 1세대1주택으로 인정해** §95③ 12억 안분(`transfer-tax-redevelopment.ts:120-123`)을 발동시킨다 — 한 계산 안에서 1세대1주택 여부가 두 개의 답을 갖는다. 방향은 납세자에게 불리하다.

**실패 시나리오** — 관리처분(2009-01-10) 후 입주권을 2010-05-01 승계취득(취득가 500,000,000) → 준공 2011-03-01 → 2023-02-16 신축APT를 2,000,000,000에 양도. 1세대1주택 · 거주 132개월. 엔진: 12억 안분은 1세대1주택으로 발동(taxableRatio 0.4, 과세 양도차익 600,000,000)하는데 LTHD는 표1 22%(보유 143개월) = 132,000,000. §95② 단서·시행령 §159의4대로면 표2 보유 40% + 거주 40% = 80% → 480,000,000.

**세액 영향** — 실측(mock 세율): 현행 LTHD 132,000,000 · 과세표준 465,500,000 · 산출세액 160,260,000 · 세액합계 176,286,000. 표2(80%) 적용 시 LTHD 480,000,000 · 양도소득금액 120,000,000이 되므로 세액은 크게 감소한다(정확한 대조 세액은 미측정 — 코드 변경 없이는 표2 경로에 도달할 수 없어 **정확 차액은 미검증**).

**수정 방향** — 먼저 판단 축을 정할 것: 승계조합원 신축APT를 「단순 주택 양도와 동치」로 본다는 파일 헤더의 선언을 유지한다면 `runSuccessorMember`가 `input.isOneHouseSingle`·거주월수를 받아 `computeLthdRateSplit`(redevelopment-lthd.ts:338 — 표1/표2 단일 소스)을 쓰도록 바꾸고, 중복 정의된 `computeTable1Rate`(:38-42)를 제거한다. 동시에 승계조합원 화면에 거주기간 입력 경로를 열어야 실제로 도달 가능해진다(지금은 엔진만 고치면 no-op이다). 반대로 표2 배제가 의도라면 12억 안분 쪽(`transfer-tax-redevelopment.ts:120`)과 판단을 일치시키고 근거를 남길 것 — 현행은 어느 쪽으로도 일관되지 않다.

#### `E2-03` 단독주택 출자 입주권 환산 경로가 1세대1주택·거주기간을 하드코딩 false/0으로 버려 실가 경로와 LTHD가 갈린다

| | |
|---|---|
| 위치 | `lib/tax-engine/redevelopment-housing-contribution.ts:216` |
| 조문 | 소득세법 §95② 단서 · 소득세법 시행령 §166⑤1호 |
| 유형 | engine-formula |

`calcRedevHousingContribReceiveEstimated`는 `computeRightLthd`를 호출하면서 `isOneHouseSingle: false`, `residencePeriodMonths: 0`을 **상수로** 넘긴다(주석은 「1세대1주택 분기는 UI PR에서 처리」). 그런데 `transfer-tax-redevelopment.ts:95-98`은 housing 출자 입주권에 대해 `isOneHouseSingle`을 정상 산정해 orchestrator까지 내려보내고, 같은 사실관계의 **실가 경로**(`runOriginalMember` → `computeRedevelopmentLthd` → `computeRightLthd`)는 그 값을 그대로 소비해 표2를 적용한다. 결과적으로 취득가액 산정 방식(실가/환산)이라는 §95②·§159의4와 무관한 축이 LTHD 표를 가른다. 두 결과가 동시에 옳을 수 없다. (같은 하드코딩이 `redevelopment-land-contribution.ts:165-167`에도 있으나 그쪽은 토지 출자라 `transfer-tax-redevelopment.ts:92-94`의 `isLandContributedRight` 가드와 결론이 일치해 문제되지 않는다 — housing 경로만 갈린다.)

**실패 시나리오** — 단독주택 출자 → 조합원입주권 양도(2023-03-02, 320,000,000), 관리처분 인가 2013-10-23, 취득 2008-04-09, 청산금 50,000,000 수령, 1세대1주택 + 거주 60개월. 취득가액을 확인할 수 없어 §166③ 환산(PHD 2-point)을 고르면 1세대1주택 체크가 결과에 전혀 반영되지 않는다.

**세액 영향** — 실측(probe1, mock 세율). 환산 경로: 1세대1주택 OFF/ON 모두 preApproval 공제율 0.10 · 세액합계 42,772,400(완전 동일). 실가 경로(취득가액을 환산값과 같은 180,000,000으로 맞춤): OFF 0.10 · 43,901,000 / ON **0.40** · 32,103,500. ⇒ 실가에서는 1세대1주택이 세액합계를 11,797,500원 움직이는데 환산에서는 0원.

**수정 방향** — `RedevHousingContribReceiveEstimatedInput`에 `isOneHouseSingle`·`residencePeriodMonths`(또는 prior 월수)를 추가하고 `runHousingContribReceiveEstimated`(redevelopment.ts:375)가 `input.isOneHouseSingle`·`input.priorHouseResidenceMonths ?? input.residencePeriodMonths`를 그대로 내려보낼 것. 「1세대1주택 여부 재판정 금지 — 호출부 값 그대로」 원칙은 같은 파일 :50-65 `ownershipRatio`·`isUnregistered` 주석이 이미 명시하고 있다. 표2를 입주권에 적용할지 자체를 바꾸려는 것이라면 **실가 경로와 함께** 바꿔야 하며, 실가 경로만 남긴 현행은 어느 쪽으로도 정합하지 않는다.

#### `E2-04` 재개발 경로가 미등기양도자산에도 장기보유특별공제를 그대로 차감한다 (§95② 괄호 누락)

| | |
|---|---|
| 위치 | `lib/tax-engine/transfer-tax-redevelopment.ts:185` |
| 조문 | 소득세법 §95② 본문 괄호 · 소득세법 §104③ |
| 유형 | statute-mismatch |

재개발 분기는 LTHD를 `runRedevelopment`가 분기별로 산정해 넘기므로 일반 경로(`transfer-tax-lthd.ts`)의 배제 규칙을 타지 않는다. 이를 알고 `calculateRedevelopmentTax`가 `applyLthdExclusion`을 직접 걸어 두었으나, 그 트리거가 `resolveSurchargeApplication(...).isSurchargeApplied`(다주택 중과) **하나뿐**이다. §95② 본문 괄호는 「제104조제3항에 따른 **미등기양도자산**과 같은 조 제7항 각 호에 따른 자산은 제외한다」로 **둘**을 배제하는데, 같은 자리의 주석(:170-176)도 §104⑦만 인용하고 미등기를 빠뜨렸다 — 주석·구현이 함께 드리프트했다. 기본공제(§103①)와 70% 세율(§104③)은 정상 적용되므로 결함이 겉으로 드러나지 않는다.

**실패 시나리오** — 재개발 신축APT(취득 2009-04-15, 인가 2013-10-23, 양도 2023-02-16 920,000,000, 취득가액 300,000,000)를 **미등기 상태로** 양도. 「미등기 양도」를 켜면 세율은 70%로, 기본공제는 0으로 바뀌지만 LTHD 161,200,000은 그대로 차감된다.

**세액 영향** — 실측(probe6-A / probe7-A2, mock 세율 동일 수치). 재개발 경로: isUnregistered=false → LTHD 161,200,000 · 산출세액 156,580,000 / isUnregistered=true → LTHD **161,200,000(불변)** · 과세표준 458,800,000 · 산출세액 321,160,000. 동일 수치 일반 주택 경로: isUnregistered=true → LTHD **0** · 과세표준 620,000,000 · 산출세액 434,000,000. ⇒ 재개발 경로 산출세액 112,840,000원 과소.

**수정 방향** — `lthdExcludedBySurcharge` 판정에 `input.isUnregistered === true`를 OR로 추가하고(또는 §95② 배제 술어를 일반 경로와 공용 leaf로 추출), 같은 자리 주석의 §95② 인용에서 빠진 §104③을 함께 복원할 것. 배제 시 분기 3개와 합계를 함께 0으로 두는 현행 `applyLthdExclusion` 계약은 그대로 재사용 가능하다.

#### `E3-02` §166 재개발·입주권 분기가 조특법 감면(input.reductions)을 통째로 버린다 — `reductionAmount: 0` 하드코딩

| | |
|---|---|
| 위치 | `lib/tax-engine/transfer-tax-redevelopment.ts:352` |
| 조문 | 조세특례제한법 §77(공익사업용 토지등에 대한 양도소득세 감면) · §97 · §99 · §98 / 농어촌특별세법 §5①1호 |
| 유형 | plumbing-14pt |

재개발 분기는 `finalizeTransferTax`를 호출하지 않고 결과를 직접 조립하는데, `input.reductions`를 한 번도 읽지 않고 `reductionAmount: 0`을 하드코딩한다(`reductionType`·`reducibleIncome`·각 감면 detail·농특세도 전부 미부착). 그런데 감면 자산종류 게이트(`lib/tax-engine/transfer-reductions/asset-kind-gate.ts:35-41`)는 `redevelopment_apt`를 rental(§97)·new_housing(§99)·unsold(§98)의 **허용 자산으로 명시**하고, standalone(§77 공익수용·§77의2·§77의3)은 `isReductionCategoryAllowedForAssetKind`가 모든 자산에 true를 반환한다(:97-98). UI(`UnifiedReductionPanel.tsx:382-386`)도 §77 체크박스를 자산종류 게이트 없이 렌더하고, ④(`transfer-tax-api.ts:71,565`)·⑫(`lib/api/transfer-tax-schema-reductions.ts:60`)도 그대로 통과시킨다 ⇒ 감면이 엔진까지 도달한 뒤 **엔진 안에서 침묵 소실**한다.

**실패 시나리오** — redevelopment_apt(사례44 환산 fixture · 양도가 5.25억 · 2026-02-16 양도) 자산에 조특법 §77 공익수용 감면(현금보상 5.25억, 사업인정고시 2025-01-10)을 선택. 결과: reductionAmount=0, publicExpropriationDetail=undefined, 세액합계 61,420,275원으로 감면 미선택 시와 **완전히 동일**. 동일 세액 규모의 일반주택 대조군은 같은 감면으로 61,420,274 → 53,882,332원(감면세액 8,375,491 + 농특세 1,675,098 반영).

**세액 영향** — 실측(프로브 v1-reduction.ts, 2회 재현): 재개발 경로 감면액 0원 / 대조군 일반주택 감면액 8,375,491원, 세액합계 차 7,537,942원 과대(감면 8,375,491 · 지방소득세 −837,549 · 농특세 +1,675,098의 순합). §97 장기임대·§99 신축주택 등 다른 감면도 같은 지점에서 동일하게 소실(코드 정독 — reductions를 읽는 코드가 이 파일에 전무).

**수정 방향** — 두 갈래 중 택일이 필요하다. (a) 재개발 분기에서도 감면을 계산: Step F(산출세액) 뒤에 `finalizeTransferTax`의 감면·농특세 경로를 재사용하거나 최소한 `calcReductions` 계열을 호출해 `reductionAmount/reductionType/reducibleIncome/농특세`를 채운다. (b) 지원하지 않을 것이라면 `asset-kind-gate.ts`에서 redevelopment_apt·right_to_move_in을 제외하고 §77 등 standalone도 조문 id 단위로 차단해 **UI 단계에서 막는다**(침묵 소실 금지). 어느 쪽이든 현행처럼 「선택은 되는데 계산에는 없다」는 상태는 유지하면 안 된다.

#### `E3-03` 조합원입주권(subject="right")의 12억 안분이 §89①4호 요건을 하나도 검증하지 않고 「세대 주택수 1」만으로 발동한다

| | |
|---|---|
| 위치 | `lib/tax-engine/transfer-tax-redevelopment.ts:95` |
| 조문 | 소득세법 §89①4호 본문·가목·나목, 같은 호 각 목 외의 부분 단서 / 소득세법 §95③ / 소득세법 시행령 §160 |
| 유형 | statute-mismatch |

`isOneHouseSingle`은 `isOneHousehold && householdHousingCount === 1`로만 정의되는데(:95-98), 이 값이 subject="right"에서도 그대로 §95③ 12억 안분(`applyHighValueAllocation`)을 발동시킨다. 그러나 조합원입주권 양도의 비과세는 §89①4호이고, 1주택 보유 세대는 **나목**(「양도일 현재 1조합원입주권 외에 1주택을 보유한 경우(분양권을 보유하지 아니하는 경우로 한정한다)로서 해당 1주택을 취득한 날부터 3년 이내에 해당 조합원입주권을 양도할 것」) 요건을 충족해야만 대상이 된다. 엔진은 3년 요건도, 본문의 「인가일 현재 §89①3호가목 기존주택 소유」 요건(`exemptionEligibleAtApproval`)도, 분양권 미보유 요건도 전혀 보지 않는다. 반대로 12억 **이하** 구간에서는 나목 충족자에게 줄 전액 비과세가 없어(가목 경로 `applyOneRightExemption`은 householdHousingCount===0을 요구) 과대 과세가 된다. 가목 경로가 `exemptionEligibleAtApproval === true`를 요구하는 것과 비대칭이다.

**실패 시나리오** — 조합원입주권 양도(right_to_move_in) · 2009-03-01 종전주택 취득 · 2018-06-20 관리처분인가 · 2024-03-01 양도 · 양도가액 20억 · 권리가액 14억 · 취득가액 5억 · 세대가 다른 주택 1채 보유(isOneHousehold=true, householdHousingCount=1, householdRightCount=1) · `exemptionEligibleAtApproval` **미입력** · 나목의 3년 요건 미확인. 엔진은 taxableRatio 0.4의 12억 안분을 적용해 과세대상 양도차익을 15억 → 6억으로 깎는다. 같은 입력에서 householdHousingCount만 2로 바꾸면 안분이 사라진다.

**세액 영향** — 실측(프로브 v4-misc.ts §(2)): 세대 주택수 1 → 세액합계 206,573,400원 / 세대 주택수 2 → 588,538,500원. 요건 무검증 안분으로 **381,965,100원 과소**. 반대 방향(12억 이하 + 나목 충족)에서는 전액 비과세가 없어 과대 과세이나 그 금액은 미검증.

**수정 방향** — subject="right"의 12억 안분 발동 조건을 `isOneHouseSingle`에서 분리해 §89①4호 전용 술어로 세운다 — 본문(`exemptionEligibleAtApproval === true`) AND (가목: householdHousingCount===0 AND 분양권 미보유) OR (나목: householdHousingCount===1 AND 분양권 미보유 AND 그 1주택 취득일부터 3년 이내). 나목 판정에 필요한 「1주택 취득일」은 현재 입력에 없으므로 신규 입력(⑤⑧④⑫⑭)이 필요하다. 요건 미확인 상태에서는 안분을 걸지 않는 것이 현행 `applyOneRightExemption`의 자기선언 방식과 일관된다. LTHD 표2 진입(`isOneHouseSingle`을 `runRedevelopment`에 넘기는 :108)도 같은 술어를 공유해야 「안분은 되는데 표는 다르다」가 생기지 않는다.

#### `L1-03` §89①4호 가목의 「또는 분양권」 요건이 비과세 게이트에서 통째로 누락 — 분양권 보유 세대도 전액 비과세(실측 0원)

| | |
|---|---|
| 위치 | `lib/tax-engine/transfer-tax-redevelopment-transforms.ts:310` |
| 조문 | 소득세법 §89①4호 가목 (「양도일 현재 다른 주택 **또는 분양권**을 보유하지 아니할 것」) |
| 유형 | statute-mismatch |

applyOneRightExemption의 비과세 트리거는 exemptionEligibleAtApproval·isOneHousehold·householdHousingCount===0·householdRightCount===1 네 조건뿐이고, 가목이 명문으로 요구하는 「분양권을 보유하지 아니할 것」을 어디서도 보지 않는다. 엔진 입력에는 이미 presaleRights[] 필드가 있고(types/transfer.types.ts:365) lib/calc/transfer-tax-api.ts:87이 입주권 양도에서도 이를 전송하는데, 게이트는 이를 읽지 않는다. 게다가 분양권 입력 UI(PresaleRightsSection)는 HousesListSection 안에 있어 `householdHousingCount >= 2`일 때만 렌더되므로, 비과세 게이트가 요구하는 「주택 0채」 상태에서는 분양권 사실을 선언할 입력 경로 자체가 없다. 코드 주석과 UI 안내문도 법문에서 「또는 분양권」을 지운 채 「다른 주택 없음 + 1입주권만」으로 옮겨 적어 결함을 가린다.

**실패 시나리오** — 1세대가 주택 0채 + 조합원입주권 1개 + **분양권 1개**를 보유한 상태에서 그 입주권(양도가액 5.2억)을 양도한다. §89①4호 가목은 분양권 보유로 충족되지 않고 나목도 (분양권 보유 제외라) 충족되지 않으므로 과세대상이다. 그런데 앱은 전액 비과세로 산출세액 0원을 낸다. 두 경로 모두 실측: (a) 사용자가 분양권을 선언할 UI가 아예 없어 사실관계를 반영할 수 없고, (b) 마법사에서 주택 2채 상태로 분양권을 먼저 입력한 뒤 주택 수를 0으로 바꾸면 stale presaleRights가 그대로 엔진에 전송되는데도 게이트가 무시한다.

**세액 영향** — 프로브 실측(mock 세율, 입주권 5.2억·취득 1억·인가일 2018-10-23·권리가액 3억·청산금 납부 9천만): [A] 분양권 없음 산출세액 **0원** / [B] presaleRights 1건 전송 산출세액 **0원**(= 게이트 무반응 실증) / [C] 대조군 householdHousingCount=1(비과세 미적용) 산출세액 **58,910,000원**, 총세액(지방소득세 포함) **64,801,000원**. 즉 §89①4호 가목을 문언대로 적용하면 [B]는 [C]와 같은 과세 경로여야 하며 약 58,910,000원(총 64,801,000원)이 조용히 누락된다.

**수정 방향** — (1) 게이트에 분양권 조건을 추가한다 — `input.presaleRights?.some(p => p.type === "presale_right")`이면 비과세 미적용(입주권 개수는 이미 householdRightCount가 본다). (2) 주택 0채에서도 분양권을 선언할 수 있도록 입력 경로를 연다 — PresaleRightsSection의 렌더 게이트를 `householdHousingCount >= 2`가 아니라 isHousingLike 기준으로 바꾸거나, 입주권 양도 시 전용 「세대 보유 분양권 수」 필드를 둔다(입력 UI 없이 게이트만 열면 no-op이 된다). (3) 주석·UI 안내문의 법문 인용에 「또는 분양권」을 복원한다.

#### `P1-02` 다건(연간합산) 경로가 세대 보유 분양권·입주권 목록(presaleRights)을 ⑬·⑭ 양쪽에서 나르지 않아 중과 주택수가 조용히 줄어든다

| | |
|---|---|
| 위치 | `lib/calc/multi-transfer-tax-api.ts:216` |
| 조문 | 소득세법 §104⑦ · 소득세법 시행령 §167의3①·§167의11②1호 (2021.1.1. 이후 취득 분양권·입주권 주택 수 산입) — 조문 본문 미확인(코드 주석 인용) |
| 유형 | plumbing-14pt |

다건 마법사는 단건 마법사(TransferTaxCalculator)를 그대로 임베드하므로 Step4의 「분양권·입주권」 입력 위젯이 화면에 뜨고 `form.presaleRights`에 저장된다. ⑫ Zod(propertyBaseShape)도 `presaleRights`를 수락한다. 그런데 다건 ⑬(`buildPropertyPayload`)은 `houses`만 싣고 `presaleRights`를 아예 만들지 않고, 다건 ⑭(`multi/route.ts`의 base 객체)도 `houses: mapHousesToEngine(p.houses)`만 매핑하고 `presaleRights`를 매핑하지 않는다. 두 층 모두 비어 있어 한쪽만 고쳐도 도달하지 않는다. 단건 경로는 ⑬(transfer-tax-api.ts:584)·⑭(engine-input.ts:163) 양쪽에 배선돼 있어 같은 입력이 단건과 다건에서 다른 세액을 낸다. `validateMultiSupportedMode`에도 이 조합을 막는 항목이 없다.

**실패 시나리오** — 다건(연간합산) 계산기에서 건1 = 조정대상지역 주택(양도가 15억, 취득가 7억, 2015-01-10 취득, 2026-06-01 양도 — 중과 한시배제 종료일 2026-05-09 이후), 세대 보유 주택 목록 1건 추가, 「분양권·입주권」에 2022-02-01 취득 분양권 1건 입력.

· 화면에는 분양권이 정상 입력된 것으로 보인다.
· ⑬ 실측: buildPropertyPayload 결과에 `houses`는 2건 들어가지만 `presaleRights` 키 자체가 **없다**(hasOwnProperty=false).
· 결과: 엔진이 2주택으로 세어 §104⑦ 2주택 중과(+20%p)를 적용한다. 단건 계산기에 같은 입력을 넣으면 분양권이 산입돼 3주택 중과(+30%p)가 적용된다.

**세액 영향** — 실측 79,750,000원 과소. 위 시나리오를 엔진에 직접 태워 대조: presaleRights 없음 → 산출세액 458,510,000(세액합계 504,361,000) / presaleRights 1건 → 산출세액 538,260,000(세액합계 592,086,000). 차액 79,750,000원.

**수정 방향** — 두 층을 함께 배선해야 도달한다. ⑬ `lib/calc/multi-transfer-tax-api.ts`에 단건(transfer-tax-api.ts:86-88)과 같은 게이트(`isHousingLike(primaryKind) && form.presaleRights.length > 0`)로 `presaleRights`를 추가하고, ⑭ `app/api/calc/transfer/multi/route.ts`의 base 객체에 `presaleRights: mapPresaleRightsToEngine(p.presaleRights)`를 추가한다(헬퍼는 이미 `lib/api/transfer-route-multi-house.ts:104`에 있고 단건이 쓰는 것과 동일). 배선이 어려우면 `validateMultiSupportedMode`에서 명시 차단하는 것이 침묵 오산보다 안전하다(같은 파일의 기존 정책). 회귀 방어: `__tests__/lib/calc/multi-transfer-api-sync.test.ts`에 presaleRights 전달 케이스가 현재 0건이다.

#### `U1-01` ③-c 「비과세 보유 요건」 카드는 청산금 수령에서만 열리는데, `exemptionEligibleAtApproval`은 방향과 무관하게 송신돼 납부 방향에서 LTHD를 표1로 강등한다 (재개발APT는 그 값을 지울 입력 경로가 전무)

| | |
|---|---|
| 위치 | `components/calc/transfer/RedevelopmentBlock.tsx:210` |
| 조문 | 소득세법 §95② 별표2 (LTHD 표1·표2) · 서면2016-법령해석재산-2705 — 조문·예규 본문 미확인 (코드 주석 기준) |
| 유형 | ui-gate |

`ExemptionAtApprovalCard`(③-c)는 `redevIsSuccessorMember !== "yes" && redevSettlementDirection === "receive" && isOneHouseSingle` 3중 게이트에서만 렌더된다. 그런데 이 카드가 쓰는 `redevExemptionEligibleAtApproval`은 ④ API 변환에서 **방향 게이트 없이** 그대로 송신되고, 엔진은 `=== false`일 때 `isOneHouseSingle`을 강제 false로 내려 LTHD를 표2(최대 80%)에서 표1(최대 30%)로 강등한다. 사용자가 청산금 수령 상태에서 「수동: 미충족」을 고른 뒤 ③ 청산금 방향 라디오를 「납부」로 되돌리면(라디오 onChange는 `redevSettlementDirection` 한 키만 patch한다 — :186) 카드가 사라지면서 `"no"`가 그대로 남는다. 재개발APT에는 이 필드를 편집하는 다른 위젯이 없다 — `RedevelopmentRightExemptionSection`의 §⑥ 토글은 `assetKind === "right_to_move_in"`에서만 렌더되므로(:54-55·:94), 완공APT + 청산금 납부 상태에서는 **끄는 수단이 존재하지 않는다**. ⑧ validate도 통과시킨다(실측 null). 「UI 게이트가 유일 입력 경로를 제거」 패턴 그대로다.

**실패 시나리오** — 재개발APT · 1세대1주택 · 취득 2005-04-09 · 인가 2009-10-23 · 양도 2026-02-16 8억 · 권리가액 219,218,500 · 거주 120개월. ① 청산금 방향 「수령」에서 ③-c 「수동: 미충족」 선택 → ② 방향을 「납부」로 정정 → ③-c 카드 소멸, 저장값 `"no"` 잔존. payload `exemptionEligibleAtApproval: false`가 그대로 송신되고(실측), validate는 null(차단 없음, 실측), 엔진이 LTHD를 표1로 강등한다. 화면에는 그 선택을 되돌릴 위젯이 하나도 없다.

**세액 영향** — 실측(mock-rates, 위 시나리오): `undefined` → 산출세액 52,831,365 · 총부담 58,114,501 / `false` → 산출세액 143,081,180 · 총부담 157,389,298. **차이 +90,249,815원(산출세액) · +99,274,797원(총부담)**

**수정 방향** — 저장값 정규화가 정답이다(차단은 dead-end 확정 — 편집 위젯 자체가 없다). (a) ③ 청산금 방향 라디오 onChange에서 `receive → pay` 전이 시 `redevExemptionEligibleAtApproval: ""`를 **같은 단일 배치 patch**로 함께 비우고(다중키 stale spread 회피), (b) `calc-wizard-asset-migrate.ts`에 저장값 정규화(`settlementDirection !== "receive" && subject === "apt" → redevExemptionEligibleAtApproval = ""`)를 추가하며, (c) `buildRedevelopmentPayload`에도 같은 술어의 2중 게이트를 둔다(#1246의 `receiveOnlyMode` 2중 패턴과 동일). 술어는 한 곳에 두고 세 지점이 공유할 것.

#### `U1-02` 승계조합원 전용 「인가후 필요경비」가 원조합원으로 되돌린 뒤에도 payload에 남아 양도차익을 조용히 깎는다 (해제 경로 없음·마이그레이션 미정리)

| | |
|---|---|
| 위치 | `components/calc/transfer/RedevelopmentBlockCards.tsx:307` |
| 조문 | 소득세법 시행령 §166①1호 (인가후 양도차익 산식의 필요경비) — 본문 미확인 (필드 hint가 밝힌 근거) |
| 유형 | ui-gate |

`redevPostApprovalExpenses` 입력칸은 `asset.redevIsSuccessorMember === "yes"` 게이트 안에만 있다(RedevelopmentBlock.tsx:335). 그런데 `SuccessorMemberSection.handleToggle`은 「예」 진입 시에는 6개 필드를 명시적으로 정리하면서(`redevRightsValue: ""` 포함 — 「store 잔재 제거」 주석까지 달려 있다) **「아니오」로 되돌릴 때는 `redevIsSuccessorMember: "no"` 한 키만** 쓴다. API 변환은 `postApprovalExpenses`를 `isSuccessorMember` 게이트 없이 합산해 보내고, 엔진은 원조합원 3분할 산식에서 그 값을 인가후 양도차익에서 차감한다. 입주권으로 자산 종류를 바꿔도 마찬가지다 — `calc-wizard-asset-migrate.ts`의 입주권 정규화 5필드 목록(:624-630)과 `redevSubjectPatchForAssetKind`의 3필드 목록(AssetAreaRedevelopment.tsx:56-75) 어디에도 이 필드가 없다.

**실패 시나리오** — 재개발APT · 취득 2005-04-09 · 인가 2009-10-23 · 양도 2026-02-16 5.25억 · 권리가액 219,218,500 · 청산금 납부 92,781,500. ① ②-a 「승계조합원」 선택 → 「인가후 필요경비」에 5,000만 입력 → ② 「원조합원」으로 되돌림. 입력칸이 사라지지만 값은 남고, payload `postApprovalExpenses = 50,000,000`이 `isSuccessorMember: false`와 함께 송신된다(실측). 자산 종류를 입주권으로 바꿔도 `subject: "right"` + `postApprovalExpenses = 50,000,000`이 그대로 나간다(실측). 화면에는 그 금액을 지울 칸이 없다.

**세액 영향** — 실측(mock-rates, 위 시나리오·2주택 표1): stale 0 → 산출세액 67,480,121 · 총부담 74,228,133 · 양도차익 332,218,500 / stale 5,000만 → 산출세액 54,180,121 · 총부담 59,598,133 · 양도차익 282,218,500. **차이 −13,300,000원(산출세액) · −14,630,000원(총부담)**

**수정 방향** — `handleToggle("no")` 분기에서 `redevPostApprovalExpenses: ""`를 같은 단일 배치 patch에 포함하고(「예」 분기가 이미 쓰는 패턴 그대로), `calc-wizard-asset-migrate.ts`의 입주권 정규화 목록과 `redevSubjectPatchForAssetKind`의 세션 내 전환 정리 목록에도 추가한다(둘을 한쪽만 고치면 「새로고침해야 정상화되는」 상태가 된다 — AssetAreaRedevelopment.tsx:59-63이 같은 이유를 이미 적어 두었다). 엔진 도달 방지의 2중선으로 `buildRedevelopmentPayload`에서 `isSuccessorMember !== true`이면 `redevPostApprovalExpenses` 항을 합산에서 제외한다(자본적지출·양도비는 일반 입력 경로가 있으므로 그대로 둔다).

#### `U2-03` 승계조합원 입주권(및 §166 재개발 경로)의 취득가액에 공유 지분율이 적용되지 않아, 양도가액만 지분 안분되고 취득가액은 100% 그대로 나간다

| | |
|---|---|
| 위치 | `lib/calc/transfer-tax-api.ts:348` |
| 조문 | 소득세법 §100①(양도차익 = 양도가액 − 취득가액) · 소득세법 §97①1호 가목 |
| 유형 | plumbing-14pt |

`OwnershipRatioInput`의 규약은 「사용자 입력은 100% 기준 모든 금액(양도가·취득가·필요경비). API 변환 시 × ratio 자동 적용」이다(components/calc/transfer/OwnershipRatioInput.tsx:13). ④ 변환의 `acquisitionPrice` 삼항에서 `primaryFractional ? applyRatio(...)` 분기는 **가장 마지막 갈래**에만 붙어 있고, 그 앞의 승계조합원 갈래(`successorRightAcquisitionTotal(primary)`)와 §166 갈래(`parseAmount(primary.redevActualAcquisitionPrice)` / `fixedAcquisitionPrice`)에는 `applyRatio`가 없다. `transferPrice`는 정상적으로 `applyRatio(totalContractPrice, primaryRatio)`로 안분되므로, 지분율을 넣는 순간 양도차익이 지분율만큼 과소 계산된다. ⑧ validate(Step 0·1·2 모두 null)도 차단하지 않는다.

**실패 시나리오** — 승계조합원 조합원입주권(승계취득가 4억 + 추가분담금 1억 = 5억)을 1/2 공유지분으로 보유하고, 나머지 지분 자산 또는 다른 자산과 함께 2건 이상으로 계산(단건 지분은 validate가 별도 차단). ① 기본정보에서 공유 지분율 50/100 입력, 총 계약가 10억 → ⑧ validate Step0·1·2 모두 null → API body `transferPrice: 500,000,000` / `acquisitionPrice: 500,000,000` (실측). 대조군인 일반주택 1/2 지분은 `acquisitionPrice: 250,000,000`으로 정상 안분된다. ⇒ 양도차익이 250,000,000원 → 0원으로 과소 계산.

**세액 영향** — 실측 — 1/2 지분 승계 입주권: transferPrice 500,000,000 / acquisitionPrice 500,000,000 (100% 값 그대로). 대조군 일반주택 1/2 지분: transferPrice 500,000,000 / acquisitionPrice 250,000,000. ⇒ 양도차익 250,000,000원 과소. 원조합원 입주권(§166 갈래, `redevActualAcquisitionPrice` 5억)도 동일하게 acquisitionPrice 500,000,000로 실측되어 같은 결함을 공유한다.

**수정 방향** — 승계 갈래를 `primaryFractional ? applyRatio(successorRightAcquisitionTotal(primary), primaryRatio) : successorRightAcquisitionTotal(primary)`로 감싼다(§166 갈래도 같은 처리 — 별건으로 다룰 경우 최소한 ⑧에서 「지분 모드 + 입주권·재개발APT」를 명시 차단). 어느 쪽이든 ⑥ 사이드바(`transfer-per-asset-summary.ts`의 `directAcqRaw` 결과에 곱해지는 ratio)와 규칙이 같아야 한다.

#### `U2-05` 세대 보유 주택이 1채면 「분양권·입주권」 목록 입력 UI 자체가 렌더되지 않아 §104⑦2호(+20%p)·4호(+30%p) 판정이 영영 발화하지 않는다

| | |
|---|---|
| 위치 | `app/calc/transfer-tax/steps/Step4.tsx:638` |
| 조문 | 소득세법 §104⑦2호(1주택 + 조합원입주권 또는 분양권 1개 → +20%p) · §104⑦4호(주택+입주권+분양권 합 3 이상 → +30%p) · 소득세법 시행령 §167의11②1호 |
| 유형 | ui-gate |

`PresaleRightsSection`(세대 보유 분양권·입주권 입력)의 유일한 렌더 지점은 `HousesListSection`이고, 그 `HousesListSection`의 유일한 렌더 지점은 Step4의 `isHousingLike(primaryKind) && parseInt(form.householdHousingCount) >= 2` 게이트 안이다. 그런데 `householdHousingCount`는 「세대 보유 **주택** 수」이고 분양권·입주권은 명시적으로 별도 집계다(`house-count-divergence.ts:43` 「①은 "주택"만 센다」, 화면 문구 「(분양권·입주권은 별도 집계)」). 스토어 기본값은 "1"이고 선택지도 1/2/3+뿐이다. ⇒ 「1세대가 1주택과 분양권(또는 조합원입주권) 1개를 보유」한 정확히 §104⑦2호 사안에서 분양권을 입력할 화면이 없다. 엔진은 `presaleRights`를 받으면 정확히 그 중과를 판정하도록 이미 구현돼 있으므로(§104⑦2호 = `multi_house_2`, 4호 = `multi_house_3plus`), 입력 경로만 끊긴 no-op 상태다.

**실패 시나리오** — 1세대가 조정대상지역 주택 1채 + 분양권 1개(2022-03-01 취득, 수도권)를 보유한 상태에서 그 주택을 2026-06-01(중과 한시배제 종료 후)에 양도. 보유 상황 단계에서 「세대 보유 주택 수」를 사실대로 1채로 고르면 ④ 주택수·중과 판정 섹션 안의 「다른 보유 주택 목록 / 분양권·입주권」 블록이 렌더되지 않아 분양권을 입력할 곳이 없다 → `presaleRights: []`로 전송 → §104⑦2호 +20%p가 적용되지 않는다. (사용자가 게이트를 통과시키려고 「주택 수 2채」를 고르면 §89①3호 1주택 요건 등 다른 판정이 사실과 달라진다.)

**세액 영향** — 실측(mock 세율 · 조정대상지역 · 양도 9억/취득 5억 · 2019-05-01 취득 · 2026-06-01 양도): 분양권 0개 → 세율 0.40, 장특 56,000,000, 총세액 121,726,000원 / 1주택+분양권 1개 → 세율 0.60(`multi_house_2`), 장특 0, 총세액 233,816,000원(+112,090,000) / 1주택+분양권 2개 → 세율 0.70(`multi_house_3plus`), 총세액 277,541,000원(+155,815,000).

**수정 방향** — `PresaleRightsSection`의 렌더 게이트를 `householdHousingCount >= 2`에서 분리한다 — 분양권·입주권은 주택 수와 다른 축이므로 `isHousingLike(primaryKind) && !surchargeSuspended`만으로 노출하는 것이 축에 맞다(전송 게이트 `transfer-tax-api.ts:87`은 이미 `isHousingLike`만 본다 — ⑤와 ④를 같은 술어로 맞추는 셈). 게이트를 넓히면 ④ 주택수·중과 판정 섹션 자체의 진입 조건(`Step4.tsx:631-633`)도 함께 손봐야 한다.

### 5.3 🟡 medium (22건)

#### `C1-03` 소득세법 §89①4호 「나」목(1조합원입주권 + 1주택, 그 주택 취득일부터 3년 이내 입주권 양도) 비과세 경로가 전무 — 요건 충족 사안이 전액 과세된다

| | |
|---|---|
| 위치 | `lib/tax-engine/transfer-tax-redevelopment-transforms.ts:311` |
| 조문 | 소득세법 §89①4호 나목 (본문 실독) |
| 유형 | statute-mismatch |

§89①4호는 「가」목(양도일 현재 다른 주택 또는 분양권을 보유하지 아니할 것)과 「나」목(양도일 현재 1조합원입주권 외에 1주택을 보유한 경우로서 분양권 미보유 + 그 1주택 취득일부터 3년 이내 입주권 양도)의 **어느 하나**를 충족하면 비과세한다. 코드의 `applyOneRightExemption`은 `input.householdHousingCount !== 0`이면 즉시 되돌아가므로 「가」목만 구현돼 있고, 「나」목 경로는 엔진·입력 어디에도 없다(비교 대상인 「해당 1주택의 취득일」을 담을 필드도 없다).

**실패 시나리오** — 원조합원이 2010-04-09 취득 종전주택으로 얻은 조합원입주권(권리가액 5억, 인가일 2018-10-23, 청산금 5천만 납부)을 2024-06-01에 9억(12억 이하)에 양도하면서, 세대가 2023년에 취득한 주택 1채를 보유하고 분양권은 없는 경우. §89①4호 나목의 3년 요건을 충족하지만 코드는 `householdHousingCount = 1`이라는 이유만으로 게이트에서 되돌아가 전액 과세한다. 프로브 실측: [가목] householdHousingCount=0 → totalTax=0, oneRightExemptionApplied=true / [나목] householdHousingCount=1 → totalTax=166,606,000, oneRightExemptionApplied=undefined.

**세액 영향** — 실측 Δ = 166,606,000원 (mock 세율 makeMockRates 기준, 양도가 900,000,000 · 취득가 300,000,000 · 권리가액 500,000,000). 방향은 **과대과세**다. 12억 초과 사안에서는 §89①4호 각 목 외의 부분 단서에 따라 안분과세가 돼야 하므로 차액이 달라진다.

**수정 방향** — 나목은 「해당 1주택의 취득일」과 「분양권 미보유」라는 새 사실 2개를 요구하므로 엔진 입력·⑤ 입력 UI·⑧ validate·⑫ Zod·⑭ route 매핑까지 신규 배선이 필요하다(엔진만 열면 no-op). 또한 나목 괄호의 「3년 이내에 양도하지 못하는 경우로서 대통령령으로 정하는 사유」(시행령 §156의2 위임)를 어디까지 볼지 결정이 선행돼야 하므로, 도메인 오너 판단 후 별도 설계로 착수할 것.

#### `C1-04` 사이드바 ⑥ — §166 환산 모드에서 「계산 후 표시」로 안내한 취득가액·필요경비가 계산 후에도 «-»로 남는다

| | |
|---|---|
| 위치 | `lib/stores/transfer-per-asset-summary.ts:469` |
| 조문 | 소득세법 시행령 §166③ (환산취득가) · §163⑥ (개산공제) |
| 유형 | plumbing-14pt |

재개발·입주권(§166) 경로의 사이드바 취득가액은 `directAcqRaw`가 실가 필드(`redevActualAcquisitionPrice`)만 읽으므로 환산 모드에서는 항상 0이다(:150-157). 계산 전에는 `acqPending = true`로 「계산 후 표시」를 안내하지만, 계산 후 fallback 체인이 타는 분기는 `singleResult.estimatedBase ?? 0`인데 §166 결과 객체는 `usedEstimatedAcquisition: true`만 싣고 `estimatedBase`·`expenses`·`acquisitionPrice`를 전혀 싣지 않아 다시 0이 된다. 렌더러는 `value > 0`이 아니고 `pending`도 아니면 «-»를 그리므로, 약속했던 값이 끝내 나타나지 않는다.

**실패 시나리오** — 사례 37형(토지 출자 조합원입주권 + §166③ 공시지가 환산): 양도가 520,000,000 / 취득일 2002-04-09 / 인가일 2018-10-23 / 권리가액 300,000,000 / 청산금 납부 90,000,000 / 취득시 공시지가 60,000,000 · 인가시 200,000,000. 프로브 실측 — 계산 전 사이드바 「인가전 분 취득가액」 = acqPrice 0·acqPending true → 화면 «계산 후 표시». 엔진 계산 후 `redevelopmentDetail.preApproval.apportionedAcquisition = 90,000,000`(§166③ 환산취득가)인데 사이드바는 acqPrice 0·acqPending false → 화면 «-». 필요경비도 같은 이유로 «-»(엔진 branch expenses에 §163⑥ 개산공제 1,800,000이 들어 있으나 result.expenses는 undefined). 실가 모드에서는 `redevActualAcquisitionPrice`가 그대로 표시되므로 **환산 모드에서만** 발생한다.

**세액 영향** — 세액 무영향(표시 전용). 다만 ⑥ 사이드바가 ⑦ 결과·신고서와 다른 값을 보여주는 dual-truth이며, 「계산 후 표시」라는 안내가 이행되지 않아 입력 누락으로 오독될 수 있다.

**수정 방향** — 엔진이 이미 갖고 있는 값을 사이드바가 읽게 하면 된다 — `singleResult.redevelopmentDetail`이 있으면 `redevBranchTotals`(components/calc/results/transfer/redev-acquisition-inverse.ts)와 `inverseRedevAcquisition`을 그대로 재사용해 합계 취득가액·필요경비를 채우는 것이 결과뷰·신고서와 **같은 인자·같은 leaf**를 쓰는 방향이다(dual-truth 재발 방지). 최소 조치로는 `acqPending`을 해소하지 못한 경우 «-» 대신 「계산 후 표시」를 유지하는 것도 오독을 줄이지만, 값 자체가 존재하므로 표시가 정답이다.

#### `C1-05` 사이드바 ⑥ — receiveOnly(청산금 수령분 단독신고)에서 신고단위 양도가액이 아니라 신축APT 총 양도가액이 표시된다

| | |
|---|---|
| 위치 | `lib/stores/transfer-per-asset-summary.ts:422` |
| 조문 | 소득세법 시행령 §166① 본문·§166①2호 가목 (청산금 수령분 단독 산식) — 코드 주석 인용, 이번 리뷰에서 §166 본문은 타 차원(E1·L1)이 실독 확인 |
| 유형 | plumbing-14pt |

「청산금 수령분 단독 신고」(사례 46)에서는 신고단위 양도가액이 청산금 수령액이고 양도일이 소유권이전 고시일 익일이다. ④ API 변환(`transfer-tax-api.ts:333-342`)과 ⑦ 결과뷰(`resolveReceiveOnlyDisplay`)는 둘 다 이 규칙을 적용하는데, ⑥ 사이드바만 폼 원본 `actualSalePrice`(= 계약 총액)를 그대로 표시하고 그 값을 자산 합계(`totalSalePrice`)에도 넣는다.

**실패 시나리오** — 완공APT 자산 + `redevReceiveOnlyMode = "yes"` + 청산금 수령 300,000,000 + 계약 총액 1,200,000,000 + 소유권이전 고시일 2023-05-02. 프로브 실측 — 사이드바 양도가액 = 1,200,000,000 (합계도 동일). 같은 폼에서 ④가 엔진에 보내고 ⑦이 표시하는 신고단위 양도가액은 300,000,000이다. 사용자는 사이드바에서 12억을, 결과·신고서에서 3억을 보게 된다.

**세액 영향** — 세액 무영향(⑥은 표시 전용이며 엔진 입력은 ④가 만든다). 표시 축의 ⑥↔④/⑦ 불일치.

**수정 방향** — 사이드바가 폼에서 receiveOnly를 재판정하지 말고, ④가 쓰는 것과 **같은 술어·같은 인자**로 신고단위 양도가액을 얻게 한다(`receive-only-display.ts`는 엔진 결과를 인자로 받으므로 계산 후에는 그대로 재사용 가능하고, 계산 전에는 ④의 `isReceiveOnly` 판정식을 leaf로 추출해 공유). 술어만 공유하고 인자가 갈리면 같은 병이 재발한다(memory `feedback_shared_predicate_argument_parity`).

#### `E1-05` 완공APT + 청산금 수령 분기에서 인가전 분 필요경비만 안분되지 않아 신고서 행이 자기모순

| | |
|---|---|
| 위치 | `lib/tax-engine/redevelopment.ts:583` |
| 조문 | 소득세법 시행령 §166②2호(§166①2호 나목 준용) — 본문 확인 |
| 유형 | engine-result-display |

인가전 분 표시용 필요경비를 §166①2호 나목 비율로 안분하는 게이트가 `isRight && settlementDirection === "receive"`로 좁혀져 있다. 그런데 나목 안분은 `computeAptReceive`(redevelopment-split.ts:355-366)에도 그대로 있어 subject="apt" + 수령 조합도 양도가액·취득가액·양도차익이 모두 (평가액−청산금)/평가액 비율로 축소된다. 필요경비만 원액으로 남아 신고서 인가전 분 열이 「양도가액 − 취득가액 − 필요경비 ≠ 양도차익」으로 어긋난다. 2026-08-13에 입주권 경로에 대해 고친 것과 **같은 결함이 자매 분기에 남아 있는** 형태다(:576-577 주석이 「납부·완공APT 분기는 안분이 없어 원액이 그대로 정합이다」라고 적었으나 완공APT **수령** 분기에는 안분이 있다 — 주석 자체가 사실과 다르다).

**실패 시나리오** — 재개발APT · 주택 출자 · 청산금 **수령** 200,000,000 · 권리가액 800,000,000(안분비율 0.75) · 실가 취득 100,000,000 · 양도 2,000,000,000 · 인가전 분 필요경비 20,000,000. 신고서 인가전 분 열: 양도가액 600,000,000 · 취득가액 75,000,000 · 필요경비 **20,000,000** · 양도차익 510,000,000 → 600,000,000 − 75,000,000 − 20,000,000 = 505,000,000 ≠ 510,000,000. 동일 입력을 자산 종류만 「입주권」으로 바꾸면 필요경비가 15,000,000(=20,000,000×0.75)으로 안분되어 행이 맞는다.

**세액 영향** — 세액 불변(양도차익 산정에는 원액 차감 후 안분이 적용되어 실효 차감액은 이미 안분값이다). 신고서 필요경비 열이 5,000,000 과대 표시 — 프로브 실측(delta −5,000,000).

**수정 방향** — `redevelopment.ts:583`의 게이트에서 `isRight &&`를 제거해 `settlementDirection === "receive"`만 보게 한다(§166②2호가 ①2호 나목을 준용하므로 apt·right 모두 같은 안분이다). :577의 「완공APT 분기는 안분이 없어」 주석도 함께 정정할 것 — 지금은 주석이 오판의 근거로 남아 있다.

#### `E1-06` §166②1호 인가후 필요경비가 두 표시 분기에 각각 전액 부착 — 신고서 필요경비 열 2배 + 행 자기모순

| | |
|---|---|
| 위치 | `lib/tax-engine/redevelopment.ts:628` |
| 조문 | 소득세법 시행령 §166②1호 (본문 확인) |
| 유형 | engine-result-display |

완공APT + 청산금 납부 분기에서 `postApprovalExistingHouse.expenses`(:628)와 `settlement.expenses`(:672)에 `postApprovalExpenses`가 **각각 전액** 들어간다. §166②1호는 인가후양도차익(= 양도가액 − 분양가 − 인가후 필요경비)을 권리가액:청산금 비율로 나누므로 실효 필요경비는 이미 그 비율로 안분된 상태다. 표시만 원액 2개로 두면 신고서 필요경비 합계가 실제의 2배가 되고, 두 행 모두 「양도가액 − 취득가액 − 필요경비 ≠ 양도차익」이 된다. E1-05와 같은 계열(안분된 차익 옆에 원액 필요경비)이지만 분기와 축이 다르다.

**실패 시나리오** — 사례 45(재개발APT · 주택 출자 · 납부 300,000,000 · 권리가액 650,000,000 · 분양가 950,000,000 · 인가후 필요경비 9,000,000 · 양도 1,500,000,000). 신고서 필요경비: 인가전 0 + 인가후 기존주택분 **9,000,000** + 청산금분 **9,000,000** = 합계 **18,000,000**(실제 9,000,000). 행 검산도 어긋난다 — 인가후 기존주택분 1,026,315,789 − 650,000,000 − 9,000,000 = 367,315,789 ≠ 양도차익 370,157,894(차 −2,842,105), 청산금분 473,684,210 − 300,000,000 − 9,000,000 = 164,684,210 ≠ 170,842,106(차 −6,157,896). 두 delta의 절댓값 합이 정확히 9,000,000으로, 서로의 몫을 중복 차감한 결과임을 보여준다.

**세액 영향** — 세액 불변(엔진은 인가후 필요경비를 1회만 차감한다). 신고서 필요경비 합계가 정확히 2배 과대 표시(9,000,000 → 18,000,000, 실측).

**수정 방향** — `postApprovalExpenses`를 §166②1호와 같은 비율(권리가액/분양가, 청산금/분양가)로 안분해 두 행에 나눠 붙이고, floor 잔차는 한쪽에 흡수시켜 합이 원액과 일치하게 한다(이 저장소의 `feedback_floor_residual_absorption` 규약). subject="apt" + pay 전용 처리이며 입주권 경로(:672가 §166①2호 가목 전액 차감이 맞는 곳)는 건드리지 말 것.

#### `E1-07` 환산 모드인데 §166③ 분모(D) 미입력이면 취득가액 0으로 침묵 fallback — ⑫ Zod에 대응 refine 부재

| | |
|---|---|
| 위치 | `lib/tax-engine/redevelopment-split.ts:152` |
| 조문 | 소득세법 시행령 §166③ (본문 확인 — 분모 「관리처분계획등 인가일 현재 … 기준시가」) |
| 유형 | plumbing-14pt |

`computeRedevelopmentSplit` Step A에서 `computeRedevelopmentValuation`이 `null`을 반환하면(= `managementDisposalHousingPrice` 미입력/0) 취득가액을 **0으로 두고 계속 계산**한다. 개산공제도 `valuationMeta.method === "actual"` 게이트에 걸려 0이 되므로 인가전 양도차익이 권리가액 전액이 된다. 코드 주석 스스로 「validation에서 차단되어야 함」이라 적었지만 그 차단은 클라이언트 ⑧에만 있고 서버 ⑫ Zod에는 대응 refine이 없다(실측: `redevelopmentSchema.safeParse`가 D 없는 페이로드를 통과시킴). 같은 상황에서 sibling 환산 서브엔진 둘은 `TaxRateNotFoundError`를 던진다(`redevelopment-land-contribution.ts:116-120`, `redevelopment-housing-contribution.ts:136-145`) — 본류만 침묵한다.

**실패 시나리오** — 클라이언트를 거치지 않은 API 요청(또는 ⑧ 검증을 우회하는 조립 경로)으로 `useEstimatedAcquisition: true` · `redevelopment.managementDisposalHousingPrice` 없음 · 나머지는 사례 44와 동일하게 전송. 인가전 취득가액 0 · 개산공제 0으로 총 양도차익이 288,445,917 → 432,218,500이 되고, 오류 없이 결과가 반환된다.

**세액 영향** — 산출세액 55,836,614 → **94,081,180 (38,244,566원 과대)**, 세액합계 61,420,275 → 103,489,298 — 프로브 실측(mock 세율). 어떤 오류·경고도 없이 결과 화면까지 도달한다.

**수정 방향** — 두 층에서 막는다. (1) 엔진: `valuationResult == null`이면 sibling과 동일하게 `TaxRateNotFoundError`를 던져 「취득가액 0으로 성공 반환」이라는 세 번째 진실을 없앤다. (2) ⑫: `transfer-tax-schema-refines.ts`의 redevelopment refine에 「`useEstimatedAcquisition === true` + 토지·주택 전용 분기가 아닌 경우 `managementDisposalHousingPrice > 0` 필수」를 추가해 ⑧ validate(transfer-tax-validate-redev.ts:239-243)와 동기화한다.

#### `E2-07` Zod refine(⑩)이 청산금 방향 조건 없이 §164⑤ PHD 2필드를 요구해 housing+입주권+납부+환산 조합이 400으로 막힌다 (⑧ validate는 통과·⑤ UI는 칸을 렌더하지 않음)

| | |
|---|---|
| 위치 | `lib/api/transfer-tax-schema-refines.ts:262` |
| 조문 | 소득세법 시행령 §166③ · §164⑤ |
| 유형 | validate-sync |

엔진 dispatch(`redevelopment.ts:167-176`)와 클라이언트 validate(`transfer-tax-validate-redev.ts:223-227`)와 UI 게이트(`AssetAreaRedevelopment.tsx:112-119`)는 모두 §164⑤ PHD 2-point 분기를 `originalAssetType=="housing" && subject=="right" && settlementDirection=="receive" && useEstimatedAcquisition`으로 판정하는데, Zod refine만 `settlementDirection` 조건이 빠져 있다. 따라서 청산금을 **납부**하는 housing 출자 입주권 + 환산 조합은 UI가 일반 환산 카드(D·취득당시 라목값)를 렌더하고 클라이언트 validate도 통과시키지만, 서버 Zod가 화면에 존재하지 않는 `housingStdPriceAtAcq`/`housingStdPriceAtApproval`을 요구해 400으로 거부한다. 사용자는 요구받은 칸을 채울 방법이 없다.

**실패 시나리오** — 단독주택 출자 → 조합원입주권 양도(2026-03-02), 관리처분 인가 2016-10-23 권리가액 300,000,000, 청산금 50,000,000 **납부**, 취득가액 확인 불가로 환산 선택, D(관리처분 라목값) 200,000,000·취득당시 라목값 120,000,000 입력. 화면에는 PHD 2-point 칸이 없고 「계산하기」는 활성화되지만 API가 「단독주택 출자 환산취득가 — 취득당시 개별주택가격(§164⑤ 분자) 필수」로 거부한다. 어느 칸을 채워야 하는지 화면에 없으므로 영구 dead-end다.

**세액 영향** — 세액 자체는 변하지 않는다 — 계산이 아예 수행되지 않는다(HTTP 400). 실측으로 확인한 것은 차단이지 오산이다.

**수정 방향** — `isHousingEstimated`에 `rd.settlementDirection === "receive"`를 추가해 엔진 dispatch·⑧ validate·⑤ UI 게이트와 같은 술어로 맞출 것. 세 층이 이미 같은 조건을 쓰고 있으므로 공용 술어 leaf로 추출해 재발을 막는 편이 낫다.

#### `E3-05` 비과세 마스킹 3곳이 `lthdHoldingPart`/`lthdResidencePart`를 함께 갱신하지 않아 신고서 서식의 「장특공제 = 보유분 + 거주분」이 깨진다

| | |
|---|---|
| 위치 | `lib/tax-engine/transfer-tax-redevelopment-transforms.ts:230` |
| 조문 | 소득세법 §95② 표2 (보유기간별·거주기간별 공제율) |
| 유형 | engine-formula |

같은 파일의 `applyLthdExclusion`(:36-51)은 「분기 3개와 합계를 함께 0으로」 만들면서 `lthdHoldingPart`·`lthdResidencePart`도 명시적으로 0으로 덮는다(:41-42, 주석으로 그 이유까지 적혀 있다). 그런데 나머지 세 변환은 `lthd`만 건드리고 두 분해 필드를 원값 그대로 남긴다 — `applySettlementExemption`의 `newSettlement`(:230-236: gain/lthd만 0), `applyOneRightExemption`의 전액 비과세 `maskBranch`(:319-325: gain/lthd만 0), 같은 함수의 12억 초과 `scaleBranch`(:340-356: lthd만 축소). 신고서 양식은 `FilingFormTableRedevRows.ts:118-125`에서 `b.lthdHoldingPart ?? b.lthd`를 그대로 읽어 열별·합계 보유분/거주분을 채우고, 합계 장특공제는 `FilingFormTableHelpers.ts:647`의 `result.longTermHoldingDeduction`을 쓰므로 같은 표 안에서 두 값이 어긋난다.

**실패 시나리오** — (A) 사례47류 — 완공APT · 1세대1주택 · 양도가 11억 · 인가일 평가액 8억(≤12억) · 청산금 수령 2억 · `exemptionEligibleAtApproval=true` · 거주 252개월. 청산금 열: 장기보유특별공제 0원인데 보유 기간분 37,500,000원이 표시되고, 합계 행은 장특공제 700,000,000 vs 보유분+거주분 737,500,000. (B) 1세대1입주권 · 양도가 20억(12억 초과 안분): 인가전 열 공제 24,000,000 vs 보유분 60,000,000, 합계 차 36,000,000. (C) 1세대1입주권 · 양도가 5.2억(전액 비과세): 공제 0 vs 보유분 60,000,000, 합계 차 60,000,000.

**세액 영향** — 세액 불변(표시 전용). 신고서 양식 표의 내부 정합만 깨진다 — 실측 차이 (A) 37,500,000원 (B) 36,000,000원 (C) 60,000,000원.

**수정 방향** — 세 곳 모두 `applyLthdExclusion`의 zeroBranch와 같은 규약을 따른다 — 마스킹(`applySettlementExemption`·`maskBranch`)에서는 `lthdHoldingPart`/`lthdResidencePart`가 정의돼 있을 때만 0으로 덮고, 12억 안분 `scaleBranch`(:340-356)는 `applyHighValueAllocation`의 `holdingFraction` 재산정 로직(:85-102)을 그대로 쓴다. 분해 필드가 undefined인 분기는 undefined로 남긴다(「분해 없음」과 「분해했는데 0」의 구분 유지).

#### `L1-01` 소득세법에 존재하지 않는 「§95② 별표2 [비고] 1호」를 30여 곳에서 인용 — 결과 배지·신고서·상세명세서에 그대로 노출

| | |
|---|---|
| 위치 | `lib/tax-engine/legal-codes/transfer-house.ts:251` |
| 조문 | 소득세법 §95② 본문 괄호 (「조합원입주권을 양도하는 경우에는 … 관리처분계획 인가 및 … 사업시행계획인가 전 토지분 또는 건물분의 양도차익으로 한정한다」) |
| 유형 | statute-mismatch |

REDEVELOPMENT.LTHD_RIGHT_TABLE1_ANNOTATION이 「소득세법 §95 ② 별표2 [비고] 1호」로 정의돼 있으나, 현행 소득세법에는 별표2 자체가 없다(별표 전수 18건 실측 — 전부 시행령·시행규칙 위임 별표이고 LTHD 표1·표2는 §95② 조문 본문 안의 표다). 「인가 전 토지분 또는 건물분의 양도차익으로 한정」이라는 제한은 §95② **본문 괄호**에 있다. 계산 결과(인가후 분 LTHD=0)는 법령상 옳고 인용만 허구다. 이 문자열은 엔진 주석·타입·결과 카드 배지·신고서 행·상세명세서 legalBasis 등 30여 곳에 복제돼 있으며 그중 6곳이 사용자에게 직접 노출된다.

**실패 시나리오** — 입주권 양도(subject="right") 결과 화면을 열면 「인가후 분 LTHD 적용 없음」 근거 배지로 「§95② 별표2 [비고] 1호」가 표시된다. 사용자가 이 인용을 법제처에서 찾으면 소득세법에 별표2가 없어 근거를 확인할 수 없고, 신고서·상세명세서 PDF에도 같은 허구 인용이 인쇄된다.

**세액 영향** — 세액 무영향 (계산 결과는 §95② 본문 괄호와 일치). 표시·근거 인용만 오류.

**수정 방향** — 상수값을 「소득세법 §95② 본문 괄호」로 교체하고(예: `LTHD_RIGHT_PROVISO`와 문구 통일), 「별표2 [비고] 1호」 문자열 30여 곳을 일괄 치환한다. UI·신고서·상세명세서는 legal-codes 상수를 참조하도록 하드코딩을 걷어내면 재발이 막힌다.

#### `L1-02` §89①4호의 12억 단서를 「가목 단서」로 인용 — 실제로는 「각 목 외의 부분 단서」이고 가목에는 단서가 없다

| | |
|---|---|
| 위치 | `lib/tax-engine/transfer-tax-redevelopment.ts:214` |
| 조문 | 소득세법 §89①4호 각 목 외의 부분 단서 (「다만, 해당 조합원입주권의 양도 당시 실지거래가액이 12억원을 초과하는 경우에는 양도소득세를 과세한다」) · §95③ |
| 유형 | statute-mismatch |

1세대1입주권 비과세의 12억 초과 안분 근거를 코드 전반이 「§89①4호 가목 단서」로 적는다. 법문상 12억 단서는 4호 **각 목 외의 부분(본문)** 끝에 붙어 있고, 가목은 「양도일 현재 다른 주택 또는 분양권을 보유하지 아니할 것」 한 문장뿐으로 단서가 없다. 소득세법 §95③이 스스로 「같은 항 제4호 **각 목 외의 부분 단서**에 따라 … 제외되는 조합원입주권」이라고 지목해 확정된다. 같은 오기가 결과 카드 배지·산출근거 산식 문구로 사용자에게 노출된다.

**실패 시나리오** — 입주권 양도가액 15억으로 1세대1입주권 비과세 요건을 충족하면 결과 화면 산출근거에 「§89①4호 가목 단서 + §95③ — 전체 양도차익 … × (양도가액 − 12억)/양도가액」이 표시된다. 인용대로 §89①4호 가목을 찾아가면 단서가 없어 근거 확인이 되지 않는다(같은 오기가 신고 근거 문구로 인쇄된다).

**세액 영향** — 세액 무영향 (안분 산식 자체는 §95③·영 §160과 일치). 표시·근거 인용만 오류.

**수정 방향** — 「§89①4호 가목 단서」를 「§89①4호 각 목 외의 부분 단서」로 정정한다. 같은 축의 types/transfer-redevelopment.types.ts:307 「§89①4호 가목 → §89①3호 가목 요건」도 §89①3호가목 참조가 4호 각 목 외의 부분에 있으므로 함께 고친다.

#### `L1-04` §166③ 환산 산식(권리가액 × 취득당시PHD/인가당시PHD)을 §164⑤로 인용 — §164⑤에는 그 산식도, 인용부호로 적은 「양도 당시 기준시가」 문언도 없다

| | |
|---|---|
| 위치 | `lib/tax-engine/types/transfer-redevelopment.types.ts:141` |
| 조문 | 소득세법 시행령 §166③ (「기존건물과 그 부수토지의 평가액 × 취득일 현재 … 법 제99조제1항제1호에 따른 기준시가 ÷ 관리처분계획등 인가일 현재 … 기준시가」) / 대비: 시행령 §164⑤ (「법 제99조제1항제1호나목에 따른 기준시가가 고시되기 전에 취득한 건물 … 최초로 고시한 기준시가 × … 국세청장이 고시한 기준율」) |
| 유형 | statute-mismatch |

사례 38·39(주택 출자 입주권 환산) 경로의 환산취득가 산식이 타입 주석·store 필드 주석·결과 카드에서 「§164⑤」로 인용돼 있다. 그러나 §164⑤은 건물 기준시가(법 §99①1호 나목) 미고시 취득 건물의 「최초고시 기준시가 × 국세청장 고시 기준율」이라는 전혀 다른 산식이고, 2-point 분자/분모 구조도 「양도 당시 기준시가」라는 문구도 없다. 실제 근거는 §166③이며, 정작 구현 파일(redevelopment-housing-contribution.ts)은 같은 산식을 §166③으로 올바르게 인용해 좌우가 어긋난다. 결과 카드가 「− 환산취득가 (§164⑤: 권리가액 × A / B)」로 사용자에게 그대로 보여준다.

**실패 시나리오** — 주택을 조합에 출자하고 청산금을 수령한 원조합원이 취득가액을 확인할 수 없어 환산을 선택하면(originalAssetType="housing" + subject="right" + settlementDirection="receive" + useEstimatedAcquisition=true), 결과 카드에 「− 환산취득가 (§164⑤: 권리가액 × 취득당시 개별주택가격 / 인가당시 개별주택가격)」이 표시된다. §164⑤을 찾아가면 「최초고시 기준시가 × 기준율」이라는 다른 산식이 나와 근거가 확인되지 않는다.

**세액 영향** — 세액 무영향 (산식·구현은 §166③과 일치). 표시·근거 인용만 오류이며, 같은 산식을 두 조문으로 인용하는 내부 불일치가 후속 정정 시 오독 위험을 만든다.

**수정 방향** — 주택 출자 환산 경로의 §164⑤ 인용을 §166③으로 정정한다(토지 출자 경로는 이미 §166③으로 올바르다). types:141의 인용부호 문구 「§164⑤ "양도 당시 기준시가"」는 §166③의 「관리처분계획등 인가일 현재 … 기준시가」로 바꾼다. 결과 카드의 하드코딩 문자열도 함께 고친다.

#### `L1-06` 결과 카드가 조합원입주권을 「§94①2호 기타자산」이라 표시 — §94①2호는 「부동산에 관한 권리」이고 기타자산은 §94①4호

| | |
|---|---|
| 위치 | `components/calc/results/transfer/RedevelopmentDetailCard.tsx:195` |
| 조문 | 소득세법 §94①2호 가목 (「부동산에 관한 권리」 중 「부동산을 취득할 수 있는 권리」) / 대비: §94①4호 (「기타자산」) |
| 유형 | statute-mismatch |

재개발 결과 카드 3곳이 조합원입주권의 LTHD 미적용 근거를 「§94①2호 (조합원입주권은 기타자산)」로 안내한다. 소득세법 §94①2호는 「부동산에 관한 권리」(가·나·다목뿐)이고 「기타자산」은 §94①**4호**(영업권·시설물이용권·과점주주 주식·이축권)다. 조합원입주권은 §94①2호 가목이며, §95②은 오히려 「제94조제1항제2호가목에 따른 자산 중 조합원입주권」을 **LTHD 대상에 포함**시킨 뒤 인가 전 분으로만 한정한다. 엔진 계산은 옳고 표시 문구만 자산 분류를 잘못 안내한다.

**실패 시나리오** — 입주권 양도 결과 화면에서 「청산금 분 LTHD = 0」의 근거를 확인하면 「§94①2호 (조합원입주권은 기타자산)」이라 표시된다. 기타자산(§94①4호)은 §104⑤ 그룹·이월과세 대상 여부·LTHD 배제 근거가 모두 달라, 사용자가 이 안내를 근거로 다른 판단(예: 이월과세 비대상)을 하면 오도된다.

**세액 영향** — 세액 무영향 (엔진은 propertyType="right_to_move_in"을 §94①2호가목 자산으로 정확히 다룬다). 표시 문구만 자산 분류 오기.

**수정 방향** — 「기타자산」 표현을 삭제하고 「§94①2호 가목 — 부동산을 취득할 수 있는 권리(토지·건물이 아닌 자산)」로 바꾼다. 인가후 분 LTHD=0의 정확한 근거는 §95② 본문 괄호(「조합원입주권을 양도하는 경우에는 … 인가 전 토지분 또는 건물분의 양도차익으로 한정한다」)이므로 그쪽으로 문구를 통일한다.

#### `P2-04` isRedevPhdSectionActive에 「토지 출자」 배제 게이트 누락 — 출자자산을 토지로 바꿔도 §164⑦ 건물기준시가 계산서가 결과탭·이력·PDF에 남는다

| | |
|---|---|
| 위치 | `lib/calc/redev-phd-trigger.ts:95` |
| 조문 | 소득세법 시행령 §164⑦ |
| 유형 | ui-gate |

`isRedevPhdSectionActive`는 §164⑦ PHD 환산 섹션이 「지금도 열려 있는가」를 판정해 건물기준시가 스냅샷 계산서의 노출·이력 저장을 게이트한다(building-std-snapshot-applicability.ts:169). JSDoc이 5중 게이트를 표로 명시하지만 실제 렌더 경로에는 **여섯 번째 게이트**가 있다 — `RedevelopmentValuationSection.tsx:179`의 `isLand ?` 삼항이 `redevOriginalAssetType === "land"`이면 `LandContribValuationContent`(§166③ 단가 2칸)를 대신 렌더해 §164⑦ PHD 블록과 `snapshotKey={`bsp-${assetId}-redev-phd`}` 런처(:292)를 통째로 없앤다. 그 조건이 술어에 없어, 사용자가 ② 출자 자산을 「주택」에서 「토지」로 바꾸면 화면에서는 §164⑦ 블록이 사라지는데 계산서는 그대로 남는다 — 이 모듈 헤더가 스스로 경계하는 「화면에는 블록이 없는데 계산서는 나오는」 어긋남이다.

**실패 시나리오** — 재개발APT + 환산 모드 + 취득일 2003-05-10 + 최초공시일 2005-04-30로 §164⑦ PHD 블록을 열어 「건물 기준시가 계산」 모달로 계산서를 저장한 뒤, ② 출자 자산을 「토지」로 정정한다. → 화면의 §164⑦ 블록은 사라지지만 `isRedevPhdSectionActive` = true, `isBuildingStdSnapshotApplicable("bsp-a1-redev-phd", inputData)` = true가 되어 결과탭 `BuildingStdPriceReportSection`과 이력 저장(`extractRelevantBuildingStdSnapshots`), 서버 PDF에 「재개발 환산 §164⑦」 계산서가 계속 출력된다. 그 계산은 토지 출자 분기(`runLandContribEstimated`)에서 실제로 쓰이지 않는다.

**세액 영향** — 세액 불변(0원) — 엔진 토지 출자 분기 `runLandContribEstimated`(lib/tax-engine/redevelopment.ts:213-231)는 `landStdPriceAtAcq`/`landStdPriceAtApproval`만 읽고 PHD 필드를 읽지 않는다(코드 정독). 결함은 결과 화면·이력·PDF의 표시/저장 불일치.

**수정 방향** — `isRedevPhdSectionActive`에 `if (a.redevOriginalAssetType === "land") return false;`를 게이트 6으로 추가하고, JSDoc의 5중 게이트 표에 `RedevelopmentValuationSection.tsx:179`를 행으로 넣는다. anchor(`redev-phd-trigger.test.ts`의 「가시성 술어 동기화」)에도 land 케이스를 추가해 드리프트를 고정한다.

#### `P2-06` 출자자산을 토지→주택으로 되돌리면 §166③ 단가가 §164⑦ 부분입력 차단을 켜는데, 실가 모드 화면에는 해제할 입력칸이 없다

| | |
|---|---|
| 위치 | `lib/calc/transfer-tax-validate-redev.ts:290` |
| 조문 | 소득세법 시행령 §164⑦ · §166③ |
| 유형 | validate-sync |

`redevLandPricePerSqmAtAcq`는 두 조문 축에서 공유된다 — 토지 출자 분기의 §166③ 분자 단가(`LandContribValuationContent`, RedevelopmentValuationSection.tsx:454-458)와 주택 분기의 §164⑦ Sum_A 구성(:253-257). validate의 부분입력 차단(:287-292)은 `hasAnyPhd`에 이 필드를 넣으므로, 토지 출자로 단가를 채운 뒤 ② 출자 자산을 「주택」으로 되돌리면 「최초공시일도 입력하세요」로 막힌다. 그런데 land 분기는 :137에서 early return하므로 이 차단은 주택 분기에서만 발동하고, 주택 + 실가 모드 화면(`RedevelopmentBlock.tsx:395-406`)에는 「최초공시일」 DateInput도 그 단가를 지울 칸도 렌더되지 않는다(`RedevelopmentValuationSection` 자체가 환산 모드에서만 렌더된다).

**실패 시나리오** — 재개발APT + 환산 + 출자자산=토지로 §166③ 단가(취득 1,000,000원/㎡, 인가 2,000,000원/㎡, 면적 150㎡)를 입력해 통과시킨 뒤(실측 validate=null), ② 출자 자산을 「주택」으로 바꾸고 ⑤ 취득가액 모드를 「실지거래가액」으로 바꾼다. → 「자산 1: A 또는 PHD 단가를 입력하셨다면 최초공시일도 입력하세요. (§164⑦ 본문 트리거)」로 차단되는데, 그 화면에는 최초공시일 입력칸이 없다. 입주권(right_to_move_in)에서도 동일하게 재현된다.

**세액 영향** — 세액 불변(0원). 화면에 채울 칸이 없는 상태로 계산 진행이 막힌다(환산 모드로 되돌리거나 출자자산을 토지로 되돌려야만 해제 가능 — 메시지는 어느 쪽도 안내하지 않는다).

**수정 방향** — `hasAnyPhd`에서 `redevLandPricePerSqmAtAcq`를 빼고 §164⑦ 전용 필드(`redevLandPricePerSqmAtFirst`·`redevBuildingStdPriceAtFirst`·`redevFirstDisclosureHousingPrice`)만 opt-in 신호로 본다 — `sec164-required-fields.ts`가 `shared?: boolean`으로 이미 쓰는 것과 같은 판별 기준(「입력 위젯이 §164 섹션 밖에도 있는가」)이다. 또는 출자자산 전환 patch에서 반대편 전용 값을 정규화한다(P2-07과 같은 축).

#### `P2-07` 입주권 stale 정규화가 재수화(migrate)와 세션 내 전환(patch) 사이에서 2필드 불일치 — anchor는 migrate 경로만 고정

| | |
|---|---|
| 위치 | `components/calc/transfer/asset-sections/AssetAreaRedevelopment.tsx:55` |
| 조문 | — |
| 유형 | validate-sync |

`migrateAsset`(재수화)은 `assetKind === "right_to_move_in"`일 때 5필드(`redevReceiveOnlyMode`·`redevNewHouseResidenceMonths`·`isAppraisalAcquisition`·`isSalesCaseAcquisition`·`redevIsSuccessorMember`)를 비우지만, 같은 목적의 세션 내 전환 patch `redevSubjectPatchForAssetKind`는 뒤의 3필드만 비운다. 앞의 2필드는 완공APT 전용 입력(사례 46 청산금 수령 단독 신고 · 사례 45 신축APT 거주월수)이고, 재개발APT에서 값을 채운 뒤 자산 종류를 입주권으로 바꾸면 저장값이 그대로 남는다. `transfer-right-successor-normalize.test.ts`도 그 2필드는 migrate 경로에서만 단언한다(:60-64)—patch describe(:85-100)에는 없다.

**실패 시나리오** — 자산 종류=재개발APT에서 청산금 방향=수령 + 「청산금 수령분 단독 신고」 ON(`redevReceiveOnlyMode="yes"`), 신축주택 거주월수 120 입력 → 같은 세션에서 자산 종류를 「입주권」으로 전환(새로고침 없이). → 두 값이 폼 상태에 남는다. 새로고침(재수화)하면 사라져 「새로고침해야 정상화되는」 상태가 된다.

**세액 영향** — 현재 세액 영향 0원 — ④ `buildRedevelopmentPayload`의 `isApt = subject === "apt"` 게이트(transfer-tax-api-redev.ts:40·103·113-120)와 `transfer-tax-api.ts:290`의 `redevPayload?.subject === "apt"` 게이트가 두 값을 모두 차단한다(코드 정독). 그 게이트가 유일한 방어선이며 정규화 층은 뚫려 있다.

**수정 방향** — `redevSubjectPatchForAssetKind`의 입주권 patch에 `redevReceiveOnlyMode: ""`·`redevNewHouseResidenceMonths: ""`를 추가하고, `transfer-right-successor-normalize.test.ts`의 patch describe에도 같은 단언을 넣어 두 경로가 어긋나면 anchor가 먼저 빨개지게 한다. 더 나은 방법은 정규화 필드 집합 자체를 공용 상수/함수로 뽑아 두 경로가 같은 소스를 쓰게 하는 것이다.

#### `T1-01` §89①4호 가목 1세대1입주권 비과세 — 세대 구성 요건(입주권 1개·주택 0개) 게이트가 전건 미검증 (뮤테이션 0/7032, 실측 259,611,000 → 0)

| | |
|---|---|
| 위치 | `lib/tax-engine/transfer-tax-redevelopment-transforms.ts:311` |
| 조문 | 소득세법 §89①4호 가목 (1세대1조합원입주권 양도 비과세) · 소득세법 시행령 §156의2 — 코드 주석 인용 기준이며 조문 본문은 이번 리뷰에서 미확인 |
| 유형 | test-gap |

applyOneRightExemption의 5조건 AND 게이트 중 세대 구성 2조건(householdHousingCount !== 0, householdRightCount !== 1)을 무력화해도 전체 양도세 테스트 7032건이 전부 통과한다. 이 두 조건은 「1세대가 입주권 1개만 보유」라는 §89①4호 가목 비과세 요건의 핵심이며, 무력화되면 입주권 2개를 보유한 세대에게 전액 비과세가 잘못 부여된다. 세액 영향이 이번 T1 차원에서 측정한 것 중 가장 크다 — 과세 259,611,000원이 통째로 0원이 된다. 현행 코드는 정확하나, 이 조문을 건드리는 어떤 회귀도 아무 테스트가 잡지 못한다.

**실패 시나리오** — 입력 — propertyType="right_to_move_in", subject="right", 취득일 2002-04-09, 양도일 2023-03-02, 취득가 100,000,000, 권리가액 300,000,000, 청산금 납부 90,000,000, 양도가액 900,000,000, exemptionEligibleAtApproval=true, isOneHousehold=true, householdHousingCount=0, **householdRightCount=2**(입주권 2개 보유 → 비과세 불가).
현행(정상): oneRightExemptionApplied=false, totalGain 710,000,000, 산출세액 236,010,000, 총납부세액 **259,611,000**.
게이트가 회귀로 사라진 경우: oneRightExemptionApplied=true, totalGain 0, 산출세액 0, 총납부세액 **0** — 전액 비과세가 잘못 적용되고 어떤 테스트도 실패하지 않는다.

**세액 영향** — 실측(프로브) — 총납부세액 259,611,000원 → 0원 (전액 소실, Δ 259,611,000). 양도가액 900,000,000 ≤ 12억이라 안분과세 분기도 타지 않고 3분기 gain·lthd가 모두 0으로 마스킹된다.

**수정 방향** — householdRightCount=2(또는 householdHousingCount≥1) + 나머지 4조건 충족 조합에서 oneRightExemptionApplied=false와 과세 세액이 유지되는 것을 단언하는 anchor 1건을 추가한다. 현행 사례 36 계열 fixture는 전부 요건 충족(양성) 케이스뿐이라 음성 케이스가 없다.

#### `T1-02` Zod redevelopment 스키마가 안전망 0 — 필드를 지워도 7032건 전부 통과, 실측 세액 57,995,960 → 123,486,000 (침묵 strip)

| | |
|---|---|
| 위치 | `lib/api/transfer-tax-redevelopment-schema.ts:57` |
| 조문 | 소득세법 시행령 §166③ (landStdPriceAtAcq — 환산취득가) · 소득세법 시행령 §162①4호 (completionDate — 자가건설 취득시기) — 코드 주석 인용 기준이며 조문 본문은 이번 리뷰에서 미확인 |
| 유형 | test-gap |

redevelopmentSchema에서 필드를 하나 제거해도 전체 양도세 스위트 7032건이 전부 통과한다. 두 필드(landStdPriceAtAcq, completionDate)로 확인했고 둘 다 0 반응이었다. 원인은 이 스키마를 태우는 테스트가 단 한 건도 없기 때문이다 — redevelopmentSchema를 import하는 곳은 lib/api/transfer-tax-schema.ts 뿐이고, redevelopment를 body에 넣는 route 레벨 테스트 2건은 결과 객체의 키 존재/부재만 단언할 뿐 세액을 단언하지 않는다. 아이러니하게도 문제의 두 필드에는 코드에 `★★★ 침묵 stripping 차단` 주석이 달려 있는데, 정작 그 회귀를 잡는 테스트가 없다.

**실패 시나리오** — 입력 — 사례 37 경로(propertyType="right_to_move_in", subject="right", originalAssetType="land", useEstimatedAcquisition=true, 권리가액 300,000,000, landStdPriceAtAcq 100,000,000, landStdPriceAtApproval 150,000,000, 양도가액 520,000,000, 취득일 2002-04-09, 양도일 2023-03-02).
스키마에서 landStdPriceAtAcq가 빠지면 route handler가 그 값을 조용히 제거 → §166③ 환산취득가 산식의 분자가 사라져 인가전 취득가액이 200,000,000 → **0**이 된다. 인가전 양도차익 97,000,000 → 300,000,000, 총 양도차익 217,000,000 → 420,000,000.
총납부세액 57,995,960 → **123,486,000** (2배 초과). 400 에러도, 타입 에러도, 테스트 실패도 발생하지 않는다.

**세액 영향** — 실측(프로브) — 총납부세액 57,995,960원 → 123,486,000원 (Δ +65,490,040). 인가전 안분취득가액 200,000,000 → 0.

**수정 방향** — redevelopmentSchema를 실제로 통과시키는 plumbing anchor를 1건 만든다. 재개발 optional 필드 전체를 담은 payload를 `redevelopmentSchema.parse()`에 넣고 결과 키 집합이 입력 키 집합을 전부 포함하는지 단언하면(집합 대조 1건) 26개 optional 필드 전부가 한 번에 보호된다. 필드별 세액 anchor를 26개 만들 필요는 없다.

#### `T1-04` §166④1호 청산금 수령 비과세 게이트 — 5조건 중 3개(권리가액 12억·비교대상 축·receiveOnlyMode)가 미검증 (실측 Δ 21,847,466)

| | |
|---|---|
| 위치 | `lib/tax-engine/transfer-tax-redevelopment-transforms.ts:209` |
| 조문 | 소득세법 시행령 §166④1호(관리처분계획에 따라 정하여진 가격) · 소득세법 §89①4호 가목 단서 · 소득세법 §95③ — 코드 주석 및 도메인 확정 사실 기준이며 조문 본문은 이번 리뷰에서 미확인 |
| 유형 | test-gap |

applySettlementExemption의 5조건 AND 게이트 중 3개를 각각 무력화해도 재개발 스코프 542건이 전부 통과하며, 그중 권리가액 12억 조건은 전체 스위트 7032건에서도 0 반응이다. 원인은 이 함수를 양성 발동시키는 fixture가 사례 47(권리가액 8억, receiveOnlyMode=false) 단 하나뿐이라는 것 — 권리가액이 12억을 넘는 케이스도, receiveOnlyMode=true인 케이스도 없어서 게이트의 「막는」 동작이 한 번도 관측되지 않는다. 도메인 오너가 확정한 「고가주택 판정 대상 = §166④1호 권리가격, 기준선 12억」이라는 규칙 자체가 무방비다.

**실패 시나리오** — 입력 — 사례 47 구조 그대로 두고 인가일 권리가액만 8억 → **15억**(propertyType="redevelopment_apt", subject="apt", settlementDirection="receive", 청산금 수령 200,000,000, 양도가액 2,000,000,000, 취득일 2001-01-01, 양도일 2022-03-01, 취득가 100,000,000, isOneHousehold=true, householdHousingCount=1, residencePeriodMonths=254).
현행(정상): 권리가액 15억 > 12억이므로 고가주택 → settlementExemptionApplied=false, settlement.gain 74,666,666 과세, 총납부세액 **62,850,332**.
12억 게이트가 회귀로 사라지면: settlementExemptionApplied=true, settlement.gain 0으로 마스킹, exemptedGain 74,666,666, 총납부세액 **41,002,866**. 테스트 7032건 전부 통과한다.

**세액 영향** — 실측(프로브) — 총납부세액 62,850,332원 → 41,002,866원 (Δ −21,847,466). 청산금분 양도차익 74,666,666원이 통째로 비과세 처리된다.

**수정 방향** — 권리가액 > 12억 케이스와 receiveOnlyMode=true 케이스를 각각 1건씩 추가해 settlementExemptionApplied=false와 과세 세액을 단언한다. 현행 fixture가 전부 「게이트를 통과하는」 양성 케이스라 「게이트가 막는」 음성 케이스가 0건인 것이 근본 원인이다.

#### `T1-05` apt+receive 인가후 양도차손 0 clamp가 전건 미검증 — 뮤테이션 0/7032, 실측 Δ 20,900,000

| | |
|---|---|
| 위치 | `lib/tax-engine/redevelopment-split.ts:375` |
| 조문 | 소득세법 시행령 §166②2호(§166①2호 가목 준용) — 코드 주석 인용 기준이며 조문 본문은 이번 리뷰에서 미확인. clamp의 법령 적부는 판단하지 않았다(확인 필요) |
| 유형 | test-gap |

computeAptReceive의 `Math.max(0, ...)` clamp를 제거해도 전체 양도세 스위트 7032건이 전부 통과한다. 이 clamp는 양도가액이 분양가(권리가액 − 수령청산금)보다 낮을 때 인가후 양도차손을 0으로 눌러 세액을 좌우하는 load-bearing 코드인데, apt+receive fixture 중 양도가액 < 분양가인 케이스가 하나도 없어 한 번도 발동하지 않는다. 같은 clamp가 splitReceive(redevelopment-settlement.ts:167)에도 있어 입주권 receive 분기까지 같은 사각지대다. 참고로 apt+pay 분기도 splitAptPay의 `postApprovalGain <= 0` 가드로 동일하게 0 처리하므로 엔진은 내부적으로 일관되며, 이 항목은 clamp가 법령상 틀렸다는 주장이 아니라 안전망이 전무하다는 보고다.

**실패 시나리오** — 입력 — propertyType="redevelopment_apt", subject="apt", settlementDirection="receive", 권리가액 500,000,000, 수령청산금 100,000,000(→ 분양가 400,000,000), **양도가액 350,000,000**(분양가 미만), 취득일 2005-03-10, 인가일 2015-06-01, 양도일 2023-09-01, 취득가 200,000,000, householdHousingCount=2.
현행(정상): 인가후 양도차익 = 350,000,000 − 400,000,000 = −50,000,000 → clamp로 0, 총 양도차익 300,000,000, 총납부세액 **64,801,000**.
clamp가 회귀로 사라지면: post_gain −50,000,000이 그대로 합산 → 총 양도차익 250,000,000, 과세표준 207,500,000 → 157,500,000, 총납부세액 **43,901,000**. 7032건 전부 통과한다.

**세액 영향** — 실측(프로브) — 총납부세액 64,801,000원 → 43,901,000원 (Δ −20,900,000). 인가후 기존주택분 양도차익 0 → −50,000,000.

**수정 방향** — apt+receive에서 양도가액 < 분양가인 케이스 anchor 1건을 추가한다. 함께 redevelopment-settlement.ts:167의 splitReceive clamp(입주권 receive 분기)도 같은 사각지대이므로 동일 구조의 케이스가 필요하다. 덧붙여 clamp가 §166 및 §102②(양도차손 통산) 관점에서 타당한지는 이번 리뷰에서 판단하지 않았으므로 별도 확인이 필요하다.

#### `T1-06` §166①2호 나목 인가전 필요경비 차감을 지키는 테스트가 전 스위트에 1건뿐이고, 그 1건은 세액이 아니라 표시 자기일관성만 본다 (fixture 42/43이 값 0)

| | |
|---|---|
| 위치 | `lib/tax-engine/redevelopment-split.ts:202` |
| 조문 | 소득세법 시행령 §166①2호 나목(인가전 필요경비) · 소득세법 §97①2호·3호 · 소득세법 시행령 §163⑥ — 코드 주석 인용 기준이며 조문 본문은 이번 리뷰에서 미확인 |
| 유형 | test-gap |

인가전 양도차익 산식에서 `- redevelopment.preApprovalExpenses`를 제거하면 전체 양도세 스위트 7032건 중 정확히 1건만 실패한다. 그 1건은 right-receive-expenses-apportion.anchor.test.ts의 「인가전 분 열이 자기일관적이다(양도가액 − 취득가액 − 필요경비 = 양도차익)」로, 신고서 표시 열의 자기일관성을 보는 anchor이지 세액 anchor가 아니다. 게다가 그 anchor는 right+receive 분기만 태우므로 right+pay·apt+pay·apt+receive 세 분기의 preApprovalExpenses 차감은 완전 무방비다. fixture 집계상 preApprovalExpenses 값이 0인 것이 42건, 비영(5,000,000)인 것이 1건이라 축이 한쪽으로 완전히 쏠려 있다.

**실패 시나리오** — 입력 — propertyType="right_to_move_in", subject="right", settlementDirection="**pay**"(가드가 없는 분기), 취득일 2002-04-09, 인가일 2018-10-23, 양도일 2023-03-02, 취득가 100,000,000, 권리가액 300,000,000, 납부청산금 90,000,000, 양도가액 520,000,000, **preApprovalExpenses 30,000,000**.
현행(정상): 인가전 양도차익 = 300,000,000 − 100,000,000 − 30,000,000 = 170,000,000, 총 양도차익 300,000,000, 총납부세액 **81,103,000**.
차감이 회귀로 사라지면: 인가전 양도차익 200,000,000, 총 양도차익 330,000,000, 총납부세액 **89,881,000** — 필요경비가 통째로 무시되지만 right+pay 분기에는 이를 잡는 테스트가 없어(유일한 catcher는 right+receive 전용) 조용히 통과한다.

**세액 영향** — 실측(프로브) — right+pay 분기에서 preApprovalExpenses 30,000,000 반영 시 총납부세액 81,103,000원, 미반영 시 89,881,000원 (Δ 8,778,000). 인가전 양도차익 170,000,000 ↔ 200,000,000.

**수정 방향** — preApprovalExpenses가 비영인 케이스를 right+pay / apt+pay / apt+receive 각 분기에 1건씩 추가하고, 표시 자기일관성이 아니라 세액(또는 최소한 preApproval.gain)을 단언한다. 현재는 43개 fixture 중 42개가 값 0이라 이 항이 산식에 있든 없든 대부분의 테스트가 같은 값을 낸다.

#### `U2-04` 승계 입주권을 추계(환산·감정·매매사례) 모드로 바꿔도 ⑥ 사이드바는 실가 2칸 합계를 「취득가액」으로 계속 표시한다 (엔진은 0을 받아 추계한다)

| | |
|---|---|
| 위치 | `lib/stores/transfer-per-asset-summary.ts:145` |
| 조문 | 소득세법 시행령 §176의2②2호(환산) · §176의2③1·2호(매매사례·감정) |
| 유형 | plumbing-14pt |

`SuccessorRightAcquisitionBlock`의 산정 방식 라디오는 `acqModePatch`로 3개 boolean만 뒤집고 실가 2칸(`successorRightAcqPrice`·`successorRightAddedContribution`)은 비우지 않는다(전용 필드를 비우는 것은 「조합원 유형」 토글의 `successorRightTogglePatch`뿐). 실가 2칸은 `isActual`일 때만 렌더되므로 화면에서 사라진다. 그런데 ⑥ 사이드바의 `directAcqRaw`는 최상단에서 `isSuccessorRightTransfer(a)`만 보고 **모드 무관**하게 `successorRightAcquisitionTotal(a)`을 반환하며 `pending:false`로 확정 표시한다. ④ 변환은 같은 상황에서 `acquisitionPrice: 0`을 보내고 §165① 기준시가로 환산하므로, 사이드바 숫자와 실제 계산 취득가액이 갈린다. 같은 이유로 매매사례가액 모드에서도 `similarSalesValue` 갈래(:169)에 도달하지 못한다.

**실패 시나리오** — 승계조합원 입주권에서 실지거래가액 모드로 승계취득가액 4억 + 추가분담금 1억을 입력한 뒤, 산정 방식을 「환산취득가액」으로 바꾸고 §165① 기준시가(취득당시 1억 / 양도당시 4억)를 입력. 양도가액 8억. → 사이드바는 「취득가액 500,000,000」을 그대로 표시하지만, API는 `acquisitionPrice: 0`·`useEstimatedAcquisition: true`·`standardPriceAtAcquisition: 100,000,000`·`standardPriceAtTransfer: 400,000,000`을 보내 엔진 환산취득가는 800,000,000 × 100,000,000 ÷ 400,000,000 = 200,000,000원이 된다.

**세액 영향** — 세액 자체는 엔진값(환산)이 맞으므로 오류 없음 — **표시 불일치**만 발생. 실측 편차: 사이드바 500,000,000원 vs 엔진 환산취득가 200,000,000원 (300,000,000원 차이).

**수정 방향** — `directAcqRaw`의 승계 갈래를 ④와 같은 술어로 좁힌다 — `if (isSuccessorRightTransfer(a) && successorRightEstimationMode(a) === "actual")`로 두고, 추계 모드는 기존 ④(매매사례)·환산 프리뷰 갈래로 흘려보낸다(환산은 `pending: true`). 술어는 `lib/calc/transfer-successor-right.ts`의 `successorRightEstimationMode` 단일 소스를 그대로 쓴다.

#### `U2-06` 상속·증여로 승계취득한 조합원입주권은 ⑧이 「실지거래가액」 입력을 필수로 요구하지만 그 값은 §163⑨ 상속·증여 평가액에 덮여 엔진에 도달하지 않는다

| | |
|---|---|
| 위치 | `lib/calc/transfer-tax-validate-successor-right.ts:74` |
| 조문 | 소득세법 시행령 §163⑨1호(상속·증여받은 자산의 취득가액 = 상속개시일·증여일 현재 평가액) · 소득세법 §97①1호 가목 |
| 유형 | validate-sync |

승계조합원 입주권 화면은 취득원인 라디오(`CompanionAcquisitionCauseSection`)를 자산 종류와 무관하게 렌더하므로 「상속」·「증여」를 고를 수 있다. 그러면 ④ 변환이 `acquisitionPrice: successorRightAcquisitionTotal(primary)`(승계 2칸)과 `inheritedAcquisition`(§163⑨ post-deemed 평가액) **둘 다** 전송하고, 엔진의 `runInheritedAcquisitionStep`이 후자로 취득가액을 덮는다. 즉 ⑧이 필수로 막는 「승계취득가액(취득에 든 실지거래가액)」은 상속·증여 승계에서 존재하지도 않고 계산에 도달하지도 않는 값이며, ⑥ 사이드바는 그 도달하지 않는 값을 「취득가액」으로 표시한다. (엔진이 §163⑨을 적용하는 것 자체는 법령에 맞다 — 문제는 요구·표시 쪽이다.)

**실패 시나리오** — 관리처분 인가 후 조합원입주권을 **상속**으로 승계취득(상속개시 2020-05-01, 상속세 신고 평가액 6억), 2026-02-16에 8억에 양도. ① 조합원 유형 = 승계조합원, 취득원인 = 상속. 승계취득가액 칸을 비우면 「조합원입주권 승계취득가액을 입력하세요」로 차단되어 진행 불가(상속에는 지급한 실지거래가액이 없다). 임의로 4억 + 추가분담금 1억을 넣으면 통과하지만, 엔진은 §163⑨ 평가액 6억으로 계산해 양도차익이 300,000,000원 → 200,000,000원이 된다. 사이드바는 그동안 「취득가액 500,000,000」을 표시한다.

**세액 영향** — 세액은 §163⑨이 적용된 값(양도차익 200,000,000원)이 법령상 맞으므로 **세액 오류 아님**. 실측된 것은 ①입력 강제(승계취득가액 공란 시 차단 메시지 재현)와 ②표시 드리프트(사이드바 500,000,000 vs 엔진 취득가액 600,000,000). 승계 2칸 값이 계산에 미치는 영향: 0원(override됨 — 양도차익 300,000,000 → 200,000,000으로 실측 확인).

**수정 방향** — `validateSuccessorRightAsset`의 실가 필수 검증을 `asset.acquisitionCause`가 §163⑨ 대상(상속·증여)일 때는 건너뛰고, ⑤ `SuccessorRightAcquisitionBlock`도 그 경우 승계취득 2칸 대신 「취득가액은 상속개시일·증여일 평가액을 사용합니다(시행령 §163⑨1호)」 안내로 대체한다. ⑥ `directAcqRaw`의 승계 갈래에도 같은 조건을 걸어 §163⑨ 평가액을 표시하게 한다 — ④·⑤·⑥·⑧이 같은 술어를 쓰도록 `transfer-successor-right.ts`에 leaf를 하나 더 둔다.

### 5.4 ⚪ low (8건)

#### `E3-07` 파일 헤더 주석이 「STEP 7.5·9·10 농특세…transfer-tax-finalize.ts 재사용」이라고 하나 finalize를 호출하지 않고 농특세를 계산하지도 않는다

| | |
|---|---|
| 위치 | `lib/tax-engine/transfer-tax-redevelopment.ts:12` |
| 조문 | 농어촌특별세법 §5①1호 |
| 유형 | comment-drift |

헤더 주석 :11-12는 「STEP 5·6·7 통상 흐름 … STEP 7.5·9·10 농특세·지방소득세·세액합계 (transfer-tax-finalize.ts 재사용)」이라고 서술한다. 실제로는 `finalizeTransferTax`를 호출하지 않고 지방소득세를 인라인으로 직접 계산하며(:270-271), 농특세는 코드 어디에도 없다(결과 타입에도 미부착). 농특세 산정 근거인 감면세액이 항상 0이므로(E3-02) 현재 수치 자체는 0으로 일치하지만, 주석은 「finalize가 다 해 준다」고 읽히게 해 E3-02를 가린다.

**실패 시나리오** — 주석만 읽은 개발자가 「재개발 경로도 감면·농특세는 finalize가 처리한다」고 믿고 E3-02(감면 침묵 소실)를 지나친다. 실제로 감면을 배선하는 후속 작업에서 농특세 경로가 없다는 사실을 코드를 다시 읽기 전까지 알 수 없다.

**세액 영향** — 현재 세액 영향 없음(감면이 0이라 농특세도 0). E3-02 해소 시 농특세 20%가 자동으로 따라오지 않는다는 점이 실질 위험.

**수정 방향** — 주석을 실제 동작대로 정정한다 — 「STEP 9·10 지방소득세·세액합계는 이 파일이 직접 계산한다. 가산세만 `emitPenaltySteps`를 재사용하고 STEP 7.5(감면)·농특세는 **미구현**이다」. 정정 시 E3-02와의 연결(감면을 배선하면 농특세도 함께 배선해야 함)을 남길 것.

#### `L1-05` 삭제된 조항 「시행령 §155⑰」을 재개발 거주기간 통산 근거로 4곳에서 인용 — 엔진 측은 같은 규칙을 §154⑧로 인용

| | |
|---|---|
| 위치 | `lib/stores/calc-wizard-asset-redev.ts:154` |
| 조문 | 소득세법 시행령 §154⑧1호 (「거주하거나 보유하는 중에 소실·무너짐·노후 등으로 인하여 멸실되어 재건축한 주택인 경우에는 그 멸실된 주택과 재건축한 주택에 대한 거주기간 및 보유기간」) / 대비: 시행령 §155⑰ = 삭제 |
| 유형 | statute-mismatch |

사례 45(재개발 완공APT 거주월수 귀속 분리)의 보유·거주기간 통산 근거를 store·API 변환·validate 4곳이 「시행령 §155⑰ (보유·거주 통산)」으로 인용한다. 현행 소득세법 시행령 §155에 ⑰은 「삭제」로 비어 있다. 같은 규칙을 legal-codes와 엔진·타입은 「§154⑧」으로 인용하고 있어 좌우가 어긋난다.

**실패 시나리오** — 재개발 완공APT를 양도하는 1세대1주택자가 종전주택 거주월수를 입력할 때 store·validate 주석과 코드 리뷰가 「§155⑰」을 근거로 삼는다. 그 조항은 삭제돼 있어 법령 검토·개정 추적이 공허해지고, 엔진(§154⑧)과 다른 조문을 가리켜 후속 정정 시 두 축이 갈라진다.

**세액 영향** — 세액 무영향 (통산 계산 자체는 §154⑧과 일치). 근거 인용 오류 + 좌우 불일치.

**수정 방향** — 네 곳의 「§155⑰」을 엔진 정본과 같은 「소득세법 시행령 §154⑧」(재건축 통산은 1호)로 정정한다. 그 근거 문자열도 legal-codes의 REDEVELOPMENT.REDEV_RESIDENCE_AGGREGATION 상수를 참조하게 하면 재발이 막힌다.

#### `L1-07` 존재하지 않는 호 「§94①2호의2」를 입주권 근거로 기재

| | |
|---|---|
| 위치 | `lib/tax-engine/redevelopment-split.ts:489` |
| 조문 | 소득세법 §94①2호 가목 (§94①2호에는 가·나·다목만 있고 「2호의2」는 없다) |
| 유형 | comment-drift |

redevelopment-split.ts의 청산금 수령 분기 주석이 「입주권은 §94①2호의2 자산」이라 적는다. 소득세법 §94①에는 1~6호가 있고 2호에는 가·나·다목만 있으며 「2호의2」라는 호는 없다. 조합원입주권은 §94①2호 가목이다. 같은 줄이 L1-01의 허구 인용(§95② 별표2 [비고] 1호)도 함께 담고 있다.

**실패 시나리오** — 청산금 수령 분기의 postApprovalExistingHouse를 0으로 두는 이유를 후속 개발자가 검토할 때 「§94①2호의2」를 찾아가면 조문이 존재하지 않아 근거 검증이 불가능하고, 인접의 「별표2 [비고] 1호」와 겹쳐 두 인용 모두 검증되지 않은 채 전파된다.

**세액 영향** — 세액 무영향 (주석 전용, 사용자 비노출).

**수정 방향** — 「§94①2호의2」 → 「§94①2호 가목」으로 정정하고, 같은 줄의 「§95② 별표2 [비고] 1호」는 L1-01과 함께 「§95② 본문 괄호」로 바꾼다.

#### `L1-09` 재개발 축이 전적으로 의존하는 §95② 두 문언을 verify:legal 키워드가 전혀 감시하지 않고, 커버리지 게이트는 조 단위라 항·호 오기를 통과시킨다

| | |
|---|---|
| 위치 | `lib/legal-verification/verifier-manifest.ts:39` |
| 조문 | 소득세법 §95② (「조합원으로부터 취득한 것은 제외한다」 · 「관리처분계획 인가 및 사업시행계획인가 전 토지분 또는 건물분의 양도차익으로 한정한다」) |
| 유형 | test-gap |

입주권 축의 두 핵심 판정 — 승계조합원 LTHD 배제(REDEVELOPMENT.LTHD_RIGHT_PROVISO)와 인가전 분 한정(LTHD_RIGHT_TABLE1_ANNOTATION) — 은 §95② 본문 괄호의 두 문언에 전적으로 의존한다. 그런데 매니페스트의 §95② 규칙 키워드는 「장기보유」·「공제액」·「보유기간」·「공제율」 넷뿐이라(기본 ALL 모드) 그 문언이 개정·삭제돼도 verify:legal은 통과한다. 또한 커버리지 게이트는 「법령명 + 조 번호」 단위 비교라(coverage.ts:8 주석 명시) 항·호가 틀린 인용(L1-01의 「§95② 별표2 [비고] 1호」)도 100%로 집계된다 — 실제로 커버리지 테스트는 3건 전부 통과한다.

**실패 시나리오** — 소득세법 §95②의 「조합원으로부터 취득한 것은 제외한다」 괄호가 개정으로 바뀌면 승계조합원 입주권 LTHD 배제(transfer-tax-lthd.ts)와 그 UI 라벨이 즉시 틀리게 되지만, verify:legal의 §95② 규칙은 「장기보유·공제액·보유기간·공제율」 넷이 여전히 본문에 있으므로 통과하고 커버리지도 100%를 유지한다. 아무도 알림을 받지 못한다.

**세액 영향** — 현시점 세액 무영향 (감시 공백). 개정 시 승계조합원 입주권·인가후 분 LTHD가 조용히 틀려도 자동 게이트가 침묵한다.

**수정 방향** — §95② 규칙에 재개발 축 전용 키워드를 추가한다 — 예: "조합원으로부터 취득한 것은 제외한다", "전 토지분 또는 건물분의 양도차익으로 한정한다", "제104조제7항 각 호에 따른 자산은 제외한다"(전부 현행 §95② verbatim). §89①4호(「다른 주택 또는 분양권을 보유하지 아니할 것」·「12억원을 초과하는 경우」)와 §166(이미 4개 키워드로 등록됨)도 같은 기준으로 점검할 것.

#### `P1-03` acquisitionRounding — ⑫ Zod·엔진 타입에 있으나 ⑬가 만들지 않고 엔진 본문도 값을 읽지 않는 사문(死文) 필드

| | |
|---|---|
| 위치 | `lib/tax-engine/redevelopment-valuation.ts:93` |
| 조문 | 소득세법 시행령 §166③ (환산취득가 산식 — rounding 미규정) |
| 유형 | plumbing-14pt |

`acquisitionRounding`은 엔진 입력 타입(transfer-redevelopment.types.ts:220)과 ⑫ Zod(transfer-tax-redevelopment-schema.ts:34)에 정의돼 있고 `computeRedevelopmentValuation`이 `rounding: info.acquisitionRounding`으로 하위 함수에 넘긴다. 그러나 `computeConvertedAcquisitionPrice` 본문은 `rounding`을 구조분해하지도 참조하지도 않는다 — 파일 전체에서 'rounding' 문자열은 주석·타입선언·전달 3곳뿐이다. 동시에 ⑬ `buildRedevelopmentPayload`는 이 키를 아예 만들지 않아 UI 경로에서는 항상 undefined다. 즉 「기본값 floor」라는 타입 주석이 약속하는 선택지가 실제로는 존재하지 않는다.

**실패 시나리오** — API를 직접 호출하는 클라이언트가 `redevelopment.acquisitionRounding = "round"`를 보내면 Zod를 통과하고 ⑭ spread로 엔진까지 도달하지만, 산정 결과는 "floor"일 때와 완전히 동일하다(값이 읽히지 않으므로). 설정한 쪽은 반올림이 적용됐다고 오인한다. 또한 엔진 테스트 35개 지점이 `acquisitionRounding: "floor"`를 fixture에 넣고 있어 이 필드가 존중되는 것처럼 보이지만, 값을 바꿔도 어떤 테스트도 반응하지 않는다.

**세액 영향** — 없음(0원). 엔진이 값을 읽지 않아 항상 safeMultiplyThenDivide의 floor가 적용된다 — 현행 산출값은 §166③ 관점에서 변함이 없다.

**수정 방향** — 둘 중 하나로 정리한다. (a) 기능이 필요 없다면 ⑫ Zod·엔진 입력 타입·`ConvertedAcquisitionInput.rounding`·:308 전달을 함께 제거하고, 테스트 fixture 35곳의 `acquisitionRounding: "floor"`도 같이 걷어낸다(사문 필드가 존중되는 것처럼 보이는 착시 제거). (b) 유지한다면 `computeConvertedAcquisitionPrice` 본문이 실제로 rounding을 분기하도록 구현하고 ⑬·⑤ 입력 경로를 함께 배선한다. 다만 시행령 §166③이 rounding을 규정하지 않으므로 (a)가 정합적이다.

#### `P2-05` 입주권 원조합원 차단 메시지가 입주권 화면에 존재하지 않는 「승계조합원 모드」 토글을 가리킨다

| | |
|---|---|
| 위치 | `lib/calc/transfer-tax-validate-redev.ts:157` |
| 조문 | 소득세법 시행령 §166① |
| 유형 | ui-gate |

`validateRedevelopmentAsset`이 「인가일 < 취득일」을 막으면서 안내하는 우회 수단은 ②-a `SuccessorMemberSection`(`redevIsSuccessorMember`) 토글인데, 그 카드는 `RedevelopmentBlock.tsx:178`이 `{!isRightSubject && ...}`로 입주권 화면에서 제거한다(#1245에서 완공APT 전용으로 분리). 입주권의 승계 여부를 받는 실제 컨트롤은 ① 기본정보의 「조합원 유형」(`isSuccessorRightToMoveIn`, AssetSectionBasic.tsx:282-299)로 **다른 필드**다. `validateSuccessorRightAsset`의 헤더(transfer-tax-validate-successor-right.ts:13-16)가 「종전에는 그 상태였다 … 어느 경로로도 계산할 수 없었다」며 이 결함을 기록하고 라우팅은 고쳤지만, 메시지 문구는 그대로 남았다.

**실패 시나리오** — 자산 종류=조합원입주권, 조합원 유형=원조합원(기본값), 취득일 2020-05-10, 관리처분 인가일 2016-10-23(= 인가 후 승계취득한 실제 사안) 입력. → 「자산: 인가일은 취득일 이후여야 합니다. 관리처분 인가 후 입주권을 승계 취득한 경우 "승계조합원 모드"를 ON 하세요.」로 차단되는데, 그 화면에는 「승계조합원 모드」라는 이름의 토글이 없다. 정확한 조치는 ① 기본정보 「조합원 유형」을 「승계조합원」으로 바꾸는 것이다.

**세액 영향** — 세액 불변(0원). 진행 차단 상태에서 사용자가 잘못된 컨트롤을 찾게 만드는 검증 메시지 결함(완전한 dead-end는 아님 — ① 기본정보 라디오로 복구 가능).

**수정 방향** — 메시지를 자산 종류로 갈라, `assetKind === "right_to_move_in"`이면 「① 기본정보의 「조합원 유형」을 "승계조합원"으로 바꾸세요」로 안내한다(`validateSuccessorRightAsset:55`가 반대 방향에서 이미 쓰는 문구와 짝을 맞춘다).

#### `S1-04` 분양권을 §94①2호「나」목으로 인용 — 나목은 지상권이고 분양권은 「가」목이다

| | |
|---|---|
| 위치 | `lib/tax-engine/transfer-tax-surcharge-predicate.ts:62` |
| 조문 | 소득세법 §94①2호 가목(부동산을 취득할 수 있는 권리) · 나목(지상권) |
| 유형 | comment-drift |

§104⑦ 중과 대상 자산 술어의 근거 주석이 「조합원입주권(§94①2호**가**목)·분양권(§94①2호**나**목)」이라고 적었다. 소득세법 §94①2호 나목은 「지상권」이고, 분양권은 조합원입주권과 **같은 가목**(「부동산을 취득할 수 있는 권리」)이다. 같은 저장소의 `legal-codes/transfer-nbl.ts:191-197`은 둘 다 가목이라고 옳게 적고 있어 두 파일이 서로 어긋난다. 판정 자체(분양권을 §104⑦ 대상에서 제외)는 옳으므로 세액 영향은 없으나, 이 주석은 「§163⑥3호는 나·다목만 열거하므로 가목은 4호 1%」라는 인접 판단과 직결되는 목(目) 구분을 뒤집어 적고 있어 다음 작업자가 오독할 여지가 있다.

**실패 시나리오** — 세액 오류는 발생하지 않는다. 다만 이 주석을 근거로 삼아 §163⑥ 개산공제율(나목·다목 = 3호 7%, 가목 = 4호 1%)이나 §104①2·3호 대상 범위를 재검토하는 후속 작업이 분양권을 「나목」으로 취급하면 개산공제율을 1%가 아닌 7%로 잘못 판정할 수 있다.

**세액 영향** — 없음 (주석 전용 — 판정 코드 `SURCHARGE_SUBJECT_PROPERTY_TYPES`는 조문 본문과 일치)

**수정 방향** — 주석을 「조합원입주권·분양권(둘 다 §94①2호**가**목)」으로 정정한다. 판정 코드는 변경하지 않는다.

#### `U1-03` 프로덕션 유일 호출부가 `transferPrice`·`wasRegulatedAtAcquisition` 두 prop을 넘기지 않아 입주권 비과세 카드의 「12억 초과 안내」와 「거주요건 미충족 경고」가 도달 불가 — anchor는 그 prop을 넘겨서 못 잡는다

| | |
|---|---|
| 위치 | `components/calc/transfer/asset-sections/AssetSectionAcquisition.tsx:328` |
| 조문 | 소득세법 §89①3호 가목 (거주 2년 요건) · §95③ + 시행령 §160 (12억 안분) — 조문 본문 미확인 (카드 문구가 인용한 근거) |
| 유형 | plumbing-14pt |

`RedevelopmentBlock`은 `transferPrice`·`wasRegulatedAtAcquisition` 두 optional prop을 받아 `RedevelopmentRightExemptionSection`에 그대로 넘긴다(:126-128). 그 섹션에서 `wasRegulatedAtAcquisition`은 기본값 `false`라 C-1(a) 거주요건 경고의 `residenceWarning` 항이 **항상 false**가 되고, `transferPrice`가 `undefined`면 `parseAmount("") = 0`이라 `isHighValue`가 **항상 false**가 되어 「양도가액 12억 초과 → §89①4호 가목 단서 안분과세」 안내 카드가 절대 뜨지 않는다. 그런데 프로덕션의 유일한 렌더 사이트는 `asset`·`onChange`·`isOneHouseSingle` 3개만 넘긴다. 상위 4계층(Step1 → CompanionAssetsSection → CompanionAssetCard → AssetSectionAcquisition) 어디에도 이 두 prop이 없다 — 「명시 prop 매핑 침묵 strip」이다. 반대로 anchor 테스트는 `RedevelopmentBlock`을 직접 렌더하면서 두 prop을 모두 넘겨서(`wasRegulatedAtAcquisition={false}` `transferPrice="520000000"`) 이 배선 단절을 구조적으로 관측할 수 없다.

**실패 시나리오** — 입주권 자산 · 양도가액 20억 · 조정대상지역 취득 · §⑥ 비과세 토글 ON · 인가일 기준 보유·거주 10개월 입력. 실제 화면에는 「양도가액 12억 초과 → §89①4호 가목 단서 안분과세 적용」 안내도, 「거주 월수 10개월 — 조정대상지역 취득으로 거주 24개월 미만」 경고도 **뜨지 않는다**. 같은 자산을 `RedevelopmentBlock`에 두 prop을 넘겨 직접 렌더하면 둘 다 뜬다(대조 실측). 즉 12억 초과·거주요건 미달을 자기선언한 사용자가 아무 경고도 못 받는다.

**세액 영향** — 세액 무영향 — 두 분기 모두 안내·경고 표시 전용이고 store에 쓰지 않는다(실측: 두 렌더 경로의 payload 동일). 다만 §89①4호 가목 자기선언의 유일한 검증 장치가 무력화된다.

**수정 방향** — Step1이 이미 `form.isOneHousehold`·`form.householdHousingCount`로 `isOneHouseSingle`을 계산해 내려보내고 있으므로(app/calc/transfer-tax/steps/Step1.tsx:233) 같은 경로로 `wasRegulatedAtAcquisition`을 함께 내리고, `transferPrice`는 자산이 이미 들고 있는 `asset.actualSalePrice`를 `RedevelopmentRightExemptionSection`이 직접 읽게 바꾼다(`RedevelopmentResidenceSplitSection.tsx:32`·`RedevelopmentValuationSection`의 landContribPreview가 같은 자산 필드를 이미 그렇게 읽는다 — prop 축을 하나 줄이면 같은 strip이 재발하지 않는다). 어느 쪽을 택하든 anchor는 **프로덕션 호출부(`AssetSectionAcquisition` 이상)**를 진입점으로 잡아야 배선 단절을 잡는다.


## 6. 기각된 5건 — 재제안 금지

아래 5건은 발굴 단계에서 제기됐으나 반증 검증에서 **기각**됐다. 코드 관찰 자체는 대체로 정확했으나 결론이 성립하지 않았다. 같은 주장이 다시 올라오는 것을 막기 위해 사유를 남긴다.

| 기각 항목 | 주장 | 기각 사유 |
|---|---|---|
| `P1-01` · `E3-04` | 「함께양도 차단 목록에 입주권이 빠져 **주 자산** §166 계산이 붕괴한다」 | **주 자산(primary) 경로에서 §166은 정상 계산된다.** 동일 양도가액으로 맞춘 유효 대조군 9조합에서 bundled ≡ single(양도차익·LTHD·결정세액 3항목 전부 일치). 주장된 음수 차익은 「양도가액 < 평가액」일 때의 §166①1호 자체 거동으로 **단건에서도 동일하게 나온다**. 인용된 §166⑥은 「일괄양도 안분」이 아니라 **토지↔건물 가액 구분** 규정이고(법 §100② 위임), §166④1호가 평가액을 「관리처분계획등에 따라 정하여진 가격」으로 못박아 **권리가액은 안분 대상이 아니다**. 처방(SINGLE_ONLY 추가)이 증상을 고치지도 못한다. ※ **컴패니언**이 입주권인 경우는 별개이며 `P2-01`로 확정됐다. |
| `U2-02` | 컴패니언 승계 입주권의 승계취득가액 2칸 미탑재 | 컴패니언 Zod enum 자체에 칸이 없어 `S1-02`(축 접힘)의 하위 증상이다. 별건 결함이 아니다. |
| `P1-04` | 「deprecated 3필드가 도달 불가 refine을 만들고 validate 헤더 주석이 없는 검증을 기재한다」 | **헤더 주석이 약속한 검증 3건이 파일에 전부 존재한다**(`:239-243`, `:277-281` 등). 전체 정독 없이 grep으로 판단한 결과였다. |
| `L1-08` | 「1년 미만 70% (§104①3호 주택 본문)」 라벨 오기 | 인용·도달 모두 사실이나 라벨 자체는 성립한다고 판정. |

> 🔑 `P1-01`·`E3-04` 기각은 이 저장소가 이미 명문화한 판정 기준을 다시 확인해 준다 — `transfer-tax-validate.ts:117-119`가 `commercial_building`을 차단하지 않은 근거로 「**marker 부재만 보고 결함이라 판정하면 오진이다. 산출값까지 본다**」를 적어 두었고, 두 발굴이 정확히 그 함정을 밟았다.

## 7. 안전망 실측 결과 (mutation probe)

「테스트가 없다」는 주장은 전부 해당 코드를 실제로 망가뜨린 뒤 전건(7,032 테스트)을 돌려 반응 건수를 세어 확인했다.

| 지점 | 뮤테이션 반응 | 실측 세액 차이 |
|---|---|---|
| §89①4호 가목 세대 구성 요건 게이트 | **0 / 7,032** | 259,611,000 → 0 |
| Zod `redevelopment` 스키마 필드 제거 | **0 / 7,032** | 57,995,960 → 123,486,000 |
| apt+receive 인가후 양도차손 0 clamp | **0 / 7,032** | Δ 20,900,000 |
| §166④1호 청산금 수령 비과세 5조건 중 3개 | 미검증 | Δ 21,847,466 |
| §166①1호 라우팅(토지+환산) | **0건** — 현행 라우팅을 고정하는 anchor 없음 | Δ 89,576,716 |

⇒ **§166 축의 핵심 분기 대부분이 안전망 0건**이다. 수정에 착수하기 전에 anchor를 먼저 심어야 한다 — 지금은 무엇을 바꿔도 테스트가 알려주지 않는다.

## 8. 검증 미완 1건

검증 에이전트 1개가 API 오류로 중단되어 아래 항목은 반증 검증을 거치지 못했다. **미확정 상태**이며, 착수 전 별도 확인이 필요하다.

- `T1-03` [주장 high] 소득세법 시행령 §166⑤ LTHD 표1 「3년 미만 0%」 게이트가 전건 미검증 — `lib/tax-engine/redevelopment-lthd.ts:343`. years∈{1,2} 구간이 201회 호출 중 0회, 실측 Δ 2,816,000(발굴자 주장).

## 9. 이 리뷰가 건드리지 않은 것

- **부담부증여 × 입주권·재개발APT** — 설계만 완료(PR #1232)되고 구현 미착수인 **알려진 상태**라 결함으로 보고하지 않았다.
- **분양권의 부담부증여** — 도메인 오너가 범위 밖으로 결정한 사항이다.
- **R8(관리처분인가일 이후 주택 상태 유지 시 양도일 기준 자동 판정)** — 근거 예규 미특정으로 「현행(사용자 override)이 정답」으로 확정된 사항이다.
- 리뷰 중 코드는 **한 줄도 수정하지 않았다**. mutation probe는 전부 원복했고 worktree는 clean 상태다.
