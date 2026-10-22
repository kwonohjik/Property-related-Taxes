# 토지·건물 구분 기재(split) 양도시 기준시가 — 감정평가가액 양쪽 입력 시 ⑧↔⑫ 비대칭(47셀) 해소 계획서

> 작성 2026-10-22 · master `fb724ab6a` 기준 · 상태: **✅ Do 완료 (2026-10-22) — 결정 사항 없음** (§10 Do 결과)
> 관련: `docs/00-pm/split-v7-pre2016-fe8-12-parity.plan.md` §3.3·§8 Q-2·§10(T-8) · 테스트 `__tests__/calc/split-sale-std-era-fe8-12-parity.test.ts` · memory `feedback_fe8_vs_12_parity_grid`

## 0. 한 줄 요약

양도시 감정평가가액이 토지·건물 **양쪽** 입력되면 그 가액이 안분 basis 1순위라 양도시 기준시가는 양도가액 안분·§100③ 30% 판정에 **쓰이지 않는다**. ⑫ Zod는 이미 이 경우 V4·V7을 건너뛰는데 ⑧(화면 검증)만 기준시가를 계속 요구해, **⑧ 차단 ∧ ⑫ 200인 47셀**이 남아 있었다(막다른 길이 아니라 fail-closed 과잉). **엔진은 이 구간에서 양도시 기준시가를 환산 파트의 분모로만 읽으므로**(전 256셀 result JSON 비교로 실측) 틀린 쪽은 ⑧이다. ⑧을 ⑫·엔진과 같은 술어(`usableAppraisal`)로 완화하고, 환산 파트의 분모 요구는 **그 파트에 한해** 유지한다. 방향이 반대(⑫가 느슨)가 되는 소비처는 없었다.

## 1. 법령 (KoreanLaw MCP 2026-10-22 원문 실독)

| 항목 | 내용 | 근거 |
|---|---|---|
| 1호 본문·단서 | 토지·건물 기준시가가 모두 있는 경우 기준시가 비례 안분. **다만 감정평가가액이 있는 경우에는 그 가액에 비례하여 안분**한 금액 | 「부가가치세법 시행령」 제64조 제1항 제1호 (`get_law_text(mst=283641, jo=제64조)`) — 상수 `MIXED_USE_BURDENED_GIFT.VAT_DECREE_APPORTION_64_1` |
| 2호 본문 | 어느 하나 또는 모두의 **기준시가가 없는 경우로서 감정평가가액이 있는 경우**: 그 가액에 비례하여 안분 | 같은 호 — 기준시가 부재가 감정평가가액 안분의 장애가 아니다 |
| §100③ 본문 | 구분 기장한 가액이 **같은 항(제2항)에 따라 안분계산한 가액**과 100분의 30 이상 차이 → 불분명 의제 | 「소득세법」 제100조 제3항 (`get_law_text(mst=280405, jo=제100조)`) — 상수 `TRANSFER.SPLIT_DEEMED_UNCLEAR` |
| 소령 §166⑥ | 안분은 부가령 §64①을 준용 | `TRANSFER.BUNDLED_APPORTIONMENT` |

⇒ 부가령 §64①은 **감정평가가액 > 기준시가** 서열이고 감정평가가액이 있으면 기준시가가 없어도 된다(2호). §100③의 비교 대상(안분계산한 가액)도 그 서열의 결과다. 구조상 감정평가가액이 기준시가보다 우선한다.

> 감정평가가액의 **시기 요건**(공급시기가 속하는 과세기간의 직전 과세기간 개시일~) 판정은 엔진이 하지 않고 사용자 책임으로 둔다(Q-9 확정, `sale-split-apportion-basis.ts:21-37`). 본 건은 그 결정을 건드리지 않는다.

## 2. ⑧ ↔ ⑫ 술어 나란히 (file:line, 수정 전 기준)

