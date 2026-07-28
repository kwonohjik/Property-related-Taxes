/**
 * 상업용건물·오피스텔 호별 기준시가 조회 라우트 — PNU 직행 조인 + 시점별 독립 판정.
 *
 * 로컬 파티션(`data/stdprice`)만 읽는다. 외부 호출·인증 없음.
 * 설계: docs/02-design/features/commercial-officetel-standard-price-lookup.engine.design.md §3-2
 */
export const runtime = "nodejs"; // fs·zlib — 형제 라우트 building-standard-price-etax/route.ts:9 선례

import { NextRequest, NextResponse } from "next/server";
import { loadManifest, loadPartition } from "@/lib/stdprice/load-partition";
import {
  BUILDING_KIND_LABEL,
  FLOOR_CLASS_LABEL,
  stdPriceUnitKey,
  type StdPriceUnit,
} from "@/lib/stdprice/types";

/** 고시일자 단위 판정 사유. 넷은 의미가 전부 달라 병합 안내를 금지한다(불변식 4). */
export type CommercialStdPriceDateStatus =
  | "ok"
  | "unit_not_found"
  | "partial_data"
  | "partition_missing"
  | "no_notice";

export interface CommercialStdPriceUnitEntry {
  /** `${건물명}|${동}|${층구분}|${층}|${호}` — 키가 모호하면 `#2` 등 일련번호가 붙는다 */
  key: string;
  buildingName: string;
  dong: string;
  floorClass: "지하" | "지상" | "옥탑";
  floor: string;
  ho: string;
  kind: "상가" | "오피스텔" | "복합건물";
  /** 고시일자별 가격·면적. `null` = 그 시점에 이 물건이 없음 */
  prices: Record<string, { price: number; ea: number; sa: number } | null>;
  /** 한 고시일자 안에 같은 키가 둘 이상 — 시점 간 자동 매칭에서 제외됨 */
  ambiguous?: boolean;
  /**
   * 시점 간 연결 근거가 **건물명이 아니라 위치**일 때만 존재한다.
   * 건물명이 시점마다 다르므로 UI는 사용자가 확인할 수 있도록 반드시 노출해야 한다.
   */
  linkedBy?: "position";
  /** `linkedBy:"position"`일 때 시점별 건물명 표기 (확인용) */
  buildingNameByDate?: Record<string, string>;
}

export interface CommercialStdPriceResponse {
  /** "조회를 수행했는가" — 결과 존재 여부가 아니다(불변식 5) */
  success: boolean;
  parcelReason?: "invalid_pnu" | "unjoinable_parcel" | "data_unavailable";
  dateStatus: Record<string, CommercialStdPriceDateStatus>;
  units: CommercialStdPriceUnitEntry[];
  /** 이 필지의 시군구가 실제로 고시된 고시일자 목록 */
  availableDates: string[];
  error?: string;
}

const MAX_DATES = 3;

