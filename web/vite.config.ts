import { fileURLToPath, URL } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
    plugins: [tailwindcss(), react()],
    resolve: {
        alias: {
            "@": fileURLToPath(new URL("./src", import.meta.url)),
        },
    },
    server: {
        port: 3001,
        strictPort: true,
        proxy: {
            "/healthz": "http://127.0.0.1:18080",
            "/auth": "http://127.0.0.1:18080",
            "/logout": "http://127.0.0.1:18080",
            "/v1": "http://127.0.0.1:18080",
        },
    },
});
