export interface ImpersonationContext {
  is_impersonating: boolean;
  actor_public_id: string | null;
  actor_email: string | null;
  actor_platform_role: string | null;
  target_public_id: string | null;
  target_email: string | null;
  reason: string | null;
}

export interface MeResponse {
  public_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  role: string | null;
  app_role: string | null;
  platform_role: string | null;
  default_route: string;
  impersonation: ImpersonationContext;
}

export function getDefaultRoute(me: MeResponse): string {
  if (me.app_role === "customer" && (!me.default_route || me.default_route === "/customer")) {
    return "/coworking";
  }
  if (me.default_route) {
    return me.default_route;
  }
  if (me.platform_role) {
    return "/admin";
  }
  if (me.app_role === "owner") {
    return "/owner";
  }
  if (me.app_role === "customer") {
    return "/coworking";
  }
  return "/onboarding";
}
