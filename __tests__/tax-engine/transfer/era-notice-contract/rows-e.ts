/**
 * I-26 표 — 묶음 E(수집기 `collectUndetermined`(`pending.ts`)가 연혁 수집기 밖에서 직접 내는 고지 · 2026-11-23 표 밖 고지 편입).
 *
 * id 끝의 `*`는 접두 묶음이다(`89-2-open:<조문>` · `regulated-district-undeclared:<칸>` — 조문·칸마다 id가 달라진다).
 */
import type { EraContractRow } from "./contract";
import { DESIGNATED_DISTRICT_UNDECLARED_ID_PREFIX } from "@/lib/tax-engine/one-house/designated-district-undeclared";

const D = (s: string) => new Date(s);

/** 1주택 · 2018-03-02 취득(취득 당시 조정) · 2026-06-15 양도 9억 · 거주 0 — 거주 2년 요건만 모자라 과세 */
const RESIDENCE = {
  acquisitionDate: D("2018-03-02"),
  transferDate: D("2026-06-15"),
  transferPrice: 900_000_000,
  wasRegulatedAtAcquisition: true,
  residencePeriodMonths: 0,
};

/** 1주택 + 상속받은 입주권 2개(§156의2⑥·⑦ 「1개」 전제 밖 → 판정 보류) · 비조정 취득 · 2023-10-15 양도 8억 */
const TWO_INHERITED_RIGHTS = {
  transferDate: D("2023-10-15"),
  transferPrice: 800_000_000,
  wasRegulatedAtAcquisition: false,
  residencePeriodMonths: 0,
  presaleRights: [
    { id: "a", type: "redevelopment_right" as const, acquisitionDate: D("2022-01-01"), region: "non_capital" as const, isInherited: true },
    { id: "b", type: "redevelopment_right" as const, acquisitionDate: D("2022-02-01"), region: "non_capital" as const, isInherited: true },
  ],
};

/** 고양시 일산서구 대화동 — 2019.11.8.~2020.6.18. 킨텍스1단계 도시개발지구만 조정대상지역. 2020-01-15 취득 · 2024-06-01 양도 9억 · 거주 0 */
const DISTRICT = {
  regionCode: "4128710400",
  acquisitionDate: D("2020-01-15"),
  transferDate: D("2024-06-01"),
  transferPrice: 900_000_000,
  residencePeriodMonths: 0,
};

export const ROWS_E: EraContractRow[] = [
  {
    id: "154-1-residence-deadline-unavailable",
    decides: { input: RESIDENCE },
    decidesWhy: "거주만 채우면 비과세(조정 취득 1주택 · 보유 8년)",
    silent: { input: { ...RESIDENCE, householdHousingCount: 3 } },
    silentWhy: "3주택(특례 없음) — 거주를 채워도 과세(S07-10)",
    calcParitySkip:
      "판정 메뉴 「언제까지」(기한) 축 전용 — 계산기는 기한을 내지 않아 이 문장을 경고에 싣지 않는다(`ERA_UNDETERMINED_IDS` 밖 · 거주 미달은 세액으로 드러난다)",
  },
  {
    id: "89-2-open:*",
    decides: { input: { ...TWO_INHERITED_RIGHTS, acquisitionDate: D("2015-05-10") }, presaleRightStartDate: D("2022-01-01") },
    decidesWhy: "본체 판정 비과세(보유 8년) — 조문이 성립하지 않으면 §89② 배제로 과세",
    silent: { input: { ...TWO_INHERITED_RIGHTS, acquisitionDate: D("2023-01-10") }, presaleRightStartDate: D("2022-01-01") },
    silentWhy: "보유 9개월 — 조문이 성립해도 보유 미달로 과세(2026-11-23 사용자 결정: 원조합원 갈래 게이트를 모든 항으로)",
    calcParitySkip:
      "계산기는 같은 사실을 조문을 묶은 한 문장(`article89Clause2Notices` 「아래 조문의 요건 충족 여부를 직접 확인하세요」)으로 낸다 — 게이트는 `settled`(+ 중과 배제 축)로 같고 #32-4 anchor가 본다",
  },
  {
    id: `${DESIGNATED_DISTRICT_UNDECLARED_ID_PREFIX}*`,
    decides: { input: DISTRICT },
    decidesWhy: "지구 안이면 취득 당시 조정(거주 2년 미달 → 과세) · 밖이면 비과세",
    silent: { input: { ...DISTRICT, householdHousingCount: 3 } },
    silentWhy: "3주택(특례 없음) — 지구 안·밖 어느 쪽이어도 과세(S02-7)",
  },
];
