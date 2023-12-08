import { QueryOptions } from '@sprucelabs/data-stores'
import AbstractSpruceTest, {
	test,
	assert,
	generateId,
} from '@sprucelabs/test-utils'
import { Query } from '../../postgres.types'
import QueryBuilder, { BuiltQuery } from '../../QueryBuilder'

export default class QueryBuilderTest extends AbstractSpruceTest {
	private static query: QueryBuilder
	private static tableName: string

	protected static async beforeEach(): Promise<void> {
		await super.beforeEach()
		process.env.POSTGRES_SHOULD_QUOTE_FIELD_NAMES = 'true'
		this.query = QueryBuilder.Builder()
		this.tableName = 'users'
	}

	@test()
	protected static async canBuildSimpleFindQuery() {
		this.assertSimpleQueryHonorsTableName('users')
		this.assertSimpleQueryHonorsTableName('tacos')
	}

	@test()
	protected static async findQueryHonorsFields() {
		this.assertFindSqlEquals(`SELECT "id", "name" FROM "users"`, {
			includeFields: ['id', 'name'],
		})
		this.assertFindSqlEquals(`SELECT "firstName", "lastName" FROM "users"`, {
			includeFields: ['firstName', 'lastName'],
		})
	}

	@test()
	protected static async findHonorsLimit() {
		this.assertFindSqlEquals(`SELECT * FROM "users" LIMIT 10`, {
			limit: 10,
		})
		this.assertFindSqlEquals(`SELECT * FROM "users" LIMIT 0`, {
			limit: 0,
		})
	}

	@test()
	protected static async findHonorsSkip() {
		this.assertFindSqlEquals(`SELECT * FROM "users" OFFSET 10`, {
			skip: 10,
		})

		this.assertFindSqlEquals(`SELECT * FROM "users" OFFSET 0`, {
			skip: 0,
		})
	}

	@test('find honors single asc sort on firstName', 'firstName', 'asc')
	@test('find honors single desc sort on firstName', 'firstName', 'desc')
	@test('find honors single asc sort on lastName', 'lastName', 'asc')
	protected static async findHonorsSingleAscSort(
		field: string,
		direction: 'asc' | 'desc'
	) {
		this.assertFindSqlEquals(
			`SELECT * FROM "users" ORDER BY "${field}" ${direction.toUpperCase()}`,
			{
				sort: [{ direction, field }],
			}
		)
	}

	@test()
	protected static async findHandlesMultipleSorts() {
		this.assertFindSqlEquals(
			`SELECT * FROM "users" ORDER BY "firstName" ASC, "lastName" DESC`,
			{
				sort: [
					{ direction: 'asc', field: 'firstName' },
					{ direction: 'desc', field: 'lastName' },
				],
			}
		)
	}

	@test()
	protected static async canBuildSimpleWhere() {
		this.assertFindWithQueryEquals({
			query: { firstName: 'Joe' },
			where: '"firstName" = $1',
			expectedValues: ['Joe'],
		})

		this.assertFindWithQueryEquals({
			query: { lastName: 'Joe' },
			where: '"lastName" = $1',
			expectedValues: ['Joe'],
		})

		this.assertFindWithQueryEquals({
			query: { lastName: 'Doe', firstName: 'Joe' },
			where: '"lastName" = $1 AND "firstName" = $2',
			expectedValues: ['Doe', 'Joe'],
		})
	}

	@test()
	protected static async canBuildMoreComplexWhere() {
		this.assertFindWithQueryEquals({
			query: { $or: [{ firstName: 'test' }, { lastName: 'cheeze' }] },
			where: '("firstName" = $1 OR "lastName" = $2)',
			expectedValues: ['test', 'cheeze'],
		})
	}

	@test()
	protected static canHandleWhereAndOrderWithFind() {
		this.assertFindEquals({
			expectedSql: `SELECT * FROM "users" WHERE "firstName" = $1 ORDER BY "firstName" ASC`,
			expectedValues: ['Joe'],
			query: {
				firstName: 'Joe',
			},
			options: {
				sort: [{ direction: 'asc', field: 'firstName' }],
			},
		})
	}

	@test()
	protected static canMakeSimpleUpdate() {
		this.tableName = generateId()
		this.assertUpdateEquals({
			updates: {
				firstName: 'test',
			},
			expected: {
				sql: `UPDATE "${this.tableName}" SET "firstName" = $1 RETURNING *`,
				values: ['test'],
			},
		})
	}

