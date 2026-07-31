import { Module } from '@nestjs/common';

import { DbRepository } from './db.repository';

/**
 * Hạ tầng dùng chung: connection tới datasource.
 *
 * Không thuộc feature nào cả — `health`, `products`, `orders`... đều import
 * module này. `exports` là thứ quyết định ranh giới: chỉ `DbRepository` được
 * nhìn thấy từ bên ngoài, mọi provider khác thêm vào đây sau này (connection
 * pool, migration runner...) vẫn ở trong.
 */
@Module({
  providers: [DbRepository],
  exports: [DbRepository],
})
export class DatabaseModule {}
