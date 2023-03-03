export { default as PostgresDatabase } from './PostgresDatabase'
import { DatabaseFactory } from '@sprucelabs/data-stores'
import PostgresDatabase from './PostgresDatabase'
DatabaseFactory.addAdapter('postgres://', PostgresDatabase)
