/* eslint-disable */
// @ts-nocheck
// Manual route tree — keep in sync with src/routes/*

import { Route as rootRouteImport } from "./routes/__root";
import { Route as IndexRouteImport } from "./routes/index";
import { Route as AdminRouteImport } from "./routes/admin";
import { Route as AdminTranslationsRouteImport } from "./routes/admin.translations";
import { Route as AdminTranslationsPreviewRouteImport } from "./routes/admin.translations.preview";
import { Route as ConditionsRouteImport } from "./routes/conditions";
import { Route as DashboardRouteImport } from "./routes/dashboard";
import { Route as PrivacyRouteImport } from "./routes/privacy";
import { Route as ProfileRouteImport } from "./routes/profile";
import { Route as SignupRouteImport } from "./routes/signup";
import { Route as TermsRouteImport } from "./routes/terms";
import { Route as SecureRouteImport } from "./routes/secure";
import { Route as ResetPasswordRouteImport } from "./routes/reset-password";
import { Route as ForgotPasswordRouteImport } from "./routes/forgot-password";
import { Route as DepositReturnRouteImport } from "./routes/deposit-return";
import { Route as ApiAuthSplatRouteImport } from "./routes/api/auth/$";
import { Route as ApiPaychanguWebhookRouteImport } from "./routes/api/paychangu/webhook";
import { Route as ApiCronReconcileRouteImport } from "./routes/api/cron/reconcile";

const IndexRoute = IndexRouteImport.update({
  id: "/",
  path: "/",
  getParentRoute: () => rootRouteImport,
} as any);
const AdminRoute = AdminRouteImport.update({
  id: "/admin",
  path: "/admin",
  getParentRoute: () => rootRouteImport,
} as any);
const AdminTranslationsRoute = AdminTranslationsRouteImport.update({
  id: "/admin/translations",
  path: "/admin/translations",
  getParentRoute: () => rootRouteImport,
} as any);
const AdminTranslationsPreviewRoute = AdminTranslationsPreviewRouteImport.update({
  id: "/admin/translations/preview",
  path: "/admin/translations/preview",
  getParentRoute: () => rootRouteImport,
} as any);
const ConditionsRoute = ConditionsRouteImport.update({
  id: "/conditions",
  path: "/conditions",
  getParentRoute: () => rootRouteImport,
} as any);
const DashboardRoute = DashboardRouteImport.update({
  id: "/dashboard",
  path: "/dashboard",
  getParentRoute: () => rootRouteImport,
} as any);
const PrivacyRoute = PrivacyRouteImport.update({
  id: "/privacy",
  path: "/privacy",
  getParentRoute: () => rootRouteImport,
} as any);
const ProfileRoute = ProfileRouteImport.update({
  id: "/profile",
  path: "/profile",
  getParentRoute: () => rootRouteImport,
} as any);
const SignupRoute = SignupRouteImport.update({
  id: "/signup",
  path: "/signup",
  getParentRoute: () => rootRouteImport,
} as any);
const TermsRoute = TermsRouteImport.update({
  id: "/terms",
  path: "/terms",
  getParentRoute: () => rootRouteImport,
} as any);
const SecureRoute = SecureRouteImport.update({
  id: "/secure",
  path: "/secure",
  getParentRoute: () => rootRouteImport,
} as any);
const ForgotPasswordRoute = ForgotPasswordRouteImport.update({
  id: "/forgot-password",
  path: "/forgot-password",
  getParentRoute: () => rootRouteImport,
} as any);
const ResetPasswordRoute = ResetPasswordRouteImport.update({
  id: "/reset-password",
  path: "/reset-password",
  getParentRoute: () => rootRouteImport,
} as any);
const DepositReturnRoute = DepositReturnRouteImport.update({
  id: "/deposit-return",
  path: "/deposit-return",
  getParentRoute: () => rootRouteImport,
} as any);
const ApiAuthSplatRoute = ApiAuthSplatRouteImport.update({
  id: "/api/auth/$",
  path: "/api/auth/$",
  getParentRoute: () => rootRouteImport,
} as any);
const ApiPaychanguWebhookRoute = ApiPaychanguWebhookRouteImport.update({
  id: "/api/paychangu/webhook",
  path: "/api/paychangu/webhook",
  getParentRoute: () => rootRouteImport,
} as any);
const ApiCronReconcileRoute = ApiCronReconcileRouteImport.update({
  id: "/api/cron/reconcile",
  path: "/api/cron/reconcile",
  getParentRoute: () => rootRouteImport,
} as any);

