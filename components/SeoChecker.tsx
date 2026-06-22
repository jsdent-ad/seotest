"use client";

import { useState } from "react";

interface CheckItem {
  label: string;
  passed: boolean;
  detail: string;
  weight: number;
}

interface SeoResult {
  url: string;
  score: number;
  grade: string;
  checks: CheckItem[];
  topIssues: string[];
}

function ScoreRing({ score }: { score: number }) {
  const radius = 45;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 85 ? "#22c55e" : score >= 60 ? "#f59e0b" : "#ef4444";

  return (
    <div className="score-ring">
      <svg width="110" height="110" viewBox="0 0 110 110" aria-hidden="true">
        <circle
          cx="55"
          cy="55"
          r={radius}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth="10"
        />
        <circle
          cx="55"
          cy="55"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      <div className="score-ring__label">
        <strong>{score}</strong>
        <span>점</span>
      </div>
    </div>
  );
}

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export default function SeoChecker() {
  const [url, setUrl] = useState("");
  const [result, setResult] = useState<SeoResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const normalized = normalizeUrl(url);

    if (!normalized) {
      setError("검사할 홈페이지 주소를 입력해주세요.");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const res = await fetch("/api/seo-checker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: normalized }),
      });
      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || "검사에 실패했습니다.");
      }

      setResult(data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "검사에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <section className="hero">
        <div className="container">
          <h1>무료 SEO 검사기</h1>
          <p>
            홈페이지 주소를 입력하면 검색 노출에 필요한 기본 항목을 빠르게
            점검합니다.
          </p>
          <form className="search-form" onSubmit={handleSubmit}>
            <input
              type="text"
              placeholder="https://example.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              inputMode="url"
              autoComplete="url"
            />
            <button type="submit" disabled={loading}>
              {loading ? "검사 중..." : "SEO 검사"}
            </button>
          </form>
          <p className="hint">
            title · description · H1 · robots · sitemap · canonical · OG · 이미지
            ALT · 문의 경로를 확인합니다.
          </p>
          {error && <p className="error-msg">{error}</p>}
        </div>
      </section>

      {result && (
        <section className="results">
          <div className="container">
            <div className="score-summary">
              <ScoreRing score={result.score} />
              <div className="score-info">
                <p className="url">{result.url}</p>
                <h2>{result.grade}</h2>
                <p>
                  이 검사는 기술 SEO의 1차 점검입니다. 실제 검색 성과는 도메인
                  신뢰도, 콘텐츠 품질, 경쟁 키워드 상태에 따라 달라집니다.
                </p>
              </div>
            </div>

            <div className="check-grid">
              {result.checks.map((check) => (
                <div
                  key={check.label}
                  className={`check-card ${
                    check.passed ? "check-card--pass" : "check-card--fail"
                  }`}
                >
                  <div className="check-card__status">
                    {check.passed ? "● 통과" : "● 점검 필요"}
                  </div>
                  <h3>{check.label}</h3>
                  <p>{check.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
