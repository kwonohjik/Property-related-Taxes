# 주식 양도세 「기본 사항」 — 종목코드/종목명 위치 교체 + 종목명 키움 조회 불능 (Plan)

> 작성일 2026-08-28 · 워크트리 `PRT-stock-transfer-bugfix` · 브랜치 `stock-transfer-bugfix` (origin/master `6b5b802a` 기준)
> 상태: ✅ **전건 종결** (2026-08-28) — 코드 A~E 구현·검증 + **층 1(자격증명) 해소·실조회 성공**.
>
> - **Q-1 = 재발급 가능 · `KIWOOM_ENV=prod`(실투자)가 정본** — 현행 `.env.local` 값 `mock`은 **오설정**이므로 함께 정정한다
> - **Q-2 = FieldCard `trailing` 배지** (dropdown 자리 한 줄 아님 — E2E 레이아웃 회귀 최소)
> - **착수 범위 = A~E 전부**

## 1. 제보

주식 양도소득세 Step 1 「① 기본 사항」 화면(첨부 캡처)에 대해 두 건.

- **A.** 종목코드와 종목명의 **위치를 서로 바꾼다**.
- **B.** 종목명 입력 시 **키움 API 조회가 되지 않는다**(자동완성 dropdown 미표시).

## 2. 대상 코드 (실측 확인)

| 요소 | 위치 |
|---|---|
| 섹션 컨테이너 | `components/calc/stock-transfer/SecurityMetadataBlock.tsx:145-204` |
| 종목코드 FieldCard (현재 **좌**) | `SecurityMetadataBlock.tsx:147-196` |
| 종목명 FieldCard (현재 **우**) | `SecurityMetadataBlock.tsx:198-205` |
| 종목명 자동완성 컴포넌트 | `components/calc/stock-transfer/KiwoomStockNameAutocomplete.tsx` (173줄) |
| 검색 API | `app/api/kiwoom/search-by-name/route.ts` |
| 마스터 캐시·검색 | `lib/kiwoom/stock-master.ts:88-130` (`searchStockMaster`) |
| 토큰 발급 | `lib/kiwoom/auth.ts:76-120` (`getAccessToken`) |
| 유일한 소비처 | `app/calc/stock-transfer-tax/steps/Step1.tsx:120` (SecurityMetadataBlock 참조 1건) |

## 3. B의 근본 원인 — **3층으로 갈린다** (실측)

### 층 1. 키움 자격증명이 무효다 (환경 · 코드 결함 아님) 🔴 **주 원인**

`.env.local`의 `KIWOOM_APP_KEY`/`KIWOOM_APP_SECRET`(각 43자)으로 토큰 엔드포인트를 **직접 호출한 실측**:

| 엔드포인트 | HTTP | 응답 |
|---|---|---|
| `https://mockapi.kiwoom.com/oauth2/token` (`KIWOOM_ENV=mock` → 현행 경로) | **200** | `return_code=3` · `return_msg="인증에 실패했습니다[8001:App Key와 Secret Key 검증에 실패했습니다]"` |
| `https://api.kiwoom.com/oauth2/token` (prod — 키 환경 오설정 가설 검증용) | **200** | 동일 `return_code=3` · 동일 메시지 |

**mock·prod 양쪽 모두 8001로 거부**되므로 「`KIWOOM_ENV` 설정이 잘못됐다」는 아니다. `searchStockMaster()` 직접 호출 프로브도 같은 결론:

```
[삼성]     THROW: 키움 인증 응답 형식이 예상과 다릅니다. (return_code=3)
[삼성전자] THROW: 키움 인증 응답 형식이 예상과 다릅니다. (return_code=3)
[A 법인]   THROW: 키움 인증 실패 (HTTP 429)   ← 연속 실패로 rate limit까지 유발
[005930]   THROW: 키움 인증 실패 (HTTP 429)
master size = 0
```

⇒ **코드를 아무리 고쳐도 인증이 통과하지 않으면 조회가 되지 않는다.** → Q-1.

