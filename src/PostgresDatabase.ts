import { randomUUID } from 'crypto'
import {
    Database,
    DataStoresError,
    Index,
    IndexWithFilter,
    normalizeIndex,
    pluckMissingIndexes,
    QueryOptions,
} from '@sprucelabs/data-stores'
import { assertOptions } from '@sprucelabs/schema'
import { Client } from 'pg'
import { generateIndexName } from './indexUtils'
import QueryBuilder from './QueryBuilder'

export default class PostgresDatabase implements Database {
    private connectionString: string
    protected client!: Client
    private idCount = 1
    private queries: QueryBuilder

    public constructor(connectionString: string) {
        assertOptions({ connectionString }, ['connectionString'])
        this.connectionString = connectionString
        this.queries = QueryBuilder.Builder()
    }

    public dropCollection(_name: string): Promise<void> {
        throw new Error('Method not implemented.')
    }

    public generateId(): string {
        return process.env.POSTGRES_ID_FORMAT === 'uuid'
            ? randomUUID()
            : `${this.idCount++}`
    }

    public async update(
        collection: string,
        query: Record<string, any>,
        updates: Record<string, any>
    ): Promise<number> {
        const { sql, values } = this.queries.update(
            collection,
            query,
            updates,
            false
        )

        const results = await this.client.query({
            text: sql,
            values,
        })

        return results.rowCount ?? 0
    }

    public async count(
        collection: string,
        query?: Record<string, any> | undefined
    ): Promise<number> {
        const { sql, values } = this.queries.find(collection, query ?? {}, {
            includeFields: ['count(*) as count'],
        })

        const results = await this.client.query({
            text: sql,
            values,
        })

        return parseInt(results.rows[0].count)
    }

    public async updateOne(
        collection: string,
        query: Record<string, any>,
        updates: Record<string, any>
    ): Promise<Record<string, any>> {
        const action = 'updateOne'

        const record = await this.executeUpdateAndThrowIfNoResults(
            collection,
            query,
            updates,
            action
        )

        return record
    }

    private async executeUpdateAndThrowIfNoResults(
        collection: string,
        query: Record<string, any>,
        updates: Record<string, any>,
        action: string
    ) {
        const { sql, values } = this.queries.update(collection, query, updates)
        const results = await this.executeQuery(action, sql, values, collection)

        if (results.rowCount === 0) {
            throw new DataStoresError({
                code: 'RECORD_NOT_FOUND',
                storeName: collection,
                query,
            })
        }

        const record = results.rows[0]
        return record
    }

    public async find(
        collection: string,
        query?: Record<string, any> | undefined,
        options?: QueryOptions | undefined
    ): Promise<Record<string, any>[]> {
        const { sql, values } = this.queries.find(
            collection,
            query ?? {},
            options
        )

        const results = await this.client.query({
            text: sql,
            values,
        })
        return results.rows
    }

    public async createIndex(collection: string, fields: Index): Promise<void> {
        return this.executeCreateIndex(collection, fields, false)
    }

    public async getIndexes(
        collectionName: string
    ): Promise<IndexWithFilter[]> {
        return this.executeGetIndexes(collectionName, false)
    }

    public async findOne(
        collection: string,
        query?: Record<string, any> | undefined,
        options?: QueryOptions | undefined
    ): Promise<Record<string, any> | null> {
        const results = await this.find(collection, query, {
            ...options,
            limit: 1,
        })
        return results[0] ?? null
    }

    public async delete(
        collection: string,
        query: Record<string, any>
    ): Promise<number> {
        const { sql, values } = this.queries.delete(collection, query)
        const results = await this.client.query({
            text: sql,
            values,
        })
        return results.rowCount ?? 0
    }

    public async dropDatabase(): Promise<void> {
        await this.truncateTables()
        const names = await this.getTables()

        for (const name of names) {
            await this.dropAllNonPrimaryKeyIndexes(name)
        }
    }

    private async dropAllNonPrimaryKeyIndexes(name: any) {
        const indexNames = await this.getIndexNames(name)

        for (const indexName of indexNames) {
            try {
                await this.client.query(`DROP INDEX "${indexName}"`)
            } catch (err: any) {
                console.info('Failed to drop index', indexName, err.stack)
            }
        }
    }