	@test()
	protected static canMakeUpdateWithWhere() {
		this.assertUpdateEquals({
			query: {
				id: '123',
			},
			updates: {
				firstName: 'test',
			},
			expected: {
				sql: `UPDATE "users" SET "firstName" = $1 WHERE "id" = $2 RETURNING *`,
				values: ['test', '123'],
			},
		})
	}

	@test()
	protected static async canUpdateWithMultipleFields() {
		this.assertUpdateEquals({
			updates: {
				firstName: 'test',
				lastName: 'cheeze',
			},
			expected: {
				sql: `UPDATE "users" SET "firstName" = $1, "lastName" = $2 RETURNING *`,
				values: ['test', 'cheeze'],
			},
		})
	}

	@test()
	protected static async canUpdateWithNull() {
		this.assertUpdateEquals({
			updates: {
				lastName: null,
			},
			expected: {
				sql: `UPDATE "users" SET "lastName" = $1 RETURNING *`,
				values: [null],
			},
		})
	}

	@test()
	protected static async canUpdateWithMultipleFieldsAndWhere() {
		this.assertUpdateEquals({
			query: {
				id: '123',
			},
			updates: {
				firstName: 'test',
				lastName: 'cheeze',
			},
			expected: {
				sql: `UPDATE "users" SET "firstName" = $1, "lastName" = $2 WHERE "id" = $3 RETURNING *`,
				values: ['test', 'cheeze', '123'],
			},
		})
	}

	@test()
	protected static async canUpdateByPushingElementOntoAnArray() {
		this.assertUpdateEquals({
			query: {
				id: '123',
			},
			updates: {
				$push: { names: 'hey' },
			},
			expected: {
				sql: `UPDATE "users" SET "names" = JSONB_SET(COALESCE(names || $1::JSONB, '[]'::JSONB), '{-1}', $1::JSONB) WHERE "id" = $2 RETURNING *`,
				values: [JSON.stringify('hey'), '123'],
			},
		})
	}

	@test()
	protected static async canPushManyFieldsAtOnce() {
		this.assertUpdateEquals({
			updates: {
				$push: { names: 'what', things: 'hey' },
			},
			expected: {
				sql: `UPDATE "users" SET "names" = JSONB_SET(COALESCE(names || $1::JSONB, '[]'::JSONB), '{-1}', $1::JSONB), "things" = JSONB_SET(COALESCE(names || $2::JSONB, '[]'::JSONB), '{-1}', $2::JSONB) RETURNING *`,
				values: [JSON.stringify('what'), JSON.stringify('hey')],
			},
		})
	}

	@test('can create single field record 1', 'firstName')
	@test('can create single field record 2', 'lastName')
	protected static async createReturnsSingleValueAndSimpleQuery(
		fieldName: string
	) {
		this.tableName = generateId()
		const value = generateId()
		this.assertCreateSqlEquals([{ [fieldName]: value }], {
			sql: `INSERT INTO "${this.tableName}" ("${fieldName}") VALUES ($1) RETURNING *`,
			values: [value],
		})
	}

	@test()
	protected static canCreateWithMultipleFieldsInSingleRecord() {
		this.assertCreateSqlEquals([{ firstName: 'Joe', lastName: 'Smith' }], {
			sql: `INSERT INTO "users" ("firstName", "lastName") VALUES ($1, $2) RETURNING *`,
			values: ['Joe', 'Smith'],
		})
	}

	@test()
	protected static async canCreateTwoSingleFieldRecords() {
		this.assertCreateSqlEquals([{ firstName: 'Joe' }, { firstName: 'Jane' }], {
			sql: `INSERT INTO "users" ("firstName") VALUES ($1), ($2) RETURNING *`,
			values: ['Joe', 'Jane'],
		})
	}

	@test()
	protected static canCreateTwoWithRecordsMutuallyExlusiveFields() {
		this.assertCreateSqlEquals(
			[{ firstName: 'Joe' }, { firstName: 'Jane', lastName: 'Smith' }],
			{
				sql: `INSERT INTO "users" ("firstName", "lastName") VALUES ($1, $2), ($3, $4) RETURNING *`,
				values: ['Joe', null, 'Jane', 'Smith'],
			}
		)
	}

	@test()
	protected static async canInsertRecordWithArrayField() {
		this.assertCreateSqlEquals([{ firstName: 'Joe', names: ['a', 'b'] }], {
			sql: `INSERT INTO "users" ("firstName", "names") VALUES ($1, $2::json) RETURNING *`,
			values: ['Joe', '{"a","b"}'],
		})
	}

