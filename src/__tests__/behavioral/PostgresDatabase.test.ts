import { databaseAssertUtil, TestConnect } from '@sprucelabs/data-stores'
import AbstractSpruceTest, {
	test,
	assert,
	errorAssert,
	generateId,
} from '@sprucelabs/test-utils'
import PostgresDatabase from '../../PostgresDatabase'

export default class PostgresDatabaseTest extends AbstractSpruceTest {
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
}

const postgresConnect: TestConnect = async (connectionString?: string) => {
	const db = new PostgresDatabase(
		connectionString ??
			'postgres://postgres:password@localhost:5432/skill-tests'
	)

	await db.connect()

	const badDatabaseName = generateId()
	return {
		db,
		scheme: 'postgres://',
		connectionStringWithRandomBadDatabaseName: `postgres://postgres:password@localhost:5432/${badDatabaseName}`,
		badDatabaseName,
	}
}
