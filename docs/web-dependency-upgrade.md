# Web dependency upgrade

The security recovery uses Next.js 16.4.3, Vitest 5 and a shared Vite 7 toolchain.
Use Node 22.12 or later; CI and `.nvmrc` select Node 22. Python receiver services
and their provider schedules are unchanged.

`npm ci` installs the root workspace lockfile. Run the web checks from the root:

```sh
npm run type-check
npm run lint
npm run test --workspace=apps/web
npm run format:check --workspace=apps/web
npm run build
npm audit --audit-level=high
```

Next.js 16 removed `next lint`, so the web lint script uses the ESLint CLI and
the framework's flat config. The route-line fallback is now derived from the
selected airports while database refinement stays asynchronous. This preserves
immediate route rendering without setting state synchronously inside an effect.

The old Lodash 4.17.21 overrides prevented security updates and are removed.
The test runner, Vite and React plugin are also declared at the workspace root
so their peer imports resolve to the same toolchain. React remains on the
currently supported 18 release line; its next major upgrade is separate.

References: [Next.js migration](https://nextjs.org/docs/app/guides/upgrading/version-16)
and [Vitest migration](https://vitest.dev/guide/migration/).
