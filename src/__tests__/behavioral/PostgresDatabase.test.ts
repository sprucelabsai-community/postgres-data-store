import {
	Database,
	databaseAssertUtil,
	TestConnect,
} from '@sprucelabs/data-stores'
import AbstractSpruceTest, {
	test,
	assert,
	errorAssert,
	generateId,
} from '@sprucelabs/test-utils'
import { QueryConfig } from 'pg'
import PostgresDatabase from '../../PostgresDatabase'

let ConnectClass: undefined | (new (connectionString: string) => Database)

export default class PostgresDatabaseTest extends AbstractSpruceTest {
	protected static async beforeEach() {
		await super.beforeEach()
		ConnectClass = undefined
	}

	@test()
	protected static async throwsWhenMissingRequired() {
		//@ts-ignore
		const err = assert.doesThrow(() => new PostgresDatabase())
		errorAssert.assertError(err, 'MISSING_PARAMETERS', {
			parameters: ['connectionString'],
		})
	}

	@test()
	protected static async runsSuiteOfDatabaseTests() {
		await databaseAssertUtil.runSuite(postgresConnect)
	}

	@test()
	protected static async runsSuiteOfDatabaseTestsWithTableNameUser() {
		databaseAssertUtil.collectionName = 'user'
		await databaseAssertUtil.runSuite(postgresConnect)
	}

	@test()
	protected static async canRunRawQuery() {
		const spy = await this.connectWithSpy()

		let passedOptions: QueryConfig | undefined

		//@ts-ignore
		spy.getClient().query = async (options: QueryConfig) => {
			passedOptions = options
			return {} as any
		}

		const query = generateId()
		await spy.query(query)

		assert.isEqual(passedOptions?.text, query)
	}

	@test()
	protected static async retunsResultsFromRawQuery() {
		const db = await this.connect()

		//TODO need a truncate or something else here
		await db.dropDatabase()

		const created = await db.createOne('user', {
			name: 'test',
		})

		const results = await db.query('SELECT * FROM public.user')

		assert.isEqualDeep(results.rows, [created])
	}

	@test()
	protected static async showsAsNotConnectedBeforeConnected() {
		const db = new PostgresDatabase('postgres://localhost:5432/skill-tests')
		assert.isFalse(db.isConnected())
	}

	@test()
	protected static async generatesIdAsUuidIfSet() {
		const db = await this.connect()

		assert.isEqual(db.generateId(), '1')
		assert.isEqual(db.generateId(), '2')

		process.env.POSTGRES_ID_FORMAT = 'uuid'

		assert.isTrue(isUUIDv4(db.generateId()))
		assert.isTrue(isUUIDv4(db.generateId()))
		assert.isTrue(isUUIDv4(db.generateId()))
	}

	private static async connect() {
		const { db: dbr } = await postgresConnect()
		const db = dbr as PostgresDatabase
		return db
	}

	private static async connectWithSpy() {
		this.dropInSpy()
		const { db } = await postgresConnect()
		const spy = db as SpyPostgresDatabase
		return spy
	}

	private static dropInSpy() {
		ConnectClass = SpyPostgresDatabase
	}
}

class SpyPostgresDatabase extends PostgresDatabase {
	public getClient() {
		return this.client
	}
}

const postgresConnect: TestConnect = async (
	connectionString?: string,
	_dbName?: string
) => {
	const connect =
		connectionString ??
		'postgres://postgres:password@localhost:5432/skill-tests'

	const db = ConnectClass
		? new ConnectClass(connect)
		: new PostgresDatabase(connect)

	await db.connect()

	const badDatabaseName = generateId()
	return {
		db,
		scheme: 'postgres://',
		connectionStringWithRandomBadDatabaseName: `postgres://postgres:password@localhost:5432/${badDatabaseName}`,
		badDatabaseName,
	}
}

function isUUIDv4(input: string): boolean {
	const uuidv4Regex =
		/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/
	return uuidv4Regex.test(input)
}
