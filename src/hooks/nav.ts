import { DOMAIN_NAV, NAV, SETTINGS_NAV, type NavItem } from "@/components/layout/nav";
import { useApp } from "./app";

/** Navigation items currently available (domain modules follow enabled domains). */
export function useNavItems(): NavItem[] {
  const { settings } = useApp();
  const enabled = new Set(settings.domains.filter((d) => d.enabled).map((d) => d.id));
  return [...NAV, ...DOMAIN_NAV.filter((n) => enabled.has(n.domain!)), SETTINGS_NAV];
}
