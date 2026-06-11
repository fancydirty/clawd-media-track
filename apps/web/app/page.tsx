import {
  Bell,
  CheckCircle2,
  Clock3,
  Cloud,
  Disc3,
  DownloadCloud,
  Film,
  FolderOpen,
  Home,
  Library,
  RefreshCcw,
  Search,
  ShieldCheck,
  TriangleAlert,
  Wifi,
} from "lucide-react";
import { RequestTrackButton } from "../components/request-track-button";
import { getDashboardState } from "../lib/demo-workflow";

const demoQualityPreference = "4K";

const displayLabels = {
  obtained: "已获取",
  provider_ahead: "超前",
  missing_aired: "缺集",
  unaired: "未播",
  unknown: "未知",
} as const;

const episodeTone = {
  obtained: "episode-cell obtained",
  provider_ahead: "episode-cell provider-ahead",
  missing_aired: "episode-cell missing-aired",
  unaired: "episode-cell unaired",
  unknown: "episode-cell unknown",
} as const;

export default async function Page() {
  const dashboard = await getDashboardState();
  const tracked = dashboard.trackedSeason;
  const seasonCode = `S${String(tracked.seasonNumber).padStart(2, "0")}`;
  const obtainedPercent = Math.round((tracked.obtainedCount / tracked.totalEpisodes) * 100);
  const airedPercent = Math.round((tracked.latestAiredEpisode / tracked.totalEpisodes) * 100);
  const missingEpisodes = tracked.episodes
    .filter((episode) => episode.displayState === "missing_aired")
    .map((episode) => episodeLabel(episode.episodeCode, seasonCode));
  const missingEpisodeCopy = missingEpisodes.length ? `${missingEpisodes.join("、")} 缺失` : "无缺集";
  const unavailableCount = tracked.totalEpisodes - tracked.latestAiredEpisode;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">
            <Film size={18} aria-hidden />
          </span>
          <span className="brand-copy">
            <strong>Media Track</strong>
            <span>115 library ops</span>
          </span>
        </div>

        <nav aria-label="主导航">
          <ul className="nav-list">
            <li className="nav-item is-active">
              <Home size={16} aria-hidden />
              总览
            </li>
            <li className="nav-item">
              <Library size={16} aria-hidden />
              追踪
            </li>
            <li className="nav-item">
              <RefreshCcw size={16} aria-hidden />
              同步
            </li>
          </ul>
        </nav>

        <div className="sidebar-footer">
          <div className="health-card">
            <span className="health-icon">
              <Wifi size={16} aria-hidden />
            </span>
            <span>
              <strong>115 已连接</strong>
              <span>最近验证 2 分钟前</span>
            </span>
          </div>
          <div className="health-card muted">
            <span className="health-icon">
              <Cloud size={16} aria-hidden />
            </span>
            <span>
              <strong>后台队列</strong>
              <span>0 个任务排队中</span>
            </span>
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="page-heading">
            <span className="eyebrow">Library Console</span>
            <h1 className="page-title">媒体追踪</h1>
            <p className="page-subtitle">
              {tracked.title} {seasonCode} 处于自动追踪中
            </p>
          </div>
          <div className="search-row">
            <label className="search-box">
              <Search size={16} aria-hidden />
              <input aria-label="搜索媒体" defaultValue="翘楚" />
            </label>
            <RequestTrackButton />
          </div>
        </header>

        <section className="overview-grid" aria-label={`${tracked.title} 工作台`}>
          <article className="title-stage">
            <div className="poster-tile" aria-hidden>
              <span>{tracked.title}</span>
              <small>S{String(tracked.seasonNumber).padStart(2, "0")}</small>
            </div>

            <div className="stage-content">
              <div className="stage-kicker">
                <span className="live-dot" />
                正在追踪
              </div>
              <h2>
                {tracked.title} 第 {tracked.seasonNumber} 季
              </h2>
              <div className="stage-meta">
                <span>{demoQualityPreference}</span>
                <span>TMDB 已播 {tracked.latestAiredEpisode}</span>
                <span>总集数 {tracked.totalEpisodes}</span>
              </div>

              <div className="season-progress" aria-label={`已获取 ${obtainedPercent}%`}>
                <div className="progress-track">
                  <span className="aired-track" style={{ width: `${airedPercent}%` }} />
                  <span className="obtained-track" style={{ width: `${obtainedPercent}%` }} />
                </div>
                <div className="progress-copy">
                  <span>{tracked.obtainedCount} 集可看</span>
                  <span>{missingEpisodeCopy}</span>
                </div>
              </div>
            </div>
          </article>

          <div className="metric-strip">
            <MetricTile icon={CheckCircle2} label="已获取" value={tracked.obtainedCount} tone="green" />
            <MetricTile icon={TriangleAlert} label="已播缺集" value={tracked.missingAiredCount} tone="coral" />
            <MetricTile icon={Clock3} label="未播出" value={unavailableCount} tone="amber" />
            <MetricTile icon={DownloadCloud} label="资源超前" value={tracked.providerAheadEpisodes.length} tone="blue" />
          </div>
        </section>

        <section className="dashboard-grid">
          <article className="panel episode-panel">
            <div className="panel-header">
              <div>
                <h2 className="panel-title">集数状态</h2>
                <p className="panel-note">
                  {seasonCode}E01 至 {seasonCode}E{String(tracked.totalEpisodes).padStart(2, "0")}
                </p>
              </div>
              <div className="legend-row" aria-label="状态图例">
                <span className="legend-item obtained">已获取</span>
                <span className="legend-item missing">缺集</span>
                <span className="legend-item unaired">未播</span>
              </div>
            </div>

            <div className="episode-grid" aria-label={`${tracked.title} episode status`}>
              {tracked.episodes.map((episode) => (
                <div className={episodeTone[episode.displayState]} key={episode.episodeCode}>
                  <strong>{episodeLabel(episode.episodeCode, seasonCode)}</strong>
                  <span>{displayLabels[episode.displayState]}</span>
                </div>
              ))}
            </div>
          </article>

          <aside className="side-stack">
            <section className="panel notice-panel">
              <div className="panel-header">
                <div>
                  <h2 className="panel-title">通知</h2>
                  <p className="panel-note">最近的工作流结果</p>
                </div>
                <Bell size={18} aria-hidden />
              </div>
              <ul className="event-list">
                {dashboard.events.map((event, index) => (
                  <li className="event-item" key={event.title}>
                    <span className={`event-icon tone-${index}`}>
                      {index === 1 ? (
                        <TriangleAlert size={15} aria-hidden />
                      ) : index === 2 ? (
                        <ShieldCheck size={15} aria-hidden />
                      ) : (
                        <CheckCircle2 size={15} aria-hidden />
                      )}
                    </span>
                    <span>
                      <span className="event-title">{event.title}</span>
                      <span className="event-body">{event.body}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="panel ops-panel">
              <div className="panel-header">
                <div>
                  <h2 className="panel-title">下一次检查</h2>
                  <p className="panel-note">今日 23:30</p>
                </div>
                <RefreshCcw size={18} aria-hidden />
              </div>
              <div className="ops-body">
                <div className="ops-line">
                  <span className="ops-icon">
                    <FolderOpen size={16} aria-hidden />
                  </span>
                  <span>
                    <strong>
                      {tracked.title}/Season {String(tracked.seasonNumber).padStart(2, "0")}
                    </strong>
                    <small>目标目录保持扁平化</small>
                  </span>
                </div>
                <div className="ops-line">
                  <span className="ops-icon">
                    <Disc3 size={16} aria-hidden />
                  </span>
                  <span>
                    <strong>{missingEpisodes.join("、") || "无缺集"}</strong>
                    <small>等待资源恢复</small>
                  </span>
                </div>
              </div>
            </section>
          </aside>
        </section>
      </main>
    </div>
  );
}

function episodeLabel(episodeCode: string, seasonCode: string) {
  return episodeCode.startsWith(seasonCode) ? episodeCode.slice(seasonCode.length) : episodeCode;
}

function MetricTile({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof CheckCircle2;
  label: string;
  value: number;
  tone: "green" | "coral" | "amber" | "blue";
}) {
  return (
    <div className={`metric-tile tone-${tone}`}>
      <span className="metric-icon">
        <Icon size={18} aria-hidden />
      </span>
      <span>
        <span className="metric-label">{label}</span>
        <strong className="metric-value">{value}</strong>
      </span>
    </div>
  );
}
