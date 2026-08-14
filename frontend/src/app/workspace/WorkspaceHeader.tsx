import {
  BarChart3,
  ChevronsUpDown,
  FlaskConical,
  LogIn,
  LogOut,
  Moon,
  Network,
  Settings,
  Sparkles,
  Sun,
  User,
} from "lucide-react";
import { useRef } from "react";

import { loginUrl, logoutUrl } from "@/api/auth";
import type { Theme, ViewMode } from "@/app/workspace/contracts";
import { cn } from "@/lib/utils";

export type WorkspaceHeaderNavigation = {
  activeView: ViewMode;
  onOpenUseCases: () => void;
  onOpenSettings: () => void;
  onOpenMetrics: () => void;
  onOpenEvaluationsAdmin?: () => void;
};

export type WorkspaceHeaderAppearance = {
  theme: Theme;
  onToggleTheme: () => void;
};

export type WorkspaceHeaderAuth = {
  authenticated: boolean;
  entraAuthEnabled: boolean;
  displayName: string;
};

export type WorkspaceHeaderTrace = {
  entryCount: number;
  onOpen: () => void;
  onClose: () => void;
};

export type WorkspaceHeaderActivity = {
  useCaseName: string;
  status: "Live" | "Recording" | null;
};

export type WorkspaceHeaderProps = {
  navigation: WorkspaceHeaderNavigation;
  appearance: WorkspaceHeaderAppearance;
  auth: WorkspaceHeaderAuth;
  trace: WorkspaceHeaderTrace;
  activity: WorkspaceHeaderActivity;
};

