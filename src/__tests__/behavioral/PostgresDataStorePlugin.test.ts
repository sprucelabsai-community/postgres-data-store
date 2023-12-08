import {
	DataStorePlugin,
	DataStorePluginWillCreateOneResponse,
	DataStorePluginWillUpdateOneResponse,
} from '@sprucelabs/data-stores'
import { Schema, assertOptions, buildSchema } from '@sprucelabs/schema'
import { AbstractSpruceFixtureTest } from '@sprucelabs/spruce-test-fixtures'
import { test, assert, errorAssert } from '@sprucelabs/test-utils'

export default class PostgresDataStorePluginTest extends AbstractSpruceFixtureTest {
	private static plugin: PostgresDataStorePlugin

	protected static async beforeEach(): Promise<void> {
		await super.beforeEach()
		const schema = carSchema
		this.setSchema(schema)
	}

	@test()
	protected static async throwsWithMissing() {
		//@ts-ignore
		const err = assert.doesThrow(() => new PostgresDataStorePlugin())
		errorAssert.assertError(err, 'MISSING_PARAMETERS', {
			parameters: ['databaseSchema'],
		})
	}

	@test()
	protected static async canCreateWithRequired() {
		assert.isEqual(this.plugin.getName(), 'postgres')
	}

	private static setSchema(schema: Schema) {
		this.plugin = new PostgresDataStorePlugin(schema)
	}
}

class PostgresDataStorePlugin implements DataStorePlugin {
	private schema: Schema
	public constructor(databaseSchema: Schema) {
		assertOptions({ databaseSchema }, ['databaseSchema'])
		this.schema = databaseSchema
	}

	public getName(): string {
		return 'postgres'
	}

	public async willCreateOne(
		values: Record<string, any>
	): Promise<DataStorePluginWillCreateOneResponse> {
		//@ts-ignore
		const fields = Object.keys(this.schema.fields)
		for (const field of fields) {
			//@ts-ignore
			const definition = this.schema.fields[field]
			if (definition.type === 'dateTime') {
				values[field] = new Date(values[field]).toISOString()
			}
		}

		return {
			newValues: {
				...values,
			},
		}
	}

	public async willUpdateOne(
		_query: Record<string, any>,
		updates: Record<string, any>
	): Promise<DataStorePluginWillUpdateOneResponse> {
		return {
			newValues: {
				...updates,
				dateCreated: new Date(updates.dateCreated).toISOString(),
			},
		}
	}
}

const carSchema = buildSchema({
	id: 'car',
	fields: {
		id: {
			type: 'id',
			isRequired: true,
		},
		name: {
			type: 'text',
			isRequired: true,
		},
		dateCreated: {
			type: 'dateTime',
			isRequired: true,
		},
	},
})