export async function GET(
  request: NextRequest,
): Promise<NextResponse<CommercialStdPriceResponse>> {
  const { searchParams } = new URL(request.url);
  const pnu = searchParams.get("pnu")?.trim() ?? "";
  const dates = uniqueDates(searchParams.get("dates") ?? "");

  const empty = { dateStatus: {}, units: [], availableDates: [] };

  if (!/^\d{19}$/.test(pnu)) {
    // 전 경로 HTTP 200 — 형식 오류도 차단이 아니라 안내다(불변식 5)
    return NextResponse.json({
      success: false,
      parcelReason: "invalid_pnu" as const,
      error: "pnu는 19자리 숫자이어야 합니다.",
      ...empty,
    });
  }
  if (dates.length === 0) {
    return NextResponse.json({
      success: false,
      error: "dates는 YYYY-MM-DD 형식 1~3개이어야 합니다.",
      ...empty,
    });
  }

  const bjdCode = pnu.slice(0, 10);
  const sigungu = bjdCode.slice(0, 5);
  const specialLot = pnuSpecialLotCode(pnu);
  const bonbun = Number.parseInt(pnu.slice(11, 15), 10);
  const bubun = Number.parseInt(pnu.slice(15, 19), 10);

  let manifest;
  try {
    manifest = await loadManifest();
  } catch (err) {
    console.error("[commercial-stdprice]", err);
    manifest = null;
  }
  if (!manifest) {
    // 변환 산출물 미생성 — 수기 입력 경로를 막지 않도록 200으로 안내한다
    return NextResponse.json({
      success: false,
      parcelReason: "data_unavailable" as const,
      error: "기준시가 데이터가 준비되지 않았습니다. npm run build:stdprice 실행이 필요합니다.",
      ...empty,
    });
  }

  const noticeByDate = new Map(manifest.notices.map((n) => [n.date, n]));
  const availableDates = manifest.notices
    .filter((n) => n.coverage === "full" && n.sigungus.includes(sigungu))
    .map((n) => n.date)
    .sort();

  // 특수지 2~9·A는 PNU와 대응하지 않는다 — 조인 자체가 불가(불변식 3)
  if (specialLot === null) {
    return NextResponse.json({
      success: true,
      parcelReason: "unjoinable_parcel" as const,
      dateStatus: Object.fromEntries(
        dates.map((d) => [
          d,
          noticeByDate.get(d)?.sigungus.includes(sigungu) ? "unit_not_found" : "no_notice",
        ]),
      ),
      units: [],
      availableDates,
    });
  }

  const dateStatus: Record<string, CommercialStdPriceDateStatus> = {};
  const matchedByDate = new Map<string, StdPriceUnit[]>();

  for (const date of dates) {
    const notice = noticeByDate.get(date);
    if (!notice || !notice.sigungus.includes(sigungu)) {
      dateStatus[date] = "no_notice";
      continue;
    }

    let partition: StdPriceUnit[] | null;
    try {
      partition = await loadPartition(sigungu, date);
    } catch (err) {
      console.error("[commercial-stdprice]", err);
      partition = null;
    }
    if (partition === null) {
      dateStatus[date] = "partition_missing";
      continue;
    }

    // strict-match-or-null — 4요소 전부 일치하는 행만. 부분 일치·임의 fallback 금지(불변식 1)
    const matched = partition.filter(
      (u) => u.b === bjdCode && u.s === specialLot && u.bn === bonbun && u.jn === bubun,
    );
    matchedByDate.set(date, matched);
    if (matched.length === 0) dateStatus[date] = "unit_not_found";
    else dateStatus[date] = notice.coverage === "partial" ? "partial_data" : "ok";
  }

  return NextResponse.json({
    success: true,
    dateStatus,
    units: mergeUnitsAcrossDates(dates, matchedByDate),
    availableDates,
  });
}

/** 위치 키 — 물건 키에서 **건물명만** 뺀 것. 같은 필지 안의 동·층구분·층·호. */
function positionKey(u: StdPriceUnit): string {
  return `${u.dg}|${u.fc}|${u.fl}|${u.ho}`;
}

/**
 * 시점별 매칭 결과를 물건으로 병합.
 *
 * **연결 규칙 (2단)**
 * 1. 위치 키가 **모든 시점에서 유일**하면 그 위치로 연결한다. 유일성을 *검증*하므로
 *    다른 물건이 섞일 수 없다 — 스마트빌A동/B동처럼 위치가 겹치는 필지는 이 조건에서 탈락한다.
 *    건물명이 시점마다 다르면 `linkedBy:"position"` + 시점별 건물명을 함께 반환한다(사용자 확인용).
 * 2. 그 외에는 건물명을 포함한 물건 키로 연결한다.
 *
 * 위치 연결이 필요한 이유(실측 — 종로·강남·강서 910필지 106,764물건, 2021↔2026):
 * 건물명 포함 키로 연결 79.1% / **건물명만 다르고 위치가 양쪽 유일 18.5%** / 연결 불가 2.4%.
 * 원본이 최근 연도로 갈수록 건물명 자리에 지번 표기를 넣는다(적선현대빌딩 → `(80)`).
 *
 * ⚠️ 한 시점 안에서 물건 키까지 중복되면(원본 키 충돌 — 전 연도 1,061개 실측) **모호**로 보고
 *    시점 간 연결을 하지 않는다. 면적이 다른 별개 물건일 수 있어 임의로 하나를 고르면
 *    호별총액이 틀린다(`feedback_no_silent_apportion_fallback`).
 */