| 항목 | ⑧ 클라이언트 | ⑫ 서버 Zod |
|---|---|---|
| 감정평가 양쪽 | V4·V7이 **무시** — `transfer-tax-validate-split.ts:~512`(수정 후 :523) V4 `!hasSaleRatio`만 · `transfer-tax-validate-split-sale-std.ts:45,52` V7은 `!stdWaived`(연혁 면제)만 | `transfer-tax-schema-required-refines-2a.ts:395-401` `positive(landAppraisal) && positive(buildingAppraisal)` → `refineEstimatedTransferStd`(환산 파트 분모만) 호출 후 **return**(V4·V7 건너뜀) |
| V4(구분 근거 전무) | `hasSaleRatio`(기준시가 양쪽)만 근거로 인정 | 위 return 뒤라 감정평가 양쪽이면 불문 |
| V7(양도시 기준시가) | 두 파트 모두 요구(연혁 면제 `stdWaived`일 때만 예외) | 위 return 뒤라 감정평가 양쪽이면 불문. 환산 파트 분모는 `refineEstimatedTransferStd`(:242-285), 증여자 환산은 `refineSplitCarryoverValues`(`transfer-tax-schema-split-carryover.ts:152-165`)가 별도 |
| 엔진 | `usableAppraisal`(양쪽 모두 > 0, `sale-split-apportion-basis.ts:94`)이 basis 1순위 | — |

⑧의 V8(한쪽만 입력 차단, `-sale-std.ts:115`)·V8-b(감정평가 방식인데 금액 없음)는 ⑫에 대응이 없는 **다른 축의 fail-closed**이며 이번에 건드리지 않는다.

## 3. 격자 전수 대조 (실측)

테스트 `split-sale-std-era-fe8-12-parity.test.ts` T-4 격자(256셀)를 수정 전 코드로 재현(제품 파일 무변경 probe).

| (⑧ 차단?, ⑫ 상태) | 수정 전 | 수정 후 |
|---|---|---|
| ⑧ 통과 · ⑫ 200 | 70 | **117** |
| ⑧ 통과 · ⑫ 400 (모순) | 0 | 0 |
| ⑧ 차단 · ⑫ 400 | 139 | 139 |
| ⑧ 차단 · ⑫ 200 (⑧이 더 엄격) | **47** | **0** |

### 3.1 47셀의 축 (전부 `감정평가 양쪽`)

| 축 | 분포 |
|---|---|
| 감정평가 | bothApp 47 / noApp 0 |
| ⑧ 차단 사유 | 양도시 토지 기준시가 22 · 양도시 건물 기준시가 15 · **V4 구분 근거 전무(`landTransferPrice`) 10** |
| 취득 모드(토지/건물) | 실가/실가 27 · 환산 파트 20(**환산 파트 자신의 기준시가는 있고 반대 파트 기준시가만 없는** 셀) |
| 구분 방식 | 감정평가 20 · 구분 기재 17 · 일괄양도 10 |
| 양도일 | 2015-12-31 22 · 2016-01-01 25 |
| 양도시 기준시가 | 없음 9 · 토지만 19 · 건물만 19 |

즉 47셀 = (a) 환산 파트 없음 + 기준시가 부재/부분 27셀 (그 중 10셀은 구분양도 + 양도가액 구분 전무 + 감정평가 양쪽 = V4) + (b) 환산 파트 20셀(반대 파트 기준시가 불필요). 두 묶음은 **정확히 위 두 ⑧ 규칙**의 과잉이다.

### 3.2 격자 밖 두 축도 같은 술어로 재측정

| 격자 | 수정 전 | 수정 후 |
|---|---|---|
| 소유자 분리(동시 취득·개별주택가격 비례) 256셀 | ⑧ 차단 ∧ ⑫ 200 **54** (전부 감정평가 양쪽·환산 파트 없음) · 모순 0 | 불일치 0 · 모순 0 (환산 파트 + 기준시가 부분 입력은 ⑧·⑫ **둘 다 차단**) |
| 파트 이월과세 C(증여자 환산) 72셀 | ⑧ 차단 ∧ ⑫ 200 **17** | 불일치 0 |

## 4. 엔진이 감정평가 양쪽 입력 시 양도시 기준시가를 쓰는가 — 아니오 (환산 분모 제외)

