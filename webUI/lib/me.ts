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
  phone?: string | null;
  company_name?: string | null;
  role: string | null;
  app_role: string | null;
  platform_role: string | null;
  has_organization: boolean;
  default_route: string;
  impersonation: ImpersonationContext;
}

export function getDefaultRoute(me: MeResponse): string {
  if (me.impersonation.is_impersonating) {
    if (me.app_role === "owner") return "/owner";
    if (me.app_role === "member") return "/member";
    return me.default_route || "/onboarding/personal";
  }

  // Platform admins
  if (me.platform_role) return "/admin";

  // No role yet → personal onboarding
  if (!me.app_role) return "/onboarding/personal";

  // Owner: needs org first
  if (me.app_role === "owner") {
    return me.has_organization ? "/owner" : "/onboarding/organization";
  }

  // Member
  if (me.app_role === "member") return "/spaces";

  // Server-provided default or fallback
  return me.default_route || "/onboarding/personal";
}

export function getDashboardHref(me: MeResponse): string {
  if (me.impersonation.is_impersonating) {
    if (me.app_role === "owner") return "/owner";
    if (me.app_role === "member") return "/member/requests";
    return me.default_route || "/onboarding/personal";
  }
  if (me.platform_role) return "/admin";
  if (me.app_role === "owner") return "/owner";
  if (me.app_role === "member") return "/member/requests";
  return "/onboarding/personal";
}
