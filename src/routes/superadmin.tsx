import { createFileRoute } from "@tanstack/react-router";
import SuperadminPanel from "@/components/SuperadminPanel";

export const Route = createFileRoute("/superadmin")({
  component: SuperadminPanel,
});