| 소비처 | 감정평가 양쪽일 때 | 근거 |
|---|---|---|
| 안분 basis | 감정평가가 1순위 — 기준시가 미사용 | `transfer-tax-split-sale-price.ts:46-65`(`resolveBasis`) → `sale-split-apportion-basis.ts:111-122`(`usableAppraisal`이면 즉시 반환) |
| §100③ 30% 비교 대상 | basis.apportioned(감정평가) — 기준시가 미사용. 안분값 부재 차단도 `hasBasis`가 참이라 통과 | `transfer-tax-split-sale-price.ts:116-124` · `judgeDeemedUnclearSplit` |
| 일괄양도·구분 근거 전무 | 구분 가액이 없어도 `basis.apportioned`로 확정(감정평가) | `transfer-tax-split-sale-price.ts:82-96` |
| 환산 파트 분모 | **환산 파트 본인 소유분에 한해** 필수 — 개별주택가격 비례(stdSplit)면 양쪽 + 총액 | `transfer-tax-split-acq-price.ts:464-497`(`landEstimatedOwned`·`buildingEstimatedOwned`·`missingTransferStdParts`) |
| 증여자 환산(파트 이월과세) 분모 | 환산 파트 한정 | `transfer-tax-schema-split-carryover.ts:157-165` |
| 그 밖 | 엔진 코드에서 `landStandardPriceAtTransfer`/`buildingStandardPriceAtTransfer`를 읽는 곳은 위 2파일뿐(`grep -rn … lib/tax-engine`). 배선 `engine-input.ts:413-414`·`bundled-split-helpers.ts:451-452`·`multi/route.ts:248-249`는 통과. 화면 쪽은 입력 위젯뿐(`TransferStdPriceCards.tsx` 등) — 사이드바·결과·신고서가 이 키를 읽지 않는다 | grep 실측 |

**throwaway probe 실측**: 256셀 중 감정평가 양쪽 ∧ ⑫ 200 셀을 (양도일·구분 방식·취득 모드·양도가액 구분)이 같은 그룹으로 묶어 기준시가 {없음·양쪽·토지만·건물만} 변형끼리 **응답 `result` JSON 전체**를 비교: **동일 50/50**(비교 불가 단독 10그룹). 소유자 분리 격자 **동일 60/60**, 이월과세 격자 **동일 20/20**. 즉 `splitDetail`·표시용 echo·`steps`까지 달라지지 않는다. ⇒ 쓰이는 곳이 없으므로 **⑧이 틀렸고 ⑫가 맞다 — 방향 확정**(Do 진행 조건 충족).

## 5. 설계 (최소 변경 — 공용 술어 `usableAppraisal` 1개)

1. **공용 술어**: 엔진의 `usableAppraisal`(`sale-split-apportion-basis.ts:94`)을 `export`한다(1단어). 엔진 `resolveSaleApportionBasis`·⑧·⑫가 **같은 함수**를 부른다(`single-source-engine-helper`).
2. **⑫** `transfer-tax-schema-required-refines-2a.ts:398`: `positive(a) && positive(b)` → `usableAppraisal(...)`. 의미는 같다(양쪽 > 0) — 행동 변화 0(격자 256셀 상태·키·결과 동일 실측).
3. **⑧ V7** `transfer-tax-validate-split-sale-std.ts`: 감정평가 양쪽이면 파트별 요구를 **환산 파트의 분모**로 좁힌다.

   | 파트 요구 | 조건 |
   |---|---|
   | 토지 기준시가 필요 | 개별주택가격 비례 안분(`ownerSplitHousingNeedsTransferTotal`) ∨ 증여자 토지 환산(`partDonorEstimated`) ∨ (토지 모드 환산 ∧ 토지 비소유 아님) |
   | 건물 기준시가 필요 | 위의 건물 대응 |
   | 감정평가 양쪽 아님 | 종전 그대로 (`!stdWaived`) |

   ⑫와의 대응: `refineEstimatedTransferStd`(환산 파트 + 비례 안분이면 양쪽) · `refineSplitCarryoverValues`(증여자 환산 파트). 엔진 `landEstimatedOwned`/`buildingEstimatedOwned`(비소유 파트 환산은 세지 않음)와도 같다.
4. **⑧ V4** `transfer-tax-validate-split.ts`: `hasSaleRatio`에 이어 `!saleAppraisalIsBasis(asset)`를 더한다 — 구분양도인데 양도가액 구분이 전무해도 감정평가 양쪽이 구분 근거다(엔진 `transfer-tax-split-sale-price.ts:82-96`이 그렇게 확정, ⑫ V4도 건너뜀).
5. 메시지: 감정평가 양쪽일 때의 V7 문구는 「환산취득가액의 분모인 양도시 기준시가 …」로 구분한다(「일괄양도 안분」은 이 경우 거짓 설명). `양도시 기준시가` 연속 토큰은 유지(기존 anchor 의존).

### 5.1 3중 패턴 · 14지점