	@test()
	protected static async canDeleteSingleRecord() {
		this.assertDeleteSqlEquals({
			expected: {
				sql: `DELETE FROM "users" WHERE "id" = $1`,
				values: ['123'],
			},
			query: {
				id: '123',
			},
		})

		this.tableName = 'test'

		this.assertDeleteSqlEquals({
			expected: {
				sql: `DELETE FROM "test" WHERE "name" = $1 AND "dink" = $2`,
				values: ['whatever', 'donk'],
			},
			query: {
				name: 'whatever',
				dink: 'donk',
			},
		})
	}

	@test.skip(
		'Could never get this to actually uspert, only insert, so upsert on the Postgres adapture does a find and then an update if it exists.'
	)
	protected static async canUpsertSingleRecord() {
		this.assertUpsertEquals({
			updates: {
				name: 'taco',
			},
			query: {
				id: '1234',
			},
			expected: {
				sql: `INSERT INTO "users" ("name", "id") VALUES ($1, $2) ON CONFLICT ("id") WHERE "id" = $3 DO UPDATE SET "name" = EXCLUDED.name RETURNING *`,
				values: ['taco', '1234', '1234'],
			},
		})

		this.tableName = 'oy'

		this.assertUpsertEquals({
			updates: {
				hello: 'world',
				taco: 'tuesday',
			},
			query: {
				name: 'hey',
				boat: 'go',
			},
			expected: {
				sql: `INSERT INTO oy ("hello", "taco", "name", "boat") VALUES ($1, $2, $3, $4) ON CONFLICT (name, boat) WHERE name = $5 AND boat = $6 DO UPDATE SET hello = EXCLUDED.hello, taco = EXCLUDED.taco RETURNING *`,
				values: ['world', 'tuesday', 'hey', 'go', 'hey', 'go'],
			},
		})
	}

	private static assertUpsertEquals(options: {
		query: Query
		updates: Record<string, any>
		expected: { sql: string; values: any[] }
	}) {
		const { query, updates, expected } = options
		const { sql: expectedSql, values: expectedValues } = expected
		const { sql, values } = this.query.upsert(this.tableName, query, updates)
		assert.isEqual(sql, expectedSql)
		assert.isEqualDeep(values, expectedValues)
	}

	private static assertDeleteSqlEquals(options: {
		expected: { sql: string; values: any[] }
		query?: Query
	}) {
		const { expected, query } = options
		const { sql: expectedSql, values: expectedValues } = expected
		const { sql, values } = this.query.delete(this.tableName, query)

		assert.isEqual(sql, expectedSql)
		assert.isEqualDeep(values, expectedValues)
	}

	private static assertUpdateEquals(options: {
		query?: Query
		updates: Record<string, any>
		expected: { sql: string; values: (string | null)[] }
	}) {
		const {
			query,
			updates,
			expected: { sql: expectedSql, values: expectedValues },
		} = options

		const { sql, values } = this.query.update(
			this.tableName,
			query ?? {},
			updates
		)
		assert.isEqual(sql, expectedSql)
		assert.isEqualDeep(values, expectedValues)
	}

	private static assertFindWithQueryEquals(options: {
		query: Record<string, any>
		where: string
		expectedValues: string[]
	}) {
		const { query, where, expectedValues } = options
		const expectedSql = `SELECT * FROM "users" WHERE ${where}`

		this.assertFindEquals({ query, expectedSql, expectedValues })
	}

	private static assertFindEquals(options: {
		query: Record<string, any>
		expectedSql: string
		expectedValues: string[]
		options?: QueryOptions
	}) {
		const { query, expectedSql, expectedValues, options: findOptions } = options

		const { sql, values } = this.find(query, findOptions)

		assert.isEqual(sql, expectedSql)
		assert.isEqualDeep(values, expectedValues)
	}

	private static assertCreateSqlEquals(
		records: Record<string, any>[],
		expected: BuiltQuery
	) {
		const results = this.create(records)
		assert.isEqualDeep(results, expected)
	}

	public static create(records: Record<string, any>[]) {
		return this.query.create(this.tableName, records)
	}

	private static assertSimpleQueryHonorsTableName(tableName: string) {
		this.tableName = tableName
		const expected = `SELECT * FROM "${tableName}"`
		this.assertFindSqlEquals(expected)
	}

	private static assertFindSqlEquals(
		expected: string,
		options?: QueryOptions & { query?: Record<string, any> }
	) {
		const { query, ...rest } = options ?? {}
		const { sql: actual, values } = this.find(query, rest)
		assert.isEqual(actual, expected)
		assert.isLength(values, 0)
	}

	private static find(query?: Record<string, any>, options?: QueryOptions) {
		return this.query.find(this.tableName, query ?? {}, options)
	}
}
