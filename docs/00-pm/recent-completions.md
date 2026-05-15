# Recent Completions

> CLAUDE.md에서 분리된 최근 완료 작업 이력. 시간순(최신→과거).
> 안정적인 규칙·아키텍처는 `CLAUDE.md` / 메모리(MEMORY.md) 참조.

## 2026-05-14

- **사례 36 — 조합원입주권 양도 4분기 통합 PR 완료**. subject="right" 입주권 자체 양도 분기 UI 게이트 해제 + 환산모드 + 청산금 수령 + §89①4호 가목 1세대1입주권 비과세 + 12억 초과 안분 통합 (사례 44~48 후속). 신규 헬퍼 `applyOneRightExemption()` — subject="right" 가드로 사례 47 `applySettlementExemption`과 격리. 트리거 4조건 AND(subject=right + exemptionEligibleAtApproval + housing=0 + right=1). ≤12억 전액 마스킹 / >12억 right 전용 ratio 분기(`oneRightHighValueApplied` 플래그 — 12억 안분 게이트 `isOneHouseSingle`(housing=1) 가정 환류). 신규 1필드만(`priorHouseHoldingMonths`) + 기존 재사용 2필드(`exemptionEligibleAtApproval` 사례 47 / `priorHouseResidenceMonths` 사례 45). `redevelopment-lthd.ts:208` zeroBranch 주석 정정 — §94①2호 + §166①1호·2호 가목 구조 근거. UI: `RedevelopmentRightExemptionSection.tsx` 신규(199줄) — §0-A 안내(sky) + §⑥ 비과세(violet) + **C-1 안전장치 3종**((a) 자동 검증 useMemo / (b) rose 경고 카드 §115 + 국기법 §47의2~5 가산세 리스크 / (c) 토글 ON 시 면책 문구). 800줄 정책: RedevelopmentBlock 755 / RightExemption 199. anchor 53건 100% 통과(CORE-36 11 + A1 3 + A2 9 + A4 5 + A5 17 + 회귀가드 2 + 보강 6). 외부 검토 Pre-Do B-1 국세청 해석례 3건 메타데이터 첨부([64158]·[299260]·[152604]) — 12억 안분 분모 transferPrice 단일 해석 A 일관 지지. PDCA 4차 누적 정정 19건 (1차 엔진 코드 검증 7 / 2차 외부 검토 B·C 3 / 3차 자가재검토 8 / 4차 저심도 보완 4) + 디자인 환류 1건. gap-detector matchRate 100%. 전체 3,001 passed / 177 files / 0 failed. 후속 PR: 36-A3 승계조합원+입주권(§95④ ↔ 사례 48 준공일 충돌) / 36-B1 빈집소규모정비법 §29 / 36-B2 일시적 1입주권+1주택(§89①4호 나목) / 36-B3 5년 이내 단기양도 세율. 커밋 `d4d35b5` + `ad64892`.

## 2026-05-13

- **사례 35 후속-1 — §99-164-10 환산주택가격 완료**. 양도소득세 집행기준 99-164-10 적용 — 주택으로 최초공시 후 상가로 용도변경한 경우 취득가액 불명 시 환산주택가격 = 최초공시주택가격 × (취득당시 합계 ÷ 최초공시 당시 합계) 산식으로 자산별 환산기준시가 override. `general-building-converted-housing.ts` sibling 파일 신규(58줄, 800줄 정책). 4 신규 필드(`hasFirstDisclosure` + 3 std price). `applyConvertedHousingPriceOverride()`가 `buildGeneralBuildingAssetCards` 진입 시 자동 분기 — 미사용 경로 회귀 0. UI: GeneralBuildingBlock §⑦ 내부 sub-ToggleCard + 환산주택가격 미리보기(useMemo 순수). anchor 6개(F1-1 단위 산식·F1-1b 정확값 110M·F1-2 자산별 안분·F1-4/4b 미사용 회귀·F1-5 0 방어). 전체 2,791 passed 회귀 0.

- **사례 35 — 주택을 상가로 용도변경 완료**. 다주택 + 중과배제기간(2022-05-10 ~ 2024-05-09) 양도 시 LTHD 보유기간 기산일을 변경일로 이동(사전법규재산 2022-684·881, 서울행법 2012구단26961). 신규 필드 3개(`houseToCommercialConversion`/`conversionDate`/`wasMultiHouseAtConversion`) — AssetForm은 `gb*` 접두사. `resolveLTHDStartDate()` 순수 함수를 `transfer-tax-finalize.ts`에 배치(800줄 회피). `TransferTaxResult.lthdStartDate: Date` required 추가 (7 result emit 위치 + UI mock 3 동기화). `SURCHARGE_EXCLUSION_WINDOW` 상수 single source of truth(조특법 시행령 §167조의3, 대통령령 제32672호) — `multi-house-surcharge-helpers.ts:613` 치환. PDF anchor 4종(longTermHoldingDeduction=0 / taxBase=397,500,000 / calculatedTax=133,060,000 / localIncomeTax=13,306,000) + 회귀 anchor 35-2/35-3/35-5/35-7 + resolveLTHDStartDate 단위 3 → 15 passed/1 skipped. 양도세 전체 1015 passed 회귀 0. 14지점 동기화 완료. UI: GeneralBuildingBlock §⑦ 섹션(rose tone — fuchsia는 ToggleCardTone 미지원으로 대체) + 미리보기 카드(useMemo 순수). 후속: 환산취득가 §99-164-10 분기·중과 적용 케이스(35-6 skip)·세대원 자동 판정.