| 지점 | 판단 |
|---|---|
| ④ `transfer-tax-api-split.ts:194,327-331` | 무변경. 빈 기준시가는 `undefined`로 보낸다(JSON에서 키 소멸) — 격자 body로 확인. 토지분은 `resolveLandStdAtTransfer`, 건물분은 `parseAmount(...) \|\| undefined`. **⑧의 새 면제가 ④의 전송과 모순되지 않는다**(전송은 값이 있으면 보내고 없으면 안 보낸다 — fallback 없음) |
| ⑧ | **변경** (위 3·4) |
| ⑫ | 술어 교체만(행동 변화 0) |
| ⑬·⑭ | 무변경 (기준시가 통과 배선 · 선택 필드) |
| ①②③⑤⑥⑦·⑨⑩⑪ | 무변경 (입력 필드 신규 없음) |

정책 자가 점검: useEffect→store 미러링 없음 · **자동 안분 fallback 아님** — 안분 근거는 사용자가 명시 입력한 감정평가가액(양쪽)이고 빈 값을 시스템이 만들지 않는다(V8이 한쪽만 입력을, V8-b가 모드만 고르고 금액이 빈 경우를 계속 막는다) · ⑧↔⑫ 동기화 자체를 교정.

### 5.2 UI 판단 (변경 없음)

양도시 기준시가 카드(`TransferStdPriceCard`)는 `saleStdPlacement().saleAxis`가 항상 참이라 상시 노출이고, 필드에 「필수」 표지가 없다(힌트 문구만). 2016.1.1. 전 면제(`saleStdPriceWaivedByEra`)가 같은 방식으로 이미 선례다. 칸 숨김·선택 표시는 필요하지 않아 **UI 변경 없음**(멈춤 조건 비해당). 건물 칸 힌트 「안분 분모 겸 환산취득가 분모」는 감정평가 양쪽에서는 환산 분모 전용이 되나 문구가 거짓은 아니다 — 확인 필요 항목으로만 기록(§9).

## 6. 사용자 결정

**결정 사항 없음.** 근거:

- 사용자 지시가 47셀 전부를 ⑧ 통과로 명시했다(「⑧을 ⑫와 같은 술어로 완화」).
- 법령 해석이 새로 들어가지 않는다 — 부가령 §64①1호 단서·2호 본문을 엔진·⑫가 이미 같은 방식으로 구현했다.
- 세액이 바뀌는 경로가 없다(§4 JSON 동일 실측).

판단 기록(결정 요청 아님): V4(구분양도 + 양도가액 구분 전무 + 감정평가 양쪽)를 ⑧도 통과시키는 것은 종전 ⑫·엔진 동작에 ⑧을 맞춘 것이다. 구분양도 모드의 감정평가 칸은 「30% 판정의 비교 대상」 카드이지만(`SaleSplitCompareBasisCard`), 입력된 감정평가가액은 값의 유무로 basis가 된다는 엔진 규약(`transfer-tax-api-split.ts:75`)과 같다. 이를 막으려면 ⑫ V4까지 좁혀 엔진 동작과 어긋나게 하는 반대 방향이 되어 채택하지 않았다.

## 7. anchor · 뮤테이션

### 7.1 anchor (`split-sale-std-era-fe8-12-parity.test.ts` 확장)

| ID | 내용 |
|---|---|
| T-4(전 256셀 ⇔) | ⑧ 차단 ⇔ ⑫ 400, 차단 ≥ 130 ∧ 통과 ≥ 110 (기존 T-8 «⑧이 더 엄격한 셀은 전부 감정평가 양쪽 입력» 대체) |
| T-10 | 감정평가 양쪽 ∧ 환산 파트 없음 40셀: 기준시가 없음·토지만·건물만 전부 ⑧ 통과 ∧ ⑫ 200 (V4·V7 모두) |
| T-11 | 감정평가 양쪽 ∧ 환산 파트: 그 파트의 분모만 요구 — 반대 파트 기준시가는 불요 (⑧·⑫ 모두 차단 ⇔ 분모 부재) |
| T-12 | 세액 불변: 200인 셀끼리 `result` JSON 전체 동일(≥ 40쌍) |
| T-13 | 소유자 분리 384셀(환산 없음·본인 소유 환산·**비소유 파트 환산**): 불일치 0, 비례 안분은 부분 기준시가 차단, 비소유 환산은 기준시가 없이 통과, 세액 불변 |
| T-14 | 파트 이월과세(증여자 환산) 72셀: 불일치 0, 증여자 환산 토지 + 토지 기준시가만 = 통과 · 건물 기준시가만 = 차단 |
| T-15 | 감정평가 **한쪽만**은 기존 동작 유지: 2016-01-01 · 기준시가 없음 → ⑧ 차단 ∧ ⑫ 400(두 칸) |
| 유지 | T-1~T-3·T-5~T-7·T-9(2016.1.1. 전 면제·환산 반례·구분 근거 전무·`saleSplitMode` 생략 fail-closed) |