    private async getIndexNames(name: any) {
        const sql = `SELECT indexname FROM pg_indexes WHERE tablename = '${name}' AND indexname != '${name}_pk';`
        const results = await this.client.query(sql)
        const indexNames = results.rows.map((row) => row.indexname)
        return indexNames
    }

    private async getTables() {
        const sql = `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';`
        const results = await this.client.query(sql)
        const names = results.rows.map((row) => row.table_name)
        return names
    }

    public async upsertOne(
        collection: string,
        query: Record<string, any>,
        updates: Record<string, any>
    ): Promise<Record<string, any>> {
        const [match] = await this.find(collection, query, { limit: 1 })
        if (match) {
            return this.executeUpdateAndThrowIfNoResults(
                collection,
                { id: match.id },
                updates,
                'upsertOne'
            )
        } else {
            return this.createOne(collection, updates)
        }
    }

    public async deleteOne(
        collection: string,
        query: Record<string, any>
    ): Promise<number> {
        if (!query.id) {
            const match = await this.findOne(collection, query, {
                includeFields: ['id'],
            })

            query = { id: match?.id }
        }

        let { sql, values } = this.queries.delete(collection, query)

        const results = await this.client.query({
            text: sql,
            values,
        })

        return results.rowCount ?? 0
    }

    private async truncateTables() {
        const res = await this.client.query(`
			SELECT table_name 
			FROM information_schema.tables 
			WHERE table_schema = 'public' 
			AND table_type = 'BASE TABLE';
		  `)

        const tableNames = res.rows.map((row) => row.table_name)

        await Promise.all(
            tableNames.map((tableName) =>
                this.client.query(
                    `TRUNCATE TABLE "${tableName}" RESTART IDENTITY CASCADE`
                )
            )
        )
    }

    public async createOne(
        collection: string,
        values: Record<string, any>
    ): Promise<Record<string, any>> {
        const rows = await this.create(collection, [values])
        return rows[0]
    }

    public async create(
        collection: string,
        records: Record<string, any>[]
    ): Promise<Record<string, any>[]> {
        if (records.length === 0) {
            return []
        }

        const { sql, values } = this.queries.create(collection, records)
        const { rows } = await this.executeQuery(
            'create',
            sql,
            values,
            collection
        )

        return rows
    }

