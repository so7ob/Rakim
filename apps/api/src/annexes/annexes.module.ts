import { Module } from "@nestjs/common";
import { AnnexesController } from "./annexes.controller.js";
@Module({ controllers: [AnnexesController] })
export class AnnexesModule {}
