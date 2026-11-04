/** O pacote `pg` não traz tipos e o projeto não tem @types/pg: só o que os testes usam. */
declare module "pg" {
  export class Client {
    constructor(config: { host: string; port: number; user: string; password: string; database: string });
    connect(): Promise<void>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    query(texto: string, valores?: unknown[]): Promise<{ rows: any[] }>;
    end(): Promise<void>;
  }
  const pg: { Client: typeof Client };
  export default pg;
}
