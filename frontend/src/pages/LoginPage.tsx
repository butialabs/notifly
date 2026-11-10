import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LogIn } from "lucide-react";
import { useState } from "react";
import { LanguageSwitcher } from "../components/LanguageSwitcher";
import { BrandStamp } from "../components/Stamps";
import { Button, ErrorBox } from "../components/ui";
import { useI18n } from "../i18n";
import { api } from "../lib/api";

export function LoginPage() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [password, setPassword] = useState("");
  const login = useMutation({
    mutationFn: () => api.login(password),
    onSuccess: (status) => {
      qc.setQueryData(["auth"], status);
      qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== "auth" });
    },
  });

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form
        className="card card-pad w-full max-w-sm space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          login.mutate();
        }}
      >
        <div className="flex items-center gap-2.5">
          <BrandStamp />
          <span className="denom text-[1.65rem] tracking-tight text-brand-700">
            Noti<span className="text-ink">fly</span>
          </span>
          <LanguageSwitcher className="ml-auto" />
        </div>
        <div>
          <label className="label" htmlFor="login-password">
            {t("login.password")}
          </label>
          <input
            id="login-password"
            type="password"
            className="input"
            autoComplete="current-password"
            required
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />        </div>
        <ErrorBox error={login.error} />
        <Button type="submit" variant="primary" className="w-full" icon={<LogIn size={18} />} loading={login.isPending}>
          {t("login.submit")}
        </Button>
      </form>
    </div>
  );
}
