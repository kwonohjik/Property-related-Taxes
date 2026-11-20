/**
 * NBL2611-V7-F (R09) — 체육시설(영 §168의11①1호) 입력칸 **소비 술어** 단일 소스.
 *
 * 엔진(`resolveAreaLimit`)이 실내 바닥면적·실내체육시설 미설치·테니스 선수 수를 «언제» 읽는지를 한 곳에 둔다.
 * ⑤ 렌더 게이트(`OtherLandDetailSection`)가 같은 술어를 import한다 — 종전 화면은 주종목만 보고 칸을 그려,
 * 추가 종목으로 실내·테니스를 고르면 엔진이 읽는 칸이 화면에 없었다. 엔진 소비 규칙이 바뀌면 이 파일만 고친다.
 *
 * 순수 함수 — DB를 부르지 않는다.
 */
import { SPORTS_INDOOR_STD } from "./data/area-standards";

/** 별표3·4·5 실내체육시설 종목 코드. */
export const SPORTS_INDOOR_EVENT_CODES = Object.keys(SPORTS_INDOOR_STD) as ReadonlyArray<keyof typeof SPORTS_INDOOR_STD>;

/** 별표3 비고5·별표4 비고4 선수가산(테니스·연식정구) 종목 코드. */
const SPORTS_PLAYER_COUNT_EVENTS: ReadonlySet<string> = new Set(["tennis", "soft_tennis"]);

export interface SportsConsumptionInput {
  /** 체육시설 유형 — 미설정은 직장(별표3). */
  category?: string;
  /** 주종목. 비어 있으면 엔진이 종목을 쓰지 않고 직접입력으로 떨어진다(E4-01). */
  mainEvent?: string;
  /** 추가 보유 종목. */
  extraEvents?: readonly string[];
  /** 실내체육시설 미설치(별표3 비고4) 현재 값 — 켜져 있으면 실내 바닥면적은 쓰이지 않는다(800㎡ 고정). */
  indoorNotInstalled?: boolean;
  /** 별표5 종업원수·보유 시설. */
  employeeCount?: number;
  employeeFacilityKinds?: readonly string[];
}

export interface SportsInputConsumption {
  /** 실내 바닥면적(별표3·4·5 비고 — min(바닥, 표값) × §101② 배율)을 읽는가. */
  indoorFloorArea: boolean;
  /** 실내체육시설 미설치 토글(별표3 비고4, 직장 전용)을 읽는가. */
  indoorNotInstalled: boolean;
  /** 테니스·연식정구 선수 수(별표3 비고5·별표4 비고4)를 읽는가. */
  playerCount: boolean;
}

/** 주종목 + 추가 종목 — 엔진이 종목합산에 쓰는 보유 종목 전체. 주종목이 없으면 종목을 쓰지 않는다. */
export function heldSportsEvents(mainEvent: string | undefined, extraEvents: readonly string[] | undefined): string[] {
  if (!mainEvent) return [];
  return [mainEvent, ...(extraEvents ?? [])].filter(Boolean);
}

export function consumedSportsInputs(i: SportsConsumptionInput): SportsInputConsumption {
  const category = i.category || "workplace";
  if (category === "employee") {
    // 별표5: 50인 이하는 코트면적만 인정(비고2) — 실내체육시설은 쓰이지 않는다.
    const n = i.employeeCount ?? 0;
    const indoor = n > 50 && (i.employeeFacilityKinds ?? []).includes("indoor");
    return { indoorFloorArea: indoor, indoorNotInstalled: false, playerCount: false };
  }
  const events = heldSportsEvents(i.mainEvent, i.extraEvents);
  const hasIndoor = events.some((e) => (SPORTS_INDOOR_EVENT_CODES as readonly string[]).includes(e));
  const notInstalledApplies = category === "workplace" && hasIndoor;
  return {
    indoorFloorArea: hasIndoor && !(notInstalledApplies && i.indoorNotInstalled === true),
    indoorNotInstalled: notInstalledApplies,
    playerCount: events.some((e) => SPORTS_PLAYER_COUNT_EVENTS.has(e)),
  };
}