> 🔴 **원인 판정 정정 (2026-08-28, 사용자 제보 반영).** 처음에는 8001을 「자격증명 자체가 무효(만료·폐기·오타)」로 단정했으나, **키움 앱키에는 사용 IP 등록 제한이 있다**(개발자센터에서 IP 추가·변경). 그렇다면 8001은 두 가지를 **구별하지 못한다**:
>
> | 가설 | 설명 |
> |---|---|
> | H-1 앱키 무효 | 만료·폐기·오타 |
> | **H-2 IP 미등록** | 키는 멀쩡한데 **지금 나가는 IP**(`221.150.193.116`)가 등록 목록에 없다 |
>
> **mock·prod가 똑같이 거부된 것은 H-2로도 완전히 설명된다** — 둘 다 같은 IP에서 호출했기 때문이다. 즉 앞선 「자격증명 자체가 무효」는 **과단정**이었다. 두 가설은 **등록된 IP에서 한 번 호출**해 보면 즉시 갈린다(`npm run check:kiwoom`).

### 층 2. 실패가 화면에 전혀 드러나지 않는다 (코드 결함) 🔴

`KiwoomStockNameAutocomplete.tsx`가 **모든 실패 경로를 `setMatches([])` 하나로 삼킨다**:

- `:64-67` — `if (!res.ok) { setMatches([]); return; }` → 502(auth_failed)·503(missing_env)·429(rate_limited)가 전부 여기로 수렴
- `:71-73` — `catch { setMatches([]); }` → 네트워크·타임아웃도 동일

결과적으로 사용자에게 **「인증 실패」와 「검색 결과 없음」이 완전히 동일한 화면**(dropdown 미표시)으로 보인다. 제보가 "조회가 안 된다"에서 멈춘 이유가 이것이다 — UI가 원인을 말해주지 않는다.

같은 침묵이 **종목코드 blur 자동조회에도** 있다 — `SecurityMetadataBlock.tsx:172-174`(`if (!res.ok) return;`) · `:185-187`(`catch {}`). 즉 좌·우 두 필드가 **둘 다** 같은 이유로 조용히 죽는다.

서버 쪽도 원인 문자열이 얇다 — `auth.ts:118` 은 `return_code`만 담고 **`return_msg`(=「8001 App Key와 Secret Key 검증 실패」)를 버린다**. 로그로도 원인 판별이 어렵다.

### 층 3. 캡처의 사례는 **비상장**이라 애초에 마스터에 없다 (오해 소지) 🟡

첨부 화면은 성명 「49 비상장주식」·종목명 「A 법인」 — **비상장 사례**다. `searchStockMaster`는 KOSPI(`mrkt_tp=0`)+KOSDAQ(`10`)+KONEX(`50`) **상장 마스터만** 적재하므로(`stock-master.ts:58-70`), 인증이 정상이어도 「A 법인」은 **정상적으로 0건**이다.

그런데 hint 문구(`SecurityMetadataBlock.tsx:198`)는 조건 없이 이렇게 안내한다:

> 입력 시 키움 마스터(4,384종목) 자동완성 dropdown 표시. ↑↓ Enter로 선택

⇒ 비상장 사용자는 **정상 동작을 버그로 읽게 된다**. `marketType`이 이미 prop으로 들어와 있으나 `SecurityMetadataBlock.tsx:47`에서 `void marketType`으로 **버려지고** 있어, 상장/비상장에 따라 안내를 가를 수 있는데 하지 않고 있다.

> ⚠️ 층 3은 **제보 B의 원인이 아닐 수도 있다.** 사용자가 상장 종목명으로도 시도했는지 미확인 — 층 1이 확정된 이상 상장이었어도 실패한다. 층 3은 「인증 복구 후에도 남는 오해」로 별건 처리한다.

## 4. 부수 발견 (제보 밖 · 이번 범위 판단)

| # | 내용 | 위치 | 처리 |
|---|---|---|---|
| S-1 | 주식 autocomplete엔 **AbortController·fetch 타임아웃·중복질의 가드가 없다**. 상속세 sibling `InheritanceStockNameAutocomplete.tsx:74-111`엔 셋 다 있다(C14 주석). 선택 직후 `value` 변경이 다시 300ms fetch를 유발한다. | `KiwoomStockNameAutocomplete.tsx:48-80` | **포함** — 층 1 복구 시 불필요 호출이 429를 재유발할 수 있다(실측에서 429 관측됨) |
| S-2 | `.env.local:25` 가 `#` 없는 한글 주석 줄(` 키움증권 OpenAPI (주식 자동조회)`)이다. Next.js dotenv는 무시하나 셸 `source` 시 오류. | `.env.local:25` | **언급만** — 커밋 대상 아님(gitignore) |
| S-3 | `app/api/kiwoom/search/route.ts:97` 이 route 파일에서 `handleKiwoomError`를 추가 export(Next.js route 규약 밖). 현재 빌드는 통과 중. | 동 파일 | **손대지 않음** — 기존 dead 아님·요청 무관(Surgical) |

