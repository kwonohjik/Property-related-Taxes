# 소령 §155⑳ 코드 리뷰 후속 수정 계획서

- 작성 2026-11-04 · 워크트리 `Property-related-Taxes-r155r` (브랜치 `review/155-20-residence-exemption`, base `1ae2546d7`)
- 근거: 같은 날 §155⑳ 코드 리뷰(법령 요건 · 계산 경로 · 화면/API 동기화 3축). finding 11건 중 이 계획서가 다루는 것은 아래 §4 범위.
- 상태: **계획만**. 코드 무수정. 실측은 throwaway probe(삭제 완료).

## 1. 사용자 결정 (2026-11-04 — 재질문 금지 · D-1~D-5)

| ID | 결정 |
|---|---|
| D-1 (R-1) | 2020.7.10./7.11.·2020.8.18. 컷오프는 **지자체 임대사업자등록 신청일** 하나로 판정한다. 2018.3.31.(가목 1) 「사업자등록등」)·임대기간 기산은 두 등록 중 늦은 날(현행) 유지. |
| D-2 (F-1) | §155⑳ 직전거주주택보유주택(B)이 성립하고 과세 기간분에 다주택 중과가 붙으면 **장기보유특별공제를 배제**한다(소득세법 §95② 괄호 「제104조제7항 각 호에 따른 자산은 제외」). |
| D-4 (Q-1) | 다주택 중과 화면 라벨 「임대사업자 등록일」→「임대사업자 등록 신청일」(공용 술어가 신청일로 읽으므로 입력 의미를 맞춘다). |
| D-5 (Q-2) | ㉓ 말소 특례에 「법률 제17482호 부칙 §5① 적용 주택」(단기민간임대 또는 장기일반 매입 아파트) 게이트를 넣는다. |
| D-3 (SYNC-2) | 계산기에서 호별 「요건 충족」 토글 OFF는 막지 않고 ⑳ 불성립으로 계산한다. 부담부증여 카드(`full` + 선언 토글 있음)는 지금처럼 막는다. |

## 2. 법령 근거 (KoreanLaw MCP 본문 확인)

- 소득세법 시행령 §155⑳ 본문(현행 MST 290841, 2026.10.1. 시행): 「…2020년 7월 10일 이전에 「민간임대주택에 관한 특별법」 제5조에 따른 **임대사업자등록 신청**(임대할 주택을 추가하기 위해 등록사항의 변경 신고를 한 경우를 포함한다)을 한 주택으로 한정하며…」
- 소득세법 시행령 §167의3①2호 마목 2): 「2020년 7월 11일 이후 … 임대사업자등록 **신청**을 한 … 아파트」 / 대통령령 제31083호 부칙 제5조: 마목 의무기간 8년→10년은 2020.8.18. 전에 등록을 **신청**한 주택 기준.
- 대비: 가목 1) 「2018년 3월 31일까지 **사업자등록등**을 하였을 것」(사업자등록등 = 세무서 §168 + 지자체 §5 — 두 등록 모두) → max 유지가 맞다.
- 소득세법 §95②: 장기보유특별공제 대상에서 「제104조제3항에 따른 미등기양도자산 및 같은 조 제7항 각 호에 따른 자산」 제외. 일반 경로 구현 `lib/tax-engine/transfer-tax-lthd.ts:178`(L-1 — 중과·비유예·`isMultiHouseLthdExclusionEra`).

## 3. 실측 (probe, mock 세율 `loadFallbackTransferRates`)

### M-1 R-1 — §155⑳ 경로 (거주주택 2012 취득·거주 60개월, 임대 1호 장기일반 매입·기준시가 3억·72개월, 조정·주택 수 2)

| 양도일 | 양도가 | 임대 호 | 신청 7.9.·사업자등록 8.3. (현행) | 신청·사업자등록 모두 7.9. (= D-1 후 기대) |
|---|---|---|---|---|
| 2027-01-05 · 2026-08-01 | 10억 | 아파트 | ⑳ 불성립(마목 `APARTMENT_RESTRICTED`) · 중과 2주택 · **299,816,000** | RH-A1 · **0** |
| 〃 | 20억 | 아파트 | 불성립 · **998,178,500** | RH-A2 · **77,341,000** |
| 〃 | 10억·20억 | 비아파트 | RH-A1/A2 성립(0 · 77,341,000) — 단 마목 8년 미달이라 ㉑ 대기·㉒ 추징 안내 | 가목 5년 충족 · 대기 없음 |

