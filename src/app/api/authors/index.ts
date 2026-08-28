import { createElysia } from "@/utils/elysia";
import { authorsService } from "./authors.service";

export const authorsRoutes = createElysia().group("/authors", (app) =>
  app.get("/week", () => authorsService.getTopAuthorOfWeek(), {
    detail: { tags: ["Authors"] },
  }),
);