## 5. 방안

### A. 위치 교체 (표시 전용 · 세액 무영향)

`SecurityMetadataBlock.tsx:146-204`의 두 `<FieldCard>` **JSX 순서만 교체** → 종목명(좌·필수) → 종목코드(우·선택).

- `:145` 주석 `{/* 종목코드(좌) → 종목명(우) — … */}` 도 함께 갱신(주석↔구현 드리프트 금지).
- **회귀 위험 낮음**을 실측 확인: E2E 30여 spec이 전부 `getByPlaceholder("종목명을 입력하세요")` 기반이고(예: `stock-transfer-securities-tax.spec.ts:76`, `stock-penalty-filing-unit.spec.ts:33`), **DOM 순서에 의존하는 셀렉터는 0건**. `SecurityMetadataBlock` 참조도 `Step1.tsx:120` 단 1곳.
- **확인 필요(V-1)**: 전역 Enter 이동(`EnterKeyNavigationProvider.tsx:45`)은 DOM 순서로 다음 입력을 고르는데, 종목명 래퍼가 `data-enter-nav="off"`(`KiwoomStockNameAutocomplete.tsx:128`)다. 좌우가 바뀌면 **생년월일 → (건너뜀) → 종목코드** 순으로 이동하게 된다. 이 동작이 의도인지 anchor로 고정할지 판단.

### B. 층 1 — 자격증명 (사용자 조치 · Q-1)

코드로 해결 불가. 앱키 재발급 후 `.env.local` 갱신이 필요하다. → §7 Q-1.

**추가 정정**: 현행 `.env.local`은 `KIWOOM_ENV=mock`인데 정본은 **`prod`**다. 실측에서 prod 엔드포인트도 8001로 거부됐으므로 **환경 정정만으로는 해소되지 않는다**(키 자체가 무효) — 그러나 새 실투자 앱키를 넣어도 `mock`이면 `mockapi.kiwoom.com`을 계속 때리므로 **둘 다** 고쳐야 한다.

### C. 층 2 — 실패를 화면에 드러낸다 (본 PR의 코드 본체)

`KiwoomStockNameAutocomplete`에 **오류 상태**를 추가해 「결과 없음」과 「호출 실패」를 가른다.

- `!res.ok` 시 응답 body의 `{ error, message }`(`search/route.ts:76-93`이 이미 내려준다)를 읽어 상태에 담는다.
- **FieldCard `trailing` 배지**로 표시(Q-2 결정). 기존 `KiwoomFetchSourceBadge`(`SecurityMetadataBlock.tsx:151`)와 동일 슬롯. 예: `error === "auth_failed"` → 「키움 인증 실패 — 앱키를 확인하세요」, `missing_env` → 「키움 자격증명 미설정」, `rate_limited` → 「요청 한도 초과 — 잠시 후 재시도」.
- 종목코드 blur 조회(`SecurityMetadataBlock.tsx:172-187`)에도 **같은 leaf를 공유**한다(두 필드 동일 침묵이므로 한쪽만 고치면 반쪽).
- `auth.ts:116-120`의 에러 메시지에 **`return_msg`를 포함**시킨다(원인 문자열 보존).

> ⛔ **자동 fallback 채움은 넣지 않는다** — 저장소 정책(자동 안분/fallback 금지). 실패 시 사용자 수동 입력을 그대로 둔다. 이번 변경은 **표시만** 추가한다.

> 🔴 **E2E 회귀 위험 — 착수 전 반드시 잰다.** 현재 E2E는 `search-by-name`을 mock하지 않고(mock은 상속세 `inheritance-listed-stock-name-typeahead.spec.ts:32` 1건뿐) 종목명을 fill한다. 실패가 silent라 지금은 통과 중이다. **오류 배너를 켜면 30여 spec의 화면에 새 요소가 나타난다.** 배너가 입력 흐름을 막지 않는지(레이아웃·셀렉터 충돌) 전건 확인이 필요하다. (memory `feedback_blocking_validation_full_e2e_regression`)

