import {
    Link,
    createRootRoute,
    createRoute,
    createRouter,
} from "@tanstack/react-router";

import { RootLayout } from "@/components/layout";
import { EmptyBlock } from "@/components/states";
import { buttonVariants } from "@/components/ui/button";
import { ErrorsPage } from "@/pages/errors";
import { OverviewPage } from "@/pages/overview";
import { SpanDetailPage } from "@/pages/span-detail";
import { SpansPage } from "@/pages/spans";
import { SystemPage } from "@/pages/system";
import { TraceDetailPage } from "@/pages/trace-detail";
import { TracesPage } from "@/pages/traces";

function NotFoundPage() {
    return (
        <EmptyBlock
            description="The requested page does not exist."
            icon={<span className="font-heading text-lg">404</span>}
            title="Not found"
        >
            <Link className={buttonVariants({ size: "sm" })} to="/">
                Back to overview
            </Link>
        </EmptyBlock>
    );
}

const rootRoute = createRootRoute({
    component: RootLayout,
    notFoundComponent: NotFoundPage,
});

const overviewRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: OverviewPage,
});

const spansRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/spans",
    component: SpansPage,
});

const spanDetailRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/spans/$spanName",
    component: SpanDetailPage,
});

const errorsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/errors",
    component: ErrorsPage,
});

const tracesRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/traces",
    component: TracesPage,
});

const traceDetailRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/traces/$traceId",
    component: TraceDetailPage,
});

const systemRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/system",
    component: SystemPage,
});

const routeTree = rootRoute.addChildren([
    overviewRoute,
    spansRoute,
    spanDetailRoute,
    errorsRoute,
    tracesRoute,
    traceDetailRoute,
    systemRoute,
]);

export const router = createRouter({
    routeTree,
    defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
    interface Register {
        router: typeof router;
    }
}
