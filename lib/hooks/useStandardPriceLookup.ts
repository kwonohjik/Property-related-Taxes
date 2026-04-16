"use client";

/**
 * useStandardPriceLookup — Vworld NED API 공시가격 자동 조회 공통 훅
 *
 * 사용 위치: 취득세·재산세·종부세·상속세·증여세 폼의 공시가격 필드
 * API: /api/address/standard-price?jibun=&propertyType=&year=&dong=&ho=
 */

import { useState } from "react";

export interface LookupMsg {
  text: string;
  kind: "ok" | "err";
}

interface LookupOptions {
  /** 지번 주소 (필수 — 없으면 에러 메시지 반환) */
  jibun: string;
  /** "housing" | "land" | "land_farmland" — 주택·토지 구분 */
  propertyType: string;
  /** 조회 연도 (기본값: 현재 연도) */
  year?: string;
  /** 공동주택 동 이름 (선택) */
  dong?: string;
  /** 공동주택 호수 (선택) */
  ho?: string;
}

export function useStandardPriceLookup() {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<LookupMsg | null>(null);

  async function lookup(opts: LookupOptions): Promise<number | null> {
    if (!opts.jibun) {
      setMsg({ text: "먼저 소재지를 검색·선택하세요. (지번 주소 필요)", kind: "err" });
      return null;
    }

    setLoading(true);
    setMsg(null);

    try {
      const apiType = opts.propertyType === "land_farmland" ? "land" : opts.propertyType;
      const params = new URLSearchParams({
        jibun: opts.jibun,
        propertyType: apiType,
        year: opts.year ?? String(new Date().getFullYear()),
      });
      if (opts.dong) params.set("dong", opts.dong);
      if (opts.ho) params.set("ho", opts.ho);

      const res = await fetch(`/api/address/standard-price?${params}`);
      const data = await res.json();

      if (!res.ok) {
        setMsg({ text: data?.error?.message ?? "공시가격 조회 실패", kind: "err" });
        return null;
      }

      const price = data.price ?? data.pricePerSqm ?? 0;
      if (price > 0) {
        setMsg({ text: `${data.message ?? "조회 성공"}: ${price.toLocaleString()}원`, kind: "ok" });
        return price;
      }

      setMsg({ text: "가격 정보 없음 — 직접 입력해주세요.", kind: "err" });
      return null;
    } catch {
      setMsg({ text: "네트워크 오류 — 직접 입력해주세요.", kind: "err" });
      return null;
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setMsg(null);
  }

  return { loading, msg, lookup, reset };
}