### D. 층 3 — 비상장 안내 분기 (표시 전용)

`marketType`의 `void`를 풀어(`SecurityMetadataBlock.tsx:47`), 비상장일 때 hint를 「비상장 종목은 키움 마스터(상장 전종목)에 없어 자동완성이 표시되지 않습니다」로 가른다.

> ⚠️ **자동완성을 숨기지는 않는다.** 「UI 위젯을 숨긴다」가 유일 입력 경로를 없애 오히려 결함이 된 선례가 있다(memory `project_stock_kotc_listed_exemption_gap`). 안내로 가르고 위젯은 유지한다.

### E. S-1 — 중복 fetch 가드 (sibling 정본 재사용)

`InheritanceStockNameAutocomplete.tsx:60-111`의 `lastFetchedQRef` + `AbortController` + `FETCH_TIMEOUT_MS` 패턴을 그대로 옮긴다. **새 설계 금지 — sibling이 이미 정본**이다.

## 6. Pre-Do anchor (착수 전 · 계획 환류용)

| # | anchor | 기대(Pre-Do) |
|---|---|---|
| T-1 | `SecurityMetadataBlock` 렌더 후 DOM에서 종목명 input이 종목코드 input보다 **앞**에 온다 | **RED** (현재 코드 순서 반대) |
| T-2 | `search-by-name`이 502를 반환하도록 mock → 오류 **배지**가 화면에 나타난다 | **RED** (현재 silent) |
| T-3 | 종목코드 blur 조회 502 → 오류 **배지**가 나타난다 | **RED** |
| T-4 | `marketType="unlisted"` → 비상장 안내 hint 노출 | **RED** |
| T-5 | 매치 선택 후 `value` 변경이 추가 fetch를 **유발하지 않는다** | **RED** (가드 없음) |
| T-6 | 200 + `matches: []` → 오류 배지 **미표시**(결과 없음과 실패의 구별력) | GREEN이어야 함 — 과잉표시 방지 |

> 🔑 **T-6이 구별력의 핵심이다.** T-2만으로는 「무조건 배너를 띄우는」 구현도 통과한다. 두 anchor를 **같은 PR에** 둔다.
>
> 🔑 **뮤테이션으로 안전망을 먼저 잰다** — 착수 전 현행 코드에서 두 FieldCard 순서를 바꿔 보고 기존 테스트가 **몇 건 실패하는지** 실측한다. 0건이면 안전망이 없다는 뜻이므로 T-1을 반드시 심는다. (memory `feedback_pre_change_safety_net_probe`) 뮤테이션 되돌림은 `git checkout` 금지 — **cp 백업**으로 한다(memory `feedback_mutation_probe_git_checkout_destroys_wip`).

## 7. 사용자 결정 대기 (Q)

| # | 질문 | 왜 막히는가 |
|---|---|---|
| ~~Q-1~~ | ✅ **해소** — 재발급 가능. **`KIWOOM_ENV=prod`(실투자)가 정본** — 현행 `mock`은 오설정. | 새 앱키 도착 전까지 「오류 배지가 정확히 뜬다」까지 검증하고, 실조회 성공은 키 갱신 후 최종 확인한다. `.env.local`은 gitignore라 커밋 대상이 아니다 — 값 정정만 수행. |
| ~~Q-2~~ | ✅ **해소** — **FieldCard `trailing` 배지**. | 기존 `KiwoomFetchSourceBadge`와 같은 자리라 E2E 레이아웃 회귀가 거의 없다. |

## 8. 범위 밖 (명시)

- 세액·엔진 로직 **변경 0** — 본 건은 전부 **표시·입력 UX**다. 14 동기화 지점 중 신규 필드는 없다(기존 `securityName`·`securityCode`·`marketType`·`kiwoomTradingHalt`·`securityMetaFetchedAt` 그대로).
- 비상장 종목 검색 소스 추가(DART 등) — 요청 밖.
- S-3(route 추가 export) 정리 — 요청 밖·현행 동작 정상.

## 9. 실행 순서

