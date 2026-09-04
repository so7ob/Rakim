import { Module } from "@nestjs/common";
import { MariaDbSearchProvider } from "./mariadb-search.provider.js";
import { SearchController } from "./search.controller.js";
import { SEARCH_PROVIDER } from "./search.provider.js";

@Module({
  controllers: [SearchController],
  providers: [{ provide: SEARCH_PROVIDER, useClass: MariaDbSearchProvider }],
})
export class SearchModule {}