export interface FileRoutesByFullPath {
  "/": typeof IndexRoute;
  "/admin": typeof AdminRoute;
  "/conditions": typeof ConditionsRoute;
  "/dashboard": typeof DashboardRoute;
  "/privacy": typeof PrivacyRoute;
  "/profile": typeof ProfileRoute;
  "/signup": typeof SignupRoute;
  "/terms": typeof TermsRoute;
  "/secure": typeof SecureRoute;
  "/forgot-password": typeof ForgotPasswordRoute;
  "/reset-password": typeof ResetPasswordRoute;
  "/deposit-return": typeof DepositReturnRoute;
  "/api/auth/$": typeof ApiAuthSplatRoute;
  "/api/paychangu/webhook": typeof ApiPaychanguWebhookRoute;
  "/api/cron/reconcile": typeof ApiCronReconcileRoute;
}
export interface FileRoutesByTo {
  "/": typeof IndexRoute;
  "/admin": typeof AdminRoute;
  "/conditions": typeof ConditionsRoute;
  "/dashboard": typeof DashboardRoute;
  "/privacy": typeof PrivacyRoute;
  "/profile": typeof ProfileRoute;
  "/signup": typeof SignupRoute;
  "/terms": typeof TermsRoute;
  "/secure": typeof SecureRoute;
  "/forgot-password": typeof ForgotPasswordRoute;
  "/reset-password": typeof ResetPasswordRoute;
  "/deposit-return": typeof DepositReturnRoute;
  "/api/auth/$": typeof ApiAuthSplatRoute;
  "/api/paychangu/webhook": typeof ApiPaychanguWebhookRoute;
  "/api/cron/reconcile": typeof ApiCronReconcileRoute;
}
export interface FileRoutesById {
  __root__: typeof rootRouteImport;
  "/": typeof IndexRoute;
  "/admin": typeof AdminRoute;
  "/conditions": typeof ConditionsRoute;
  "/dashboard": typeof DashboardRoute;
  "/privacy": typeof PrivacyRoute;
  "/profile": typeof ProfileRoute;
  "/signup": typeof SignupRoute;
  "/terms": typeof TermsRoute;
  "/secure": typeof SecureRoute;
  "/forgot-password": typeof ForgotPasswordRoute;
  "/reset-password": typeof ResetPasswordRoute;
  "/deposit-return": typeof DepositReturnRoute;
  "/api/auth/$": typeof ApiAuthSplatRoute;
  "/api/paychangu/webhook": typeof ApiPaychanguWebhookRoute;
  "/api/cron/reconcile": typeof ApiCronReconcileRoute;
}
export interface FileRouteTypes {
  fileRoutesByFullPath: FileRoutesByFullPath;
  fullPaths:
    | "/"
    | "/admin"
    | "/conditions"
    | "/dashboard"
    | "/privacy"
    | "/profile"
    | "/signup"
    | "/terms"
    | "/secure"
    | "/forgot-password"
    | "/reset-password"
    | "/deposit-return"
    | "/api/auth/$"
    | "/api/paychangu/webhook"
    | "/api/cron/reconcile";
  fileRoutesByTo: FileRoutesByTo;
  to:
    | "/"
    | "/admin"
    | "/conditions"
    | "/dashboard"
    | "/privacy"
    | "/profile"
    | "/signup"
    | "/terms"
    | "/secure"
    | "/forgot-password"
    | "/reset-password"
    | "/deposit-return"
    | "/api/auth/$"
    | "/api/paychangu/webhook"
    | "/api/cron/reconcile";
  id:
    | "__root__"
    | "/"
    | "/admin"
    | "/conditions"
    | "/dashboard"
    | "/privacy"
    | "/profile"
    | "/signup"
    | "/terms"
    | "/secure"
    | "/forgot-password"
    | "/reset-password"
    | "/deposit-return"
    | "/api/auth/$"
    | "/api/paychangu/webhook"
    | "/api/cron/reconcile";
  fileRoutesById: FileRoutesById;
}
export interface RootRouteChildren {
  IndexRoute: typeof IndexRoute;
  AdminRoute: typeof AdminRoute;
  ConditionsRoute: typeof ConditionsRoute;
  DashboardRoute: typeof DashboardRoute;
  PrivacyRoute: typeof PrivacyRoute;
  ProfileRoute: typeof ProfileRoute;
  SignupRoute: typeof SignupRoute;
  TermsRoute: typeof TermsRoute;
  SecureRoute: typeof SecureRoute;
  ForgotPasswordRoute: typeof ForgotPasswordRoute;
  ResetPasswordRoute: typeof ResetPasswordRoute;
  DepositReturnRoute: typeof DepositReturnRoute;
  ApiAuthSplatRoute: typeof ApiAuthSplatRoute;
  ApiPaychanguWebhookRoute: typeof ApiPaychanguWebhookRoute;
  ApiCronReconcileRoute: typeof ApiCronReconcileRoute;
}