### 7.2 뮤테이션 (cp 백업 → 변형 → 대상 테스트 → 원복 sha 일치 · git checkout/stash 금지)

| # | 변이 | 기대 |
|---|---|---|
| M-1 | ⑧ V4 완화 제거 | T-4·T-10 KILLED |
| M-2 | ⑧ V7 완화 제거(`appraisalBasis=false`) | T-4·T-10·T-11 KILLED |
| M-3/M-4 | 토지 / 건물 환산 요구 제거 | T-11 KILLED |
| M-5/M-5b | 비례 안분 양쪽 요구 제거(토지 / 건물) | T-13 KILLED |
| M-6/M-6b | 증여자 환산 토지 / 건물 요구 제거 | T-14 KILLED |
| M-7/M-7b | 비소유 파트 환산도 셈(토지 / 건물) | T-13 KILLED |
| M-8 | ⑫ 감정평가 양쪽 early return 제거 | T-4·T-10 KILLED |
| M-9 | 공용 술어를 «한쪽만 있어도 인정» | T-15 KILLED |
| M-10 | ⑧ 술어가 건물 감정평가를 보지 않음 | T-15 KILLED |

## 8. Do 순서

0. anchor 먼저(수정 전 실패 기록) → 1. 엔진 `export` + ⑧ + ⑫ → 2. 격자 재측정 → 3. 뮤테이션 → 4. tsc·lint·게이트·전체 vitest → 5. 브라우저.

## 9. 확인 필요 · 미검증

- **일반건물**(`assetKind: building` 단독, `validate-gb`) 경로의 감정평가 양쪽 × 기준시가는 별도 검증 함수라 이번 격자에 없다 — 같은 비대칭 가능성은 **확인 필요**(이번 범위 밖).
- ⑫ `refineEstimatedTransferStd`의 «별개 ∨ 일반건물이 아닌 비-비례 환산 파트»는 ⑫가 요구하지 않고 엔진이 던진다(route 400). ⑧은 엔진 기준으로 그 파트 분모를 요구하므로 route 상태는 정합한다(Zod 단계 400은 아님).
- 건물 기준시가 칸 힌트 문구(「안분 분모 겸 환산취득가 분모」)는 감정평가 양쪽에서 환산 분모 전용이 되나 UI는 건드리지 않았다.
- 2016.1.1. 전 면제(`saleStdPriceWaivedByEra`)와 이번 완화는 독립이다 — 감정평가가 없고 구분 기재·환산 파트 없음일 때만 면제가 적용되고, 감정평가 양쪽이면 이번 규칙이 적용된다(전자는 후자의 부분집합).

## 10. Do 결과

**변경(제품 4파일 + 테스트 1 + 문서)**

| 파일 | 변경 |
|---|---|
| `lib/tax-engine/sale-split-apportion-basis.ts:94` | `usableAppraisal`을 `export`(1단어) |
| `lib/calc/transfer-tax-validate-split-sale-std.ts` | `saleAppraisalIsBasis`(⑧ 공용 술어) 추가 · V7 파트별 요구를 감정평가 양쪽일 때 환산 파트 분모로 좁힘 · 문구 분기 |
| `lib/calc/transfer-tax-validate-split.ts` (V4) | `!saleAppraisalIsBasis(asset)` 한 줄 |
| `lib/api/transfer-tax-schema-required-refines-2a.ts:398` | `positive(a) && positive(b)` → `usableAppraisal(...)`(행동 변화 0) + 주석 |
| `__tests__/calc/split-sale-std-era-fe8-12-parity.test.ts` | T-8 → T-4 ⇔·T-10·T-11·T-12·T-13(384셀)·T-14(72셀)·T-15, 총 27건 |

