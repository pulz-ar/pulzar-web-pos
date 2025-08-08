import { clerkMiddleware, createRouteMatcher, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { init, lookup } from "@instantdb/admin";
import schema from "@inventory/instant.schema";

// Rutas
const isPlatformRoute = createRouteMatcher(["/platform(.*)", "/platform/(.*)"]);
const isAuthRoute = createRouteMatcher(["/onboarding(.*)", "/onboarding/(.*)"]);
const isWebhookRoute = createRouteMatcher(["/api/webhook/(.*)"]); // libre

// InstantDB admin (server-only)
const db = init({
  appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID!,
  adminToken: process.env.INSTANT_APP_ADMIN_TOKEN!,
  schema,
});

export default clerkMiddleware(async (auth, req) => {
  // Webhooks quedan libres
  if (isWebhookRoute(req)) return NextResponse.next();

  // Proteger plataforma y onboarding
  if (isPlatformRoute(req) || isAuthRoute(req)) {
    const a = await auth.protect();
    const userId = a.userId;
    const orgId = a.orgId;
    const userEmail = a.sessionClaims?.email as string | undefined;

    if (isPlatformRoute(req)) {
      try {
        const clerk = await clerkClient();
        const orgs = await clerk.users.getOrganizationMembershipList({ userId });

        if (orgs.data.length === 0) {
          return NextResponse.redirect(new URL("/onboarding", req.url));
        }

        const current = orgs.data.find((membership: any) => membership.organization.id === orgId);
        if (!orgId || !current) {
          return NextResponse.redirect(new URL("/onboarding", req.url));
        }

        // Vincular usuario <-> organización y guardar membership/permissions
        const txs: any[] = [
          db.tx.organizations[lookup("clerkOrgId", orgId)].update({})
        ];
/*
        txs.push(
          db.tx.organizationMemberships[lookup("clerkOrgId", orgId)].update({
            content: {
              role: current.role,
              permissions: current.permissions || [],
            },
            updatedAt: new Date().toISOString(),
          }).link({
            organization: lookup("clerkOrgId", orgId),
          }).link({
            users: lookup("email", userEmail),
          })
        );
*/  
        // get user by email, then get its id, then save inside clerk private metadata. add a get from private metadata to avoid the query if already exists
        const user = await clerk.users.getUser(userId as string);
        let internalId = user.privateMetadata.internalId as string;
        if (!internalId) {
          // find inside db with instantdb, then save inside clerk private metadata. add a get from private metadata to avoid the query if already exists
          const user = await db.query({ $users: { $: { where: { email: userEmail }, limit: 1 } } });
          internalId = user.$users[0].id;
          await clerk.users.updateUserMetadata(userId, {
            privateMetadata: { internalId },
          });
        }
        await db.transact(db.tx.organizations[lookup("clerkOrgId", orgId)].update({}));
        await db.transact(db.tx.organizations[lookup("clerkOrgId", orgId)].link({
          members: internalId,
        }));
      } catch (error) {
        console.error("Error middleware org/user link", error);
      }
    }
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};