### M-2 R-1 — 다주택 중과 경로 (공용 `checkRentalArticle("마", …)` 직접 호출, 수도권 3억, 임대 9년)

| 입력 | 현행 | D-1 후 기대 |
|---|---|---|
| 아파트 · 신청 7.9. · 사업자등록 8.3. | passed=false `APARTMENT_RESTRICTED` | passed=true |
| 비아파트 · 신청 8.10. · 사업자등록 8.25. | 의무 10년 · `RENTAL_PERIOD_SHORT` | 의무 8년 · passed=true |

→ 공용 술어(`rental-article/check.ts`)를 고치면 중과 경로도 같이 바뀐다. **방향은 언제나 유리 쪽**: 신청일 ≤ max(두 등록)이므로 컷오프 앞쪽(가목·8년·아파트 허용)으로만 움직인다.

### M-3 F-1 — ⑳ B (기존 anchor `rental-prhp-surcharge-unverified-notice` N-1 입력: 2009 취득, 양도 2026-08-01, 15억, 임대 1호, RH-B2)

| 입력 | 현행 | 장특 0 (D-2 후 기대 — `calculateGain95BothTables`를 0 공제로 대체한 probe) |
|---|---|---|
| 주택 수 2 · 조정 (중과 2주택 +20%p) | 장특 303,300,000 · 과세표준 554,561,000 · **338,676,602** | 장특 0 · 과세표준 806,300,000 · **510,362,600** |
| 주택 수 1 · 조정 (중과 없음) | 216,673,182 | **불변이어야 함**(중과 없으면 배제 없음) |
| 2024-06-01 양도 (한시 배제 기간) | 중과 없음 · 223,679,412 | 불변 |

### M-4 SYNC-2 (리뷰 에이전트 probe — 구현 전 재실측 필요, V-7)
계산기 ⑧ 인자로 `validateRentalHousingException` 호출 시 자기확인 OFF·나목 국민주택 OFF·나목 2호 OFF 모두 차단 / 같은 입력 route POST는 엔진 「적용 불가」 · 283,635,000(mock).

## 4. 범위와 PR 분할

| PR | 내용 | finding |
|---|---|---|
| PR-1 | 컷오프 신청일 기준(엔진 공용 술어 + ⑧ + ⑤ 표시 + scope 헬퍼) | R-1 |
| PR-2 | ⑳ B 중과 시 장특 배제 + 고지 문구 | F-1 |
| PR-3 | 계산기 카드·⑧: 상생임대 양도일 전달 · 호별 토글 차단 해제 | SYNC-1 · SYNC-2 |
| PR-4 | Low 묶음: ㉓ 대상 유형 게이트(Q-2) · 어린이집 안내 · 도시형 생활주택 문구 · 아·자목 숨은 `isApartment` · `toDate` 통일 | R-2 · R-3 · R-4 · SYNC-3 · SYNC-4 |

범위 밖(이번에 안 함): F-2(12억+1원 RH-A2 「비과세」 표시 — 세액 같음) · SYNC-5(부담부증여 구 이력 migrate — 크래시 없음) · 장기어린이집 ⑳ 계산 지원(G-8 확정 미구현).

## 5. 설계

### PR-1 (R-1)
1. **신청일 헬퍼 신설** — `rental-article/check.ts`에 `regApplicationTs(u)`(= 지자체 신청일 `rentalRegistrationDate`, 없으면 null) 추가. 기존 `deriveEffectiveRegDate`(max, `check.ts:233-238` · `eligibility.ts:171-180`)는 이름·의미 유지(등록 완비·2018.3.31.·임대기간 기산·바목 2025.2.28. cap 등 다른 용도).
2. 컷오프를 신청일로 바꾸는 곳(전수):
   - `eligibility.ts:243-247` `deriveRentalArticle` 가/마·다/바 경계 → 인자를 신청일로. 호출부 `eligibility.ts:146·438`, `lib/calc/transfer-tax-validate-rental-exception.ts:179-183`, `lib/calc/apt-deadline-extension-scope.ts:135`, `lib/calc/rental-unit-termination-scope.ts:23`, `components/calc/transfer/RentalUnitCard.tsx:75` — 모두 같은 헬퍼로(3중 패턴).
   - `check.ts:247-256` `isApartmentRestrictedForArticle` 가·마 `>= Y2020_07_11` → 신청일.
   - `rules.ts:63-80` `rentalRequiredYears` 마·바 `< Y2020_08_18` → 호출부(`check.ts:274·371`, `eligibility.ts:257`)가 신청일 ts를 넘긴다. `rentalStdPriceCap`(바목 2025.2.28.)은 이번 범위 밖(V-5) — max 유지.
