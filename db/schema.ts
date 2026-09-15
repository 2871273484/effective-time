import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core';
export const sessions = sqliteTable('sessions', {
 id: text('id').primaryKey(), started: integer('started').notNull(), ended: integer('ended'), active: integer('active'),
}, t => [uniqueIndex('one_active_session').on(t.active).where(sql`${t.active} = 1`)]);
