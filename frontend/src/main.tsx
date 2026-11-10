import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { Bell, LogOut, Luggage, Search } from "lucide-react";
import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, NavLink, Route, Routes, useLocation } from "react-router-dom";
import "./index.css";
import { Button, ErrorBox, Spinner } from "./components/ui";
import { ApiError, api, UNAUTHORIZED_EVENT } from "./lib/api";
import { I18nProvider, useI18n } from "./i18n";
import { LanguageSwitcher } from "./components/LanguageSwitcher";
import { LoginPage } from "./pages/LoginPage";
import { NotificationsPage } from "./pages/NotificationsPage";
import { BrandStamp } from "./components/Stamps";
import { SearchPage } from "./pages/SearchPage";
import { TripPage } from "./pages/TripPage";
import { TripsPage } from "./pages/TripsPage";
import { WatchPage } from "./pages/WatchPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: true,
      // 401 means not logged in; retrying won't help
      retry: (count, err) => !(err instanceof ApiError && err.status === 401) && count < 1,
    },
  },
});

function NavItem({ to, icon, children, also = [] }: { to: string; icon: React.ReactNode; children: React.ReactNode; also?: string[] }) {
  const { pathname } = useLocation();
  const extra = also.some((p) => pathname.startsWith(p));
  return (
    <NavLink
      to={to}
      end={to === "/"}
      aria-label={typeof children === "string" ? children : undefined}
      className={({ isActive: active }) => {
        const isActive = active || extra;
        return clsx(
          "inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold transition-colors sm:px-4",
          isActive ? "bg-brand-600 text-white" : "text-ink-soft hover:bg-brand-50 hover:text-brand-700",
        );
      }}
    >
      {icon}
      <span className="hidden sm:inline">{children}</span>
    </NavLink>
  );
}

function LogoutButton() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const logout = useMutation({
    mutationFn: api.logout,
    onSuccess: (status) => {
      qc.clear();
      qc.setQueryData(["auth"], status);
    },
  });
  return (
    <Button variant="ghost" iconOnly aria-label={t("app.logout")} title={t("app.logout")} icon={<LogOut size={18} />} loading={logout.isPending} onClick={() => logout.mutate()} />
  );
}

/** Shows the login when the server has a password and the session isn't valid. */
function AuthGate() {
  const qc = useQueryClient();
  const status = useQuery({ queryKey: ["auth"], queryFn: api.authStatus, staleTime: Infinity });
  useEffect(() => {
    const onUnauthorized = () => qc.invalidateQueries({ queryKey: ["auth"] });
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, [qc]);

  if (status.isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center text-brand-600">
        <Spinner />
      </div>
    );
  }
  if (status.isError) {
    return (
      <div className="mx-auto max-w-md px-4 pt-20">
        <ErrorBox error={status.error} onRetry={() => status.refetch()} />
      </div>
    );
  }
  if (status.data.enabled && !status.data.authenticated) return <LoginPage />;
  return <App showLogout={status.data.enabled} />;
}

const GITHUB_URL = "https://github.com/butialabs/notifly";

function GithubMark() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

function App({ showLogout }: { showLogout: boolean }) {
  const { t } = useI18n();
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 h-16 border-b border-rule bg-white shadow-sm">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-1 px-4 sm:gap-2">
          <NavLink to="/" className="mr-auto flex items-center gap-2.5 sm:mr-6" aria-label={t("app.home")}>
            <BrandStamp />
            <span className="denom text-[1.65rem] tracking-tight text-brand-700">
              Noti<span className="text-ink">fly</span>
            </span>
          </NavLink>
          <NavItem to="/" icon={<Luggage size={18} />} also={["/trips", "/watches"]}>
            {t("app.trips")}
          </NavItem>
          <NavItem to="/search" icon={<Search size={18} />}>
            {t("app.search")}
          </NavItem>
          <NavItem to="/notifications" icon={<Bell size={18} />}>
            {t("app.notifications")}
          </NavItem>
          <LanguageSwitcher className="ml-1" />
          {showLogout && <LogoutButton />}
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-10 pt-6">
        <Routes>
          <Route path="/" element={<TripsPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/trips" element={<Navigate to="/" replace />} />
          <Route path="/trips/:id" element={<TripPage />} />
          <Route path="/watches/:id" element={<WatchPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
        </Routes>
      </main>
      <footer className="border-t border-rule">
        <div className="mx-auto flex max-w-6xl justify-center px-4 py-5">
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-ink-mute transition-colors hover:text-brand-700"
          >
            <GithubMark />
            {t("app.sourceCode")}
          </a>
        </div>
      </footer>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      {/* changing the language refetches queries; the backend translates by Accept-Language */}
      <I18nProvider onChange={() => queryClient.invalidateQueries()}>
        <BrowserRouter>
          <AuthGate />
        </BrowserRouter>
      </I18nProvider>
    </QueryClientProvider>
  </StrictMode>,
);