3. ⑤ 문구: `RentalUnitCard.tsx:286` 「아파트 2020.7.11 이후 등록분 제외」 · `:609` hint → 「2020.7.11. 이후 등록 **신청**」. 등록기준일 표시(`:284`)는 그대로 두고 「목 판정은 신청일 기준」 한 줄 추가.
4. 중과 경로 화면 라벨(D-4): `HouseEntryEditor.tsx:578` · `SellingHouseLongTermRentalSection.tsx:91` 「임대사업자 등록일」 → 「임대사업자 등록 신청일」.
5. 결과 echo `effectiveRegDate`(`eligibility.ts:575`, 결과 카드 `RentalHousingExceptionDetailCard.tsx:151`)는 의미 유지.

### PR-2 (F-1)
1. **중과 판정을 장특 전에** — ⑳ step(`transfer-tax-rental-housing-step.ts:148`)은 `transfer-tax.ts:485`에서 불리고, 중과 판정 `resolveSurchargeApplication`은 그 뒤 `transfer-tax.ts:542-555`에 있다. step 안 세액은 `calcTax(rheTaxBase, …, multiHouseSurchargeResult)`(`step.ts:461-476`)가 중과를 붙인다. → step 진입 시 같은 술어로 `isSurchargeCase && !isSuspended && isMultiHouseLthdExclusionEra(transferDate)`를 구해(V-1: calcTax 내부 판정과 결론 일치 실측) `calculateRentalHousingException`에 `lthdExcludedBySurcharge` 인자로 넘긴다.
2. `rental-housing-exception/index.ts:128-131` `bothTables`가 플래그면 표1·표2 공제 0(파트별 `ByParts`도 0). **B 시나리오에만** 적용(A는 §167의10①15호로 중과 배제 — anchor N-3a로 고정). ⚠️ 구현 중 실측: 명부 없는 주택 수 fallback이 A에 중과를 붙이는 판정 보류 입력(`transfer.route.unknown-unfavorable-interp-axes` UX-A4·A5·A8)은 A에도 적용하면 199,997,600→497,046,000으로 뛴다 — 결정 범위(B) 밖이라 적용하지 않고 별건(V-9)으로 남긴다.
3. echo: 결과에 장특 배제 사유(`exclusionReason: "multi_house_surcharge"` — 일반 경로 L-1과 같은 값) · steps 산식에 「중과 대상이라 장기보유특별공제 배제(소득세법 §95②)」.
4. 고지 `PRHP_SURCHARGE_UNVERIFIED_NOTICE`(`transfer-tax-rental-housing-judge.ts:489-490`)에 「장기보유특별공제도 적용하지 않았다」를 덧붙인다(해석 미확보 고지는 유지).
5. 형제 경로: 완공APT ⑳(`transfer-tax-redevelopment-apt-rental-residence.ts`) B 분기 · 다건(`transfer-tax-aggregate-asset-records.ts:354-360` ⑳ 슬롯) · 배율 초과 분리(`transfer-tax-rental-housing-nbl-split.ts`) — V-2·V-3에서 실측 후 같은 플래그 전달.

### PR-3 (SYNC-1 · SYNC-2)
1. SYNC-1: `lib/calc/rental-residence-form-facts.ts:22-29` `qualifiesWinWinRental`에 `transferDate: toOptionalDate(form.transferDate)` 추가(엔진 `step.ts:247`·judge `:102`·부담부증여 `lib/calc/gift-burdened-one-house.ts:345-350`과 같은 사실). 이 함수를 판정 메뉴(`facts`) 카드도 쓰는지 확인해 같이 고친다(V-8).
2. SYNC-2: `transfer-tax-validate-rental-exception.ts:148` `blocksUnitFactToggles = mode === "full"` → `mode === "full" && blockRequirementShortfall !== false`(계산기 호출 `transfer-tax-validate-asset.ts:413-427`은 이미 `false`를 넘김). 주석 S16-6(`:138-147`)의 「계산기는 종전대로 막는다(거주 미달과 같은 구조)」를 #2868 이후 기준으로 고쳐 쓴다. 부담부증여는 `blockRequirementShortfall` 기본값이라 불변.
3. 계산기 카드(`RentalHousingExceptionSection` `mode="calc"`, `:688`)는 호 카드를 그리지 않는다 — 토글 OFF 호는 결과 화면 ⑳ 불성립 사유(`unitFailReasons`)로 안내되는지 확인(V-7).