```
0. 뮤테이션 프로브(안전망 실측) → T-1~T-6 작성 → RED 확인      verify: T-6만 GREEN
1. A 위치 교체 + 주석 갱신                                      verify: T-1 GREEN
2. C 오류 표시 leaf 신설 → 두 필드 공유 + auth.ts return_msg   verify: T-2·T-3 GREEN · T-6 유지
3. D 비상장 안내 분기                                           verify: T-4 GREEN
4. E sibling 가드 이식                                          verify: T-5 GREEN
5. E2E 전건 (E2E_PORT=3102) — 배너 도입 회귀 확인               verify: 신규 실패 0건
6. npm run check:pre-pr                                         verify: typecheck·lint·test 통과
```

---

## 10. 실행 결과 (2026-08-28)

### 안전망 실측 (착수 전)

순서 교체 뮤테이션에 대해 `__tests__/components/` **230파일 1852테스트가 전부 통과** — **안전망 0건**. T-1이 이 사각지대를 덮는다(원본 순서에서 RED, 교체 후 GREEN 실측).

### anchor 결과 — `__tests__/components/calc/stock-security-metadata-order-and-error.test.tsx` (8건)

| # | 내용 | Pre-Do | 최종 |
|---|---|---|---|
| T-1 | 종목명 input이 종목코드보다 DOM 앞 | RED | ✅ |
| T-2 | 502/503 → 배지(짧은 신호) + hint(상세) | RED | ✅ |
| T-3 | 종목코드 blur 502 → 배지 | RED | ✅ |
| T-4 | 비상장 안내 분기 (상장은 미노출) | RED | ✅ |
| T-5 | 선택 직후 재요청 없음 | — | ✅ |
| T-6 | 200+matches:[] → 배지 미표시 | GREEN | ✅ 유지 |

> ⭐ **T-5는 처음에 구별력 0이었다.** 가드를 제거해도 통과했는데, 원인은 단언이 아니라 **측정 대상**이었다 — 입력값과 선택 종목명이 둘 다 "삼성전자"라 `value`가 변하지 않아 effect가 재실행되지 않았다. 실제 흐름(부분 입력 "삼성" → 전체 "삼성전자" 선택)으로 고치자 뮤테이션이 `expected 2 to be 1`로 정확히 실패했다.
>
> ⭐ **하네스 함정** — `securityName`은 controlled다. `onChange`를 `vi.fn()`으로 두면 `value`가 그대로여서 자동완성 effect가 **아예 돌지 않는다**. stateful wrapper로 store 갱신을 재현해야 T-2가 도달한다.

### 변경 파일

| 파일 | 내용 |
|---|---|
| `components/calc/KiwoomFetchErrorBadge.tsx` | **신설** — 오류 코드→짧은 배지 문구 + `KIWOOM_ERROR_DETAILS`(hint용 상세). 두 필드 공용 단일 소스 |
| `components/calc/stock-transfer/SecurityMetadataBlock.tsx` | 순서 교체 · 배지 2개 배선 · blur 침묵 해제 · `marketType` void 해제 → 비상장 안내 분기 |
| `components/calc/stock-transfer/KiwoomStockNameAutocomplete.tsx` | `onFetchError` prop · AbortController · 5초 타임아웃 · `lastFetchedQRef` 가드 (sibling C14 정본 이식) |
| `lib/kiwoom/auth.ts` | `return_msg` 원문 보존 (원인이 여기에만 있다) |

### 배지 폭 문제 — 실측 후 설계 정정

첫 구현은 배지에 긴 문구("키움 인증 실패 — 앱키를 확인하세요")를 넣었는데, `FieldCard`의 `trailing`은 **입력과 같은 행을 나눠 쓴다**(`FieldCard.tsx:76-81` — 입력 `flex-1`, 배지 `shrink-0`). 브라우저 실측에서 종목명 입력창이 **221px → 극단적으로 축소**됐다.

⇒ **배지는 짧은 신호("인증 실패")만, 조치 안내는 폭 여유가 있는 hint 줄로** 분리. 재실측 **221 → 154px**(오류 시에만)로 회복. T-2에 `textContent.length <= 12` 단언을 넣어 재발을 막는다.

### 회귀 검증

| 항목 | 결과 |
|---|---|
| `npx tsc --noEmit` | 0건 |
| `npm run lint` | **0 errors** (309 warnings는 전부 기존) |
| `npm run check:pre-pr` (vitest 전건) | **1624파일 17558 passed** |
| E2E 주식·상장주식·상속 typeahead | **59 passed** |
| 실제 화면(무효 키 상태) | 배지 「⚠ 인증 실패」 + hint 상세 노출 확인 (스크린샷) |

### 잔여 — 사용자 조치

