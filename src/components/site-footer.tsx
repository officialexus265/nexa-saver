import { useEffect, useState } from "react";
import { getPublicSiteFooter } from "@/lib/nexa/fns";
import { useT } from "@/lib/i18n/client";

export function SiteFooter({ className }: { className?: string }) {
  const { t } = useT();
  const [name, setName] = useState("NEXUS265");
  const [url, setUrl] = useState("https://www.facebook.com/");

  useEffect(() => {
    void getPublicSiteFooter()
      .then((r) => {
        if (r.companyName) setName(r.companyName);
        if (r.companyUrl) setUrl(r.companyUrl);
      })
      .catch(() => undefined);
  }, []);

  return (
    <footer className={className ?? "mt-8 pb-2 text-center text-xs text-faint"}>
      {t("footer.developedBy")}{" "}
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-muted underline-offset-2 hover:text-primary hover:underline"
      >
        {name}
      </a>
    </footer>
  );
}
