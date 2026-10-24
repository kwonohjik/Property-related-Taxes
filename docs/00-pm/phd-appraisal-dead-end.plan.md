# 개별주택가격 미공시 환산(PHD · 영 §164⑦) 플래그 × 환산 아닌 취득가액 방식 — ⑧ 통과 후 route 400 · 침묵 오산 수정 계획서

**상태**: **PR-1 Do 완료(커밋, push·PR 전 — §9.1)** · **PR-2 Do 완료(커밋, push·PR 전 — §9.2)** · **Plan 부분 확정**(2026-10-24) — 사용자가 §11 **Q-4를 제외한 Q-1~Q-3·Q-5~Q-11을 권장안(★)으로 확정**했다. **Q-4 = (b) 확정**(2026-10-24 — 「환산 개별주택가격 계산해 채우기」 버튼). **용어 지시**: 법령에 없는 조어(«추정값»·«법정 추정값»·«법정 값»·«법정 환산 개별주택가격» 등)를 쓰지 않고, §164⑦ 산식 결과는 **«환산 개별주택가격»**이라고만 부른다(사용자 지시). 소스는 건드리지 않았다(실측은 작성 시 throwaway probe — 저장소 미보존).
**브랜치**: `docs/phd-appraisal-dead-end-plan` (origin/master `dca56587f` 위)
**발단**: `docs/00-pm/self-built-housing-building-base-114-2.plan.md` §9 PR-4 Do 기록 «기존(종전부터): PHD × 감정 조합은 ⑧ 을 통과하나 route 가 400». 이 문서가 그 «확인 필요»를 닫는다.
**작성**: 엔진(transfer-tax-senior) + UI(transfer-tax-ui-senior) 병렬 조사 통합. UI 조사 내용은 §6·§7.2·§9 에 승격했다.

> ⚠️ **KoreanLaw MCP 연결 실패**(`UND_ERR_CONNECT_TIMEOUT: www.law.go.kr:443`). 법령은 **법제처 DRF 를 `lawService.do` 로 직접 호출**(저장소 `KOREAN_LAW_OC`, MST 290841 = 소득세법 시행령 시행 2026-10-01 현행)해 읽었다. §176의2③ 은 저장소 캐시(`.legal-cache`, 2026-09-20 수집)로 보강했고 DRF 현행 본문과 동일함을 확인했다.

---

## 0. 한 줄 요약

**결함은 «감정 × PHD» 가 아니라 «PHD 플래그 ON × 취득가액 산정 방식이 환산이 아님(실거래가·감정가액·매매사례가액)»** 이다. 취득일 < 2005-04-29 주택이면 ⑤ 의 effect 가 **방식과 무관하게** `usePreHousingDisclosure=true` 를 **자동으로 켠다**(`CompanionAcqPurchaseBlock.tsx:212-228` — 조건에 방식 항이 없다). 토글(카드)은 환산에서만 보이므로(`:443-451`) 실거래가·감정 사용자는 **켜진 줄도 모른다**. 그런데 ④ 는 그 플래그를 방식 없이 읽는다(`phdFlagEffective` → `usesPhd`). 결과 두 증상:

| 증상 | 조건 | 결과 |
|---|---|---|
| **(A) 막다른 길** | 플래그만 ON(3-시점 칸 비어 있음) | ⑧ 0건 통과 → ④ 가 PHD 키는 **안 싣고** `landAcquisitionDate`(=취득일) 후퇴만 싣고 취득시 기준시가를 **지움** → ⑫ 가 분리 계산 V7 로 **화면에 없는 칸**(`landStandardPriceAtTransfer`·`buildingStandardPriceAtTransfer`) 요구 → **400** |
| **(B) 침묵 오산** | 환산에서 3-시점 칸을 채운 뒤 방식만 감정·매매사례로 전환 | ⑧ 통과 → 200 이지만 ④ 가 `standardPriceAtAcquisition` 을 지워 **개산공제 0**(엔진은 감정·매매사례의 개산공제 base 로 그 값을 읽는다) — 대표 픽스처 총세액 184,118,000 → **185,966,000**. 본인 신축 감정이면 건물분 가산세 카드도 닫혀 가산세 base 가 자산 전체(UI 실측 총세액 260,338,760 → **273,339,000**) |

**권장(Q-1 ★ (가))**: «PHD 가 유효한가» 술어(`phdFlagEffective`)에 **취득 방식(환산) 축**을 넣는다 — ⑤ 토글 노출 조건의 방식 항과 **같은 leaf**. 읽는 쪽 파생(저장값 삭제 없음 · useEffect→store 금지 준수). ④·⑧·다건 ⑧·부수 소비처 14곳이 한 번에 정렬된다. 신규 입력·위젯·메시지 0, 엔진(Layer 2) 변경 0. 법리상 감정·매매사례의 개산공제 base 는 «취득당시의 라목 가액»이고 최초공시 전 주택이면 그것이 §164⑦ 환산 개별주택가격이라는 점(§3)은 **사용자가 «취득시 기준시가» 칸에 입력**하는 현행 UX 로 처리하고(힌트 한 줄), 그 환산 개별주택가격을 PHD 입력에서 엔진이 도출하는 (다) 는 후속 선택지로 둔다(Q-4).

---

## 1. 재현 — 실제 폼 → ⑧ → ④ → route

harness: `collectStepIssues(0~5)`(⑧) → `callTransferTaxAPI` 가로채기(④) → `POST /api/calc/transfer`(⑫⑭+엔진) — `__tests__/calc/_self-built-housing-fixture.ts`·`one-house-dec-pr5` 와 같은 골격. 단건 대표 셀: **취득 2003-01-10 · 양도 2026-03-01 · 양도가 10억 · 2주택(일반과세) · 감정가액(`fixedAcquisitionPrice`) 3억 · 취득시 기준시가 2억/양도시 4억(직접 입력)**, PHD 11칸은 `최초공시 2005-04-30 · 최초 개별주택가격 1억 · 토지 100㎡ · 취득시 ㎡당 100만/건물 6천만 · 최초시 110만/6,100만 · 양도시 주택 4억 · ㎡당 240만/건물 1.6억`.

### 1.1 최소 재현 (단건)

| # | 방식 | PHD | ⑧ | ④ 본문 | route | 비고 |
|---|---|---|---|---|---|---|
| R-1 | 실거래가 | 플래그만 ON | 0건 | `landAcquisitionDate=2003-01-10` · PHD 키 없음 · `standardPriceAtAcquisition` 없음 | **400** `fieldErrors.landStandardPriceAtTransfer·buildingStandardPriceAtTransfer` (`message: 입력값이 올바르지 않습니다`) | 1세대1주택(비과세 시료)에서도 동일 |
| R-2 | **감정** | 플래그만 ON | 0건 | R-1 과 같음 | **400** 동일 | PR-4 가 기록한 «기존 결함» |
| R-3 | 매매사례 | 플래그만 ON | 0건 | 〃 | **400** 동일 | |
| R-4 | 감정 | 11칸 채움 | 0건 | PHD 키 있음 · `standardPriceAtAcquisition` 없음(2억 입력했는데도) | 200, 개산공제 **0** · 총세액 **185,966,000** | 같은 입력에서 플래그 OFF = 개산공제 6,000,000 · **184,118,000** (증상 B) |
| R-5 | 감정 | 11칸 채움, 취득일 2010-01-10(≥ 최초공시일) | 0건 | PHD 키 있음 | **400** `fieldErrors.preHousingDisclosure.firstDisclosureDate` (`취득일 … 최초 고시일 이후 — … 3-시점 환산(§164⑦) 대상이 아닙니다`) | 날짜를 바꾼 뒤 남은 stale. 환산이면 ⑧ 이 같은 문구로 먼저 막는다(`validate-acquisition.ts:511-528`) — 비환산은 ⑧ 이 PHD 를 보지 않아 서버가 처음 안다 |
| R-6 | 환산(대조) | 플래그만 ON | **1건 차단**(`phdFirstDisclosureDate`) | — | — | 환산은 정상 — 끌 수 있는 토글이 보인다 |
| R-7 | 감정, 플래그 OFF(대조) | — | 0건 | 취득시 기준시가 2억 전송 | 200 · 개산공제 6,000,000 · 184,118,000 | |

400 발생 지점(R-1~R-3): ⑧ 이 아니라 **⑫ Zod `refineSplitAcquisitionInputs` V7** — `lib/api/transfer-tax-schema-required-refines-2a.ts:467-470`(메시지 «토지·건물 분리 계산에는 양도시 기준시가 토지분(…)이 필요합니다 (소득세법 §99①1호 가목)»). 엔진 throw 가 아니다. R-5 는 `lib/api/transfer-tax-schema-refines.ts:203-209`.

### 1.2 경로 전수 격자 (throwaway · 180셀)

3경로 × 취득일 2(2003-01-10 · 2010-01-10) × 방식 5(실거래가 · 환산 · 감정 · 매매사례 · 환산+감정 잔재) × PHD 3(OFF · 플래그만 · 11칸) × 취득시/양도시 기준시가 직접 입력 2(있음 · 없음). 한 셀 = 폼 → ⑧ 전 단계 → ④ → route.

| 경로 | 비환산 × PHD ON 셀 | ⑧ 통과 ∧ **400** | ⑧ 통과 ∧ 200 ∧ **세액이 플래그 OFF 쌍둥이와 다름** | ⑧ 차단 | 비고 |
|---|---|---|---|---|---|
| **단건** | 32 | **24** | **3** (감정 · 매매사례 · 환산+감정 잔재 × 11칸 × 기준시가 있음, 2003) | 0 | 나머지 5셀은 PHD 를 보내고 무시했지만 세액 동일(무해) |
| **함께 양도**(첫 자산이 PHD 호스트) | 32 | **24** | **3** | 0 | **둘째 이후 자산은 영향 없음** — ④ `usesPhd:false`(`transfer-tax-api-companion-payload.ts:276`) · 컴패니언 ⑫ 스키마에 PHD 필드 없음. probe 4셀(둘째 est/app/actual × 플래그만) 전부 200 |
| **다건** | 32 | 0 | 0 | **32 (`MULTI_PHD_UNSUPPORTED_MESSAGE` «단건 계산기에서만 지원» — 환산 아닌 자산에서도)** + 환산 8 | 반대 방향의 같은 결함: 켠 적 없는 플래그로 다건 실거래가가 막히고 끌 칸이 없다 |

합계: **막다른 길(⑧ 통과 ∧ 400) 48셀, 침묵 오산 6셀, 다건 차단 비환산 32셀**. 환산 셀은 전부 종전과 같다(⑧ 이 11칸을 요구하거나 PHD 경로 정상).

