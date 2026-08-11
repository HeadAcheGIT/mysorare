if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set. Integration tests need a disposable Postgres — " +
      'e.g. `docker run -d -e POSTGRES_PASSWORD=test -e POSTGRES_DB=sorare_test -p 55432:5432 postgres:16-alpine`, ' +
      'then `DATABASE_URL=postgresql://postgres:test@localhost:55432/sorare_test npx prisma migrate deploy` ' +
      "before running `npm run test:integration`."
  );
}