### PR-4 (Low)
1. R-2(D-5): ㉓ 대상 판정 `isTerminationEligibleArticle`(`eligibility.ts:125`)에 「법률 제17482호 부칙 §5① 적용 주택」 = 단기민간임대 또는 장기일반 **매입 아파트** 게이트 추가(`terminatedRegistrationType`·`isApartment`·`rentalAcquisitionType`). 아니면 ㉓ 불성립 + 사유 문구. ⑤ 말소 토글 노출 술어(`rental-unit-termination-scope.ts`)도 같은 조건(3중).
2. R-3: `RentalHousingExceptionSection` 상단 안내에 「장기어린이집(§167의3①8호의2) 보유자는 이 계산에서 ⑳을 적용하지 않습니다」 한 줄(ToneCard).
3. R-4: ~~아파트 hint에 도시형 생활주택 제외 문구~~ — **보류(V-10)**. 같은 「아파트 여부」 토글이 마목 2)(2020.7.11. 이후 아파트 배제 — 도시형 생활주택인 아파트도 아파트)와 가목2)·나목2)·라목8)·마목4) 양도기한(도시형 생활주택인 아파트 제외)을 함께 가른다. 문구만 넣으면 도시형 아파트 보유자가 「아님」을 골라 마목 2) 배제가 빠지는(유리한 오답) 경로가 생긴다 — 3호 후단의 `isUrbanLifeHousingApartment`처럼 별도 칸이 필요(별건).
4. SYNC-3: ④ `transfer-tax-api-rental-housing.ts:59` `isApartment`를 ⑤ `showApartment`(`RentalUnitCard.tsx:150`)와 같은 술어일 때만 보내고 아니면 `false` — 술어는 leaf로 빼 ⑤·④가 공유.
5. SYNC-4: `app/api/calc/transfer/_rental-engine-input.ts:23·24·41·52` `new Date(x)` → `toDate(v, "field")`/`toOptionalDate(v)`.

## 6. 케이스 매트릭스 (anchor 대상)

| # | 축 | 입력 | 기대 |
|---|---|---|---|
| C-1 | R-1 ⑳ | 아파트 · 신청 7.9. · 사업자등록 8.3. · 10억 | RH-A1 · 0 (현행 299,816,000) |
| C-2 | R-1 ⑳ | 같은 입력 20억 | RH-A2 · 77,341,000 (현행 998,178,500) |
| C-3 | R-1 ⑳ [짝] | 아파트 · 신청 7.11. · 사업자등록 7.9. | 마목 · `APARTMENT_RESTRICTED` (신청일이 늦으면 제한 유지) |
| C-4 | R-1 ⑳ | 비아파트 · 신청 7.9. · 사업자 8.3. · 72개월 | 가목 5년 · ㉑ 대기 없음 |
| C-5 | R-1 중과 | 마목 아파트 · 신청 7.9. · 사업자 8.3. | 중과 배제 인정 |
| C-6 | R-1 중과 | 마목 비아파트 · 신청 8.10. · 사업자 8.25. · 9년 | 의무 8년 · 인정 |
| C-7 | R-1 [짝] | 2018.3.31. 경계(중과 가목 `passesRegistrationCap`) | 두 등록 모두 기준 — 불변 |
| C-8 | F-1 | N-1 입력(주택 수 2 · 조정 · 2026-08-01) | 장특 0 · 510,362,600(구현 후 재실측 값으로 확정) |
| C-9 | F-1 [짝] | 주택 수 1 · 비조정 · 2024 양도 · 시나리오 A | 현행 값 불변(216,673,182 · 223,679,412 · N-3a) |
| C-10 | F-1 | 다건 자산 1건 = 단건 | 같은 세액(V-2) |
| C-11 | SYNC-1 | 상생임대 종료 2024-03-01 · 양도 2028-06-01 · 거주 12개월 | 카드 거주 ✗ = 엔진 불성립 |
| C-12 | SYNC-1 [짝] | 양도 2027-06-01 | 카드 ✓ = 엔진 성립 |
| C-13 | SYNC-2 | 계산기 · 자기확인 OFF / 나목 국민주택 OFF / 2호 OFF / 라목 5호 OFF | ⑧ 통과 · 엔진 불성립 세액 |
| C-14 | SYNC-2 [짝] | 부담부증여 카드 같은 입력 | ⑧ 차단 유지 |
| C-15 | R-2 | 비아파트 장기일반 자동말소 · 5년 내 양도 | ㉓ 불성립 + 사유 |
| C-16 | R-2 [짝] | 단기 · 장기일반 매입 아파트 말소 | 현행 성립 유지 |
| C-17 | SYNC-3 | 아목 + 숨은 `isApartment=true` | ④ false · 성립(현행 283,635,000 → 0) |