- **별개 취득(토지·건물 취득일 다름) × 파트 모드 3×3 × PHD 3 = 27셀**: 전부 200 — 양도시 파트 기준시가(V7)가 ⑤ 파트 카드에 보여 채워지는 경로라 막다른 길이 없다. 두 파트가 **모두 환산**일 때만 PHD 경로(206,154,088)를 탄다 — 이 축은 이 수정이 바꾸지 않는다(§5.2).
- **지분·일체/공동주택·겸용**: 지분은 ④ 의 지분 스케일이 PHD 판정과 무관(`usesPhd` 는 플래그만)이라 단건과 같은 갈래로 본다(§8.1 격자에 차원으로 넣어 증명). 공동주택은 `phdHousingType` 만 다르고 같은 경로. **겸용주택은 별도 패널·별도 ⑧**(§5.3).
- **UI 실렌더 확인(jsdom)**: 취득일 2000-03-01 · 실거래가 → effect 가 `usePHD=true` 로 켜고 토글 카드는 없음. 환산 + 2000-03-01 → 토글 있음 → 라디오 «감정가액» 클릭 → `usePHD=true` 유지 · 토글 소거. **브라우저 수동 확인은 미수행**(DateInput 이 날짜를 완성형으로만 올리는지 = effect 발화 시점은 확인 필요).

---

## 2. 원인 — 방식 축이 어느 술어에도 없다

`lib/calc/phd-toggle-scope.ts`(181줄) 술어 현황: `phdToggleReachable`(자산 종류 축) · `phdToggleCauseReachable`(취득원인 축) · `phdFlagEffective`(플래그 ∧ 토지원인혼합 아님 ∧ 원인 축, `:142-153`) · `phdPayloadActive`(이월과세 ∨ `phdFlagEffective` ∧ 종류 축, `:162-181`). **환산 여부는 어디에도 없다.**

| 층 | 위치 | 방식 축 | 결과 |
|---|---|---|---|
| ⑤ 토글 노출 | `CompanionAcqPurchaseBlock.tsx:443-451` | **있다**(raw `props.useEstimatedAcquisition ∨ (별개 취득 ∧ 파트 환산)`) | 비환산에서 숨김 |
| ⑤ 자동 ON | `:212-228` effect, deps `[acqDatePrePHD]` | **없다** | 취득일 < 2005-04-29 주택이면 방식과 무관하게 켠다 |
| ⑤ 방식 전환 | `handleAcqBasisChange` `:113-137` | 3플래그만 만진다 | `usePreHousingDisclosure` 를 끄지 않는다(전체 grep: 끄는 곳은 `housing-flag-reset.ts:60` 자산 종류 변경뿐) |
| ⑧ PHD 11칸 | `transfer-tax-validate-acquisition.ts:511` `if (usesPhd && isEstimated)` | **있다** | 비환산에서 요구 안 함(주석 `:510` «플래그가 잔존해도 무시») |
| ⑧ 개산공제 base 면제 | `transfer-lump-sum-base-gate.ts:54` `lumpSumBaseRequired` → `usesPhdGate`(`:22-25`) | **없다** | 플래그만 ON 이면 «PHD 가 대신 도출»로 보고 감정·매매사례의 취득시 기준시가 요구를 **면제**. 이 가정을 `lump-sum-deduction-required-stdprice.anchor.test.ts` A-12 가 못박았다 |
| ⑧ 분리 검증 | `transfer-tax-validate-split.ts:233·243·253` | **없다** | «PHD 키가 간다»고 보고 토지 취득일·분리 요구를 건너뜀 |
| ⑧ 본인 신축 scope | `self-built-housing-scope.ts:89` `usesPhdGate` | **없다** | 감정 + 플래그면 건물분 카드·요구가 null(범위 밖) → 증상 B 의 가산세 base 자산 전체 |
| ④ `usesPhd` | `transfer-tax-api-primary-context.ts:108` → `transfer-tax-api.ts:382` `standardPriceAtAcquisition: hasPre1990 \|\| usesPhd ? undefined` | **없다** | 감정·매매사례의 개산공제 base 미전송(엔진은 `transfer-tax-helpers.ts` 의 감정·매매사례 분기에서 `input.standardPriceAtAcquisition` 으로 개산공제 계산) |
| ④ 분리 후퇴 | `transfer-tax-api-split.ts:245` `usesPhd \|\| selfOwnsEff !== "both" \|\| excessSplit ? acquisitionDate` | **없다** | `landAcquisitionDate` 를 실어 ⑫ 분리 검증을 켠다 |
| ④ PHD 키 | `transfer-tax-api-body-blocks.ts:352-362` `phdPayloadActive ∧ 최초공시일 ∧ 가격 > 0` | **없다** | 칸이 **차 있으면** 키가 가고 **비어 있으면** 안 간다 → 이것이 증상 A/B 를 가른다 |
| ⑫ | `required-refines-2a.ts:327`(`d.preHousingDisclosure` 있으면 분리 검증 면제) · `:354`(`!landAcquisitionDate` 면 return) · `:467-470`(V7) | — | 키 유무 + 토지 취득일 유무로 갈린다 |

**400 의 정확한 기전(A)**: ⑧ 은 «PHD 가 간다»고 믿고 분리 검증·기준시가 요구를 건너뜀 → ④ 는 키는 못 싣지만(칸 비어서) 후퇴 `landAcquisitionDate` 와 기준시가 삭제는 실행 → ⑫ 의 `if (!d.landAcquisitionDate …) return` 을 통과해 V7 이 걸림. **침묵 오산(B)**: 칸이 차 있으면 키가 가서 ⑫ 면제 → 200 이지만 엔진은 방식이 감정이라 PHD 경로(`phdSplitPathTaken`: 토지·건물 양쪽 환산일 때만, `housing-excess-split.ts:148-155`)를 안 타 PHD 는 무시되고, 지운 기준시가 때문에 개산공제 0.

**«PHD 는 환산 전용인가?»** — 엔진·⑧ 은 환산 전용으로 설계돼 있다(⑧ `isEstimated` 게이트 · 엔진 `phdSplitPathTaken` · ⑤ 노출). ④ 와 ⑧ 일부(개산공제 base·분리·본인 신축 scope)만 방식 축을 빠뜨렸다. 이 형제 술어가 한 번 고쳐진 전례가 같은 파일에 있다 — `phd-toggle-scope.ts:1-24`(자산 종류를 바꾼 뒤 «끄는 수단도 채울 칸도 없는 영구 차단»)와 `phdToggleCauseReachable`(D2-2 Check). **방식 축은 그때 같이 닫히지 않은 세 번째 축**이다.

---

## 3. 법령 (DRF 직접 · MST 290841 · 시행 2026-10-01 현행 · 본문 verbatim)

| 조문 | 본문 | 요지 |
|---|---|---|
| **소득세법 시행령 §164⑦** | 「「부동산 가격공시에 관한 법률」에 따른 개별주택가격 및 공동주택가격(이들에 부수되는 토지를 포함한다)이 공시되기 전에 취득한 주택의 **취득당시의 기준시가는** 다음 산식에 의하여 계산한 가액으로 한다. …」 (산식: 국토교통부장관이 당해 주택에 대하여 최초로 공시한 주택가격 × 취득당시의 가목·나목 가액 합계액 ÷ 최초로 공시한 주택가격 공시당시의 가목·나목 가액 합계액) | §164⑦ 은 **공시 전 취득 주택의 «취득당시의 기준시가»를 정의**한다 — 환산 분자뿐 아니라 «취득당시의 기준시가»를 쓰는 모든 곳에 걸린다 |
| **소득세법 시행령 §163⑥** | 「⑥ 법 제97조제2항제2호 각 목 외의 부분 본문에서 "대통령령으로 정하는 금액"이란 … 2. 건물 가. 법 제99조제1항제1호 다목의 규정에 의한 건물(그 부수토지를 포함한다) 및 동호 **라목의 규정에 의한 주택 취득당시의 법 제99조제1항제1호 다목 또는 라목의 가액×3/100** (미등기양도자산 3/1000) …」 | 감정·매매사례·환산 취득가액의 필요경비는 «취득당시의 **라목 가액** × 3%» |
| **소득세법 시행령 §176의2③** | 「③ 법 제114조제7항에 따라 양도가액 또는 취득가액을 추계결정 또는 경정하는 경우에는 다음 각 호의 방법을 **순차적으로 적용**… 1. 매매사례가액 2. **감정가액** 3. 제2항의 규정에 의하여 환산한 취득가액 4. 기준시가」 | 감정가액은 환산취득가액에 **앞선** 방법이다. 환산 분모(양도 당시 기준시가)·분자(취득 당시 기준시가)를 쓰지 않는다 |

**결론**
1. **감정가액으로 취득가액을 정하면 §164⑦ 3-시점 환산(PHD)은 취득가액 산정에 불필요**하다 — 감정가액이 곧 취득가액이다. PHD 11칸 중 양도시 3칸(양도시 개별주택가격·㎡당 공시지가·건물 기준시가)은 감정에서는 아무 데도 쓰이지 않는다. 실거래가도 마찬가지다.
2. 그러나 **«취득당시의 라목 가액»(개산공제 base)은 최초공시 전 취득 주택이면 §164⑦ 환산 개별주택가격**이다. 그래서 «감정 × 공시 전 주택»에서 PHD 는 **개산공제 base 를 만드는 데에만** 법리상 관련이 있다. 현행 ⑧ 은 이 점을 알고 «PHD 가 켜져 있으면 취득시 기준시가 요구 면제»(A-12)로 짰지만, **엔진의 감정·매매사례 분기는 PHD 에서 base 를 도출하지 않는다**(`transfer-tax-helpers.ts` 감정 분기 = `input.standardPriceAtAcquisition ?? 0`) — 즉 ⑧ 의 면제 전제가 구현되지 않았다. 이 불일치가 증상 B 의 핵심이다.
3. 그 외 §114조의2 가산세(감정가액·환산취득가액의 5% — 해당 «건물»의 감정가액)·장기보유특별공제·고가주택 안분·세율은 취득시 **기준시가**를 쓰지 않는다. 실측: 개산공제 외에 PHD 유무로 세액이 갈리는 항목 없음(R-4 vs R-7 의 차이는 `estimatedDeduction`·`expenses`·양도차익·장특 파생뿐).
4. 본인 신축 × 감정은 PHD 와 무관하게 건물분 감정가액이 필요하다(PR-4). 환산 × 본인 신축 × PHD 는 건물 파트가 이미 축이라 건물분 카드가 범위 밖(의도 — `self-built-housing-scope.ts:89`).

---

## 4. 대안 비교 (대표 픽스처 수치)

고정 시료 = §1 대표 셀. 감정가액 3억, 취득시 기준시가를 사용자가 입력하는 값에 따라 세액이 움직인다. §164⑦ 환산 개별주택가격 = floor(1억 × (100만×100+6,000만) ÷ (110만×100+6,100만)) = 1억 × 1.6억/1.71억 = **93,567,251**.