## 2026-05-12

- **부담부증여 Phase 3 — 증여세 통합 완료**. 무상이전분(C−B) 증여세 동시 산출. UI 4필드(관계·세대생략·미성년·신고기한) + Zod + 사이드바 giftFinalTax + anchor 9개(P3-1~4). 전체 2,757/2,758 통과. 후속: 사전증여 합산·외국납부세액공제·F-3 giftTax anchor.
- **부담부증여 Phase 2 — 메뉴 재설계 + 전 부동산 확장**. `transferType` 신설로 부담부증여를 양도 사건으로 분리. propertyType 4종(housing·land·building·general_building). TransferModeBlock 신규 + 사이드바 burdenedGift 메타. 케이스 5-a/12 후속 PR 차단. D-0-2 12억 분모 해석 B 확정. 14지점 sync-checker → ⑬ body.transferType 누락 즉시 수정. 전체 2,738/2,739.

## 2026-05-11

- **일반건물 4가지 조합 확장 (쌍방+쌍방·일방+쌍방·일방+일방)**. `extensionInfo.acquisitionMode` enum + `actualAcquisitionPrice/Expenses`. Step 2/3 분기. UI 서브 라디오 2옵션 + 모드별 필드 + 미리보기 카드 4분기. anchor 68개(§55 누진세율표 자가검증). 사례 31·32·33 회귀 0. 전체 934/935.
- **사례 33 UX 개선 — "쌍방+일방" 라디오 패턴**. acquisitionMethod 4번째 옵션 시각 표시 전용. 기존 3 boolean 조합 매핑으로 백엔드 변경 0. 라벨/hint 동적 + 시나리오 가이드 카드 + 안분 미리보기 카드. 변경 4파일(+158줄). 87/87 anchor 회귀 0.
- **사례 33 증축 건물의 취득 실거래가 환산**. `extensionInfo` 서브객체 5필드 + `actualBundled*` 2필드. `general-building-extension.ts`(299줄) 분리 — 양도가 3-way 안분(§166⑥) + 일괄 취득가 2-way 안분 + 건물2 환산(§176의2②) + 카드 3장. anchor 25개 toBe. 866/867 통과(회귀 0).
- **일반건물 다른 피상속인/증여자 분리 필드**. `buildingDecedent/buildingDonorAcquisitionDate?` 추가, 우선순위 fallback. 비파괴 확장. anchor 9개. 전체 2,589/2,589.
- **일반건물 #7-b 토지 증여이월과세 + 건물 신축 cross-cutting**. §97의2 + §114조의2 cross-cutting. `landCarryoverTaxation` 파이프라인 신규. aggregate→단건 spread로 비교과세 자동 작동. anchor 16개. 전체 2,580/2,580. **분리 PR 후속 표 4건(#4-a·#6·#7-a·#7-b) 모두 완료**.
- **일반건물 #7-a 토지 증여 + 건물 신축 회귀 보호 anchor**. donor 인프라는 #4-a 선행. 엔진 변경 0. anchor 18개. 전체 2,564/2,564.
- **일반건물 #6 토지·건물 모두 상속 회귀 보호 anchor**. 건물 카드 inheritance 보조 필드 매핑. 건물 LTHD 14년 28% = 8,179,704, 가산세 0. anchor 17개. 전체 2,546/2,546.

## 2026-05-10

- **일반건물 #4-a 토지 상속 + 건물 신축 회귀 보호 anchor**. `AssetCardForAggregate`/`buildProperties`에 토지 inheritance 보조 필드 매핑. 사례 32 결과 보존(가산세 13,300,202). anchor 17개. 전체 2,529/2,529.
- **일반건물 토지·건물 취득원인 분리 UX PR**. `gbIsSelfBuilt` boolean 폐지 → 토지·건물 각각 독립 `acquisitionCause` enum. A안(legacy 자동 폐기). anchor +13(2,499→2,512). Playwright 10/10 PASS. **다음 PR 신호**: `transfer-tax-validate.ts` 776줄 — +25줄 시 도메인 분할 선행.
- **신축 건물 단기양도 §114조의2 5% 가산세 사례 32**. 토지·건물 취득일 분리(2008/2018) + `gbIsSelfBuilt`/`gbBuildingAcquisitionDate` 2필드로 §114조의2 ① 5% 가산세(13,300,202) 발동. anchor 28개 + 회귀 51개 + 전체 2,497개. 후속 PR 4건 모두 완료(§176의2 ②정정·toOptionalDate·penaltyBase 승격·addYears).

## 2026-05-08

- **상업용건물·오피스텔 환산취득가 사례 29 + 일반건물 일괄 환산취득가 사례 31**. 신규 `propertyType: "general_building"` + `lib/tax-engine/general-building-valuation.ts`(382줄, §166⑥ + §176의2④ + §163⑥ + §102② 1차 통산 위임). 양도시 건물기준시가 잠금값 20,629,440(BigInt 손계산 함정 주의). anchor 38개 toBe. 2,233/2,233 회귀 보존.