**층 1(자격증명)은 코드로 해소되지 않는다.** 실투자 앱키 재발급 후 `.env.local`의 `KIWOOM_APP_KEY`·`KIWOOM_APP_SECRET`을 갱신해야 실조회가 된다. `KIWOOM_ENV`는 **`prod`로 정정 완료**(종전 `mock`).

갱신 후 확인:

```bash
curl -s -X POST https://api.kiwoom.com/oauth2/token \
  -H 'Content-Type: application/json;charset=UTF-8' \
  -d '{"grant_type":"client_credentials","appkey":"<KEY>","secretkey":"<SECRET>"}'
# return_code 가 사라지고 token 이 오면 정상
```

> S-2(`.env.local:25` 주석 `#` 누락)는 손대지 않았다 — Next.js dotenv는 무시하므로 앱 동작에 영향이 없고, 셸 `source` 시에만 걸린다.

---

## 11. 층 1 해소 — 실조회 성공 (2026-08-28)

사용자가 키움 개발자센터에서 **키 재발급 + 현재 IP 등록**을 수행한 뒤 토큰이 발급됐고, 종목명 자동완성이 실제로 동작한다.

```
출구 공인 IP : 221.150.193.116
KIWOOM_ENV   : prod  →  https://api.kiwoom.com
✓ 토큰 발급 성공 (86자)
```

```
POST /api/kiwoom/search-by-name {"query":"삼성전"}
→ 005930 삼성전자 · 005935 삼성전자우 · 009150 삼성전기 (거래소)
```

브라우저 확인: dropdown 정상 표시 · **오류 배지 미표시**(성공 경로에서 배지가 뜨지 않는 구별력) · 선택 시 종목코드 `005930` 자동 mirror.

### ⚠️ H-1 / H-2는 결국 갈리지 않았다

원인 가설 둘(H-1 키 무효 / H-2 IP 미등록)을 가르려 했으나, **키 지문과 등록 IP가 동시에 바뀌었다**(앱키 `8rak…5RLs` → `MTQc…Jxt8`). 따라서 종전 실패가 둘 중 무엇이었는지는 **확정되지 않았다** — 「IP 등록만으로 풀렸다」고 기록해서는 안 된다.

실무상 영향은 없다(둘 다 해소됨). 다만 다음에 같은 8001을 만나면 **한 번에 하나씩** 바꿔야 갈린다.

### 🔴 워크트리 `.env.local`은 메인과 별개 파일이다

새 키는 **메인 저장소에만** 반영돼(14:22) 워크트리는 옛 키(13:19)를 계속 읽었고, `npm run check:kiwoom`이 워크트리에서 계속 실패했다. `.env.local`은 gitignore라 워크트리 생성 시 복사된 **스냅샷**이며 이후 동기화되지 않는다.

⇒ 워크트리에서 자격증명이 걸리면 **파일 수정 시각을 먼저 비교**할 것:

```bash
stat -f "%Sm %N" -t "%Y-%m-%d %H:%M:%S" .env.local ../Property-related-Taxes/.env.local
```

> `scripts/check-kiwoom-auth.mjs`는 `import.meta.url` 기준으로 `.env.local`을 읽는다 — **스크립트가 있는 트리의 파일**을 본다. cwd를 바꿔도 대상이 바뀌지 않으므로, 다른 트리의 키로 시험하려면 환경변수로 덮어써야 한다.

### E2E 회귀 (실키 활성 상태)

주식·상장주식·상속 typeahead **58 passed + 1 flaky**. flaky는 `stock-transfer-stale-result.spec.ts` 1건으로, 단독 `--repeat-each=3` 전부 통과(각 1.8초)했다 — 병렬 부하성이며 이번 변경과 무관하다. 다만 실키 활성화로 자동완성이 **실제 키움 호출**을 하게 되어 병렬 시 부하가 늘어난 점은 남는다.

### 잔여 — Tailscale exit node (별건 진행 중)

지금은 현재 IP(`221.150.193.116`)가 등록된 상태라 **이 장소에서만** 동작한다. 이동하면 다시 8001이 난다. 출구 IP를 집 회선으로 고정하는 작업은 별도로 진행한다 — 설치·승인은 사용자 조치이고, 검증은 `npm run check:kiwoom`이 담당한다(exit node on/off로 두 번 돌려 IP 변화 확인).