## 7. 검증

- 각 PR: `npx vitest run __tests__/tax-engine/transfer/ __tests__/calc/` + 변경 파일 관련 anchor. 공유 단언 반전(기존 「차단」 단언 — `validate-rental-exception.test.ts:152` 등) 전 역grep.
- PR-1·PR-2는 엔진 공용 경로(`lib/tax-engine/**`)라 pre-push 전체 테스트.
- 브라우저: 판정 메뉴 → 계산기 인계 후 C-1·C-13 결과 화면 확인(Playwright).

## 8. 미검증(V) · 사용자 결정(Q) 레지스터

| ID | 내용 | 착수 조건 |
|---|---|---|
| V-1 | ✅ 해소(PR-2) — step의 `calcTax(…, effectiveInput, multiHouseSurchargeResult)`가 쓰는 같은 술어 `resolveSurchargeApplication`을 같은 입력으로 장특 전에 부른다(구조적으로 같은 결론). | — |
| V-2 | ✅ 해소(PR-2) — 단건 route = 다건 route(자산 1건) 510,362,600 · 짝 216,673,182 (`__tests__/api/rental-155-20-b-surcharge-lthd.route.anchor.test.ts`). 다건 rateGroup이 갈리는 2건 이상 입력은 미실측. | — |
| V-3 | ✅ 해소(PR-2) — 완공APT ⑳은 시나리오 B를 지원하지 않고(`transfer-tax-redevelopment-apt-rental-residence.ts:61` 비과세 거둠), 겸용주택은 A만. 배율 초과 분리 시 주택분은 같은 `calculateRentalHousingException`을 탄다. | — |
| V-4 | R-1 방향 단조성(유리 쪽만) 격자 확인 — 가/마·다/바·8/10년·아파트 | PR-1 Do 전 |
| V-5 | 바목 cap 2025.2.28.·아·자목 2025.6.4. 게이트 문언(신청 vs 사업자등록등) — **범위 밖, 별건 후보** | 별건 |
| V-6 | 조특법 감면 `rental-housing-reduction.ts:176-177` 단일 `registrationDate` 컷오프 의미 — **범위 밖, 별건 후보** | 별건 |
| V-7 | SYNC-2 재실측(에이전트 수치) + 계산기 결과 화면에서 OFF 호 불성립 사유 표시 | PR-3 Do 전 |
| V-8 | `calcRentalResidenceFacts`의 호출처 전수(계산기 ⑤·⑧, 판정 메뉴 카드) — SYNC-1이 판정 메뉴 ✓/✗에도 있는지 | PR-3 Do 전 |
| V-9 | 시나리오 A에 명부 없는 주택 수 fallback으로 중과가 붙는 판정 보류 입력(UX-A4·A5·A8) — 중과 + 표2 장특이 함께 적용되는 상태. A의 15호 배제와 fallback 중과 중 어느 쪽이 맞는지 · 장특 배제를 A에도 할지 — **별건, 사용자 결정 필요** | 별건 |
| V-10 | R-4 도시형 생활주택 아파트 — ⑳ 호에 별도 입력(`isUrbanLifeHousingApartment`)을 두고 양도기한 게이트만 제외할지 — **별건** | 별건 |
| Q-1 | ✅ (a) 라벨 변경 — D-4 (2026-11-04) | — |
| Q-2 | ✅ (a) 게이트 넣음 — D-5 (2026-11-04) | — |