| 안 | 내용 | 개산공제 | 총세액(대표 셀) | 비고 |
|---|---|---|---|---|
| 현행(R-4) | PHD 키 전송 · 기준시가 삭제 | **0** | **185,966,000** | 사용자가 칸에 2억을 입력했어도 버려진다 |
| **(가)** 방식 인지 술어 | 비환산이면 PHD 비노출·미전송·미요구, 취득시 기준시가 전송·요구 | 입력 기준시가 × 3% | 입력 2억이면 184,118,000 · **§164⑦ 환산 개별주택가격 93,567,251 입력이면 185,101,438**(est 2,807,017) | §164⑦ 산식 값(환산 개별주택가격)을 쓰려면 사용자가 그 값을 입력 |
| (나) ⑧ 조합 차단 | 비환산 ∧ 플래그 ON 이면 ⑧ 에서 막고 안내 | — | 계산 불가 | 토글이 비환산에서 숨겨져 **끌 칸이 없다**(앵커는 방식 라디오뿐) · 자동 ON 이라 실거래가 사용자도 막는다 → `phd-toggle-scope.ts:1-24` 재발. **기각** |
| (다) 엔진이 PHD 로 base 도출 | 감정·매매사례 + PHD 7칸(양도시 3칸 제외) → 엔진이 §164⑦ 환산 개별주택가격을 개산공제 base 로 | 환산 개별주택가격 × 3% | **185,101,438**(= (가) 에 환산 개별주택가격을 입력한 값) | ⑤ 카드를 감정·매매사례에도 열고(양도시 3칸 조건부) · ④ 전송 조건 · ⑧ 7칸 요구 · ⑫ PHD 스키마 양도시 3칸 조건부 optional · 엔진 감정·매매사례 분기 · 결과 echo — **14지점 신규 경로**. 법리상 가장 정확하나 비용 큼 |
| (라) (가) + 환산 개별주택가격 보조 | (가) 에 «환산 개별주택가격 계산해 채우기» 버튼(PHD 카드 재사용, 클릭 시 한 번 `onChange` — useEffect 미러링 아님) | 〃 | 〃 | UI 신규 위젯 1개. (다) 보다 작고 §164⑦ 산식 값(환산 개별주택가격)을 쉽게 얻게 한다 |

**수치 영향 요약**: (가) 는 **환산 아닌 방식에서 종전 400 을 200 으로**, 그리고 **침묵 오산을 입력값 반영으로** 바꾼다. §164⑦ 산식 값을 입력한 경우(185,101,438)와 임의 입력 값(184,118,000)의 차이는 사용자가 입력하는 기준시가의 문제이며 (다)/(라) 가 이 간극을 메운다. 환산 셀·겸용·이월과세는 **변화 0** 이어야 한다(§8.3 격자).

**저장 세션 영향**: 저장값은 지우지 않는다(읽는 쪽 파생 — `phdToggleCauseReachable` 정책 «저장값은 지우지 않는다»). ③ normalize 변경 0. 증상 A 세션은 «다시 계산» 시 400 → 200. 증상 B 세션은 «다시 계산» 시 입력해 둔 기준시가가 처음 반영돼 세액이 바뀐다(이력 `resultData` 를 열기만 하는 경로는 재계산이 없어 영향 없음 — 이미 저장된 증상 B 이력의 틀린 세액은 남는다, Q-9). 환산 ↔ 감정 왕복 시 PHD 11칸 값 보존.

**침묵 strip 위험(받아 놓고 무시 금지)**: (가) 에서는 비환산일 때 PHD 입력 칸이 **화면에 없고**(⑤) ④ 도 안 보내며 ⑧ 도 안 요구한다 — 숨은 입력 = 미전송 = 미요구의 3중 일치. 직접 API 호출자가 `preHousingDisclosure` + 비환산을 보내면 엔진이 PHD 를 조용히 무시한다(현행과 동일) — ⑫ 방어선은 Q-5.

---

## 5. 권장 설계 — (가)

### 5.1 술어

`lib/calc/phd-toggle-scope.ts` 에 방식 leaf 1개를 추가하고 `phdFlagEffective` 가 AND 한다.

- **정의**: 비별개 취득 → «환산인가» = `!isSalesCaseAcquisition ∧ !isAppraisalAcquisition ∧ useEstimatedAcquisition`(우선순위 매매사례 > 감정 > 환산 — ④ `primaryAcquisitionModeFlags`·⑧ `isEstimated`·`deriveLegacyPartAcqMode` 와 같다). 별개 취득 → ⑤ 노출 조건과 같게 «토지·건물 파트 중 하나라도 환산». 겸용주택·이월과세는 이 leaf 의 적용 밖(각자 패널·게이트 — §5.3).
- **순환 import 주의**: `transfer-tax-split-acq-mode.ts` 가 `phdFlagEffective` 를 import(`:20`·`:559`)하므로 `phd-toggle-scope.ts` 가 `deriveLegacyPartAcqMode`·`effectivePartAcqMode` 를 import 하면 순환이다. leaf 는 **3줄 우선순위 파생을 자체 보유**하고, `deriveLegacyPartAcqMode` 와의 동치를 anchor 로 잠근다(8플래그 조합). 별개 취득 판정(`isSeparateAcquisition` 도 같은 파일)은 raw `hasSeperateLandAcquisitionDate === true ∧ 파트 모드 문자열`로 근사하고 격자로 ⑤ 노출 조건과 동치를 증명한다 — 불일치 셀이 나오면 별개 취득은 «종전 그대로(방식 축 미적용)»로 후퇴(§12 V-3).
- **소비처 전수**(`rg phdFlagEffective|phdPayloadActive|usesPhdGate`): ④ `primary-context:108`·`multi-transfer-tax-api.ts:164`·`body-blocks:356`, ⑧ `lump-sum-base-gate:22-24,54`·`validate-acquisition:499`·`validate-split:233,243,253`·`validate-split-carryover:88`(`phdPayloadActive`)·`multi-transfer-tax-validate:167`·`transfer-tax-split-acq-mode:559`·`housing-excess-split:65`·`self-built-housing-scope:89`·`donor-built-part-scope:29`, 양도시 기준시가 칸 `selling-std-price-scope:65,88,108,122`, ⑤ `CompanionAcqStdPriceSection:111`. 한 술어 수정으로 전부 정렬되고 호출부는 한 줄도 바뀌지 않는다.
- **적용 안 하는 곳**: ⑤ 자동 ON effect(`:212-228`) — «수렴하는 boolean 래치»로 의도적 예외, 술어가 해결하므로 건드리지 않는다(Q-7). ⑧ 11칸 게이트 `usesPhd && isEstimated` — 이미 방식 인지. 이월과세 `carryoverPhdMode` — 자기 축(`carryover.estimationMode`).

### 5.2 별개 취득에서 파트 한쪽만 환산인 경우 (확인 필요 · 이 PR 이 바꾸지 않는 축)

⑤ 토글은 «한 파트라도 환산»에서 열리고 엔진 PHD 경로는 «양쪽 환산»에서만 탄다(`phdSplitPathTaken`). 파트 혼합(`estimated` + `actual`)에서 PHD 11칸을 채우면 키는 가지만 엔진이 무시한다(probe: 세액이 PHD OFF 와 동일 — 침묵 무시). 이 PR 의 방식 축은 ⑤ 노출 조건을 그대로 따르므로 이 셀을 **바꾸지 않는다**. 필요하면 별건(V-4).

### 5.3 겸용주택 · 이월과세 (범위 밖 — 변화 0 증명 대상)

- **겸용주택**: 별도 패널(`MixedUseLegacyStdPrice`), ④ `transfer-tax-api-mixed-use.ts:127 phdOn`, ⑧ `transfer-tax-validate-mixed-use-asset.ts:116·165·174`. 겸용 총액 모델 × 비환산 × PHD 플래그는 ⑧ 이 **«겸용주택 {실거래가|감정가액|매매사례가액} + 개별주택가격 미공시(환산) 조합은 아직 지원하지 않습니다. 환산취득가 모드로 입력하세요»** 로 차단한다(probe: 실거래가·감정 모두). 자동 ON effect 가 겸용도 켜므로(`assetKind === "housing" || isMixedUse`) 같은 stale 플래그가 겸용 비환산을 막는다 — 엔진 한계(X-7)로 명시된 차단이라 막다른 길인지 판단하려면 겸용 PHD 토글이 비환산에서 보이는지 확인해야 한다(**확인 필요**, V-5). 이 PR 은 `isMixedUseHouse` 를 술어 적용 밖에 둬 **변화 0**.
- **이월과세**: `carryoverPhdMode`(자기 `estimationMode` 축). `phdPayloadActive` 의 첫 갈래라 영향 없음.

### 5.4 형제 소비처에 생기는 변화 (코드 판독 — 술어 수정 후 격자로 확인)

| 소비처 | 현행(비환산 + 플래그) | (가) 후 |
|---|---|---|
| `selling-std-price-scope.ts:65·88·108·122` — 양도시 기준시가 칸 | «다른 곳에 있음»으로 칸을 숨기고 ⑧ 앵커가 `phdTransferHousingPrice`(비환산에서 안 보이는 칸) — 가액기준 지역 중과 필요 시 막다른 길 가능 | 칸이 열리고 앵커가 `standardPriceAtTransfer` |
| `depreciation-scope.ts:84` | PHD 플래그면 감가상각비 입력을 «미지원»으로 숨김 | 비환산에서는 입력 가능 |
| `CompanionAcqStdPriceSection.tsx:111` | 별개 취득 + 비환산에서 «위 §164⑦ 3-시점 입력으로부터 자동 도출» 문구가 숨은 패널을 가리킴 | 문구 사라짐 |
| `ExpropriationBlock.tsx:86`·`expropriation-required-gate.ts:141·164`·`transfer-tax-validate-expropriation.ts:53` | 주택 regular split 판정에 원시 플래그 | (원시 `usePreHousingDisclosure` 를 읽는 곳 — 술어 경유 여부 확인 필요, V-6) |
| `UnifiedReductionPanel.tsx:148`·`transfer-phrp-stdprice-link.ts:30`·`reverse-appurtenant-swap.ts:126` | 원시 플래그 | 동상(V-6) |
| `multi-transfer-tax-validate.ts:167` | 비환산에서도 «단건 전용» 차단 | 환산에서만 차단(Q-6) |

---

## 6. 14지점 · ⑧↔⑫ 격자

### 6.1 14지점 (대안 (가))

