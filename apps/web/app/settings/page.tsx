import { connection } from "next/server";
import { Suspense } from "react";
import { Bell, Cable, ShieldCheck, TriangleAlert } from "lucide-react";
import { AppSidebar } from "../../components/app-sidebar";
import { Pan115QrConnect } from "../../components/pan115-qr-connect";
import { PushNotificationForm } from "../../components/push-notification-form";
import { getPan115ConnectionStatus, getWorkflowRepository } from "../../lib/workflow-runtime";

export default function SettingsPage() {
  return (
    <div className="app-shell">
      <AppSidebar active="none" />
      <main className="main product-main">
        <div className="section-heading library-heading">
          <div>
            <h1>设置</h1>
            <p>115 网盘连接与系统配置</p>
          </div>
        </div>
        <Suspense fallback={<div className="skeleton skeleton-heading" />}>
          <Pan115Section />
        </Suspense>
        <Suspense fallback={<div className="skeleton skeleton-heading" />}>
          <PushNotificationSection />
        </Suspense>
      </main>
    </div>
  );
}

async function Pan115Section() {
  await connection();
  const status = await getPan115ConnectionStatus();

  return (
    <section className="panel" style={{ maxWidth: 720 }}>
      <div className="panel-header">
        <div>
          <h2 className="panel-title">
            <Cable size={16} aria-hidden style={{ verticalAlign: "-2px", marginRight: 8 }} />
            115 网盘
          </h2>
          <p className="panel-note">扫码登录后 cookie 持久化到数据库，自动用于后续转存</p>
        </div>
        {status.connected ? (
          <span className="hub-badge tone-green">
            <ShieldCheck size={12} aria-hidden />
            {status.source === "qr" ? "已扫码连接" : "已连接（.env）"}
          </span>
        ) : (
          <span className="hub-badge tone-amber">
            <TriangleAlert size={12} aria-hidden />
            未连接
          </span>
        )}
      </div>

      {status.connected ? (
        <p className="qr-hint">
          {status.userName ? `账号：${status.userName} · ` : ""}
          {status.app ? `客户端类型：${status.app} · ` : ""}
          {status.connectedAt ? `连接于 ${status.connectedAt.slice(0, 16).replace("T", " ")}` : ""}
          {status.source === "env" ? "当前 cookie 来自 .env；扫码连接后将以数据库为准。" : ""}
        </p>
      ) : (
        <p className="qr-hint">还没有可用的 115 cookie，扫码连接后即可开始获取资源。</p>
      )}

      <Pan115QrConnect />
    </section>
  );
}

async function PushNotificationSection() {
  await connection();
  const repository = getWorkflowRepository();

  const initial: Record<string, string> = {};
  for (const key of ["bark", "serverchan", "wecom", "webhook"]) {
    const value = await repository.getSetting(`push_${key}`);
    if (value) {
      initial[key] = value;
    }
  }

  return (
    <section className="panel" style={{ maxWidth: 720, marginTop: 24 }}>
      <div className="panel-header">
        <div>
          <h2 className="panel-title">
            <Bell size={16} aria-hidden style={{ verticalAlign: "-2px", marginRight: 8 }} />
            推送通知
          </h2>
          <p className="panel-note">配置推送渠道后，Type 3 巡检完成时会自动推送更新播报</p>
        </div>
      </div>

      <PushNotificationForm initial={initial} />
    </section>
  );
}