declare module "@tanstack/react-router" {
  interface FileRoutesByPath {
    "/": {
      id: "/";
      path: "/";
      fullPath: "/";
      preLoaderRoute: typeof IndexRouteImport;
      parentRoute: typeof rootRouteImport;
    };
    "/admin": {
      id: "/admin";
      path: "/admin";
      fullPath: "/admin";
      preLoaderRoute: typeof AdminRouteImport;
      parentRoute: typeof rootRouteImport;
    };
    "/conditions": {
      id: "/conditions";
      path: "/conditions";
      fullPath: "/conditions";
      preLoaderRoute: typeof ConditionsRouteImport;
      parentRoute: typeof rootRouteImport;
    };
    "/dashboard": {
      id: "/dashboard";
      path: "/dashboard";
      fullPath: "/dashboard";
      preLoaderRoute: typeof DashboardRouteImport;
      parentRoute: typeof rootRouteImport;
    };
    "/privacy": {
      id: "/privacy";
      path: "/privacy";
      fullPath: "/privacy";
      preLoaderRoute: typeof PrivacyRouteImport;
      parentRoute: typeof rootRouteImport;
    };
    "/profile": {
      id: "/profile";
      path: "/profile";
      fullPath: "/profile";
      preLoaderRoute: typeof ProfileRouteImport;
      parentRoute: typeof rootRouteImport;
    };
    "/signup": {
      id: "/signup";
      path: "/signup";
      fullPath: "/signup";
      preLoaderRoute: typeof SignupRouteImport;
      parentRoute: typeof rootRouteImport;
    };
    "/terms": {
      id: "/terms";
      path: "/terms";
      fullPath: "/terms";
      preLoaderRoute: typeof TermsRouteImport;
      parentRoute: typeof rootRouteImport;
    };
    "/secure": {
      id: "/secure";
      path: "/secure";
      fullPath: "/secure";
      preLoaderRoute: typeof SecureRouteImport;
      parentRoute: typeof rootRouteImport;
    };
    "/forgot-password": {
      id: "/forgot-password";
      path: "/forgot-password";
      fullPath: "/forgot-password";
      preLoaderRoute: typeof ForgotPasswordRouteImport;
      parentRoute: typeof rootRouteImport;
    };
    "/reset-password": {
      id: "/reset-password";
      path: "/reset-password";
      fullPath: "/reset-password";
      preLoaderRoute: typeof ResetPasswordRouteImport;
      parentRoute: typeof rootRouteImport;
    };
    "/deposit-return": {
      id: "/deposit-return";
      path: "/deposit-return";
      fullPath: "/deposit-return";
      preLoaderRoute: typeof DepositReturnRouteImport;
      parentRoute: typeof rootRouteImport;
    };
    "/api/auth/$": {
      id: "/api/auth/$";
      path: "/api/auth/$";
      fullPath: "/api/auth/$";
      preLoaderRoute: typeof ApiAuthSplatRouteImport;
      parentRoute: typeof rootRouteImport;
    };
    "/api/paychangu/webhook": {
      id: "/api/paychangu/webhook";
      path: "/api/paychangu/webhook";
      fullPath: "/api/paychangu/webhook";
      preLoaderRoute: typeof ApiPaychanguWebhookRouteImport;
      parentRoute: typeof rootRouteImport;
    };
    "/api/cron/reconcile": {
      id: "/api/cron/reconcile";
      path: "/api/cron/reconcile";
      fullPath: "/api/cron/reconcile";
      preLoaderRoute: typeof ApiCronReconcileRouteImport;
      parentRoute: typeof rootRouteImport;
    };
  }
}

const rootRouteChildren: RootRouteChildren = {
  IndexRoute,
  AdminRoute,
  AdminTranslationsRoute,
  AdminTranslationsPreviewRoute,
  ConditionsRoute,
  DashboardRoute,
  PrivacyRoute,
  ProfileRoute,
  SignupRoute,
  TermsRoute,
  SecureRoute,
  ForgotPasswordRoute,
  ResetPasswordRoute,
  DepositReturnRoute,
  ApiAuthSplatRoute,
  ApiPaychanguWebhookRoute,
  ApiCronReconcileRoute,
};

export const routeTree = rootRouteImport
  ._addFileChildren(rootRouteChildren)
  ._addFileTypes<FileRouteTypes>();

import type { getRouter } from "./router.tsx";
declare module "@tanstack/react-start" {
  interface Register {
    ssr: true;
    router: Awaited<ReturnType<typeof getRouter>>;
  }
}
