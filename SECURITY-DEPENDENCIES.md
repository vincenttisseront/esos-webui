# Security: accepted dependency risks

## GHSA-67mh-4wv8-2f99 (esbuild, moderate) — dev-only, temporary

`npm audit` may report [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99) (esbuild ≤ 0.24.2) pulled in by **`drizzle-kit`** → `@esbuild-kit/esm-loader` → `@esbuild-kit/core-utils` → `esbuild`.

**Accepted for now:** this chain is **development-only** (`drizzle-kit` is a devDependency). The advisory concerns the **development server** behavior of esbuild, not production runtime code shipped in the Nuxt/Docker image.

**Why not `npm audit fix --force`:** the suggested resolution downgrades `drizzle-kit` to an incompatible release and is explicitly out of scope for this project.

**Mitigation:** use stable `drizzle-orm` / `drizzle-kit` (see `package.json`); do not expose dev tooling to untrusted networks; revisit when upstream `drizzle-kit` drops the `@esbuild-kit` dependency or pins a patched esbuild.