| 지점 | 변경 | 근거 |
|---|---|---|
| ① 폼 상태 | 없음 | 필드 추가 0 |
| ② initial | 없음 | |
| ③ normalize | 없음 | 읽는 쪽 파생 — 저장값 보존(Q-8) |
| ④ API 변환 | `phdFlagEffective` 경유 `usesPhd`(`primary-context:108`)·`phdPayloadActive`(`body-blocks:356`)·다건 `multi-transfer-tax-api:164` — **호출부 변경 0**(술어가 바뀜) | 비환산에서 PHD 키·`landAcquisitionDate` 후퇴 미전송, `standardPriceAtAcquisition` 전송 |
| ⑤ 위젯 | 토글 노출(`Block:443-451`)·`StdPriceSection:111` 을 **같은 leaf** 로 — 노출 결과는 사실상 불변(리팩터) | 신규 위젯·tone·문구 0. 감정·매매사례 «취득시 기준시가 — 개산공제 기준액» hint 한 줄(Q-4) |
| ⑥ 사이드바 | 없음 | 단건 환산 프리뷰 게이트 `transfer-per-asset-summary.ts` `canPreviewEstimated` 는 PHD 무관 |
| ⑦ 결과 | 없음 | 감정 × 본인 신축은 기존 `SelfBuiltPenaltyCard` 가 열릴 뿐(PR-3 구현 그대로) |
| ⑧ 검증 | `usesPhdGate`(개산공제 base·본인 신축 scope)·`validate-split:233·243·253`·`multi-transfer-tax-validate:167` 이 같은 leaf — **신규 오류 메시지 0** | |
| ⑨~⑪ Zod enum·acquisitionDate fallback | 없음 | |
| ⑫ Zod 입력 객체 | 변경 없음 권고(Q-5) | ④ 가 키를 안 보내므로 400 이 사라진다 |
| ⑬ body spread | 없음 | |
| ⑭ Route 매핑 | 없음 | |

**ⓐ 3중 패턴**: UI display fallback(토글 노출) · API 변환(④ `usesPhd`·PHD 키) · validate(⑧ 11칸·개산공제 base) 를 **한 leaf** 로 맞춘다. useEffect→store 미러링 없음. 자동 안분 fallback 없음 — 비환산 감정·매매사례의 취득시 기준시가는 **⑧ 이 요구**하고(빈 값 침묵 0 금지), 환산 개별주택가격을 자동 대입하지 않는다.

### 6.2 ⑧↔⑫ 격자 (dead-end 0)

불변식: **⑧ 통과 ⇒ route ≠ 400**(PHD 차원 전 격자). 현재는 §1.2 의 48셀이 위반이다. 차원: 경로 3(단건 · 함께 양도 첫 자산 · 다건) × 취득일 {2003 · 2010(≥최초공시)} × 방식 8(실거래가 · 환산 · 감정 · 매매사례 · 환산+감정 · 환산+매매사례 · 감정+매매사례 · 3종 전부) × PHD 4(OFF · 플래그만 · 11칸 · 11칸 + 날짜 stale) × 기준시가 입력 {있음 · 없음} × `phdHousingType` {individual · apartment} × 지분 {100% · 50%} × 분리 {없음 · 별개 취득(파트 3×3)} ≈ 2,000셀+. 부가 불변식:
- **D2** 비환산 셀에서 `preHousingDisclosure` 키가 ④ 본문에 **없다**(환산 ∧ 11칸이면 있다).
- **D3** 비환산 셀의 세액 = 플래그 OFF 쌍둥이(같은 입력)의 세액 — PHD 가 세액을 움직이지 않는다.
- **D4** 환산 셀은 응답 JSON sha256 이 기준선과 **바이트 동일**.
- **D5** 다건 ⑧ 차단은 환산 셀에만 있다.
- **D6** 별개 취득 파트 모드 격자에서 술어 ≡ ⑤ 노출 조건(§5.1 순환 import 회피 구현의 동치 증명).

---

## 7. UI 승격 (transfer-tax-ui-senior 조사)

### 7.1 입력 UI 현황

| 항목 | 실측 |
|---|---|
| 토글 | `CompanionAcqPurchaseBlock.tsx:443-466` — `ToggleCard tone="amber" size="sm"` «취득 당시 개별주택가격 미공시 (§164⑦ 3-시점 계산)» + `PreHousingDisclosureSection`(281줄) |
| store 필드 | `usePreHousingDisclosure` + `phdFirstDisclosureDate`·`phdFirstDisclosureHousingPrice`·`phdLandPricePerSqmAtAcq/AtFirst/AtTransfer`·`phdBuildingStdPriceAtAcq/AtFirst/AtTransfer`·`phdTransferHousingPrice`(11칸). initial `calc-wizard-asset-factory.ts:231`(false) · normalize `calc-wizard-asset-migrate-rental-split.ts:399` |
| 노출 조건(AND) | `!isMixedUse` · `assetKind==="housing" \|\| isSplit` · `useEstimatedAcquisition \|\| (isSeparateAcq ∧ 토지·건물 파트 중 환산)` · `!isNonPrimaryAsset` · `!landCause` · `!buildingCause` · `asset ∧ onAssetChange` (`:443-451`) |
| 첫 자산 아님 | 토글 대신 amber 안내문(`:433-441`). `isNonPrimaryAsset = !isFirst`(`AssetSectionAcquisition.tsx:201`) |
| UI 순서 | 방식 라디오(`:391`) → PHD 토글(`:443`) → 금액(`CompanionAcqAmountSection`) → 기준시가(`CompanionAcqStdPriceSection`) — 계산 순서 준수 |
| 감정 모드 입력 | `CompanionAcqAmountSection.tsx:183-194` «취득시 기준시가 (원) — 개산공제 기준액» `required` — **플래그 ON 이어도 항상 보인다**. 그런데 ④ 가 그 값을 지우고(`api.ts:382`) ⑧ 은 요구를 면제한다 → 칸은 «필수» 표시인데 값이 버려지는 3자 불일치(증상 B 의 UI 측 모양) |

### 7.2 UI 쪽 변경 요약 (대안 (가))

