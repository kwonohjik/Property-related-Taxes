/**
 * 행정안전부 표준 시·군·구 **인접 매트릭스** 생성 — `lib/geo/administrative-district-adjacency.json`.
 *
 * 계획서: docs/00-pm/inheritance-farming-residence-data-infra.plan.md §4 (Phase 1-C PR-2)
 *
 * 데이터 소스: **Vworld `LT_C_ADSIGG_INFO`** (시·군·구 경계 폴리곤).
 *   계획서는 공공데이터포털 `LSMD_ADM_SECT_RGN` Shapefile(~50MB) 수동 다운로드를 상정했으나,
 *   Vworld data API가 **전국 256건을 한 번에** 반환한다(2026-07-31 실측) — 수동 단계가 사라진다.
 *   프로젝트가 이미 `VWORLD_API_KEY`를 쓰고 있어 새 인증이 필요 없다.
 *
 * ⚠️ Vworld 실측 함정(2026-06-25 기록과 동일): `req/data`에 `domain` 파라미터를 붙이면
 *    INCORRECT_KEY가 난다 → `domain` 미부착, **Referer 헤더만** 유지.
 *
 * 코드 체계: Vworld `sig_cd`는 **5자리**다. 프로젝트 규약은 행안부 표준 **10자리**
 *   (`lib/geo/pnu-sigungu.ts` — PNU 앞 5자리 + "00000") → `sig_cd + "00000"`으로 정규화한다.
 *
 * 실행:
 *   npx tsx --env-file=.env.local scripts/build-sigungu-adjacency.ts
 *   npx tsx --env-file=.env.local scripts/build-sigungu-adjacency.ts --cache  (원본 응답 재사용)
 */
import * as fs from "node:fs";
import * as path from "node:path";
import booleanIntersects from "@turf/boolean-intersects";
import bbox from "@turf/bbox";
import type { Feature, Geometry, Polygon, MultiPolygon } from "geojson";

const VWORLD_DATA_URL = "https://api.vworld.kr/req/data";
/** 전국 BBOX (경도 124.5~132.0 · 위도 33.0~38.7) — 부속도서 포함 */
const NATION_BBOX = "BOX(124.5,33.0,132.0,38.7)";
const OUT_PATH = path.join(process.cwd(), "lib/geo/administrative-district-adjacency.json");
const CACHE_PATH = path.join(process.cwd(), ".legal-cache/adsigg-raw.json");

interface SigunguFeature {
  properties: { sig_cd: string; sig_kor_nm: string; full_nm: string };
  geometry: Polygon | MultiPolygon;
}

async function fetchSigunguFeatures(useCache: boolean): Promise<SigunguFeature[]> {
  if (useCache && fs.existsSync(CACHE_PATH)) {
    console.log(`캐시 사용: ${CACHE_PATH}`);
    return JSON.parse(fs.readFileSync(CACHE_PATH, "utf-8")) as SigunguFeature[];
  }

  const key = process.env.VWORLD_API_KEY;
  if (!key) throw new Error("VWORLD_API_KEY 미설정 — --env-file=.env.local 로 실행하세요.");

  const params = new URLSearchParams({
    service: "data",
    request: "GetFeature",
    data: "LT_C_ADSIGG_INFO",
    key,
    format: "json",
    size: "1000",
    page: "1",
    geomFilter: NATION_BBOX,
  });
  // ⚠️ domain 파라미터 부착 금지(INCORRECT_KEY) — Referer 헤더만.
  const res = await fetch(`${VWORLD_DATA_URL}?${params}`, {
    headers: { Referer: "http://localhost:3000" },
  });
  const json = (await res.json()) as {
    response: {
      status: string;
      error?: { text?: string };
      record?: { total: string };
      result?: { featureCollection?: { features?: SigunguFeature[] } };
    };
  };
  if (json.response.status !== "OK") {
    throw new Error(`Vworld 응답 실패: ${json.response.error?.text ?? json.response.status}`);
  }
  const features = json.response.result?.featureCollection?.features ?? [];
  const total = Number(json.response.record?.total ?? 0);
  if (features.length !== total) {
    // 전국이 한 페이지에 안 들어오면 조용히 일부만 계산하게 된다 — 명시적으로 막는다.
    throw new Error(`페이징 필요: total=${total} 인데 ${features.length}건만 수신했다.`);
  }

  fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
  fs.writeFileSync(CACHE_PATH, JSON.stringify(features));
  console.log(`Vworld 수신 ${features.length}건 → 캐시 저장 ${CACHE_PATH}`);
  return features;
}

/** 두 bbox가 겹치는지 — 65,536쌍 전수 폴리곤 연산을 피하는 사전 필터 */
function bboxOverlaps(a: number[], b: number[], pad: number): boolean {
  return !(a[2] + pad < b[0] || b[2] + pad < a[0] || a[3] + pad < b[1] || b[3] + pad < a[1]);
}

async function main() {
  const useCache = process.argv.includes("--cache");
  const features = await fetchSigunguFeatures(useCache);

  const items = features.map((f) => {
    const geom = f.geometry as Geometry;
    return {
      // 행안부 표준 10자리로 정규화 (lib/geo/pnu-sigungu.ts 규약과 동일)
      code: `${f.properties.sig_cd}00000`,
      name: f.properties.full_nm,
      feature: { type: "Feature", properties: {}, geometry: geom } as Feature,
      bbox: bbox(geom) as number[],
    };
  });
  console.log(`시·군·구 ${items.length}건 로드 완료 — 인접 계산 시작`);

  // 경계 좌표가 완전히 동일하지 않은 경우(정밀도 차이)를 흡수하는 bbox 여유값.
  // 폴리곤 교차 판정 자체는 보정하지 않는다 — 여기는 **후보 축소** 전용이다.
  const BBOX_PAD_DEG = 0.001; // 약 100m

  const adjacency: Record<string, string[]> = {};
  let pairChecks = 0;
  for (let i = 0; i < items.length; i++) {
    const a = items[i];
    adjacency[a.code] ??= [];
    for (let j = i + 1; j < items.length; j++) {
      const b = items[j];
      if (a.code === b.code) continue;
      if (!bboxOverlaps(a.bbox, b.bbox, BBOX_PAD_DEG)) continue;
      pairChecks++;
      if (booleanIntersects(a.feature, b.feature)) {
        adjacency[a.code].push(b.code);
        (adjacency[b.code] ??= []).push(a.code);
      }
    }
    if ((i + 1) % 50 === 0) console.log(`  ${i + 1}/${items.length} …`);
  }

  for (const code of Object.keys(adjacency)) {
    adjacency[code] = [...new Set(adjacency[code])].sort();
  }

  const isolated = Object.entries(adjacency).filter(([, v]) => v.length === 0);
  const totalEdges = Object.values(adjacency).reduce((s, v) => s + v.length, 0) / 2;

  fs.writeFileSync(OUT_PATH, `${JSON.stringify(adjacency, null, 2)}\n`);

  console.log(`\n폴리곤 교차 검사 ${pairChecks}쌍 (전수 ${(items.length * (items.length - 1)) / 2}쌍 대비 축소)`);
  console.log(`인접 관계 ${totalEdges}건 · 고립(인접 0) ${isolated.length}건`);
  if (isolated.length > 0) {
    // 섬(울릉군·제주 등)은 정상적으로 고립이다 — 육지 시·군·구가 섞여 있으면 데이터 문제 신호.
    console.log(`  고립 목록: ${isolated.map(([c]) => `${c}(${items.find((i) => i.code === c)?.name})`).join(", ")}`);
  }
  console.log(`→ ${OUT_PATH}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