export function WorkspaceHeader({
  navigation,
  appearance,
  auth,
  trace,
  activity,
}: WorkspaceHeaderProps) {
  const accountMenuRef = useRef<HTMLDetailsElement | null>(null);

  function closeAccountMenu() {
    accountMenuRef.current?.removeAttribute("open");
  }

  function openSettings() {
    trace.onClose();
    navigation.onOpenSettings();
  }

  function openAccountSettings() {
    closeAccountMenu();
    openSettings();
  }

  return (
    <header className="relative flex h-12 items-center border-b bg-white px-5 dark:border-[#55555a] dark:bg-[#39393d]">
      <h1 className="truncate text-lg font-semibold">Foundry Demo</h1>
      <div className="absolute left-1/2 -translate-x-1/2">
        <button
          type="button"
          onClick={navigation.onOpenUseCases}
          className={cn(
            "inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-200 dark:border-[#606066] dark:bg-[#45454a] dark:text-slate-200 dark:hover:bg-[#505056]",
            navigation.activeView === "chat" && "palette-selected",
          )}
          title="Open the use-case marketplace"
        >
          <Sparkles className="h-3.5 w-3.5" />
          Use cases
          <span className="rounded-full bg-white/70 px-1.5 py-0.5 text-[10px] text-slate-600 dark:bg-[#303033] dark:text-slate-200">
            {activity.useCaseName}
          </span>
          {activity.status ? (
            <span className="rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] text-white">
              {activity.status}
            </span>
          ) : null}
        </button>
      </div>
      {navigation.onOpenEvaluationsAdmin ? (
        <button
          type="button"
          onClick={navigation.onOpenEvaluationsAdmin}
          className={cn(
            "ml-auto rounded-full border border-slate-200 bg-slate-100 p-1.5 text-slate-500 transition hover:bg-slate-200 dark:border-[#606066] dark:bg-[#45454a] dark:text-slate-300 dark:hover:bg-[#505056]",
            (navigation.activeView === "evaluation-admin" ||
              navigation.activeView === "admin-monitor") &&
              "border-primary text-primary ring-1 ring-primary",
          )}
          title="Open admin dashboard"
          aria-label="Open admin dashboard"
        >
          <FlaskConical className="h-3.5 w-3.5" />
        </button>
      ) : null}
      <div
        className={cn(
          "flex items-center gap-3 text-slate-400 dark:text-slate-500",
          !navigation.onOpenEvaluationsAdmin && "ml-auto",
        )}
      >
        <button
          type="button"
          onClick={openSettings}
          className={cn(
            "rounded-full border border-slate-200 bg-slate-100 p-1.5 text-slate-500 transition hover:bg-slate-200 dark:border-[#606066] dark:bg-[#45454a] dark:text-slate-300 dark:hover:bg-[#505056]",
            navigation.activeView === "settings" &&
              "border-primary text-primary ring-1 ring-primary",
          )}
          title="Open app settings"
          aria-label="Open app settings"
        >
          <Settings className="h-3.5 w-3.5" />
        </button>
        {auth.authenticated ? (
          <details ref={accountMenuRef} className="group relative">
            <summary className="flex cursor-pointer list-none items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 transition hover:bg-emerald-100 dark:border-emerald-500/50 dark:bg-emerald-500/15 dark:text-emerald-200 dark:hover:bg-emerald-500/20 [&::-webkit-details-marker]:hidden">
              <User className="h-3.5 w-3.5" />
              <span className="max-w-[11rem] truncate" title={auth.displayName}>
                {auth.displayName}
              </span>
              <ChevronsUpDown className="h-3.5 w-3.5" />
            </summary>
            <div className="absolute right-0 top-full z-50 mt-2 w-52 rounded-lg border border-slate-200 bg-white p-1.5 text-slate-700 shadow-xl dark:border-[#606066] dark:bg-[#39393d] dark:text-slate-200">
              <button
                type="button"
                onClick={() => {
                  closeAccountMenu();
                  trace.onClose();
                  navigation.onOpenMetrics();
                }}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-[#45454a]"
              >
                <BarChart3 className="h-4 w-4" />
                Model monitoring
              </button>
              <button
                type="button"
                onClick={() => {
                  closeAccountMenu();
                  trace.onOpen();
                }}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-[#45454a]"
              >
                <Network className="h-4 w-4" />
                API trace
                {trace.entryCount ? (
                  <span className="ml-auto rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] text-white dark:bg-violet-600">
                    {trace.entryCount}
                  </span>
                ) : null}
              </button>
              <button
                type="button"
                onClick={openAccountSettings}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-[#45454a]"
              >
                <Settings className="h-4 w-4" />
                App settings
              </button>
              <button
                type="button"
                onClick={appearance.onToggleTheme}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-[#45454a]"
              >
                {appearance.theme === "dark" ? (
                  <Sun className="h-4 w-4" />
                ) : (
                  <Moon className="h-4 w-4" />
                )}
                {appearance.theme === "dark" ? "Light theme" : "Dark theme"}
              </button>
              <a
                href={logoutUrl}
                className="mt-1 flex items-center gap-2 border-t border-slate-200 px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:border-[#55555a] dark:text-red-300 dark:hover:bg-red-950/30"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </a>
            </div>
          </details>
        ) : (
          <>
            <button
              type="button"
              aria-label={`Switch to ${appearance.theme === "dark" ? "light" : "dark"} theme`}
              onClick={appearance.onToggleTheme}
              className="rounded-full border border-slate-200 bg-slate-100 p-1.5 text-slate-500 transition hover:bg-slate-200 dark:border-[#606066] dark:bg-[#45454a] dark:text-slate-300 dark:hover:bg-[#505056]"
            >
              {appearance.theme === "dark" ? (
                <Sun className="h-3.5 w-3.5" />
              ) : (
                <Moon className="h-3.5 w-3.5" />
              )}
            </button>
            <button
              type="button"
              disabled={!auth.entraAuthEnabled}
              onClick={() => {
                window.location.assign(loginUrl);
              }}
              title={
                auth.entraAuthEnabled
                  ? "Sign in with your Microsoft account"
                  : "Entra authentication is not enabled for this environment"
              }
              className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 dark:border-violet-500/60 dark:bg-violet-500/15 dark:text-violet-200 dark:hover:bg-violet-500/25 dark:disabled:border-[#606066] dark:disabled:bg-[#45454a] dark:disabled:text-slate-500"
            >
              <LogIn className="h-3.5 w-3.5" />
              {auth.entraAuthEnabled
                ? "Sign in with Microsoft"
                : "Sign-in unavailable locally"}
            </button>
          </>
        )}
      </div>
    </header>
  );
}
