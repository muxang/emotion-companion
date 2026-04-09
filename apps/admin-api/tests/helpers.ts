import type { Pool, QueryResult, QueryResultRow } from 'pg';

type QueryHandler = (text: string, params?: unknown[]) => QueryResult<QueryResultRow>;

/**
 * 创建 mock pool，query 方法由调用者通过 onQuery 控制。
 * 默认返回空行。
 */
export function createMockPool(onQuery?: QueryHandler): Pool {
  const defaultHandler: QueryHandler = () => ({
    rows: [],
    command: 'SELECT',
    rowCount: 0,
    oid: 0,
    fields: [],
  });

  return {
    query: onQuery ?? defaultHandler,
    end: async () => {},
    on: () => {},
  } as unknown as Pool;
}

/**
 * 返回固定 rows 的简易 QueryResult。
 */
export function qr<T extends QueryResultRow>(rows: T[]): QueryResult<T> {
  return {
    rows,
    command: 'SELECT',
    rowCount: rows.length,
    oid: 0,
    fields: [],
  };
}
