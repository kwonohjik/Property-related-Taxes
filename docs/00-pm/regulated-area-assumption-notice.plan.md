# 계획서 — 결과 화면 「조정대상지역 판정 — 확인 필요」 고지

> 2026-11-05 · 기준 master `10690a782` · 선행: #2909(Step4 건너뛰어도 판정) · #2919(약칭 정규화 + 알아볼 수 없는 주소 = 조정대상지역 low)
> 상태: **구현(Do)** — 2026-11-05 사용자 결정 Q-1 a · Q-2 a · Q-3 a(권장안)

## 0. 한 줄 요약

법정동코드 없이 주소 문자열로 조정대상지역을 판정하면, 신뢰도가 높지 않은 판정(low·medium)도 그대로 세액에 실린다. 그런데 그 근거는
Step4 「보유 상황」 안내에만 있다. Step4를 건너뛰면(#2909 이후 계산 가능) 사용자는 그 가정을 모른다. 결과 화면 4종(+다건)에 폼에서
파생한 고지 한 줄을 둔다 — 선례 `OneHouseJudgmentProvenanceLine`·`SameDayOrderLine`과 같은 자리·같은 방식이다.

## 1. 실측 (2026-11-05 · 이 브랜치 · throwaway probe — `checkRegulatedArea`)

| 주소(코드 없음) | 날짜 | 판정 |
|---|---|---|
| `강남구 테헤란로 1`(시·도 생략) | 2026-02-16 | **조정대상지역 · low** — 「시·도를 알아볼 수 없어 조정대상지역으로 보고 계산합니다」(#2919 B) |
| `세종특별자치시 한누리대로 1` | 2020-06-01 | 조정대상지역 · medium — 「동·지구 단위 지정/제외 — 정확한 소재지 확인 필요」 |
| `충청북도 청주시 상당구 1` | 2020-12-01 | 조정대상지역 · medium (같은 근거) |
| `경기도 남양주시 화도읍 1` | 2020-12-01 | **조정대상지역 · medium** — 시군구 단위 매칭이라 읍·면 제외를 못 본다 |
| `제주특별자치도 제주시 1` | 2020-06-01 | 아님 · low — 「데이터 미수록 — 직접 확인 필요」(미수록 시도 안전장치) |
| `서울 강남구 테헤란로 1` | 2026-02-16 | 조정대상지역 · high(#2919 정규화) |

- 이 값들은 ④가 그대로 싣는다(`calcStoredRegulatedFlags` → `calcEffectiveIsRegulatedAtTransfer`·`calcEffectiveWasRegulatedAtAcquisition`).
  세액 예: 시·도 생략 강남 1주택 거주 0 → 237,435,000(`__tests__/calc/regulated-area-abbrev-address.anchor.test.ts`).
- 근거가 보이는 곳은 Step4 `useRegulatedAreaAutoTip.tsx` 안내 카드뿐이다(마운트 때만 계산). 결과 화면 4종·다건에는 조정대상지역 판정 근거
  표시가 없다(`grep 조정대상지역 components/calc/results` — 세율 코드·중과 표·겸용 섹션의 결과 값 표시만).

## 2. 선례 (코드 인용은 이 브랜치)

- `components/calc/results/transfer/SameDayOrderLine.tsx` · `OneHouseJudgmentProvenanceLine.tsx` — **폼(`formData`)에서 읽는다**.
  엔진 결과에 실으면 3종 결과뷰의 어댑터 화이트리스트가 새 필드를 침묵 strip한다(그 파일 머리 주석). `PrintSection` 밖이라 선택 출력과 무관하게 인쇄된다.
- 놓인 자리 4+1곳: `TransferTaxResultView.tsx:185-186` · `BundledAllocationCard.tsx:203-204` · `mixed-use/MixedUseResultCard.tsx:108-109` ·
  `MultiTransferTaxResultView.tsx:515-524`(건마다 `p.form` · `label`).
- PDF 생성기(`lib/pdf/generate-result-pdf.ts`)에는 선례 두 줄도 없다 — 이번에도 같은 범위로 둔다(V-2).

## 3. 권장 설계 (Q-1 a · Q-2 a · Q-3 a 기준)

### 3.1 leaf — 「주소 문자열 판정이 실제로 쓰였고 신뢰도가 높지 않다」

`lib/calc/effective-regulated-at-acquisition.ts`의 `calcStoredRegulatedFlags`가 이미 판정을 부른다. 그 안쪽을 **판정 결과까지 돌려주는**
함수로 한 번 나누고(별도 판정식 금지 — 같은 `judgeRegulatedArea` 호출), 고지 leaf를 그 위에 둔다.

```ts
/** 결과 고지 — ④가 실은 두 값 중 주소 문자열 판정에서 왔고 신뢰도가 high가 아닌 것. */
export function regulatedAddressAssumptions(form): Array<{
  which: "transfer" | "acquisition"; date: string; isRegulated: boolean; confidence: "medium" | "low"; basis: string;
}>
```

- 조건(④와 같은 술어): 주 자산 법정동코드도 폼 전역 코드도 없음 · 그 값의 토글을 직접 만지지 않음(입주권·분양권은 표지 무시 — #2909와 같다) ·
  주택 계열 · 판정 신뢰도 ≠ high.
- 취득 당시는 `calcResidenceJudgmentDate` 기준일이다(④·Step4와 같은 leaf).

### 3.2 화면

- `RegulatedAreaAssumptionLine({ form, label? })` — amber `ToneCard` 「조정대상지역 판정 — 확인 필요」.
  줄마다 「양도일(YYYY-MM-DD) · 조정대상지역으로 보고 계산 / 아님으로 계산 — {basis}」, 끝에 할 일 한 줄:
  「주소검색으로 소재지를 고르면 법정동코드로 동 단위까지 판정합니다. 또는 보유 상황에서 직접 선택하세요.」
- 자리: 선례 두 줄 바로 아래, 4+1곳(다건은 건마다 `label`). `PrintSection` 밖.
- Step4 안내는 그대로 둔다.

## 4. 케이스 매트릭스 (Do anchor)

| # | 입력 | 기대 |
|---|---|---|
| N-1 | `강남구 테헤란로 1` · 안 만짐 | 두 줄(양도·취득) · 조정대상지역으로 보고 계산 · low 근거 |
| N-2 | `경기도 남양주시 화도읍 1` · 2020-12-01 양도 | medium 줄 |
| N-3 | `서울특별시 강남구 …` | 고지 없음(high) |
| N-4 | 법정동코드 있음 | 고지 없음(코드 판정) |
| N-5 | N-1 + 두 토글 직접 만짐 | 고지 없음 |
| N-6 | N-1 + 양도 토글만 만짐 | 취득 줄만 |
| N-7 | 토지 | 고지 없음 |
| N-8 | `제주특별자치도 제주시 1` | low 「아님으로 계산 — 데이터 미수록」 줄(Q-1 a) |
| N-9 | 다건 2건 중 1건만 해당 | 해당 건 label로 한 줄 |
| N-10 | 단건·일괄·겸용·다건 결과뷰 렌더 | 4+1곳 모두 같은 줄(UI 테스트) |

parity: N-1·N-6에서 줄의 값(조정대상지역/아님)이 ④ 본문 `isRegulatedArea`·`wasRegulatedAtAcquisition`과 같다.

## 5. 결정 레지스터 (Q)

| Q | 질문 | 선택지 | 권장 |
|---|---|---|---|
| Q-1 | 어떤 판정을 알리는가 | **a** 신뢰도 high가 아닌 주소 문자열 판정 전부(low·medium, 조정대상지역/아님 모두) · b 조정대상지역으로 본 경우만(low·medium 중 true) · c #2919 B(시·도 미인식)만 | **a** — N-2(화도읍 — 읍·면 제외를 못 봐 조정대상지역으로 가정)처럼 medium도 가정이다. 아님(low)도 「미수록 — 직접 확인 필요」가 판정 함수 자체의 문구라 같은 원칙(P-B)으로 알린다 |
| Q-2 | 자산 범위 | **a** 주택 계열(`isHousingLike` — 판정이 실리는 범위, 훅·leaf와 같다) · b §154① 대상(주택·재개발APT)만 | **a** — 입주권·분양권도 판정값이 ④에 실린다. 토글이 없으니 고지가 유일한 단서다 |
| Q-3 | 「결론을 가를 때만」 고지 원칙 | **a** 판정값이 ④에 실리면 항상 · b 반대 값으로 한 번 더 계산해 세액이 다를 때만 | **a** — b는 계산마다 엔진을 두 번 부르고(다건은 건마다) 결과 화면이 계산 상태를 가져야 한다. 고지 문구가 「~로 보고 계산」이라 결론과 무관해도 거짓이 아니다 |

## 6. 미검증 레지스터 (V)

| V | 내용 |
|---|---|
| V-1 | 이력에서 다시 연 결과 — 이력 화면(`app/history`)은 계산기로 복원해 같은 결과뷰를 쓰는지 Do 단계에서 확인(선례 두 줄과 같은 경로인지) |
| V-2 | PDF — 선례 두 줄도 PDF에 없다. 같은 범위로 두되, PDF 포함 여부는 별건 결정 |
| V-3 | 법정동코드 경로의 「지정 지구 안인가」 미선언(medium) — 이 계획은 주소 문자열 경로만 다룬다. 코드 경로 고지 현황은 확인 필요 |
| V-4 | 판정 메뉴(`app/calc/one-house-exemption`) — 토글이 보이는 입력이라 이 고지 대상인지 별건 |

## 7. 작업 순서·시간

1. leaf 분리 + `regulatedAddressAssumptions` + 단위(N-1~N-9) → verify: #2909·#2919 anchor 불변 (40분)
2. `RegulatedAreaAssumptionLine` + 4+1곳 배치 + UI 테스트(N-10) (40분)
3. E2E 1건(시·도 생략 주소 → Step4 건너뛰고 계산 → 결과 화면에 고지) (30분)
4. 회귀·tsc·lint·리뷰 게이트 (40분)

합계 약 2시간 30분.

## 8. 구현 기록 (2026-11-05)

| 변경 | 파일 |
|---|---|
| `calcStoredRegulatedFlags` 안쪽을 `storedRegulatedJudgments`(값 + 주소 판정)로 나누고 고지 leaf `regulatedAddressAssumptions` 추가 — 같은 `judgeRegulatedArea` 호출 | `lib/calc/effective-regulated-at-acquisition.ts` |
| 한 줄 컴포넌트 `RegulatedAreaAssumptionLine`(amber · 어느 날 · 어떻게 계산 · 근거 · 할 일) | `components/calc/results/transfer/RegulatedAreaAssumptionLine.tsx` |
| 배치 — 선례 「같은 날 양도 순서」 줄 바로 아래 4+1곳(다건은 건마다 label) | `TransferTaxResultView` · `BundledAllocationCard` · `MixedUseResultCard` · `MultiTransferTaxResultView` |

검증: UI·leaf 테스트 14건(N-1~N-10 · 배치는 선례 줄과의 역grep) · 뮤테이션 7/7 · E2E RAN-1(시·도 생략 · 보유 상황 미방문 → 고지 · ④ 값 true/true) · RAN-2(high → 없음) ·
#2909·#2919 anchor 19건 불변 · lint 신규 0(경고 2건은 기존) · 폰트·톤·다크 짝 게이트 통과.
