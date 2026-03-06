import cors from "cors";
import express from "express";
import routes from "./api/routes";

export function createServer() {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use(routes);
  return app;
}

export function startServer() {
  const app = createServer();
  const port = Number(process.env.PORT ?? 3001);
  app.listen(port, () => {
    console.log(`Local API running on http://127.0.0.1:${port}`);
  });
}
