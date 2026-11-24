import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { applyInitialTheme } from "@/lib/theme";
import { router } from "@/route-tree";

import "@/styles.css";

applyInitialTheme();

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            refetchOnWindowFocus: false,
            retry: 1,
            staleTime: 15_000,
        },
    },
});

const container = document.getElementById("root");
if (!container) throw new Error("Missing root element");

createRoot(container).render(
    <StrictMode>
        <QueryClientProvider client={queryClient}>
            <RouterProvider router={router} />
        </QueryClientProvider>
    </StrictMode>
);
