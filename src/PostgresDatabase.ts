import {
	Database,
	DataStoresError,
	Index,
	QueryOptions,
	UniqueIndex,
} from '@sprucelabs/data-stores'
import { assertOptions } from '@sprucelabs/schema'
import { Client } from 'pg'
import QueryBuilder from './QueryBuilder'

export default class PostgresDatabase implements Database {
	private connectionString: string
	private client!: Client
	private idCount = 1
	private query: QueryBuilder

	public constructor(connectionString: string) {
		assertOptions({ connectionString }, ['connectionString'])
		this.connectionString = connectionString
		this.query = QueryBuilder.Builder()
	}

	public dropCollection(_name: string): Promise<void> {
		throw new Error('Method not implemented.')
	}

	public generateId(): string {
		return `${this.idCount++}`
	}

	public async update(
		collection: string,
		query: Record<string, any>,
		updates: Record<string, any>
	): Promise<number> {
		const { sql, values } = this.query.update(collection, query, updates, false)

		const results = await this.client.query({
			text: sql,
			values,
		})

		return results.rowCount
	}

	public async count(
		collection: string,
		query?: Record<string, any> | undefined
	): Promise<number> {
		const { sql, values } = this.query.find(collection, query ?? {}, {
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
		const { sql, values } = this.query.update(collection, query, updates)
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
		const { sql, values } = this.query.find(collection, query ?? {}, options)

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
	): Promise<Index[] | UniqueIndex[]> {
		return this.executeGetIndexes(collectionName, false)
	}

	public async findOne(
		collection: string,
		query?: Record<string, any> | undefined,
		options?: QueryOptions | undefined
	): Promise<Record<string, any> | null> {
		const results = await this.find(collection, query, { ...options, limit: 1 })
		return results[0] ?? null
	}

	public async delete(
		collection: string,
		query: Record<string, any>
	): Promise<number> {
		const { sql, values } = this.query.delete(collection, query)
		const results = await this.client.query({
			text: sql,
			values,
		})
		return results.rowCount
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
				await this.client.query(`DROP INDEX ${indexName}`)
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

		let { sql, values } = this.query.delete(collection, query)

		const results = await this.client.query({
			text: sql,
			values,
		})

		return results.rowCount
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
					`TRUNCATE TABLE public.${tableName} RESTART IDENTITY CASCADE`
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

		const { sql, values } = this.query.create(collection, records)
		const { rows } = await this.executeQuery('create', sql, values, collection)

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
			const parsed = this.parseIndexViolatedForFieldsAndValues(err?.detail)

			if (parsed) {
				const { fields, values } = parsed

				throw new DataStoresError({
					code: 'DUPLICATE_RECORD',
					duplicateFields: fields,
					duplicateValues: values,
					collectionName: tableName,
					action,
				})
			}

			throw err
		}
	}

	public async connect(): Promise<void> {
		const client = new Client({
			connectionString: this.connectionString,
		})

		try {
			await client.connect()
		} catch (err: any) {
			const message = err.message as string | undefined

			if (message?.includes('ECONNREFUSED')) {
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

		this.client = client
	}

	public async getUniqueIndexes(
		collectionName: string
	): Promise<UniqueIndex[]> {
		const isUnique = true

		const uniqueIndexes: string[][] = await this.executeGetIndexes(
			collectionName,
			isUnique
		)

		return uniqueIndexes
	}

	private async executeGetIndexes(collectionName: string, isUnique: boolean) {
		const query = `SELECT indexname FROM pg_indexes WHERE tablename = '${collectionName}' AND indexdef ${
			isUnique ? '' : 'NOT'
		} LIKE '%UNIQUE%';`
		const res = await this.client.query(query)
		const uniqueIndexes: string[][] = []

		res.rows.forEach((row) => {
			const indexName = row.indexname.replace(`${collectionName}_`, '')
			const fields = indexName.split('_').slice(0, -1)
			if (fields.length > 0) {
				uniqueIndexes.push(fields)
			}
		})
		return uniqueIndexes
	}

	public async dropIndex(
		collectionName: string,
		fields: UniqueIndex
	): Promise<void> {
		const indexName = this.generateIndexName(collectionName, fields)
		const query = `DROP INDEX ${indexName}`

		try {
			await this.client.query({
				text: query,
			})
		} catch (err: any) {
			throw new DataStoresError({
				code: 'INDEX_NOT_FOUND',
				missingIndex: fields,
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
		indexes: UniqueIndex[]
	): Promise<void> {
		await this.executeSyncIndexes(collectionName, indexes, true)
	}

	private async executeSyncIndexes(
		collectionName: string,
		indexes: UniqueIndex[],
		isUnique: boolean
	) {
		const existingIndexes: string[][] = await this.executeGetIndexes(
			collectionName,
			isUnique
		)

		const indexesToAdd = indexes.filter(
			(index) =>
				!existingIndexes.find((existing) =>
					this.areIndexesEqual(existing, index)
				)
		)

		const indexesToRemove = existingIndexes.filter(
			(existing) =>
				!indexes.find((index) => this.areIndexesEqual(existing, index))
		)

		await Promise.all([
			...indexesToAdd.map(async (index) => {
				try {
					await this.executeCreateIndex(collectionName, index, isUnique)
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
			...indexesToRemove.map((index) => this.dropIndex(collectionName, index)),
		])
	}

	private areIndexesEqual(existing: UniqueIndex, index: UniqueIndex): unknown {
		return (
			this.generateIndexName('any', existing) ===
			this.generateIndexName('any', index)
		)
	}

	public async createUniqueIndex(
		collection: string,
		fields: UniqueIndex
	): Promise<void> {
		const isUnique = true
		await this.executeCreateIndex(collection, fields, isUnique)
	}

	private async executeCreateIndex(
		collection: string,
		fields: UniqueIndex,
		isUnique: boolean
	) {
		const indexName = this.generateIndexName(collection, fields)
		const keys = this.generateKeyExpressions(fields)

		const query = `CREATE ${
			isUnique ? `UNIQUE` : ''
		} INDEX ${indexName} ON public.${collection} (${keys})`

		try {
			await this.client.query({
				text: query,
			})
		} catch (err: any) {
			if (err.message?.includes?.('already exists')) {
				throw new DataStoresError({
					code: 'INDEX_EXISTS',
					collectionName: collection,
					index: ['uniqueField'],
				})
			}

			throw err
		}
	}

	private generateKeyExpressions(fields: UniqueIndex) {
		return fields.map((f) => this.generateKeyExpression(f)).join(', ')
	}

	private generateKeyExpression(field: string) {
		if (field.includes('.')) {
			const parts = field.split('.')
			return `(${parts[0]}->>'${parts[1]}')`
		}
		return field
	}

	private generateIndexName(collection: string, fields: UniqueIndex) {
		return `${collection}_${fields
			.map((f) => f.toLowerCase())
			.join('_')}${'_index'}`.replace(/\./g, '_')
	}

	public async close(): Promise<void> {
		await this.client.end()
	}

	public isConnected(): boolean {
		//@ts-ignore
		return this.client._connected && !this.client._ending
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
}