| 항목 | 결과 |
|---|---|
| 수정 전 anchor | 27건 중 **5 실패**(T-4 ⇔ · T-10 · T-11 · T-13 · T-14) · 22 통과(기존 단언 유지 + T-12 «세액 불변»은 ⑫ 응답 비교라 수정 전에도 통과 = 엔진 비사용 증거) |
| 수정 후 anchor | 27/27 통과 |
| 격자 재측정(256셀) | ⑧통과·⑫200 **117** · ⑧통과·⑫400 **0** · ⑧차단·⑫400 **139** · ⑧차단·⑫200 **0** (수정 전 70/0/139/47). 감정평가 없음 96셀 정합 96/96(차단 69·통과 27) 유지. ⑫ 상태·fieldErrors·result는 256셀 전수 수정 전과 **동일**(⑫ 행동 변화 0) |
| 소유자 분리 격자 | 256셀 불일치 0(수정 전 ⑧ 과잉 54) → anchor는 비소유 파트 환산 128셀을 더해 384셀 |
| 이월과세 격자 | 72셀 불일치 0(수정 전 17) |
| 뮤테이션 | M-1~M-10 전부 KILLED(§10.1) — M-10은 처음 SURVIVED였다가 T-15에 ⑧ 첫 이슈 단언을 더해 KILLED |
| 정적 검사 | `tsc --noEmit` 0 · `npm run lint` 오류 0(경고 364는 사전 존재, 변경 5파일 경고 0) · 폰트·톤·다크짝·워크플로 러너 스크립트 통과 |
| 전체 vitest(`--maxWorkers=2`) | 3250파일 통과 · 38857테스트 통과 · 실패 0 · 보류 13 |
| 브라우저(Playwright, 임시 spec 삭제) | A: 구분양도 + 가액 구분 + 감정평가 양쪽 + 기준시가 비움 → `/api/calc/transfer` **200**, 요청 body에 `landStandardPriceAtTransfer`·`buildingStandardPriceAtTransfer` 키 **없음**·감정평가 두 키 있음, 결과(신고서 양식) 도달 · C: 양도가액 구분 전무(V4) + 감정평가 양쪽 → 200 · B(대조군): 감정평가 없음 + 기준시가 비움 → 요청 0건, 「양도시 기준시가」 안내 |

### 10.1 뮤테이션 (cp 백업 → 변형 → 대상 테스트 → 원복 sha 일치)

| # | 변이 | 결과 |
|---|---|---|
| M-1 | ⑧ V4 완화 제거 | KILLED 4 (T-4 ⇔·T-10·T-11·T-13) |
| M-2 | ⑧ V7 완화 제거 | KILLED 5 (+T-14) |
| M-3 / M-4 | 토지 / 건물 환산 요구 제거 | KILLED 3 / 3 (T-4 모순 0·⇔·T-11) |
| M-5 / M-5b | 비례 안분 양쪽 요구 제거(토지 / 건물) | KILLED 1 / 1 (T-13 — 이 변이의 유일한 안전망) |
| M-6 / M-6b | 증여자 환산 토지 / 건물 제거 | KILLED 1 / 1 (T-14 — 유일한 안전망) |
| M-7 / M-7b | 비소유 파트 환산도 셈(토지 / 건물) | KILLED 1 / 1 (T-13 foreign — 유일한 안전망, 처음 격자엔 비소유 환산이 없어 추가) |
| M-8 | ⑫ 감정평가 양쪽 early return 제거 | KILLED 7 |
| M-9 | 공용 술어를 «한쪽만 있어도 인정» | KILLED 2 (T-15) |
| M-10 | ⑧ 술어가 건물 감정평가를 무시 | KILLED 1 (T-15 — ⑧ 한쪽만 입력은 V8이 어차피 막으므로 «차단 여부»로는 못 잡고 **첫 이슈가 V7(양도시 기준시가)** 인지로만 잡힌다) |

### 10.2 계획과 다르게 한 점

- 계획 단계의 T-13은 256셀이었으나 M-7(비소유 파트 환산)이 격자에 없어 살아남을 수 있어 `foreign` 축을 더해 384셀로 늘렸다.
- 일반건물 경로는 범위 밖으로 둔 채다(§9).
- 앞 계획서(`split-v7-pre2016-fe8-12-parity.plan.md`)의 §3.3 「⑧이 더 엄격한 47셀」은 이 계획서로 해소됐다.
