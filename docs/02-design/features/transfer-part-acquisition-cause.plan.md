# 파트별 취득원인 상이 — 건물 신축 + 토지 상속·증여

작성일 2026-07-30 · 대상 `assetKind ∈ {housing, building}` · **범위: 토지 상속/증여 + 건물 신축 2조합만**

## 1. 문제

`acquisitionCause`는 **자산 단위 단일값**이라 "건물=신축 / 토지=상속"을 표현할 수 없다.

취득원인을 「신축(자가건축)」으로 고르면 `CompanionAcquisitionCauseSection`이 렌더하는 것은:
- `NewConstructionDateBlock` — 사용승인일 등 4시점 → `acquisitionDate`
- `CompanionAcqNewConstructionBlock` — 신축비용 → `fixedAcquisitionPrice`

**토지 취득일·취득가액을 넣을 칸이 하나도 없다.** 「토지·건물 취득일 다름」 토글은 `CompanionAcqPurchaseBlock`(매매 전용) 안에만 있다. 그 결과 상속받은 땅에 집을 지어 판 경우 **토지 취득가액이 0**으로 계산된다(과대과세).

토글 설명이 "원시취득·신축 등"인 걸 보면 **토지 매매 + 건물 신축**은 의도된 지원 범위였고, 토지가 상속·증여인 조합만 빠져 있었다.

## 2. 설계 — 엔진 변경 0

### 2.1 엔진은 취득 *원인*을 모른다 (실측)

`calcSplitGain`이 아는 것은 파트별 취득 **방식**(`landAcqMode` 4-way: actual/estimated/appraisal/salesCase)뿐이다. `acquisitionCause`는 참조하지 않는다.

상속 §163⑨ 평가액·증여 신고가액은 모두 **"확인된 취득가액"**이므로 `landAcqMode="actual"` + `landAcquisitionPrice`로 흘리는 것이 법령상 정합적이다. 따라서:

- **`landAcquisitionCause`는 UI 전용 필드** — 취득가액 칸의 라벨·법령 근거 안내만 바꾼다. 엔진에 전달하지 않는다.
- 건물 취득가액의 정본은 기존 「신축비용」 칸(`fixedAcquisitionPrice`) — 파트 칸을 따로 두면 같은 값을 두 번 입력받게 된다.

### 2.2 알려진 한계 (범위 밖 — 기록)

상속 토지의 **§104②1호 단기보유 통산**(피상속인 취득일 합산)은 반영되지 않는다. 세율 판정이 자산 전체 단일(`acquisitionDate` 기준)이기 때문으로, 이는 split 경로의 **기존 한계**다(`transfer-tax-split-gain.ts:350-353` "단기세율 혼합 케이스 미구현"). 장기보유특별공제는 파트별 보유기간으로 정상 적용된다.

의제취득일(1985.1.1.) 이전 상속의 §176의2④ 환산도 적용되지 않는다 — 그 경로는 자산 전체 상속(`acquisitionCause === "inheritance"`)에서만 동작한다.

## 3. 구현

| # | 지점 | 내용 |
|---|---|---|
| ①②③ | 폼 상태·initial·normalize | `AssetForm.landAcquisitionCause: "" \| "inheritance" \| "gift"` 신설. factory 기본값 `""`, `migrateAsset`에 stale 세션 방어 |
| ⑤ | UI | 신규 `NewConstructionLandAcqBlock` — 토글 ON 시 ⓐ토지 취득원인 라디오 ⓑ토지 취득일 ⓒ토지 평가액 ⓓ축 A(`LandBuildingSaleSplitSection` 재사용). 토글이 `hasSeperateLandAcquisitionDate`·`landAcqMode`·`buildingAcqMode`를 **단일 배치**로 세팅 |
| ④⑬ | API 변환 | `buildingAcquisitionPrice`가 비면 `landAcquisitionCause` 설정 시에 한해 `fixedAcquisitionPrice`(신축비용)로 후퇴 |
| ⑧ | validation | `validateSeparateAcqParts`의 건물 파트 `price`에 **같은 후퇴** 적용 — 없으면 "API 통과 ↔ validate 차단" 모순 |
| ⑨~⑫⑭ | Zod·route | **변경 없음** — 신규 엔진 필드 없음 |
| ⑥⑦ | 사이드바·결과 | **변경 없음** — 별개취득이므로 사이드바는 `separateAcqPartsSum` 경로(기존), 결과는 `SplitGainDetailSection`(기존) |

### 라벨 매핑

| 토지 취득원인 | 취득일 라벨 | 취득가액 라벨 | 근거 |
|---|---|---|---|
| 상속 | 상속개시일 | 토지 상속개시일 평가액 | 소득령 §163⑨ (상증법 §60~§66 평가액) |
| 증여 | 증여일 | 토지 증여 신고가액 | 증여일 현재 시가 또는 보충적 평가액 |

## 4. 검증 결과

| 항목 | 결과 |
|---|---|
| anchor `part-acquisition-cause-newconstruction.test.ts` | 신규 13건(API C1 · validate C2 · 엔진 C3 · 증여 C4) 전부 통과 |
| 전체 vitest | **1113파일 12,442건 통과** |
| E2E | **40/40** (P8 4건 신규: 토글 OFF 기본 / ON 시 입력 노출 / 증여 라벨 전환 / 매매 미노출) |
| `tsc --noEmit` · 변경 파일 lint | 0건 |

핵심 anchor(C3): 토지 상속 2015 + 건물 신축 2020 → **토지 취득가액 3억이 0으로 떨어지지 않고**, 보유기간이 토지 10년 / 건물 5년으로 갈린다.

## 5. 남은 과제

- **토지 매매 + 건물 신축**: 현재도 매매 취득원인 + 「취득일 다름」으로 표현 가능(파트별 4방식의 실거래가 칸). 이번 범위 밖.
- **상속 단기보유 통산·의제취득 특례의 파트별 적용**: §2.2 — 파트별 세율 미구현과 한 묶음.
- **그 외 조합**(토지 신축? 건물 상속 등): 요청 시 같은 패턴으로 확장 가능.
