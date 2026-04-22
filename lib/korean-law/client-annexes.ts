/**
 * 별표·서식 목록 조회 (getAnnexes)
 */

import { fetchJson, readCache, writeCache, toArray } from "./client-core";
import { searchLaw } from "./client-law";
import type { AnnexItem } from "./types";

type AnnexRawUnit = {
  별표번호?: string;
  별표제목?: string;
  별표서식파일링크?: string;
};

interface LawServiceRawResponse {
  법령?: {
    별표?: {
      별표단위?: AnnexRawUnit | AnnexRawUnit[];
    };
  };
}

export async function getAnnexes(lawName: string): Promise<AnnexItem[]> {
  const meta = await searchLaw(lawName);
  if (!meta) return [];

  const cacheKey = `annex_${meta.mst}`;
  const cached = await readCache<AnnexItem[]>(cacheKey);
  if (cached) return cached;

  const data = await fetchJson<LawServiceRawResponse>("lawService.do", {
    target: "law",
    MST: meta.mst,
  });
  const units = toArray(data.법령?.별표?.별표단위);
  const results: AnnexItem[] = units.map((u) => ({
    annexNo: u.별표번호 ?? "",
    title: u.별표제목?.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim() ?? "",
    fileType: inferFileType(u.별표서식파일링크),
    downloadUrl: u.별표서식파일링크
      ? `https://www.law.go.kr${u.별표서식파일링크.startsWith("/") ? "" : "/"}${u.별표서식파일링크}`
      : undefined,
    mst: meta.mst,
  }));
  await writeCache(cacheKey, results);
  return results;
}

function inferFileType(link?: string): string | undefined {
  if (!link) return undefined;
  const m = link.match(/\.(hwpx?|pdf|xlsx?|docx?)(?:$|\?)/i);
  return m ? m[1].toUpperCase() : undefined;
}
