declare module 'pg' {
  export interface QueryResult<Row = Record<string, unknown>> {
    rows: Row[];
  }

  export interface ClientConfig {
    connectionString?: string;
  }

  export class Client {
    constructor(config?: ClientConfig);
    connect(): Promise<void>;
    query<Row = Record<string, unknown>>(text: string, values?: unknown[]): Promise<QueryResult<Row>>;
    end(): Promise<void>;
  }

  const pg: {
    Client: typeof Client;
  };

  export default pg;
}
