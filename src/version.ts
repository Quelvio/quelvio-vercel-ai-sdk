/**
 * Package version. Hardcoded — kept in lockstep with `package.json` by
 * the release workflow. Reading the file at runtime would require an
 * extra read in every consumer environment (bundlers, edge runtimes) for
 * no real benefit, so we accept the duplication and let `tsup`'s `define`
 * mechanism flag a mismatch at build time.
 */
export const VERSION = '0.1.0';