- **신규 위젯 0 · tone 0 · placeholder 0 · ③ normalize 0 · ⑥ 0 · ⑦ 0**. 눈에 띄는 변화는 «사용자가 입력한 취득시 기준시가가 처음으로 개산공제에 반영된다»(감정·매매사례)뿐이다.
- 환산 → 감정 → 환산 왕복: 토글 ON · 11칸 값 그대로 복귀. 안내문 없음(Q-8 — 화면 밀도 우선 선례: `Block:372-376`).
- 감정·매매사례 «취득시 기준시가» hint 에 «취득일이 개별주택가격 최초 공시일 전이면 시행령 §164⑦ 산식으로 계산한 환산 개별주택가격(부수토지 포함 총액)» 한 줄(Q-4 ★ a). 같은 표현이 이미 배율 초과분 분리(#17-5) ⑧ 메시지(`transfer-tax-validate-housing-excess.ts`)에 있다.
- 감정 × 본인 신축 × PHD 잔재: 수정 후 건물분 카드가 새로 열려 ⑧ 이 건물 감정가액(앵커 `selfBuiltBuildingAppraisal`)을 요구 → 입력 → 정상 가산세(UI 실측: 가산세 base 110,000,000 · 세액 5,500,000 · 총세액 260,338,760 — 잔재 PHD 상태는 300,000,000 / 15,000,000 / 273,339,000).

### 7.3 증상 B 수치 (감정 · 본인 신축 · 건물 감정가액 1.1억, PHD 11칸 채운 뒤 방식 전환)

| | 정상(PHD 없음) | 잔재 PHD | 차이 |
|---|---|---|---|
| 필요경비(개산공제) | 6,000,000 | **0** | −6,000,000 |
| 양도차익 | 694,000,000 | 700,000,000 | +6,000,000 |
| §114조의2 가산세 base / 세액 | 110,000,000 / 5,500,000 | **300,000,000 / 15,000,000** | +9,500,000 |
| 총 결정세액 | 260,338,760 | **273,339,000** | +13,000,240 |
| 건물분 카드 | 있음 | **없음** | — |

결과 화면(⑦)에서 사용자가 틀린 숫자를 알아챌 단서가 없다 — PHD 상세 카드는 엔진 echo `preHousingDisclosureDetail` 가 있을 때만(`ValuationDetailCards.tsx:83·114`) 나오고, 건물분 카드도 `selfBuiltHousingPenalty` echo 가 없어 안 나온다.

---

## 8. 테스트 · 검증 계획

### 8.1 Pre-Do anchor (수정 전에 먼저 — «현행 일치 예상» 금지)

1. **재현 anchor**(수정 전 실패해야 한다 — 감도): R-1~R-3·R-5 ⑧ 0건 ∧ route 200 기대 → 현재 400 으로 실패. R-4 개산공제 6,000,000 기대 → 현재 0 으로 실패.
2. **불변 anchor**(수정 전 통과 · 수정 후도 통과): 환산 × PHD 11칸 대표 셀 총세액 206,154,088(est 2,807,016) · 플래그 OFF 감정 184,118,000 · 환산 OFF 122,518,000 · 함께 양도 둘째 자산 영향 없음 4셀 · 별개 취득 3×3×3 27셀.
3. **술어 진리표**: `phdFlagEffective`·`usesPhdGate`·`phdPayloadActive` × {환산 · 감정 · 실거래가 · 매매사례 · 환산+감정 잔재 · 별개 취득 파트 혼합} × {단건 첫 자산 · 컴패니언 · 다건 첫 자산}. `deriveLegacyPartAcqMode` 와 동치(8플래그 조합).
4. **기존 테스트 전제 뒤집힘(착수 전 실측 필요 — 이번 계획 작성 중 소스를 수정해 돌려 볼 수 없었다)**: `lump-sum-deduction-required-stdprice.anchor.test.ts` **A-12**(감정 + 2003 + PHD 플래그 → ⑧ 이 기준시가를 요구하지 않는다 — 이 전제가 틀렸다) · `multi-transfer-api-sync.test.ts:231` «PHD» 케이스(비환산 기본 시료면 이제 차단되지 않는다 — 환산 시료로 바꾸거나 단언을 뒤집는다) · `separate-land-date-required.g2.anchor.test.ts:178` «PHD 2003 취득»(토글 ON + 빈칸 → landAcquisitionDate; 시료 방식 확인) · `owner-split-building-std-leaf-parity.test.ts`(phd 차원) · `self-built-housing-scope.anchor.test.ts:88·102-104` · `self-built-housing-validate-parity.anchor.test.ts:83·190-196` · `self-built-housing-strict-parity.anchor.test.ts`(`SPLIT[phd]` 가 감정·매매사례 셀에서 범위 안으로 바뀜 → 기대 재산출 + D5 가드 추가). 값이 바뀌면 근거와 함께 갱신하고 단언 삭제 0.
5. 경계: 취득일 2005-04-28/29/30(자동 ON 경계) · `isPhdEligible` 최초공시일 당일 · 날짜 stale(R-5).

### 8.2 회귀 0 격자

기준선(master)과 수정 후를 **응답 전체 JSON sha256** 으로 대조(`git show HEAD:` 복원 트리 · cp 백업 · md5 대조 · `git checkout/stash` 금지). 기대 diff 집합 = {비환산 ∧ PHD 플래그 ON ∧ 첫 자산 ∧ 주택(공동주택 포함) ∧ 비겸용 ∧ 매매 취득} 셀의 ⑧ 이슈·④ 키·route 상태·개산공제·세액뿐. 나머지(환산 · 겸용 · 이월과세 · 비주택 · 상속·증여 · 부담부증여 · 재개발 · 다필지 · 실가 플래그 OFF)는 **바이트 동일**. 기준선 2회 · 수정 후 2회 sha 동일(비결정 0).

### 8.3 E2E (UI 시니어 초안 — `e2e/transfer-phd-non-estimated-mode.spec.ts` 신규, 약 250줄 이내)

| ID | 시나리오 | 단언 |
|---|---|---|
| PH-1 | 취득 2000-03-01 주택, 실거래가, 저장 세션에 `usePreHousingDisclosure:true` 만 | 수정 전 400. 수정 후 200 · body 에 `preHousingDisclosure`·`landAcquisitionDate` 없음 · 토글 카드 없음 |
| PH-2 | 환산 → 토글 ON·11칸 → 라디오 «감정가액» | 토글 소거 → 감정가액·취득시 기준시가 입력 → 200 · body 에 PHD 키 없음 · `standardPriceAtAcquisition` 있음 · 개산공제 반영 → 다시 «환산취득가» 클릭 → 토글 ON · 11칸 보존 |
| PH-3 | 감정 × 본인 신축 × PHD 잔재 | 건물분 카드 열림 · 빈칸이면 ⑧ 차단·앵커 `selfBuiltBuildingAppraisal` · 건물 감정가액 1.1억 → 가산세 **5,500,000** |
| PH-4 | 취득일 칸에 2000-03-01 직접 입력(DateInput) → 실거래가 유지 | 계산 200 (영향 인구가 가장 큰 경로) |
| PH-5 | 환산 + PHD ON 11칸 | PHD 키 있음 · PHD 상세 카드 · 종전 세액 불변 |
| PH-6 | 다건: 자산 1 감정 + PHD 잔재 | «단건 계산기에서만 지원» 문구 없음 · 환산 + PHD 면 유지 |
| PH-7 | 함께 양도 둘째 자산 PHD 잔재 + 감정 | amber 안내문 그대로 · 200 |

패턴 주의: 공용 카드 `data-testid` 미전달 함정 — 토글 존재는 `getByText`, 건물분 카드는 `getByTestId("self-built-housing-share")`. 안내문이 토글 제목을 인용하면 셀렉터가 깨진다(문구 변경 금지). 워크트리 실행은 `E2E_PORT` 필수.

### 8.4 뮤테이션 계획 (cp 백업 · label+file md5 키 · 전후 sha 대조 · 하네스 중단 시 잔존 변형 확인 · 12건)

(1) 방식 항 제거 → R-1~R-3 · D1 · (2) 방식 항을 raw `useEstimatedAcquisition` 로(감정+환산 잔재 셀) · (3) 우선순위 뒤집기(`isAppraisal` 보다 `use…` 먼저) · (4) 겸용 제외 제거 → 겸용 변화 0 격자 · (5) 별개 취득 파트 항 제거 → D6 · (6) `usesPhdGate` 만 방식 항 제거(⑧ 개산공제 base 면제 부활 → A-12 형 셀) · (7) `phdPayloadActive` 만 제거(④ 키 전송 부활 → D2) · (8) 다건 `multi-validate:167` 을 원시 플래그로 → D5 · (9) `selling-std-price-scope` 한 곳만 원시 플래그 · (10) 자동 ON effect 에 방식 조건 추가(되돌림 — 불필요 변경 감지) · (11) ⑤ 토글 노출만 raw 로 되돌림 → jsdom 토글 anchor · (12) `deriveLegacyPartAcqMode` 와의 동치 anchor 의 한 조합 오기. 분기 쌍을 갖춘 anchor 없이는 SURVIVED 가 나오는 전례(이월과세 PR-3 N02)를 반복하지 않는다.

---

## 9. PR 분할 · 800줄

실측 `wc -l`: `phd-toggle-scope.ts` 181 · `transfer-lump-sum-base-gate.ts` 56 · `self-built-housing-scope.ts` 97 · `multi-transfer-tax-validate.ts` 288 · `selling-std-price-scope.ts` 126 · `CompanionAcqPurchaseBlock.tsx` 606 · `CompanionAcqStdPriceSection.tsx` 257 · `CompanionAcqAmountSection.tsx` 195 · **위험구간(≥ 720)**: `transfer-tax-split-acq-mode.ts` 749 · `transfer-tax-api.ts` 735 · `transfer-tax-validate-split.ts` 733 · `transfer-tax-validate-acquisition.ts` 721 · `transfer-tax-schema-required-refines-2a.ts` 730. **(가)는 이 다섯 파일을 한 줄도 건드리지 않는다** — 수정이 `phd-toggle-scope.ts` 한 곳(+약 25줄 → ≈ 210줄)에 집중된다. 호출부를 새로 늘리지 말 것(늘리면 기회주의적 분리 대상).

| PR | 내용 | 의존 |
|---|---|---|
| **PR-1** | 방식 leaf + `phdFlagEffective` AND (`phd-toggle-scope.ts`) · ⑤ 토글 노출·`StdPriceSection:111` 을 같은 leaf · 감정·매매사례 hint 한 줄 · Pre-Do anchor(§8.1) · 기존 테스트 갱신(A-12 등) · ⑧↔⑫ 격자 D1~D6 · 회귀 0 sha 격자 · 뮤테이션 12 · E2E PH-1~7 | — |
| PR-2(Q-4 = (b) 확정) | (라) «환산 개별주택가격 계산해 채우기» 버튼(✅ Do 완료 — §9.2). (다) 엔진 base 도출은 하지 않는다 | PR-1 |
| 별건 | 겸용 비환산 × PHD 차단 문구(V-5) · 파트 혼합 PHD 침묵 무시(V-4) | — |


### 9.1 PR-1 Do 기록 (2026-10-24 — 커밋까지, push·PR 전)

**구현**: `lib/calc/phd-toggle-scope.ts` +65줄(181→246) — `phdAcqMethodEstimated`(방식 leaf) 신설, `phdFlagEffective` 가 AND, `phdPayloadActive`/`phdFlagEffective` 의 Pick 에 방식 7필드 추가(TS 가 부분 객체 호출부를 잡는다 — 호출부 변경 0). ⑤ `CompanionAcqPurchaseBlock.tsx` 의 토글·«첫 자산 아님» 안내 두 곳이 같은 leaf(`phdMethodEstimated`). 자동 ON effect·③ normalize·저장값은 그대로(읽는 쪽 파생). **750줄 근처 5파일 변경 0**(split-acq-mode 749 · api 735 · validate-split 733 · refines-2a 730 · validate-acquisition 721). 순환 import 회피: leaf 가 `deriveLegacyPartAcqMode`·`isSeparateAcquisition` 의 3줄 규칙을 자체 보유 — 동치는 anchor 가 잠근다.

**V-3 결정 — 별개 취득도 방식 축 적용(후퇴 불필요)**: D6 격자(비별개 8플래그 · 별개 파트 5×5 × 8플래그 = 200조합 · 별개 토글만 켜진 비별개 400조합)에서 leaf ≡ `deriveLegacyPartAcqMode`/`effectivePartAcqMode`(불일치 0). 종전 ⑤ 노출 조건(raw `useEstimatedAcquisition` ∨ 별개∧파트 환산)과의 차이는 208조합 중 **60**이고 전부 «raw 환산 플래그 잔재 ∧ 실제 방식(우선순위·파트)은 환산 아님» 한 갈래(방향은 «토글 숨김»뿐) — 우선순위·파트 모드가 정본이라는 ④⑧ 규칙과 ⑤ 를 맞춘 것이다.

**실측 전/후** (대표 셀 — 취득 2003-01-10 · 양도 2026-03-01 · 양도가 10억 · 2주택 · 3억 · 기준시가 2억/4억, throwaway 하네스 → 정식 anchor 로 승격):

| 셀 | 수정 전 | 수정 후 |
|---|---|---|
| R-1 실거래가 + 플래그만 | ⑧ 0건 · route **400**(양도시 토지·건물 기준시가) | 200 · 185,966,000 · PHD 키·분리 후퇴 없음 |
| R-2 감정 + 플래그만 / R-3 매매사례 | ⑧ 0건 · **400** | 200 · 184,118,000 · 개산공제 6,000,000 |
| R-4 감정 + 11칸 | 200 · **개산공제 0 · 185,966,000** | 200 · 개산공제 6,000,000 · **184,118,000**(= 플래그 OFF 쌍둥이) |
| R-5 감정 + 11칸 + 취득일 2010-01-10 | **400**(`preHousingDisclosure.firstDisclosureDate`) | 200 |
| 환산 대조 | OFF 122,518,000 · 11칸 206,154,088 | 불변 (응답·본문 sha256 동일) |
| 다건 감정 + 플래그 잔재 | «단건 계산기에서만 지원» 차단(Q-6) | 차단 없음 · 다건 route 200 · 환산 + PHD 는 종전대로 차단 |

**격자(1,332셀: 비별개 768 · 별개 취득 324 · 대조군 240 — 경로 3 × 취득일 2 × 방식 8 × PHD 4 × 기준시가 2 × 지분 2 · 파트 3×3 × raw 환산 잔재 · 겸용·이월과세·토지·상속·증여·함께 양도 둘째)**: 비환산 × PHD ON 에서 ⑧ 통과 ∧ 400 은 **단건 112 · 함께 양도 56 · 다건(차단 통과분) 0 + 별개 0 → 0**, 감정류 개산공제 0(침묵 오산) 단건 48 · 함께 양도 12 → **0**. 응답·본문 해시가 바뀐 셀 610 전부가 «PHD ON ∧ 비환산 ∧ 첫 자산 주택» 집합(main 504 · 별개 88 · 토지 상속 시료 18) 안에 있고 **집합 밖 변화 0** — 환산 96셀 · PHD OFF 300셀(환산 OFF 8셀 중복) · 대조군(토지·겸용·상속·증여·이월과세·함께 양도 둘째) 204셀은 바이트 동일. 집합 안인데 안 바뀐 8셀은 함께 양도·플래그만·기준시가 없음(관측 차이 없음). 수정 후 2회 해시 동일(비결정 0). 다건 비환산 «단건 전용» 차단 168 → 0(⑧ 통과분은 route 200 — 96셀).

**D1~D6**: D1(⑧ 통과 ⇒ route ≠ 400, 다건은 «단건 전용» 통과분만) · D2(비환산 PHD ON ⇒ ④ 에 PHD 키 없음, 환산 ∧ 11칸 ⇒ 키 있음) · D3(비환산 PHD ON 의 ⑧ 이슈·상태·세액·개산공제·본문·응답 해시 = 플래그 OFF 쌍둥이) · D4(환산 대표값 고정) · D5(다건 차단은 환산 PHD 에만) · D6(leaf 동치) 모두 `phd-non-estimated-method-axis.anchor.test.ts`. 부수로 ⑧ 이 새로 요구하는 것: 감정·매매사례 + 플래그 잔재에서 취득시 기준시가(A-12) — 단건 감정류 nostd 셀이 ⑧ 통과 → ⑧ 차단으로 이동(칸이 화면에 있다).

**기존 테스트 갱신(V-8 실측 — 단언 삭제 0)**: ① `lump-sum-deduction-required-stdprice` A-12: 감정·매매사례 + 2003 + PHD 플래그 + 기준시가 빈 → 전 null(통과) → 후 «취득 당시 기준시가» 오류(+ A-12b 환산은 면제 유지) · ② `multi-transfer-api-sync` «PHD» 차단: 전 기본 시료(비환산) + 플래그 → 차단 → 후 환산 시료만 차단 + 비환산 3종(실거래가·감정·매매사례) null 신규 · ③ `transfer-land-part-cause.d1-4.predo` B1′: 전 두 파트 실가 + PHD → 키 있음 → 후 키 없음(긍정 짝은 두 파트 환산 명시 · 실가 쌍 추가) · ④ `d1.predo` C11: 전 `usesPhdGate(…landCauseHost "")` true → 후 false(긍정 짝은 파트 환산 명시) · ⑤ `d2-2.check` #1: 전 매매 + 플래그 → `phdFlagEffective` true → 후 false(환산 명시 true · 실거래가 false 짝) · ⑥ `ui-review-high-remaining` C-3: 전 housing + 플래그 → payload true → 후 false(환산 명시 true · 실거래가 false 짝). **영향 없음 실측**(전체 vitest — 1차 3,399 파일 전부 통과 · 최종 재실행은 머신 부하(load avg ~38)로 4파일 기본 타임아웃(무관 3 + 본 anchor 의 D6 루프 → 60s 로 상향), 4파일 단독 재실행 71건 통과): `separate-land-date-required.g2` · `owner-split-building-std-leaf-parity` · `self-built-housing-scope/validate-parity/strict-parity`(SPLIT[phd] 셀은 방식에 따라 범위 안/밖이 바뀌지만 격자가 즉석 계산이라 기대 재산출 불필요 — D1·D2·D3 통과).

**용어(사용자 지시 «추정값» 금지 → «환산 개별주택가격»)**: 사용자 노출 문구 변경 3곳 — `transfer-tax-validate-housing-excess.ts:65`(⑧ 메시지) · `HousingExcessSplitCard.tsx:106`(라벨)·`:111`(hint). 주석 변경 — `housing-excess-split.ts:88·114`·`HousingExcessSplitCard.tsx:76`. 테스트 문자열 — `one-house-dec-pr5/` 4파일(card 단언 regex·제목·⑧ 메시지에 «환산 개별주택가격» 포함 + «추정» 불포함 단언 추가). **미변경(확인 필요)**: 결과 카드 `PreHousingDisclosureDetailSection.tsx` «추정 취득시 주택가격»(5곳) · 감면 PHD `ReductionPhdInput.tsx:359` «취득시 추정 공동주택가격» · 상속 주택 평가 `HouseValuationSection.tsx:475-476` «추정 공식» · `InheritedHouseValuationDetailCard.tsx:90·124` «{price} 추정» — §164⑦ 의 공동주택가격·상속 평가·결과 표기라 용어 대상(환산 «개별주택가격»)이 같은 뜻인지 사용자 확인 후 일괄(별건).

**hint(§7.2)**: 신규 `pre-disclosure-std-hint.ts` 한 줄 상수 «취득일이 개별주택가격 최초 공시일 전이면 소득세법 시행령 §164⑦ 산식으로 계산한 환산 개별주택가격(부수토지 포함 총액)을 입력합니다.» — 감정(`CompanionAcqAmountSection`)·매매사례(`SalesCaseSection` `isHousing`)·실거래가 안분 칸(`CompanionAcqStdPriceSection` 주택). 환산 칸에는 붙이지 않는다(PHD 3-시점이 대신). 실거래가 비분리 단건은 취득시 기준시가 칸이 열리지 않는다(`useEstimatedAcquisition ∨ isSplit` 게이트) — 그 경우 hint 도 없다.

**뮤테이션 22건(cp 백업 · label+file md5 · 변이별 sha · 종료 후 원본 동일 확인)**: 계획 12건을 소비처 단위로 풀어 22건 — M01 방식 항 제거 · M02 raw `useEstimatedAcquisition` · M03 우선순위 뒤집기 · M04 겸용 제외 제거 · M04b 이월과세 제외 제거 · M05 별개 분기 제거 · M06 종류 축 제거 · M12 파트 `||`→`&&` · M13 건물 파트 레거시 후퇴 제거 · M14 «같은 날 아님» 제거 · M21 토지 취득일 truthy 제거 · M22 종류 축 housing 만 · M07 `usesPhdGate` 만 방식 제거 · M08 `phdPayloadActive` 만 제거 · M09 다건 ⑧ 원시 · M10/M10b/M10c `selling-std-price-scope` 3곳 · M11 ⑤ 토글 노출 raw · M15 자동 ON effect 에 방식 조건(불필요 변경 감지) · M16 `StdPriceSection` 자동 도출 문구 raw · M17 소유자 분리 건물 기준시가 · M19 ④ `usesPhd` 원시 · M20 다건 ④ `usesPhd` 원시 · M18 `validate-split` 토지 취득일 후퇴 원시. 결과: **KILLED 21 · SURVIVED 1(M18, 동치 변이)**. M14·M22 는 초기 SURVIVED 라 anchor 보강(같은 날/토지 취득일 미입력 400조합 · building 종류 truth-table) 후 KILLED 로 재측정. M18 은 `landDateSent` 가 land 원인이 있는 가지(`LAND_CAUSE_DATE_REQUIRED`)에서만 읽히는데 그때는 `landCauseMixActive` 로 `phdFlagEffective` 가 방식과 무관하게 false 라 관측 차이가 없다(동치 변이 — 전 이월과세 PR-3 N02 와 달리 분기 쌍을 만들 입력 자체가 없다).

**E2E(`e2e/transfer-phd-non-estimated-mode.spec.ts` PH-1·2·3a·3b·4·5·6·7, :3303)**: 수정 후 8/8 통과(`--repeat-each=3` 24/24). **방식 항 제거(수정 전 동치) 변이에서 6건 실패(PH-1·2·3a·3b·4·6)** · PH-5(환산 불변)·PH-7(둘째 자산)은 변이에서도 통과 — 계획서 §1.2 와 일치. 시드 경합 2종을 spec 에서 막았다: ① 서울 주소 시료의 조정대상지역 판정이 비동기로 풀려 «같은 날 주택 2채 함께양도»(§154⑨) ⑧ 이 타이밍에 걸림 → 함께 양도 시료는 춘천 · ② 시드 직후 reload 전 첫 로드 지연 persist 가 시드를 덮는 경합 → 자산 수 확인 + 재시도. 워크트리 Turbopack 은 `next.config.ts` turbopack.root 임시 변경으로 띄우고 원복(sha256 b91da05e… 동일).

**확인 필요**(이 PR 이 건드리지 않은 것): ① V-6 원시 플래그 소비처 — `depreciation-scope.ts:84`(PHD 플래그면 감가상각비 입력 숨김 — **비환산 + 자동 ON 잔재에서 입력이 숨는다**, 미변경) · `reverse-appurtenant-swap.ts:126` · `transfer-phrp-stdprice-link.ts:30` · 공익수용 4곳(`expropriation-required-gate` 등 — `useEstimatedAcquisition`/`convertsAtAssetLevel` 게이트가 앞서 걸려 비환산에서는 도달하지 않는 판독, 격자 밖) · ② PHD 와 무관한 기존 ⑧↔⑫ 불일치 2종(대조군에서 발견 · 종전과 동일 바이트): 비주택(토지) + 환산 + 자동 ON 잔재 플래그(`standardPriceAtAcquisition`·`standardPriceAtTransfer` 400 — ④ `usesPhd` 가 종류 축을 안 봄, 종류 변경 리셋 `housing-flag-reset.ts` 가 막는 세션 경로 밖의 잔재) · 토지 상속 파트 시료 × 매매사례(PHD OFF 에서도 ⑧ 통과 ∧ 400) · ③ 브라우저 수동 확인은 Playwright E2E 로 갈음(사람 눈 확인 미수행).

### 9.2 PR-2 Do 기록 («환산 개별주택가격 계산해 채우기» — 2026-10-24, 커밋까지 · push·PR 전)

**범위(Q-4 = (b))**: 취득가액을 **실거래가·감정가액·매매사례가액**으로 정하는 **주택**이고 취득일 < 2005-04-29(최초 고시일 직전 — ⑤ 자동 ON effect 의 `acqDatePrePHD` 와 같은 기준)일 때, «취득시 기준시가» 칸(개산공제 base — 영 §163⑥2호 가목) 곁에 계산 보조를 둔다. 기존 PHD 입력 카드(`PreHousingDisclosureSection`)를 **보조 모드**(`mode="assist"`)로 재사용해 6칸(최초 고시일 · 최초 고시 주택가격 · 취득시 토지 ㎡당 공시지가·건물 기준시가 · 최초공시일 토지 ㎡당 공시지가·건물 기준시가)과 ① 기본정보의 토지 면적을 읽고, 버튼 «환산 개별주택가격 계산해 채우기» 를 누르면 **한 번의 `onChange`** 로 그 칸을 채운다. 산식: 최초 고시 주택가격 × 취득 당시 토지+건물 기준시가 ÷ 최초 고시 당시 토지+건물 기준시가.

**변경 파일**
- 신규 `lib/calc/phd-converted-housing-price.ts`(126줄) — `phdFillAssistVisible`(보이는 조건)·`computeConvertedHousingPrice`(산식). 산식은 **엔진 `calcPreHousingDisclosureGain` 의 `estimatedHousingPriceAtAcquisition` 를 그대로 재사용**(양도시 인자 0 — 이 값에 쓰이지 않는다). 면적 곱셈 부동소수·`floor` 위치가 환산 경로와 같아 «버튼 결과 = 엔진 환산값». 입력 매핑은 ④(`buildPreHousingDisclosurePayload`)와 같다(면적 `acquisitionArea` · 1990.8.30. 이전은 §164④ 등급가액 fallback). `Math.round` 없음.
- 신규 `components/calc/transfer/PhdConvertedPriceFill.tsx`(102줄) — `ToneCard tone="amber"` + `ExpandToggleButton` + 보조 카드 + 산식 미리보기(파생 표시 — store 에 쓰지 않음) + 버튼(`Button variant="outline"`).
- `PreHousingDisclosureSection.tsx`(281→295줄) — `mode` prop: 보조 모드는 양도시 개별주택가격·③ 양도시 기준시가 입력을 숨기고(환산 개별주택가격에 쓰이지 않음) 3시점 일괄 계산 모달(양도시 점 포함)을 끄며 헤더·경고 문구를 분기.
- 배선 3곳 — `CompanionAcqAmountSection.tsx`(감정가액 칸 아래) · `SalesCaseSection.tsx`(`stdPriceFillAssist` slot, 매매사례 칸 아래) · `CompanionAcqStdPriceSection.tsx`(실거래가 + 토지·건물 안분 칸 — hint 가 붙는 칸과 같은 조건).
- **④·⑧·⑫·⑬·⑭·① ② ③ ⑥ ⑦ 변경 0**(750줄 근처 5파일 변경 0). 새 상태 필드 0.

**보이는 조건**: `assetKind==="housing"` ∧ `phdToggleCauseReachable`(매매·미지정) ∧ ¬`landCauseMixActive` ∧ ¬`phdAcqMethodEstimated`(= 환산 아님 — 이 leaf 가 겸용·이월과세에서도 true 라 그 둘도 함께 제외) ∧ 취득일 < 2005-04-29. 환산이면 PHD 토글이 대신하므로 두 카드가 함께 뜨지 않는다. PHD 플래그(`usePreHousingDisclosure`) 값은 읽지 않는다. 함께 양도 둘째 이후 자산에도 보인다(값만 채우는 보조 — 둘째 자산은 어차피 취득시 기준시가를 직접 입력).

**막힘(값을 만들지 않는다 — 0 대입·자동 안분 금지)**: 6칸 + 토지 면적 중 하나라도 비면 버튼이 꺼지고 부족한 칸을 지목 · 취득일 ≥ 최초 고시일(`isPhdEligible` 단일 소스)이면 «취득일 현재 고시된 주택공시가격을 직접 입력» 안내 · 취득 당시·최초 고시 당시 합계가 같고 §80①1호 구간이면(= ⑧ 이 환산에서 A11 로 막는 조건 `classifySameAdjustmentPeriod === "clause_1"`) §164⑧ 준용 산정 칸이 없어 값을 만들지 않는다.

**재사용 판단 — 보조 입력을 어디에 저장하나 (3안 비교)**

| 안 | 내용 | 평가 |
|---|---|---|
| **(A) 채택** | 기존 `phd*` 칸을 그대로 쓴다(저장값 삭제 없음 — PR-1 정책의 연장) | 신규 필드 0 → ①②③ 변경 0. ④ 는 `phdFlagEffective`(방식 축)가 false 라 **전송하지 않고**, ⑧ 은 `isEstimated` 가 false 라 **요구하지 않는다** — 숨은/보조 입력 = 미전송 = 미요구. 실측: 보조 6칸 유무로 ④ 본문 바이트 동일(F4, 방식 3 × 플래그 2) · ⑧ 이슈 동일(F5) |
| (B) 컴포넌트 로컬 `useState` | 보조 입력을 지속하지 않음 | 단계 이동·새로고침에 6칸이 사라져 다시 입력(`PreHousingDisclosureSection` R12 선례 — 로컬 state 가 새로고침에 되돌아가 라벨이 어긋났다) · 3시점 위젯의 연도·수동 플래그까지 전부 props 로 끌어올려야 함 → 기각 |
| (C) 신규 `AssetForm` 보조 필드 | 보조 전용 6~7칸 신설 | ①②③⑧ 동기화 지점이 늘고, 같은 사실(최초 고시·취득 당시·최초 고시 당시 값)을 환산용과 보조용 **두 곳**에 따로 받아 dual-truth → 기각 |

(A)에서 «환산으로 돌아오면 의미가 섞이는가?»를 코드로 확인했다. 두 모드가 읽는 6칸은 **같은 주택의 같은 사실**(최초 고시일·최초 고시 주택가격·취득 당시·최초 고시 당시 토지·건물 기준시가)이라 의미가 갈리지 않는다 — 환산으로 돌아오면 그 6칸이 그대로 복귀하고 사용자는 양도시 4칸(양도시 개별주택가격·토지 ㎡당·건물 + ③)만 더 채우면 된다(U5). 보조 모드는 `phdTransferHousingPrice`·양도시 토지·건물 칸을 **화면에 두지도 쓰지도 않는다**(U1 — 숨은 칸에 값이 새로 생기지 않는다). 읽는 소비처 전수(`rg phdFirstDisclosureDate|phdFirstDisclosureHousingPrice|phdLandPricePerSqmAtFirst|phdBuildingStdPriceAtAcq`): ④·⑧·겸용 경로는 방식·겸용 축으로 비환산·비겸용에서 읽지 않는다 · **`UnifiedReductionPanel.buildAssetPhdSnapshot`**(감면 PHD 위젯의 «자산 카드 PHD 가져오기» 소스)은 raw `usePreHousingDisclosure`(취득일 < 2005-04-29 주택이면 자동 ON)로 게이트되어, 보조에서 채운 6칸이 그 «가져오기» 버튼의 소스로 **노출될 수 있다** — 사용자가 버튼을 눌러야 가져오고 같은 주택의 같은 사실이라 의미는 일치하지만, 이 소비처는 방식 축을 보지 않는다(PR-1 확인 필요 V-6 와 같은 부류 — 바꾸지 않았다). **판단이 갈릴 지점**: (A) 가 감면 «가져오기» 소스를 늘리는 부수 효과를 받아들일지 — (A) 의 대안 (B)/(C) 는 위 이유로 더 큰 비용이라 (A) 를 골랐다.

**전/후 실측**(대표 셀 — 취득 2003-01-10 · 양도 2026-03-01 · 양도가 10억 · 2주택 · 감정가액 3억 · 보조 6칸 = 최초공시 2005-04-30 · 최초 개별주택가격 1억 · 토지 100㎡ · 취득시 ㎡당 100만/건물 6천만 · 최초시 110만/6,100만):

| 단계 | ⑧ | 개산공제 | 총세액 |
|---|---|---|---|
| 버튼 전(칸 비어 있음) | **1건 차단** «자산: 취득 당시 기준시가를 입력하세요.» (route 직접 호출 시 0 · 185,966,000) | — | — |
| 사용자 임의 입력 2억(PR-1 상태) | 통과 | 6,000,000 | 184,118,000 |
| **버튼 → 환산 개별주택가격 93,567,251** | 통과 | **2,807,017**(= floor(93,567,251 × 3%)) | **185,101,438** |

93,567,251 = floor(1억 × 160,000,000 ÷ 171,000,000) — 독립 BigInt 산식·환산 경로(PHD 11칸) route 의 `estimatedHousingPriceAtAcquisition` 과 일치(F1). 계획서 :108 의 185,101,438 재현(F2).

**테스트**
- `__tests__/calc/phd-fill-converted-price.anchor.test.ts` **26건**: F1(버튼 = 엔진 값 — 독립 BigInt 산식 4조합 · 환산 경로 route echo 와 일치) · F2(대표 셀 185,101,438·개산공제 2,807,017·PHD 키 없음) · F3(보이는 조건 격자 — 방식 8 × 취득일 경계 6 · 종류·취득원인·겸용·이월과세·토지 원인 혼합 + 긍정 짝) · F4(④ 본문 — 방식 3 × 플래그 2 에서 보조 6칸 유무 바이트 동일 · 버튼 전후 차이는 `.standardPriceAtAcquisition` 하나뿐) · F5(⑧ 이슈 동일) · F6(칸 부족 7칸 개별·not_eligible·same_sum + 긍정 짝·1990 이전 fallback).
- `__tests__/calc/phd-fill-assist-ui.anchor.test.tsx` **17건**: 보이는 조건(방식 3 + 환산 대조·취득일·비주택·접힘/펼침·함께 양도 둘째) · 양도시 입력 미노출(긍정 짝: 환산 카드는 노출) · 클릭 → 한 번의 `onChange`(감정·매매사례·실거래가 분리) · 직접 수정 가능 · 보조 입력 변경 시 자동 갱신 없음(다시 눌러야 갱신) · 플래그 불변 · 막힘 사유 · 환산 복귀 시 같은 값.
- 뮤테이션(cp 백업 · md5 복원 확인) vitest 14건 — M01 방식 leaf 제거 · M02 취득일 상한 · M03 토지 원인 혼합 제거 · M04 겸용 항 제거(**동치**: leaf 가 이미 겸용·이월과세에서 true — 중복 조건을 코드에서 지우고 leaf 변이 M04b 로 재측정) · M05 적격 게이트 제거 · M06 합계 동일 게이트 제거 · M07 값 +1 · M08 면적 요구 제거 · M09 클릭 시 `onFill` 2회 · M10 버튼 활성 고정 · M11 양도시 가격 칸 노출 · M12 양도시 열 노출 · M13 취득원인 축 제거 · **전부 KILLED**(M04 만 동치로 SURVIVED → M04b KILLED). E2E 변이 1건(`onFill` 값 +1) → FB-1~4 실패(KILLED).
- E2E `e2e/transfer-phd-fill-button.spec.ts` FB-1~5 (:3304): 감정가액 버튼 → 칸 93,567,251 → 계산 200 → 본문 `standardPriceAtAcquisition` 93,567,251 · `preHousingDisclosure` 없음 · 개산공제 2,807,017 · 총세액 185,101,438 / 채운 뒤 직접 수정(1억 → 개산공제 3,000,000) · 보조 입력을 바꿔도 칸 자동 갱신 없음 / 매매사례 / 접힌 상태에서 6칸 직접 입력 → 버튼 활성 → 채움 / 환산·취득일 2010 대조에서 버튼 없음. 5/5 통과(PR-1 PH-1~7 포함 `--repeat-each=2` 26/26). 워크트리 Turbopack 은 `next.config.ts` turbopack.root 임시 변경 후 원복(sha256 b91da05e… 동일).

**확인 필요**(이 PR 이 다루지 않거나 실측하지 못한 것): ① 별개 취득(토지·건물 취득일 다름) 비환산 — 자산 전체 취득시 기준시가 칸이 없고 파트 카드(`PartAcqStdPrice`)가 받으므로 버튼을 두지 않았다(파트별 §164⑦ 환산 개별주택가격 개념이 맞는지 판단 필요) · ② 공동주택 중 취득일 ≥ 2005-04-29 이지만 단지별 최초 고시일이 그 이후인 경우 — 자동 ON 과 같은 기준이라 버튼이 안 보인다(필요하면 취득일 상한을 풀거나 수동 펼침 경로 추가 — 결정 필요) · ③ 실거래가 비분리 단건은 취득시 기준시가 칸 자체가 없어 버튼도 없다(개산공제 base 가 아니다) · ④ 감면 «자산 카드 PHD 가져오기» 소스 노출(위 판단 지점) · ⑤ 브라우저 사람 눈 확인은 Playwright E2E·스크린샷 1장으로 갈음 · ⑥ 결과 카드의 «추정» 용어 잔여(PR-1 §9.1 확인 필요 그대로).

---

## 10. 자가 점검 (3대 정책)

1. **useEffect → store 미러링 금지**: 방식 전환 시 플래그를 끄는 write-side 대안(Q-8)은 저장 세션을 못 고치고 자동 ON effect 와 핑퐁이 되어 기각. 읽는 쪽 파생만 쓴다. 자동 ON effect 는 기존 «수렴하는 래치» 예외 그대로(수정 안 함).
2. **자동 안분 fallback 금지**: 감정·매매사례의 취득시 기준시가는 ⑧ 이 요구한다. §164⑦ 환산 개별주택가격을 자동 대입·안분하지 않는다. (PHD 의 §166⑥ 안분은 환산 경로에서만, 명시 입력 기준.)
3. **Validation 8번째 동기화**: ④·⑧·다건 ⑧·부수 소비처가 같은 leaf 를 읽는다 — «UI 통과 ↔ validate 차단» 모순 방지. 14지점 중 ④⑤⑧만 술어 경유로 바뀌고 ⑫⑬⑭ 변경 0.

---

## 11. 사용자 결정 Q (권장 ★)

> **2026-10-24 사용자 결정** — Q-1 (가) · Q-2 `phdFlagEffective` 자체 · Q-3 비환산 전부 · Q-5 ⑫ 방어선 안 함 · Q-6 다건 차단 해제 · Q-7 자동 ON 유지 · Q-8 안내 없음+읽는 쪽 파생 · Q-9 저장 이력 고지 없음 · Q-10 D1 가드 신설 · Q-11 겸용 별건 — 전부 ★권장안. **Q-4 = (b)**: 감정·매매사례·실가에서도 «환산 개별주택가격 계산해 채우기» 버튼(PHD 입력 카드 재사용, 클릭 시 한 번 `onChange` — useEffect 미러링 아님)으로 취득 당시 기준시가 칸을 채운다 → PR-2(✅ §9.2). PR-1의 안내 문구도 «환산 개별주택가격» 용어로.

| Q | 질문 | 선택지 | 권장 | 수치·영향 |
|---|---|---|---|---|
| **Q-1** | 해법 축 | **(가)** 방식 인지 술어 / (다) 엔진이 PHD 로 §164⑦ 환산 개별주택가격을 개산공제 base 로 도출 / (나) ⑧ 조합 차단 | **★(가)** | (가) 대표 셀: 현행 185,966,000 → 입력 2억이면 184,118,000 · 환산 개별주택가격 입력이면 185,101,438. (나) 기각(끌 칸 없는 영구 차단 · `phd-toggle-scope.ts:1-24` 재발). (다) 법리상 가장 정확하나 14지점 신규 |
| **Q-2** | 방식 축을 거는 위치 | ① `phdFlagEffective` 자체(소비처 ~14곳 일괄) / ② `usesPhdGate`+`phdPayloadActive`+⑤ 만(최소) | **★①** — 단 겸용·이월과세는 적용 밖(격자로 변화 0 증명) | ②는 §5.4 형제 증상(양도시 기준시가 칸·감가상각 입력·다건 차단)이 남아 dual-truth 재발 |
| **Q-3** | 범위 | 감정만 / 비환산 전부(실거래가·감정·매매사례) | **★비환산 전부** | 술어 하나라 분리 불가 · 실거래가가 최대 영향 인구(취득일 < 2005-04-29 주택 전부) |
| **Q-4** | (가) 이후 감정·매매사례의 §164⑦ 환산 개별주택가격 입력 지원 | (a) hint 한 줄 / (b) 후속 PR: PHD 카드 재사용 «환산 개별주택가격 채우기» 버튼 / (c) 후속 PR: 엔진이 PHD 7칸에서 base 도출 | **★(a)** 이번 PR, (b)(c)는 별도 결정 | §164⑦ 산식 값을 입력한 경우 185,101,438 ↔ 사용자 임의 입력 차이(대표 셀 최대 약 983,000원 차). 사용자가 환산 개별주택가격을 직접 계산해야 하는 불편 |
| **Q-5** | ⑫ 방어선 «PHD 키 + 비환산 → 400» | 추가 / 안 함 | **★안 함** | UI 는 ④ 가 안 보내므로 불필요. 직접 호출자의 침묵 무시는 현행 그대로. 추가하려면 이월과세 `carryoverPhdMode`·겸용 경로 면제 분석 필요(확인 필요) |
| **Q-6** | 다건 `MULTI_PHD_UNSUPPORTED_MESSAGE` 를 비환산에서 풀기 | 풀기(술어 따라감) / 유지 | **★풀기** | 술어 단일 소스를 따르면 자동. 유지하려면 예외 코드 필요(dual-truth). 비환산 32셀 차단 해소 |
| **Q-7** | 자동 ON effect(`Block:212-228`)에 방식 조건 추가 | 추가 / 그대로 | **★그대로** | 술어가 해결. effect 수정은 mirror 정책 점검 비용만 늘림 |
| **Q-8** | 환산 → 비환산 전환 시 «3-시점 입력은 보관됩니다» 안내 · stale 정리 방식 | 안내 없음+읽는 쪽 파생 / 안내 / write-side 로 플래그 끄기 | **★안내 없음 + 읽는 쪽 파생** | write-side 는 저장 세션 못 고침 · 환산 복귀 시 토글 재켬 · 자동 ON 핑퐁 |
| **Q-9** | 이전에 저장된 증상 B 이력(개산공제 0)의 고지 | 고지 없음 / 이력 카드 고지 | **★고지 없음**(열기만 하면 재계산 없음 · «다시 계산» 시점에만 바뀜) | 이미 저장된 틀린 세액은 남는다 — 사용자 판단 |
| **Q-10** | ⑧↔⑫ 정합 격자 D1(⑧ 통과 ⇒ route ≠ 400)을 PHD 외 차원에도 거는 상시 가드로 신설 | 신설 / 이번 PR 한정 | **★신설**(`self-built-housing-strict-parity` 의 D1 은 sbError 만 세서 이 400 이 통과해 왔다) | 새 PR 이 같은 결함을 재도입하는 것을 막는다 |
| **Q-11** | 겸용주택 비환산 × PHD 차단(§5.3)·파트 혼합 PHD 무시(§5.2) | 이 PR 에 포함 / 별건 | **★별건** | 엔진 한계(X-7)로 명시된 차단이라 사용자 의도 확인 필요 |

---

## 12. 확인 필요 · 미검증 레지스터

| ID | 항목 | 상태 |
|---|---|---|
| V-1 | 브라우저 수동 확인(DateInput 완성형 입력 시 자동 ON 발화 시점 · 환산→감정 전환 직후 토글 소거) | **미수행** — jsdom 마운트 + ④→route probe 로 대체 |
| V-2 | 법령: DRF 직접 확인(MST 290841). MCP 연결 실패 | ✅ §164⑦·§163⑥·§176의2③ verbatim 확인. `verify:legal` 매니페스트 등록은 이번 PR 이 새 조문을 `legal-codes/` 에 인용하지 않으므로 해당 없음 |
| V-3 | 별개 취득에서 방식 leaf 의 정확한 정의(⑤ 노출 «한 파트라도 환산» vs `housing-excess-split.ts:65` 선례 «레거시 단일 플래그» vs 엔진 «양쪽 환산») | ✅ **PR-1 결정**(§9.1) — D6 격자 동치(불일치 0), 별개 취득도 방식 축 적용 |
| V-4 | 파트 혼합(환산 + 비환산)에서 PHD 키가 가지만 엔진이 무시(세액 PHD OFF 와 동일) | 관측(probe) — 별건 |
| V-5 | 겸용주택 비환산 × PHD(자동 ON) ⑧ 차단이 막다른 길인가 — 겸용 PHD 토글이 비환산에서 보이는지 | **확인 필요**(probe: ⑧ 문구 확인, UI 노출 미확인) |
| V-6 | 원시 `usePreHousingDisclosure` 를 직접 읽는 소비처(`ExpropriationBlock:86`·`expropriation-required-gate:141,164`·`validate-expropriation:53`·`UnifiedReductionPanel:148`·`transfer-phrp-stdprice-link:30`·`reverse-appurtenant-swap:126`)가 술어를 경유하게 할지 | **확인 필요** — 코드 판독만 |
| V-7 | `selling-std-price-scope` 앵커 불일치(`phdTransferHousingPrice` 가 안 보임)의 실제 막다른 길 여부 — 가액기준 지역 ∧ 조정대상지역 ∧ 2018-04-01 이후 | **미실측**(코드 판독) |
| V-8 | 기존 테스트 영향 목록(§8.1-4)은 정적 판독 — 술어 수정 시 실제 실패 목록은 착수 시 실측 | ✅ **PR-1 실측**(§9.1) — 갱신 6파일(A-12 등)·영향 없음 파일 목록 |
| V-9 | 감정·매매사례 개산공제 수치(매매사례)는 감정과 같은 분기 구조(`transfer-tax-helpers.ts`)지만 UI 가 측정한 증상 B 수치는 감정 한 방식 | 매매사례는 단건 격자 R-3 으로 400 만 확인, 증상 B 세액은 별도 측정 안 함 |
| V-10 | 1세대1주택 비과세 시료에서도 R-1 400 재현(확인) · 비과세 후 세액 0 이어도 ⑫ 가 먼저 막는다 | ✅ |

---

## 13. 재현 하네스 (저장소 미보존)

`__tests__/calc/_self-built-housing-fixture.ts`(`sbForm`·`calc`·`allIssues`·`bundledForm`) + `__tests__/calc/_helpers/single-multi-route-parity.ts`(`buildMultiBody`·`postMulti`) + `validateMultiSupportedMode` 를 `vi.mock("@/lib/db/tax-rates")`·`vi.mock("@/lib/api/rate-limit")` 아래에서 호출하는 throwaway vitest 7개(작업 후 삭제 확인). §1.2 격자는 이 하네스의 180셀 TSV 를 집계한 값이다. UI 시니어 하네스(jsdom `Block` 마운트 · 컴패니언 probe · 증상 B 수치)는 별도 저장소 밖 폴더.