    private async executeQuery(
        action: string,
        sql: string,
        values: unknown[],
        tableName: string
    ) {
        try {
            const results = await this.client.query({
                text: sql,
                values,
            })
            return results
        } catch (err: any) {
            const parsed = this.parseIndexViolatedForFieldsAndValues(
                err?.detail
            )

            if (parsed) {
                const { fields, values } = parsed

                throw new DataStoresError({
                    code: 'DUPLICATE_RECORD',
                    duplicateFields: fields.map((f) => f.replace(/"/g, '')),
                    duplicateValues: values,
                    collectionName: tableName,
                    action,
                })
            }

            throw err
        }
    }

    public async connect(): Promise<void> {
        this.client = new Client({
            connectionString: this.connectionString,
        })

        try {
            await this.client.connect()
        } catch (err: any) {
            const message = err.message as string | undefined

            if ((err.code ?? message)?.includes('ECONNREFUSED')) {
                throw new DataStoresError({
                    code: 'UNABLE_TO_CONNECT_TO_DB',
                    originalError: err,
                })
            }

            if (message?.includes('does not exist')) {
                const match = message.match(/"([^"]*)"/) ?? ['', '']
                throw new DataStoresError({
                    code: 'INVALID_DATABASE_NAME',
                    suppliedName: match[1],
                    originalError: err,
                })
            }

            throw new DataStoresError({
                code: 'INVALID_DB_CONNECTION_STRING',
                originalError: err,
            })
        }
    }

    public async getUniqueIndexes(
        collectionName: string
    ): Promise<IndexWithFilter[]> {
        const isUnique = true

        const uniqueIndexes = await this.executeGetIndexes(
            collectionName,
            isUnique
        )

        return uniqueIndexes
    }

    private async executeGetIndexes(
        collectionName: string,
        isUnique: boolean
    ): Promise<IndexWithFilter[]> {
        const query = `SELECT * FROM pg_indexes WHERE tablename = '${collectionName}' AND indexdef ${
            isUnique ? '' : 'NOT'
        } LIKE '%UNIQUE%';`
        const res = await this.client.query(query)
        const uniqueIndexes: IndexWithFilter[] = []

        res.rows.forEach((row) => {
            const indexName = row.indexname.replace(`${collectionName}_`, '')
            const fields = indexName.split('_').slice(0, -1) as string[]
            if (fields.length > 0) {
                uniqueIndexes.push({ fields })
            }
        })

        return uniqueIndexes
    }

    public async dropIndex(
        collectionName: string,
        index: Index
    ): Promise<void> {
        const indexName = this.generateIndexName(collectionName, index)
        const query = `DROP INDEX "${indexName}"`

        try {
            await this.client.query({
                text: query,
            })
        } catch (err: any) {
            throw new DataStoresError({
                code: 'INDEX_NOT_FOUND',
                missingIndex: normalizeIndex(index).fields,
                collectionName,
            })
        }
    }

    public async syncIndexes(
        collectionName: string,
        indexes: Index[]
    ): Promise<void> {
        await this.executeSyncIndexes(collectionName, indexes, false)
    }

    public async syncUniqueIndexes(
        collectionName: string,
        indexes: Index[]
    ): Promise<void> {
        await this.executeSyncIndexes(collectionName, indexes, true)
    }

    private async executeSyncIndexes(
        collectionName: string,
        indexes: Index[],
        isUnique: boolean
    ) {
        const existingIndexes = await this.executeGetIndexes(
            collectionName,
            isUnique
        )

        const indexesToAdd = pluckMissingIndexes(indexes, existingIndexes)
        const indexesToRemove = pluckMissingIndexes(existingIndexes, indexes)

        await Promise.all(
            indexesToRemove.map((index) =>
                this.dropIndex(collectionName, index)
            )
        )

        await Promise.all([
            ...indexesToAdd.map(async (index) => {
                try {
                    await this.executeCreateIndex(
                        collectionName,
                        index,
                        isUnique
                    )
                } catch (err: any) {
                    if (err.options?.code !== 'INDEX_EXISTS') {
                        throw new DataStoresError({
                            code: 'DUPLICATE_KEY',
                            originalError: err,
                        })
                    }
                }
                return null
            }),
        ])
    }

    public async createUniqueIndex(
        collection: string,
        fields: Index
    ): Promise<void> {
        await this.executeCreateIndex(collection, fields, true)
    }

    private async executeCreateIndex(
        collection: string,
        index: Index,
        isUnique: boolean
    ) {
        const { sql: query } = this.queries.createIndex(
            collection,
            index,
            isUnique
        )

        try {
            await this.client.query({
                text: query,
            })
        } catch (err: any) {
            if (err.message?.includes?.('already exists')) {
                throw new DataStoresError({
                    code: 'INDEX_EXISTS',
                    collectionName: collection,
                    index: normalizeIndex(index).fields,
                })
            }

            throw err
        }
    }

    private generateIndexName(collection: string, index: Index) {
        return generateIndexName(collection, index)
    }

    public async close(): Promise<void> {
        await this.client.end()
    }

    public isConnected(): boolean {
        return this.client
            ? //@ts-ignore
              this.client._connected && !this.client._ending
            : false
    }

    private parseIndexViolatedForFieldsAndValues(input?: string) {
        const regex = /Key \((.*)\)=\((.*)\) already exists\./
        const matches = input?.match(regex)

        if (!matches) {
            return null
        }

        const fieldsStr = matches[1]
        const valuesStr = matches[2]

        const fields = fieldsStr.split(', ')
        const values = valuesStr.split(', ')

        const fixedFields = fields.map((field) =>
            field
                .replace(/ ->> /g, '.')
                .split('::')[0]
                .replace('(', '')
                .replace(/'/g, '')
        )

        const result = { fields: fixedFields, values }

        return result
    }

    public async query<T>(query: string, params?: any[]): Promise<T> {
        const results = await this.client.query({
            text: query,
            values: params,
        })

        return (results?.rows as T) ?? ([] as T)
    }
}