function mergeUnitsAcrossDates(
  dates: readonly string[],
  matchedByDate: ReadonlyMap<string, StdPriceUnit[]>,
): CommercialStdPriceUnitEntry[] {
  const ambiguousFullKeys = new Set<string>();
  const positionCollides = new Set<string>();
  for (const units of matchedByDate.values()) {
    const fullSeen = new Set<string>();
    const posSeen = new Set<string>();
    for (const u of units) {
      const fk = stdPriceUnitKey(u);
      if (fullSeen.has(fk)) ambiguousFullKeys.add(fk);
      fullSeen.add(fk);
      const pk = positionKey(u);
      if (posSeen.has(pk)) positionCollides.add(pk);
      posSeen.add(pk);
    }
  }

  const merged = new Map<string, CommercialStdPriceUnitEntry>();
  const namesByGroup = new Map<string, Record<string, string>>();
  const ambiguous: CommercialStdPriceUnitEntry[] = [];
  const emptyPrices = () => Object.fromEntries(dates.map((d) => [d, null]));

  for (const date of dates) {
    let seq = 0;
    for (const u of matchedByDate.get(date) ?? []) {
      const fullKey = stdPriceUnitKey(u);
      const price = { price: u.p, ea: u.ea, sa: u.sa };

      if (ambiguousFullKeys.has(fullKey)) {
        seq++;
        ambiguous.push({
          ...describe(u, `${fullKey}#${seq}@${date}`),
          prices: { ...emptyPrices(), [date]: price },
          ambiguous: true,
        });
        continue;
      }

      const pk = positionKey(u);
      const groupKey = positionCollides.has(pk) ? fullKey : pk;
      const existing = merged.get(groupKey);
      if (existing) {
        existing.prices[date] = price;
      } else {
        merged.set(groupKey, {
          ...describe(u, groupKey),
          prices: { ...emptyPrices(), [date]: price },
        });
      }
      const names = namesByGroup.get(groupKey) ?? {};
      names[date] = u.nm;
      namesByGroup.set(groupKey, names);
    }
  }

  for (const [groupKey, entry] of merged) {
    const names = namesByGroup.get(groupKey) ?? {};
    const distinct = [...new Set(Object.values(names))];
    if (distinct.length > 1) {
      entry.linkedBy = "position";
      entry.buildingNameByDate = names;
      // 표시용 대표 이름은 **실제 이름이 있는 표기**를 우선한다 — 원본이 최근 연도에서
      // 건물명 자리에 지번 표기(`(80)`)를 넣는 일이 잦아, 최신값을 그대로 쓰면 목록이 읽히지 않는다.
      // 매칭에는 관여하지 않는 순수 표시 선택이며, 시점별 원문은 buildingNameByDate로 전부 노출한다.
      entry.buildingName = distinct.find((n) => /[가-힣A-Za-z]/.test(n)) ?? distinct[0];
    }
  }

  return [...merged.values(), ...ambiguous].sort(compareUnits);
}

function describe(u: StdPriceUnit, key: string): Omit<CommercialStdPriceUnitEntry, "prices"> {
  return {
    key,
    buildingName: u.nm,
    dong: u.dg,
    floorClass: FLOOR_CLASS_LABEL[u.fc],
    floor: u.fl,
    ho: u.ho,
    kind: BUILDING_KIND_LABEL[u.k],
  };
}

/**
 * 목록 정렬: 층구분(지하→지상→옥탑) → 층 → 호.
 * `floor`·`ho`가 문자열이라 사전순으로 두면 `"10" < "2"` 함정에 걸린다.
 */
function compareUnits(a: CommercialStdPriceUnitEntry, b: CommercialStdPriceUnitEntry): number {
  const order = { 지하: 0, 지상: 1, 옥탑: 2 } as const;
  if (a.floorClass !== b.floorClass) return order[a.floorClass] - order[b.floorClass];
  const fl = compareNumericish(a.floor, b.floor);
  if (fl !== 0) return fl;
  const ho = compareNumericish(a.ho, b.ho);
  if (ho !== 0) return ho;
  if (a.buildingName !== b.buildingName) return a.buildingName.localeCompare(b.buildingName);
  return a.key.localeCompare(b.key);
}

/** 숫자로 읽히면 숫자 비교, 아니면 사전순(비숫자를 뒤로). */
function compareNumericish(a: string, b: string): number {
  const na = Number.parseInt(a, 10);
  const nb = Number.parseInt(b, 10);
  const aNum = Number.isFinite(na) && /^\d/.test(a);
  const bNum = Number.isFinite(nb) && /^\d/.test(b);
  if (aNum && bNum) return na === nb ? a.localeCompare(b) : na - nb;
  if (aNum) return -1;
  if (bNum) return 1;
  return a.localeCompare(b);
}

/**
 * PNU 필지구분 → CSV 특수지코드. 대응하지 않으면 null(조인 불가).
 *
 * ⚠️ `decomposePnuForBuildingRegister`의 `platGbCd`를 쓰지 않는다 — 그 값은 건축HUB 규약 전용이며
 *    CSV 특수지코드와 **우연히 값이 겹쳐** 더 위험하다(memory `feedback_gov_site_lookup_weak_tls_pnu_params`).
 */
function pnuSpecialLotCode(pnu: string): string | null {
  const gb = pnu[10];
  if (gb === "1") return "0"; // 일반 ↔ 일반지번
  if (gb === "2") return "1"; // 산   ↔ 산
  return null;
}

function uniqueDates(raw: string): string[] {
  const out: string[] = [];
  for (const d of raw.split(",").map((s) => s.trim())) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || out.includes(d)) continue;
    out.push(d);
    if (out.length === MAX_DATES) break;
  }
  return out;
}
