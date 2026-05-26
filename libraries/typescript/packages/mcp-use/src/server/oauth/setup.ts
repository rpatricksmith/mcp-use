/**
 * OAuth Setup
 *
 * Handles OAuth provider/proxy initialization and configuration for MCP servers.
 * Supports both DCR-direct mode (OAuthProvider) and proxy mode (OAuthProxy).
 */

import type { Hono as HonoType, Context, Next } from "hono";
import { setupOAuthRoutes, isOAuthProxy } from "./routes.js";
import { createBearerAuthMiddleware } from "./middleware.js";
import type { OAuthProvider, OAuthProxy } from "./providers/types.js";

/**
 * OAuth setup state
 */
interface OAuthSetupState {
  provider?: OAuthProvider | OAuthProxy;
  middleware?: (c: Context, next: Next) => Promise<Response | void>;
  complete: boolean;
}

/**
 * Setup OAuth authentication for MCP server
 *
 * Initializes OAuth provider/proxy, creates bearer auth middleware,
 * sets up OAuth routes, and applies auth to /mcp endpoints.
 *
 * Supports two modes:
 * - DCR-direct (OAuthProvider): Clients authenticate directly with upstream
 * - Proxy (OAuthProxy): Server proxies OAuth flow with pre-registered credentials
 *
 * @param app - Hono app instance
 * @param oauth - OAuth provider or proxy instance
 * @param baseUrl - Server base URL for OAuth redirects
 * @param state - OAuth setup state to track completion
 * @param options - Setup options
 * @param options.optionalAuth - When true, bearer middleware lets requests
 *   without an Authorization header through (needed for SEP-1488 / OpenAI Apps
 *   SDK mixed-auth servers where some tools declare `{ type: "noauth" }`).
 *   Invalid tokens are still rejected.
 * @returns Updated OAuth setup state with provider and middleware
 */
export async function setupOAuthForServer(
  app: HonoType,
  oauth: OAuthProvider | OAuthProxy,
  baseUrl: string,
  state: OAuthSetupState,
  options?: { optionalAuth?: boolean }
): Promise<OAuthSetupState> {
  if (state.complete) {
    return state; // Already setup
  }

  const proxyMode = isOAuthProxy(oauth);
  const optionalAuth = options?.optionalAuth === true;
  console.log(`[OAuth] OAuth ${proxyMode ? "proxy" : "provider"} initialized`);

  // Create bearer auth middleware with baseUrl for WWW-Authenticate header
  const middleware = createBearerAuthMiddleware(oauth, baseUrl, {
    optional: optionalAuth,
  });

  // Setup OAuth routes
  setupOAuthRoutes(app, oauth, baseUrl);

  if (proxyMode) {
    console.log(
      "[OAuth] Proxy mode: clients use local /authorize, /token, /register endpoints"
    );
    console.log("[OAuth] Credentials will be injected at token exchange");
  } else {
    console.log(
      "[OAuth] Clients will authenticate with provider directly via DCR"
    );
  }
  console.log("[OAuth] Metadata endpoints: /.well-known/*");

  // Apply bearer auth to all /mcp routes
  app.use("/mcp/*", middleware);
  if (optionalAuth) {
    console.log(
      "[OAuth] Bearer authentication in OPTIONAL mode on /mcp routes (SEP-1488 mixed auth: noauth tools detected)"
    );
  } else {
    console.log("[OAuth] Bearer authentication enabled on /mcp routes");
  }

  return {
    provider: oauth,
    middleware: middleware,
    complete: true,
  };
}
