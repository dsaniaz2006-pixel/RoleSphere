import { createRoot } from "react-dom/client";
import { DotPattern } from "@/components/ui/dot-pattern";

// Only HR, Manager and Employee templates include this mount point.
const host = document.getElementById("rs-dashboard-dots");
if (host) {
  createRoot(host, { identifierPrefix: "rs-dashboard-" }).render(
    <DotPattern cy={1} cr={1} cx={1} className="rs-dashboard-dot-pattern" />,
  );
}
